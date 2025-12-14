import asyncio
import time
from collections.abc import Callable
from dataclasses import dataclass
from multiprocessing import Process
from multiprocessing.shared_memory import SharedMemory
from multiprocessing.synchronize import Event as EventType

import zmq.asyncio

from src.lib.rocks_db_log import RocksdbLog
from src.lib.worker import ring_buffer
from src.lib.zeromq_subscriber import consume_order_books_consistently

from ..messages import Platform, WindowKeyParts, WindowKind, pack_window_key
from .messages import OrderBook, OrderBookAccumulator, ob_acc_encoder, order_decoder
from .order_book_accumulator import OrderBookManager, ob_acc_close, ob_acc_reset, ob_acc_update_tick

EmitWindow = Callable[[str, int, tuple[int, bytes] | None], None]
IsStopped = Callable[[], bool]


def run(
    shm_data_name: str,
    shm_index_name: str,
    rocksdb_path: str,
    platform_str: str,
    symbols: list[str],
    window_sizes_ms: list[int],
    checkpoint_ms: dict[str, int | None],
    shutdown_event: EventType | None = None,
):
    shm_data, shm_index, size, mask = ring_buffer.init(
        shm_data_name=shm_data_name, shm_index_name=shm_index_name
    )
    data_buf = shm_data.buf
    index_buf = shm_index.buf
    if data_buf is None or index_buf is None:
        raise RuntimeError("Shared buffer does not exist")

    platform = Platform[platform_str]

    symbols_str = "_".join(sorted(symbols))
    window_sizes_str = "_".join(map(str, sorted(window_sizes_ms)))
    worker_id = f"{platform_str}-order-{symbols_str}-{window_sizes_str}"

    storages: dict[str, RocksdbLog] = {}
    window_handlers: dict[str, list[WindowHandler]] = {}

    for symbol in symbols:
        storage = RocksdbLog(base_dir=rocksdb_path, db_name=symbol, writable=False)
        storage.init()
        storages[symbol] = storage
        window_handlers[symbol] = [
            WindowHandler(window_size_ms=window_size_ms) for window_size_ms in window_sizes_ms
        ]

    def is_stopped() -> bool:
        return shutdown_event is not None and shutdown_event.is_set()

    count = 0

    def emit_window(symbol: str, window_size_ms: int, win: tuple[int, bytes] | None):
        nonlocal count
        if win is None:
            return

        count = count + 1
        written = False

        while not written and not is_stopped():
            written = ring_buffer.write(
                data_buf=data_buf,
                index_buf=index_buf,
                mask=mask,
                key=pack_window_key(
                    WindowKeyParts(
                        window_end_ms=win[0],
                        symbol=symbol,
                        kind=WindowKind.order,
                        window_size_ms=window_size_ms,
                        platform=platform,
                    )
                ),
                value=win[1],
            )
            if written is False:
                time.sleep(0.01)

        if count % 10000 == 0:
            print(f"[worker {worker_id}] write window {count}")

    async def run_all_from_socket():
        zmq_context = zmq.asyncio.Context()
        tasks = [
            run_from_socket(
                platform=platform_str,
                symbol=symbol,
                storage=storages[symbol],
                window_handlers=window_handlers[symbol],
                emit_window=lambda s, ws, win, sym=symbol: emit_window(sym, ws, win),
                is_stopped=is_stopped,
                checkpoint_ms=checkpoint_ms.get(symbol),
                worker_id=worker_id,
                zmq_context=zmq_context,
            )
            for symbol in symbols
        ]
        try:
            await asyncio.gather(*tasks)
        finally:
            zmq_context.term()

    try:
        for symbol in symbols:
            if is_stopped():
                break
            run_from_storage(
                storage=storages[symbol],
                window_handlers=window_handlers[symbol],
                emit_window=lambda ws, win, s=symbol: emit_window(s, ws, win),
                checkpoint_ms=checkpoint_ms.get(symbol),
                is_stopped=is_stopped,
                worker_id=worker_id,
            )
            for handler in window_handlers[symbol]:
                emit_window(symbol, handler.win_ms, handler.flush())

        if not is_stopped():
            asyncio.run(run_all_from_socket())
    finally:
        print(f"[worker {worker_id}] done")
        for storage in storages.values():
            storage.close()
        shm_data.close()
        shm_index.close()


def find_first_key_after_checkpoint(storage: RocksdbLog, checkpoint_ms: int) -> bytes | None:
    forward_iter = storage.iterate_from(None, 1)
    reverse_iter = storage.iterate_from_end(None, 1)

    try:
        if not forward_iter.has_next() or not reverse_iter.has_next():
            return None

        first_batch = forward_iter.next_batch()
        last_batch = reverse_iter.next_batch()

        if not first_batch or not last_batch:
            return None

        low_key = int.from_bytes(first_batch[0][0], byteorder="big", signed=True)
        high_key = int.from_bytes(last_batch[0][0], byteorder="big", signed=True)

        first_order = order_decoder.decode(first_batch[0][1])
        if first_order.time > checkpoint_ms:
            return None

        last_order = order_decoder.decode(last_batch[0][1])
        if last_order.time <= checkpoint_ms:
            return last_batch[0][0]

    finally:
        forward_iter.close()
        reverse_iter.close()

    result_key: bytes | None = None

    while low_key <= high_key:
        mid_key = (low_key + high_key) // 2
        mid_key_bytes = mid_key.to_bytes(8, byteorder="big", signed=True)

        mid_iter = storage.iterate_from(mid_key_bytes, 1)
        try:
            if not mid_iter.has_next():
                high_key = mid_key - 1
                continue

            batch = mid_iter.next_batch()
            if not batch:
                high_key = mid_key - 1
                continue

            key_bytes, value_bytes = batch[0]
            order = order_decoder.decode(value_bytes)

            if order.time > checkpoint_ms:
                result_key = key_bytes
                high_key = mid_key - 1
            else:
                low_key = mid_key + 1
        finally:
            mid_iter.close()

    return result_key


EmitWindowInternal = Callable[[int, tuple[int, bytes] | None], None]


def run_from_storage(
    storage: RocksdbLog,
    window_handlers: list["WindowHandler"],
    emit_window: EmitWindowInternal,
    checkpoint_ms: int | None,
    is_stopped: IsStopped = lambda: False,
    worker_id: str = "",
):
    checkpoint_ms = checkpoint_ms or 0

    start_key: bytes | None = None
    if checkpoint_ms > 0:
        start_key = find_first_key_after_checkpoint(storage, checkpoint_ms)
        if start_key is not None:
            print(f"[worker {worker_id}] binary search found start key, skipping to checkpoint")

    iter = storage.iterate_from(start_key, 1_000)

    try:
        while iter.has_next() and not is_stopped():
            messages = iter.next_batch()

            for _, value_bytes in messages:
                if is_stopped():
                    break

                order = order_decoder.decode(value_bytes)
                for window_handler in window_handlers:
                    emit_window(window_handler.win_ms, window_handler.handle(order))
    finally:
        iter.close()


async def run_from_socket(
    platform: str,
    symbol: str,
    storage: RocksdbLog,
    window_handlers: list["WindowHandler"],
    emit_window: EmitWindow,
    is_stopped: IsStopped,
    checkpoint_ms: int | None = None,
    worker_id: str = "",
    zmq_context: zmq.asyncio.Context | None = None,
):
    print(f"[worker {worker_id}] run_from_socket starting for {symbol}")
    checkpoint_ms = checkpoint_ms or 0
    event_count = 0
    batch_count = 0

    try:
        async for batch in consume_order_books_consistently(
            platform=platform,
            symbol=symbol,
            storage=storage,
            is_stopped=is_stopped,
            zmq_context=zmq_context,
        ):
            batch_count += 1
            for order_with_id in batch:
                if order_with_id.time <= checkpoint_ms:
                    continue

                event_count += 1
                order = OrderBook(
                    symbol=order_with_id.symbol,
                    time=order_with_id.time,
                    platform=order_with_id.platform,
                    bids=order_with_id.bids,
                    asks=order_with_id.asks,
                )

                for window_handler in window_handlers:
                    emit_window(symbol, window_handler.win_ms, window_handler.handle(order))

                print(f"[worker {worker_id}] socket {symbol} processed {event_count} orders")

            await asyncio.sleep(0)

        print(
            f"[worker {worker_id}] run_from_socket finished for {symbol}, total: {event_count} orders, {batch_count} batches"
        )
    except Exception as e:
        print(f"[worker {worker_id}] run_from_socket failed for {symbol}: {e}")


class WindowHandler:
    def __init__(self, window_size_ms: int):
        self.win_ms = window_size_ms
        self.win_start: int | None = None
        self.mgr = OrderBookManager()
        self.acc = OrderBookAccumulator()
        self.prev_t = None
        self.prev_mid = None
        self.prev_spread = None

    def handle(self, order_book: OrderBook) -> tuple[int, bytes] | None:
        record_time_ms = order_book.time
        window_start_incl = (record_time_ms // self.win_ms) * self.win_ms

        if self.win_start is not None and window_start_incl < self.win_start:
            return None

        self.mgr.apply_one(order_book)

        if not self.mgr.has_snapshot:
            return None

        result = None

        if self.win_start is None or window_start_incl == self.win_start:
            if self.win_start is None:
                self.win_start = window_start_incl

        elif window_start_incl > self.win_start:
            ob_acc_close(
                self.acc,
                self.mgr,
                last_mid=self.prev_mid,
                last_spread=self.prev_spread,
            )
            result = (
                self.win_start + self.win_ms,
                ob_acc_encoder.encode(self.acc),
            )
            self.acc = OrderBookAccumulator()

            self.win_start = window_start_incl

            self.prev_mid = None
            self.prev_spread = None
            self.prev_t = None

        mid, spread = ob_acc_update_tick(
            self.acc,
            self.mgr,
            self.prev_t or self.win_start,
            record_time_ms,
            prev_mid=self.prev_mid,
            prev_spread=self.prev_spread,
            time_weighted=True,
        )
        self.prev_mid = mid
        self.prev_spread = spread
        self.prev_t = record_time_ms

        return result

    def flush(self) -> tuple[int, bytes] | None:
        result = None
        if self.win_start:
            ob_acc_close(
                self.acc,
                self.mgr,
                last_mid=self.prev_mid,
                last_spread=self.prev_spread,
            )
            ob_acc_reset(self.acc, None)
            result = (
                self.win_start + self.win_ms,
                ob_acc_encoder.encode(self.acc),
            )

        return result


if __name__ == "__main__":
    import asyncio

    @dataclass
    class WorkerProcess:
        id: str
        proc: Process
        shm_data: SharedMemory
        shm_index: SharedMemory
        mask: int
        reads: int
        done: bool

    async def read_worker_loop(workers: list[WorkerProcess]):
        storage = RocksdbLog(
            base_dir="/Users/e/taltech/loputoo/start/storage/py-predictor/dev",
            db_name="windows",
            writable=True,
        )
        reads = 0

        start = time.time()
        while True:
            read = False

            for worker in workers:
                tup = ring_buffer.read(
                    data_buf=worker.shm_data.buf, index_buf=worker.shm_index.buf, mask=worker.mask
                )
                if tup is None:
                    continue
                read = True
                worker.reads = worker.reads + 1
                reads = reads + 1

                key_bytes, value_bytes = tup

                storage.put(key=key_bytes, value=value_bytes)

                if reads % 10000 == 0:
                    print(f"[MAIN] pipe {reads} rows to RocksDb in {time.time() - start}s")

            if not read:
                await asyncio.sleep(0.1)

    async def run_all():
        workers: list[WorkerProcess] = []

        for platform, symbol in [
            ("binance", "eth_usdt"),
            ("binance", "xrp_usdt"),
            ("binance", "btc_usdt"),
            ("binance", "trump_usdt"),
        ]:
            # for platform, symbol in [("binance", "eth_usdt")]:
            worker_name = f"worker-order_book-window-{platform}-{symbol}"
            shm_data, shm_index, size, mask = ring_buffer.init(
                shm_data_name=None, shm_index_name=None
            )
            p = Process(
                target=run,
                args=(
                    shm_data.name,
                    shm_index.name,
                    f"/Users/e/taltech/loputoo/start/storage/internal-bridge/{platform}/unified/order_book",
                    platform,
                    symbol,
                    1000,
                ),
                name=worker_name,
            )

            workers.append(
                WorkerProcess(
                    id=worker_name,
                    proc=p,
                    shm_data=shm_data,
                    shm_index=shm_index,
                    mask=mask,
                    reads=0,
                    done=False,
                )
            )

        for w in workers:
            w.proc.start()

        await read_worker_loop(workers)

        for w in workers:
            w.proc.join()
            w.shm_data.close()
            w.shm_data.unlink()
            w.shm_index.close()
            w.shm_index.unlink()

    asyncio.run(run_all())

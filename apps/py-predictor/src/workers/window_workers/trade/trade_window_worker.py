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
from src.lib.zeromq_subscriber import (
    IsStopped,
    TradeWithId,
    consume_trades_consistently,
)

from ..messages import Platform, WindowKeyParts, WindowKind, pack_window_key
from .messages import (
    Trade,
    TradeWindowAggregate,
    trade_decoder,
    trade_window_aggregate_encoder,
)
from .trade_window_soa import TradeWindowSoA

EmitWindow = Callable[[str, int, tuple[int, TradeWindowAggregate] | None], None]


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
    worker_id = f"{platform_str}-trade-{symbols_str}-{window_sizes_str}"

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

    def emit_window(symbol: str, window_size_ms: int, win: tuple[int, TradeWindowAggregate] | None):
        nonlocal count
        if win is None:
            return

        count = count + 1
        data = trade_window_aggregate_encoder.encode(win[1])
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
                        kind=WindowKind.trade,
                        window_size_ms=window_size_ms,
                        platform=platform,
                    )
                ),
                value=data,
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

        first_trade = trade_decoder.decode(first_batch[0][1])
        if first_trade.time > checkpoint_ms:
            return None

        last_trade = trade_decoder.decode(last_batch[0][1])
        if last_trade.time <= checkpoint_ms:
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
            trade = trade_decoder.decode(value_bytes)

            if trade.time > checkpoint_ms:
                result_key = key_bytes
                high_key = mid_key - 1
            else:
                low_key = mid_key + 1
        finally:
            mid_iter.close()

    return result_key


def run_from_storage(
    storage: RocksdbLog,
    window_handlers: list["WindowHandler"],
    emit_window: EmitWindow,
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

                trade = trade_decoder.decode(value_bytes)

                for window_handler in window_handlers:
                    emit_window(window_handler.window_size_ms, window_handler.handle(trade))
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
        async for batch in consume_trades_consistently(
            platform=platform,
            symbol=symbol,
            storage=storage,
            is_stopped=is_stopped,
            zmq_context=zmq_context,
        ):
            batch_count += 1
            for trade_with_id in batch:
                if trade_with_id.time <= checkpoint_ms:
                    continue

                event_count += 1
                trade = Trade(
                    symbol=trade_with_id.symbol,
                    price=trade_with_id.price,
                    quantity=trade_with_id.quantity,
                    time=trade_with_id.time,
                    platform=trade_with_id.platform,
                    side=trade_with_id.side,
                    orderType=trade_with_id.orderType,
                    misc=trade_with_id.misc,
                )

                for window_handler in window_handlers:
                    emit_window(symbol, window_handler.window_size_ms, window_handler.handle(trade))

                print(f"[worker {worker_id}] socket {symbol} processed {event_count} trades")

            await asyncio.sleep(0)

        print(
            f"[worker {worker_id}] run_from_socket finished for {symbol}, total: {event_count} trades, {batch_count} batches"
        )
    except Exception as e:
        print(f"[worker {worker_id}] run_from_socket failed for {symbol}: {e}")


class WindowHandler:
    def __init__(self, window_size_ms: int):
        self.window_size_ms = window_size_ms
        self.current_window_start: int | None = None
        self.current_window_data = TradeWindowSoA()
        self.next_window_start: int | None = None
        self.next_window_data = TradeWindowSoA()

    def handle(self, trade: Trade) -> None | tuple[int, TradeWindowAggregate]:
        record_time_ms = trade.time
        window_start_incl = (record_time_ms // self.window_size_ms) * self.window_size_ms
        result = None

        if self.current_window_start is None:
            self.current_window_start = window_start_incl
            self.current_window_data.append(trade)
        elif window_start_incl == self.current_window_start:
            self.current_window_data.append(trade)
        elif self.next_window_start is None or window_start_incl == self.next_window_start:
            if self.next_window_start is None:
                self.next_window_start = window_start_incl
            self.next_window_data.append(trade)
        elif window_start_incl > self.next_window_start:
            if self.current_window_data.i > 0:
                result = (
                    self.current_window_start,
                    self.current_window_data.features(
                        window_start=self.current_window_start,
                        window_end=self.current_window_start + self.window_size_ms,
                    ),
                )

            tmp_next_window_data = self.current_window_data.clear()
            self.current_window_start = self.next_window_start
            self.current_window_data = self.next_window_data
            self.next_window_start = window_start_incl
            self.next_window_data = tmp_next_window_data
            self.next_window_data.append(trade)

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
        """
        Asynchronously polls a single worker's ring buffer until it has read LOOP_SIZE items.
        Uses small async sleeps to avoid blocking the event loop.
        """
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
                    print(f"[MAIN] read/write {reads} in {time.time() - start}s")

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
            worker_name = f"worker-trade-window-{platform}-{symbol}"
            shm_data, shm_index, size, mask = ring_buffer.init(
                shm_data_name=None, shm_index_name=None
            )
            p = Process(
                target=run,
                args=(
                    shm_data.name,
                    shm_index.name,
                    f"/Users/e/taltech/loputoo/start/storage/internal-bridge/{platform}/unified/trade",
                    platform,
                    symbol,
                    [1000],
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

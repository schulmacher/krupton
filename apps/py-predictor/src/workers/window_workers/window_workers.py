import asyncio
import os
import time
from collections.abc import Callable
from dataclasses import dataclass
from multiprocessing import Event, Process
from multiprocessing.shared_memory import SharedMemory
from multiprocessing.synchronize import Event as EventType

from src.lib.rocks_db_log import RocksdbLog
from src.lib.worker import ring_buffer

from .messages import WindowKind, unpack_window_key
from .order import order_window_worker
from .trade import trade_window_worker

IsStopped = Callable[[], bool]


@dataclass
class WorkerProcess:
    id: str
    proc: Process
    shm_data: SharedMemory
    shm_index: SharedMemory
    mask: int
    reads: int
    done: bool


@dataclass
class WorkerConfig:
    platform: str
    kind: WindowKind
    symbols: list[str]
    window_sizes_ms: list[int]
    checkpoint_ms: dict[str, int | None]


def get_checkpoint_key(platform: str, symbol: str, kind: str, window_size_ms: int) -> str:
    return f"{platform}-{symbol}-{kind}-{window_size_ms}"


def get_worker_id(config: WorkerConfig) -> str:
    symbols_str = "_".join(sorted(config.symbols))
    windows_str = "_".join(str(w) for w in sorted(config.window_sizes_ms))
    return f"{config.platform}-{config.kind.name}-{symbols_str}-{windows_str}"


def create_trade_worker(
    config: WorkerConfig,
    shutdown_event: EventType,
) -> WorkerProcess:
    worker_id = get_worker_id(config)

    shm_data, shm_index, size, mask = ring_buffer.init(shm_data_name=None, shm_index_name=None)
    p = Process(
        target=trade_window_worker.run,
        args=(
            shm_data.name,
            shm_index.name,
            f"/Users/e/taltech/loputoo/start/storage/internal-bridge/{config.platform}/unified/trade",
            config.platform,
            config.symbols,
            config.window_sizes_ms,
            config.checkpoint_ms,
            shutdown_event,
        ),
        name=worker_id,
    )

    return WorkerProcess(
        id=worker_id,
        proc=p,
        shm_data=shm_data,
        shm_index=shm_index,
        mask=mask,
        reads=0,
        done=False,
    )


def create_order_worker(
    config: WorkerConfig,
    shutdown_event: EventType,
) -> WorkerProcess:
    worker_id = get_worker_id(config)

    shm_data, shm_index, size, mask = ring_buffer.init(shm_data_name=None, shm_index_name=None)
    p = Process(
        target=order_window_worker.run,
        args=(
            shm_data.name,
            shm_index.name,
            f"/Users/e/taltech/loputoo/start/storage/internal-bridge/{config.platform}/unified/order_book",
            config.platform,
            config.symbols,
            config.window_sizes_ms,
            config.checkpoint_ms,
            shutdown_event,
        ),
        name=worker_id,
    )

    return WorkerProcess(
        id=worker_id,
        proc=p,
        shm_data=shm_data,
        shm_index=shm_index,
        mask=mask,
        reads=0,
        done=False,
    )


def merge_configs(target: WorkerConfig, source: WorkerConfig) -> WorkerConfig:
    merged_symbols = list(set(target.symbols + source.symbols))
    merged_window_sizes = list(set(target.window_sizes_ms + source.window_sizes_ms))
    merged_checkpoint = {**target.checkpoint_ms, **source.checkpoint_ms}

    return WorkerConfig(
        platform=target.platform,
        kind=target.kind,
        symbols=merged_symbols,
        window_sizes_ms=merged_window_sizes,
        checkpoint_ms=merged_checkpoint,
    )


def distribute_work_across_cores(
    platform_symbols: list[tuple[str, str]],
    window_sizes_ms: list[int],
    checkpoint: dict[str, int | None],
    num_cores: int | None = None,
) -> list[WorkerConfig]:
    if num_cores is None:
        num_cores = os.cpu_count() or 4

    configs: list[WorkerConfig] = []
    for platform, symbol in platform_symbols:
        for kind in [WindowKind.trade, WindowKind.order]:
            for window_size_ms in window_sizes_ms:
                checkpoint_value = checkpoint.get(
                    get_checkpoint_key(platform, symbol, kind.name, window_size_ms)
                )
                configs.append(
                    WorkerConfig(
                        platform=platform,
                        kind=kind,
                        symbols=[symbol],
                        window_sizes_ms=[window_size_ms],
                        checkpoint_ms={symbol: checkpoint_value},
                    )
                )

    while len(configs) > num_cores:
        groups: list[list[WorkerConfig]] = []
        for platform in set(c.platform for c in configs):
            for kind in [WindowKind.trade, WindowKind.order]:
                platform_kind_group = [
                    c for c in configs if c.platform == platform and c.kind == kind
                ]
                if len(platform_kind_group) >= 2:
                    groups.append(platform_kind_group)

        groups.sort(key=len, reverse=True)

        merged = False
        for group in groups:
            target = group[0]
            source = group[1]

            configs.remove(target)
            configs.remove(source)
            configs.append(merge_configs(target, source))
            merged = True
            break

        if not merged:
            break

    return configs


WindowEvent = tuple[bytes, bytes]
OnWindowEvent = Callable[[WindowEvent], None]


async def cleanup_finished_workers(
    workers: list[WorkerProcess],
    is_stopped: IsStopped,
    check_interval: float = 1.0,
):
    while not is_stopped() and len(workers) > 0:
        await asyncio.sleep(check_interval)

        finished: list[WorkerProcess] = []
        for worker in workers:
            if not worker.proc.is_alive():
                tup = ring_buffer.read(
                    data_buf=worker.shm_data.buf, index_buf=worker.shm_index.buf, mask=worker.mask
                )
                if tup is None:
                    finished.append(worker)

        for worker in finished:
            worker.done = True
            worker.shm_data.close()
            worker.shm_data.unlink()
            worker.shm_index.close()
            worker.shm_index.unlink()
            workers.remove(worker)
            print(
                f"[MAIN] worker {worker.id} finished with {worker.reads} reads."
                f" Workers left: {len(workers)}"
            )


async def loop_worker_ring_buffers(
    workers: list[WorkerProcess],
    on_event: OnWindowEvent,
    is_stopped: IsStopped,
):
    reads = 0

    start = time.time()
    while not is_stopped() and len(workers) > 0:
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

            on_event(tup)

            if reads % 10000 == 0:
                print(f"[MAIN] read/write {reads} in {time.time() - start}s")

        if not read:
            await asyncio.sleep(0.5)


async def run_all_window_workers(
    storage: RocksdbLog,
    platform_symbols: list[tuple[str, str]],
    window_sizes_ms: list[int],
    num_cores: int | None = None,
    is_shutting_down: IsStopped = lambda: False,
):
    reverse_iter = storage.iterate_from_end()
    checkpoint: dict[str, int | None] = {
        get_checkpoint_key(platform, symbol, kind, window_size_ms): None
        for platform, symbol in platform_symbols
        for kind in [WindowKind.order.name, WindowKind.trade.name]
        for window_size_ms in window_sizes_ms
    }

    try:
        while reverse_iter.has_next() and any(v is None for v in checkpoint.values()):
            data = reverse_iter.next_batch()
            for key_bytes, value_bytes in data:
                key = unpack_window_key(key_bytes)

                state_key = get_checkpoint_key(
                    key.platform.name, key.symbol, key.kind.name, key.window_size_ms
                )
                if state_key not in checkpoint:
                    continue

                if checkpoint[state_key] is not None:
                    continue

                checkpoint[state_key] = key.window_end_ms

    except Exception as error:
        print(error)
    finally:
        reverse_iter.close()

    print(checkpoint)

    shutdown_event = Event()

    worker_configs = distribute_work_across_cores(
        platform_symbols=platform_symbols,
        window_sizes_ms=window_sizes_ms,
        checkpoint=checkpoint,
        num_cores=num_cores,
    )

    print("worker_configs", [get_worker_id(w) for w in worker_configs])
    print(f"[MAIN] Creating {len(worker_configs)} workers for {num_cores or os.cpu_count()} cores")

    workers: list[WorkerProcess] = []
    for config in worker_configs:
        if config.kind == WindowKind.trade:
            workers.append(create_trade_worker(config, shutdown_event))
        else:
            workers.append(create_order_worker(config, shutdown_event))

    for w in workers:
        print(f"[MAIN] Starting worker {w.id}")
        w.proc.start()

    def write_to_storage(tup: WindowEvent):
        key_bytes, value_bytes = tup
        try:
            unpack_window_key(key_bytes)
        except Exception as error:
            print("len(key_bytes), len(value_bytes)", len(key_bytes), len(value_bytes))
            print(error)
            raise Exception("Failed to parse key")
        storage.put(key=key_bytes, value=value_bytes)

    def handle_worker_data(tup: WindowEvent):
        write_to_storage(tup)

    try:
        await asyncio.gather(
            loop_worker_ring_buffers(
                workers,
                on_event=handle_worker_data,
                is_stopped=is_shutting_down,
            ),
            cleanup_finished_workers(
                workers,
                is_stopped=is_shutting_down,
            ),
        )
    finally:
        shutdown_event.set()

        for w in workers:
            if w.done:
                continue
            w.proc.join(timeout=5)
            if w.proc.is_alive():
                w.proc.terminate()
            w.shm_data.close()
            w.shm_data.unlink()
            w.shm_index.close()
            w.shm_index.unlink()


if __name__ == "__main__":
    storage = RocksdbLog(
        base_dir="/Users/e/taltech/loputoo/start/storage/py-predictor/dev",
        db_name="windows",
        writable=True,
        compression=False,
    )
    platform_symbols = [
        ("binance", "eth_usdt"),
        ("binance", "xrp_usdt"),
        ("binance", "sol_usdt"),
        ("binance", "btc_usdt"),
        ("binance", "trump_usdt"),
        ("kraken", "btc_usdt"),
        ("kraken", "eth_usdt"),
        ("kraken", "xrp_usdt"),
        ("kraken", "sol_usdt"),
        ("kraken", "trump_usdt"),
        ("kraken", "wlfi_usd"),
        ("kraken", "kas_usdt"),
    ]
    window_sizes_ms = [30000]

    asyncio.run(
        run_all_window_workers(
            storage=storage,
            platform_symbols=platform_symbols,
            window_sizes_ms=window_sizes_ms,
        )
    )

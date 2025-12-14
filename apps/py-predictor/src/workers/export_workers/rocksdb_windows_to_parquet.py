from os import makedirs

import polars as pl

from src.lib import date
from src.lib.rocks_db_log import RocksdbLog
from src.workers.window_workers.messages import WindowKeyParts, WindowKind, unpack_window_key
from src.workers.window_workers.order.messages import OrderBookAccumulator, ob_acc_decoder
from src.workers.window_workers.trade.messages import (
    TradeWindowAggregate,
    trade_window_aggregate_decoder,
)

_day_ms = 86_400_000
_window_size_ms = _day_ms * 180


def unpack_window_value(
    kind: WindowKind, value_bytes: bytes
) -> OrderBookAccumulator | TradeWindowAggregate:
    result = None

    match kind:
        case WindowKind.order:
            result = ob_acc_decoder.decode(value_bytes)
        case WindowKind.trade:
            result = trade_window_aggregate_decoder.decode(value_bytes)
        case _:
            raise Exception(f"Unsupported kind {kind}")

    return result


def emit_batch_to_parquet(
    items: list[tuple[WindowKeyParts, bytes]],
    out_dir: str,
    time_ms: int,
    part: str,
):
    df = pl.DataFrame(
        [
            {
                "window_end_ms": key.window_end_ms,
                "window_size_ms": key.window_size_ms,
                "symbol": key.symbol,
                "kind": key.kind.name,
                "platform": key.platform.name,
                "value_bytes": value,
            }
            for key, value in items
        ]
    )
    parquet_path = f"{out_dir}/date={date.ms_to_iso_date(time_ms)}/"
    makedirs(parquet_path, exist_ok=True)
    df.write_parquet(f"{parquet_path}/part-{part}.parquet")


def export_to_parquet(db_path: str, out_dir: str, batch_size: int = 500_000):
    storage = RocksdbLog(
        base_dir=db_path,
        db_name="windows",
        writable=True,
        compression=False,
    )
    it = storage.iterate_from()

    # current window
    cw_time = None
    cw_part = 1
    cw_items: list[tuple[WindowKeyParts, bytes]] = []
    i = 0
    j = 0

    while it.has_next():
        rocksdb_batch = it.next_batch()

        for key_bytes, value_bytes in rocksdb_batch:
            i = i + 1
            key = unpack_window_key(key_bytes)
            w_start = (key.window_end_ms // _window_size_ms) * _window_size_ms

            if cw_time is None:
                cw_time = w_start

            if cw_time != w_start:
                j = j + 1
                print(f"Written before NEXT batch {j} of size {len(cw_items)} from {i} messages")
                emit_batch_to_parquet(
                    cw_items,
                    out_dir,
                    cw_time,
                    str(cw_part).rjust(4, "0"),
                )
                cw_part = 1
                cw_time = w_start
                cw_items.clear()

            cw_items.append((key, value_bytes))

            if len(cw_items) >= batch_size:
                print(len(cw_items), batch_size)
                j = j + 1
                print(f"Written PARTIAL batch {j} of size {len(cw_items)} from {i} messages")
                emit_batch_to_parquet(
                    cw_items,
                    out_dir,
                    cw_time,
                    str(cw_part).rjust(4, "0"),
                )
                cw_part = cw_part + 1
                cw_items.clear()

    if cw_time is not None and len(cw_items):
        emit_batch_to_parquet(
            cw_items,
            out_dir,
            cw_time,
            str(cw_part).rjust(4, "0"),
        )
        cw_items.clear()


if __name__ == "__main__":
    export_to_parquet(
        "/Users/e/taltech/loputoo/start/storage/py-predictor/dev",
        "/Users/e/taltech/loputoo/start/storage/py-predictor/parquet/dev",
    )

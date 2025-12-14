from typing import Any

import msgspec
import polars as pl

from src.workers.window_workers.order.messages import OrderBookAccumulator, ob_acc_decoder
from src.workers.window_workers.trade.messages import (
    TradeWindowAggregate,
    trade_window_aggregate_decoder,
)

order_fields = [f.name for f in msgspec.structs.fields(OrderBookAccumulator)]
trade_fields = [f.name for f in msgspec.structs.fields(TradeWindowAggregate)]

# A window where in which both orders and trades were being fetcher normally
_window_start = 1761846510000
_window_end = 1762033980000


def map_msgspec_to_dict(msg, fields: list[str]):
    return {k: getattr(msg, k) for k in fields}


def decode_msgspec_batch(batch: pl.Series, decoder, fields: list[str]) -> pl.Series:
    return pl.Series([map_msgspec_to_dict(decoder.decode(b), fields) if b else None for b in batch])


# def prefix_struct_fields(expr: pl.Expr, prefix: str) -> pl.Expr:
#     return expr.struct.rename_fields([f"{prefix}{name}" for name in expr.struct.fields])


def struct_schema_from_msgspec(cls: type[msgspec.Struct]) -> pl.Struct:
    """
    Build a Polars Struct schema from msgspec.Struct type annotations.
    Handles Optional[...] and maps builtin Python types → Polars dtypes.
    """
    mapping: dict[str, Any] = {}

    for field_info in msgspec.structs.fields(cls):
        typ = str(field_info.type)
        # print(f"{field_info.name} {typ} {type(typ)}")
        if "float" in typ:
            mapping[field_info.name] = pl.Float64
        elif "int" in typ:
            mapping[field_info.name] = pl.Int64
        elif "bool" in typ:
            mapping[field_info.name] = pl.Boolean
        elif "bytes" in typ:
            mapping[field_info.name] = pl.Binary
        elif "str" in typ:
            mapping[field_info.name] = pl.Utf8
        else:
            mapping[field_info.name] = pl.Object  # fallback for exotic cases

    return pl.Struct(mapping)


def read_complete_kraken_windows(
    parquet_root: str,
    n: int = 10,
) -> pl.DataFrame:
    df = pl.scan_parquet(f"{parquet_root}/date=*/part-*.parquet")

    result = df.filter(
        (pl.col("value_bytes").is_not_null())
        & (pl.col("platform") == "kraken")
        & (pl.col("window_end_ms") >= _window_start)
        & (pl.col("window_end_ms") <= _window_end)
    ).collect()

    result = (
        result.pivot(
            values="value_bytes",
            index=["window_end_ms", "symbol", "platform", "window_size_ms"],
            on="kind",
        )
        .rename({"trade": "trade_value_bytes", "order": "order_value_bytes"})
        .sort(["window_end_ms", "symbol"])
        # .filter(
        #     pl.col("trade_value_bytes").is_not_null() & pl.col("order_value_bytes").is_not_null()
        # )
    )

    result = result.with_columns(
        pl.col("trade_value_bytes")
        .map_batches(
            lambda s: decode_msgspec_batch(s, trade_window_aggregate_decoder, trade_fields),
            return_dtype=struct_schema_from_msgspec(TradeWindowAggregate),
        )
        .alias("trade_features"),
        pl.col("order_value_bytes")
        .map_batches(
            lambda s: decode_msgspec_batch(s, ob_acc_decoder, order_fields),
            return_dtype=struct_schema_from_msgspec(OrderBookAccumulator),
        )
        .alias("order_features"),
    ).drop(["trade_value_bytes", "order_value_bytes"])
    # result = result.unnest("trade_features").rename(
    #     {c: f"trade_{c}" for c in result.select("trade_features").unnest("trade_features").columns}
    # )

    # Covert features into long format
    # cols = []
    # cols.extend(result.select("trade_features").unnest("trade_features").columns)
    # cols.extend(result.select("order_features").unnest("order_features").columns)

    # result = (
    #     result.unnest(["trade_features", "order_features"])  # expand struct to columns
    #     .unpivot(  # unpivot into long form
    #         index=["window_end_ms", "symbol", "platform"],  # keep these as identifiers
    #         on=cols,  # melt all trade columns
    #         variable_name="feature",  # column name for feature names
    #         value_name="value",  # column name for feature values
    #     )
    #     .sort(["window_end_ms", "symbol"])
    # )

    # return result.unnest(["trade_features", "order_features"])
    return result


if __name__ == "__main__":
    df = read_complete_kraken_windows(
        "/Users/e/taltech/loputoo/start/storage/py-predictor/parquet/dev", 2
    )
    print(len(df))
    pl.Config.set_tbl_rows(20)
    pl.Config.set_tbl_cols(10)
    print(df)

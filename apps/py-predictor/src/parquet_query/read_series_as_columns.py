import re
from collections.abc import Callable, Sequence
from decimal import ROUND_HALF_UP, Decimal

import numpy as np
import polars as pl
from polars.type_aliases import PolarsDataType  # <-- correct type alias

from .read_complete_kraken_window import read_complete_kraken_windows

TRADE_FEATURE_DEFAULTS = {
    "trade_count": 0,
    "sum_vol": 0.0,
    "sum_pv": 0.0,
    "buy_vol": 0.0,
    "sell_vol": 0.0,
    "sum_price": 0.0,
    "sum_price2": 0.0,
    "sum_logret": 0.0,
    "sum_logret2": 0.0,
    "sum_logret3": 0.0,
    "open": 0.0,
    "high": 0.0,
    "low": 0.0,
    "close": 0.0,
    "min_size": 0,
    "max_size": 0,
    "sum_dt": 0,
    "max_gap_ms": 0,
}
ORDER_FEATURE_DEFAULTS = {
    "sw": 0.0,
    "sw_mid": 0.0,
    "sw_micro": 0.0,
    "spread_min": 0.0,
    "spread_max": 0.0,
    # "spread_min": float("-inf"),
    # "spread_max": float("inf"),
    "n_w": 0.0,
    "mean_mid": 0.0,
    "M2_mid": 0.0,
    "sw_bid": 0.0,
    "sw_ask": 0.0,
    "sw_imb": 0.0,
    "sw_bid_best_sz": 0.0,
    "sw_ask_best_sz": 0.0,
    "n_updates": 0,
    "n_mid_up": 0,
    "n_mid_down": 0,
    "n_spread_widen": 0,
    "n_spread_tighten": 0,
    "close_mid": 0.0,
    "close_spread": 0.0,
    "close_bb": 0.0,
    "close_ba": 0.0,
    "close_bq0": 0.0,
    "close_aq0": 0.0,
    "close_best_imb": 0.0,
}


def read_series_as_columns(
    df: pl.DataFrame, *, prev_n: int, from_next_n: int, to_next_n: int
) -> pl.DataFrame:
    """
    Adds {k}_trade_features / {k}_order_features for k in [-prev_n..next_n],
    aligned per (platform, symbol, window_size_ms) using:
      target_ts = window_end_ms + k * window_size_ms
    Missing windows -> nulls.
    """
    keys = ["platform", "symbol", "window_size_ms"]

    out = df.sort(keys + ["window_end_ms"])

    # k = 0 without a join
    out = out.with_columns(
        pl.col("trade_features").alias("0_trade_features"),
        pl.col("order_features").alias("0_order_features"),
    )

    if prev_n == 0 and (to_next_n - from_next_n == 0):
        return out

    base_rhs = df.select(
        *keys,
        "window_end_ms",
        "trade_features",
        "order_features",
    )

    for k in list(range(-prev_n, 0)) + list(range(from_next_n, to_next_n + 1)):
        tcol = f"__t_{k}"
        ocol = f"__o_{k}"

        rhs_k = base_rhs.select(
            *keys,
            pl.col("window_end_ms").alias("ts_k"),  # rename RHS join key
            pl.col("trade_features").alias(tcol),  # unique temp names
            pl.col("order_features").alias(ocol),
        )

        out = (
            out.with_columns(
                target_ts=pl.col("window_end_ms") + pl.col("window_size_ms") * pl.lit(k)
            )
            .join(
                rhs_k,
                left_on=keys + ["target_ts"],
                right_on=keys + ["ts_k"],
                how="left",
            )
            .with_columns(
                pl.col(tcol).alias(f"{k}_trade_features"),
                pl.col(ocol).alias(f"{k}_order_features"),
            )
            # Only drop the *RHS* temp columns and our temp target; keep left window_end_ms intact
            .drop(["target_ts", tcol, ocol])
        )

    return out.drop(["trade_features", "order_features"])


def add_relaxed_target(
    df: pl.DataFrame,
    *,
    from_next_n: int,
    to_next_n: int,
    kind: str = "trade",  # "trade" or "order"
    out_col: str = "relaxed_target",
) -> pl.DataFrame:
    """
    relaxed_target = first non-null among
        {from_next_n}_{kind}_features, {from_next_n+1}_{kind}_features, ..., {to_next_n}_{kind}_features
    """
    if from_next_n > to_next_n:
        raise ValueError("from_next_n must be <= to_next_n")

    candidates = [f"{k}_{kind}_features" for k in range(from_next_n, to_next_n + 1)]
    present = [c for c in candidates if c in df.columns]
    if not present:
        raise ValueError(f"No candidate columns found among: {', '.join(candidates)}")

    return df.with_columns(pl.coalesce([pl.col(c) for c in present]).alias(out_col))


def add_first_past_features(
    df: pl.DataFrame,
    *,
    from_past_n: int,  # e.g. 0
    to_past_n: int,  # e.g. 5  -> considers 0, -1, -2, -3, -4, -5
    kind: str = "trade",  # "trade" or "order"
    out_col: str = "first_past_features",
) -> pl.DataFrame:
    """
    Adds `first_past_features` as the first non-null among:
      0_{kind}_features, -1_{kind}_features, ..., -{to_past_n}_{kind}_features
    (inclusive), scanning in that order.

    Example:
        with_first = add_first_past_features(df, from_past_n=0, to_past_n=5)
    """
    if from_past_n < 0 or to_past_n < 0:
        raise ValueError("from_past_n and to_past_n must be >= 0 (use non-negative counts).")
    if from_past_n > to_past_n:
        raise ValueError("from_past_n must be <= to_past_n.")

    # Build candidate column names in priority order: 0, -1, -2, ...
    ks = (
        [0] + [-(i) for i in range(1, to_past_n + 1)]
        if from_past_n == 0
        else [-(i) for i in range(from_past_n, to_past_n + 1)]
    )
    candidates = [f"{k}_{kind}_features" for k in ks]
    present = [c for c in candidates if c in df.columns]
    if not present:
        raise ValueError(f"No candidate columns found among: {', '.join(candidates)}")

    return df.with_columns(pl.coalesce([pl.col(c) for c in present]).alias(out_col))


_POSITIVE_K_PREFIX = re.compile(r"^[1-9]\d*_")


def remove_positive_k_columns(df: pl.DataFrame, keep: list[str] | None = None) -> pl.DataFrame:
    """
    Drop all columns starting with a positive-k prefix: '1_', '2_', ..., '10_', etc.

    Args:
        df: Polars DataFrame.
        keep: Optional list of column names to force-keep even if they match the pattern.

    Returns:
        A new DataFrame without positive-k columns.
    """
    keep_set = set(keep or [])
    to_keep = [c for c in df.columns if c in keep_set or not _POSITIVE_K_PREFIX.match(c)]
    return df.select(to_keep)


Rule = tuple[str, Callable[[pl.Expr, pl.Expr], pl.Expr]]


def add_target_features(
    df: pl.DataFrame,
    rules: dict[str, Rule],
    *,
    past_col: str = "first_past_features",
    target_col: str = "relaxed_target",
    cast_dtype: PolarsDataType | None = pl.Float64,  # cast prev/target field to this dtype first
) -> pl.DataFrame:
    """
    Add columns computed from (prev, target) taken from struct fields:
      prev  = {past_col}.{field_name}
      target= {target_col}.{field_name}

    Args:
      rules: mapping "new_col" -> (field_name, expr_builder)
             where expr_builder(prev_expr, target_expr) -> pl.Expr
      past_col: struct column containing the 'previous' features (e.g. first_past_features)
      target_col: struct column containing the 'target' features (e.g. relaxed_target)
      cast_dtype: if set, both prev/target are cast to this dtype before applying the expr

    Returns:
      df with new columns added.
    """
    if past_col not in df.columns or target_col not in df.columns:
        raise ValueError(f"Expected struct columns '{past_col}' and '{target_col}' to be present.")

    if not isinstance(df.schema[past_col], pl.Struct) or not isinstance(
        df.schema[target_col], pl.Struct
    ):
        raise TypeError(f"Both '{past_col}' and '{target_col}' must be Struct columns.")

    exprs: list[pl.Expr] = []
    for new_col, (field, builder) in rules.items():
        prev_e = pl.col(past_col).struct.field(field)
        tgt_e = pl.col(target_col).struct.field(field)
        if cast_dtype is not None:
            prev_e = prev_e.cast(cast_dtype)
            tgt_e = tgt_e.cast(cast_dtype)
        exprs.append(builder(prev_e, tgt_e).alias(new_col))

    return df if not exprs else df.with_columns(*exprs)


def fmt_pct_key(p: float, places: int = 3) -> str:
    """
    Convert a fraction p (e.g., 0.001) to a clean percent string for keys:
      0.001 -> '0.1', 0.14 -> '14', 0.13999 -> '14'
    """
    d = Decimal(str(p * 100)).quantize(Decimal(10) ** -places, rounding=ROUND_HALF_UP)
    # strip trailing zeros/dot
    s = format(d.normalize(), "f").rstrip("0").rstrip(".")
    return s or "0"


def get_pct_change_percentiles(
    df: pl.DataFrame,
    prev_col: str = "prev_close",
    target_col: str = "target_close",
    down_by_magnitude: bool = True,  # <- if True, p0≈0 and p100=largest drop
) -> tuple[dict[str, float | None], dict[str, float | None]]:
    pct = df.select(
        ((pl.col(target_col) - pl.col(prev_col)) / (pl.col(prev_col))).cast(pl.Float64).alias("pct")
    )

    def qdict(s: pl.Series) -> dict[str, float | None]:
        if s.len() == 0:
            return {"p0": None, "p25": None, "p50": None, "p75": None, "p100": None}
        return {
            "p20": s.quantile(0.20),
            "p40": s.quantile(0.40),
            "p60": s.quantile(0.60),
            "p80": s.quantile(0.80),
            "p95": s.quantile(0.95),
        }

    up = qdict(pct.filter(pl.col("pct") > 0)["pct"])

    if down_by_magnitude:
        # Compute quantiles on -pct (positive magnitudes), then negate back to stay negative
        d = pct.filter(pl.col("pct") < 0)["pct"]
        dm = -d  # magnitudes
        dm_q = qdict(dm)
        down = {k: (-v if v is not None else None) for k, v in dm_q.items()}
    else:
        down = qdict(pct.filter(pl.col("pct") < 0)["pct"])

    return up, down


def flatten_shifted_features_to_numpy(
    df: pl.DataFrame,
    predictive_features: Sequence[tuple[str, str, dict[str, float]]],
    target_features: Sequence[str],
) -> tuple[np.ndarray, list[str], dict[str, np.ndarray]]:
    """
    Flattens selected struct fields from shifted feature columns into a NumPy design matrix.

    Parameters
    ----------
    df : pl.DataFrame
        Input with struct columns like "0_trade_features", "-12_order_features", etc.

    predictive_features : Sequence[tuple[col_name, prefix, fields_defaults]]
        - col_name: str        -> e.g. "0_trade_features", "-12_order_features"
        - prefix:   str        -> e.g. "t_", "o_"
        - fields_defaults: Mapping[str, float]
            A dict of {field_name: default_value}. Example: {"close": 0.0, "open": 0.0}
            The insertion order of this mapping determines column order for those fields.

    target_features : Sequence[str]
        Names of target columns to extract as separate vectors.

    Returns
    -------
    X : np.ndarray
        Shape (n_rows, n_features)
    feature_names : list[str]
        Names aligned with X columns
    y_by_target : dict[str, np.ndarray]
        Each target name -> 1D array of length n_rows
    """
    feature_exprs: list[pl.Expr] = []
    feature_names: list[str] = []

    for col_name, prefix, fields_defaults in predictive_features:
        # Parse leading shift token (e.g., "0" or "-12") up to the first "_"
        shift_token = col_name.split("_", 1)[0]
        shift_prefix = f"{shift_token}_" if shift_token else ""

        # Preserve the insertion order of the mapping
        for field, default in fields_defaults.items():
            out_name = f"{shift_prefix}{prefix}{field}"
            expr = pl.coalesce(
                pl.col(col_name).struct.field(field).cast(pl.Float64),
                pl.lit(float(default), dtype=pl.Float64),
            ).alias(out_name)
            feature_exprs.append(expr)
            feature_names.append(out_name)

    # Targets as-is
    target_exprs = [pl.col(t).alias(t) for t in target_features]

    # Materialize once
    out = df.select([*feature_exprs, *target_exprs])

    # X in the same order as feature_names
    X = out.select(feature_names).to_numpy()

    # y per target
    y_by_target: dict[str, np.ndarray] = {
        t: out.select(t).to_numpy().ravel() for t in target_features
    }

    return X, feature_names, y_by_target


def convert_df_to_numpy(df: pl.DataFrame, lookback: int = 12):
    result = read_series_as_columns(df, prev_n=lookback, from_next_n=3, to_next_n=7).sort(
        ["window_end_ms"]
    )
    result = add_relaxed_target(result, from_next_n=3, to_next_n=5).filter(
        pl.col("relaxed_target").is_not_null()
    )
    result = add_first_past_features(result, from_past_n=0, to_past_n=5).filter(
        pl.col("first_past_features").is_not_null()
    )
    result = remove_positive_k_columns(result)
    (up_p, down_p) = get_pct_change_percentiles(
        add_target_features(
            result,
            {
                "target_close": ("close", lambda prev, tgt: tgt),
                "prev_close": ("close", lambda prev, tgt: prev),
            },
        )
    )
    """
    How to handle different percentages across timeframes?
    """
    up_p_round = [round(v, 4) for v in up_p.values() if v is not None]
    down_p_round = [round(v, 4) for v in down_p.values() if v is not None]

    # target_features = ["high", "low", "close", "open"]
    target_features = ["high", "low"]
    target_rules_up = {
        f"target_{feat}_up_{fmt_pct_key(p, places=3)}p": (
            feat,
            (lambda prev, tgt, p=p: ((tgt - prev) / (prev)) >= p),
        )
        for feat in target_features
        for p in up_p_round
    }
    target_rules_down = {
        f"target_{feat}_down_{fmt_pct_key(abs(p), places=3)}p": (
            feat,
            (lambda prev, tgt, p=p: ((tgt - prev) / (prev)) <= p),
        )
        for feat in target_features
        for p in down_p_round
    }
    rules = {
        **target_rules_up,
        **target_rules_down,
    }

    result = add_target_features(result, rules)

    shifts = range(-lookback, 1)

    (X, n_feature_names, y) = flatten_shifted_features_to_numpy(
        result,
        predictive_features=[
            *[(f"{n}_trade_features", "t_", TRADE_FEATURE_DEFAULTS) for n in shifts],
            *[
                (
                    f"{n}_order_features",
                    "o_",
                    ORDER_FEATURE_DEFAULTS,
                )
                for n in shifts
            ],
        ],
        target_features=[*rules.keys()],
    )

    name_to_idx = {name: i for i, name in enumerate(n_feature_names)}

    def build_idx_map(prefix: str, fields_defaults: dict[str, float]) -> dict[str, list[int]]:
        idx_map: dict[str, list[int]] = {}
        for field in fields_defaults.keys():
            cols = [f"{n}_{prefix}{field}" for n in shifts]
            missing = [c for c in cols if c not in name_to_idx]
            if missing:
                raise KeyError(f"Missing feature columns for '{field}': {missing}")
            idx_map[f"{prefix}{field}"] = [name_to_idx[c] for c in cols]
        return idx_map

    trade_feature_idx = build_idx_map("t_", TRADE_FEATURE_DEFAULTS)
    order_feature_idx = build_idx_map("o_", ORDER_FEATURE_DEFAULTS)

    main_feature_to_n_idx = {**trade_feature_idx, **order_feature_idx}

    return (X, n_feature_names, y, main_feature_to_n_idx, lookback)


if __name__ == "__main__":
    pl.Config.set_tbl_rows(100)
    pl.Config.set_tbl_cols(10)
    df = read_complete_kraken_windows(
        "/Users/e/taltech/loputoo/start/storage/py-predictor/parquet/dev", 2
    ).filter((pl.col("symbol") == "eth_usdt") & (pl.col("platform") == "kraken"))

    (X, n_feature_names, y, main_feature_to_n_idx, lookback) = convert_df_to_numpy(df)

    print(X)
    print(n_feature_names)
    print(y)
    print(main_feature_to_n_idx)
    print(f"lookback={lookback}")

    print(X[:, main_feature_to_n_idx["o_close_best_imb"]])

    # print(X)
    # print(feature_names)
    # print(len(feature_names))

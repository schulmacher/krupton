from datetime import datetime

import numpy as np
from psycopg import Connection

from ..parquet_query.read_series_as_columns import (
    ORDER_FEATURE_DEFAULTS,
    TRADE_FEATURE_DEFAULTS,
    flatten_shifted_features_to_numpy,
    read_series_as_columns,
)
from .ensemble import (
    SpecialistGroup,
    build_feature_idx_map,
    get_distinct_target_names,
    load_specialists,
    predict_target,
)
from .feature_buffer import FeatureBuffer
from .prediction_combiner import combine_threshold_predictions
from .prediction_types import PredictionSummary, TargetPrediction

DEFAULT_LOOKBACK = 12


class LivePredictor:
    def __init__(
        self,
        buffer: FeatureBuffer,
        platform: str,
        symbol: str,
        window_size_ms: int,
        lookback: int = DEFAULT_LOOKBACK,
    ):
        self.buffer = buffer
        self.platform = platform
        self.symbol = symbol
        self.window_size_ms = window_size_ms
        self.lookback = lookback

        self.specialist_groups: dict[str, SpecialistGroup] = {}
        self.feature_idx_map = build_feature_idx_map(lookback)
        self.max_training_data_length = 2000

    def load_all_models(self, conn: Connection, top_k: int = 3) -> None:
        target_names = get_distinct_target_names(conn, self.platform, self.symbol)

        max_len = 0
        for target_name in target_names:
            group = load_specialists(conn, self.platform, self.symbol, target_name, top_k)
            if group.neg_specialists or group.pos_specialists:
                self.specialist_groups[target_name] = group

                for spec in group.neg_specialists + group.pos_specialists:
                    with conn.cursor() as cur:
                        cur.execute(
                            "SELECT training_data_length FROM ml_tree_result WHERE ml_tree_result_id = %s",
                            (spec.ml_tree_result_id,),
                        )
                        row = cur.fetchone()
                        if row and row[0] > max_len:
                            max_len = row[0]

        if max_len > 0:
            self.max_training_data_length = max_len

    def on_trade_window(self, window_end_ms: int, trade_features: dict) -> bool:
        return self.buffer.on_trade_window(window_end_ms, trade_features)

    def on_order_window(self, window_end_ms: int, order_features: dict) -> bool:
        return self.buffer.on_order_window(window_end_ms, order_features)

    def get_predictions(self) -> PredictionSummary | None:
        if len(self.buffer) < self.lookback + 1:
            return None

        if not self.specialist_groups:
            return None

        slice_size = min(len(self.buffer), self.max_training_data_length)
        df_slice = self.buffer.get_slice(slice_size)

        df_with_shifts = read_series_as_columns(
            df_slice, prev_n=self.lookback, from_next_n=0, to_next_n=0
        )

        shifts = list(range(-self.lookback, 1))
        predictive_features = [
            *[(f"{n}_trade_features", "t_", TRADE_FEATURE_DEFAULTS) for n in shifts],
            *[(f"{n}_order_features", "o_", ORDER_FEATURE_DEFAULTS) for n in shifts],
        ]

        X, feature_names, _ = flatten_shifted_features_to_numpy(
            df_with_shifts, predictive_features=predictive_features, target_features=[]
        )

        window_end_ms = self.buffer.get_latest_window_end_ms()
        if window_end_ms is None:
            return None

        prediction_for_timestamp = datetime.fromtimestamp(
            (window_end_ms + self.window_size_ms * 3) / 1000
        )

        predictions: dict[str, TargetPrediction] = {}
        for target_name, group in self.specialist_groups.items():
            pred = predict_target(
                group,
                X,
                self.feature_idx_map,
                prediction_for_timestamp,
                self.platform,
                self.symbol,
            )
            predictions[target_name] = pred

        return combine_threshold_predictions(
            predictions, prediction_for_timestamp, self.platform, self.symbol
        )

    def get_model_count(self) -> int:
        count = 0
        for group in self.specialist_groups.values():
            count += len(group.neg_specialists) + len(group.pos_specialists)
        return count

    def get_target_names(self) -> list[str]:
        return list(self.specialist_groups.keys())


if __name__ == "__main__":
    import time

    import polars as pl

    from ..lib.postgres.connection import get_connection
    from ..parquet_query.read_complete_kraken_window import read_complete_kraken_windows

    pl.Config.set_tbl_rows(20)
    pl.Config.set_tbl_cols(10)

    PARQUET_PATH = "/Users/e/taltech/loputoo/start/storage/py-predictor/parquet/dev"
    PLATFORM = "kraken"
    SYMBOL = "eth_usdt"
    WINDOW_SIZE_MS = 30000
    HOLDOUT_COUNT = 20

    print("Loading parquet data...")
    df = read_complete_kraken_windows(PARQUET_PATH, 2)
    df = df.filter(
        (pl.col("symbol") == SYMBOL)
        & (pl.col("platform") == PLATFORM)
        & (pl.col("window_size_ms") == WINDOW_SIZE_MS)
        & pl.col("trade_features").is_not_null()
        & pl.col("order_features").is_not_null()
    ).sort("window_end_ms")

    print(f"Total rows: {len(df)}")

    if len(df) < HOLDOUT_COUNT + 50:
        print("Not enough data for testing")
        exit(1)

    buffer_df = df.head(len(df) - HOLDOUT_COUNT)
    holdout_df = df.tail(HOLDOUT_COUNT)

    print(f"Buffer rows: {len(buffer_df)}")
    print(f"Holdout rows: {len(holdout_df)}")

    print("Creating feature buffer...")
    buffer = FeatureBuffer.from_dataframe(buffer_df, PLATFORM, SYMBOL, WINDOW_SIZE_MS)
    print(f"Buffer initialized with {len(buffer)} rows")

    print("Creating live predictor...")
    predictor = LivePredictor(
        buffer=buffer,
        platform=PLATFORM,
        symbol=SYMBOL,
        window_size_ms=WINDOW_SIZE_MS,
    )

    print("Loading models from database...")
    with get_connection() as conn:
        predictor.load_all_models(conn, top_k=3)

    print(
        f"Loaded {predictor.get_model_count()} models for {len(predictor.get_target_names())} targets"
    )
    print(f"Targets: {predictor.get_target_names()[:5]}...")

    if predictor.get_model_count() == 0:
        print("No models found in database. Run training first.")
        exit(1)

    print("\n--- Starting live prediction simulation ---\n")

    for i, row in enumerate(holdout_df.iter_rows(named=True)):
        window_end_ms = row["window_end_ms"]
        trade_features = row["trade_features"]
        order_features = row["order_features"]

        print(f"[{i + 1}/{HOLDOUT_COUNT}] Window {window_end_ms}")

        print("  Adding trade features...")
        predictor.on_trade_window(window_end_ms, trade_features)
        time.sleep(0.5)

        print("  Adding order features...")
        window_complete = predictor.on_order_window(window_end_ms, order_features)
        time.sleep(0.5)

        if window_complete:
            print("  Window complete, getting predictions...")
            summary = predictor.get_predictions()

            current_high = trade_features.get("high", 0)
            current_low = trade_features.get("low", 0)
            current_close = trade_features.get("close", 0)
            current_timestamp = datetime.fromtimestamp(window_end_ms / 1000)

            if summary:
                print(
                    f"  Current: high={current_high:.4f}, low={current_low:.4f}, close={current_close:.4f}"
                )
                print(f"  Window timestamp: {current_timestamp}")
                print(f"  Prediction for:   {summary.prediction_for_timestamp} (window +3)")
                print(f"  HIGH: {summary.high_direction} (conf: {summary.high_confidence:.2f})")

                high_up_preds = [
                    (name, p)
                    for name, p in summary.predictions.items()
                    if name.startswith("target_high_up_")
                ]
                high_down_preds = [
                    (name, p)
                    for name, p in summary.predictions.items()
                    if name.startswith("target_high_down_")
                ]

                if high_up_preds:
                    print("    Up thresholds:")
                    for name, p in sorted(high_up_preds):
                        threshold = name.split("_")[-1]
                        pred_str = "YES" if p.pos_prediction == 1 else "no"
                        print(
                            f"      {threshold}: {pred_str} (pos_conf={p.pos_confidence:.2f}, neg_conf={p.neg_confidence:.2f})"
                        )
                if high_down_preds:
                    print("    Down thresholds:")
                    for name, p in sorted(high_down_preds):
                        threshold = name.split("_")[-1]
                        pred_str = "YES" if p.pos_prediction == 1 else "no"
                        print(
                            f"      {threshold}: {pred_str} (pos_conf={p.pos_confidence:.2f}, neg_conf={p.neg_confidence:.2f})"
                        )

                print(f"  LOW: {summary.low_direction} (conf: {summary.low_confidence:.2f})")

                low_up_preds = [
                    (name, p)
                    for name, p in summary.predictions.items()
                    if name.startswith("target_low_up_")
                ]
                low_down_preds = [
                    (name, p)
                    for name, p in summary.predictions.items()
                    if name.startswith("target_low_down_")
                ]

                if low_up_preds:
                    print("    Up thresholds:")
                    for name, p in sorted(low_up_preds):
                        threshold = name.split("_")[-1]
                        pred_str = "YES" if p.pos_prediction == 1 else "no"
                        print(
                            f"      {threshold}: {pred_str} (pos_conf={p.pos_confidence:.2f}, neg_conf={p.neg_confidence:.2f})"
                        )
                if low_down_preds:
                    print("    Down thresholds:")
                    for name, p in sorted(low_down_preds):
                        threshold = name.split("_")[-1]
                        pred_str = "YES" if p.pos_prediction == 1 else "no"
                        print(
                            f"      {threshold}: {pred_str} (pos_conf={p.pos_confidence:.2f}, neg_conf={p.neg_confidence:.2f})"
                        )
            else:
                print("  No predictions available")

        print()

    print("--- Simulation complete ---")

from __future__ import annotations

from datetime import datetime
from typing import TypedDict

import numpy as np
import polars as pl
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import confusion_matrix
from sklearn.tree import DecisionTreeClassifier

from ..lib.postgres.connection import get_connection
from ..parquet_query.read_complete_kraken_window import read_complete_kraken_windows
from ..parquet_query.read_series_as_columns import convert_df_to_numpy
from ..postgres_entity.ml_tree import MlTreeResult, insert_artifact, insert_result
from .transformation_strategy import apply_transformation_strategy


class DecisionTreeBuildResult(TypedDict):
    result: MlTreeResult
    clf: DecisionTreeClassifier


class RandomForestBuildResult(TypedDict):
    result: MlTreeResult
    clf: RandomForestClassifier


def _chrono_split_last(X: np.ndarray, y: np.ndarray, test_size: float = 0.10):
    n = len(y)
    n_test = max(1, int(np.ceil(n * test_size)))
    split = n - n_test
    return (X[:split], X[split:], y[:split], y[split:], split)


def build_random_forest_classifier(
    X: np.ndarray,
    y: np.ndarray,
    feature_names: list[str],
    *,
    symbol: str,
    platform: str,
    target_name: str,
    window_start: datetime,
    window_end: datetime,
    window_size_ms: int,
    used_features: list[str],
    used_features_lookback: int,
    n_estimators: int = 100,
    max_depth: int | None = None,
    min_samples_leaf: int = 1,
    class_weight: str | dict[str, float] | None = "balanced",
    random_state: int = 42,
    check_nan: bool = True,
    test_size: float = 0.1,
    transformation_strategy: str = "zscore_stepper_fibo_incl",
) -> RandomForestBuildResult:
    X = np.asarray(X)
    y = np.asarray(y)

    if check_nan and (np.isnan(X).any() or np.isnan(y).any()):
        raise ValueError("NaNs detected in X or y, but imputation is disabled.")
    if len(feature_names) != X.shape[1]:
        raise ValueError("feature_names length must match X.shape[1].")
    if np.unique(y).size < 2:
        raise ValueError("Classifier requires at least two classes in y.")

    X_tr, X_te, y_tr, y_te, split = _chrono_split_last(X, y, test_size=test_size)
    X_tr, X_te, y_tr, y_te = apply_transformation_strategy(
        transformation_strategy, X, X_tr, X_te, y_tr, y_te
    )

    clf = RandomForestClassifier(
        n_estimators=n_estimators,
        max_depth=max_depth,
        min_samples_leaf=min_samples_leaf,
        class_weight=class_weight,
        random_state=random_state,
    ).fit(X_tr, y_tr)

    y_pred = clf.predict(X_te)

    training_data_length = len(y_tr)
    training_data_std = float(np.std(y_tr))

    tn, fp, fn, tp = confusion_matrix(y_te, y_pred).ravel()
    recall_score, recall_neg, recall_pos = recall_score_confusion_matrix(tn, fp, fn, tp)
    precision_score, precision_neg, precision_pos = precision_score_confusion_matrix(tn, fp, fn, tp)

    return {
        "result": MlTreeResult(
            ml_tree_result_id=None,
            symbol=symbol,
            platform=platform,
            target_name=target_name,
            window_start=window_start,
            window_end=window_end,
            window_size_ms=window_size_ms,
            methodology="random_forest",
            used_features=used_features,
            used_features_lookback=used_features_lookback,
            transformation=transformation_strategy or "none",
            training_data_length=training_data_length,
            training_data_std=training_data_std,
            recall_score=recall_score,
            recall_neg=recall_neg,
            recall_pos=recall_pos,
            precision_score=precision_score,
            precision_neg=precision_neg,
            precision_pos=precision_pos,
            confusion_matrix_tn=int(tn),
            confusion_matrix_fp=int(fp),
            confusion_matrix_fn=int(fn),
            confusion_matrix_tp=int(tp),
        ),
        "clf": clf,
    }


def build_decision_tree_classifier(
    X: np.ndarray,
    y: np.ndarray,
    feature_names: list[str],
    *,
    symbol: str,
    platform: str,
    target_name: str,
    window_start: datetime,
    window_end: datetime,
    window_size_ms: int,
    used_features: list[str],
    used_features_lookback: int,
    max_depth: int | None = None,
    min_samples_leaf: int = 1,
    class_weight: str | dict[str, float] | None = "balanced",
    random_state: int = 42,
    check_nan: bool = True,
    test_size: float = 0.1,
    transformation_strategy: str = "zscore",
) -> DecisionTreeBuildResult:
    X = np.asarray(X)
    y = np.asarray(y)

    if check_nan and (np.isnan(X).any() or np.isnan(y).any()):
        raise ValueError("NaNs detected in X or y, but imputation is disabled.")
    if len(feature_names) != X.shape[1]:
        raise ValueError("feature_names length must match X.shape[1].")
    if np.unique(y).size < 2:
        raise ValueError("Classifier requires at least two classes in y.")

    X_tr, X_te, y_tr, y_te, split = _chrono_split_last(X, y, test_size=test_size)
    X_tr, X_te, y_tr, y_te = apply_transformation_strategy(
        transformation_strategy, X, X_tr, X_te, y_tr, y_te
    )

    clf = DecisionTreeClassifier(
        max_depth=max_depth,
        min_samples_leaf=min_samples_leaf,
        class_weight=class_weight,
        random_state=random_state,
    ).fit(X_tr, y_tr)

    y_pred = clf.predict(X_te)

    training_data_length = len(y_tr)
    training_data_std = float(np.std(y_tr))

    tn, fp, fn, tp = confusion_matrix(y_te, y_pred).ravel()
    recall_score, recall_neg, recall_pos = recall_score_confusion_matrix(tn, fp, fn, tp)
    precision_score, precision_neg, precision_pos = precision_score_confusion_matrix(tn, fp, fn, tp)

    return {
        "result": MlTreeResult(
            ml_tree_result_id=None,
            symbol=symbol,
            platform=platform,
            target_name=target_name,
            window_start=window_start,
            window_end=window_end,
            window_size_ms=window_size_ms,
            methodology="decision_tree",
            used_features=used_features,
            used_features_lookback=used_features_lookback,
            transformation=transformation_strategy or "none",
            training_data_length=training_data_length,
            training_data_std=training_data_std,
            recall_score=recall_score,
            recall_neg=recall_neg,
            recall_pos=recall_pos,
            precision_score=precision_score,
            precision_neg=precision_neg,
            precision_pos=precision_pos,
            confusion_matrix_tn=int(tn),
            confusion_matrix_fp=int(fp),
            confusion_matrix_fn=int(fn),
            confusion_matrix_tp=int(tp),
        ),
        "clf": clf,
    }


def recall_score_confusion_matrix(tn: int, fp: int, fn: int, tp: int) -> tuple[float, float, float]:
    recall_neg = tn / (tn + fp) if (tn + fp) > 0 else 0.0
    recall_pos = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    return recall_neg * recall_pos, recall_neg, recall_pos


def precision_score_confusion_matrix(
    tn: int, fp: int, fn: int, tp: int
) -> tuple[float, float, float]:
    precision_neg = tn / (tn + fn) if (tn + fn) > 0 else 0.0
    precision_pos = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    return precision_neg * precision_pos, precision_neg, precision_pos


def iterative_feature_selection(
    X: np.ndarray,
    y: np.ndarray,
    feature_names: list[str],
    main_feature_to_n_idx: dict[str, list[int]],
    *,
    symbol: str,
    platform: str,
    target_name: str,
    window_start: datetime,
    window_end: datetime,
    window_size_ms: int,
    used_features_lookback: int,
    top_n_per_iteration: int = 10,
    max_dimension: int | None = None,
):
    all_feature_names = set(main_feature_to_n_idx.keys())
    max_dim = max_dimension if max_dimension else len(all_feature_names)

    best_per_dimension: list[dict | None] = []
    top_feature_sets: list[tuple[str, ...]] = []

    for dimension in range(1, max_dim + 1):
        if dimension == 1:
            feature_combos = [tuple([f]) for f in sorted(all_feature_names)]
        else:
            feature_combos_set: set[tuple[str, ...]] = set()
            for base_set in top_feature_sets:
                remaining_features = all_feature_names - set(base_set)
                for new_feature in remaining_features:
                    expanded = tuple(sorted(set(base_set) | {new_feature}))
                    feature_combos_set.add(expanded)
            feature_combos = sorted(feature_combos_set)

        if not feature_combos:
            break

        results = []

        for feature_combo in feature_combos:
            test_features = list(feature_combo)
            test_indices = []
            for fname in test_features:
                test_indices.extend(main_feature_to_n_idx[fname])

            feature_X = X[:, test_indices]
            test_feature_names = [feature_names[i] for i in test_indices]

            build_result = build_decision_tree_classifier(
                feature_X,
                y,
                test_feature_names,
                symbol=symbol,
                platform=platform,
                target_name=target_name,
                window_start=window_start,
                window_end=window_end,
                window_size_ms=window_size_ms,
                used_features=test_features,
                used_features_lookback=used_features_lookback,
            )
            score = build_result["result"].recall_score * build_result["result"].precision_score

            results.append(
                {
                    "features": test_features,
                    "score": score,
                    "build_result": build_result,
                }
            )

        results.sort(key=lambda x: x["score"], reverse=True)
        best_per_dimension.append(results[0] if results else None)

        top_results = results[:top_n_per_iteration]
        top_feature_sets = [tuple(res["features"]) for res in top_results]

        if dimension >= len(all_feature_names):
            break

    return {
        "target": target_name,
        "best_per_dimension": best_per_dimension,
    }


def format_result_line(dim: int, best: dict | None) -> str:
    if best is None:
        return f"Dim {dim}: No results"

    feature_str = " + ".join(best["features"])
    r: MlTreeResult = best["build_result"]["result"]
    passing = "✓" if best["score"] > 0 else "✗"
    return f"Dim {dim}: {passing} {feature_str} | score={best['score']:.4f} recall={r.recall_score:.4f}"


def extract_cm(r: MlTreeResult) -> tuple[int, int, int, int]:
    return (
        r.confusion_matrix_tn,
        r.confusion_matrix_fp,
        r.confusion_matrix_fn,
        r.confusion_matrix_tp,
    )


def train_and_store_regular_models(
    df: pl.DataFrame,
    *,
    transformation_strategy: str = "zscore",
):
    window_start = datetime.fromtimestamp(df["window_end_ms"].min() / 1000)
    window_end = datetime.fromtimestamp(df["window_end_ms"].max() / 1000)
    window_size_ms = int(df["window_size_ms"].unique()[0])
    symbol = str(df["symbol"].unique()[0])
    platform = str(df["platform"].unique()[0])

    (X, n_feature_names, y, main_feature_to_n_idx, used_features_lookback) = convert_df_to_numpy(df)

    target_names = list(y.keys())
    all_feature_names = list(main_feature_to_n_idx.keys())

    with get_connection() as conn:
        for i, target_name in enumerate(target_names, 1):
            if target_name != "target_high_up_0.09p":
                continue

            target_values = y[target_name]

            dt_build = build_decision_tree_classifier(
                X,
                target_values,
                n_feature_names,
                symbol=symbol,
                platform=platform,
                target_name=target_name,
                window_start=window_start,
                window_end=window_end,
                window_size_ms=window_size_ms,
                used_features=all_feature_names,
                used_features_lookback=used_features_lookback,
                transformation_strategy=transformation_strategy,
            )

            rf_build = build_random_forest_classifier(
                X,
                target_values,
                n_feature_names,
                symbol=symbol,
                platform=platform,
                target_name=target_name,
                window_start=window_start,
                window_end=window_end,
                window_size_ms=window_size_ms,
                used_features=all_feature_names,
                used_features_lookback=used_features_lookback,
                transformation_strategy=transformation_strategy,
            )

            dt_score = dt_build["result"].recall_score * dt_build["result"].precision_score
            dt_cm = extract_cm(dt_build["result"])
            rf_score = rf_build["result"].recall_score * rf_build["result"].precision_score
            rf_cm = extract_cm(rf_build["result"])

            print(f"[{i}/{len(target_names)}] {target_name}:")
            print(f"  DecisionTree: score={dt_score:.4f} cm={dt_cm}")
            print(f"  RandomForest: score={rf_score:.4f} cm={rf_cm}")

            dt_result_id = insert_result(conn, dt_build["result"])
            insert_artifact(conn, dt_result_id, dt_build["clf"])
            print(f"  -> Stored DecisionTree with id={dt_result_id}")

            rf_result_id = insert_result(conn, rf_build["result"])
            insert_artifact(conn, rf_result_id, rf_build["clf"])
            print(f"  -> Stored RandomForest with id={rf_result_id}")


def train_and_store_models(
    df: pl.DataFrame,
    *,
    top_n_per_iteration: int = 5,
    max_dimension: int = 4,
    top_k_to_store: int = 3,
):
    window_start = datetime.fromtimestamp(df["window_end_ms"].min() / 1000)
    window_end = datetime.fromtimestamp(df["window_end_ms"].max() / 1000)
    window_size_ms = int(df["window_size_ms"].unique()[0])
    symbol = str(df["symbol"].unique()[0])
    platform = str(df["platform"].unique()[0])

    (X, n_feature_names, y, main_feature_to_n_idx, used_features_lookback) = convert_df_to_numpy(df)

    target_names = list(y.keys())

    with get_connection() as conn:
        for i, target_name in enumerate(target_names, 1):
            if target_name != "target_high_up_0.09p":
                continue
            target_values = y[target_name]
            result = iterative_feature_selection(
                X,
                target_values,
                n_feature_names,
                main_feature_to_n_idx,
                symbol=symbol,
                platform=platform,
                target_name=target_name,
                window_start=window_start,
                window_end=window_end,
                window_size_ms=window_size_ms,
                used_features_lookback=used_features_lookback,
                top_n_per_iteration=top_n_per_iteration,
                max_dimension=max_dimension,
            )

            best_passing = [b for b in result["best_per_dimension"] if b and b["score"] > 0]
            best_passing_sorted = sorted(best_passing, key=lambda x: x["score"], reverse=True)
            top_builds = best_passing_sorted[:top_k_to_store]

            best_build: DecisionTreeBuildResult | None = (
                top_builds[0]["build_result"] if top_builds else None
            )
            best_score = top_builds[0]["score"] if top_builds else -1
            best_cm = extract_cm(best_build["result"]) if best_build else None

            print(
                f"[{i}/{len(target_names)}] {target_name}: best score={best_score:.4f} cm={best_cm}"
            )

            for rank, build_entry in enumerate(top_builds, 1):
                build: DecisionTreeBuildResult = build_entry["build_result"]
                score = build_entry["score"]
                cm = extract_cm(build["result"])
                result_id = insert_result(conn, build["result"])
                insert_artifact(conn, result_id, build["clf"])
                print(
                    f"  -> Stored #{rank} iterative result with id={result_id} features={build['result'].used_features} score={score:.4f} cm={cm}"
                )


if __name__ == "__main__":
    import sys

    pl.Config.set_tbl_rows(100)
    pl.Config.set_tbl_cols(10)
    df = read_complete_kraken_windows(
        "/Users/e/taltech/loputoo/start/storage/py-predictor/parquet/dev", 2
    ).filter((pl.col("symbol") == "eth_usdt") & (pl.col("platform") == "kraken"))

    mode = sys.argv[1] if len(sys.argv) > 1 else "iterative"

    if mode == "regular":
        print("Training regular models (DecisionTree + RandomForest)...")
        train_and_store_regular_models(df)
    else:
        print("Training iterative feature selection models...")
        train_and_store_models(df)

"""
--- zscore results ---

[3/20] target_high_up_0.09p: best score=0.0933 cm=(158, 68, 6, 16)
  -> Stored #1 iterative result with id=99 features=['t_high', 't_open', 't_sum_dt', 't_sum_pv'] score=0.0933 cm=(158, 68, 6, 16)
  -> Stored #2 iterative result with id=612 features=['o_close_bq0', 't_high'] score=0.0768 cm=(196, 30, 13, 9)
  -> Stored #3 iterative result with id=613 features=['t_open'] score=0.0708 cm=(200, 26, 14, 8)

[3/20] target_high_up_0.09p:
  DecisionTree: score=0.0261 cm=(161, 65, 14, 8)
  RandomForest: score=0.0000 cm=(226, 0, 22, 0)
  -> Stored DecisionTree with id=609
  -> Stored RandomForest with id=610

[5/20] target_high_up_0.29p: best score=0.6640 cm=(245, 0, 1, 2)
  -> Stored #1 iterative result with id=136 features=['o_close_ba', 'o_n_updates'] score=0.6640 cm=(245, 0, 1, 2)
  -> Stored #2 iterative result with id=137 features=['o_close_ba', 'o_close_bb', 'o_close_spread', 'o_n_updates'] score=0.6640 cm=(245, 0, 1, 2)
  -> Stored #3 iterative result with id=606 features=['t_max_size', 't_sum_pv', 't_sum_vol'] score=0.4408 cm=(244, 1, 1, 2)

[5/20] target_high_up_0.29p:
  DecisionTree: score=0.0000 cm=(245, 0, 3, 0)
  RandomForest: score=0.0000 cm=(245, 0, 3, 0)
  -> Stored DecisionTree with id=607
  -> Stored RandomForest with id=608

"""

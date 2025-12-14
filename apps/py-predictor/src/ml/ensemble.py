from dataclasses import dataclass
from datetime import datetime

import numpy as np
from psycopg import Connection
from sklearn.tree import DecisionTreeClassifier

from ..parquet_query.read_series_as_columns import (
    ORDER_FEATURE_DEFAULTS,
    TRADE_FEATURE_DEFAULTS,
)
from ..postgres_entity.ml_tree import load_model
from .prediction_types import TargetPrediction
from .transformation_strategy import apply_transformation_strategy


@dataclass(slots=True)
class Specialist:
    ml_tree_result_id: int
    clf: DecisionTreeClassifier
    used_features: list[str]
    used_features_lookback: int
    transformation: str
    precision_neg: float
    precision_pos: float


@dataclass(slots=True)
class SpecialistGroup:
    target_name: str
    neg_specialists: list[Specialist]
    pos_specialists: list[Specialist]


def build_feature_idx_map(lookback: int) -> dict[str, list[int]]:
    shifts = list(range(-lookback, 1))
    feature_names: list[str] = []

    for n in shifts:
        for field in TRADE_FEATURE_DEFAULTS.keys():
            feature_names.append(f"{n}_t_{field}")
    for n in shifts:
        for field in ORDER_FEATURE_DEFAULTS.keys():
            feature_names.append(f"{n}_o_{field}")

    name_to_idx = {name: i for i, name in enumerate(feature_names)}

    idx_map: dict[str, list[int]] = {}
    for field in TRADE_FEATURE_DEFAULTS.keys():
        cols = [f"{n}_t_{field}" for n in shifts]
        idx_map[f"t_{field}"] = [name_to_idx[c] for c in cols]
    for field in ORDER_FEATURE_DEFAULTS.keys():
        cols = [f"{n}_o_{field}" for n in shifts]
        idx_map[f"o_{field}"] = [name_to_idx[c] for c in cols]

    return idx_map


def load_specialists(
    conn: Connection,
    platform: str,
    symbol: str,
    target_name: str,
    top_k: int = 3,
) -> SpecialistGroup:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT ml_tree_result_id, used_features, used_features_lookback, 
                   transformation, precision_neg, precision_pos
            FROM ml_tree_result
            WHERE platform = %s 
              AND symbol = %s 
              AND target_name = %s
              AND window_size_ms = 30000
              AND methodology = 'decision_tree'
            ORDER BY precision_neg DESC
            LIMIT %s
            """,
            (platform, symbol, target_name, top_k),
        )
        neg_rows = cur.fetchall()

        cur.execute(
            """
            SELECT ml_tree_result_id, used_features, used_features_lookback,
                   transformation, precision_neg, precision_pos
            FROM ml_tree_result
            WHERE platform = %s 
              AND symbol = %s 
              AND target_name = %s
              AND window_size_ms = 30000
              AND methodology = 'decision_tree'
            ORDER BY precision_pos DESC
            LIMIT %s
            """,
            (platform, symbol, target_name, top_k),
        )
        pos_rows = cur.fetchall()

    neg_specialists: list[Specialist] = []
    for row in neg_rows:
        result_id, used_features, lookback, transformation, prec_neg, prec_pos = row
        clf = load_model(conn, result_id)
        if clf is not None:
            neg_specialists.append(
                Specialist(
                    ml_tree_result_id=result_id,
                    clf=clf,
                    used_features=used_features,
                    used_features_lookback=lookback,
                    transformation=transformation,
                    precision_neg=prec_neg,
                    precision_pos=prec_pos,
                )
            )

    pos_specialists: list[Specialist] = []
    for row in pos_rows:
        result_id, used_features, lookback, transformation, prec_neg, prec_pos = row
        clf = load_model(conn, result_id)
        if clf is not None:
            pos_specialists.append(
                Specialist(
                    ml_tree_result_id=result_id,
                    clf=clf,
                    used_features=used_features,
                    used_features_lookback=lookback,
                    transformation=transformation,
                    precision_neg=prec_neg,
                    precision_pos=prec_pos,
                )
            )

    return SpecialistGroup(
        target_name=target_name,
        neg_specialists=neg_specialists,
        pos_specialists=pos_specialists,
    )


def predict_single(
    specialist: Specialist, X: np.ndarray, feature_idx_map: dict[str, list[int]]
) -> int:
    indices: list[int] = []
    for feat_name in specialist.used_features:
        indices.extend(feature_idx_map[feat_name])
    X_selected = X[:, indices]

    X_tr = X_selected
    X_te = X_selected[-1:]
    y_tr = np.zeros(len(X_tr))
    y_te = np.zeros(1)

    X_transformed, _, _, _ = apply_transformation_strategy(
        specialist.transformation, X_selected, X_tr, X_te, y_tr, y_te
    )

    prediction_row = X_transformed[-1:].reshape(1, -1)
    return int(specialist.clf.predict(prediction_row)[0])


def aggregate_predictions(
    specialists: list[Specialist],
    predictions: list[int],
    precision_attr: str,
) -> tuple[int, float, float]:
    if not specialists:
        return 0, 0.0, 0.0

    vote_counts = {0: 0, 1: 0}
    for pred in predictions:
        vote_counts[pred] = vote_counts.get(pred, 0) + 1

    majority_pred = 1 if vote_counts[1] > vote_counts[0] else 0

    agreeing_precisions: list[float] = []
    for spec, pred in zip(specialists, predictions):
        if pred == majority_pred:
            agreeing_precisions.append(getattr(spec, precision_attr))

    avg_confidence = (
        sum(agreeing_precisions) / len(agreeing_precisions) if agreeing_precisions else 0.0
    )
    agreement = len(agreeing_precisions) / len(specialists)

    return majority_pred, avg_confidence, agreement


def predict_target(
    group: SpecialistGroup,
    X: np.ndarray,
    feature_idx_map: dict[str, list[int]],
    prediction_for_timestamp: datetime,
    platform: str,
    symbol: str,
) -> TargetPrediction:
    neg_preds = [predict_single(s, X, feature_idx_map) for s in group.neg_specialists]
    pos_preds = [predict_single(s, X, feature_idx_map) for s in group.pos_specialists]

    neg_prediction, neg_confidence, neg_agreement = aggregate_predictions(
        group.neg_specialists, neg_preds, "precision_neg"
    )
    pos_prediction, pos_confidence, pos_agreement = aggregate_predictions(
        group.pos_specialists, pos_preds, "precision_pos"
    )

    return TargetPrediction(
        prediction_for_timestamp=prediction_for_timestamp,
        platform=platform,
        symbol=symbol,
        target_name=group.target_name,
        neg_prediction=neg_prediction,
        neg_confidence=neg_confidence,
        neg_model_agreement=neg_agreement,
        pos_prediction=pos_prediction,
        pos_confidence=pos_confidence,
        pos_model_agreement=pos_agreement,
    )


def get_distinct_target_names(conn: Connection, platform: str, symbol: str) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT target_name
            FROM ml_tree_result
            WHERE platform = %s 
              AND symbol = %s 
              AND window_size_ms = 30000
              AND methodology = 'decision_tree'
            ORDER BY target_name
            """,
            (platform, symbol),
        )
        return [row[0] for row in cur.fetchall()]

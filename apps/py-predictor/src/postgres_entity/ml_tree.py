from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from typing import Literal

import joblib
from psycopg import Connection

Methodology = Literal["decision_tree", "random_forest"]
Transformation = Literal["z_score", "stepper"]


@dataclass(slots=True)
class MlTreeResult:
    ml_tree_result_id: int | None
    symbol: str
    platform: str
    target_name: str
    window_start: datetime
    window_end: datetime
    window_size_ms: int
    methodology: Methodology
    used_features: list[str]
    used_features_lookback: int
    transformation: Transformation
    training_data_length: int
    training_data_std: float
    recall_score: float
    recall_neg: float
    recall_pos: float
    precision_score: float
    precision_neg: float
    precision_pos: float
    confusion_matrix_tn: int
    confusion_matrix_fp: int
    confusion_matrix_fn: int
    confusion_matrix_tp: int
    created_at: datetime | None = None


@dataclass(slots=True)
class MlTreeArtifact:
    ml_tree_result_id: int
    model_bytes: bytes
    created_at: datetime | None = None


def insert_result(conn: Connection, entity: MlTreeResult) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ml_tree_result (
                symbol, platform, target_name, window_start, window_end, window_size_ms, methodology,
                used_features, used_features_lookback, transformation, training_data_length, training_data_std,
                recall_score, recall_neg, recall_pos,
                precision_score, precision_neg, precision_pos,
                confusion_matrix_tn, confusion_matrix_fp, confusion_matrix_fn, confusion_matrix_tp
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (symbol, platform, window_start, window_end, window_size_ms, target_name, methodology, used_features, transformation)
            DO UPDATE SET
                training_data_length = EXCLUDED.training_data_length,
                training_data_std = EXCLUDED.training_data_std,
                recall_score = EXCLUDED.recall_score,
                recall_neg = EXCLUDED.recall_neg,
                recall_pos = EXCLUDED.recall_pos,
                precision_score = EXCLUDED.precision_score,
                precision_neg = EXCLUDED.precision_neg,
                precision_pos = EXCLUDED.precision_pos,
                confusion_matrix_tn = EXCLUDED.confusion_matrix_tn,
                confusion_matrix_fp = EXCLUDED.confusion_matrix_fp,
                confusion_matrix_fn = EXCLUDED.confusion_matrix_fn,
                confusion_matrix_tp = EXCLUDED.confusion_matrix_tp
            RETURNING ml_tree_result_id
            """,
            (
                entity.symbol,
                entity.platform,
                entity.target_name,
                entity.window_start,
                entity.window_end,
                entity.window_size_ms,
                entity.methodology,
                entity.used_features,
                entity.used_features_lookback,
                entity.transformation,
                entity.training_data_length,
                entity.training_data_std,
                entity.recall_score,
                entity.recall_neg,
                entity.recall_pos,
                entity.precision_score,
                entity.precision_neg,
                entity.precision_pos,
                entity.confusion_matrix_tn,
                entity.confusion_matrix_fp,
                entity.confusion_matrix_fn,
                entity.confusion_matrix_tp,
            ),
        )
        row = cur.fetchone()
        conn.commit()
        return row[0]


def insert_artifact(conn: Connection, result_id: int, model: object) -> int:
    buffer = BytesIO()
    joblib.dump(model, buffer)
    model_bytes = buffer.getvalue()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ml_tree_artifact (ml_tree_result_id, model_bytes)
            VALUES (%s, %s)
            ON CONFLICT (ml_tree_result_id)
            DO UPDATE SET model_bytes = EXCLUDED.model_bytes
            RETURNING ml_tree_result_id
            """,
            (result_id, model_bytes),
        )
        row = cur.fetchone()
        conn.commit()
        return row[0]


def load_model(conn: Connection, result_id: int) -> object | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT model_bytes FROM ml_tree_artifact WHERE ml_tree_result_id = %s",
            (result_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return joblib.load(BytesIO(row[0]))

from dataclasses import dataclass
from datetime import datetime
from typing import Literal


@dataclass(slots=True)
class TargetPrediction:
    prediction_for_timestamp: datetime
    platform: str
    symbol: str
    target_name: str
    neg_prediction: int
    neg_confidence: float
    neg_model_agreement: float
    pos_prediction: int
    pos_confidence: float
    pos_model_agreement: float


@dataclass(slots=True)
class PredictionSummary:
    prediction_for_timestamp: datetime
    platform: str
    symbol: str
    predictions: dict[str, TargetPrediction]

    high_up_range: tuple[float, float] | None
    high_down_range: tuple[float, float] | None
    high_direction: Literal["up", "down", "volatile", "stable"]
    high_confidence: float

    low_up_range: tuple[float, float] | None
    low_down_range: tuple[float, float] | None
    low_direction: Literal["up", "down", "volatile", "stable"]
    low_confidence: float

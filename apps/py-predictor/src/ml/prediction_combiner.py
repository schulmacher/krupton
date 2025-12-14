from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from .prediction_types import PredictionSummary, TargetPrediction


@dataclass(slots=True)
class ParsedPrediction:
    price_type: str
    direction: str
    threshold: float
    prediction: TargetPrediction


def parse_target_name(target_name: str) -> tuple[str, str, float] | None:
    parts = target_name.split("_")
    if len(parts) != 4:
        return None
    if parts[0] != "target":
        return None

    price_type = parts[1]
    direction = parts[2]
    threshold_str = parts[3]

    if price_type not in ("high", "low"):
        return None
    if direction not in ("up", "down"):
        return None
    if not threshold_str.endswith("p"):
        return None

    try:
        threshold = float(threshold_str[:-1])
    except ValueError:
        return None

    return price_type, direction, threshold


def preparse_predictions(
    predictions: dict[str, TargetPrediction],
) -> list[ParsedPrediction]:
    parsed: list[ParsedPrediction] = []
    for target_name, pred in predictions.items():
        result = parse_target_name(target_name)
        if result is not None:
            price_type, direction, threshold = result
            parsed.append(
                ParsedPrediction(
                    price_type=price_type,
                    direction=direction,
                    threshold=threshold,
                    prediction=pred,
                )
            )
    return parsed


def derive_range(
    parsed_predictions: list[ParsedPrediction],
    price_type: str,
    direction: str,
) -> tuple[float, float] | None:
    relevant = [
        (p.threshold, p.prediction)
        for p in parsed_predictions
        if p.price_type == price_type and p.direction == direction
    ]
    relevant.sort(key=lambda x: x[0])

    min_threshold: float | None = None
    max_threshold: float | None = None

    for threshold, pred in relevant:
        if pred.pos_prediction == 1 and pred.pos_model_agreement >= 0.5:
            if min_threshold is None:
                min_threshold = threshold
            max_threshold = threshold

    if min_threshold is None:
        return None

    next_threshold: float | None = None
    for threshold, pred in relevant:
        if threshold > max_threshold:
            next_threshold = threshold
            break

    if next_threshold is not None:
        return (min_threshold, next_threshold)
    return (min_threshold, max_threshold)


def derive_direction(
    up_range: tuple[float, float] | None,
    down_range: tuple[float, float] | None,
) -> Literal["up", "down", "volatile", "stable"]:
    has_up = up_range is not None
    has_down = down_range is not None

    if has_up and has_down:
        return "volatile"
    if has_up:
        return "up"
    if has_down:
        return "down"
    return "stable"


def derive_confidence(
    parsed_predictions: list[ParsedPrediction],
    price_type: str,
    direction: Literal["up", "down", "volatile", "stable"],
) -> float:
    if direction == "stable":
        relevant_preds = [p.prediction for p in parsed_predictions if p.price_type == price_type]
        if not relevant_preds:
            return 0.0
        neg_agreements = [p.neg_model_agreement for p in relevant_preds if p.neg_prediction == 0]
        return sum(neg_agreements) / len(neg_agreements) if neg_agreements else 0.0

    if direction == "volatile":
        return 0.5

    relevant_preds = [
        p.prediction
        for p in parsed_predictions
        if p.price_type == price_type and p.direction == direction
    ]

    if not relevant_preds:
        return 0.0

    pos_confidences = [p.pos_confidence for p in relevant_preds if p.pos_prediction == 1]
    return sum(pos_confidences) / len(pos_confidences) if pos_confidences else 0.0


def combine_threshold_predictions(
    predictions: dict[str, TargetPrediction],
    prediction_for_timestamp: datetime,
    platform: str,
    symbol: str,
) -> PredictionSummary:
    parsed = preparse_predictions(predictions)

    high_up_range = derive_range(parsed, "high", "up")
    high_down_range = derive_range(parsed, "high", "down")
    high_direction = derive_direction(high_up_range, high_down_range)
    high_confidence = derive_confidence(parsed, "high", high_direction)

    low_up_range = derive_range(parsed, "low", "up")
    low_down_range = derive_range(parsed, "low", "down")
    low_direction = derive_direction(low_up_range, low_down_range)
    low_confidence = derive_confidence(parsed, "low", low_direction)

    return PredictionSummary(
        prediction_for_timestamp=prediction_for_timestamp,
        platform=platform,
        symbol=symbol,
        predictions=predictions,
        high_up_range=high_up_range,
        high_down_range=high_down_range,
        high_direction=high_direction,
        high_confidence=high_confidence,
        low_up_range=low_up_range,
        low_down_range=low_down_range,
        low_direction=low_direction,
        low_confidence=low_confidence,
    )

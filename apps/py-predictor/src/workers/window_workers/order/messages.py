from __future__ import annotations

from typing import Literal

import msgspec


class OrderBook(msgspec.Struct):
    type: Literal["update", "snapshot"]
    symbol: str
    bids: list[tuple[str, str]]  # [["price","qty"], ...] as strings
    asks: list[tuple[str, str]]  # [["price","qty"], ...] as strings
    time: int  # epoch ms
    platform: str


order_decoder = msgspec.json.Decoder(type=OrderBook)


class OrderBookAccumulator(msgspec.Struct):
    # duration accounting (time weights)
    sw: float = 0.0  # Σ w

    # mid & microprice (TWAP)
    sw_mid: float = 0.0  # Σ w*mid
    sw_micro: float = 0.0  # Σ w*micro

    # spread
    spread_min: float = msgspec.field(default=float("inf"))
    spread_max: float = msgspec.field(default=float("-inf"))
    sw_spread: float = 0.0  # Σ w*spread

    # time-weighted variance (parallel) for mid
    n_w: float = 0.0  # Σ w  (may equal sw if only mid)
    mean_mid: float = 0.0
    M2_mid: float = 0.0  # Σ w*(x-mean)^2 (incremental)

    # totals & imbalance
    sw_bid: float = 0.0  # Σ w*bid_total
    sw_ask: float = 0.0  # Σ w*ask_total
    sw_imb: float = 0.0  # Σ w*imbalance

    # best sizes
    sw_bid_best_sz: float = 0.0  # Σ w*best_bid_size
    sw_ask_best_sz: float = 0.0  # Σ w*best_ask_size

    # events
    n_updates: int = 0
    n_mid_up: int = 0
    n_mid_down: int = 0
    n_spread_widen: int = 0
    n_spread_tighten: int = 0

    # timestamps (ms)
    t_first: int | None = None
    t_last: int | None = None

    close_mid: float | None = None
    close_spread: float | None = None
    close_bb: float | None = None
    close_ba: float | None = None
    close_bq0: float = 0.0
    close_aq0: float = 0.0
    close_best_imb: float = 0.0


ob_acc_encoder = msgspec.msgpack.Encoder()
ob_acc_decoder = msgspec.msgpack.Decoder(type=OrderBookAccumulator)

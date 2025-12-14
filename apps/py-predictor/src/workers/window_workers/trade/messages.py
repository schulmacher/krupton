from typing import Literal

import msgspec


class Trade(msgspec.Struct):
    symbol: str
    price: str  # keep as string; upstream sends decimal strings
    quantity: str  # same as above
    time: int
    # platformTradeId: int no purpose for this
    platform: str
    side: Literal[0, 1]
    """
    0 - BUY
    1 - SELL
    """
    orderType: Literal[0, 1]
    """
    0 - MARKET
    1 - LIMIT
    """
    misc: str | None = None


trade_decoder = msgspec.json.Decoder(type=Trade)


class TradeWindowAggregate(msgspec.Struct):
    trade_count: int = 0
    """Total number of trades in the window."""

    sum_vol: float = 0.0
    """Sum of traded volumes."""

    sum_pv: float = 0.0
    """Sum of price * volume - numerator for VWAP."""

    buy_vol: float = 0.0
    """Total volume of buy-side trades."""

    sell_vol: float = 0.0
    """Total volume of sell-side trades."""

    sum_price: float = 0.0
    """Sum of trade prices"""

    sum_price2: float = 0.0
    """Sum of squared prices - enables price variance."""

    sum_logret: float = 0.0
    """Sum of log returns - aggregate drift."""

    sum_logret2: float = 0.0
    """Sum of squared log returns - realized variance."""

    sum_logret3: float = 0.0
    """Sum of cubed log returns - skewness component."""

    open: float = 0.0
    """Price of the first trade in the window."""

    high: float = 0.0
    """Highest trade price in the window."""

    low: float = 0.0
    """Lowest trade price in the window."""

    close: float = 0.0
    """Price of the last trade in the window."""

    min_size: float = 0.0
    """Smallest single trade size."""

    max_size: float = 0.0
    """Largest single trade size."""

    first_ts: int = 0
    """Timestamp of the first trade in the window."""

    last_ts: int = 0
    """Timestamp of the last trade in the window."""

    sum_dt: int = 0
    """Sum of inter-trade time differences (Σ Δt) - used for mean rate."""

    max_gap_ms: int = 0
    """Maximum gap between consecutive trades - indicates inactivity periods."""

    # price_sketch: bytes | None = None
    """
    Mergeable quantile sketch (e.g., t-digest) for trade prices
    - preserves price distribution shape.
    """

    # size_sketch: bytes | None = None
    """
    Mergeable quantile sketch for trade sizes
    - preserves size distribution shape.
    """


trade_window_aggregate_encoder = msgspec.msgpack.Encoder()
trade_window_aggregate_decoder = msgspec.msgpack.Decoder(type=TradeWindowAggregate)

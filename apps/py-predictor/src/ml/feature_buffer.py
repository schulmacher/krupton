from dataclasses import dataclass, field

import polars as pl

MAX_BUFFER_SIZE = 5000


@dataclass
class FeatureBuffer:
    platform: str
    symbol: str
    window_size_ms: int
    df: pl.DataFrame = field(default_factory=lambda: pl.DataFrame())

    pending_trade: dict[int, dict] = field(default_factory=dict)
    pending_order: dict[int, dict] = field(default_factory=dict)

    @classmethod
    def from_dataframe(
        cls, df: pl.DataFrame, platform: str, symbol: str, window_size_ms: int
    ) -> "FeatureBuffer":
        filtered = df.filter(
            (pl.col("platform") == platform)
            & (pl.col("symbol") == symbol)
            & (pl.col("window_size_ms") == window_size_ms)
        ).sort("window_end_ms")

        if len(filtered) > MAX_BUFFER_SIZE:
            filtered = filtered.tail(MAX_BUFFER_SIZE)

        return cls(
            platform=platform,
            symbol=symbol,
            window_size_ms=window_size_ms,
            df=filtered,
        )

    def on_trade_window(self, window_end_ms: int, trade_features: dict) -> bool:
        self.pending_trade[window_end_ms] = trade_features
        return self._try_complete_window(window_end_ms)

    def on_order_window(self, window_end_ms: int, order_features: dict) -> bool:
        self.pending_order[window_end_ms] = order_features
        return self._try_complete_window(window_end_ms)

    def _try_complete_window(self, window_end_ms: int) -> bool:
        if window_end_ms not in self.pending_trade:
            return False
        if window_end_ms not in self.pending_order:
            return False

        trade_features = self.pending_trade.pop(window_end_ms)
        order_features = self.pending_order.pop(window_end_ms)

        new_row = pl.DataFrame(
            [
                {
                    "window_end_ms": window_end_ms,
                    "window_size_ms": self.window_size_ms,
                    "platform": self.platform,
                    "symbol": self.symbol,
                    "trade_features": trade_features,
                    "order_features": order_features,
                }
            ]
        )

        new_row = new_row.select(self.df.columns)
        self.df = pl.concat([self.df, new_row], how="vertical_relaxed")

        if len(self.df) > MAX_BUFFER_SIZE:
            self.df = self.df.tail(MAX_BUFFER_SIZE)

        self._cleanup_old_pending(window_end_ms)
        return True

    def _cleanup_old_pending(self, current_window_end_ms: int) -> None:
        cutoff = current_window_end_ms - (self.window_size_ms * 10)
        self.pending_trade = {k: v for k, v in self.pending_trade.items() if k > cutoff}
        self.pending_order = {k: v for k, v in self.pending_order.items() if k > cutoff}

    def get_df(self) -> pl.DataFrame:
        return self.df

    def get_slice(self, n: int) -> pl.DataFrame:
        return self.df.tail(n)

    def get_latest_window_end_ms(self) -> int | None:
        if len(self.df) == 0:
            return None
        return int(self.df["window_end_ms"].max())

    def __len__(self) -> int:
        return len(self.df)

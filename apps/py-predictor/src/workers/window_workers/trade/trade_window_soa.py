from array import array

import numpy as np

from .messages import (
    Trade,
    TradeWindowAggregate,
)


class TradeWindowSoA:
    """Struct-of-arrays with zero-copy NumPy views at flush."""

    __slots__ = ("ts", "price_u", "qty_u", "side", "order_type", "i")

    def __init__(
        self,
        cap=2048,
    ):
        self.ts = array("q", [0]) * cap  # int64
        self.price_u = array("d", [0]) * cap  # double
        self.qty_u = array("d", [0]) * cap  # double
        self.side = array("B", [0]) * cap  # uint8
        self.order_type = array("B", [0]) * cap  # uint8
        self.i = 0

    def append(self, trade: Trade):
        if self.i == len(self.ts):  # grow by 2x
            grow = len(self.ts)
            self.ts.extend([0] * grow)
            self.price_u.extend([0] * grow)
            self.qty_u.extend([0] * grow)
            self.side.extend([0] * grow)
            self.order_type.extend([0] * grow)
        idx = self.i
        self.ts[idx] = trade.time
        self.price_u[idx] = float(trade.price)
        self.qty_u[idx] = float(trade.quantity)
        self.side[idx] = trade.side
        self.order_type[idx] = trade.orderType
        self.i += 1

    def clear(self):
        self.i = 0
        return self

    def np_views(self):
        n = self.i
        ts = np.frombuffer(memoryview(self.ts), dtype=np.int64, count=n)
        p_u = np.frombuffer(memoryview(self.price_u), dtype=np.float64, count=n)
        q_u = np.frombuffer(memoryview(self.qty_u), dtype=np.float64, count=n)
        side = np.frombuffer(memoryview(self.side), dtype=np.uint8, count=n)
        order_type = np.frombuffer(memoryview(self.side), dtype=np.uint8, count=n)
        return ts, p_u, q_u, side, order_type

    def features(
        self,
        window_start: int,
        window_end: int,
    ) -> TradeWindowAggregate:
        # TODO order_typo includes lots of micro structure information
        ts, price, quantity, side, _order_type = self.np_views()
        n = len(price)
        if n == 0:
            return TradeWindowAggregate(
                trade_count=0,
                sum_vol=0.0,
                sum_pv=0.0,
                buy_vol=0.0,
                sell_vol=0.0,
                sum_price=0.0,
                sum_price2=0.0,
                sum_logret=0.0,
                sum_logret2=0.0,
                sum_logret3=0.0,
                open=0.0,
                high=0.0,
                low=0.0,
                close=0.0,
                min_size=0.0,
                max_size=0.0,
                first_ts=window_start,
                last_ts=window_start,
                sum_dt=0,
                max_gap_ms=0,
                # price_sketch=price_sketch,
                # size_sketch=size_sketch,
            )

        # ---- core sums (avoid large temporaries) ----
        sum_vol = float(quantity.sum())
        sum_pv = float(np.dot(price, quantity))  # Σ p*q
        sum_price = float(price.sum())
        sum_price2 = float(np.dot(price, price))  # Σ p^2

        # buy/sell volumes (side: 0=buy, 1=sell); avoid building two masked arrays
        buys = side == 0
        # np.sum with where still creates a small bool mask but avoids a full copy of q
        buy_vol = float(np.sum(quantity, where=buys, initial=0.0))
        sell_vol = float(sum_vol - buy_vol)

        # OHLC / sizes
        open_ = float(price[0])
        high = float(price.max())
        low = float(price.min())
        close = float(price[-1])
        min_size = float(quantity.min())
        max_size = float(quantity.max())

        # timing
        first_ts = int(ts[0])
        last_ts = int(ts[-1])
        if n > 1:
            # For monotonic ts this equals (last - first), but diff handles gaps safely
            dt = np.diff(ts)
            sum_dt = int(dt.sum())
            max_gap_ms = int(dt.max())
        else:
            sum_dt = 0
            max_gap_ms = 0

        # log-return aggregates (safe for tiny prices; skip nonpositive)
        if n > 1:
            logp = np.empty_like(price)
            # set invalids to NaN via where mask
            mask_pos = price > 0.0
            np.log(price, out=logp, where=mask_pos)
            logp[~mask_pos] = np.nan
            lr = np.diff(logp)  # diff keeps NaNs where either side invalid
            # nan-safe sums (treat invalid returns as absent)
            sum_logret = float(np.nansum(lr))
            sum_logret2 = float(np.nansum(lr * lr))
            sum_logret3 = float(np.nansum(lr * lr * lr))
        else:
            sum_logret = sum_logret2 = sum_logret3 = 0.0

        return TradeWindowAggregate(
            trade_count=n,
            sum_vol=sum_vol,
            sum_pv=sum_pv,
            buy_vol=buy_vol,
            sell_vol=sell_vol,
            sum_price=sum_price,
            sum_price2=sum_price2,
            sum_logret=sum_logret,
            sum_logret2=sum_logret2,
            sum_logret3=sum_logret3,
            open=open_,
            high=high,
            low=low,
            close=close,
            min_size=min_size,
            max_size=max_size,
            first_ts=first_ts,
            last_ts=last_ts,
            sum_dt=sum_dt,
            max_gap_ms=max_gap_ms,
            # price_sketch=price_sketch,
            # size_sketch=size_sketch,
        )

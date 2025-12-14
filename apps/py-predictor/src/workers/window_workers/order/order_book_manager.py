from __future__ import annotations

from bisect import bisect_left, insort
from collections.abc import Iterable
from decimal import Decimal

from .messages import OrderBook


class _SideBook:
    """
    Sorted (ascending) by price with O(1) best(), and O(1) totals via rolling aggregates.
    """

    __slots__ = ("prices", "volumes", "side", "total_qty", "total_notional")

    def __init__(self, side: str):
        assert side in ("bid", "ask")
        self.prices: list[Decimal] = []
        self.volumes: dict[Decimal, Decimal] = {}
        self.side = side
        self.total_qty: Decimal = Decimal(0)
        self.total_notional: Decimal = Decimal(0)

    # --- internals ---
    def _add_level(self, price: Decimal, vol: Decimal) -> None:
        """Adjust aggregates when adding a *new* level (price not present before)."""
        self.total_qty += vol
        self.total_notional += price * vol

    def _remove_level(self, price: Decimal, vol: Decimal) -> None:
        """Adjust aggregates when removing an existing level."""
        self.total_qty -= vol
        self.total_notional -= price * vol

    def _update_level(self, price: Decimal, old: Decimal, new: Decimal) -> None:
        """Adjust aggregates when volume at an existing price changes."""
        delta = new - old
        if delta:
            self.total_qty += delta
            self.total_notional += price * delta

    # --- API ---
    def clear(self) -> None:
        self.prices.clear()
        self.volumes.clear()
        self.total_qty = Decimal(0)
        self.total_notional = Decimal(0)

    def set_snapshot(self, levels: Iterable[tuple[str | Decimal, str | Decimal]]) -> None:
        """Replace with snapshot levels (price, volume)."""
        self.clear()
        tmp = []
        for p, v in levels:
            price = p if isinstance(p, Decimal) else Decimal(p)
            vol = v if isinstance(v, Decimal) else Decimal(v)
            if vol != 0:
                tmp.append((price, vol))
        tmp.sort(key=lambda x: x[0])
        self.prices = [p for p, _ in tmp]
        self.volumes = {p: v for p, v in tmp}
        # compute aggregates once
        self.total_qty = sum((v for _, v in tmp), Decimal(0))
        self.total_notional = sum((p * v for p, v in tmp), Decimal(0))

    def apply_level(self, p: str | Decimal, v: str | Decimal) -> None:
        """Insert/update/remove a single level."""
        price = p if isinstance(p, Decimal) else Decimal(p)
        vol = v if isinstance(v, Decimal) else Decimal(v)

        existing = self.volumes.get(price)

        if vol == 0:
            if existing is not None:
                # remove
                del self.volumes[price]
                i = bisect_left(self.prices, price)
                if i < len(self.prices) and self.prices[i] == price:
                    self.prices.pop(i)
                self._remove_level(price, existing)
            return

        if existing is not None:
            # update only dict + aggregates
            self.volumes[price] = vol
            self._update_level(price, existing, vol)
            return

        # new level
        self.volumes[price] = vol
        # edge fast-paths
        if not self.prices:
            self.prices.append(price)
        elif price >= self.prices[-1]:
            self.prices.append(price)
        elif price <= self.prices[0]:
            self.prices.insert(0, price)
        else:
            insort(self.prices, price)
        self._add_level(price, vol)

    def enforce_depth(self, depth: int) -> None:
        """Trim worst prices if we exceed the allowed depth."""
        while len(self.prices) > depth:
            if self.side == "bid":
                worst_price = self.prices[0]
                self.prices.pop(0)
            else:
                worst_price = self.prices[-1]
                self.prices.pop()
            vol = self.volumes.pop(worst_price, None)
            if vol is not None:
                self._remove_level(worst_price, vol)

    def best(self) -> Decimal | None:
        if not self.prices:
            return None
        return self.prices[-1] if self.side == "bid" else self.prices[0]

    def get(self, price: Decimal) -> Decimal | None:
        return self.volumes.get(price)

    def as_sorted_levels(self, reverse: bool = False):
        if reverse:
            return [(p, self.volumes[p]) for p in reversed(self.prices)]
        return [(p, self.volumes[p]) for p in self.prices]

    # --- O(1) aggregates ---
    def total_volume(self) -> Decimal:
        return self.total_qty

    def total_notional_value(self) -> Decimal:
        return self.total_notional

    def vwap(self) -> Decimal | None:
        return (self.total_notional / self.total_qty) if self.total_qty else None


class OrderBookManager:
    """Maintains the live order book state based on snapshots and updates, efficiently."""

    __slots__ = ("bids", "asks", "has_snapshot", "bid_depth", "ask_depth", "last_timestamp")

    def __init__(self):
        self.bids = _SideBook("bid")
        self.asks = _SideBook("ask")
        self.has_snapshot = False
        self.bid_depth: int = 0  # snapshot depth per side
        self.ask_depth: int = 0
        self.last_timestamp: int | None = None

    def reset(self):
        """Clear current state (for a new snapshot or reset)."""
        self.bids.clear()
        self.asks.clear()
        self.has_snapshot = False
        self.bid_depth = 0
        self.ask_depth = 0
        self.last_timestamp = None

    def _apply_snapshot(self, record: OrderBook):
        """Replace entire book with a snapshot."""
        self.bids.set_snapshot(record.bids)
        self.asks.set_snapshot(record.asks)
        self.has_snapshot = True
        self.last_timestamp = record.time
        self.bid_depth = len(self.bids.prices)
        self.ask_depth = len(self.asks.prices)

    def _apply_update(self, record: OrderBook):
        """Apply incremental updates."""
        if not self.has_snapshot:
            return  # ignore updates before first snapshot

        self.last_timestamp = record.time

        # Apply bid/ask deltas
        for p, v in record.bids:
            self.bids.apply_level(p, v)
        for p, v in record.asks:
            self.asks.apply_level(p, v)

        # Enforce snapshot depth per side
        if self.bid_depth:
            self.bids.enforce_depth(self.bid_depth)
        if self.ask_depth:
            self.asks.enforce_depth(self.ask_depth)

    def apply_one(self, record: OrderBook):
        """Apply a single record (snapshot or update)."""
        if record.type == "snapshot":
            self._apply_snapshot(record)
        else:
            self._apply_update(record)

    def apply(self, records: list[OrderBook], *, assume_sorted: bool = True):
        """
        Apply a batch of records.
        Set assume_sorted=False if you are not sure; sorting costs O(n log n).
        """
        if not records:
            return
        if assume_sorted:
            iterable = records
        else:
            iterable = sorted(records, key=lambda r: r.time)
        for record in iterable:
            self.apply_one(record)

    # --- Accessors ---

    def levels(self, side: str, reverse: bool = False) -> list[tuple[Decimal, Decimal]]:
        sb = self.bids if side == "bid" else self.asks
        return sb.as_sorted_levels(reverse=reverse)

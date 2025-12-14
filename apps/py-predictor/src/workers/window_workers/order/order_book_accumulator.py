from src.workers.window_workers.order.messages import OrderBookAccumulator

from .order_book_manager import OrderBookManager


def ob_acc_update_tick(
    acc: "OrderBookAccumulator",
    mgr: "OrderBookManager",
    t_prev_ms: int,
    t_curr_ms: int,
    *,
    prev_mid: float | None,
    prev_spread: float | None,
    time_weighted: bool = True,
) -> tuple[float | None, float | None]:
    """
    Update OrderBookAccumulator using the live data in OrderBookManager for one tick.
    Returns (mid, spread) of the *current* tick for chaining into the next call.
    """
    # ---- weight (dt or 1) ----
    w = max(0, t_curr_ms - t_prev_ms)
    if not time_weighted or w == 0:
        w = 1.0

    # ---- pull instantaneous book stats ----
    bb = mgr.bids.best()
    ba = mgr.asks.best()

    # best-level sizes (0 if side empty)
    bq0 = float(mgr.bids.get(bb)) if bb else 0.0  # type: ignore
    aq0 = float(mgr.asks.get(ba)) if ba else 0.0  # type: ignore
    bb = float(bb) if bb else None
    ba = float(ba) if ba else None

    # mid / spread (only valid if inside market is sane)
    mid = spread = None
    if bb is not None and ba is not None and ba >= bb:
        mid = 0.5 * (ba + bb)
        spread = ba - bb

    # microprice at best (weighted by best-level sizes)
    micro = None
    denom_best = bq0 + aq0
    if ba is not None and bb is not None and mid is not None and denom_best > 0.0:
        micro = (ba * bq0 + bb * aq0) / denom_best  # ba weighted by bid size; bb by ask size

    # ---- accumulate mergeable stats ----
    acc.sw += w
    if mid is not None:
        acc.sw_mid += w * mid
    if micro is not None:
        acc.sw_micro += w * micro
    if spread is not None:
        acc.sw_spread += w * spread
        if spread < acc.spread_min:
            acc.spread_min = spread
        if spread > acc.spread_max:
            acc.spread_max = spread

    # imbalance using *total* depth
    tot_a = mgr.asks.total_volume()
    tot_b = mgr.bids.total_volume()
    tot_a = float(tot_a) if tot_a else None
    tot_b = float(tot_b) if tot_b else None

    if tot_a is not None and tot_b is not None:
        imb = None
        denom_tot = tot_b + tot_a
        if denom_tot > 0.0:
            imb = (tot_b - tot_a) / denom_tot
        acc.sw_bid += w * tot_b
        acc.sw_ask += w * tot_a
        if imb is not None:
            acc.sw_imb += w * imb

    # best-level size TWAPs (useful microstructure signal)
    acc.sw_bid_best_sz += w * bq0
    acc.sw_ask_best_sz += w * aq0

    # weighted variance of mid (mergeable Welford)
    if mid is not None:
        w_old, mean_old = acc.n_w, acc.mean_mid
        w_new = w_old + w
        delta = mid - mean_old
        mean_new = mean_old + (w * delta) / w_new
        acc.M2_mid += w * (mid - mean_new) * (mid - mean_old)
        acc.n_w = w_new
        acc.mean_mid = mean_new

    # ---- event counters ----
    if prev_mid is not None and mid is not None:
        if mid > prev_mid:
            acc.n_mid_up += 1
        elif mid < prev_mid:
            acc.n_mid_down += 1

    if prev_spread is not None and spread is not None:
        if spread > prev_spread:
            acc.n_spread_widen += 1
        elif spread < prev_spread:
            acc.n_spread_tighten += 1

    acc.n_updates += 1

    # ---- timestamps ----
    if acc.t_first is None:
        acc.t_first = t_prev_ms
    acc.t_last = t_curr_ms

    return mid, spread


def ob_acc_close(
    acc: "OrderBookAccumulator",
    mgr: "OrderBookManager",
    *,
    last_mid: float | None = None,
    last_spread: float | None = None,
) -> None:
    """
    Populate close_* fields on the accumulator using the current OrderBookManager state.
    - Uses last_mid/last_spread if provided (from your last obacc_update_tick call).
    - Otherwise derives mid/spread from best bid/ask if the book is sane (ba >= bb).
    """
    # Best prices
    bb_d = mgr.bids.best()
    ba_d = mgr.asks.best()
    acc.close_bb = float(bb_d) if bb_d is not None else None
    acc.close_ba = float(ba_d) if ba_d is not None else None

    # Best sizes (0.0 if side empty)
    acc.close_bq0 = float(mgr.bids.get(bb_d)) if bb_d is not None else 0.0  # type: ignore[arg-type]
    acc.close_aq0 = float(mgr.asks.get(ba_d)) if ba_d is not None else 0.0  # type: ignore[arg-type]

    # Mid / spread (prefer the last tick's values if available)
    close_mid = last_mid
    close_spread = last_spread
    if close_mid is None or close_spread is None:
        bb = acc.close_bb
        ba = acc.close_ba
        if bb is not None and ba is not None and ba >= bb:
            close_mid = 0.5 * (ba + bb)
            close_spread = ba - bb
        else:
            # leave as None if book is empty/crossed
            close_mid = close_mid if close_mid is not None else None
            close_spread = close_spread if close_spread is not None else None

    acc.close_mid = close_mid
    acc.close_spread = close_spread

    # Best-level imbalance at close
    denom = acc.close_bq0 + acc.close_aq0
    acc.close_best_imb = ((acc.close_bq0 - acc.close_aq0) / denom) if denom > 0.0 else 0.0


def ob_acc_reset(acc: OrderBookAccumulator, win_start_ms: int | None = None) -> None:
    """Reset window-local stats; keep carry intact."""
    acc.sw = 0.0
    acc.sw_mid = 0.0
    acc.sw_micro = 0.0
    acc.sw_spread = 0.0

    acc.n_w = 0.0
    acc.mean_mid = 0.0
    acc.M2_mid = 0.0

    acc.sw_bid = 0.0
    acc.sw_ask = 0.0
    acc.sw_imb = 0.0

    acc.sw_bid_best_sz = 0.0
    acc.sw_ask_best_sz = 0.0

    acc.spread_min = float("inf")
    acc.spread_max = float("-inf")

    acc.n_updates = 0
    acc.n_mid_up = 0
    acc.n_mid_down = 0
    acc.n_spread_widen = 0
    acc.n_spread_tighten = 0

    acc.t_first = win_start_ms
    acc.t_last = win_start_ms

    acc.close_mid = None
    acc.close_spread = None
    acc.close_bb = None
    acc.close_ba = None
    acc.close_bq0 = 0.0
    acc.close_aq0 = 0.0
    acc.close_best_imb = 0.0  # or None if you want "unset"

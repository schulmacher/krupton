from __future__ import annotations

import numpy as np

FIBO_LAGS = [2, 3, 5, 8, 13]


def _apply_zscore_normalization(
    X: np.ndarray, X_tr: np.ndarray, X_te: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    n_tr = len(X_tr)
    n_te = len(X_te)

    tr_mean = X_tr.mean(axis=0)
    tr_std = X_tr.std(axis=0, ddof=0)
    tr_std_safe = np.where(tr_std == 0, 1.0, tr_std)
    X_tr_norm = (X_tr - tr_mean) / tr_std_safe

    X_te_norm = np.empty_like(X_te)
    for i in range(n_te):
        rolling_window = X[i + 1 : n_tr + i + 1]
        window_mean = rolling_window.mean(axis=0)
        window_std = rolling_window.std(axis=0, ddof=0)
        std_safe = np.where(window_std == 0, 1.0, window_std)
        X_te_norm[i] = (X_te[i] - window_mean) / std_safe

    return X_tr_norm, X_te_norm


def _create_stepper_features(X: np.ndarray, lags: list[int] = FIBO_LAGS) -> np.ndarray:
    n_samples, n_features = X.shape
    stepper_cols = []

    for lag in lags:
        lagged = np.roll(X, lag, axis=0)
        lagged[:lag] = 0
        up_feature = (X > lagged).astype(np.float64)
        stepper_cols.append(up_feature)

    return np.hstack(stepper_cols)


def _create_diff_features(X: np.ndarray, lags: list[int] = FIBO_LAGS) -> np.ndarray:
    n_samples, n_features = X.shape
    diff_cols = []

    for lag in lags:
        lagged = np.roll(X, lag, axis=0)
        lagged[:lag] = 0
        diff_feature = np.sign(lagged - X)
        diff_cols.append(diff_feature)

    return np.hstack(diff_cols)


def _create_doubled_stepper_features(X: np.ndarray, lags: list[int] = FIBO_LAGS) -> np.ndarray:
    n_samples, n_features = X.shape
    stepper_cols = []

    for lag in lags:
        lag_1x = np.roll(X, lag, axis=0)
        lag_1x[:lag] = 0
        lag_2x = np.roll(X, lag * 2, axis=0)
        lag_2x[: lag * 2] = 0
        up_feature = (lag_1x > lag_2x).astype(np.float64)
        stepper_cols.append(up_feature)

    return np.hstack(stepper_cols)


def _create_doubled_diff_features(X: np.ndarray, lags: list[int] = FIBO_LAGS) -> np.ndarray:
    n_samples, n_features = X.shape
    diff_cols = []

    for lag in lags:
        lag_1x = np.roll(X, lag, axis=0)
        lag_1x[:lag] = 0
        lag_2x = np.roll(X, lag * 2, axis=0)
        lag_2x[: lag * 2] = 0
        diff_feature = np.sign(lag_2x - lag_1x)
        diff_cols.append(diff_feature)

    return np.hstack(diff_cols)


def _apply_zscore_stepper_transformation(
    X: np.ndarray,
    X_tr: np.ndarray,
    X_te: np.ndarray,
    y_tr: np.ndarray,
    y_te: np.ndarray,
    lags: list[int] = FIBO_LAGS,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    X_tr_z, X_te_z = _apply_zscore_normalization(X, X_tr, X_te)

    X_combined_z = np.vstack([X_tr_z, X_te_z])
    X_combined_stepper = _create_stepper_features(X_combined_z, lags)

    n_tr = len(X_tr_z)
    X_tr_stepper = X_combined_stepper[:n_tr]
    X_te_stepper = X_combined_stepper[n_tr:]

    max_lag = max(lags)
    X_tr_out = X_tr_stepper[max_lag:]
    y_tr_out = y_tr[max_lag:]

    return X_tr_out, X_te_stepper, y_tr_out, y_te


def _apply_zscore_diff_transformation(
    X: np.ndarray,
    X_tr: np.ndarray,
    X_te: np.ndarray,
    y_tr: np.ndarray,
    y_te: np.ndarray,
    lags: list[int] = FIBO_LAGS,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    X_tr_z, X_te_z = _apply_zscore_normalization(X, X_tr, X_te)

    X_combined_z = np.vstack([X_tr_z, X_te_z])
    X_combined_diff = _create_diff_features(X_combined_z, lags)

    n_tr = len(X_tr_z)
    X_tr_diff = X_combined_diff[:n_tr]
    X_te_diff = X_combined_diff[n_tr:]

    max_lag = max(lags)
    X_tr_out = X_tr_diff[max_lag:]
    y_tr_out = y_tr[max_lag:]

    return X_tr_out, X_te_diff, y_tr_out, y_te


def _apply_zscore_doubled_stepper_transformation(
    X: np.ndarray,
    X_tr: np.ndarray,
    X_te: np.ndarray,
    y_tr: np.ndarray,
    y_te: np.ndarray,
    lags: list[int] = FIBO_LAGS,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    X_tr_z, X_te_z = _apply_zscore_normalization(X, X_tr, X_te)

    X_combined_z = np.vstack([X_tr_z, X_te_z])
    X_combined_stepper = _create_doubled_stepper_features(X_combined_z, lags)

    n_tr = len(X_tr_z)
    X_tr_stepper = X_combined_stepper[:n_tr]
    X_te_stepper = X_combined_stepper[n_tr:]

    max_lag = max(lags) * 2
    X_tr_out = X_tr_stepper[max_lag:]
    y_tr_out = y_tr[max_lag:]

    return X_tr_out, X_te_stepper, y_tr_out, y_te


def _apply_zscore_doubled_diff_transformation(
    X: np.ndarray,
    X_tr: np.ndarray,
    X_te: np.ndarray,
    y_tr: np.ndarray,
    y_te: np.ndarray,
    lags: list[int] = FIBO_LAGS,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    X_tr_z, X_te_z = _apply_zscore_normalization(X, X_tr, X_te)

    X_combined_z = np.vstack([X_tr_z, X_te_z])
    X_combined_diff = _create_doubled_diff_features(X_combined_z, lags)

    n_tr = len(X_tr_z)
    X_tr_diff = X_combined_diff[:n_tr]
    X_te_diff = X_combined_diff[n_tr:]

    max_lag = max(lags) * 2
    X_tr_out = X_tr_diff[max_lag:]
    y_tr_out = y_tr[max_lag:]

    return X_tr_out, X_te_diff, y_tr_out, y_te


def _apply_zscore_stepper_incl_transformation(
    X: np.ndarray,
    X_tr: np.ndarray,
    X_te: np.ndarray,
    y_tr: np.ndarray,
    y_te: np.ndarray,
    lags: list[int] = FIBO_LAGS,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    X_tr_z, X_te_z = _apply_zscore_normalization(X, X_tr, X_te)

    X_combined_z = np.vstack([X_tr_z, X_te_z])
    X_combined_stepper = _create_stepper_features(X_combined_z, lags)
    X_combined_incl = np.hstack([X_combined_z, X_combined_stepper])

    n_tr = len(X_tr_z)
    X_tr_incl = X_combined_incl[:n_tr]
    X_te_incl = X_combined_incl[n_tr:]

    max_lag = max(lags)
    X_tr_out = X_tr_incl[max_lag:]
    y_tr_out = y_tr[max_lag:]

    return X_tr_out, X_te_incl, y_tr_out, y_te


def _apply_zscore_diff_incl_transformation(
    X: np.ndarray,
    X_tr: np.ndarray,
    X_te: np.ndarray,
    y_tr: np.ndarray,
    y_te: np.ndarray,
    lags: list[int] = FIBO_LAGS,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    X_tr_z, X_te_z = _apply_zscore_normalization(X, X_tr, X_te)

    X_combined_z = np.vstack([X_tr_z, X_te_z])
    X_combined_diff = _create_diff_features(X_combined_z, lags)
    X_combined_incl = np.hstack([X_combined_z, X_combined_diff])

    n_tr = len(X_tr_z)
    X_tr_incl = X_combined_incl[:n_tr]
    X_te_incl = X_combined_incl[n_tr:]

    max_lag = max(lags)
    X_tr_out = X_tr_incl[max_lag:]
    y_tr_out = y_tr[max_lag:]

    return X_tr_out, X_te_incl, y_tr_out, y_te


def _apply_zscore_doubled_stepper_incl_transformation(
    X: np.ndarray,
    X_tr: np.ndarray,
    X_te: np.ndarray,
    y_tr: np.ndarray,
    y_te: np.ndarray,
    lags: list[int] = FIBO_LAGS,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    X_tr_z, X_te_z = _apply_zscore_normalization(X, X_tr, X_te)

    X_combined_z = np.vstack([X_tr_z, X_te_z])
    X_combined_stepper = _create_doubled_stepper_features(X_combined_z, lags)
    X_combined_incl = np.hstack([X_combined_z, X_combined_stepper])

    n_tr = len(X_tr_z)
    X_tr_incl = X_combined_incl[:n_tr]
    X_te_incl = X_combined_incl[n_tr:]

    max_lag = max(lags) * 2
    X_tr_out = X_tr_incl[max_lag:]
    y_tr_out = y_tr[max_lag:]

    return X_tr_out, X_te_incl, y_tr_out, y_te


def _apply_zscore_doubled_diff_incl_transformation(
    X: np.ndarray,
    X_tr: np.ndarray,
    X_te: np.ndarray,
    y_tr: np.ndarray,
    y_te: np.ndarray,
    lags: list[int] = FIBO_LAGS,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    X_tr_z, X_te_z = _apply_zscore_normalization(X, X_tr, X_te)

    X_combined_z = np.vstack([X_tr_z, X_te_z])
    X_combined_diff = _create_doubled_diff_features(X_combined_z, lags)
    X_combined_incl = np.hstack([X_combined_z, X_combined_diff])

    n_tr = len(X_tr_z)
    X_tr_incl = X_combined_incl[:n_tr]
    X_te_incl = X_combined_incl[n_tr:]

    max_lag = max(lags) * 2
    X_tr_out = X_tr_incl[max_lag:]
    y_tr_out = y_tr[max_lag:]

    return X_tr_out, X_te_incl, y_tr_out, y_te


def apply_transformation_strategy(
    strategy: str,
    X: np.ndarray,
    X_tr: np.ndarray,
    X_te: np.ndarray,
    y_tr: np.ndarray,
    y_te: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    if strategy == "zscore":
        X_tr_out, X_te_out = _apply_zscore_normalization(X, X_tr, X_te)
        return X_tr_out, X_te_out, y_tr, y_te
    elif strategy == "zscore_stepper_fibo":
        return _apply_zscore_stepper_transformation(X, X_tr, X_te, y_tr, y_te)
    elif strategy == "zscore_diff_fibo":
        return _apply_zscore_diff_transformation(X, X_tr, X_te, y_tr, y_te)
    elif strategy == "zscore_doubled_stepper_fibo":
        return _apply_zscore_doubled_stepper_transformation(X, X_tr, X_te, y_tr, y_te)
    elif strategy == "zscore_doubled_diff_fibo":
        return _apply_zscore_doubled_diff_transformation(X, X_tr, X_te, y_tr, y_te)
    elif strategy == "zscore_stepper_fibo_incl":
        return _apply_zscore_stepper_incl_transformation(X, X_tr, X_te, y_tr, y_te)
    elif strategy == "zscore_diff_fibo_incl":
        return _apply_zscore_diff_incl_transformation(X, X_tr, X_te, y_tr, y_te)
    elif strategy == "zscore_doubled_stepper_fibo_incl":
        return _apply_zscore_doubled_stepper_incl_transformation(X, X_tr, X_te, y_tr, y_te)
    elif strategy == "zscore_doubled_diff_fibo_incl":
        return _apply_zscore_doubled_diff_incl_transformation(X, X_tr, X_te, y_tr, y_te)
    else:
        raise ValueError(f"Unknown transformation strategy: {strategy}")

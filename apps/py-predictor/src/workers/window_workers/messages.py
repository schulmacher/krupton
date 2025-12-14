import struct
from dataclasses import dataclass
from enum import Enum

# Key layout (big-endian so lexicographic order matches numeric):
WINDOW_KEY_FMT = struct.Struct(">Q8s8sBIB")  # total = 8+8+8+1+4+1 = 30 bytes


class WindowKind(Enum):
    trade = 0
    order = 1


class Platform(Enum):
    binance = 0
    kraken = 1


@dataclass(frozen=True)
class WindowKeyParts:
    window_end_ms: int  # e.g., 1730412345000
    symbol: str  # up to 8 + _ + 8 ASCII chars
    kind: WindowKind
    window_size_ms: int  # e.g., 1000, 60000, ...
    platform: Platform


def _fix8(s: str) -> bytes:
    """ASCII-encode, upper, truncate/pad to 8 bytes with NULs."""
    b = s.upper().encode("ascii", "ignore")[:8]
    return b + b"\x00" * (8 - len(b))


def pack_window_key(k: WindowKeyParts) -> bytes:
    if not (0 <= k.window_end_ms <= 0xFFFFFFFFFFFFFFFF):
        raise ValueError("window_end_ms must fit in uint64")
    if not (0 <= k.window_size_ms <= 0xFFFFFFFF):
        raise ValueError("window_size_ms must fit in uint32")

    s_left, s_right = k.symbol.split("_")

    return WINDOW_KEY_FMT.pack(
        k.window_end_ms,
        _fix8(s_left),
        _fix8(s_right),
        k.kind.value,
        k.window_size_ms,
        k.platform.value,
    )


def _strip8(b: bytes) -> str:
    return b.rstrip(b"\x00").decode("ascii").lower()


def unpack_window_key(key_bytes: bytes) -> WindowKeyParts:
    """Reverse of pack_key (useful for tooling/tests)."""
    (wnd, sl, sr, kind, winms, plat) = WINDOW_KEY_FMT.unpack(key_bytes)
    symbol = f"{_strip8(sl)}_{_strip8(sr)}"

    return WindowKeyParts(
        window_end_ms=wnd,
        symbol=symbol,
        kind=WindowKind(kind),
        window_size_ms=winms,
        platform=Platform(plat),
    )

import struct
from enum import Enum


class Platform(Enum):
    UNKNOWN = 0x00
    BINANCE = 0x01
    KRAKEN = 0x02
    COINBASE = 0x03
    BYBIT = 0x04
    OKX = 0x05


class DataType(Enum):
    UNKNOWN = 0x00
    TRADE = 0x01
    ORDER_BOOK = 0x02


def build_rocksdb_key(
    timestamp_ms: int,
    symbol: str,
    platform: Platform,
    aggregate_type: str,
    data_type: DataType,
) -> bytes:
    """Build a fixed-width 32-byte RocksDB key.

    Structure: [timestampMs:8][platform:1][symbolLeft:8][symbolRight:8][dataType:1][aggregateType:6]
    """
    parts = symbol.split("_", 1)
    symbol_left = parts[0] if len(parts) > 0 else ""
    symbol_right = parts[1] if len(parts) > 1 else ""

    symbol_left_bytes = symbol_left.encode("utf-8")[:8].ljust(8, b"\x00")
    symbol_right_bytes = symbol_right.encode("utf-8")[:8].ljust(8, b"\x00")
    aggregate_type_bytes = aggregate_type.encode("utf-8")[:6].ljust(6, b"\x00")

    key = struct.pack(">Q", timestamp_ms)
    key += struct.pack("B", platform.value)
    key += symbol_left_bytes
    key += symbol_right_bytes
    key += struct.pack("B", data_type.value)
    key += aggregate_type_bytes

    return key


def test_key_size():
    key = build_rocksdb_key(
        timestamp_ms=1698765432000,
        symbol="BTC_USDT",
        platform=Platform.BINANCE,
        aggregate_type="1s",
        data_type=DataType.TRADE,
    )

    assert len(key) == 32, f"Key should be 32 bytes, got {len(key)}"
    print(f"✓ Key size correct: {len(key)} bytes")
    print(f"  Key hex: {key.hex()}")


def test_key_ordering():
    key1 = build_rocksdb_key(
        timestamp_ms=1000,
        symbol="BTC_USDT",
        platform=Platform.BINANCE,
        aggregate_type="1s",
        data_type=DataType.TRADE,
    )

    key2 = build_rocksdb_key(
        timestamp_ms=2000,
        symbol="BTC_USDT",
        platform=Platform.BINANCE,
        aggregate_type="1s",
        data_type=DataType.TRADE,
    )

    key3 = build_rocksdb_key(
        timestamp_ms=2000,
        symbol="ETH_USDT",
        platform=Platform.BINANCE,
        aggregate_type="1s",
        data_type=DataType.TRADE,
    )

    assert key1 < key2, "Earlier timestamp should sort before later"
    assert key2 < key3, "Same timestamp, BTC should sort before ETH"

    print("✓ Key ordering correct")
    print(f"  key1 (ts=1000, BTC): {key1.hex()}")
    print(f"  key2 (ts=2000, BTC): {key2.hex()}")
    print(f"  key3 (ts=2000, ETH): {key3.hex()}")


def test_key_components():
    key = build_rocksdb_key(
        timestamp_ms=1698765432000,
        symbol="XRP_USDT",
        platform=Platform.KRAKEN,
        aggregate_type="5m",
        data_type=DataType.ORDER_BOOK,
    )

    timestamp = struct.unpack(">Q", key[0:8])[0]
    platform = key[8]
    symbol_left = key[9:17].rstrip(b"\x00").decode("utf-8")
    symbol_right = key[17:25].rstrip(b"\x00").decode("utf-8")
    data_type = key[25]
    aggregate_type = key[26:32].rstrip(b"\x00").decode("utf-8")

    assert timestamp == 1698765432000
    assert platform == Platform.KRAKEN.value
    assert symbol_left == "XRP"
    assert symbol_right == "USDT"
    assert data_type == DataType.ORDER_BOOK.value
    assert aggregate_type == "5m"

    print("✓ Key components parsed correctly")
    print(f"  timestamp: {timestamp}")
    print(f"  platform: {platform} (KRAKEN)")
    print(f"  symbol: {symbol_left}_{symbol_right}")
    print(f"  data_type: {data_type} (ORDER_BOOK)")
    print(f"  aggregate_type: {aggregate_type}")


if __name__ == "__main__":
    test_key_size()
    print()
    test_key_ordering()
    print()
    test_key_components()
    print()
    print("All tests passed! ✅")

import struct

HEADER_SIZE = 8


# def pack(buf, offset: int, key: bytes, value: bytes):
#     key_len = len(key)
#     value_len = len(value)
#     header = struct.pack("<II", key_len, value_len)

#     buf[offset : offset + HEADER_SIZE] = header
#     offset += HEADER_SIZE
#     buf[offset : offset + key_len] = key
#     offset += key_len
#     buf[offset : offset + value_len] = value
#     offset += value_len

#     return offset


def pack(key: bytes, value: bytes) -> bytes:
    """Pack key and value into a single bytes object with header"""
    header = struct.pack("<II", len(key), len(value))

    return header + key + value


def unpack(buf, offset: int):
    key_len, json_len = struct.unpack("<II", buf[offset : offset + HEADER_SIZE])

    offset += HEADER_SIZE
    key_bytes = bytes(buf[offset : offset + key_len])
    offset += key_len
    value_bytes = bytes(buf[offset : offset + json_len])
    offset += json_len

    return (offset, key_bytes, value_bytes)

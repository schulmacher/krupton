import struct
from typing import Any

OFFSET = 0
METRICS = 1

HEADER_FMT = "<BI"
HEADER_SIZE = struct.calcsize(HEADER_FMT)

PAYLOAD_FORMATS = {
    OFFSET: "<q",
}


def serialize(msg_type: int, payload: int | str | bytes) -> bytes:
    """Serialize a message depending on its type."""
    if msg_type == OFFSET:
        payload_bytes = struct.pack(PAYLOAD_FORMATS[OFFSET], int(payload))
    elif msg_type == METRICS:
        if isinstance(payload, str):
            payload_bytes = payload.encode("utf-8")
        elif isinstance(payload, bytes):
            payload_bytes = payload
        else:
            raise TypeError("METRICS payload must be str or bytes")
    else:
        raise ValueError(f"Unknown message type: {msg_type}")

    header = struct.pack(HEADER_FMT, msg_type, len(payload_bytes))
    return header + payload_bytes


def parse(buffer: bytes) -> tuple[int, Any]:
    if len(buffer) < HEADER_SIZE:
        raise ValueError("Buffer too small for header")

    msg_type, payload_len = struct.unpack(HEADER_FMT, buffer[:HEADER_SIZE])
    end = HEADER_SIZE + payload_len
    if len(buffer) < end:
        raise ValueError("Buffer does not contain full message")

    raw_payload = buffer[HEADER_SIZE:end]

    if msg_type == OFFSET:
        payload = struct.unpack(PAYLOAD_FORMATS[OFFSET], raw_payload)[0]
    elif msg_type == METRICS:
        payload = raw_payload.decode("utf-8")
    else:
        payload = raw_payload

    return msg_type, payload

import struct
from multiprocessing import shared_memory

from . import shared_bytes


def init(shm_data_name: str | None, shm_index_name: str | None):
    # ca 10k trade windows can fit 1024KB/1MB
    buf_size = 2**22  # 4MB
    mask = buf_size - 1
    shm_data = (
        shared_memory.SharedMemory(
            create=True, size=buf_size + ((2**12) * 4)
        )  # 4 fs page sizes, can fit about 40 trade windows
        if shm_data_name is None
        else shared_memory.SharedMemory(name=shm_data_name)
    )
    shm_index = (
        shared_memory.SharedMemory(create=True, size=24)
        if shm_index_name is None
        else shared_memory.SharedMemory(name=shm_index_name)
    )

    return (shm_data, shm_index, buf_size, mask)


def write(data_buf, index_buf, mask: int, key: bytes, value: bytes):
    r_from_offset, end_marker, w_to_offset = read_index(index_buf)

    if end_marker > 0:
        # Cannot write to wheren the reader has not read from
        if w_to_offset >= r_from_offset:
            return False  # Full

    msg = shared_bytes.pack(key, value)
    w_to_offset_new = w_to_offset + len(msg)

    if end_marker > 0:
        # Cannot write to where the reader has not read from
        # > beacuse the end byte is exclusive
        if w_to_offset_new > r_from_offset:
            return False  # Full

    data_buf[w_to_offset:w_to_offset_new] = msg

    w_to_offset_new_masked = w_to_offset_new & mask

    write_offset_w(
        index_buf=index_buf,
        w_to_offset=w_to_offset_new_masked,
        end_marker=w_to_offset_new if w_to_offset_new > w_to_offset_new_masked else None,
    )

    return True


def read(data_buf, index_buf, mask: int):
    r_from_offset, end_marker, w_to_offset = read_index(index_buf)

    # Cannot read from where the writer has not writeen yet
    if (r_from_offset == w_to_offset) and (end_marker == -1 or end_marker == 0):
        return None  # Empty

    offset, key_bytes, value_bytes = shared_bytes.unpack(data_buf, r_from_offset)
    next_r_from_offset = offset & mask

    write_offset_r(
        index_buf=index_buf,
        r_from_offset=next_r_from_offset,
        reset_marker=r_from_offset >= next_r_from_offset,
    )

    return (key_bytes, value_bytes)


INDEX_FMT = "<IiIIiI"
"""
PS! DO NOT CHANGE THIS! HELL WILL BREAK LOOSE AND CROSS THREAD LOCKING HAS TO BE IMPLEMENTED
"""
INDEX_SIZE = struct.calcsize(INDEX_FMT)


def read_index(index_buf) -> tuple[int, int, int]:
    r"""
    r_from_offset
        next position to read from
    w_end_marker
        -1 if reader wrapped
        0 if writter did not wrap yet
        \>0 position from where writter went back to 0
    w_to_offset
        next position to write to (cannot read from here - nothing yet)

    returns (r_from_offset, w_end_marker, w_to_offset)
    """

    # Fix for torn read writes using redundant consistency check/double-write validation
    while True:
        r1, m1, w1, r2, m2, w2 = struct.unpack_from(INDEX_FMT, index_buf, 0)
        if r1 == r2 and m1 == m2 and w1 == w2:
            return (r1, m1, w1)


def write_offset_r(index_buf, r_from_offset: int, reset_marker: bool) -> None:
    # Primary half
    struct.pack_into("<I", index_buf, 0, r_from_offset)
    if reset_marker:
        struct.pack_into("<i", index_buf, 4, -1)

    # Redundant half
    struct.pack_into("<I", index_buf, 12, r_from_offset)
    if reset_marker:
        struct.pack_into("<i", index_buf, 16, -1)


def write_offset_w(index_buf, w_to_offset: int, end_marker: int | None) -> None:
    if end_marker is not None:
        struct.pack_into("<iI", index_buf, 4, end_marker, w_to_offset)
        struct.pack_into("<iI", index_buf, 16, end_marker, w_to_offset)
    else:
        struct.pack_into("<I", index_buf, 8, w_to_offset)
        struct.pack_into("<I", index_buf, 20, w_to_offset)

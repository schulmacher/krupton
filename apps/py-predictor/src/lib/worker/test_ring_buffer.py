from . import ring_buffer

"""
Assume always that more than 1 value can be written to the buffer before it is full
"""


def test_ring_buffer_operations():
    buf_size = 128
    mask = 63
    data_buf = bytearray(buf_size)
    index_buf = bytearray(32)

    """
    Read from empty buffer
    """
    result = ring_buffer.read(data_buf, index_buf, mask)
    assert result is None

    """
    Write first and expect correct write offset
    """
    key1 = b"12345678"
    value1 = b"1234567812345678"
    written = ring_buffer.write(data_buf, index_buf, mask, key1, value1)
    r_from_offset, marker, w_to_offset = ring_buffer.read_index(index_buf)
    assert r_from_offset == 0
    assert marker == 0
    assert w_to_offset == 32  # Write offset set to next write start
    assert written is True

    """
    Exactly fill the buffer based on mask
    """
    key2 = b"abcdefgh"
    value2 = b"abcdefghabcdefgh"
    written = ring_buffer.write(data_buf, index_buf, mask, key2, value2)
    r_from_offset, marker, w_to_offset = ring_buffer.read_index(index_buf)
    assert r_from_offset == 0
    assert marker == 64  # No more messages after 64
    assert w_to_offset == 0  # Next write at 0
    assert written is True

    """
    Try to add more bytes when buffer is full
    """
    key_noop = b"ijklmnop"
    value_noop = b"ijklmnopijop"
    written = ring_buffer.write(data_buf, index_buf, mask, key_noop, value_noop)
    r_from_offset, marker, w_to_offset = ring_buffer.read_index(index_buf)
    assert r_from_offset == 0
    assert marker == 64
    assert w_to_offset == 0
    assert written is False

    """
    Try to read bytes from beginning, expect read offset set correctly
    """
    result = ring_buffer.read(data_buf, index_buf, mask)
    r_from_offset, marker, w_to_offset = ring_buffer.read_index(index_buf)
    assert r_from_offset == 32  # Read offset set to next read start
    assert marker == 64
    assert w_to_offset == 0
    assert result is not None
    assert result == (key1, value1)
    result = ring_buffer.read(data_buf, index_buf, mask)
    r_from_offset, marker, w_to_offset = ring_buffer.read_index(index_buf)
    assert r_from_offset == 0  # Read offset set to next read start
    assert marker == -1
    assert w_to_offset == 0
    assert result is not None
    assert result == (key2, value2)

    """
    Try to read from empty buffer
    """
    result = ring_buffer.read(data_buf, index_buf, mask)
    r_from_offset, marker, w_to_offset = ring_buffer.read_index(index_buf)
    # Assert nothing changed in index
    assert r_from_offset == 0
    assert marker == -1
    assert w_to_offset == 0
    assert result is None

    """
    Insert two records which overflow the logical buffer (40 + 40) >= 64
    Expect second one also written because the start 40 < 64
    """
    key3 = b"aaaaaaaa"
    value3 = b"bbbbbbbbbbbbbbbbbbbbbbbb"
    written = ring_buffer.write(data_buf, index_buf, mask, key3, value3)
    r_from_offset, marker, w_to_offset = ring_buffer.read_index(index_buf)
    assert r_from_offset == 0
    assert marker == -1
    assert w_to_offset == 40
    assert written is True

    key4 = b"cccccccc"
    value4 = b"dddddddddddddddddddddddd"
    written = ring_buffer.write(data_buf, index_buf, mask, key4, value4)
    r_from_offset, marker, w_to_offset = ring_buffer.read_index(index_buf)
    assert r_from_offset == 0
    assert marker == 80
    assert w_to_offset == 16  # 80 & 63 = 16
    assert written is True

    """
    If the next start offset (w_to_offset) > 32 (buffer size) then dont allow insert
    """
    key_noop = b"x"
    value_noop = b"y"
    written = ring_buffer.write(data_buf, index_buf, mask, key_noop, value_noop)
    assert r_from_offset == 0
    assert marker == 80
    assert w_to_offset == 16
    assert written is False

    """
    Try to read and then write 1 byte past the reader offest
    """
    result = ring_buffer.read(data_buf, index_buf, mask)
    r_from_offset, marker, w_to_offset = ring_buffer.read_index(index_buf)
    assert r_from_offset == 40
    assert marker == 80
    assert w_to_offset == 16  # 40 - 16 = 24 until reader
    assert result == (key3, value3)

    # 8 + 8 + 8 = 24 + " " = 25
    key_noop = b"88888888"
    value_noop = b"88888888 "
    written = ring_buffer.write(data_buf, index_buf, mask, key_noop, value_noop)
    r_from_offset, marker, w_to_offset = ring_buffer.read_index(index_buf)
    assert r_from_offset == 40
    assert marker == 80
    assert w_to_offset == 16
    assert written is False

    """
    Try (and allow) write exactly to the point reader is going to read from
    """
    key5 = b"88888888"
    value5 = b"88888888"
    written = ring_buffer.write(data_buf, index_buf, mask, key5, value5)
    index = ring_buffer.read_index(index_buf)
    assert index == (40, 80, 40)
    assert written is True

    written = ring_buffer.write(data_buf, index_buf, mask, key_noop, value_noop)
    index = ring_buffer.read_index(index_buf)
    assert index == (40, 80, 40)
    assert written is False

    """
    Try to read everything
    """
    result = ring_buffer.read(data_buf, index_buf, mask)
    index = ring_buffer.read_index(index_buf)
    assert result == (key4, value4)
    assert index == (16, -1, 40)

    result = ring_buffer.read(data_buf, index_buf, mask)
    index = ring_buffer.read_index(index_buf)
    assert result == (key5, value5)
    assert index == (40, -1, 40)

    result = ring_buffer.read(data_buf, index_buf, mask)
    index = ring_buffer.read_index(index_buf)
    assert result is None
    assert index == (40, -1, 40)

    result = ring_buffer.read(data_buf, index_buf, mask)
    index = ring_buffer.read_index(index_buf)
    assert result is None
    assert index == (40, -1, 40)

    key6 = b"8888888 8888888 8888888 "
    value6 = b"88888888 8888888 8888888 "
    written = ring_buffer.write(data_buf, index_buf, mask, key6, value6)
    index = ring_buffer.read_index(index_buf)
    assert written is True
    assert index == (40, 97, 33)

    result = ring_buffer.read(data_buf, index_buf, mask)
    index = ring_buffer.read_index(index_buf)
    assert result == (key6, value6)
    assert index == (33, -1, 33)

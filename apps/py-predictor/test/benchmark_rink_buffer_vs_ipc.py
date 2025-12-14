import time
from multiprocessing import Process, Queue
from multiprocessing.shared_memory import SharedMemory

import msgspec

from src.lib.worker import ring_buffer
from src.workers.window_workers.trade.messages import (
    TradeWindowAggregate,
    trade_window_aggregate_encoder,
)


def create_mock_trade_aggregate(idx: int) -> TradeWindowAggregate:
    return TradeWindowAggregate(
        trade_count=150 + (idx % 50),
        sum_vol=25000.5 + idx,
        sum_pv=1500000.75 + idx * 10,
        buy_vol=12500.25 + idx,
        sell_vol=12500.25 + idx,
        sum_price=60000.0 + idx,
        sum_price2=3600000000.0 + idx * 100,
        sum_logret=0.001 + (idx % 10) * 0.0001,
        sum_logret2=0.00001 + (idx % 10) * 0.000001,
        sum_logret3=0.0000001 + (idx % 10) * 0.00000001,
        open=59900.0 + idx,
        high=60100.0 + idx,
        low=59800.0 + idx,
        close=60000.0 + idx,
        min_size=0.001,
        max_size=10.5,
        first_ts=1735000000000 + idx * 1000,
        last_ts=1735000030000 + idx * 1000,
        sum_dt=30000,
        max_gap_ms=500,
    )


def ring_buffer_producer(shm_data_name: str, shm_index_name: str, mask: int, num: int):
    shm_data = SharedMemory(name=shm_data_name)
    shm_index = SharedMemory(name=shm_index_name)
    data_buf = shm_data.buf
    index_buf = shm_index.buf

    key_base = b"btc_usdt"

    for i in range(num):
        agg = create_mock_trade_aggregate(i)
        value_bytes = trade_window_aggregate_encoder.encode(agg)
        key_bytes = key_base + i.to_bytes(8, "big")

        while not ring_buffer.write(data_buf, index_buf, mask, key_bytes, value_bytes):
            time.sleep(0.0001)

    shm_data.close()
    shm_index.close()


def ring_buffer_consumer(shm_data_name: str, shm_index_name: str, mask: int, num: int):
    shm_data = SharedMemory(name=shm_data_name)
    shm_index = SharedMemory(name=shm_index_name)
    data_buf = shm_data.buf
    index_buf = shm_index.buf

    received = 0
    while received < num:
        result = ring_buffer.read(data_buf, index_buf, mask)
        if result is not None:
            received += 1
        else:
            time.sleep(0.0001)

    shm_data.close()
    shm_index.close()


def queue_bytes_producer(queue: Queue, num: int):
    for i in range(num):
        agg = create_mock_trade_aggregate(i)
        value_bytes = trade_window_aggregate_encoder.encode(agg)
        key_bytes = b"btc_usdt" + i.to_bytes(8, "big")
        queue.put((key_bytes, value_bytes))


def queue_bytes_consumer(queue: Queue, num: int):
    received = 0
    while received < num:
        try:
            _key, _value = queue.get(timeout=1)
            received += 1
        except Exception:
            break


def queue_objects_producer(queue: Queue, num: int):
    for i in range(num):
        agg = create_mock_trade_aggregate(i)
        key = f"btc_usdt_{i}"
        queue.put((key, agg))


def queue_objects_consumer(queue: Queue, num: int):
    received = 0
    while received < num:
        try:
            _key, _agg = queue.get(timeout=1)
            received += 1
        except Exception:
            break


def benchmark_ring_buffer(num_messages: int):
    shm_data, shm_index, size, mask = ring_buffer.init(shm_data_name=None, shm_index_name=None)

    start = time.time()

    prod_proc = Process(
        target=ring_buffer_producer, args=(shm_data.name, shm_index.name, mask, num_messages)
    )
    cons_proc = Process(
        target=ring_buffer_consumer, args=(shm_data.name, shm_index.name, mask, num_messages)
    )

    prod_proc.start()
    cons_proc.start()

    prod_proc.join()
    cons_proc.join()

    elapsed = time.time() - start

    shm_data.close()
    shm_data.unlink()
    shm_index.close()
    shm_index.unlink()

    return elapsed


def benchmark_queue_bytes(num_messages: int):
    q = Queue(maxsize=1000)

    start = time.time()

    prod_proc = Process(target=queue_bytes_producer, args=(q, num_messages))
    cons_proc = Process(target=queue_bytes_consumer, args=(q, num_messages))

    prod_proc.start()
    cons_proc.start()

    prod_proc.join()
    cons_proc.join()

    elapsed = time.time() - start

    q.close()
    q.join_thread()

    return elapsed


def benchmark_queue_objects(num_messages: int):
    q = Queue(maxsize=1000)

    start = time.time()

    prod_proc = Process(target=queue_objects_producer, args=(q, num_messages))
    cons_proc = Process(target=queue_objects_consumer, args=(q, num_messages))

    prod_proc.start()
    cons_proc.start()

    prod_proc.join()
    cons_proc.join()

    elapsed = time.time() - start

    q.close()
    q.join_thread()

    return elapsed


def run_benchmarks():
    message_counts = [100_000, 1_000_000, 10_000_000]

    print("=" * 80)
    print("IPC Mechanism Benchmark: Ring Buffer vs multiprocessing.Queue")
    print("=" * 80)
    print()

    sample_agg = create_mock_trade_aggregate(0)
    sample_bytes = trade_window_aggregate_encoder.encode(sample_agg)
    print(f"Message size: {len(sample_bytes)} bytes (MessagePack-encoded TradeWindowAggregate)")
    print()

    for num_messages in message_counts:
        print(f"\n{'=' * 80}")
        print(f"Benchmark: {num_messages:,} messages")
        print(f"{'=' * 80}\n")

        print("1. Ring Buffer (lock-free shared memory)")
        elapsed_ring = benchmark_ring_buffer(num_messages)
        throughput_ring = num_messages / elapsed_ring
        latency_ring = (elapsed_ring / num_messages) * 1_000_000
        print(f"   Time: {elapsed_ring:.3f}s")
        print(f"   Throughput: {throughput_ring:,.0f} msg/s")
        print(f"   Avg latency: {latency_ring:.2f} μs/msg")
        print()

        print("2. multiprocessing.Queue with pre-serialized bytes")
        elapsed_queue_bytes = benchmark_queue_bytes(num_messages)
        throughput_queue_bytes = num_messages / elapsed_queue_bytes
        latency_queue_bytes = (elapsed_queue_bytes / num_messages) * 1_000_000
        print(f"   Time: {elapsed_queue_bytes:.3f}s")
        print(f"   Throughput: {throughput_queue_bytes:,.0f} msg/s")
        print(f"   Avg latency: {latency_queue_bytes:.2f} μs/msg")
        print()

        print("3. multiprocessing.Queue with msgspec.Struct objects (pickle)")
        elapsed_queue_objects = benchmark_queue_objects(num_messages)
        throughput_queue_objects = num_messages / elapsed_queue_objects
        latency_queue_objects = (elapsed_queue_objects / num_messages) * 1_000_000
        print(f"   Time: {elapsed_queue_objects:.3f}s")
        print(f"   Throughput: {throughput_queue_objects:,.0f} msg/s")
        print(f"   Avg latency: {latency_queue_objects:.2f} μs/msg")
        print()

        print("Performance Comparison:")
        print(
            f"   Ring Buffer is {elapsed_queue_bytes / elapsed_ring:.1f}x faster than Queue+bytes"
        )
        print(
            f"   Ring Buffer is {elapsed_queue_objects / elapsed_ring:.1f}x faster than Queue+objects"
        )
        print(
            f"   Queue+bytes is {elapsed_queue_objects / elapsed_queue_bytes:.1f}x faster than Queue+objects"
        )
        print()

        print("Latency Comparison:")
        print(f"   Ring Buffer: {latency_ring:.2f} μs/msg (baseline)")
        print(
            f"   Queue+bytes: {latency_queue_bytes:.2f} μs/msg ({latency_queue_bytes / latency_ring:.1f}x slower)"
        )
        print(
            f"   Queue+objects: {latency_queue_objects:.2f} μs/msg ({latency_queue_objects / latency_ring:.1f}x slower)"
        )

    print("\n" + "=" * 80)
    print("Benchmark Complete")
    print("=" * 80)


if __name__ == "__main__":
    run_benchmarks()

"""
================================================================================
Benchmark: 100,000 messages
================================================================================

1. Ring Buffer (lock-free shared memory)
   Time: 0.215s
   Throughput: 464,576 msg/s
   Avg latency: 2.15 μs/msg

2. multiprocessing.Queue with pre-serialized bytes
   Time: 0.639s
   Throughput: 156,510 msg/s
   Avg latency: 6.39 μs/msg

3. multiprocessing.Queue with msgspec.Struct objects (pickle)
   Time: 0.890s
   Throughput: 112,399 msg/s
   Avg latency: 8.90 μs/msg

Performance Comparison:
   Ring Buffer is 3.0x faster than Queue+bytes
   Ring Buffer is 4.1x faster than Queue+objects
   Queue+bytes is 1.4x faster than Queue+objects

Latency Comparison:
   Ring Buffer: 2.15 μs/msg (baseline)
   Queue+bytes: 6.39 μs/msg (3.0x slower)
   Queue+objects: 8.90 μs/msg (4.1x slower)

================================================================================
Benchmark: 1,000,000 messages
================================================================================

1. Ring Buffer (lock-free shared memory)
   Time: 1.675s
   Throughput: 597,054 msg/s
   Avg latency: 1.67 μs/msg

2. multiprocessing.Queue with pre-serialized bytes
   Time: 5.945s
   Throughput: 168,200 msg/s
   Avg latency: 5.95 μs/msg

3. multiprocessing.Queue with msgspec.Struct objects (pickle)
   Time: 8.426s
   Throughput: 118,679 msg/s
   Avg latency: 8.43 μs/msg

Performance Comparison:
   Ring Buffer is 3.5x faster than Queue+bytes
   Ring Buffer is 5.0x faster than Queue+objects
   Queue+bytes is 1.4x faster than Queue+objects

Latency Comparison:
   Ring Buffer: 1.67 μs/msg (baseline)
   Queue+bytes: 5.95 μs/msg (3.5x slower)
   Queue+objects: 8.43 μs/msg (5.0x slower)

================================================================================
Benchmark: 10,000,000 messages
================================================================================

1. Ring Buffer (lock-free shared memory)
   Time: 16.358s
   Throughput: 611,310 msg/s
   Avg latency: 1.64 μs/msg

2. multiprocessing.Queue with pre-serialized bytes
   Time: 59.638s
   Throughput: 167,678 msg/s
   Avg latency: 5.96 μs/msg

3. multiprocessing.Queue with msgspec.Struct objects (pickle)
   Time: 87.087s
   Throughput: 114,828 msg/s
   Avg latency: 8.71 μs/msg

Performance Comparison:
   Ring Buffer is 3.6x faster than Queue+bytes
   Ring Buffer is 5.3x faster than Queue+objects
   Queue+bytes is 1.5x faster than Queue+objects

Latency Comparison:
   Ring Buffer: 1.64 μs/msg (baseline)
   Queue+bytes: 5.96 μs/msg (3.6x slower)
   Queue+objects: 8.71 μs/msg (5.3x slower)

================================================================================
Benchmark Complete
================================================================================
"""

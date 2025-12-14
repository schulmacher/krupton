import asyncio
import json
import struct
import time
from multiprocessing import Process

from . import ring_buffer  # and messages if you still need it

# Fixed-size binary key schema: timestamp (Q=8B), platform_id (I=4B)
KEY_FMT = "<QI"
KEY_SIZE = struct.calcsize(KEY_FMT)

LOOP_SIZE = 15
NUM_WORKERS = 2


async def worker_async(shm_data_name: str, shm_index_name: str, platform_id: int, worker_id: int):
    """
    Runs inside a separate process. Uses asyncio to simulate async work & backoff.
    """
    shm_data, shm_index, size, mask = ring_buffer.init(
        shm_data_name=shm_data_name, shm_index_name=shm_index_name
    )
    data_buf = shm_data.buf
    index_buf = shm_index.buf
    if data_buf is None or index_buf is None:
        raise RuntimeError("Shared buffer does not exist")

    try:
        for i in range(LOOP_SIZE):
            timestamp_ms = int(time.time() * 1000)
            key_bytes = struct.pack(KEY_FMT, timestamp_ms, platform_id)
            payload = {"symbol": "BTC_USDT", "value": i, "worker": worker_id}
            json_bytes = json.dumps(payload).encode("utf-8")

            written = ring_buffer.write(
                data_buf=data_buf, index_buf=index_buf, mask=mask, key=key_bytes, value=json_bytes
            )
            while not written:
                print(i, f"[worker {worker_id}] Full")
                await asyncio.sleep(0.2)
                written = ring_buffer.write(
                    data_buf=data_buf,
                    index_buf=index_buf,
                    mask=mask,
                    key=key_bytes,
                    value=json_bytes,
                )

            print(i, f"[worker {worker_id}] wrote v={i}")
            await asyncio.sleep(1 if worker_id % 2 == 0 else 0.2)
    finally:
        shm_data.close()
        shm_index.close()


def worker_process(shm_data_name: str, shm_index_name: str, platform_id: int, worker_id: int):
    # entrypoint for Process; run the async worker
    asyncio.run(worker_async(shm_data_name, shm_index_name, platform_id, worker_id))


async def read_worker_loop(worker_ctx):
    """
    Asynchronously polls a single worker's ring buffer until it has read LOOP_SIZE items.
    Uses small async sleeps to avoid blocking the event loop.
    """
    wid = worker_ctx["id"]
    mask = worker_ctx["mask"]
    data_buf = worker_ctx["shm_data"].buf
    index_buf = worker_ctx["shm_index"].buf
    reads = 0

    while reads < LOOP_SIZE:
        tup = ring_buffer.read(data_buf=data_buf, index_buf=index_buf, mask=mask)
        if tup is None:
            print(f"{reads} [MAIN] (worker_{wid}) empty")
            # No data right now; yield control briefly
            await asyncio.sleep(0.2 if wid % 2 == 0 else 1)
            continue

        key_bytes, value_bytes = tup
        ts, platform_id = struct.unpack(KEY_FMT, key_bytes)
        payload = json.loads(value_bytes)
        reads += 1

        print(f"{reads} [MAIN] (worker={payload.get('worker')}) read v={payload['value']} ")
        print("")

    worker_ctx["reads"] = reads
    worker_ctx["done"] = True


async def main_async():
    # Create independent shared memories and worker processes
    workers = []
    procs: list[Process] = []

    for wid in range(NUM_WORKERS):
        shm_data, shm_index, size, mask = ring_buffer.init(shm_data_name=None, shm_index_name=None)
        p = Process(
            target=worker_process,
            args=(shm_data.name, shm_index.name, wid + 1, wid),
            name=f"worker-{wid}",
        )
        p.join
        p.start()

        workers.append(
            {
                "id": wid,
                "proc": p,
                "shm_data": shm_data,
                "shm_index": shm_index,
                "mask": mask,
                "reads": 0,
                "done": False,
            }
        )
        procs.append(p)

    # Start async read loops for each worker buffer
    read_tasks = [asyncio.create_task(read_worker_loop(w)) for w in workers]

    # Await all readers to finish (i.e., LOOP_SIZE reads per worker)
    await asyncio.gather(*read_tasks)

    # Join processes & cleanup shared memory
    for w in workers:
        w["proc"].join()
        w["shm_data"].close()
        w["shm_data"].unlink()
        w["shm_index"].close()
        w["shm_index"].unlink()

    print("[main] Complete.")


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()

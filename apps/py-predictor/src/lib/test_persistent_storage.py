import shutil
import tempfile
from pathlib import Path

import pytest
from pydantic import BaseModel

from .persistent_storage import PersistentStorage
from .persistent_storage_reader import create_persistent_storage_reader


class SampleModel(BaseModel):
    id: int
    timestamp: int
    symbol: str
    price: float
    volume: int


@pytest.fixture
def temp_db_dir():
    temp_dir = tempfile.mkdtemp(prefix="persistent_storage_test_", dir="/tmp")
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


def test_read_records_range(temp_db_dir: str):
    storage = PersistentStorage(
        base_dir=temp_db_dir, sub_index="BTCUSDT", model=SampleModel, writable=True
    )

    records = [
        SampleModel(id=0, timestamp=1000, symbol="BTCUSDT", price=50000.0, volume=100),
        SampleModel(id=0, timestamp=1001, symbol="BTCUSDT", price=50100.0, volume=150),
        SampleModel(id=0, timestamp=1002, symbol="BTCUSDT", price=50200.0, volume=200),
        SampleModel(id=0, timestamp=1003, symbol="BTCUSDT", price=50300.0, volume=250),
        SampleModel(id=0, timestamp=1004, symbol="BTCUSDT", price=50400.0, volume=300),
    ]

    ids = storage.append_records(records)
    assert len(ids) == 5

    result = storage.read_records_range(from_index=ids[1], count=3)

    assert len(result) == 3
    assert result[0].price == 50100.0
    assert result[0].volume == 150
    assert result[1].price == 50200.0
    assert result[2].price == 50300.0

    result_all = storage.read_records_range(from_index=ids[0], count=10)
    assert len(result_all) == 5

    storage.close()


def test_read_last_record(temp_db_dir: str):
    storage = PersistentStorage(
        base_dir=temp_db_dir, sub_index="ETHUSDT", model=SampleModel, writable=True
    )

    result_empty = storage.read_last_record()
    assert result_empty is None

    record1 = SampleModel(id=0, timestamp=2000, symbol="ETHUSDT", price=3000.0, volume=500)
    id1 = storage.append_record(record1)

    result1 = storage.read_last_record()
    assert result1 is not None
    assert result1.symbol == "ETHUSDT"
    assert result1.price == 3000.0
    assert result1.volume == 500
    assert result1.id == id1

    record2 = SampleModel(id=0, timestamp=2001, symbol="ETHUSDT", price=3100.0, volume=600)
    id2 = storage.append_record(record2)

    result2 = storage.read_last_record()
    assert result2 is not None
    assert result2.price == 3100.0
    assert result2.volume == 600
    assert result2.id == id2

    storage.close()


def test_replace_or_insert_last_record(temp_db_dir: str):
    storage = PersistentStorage(
        base_dir=temp_db_dir, sub_index="SOLUSDT", model=SampleModel, writable=True
    )

    record1 = SampleModel(id=0, timestamp=3000, symbol="SOLUSDT", price=100.0, volume=1000)
    record_id1 = storage.replace_or_insert_last_record(record1)

    last = storage.read_last_record()
    assert last is not None
    assert last.price == 100.0
    assert last.volume == 1000
    assert last.id == record_id1

    record2 = SampleModel(id=0, timestamp=3001, symbol="SOLUSDT", price=110.0, volume=1100)
    record_id2 = storage.replace_or_insert_last_record(record2)
    assert record_id2 == record_id1

    last_after_replace = storage.read_last_record()
    assert last_after_replace is not None
    assert last_after_replace.price == 110.0
    assert last_after_replace.volume == 1100
    assert last_after_replace.id == record_id1

    record3 = SampleModel(id=0, timestamp=3002, symbol="SOLUSDT", price=95.0, volume=900)
    record3_id = storage.append_record(record3)

    record4 = SampleModel(id=0, timestamp=3003, symbol="SOLUSDT", price=98.0, volume=950)
    record_id4 = storage.replace_or_insert_last_record(record4)
    assert record_id4 == record3_id

    final_last = storage.read_last_record()
    assert final_last is not None
    assert final_last.price == 98.0
    assert final_last.volume == 950
    assert final_last.id == record3_id

    storage.close()


def test_existing_database(temp_db_dir: str):
    sub_index = "ADAUSDT"

    storage1 = PersistentStorage(
        base_dir=temp_db_dir, sub_index=sub_index, model=SampleModel, writable=True
    )

    records = [
        SampleModel(id=0, timestamp=4000, symbol="ADAUSDT", price=0.50, volume=10000),
        SampleModel(id=0, timestamp=4001, symbol="ADAUSDT", price=0.51, volume=10500),
        SampleModel(id=0, timestamp=4002, symbol="ADAUSDT", price=0.52, volume=11000),
    ]
    ids = storage1.append_records(records)

    last_before = storage1.read_last_record()

    storage1.close()

    storage2 = PersistentStorage(
        base_dir=temp_db_dir, sub_index=sub_index, model=SampleModel, writable=False
    )

    last_after = storage2.read_last_record()
    assert last_after is not None
    assert last_before is not None
    assert last_after.symbol == last_before.symbol
    assert last_after.price == last_before.price
    assert last_after.volume == last_before.volume
    assert last_after.price == 0.52
    assert last_after.volume == 11000

    all_records = storage2.read_records_range(from_index=ids[0], count=100)
    assert len(all_records) == 3
    assert all_records[0].price == 0.50
    assert all_records[1].price == 0.51
    assert all_records[2].price == 0.52

    storage2.close()

    db_dir = Path(temp_db_dir) / sub_index.lower()
    assert db_dir.exists()
    assert db_dir.is_dir()


def test_existing_database_append_more(temp_db_dir: str):
    sub_index = "DOTUSDT"

    storage1 = PersistentStorage(
        base_dir=temp_db_dir, sub_index=sub_index, model=SampleModel, writable=True
    )

    record1 = SampleModel(id=0, timestamp=5000, symbol="DOTUSDT", price=7.5, volume=5000)
    id1 = storage1.append_record(record1)

    storage1.close()

    storage2 = PersistentStorage(
        base_dir=temp_db_dir, sub_index=sub_index, model=SampleModel, writable=True
    )

    record2 = SampleModel(id=0, timestamp=5001, symbol="DOTUSDT", price=7.6, volume=5100)
    id2 = storage2.append_record(record2)

    last = storage2.read_last_record()
    assert last is not None
    assert last.price == 7.6
    assert last.id == id2

    all_records = storage2.read_records_range(from_index=id1, count=100)
    assert len(all_records) == 2
    assert all_records[0].price == 7.5
    assert all_records[1].price == 7.6

    storage2.close()


@pytest.mark.asyncio
async def test_persistent_storage_reader_empty_storage(temp_db_dir: str):
    storage = PersistentStorage(
        base_dir=temp_db_dir, sub_index="EMPTYUSDT", model=SampleModel, writable=True
    )

    reader = create_persistent_storage_reader(
        storage=storage, read_batch_size=10, start_global_index=1, is_stopped=None
    )

    batches_received = []
    async for batch in reader:
        batches_received.append(batch)

    assert len(batches_received) == 0

    storage.close()


@pytest.mark.asyncio
async def test_persistent_storage_reader_pagination(temp_db_dir: str):
    storage = PersistentStorage(
        base_dir=temp_db_dir, sub_index="PAGINATIONUSDT", model=SampleModel, writable=True
    )

    records = [
        SampleModel(
            id=0,
            timestamp=6000,
            symbol="PAGINATIONUSDT",
            price=100.0,
            volume=100,
        ),
        SampleModel(
            id=0,
            timestamp=6001,
            symbol="PAGINATIONUSDT",
            price=101.0,
            volume=200,
        ),
        SampleModel(
            id=0,
            timestamp=6002,
            symbol="PAGINATIONUSDT",
            price=102.0,
            volume=300,
        ),
    ]

    ids = storage.append_records(records)

    reader = create_persistent_storage_reader(
        storage=storage, read_batch_size=1, start_global_index=ids[0], is_stopped=None
    )

    batches_received = []
    async for batch in reader:
        batches_received.append(batch)

    assert len(batches_received) == 3

    assert len(batches_received[0]) == 1
    assert batches_received[0][0].price == 100.0
    assert batches_received[0][0].volume == 100

    assert len(batches_received[1]) == 1
    assert batches_received[1][0].price == 101.0
    assert batches_received[1][0].volume == 200

    assert len(batches_received[2]) == 1
    assert batches_received[2][0].price == 102.0
    assert batches_received[2][0].volume == 300

    storage.close()

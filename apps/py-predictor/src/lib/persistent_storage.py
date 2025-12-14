import json
import re
from os import makedirs
from os.path import join
from typing import Protocol, TypedDict

from rocksdb_binding import SegmentedLog


class StorageRecord[T](TypedDict):
    timestamp: int
    id: int
    data: T


def normalize_sub_index(sub_index: str) -> str:
    normalized = sub_index.lower()
    normalized = re.sub(r"[^a-z0-9_]", "_", normalized)
    normalized = re.sub(r"_{2,}", "_", normalized)
    normalized = re.sub(r"^_+|_+$", "", normalized)
    return normalized


def serialize_key(id: int) -> bytes:
    return id.to_bytes(8, byteorder="big", signed=True)


def parse_key(key: bytes) -> int:
    return int.from_bytes(key, byteorder="big", signed=True)


class PersistentStorageIteratorRaw(Protocol):
    def next_batch(self):
        pass

    def has_next(self) -> bool:
        pass

    def close(self) -> None:
        pass


class PersistentStorageIterator[T]:
    def __init__(self, raw_iterator):
        self._raw_iterator = raw_iterator
        self._closed = False

    def next_batch(self) -> list[T]:
        if self._closed:
            return []

        raw_items = self._raw_iterator.next_batch()
        results: list[T] = []

        for item in raw_items:
            key_int = parse_key(bytes(item.key))
            data = json.loads(bytes(item.value).decode())
            data["id"] = key_int
            results.append(data)

        return results

    def has_next(self) -> bool:
        if self._closed:
            return False
        return self._raw_iterator.has_next()

    def close(self) -> None:
        if not self._closed:
            self._raw_iterator.close()
            self._closed = True


class PersistentStorage[T]:
    def __init__(self, base_dir: str, sub_index: str, writable: bool = True):
        self._base_dir = base_dir
        self._sub_index = normalize_sub_index(sub_index)
        self._writable = writable
        self._log: SegmentedLog | None = None

    def _primary_dir(self) -> str:
        return join(self._base_dir, self._sub_index)

    def _secondary_dir(self) -> str:
        return join(self._base_dir, self._sub_index + "_secondary")

    def _get_or_create_log(self) -> SegmentedLog:
        if self._log is not None:
            return self._log

        primary_dir = self._primary_dir()
        try:
            makedirs(primary_dir, exist_ok=True)
        except Exception:
            pass

        if self._writable:
            self._log = SegmentedLog(primary_dir, True)
        else:
            secondary_dir = self._secondary_dir()
            try:
                makedirs(secondary_dir, exist_ok=True)
            except Exception:
                pass
            self._log = SegmentedLog.open_as_secondary(primary_dir, secondary_dir, True)

        return self._log

    def append_record(self, record: T) -> int:
        log = self._get_or_create_log()
        payload = json.dumps(record).encode()
        key = log.append(payload)
        assigned_id = parse_key(bytes(key))
        try:
            record["id"] = assigned_id
        except Exception:
            pass
        return assigned_id

    def append_records(self, records: list[T]) -> list[int]:
        log = self._get_or_create_log()
        messages = [json.dumps(r).encode() for r in records]
        keys = log.append_batch(messages)
        ids: list[int] = []
        for i, k in enumerate(keys):
            assigned_id = parse_key(bytes(k))
            ids.append(assigned_id)
            try:
                records[i]["id"] = assigned_id
            except Exception:
                pass
        return ids

    def iterate_from(self, from_index: int, batch_size: int) -> PersistentStorageIterator[T]:
        log = self._get_or_create_log()
        raw_it = log.iterate_from(serialize_key(from_index), batch_size)
        return PersistentStorageIterator[T](raw_it)

    def iterate_from_raw(self, from_index: int, batch_size: int) -> PersistentStorageIteratorRaw:
        log = self._get_or_create_log()
        return log.iterate_from(serialize_key(from_index), batch_size)

    def read_records_range(self, from_index: int, count: int) -> list[T]:
        it = self.iterate_from(from_index, count)
        try:
            items = it.next_batch()
            return items[:count]
        finally:
            it.close()

    def read_last_record(self) -> T | None:
        log = self._get_or_create_log()
        items = log.read_last(1)
        if not items:
            return None
        item = items[0]
        key_int = parse_key(bytes(item.key))
        data = json.loads(bytes(item.value).decode())
        data["id"] = key_int
        return data

    def replace_or_insert_last_record(self, record: T) -> int:
        log = self._get_or_create_log()
        last_key = log.get_last_key()
        payload = json.dumps(record).encode()
        if last_key is None:
            key = log.append(payload)
            assigned_id = parse_key(bytes(key))
            try:
                record["id"] = assigned_id
            except Exception:
                pass
            return assigned_id
        last_id = parse_key(bytes(last_key))
        log.put(serialize_key(last_id), payload)
        try:
            record["id"] = last_id
        except Exception:
            pass
        return last_id

    def close(self) -> None:
        if self._log is not None:
            try:
                self._log.close()
            except Exception:
                pass
            self._log = None

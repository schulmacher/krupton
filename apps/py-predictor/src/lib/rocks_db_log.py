import re
from os import makedirs
from os.path import join

from rocksdb_binding import RocksDb, SegmentedLogIterator


def normalize_sub_index(sub_index: str) -> str:
    normalized = sub_index.lower()
    normalized = re.sub(r"[^a-z0-9_]", "_", normalized)
    normalized = re.sub(r"_{2,}", "_", normalized)
    normalized = re.sub(r"^_+|_+$", "", normalized)
    return normalized


class RocksdbLog:
    def __init__(
        self, base_dir: str, db_name: str, writable: bool = True, compression: bool = True
    ):
        self._base_dir = base_dir
        self._sub_index = normalize_sub_index(db_name)
        self._writable = writable
        self._compression = compression
        self._log: RocksDb | None = None

    def _primary_dir(self) -> str:
        return join(self._base_dir, self._sub_index)

    def _secondary_dir(self) -> str:
        return join(self._base_dir, self._sub_index + "_secondary")

    def _get_or_create_log(self) -> RocksDb:
        if self._log is not None:
            return self._log

        primary_dir = self._primary_dir()
        try:
            makedirs(primary_dir, exist_ok=True)
        except Exception:
            pass

        if self._writable:
            self._log = RocksDb(primary_dir, self._compression)
        else:
            secondary_dir = self._secondary_dir()
            try:
                makedirs(secondary_dir, exist_ok=True)
            except Exception:
                pass
            self._log = RocksDb.open_as_secondary(primary_dir, secondary_dir, self._compression)

        return self._log

    def init(self) -> None:
        self._get_or_create_log()

    def close(self) -> None:
        if self._log is not None:
            try:
                self._log.close()
            except Exception:
                pass
            self._log = None

    def try_catch_up_with_primary(self) -> None:
        return self._get_or_create_log().try_catch_up_with_primary()

    def put(self, key: bytes, value: bytes) -> None:
        return self._get_or_create_log().put(key, value)

    def iterate_from(
        self, start_key: bytes | None = None, batch_size: int | None = None
    ) -> SegmentedLogIterator:
        return self._get_or_create_log().iterate_from(start_key, batch_size)

    def iterate_from_end(
        self, start_key: bytes | None = None, batch_size: int | None = None
    ) -> SegmentedLogIterator:
        return self._get_or_create_log().iterate_from_end(start_key, batch_size)

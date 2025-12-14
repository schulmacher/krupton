import os
from contextlib import contextmanager
from typing import Iterator

from psycopg import Connection
from psycopg_pool import ConnectionPool

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=os.environ.get(
                "DATABASE_URL",
                "postgres://postgres:postgres@localhost:5432/krupton",
            ),
            min_size=1,
            max_size=10,
        )
    return _pool


@contextmanager
def get_connection() -> Iterator[Connection]:
    with get_pool().connection() as conn:
        yield conn


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None

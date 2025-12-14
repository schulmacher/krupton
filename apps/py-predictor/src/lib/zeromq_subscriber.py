import asyncio
import json
from collections.abc import AsyncGenerator, Callable
from typing import Literal, TypeVar

import msgspec
import zmq
import zmq.asyncio

from src.lib.rocks_db_log import RocksdbLog


def serialize_key(id: int) -> bytes:
    return id.to_bytes(8, byteorder="big", signed=True)


def parse_key(key: bytes) -> int:
    return int.from_bytes(key, byteorder="big", signed=True)


def read_last_id_from_storage(storage: RocksdbLog) -> int | None:
    iterator = storage.iterate_from_end()
    try:
        if iterator.has_next():
            batch = iterator.next_batch()
            if batch:
                key_bytes, _ = batch[0]
                return parse_key(key_bytes)
        return None
    finally:
        iterator.close()


def trade_socket_template(platform_and_symbol: str) -> str:
    return f"ipc:///tmp/zmq-pubsub-unified-trade-{platform_and_symbol}.sock"


def order_book_socket_template(platform_and_symbol: str) -> str:
    return f"ipc:///tmp/zmq-pubsub-unified-order-book-{platform_and_symbol}.sock"


class TradeWithId(msgspec.Struct):
    id: int
    symbol: str
    price: str
    quantity: str
    time: int
    platform: str
    side: Literal[0, 1]
    orderType: Literal[0, 1]
    misc: str | None = None


class OrderBookWithId(msgspec.Struct):
    id: int
    type: Literal["update", "snapshot"]
    symbol: str
    bids: list[tuple[str, str]]
    asks: list[tuple[str, str]]
    time: int
    platform: str


trade_with_id_decoder = msgspec.json.Decoder(type=TradeWithId)
order_book_with_id_decoder = msgspec.json.Decoder(type=OrderBookWithId)

OnTradeEvent = Callable[[TradeWithId], None]
OnOrderBookEvent = Callable[[OrderBookWithId], None]

T = TypeVar("T", TradeWithId, OrderBookWithId)


def create_subscriber_socket(
    socket_address: str,
    context: zmq.asyncio.Context | None = None,
) -> tuple[zmq.asyncio.Context, zmq.asyncio.Socket, bool]:
    owns_context = context is None
    if context is None:
        context = zmq.asyncio.Context()
    socket = context.socket(zmq.SUB)
    socket.connect(socket_address)
    socket.setsockopt_string(zmq.SUBSCRIBE, "")
    return context, socket, owns_context


IsStopped = Callable[[], bool]


async def consume_trades_consistently(
    platform: str,
    symbol: str,
    storage: RocksdbLog,
    is_stopped: IsStopped,
    start_id: int | None = None,
    zmq_context: zmq.asyncio.Context | None = None,
) -> AsyncGenerator[list[TradeWithId], None]:
    socket_address = trade_socket_template(f"{platform}-{symbol}")
    print("socket_address", socket_address)
    context, socket, owns_context = create_subscriber_socket(socket_address, zmq_context)

    last_id = read_last_id_from_storage(storage)
    last_processed_id = start_id if start_id is not None else (last_id if last_id else 0)

    try:
        while not is_stopped():
            try:
                message = await socket.recv()
                print("message", message)
                if is_stopped():
                    break

                trade = trade_with_id_decoder.decode(message)
                batch: list[TradeWithId] = []

                expected_id = last_processed_id + 1

                if trade.id <= last_processed_id:
                    continue

                if trade.id > expected_id:
                    gap_size = trade.id - expected_id
                    print(
                        f"Gap detected: expected {expected_id}, got {trade.id}, gap size {gap_size}"
                    )

                    iterator = storage.iterate_from(serialize_key(expected_id), gap_size + 1)
                    try:
                        while iterator.has_next() and not is_stopped():
                            raw_records = iterator.next_batch()
                            for key_bytes, value_bytes in raw_records:
                                record_id = parse_key(key_bytes)
                                if record_id < trade.id:
                                    record = json.loads(value_bytes)
                                    gap_trade = TradeWithId(
                                        id=record_id,
                                        symbol=record.get("symbol", ""),
                                        price=record.get("price", ""),
                                        quantity=record.get("quantity", ""),
                                        time=record.get("time", 0),
                                        platform=record.get("platform", ""),
                                        side=record.get("side", 0),
                                        orderType=record.get("orderType", 0),
                                        misc=record.get("misc"),
                                    )
                                    batch.append(gap_trade)
                    finally:
                        iterator.close()

                batch.append(trade)
                last_processed_id = batch[-1].id
                yield batch

            except zmq.ZMQError as error:
                print(f"ZMQ error: {error}")
                await asyncio.sleep(0.1)
    finally:
        socket.close()
        if owns_context:
            context.term()


async def consume_order_books_consistently(
    platform: str,
    symbol: str,
    storage: RocksdbLog,
    is_stopped: IsStopped,
    start_id: int | None = None,
    zmq_context: zmq.asyncio.Context | None = None,
) -> AsyncGenerator[list[OrderBookWithId], None]:
    socket_address = order_book_socket_template(f"{platform}-{symbol}")
    print("socket_address", socket_address)
    context, socket, owns_context = create_subscriber_socket(socket_address, zmq_context)

    last_id = read_last_id_from_storage(storage)
    last_processed_id = start_id if start_id is not None else (last_id if last_id else 0)

    try:
        while not is_stopped():
            try:
                message = await socket.recv()
                if is_stopped():
                    break

                order_book = order_book_with_id_decoder.decode(message)
                batch: list[OrderBookWithId] = []

                expected_id = last_processed_id + 1

                if order_book.id <= last_processed_id:
                    continue

                if order_book.id > expected_id:
                    gap_size = order_book.id - expected_id
                    print(
                        f"Gap detected: expected {expected_id}, got {order_book.id}, gap size {gap_size}"
                    )

                    iterator = storage.iterate_from(serialize_key(expected_id), gap_size + 1)
                    try:
                        while iterator.has_next() and not is_stopped():
                            raw_records = iterator.next_batch()
                            for key_bytes, value_bytes in raw_records:
                                record_id = parse_key(key_bytes)
                                if record_id < order_book.id:
                                    record = json.loads(value_bytes)
                                    gap_order_book = OrderBookWithId(
                                        id=record_id,
                                        type=record.get("type", "update"),
                                        symbol=record.get("symbol", ""),
                                        bids=record.get("bids", []),
                                        asks=record.get("asks", []),
                                        time=record.get("time", 0),
                                        platform=record.get("platform", ""),
                                    )
                                    batch.append(gap_order_book)
                    finally:
                        iterator.close()

                batch.append(order_book)
                last_processed_id = batch[-1].id
                yield batch

            except zmq.ZMQError as error:
                print(f"ZMQ error: {error}")
                await asyncio.sleep(0.1)
    finally:
        socket.close()
        if owns_context:
            context.term()

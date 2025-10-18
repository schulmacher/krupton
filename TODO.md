## In progress

## Max priority

- Fix naming across the repository to be consistent. E.g. `BinanceHistoricalTrade` -> `BinanceTradeAPI`.
- Windowing for pattern matching - sequential trades vs aggregated on time?
- Unified trade 1D pattern matching.
  - What is matrix profile (MP)
    - Data structure (1D array) that tells , for every subsequence of a time series, how close it is to its most similar neighbor
  - What is motif
    - Recurring pattern in a time series
  - What is discord
    - Unusual/rate pattern
  - What is shapelet
    - Discrimiative sub-pattern that separates classes
  - What is chain
    - Sequence of motifs where each morphs slight into the next (gradual evolution)

## Medium priority

- Data retention for external bridge - remove old data after it is transformed. Should be able to turn on/off. Off for new entities by default.

## Low priority

- WebSocket monitoring for kraken.
- Internal bridge monitoring.

## Backlog

## Done

### Consistent consumer

Kafka works by writing the messages to a persistant sotrage and then keeping an offset for the consumers.
ZMQ pub/sub just sends the messages to the consumer with no 100% guarantee that the consumer will receive the message.
Let create a ZMQ sub wrapper which works with the "StorageRecord" interface to fill the gaps in the ZMQ stream.

[x] Implement consistent consumer.
[x] Use consistent consumer in all transformers.

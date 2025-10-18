# Internal Bridge - Entity Transformation Plan

PS! DO NOT WRITE DOCS.

## Overview

Transform platform-specific entities (Binance/Kraken) from external-bridge storage into unified format, tracking progress per entity/entities using JSON files.

## Todo List

### 1. Define Unified Entity Schemas

Do this inside packages/persistent-storage-node/src/transformed

- [x] Define unified OrderBook {type: update | snapshot} schema
- [x] Define unified Trade schema
- [x] Create TypeBox schemas
- [x] Do NOT document anything!

### 2. Progress Tracking System

- [x] Design progress tracking JSON schema (file path, last processed line index, timestamp)
- [x] Create progress file storage structure (one JSON per entity)
- [x] Implement `readProgress(entityType: string)` function
- [x] Implement `writeProgress(entityType: string, progress: Progress)` function
- [x] Add progress file initialization logic

### 3. Transformation Functions

- [x] Implement Kraken WS (update) OrderBook → Unified OrderBook {type update} transformer
- [x] Implement Kraken WS (snapshot) OrderBook → Unified OrderBook {type: snapshot} transformer
- [x] Implement Binance API OrderBook → Unified OrderBook {type: snapshot} transformer
- [x] Implement Binance WS DiffDepth → Unified OrderBook {type: update} transformer
- [x] Implement Binance Trade → Unified Trade transformer
- [x] Implement Kraken Trade → Unified Trade transformer

### 4. Single Entity Reader

- [ ] Create async generator function to read entity batches from storage
- [ ] Read from specified starting position (fileName + lineIndex)
- [ ] Yield batches of configurable size
- [ ] Include position metadata with each batch (fileName, startLineIndex, endLineIndex, lastTimestamp)
- [ ] Handle file rotation (continue reading across multiple .jsonl files)

### 5. Multi Entity Stream Merger

- [ ] Create async generator to merge two entity streams by timestamp
- [ ] Implement peek-based logic to compare next records from both streams
- [ ] Implement pause condition function (decides which stream to take from based on peeked records)
- [ ] Tag each record with its entity type in the output
- [ ] Sort merged output by timestamp while respecting pause conditions
- [ ] Track positions independently for each input entity
- [ ] Return position metadata for both entities with each batch
- [ ] Example use case: Ensure BinanceOrderBook snapshot emitted before BinanceDiffDepth updates

### 6. Tests

### 7. No documentation

By no means write any .MD documents.
PS! DO NOT WRITE DOCS.

## Entity Mapping Reference

### Endpoint Storage Entities

- `binanceOrderBook` → Unified OrderBook {snapshot}
- `binanceHistoricalTrade` → Unified Trade
- `krakenOrderBook` → Unified OrderBook {snapshot | update}
- `krakenRecentTrades` → Unified Trade

### WebSocket Storage Entities

- `binanceTrade` → Unified Trade
- `binanceDiffDepth` → Unified OrderBook {update}

## Progress File Structure

For combined stream

```json
[
  {
    "entityType": "binanceOrderBook",
    "symbol": "btcusdt",
    "lastProcessedFile": "00000000000000000000000000000000",
    "lastProcessedLineIndex": 1234,
    "lastProcessedTimestamp": 1696723200000,
    "updatedAt": 1696723250000
  },
  {
    "entityType": "binanceDiffDepth",
    "symbol": "btcusdt",
    "lastProcessedFile": "00000000000000000000000000000000",
    "lastProcessedLineIndex": 5678,
    "lastProcessedTimestamp": 1696723200010,
    "updatedAt": 1696723250010
  }
]
```

For single stream

```json
[
  {
    "entityType": "binanceHistoricalTrade",
    "symbol": "btcusdt",
    "lastProcessedFile": "00000000000000000000000000000000",
    "lastProcessedLineIndex": 1234,
    "lastProcessedTimestamp": 1696723200000,
    "updatedAt": 1696723250000
  }
]
```

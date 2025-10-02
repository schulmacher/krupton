## Kraken Websockets

### Trade Stream

https://docs.kraken.com/api/docs/websocket-v2/trade

**Channel Name:** `trade`

**Description:** Real-time individual trade information for currency pairs. Each message contains one or more trade events that occurred when orders matched in the order book.

**Update Speed:** Real-time

**WebSocket Endpoint:** `wss://ws.kraken.com/v2`

**Subscription Method:** Dynamic subscription after connection

**Subscribe Request:**

```json
{
  "method": "subscribe",
  "params": {
    "channel": "trade",
    "symbol": ["BTC/USD", "MATIC/USD"],
    "snapshot": true
  }
}
```

**Kraken Trade Stream Mapping:**

```json
{
  "channel": "trade",
  "type": "update",
  "data": [
    {
      "symbol": "MATIC/USD", // Symbol → symbol
      "side": "sell", // Side → side (buy/sell)
      "price": 0.5117, // Price → price
      "qty": 40.0, // Quantity → quantity
      "ord_type": "market", // Order type → orderType (limit/market)
      "trade_id": 4665906, // Trade ID → sourceTradeId
      "timestamp": "2023-09-25T07:49:37.708706Z" // Timestamp → timestamp
    }
  ]
}
```

**Notes:**

- Snapshot provides the most recent 50 trades
- Multiple trades may be batched in a single message
- Supports multiple symbols in one subscription

### Book Stream (Level 2)

https://docs.kraken.com/api/docs/websocket-v2/book

**Channel Name:** `book`

**Description:** Provides Level 2 order book data with aggregated order quantities at each price level. Shows individual price levels with total quantities available.

**Update Speed:** Real-time incremental updates

**WebSocket Endpoint:** `wss://ws.kraken.com/v2`

**Subscription Method:** Dynamic subscription after connection

**Available Depths:** 10, 25, 100, 500, 1000 (default: 10)

**Subscribe Request:**

```json
{
  "method": "subscribe",
  "params": {
    "channel": "book",
    "symbol": ["BTC/USD"],
    "depth": 10,
    "snapshot": true
  }
}
```

**Kraken Book Stream Mapping (Snapshot):**

```json
{
  "channel": "book",
  "type": "snapshot",
  "data": [
    {
      "symbol": "MATIC/USD", // Symbol → symbol
      "bids": [
        // Bids → bids
        {
          "price": 0.5656, // Price → price
          "qty": 10000.0 // Quantity → quantity
        }
      ],
      "asks": [
        // Asks → asks
        {
          "price": 0.5657, // Price → price
          "qty": 1098.39 // Quantity → quantity
        }
      ],
      "checksum": 2114181697, // CRC32 checksum → checksum
      "timestamp": "2023-10-06T17:35:55.440295Z" // Timestamp → timestamp
    }
  ]
}
```

**Kraken Book Stream Mapping (Update):**

```json
{
  "channel": "book",
  "type": "update",
  "data": [
    {
      "symbol": "MATIC/USD",
      "bids": [
        {
          "price": 0.5657,
          "qty": 1098.3947558
        }
      ],
      "asks": [],
      "checksum": 2114181697,
      "timestamp": "2023-10-06T17:35:55.440295Z"
    }
  ]
}
```

**Notes:**

- Snapshot provides full order book state at subscription time
- Updates contain only changed price levels
- Checksum allows validation of local order book integrity
- Quantity of 0 means the price level should be removed
- Supports multiple symbols in one subscription

### Orders Stream (Level 3)

https://docs.kraken.com/api/docs/websocket-v2/level3

**Channel Name:** `level3`

**Description:** Provides Level 3 order book data showing individual orders rather than aggregated price levels. Each message contains detailed information about specific order additions, updates, and removals.

**Update Speed:** Real-time incremental updates

**WebSocket Endpoint:** `wss://ws.kraken.com/v2`

**Subscription Method:** Dynamic subscription after connection (requires authentication)

**Subscribe Request:**

```json
{
  "method": "subscribe",
  "params": {
    "channel": "level3",
    "symbol": ["BTC/USD"],
    "snapshot": true
  }
}
```

**Notes:**

- Provides individual order-level granularity
- Requires authentication for access
- Higher data volume than Level 2
- Used for detailed market microstructure analysis
- Supports multiple symbols in one subscription

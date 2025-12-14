## Binance Websockets

### Trade Stream

https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams#trade-streams

**Stream Name:** `<symbol>@trade`

**Description:** Real-time individual trade information for a specific symbol. Each message represents a single trade execution.

**Update Speed:** Real-time

**Binance Trade Stream Mapping:**

```
{
  "e": "trade",           // Event type
  "E": 1672515782136,     // Event time → eventTime
  "s": "BNBBTC",          // Symbol → symbol
  "t": 12345,             // Trade ID → sourceTradeId
  "p": "0.001",           // Price → price
  "q": "100",             // Quantity → quantity
  "T": 1672515782136,     // Trade time → timestamp
  "m": true,              // Is buyer maker → isBuyerMaker
  "M": true               // Ignore
}
```

### Partial Book Depth Stream

https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams#partial-book-depth-streams

**Stream Name:** `<symbol>@depth<levels>` or `<symbol>@depth<levels>@100ms`

**Description:** Provides a snapshot of the top N bids and asks in the order book. This stream pushes a complete snapshot of the specified depth levels at regular intervals, rather than incremental updates.

**Valid Levels:** 5, 10, or 20

**Update Speed:** 1000ms or 100ms

**Example Stream Names:**

- `btcusdt@depth5` - Top 5 levels, updated every second
- `btcusdt@depth10@100ms` - Top 10 levels, updated every 100ms
- `ethusdt@depth20` - Top 20 levels, updated every second

**Binance Partial Depth Stream Mapping:**

```
{
  "lastUpdateId": 160,    // lastUpdateId
  "bids": [               // bids
    ["0.0024", "10"]      // [price, quantity]
  ],
  "asks": [               // asks
    ["0.0026", "100"]     // [price, quantity]
  ]
}
```

### Diff. Depth Stream

https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams#how-to-manage-a-local-order-book-correctly

**Stream Name:** `<symbol>@depth` or `<symbol>@depth@100ms`

**Description:** Provides incremental order book updates. Each message contains only the price levels that have changed since the last update. Used to efficiently maintain a local order book by applying delta updates.

**Update Speed:** 1000ms or 100ms

**Usage:** Subscribe to this stream and follow the order book management procedure:

1. Buffer events from the stream
2. Get initial snapshot from REST API (`/api/v3/depth`)
3. Apply buffered and subsequent events to maintain synchronized local order book

**Binance Diff Depth Stream Mapping:**

```
{
  "e": "depthUpdate",     // Event type
  "E": 1672515782136,     // Event time → eventTime
  "s": "BNBBTC",          // Symbol → symbol
  "U": 157,               // First update ID → firstUpdateId
  "u": 160,               // Final update ID → lastUpdateId
  "b": [                  // Bids → bids
    ["0.0024", "10"]
  ],
  "a": [                  // Asks → asks
    ["0.0026", "100"]
  ]
}
```

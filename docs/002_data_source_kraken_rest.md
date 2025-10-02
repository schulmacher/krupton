
## Kraken REST API Endpoints

**Base URL:** `https://api.kraken.com/0`

### Get Recent Trades

**Endpoint:** `GET /public/Trades`

**Description:** Retrieves recent trade data for a specific asset pair. Returns the last 1000 trades by default.

**Parameters:**
- `pair` (STRING, mandatory): Asset pair to get trade data for (e.g., XBTUSD, ETHUSD)
- `since` (INTEGER, optional): Return trade data since given timestamp (Unix timestamp in nanoseconds)
- `count` (INTEGER, optional): Return specific number of trades, up to 1000

**Response Structure:**
```json
{
  "error": [],
  "result": {
    "XXBTZUSD": [
      [
        "45123.40000",        // Price → price
        "0.12345678",         // Volume → quantity
        1234567890.1234,      // Time (Unix timestamp) → timestamp
        "b",                  // Buy/Sell (b = buy, s = sell) → side
        "m",                  // Market/Limit (m = market, l = limit) → orderType
        "",                   // Miscellaneous
        123456789             // Trade ID → sourceTradeId
      ]
    ],
    "last": "1234567890123456789"
  }
}
```

**Notes:**
- Trades are returned in ascending order by timestamp
- The `last` field in the response can be used as the `since` parameter for pagination
- Array format: `[price, volume, time, buy/sell, market/limit, miscellaneous, trade_id]`
- Time is provided as Unix timestamp with decimal precision

### Get Order Book

**Endpoint:** `GET /public/Depth`

**Description:** Returns Level 2 (L2) order book for a specific asset pair, showing aggregated order quantities at each price level.

**Parameters:**
- `pair` (STRING, mandatory): Asset pair to get order book for (e.g., XBTUSD, ETHUSD)
- `count` (INTEGER, optional): Maximum number of asks/bids to return (default varies by exchange, typically 100)

**Response Structure:**
```json
{
  "error": [],
  "result": {
    "XXBTZUSD": {
      "asks": [
        [
          "45124.50000",      // Price → price
          "5.123",            // Volume → quantity
          1234567890          // Timestamp
        ]
      ],
      "bids": [
        [
          "45123.40000",      // Price → price
          "10.456",           // Volume → quantity
          1234567890          // Timestamp
        ]
      ]
    }
  }
}
```

**Notes:**
- Asks are sorted from lowest to highest price (ascending)
- Bids are sorted from highest to lowest price (descending)
- Array format: `[price, volume, timestamp]`
- Timestamp represents when the price level was last updated
- Unlike some exchanges, each price level includes a timestamp for granular tracking

## Key Differences from Binance

**Asset Pair Naming:**
- Kraken uses different naming conventions (e.g., `XXBTZUSD` for BTC/USD, `XETHZUSD` for ETH/USD)
- X prefix often indicates cryptocurrency, Z prefix often indicates fiat

**Response Format:**
- All Kraken responses include an `error` array and `result` object wrapper
- Empty `error` array indicates successful request
- Trade and order book data nested under the asset pair name within `result`

**Timestamp Precision:**
- Kraken uses Unix timestamps with nanosecond precision for some fields
- More granular time data compared to Binance's millisecond precision

**Array-Based Trade Data:**
- Trade data returned as arrays rather than objects
- More compact but requires positional interpretation


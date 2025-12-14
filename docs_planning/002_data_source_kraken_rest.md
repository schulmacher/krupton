
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

### Get Tradable Asset Pairs

**Endpoint:** `GET /public/AssetPairs`

**Description:** Retrieves comprehensive information about all tradable asset pairs available on the exchange. This endpoint provides reference data including pair naming conventions, trading rules, fee schedules, and status information necessary for symbol validation and market data operations.

**Parameters:**
- `pair` (STRING, optional): Comma-separated list of asset pairs to query (e.g., `XBTUSD,ETHUSD`)
- `info` (STRING, optional): Information level - `info` (all info, default), `leverage` (leverage info), `fees` (fee schedule), `margin` (margin info)

**Note:** Omit parameters to retrieve information for all tradable pairs.

**Response Structure:**
```json
{
  "error": [],
  "result": {
    "XXBTZUSD": {
      "altname": "XBTUSD",
      "wsname": "XBT/USD",
      "aclass_base": "currency",
      "base": "XXBT",
      "aclass_quote": "currency",
      "quote": "ZUSD",
      "pair_decimals": 1,
      "cost_decimals": 5,
      "lot_decimals": 8,
      "lot_multiplier": 1,
      "leverage_buy": [2, 3, 4, 5],
      "leverage_sell": [2, 3, 4, 5],
      "fees": [
        [0, 0.26],
        [50000, 0.24],
        [100000, 0.22]
      ],
      "fees_maker": [
        [0, 0.16],
        [50000, 0.14],
        [100000, 0.12]
      ],
      "fee_volume_currency": "ZUSD",
      "margin_call": 80,
      "margin_stop": 40,
      "ordermin": "0.0001",
      "costmin": "0.5",
      "tick_size": "0.1",
      "status": "online"
    },
    "XETHZUSD": {
      "altname": "ETHUSD",
      "wsname": "ETH/USD",
      "base": "XETH",
      "quote": "ZUSD",
      "status": "online"
    }
  }
}
```

**Key Response Fields:**

- `altname`: Alternative pair name used in REST API requests
- `wsname`: WebSocket API subscription name format (with forward slash)
- `base`: Base asset identifier
- `quote`: Quote asset identifier
- `pair_decimals`: Decimal precision for pair pricing
- `lot_decimals`: Decimal precision for order volume
- `ordermin`: Minimum order volume for pair
- `costmin`: Minimum order cost in quote currency
- `tick_size`: Minimum price increment
- `status`: Trading status (`online`, `cancel_only`, `post_only`, `limit_only`, `reduce_only`)

**Pair Status Values:**

- `online`: Pair available for all order types
- `cancel_only`: Only order cancellations permitted
- `post_only`: Only post-only limit orders permitted
- `limit_only`: Only limit orders permitted
- `reduce_only`: Only orders reducing position size permitted

**Response Characteristics:**

- Non-paginated: Returns complete pair set in single response
- Response size: Smaller than Binance (typically < 1 MB)
- Cache lifetime: Pair information changes infrequently
- Recommended refresh: Every 30-60 minutes or on application initialization

**Naming Convention:**

Kraken employs asset identifier prefixes for internal representation:
- `X` prefix: Typically denotes cryptocurrency assets (e.g., `XXBT` for Bitcoin, `XETH` for Ethereum)
- `Z` prefix: Typically denotes fiat currencies (e.g., `ZUSD` for US Dollar, `ZEUR` for Euro)
- Alternative names (`altname`) provide simplified identifiers for REST API usage
- WebSocket names (`wsname`) use forward slash notation for stream subscriptions

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


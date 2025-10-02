## REST API Endpoints

### Order Book

https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints#order-book

**Endpoint:** `GET /api/v3/depth`

**Description:** Retrieves a snapshot of the current order book for a specific symbol, showing bids and asks at various price levels.

**Weight:** Adjusted based on limit (5 for 1-100, 25 for 101-500, 50 for 501-1000, 250 for 1001-5000)

**Parameters:**

- `symbol` (STRING, mandatory): Trading pair symbol
- `limit` (INT, optional): Default 100, Maximum 5000

**Response Structure:**

```
{
  "lastUpdateId": 1027024,     // lastUpdateId
  "bids": [                    // bids
    ["4.00000000", "431.00000000"]  // [price, quantity]
  ],
  "asks": [                    // asks
    ["4.00000200", "12.00000000"]   // [price, quantity]
  ]
}
```

### Old Trade Lookup

https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints#old-trade-lookup

**Endpoint:** `GET /api/v3/historicalTrades`

**Description:** Retrieves historical trade data for a specific symbol. Useful for accessing older trades that are no longer available via the recent trades endpoint.

**Weight:** 25

**Parameters:**

- `symbol` (STRING, mandatory): Trading pair symbol
- `limit` (INT, optional): Default 500, Maximum 1000
- `fromId` (LONG, optional): Trade ID to fetch from. Default gets most recent trades

**Response Structure:**

```
[
  {
    "id": 28457,              // Trade ID → sourceTradeId
    "price": "4.00000100",    // Price → price
    "qty": "12.00000000",     // Quantity → quantity
    "quoteQty": "48.000012",  // Quote quantity
    "time": 1499865549590,    // Trade time → timestamp
    "isBuyerMaker": true,     // Is buyer maker → isBuyerMaker
    "isBestMatch": true       // Is best match
  }
]
```

### Symbol Order Book Ticker

https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints#symbol-order-book-ticker

**Endpoint:** `GET /api/v3/ticker/bookTicker`

**Description:** Returns the best price and quantity on the order book for a symbol or symbols. Shows the top bid and ask without full depth.

**Weight:** 2 per symbol

**Parameters:**

- `symbol` (STRING, optional): Trading pair symbol (omit for all symbols)
- `symbols` (ARRAY, optional): Array of symbols (maximum 100)

**Note:** Either `symbol` or `symbols` must be provided, or omit both for all symbols.

**Response Structure (single symbol):**

```
{
  "symbol": "LTCBTC",         // symbol
  "bidPrice": "4.00000000",   // bidPrice
  "bidQty": "431.00000000",   // bidQty
  "askPrice": "4.00000200",   // askPrice
  "askQty": "9.00000000"      // askQty
}
```

**Response Structure (multiple symbols):**

```
[
  {
    "symbol": "LTCBTC",
    "bidPrice": "4.00000000",
    "bidQty": "431.00000000",
    "askPrice": "4.00000200",
    "askQty": "9.00000000"
  },
  {
    "symbol": "ETHBTC",
    "bidPrice": "0.07946700",
    "bidQty": "9.00000000",
    "askPrice": "100000.00000000",
    "askQty": "1000.00000000"
  }
]
```

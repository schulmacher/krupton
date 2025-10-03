# Market Data Simulator - Persistent Storage System

## Overview

The storage subsystem addresses the requirement for offline development and deterministic testing by persisting REST API responses in a structured format that enables subsequent replay operations.

## Storage Architecture

The storage layer utilizes JSON Lines (JSONL) format, where each line represents a discrete REST API response accompanied by contextual metadata. This format offers several advantages: (1) append-only write operations, (2) human-readable content for debugging purposes, (3) efficient sequential reading for replay operations, and (4) resilience to partial file corruption.

```mermaid
graph TD
    subgraph "Storage Hierarchy"
        Root[storage/]
        Root --> Binance[binance/]
        Root --> Kraken[kraken/]
        
        Binance --> BHistTrades[api_v3_historicalTrades/]
        Binance --> BDepth[api_v3_depth/]
        Binance --> BBookTicker[api_v3_ticker_bookTicker/]
        
        BHistTrades --> BTCUSDT1[BTCUSDT/]
        BHistTrades --> ETHUSDT1[ETHUSDT/]
        BDepth --> BTCUSDT2[BTCUSDT/]
        
        BTCUSDT1 --> TradesFile1[2025-10-02T10-00-00.jsonl]
        BTCUSDT2 --> DepthFile1[2025-10-02T10-00-00.jsonl]
        
        Kraken --> KTrades[public_Trades/]
        Kraken --> KDepth[public_Depth/]
        
        KTrades --> BTCUSD1[BTC-USD/]
        KDepth --> BTCUSD2[BTC-USD/]
        
        BTCUSD1 --> TradesFile2[2025-10-02T10-00-00.jsonl]
        BTCUSD2 --> DepthFile2[2025-10-02T10-00-00.jsonl]
    end
    
    style Root fill:#e8f4f8
    style Binance fill:#fff4e1
    style Kraken fill:#ffe1f5
    style BHistTrades fill:#e1f5ff
    style BDepth fill:#e1f5ff
    style BBookTicker fill:#e1f5ff
    style KTrades fill:#e1f5ff
    style KDepth fill:#e1f5ff
```

**Figure 1:** Hierarchical organization of persistent storage by platform, full endpoint path, and symbol.

### Path Mapping Convention

REST endpoint paths are converted to filesystem-safe directory names by replacing forward slashes with underscores:

- Binance `/api/v3/historicalTrades` → `api_v3_historicalTrades/`
- Binance `/api/v3/depth` → `api_v3_depth/`
- Binance `/api/v3/ticker/bookTicker` → `api_v3_ticker_bookTicker/`
- Kraken `/public/Trades` → `public_Trades/`
- Kraken `/public/Depth` → `public_Depth/`

This convention ensures each REST endpoint has a dedicated storage location while maintaining human-readable directory names that clearly identify the data source.

## Storage Schema

Each JSONL entry conforms to a standardized schema comprising temporal metadata, endpoint identification, request parameters, and the unmodified REST API response. This schema preserves complete request-response context necessary for accurate replay operations:

- `timestamp`: Unix epoch milliseconds representing the moment of API invocation
- `endpoint`: REST endpoint path identifying the data source
- `params`: Request parameters as key-value pairs
- `response`: Unmodified REST API response payload

## Operational Benefits

The persistent storage approach yields several operational advantages:

**Deterministic Testing:** Replay of identical data sequences enables reproducible test scenarios and facilitates regression testing of data processing logic.

**Development Efficiency:** Elimination of network dependencies and API rate limit constraints accelerates development iteration cycles.

**Analytical Capabilities:** Historical data persistence supports post-hoc analysis, pattern identification, and backtesting of trading strategies.

**Cost Optimization:** Reduction in redundant API calls minimizes potential costs associated with high-frequency data retrieval.


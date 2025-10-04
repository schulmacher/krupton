# mdsFetcher Service - Boilerplate Implementation

This is a boilerplate implementation of the Market Data Simulator Fetcher service based on the `@krupton/service-framework-node` framework.

## Structure

```
mdsFetcher/
├── environment.ts    # Environment variable schema and types
├── context.ts        # Service context factory
├── mdsFetcher.ts     # Main service logic
└── README.md         # This file
```

## Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PROCESS_NAME` | string | `mds-fetcher` | Service name for logging |
| `NODE_ENV` | string | `development` | Node environment |
| `PORT` | number | `3000` | HTTP server port |
| `PLATFORM` | string | `binance` | Exchange platform (binance, kraken) |
| `API_BASE_URL` | string | `https://api.binance.com` | Exchange API base URL |
| `SYMBOLS` | string | `BTCUSDT` | Comma-separated trading pairs |
| `FETCH_INTERVAL_MS` | number | `5000` | Fetch interval in milliseconds |
| `STORAGE_BASE_DIR` | string | `./storage` | Storage directory path |
| `ROTATION_INTERVAL` | string | `1h` | File rotation interval |
| `RATE_LIMIT_REQUESTS_PER_MINUTE` | number | `1200` | Max requests per minute |
| `RATE_LIMIT_REQUESTS_PER_SECOND` | number | `20` | Max requests per second |
| `FETCH_MODE` | enum | `recording` | Mode: recording, backfill, or snapshot |

## Running the Service

### Development
```bash
# From project root
pnpm --filter 'market-data-simulator' dev

# Or directly with tsx
tsx apps/market-data-simulator/src/mdsFetcher.ts
```

### With environment variables
```bash
PLATFORM=binance SYMBOLS=BTCUSDT,ETHUSDT PORT=3001 tsx apps/market-data-simulator/src/mdsFetcher.ts
```

## HTTP Endpoints

- `GET /health` - Health check endpoint
  - Returns 200 with health status
  - Returns 503 during shutdown

- `GET /metrics` - Prometheus metrics
  - Returns metrics in Prometheus text format

- `GET /status` - Fetcher status
  - Returns current fetcher state and statistics

## Metrics

The service exposes the following Prometheus metrics:

- `mds_fetcher_fetch_requests_total` (counter) - Total fetch requests by platform, endpoint, and status
- `mds_fetcher_fetch_duration_seconds` (histogram) - Fetch operation duration by platform and endpoint
- `mds_fetcher_active_symbols` (gauge) - Number of actively monitored symbols

## Service Framework Integration

This service uses the service-framework-node package which provides:

1. **Environment Management**: Type-safe environment variable parsing with validation
2. **Diagnostics**: Structured logging with correlation IDs
3. **Metrics**: Prometheus metrics integration
4. **Process Lifecycle**: Graceful shutdown handling (SIGTERM, SIGINT, SIGUSR2)
5. **HTTP Server**: Pre-configured Fastify server with health checks and metrics

## Implementation Status

### ✅ Implemented
- Service context initialization
- HTTP server with health and metrics endpoints
- Status endpoint for fetcher state
- Metrics tracking (counters, histograms, gauges)
- Graceful shutdown handling
- Fetch loop skeleton with placeholder logic
- Support for multiple operational modes

### 🚧 TODO: Implement Production Logic

1. **HTTP Client Integration**
   - Add HTTP client library (e.g., `undici`, `axios`)
   - Implement platform-specific API clients
   - Add request retry logic with exponential backoff

2. **Storage Implementation**
   - Implement JSONL file writing
   - Add file rotation logic (hourly/daily)
   - Implement offset discovery from storage files
   - Add directory structure creation

3. **Rate Limiting**
   - Implement token bucket algorithm
   - Add platform-specific rate limit tracking
   - Handle 429 responses with backoff

4. **Endpoint Strategies**
   - Implement historical endpoint fetching with offset tracking
   - Implement snapshot endpoint continuous polling
   - Add completion detection for historical endpoints

5. **Error Handling**
   - Add comprehensive error recovery
   - Implement circuit breaker for persistent failures
   - Add alerting integration

6. **Configuration**
   - Add endpoint configuration per platform
   - Implement dynamic symbol list updates
   - Add backfill mode time range configuration

7. **Testing**
   - Add unit tests for fetch logic
   - Add integration tests with mock APIs
   - Add storage persistence tests

## Architecture

The service follows the modular context pattern:

```mermaid
graph TB
    Bootstrap[Bootstrap] --> Context[Create Context]
    Context --> Env[Environment Context]
    Context --> Diag[Diagnostic Context]
    Context --> Metrics[Metrics Context]
    Context --> Process[Process Context]
    
    Service[Start Service] --> HTTP[HTTP Server]
    Service --> Fetcher[Fetcher Loop]
    
    Env --> Service
    Diag --> Service
    Metrics --> Service
    Process --> Service
    
    Fetcher --> Fetch[Execute Fetch]
    Fetch --> Storage[(Storage)]
    
    HTTP --> Health[/health]
    HTTP --> MetricsEndpoint[/metrics]
    HTTP --> Status[/status]
```

## References

- [Service Framework Documentation](../../../packages/service-framework-node/README.md)
- [Market Data Simulator Fetcher Spec](../../../../docs/003_market_data_simulator_fetcher.md)
- [Binance API Documentation](https://binance-docs.github.io/apidocs/spot/en/)
- [Kraken API Documentation](https://docs.kraken.com/rest/)


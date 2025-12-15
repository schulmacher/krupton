# External Bridge: Data Collection Layer

The External Bridge represents the system's primary interface to external cryptocurrency exchanges, responsible for ingesting real-time market data through multiple protocols and ensuring data persistence with high reliability. This component implements a multi-process architecture optimized for both throughput and fault isolation, while maintaining deterministic data collection suitable for subsequent machine learning workflows.

## Architectural Overview

The External Bridge employs a process-based separation strategy, decomposing data collection responsibilities into three distinct process types: REST API fetchers, WebSocket stream consumers, and storage management services. Each process type operates independently with dedicated resource allocation, enabling selective scaling based on workload characteristics and providing fault isolation boundaries that prevent cascading failures across the data ingestion pipeline.

### Process Separation Model

**REST API Fetcher Processes** operate on a pull-based model, periodically polling exchange endpoints to retrieve historical trade data, order book snapshots, and exchange metadata. Each symbol-platform combination can be assigned to a dedicated fetcher process, allowing fine-grained control over API rate limits and enabling parallel data collection across multiple trading pairs without contention.

**WebSocket Stream Processes** maintain persistent connections to exchange WebSocket endpoints, consuming real-time trade executions and order book differential updates as they occur. The push-based nature of WebSocket streams requires continuous processing, making process isolation critical for preventing message queue overflow when downstream consumers experience temporary slowdowns.

**Storage Management Processes** handle orthogonal concerns including periodic statistics collection, backup orchestration, and historical data retention policies. By isolating these maintenance operations from active data ingestion, the system ensures that backup compression or cloud synchronization activities do not interfere with real-time data collection latency or throughput.

This decomposition enables independent deployment and restart strategies for each process type. REST fetchers can be restarted to adjust rate limiting parameters without disrupting live WebSocket streams. WebSocket processes implement platform-specific reconnection logic (such as Binance's 24-hour connection limit) without affecting historical data backfilling operations. Storage processes execute resource-intensive compression and cloud upload operations on independent schedules without blocking data ingestion pathways.

## Service Context Pattern

The External Bridge implements dependency injection through a structured context pattern, where each process receives a context object encapsulating all external dependencies and configuration. This pattern eliminates global state and facilitates testability by allowing mock implementations to replace production dependencies during unit testing.

The context object aggregates several subsystems:

**Storage Handles** provide type-safe access to RocksDB-backed persistence layers, with separate handles for each data entity type (historical trades, order book snapshots, differential depth updates, WebSocket trade streams). Each handle is configured with appropriate write permissions and compression settings, isolating storage configuration from business logic.

**ZeroMQ Publishers** enable broadcasting of ingested data to downstream consumers through inter-process communication channels. Publisher instances are organized in registries, allowing selective subscription to specific data streams based on platform and symbol identifiers. This registry pattern supports dynamic stream creation without service restarts.

**Rate Limiters** encapsulate platform-specific throttling logic, implementing sliding window algorithms with configurable request quotas and time windows. Rate limiter state (request counts, window boundaries) remains encapsulated within the context, preventing shared mutable state across concurrent operations.

**Typed API Clients** provide schema-validated interfaces to exchange REST and WebSocket endpoints, with compile-time type safety through TypeBox schema definitions. Client configuration includes base URLs, authentication headers, and retry policies, all initialized during context creation and immutable during process execution.

The context creation pattern follows a functional composition approach: environment configuration validation produces a validated configuration object; diagnostic subsystems (logging, metrics) are initialized from configuration; storage and messaging subsystems are instantiated with diagnostic context for structured logging; finally, API clients are constructed with authentication credentials and diagnostic hooks. This initialization sequence ensures that dependency ordering is explicit and that circular dependencies are architecturally impossible.

## REST API Fetcher Implementation

REST API fetchers implement a generic polling loop abstraction that periodically invokes exchange endpoints, persists responses to local storage, and broadcasts new data through ZeroMQ publishers. The implementation prioritizes reliability through comprehensive error handling and adaptive rate limiting while maintaining deterministic behavior suitable for offline replay scenarios.

### Fetcher Loop Abstraction

The core fetcher loop maintains internal state tracking fetch count, last fetch timestamp, and cumulative error count. This state enables health monitoring through metrics exposition and provides diagnostic context for debugging rate limiting issues or endpoint failures.

Each iteration executes a multi-phase workflow:

1. **Parameter Construction**: A user-provided function generates request parameters based on previous responses and stored state. For historical trades, this involves determining the next `fromId` parameter by inspecting the last persisted trade identifier. For periodic snapshots (exchange info, order book depth), parameters remain constant across invocations.

2. **Rate Limiting**: Before executing the HTTP request, the loop consults the rate limiter to determine whether the current request would exceed configured quotas. If the quota is exhausted, the fetcher sleeps until the sliding window advances sufficiently to accommodate the new request.

3. **Request Execution**: The typed API client performs the HTTP request with schema validation on the response payload. Request execution employs exponential backoff retry logic with configurable attempt limits and delay multipliers.

4. **Response Persistence**: Successful responses are persisted to RocksDB storage through entity-specific storage handles, which automatically assign sequential identifiers and extract timestamps for indexing.

5. **Message Broadcasting**: Persisted records are serialized to JSON and published through ZeroMQ publishers, enabling downstream consumers to process new data with minimal latency.

6. **Interval Management**: The loop calculates the remaining time until the next scheduled fetch, accounting for time consumed by request execution and persistence operations. If execution exceeds the configured interval, the next iteration begins immediately without introducing artificial delays that could compound latency.

### Rate Limiting Strategy

The rate limiter implements a sliding window algorithm that tracks request timestamps within a configurable time window. When a new request is attempted, the limiter counts recent requests within the window and compares against the maximum allowed quota. If the quota is exhausted, the limiter calculates the minimum delay required for the oldest request to fall outside the window, returning this delay to the caller.

The implementation distributes requests evenly across the time window rather than allowing burst behavior. By calculating `defaultWaitMs = windowMs / maxRequests`, the limiter enforces a steady request rate that maximizes throughput while maintaining deterministic spacing between requests. This approach prevents "thundering herd" scenarios where multiple fetchers exhaust rate limits simultaneously after synchronized restarts.

**Exponential Backoff on Errors**: When requests fail due to rate limiting (HTTP 429), network errors, or validation failures, the rate limiter enters a backoff state that applies multiplicative delays to subsequent requests. The backoff duration doubles with each consecutive error, capped at a configurable maximum (default 60 seconds). Successful requests reset the backoff state, allowing the system to quickly recover from transient failures while protecting against sustained error conditions that might indicate exchange outages or API changes.

This dual-mode behavior (steady-state even distribution, error-state exponential backoff) balances throughput optimization with defensive error handling. The steady-state mode maximizes data collection rates during normal operation, while the backoff mode prevents resource exhaustion when exchanges experience degraded performance or impose temporary rate limit penalties.

## WebSocket Stream Management

WebSocket connections provide real-time data delivery with significantly lower latency than REST polling, but introduce operational complexity through connection lifecycle management, message ordering guarantees, and state synchronization requirements. The External Bridge implements platform-specific WebSocket managers that encapsulate connection handling, subscription management, and automatic recovery from transient failures.

### Connection Lifecycle Management

WebSocket managers follow a state machine pattern with distinct phases: disconnected, connecting, connected, and reconnecting. State transitions are triggered by explicit API calls (connect, disconnect) and external events (network errors, server-initiated closures, heartbeat timeouts).

The connection establishment sequence involves opening the WebSocket transport, waiting for the connection confirmation, and issuing subscription requests for configured data streams. The manager maintains a registry of pending subscription requests, correlating outbound subscription messages with inbound acknowledgment messages through request identifiers. This correlation enables timeout detection for subscriptions that fail to receive acknowledgment within configurable intervals (default 5 seconds).

**Binance 24-Hour Connection Limit**: Binance WebSocket documentation specifies a maximum connection duration of 24 hours, after which connections are forcibly terminated by the exchange. To prevent disruptive unplanned disconnections during market activity, the External Bridge implements preemptive reconnection scheduling. Upon successful connection, the manager schedules a process restart 23 hours in the future, providing a one-hour safety margin. The scheduled restart triggers graceful shutdown of the current WebSocket connection, unsubscription from all streams, closure of ZeroMQ publishers, and finally process termination. PM2 process manager automatically restarts the terminated process, establishing fresh connections without manual intervention.

**Connection Uptime Tracking**: The manager records connection establishment timestamps and periodically updates metrics gauges with current uptime duration. This telemetry enables monitoring dashboards to visualize connection stability patterns and correlate data gaps with connection disruptions.

### Request/Response Correlation

Unlike REST APIs where each request receives a dedicated response, WebSocket protocols multiplex multiple logical streams over a single TCP connection. Binance and Binance implement different correlation strategies: Binance uses numeric request identifiers, while Kraken correlates by channel and symbol combinations.

**Binance Correlation**: When issuing subscription or unsubscription requests, the manager assigns monotonically increasing request identifiers and stores promise locks in a pending request registry keyed by identifier. Inbound messages containing matching identifiers trigger promise resolution, allowing the subscription workflow to await acknowledgment using standard async/await patterns. If no acknowledgment arrives within the timeout interval, the promise rejects and the manager logs diagnostic information including all pending request identifiers for debugging correlation failures.

**Kraken Correlation**: Kraken subscription acknowledgments are correlated by channel name and symbol list rather than opaque identifiers. The manager constructs composite keys (`${method}-${channel}`) and tracks expected acknowledgment counts equal to the number of symbols in each subscription request. Each inbound acknowledgment decrements the counter, resolving the promise only when all expected acknowledgments have been received. This batch correlation pattern accommodates Kraken's multi-symbol subscription semantics where a single request spawns multiple acknowledgment messages.

### Subscription Acknowledgment Handling

Subscription workflows follow a request-acknowledgment-stream pattern: the client issues a subscription request, awaits explicit acknowledgment from the server, and subsequently processes stream messages. The manager enforces timeout constraints on acknowledgment receipt to prevent indefinite blocking when exchanges fail to respond or reject invalid subscriptions.

Subscription failures (invalid symbols, unsupported channels, rate limit exhaustion) produce error acknowledgments that contain diagnostic information. The manager extracts error codes and messages, logs structured error records, and propagates exceptions to the calling context, enabling retry logic or alerting mechanisms to respond appropriately.

Successful acknowledgments update metrics gauges tracking active subscription counts, providing operational visibility into the number of distinct data streams currently flowing through each WebSocket connection.

## Order Book Continuity Management

Order books represent cumulative state: each differential update modifies the current book state by adding, removing, or updating price levels. Unlike stateless trade messages, order book reconstruction requires processing an uninterrupted sequence of differential updates starting from a known snapshot state. Connection disruptions or message loss corrupt the order book state, requiring resynchronization through snapshot retrieval.

### Gap Detection in Differential Streams

Binance order book differential updates (depth streams) contain sequential update identifiers encoded in two fields: `U` (first update ID in the message) and `u` (final update ID in the message). A valid continuous stream satisfies the invariant: for consecutive messages M₁ and M₂, M₂.U must equal M₁.u + 1. Violations of this invariant indicate missing messages between M₁ and M₂.

The External Bridge WebSocket process maintains per-symbol tracking of the last processed final update ID. When receiving a new differential message, the handler compares the message's first update ID against the expected value (last final ID + 1). If the comparison reveals a gap, the handler immediately suspends differential processing and initiates snapshot retrieval.

**Snapshot Retrieval Workflow**: Upon gap detection, the handler invokes the REST API client's order book snapshot endpoint, requesting maximum depth (1000 price levels). The snapshot request executes with exponential backoff retry logic to handle transient failures. Once retrieved, the snapshot is persisted to RocksDB storage and broadcast through ZeroMQ publishers, ensuring downstream consumers receive the new baseline state.

After snapshot persistence completes, the handler resumes differential update processing with the new snapshot's final update ID as the continuity reference point. This recovery sequence ensures that order book state remains consistent despite connection interruptions or message loss in the WebSocket transport layer.

## Historical Trade Gap Filling

While WebSocket streams provide real-time trade delivery with minimal latency, network disruptions or process restarts create temporal gaps in the collected trade sequence. The External Bridge implements an active gap detection and backfilling mechanism that scans WebSocket trade storage, identifies missing sequence ranges, and retrieves omitted trades through REST API historical trade endpoints.

### Gap Detection Algorithm

The gap detection algorithm leverages the sequential nature of trade identifiers assigned by exchanges. Each trade receives a monotonically increasing identifier unique within a symbol. By comparing consecutive trades in stored WebSocket messages, the system identifies gaps where the difference between sequential trade IDs exceeds one.

The algorithm operates iteratively:

1. **Read Latest API Trade ID**: Query RocksDB storage for the most recent trade retrieved through REST API historical trades endpoint. This establishes the lower bound of potential gaps.

2. **Scan WebSocket Trades**: Iterate through WebSocket trade storage starting from the global index corresponding to the API trade ID. Process trades in batches (default 100 records) to balance memory consumption and iteration overhead.

3. **Track Sequence Progression**: Maintain a reference to the last observed trade (gapStart). For each new trade, compare its ID against gapStart.ID + 1. If equal, the sequence is continuous; if greater, a gap exists between gapStart and the current trade.

4. **Event Loop Yielding**: Between batch iterations, yield control to the event loop through `await yieldToEventLoop()`. This prevents blocking the Node.js event loop during extensive storage scans, maintaining responsiveness for concurrent operations.

5. **Gap Range Identification**: When a gap is detected, record both the ending trade of the continuous sequence (gapStart) and the beginning trade of the next sequence (gapEnd). This range defines the missing trade identifiers.

### REST API Backfill Execution

Once a gap range is identified, the fetcher constructs a REST API historical trades request with parameters:

- `symbol`: Trading pair identifier
- `fromId`: gapStart.tradeId + 1 (first missing trade)
- `limit`: min(100, gapEnd.tradeId - fromId) (bounded by API limit)

The API returns up to 100 trades starting from `fromId`. The fetcher persists these trades to storage and broadcasts them through ZeroMQ publishers, identical to regular fetch operations. After persistence, the gap detection algorithm resumes scanning, potentially discovering additional gaps beyond the initially detected range.

This incremental backfill strategy handles arbitrarily large gaps by processing them in API-limited chunks (100 trades per request). The algorithm continues iterating until no gaps remain between the last API trade and the most recent WebSocket trade, at which point it enters a polling mode that checks for new gaps at regular intervals (default 10 seconds).

**Trade ID Ordering Considerations**: The algorithm assumes that trade IDs are strictly monotonic within a symbol but makes no assumptions about timestamp ordering. This design accommodates exchange implementations where trade timestamps may be adjusted retroactively (e.g., for settlement corrections) while trade IDs remain immutable identifiers of trade sequence.

## Symbol Normalization

Cryptocurrency exchanges employ heterogeneous symbol naming conventions: Binance concatenates base and quote assets without delimiters (BTCUSDT), while Kraken uses slash-separated pairs (XBT/USDT) and applies proprietary asset name mappings (XBT for Bitcoin). The External Bridge implements a normalization layer that translates platform-specific identifiers to a unified format, enabling downstream components to process data from multiple exchanges without platform-aware logic.

### Normalized Symbol Format

The normalized format adopts a lowercase underscore-delimited convention: `{base}_{quote}` where base represents the traded asset and quote represents the pricing currency. Examples include `btc_usdt`, `eth_usdt`, `sol_usdt`. This format provides consistent lexicographic ordering and straightforward parsing without requiring exchange-specific delimiter knowledge.

### Exchange Info Caching

Symbol normalization requires mapping platform-specific identifiers to base and quote asset symbols. Exchanges expose metadata endpoints describing supported trading pairs and asset properties. The External Bridge caches this metadata in memory during initialization and refreshes periodically through dedicated fetcher processes.

**Binance Exchange Info**: Binance provides a `/api/v3/exchangeInfo` endpoint returning an array of symbol objects containing `symbol` (e.g., "BTCUSDT"), `baseAsset` (e.g., "BTC"), and `quoteAsset` (e.g., "USDT") fields. The normalization function queries this cache using case-insensitive symbol matching, extracts base and quote assets, and constructs the normalized identifier.

**Kraken Asset Pairs**: Kraken's metadata is more complex, involving two separate endpoints: `/0/public/Assets` providing asset name mappings and `/0/public/AssetPairs` describing trading pairs with multiple naming variants. Each asset pair contains `altname` (simplified name like "BTCUSD"), `wsname` (WebSocket name like "XBT/USD"), `base`, and `quote` fields. The normalization layer maintains bidirectional mappings: from wsname to normalized format (for WebSocket message processing) and from normalized format to altname (for REST API requests).

Kraken applies proprietary asset name conventions: Bitcoin is identified as "XBT" rather than "BTC", "ZUSD" represents USD, "XXBT" is an extended Bitcoin identifier. The asset metadata endpoint provides `altname` mappings that translate these proprietary identifiers to conventional symbols. The normalization layer chains these mappings: trading pair → wsname → base/quote → asset altnames → normalized base/quote.

### Bidirectional Normalization

The system requires both directions of normalization:

**Platform-Specific to Normalized** (used when processing incoming data): WebSocket messages contain platform-specific symbols that must be normalized before storage key construction and ZeroMQ topic assignment. This ensures that subscribers can request data by normalized symbol regardless of source exchange.

**Normalized to Platform-Specific** (used when constructing API requests): Environment configuration specifies symbols in normalized format for platform-agnostic configuration. Fetcher initialization must convert these normalized symbols to platform-specific identifiers before constructing REST URLs or WebSocket subscription requests.

The bidirectional mapping functions throw exceptions when symbols are not found in cached metadata, failing fast during initialization rather than allowing invalid requests to propagate to exchange APIs. This fail-fast approach prevents silent failures from symbol typos or unsupported trading pairs.

## Storage Backup and Statistics Reporting

Persistent storage accumulates cryptocurrency market data at rates exceeding multiple gigabytes per day when monitoring dozens of symbols across multiple exchanges. The External Bridge implements automated backup orchestration and statistical monitoring to ensure data durability and provide visibility into storage resource consumption.

### Backup Orchestration

The storage backup process executes on a configurable schedule (default 3 hours) and follows a multi-phase workflow: compression, checksum generation, cloud synchronization, and historical retention enforcement.

**Compression Phase**: The backup process invokes the system `tar` utility to create a compressed archive of the entire storage directory using gzip compression. The archive filename encodes the backup timestamp in ISO 8601 format with colons and periods replaced by hyphens to ensure filesystem compatibility: `storage-2025-01-15T14-30-00-000.tar.gz`.

Archive creation employs streaming compression, processing files sequentially without loading entire directory contents into memory. This approach maintains bounded memory consumption regardless of storage size, enabling backup operations on resource-constrained systems.

**Checksum Generation**: After compression completes, the backup process computes a SHA-256 cryptographic hash of the archive file and persists the digest to a sidecar file with `.sha256` extension. The checksum file contains both the hexadecimal digest and the archive filename in a format compatible with `sha256sum -c` verification: `{digest}  {filename}\n`.

Checksums enable integrity verification after network transfers or long-term archival storage, detecting bit rot or transmission corruption without requiring full archive extraction and comparison against the original data.

**Historical Retention Policy**: The backup system maintains a configurable maximum backup count (default 7), implementing a retention policy that preserves recent backups while discarding older archives. After successful backup creation, the retention enforcer queries existing backup files, sorts by timestamp (encoded in filenames), and deletes the oldest archives exceeding the retention limit.

Additionally, the system detects and removes duplicate backups created within the same calendar date, preserving only the most recent backup for each day. This deduplication prevents storage exhaustion from frequent backup schedules that might create multiple archives per day during development or testing.

### Cloud Synchronization

Cloud synchronization employs rclone, a command-line program supporting dozens of cloud storage providers through a unified interface. The synchronization workflow implements a three-phase protocol: push local backups to cloud, pull cloud backups missing locally, and reconcile by deleting cloud backups that violate retention policies.

**Push Phase**: The synchronizer enumerates local backup files (both `.tar.gz` archives and `.sha256` checksums), queries the remote storage for existing files, and uploads only those absent from the cloud. This incremental approach minimizes bandwidth consumption by avoiding redundant uploads of previously synchronized backups.

**Pull Phase**: The synchronizer retrieves the list of backup files present in cloud storage, compares against local filesystem, and downloads any backups present remotely but missing locally. This bidirectional synchronization enables disaster recovery scenarios where local storage is lost but cloud backups remain intact.

**Reconcile Phase**: After bidirectional synchronization completes, the reconciler applies the historical retention policy to cloud storage, deleting backups that exceed the configured maximum count. This ensures that cloud storage costs remain bounded while maintaining sufficient backup history for recovery scenarios.

The synchronization workflow executes within a temporary staging directory, copying local backups before cloud operations begin. This isolation prevents synchronization failures from corrupting the primary backup directory, maintaining local backup integrity even if cloud operations encounter network failures or authentication errors.

### Storage Statistics Collection

The statistics reporter periodically scans the storage directory hierarchy, accumulating file counts and size totals for each data category (platform, endpoint, symbol). Statistics are exposed through Prometheus metrics gauges, enabling monitoring dashboards to visualize storage growth rates and identify symbols consuming disproportionate disk space.

The reporter employs recursive directory traversal with pattern-based categorization. Directory paths matching patterns like `external-bridge/binance/ws_trade/{symbol}` are classified into categories like `external-bridge/binance/ws_trade`. File metadata (size, modification timestamp) is accumulated into category-specific buckets.

Statistics collection executes asynchronously on a periodic schedule (default 60 seconds) independent of data ingestion operations. The reporter process maintains isolation from fetcher and WebSocket processes, preventing statistics gathering from interfering with real-time data collection latency.

Collected statistics update Prometheus metrics including:
- `storage_directory_size_bytes{directory}`: Total bytes consumed by category
- `storage_directory_file_count{directory}`: Number of files in category  
- `storage_directory_last_updated_timestamp{directory}`: Most recent file modification time

These metrics enable proactive monitoring of storage capacity, alerting when growth rates approach filesystem limits, and identifying data retention policy violations where old data fails to be pruned according to configured schedules.

## Environment-Based Configuration

The External Bridge configuration follows a declarative approach using TypeBox schema definitions that provide both runtime validation and compile-time type inference. Configuration parameters are sourced exclusively from environment variables, enabling container-based deployment strategies and facilitating secret management through platform-specific mechanisms (Kubernetes secrets, AWS Parameter Store, etc.).

### Symbol Configuration

The `SYMBOLS` environment variable accepts a comma-separated list of normalized trading pair identifiers: `btc_usdt,eth_usdt,sol_usdt`. During process initialization, this string is parsed into an array, normalized symbols are validated against cached exchange metadata, and platform-specific symbols are resolved through the normalization layer.

This configuration approach enables dynamic symbol set adjustment without code changes or application rebuilds. Adding a new trading pair requires only updating the environment variable and restarting the affected processes, with PM2 handling graceful shutdown and startup sequences.

### Platform-Specific Parameters

Rate limiting configuration varies dramatically across exchanges: Binance allows 2400 requests per minute for authenticated clients, while Kraken limits unauthenticated requests to 1 per second. The External Bridge exposes platform-specific rate limiting parameters through environment variables:

- `RATE_LIMIT_MAX_REQUESTS`: Maximum requests within the time window
- `RATE_LIMIT_WINDOW_MS`: Time window duration in milliseconds

Fetcher processes initialize rate limiters with these parameters during context creation. This externalized configuration enables operators to adjust rate limits in response to exchange policy changes or account tier upgrades without modifying application code.

Similar parameterization applies to WebSocket URLs (`WSS_BASE_URL`), REST API base URLs (`API_BASE_URL`), authentication credentials (`API_KEY`, `API_SECRET`), and storage paths (`STORAGE_BASE_DIR`). This comprehensive externalization eliminates hardcoded configuration, supporting multi-tenant deployments where different process instances connect to different exchanges or API endpoints simultaneously.

## Conclusion

The External Bridge implements a robust, scalable data collection layer that ingests real-time cryptocurrency market data from multiple exchanges while maintaining data integrity guarantees suitable for downstream machine learning applications. Process-based isolation enables independent scaling and fault tolerance, while sophisticated error handling and gap filling mechanisms ensure data completeness despite network disruptions or API failures.

The component's design prioritizes operational simplicity through externalized configuration, automated backup orchestration, and comprehensive metrics exposition. Symbol normalization abstracts platform-specific naming conventions, enabling downstream components to process multi-exchange data through uniform interfaces. Rate limiting and exponential backoff strategies protect against API quota exhaustion while maximizing data collection throughput.

This architecture establishes the foundation for deterministic offline data replay, enabling machine learning model development workflows that require reproducible training data sequences. The combination of RocksDB persistent storage, gap filling algorithms, and order book continuity management ensures that collected data forms complete, temporally ordered sequences suitable for time-series analysis and predictive modeling.


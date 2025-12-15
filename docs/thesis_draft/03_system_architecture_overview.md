# System Architecture Overview

This chapter presents the architectural design of the real-time cryptocurrency market data processing and prediction system. The system is implemented as a polyglot monorepo integrating TypeScript, Python, and Rust components, employing a service-oriented architecture with clear separation of concerns across data ingestion, transformation, storage, and prediction layers.

## Repository Organization

The monorepo follows a domain-driven directory structure partitioning code by responsibility and deployment model. The repository is organized into three primary directories, each serving a distinct architectural purpose.

The `apps/` directory contains independently deployable services implementing core system functionality. The external-bridge service manages exchange data ingestion from cryptocurrency platforms, the internal-bridge service performs data transformation and stream management operations, and the py-predictor service handles machine learning model training and inference. Each application operates as an autonomous service with well-defined responsibilities and minimal coupling to other applications.

The `packages/` directory contains shared libraries and cross-cutting infrastructure consumed as dependencies by applications and other packages through the pnpm workspace protocol. This includes service frameworks providing operational capabilities, API clients abstracting exchange connectivity, storage abstractions encapsulating persistence logic, messaging libraries enabling inter-process communication, and utility functions supporting common operations. Package implementations remain application-agnostic, ensuring reusability across different service contexts.

The `runtime/` directory contains deployment infrastructure and monitoring stack configurations decoupled from application code to enable independent infrastructure evolution. This includes VictoriaMetrics time-series database configuration for metrics storage and Perses dashboard-as-code definitions for observability visualization.

This organizational structure enables clear dependency boundaries where applications depend on packages but packages remain application-agnostic. The separation facilitates selective deployment, allowing individual services to be deployed without rebuilding the entire monorepo, and supports independent versioning of infrastructure components without affecting application code stability.

### Zero-Knowledge Setup Philosophy

The repository implements a "zero-knowledge setup" philosophy minimizing onboarding friction for new developers. The setup process requires only three sequential commands to achieve a fully operational development environment.

Executing `npm install` at the repository root automatically triggers pnpm installation and workspace dependency resolution. This automated process includes runtime infrastructure setup with automatic platform-specific binary downloads for the developer's operating system, eliminating manual download and configuration steps typically required for monitoring infrastructure.

Subsequent execution of `pnpm build` compiles all TypeScript packages and Rust native bindings across the monorepo in dependency order, ensuring that shared libraries are built before dependent applications. The build process leverages workspace awareness to optimize compilation, rebuilding only modified packages and their dependents.

Finally, `pnpm --filter '<workspace-name>' start` launches any application or runtime service without requiring manual configuration, environment setup, or knowledge of language-specific toolchains. This unified interface abstracts the complexity of heterogeneous runtime environments, enabling new developers to run the complete system or individual components within minutes of repository clone.

## Language-Agnostic Task Orchestration

Despite being a JavaScript package manager, pnpm serves as a language-agnostic task runner across the entire monorepo. This design decision addresses the challenge of managing heterogeneous codebases while maintaining consistent developer workflows and CI/CD pipeline definitions.

Each workspace, regardless of implementation language (TypeScript, Python, or Rust), defines standardized npm scripts in its `package.json` file. These scripts implement a uniform interface with common target names: `build`, `test`, `lint`, `format`, and `typecheck`. The script implementations delegate execution to language-specific toolchains appropriate for each workspace.

For example, Python packages execute `uv run pytest` for testing and `uv run ruff check` for linting, while Rust packages invoke `cargo build` for compilation. TypeScript packages use `tsc` for compilation and `vitest` for testing. The pnpm workspace filtering mechanism provides a unified command interface: `pnpm --filter '<package-name>' <command>` executes the specified command for the target package, abstracting away language-specific invocation details.

This abstraction eliminates the need for developers to remember language-specific command invocations or navigate to individual package directories. Instead, a consistent command pattern applies across all workspaces: `pnpm --filter 'service-framework-node' test` executes TypeScript tests, while `pnpm --filter 'py-service-framework' test` executes Python tests, despite invoking entirely different testing frameworks.

The approach enables consistent CI/CD pipeline definitions regardless of implementation language. A single pipeline configuration can execute uniform commands across heterogeneous workspaces, treating TypeScript services, Python workers, and Rust native modules as uniform workspace members within the monorepo structure.

## Granular Development Workflow with PM2

The PM2 process manager enables fine-grained control over multi-service development environments through hierarchical ecosystem configurations. This architectural pattern addresses the challenge of managing multiple interdependent services during development while maintaining resource efficiency and developer productivity.

Developers can selectively start specific combinations of services by composing modular PM2 configuration files. For instance, a developer working on Binance trade processing can start only the Binance trade and order importers for BTCUSDT and ETHUSDT symbols, rather than launching the complete service mesh including Kraken integrations and additional symbol processors. This selective activation reduces resource consumption and cognitive overhead by limiting active services to those relevant to the current development task.

Each application (external-bridge, internal-bridge, py-predictor) defines service-specific ecosystem configurations organized by environment (development versus production). Environment-level composition files enable orchestration of arbitrary service subsets, supporting iterative development workflows where only relevant services are running while maintaining the ability to scale to full-system integration testing when required.

The PM2 watch mode enables automatic process restarts on file changes, providing immediate feedback during development iterations. The ecosystem approach treats Node.js services (TypeScript executed via tsx interpreter) and Python services uniformly, providing consistent process management semantics across language boundaries.

### Alternative: Docker Containerization

While Docker containerization provides an alternative deployment strategy suitable for production isolation and reproducibility, direct process execution on the local machine offers superior development experience for active development workflows. The direct execution approach provides faster iteration cycles by eliminating image rebuild overhead, native debugging capabilities through direct process attachment, direct file system access enabling hot-reloading of source code changes, and reduced resource overhead by avoiding containerization layer abstraction. These factors make PM2's native process management more natural and efficient for development environments, while Docker remains the preferred deployment mechanism for production environments requiring isolation guarantees and infrastructure portability.

## Deterministic Offline Development

The RocksDB-based storage architecture with SegmentedLog abstraction enables complete offline operation without external service dependencies. This capability addresses critical requirements for development environment stability and machine learning model reproducibility.

Historical market data, including REST API responses and WebSocket streams, is persisted with sequential append operations optimized for time-series data. Storage organization follows a hierarchical structure partitioned by platform, endpoint, and symbol indices, creating a deterministic dataset that supports reproducible replay across multiple development iterations.

The primary/secondary instance pattern allows write operations on the primary instance while multiple read-only secondary instances enable concurrent replay without blocking active data ingestion. This architectural separation ensures that development activities involving historical data replay do not interfere with ongoing data collection from live exchanges.

During development, stored historical data can be replayed through iterator-based consumption with offset management. The internal-bridge and downstream prediction workers process identical event sequences across multiple development iterations, ensuring consistency in data transformation logic validation and feature engineering pipeline testing.

### Importance for Machine Learning Development

This determinism is critical for machine learning model development, where consistent feature engineering and model evaluation require exact replay of market data sequences. Model performance comparisons across different feature sets or algorithmic variants demand identical input data to ensure that observed performance differences result from model modifications rather than data variation.

The approach eliminates the nondeterminism inherent in live data streams, including variable message arrival times, network failures, and exchange downtime. The controlled testing environment enables validation of data transformation logic, offset management, and consumer stream semantics without depending on external infrastructure availability or incurring API rate limit costs associated with repeated exchange API queries.

## Service-Oriented Architecture

The system implements a service-oriented architecture with distinct processing layers, each addressing specific system responsibilities through specialized components.

### Service Framework

The service framework provides a standardized operational foundation delivering unified operational capabilities across TypeScript and Python services. This dual-language support ensures operational consistency across heterogeneous service implementations.

#### Service Framework Node

The `service-framework-node` package provides a Node.js/TypeScript framework implementing comprehensive operational capabilities. The framework includes diagnostics through structured logging with correlation IDs enabling request tracing across service boundaries, metrics exposition through Prometheus integration for VictoriaMetrics ingestion, type-safe environment configuration validation using TypeBox schemas, process lifecycle management including signal handling and graceful shutdown coordination, and HTTP/WebSocket server management based on Fastify.

The framework employs a modular context creation pattern separating subsystem initialization from server lifecycle management. This separation enables dependency injection for testing and supports flexible composition of framework capabilities based on service requirements.

#### Python Service Framework

The `py-service-framework` package provides equivalent framework capabilities for Python services using Pydantic for configuration validation. The Python framework implements identical operational patterns including process lifecycle management, structured logging, Prometheus metrics exposition, and HTTP server support, ensuring operational consistency across language boundaries. This consistency enables uniform monitoring, logging, and lifecycle management across the heterogeneous service landscape.

### API Client Architecture

The API client architecture implements a layered abstraction for exchange connectivity with schema-driven validation. The architecture comprises three specialized packages addressing different aspects of exchange communication.

#### HTTP REST Client

The `api-client-node` package implements an HTTP REST client using Undici for high-performance request execution. The client provides path parameter interpolation for dynamic URL construction, query string construction with automatic encoding, request and response body validation using TypeBox schemas, structured error handling distinguishing fetch errors, HTTP status errors, and validation errors, and authentication header injection for authenticated endpoints.

The client architecture abstracts exchange-specific HTTP communication details while providing type-safe interfaces through TypeScript integration and runtime validation through schema-based verification.

#### WebSocket Client

The `api-client-ws-node` package implements WebSocket connectivity with runtime message validation and type-safe stream handling. The implementation employs compiled TypeBox validators for message schema verification, providing early detection of protocol violations or malformed messages.

Stream-specific message identification occurs through discriminator functions enabling multiplexed stream handling over single WebSocket connections. The client implements structured error handling for connection errors and validation errors, providing detailed error information including the specific schema violations encountered. Type-safe handler dispatch based on stream definitions ensures that message handlers receive correctly typed message objects.

#### Unified Schema Definitions

The `api-interface` package provides unified schema definitions for Binance and Kraken APIs, covering both HTTP REST endpoints and WebSocket streams. Schemas are defined using TypeBox, enabling compile-time type inference for TypeScript consumers and runtime validation schemas for request parameters (including path parameters, query parameters, and request bodies) and response structures.

This dual-purpose schema definition eliminates manual type assertions and code generation requirements. TypeScript consumers benefit from automatic type inference, while runtime validation ensures that actual API responses conform to declared schemas, providing early detection of API contract violations or unexpected response formats.

### Storage Infrastructure

The storage infrastructure implements cross-language persistent storage using RocksDB's LSM tree architecture, providing high-performance sequential write operations and indexed read access optimized for time-series data workloads.

#### Rust RocksDB Bindings

The `rust-rocksdb-napi` package provides cross-language RocksDB bindings written in Rust. The package uses NAPI-RS for Node.js integration via N-API and Maturin for Python integration via PyO3, enabling shared storage infrastructure across TypeScript and Python services.

This custom binding implementation was necessary because existing language-specific RocksDB libraries (node-rocksdb, python-rocksdb) are unmaintained or lack required features such as secondary instance support. The implementation provides a SegmentedLog abstraction with sequential append operations optimized for time-series data, compression support using LZ4 and Zstd algorithms, primary/secondary instance patterns enabling concurrent read access without blocking write operations, iterator-based batch reading with configurable batch sizes for efficient large-scale data consumption, and truncation operations enabling efficient log cleanup and historical data removal.

#### High-Level Storage Layer

The `persistent-storage-node` package implements a high-level TypeScript storage layer providing entity-based abstractions for storing REST API responses and WebSocket messages. The package implements per-endpoint storage entities for each supported data source, including Binance and Kraken historical trades, order books, depth streams, and ticker streams.

Storage entities implement automatic subindex management for partitioning data by symbol and timestamp, enabling efficient querying and selective data access. Data transformers convert platform-specific formats to unified schemas, producing unified trades with normalized fields across exchanges and unified order books with standardized bid/ask structures, facilitating platform-agnostic downstream processing.

Multi-entity readers enable consumption across multiple data sources with offset tracking and iterator-based streaming, supporting efficient processing of heterogeneous data sources through a uniform consumption interface.

### Inter-Process Communication

The inter-process communication layer implements ZeroMQ-based messaging for high-performance IPC between Node.js services. ZeroMQ provides lower latency and higher throughput compared to traditional TCP-based message brokers, making it suitable for high-frequency market data distribution.

#### Messaging Implementation

The `messaging-node` package implements ZeroMQ pub/sub patterns through publisher and subscriber abstractions with a registry pattern for managing multiple stream endpoints. Publishers implement send queuing with cache buffering when the socket is busy, async send operations with batching support processing up to 100 messages per batch, and JSON serialization of storage records for wire transmission.

Subscribers provide async iterator-based message consumption enabling integration with modern asynchronous JavaScript patterns, automatic deserialization of JSON payloads, and connection management with socket templates enabling dynamic endpoint creation. The socket template pattern uses functions to generate IPC socket paths based on platform and symbol identifiers, enabling selective subscription to specific data streams.

The registry pattern enables selective subscription to specific data streams differentiated by platform, instrument, or data type without requiring full mesh connectivity. A subscriber can connect to only the Binance BTCUSDT trade stream without establishing connections to Kraken streams or other symbol streams, reducing resource consumption and network overhead.

### Shared Infrastructure

The shared infrastructure comprises common utilities and configuration management supporting all applications and packages.

#### Utilities

The `utils` package provides reusable utility functions employed throughout the codebase. This includes exponential backoff retry logic through the `tryHard` function with configurable initial delay, maximum delay, and backoff multiplier parameters; async coordination primitives including promise locks for synchronization and event loop yielding for preventing event loop blocking; collection helpers including array-to-multimap transformations for grouping operations; and type guards including nil checks and safe JSON stringification handling serialization errors gracefully.

#### Configuration Management

The `config` package provides centralized configuration files for monorepo-wide tool consistency. This includes ESLint rules ensuring consistent code quality standards, Prettier formatting rules maintaining uniform code style, TypeScript base configuration establishing common compiler options, Vitest test configuration defining test execution parameters, and tsup bundler settings standardizing build processes.

These centralized configurations ensure uniform code style, linting rules, and build processes across all TypeScript and JavaScript packages regardless of their runtime environment, reducing configuration maintenance overhead and ensuring consistency as new packages are added.

## Architectural Patterns

The system architecture employs several recurring patterns addressing common challenges across different system components.

### Schema-Driven Type Safety

Endpoint definitions explicitly declare HTTP paths, methods, query parameters, request bodies, and response schemas using TypeBox. This schema-driven approach provides both compile-time type safety through TypeScript type inference and runtime validation through compiled validators.

Runtime validation occurs through compiled TypeBox validators, ensuring request and response conformance without manual type assertions. When an API response is received, the validator checks that the response structure matches the declared schema, detecting missing fields, incorrect types, or unexpected additional fields. TypeScript type inference provides compile-time safety by deriving static types from schema definitions, enabling IDE autocomplete, compile-time error detection, and refactoring support without code generation overhead.

This dual-purpose approach eliminates the need for separate type definition files and validator implementations, reducing maintenance burden and ensuring consistency between compile-time types and runtime validation logic.

### Entity-Based Storage Abstraction

Storage entities encapsulate platform-specific API response persistence logic for different combinations of platform (Binance versus Kraken) and data source type (REST versus WebSocket). Each entity implements normalized subindex naming conventions ensuring consistent storage organization, automatic timestamp extraction from platform-specific message formats, and batch operations optimizing write throughput for high-frequency data ingestion.

This abstraction enables uniform storage access patterns regardless of underlying data source characteristics. Consumers interact with storage through a consistent interface, abstracting platform-specific message format differences and storage organization details.

### Registry Pattern for IPC

Publisher and subscriber registries manage collections of ZeroMQ sockets with template-based endpoint generation. The registry pattern enables dynamic stream selection at runtime, allowing services to subscribe only to required data streams without modifying connection topology or requiring service restarts.

For example, a prediction worker can subscribe exclusively to Binance BTCUSDT trades by connecting to the corresponding socket generated by the template function. Adding support for ETHUSDT requires only invoking the template function with the new symbol identifier, without modifying the worker's connection logic or deploying updated configuration files.

### Platform Extensibility

Adding new cryptocurrency exchanges requires minimal integration effort due to architectural decoupling and generic abstractions. Platform integration follows an established pattern consisting of four steps.

First, developers define TypeBox schemas for platform-specific REST endpoints and WebSocket messages in isolated `api-interface` subdirectories following the naming convention `newPlatform/newPlatformHttp/` and `newPlatform/newPlatformWS/`. These schemas declare the specific request parameters and response structures for the new exchange.

Second, developers create platform-specific context and process files in `external-bridge` following existing templates such as `newPlatformWebsocketContext.ts` and `newPlatformWebsocketProcess.ts`. These files implement the service initialization and data ingestion logic specific to the new platform's connection requirements.

Third, developers add socket template functions to `messaging-node` constants following consistent naming conventions such as `newPlatformTradeWs` and `newPlatformOrderBook`. These templates enable other services to subscribe to the new platform's data streams using the established registry pattern.

Fourth, developers implement storage entities in `persistent-storage-node` by creating thin wrapper functions that invoke generic storage factories with platform-specific stream definitions, such as `createWebSocketStorage<typeof NewPlatformWS.TradeStream>`. This approach leverages TypeScript generics to automatically derive type-safe storage interfaces (`WebSocketStorage<T>`, `WebSocketStorageRecord<T>`) without manual type definitions or boilerplate code.

Platform implementations remain isolated without cross-platform dependencies, relying only on shared infrastructure including the service framework, storage layer, and messaging abstractions. This isolation enables parallel development of multiple exchange integrations without coordination overhead or regression risk to existing platforms. A developer adding support for a new exchange does not need to modify or test existing Binance or Kraken integrations.

## Operational Simplicity and Storage Evolution

The final RocksDB-based storage architecture eliminates distributed broker cluster maintenance, including ZooKeeper, Kafka cluster coordination, and partition rebalancing, while retaining essential streaming semantics through the SegmentedLog abstraction with sequential ordering, offset-based consumption, and primary/secondary instance pattern for concurrent read access.

### Storage Backend Evolution

This design evolved through iterative experimentation with alternative storage backends, each addressing limitations of previous approaches while introducing new challenges.

The initial JSONL (newline-delimited JSON) implementation provided human-readable storage and simple append-only semantics. However, this approach exhibited excessive disk usage due to lack of compression and required manual byte-offset indexing for efficient random access. Without byte-offset indexing, each read operation required scanning the file from the beginning to locate specific records, resulting in O(n) read complexity for accessing records by offset.

The subsequent SQLite implementation reduced disk usage through SQLite's internal storage optimizations but still accumulated over 10 GB daily with only 5 symbols per platform as the database grew with continuous high-frequency data ingestion. More critically, truncation operations on tables containing millions of records required tens of minutes to complete, during which write operations were blocked due to SQLite's global write lock. This blocking behavior made historical data cleanup operations disruptive to live data ingestion.

RocksDB's LSM tree architecture addresses these limitations through several design characteristics. Built-in compression using LZ4 or Zstd algorithms reduces storage footprint by exploiting repetitive patterns in JSON-serialized market data. Efficient range deletion via compaction enables sub-second truncation of historical data by marking key ranges as deleted and performing cleanup during background compaction operations, avoiding write blocking. Write-optimized sequential append operations support high-throughput ingestion without blocking read access through the primary/secondary instance pattern, where writes occur on the primary instance while read-only secondary instances serve queries independently.

### Performance Characteristics

Subsequent performance evaluation (discussed in Chapter 13) demonstrates RocksDB's performance advantages for this specific workload, validating the architectural decision to adopt RocksDB over alternative storage backends.

## Observability Infrastructure

The observability infrastructure implements Dashboard-as-Code monitoring using Perses and VictoriaMetrics for tracking process memory usage, custom application metrics, and system-wide telemetry. This approach demonstrates the feasibility of declarative observability configuration in both development and production environments.

Dashboard definitions are version-controlled alongside application code, enabling reproducible dashboard deployments and ensuring that observability configuration evolves in sync with system architecture changes. This approach contrasts with manual dashboard construction through web interfaces, which often leads to configuration drift and loss of dashboard definitions when infrastructure is rebuilt.

## Data Flow and System Integration

The complete system implements a data flow from external cryptocurrency exchanges through multiple processing stages to final predictions. Exchange data enters through the external-bridge, undergoes normalization and stream management in the internal-bridge, persists in RocksDB storage, distributes through ZeroMQ messaging, and feeds machine learning model training and inference in py-predictor.

The architecture establishes clear separation of concerns across processing stages. The service framework handles operational cross-cutting concerns including observability, configuration management, and process lifecycle management consistently across Node.js and Python services. The API client layer abstracts exchange connectivity with schema-driven validation and type-safe interfaces, isolating downstream components from exchange-specific protocol details. The storage infrastructure provides cross-language RocksDB-based persistence with entity abstraction and data transformation pipelines, enabling efficient data access patterns. The messaging layer enables high-performance IPC through ZeroMQ pub/sub with selective stream subscription, minimizing network overhead. Shared infrastructure including utilities and configuration ensures consistency across the polyglot codebase.

This layered architecture implements Kafka-like streaming semantics including ordered consumption, offset tracking, and replay capability atop RocksDB without distributed broker complexity, achieving the operational characteristics of stream processing systems while maintaining operational simplicity suitable for single-machine deployments and development environments.

## Technologies and Tools

This section provides references to all technologies, frameworks, libraries, and tools employed in the system implementation.

**Package Management and Build Tools**
- pnpm - https://pnpm.io/ - Fast, disk space efficient package manager
- npm - https://www.npmjs.com/ - Node.js package manager

**Programming Languages and Runtimes**
- TypeScript - https://www.typescriptlang.org/ - Typed superset of JavaScript
- Node.js - https://nodejs.org/ - JavaScript runtime
- Python - https://www.python.org/ - High-level programming language
- Rust - https://www.rust-lang.org/ - Systems programming language

**Python Toolchain**
- uv - https://github.com/astral-sh/uv - Fast Python package installer and resolver
- Ruff - https://github.com/astral-sh/ruff - Fast Python linter and formatter
- Pydantic - https://docs.pydantic.dev/ - Data validation library using Python type annotations

**Rust Build Tools**
- Cargo - https://doc.rust-lang.org/cargo/ - Rust package manager and build tool
- NAPI-RS - https://napi.rs/ - Framework for building Node.js addons in Rust
- Maturin - https://github.com/PyO3/maturin - Build and publish Rust-based Python packages
- PyO3 - https://pyo3.rs/ - Rust bindings for Python

**TypeScript/JavaScript Tools**
- tsx - https://github.com/privatenumber/tsx - TypeScript execute - run TypeScript files directly
- TypeBox - https://github.com/sinclairzx81/typebox - JSON Schema type builder with static type inference
- Vitest - https://vitest.dev/ - Vite-native testing framework
- ESLint - https://eslint.org/ - JavaScript and TypeScript linter
- Prettier - https://prettier.io/ - Code formatter
- tsup - https://tsup.egoist.dev/ - TypeScript bundler

**Web Frameworks and HTTP Clients**
- Fastify - https://fastify.dev/ - Fast and low overhead web framework for Node.js
- Undici - https://undici.nodejs.org/ - HTTP/1.1 client for Node.js

**Database and Storage**
- RocksDB - https://rocksdb.org/ - Embeddable persistent key-value store for fast storage
- SQLite - https://www.sqlite.org/ - Self-contained SQL database engine

**Compression Libraries**
- LZ4 - https://lz4.github.io/lz4/ - Extremely fast compression algorithm
- Zstd - https://facebook.github.io/zstd/ - Fast lossless compression algorithm

**Messaging and IPC**
- ZeroMQ - https://zeromq.org/ - High-performance asynchronous messaging library

**Monitoring and Observability**
- Prometheus - https://prometheus.io/ - Monitoring system and time series database
- VictoriaMetrics - https://victoriametrics.com/ - Fast, cost-effective monitoring solution
- Perses - https://perses.dev/ - Dashboards-as-code for observability

**Process Management**
- PM2 - https://pm2.keymetrics.io/ - Production process manager for Node.js applications
- Docker - https://www.docker.com/ - Container platform

**Cryptocurrency Exchanges (Data Sources)**
- Binance - https://www.binance.com/ - Cryptocurrency exchange
- Kraken - https://www.kraken.com/ - Cryptocurrency exchange

**Comparison Technologies (Mentioned but Not Used)**
- Apache Kafka - https://kafka.apache.org/ - Distributed streaming platform
- Apache ZooKeeper - https://zookeeper.apache.org/ - Distributed coordination service


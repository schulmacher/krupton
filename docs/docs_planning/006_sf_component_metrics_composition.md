# Component Metrics Composition

## Overview

Component metrics are defined as configuration constants that can be composed together. This allows processes to combine metrics from multiple components they use.

## Metric Configuration Pattern

### Definition in Component Metrics

Each component exports its metrics as a configuration object:

```typescript
// packages/service-framework-node/src/componentMetrics/components/externalBridgeFetcher.ts
const fetchCounter: MetricConfigCounter<'platform' | 'endpoint' | 'status'> = {
  name: 'fetch_requests_total',
  help: 'Total number of fetch requests',
  labelNames: ['platform', 'endpoint', 'status'] as const,
};

export const externalBridgeFetcherMetrics = {
  fetchCounter,
  fetchDuration,
  activeSymbolsGauge,
  // ... other metrics
};
```

### Usage in Process Context

Processes instantiate only the metrics they need:

```typescript
// apps/external-bridge/src/process/fetcherProcess/context.ts
const metricsContextBase = SF.createMetricsContext({
  envContext,
  enableDefaultMetrics: true,
  prefix: '',
});

const metrics = {
  fetchCounter: metricsContextBase.createCounter(SF.externalBridgeFetcherMetrics.fetchCounter),
  fetchDuration: metricsContextBase.createHistogram(SF.externalBridgeFetcherMetrics.fetchDuration),
  // ... other metrics
};

const metricsContext = SF.createMetricsContext({
  envContext,
  enableDefaultMetrics: true,
  metrics,
});
```

## Composing Metrics from Multiple Components

When a process uses services from multiple components, it can combine their metrics:

### Example: External Bridge Fetcher Using Storage

The `externalBridgeFetcher` process uses the `externalBridgeStorage` service to write files, so it can expose metrics from both components:

```typescript
const metricsContextBase = SF.createMetricsContext({
  envContext,
  enableDefaultMetrics: true,
});

// Combine metrics from both components
const metrics = {
  // Fetcher-specific metrics
  fetchCounter: metricsContextBase.createCounter(SF.externalBridgeFetcherMetrics.fetchCounter),
  fetchDuration: metricsContextBase.createHistogram(SF.externalBridgeFetcherMetrics.fetchDuration),
  activeSymbolsGauge: metricsContextBase.createGauge(SF.externalBridgeFetcherMetrics.activeSymbolsGauge),
  
  // Storage metrics (used by the storage service)
  storageWriteOps: metricsContextBase.createCounter(SF.externalBridgeStorageMetrics.writeOperations),
  storageWriteDuration: metricsContextBase.createHistogram(SF.externalBridgeStorageMetrics.writeDuration),
  storageFileCount: metricsContextBase.createGauge(SF.externalBridgeStorageMetrics.fileCount),
};
```

## Benefits

1. **Composability**: Processes can combine metrics from any components they use
2. **Type Safety**: Metric configurations are fully typed with label names
3. **Reusability**: Metric definitions are centralized and consistent
4. **Flexibility**: Each process creates only the metrics it needs
5. **Clear Dependencies**: It's explicit which component metrics a process uses


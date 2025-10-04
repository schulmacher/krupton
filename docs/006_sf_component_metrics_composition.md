# Component Metrics Composition

## Overview

Component metrics are defined as configuration constants that can be composed together. This allows processes to combine metrics from multiple components they use.

## Metric Configuration Pattern

### Definition in Component Metrics

Each component exports its metrics as a configuration object:

```typescript
// packages/service-framework-node/src/componentMetrics/components/mdsFetcher.ts
const fetchCounter: MetricConfigCounter<'platform' | 'endpoint' | 'status'> = {
  name: 'fetch_requests_total',
  help: 'Total number of fetch requests',
  labelNames: ['platform', 'endpoint', 'status'] as const,
};

export const mdsFetcherMetrics = {
  fetchCounter,
  fetchDuration,
  activeSymbolsGauge,
  // ... other metrics
};
```

### Usage in Process Context

Processes instantiate only the metrics they need:

```typescript
// apps/market-data-simulator/src/process/mdsFetcherProcess/context.ts
const metricsContextBase = SF.createMetricsContext({
  envContext,
  enableDefaultMetrics: true,
  prefix: '',
});

const metrics = {
  fetchCounter: metricsContextBase.createCounter(SF.mdsFetcherMetrics.fetchCounter),
  fetchDuration: metricsContextBase.createHistogram(SF.mdsFetcherMetrics.fetchDuration),
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

### Example: MDS Fetcher Using Storage

The `mdsFetcher` process uses the `mdsStorage` service to write files, so it can expose metrics from both components:

```typescript
const metricsContextBase = SF.createMetricsContext({
  envContext,
  enableDefaultMetrics: true,
});

// Combine metrics from both components
const metrics = {
  // Fetcher-specific metrics
  fetchCounter: metricsContextBase.createCounter(SF.mdsFetcherMetrics.fetchCounter),
  fetchDuration: metricsContextBase.createHistogram(SF.mdsFetcherMetrics.fetchDuration),
  activeSymbolsGauge: metricsContextBase.createGauge(SF.mdsFetcherMetrics.activeSymbolsGauge),
  
  // Storage metrics (used by the storage service)
  storageWriteOps: metricsContextBase.createCounter(SF.mdsStorageMetrics.writeOperations),
  storageWriteDuration: metricsContextBase.createHistogram(SF.mdsStorageMetrics.writeDuration),
  storageFileCount: metricsContextBase.createGauge(SF.mdsStorageMetrics.fileCount),
};
```

## Benefits

1. **Composability**: Processes can combine metrics from any components they use
2. **Type Safety**: Metric configurations are fully typed with label names
3. **Reusability**: Metric definitions are centralized and consistent
4. **Flexibility**: Each process creates only the metrics it needs
5. **Clear Dependencies**: It's explicit which component metrics a process uses


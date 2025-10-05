import type {
  MetricConfigCounter,
  MetricConfigGauge,
  MetricConfigHistogram,
} from '../../metrics/types.js';

const fetchCounter: MetricConfigCounter<'platform' | 'endpoint' | 'status'> = {
  type: 'counter',
  name: 'fetch_requests_total',
  help: 'Total number of fetch requests',
  labelNames: ['platform', 'endpoint', 'status'] as const,
};

const fetchDuration: MetricConfigHistogram<'platform' | 'endpoint'> = {
  type: 'histogram',
  name: 'fetch_duration_seconds',
  help: 'Duration of fetch operations in seconds',
  labelNames: ['platform', 'endpoint'] as const,
  buckets: [0.1, 0.5, 1, 2, 5],
};

const activeSymbolsGauge: MetricConfigGauge = {
  type: 'gauge',
  name: 'active_symbols',
  help: 'Number of actively monitored symbols',
};

// TODO per endpoint and symbol
const totalFetchesGauge: MetricConfigGauge = {
  type: 'gauge',
  name: 'total_fetches',
  help: 'Total number of fetch operations completed',
};

const lastFetchTimestampGauge: MetricConfigGauge = {
  type: 'gauge',
  name: 'last_fetch_timestamp_seconds',
  help: 'Unix timestamp of the last successful fetch',
};

const totalErrorsGauge: MetricConfigGauge = {
  type: 'gauge',
  name: 'total_errors',
  help: 'Total number of fetch errors encountered',
};

export const mdsFetcherMetrics = {
  fetchCounter,
  fetchDuration,
  activeSymbolsGauge,
  totalFetchesGauge,
  lastFetchTimestampGauge,
  totalErrorsGauge,
};


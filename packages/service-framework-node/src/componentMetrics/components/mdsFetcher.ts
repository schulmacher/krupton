import type {
  MetricConfigCounter,
  MetricConfigGauge,
  MetricConfigHistogram,
} from '../../metrics/types.js';

const fetchCounter: MetricConfigCounter<'platform' | 'endpoint' | 'status'> = {
  name: 'fetch_requests_total',
  help: 'Total number of fetch requests',
  labelNames: ['platform', 'endpoint', 'status'] as const,
};

const fetchDuration: MetricConfigHistogram<'platform' | 'endpoint'> = {
  name: 'fetch_duration_seconds',
  help: 'Duration of fetch operations in seconds',
  labelNames: ['platform', 'endpoint'] as const,
  buckets: [0.1, 0.5, 1, 2, 5],
};

const activeSymbolsGauge: MetricConfigGauge = {
  name: 'active_symbols',
  help: 'Number of actively monitored symbols',
};

const serviceRunningGauge: MetricConfigGauge = {
  name: 'service_running',
  help: 'Whether the fetcher service is currently running (1 = running, 0 = stopped)',
};

const totalFetchesGauge: MetricConfigGauge = {
  name: 'total_fetches',
  help: 'Total number of fetch operations completed',
};

const lastFetchTimestampGauge: MetricConfigGauge = {
  name: 'last_fetch_timestamp_seconds',
  help: 'Unix timestamp of the last successful fetch',
};

const totalErrorsGauge: MetricConfigGauge = {
  name: 'total_errors',
  help: 'Total number of fetch errors encountered',
};

export const mdsFetcherMetrics = {
  fetchCounter,
  fetchDuration,
  activeSymbolsGauge,
  serviceRunningGauge,
  totalFetchesGauge,
  lastFetchTimestampGauge,
  totalErrorsGauge,
};


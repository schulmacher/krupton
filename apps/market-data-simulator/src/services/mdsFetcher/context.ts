import { SF } from '@krupton/service-framework-node';
import type { MdsFetcherEnv } from './environment.js';
import { mdsFetcherEnvSchema } from './environment.js';

const createFetcherMetrics = (metricsContext: SF.MetricsContext) => {
  const fetchCounter = metricsContext.createCounter({
    name: 'fetch_requests_total',
    help: 'Total number of fetch requests',
    labelNames: ['platform', 'endpoint', 'status'],
  });

  const fetchDuration = metricsContext.createHistogram({
    name: 'fetch_duration_seconds',
    help: 'Duration of fetch operations in seconds',
    labelNames: ['platform', 'endpoint'],
    buckets: [0.1, 0.5, 1, 2, 5],
  });

  const activeSymbolsGauge = metricsContext.createGauge({
    name: 'active_symbols',
    help: 'Number of actively monitored symbols',
  });

  const serviceRunningGauge = metricsContext.createGauge({
    name: 'service_running',
    help: 'Whether the fetcher service is currently running (1 = running, 0 = stopped)',
  });

  const totalFetchesGauge = metricsContext.createGauge({
    name: 'total_fetches',
    help: 'Total number of fetch operations completed',
  });

  const lastFetchTimestampGauge = metricsContext.createGauge({
    name: 'last_fetch_timestamp_seconds',
    help: 'Unix timestamp of the last successful fetch',
  });

  const totalErrorsGauge = metricsContext.createGauge({
    name: 'total_errors',
    help: 'Total number of fetch errors encountered',
  });

  return {
    fetchCounter,
    fetchDuration,
    activeSymbolsGauge,
    serviceRunningGauge,
    totalFetchesGauge,
    lastFetchTimestampGauge,
    totalErrorsGauge,
  };
};

export const createMdsFetcherContext = () => {
  const envContext = SF.createEnvContext(mdsFetcherEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext);

  const metricsContextBase = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    prefix: '',
  });

  const metrics = createFetcherMetrics(metricsContextBase);

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    metrics,
  });

  const processContext = SF.createProcessLifecycle({
    diagnosticContext,
  });

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
  };
};

export type MdsFetcherContext = ReturnType<typeof createMdsFetcherContext>;

export type MdsFetcherMetrics = ReturnType<typeof createFetcherMetrics>;

export type MdsFetcherServiceContext = SF.ServiceContext<MdsFetcherEnv, MdsFetcherMetrics>;


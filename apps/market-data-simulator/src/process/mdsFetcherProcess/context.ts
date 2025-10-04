import { SF } from '@krupton/service-framework-node';
import type { MdsFetcherEnv } from './environment.js';
import { mdsFetcherEnvSchema } from './environment.js';

export const createMdsFetcherContext = () => {
  const envContext = SF.createEnvContext(mdsFetcherEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext);

  const metricsContextBase = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    prefix: '',
  });

  const metrics = {
    fetchCounter: metricsContextBase.createCounter(SF.mdsFetcherMetrics.fetchCounter),
    fetchDuration: metricsContextBase.createHistogram(SF.mdsFetcherMetrics.fetchDuration),
    activeSymbolsGauge: metricsContextBase.createGauge(SF.mdsFetcherMetrics.activeSymbolsGauge),
    serviceRunningGauge: metricsContextBase.createGauge(SF.mdsFetcherMetrics.serviceRunningGauge),
    totalFetchesGauge: metricsContextBase.createGauge(SF.mdsFetcherMetrics.totalFetchesGauge),
    lastFetchTimestampGauge: metricsContextBase.createGauge(SF.mdsFetcherMetrics.lastFetchTimestampGauge),
    totalErrorsGauge: metricsContextBase.createGauge(SF.mdsFetcherMetrics.totalErrorsGauge),
  };

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

export type MdsFetcherMetrics = SF.RegisteredMetrics<MdsFetcherContext>;

export type MdsFetcherServiceContext = SF.ServiceContext<MdsFetcherEnv, MdsFetcherMetrics>;


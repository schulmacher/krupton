import { createApiClient, createBinanceAuthHeaders } from '@krupton/api-client-node';
import { BinanceApiDefinition } from '@krupton/api-interface';
import { SF } from '@krupton/service-framework-node';
import { createMdsFetcherRateLimiter } from '../../lib/mdsFetcher/mdsFetcherRateLimiter.js';
import { createEndpointStorageRepository } from '../../repository.js';
import type { MdsFetcherEnv } from './environment.js';
import { mdsFetcherEnvSchema } from './environment.js';

export function createMdsFetcherContext() {
  const envContext = SF.createEnvContext(mdsFetcherEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    metrics: {
      fetchCounter: SF.mdsFetcherMetrics.fetchCounter,
      fetchDuration: SF.mdsFetcherMetrics.fetchDuration,
      activeSymbolsGauge: SF.mdsFetcherMetrics.activeSymbolsGauge,
      lastFetchTimestampGauge: SF.mdsFetcherMetrics.lastFetchTimestampGauge,
      totalFetchesGauge: SF.mdsFetcherMetrics.totalFetchesGauge,
      totalErrorsGauge: SF.mdsFetcherMetrics.totalErrorsGauge,
    },
  });

  const processContext = SF.createProcessLifecycle({
    diagnosticContext,
  });

  const rateLimiter = createMdsFetcherRateLimiter(diagnosticContext, {
    maxRequests: envContext.config.RATE_LIMIT_MAX_REQUESTS,
    windowMs: envContext.config.RATE_LIMIT_WINDOW_MS,
  });

  const binanceClient = createApiClient(
    {
      baseUrl: envContext.config.API_BASE_URL,
      headers: envContext.config.API_KEY
        ? createBinanceAuthHeaders(envContext.config.API_KEY)
        : undefined,
      validation: true,
    },
    BinanceApiDefinition,
  );

  const endpointStorageRepository = createEndpointStorageRepository(
    envContext.config.STORAGE_BASE_DIR,
    envContext.config.PLATFORM,
  );

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
    rateLimiter,
    binanceClient,
    endpointStorageRepository,
  };
}

export type MdsFetcherContext = ReturnType<typeof createMdsFetcherContext>;

export type MdsFetcherMetrics = SF.RegisteredMetrics<MdsFetcherContext>;

export type MdsFetcherServiceContext = SF.ServiceContext<MdsFetcherEnv, MdsFetcherMetrics>;

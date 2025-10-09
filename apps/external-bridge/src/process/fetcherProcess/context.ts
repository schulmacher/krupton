import { createApiClient, createBinanceAuthHeaders } from '@krupton/api-client-node';
import { BinanceApi } from '@krupton/api-interface';
import { SF } from '@krupton/service-framework-node';
import { createEndpointStorageRepository } from '../../entities/endpointStorageRepository.js';
import { createExternalBridgeFetcherRateLimiter } from '../../lib/externalBridgeFetcher/externalBridgeFetcherRateLimiter.js';
import type { ExternalBridgeFetcherEnv } from './environment.js';
import { externalBridgeFetcherEnvSchema } from './environment.js';

export function createExternalBridgeFetcherContext() {
  const envContext = SF.createEnvContext(externalBridgeFetcherEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    metrics: {
      fetchCounter: SF.externalBridgeFetcherMetrics.fetchCounter,
      fetchDuration: SF.externalBridgeFetcherMetrics.fetchDuration,
      activeSymbolsGauge: SF.externalBridgeFetcherMetrics.activeSymbolsGauge,
      lastFetchTimestampGauge: SF.externalBridgeFetcherMetrics.lastFetchTimestampGauge,
      totalFetchesGauge: SF.externalBridgeFetcherMetrics.totalFetchesGauge,
      totalErrorsGauge: SF.externalBridgeFetcherMetrics.totalErrorsGauge,
    },
  });

  const processContext = SF.createProcessLifecycle({
    diagnosticContext,
  });

  const rateLimiter = createExternalBridgeFetcherRateLimiter(diagnosticContext, {
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
    {
      getOrderBook: BinanceApi.GetOrderBookEndpoint,
      getBookTicker: BinanceApi.GetBookTickerEndpoint,
      getHistoricalTrades: BinanceApi.GetHistoricalTradesEndpoint,
      getExchangeInfo: BinanceApi.GetExchangeInfoEndpoint,
    },
  );

  const endpointStorageRepository = createEndpointStorageRepository(
    envContext.config.STORAGE_BASE_DIR,
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

export type ExternalBridgeFetcherContext = ReturnType<typeof createExternalBridgeFetcherContext>;

export type ExternalBridgeFetcherMetrics = SF.RegisteredMetrics<ExternalBridgeFetcherContext>;

export type ExternalBridgeFetcherServiceContext = SF.ServiceContext<
  ExternalBridgeFetcherEnv,
  ExternalBridgeFetcherMetrics
>;

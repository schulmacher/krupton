import { createApiClient, createBinanceAuthHeaders } from '@krupton/api-client-node';
import { BinanceApi } from '@krupton/api-interface';
import { createEndpointStorageRepository } from '@krupton/persistent-jsonl-storage-node';
import { SF } from '@krupton/service-framework-node';
import { createExternalBridgeFetcherRateLimiter } from '../../lib/externalBridgeFetcher/externalBridgeFetcherRateLimiter.js';
import type { BinanceFetcherEnv } from './environment.js';
import { binanceFetcherEnvSchema } from './environment.js';

export function createBinanceFetcherContext() {
  const envContext = SF.createEnvContext(binanceFetcherEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    prefix: 'external_bridge_fetcher',
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

export type BinanceFetcherContext = ReturnType<typeof createBinanceFetcherContext>;

export type BinanceFetcherMetrics = SF.RegisteredMetrics<BinanceFetcherContext>;

export type BinanceFetcherServiceContext = SF.ServiceContext<
  BinanceFetcherEnv,
  BinanceFetcherMetrics
>;

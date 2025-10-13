import { createApiClient } from '@krupton/api-client-node';
import { KrakenApi } from '@krupton/api-interface';
import { SF } from '@krupton/service-framework-node';
import {
  createKrakenAssetInfoEntity,
  createKrakenAssetInfoStorage,
  createKrakenAssetPairsEntity,
  createKrakenAssetPairsStorage,
  createKrakenOrderBookEntity,
  createKrakenOrderBookStorage,
  createKrakenRecentTradesEntity,
  createKrakenRecentTradesStorage,
} from '@krupton/persistent-storage-node';
import { createExternalBridgeFetcherRateLimiter } from '../../lib/externalBridgeFetcher/externalBridgeFetcherRateLimiter.js';
import type { KrakenFetcherEnv } from './environment.js';
import { krakenFetcherEnvSchema } from './environment.js';

export function createKrakenFetcherContext() {
  const envContext = SF.createEnvContext(krakenFetcherEnvSchema);

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

  const krakenClient = createApiClient(
    {
      baseUrl: envContext.config.API_BASE_URL,
      validation: true,
    },
    {
      getAssetInfo: KrakenApi.GetAssetInfoEndpoint,
      getAssetPairs: KrakenApi.GetAssetPairsEndpoint,
      getOrderBook: KrakenApi.GetOrderBookEndpoint,
      getRecentTrades: KrakenApi.GetRecentTradesEndpoint,
    },
  );

  const krakenAssetPairs = createKrakenAssetPairsEntity(
    createKrakenAssetPairsStorage(envContext.config.STORAGE_BASE_DIR, { writable: true }),
  );
  const krakenAssetInfo = createKrakenAssetInfoEntity(
    createKrakenAssetInfoStorage(envContext.config.STORAGE_BASE_DIR, { writable: true }),
  );
  const krakenOrderBook = createKrakenOrderBookEntity(
    createKrakenOrderBookStorage(envContext.config.STORAGE_BASE_DIR, { writable: true }),
  );
  const krakenRecentTrades = createKrakenRecentTradesEntity(
    createKrakenRecentTradesStorage(envContext.config.STORAGE_BASE_DIR, { writable: true }),
  );

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
    rateLimiter,
    krakenClient,
    krakenAssetPairs,
    krakenAssetInfo,
    krakenOrderBook,
    krakenRecentTrades,
  };
}

export type KrakenFetcherContext = ReturnType<typeof createKrakenFetcherContext>;

export type KrakenFetcherMetrics = SF.RegisteredMetrics<KrakenFetcherContext>;

export type KrakenFetcherServiceContext = SF.ServiceContext<
  KrakenFetcherEnv,
  KrakenFetcherMetrics
>;

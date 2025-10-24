import { createApiClient } from '@krupton/api-client-node';
import { KrakenApi } from '@krupton/api-interface';
import { createZmqPublisherRegistry, zmqSocketTempalatesRawData } from '@krupton/messaging-node';
import {
  createKrakenAssetInfoStorage,
  createKrakenAssetPairsStorage,
  createKrakenOrderBookStorage,
  createKrakenRecentTradesStorage,
  KrakenRecentTradesRecord,
} from '@krupton/persistent-storage-node';
import { SF } from '@krupton/service-framework-node';
import { createExternalBridgeFetcherRateLimiter } from '../../lib/externalBridgeFetcher/externalBridgeFetcherRateLimiter.js';
import type { KrakenFetcherEnv } from './environment.js';
import { krakenFetcherEnvSchema } from './environment.js';

export function createKrakenFetcherContext(processContext: SF.ProcessLifecycleContext) {
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

  const storage = {
    assetPairs: createKrakenAssetPairsStorage(envContext.config.STORAGE_BASE_DIR, {
      writable: true,
    }),
    assetInfo: createKrakenAssetInfoStorage(envContext.config.STORAGE_BASE_DIR, { writable: true }),
    orderBook: createKrakenOrderBookStorage(envContext.config.STORAGE_BASE_DIR, { writable: true }),
    recentTrades: createKrakenRecentTradesStorage(envContext.config.STORAGE_BASE_DIR, {
      writable: true,
    }),
  };

  const producers = {
    krakenTradeApi: createZmqPublisherRegistry<KrakenRecentTradesRecord>({
      socketTemplate: zmqSocketTempalatesRawData.krakenTradeApi,
      diagnosticContext,
    }),
  };

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
    rateLimiter,
    krakenClient,
    storage,
    producers,
  };
}

export type KrakenFetcherContext = ReturnType<typeof createKrakenFetcherContext>;

export type KrakenFetcherMetrics = SF.RegisteredMetrics<KrakenFetcherContext>;

export type KrakenFetcherServiceContext = SF.ServiceContext<KrakenFetcherEnv, KrakenFetcherMetrics>;

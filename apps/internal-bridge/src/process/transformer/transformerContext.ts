import {
  createBinanceHistoricalTradeStorage,
  createBinanceOrderBookStorage,
  createBinanceTradeWSStorage,
  createBinanceDiffDepthWSStorage,
} from '@krupton/persistent-storage-node';
import { SF } from '@krupton/service-framework-node';
import type { TransformerEnv } from './environment.js';
import { internalBridgeEnvSchema } from './environment.js';

export function createTransformerContext() {
  const envContext = SF.createEnvContext(internalBridgeEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    metrics: {
    },
  });

  const processContext = SF.createProcessLifecycle({
    diagnosticContext,
  });


  const storageBaseDir = envContext.config.EXTERNAL_BRIDGE_STORAGE_BASE_DIR;

  const inputStorage = {
    binanceHistoricalTrade: createBinanceHistoricalTradeStorage(storageBaseDir, { writable: false }),
    binanceOrderBook: createBinanceOrderBookStorage(storageBaseDir, { writable: false }),
    binanceTrade: createBinanceTradeWSStorage(storageBaseDir, { writable: false }),
    binanceDiffDepth: createBinanceDiffDepthWSStorage(storageBaseDir, { writable: false }),
  }

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
    inputStorage,
  };
}

export type TransformerContext = ReturnType<typeof createTransformerContext>;

export type TransformerMetrics = SF.RegisteredMetrics<TransformerContext>;

export type TransformerServiceContext = SF.ServiceContext<
  TransformerEnv,
  TransformerMetrics
>;

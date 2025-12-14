import {
  createZmqPublisherRegistry,
  createZmqSubscriberRegistry,
  zmqSocketTempalatesRawData,
  zmqSocketTempalatesUnifiedData,
} from '@krupton/messaging-node';
import {
  BinanceHistoricalTradeRecord,
  BinanceTradeWSRecord,
  createBinanceHistoricalTradeStorage,
  createBinanceTradeWSStorage,
  StorageRecord,
} from '@krupton/persistent-storage-node';
import { UnifiedTrade } from '@krupton/persistent-storage-node/transformed';
import { SF } from '@krupton/service-framework-node';
import path from 'node:path';
import {
  createBinanceHistoricalTradesTransformerStateStorage,
  createBinanceWSTradesTransformerStateStorage,
} from '../../../entities/transformerStateBinance.js';
import { createUnifiedTradeStorage } from '../../../entities/unifiedTrade.js';
import type { BinanceTransformerEnv } from '../environment.js';
import { binanceTransformerEnvSchema } from '../environment.js';
import { createTransformerMetricsContext } from '../metrics.js';

export function createBinanceTradesTransformerContext(
  processContext: SF.ProcessLifecycleContext,
  workerId?: string,
) {
  const envContext = SF.createEnvContext(binanceTransformerEnvSchema, {
    source: {
      SERVICE_NAME:
        workerId && process.env.PROCESS_NAME
          ? `${process.env.PROCESS_NAME}-${workerId}`
          : process.env.PROCESS_NAME,
    },
  });

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = createTransformerMetricsContext(envContext);

  const inputStorageBaseDir = envContext.config.EXTERNAL_BRIDGE_STORAGE_BASE_DIR;
  const outputStorageBaseDir = envContext.config.INTERNAL_BRIDGE_STORAGE_BASE_DIR;
  const outputBinanceTradeStorageBaseDir = path.join(outputStorageBaseDir, 'binance');

  const inputStorage = {
    binanceHistoricalTrade: createBinanceHistoricalTradeStorage(inputStorageBaseDir, {
      writable: false,
    }),
    binanceTrade: createBinanceTradeWSStorage(inputStorageBaseDir, { writable: false }),
  };
  const inputConsumers = {
    binanceTradeApi: createZmqSubscriberRegistry<BinanceHistoricalTradeRecord>({
      socketTemplate: (subIndex) => zmqSocketTempalatesRawData.binanceTradeApi(subIndex),
      diagnosticContext,
    }),
    binanceTradeWs: createZmqSubscriberRegistry<BinanceTradeWSRecord>({
      socketTemplate: (subIndex) => zmqSocketTempalatesRawData.binanceTradeWs(subIndex),
      diagnosticContext,
    }),
  };

  const outputStorage = {
    unifiedTrade: createUnifiedTradeStorage(outputBinanceTradeStorageBaseDir, { writable: true }),
  };
  const producers = {
    unifiedTrade: createZmqPublisherRegistry<StorageRecord<UnifiedTrade> & { id: number }>({
      socketTemplate: (platformAndSymbol) =>
        zmqSocketTempalatesUnifiedData.trade(platformAndSymbol),
      diagnosticContext,
    }),
  };

  const transformerState = {
    binanceHistoricalTrades: createBinanceHistoricalTradesTransformerStateStorage(
      outputBinanceTradeStorageBaseDir,
      {
        writable: true,
      },
    ),
    binanceWSTrades: createBinanceWSTradesTransformerStateStorage(
      outputBinanceTradeStorageBaseDir,
      {
        writable: true,
      },
    ),
  };

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
    inputStorage,
    inputConsumers,
    outputStorage,
    producers,
    transformerState,
    symbols: envContext.config.SYMBOLS.split(',').map((s) => s.trim()),
  };
}

export type BinanceTradesTransformerContext = ReturnType<
  typeof createBinanceTradesTransformerContext
>;

export type BinanceTradesTransformerMetrics = SF.RegisteredMetrics<BinanceTradesTransformerContext>;

export type BinanceTradesTransformerServiceContext = SF.ServiceContext<
  BinanceTransformerEnv,
  BinanceTradesTransformerMetrics
>;

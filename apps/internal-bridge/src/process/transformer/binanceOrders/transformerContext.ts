import {
  createZmqPublisherRegistry,
  createZmqSubscriberRegistry,
  zmqSocketTempalatesRawData,
  zmqSocketTempalatesUnifiedData,
} from '@krupton/messaging-node';
import {
  BinanceDiffDepthWSRecord,
  BinanceOrderBookStorageRecord,
  createBinanceDiffDepthWSStorage,
  createBinanceOrderBookStorage,
  StorageRecord,
} from '@krupton/persistent-storage-node';
import { UnifiedOrderBook } from '@krupton/persistent-storage-node/transformed';
import { SF } from '@krupton/service-framework-node';
import path from 'node:path';
import {
  createBinanceDiffDepthTransformerStateStorage,
  createBinanceOrderBookTransformerStateStorage,
} from '../../../entities/transformerStateBinance.js';
import { createUnifiedOrderBookStorage } from '../../../entities/unifiedTrade.js';
import { BinanceTransformerEnv, binanceTransformerEnvSchema } from '../environment.js';
import { createTransformerMetricsContext } from '../metrics.js';

export function createBinanceOrdersTransformerContext(processContext: SF.ProcessLifecycleContext) {
  const envContext = SF.createEnvContext(binanceTransformerEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = createTransformerMetricsContext(envContext);

  const inputStorageBaseDir = envContext.config.EXTERNAL_BRIDGE_STORAGE_BASE_DIR;
  const outputStorageBaseDir = envContext.config.INTERNAL_BRIDGE_STORAGE_BASE_DIR;
  const outputBinanceTradeStorageBaseDir = path.join(outputStorageBaseDir, 'binance');

  const inputStorage = {
    binanceOrderBook: createBinanceOrderBookStorage(inputStorageBaseDir, { writable: false }),
    binanceDiffDepth: createBinanceDiffDepthWSStorage(inputStorageBaseDir, { writable: false }),
  };
  const inputConsumers = {
    binanceOrderBook: createZmqSubscriberRegistry<BinanceOrderBookStorageRecord>({
      socketTemplate: (subIndex) => zmqSocketTempalatesRawData.binanceOrderBook(subIndex),
      diagnosticContext,
    }),
    binanceDiffDepth: createZmqSubscriberRegistry<BinanceDiffDepthWSRecord>({
      socketTemplate: (subIndex) => zmqSocketTempalatesRawData.binanceDiffDepth(subIndex),
      diagnosticContext,
    }),
  };

  const outputStorage = {
    unifiedOrderBook: createUnifiedOrderBookStorage(outputBinanceTradeStorageBaseDir, {
      writable: true,
    }),
  };

  const transformerState = {
    binanceOrderBook: createBinanceOrderBookTransformerStateStorage(
      outputBinanceTradeStorageBaseDir,
      {
        writable: true,
      },
    ),
    binanceDiffDepth: createBinanceDiffDepthTransformerStateStorage(
      outputBinanceTradeStorageBaseDir,
      {
        writable: true,
      },
    ),
  };

  const producers = {
    unifiedOrderBook: createZmqPublisherRegistry<StorageRecord<UnifiedOrderBook> & { id: number }>({
      socketTemplate: (platformAndSymbol) =>
        zmqSocketTempalatesUnifiedData.orderBook(platformAndSymbol),
      diagnosticContext,
    }),
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

export type BinanceOrdersTransformerContext = ReturnType<
  typeof createBinanceOrdersTransformerContext
>;

export type BinanceOrdersTransformerMetrics = SF.RegisteredMetrics<BinanceOrdersTransformerContext>;

export type BinanceOrdersTransformerServiceContext = SF.ServiceContext<
  BinanceTransformerEnv,
  BinanceOrdersTransformerMetrics
>;

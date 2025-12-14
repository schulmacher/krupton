import {
  createZmqPublisherRegistry,
  createZmqSubscriberRegistry,
  zmqSocketTempalatesRawData,
  zmqSocketTempalatesUnifiedData,
} from '@krupton/messaging-node';
import {
  createKrakenBookWSStorage,
  KrakenBookWSRecord,
  StorageRecord,
} from '@krupton/persistent-storage-node';
import { UnifiedOrderBook } from '@krupton/persistent-storage-node/transformed';
import { SF } from '@krupton/service-framework-node';
import path from 'node:path';
import { createKrakenOrderBookTransformerStateStorage } from '../../../entities/transformerStateKraken.js';
import { createUnifiedOrderBookStorage } from '../../../entities/unifiedTrade.js';
import { KrakenTransformerEnv, krakenTransformerEnvSchema } from '../environment.js';
import { createTransformerMetricsContext } from '../metrics.js';

export function createKrakenOrdersTransformerContext(processContext: SF.ProcessLifecycleContext) {
  const envContext = SF.createEnvContext(krakenTransformerEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = createTransformerMetricsContext(envContext);

  const inputStorageBaseDir = envContext.config.EXTERNAL_BRIDGE_STORAGE_BASE_DIR;
  const outputStorageBaseDir = envContext.config.INTERNAL_BRIDGE_STORAGE_BASE_DIR;
  const outputBinanceTradeStorageBaseDir = path.join(outputStorageBaseDir, 'kraken');

  const inputStorage = {
    krakenOrderBookWs: createKrakenBookWSStorage(inputStorageBaseDir, { writable: false }),
  };
  const inputConsumers = {
    krakenOrderBookWs: createZmqSubscriberRegistry<KrakenBookWSRecord>({
      socketTemplate: (subIndex) => zmqSocketTempalatesRawData.krakenOrderBookWs(subIndex),
      diagnosticContext,
    }),
  };

  const outputStorage = {
    unifiedOrderBook: createUnifiedOrderBookStorage(outputBinanceTradeStorageBaseDir, {
      writable: true,
    }),
  };

  const transformerState = {
    krakenOrderBookWs: createKrakenOrderBookTransformerStateStorage(
      outputBinanceTradeStorageBaseDir,
      {
        writable: true,
      },
    ),
  };

  const producers = {
    unifiedOrderBook: createZmqPublisherRegistry<StorageRecord<UnifiedOrderBook> & { id: number }>({
      socketTemplate: (platformAndSymbol) => {
        const socket = zmqSocketTempalatesUnifiedData.orderBook(platformAndSymbol);

        console.log('socket', socket);

        return socket;
      },
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

export type KrakenOrdersTransformerContext = ReturnType<
  typeof createKrakenOrdersTransformerContext
>;

export type KrakenOrdersTransformerMetrics = SF.RegisteredMetrics<KrakenOrdersTransformerContext>;

export type KrakenOrdersTransformerServiceContext = SF.ServiceContext<
  KrakenTransformerEnv,
  KrakenOrdersTransformerMetrics
>;

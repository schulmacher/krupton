import {
  createZmqPublisherRegistry,
  createZmqSubscriberRegistry,
  zmqSocketTempalatesRawData,
  zmqSocketTempalatesUnifiedData,
} from '@krupton/messaging-node';
import {
  createKrakenRecentTradesStorage,
  createKrakenTradeWSStorage,
  KrakenRecentTradesRecord,
  KrakenTradeWSRecord,
  StorageRecord,
} from '@krupton/persistent-storage-node';
import { UnifiedTrade } from '@krupton/persistent-storage-node/transformed';
import { SF } from '@krupton/service-framework-node';
import path from 'node:path';
import {
  createKrakenApiTradeTransformerStateStorage,
  createKrakenWsTradeTransformerStateStorage,
} from '../../../entities/transformerStateKraken.js';
import { createUnifiedTradeStorage } from '../../../entities/unifiedTrade.js';
import type { KrakenTransformerEnv } from '../environment.js';
import { krakenTransformerEnvSchema } from '../environment.js';

export function createKrakenTradesTransformerContext(processContext: SF.ProcessLifecycleContext) {
  const envContext = SF.createEnvContext(krakenTransformerEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    metrics: {},
  });

  const inputStorageBaseDir = envContext.config.EXTERNAL_BRIDGE_STORAGE_BASE_DIR;
  const outputStorageBaseDir = envContext.config.INTERNAL_BRIDGE_STORAGE_BASE_DIR;
  const outputKrakenTradeStorageBaseDir = path.join(outputStorageBaseDir, 'kraken');

  const inputStorage = {
    krakenApiTrade: createKrakenRecentTradesStorage(inputStorageBaseDir, {
      writable: false,
    }),
    krakenWsTrade: createKrakenTradeWSStorage(inputStorageBaseDir, { writable: false }),
  };
  const inputConsumers = {
    krakenTradeApi: createZmqSubscriberRegistry<KrakenRecentTradesRecord>({
      socketTemplate: (subIndex) => zmqSocketTempalatesRawData.krakenTradeApi(subIndex),
      diagnosticContext,
    }),
    krakenTradeWs: createZmqSubscriberRegistry<KrakenTradeWSRecord>({
      socketTemplate: (subIndex) => zmqSocketTempalatesRawData.krakenTradeWs(subIndex),
      diagnosticContext,
    }),
  };

  const outputStorage = {
    unifiedTrade: createUnifiedTradeStorage(outputKrakenTradeStorageBaseDir, { writable: true }),
  };
  const producers = {
    unifiedTrade: createZmqPublisherRegistry<StorageRecord<UnifiedTrade>>({
      socketTemplate: (symbol) => zmqSocketTempalatesUnifiedData.trade(symbol),
      diagnosticContext,
    }),
  };

  const transformerState = {
    krakenHistoricalTrades: createKrakenApiTradeTransformerStateStorage(
      outputKrakenTradeStorageBaseDir,
      {
        writable: true,
      },
    ),
    krakenWSTrades: createKrakenWsTradeTransformerStateStorage(outputKrakenTradeStorageBaseDir, {
      writable: true,
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

export type KrakenTradesTransformerContext = ReturnType<
  typeof createKrakenTradesTransformerContext
>;

export type KrakenTradesTransformerMetrics = SF.RegisteredMetrics<KrakenTradesTransformerContext>;

export type KrakenTradesTransformerServiceContext = SF.ServiceContext<
  KrakenTransformerEnv,
  KrakenTradesTransformerMetrics
>;

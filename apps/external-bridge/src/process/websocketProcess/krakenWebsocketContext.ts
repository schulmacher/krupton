import {
  createKrakenAssetInfoEntity,
  createKrakenAssetInfoStorage,
  createKrakenAssetPairsEntity,
  createKrakenAssetPairsStorage,
  createKrakenTickerWSEntity,
  createKrakenTickerWSStorage,
  createKrakenTradeWSEntity,
  createKrakenTradeWSStorage,
  createKrakenBookWSEntity,
  createKrakenBookWSStorage,
} from '@krupton/persistent-storage-node';
import { SF } from '@krupton/service-framework-node';
import { krakenWebSocketEnvSchema, type KrakenWebSocketEnv } from './environment.js';

export function createKrakenWebsocketContext() {
  const envContext = SF.createEnvContext(krakenWebSocketEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    prefix: 'external_bridge_websocket',
    metrics: {
      messagesReceived: SF.externalBridgeWebsocketsMetrics.messagesReceived,
      messageProcessingDuration: SF.externalBridgeWebsocketsMetrics.messageProcessingDuration,
      connectionStatus: SF.externalBridgeWebsocketsMetrics.connectionStatus,
      reconnectionAttempts: SF.externalBridgeWebsocketsMetrics.reconnectionAttempts,
      activeSubscriptions: SF.externalBridgeWebsocketsMetrics.activeSubscriptions,
      validationErrors: SF.externalBridgeWebsocketsMetrics.validationErrors,
      connectionUptime: SF.externalBridgeWebsocketsMetrics.connectionUptime,
      lastMessageTimestamp: SF.externalBridgeWebsocketsMetrics.lastMessageTimestamp,
    },
  });

  const processContext = SF.createProcessLifecycle({
    diagnosticContext,
  });

  const krakenTicker = createKrakenTickerWSEntity(
    createKrakenTickerWSStorage(envContext.config.STORAGE_BASE_DIR, { writable: true }),
  );
  const krakenTrade = createKrakenTradeWSEntity(
    createKrakenTradeWSStorage(envContext.config.STORAGE_BASE_DIR, { writable: true }),
  );
  const krakenBook = createKrakenBookWSEntity(
    createKrakenBookWSStorage(envContext.config.STORAGE_BASE_DIR, { writable: true }),
  );

  // Open endpoint storage in read-only mode to avoid file locks with fetcher process
  const krakenAssetPairs = createKrakenAssetPairsEntity(
    createKrakenAssetPairsStorage(envContext.config.STORAGE_BASE_DIR, { writable: false }),
  );
  const krakenAssetInfo = createKrakenAssetInfoEntity(
    createKrakenAssetInfoStorage(envContext.config.STORAGE_BASE_DIR, { writable: false }),
  );

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
    krakenTicker,
    krakenTrade,
    krakenBook,
    krakenAssetPairs,
    krakenAssetInfo,
  };
}

export type KrakenWebSocketContext = ReturnType<typeof createKrakenWebsocketContext>;
export type KrakenWebSocketMetrics = SF.RegisteredMetrics<KrakenWebSocketContext>;
export type KrakenWebSocketServiceContext = SF.ServiceContext<
  KrakenWebSocketEnv,
  KrakenWebSocketMetrics
>;

import { SF } from '@krupton/service-framework-node';

import { createWSHandlers } from '@krupton/api-client-ws-node';
import { KrakenWS } from '@krupton/api-interface';
import { KrakenBookWSRecord, KrakenTradeWSRecord } from '@krupton/persistent-storage-node';
import { arrayToMultiMap } from '@krupton/utils';
import { initKrakenLatestAssetPairsProvider } from '../../lib/symbol/krakenLatestAssetsProvider.js';
import { normalizeSymbol, unnormalizeToKrakenWSSymbol } from '../../lib/symbol/normalizeSymbol.js';
import { KrakenWebsocketManager } from '../../lib/websockets/KrakenWebsocketManager.js';
import type { KrakenWebSocketContext } from './krakenWebsocketContext.js';

export async function startWebsocketService(context: KrakenWebSocketContext): Promise<void> {
  const { diagnosticContext, processContext, envContext } = context;
  const config = envContext.config;

  const createHttpServerWithHealthChecks = () =>
    SF.createHttpServer(context, {
      healthChecks: [
        async () => ({
          component: 'fetcher',
          isHealthy: true,
        }),
      ],
    });

  const httpServer = createHttpServerWithHealthChecks();

  await initKrakenLatestAssetPairsProvider(context.storage.assetPairs, context.storage.assetInfo);

  const symbols = config.SYMBOLS.split(',')
    .map((s) => s.trim())
    .map((s) => unnormalizeToKrakenWSSymbol(s).trim());

  const normalizedSymbols = symbols.map((s) => normalizeSymbol('kraken', s));

  const KrakenWSDefinition = {
    tickerStream: KrakenWS.TickerStream,
    tradeStream: KrakenWS.TradeStream,
    bookStream: KrakenWS.BookStream,
  };
  const websocketManager = new KrakenWebsocketManager(
    context,
    createWSHandlers(KrakenWSDefinition, {
      tickerStream: (message) => {
        const messagesBySymbol = arrayToMultiMap(message.data, (item) => item.symbol);
        for (const [symbol, messages] of messagesBySymbol.entries()) {
          const normalizedSymbol = normalizeSymbol('kraken', symbol);
          context.storage.ticker.appendRecord({
            subIndexDir: normalizedSymbol,
            record: {
              id: context.storage.ticker.getNextId(normalizedSymbol),
              timestamp: Date.now(),
              message: {
                channel: 'ticker',
                type: message.type,
                data: messages,
              },
            },
          });
        }
      },
      tradeStream: async (message) => {
        const messagesBySymbol = arrayToMultiMap(message.data, (item) => item.symbol);
        for (const [symbol, messages] of messagesBySymbol.entries()) {
          const normalizedSymbol = normalizeSymbol('kraken', symbol);
          const record: KrakenTradeWSRecord = {
            id: context.storage.trade.getNextId(normalizedSymbol),
            timestamp: Date.now(),
            message: {
              channel: 'trade',
              type: message.type,
              data: messages,
            },
          };

          await Promise.all([
            context.producers.krakenTradeWs.send(normalizedSymbol, record),
            context.storage.trade.appendRecord({
              subIndexDir: normalizedSymbol,
              record,
            }),
          ]);
        }
      },
      bookStream: async (message) => {
        const messagesBySymbol = arrayToMultiMap(message.data, (item) => item.symbol);
        for (const [symbol, messages] of messagesBySymbol.entries()) {
          const normalizedSymbol = normalizeSymbol('kraken', symbol);
          const record: KrakenBookWSRecord = {
            id: context.storage.book.getNextId(normalizedSymbol),
            timestamp: Date.now(),
            message: {
              channel: 'book',
              type: message.type,
              data: messages,
            },
          };
          await Promise.all([
            context.producers.krakenBookWs.send(normalizedSymbol, record),
            context.storage.book.appendRecord({
              subIndexDir: normalizedSymbol,
              record,
            }),
          ]);
        }
      },
    }),
    [
      { channel: 'ticker', symbols, snapshot: true },
      { channel: 'trade', symbols, snapshot: true },
      { channel: 'book', symbols, depth: 10, snapshot: true },
    ],
  );

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down websocket services');
      await websocketManager.disconnect();
      for (const producer of Object.values(context.producers)) {
        await producer.close();
      }
    });
  };

  registerGracefulShutdownCallback();

  diagnosticContext.logger.info('Starting websocket manager', { symbols });
  await websocketManager.connect();

  for (const producer of Object.values(context.producers)) {
    await producer.connect(normalizedSymbols);
  }

  await httpServer.startServer();
}

import { SF } from '@krupton/service-framework-node';

import { createWSHandlers } from '@krupton/api-client-ws-node';
import { KrakenWS } from '@krupton/api-interface';
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
              timestamp: new Date().getTime(),
              message: {
                channel: 'ticker',
                type: message.type,
                data: messages,
              },
            },
          });
        } 
      },
      tradeStream: (message) => {
        const messagesBySymbol = arrayToMultiMap(message.data, (item) => item.symbol);
        for (const [symbol, messages] of messagesBySymbol.entries()) {
          const normalizedSymbol = normalizeSymbol('kraken', symbol);
          context.storage.trade.appendRecord({
            subIndexDir: normalizedSymbol,
            record: {
              id: context.storage.trade.getNextId(normalizedSymbol),
              timestamp: new Date().getTime(),
              message: {
                channel: 'trade',
                type: message.type,
                data: messages,
              },
            },
          });
        }
      },
      bookStream: (message) => {
        const messagesBySymbol = arrayToMultiMap(message.data, (item) => item.symbol);
        for (const [symbol, messages] of messagesBySymbol.entries()) {
          const normalizedSymbol = normalizeSymbol('kraken', symbol);
          context.storage.book.appendRecord({
            subIndexDir: normalizedSymbol,
            record: {
              id: context.storage.book.getNextId(normalizedSymbol),
              timestamp: new Date().getTime(),
              message: {
                channel: 'book',
                type: message.type,
                data: messages,
              },
            },
          });
        }
      },
    }),
    [
      { channel: 'ticker', symbols, snapshot: true },
      { channel: 'trade', symbols, snapshot: true },
      { channel: 'book', symbols, depth: 10, snapshot: true },
    ],
  );

  diagnosticContext.logger.info('Starting websocket manager', { symbols });
  await websocketManager.connect();

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down websocket services');
      await websocketManager.disconnect();
    });
  };

  registerGracefulShutdownCallback();

  await httpServer.startServer();
}

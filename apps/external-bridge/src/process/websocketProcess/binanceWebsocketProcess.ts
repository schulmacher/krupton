import { SF } from '@krupton/service-framework-node';

import { createWSHandlers } from '@krupton/api-client-ws-node';
import { BinanceWS } from '@krupton/api-interface';
import { SYMBOL_ALL } from '@krupton/persistent-storage-node';
import { saveBinanceOrderBookSnapshots } from '../../fetchers/binanceOrderBook.js';
import { setBinanceLatestExchangeInfo } from '../../lib/symbol/binanceLatestExchangeInfoProvider.js';
import { unnormalizeToBinanceSymbol } from '../../lib/symbol/normalizeSymbol.js';
import { BinanceWebsocketManager } from '../../lib/websockets/BinanceWebsocketManager.js';
import type { BinanceWebSocketContext } from './binanceWebsocketContext.js';

export async function startWebsocketService(context: BinanceWebSocketContext): Promise<void> {
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

  const exchangeInfo = await context.storage.exchangeInfo.readLastRecord(SYMBOL_ALL);

  if (!exchangeInfo) {
    throw new Error('Exchange info not found for binance, this is required for symbol mapping');
  }

  setBinanceLatestExchangeInfo(exchangeInfo.response);

  const symbols = config.SYMBOLS.split(',')
    .map((s) => unnormalizeToBinanceSymbol(s).trim())
    .filter((s) => !!s);

  const BinanceWSDefinition = {
    tradeStream: BinanceWS.TradeStream,
    diffDepthStream: BinanceWS.DiffDepthStream,
  };
  const websocketManager = new BinanceWebsocketManager(
    context,
    createWSHandlers(BinanceWSDefinition, {
      tradeStream: (message) => {
        const record = {
          id: context.storage.trade.getNextId(message.data.s),
          timestamp: Date.now(),
          message,
        };
        context.storage.trade.appendRecord({
          subIndexDir: message.data.s,
          record,
        });
      },
      diffDepthStream: (message) => {
        const record = {
          id: context.storage.diffDepth.getNextId(message.data.s),
          timestamp: new Date().getTime(),
          message,
        };
        context.storage.diffDepth.appendRecord({
          subIndexDir: message.data.s,
          record,
        });
      },
    }),
    {
      tradeStream: symbols.map((s) => BinanceWS.getTradeStreamSubscriptionName({ symbol: s })),
      diffDepthStream: symbols.map((s) =>
        BinanceWS.getDiffDepthStreamSubscriptionName({ symbol: s, time: '1000ms' }),
      ),
    },
  );

  diagnosticContext.logger.info('Starting websocket manager', { symbols });

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down websocket services');
      await websocketManager.disconnect();
      await context.producers.binanceTrade.close();
      await context.producers.binanceDiffDepth.close();
    });
  };

  registerGracefulShutdownCallback();
  processContext.start();

  await context.producers.binanceTrade.connect(symbols);
  await context.producers.binanceDiffDepth.connect(symbols);

  await websocketManager.connect();
  await websocketManager.subscribe();

  await saveBinanceOrderBookSnapshots(
    diagnosticContext,
    symbols,
    context.binanceClient.getOrderBook,
    context.storage.orderBook,
  );

  await httpServer.startServer();
}

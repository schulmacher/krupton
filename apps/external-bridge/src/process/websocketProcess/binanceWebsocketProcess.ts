import { SF } from '@krupton/service-framework-node';

import { createWSHandlers } from '@krupton/api-client-ws-node';
import { BinanceWS } from '@krupton/api-interface';
import { setBinanceLatestExchangeInfo } from '../../lib/binance/binanceLatestExchangeInfoProvider.js';
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

  const symbols = config.SYMBOLS.split(',')
    .map((s) => s.trim())
    .filter((s) => !!s);

  const BinanceWSDefinition = {
    tradeStream: BinanceWS.TradeStream,
    partialBookDepthStream: BinanceWS.PartialBookDepthStream,
    diffDepthStream: BinanceWS.DiffDepthStream,
  };
  const websocketManager = new BinanceWebsocketManager(
    context,
    createWSHandlers(BinanceWSDefinition, {
      tradeStream: (message) => {
        context.websocketStorageRepository.binanceTrade.write({
          message,
        });
      },
      partialBookDepthStream: (message) => {
        context.websocketStorageRepository.binancePartialDepth.write({
          message,
        });
      },
      diffDepthStream: (message) => {
        context.websocketStorageRepository.binanceDiffDepth.write({
          message,
        });
      },
    }),
    {
      tradeStream: symbols.map((s) => BinanceWS.getTradeStreamSubscriptionName({ symbol: s })),
      partialBookDepthStream: symbols.map((s) =>
        BinanceWS.getPartialBookDepthStreamSubscriptionName({
          symbol: s,
          level: '5',
          time: '100ms',
        }),
      ),
      diffDepthStream: symbols.map((s) =>
        BinanceWS.getDiffDepthStreamSubscriptionName({ symbol: s, time: '100ms' }),
      ),
    },
  );

  const exchangeInfo =
    await context.endpointStorageRepository.binanceExchangeInfo.readLatestRecord();

  console.log('exchangeInfo', exchangeInfo);

  if (!exchangeInfo) {
    throw new Error('Exchange info not found for binance, this is required for symbol mapping');
  }

  setBinanceLatestExchangeInfo(exchangeInfo.response);

  diagnosticContext.logger.info('Starting websocket manager', { symbols });
  await websocketManager.connect();

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down websocket services');
      await websocketManager.disconnect();
    });
  };

  registerGracefulShutdownCallback();

  processContext.start();
  await httpServer.startServer();
}

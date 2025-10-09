import { SF } from '@krupton/service-framework-node';

import { createWSHandlers } from '@krupton/api-client-ws-node';
import { BinanceWS } from '@krupton/api-interface';
import { BinanceWebsocketManager } from '../../lib/websockets/BinanceWebsocketManager.js';
import type { WebsocketContext } from './context.js';

export async function startWebsocketService(context: WebsocketContext): Promise<void> {
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
      tradeStream: (data) => {
        console.log('tradeStream', data);
      },
      partialBookDepthStream: (data) => {
        console.log('partialBookDepthStream', data);
      },
      diffDepthStream: (data) => {
        console.log('diffDepthStream', data);
      },
    }),
    {
      tradeStream: symbols.map((s) => BinanceWS.getTradeStreamSubscriptionName(s)),
      partialBookDepthStream: symbols.map((s) => BinanceWS.getPartialBookDepthStreamSubscriptionName(s)),
      diffDepthStream: symbols.map((s) => BinanceWS.getDiffDepthStreamSubscriptionName(s)),
    },
  );

  diagnosticContext.logger.info('Starting websocket manager', { symbols });
  await websocketManager.connect();

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down websocket services');
      await websocketManager.unsubscribe();
      await websocketManager.disconnect();
    });
  };

  registerGracefulShutdownCallback();

  processContext.start();
  await httpServer.startServer();
}

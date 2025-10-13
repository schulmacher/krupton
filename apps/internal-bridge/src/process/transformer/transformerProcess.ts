import { SF } from '@krupton/service-framework-node';
import { startJoinAndTransformBinanceOrderBookPipeline } from '../../rawPipelines/joinAndTransformBinanceOrderBook.js';
import { TransformerContext } from './transformerContext.js';
import { startJoinAndTransformBinanceTradesPipeline } from '../../rawPipelines/joinAndTransformBinanceTrades.js';

export async function startTransformerService(context: TransformerContext): Promise<void> {
  const { diagnosticContext, processContext } = context;

  const createHttpServerWithHealthChecks = () =>
    SF.createHttpServer(context, {
      healthChecks: [
        async () => ({
          component: 'internal-bridge-transformer',
          isHealthy: true,
        }),
      ],
    });

  const httpServer = createHttpServerWithHealthChecks();

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down internal-bridge transformer services');
    });
  };
  registerGracefulShutdownCallback();

  processContext.start();
  await httpServer.startServer();

  // Start the entity readers
  startJoinAndTransformBinanceOrderBookPipeline(context, 'btcusdt').catch((error) => {
    diagnosticContext.logger.error('Error in entity readers', { error });
  });
  startJoinAndTransformBinanceTradesPipeline(context, 'btcusdt').catch((error) => {
    diagnosticContext.logger.error('Error in entity readers', { error });
  });
}

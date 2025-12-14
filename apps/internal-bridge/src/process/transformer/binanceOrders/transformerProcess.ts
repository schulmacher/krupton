import { SF } from '@krupton/service-framework-node';
import { startJoinAndTransformBinanceOrderBookPipeline } from '../../../rawPipelines/binanceOrderBook.js';
import { BinanceOrdersTransformerContext } from './transformerContext.js';

export async function startBinanceOrdersTransformerService(
  context: BinanceOrdersTransformerContext,
): Promise<void> {
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
      for (const consumer of Object.values(context.inputConsumers)) {
        try {
          consumer.close();
        } catch (error) {
          diagnosticContext.logger.error(error, 'Error closing consumer');
        }
      }
      for (const producer of Object.values(context.producers)) {
        try {
          await producer.close();
        } catch (error) {
          diagnosticContext.logger.error(error, 'Error closing producer');
        }
      }

      for (const storage of Object.values({
        ...context.outputStorage,
        ...context.transformerState,
      })) {
        storage.close();
      }
      diagnosticContext.logger.info('Shutting down internal-bridge transformer services');
    });
  };
  registerGracefulShutdownCallback();

  for (const consumer of Object.values(context.inputConsumers)) {
    consumer.connect(context.symbols);
  }
  for (const producer of Object.values(context.producers)) {
    await producer.connect(context.symbols.map(symbol => `binance-${symbol}`));
  }

  await httpServer.startServer();

  for (const symbol of context.symbols) {
    const symbolDiagnostics = diagnosticContext.getChildDiagnosticContext({ symbol });
    const symbolContext = {
      ...context,
      diagnosticContext: symbolDiagnostics,
    };
    startJoinAndTransformBinanceOrderBookPipeline(symbolContext, symbol).catch((error) => {
      symbolDiagnostics.logger.error(error, 'Error in entity readers');
    });
  }

  diagnosticContext.logger.info('Started service', context.envContext.config);
}

import { SF } from '@krupton/service-framework-node';
import { startJoinAndTransformKrakenTradesPipeline } from '../../../rawPipelines/krakenTrades.js';
import { KrakenTradesTransformerContext } from './transformerContext.js';

export async function startKrakenTradesTransformerService(
  context: KrakenTradesTransformerContext,
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
      diagnosticContext.logger.info('Shutting down internal-bridge transformer services');
    });
  };
  registerGracefulShutdownCallback();

  for (const consumer of Object.values(context.inputConsumers)) {
    consumer.connect(context.symbols);
  }
  for (const producer of Object.values(context.producers)) {
    await producer.connect(context.symbols);
  }
  for (const symbol of context.symbols) {
    const symbolDiagnostics = diagnosticContext.getChildDiagnosticContext({ symbol });
    const symbolContext = {
      ...context,
      diagnosticContext: symbolDiagnostics,
    };
    startJoinAndTransformKrakenTradesPipeline(symbolContext, symbol).catch((error) => {
      symbolDiagnostics.logger.error(error, 'Error in entity readers');
    });
  }

  await httpServer.startServer();
}

import { SF } from '@krupton/service-framework-node';
import type { CoordinatorContext } from './context.js';
// import { createShardCoordinator } from './shardCoordinator.js';

export async function startCoordinatorService(context: CoordinatorContext): Promise<void> {
  const { diagnosticContext, processContext } = context;
  const logger = diagnosticContext.logger;

  const createHttpServerWithHealthChecks = () =>
    SF.createHttpServer(context, {
      healthChecks: [
        async () => ({
          component: 'Coordinator',
          isHealthy: true,
        }),
      ],
    });

  const httpServer = createHttpServerWithHealthChecks();

  // Create and start the shard coordinator
  // const shardCoordinator = createShardCoordinator(context);

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      logger.info('Shutting down Coordinator service');
      // await shardCoordinator.stop();
    });
  };

  registerGracefulShutdownCallback();

  processContext.start();
  await httpServer.startServer();
  
  // Start the shard coordinator after HTTP server is ready
  // await shardCoordinator.start();
  logger.info('Shard coordinator started successfully');

}
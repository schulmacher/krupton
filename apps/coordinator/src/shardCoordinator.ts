import type { CoordinatorContext } from './context.js';
import { createWorkerRegistry } from './lib/workerRegistry.js';
import { createMessageHandler } from './lib/messageHandler.js';
import { createZmqCoordinator } from './lib/zmqCoordinator.js';
import { createHeartbeatMonitor } from './lib/heartbeatMonitor.js';

export function createShardCoordinator(context: CoordinatorContext) {
  const { diagnosticContext } = context;
  const logger = diagnosticContext.logger;

  // Create core components
  const registry = createWorkerRegistry();
  const messageHandler = createMessageHandler(context, registry);
  const zmqCoordinator = createZmqCoordinator(context, messageHandler);
  
  // Create heartbeat monitor with inactive worker callback
  const heartbeatMonitor = createHeartbeatMonitor(
    context,
    registry,
    zmqCoordinator.createInactiveWorkerHandler(),
  );

  async function start(): Promise<void> {
    logger.info('Starting shard coordinator');

    await zmqCoordinator.start();
    heartbeatMonitor.start();

    logger.info('Shard coordinator started successfully');
  }

  async function stop(): Promise<void> {
    logger.info('Stopping shard coordinator');

    heartbeatMonitor.stop();
    await zmqCoordinator.stop();

    logger.info('Shard coordinator stopped');
  }

  return {
    start,
    stop,
  };
}

export type ShardCoordinator = ReturnType<typeof createShardCoordinator>;

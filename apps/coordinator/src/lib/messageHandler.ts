import type { CoordinatorContext } from '../context.js';
import type { WorkerRegistry } from './workerRegistry.js';
import type {
  RegistrationMessage,
  HeartbeatMessage,
  AssignmentMessage,
  OutgoingMessage,
} from './types.js';
import { rebalanceShards } from './shardAllocator.js';

export function createMessageHandler(context: CoordinatorContext, registry: WorkerRegistry) {
  const { diagnosticContext } = context;
  const logger = diagnosticContext.logger;

  function handleRegistration(
    message: RegistrationMessage,
    sendAssignment: (workerId: string, assignment: AssignmentMessage) => void,
  ): void {
    const { serviceName, workerId, maxShardCount } = message;

    logger.debug('Handling registration', { serviceName, workerId, maxShardCount });

    // Check if worker already exists
    const existingWorker = registry.getWorker(serviceName, workerId);
    if (existingWorker && existingWorker.isActive) {
      // Worker re-registering, send existing shards from cache
      logger.info('Worker re-registered, sending cached shards', {
        serviceName,
        workerId,
        assignedShards: existingWorker.assignedShards,
      });

      sendAssignment(workerId, { assignedShards: existingWorker.assignedShards });
      return;
    }

    // Register worker
    const worker = registry.registerWorker(serviceName, workerId, maxShardCount);

    // Check if max shard count changed
    const shardCountChanged = registry.updateMaxShardCount(serviceName, maxShardCount);

    if (shardCountChanged) {
      logger.info('Max shard count changed, rebalancing', {
        serviceName,
        maxShardCount,
      });

      // Rebalance shards across all active workers
      const activeWorkers = registry.getActiveWorkers(serviceName);
      rebalanceShards(serviceName, activeWorkers, maxShardCount);

      // Send new assignments to all active workers
      for (const activeWorker of activeWorkers) {
        logger.debug('Sending rebalanced assignment', {
          serviceName,
          workerId: activeWorker.workerId,
          assignedShards: activeWorker.assignedShards,
        });

        sendAssignment(activeWorker.workerId, { assignedShards: activeWorker.assignedShards });
      }
    } else {
      // Just allocate shards for new worker
      const activeWorkers = registry.getActiveWorkers(serviceName);
      const service = registry.getService(serviceName);

      if (service) {
        rebalanceShards(serviceName, activeWorkers, service.maxShardCount);

        // Send assignments to all active workers (including the new one)
        for (const activeWorker of activeWorkers) {
          logger.debug('Sending assignment', {
            serviceName,
            workerId: activeWorker.workerId,
            assignedShards: activeWorker.assignedShards,
          });

          sendAssignment(activeWorker.workerId, { assignedShards: activeWorker.assignedShards });
        }
      }
    }

    logger.info('Worker registered successfully', {
      serviceName,
      workerId,
      assignedShards: worker.assignedShards,
    });
  }

  function handleHeartbeat(message: HeartbeatMessage): void {
    const { serviceName, workerId, assignedShards } = message;

    logger.debug('Handling heartbeat', { serviceName, workerId, assignedShards });

    const worker = registry.getWorker(serviceName, workerId);

    if (!worker) {
      logger.warn('Received heartbeat from unregistered worker', {
        serviceName,
        workerId,
      });
      return;
    }

    // Verify assigned shards match
    const expectedShards = worker.assignedShards.slice().sort((a, b) => a - b);
    const receivedShards = assignedShards.slice().sort((a, b) => a - b);

    if (JSON.stringify(expectedShards) !== JSON.stringify(receivedShards)) {
      logger.warn('Worker reported mismatched shards', {
        serviceName,
        workerId,
        expected: expectedShards,
        received: receivedShards,
      });
    }

    registry.updateHeartbeat(serviceName, workerId);
  }

  function handleWorkerInactive(
    serviceName: string,
    workerId: string,
    sendAssignment: (targetWorkerId: string, assignment: AssignmentMessage) => void,
  ): void {
    logger.info('Handling inactive worker', { serviceName, workerId });

    const service = registry.getService(serviceName);
    if (!service) return;

    const activeWorkers = registry.getActiveWorkers(serviceName);

    if (activeWorkers.length === 0) {
      logger.info('No active workers remaining for service', { serviceName });
      return;
    }

    // Rebalance shards among remaining active workers
    rebalanceShards(serviceName, activeWorkers, service.maxShardCount);

    // Send new assignments to all active workers
    for (const worker of activeWorkers) {
      logger.debug('Sending rebalanced assignment after worker removal', {
        serviceName,
        workerId: worker.workerId,
        assignedShards: worker.assignedShards,
      });

      sendAssignment(worker.workerId, { assignedShards: worker.assignedShards });
    }
  }

  return {
    handleRegistration,
    handleHeartbeat,
    handleWorkerInactive,
  };
}

export type MessageHandler = ReturnType<typeof createMessageHandler>;

import type { CoordinatorContext } from '../context.js';
import type { WorkerRegistry } from './workerRegistry.js';

export function createHeartbeatMonitor(
  context: CoordinatorContext,
  registry: WorkerRegistry,
  onWorkerInactive: (serviceName: string, workerId: string) => void,
) {
  const { diagnosticContext, envContext } = context;
  const logger = diagnosticContext.logger;

  const heartbeatTimeoutMs = envContext.config.HEARTBEAT_TIMEOUT_SECONDS * 1000;
  const checkIntervalMs = envContext.config.HEARTBEAT_CHECK_INTERVAL_SECONDS * 1000;

  let intervalId: NodeJS.Timeout | null = null;

  function checkHeartbeats(): void {
    const inactiveWorkers = registry.markInactiveWorkers(heartbeatTimeoutMs);

    for (const { serviceName, workerId } of inactiveWorkers) {
      logger.warn('Worker marked as inactive due to missing heartbeat', {
        serviceName,
        workerId,
        timeoutSeconds: envContext.config.HEARTBEAT_TIMEOUT_SECONDS,
      });

      onWorkerInactive(serviceName, workerId);
    }
  }

  function start(): void {
    if (intervalId) {
      logger.warn('Heartbeat monitor already started');
      return;
    }

    logger.info('Starting heartbeat monitor', {
      heartbeatTimeoutSeconds: envContext.config.HEARTBEAT_TIMEOUT_SECONDS,
      checkIntervalSeconds: envContext.config.HEARTBEAT_CHECK_INTERVAL_SECONDS,
    });

    intervalId = setInterval(checkHeartbeats, checkIntervalMs);
  }

  function stop(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      logger.info('Heartbeat monitor stopped');
    }
  }

  return {
    start,
    stop,
  };
}

export type HeartbeatMonitor = ReturnType<typeof createHeartbeatMonitor>;


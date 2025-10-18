import * as zmq from 'zeromq';
import type { CoordinatorContext } from '../context.js';
import type { MessageHandler } from './messageHandler.js';
import type {
  AssignmentMessage,
  IncomingMessage,
  OutgoingMessage
} from './types.js';

export function createZmqCoordinator(context: CoordinatorContext, messageHandler: MessageHandler) {
  const { diagnosticContext, envContext } = context;
  const logger = diagnosticContext.logger;

  const socket = new zmq.Router();
  let isRunning = false;

  // Map to store worker identities for routing messages
  const workerIdentities = new Map<string, Buffer>();

  function sendAssignment(workerId: string, assignment: AssignmentMessage): void {
    const identity = workerIdentities.get(workerId);

    if (!identity) {
      logger.warn('Cannot send assignment, worker identity not found', { workerId });
      return;
    }

    const message: OutgoingMessage = {
      type: 'assignment',
      data: assignment,
    };

    const messageStr = JSON.stringify(message);

    socket
      .send([identity, messageStr])
      .then(() => {
        logger.debug('Sent assignment to worker', {
          workerId,
          assignedShards: assignment.assignedShards,
        });
      })
      .catch((error) => {
        logger.error(error, 'Failed to send assignment', {
          workerId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  async function start(): Promise<void> {
    if (isRunning) {
      logger.warn('ZMQ coordinator already running');
      return;
    }

    const bindAddress = `${envContext.config.SHARD_COORDINATOR_BIND_HOST}:${envContext.config.SHARD_COORDINATOR_BIND_PORT}`;

    try {
      await socket.bind(bindAddress);
      isRunning = true;

      logger.info('ZMQ coordinator bound and listening', {
        address: bindAddress,
      });

      // Start receiving messages
      void receiveMessages();
    } catch (error) {
      logger.error(error, 'Failed to bind ZMQ socket', {
        address: bindAddress,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function receiveMessages(): Promise<void> {
    try {
      for await (const [identity, message] of socket) {
        try {
          const identityStr = identity.toString();
          const messageStr = message.toString();

          logger.debug('Received message', {
            identity: identityStr,
            message: messageStr,
          });

          const parsed = JSON.parse(messageStr) as IncomingMessage;

          // Store worker identity for future communication
          if (parsed.type === 'register' || parsed.type === 'heartbeat') {
            const workerId = parsed.data.workerId;
            workerIdentities.set(workerId, identity);
          }

          // Handle different message types
          if (parsed.type === 'register') {
            messageHandler.handleRegistration(parsed.data, sendAssignment);
          } else if (parsed.type === 'heartbeat') {
            messageHandler.handleHeartbeat(parsed.data);
          } else {
            // TypeScript should ensure we never reach here
            logger.warn('Unknown message type received');
          }
        } catch (error) {
          logger.error(error, 'Error processing message', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      if (isRunning) {
        logger.error(error, 'Error receiving messages', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async function stop(): Promise<void> {
    if (!isRunning) {
      return;
    }

    isRunning = false;

    try {
      await socket.close();
      logger.info('ZMQ coordinator stopped');
    } catch (error) {
      logger.error(error, 'Error stopping ZMQ coordinator', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function createInactiveWorkerHandler() {
    return (serviceName: string, workerId: string) => {
      messageHandler.handleWorkerInactive(serviceName, workerId, sendAssignment);
    };
  }

  return {
    start,
    stop,
    sendAssignment,
    createInactiveWorkerHandler,
  };
}

export type ZmqCoordinator = ReturnType<typeof createZmqCoordinator>;

import { MessagePort, Worker } from 'node:worker_threads';

export function createWorkerTypedChannel<
  To extends Record<string, unknown>,
  From extends Record<string, unknown>,
>(port: MessagePort | Worker) {
  return {
    postMessage: (msg: To) => port.postMessage(msg),
    onMessage: (handler: (msg: From) => void) => {
      port.on('message', (msg) => handler(msg as From));
    },
  };
}

export type BaseWorkerToMainTypedChannel = ReturnType<
  typeof createWorkerTypedChannel<WorkerToMainMessage, MainToWorkerMessage>
>;


type BaseMessage = { workerId: string };

export type MainToWorkerMessage =
  | (BaseMessage & { type: 'init'; symbol: string })
  | { type: 'shutdown' };

export type WorkerToMainMessage =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | (BaseMessage & { type: 'metric'; metricKey: string, methodKey: string, args: any[] })
  | (BaseMessage & { type: 'ready' })
  | (BaseMessage & { type: 'closed' })
  | (BaseMessage & { type: 'initialized' });

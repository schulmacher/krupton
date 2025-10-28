import { SF } from '@krupton/service-framework-node';
import { MessagePort, parentPort, workerData } from 'node:worker_threads';
import {
  createWorkerTypedChannel,
  MainToWorkerMessage,
  WorkerToMainMessage,
} from '../../../lib/worker.js';
import { createBinanceTradesTransformerContext } from './transformerContext.js';
import { startBinanceTradesTransformerWorker } from './transformerProcess.js';

const workerId: string = workerData.workerId;

if (!workerData.workerId || typeof workerId !== 'string') {
  throw new Error('Unable to start a worker without workerId argument');
}

parentPort!.once('message', (msg) => {
  const port = msg.port as MessagePort;
  port.start();

  // Create typed channel inside worker (note reversed generic direction!)
  const workerChannel = createWorkerTypedChannel<WorkerToMainMessage, MainToWorkerMessage>(port);

  // Tell main we're alive
  workerChannel.postMessage({ type: 'ready', workerId });

  let processContextOuter: SF.ProcessLifecycleContext | null = null;

  // Listen for typed messages
  workerChannel.onMessage(async (data) => {
    if (data.type === 'init') {
      await SF.startProcessLifecycle(async (processContext) => {
        processContextOuter = processContext;

        const serviceContext = createBinanceTradesTransformerContext(processContext, workerId);
        const metricsOriginal = { ...serviceContext.metricsContext.metrics };

        for (const metric of Object.keys(metricsOriginal)) {
          const metricKey = metric as keyof typeof metricsOriginal;
          for (const methodKey of Object.keys(metricsOriginal[metricKey])) {
            // @ts-expect-error too lazy to fix the monke patch types
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            serviceContext.metricsContext.metrics[metricKey][methodKey as any] = ((
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ...args: any[]
            ) => {
              workerChannel.postMessage({ type: 'metric', workerId, metricKey, methodKey, args });
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }) as any;
          }
        }
        await startBinanceTradesTransformerWorker(serviceContext, data.symbol);

        return {
          diagnosticContext: serviceContext.diagnosticContext,
          envContext: serviceContext.envContext,
        };
      });
      workerChannel.postMessage({ type: 'initialized', workerId });
    } else if (data.type === 'shutdown') {
      console.log('[worker] shutting down');
      await processContextOuter?.shutdown().catch((err) => {
        console.error(`Failed to shutdown worker "${workerId}" gracefully!`, err);
      });
      process.exit(0);
    }
  });
});

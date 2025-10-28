import { SF } from '@krupton/service-framework-node';
import { createPromiseLock } from '@krupton/utils';
import { MessageChannel, Worker } from 'node:worker_threads';
import {
  createWorkerTypedChannel,
  MainToWorkerMessage,
  WorkerToMainMessage,
} from '../../../lib/worker.js';
import { startJoinAndTransformBinanceTradesPipeline } from '../../../rawPipelines/binanceTrades.js';
import { BinanceTradesTransformerContext } from './transformerContext.js';

export async function startBinanceTradesTransformerService(
  context: BinanceTradesTransformerContext,
): Promise<void> {
  const { diagnosticContext, processContext, metricsContext } = context;

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
  await httpServer.startServer();

  const workers = context.symbols.map((symbol) => {
    const { port1, port2 } = new MessageChannel();
    const lock = createPromiseLock();
    const workerId = symbol;

    const worker = new Worker(new URL('./transformerWorker.js', import.meta.url), {
      workerData: { workerId },
    });

    const channel = createWorkerTypedChannel<MainToWorkerMessage, WorkerToMainMessage>(port1);
    channel.onMessage((msg) => {
      if (msg.type === 'ready' || msg.type === 'initialized' || msg.type === 'closed') {
        diagnosticContext.logger.info('Message from worker', {
          workerId: msg.workerId,
          type: msg.type,
        });
        lock.unlock();
      } else if (msg.type === 'metric') {
        // @ts-expect-error to lazy to fix
        metricsContext.metrics[msg.metricKey][msg.methodKey](...msg.args);
      }
    });

    processContext.onShutdown(async () => {
      lock.lock();
      channel.postMessage({ type: 'shutdown' });
      await lock.promise;
    });

    return {
      workerId: symbol,
      isReady: () => lock.promise,
      async init() {
        lock.lock();
        worker.postMessage({ port: port2 }, [port2]);
        await lock.promise;

        lock.lock();
        channel.postMessage({ type: 'init', workerId, symbol });

        diagnosticContext.logger.info('Started worker', { symbol });
        await lock.promise;
      },
    };
  });

  await Promise.all(workers.map((w) => w.init()));

  diagnosticContext.logger.info('Started service', context.envContext.config);
}

// WORKER
export async function startBinanceTradesTransformerWorker(
  context: BinanceTradesTransformerContext,
  symbol: string,
): Promise<void> {
  const { diagnosticContext, processContext } = context;

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
    consumer.connect([symbol]);
  }
  for (const producer of Object.values(context.producers)) {
    await producer.connect([symbol]);
  }

  diagnosticContext.logger.info('Starting pipeline for symbol', { symbol });
  const symbolDiagnostics = diagnosticContext.getChildDiagnosticContext({ symbol });
  const symbolContext = {
    ...context,
    diagnosticContext: symbolDiagnostics,
  };

  startJoinAndTransformBinanceTradesPipeline(symbolContext, symbol).catch((error) => {
    symbolDiagnostics.logger.error(error, 'Error in entity readers');
  });
  diagnosticContext.logger.info('Started pipeline for symbol', { symbol });
}

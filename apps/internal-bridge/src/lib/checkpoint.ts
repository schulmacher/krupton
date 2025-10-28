import { SF } from '@krupton/service-framework-node';
import { createPromiseLock, yieldToEventLoop } from '@krupton/utils';

export function createGenericCheckpointFunction<T>(opts: {
  processContext: SF.ProcessLifecycleContext;
  diagnosticContext: SF.DiagnosticContext;
  onCheckpoint: (data: T[]) => Promise<void>;
  maxCacheSize?: number;
  maxWaitTimeMs?: number;
}): { cache: T[]; checkpoint: (force?: boolean) => Promise<void> } {
  const {
    diagnosticContext,
    processContext,
    onCheckpoint,
    maxCacheSize = 1000,
    maxWaitTimeMs = 5000,
  } = opts;
  const cache: T[] = [];

  let lastCheckpointTime = Date.now();
  const promiseLock = createPromiseLock();

  async function checkpoint(force = false) {
    await promiseLock.promise;

    const timeElapsed = Date.now() - lastCheckpointTime;
    const shouldCheckpoint = force || timeElapsed > maxWaitTimeMs || cache.length > maxCacheSize;

    if (!shouldCheckpoint) {
      return;
    }

    try {
      promiseLock.lock();

      const clone = cache.slice();
      cache.length = 0;

      await onCheckpoint(clone);

      await yieldToEventLoop();
      lastCheckpointTime = Date.now();
    } catch (err) {
      diagnosticContext.logger.fatal(err, 'Failed persistence');
      await processContext.restart();
    } finally {
      promiseLock.unlock();
    }
  }

  processContext.onShutdown(async () => {
    await checkpoint(true);
  });

  return {
    cache,
    checkpoint,
  };
}

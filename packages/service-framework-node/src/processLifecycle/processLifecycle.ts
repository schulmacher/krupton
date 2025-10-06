import type { Logger } from '../diagnostics/types.js';
import type {
  ShutdownCallback,
  ShutdownConfiguration,
  ProcessLifecycleConfig,
  ProcessLifecycleContext,
} from './types.js';

const defaultShutdownConfiguration: ShutdownConfiguration = {
  callbackTimeout: 10000,
  totalTimeout: 30000,
};

export function createProcessLifecycle(config: ProcessLifecycleConfig): ProcessLifecycleContext {
  const shutdownConfig = config.shutdownConfiguration ?? defaultShutdownConfiguration;

  const callbacks: ShutdownCallback[] = [];
  let shuttingDown = false;
  let started = false;

  const executeCallbackWithTimeout = async (
    callback: ShutdownCallback,
    timeout: number,
    logger: Logger,
  ): Promise<void> => {
    try {
      await Promise.race([
        callback(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Callback timeout')), timeout),
        ),
      ]);
    } catch (error) {
      logger.error('Shutdown callback failed or timed out', {
        error: error instanceof Error ? error.message : String(error),
        timeout,
      });
    }
  };

  const executeAllCallbacks = async (logger: Logger): Promise<void> => {
    for (const callback of callbacks) {
      await executeCallbackWithTimeout(callback, shutdownConfig.callbackTimeout, logger);
    }
  };

  const initiateShutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    config.diagnosticContext.logger.info('Graceful shutdown initiated', { signal });

    const forceExitTimeout = setTimeout(() => {
      config.diagnosticContext.logger.fatal('Shutdown timeout exceeded, forcing exit', {
        totalTimeout: shutdownConfig.totalTimeout,
      });
      process.exit(1);
    }, shutdownConfig.totalTimeout);

    await executeAllCallbacks(config.diagnosticContext.logger);

    clearTimeout(forceExitTimeout);

    config.diagnosticContext.logger.info('Graceful shutdown completed');
    process.exit(0);
  };

  const handleSignal = (signal: string): void => {
    void initiateShutdown(signal);
  };

  const handleUnhandledRejection = (reason: unknown, promise: Promise<unknown>): void => {
    config.diagnosticContext.logger.fatal('Unhandled promise rejection detected', {
      reason: String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
    });

    void initiateShutdown('unhandledRejection');
  };

  const handleUncaughtException = (error: Error): void => {
    config.diagnosticContext.logger.fatal('Uncaught exception detected', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });

    void initiateShutdown('uncaughtException');
  };

  const handleWarning = (warning: Error): void => {
    config.diagnosticContext.logger.warn('Process warning emitted', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
    });
  };

  const onShutdown = (callback: ShutdownCallback): void => {
    callbacks.push(callback);
  };

  const start = (): void => {
    if (started) {
      config.diagnosticContext.logger.warn('Process lifecycle already started');
      return;
    }

    started = true;

    process.on('SIGTERM', () => handleSignal('SIGTERM'));
    process.on('SIGINT', () => handleSignal('SIGINT'));
    process.on('SIGUSR2', () => handleSignal('SIGUSR2'));
    process.on('unhandledRejection', handleUnhandledRejection);
    process.on('uncaughtException', handleUncaughtException);
    process.on('warning', handleWarning);

    config.diagnosticContext.logger.info('Process lifecycle signal handlers registered');
  };

  const shutdown = async (): Promise<void> => {
    await initiateShutdown('manual');
  };

  const isShuttingDown = (): boolean => {
    return shuttingDown;
  };

  return {
    onShutdown,
    start,
    shutdown,
    isShuttingDown,
  };
}

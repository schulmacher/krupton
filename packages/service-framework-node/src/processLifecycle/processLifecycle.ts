import { stringifyJSONSafe } from '@krupton/utils';
import type { DiagnosticContext, Logger } from '../diagnostics/types.js';
import { DefaultEnvSchemaType } from '../environment/types.js';
import { createDiagnosticContext, createEnvContext } from '../sf.js';
import type {
  ProcessLifecycleConfig,
  ProcessLifecycleContext,
  ProcessStartFn,
  ShutdownCallback,
  ShutdownConfiguration,
} from './types.js';

const defaultShutdownConfiguration: ShutdownConfiguration = {
  callbackTimeout: 10000,
  totalTimeout: 30000,
};

export function startProcessLifecycle(
  startFn: ProcessStartFn,
  config?: ProcessLifecycleConfig,
): Promise<void> {
  let baseEnv = createEnvContext(DefaultEnvSchemaType);
  let diagnosticContext = createDiagnosticContext(baseEnv);

  const start: () => Promise<void> = async (): Promise<void> => {
    let context = startProcessLifecycleContext(diagnosticContext, config);
    let unregisterSignalHandlers = context.registerSignalHandlers();

    const wrappedStartFn = async (context: ProcessLifecycleContext) => {
      const result = await startFn(context);
      diagnosticContext = result.diagnosticContext;
      baseEnv = result.envContext;

      return result;
    };

    let restart = async () => {
      if (context.isShuttingDown()) {
        diagnosticContext.logger.warn('Attempted to restart while shutting down');
        return;
      }

      await context.stopProcess('CUSTOM_RESTART');
      unregisterSignalHandlers();

      context = startProcessLifecycleContext(diagnosticContext, config);
      unregisterSignalHandlers = context.registerSignalHandlers();

      await wrappedStartFn({
        shutdown: context.shutdown,
        isShuttingDown: context.isShuttingDown,
        onShutdown: context.onShutdown,
        restart,
      }).catch((error) => {
        diagnosticContext.logger.error(error, 'Error starting process, restarting.', {
          ...baseEnv.config,
        });
        setTimeout(() => {
          void restart();
        }, 1000);
      });
    };

    await wrappedStartFn({
      shutdown: context.shutdown,
      isShuttingDown: context.isShuttingDown,
      onShutdown: context.onShutdown,
      restart,
    });

    diagnosticContext.logger.info('Process lifecycle signal handlers registered');
  };

  return start();
}

function startProcessLifecycleContext(
  diagnosticContext: DiagnosticContext,
  { shutdownConfiguration }: ProcessLifecycleConfig = {
    shutdownConfiguration: defaultShutdownConfiguration,
  },
): Omit<ProcessLifecycleContext, 'restart'> & {
  registerSignalHandlers(): () => void;
  stopProcess(signal: string): Promise<void>;
} {
  const shutdownConfig = shutdownConfiguration ?? defaultShutdownConfiguration;

  const callbacks: ShutdownCallback[] = [];
  let shuttingDown = false;

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
      logger.error(error, 'Shutdown callback failed or timed out', {
        timeout,
      });
    }
  };

  const executeAllCallbacks = async (logger: Logger): Promise<void> => {
    for (const callback of callbacks) {
      await executeCallbackWithTimeout(callback, shutdownConfig.callbackTimeout, logger);
    }
  };

  const stopProcess = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    diagnosticContext.logger.info('Graceful shutdown initiated', { signal });

    const forceExitTimeout = setTimeout(() => {
      diagnosticContext.logger.fatal(new Error('Shutdown timeout exceeded, forcing exit'), {
        totalTimeout: shutdownConfig.totalTimeout,
      });
      process.exit(1);
    }, shutdownConfig.totalTimeout);

    await executeAllCallbacks(diagnosticContext.logger);

    clearTimeout(forceExitTimeout);

    diagnosticContext.logger.info('Graceful shutdown completed');
  };

  const initiateShutdown = async (signal: string): Promise<void> => {
    await stopProcess(signal);
    process.exit(0);
  };

  const handleSignal = (signal: string): void => {
    void initiateShutdown(signal);
  };

  const handleUnhandledRejection = (reason: unknown, promise: Promise<unknown>): void => {
    diagnosticContext.logger.fatal(new Error('Unhandled promise rejection detected'), {
      reason: stringifyJSONSafe(reason),
      reasonString: String(reason),
      promise: promise.toString(),
    });

    void initiateShutdown('unhandledRejection');
  };

  const handleUncaughtException = (error: Error): void => {
    diagnosticContext.logger.fatal(error, 'Uncaught exception detected');

    void initiateShutdown('uncaughtException');
  };

  const handleWarning = (warning: Error): void => {
    diagnosticContext.logger.warn('Process warning emitted', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
    });
  };

  const onShutdown = (callback: ShutdownCallback): void => {
    callbacks.push(callback);
  };

  function registerSignalHandlers() {
    const sigTermHandler = () => handleSignal('SIGTERM');
    const sigIntHandler = () => handleSignal('SIGINT');
    const sigUsr2Handler = () => handleSignal('SIGUSR2');

    process.on('SIGTERM', sigTermHandler);
    process.on('SIGINT', sigIntHandler);
    process.on('SIGUSR2', sigUsr2Handler);
    process.on('unhandledRejection', handleUnhandledRejection);
    process.on('uncaughtException', handleUncaughtException);
    process.on('warning', handleWarning);

    return () => {
      process.removeListener('SIGTERM', sigTermHandler);
      process.removeListener('SIGINT', sigIntHandler);
      process.removeListener('SIGUSR2', sigUsr2Handler);
      process.removeListener('unhandledRejection', handleUnhandledRejection);
      process.removeListener('uncaughtException', handleUncaughtException);
      process.removeListener('warning', handleWarning);
    };
  }

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    await initiateShutdown('manual');
  };

  const isShuttingDown = (): boolean => {
    return shuttingDown;
  };

  return {
    onShutdown,
    shutdown,
    isShuttingDown,
    stopProcess,
    registerSignalHandlers,
  };
}

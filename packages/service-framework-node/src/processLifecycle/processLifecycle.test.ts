import { describe, it, expect, beforeEach, afterEach, vi, MockInstance } from 'vitest';
import { createDiagnosticContext } from '../diagnostics/diagnostics.js';
import type { DefaultEnvContext } from '../environment/types.js';
import { createProcessLifecycle } from './processLifecycle.js';
import type { ProcessLifecycleConfig } from './types.js';

function createTestEnvContext(): DefaultEnvContext {
  return {
    config: { PROCESS_NAME: 'test-service' },
    nodeEnv: 'test',
  };
}

describe('createProcessLifecycle', () => {
  let processExitSpy: MockInstance<typeof process.exit>;
  let processOnSpy: MockInstance<typeof process.on>;
  let consoleLogSpy: MockInstance<typeof console.log>;
  let consoleErrorSpy: MockInstance<typeof vi.fn>;

  beforeEach(() => {
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    processOnSpy = vi.spyOn(process, 'on');
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    processOnSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('creates process lifecycle context with default configuration', () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const config: ProcessLifecycleConfig = {
        diagnosticContext,
      };

      const context = createProcessLifecycle(config);

      expect(context.onShutdown).toBeDefined();
      expect(context.start).toBeDefined();
      expect(context.shutdown).toBeDefined();
      expect(context.isShuttingDown).toBeDefined();
    });

    it('creates process lifecycle context with custom configuration', () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const config: ProcessLifecycleConfig = {
        diagnosticContext,
        shutdownConfiguration: {
          callbackTimeout: 5000,
          totalTimeout: 15000,
        },
      };

      const context = createProcessLifecycle(config);

      expect(context).toBeDefined();
    });
  });

  describe('signal handler registration', () => {
    it('registers signal handlers when start is called', () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const context = createProcessLifecycle({ diagnosticContext });
      context.start();

      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGUSR2', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('warning', expect.any(Function));
    });

    it('logs warning when start is called multiple times', () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const context = createProcessLifecycle({ diagnosticContext });
      context.start();
      context.start();

      const logCalls = consoleLogSpy.mock.calls.map((call) => call[0] as string);
      const warningLogs = logCalls.filter((log) =>
        log.includes('Process lifecycle already started'),
      );

      expect(warningLogs).toHaveLength(1);
    });
  });

  describe('shutdown callback registration and execution', () => {
    it('executes registered callbacks in order', async () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const context = createProcessLifecycle({ diagnosticContext });

      const executionOrder: number[] = [];

      context.onShutdown(() => {
        executionOrder.push(1);
      });

      context.onShutdown(() => {
        executionOrder.push(2);
      });

      context.onShutdown(() => {
        executionOrder.push(3);
      });

      const shutdownPromise = context.shutdown();
      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(executionOrder).toEqual([1, 2, 3]);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('executes async callbacks', async () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const context = createProcessLifecycle({ diagnosticContext });

      let asyncCallbackExecuted = false;

      context.onShutdown(async () => {
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            asyncCallbackExecuted = true;
            resolve();
          }, 100);
        });
      });

      const shutdownPromise = context.shutdown();
      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(asyncCallbackExecuted).toBe(true);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('handles callback errors without stopping execution', async () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const context = createProcessLifecycle({ diagnosticContext });

      let secondCallbackExecuted = false;

      context.onShutdown(() => {
        throw new Error('Callback error');
      });

      context.onShutdown(() => {
        secondCallbackExecuted = true;
      });

      const shutdownPromise = context.shutdown();
      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(secondCallbackExecuted).toBe(true);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('enforces per-callback timeout', async () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const context = createProcessLifecycle({
        diagnosticContext,
        shutdownConfiguration: {
          callbackTimeout: 1000,
          totalTimeout: 5000,
        },
      });

      let secondCallbackExecuted = false;

      context.onShutdown(async () => {
        await new Promise<void>(() => {
          // Never resolves - will timeout
        });
      });

      context.onShutdown(() => {
        secondCallbackExecuted = true;
      });

      const shutdownPromise = context.shutdown();
      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(secondCallbackExecuted).toBe(true);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('signal handling', () => {
    it('handles SIGTERM signal', async () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const context = createProcessLifecycle({ diagnosticContext });

      let callbackExecuted = false;

      context.onShutdown(() => {
        callbackExecuted = true;
      });

      context.start();

      const sigtermHandler = processOnSpy.mock.calls.find(
        (call) => call[0] === 'SIGTERM',
      )?.[1] as () => void;

      expect(sigtermHandler).toBeDefined();

      const shutdownPromise = sigtermHandler();
      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(callbackExecuted).toBe(true);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('handles SIGINT signal', async () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const context = createProcessLifecycle({ diagnosticContext });

      let callbackExecuted = false;

      context.onShutdown(() => {
        callbackExecuted = true;
      });

      context.start();

      const sigintHandler = processOnSpy.mock.calls.find(
        (call) => call[0] === 'SIGINT',
      )?.[1] as () => void;

      expect(sigintHandler).toBeDefined();

      const shutdownPromise = sigintHandler();
      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(callbackExecuted).toBe(true);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('unhandled rejection handling', () => {
    it('handles unhandled promise rejection', async () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const context = createProcessLifecycle({ diagnosticContext });
      context.start();

      const rejectionHandler = processOnSpy.mock.calls.find(
        (call) => call[0] === 'unhandledRejection',
      )?.[1] as (reason: unknown, promise: Promise<unknown>) => void;

      expect(rejectionHandler).toBeDefined();

      const testError = new Error('Test rejection');
      const testPromise = Promise.reject(testError);

      const shutdownPromise = rejectionHandler(testError, testPromise);
      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(processExitSpy).toHaveBeenCalledWith(0);

      const errorLogs = consoleErrorSpy.mock.calls.map((call) => String(call[0]));
      const fatalLog = errorLogs.find((log) =>
        log.includes('Unhandled promise rejection detected'),
      );
      expect(fatalLog).toBeDefined();
    });
  });

  describe('uncaught exception handling', () => {
    it('handles uncaught exception', async () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const context = createProcessLifecycle({ diagnosticContext });
      context.start();

      const exceptionHandler = processOnSpy.mock.calls.find(
        (call) => call[0] === 'uncaughtException',
      )?.[1] as (error: Error) => void;

      expect(exceptionHandler).toBeDefined();

      const testError = new Error('Test exception');

      const shutdownPromise = exceptionHandler(testError);
      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(processExitSpy).toHaveBeenCalledWith(0);

      const errorLogs = consoleErrorSpy.mock.calls.map((call) => String(call[0]));
      const fatalLog = errorLogs.find((log) => log.includes('Uncaught exception detected'));
      expect(fatalLog).toBeDefined();
    });
  });

  describe('warning handling', () => {
    it('logs process warnings without shutting down', () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const context = createProcessLifecycle({ diagnosticContext });
      context.start();

      const warningHandler = processOnSpy.mock.calls.find((call) => call[0] === 'warning')?.[1] as (
        warning: Error,
      ) => void;

      expect(warningHandler).toBeDefined();

      const testWarning = new Error('Test warning');
      testWarning.name = 'DeprecationWarning';

      warningHandler(testWarning);

      expect(processExitSpy).not.toHaveBeenCalled();

      const logCalls = consoleLogSpy.mock.calls.map((call) => call[0] as string);
      const warningLog = logCalls.find((log) => log.includes('Process warning emitted'));
      expect(warningLog).toBeDefined();
    });
  });

  describe('shutdown state management', () => {
    it('reports shutting down state', async () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const context = createProcessLifecycle({ diagnosticContext });

      expect(context.isShuttingDown()).toBe(false);

      const shutdownPromise = context.shutdown();

      expect(context.isShuttingDown()).toBe(true);

      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(context.isShuttingDown()).toBe(true);
    });

    it('prevents duplicate shutdown execution', async () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const context = createProcessLifecycle({ diagnosticContext });

      let callbackExecutionCount = 0;

      context.onShutdown(() => {
        callbackExecutionCount++;
      });

      const shutdownPromise1 = context.shutdown();
      const shutdownPromise2 = context.shutdown();

      await vi.runAllTimersAsync();
      await Promise.all([shutdownPromise1, shutdownPromise2]);

      expect(callbackExecutionCount).toBe(1);
      expect(processExitSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('forced termination', () => {
    it('forces exit when total timeout is exceeded', async () => {
      const envContext = createTestEnvContext();
      const diagnosticContext = createDiagnosticContext(envContext);

      const context = createProcessLifecycle({
        diagnosticContext,
        shutdownConfiguration: {
          callbackTimeout: 5000,
          totalTimeout: 1000,
        },
      });

      context.onShutdown(async () => {
        await new Promise<void>(() => {
          // Never resolves - will trigger total timeout
        });
      });

      const shutdownPromise = context.shutdown();
      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(processExitSpy).toHaveBeenCalledWith(1);

      const errorLogs = consoleErrorSpy.mock.calls.map((call) => String(call[0]));
      const timeoutLog = errorLogs.find((log) => log.includes('Shutdown timeout exceeded'));
      expect(timeoutLog).toBeDefined();
    });
  });
});

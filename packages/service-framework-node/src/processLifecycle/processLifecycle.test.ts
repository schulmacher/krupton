import { describe, it, expect, beforeEach, afterEach, vi, MockInstance } from 'vitest';
import { createDiagnosticContext } from '../diagnostics/diagnostics.js';
import type { DefaultEnvContext } from '../environment/types.js';
import { startProcessLifecycle } from './processLifecycle.js';
import type { ProcessLifecycleConfig, ProcessLifecycleContext } from './types.js';

function createTestEnvContext(): DefaultEnvContext {
  return {
    config: { PROCESS_NAME: 'test-service' },
    nodeEnv: 'test',
  };
}

describe('startProcessLifecycle', () => {
  let processExitSpy: MockInstance<typeof process.exit>;
  let processOnSpy: MockInstance<typeof process.on>;
  let consoleLogSpy: MockInstance<typeof console.log>;
  let consoleErrorSpy: MockInstance<typeof vi.fn>;
  let originalProcessName: string | undefined;

  beforeEach(() => {
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    processOnSpy = vi.spyOn(process, 'on');
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    originalProcessName = process.env.PROCESS_NAME;
    process.env.PROCESS_NAME = 'test-service';
    vi.useFakeTimers();
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    processOnSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    if (originalProcessName === undefined) {
      delete process.env.PROCESS_NAME;
    } else {
      process.env.PROCESS_NAME = originalProcessName;
    }
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('creates process lifecycle context with default configuration', async () => {
      let capturedContext: ProcessLifecycleContext | undefined;

      void startProcessLifecycle(async (context) => {
        capturedContext = context;
        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      });

      await vi.runAllTimersAsync();

      expect(capturedContext).toBeDefined();
      expect(capturedContext?.onShutdown).toBeDefined();
      expect(capturedContext?.shutdown).toBeDefined();
      expect(capturedContext?.isShuttingDown).toBeDefined();
      expect(capturedContext?.restart).toBeDefined();

      // Cleanup
      if (capturedContext) {
        void capturedContext.shutdown();
        await vi.runAllTimersAsync();
      }
    });

    it('creates process lifecycle context with custom configuration', async () => {
      let capturedContext: ProcessLifecycleContext | undefined;

      const config: ProcessLifecycleConfig = {
        shutdownConfiguration: {
          callbackTimeout: 5000,
          totalTimeout: 15000,
        },
      };

      void startProcessLifecycle(async (context) => {
        capturedContext = context;
        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      }, config);

      await vi.runAllTimersAsync();

      expect(capturedContext).toBeDefined();

      // Cleanup
      if (capturedContext) {
        void capturedContext.shutdown();
        await vi.runAllTimersAsync();
      }
    });
  });

  describe('signal handler registration', () => {
    it('registers signal handlers when process starts', async () => {
      let capturedContext: ProcessLifecycleContext | undefined;

      void startProcessLifecycle(async (context) => {
        capturedContext = context;
        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      });

      await vi.runAllTimersAsync();

      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGUSR2', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('warning', expect.any(Function));

      // Cleanup
      if (capturedContext) {
        void capturedContext.shutdown();
        await vi.runAllTimersAsync();
      }
    });
  });

  describe('shutdown callback registration and execution', () => {
    it('executes registered callbacks in order', async () => {
      let capturedContext: ProcessLifecycleContext | undefined;
      const executionOrder: number[] = [];

      void startProcessLifecycle(async (context) => {
        capturedContext = context;

        context.onShutdown(() => {
          executionOrder.push(1);
        });

        context.onShutdown(() => {
          executionOrder.push(2);
        });

        context.onShutdown(() => {
          executionOrder.push(3);
        });

        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      });

      await vi.runAllTimersAsync();

      const shutdownPromise = capturedContext!.shutdown();
      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(executionOrder).toEqual([1, 2, 3]);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('executes async callbacks', async () => {
      let capturedContext: ProcessLifecycleContext | undefined;
      let asyncCallbackExecuted = false;

      void startProcessLifecycle(async (context) => {
        capturedContext = context;

        context.onShutdown(async () => {
          await new Promise<void>((resolve) => {
            setTimeout(() => {
              asyncCallbackExecuted = true;
              resolve();
            }, 100);
          });
        });

        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      });

      await vi.runAllTimersAsync();

      const shutdownPromise = capturedContext!.shutdown();
      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(asyncCallbackExecuted).toBe(true);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('handles callback errors without stopping execution', async () => {
      let capturedContext: ProcessLifecycleContext | undefined;
      let secondCallbackExecuted = false;

      void startProcessLifecycle(async (context) => {
        capturedContext = context;

        context.onShutdown(() => {
          throw new Error('Callback error');
        });

        context.onShutdown(() => {
          secondCallbackExecuted = true;
        });

        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      });

      await vi.runAllTimersAsync();

      const shutdownPromise = capturedContext!.shutdown();
      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(secondCallbackExecuted).toBe(true);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('enforces per-callback timeout', async () => {
      let capturedContext: ProcessLifecycleContext | undefined;
      let secondCallbackExecuted = false;

      const config: ProcessLifecycleConfig = {
        shutdownConfiguration: {
          callbackTimeout: 1000,
          totalTimeout: 5000,
        },
      };

      void startProcessLifecycle(async (context) => {
        capturedContext = context;

        context.onShutdown(async () => {
          await new Promise<void>(() => {
            // Never resolves - will timeout
          });
        });

        context.onShutdown(() => {
          secondCallbackExecuted = true;
        });

        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      }, config);

      await vi.runAllTimersAsync();

      const shutdownPromise = capturedContext!.shutdown();
      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(secondCallbackExecuted).toBe(true);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('signal handling', () => {
    it('handles SIGTERM signal', async () => {
      let callbackExecuted = false;

      void startProcessLifecycle(async (context) => {
        context.onShutdown(() => {
          callbackExecuted = true;
        });

        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      });

      await vi.runAllTimersAsync();

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
      let callbackExecuted = false;

      void startProcessLifecycle(async (context) => {
        context.onShutdown(() => {
          callbackExecuted = true;
        });

        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      });

      await vi.runAllTimersAsync();

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
      void startProcessLifecycle(async () => {
        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      });

      await vi.runAllTimersAsync();

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
      void startProcessLifecycle(async () => {
        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      });

      await vi.runAllTimersAsync();

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
    it('logs process warnings without shutting down', async () => {
      let capturedContext: ProcessLifecycleContext | undefined;

      void startProcessLifecycle(async (context) => {
        capturedContext = context;
        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      });

      await vi.runAllTimersAsync();

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

      // Cleanup
      if (capturedContext) {
        void capturedContext.shutdown();
        await vi.runAllTimersAsync();
      }
    });
  });

  describe('shutdown state management', () => {
    it('reports shutting down state', async () => {
      let capturedContext: ProcessLifecycleContext | undefined;

      void startProcessLifecycle(async (context) => {
        capturedContext = context;
        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      });

      await vi.runAllTimersAsync();

      expect(capturedContext!.isShuttingDown()).toBe(false);

      const shutdownPromise = capturedContext!.shutdown();

      expect(capturedContext!.isShuttingDown()).toBe(true);

      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(capturedContext!.isShuttingDown()).toBe(true);
    });

    it('prevents duplicate shutdown execution', async () => {
      let capturedContext: ProcessLifecycleContext | undefined;
      let callbackExecutionCount = 0;

      void startProcessLifecycle(async (context) => {
        capturedContext = context;

        context.onShutdown(() => {
          callbackExecutionCount++;
        });

        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      });

      await vi.runAllTimersAsync();

      const shutdownPromise1 = capturedContext!.shutdown();
      const shutdownPromise2 = capturedContext!.shutdown();

      await vi.runAllTimersAsync();
      await Promise.all([shutdownPromise1, shutdownPromise2]);

      expect(callbackExecutionCount).toBe(1);
      expect(processExitSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('forced termination', () => {
    it('forces exit when total timeout is exceeded', async () => {
      let capturedContext: ProcessLifecycleContext | undefined;

      const config: ProcessLifecycleConfig = {
        shutdownConfiguration: {
          callbackTimeout: 5000,
          totalTimeout: 1000,
        },
      };

      void startProcessLifecycle(async (context) => {
        capturedContext = context;

        context.onShutdown(async () => {
          await new Promise<void>(() => {
            // Never resolves - will trigger total timeout
          });
        });

        const envContext = createTestEnvContext();
        const diagnosticContext = createDiagnosticContext(envContext);

        return { envContext, diagnosticContext };
      }, config);

      await vi.runAllTimersAsync();

      const shutdownPromise = capturedContext!.shutdown();
      await vi.runAllTimersAsync();
      await shutdownPromise;

      expect(processExitSpy).toHaveBeenCalledWith(1);

      const errorLogs = consoleErrorSpy.mock.calls.map((call) => String(call[0]));
      const timeoutLog = errorLogs.find((log) => log.includes('Shutdown timeout exceeded'));
      expect(timeoutLog).toBeDefined();
    });
  });
});

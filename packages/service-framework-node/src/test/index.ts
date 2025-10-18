import { vi } from 'vitest';
import type { DiagnosticContext, Logger } from '../diagnostics/types.js';
import type { EnvContext } from '../environment/types.js';
import type { MetricsContext } from '../metrics/types.js';
import type { ProcessLifecycleContext } from '../processLifecycle/types.js';

export function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    createChild: vi.fn(),
  };
}

export function createMockDiagnosticsContext(
  overrides?: Partial<DiagnosticContext>,
): DiagnosticContext {
  const mockLogger = createMockLogger();

  return {
    correlationIdGenerator: {
      generateRootId: vi.fn().mockReturnValue('test-root-id'),
      createScopedId: vi.fn((parent, scope) => `${parent}.${scope}`),
      extractRootId: vi.fn((id) => id.split('.')[0]),
    },
    logger: mockLogger,
    createChildLogger: vi.fn().mockReturnValue(mockLogger),
    ...overrides,
  };
}

export function createMockEnvContext<T = Record<string, unknown>>(
  config?: T,
  overrides?: Partial<EnvContext<T>>,
): EnvContext<T> {
  return {
    config: (config ?? {}) as T,
    nodeEnv: 'test',
    ...overrides,
  };
}

function createMockMetric() {
  return {
    // Counter methods
    inc: vi.fn(),
    reset: vi.fn(),
    // Gauge methods
    set: vi.fn(),
    dec: vi.fn(),
    setToCurrentTime: vi.fn(),
    // Histogram/Summary methods
    observe: vi.fn(),
    startTimer: vi.fn(() => vi.fn()),
    // Additional methods
    labels: vi.fn().mockReturnThis(),
  };
}

export function createMockMetricsContext<TMetrics = undefined>(
  overrides?: Partial<MetricsContext<TMetrics>>,
): MetricsContext<TMetrics> {
  const metricsCache = new Map<string | symbol, ReturnType<typeof createMockMetric>>();

  const metricsProxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (!metricsCache.has(prop)) {
          metricsCache.set(prop, createMockMetric());
        }
        return metricsCache.get(prop);
      },
    },
  ) as TMetrics;

  return {
    getRegistry: vi.fn(),
    createCounter: vi.fn(),
    createGauge: vi.fn(),
    createHistogram: vi.fn(),
    createSummary: vi.fn(),
    getMetricsAsString: vi.fn().mockResolvedValue('# HELP test\ntest_metric 1'),
    getMetrics: vi.fn().mockReturnValue([]),
    clearMetrics: vi.fn(),
    metrics: metricsProxy,
    ...overrides,
  };
}

export function createMockProcessContext(
  overrides?: Partial<ProcessLifecycleContext>,
): ProcessLifecycleContext {
  const shutdownCallbacks: Array<() => Promise<void> | void> = [];
  let isShuttingDown = false;

  return {
    onShutdown: vi.fn((callback) => {
      shutdownCallbacks.push(callback);
    }),
    shutdown: vi.fn(async () => {
      isShuttingDown = true;
      await Promise.all(shutdownCallbacks.map((cb) => cb()));
    }),
    isShuttingDown: vi.fn(() => isShuttingDown),
    restart: vi.fn(async () => {
      isShuttingDown = true;
      await Promise.all(shutdownCallbacks.map((cb) => cb()));
    }),
    ...overrides,
  };
}


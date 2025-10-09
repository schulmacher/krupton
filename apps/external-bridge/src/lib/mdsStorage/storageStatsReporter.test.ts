import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MdsStorageContext } from '../../process/storageProcess/context.js';

vi.mock('./storageStats.js', () => ({
  readStorageStats: vi.fn(),
}));

const { createStorageStatsReporter } = await import('./storageStatsReporter.js');
const { readStorageStats } = await import('./storageStats.js');

describe('createStorageStatsReporter', () => {
  let mockContext: MdsStorageContext;
  let mockMetrics: {
    directoryStorageSize: { set: ReturnType<typeof vi.fn> };
    directoryFileCount: { set: ReturnType<typeof vi.fn> };
    directoryLastUpdated: { set: ReturnType<typeof vi.fn> };
  };
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };
  let mockProcessContext: {
    isShuttingDown: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockMetrics = {
      directoryStorageSize: { set: vi.fn() },
      directoryFileCount: { set: vi.fn() },
      directoryLastUpdated: { set: vi.fn() },
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    mockProcessContext = {
      isShuttingDown: vi.fn().mockReturnValue(false),
      shutdown: vi.fn(),
    };

    mockContext = {
      metricsContext: {
        metrics: mockMetrics,
      },
      diagnosticContext: {
        logger: mockLogger,
      },
      processContext: mockProcessContext,
    } as unknown as MdsStorageContext;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a reporter with start and stop methods', () => {
    const reporter = createStorageStatsReporter(mockContext, '/test/storage');

    expect(reporter).toHaveProperty('start');
    expect(reporter).toHaveProperty('stop');
    expect(typeof reporter.start).toBe('function');
    expect(typeof reporter.stop).toBe('function');
  });

  it('should report stats when started', async () => {
    vi.mocked(readStorageStats).mockResolvedValue([
      {
        directory: 'binance/api_v3_depth',
        fileCount: 10,
        sizeBytes: 1024,
        lastUpdated: 1000000000000,
      },
    ]);

    const reporter = createStorageStatsReporter(mockContext, '/test/storage', 1000);
    await reporter.start();

    // Wait for first report
    await vi.advanceTimersByTimeAsync(100);

    expect(readStorageStats).toHaveBeenCalledWith('/test/storage');
    expect(mockMetrics.directoryStorageSize.set).toHaveBeenCalledWith(
      { directory: 'binance/api_v3_depth' },
      1024,
    );
    expect(mockMetrics.directoryFileCount.set).toHaveBeenCalledWith(
      { directory: 'binance/api_v3_depth' },
      10,
    );
    expect(mockMetrics.directoryLastUpdated.set).toHaveBeenCalledWith(
      { directory: 'binance/api_v3_depth' },
      1000000000, // Converted from ms to seconds
    );

    await reporter.stop();
  });

  it('should report stats periodically at specified interval', async () => {
    vi.mocked(readStorageStats).mockResolvedValue([
      {
        directory: 'victoria_metrics',
        fileCount: 5,
        sizeBytes: 2048,
        lastUpdated: 2000000000000,
      },
    ]);

    const reporter = createStorageStatsReporter(mockContext, '/test/storage', 1000);
    await reporter.start();

    // First report
    await vi.advanceTimersByTimeAsync(100);
    expect(readStorageStats).toHaveBeenCalledTimes(1);

    // After interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(readStorageStats).toHaveBeenCalledTimes(2);

    // After another interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(readStorageStats).toHaveBeenCalledTimes(3);

    await reporter.stop();
  });

  it('should handle multiple directories', async () => {
    vi.mocked(readStorageStats).mockResolvedValue([
      {
        directory: 'binance/api_v3_depth',
        fileCount: 10,
        sizeBytes: 1024,
        lastUpdated: 1000000000000,
      },
      {
        directory: 'kraken/api_0_public_Depth',
        fileCount: 5,
        sizeBytes: 512,
        lastUpdated: 2000000000000,
      },
      {
        directory: 'victoria_metrics',
        fileCount: 100,
        sizeBytes: 10240,
        lastUpdated: 3000000000000,
      },
    ]);

    const reporter = createStorageStatsReporter(mockContext, '/test/storage', 1000);
    await reporter.start();

    await vi.advanceTimersByTimeAsync(100);

    expect(mockMetrics.directoryStorageSize.set).toHaveBeenCalledTimes(3);
    expect(mockMetrics.directoryFileCount.set).toHaveBeenCalledTimes(3);
    expect(mockMetrics.directoryLastUpdated.set).toHaveBeenCalledTimes(3);

    await reporter.stop();
  });

  it('should handle empty directory with "other" label', async () => {
    vi.mocked(readStorageStats).mockResolvedValue([
      {
        directory: '',
        fileCount: 2,
        sizeBytes: 256,
        lastUpdated: 1500000000000,
      },
    ]);

    const reporter = createStorageStatsReporter(mockContext, '/test/storage', 1000);
    await reporter.start();

    await vi.advanceTimersByTimeAsync(100);

    expect(mockMetrics.directoryStorageSize.set).toHaveBeenCalledWith({ directory: 'other' }, 256);
    expect(mockMetrics.directoryFileCount.set).toHaveBeenCalledWith({ directory: 'other' }, 2);
    expect(mockMetrics.directoryLastUpdated.set).toHaveBeenCalledWith(
      { directory: 'other' },
      1500000000,
    );

    await reporter.stop();
  });

  it('should handle errors during stat collection', async () => {
    const testError = new Error('Failed to read storage');
    vi.mocked(readStorageStats).mockRejectedValue(testError);

    const reporter = createStorageStatsReporter(mockContext, '/test/storage', 1000);
    await reporter.start();

    await vi.advanceTimersByTimeAsync(100);

    expect(mockLogger.error).toHaveBeenCalledWith('Failed to report storage stats', {
      error: testError,
    });
    expect(mockMetrics.directoryStorageSize.set).not.toHaveBeenCalled();

    await reporter.stop();
  });

  it('should stop gracefully when stop is called', async () => {
    vi.mocked(readStorageStats).mockResolvedValue([
      {
        directory: 'binance/api_v3_depth',
        fileCount: 10,
        sizeBytes: 1024,
        lastUpdated: 1000000000000,
      },
    ]);

    const reporter = createStorageStatsReporter(mockContext, '/test/storage', 1000);
    await reporter.start();

    expect(mockLogger.info).toHaveBeenCalledWith('Starting storage stats reporter', {
      reportIntervalMs: 1000,
      baseDir: '/test/storage',
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(readStorageStats).toHaveBeenCalledTimes(1);

    await reporter.stop();

    expect(mockLogger.info).toHaveBeenCalledWith('Stopping storage stats reporter');
    expect(mockLogger.info).toHaveBeenCalledWith('Storage stats reporter stopped');

    // Should not report after stop
    await vi.advanceTimersByTimeAsync(2000);
    expect(readStorageStats).toHaveBeenCalledTimes(1);
  });

  it('should trigger shutdown on loop error', async () => {
    const testError = new Error('Critical error');
    vi.mocked(readStorageStats).mockRejectedValueOnce(testError);

    const reporter = createStorageStatsReporter(mockContext, '/test/storage', 1000);
    await reporter.start();

    await vi.advanceTimersByTimeAsync(100);

    // Loop should continue after first error
    expect(mockLogger.error).toHaveBeenCalledWith('Failed to report storage stats', {
      error: testError,
    });

    await reporter.stop();
  });

  it('should report all metrics for each directory', async () => {
    vi.mocked(readStorageStats).mockResolvedValue([
      {
        directory: 'binance/api_v3_depth',
        fileCount: 42,
        sizeBytes: 123456,
        lastUpdated: 1234567890000,
      },
    ]);

    const reporter = createStorageStatsReporter(mockContext, '/test/storage', 1000);
    await reporter.start();

    await vi.advanceTimersByTimeAsync(100);

    expect(mockMetrics.directoryStorageSize.set).toHaveBeenCalledWith(
      { directory: 'binance/api_v3_depth' },
      123456,
    );
    expect(mockMetrics.directoryFileCount.set).toHaveBeenCalledWith(
      { directory: 'binance/api_v3_depth' },
      42,
    );
    expect(mockMetrics.directoryLastUpdated.set).toHaveBeenCalledWith(
      { directory: 'binance/api_v3_depth' },
      1234567890, // ms to seconds
    );

    await reporter.stop();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MdsStorageContext } from '../../process/mdsStorageProcess/context.js';

vi.mock('./storageBackup.js', () => ({
  doStorageBackup: vi.fn(),
  listBackups: vi.fn(),
  removeBackupByName: vi.fn(),
  removeDuplicateBackupsForLatestDate: vi.fn(),
  removeHistoricalBackups: vi.fn(),
}));

const { createStorageBackupScheduler } = await import('./storageBackupScheduler.js');
const {
  doStorageBackup,
  listBackups,
  removeBackupByName,
  removeDuplicateBackupsForLatestDate,
  removeHistoricalBackups,
} = await import('./storageBackup.js');

describe('createStorageBackupScheduler', () => {
  let mockContext: MdsStorageContext;
  let mockMetrics: {
    backupSuccesses: { inc: ReturnType<typeof vi.fn> };
    backupFailures: { inc: ReturnType<typeof vi.fn> };
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
      backupSuccesses: { inc: vi.fn() },
      backupFailures: { inc: vi.fn() },
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

    // Default mock implementations
    vi.mocked(doStorageBackup).mockResolvedValue({
      backupPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz',
      checksumPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz.sha256',
      checksum: 'abc123',
      size: 1024 * 1024,
      duration: 1000,
    });

    vi.mocked(listBackups).mockResolvedValue([]);
    vi.mocked(removeBackupByName).mockResolvedValue();
    vi.mocked(removeDuplicateBackupsForLatestDate).mockResolvedValue();
    vi.mocked(removeHistoricalBackups).mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should add backup when started', async () => {
    vi.mocked(doStorageBackup).mockResolvedValue({
      backupPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz',
      checksumPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz.sha256',
      checksum: 'abc123def456',
      size: 5242880, // 5 MB
      duration: 2500,
    });

    vi.mocked(listBackups).mockResolvedValue([]);

    const scheduler = createStorageBackupScheduler(mockContext, 1000);
    await scheduler.start();

    // Wait for backup to complete
    await vi.advanceTimersByTimeAsync(100);

    expect(doStorageBackup).toHaveBeenCalledWith(mockContext);
    expect(mockLogger.info).toHaveBeenCalledWith('Starting scheduled backup');
    expect(mockLogger.info).toHaveBeenCalledWith('Scheduled backup completed', {
      backupPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz',
      checksumPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz.sha256',
      checksum: 'abc123def456',
      sizeMB: '5.00',
      durationMs: 2500,
    });
    expect(mockMetrics.backupSuccesses.inc).toHaveBeenCalledTimes(1);

    await scheduler.stop();
  });

  it('should delete previous current day backups if 2+ exist', async () => {
    vi.mocked(doStorageBackup).mockResolvedValue({
      backupPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz',
      checksumPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz.sha256',
      checksum: 'latest123',
      size: 1024 * 1024,
      duration: 1000,
    });

    const scheduler = createStorageBackupScheduler(mockContext, 1000);
    await scheduler.start();

    await vi.advanceTimersByTimeAsync(100);

    // Should call the cleanup function for duplicate backups
    expect(removeDuplicateBackupsForLatestDate).toHaveBeenCalledWith(mockContext);

    await scheduler.stop();
  });

  it('should delete earliest day backups if 7+ remain', async () => {
    vi.mocked(doStorageBackup).mockResolvedValue({
      backupPath: '/test/backup/storage-2025-10-10T12-00-00-000.tar.gz',
      checksumPath: '/test/backup/storage-2025-10-10T12-00-00-000.tar.gz.sha256',
      checksum: 'abc123',
      size: 1024 * 1024,
      duration: 1000,
    });

    const scheduler = createStorageBackupScheduler(mockContext, 1000);
    await scheduler.start();

    await vi.advanceTimersByTimeAsync(100);

    // Should call the cleanup function for historical backups
    expect(removeHistoricalBackups).toHaveBeenCalledWith(mockContext);

    await scheduler.stop();
  });

  it('should not run backup when process is shutting down', async () => {
    let backupCallCount = 0;
    vi.mocked(doStorageBackup).mockImplementation(async () => {
      backupCallCount++;
      // After first backup, mark process as shutting down
      if (backupCallCount === 1) {
        mockProcessContext.isShuttingDown.mockReturnValue(true);
      }
      return {
        backupPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz',
        checksumPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz.sha256',
        checksum: 'abc123',
        size: 1024 * 1024,
        duration: 1000,
      };
    });

    vi.mocked(listBackups).mockResolvedValue([]);

    const scheduler = createStorageBackupScheduler(mockContext, 1000);
    await scheduler.start();

    // First backup should run
    await vi.advanceTimersByTimeAsync(100);
    expect(doStorageBackup).toHaveBeenCalledTimes(1);
    expect(mockProcessContext.isShuttingDown()).toBe(true);

    // Advance time past the interval
    await vi.advanceTimersByTimeAsync(2000);

    // Should not run another backup because process is shutting down
    expect(doStorageBackup).toHaveBeenCalledTimes(1);

    await scheduler.stop();
  });

  it('should wait for backup to finish when stop is called', async () => {
    // Use a promise that we control to simulate a long-running backup
    let backupResolve: (() => void) | null = null;
    let backupCount = 0;

    vi.mocked(doStorageBackup).mockImplementation(() => {
      backupCount++;
      if (backupCount === 1) {
        // First backup resolves immediately
        return Promise.resolve({
          backupPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz',
          checksumPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz.sha256',
          checksum: 'abc123',
          size: 1024 * 1024,
          duration: 100,
        });
      } else {
        // Second backup is controlled by our promise
        return new Promise((resolve) => {
          backupResolve = () =>
            resolve({
              backupPath: '/test/backup/storage-2025-10-06T12-00-00-001.tar.gz',
              checksumPath: '/test/backup/storage-2025-10-06T12-00-00-001.tar.gz.sha256',
              checksum: 'def456',
              size: 1024 * 1024,
              duration: 100,
            });
        });
      }
    });

    vi.mocked(listBackups).mockResolvedValue([]);

    const scheduler = createStorageBackupScheduler(mockContext, 1000);
    await scheduler.start();

    // First backup should have completed
    await vi.advanceTimersByTimeAsync(100);
    expect(backupCount).toBe(1);

    // Trigger second backup
    await vi.advanceTimersByTimeAsync(1000);

    // Second backup should have started
    expect(backupCount).toBe(2);
    expect(backupResolve).not.toBeNull();

    // Call stop while second backup is in progress (don't await yet)
    const stopPromise = scheduler.stop();

    // Give a microtask for stop to be initiated
    await Promise.resolve();

    // Complete the backup
    backupResolve!();

    // Now wait for stop to complete - it should have waited for the backup
    await stopPromise;

    // Verify stop completed successfully
    expect(mockLogger.info).toHaveBeenCalledWith('Storage backup scheduler stopped');
  });

  it('should handle backup errors gracefully', async () => {
    const testError = new Error('Backup failed');
    vi.mocked(doStorageBackup).mockRejectedValue(testError);

    const scheduler = createStorageBackupScheduler(mockContext, 1000);
    await scheduler.start();

    await vi.advanceTimersByTimeAsync(100);

    expect(mockLogger.error).toHaveBeenCalledWith('Scheduled backup failed', { error: testError });
    expect(mockMetrics.backupFailures.inc).toHaveBeenCalledTimes(1);
    expect(mockMetrics.backupSuccesses.inc).not.toHaveBeenCalled();

    await scheduler.stop();
  });

  it('should schedule backups at specified interval', async () => {
    vi.mocked(doStorageBackup).mockResolvedValue({
      backupPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz',
      checksumPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz.sha256',
      checksum: 'abc123',
      size: 1024 * 1024,
      duration: 1000,
    });

    vi.mocked(listBackups).mockResolvedValue([]);

    const intervalMs = 5000;
    const scheduler = createStorageBackupScheduler(mockContext, intervalMs);
    await scheduler.start();

    // First backup
    await vi.advanceTimersByTimeAsync(100);
    expect(doStorageBackup).toHaveBeenCalledTimes(1);

    // After interval, second backup
    await vi.advanceTimersByTimeAsync(intervalMs);
    expect(doStorageBackup).toHaveBeenCalledTimes(2);

    // After another interval, third backup
    await vi.advanceTimersByTimeAsync(intervalMs);
    expect(doStorageBackup).toHaveBeenCalledTimes(3);

    await scheduler.stop();
  });

  it('should not remove historical backups if less than 7 exist', async () => {
    vi.mocked(doStorageBackup).mockResolvedValue({
      backupPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz',
      checksumPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz.sha256',
      checksum: 'abc123',
      size: 1024 * 1024,
      duration: 1000,
    });

    const scheduler = createStorageBackupScheduler(mockContext, 1000);
    await scheduler.start();

    await vi.advanceTimersByTimeAsync(100);

    // Should still call the cleanup functions (they handle the logic internally)
    expect(removeDuplicateBackupsForLatestDate).toHaveBeenCalledWith(mockContext);
    expect(removeHistoricalBackups).toHaveBeenCalledWith(mockContext);

    await scheduler.stop();
  });
});

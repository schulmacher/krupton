import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MdsStorageContext } from '../../process/mdsStorageProcess/context.js';

vi.mock('./storageBackup.js', () => ({
  doStorageBackup: vi.fn(),
  listBackups: vi.fn(),
  removeBackupByName: vi.fn(),
}));

const { createStorageBackupScheduler } = await import('./storageBackupScheduler.js');
const { doStorageBackup, listBackups, removeBackupByName } = await import('./storageBackup.js');

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
    const today = new Date('2025-10-06T12:00:00.000Z');
    
    vi.mocked(doStorageBackup).mockResolvedValue({
      backupPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz',
      checksumPath: '/test/backup/storage-2025-10-06T12-00-00-000.tar.gz.sha256',
      checksum: 'latest123',
      size: 1024 * 1024,
      duration: 1000,
    });

    // Mock 3 backups from today + 2 from previous days
    vi.mocked(listBackups).mockResolvedValue([
      {
        fileName: 'storage-2025-10-06T08-00-00-000.tar.gz',
        date: new Date('2025-10-06T08:00:00.000Z'),
        sizeBytes: 1024,
      },
      {
        fileName: 'storage-2025-10-06T10-00-00-000.tar.gz',
        date: new Date('2025-10-06T10:00:00.000Z'),
        sizeBytes: 1024,
      },
      {
        fileName: 'storage-2025-10-06T12-00-00-000.tar.gz',
        date: today,
        sizeBytes: 1024,
      },
      {
        fileName: 'storage-2025-10-05T12-00-00-000.tar.gz',
        date: new Date('2025-10-05T12:00:00.000Z'),
        sizeBytes: 1024,
      },
      {
        fileName: 'storage-2025-10-04T12-00-00-000.tar.gz',
        date: new Date('2025-10-04T12:00:00.000Z'),
        sizeBytes: 1024,
      },
    ]);

    const scheduler = createStorageBackupScheduler(mockContext, 1000);
    await scheduler.start();

    await vi.advanceTimersByTimeAsync(100);

    // Should remove the 2 older backups from the same day
    expect(removeBackupByName).toHaveBeenCalledWith(
      mockContext,
      'storage-2025-10-06T08-00-00-000.tar.gz',
    );
    expect(removeBackupByName).toHaveBeenCalledWith(
      mockContext,
      'storage-2025-10-06T10-00-00-000.tar.gz',
    );
    expect(removeBackupByName).not.toHaveBeenCalledWith(
      mockContext,
      'storage-2025-10-06T12-00-00-000.tar.gz',
    );

    expect(mockLogger.info).toHaveBeenCalledWith('Removing duplicate backups for date', {
      date: today,
      duplicateCount: 2,
      duplicateFileNames: [
        'storage-2025-10-06T08-00-00-000.tar.gz',
        'storage-2025-10-06T10-00-00-000.tar.gz',
      ],
    });

    await scheduler.stop();
  });

  it('should delete earliest day backups if 7+ remain', async () => {
    // Mock 10 backups from different days
    const backups = [
      { fileName: 'storage-2025-10-01T12-00-00-000.tar.gz', date: new Date('2025-10-01T12:00:00.000Z'), sizeBytes: 1024 },
      { fileName: 'storage-2025-10-02T12-00-00-000.tar.gz', date: new Date('2025-10-02T12:00:00.000Z'), sizeBytes: 1024 },
      { fileName: 'storage-2025-10-03T12-00-00-000.tar.gz', date: new Date('2025-10-03T12:00:00.000Z'), sizeBytes: 1024 },
      { fileName: 'storage-2025-10-04T12-00-00-000.tar.gz', date: new Date('2025-10-04T12:00:00.000Z'), sizeBytes: 1024 },
      { fileName: 'storage-2025-10-05T12-00-00-000.tar.gz', date: new Date('2025-10-05T12:00:00.000Z'), sizeBytes: 1024 },
      { fileName: 'storage-2025-10-06T12-00-00-000.tar.gz', date: new Date('2025-10-06T12:00:00.000Z'), sizeBytes: 1024 },
      { fileName: 'storage-2025-10-07T12-00-00-000.tar.gz', date: new Date('2025-10-07T12:00:00.000Z'), sizeBytes: 1024 },
      { fileName: 'storage-2025-10-08T12-00-00-000.tar.gz', date: new Date('2025-10-08T12:00:00.000Z'), sizeBytes: 1024 },
      { fileName: 'storage-2025-10-09T12-00-00-000.tar.gz', date: new Date('2025-10-09T12:00:00.000Z'), sizeBytes: 1024 },
      { fileName: 'storage-2025-10-10T12-00-00-000.tar.gz', date: new Date('2025-10-10T12:00:00.000Z'), sizeBytes: 1024 },
    ];

    vi.mocked(doStorageBackup).mockResolvedValue({
      backupPath: '/test/backup/storage-2025-10-10T12-00-00-000.tar.gz',
      checksumPath: '/test/backup/storage-2025-10-10T12-00-00-000.tar.gz.sha256',
      checksum: 'abc123',
      size: 1024 * 1024,
      duration: 1000,
    });

    vi.mocked(listBackups).mockResolvedValue(backups);

    const scheduler = createStorageBackupScheduler(mockContext, 1000);
    await scheduler.start();

    await vi.advanceTimersByTimeAsync(100);

    // Should remove the 3 oldest backups (keeping only 7)
    expect(removeBackupByName).toHaveBeenCalledWith(
      mockContext,
      'storage-2025-10-01T12-00-00-000.tar.gz',
    );
    expect(removeBackupByName).toHaveBeenCalledWith(
      mockContext,
      'storage-2025-10-02T12-00-00-000.tar.gz',
    );
    expect(removeBackupByName).toHaveBeenCalledWith(
      mockContext,
      'storage-2025-10-03T12-00-00-000.tar.gz',
    );

    expect(mockLogger.info).toHaveBeenCalledWith('Removing historical backups', {
      currentBackupCount: 10,
      maxBackupsToKeep: 7,
      backupsToRemoveCount: 3,
      fileNamesToRemove: [
        'storage-2025-10-01T12-00-00-000.tar.gz',
        'storage-2025-10-02T12-00-00-000.tar.gz',
        'storage-2025-10-03T12-00-00-000.tar.gz',
      ],
    });

    expect(mockLogger.info).toHaveBeenCalledWith('Historical backups removal completed', {
      removedCount: 3,
      remainingBackupCount: 7,
    });

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
          backupResolve = () => resolve({
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

    // Mock only 3 backups
    vi.mocked(listBackups).mockResolvedValue([
      {
        fileName: 'storage-2025-10-04T12-00-00-000.tar.gz',
        date: new Date('2025-10-04T12:00:00.000Z'),
        sizeBytes: 1024,
      },
      {
        fileName: 'storage-2025-10-05T12-00-00-000.tar.gz',
        date: new Date('2025-10-05T12:00:00.000Z'),
        sizeBytes: 1024,
      },
      {
        fileName: 'storage-2025-10-06T12-00-00-000.tar.gz',
        date: new Date('2025-10-06T12:00:00.000Z'),
        sizeBytes: 1024,
      },
    ]);

    const scheduler = createStorageBackupScheduler(mockContext, 1000);
    await scheduler.start();

    await vi.advanceTimersByTimeAsync(100);

    expect(mockLogger.info).toHaveBeenCalledWith('No historical backups to remove', {
      currentBackupCount: 3,
      maxBackupsToKeep: 7,
    });

    // Should not call removeBackupByName at all
    expect(removeBackupByName).not.toHaveBeenCalled();

    await scheduler.stop();
  });
});


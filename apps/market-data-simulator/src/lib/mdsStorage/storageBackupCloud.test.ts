import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMdsStorageContext } from '../../process/mdsStorageProcess/context.js';
import {
    listMockCloudFiles,
    resetMockCloudStorage,
    setMockCloudFile,
} from '../__mocks__/rclone.js';
import { syncLocalAndCloudBackups } from './storageBackupCloud.js';

vi.mock('../rclone.js');

describe('storageBackupCloud', () => {
  let testBackupDir: string;
  let testCloudTempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Create temporary directories
    testBackupDir = path.join(os.tmpdir(), `backup-test-${Date.now()}`);
    testCloudTempDir = path.join(os.tmpdir(), `cloud-temp-test-${Date.now()}`);

    await fs.mkdir(testBackupDir, { recursive: true });
    await fs.mkdir(testCloudTempDir, { recursive: true });

    // Store original environment
    originalEnv = { ...process.env };

    // Set test environment variables
    process.env.BACKUP_BASE_DIR = testBackupDir;
    process.env.CLOUD_BACKUP_TEMP_DIR = testCloudTempDir;
    process.env.CLOUD_SYNC_ENABLED = 'true';
    process.env.RCLONE_REMOTE_NAME = 'gdrive';
    process.env.RCLONE_REMOTE_PATH = 'backups';
    process.env.BACKUP_RETENTION_DAYS = '7';

    // Reset mock cloud storage
    resetMockCloudStorage();
  });

  afterEach(async () => {
    // Restore original environment
    process.env = originalEnv;

    // Clean up temporary directories
    try {
      await fs.rm(testBackupDir, { recursive: true, force: true });
      await fs.rm(testCloudTempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should sync local and cloud backups correctly', async () => {
    // Mock current date as 2025-10-07T22:00:00.000Z
    const mockDate = new Date('2025-10-07T22:00:00.000Z');
    vi.setSystemTime(mockDate);

    // Helper function to create backup file names
    function createBackupFileName(dateStr: string): string {
      return `storage-${dateStr.replace(/[:.]/g, '-')}.tar.gz`;
    }

    // Setup initial state
    const localFiles = [
      '2025-10-02T11-00-00-000', // removed because older
      '2025-10-03T12-00-00-000',
      '2025-10-04T12-00-00-000',
      '2025-10-05T12-00-00-000',
      '2025-10-06T12-00-00-000',
      '2025-10-07T22-00-00-000', // uploaded
    ];

    const cloudFiles = [
      '2025-09-30T12-00-00-000', // removed
      '2025-10-01T12-00-00-000',
      '2025-10-02T22-00-00-000', // downloaded
      '2025-10-03T12-00-00-000',
      '2025-10-04T12-00-00-000',
      '2025-10-05T12-00-00-000',
      '2025-10-06T12-00-00-000',
      '2025-10-07T11-00-00-000', // removed
    ];

    // Create initial local backup files
    for (const timestamp of localFiles) {
      const fileName = createBackupFileName(timestamp);
      const checksumFileName = `${fileName}.sha256`;
      const backupPath = path.join(testBackupDir, fileName);
      const checksumPath = path.join(testBackupDir, checksumFileName);

      await fs.writeFile(backupPath, `Mock backup content for ${timestamp}`);
      await fs.writeFile(checksumPath, `abc123def456  ${fileName}\n`);
    }

    // Create initial cloud backup files
    for (const timestamp of cloudFiles) {
      const fileName = createBackupFileName(timestamp);
      const checksumFileName = `${fileName}.sha256`;

      setMockCloudFile(
        'gdrive',
        'backups',
        fileName,
        Buffer.from(`Mock cloud backup content for ${timestamp}`),
      );
      setMockCloudFile(
        'gdrive',
        'backups',
        checksumFileName,
        Buffer.from(`abc123def456  ${fileName}\n`),
      );
    }

    // Verify initial state
    const initialLocalFiles = await fs.readdir(testBackupDir);
    const initialCloudFiles = listMockCloudFiles('gdrive', 'backups');

    expect(initialLocalFiles.length).toBeGreaterThan(0);
    expect(initialCloudFiles.length).toBeGreaterThan(0);

    // Run sync
    const context = createMdsStorageContext();
    const result = await syncLocalAndCloudBackups(context);

    // Verify sync result
    expect(result.errors).toEqual([]);

    // Check final files
    const finalLocalFiles = await fs.readdir(testBackupDir);
    const finalCloudFiles = listMockCloudFiles('gdrive', 'backups');

    expect(finalCloudFiles).toEqual([
      'storage-2025-10-02T22-00-00-000.tar.gz',
      'storage-2025-10-02T22-00-00-000.tar.gz.sha256',
      'storage-2025-10-03T12-00-00-000.tar.gz',
      'storage-2025-10-03T12-00-00-000.tar.gz.sha256',
      'storage-2025-10-04T12-00-00-000.tar.gz',
      'storage-2025-10-04T12-00-00-000.tar.gz.sha256',
      'storage-2025-10-05T12-00-00-000.tar.gz',
      'storage-2025-10-05T12-00-00-000.tar.gz.sha256',
      'storage-2025-10-06T12-00-00-000.tar.gz',
      'storage-2025-10-06T12-00-00-000.tar.gz.sha256',
      'storage-2025-10-07T11-00-00-000.tar.gz',
      'storage-2025-10-07T11-00-00-000.tar.gz.sha256',
      'storage-2025-10-07T22-00-00-000.tar.gz',
      'storage-2025-10-07T22-00-00-000.tar.gz.sha256',
    ]);
    expect(finalLocalFiles).toEqual([
      'storage-2025-10-02T11-00-00-000.tar.gz', // kept until next time backup runs and it will be wiped
      'storage-2025-10-02T11-00-00-000.tar.gz.sha256', // kept until next time backup runs and it will be wiped
      'storage-2025-10-02T22-00-00-000.tar.gz',
      'storage-2025-10-02T22-00-00-000.tar.gz.sha256',
      'storage-2025-10-03T12-00-00-000.tar.gz',
      'storage-2025-10-03T12-00-00-000.tar.gz.sha256',
      'storage-2025-10-04T12-00-00-000.tar.gz',
      'storage-2025-10-04T12-00-00-000.tar.gz.sha256',
      'storage-2025-10-05T12-00-00-000.tar.gz',
      'storage-2025-10-05T12-00-00-000.tar.gz.sha256',
      'storage-2025-10-06T12-00-00-000.tar.gz',
      'storage-2025-10-06T12-00-00-000.tar.gz.sha256',
      'storage-2025-10-07T11-00-00-000.tar.gz',
      'storage-2025-10-07T11-00-00-000.tar.gz.sha256',
      'storage-2025-10-07T22-00-00-000.tar.gz',
      'storage-2025-10-07T22-00-00-000.tar.gz.sha256',
    ]);

    vi.useRealTimers();
  });
});

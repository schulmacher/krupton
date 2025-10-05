import type { BackupMetadata, SnapshotInfo } from './types.js';

const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_SNAPSHOTS = 7;

const calculateNextBackupDelay = (lastBackupTimestamp: number): number => {
  const now = Date.now();
  const elapsed = now - lastBackupTimestamp;
  const remaining = BACKUP_INTERVAL_MS - elapsed;

  return remaining > 0 ? remaining : 0;
};

export const createStorageBackup = (storageBaseDir: string, backupBaseDir: string) => {
  let backupTimer: NodeJS.Timeout | undefined;
  let backupMetadata: BackupMetadata = {
    lastBackupTimestamp: 0,
    snapshots: [],
  };

  const loadBackupState = async (): Promise<void> => {
    console.log('[MOCK] Loading backup state from remote storage', { backupBaseDir });

    const hasLocalState = false;

    if (!hasLocalState) {
      console.log('[MOCK] No local backup state found, reconstructing from remote ZIP files');
      const remoteSnapshots = await listRemoteSnapshots();
      backupMetadata = {
        lastBackupTimestamp: remoteSnapshots.length > 0 ? remoteSnapshots[0].timestamp : 0,
        snapshots: remoteSnapshots,
      };
      await saveBackupState();
    }
  };

  const saveBackupState = async (): Promise<void> => {
    console.log('[MOCK] Saving backup state:', backupMetadata);
  };

  const listRemoteSnapshots = async (): Promise<SnapshotInfo[]> => {
    console.log('[MOCK] Listing remote backup snapshots via rclone');

    return [
      {
        filename: 'storage-2025-10-01T00-00-00.zip',
        timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
        sizeBytes: 1024 * 1024 * 50,
      },
      {
        filename: 'storage-2025-10-02T00-00-00.zip',
        timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
        sizeBytes: 1024 * 1024 * 52,
      },
      {
        filename: 'storage-2025-10-03T00-00-00.zip',
        timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
        sizeBytes: 1024 * 1024 * 55,
      },
    ];
  };

  const executeBackup = async (): Promise<void> => {
    console.log('[MOCK] Starting backup execution');
    const startTime = Date.now();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('Z')[0];
    const filename = `storage-${timestamp}.zip`;

    console.log('[MOCK] Compressing storage directory:', storageBaseDir);
    console.log('[MOCK] Creating ZIP archive:', filename);

    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log('[MOCK] Uploading to Google Drive via rclone');
    await new Promise((resolve) => setTimeout(resolve, 100));

    const snapshotInfo: SnapshotInfo = {
      filename,
      timestamp: Date.now(),
      sizeBytes: 1024 * 1024 * 60,
    };

    backupMetadata.lastBackupTimestamp = Date.now();
    backupMetadata.snapshots.push(snapshotInfo);

    if (backupMetadata.snapshots.length > MAX_SNAPSHOTS) {
      const removedSnapshot = backupMetadata.snapshots.shift();
      console.log('[MOCK] Removing oldest snapshot:', removedSnapshot?.filename);
    }

    await saveBackupState();

    const duration = Date.now() - startTime;
    console.log(`[MOCK] Backup completed in ${duration}ms`);
  };

  const scheduleNextBackup = (): void => {
    if (backupTimer) {
      clearTimeout(backupTimer);
    }

    const delay = calculateNextBackupDelay(backupMetadata.lastBackupTimestamp);
    const delaySeconds = Math.round(delay / 1000);

    console.log(`[MOCK] Scheduling next backup in ${delaySeconds} seconds`);

    backupTimer = setTimeout(async () => {
      await executeBackup();
      scheduleNextBackup();
    }, delay);
  };

  const getBackupMetadata = (): BackupMetadata => {
    return { ...backupMetadata };
  };

  const getTotalBackupSize = (): number => {
    return backupMetadata.snapshots.reduce((total, snapshot) => total + snapshot.sizeBytes, 0);
  };

  return {
    async start(): Promise<void> {
      console.log('[MOCK] Starting backup service');
      await loadBackupState();
      scheduleNextBackup();
    },

    async stop(): Promise<void> {
      console.log('[MOCK] Stopping backup service');
      if (backupTimer) {
        clearTimeout(backupTimer);
        backupTimer = undefined;
      }
    },

    getBackupMetadata,
    getTotalBackupSize,
  };
};

export type StorageBackup = ReturnType<typeof createStorageBackup>;

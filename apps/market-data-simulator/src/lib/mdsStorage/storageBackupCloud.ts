import { promises as fs } from 'fs';
import * as path from 'path';
import { MdsStorageContext } from '../../process/mdsStorageProcess/context.js';
import { ensureDir } from '../fs.js';
import {
    deleteFileFromRemote,
    downloadFileFromRemote,
    ensureRcloneInstalled,
    listRemoteFiles,
    uploadFilesToRemote,
} from '../rclone.js';
import { isBackupRelatedFile, listBackups, removeHistoricalBackups } from './storageBackup.js';

interface LocalBackupFile {
  fileName: string;
  sizeBytes: number;
  existsInCloud: boolean;
}

interface CloudBackupFile {
  fileName: string;
  sizeBytes: number;
  existsLocally: boolean;
}

interface SyncResult {
  pushed: string[];
  pulled: string[];
  deleted: string[];
  errors: Array<{ operation: string; file: string; error: string }>;
}

async function listBackupRelatedCloudFiles(
  remoteName: string,
  remotePath: string,
): Promise<Array<{ name: string; size: number }>> {
  const cloudFiles = await listRemoteFiles(remoteName, remotePath);
  return cloudFiles.filter((file) => isBackupRelatedFile(file.name));
}

async function copyFileToTemp(sourcePath: string, tempDir: string, fileName: string) {
  const destPath = path.join(tempDir, fileName);
  await fs.copyFile(sourcePath, destPath);
  return destPath;
}

async function listLocalTempFiles(tempDir: string): Promise<Array<{ name: string; size: number }>> {
  try {
    const files = await fs.readdir(tempDir);
    const fileStats = await Promise.all(
      files
        .filter((f) => isBackupRelatedFile(f))
        .map(async (fileName) => {
          const filePath = path.join(tempDir, fileName);
          const stats = await fs.stat(filePath);
          return { name: fileName, size: stats.size };
        }),
    );
    return fileStats;
  } catch {
    return [];
  }
}

// Step 1: Push files to cloud
async function pushFilesToCloud(context: MdsStorageContext): Promise<string[]> {
  const { diagnosticContext, envContext } = context;
  const backupBaseDir = envContext.config.BACKUP_BASE_DIR;
  const tempDir = envContext.config.CLOUD_BACKUP_TEMP_DIR;
  const remoteName = envContext.config.RCLONE_REMOTE_NAME;
  const remotePath = envContext.config.RCLONE_REMOTE_PATH;

  diagnosticContext.logger.info('Step 1: Pushing files to cloud');

  // Ensure temp directory exists
  await ensureDir(tempDir);

  // Get all local backups from the backup directory
  const localBackups = await listBackups(context);

  diagnosticContext.logger.info(`Found local backup(s)`, {
    localBackupsLength: localBackups.length,
    localBackups,
  });

  // Copy all backups and their checksum files to temp directory
  const copiedFiles: string[] = [];
  for (const backup of localBackups) {
    // Copy .tar.gz file
    const sourcePath = path.join(backupBaseDir, backup.fileName);
    await copyFileToTemp(sourcePath, tempDir, backup.fileName);
    copiedFiles.push(backup.fileName);
    diagnosticContext.logger.debug(`Copied ${backup.fileName} to temp directory`);

    // Copy .sha256 file if it exists
    const checksumFileName = `${backup.fileName}.sha256`;
    const checksumSourcePath = path.join(backupBaseDir, checksumFileName);
    try {
      await fs.access(checksumSourcePath);
      await copyFileToTemp(checksumSourcePath, tempDir, checksumFileName);
      copiedFiles.push(checksumFileName);
      diagnosticContext.logger.debug(`Copied ${checksumFileName} to temp directory`);
    } catch {
      diagnosticContext.logger.debug(`No checksum file found for ${backup.fileName}`);
    }
  }

  // List files in temp directory
  const localTempFiles = await listLocalTempFiles(tempDir);
  diagnosticContext.logger.info(`Temp directory file(s)`, {
    localTempFilesLength: localTempFiles.length,
    localTempFiles,
  });

  // List cloud files
  const cloudFiles = await listBackupRelatedCloudFiles(remoteName, remotePath);
  const cloudFileNames = new Set(cloudFiles.map((f) => f.name));
  diagnosticContext.logger.info(`Cloud contains file(s)`, {
    cloudFilesLength: cloudFiles.length,
    cloudFiles,
  });

  // Flag local backups with existsInCloud
  const localBackupsWithFlag: LocalBackupFile[] = localTempFiles.map((file) => ({
    fileName: file.name,
    existsInCloud: cloudFileNames.has(file.name),
    sizeBytes: file.size,
  }));

  // Push files that don't exist in cloud
  const filesToPush = localBackupsWithFlag.filter((file) => !file.existsInCloud);
  diagnosticContext.logger.info(`Uploading new file(s) to cloud`, {
    filesToPushLength: filesToPush.length,
    filesToPush,
  });

  const pushedFiles: string[] = [];
  for (const file of filesToPush) {
    const localPath = path.join(tempDir, file.fileName);
    diagnosticContext.logger.info(`Uploading ${file.fileName}...`);
    await uploadFilesToRemote(localPath, remoteName, remotePath);
    pushedFiles.push(file.fileName);
    diagnosticContext.logger.info(`✓ Uploaded ${file.fileName}`);
  }

  return pushedFiles;
}

// Step 2: Pull files from cloud
async function pullFilesFromCloud(context: MdsStorageContext): Promise<string[]> {
  const { diagnosticContext, envContext } = context;
  const tempDir = envContext.config.CLOUD_BACKUP_TEMP_DIR;
  const remoteName = envContext.config.RCLONE_REMOTE_NAME;
  const remotePath = envContext.config.RCLONE_REMOTE_PATH;

  diagnosticContext.logger.info('Step 2: Pulling files from cloud');

  // List local temp files
  const localTempFiles = await listLocalTempFiles(tempDir);
  const localFileNames = new Set(localTempFiles.map((f) => f.name));
  diagnosticContext.logger.info(`Local temp directory contains file(s)`, {
    localTempFilesLength: localTempFiles.length,
    localTempFiles,
  });

  // List cloud files
  const cloudFiles = await listBackupRelatedCloudFiles(remoteName, remotePath);
  diagnosticContext.logger.info(`Cloud contains file(s)`, {
    cloudFilesLength: cloudFiles.length,
    cloudFiles,
  });

  // Flag cloud backups with existsLocally
  const cloudBackupsWithFlag: CloudBackupFile[] = cloudFiles.map((file) => ({
    fileName: file.name,
    existsLocally: localFileNames.has(file.name),
    sizeBytes: file.size,
  }));

  // Pull files that don't exist locally
  const filesToPull = cloudBackupsWithFlag.filter((file) => !file.existsLocally);
  diagnosticContext.logger.info(`Downloading new file(s) from cloud`, {
    filesToPullLength: filesToPull.length,
    filesToPull,
  });

  const pulledFiles: string[] = [];
  for (const file of filesToPull) {
    diagnosticContext.logger.info(`Downloading ${file.fileName}...`);
    await downloadFileFromRemote(remoteName, remotePath, file.fileName, tempDir);
    pulledFiles.push(file.fileName);
    diagnosticContext.logger.info(`✓ Downloaded ${file.fileName}`);
  }

  return pulledFiles;
}

async function copyTempFilesToBackupBaseDir(context: MdsStorageContext): Promise<void> {
  const { diagnosticContext, envContext } = context;

  const tempDir = envContext.config.CLOUD_BACKUP_TEMP_DIR;
  const backupBaseDir = envContext.config.BACKUP_BASE_DIR;
  await fs.cp(tempDir, backupBaseDir, { recursive: true });
  diagnosticContext.logger.info('Copied temp files to backup base directory');
}

// Step 3: Reconcile - remove files from cloud that are too old
async function reconcileCloudBackups(context: MdsStorageContext): Promise<string[]> {
  const { diagnosticContext, envContext } = context;
  const tempDir = envContext.config.CLOUD_BACKUP_TEMP_DIR;
  const remoteName = envContext.config.RCLONE_REMOTE_NAME;
  const remotePath = envContext.config.RCLONE_REMOTE_PATH;

  diagnosticContext.logger.info('Step 3: Reconciling cloud backups');

  diagnosticContext.logger.info('Removing historical backups from local temp directory');
  await removeHistoricalBackups(context, tempDir);

  // List local temp files
  const localTempFiles = await listLocalTempFiles(tempDir);
  const localFileNames = new Set(localTempFiles.map((f) => f.name));
  diagnosticContext.logger.info(`Local temp directory contains ${localTempFiles.length} file(s)`);

  const cloudFiles = await listBackupRelatedCloudFiles(remoteName, remotePath);
  diagnosticContext.logger.info(`Cloud contains ${cloudFiles.length} file(s)`);

  // Find files in cloud that don't exist locally
  const filesToDelete = cloudFiles.filter((file) => !localFileNames.has(file.name));
  diagnosticContext.logger.info(`Removing ${filesToDelete.length} orphaned file(s) from cloud`);

  const deletedFiles: string[] = [];
  for (const file of filesToDelete) {
    diagnosticContext.logger.info(`Deleting ${file.name} from cloud...`);
    await deleteFileFromRemote(remoteName, remotePath, file.name);
    deletedFiles.push(file.name);
    diagnosticContext.logger.info(`✓ Deleted ${file.name} from cloud`);
  }

  return deletedFiles;
}

export async function syncLocalAndCloudBackups(context: MdsStorageContext): Promise<SyncResult> {
  const { diagnosticContext, envContext } = context;
  const startTime = Date.now();

  const result: SyncResult = {
    pushed: [],
    pulled: [],
    deleted: [],
    errors: [],
  };

  try {
    diagnosticContext.logger.info('Starting cloud backup synchronization');

    // Check if cloud sync is enabled
    if (!envContext.config.CLOUD_SYNC_ENABLED) {
      diagnosticContext.logger.warn(
        'Cloud sync is disabled. Set CLOUD_SYNC_ENABLED=true to enable',
      );
      return result;
    }

    // Ensure rclone is installed
    await ensureRcloneInstalled();
    diagnosticContext.logger.info('✓ rclone is installed');

    // Step 1: Push files to cloud
    try {
      result.pushed = await pushFilesToCloud(context);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      diagnosticContext.logger.error('Error in push step', { error: errorMsg });
      result.errors.push({ operation: 'push', file: 'multiple', error: errorMsg });
    }

    // Step 2: Pull files from cloud
    try {
      result.pulled = await pullFilesFromCloud(context);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      diagnosticContext.logger.error('Error in pull step', { error: errorMsg });
      result.errors.push({ operation: 'pull', file: 'multiple', error: errorMsg });
    }

    // Step 3: Reconcile
    try {
      if (!result.errors.length) {
        result.deleted = await reconcileCloudBackups(context);
      } else {
        diagnosticContext.logger.warn('Skipping reconciliation step due to errors');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      diagnosticContext.logger.error('Error in reconciliation step', { error: errorMsg });
      result.errors.push({ operation: 'reconcile', file: 'multiple', error: errorMsg });
    }

    // Step 4: Copy temp files to backup base directory for final sync
    try {
      await copyTempFilesToBackupBaseDir(context);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      diagnosticContext.logger.error('Error in copy temp files step', { error: errorMsg });
      result.errors.push({ operation: 'copy temp files', file: 'multiple', error: errorMsg });
    }

    // TODO remove tmp dir

    const duration = Date.now() - startTime;
    diagnosticContext.logger.info('Cloud backup synchronization completed', {
      duration,
      pushed: result.pushed.length,
      pulled: result.pulled.length,
      deleted: result.deleted.length,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    diagnosticContext.logger.error('Cloud backup synchronization failed', {
      error,
      duration,
    });
    throw error;
  }
}

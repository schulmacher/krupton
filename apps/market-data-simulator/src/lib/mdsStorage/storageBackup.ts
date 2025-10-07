import { exec } from 'child_process';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import {
  createMdsStorageContext,
  MdsStorageContext,
} from '../../process/mdsStorageProcess/context.js';
import { ensureDir, ensureDirForFile } from '../fs.js';

const execAsync = promisify(exec);

function createBackupFilename() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('Z')[0];
  return `storage-${timestamp}.tar.gz`;
}

function isBackupFile(fileName: string) {
  return fileName.startsWith('storage-') && fileName.endsWith('.tar.gz');
}

function isBackupChecksumFile(fileName: string) {
  return fileName.startsWith('storage-') && fileName.endsWith('.tar.gz.sha256');
}

export function isBackupRelatedFile(fileName: string) {
  return isBackupFile(fileName) || isBackupChecksumFile(fileName);
}

async function createTarGzArchive(sourceDir: string, outputPath: string) {
  const command = `tar -czf "${outputPath}" -C "${path.dirname(sourceDir)}" "${path.basename(sourceDir)}"`;
  await execAsync(command);
}

async function generateChecksumFile(filePath: string, checksumPath: string) {
  const fileBuffer = await fs.readFile(filePath);
  const hash = createHash('sha256');
  hash.update(fileBuffer);
  const checksum = hash.digest('hex');

  await fs.writeFile(checksumPath, `${checksum}  ${path.basename(filePath)}\n`);
  return checksum;
}

export async function doStorageBackup(context: MdsStorageContext) {
  const { diagnosticContext } = context;
  const storageBaseDir = context.envContext.config.STORAGE_BASE_DIR;
  const backupBaseDir = context.envContext.config.BACKUP_BASE_DIR;
  const startTime = Date.now();

  diagnosticContext.logger.info('Starting storage backup');

  const filename = createBackupFilename();
  const backupPath = path.join(backupBaseDir, filename);
  const checksumPath = path.join(backupBaseDir, `${filename}.sha256`);

  try {
    // Ensure backup directory exists
    await ensureDirForFile(backupPath);

    diagnosticContext.logger.info(`Compressing storage directory: ${storageBaseDir}`);
    diagnosticContext.logger.info(`Creating tar.gz archive: ${backupPath}`);

    // Create tar.gz archive
    await createTarGzArchive(storageBaseDir, backupPath);

    // Get archive size
    const stats = await fs.stat(backupPath);
    const archiveSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    diagnosticContext.logger.info(`Archive created: ${archiveSizeMB} MB`);

    // Generate and save checksum
    diagnosticContext.logger.info('Generating checksum file');
    const checksum = await generateChecksumFile(backupPath, checksumPath);

    diagnosticContext.logger.info(`Checksum: ${checksum}`);
    diagnosticContext.logger.info(`Checksum file saved: ${checksumPath}`);

    const duration = Date.now() - startTime;
    diagnosticContext.logger.info(`Backup completed in ${duration}ms`);

    return {
      backupPath,
      checksumPath,
      checksum,
      size: stats.size,
      duration,
    };
  } catch (error) {
    diagnosticContext.logger.error('Backup failed', { error });
    throw error;
  }
}

export async function listBackups(
  context: MdsStorageContext,
  basePath = context.envContext.config.BACKUP_BASE_DIR,
) {
  try {
    await ensureDir(basePath);
    const files = await fs.readdir(basePath);

    const backupFilesWithStats = await Promise.all(
      files.filter(isBackupFile).map(async (fileName) => {
        const timestampMatch = fileName.match(
          /storage-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})/,
        );

        let date: Date | null = null;
        if (timestampMatch) {
          // Convert filename format back to ISO format: YYYY-MM-DDTHH-MM-SS-mmm -> YYYY-MM-DDTHH:MM:SS.mmm
          const isoString = timestampMatch[1].replace(
            /T(\d{2})-(\d{2})-(\d{2})-(\d{3})/,
            'T$1:$2:$3.$4',
          );
          date = new Date(isoString + 'Z');
        }

        const filePath = path.join(basePath, fileName);
        const stats = await fs.stat(filePath);

        return {
          fileName,
          date,
          sizeBytes: stats.size,
        };
      }),
    );

    return backupFilesWithStats.filter(
      (backup): backup is { fileName: string; date: Date; sizeBytes: number } =>
        backup.date !== null,
    );
  } catch {
    return [];
  }
}

export async function removeBackupByName(
  context: MdsStorageContext,
  fileName: string,
  basePath = context.envContext.config.BACKUP_BASE_DIR,
) {
  const { diagnosticContext } = context;
  const backupPath = path.join(basePath, fileName);
  const checksumPath = path.join(basePath, `${fileName}.sha256`);

  try {
    diagnosticContext.logger.info('Removing backup files', { fileName });

    await fs.unlink(backupPath).then(() => {
      diagnosticContext.logger.info('Deleted backup file', { path: backupPath });
    });

    await fs
      .unlink(checksumPath)
      .then(() => {
        diagnosticContext.logger.info('Deleted checksum file', { path: checksumPath });
      })
      .catch(() => {
        diagnosticContext.logger.warn('Checksum file not found', { path: checksumPath });
      });
  } catch (error) {
    diagnosticContext.logger.error('Failed to remove backup', { fileName, error });
    throw error;
  }
}

export async function removeHistoricalBackups(
  context: MdsStorageContext,
  basePath = context.envContext.config.BACKUP_BASE_DIR,
): Promise<void> {
  const { diagnosticContext } = context;

  try {
    const allBackups = await listBackups(context, basePath);

    const maxBackupsToKeep = 7;
    const backupsToRemove = allBackups.length - maxBackupsToKeep;

    if (backupsToRemove <= 0) {
      diagnosticContext.logger.info('No historical backups to remove', {
        currentBackupCount: allBackups.length,
        maxBackupsToKeep,
      });
      return;
    }

    const sortedBackups = allBackups.sort((a, b) => a.date.getTime() - b.date.getTime());
    const backupsToDelete = sortedBackups.slice(0, backupsToRemove);

    diagnosticContext.logger.info('Removing historical backups', {
      currentBackupCount: allBackups.length,
      maxBackupsToKeep,
      backupsToRemoveCount: backupsToRemove,
      fileNamesToRemove: backupsToDelete.map((b) => b.fileName),
    });

    for (const backup of backupsToDelete) {
      await removeBackupByName(context, backup.fileName, basePath);
    }

    diagnosticContext.logger.info('Historical backups removal completed', {
      removedCount: backupsToRemove,
      remainingBackupCount: allBackups.length - backupsToRemove,
    });
  } catch (error) {
    diagnosticContext.logger.error('Failed to remove historical backups', { error });
  }
}

export async function removeDuplicateBackupsForLatestDate(
  context: MdsStorageContext,
): Promise<void> {
  const { diagnosticContext } = context;

  try {
    const allBackups = await listBackups(context);
    const latestBackup = [...allBackups].sort((a, b) => b.date.getTime() - a.date.getTime())[0];

    if (!latestBackup) {
      diagnosticContext.logger.warn('Could not extract latest backup', {
        latestBackup,
      });
      return;
    }

    const latestDate = latestBackup.date;

    const duplicatesForDate = allBackups.filter(
      (backup) =>
        backup.date.toISOString().slice(0, 10) === latestDate.toISOString().slice(0, 10) &&
        backup.fileName !== latestBackup.fileName,
    );

    if (duplicatesForDate.length === 0) {
      diagnosticContext.logger.info('No duplicate backups found for date', { date: latestDate });
      return;
    }

    diagnosticContext.logger.info('Removing duplicate backups for date', {
      date: latestDate,
      duplicateCount: duplicatesForDate.length,
      duplicateFileNames: duplicatesForDate.map((b) => b.fileName),
    });

    for (const duplicate of duplicatesForDate) {
      await removeBackupByName(context, duplicate.fileName);
    }

    diagnosticContext.logger.info('Duplicate backups removal completed', {
      date: latestDate,
      removedCount: duplicatesForDate.length,
    });
  } catch (error) {
    diagnosticContext.logger.error('Failed to remove duplicate backups', { error });
  }
}

async function main() {
  const context = createMdsStorageContext();
  const { diagnosticContext, envContext, processContext } = context;

  try {
    diagnosticContext.logger.info('Starting backup script');
    diagnosticContext.logger.info(`Storage directory: ${envContext.config.STORAGE_BASE_DIR}`);

    const result = await doStorageBackup(context);

    diagnosticContext.logger.info('Backup completed successfully', {
      backupPath: result.backupPath,
      checksumPath: result.checksumPath,
      checksum: result.checksum,
      sizeMB: (result.size / (1024 * 1024)).toFixed(2),
      durationMs: result.duration,
    });

    diagnosticContext.logger.info('Backups list', {
      backups: await listBackups(context),
    });

    await processContext.shutdown();
    process.exit(0);
  } catch (error) {
    diagnosticContext.logger.error('Backup script failed', { error });
    await processContext.shutdown();
    process.exit(1);
  }
}

// Run main if this file is executed directly
const currentFileUrl = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === currentFileUrl;

if (isMainModule) {
  main();
}

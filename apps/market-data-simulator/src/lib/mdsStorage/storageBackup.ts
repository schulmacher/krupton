import { exec } from 'child_process';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { createMdsStorageContext, MdsStorageContext } from '../../process/mdsStorageProcess/context.js';
import { ensureDirectoryExistsForFile } from '../fs.js';

const execAsync = promisify(exec);

function createBackupFilename() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('Z')[0];
  return `storage-${timestamp}.tar.gz`;
}

function isBackupFile(fileName: string) {
  return fileName.startsWith('storage-') && fileName.endsWith('.tar.gz');
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
    await ensureDirectoryExistsForFile(backupPath);

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

    // Now pass to saveBackup for upload
    await syncBackupToDrive(context);

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

async function syncBackupToDrive(context: MdsStorageContext) {
  const { diagnosticContext } = context;
  diagnosticContext.logger.info('[MOCK] Starting backup upload');
  const startTime = Date.now();

  await new Promise((resolve) => setTimeout(resolve, 100));

  diagnosticContext.logger.info('[MOCK] Uploading to Google Drive via rclone');
  await new Promise((resolve) => setTimeout(resolve, 100));

  const duration = Date.now() - startTime;
  diagnosticContext.logger.info(`[MOCK] Upload completed in ${duration}ms`);
}

export async function listBackups(context: MdsStorageContext) {
  const basePath = context.envContext.config.BACKUP_BASE_DIR;

  try {
    await ensureDirectoryExistsForFile(basePath);
    const files = await fs.readdir(basePath);

    const backupFilesWithStats = await Promise.all(
      files
        .filter(isBackupFile)
        .map(async (fileName) => {
          const timestampMatch = fileName.match(/storage-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})/);
          
          let date: Date | null = null;
          if (timestampMatch) {
            // Convert filename format back to ISO format: YYYY-MM-DDTHH-MM-SS-mmm -> YYYY-MM-DDTHH:MM:SS.mmm
            const isoString = timestampMatch[1]
              .replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})/, 'T$1:$2:$3.$4');
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
        backup.date !== null
    );
  } catch {
    return [];
  }
}

export async function removeBackupByName(context: MdsStorageContext, fileName: string) {
  const { diagnosticContext } = context;
  const basePath = context.envContext.config.BACKUP_BASE_DIR;
  const backupPath = path.join(basePath, fileName);
  const checksumPath = path.join(basePath, `${fileName}.sha256`);

  try {
    diagnosticContext.logger.info('Removing backup files', { fileName });

    await fs.unlink(backupPath)
    .then(() => {
      diagnosticContext.logger.info('Deleted backup file', { path: backupPath });
    })
    .catch(() => {
      diagnosticContext.logger.warn('Backup file not found', { path: backupPath });
    });

    await fs.unlink(checksumPath)
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

/**
 * Rclone Cloud Backup Sync Test Script
 *
 * This script tests the cloud backup synchronization functionality.
 *
 * ## Usage
 *
 * From the monorepo root:
 * ```bash
 * pnpm --filter 'external-bridge' test:rclone
 * ```
 *
 * Or with tsx directly:
 * ```bash
 * tsx apps/external-bridge/src/lib/mdsStorage/rcloneTest.ts
 * ```
 *
 * ## Environment Variables
 *
 * Required:
 * - CLOUD_SYNC_ENABLED=true
 * - RCLONE_REMOTE_NAME=gdrive-krupton (your rclone remote name)
 * - RCLONE_REMOTE_PATH=backups (path in remote storage)
 *
 * Optional:
 * - BACKUP_BASE_DIR=/path/to/backups (defaults to tmp/backup)
 * - CLOUD_BACKUP_TEMP_DIR=/path/to/temp (defaults to /tmp/cloud-backup-operation/local)
 *
 * ## What it does
 *
 * 1. Lists local backup files
 * 2. Lists cloud backup files
 * 3. Pushes new local files to cloud
 * 4. Pulls missing files from cloud
 * 5. Removes old files from cloud based on retention policy
 */

import { createMdsStorageContext } from '../../process/storageProcess/context.js';
import { syncLocalAndCloudBackups } from './storageBackupCloud.js';


async function testRcloneSync() {
  console.log('=== Starting rclone sync test ===\n');

  try {
    // Create context
    const context = createMdsStorageContext();

    console.log('Environment configuration:');
    console.log('- CLOUD_SYNC_ENABLED:', context.envContext.config.CLOUD_SYNC_ENABLED);
    console.log('- RCLONE_REMOTE_NAME:', context.envContext.config.RCLONE_REMOTE_NAME);
    console.log('- RCLONE_REMOTE_PATH:', context.envContext.config.RCLONE_REMOTE_PATH);
    console.log('- BACKUP_BASE_DIR:', context.envContext.config.BACKUP_BASE_DIR);
    console.log('- CLOUD_BACKUP_TEMP_DIR:', context.envContext.config.CLOUD_BACKUP_TEMP_DIR);
    console.log();

    if (!context.envContext.config.CLOUD_SYNC_ENABLED) {
      console.warn('⚠️  CLOUD_SYNC_ENABLED is false. Sync will be skipped.');
      console.warn('   Set CLOUD_SYNC_ENABLED=true in your environment to enable sync.\n');
    }

    // Run sync
    console.log('Starting sync...\n');
    const result = await syncLocalAndCloudBackups(context);

    // Print results
    console.log('\n=== Sync completed ===');
    console.log(`✓ Pushed files: ${result.pushed.length}`);
    if (result.pushed.length > 0) {
      result.pushed.forEach((file) => console.log(`  - ${file}`));
    }

    console.log(`✓ Pulled files: ${result.pulled.length}`);
    if (result.pulled.length > 0) {
      result.pulled.forEach((file) => console.log(`  - ${file}`));
    }

    console.log(`✓ Deleted files: ${result.deleted.length}`);
    if (result.deleted.length > 0) {
      result.deleted.forEach((file) => console.log(`  - ${file}`));
    }

    if (result.errors.length > 0) {
      console.log(`\n❌ Errors: ${result.errors.length}`);
      result.errors.forEach((error) => {
        console.log(`  - [${error.operation}] ${error.file}: ${error.error}`);
      });
      process.exit(1);
    } else {
      console.log('\n✅ Sync completed successfully with no errors');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Sync failed with exception:');
    console.error(error);
    process.exit(1);
  }
}

testRcloneSync();

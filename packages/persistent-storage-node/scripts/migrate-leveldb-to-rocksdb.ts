import { SegmentedLog } from '@krupton/rust-rocksdb-napi';
import { ClassicLevel } from 'classic-level';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function findLevelDbDirs(dir: string): string[] {
  const result: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        const hasLevelDbFiles = readdirSync(full).some(
          (f) => f.endsWith('.log') || f.endsWith('.ldb') || f === 'CURRENT',
        );
        if (hasLevelDbFiles) {
          result.push(full);
        } else {
          result.push(...findLevelDbDirs(full));
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️  Could not read directory ${dir}:`, err);
  }
  return result;
}

async function migrateLevelDbToRocksDb(
  levelDbPath: string,
  rocksDbPath: string,
  attemptRepair = true,
) {
  console.log(`🪶 Migrating ${levelDbPath} → ${rocksDbPath}`);

  const levelDb = new ClassicLevel<string, string>(levelDbPath, {
    valueEncoding: 'utf8',
  });

  try {
    await levelDb.open();
  } catch (err) {
    if (attemptRepair && err instanceof Error && err.message.includes('Corruption')) {
      console.log(`  ⚠️  Database corrupted, attempting repair...`);
      try {
        await ClassicLevel.repair(levelDbPath);
        await levelDb.open();
        console.log(`  ✓ Repair successful, continuing migration`);
      } catch (repairErr) {
        console.error(`  ✗ Repair failed:`, repairErr);
        throw err;
      }
    } else {
      throw err;
    }
  }

  const rocksDb = new SegmentedLog(rocksDbPath, true);

  let count = 0;
  let batchCount = 0;
  let skippedKeys = 0;

  try {
    for await (const [keyStr, value] of levelDb.iterator()) {
      const id = parseInt(keyStr, 10);
      if (isNaN(id)) {
        console.warn(`  ⚠️  Skipping invalid key: ${keyStr}`);
        skippedKeys++;
        continue;
      }

      rocksDb.put(id, Buffer.from(value));
      count++;
      batchCount++;

      if (batchCount >= 100_000) {
        console.log(`  → ${count} rows written`);
        batchCount = 0;
      }
    }

    if (skippedKeys > 0) {
      console.log(`  ⚠️  Skipped ${skippedKeys} invalid keys`);
    }
    console.log(`  ✅ ${count} total records written to RocksDB.`);
  } finally {
    await levelDb.close();
    rocksDb.close();
  }
}

async function main() {
  const sourceRoot = '/Users/e/taltech/loputoo/start/storage';
  const targetRoot = '/Users/e/taltech/loputoo/start/storage_rocks';

  const roots = [
    join(sourceRoot, 'external-bridge'),
    join(sourceRoot, 'internal-bridge'),
  ];

  const failedPaths: Array<{ source: string; target: string; error: unknown }> = [];
  let totalMigrated = 0;

  for (const root of roots) {
    console.log(`\n📂 Scanning ${root}...`);
    const levelDbDirs = findLevelDbDirs(root);
    console.log(`   Found ${levelDbDirs.length} LevelDB directories\n`);

    for (const levelDbPath of levelDbDirs) {
      const relativePath = levelDbPath.replace(sourceRoot, '');
      const rocksDbPath = join(targetRoot, relativePath);

      try {
        await migrateLevelDbToRocksDb(levelDbPath, rocksDbPath);
        totalMigrated++;
      } catch (err) {
        failedPaths.push({ source: levelDbPath, target: rocksDbPath, error: err });
        console.error(`❌ Failed ${levelDbPath}:`, err);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 Migration Summary:`);
  console.log(`   ✅ Successfully migrated: ${totalMigrated} databases`);
  console.log(`   ❌ Failed: ${failedPaths.length} databases`);

  if (failedPaths.length > 0) {
    console.log('\n❌ Failed migrations:');
    for (const { source, error } of failedPaths) {
      console.log(`   ${source}`);
      console.log(`      Error: ${error}`);
    }
  }

  console.log('\n🎉 Migration complete.\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});


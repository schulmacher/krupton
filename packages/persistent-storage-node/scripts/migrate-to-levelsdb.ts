import Database from 'better-sqlite3';
import { ClassicLevel } from 'classic-level';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

function findSqliteDbs(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) result.push(...findSqliteDbs(full));
    else if (entry.endsWith('.db')) result.push(full);
  }
  return result;
}

async function writeAllSqliteToRocks(sqlitePath: string) {
  const baseDir = dirname(sqlitePath);
  const subIndex = sqlitePath.replace(/\.db$/, '').split('/').pop()!;
  const rocksDir = join(baseDir, subIndex);

  console.log(`🪶 Migrating ${sqlitePath} → ${rocksDir}`);

  const sqlite = new Database(sqlitePath, { readonly: true });
  const rocks = new ClassicLevel<string, string>(rocksDir, {
    valueEncoding: 'utf8',
  });
  await rocks.open();

  const rows = sqlite
    .prepare('SELECT id, data FROM records ORDER BY id')
    .iterate() as IterableIterator<{ id: number; data: string }>;

  let batch = rocks.batch();
  let count = 0;
  for (const row of rows) {
    batch.put(String(row.id).padStart(16, '0'), row.data);
    count++;

    if (count % 500_000 === 0) {
      await batch.write();
      console.log(`  → ${count} rows written`);
      batch = rocks.batch(); // ✅ start a new one
    }
  }
  await batch.write();
  console.log(`✅ ${count} total records written to Rocks.`);

  sqlite.close();
  await rocks.close();
}

async function main() {
  const roots = [
    '/Users/e/taltech/loputoo/start/storage/external-bridge',
    '/Users/e/taltech/loputoo/start/storage/internal-bridge',
  ];

  const failedPaths = [];

  for (const root of roots) {
    const dbs = findSqliteDbs(root);
    for (const dbPath of dbs) {
      console.log(dbPath);
      try {
        await writeAllSqliteToRocks(dbPath);
      } catch (err) {
        failedPaths.push(dbPath);
        console.error(`❌ Failed ${dbPath}:`, err);
      }
    }
  }


  console.log('Failed paths', failedPaths);

  console.log('🎉 Full backfill complete.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

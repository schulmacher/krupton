#!/usr/bin/env node

import { execSync } from 'child_process';
import { readdirSync, statSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const STORAGE_DIRS = [
  'storage/external-bridge',
  'storage/internal-bridge'
];

function parseArgs() {
  const args = {
    stats: false,
    filter: null
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--stats') {
      args.stats = true;
    } else if (arg.startsWith('--filter=')) {
      args.filter = arg.split('=')[1];
    }
  }

  return args;
}

function findRocksDBDatabases(baseDir) {
  const databases = [];

  function traverse(dir) {
    try {
      if (existsSync(join(dir, 'CURRENT')) && existsSync(join(dir, 'LOCK'))) {
        databases.push(dir);
        return;
      }

      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            traverse(fullPath);
          }
        } catch {
          // Skip inaccessible directories
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  if (existsSync(baseDir)) {
    traverse(baseDir);
  }

  return databases;
}

function filterDatabases(databases, filter) {
  if (!filter) {
    return databases;
  }

  return databases.filter(db => db.includes(filter));
}

function getStats(dbPath) {
  try {
    const result = execSync(
      `rocksdb_ldb --db="${dbPath}" get_property rocksdb.stats`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    return result;
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

function displayHelp() {
  console.log(`
Usage: node scripts/rocksdb.js [options]

Options:
  --stats              Show statistics for all databases
  --filter=<pattern>   Filter databases by pattern (e.g., 'internal', 'binance', 'btc_usdt')

Examples:
  node scripts/rocksdb.js --stats
  node scripts/rocksdb.js --stats --filter=internal
  node scripts/rocksdb.js --stats --filter=binance
  node scripts/rocksdb.js --stats --filter=btc_usdt
  `);
}

function main() {
  const args = parseArgs();

  if (!args.stats && !args.filter) {
    displayHelp();
    process.exit(0);
  }

  if (args.stats) {
    console.log('🔍 Finding RocksDB databases...\n');

    let allDatabases = [];
    const workspaceRoot = resolve(process.cwd());

    for (const storageDir of STORAGE_DIRS) {
      const fullPath = join(workspaceRoot, storageDir);
      const dbs = findRocksDBDatabases(fullPath);
      allDatabases.push(...dbs);
    }

    const filteredDatabases = filterDatabases(allDatabases, args.filter);

    console.log(`Found ${filteredDatabases.length} database(s)${args.filter ? ` matching '${args.filter}'` : ''}:\n`);

    if (filteredDatabases.length === 0) {
      console.log('No databases found.');
      process.exit(0);
    }

    for (const dbPath of filteredDatabases) {
      const relativePath = dbPath.replace(workspaceRoot + '/', '');
      console.log(`${'='.repeat(80)}`);
      console.log(`📊 Database: ${relativePath}`);
      console.log(`${'='.repeat(80)}`);
      
      const stats = getStats(dbPath);
      console.log(stats);
      console.log('\n');
    }

    console.log(`✅ Displayed stats for ${filteredDatabases.length} database(s)`);
  }
}

main();



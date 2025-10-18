#!/usr/bin/env tsx

import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import { appendFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as readline from 'node:readline/promises';

const STORAGE_BASE = join(process.cwd(), '..', '..', 'storage');
const ALLOWED_BASE_DIRS = ['external-bridge', 'internal-bridge'];
const isAllowedBaseDir = (dirName: string): boolean => ALLOWED_BASE_DIRS.includes(dirName);

const POLL_INTERVAL_MS = 1000; // Poll every 1 second for new records

interface DatabaseInfo {
  fullPath: string;
  relativePath: string;
  displayName: string;
}

async function recursivelyFindDatabases(
  basePath: string,
  currentPath: string,
  relativePath: string = '',
): Promise<DatabaseInfo[]> {
  const databases: DatabaseInfo[] = [];

  try {
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(currentPath, entry.name);
      const entryRelativePath = relativePath ? join(relativePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        // Recursively search subdirectories
        const subDatabases = await recursivelyFindDatabases(basePath, entryPath, entryRelativePath);
        databases.push(...subDatabases);
      } else if (entry.isFile() && entry.name.endsWith('.db')) {
        // Found a database file
        databases.push({
          fullPath: entryPath,
          relativePath: entryRelativePath,
          displayName: entryRelativePath,
        });
      }
    }
  } catch {
    // Skip directories that can't be read
    console.error(`Warning: Could not read directory ${currentPath}`);
  }

  return databases;
}

async function discoverAllDatabases(): Promise<DatabaseInfo[]> {
  const allDatabases: DatabaseInfo[] = [];

  // Read base storage directory
  const baseEntries = await readdir(STORAGE_BASE, { withFileTypes: true });

  // Filter to only allowed directories
  const allowedDirs = baseEntries
    .filter((entry) => entry.isDirectory() && isAllowedBaseDir(entry.name))
    .map((entry) => entry.name);

  // Recursively search each allowed directory
  for (const dirName of allowedDirs) {
    const dirPath = join(STORAGE_BASE, dirName);
    const databases = await recursivelyFindDatabases(STORAGE_BASE, dirPath, dirName);
    allDatabases.push(...databases);
  }

  // Sort by relative path for consistent ordering
  allDatabases.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return allDatabases;
}

interface GroupedDatabases {
  [key: string]: DatabaseInfo[];
}

function groupDatabasesByPath(databases: DatabaseInfo[]): GroupedDatabases {
  const grouped: GroupedDatabases = {};

  for (const db of databases) {
    // Group by the path up to the last directory (excluding filename)
    const pathParts = db.relativePath.split('/');
    const groupKey = pathParts.slice(0, -1).join('/');

    if (!grouped[groupKey]) {
      grouped[groupKey] = [];
    }
    grouped[groupKey]!.push(db);
  }

  return grouped;
}

async function selectDatabase(
  prompt: string,
  databases: DatabaseInfo[],
): Promise<DatabaseInfo | null> {
  if (databases.length === 0) {
    console.log('No databases found');
    return null;
  }

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  ${prompt}`);
  console.log(`${'═'.repeat(80)}\n`);

  const grouped = groupDatabasesByPath(databases);
  const groupKeys = Object.keys(grouped).sort();

  let currentIndex = 0;
  const indexToDb = new Map<number, DatabaseInfo>();

  for (const groupKey of groupKeys) {
    // Print group header
    console.log(`\n  📁 ${groupKey}`);
    console.log(`  ${'─'.repeat(Math.min(groupKey.length + 3, 76))}`);

    const groupDbs = grouped[groupKey]!;
    for (const db of groupDbs) {
      const filename = db.relativePath.split('/').pop()!.replace('.db', '');
      const paddedNumber = String(currentIndex + 1).padStart(3, ' ');
      console.log(`     ${paddedNumber}. ${filename}`);
      indexToDb.set(currentIndex, db);
      currentIndex++;
    }
  }

  console.log(`\n${'═'.repeat(80)}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let selected: DatabaseInfo | null = null;

  while (!selected) {
    const answer = await rl.question('Select database number (or q to quit): ');

    if (answer.toLowerCase() === 'q') {
      rl.close();
      return null;
    }

    const index = parseInt(answer, 10) - 1;

    if (index >= 0 && index < databases.length && indexToDb.has(index)) {
      selected = indexToDb.get(index)!;
    } else {
      console.log('❌ Invalid selection. Please try again.');
    }
  }

  rl.close();
  return selected;
}

function generateOutputFilename(dbInfo: DatabaseInfo): string {
  // Convert relative path to filename: "external-bridge/binance/trades/BTCUSDT.db" -> "external-bridge_binance_trades_BTCUSDT.jsonl"
  const pathWithoutExtension = dbInfo.relativePath.replace('.db', '');
  const filename = pathWithoutExtension.replace(/\//g, '_') + '.jsonl';
  return filename;
}

async function getDatabaseStats(dbPath: string): Promise<void> {
  const stats = await stat(dbPath);
  const sizeInMB = stats.size / (1024 * 1024);
  
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  Database Statistics`);
  console.log(`${'═'.repeat(80)}\n`);
  console.log(`  File: ${dbPath}`);
  console.log(`  Size: ${sizeInMB.toFixed(2)} MB`);
  
  // Get record count from database
  const db = new Database(dbPath, { readonly: true });
  try {
    const result = db.prepare('SELECT COUNT(*) as count FROM records').get() as { count: number };
    console.log(`  Records: ${result.count.toLocaleString()}`);
    
    if (result.count > 0) {
      const avgSize = (stats.size / result.count).toFixed(2);
      console.log(`  Avg size per record: ${avgSize} bytes`);
    }
  } finally {
    db.close();
  }
  
  console.log(`\n${'═'.repeat(80)}\n`);
}

async function openDatabaseClient(dbPath: string): Promise<void> {
  console.error(`\nOpening database with sqlite3 client: ${dbPath}\n`);
  console.error('Tips:');
  console.error('  .tables           - List all tables');
  console.error('  .schema records   - Show table schema');
  console.error('  SELECT * FROM records LIMIT 10;');
  console.error('  .quit             - Exit\n');

  const sqlite3 = spawn('sqlite3', [dbPath], {
    stdio: 'inherit',
  });

  return new Promise((resolve, reject) => {
    sqlite3.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`sqlite3 exited with code ${code}`));
      }
    });

    sqlite3.on('error', (error) => {
      reject(error);
    });
  });
}

async function streamRecords(
  dbPath: string,
  follow: boolean,
  saveToFile: boolean,
  outputPath?: string,
): Promise<void> {
  const db = new Database(dbPath, { readonly: true });

  try {
    const rows = db.prepare('SELECT id, data FROM records ORDER BY id').all() as {
      id: number;
      data: string;
    }[];

    if (rows.length === 0) {
      console.error('No records found in database');
      if (!follow) {
        return;
      }
    }

    if (!follow) {
      console.error(`\n--- Streaming ${rows.length} records ---\n`);
    }

    // Write initial records
    if (saveToFile && outputPath) {
      // Write all records to file at once
      const content = rows.map((row) => row.data).join('\n') + (rows.length > 0 ? '\n' : '');
      await writeFile(outputPath, content);
      console.error(`Written ${rows.length} records to ${outputPath}`);
    } else {
      for (const row of rows) {
        console.log(row.data);
      }
    }

    if (!follow) {
      console.error(`\n--- End of stream (${rows.length} records) ---\n`);
      return;
    }

    // Follow mode - continuously poll for new records
    let lastId = rows.length > 0 ? rows[rows.length - 1]!.id : 0;
    console.error(`\n--- Following for new records (press Ctrl+C to exit) ---`);
    console.error(`--- Last ID: ${lastId} ---\n`);

    const stmt = db.prepare('SELECT id, data FROM records WHERE id > ? ORDER BY id');

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const newRows = stmt.all(lastId) as { id: number; data: string }[];

      if (newRows.length > 0) {
        if (saveToFile && outputPath) {
          // Append new records to file
          const content = newRows.map((row) => row.data).join('\n') + '\n';
          await appendFile(outputPath, content);
          console.error(`Appended ${newRows.length} new records to ${outputPath}`);
        } else {
          for (const row of newRows) {
            console.log(row.data);
          }
        }

        lastId = newRows[newRows.length - 1]!.id;
      }
    }
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  const followMode = args.includes('--follow') || args.includes('-f');
  const saveMode = args.includes('--save') || args.includes('-s');
  const queryMode = args.includes('--query') || args.includes('-q');
  const statsMode = args.includes('--stats');
  const helpMode = args.includes('--help') || args.includes('-h');
  const partialFilter = args.filter((arg) => !arg.startsWith('-')).join(' ');

  console.error('Storage Record Streamer');
  console.error('=======================\n');

  if (followMode) {
    console.error('Mode: Follow (live streaming)\n');
  }

  if (saveMode) {
    console.error('Mode: Save to file\n');
  }

  if (helpMode) {
    console.error('Mode: Help\n');
    console.error('Usage: stream-records [options]');
    console.error('Options:');
    console.error('  [partial filter]  - Partial filter (matches both words)');
    console.error('  --follow, -f  - Follow mode (live streaming)');
    console.error('  --save, -s    - Save to file');
    console.error('  --query, -q   - SQL Query (sqlite3 client)');
    console.error('  --stats       - Show database statistics (size in MB, record count)');
    console.error('  --help, -h    - Show help');
    return;
  }

  // Step 1: Discover all databases recursively
  console.error('Discovering databases...\n');
  const databases = await discoverAllDatabases();

  if (databases.length === 0) {
    console.error('No databases found in allowed directories.');
    return;
  }

  const filteredDatabases = databases.filter((db) =>
    partialFilter
      .toLowerCase()
      .split(' ')
      .every((word) => db.relativePath.toLowerCase().includes(word)),
  );

  if (partialFilter) {
    console.error(`Found ${filteredDatabases.length} out of  ${partialFilter} database(s)\n`);
  } else {
    console.error(`Found ${databases.length} database(s)\n`);
  }

  // Step 2: Select database
  const selectedDb = await selectDatabase('Select Database:', filteredDatabases);
  if (!selectedDb) return;

  // Step 3: Execute based on mode
  if (statsMode) {
    await getDatabaseStats(selectedDb.fullPath);
    return;
  }

  if (queryMode) {
    await openDatabaseClient(selectedDb.fullPath);
    return;
  }

  // Step 4: Prepare output path if saving to file
  let outputPath: string | undefined;
  if (saveMode) {
    const filename = generateOutputFilename(selectedDb);
    outputPath = join(STORAGE_BASE, filename);
    console.error(`Output file: ${outputPath}\n`);
  }

  // Step 5: Stream records
  console.error(`\nStreaming from: ${selectedDb.fullPath}\n`);

  await streamRecords(selectedDb.fullPath, followMode, saveMode, outputPath);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

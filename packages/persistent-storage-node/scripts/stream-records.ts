#!/usr/bin/env tsx

import { readdir, appendFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import * as readline from 'node:readline/promises';

const STORAGE_BASE = join(process.cwd(), '..', '..', 'storage', 'external-bridge');
const POLL_INTERVAL_MS = 1000; // Poll every 1 second for new records

async function listDirectories(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function listDatabases(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path);
    return entries.filter((entry) => entry.endsWith('.db')).sort();
  } catch {
    return [];
  }
}

async function selectFromList(prompt: string, options: string[]): Promise<string | null> {
  if (options.length === 0) {
    console.log('No options available');
    return null;
  }

  console.log(`\n${prompt}`);
  options.forEach((option, index) => {
    console.log(`  ${index + 1}. ${option}`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let selected: string | null = null;

  while (!selected) {
    const answer = await rl.question('\nSelect (number): ');
    const index = parseInt(answer, 10) - 1;

    if (index >= 0 && index < options.length) {
      selected = options[index]!;
    } else {
      console.log('Invalid selection. Please try again.');
    }
  }

  rl.close();
  return selected;
}

function generateOutputFilename(
  exchange: string,
  endpointType: string,
  dbName: string,
): string {
  // Remove .db extension from database name
  const symbol = dbName.replace('.db', '');
  return `${exchange}_${endpointType}_${symbol}.jsonl`;
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

  console.error('Storage Record Streamer');
  console.error('=======================\n');

  if (followMode) {
    console.error('Mode: Follow (live streaming)\n');
  }

  if (saveMode) {
    console.error('Mode: Save to file\n');
  }

  // Step 1: Select exchange
  const exchanges = await listDirectories(STORAGE_BASE);
  const exchange = await selectFromList('Select Exchange:', exchanges);
  if (!exchange) return;

  // Step 2: Select endpoint type
  const exchangePath = join(STORAGE_BASE, exchange);
  const endpointTypes = await listDirectories(exchangePath);
  const endpointType = await selectFromList('Select Endpoint Type:', endpointTypes);
  if (!endpointType) return;

  // Step 3: Select database
  const endpointPath = join(exchangePath, endpointType);
  const databases = await listDatabases(endpointPath);
  const database = await selectFromList('Select Database:', databases);
  if (!database) return;

  // Step 4: Prepare output path if saving to file
  let outputPath: string | undefined;
  if (saveMode) {
    const filename = generateOutputFilename(exchange, endpointType, database);
    outputPath = join(dirname(endpointPath), filename);
    console.error(`Output file: ${outputPath}\n`);
  }

  // Step 5: Stream records
  const dbPath = join(endpointPath, database);
  console.error(`\nStreaming from: ${dbPath}\n`);

  await streamRecords(dbPath, followMode, saveMode, outputPath);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});


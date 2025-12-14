#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { readdirSync, statSync, existsSync, createWriteStream } from 'fs';
import { join, resolve } from 'path';
import { createInterface } from 'readline';

const STORAGE_DIRS = [
  'storage/external-bridge',
  'storage/internal-bridge'
];

function parseArgs() {
  const args = {
    stats: false,
    dump: false,
    filter: null,
    dbPath: null,
    outputFile: null
  };

  for (let i = 0; i < process.argv.slice(2).length; i++) {
    const arg = process.argv.slice(2)[i];
    
    if (arg === 'stats') {
      args.stats = true;
    } else if (arg === 'dump') {
      args.dump = true;
      if (i + 1 < process.argv.slice(2).length) {
        args.dbPath = process.argv.slice(2)[i + 1];
      }
      if (i + 2 < process.argv.slice(2).length) {
        args.outputFile = process.argv.slice(2)[i + 2];
      }
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

function hexToUtf8(hexString) {
  try {
    const hex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return Buffer.from(bytes).toString('utf8');
  } catch (error) {
    return hexString;
  }
}

function dump(dbPath, outputFile) {
  return new Promise((resolve, reject) => {
    const ldb = spawn('rocksdb_ldb', ['--db=' + dbPath, 'scan', '--hex']);
    
    const writeStream = createWriteStream(outputFile);
    let lineCount = 0;
    let nonEmptyCount = 0;
    
    const rl = createInterface({
      input: ldb.stdout,
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      if (line.trim().length > 0) {
        const separatorIndex = line.indexOf(' ==> ');
        
        if (separatorIndex !== -1) {
          const valueHex = line.substring(separatorIndex + 5);
          const valueUtf8 = hexToUtf8(valueHex);
          
          writeStream.write(valueUtf8 + '\n');
          
          nonEmptyCount++;
          if (nonEmptyCount <= 3) {
            console.error(`Sample ${nonEmptyCount}: ${valueUtf8.substring(0, 100)}...`);
          }
        }
      }
      lineCount++;
      
      if (lineCount % 10000 === 0) {
        console.error(`📝 Written ${lineCount} lines (${nonEmptyCount} parsed)...`);
      }
    });
    
    rl.on('close', () => {
      writeStream.end(() => {
        resolve({ total: lineCount, nonEmpty: nonEmptyCount });
      });
    });
    
    ldb.stderr.on('data', (data) => {
      console.error(`rocksdb_ldb stderr: ${data.toString()}`);
    });
    
    ldb.on('error', (error) => {
      reject(new Error(`Failed to spawn rocksdb_ldb: ${error.message}`));
    });
    
    ldb.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`rocksdb_ldb exited with code ${code}`));
      }
    });
  });
}

function displayHelp() {
  console.log(`
Usage: node scripts/rocksdb.js [command] [options]

Commands:
  stats                     Show statistics for all databases
  dump <dbpath> <output>    Dump database values to text file (UTF-8 decoded, one per line)

Options:
  --filter=<pattern>   Filter databases by pattern (e.g., 'internal', 'binance', 'btc_usdt')

Examples:
  node scripts/rocksdb.js stats
  node scripts/rocksdb.js stats --filter=internal
  node scripts/rocksdb.js stats --filter=binance
  node scripts/rocksdb.js stats --filter=btc_usdt
  node scripts/rocksdb.js dump storage/external-bridge/kraken/ws_book/xrp_usdt ws_book_xrp_usdt.txt

Notes:
  The dump command outputs only the values (keys are omitted), one value per line.
  Values are decoded from hex to UTF-8 strings.
  `);
}

async function main() {
  const args = parseArgs();

  if (!args.stats && !args.dump) {
    displayHelp();
    process.exit(0);
  }

  if (args.dump) {
    if (!args.dbPath) {
      console.error('Error: Database path is required for dump command');
      displayHelp();
      process.exit(1);
    }

    if (!args.outputFile) {
      console.error('Error: Output file path is required for dump command');
      displayHelp();
      process.exit(1);
    }

    const dbPath = resolve(args.dbPath);
    if (!existsSync(dbPath)) {
      console.error(`Error: Database path does not exist: ${dbPath}`);
      process.exit(1);
    }

    if (!existsSync(join(dbPath, 'CURRENT')) || !existsSync(join(dbPath, 'LOCK'))) {
      console.error(`Error: Path does not appear to be a RocksDB database: ${dbPath}`);
      process.exit(1);
    }

    const outputPath = resolve(args.outputFile);
    console.error(`🔄 Dumping database: ${dbPath}`);
    console.error(`📝 Writing to file: ${outputPath}`);
    console.error(`🔧 Converting hex to UTF-8...\n`);
    
    try {
      const result = await dump(dbPath, outputPath);
      console.error(`\n✅ Dumped ${result.nonEmpty} entries (${result.total} total lines) to ${outputPath}`);
      process.exit(0);
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
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



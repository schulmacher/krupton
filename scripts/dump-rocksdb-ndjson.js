import { SegmentedLog } from '../packages/rust-rocksdb-napi/index.js';
import { createWriteStream } from 'fs';
import { resolve } from 'path';

const dbPath = process.argv[2];
const outputPath = process.argv[3] || 'dump_output.ndjson';

if (!dbPath) {
  console.error('Usage: node dump-rocksdb-ndjson.js <db-path> [output-file]');
  console.error('Example: node dump-rocksdb-ndjson.js /Users/e/taltech/loputoo/start/storage/external-bridge/binance/ws_trade/xrp_usdt dump.ndjson');
  process.exit(1);
}

const resolvedDbPath = resolve(dbPath);
const resolvedOutputPath = resolve(outputPath);

console.log(`Opening database: ${resolvedDbPath}`);
console.log(`Output file: ${resolvedOutputPath}`);

try {
  const db = SegmentedLog.openReadOnly(resolvedDbPath, true);
  
  console.log('Reading records...');
  
  const writeStream = createWriteStream(resolvedOutputPath);
  const iter = db.iterateFrom(0);
  
  let count = 0;
  while (iter.hasNext()) {
    const result = iter.next();
    if (result) {
      const key = Buffer.from(result.key).readBigInt64BE(0);
      const value = JSON.parse(result.value.toString());
      
      const record = {
        id: key.toString(),
        ...value
      };
      
      writeStream.write(JSON.stringify(record) + '\n');
      
      count++;
      if (count % 10000 === 0) {
        console.log(`Processed ${count} records...`);
      }
    }
  }
  
  iter.close();
  
  writeStream.end(() => {
    console.log(`✅ Successfully dumped ${count} records to ${resolvedOutputPath}`);
    
    try {
      db.close();
    } catch (err) {
      console.log('Note: Database close returned an error (expected in read-only mode)');
    }
    
    process.exit(0);
  });
  
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}


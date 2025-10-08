import { mkdir, open, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readIndexEntries } from './endpointStorageIndex.js';
import { reindexAllFiles } from './endpointStorageIndexOps.js';

type TestRecord = {
  timestamp: number;
  id: number;
  data: string;
};

async function readAllRecordsByStringSplit(filePath: string): Promise<TestRecord[]> {
  const fileHandle = await open(filePath, 'r');
  try {
    const stats = await fileHandle.stat();
    const buffer = Buffer.allocUnsafe(stats.size);
    await fileHandle.read(buffer, 0, stats.size, 0);

    const fileContent = buffer.toString('utf-8');
    const lines = fileContent.trim().split('\n').filter((line) => line.length > 0);

    return lines.map((line) => JSON.parse(line) as TestRecord);
  } finally {
    await fileHandle.close();
  }
}

async function readAllRecordsByIndex(filePath: string): Promise<TestRecord[]> {
  const entries = await readIndexEntries({ indexPath: filePath });

  if (entries.length === 0) {
    return [];
  }

  const fileHandle = await open(filePath, 'r');
  try {
    const results: TestRecord[] = [];

    for (const entry of entries) {
      const byteLength = Number(entry.endByte - entry.startByte);
      const buffer = Buffer.allocUnsafe(byteLength);

      await fileHandle.read(buffer, 0, byteLength, Number(entry.startByte));

      const text = buffer.toString('utf-8').trim();
      results.push(JSON.parse(text) as TestRecord);
    }

    return results;
  } finally {
    await fileHandle.close();
  }
}

async function readAllRecordsByIndexBatched(filePath: string): Promise<TestRecord[]> {
  const entries = await readIndexEntries({ indexPath: filePath });

  if (entries.length === 0) {
    return [];
  }

  const fileHandle = await open(filePath, 'r');
  try {
    const firstEntry = entries[0]!;
    const lastEntry = entries[entries.length - 1]!;
    const totalBytes = Number(lastEntry.endByte - firstEntry.startByte);

    const buffer = Buffer.allocUnsafe(totalBytes);
    await fileHandle.read(buffer, 0, totalBytes, Number(firstEntry.startByte));

    const results: TestRecord[] = [];

    for (const entry of entries) {
      const startOffset = Number(entry.startByte - firstEntry.startByte);
      const byteLength = Number(entry.endByte - entry.startByte);

      const text = buffer.subarray(startOffset, startOffset + byteLength).toString('utf-8').trim();
      results.push(JSON.parse(text) as TestRecord);
    }

    return results;
  } finally {
    await fileHandle.close();
  }
}

async function benchmark() {
  const tempDir = join(process.cwd(), 'benchmark-' + Date.now());
  await mkdir(tempDir, { recursive: true });

  try {
    const testCases = [
      { recordCount: 100, label: '100 records' },
      { recordCount: 1000, label: '1,000 records' },
      { recordCount: 10000, label: '10,000 records' },
    ];

    console.log('='.repeat(80));
    console.log('BENCHMARK: Read All Records - String Split vs Index-Based');
    console.log('='.repeat(80));
    console.log();

    for (const testCase of testCases) {
      const { recordCount, label } = testCase;
      const filePath = join(tempDir, `test-${recordCount}.jsonl`);

      console.log(`Test Case: ${label}`);
      console.log('-'.repeat(80));

      const records: TestRecord[] = [];
      for (let i = 0; i < recordCount; i++) {
        records.push({
          timestamp: 1000000 + i * 1000,
          id: i,
          data: 'Record ' + i + ' with data',
        });
      }

      await writeFile(filePath, records.map((r) => JSON.stringify(r)).join('\n') + '\n');

      const listAllFiles = async () => [filePath];
      await reindexAllFiles<TestRecord>(listAllFiles);

      const stats = await open(filePath, 'r').then(async (fh) => {
        const s = await fh.stat();
        await fh.close();
        return s;
      });
      console.log(`  File size: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log();

      const iterations = recordCount <= 1000 ? 100 : 20;

      let totalStringSplit = 0;
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await readAllRecordsByStringSplit(filePath);
        totalStringSplit += performance.now() - start;
      }
      const avgStringSplit = totalStringSplit / iterations;

      let totalIndexPerRecord = 0;
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await readAllRecordsByIndex(filePath);
        totalIndexPerRecord += performance.now() - start;
      }
      const avgIndexPerRecord = totalIndexPerRecord / iterations;

      let totalIndexBatched = 0;
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await readAllRecordsByIndexBatched(filePath);
        totalIndexBatched += performance.now() - start;
      }
      const avgIndexBatched = totalIndexBatched / iterations;

      console.log(`  Results (averaged over ${iterations} iterations):`);
      console.log(`    String split:           ${avgStringSplit.toFixed(3)} ms`);
      console.log(`    Index (per-record):     ${avgIndexPerRecord.toFixed(3)} ms`);
      console.log(`    Index (batched):        ${avgIndexBatched.toFixed(3)} ms`);
      console.log();

      const baseline = avgStringSplit;
      const improvementPerRecord = ((baseline - avgIndexPerRecord) / baseline) * 100;
      const improvementBatched = ((baseline - avgIndexBatched) / baseline) * 100;

      console.log(`  Performance comparison (vs String split):`);
      console.log(
        `    Index (per-record):     ${improvementPerRecord > 0 ? '+' : ''}${improvementPerRecord.toFixed(1)}%`,
      );
      console.log(
        `    Index (batched):        ${improvementBatched > 0 ? '+' : ''}${improvementBatched.toFixed(1)}%`,
      );
      console.log();
      console.log();
    }

    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log();
    console.log('For reading ALL records:');
    console.log('  • String split is simple and effective for most use cases');
    console.log('  • Index batched read can be faster, especially for larger files');
    console.log('  • Index per-record read is slowest due to multiple file operations');
    console.log();
    console.log('Index-based reading excels at:');
    console.log('  • Reading specific line ranges (already implemented)');
    console.log('  • Reading last record only (already implemented)');
    console.log('  • Random access to specific records');
    console.log('  • Partial file reads without loading entire file');
    console.log();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

benchmark().catch(console.error);

import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendIndexEntry,
  createIndexHeader,
  getIndexEntry,
  getIndexEntryCount,
  getLastIndexEntry,
  readIndex,
  readIndexEntries,
  readIndexHeader,
  type IndexEntry,
} from './endpointStorageIndex.js';

describe('endpointStorageIndex - Basic Operations', () => {
  let tempDir: string;
  let testIndexPath: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-index-' + Date.now());
    await mkdir(tempDir, { recursive: true });
    testIndexPath = join(tempDir, 'test-data.jsonl');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('createIndexHeader', () => {
    it('should create index file with header', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const header = await readIndexHeader({ indexPath: testIndexPath });

      expect(header).not.toBeNull();
      expect(header?.version).toBe(1);
      expect(header?.fileNumber).toBe(1);
      expect(header?.globalLineOffset).toBe(0n);
    });

    it('should create header with large globalLineOffset', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 42,
        globalLineOffset: 999999999n,
      });

      const header = await readIndexHeader({ indexPath: testIndexPath });

      expect(header?.fileNumber).toBe(42);
      expect(header?.globalLineOffset).toBe(999999999n);
    });

    it('should create directories if they do not exist', async () => {
      const nestedPath = join(tempDir, 'nested/deep/path/data.jsonl');

      await createIndexHeader({
        indexPath: nestedPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const header = await readIndexHeader({ indexPath: nestedPath });
      expect(header).not.toBeNull();
    });

    it('should write header as exactly 64 bytes', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const idxFilePath = `${testIndexPath}.idx`;
      const fileContent = await readFile(idxFilePath);

      expect(fileContent.length).toBe(64);
    });
  });

  describe('readIndexHeader', () => {
    it('should return null for non-existent file', async () => {
      const header = await readIndexHeader({ indexPath: testIndexPath });
      expect(header).toBeNull();
    });

    it('should read existing header correctly', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 5,
        globalLineOffset: 12345n,
      });

      const header = await readIndexHeader({ indexPath: testIndexPath });

      expect(header?.version).toBe(1);
      expect(header?.fileNumber).toBe(5);
      expect(header?.globalLineOffset).toBe(12345n);
    });
  });

  describe('appendIndexEntry', () => {
    it('should append entry after header', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const entry: IndexEntry = {
        fileNumber: 1,
        lineNumberLocal: 1,
        lineNumberGlobal: 1n,
        startByte: 0n,
        endByte: 100n,
        messageTime: 1234567890000n,
        timeSource: 'created',
      };

      await appendIndexEntry({ indexPath: testIndexPath, entry });

      const entries = await readIndexEntries({ indexPath: testIndexPath });

      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(entry);
    });

    it('should append multiple entries in order', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const entries: IndexEntry[] = [
        {
          fileNumber: 1,
          lineNumberLocal: 1,
          lineNumberGlobal: 1n,
          startByte: 0n,
          endByte: 100n,
          messageTime: 1000n,
          timeSource: 'created',
        },
        {
          fileNumber: 1,
          lineNumberLocal: 2,
          lineNumberGlobal: 2n,
          startByte: 100n,
          endByte: 250n,
          messageTime: 2000n,
          timeSource: 'extracted',
        },
        {
          fileNumber: 1,
          lineNumberLocal: 3,
          lineNumberGlobal: 3n,
          startByte: 250n,
          endByte: 500n,
          messageTime: 3000n,
          timeSource: 'created',
        },
      ];

      for (const entry of entries) {
        await appendIndexEntry({ indexPath: testIndexPath, entry });
      }

      const readEntries = await readIndexEntries({ indexPath: testIndexPath });

      expect(readEntries).toHaveLength(3);
      expect(readEntries).toEqual(entries);
    });

    it('should handle large byte offsets', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const entry: IndexEntry = {
        fileNumber: 1,
        lineNumberLocal: 1,
        lineNumberGlobal: 1n,
        startByte: 9007199254740991n, // Max safe integer
        endByte: 9007199254740992n,
        messageTime: 1234567890000n,
        timeSource: 'created',
      };

      await appendIndexEntry({ indexPath: testIndexPath, entry });

      const entries = await readIndexEntries({ indexPath: testIndexPath });

      expect(entries[0]?.startByte).toBe(9007199254740991n);
      expect(entries[0]?.endByte).toBe(9007199254740992n);
    });

    it('should preserve timeSource values', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const createdEntry: IndexEntry = {
        fileNumber: 1,
        lineNumberLocal: 1,
        lineNumberGlobal: 1n,
        startByte: 0n,
        endByte: 100n,
        messageTime: 1000n,
        timeSource: 'created',
      };

      const extractedEntry: IndexEntry = {
        fileNumber: 1,
        lineNumberLocal: 2,
        lineNumberGlobal: 2n,
        startByte: 100n,
        endByte: 200n,
        messageTime: 2000n,
        timeSource: 'extracted',
      };

      await appendIndexEntry({ indexPath: testIndexPath, entry: createdEntry });
      await appendIndexEntry({ indexPath: testIndexPath, entry: extractedEntry });

      const entries = await readIndexEntries({ indexPath: testIndexPath });

      expect(entries[0]?.timeSource).toBe('created');
      expect(entries[1]?.timeSource).toBe('extracted');
    });
  });

  describe('readIndexEntries', () => {
    it('should return empty array for file with only header', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const entries = await readIndexEntries({ indexPath: testIndexPath });
      expect(entries).toEqual([]);
    });

    it('should return empty array for non-existent file', async () => {
      const entries = await readIndexEntries({ indexPath: testIndexPath });
      expect(entries).toEqual([]);
    });

    it('should read subset of entries with fromIndex', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      for (let i = 0; i < 10; i++) {
        await appendIndexEntry({
          indexPath: testIndexPath,
          entry: {
            fileNumber: 1,
            lineNumberLocal: i + 1,
            lineNumberGlobal: BigInt(i + 1),
            startByte: BigInt(i * 100),
            endByte: BigInt((i + 1) * 100),
            messageTime: BigInt(i * 1000),
            timeSource: 'created',
          },
        });
      }

      const entries = await readIndexEntries({ indexPath: testIndexPath, fromIndex: 5 });

      expect(entries).toHaveLength(5);
      expect(entries[0]?.lineNumberLocal).toBe(6);
      expect(entries[4]?.lineNumberLocal).toBe(10);
    });

    it('should read subset of entries with fromIndex and count', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      for (let i = 0; i < 10; i++) {
        await appendIndexEntry({
          indexPath: testIndexPath,
          entry: {
            fileNumber: 1,
            lineNumberLocal: i + 1,
            lineNumberGlobal: BigInt(i + 1),
            startByte: BigInt(i * 100),
            endByte: BigInt((i + 1) * 100),
            messageTime: BigInt(i * 1000),
            timeSource: 'created',
          },
        });
      }

      const entries = await readIndexEntries({ indexPath: testIndexPath, fromIndex: 3, count: 4 });

      expect(entries).toHaveLength(4);
      expect(entries[0]?.lineNumberLocal).toBe(4);
      expect(entries[3]?.lineNumberLocal).toBe(7);
    });

    it('should handle count exceeding available entries', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      for (let i = 0; i < 5; i++) {
        await appendIndexEntry({
          indexPath: testIndexPath,
          entry: {
            fileNumber: 1,
            lineNumberLocal: i + 1,
            lineNumberGlobal: BigInt(i + 1),
            startByte: BigInt(i * 100),
            endByte: BigInt((i + 1) * 100),
            messageTime: BigInt(i * 1000),
            timeSource: 'created',
          },
        });
      }

      const entries = await readIndexEntries({ indexPath: testIndexPath, fromIndex: 2, count: 100 });

      expect(entries).toHaveLength(3);
    });
  });

  describe('readIndex', () => {
    it('should return null for non-existent file', async () => {
      const index = await readIndex({ indexPath: testIndexPath });
      expect(index).toBeNull();
    });

    it('should read complete index with header and entries', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 2,
        globalLineOffset: 100n,
      });

      const entries: IndexEntry[] = [
        {
          fileNumber: 2,
          lineNumberLocal: 1,
          lineNumberGlobal: 101n,
          startByte: 0n,
          endByte: 50n,
          messageTime: 1000n,
          timeSource: 'created',
        },
        {
          fileNumber: 2,
          lineNumberLocal: 2,
          lineNumberGlobal: 102n,
          startByte: 50n,
          endByte: 150n,
          messageTime: 2000n,
          timeSource: 'extracted',
        },
      ];

      for (const entry of entries) {
        await appendIndexEntry({ indexPath: testIndexPath, entry });
      }

      const index = await readIndex({ indexPath: testIndexPath });

      expect(index).not.toBeNull();
      expect(index?.header.fileNumber).toBe(2);
      expect(index?.header.globalLineOffset).toBe(100n);
      expect(index?.entries).toEqual(entries);
    });
  });

  describe('getIndexEntry', () => {
    it('should get specific entry by index', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const entries: IndexEntry[] = [];
      for (let i = 0; i < 5; i++) {
        const entry: IndexEntry = {
          fileNumber: 1,
          lineNumberLocal: i + 1,
          lineNumberGlobal: BigInt(i + 1),
          startByte: BigInt(i * 100),
          endByte: BigInt((i + 1) * 100),
          messageTime: BigInt(i * 1000),
          timeSource: 'created',
        };
        entries.push(entry);
        await appendIndexEntry({ indexPath: testIndexPath, entry });
      }

      const entry2 = await getIndexEntry({ indexPath: testIndexPath, entryIndex: 2 });

      expect(entry2).toEqual(entries[2]);
    });

    it('should return null for out-of-bounds index', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      await appendIndexEntry({
        indexPath: testIndexPath,
        entry: {
          fileNumber: 1,
          lineNumberLocal: 1,
          lineNumberGlobal: 1n,
          startByte: 0n,
          endByte: 100n,
          messageTime: 1000n,
          timeSource: 'created',
        },
      });

      const entry = await getIndexEntry({ indexPath: testIndexPath, entryIndex: 999 });

      expect(entry).toBeNull();
    });

    it('should return null for non-existent file', async () => {
      const entry = await getIndexEntry({ indexPath: testIndexPath, entryIndex: 0 });
      expect(entry).toBeNull();
    });
  });

  describe('getLastIndexEntry', () => {
    it('should return null for file with only header', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const lastEntry = await getLastIndexEntry({ indexPath: testIndexPath });
      expect(lastEntry).toBeNull();
    });

    it('should return null for non-existent file', async () => {
      const lastEntry = await getLastIndexEntry({ indexPath: testIndexPath });
      expect(lastEntry).toBeNull();
    });

    it('should return last entry correctly', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const entries: IndexEntry[] = [];
      for (let i = 0; i < 5; i++) {
        const entry: IndexEntry = {
          fileNumber: 1,
          lineNumberLocal: i + 1,
          lineNumberGlobal: BigInt(i + 1),
          startByte: BigInt(i * 100),
          endByte: BigInt((i + 1) * 100),
          messageTime: BigInt(i * 1000),
          timeSource: 'created',
        };
        entries.push(entry);
        await appendIndexEntry({ indexPath: testIndexPath, entry });
      }

      const lastEntry = await getLastIndexEntry({ indexPath: testIndexPath });

      expect(lastEntry).toEqual(entries[4]);
    });

    it('should return correct entry after multiple appends', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      for (let i = 0; i < 3; i++) {
        await appendIndexEntry({
          indexPath: testIndexPath,
          entry: {
            fileNumber: 1,
            lineNumberLocal: i + 1,
            lineNumberGlobal: BigInt(i + 1),
            startByte: BigInt(i * 100),
            endByte: BigInt((i + 1) * 100),
            messageTime: BigInt(i * 1000),
            timeSource: 'created',
          },
        });
      }

      const lastEntry = await getLastIndexEntry({ indexPath: testIndexPath });

      expect(lastEntry?.lineNumberLocal).toBe(3);
      expect(lastEntry?.lineNumberGlobal).toBe(3n);
    });
  });

  describe('getIndexEntryCount', () => {
    it('should return 0 for non-existent file', async () => {
      const count = await getIndexEntryCount({ indexPath: testIndexPath });
      expect(count).toBe(0);
    });

    it('should return 0 for file with only header', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const count = await getIndexEntryCount({ indexPath: testIndexPath });
      expect(count).toBe(0);
    });

    it('should return correct count for multiple entries', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      for (let i = 0; i < 10; i++) {
        await appendIndexEntry({
          indexPath: testIndexPath,
          entry: {
            fileNumber: 1,
            lineNumberLocal: i + 1,
            lineNumberGlobal: BigInt(i + 1),
            startByte: BigInt(i * 100),
            endByte: BigInt((i + 1) * 100),
            messageTime: BigInt(i * 1000),
            timeSource: 'created',
          },
        });
      }

      const count = await getIndexEntryCount({ indexPath: testIndexPath });
      expect(count).toBe(10);
    });
  });
});

describe('endpointStorageIndex - Advanced Scenarios', () => {
  let tempDir: string;
  let testIndexPath: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-index-advanced-' + Date.now());
    await mkdir(tempDir, { recursive: true });
    testIndexPath = join(tempDir, 'test-data.jsonl');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('file rotation scenario', () => {
    it('should handle multiple file sequence with correct global line numbering', async () => {
      const file1Path = join(tempDir, 'file-1.jsonl');
      const file2Path = join(tempDir, 'file-2.jsonl');

      await createIndexHeader({
        indexPath: file1Path,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      for (let i = 0; i < 100; i++) {
        await appendIndexEntry({
          indexPath: file1Path,
          entry: {
            fileNumber: 1,
            lineNumberLocal: i + 1,
            lineNumberGlobal: BigInt(i + 1),
            startByte: BigInt(i * 50),
            endByte: BigInt((i + 1) * 50),
            messageTime: BigInt(i * 1000),
            timeSource: 'created',
          },
        });
      }

      const lastEntry1 = await getLastIndexEntry({ indexPath: file1Path });

      await createIndexHeader({
        indexPath: file2Path,
        fileNumber: 2,
        globalLineOffset: lastEntry1!.lineNumberGlobal,
      });

      for (let i = 0; i < 50; i++) {
        await appendIndexEntry({
          indexPath: file2Path,
          entry: {
            fileNumber: 2,
            lineNumberLocal: i + 1,
            lineNumberGlobal: lastEntry1!.lineNumberGlobal + BigInt(i + 1),
            startByte: BigInt(i * 50),
            endByte: BigInt((i + 1) * 50),
            messageTime: BigInt((100 + i) * 1000),
            timeSource: 'created',
          },
        });
      }

      const header2 = await readIndexHeader({ indexPath: file2Path });
      const lastEntry2 = await getLastIndexEntry({ indexPath: file2Path });

      expect(header2?.fileNumber).toBe(2);
      expect(header2?.globalLineOffset).toBe(100n);
      expect(lastEntry2?.lineNumberGlobal).toBe(150n);
    });
  });

  describe('large dataset performance', () => {
    it('should handle 1000 entries efficiently', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        await appendIndexEntry({
          indexPath: testIndexPath,
          entry: {
            fileNumber: 1,
            lineNumberLocal: i + 1,
            lineNumberGlobal: BigInt(i + 1),
            startByte: BigInt(i * 200),
            endByte: BigInt((i + 1) * 200),
            messageTime: BigInt(i * 1000),
            timeSource: i % 2 === 0 ? 'created' : 'extracted',
          },
        });
      }

      const writeTime = Date.now() - startTime;

      const count = await getIndexEntryCount({ indexPath: testIndexPath });
      expect(count).toBe(1000);

      const readStartTime = Date.now();
      const entry500 = await getIndexEntry({ indexPath: testIndexPath, entryIndex: 499 });
      const readTime = Date.now() - readStartTime;

      expect(entry500?.lineNumberLocal).toBe(500);
      expect(readTime).toBeLessThan(10);

      console.log(`Write 1000 entries: ${writeTime}ms, Random read: ${readTime}ms`);
    });

    it('should efficiently read entries in batches', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      for (let i = 0; i < 500; i++) {
        await appendIndexEntry({
          indexPath: testIndexPath,
          entry: {
            fileNumber: 1,
            lineNumberLocal: i + 1,
            lineNumberGlobal: BigInt(i + 1),
            startByte: BigInt(i * 150),
            endByte: BigInt((i + 1) * 150),
            messageTime: BigInt(i * 1000),
            timeSource: 'created',
          },
        });
      }

      const batch1 = await readIndexEntries({ indexPath: testIndexPath, fromIndex: 0, count: 100 });
      const batch2 = await readIndexEntries({
        indexPath: testIndexPath,
        fromIndex: 100,
        count: 100,
      });
      const batch3 = await readIndexEntries({
        indexPath: testIndexPath,
        fromIndex: 200,
        count: 100,
      });

      expect(batch1).toHaveLength(100);
      expect(batch2).toHaveLength(100);
      expect(batch3).toHaveLength(100);

      expect(batch1[0]?.lineNumberLocal).toBe(1);
      expect(batch2[0]?.lineNumberLocal).toBe(101);
      expect(batch3[0]?.lineNumberLocal).toBe(201);
    });
  });

  describe('data integrity', () => {
    it('should preserve exact byte offsets for large values', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const largeEntry: IndexEntry = {
        fileNumber: 999,
        lineNumberLocal: 123456,
        lineNumberGlobal: 9876543210n,
        startByte: 1234567890123456n,
        endByte: 9876543210987654n,
        messageTime: 1609459200000n,
        timeSource: 'extracted',
      };

      await appendIndexEntry({ indexPath: testIndexPath, entry: largeEntry });

      const readEntry = await getIndexEntry({ indexPath: testIndexPath, entryIndex: 0 });

      expect(readEntry).toEqual(largeEntry);
    });

    it('should maintain entry order and integrity across many operations', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const entries: IndexEntry[] = [];
      for (let i = 0; i < 200; i++) {
        const entry: IndexEntry = {
          fileNumber: 1,
          lineNumberLocal: i + 1,
          lineNumberGlobal: BigInt(i + 1),
          startByte: BigInt(i * 137),
          endByte: BigInt((i + 1) * 137),
          messageTime: BigInt(1609459200000 + i * 1000),
          timeSource: i % 3 === 0 ? 'extracted' : 'created',
        };
        entries.push(entry);
        await appendIndexEntry({ indexPath: testIndexPath, entry });
      }

      for (let i = 0; i < 200; i += 10) {
        const entry = await getIndexEntry({ indexPath: testIndexPath, entryIndex: i });
        expect(entry).toEqual(entries[i]);
      }

      const allEntries = await readIndexEntries({ indexPath: testIndexPath });
      expect(allEntries).toEqual(entries);
    });
  });

  describe('edge cases', () => {
    it('should handle zero byte offsets', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const entry: IndexEntry = {
        fileNumber: 1,
        lineNumberLocal: 1,
        lineNumberGlobal: 1n,
        startByte: 0n,
        endByte: 0n,
        messageTime: 0n,
        timeSource: 'created',
      };

      await appendIndexEntry({ indexPath: testIndexPath, entry });

      const readEntry = await getIndexEntry({ indexPath: testIndexPath, entryIndex: 0 });

      expect(readEntry?.startByte).toBe(0n);
      expect(readEntry?.endByte).toBe(0n);
    });

    it('should handle maximum safe integer values', async () => {
      await createIndexHeader({
        indexPath: testIndexPath,
        fileNumber: 1,
        globalLineOffset: 0n,
      });

      const maxEntry: IndexEntry = {
        fileNumber: 2147483647,
        lineNumberLocal: 2147483647,
        lineNumberGlobal: 18446744073709551615n,
        startByte: 18446744073709551615n,
        endByte: 18446744073709551615n,
        messageTime: 18446744073709551615n,
        timeSource: 'extracted',
      };

      await appendIndexEntry({ indexPath: testIndexPath, entry: maxEntry });

      const readEntry = await getIndexEntry({ indexPath: testIndexPath, entryIndex: 0 });

      expect(readEntry?.fileNumber).toBe(2147483647);
      expect(readEntry?.lineNumberLocal).toBe(2147483647);
    });
  });
});

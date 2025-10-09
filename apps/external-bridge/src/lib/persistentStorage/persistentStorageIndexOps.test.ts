import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getIndexEntryCount, readIndex, readIndexHeader } from './persistentStorageIndex.js';
import {
  readFromLastIndex,
  reindexAllFiles,
  replaceLastRowBasedOnIndex
} from './persistentStorageIndexOps.js';

describe('persistentStorageIndexOps', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-indexops-' + Date.now());
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('reindexAllFiles', () => {
    it('should reindex multiple files with correct global line numbering and index data', async () => {
      const file1Path = join(tempDir, 'file-1.jsonl');
      const file2Path = join(tempDir, 'file-2.jsonl');

      const file1Data = [
        { timestamp: 1000, value: 'data1' },
        { timestamp: 2000, value: 'data2' },
        { timestamp: 3000, value: 'data3' },
      ];

      const file2Data = [
        { timestamp: 4000, value: 'data4' },
        { timestamp: 5000, value: 'data5' },
      ];

      await writeFile(file1Path, file1Data.map((d) => JSON.stringify(d)).join('\n') + '\n');
      await writeFile(file2Path, file2Data.map((d) => JSON.stringify(d)).join('\n') + '\n');

      const listAllFiles = async () => [file1Path, file2Path];

      await reindexAllFiles(listAllFiles);

      const index1 = await readIndex({ indexPath: file1Path });
      const index2 = await readIndex({ indexPath: file2Path });

      expect(index1).not.toBeNull();
      expect(index2).not.toBeNull();

      expect(index1?.header.fileNumber).toBe(1);
      expect(index1?.header.globalLineOffset).toBe(0n);
      expect(index1?.entries).toHaveLength(3);
      expect(index1?.entries[0]?.lineNumberLocal).toBe(1);
      expect(index1?.entries[0]?.lineNumberGlobal).toBe(1n);
      expect(index1?.entries[0]?.messageTime).toBe(1000n);
      expect(index1?.entries[0]?.timeSource).toBe('created');
      expect(index1?.entries[2]?.lineNumberLocal).toBe(3);
      expect(index1?.entries[2]?.lineNumberGlobal).toBe(3n);
      expect(index1?.entries[2]?.messageTime).toBe(3000n);

      expect(index2?.header.fileNumber).toBe(2);
      expect(index2?.header.globalLineOffset).toBe(3n);
      expect(index2?.entries).toHaveLength(2);
      expect(index2?.entries[0]?.lineNumberLocal).toBe(1);
      expect(index2?.entries[0]?.lineNumberGlobal).toBe(4n);
      expect(index2?.entries[0]?.messageTime).toBe(4000n);
      expect(index2?.entries[0]?.timeSource).toBe('created');
      expect(index2?.entries[1]?.lineNumberLocal).toBe(2);
      expect(index2?.entries[1]?.lineNumberGlobal).toBe(5n);
      expect(index2?.entries[1]?.messageTime).toBe(5000n);

      const count1 = await getIndexEntryCount({ indexPath: file1Path });
      const count2 = await getIndexEntryCount({ indexPath: file2Path });
      expect(count1).toBe(3);
      expect(count2).toBe(2);

      const header1 = await readIndexHeader({ indexPath: file1Path });
      const header2 = await readIndexHeader({ indexPath: file2Path });
      expect(header1?.version).toBe(1);
      expect(header2?.version).toBe(1);
    });
  });

  describe('readFromLastIndex', () => {
    it('should read the last entry from an indexed file', async () => {
      const filePath = join(tempDir, 'file-1.jsonl');

      const fileData = [
        { timestamp: 1000, value: 'data1' },
        { timestamp: 2000, value: 'data2' },
        { timestamp: 3000, value: 'data3' },
      ];

      await writeFile(filePath, fileData.map((d) => JSON.stringify(d)).join('\n') + '\n');

      const listAllFiles = async () => [filePath];
      await reindexAllFiles(listAllFiles);

      const lastData = await readFromLastIndex<{ timestamp: number; value: string }>(filePath);

      expect(lastData).not.toBeNull();
      expect(lastData?.timestamp).toBe(3000);
      expect(lastData?.value).toBe('data3');
    });

    it('should return null for a file with no index entries', async () => {
      const filePath = join(tempDir, 'empty-file.jsonl');
      await writeFile(filePath, '');

      const listAllFiles = async () => [filePath];
      await reindexAllFiles(listAllFiles);

      const lastData = await readFromLastIndex(filePath);

      expect(lastData).toBeNull();
    });

    it('should return null for a non-existent file', async () => {
      const filePath = join(tempDir, 'non-existent.jsonl');

      const lastData = await readFromLastIndex(filePath);

      expect(lastData).toBeNull();
    });
  });

  describe('replaceLastInIndex', () => {
    it('should replace the last record in an indexed file', async () => {
      const filePath = join(tempDir, 'file-1.jsonl');

      const fileData = [
        { timestamp: 1000, value: 'data1' },
        { timestamp: 2000, value: 'data2' },
        { timestamp: 3000, value: 'data3' },
      ];

      await writeFile(filePath, fileData.map((d) => JSON.stringify(d)).join('\n') + '\n');

      const listAllFiles = async () => [filePath];
      await reindexAllFiles(listAllFiles);

      const newRecord = { timestamp: 3500, value: 'data3-replaced' };
      await replaceLastRowBasedOnIndex(filePath, newRecord);

      const fileContent = await readFile(filePath, 'utf-8');
      const lines = fileContent.trim().split('\n');

      expect(lines).toHaveLength(3);
      expect(JSON.parse(lines[0]!)).toEqual({ timestamp: 1000, value: 'data1' });
      expect(JSON.parse(lines[1]!)).toEqual({ timestamp: 2000, value: 'data2' });
      expect(JSON.parse(lines[2]!)).toEqual({ timestamp: 3500, value: 'data3-replaced' });
    });

    it('should throw error when trying to replace in empty file', async () => {
      const filePath = join(tempDir, 'empty-file.jsonl');
      await writeFile(filePath, '');

      const listAllFiles = async () => [filePath];
      await reindexAllFiles(listAllFiles);

      await expect(
        replaceLastRowBasedOnIndex(filePath, { timestamp: 1000, value: 'data' }),
      ).rejects.toThrow('Cannot replace last record in empty file');
    });

    it('should throw error for non-existent file', async () => {
      const filePath = join(tempDir, 'non-existent.jsonl');

      await expect(
        replaceLastRowBasedOnIndex(filePath, { timestamp: 1000, value: 'data' }),
      ).rejects.toThrow('Cannot replace last record in empty file');
    });
  });
});

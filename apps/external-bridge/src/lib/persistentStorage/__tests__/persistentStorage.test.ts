import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPersistentStorage } from '../persistentStorage.js';

describe('createPersistentStorage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-storage-' + Date.now());
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('writeRecord', () => {
    it('should write a record to a file', async () => {
      const storage = createPersistentStorage(tempDir);

      const record = {
        timestamp: Date.now(),
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '123', value: 100 },
      };

      await storage.writeRecord({
        record,
        subIndexDir: 'BTCUSDT',
      });

      const filePath = join(tempDir, 'BTCUSDT', '00000000000000000000000000000000.jsonl');
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content.trim());

      expect(parsed).toEqual(record);
    });

    it('should overwrite existing file when writing', async () => {
      const storage = createPersistentStorage(tempDir);

      const firstRecord = {
        timestamp: 1000,
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '1', value: 100 },
      };

      const secondRecord = {
        timestamp: 2000,
        request: { query: { symbol: 'ETHUSDT' } },
        response: { id: '2', value: 200 },
      };

      await storage.writeRecord({
        record: firstRecord,
        subIndexDir: 'BTCUSDT',
      });

      await storage.writeRecord({
        record: secondRecord,
        subIndexDir: 'BTCUSDT',
      });

      const filePath = join(tempDir, 'BTCUSDT', '00000000000000000000000000000000.jsonl');
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toEqual(secondRecord);
    });

    it('should create directories if they do not exist', async () => {
      const storage = createPersistentStorage(tempDir);

      const record = {
        timestamp: Date.now(),
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '123', value: 100 },
      };

      await storage.writeRecord({
        record,
        subIndexDir: 'nested/deep/path',
      });

      const filePath = join(tempDir, 'nested/deep/path', '00000000000000000000000000000000.jsonl');
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content.trim());

      expect(parsed).toEqual(record);
    });
  });

  describe('appendRecord', () => {
    it('should append a record to a file', async () => {
      const storage = createPersistentStorage(tempDir);

      const firstRecord = {
        timestamp: 1000,
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '1', value: 100 },
      };

      const secondRecord = {
        timestamp: 2000,
        request: { query: { symbol: 'ETHUSDT' } },
        response: { id: '2', value: 200 },
      };

      await storage.appendRecord({
        record: firstRecord,
        subIndexDir: 'BTCUSDT',
      });

      await storage.appendRecord({
        record: secondRecord,
        subIndexDir: 'BTCUSDT',
      });

      const filePath = join(tempDir, 'BTCUSDT', '00000000000000000000000000000000.jsonl');
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual(firstRecord);
      expect(JSON.parse(lines[1])).toEqual(secondRecord);
    });

    it('should create file if it does not exist', async () => {
      const storage = createPersistentStorage(tempDir);

      const record = {
        timestamp: Date.now(),
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '123', value: 100 },
      };

      await storage.appendRecord({
        record,
        subIndexDir: 'BTCUSDT',
      });

      const filePath = join(tempDir, 'BTCUSDT', '00000000000000000000000000000000.jsonl');
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content.trim());

      expect(parsed).toEqual(record);
    });

    it('should create directories if they do not exist', async () => {
      const storage = createPersistentStorage(tempDir);

      const record = {
        timestamp: Date.now(),
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '123', value: 100 },
      };

      await storage.appendRecord({
        record,
        subIndexDir: 'nested/deep/path',
      });

      const filePath = join(tempDir, 'nested/deep/path', '00000000000000000000000000000000.jsonl');
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content.trim());

      expect(parsed).toEqual(record);
    });
  });

  describe('readRecords', () => {
    it('should read records from a file', async () => {
      const storage = createPersistentStorage(tempDir);

      const records = [
        {
          timestamp: 1000,
          request: { query: { symbol: 'BTCUSDT' } },
          response: { id: '1', value: 100 },
        },
        {
          timestamp: 2000,
          request: { query: { symbol: 'ETHUSDT' } },
          response: { id: '2', value: 200 },
        },
      ];

      for (const record of records) {
        await storage.appendRecord({
          record,
          subIndexDir: 'BTCUSDT',
        });
      }

      const result = await storage.readRecords({
        subIndexDir: 'BTCUSDT',
        fileName: '00000000000000000000000000000000',
      });

      expect(result).toEqual(records);
    });

    it('should return empty array if file does not exist', async () => {
      const storage = createPersistentStorage(tempDir);

      const result = await storage.readRecords({
        subIndexDir: 'nonexistent',
        fileName: '00000000000000000000000000000000',
      });

      expect(result).toEqual([]);
    });

    it('should handle empty files', async () => {
      const storage = createPersistentStorage(tempDir);
      const filePath = join(tempDir, 'BTCUSDT', '00000000000000000000000000000000.jsonl');

      await mkdir(join(tempDir, 'BTCUSDT'), { recursive: true });
      await writeFile(filePath, '', 'utf-8');

      const result = await storage.readRecords({
        subIndexDir: 'BTCUSDT',
        fileName: '00000000000000000000000000000000',
      });

      expect(result).toEqual([]);
    });

    it('should filter out empty lines', async () => {
      const storage = createPersistentStorage(tempDir);
      const filePath = join(tempDir, 'BTCUSDT', '00000000000000000000000000000000.jsonl');

      const records = [
        {
          timestamp: 1000,
          request: { query: { symbol: 'BTCUSDT' } },
          response: { id: '1', value: 100 },
        },
        {
          timestamp: 2000,
          request: { query: { symbol: 'ETHUSDT' } },
          response: { id: '2', value: 200 },
        },
      ];

      await mkdir(join(tempDir, 'BTCUSDT'), { recursive: true });
      await writeFile(
        filePath,
        records.map((r) => JSON.stringify(r)).join('\n') + '\n\n\n',
        'utf-8',
      );

      const result = await storage.readRecords({
        subIndexDir: 'BTCUSDT',
        fileName: '00000000000000000000000000000000',
      });

      expect(result).toEqual(records);
    });

    it('should throw error for non-ENOENT errors', async () => {
      const storage = createPersistentStorage(tempDir);
      const filePath = join(tempDir, 'BTCUSDT', '00000000000000000000000000000000.jsonl');

      await mkdir(join(tempDir, 'BTCUSDT'), { recursive: true });
      await writeFile(filePath, 'invalid json', 'utf-8');

      await expect(
        storage.readRecords({
          subIndexDir: 'BTCUSDT',
          fileName: '00000000000000000000000000000000',
        }),
      ).rejects.toThrow();
    });
  });

  describe('readLastRecord', () => {
    it('should read only the last record from a file', async () => {
      const storage = createPersistentStorage(tempDir);

      const records = [
        {
          timestamp: 1000,
          request: { query: { symbol: 'BTCUSDT' } },
          response: { id: '1', value: 100 },
        },
        {
          timestamp: 2000,
          request: { query: { symbol: 'ETHUSDT' } },
          response: { id: '2', value: 200 },
        },
        {
          timestamp: 3000,
          request: { query: { symbol: 'BNBUSDT' } },
          response: { id: '3', value: 300 },
        },
      ];

      for (const record of records) {
        await storage.appendRecord({
          record,
          subIndexDir: 'BTCUSDT',
        });
      }

      const result = await storage.readLastRecord('BTCUSDT');

      expect(result).toEqual(records[2]);
    });

    it('should return null if file does not exist', async () => {
      const storage = createPersistentStorage(tempDir);

      const result = await storage.readLastRecord('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null for empty files', async () => {
      const storage = createPersistentStorage(tempDir);
      const filePath = join(tempDir, 'BTCUSDT', '00000000000000000000000000000000.jsonl');

      await mkdir(join(tempDir, 'BTCUSDT'), { recursive: true });
      await writeFile(filePath, '', 'utf-8');

      const result = await storage.readLastRecord('BTCUSDT');

      expect(result).toBeNull();
    });

    it('should handle single record files', async () => {
      const storage = createPersistentStorage(tempDir);

      const record = {
        timestamp: 1000,
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '1', value: 100 },
      };

      await storage.appendRecord({
        record,
        subIndexDir: 'BTCUSDT',
      });

      const result = await storage.readLastRecord('BTCUSDT');

      expect(result).toEqual(record);
    });

    it('should handle large files efficiently', async () => {
      const storage = createPersistentStorage(tempDir);

      for (let i = 0; i < 1000; i++) {
        await storage.appendRecord({
          record: {
            timestamp: i,
            request: { query: { symbol: 'BTCUSDT' } },
            response: { id: `${i}`, value: i },
          },
          subIndexDir: 'BTCUSDT',
        });
      }

      const result = await storage.readLastRecord('BTCUSDT');

      expect(result).toEqual({
        timestamp: 999,
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '999', value: 999 },
      });
    });

    it('should handle files with trailing newlines', async () => {
      const storage = createPersistentStorage(tempDir);

      const records = [
        {
          timestamp: 1000,
          request: { query: { symbol: 'BTCUSDT' } },
          response: { id: '1', value: 100 },
        },
        {
          timestamp: 2000,
          request: { query: { symbol: 'ETHUSDT' } },
          response: { id: '2', value: 200 },
        },
      ];

      // Use the storage API to write records, which creates indexes
      for (const record of records) {
        await storage.appendRecord({
          record,
          subIndexDir: 'BTCUSDT',
        });
      }

      const result = await storage.readLastRecord('BTCUSDT');

      expect(result).toEqual(records[1]);
    });
  });

  describe('replaceLastRecord', () => {
    it('should replace the last record in a file', async () => {
      const storage = createPersistentStorage(tempDir);

      const records = [
        {
          timestamp: 1000,
          request: { query: { symbol: 'BTCUSDT' } },
          response: { id: '1', value: 100 },
        },
        {
          timestamp: 2000,
          request: { query: { symbol: 'ETHUSDT' } },
          response: { id: '2', value: 200 },
        },
        {
          timestamp: 3000,
          request: { query: { symbol: 'BNBUSDT' } },
          response: { id: '3', value: 300 },
        },
      ];

      for (const record of records) {
        await storage.appendRecord({
          record,
          subIndexDir: 'BTCUSDT',
        });
      }

      const newLastRecord = {
        timestamp: 4000,
        request: { query: { symbol: 'ADAUSDT' } },
        response: { id: '4', value: 400 },
      };

      await storage.replaceLastRecord({
        record: newLastRecord,
        subIndexDir: 'BTCUSDT',
      });

      const allRecords = await storage.readRecords({
        subIndexDir: 'BTCUSDT',
        fileName: '00000000000000000000000000000000',
      });

      expect(allRecords).toHaveLength(3);
      expect(allRecords[0]).toEqual(records[0]);
      expect(allRecords[1]).toEqual(records[1]);
      expect(allRecords[2]).toEqual(newLastRecord);
    });

    it('should replace last record in single record file', async () => {
      const storage = createPersistentStorage(tempDir);

      const record = {
        timestamp: 1000,
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '1', value: 100 },
      };

      await storage.appendRecord({
        record,
        subIndexDir: 'BTCUSDT',
      });

      const newRecord = {
        timestamp: 2000,
        request: { query: { symbol: 'ETHUSDT' } },
        response: { id: '2', value: 200 },
      };

      await storage.replaceLastRecord({
        record: newRecord,
        subIndexDir: 'BTCUSDT',
      });

      const allRecords = await storage.readRecords({
        subIndexDir: 'BTCUSDT',
        fileName: '00000000000000000000000000000000',
      });

      expect(allRecords).toHaveLength(1);
      expect(allRecords[0]).toEqual(newRecord);
    });

    it('should throw error when replacing in empty file', async () => {
      const storage = createPersistentStorage(tempDir);
      const filePath = join(tempDir, 'BTCUSDT', '00000000000000000000000000000000.jsonl');

      await mkdir(join(tempDir, 'BTCUSDT'), { recursive: true });
      await writeFile(filePath, '\n', 'utf-8');

      await expect(
        storage.replaceLastRecord({
          record: {
            timestamp: 1000,
            request: { query: { symbol: 'BTCUSDT' } },
            response: { id: '1', value: 100 },
          },
          subIndexDir: 'BTCUSDT',
        }),
      ).rejects.toThrow('Cannot replace last record in empty file');
    });

    it('should throw error when replacing in non-existent file', async () => {
      const storage = createPersistentStorage(tempDir);

      await expect(
        storage.replaceLastRecord({
          record: {
            timestamp: 1000,
            request: { query: { symbol: 'BTCUSDT' } },
            response: { id: '1', value: 100 },
          },
          subIndexDir: 'nonexistent',
        }),
      ).rejects.toThrow('Cannot replace last record in empty file');
    });
  });

  describe('type inference', () => {
    it('should properly type request and response based on endpoint definition', async () => {
      const storage = createPersistentStorage(tempDir);

      const record = {
        timestamp: Date.now(),
        request: { query: { symbol: 'BTCUSDT' } },
        response: { symbol: 'BTCUSDT', bidPrice: '50000', askPrice: '50001' },
      };

      await storage.writeRecord({
        record,
        subIndexDir: 'BTCUSDT',
      });

      const records = await storage.readRecords({
        subIndexDir: 'BTCUSDT',
        fileName: '00000000000000000000000000000000',
      });

      expect(records[0]).toEqual(record);
    });
  });

  describe('file path generation', () => {
    it('should append .jsonl extension to file paths', async () => {
      const storage = createPersistentStorage(tempDir);

      const record = {
        timestamp: Date.now(),
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '123', value: 100 },
      };

      await storage.writeRecord({
        record,
        subIndexDir: 'BTCUSDT',
      });

      const filePath = join(tempDir, 'BTCUSDT', '00000000000000000000000000000000.jsonl');
      const content = await readFile(filePath, 'utf-8');

      expect(content).toBeTruthy();
    });

    it('should handle subdirectory paths correctly', async () => {
      const storage = createPersistentStorage(tempDir);

      const record = {
        timestamp: Date.now(),
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '123', value: 100 },
      };

      await storage.writeRecord({
        record,
        subIndexDir: 'a/b/c/d/e',
      });

      const filePath = join(tempDir, 'a/b/c/d/e', '00000000000000000000000000000000.jsonl');
      const content = await readFile(filePath, 'utf-8');

      expect(content).toBeTruthy();
    });
  });
});

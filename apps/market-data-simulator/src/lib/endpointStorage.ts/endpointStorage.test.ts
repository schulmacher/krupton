import { TB } from '@krupton/service-framework-node/typebox';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEndpointStorage } from './endpointStorage.js';
import type { EndpointDefinition } from '@krupton/api-client-node';

describe('createEndpointStorage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-storage-' + Date.now());
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const testEndpoint = {
    path: '/api/v3/test',
    method: 'GET',
    querySchema: TB.Object({
      symbol: TB.String(),
    }),
    responseSchema: TB.Object({
      id: TB.String(),
      value: TB.Number(),
    }),
  } satisfies EndpointDefinition;

  describe('endpoint path normalization', () => {
    it('should normalize endpoint path by removing leading slashes and replacing slashes with underscores', () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      expect(storage.normalizedEndpoint).toBe('api_v3_test');
      expect(storage.endpointPath).toBe('/api/v3/test');
    });

    it('should handle endpoints without leading slash', () => {
      const endpoint = {
        path: 'api/v3/test',
        method: 'GET',
        responseSchema: TB.Object({ id: TB.String() }),
      } satisfies EndpointDefinition;

      const storage = createEndpointStorage(tempDir, endpoint);

      expect(storage.normalizedEndpoint).toBe('api_v3_test');
    });

    it('should handle endpoints with multiple leading slashes', () => {
      const endpoint = {
        path: '///api/v3/test',
        method: 'GET',
        responseSchema: TB.Object({ id: TB.String() }),
      } satisfies EndpointDefinition;

      const storage = createEndpointStorage(tempDir, endpoint);

      expect(storage.normalizedEndpoint).toBe('api_v3_test');
    });
  });

  describe('writeRecord', () => {
    it('should write a record to a file', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      const record = {
        timestamp: Date.now(),
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '123', value: 100 },
      };

      await storage.writeRecord({
        record,
        relativePath: 'test/data',
      });

      const filePath = join(tempDir, 'api_v3_test', 'test/data.jsonl');
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content.trim());

      expect(parsed).toEqual(record);
    });

    it('should overwrite existing file when writing', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

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
        relativePath: 'test/data',
      });

      await storage.writeRecord({
        record: secondRecord,
        relativePath: 'test/data',
      });

      const filePath = join(tempDir, 'api_v3_test', 'test/data.jsonl');
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toEqual(secondRecord);
    });

    it('should create directories if they do not exist', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      const record = {
        timestamp: Date.now(),
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '123', value: 100 },
      };

      await storage.writeRecord({
        record,
        relativePath: 'nested/deep/path/data',
      });

      const filePath = join(tempDir, 'api_v3_test', 'nested/deep/path/data.jsonl');
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content.trim());

      expect(parsed).toEqual(record);
    });
  });

  describe('appendRecord', () => {
    it('should append a record to a file', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

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
        relativePath: 'test/data',
      });

      await storage.appendRecord({
        record: secondRecord,
        relativePath: 'test/data',
      });

      const filePath = join(tempDir, 'api_v3_test', 'test/data.jsonl');
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual(firstRecord);
      expect(JSON.parse(lines[1])).toEqual(secondRecord);
    });

    it('should create file if it does not exist', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      const record = {
        timestamp: Date.now(),
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '123', value: 100 },
      };

      await storage.appendRecord({
        record,
        relativePath: 'test/data',
      });

      const filePath = join(tempDir, 'api_v3_test', 'test/data.jsonl');
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content.trim());

      expect(parsed).toEqual(record);
    });

    it('should create directories if they do not exist', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      const record = {
        timestamp: Date.now(),
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '123', value: 100 },
      };

      await storage.appendRecord({
        record,
        relativePath: 'nested/deep/path/data',
      });

      const filePath = join(tempDir, 'api_v3_test', 'nested/deep/path/data.jsonl');
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content.trim());

      expect(parsed).toEqual(record);
    });
  });

  describe('readRecords', () => {
    it('should read records from a file', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

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
          relativePath: 'test/data',
        });
      }

      const result = await storage.readRecords({
        relativePath: 'test/data',
      });

      expect(result).toEqual(records);
    });

    it('should return empty array if file does not exist', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      const result = await storage.readRecords({
        relativePath: 'nonexistent/data',
      });

      expect(result).toEqual([]);
    });

    it('should handle empty files', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);
      const filePath = join(tempDir, 'api_v3_test', 'test/empty.jsonl');

      await mkdir(join(tempDir, 'api_v3_test', 'test'), { recursive: true });
      await writeFile(filePath, '', 'utf-8');

      const result = await storage.readRecords({
        relativePath: 'test/empty',
      });

      expect(result).toEqual([]);
    });

    it('should filter out empty lines', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);
      const filePath = join(tempDir, 'api_v3_test', 'test/data.jsonl');

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

      await mkdir(join(tempDir, 'api_v3_test', 'test'), { recursive: true });
      await writeFile(
        filePath,
        records.map((r) => JSON.stringify(r)).join('\n') + '\n\n\n',
        'utf-8',
      );

      const result = await storage.readRecords({
        relativePath: 'test/data',
      });

      expect(result).toEqual(records);
    });

    it('should throw error for non-ENOENT errors', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);
      const filePath = join(tempDir, 'api_v3_test', 'test/data.jsonl');

      await mkdir(join(tempDir, 'api_v3_test', 'test'), { recursive: true });
      await writeFile(filePath, 'invalid json', 'utf-8');

      await expect(
        storage.readRecords({
          relativePath: 'test/data',
        }),
      ).rejects.toThrow();
    });
  });

  describe('readLastRecord', () => {
    it('should read only the last record from a file', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

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
          relativePath: 'test/data',
        });
      }

      const result = await storage.readLastRecord({
        relativePath: 'test/data',
      });

      expect(result).toEqual(records[2]);
    });

    it('should return null if file does not exist', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      const result = await storage.readLastRecord({
        relativePath: 'nonexistent/data',
      });

      expect(result).toBeNull();
    });

    it('should return null for empty files', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);
      const filePath = join(tempDir, 'api_v3_test', 'test/empty.jsonl');

      await mkdir(join(tempDir, 'api_v3_test', 'test'), { recursive: true });
      await writeFile(filePath, '', 'utf-8');

      const result = await storage.readLastRecord({
        relativePath: 'test/empty',
      });

      expect(result).toBeNull();
    });

    it('should handle single record files', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      const record = {
        timestamp: 1000,
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '1', value: 100 },
      };

      await storage.appendRecord({
        record,
        relativePath: 'test/data',
      });

      const result = await storage.readLastRecord({
        relativePath: 'test/data',
      });

      expect(result).toEqual(record);
    });

    it('should handle large files efficiently', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      for (let i = 0; i < 1000; i++) {
        await storage.appendRecord({
          record: {
            timestamp: i,
            request: { query: { symbol: 'BTCUSDT' } },
            response: { id: `${i}`, value: i },
          },
          relativePath: 'test/large',
        });
      }

      const result = await storage.readLastRecord({
        relativePath: 'test/large',
      });

      expect(result).toEqual({
        timestamp: 999,
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '999', value: 999 },
      });
    });

    it('should handle files with trailing newlines', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);
      const filePath = join(tempDir, 'api_v3_test', 'test/data.jsonl');

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

      await mkdir(join(tempDir, 'api_v3_test', 'test'), { recursive: true });
      await writeFile(
        filePath,
        records.map((r) => JSON.stringify(r)).join('\n') + '\n\n\n',
        'utf-8',
      );

      const result = await storage.readLastRecord({
        relativePath: 'test/data',
      });

      expect(result).toEqual(records[1]);
    });
  });

  describe('replaceLastRecord', () => {
    it('should replace the last record in a file', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

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
          relativePath: 'test/data',
        });
      }

      const newLastRecord = {
        timestamp: 4000,
        request: { query: { symbol: 'ADAUSDT' } },
        response: { id: '4', value: 400 },
      };

      await storage.replaceLastRecord({
        record: newLastRecord,
        relativePath: 'test/data',
      });

      const allRecords = await storage.readRecords({
        relativePath: 'test/data',
      });

      expect(allRecords).toHaveLength(3);
      expect(allRecords[0]).toEqual(records[0]);
      expect(allRecords[1]).toEqual(records[1]);
      expect(allRecords[2]).toEqual(newLastRecord);
    });

    it('should replace last record in single record file', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      const record = {
        timestamp: 1000,
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '1', value: 100 },
      };

      await storage.appendRecord({
        record,
        relativePath: 'test/data',
      });

      const newRecord = {
        timestamp: 2000,
        request: { query: { symbol: 'ETHUSDT' } },
        response: { id: '2', value: 200 },
      };

      await storage.replaceLastRecord({
        record: newRecord,
        relativePath: 'test/data',
      });

      const allRecords = await storage.readRecords({
        relativePath: 'test/data',
      });

      expect(allRecords).toHaveLength(1);
      expect(allRecords[0]).toEqual(newRecord);
    });

    it('should throw error when replacing in empty file', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);
      const filePath = join(tempDir, 'api_v3_test', 'test/empty.jsonl');

      await mkdir(join(tempDir, 'api_v3_test', 'test'), { recursive: true });
      await writeFile(filePath, '\n', 'utf-8');

      await expect(
        storage.replaceLastRecord({
          record: {
            timestamp: 1000,
            request: { query: { symbol: 'BTCUSDT' } },
            response: { id: '1', value: 100 },
          },
          relativePath: 'test/empty',
        }),
      ).rejects.toThrow('Cannot replace last record in empty file');
    });

    it('should throw error when replacing in non-existent file', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      await expect(
        storage.replaceLastRecord({
          record: {
            timestamp: 1000,
            request: { query: { symbol: 'BTCUSDT' } },
            response: { id: '1', value: 100 },
          },
          relativePath: 'nonexistent/data',
        }),
      ).rejects.toThrow('Cannot replace last record in non-existent file');
    });

    it('should handle replacing in files with trailing newlines', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);
      const filePath = join(tempDir, 'api_v3_test', 'test/data.jsonl');

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

      await mkdir(join(tempDir, 'api_v3_test', 'test'), { recursive: true });
      await writeFile(
        filePath,
        records.map((r) => JSON.stringify(r)).join('\n') + '\n',
        'utf-8',
      );

      const newLastRecord = {
        timestamp: 3000,
        request: { query: { symbol: 'BNBUSDT' } },
        response: { id: '3', value: 300 },
      };

      await storage.replaceLastRecord({
        record: newLastRecord,
        relativePath: 'test/data',
      });

      const allRecords = await storage.readRecords({
        relativePath: 'test/data',
      });

      expect(allRecords).toHaveLength(2);
      expect(allRecords[0]).toEqual(records[0]);
      expect(allRecords[1]).toEqual(newLastRecord);
    });
  });

  describe('getFileInfo', () => {
    it('should return file info with record count', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

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
          relativePath: 'test/data',
        });
      }

      const fileInfo = await storage.getFileInfo({
        relativePath: 'test/data',
      });

      expect(fileInfo).toEqual({
        idx: 'test/data',
        recordCount: 3,
      });
    });

    it('should return null if file does not exist', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      const fileInfo = await storage.getFileInfo({
        relativePath: 'nonexistent/data',
      });

      expect(fileInfo).toBeNull();
    });

    it('should return 0 count for empty file', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);
      const filePath = join(tempDir, 'api_v3_test', 'test/empty.jsonl');

      await mkdir(join(tempDir, 'api_v3_test', 'test'), { recursive: true });
      await writeFile(filePath, '', 'utf-8');

      const fileInfo = await storage.getFileInfo({
        relativePath: 'test/empty',
      });

      expect(fileInfo).toEqual({
        idx: 'test/empty',
        recordCount: 0,
      });
    });

    it('should filter out empty lines when counting', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);
      const filePath = join(tempDir, 'api_v3_test', 'test/data.jsonl');

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

      await mkdir(join(tempDir, 'api_v3_test', 'test'), { recursive: true });
      await writeFile(
        filePath,
        records.map((r) => JSON.stringify(r)).join('\n') + '\n\n\n',
        'utf-8',
      );

      const fileInfo = await storage.getFileInfo({
        relativePath: 'test/data',
      });

      expect(fileInfo).toEqual({
        idx: 'test/data',
        recordCount: 2,
      });
    });

    it('should count lines even with invalid JSON content', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);
      const filePath = join(tempDir, 'api_v3_test', 'test/data.jsonl');

      await mkdir(join(tempDir, 'api_v3_test', 'test'), { recursive: true });
      await writeFile(filePath, 'line1\nline2\nline3', 'utf-8');

      const fileInfo = await storage.getFileInfo({
        relativePath: 'test/data',
      });

      expect(fileInfo).toEqual({
        idx: 'test/data',
        recordCount: 3,
      });
    });
  });

  describe('listFileNames', () => {
    it('should list jsonl files in a directory', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);
      const indexPath = 'test/symbols';

      await mkdir(join(tempDir, 'api_v3_test', indexPath), { recursive: true });
      await writeFile(join(tempDir, 'api_v3_test', indexPath, 'BTCUSDT.jsonl'), '', 'utf-8');
      await writeFile(join(tempDir, 'api_v3_test', indexPath, 'ETHUSDT.jsonl'), '', 'utf-8');
      await writeFile(join(tempDir, 'api_v3_test', indexPath, 'BNBUSDT.jsonl'), '', 'utf-8');

      const fileNames = await storage.listFileNames(indexPath);

      expect(fileNames).toContain('BTCUSDT');
      expect(fileNames).toContain('ETHUSDT');
      expect(fileNames).toContain('BNBUSDT');
      expect(fileNames).toHaveLength(3);
    });

    it('should only list jsonl files and ignore other files', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);
      const indexPath = 'test/symbols';

      await mkdir(join(tempDir, 'api_v3_test', indexPath), { recursive: true });
      await writeFile(join(tempDir, 'api_v3_test', indexPath, 'BTCUSDT.jsonl'), '', 'utf-8');
      await writeFile(join(tempDir, 'api_v3_test', indexPath, 'ETHUSDT.json'), '', 'utf-8');
      await writeFile(join(tempDir, 'api_v3_test', indexPath, 'README.txt'), '', 'utf-8');
      await writeFile(join(tempDir, 'api_v3_test', indexPath, 'data.csv'), '', 'utf-8');

      const fileNames = await storage.listFileNames(indexPath);

      expect(fileNames).toEqual(['BTCUSDT']);
      expect(fileNames).toHaveLength(1);
    });

    it('should return empty array if directory does not exist', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      const fileNames = await storage.listFileNames('nonexistent/directory');

      expect(fileNames).toEqual([]);
    });

    it('should return empty array for empty directory', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);
      const indexPath = 'test/empty';

      await mkdir(join(tempDir, 'api_v3_test', indexPath), { recursive: true });

      const fileNames = await storage.listFileNames(indexPath);

      expect(fileNames).toEqual([]);
    });

    it('should strip .jsonl extension from file names', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);
      const indexPath = 'test/symbols';

      await mkdir(join(tempDir, 'api_v3_test', indexPath), { recursive: true });
      await writeFile(join(tempDir, 'api_v3_test', indexPath, 'BTCUSDT.jsonl'), '', 'utf-8');

      const fileNames = await storage.listFileNames(indexPath);

      expect(fileNames[0]).toBe('BTCUSDT');
      expect(fileNames[0]).not.toContain('.jsonl');
    });
  });

  describe('type inference', () => {
    it('should properly type request and response based on endpoint definition', async () => {
      const endpoint = {
        path: '/api/v3/ticker/bookTicker',
        method: 'GET',
        querySchema: TB.Object({
          symbol: TB.String(),
        }),
        responseSchema: TB.Object({
          symbol: TB.String(),
          bidPrice: TB.String(),
          askPrice: TB.String(),
        }),
      } satisfies EndpointDefinition;

      const storage = createEndpointStorage(tempDir, endpoint);

      const record = {
        timestamp: Date.now(),
        request: { query: { symbol: 'BTCUSDT' } },
        response: { symbol: 'BTCUSDT', bidPrice: '50000', askPrice: '50001' },
      };

      await storage.writeRecord({
        record,
        relativePath: 'test/data',
      });

      const records = await storage.readRecords({
        relativePath: 'test/data',
      });

      expect(records[0]).toEqual(record);
    });
  });

  describe('file path generation', () => {
    it('should append .jsonl extension to file paths', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      const record = {
        timestamp: Date.now(),
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '123', value: 100 },
      };

      await storage.writeRecord({
        record,
        relativePath: 'test/data',
      });

      const filePath = join(tempDir, 'api_v3_test', 'test/data.jsonl');
      const content = await readFile(filePath, 'utf-8');

      expect(content).toBeTruthy();
    });

    it('should handle relative paths correctly', async () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      const record = {
        timestamp: Date.now(),
        request: { query: { symbol: 'BTCUSDT' } },
        response: { id: '123', value: 100 },
      };

      await storage.writeRecord({
        record,
        relativePath: 'a/b/c/d/e',
      });

      const filePath = join(tempDir, 'api_v3_test', 'a/b/c/d/e.jsonl');
      const content = await readFile(filePath, 'utf-8');

      expect(content).toBeTruthy();
    });
  });
});

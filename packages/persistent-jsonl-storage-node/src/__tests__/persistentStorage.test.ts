import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPersistentStorage, normalizeIndexDir } from '../persistentStorage.js';
import { readIndex } from '../persistentStorageIndex.js';

describe('createPersistentStorage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-storage-' + Date.now());
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('appendRecord', () => {
    it('should create file with correct 0-based indexing', async () => {
      const storage = createPersistentStorage(tempDir);

      const records = [
        { timestamp: 1000, id: 1, data: 'Record 1' },
        { timestamp: 2000, id: 2, data: 'Record 2' },
        { timestamp: 3000, id: 3, data: 'Record 3' },
      ];

      for (const record of records) {
        await storage.appendRecord({
          record,
          subIndexDir: 'test',
        });
      }

      const filePath = join(tempDir, 'test', '00000000000000000000000000000000.jsonl');
      const index = await readIndex({ indexPath: filePath });

      expect(index).toBeDefined();
      expect(index?.header.globalLineOffset).toBe(0n);
      expect(index?.entries.length).toBe(3);

      // Verify 0-based indexing
      expect(index?.entries[0]?.lineNumberLocal).toBe(0);
      expect(index?.entries[0]?.lineNumberGlobal).toBe(0n);

      expect(index?.entries[1]?.lineNumberLocal).toBe(1);
      expect(index?.entries[1]?.lineNumberGlobal).toBe(1n);

      expect(index?.entries[2]?.lineNumberLocal).toBe(2);
      expect(index?.entries[2]?.lineNumberGlobal).toBe(2n);
    });

    it('should rotate files when size limit is reached and use correct filenames', async () => {
      const storage = createPersistentStorage(tempDir, { maxFileSize: 200 });

      // Write 15 records to trigger multiple file rotations
      for (let i = 0; i < 15; i++) {
        await storage.appendRecord({
          record: {
            timestamp: Date.now(),
            id: i + 1,
            data: `Record number ${i} with some test data`,
          },
          subIndexDir: 'test',
        });
      }

      const fullPath = join(tempDir, 'test');
      const files = await readdir(fullPath);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl')).sort();

      // Verify multiple files were created
      expect(jsonlFiles.length).toBeGreaterThan(1);

      // Verify each file
      let expectedGlobalIndex = 0n;
      for (const file of jsonlFiles) {
        const fileName = file.replace('.jsonl', '');
        const fileGlobalIndex = BigInt(fileName);
        const filePath = join(fullPath, file);
        const index = await readIndex({ indexPath: filePath });

        // Filename should match expected global index
        expect(fileGlobalIndex).toBe(expectedGlobalIndex);

        // Header globalLineOffset should match filename
        expect(index?.header.globalLineOffset).toBe(fileGlobalIndex);

        // Verify all entries have correct 0-based indexing
        if (index) {
          for (let j = 0; j < index.entries.length; j++) {
            const entry = index.entries[j]!;
            expect(entry.lineNumberLocal).toBe(j);
            expect(entry.lineNumberGlobal).toBe(expectedGlobalIndex + BigInt(j));
          }
          expectedGlobalIndex += BigInt(index.entries.length);
        }
      }

      // All 15 records should be accounted for
      expect(expectedGlobalIndex).toBe(15n);
    });

    it('should correctly name second file based on first file line count', async () => {
      const storage = createPersistentStorage(tempDir, { maxFileSize: 200 });

      // Write records to trigger rotation
      for (let i = 0; i < 6; i++) {
        await storage.appendRecord({
          record: {
            timestamp: Date.now(),
            id: i + 1,
            data: `Record ${i}`,
          },
          subIndexDir: 'test',
        });
      }

      const fullPath = join(tempDir, 'test');
      const files = await readdir(fullPath);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl')).sort();

      expect(jsonlFiles.length).toBeGreaterThanOrEqual(2);

      // First file
      const firstFile = jsonlFiles[0]!;
      const firstFilePath = join(fullPath, firstFile);
      const firstIndex = await readIndex({ indexPath: firstFilePath });

      expect(firstFile).toBe('00000000000000000000000000000000.jsonl');
      expect(firstIndex?.header.globalLineOffset).toBe(0n);

      const firstFileLineCount = firstIndex?.entries.length ?? 0;

      // Second file should start at first file's line count
      const secondFile = jsonlFiles[1]!;
      const secondFileName = secondFile.replace('.jsonl', '');
      const secondFileGlobalIndex = BigInt(secondFileName);

      expect(secondFileGlobalIndex).toBe(BigInt(firstFileLineCount));

      const secondFilePath = join(fullPath, secondFile);
      const secondIndex = await readIndex({ indexPath: secondFilePath });

      expect(secondIndex?.header.globalLineOffset).toBe(BigInt(firstFileLineCount));
      expect(secondIndex?.entries[0]?.lineNumberLocal).toBe(0);
      expect(secondIndex?.entries[0]?.lineNumberGlobal).toBe(BigInt(firstFileLineCount));
    });

    it('should maintain sequential global indices across file boundaries', async () => {
      const storage = createPersistentStorage(tempDir, { maxFileSize: 150 });

      // Write 10 records
      for (let i = 0; i < 10; i++) {
        await storage.appendRecord({
          record: {
            timestamp: Date.now(),
            id: i + 1,
            data: `Data ${i}`,
          },
          subIndexDir: 'test',
        });
      }

      const fullPath = join(tempDir, 'test');
      const files = await readdir(fullPath);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl')).sort();

      // Collect all global indices
      const allGlobalIndices: bigint[] = [];
      for (const file of jsonlFiles) {
        const filePath = join(fullPath, file);
        const index = await readIndex({ indexPath: filePath });

        if (index) {
          for (const entry of index.entries) {
            allGlobalIndices.push(entry.lineNumberGlobal);
          }
        }
      }

      // Verify we have all 10 indices
      expect(allGlobalIndices.length).toBe(10);

      // Verify they are sequential from 0 to 9
      for (let i = 0; i < 10; i++) {
        expect(allGlobalIndices[i]).toBe(BigInt(i));
      }
    });

    it('should handle appending to existing file correctly', async () => {
      const storage = createPersistentStorage(tempDir);

      // Write first record
      await storage.appendRecord({
        record: { timestamp: 1000, id: 1, data: 'First' },
        subIndexDir: 'test',
      });

      // Write second record (should append to same file)
      await storage.appendRecord({
        record: { timestamp: 2000, id: 2, data: 'Second' },
        subIndexDir: 'test',
      });

      const filePath = join(tempDir, 'test', '00000000000000000000000000000000.jsonl');
      const index = await readIndex({ indexPath: filePath });

      expect(index?.entries.length).toBe(2);
      expect(index?.entries[0]?.lineNumberLocal).toBe(0);
      expect(index?.entries[1]?.lineNumberLocal).toBe(1);
      expect(index?.entries[1]?.lineNumberGlobal).toBe(1n);
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
});

describe('normalizeSubIndexDir', () => {
  it('should convert to lowercase', () => {
    expect(normalizeIndexDir('BTCUSDT')).toBe('btcusdt');
    expect(normalizeIndexDir('BinanceAPI')).toBe('binanceapi');
    expect(normalizeIndexDir('MixedCase123')).toBe('mixedcase123');
  });

  it('should replace special characters with underscores', () => {
    expect(normalizeIndexDir('binance-book-ticker')).toBe('binance_book_ticker');
    expect(normalizeIndexDir('kraken::orderbook')).toBe('kraken_orderbook');
    expect(normalizeIndexDir('api@endpoint#test')).toBe('api_endpoint_test');
    expect(normalizeIndexDir('data.source.name')).toBe('data_source_name');
  });

  it('should replace path separators with underscores', () => {
    expect(normalizeIndexDir('binance/book/ticker')).toBe('binance_book_ticker');
    expect(normalizeIndexDir('path\\to\\data')).toBe('path_to_data');
    expect(normalizeIndexDir('mixed/path\\separators')).toBe('mixed_path_separators');
  });

  it('should preserve alphanumeric characters and underscores', () => {
    expect(normalizeIndexDir('valid_name_123')).toBe('valid_name_123');
    expect(normalizeIndexDir('abc123xyz')).toBe('abc123xyz');
    expect(normalizeIndexDir('test_123_data')).toBe('test_123_data');
  });

  it('should collapse multiple consecutive underscores', () => {
    expect(normalizeIndexDir('test___data')).toBe('test_data');
    expect(normalizeIndexDir('multiple____underscores')).toBe('multiple_underscores');
    expect(normalizeIndexDir('a__b__c')).toBe('a_b_c');
  });

  it('should remove leading underscores', () => {
    expect(normalizeIndexDir('_test')).toBe('test');
    expect(normalizeIndexDir('___test')).toBe('test');
    expect(normalizeIndexDir('_leading_underscore')).toBe('leading_underscore');
  });

  it('should remove trailing underscores', () => {
    expect(normalizeIndexDir('test_')).toBe('test');
    expect(normalizeIndexDir('test___')).toBe('test');
    expect(normalizeIndexDir('trailing_underscore_')).toBe('trailing_underscore');
  });

  it('should remove both leading and trailing underscores', () => {
    expect(normalizeIndexDir('_test_')).toBe('test');
    expect(normalizeIndexDir('___test___')).toBe('test');
    expect(normalizeIndexDir('_both_sides_')).toBe('both_sides');
  });

  it('should handle complex cases', () => {
    expect(normalizeIndexDir('Binance/Book-Ticker')).toBe('binance_book_ticker');
    expect(normalizeIndexDir('KRAKEN::OrderBook@REST')).toBe('kraken_orderbook_rest');
    expect(normalizeIndexDir('___Complex---Case___')).toBe('complex_case');
    expect(normalizeIndexDir('My__Data///Folder')).toBe('my_data_folder');
  });

  it('should handle edge cases', () => {
    expect(normalizeIndexDir('a')).toBe('a');
    expect(normalizeIndexDir('123')).toBe('123');
    expect(normalizeIndexDir('_')).toBe('');
    expect(normalizeIndexDir('___')).toBe('');
    expect(normalizeIndexDir('---')).toBe('');
  });

  it('should handle empty string', () => {
    expect(normalizeIndexDir('')).toBe('');
  });

  it('should handle strings with only special characters', () => {
    expect(normalizeIndexDir('!!@@##$$')).toBe('');
    expect(normalizeIndexDir('//\\\\//')).toBe('');
    expect(normalizeIndexDir('---:::')).toBe('');
  });
});

describe('createPersistentStorage with subIndexDir normalization', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-storage-normalize-' + Date.now());
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should normalize subIndexDir when appending records', async () => {
    const storage = createPersistentStorage(tempDir);

    const record = { timestamp: 1000, id: 1, data: 'test' };

    await storage.appendRecord({
      record,
      subIndexDir: 'Binance/Book-Ticker',
    });

    // Check that the directory was created with normalized name
    const dirs = await readdir(tempDir);
    expect(dirs).toContain('binance_book_ticker');
    expect(dirs).not.toContain('Binance/Book-Ticker');
  });

  it('should normalize subIndexDir when reading records', async () => {
    const storage = createPersistentStorage(tempDir);

    const record = { timestamp: 1000, id: 1, data: 'test' };

    // Write with one format
    await storage.appendRecord({
      record,
      subIndexDir: 'test-data',
    });

    // Read with another format (should be normalized to same directory)
    const result = await storage.readRecords({
      subIndexDir: 'TEST___DATA',
      fileName: '00000000000000000000000000000000',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(record);
  });

  it('should normalize subIndexDir consistently across operations', async () => {
    const storage = createPersistentStorage(tempDir);

    const records = [
      { timestamp: 1000, id: 1, data: 'first' },
      { timestamp: 2000, id: 2, data: 'second' },
      { timestamp: 3000, id: 3, data: 'third' },
    ];

    // Write records with different formats of the same logical name
    await storage.appendRecord({ record: records[0]!, subIndexDir: 'Test-Data' });
    await storage.appendRecord({ record: records[1]!, subIndexDir: 'TEST___DATA' });
    await storage.appendRecord({ record: records[2]!, subIndexDir: 'test/data' });

    // All should be written to the same directory
    const result = await storage.readRecords({
      subIndexDir: 'test_data',
      fileName: '00000000000000000000000000000000',
    });

    expect(result).toHaveLength(3);
    expect(result).toEqual(records);
  });

  it('should normalize subIndexDir when reading last record', async () => {
    const storage = createPersistentStorage(tempDir);

    const record = { timestamp: 1000, id: 1, data: 'test' };

    await storage.appendRecord({
      record,
      subIndexDir: 'binance-ticker',
    });

    // Read with different format
    const result = await storage.readLastRecord('BINANCE::TICKER');

    expect(result).toEqual(record);
  });

  it('should normalize subIndexDir when replacing last record', async () => {
    const storage = createPersistentStorage(tempDir);

    const record1 = { timestamp: 1000, id: 1, data: 'first' };
    const record2 = { timestamp: 2000, id: 2, data: 'second' };

    await storage.appendRecord({
      record: record1,
      subIndexDir: 'test-data',
    });

    await storage.replaceLastRecord({
      record: record2,
      subIndexDir: 'TEST/DATA',
    });

    const result = await storage.readLastRecord('test___data');

    expect(result).toEqual(record2);
  });
});

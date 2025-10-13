import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPersistentStorage, normalizeIndexDir } from '../persistentStorage.js';

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
    it('should append records to storage', async () => {
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

      // Verify records can be read back
      const result = await storage.readRecordsRange({
        subIndexDir: 'test',
        fromIndex: 0,
        count: 3,
      });

      expect(result).toHaveLength(3);
      expect(result[0]!.data).toBe('Record 1');
      expect(result[1]!.data).toBe('Record 2');
      expect(result[2]!.data).toBe('Record 3');
    });

    it('should handle appending to existing storage correctly', async () => {
      const storage = createPersistentStorage(tempDir);

      // Write first record
      await storage.appendRecord({
        record: { timestamp: 1000, id: 1, data: 'First' },
        subIndexDir: 'test',
      });

      // Write second record (should append)
      await storage.appendRecord({
        record: { timestamp: 2000, id: 2, data: 'Second' },
        subIndexDir: 'test',
      });

      const result = await storage.readRecordsRange({
        subIndexDir: 'test',
        fromIndex: 0,
        count: 2,
      });

      expect(result).toHaveLength(2);
      expect(result[0]!.data).toBe('First');
      expect(result[1]!.data).toBe('Second');
    });
  });

  describe('readFullPage', () => {
    it('should read all records from storage', async () => {
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

      const result = await storage.readFullPage({
        subIndexDir: 'BTCUSDT',
        fileName: 'unused',
      });

      expect(result).toEqual(records);
    });

    it('should return empty array if storage does not exist', async () => {
      const storage = createPersistentStorage(tempDir);

      const result = await storage.readFullPage({
        subIndexDir: 'nonexistent',
        fileName: 'unused',
      });

      expect(result).toEqual([]);
    });
  });

  describe('readLastRecord', () => {
    it('should read only the last record from storage', async () => {
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

    it('should return null if storage does not exist', async () => {
      const storage = createPersistentStorage(tempDir);

      const result = await storage.readLastRecord('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle single record storage', async () => {
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

    it('should handle large datasets efficiently', async () => {
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
  });

  describe('readRecordsRange', () => {
    it('should read records in specified range', async () => {
      const storage = createPersistentStorage(tempDir);

      const allRecords: unknown[] = [];
      for (let i = 0; i < 12; i++) {
        const record = {
          timestamp: 1000 + i * 1000,
          id: i,
          data: `Record ${i}`,
        };
        allRecords.push(record);
        await storage.appendRecord({
          record,
          subIndexDir: 'test',
        });
      }

      // Read from index 1 to index 10 (10 records total)
      const result = await storage.readRecordsRange({
        subIndexDir: 'test',
        fromIndex: 1,
        count: 10,
      });

      expect(result).toHaveLength(10);
      expect(result[0]!.data).toBe('Record 1');
      expect(result[1]!.data).toBe('Record 2');
      expect(result[2]!.data).toBe('Record 3');
      expect(result[3]!.data).toBe('Record 4');
      expect(result[4]!.data).toBe('Record 5');
      expect(result[5]!.data).toBe('Record 6');
      expect(result[6]!.data).toBe('Record 7');
      expect(result[7]!.data).toBe('Record 8');
      expect(result[8]!.data).toBe('Record 9');
      expect(result[9]!.data).toBe('Record 10');

      // Test overflow
      const resultOverflow = await storage.readRecordsRange({
        subIndexDir: 'test',
        fromIndex: 7,
        count: 999,
      });

      expect(resultOverflow).toHaveLength(5);
      expect(resultOverflow[0]!.data).toBe('Record 7');
      expect(resultOverflow[1]!.data).toBe('Record 8');
      expect(resultOverflow[2]!.data).toBe('Record 9');
      expect(resultOverflow[3]!.data).toBe('Record 10');
      expect(resultOverflow[4]!.data).toBe('Record 11');
    });

    it('should return empty array for non-existent range', async () => {
      const storage = createPersistentStorage(tempDir);

      const result = await storage.readRecordsRange({
        subIndexDir: 'nonexistent',
        fromIndex: 0,
        count: 10,
      });

      expect(result).toEqual([]);
    });

    it('should include index in results', async () => {
      const storage = createPersistentStorage(tempDir);

      await storage.appendRecord({
        record: { timestamp: 1000, data: 'First' },
        subIndexDir: 'test',
      });

      const result = await storage.readRecordsRange({
        subIndexDir: 'test',
        fromIndex: 0,
        count: 1,
      });

      expect(result[0]!.index).toBe(0);
    });
  });

  describe('replaceLastRecord', () => {
    it('should replace the last record in storage', async () => {
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

      const allRecords = await storage.readFullPage({
        subIndexDir: 'BTCUSDT',
        fileName: 'unused',
      });

      expect(allRecords).toHaveLength(3);
      expect(allRecords[0]).toEqual(records[0]);
      expect(allRecords[1]).toEqual(records[1]);
      expect(allRecords[2]).toEqual(newLastRecord);
    });

    it('should replace last record in single record storage', async () => {
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

      const allRecords = await storage.readFullPage({
        subIndexDir: 'BTCUSDT',
        fileName: 'unused',
      });

      expect(allRecords).toHaveLength(1);
      expect(allRecords[0]).toEqual(newRecord);
    });

    it('should throw error when replacing in empty storage', async () => {
      const storage = createPersistentStorage(tempDir);

      await expect(
        storage.replaceLastRecord({
          record: {
            timestamp: 1000,
            request: { query: { symbol: 'BTCUSDT' } },
            response: { id: '1', value: 100 },
          },
          subIndexDir: 'BTCUSDT',
        }),
      ).rejects.toThrow('Cannot replace last record: no records exist');
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

    // Check that the database file was created with normalized name
    const files = await readdir(tempDir);
    expect(files).toContain('binance_book_ticker.db');
    expect(files).not.toContain('Binance/Book-Ticker.db');
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
    const result = await storage.readFullPage({
      subIndexDir: 'TEST___DATA',
      fileName: 'unused',
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
    const result = await storage.readFullPage({
      subIndexDir: 'test_data',
      fileName: 'unused',
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

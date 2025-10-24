import { mkdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createPersistentStorage,
  normalizeIndexDir,
  StorageRecord,
} from '../persistentStorage.js';

type TestRecord = StorageRecord<{ data: string; timestamp: number }>;

describe('createPersistentStorage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-storage-' + Date.now() + Math.random());
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rmdir(tempDir, { recursive: true });
    } catch {
      await rmdir(tempDir, { recursive: true });
    }
  });

  describe('appendRecord', () => {
    it('should append records to storage', async () => {
      let storage = createPersistentStorage<TestRecord>(tempDir, { writable: true });

      const records: TestRecord[] = [
        { data: 'Record 1', timestamp: 1 },
        { data: 'Record 2', timestamp: 2 },
        { data: 'Record 3', timestamp: 3 },
      ];

      for (const record of records) {
        await storage.appendRecord({
          record,
          subIndex: 'test',
        });
      }

      // Verify records can be read back
      let result = await storage.readRecordsRange({
        subIndex: 'test',
        fromId: 0,
        count: 3,
      });

      expect(result).toHaveLength(3);
      expect(result[0]!.data).toBe('Record 1');
      expect(result[1]!.data).toBe('Record 2');
      expect(result[2]!.data).toBe('Record 3');
      storage.close();

      storage = createPersistentStorage<TestRecord>(tempDir, { writable: true });

      await storage.appendRecord({
        record: { data: 'Record 4', timestamp: 4 },
        subIndex: 'test',
      }); 

      result = await storage.readRecordsRange({
        subIndex: 'test',
        fromId: 0,
        count: 4,
      });

      expect(result).toHaveLength(4);
      expect(result[0]!.data).toBe('Record 1');
      expect(result[1]!.data).toBe('Record 2');
      expect(result[2]!.data).toBe('Record 3');
      expect(result[3]!.data).toBe('Record 4');
      storage.close();
    });

    it('should handle appending to existing storage correctly', async () => {
      const storage = createPersistentStorage<TestRecord>(tempDir, { writable: true });

      // Write first record
      await storage.appendRecord({
        record: { data: 'First', timestamp: 1 },
        subIndex: 'test',
      });

      // Write second record (should append)
      await storage.appendRecord({
        record: { data: 'Second', timestamp: 2 },
        subIndex: 'test',
      });

      const result = await storage.readRecordsRange({
        subIndex: 'test',
        fromId: 0,
        count: 2,
      });

      expect(result).toHaveLength(2);
      expect(result[0]!.data).toBe('First');
      expect(result[1]!.data).toBe('Second');
      storage.close();
    });
  });

  describe('readLastRecord', () => {
    it('should read only the last record from storage', async () => {
      const storage = createPersistentStorage<TestRecord>(tempDir, { writable: true });

      const records: TestRecord[] = [
        { data: 'Record 1', timestamp: 1 },
        { data: 'Record 2', timestamp: 2 },
        { data: 'Record 3', timestamp: 3 },
      ];

      for (const record of records) {
        await storage.appendRecord({
          record,
          subIndex: 'test',
        });
      }

      const result = await storage.readLastRecord('test');

      expect(result).toEqual({
        ...records[2],
        id: 3,
        timestamp: 3,
      });
      storage.close();
    });

    it('should return null if storage does not exist', async () => {
      const storage = createPersistentStorage<TestRecord>(tempDir, { writable: true });

      const result = await storage.readLastRecord('nonexistent');

      expect(result).toBeNull();
      storage.close();
    });

    it('should handle single record storage', async () => {
      const storage = createPersistentStorage<TestRecord>(tempDir, { writable: true });

      const record: TestRecord = { data: 'Single record', timestamp: 1 };

      await storage.appendRecord({
        record,
        subIndex: 'test',
      });

      const result = await storage.readLastRecord('test');

      expect(result).toEqual({
        ...record,
        id: 1,
        timestamp: 1,
      });
      storage.close();
    });

    it('should handle large datasets efficiently', async () => {
      const storage = createPersistentStorage<TestRecord>(tempDir, { writable: true });

      for (let i = 0; i < 1000; i++) {
        await storage.appendRecord({
          record: { data: `Record ${i}`, timestamp: i },
          subIndex: 'test',
        });
      }

      const result = await storage.readLastRecord('test');

      expect(result).toEqual({
        data: 'Record 999',
        id: 1000,
        timestamp: 999,
      });
      storage.close();
    });
  });

  describe('readRecordsRange', () => {
    it('should read records in specified range', async () => {
      const storage = createPersistentStorage<TestRecord>(tempDir, { writable: true });

      const ids: number[] = [];
      for (let i = 0; i < 12; i++) {
        const record: TestRecord = { data: `Record ${i}`, timestamp: i };
        ids.push(
          await storage.appendRecord({
            record,
            subIndex: 'test',
          }),
        );
      }

      // Read from index 1 to index 10 (10 records total)
      const result = await storage.readRecordsRange({
        subIndex: 'test',
        fromId: ids[1]!,
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
        subIndex: 'test',
        fromId: ids[7]!,
        count: 999,
      });

      expect(resultOverflow).toHaveLength(5);
      expect(resultOverflow[0]!.data).toBe('Record 7');
      expect(resultOverflow[1]!.data).toBe('Record 8');
      expect(resultOverflow[2]!.data).toBe('Record 9');
      expect(resultOverflow[3]!.data).toBe('Record 10');
      expect(resultOverflow[4]!.data).toBe('Record 11');
      storage.close();
    });

    it('should return empty array for non-existent range', async () => {
      const storage = createPersistentStorage<TestRecord>(tempDir, { writable: true });

      const result = await storage.readRecordsRange({
        subIndex: 'nonexistent',
        fromId: 0,
        count: 10,
      });

      expect(result).toEqual([]);
      storage.close();
    });

    it('should include id and key in results', async () => {
      const storage = createPersistentStorage<TestRecord>(tempDir, { writable: true });

      await storage.appendRecord({
        record: { data: 'First', timestamp: 1 },
        subIndex: 'test',
      });

      const result = await storage.readRecordsRange({
        subIndex: 'test',
        fromId: 0,
        count: 1,
      });

      expect(result[0]!.id).toBe(1);
      storage.close();
    });
  });

  describe('replaceOrInsertLastRecord', () => {
    it('should replace the last record in storage', async () => {
      const storage = createPersistentStorage<TestRecord>(tempDir, { writable: true });

      const records: TestRecord[] = [
        { data: 'Record 1', timestamp: 1 },
        { data: 'Record 2', timestamp: 2 },
        { data: 'Record 3', timestamp: 3 },
      ];

      for (const record of records) {
        await storage.appendRecord({
          record,
          subIndex: 'test',
        });
      }

      const newLastRecord: TestRecord = { data: 'New last record', timestamp: 4 };

      await storage.replaceOrInsertLastRecord({
        record: newLastRecord,
        subIndex: 'test',
      });

      const allRecords = await storage.readFullPage({
        subIndex: 'test',
      });

      expect(allRecords).toHaveLength(3);
      expect(allRecords).toEqual([
        { ...records[0], id: 1, timestamp: 1 },
        { ...records[1], id: 2, timestamp: 2 },
        { ...newLastRecord, id: 3, timestamp: 4 },
      ]);
      storage.close();
    });

    it('should replace last record in single record storage', async () => {
      const storage = createPersistentStorage<TestRecord>(tempDir, { writable: true });

      const record: TestRecord = { data: 'First', timestamp: 1 };

      await storage.appendRecord({
        record,
        subIndex: 'test',
      });

      const newRecord: TestRecord = { data: 'Second', timestamp: 2 };

      await storage.replaceOrInsertLastRecord({
        record: newRecord,
        subIndex: 'test',
      });

      const allRecords = await storage.readFullPage({
        subIndex: 'test',
      });

      expect(allRecords).toHaveLength(1);
      expect(allRecords[0]).toEqual({
        ...newRecord,
        id: 1,
        timestamp: 2,
      });
      storage.close();
    });

    it('should insert record when storage is empty', async () => {
      const storage = createPersistentStorage<TestRecord>(tempDir, { writable: true });

      const record: TestRecord = { data: 'First', timestamp: 1 };

      await storage.replaceOrInsertLastRecord({
        record,
        subIndex: 'test',
      });

      const allRecords = await storage.readFullPage({
        subIndex: 'test',
      });

      expect(allRecords).toHaveLength(1);
      expect(allRecords[0]).toEqual({
        ...record,
        id: 1,
        timestamp: 1,
      });
      storage.close();
    });
  });

  it('Allowes a parallel read in read-only mode', async () => {
    const writer = createPersistentStorage<TestRecord>(tempDir, { writable: true });
    const reader = createPersistentStorage<TestRecord>(tempDir, { writable: false });
    const record: TestRecord = { data: 'First', timestamp: 1 };

    await writer.appendRecord({
      record,
      subIndex: 'test',
    });
    const result = await reader.readLastRecord('test');

    expect(result).toBeTruthy();
  })
});

describe('normalizesubIndex', () => {
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

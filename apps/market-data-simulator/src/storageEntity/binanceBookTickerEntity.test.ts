import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBinanceBookTickerEntity } from './binanceBookTickerEntity.js';

describe('binanceBookTickerEntity - indexing', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-book-ticker-' + Date.now());
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should create file with date-based index when writing first record', async () => {
    const mockTimestamp = new Date('2025-10-05T14:30:00.000Z').getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceBookTickerEntity(tempDir);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: { symbol: 'BTCUSDT', bidPrice: '50000', bidQty: '1', askPrice: '50001', askQty: '1' },
    });

    const fileNames = await entity.storage.listFileNames('BTCUSDT');
    
    expect(fileNames).toContain('2025-10-05_0');
    expect(fileNames).toHaveLength(1);
  });

  it('should increment file index after 100k records', async () => {
    const mockDate = '2025-10-05';
    const mockTimestamp = new Date(`${mockDate}T14:30:00.000Z`).getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceBookTickerEntity(tempDir);

    const existingFilePath = join(tempDir, 'api_v3_ticker_bookTicker', 'BTCUSDT', `${mockDate}_0.jsonl`);
    await mkdir(join(tempDir, 'api_v3_ticker_bookTicker', 'BTCUSDT'), { recursive: true });
    
    const records = Array.from({ length: 100_000 }, (_, i) => 
      JSON.stringify({
        timestamp: mockTimestamp - i,
        request: { query: { symbol: 'BTCUSDT' } },
        response: { symbol: 'BTCUSDT', bidPrice: '50000', bidQty: '1', askPrice: '50001', askQty: '1' },
      })
    );
    await writeFile(existingFilePath, records.join('\n') + '\n', 'utf-8');

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: { symbol: 'BTCUSDT', bidPrice: '50000', bidQty: '1', askPrice: '50001', askQty: '1' },
    });

    const fileNames = await entity.storage.listFileNames('BTCUSDT');
    
    expect(fileNames).toContain(`${mockDate}_0`);
    expect(fileNames).toContain(`${mockDate}_1`);
    expect(fileNames).toHaveLength(2);
  });

  it('should create new file with index 0 when date changes', async () => {
    const firstDate = new Date('2025-10-05T23:59:59.000Z');
    vi.setSystemTime(firstDate);

    const entity = createBinanceBookTickerEntity(tempDir);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: { symbol: 'BTCUSDT', bidPrice: '50000', bidQty: '1', askPrice: '50001', askQty: '1' },
    });

    const secondDate = new Date('2025-10-06T00:00:01.000Z');
    vi.setSystemTime(secondDate);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: { symbol: 'BTCUSDT', bidPrice: '50100', bidQty: '1', askPrice: '50101', askQty: '1' },
    });

    const fileNames = await entity.storage.listFileNames('BTCUSDT');
    
    expect(fileNames).toContain('2025-10-05_0');
    expect(fileNames).toContain('2025-10-06_0');
    expect(fileNames).toHaveLength(2);
  });

  it('should handle multiple file indices on same date', async () => {
    const mockDate = '2025-10-05';
    const mockTimestamp = new Date(`${mockDate}T14:30:00.000Z`).getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceBookTickerEntity(tempDir);
    const baseDir = join(tempDir, 'api_v3_ticker_bookTicker', 'BTCUSDT');
    await mkdir(baseDir, { recursive: true });

    const createFileWithRecords = async (fileIndex: number, recordCount: number) => {
      const filePath = join(baseDir, `${mockDate}_${fileIndex}.jsonl`);
      const records = Array.from({ length: recordCount }, (_, i) => 
        JSON.stringify({
          timestamp: mockTimestamp - i,
          request: { query: { symbol: 'BTCUSDT' } },
          response: { symbol: 'BTCUSDT', bidPrice: '50000', bidQty: '1', askPrice: '50001', askQty: '1' },
        })
      );
      await writeFile(filePath, records.join('\n') + '\n', 'utf-8');
    };

    await createFileWithRecords(0, 100_000);
    await createFileWithRecords(1, 100_000);
    await createFileWithRecords(2, 50_000);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: { symbol: 'BTCUSDT', bidPrice: '50200', bidQty: '1', askPrice: '50201', askQty: '1' },
    });

    const records = await entity.storage.readRecords({ relativePath: `BTCUSDT/${mockDate}_2` });
    
    expect(records).toHaveLength(50_001);
  });

  it('should read latest record from most recent file', async () => {
    const mockDate = '2025-10-05';
    const mockTimestamp = new Date(`${mockDate}T14:30:00.000Z`).getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceBookTickerEntity(tempDir);

    await entity.write({
      request: { query: { symbol: 'ETHUSDT' } },
      response: { symbol: 'ETHUSDT', bidPrice: '3000', bidQty: '2', askPrice: '3001', askQty: '2' },
    });

    await entity.write({
      request: { query: { symbol: 'ETHUSDT' } },
      response: { symbol: 'ETHUSDT', bidPrice: '3100', bidQty: '3', askPrice: '3101', askQty: '3' },
    });

    const latestRecord = await entity.readLatestRecord('ETHUSDT');

    expect(latestRecord).not.toBeNull();
    
    if (latestRecord && !Array.isArray(latestRecord.response)) {
      expect(latestRecord.response.bidPrice).toBe('3100');
      expect(latestRecord.response.askPrice).toBe('3101');
    }
  });

  it('should overwrite last record when response is identical', async () => {
    const mockDate = '2025-10-05';
    const firstTimestamp = new Date(`${mockDate}T14:30:00.000Z`).getTime();
    vi.setSystemTime(firstTimestamp);

    const entity = createBinanceBookTickerEntity(tempDir);

    const response = { symbol: 'BTCUSDT', bidPrice: '50000', bidQty: '1', askPrice: '50001', askQty: '1' };

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response,
    });

    const secondTimestamp = firstTimestamp + 5000;
    vi.setSystemTime(secondTimestamp);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response,
    });

    const records = await entity.storage.readRecords({ relativePath: `BTCUSDT/${mockDate}_0` });
    
    expect(records).toHaveLength(1);
    expect(records[0]!.timestamp).toBe(secondTimestamp);
    expect(records[0]!.response).toEqual(response);
  });

  it('should append new record when response is different', async () => {
    const mockDate = '2025-10-05';
    const firstTimestamp = new Date(`${mockDate}T14:30:00.000Z`).getTime();
    vi.setSystemTime(firstTimestamp);

    const entity = createBinanceBookTickerEntity(tempDir);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: { symbol: 'BTCUSDT', bidPrice: '50000', bidQty: '1', askPrice: '50001', askQty: '1' },
    });

    const secondTimestamp = firstTimestamp + 5000;
    vi.setSystemTime(secondTimestamp);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: { symbol: 'BTCUSDT', bidPrice: '50100', bidQty: '1', askPrice: '50101', askQty: '1' },
    });

    const records = await entity.storage.readRecords({ relativePath: `BTCUSDT/${mockDate}_0` });
    
    expect(records).toHaveLength(2);
    expect(records[0]!.timestamp).toBe(firstTimestamp);
    if (!Array.isArray(records[0]!.response)) {
      expect(records[0]!.response.bidPrice).toBe('50000');
    }
    expect(records[1]!.timestamp).toBe(secondTimestamp);
    if (!Array.isArray(records[1]!.response)) {
      expect(records[1]!.response.bidPrice).toBe('50100');
    }
  });
});

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBinanceOrderBookEntity } from './binanceOrderBookEntity.js';
import { BinanceApi } from '@krupton/api-interface';

describe('binanceOrderBookEntity - indexing', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-order-book-' + Date.now());
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should create file with date-based index when writing first record', async () => {
    const mockTimestamp = new Date('2025-10-05T14:30:00.000Z').getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceOrderBookEntity(tempDir);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: {
        lastUpdateId: 12345,
        bids: [['50000.00', '1.0']],
        asks: [['50001.00', '1.0']],
      },
    });

    const fileNames = await entity.storage.listFileNames('BTCUSDT');

    expect(fileNames).toContain('2025-10-05_0');
    expect(fileNames).toHaveLength(1);
  });

  it('should increment file index after 100k records', async () => {
    const mockDate = '2025-10-05';
    const mockTimestamp = new Date(`${mockDate}T14:30:00.000Z`).getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceOrderBookEntity(tempDir);

    const existingFilePath = join(tempDir, 'api_v3_depth', 'BTCUSDT', `${mockDate}_0.jsonl`);
    await mkdir(join(tempDir, 'api_v3_depth', 'BTCUSDT'), { recursive: true });

    const records = Array.from({ length: 100_000 }, (_, i) =>
      JSON.stringify({
        timestamp: mockTimestamp - i,
        request: { query: { symbol: 'BTCUSDT' } },
        response: {
          lastUpdateId: 12345 + i,
          bids: [['50000.00', '1.0']],
          asks: [['50001.00', '1.0']],
        },
      }),
    );
    await writeFile(existingFilePath, records.join('\n') + '\n', 'utf-8');

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: {
        lastUpdateId: 112345,
        bids: [['50000.00', '1.0']],
        asks: [['50001.00', '1.0']],
      },
    });

    const fileNames = await entity.storage.listFileNames('BTCUSDT');

    expect(fileNames).toContain(`${mockDate}_0`);
    expect(fileNames).toContain(`${mockDate}_1`);
    expect(fileNames).toHaveLength(2);
  });

  it('should create new file with index 0 when date changes', async () => {
    const firstDate = new Date('2025-10-05T23:59:59.000Z');
    vi.setSystemTime(firstDate);

    const entity = createBinanceOrderBookEntity(tempDir);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: {
        lastUpdateId: 12345,
        bids: [['50000.00', '1.0']],
        asks: [['50001.00', '1.0']],
      },
    });

    const secondDate = new Date('2025-10-06T00:00:01.000Z');
    vi.setSystemTime(secondDate);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: {
        lastUpdateId: 12346,
        bids: [['50100.00', '1.0']],
        asks: [['50101.00', '1.0']],
      },
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

    const entity = createBinanceOrderBookEntity(tempDir);
    const baseDir = join(tempDir, 'api_v3_depth', 'BTCUSDT');
    await mkdir(baseDir, { recursive: true });

    const createFileWithRecords = async (fileIndex: number, recordCount: number) => {
      const filePath = join(baseDir, `${mockDate}_${fileIndex}.jsonl`);
      const records = Array.from({ length: recordCount }, (_, i) =>
        JSON.stringify({
          timestamp: mockTimestamp - i,
          request: { query: { symbol: 'BTCUSDT' } },
          response: {
            lastUpdateId: 12345 + i,
            bids: [['50000.00', '1.0']],
            asks: [['50001.00', '1.0']],
          },
        }),
      );
      await writeFile(filePath, records.join('\n') + '\n', 'utf-8');
    };

    await createFileWithRecords(0, 100_000);
    await createFileWithRecords(1, 100_000);
    await createFileWithRecords(2, 50_000);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: {
        lastUpdateId: 250345,
        bids: [['50200.00', '1.0']],
        asks: [['50201.00', '1.0']],
      },
    });

    const records = await entity.storage.readRecords({ relativePath: `BTCUSDT/${mockDate}_2` });

    expect(records).toHaveLength(50_001);
  });

  it('should read latest record from most recent file', async () => {
    const mockDate = '2025-10-05';
    const mockTimestamp = new Date(`${mockDate}T14:30:00.000Z`).getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceOrderBookEntity(tempDir);

    await entity.write({
      request: { query: { symbol: 'ETHUSDT' } },
      response: {
        lastUpdateId: 1000,
        bids: [['3000.00', '2.0']],
        asks: [['3001.00', '2.0']],
      },
    });

    await entity.write({
      request: { query: { symbol: 'ETHUSDT' } },
      response: {
        lastUpdateId: 1001,
        bids: [['3100.00', '3.0']],
        asks: [['3101.00', '3.0']],
      },
    });

    const latestRecord = await entity.readLatestRecord('ETHUSDT');

    expect(latestRecord).not.toBeNull();

    if (latestRecord) {
      expect(latestRecord.response.lastUpdateId).toBe(1001);
      expect(latestRecord.response.bids[0]?.[0]).toBe('3100.00');
      expect(latestRecord.response.asks[0]?.[0]).toBe('3101.00');
    }
  });

  it('should overwrite last record timestamp when response is identical', async () => {
    const firstTimestamp = new Date('2025-10-05T14:30:00.000Z').getTime();
    vi.setSystemTime(firstTimestamp);

    const entity = createBinanceOrderBookEntity(tempDir);

    const identicalResponse: BinanceApi.GetOrderBookResponse = {
      lastUpdateId: 12345,
      bids: [['50000.00', '1.0']],
      asks: [['50001.00', '1.0']],
    };

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: identicalResponse,
    });

    const secondTimestamp = new Date('2025-10-05T14:31:00.000Z').getTime();
    vi.setSystemTime(secondTimestamp);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: identicalResponse,
    });

    const records = await entity.storage.readRecords({ relativePath: 'BTCUSDT/2025-10-05_0' });

    expect(records).toHaveLength(1);

    expect(records[0]?.timestamp).toBe(secondTimestamp);
    expect(records[0]?.response).toEqual(identicalResponse);
  });

  it('should append new record when response is different', async () => {
    const firstTimestamp = new Date('2025-10-05T14:30:00.000Z').getTime();
    vi.setSystemTime(firstTimestamp);

    const entity = createBinanceOrderBookEntity(tempDir);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: {
        lastUpdateId: 12345,
        bids: [['50000.00', '1.0']],
        asks: [['50001.00', '1.0']],
      },
    });

    const secondTimestamp = new Date('2025-10-05T14:31:00.000Z').getTime();
    vi.setSystemTime(secondTimestamp);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: {
        lastUpdateId: 12346,
        bids: [['50100.00', '1.5']],
        asks: [['50101.00', '1.5']],
      },
    });

    const records = await entity.storage.readRecords({ relativePath: 'BTCUSDT/2025-10-05_0' });

    expect(records).toHaveLength(2);

    expect(records[0]?.timestamp).toBe(firstTimestamp);
    expect(records[1]?.timestamp).toBe(secondTimestamp);
    expect(records[0]?.response.lastUpdateId).toBe(12345);
    expect(records[1]?.response.lastUpdateId).toBe(12346);
  });
});

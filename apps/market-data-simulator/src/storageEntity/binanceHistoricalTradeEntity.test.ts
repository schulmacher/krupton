import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBinanceHistoricalTradeEntity } from './binanceHistoricalTradeEntity.js';

describe('binanceHistoricalTradeEntity - indexing', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-historical-trade-' + Date.now());
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const createMockTrade = (id: number) => {
    return {
      id,
      price: '50000.00',
      qty: '1.0',
      quoteQty: '50000.00',
      time: Date.now(),
      isBuyerMaker: true,
      isBestMatch: true,
    };
  };

  it('should create file with trade ID based index', async () => {
    const mockTimestamp = new Date('2025-10-05T14:30:00.000Z').getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceHistoricalTradeEntity(tempDir);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: [createMockTrade(50000), createMockTrade(50001), createMockTrade(50002)],
    });

    const fileNames = await entity.storage.listFileNames('BTCUSDT');
    
    expect(fileNames).toContain('0');
    expect(fileNames).toHaveLength(1);

    const records = await entity.storage.readRecords({ relativePath: 'BTCUSDT/0' });
    expect(records).toHaveLength(1);
    expect(records[0]?.response).toHaveLength(3);
  });

  it('should partition trades across multiple files when spanning different index ranges', async () => {
    const mockTimestamp = new Date('2025-10-05T14:30:00.000Z').getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceHistoricalTradeEntity(tempDir);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: [
        createMockTrade(50000),
        createMockTrade(99999),
        createMockTrade(100000),
        createMockTrade(100001),
        createMockTrade(200000),
        createMockTrade(200001),
      ],
    });

    const fileNames = await entity.storage.listFileNames('BTCUSDT');
    
    expect(fileNames).toHaveLength(3);
    expect(fileNames).toContain('0');
    expect(fileNames).toContain('1');
    expect(fileNames).toContain('2');

    const records0 = await entity.storage.readRecords({ relativePath: 'BTCUSDT/0' });
    expect(records0[0]?.response).toHaveLength(2);
    expect(records0[0]?.response[0]?.id).toBe(50000);
    expect(records0[0]?.response[1]?.id).toBe(99999);

    const records1 = await entity.storage.readRecords({ relativePath: 'BTCUSDT/1' });
    expect(records1[0]?.response).toHaveLength(2);
    expect(records1[0]?.response[0]?.id).toBe(100000);
    expect(records1[0]?.response[1]?.id).toBe(100001);

    const records2 = await entity.storage.readRecords({ relativePath: 'BTCUSDT/2' });
    expect(records2[0]?.response).toHaveLength(2);
    expect(records2[0]?.response[0]?.id).toBe(200000);
    expect(records2[0]?.response[1]?.id).toBe(200001);
  });

  it('should append to existing file when trade IDs are in same range', async () => {
    const mockTimestamp = new Date('2025-10-05T14:30:00.000Z').getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceHistoricalTradeEntity(tempDir);

    await entity.write({
      request: { query: { symbol: 'ETHUSDT' } },
      response: [createMockTrade(1000), createMockTrade(1001)],
    });

    vi.setSystemTime(mockTimestamp + 60000);

    await entity.write({
      request: { query: { symbol: 'ETHUSDT' } },
      response: [createMockTrade(1002), createMockTrade(1003)],
    });

    const fileNames = await entity.storage.listFileNames('ETHUSDT');
    
    expect(fileNames).toHaveLength(1);
    expect(fileNames).toContain('0');

    const records = await entity.storage.readRecords({ relativePath: 'ETHUSDT/0' });
    
    expect(records).toHaveLength(2);
    expect(records[0]?.timestamp).toBe(mockTimestamp);
    expect(records[1]?.timestamp).toBe(mockTimestamp + 60000);
  });

  it('should handle file index at boundary (exactly 100k)', async () => {
    const mockTimestamp = new Date('2025-10-05T14:30:00.000Z').getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceHistoricalTradeEntity(tempDir);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: [createMockTrade(99998), createMockTrade(99999), createMockTrade(100000)],
    });

    const fileNames = await entity.storage.listFileNames('BTCUSDT');
    
    expect(fileNames).toHaveLength(2);
    expect(fileNames).toContain('0');
    expect(fileNames).toContain('1');

    const records0 = await entity.storage.readRecords({ relativePath: 'BTCUSDT/0' });
    expect(records0[0]?.response).toHaveLength(2);
    expect(records0[0]?.response[0]?.id).toBe(99998);
    expect(records0[0]?.response[1]?.id).toBe(99999);

    const records1 = await entity.storage.readRecords({ relativePath: 'BTCUSDT/1' });
    expect(records1[0]?.response).toHaveLength(1);
    expect(records1[0]?.response[0]?.id).toBe(100000);
  });

  it('should read latest record from file with highest index', async () => {
    const mockTimestamp = new Date('2025-10-05T14:30:00.000Z').getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceHistoricalTradeEntity(tempDir);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: [createMockTrade(1000)],
    });

    vi.setSystemTime(mockTimestamp + 60000);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: [createMockTrade(100000)],
    });

    vi.setSystemTime(mockTimestamp + 120000);

    await entity.write({
      request: { query: { symbol: 'BTCUSDT' } },
      response: [createMockTrade(500000)],
    });

    const latestRecord = await entity.readLatestRecord('BTCUSDT');

    expect(latestRecord).not.toBeNull();
    expect(latestRecord?.timestamp).toBe(mockTimestamp + 120000);
    
    if (latestRecord && Array.isArray(latestRecord.response)) {
      expect(latestRecord.response).toHaveLength(1);
      expect(latestRecord.response[0]?.id).toBe(500000);
    }
  });
});

import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBinanceExchangeInfoEntity } from './binanceExchangeInfoEntity.js';

describe('binanceExchangeInfoEntity - indexing', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-exchange-info-' + Date.now());
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const createMockResponse = (symbols: string[]) => {
    return {
      timezone: 'UTC',
      serverTime: Date.now(),
      rateLimits: [],
      exchangeFilters: [],
      symbols: symbols.map((symbol) => ({
        symbol,
        status: 'TRADING',
        baseAsset: symbol.slice(0, 3),
        quoteAsset: symbol.slice(3),
        baseAssetPrecision: 8,
        quotePrecision: 8,
        quoteAssetPrecision: 8,
        orderTypes: [],
        icebergAllowed: false,
        ocoAllowed: false,
        isSpotTradingAllowed: true,
        isMarginTradingAllowed: false,
        filters: [],
        permissions: [],
      })),
    };
  };

  it('should create file with hash-based index when writing first record', async () => {
    const mockTimestamp = new Date('2025-10-05T14:30:00.000Z').getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceExchangeInfoEntity(tempDir);
    const symbols = ['BTCUSDT', 'ETHUSDT'];

    await entity.write({
      request: { query: {} },
      response: createMockResponse(symbols),
    });

    const fileNames = await entity.storage.listFileNames('ALL');
    
    expect(fileNames).toHaveLength(1);
    expect(fileNames[0]).toMatch(/^00000_[a-f0-9]{12}$/);
  });

  it('should overwrite file when symbols remain the same (same hash)', async () => {
    const mockTimestamp = new Date('2025-10-05T14:30:00.000Z').getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceExchangeInfoEntity(tempDir);
    const symbols = ['BTCUSDT', 'ETHUSDT'];

    await entity.write({
      request: { query: {} },
      response: createMockResponse(symbols),
    });

    vi.setSystemTime(mockTimestamp + 60000);

    await entity.write({
      request: { query: {} },
      response: createMockResponse(symbols),
    });

    const fileNames = await entity.storage.listFileNames('ALL');
    
    expect(fileNames).toHaveLength(1);
    
    const records = await entity.storage.readRecords({ relativePath: `ALL/${fileNames[0]}` });
    expect(records).toHaveLength(1);
    expect(records[0]?.timestamp).toBe(mockTimestamp + 60000);
  });

  it('should create new file when symbols change (different hash)', async () => {
    const mockTimestamp = new Date('2025-10-05T14:30:00.000Z').getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceExchangeInfoEntity(tempDir);

    await entity.write({
      request: { query: {} },
      response: createMockResponse(['BTCUSDT', 'ETHUSDT']),
    });

    const firstFileNames = await entity.storage.listFileNames('ALL');
    expect(firstFileNames).toHaveLength(1);

    vi.setSystemTime(mockTimestamp + 60000);

    await entity.write({
      request: { query: {} },
      response: createMockResponse(['BTCUSDT', 'ETHUSDT', 'BNBUSDT']),
    });

    const secondFileNames = await entity.storage.listFileNames('ALL');
    
    expect(secondFileNames).toHaveLength(2);
    expect(secondFileNames[0]).not.toBe(secondFileNames[1]);
  });

  it('should generate same hash for symbols in different order', async () => {
    const mockTimestamp = new Date('2025-10-05T14:30:00.000Z').getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceExchangeInfoEntity(tempDir);

    await entity.write({
      request: { query: {} },
      response: createMockResponse(['ETHUSDT', 'BTCUSDT', 'BNBUSDT']),
    });

    const firstFileNames = await entity.storage.listFileNames('ALL');

    vi.setSystemTime(mockTimestamp + 60000);

    await entity.write({
      request: { query: {} },
      response: createMockResponse(['BTCUSDT', 'BNBUSDT', 'ETHUSDT']),
    });

    const secondFileNames = await entity.storage.listFileNames('ALL');
    
    expect(secondFileNames).toHaveLength(1);
    expect(firstFileNames[0]).toBe(secondFileNames[0]);
    
    const records = await entity.storage.readRecords({ relativePath: `ALL/${secondFileNames[0]}` });
    expect(records).toHaveLength(1);
    expect(records[0]?.timestamp).toBe(mockTimestamp + 60000);
  });

  it('should read latest record from most recent file', async () => {
    const mockTimestamp = new Date('2025-10-05T14:30:00.000Z').getTime();
    vi.setSystemTime(mockTimestamp);

    const entity = createBinanceExchangeInfoEntity(tempDir);

    await entity.write({
      request: { query: {} },
      response: createMockResponse(['BTCUSDT', 'ETHUSDT']),
    });

    vi.setSystemTime(mockTimestamp + 60000);

    await entity.write({
      request: { query: {} },
      response: createMockResponse(['BTCUSDT', 'ETHUSDT', 'BNBUSDT']),
    });

    const latestRecord = await entity.readLatestRecord('ALL');

    expect(latestRecord).not.toBeNull();
    expect(latestRecord?.timestamp).toBe(mockTimestamp + 60000);
    expect(latestRecord?.response.symbols).toHaveLength(3);
  });
});

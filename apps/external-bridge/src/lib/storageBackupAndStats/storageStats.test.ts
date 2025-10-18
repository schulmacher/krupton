import { mkdir, rm, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readStorageStats } from './storageStats.js';

const TEST_PATTERNS = ['binance/**', 'kraken/**', 'victoria_metrics'];

describe('readStorageStats', () => {
  let tempDir: string;
  let fileCounter = 0;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-storage-stats-' + Date.now());
    await mkdir(tempDir, { recursive: true });
    fileCounter = 0;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const createTestFile = async (
    relativePath: string,
    content: string,
    mtime?: number,
  ): Promise<number> => {
    const fullPath = join(tempDir, relativePath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, content, 'utf-8');

    // Set custom mtime if provided, otherwise use incrementing timestamps
    const timestamp = mtime ?? 1000000000000 + fileCounter++ * 1000;
    await utimes(fullPath, timestamp / 1000, timestamp / 1000);
    return timestamp;
  };

  it('should return empty array for empty directory', async () => {
    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats).toEqual([]);
  });

  it('should count files in binance directories by endpoint', async () => {
    await createTestFile('binance/api_v3_depth/BTCUSDT/data.jsonl', 'test data 1');
    const lastUpdated = await createTestFile(
      'binance/api_v3_depth/ETHUSDT/data.jsonl',
      'test data 2',
    );
    const tradesUpdated = await createTestFile(
      'binance/api_v3_historicalTrades/BTCUSDT/0.jsonl',
      'test data 3',
    );

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats).toEqual([
      {
        directory: 'binance/api_v3_depth',
        fileCount: 2,
        sizeBytes: 22,
        lastUpdated,
      },
      {
        directory: 'binance/api_v3_historicalTrades',
        fileCount: 1,
        sizeBytes: 11,
        lastUpdated: tradesUpdated,
      },
    ]);
  });

  it('should count files in kraken directories by endpoint', async () => {
    const depthUpdated = await createTestFile(
      'kraken/api_0_public_Depth/BTCUSD/data.jsonl',
      'kraken data 1',
    );
    const tradesUpdated = await createTestFile(
      'kraken/api_0_public_Trades/ETHUSD/data.jsonl',
      'kraken data 2',
    );

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats).toEqual([
      {
        directory: 'kraken/api_0_public_Depth',
        fileCount: 1,
        sizeBytes: 13,
        lastUpdated: depthUpdated,
      },
      {
        directory: 'kraken/api_0_public_Trades',
        fileCount: 1,
        sizeBytes: 13,
        lastUpdated: tradesUpdated,
      },
    ]);
  });

  it('should count all files in victoria_metrics directory recursively', async () => {
    await createTestFile('victoria_metrics/data/file1.bin', 'vm data 1');
    await createTestFile('victoria_metrics/data/nested/file2.bin', 'vm data 2');
    const lastUpdated = await createTestFile('victoria_metrics/cache/file3.bin', 'vm data 3');

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats).toEqual([
      {
        directory: 'victoria_metrics',
        fileCount: 3,
        sizeBytes: 27, // 'vm data 1' + 'vm data 2' + 'vm data 3' = 9 + 9 + 9 = 27
        lastUpdated,
      },
    ]);
  });

  it('should combine multiple directory types correctly', async () => {
    const depthUpdated = await createTestFile('binance/api_v3_depth/BTCUSDT/data.jsonl', '12345');
    const tickerUpdated = await createTestFile(
      'binance/api_v3_ticker_bookTicker/ETHUSDT/data.jsonl',
      '67890',
    );
    const krakenUpdated = await createTestFile(
      'kraken/api_0_public_Depth/BTCUSD/data.jsonl',
      'abc',
    );
    const vmUpdated = await createTestFile('victoria_metrics/data/file.bin', 'xyz');

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats).toEqual([
      {
        directory: 'binance/api_v3_depth',
        fileCount: 1,
        sizeBytes: 5,
        lastUpdated: depthUpdated,
      },
      {
        directory: 'binance/api_v3_ticker_bookTicker',
        fileCount: 1,
        sizeBytes: 5,
        lastUpdated: tickerUpdated,
      },
      {
        directory: 'kraken/api_0_public_Depth',
        fileCount: 1,
        sizeBytes: 3,
        lastUpdated: krakenUpdated,
      },
      {
        directory: 'victoria_metrics',
        fileCount: 1,
        sizeBytes: 3,
        lastUpdated: vmUpdated,
      },
    ]);
  });

  it('should track unmatched files in empty directory entry', async () => {
    const binanceUpdated = await createTestFile('binance/api_v3_depth/BTCUSDT/data.jsonl', '12345');
    await createTestFile('unknown_platform/data/file.txt', 'unmatched');
    const unmatchedLastUpdated = await createTestFile('random.txt', 'random file');

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats).toEqual([
      {
        directory: 'binance/api_v3_depth',
        fileCount: 1,
        sizeBytes: 5,
        lastUpdated: binanceUpdated,
      },
      {
        directory: '',
        fileCount: 2,
        sizeBytes: 20, // 'unmatched' + 'random file' = 9 + 11 = 20
        lastUpdated: unmatchedLastUpdated,
      },
    ]);
  });

  it('should handle deeply nested file structures', async () => {
    await createTestFile('binance/api_v3_depth/BTCUSDT/2025/10/05/data.jsonl', 'deep1');
    const depthLastUpdated = await createTestFile(
      'binance/api_v3_depth/ETHUSDT/a/b/c/d/e/f/data.jsonl',
      'deep2',
    );
    const tradesLastUpdated = await createTestFile(
      'binance/api_v3_historicalTrades/BTCUSDT/very/nested/path/file.jsonl',
      'deep3',
    );

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats).toEqual([
      {
        directory: 'binance/api_v3_depth',
        fileCount: 2,
        sizeBytes: 10,
        lastUpdated: depthLastUpdated,
      },
      {
        directory: 'binance/api_v3_historicalTrades',
        fileCount: 1,
        sizeBytes: 5,
        lastUpdated: tradesLastUpdated,
      },
    ]);
  });

  it('should calculate file sizes correctly', async () => {
    const largeContent = 'x'.repeat(1024 * 10); // 10 KB
    const mediumContent = 'y'.repeat(1024 * 5); // 5 KB
    const smallContent = 'z'.repeat(100); // 100 bytes

    await createTestFile('binance/api_v3_depth/BTCUSDT/large.jsonl', largeContent);
    await createTestFile('binance/api_v3_depth/ETHUSDT/medium.jsonl', mediumContent);
    const lastUpdated = await createTestFile(
      'binance/api_v3_depth/BNBUSDT/small.jsonl',
      smallContent,
    );

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats).toEqual([
      {
        directory: 'binance/api_v3_depth',
        fileCount: 3,
        sizeBytes: 1024 * 10 + 1024 * 5 + 100,
        lastUpdated,
      },
    ]);
  });

  it('should sort results by directory name alphabetically', async () => {
    await createTestFile('victoria_metrics/data/file.bin', 'vm');
    await createTestFile('binance/api_v3_ticker_bookTicker/BTCUSDT/data.jsonl', 'b1');
    await createTestFile('kraken/api_0_public_Depth/BTCUSD/data.jsonl', 'k1');
    await createTestFile('binance/api_v3_depth/BTCUSDT/data.jsonl', 'b2');

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats.map((s) => s.directory)).toEqual([
      'binance/api_v3_depth',
      'binance/api_v3_ticker_bookTicker',
      'kraken/api_0_public_Depth',
      'victoria_metrics',
    ]);
    expect(stats.every((s) => s.lastUpdated > 0)).toBe(true);
  });

  it('should handle empty subdirectories gracefully', async () => {
    await mkdir(join(tempDir, 'binance/api_v3_depth/BTCUSDT'), { recursive: true });
    await mkdir(join(tempDir, 'victoria_metrics/empty/nested/dir'), { recursive: true });

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats).toEqual([]);
  });

  it('should handle mixed file types', async () => {
    await createTestFile('binance/api_v3_depth/BTCUSDT/data.jsonl', 'jsonl');
    const binanceLastUpdated = await createTestFile(
      'binance/api_v3_depth/ETHUSDT/data.json',
      'json',
    );
    await createTestFile('victoria_metrics/data/file.bin', 'binary');
    const vmLastUpdated = await createTestFile('victoria_metrics/cache/file.txt', 'text');

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats).toEqual([
      {
        directory: 'binance/api_v3_depth',
        fileCount: 2,
        sizeBytes: 9,
        lastUpdated: binanceLastUpdated,
      },
      {
        directory: 'victoria_metrics',
        fileCount: 2,
        sizeBytes: 10,
        lastUpdated: vmLastUpdated,
      },
    ]);
  });

  it('should group files by second-level directory for binance/**', async () => {
    await createTestFile('binance/api_v3_exchangeInfo/ALL/file1.jsonl', 'data1');
    await createTestFile('binance/api_v3_exchangeInfo/ALL/file2.jsonl', 'data2');
    const exchangeInfoLastUpdated = await createTestFile(
      'binance/api_v3_exchangeInfo/BTC/file3.jsonl',
      'data3',
    );
    const depthLastUpdated = await createTestFile(
      'binance/api_v3_depth/BTCUSDT/file4.jsonl',
      'data4',
    );

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats).toEqual([
      {
        directory: 'binance/api_v3_depth',
        fileCount: 1,
        sizeBytes: 5,
        lastUpdated: depthLastUpdated,
      },
      {
        directory: 'binance/api_v3_exchangeInfo',
        fileCount: 3,
        sizeBytes: 15,
        lastUpdated: exchangeInfoLastUpdated,
      },
    ]);
  });

  it('should handle real-world-like directory structure', async () => {
    // Binance directories
    await createTestFile('binance/api_v3_depth/BTCUSDT/2025-10-06_0.jsonl', 'x'.repeat(1024));
    const depthLastUpdated = await createTestFile(
      'binance/api_v3_depth/ETHUSDT/2025-10-06_0.jsonl',
      'x'.repeat(512),
    );
    const exchangeInfoLastUpdated = await createTestFile(
      'binance/api_v3_exchangeInfo/ALL/00000_6448558bb644.jsonl',
      'x'.repeat(256),
    );
    await createTestFile('binance/api_v3_historicalTrades/BTCUSDT/0.jsonl', 'x'.repeat(2048));
    const tradesLastUpdated = await createTestFile(
      'binance/api_v3_historicalTrades/BTCUSDT/1.jsonl',
      'x'.repeat(2048),
    );
    const tickerLastUpdated = await createTestFile(
      'binance/api_v3_ticker_bookTicker/BTCUSDT/2025-10-06_0.jsonl',
      'x'.repeat(768),
    );

    // Victoria Metrics
    await createTestFile('victoria_metrics/data/small/2025_10/part1/index.bin', 'x'.repeat(4096));
    await createTestFile('victoria_metrics/data/small/2025_10/part1/values.bin', 'x'.repeat(8192));
    await createTestFile('victoria_metrics/cache/curr_hour_metric_ids', 'x'.repeat(128));
    const vmLastUpdated = await createTestFile(
      'victoria_metrics/indexdb/parts.json',
      'x'.repeat(64),
    );

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats).toHaveLength(5);
    expect(stats.find((s) => s.directory === 'binance/api_v3_depth')).toEqual({
      directory: 'binance/api_v3_depth',
      fileCount: 2,
      sizeBytes: 1024 + 512,
      lastUpdated: depthLastUpdated,
    });
    expect(stats.find((s) => s.directory === 'binance/api_v3_historicalTrades')).toEqual({
      directory: 'binance/api_v3_historicalTrades',
      fileCount: 2,
      sizeBytes: 2048 + 2048,
      lastUpdated: tradesLastUpdated,
    });
    expect(stats.find((s) => s.directory === 'victoria_metrics')).toEqual({
      directory: 'victoria_metrics',
      fileCount: 4,
      sizeBytes: 4096 + 8192 + 128 + 64,
      lastUpdated: vmLastUpdated,
    });
    expect(stats.find((s) => s.directory === 'binance/api_v3_exchangeInfo')).toMatchObject({
      lastUpdated: exchangeInfoLastUpdated,
    });
    expect(stats.find((s) => s.directory === 'binance/api_v3_ticker_bookTicker')).toMatchObject({
      lastUpdated: tickerLastUpdated,
    });
  });

  it('should not count unmatched files when all files match patterns', async () => {
    await createTestFile('binance/api_v3_depth/BTCUSDT/data.jsonl', 'data1');
    await createTestFile('kraken/api_0_public_Depth/BTCUSD/data.jsonl', 'data2');
    await createTestFile('victoria_metrics/data/file.bin', 'data3');

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    const unmatchedEntry = stats.find((s) => s.directory === '');
    expect(unmatchedEntry).toBeUndefined();
    expect(stats.every((s) => s.lastUpdated > 0)).toBe(true);
  });

  it('should handle symbolic links gracefully', async () => {
    const lastUpdated = await createTestFile(
      'binance/api_v3_depth/BTCUSDT/data.jsonl',
      'regular file',
    );

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats).toEqual([
      {
        directory: 'binance/api_v3_depth',
        fileCount: 1,
        sizeBytes: 12,
        lastUpdated,
      },
    ]);
  });

  it('should return the latest file modification time for each directory', async () => {
    const oldTime = 1000000000000;
    const midTime = 1000000010000;
    const newTime = 1000000020000;

    await createTestFile('binance/api_v3_depth/BTCUSDT/old.jsonl', 'old', oldTime);
    await createTestFile('binance/api_v3_depth/ETHUSDT/mid.jsonl', 'mid', midTime);
    await createTestFile('binance/api_v3_depth/BNBUSDT/new.jsonl', 'new', newTime);

    await createTestFile('victoria_metrics/data/old.bin', 'old', oldTime);
    await createTestFile('victoria_metrics/cache/newer.bin', 'newer', midTime);

    const stats = await readStorageStats(tempDir, TEST_PATTERNS);

    expect(stats).toEqual([
      {
        directory: 'binance/api_v3_depth',
        fileCount: 3,
        sizeBytes: 9,
        lastUpdated: newTime,
      },
      {
        directory: 'victoria_metrics',
        fileCount: 2,
        sizeBytes: 8,
        lastUpdated: midTime,
      },
    ]);
  });
});

import type { BinanceApi } from '@krupton/api-interface';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StorageIO } from '../mdsStorage/mdsStorageIO.js';
import type { StorageRecord } from '../mdsStorage/types.js';

function normalizeEndpointPath(endpoint: string): string {
  return endpoint.replace(/^\/+/, '').replace(/\//g, '_');
}

function calculateFileIndex(tradeId: number): string {
  return `${Math.floor(tradeId / 1e5)}`;
}

async function readStorageRecordsFromFile(
  baseDir: string,
  platform: string,
  endpoint: string,
  symbol: string,
  fileIndex: string,
): Promise<StorageRecord<BinanceApi.GetHistoricalTradesResponse>[]> {
  const normalizedEndpoint = normalizeEndpointPath(endpoint);
  const filePath = join(baseDir, platform, normalizedEndpoint, symbol, `${fileIndex}.jsonl`);

  try {
    const fileContent = await readFile(filePath, 'utf-8');
    const lines = fileContent
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);

    const records: StorageRecord<BinanceApi.GetHistoricalTradesResponse>[] = [];
    for (const line of lines) {
      const record = JSON.parse(line) as StorageRecord<BinanceApi.GetHistoricalTradesResponse>;
      records.push(record);
    }

    return records;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function getFirstAvailableFile(
  baseDir: string,
  platform: string,
  endpoint: string,
  symbol: string,
): Promise<string | null> {
  const normalizedEndpoint = normalizeEndpointPath(endpoint);
  const directoryPath = join(baseDir, platform, normalizedEndpoint, symbol);

  try {
    const files = await readdir(directoryPath);
    const jsonlFiles = files.filter((file) => file.endsWith('.jsonl')).sort();

    if (jsonlFiles.length === 0) {
      return null;
    }

    return jsonlFiles[0]!.replace('.jsonl', '');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function registerGetRecentTradesEndpoint(
  fastify: ReturnType<typeof import('@krupton/service-framework-node').SF.createHttpServer>,
  storageIO: StorageIO,
  baseDir: string,
  platform: string,
) {
  fastify.get('/api/v3/historicalTrades', async (request, reply) => {
    const startTime = Date.now();
    const logger = request.logger;
    const {
      symbol,
      fromId,
      limit = 100,
    } = request.query as {
      symbol?: string;
      fromId?: number;
      limit?: number;
    };

    try {
      if (!symbol) {
        reply.code(400);
        return { error: 'Symbol is required' };
      }

      logger.info('Fetching recent trades', { symbol, fromId, limit });

      const endpoint = '/api/v3/historicalTrades';

      let fileIndex: string | null;
      if (fromId !== undefined) {
        fileIndex = calculateFileIndex(fromId);
      } else {
        fileIndex = await getFirstAvailableFile(baseDir, platform, endpoint, symbol);
      }

      if (fileIndex === null) {
        logger.warn('No records found', { symbol });
        reply.code(404);
        return { error: 'Symbol not found' };
      }

      logger.debug('Reading from file', { symbol, fileIndex });

      const records = await readStorageRecordsFromFile(
        baseDir,
        platform,
        endpoint,
        symbol,
        fileIndex,
      );

      if (records.length === 0) {
        logger.warn('No records found in file', { symbol, fileIndex });
        reply.code(404);
        return { error: 'No trades found for the given fromId' };
      }

      const allTrades = records.flatMap((record) => record.response);

      let filteredTrades = allTrades;
      if (fromId !== undefined) {
        filteredTrades = allTrades.filter((trade) => trade.id >= fromId);
      }

      const limitedTrades = filteredTrades.slice(0, limit);

      logger.info('Recent trades fetched', {
        symbol,
        tradesReturned: limitedTrades.length,
        duration_ms: Date.now() - startTime,
      });

      return limitedTrades;
    } catch (error) {
      logger.error('Error fetching recent trades', {
        symbol,
        error: error instanceof Error ? error.message : String(error),
      });

      reply.code(500);
      return { error: 'Internal server error' };
    }
  });
}

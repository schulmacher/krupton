import type { ExtractEndpointParams } from '@krupton/api-client-node';
import { BinanceApi } from '@krupton/api-interface';
import type { TB } from '@krupton/service-framework-node/typebox';
import { arrayToMultiMap } from '@krupton/utils';
import type { EndpointEntity } from '../lib/endpointStorage.ts/endpointEntity.js';
import type { EndpointStorage, StorageRecord } from '../lib/endpointStorage.ts/endpointStorage.js';
import { createEndpointStorage } from '../lib/endpointStorage.ts/endpointStorage.js';

export type BinanceHistoricalTradeStorage = EndpointStorage<
  typeof BinanceApi.GetHistoricalTradesEndpoint
>;
export type BinanceHistoricalTradeEntity = ReturnType<typeof createBinanceHistoricalTradeEntity>;

type HistoricalTradeResponse = TB.Static<
  typeof BinanceApi.GetHistoricalTradesEndpoint.responseSchema
>;
type HistoricalTradeRequest = ExtractEndpointParams<typeof BinanceApi.GetHistoricalTradesEndpoint>;
type HistoricalTradeRecord = StorageRecord<HistoricalTradeResponse, HistoricalTradeRequest>;

function calculateFileIndex(tradeId: number): string {
  const fileNumber = Math.floor(tradeId / 1e5);
  return `${fileNumber}`;
}

function calculateFilePathWithIndex(symbol: string, tradeId: number): string {
  return `${symbol}/${calculateFileIndex(tradeId)}`;
}

function parseFileIndex(fileName: string): number {
  return parseInt(fileName, 10);
}

function createBinanceHistoricalTradeStorage(baseDir: string): BinanceHistoricalTradeStorage {
  return createEndpointStorage(baseDir, BinanceApi.GetHistoricalTradesEndpoint);
}

export function createBinanceHistoricalTradeEntity(baseDir: string) {
  const storage = createBinanceHistoricalTradeStorage(baseDir);

  return {
    storage,

    async write(params: {
      request: HistoricalTradeRequest;
      response: HistoricalTradeResponse;
    }): Promise<void> {
      const timestamp = Date.now();
      const symbol = params.request.query?.symbol;

      if (!symbol) {
        throw new Error('Symbol is required in request params');
      }

      if (!Array.isArray(params.response) || params.response.length === 0) {
        return;
      }

      const partitionedByIndex = arrayToMultiMap(params.response, (trade) =>
        calculateFilePathWithIndex(symbol, trade.id),
      );

      for (const [filePathWithIndex, trades] of partitionedByIndex.entries()) {
        await storage.appendRecord({
          record: {
            timestamp,
            request: params.request,
            response: trades as HistoricalTradeResponse,
          },
          relativePath: filePathWithIndex,
        });
      }
    },

    async readLatestRecord(symbol: string): Promise<HistoricalTradeRecord | null> {
      const fileNames = await storage.listFileNames(symbol);

      if (fileNames.length === 0) {
        return null;
      }

      const sortedFiles = fileNames.sort((a, b) => {
        return parseFileIndex(a) - parseFileIndex(b);
      });

      const latestFileName = sortedFiles[sortedFiles.length - 1]!;
      const relativePath = `${symbol}/${latestFileName}`;

      const records = await storage.readRecords({ relativePath });

      if (records.length === 0) {
        return null;
      }

      return records[records.length - 1]!;
    },
  } satisfies EndpointEntity<typeof BinanceApi.GetHistoricalTradesEndpoint>;
}

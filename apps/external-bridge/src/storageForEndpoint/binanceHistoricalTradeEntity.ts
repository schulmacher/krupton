import { BinanceApi } from '@krupton/api-interface';
import type { EndpointEntity } from '../lib/persistentStorage/endpointEntity.js';
import {
  createEndpointStorage,
  type EndpointStorage,
  type EndpointStorageRecord,
} from '../lib/persistentStorage/endpointStorage.js';

export type BinanceHistoricalTradeStorage = EndpointStorage<
  typeof BinanceApi.GetHistoricalTradesEndpoint
>;
export type BinanceHistoricalTradeEntity = ReturnType<typeof createBinanceHistoricalTradeEntity>;

type HistoricalTradeRecord = EndpointStorageRecord<typeof BinanceApi.GetHistoricalTradesEndpoint>;

function createBinanceHistoricalTradeStorage(baseDir: string): BinanceHistoricalTradeStorage {
  return createEndpointStorage(baseDir, BinanceApi.GetHistoricalTradesEndpoint);
}

export function createBinanceHistoricalTradeEntity(baseDir: string) {
  const storage = createBinanceHistoricalTradeStorage(baseDir);

  return {
    storage,

    async write(params: {
      request: BinanceApi.GetHistoricalTradesRequest;
      response: BinanceApi.GetHistoricalTradesResponse;
    }): Promise<void> {
      const timestamp = Date.now();
      const symbol = params.request.query?.symbol;

      if (!symbol) {
        throw new Error('Symbol is required in request params');
      }

      if (!Array.isArray(params.response) || params.response.length === 0) {
        return;
      }

      await storage.appendRecord({
        subIndexDir: symbol,
        record: {
          timestamp,
          request: params.request,
          response: params.response,
        },
      });
    },

    async readLatestRecord(symbol: string): Promise<HistoricalTradeRecord | null> {
      return await storage.readLastRecord(symbol);
    },
  } satisfies EndpointEntity<typeof BinanceApi.GetHistoricalTradesEndpoint>;
}

import { BinanceApi } from '@krupton/api-interface';
import type { EndpointEntity } from '../endpointEntity.js';
import { EndpointStorageRecord } from '../endpointStorage.js';
import type { BinanceHistoricalTradeStorage } from './binanceHistoricalTradeStorage.js';

export type BinanceHistoricalTradeEntity = ReturnType<typeof createBinanceHistoricalTradeEntity>;

type HistoricalTradeRecord = EndpointStorageRecord<typeof BinanceApi.GetHistoricalTradesEndpoint>;

export function createBinanceHistoricalTradeEntity(storage: BinanceHistoricalTradeStorage) {

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

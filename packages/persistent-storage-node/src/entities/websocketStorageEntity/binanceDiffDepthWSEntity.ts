import { BinanceWS } from '@krupton/api-interface';
import type { WebSocketEntity, WebsocketEntityInput } from '../websocketEntity.js';
import { WebSocketStorageRecord } from '../websocketStorage.js';
import type { BinanceDiffDepthWSStorage } from './binanceDiffDepthWSStorage.js';

export type BinanceDiffDepthWSEntity = ReturnType<typeof createBinanceDiffDepthWSEntity>;
export type BinanceDiffDepthEntityInput = WebsocketEntityInput<typeof BinanceWS.DiffDepthStream>;

export type BinanceDiffDepthStorageRecord = WebSocketStorageRecord<typeof BinanceWS.DiffDepthStream>;

export function createBinanceDiffDepthWSEntity(storage: BinanceDiffDepthWSStorage) {

  return {
    storage,

    async write(params: BinanceDiffDepthEntityInput): Promise<void> {
      const timestamp = Date.now();
      const symbol = params.message.data.s;

      if (!symbol) {
        throw new Error('Symbol is required in message');
      }

      await storage.appendRecord({
        subIndexDir: symbol,
        record: {
          timestamp,
          message: params.message,
        },
      });
    },

    async readLatestRecord(symbol: string): Promise<BinanceDiffDepthStorageRecord | null> {
      return await storage.readLastRecord(symbol);
    },
  } satisfies WebSocketEntity<typeof BinanceWS.DiffDepthStream>;
}


import { BinanceWS } from '@krupton/api-interface';
import type { WebSocketEntity, WebsocketEntityInput } from '../../websocketEntity.js';
import {
  createWebSocketStorage,
  WebSocketStorage,
  WebSocketStorageRecord,
} from '../../websocketStorage.js';

export type BinanceDiffDepthWSStorage = WebSocketStorage<typeof BinanceWS.DiffDepthStream>;
export type BinanceDiffDepthWSEntity = ReturnType<typeof createBinanceDiffDepthWSEntity>;
export type BinanceDiffDepthEntityInput = WebsocketEntityInput<typeof BinanceWS.DiffDepthStream>;

type DiffDepthRecord = WebSocketStorageRecord<typeof BinanceWS.DiffDepthStream>;

function createBinanceDiffDepthWSStorage(baseDir: string): BinanceDiffDepthWSStorage {
  return createWebSocketStorage(baseDir, BinanceWS.DiffDepthStream);
}

export function createBinanceDiffDepthWSEntity(baseDir: string) {
  const storage = createBinanceDiffDepthWSStorage(baseDir);

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

    async readLatestRecord(symbol: string): Promise<DiffDepthRecord | null> {
      return await storage.readLastRecord(symbol);
    },
  } satisfies WebSocketEntity<typeof BinanceWS.DiffDepthStream>;
}


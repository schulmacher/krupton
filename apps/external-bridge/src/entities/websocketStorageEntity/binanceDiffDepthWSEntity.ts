import { BinanceWS } from '@krupton/api-interface';
import type { WebSocketEntity, WebsocketEntityInput } from '../../lib/persistentStorage/websocketEntity.js';
import {
  createWebSocketStorage,
  WebSocketStorage,
  WebSocketStorageRecord,
} from '../../lib/persistentStorage/websocketStorage.js';
import { normalizeSymbol } from '../../lib/symbol/normalizeSymbol.js';

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

      const normalizedSymbol = normalizeSymbol('binance', symbol);

      await storage.appendRecord({
        subIndexDir: normalizedSymbol,
        record: {
          timestamp,
          message: params.message,
        },
      });
    },

    async readLatestRecord(normalizedSymbol: string): Promise<DiffDepthRecord | null> {
      return await storage.readLastRecord(normalizedSymbol);
    },
  } satisfies WebSocketEntity<typeof BinanceWS.DiffDepthStream>;
}


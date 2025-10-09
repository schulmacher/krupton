import { BinanceWS } from '@krupton/api-interface';
import type {
  WebSocketEntity,
  WebsocketEntityInput,
} from '../../lib/persistentStorage/websocketEntity.js';
import {
  createWebSocketStorage,
  WebSocketStorage,
  WebSocketStorageRecord,
} from '../../lib/persistentStorage/websocketStorage.js';
import { normalizeSymbol } from '../../lib/symbol/normalizeSymbol.js';

export type BinancePartialDepthWSStorage = WebSocketStorage<
  typeof BinanceWS.PartialBookDepthStream
>;
export type BinancePartialDepthWSEntity = ReturnType<typeof createBinancePartialDepthWSEntity>;
export type BinancePartialDepthEntityInput = WebsocketEntityInput<
  typeof BinanceWS.PartialBookDepthStream
>;

type PartialDepthRecord = WebSocketStorageRecord<typeof BinanceWS.PartialBookDepthStream>;

function createBinancePartialDepthWSStorage(baseDir: string): BinancePartialDepthWSStorage {
  return createWebSocketStorage(baseDir, BinanceWS.PartialBookDepthStream);
}

export function createBinancePartialDepthWSEntity(baseDir: string) {
  const storage = createBinancePartialDepthWSStorage(baseDir);

  return {
    storage,

    async write(params: BinancePartialDepthEntityInput): Promise<void> {
      const timestamp = Date.now();
      const symbol = params.message.stream.split('@')[0];

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

    async readLatestRecord(normalizedSymbol: string): Promise<PartialDepthRecord | null> {
      return await storage.readLastRecord(normalizedSymbol);
    },
  } satisfies WebSocketEntity<
    typeof BinanceWS.PartialBookDepthStream,
    BinancePartialDepthEntityInput
  >;
}

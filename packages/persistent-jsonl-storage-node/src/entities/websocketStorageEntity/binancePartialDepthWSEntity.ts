import { BinanceWS } from '@krupton/api-interface';
import type {
  WebSocketEntity,
  WebsocketEntityInput,
} from '../../websocketEntity.js';
import {
  createWebSocketStorage,
  WebSocketStorage,
  WebSocketStorageRecord,
} from '../../websocketStorage.js';

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

      await storage.appendRecord({
        subIndexDir: symbol,
        record: {
          timestamp,
          message: params.message,
        },
      });
    },

    async readLatestRecord(symbol: string): Promise<PartialDepthRecord | null> {
      return await storage.readLastRecord(symbol);
    },
  } satisfies WebSocketEntity<
    typeof BinanceWS.PartialBookDepthStream,
    BinancePartialDepthEntityInput
  >;
}

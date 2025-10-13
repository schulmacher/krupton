import { BinanceWS } from '@krupton/api-interface';
import type {
  WebSocketEntity,
  WebsocketEntityInput,
} from '../websocketEntity.js';
import { WebSocketStorageRecord } from '../websocketStorage.js';
import type { BinancePartialDepthWSStorage } from './binancePartialDepthWSStorage.js';

export type BinancePartialDepthWSEntity = ReturnType<typeof createBinancePartialDepthWSEntity>;
export type BinancePartialDepthEntityInput = WebsocketEntityInput<
  typeof BinanceWS.PartialBookDepthStream
>;

type PartialDepthRecord = WebSocketStorageRecord<typeof BinanceWS.PartialBookDepthStream>;

export function createBinancePartialDepthWSEntity(storage: BinancePartialDepthWSStorage) {

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

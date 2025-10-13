import { KrakenWS } from '@krupton/api-interface';
import type { WebSocketEntity, WebsocketEntityInput } from '../websocketEntity.js';
import { WebSocketStorageRecord } from '../websocketStorage.js';
import type { KrakenBookWSStorage } from './krakenBookWSStorage.js';

export type KrakenBookWSEntity = ReturnType<typeof createKrakenBookWSEntity>;
export type KrakenBookEntityInput = WebsocketEntityInput<typeof KrakenWS.BookStream>;

type BookRecord = WebSocketStorageRecord<typeof KrakenWS.BookStream>;

export function createKrakenBookWSEntity(storage: KrakenBookWSStorage) {
  return {
    storage,

    async write(params: KrakenBookEntityInput): Promise<void> {
      const timestamp = Date.now();
      const symbol = params.message.data[0]?.symbol;

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

    async readLatestRecord(symbol: string): Promise<BookRecord | null> {
      return await storage.readLastRecord(symbol);
    },
  } satisfies WebSocketEntity<typeof KrakenWS.BookStream>;
}


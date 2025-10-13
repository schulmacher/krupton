import { KrakenWS } from '@krupton/api-interface';
import type { WebSocketEntity, WebsocketEntityInput } from '../websocketEntity.js';
import { WebSocketStorageRecord } from '../websocketStorage.js';
import type { KrakenTickerWSStorage } from './krakenTickerWSStorage.js';

export type KrakenTickerWSEntity = ReturnType<typeof createKrakenTickerWSEntity>;
export type KrakenTickerEntityInput = WebsocketEntityInput<typeof KrakenWS.TickerStream>;

type TickerRecord = WebSocketStorageRecord<typeof KrakenWS.TickerStream>;

export function createKrakenTickerWSEntity(storage: KrakenTickerWSStorage) {
  return {
    storage,

    async write(params: KrakenTickerEntityInput): Promise<void> {
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

    async readLatestRecord(normalizedSymbol: string): Promise<TickerRecord | null> {
      return await storage.readLastRecord(normalizedSymbol);
    },
  } satisfies WebSocketEntity<typeof KrakenWS.TickerStream>;
}


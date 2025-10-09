import { KrakenWS } from '@krupton/api-interface';
import type { WebSocketEntity, WebsocketEntityInput } from '../../lib/persistentStorage/websocketEntity.js';
import {
  createWebSocketStorage,
  WebSocketStorage,
  WebSocketStorageRecord,
} from '../../lib/persistentStorage/websocketStorage.js';
import { normalizeSymbol } from '../../lib/symbol/normalizeSymbol.js';

export type KrakenBookWSStorage = WebSocketStorage<typeof KrakenWS.BookStream>;
export type KrakenBookWSEntity = ReturnType<typeof createKrakenBookWSEntity>;
export type KrakenBookEntityInput = WebsocketEntityInput<typeof KrakenWS.BookStream>;

type BookRecord = WebSocketStorageRecord<typeof KrakenWS.BookStream>;

function createKrakenBookWSStorage(baseDir: string): KrakenBookWSStorage {
  return createWebSocketStorage(baseDir, KrakenWS.BookStream);
}

export function createKrakenBookWSEntity(baseDir: string) {
  const storage = createKrakenBookWSStorage(baseDir);

  return {
    storage,

    async write(params: KrakenBookEntityInput): Promise<void> {
      const timestamp = Date.now();
      const symbol = params.message.data[0]?.symbol;

      if (!symbol) {
        throw new Error('Symbol is required in message');
      }

      const normalizedSymbol = normalizeSymbol('kraken', symbol);

      await storage.appendRecord({
        subIndexDir: normalizedSymbol,
        record: {
          timestamp,
          message: params.message,
        },
      });
    },

    async readLatestRecord(normalizedSymbol: string): Promise<BookRecord | null> {
      return await storage.readLastRecord(normalizedSymbol);
    },
  } satisfies WebSocketEntity<typeof KrakenWS.BookStream>;
}


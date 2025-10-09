import { KrakenWS } from '@krupton/api-interface';
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

export type KrakenTradeWSStorage = WebSocketStorage<typeof KrakenWS.TradeStream>;
export type KrakenTradeWSEntity = ReturnType<typeof createKrakenTradeWSEntity>;
export type KrakenTradeEntityInput = WebsocketEntityInput<typeof KrakenWS.TradeStream>;

type TradeRecord = WebSocketStorageRecord<typeof KrakenWS.TradeStream>;

function createKrakenTradeWSStorage(baseDir: string): KrakenTradeWSStorage {
  return createWebSocketStorage(baseDir, KrakenWS.TradeStream);
}

export function createKrakenTradeWSEntity(baseDir: string) {
  const storage = createKrakenTradeWSStorage(baseDir);

  return {
    storage,

    async write(params: KrakenTradeEntityInput): Promise<void> {
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

    async readLatestRecord(normalizedSymbol: string): Promise<TradeRecord | null> {
      return await storage.readLastRecord(normalizedSymbol);
    },
  } satisfies WebSocketEntity<typeof KrakenWS.TradeStream>;
}

import { KrakenWS } from '@krupton/api-interface';
import type {
  WebSocketEntity,
  WebsocketEntityInput,
} from '../websocketEntity.js';
import { WebSocketStorageRecord } from '../websocketStorage.js';
import type { KrakenTradeWSStorage } from './krakenTradeWSStorage.js';

export type KrakenTradeWSEntity = ReturnType<typeof createKrakenTradeWSEntity>;
export type KrakenTradeEntityInput = WebsocketEntityInput<typeof KrakenWS.TradeStream>;

type TradeRecord = WebSocketStorageRecord<typeof KrakenWS.TradeStream>;

export function createKrakenTradeWSEntity(storage: KrakenTradeWSStorage) {
  return {
    storage,

    async write(params: KrakenTradeEntityInput): Promise<void> {
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

    async readLatestRecord(symbol: string): Promise<TradeRecord | null> {
      return await storage.readLastRecord(symbol);
    },
  } satisfies WebSocketEntity<typeof KrakenWS.TradeStream>;
}

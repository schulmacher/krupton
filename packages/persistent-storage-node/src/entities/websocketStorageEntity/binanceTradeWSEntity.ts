import { BinanceWS } from '@krupton/api-interface';
import type { WebSocketEntity, WebsocketEntityInput } from '../websocketEntity.js';
import { WebSocketStorageRecord } from '../websocketStorage.js';
import type { BinanceTradeWSStorage } from './binanceTradeWSStorage.js';

export type BinanceTradeWSEntity = ReturnType<typeof createBinanceTradeWSEntity>;
export type BinanceTradeEntityInput = WebsocketEntityInput<typeof BinanceWS.TradeStream>;

type TradeRecord = WebSocketStorageRecord<typeof BinanceWS.TradeStream>;

export function createBinanceTradeWSEntity(storage: BinanceTradeWSStorage) {
  return {
    storage,

    async write(params: BinanceTradeEntityInput): Promise<void> {
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

    async readLatestRecord(symbol: string): Promise<TradeRecord | null> {
      return await storage.readLastRecord(symbol);
    },
  } satisfies WebSocketEntity<typeof BinanceWS.TradeStream>;
}


import { BinanceWS } from '@krupton/api-interface';
import type { WebSocketEntity, WebsocketEntityInput } from '../../websocketEntity.js';
import {
  createWebSocketStorage,
  WebSocketStorage,
  WebSocketStorageRecord,
} from '../../websocketStorage.js';

export type BinanceTradeWSStorage = WebSocketStorage<typeof BinanceWS.TradeStream>;
export type BinanceTradeWSEntity = ReturnType<typeof createBinanceTradeWSEntity>;
export type BinanceTradeEntityInput = WebsocketEntityInput<typeof BinanceWS.TradeStream>;

type TradeRecord = WebSocketStorageRecord<typeof BinanceWS.TradeStream>;

function createBinanceTradeWSStorage(baseDir: string): BinanceTradeWSStorage {
  return createWebSocketStorage(baseDir, BinanceWS.TradeStream);
}

export function createBinanceTradeWSEntity(baseDir: string) {
  const storage = createBinanceTradeWSStorage(baseDir);

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


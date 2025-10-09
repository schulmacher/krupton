import { BinanceWS } from '@krupton/api-interface';
import type { WebSocketEntity, WebsocketEntityInput } from '../../lib/persistentStorage/websocketEntity.js';
import {
  createWebSocketStorage,
  WebSocketStorage,
  WebSocketStorageRecord,
} from '../../lib/persistentStorage/websocketStorage.js';
import { normalizeSymbol } from '../../lib/symbol/normalizeSymbol.js';

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

      const normalizedSymbol = normalizeSymbol('binance', symbol);

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
  } satisfies WebSocketEntity<typeof BinanceWS.TradeStream>;
}


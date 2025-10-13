import { join } from 'node:path';
import { BinanceWS } from '@krupton/api-interface';
import {
  createWebSocketStorage,
  WebSocketStorage,
} from '../websocketStorage.js';

export type BinanceTradeWSStorage = WebSocketStorage<typeof BinanceWS.TradeStream>;

export function createBinanceTradeWSStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): BinanceTradeWSStorage {
  const baseDir = join(storageBaseDir, 'binance');
  return createWebSocketStorage(baseDir, BinanceWS.TradeStream, options);
}


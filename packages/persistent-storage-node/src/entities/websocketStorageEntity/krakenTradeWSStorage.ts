import { join } from 'node:path';
import { KrakenWS } from '@krupton/api-interface';
import {
  createWebSocketStorage,
  WebSocketStorage,
} from '../websocketStorage.js';

export type KrakenTradeWSStorage = WebSocketStorage<typeof KrakenWS.TradeStream>;

export function createKrakenTradeWSStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): KrakenTradeWSStorage {
  const baseDir = join(storageBaseDir, 'kraken');
  return createWebSocketStorage(baseDir, KrakenWS.TradeStream, options);
}


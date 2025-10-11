import { join } from 'node:path';
import {
  createBinanceDiffDepthWSEntity,
  type BinanceDiffDepthWSEntity,
} from './websocketStorageEntity/binanceDiffDepthWSEntity.js';
import {
  createBinancePartialDepthWSEntity,
  type BinancePartialDepthWSEntity,
} from './websocketStorageEntity/binancePartialDepthWSEntity.js';
import {
  createBinanceTradeWSEntity,
  type BinanceTradeWSEntity,
} from './websocketStorageEntity/binanceTradeWSEntity.js';
import {
  createKrakenBookWSEntity,
  type KrakenBookWSEntity,
} from './websocketStorageEntity/krakenBookWSEntity.js';
import {
  createKrakenTickerWSEntity,
  type KrakenTickerWSEntity,
} from './websocketStorageEntity/krakenTickerWSEntity.js';
import {
  createKrakenTradeWSEntity,
  type KrakenTradeWSEntity,
} from './websocketStorageEntity/krakenTradeWSEntity.js';

export function createWebsocketStorageRepository(storageBaseDir: string): {
  binanceTrade: BinanceTradeWSEntity;
  binancePartialDepth: BinancePartialDepthWSEntity;
  binanceDiffDepth: BinanceDiffDepthWSEntity;
  krakenTicker: KrakenTickerWSEntity;
  krakenTrade: KrakenTradeWSEntity;
  krakenBook: KrakenBookWSEntity;
} {
  const binanceBaseDir = join(storageBaseDir, 'binance');
  const krakenBaseDir = join(storageBaseDir, 'kraken');

  return {
    binanceTrade: createBinanceTradeWSEntity(binanceBaseDir),
    binancePartialDepth: createBinancePartialDepthWSEntity(binanceBaseDir),
    binanceDiffDepth: createBinanceDiffDepthWSEntity(binanceBaseDir),
    krakenTicker: createKrakenTickerWSEntity(krakenBaseDir),
    krakenTrade: createKrakenTradeWSEntity(krakenBaseDir),
    krakenBook: createKrakenBookWSEntity(krakenBaseDir),
  };
}

export type WebSocketStorageRepository = ReturnType<typeof createWebsocketStorageRepository>;

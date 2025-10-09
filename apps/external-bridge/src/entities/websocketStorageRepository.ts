import { join } from 'node:path';
import { createBinanceDiffDepthWSEntity } from './websocketStorageEntity/binanceDiffDepthWSEntity';
import { createBinancePartialDepthWSEntity } from './websocketStorageEntity/binancePartialDepthWSEntity';
import { createBinanceTradeWSEntity } from './websocketStorageEntity/binanceTradeWSEntity';
import { createKrakenBookWSEntity } from './websocketStorageEntity/krakenBookWSEntity';
import { createKrakenTickerWSEntity } from './websocketStorageEntity/krakenTickerWSEntity';
import { createKrakenTradeWSEntity } from './websocketStorageEntity/krakenTradeWSEntity';

export function createWebsocketStorageRepository(storageBaseDir: string) {
  const binanceBaseDSir = join(storageBaseDir, 'binance');
  const krakenBaseDir = join(storageBaseDir, 'kraken');

  return {
    binanceTrade: createBinanceTradeWSEntity(binanceBaseDSir),
    binancePartialDepth: createBinancePartialDepthWSEntity(binanceBaseDSir),
    binanceDiffDepth: createBinanceDiffDepthWSEntity(binanceBaseDSir),
    krakenTicker: createKrakenTickerWSEntity(krakenBaseDir),
    krakenTrade: createKrakenTradeWSEntity(krakenBaseDir),
    krakenBook: createKrakenBookWSEntity(krakenBaseDir),
  };
}

export type WebSocketStorageRepository = ReturnType<typeof createWebsocketStorageRepository>;

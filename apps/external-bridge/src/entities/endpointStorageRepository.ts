import { join } from 'node:path';
import { createBinanceBookTickerEntity } from './endpointStorageEntity/binanceBookTickerEntity.js';
import { createBinanceExchangeInfoEntity } from './endpointStorageEntity/binanceExchangeInfoEntity.js';
import { createBinanceHistoricalTradeEntity } from './endpointStorageEntity/binanceHistoricalTradeEntity.js';
import { createBinanceOrderBookEntity } from './endpointStorageEntity/binanceOrderBookEntity.js';

export function createEndpointStorageRepository(storageBaseDir: string, platform: string) {
  const baseDir = join(storageBaseDir, platform);

  return {
    binanceBookTicker: createBinanceBookTickerEntity(baseDir),
    binanceOrderBook: createBinanceOrderBookEntity(baseDir),
    binanceHistoricalTrade: createBinanceHistoricalTradeEntity(baseDir),
    binanceExchangeInfo: createBinanceExchangeInfoEntity(baseDir),
  };
}

export type EndpointStorageRepository = ReturnType<typeof createEndpointStorageRepository>;

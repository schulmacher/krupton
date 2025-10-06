import { join } from 'node:path';
import { createBinanceBookTickerEntity } from './storageEntity/binanceBookTickerEntity.js';
import { createBinanceExchangeInfoEntity } from './storageEntity/binanceExchangeInfoEntity.js';
import { createBinanceHistoricalTradeEntity } from './storageEntity/binanceHistoricalTradeEntity.js';
import { createBinanceOrderBookEntity } from './storageEntity/binanceOrderBookEntity.js';

type ContextWithStorageDir = {
  envContext: {
    config: {
      STORAGE_BASE_DIR: string;
      PLATFORM: string;
    };
  };
};

export const createEndpointStorageRepository = (context: ContextWithStorageDir) => {
  const { envContext } = context;
  const platform = envContext.config.PLATFORM;
  const baseDir = join(envContext.config.STORAGE_BASE_DIR, platform);

  return {
    binanceBookTicker: createBinanceBookTickerEntity(baseDir),
    binanceOrderBook: createBinanceOrderBookEntity(baseDir),
    binanceHistoricalTrade: createBinanceHistoricalTradeEntity(baseDir),
    binanceExchangeInfo: createBinanceExchangeInfoEntity(baseDir),
  };
};

export type EndpointStorageRepository = ReturnType<typeof createEndpointStorageRepository>;

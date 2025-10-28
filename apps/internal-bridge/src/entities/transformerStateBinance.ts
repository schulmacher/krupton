import { createPersistentStorage } from '@krupton/persistent-storage-node';
import { join } from 'node:path';
import { TransformerState } from './types.js';

export const createBinanceHistoricalTradesTransformerStateStorage = (
  baseDir: string,
  options: { writable: boolean },
) => {
  const transformerStateBaseDir = join(baseDir, 'transformer', 'binance_historical_trades');

  return createPersistentStorage<TransformerState>(transformerStateBaseDir, options);
};

export const createBinanceWSTradesTransformerStateStorage = (
  baseDir: string,
  options: { writable: boolean },
) => {
  const transformerStateBaseDir = join(baseDir, 'transformer', 'binance_ws_trades');

  return createPersistentStorage<TransformerState>(transformerStateBaseDir, options);
};

export const createBinanceOrderBookTransformerStateStorage = (
  baseDir: string,
  options: { writable: boolean },
) => {
  const transformerStateBaseDir = join(baseDir, 'transformer', 'binance_order_book');

  return createPersistentStorage<TransformerState>(transformerStateBaseDir, options);
};

export const createBinanceDiffDepthTransformerStateStorage = (
  baseDir: string,
  options: { writable: boolean },
) => {
  const transformerStateBaseDir = join(baseDir, 'transformer', 'binance_diff_depth');

  return createPersistentStorage<TransformerState>(transformerStateBaseDir, options);
};

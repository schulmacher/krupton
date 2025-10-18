import { createPersistentStorage } from '@krupton/persistent-storage-node';
import { join } from 'node:path';
import { TransformerState } from './types';

export const createKrakenOrderBookTransformerStateStorage = (baseDir: string, options: { writable: boolean }) => {
  const transformerStateBaseDir = join(baseDir, 'transformer', 'kraken_order_book');

  return createPersistentStorage<TransformerState>(transformerStateBaseDir, options);
};

export const createKrakenApiTradeTransformerStateStorage = (baseDir: string, options: { writable: boolean }) => {
  const transformerStateBaseDir = join(baseDir, 'transformer', 'kraken_api_trade');

  return createPersistentStorage<TransformerState>(transformerStateBaseDir, options);
};

export const createKrakenWsTradeTransformerStateStorage = (baseDir: string, options: { writable: boolean }) => {
  const transformerStateBaseDir = join(baseDir, 'transformer', 'kraken_ws_trades');

  return createPersistentStorage<TransformerState>(transformerStateBaseDir, options);
};

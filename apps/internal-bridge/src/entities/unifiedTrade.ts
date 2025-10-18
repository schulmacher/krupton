import { createPersistentStorage } from '@krupton/persistent-storage-node';
import { UnifiedOrderBook, UnifiedTrade } from '@krupton/persistent-storage-node/transformed';
import { join } from 'node:path';

export const createUnifiedTradeStorage = (baseDir: string, options: { writable: boolean }) => {
  const unifiedTradeBaseDir = join(baseDir, 'unified', 'trade');

  return createPersistentStorage<UnifiedTrade>(unifiedTradeBaseDir, options);
};

export const createUnifiedOrderBookStorage = (baseDir: string, options: { writable: boolean }) => {
  const unifiedTradeBaseDir = join(baseDir, 'unified', 'order_book');

  return createPersistentStorage<UnifiedOrderBook>(unifiedTradeBaseDir, options);
};

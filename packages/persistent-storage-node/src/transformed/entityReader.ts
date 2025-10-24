import type {
  BaseStorageRecord,
  PersistentStorage,
  StorageRecordReturn,
} from '../persistentStorage.js';

export type EntityPosition = {
  globalIndex: number;
  timestamp: number;
};

export type EntityReaderOptions = {
  readBatchSize: number;
  startGlobalIndex: number;
  isStopped?: () => boolean;
};

export async function* createEntityReader<T extends BaseStorageRecord>(
  storage: PersistentStorage<T>,
  subIndexDir: string,
  options: EntityReaderOptions,
): AsyncGenerator<StorageRecordReturn<T>[], undefined> {
  const { readBatchSize, startGlobalIndex, isStopped } = options;
  const iter = await storage.iterateFrom({
    subIndex: subIndexDir,
    fromId: startGlobalIndex,
  });

  try {
    const cache: StorageRecordReturn<T>[] = [];

    while (!isStopped?.() && iter.hasNext()) {
      const item = iter.next();
      if (!item) {
        break;
      }

      cache.push(item)
      if (cache.length >= readBatchSize) {
        yield cache.splice(0, readBatchSize);
      }
    }

    if (cache.length) {
      yield cache.splice(0, cache.length);
    }

    console.log('entityReader stopped');
  } finally {
    iter.close();
  }
}

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
    batchSize: readBatchSize,
  });

  try {
    while (!isStopped?.() && iter.hasNext()) {
      yield iter.nextBatch();
    }

    console.log('entityReader stopped');
  } finally {
    iter.close();
  }
}

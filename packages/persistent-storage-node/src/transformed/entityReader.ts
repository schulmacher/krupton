import type { PersistentStorage, StorageRecord } from '../persistentStorage.js';

export type EntityPosition = {
  globalIndex: number;
  timestamp: number;
};

export type EntityReaderOptions = {
  readBatchSize: number;
  startGlobalIndex: number;
  isStopped?: () => boolean;
};

export async function* createEntityReader<T extends Record<string, unknown>>(
  storage: PersistentStorage<T>,
  subIndexDir: string,
  options: EntityReaderOptions,
): AsyncGenerator<StorageRecord<T>[], undefined> {
  const { readBatchSize, startGlobalIndex, isStopped } = options;

  let currentGlobalIndex = startGlobalIndex;

  while (!isStopped?.()) {
    // Read records using the range reader
    const records = await storage.readRecordsRange({
      subIndexDir,
      fromIndex: currentGlobalIndex,
      count: readBatchSize,
    });

    if (records.length === 0) {
      break;
    }

    yield records;

    // If we got fewer records than requested, we've reached the end
    if (records.length < readBatchSize) {
      break;
    }

    // Move to the next batch
    // TODO TEST THIS!!
    currentGlobalIndex = records[records.length - 1].id;
  }

  console.log('entityReader stopped');
}

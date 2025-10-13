import type { PersistentStorage, StorageRecordWithIndex } from '../persistentStorage.js';

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
): AsyncGenerator<StorageRecordWithIndex<T>> {
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

    for (const record of records) {
      yield record;
    }

    // Move to the next batch
    currentGlobalIndex += records.length;

    // If we got fewer records than requested, we've reached the end
    if (records.length < readBatchSize) {
      break;
    }
  }
}

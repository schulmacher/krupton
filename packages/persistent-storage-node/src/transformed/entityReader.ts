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

  let globalStartIndex = startGlobalIndex;

  while (!isStopped?.()) {
    const records = await storage
      .readRecordsRange({
        subIndexDir,
        fromIndex: globalStartIndex,
        count: readBatchSize,
      })
      .then((records) => {
        return records;
      });

    if (records.length === 0) {
      break;
    }

    yield records;

    if (records.length < readBatchSize) {
      break;
    }
    yield records;

    globalStartIndex = records.at(-1)!.id + 1;
  }

  console.log('entityReader stopped');
}

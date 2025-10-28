import { BaseStorageRecord, StorageRecordReturn } from '@krupton/persistent-storage-node';
import { SF } from '@krupton/service-framework-node';
import { PersistentSubIndexStorage } from './subIndexStorage.js';

export type EntitySubIndexReaderOptions = {
  readBatchSize: number;
  startGlobalIndex: number;
  isStopped?: () => boolean;
  diagnosticContext: SF.DiagnosticContext;
};

export async function* createEntitySubIndexReader<T extends BaseStorageRecord>(
  storage: PersistentSubIndexStorage<T>,
  options: EntitySubIndexReaderOptions,
): AsyncGenerator<StorageRecordReturn<T>[], undefined> {
  const { readBatchSize, startGlobalIndex, isStopped, diagnosticContext } = options;

  let globalStartIndex = startGlobalIndex;

  while (!isStopped?.()) {
    // Read records using the subindex-bound storage
    const records = await storage.readRecordsRange(globalStartIndex, readBatchSize);

    if (records.length === 0) {
      break;
    }

    yield records;

    // If we got fewer records than requested, we've reached the end
    if (records.length < readBatchSize) {
      break;
    }

    // Move to the next batch
    globalStartIndex = records.at(-1)!.id + 1;
  }

  diagnosticContext.logger.info('entitySubIndexReader stopped');
}

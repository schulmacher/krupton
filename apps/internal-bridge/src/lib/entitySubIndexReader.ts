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
  let iter = await storage.iterateFrom(globalStartIndex, readBatchSize);

  try {
    while (!isStopped?.() || iter.hasNext()) {
      yield iter.nextBatch();
    }

    diagnosticContext.logger.info('entitySubIndexReader stopped');
  } finally {
    iter.close();
  }
}

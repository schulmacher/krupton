import { ZmqSubscriber } from '@krupton/messaging-node';
import { BaseStorageRecord, StorageRecordReturn } from '@krupton/persistent-storage-node';
import { SF } from '@krupton/service-framework-node';
import { sleep, yieldToEventLoop } from '@krupton/utils';
import { TransformerState } from '../entities/types.js';
import { createEntitySubIndexReader } from './entitySubIndexReader.js';
import { PersistentSubIndexStorage } from './subIndexStorage.js';

interface ConsistentConsumerOptions<T extends BaseStorageRecord> {
  storage: PersistentSubIndexStorage<T>;
  zmqSubscriber: ZmqSubscriber<T>;
  lastState: TransformerState | null;
  batchSize: number;
  isStopped?: () => boolean;
  diagnosticContext: SF.DiagnosticContext;
  restartProcess: () => void;
}

/**
 * Because the PUB/SUB mechanism of ZMQ does not guarantee a 100% delivery rate even if the subscriber is connected
 * , thus we need to check if the messages are received in order.
 */
export async function* createConsistentConsumer<T extends StorageRecordReturn<BaseStorageRecord>>(
  options: ConsistentConsumerOptions<T>,
): AsyncGenerator<StorageRecordReturn<T>[], StorageRecordReturn<T>[] | void, void> {
  const { storage, zmqSubscriber, batchSize, isStopped = () => false, diagnosticContext } = options;

  // Load checkpoint
  const startIndex = options.lastState?.lastProcessedId ?? 0;
  let lastProcessedId = startIndex;

  diagnosticContext.logger.info('Starting persistent consumer', {
    startIndex,
  });

  const storageReader = createEntitySubIndexReader(storage, {
    readBatchSize: batchSize,
    startGlobalIndex: startIndex,
    isStopped,
    diagnosticContext,
  });

  for await (const storageBatch of storageReader) {
    if (isStopped()) break;
    // allow gc and other events
    await yieldToEventLoop();

    yield storageBatch as StorageRecordReturn<T>[];

    if (storageBatch.length > 0) {
      lastProcessedId = storageBatch.at(-1)!.id;
    }
  }

  diagnosticContext.logger.info('Caught up with storage, switching to ZMQ', {
    lastProcessedId,
  });

  const lastRecordInterval = setInterval(async () => {
    const lastRecord = await storage.readLastRecord();

    if (lastRecord?.id && lastRecord.id > lastProcessedId) {
      setTimeout(() => {
        if (lastRecord?.id && lastRecord.id > lastProcessedId) {
          diagnosticContext.logger.fatal('Storage is ahead of queue, restarting.', {
            lastProcessedId,
            lastRecordId: lastRecord.id,
          });
          options.restartProcess();
        }
      }, 1_000);
    }
  }, 10_000);

  const zmqStream = zmqSubscriber.receive();

  for await (const zmqBatch of zmqStream) {
    if (isStopped()) break;

    const gapFilledBatch: T[] = [];

    for (const message of zmqBatch) {
      const expectedId = lastProcessedId + 1;

      if (message.id <= lastProcessedId) {
        diagnosticContext.logger.warn('Skipping already processed message', {
          messageId: message.id,
          lastProcessedId,
        });
        continue;
      }

      if (message.id > expectedId) {
        const gapSize = message.id - expectedId;

        diagnosticContext.logger.warn('Gap detected in ZMQ stream', {
          lastProcessedId,
          messageId: message.id,
          gapSize,
        });
        const iter = await storage.iterateFrom(expectedId);

        try {
          let iteratorEndReachedCount = 0;

          while (!gapFilledBatch.length || gapFilledBatch.at(-1)!.id !== expectedId) {
            const record = iter.next();
            if (record) {
              iteratorEndReachedCount = 0;
              gapFilledBatch.push(record as T);
            } else {
              iteratorEndReachedCount = iteratorEndReachedCount + 1;
              if (iteratorEndReachedCount % 20) {
                diagnosticContext.logger.error('Failed to fill gap', {
                  lastProcessedId,
                  messageId: message.id,
                  lastFilledId: gapFilledBatch.at(-1)?.id,
                  attempt: iteratorEndReachedCount,
                });
              }
              await sleep(1_000);
            }
          }

          diagnosticContext.logger.info('Filled gap', {
            lastProcessedId,
            messageId: message.id,
            gapFilledBatch: gapFilledBatch.length,
          });
        } catch (error) {
          diagnosticContext.logger.error(error, 'Failed to fill gap', {
            lastProcessedId,
            messageId: message.id,
            gapSize,
          });
        } finally {
          iter.close();
        }
      }

      gapFilledBatch.push(message);
      lastProcessedId = gapFilledBatch.at(-1)!.id;
    }

    yield gapFilledBatch;
  }

  clearInterval(lastRecordInterval);
}

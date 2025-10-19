import { ZmqSubscriber } from '@krupton/messaging-node';
import { StorageRecord } from '@krupton/persistent-storage-node';
import { SF } from '@krupton/service-framework-node';
import { tryHard } from '@krupton/utils';
import { TransformerState } from '../entities/types';
import { createEntitySubIndexReader } from './entitySubIndexReader';
import { PersistentSubIndexStorage } from './subIndexStorage';

interface ConsistentConsumerOptions<T extends StorageRecord<Record<string, unknown>>> {
  storage: PersistentSubIndexStorage<T>;
  zmqSubscriber: ZmqSubscriber<T>;
  lastState: TransformerState | null;
  batchSize: number;
  isStopped?: () => boolean;
  diagnosticContext: SF.DiagnosticContext;
}

/**
 * Because the PUB/SUB mechanism of ZMQ does not guarantee a 100% delivery rate even if the subscriber is connected
 * , thus we need to check if the messages are received in order.
 */
export async function* createConsistentConsumer<T extends StorageRecord<Record<string, unknown>>>(
  options: ConsistentConsumerOptions<T>,
): AsyncGenerator<T[], T[] | void, void> {
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

    yield storageBatch;

    if (storageBatch.length > 0) {
      lastProcessedId = storageBatch.at(-1)!.id;
    }
  }

  diagnosticContext.logger.info('Caught up with storage, switching to ZMQ', {
    lastProcessedId,
  });

  const zmqStream = zmqSubscriber.receive();

  for await (const zmqBatch of zmqStream) {
    if (isStopped()) break;

    const gapFilledBatch: T[] = [];

    for (const message of zmqBatch) {
      const expectedId = lastProcessedId + 1;

      if (message.id > expectedId) {
        const gapSize = message.id - expectedId;

        diagnosticContext.logger.warn('Gap detected in ZMQ stream', {
          lastProcessedId,
          currentId: message.id,
          gapSize,
        });

        try {
          const missingRecords = await tryHard(
            async (attempt) => {
              const records = await storage.readRecordsRange(expectedId, gapSize);

              if (records.length !== gapSize && attempt <= 5) {
                throw new Error('Expected ' + gapSize + ' records, got ' + records.length);
              }

              return records;
            },
            (error, attemptCount) => {
              if (error instanceof Error && error.message !== 'No records found') {
                diagnosticContext.logger.error(error, 'Failed to read records range', {
                  expectedId,
                  gapSize,
                });
                return null;
              }

              if (attemptCount < 5) {
                return attemptCount * 1000;
              }
              return null;
            },
          );

          diagnosticContext.logger.info('Filled gap', {
            fillCount: missingRecords.length,
            gapSize,
          });

          missingRecords.push(...gapFilledBatch);
        } catch (error) {
          diagnosticContext.logger.error(error, 'Failed to fill gap', {
            lastProcessedId,
            messageId: message.id,
            gapSize,
          });
        }
      }

      gapFilledBatch.push(message);
      lastProcessedId = gapFilledBatch.at(-1)!.id;
    }

    yield gapFilledBatch;
  }
}

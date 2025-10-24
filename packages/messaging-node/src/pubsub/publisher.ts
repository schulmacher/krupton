import * as zmq from 'zeromq';
import { BaseStorageRecord, StorageRecord } from '@krupton/persistent-storage-node';
import { SF } from '@krupton/service-framework-node';

interface ZmqPublisherOptions {
  diagnosticContext: SF.DiagnosticContext;
  socket: string;
}

export interface ZmqPublisher<T extends StorageRecord<BaseStorageRecord>> {
  pusher: zmq.Publisher;
  send: (message: T) => Promise<void>;
  close: () => Promise<void>;
}

export async function createZmqPublisher<T extends StorageRecord<BaseStorageRecord>>(
  options: ZmqPublisherOptions,
): Promise<ZmqPublisher<T>> {
  const { diagnosticContext } = options;
  const pusher = new zmq.Publisher();
  let sendingPromise: Promise<void> | null = null;
  const cache: string[] = [];

  await pusher.bind(options.socket);

  return {
    pusher,
    send: async (message: T): Promise<void> => {
      diagnosticContext.logger.debug('[ZmqPublisher] Sending message', {
        socket: options.socket,
        message: message?.timestamp,
        cacheSize: cache.length,
      });
      const serialized = JSON.stringify(message);

      if (sendingPromise) {
        cache.push(serialized);
        return;
      }

      sendingPromise = pusher.send(serialized);
      await sendingPromise;

      while (cache.length > 0) {
        sendingPromise = pusher.send(cache.splice(0, 100));
        await sendingPromise;
      }
      sendingPromise = null;
    },
    close: async (): Promise<void> => {
      await sendingPromise;
      pusher.close();
    },
  };
}

interface ZmqPublisherRegistryOptions {
  diagnosticContext: SF.DiagnosticContext;
  socketTemplate: (subIndex: string) => string;
}

export interface ZmqPublisherRegistry<T extends StorageRecord<BaseStorageRecord>> {
  connect: (subIndices: string[]) => Promise<void>;
  send: (subIndex: string, message: T) => Promise<void>;
  close: () => Promise<void>;
  getProducers: () => Map<string, ZmqPublisher<T>>;
}

export function createZmqPublisherRegistry<T extends StorageRecord<BaseStorageRecord>>(
  options: ZmqPublisherRegistryOptions,
): ZmqPublisherRegistry<T> {
  const { diagnosticContext } = options;
  const producers = new Map<string, ZmqPublisher<T>>();

  return {
    connect: async (subIndices: string[]): Promise<void> => {
      await Promise.all(
        subIndices.map(async (subIndex) => {
          const socket = options.socketTemplate(subIndex);
          const producer = await createZmqPublisher<T>({ socket, diagnosticContext });
          producers.set(subIndex, producer);
        }),
      );
    },
    send: async (subIndex: string, message: T): Promise<void> => {
      const producer = producers.get(subIndex);
      if (!producer) {
        throw new Error(
          `Producer for subIndex "${subIndex}" not found. Available subIndices: ${Array.from(producers.keys()).join(', ')}`,
        );
      }
      await producer.send(message);
    },
    close: async (): Promise<void> => {
      await Promise.all(Array.from(producers.values()).map((producer) => producer.close()));
      producers.clear();
    },
    getProducers: (): Map<string, ZmqPublisher<T>> => {
      return producers;
    },
  };
}

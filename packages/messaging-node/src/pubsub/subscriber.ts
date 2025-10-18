import { StorageRecord } from '@krupton/persistent-storage-node';
import { SF } from '@krupton/service-framework-node';
import * as zmq from 'zeromq';

interface ZmqSubscriberOptions {
  socket: string;
  diagnosticContext: SF.DiagnosticContext;
}

export interface ZmqSubscriber<T extends StorageRecord<Record<string, unknown>>> {
  puller: zmq.Subscriber;
  receive: () => AsyncIterableIterator<T[]>;
  connect: () => void;
  close: () => void;
}

export function createZmqSubscriber<T extends StorageRecord<Record<string, unknown>>>(
  options: ZmqSubscriberOptions,
): ZmqSubscriber<T> {
  const { diagnosticContext } = options;
  const puller = new zmq.Subscriber();

  return {
    puller,
    connect: async (): Promise<void> => {
      diagnosticContext.logger.info('[ZmqSubscriber] Connecting', {
        socket: options.socket,
      });
      puller.connect(options.socket);
      puller.subscribe();
    },
    receive: async function* (): AsyncIterableIterator<T[]> {
      diagnosticContext.logger.debug('[ZmqSubscriber] Receiving messages', {
        socket: options.socket,
      });
      for await (const messages of puller) {
        diagnosticContext.logger.debug('[ZmqSubscriber] Received message', {
          socket: options.socket,
        });
        const parsed = messages.map((message) => JSON.parse(message.toString()) as T);
        yield parsed;
      }
      diagnosticContext.logger.info('[ZmqSubscriber] Done receiving messages', {
        socket: options.socket,
      });
    },
    close: (): void => {
      puller.close();
    },
  };
}

interface ZmqSubscriberRegistryOptions {
  socketTemplate: (subIndex: string) => string;
  diagnosticContext: SF.DiagnosticContext;
}

interface ZmqSubscriberRegistry<T extends StorageRecord<Record<string, unknown>>> {
  connect: (subIndices: string[]) => void;
  receive: (subIndex: string) => AsyncIterableIterator<T[]>;
  close: () => void;
  getZmqSubscribers: () => Map<string, ZmqSubscriber<T>>;
  getZmqSubscriber: (subIndex: string) => ZmqSubscriber<T>;
}

export function createZmqSubscriberRegistry<T extends StorageRecord<Record<string, unknown>>>(
  options: ZmqSubscriberRegistryOptions,
): ZmqSubscriberRegistry<T> {
  const { diagnosticContext } = options;
  const consumers = new Map<string, ZmqSubscriber<T>>();
  const getZmqSubscriber = (subIndex: string): ZmqSubscriber<T> => {
    const consumer = consumers.get(subIndex);
    if (!consumer) {
      throw new Error(
        `[ZmqSubscriber] Consumer for subIndex "${subIndex}" not found. Available subIndices: ${Array.from(consumers.keys()).join(', ')}`,
      );
    }
    return consumer;
  };

  return {
    connect: (subIndices: string[]): void => {
      subIndices.forEach((subIndex) => {
        const socket = options.socketTemplate(subIndex);
        const consumer = createZmqSubscriber<T>({ socket, diagnosticContext });
        consumer.connect();
        consumers.set(subIndex, consumer);
      });
    },
    receive: (subIndex: string): AsyncIterableIterator<T[]> => {
      const consumer = getZmqSubscriber(subIndex);
      return consumer.receive();
    },
    close: (): void => {
      consumers.forEach((consumer) => consumer.close());
      consumers.clear();
    },
    getZmqSubscriber,
    getZmqSubscribers: (): Map<string, ZmqSubscriber<T>> => {
      return consumers;
    },
  };
}

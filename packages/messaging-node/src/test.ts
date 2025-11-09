import { BaseStorageRecord, StorageRecord } from '@krupton/persistent-storage-node';
import { vi } from 'vitest';
import { ZmqPublisher, ZmqPublisherRegistry } from './pubsub/publisher.js';

export function createMockZmqPublisherRegistry<
  T extends StorageRecord<BaseStorageRecord>,
>(): ZmqPublisherRegistry<T> {
  return {
    connect: vi.fn(() => Promise.resolve()),
    send: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    getProducers: vi.fn().mockReturnValue(new Map<string, ZmqPublisher<T>>()),
  };
}

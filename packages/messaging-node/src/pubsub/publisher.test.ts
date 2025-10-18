import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createZmqPublisher } from './publisher.js';
import * as zmq from 'zeromq';
import type { StorageRecord } from '@krupton/persistent-storage-node';
import { createMockDiagnosticsContext } from '@krupton/service-framework-node/test';

// Mock zeromq
vi.mock('zeromq', () => ({
  Push: vi.fn(),
}));

type TestMessage = StorageRecord<{ value: string }>;

function createPromiseLock(): {
  lock: () => void;
  unlock: () => void;
  promise: Promise<void>;
} {
  let resolvePromise: (() => void) | null = null;
  let promise = Promise.resolve();

  return {
    lock: () => {
      promise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });
    },
    unlock: () => {
      if (resolvePromise) {
        resolvePromise();
        resolvePromise = null;
      }
    },
    get promise() {
      return promise;
    },
  };
}

describe('createZmqPublisher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  const mockDiagnosticContext = createMockDiagnosticsContext();

  it('should batch messages when send is locked', async () => {
    const promiseLock = createPromiseLock();
    const mockPusher = {
      bind: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockImplementation(() => promiseLock.promise),
      close: vi.fn(),
    };

    (zmq.Push as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockPusher);

    const producer = await createZmqPublisher<TestMessage>({
      socket: 'tcp://*:5555',
      diagnosticContext: mockDiagnosticContext,
    });

    expect(mockPusher.bind).toHaveBeenCalledWith('tcp://*:5555');

    const msg1: TestMessage = { id: 1, timestamp: 1000, value: 'first' };
    const msg2: TestMessage = { id: 2, timestamp: 2000, value: 'second' };
    const msg3: TestMessage = { id: 3, timestamp: 3000, value: 'third' };

    // Lock the promise before sending first message
    promiseLock.lock();

    // Send first message - this will start sending
    const sendPromise1 = producer.send(msg1);

    // Send second and third messages while first is locked - these should be cached
    const sendPromise2 = producer.send(msg2);
    const sendPromise3 = producer.send(msg3);

    // At this point, pusher.send should have been called only once (with msg1)
    expect(mockPusher.send).toHaveBeenCalledTimes(1);
    expect(mockPusher.send).toHaveBeenNthCalledWith(1, JSON.stringify(msg1));

    // Release the lock
    promiseLock.unlock();

    // Wait for all sends to complete
    await Promise.all([sendPromise1, sendPromise2, sendPromise3]);

    // Now pusher.send should have been called twice:
    // 1st time with msg1, 2nd time with [msg2, msg3]
    expect(mockPusher.send).toHaveBeenCalledTimes(2);
    expect(mockPusher.send).toHaveBeenNthCalledWith(
      2,
      [JSON.stringify(msg2), JSON.stringify(msg3)]
    );
  });

  it('should wait for pending sends before closing', async () => {
    const promiseLock = createPromiseLock();
    const mockPusher = {
      bind: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockImplementation(() => promiseLock.promise),
      close: vi.fn(),
    };

    (zmq.Push as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockPusher);

    const producer = await createZmqPublisher<TestMessage>({
      socket: 'tcp://*:5555',
      diagnosticContext: mockDiagnosticContext,
    });

    const msg1: TestMessage = { id: 1, timestamp: 1000, value: 'first' };
    const msg2: TestMessage = { id: 2, timestamp: 2000, value: 'second' };

    // Lock the promise before sending first message
    promiseLock.lock();

    // Send first message
    producer.send(msg1);

    // Send second message while first is locked
    producer.send(msg2);

    // At this point, pusher.send should have been called only once
    expect(mockPusher.send).toHaveBeenCalledTimes(1);
    expect(mockPusher.send).toHaveBeenNthCalledWith(1, JSON.stringify(msg1));

    // Release the lock and immediately call close
    promiseLock.unlock();
    await producer.close();

    // Close should wait for all pending sends to complete
    // Pusher.send should have been called twice: msg1, then msg2
    expect(mockPusher.send).toHaveBeenCalledTimes(2);
    expect(mockPusher.send).toHaveBeenNthCalledWith(1, JSON.stringify(msg1));
    expect(mockPusher.send).toHaveBeenNthCalledWith(2, [JSON.stringify(msg2)]);
    expect(mockPusher.close).toHaveBeenCalledTimes(1);
  });
});


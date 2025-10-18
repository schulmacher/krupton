import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { TB } from '@krupton/service-framework-node/typebox';
import { createWSConsumer, createWSHandlers, WebSocketValidationError } from './wsClient.js';
import type { WebSocketStreamDefinition } from './types.js';

// Mock WebSocket stream definitions
const MockTradeStream = {
  streamName: 'trade',
  messageSchema: TB.Object({
    type: TB.Literal('trade'),
    symbol: TB.String(),
    price: TB.String(),
    quantity: TB.String(),
  }),
  params: TB.Object({}),
  messageIdentifier: (message: unknown): boolean => {
    return (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === 'trade'
    );
  },
} satisfies WebSocketStreamDefinition;

const MockDepthStream = {
  streamName: 'depth',
  params: TB.Object({}),
  messageSchema: TB.Object({
    type: TB.Literal('depth'),
    symbol: TB.String(),
    bids: TB.Array(TB.Tuple([TB.String(), TB.String()])),
    asks: TB.Array(TB.Tuple([TB.String(), TB.String()])),
  }),
  messageIdentifier: (message: unknown): boolean => {
    return (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === 'depth'
    );
  },
} satisfies WebSocketStreamDefinition;

const MockDefinitions = {
  trade: MockTradeStream,
  depth: MockDepthStream,
};

describe('createWSHandlers', () => {
  it('should create handlers with definitions', () => {
    const tradeHandler = vi.fn();
    const depthHandler = vi.fn();

    const handlers = createWSHandlers(MockDefinitions, {
      trade: tradeHandler,
      depth: depthHandler,
    });

    expect(handlers.trade.definition).toBe(MockTradeStream);
    expect(handlers.trade.handler).toBe(tradeHandler);
    expect(handlers.depth.definition).toBe(MockDepthStream);
    expect(handlers.depth.handler).toBe(depthHandler);
  });
});

describe('createWSConsumer', () => {
  let server: WebSocketServer;
  let port: number;

  beforeEach(async () => {
    // Create a WebSocket server for testing
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => {
      server.on('listening', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          port = address.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should connect to WebSocket server', async () => {
    const tradeHandler = vi.fn();
    const depthHandler = vi.fn();
    const onOpen = vi.fn();

    const handlers = createWSHandlers(MockDefinitions, {
      trade: tradeHandler,
      depth: depthHandler,
    });

    const consumer = createWSConsumer(
      handlers,
      {
        url: `ws://localhost:${port}`,
        validation: true,
        reconnect: false,
      },
      { onOpen },
    );

    const connectionPromise = new Promise<void>((resolve) => {
      server.once('connection', () => {
        // Give the client time to finish the handshake
        setTimeout(resolve, 50);
      });
    });

    consumer.connect();

    await connectionPromise;

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(consumer.isConnected()).toBe(true);

    consumer.disconnect();
  });

  it('should route trade messages to correct handler', async () => {
    const tradeHandler = vi.fn();
    const depthHandler = vi.fn();

    const handlers = createWSHandlers(MockDefinitions, {
      trade: tradeHandler,
      depth: depthHandler,
    });

    const consumer = createWSConsumer(handlers, {
      url: `ws://localhost:${port}`,
      validation: true,
      reconnect: false,
    });

    consumer.connect();

    const tradeMessage = {
      type: 'trade',
      symbol: 'BTCUSDT',
      price: '50000.00',
      quantity: '1.5',
    };

    await new Promise<void>((resolve) => {
      server.on('connection', (ws) => {
        ws.send(JSON.stringify(tradeMessage));
        setTimeout(resolve, 100);
      });
    });

    expect(tradeHandler).toHaveBeenCalledTimes(1);
    expect(tradeHandler).toHaveBeenCalledWith(tradeMessage, JSON.stringify(tradeMessage));
    expect(depthHandler).not.toHaveBeenCalled();

    consumer.disconnect();
  });

  it('should route depth messages to correct handler', async () => {
    const tradeHandler = vi.fn();
    const depthHandler = vi.fn();

    const handlers = createWSHandlers(MockDefinitions, {
      trade: tradeHandler,
      depth: depthHandler,
    });

    const consumer = createWSConsumer(handlers, {
      url: `ws://localhost:${port}`,
      validation: true,
      reconnect: false,
    });

    consumer.connect();

    const depthMessage = {
      type: 'depth',
      symbol: 'ETHUSDT',
      bids: [['3000.00', '10.5']],
      asks: [['3001.00', '5.2']],
    };

    await new Promise<void>((resolve) => {
      server.on('connection', (ws) => {
        ws.send(JSON.stringify(depthMessage));
        setTimeout(resolve, 100);
      });
    });

    expect(depthHandler).toHaveBeenCalledTimes(1);
    expect(depthHandler).toHaveBeenCalledWith(depthMessage, JSON.stringify(depthMessage));
    expect(tradeHandler).not.toHaveBeenCalled();

    consumer.disconnect();
  });

  it('should route multiple messages correctly', async () => {
    const tradeHandler = vi.fn();
    const depthHandler = vi.fn();

    const handlers = createWSHandlers(MockDefinitions, {
      trade: tradeHandler,
      depth: depthHandler,
    });

    const consumer = createWSConsumer(handlers, {
      url: `ws://localhost:${port}`,
      validation: true,
      reconnect: false,
    });

    consumer.connect();

    const tradeMessage1 = {
      type: 'trade',
      symbol: 'BTCUSDT',
      price: '50000.00',
      quantity: '1.5',
    };

    const depthMessage = {
      type: 'depth',
      symbol: 'ETHUSDT',
      bids: [['3000.00', '10.5']],
      asks: [['3001.00', '5.2']],
    };

    const tradeMessage2 = {
      type: 'trade',
      symbol: 'ETHUSDT',
      price: '3000.00',
      quantity: '2.0',
    };

    await new Promise<void>((resolve) => {
      server.on('connection', (ws) => {
        ws.send(JSON.stringify(tradeMessage1));
        setTimeout(() => ws.send(JSON.stringify(depthMessage)), 50);
        setTimeout(() => ws.send(JSON.stringify(tradeMessage2)), 100);
        setTimeout(resolve, 150);
      });
    });

    expect(tradeHandler).toHaveBeenCalledTimes(2);
    expect(tradeHandler).toHaveBeenNthCalledWith(1, tradeMessage1, JSON.stringify(tradeMessage1));
    expect(tradeHandler).toHaveBeenNthCalledWith(2, tradeMessage2, JSON.stringify(tradeMessage2));
    expect(depthHandler).toHaveBeenCalledTimes(1);
    expect(depthHandler).toHaveBeenCalledWith(depthMessage, JSON.stringify(depthMessage));

    consumer.disconnect();
  });

  it('should handle validation errors', async () => {
    const tradeHandler = vi.fn();
    const depthHandler = vi.fn();
    const onError = vi.fn();

    const handlers = createWSHandlers(MockDefinitions, {
      trade: tradeHandler,
      depth: depthHandler,
    });

    const consumer = createWSConsumer(
      handlers,
      {
        url: `ws://localhost:${port}`,
        validation: true, // Validation enabled
        reconnect: false,
      },
      { onError },
    );

    consumer.connect();

    const invalidMessage = {
      type: 'trade',
      symbol: 'BTCUSDT',
      // Missing required fields: price, quantity
    };

    await new Promise<void>((resolve) => {
      server.on('connection', (ws) => {
        ws.send(JSON.stringify(invalidMessage));
        setTimeout(resolve, 100);
      });
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(WebSocketValidationError);
    expect((onError.mock.calls[0][0] as WebSocketValidationError).streamType).toBe('trade');
    expect(tradeHandler).not.toHaveBeenCalled();

    consumer.disconnect();
  });

  it('should skip validation when disabled', async () => {
    const tradeHandler = vi.fn();
    const depthHandler = vi.fn();
    const onError = vi.fn();

    const handlers = createWSHandlers(MockDefinitions, {
      trade: tradeHandler,
      depth: depthHandler,
    });

    const consumer = createWSConsumer(
      handlers,
      {
        url: `ws://localhost:${port}`,
        validation: false, // Validation disabled
        reconnect: false,
      },
      { onError },
    );

    consumer.connect();

    const invalidMessage = {
      type: 'trade',
      symbol: 'BTCUSDT',
      // Missing required fields: price, quantity
    };

    await new Promise<void>((resolve) => {
      server.on('connection', (ws) => {
        ws.send(JSON.stringify(invalidMessage));
        setTimeout(resolve, 100);
      });
    });

    expect(onError).not.toHaveBeenCalled();
    expect(tradeHandler).toHaveBeenCalledTimes(1);
    expect(tradeHandler).toHaveBeenCalledWith(invalidMessage, JSON.stringify(invalidMessage));

    consumer.disconnect();
  });

  it('should handle unknown message types', async () => {
    const tradeHandler = vi.fn();
    const depthHandler = vi.fn();
    const onError = vi.fn();

    const handlers = createWSHandlers(MockDefinitions, {
      trade: tradeHandler,
      depth: depthHandler,
    });

    const consumer = createWSConsumer(
      handlers,
      {
        url: `ws://localhost:${port}`,
        validation: true,
        reconnect: false,
      },
      { onError },
    );

    consumer.connect();

    const unknownMessage = {
      type: 'unknown',
      data: 'something',
    };

    await new Promise<void>((resolve) => {
      server.on('connection', (ws) => {
        ws.send(JSON.stringify(unknownMessage));
        setTimeout(resolve, 100);
      });
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0][0] as Error).message).toContain(
      'Unable to identify message type',
    );
    expect(tradeHandler).not.toHaveBeenCalled();
    expect(depthHandler).not.toHaveBeenCalled();

    consumer.disconnect();
  });

  it('should handle invalid JSON', async () => {
    const tradeHandler = vi.fn();
    const depthHandler = vi.fn();
    const onError = vi.fn();

    const handlers = createWSHandlers(MockDefinitions, {
      trade: tradeHandler,
      depth: depthHandler,
    });

    const consumer = createWSConsumer(
      handlers,
      {
        url: `ws://localhost:${port}`,
        validation: true,
        reconnect: false,
      },
      { onError },
    );

    consumer.connect();

    await new Promise<void>((resolve) => {
      server.on('connection', (ws) => {
        ws.send('invalid json{');
        setTimeout(resolve, 100);
      });
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0][0] as Error).message).toContain(
      'Failed to parse WebSocket message',
    );
    expect(tradeHandler).not.toHaveBeenCalled();

    consumer.disconnect();
  });

  it('should handle close events', async () => {
    const tradeHandler = vi.fn();
    const depthHandler = vi.fn();
    const onClose = vi.fn();

    const handlers = createWSHandlers(MockDefinitions, {
      trade: tradeHandler,
      depth: depthHandler,
    });

    const consumer = createWSConsumer(
      handlers,
      {
        url: `ws://localhost:${port}`,
        validation: true,
        reconnect: false,
      },
      { onClose },
    );

    consumer.connect();

    await new Promise<void>((resolve) => {
      server.on('connection', (ws) => {
        setTimeout(() => {
          ws.close(1000, 'Normal closure');
        }, 50);
      });

      setTimeout(resolve, 200);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(1000, 'Normal closure');
    expect(consumer.isConnected()).toBe(false);
  });

  it('should send messages when connected', async () => {
    const tradeHandler = vi.fn();
    const depthHandler = vi.fn();

    const handlers = createWSHandlers(MockDefinitions, {
      trade: tradeHandler,
      depth: depthHandler,
    });

    const consumer = createWSConsumer(handlers, {
      url: `ws://localhost:${port}`,
      validation: true,
      reconnect: false,
    });

    const receivedMessages: string[] = [];

    const connectionPromise = new Promise<void>((resolve) => {
      server.once('connection', (ws) => {
        ws.on('message', (data) => {
          receivedMessages.push(data.toString());
        });
        // Wait for connection to be fully established
        setTimeout(resolve, 50);
      });
    });

    consumer.connect();

    await connectionPromise;

    const testMessage = JSON.stringify({ action: 'subscribe', channel: 'trades' });
    consumer.send(testMessage);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(receivedMessages).toContain(testMessage);

    consumer.disconnect();
  });

  it('should throw error when sending while disconnected', () => {
    const tradeHandler = vi.fn();
    const depthHandler = vi.fn();

    const handlers = createWSHandlers(MockDefinitions, {
      trade: tradeHandler,
      depth: depthHandler,
    });

    const consumer = createWSConsumer(handlers, {
      url: `ws://localhost:${port}`,
      validation: true,
      reconnect: false,
    });

    expect(() => {
      consumer.send('test message');
    }).toThrow('WebSocket is not connected');
  });

  it('should terminate connection and attempt reconnect when pong is not received', async () => {
    // Use fake timers with shouldAdvanceTime to allow async operations
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const tradeHandler = vi.fn();
    const depthHandler = vi.fn();
    const onReconnect = vi.fn();
    const onClose = vi.fn();
    let terminateCalled = false;

    const handlers = createWSHandlers(MockDefinitions, {
      trade: tradeHandler,
      depth: depthHandler,
    });

    const consumer = createWSConsumer(
      handlers,
      {
        url: `ws://localhost:${port}`,
        validation: true,
        reconnect: true,
        reconnectInterval: 1000,
        pingInterval: 500,
      },
      { onReconnect, onClose },
    );

    let connectionCount = 0;
    const connectionPromise = new Promise<void>((resolve) => {
      // Handle all connections (initial + reconnect)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      server.on('connection', (ws, _req) => {
        connectionCount++;

        // Remove all ping listeners to prevent automatic pong (ws library responds automatically)
        // @ts-expect-error - accessing internal _receiver to prevent auto-pong
        ws._receiver.removeAllListeners('ping');

        ws.on('ping', () => {
          // Intentionally not sending pong to simulate network issue
        });

        ws.on('close', () => {
          if (connectionCount === 1) {
            terminateCalled = true;
          }
        });

        if (connectionCount === 1) {
          // Resolve on first connection
          resolve();
        }
      });
    });

    consumer.connect();
    await connectionPromise;

    // Wait for the 'open' event to fire - advance time gradually
    let attempts = 0;
    while (!consumer.isConnected() && attempts < 20) {
      await vi.advanceTimersByTimeAsync(50);
      attempts++;
    }
    expect(consumer.isConnected()).toBe(true);

    // Advance to first ping interval (500ms)
    // This will send first ping and set wsIsAlive to false (no pong received)
    await vi.advanceTimersByTimeAsync(500);

    // Advance to second ping interval (another 500ms = 1000ms total)
    // This will see wsIsAlive is still false and call terminate
    await vi.advanceTimersByTimeAsync(500);

    // Allow some time for close event handler to execute
    await vi.advanceTimersByTimeAsync(100);

    // Verify close was called
    expect(onClose).toHaveBeenCalled();

    // Verify connection was terminated
    expect(terminateCalled).toBe(true);

    // Advance past reconnect interval to trigger reconnection
    await vi.advanceTimersByTimeAsync(1000);

    // Wait a bit for reconnection to establish
    let reconnectAttempts = 0;
    while (connectionCount < 2 && reconnectAttempts < 20) {
      await vi.advanceTimersByTimeAsync(50);
      reconnectAttempts++;
    }

    // Verify reconnection was attempted
    expect(onReconnect).toHaveBeenCalledWith(1);
    expect(connectionCount).toBe(2); // Initial connection + 1 reconnect

    consumer.disconnect();
    // Clean up the connection listener
    server.removeAllListeners('connection');
    vi.useRealTimers();
  });
});

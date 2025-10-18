import { TSchema } from '@sinclair/typebox';
import { TypeCheck, TypeCompiler } from '@sinclair/typebox/compiler';
import WebSocket from 'ws';
import type {
  StreamHandlers,
  StreamHandlersWithDefinitions,
  WebSocketConsumer,
  WebSocketConsumerConfig,
  WebSocketEventHandlers,
  WebSocketStreamDefinition,
} from './types.js';

export class WebSocketValidationError extends Error {
  constructor(
    public streamType: string,
    public errors: unknown[],
    public rawMessage: string,
  ) {
    super(`WebSocket message validation failed for stream "${streamType}"`);
    this.name = 'WebSocketValidationError';
  }

  toErrorPlainObject() {
    let parsedMessage: unknown;
    try {
      parsedMessage = JSON.parse(this.rawMessage);
    } catch {
      parsedMessage = this.rawMessage;
    }

    return {
      streamType: this.streamType,
      receivedMessage: parsedMessage,
      errors: this.errors,
    };
  }
}

export class WebSocketConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebSocketConnectionError';
  }
}

function createMessageValidator<T extends Record<string, WebSocketStreamDefinition>>(
  definitions: T,
): Map<keyof T, TypeCheck<TSchema>> {
  const validators = new Map<keyof T, TypeCheck<TSchema>>();

  for (const [streamType, definition] of Object.entries(definitions)) {
    const validator = TypeCompiler.Compile(definition.messageSchema);
    validators.set(streamType as keyof T, validator);
  }

  return validators;
}

function identifyMessageType<T extends Record<string, WebSocketStreamDefinition>>(
  message: unknown,
  definitions: T,
): keyof T | null {
  for (const [streamType, definition] of Object.entries(definitions)) {
    if (definition.messageIdentifier && definition.messageIdentifier(message)) {
      return streamType as keyof T;
    }
  }
  return null;
}

export function createWSHandlers<T extends Record<string, WebSocketStreamDefinition>>(
  definitions: T,
  handlers: StreamHandlers<T>,
): StreamHandlersWithDefinitions<T> {
  const result = {} as StreamHandlersWithDefinitions<T>;

  for (const [key, definition] of Object.entries(definitions)) {
    const streamKey = key as keyof T;
    result[streamKey] = {
      definition,
      handler: handlers[streamKey],
    } as StreamHandlersWithDefinitions<T>[keyof T];
  }

  return result;
}

export function createWSConsumer<T extends Record<string, WebSocketStreamDefinition>>(
  handlersWithDefinitions: StreamHandlersWithDefinitions<T>,
  config: WebSocketConsumerConfig,
  eventHandlers?: Omit<WebSocketEventHandlers<T>, 'handlers'>,
): WebSocketConsumer {
  // Extract definitions and handlers from combined structure
  const definitions = {} as T;
  const streamHandlers = {} as StreamHandlers<T>;

  for (const [key, value] of Object.entries(handlersWithDefinitions)) {
    const streamKey = key as keyof T;
    definitions[streamKey] = value.definition as T[keyof T];
    streamHandlers[streamKey] = value.handler;
  }

  const handlers: WebSocketEventHandlers<T> = {
    handlers: streamHandlers,
    ...eventHandlers,
  };
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let pingInterval: NodeJS.Timeout | null = null;
  let wsIsAlive = false;
  let isManualDisconnect = false;

  const enableValidation = config.validation ?? true;
  const enableReconnect = config.reconnect ?? true;
  const reconnectInterval = config.reconnectInterval ?? 5000;
  const maxReconnectAttempts = config.maxReconnectAttempts ?? Infinity;
  const pingIntervalMs = config.pingInterval ?? 15_000;

  const validators = enableValidation ? createMessageValidator(definitions) : null;

  async function handleMessage(rawMessage: string): Promise<void> {
    let parsedMessage: unknown;

    try {
      parsedMessage = JSON.parse(rawMessage);
    } catch (error) {
      handlers.onError?.(new Error(`Failed to parse WebSocket message: ${error}`));
      return;
    }

    const streamType = identifyMessageType(parsedMessage, definitions);

    if (!streamType) {
      handlers.onError?.(
        new Error(`Unable to identify message type for: ${rawMessage.slice(0, 100)}`),
      );
      return;
    }

    if (enableValidation && validators) {
      const validator = validators.get(streamType);
      if (validator && !validator.Check(parsedMessage)) {
        const errors = Array.from(validator.Errors(parsedMessage));
        handlers.onError?.(new WebSocketValidationError(String(streamType), errors, rawMessage));
        return;
      }
    }

    const handler = handlers.handlers[streamType];
    if (handler) {
      await handler(parsedMessage as never, rawMessage);
    } else {
      handlers.onError?.(new Error(`No handler registered for stream type: ${String(streamType)}`));
    }
  }

  function attemptReconnect(): void {
    if (!enableReconnect || isManualDisconnect) {
      return;
    }

    if (reconnectAttempts >= maxReconnectAttempts) {
      handlers.onError?.(
        new WebSocketConnectionError(`Max reconnection attempts (${maxReconnectAttempts}) reached`),
      );
      return;
    }

    reconnectAttempts++;

    reconnectTimer = setTimeout(() => {
      handlers.onReconnect?.(reconnectAttempts);
      connect();
    }, reconnectInterval);
  }

  function connect(): void {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    isManualDisconnect = false;

    try {
      ws = new WebSocket(config.url);

      ws.on('open', () => {
        reconnectAttempts = 0;
        wsIsAlive = true;
        handlers.onOpen?.();

        // Start heartbeat
        clearInterval(pingInterval!);
        pingInterval = setInterval(() => {
          if (!wsIsAlive) {
            console.warn('No pong — reconnecting...');
            ws?.terminate(); // triggers 'close' event
            clearInterval(pingInterval!);
            return;
          }
          wsIsAlive = false;
          ws?.ping();
        }, pingIntervalMs);
      });

      ws.on('pong', () => {
        wsIsAlive = true;
      });

      ws.on('message', async (data: WebSocket.RawData) => {
        const message = data.toString();
        await handleMessage(message);
      });

      ws.on('close', (code: number, reason: Buffer) => {
        handlers.onClose?.(code, reason.toString());

        if (!isManualDisconnect) {
          attemptReconnect();
        }
      });

      ws.on('error', (error: Error) => {
        handlers.onError?.(error);
      });
    } catch (error) {
      handlers.onError?.(
        error instanceof Error ? error : new Error(`WebSocket connection failed: ${error}`),
      );
      attemptReconnect();
    }
  }

  function disconnect(): void {
    isManualDisconnect = true;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }

    if (ws) {
      ws.close();
      ws = null;
    }

    reconnectAttempts = 0;
  }

  function isConnected(): boolean {
    return ws?.readyState === WebSocket.OPEN;
  }

  function send(data: string): void {
    if (!isConnected()) {
      throw new WebSocketConnectionError('WebSocket is not connected');
    }
    ws!.send(data);
  }

  return {
    connect,
    disconnect,
    isConnected,
    send,
  };
}

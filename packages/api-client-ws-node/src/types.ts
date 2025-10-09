import { TB } from '@krupton/service-framework-node/typebox';

export interface WebSocketStreamDefinition {
  streamName: string;
  params: ReturnType<typeof TB.Object | typeof TB.Array | typeof TB.Union>;
  messageSchema: ReturnType<typeof TB.Object | typeof TB.Array | typeof TB.Union>;
  messageIdentifier?: (message: unknown) => boolean;
}

export type ExtractWebSocketStreamMessage<T extends WebSocketStreamDefinition> =
  T['messageSchema'] extends ReturnType<typeof TB.Object | typeof TB.Array | typeof TB.Union>
    ? TB.Static<T['messageSchema']>
    : never;

export type ExtractWebSocketStreamParams<T extends WebSocketStreamDefinition> =
  T['params'] extends ReturnType<typeof TB.Object | typeof TB.Array | typeof TB.Union>
    ? TB.Static<T['params']>
    : never;

export interface WebSocketConsumerConfig {
  url: string;
  validation?: boolean;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export type StreamMessageHandler<T extends WebSocketStreamDefinition> = (
  data: ExtractWebSocketStreamMessage<T>,
  raw: string,
) => void | Promise<void>;

export type StreamHandlers<TDefinitions extends Record<string, WebSocketStreamDefinition>> = {
  [K in keyof TDefinitions]: StreamMessageHandler<TDefinitions[K]>;
};

export type StreamSubscriptions<TDefinitions extends Record<string, WebSocketStreamDefinition>> = {
  [K in keyof TDefinitions]: string[];
};

export type StreamHandlerWithDefinition<T extends WebSocketStreamDefinition> = {
  definition: T;
  handler: StreamMessageHandler<T>;
};

export type StreamHandlersWithDefinitions<TDefinitions extends Record<string, WebSocketStreamDefinition>> = {
  [K in keyof TDefinitions]: StreamHandlerWithDefinition<TDefinitions[K]>;
};

export interface WebSocketEventHandlers<TDefinitions extends Record<string, WebSocketStreamDefinition>> {
  handlers: StreamHandlers<TDefinitions>;
  onOpen?: () => void | Promise<void>;
  onClose?: (code: number, reason: string) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  onReconnect?: (attempt: number) => void | Promise<void>;
}

export interface WebSocketConsumer {
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
  send: (data: string) => void;
}

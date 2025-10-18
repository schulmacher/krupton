import { WebSocketStreamDefinition } from '@krupton/api-client-ws-node';
import { WebSocketStorage, WebSocketStorageRecord } from './websocketStorage.js';

export type WebsocketEntityInput<T extends WebSocketStreamDefinition> = WebSocketStorageRecord<T>;

export type WebSocketEntity<
  T extends WebSocketStreamDefinition,
  TInput = WebsocketEntityInput<T>,
> = {
  storage: WebSocketStorage<T>;
  write: (params: TInput) => Promise<void>;
  readLatestRecord: (symbol: string) => Promise<WebSocketStorageRecord<T> | null>;
};

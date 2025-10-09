import {
  ExtractWebSocketStreamMessage,
  WebSocketStreamDefinition,
} from '@krupton/api-client-ws-node';
import { join } from 'path';
import { createPersistentStorage, StorageRecord } from './persistentStorage';

function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function normalizeStreamName(name: string): string {
  return 'ws_' + toSnakeCase(name).replace(/^\/+/, '').replace(/\//g, '_');
}

export type WebSocketStorageRecord<T extends WebSocketStreamDefinition> = StorageRecord<{
  message: ExtractWebSocketStreamMessage<T>;
}>;

export function createWebSocketStorage<T extends WebSocketStreamDefinition>(
  baseDir: string,
  websocketDefinition: T,
) {
  const streamName = websocketDefinition.streamName;
  const normalizedStreamName = normalizeStreamName(streamName);
  const baseDirWithEndpoint = join(baseDir, normalizedStreamName);
  const persistentStorage = createPersistentStorage<WebSocketStorageRecord<T>>(baseDirWithEndpoint);

  return {
    ...persistentStorage,
    normalizedStreamName,
    streamName,
  };
}

export type WebSocketStorage<T extends WebSocketStreamDefinition> = ReturnType<
  typeof createWebSocketStorage<T>
>;

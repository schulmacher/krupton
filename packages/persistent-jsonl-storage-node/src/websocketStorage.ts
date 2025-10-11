import {
  ExtractWebSocketStreamMessage,
  WebSocketStreamDefinition,
} from '@krupton/api-client-ws-node';
import { join } from 'path';
import { createPersistentStorage, normalizeIndexDir, StorageRecord } from './persistentStorage.js';

function normalizeStreamName(name: string): string {
  return 'ws_' + normalizeIndexDir(name);
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

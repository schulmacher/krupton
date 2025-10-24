import {
  ExtractWebSocketStreamMessage,
  WebSocketStreamDefinition,
} from '@krupton/api-client-ws-node';
import { join } from 'path';
import {
  createPersistentStorage,
  normalizeIndexDir,
  StorageRecordReturn,
} from '../persistentStorage.js';

function normalizeStreamName(name: string): string {
  return 'ws_' + normalizeIndexDir(name);
}

export type WebSocketStorageRecord<T extends WebSocketStreamDefinition> = StorageRecordReturn<{
  message: ExtractWebSocketStreamMessage<T>;
}>;

export function createWebSocketStorage<T extends WebSocketStreamDefinition>(
  baseDir: string,
  websocketDefinition: T,
  options: { writable: boolean },
) {
  const streamName = websocketDefinition.streamName;
  const normalizedStreamName = normalizeStreamName(streamName);
  const baseDirWithEndpoint = join(baseDir, normalizedStreamName);
  const persistentStorage = createPersistentStorage<WebSocketStorageRecord<T>>(
    baseDirWithEndpoint,
    options,
  );

  return persistentStorage;
}

export type WebSocketStorage<T extends WebSocketStreamDefinition> = ReturnType<
  typeof createWebSocketStorage<T>
>;

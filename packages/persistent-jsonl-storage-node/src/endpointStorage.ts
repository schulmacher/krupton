import {
    EndpointDefinition,
    ExtractEndpointDefinitionResponseSchema,
    ExtractEndpointParams,
} from '@krupton/api-client-node';
import { join } from 'path';
import { createPersistentStorage, normalizeIndexDir, StorageRecord } from './persistentStorage.js';

function normalizeEndpointPath(endpoint: string): string {
  return 'endpoint_' + normalizeIndexDir(endpoint);
}

export type EndpointStorageRecord<T extends EndpointDefinition> = StorageRecord<{
  request: ExtractEndpointParams<T>;
  response: ExtractEndpointDefinitionResponseSchema<T>;
}>;

export function createEndpointStorage<T extends EndpointDefinition>(baseDir: string, endpoint: T) {
  const endpointPath = endpoint.path;
  const normalizedEndpoint = normalizeEndpointPath(endpointPath);
  const baseDirWithEndpoint = join(baseDir, normalizedEndpoint);

  const persistentStorage = createPersistentStorage<EndpointStorageRecord<T>>(baseDirWithEndpoint);

  return {
    ...persistentStorage,
    normalizedEndpoint,
    endpointPath,
  };
}

export type EndpointStorage<T extends EndpointDefinition> = ReturnType<
  typeof createEndpointStorage<T>
>;

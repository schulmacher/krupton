import type { EndpointDefinition } from '@krupton/api-client-node';
import type { EndpointStorage, EndpointStorageRecord } from './endpointStorage.js';

export type EndpointEntityInput<T extends EndpointDefinition> = EndpointStorageRecord<T>;

export type EndpointEntity<T extends EndpointDefinition> = {
  storage: EndpointStorage<T>;
  write: (params: EndpointEntityInput<T>) => Promise<void>;
  readLatestRecord: (symbol: string) => Promise<EndpointStorageRecord<T> | null>;
};

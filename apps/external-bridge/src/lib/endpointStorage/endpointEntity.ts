import type { EndpointDefinition, ExtractEndpointParams } from '@krupton/api-client-node';
import type { TB } from '@krupton/service-framework-node/typebox';
import type { EndpointStorage, StorageRecord } from './endpointStorage.js';

type WriteParams<TResponse, TRequest> = {
  request: TRequest;
  response: TResponse;
};

export type EndpointEntity<T extends EndpointDefinition> = {
  storage: EndpointStorage<T>;
  write: (
    params: WriteParams<TB.Static<T['responseSchema']>, ExtractEndpointParams<T>>,
  ) => Promise<void>;
  readLatestRecord: (
    symbol: string,
  ) => Promise<StorageRecord<TB.Static<T['responseSchema']>, ExtractEndpointParams<T>> | null>;
};

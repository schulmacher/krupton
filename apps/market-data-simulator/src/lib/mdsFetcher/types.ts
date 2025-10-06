import type {
  EndpointFunction,
  EndpointDefinition,
  ExtractEndpointDefinitionResponseSchema,
  ExtractEndpointParams,
} from '@krupton/api-client-node';

export interface MdsFetcherLoopState {
  isRunning: boolean;
  fetchCount: number;
  lastFetchTime: number | null;
  errors: number;
}

export interface MdsFetcherLoop {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export type BuildRequestContext<E extends EndpointDefinition> = {
  prevResponse: ExtractEndpointDefinitionResponseSchema<E> | null;
  prevParams: ExtractEndpointParams<E> | null;
};

export type FetchSuccessContext<E extends EndpointDefinition> = ExtractEndpointParams<E> & {
  response: ExtractEndpointDefinitionResponseSchema<E>;
};

export interface FetcherConfig<E extends EndpointDefinition> {
  symbol: string;
  endpointFn: EndpointFunction<E>;
  buildRequestParams: (
    context: BuildRequestContext<E>,
  ) => ExtractEndpointParams<E> | Promise<ExtractEndpointParams<E>>;
  onSuccess?: (context: FetchSuccessContext<E>) => void | Promise<void>;
}

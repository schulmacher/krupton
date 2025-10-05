import { TB } from '@krupton/service-framework-node/typebox';

export interface EndpointDefinition {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  querySchema?: ReturnType<typeof TB.Object>;
  pathSchema?: ReturnType<typeof TB.Object>;
  bodySchema?: ReturnType<typeof TB.Object>;
  responseSchema: ReturnType<typeof TB.Object | typeof TB.Array | typeof TB.Union>;
}

export type ExtractEndpointDefinitionQuerySchema<T extends EndpointDefinition> =
  T['querySchema'] extends ReturnType<typeof TB.Object> ? TB.Static<T['querySchema']> : never;
export type ExtractEndpointDefinitionPathSchema<T extends EndpointDefinition> =
  T['pathSchema'] extends ReturnType<typeof TB.Object> ? TB.Static<T['pathSchema']> : never;
export type ExtractEndpointDefinitionBodySchema<T extends EndpointDefinition> =
  T['bodySchema'] extends ReturnType<typeof TB.Object> ? TB.Static<T['bodySchema']> : never;
export type ExtractEndpointDefinitionResponseSchema<T extends EndpointDefinition> =
  T['responseSchema'] extends ReturnType<typeof TB.Object | typeof TB.Array | typeof TB.Union>
    ? TB.Static<T['responseSchema']>
    : never;

export interface RequestParams {
  query?: Record<string, unknown>;
  path?: Record<string, string | number>;
  body?: Record<string, unknown>;
}

export type ExtractEndpointParams<T extends EndpointDefinition> =
  (T['querySchema'] extends ReturnType<typeof TB.Object>
    ? { query: ExtractEndpointDefinitionQuerySchema<T> }
    : { query?: never }) &
    (T['pathSchema'] extends ReturnType<typeof TB.Object>
      ? { path: ExtractEndpointDefinitionPathSchema<T> }
      : { path?: never }) &
    (T['bodySchema'] extends ReturnType<typeof TB.Object>
      ? { body: ExtractEndpointDefinitionBodySchema<T> }
      : { body?: never });

type HasRequiredParams<T extends EndpointDefinition> =
  T['querySchema'] extends ReturnType<typeof TB.Object>
    ? true
    : T['pathSchema'] extends ReturnType<typeof TB.Object>
      ? true
      : T['bodySchema'] extends ReturnType<typeof TB.Object>
        ? true
        : false;

type BaseEndpointFunction<T extends EndpointDefinition> =
  HasRequiredParams<T> extends true
    ? (params: ExtractEndpointParams<T>) => Promise<ExtractEndpointDefinitionResponseSchema<T>>
    : (params?: ExtractEndpointParams<T>) => Promise<ExtractEndpointDefinitionResponseSchema<T>>;

export type EndpointFunction<T extends EndpointDefinition> = BaseEndpointFunction<T> & {
  definition: T;
};

export type EndpointClientImplementation<T extends EndpointDefinition> =
  HasRequiredParams<T> extends true
    ? (params: ExtractEndpointParams<T>) => Promise<ExtractEndpointDefinitionResponseSchema<T>>
    : (params?: ExtractEndpointParams<T>) => Promise<ExtractEndpointDefinitionResponseSchema<T>>;

export type ApiClient<T extends Record<string, EndpointDefinition>> = {
  [K in keyof T]: EndpointFunction<T[K]>;
};

export interface ApiClientConfig {
  baseUrl: string;
  validation?: boolean;
  headers?: Record<string, string>;
}

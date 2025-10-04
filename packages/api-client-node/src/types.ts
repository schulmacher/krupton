import { TB } from '@krupton/service-framework-node/typebox';

export interface EndpointDefinition {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  querySchema?: ReturnType<typeof TB.Object>;
  pathSchema?: ReturnType<typeof TB.Object>;
  bodySchema?: ReturnType<typeof TB.Object>;
  responseSchema: ReturnType<
    typeof TB.Object | typeof TB.Array | typeof TB.Union
  >;
}

export interface RequestParams {
  query?: Record<string, unknown>;
  path?: Record<string, string | number>;
  body?: Record<string, unknown>;
}

export type DerivedRequestParams<T extends EndpointDefinition> = (T['querySchema'] extends ReturnType<typeof TB.Object>
  ? { query: TB.Static<T['querySchema']> }
  : { query?: never }) &
  (T['pathSchema'] extends ReturnType<typeof TB.Object>
    ? { path: TB.Static<T['pathSchema']> }
    : { path?: never }) &
  (T['bodySchema'] extends ReturnType<typeof TB.Object>
    ? { body: TB.Static<T['bodySchema']> }
    : { body?: never });

type HasRequiredParams<T extends EndpointDefinition> = 
  T['querySchema'] extends ReturnType<typeof TB.Object> ? true :
  T['pathSchema'] extends ReturnType<typeof TB.Object> ? true :
  T['bodySchema'] extends ReturnType<typeof TB.Object> ? true :
  false;

export type EndpointFunction<T extends EndpointDefinition> = 
  HasRequiredParams<T> extends true
    ? (params: DerivedRequestParams<T>) => Promise<TB.Static<T['responseSchema']>>
    : (params?: DerivedRequestParams<T>) => Promise<TB.Static<T['responseSchema']>>;

export type EndpointImplementation<T extends EndpointDefinition> = 
  HasRequiredParams<T> extends true
    ? (params: DerivedRequestParams<T>) => Promise<TB.Static<T['responseSchema']>>
    : (params?: DerivedRequestParams<T>) => Promise<TB.Static<T['responseSchema']>>;

export type ApiClient<T extends Record<string, EndpointDefinition>> = {
  [K in keyof T]: EndpointFunction<T[K]>;
};

export interface ApiClientConfig {
  baseUrl: string;
  validation?: boolean;
}

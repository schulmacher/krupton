import { TB } from '@krupton/service-framework-node/typebox';
import { Value } from '@sinclair/typebox/value';
import { request } from 'undici';
import {
  ApiClientError,
  ApiClientFetchError,
  ApiClientStatusError,
  ApiClientValidationError,
  ApiClientRequestValidationError,
} from './apiErrors.js';
import type {
  ApiClient,
  ApiClientConfig,
  EndpointImplementation,
  DerivedRequestParams,
  EndpointDefinition,
  EndpointFunction,
} from './types.js';

const extractPathParams = (path: string): string[] => {
  const matches = path.match(/:(\w+)/g);
  return matches ? matches.map((param) => param.slice(1)) : [];
};

const validatePathSchema = (
  endpointName: string,
  path: string,
  pathSchema?: ReturnType<typeof TB.Object>,
): void => {
  const pathParams = extractPathParams(path);
  const pathParamsSet = new Set(pathParams);

  if (pathSchema) {
    const schemaKeys = Object.keys(pathSchema.properties);
    const schemaKeysSet = new Set(schemaKeys);

    const missingInSchema = pathParams.filter((param) => !schemaKeysSet.has(param));
    if (missingInSchema.length > 0) {
      throw new ApiClientError(
        `Endpoint '${endpointName}': pathSchema is missing parameters defined in path: ${missingInSchema.join(', ')}`,
      );
    }

    const extraInSchema = schemaKeys.filter((key) => !pathParamsSet.has(key));
    if (extraInSchema.length > 0) {
      throw new ApiClientError(
        `Endpoint '${endpointName}': pathSchema defines extra parameters not in path: ${extraInSchema.join(', ')}`,
      );
    }
  } else if (pathParams.length > 0) {
    throw new ApiClientError(
      `Endpoint '${endpointName}': path contains parameters (${pathParams.join(', ')}) but pathSchema is not defined`,
    );
  }
};

const createApiImplementation = <T extends EndpointDefinition>(
  config: ApiClientConfig,
  definition: T,
): EndpointImplementation<T> => {
  return (async (params?: DerivedRequestParams<T>) => {
    let url = config.baseUrl + definition.path;

    if (params?.path) {
      for (const [key, value] of Object.entries(params.path)) {
        url = url.replace(`:${key}`, String(value));
      }
    }

    if (params?.query) {
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params.query)) {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      }
      const queryString = queryParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const requestOptions = {
      method: definition.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: params?.body && definition.method !== 'GET' ? JSON.stringify(params.body) : undefined,
    };

    let response;
    try {
      response = await request(url, requestOptions);
    } catch (error) {
      throw new ApiClientFetchError(
        `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      let responseBody: unknown;
      try {
        responseBody = await response.body.json();
      } catch {
        responseBody = undefined;
      }
      throw new ApiClientStatusError(response.statusCode, responseBody);
    }

    return response.body.json();
  }) as EndpointImplementation<T>;
};

const createApiImplementationWithValidation = <T extends EndpointDefinition>(
  config: ApiClientConfig,
  definition: T,
): EndpointImplementation<T> => {
  return (async (params?: DerivedRequestParams<T>) => {
    // Validate query params
    if (params?.query && definition.querySchema) {
      const valid = Value.Check(definition.querySchema, params.query);
      if (!valid) {
        const errors = [...Value.Errors(definition.querySchema, params.query)];
        throw new ApiClientRequestValidationError(
          `Invalid query parameters: ${errors.map((e) => e.message).join(', ')}`,
          errors,
        );
      }
    }

    // Validate path params
    if (params?.path && definition.pathSchema) {
      const valid = Value.Check(definition.pathSchema, params.path);
      if (!valid) {
        const errors = [...Value.Errors(definition.pathSchema, params.path)];
        throw new ApiClientRequestValidationError(
          `Invalid path parameters: ${errors.map((e) => e.message).join(', ')}`,
          errors,
        );
      }
    }

    // Validate body params
    if (params?.body && definition.bodySchema) {
      const valid = Value.Check(definition.bodySchema, params.body);
      if (!valid) {
        const errors = [...Value.Errors(definition.bodySchema, params.body)];
        throw new ApiClientRequestValidationError(
          `Invalid body parameters: ${errors.map((e) => e.message).join(', ')}`,
          errors,
        );
      }
    }

    let url = config.baseUrl + definition.path;

    if (params?.path) {
      for (const [key, value] of Object.entries(params.path)) {
        url = url.replace(`:${key}`, String(value));
      }
    }

    if (params?.query) {
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params.query)) {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      }
      const queryString = queryParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const requestOptions = {
      method: definition.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: params?.body && definition.method !== 'GET' ? JSON.stringify(params.body) : undefined,
    };

    let response;
    try {
      response = await request(url, requestOptions);
    } catch (error) {
      throw new ApiClientFetchError(
        `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      let responseBody: unknown;
      try {
        responseBody = await response.body.json();
      } catch {
        responseBody = undefined;
      }
      throw new ApiClientStatusError(response.statusCode, responseBody);
    }

    const responseBody = await response.body.json();

    // Validate response
    const valid = Value.Check(definition.responseSchema, responseBody);
    if (!valid) {
      const errors = [...Value.Errors(definition.responseSchema, responseBody)];
      throw new ApiClientValidationError(
        `Invalid response body: ${errors.map((e) => e.message).join(', ')}`,
        errors,
      );
    }

    return responseBody;
  }) as EndpointImplementation<T>;
};

export const createApiClient = <T extends Record<string, EndpointDefinition>>(
  config: ApiClientConfig,
  endpoints: T,
): ApiClient<T> => {
  for (const [endpointName, definition] of Object.entries(endpoints)) {
    validatePathSchema(endpointName, definition.path, definition.pathSchema);
  }

  const client = {} as ApiClient<T>;
  const enableValidation = config.validation ?? true;

  for (const [endpointName, definition] of Object.entries(endpoints)) {
    client[endpointName as keyof T] = (
      enableValidation
        ? createApiImplementationWithValidation(config, definition)
        : createApiImplementation(config, definition)
    ) as EndpointFunction<T[keyof T]>;
  }

  return client;
};

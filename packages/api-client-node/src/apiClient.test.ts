import { TB } from '@krupton/service-framework-node/typebox';
import type { EndpointDefinition } from './types.js';
import { Dispatcher, getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApiClient } from './apiClient.js';
import {
  ApiClientError,
  ApiClientFetchError,
  ApiClientStatusError,
  ApiClientValidationError,
  ApiClientRequestValidationError,
} from './apiErrors.js';

describe('createApiClient', () => {
  let mockAgent: MockAgent;
  let originalDispatcher: Dispatcher;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    originalDispatcher = getGlobalDispatcher();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
  });

  describe('path schema validation', () => {
    it('should throw ApiClientError when path has parameters but pathSchema is not defined', () => {
      const endpoints = {
        getUser: {
          path: '/users/:userId',
          method: 'GET',
          responseSchema: TB.Object({ id: TB.String() }),
        } satisfies EndpointDefinition,
      };

      expect(() => createApiClient({ baseUrl: 'https://api.example.com' }, endpoints)).toThrow(
        ApiClientError,
      );

      expect(() => createApiClient({ baseUrl: 'https://api.example.com' }, endpoints)).toThrow(
        "Endpoint 'getUser': path contains parameters (userId) but pathSchema is not defined",
      );
    });

    it('should throw ApiClientError when pathSchema is missing parameters defined in path', () => {
      const endpoints = {
        getUser: {
          path: '/users/:userId/posts/:postId',
          method: 'GET',
          pathSchema: TB.Object({
            userId: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String() }),
        } satisfies EndpointDefinition,
      };

      expect(() => createApiClient({ baseUrl: 'https://api.example.com' }, endpoints)).toThrow(
        ApiClientError,
      );

      expect(() => createApiClient({ baseUrl: 'https://api.example.com' }, endpoints)).toThrow(
        "Endpoint 'getUser': pathSchema is missing parameters defined in path: postId",
      );
    });

    it('should throw ApiClientError when pathSchema defines extra parameters not in path', () => {
      const endpoints = {
        getUser: {
          path: '/users/:userId',
          method: 'GET',
          pathSchema: TB.Object({
            userId: TB.String(),
            extraParam: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String() }),
        } satisfies EndpointDefinition,
      };

      expect(() => createApiClient({ baseUrl: 'https://api.example.com' }, endpoints)).toThrow(
        ApiClientError,
      );

      expect(() => createApiClient({ baseUrl: 'https://api.example.com' }, endpoints)).toThrow(
        "Endpoint 'getUser': pathSchema defines extra parameters not in path: extraParam",
      );
    });

    it('should not throw error when pathSchema matches path parameters exactly', () => {
      const endpoints = {
        getUser: {
          path: '/users/:userId',
          method: 'GET',
          pathSchema: TB.Object({
            userId: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String() }),
        } satisfies EndpointDefinition,
      };

      expect(() =>
        createApiClient({ baseUrl: 'https://api.example.com' }, endpoints),
      ).not.toThrow();
    });

    it('should not throw error when path has no parameters and no pathSchema', () => {
      const endpoints = {
        listUsers: {
          path: '/users',
          method: 'GET',
          responseSchema: TB.Array(TB.Object({ id: TB.String() })),
        } satisfies EndpointDefinition,
      };

      expect(() =>
        createApiClient({ baseUrl: 'https://api.example.com' }, endpoints),
      ).not.toThrow();
    });
  });

  describe('GET requests', () => {
    it('should make a GET request without query parameters', async () => {
      const endpoints = {
        listUsers: {
          path: '/users',
          method: 'GET',
          responseSchema: TB.Array(TB.Object({ id: TB.String() })),
        } satisfies EndpointDefinition,
      };

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool.intercept({ path: '/users', method: 'GET' }).reply(200, [{ id: '1' }, { id: '2' }]);

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      const result = await client.listUsers();
      expect(result).toEqual([{ id: '1' }, { id: '2' }]);
    });

    it('should make a GET request with query parameters', async () => {
      const endpoints = {
        listUsers: {
          path: '/users',
          method: 'GET',
          querySchema: TB.Object({
            limit: TB.Number(),
            offset: TB.Number(),
          }),
          responseSchema: TB.Array(TB.Object({ id: TB.String() })),
        } satisfies EndpointDefinition,
      };

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool
        .intercept({ path: '/users?limit=10&offset=20', method: 'GET' })
        .reply(200, [{ id: '1' }]);

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      const result = await client.listUsers({
        query: { limit: 10, offset: 20 },
      });
      expect(result).toEqual([{ id: '1' }]);
    });

    it('should skip undefined and null query parameters', async () => {
      const endpoints = {
        listUsers: {
          path: '/users',
          method: 'GET',
          querySchema: TB.Object({
            name: TB.Optional(TB.String()),
            age: TB.Optional(TB.Number()),
          }),
          responseSchema: TB.Array(TB.Object({ id: TB.String() })),
        } satisfies EndpointDefinition,
      };

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool.intercept({ path: '/users?name=John', method: 'GET' }).reply(200, [{ id: '1' }]);

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      const result = await client.listUsers({
        query: { name: 'John', age: undefined },
      });
      expect(result).toEqual([{ id: '1' }]);
    });

    it('should replace path parameters in URL', async () => {
      const endpoints = {
        getUser: {
          path: '/users/:userId',
          method: 'GET',
          pathSchema: TB.Object({
            userId: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String(), name: TB.String() }),
        } satisfies EndpointDefinition,
      };

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool
        .intercept({ path: '/users/123', method: 'GET' })
        .reply(200, { id: '123', name: 'John' });

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      const result = await client.getUser({ path: { userId: '123' } });
      expect(result).toEqual({ id: '123', name: 'John' });
    });

    it('should replace multiple path parameters in URL', async () => {
      const endpoints = {
        getUserPost: {
          path: '/users/:userId/posts/:postId',
          method: 'GET',
          pathSchema: TB.Object({
            userId: TB.String(),
            postId: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String() }),
        } satisfies EndpointDefinition,
      };

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool.intercept({ path: '/users/123/posts/456', method: 'GET' }).reply(200, { id: '456' });

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      const result = await client.getUserPost({
        path: { userId: '123', postId: '456' },
      });
      expect(result).toEqual({ id: '456' });
    });

    it('should handle numeric path parameters', async () => {
      const endpoints = {
        getUser: {
          path: '/users/:userId',
          method: 'GET',
          pathSchema: TB.Object({
            userId: TB.Number(),
          }),
          responseSchema: TB.Object({ id: TB.Number() }),
        } satisfies EndpointDefinition,
      };

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool.intercept({ path: '/users/123', method: 'GET' }).reply(200, { id: 123 });

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      const result = await client.getUser({ path: { userId: 123 } });
      expect(result).toEqual({ id: 123 });
    });
  });

  describe('POST requests', () => {
    it('should make a POST request with body', async () => {
      const endpoints = {
        createUser: {
          path: '/users',
          method: 'POST',
          bodySchema: TB.Object({
            name: TB.String(),
            email: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String(), name: TB.String() }),
        } satisfies EndpointDefinition,
      };

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool
        .intercept({
          path: '/users',
          method: 'POST',
          body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
        })
        .reply(201, { id: '123', name: 'John' });

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      const result = await client.createUser({
        body: { name: 'John', email: 'john@example.com' },
      });
      expect(result).toEqual({ id: '123', name: 'John' });
    });

    it('should prevent body parameter for GET requests at type level', () => {
      const endpoints = {
        getUser: {
          path: '/users/:userId',
          method: 'GET',
          pathSchema: TB.Object({
            userId: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String() }),
        } satisfies EndpointDefinition,
      };

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      // This is a compile-time test - TypeScript should prevent body parameter on GET requests
      // The following line would cause a TypeScript error if uncommented:
      // client.getUser({ path: { userId: '123' }, body: { ignored: 'value' } });

      expect(client.getUser).toBeDefined();
    });
  });

  describe('PUT requests', () => {
    it('should make a PUT request with body', async () => {
      const endpoints = {
        updateUser: {
          path: '/users/:userId',
          method: 'PUT',
          pathSchema: TB.Object({
            userId: TB.String(),
          }),
          bodySchema: TB.Object({
            name: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String(), name: TB.String() }),
        } satisfies EndpointDefinition,
      };

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool
        .intercept({
          path: '/users/123',
          method: 'PUT',
          body: JSON.stringify({ name: 'Jane' }),
        })
        .reply(200, { id: '123', name: 'Jane' });

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      const result = await client.updateUser({
        path: { userId: '123' },
        body: { name: 'Jane' },
      });
      expect(result).toEqual({ id: '123', name: 'Jane' });
    });
  });

  describe('DELETE requests', () => {
    it('should make a DELETE request', async () => {
      const endpoints = {
        deleteUser: {
          path: '/users/:userId',
          method: 'DELETE',
          pathSchema: TB.Object({
            userId: TB.String(),
          }),
          responseSchema: TB.Object({ success: TB.Boolean() }),
        } satisfies EndpointDefinition,
      };

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool.intercept({ path: '/users/123', method: 'DELETE' }).reply(200, { success: true });

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      const result = await client.deleteUser({ path: { userId: '123' } });
      expect(result).toEqual({ success: true });
    });
  });

  describe('error handling', () => {
    it('should throw ApiClientStatusError on 4xx status codes', async () => {
      const endpoints = {
        getUser: {
          path: '/users/:userId',
          method: 'GET',
          pathSchema: TB.Object({
            userId: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String() }),
        } satisfies EndpointDefinition,
      };

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool
        .intercept({ path: '/users/999', method: 'GET' })
        .reply(404, { error: 'Not found' })
        .times(2);

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      await expect(client.getUser({ path: { userId: '999' } })).rejects.toThrow(
        ApiClientStatusError,
      );

      await expect(client.getUser({ path: { userId: '999' } })).rejects.toThrow(
        'HTTP error! status: 404',
      );
    });

    it('should throw ApiClientStatusError on 5xx status codes', async () => {
      const endpoints = {
        getUser: {
          path: '/users/:userId',
          method: 'GET',
          pathSchema: TB.Object({
            userId: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String() }),
        } satisfies EndpointDefinition,
      };

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool
        .intercept({ path: '/users/123', method: 'GET' })
        .reply(500, { error: 'Internal server error' })
        .times(2);

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      await expect(client.getUser({ path: { userId: '123' } })).rejects.toThrow(
        ApiClientStatusError,
      );

      await expect(client.getUser({ path: { userId: '123' } })).rejects.toThrow(
        'HTTP error! status: 500',
      );
    });

    it('should include response body in ApiClientStatusError', async () => {
      const endpoints = {
        getUser: {
          path: '/users/:userId',
          method: 'GET',
          pathSchema: TB.Object({
            userId: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String() }),
        } satisfies EndpointDefinition,
      };

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool
        .intercept({ path: '/users/999', method: 'GET' })
        .reply(404, { error: 'Not found', code: 'USER_NOT_FOUND' });

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      try {
        await client.getUser({ path: { userId: '999' } });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientStatusError);
        if (error instanceof ApiClientStatusError) {
          expect(error.statusCode).toBe(404);
          expect(error.responseBody).toEqual({
            error: 'Not found',
            code: 'USER_NOT_FOUND',
          });
        }
      }
    });

    it('should throw ApiClientFetchError when request fails', async () => {
      const endpoints = {
        getUser: {
          path: '/users/:userId',
          method: 'GET',
          pathSchema: TB.Object({
            userId: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String() }),
        } satisfies EndpointDefinition,
      };

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool
        .intercept({ path: '/users/123', method: 'GET' })
        .replyWithError(new Error('Network error'))
        .times(2);

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      await expect(client.getUser({ path: { userId: '123' } })).rejects.toThrow(
        ApiClientFetchError,
      );

      await expect(client.getUser({ path: { userId: '123' } })).rejects.toThrow(
        'Request failed: Network error',
      );
    });
  });

  describe('headers', () => {
    it('should send Content-Type: application/json header', async () => {
      const endpoints = {
        createUser: {
          path: '/users',
          method: 'POST',
          bodySchema: TB.Object({
            name: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String() }),
        } satisfies EndpointDefinition,
      };

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool
        .intercept({
          path: '/users',
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
        })
        .reply(201, { id: '123' });

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      const result = await client.createUser({
        body: { name: 'John' },
      });
      expect(result).toEqual({ id: '123' });
    });
  });

  describe('validation', () => {
    describe('request validation', () => {
      it('should validate query parameters and throw ApiClientRequestValidationError', async () => {
        const endpoints = {
          listUsers: {
            path: '/users',
            method: 'GET',
            querySchema: TB.Object({
              limit: TB.Number(),
            }),
            responseSchema: TB.Array(TB.Object({ id: TB.String() })),
          } satisfies EndpointDefinition,
        };

        const client = createApiClient(
          { baseUrl: 'https://api.example.com', validation: true },
          endpoints,
        );

        await expect(
          client.listUsers({ query: { limit: 'invalid' as unknown as number } }),
        ).rejects.toThrow(ApiClientRequestValidationError);

        await expect(
          client.listUsers({ query: { limit: 'invalid' as unknown as number } }),
        ).rejects.toThrow('Invalid query parameters');
      });

      it('should validate path parameters and throw ApiClientRequestValidationError', async () => {
        const endpoints = {
          getUser: {
            path: '/users/:userId',
            method: 'GET',
            pathSchema: TB.Object({
              userId: TB.String(),
            }),
            responseSchema: TB.Object({ id: TB.String() }),
          } satisfies EndpointDefinition,
        };

        const client = createApiClient(
          { baseUrl: 'https://api.example.com', validation: true },
          endpoints,
        );

        await expect(
          client.getUser({ path: { userId: 123 as unknown as string } }),
        ).rejects.toThrow(ApiClientRequestValidationError);
      });

      it('should validate body parameters and throw ApiClientRequestValidationError', async () => {
        const endpoints = {
          createUser: {
            path: '/users',
            method: 'POST',
            bodySchema: TB.Object({
              name: TB.String(),
              age: TB.Number(),
            }),
            responseSchema: TB.Object({ id: TB.String() }),
          } satisfies EndpointDefinition,
        };

        const client = createApiClient(
          { baseUrl: 'https://api.example.com', validation: true },
          endpoints,
        );

        await expect(
          client.createUser({ body: { name: 'John', age: 'invalid' as unknown as number } }),
        ).rejects.toThrow(ApiClientRequestValidationError);

        await expect(
          client.createUser({ body: { name: 'John', age: 'invalid' as unknown as number } }),
        ).rejects.toThrow('Invalid body parameters');
      });

      it('should include validation errors in ApiClientRequestValidationError', async () => {
        const endpoints = {
          createUser: {
            path: '/users',
            method: 'POST',
            bodySchema: TB.Object({
              name: TB.String(),
              age: TB.Number(),
            }),
            responseSchema: TB.Object({ id: TB.String() }),
          } satisfies EndpointDefinition,
        };

        const client = createApiClient(
          { baseUrl: 'https://api.example.com', validation: true },
          endpoints,
        );

        try {
          await client.createUser({ body: { name: 'John', age: 'invalid' as unknown as number } });
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeInstanceOf(ApiClientRequestValidationError);
          if (error instanceof ApiClientRequestValidationError) {
            expect(error.errors).toBeDefined();
            expect(error.errors.length).toBeGreaterThan(0);
          }
        }
      });
    });

    describe('response validation', () => {
      it('should validate response and throw ApiClientValidationError on invalid response', async () => {
        const endpoints = {
          getUser: {
            path: '/users/:userId',
            method: 'GET',
            pathSchema: TB.Object({
              userId: TB.String(),
            }),
            responseSchema: TB.Object({
              id: TB.String(),
              name: TB.String(),
            }),
          } satisfies EndpointDefinition,
        };

        const mockPool = mockAgent.get('https://api.example.com');
        mockPool
          .intercept({ path: '/users/123', method: 'GET' })
          .reply(200, { id: 123, name: 'John' })
          .times(2); // id should be string, not number

        const client = createApiClient(
          { baseUrl: 'https://api.example.com', validation: true },
          endpoints,
        );

        await expect(client.getUser({ path: { userId: '123' } })).rejects.toThrow(
          ApiClientValidationError,
        );

        await expect(client.getUser({ path: { userId: '123' } })).rejects.toThrow(
          'Invalid response body',
        );
      });

      it('should include validation errors in ApiClientValidationError', async () => {
        const endpoints = {
          getUser: {
            path: '/users/:userId',
            method: 'GET',
            pathSchema: TB.Object({
              userId: TB.String(),
            }),
            responseSchema: TB.Object({
              id: TB.String(),
              name: TB.String(),
            }),
          } satisfies EndpointDefinition,
        };

        const mockPool = mockAgent.get('https://api.example.com');
        mockPool
          .intercept({ path: '/users/123', method: 'GET' })
          .reply(200, { id: 123, name: 'John' });

        const client = createApiClient(
          { baseUrl: 'https://api.example.com', validation: true },
          endpoints,
        );

        try {
          await client.getUser({ path: { userId: '123' } });
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeInstanceOf(ApiClientValidationError);
          if (error instanceof ApiClientValidationError) {
            expect(error.errors).toBeDefined();
            expect(error.errors?.length).toBeGreaterThan(0);
          }
        }
      });

      it('should pass validation for valid response', async () => {
        const endpoints = {
          getUser: {
            path: '/users/:userId',
            method: 'GET',
            pathSchema: TB.Object({
              userId: TB.String(),
            }),
            responseSchema: TB.Object({
              id: TB.String(),
              name: TB.String(),
            }),
          } satisfies EndpointDefinition,
        };

        const mockPool = mockAgent.get('https://api.example.com');
        mockPool
          .intercept({ path: '/users/123', method: 'GET' })
          .reply(200, { id: '123', name: 'John' });

        const client = createApiClient(
          { baseUrl: 'https://api.example.com', validation: true },
          endpoints,
        );

        const result = await client.getUser({ path: { userId: '123' } });
        expect(result).toEqual({ id: '123', name: 'John' });
      });
    });

    describe('validation config', () => {
      it('should enable validation by default', async () => {
        const endpoints = {
          createUser: {
            path: '/users',
            method: 'POST',
            bodySchema: TB.Object({
              name: TB.String(),
            }),
            responseSchema: TB.Object({ id: TB.String() }),
          } satisfies EndpointDefinition,
        };

        const client = createApiClient(
          { baseUrl: 'https://api.example.com' }, // no validation property
          endpoints,
        );

        await expect(
          client.createUser({ body: { name: 123 as unknown as string } }),
        ).rejects.toThrow(ApiClientRequestValidationError);
      });

      it('should disable validation when validation: false', async () => {
        const endpoints = {
          getUser: {
            path: '/users/:userId',
            method: 'GET',
            pathSchema: TB.Object({
              userId: TB.String(),
            }),
            responseSchema: TB.Object({
              id: TB.String(),
              name: TB.String(),
            }),
          } satisfies EndpointDefinition,
        };

        const mockPool = mockAgent.get('https://api.example.com');
        mockPool
          .intercept({ path: '/users/123', method: 'GET' })
          .reply(200, { id: 123, name: 'John' }); // Invalid response

        const client = createApiClient(
          { baseUrl: 'https://api.example.com', validation: false },
          endpoints,
        );

        // Should not throw validation error
        const result = await client.getUser({ path: { userId: '123' } });
        expect(result).toEqual({ id: 123, name: 'John' });
      });
    });

    describe('type safety - required params', () => {
      it('should require body parameter when bodySchema is defined', () => {
        const endpoints = {
          createUser: {
            path: '/users',
            method: 'POST',
            bodySchema: TB.Object({
              name: TB.String(),
            }),
            responseSchema: TB.Object({ id: TB.String() }),
          } satisfies EndpointDefinition,
        };

        const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

        // These are compile-time type checks - TypeScript should error on these lines
        // @ts-expect-error - body parameter is required but not provided
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _noParams: typeof client.createUser = () => client.createUser();

        // @ts-expect-error - body parameter is required but missing
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _emptyParams: typeof client.createUser = () => client.createUser({});

        expect(client.createUser).toBeDefined();
      });

      it('should require path parameter when pathSchema is defined', () => {
        const endpoints = {
          getUser: {
            path: '/users/:userId',
            method: 'GET',
            pathSchema: TB.Object({
              userId: TB.String(),
            }),
            responseSchema: TB.Object({ id: TB.String() }),
          } satisfies EndpointDefinition,
        };

        const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

        // These are compile-time type checks
        // @ts-expect-error - path parameter is required but not provided
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _noParams: typeof client.getUser = () => client.getUser();

        // @ts-expect-error - path parameter is required but missing
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _emptyParams: typeof client.getUser = () => client.getUser({});

        expect(client.getUser).toBeDefined();
      });

      it('should require query parameter when querySchema is defined', () => {
        const endpoints = {
          listUsers: {
            path: '/users',
            method: 'GET',
            querySchema: TB.Object({
              limit: TB.Number(),
            }),
            responseSchema: TB.Array(TB.Object({ id: TB.String() })),
          } satisfies EndpointDefinition,
        };

        const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

        // These are compile-time type checks
        // @ts-expect-error - query parameter is required but not provided
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _noParams: typeof client.listUsers = () => client.listUsers();

        // @ts-expect-error - query parameter is required but missing
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _emptyParams: typeof client.listUsers = () => client.listUsers({});

        expect(client.listUsers).toBeDefined();
      });

      it('should require multiple parameters when multiple schemas are defined', () => {
        const endpoints = {
          updateUser: {
            path: '/users/:userId',
            method: 'PUT',
            pathSchema: TB.Object({
              userId: TB.String(),
            }),
            bodySchema: TB.Object({
              name: TB.String(),
            }),
            responseSchema: TB.Object({ id: TB.String() }),
          } satisfies EndpointDefinition,
        };

        const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

        // These are compile-time type checks
        // @ts-expect-error - both path and body required but not provided
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _noParams: typeof client.updateUser = () => client.updateUser();

        // TypeScript properly catches path missing
        // @ts-expect-error - path required but missing
        client.updateUser({ body: { name: 'John' } });

        // TypeScript properly catches body missing
        // @ts-expect-error - body required but missing
        client.updateUser({ path: { userId: '123' } });

        expect(client.updateUser).toBeDefined();
      });

      it('should allow omitting params when no schemas are defined', () => {
        const endpoints = {
          listUsers: {
            path: '/users',
            method: 'GET',
            responseSchema: TB.Array(TB.Object({ id: TB.String() })),
          } satisfies EndpointDefinition,
        };

        const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

        // These should be valid TypeScript
        expect(() => client.listUsers()).toBeDefined();
        expect(() => client.listUsers(undefined)).toBeDefined();

        expect(client.listUsers).toBeDefined();
        expect(client.listUsers.definition).toBeDefined();
        expect(client.listUsers.definition.path).toBe('/users');
      });
    });
  });

  describe('multiple endpoints', () => {
    it('should create client with multiple typed endpoints', async () => {
      const endpoints = {
        listUsers: {
          path: '/users',
          method: 'GET',
          responseSchema: TB.Array(TB.Object({ id: TB.String() })),
        },
        getUser: {
          path: '/users/:userId',
          method: 'GET',
          pathSchema: TB.Object({
            userId: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String(), name: TB.String() }),
        },
        createUser: {
          path: '/users',
          method: 'POST',
          bodySchema: TB.Object({
            name: TB.String(),
          }),
          responseSchema: TB.Object({ id: TB.String() }),
        },
      } satisfies Record<string, EndpointDefinition>;

      const mockPool = mockAgent.get('https://api.example.com');
      mockPool.intercept({ path: '/users', method: 'GET' }).reply(200, []);
      mockPool.intercept({ path: '/users/123', method: 'GET' }).reply(200, {
        id: '123',
        name: 'John',
      });
      mockPool.intercept({ path: '/users', method: 'POST' }).reply(201, {
        id: '456',
      });

      const client = createApiClient({ baseUrl: 'https://api.example.com' }, endpoints);

      expect(client.listUsers).toBeDefined();
      expect(client.getUser).toBeDefined();
      expect(client.createUser).toBeDefined();

      await client.listUsers();
      await client.getUser({ path: { userId: '123' } });
      await client.createUser({ body: { name: 'John' } });
    });
  });
});

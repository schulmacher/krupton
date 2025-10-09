import type { EndpointDefinition } from '@krupton/api-client-node';
import { TB } from '@krupton/service-framework-node/typebox';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEndpointStorage } from './endpointStorage.js';

describe('createEndpointStorage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-storage-' + Date.now());
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const testEndpoint = {
    path: '/api/v3/test',
    method: 'GET',
    querySchema: TB.Object({
      symbol: TB.String(),
    }),
    responseSchema: TB.Object({
      id: TB.String(),
      value: TB.Number(),
    }),
  } satisfies EndpointDefinition;

  describe('endpoint path normalization', () => {
    it('should normalize endpoint path by removing leading slashes and replacing slashes with underscores', () => {
      const storage = createEndpointStorage(tempDir, testEndpoint);

      expect(storage.normalizedEndpoint).toBe('api_v3_test');
      expect(storage.endpointPath).toBe('/api/v3/test');
    });

    it('should handle endpoints without leading slash', () => {
      const endpoint = {
        path: 'api/v3/test',
        method: 'GET',
        responseSchema: TB.Object({ id: TB.String() }),
      } satisfies EndpointDefinition;

      const storage = createEndpointStorage(tempDir, endpoint);

      expect(storage.normalizedEndpoint).toBe('api_v3_test');
    });

    it('should handle endpoints with multiple leading slashes', () => {
      const endpoint = {
        path: '///api/v3/test',
        method: 'GET',
        responseSchema: TB.Object({ id: TB.String() }),
      } satisfies EndpointDefinition;

      const storage = createEndpointStorage(tempDir, endpoint);

      expect(storage.normalizedEndpoint).toBe('api_v3_test');
    });
  });
});

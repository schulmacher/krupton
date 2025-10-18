import { describe, it, expect } from 'vitest';
import { allocateShards, rebalanceShards } from './shardAllocator.js';
import type { WorkerInfo } from './types.js';

describe('shardAllocator', () => {
  describe('allocateShards', () => {
    it('should return empty allocation when no workers', () => {
      const allocation = allocateShards([], 10);
      expect(allocation.size).toBe(0);
    });

    it('should return empty allocation when maxShardCount is 0', () => {
      const workers: WorkerInfo[] = [
        {
          workerId: 'worker-1',
          serviceName: 'test-service',
          assignedShards: [],
          lastHeartbeat: Date.now(),
          isActive: true,
        },
      ];
      const allocation = allocateShards(workers, 0);
      expect(allocation.size).toBe(0);
    });

    it('should allocate all shards to single worker', () => {
      const workers: WorkerInfo[] = [
        {
          workerId: 'worker-1',
          serviceName: 'test-service',
          assignedShards: [],
          lastHeartbeat: Date.now(),
          isActive: true,
        },
      ];

      const allocation = allocateShards(workers, 10);
      expect(allocation.get('worker-1')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should distribute shards evenly across workers', () => {
      const workers: WorkerInfo[] = [
        {
          workerId: 'worker-1',
          serviceName: 'test-service',
          assignedShards: [],
          lastHeartbeat: Date.now(),
          isActive: true,
        },
        {
          workerId: 'worker-2',
          serviceName: 'test-service',
          assignedShards: [],
          lastHeartbeat: Date.now(),
          isActive: true,
        },
      ];

      const allocation = allocateShards(workers, 10);
      expect(allocation.get('worker-1')).toEqual([0, 1, 2, 3, 4]);
      expect(allocation.get('worker-2')).toEqual([5, 6, 7, 8, 9]);
    });

    it('should distribute remainder shards to first workers', () => {
      const workers: WorkerInfo[] = [
        {
          workerId: 'worker-1',
          serviceName: 'test-service',
          assignedShards: [],
          lastHeartbeat: Date.now(),
          isActive: true,
        },
        {
          workerId: 'worker-2',
          serviceName: 'test-service',
          assignedShards: [],
          lastHeartbeat: Date.now(),
          isActive: true,
        },
        {
          workerId: 'worker-3',
          serviceName: 'test-service',
          assignedShards: [],
          lastHeartbeat: Date.now(),
          isActive: true,
        },
      ];

      const allocation = allocateShards(workers, 10);
      expect(allocation.get('worker-1')).toEqual([0, 1, 2, 3]); // 4 shards
      expect(allocation.get('worker-2')).toEqual([4, 5, 6]); // 3 shards
      expect(allocation.get('worker-3')).toEqual([7, 8, 9]); // 3 shards
    });

    it('should sort workers by ID for consistent allocation', () => {
      const workers: WorkerInfo[] = [
        {
          workerId: 'worker-3',
          serviceName: 'test-service',
          assignedShards: [],
          lastHeartbeat: Date.now(),
          isActive: true,
        },
        {
          workerId: 'worker-1',
          serviceName: 'test-service',
          assignedShards: [],
          lastHeartbeat: Date.now(),
          isActive: true,
        },
        {
          workerId: 'worker-2',
          serviceName: 'test-service',
          assignedShards: [],
          lastHeartbeat: Date.now(),
          isActive: true,
        },
      ];

      const allocation = allocateShards(workers, 6);
      expect(allocation.get('worker-1')).toEqual([0, 1]); // First in sorted order
      expect(allocation.get('worker-2')).toEqual([2, 3]);
      expect(allocation.get('worker-3')).toEqual([4, 5]);
    });
  });

  describe('rebalanceShards', () => {
    it('should update worker assigned shards', () => {
      const workers: WorkerInfo[] = [
        {
          workerId: 'worker-1',
          serviceName: 'test-service',
          assignedShards: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
          lastHeartbeat: Date.now(),
          isActive: true,
        },
        {
          workerId: 'worker-2',
          serviceName: 'test-service',
          assignedShards: [],
          lastHeartbeat: Date.now(),
          isActive: true,
        },
      ];

      rebalanceShards('test-service', workers, 10);

      expect(workers[0].assignedShards).toEqual([0, 1, 2, 3, 4]);
      expect(workers[1].assignedShards).toEqual([5, 6, 7, 8, 9]);
    });

    it('should handle empty workers array', () => {
      const workers: WorkerInfo[] = [];
      rebalanceShards('test-service', workers, 10);
      expect(workers).toEqual([]);
    });

    it('should clear shards when maxShardCount is 0', () => {
      const workers: WorkerInfo[] = [
        {
          workerId: 'worker-1',
          serviceName: 'test-service',
          assignedShards: [0, 1, 2],
          lastHeartbeat: Date.now(),
          isActive: true,
        },
      ];

      rebalanceShards('test-service', workers, 0);
      expect(workers[0].assignedShards).toEqual([]);
    });
  });
});

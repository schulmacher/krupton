import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWorkerRegistry } from './workerRegistry.js';

describe('workerRegistry', () => {
  let registry: ReturnType<typeof createWorkerRegistry>;

  beforeEach(() => {
    registry = createWorkerRegistry();
    vi.useFakeTimers();
  });

  describe('registerWorker', () => {
    it('should register a new worker', () => {
      const worker = registry.registerWorker('service-1', 'worker-1', 10);

      expect(worker.workerId).toBe('worker-1');
      expect(worker.serviceName).toBe('service-1');
      expect(worker.assignedShards).toEqual([]);
      expect(worker.isActive).toBe(true);
    });

    it('should return existing worker on re-registration', () => {
      const worker1 = registry.registerWorker('service-1', 'worker-1', 10);
      worker1.assignedShards = [0, 1, 2];

      const worker2 = registry.registerWorker('service-1', 'worker-1', 10);

      expect(worker2).toBe(worker1);
      expect(worker2.assignedShards).toEqual([0, 1, 2]);
    });

    it('should update heartbeat timestamp on re-registration', () => {
      const initialTime = Date.now();
      vi.setSystemTime(initialTime);

      const worker1 = registry.registerWorker('service-1', 'worker-1', 10);
      const firstHeartbeat = worker1.lastHeartbeat;

      vi.advanceTimersByTime(5000);

      const worker2 = registry.registerWorker('service-1', 'worker-1', 10);
      const secondHeartbeat = worker2.lastHeartbeat;

      expect(secondHeartbeat).toBeGreaterThan(firstHeartbeat);
    });

    it('should register multiple workers for same service', () => {
      registry.registerWorker('service-1', 'worker-1', 10);
      registry.registerWorker('service-1', 'worker-2', 10);

      const service = registry.getService('service-1');
      expect(service?.workers.size).toBe(2);
    });
  });

  describe('updateHeartbeat', () => {
    it('should update worker heartbeat timestamp', () => {
      const initialTime = Date.now();
      vi.setSystemTime(initialTime);

      const worker = registry.registerWorker('service-1', 'worker-1', 10);
      const firstHeartbeat = worker.lastHeartbeat;

      vi.advanceTimersByTime(5000);
      registry.updateHeartbeat('service-1', 'worker-1');

      const updatedWorker = registry.getWorker('service-1', 'worker-1');
      expect(updatedWorker?.lastHeartbeat).toBeGreaterThan(firstHeartbeat);
    });

    it('should mark inactive worker as active', () => {
      const worker = registry.registerWorker('service-1', 'worker-1', 10);
      worker.isActive = false;

      registry.updateHeartbeat('service-1', 'worker-1');

      expect(worker.isActive).toBe(true);
    });

    it('should handle non-existent service gracefully', () => {
      expect(() => {
        registry.updateHeartbeat('non-existent', 'worker-1');
      }).not.toThrow();
    });

    it('should handle non-existent worker gracefully', () => {
      registry.registerWorker('service-1', 'worker-1', 10);

      expect(() => {
        registry.updateHeartbeat('service-1', 'non-existent');
      }).not.toThrow();
    });
  });

  describe('updateMaxShardCount', () => {
    it('should update shard count and return true when changed', () => {
      registry.registerWorker('service-1', 'worker-1', 10);
      registry.updateMaxShardCount('service-1', 10); // Set initial count

      const changed = registry.updateMaxShardCount('service-1', 20);

      expect(changed).toBe(true);
      const service = registry.getService('service-1');
      expect(service?.maxShardCount).toBe(20);
    });

    it('should return false when shard count unchanged', () => {
      registry.registerWorker('service-1', 'worker-1', 10);
      registry.updateMaxShardCount('service-1', 10); // Set initial count

      const changed = registry.updateMaxShardCount('service-1', 10);

      expect(changed).toBe(false);
    });

    it('should create service if not exists', () => {
      const changed = registry.updateMaxShardCount('new-service', 15);

      expect(changed).toBe(true);
      const service = registry.getService('new-service');
      expect(service?.maxShardCount).toBe(15);
    });
  });

  describe('getActiveWorkers', () => {
    it('should return only active workers', () => {
      const worker1 = registry.registerWorker('service-1', 'worker-1', 10);
      const worker2 = registry.registerWorker('service-1', 'worker-2', 10);
      const worker3 = registry.registerWorker('service-1', 'worker-3', 10);

      worker2.isActive = false;

      const activeWorkers = registry.getActiveWorkers('service-1');

      expect(activeWorkers).toHaveLength(2);
      expect(activeWorkers).toContain(worker1);
      expect(activeWorkers).toContain(worker3);
      expect(activeWorkers).not.toContain(worker2);
    });

    it('should return empty array for non-existent service', () => {
      const activeWorkers = registry.getActiveWorkers('non-existent');
      expect(activeWorkers).toEqual([]);
    });

    it('should return empty array when no active workers', () => {
      const worker1 = registry.registerWorker('service-1', 'worker-1', 10);
      const worker2 = registry.registerWorker('service-1', 'worker-2', 10);

      worker1.isActive = false;
      worker2.isActive = false;

      const activeWorkers = registry.getActiveWorkers('service-1');
      expect(activeWorkers).toEqual([]);
    });
  });

  describe('markInactiveWorkers', () => {
    it('should mark workers as inactive after timeout', () => {
      const initialTime = Date.now();
      vi.setSystemTime(initialTime);

      const worker = registry.registerWorker('service-1', 'worker-1', 10);
      worker.assignedShards = [0, 1, 2];

      vi.advanceTimersByTime(16000); // Advance past 15 second timeout

      const inactiveWorkers = registry.markInactiveWorkers(15000);

      expect(inactiveWorkers).toHaveLength(1);
      expect(inactiveWorkers[0]).toEqual({
        serviceName: 'service-1',
        workerId: 'worker-1',
      });
      expect(worker.isActive).toBe(false);
      expect(worker.assignedShards).toEqual([]);
    });

    it('should not mark workers with recent heartbeats', () => {
      const initialTime = Date.now();
      vi.setSystemTime(initialTime);

      registry.registerWorker('service-1', 'worker-1', 10);

      vi.advanceTimersByTime(10000); // Only 10 seconds

      const inactiveWorkers = registry.markInactiveWorkers(15000);

      expect(inactiveWorkers).toHaveLength(0);
    });

    it('should only mark active workers as inactive', () => {
      const initialTime = Date.now();
      vi.setSystemTime(initialTime);

      const worker = registry.registerWorker('service-1', 'worker-1', 10);
      worker.isActive = false;

      vi.advanceTimersByTime(20000);

      const inactiveWorkers = registry.markInactiveWorkers(15000);

      expect(inactiveWorkers).toHaveLength(0);
    });

    it('should handle multiple services', () => {
      const initialTime = Date.now();
      vi.setSystemTime(initialTime);

      registry.registerWorker('service-1', 'worker-1', 10);
      registry.registerWorker('service-2', 'worker-2', 20);

      vi.advanceTimersByTime(16000);

      const inactiveWorkers = registry.markInactiveWorkers(15000);

      expect(inactiveWorkers).toHaveLength(2);
    });
  });

  describe('getService', () => {
    it('should return service configuration', () => {
      registry.registerWorker('service-1', 'worker-1', 10);
      registry.updateMaxShardCount('service-1', 10);

      const service = registry.getService('service-1');

      expect(service).toBeDefined();
      expect(service?.serviceName).toBe('service-1');
      expect(service?.maxShardCount).toBe(10);
    });

    it('should return undefined for non-existent service', () => {
      const service = registry.getService('non-existent');
      expect(service).toBeUndefined();
    });
  });

  describe('getWorker', () => {
    it('should return worker info', () => {
      registry.registerWorker('service-1', 'worker-1', 10);

      const worker = registry.getWorker('service-1', 'worker-1');

      expect(worker).toBeDefined();
      expect(worker?.workerId).toBe('worker-1');
      expect(worker?.serviceName).toBe('service-1');
    });

    it('should return undefined for non-existent worker', () => {
      registry.registerWorker('service-1', 'worker-1', 10);

      const worker = registry.getWorker('service-1', 'non-existent');
      expect(worker).toBeUndefined();
    });
  });

  describe('getAllServices', () => {
    it('should return all services', () => {
      registry.registerWorker('service-1', 'worker-1', 10);
      registry.registerWorker('service-2', 'worker-2', 20);

      const services = registry.getAllServices();

      expect(services).toHaveLength(2);
      expect(services[0].serviceName).toBe('service-1');
      expect(services[1].serviceName).toBe('service-2');
    });

    it('should return empty array when no services', () => {
      const services = registry.getAllServices();
      expect(services).toEqual([]);
    });
  });
});

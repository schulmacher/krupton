import type { ServiceConfig, WorkerInfo } from './types.js';

export function createWorkerRegistry() {
  const services = new Map<string, ServiceConfig>();

  function getOrCreateService(serviceName: string): ServiceConfig {
    let service = services.get(serviceName);
    if (!service) {
      service = {
        serviceName,
        maxShardCount: 0,
        workers: new Map(),
      };
      services.set(serviceName, service);
    }
    return service;
  }

  function registerWorker(serviceName: string, workerId: string, maxShardCount: number): WorkerInfo {
    const service = getOrCreateService(serviceName);
    const now = Date.now();

    let worker = service.workers.get(workerId);
    if (worker) {
      // Worker already registered, update heartbeat
      // TODO check shards, send message with shards to worker
      worker.lastHeartbeat = now;
      worker.isActive = true;
      return worker;
    }

    // New worker
    worker = {
      workerId,
      serviceName,
      assignedShards: [],
      lastHeartbeat: now,
      isActive: true,
    };

    service.workers.set(workerId, worker);
    return worker;
  }

  function updateHeartbeat(serviceName: string, workerId: string): void {
    const service = services.get(serviceName);
    if (!service) return;

    const worker = service.workers.get(workerId);
    if (!worker) return;

    worker.lastHeartbeat = Date.now();
    worker.isActive = true;
  }

  function updateMaxShardCount(serviceName: string, maxShardCount: number): boolean {
    const service = getOrCreateService(serviceName);
    const changed = service.maxShardCount !== maxShardCount;
    service.maxShardCount = maxShardCount;
    return changed;
  }

  function getService(serviceName: string): ServiceConfig | undefined {
    return services.get(serviceName);
  }

  function getWorker(serviceName: string, workerId: string): WorkerInfo | undefined {
    const service = services.get(serviceName);
    return service?.workers.get(workerId);
  }

  function getActiveWorkers(serviceName: string): WorkerInfo[] {
    const service = services.get(serviceName);
    if (!service) return [];

    return Array.from(service.workers.values()).filter((worker) => worker.isActive);
  }

  function markInactiveWorkers(timeoutMs: number): Array<{ serviceName: string; workerId: string }> {
    const now = Date.now();
    const inactiveWorkers: Array<{ serviceName: string; workerId: string }> = [];

    for (const service of services.values()) {
      for (const worker of service.workers.values()) {
        if (worker.isActive && now - worker.lastHeartbeat > timeoutMs) {
          worker.isActive = false;
          worker.assignedShards = [];
          inactiveWorkers.push({
            serviceName: service.serviceName,
            workerId: worker.workerId,
          });
        }
      }
    }

    return inactiveWorkers;
  }

  function getAllServices(): ServiceConfig[] {
    return Array.from(services.values());
  }

  return {
    registerWorker,
    updateHeartbeat,
    updateMaxShardCount,
    getService,
    getWorker,
    getActiveWorkers,
    markInactiveWorkers,
    getAllServices,
  };
}

export type WorkerRegistry = ReturnType<typeof createWorkerRegistry>;


import type { WorkerInfo } from './types.js';

export function allocateShards(
  workers: WorkerInfo[],
  maxShardCount: number,
): Map<string, number[]> {
  const allocation = new Map<string, number[]>();

  if (workers.length === 0 || maxShardCount === 0) {
    return allocation;
  }

  // Sort workers by ID for consistent allocation
  const sortedWorkers = [...workers].sort((a, b) => a.workerId.localeCompare(b.workerId));

  // Calculate base shards per worker and remainder
  const baseShards = Math.floor(maxShardCount / sortedWorkers.length);
  const remainder = maxShardCount % sortedWorkers.length;

  let currentShard = 0;

  for (let i = 0; i < sortedWorkers.length; i++) {
    const worker = sortedWorkers[i];
    const shardsForWorker = baseShards + (i < remainder ? 1 : 0);
    const assignedShards: number[] = [];

    for (let j = 0; j < shardsForWorker; j++) {
      assignedShards.push(currentShard++);
    }

    allocation.set(worker.workerId, assignedShards);
  }

  return allocation;
}

export function rebalanceShards(
  serviceName: string,
  workers: WorkerInfo[],
  maxShardCount: number,
): void {
  const allocation = allocateShards(workers, maxShardCount);

  for (const worker of workers) {
    worker.assignedShards = allocation.get(worker.workerId) || [];
  }
}

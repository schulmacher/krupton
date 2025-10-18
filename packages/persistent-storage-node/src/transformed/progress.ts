import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TB } from '@krupton/service-framework-node/typebox';
import { ensureFile } from '../lib/fs.js';

export const EntityProgress = TB.Object({
  entityType: TB.String(),
  symbol: TB.String(),
  lastProcessedFile: TB.String(),
  lastProcessedLineIndex: TB.Number(),
  lastProcessedTimestamp: TB.Number(),
  updatedAt: TB.Number(),
});

export const StreamProgress = TB.Array(EntityProgress);

export type EntityProgress = TB.Static<typeof EntityProgress>;
export type StreamProgress = TB.Static<typeof StreamProgress>;

function getProgressFilePath(baseDir: string, streamId: string): string {
  return join(baseDir, 'progress', `${streamId}.json`);
}

export async function readProgress(baseDir: string, streamId: string): Promise<StreamProgress> {
  const filePath = getProgressFilePath(baseDir, streamId);

  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function writeProgress(
  baseDir: string,
  streamId: string,
  progress: StreamProgress,
): Promise<void> {
  const filePath = getProgressFilePath(baseDir, streamId);
  await ensureFile(filePath);
  await writeFile(filePath, JSON.stringify(progress, null, 2), 'utf-8');
}

export function updateEntityProgress(
  progress: StreamProgress,
  entityType: string,
  symbol: string,
  update: Partial<Omit<EntityProgress, 'entityType' | 'symbol'>>,
): StreamProgress {
  const existingIndex = progress.findIndex(
    (p) => p.entityType === entityType && p.symbol === symbol,
  );

  const updatedEntity: EntityProgress = {
    entityType,
    symbol,
    lastProcessedFile: update.lastProcessedFile ?? '00000000000000000000000000000000',
    lastProcessedLineIndex: update.lastProcessedLineIndex ?? 0,
    lastProcessedTimestamp: update.lastProcessedTimestamp ?? 0,
    updatedAt: Date.now(),
  };

  if (existingIndex >= 0) {
    const newProgress = [...progress];
    newProgress[existingIndex] = updatedEntity;
    return newProgress;
  }

  return [...progress, updatedEntity];
}

export function getEntityProgress(
  progress: StreamProgress,
  entityType: string,
  symbol: string,
): EntityProgress | null {
  return progress.find((p) => p.entityType === entityType && p.symbol === symbol) ?? null;
}

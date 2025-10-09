import { constants } from 'node:fs';
import { access, appendFile, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureFile } from '../fs.js';
import { createPromiseLock } from '../promise.js';
import { getLastIndexEntry } from './persistentStorageIndex.js';
import {
  addRowIndexes,
  readFromLastIndex,
  reindexAllFiles,
  replaceLastRowBasedOnIndex,
  serializeRecords,
} from './persistentStorageIndexOps.js';

const FS_PAGE_SIZE = 4096;
const MAX_FILE_SIZE_BYTES = FS_PAGE_SIZE * 25600; // ~100MB (4096 * 25600 = 104,857,600 bytes)

export type StorageRecord<T extends Record<string, unknown>> = {
  timestamp: number;
} & T;

type WriteRecordParams<T extends Record<string, unknown>> = {
  record: StorageRecord<T>;
  subIndexDir: string;
};

type ReadRecordsParams = {
  subIndexDir: string;
  fileName: string;
};

function formatFileName(globalLineIndex: bigint): string {
  return globalLineIndex.toString().padStart(32, '0');
}

function getInitialFileName(): string {
  return '00000000000000000000000000000000';
}

export function createPersistentStorage<T extends Record<string, unknown>>(baseDir: string) {
  const promiseLock = createPromiseLock();

  const currentFileNameCache = new Map<string, string>();

  const getFilePath = (subIndexDir: string, fileName: string): string => {
    return join(baseDir, subIndexDir, `${fileName}.jsonl`);
  };

  const listJsonlFilesInDirectory = async (directory: string): Promise<string[]> => {
    try {
      const files = await readdir(directory);
      return files
        .filter((file) => file.endsWith('.jsonl'))
        .map((file) => join(directory, file))
        .sort((a, b) => {
          const aName = a
            .split('/')
            .pop()!
            .replace(/\.jsonl$/, '');
          const bName = b
            .split('/')
            .pop()!
            .replace(/\.jsonl$/, '');
          return aName.localeCompare(bName);
        });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  };

  const getCurrentOrInitialFileName = async (subIndexDir: string): Promise<string> => {
    const cached = currentFileNameCache.get(subIndexDir);
    if (cached !== undefined) {
      return cached;
    }

    const subDir = join(baseDir, subIndexDir);
    const files = await listJsonlFilesInDirectory(subDir);

    let fileName: string;
    if (files.length === 0) {
      fileName = getInitialFileName();
    } else {
      const lastFile = files[files.length - 1]!;
      fileName = lastFile
        .split('/')
        .pop()!
        .replace(/\.jsonl$/, '');
    }

    currentFileNameCache.set(subIndexDir, fileName);
    return fileName;
  };

  const shouldRotateFile = async (subIndexDir: string, fileName: string): Promise<boolean> => {
    const filePath = getFilePath(subIndexDir, fileName);
    try {
      const fileStats = await stat(filePath);
      return fileStats.size >= MAX_FILE_SIZE_BYTES;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  };

  const createNextFileName = async (subIndexDir: string, currentFile: string): Promise<string> => {
    const currentFilePath = getFilePath(subIndexDir, currentFile);
    const lastEntry = await getLastIndexEntry({ indexPath: currentFilePath });

    if (!lastEntry) {
      throw new Error('Cannot create next file: current file has no entries');
    }

    const nextGlobalLineIndex = lastEntry.lineNumberGlobal + 1n;
    return formatFileName(nextGlobalLineIndex);
  };

  async function writeRecords(
    filePath: string,
    records: StorageRecord<T>[],
    writeMethod: typeof writeFile | typeof appendFile,
  ): Promise<void> {
    await ensureFile(filePath);

    const serialized = serializeRecords(records);

    await writeMethod(filePath, serialized.content, 'utf-8');
    await addRowIndexes(filePath, serialized.positions, records);
  }

  return {
    async writeRecord(params: WriteRecordParams<T>): Promise<void> {
      await promiseLock.waitForRelease();
      const { record, subIndexDir } = params;
      const fileName = await getCurrentOrInitialFileName(subIndexDir);
      const filePath = getFilePath(subIndexDir, fileName);

      await writeRecords(filePath, [record], writeFile);
    },

    async appendRecord(params: WriteRecordParams<T>): Promise<void> {
      await promiseLock.waitForRelease();
      const { record, subIndexDir } = params;

      let fileName = await getCurrentOrInitialFileName(subIndexDir);

      if (await shouldRotateFile(subIndexDir, fileName)) {
        fileName = await createNextFileName(subIndexDir, fileName);
        currentFileNameCache.set(subIndexDir, fileName);
      }

      const filePath = getFilePath(subIndexDir, fileName);

      try {
        await access(filePath, constants.F_OK);
        await writeRecords(filePath, [record], appendFile);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          await writeRecords(filePath, [record], writeFile);
        } else {
          throw error;
        }
      }
    },

    async readRecords(params: ReadRecordsParams): Promise<StorageRecord<T>[]> {
      await promiseLock.waitForRelease();
      const { subIndexDir, fileName } = params;
      const filePath = getFilePath(subIndexDir, fileName);

      try {
        const fileContent = await readFile(filePath, 'utf-8');
        const lines = fileContent
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);

        return lines.map((line) => JSON.parse(line) as StorageRecord<T>);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    },

    async readLastRecord(subIndexDir: string): Promise<StorageRecord<T> | null> {
      await promiseLock.waitForRelease();
      const fileName = await getCurrentOrInitialFileName(subIndexDir);
      const filePath = getFilePath(subIndexDir, fileName);

      return readFromLastIndex<StorageRecord<T>>(filePath);
    },

    async replaceLastRecord(params: WriteRecordParams<T>): Promise<void> {
      await promiseLock.waitForRelease();
      const { record, subIndexDir } = params;
      const fileName = await getCurrentOrInitialFileName(subIndexDir);
      const filePath = getFilePath(subIndexDir, fileName);

      await replaceLastRowBasedOnIndex<StorageRecord<T>>(filePath, record);
    },

    async reindexAll(): Promise<void> {
      promiseLock.lock();

      try {
        // List all subdirectories (subIndexDirs)
        let subIndexDirs: string[];
        try {
          const entries = await readdir(baseDir, { withFileTypes: true });
          subIndexDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return; // No directory exists yet, nothing to reindex
          }
          throw error;
        }

        // Reindex files in each subIndexDir separately
        for (const subIndexDir of subIndexDirs) {
          const subDir = join(baseDir, subIndexDir);
          const listAllFiles = async (): Promise<string[]> => {
            return await listJsonlFilesInDirectory(subDir);
          };

          await reindexAllFiles<StorageRecord<T>>(listAllFiles);
        }
      } finally {
        void promiseLock.release(void 0);
      }
    },
  };
}

export type PersistentStorage<T extends Record<string, unknown>> = ReturnType<
  typeof createPersistentStorage<T>
>;

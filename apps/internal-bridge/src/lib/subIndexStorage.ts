import { PersistentStorage, StorageRecord } from '@krupton/persistent-storage-node';

export interface PersistentSubIndexStorage<T extends StorageRecord<Record<string, unknown>>> {
  readLastRecord: () => Promise<T | null>;
  readRecordsRange: (fromIndex: number, count: number) => Promise<T[]>;
  getNextId: () => number;
  appendRecord: (record: T) => void;
  replaceOrInsertLastRecord: (record: T) => Promise<void>;
}

export function createSubIndexStorage<T extends StorageRecord<Record<string, unknown>>>(
  storage: PersistentStorage<T>,
  subIndex: string,
): PersistentSubIndexStorage<T> {
  return {
    readLastRecord: async () => {
      return await storage.readLastRecord(subIndex);
    },

    readRecordsRange: async (fromIndex: number, count: number) => {
      return await storage.readRecordsRange({
        subIndexDir: subIndex,
        fromIndex,
        count,
      });
    },

    getNextId: () => {
      return storage.getNextId(subIndex);
    },

    appendRecord: (record: T) => {
      return storage.appendRecord({
        subIndexDir: subIndex,
        record,
      });
    },

    replaceOrInsertLastRecord: async (record: T) => {
      return await storage.replaceOrInsertLastRecord({
        subIndexDir: subIndex,
        record,
      });
    },
  };
}

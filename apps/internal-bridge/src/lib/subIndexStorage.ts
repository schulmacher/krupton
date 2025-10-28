import {
  BaseStorageRecord,
  PersistentStorage
} from '@krupton/persistent-storage-node';

export function createSubIndexStorage<T extends BaseStorageRecord>(
  storage: PersistentStorage<T>,
  subIndex: string,
) {
  return {
    readLastRecord: async () => {
      return await storage.readLastRecord(subIndex);
    },

    readRecordsRange: async (fromId: number, count: number) => {
      return await storage.readRecordsRange({
        subIndex,
        fromId,
        count,
      });
    },

    iterateFrom: async (fromId: number) => {
      return await storage.iterateFrom({
        subIndex,
        fromId,
      });
    },

    appendRecord: (record: T) => {
      return storage.appendRecord({
        subIndex,
        record,
      });
    },

    replaceOrInsertLastRecord: async (record: T) => {
      await storage.replaceOrInsertLastRecord({
        subIndex,
        record,
      });
    },
  };
}

export type PersistentSubIndexStorage<T extends BaseStorageRecord> = ReturnType<
  typeof createSubIndexStorage<T>
>;

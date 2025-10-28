import { SegmentedLog } from '@krupton/rust-rocksdb-napi'; // ← your NAPI binding
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function normalizeIndexDir(subIndex: string): string {
  return subIndex
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

export type BaseStorageRecord = Record<string, unknown>;

export type StorageRecord<T extends BaseStorageRecord> = {
  timestamp?: number;
} & Omit<T, 'timestamp' | 'id'>;

export type StorageRecordReturn<T extends BaseStorageRecord> = {
  id: number;
  timestamp: number;
} & Omit<T, 'timestamp'>;

type WriteRecordParams<T extends BaseStorageRecord> = {
  record: StorageRecord<T>;
  subIndex: string;
};

type WriteRecordsParams<T extends BaseStorageRecord> = {
  records: StorageRecord<T>[];
  subIndex: string;
};

type ReplaceRecordParams<T extends BaseStorageRecord> = {
  record: StorageRecordReturn<T>;
  subIndex: string;
  id: number;
};
type ReplaceLastRecordParams<T extends BaseStorageRecord> = {
  record: StorageRecord<T>;
  subIndex: string;
};
type ReadFullPageParams = {
  subIndex: string;
};

type ReadRangeParams = {
  subIndex: string;
  fromId: number;
  count: number;
};
type IterateFromParams = {
  subIndex: string;
  fromId: number;
};

type CreatePersistentStorageOptions = {
  compression?: boolean;
  writable?: boolean;
};

/**
 * Persistent storage backed by SegmentedLog (RocksDB)
 * - Fast sequential appends
 * - Timestamp+sequence ordering
 * - Direct key overwrite support
 */
export function createPersistentStorage<T extends BaseStorageRecord>(
  baseDir: string,
  options?: CreatePersistentStorageOptions,
) {
  const dbCache = new Map<string, InstanceType<typeof SegmentedLog>>();
  const syncIntervals = new Map<string, NodeJS.Timeout>();

  const getDbPath = (subIndex: string): string => join(baseDir, subIndex);
  const getSecondaryPath = (subIndex: string): string => join(baseDir, `${subIndex}_secondary`);

  const getOrCreateDb = (subIndex: string): InstanceType<typeof SegmentedLog> => {
    const normalized = normalizeIndexDir(subIndex);
    const cached = dbCache.get(normalized);
    if (cached) return cached;

    const dbPath = getDbPath(normalized);
    mkdirSync(dirname(dbPath), { recursive: true });

    const db = options?.writable
      ? new SegmentedLog(dbPath, options?.compression ?? true)
      : SegmentedLog.openAsSecondary(
          dbPath,
          getSecondaryPath(normalized),
          options?.compression ?? true,
        );

    dbCache.set(normalized, db);

    if (!options?.writable) {
      const interval = setInterval(() => {
        try {
          db.tryCatchUpWithPrimary();
        } catch (error) {
          console.error(`Failed to sync secondary instance for ${normalized}:`, error);
        }
      }, 500);
      syncIntervals.set(normalized, interval);
    }

    return db;
  };

  const closeAllDatabases = (): void => {
    for (const interval of syncIntervals.values()) {
      clearInterval(interval);
    }
    syncIntervals.clear();

    for (const db of dbCache.values()) {
      try {
        db.close();
      } catch (error) {
        console.error('Failed to close rocksdb', error);
      }
    }
    dbCache.clear();
  };

  return {
    /**
     * Append one record (auto key: timestamp + seq)
     */
    async appendRecord(params: WriteRecordParams<T>): Promise<number> {
      const { record, subIndex } = params;
      record.timestamp = record.timestamp ?? Date.now();
      const db = getOrCreateDb(subIndex);
      const key = db.append(Buffer.from(JSON.stringify(record)));

      return parseKey(key);
    },

    /**
     * Append multiple records
     */
    async appendRecords(params: WriteRecordsParams<T>): Promise<number[]> {
      const { records, subIndex } = params;
      const db = getOrCreateDb(subIndex);
      const now = Date.now();
      const results = db.appendBatch(
        records.map((record) => {
          record.timestamp = record.timestamp ?? now;
          return Buffer.from(JSON.stringify(record));
        }),
      );

      return results.map((r) => parseKey(r));
    },

    /**
     * Replace or insert a specific record at a known key
     */
    async replaceRecord(params: ReplaceRecordParams<T>): Promise<void> {
      const { record, subIndex, id: key } = params;
      const db = getOrCreateDb(subIndex);
      record.timestamp = record.timestamp ?? Date.now();
      db.put(key, Buffer.from(JSON.stringify(record)));
    },

    /**
     * Replace the last record if it exists, otherwise append a new one.
     */
    async replaceOrInsertLastRecord(params: ReplaceLastRecordParams<T>) {
      const { record, subIndex } = params;
      const db = getOrCreateDb(subIndex);
      record.timestamp = record.timestamp ?? Date.now();

      // Try to read the most recent record
      const [last] = db.readLast(1);
      let key = last?.key ? parseKey(last.key) : undefined;
      if (key) {
        db.put(key, Buffer.from(JSON.stringify(record)));
      } else {
        // Append if database empty
        key = parseKey(db.append(Buffer.from(JSON.stringify(record))));
      }

      return key;
    },

    async readFullPage(params: ReadFullPageParams): Promise<StorageRecordReturn<T>[]> {
      const { subIndex } = params;
      const db = getOrCreateDb(normalizeIndexDir(subIndex));

      const results: StorageRecordReturn<T>[] = [];
      const iter = db.iterateFrom(0);

      try {
        while (iter.hasNext()) {
          const result = iter.next();
          if (result) {
            const key = parseKey(result.key);
            const value = JSON.parse(result.value.toString());
            results.push({ ...value, id: key });
          }
        }
      } finally {
        iter.close();
      }

      return results;
    },

    async iterateFrom(params: IterateFromParams): Promise<PersistentStorageIterator<T>> {
      const { subIndex, fromId } = params;
      const db = getOrCreateDb(normalizeIndexDir(subIndex));
      const iter = db.iterateFrom(fromId);

      return {
        hasNext() {
          return iter.hasNext();
        },
        close() {
          return iter.close();
        },
        next() {
          const item = iter.next();
          if (!item) {
            return null;
          }
          const value = JSON.parse(item.value.toString());
          value.id = parseKey(item.key);
          return value;
        },
      };
    },

    /**
     * Read forward from key (bigint)
     */
    async readRecordsRange(params: ReadRangeParams): Promise<StorageRecordReturn<T>[]> {
      const { subIndex, fromId, count } = params;
      const db = getOrCreateDb(subIndex);

      const results: StorageRecordReturn<T>[] = [];
      const iter = db.iterateFrom(fromId);
      const maxCount = count ?? 1000;

      try {
        let readCount = 0;
        while (iter.hasNext() && readCount < maxCount) {
          const result = iter.next();
          if (result) {
            const id = parseKey(result.key);
            const value = JSON.parse(result.value.toString());
            results.push({ id, ...value });
            readCount++;
          }
        }
      } finally {
        iter.close();
      }

      return results;
    },

    /**
     * Read the most recent N records
     */
    async readLastRecords(subIndex: string, count = 1): Promise<StorageRecordReturn<T>[]> {
      const db = getOrCreateDb(subIndex);
      const entries = db.readLast(count);
      const result: StorageRecordReturn<T>[] = [];
      for (const { key, value } of entries) {
        result.push({ ...JSON.parse(value.toString()), id: parseKey(key) });
      }
      return result;
    },

    /**
     * Read just the last record (if exists)
     */
    async readLastRecord(subIndex: string): Promise<StorageRecordReturn<T> | null> {
      const db = getOrCreateDb(subIndex);
      const [last] = db.readLast(1);
      if (!last) return null;
      return { ...JSON.parse(last.value.toString()), id: parseKey(last.key) };
    },

    close(): void {
      closeAllDatabases();
    },
  };
}

export type PersistentStorage<T extends BaseStorageRecord> = ReturnType<
  typeof createPersistentStorage<T>
>;

export function parseKey(key: Buffer): number {
  if (key.byteLength !== 8) {
    throw new Error(`Invalid key length ${key.byteLength}, expected 8 bytes`);
  }

  // Read big-endian 64-bit signed integer and convert to JS number
  const id = Number(key.readBigInt64BE(0));

  return id;
}

export type PersistentStorageIterator<T extends BaseStorageRecord> = {
  next(): StorageRecordReturn<T> | null;
  hasNext(): boolean;
  close(): void;
};

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function normalizeIndexDir(subIndexDir: string): string {
  return subIndexDir
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

export type StorageRecord<T extends Record<string, unknown>> = {
  timestamp: number;
  id: number;
} & T;

type WriteRecordParams<T extends Record<string, unknown>> = {
  record: StorageRecord<T>;
  subIndexDir: string;
};

type ReplaceLastRecordParams<T extends Record<string, unknown>> = {
  record: Omit<StorageRecord<T>, 'id'>;
  subIndexDir: string;
};

type ReadFullPageParams = {
  subIndexDir: string;
  fileName: string;
};

type ReadIndexRangeParams = {
  subIndexDir: string;
  fromIndex: number;
  count?: number;
};

type CreatePersistentStorageOptions = {
  maxFileSize?: number;
  writable?: boolean;
};

export function createPersistentStorage<T extends Record<string, unknown>>(
  baseDir: string,
  options?: CreatePersistentStorageOptions,
) {
  const dbCache = new Map<string, Database.Database>();
  const nextIdCache = new Map<string, number>();

  const getDbPath = (subIndexDir: string): string => {
    return join(baseDir, subIndexDir + '.db');
  };

  const getOrCreateDb = (subIndexDir: string): Database.Database => {
    const cached = dbCache.get(subIndexDir);
    if (cached) {
      return cached;
    }

    const dbPath = getDbPath(subIndexDir);

    // Ensure directory exists synchronously
    try {
      mkdirSync(dirname(dbPath), { recursive: true });
    } catch {
      // Directory might already exist
    }

    const db = new Database(dbPath);

    // Configure WAL mode
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('wal_autocheckpoint = 1000');

    // Create table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_timestamp ON records(timestamp);
    `);

    // Initialize next ID cache
    const lastIdRow = db.prepare('SELECT MAX(id) as maxId FROM records').get() as
      | { maxId: number | null }
      | undefined;
    const nextId = lastIdRow?.maxId !== null && lastIdRow?.maxId !== undefined ? lastIdRow.maxId + 1 : 1;
    nextIdCache.set(subIndexDir, nextId);

    dbCache.set(subIndexDir, db);
    return db;
  };

  const getNextId = (subIndexDir: string): number => {
    const normalizedDir = normalizeIndexDir(subIndexDir);
    
    // Ensure DB is initialized (this will initialize the cache too)
    getOrCreateDb(normalizedDir);
    
    const currentId = nextIdCache.get(normalizedDir);
    if (currentId === undefined) {
      throw new Error(`Next ID not initialized for ${normalizedDir}`);
    }
    
    nextIdCache.set(normalizedDir, currentId + 1);
    return currentId;
  };

  const closeAllDatabases = (): void => {
    for (const db of dbCache.values()) {
      db.close();
    }
    dbCache.clear();
    nextIdCache.clear();
  };

  return {
    getNextId,

    async appendRecord(params: WriteRecordParams<T>): Promise<void> {
      const { record, subIndexDir: rawSubIndexDir } = params;
      const subIndexDir = normalizeIndexDir(rawSubIndexDir);

      const db = getOrCreateDb(subIndexDir);
      const insert = db.prepare('INSERT INTO records (id, timestamp, data) VALUES (?, ?, ?)');
      insert.run(record.id, record.timestamp, JSON.stringify(record));
    },

    async readFullPage(params: ReadFullPageParams): Promise<StorageRecord<T>[]> {
      const { subIndexDir: rawSubIndexDir } = params;
      const subIndexDir = normalizeIndexDir(rawSubIndexDir);

      const db = getOrCreateDb(subIndexDir);
      const rows = db.prepare('SELECT data FROM records ORDER BY id').all() as { data: string }[];

      return rows.map((row) => JSON.parse(row.data) as StorageRecord<T>);
    },

    async readRecordsRange(params: ReadIndexRangeParams): Promise<StorageRecord<T>[]> {
      const { subIndexDir: rawSubIndexDir, fromIndex, count } = params;
      const subIndexDir = normalizeIndexDir(rawSubIndexDir);

      const db = getOrCreateDb(subIndexDir);

      let query = 'SELECT id, data FROM records WHERE id >= ? ORDER BY id';
      const queryParams: number[] = [fromIndex + 1]; // SQLite IDs are 1-based, but we use 0-based indexing

      if (count !== undefined) {
        query += ' LIMIT ?';
        queryParams.push(count);
      }

      const rows = db.prepare(query).all(...queryParams) as { id: number; data: string }[];

      return rows.map((row) => ({
        ...JSON.parse(row.data),
        index: row.id - 1, // Convert back to 0-based indexing
      })) as StorageRecord<T>[];
    },

    async readLastRecord(rawSubIndexDir: string): Promise<StorageRecord<T> | null> {
      const subIndexDir = normalizeIndexDir(rawSubIndexDir);

      const db = getOrCreateDb(subIndexDir);
      const row = db.prepare('SELECT data FROM records ORDER BY id DESC LIMIT 1').get() as
        | { data: string }
        | undefined;

      if (!row) {
        return null;
      }

      return JSON.parse(row.data) as StorageRecord<T>;
    },

    async replaceLastRecord(params: ReplaceLastRecordParams<T>): Promise<void> {
      const { record, subIndexDir: rawSubIndexDir } = params;
      const subIndexDir = normalizeIndexDir(rawSubIndexDir);

      const db = getOrCreateDb(subIndexDir);

      // Get the last record ID
      const lastRow = db.prepare('SELECT id FROM records ORDER BY id DESC LIMIT 1').get() as
        | { id: number }
        | undefined;

      if (!lastRow) {
        throw new Error('Cannot replace last record: no records exist');
      }

      // Update the last record
      db.prepare('UPDATE records SET timestamp = ?, data = ? WHERE id = ?').run(
        record.timestamp,
        JSON.stringify(record),
        lastRow.id,
      );
    },

    close(): void {
      closeAllDatabases();
    },
  };
}

export type PersistentStorage<T extends Record<string, unknown>> = ReturnType<
  typeof createPersistentStorage<T>
>;

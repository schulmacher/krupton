/**
 * Persistent Storage Index System
 * 
 * This module manages binary index files (.idx) that track line positions in JSONL data files.
 * 
 * ## File Naming (0-based indexing)
 * Data files are named after their starting global line index:
 * - `00000000000000000000000000000000.jsonl` - starts at global index 0 (first file)
 * - `00000000000000000000000000082571.jsonl` - starts at global index 82571
 * - `00000000000000000000000000184225.jsonl` - starts at global index 184225
 * 
 * ## Index Calculation
 * - File with 10 lines starting at 0: contains indices 0-9, next file starts at 10
 * - File with 5 lines starting at 10: contains indices 10-14, next file starts at 15
 * 
 * Formula: `nextFileName = currentFileName + lineCount`
 */
import { open, truncate, writeFile } from 'node:fs/promises';
import { ensureDirForFile } from './lib/fs.js';

export type TimeSource = 'created' | 'extracted';

/**
 * Index header stored at the beginning of each .idx file.
 * 
 * @property globalLineOffset - The global line index where this file starts (0-based).
 *                               This value matches the filename (e.g., file "00...00082571.jsonl" has globalLineOffset = 82571).
 */
export type IndexHeader = {
  version: number;
  fileNumber: number;
  globalLineOffset: bigint;
};

/**
 * Index entry for a single line in a data file.
 * 
 * All line numbers are 0-based:
 * - First line in file: lineNumberLocal = 0, lineNumberGlobal = globalLineOffset + 0
 * - Second line: lineNumberLocal = 1, lineNumberGlobal = globalLineOffset + 1
 * - Nth line: lineNumberLocal = N-1, lineNumberGlobal = globalLineOffset + (N-1)
 * 
 * @property lineNumberLocal - 0-based line index within the file (0, 1, 2, ...)
 * @property lineNumberGlobal - 0-based global line index across all files (calculated as globalLineOffset + lineNumberLocal)
 */
export type IndexEntry = {
  fileNumber: number;
  lineNumberLocal: number;
  lineNumberGlobal: bigint;
  startByte: bigint;
  endByte: bigint;
  messageTime: bigint;
  timeSource: TimeSource;
};

type CreateIndexHeaderParams = {
  indexPath: string;
  fileNumber: number;
  globalLineOffset: bigint;
};

type AppendIndexEntryParams = {
  indexPath: string;
  entry: IndexEntry;
};

type ReplaceLastIndexEntryParams = {
  indexPath: string;
  newEntry: IndexEntry;
};

type ReadIndexHeaderParams = {
  indexPath: string;
};

type ReadIndexEntriesParams = {
  indexPath: string;
  fromIndex?: number;
  count?: number;
};

type ReadIndexParams = {
  indexPath: string;
};

type GetIndexEntryParams = {
  indexPath: string;
  entryIndex: number;
};

export type IndexData = {
  header: IndexHeader;
  entries: IndexEntry[];
};

const RECORD_SIZE = 64;
const HEADER_SIZE = 64;
const INDEX_VERSION = 1;

function getIndexPath(dataFilePath: string): string {
  return `${dataFilePath}.idx`;
}

function serializeHeader(header: IndexHeader): Buffer {
  const buffer = Buffer.allocUnsafe(HEADER_SIZE);
  buffer.fill(0);

  buffer.writeUInt8(header.version, 0);
  buffer.writeUInt32LE(header.fileNumber, 1);
  buffer.writeBigUInt64LE(header.globalLineOffset, 5);

  return buffer;
}

function deserializeHeader(buffer: Buffer): IndexHeader {
  return {
    version: buffer.readUInt8(0),
    fileNumber: buffer.readUInt32LE(1),
    globalLineOffset: buffer.readBigUInt64LE(5),
  };
}

function serializeEntry(entry: IndexEntry): Buffer {
  const buffer = Buffer.allocUnsafe(RECORD_SIZE);
  buffer.fill(0);

  buffer.writeUInt32LE(entry.fileNumber, 0);
  buffer.writeUInt32LE(entry.lineNumberLocal, 4);
  buffer.writeBigUInt64LE(entry.lineNumberGlobal, 8);
  buffer.writeBigUInt64LE(entry.startByte, 16);
  buffer.writeBigUInt64LE(entry.endByte, 24);
  buffer.writeBigUInt64LE(entry.messageTime, 32);
  buffer.writeUInt8(entry.timeSource === 'created' ? 0 : 1, 40);

  return buffer;
}

function deserializeEntry(buffer: Buffer): IndexEntry {
  return {
    fileNumber: buffer.readUInt32LE(0),
    lineNumberLocal: buffer.readUInt32LE(4),
    lineNumberGlobal: buffer.readBigUInt64LE(8),
    startByte: buffer.readBigUInt64LE(16),
    endByte: buffer.readBigUInt64LE(24),
    messageTime: buffer.readBigUInt64LE(32),
    timeSource: buffer.readUInt8(40) === 0 ? 'created' : 'extracted',
  };
}

export async function createIndexHeader(params: CreateIndexHeaderParams): Promise<void> {
  const { indexPath, fileNumber, globalLineOffset } = params;
  const idxFilePath = getIndexPath(indexPath);

  await ensureDirForFile(idxFilePath);

  const header: IndexHeader = {
    version: INDEX_VERSION,
    fileNumber,
    globalLineOffset,
  };

  const headerBuffer = serializeHeader(header);
  await writeFile(idxFilePath, headerBuffer);
}

export async function appendIndexEntry(params: AppendIndexEntryParams): Promise<void> {
  const { indexPath, entry } = params;
  const idxFilePath = getIndexPath(indexPath);
  const entryBuffer = serializeEntry(entry);

  const fileHandle = await open(idxFilePath, 'a');
  try {
    await fileHandle.write(entryBuffer);
  } finally {
    await fileHandle.close();
  }
}

export async function replaceLastIndexEntry(params: ReplaceLastIndexEntryParams): Promise<void> {
  const { indexPath, newEntry } = params;
  const idxFilePath = getIndexPath(indexPath);

  const entryCount = await getIndexEntryCount({ indexPath });

  if (entryCount === 0) {
    throw new Error('Cannot replace last index entry in empty index');
  }

  const truncatePosition = HEADER_SIZE + (entryCount - 1) * RECORD_SIZE;
  await truncate(idxFilePath, truncatePosition);

  const entryBuffer = serializeEntry(newEntry);

  const fileHandle = await open(idxFilePath, 'a');
  try {
    await fileHandle.write(entryBuffer);
  } finally {
    await fileHandle.close();
  }
}

export async function readIndexHeader(params: ReadIndexHeaderParams): Promise<IndexHeader | null> {
  const { indexPath } = params;
  const idxFilePath = getIndexPath(indexPath);

  try {
    const fileHandle = await open(idxFilePath, 'r');
    try {
      const buffer = Buffer.allocUnsafe(HEADER_SIZE);
      const readResult = await fileHandle.read(buffer, 0, HEADER_SIZE, 0);

      if (readResult.bytesRead !== HEADER_SIZE) {
        return null;
      }

      return deserializeHeader(buffer);
    } finally {
      await fileHandle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function readIndexEntries(params: ReadIndexEntriesParams): Promise<IndexEntry[]> {
  const { indexPath, fromIndex = 0, count } = params;
  const idxFilePath = getIndexPath(indexPath);

  try {
    const fileHandle = await open(idxFilePath, 'r');
    try {
      const stats = await fileHandle.stat();
      const fileSize = stats.size;

      if (fileSize <= HEADER_SIZE) {
        return [];
      }

      const totalEntries = Math.floor((fileSize - HEADER_SIZE) / RECORD_SIZE);
      const startIndex = Math.max(0, fromIndex);
      const endIndex = count !== undefined ? Math.min(startIndex + count, totalEntries) : totalEntries;
      const entriesToRead = endIndex - startIndex;

      if (entriesToRead <= 0) {
        return [];
      }

      const startPosition = HEADER_SIZE + startIndex * RECORD_SIZE;
      const bufferSize = entriesToRead * RECORD_SIZE;
      const buffer = Buffer.allocUnsafe(bufferSize);

      const readResult = await fileHandle.read(buffer, 0, bufferSize, startPosition);

      if (readResult.bytesRead === 0) {
        return [];
      }

      const entries: IndexEntry[] = [];
      const entriesRead = Math.floor(readResult.bytesRead / RECORD_SIZE);

      for (let i = 0; i < entriesRead; i++) {
        const entryBuffer = buffer.subarray(i * RECORD_SIZE, (i + 1) * RECORD_SIZE);
        entries.push(deserializeEntry(entryBuffer));
      }

      return entries;
    } finally {
      await fileHandle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function readIndex(params: ReadIndexParams): Promise<IndexData | null> {
  const { indexPath } = params;

  const header = await readIndexHeader({ indexPath });
  if (!header) {
    return null;
  }

  const entries = await readIndexEntries({ indexPath });

  return {
    header,
    entries,
  };
}

export async function getIndexEntry(params: GetIndexEntryParams): Promise<IndexEntry | null> {
  const { indexPath, entryIndex } = params;
  const idxFilePath = getIndexPath(indexPath);

  try {
    const fileHandle = await open(idxFilePath, 'r');
    try {
      const position = HEADER_SIZE + entryIndex * RECORD_SIZE;
      const buffer = Buffer.allocUnsafe(RECORD_SIZE);

      const readResult = await fileHandle.read(buffer, 0, RECORD_SIZE, position);

      if (readResult.bytesRead !== RECORD_SIZE) {
        return null;
      }

      return deserializeEntry(buffer);
    } finally {
      await fileHandle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function getLastIndexEntry(
  params: ReadIndexEntriesParams,
): Promise<IndexEntry | null> {
  const { indexPath } = params;
  const idxFilePath = getIndexPath(indexPath);

  try {
    const fileHandle = await open(idxFilePath, 'r');
    try {
      const stats = await fileHandle.stat();
      const fileSize = stats.size;

      if (fileSize <= HEADER_SIZE) {
        return null;
      }

      const totalEntries = Math.floor((fileSize - HEADER_SIZE) / RECORD_SIZE);
      if (totalEntries === 0) {
        return null;
      }

      const lastEntryPosition = HEADER_SIZE + (totalEntries - 1) * RECORD_SIZE;
      const buffer = Buffer.allocUnsafe(RECORD_SIZE);

      const readResult = await fileHandle.read(buffer, 0, RECORD_SIZE, lastEntryPosition);

      if (readResult.bytesRead !== RECORD_SIZE) {
        return null;
      }

      return deserializeEntry(buffer);
    } finally {
      await fileHandle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function getIndexEntryCount(params: ReadIndexHeaderParams): Promise<number> {
  const { indexPath } = params;
  const idxFilePath = getIndexPath(indexPath);

  try {
    const fileHandle = await open(idxFilePath, 'r');
    try {
      const stats = await fileHandle.stat();
      const fileSize = stats.size;

      if (fileSize <= HEADER_SIZE) {
        return 0;
      }

      return Math.floor((fileSize - HEADER_SIZE) / RECORD_SIZE);
    } finally {
      await fileHandle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}
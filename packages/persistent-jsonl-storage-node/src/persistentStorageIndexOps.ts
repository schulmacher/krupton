import { appendFile, open, readdir, rm, truncate } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  appendIndexEntry,
  createIndexHeader,
  getLastIndexEntry,
  readIndexEntries,
  replaceLastIndexEntry,
  TimeSource,
  type IndexEntry
} from './persistentStorageIndex.js';

export type StorageRecordForReindex = {
  timestamp: number;
};

export type RecordBytePosition = {
  startByte: bigint;
  endByte: bigint;
};

type SerializedRecords<T> = {
  positions: RecordBytePosition[];
  content: string;
  records: T[];
};

export function serializeRecords<T>(records: T[]): SerializedRecords<T> {
  const positions: RecordBytePosition[] = [];
  let currentByte = 0n;

  const jsonLines: string[] = [];

  for (const record of records) {
    const jsonLine = JSON.stringify(record) + '\n';
    const byteLength = BigInt(Buffer.byteLength(jsonLine, 'utf-8'));

    positions.push({
      startByte: currentByte,
      endByte: currentByte + byteLength,
    });

    jsonLines.push(jsonLine);
    currentByte += byteLength;
  }

  return {
    positions,
    content: jsonLines.join(''),
    records,
  };
}

export async function addRowIndexes<T extends StorageRecordForReindex>(
  filePath: string,
  rowBytePositions: RecordBytePosition[],
  rows: T[],
  getMessageTime?: (row: T) => number,
): Promise<IndexEntry[]> {
  if (rowBytePositions.length !== rows.length) {
    throw new Error('rowBytePositions and rows must have the same length');
  }

  if (rows.length === 0) {
    return [];
  }

  const fileName = filePath.split('/').pop()?.replace(/\.jsonl$/, '') ?? '0';
  const globalLineOffset = BigInt(fileName);

  const lastEntry = await getLastIndexEntry({ indexPath: filePath });
  const result: IndexEntry[] = [];

  let baseByteOffset: bigint;
  let baseLineNumberLocal: number;
  let fileNumber: number;

  if (!lastEntry) {
    const directory = dirname(filePath);
    const files = await readdir(directory);
    const jsonlFilesCount = files.filter((file) => file.endsWith('.jsonl')).length;

    fileNumber = jsonlFilesCount;
    baseByteOffset = 0n;
    baseLineNumberLocal = 0;

    await createIndexHeader({
      indexPath: filePath,
      fileNumber,
      globalLineOffset,
    });
  } else {
    fileNumber = lastEntry.fileNumber;
    baseByteOffset = lastEntry.endByte;
    baseLineNumberLocal = lastEntry.lineNumberLocal + 1;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const position = rowBytePositions[i]!;

    let messageTime: number;
    let timeSource: TimeSource;

    if (getMessageTime) {
      messageTime = getMessageTime(row);
      timeSource = 'extracted';
    } else {
      messageTime = row.timestamp;
      timeSource = 'created';
    }

    const lineNumberLocal = baseLineNumberLocal + i;
    const lineNumberGlobal = globalLineOffset + BigInt(lineNumberLocal);

    const entry: IndexEntry = {
      fileNumber,
      lineNumberLocal,
      lineNumberGlobal,
      startByte: baseByteOffset + position.startByte,
      endByte: baseByteOffset + position.endByte,
      messageTime: BigInt(messageTime),
      timeSource,
    };

    await appendIndexEntry({ indexPath: filePath, entry });
    result.push(entry);
  }

  return result;
}

export async function replaceLastRowIndex<T extends StorageRecordForReindex>(
  filePath: string,
  newBytePosition: RecordBytePosition,
  newRow: T,
  getMessageTime?: (row: T) => number,
): Promise<void> {
  const lastEntry = await getLastIndexEntry({ indexPath: filePath });

  if (!lastEntry) {
    throw new Error('Cannot replace last index entry in empty index');
  }

  const lineNumberLocal = lastEntry.lineNumberLocal;
  const fromIndex = Math.max(0, lineNumberLocal - 2);
  const count = lineNumberLocal > 1 ? 2 : 1;

  const entries = await readIndexEntries({
    indexPath: filePath,
    fromIndex,
    count,
  });

  let messageTime: number;
  let timeSource: TimeSource;

  if (getMessageTime) {
    messageTime = getMessageTime(newRow);
    timeSource = 'extracted';
  } else {
    messageTime = newRow.timestamp;
    timeSource = 'created';
  }

  const baseByteOffset = entries.length > 1 ? entries[0]!.endByte : 0n;

  const newEntry: IndexEntry = {
    fileNumber: lastEntry.fileNumber,
    lineNumberLocal: lastEntry.lineNumberLocal,
    lineNumberGlobal: lastEntry.lineNumberGlobal,
    startByte: baseByteOffset + newBytePosition.startByte,
    endByte: baseByteOffset + newBytePosition.endByte,
    messageTime: BigInt(messageTime),
    timeSource,
  };

  await replaceLastIndexEntry({ indexPath: filePath, newEntry });
}

async function reindexFile<T extends StorageRecordForReindex>(
  filePath: string,
  fileNumber: number,
  globalLineOffset: bigint,
  getMessageTime?: (record: T) => number,
): Promise<bigint> {
  const indexPath = filePath;

  const idxFilePath = `${filePath}.idx`;
  try {
    await rm(idxFilePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  await createIndexHeader({
    indexPath,
    fileNumber,
    globalLineOffset,
  });

  const fileHandle = await open(filePath, 'r');
  try {
    const stats = await fileHandle.stat();
    const fileSize = stats.size;

    if (fileSize === 0) {
      return globalLineOffset;
    }

    let lineNumberLocal = -1;
    let bytePosition = 0;
    const chunkSize = 256 * 1024;
    const buffer = Buffer.allocUnsafe(chunkSize);
    let leftoverBytes = Buffer.alloc(0);

    while (bytePosition < fileSize) {
      const bytesToRead = Math.min(chunkSize, fileSize - bytePosition);
      const readResult = await fileHandle.read(buffer, 0, bytesToRead, bytePosition);

      if (readResult.bytesRead === 0) {
        break;
      }

      const currentChunk = Buffer.concat([leftoverBytes, buffer.subarray(0, readResult.bytesRead)]);

      let searchStart = 0;
      let newlineIndex: number;

      while ((newlineIndex = currentChunk.indexOf(0x0a, searchStart)) !== -1) {
        const lineBuffer = currentChunk.subarray(searchStart, newlineIndex);

        if (lineBuffer.length > 0) {
          lineNumberLocal++;

          const startByte = BigInt(bytePosition - leftoverBytes.length + searchStart);
          const endByte = BigInt(bytePosition - leftoverBytes.length + newlineIndex + 1);

          const lineText = lineBuffer.toString('utf-8');
          const parsed = JSON.parse(lineText) as T;

          let messageTime: number;
          let timeSource: TimeSource;

          if (getMessageTime) {
            messageTime = getMessageTime(parsed);
            timeSource = 'extracted';
          } else {
            messageTime = parsed.timestamp;
            timeSource = 'created';
          }

          const entry: IndexEntry = {
            fileNumber,
            lineNumberLocal,
            lineNumberGlobal: globalLineOffset + BigInt(lineNumberLocal),
            startByte,
            endByte,
            messageTime: BigInt(messageTime),
            timeSource,
          };

          await appendIndexEntry({ indexPath, entry });
        }

        searchStart = newlineIndex + 1;
      }

      leftoverBytes = currentChunk.subarray(searchStart);
      bytePosition += readResult.bytesRead;
    }

    if (leftoverBytes.length > 0) {
      const lineText = leftoverBytes.toString('utf-8').trim();

      if (lineText.length > 0) {
        lineNumberLocal++;

        const startByte = BigInt(fileSize - leftoverBytes.length);
        const endByte = BigInt(fileSize);

        const parsed = JSON.parse(lineText) as T;

        let messageTime: number;
        let timeSource: TimeSource;

        if (getMessageTime) {
          messageTime = getMessageTime(parsed);
          timeSource = 'extracted';
        } else {
          messageTime = parsed.timestamp;
          timeSource = 'created';
        }

        const entry: IndexEntry = {
          fileNumber,
          lineNumberLocal,
          lineNumberGlobal: globalLineOffset + BigInt(lineNumberLocal),
          startByte,
          endByte,
          messageTime: BigInt(messageTime),
          timeSource,
        };

        await appendIndexEntry({ indexPath, entry });
      }
    }

    return globalLineOffset + BigInt(lineNumberLocal) + 1n;
  } finally {
    await fileHandle.close();
  }
}

export async function reindexAllFiles<T extends StorageRecordForReindex>(
  listAllFiles: () => Promise<string[]>,
  getMessageTime?: (record: T) => number,
): Promise<void> {
  const jsonlFiles = await listAllFiles();

  for (let i = 0; i < jsonlFiles.length; i++) {
    const filePath = jsonlFiles[i]!;
    const fileNumber = i + 1;

    const fileName = filePath.split('/').pop()?.replace(/\.jsonl$/, '') ?? '0';
    const globalLineOffset = BigInt(fileName);

    await reindexFile<T>(filePath, fileNumber, globalLineOffset, getMessageTime);
  }
}

export async function readFromIndex<T = unknown>(filePath: string, entry: IndexEntry): Promise<T> {
  const fileHandle = await open(filePath, 'r');
  try {
    const byteLength = Number(entry.endByte - entry.startByte);
    const buffer = Buffer.alloc(byteLength);

    await fileHandle.read(buffer, 0, byteLength, Number(entry.startByte));

    const text = buffer.toString('utf-8');
    return JSON.parse(text) as T;
  } finally {
    await fileHandle.close();
  }
}

export async function readFromLastIndex<T = unknown>(filePath: string): Promise<T | null> {
  const lastEntry = await getLastIndexEntry({ indexPath: filePath });

  if (!lastEntry) {
    return null;
  }

  return readFromIndex<T>(filePath, lastEntry);
}

export async function replaceLastRowBasedOnIndex<T extends StorageRecordForReindex>(
  filePath: string,
  newRecord: T,
  getMessageTime?: (row: T) => number,
): Promise<void> {
  const lastEntry = await getLastIndexEntry({ indexPath: filePath });

  if (!lastEntry) {
    throw new Error('Cannot replace last record in empty file');
  }

  await truncate(filePath, Number(lastEntry.startByte));

  const serialized = serializeRecords([newRecord]);
  await appendFile(filePath, serialized.content, 'utf-8');

  await replaceLastRowIndex(filePath, serialized.positions[0]!, newRecord, getMessageTime);
}

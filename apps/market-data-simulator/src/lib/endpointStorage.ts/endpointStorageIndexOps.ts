import { StringDecoder } from 'node:string_decoder';
import { appendFile, open, rm, truncate } from 'node:fs/promises';
import {
  appendIndexEntry,
  createIndexHeader,
  getLastIndexEntry,
  readIndexEntries,
  readIndexHeader,
  TimeSource,
  type IndexEntry,
} from './endpointStorageIndex.js';

export type StorageRecordForReindex = {
  timestamp: number;
};

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
    let lineNumberLocal = 0;
    let currentPosition = 0n;
    const buffer = Buffer.alloc(64 * 1024);
    const decoder = new StringDecoder('utf-8');

    let leftover = '';

    while (true) {
      const readResult = await fileHandle.read(buffer, 0, buffer.length, Number(currentPosition));

      if (readResult.bytesRead === 0) {
        break;
      }

      const chunk = decoder.write(buffer.subarray(0, readResult.bytesRead));
      const text = leftover + chunk;
      const lines = text.split('\n');

      leftover = lines.pop() || '';

      for (const line of lines) {
        if (line.length === 0) {
          currentPosition += BigInt(Buffer.byteLength('\n', 'utf-8'));
          continue;
        }

        lineNumberLocal++;

        const startByte = currentPosition;
        const lineBytes = BigInt(Buffer.byteLength(line + '\n', 'utf-8'));
        const endByte = currentPosition + lineBytes;

        let messageTime: number;
        let timeSource: TimeSource = 'created';

        const parsed = JSON.parse(line) as T;
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

        currentPosition = endByte;
      }
    }

    const remaining = decoder.end();
    if (remaining) {
      leftover += remaining;
    }

    if (leftover.trim().length > 0) {
      lineNumberLocal++;
      const startByte = currentPosition;
      const lineBytes = BigInt(Buffer.byteLength(leftover, 'utf-8'));
      const endByte = currentPosition + lineBytes;

      let messageTime: number;
      let timeSource: TimeSource = 'created';

      const parsed = JSON.parse(leftover) as T;
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

    return globalLineOffset + BigInt(lineNumberLocal);
  } finally {
    await fileHandle.close();
  }
}

export async function reindexAllFiles<T extends StorageRecordForReindex>(
  listAllFiles: () => Promise<string[]>,
  getMessageTime?: (record: T) => number,
): Promise<void> {
  const jsonlFiles = await listAllFiles();

  let globalLineOffset = 0n;

  for (let i = 0; i < jsonlFiles.length; i++) {
    const filePath = jsonlFiles[i]!;
    const fileNumber = i + 1;

    globalLineOffset = await reindexFile<T>(filePath, fileNumber, globalLineOffset, getMessageTime);
  }
}

export async function readFromIndex<T = unknown>(
  filePath: string,
  entry: IndexEntry,
): Promise<T> {
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

export async function replaceLastInIndex<T = unknown>(
  filePath: string,
  newRecord: T,
): Promise<void> {
  const lastEntry = await getLastIndexEntry({ indexPath: filePath });

  if (!lastEntry) {
    throw new Error('Cannot replace last record in empty file');
  }

  await truncate(filePath, Number(lastEntry.startByte));

  const jsonLine = JSON.stringify(newRecord) + '\n';
  await appendFile(filePath, jsonLine, 'utf-8');
}

type FileLineRange = {
  filePath: string;
  startLineGlobal: bigint;
  endLineGlobal: bigint;
};

export async function readFromLineRange<T = unknown>(
  listAllFiles: () => Promise<string[]>,
  startLineNumber: bigint,
  endLineNumber: bigint,
): Promise<T[]> {
  const files = await listAllFiles();

  const fileRanges: FileLineRange[] = [];

  for (const filePath of files) {
    const header = await readIndexHeader({ indexPath: filePath });

    if (!header) {
      continue;
    }

    const entries = await readIndexEntries({ indexPath: filePath });

    if (entries.length === 0) {
      continue;
    }

    const firstLine = header.globalLineOffset + 1n;
    const lastLine = entries[entries.length - 1]!.lineNumberGlobal;

    if (lastLine < startLineNumber || firstLine > endLineNumber) {
      continue;
    }

    fileRanges.push({
      filePath,
      startLineGlobal: firstLine,
      endLineGlobal: lastLine,
    });
  }

  const results: T[] = [];

  for (const fileRange of fileRanges) {
    const entries = await readIndexEntries({ indexPath: fileRange.filePath });

    for (const entry of entries) {
      if (entry.lineNumberGlobal >= startLineNumber && entry.lineNumberGlobal <= endLineNumber) {
        const data = await readFromIndex<T>(fileRange.filePath, entry);
        results.push(data);
      }
    }
  }

  return results;
}

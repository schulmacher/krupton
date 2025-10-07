import type { EndpointDefinition, ExtractEndpointParams } from '@krupton/api-client-node';
import type { TB } from '@krupton/service-framework-node/typebox';
import { appendFile, open, readdir, readFile, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureDirForFile } from '../fs';

export type StorageRecord<TResponse, TRequest> = {
  timestamp: number;
  request: TRequest;
  response: TResponse;
};

type FileInfo = {
  idx: string;
  recordCount: number;
};

type WriteRecordParams<TResponse, TRequest> = {
  record: StorageRecord<TResponse, TRequest>;
  relativePath: string;
};

type ReadRecordsParams = {
  relativePath: string;
};

type GetFileInfoParams = {
  relativePath: string;
};

function normalizeEndpointPath(endpoint: string): string {
  return endpoint.replace(/^\/+/, '').replace(/\//g, '_');
}

export function createEndpointStorage<T extends EndpointDefinition>(baseDir: string, endpoint: T) {
  type ResponseType = TB.Static<T['responseSchema']>;
  type RequestType = ExtractEndpointParams<T>;

  const endpointPath = endpoint.path;
  const normalizedEndpoint = normalizeEndpointPath(endpointPath);
  const baseDirWithEndpoint = join(baseDir, normalizedEndpoint);

  const getFilePath = (relativePath: string): string => {
    return join(baseDirWithEndpoint, `${relativePath}.jsonl`);
  };

  const readLastLine = async (
    filePath: string,
  ): Promise<{ line: string; bytesStart: number } | null> => {
    const fileHandle = await open(filePath, 'r');
    try {
      const stats = await fileHandle.stat();
      const fileSize = stats.size;

      if (fileSize === 0) {
        return null;
      }

      const chunkSize = 128;
      let position = fileSize;
      let buffer = Buffer.alloc(chunkSize);
      let accumulated = '';
      let newlineCount = 0;
      let lastNewlinePosition: number | null = null;

      while (position > 0 && newlineCount < 2) {
        const readSize = Math.min(chunkSize, position);
        const readPosition = position - readSize;

        const readResult = await fileHandle.read(buffer, 0, readSize, readPosition);
        const chunk = buffer.subarray(0, readResult.bytesRead).toString('utf-8');

        accumulated = chunk + accumulated;

        for (let i = chunk.length - 1; i >= 0; i--) {
          if (chunk[i] === '\n') {
            newlineCount++;
            if (newlineCount === 2) {
              lastNewlinePosition = readPosition + i;
              break;
            }
          }
        }

        position = readPosition;
      }

      const lines = accumulated.split('\n').filter((line) => line.length > 0);

      if (lines.length === 0) {
        return null;
      }

      const lastLine = lines[lines.length - 1]!;
      const bytesStart = lastNewlinePosition !== null ? lastNewlinePosition + 1 : 0;

      return { line: lastLine, bytesStart };
    } finally {
      await fileHandle.close();
    }
  };

  return {
    endpointPath,
    normalizedEndpoint,

    async writeRecord(params: WriteRecordParams<ResponseType, RequestType>): Promise<void> {
      const { record, relativePath } = params;
      const filePath = getFilePath(relativePath);

      await ensureDirForFile(filePath);

      const jsonLine = JSON.stringify(record) + '\n';
      await writeFile(filePath, jsonLine, 'utf-8');
    },

    async appendRecord(params: WriteRecordParams<ResponseType, RequestType>): Promise<void> {
      const { record, relativePath } = params;
      const filePath = getFilePath(relativePath);

      await ensureDirForFile(filePath);

      const jsonLine = JSON.stringify(record) + '\n';
      await appendFile(filePath, jsonLine, 'utf-8');
    },

    async readRecords(
      params: ReadRecordsParams,
    ): Promise<StorageRecord<ResponseType, RequestType>[]> {
      const { relativePath } = params;
      const filePath = getFilePath(relativePath);

      try {
        const fileContent = await readFile(filePath, 'utf-8');
        const lines = fileContent
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);

        return lines.map((line) => JSON.parse(line) as StorageRecord<ResponseType, RequestType>);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    },

    async readLastRecord(
      params: ReadRecordsParams,
    ): Promise<StorageRecord<ResponseType, RequestType> | null> {
      const { relativePath } = params;
      const filePath = getFilePath(relativePath);

      try {
        const result = await readLastLine(filePath);
        if (!result) {
          return null;
        }
        return JSON.parse(result.line) as StorageRecord<ResponseType, RequestType>;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    },

    async replaceLastRecord(params: WriteRecordParams<ResponseType, RequestType>): Promise<void> {
      const { record, relativePath } = params;
      const filePath = getFilePath(relativePath);

      try {
        const result = await readLastLine(filePath);
        if (!result) {
          throw new Error('Cannot replace last record in empty file');
        }

        await truncate(filePath, result.bytesStart);

        const jsonLine = JSON.stringify(record) + '\n';
        await appendFile(filePath, jsonLine, 'utf-8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error('Cannot replace last record in non-existent file');
        }
        throw error;
      }
    },

    async getFileInfo(params: GetFileInfoParams): Promise<FileInfo | null> {
      const { relativePath } = params;
      const filePath = getFilePath(relativePath);

      try {
        const fileContent = await readFile(filePath, 'utf-8');
        const lines = fileContent
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);

        return {
          idx: relativePath,
          recordCount: lines.length,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    },

    async listFileNames(indexPath: string): Promise<string[]> {
      try {
        const files = await readdir(join(baseDirWithEndpoint, indexPath));
        return files
          .filter((file) => file.endsWith('.jsonl'))
          .map((file) => file.replace(/\.jsonl$/, ''));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    },
  };
}

export type EndpointStorage<T extends EndpointDefinition> = ReturnType<
  typeof createEndpointStorage<T>
>;

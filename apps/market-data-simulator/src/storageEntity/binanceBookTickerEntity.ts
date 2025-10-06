import type { ExtractEndpointParams } from '@krupton/api-client-node';
import { BinanceApi } from '@krupton/api-interface';
import type { TB } from '@krupton/service-framework-node/typebox';
import type { EndpointEntity } from '../lib/endpointStorage.ts/endpointEntity.js';
import type { EndpointStorage, StorageRecord } from '../lib/endpointStorage.ts/endpointStorage.js';
import { createEndpointStorage } from '../lib/endpointStorage.ts/endpointStorage.js';

export type BinanceBookTickerStorage = EndpointStorage<typeof BinanceApi.GetBookTickerEndpoint>;
export type BinanceBookTickerEntity = ReturnType<typeof createBinanceBookTickerEntity>;

type BookTickerResponse = TB.Static<typeof BinanceApi.GetBookTickerEndpoint.responseSchema>;
type BookTickerRequest = ExtractEndpointParams<typeof BinanceApi.GetBookTickerEndpoint>;
type BookTickerRecord = StorageRecord<BookTickerResponse, BookTickerRequest>;

const formatDateForIndex = (timestamp: number): string => {
  return new Date(timestamp).toISOString().slice(0, 10);
};

const getFilePathWithIndex = (symbol: string, date: string, recordCount: number): string => {
  return `${symbol}/${calculateFileIndex(date, recordCount)}`;
};

const calculateFileIndex = (date: string, recordCount: number): string => {
  const fileNumber = Math.floor(recordCount / 100_000);
  return `${date}_${fileNumber}`;
};

const parseIndexParts = (fileName: string): { date: string; fileNumber: number } => {
  const dateParts = fileName.split('_');
  if (dateParts.length !== 2) {
    throw new Error(`Invalid file name ${fileName}`);
  }
  return { date: dateParts[0]!, fileNumber: parseInt(dateParts[1]!, 10) };
};

const areResponsesEqual = (
  response1: BookTickerResponse,
  response2: BookTickerResponse,
): boolean => {
  return JSON.stringify(response1) === JSON.stringify(response2);
};

const createBinanceBookTickerStorage = (baseDir: string): BinanceBookTickerStorage => {
  return createEndpointStorage(baseDir, BinanceApi.GetBookTickerEndpoint);
};

export const createBinanceBookTickerEntity = (baseDir: string) => {
  const storage = createBinanceBookTickerStorage(baseDir);

  return {
    storage,

    async write(params: {
      request: BookTickerRequest;
      response: BookTickerResponse;
    }): Promise<void> {
      const timestamp = Date.now();
      const currentDate = formatDateForIndex(timestamp);
      const symbol = params.request.query?.symbol;

      if (!symbol) {
        throw new Error('Symbol is required in request params');
      }

      const fileNames = await storage.listFileNames(symbol);
      const filesForCurrentDate = fileNames.filter((fileName) => {
        const parsed = parseIndexParts(fileName);
        return parsed?.date === currentDate;
      });

      let recordCount = 0;
      let latestFileRelativePath: string | null = null;

      if (filesForCurrentDate.length > 0) {
        const latestFileForDate = filesForCurrentDate[filesForCurrentDate.length - 1]!;
        latestFileRelativePath = `${symbol}/${latestFileForDate}`;
        const fileInfo = await storage.getFileInfo({ relativePath: latestFileRelativePath });
        if (fileInfo) {
          const parsed = parseIndexParts(latestFileForDate);
          if (parsed) {
            recordCount = parsed.fileNumber * 100_000 + fileInfo.recordCount;
          }
        }
      }

      const relativePath = getFilePathWithIndex(symbol, currentDate, recordCount);

      if (latestFileRelativePath === relativePath) {
        const existingLastRecord = await storage.readLastRecord({ relativePath });

        if (existingLastRecord) {
          if (areResponsesEqual(existingLastRecord.response, params.response)) {
            await storage.replaceLastRecord({
              relativePath,
              record: {
                timestamp,
                request: params.request,
                response: params.response,
              },
            });

            return;
          }
        }
      }

      await storage.appendRecord({
        record: {
          timestamp,
          request: params.request,
          response: params.response,
        },
        relativePath,
      });
    },

    async readLatestRecord(symbol: string): Promise<BookTickerRecord | null> {
      const fileNames = await storage.listFileNames(symbol);

      const sortedFiles = fileNames.sort((a, b) => {
        const parsedA = parseIndexParts(a);
        const parsedB = parseIndexParts(b);
        if (!parsedA || !parsedB) return 0;

        if (parsedA.date !== parsedB.date) {
          return parsedA.date.localeCompare(parsedB.date);
        }
        return parsedA.fileNumber - parsedB.fileNumber;
      });

      const latestFileName = sortedFiles[sortedFiles.length - 1]!;
      const records = await storage.readRecords({ relativePath: `${symbol}/${latestFileName}` });

      if (records.length === 0) {
        return null;
      }

      return records[records.length - 1]!;
    },
  } satisfies EndpointEntity<typeof BinanceApi.GetBookTickerEndpoint>;
};

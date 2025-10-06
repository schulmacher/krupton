import { createHash } from 'node:crypto';
import type { ExtractEndpointParams } from '@krupton/api-client-node';
import { BinanceApi } from '@krupton/api-interface';
import type { TB } from '@krupton/service-framework-node/typebox';
import type { EndpointEntity } from '../lib/endpointStorage.ts/endpointEntity.js';
import type { EndpointStorage, StorageRecord } from '../lib/endpointStorage.ts/endpointStorage.js';
import { createEndpointStorage } from '../lib/endpointStorage.ts/endpointStorage.js';

export type BinanceExchangeInfoStorage = EndpointStorage<typeof BinanceApi.GetExchangeInfoEndpoint>;
export type BinanceExchangeInfoEntity = ReturnType<typeof createBinanceExchangeInfoEntity>;

type ExchangeInfoResponse = TB.Static<typeof BinanceApi.GetExchangeInfoEndpoint.responseSchema>;
type ExchangeInfoRequest = ExtractEndpointParams<typeof BinanceApi.GetExchangeInfoEndpoint>;
type ExchangeInfoRecord = StorageRecord<ExchangeInfoResponse, ExchangeInfoRequest>;

const SYMBOL_ALL = 'ALL';

const hashSymbols = (symbols: string[]): string => {
  const sortedSymbols = [...symbols].sort();
  const symbolsString = sortedSymbols.join(',');
  return createHash('sha256').update(symbolsString).digest('hex').slice(0, 12);
};

const extractSymbolsFromResponse = (response: ExchangeInfoResponse): string[] => {
  return response.symbols
    .filter((s) => s.status === 'TRADING')
    .map((s) => s.symbol)
    .sort();
};

const formatIndex = (index: number): string => {
  return index.toString().padStart(5, '0');
};

const parseIndexParts = (fileName: string): { hash: string; fileNumber: number } | null => {
  const parts = fileName.split('_');
  if (parts.length !== 2) {
    return null;
  }
  const fileNumber = parseInt(parts[0]!, 10);
  if (isNaN(fileNumber)) {
    return null;
  }
  return { hash: parts[1]!, fileNumber };
};

const createBinanceExchangeInfoStorage = (baseDir: string): BinanceExchangeInfoStorage => {
  return createEndpointStorage(baseDir, BinanceApi.GetExchangeInfoEndpoint);
};

export const createBinanceExchangeInfoEntity = (baseDir: string) => {
  const storage = createBinanceExchangeInfoStorage(baseDir);

  return {
    storage,

    async write(params: { request: ExchangeInfoRequest; response: ExchangeInfoResponse }): Promise<void> {
      const timestamp = Date.now();
      const symbols = extractSymbolsFromResponse(params.response);
      const currentHash = hashSymbols(symbols);

      const fileNames = await storage.listFileNames(SYMBOL_ALL);
      const latestFileName = fileNames.length > 0 ? fileNames[fileNames.length - 1] : null;

      let targetIndex: string;

      if (latestFileName) {
        const latestRecords = await storage.readRecords({ relativePath: `${SYMBOL_ALL}/${latestFileName}` });
        
        if (latestRecords.length > 0) {
          const latestRecord = latestRecords[latestRecords.length - 1]!;
          const latestSymbols = extractSymbolsFromResponse(latestRecord.response);
          const latestHash = hashSymbols(latestSymbols);

          if (currentHash === latestHash) {
            targetIndex = latestFileName;
          } else {
            const parsed = parseIndexParts(latestFileName);
            if (parsed) {
              targetIndex = `${formatIndex(parsed.fileNumber + 1)}_${currentHash}`;
            } else {
              targetIndex = `${formatIndex(0)}_${currentHash}`;
            }
          }
        } else {
          targetIndex = `${formatIndex(0)}_${currentHash}`;
        }
      } else {
        targetIndex = `${formatIndex(0)}_${currentHash}`;
      }

      const relativePath = `${SYMBOL_ALL}/${targetIndex}`;
      const record: ExchangeInfoRecord = {
        timestamp,
        request: params.request,
        response: params.response,
      };

      await storage.writeRecord({
        record,
        relativePath,
      });
    },

    async readLatestRecord(symbol: string = SYMBOL_ALL): Promise<ExchangeInfoRecord | null> {
      const fileNames = await storage.listFileNames(symbol);

      if (fileNames.length === 0) {
        return null;
      }

      const sortedFiles = fileNames.sort((a, b) => {
        const parsedA = parseIndexParts(a);
        const parsedB = parseIndexParts(b);
        if (!parsedA || !parsedB) return 0;
        
        if (parsedA.fileNumber !== parsedB.fileNumber) {
          return parsedA.fileNumber - parsedB.fileNumber;
        }
        return parsedA.hash.localeCompare(parsedB.hash);
      });

      const latestFileName = sortedFiles[sortedFiles.length - 1]!;
      const records = await storage.readRecords({ relativePath: `${symbol}/${latestFileName}` });

      if (records.length === 0) {
        return null;
      }

      return records[records.length - 1]!;
    },
  } satisfies EndpointEntity<typeof BinanceApi.GetExchangeInfoEndpoint>;
};

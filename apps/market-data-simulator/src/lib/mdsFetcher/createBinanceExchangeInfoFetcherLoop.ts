import { createHash } from 'node:crypto';
import { BinanceApi } from '@krupton/api-interface';
import { sleep } from '@krupton/utils';
import type { MdsFetcherContext } from '../../process/mdsFetcherProcess/context.js';
import { createMdsFetcherLoop } from './mdsFetcherLoop.js';
import type { MdsFetcherLoop } from './types.js';

interface CreateBinanceExchangeInfoFetcherLoopParams {
  context: MdsFetcherContext;
}

const FETCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const hashSymbols = (symbols: string[]): string => {
  const sortedSymbols = [...symbols].sort();
  const symbolsString = sortedSymbols.join(',');
  return createHash('sha256').update(symbolsString).digest('hex').slice(0, 12);
};

const extractSymbolsFromResponse = (
  response: BinanceApi.GetExchangeInfoResponse,
): string[] => {
  return response.symbols
    .filter((s) => s.status === 'TRADING')
    .map((s) => s.symbol)
    .sort();
};

const formatIndex = (index: number): string => {
  return index.toString().padStart(5, '0');
};

interface HandleExchangeInfoResponseParams {
  query: BinanceApi.GetExchangeInfoQuery;
  response: BinanceApi.GetExchangeInfoResponse;
  context: MdsFetcherContext;
  endpoint: string;
}

const handleExchangeInfoResponse = async ({
  query,
  response,
  context,
  endpoint,
}: HandleExchangeInfoResponseParams): Promise<void> => {
  const { diagnosticContext, envContext, storageIO } = context;
  const config = envContext.config;
  const platform = config.PLATFORM;

  const symbols = extractSymbolsFromResponse(response);
  const currentHash = hashSymbols(symbols);

  const latestRecord =
    await storageIO.readLatestRecord<BinanceApi.GetExchangeInfoResponse>({
      platform,
      endpoint,
      symbol: 'ALL',
    });

  let targetIndex = '00001';
  let shouldOverwrite = false;

  if (latestRecord) {
    const latestResponse = latestRecord.response;
    if (latestResponse && 'symbols' in latestResponse) {
      const latestSymbols = extractSymbolsFromResponse(
        latestResponse as BinanceApi.GetExchangeInfoResponse,
      );
      const latestHash = hashSymbols(latestSymbols);

      diagnosticContext.logger.info('Comparing exchange info', {
        platform,
        endpoint,
        currentHash,
        latestHash,
        currentSymbolCount: symbols.length,
        latestSymbolCount: latestSymbols.length,
      });

      if (currentHash === latestHash) {
        shouldOverwrite = true;
        const params = latestRecord.params as { idx?: string };
        targetIndex = params.idx || '00001';
        diagnosticContext.logger.info('Symbol list unchanged, overwriting existing file', {
          platform,
          endpoint,
          targetIndex,
        });
      } else {
        const params = latestRecord.params as { idx?: string };
        const latestIdx = params.idx || '00001';
        const latestIndexNum = parseInt(latestIdx.split('_')[1] || '1', 10);
        targetIndex = `${currentHash}_${formatIndex(latestIndexNum + 1)}`;
        diagnosticContext.logger.info('Symbol list changed, creating new file', {
          platform,
          endpoint,
          targetIndex,
          addedSymbols: symbols.filter((s) => !latestSymbols.includes(s)).length,
          removedSymbols: latestSymbols.filter((s) => !symbols.includes(s)).length,
        });
      }
    } else {
      targetIndex = `${currentHash}_${formatIndex(1)}`;
    }
  } else {
    targetIndex = `${currentHash}_${formatIndex(1)}`;
    diagnosticContext.logger.info('No previous exchange info found, creating initial file', {
      platform,
      endpoint,
      targetIndex,
      symbolCount: symbols.length,
    });
  }

  const timestamp = Date.now();
  const recordToStore = {
    timestamp,
    endpoint,
    params: { query, idx: targetIndex },
    response,
  };

  if (shouldOverwrite) {
    await storageIO.writeRecord({
      platform,
      endpoint,
      symbol: 'ALL',
      idx: targetIndex,
      record: recordToStore,
    });
    diagnosticContext.logger.info('Exchange info overwritten', {
      platform,
      endpoint,
      idx: targetIndex,
      symbolCount: symbols.length,
    });
  } else {
    await storageIO.writeRecord({
      platform,
      endpoint,
      symbol: 'ALL',
      idx: targetIndex,
      record: recordToStore,
    });
    diagnosticContext.logger.info('Exchange info saved', {
      platform,
      endpoint,
      idx: targetIndex,
      symbolCount: symbols.length,
    });
  }
};

export const createBinanceExchangeInfoFetcherLoop = async ({
  context,
}: CreateBinanceExchangeInfoFetcherLoopParams): Promise<MdsFetcherLoop> => {
  const { diagnosticContext, envContext, binanceClient, storageIO } = context;
  const config = envContext.config;
  const endpoint = binanceClient.getExchangeInfo.definition.path;
  const platform = config.PLATFORM;

  diagnosticContext.logger.info('Initializing exchange info fetcher', {
    platform,
    endpoint,
    fetchInterval: `${FETCH_INTERVAL_MS / 1000}s`,
  });

  return createMdsFetcherLoop<typeof BinanceApi.GetExchangeInfoEndpoint>(context, {
    symbol: 'ALL',
    endpointFn: binanceClient.getExchangeInfo,
    buildRequestParams: async () => {
      const latestRecord =
        await storageIO.readLatestRecord<BinanceApi.GetExchangeInfoResponse>({
          platform,
          endpoint,
          symbol: 'ALL',
        });

      if (latestRecord) {
        const timeSinceLastFetch = Date.now() - latestRecord.timestamp;
        const timeUntilNextFetch = FETCH_INTERVAL_MS - timeSinceLastFetch;

        if (timeUntilNextFetch > 0) {
          diagnosticContext.logger.info('Waiting for next scheduled fetch', {
            platform,
            endpoint,
            timeSinceLastFetchMinutes: Math.floor(timeSinceLastFetch / 60000),
            waitTimeMinutes: Math.floor(timeUntilNextFetch / 60000),
          });
          await sleep(timeUntilNextFetch);
        }
      }

      return {
        query: {},
      };
    },
    onSuccess: async ({ query, response }) =>
      handleExchangeInfoResponse({
        query,
        response,
        context,
        endpoint,
      }),
  });
};

import { EndpointFunction } from '@krupton/api-client-node';
import { BinanceApi } from '@krupton/api-interface';
import {
  BinanceExchangeInfoStorage,
  SYMBOL_ALL
} from '@krupton/persistent-storage-node';

let latestBinanceExchangeInfo: BinanceApi.GetExchangeInfoResponse | null = null;

export function getBinanceLatestExchangeInfo() {
  if (!latestBinanceExchangeInfo) {
    throw new Error('Latest exchange info not initialized');
  }
  return latestBinanceExchangeInfo;
}

export function setBinanceLatestExchangeInfo(exchangeInfo: BinanceApi.GetExchangeInfoResponse) {
  latestBinanceExchangeInfo = exchangeInfo;
}

export async function initBinanceLatestExchangeInfoProvider(
  binanceExchangeInfoEntity: BinanceExchangeInfoStorage,
  getExchangeInfo: EndpointFunction<typeof BinanceApi.GetExchangeInfoEndpoint>,
) {
  latestBinanceExchangeInfo =
    (await binanceExchangeInfoEntity
      .readLastRecord(SYMBOL_ALL)
      .then((record) => record?.response)) ?? null;

  if (!latestBinanceExchangeInfo) {
    const result = await getExchangeInfo({ query: {} });
    await binanceExchangeInfoEntity.appendRecord({
      subIndexDir: SYMBOL_ALL,
      record: {
        id: binanceExchangeInfoEntity.getNextId(SYMBOL_ALL),
        timestamp: Date.now(),
        request: { query: {} },
        response: result,
      },
    });
    latestBinanceExchangeInfo = result;
  }
}

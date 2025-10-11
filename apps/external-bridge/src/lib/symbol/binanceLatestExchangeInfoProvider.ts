import { EndpointFunction } from '@krupton/api-client-node';
import { BinanceApi } from '@krupton/api-interface';
import { BinanceExchangeInfoEntity } from '@krupton/persistent-jsonl-storage-node';

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
  binanceExchangeInfoEntity: BinanceExchangeInfoEntity,
  getExchangeInfo: EndpointFunction<typeof BinanceApi.GetExchangeInfoEndpoint>,
) {
  latestBinanceExchangeInfo =
    (await binanceExchangeInfoEntity.readLatestRecord().then((record) => record?.response)) ?? null;

  if (!latestBinanceExchangeInfo) {
    const result = await getExchangeInfo({ query: {} });
    await binanceExchangeInfoEntity.write({
      request: { query: {} },
      response: result,
    });
    latestBinanceExchangeInfo = result;
  }
}

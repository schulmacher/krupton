import { EndpointFunction } from '@krupton/api-client-node';
import { KrakenApi } from '@krupton/api-interface';
import { KrakenAssetInfoEntity } from '@krupton/persistent-jsonl-storage-node';
import { KrakenAssetPairsEntity } from '@krupton/persistent-jsonl-storage-node';

let assetPairs: KrakenApi.GetAssetPairsResponse | null = null;
let assetInfo: KrakenApi.GetAssetInfoResponse | null = null;

export function getKrakenLatestAssetPairs() {
  if (!assetPairs) {
    throw new Error('Latest asset pairs not initialized');
  }
  return assetPairs;
}

export function getKrakenLatestAssetInfo() {
  if (!assetInfo) {
    throw new Error('Latest asset info not initialized');
  }
  return assetInfo;
}

export function setKrakenLatestAssetPairs(data: KrakenApi.GetAssetPairsResponse) {
  assetPairs = data;
}

export function setKrakenLatestAssetInfo(data: KrakenApi.GetAssetInfoResponse) {
  assetInfo = data;
}

export async function initKrakenLatestAssetPairsProvider(
  krakenAssetPairsEntity: KrakenAssetPairsEntity,
  krakenAssetInfoEntity: KrakenAssetInfoEntity,
) {
  assetPairs =
    (await krakenAssetPairsEntity.readLatestRecord().then((record) => record?.response)) ?? null;
  assetInfo =
    (await krakenAssetInfoEntity.readLatestRecord().then((record) => record?.response)) ?? null;
}

export async function initAndDownloadKrakenLatestAssetPairsProvider(
  krakenAssetPairsEntity: KrakenAssetPairsEntity,
  krakenAssetInfoEntity: KrakenAssetInfoEntity,
  getExchangeInfo: EndpointFunction<typeof KrakenApi.GetAssetPairsEndpoint>,
  getAssetInfo: EndpointFunction<typeof KrakenApi.GetAssetInfoEndpoint>,
) {
  await initKrakenLatestAssetPairsProvider(krakenAssetPairsEntity, krakenAssetInfoEntity);

  if (!assetPairs) {
    const result = await getExchangeInfo({ query: {} });
    await krakenAssetPairsEntity.write({
      request: { query: {} },
      response: result,
    });
    assetPairs = result;
  }

  if (!assetInfo) {
    const result = await getAssetInfo({ query: {} });
    await krakenAssetInfoEntity.write({
      request: { query: {} },
      response: result,
    });
    assetInfo = result;
  }
}

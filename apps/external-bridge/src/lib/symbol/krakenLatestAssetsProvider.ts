import { EndpointFunction } from '@krupton/api-client-node';
import { KrakenApi } from '@krupton/api-interface';
import {
  KrakenAssetInfoStorage,
  KrakenAssetPairsStorage,
  SYMBOL_ALL,
} from '@krupton/persistent-storage-node';

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
  krakenAssetPairsEntity: KrakenAssetPairsStorage,
  krakenAssetInfoEntity: KrakenAssetInfoStorage,
) {
  assetPairs =
    (await krakenAssetPairsEntity.readLastRecord(SYMBOL_ALL).then((record) => record?.response)) ??
    null;
  assetInfo =
    (await krakenAssetInfoEntity.readLastRecord(SYMBOL_ALL).then((record) => record?.response)) ??
    null;
}

export async function initAndDownloadKrakenLatestAssetPairsProvider(
  krakenAssetPairsEntity: KrakenAssetPairsStorage,
  krakenAssetInfoEntity: KrakenAssetInfoStorage,
  getExchangeInfo: EndpointFunction<typeof KrakenApi.GetAssetPairsEndpoint>,
  getAssetInfo: EndpointFunction<typeof KrakenApi.GetAssetInfoEndpoint>,
) {
  await initKrakenLatestAssetPairsProvider(krakenAssetPairsEntity, krakenAssetInfoEntity);

  if (!assetPairs) {
    const result = await getExchangeInfo({ query: {} });
    await krakenAssetPairsEntity.appendRecord({
      subIndexDir: SYMBOL_ALL,
      record: {
        id: krakenAssetPairsEntity.getNextId(SYMBOL_ALL),
        timestamp: Date.now(),
        request: { query: {} },
        response: result,
      },
    });
    assetPairs = result;
  }

  if (!assetInfo) {
    const result = await getAssetInfo({ query: {} });
    await krakenAssetInfoEntity.appendRecord({
      subIndexDir: SYMBOL_ALL,
      record: {
        id: krakenAssetInfoEntity.getNextId(SYMBOL_ALL),
        timestamp: Date.now(),
        request: { query: {} },
        response: result,
      },
    });
    assetInfo = result;
  }
}

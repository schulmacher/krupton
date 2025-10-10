import { getBinanceLatestExchangeInfo } from './binanceLatestExchangeInfoProvider';
import { getKrakenSymbolFromNormalSymbol, getNormalSymbolFromKrakenSymbol } from './kraken';
import { getKrakenLatestAssetInfo, getKrakenLatestAssetPairs } from './krakenLatestAssetsProvider';

export function normalizeSymbol(fromPlatform: 'binance' | 'kraken', symbol: string) {
  switch (fromPlatform) {
    case 'binance':
      return normalizeBinanceSymbol(symbol);
    case 'kraken':
      return normalizeKrakenSymbol(symbol);
    default:
      throw new Error(`Invalid platform: ${fromPlatform}`);
  }
}

function createNormalizedSymbol({ base, quote }: { base: string; quote: string }) {
  return `${base.toLowerCase()}_${quote.toLowerCase()}`;
}

function normalizeBinanceSymbol(symbol: string) {
  const exchangeInfo = getBinanceLatestExchangeInfo();
  const symbolInfo = exchangeInfo.symbols.find(
    (s) => s.symbol.toLowerCase() === symbol.toLowerCase(),
  );

  if (!symbolInfo) {
    throw new Error(`Symbol not found: ${symbol}`);
  }

  return createNormalizedSymbol({ base: symbolInfo.baseAsset, quote: symbolInfo.quoteAsset });
}

function normalizeKrakenSymbol(symbol: string) {
  const assetPairs = getKrakenLatestAssetPairs().result;

  if (!assetPairs) {
    throw new Error(`Asset pairs not found`);
  }

  const [base, quote] = symbol.split('/');

  if (!base || !quote) {
    // received altsymbol
    for (const assetPair of Object.values(assetPairs)) {
      if (assetPair.altname.toLowerCase() === symbol.toLowerCase()) {
        const [base, quote] = assetPair.wsname.split('/');

        const normalizedBase = getNormalSymbolFromKrakenSymbol(base) ?? base;
        const normalizedQuote = getNormalSymbolFromKrakenSymbol(quote) ?? quote;

        return createNormalizedSymbol({ base: normalizedBase, quote: normalizedQuote });
      }
    }
  } else {
    // received base/quote symbol
    const normalizedBase = getNormalSymbolFromKrakenSymbol(base) ?? base;
    const normalizedQuote = getNormalSymbolFromKrakenSymbol(quote) ?? quote;

    return createNormalizedSymbol({ base: normalizedBase, quote: normalizedQuote });
  }

  throw new Error(`Symbol not found: ${symbol}`);
}

export function unnormalizeToBinanceSymbol(symbol: string) {
  const [base, quote] = symbol.split('_');

  if (!base || !quote) {
    throw new Error(`Invalid symbol: ${symbol}`);
  }

  return `${base.toUpperCase()}${quote.toUpperCase()}`;
}

export function unnormalizeToKrakenWSSymbol(symbol: string) {
  const assetPair = getKrakenAssetPair(symbol);
  const baseSymbol = getNormalSymbolFromKrakenSymbol(assetPair.base) ?? assetPair.base;
  const quoteSymbol = getNormalSymbolFromKrakenSymbol(assetPair.quote) ?? assetPair.quote;

  return `${baseSymbol}/${quoteSymbol}`;
}

export function unnormalizeToKrakenALTSymbol(symbol: string) {
  const assetPair = getKrakenAssetPair(symbol);
  return assetPair.altname;
}


function getKrakenAssetPair(symbol: string) {
  const [base, quote] = symbol.toUpperCase().split('_');

  if (!base || !quote) {
    throw new Error(`Invalid symbol: ${symbol} ${base} ${quote}`);
  }

  const assetPairs = getKrakenLatestAssetPairs().result;
  const assets = getKrakenLatestAssetInfo().result;

  if (!assetPairs || !assets) {
    throw new Error(`Asset info not initialize`);
  }

  const krakenBase = getKrakenSymbolFromNormalSymbol(base) ?? base;
  const krakenQuote = getKrakenSymbolFromNormalSymbol(quote) ?? quote;
  const baseAsset = assets[krakenBase];
  const quoteAsset = assets[krakenQuote];


  if (!baseAsset) {
    throw new Error(`Kraken base asset info not found for ${krakenBase}`);
  }
  if (!quoteAsset) {
    throw new Error(`Kraken quote asset info not found for ${krakenQuote}`);
  }

  for (const assetPair of Object.values(assetPairs)) {
    if (assetPair.base === krakenBase && assetPair.quote === krakenQuote) {
      return assetPair;
    }
  }

  throw new Error(`Kraken asset pair not found for ${krakenBase} ${krakenQuote}`);
}

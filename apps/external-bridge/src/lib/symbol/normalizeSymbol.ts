import { getBinanceLatestExchangeInfo } from '../binance/binanceLatestExchangeInfoProvider';

export function normalizeSymbol(platform: 'binance' | 'kraken', symbol: string) {
  if (platform === 'binance') {
    return normalizeBinanceSymbol(symbol);
  } else if (platform === 'kraken') {
    return normalizeKrakenSymbol(symbol);
  }

  throw new Error(`Invalid platform: ${platform}`);
}

function normalizeBinanceSymbol(symbol: string) {
  const exchangeInfo = getBinanceLatestExchangeInfo();
  const symbolInfo = exchangeInfo.symbols.find(
    (s) => s.symbol.toLowerCase() === symbol.toLowerCase(),
  );

  if (!symbolInfo) {
    throw new Error(`Symbol not found: ${symbol}`);
  }

  return createSymbol({ base: symbolInfo.baseAsset, quote: symbolInfo.quoteAsset });
}

function normalizeKrakenSymbol(symbol: string) {
  const [base, quote] = symbol.split('/');

  if (!base || !quote) {
    throw new Error(`Invalid symbol: ${symbol}`);
  }

  return createSymbol({ base, quote });
}

function createSymbol({ base, quote }: { base: string; quote: string }) {
  return `${base.toLowerCase()}_${quote.toLowerCase()}`;
}

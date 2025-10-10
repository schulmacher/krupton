// https://support.kraken.com/articles/360001206766-bitcoin-currency-code-xbt-vs-btc
const krakenSymbolToNormalMap = {
  XETC: 'ETC',
  XETH: 'ETH',
  XLTC: 'LTC',
  XMLN: 'MLN',
  XREP: 'REP',
  XXLM: 'XLM',
  XXMR: 'XMR',
  XXRP: 'XRP',
  XZEC: 'ZEC',
  ZAUD: 'AUD',
  ZCAD: 'CAD',
  ZEUR: 'EUR',
  ZGBP: 'GBP',
  ZJPY: 'JPY',
  ZUSD: 'USD',
  XXBT: 'BTC',
  XXDG: 'DOGE',
  
  // OOPS what happened here?
  XBT: 'BTC',
  XDG: 'DOGE',
};

const krakenSymbolMapArray = Object.entries(krakenSymbolToNormalMap);

export function getKrakenSymbolFromNormalSymbol(normalSymbolParam: string): string | undefined {
  for (const [krakenSymbol, normalSymbol] of krakenSymbolMapArray) {
    if (normalSymbol === normalSymbolParam) {
      return krakenSymbol;
    }
  }
  return undefined;
}

export function getNormalSymbolFromKrakenSymbol(krakenSymbolParam: string): string | undefined {
  for (const [krakenSymbol, normalSymbol] of krakenSymbolMapArray) {
    if (krakenSymbol === krakenSymbolParam) {
      return normalSymbol;
    }
  }
  return undefined;
}

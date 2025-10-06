export function createBinanceAuthHeaders(apiKey?: string): Record<string, string> {
  if (!apiKey) {
    return {};
  }

  return {
    'X-MBX-APIKEY': apiKey,
  };
}

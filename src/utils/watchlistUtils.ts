import { ExchangeId, MarketType, ScannedCoin } from '../types';

export interface CoinIdentifier {
  symbol: string;
  exchange?: ExchangeId | string;
  marketType?: MarketType | string;
}

/**
 * Returns a standardized, unique key for a coin: `${exchange}:${marketType}:${symbol}`
 * e.g. "bybit:futures:BTCUSDT", "binance:futures:BTCUSDT", "binance:spot:ETHUSDT"
 */
export function getCoinWatchlistKey(coin: CoinIdentifier | string): string {
  if (typeof coin === 'string') {
    const trimmed = coin.trim();
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      if (parts.length >= 3) {
        return `${parts[0].toLowerCase()}:${parts[1].toLowerCase()}:${parts.slice(2).join(':').toUpperCase()}`;
      }
      if (parts.length === 2) {
        return `${parts[0].toLowerCase()}:futures:${parts[1].toUpperCase()}`;
      }
    }
    // Default legacy symbol to binance:futures
    return `binance:futures:${trimmed.toUpperCase()}`;
  }

  const ex = (coin.exchange || 'binance').toLowerCase().trim();
  const mt = (coin.marketType || 'futures').toLowerCase().trim();
  const sym = coin.symbol.toUpperCase().trim();
  return `${ex}:${mt}:${sym}`;
}

/**
 * Parses a standardized watchlist key back into its component parts:
 * exchange, marketType, and symbol.
 */
export function parseWatchlistKey(key: string): { exchange: ExchangeId; marketType: MarketType; symbol: string } {
  const parts = key.trim().split(':');
  if (parts.length >= 3) {
    return {
      exchange: (parts[0].toLowerCase() === 'bybit' ? 'bybit' : 'binance') as ExchangeId,
      marketType: (parts[1].toLowerCase() === 'spot' ? 'spot' : 'futures') as MarketType,
      symbol: parts.slice(2).join(':').toUpperCase(),
    };
  }
  if (parts.length === 2) {
    return {
      exchange: (parts[0].toLowerCase() === 'bybit' ? 'bybit' : 'binance') as ExchangeId,
      marketType: 'futures',
      symbol: parts[1].toUpperCase(),
    };
  }
  return {
    exchange: 'binance',
    marketType: 'futures',
    symbol: key.toUpperCase(),
  };
}

/**
 * Checks whether a given coin matches any item in the watchlist.
 * Guarantees that adding a coin on one exchange (e.g. Bybit) does NOT
 * falsely match or add the coin on another exchange (e.g. Binance).
 */
export function isCoinInWatchlist(
  watchlist: string[] | undefined,
  coin: CoinIdentifier | string
): boolean {
  if (!watchlist || !Array.isArray(watchlist) || watchlist.length === 0) return false;

  const targetKey = getCoinWatchlistKey(coin);
  if (watchlist.includes(targetKey)) return true;

  if (typeof coin !== 'string') {
    const ex = (coin.exchange || '').toLowerCase().trim();
    const mt = (coin.marketType || '').toLowerCase().trim();
    const sym = coin.symbol.toUpperCase().trim();

    if (!ex) return false;

    for (const item of watchlist) {
      if (item === targetKey) return true;
      if (item.includes(':')) {
        const itemParsed = parseWatchlistKey(item);
        if (itemParsed.symbol === sym && itemParsed.exchange === ex) {
          if (!mt || itemParsed.marketType === mt) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Normalizes an array of watchlist keys to ensure backwards compatibility
 * while guaranteeing each entry has an explicit exchange identifier.
 */
export function normalizeWatchlist(list: string[] | undefined): string[] {
  if (!list || !Array.isArray(list)) return [];
  const normalized = list.map((item) => getCoinWatchlistKey(item));
  return Array.from(new Set(normalized));
}


import { ExchangeId, MarketType, Timeframe, Kline, ScannedCoin, MarketCoin } from '../src/types';
import { detectFormations } from '../src/utils/patternRecognition';

// Cache structure
interface CacheEntry {
  timestamp: number;
  data: ScannedCoin[];
}

const scanCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 45 * 1000; // 45 seconds

// Helper to map timeframe to exchange interval
function toBinanceInterval(tf: Timeframe): string {
  switch (tf) {
    case '1m': return '1m';
    case '5m': return '5m';
    case '15m': return '15m';
    case '1h': return '1h';
    case '4h': return '4h';
    case '1d': return '1d';
    default: return '1h';
  }
}

function toBybitInterval(tf: Timeframe): string {
  switch (tf) {
    case '1m': return '1';
    case '5m': return '5';
    case '15m': return '15';
    case '1h': return '60';
    case '4h': return '240';
    case '1d': return 'D';
    default: return '60';
  }
}

interface RawTicker {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  price: number;
  change24h: number;
  volumeUsd: number;
  high24h: number;
  low24h: number;
}

// Fetch tickers from Binance
async function fetchBinanceTickers(market: MarketType, minVolume: number = 0): Promise<RawTicker[]> {
  try {
    const url = market === 'futures'
      ? 'https://fapi.binance.com/fapi/v1/ticker/24hr'
      : 'https://api.binance.com/api/v3/ticker/24hr';

    const res = await fetch(url, { headers: { 'User-Agent': 'CryptoPatternScreener/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();

    if (!Array.isArray(data)) return [];

    return data
      .filter((item: any) => item.symbol && item.symbol.endsWith('USDT'))
      .map((item: any) => {
        const symbol = item.symbol;
        const base = symbol.replace('USDT', '');
        return {
          symbol,
          baseAsset: base,
          quoteAsset: 'USDT',
          exchange: 'binance' as ExchangeId,
          marketType: market,
          price: parseFloat(item.lastPrice) || 0,
          change24h: parseFloat(item.priceChangePercent) || 0,
          volumeUsd: parseFloat(item.quoteVolume) || 0,
          high24h: parseFloat(item.highPrice) || 0,
          low24h: parseFloat(item.lowPrice) || 0,
        };
      })
      .filter((t) => t.volumeUsd >= minVolume && t.price > 0)
      .sort((a, b) => b.volumeUsd - a.volumeUsd);
  } catch (err) {
    console.error(`Failed to fetch Binance ${market} tickers:`, err);
    return [];
  }
}

// Fetch tickers from Bybit
async function fetchBybitTickers(market: MarketType, minVolume: number = 0): Promise<RawTicker[]> {
  try {
    const category = market === 'futures' ? 'linear' : 'spot';
    const url = `https://api.bybit.com/v5/market/tickers?category=${category}`;

    const res = await fetch(url, { headers: { 'User-Agent': 'CryptoPatternScreener/1.0' } });
    if (!res.ok) return [];
    const json = await res.json();
    const list = json?.result?.list;
    if (!Array.isArray(list)) return [];

    return list
      .filter((item: any) => item.symbol && item.symbol.endsWith('USDT'))
      .map((item: any) => {
        const symbol = item.symbol;
        const base = symbol.replace('USDT', '');
        const volumeUsd = parseFloat(item.turnover24h) || 0;
        const changePcnt = (parseFloat(item.price24hPcnt) || 0) * 100;

        return {
          symbol,
          baseAsset: base,
          quoteAsset: 'USDT',
          exchange: 'bybit' as ExchangeId,
          marketType: market,
          price: parseFloat(item.lastPrice) || 0,
          change24h: changePcnt,
          volumeUsd,
          high24h: parseFloat(item.highPrice24h) || 0,
          low24h: parseFloat(item.lowPrice24h) || 0,
        };
      })
      .filter((t) => t.volumeUsd >= minVolume && t.price > 0)
      .sort((a, b) => b.volumeUsd - a.volumeUsd);
  } catch (err) {
    console.error(`Failed to fetch Bybit ${market} tickers:`, err);
    return [];
  }
}

// Fetch Klines for a specific coin
export async function fetchKlines(
  exchange: ExchangeId,
  market: MarketType,
  symbol: string,
  timeframe: Timeframe,
  limit: number = 70
): Promise<Kline[]> {
  try {
    const safeLimit = Math.min(Math.max(limit, 10), 1000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    if (exchange === 'binance') {
      const interval = toBinanceInterval(timeframe);
      const url = market === 'futures'
        ? `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${safeLimit}`
        : `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${safeLimit}`;

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data)) return [];

      return data.map((d: any) => ({
        time: Math.floor(d[0] / 1000),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));
    } else {
      // Bybit
      const category = market === 'futures' ? 'linear' : 'spot';
      const interval = toBybitInterval(timeframe);
      const url = `https://api.bybit.com/v5/market/kline?category=${category}&symbol=${symbol}&interval=${interval}&limit=${safeLimit}`;

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) return [];
      const json = await res.json();
      const list = json?.result?.list;
      if (!Array.isArray(list)) return [];

      // Bybit returns newest first, reverse for chronological
      return list
        .slice()
        .reverse()
        .map((d: any) => ({
          time: Math.floor(parseInt(d[0], 10) / 1000),
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
          volume: parseFloat(d[5]),
        }));
    }
  } catch (err) {
    return [];
  }
}

// Simple concurrency runner
async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency = 6): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = fn(item).then((res) => {
      results.push(res);
    });
    executing.push(p);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // remove resolved
      for (let i = executing.length - 1; i >= 0; i--) {
        // @ts-ignore
        if (executing[i].settled) {
          executing.splice(i, 1);
        }
      }
    }
  }

  await Promise.all(executing);
  return results;
}

// Build trade URL
function getExchangeUrl(exchange: ExchangeId, market: MarketType, symbol: string): string {
  if (exchange === 'binance') {
    return market === 'futures'
      ? `https://www.binance.com/en/futures/${symbol}`
      : `https://www.binance.com/en/trade/${symbol}`;
  } else {
    return market === 'futures'
      ? `https://www.bybit.com/trade/usdt/${symbol}`
      : `https://www.bybit.com/en/trade/spot/${symbol.replace('USDT', '')}/USDT`;
  }
}

// Main screener scan engine
export async function runScreenerScan(params: {
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
  timeframe: Timeframe;
  minVolumeUsd?: number;
}): Promise<ScannedCoin[]> {
  const minVol = typeof params.minVolumeUsd === 'number' ? params.minVolumeUsd : 50_000;
  const cacheKey = `${params.exchange}_${params.marketType}_${params.timeframe}_${minVol}`;
  const cached = scanCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // Determine tickers to fetch
  const tickerPromises: Promise<RawTicker[]>[] = [];

  if (params.exchange === 'all' || params.exchange === 'binance') {
    if (params.marketType === 'all' || params.marketType === 'futures') {
      tickerPromises.push(fetchBinanceTickers('futures', minVol));
    }
    if (params.marketType === 'all' || params.marketType === 'spot') {
      tickerPromises.push(fetchBinanceTickers('spot', minVol));
    }
  }

  if (params.exchange === 'all' || params.exchange === 'bybit') {
    if (params.marketType === 'all' || params.marketType === 'futures') {
      tickerPromises.push(fetchBybitTickers('futures', minVol));
    }
    if (params.marketType === 'all' || params.marketType === 'spot') {
      tickerPromises.push(fetchBybitTickers('spot', minVol));
    }
  }

  const tickerBatches = await Promise.all(tickerPromises);
  const allTickers = tickerBatches.flat();

  // Deduplicate tickers by exchange + symbol + marketType and sort by volume
  const seenKeys = new Set<string>();
  const uniqueTickers: RawTicker[] = [];

  for (const t of allTickers) {
    const key = `${t.exchange}_${t.symbol}_${t.marketType}`;
    if (!seenKeys.has(key) && t.volumeUsd >= minVol) {
      seenKeys.add(key);
      uniqueTickers.push(t);
    }
  }

  uniqueTickers.sort((a, b) => b.volumeUsd - a.volumeUsd);

  // Scan candidates (up to 75 coins to scan all active liquid coins swiftly)
  const selectedTickers = uniqueTickers.slice(0, 75);

  // Scan klines and detect patterns in parallel
  const scannedCoins: ScannedCoin[] = [];

  // Batch process with higher concurrency
  const BATCH_SIZE = 25;
  for (let i = 0; i < selectedTickers.length; i += BATCH_SIZE) {
    const batch = selectedTickers.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (ticker) => {
        const klines = await fetchKlines(ticker.exchange, ticker.marketType, ticker.symbol, params.timeframe, 70);
        if (!klines || klines.length < 25) return null;

        const formations = detectFormations(klines, ticker.symbol);

        const scanned: ScannedCoin = {
          symbol: ticker.symbol,
          baseAsset: ticker.baseAsset,
          quoteAsset: ticker.quoteAsset,
          exchange: ticker.exchange,
          marketType: ticker.marketType,
          currentPrice: ticker.price,
          priceChange24h: ticker.change24h,
          highPrice24h: ticker.high24h,
          lowPrice24h: ticker.low24h,
          volume24hUsd: ticker.volumeUsd,
          formations,
          timeframe: params.timeframe,
          lastUpdated: Date.now(),
          exchangeUrl: getExchangeUrl(ticker.exchange, ticker.marketType, ticker.symbol),
        };
        return scanned;
      })
    );

    for (const res of batchResults) {
      if (res) scannedCoins.push(res);
    }
  }

  // Update cache
  scanCache.set(cacheKey, {
    timestamp: Date.now(),
    data: scannedCoins,
  });

  return scannedCoins;
}

// Fast coin list cache for the dedicated Screener page
const coinListCache = new Map<string, { timestamp: number; data: MarketCoin[] }>();
const COIN_LIST_CACHE_TTL = 15 * 1000; // 15 seconds

export async function fetchMarketCoins(params: {
  exchange?: 'all' | ExchangeId;
  marketType?: 'all' | MarketType;
  minVolumeUsd?: number;
}): Promise<MarketCoin[]> {
  const exchange = params.exchange || 'all';
  const marketType = params.marketType || 'all';
  const minVol = params.minVolumeUsd || 0;
  const cacheKey = `coins_${exchange}_${marketType}_${minVol}`;

  const cached = coinListCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < COIN_LIST_CACHE_TTL) {
    return cached.data;
  }

  const tickerPromises: Promise<RawTicker[]>[] = [];

  if (exchange === 'all' || exchange === 'binance') {
    if (marketType === 'all' || marketType === 'futures') {
      tickerPromises.push(fetchBinanceTickers('futures', minVol));
    }
    if (marketType === 'all' || marketType === 'spot') {
      tickerPromises.push(fetchBinanceTickers('spot', minVol));
    }
  }

  if (exchange === 'all' || exchange === 'bybit') {
    if (marketType === 'all' || marketType === 'futures') {
      tickerPromises.push(fetchBybitTickers('futures', minVol));
    }
    if (marketType === 'all' || marketType === 'spot') {
      tickerPromises.push(fetchBybitTickers('spot', minVol));
    }
  }

  const batches = await Promise.all(tickerPromises);
  const allTickers = batches.flat();

  const seenKeys = new Set<string>();
  const coins: MarketCoin[] = [];

  for (const t of allTickers) {
    const key = `${t.exchange}_${t.symbol}_${t.marketType}`;
    if (!seenKeys.has(key) && t.volumeUsd >= minVol && t.price > 0) {
      seenKeys.add(key);

      const high = t.high24h > 0 ? t.high24h : t.price;
      const low = t.low24h > 0 ? t.low24h : t.price;

      const distanceToHighPct = high > 0 ? Math.max(0, ((high - t.price) / high) * 100) : 0;
      const distanceToLowPct = low > 0 ? Math.max(0, ((t.price - low) / low) * 100) : 0;
      const volatility24hPct = low > 0 ? Math.max(0, ((high - low) / low) * 100) : 0;

      // Coins near 24h high: price within 2.5% of high24h
      const isNearHigh = distanceToHighPct <= 2.5;

      // Coins near 24h low: price within 2.5% of low24h
      const isNearLow = distanceToLowPct <= 2.5;

      // Active coins: high volatility (> 4%) and high volume (> $2M) OR extreme 24h price swing
      const isActiveCoin = (volatility24hPct >= 4 && t.volumeUsd >= 2_000_000) || Math.abs(t.change24h) >= 5;

      coins.push({
        symbol: t.symbol,
        baseAsset: t.baseAsset,
        quoteAsset: t.quoteAsset,
        exchange: t.exchange,
        marketType: t.marketType,
        price: t.price,
        change24h: Number(t.change24h.toFixed(2)),
        volumeUsd: t.volumeUsd,
        high24h: high,
        low24h: low,
        distanceToHighPct: Number(distanceToHighPct.toFixed(2)),
        distanceToLowPct: Number(distanceToLowPct.toFixed(2)),
        volatility24hPct: Number(volatility24hPct.toFixed(2)),
        isNearHigh,
        isNearLow,
        isActiveCoin,
        exchangeUrl: getExchangeUrl(t.exchange, t.marketType, t.symbol),
      });
    }
  }

  // Sort by volume descending by default
  coins.sort((a, b) => b.volumeUsd - a.volumeUsd);

  coinListCache.set(cacheKey, {
    timestamp: Date.now(),
    data: coins,
  });

  return coins;
}

export interface OrderBookData {
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  bids: [number, number][]; // [price, qty]
  asks: [number, number][]; // [price, qty]
  lastUpdateId?: number;
  timestamp: number;
}

// Fetch orderbook depth snapshot
export async function fetchOrderBook(
  exchange: ExchangeId = 'binance',
  market: MarketType = 'futures',
  symbol: string = 'BTCUSDT',
  limit: number = 100
): Promise<OrderBookData> {
  const cleanSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const safeLimit = Math.min(Math.max(limit, 20), 500);

  if (exchange === 'bybit') {
    try {
      const category = market === 'futures' ? 'linear' : 'spot';
      const url = `https://api.bybit.com/v5/market/orderbook?category=${category}&symbol=${cleanSymbol}&limit=${Math.min(safeLimit, 200)}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'CryptoPatternScreener/1.0' } });
      if (res.ok) {
        const json = await res.json();
        const result = json?.result;
        if (result && Array.isArray(result.b) && Array.isArray(result.a)) {
          const bids: [number, number][] = result.b.map((item: [string, string]) => [parseFloat(item[0]), parseFloat(item[1])]);
          const asks: [number, number][] = result.a.map((item: [string, string]) => [parseFloat(item[0]), parseFloat(item[1])]);
          return {
            symbol: cleanSymbol,
            exchange,
            marketType: market,
            bids,
            asks,
            timestamp: result.ts || Date.now(),
          };
        }
      }
    } catch (e) {
      console.warn('Bybit orderbook fetch failed, falling back to Binance:', e);
    }
  }

  // Binance (Futures or Spot)
  try {
    const url = market === 'futures'
      ? `https://fapi.binance.com/fapi/v1/depth?symbol=${cleanSymbol}&limit=${safeLimit}`
      : `https://api.binance.com/api/v3/depth?symbol=${cleanSymbol}&limit=${safeLimit}`;

    const res = await fetch(url, { headers: { 'User-Agent': 'CryptoPatternScreener/1.0' } });
    if (!res.ok) {
      throw new Error(`Binance depth HTTP ${res.status}`);
    }
    const data = await res.json();
    const bids: [number, number][] = (data.bids || []).map((item: [string, string]) => [parseFloat(item[0]), parseFloat(item[1])]);
    const asks: [number, number][] = (data.asks || []).map((item: [string, string]) => [parseFloat(item[0]), parseFloat(item[1])]);

    return {
      symbol: cleanSymbol,
      exchange: 'binance',
      marketType: market,
      bids,
      asks,
      lastUpdateId: data.lastUpdateId,
      timestamp: Date.now(),
    };
  } catch (err: any) {
    console.error('Binance orderbook fetch error:', err);
    throw err;
  }
}


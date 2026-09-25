import { ExchangeId, MarketType, Timeframe, Kline, ScannedCoin, MarketCoin } from '../types';
import { detectFormations } from './patternRecognition';

// Popular top crypto pairs for immediate search & zero-latency fallback
export const TOP_POPULAR_PAIRS: { symbol: string; baseAsset: string; name: string }[] = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', name: 'Ethereum' },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', name: 'Solana' },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', name: 'Ripple' },
  { symbol: 'DOGEUSDT', baseAsset: 'DOGE', name: 'Dogecoin' },
  { symbol: 'ADAUSDT', baseAsset: 'ADA', name: 'Cardano' },
  { symbol: 'BNBUSDT', baseAsset: 'BNB', name: 'BNB' },
  { symbol: 'SUIUSDT', baseAsset: 'SUI', name: 'Sui' },
  { symbol: 'PEPEUSDT', baseAsset: 'PEPE', name: 'Pepe' },
  { symbol: 'NEARUSDT', baseAsset: 'NEAR', name: 'NEAR Protocol' },
  { symbol: 'AVAXUSDT', baseAsset: 'AVAX', name: 'Avalanche' },
  { symbol: 'LINKUSDT', baseAsset: 'LINK', name: 'Chainlink' },
  { symbol: 'APTUSDT', baseAsset: 'APT', name: 'Aptos' },
  { symbol: 'ARBUSDT', baseAsset: 'ARB', name: 'Arbitrum' },
  { symbol: 'OPUSDT', baseAsset: 'OP', name: 'Optimism' },
  { symbol: 'TIAUSDT', baseAsset: 'TIA', name: 'Celestia' },
  { symbol: 'INJUSDT', baseAsset: 'INJ', name: 'Injective' },
  { symbol: 'SEIUSDT', baseAsset: 'SEI', name: 'Sei' },
  { symbol: 'FETUSDT', baseAsset: 'FET', name: 'Artificial Superintelligence' },
  { symbol: 'RENDERUSDT', baseAsset: 'RENDER', name: 'Render' },
  { symbol: 'SHIBUSDT', baseAsset: 'SHIB', name: 'Shiba Inu' },
  { symbol: 'WIFUSDT', baseAsset: 'WIF', name: 'dogwifhat' },
  { symbol: 'FLOKIUSDT', baseAsset: 'FLOKI', name: 'Floki' },
  { symbol: 'BONKUSDT', baseAsset: 'BONK', name: 'Bonk' },
  { symbol: 'TONUSDT', baseAsset: 'TON', name: 'Toncoin' },
  { symbol: 'DOTUSDT', baseAsset: 'DOT', name: 'Polkadot' },
  { symbol: 'LTCUSDT', baseAsset: 'LTC', name: 'Litecoin' },
  { symbol: 'BCHUSDT', baseAsset: 'BCH', name: 'Bitcoin Cash' },
  { symbol: 'KASUSDT', baseAsset: 'KAS', name: 'Kaspa' },
  { symbol: 'JUPUSDT', baseAsset: 'JUP', name: 'Jupiter' },
  { symbol: 'PYTHUSDT', baseAsset: 'PYTH', name: 'Pyth Network' },
  { symbol: 'STXUSDT', baseAsset: 'STX', name: 'Stacks' },
  { symbol: 'TAOUSDT', baseAsset: 'TAO', name: 'Bittensor' },
  { symbol: 'ICPUSDT', baseAsset: 'ICP', name: 'Internet Computer' },
  { symbol: 'UNIUSDT', baseAsset: 'UNI', name: 'Uniswap' },
  { symbol: 'AAVEUSDT', baseAsset: 'AAVE', name: 'Aave' },
  { symbol: 'MKRUSDT', baseAsset: 'MKR', name: 'Maker' },
  { symbol: 'PENGUUSDT', baseAsset: 'PENGU', name: 'Pudgy Penguins' },
  { symbol: 'VIRTUALUSDT', baseAsset: 'VIRTUAL', name: 'Virtuals Protocol' },
  { symbol: 'TRUMPUSDT', baseAsset: 'TRUMP', name: 'Official Trump' },
  { symbol: 'MOVEUSDT', baseAsset: 'MOVE', name: 'Movement' },
  { symbol: 'HYPEUSDT', baseAsset: 'HYPE', name: 'Hyperliquid' },
  { symbol: 'ONDOUSDT', baseAsset: 'ONDO', name: 'Ondo' },
  { symbol: 'OMUSDT', baseAsset: 'OM', name: 'MANTRA' },
];

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

/**
 * Direct client-side fetch from Binance (with multi-mirror fallback)
 */
export async function fetchDirectBinanceTickers(): Promise<MarketCoin[]> {
  const mirrors = [
    'https://data-api.binance.vision/api/v3/ticker/24hr',
    'https://api.binance.com/api/v3/ticker/24hr',
    'https://api1.binance.com/api/v3/ticker/24hr',
    'https://api2.binance.com/api/v3/ticker/24hr',
  ];

  for (const url of mirrors) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;

      const coins: MarketCoin[] = [];
      for (const item of data) {
        if (!item.symbol || !item.symbol.endsWith('USDT')) continue;
        const symbol = item.symbol;
        const base = symbol.replace('USDT', '');
        const price = parseFloat(item.lastPrice) || 0;
        const volumeUsd = parseFloat(item.quoteVolume) || 0;
        const change24h = parseFloat(item.priceChangePercent) || 0;
        const high = parseFloat(item.highPrice) || price;
        const low = parseFloat(item.lowPrice) || price;

        if (price <= 0 || volumeUsd < 1000) continue;

        const distanceToHighPct = high > 0 ? Math.max(0, ((high - price) / high) * 100) : 0;
        const distanceToLowPct = low > 0 ? Math.max(0, ((price - low) / low) * 100) : 0;
        const volatility24hPct = low > 0 ? Math.max(0, ((high - low) / low) * 100) : 0;

        coins.push({
          symbol,
          baseAsset: base,
          quoteAsset: 'USDT',
          exchange: 'binance',
          marketType: 'futures',
          price,
          change24h: Number(change24h.toFixed(2)),
          volumeUsd,
          high24h: high,
          low24h: low,
          distanceToHighPct: Number(distanceToHighPct.toFixed(2)),
          distanceToLowPct: Number(distanceToLowPct.toFixed(2)),
          volatility24hPct: Number(volatility24hPct.toFixed(2)),
          isNearHigh: distanceToHighPct <= 2.5,
          isNearLow: distanceToLowPct <= 2.5,
          isActiveCoin: (volatility24hPct >= 4 && volumeUsd >= 2_000_000) || Math.abs(change24h) >= 5,
          exchangeUrl: getExchangeUrl('binance', 'futures', symbol),
        });
      }

      if (coins.length > 0) {
        coins.sort((a, b) => b.volumeUsd - a.volumeUsd);
        return coins;
      }
    } catch {
      // Try next mirror
    }
  }

  return [];
}

/**
 * Direct client-side fetch from Bybit
 */
export async function fetchDirectBybitTickers(): Promise<MarketCoin[]> {
  const mirrors = [
    'https://api.bybit.com/v5/market/tickers?category=linear',
    'https://api.bytick.com/v5/market/tickers?category=linear',
  ];

  for (const url of mirrors) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const json = await res.json();
      const list = json?.result?.list;
      if (!Array.isArray(list)) continue;

      const coins: MarketCoin[] = [];
      for (const item of list) {
        if (!item.symbol || !item.symbol.endsWith('USDT')) continue;
        const symbol = item.symbol;
        const base = symbol.replace('USDT', '');
        const price = parseFloat(item.lastPrice) || 0;
        const volumeUsd = parseFloat(item.turnover24h) || 0;
        const change24h = (parseFloat(item.price24hPcnt) || 0) * 100;
        const high = parseFloat(item.highPrice24h) || price;
        const low = parseFloat(item.lowPrice24h) || price;

        if (price <= 0 || volumeUsd < 1000) continue;

        const distanceToHighPct = high > 0 ? Math.max(0, ((high - price) / high) * 100) : 0;
        const distanceToLowPct = low > 0 ? Math.max(0, ((price - low) / low) * 100) : 0;
        const volatility24hPct = low > 0 ? Math.max(0, ((high - low) / low) * 100) : 0;

        coins.push({
          symbol,
          baseAsset: base,
          quoteAsset: 'USDT',
          exchange: 'bybit',
          marketType: 'futures',
          price,
          change24h: Number(change24h.toFixed(2)),
          volumeUsd,
          high24h: high,
          low24h: low,
          distanceToHighPct: Number(distanceToHighPct.toFixed(2)),
          distanceToLowPct: Number(distanceToLowPct.toFixed(2)),
          volatility24hPct: Number(volatility24hPct.toFixed(2)),
          isNearHigh: distanceToHighPct <= 2.5,
          isNearLow: distanceToLowPct <= 2.5,
          isActiveCoin: (volatility24hPct >= 4 && volumeUsd >= 2_000_000) || Math.abs(change24h) >= 5,
          exchangeUrl: getExchangeUrl('bybit', 'futures', symbol),
        });
      }

      if (coins.length > 0) {
        coins.sort((a, b) => b.volumeUsd - a.volumeUsd);
        return coins;
      }
    } catch {
      // Try next mirror
    }
  }

  return [];
}

/**
 * Direct client-side fetch of Klines
 */
export async function fetchDirectKlines(
  exchange: ExchangeId,
  market: MarketType,
  symbol: string,
  timeframe: Timeframe,
  limit: number = 70
): Promise<Kline[]> {
  const safeLimit = Math.min(Math.max(limit, 10), 1000);

  if (exchange === 'bybit') {
    const interval = toBybitInterval(timeframe);
    const category = market === 'futures' ? 'linear' : 'spot';
    const mirrors = [
      `https://api.bybit.com/v5/market/kline?category=${category}&symbol=${symbol}&interval=${interval}&limit=${safeLimit}`,
      `https://api.bytick.com/v5/market/kline?category=${category}&symbol=${symbol}&interval=${interval}&limit=${safeLimit}`,
    ];

    for (const url of mirrors) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;
        const json = await res.json();
        const list = json?.result?.list;
        if (!Array.isArray(list) || list.length === 0) continue;

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
      } catch {
        // Try next
      }
    }
    return [];
  }

  // Binance
  const interval = toBinanceInterval(timeframe);
  const mirrors = [
    `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${safeLimit}`,
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${safeLimit}`,
    `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${safeLimit}`,
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${safeLimit}`,
  ];

  for (const url of mirrors) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      return data.map((d: any) => ({
        time: Math.floor(d[0] / 1000),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));
    } catch {
      // Try next
    }
  }

  return [];
}

/**
 * Direct client-side scan fallback
 */
export async function runDirectClientScan(params: {
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
  timeframe: Timeframe;
}): Promise<ScannedCoin[]> {
  try {
    const [binanceCoins, bybitCoins] = await Promise.all([
      params.exchange === 'all' || params.exchange === 'binance' ? fetchDirectBinanceTickers() : Promise.resolve([]),
      params.exchange === 'all' || params.exchange === 'bybit' ? fetchDirectBybitTickers() : Promise.resolve([]),
    ]);

    const allCoins = [...binanceCoins, ...bybitCoins];
    if (allCoins.length === 0) {
      return getFallbackScannedCoins(params.timeframe);
    }

    // Top 30 coins by volume for fast client pattern recognition
    const topCandidates = allCoins.slice(0, 30);
    const scanned: ScannedCoin[] = [];

    await Promise.all(
      topCandidates.map(async (coin) => {
        try {
          const klines = await fetchDirectKlines(coin.exchange, coin.marketType, coin.symbol, params.timeframe, 60);
          const formations = klines.length >= 20 ? detectFormations(klines, coin.symbol) : [];

          scanned.push({
            symbol: coin.symbol,
            baseAsset: coin.baseAsset,
            quoteAsset: coin.quoteAsset,
            exchange: coin.exchange,
            marketType: coin.marketType,
            currentPrice: coin.price,
            priceChange24h: coin.change24h,
            highPrice24h: coin.high24h,
            lowPrice24h: coin.low24h,
            volume24hUsd: coin.volumeUsd,
            formations,
            timeframe: params.timeframe,
            lastUpdated: Date.now(),
            exchangeUrl: coin.exchangeUrl,
          });
        } catch {
          // ignore individual coin fail
        }
      })
    );

    scanned.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
    return scanned.length > 0 ? scanned : getFallbackScannedCoins(params.timeframe);
  } catch (err) {
    console.warn('Client-side scan fallback error:', err);
    return getFallbackScannedCoins(params.timeframe);
  }
}

/**
 * Emergency static fallback coins (ensures coin search and selection ALWAYS work)
 */
export function getFallbackScannedCoins(timeframe: Timeframe = '1h'): ScannedCoin[] {
  return TOP_POPULAR_PAIRS.map((p, idx) => ({
    symbol: p.symbol,
    baseAsset: p.baseAsset,
    quoteAsset: 'USDT',
    exchange: 'binance',
    marketType: 'futures',
    currentPrice: idx === 0 ? 84500 : idx === 1 ? 2200 : idx === 2 ? 140 : 1.5,
    priceChange24h: 1.25,
    highPrice24h: idx === 0 ? 85500 : 2300,
    lowPrice24h: idx === 0 ? 83500 : 2150,
    volume24hUsd: 100_000_000 - idx * 2_000_000,
    formations: [],
    timeframe,
    lastUpdated: Date.now(),
    exchangeUrl: getExchangeUrl('binance', 'futures', p.symbol),
  }));
}

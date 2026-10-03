import type { ExchangeId, MarketType } from '../src/types';

export interface RawTicker {
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

export interface MarketSourceStatus {
  exchange: ExchangeId;
  marketType: MarketType;
  status: 'live' | 'stale' | 'unavailable';
  updatedAt: number | null;
  error?: string;
  httpStatus?: number;
}

interface FeedEntry {
  data: RawTicker[];
  updatedAt: number | null;
  retryAt: number;
  error?: string;
  httpStatus?: number;
  pending?: Promise<RawTicker[]>;
}

const FRESH_MS = 15_000;
const STALE_MS = 120_000;

/** Shares requests across screener, sentiment and formation scans. */
export class MarketTickerFeed {
  private entries = new Map<string, FeedEntry>();

  constructor(
    private request: typeof fetch = (input, init) => fetch(input, init),
    private now: () => number = Date.now,
  ) {}

  private entry(exchange: ExchangeId, market: MarketType): FeedEntry {
    const key = `${exchange}:${market}`;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { data: [], updatedAt: null, retryAt: 0 };
      this.entries.set(key, entry);
    }
    return entry;
  }

  status(exchange: ExchangeId, market: MarketType): MarketSourceStatus {
    const entry = this.entry(exchange, market);
    const age = entry.updatedAt === null ? Infinity : this.now() - entry.updatedAt;
    return {
      exchange, marketType: market,
      status: age < FRESH_MS && !entry.error ? 'live' : age < STALE_MS ? 'stale' : 'unavailable',
      updatedAt: entry.updatedAt,
      ...(entry.error ? { error: entry.error } : {}),
      ...(entry.httpStatus ? { httpStatus: entry.httpStatus } : {}),
    };
  }

  async get(exchange: ExchangeId, market: MarketType): Promise<RawTicker[]> {
    const entry = this.entry(exchange, market);
    if (entry.pending) return entry.pending;
    if (this.status(exchange, market).status === 'live') return entry.data;
    if (this.now() < entry.retryAt) {
      return this.status(exchange, market).status === 'unavailable' ? [] : entry.data;
    }
    entry.pending = this.load(exchange, market, entry);
    try { return await entry.pending; } finally { entry.pending = undefined; }
  }

  private async load(exchange: ExchangeId, market: MarketType, entry: FeedEntry): Promise<RawTicker[]> {
    const urls = exchange === 'binance'
      ? market === 'spot'
        ? ['https://data-api.binance.vision/api/v3/ticker/24hr', 'https://api.binance.com/api/v3/ticker/24hr']
        : ['https://fapi.binance.com/fapi/v1/ticker/24hr']
      : ['https://api.bybit.com', 'https://api.bytick.com']
        .map(host => `${host}/v5/market/tickers?category=${market === 'spot' ? 'spot' : 'linear'}`);
    let error = 'Біржа не відповідає або повернула некоректні дані';
    let httpStatus: number | undefined;
    let retryMs = 15_000;
    for (const url of urls) {
      try {
        const response = await this.request(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'SignalHook/1.0' },
          signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) {
          httpStatus = response.status;
          error = response.status === 403 || response.status === 451
            ? `Біржа обмежила доступ із регіону сервера (HTTP ${response.status})`
            : response.status === 429
              ? 'Перевищено ліміт запитів біржі (HTTP 429)'
              : `Помилка біржі (HTTP ${response.status})`;
          // Do not retry denied or rate-limited requests through another hostname.
          if ([403, 451, 429].includes(response.status)) {
            const retryAfter = response.headers.get('retry-after');
            const seconds = retryAfter === null ? NaN : Number(retryAfter);
            const retryDate = retryAfter ? Date.parse(retryAfter) : NaN;
            retryMs = response.status === 403 && exchange === 'bybit' ? 600_000 : 60_000;
            if (Number.isFinite(seconds) && seconds >= 0) retryMs = Math.max(retryMs, seconds * 1000);
            else if (Number.isFinite(retryDate)) retryMs = Math.max(retryMs, retryDate - this.now());
            break;
          }
          continue;
        }
        const json = await response.json();
        if (exchange === 'bybit' && json?.retCode !== 0) {
          error = `Помилка API Bybit (код ${json?.retCode ?? 'невідомий'})`;
          if (json?.retCode === 10006) { retryMs = 60_000; break; }
          continue;
        }
        const list = exchange === 'binance' ? json : json?.result?.list;
        if (!Array.isArray(list)) continue;
        const data = list.filter(item => typeof item?.symbol === 'string' && item.symbol.endsWith('USDT'))
          .map((item): RawTicker => ({
            symbol: item.symbol, baseAsset: item.symbol.slice(0, -4), quoteAsset: 'USDT', exchange, marketType: market,
            price: Number(item.lastPrice),
            change24h: exchange === 'binance' ? Number(item.priceChangePercent) : Number(item.price24hPcnt) * 100,
            volumeUsd: Number(exchange === 'binance' ? item.quoteVolume : item.turnover24h),
            high24h: Number(exchange === 'binance' ? item.highPrice : item.highPrice24h),
            low24h: Number(exchange === 'binance' ? item.lowPrice : item.lowPrice24h),
          }))
          .filter(t => Number.isFinite(t.price) && t.price > 0 && Number.isFinite(t.volumeUsd) && t.volumeUsd >= 0
            && Number.isFinite(t.change24h) && Number.isFinite(t.high24h) && Number.isFinite(t.low24h))
          .sort((a, b) => b.volumeUsd - a.volumeUsd);
        entry.data = data;
        entry.updatedAt = this.now();
        entry.retryAt = 0;
        entry.error = undefined;
        entry.httpStatus = undefined;
        return data;
      } catch { /* Temporary network errors may use the documented backup. */ }
    }
    entry.error = error;
    entry.httpStatus = httpStatus;
    entry.retryAt = this.now() + retryMs;
    return this.status(exchange, market).status === 'unavailable' ? [] : entry.data;
  }
}

export const marketTickerFeed = new MarketTickerFeed();

export function getMarketSourceStatuses(params: {
  exchange?: 'all' | ExchangeId;
  marketType?: 'all' | MarketType;
}): MarketSourceStatus[] {
  const exchanges: ExchangeId[] = params.exchange && params.exchange !== 'all' ? [params.exchange] : ['binance', 'bybit'];
  const markets: MarketType[] = params.marketType && params.marketType !== 'all' ? [params.marketType] : ['futures', 'spot'];
  return exchanges.flatMap(exchange => markets.map(market => marketTickerFeed.status(exchange, market)));
}

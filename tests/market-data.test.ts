import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketTickerFeed } from '../server/marketTickerFeed';
import { fetchMarketCoins } from '../server/marketService';
import { loadMarketCoins } from '../src/utils/marketCoinLoader';
import { fetchDirectBinanceTickers, fetchDirectBybitTickers } from '../src/utils/directExchangeClient';
import type { MarketCoin } from '../src/types';

const binanceTicker = { symbol: 'BTCUSDT', lastPrice: '100', priceChangePercent: '2', quoteVolume: '1000', highPrice: '102', lowPrice: '98' };
const bybitTicker = { symbol: 'BTCUSDT', lastPrice: '100', price24hPcnt: '0.02', turnover24h: '1000', highPrice24h: '102', lowPrice24h: '98' };
const json = (data: unknown, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', ...headers },
});

test('ticker requests coalesce; cache keeps actual quote time and stale data expires', async () => {
  let clock = 1000;
  let calls = 0;
  let fail = false;
  const feed = new MarketTickerFeed(async () => {
    calls++;
    return fail ? json({}, 503) : json([binanceTicker]);
  }, () => clock);
  const [first, concurrent] = await Promise.all([feed.get('binance', 'futures'), feed.get('binance', 'futures')]);
  assert.deepEqual(first, concurrent);
  assert.equal(first.length, 1);
  assert.equal(calls, 1);
  clock = 2000;
  await feed.get('binance', 'futures');
  assert.equal(calls, 1);
  assert.equal(feed.status('binance', 'futures').updatedAt, 1000);
  clock = 17_000;
  fail = true;
  assert.deepEqual(await feed.get('binance', 'futures'), first);
  assert.equal(feed.status('binance', 'futures').status, 'stale');
  assert.equal(feed.status('binance', 'futures').updatedAt, 1000);
  await feed.get('binance', 'futures');
  assert.equal(calls, 2, 'failure cooldown prevents repeated requests');
  clock = 122_000;
  assert.deepEqual(await feed.get('binance', 'futures'), []);
  assert.equal(feed.status('binance', 'futures').status, 'unavailable');
});

test('regional denial and rate limit stop mirror retries; retry-after is respected', async () => {
  for (const code of [403, 451, 429]) {
    let clock = 1000;
    let calls = 0;
    const feed = new MarketTickerFeed(async () => {
      calls++;
      return json({}, code, { 'retry-after': '120' });
    }, () => clock);
    assert.deepEqual(await feed.get('bybit', 'spot'), []);
    assert.equal(calls, 1);
    assert.equal(feed.status('bybit', 'spot').httpStatus, code);
    clock += 60_000;
    await feed.get('bybit', 'spot');
    assert.equal(calls, 1);
  }
});

test('Bybit API error is unavailable, not an empty successful market', async () => {
  const feed = new MarketTickerFeed(async () => json({ retCode: 10006, result: { list: [] } }));
  assert.deepEqual(await feed.get('bybit', 'futures'), []);
  assert.equal(feed.status('bybit', 'futures').status, 'unavailable');
  assert.match(feed.status('bybit', 'futures').error!, /10006/);
});

test('valid empty markets are successful and malformed quotes never enter results', async () => {
  const feed = new MarketTickerFeed(async () => json([{ ...binanceTicker, lastPrice: 'Infinity' }]));
  assert.deepEqual(await feed.get('binance', 'spot'), []);
  assert.equal(feed.status('binance', 'spot').status, 'live');
  const empty = await loadMarketCoins({ exchange: 'binance', marketType: 'spot' }, new AbortController().signal, {
    request: async () => json({ success: true, data: [], timestamp: 10 }),
    binance: async () => { throw new Error('should not fall back for a valid empty response'); },
    bybit: async () => { throw new Error('wrong exchange'); },
  });
  assert.deepEqual(empty, { coins: [], timestamp: 10, warning: null });
});

test('partial backend snapshots expose failed sources and original quote time', async () => {
  const snapshot = await loadMarketCoins({ exchange: 'all', marketType: 'all' }, new AbortController().signal, {
    request: async () => json({ success: true, data: [], timestamp: 1234,
      sources: [{ exchange: 'bybit', marketType: 'futures', status: 'unavailable', error: 'HTTP 403' }] }),
    binance: async () => [], bybit: async () => [],
  });
  assert.equal(snapshot.timestamp, 1234);
  assert.match(snapshot.warning!, /Bybit Futures.*HTTP 403/);
});

test('direct fallback requests only the selected exchange and market with zero volume floor', async () => {
  let calls = 0;
  const coin = { symbol: 'BTCUSDT', exchange: 'binance', marketType: 'spot', volumeUsd: 1000 } as MarketCoin;
  const snapshot = await loadMarketCoins({ exchange: 'binance', marketType: 'spot' }, new AbortController().signal, {
    request: async () => { throw new Error('network'); },
    binance: async (options = {}) => {
      calls++;
      assert.equal(options.marketType, 'spot');
      assert.equal(options.minVolumeUsd, 0);
      assert.ok(options.signal);
      return [coin, { ...coin, marketType: 'futures' }];
    },
    bybit: async () => { throw new Error('wrong exchange'); },
  });
  assert.deepEqual(snapshot.coins, [coin]);
  assert.equal(calls, 1);
});

test('cancelled old selections never start fallback; complete failure preserves the provider reason', async () => {
  const controller = new AbortController();
  const pending = loadMarketCoins({ exchange: 'all', marketType: 'all' }, controller.signal, {
    request: async () => { controller.abort(); throw new Error('aborted'); },
    binance: async () => { throw new Error('fallback must not start'); },
    bybit: async () => { throw new Error('fallback must not start'); },
  });
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(loadMarketCoins({ exchange: 'all', marketType: 'all' }, new AbortController().signal, {
    request: async () => json({ success: false, error: 'Bybit: HTTP 403' }, 503),
    binance: async () => [], bybit: async () => [],
  }), /Bybit: HTTP 403/);
});

test('direct spot fallback skips futures and retains small-volume quotes', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async input => {
    urls.push(String(input));
    return String(input).includes('bybit') ? json({ retCode: 0, result: { list: [bybitTicker] } }) : json([binanceTicker]);
  };
  try {
    const binance = await fetchDirectBinanceTickers({ marketType: 'spot', minVolumeUsd: 0 });
    const bybit = await fetchDirectBybitTickers({ marketType: 'spot', minVolumeUsd: 0 });
    assert.equal(binance.length, 1);
    assert.equal(bybit.length, 1);
    assert.equal(urls.length, 2);
    assert.ok(urls.every(url => !url.includes('fapi') && !url.includes('linear')));
  } finally { globalThis.fetch = originalFetch; }
});

test('quote loading returns while optional 5m enrichment is still pending', async () => {
  const originalFetch = globalThis.fetch;
  const pending: (() => void)[] = [];
  let enrichmentFinished = false;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes('/klines') || url.includes('/kline') || url.includes('windowSize=')) {
      await new Promise<void>(resolve => pending.push(resolve));
      enrichmentFinished = true;
      return json([]);
    }
    return url.includes('/v5/') ? json({ retCode: 0, result: { list: [bybitTicker] } }) : json([binanceTicker]);
  };
  try {
    const snapshot = await fetchMarketCoins({ exchange: 'all', marketType: 'all', minVolumeUsd: 0 });
    assert.equal(snapshot.length, 4);
    assert.equal(enrichmentFinished, false);
    // Allow the enrichment tasks to reach their deliberately suspended requests.
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(pending.length > 0);
  } finally {
    pending.forEach(resolve => resolve());
    // Enrichment consumes the released mock responses before restoring real fetch.
    await new Promise(resolve => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
  }
});

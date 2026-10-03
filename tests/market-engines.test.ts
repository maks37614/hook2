import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { normalizeKlineTimeMs, validateFormation } from '../src/utils/formationValidation';
import { detectFormations } from '../src/utils/patternRecognition';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';
import { ExchangeStreamClient } from '../server/surveillance/exchangeStream';
import { MultiTimeframeEngine } from '../server/surveillance/multiTimeframeEngine';
import { fetchOrderBook, fetchRecentTrades } from '../server/marketService';
import type { DetectedFormation, Kline } from '../src/types';

const candles = (): Kline[] => Array.from({ length: 40 }, (_, i) => ({
  time: Math.floor(Date.now() / 1000) - (41 - i) * 3600,
  open: 99, high: 100, low: 98, close: 99, volume: 100,
}));
const pattern = (overrides: Partial<DetectedFormation> = {}): DetectedFormation => ({
  id: 'BTC-double-bottom-closed-anchor', patternKey: 'double_bottom', name: 'W', nameEn: 'W',
  bias: 'bullish', category: 'reversal', confidence: 80, status: 'breakout', statusLabel: 'Breakout',
  description: '', detectedAt: 0, candleStartIndex: 20, candleEndIndex: 39, structureEndIndex: 35,
  levels: { entryPrice: 100, stopLossPrice: 98, targetPrice: 110, necklinePrice: 100 },
  riskRewardRatio: 5, potentialProfitPct: 10, potentialRiskPct: 2, ...overrides,
});

test('seconds and milliseconds describe the same closed candles and signal', () => {
  const data = candles();
  data[39] = { ...data[39], high: 102, close: 101, volume: 200 };
  const seconds = validateFormation(data, pattern());
  const milliseconds = validateFormation(data.map(c => ({ ...c, time: c.time * 1000 })), pattern());
  assert.equal(normalizeKlineTimeMs(data[0].time), normalizeKlineTimeMs(data[0].time * 1000));
  assert.equal(seconds.validation?.passed, true);
  assert.deepEqual(milliseconds.validation, seconds.validation);
});

test('live candles, future indices and crossings before the second pivot cannot confirm an entry', () => {
  const data = candles();
  data[25] = { ...data[25], high: 102, close: 101 };
  assert.equal(validateFormation(data, pattern()).validation?.breakoutConfirmed, false);
  assert.equal(validateFormation(data, pattern({ candleEndIndex: 45 })).validation?.lookAheadSafe, false);
  data[39] = { ...data[39], time: Math.floor(Date.now() / 3600000) * 3600, high: 102, close: 101 };
  assert.equal(validateFormation(data, pattern()).validation?.passed, false);
});

test('a weak measured target is rejected without changing it to manufacture R:R', () => {
  const data = candles();
  data[39] = { ...data[39], high: 102, close: 101, volume: 200 };
  const result = validateFormation(data, pattern({
    levels: { entryPrice: 100, stopLossPrice: 95, targetPrice: 102, necklinePrice: 100 },
  }));
  assert.equal(result.levels.targetPrice, 102);
  assert.equal(result.levels.stopLossPrice, 95);
  assert.equal(result.validation?.passed, false);
  assert.ok(result.riskRewardRatio < 2);
});

test('fulfilled targets and failed breakouts are not actionable', () => {
  const data = candles();
  data[37] = { ...data[37], high: 102, close: 101 };
  assert.equal(validateFormation(data, pattern()).validation?.passed, false);
  data[39] = { ...data[39], high: 112, close: 111, volume: 200 };
  assert.equal(validateFormation(data, pattern()).validation?.passed, false);
});

test('micro-priced formations retain positive levels', () => {
  const data = candles().map(c => ({ ...c, open: c.open * 1e-10, high: c.high * 1e-10,
    low: c.low * 1e-10, close: c.close * 1e-10 }));
  data[39] = { ...data[39], open: 9.85e-9, close: 9.95e-9, high: 9.97e-9, low: 9e-9 };
  const found = detectFormations(data, 'MICROUSDT');
  assert.ok(found.some(f => f.patternKey === 'hammer'));
  for (const f of found) assert.ok(f.levels.entryPrice > 0 && f.levels.stopLossPrice > 0);
});

test('trade ticks update the REST candle instead of appending a duplicate interval', () => {
  const engine = new MultiTimeframeEngine();
  const time = Math.floor(Date.now() / 3600000) * 3600000;
  engine.setCandles('1h', [{ time: time / 1000, open: 100, high: 101, low: 99, close: 100, volume: 10 }]);
  engine.updateWithTrade({ time: time + 1000, price: 102, quantity: 2, side: 'BUY', isBuyerMaker: false });
  assert.equal(engine.getCandles('1h').length, 1);
  assert.equal(engine.getCandles('1h')[0].close, 102);
  assert.equal(engine.getCandles('1h')[0].volume, 12);
});

test('Binance futures combined depth frames produce a complete snapshot', () => {
  const stream = Object.assign(new EventEmitter(), { exchange: 'binance', status: 'SYNCING' });
  Object.setPrototypeOf(stream, ExchangeStreamClient.prototype);
  let depth: any;
  stream.on('depth', (d: any) => depth = d);
  (stream as any).handleIncomingMessage({ stream: 'btcusdt@depth20@100ms', data: {
    e: 'depthUpdate', u: 100, b: [['100', '20']], a: [['101', '2']],
  } });
  assert.deepEqual(depth.bids, [[100, 20]]);
  assert.equal(depth.isSnapshot, true);
  assert.equal(depth.sequence, 100);
});

test('order book needs a snapshot and ignores duplicate deltas without going stale', () => {
  const book = new OrderBookEngine('BTCUSDT', 'bybit', 'futures');
  book.applyDepth({ sequence: 1, bids: [[100, 20]], asks: [[101, 2]] });
  assert.equal(book.dataValid, false);
  book.applyDepth({ isSnapshot: true, sequence: 2, bids: [[100, 20]], asks: [[101, 2]] });
  book.applyDepth({ sequence: 2, bids: [[100, 0]], asks: [] });
  assert.equal(book.bestBid, 100);
  assert.equal(book.dataValid, true);
  book.applyDepth({ sequence: 3, bids: [[NaN, 10]], asks: [] });
  assert.equal(book.bestBid, 100);
});

test('manual densities use configured thresholds, disappear and can reappear', () => {
  const book = new OrderBookEngine('BTCUSDT', 'binance', 'futures', {
    mode: 'MANUAL', manualThresholdUsd: 1000, minPersistenceSeconds: 15, minDistancePct: 0.1,
  });
  const update = (qty: number, sequence: number) => book.applyDepth({ isSnapshot: true, sequence,
    bids: [[100, qty], [99, 1]], asks: [[101, 2]] });
  update(20, 1);
  assert.equal(book.getDensities().length, 1);
  assert.equal(book.pollNewlyAppearedDensities().length, 1);
  update(1, 2);
  assert.equal(book.getDensities().length, 0);
  update(20, 3);
  assert.equal(book.pollNewlyAppearedDensities().length, 1);
  book.updateConfig({ manualThresholdUsd: 3000 });
  update(20, 4);
  assert.equal(book.getDensities().length, 0);
});

test('unavailable Bybit data cannot be replaced with a Binance book or trade tape', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async input => { urls.push(String(input)); return new Response('{}', { status: 503 }); };
  try {
    assert.deepEqual((await fetchOrderBook('bybit', 'futures', 'BTCUSDT')).bids, []);
    assert.deepEqual(await fetchRecentTrades('bybit', 'futures', 'BTCUSDT'), []);
    assert.ok(urls.length > 0);
    assert.ok(urls.every(url => !url.includes('binance')));
  } finally { globalThis.fetch = originalFetch; }
});

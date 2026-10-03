import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { normalizeKlineTimeMs, validateFormation } from '../src/utils/formationValidation';
import { detectFormations } from '../src/utils/patternRecognition';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';
import { ExchangeStreamClient } from '../server/surveillance/exchangeStream';
import { MultiTimeframeEngine } from '../server/surveillance/multiTimeframeEngine';
import { LevelsAndFormationsEngine, toSurveillancePattern } from '../server/surveillance/levelsAndFormationsEngine';
import { SetupEngine } from '../server/surveillance/setupEngine';
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

test('a target or stop touched after entry invalidates a formation even after price recovers', () => {
  for (const touched of ['target', 'stop'] as const) {
    const data = candles();
    for (let i = 37; i < data.length; i++) {
      data[i] = { ...data[i], open: 101, high: 102, low: 100, close: 101, volume: 200 };
    }
    data[38] = { ...data[38], high: touched === 'target' ? 111 : 102, low: touched === 'stop' ? 97 : 100 };
    const result = validateFormation(data, pattern());
    assert.equal(result.validation?.breakoutConfirmed, true);
    assert.equal(result.validation?.passed, false, touched);
    assert.ok(result.validation?.rejectionReasons.some(reason => /Ціль|Стоп/.test(reason)), touched);
  }
});

test('bearish entries reject historical target/stop wicks but ignore wicks before entry', () => {
  const short = pattern({ bias: 'bearish', levels: { entryPrice: 99, stopLossPrice: 102, targetPrice: 90, necklinePrice: 99 } });
  for (const touched of ['target', 'stop'] as const) {
    const data = candles().map(c => ({ ...c, open: 100, high: 101, low: 99, close: 100 }));
    for (let i = 37; i < data.length; i++) data[i] = { ...data[i], open: 98, high: 99, low: 97, close: 98, volume: 200 };
    data[38] = { ...data[38], low: touched === 'target' ? 89 : 97, high: touched === 'stop' ? 103 : 99 };
    assert.equal(validateFormation(data, short).validation?.passed, false, touched);
  }
  const data = candles();
  data[30] = { ...data[30], high: 111 };
  data[39] = { ...data[39], high: 111, close: 101, volume: 200 };
  assert.equal(validateFormation(data, pattern()).validation?.passed, true);
});

test('a stop before the target or in the same candle is never labelled as a successful target', () => {
  for (const sameBar of [false, true]) {
    const data = candles();
    for (let i = 37; i < data.length; i++) data[i] = { ...data[i], open: 101, high: 102, low: 100, close: 101, volume: 200 };
    data[38].low = 97;
    data[sameBar ? 38 : 39].high = 111;
    const result = validateFormation(data, pattern());
    assert.equal(result.validation?.passed, false);
    assert.notEqual(result.status, 'target_reached');
    assert.match(result.statusLabel, /стоп/);
  }
});

const setupContext = () => ({
  symbol: 'BTCUSDT', exchange: 'binance' as const, marketType: 'futures' as const, currentPrice: 101,
  structures: Object.fromEntries(['1d', '4h', '1h', '15m', '5m'].map(timeframe => [timeframe, {
    timeframe, trend: 'BULLISH', score: 100, recentSwings: [], higherHighsCount: 4,
    lowerHighsCount: 0, higherLowsCount: 4, lowerLowsCount: 0,
    lastBreak: { type: 'BOS', direction: 'BULLISH', price: 101, brokenSwingPrice: 100,
      time: Date.now() - 1000, timeframe, confirmed: true, volumeConfirmed: true },
  }])) as any,
  zones: [], thirdTouches: [], rvol: 2, orderBookImbalance: 0.4,
  densities: [{ id: 'bid', price: 100, side: 'BID', quantity: 1000, notionalUsd: 100000,
    distancePct: 1, firstSeenAt: 0, lastSeenAt: Date.now(), ageSeconds: 100, maxSizeUsd: 100000,
    averageSizeUsd: 100000, persistenceRatio: 1, classification: 'PERSISTENT_LIQUIDITY', qualityScore: 100 }] as any,
  tradeFlow: { aggressiveBuyUsd: 200000, aggressiveSellUsd: 100000, imbalanceRatio: 2,
    largeTradeCount: 10, totalTradeCount: 30, averageTradeSizeUsd: 10000, recentTradesWindowMs: 60000,
    deltaZScore: 2, deltaAcceleration: 1 },
  oiSnapshot: { currentUsd: 1000000, amountCoins: 10000, change1mPct: 1, change5mPct: 2,
    change15mPct: 3, change1hPct: 4, change4hPct: 5, regime: 'PRICE_UP_OI_UP' as const, isAnomaly: false },
  btcContext: { currentPrice: 100, trend1d: 'Bullish', trend4h: 'Bullish', trend1h: 'Bullish',
    trend15m: 'Bullish', btcDominance: 50, btcDominanceRegime: 'range', totalMarketCapUsd: 1e12,
    totalMarketCapRegime: 'expansion', correlationAltBtc: 1, relativeStrength: 'STRONG', lastUpdated: Date.now() } as any,
});

test('surveillance confirms valid formations with their measured entry, stop and target', () => {
  const data = candles();
  data[39] = { ...data[39], high: 102, close: 101, volume: 200 };
  const formation = validateFormation(data, pattern());
  assert.equal(formation.validation?.passed, true);
  const result = new SetupEngine().evaluateSetups({ ...setupContext(), patterns: [toSurveillancePattern(formation)] });
  assert.equal(result.length, 1);
  assert.equal(result[0].stage, 'CONFIRMED');
  assert.equal(result[0].preferredEntry, formation.levels.entryPrice);
  assert.equal(result[0].invalidationPrice, formation.levels.stopLossPrice);
  assert.equal(result[0].targetPrice, formation.levels.targetPrice);
});

test('surveillance rejects failed formations despite confirmed breakouts and strong external evidence', () => {
  const data = candles();
  data[39] = { ...data[39], high: 102, close: 101, volume: 200 };
  const invalid = validateFormation(data, pattern({ levels: { entryPrice: 100, stopLossPrice: 95, targetPrice: 102, necklinePrice: 100 } }));
  assert.equal(invalid.validation?.breakoutConfirmed, true);
  assert.equal(invalid.validation?.passed, false);
  const mapped = toSurveillancePattern(invalid);
  assert.equal(mapped.status, 'INVALIDATED');
  assert.deepEqual(new SetupEngine().evaluateSetups({ ...setupContext(), patterns: [mapped] }), []);
});

test('setup engine cannot inflate weak measured R:R or confirm future structural breaks', () => {
  const data = candles();
  data[39] = { ...data[39], high: 102, close: 101, volume: 200 };
  const mapped = toSurveillancePattern(validateFormation(data, pattern()));
  const weak = { ...mapped, levels: { entryPrice: 101, stopLossPrice: 95, targetPrice: 102 } };
  const weakResult = new SetupEngine().evaluateSetups({ ...setupContext(), patterns: [weak] });
  assert.equal(weakResult[0].targetPrice, 102);
  assert.ok(weakResult[0].entryQuality!.riskReward < 2);
  assert.notEqual(weakResult[0].stage, 'CONFIRMED');
  const context = setupContext();
  for (const structure of Object.values(context.structures) as any[]) structure.lastBreak.time = Date.now() + 3600000;
  assert.notEqual(new SetupEngine().evaluateSetups({ ...context, patterns: [mapped] })[0].stage, 'CONFIRMED');
});

test('distinct micro-price support/resistance zones retain distinct identities', () => {
  const data = Array.from({ length: 40 }, (_, i) => ({
    time: (1700000000 + i * 3600) * 1000, open: (100 + Math.sin(i) * 10) * 1e-10,
    high: (101 + Math.sin(i) * 10) * 1e-10, low: (99 + Math.sin(i) * 10) * 1e-10,
    close: (100 + Math.sin(i) * 10) * 1e-10, volume: 100,
  }));
  data[15].low = 80e-10;
  const zones = new LevelsAndFormationsEngine('BACKTEST').findSupportResistanceZones([], [], data);
  assert.ok(zones.filter(z => z.type === 'SUPPORT').length >= 2);
  assert.equal(new Set(zones.map(z => z.id)).size, zones.length);
});

test('micro-price proximity filters use percentages instead of an absolute price floor', () => {
  const context = setupContext();
  const mapped = toSurveillancePattern(pattern());
  mapped.status = 'BROKEN';
  mapped.validationPassed = true;
  mapped.upperBoundary = 2e-11;
  mapped.lowerBoundary = 1e-11;
  mapped.levels = { entryPrice: 1e-11, stopLossPrice: 5e-12, targetPrice: 3e-11 };
  assert.deepEqual(new SetupEngine().evaluateSetups({ ...context, currentPrice: 1e-11, patterns: [mapped] }), []);
});

test('destroying a websocket during its opening handshake does not crash the server', () => {
  const moduleUrl = new URL('../server/surveillance/exchangeStream.ts', import.meta.url).href;
  const script = `import WebSocket from 'ws'; import { EventEmitter } from 'node:events';
    const { ExchangeStreamClient } = await import(${JSON.stringify(moduleUrl)});
    const stream = Object.assign(new EventEmitter(), { ws: new WebSocket('ws://127.0.0.1:1') });
    Object.setPrototypeOf(stream, ExchangeStreamClient.prototype);
    stream.destroy(); await new Promise(resolve => setImmediate(resolve));`;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 15000,
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
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

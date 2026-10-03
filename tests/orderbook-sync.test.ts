import test from 'node:test';
import assert from 'node:assert/strict';
import { BinanceOrderBookSync, binanceStreamUrls, BookUpdate } from '../src/utils/binanceOrderBook';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';

test('futures use separate public depth and market trade/ticker endpoints', () => {
  const urls = binanceStreamUrls('BTCUSDT', 'futures');
  assert.ok(urls[0].includes('/public/stream?streams=btcusdt@depth@100ms'));
  assert.ok(urls[1].includes('/market/stream?streams=btcusdt@ticker/btcusdt@aggTrade'));
});

test('futures snapshot bridges buffered deltas and resyncs on a pu gap', () => {
  const updates: BookUpdate[] = [];
  let resyncs = 0;
  const sync = new BinanceOrderBookSync('futures', d => updates.push(d), () => resyncs++);
  sync.push({ U: 95, u: 103, pu: 94, b: [['100', '20']], a: [] });
  assert.equal(updates.length, 0);
  sync.setSnapshot({ sequence: 100, bids: [[100, 1], [99, 50]], asks: [[101, 2]] });
  assert.equal(updates.length, 2);
  assert.equal(updates[0].isSnapshot, true);
  assert.equal(updates[1].sequence, 103);
  sync.push({ U: 104, u: 105, pu: 103, b: [['100', '0']], a: [] });
  assert.equal(updates.length, 3);
  sync.push({ U: 109, u: 110, pu: 108, b: [['98', '999']], a: [] });
  assert.equal(resyncs, 1);
  assert.equal(updates.length, 3);
  sync.setSnapshot({ sequence: 109, bids: [[99, 50]], asks: [[101, 2]] });
  assert.equal(updates.at(-1)?.sequence, 110);
});

test('spot ignores obsolete updates and refuses a snapshot that cannot bridge', () => {
  const updates: BookUpdate[] = [];
  let resyncs = 0;
  const sync = new BinanceOrderBookSync('spot', d => updates.push(d), () => resyncs++);
  sync.push({ U: 90, u: 99, b: [], a: [] });
  sync.push({ U: 100, u: 102, b: [['100', '5']], a: [] });
  sync.setSnapshot({ sequence: 100, bids: [[100, 1]], asks: [[101, 1]] });
  assert.equal(updates.length, 2);
  sync.push({ U: 100, u: 102, b: [['100', '999']], a: [] });
  assert.equal(updates.length, 2);
  sync.push({ U: 105, u: 106, b: [['100', '0']], a: [] });
  assert.equal(resyncs, 1);
  assert.equal(sync.needsSnapshot, true);
});

test('full snapshot detects a wall beyond the displayed top 20 levels', () => {
  const book = new OrderBookEngine('TESTUSDT', 'binance', 'futures', {
    mode: 'MANUAL', manualThresholdUsd: 5000, minPersistenceSeconds: 15, minDistancePct: 0.1,
  });
  const sync = new BinanceOrderBookSync('futures', d => book.applyDepth(d), () => book.setStatus('RESYNCING'));
  sync.push({ U: 99, u: 101, pu: 98, b: [], a: [] });
  sync.setSnapshot({ sequence: 100, bids: Array.from({ length: 50 }, (_, i) => [100 - i * 0.1, i === 40 ? 100 : 1]),
    asks: [[100.1, 1]] });
  assert.equal(book.getState().bids.length, 20);
  assert.equal(book.getDensities()[0].price, 96);
  sync.push({ U: 102, u: 103, pu: 101, b: [['96', '0']], a: [] });
  assert.equal(book.getDensities().length, 0);
});

test('AUTO finds an outlier wall without using that wall as its own baseline', () => {
  const book = new OrderBookEngine('TESTUSDT', 'binance', 'futures');
  book.applyDepth({ isSnapshot: true, sequence: 1, bids: [[100, 1000], [99, 2]], asks: [[101, 2], [102, 2]] });
  assert.equal(book.getDensities().length, 1);
  assert.equal(book.getDensities()[0].price, 100);
  book.setVolume24hUsd(2_000_000_000);
  assert.equal(book.getDensities().length, 0);
});

test('manual edits recalculate immediately; HYBRID never lowers the manual floor', () => {
  const book = new OrderBookEngine('TESTUSDT', 'binance', 'futures');
  book.applyDepth({ isSnapshot: true, sequence: 1, bids: [[100, 20], [99, 1]], asks: [[101, 1]] });
  book.updateConfig({ mode: 'MANUAL', manualThresholdUsd: 1000 });
  assert.equal(book.getDensities().length, 1);
  book.updateConfig({ manualThresholdUsd: 3000 });
  assert.equal(book.getDensities().length, 0);
  book.updateConfig({ mode: 'HYBRID', manualThresholdUsd: 5000 });
  assert.ok(book.calculateAdaptiveThreshold() >= 5000);
});

test('density persistence starts over after an interruption or resync', () => {
  const book = new OrderBookEngine('TESTUSDT', 'binance', 'futures', {
    mode: 'MANUAL', manualThresholdUsd: 1000, minPersistenceSeconds: 15, minDistancePct: 0.1,
  });
  book.applyDepth({ isSnapshot: true, sequence: 1, bids: [[100, 20]], asks: [[101, 1]] });
  book.setStatus('RESYNCING');
  assert.deepEqual(book.getDensities(), []);
  book.applyDepth({ isSnapshot: true, sequence: 2, bids: [[100, 20]], asks: [[101, 1]] });
  assert.equal(book.getDensities()[0].ageSeconds, 0);
  assert.notEqual(book.getDensities()[0].classification, 'PERSISTENT_LIQUIDITY');
});

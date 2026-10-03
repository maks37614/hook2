import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { SurveillanceCoin } from '../src/types';
import { getTimeframeMs } from '../server/surveillance/multiTimeframeEngine';

const originalCwd = process.cwd();
const fixtureDir = fs.mkdtempSync(path.join(originalCwd, '.test-surveillance-'));
process.chdir(fixtureDir);
const service = await import('../server/surveillanceService');
const { SurveillanceManager } = await import('../server/surveillance/surveillanceManager');
process.chdir(originalCwd);
test.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));

const coin: SurveillanceCoin = {
  id: 'owned-coin', userId: 'owner', symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
  exchange: 'binance', marketType: 'futures', isActive: false, createdAt: '', updatedAt: '',
  config: service.getDefaultSurveillanceConfig(),
};

test('coin lookup and pause operations cannot fall back to another user', () => {
  service.saveSurveillanceList('owner', [coin]);
  assert.equal(service.findSurveillanceCoinById(coin.id, 'another-user'), null);
  assert.equal(service.findSurveillanceCoinById(coin.id), null);
  assert.equal(service.updateSurveillanceCoinActive(coin.id, false, 'another-user'), null);
  assert.equal(service.findSurveillanceCoinById(coin.id, 'owner')?.coin.id, coin.id);
});

test('new and empty user lists never inherit the guest BTC selection', () => {
  service.saveSurveillanceList('guest', [{ ...coin, userId: 'guest' }]);
  assert.deepEqual(service.loadSurveillanceList('new-user'), []);
  service.saveSurveillanceList('owner', []);
  assert.deepEqual(service.loadSurveillanceList('owner'), []);
  assert.deepEqual(service.loadSurveillanceList('owner'), []);
  assert.equal(service.loadSurveillanceList('guest').length, 1);
});

test('late analysis cannot restore a deleted coin or discard a newer selection', () => {
  service.saveSurveillanceList('owner', [coin]);
  const captured = structuredClone(coin);
  const chosen = { ...coin, id: 'new-choice', symbol: 'SOLUSDT' };
  service.saveSurveillanceList('owner', [chosen]);
  assert.equal(service.commitSurveillanceCheck(captured), null);
  assert.deepEqual(service.loadSurveillanceList('owner').map(c => c.id), [chosen.id]);
});

test('late analysis respects current pause and density settings', () => {
  const active = { ...coin, isActive: true };
  service.saveSurveillanceList('owner', [active]);
  const captured = structuredClone(active);
  service.saveSurveillanceList('owner', [{ ...active, isActive: false,
    config: { ...active.config, densityMode: 'MANUAL', manualDensityThresholdUsd: 2500 } }]);
  const committed = service.commitSurveillanceCheck(captured)!;
  assert.equal(committed.isActive, false);
  assert.equal(committed.config.manualDensityThresholdUsd, 2500);
});

test('invalid density modes, thresholds and candle settings are rejected', () => {
  assert.ok(service.validateSurveillanceConfig({ manualDensityThresholdUsd: 0 }));
  assert.ok(service.validateSurveillanceConfig({ manualDensityThresholdUsd: NaN }));
  assert.ok(service.validateSurveillanceConfig({ densityMode: 'BAD' as any }));
  assert.ok(service.validateSurveillanceConfig({ momentumBars: 1.5 }));
  assert.equal(service.validateSurveillanceConfig({ densityMode: 'MANUAL', manualDensityThresholdUsd: 1000 }), null);
});

test('worker snapshot lists expose only the requested user, including guest requests', () => {
  const manager = Object.create(SurveillanceManager.prototype);
  manager.workers = new Map(['owner', 'another-user', 'guest'].map(userId => [userId, {
    coin: { userId }, getSnapshot: () => ({ userId }),
  }]));
  assert.deepEqual(manager.getAllSnapshots('owner'), [{ userId: 'owner' }]);
  assert.deepEqual(manager.getAllSnapshots('guest'), [{ userId: 'guest' }]);
});

const mockKlines = (breakClosed = false, breakLive = false) => {
  const source: any = {};
  for (const tf of ['1d', '4h', '1h', '15m'] as const) {
    const step = getTimeframeMs(tf);
    const start = Math.floor(Date.now() / step) * step - 59 * step;
    source[tf] = Array.from({ length: 60 }, (_, i) => ({ time: (start + i * step) / 1000,
      open: 99, high: 100, low: 98, close: 99, volume: 100 }));
  }
  if (breakClosed) source['15m'][58] = { ...source['15m'][58], close: 103, high: 104 };
  if (breakLive) source['15m'][59] = { ...source['15m'][59], close: 110, high: 111 };
  return source;
};
const responseFor = (source: any, url: string) => {
  const tf = new URL(url).searchParams.get('interval')!;
  return Response.json(source[tf].map((c: any) => [c.time * 1000, String(c.open), String(c.high), String(c.low), String(c.close), String(c.volume)]));
};

test('bar-close alerts use the closed price and prior levels, and a candle is processed once', async () => {
  const originalFetch = globalThis.fetch;
  const source = mockKlines(true);
  const config = { ...coin.config, triggerModes: ['bar_close_15m'] as const };
  const state = await service.calculateSurveillanceState('CLOSEDUSDT', 'binance', 'futures', config as any, source);
  const tracked: SurveillanceCoin = { ...coin, id: 'closed-candle', symbol: 'CLOSEDUSDT',
    config: config as any, state: { ...state!, lastProcessedCandleTimes: { '15m': source['15m'][57].time * 1000, '1h': 0, '4h': 0 } } };
  service.saveSurveillanceList('owner', [tracked]);
  globalThis.fetch = async input => responseFor(source, String(input));
  try {
    const first = await service.checkCoinSurveillance(tracked);
    assert.ok(first.newEvents.some(e => /пробій вгору/.test(e.title)));
    assert.ok(first.newEvents.every(e => e.price === 103 && e.details?.timeframe === '15m'));
    service.commitSurveillanceCheck(first.coin);
    assert.deepEqual((await service.checkCoinSurveillance(first.coin)).newEvents, []);
  } finally { globalThis.fetch = originalFetch; }
});

test('an open candle crossing a level cannot emit a bar-close alert', async () => {
  const originalFetch = globalThis.fetch;
  const source = mockKlines(false, true);
  const config = { ...coin.config, triggerModes: ['bar_close_15m'] as any };
  const state = await service.calculateSurveillanceState('LIVEUSDT', 'binance', 'futures', config, source);
  const tracked = { ...coin, id: 'live-candle', symbol: 'LIVEUSDT', config,
    state: { ...state!, lastProcessedCandleTimes: { '15m': source['15m'][57].time * 1000, '1h': 0, '4h': 0 } } };
  service.saveSurveillanceList('owner', [tracked]);
  globalThis.fetch = async input => responseFor(source, String(input));
  try { assert.deepEqual((await service.checkCoinSurveillance(tracked)).newEvents, []); }
  finally { globalThis.fetch = originalFetch; }
});

test('a check-all waiting on exchange data cannot resurrect a deletion or lose an addition', async () => {
  const originalFetch = globalThis.fetch;
  const source = mockKlines();
  const waiting = { ...coin, id: 'waiting-check', symbol: 'WAITINGUSDT' };
  service.saveSurveillanceList('owner', [waiting]);
  const pending: Array<() => void> = [];
  globalThis.fetch = async input => new Promise<Response>(resolve => pending.push(() => resolve(responseFor(source, String(input)))));
  try {
    const checking = service.checkAllUserCoins('owner');
    assert.equal(pending.length, 4);
    const selected = { ...coin, id: 'explicit-new-selection', symbol: 'SOLUSDT' };
    service.saveSurveillanceList('owner', [selected]);
    pending.forEach(resolve => resolve());
    assert.deepEqual((await checking).map(c => c.id), [selected.id]);
    assert.deepEqual(service.loadSurveillanceList('owner').map(c => c.id), [selected.id]);
  } finally { globalThis.fetch = originalFetch; }
});

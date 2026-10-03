import test from 'node:test';
import assert from 'node:assert/strict';
import type { Kline, Timeframe } from '../src/types';
import { SurveillanceReplayEngine } from '../server/surveillance/replayEngine';
import { getTimeframeMs } from '../server/surveillance/multiTimeframeEngine';

const engine = new SurveillanceReplayEngine();
const history = (tf: Timeframe = '5m'): Kline[] => {
  const step = getTimeframeMs(tf);
  const start = Math.floor(Date.now() / step) * step - 150 * step;
  const data = Array.from({ length: 100 }, (_, i) => ({ time: start + i * step, open: 102, close: 102, high: 104, low: 100, volume: 100 }));
  data[40] = { ...data[40], open: 99.8, close: 100, low: 99.5, high: 100.2 };
  for (let i = 41; i < 100; i++) data[i] = { ...data[i], open: 100, close: 100.5, low: 99.5, high: 101 };
  return data;
};

test('5m backtest measures 4h at candle 48, instead of mislabelling candle 16', () => {
  const data = history();
  data[88] = { ...data[88], high: 103, close: 102 };
  const result = engine.runCausalBacktest('TESTUSDT', data, '5m').results[0];
  assert.ok(result);
  assert.equal(result.future15mPct, 0.5);
  assert.equal(result.future1hPct, 0.5);
  assert.equal(result.future4hPct, 2);
  assert.equal(result.triggerTime, data[40].time + 300000);
  assert.equal(result.success, true);
});

test('future outcomes cannot change the detection time or entry', () => {
  const first = history('15m');
  const second = first.map((c, i) => i > 40 ? { ...c, low: 90, high: 110 } : { ...c });
  const a = engine.runCausalBacktest('TESTUSDT', first, '15m').results[0];
  const b = engine.runCausalBacktest('TESTUSDT', second, '15m').results[0];
  assert.equal(a.triggerTime, b.triggerTime);
  assert.equal(a.triggerPrice, b.triggerPrice);
  assert.equal(b.exitReason, 'STOP');
});

test('stop before target and same-bar ambiguity count as losses, but TP before SL counts as a win', () => {
  for (const scenario of ['STOP_FIRST', 'BOTH', 'TARGET_FIRST']) {
    const data = history('15m');
    if (scenario === 'STOP_FIRST') { data[41].low = 99; data[42].high = 102; }
    else if (scenario === 'BOTH') { data[41].low = 99; data[41].high = 102; }
    else { data[41].high = 102; data[42].low = 99; }
    const result = engine.runCausalBacktest('TESTUSDT', data, '15m').results[0];
    assert.equal(result.success, scenario === 'TARGET_FIRST', scenario);
  }
});

test('incomplete horizons, gaps and open/future candles are not scored', () => {
  const data = history();
  assert.equal(engine.runCausalBacktest('TESTUSDT', data.slice(0, 70), '5m').totalSetups, 0);
  const gap = data.filter((_, i) => i !== 60);
  assert.equal(engine.runCausalBacktest('TESTUSDT', gap, '5m').totalSetups, 0);
  const future = data.map((c, i) => i >= 60 ? { ...c, time: Date.now() + i * 300000 } : c);
  assert.equal(engine.runCausalBacktest('TESTUSDT', future, '5m').totalSetups, 0);
});

test('coarse timeframes do not manufacture a 15m measurement from an hourly candle', () => {
  const result = engine.runCausalBacktest('TESTUSDT', history('1h'), '1h').results[0];
  assert.equal(result.future15mPct, null);
  assert.equal(result.future1hPct, 0.5);
  assert.deepEqual(engine.runCausalBacktest('TESTUSDT', history('1d'), '1d').results, []);
});

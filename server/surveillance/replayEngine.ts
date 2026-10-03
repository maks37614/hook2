import { Kline, Timeframe } from '../../src/types';
import { normalizeKlineTimeMs } from '../../src/utils/formationValidation';
import { calculateATR, getTimeframeMs } from './multiTimeframeEngine';

export interface BacktestSetupResult {
  symbol: string;
  triggerTime: number;
  triggerPrice: number;
  targetPrice: number;
  stopPrice: number;
  setupType: string;
  direction: 'LONG' | 'SHORT';
  mfePct: number;
  maePct: number;
  future15mPct: number | null;
  future1hPct: number | null;
  future4hPct: number | null;
  success: boolean;
  exitReason: 'TARGET' | 'STOP' | 'TIMEOUT';
}

const median = (values: number[]) => {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : 0;
};

export class SurveillanceReplayEngine {
  public runCausalBacktest(symbol: string, input: Kline[], timeframe: Timeframe = '15m') {
    const results: BacktestSetupResult[] = [];
    const tfMs = getTimeframeMs(timeframe);
    const horizonMs = 4 * 60 * 60 * 1000;
    const futureBars = horizonMs / tfMs;
    const summarize = () => ({ totalSetups: results.length,
      winRate: results.length ? Number((results.filter(r => r.success).length / results.length * 100).toFixed(1)) : 0,
      medianMfePct: median(results.map(r => r.mfePct)), medianMaePct: median(results.map(r => r.maePct)),
      timeframe, horizonHours: 4, targetPct: 1.5, stopPct: 0.8, results: results.slice(-20) });
    if (!Number.isInteger(futureBars) || futureBars < 1) return summarize();
    const now = Date.now();
    const candles = Array.from(new Map(input.filter(c => Number.isFinite(c.time) &&
      [c.open, c.high, c.low, c.close].every(v => Number.isFinite(v) && v > 0) &&
      c.low <= Math.min(c.open, c.close) && c.high >= Math.max(c.open, c.close) &&
      normalizeKlineTimeMs(c.time) + tfMs <= now).map(c => [normalizeKlineTimeMs(c.time), c])).values())
      .sort((a, b) => normalizeKlineTimeMs(a.time) - normalizeKlineTimeMs(b.time));

    for (let i = 40; i + futureBars < candles.length; i++) {
      const past = candles.slice(0, i + 1);
      const candle = candles[i];
      const price = candle.close;
      const atr = calculateATR(past);
      const support = Math.min(...past.slice(0, -5).map(c => c.low));
      if (!(atr > 0) || Math.abs(price - support) > atr * 0.4 || candle.close <= candle.open) continue;
      const future = candles.slice(i + 1, i + 1 + futureBars);
      const start = normalizeKlineTimeMs(candle.time);
      // Incomplete data cannot be relabelled as a shorter "4h" sample.
      if (future.some((c, j) => normalizeKlineTimeMs(c.time) !== start + (j + 1) * tfMs)) continue;
      const target = price * 1.015;
      const stop = price * 0.992;
      let exitReason: BacktestSetupResult['exitReason'] = 'TIMEOUT';
      for (const c of future) {
        // OHLC cannot establish intrabar ordering: stop wins if both are touched.
        if (c.low <= stop) { exitReason = 'STOP'; break; }
        if (c.high >= target) { exitReason = 'TARGET'; break; }
      }
      const round = (n: number) => Number(n.toFixed(2));
      const changeAt = (durationMs: number): number | null => {
        const bars = durationMs / tfMs;
        if (!Number.isInteger(bars) || bars < 1) return null;
        const c = future[bars - 1];
        return c ? round((c.close - price) / price * 100) : null;
      };
      results.push({ symbol, triggerTime: start + tfMs, triggerPrice: price,
        targetPrice: target, stopPrice: stop, setupType: 'SUPPORT_RETEST', direction: 'LONG',
        mfePct: round(Math.max(0, (Math.max(...future.map(c => c.high)) - price) / price * 100)),
        maePct: round(Math.max(0, (price - Math.min(...future.map(c => c.low))) / price * 100)),
        future15mPct: changeAt(15 * 60 * 1000), future1hPct: changeAt(60 * 60 * 1000), future4hPct: changeAt(horizonMs),
        success: exitReason === 'TARGET', exitReason });
      i += futureBars - 1;
    }
    return summarize();
  }
}

export const surveillanceReplayEngine = new SurveillanceReplayEngine();

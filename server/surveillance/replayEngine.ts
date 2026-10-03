import { Kline, Timeframe } from '../../src/types';
import { calculateATR } from './multiTimeframeEngine';

export interface BacktestSetupResult {
  symbol: string;
  triggerTime: number;
  triggerPrice: number;
  setupType: string;
  direction: 'LONG' | 'SHORT';
  mfePct: number; // Maximum Favorable Excursion %
  maePct: number; // Maximum Adverse Excursion %
  future15mPct: number;
  future1hPct: number;
  future4hPct: number;
  success: boolean;
}

function getHorizonIndex(tf: Timeframe, targetDurationMs: number): number {
  const tfMs = tf === '1d' ? 86400000 : tf === '4h' ? 14400000 : tf === '1h' ? 3600000 : tf === '15m' ? 900000 : 300000;
  const bars = Math.round(targetDurationMs / tfMs);
  return Math.max(0, bars - 1);
}

export class SurveillanceReplayEngine {
  public runCausalBacktest(
    symbol: string,
    candles: Kline[],
    timeframe: Timeframe = '15m'
  ): {
    totalSetups: number;
    winRate: number;
    medianMfePct: number;
    medianMaePct: number;
    results: BacktestSetupResult[];
  } {
    const results: BacktestSetupResult[] = [];
    if (candles.length < 50) {
      return { totalSetups: 0, winRate: 0, medianMfePct: 0, medianMaePct: 0, results: [] };
    }

    const idx15m = getHorizonIndex(timeframe, 15 * 60 * 1000);
    const idx1h = getHorizonIndex(timeframe, 60 * 60 * 1000);
    const idx4h = getHorizonIndex(timeframe, 4 * 60 * 60 * 1000);

    // Step through historical candles causal window (no look-ahead)
    for (let i = 40; i < candles.length - 16; i++) {
      const windowCandles = candles.slice(0, i + 1); // Strictly past and present
      const currentCandle = windowCandles[windowCandles.length - 1];
      const curPrice = currentCandle.close;
      const atr = calculateATR(windowCandles);

      // Check simple support retest on past window
      const pastLows = windowCandles.slice(0, -5).map((c) => c.low);
      const minPastLow = Math.min(...pastLows);

      // If price retests the previous swing low within tolerance
      if (Math.abs(curPrice - minPastLow) <= atr * 0.4 && currentCandle.close > currentCandle.open) {
        // Measure strictly FUTURE candles without using them during detection
        const futureSlice = candles.slice(i + 1, i + 17); // next 16 candles
        if (futureSlice.length > 0) {
          const futureHighs = futureSlice.map((c) => c.high);
          const futureLows = futureSlice.map((c) => c.low);
          const maxFuture = Math.max(...futureHighs);
          const minFuture = Math.min(...futureLows);

          const mfePct = Number((((maxFuture - curPrice) / curPrice) * 100).toFixed(2));
          const maePct = Number((((curPrice - minFuture) / curPrice) * 100).toFixed(2));

          const candle15m = futureSlice[Math.min(futureSlice.length - 1, idx15m)];
          const candle1h = futureSlice[Math.min(futureSlice.length - 1, idx1h)];
          const candle4h = futureSlice[Math.min(futureSlice.length - 1, idx4h)];

          const future15mPct = candle15m ? Number((((candle15m.close - curPrice) / curPrice) * 100).toFixed(2)) : 0;
          const future1hPct = candle1h ? Number((((candle1h.close - curPrice) / curPrice) * 100).toFixed(2)) : 0;
          const future4hPct = candle4h ? Number((((candle4h.close - curPrice) / curPrice) * 100).toFixed(2)) : 0;

          results.push({
            symbol,
            triggerTime: currentCandle.time,
            triggerPrice: curPrice,
            setupType: 'SUPPORT_RETEST',
            direction: 'LONG',
            mfePct,
            maePct,
            future15mPct,
            future1hPct,
            future4hPct,
            success: mfePct >= 1.5 && maePct <= 0.8,
          });

          i += 8; // skip ahead to avoid overlapping same touch
        }
      }
    }

    const wins = results.filter((r) => r.success).length;
    const winRate = results.length > 0 ? Number(((wins / results.length) * 100).toFixed(1)) : 0;

    const mfes = results.map((r) => r.mfePct).sort((a, b) => a - b);
    const maes = results.map((r) => r.maePct).sort((a, b) => a - b);

    const medianMfePct = mfes.length > 0 ? mfes[Math.floor(mfes.length / 2)] : 0;
    const medianMaePct = maes.length > 0 ? maes[Math.floor(maes.length / 2)] : 0;

    return {
      totalSetups: results.length,
      winRate,
      medianMfePct,
      medianMaePct,
      results: results.slice(-20),
    };
  }
}

export const surveillanceReplayEngine = new SurveillanceReplayEngine();

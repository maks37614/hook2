import { Kline, RoundNumberContext } from '../types';
import { calculateATR } from './formationValidation';

function candidateSteps(price: number): number[] {
  if (!Number.isFinite(price) || price <= 0) return [];
  const base = 10 ** Math.floor(Math.log10(price));
  return [base, base / 2, base / 5, base / 10].filter((x) => x > 0);
}

export function analyzeRoundNumber(klines: Kline[], price: number): RoundNumberContext {
  if (!Number.isFinite(price) || price <= 0 || !klines.length) {
    return { detected: false, distancePct: 999, step: 0, strength: 0, densityConfirmed: false };
  }
  const atr = calculateATR(klines, 14);
  const candidates = candidateSteps(price).flatMap((step) => {
    const center = Math.round(price / step) * step;
    return [center, center - step, center + step].filter((x) => x > 0).map((level) => ({ level, step }));
  });
  const best = candidates.sort((a, b) => Math.abs(a.level - price) - Math.abs(b.level - price))[0];
  const distancePct = Math.abs(price - best.level) / price * 100;
  const tolerancePct = Math.max(0.12, Math.min(0.8, (atr / price) * 100 * 0.3));
  const detected = distancePct <= tolerancePct;
  const strength = detected ? Math.round(Math.max(0, 100 - (distancePct / tolerancePct) * 55)) : 0;
  return {
    detected,
    level: best.level,
    distancePct: Number(distancePct.toFixed(3)),
    step: best.step,
    strength,
    densityConfirmed: false,
  };
}

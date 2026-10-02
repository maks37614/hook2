import { Kline, DetectedFormation, ExtremeApproach, ExtremeContext, ExtremeRole } from '../types';

interface ExtremePoint {
  price: number;
  index: number;
  type: 'high' | 'low';
}

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const pct = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1) * 100;

/**
 * Finds statistically relevant price extremes and evaluates how price is
 * approaching them. This is intentionally separate from pattern recognition:
 * a pattern is only considered high quality when it forms in a meaningful
 * location and the path into that location supports the pattern.
 */
export function analyzeExtremes(
  klines: Kline[],
  formation: DetectedFormation,
  swingWindow = 3
): ExtremeContext {
  const n = klines.length;
  const last = klines[n - 1];
  const current = last.close;

  const lookback = Math.min(n, Math.max(48, Math.min(240, n)));
  const start = n - lookback;
  const sample = klines.slice(start);

  const highs: ExtremePoint[] = [];
  const lows: ExtremePoint[] = [];

  for (let i = swingWindow; i < n - swingWindow; i++) {
    const c = klines[i];
    let hi = true, lo = true;
    for (let j = i - swingWindow; j <= i + swingWindow; j++) {
      if (j === i) continue;
      if (klines[j].high >= c.high) hi = false;
      if (klines[j].low <= c.low) lo = false;
    }
    if (hi) highs.push({ price: c.high, index: i, type: 'high' });
    if (lo) lows.push({ price: c.low, index: i, type: 'low' });
  }

  const rangeHigh = Math.max(...sample.map(c => c.high));
  const rangeLow = Math.min(...sample.map(c => c.low));
  const range = Math.max(rangeHigh - rangeLow, current * 0.0001);
  const rangePositionPct = clamp((current - rangeLow) / range * 100);

  const recentHighs = highs.filter(p => p.index >= start);
  const recentLows = lows.filter(p => p.index >= start);

  // Include the rolling extremes even when a fractal is not confirmed yet.
  const upperCandidates = [
    { price: rangeHigh, index: sample.reduce((m,c,i) => c.high > sample[m].high ? i : m, 0) + start, type: 'high' as const },
    ...recentHighs
  ];
  const lowerCandidates = [
    { price: rangeLow, index: sample.reduce((m,c,i) => c.low < sample[m].low ? i : m, 0) + start, type: 'low' as const },
    ...recentLows
  ];

  const upper = upperCandidates.sort((a,b) => Math.abs(a.price-current)-Math.abs(b.price-current))[0];
  const lower = lowerCandidates.sort((a,b) => Math.abs(a.price-current)-Math.abs(b.price-current))[0];

  const isReversal = formation.category === 'reversal' || formation.category === 'candlestick';
  const isBull = formation.bias === 'bullish';
  const wantsUpper = formation.category === 'breakout' ? isBull : !isBull;
  const reference = wantsUpper ? upper : lower;
  const role: ExtremeRole = wantsUpper ? 'UPPER_EXTREME' : 'LOWER_EXTREME';
  const distancePct = pct(current, reference.price);

  // Path into the extreme: use closes/highs/lows over 3/5/8 bars and normalize
  // the movement by the current price. Positive strength means price is moving
  // toward the relevant extreme.
  const recent = klines.slice(Math.max(0, n - 10), n);
  const old = klines[Math.max(0, n - 10)];
  const netMovePct = old ? ((current - old.close) / Math.max(old.close, 1)) * 100 : 0;
  const toward = wantsUpper ? netMovePct > 0 : netMovePct < 0;
  const velocityPct = Math.abs(netMovePct);

  const last3 = klines.slice(Math.max(0, n - 3), n);
  const last3Move = last3.length > 1
    ? ((last3[last3.length - 1].close - last3[0].open) / Math.max(last3[0].open, 1)) * 100
    : 0;
  const fastToward = wantsUpper ? last3Move > 0 : last3Move < 0;

  const approachStrength = clamp(
    velocityPct * 12 +
    (toward ? 30 : 0) +
    (fastToward ? 25 : 0) +
    (distancePct <= 1.0 ? 30 : distancePct <= 2.0 ? 20 : distancePct <= 3.5 ? 10 : 0)
  );

  const nearThreshold = Math.max(0.5, Math.min(3.5, 0.35 + velocityPct * 1.5));
  const testing = distancePct <= nearThreshold;

  // Sweep / rejection: the latest candles traded through the extreme but closed
  // back inside the prior range.
  const look = klines.slice(Math.max(0, n - 5), n);
  const priorHigh = Math.max(...klines.slice(Math.max(0, n - 20), Math.max(0, n - 5)).map(c => c.high));
  const priorLow = Math.min(...klines.slice(Math.max(0, n - 20), Math.max(0, n - 5)).map(c => c.low));

  let sweepDetected = false;
  let rejectionStrength = 0;
  if (wantsUpper) {
    const wickThrough = Math.max(...look.map(c => c.high)) > priorHigh;
    const closesBack = current < priorHigh;
    sweepDetected = wickThrough && closesBack;
    rejectionStrength = clamp(
      (sweepDetected ? 55 : 0) +
      (current < last.high ? 20 : 0) +
      (distancePct <= 1.5 ? 25 : 0)
    );
  } else {
    const wickThrough = Math.min(...look.map(c => c.low)) < priorLow;
    const closesBack = current > priorLow;
    sweepDetected = wickThrough && closesBack;
    rejectionStrength = clamp(
      (sweepDetected ? 55 : 0) +
      (current > last.low ? 20 : 0) +
      (distancePct <= 1.5 ? 25 : 0)
    );
  }

  const tests = (wantsUpper ? recentHighs : recentLows)
    .filter(p => pct(p.price, reference.price) <= 1.25).length;

  let approach: ExtremeApproach = 'NEUTRAL';
  if (sweepDetected && rejectionStrength >= 55) approach = 'REJECTING';
  else if (testing) approach = 'TESTING';
  else if (toward) approach = 'APPROACHING';
  else if (distancePct > 3.5) approach = 'MOVING_AWAY';

  // For a reversal, being at the relevant extreme is essential. For breakout,
  // approach + repeated tests are useful; for continuation we allow a wider zone.
  const maxDistance = isReversal ? 2.75 : formation.category === 'breakout' ? 3.5 : 4.5;
  const aligned = distancePct <= maxDistance && (
    isReversal
      ? approach === 'TESTING' || approach === 'REJECTING' || sweepDetected
      : approach === 'APPROACHING' || approach === 'TESTING' || approach === 'REJECTING'
  );

  let reason = '';
  if (aligned) {
    reason = `${role === 'UPPER_EXTREME' ? 'Верхній' : 'Нижній'} екстремум близько: ${distancePct.toFixed(2)}%; підхід ${approach.toLowerCase()}, сила ${Math.round(approachStrength)}/100.`;
    if (tests >= 2) reason += ` Повторних тестів: ${tests}.`;
    if (sweepDetected) reason += ' Є sweep/reclaim.';
  } else {
    reason = `Формація далеко від релевантного екстремуму (${distancePct.toFixed(2)}%) або підхід не підтверджений.`;
  }

  return {
    role,
    referencePrice: Number(reference.price.toFixed(8)),
    distancePct: Number(distancePct.toFixed(3)),
    rangePositionPct: Number(rangePositionPct.toFixed(2)),
    approach,
    approachStrength: Math.round(approachStrength),
    barsToExtreme: Math.max(0, n - reference.index),
    velocityPct: Number(velocityPct.toFixed(3)),
    rejectionStrength: Math.round(rejectionStrength),
    sweepDetected,
    testsCount: tests,
    aligned,
    reason
  };
}

/**
 * Applies location/approach to every detected formation. This is deliberately
 * a post-detection gate: pattern geometry remains independent, while the
 * formation quality reflects whether it occurs at a meaningful extreme.
 */
export function applyExtremeContext(
  klines: Kline[],
  formations: DetectedFormation[]
): DetectedFormation[] {
  return formations.map((formation) => {
    const context = analyzeExtremes(klines, formation);
    let delta = 0;

    if (context.aligned) {
      delta += 8;
      if (context.approach === 'TESTING') delta += 4;
      if (context.approach === 'REJECTING') delta += 6;
      if (context.sweepDetected) delta += 5;
      if (context.testsCount >= 2) delta += 3;
    } else {
      delta -= formation.category === 'reversal' || formation.category === 'candlestick' ? 18 : 10;
    }

    // Do not let a location score alone manufacture a high-confidence entry.
    // It is a formation-quality modifier, not an entry confirmation.
    const confidence = Math.max(25, Math.min(95, formation.confidence + delta));

    let statusLabel = formation.statusLabel;
    if (!context.aligned && (formation.category === 'reversal' || formation.category === 'candlestick')) {
      statusLabel = 'Формація без підтвердженого екстремуму — очікування';
    } else if (context.sweepDetected && context.rejectionStrength >= 55) {
      statusLabel = `${formation.statusLabel} · sweep екстремуму підтверджено`;
    } else if (context.approach === 'APPROACHING' || context.approach === 'TESTING') {
      statusLabel = `${formation.statusLabel} · підхід до екстремуму`;
    }

    return {
      ...formation,
      confidence,
      statusLabel,
      extremeContext: context,
      description: `${formation.description} Екстремум: ${context.reason}`
    };
  });
}

import { ConfluenceBreakdown, ConfluenceComponent, DetectedFormation, Kline, PatternBias } from '../types';

export interface FormationValidation {
  passed: boolean;
  confirmed: boolean;
  closedCandleOnly: boolean;
  lookAheadSafe: boolean;
  enoughData: boolean;
  finiteData: boolean;
  swingQuality: number;
  equalExtremaTolerancePct: number;
  atrPct: number;
  breakoutConfirmed: boolean;
  breakoutPrice?: number;
  breakoutIndex?: number;
  entryMode: 'BREAKOUT' | 'RETEST' | 'WAIT_RETEST' | 'WAIT_BREAKOUT';
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  riskReward: number;
  minRiskReward: number;
  volumeRatio: number;
  volatilityPct: number;
  nearbyLevelDistancePct: number;
  filters: {
    volume: boolean;
    volatility: boolean;
    nearbyLevel: boolean;
    structure: boolean;
  };
  rejectionReasons: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const finitePositive = (v: number) => Number.isFinite(v) && v > 0;
const pctDistance = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12) * 100;

export function normalizeKlineTimeMs(time: number): number {
  return time > 2_000_000_000_000 ? time : time * 1000;
}

export function isKlineClosed(k: Kline, nextKline?: Kline, nowMs = Date.now()): boolean {
  if (!k || !Number.isFinite(k.time)) return false;
  if (nextKline) return true;
  // We cannot know the exchange interval from one candle with certainty; the
  // caller should normally pass a known timeframe. This conservative check is
  // only a last-resort guard against a clearly live timestamp.
  return normalizeKlineTimeMs(k.time) < nowMs;
}

export function trueRange(c: Kline, prev?: Kline): number {
  if (!prev) return Math.max(0, c.high - c.low);
  return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
}

export function calculateATR(klines: Kline[], period = 14): number {
  if (klines.length < 2) return 0;
  const start = Math.max(1, klines.length - period);
  const trs: number[] = [];
  for (let i = start; i < klines.length; i++) trs.push(trueRange(klines[i], klines[i - 1]));
  return trs.length ? trs.reduce((a, b) => a + b, 0) / trs.length : 0;
}

export function swingTolerancePct(klines: Kline[], price: number): number {
  const atr = calculateATR(klines, 14);
  const atrPct = finitePositive(price) ? atr / price * 100 : 0;
  // Scale-aware tolerance: low-vol assets need a floor, high-vol assets get a
  // wider band, but never more than 2% for an "equal" high/low.
  return clamp(Math.max(0.12, atrPct * 0.35), 0.12, 2.0);
}

export function stableFormationId(symbol: string, formation: DetectedFormation): string {
  const raw = [
    symbol,
    formation.patternKey,
    formation.candleStartIndex ?? -1,
    formation.candleEndIndex ?? -1,
    Math.round(formation.levels.necklinePrice ?? formation.levels.entryPrice),
  ].join('|');
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${symbol}-${formation.patternKey}-${(hash >>> 0).toString(16)}`;
}

function isClosedCandleSet(klines: Kline[]): boolean {
  if (klines.length < 2) return false;
  const last = normalizeKlineTimeMs(klines[klines.length - 1].time);
  const prev = normalizeKlineTimeMs(klines[klines.length - 2].time);
  const interval = Math.max(1000, last - prev);
  return Date.now() >= last + interval;
}

function sanitize(klines: Kline[]): Kline[] {
  return klines
    .filter((k) => k && [k.open, k.high, k.low, k.close, k.volume, k.time].every(Number.isFinite))
    .filter((k) => k.high >= k.low && k.high > 0 && k.low > 0 && k.close > 0 && k.open > 0 && k.volume >= 0)
    .sort((a, b) => a.time - b.time)
    .filter((k, i, arr) => i === 0 || k.time !== arr[i - 1].time);
}

function isBullishBreakout(formation: DetectedFormation, candles: Kline[], anchor: number): { ok: boolean; index?: number; price?: number } {
  const level = formation.levels.necklinePrice ?? formation.levels.resistancePrice ?? formation.levels.entryPrice;
  if (!finitePositive(level)) return { ok: false };
  for (let i = Math.max(anchor + 1, 1); i < candles.length; i++) {
    if (candles[i].close > level && candles[i - 1].close <= level) return { ok: true, index: i, price: candles[i].close };
  }
  return { ok: false };
}

function isBearishBreakout(formation: DetectedFormation, candles: Kline[], anchor: number): { ok: boolean; index?: number; price?: number } {
  const level = formation.levels.necklinePrice ?? formation.levels.supportPrice ?? formation.levels.entryPrice;
  if (!finitePositive(level)) return { ok: false };
  for (let i = Math.max(anchor + 1, 1); i < candles.length; i++) {
    if (candles[i].close < level && candles[i - 1].close >= level) return { ok: true, index: i, price: candles[i].close };
  }
  return { ok: false };
}

function hasRetest(formation: DetectedFormation, candles: Kline[], breakoutIndex: number, atr: number): boolean {
  const level = formation.levels.necklinePrice ?? formation.levels.entryPrice;
  if (!finitePositive(level)) return false;
  const tol = Math.max(atr * 0.35, level * 0.0015);
  for (let i = breakoutIndex + 1; i < candles.length; i++) {
    const c = candles[i];
    if (formation.bias === 'bullish' && c.low <= level + tol && c.close > level) return true;
    if (formation.bias === 'bearish' && c.high >= level - tol && c.close < level) return true;
  }
  return false;
}


function component(score: number, max: number, evidence: string, status?: ConfluenceComponent['status']): ConfluenceComponent {
  const safe = Math.max(0, Math.min(max, score));
  return { score: Number(safe.toFixed(1)), max, status: status ?? (safe >= max * 0.8 ? 'CONFIRMED' : safe > 0 ? 'PARTIAL' : 'MISSING'), evidence };
}

function confluenceGrade(total: number): ConfluenceBreakdown['grade'] {
  if (total >= 90) return 'A+';
  if (total >= 82) return 'A';
  if (total >= 72) return 'B';
  if (total >= 60) return 'C';
  return 'D';
}

function buildFormationConfluence(args: {
  formation: DetectedFormation;
  extreme?: DetectedFormation['extremeContext'];
  breakoutConfirmed: boolean;
  retestConfirmed: boolean;
  volumeRatio: number;
  volatilityPct: number;
  nearbyLevelDistancePct: number;
  rr: number;
  enoughData: boolean;
  finiteData: boolean;
  lookAheadSafe: boolean;
  closedCandleOnly: boolean;
}): ConfluenceBreakdown {
  const { formation, extreme, breakoutConfirmed, retestConfirmed, volumeRatio, volatilityPct, nearbyLevelDistancePct, rr, enoughData, finiteData, lookAheadSafe, closedCandleOnly } = args;
  const formationScore = Math.max(0, Math.min(15, (formation.confidence / 100) * 15));
  const extremeScore = extreme
    ? (extreme.aligned ? 5 : 0) + Math.min(2.5, extreme.approachStrength / 40) + Math.min(1.5, extreme.testsCount * 0.5) + (extreme.sweepDetected ? 1 : 0)
    : 0;
  const triggerScore = breakoutConfirmed ? 20 : 0;
  const retestScore = retestConfirmed ? 10 : breakoutConfirmed ? 4 : 0;
  const volumeScore = volumeRatio >= 2 ? 10 : volumeRatio >= 1.5 ? 8 : volumeRatio >= 1.2 ? 6 : volumeRatio >= 1 ? 3 : 0;
  const volatilityScore = volatilityPct >= 0.15 && volatilityPct <= 6 ? 5 : volatilityPct > 0 && volatilityPct <= 12 ? 2.5 : 0;
  const levelScore = nearbyLevelDistancePct <= 0.5 ? 10 : nearbyLevelDistancePct <= 1 ? 8 : nearbyLevelDistancePct <= 2 ? 6 : nearbyLevelDistancePct <= 4.5 ? 3 : 0;
  const rrScore = rr >= 3 ? 10 : rr >= 2.5 ? 8 : rr >= 2 ? 6 : rr >= 1.5 ? 3 : 0;
  const dataScore = enoughData && finiteData && lookAheadSafe && closedCandleOnly ? 10 : enoughData && finiteData && lookAheadSafe ? 7 : 0;

  const conflicts: string[] = [];
  const missing: string[] = [];
  const notes: string[] = [];
  if (!breakoutConfirmed) missing.push('Підтверджений breakout');
  if (breakoutConfirmed && !retestConfirmed) missing.push('Retest рівня');
  if (volumeRatio < 1.2) missing.push('Підтвердження обсягом');
  if (!extreme?.aligned) conflicts.push('Формація не знаходиться в підтвердженій зоні екстремуму');
  if (rr < 2) conflicts.push(`R:R ${rr.toFixed(2)} нижче мінімуму 2.0`);
  if (volatilityPct > 12) conflicts.push('Надмірна волатильність');
  if (!lookAheadSafe || !closedCandleOnly) conflicts.push('Порушена look-ahead/closed-candle перевірка');
  if (extreme?.sweepDetected) notes.push('Є sweep релевантного екстремуму');
  if (extreme && extreme.testsCount >= 2) notes.push(`${extreme.testsCount} підтверджених тестів екстремуму`);
  if (retestConfirmed) notes.push('Breakout підтверджено ретестом');

  const components = {
    formation: component(formationScore, 15, `Якість геометрії/формації: ${formation.confidence.toFixed(0)}/100`),
    extremeLocation: component(extremeScore, 10, extreme ? `${extreme.role}; відстань ${extreme.distancePct.toFixed(2)}%; підхід ${extreme.approach}; сила ${extreme.approachStrength}/100` : 'Немає extreme context'),
    trigger: component(triggerScore, 20, breakoutConfirmed ? 'Закритий breakout підтверджено' : 'Breakout не підтверджено'),
    retest: component(retestScore, 10, retestConfirmed ? 'Рівень пробою повторно протестовано й утримано' : breakoutConfirmed ? 'Breakout є, але ретест ще не підтверджений' : 'Retest неможливий без breakout'),
    volume: component(volumeScore, 10, `RVOL ${volumeRatio.toFixed(2)}x`),
    volatility: component(volatilityScore, 5, `ATR/price ${volatilityPct.toFixed(2)}%`),
    level: component(levelScore, 10, `Найближчий ключовий рівень: ${nearbyLevelDistancePct.toFixed(2)}%`),
    riskReward: component(rrScore, 10, `R:R ${rr.toFixed(2)}`),
    dataQuality: component(dataScore, 10, `data=${finiteData ? 'OK' : 'BAD'}, candles=${enoughData ? 'OK' : 'LOW'}, lookAhead=${lookAheadSafe ? 'SAFE' : 'FAIL'}, closed=${closedCandleOnly ? 'SAFE' : 'FAIL'}`),
  };
  const total = Object.values(components).reduce((sum, c) => sum + c.score, 0);
  const independent = [breakoutConfirmed, retestConfirmed, volumeRatio >= 1.2, !!extreme?.aligned, nearbyLevelDistancePct <= 2, rr >= 2].filter(Boolean).length;
  return { total: Number(total.toFixed(1)), grade: confluenceGrade(total), components, independentConfirmations: independent, conflicts, missing, notes };
}

export function validateFormation(klinesInput: Kline[], formation: DetectedFormation): DetectedFormation {
  const klines = sanitize(klinesInput);
  const reasons: string[] = [];
  const enoughData = klines.length >= 35;
  const finiteData = klines.length === klinesInput.length;
  if (!enoughData) reasons.push('Недостатньо свічок');
  if (!finiteData) reasons.push('Є некоректні/NaN дані');

  const current = klines[klines.length - 1];
  const closedCandleOnly = isClosedCandleSet(klinesInput);
  if (!current) return { ...formation, validation: { passed: false, confirmed: false, closedCandleOnly: false, lookAheadSafe: false, enoughData, finiteData, swingQuality: 0, equalExtremaTolerancePct: 0, atrPct: 0, breakoutConfirmed: false, entryMode: 'WAIT_BREAKOUT', entryPrice: 0, stopPrice: 0, targetPrice: 0, riskReward: 0, minRiskReward: 2, volumeRatio: 0, volatilityPct: 0, nearbyLevelDistancePct: 999, filters: { volume: false, volatility: false, nearbyLevel: false, structure: false }, rejectionReasons: reasons, confluence: buildFormationConfluence({ formation, extreme: formation.extremeContext, breakoutConfirmed: false, retestConfirmed: false, volumeRatio: 0, volatilityPct: 0, nearbyLevelDistancePct: 999, rr: 0, enoughData, finiteData, lookAheadSafe: false, closedCandleOnly: false }) } };

  const atr = calculateATR(klines, 14);
  const atrPct = current.close > 0 ? atr / current.close * 100 : 0;
  const tolPct = swingTolerancePct(klines, current.close);
  const anchor = Math.max(0, formation.candleStartIndex ?? klines.length - 20);
  const endIndex = Math.min(klines.length - 1, formation.candleEndIndex ?? klines.length - 1);

  // Look-ahead rule: the pattern anchor and any confirmation must be at or
  // before the latest closed candle. Swing fractals need `window` future bars;
  // the formation detector itself is responsible for only exposing confirmed
  // swings. Here we additionally reject impossible future indices.
  const lookAheadSafe = anchor <= endIndex && endIndex < klines.length;
  if (!lookAheadSafe) reasons.push('Порушення часової послідовності');

  const volumeSample = klines.slice(Math.max(0, klines.length - 21), klines.length - 1);
  const avgVolume = volumeSample.length ? volumeSample.reduce((s, c) => s + c.volume, 0) / volumeSample.length : 0;
  const volumeRatio = avgVolume > 0 ? current.volume / avgVolume : 0;
  const volumeFilter = volumeRatio >= 1.15;
  const volatilityFilter = atrPct >= 0.05 && atrPct <= 12;

  const levels = [formation.levels.supportPrice, formation.levels.resistancePrice, formation.levels.necklinePrice]
    .filter((v): v is number => finitePositive(v));
  const nearestLevelDistancePct = levels.length ? Math.min(...levels.map((v) => pctDistance(current.close, v))) : 999;
  const nearbyLevelFilter = nearestLevelDistancePct <= 4.5;

  const breakout = formation.bias === 'bullish'
    ? isBullishBreakout(formation, klines, anchor)
    : formation.bias === 'bearish'
      ? isBearishBreakout(formation, klines, anchor)
      : { ok: false as const };

  const breakoutConfirmed = breakout.ok && (breakout.index ?? 0) <= klines.length - 1;
  const retestConfirmed = breakoutConfirmed && hasRetest(formation, klines, breakout.index!, atr);
  const structuralEntry = breakoutConfirmed
    ? (retestConfirmed ? (formation.levels.necklinePrice ?? breakout.price!) : breakout.price!)
    : formation.levels.entryPrice;

  const structuralStop = formation.bias === 'bullish'
    ? Math.min(current.low, formation.levels.supportPrice ?? current.low) - atr * 0.25
    : Math.max(current.high, formation.levels.resistancePrice ?? current.high) + atr * 0.25;
  let stop = structuralStop;
  if (!finitePositive(stop) || (formation.bias === 'bullish' && stop >= structuralEntry) || (formation.bias === 'bearish' && stop <= structuralEntry)) {
    stop = formation.bias === 'bullish' ? structuralEntry - Math.max(atr, structuralEntry * 0.005) : structuralEntry + Math.max(atr, structuralEntry * 0.005);
  }

  const risk = Math.abs(structuralEntry - stop);
  let target = formation.levels.targetPrice;
  const minTarget = formation.bias === 'bullish' ? structuralEntry + risk * 2 : structuralEntry - risk * 2;
  if (!finitePositive(target) || (formation.bias === 'bullish' && target < minTarget) || (formation.bias === 'bearish' && target > minTarget)) target = minTarget;
  const rr = risk > 0 ? Math.abs(target - structuralEntry) / risk : 0;

  const structure = formation.bias !== 'neutral' && breakoutConfirmed;
  if (!structure) reasons.push('Немає підтвердженого пробою рівня');
  if (!volumeFilter) reasons.push('Обсяг не підтверджує рух');
  if (!volatilityFilter) reasons.push('Волатильність поза робочим діапазоном');
  if (!nearbyLevelFilter) reasons.push('Немає близького ключового рівня');
  if (rr < 2) reasons.push(`R:R ${rr.toFixed(2)} < 2.0`);

  const confirmed = enoughData && finiteData && lookAheadSafe && closedCandleOnly && structure && rr >= 2;
  const passed = confirmed && volumeFilter && volatilityFilter && nearbyLevelFilter;
  const entryMode = !breakoutConfirmed ? 'WAIT_BREAKOUT' : retestConfirmed ? 'RETEST' : 'BREAKOUT';

  if (!closedCandleOnly) reasons.push('Остання свічка ще не закрита');
  const confluence = buildFormationConfluence({
    formation,
    extreme: formation.extremeContext,
    breakoutConfirmed,
    retestConfirmed,
    volumeRatio,
    volatilityPct: atrPct,
    nearbyLevelDistancePct: nearestLevelDistancePct,
    rr,
    enoughData,
    finiteData,
    lookAheadSafe,
    closedCandleOnly,
  });
  const confidence = clamp(confluence.total, 0, 100);

  return {
    ...formation,
    id: stableFormationId('formation', formation),
    confidence: Math.round(confidence),
    statusLabel: passed ? `${formation.statusLabel} · ПІДТВЕРДЖЕНО` : `${formation.statusLabel} · ${entryMode === 'WAIT_BREAKOUT' ? 'очікування пробою' : 'очікування підтвердження'}`,
    levels: {
      ...formation.levels,
      entryPrice: Number(structuralEntry.toFixed(8)),
      stopLossPrice: Number(stop.toFixed(8)),
      targetPrice: Number(target.toFixed(8)),
    },
    potentialRiskPct: Number((risk / Math.max(structuralEntry, 1e-12) * 100).toFixed(2)),
    potentialProfitPct: Number((Math.abs(target - structuralEntry) / Math.max(structuralEntry, 1e-12) * 100).toFixed(2)),
    riskRewardRatio: Number(rr.toFixed(2)),
    validation: {
      passed,
      confirmed,
      closedCandleOnly,
      lookAheadSafe,
      enoughData,
      finiteData,
      swingQuality: clamp(100 - reasons.length * 12, 0, 100),
      equalExtremaTolerancePct: Number(tolPct.toFixed(3)),
      atrPct: Number(atrPct.toFixed(3)),
      breakoutConfirmed,
      breakoutPrice: breakout.price,
      breakoutIndex: breakout.index,
      entryMode,
      entryPrice: Number(structuralEntry.toFixed(8)),
      stopPrice: Number(stop.toFixed(8)),
      targetPrice: Number(target.toFixed(8)),
      riskReward: Number(rr.toFixed(2)),
      minRiskReward: 2,
      volumeRatio: Number(volumeRatio.toFixed(2)),
      volatilityPct: Number(atrPct.toFixed(3)),
      nearbyLevelDistancePct: Number(nearestLevelDistancePct.toFixed(3)),
      filters: { volume: volumeFilter, volatility: volatilityFilter, nearbyLevel: nearbyLevelFilter, structure },
      rejectionReasons: reasons,
      confluence,
    },
  };
}

export function validateFormationSet(klines: Kline[], formations: DetectedFormation[], symbol = 'formation'): DetectedFormation[] {
  const validated = formations.map((f) => ({ ...validateFormation(klines, f), id: stableFormationId(symbol, f) }));
  const dedupe = new Map<string, DetectedFormation>();
  for (const f of validated) {
    const key = `${f.patternKey}|${f.candleStartIndex ?? -1}|${f.candleEndIndex ?? -1}|${Math.round(f.levels.entryPrice * 10000)}`;
    const old = dedupe.get(key);
    if (!old || f.confidence > old.confidence) dedupe.set(key, f);
  }
  return Array.from(dedupe.values()).sort((a, b) => b.confidence - a.confidence);
}

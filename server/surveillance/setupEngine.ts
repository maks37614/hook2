import { ExchangeId, Kline, MarketType, Timeframe } from '../../src/types';
import {
  BTCContextSnapshot,
  DensityItem,
  DetectedPattern,
  LevelZone,
  OISnapshot,
  SetupInstance,
  SetupConfluenceBreakdown,
  SetupConfluenceComponent,
  SetupStage,
  SetupType,
  ThirdTouchTracker,
  TimeframeStructure,
  TradeFlowSnapshot,
} from './types';
import { calculateATR } from './multiTimeframeEngine';

/**
 * Entry Intelligence Engine
 *
 * A formation is only a candidate. An entry is emitted after independent
 * confirmations agree: location -> structure/trigger -> volume/flow ->
 * order book -> OI/context -> risk/reward.
 *
 * The score is a confluence score, NOT a probability of profit.
 */
function roundStep(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  const base = 10 ** Math.floor(Math.log10(price));
  return base >= 1000 ? base : base >= 100 ? base : base >= 10 ? base : base >= 1 ? base : base / 10;
}

function isRoundPrice(price: number): boolean {
  const step = roundStep(price);
  if (!step) return false;
  const distance = Math.abs(price - Math.round(price / step) * step);
  return distance <= step * 0.025;
}

export class SetupEngine {
  private activeSetups = new Map<string, SetupInstance>();

  public evaluateSetups(params: {
    symbol: string;
    exchange: ExchangeId;
    marketType: MarketType;
    currentPrice: number;
    structures: Record<Timeframe, TimeframeStructure>;
    zones: LevelZone[];
    patterns: DetectedPattern[];
    densities: DensityItem[];
    tradeFlow: TradeFlowSnapshot;
    oiSnapshot: OISnapshot;
    btcContext: BTCContextSnapshot;
    thirdTouches: ThirdTouchTracker[];
    rvol?: number;
    orderBookImbalance?: number;
    candles1h?: Kline[];
    candles15m?: Kline[];
    candles5m?: Kline[];
  }): SetupInstance[] {
    const {
      symbol,
      exchange,
      marketType,
      currentPrice,
      structures,
      zones,
      patterns,
      densities,
      tradeFlow,
      oiSnapshot,
      btcContext,
      thirdTouches,
      rvol = 1,
      orderBookImbalance = 0,
      candles1h = [],
      candles15m = [],
      candles5m = [],
    } = params;

    const results: SetupInstance[] = [];
    const candidateZones = this.rankZones(zones, currentPrice).slice(0, 8);
    const bullishPatterns = patterns.filter((p) => p.bias === 'bullish');
    const bearishPatterns = patterns.filter((p) => p.bias === 'bearish');

    for (const zone of candidateZones) {
      if (zone.type === 'SUPPORT') {
        const setup = this.evaluateLongCandidate({
          symbol,
          exchange,
          marketType,
          currentPrice,
          zone,
          patterns: bullishPatterns,
          structures,
          densities,
          tradeFlow,
          oiSnapshot,
          btcContext,
          thirdTouches,
          rvol,
          orderBookImbalance,
          candles1h, candles15m, candles5m,
        });
        if (setup) results.push(setup);
      } else {
        const setup = this.evaluateShortCandidate({
          symbol,
          exchange,
          marketType,
          currentPrice,
          zone,
          patterns: bearishPatterns,
          structures,
          densities,
          tradeFlow,
          oiSnapshot,
          btcContext,
          thirdTouches,
          rvol,
          orderBookImbalance,
          candles1h, candles15m, candles5m,
        });
        if (setup) results.push(setup);
      }
    }

    // Formation-led breakout/retest candidates. These do not require a
    // support/resistance zone to be the primary anchor.
    for (const pattern of patterns.filter((p) => p.status !== 'INVALIDATED').slice(0, 6)) {
      const setup = this.evaluatePatternCandidate({
        symbol,
        exchange,
        marketType,
        currentPrice,
        pattern,
        structures,
        densities,
        tradeFlow,
        oiSnapshot,
        btcContext,
        rvol,
        orderBookImbalance,
        candles1h, candles15m, candles5m,
      });
      if (setup) results.push(setup);
    }

    // Keep the strongest candidate per direction/anchor and expose only
    // actionable/watch states. This prevents the UI/Telegram layer from
    // receiving a flood of weak independent confirmations.
    const deduped = new Map<string, SetupInstance>();
    for (const setup of results) {
      const key = `${setup.direction}:${setup.entryZone.low.toFixed(6)}:${setup.type}`;
      const old = deduped.get(key);
      if (!old || setup.confluenceScore > old.confluenceScore) deduped.set(key, setup);
    }

    const ranked = Array.from(deduped.values())
      .sort((a, b) => b.confluenceScore - a.confluenceScore)
      .slice(0, 12);

    const activeIds = new Set(ranked.map((s) => s.id));
    for (const [id, setup] of this.activeSetups.entries()) {
      if (!activeIds.has(id) && setup.stage !== 'CONFIRMED') {
        setup.stage = 'INVALIDATED';
        setup.updatedAt = Date.now();
      }
    }

    return ranked;
  }

  private evaluateLongCandidate(args: {
    symbol: string; exchange: ExchangeId; marketType: MarketType; currentPrice: number;
    zone: LevelZone; patterns: DetectedPattern[]; structures: Record<Timeframe, TimeframeStructure>;
    densities: DensityItem[]; tradeFlow: TradeFlowSnapshot; oiSnapshot: OISnapshot;
    btcContext: BTCContextSnapshot; thirdTouches: ThirdTouchTracker[]; rvol: number; orderBookImbalance: number; candles1h: Kline[]; candles15m: Kline[]; candles5m: Kline[];
  }): SetupInstance | null {
    const { symbol, exchange, marketType, currentPrice, zone, patterns, structures, densities, tradeFlow, oiSnapshot, btcContext, thirdTouches, rvol, orderBookImbalance, candles1h, candles15m, candles5m } = args;
    const inZone = currentPrice >= zone.zoneLow && currentPrice <= zone.zoneHigh;
    const nearZone = this.distancePct(currentPrice, zone.zoneCenter) <= 0.9;
    if (!nearZone) return null;

    const pattern = this.bestPattern(patterns, currentPrice, zone);
    const htfScore = this.htfLongScore(structures);
    const breakInfo = this.latestDirectionalBreak(structures, 'BULLISH');
    const sweep = this.detectLiquiditySweep(candles15m.length ? candles15m : candles5m, zone, 'LONG');
    const density = this.bestDensity(densities, 'BID', zone.zoneCenter);
    const flowScore = this.longFlowScore(tradeFlow);
    const volumeScore = this.volumeScore(rvol);
    const oiScore = this.longOiScore(oiSnapshot);
    const btcScore = this.btcScore(btcContext, 'LONG');
    const levelScore = Math.min(10, Math.round(zone.strengthScore / 10));
    const patternScore = pattern?.score || 0;
    const triggerScore = this.triggerScore(breakInfo, zone.zoneCenter, currentPrice, 'LONG', sweep);
    const liquidityScore = density?.qualityScore || 0;
    const obiConfirmation = orderBookImbalance >= 0.20;
    const confirmations = this.collectLongConfirmations({ pattern, htfScore, density, flowScore, volumeScore, oiScore, btcScore, break: breakInfo, currentPrice, zone });
    if (obiConfirmation) confirmations.push(`order book imbalance +${orderBookImbalance.toFixed(2)}`);

    const hardGates = [
      pattern ? patternScore >= 55 : false,
      htfScore >= -10,
      inZone || triggerScore >= 10,
      triggerScore >= 10,
      !!breakInfo?.confirmed && !!breakInfo.volumeConfirmed,
      inZone || this.distancePct(currentPrice, zone.zoneCenter) <= 0.35,
    ];
    const hardGatesPassed = hardGates.every(Boolean);

    const rawEntry = this.chooseLongEntry(currentPrice, zone, breakInfo, density);
    const atr = Math.max(candles15m.length >= 15 ? calculateATR(candles15m.slice(-30)) : Math.abs(zone.zoneHigh - zone.zoneLow), rawEntry * 0.002);
    const invalidation = Math.min(zone.zoneLow - atr * 0.15, sweep?.sweepPrice ? sweep.sweepPrice - atr * 0.10 : rawEntry - atr * 0.75);
    const target = rawEntry + Math.abs(rawEntry - invalidation) * 2.2;
    const entryZone = { low: Math.min(rawEntry, zone.zoneCenter), high: Math.max(rawEntry, zone.zoneCenter) };
    const aggressiveEntry = sweep?.reclaimPrice || zone.zoneCenter;
    const confirmationEntry = breakInfo?.price || rawEntry;
    const rr = (target - rawEntry) / Math.max(0.00000001, rawEntry - invalidation);
    const confluence = this.buildConfluence({ direction: 'LONG', patternScore, htfScore, levelScore, triggerScore, volumeScore, flowScore, liquidityScore, oiScore, btcScore, rr, orderBookImbalance, pattern, breakInfo, density, rvol });
    const score = confluence.total;
    const independent = confluence.independentConfirmations;
    const confirmed = hardGatesPassed && independent >= 3 && score >= 78 && rr >= 2;
    const stage: SetupStage = confirmed ? 'CONFIRMED' : breakInfo ? 'CONFIRMING' : sweep ? 'TRIGGERING' : inZone ? 'IN_ZONE' : nearZone ? 'APPROACHING' : 'SUPPORT_APPROACH';

    return this.upsert({
      id: `${symbol}_ENTRY_LONG_${zone.id}`,
      type: breakInfo ? 'BREAKOUT_RETEST' : 'SUPPORT_RETEST',
      symbol, exchange, marketType,
      timeframe: zone.timeframe,
      stage,
      direction: 'LONG',
      entryZone,
      preferredEntry: rawEntry, aggressiveEntry, confirmationEntry,
      targets: [target, rawEntry + Math.abs(rawEntry - invalidation) * 3.2],
      invalidationPrice: invalidation,
      targetPrice: target,
      confluenceScore: score,
      confirmations,
      waitingFor: confirmed ? 'Підтверджений вхід: формація + структура + ≥3 незалежні підтвердження' : `Очікування: ${Math.max(0, 3 - independent)} незалежних підтверджень`,
      evidence: {
        htfStructure: this.structureSummary(structures),
        levelStrength: zone.strengthScore,
        densityPresence: density ? `BID $${(density.notionalUsd / 1e6).toFixed(2)}M, quality ${density.qualityScore}/100, ${density.classification}${isRoundPrice(density.price) ? ' · ROUND NUMBER' : ''}` : 'Немає якісної BID density',
        volumeProfile: `RVOL ${rvol.toFixed(2)}x`,
        oiContext: oiSnapshot.regime,
        btcContext: `${btcContext.trend4h}/${btcContext.trend1h}`,
        formationScore: patternScore,
      },
      confluenceBreakdown: confluence,
      entryQuality: {
        score,
        riskReward: Number(rr.toFixed(2)),
        hardGatesPassed,
        independentConfirmations: independent,
        formationScore: patternScore, htfScore, levelScore, triggerScore, volumeScore, flowScore, orderBookScore: confluence.components.orderBook.score, oiScore, marketContextScore: btcScore,
        structureScore: triggerScore,
        entryType: breakInfo ? 'BOS_RETEST' : 'LIQUIDITY_REACTION',
        preferredEntry: rawEntry, entryZone, invalidation, targets: [target, rawEntry + Math.abs(rawEntry - invalidation) * 3.2],
      },
      createdAt: Date.now(), updatedAt: Date.now(),
    });
  }

  private evaluateShortCandidate(args: {
    symbol: string; exchange: ExchangeId; marketType: MarketType; currentPrice: number;
    zone: LevelZone; patterns: DetectedPattern[]; structures: Record<Timeframe, TimeframeStructure>;
    densities: DensityItem[]; tradeFlow: TradeFlowSnapshot; oiSnapshot: OISnapshot;
    btcContext: BTCContextSnapshot; thirdTouches: ThirdTouchTracker[]; rvol: number; orderBookImbalance: number; candles1h: Kline[]; candles15m: Kline[]; candles5m: Kline[];
  }): SetupInstance | null {
    const { symbol, exchange, marketType, currentPrice, zone, patterns, structures, densities, tradeFlow, oiSnapshot, btcContext, rvol, orderBookImbalance, candles1h, candles15m, candles5m } = args;
    const inZone = currentPrice >= zone.zoneLow && currentPrice <= zone.zoneHigh;
    const nearZone = this.distancePct(currentPrice, zone.zoneCenter) <= 0.9;
    if (!nearZone) return null;

    const pattern = this.bestPattern(patterns, currentPrice, zone);
    const htfScore = this.htfShortScore(structures);
    const breakInfo = this.latestDirectionalBreak(structures, 'BEARISH');
    const sweep = this.detectLiquiditySweep(candles15m.length ? candles15m : candles5m, zone, 'SHORT');
    const density = this.bestDensity(densities, 'ASK', zone.zoneCenter);
    const flowScore = this.shortFlowScore(tradeFlow);
    const volumeScore = this.volumeScore(rvol);
    const oiScore = this.shortOiScore(oiSnapshot);
    const btcScore = this.btcScore(btcContext, 'SHORT');
    const levelScore = Math.min(10, Math.round(zone.strengthScore / 10));
    const patternScore = pattern?.score || 0;
    const triggerScore = this.triggerScore(breakInfo, zone.zoneCenter, currentPrice, 'SHORT', sweep);
    const liquidityScore = density?.qualityScore || 0;
    const obiConfirmation = orderBookImbalance <= -0.20;
    const confirmations = this.collectShortConfirmations({ pattern, htfScore, density, flowScore, volumeScore, oiScore, btcScore, break: breakInfo, currentPrice, zone });
    if (obiConfirmation) confirmations.push(`order book imbalance ${orderBookImbalance.toFixed(2)}`);

    const hardGates = [
      pattern ? patternScore >= 55 : false,
      htfScore >= -10,
      inZone || triggerScore >= 10,
      triggerScore >= 10,
      !!breakInfo?.confirmed && !!breakInfo.volumeConfirmed,
      inZone || this.distancePct(currentPrice, zone.zoneCenter) <= 0.35,
    ];
    const hardGatesPassed = hardGates.every(Boolean);

    const rawEntry = this.chooseShortEntry(currentPrice, zone, breakInfo, density);
    const atr = Math.max(candles15m.length >= 15 ? calculateATR(candles15m.slice(-30)) : Math.abs(zone.zoneHigh - zone.zoneLow), rawEntry * 0.002);
    const invalidation = Math.max(zone.zoneHigh + atr * 0.15, sweep?.sweepPrice ? sweep.sweepPrice + atr * 0.10 : rawEntry + atr * 0.75);
    const target = rawEntry - Math.abs(invalidation - rawEntry) * 2.2;
    const entryZone = { low: Math.min(rawEntry, zone.zoneCenter), high: Math.max(rawEntry, zone.zoneCenter) };
    const aggressiveEntry = sweep?.reclaimPrice || zone.zoneCenter;
    const confirmationEntry = breakInfo?.price || rawEntry;
    const rr = (rawEntry - target) / Math.max(0.00000001, invalidation - rawEntry);
    const confluence = this.buildConfluence({ direction: 'SHORT', patternScore, htfScore, levelScore, triggerScore, volumeScore, flowScore, liquidityScore, oiScore, btcScore, rr, orderBookImbalance, pattern, breakInfo, density, rvol });
    const score = confluence.total;
    const independent = confluence.independentConfirmations;
    const confirmed = hardGatesPassed && independent >= 3 && score >= 78 && rr >= 2;
    const stage: SetupStage = confirmed ? 'CONFIRMED' : breakInfo ? 'CONFIRMING' : sweep ? 'TRIGGERING' : inZone ? 'IN_ZONE' : nearZone ? 'APPROACHING' : 'SUPPORT_APPROACH';

    return this.upsert({
      id: `${symbol}_ENTRY_SHORT_${zone.id}`,
      type: breakInfo ? 'BREAKOUT_RETEST' : 'RESISTANCE_REJECTION',
      symbol, exchange, marketType,
      timeframe: zone.timeframe,
      stage,
      direction: 'SHORT',
      entryZone,
      preferredEntry: rawEntry, aggressiveEntry, confirmationEntry,
      targets: [target, rawEntry - Math.abs(invalidation - rawEntry) * 3.2],
      invalidationPrice: invalidation,
      targetPrice: target,
      confluenceScore: score,
      confirmations,
      waitingFor: confirmed ? 'Підтверджений вхід: формація + структура + ≥3 незалежні підтвердження' : `Очікування: ${Math.max(0, 3 - independent)} незалежних підтверджень`,
      evidence: {
        htfStructure: this.structureSummary(structures),
        levelStrength: zone.strengthScore,
        densityPresence: density ? `ASK $${(density.notionalUsd / 1e6).toFixed(2)}M, quality ${density.qualityScore}/100, ${density.classification}${isRoundPrice(density.price) ? ' · ROUND NUMBER' : ''}` : 'Немає якісної ASK density',
        volumeProfile: `RVOL ${rvol.toFixed(2)}x`,
        oiContext: oiSnapshot.regime,
        btcContext: `${btcContext.trend4h}/${btcContext.trend1h}`,
        formationScore: patternScore,
      },
      confluenceBreakdown: confluence,
      entryQuality: {
        score,
        riskReward: Number(rr.toFixed(2)),
        hardGatesPassed,
        independentConfirmations: independent,
        formationScore: patternScore, htfScore, levelScore, triggerScore, volumeScore, flowScore, orderBookScore: confluence.components.orderBook.score, oiScore, marketContextScore: btcScore,
        structureScore: triggerScore,
        entryType: breakInfo ? 'BOS_RETEST' : 'LIQUIDITY_REACTION',
        preferredEntry: rawEntry, entryZone, invalidation, targets: [target, rawEntry - Math.abs(invalidation - rawEntry) * 3.2],
      },
      createdAt: Date.now(), updatedAt: Date.now(),
    });
  }

  private evaluatePatternCandidate(args: {
    symbol: string; exchange: ExchangeId; marketType: MarketType; currentPrice: number;
    pattern: DetectedPattern; structures: Record<Timeframe, TimeframeStructure>; densities: DensityItem[];
    tradeFlow: TradeFlowSnapshot; oiSnapshot: OISnapshot; btcContext: BTCContextSnapshot; rvol: number; orderBookImbalance: number; candles1h: Kline[]; candles15m: Kline[]; candles5m: Kline[];
  }): SetupInstance | null {
    const { symbol, exchange, marketType, currentPrice, pattern, structures, densities, tradeFlow, oiSnapshot, btcContext, rvol, orderBookImbalance, candles1h, candles15m, candles5m } = args;
    if (pattern.bias === 'neutral') return null;

    const direction = pattern.bias === 'bullish' ? 'LONG' : 'SHORT';
    const boundary = direction === 'LONG' ? pattern.upperBoundary : pattern.lowerBoundary;
    const distance = this.distancePct(currentPrice, boundary);
    if (distance > 1.2) return null;

    const breakInfo = this.latestDirectionalBreak(structures, direction === 'LONG' ? 'BULLISH' : 'BEARISH');
    const patternZone: LevelZone = { id: `pattern_${pattern.name}`, timeframe: pattern.timeframe, type: direction === 'LONG' ? 'SUPPORT' : 'RESISTANCE', zoneLow: pattern.lowerBoundary, zoneHigh: pattern.upperBoundary, zoneCenter: boundary, touches: Math.max(pattern.touchesUpper, pattern.touchesLower), strongReactions: 0, weakReactions: 0, averageReactionPct: 0, maxReactionPct: 0, strengthScore: 70, firstSeen: Date.now(), lastTouchTime: Date.now() };
    const sweep = this.detectLiquiditySweep(candles15m.length ? candles15m : candles5m, patternZone, direction);
    const density = this.bestDensity(densities, direction === 'LONG' ? 'BID' : 'ASK', boundary);
    const flowScore = direction === 'LONG' ? this.longFlowScore(tradeFlow) : this.shortFlowScore(tradeFlow);
    const volumeScore = this.volumeScore(rvol);
    const oiScore = direction === 'LONG' ? this.longOiScore(oiSnapshot) : this.shortOiScore(oiSnapshot);
    const btcScore = this.btcScore(btcContext, direction);
    const triggerScore = this.triggerScore(breakInfo, boundary, currentPrice, direction, sweep);
    const htfScore = this.htfScore(structures, direction);
    const levelScore = 7;
    const patternScore = pattern.score;
    const liquidityScore = density?.qualityScore || 0;
    const confirmations = [
      `formation ${pattern.name} (${pattern.score}/100)`,
      ...(Math.abs(this.htfScore(structures, direction)) >= 35 ? ['HTF structure aligned'] : []),
      ...(breakInfo ? [`${breakInfo.type} ${breakInfo.direction} confirmed`] : []),
      ...(volumeScore >= 7 ? [`RVOL ${rvol.toFixed(2)}x`] : []),
      ...(flowScore >= 7 ? ['aggressive flow aligned'] : []),
      ...(density && liquidityScore >= 55 ? [`${density.side} density quality ${liquidityScore}/100`] : []),
      ...(density && isRoundPrice(density.price) && liquidityScore >= 65 ? [`кругле число + ${density.side} density на $${density.price}`] : []),
      ...(direction === 'LONG' && orderBookImbalance >= 0.20 ? [`order book imbalance +${orderBookImbalance.toFixed(2)}`] : []),
      ...(direction === 'SHORT' && orderBookImbalance <= -0.20 ? [`order book imbalance ${orderBookImbalance.toFixed(2)}`] : []),
      ...(oiScore >= 4 ? ['OI regime aligned'] : []),
      ...(btcScore >= 4 ? ['BTC context aligned'] : []),
    ];
    const entry = breakInfo ? (breakInfo.price + boundary) / 2 : boundary;
    const risk = Math.abs(entry - boundary) * 1.5 + Math.max(entry * 0.003, 0.00000001);
    const target = direction === 'LONG' ? entry + risk * 2.2 : entry - risk * 2.2;
    const rr = 2.2;
    const confluence = this.buildConfluence({
      direction,
      patternScore: pattern.score,
      htfScore,
      levelScore,
      triggerScore,
      volumeScore,
      flowScore,
      liquidityScore,
      oiScore,
      btcScore,
      rr,
      orderBookImbalance,
      pattern,
      breakInfo,
      density,
      rvol,
    });
    const score = confluence.total;
    const independent = confluence.independentConfirmations;
    const hardGatesPassed = pattern.status === 'BROKEN' && triggerScore >= 10 && !!breakInfo?.volumeConfirmed && independent >= 3 && rr >= 2 && this.distancePct(currentPrice, entry) <= 0.35;
    const confirmed = hardGatesPassed && independent >= 3 && score >= 78;

    return this.upsert({
      id: `${symbol}_FORMATION_${direction}_${pattern.name.replace(/\s+/g, '_')}`,
      type: breakInfo ? 'BREAKOUT_RETEST' : 'STRUCTURE_SHIFT',
      symbol, exchange, marketType,
      timeframe: pattern.timeframe,
      stage: confirmed ? 'CONFIRMED' : breakInfo ? 'CONFIRMING' : sweep ? 'TRIGGERING' : distance <= 0.35 ? 'IN_ZONE' : 'APPROACHING',
      direction,
      entryZone: { low: Math.min(entry, boundary), high: Math.max(entry, boundary) },
      preferredEntry: entry, aggressiveEntry: sweep?.reclaimPrice || boundary, confirmationEntry: breakInfo?.price || entry,
      targets: [target, direction === 'LONG' ? entry + risk * 3.2 : entry - risk * 3.2],
      invalidationPrice: direction === 'LONG' ? entry - risk : entry + risk,
      targetPrice: target,
      confluenceScore: score,
      confirmations,
      waitingFor: confirmed ? 'Підтверджений breakout/retest' : `Очікування: ${Math.max(0, 3 - independent)} незалежних підтверджень`,
      evidence: {
        htfStructure: this.structureSummary(structures),
        levelStrength: 0,
        densityPresence: density ? `${density.side} quality ${density.qualityScore}/100${isRoundPrice(density.price) ? ' · ROUND NUMBER' : ''}` : 'Немає якісної density',
        volumeProfile: `RVOL ${rvol.toFixed(2)}x`,
        oiContext: oiSnapshot.regime,
        btcContext: `${btcContext.trend4h}/${btcContext.trend1h}`,
        formationScore: pattern.score,
      },
      confluenceBreakdown: confluence,
      entryQuality: {
        score,
        riskReward: rr,
        hardGatesPassed,
        independentConfirmations: independent,
        formationScore: patternScore, htfScore, levelScore, triggerScore, volumeScore, flowScore, orderBookScore: confluence.components.orderBook.score, oiScore, marketContextScore: btcScore,
        structureScore: triggerScore,
        entryType: breakInfo ? 'BREAKOUT_RETEST' : 'BOS_RETEST',
        preferredEntry: entry, entryZone: { low: Math.min(entry, boundary), high: Math.max(entry, boundary) }, invalidation: direction === 'LONG' ? entry - risk : entry + risk, targets: [target, direction === 'LONG' ? entry + risk * 3.2 : entry - risk * 3.2],
      },
      createdAt: Date.now(), updatedAt: Date.now(),
    });
  }

  private upsert(setup: SetupInstance): SetupInstance {
    const old = this.activeSetups.get(setup.id);
    if (old) setup.createdAt = old.createdAt;
    this.activeSetups.set(setup.id, setup);
    return setup;
  }

  private rankZones(zones: LevelZone[], price: number): LevelZone[] {
    return zones
      .filter((z) => z.strengthScore >= 45)
      .map((z) => ({ z, proximity: this.distancePct(price, z.zoneCenter) }))
      .filter((x) => x.proximity <= 1.5)
      .sort((a, b) => (b.z.strengthScore - a.z.strengthScore) || (a.proximity - b.proximity))
      .map((x) => x.z);
  }

  private bestPattern(patterns: DetectedPattern[], price: number, zone: LevelZone): DetectedPattern | undefined {
    return patterns
      .filter((p) => p.status !== 'INVALIDATED')
      .sort((a, b) => this.patternFit(b, price, zone) - this.patternFit(a, price, zone))[0];
  }

  private patternFit(p: DetectedPattern, price: number, zone: LevelZone): number {
    const boundary = p.bias === 'bullish' ? p.upperBoundary : p.lowerBoundary;
    const location = Math.max(0, 10 - this.distancePct(price, boundary) * 5);
    const zoneMatch = (p.bias === 'bullish' && zone.type === 'SUPPORT') || (p.bias === 'bearish' && zone.type === 'RESISTANCE') ? 10 : 0;
    return p.score + location + zoneMatch;
  }

  private bestDensity(densities: DensityItem[], side: 'BID' | 'ASK', price: number): DensityItem | undefined {
    return densities
      .filter((d) => d.side === side && d.classification !== 'POSSIBLE_SPOOF' && this.distancePct(d.price, price) <= 0.6)
      .sort((a, b) => {
        const aRound = isRoundPrice(a.price) ? 1 : 0;
        const bRound = isRoundPrice(b.price) ? 1 : 0;
        return (bRound - aRound) || ((b.qualityScore || 0) - (a.qualityScore || 0)) || (a.distancePct - b.distancePct);
      })[0];
  }

  private latestDirectionalBreak(structures: Record<Timeframe, TimeframeStructure>, direction: 'BULLISH' | 'BEARISH') {
    const allowed: Timeframe[] = ['5m', '15m', '1h'];
    const now = Date.now();
    return Object.values(structures)
      .filter((s) => allowed.includes(s.timeframe) && s.lastBreak?.direction === direction && s.lastBreak.confirmed)
      .filter((s) => !!s.lastBreak && now - s.lastBreak.time <= 6 * 60 * 60 * 1000)
      .sort((a, b) => {
        const weight = (tf: Timeframe) => tf === '5m' ? 3 : tf === '15m' ? 2 : 1;
        return weight(b.timeframe) - weight(a.timeframe) || (b.lastBreak?.time || 0) - (a.lastBreak?.time || 0);
      })[0]?.lastBreak;
  }

  private triggerScore(breakInfo: TimeframeStructure['lastBreak'], level: number, price: number, direction: 'LONG' | 'SHORT', sweep?: { sweepPrice: number; reclaimPrice: number }): number {
    if (!breakInfo) return 0;
    if (direction === 'LONG' && breakInfo.direction !== 'BULLISH') return 0;
    if (direction === 'SHORT' && breakInfo.direction !== 'BEARISH') return 0;
    const distance = this.distancePct(price, level);
    return Math.min(20, 5 + (sweep ? 5 : 0) + 5 + (breakInfo.volumeConfirmed ? 5 : 0) + (distance <= 0.8 ? 5 : 0));
  }

  private detectLiquiditySweep(candles: Kline[], zone: LevelZone, direction: 'LONG' | 'SHORT'): { sweepPrice: number; reclaimPrice: number } | undefined {
    if (!candles || candles.length < 4) return undefined;
    const normalize = (t: number) => t > 2_000_000_000_000 ? t : t * 1000;
    const lastCandle = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const interval = lastCandle && prev ? Math.max(1000, normalize(lastCandle.time) - normalize(prev.time)) : 0;
    const closed = lastCandle && interval > 0 && Date.now() < normalize(lastCandle.time) + interval ? candles.slice(0, -1) : candles;
    const recent = closed.slice(-4);
    const tolerance = Math.max((zone.zoneHigh - zone.zoneLow) * 0.25, zone.zoneCenter * 0.0015);
    const last = recent[recent.length - 1];
    if (direction === 'LONG') {
      const swept = recent.slice(0, -1).find(c => c.low < zone.zoneLow - tolerance * 0.05);
      if (swept && last.close > zone.zoneCenter && last.close > last.open) return { sweepPrice: swept.low, reclaimPrice: last.close };
    } else {
      const swept = recent.slice(0, -1).find(c => c.high > zone.zoneHigh + tolerance * 0.05);
      if (swept && last.close < zone.zoneCenter && last.close < last.open) return { sweepPrice: swept.high, reclaimPrice: last.close };
    }
    return undefined;
  }

  private longFlowScore(flow: TradeFlowSnapshot): number {
    let score = flow.imbalanceRatio >= 1.6 ? 7 : flow.imbalanceRatio >= 1.3 ? 5 : flow.imbalanceRatio >= 1.1 ? 2 : 0;
    if ((flow.deltaZScore || 0) >= 1.5) score += 2;
    if ((flow.deltaAcceleration || 0) > 0) score += 1;
    return Math.min(10, score);
  }

  private shortFlowScore(flow: TradeFlowSnapshot): number {
    let score = flow.imbalanceRatio <= 0.625 ? 7 : flow.imbalanceRatio <= 0.77 ? 5 : flow.imbalanceRatio <= 0.91 ? 2 : 0;
    if ((flow.deltaZScore || 0) <= -1.5) score += 2;
    if ((flow.deltaAcceleration || 0) < 0) score += 1;
    return Math.min(10, score);
  }

  private volumeScore(rvol: number): number {
    if (rvol >= 2) return 10;
    if (rvol >= 1.5) return 8;
    if (rvol >= 1.2) return 5;
    return 0;
  }

  private longOiScore(oi: OISnapshot): number {
    if (oi.regime === 'PRICE_UP_OI_UP') return 5;
    if (oi.regime === 'PRICE_UP_OI_DOWN') return 3;
    return 0;
  }

  private shortOiScore(oi: OISnapshot): number {
    if (oi.regime === 'PRICE_DOWN_OI_UP') return 5;
    if (oi.regime === 'PRICE_DOWN_OI_DOWN') return 3;
    return 0;
  }

  private btcScore(ctx: BTCContextSnapshot, direction: 'LONG' | 'SHORT'): number {
    const trends = [ctx.trend4h, ctx.trend1h, ctx.trend15m];
    if (direction === 'LONG') return trends.filter((t) => t === 'Bullish').length * 2;
    return trends.filter((t) => t === 'Bearish').length * 2;
  }

  private htfScore(structures: Record<Timeframe, TimeframeStructure>, direction: 'LONG' | 'SHORT'): number {
    const tfs: Timeframe[] = ['1d', '4h', '1h'];
    const values = tfs.map((tf) => structures[tf]?.score || 0);
    const avg = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
    return direction === 'LONG' ? avg : -avg;
  }

  private htfLongScore(structures: Record<Timeframe, TimeframeStructure>): number { return this.htfScore(structures, 'LONG'); }
  private htfShortScore(structures: Record<Timeframe, TimeframeStructure>): number { return this.htfScore(structures, 'SHORT'); }

  private collectLongConfirmations(args: {
    pattern?: DetectedPattern; htfScore: number; density?: DensityItem; flowScore: number; volumeScore: number;
    oiScore: number; btcScore: number; break?: TimeframeStructure['lastBreak']; currentPrice: number; zone: LevelZone;
  }): string[] {
    const out: string[] = [];
    if (args.pattern && args.pattern.score >= 55) out.push(`formation ${args.pattern.name} (${args.pattern.score}/100)`);
    if (args.htfScore >= 20) out.push('HTF bullish structure');
    if (args.break) out.push(`${args.break.type} bullish confirmed`);
    if (args.density && (args.density.qualityScore || 0) >= 55) out.push(`bid density quality ${args.density.qualityScore}/100`);
    if (args.density && isRoundPrice(args.density.price) && (args.density.qualityScore || 0) >= 65) out.push(`round-number BID density at ${args.density.price}`);
    if (args.flowScore >= 7) out.push('aggressive buy flow');
    if (args.volumeScore >= 7) out.push('volume expansion');
    if (args.oiScore >= 4) out.push('OI regime aligned');
    if (args.btcScore >= 4) out.push('BTC context aligned');
    if (this.distancePct(args.currentPrice, args.zone.zoneCenter) <= 0.25) out.push('price at reaction zone');
    return out;
  }

  private collectShortConfirmations(args: {
    pattern?: DetectedPattern; htfScore: number; density?: DensityItem; flowScore: number; volumeScore: number;
    oiScore: number; btcScore: number; break?: TimeframeStructure['lastBreak']; currentPrice: number; zone: LevelZone;
  }): string[] {
    const out: string[] = [];
    if (args.pattern && args.pattern.score >= 55) out.push(`formation ${args.pattern.name} (${args.pattern.score}/100)`);
    if (args.htfScore >= 20) out.push('HTF bearish structure');
    if (args.break) out.push(`${args.break.type} bearish confirmed`);
    if (args.density && (args.density.qualityScore || 0) >= 55) out.push(`ask density quality ${args.density.qualityScore}/100`);
    if (args.density && isRoundPrice(args.density.price) && (args.density.qualityScore || 0) >= 65) out.push(`round-number ASK density at ${args.density.price}`);
    if (args.flowScore >= 7) out.push('aggressive sell flow');
    if (args.volumeScore >= 7) out.push('volume expansion');
    if (args.oiScore >= 4) out.push('OI regime aligned');
    if (args.btcScore >= 4) out.push('BTC context aligned');
    if (this.distancePct(args.currentPrice, args.zone.zoneCenter) <= 0.25) out.push('price at reaction zone');
    return out;
  }

  private independentConfirmationCount(confirmations: string[]): number {
    const groups = new Set<string>();
    for (const c of confirmations) {
      const x = c.toLowerCase();
      if (x.includes('formation')) groups.add('formation');
      else if (x.includes('htf')) groups.add('htf');
      else if (x.includes('bos') || x.includes('choch')) groups.add('structure');
      else if (x.includes('density')) groups.add('orderbook');
      else if (x.includes('flow')) groups.add('flow');
      else if (x.includes('volume')) groups.add('volume');
      else if (x.includes('oi')) groups.add('oi');
      else if (x.includes('btc')) groups.add('btc');
    }
    return groups.size;
  }

  private confluenceGrade(total: number): SetupConfluenceBreakdown['grade'] {
    if (total >= 90) return 'A+';
    if (total >= 82) return 'A';
    if (total >= 72) return 'B';
    if (total >= 60) return 'C';
    return 'D';
  }

  private component(score: number, max: number, evidence: string, status?: SetupConfluenceComponent['status']): SetupConfluenceComponent {
    const safe = Math.max(0, Math.min(max, score));
    const resolved = status ?? (safe >= max * 0.8 ? 'STRONG' : safe >= max * 0.5 ? 'GOOD' : safe > 0 ? 'WEAK' : 'MISSING');
    return { score: Number(safe.toFixed(1)), max, status: resolved, evidence };
  }

  private buildConfluence(parts: {
    direction: 'LONG' | 'SHORT'; patternScore: number; htfScore: number; levelScore: number; triggerScore: number;
    volumeScore: number; flowScore: number; liquidityScore: number; oiScore: number; btcScore: number; rr: number;
    orderBookImbalance: number; pattern?: DetectedPattern; breakInfo?: TimeframeStructure['lastBreak']; density?: DensityItem; rvol: number;
  }): SetupConfluenceBreakdown {
    const { direction, patternScore, htfScore, levelScore, triggerScore, volumeScore, flowScore, liquidityScore, oiScore, btcScore, rr, orderBookImbalance, pattern, breakInfo, density, rvol } = parts;
    const conflicts: string[] = [];
    const missing: string[] = [];
    const notes: string[] = [];

    const formation = this.component(Math.min(15, patternScore * 0.15), 15, pattern ? `${pattern.name}: ${patternScore}/100` : 'Формація не знайдена');
    const htf = this.component(Math.min(15, Math.max(0, htfScore) * 0.15), 15, `HTF alignment ${Math.round(htfScore)}/100`, htfScore >= 45 ? 'STRONG' : htfScore >= 20 ? 'GOOD' : htfScore > 0 ? 'WEAK' : 'MISSING');
    const location = this.component(Math.min(10, levelScore), 10, `Ключова зона ${levelScore}/10`);
    const trigger = this.component(Math.min(20, triggerScore), 20, breakInfo ? `${breakInfo.type} ${breakInfo.direction}, volume=${breakInfo.volumeConfirmed ? 'confirmed' : 'not confirmed'}` : 'Немає підтвердженого structural trigger', breakInfo ? (breakInfo.volumeConfirmed ? 'STRONG' : 'GOOD') : 'MISSING');
    const volume = this.component(Math.min(10, volumeScore), 10, `RVOL ${rvol.toFixed(2)}x`, volumeScore >= 8 ? 'STRONG' : volumeScore >= 5 ? 'GOOD' : volumeScore > 0 ? 'WEAK' : 'MISSING');
    const flow = this.component(Math.min(10, flowScore), 10, `Aggressive flow score ${flowScore}/10`, flowScore >= 8 ? 'STRONG' : flowScore >= 5 ? 'GOOD' : flowScore > 0 ? 'WEAK' : 'MISSING');

    const directionalObi = direction === 'LONG' ? orderBookImbalance : -orderBookImbalance;
    let bookScore = Math.min(7, liquidityScore * 0.07);
    if (directionalObi >= 0.35) bookScore += 3;
    else if (directionalObi >= 0.20) bookScore += 2;
    else if (directionalObi < 0) bookScore -= 2;
    if (density && isRoundPrice(density.price) && liquidityScore >= 65) {
      bookScore = Math.min(10, bookScore + 1.5);
      notes.push(`ROUND + DENSITY: ${density.side} ${density.price}`);
    }
    const orderBook = this.component(bookScore, 10, density ? `${density.side} quality ${Math.round(liquidityScore)}/100; OBI ${orderBookImbalance.toFixed(2)}${isRoundPrice(density.price) ? '; round price' : ''}` : `OBI ${orderBookImbalance.toFixed(2)}, density missing`, bookScore >= 8 ? 'STRONG' : bookScore >= 5 ? 'GOOD' : bookScore > 0 ? 'WEAK' : 'MISSING');

    const oi = this.component(Math.min(5, oiScore), 5, `OI regime score ${oiScore}/5`, oiScore >= 4 ? 'STRONG' : oiScore >= 2 ? 'GOOD' : oiScore > 0 ? 'WEAK' : 'MISSING');
    const marketContext = this.component(Math.min(5, btcScore), 5, `BTC/market alignment ${btcScore}/5`, btcScore >= 4 ? 'STRONG' : btcScore >= 2 ? 'GOOD' : btcScore > 0 ? 'WEAK' : 'MISSING');

    if (htfScore < -10) conflicts.push('Старший таймфрейм працює проти напрямку');
    if (directionalObi < -0.15) conflicts.push('Order-book imbalance проти напрямку');
    if (flowScore === 0) missing.push('Order flow');
    if (volumeScore === 0) missing.push('Volume confirmation');
    if (!breakInfo) missing.push('BOS/CHoCH');
    if (!density || liquidityScore < 55) missing.push('Якісна liquidity density');
    if (oiScore === 0) missing.push('OI confirmation');
    if (btcScore === 0) missing.push('BTC/market context');
    if (rr < 2) conflicts.push(`R:R ${rr.toFixed(2)} < 2.0`);
    if (breakInfo?.volumeConfirmed) notes.push('Structural break має volume confirmation');
    if (density?.classification === 'PERSISTENT_LIQUIDITY') notes.push('Density persistent');
    if (density?.replenishmentRate && density.replenishmentRate > 0.25) notes.push('Density replenishment активний');

    const components = { formation, htf, location, trigger, volume, orderFlow: flow, orderBook, oi, marketContext };
    const rawTotal = Object.values(components).reduce((sum, c) => sum + c.score, 0);
    const conflictPenalty = Math.min(15, conflicts.length * 5);
    const total = Number(Math.max(0, rawTotal - conflictPenalty).toFixed(1));
    if (conflictPenalty > 0) notes.push(`Conflict penalty: -${conflictPenalty}`);
    const independent = [
      trigger.score >= 12,
      volume.score >= 5,
      flow.score >= 5,
      orderBook.score >= 5,
      oi.score >= 2,
      marketContext.score >= 2,
    ].filter(Boolean).length;

    return { total, grade: this.confluenceGrade(total), components, independentConfirmations: independent, conflicts, missing, notes };
  }

  private chooseLongEntry(price: number, zone: LevelZone, breakInfo?: TimeframeStructure['lastBreak'], density?: DensityItem): number {
    if (breakInfo && breakInfo.price > zone.zoneCenter) return (breakInfo.price + zone.zoneCenter) / 2;
    // #19: Only verified, persistent, high-quality liquidity walls should act as entry price anchor
    const isVerifiedDensity =
      density &&
      density.classification === 'PERSISTENT_LIQUIDITY' &&
      (density.qualityScore || 0) >= 55 &&
      (density.ageSeconds || 0) >= 45;
    if (isVerifiedDensity && density.price >= zone.zoneLow && density.price <= zone.zoneHigh) return density.price;
    return Math.min(Math.max(price, zone.zoneLow), zone.zoneHigh);
  }

  private chooseShortEntry(price: number, zone: LevelZone, breakInfo?: TimeframeStructure['lastBreak'], density?: DensityItem): number {
    if (breakInfo && breakInfo.price < zone.zoneCenter) return (breakInfo.price + zone.zoneCenter) / 2;
    const isVerifiedDensity =
      density &&
      density.classification === 'PERSISTENT_LIQUIDITY' &&
      (density.qualityScore || 0) >= 55 &&
      (density.ageSeconds || 0) >= 45;
    if (isVerifiedDensity && density.price >= zone.zoneLow && density.price <= zone.zoneHigh) return density.price;
    return Math.min(Math.max(price, zone.zoneLow), zone.zoneHigh);
  }

  private distancePct(a: number, b: number): number {
    return Math.abs(a - b) / Math.max(Math.abs(b), 0.00000001) * 100;
  }

  private structureSummary(structures: Record<Timeframe, TimeframeStructure>): string {
    return (['1d', '4h', '1h', '15m', '5m'] as Timeframe[]).map((tf) => `${tf}:${structures[tf]?.trend || 'NA'}`).join(' | ');
  }

  public getActiveSetups(): SetupInstance[] {
    return Array.from(this.activeSetups.values()).sort((a, b) => b.confluenceScore - a.confluenceScore);
  }
}

import { Kline, Timeframe } from '../../src/types';
import { calculateATR } from './multiTimeframeEngine';
import { DetectedPattern, LevelZone, ThirdTouchTracker } from './types';

export class LevelsAndFormationsEngine {
  private levelZones: LevelZone[] = [];
  private thirdTouchTrackers = new Map<string, ThirdTouchTracker>();

  public findSupportResistanceZones(candles1d: Kline[], candles4h: Kline[], candles1h: Kline[]): LevelZone[] {
    const zones: LevelZone[] = [];

    const analyzeCandlesForZones = (candles: Kline[], tf: Timeframe, weight: number) => {
      if (candles.length < 10) return;
      const atr = calculateATR(candles);
      const zoneTolerance = atr * 0.35; // Zone width proportional to volatility

      // Group swing highs & lows
      for (let i = 2; i < candles.length - 2; i++) {
        const c = candles[i];
        const isHigh = c.high >= candles[i - 1].high && c.high >= candles[i - 2].high &&
                       c.high >= candles[i + 1].high && c.high >= candles[i + 2].high;
        const isLow = c.low <= candles[i - 1].low && c.low <= candles[i - 2].low &&
                      c.low <= candles[i + 1].low && c.low <= candles[i + 2].low;

        if (isHigh) {
          this.clusterZone(zones, tf, 'RESISTANCE', c.high, zoneTolerance, c.time, weight);
        }
        if (isLow) {
          this.clusterZone(zones, tf, 'SUPPORT', c.low, zoneTolerance, c.time, weight);
        }
      }
    };

    analyzeCandlesForZones(candles1d, '1d', 35);
    analyzeCandlesForZones(candles4h, '4h', 30);
    analyzeCandlesForZones(candles1h, '1h', 20);

    // Calculate level strength score (0-100) and reaction stats
    for (const z of zones) {
      const touchScore = Math.min(40, z.touches * 10);
      const reactionScore = Math.min(30, (z.strongReactions / Math.max(1, z.touches)) * 30);
      const tfScore = z.timeframe === '1d' ? 30 : z.timeframe === '4h' ? 20 : 10;
      z.strengthScore = Math.min(100, Math.round(touchScore + reactionScore + tfScore));
      z.averageReactionPct = Number((z.averageReactionPct / Math.max(1, z.touches)).toFixed(2));
    }

    this.levelZones = zones.sort((a, b) => b.strengthScore - a.strengthScore);
    return this.levelZones;
  }

  private clusterZone(
    zones: LevelZone[],
    tf: Timeframe,
    type: 'SUPPORT' | 'RESISTANCE',
    price: number,
    tolerance: number,
    time: number,
    weight: number
  ) {
    const existing = zones.find((z) => z.type === type && Math.abs(z.zoneCenter - price) <= tolerance);
    if (existing) {
      existing.touches += 1;
      existing.zoneLow = Math.min(existing.zoneLow, price - tolerance * 0.5);
      existing.zoneHigh = Math.max(existing.zoneHigh, price + tolerance * 0.5);
      existing.zoneCenter = (existing.zoneLow + existing.zoneHigh) / 2;
      existing.lastTouchTime = Math.max(existing.lastTouchTime, time);
      existing.strongReactions += 1;
      existing.averageReactionPct += 1.5;
      existing.maxReactionPct = Math.max(existing.maxReactionPct, 2.2);
    } else {
      zones.push({
        id: `zone_${tf}_${type}_${Math.round(price)}`,
        timeframe: tf,
        type,
        zoneLow: price - tolerance * 0.5,
        zoneHigh: price + tolerance * 0.5,
        zoneCenter: price,
        touches: 1,
        strongReactions: 1,
        weakReactions: 0,
        averageReactionPct: 1.5,
        maxReactionPct: 1.5,
        strengthScore: weight,
        firstSeen: time,
        lastTouchTime: time,
      });
    }
  }

  public trackThirdTouch(currentPrice: number, candles1h: Kline[]): ThirdTouchTracker[] {
    const activeTrackers: ThirdTouchTracker[] = [];
    const atr = calculateATR(candles1h);

    for (const zone of this.levelZones) {
      if (zone.touches < 2) continue; // Needs at least 2 prior confirmed touches

      const dist = Math.abs(currentPrice - zone.zoneCenter);
      const distPct = (dist / zone.zoneCenter) * 100;
      const approachThresholdPct = (atr / zone.zoneCenter) * 100 * 1.5;

      let tracker = this.thirdTouchTrackers.get(zone.id);
      if (!tracker) {
        tracker = {
          levelId: zone.id,
          levelType: zone.type,
          price: zone.zoneCenter,
          touchCount: zone.touches,
          state: 'NOT_EXPECTED',
          distancePct: Number(distPct.toFixed(3)),
          approachSpeed: 'NORMAL',
          compression: false,
          higherLowsCount: 0,
          lowerHighsCount: 0,
          volumeRatio: 1.0,
          updatedAt: Date.now(),
        };
        this.thirdTouchTrackers.set(zone.id, tracker);
      }

      tracker.distancePct = Number(distPct.toFixed(3));
      tracker.touchCount = zone.touches;

      // In zone or approaching
      if (distPct <= approachThresholdPct) {
        if (currentPrice >= zone.zoneLow && currentPrice <= zone.zoneHigh) {
          tracker.state = 'ACTIVE';
        } else {
          tracker.state = 'APPROACHING';
        }

        // Check compression into level
        const recent10 = candles1h.slice(-10);
        let hlCount = 0;
        let lhCount = 0;
        for (let i = 1; i < recent10.length; i++) {
          if (recent10[i].low > recent10[i - 1].low) hlCount++;
          if (recent10[i].high < recent10[i - 1].high) lhCount++;
        }

        tracker.higherLowsCount = hlCount;
        tracker.lowerHighsCount = lhCount;
        tracker.compression = (zone.type === 'RESISTANCE' && hlCount >= 4) || (zone.type === 'SUPPORT' && lhCount >= 4);

        activeTrackers.push(tracker);
      } else {
        if (tracker.state === 'ACTIVE' || tracker.state === 'APPROACHING') {
          tracker.state = 'REACTION';
        }
      }
    }

    return activeTrackers;
  }

  public detectFormations(candles1h: Kline[], currentPrice: number): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    if (candles1h.length < 25) return patterns;

    const slice = candles1h.slice(-30);
    const highs = slice.map((c) => c.high);
    const lows = slice.map((c) => c.low);

    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const rangeSpan = maxHigh - minLow;
    if (rangeSpan <= 0) return patterns;

    // 1. Double Top
    const swingHighs = slice.filter((c, i, arr) => i > 1 && i < arr.length - 2 && c.high >= arr[i - 1].high && c.high >= arr[i + 1].high);
    if (swingHighs.length >= 2) {
      const top1 = swingHighs[swingHighs.length - 2];
      const top2 = swingHighs[swingHighs.length - 1];
      const diffPct = Math.abs(top1.high - top2.high) / top1.high;
      if (diffPct <= 0.008) {
        patterns.push({
          name: 'Double Top',
          type: 'Double Top',
          bias: 'bearish',
          score: 82,
          upperBoundary: Math.max(top1.high, top2.high),
          lowerBoundary: minLow,
          touchesUpper: 2,
          touchesLower: 1,
          compression: false,
          timeframe: '1h',
          status: 'READY',
        });
      }
    }

    // 2. Double Bottom
    const swingLows = slice.filter((c, i, arr) => i > 1 && i < arr.length - 2 && c.low <= arr[i - 1].low && c.low <= arr[i + 1].low);
    if (swingLows.length >= 2) {
      const bot1 = swingLows[swingLows.length - 2];
      const bot2 = swingLows[swingLows.length - 1];
      const diffPct = Math.abs(bot1.low - bot2.low) / bot1.low;
      if (diffPct <= 0.008) {
        patterns.push({
          name: 'Double Bottom',
          type: 'Double Bottom',
          bias: 'bullish',
          score: 84,
          upperBoundary: maxHigh,
          lowerBoundary: Math.min(bot1.low, bot2.low),
          touchesUpper: 1,
          touchesLower: 2,
          compression: false,
          timeframe: '1h',
          status: 'READY',
        });
      }
    }

    // 3. Ascending Triangle (Flat Resistance + Higher Lows)
    let higherLowsInSlice = 0;
    for (let i = 1; i < swingLows.length; i++) {
      if (swingLows[i].low > swingLows[i - 1].low) higherLowsInSlice++;
    }
    const touchesHigh = highs.filter((h) => Math.abs(h - maxHigh) / maxHigh <= 0.006).length;
    if (touchesHigh >= 3 && higherLowsInSlice >= 2) {
      patterns.push({
        name: 'Ascending Triangle',
        type: 'Ascending Triangle',
        bias: 'bullish',
        score: 88,
        upperBoundary: maxHigh,
        lowerBoundary: minLow,
        touchesUpper: touchesHigh,
        touchesLower: higherLowsInSlice + 1,
        compression: true,
        timeframe: '1h',
        status: 'READY',
      });
    }

    // 4. Descending Triangle (Flat Support + Lower Highs)
    let lowerHighsInSlice = 0;
    for (let i = 1; i < swingHighs.length; i++) {
      if (swingHighs[i].high < swingHighs[i - 1].high) lowerHighsInSlice++;
    }
    const touchesLow = lows.filter((l) => Math.abs(l - minLow) / minLow <= 0.006).length;
    if (touchesLow >= 3 && lowerHighsInSlice >= 2) {
      patterns.push({
        name: 'Descending Triangle',
        type: 'Descending Triangle',
        bias: 'bearish',
        score: 87,
        upperBoundary: maxHigh,
        lowerBoundary: minLow,
        touchesUpper: lowerHighsInSlice + 1,
        touchesLower: touchesLow,
        compression: true,
        timeframe: '1h',
        status: 'READY',
      });
    }

    // 5. Compression / Range Channel
    const atrRecent = calculateATR(slice.slice(-10));
    const atrPast = calculateATR(slice.slice(0, 15));
    if (atrRecent < atrPast * 0.7) {
      patterns.push({
        name: 'Volatility Compression',
        type: 'Compression',
        bias: 'neutral',
        score: 80,
        upperBoundary: maxHigh,
        lowerBoundary: minLow,
        touchesUpper: touchesHigh,
        touchesLower: touchesLow,
        compression: true,
        timeframe: '1h',
        status: 'READY',
      });
    }

    return patterns;
  }
}

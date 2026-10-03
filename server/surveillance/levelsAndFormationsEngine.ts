import { DetectedFormation, Kline, Timeframe } from '../../src/types';
import { detectFormations as detectCanonicalFormations } from '../../src/utils/patternRecognition';
import { calculateATR } from './multiTimeframeEngine';
import { DetectedPattern, LevelZone, ThirdTouchTracker } from './types';

export type SREngineMode = 'LIVE' | 'BACKTEST';

export class LevelsAndFormationsEngine {
  private levelZones: LevelZone[] = [];
  private thirdTouchTrackers = new Map<string, ThirdTouchTracker>();
  public mode: SREngineMode = 'LIVE';

  constructor(mode: SREngineMode = 'LIVE') {
    this.mode = mode;
  }

  public setMode(mode: SREngineMode) {
    this.mode = mode;
  }

  public findSupportResistanceZones(
    candles1d: Kline[],
    candles4h: Kline[],
    candles1h: Kline[],
    options?: { mode?: SREngineMode; asOfTime?: number }
  ): LevelZone[] {
    const currentMode = options?.mode || this.mode;
    const asOfTime = options?.asOfTime;
    const zones: LevelZone[] = [];

    const filterCandles = (candles: Kline[], tfMs: number) => {
      let filtered = candles;
      if (asOfTime) {
        filtered = filtered.filter((k) => {
          const t = k.time > 2_000_000_000_000 ? k.time : k.time * 1000;
          return t <= asOfTime;
        });
      }
      if (currentMode === 'LIVE') {
        const closed = (c: Kline[]) => {
          if (c.length <= 2) return c;
          const t = c[c.length - 1].time > 2_000_000_000_000 ? c[c.length - 1].time : c[c.length - 1].time * 1000;
          const interval = c.length > 2 ? Math.max(1000, ((c[c.length - 1].time > 2_000_000_000_000 ? c[c.length - 1].time : c[c.length - 1].time * 1000) - (c[c.length - 2].time > 2_000_000_000_000 ? c[c.length - 2].time : c[c.length - 2].time * 1000))) : tfMs;
          return t + Math.min(tfMs, interval) > Date.now() ? c.slice(0, -1) : c;
        };
        return closed(filtered);
      }
      return filtered;
    };

    candles1d = filterCandles(candles1d, 24 * 60 * 60 * 1000);
    candles4h = filterCandles(candles4h, 4 * 60 * 60 * 1000);
    candles1h = filterCandles(candles1h, 60 * 60 * 1000);

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

        // Look-ahead bias elimination:
        // A swing at index i requires 2 future bars (i+1, i+2) to confirm.
        // BACKTEST mode: strictly only use data available up to confirmation moment (i+2),
        // without peeking into future unclosed bars (i+3 ... i+6).
        // LIVE mode: for already confirmed historical swings, subsequent formed candles up to i+6
        // can be used to evaluate reaction quality.
        if (isHigh) {
          const reactionEnd = currentMode === 'BACKTEST'
            ? Math.min(i + 2, candles.length - 1)
            : Math.min(candles.length - 1, i + 6);
          const reactionSlice = reactionEnd > i ? candles.slice(i + 1, reactionEnd + 1) : [];
          const minAfter = reactionSlice.length > 0 ? Math.min(...reactionSlice.map((x) => x.low)) : c.high;
          const reactionPct = Math.max(0, ((c.high - minAfter) / c.high) * 100);
          this.clusterZone(zones, tf, 'RESISTANCE', c.high, zoneTolerance, c.time, weight, reactionPct, reactionPct >= 1.0);
        }
        if (isLow) {
          const reactionEnd = currentMode === 'BACKTEST'
            ? Math.min(i + 2, candles.length - 1)
            : Math.min(candles.length - 1, i + 6);
          const reactionSlice = reactionEnd > i ? candles.slice(i + 1, reactionEnd + 1) : [];
          const maxAfter = reactionSlice.length > 0 ? Math.max(...reactionSlice.map((x) => x.high)) : c.low;
          const reactionPct = Math.max(0, ((maxAfter - c.low) / c.low) * 100);
          this.clusterZone(zones, tf, 'SUPPORT', c.low, zoneTolerance, c.time, weight, reactionPct, reactionPct >= 1.0);
        }
      }
    };

    analyzeCandlesForZones(candles1d, '1d', 35);
    analyzeCandlesForZones(candles4h, '4h', 30);
    analyzeCandlesForZones(candles1h, '1h', 20);

    // Calculate level strength score (0-100) and reaction stats
    for (const z of zones) {
      const touchScore = Math.min(30, Math.max(0, z.touches - 1) * 10 + 5);
      const reactionQuality = z.averageReactionPct / Math.max(1, z.touches);
      const reactionScore = Math.min(35, (z.strongReactions / Math.max(1, z.touches)) * 20 + Math.min(15, reactionQuality * 3));
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
    weight: number,
    reactionPct = 0,
    strongReaction = false
  ) {
    const existing = zones.find((z) => z.type === type && Math.abs(z.zoneCenter - price) <= tolerance);
    if (existing) {
      const tfMs = tf === '1d' ? 24 * 60 * 60 * 1000 : tf === '4h' ? 4 * 60 * 60 * 1000 : 60 * 60 * 1000;
      const distinctTouch = Math.abs(time - existing.lastTouchTime) >= tfMs * 3;
      if (!distinctTouch) return;
      existing.touches += 1;
      existing.zoneLow = Math.min(existing.zoneLow, price - tolerance * 0.5);
      existing.zoneHigh = Math.max(existing.zoneHigh, price + tolerance * 0.5);
      existing.zoneCenter = (existing.zoneLow + existing.zoneHigh) / 2;
      existing.lastTouchTime = Math.max(existing.lastTouchTime, time);
      if (strongReaction) existing.strongReactions += 1;
      else existing.weakReactions += 1;
      existing.averageReactionPct += reactionPct;
      existing.maxReactionPct = Math.max(existing.maxReactionPct, reactionPct);
    } else {
      zones.push({
        id: `zone_${tf}_${type}_${Math.round(price)}`,
        timeframe: tf,
        type,
        zoneLow: price - tolerance * 0.5,
        zoneHigh: price + tolerance * 0.5,
        zoneCenter: price,
        touches: 1,
        strongReactions: strongReaction ? 1 : 0,
        weakReactions: strongReaction ? 0 : 1,
        averageReactionPct: reactionPct,
        maxReactionPct: reactionPct,
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
    const canonical = detectCanonicalFormations(candles1h, `${this.levelZones.length ? 'SURVEILLANCE' : 'SURVEILLANCE'}`);
    const mapType = (f: DetectedFormation): DetectedPattern['type'] => {
      const n = f.nameEn.toLowerCase();
      if (n.includes('double bottom')) return 'Double Bottom';
      if (n.includes('double top')) return 'Double Top';
      if (n.includes('ascending triangle')) return 'Ascending Triangle';
      if (n.includes('descending triangle')) return 'Descending Triangle';
      if (n.includes('symmetrical triangle')) return 'Symmetrical Triangle';
      if (n.includes('flag')) return 'Flag';
      if (n.includes('pennant')) return 'Pennant';
      if (n.includes('wedge')) return 'Wedge';
      if (n.includes('channel')) return 'Channel';
      if (n.includes('compression') || n.includes('squeeze')) return 'Compression';
      return 'Range';
    };
    return canonical.map((f) => ({
      name: f.name,
      type: mapType(f),
      bias: f.bias,
      score: f.validation?.confluence?.total ?? f.confidence,
      upperBoundary: f.levels.resistancePrice ?? f.levels.necklinePrice ?? f.levels.entryPrice,
      lowerBoundary: f.levels.supportPrice ?? f.levels.necklinePrice ?? f.levels.entryPrice,
      touchesUpper: f.extremeContext?.testsCount ?? 0,
      touchesLower: f.extremeContext?.testsCount ?? 0,
      compression: f.category === 'compression',
      timeframe: '1h',
      status: f.validation?.breakoutConfirmed ? 'BROKEN' : f.validation?.passed ? 'READY' : 'FORMING',
    }));
  }

  private findSwings(candles: Kline[], window=2): Array<{index:number;price:number;type:'HIGH'|'LOW'}> {
    const out:Array<{index:number;price:number;type:'HIGH'|'LOW'}>=[];
    for(let i=window;i<candles.length-window;i++) {
      let hi=true,lo=true;
      for(let j=1;j<=window;j++) { if(candles[i-j].high>=candles[i].high||candles[i+j].high>=candles[i].high)hi=false; if(candles[i-j].low<=candles[i].low||candles[i+j].low<=candles[i].low)lo=false; }
      if(hi)out.push({index:i,price:candles[i].high,type:'HIGH'});
      if(lo)out.push({index:i,price:candles[i].low,type:'LOW'});
    }
    return out.sort((a,b)=>a.index-b.index);
  }

  private patternScore(args:{symmetry:number;depth:number;trigger:number;volume:number}):number {
    return Math.round(Math.max(50,Math.min(95,55+args.symmetry*15+args.depth*12+args.trigger*8+args.volume*5)));
  }

  private breakoutVolumeScore(candles:Kline[], index:number, boundary:number, direction:'LONG'|'SHORT'):number {
    const sample=candles.slice(Math.max(0,index-20),index);
    if(!sample.length)return 0;
    const avg=sample.reduce((s,c)=>s+c.volume,0)/sample.length;
    const c=candles[Math.min(candles.length-1,index)];
    const directional=direction==='LONG'?c.close>boundary:c.close<boundary;
    return directional && c.volume>avg*1.2 ? Math.min(1,c.volume/Math.max(avg*2,0.00000001)) : 0;
  }
}

function lowPairs(xs:Array<{index:number;price:number;type:'HIGH'|'LOW'}>) { const out:Array<[typeof xs[number],typeof xs[number]]>=[]; for(let i=1;i<xs.length;i++)out.push([xs[i-1],xs[i]]); return out; }
function highPairs(xs:Array<{index:number;price:number;type:'HIGH'|'LOW'}>) { const out:Array<[typeof xs[number],typeof xs[number]]>=[]; for(let i=1;i<xs.length;i++)out.push([xs[i-1],xs[i]]); return out; }

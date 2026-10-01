import { ExchangeId, MarketType, Timeframe } from '../../src/types';
import {
  BTCContextSnapshot,
  DensityItem,
  DetectedPattern,
  LevelZone,
  OISnapshot,
  SetupInstance,
  SetupStage,
  SetupType,
  ThirdTouchTracker,
  TimeframeStructure,
  TradeFlowSnapshot,
} from './types';

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
    } = params;

    const detectedSetups: SetupInstance[] = [];

    // 1. SUPPORT RETEST Engine
    const supportZones = zones.filter((z) => z.type === 'SUPPORT' && z.strengthScore >= 40);
    for (const sup of supportZones) {
      const setupId = `${symbol}_SUPPORT_RETEST_${sup.id}`;
      let instance = this.activeSetups.get(setupId);

      const inZone = currentPrice >= sup.zoneLow && currentPrice <= sup.zoneHigh;
      const nearZone = Math.abs(currentPrice - sup.zoneCenter) / sup.zoneCenter <= 0.007;
      const belowZone = currentPrice < sup.zoneLow;

      if (!instance) {
        if (nearZone || inZone) {
          instance = {
            id: setupId,
            type: 'SUPPORT_RETEST',
            symbol,
            exchange,
            marketType,
            timeframe: sup.timeframe,
            stage: inZone ? 'IN_ZONE' : 'SUPPORT_APPROACH',
            direction: 'LONG',
            entryZone: { low: sup.zoneLow, high: sup.zoneHigh },
            invalidationPrice: sup.zoneLow * 0.995, // 0.5% below support
            targetPrice: sup.zoneCenter * 1.035, // 3.5% target
            confluenceScore: 0,
            confirmations: [],
            waitingFor: 'Підтвердження реакції на 15m/5m',
            evidence: {
              htfStructure: structures['4h']?.trend || 'RANGE',
              levelStrength: sup.strengthScore,
              densityPresence: 'Перевірка...',
              volumeProfile: 'Нормальний',
              oiContext: oiSnapshot.regime,
              btcContext: btcContext.trend4h,
              formationScore: patterns[0]?.score || 0,
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          this.activeSetups.set(setupId, instance);
        }
      } else {
        // State Machine Progression:
        // IDLE -> SUPPORT_APPROACH -> IN_ZONE -> REACTION_WATCH -> CONFIRMING -> CONFIRMED -> INVALIDATED / COMPLETED
        if (belowZone) {
          instance.stage = 'INVALIDATED';
        } else if (inZone) {
          if (instance.stage === 'SUPPORT_APPROACH') {
            instance.stage = 'IN_ZONE';
          }
        }

        // Check confirmations
        const confirmations: string[] = [];
        let score = sup.strengthScore * 0.3; // base level strength

        // 1. HTF Trend Alignment
        if (structures['4h']?.trend === 'BULLISH' || structures['1d']?.trend === 'BULLISH') {
          confirmations.push('HTF Bullish Trend');
          score += 15;
        }

        // 2. Bid Density Support
        const bidDensity = densities.find((d) => d.side === 'BID' && Math.abs(d.price - sup.zoneCenter) / sup.zoneCenter <= 0.008);
        if (bidDensity) {
          confirmations.push(`Bid Density $${(bidDensity.notionalUsd / 1000000).toFixed(1)}M`);
          score += 15;
          instance.evidence.densityPresence = `Bid $${(bidDensity.notionalUsd / 1000000).toFixed(1)}M (${bidDensity.classification})`;
        }

        // 3. Trade Flow Buy Imbalance
        if (tradeFlow.imbalanceRatio >= 1.3) {
          confirmations.push(`Aggressive Buy Flow (${tradeFlow.imbalanceRatio}x)`);
          score += 10;
        }

        // 4. Lower Timeframe CHoCH / BOS
        if (structures['15m']?.lastBreak?.direction === 'BULLISH' || structures['5m']?.lastBreak?.direction === 'BULLISH') {
          confirmations.push('Lower TF Bullish Shift');
          score += 15;
        }

        // 5. Open Interest Support
        if (oiSnapshot.regime === 'PRICE_UP_OI_UP' || oiSnapshot.change15mPct >= 1.0) {
          confirmations.push('OI Confirmation');
          score += 10;
        }

        // 6. BTC Context Support
        if (btcContext.trend1h === 'Bullish' || btcContext.trend4h === 'Bullish') {
          confirmations.push('BTC Bullish Context');
          score += 10;
        }

        instance.confirmations = confirmations;
        instance.confluenceScore = Math.min(100, Math.round(score));
        instance.updatedAt = Date.now();

        if (confirmations.length >= 3 && instance.confluenceScore >= 75) {
          if (instance.stage === 'IN_ZONE' || instance.stage === 'REACTION_WATCH') {
            instance.stage = 'CONFIRMED';
            instance.waitingFor = 'Готовий сетап (вхід у позицію)';
          }
        } else if (inZone && confirmations.length >= 1) {
          instance.stage = 'REACTION_WATCH';
          instance.waitingFor = `Очікування додаткових підтверджень (${confirmations.length}/3)`;
        }

        detectedSetups.push(instance);
      }
    }

    // 2. RESISTANCE REJECTION Engine
    const resZones = zones.filter((z) => z.type === 'RESISTANCE' && z.strengthScore >= 40);
    for (const res of resZones) {
      const setupId = `${symbol}_RESISTANCE_REJECTION_${res.id}`;
      let instance = this.activeSetups.get(setupId);

      const inZone = currentPrice >= res.zoneLow && currentPrice <= res.zoneHigh;
      const nearZone = Math.abs(currentPrice - res.zoneCenter) / res.zoneCenter <= 0.007;
      const aboveZone = currentPrice > res.zoneHigh * 1.005;

      if (!instance && (nearZone || inZone)) {
        instance = {
          id: setupId,
          type: 'RESISTANCE_REJECTION',
          symbol,
          exchange,
          marketType,
          timeframe: res.timeframe,
          stage: inZone ? 'IN_ZONE' : 'SUPPORT_APPROACH',
          direction: 'SHORT',
          entryZone: { low: res.zoneLow, high: res.zoneHigh },
          invalidationPrice: res.zoneHigh * 1.005,
          targetPrice: res.zoneCenter * 0.965,
          confluenceScore: res.strengthScore * 0.4,
          confirmations: [],
          waitingFor: 'Опір та реакція продавця',
          evidence: {
            htfStructure: structures['4h']?.trend || 'RANGE',
            levelStrength: res.strengthScore,
            densityPresence: 'Перевірка...',
            volumeProfile: 'Нормальний',
            oiContext: oiSnapshot.regime,
            btcContext: btcContext.trend4h,
            formationScore: patterns[0]?.score || 0,
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        this.activeSetups.set(setupId, instance);
      } else if (instance) {
        if (aboveZone) {
          instance.stage = 'INVALIDATED';
        }

        const confirmations: string[] = [];
        let score = res.strengthScore * 0.3;

        const askDensity = densities.find((d) => d.side === 'ASK' && Math.abs(d.price - res.zoneCenter) / res.zoneCenter <= 0.008);
        if (askDensity) {
          confirmations.push(`Ask Density $${(askDensity.notionalUsd / 1000000).toFixed(1)}M`);
          score += 20;
        }

        if (tradeFlow.imbalanceRatio <= 0.7) {
          confirmations.push('Aggressive Sell Flow');
          score += 15;
        }

        if (structures['15m']?.lastBreak?.direction === 'BEARISH') {
          confirmations.push('15m Bearish Shift');
          score += 15;
        }

        instance.confirmations = confirmations;
        instance.confluenceScore = Math.min(100, Math.round(score));
        instance.updatedAt = Date.now();

        if (confirmations.length >= 2 && instance.confluenceScore >= 70) {
          instance.stage = 'CONFIRMED';
        }

        detectedSetups.push(instance);
      }
    }

    return detectedSetups;
  }

  public getActiveSetups(): SetupInstance[] {
    return Array.from(this.activeSetups.values());
  }
}

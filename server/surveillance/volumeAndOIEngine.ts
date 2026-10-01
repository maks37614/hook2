import { Kline } from '../../src/types';
import { RawTradeEvent } from './exchangeStream';
import { OISnapshot, TradeFlowSnapshot } from './types';

export class VolumeAndOIEngine {
  private recentTrades: RawTradeEvent[] = [];
  private oiHistory: { time: number; valueUsd: number; amountCoins: number; price: number }[] = [];

  public addTrade(trade: RawTradeEvent) {
    this.recentTrades.push(trade);
    const windowStart = Date.now() - 60000; // 60s sliding window
    while (this.recentTrades.length > 0 && this.recentTrades[0].time < windowStart) {
      this.recentTrades.shift();
    }
  }

  public getTradeFlowSnapshot(): TradeFlowSnapshot {
    let buyVolUsd = 0;
    let sellVolUsd = 0;
    let largeTrades = 0;

    for (const t of this.recentTrades) {
      const notional = t.price * t.quantity;
      if (t.side === 'BUY') {
        buyVolUsd += notional;
      } else {
        sellVolUsd += notional;
      }
      if (notional >= 50000) {
        largeTrades++;
      }
    }

    const totalTrades = this.recentTrades.length;
    const totalVol = buyVolUsd + sellVolUsd;
    const avgTradeSize = totalTrades > 0 ? totalVol / totalTrades : 0;
    const imbalanceRatio = sellVolUsd > 0 ? buyVolUsd / sellVolUsd : buyVolUsd > 0 ? 99 : 1.0;

    return {
      aggressiveBuyUsd: Math.round(buyVolUsd),
      aggressiveSellUsd: Math.round(sellVolUsd),
      imbalanceRatio: Number(imbalanceRatio.toFixed(2)),
      largeTradeCount: largeTrades,
      totalTradeCount: totalTrades,
      averageTradeSizeUsd: Math.round(avgTradeSize),
      recentTradesWindowMs: 60000,
    };
  }

  public calculateRVOL(candles: Kline[]): { rvol: number; zScore: number } {
    if (candles.length < 5) return { rvol: 1.0, zScore: 0 };
    const latest = candles[candles.length - 1];
    const prevSlice = candles.slice(-21, -1);
    if (prevSlice.length === 0) return { rvol: 1.0, zScore: 0 };

    const volumes = prevSlice.map((c) => c.volume);
    const meanVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;

    const variance = volumes.reduce((acc, v) => acc + Math.pow(v - meanVol, 2), 0) / volumes.length;
    const stdDev = Math.sqrt(variance) || 1;

    const rvol = meanVol > 0 ? latest.volume / meanVol : 1.0;
    const zScore = (latest.volume - meanVol) / stdDev;

    return {
      rvol: Number(rvol.toFixed(2)),
      zScore: Number(zScore.toFixed(2)),
    };
  }

  public recordOI(valueUsd: number, amountCoins: number, price: number) {
    if (valueUsd <= 0 && amountCoins <= 0) return;
    const now = Date.now();
    this.oiHistory.push({ time: now, valueUsd, amountCoins, price });

    // Keep up to 6 hours of OI history (snapshot every ~10s = ~2160 items)
    const cutoff = now - 6 * 60 * 60 * 1000;
    while (this.oiHistory.length > 0 && this.oiHistory[0].time < cutoff) {
      this.oiHistory.shift();
    }
  }

  public getOISnapshot(currentPrice: number): OISnapshot {
    if (this.oiHistory.length === 0) {
      return {
        currentUsd: 0,
        amountCoins: 0,
        change1mPct: 0,
        change5mPct: 0,
        change15mPct: 0,
        change1hPct: 0,
        change4hPct: 0,
        regime: 'NEUTRAL',
        isAnomaly: false,
      };
    }

    const latest = this.oiHistory[this.oiHistory.length - 1];
    const now = Date.now();

    const getChangeSince = (msAgo: number): number => {
      const targetTime = now - msAgo;
      // find nearest snapshot
      let closest = this.oiHistory[0];
      for (const item of this.oiHistory) {
        if (Math.abs(item.time - targetTime) < Math.abs(closest.time - targetTime)) {
          closest = item;
        }
      }
      if (!closest || closest.valueUsd <= 0) return 0;
      return ((latest.valueUsd - closest.valueUsd) / closest.valueUsd) * 100;
    };

    const change1mPct = Number(getChangeSince(60 * 1000).toFixed(2));
    const change5mPct = Number(getChangeSince(5 * 60 * 1000).toFixed(2));
    const change15mPct = Number(getChangeSince(15 * 60 * 1000).toFixed(2));
    const change1hPct = Number(getChangeSince(60 * 60 * 1000).toFixed(2));
    const change4hPct = Number(getChangeSince(4 * 60 * 60 * 1000).toFixed(2));

    // Determine OI + Price Regime over 15m window
    const priceChange15m = latest.price > 0 ? ((currentPrice - latest.price) / latest.price) * 100 : 0;
    let regime: 'PRICE_UP_OI_UP' | 'PRICE_UP_OI_DOWN' | 'PRICE_DOWN_OI_UP' | 'PRICE_DOWN_OI_DOWN' | 'NEUTRAL' = 'NEUTRAL';

    if (priceChange15m > 0.3 && change15mPct > 1.0) {
      regime = 'PRICE_UP_OI_UP'; // Long buildup
    } else if (priceChange15m > 0.3 && change15mPct < -1.0) {
      regime = 'PRICE_UP_OI_DOWN'; // Short squeeze
    } else if (priceChange15m < -0.3 && change15mPct > 1.0) {
      regime = 'PRICE_DOWN_OI_UP'; // Short buildup
    } else if (priceChange15m < -0.3 && change15mPct < -1.0) {
      regime = 'PRICE_DOWN_OI_DOWN'; // Long liquidation flush
    }

    const isAnomaly = Math.abs(change15mPct) >= 5.0 || Math.abs(change5mPct) >= 3.0;

    return {
      currentUsd: Math.round(latest.valueUsd),
      amountCoins: Math.round(latest.amountCoins),
      change1mPct,
      change5mPct,
      change15mPct,
      change1hPct,
      change4hPct,
      regime,
      isAnomaly,
    };
  }

  public detectAnomalies(
    rvol: number,
    tradeFlow: TradeFlowSnapshot,
    oiSnapshot: OISnapshot
  ): { anomalyScore: number; isImpulse: boolean; description: string } {
    let score = 0;
    const reasons: string[] = [];

    if (rvol >= 3.0) {
      score += 35;
      reasons.push(`RVOL ${rvol}x`);
    } else if (rvol >= 2.0) {
      score += 20;
      reasons.push(`RVOL ${rvol}x`);
    }

    if (tradeFlow.imbalanceRatio >= 3.0 || tradeFlow.imbalanceRatio <= 0.33) {
      score += 25;
      reasons.push(`Торговий дисбаланс ${tradeFlow.imbalanceRatio}`);
    }

    if (tradeFlow.largeTradeCount >= 5) {
      score += 20;
      reasons.push(`${tradeFlow.largeTradeCount} великих ордерів >$50k`);
    }

    if (oiSnapshot.isAnomaly) {
      score += 25;
      reasons.push(`OI аномалія: ${oiSnapshot.change15mPct}%`);
    }

    const isImpulse = score >= 50;

    return {
      anomalyScore: Math.min(100, score),
      isImpulse,
      description: reasons.join(', ') || 'Нормальна активність',
    };
  }

  public calculateRoundNumbers(currentPrice: number): { nearestAbove: number; nearestBelow: number; step: number } {
    let step = 1000;
    if (currentPrice > 20000) step = 1000;
    else if (currentPrice > 5000) step = 500;
    else if (currentPrice > 1000) step = 100;
    else if (currentPrice > 100) step = 10;
    else if (currentPrice > 10) step = 1;
    else if (currentPrice > 1) step = 0.5;
    else step = 0.05;

    const nearestBelow = Math.floor(currentPrice / step) * step;
    const nearestAbove = nearestBelow + step;

    return { nearestAbove, nearestBelow, step };
  }
}

import { Kline, Timeframe } from '../../src/types';
import { RawTradeEvent } from './exchangeStream';
import { StructureBreak, SwingPoint, TimeframeStructure } from './types';

export const SUPPORTED_TIMEFRAMES: Timeframe[] = ['1d', '4h', '1h', '15m', '5m'];

function getTimeframeMs(tf: Timeframe): number {
  switch (tf) {
    case '1m': return 60 * 1000;
    case '5m': return 5 * 60 * 1000;
    case '15m': return 15 * 60 * 1000;
    case '1h': return 60 * 60 * 1000;
    case '4h': return 4 * 60 * 60 * 1000;
    case '1d': return 24 * 60 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
}

export function calculateATR(candles: Kline[], period = 14): number {
  if (candles.length < 2) return candles[0]?.close * 0.01 || 1;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / slice.length;
}

export class MultiTimeframeEngine {
  private candlesByTimeframe = new Map<Timeframe, Kline[]>();

  constructor() {
    for (const tf of SUPPORTED_TIMEFRAMES) {
      this.candlesByTimeframe.set(tf, []);
    }
  }

  public setCandles(tf: Timeframe, candles: Kline[]) {
    // Keep max 150 candles per timeframe for fast and deep processing
    this.candlesByTimeframe.set(tf, candles.slice(-150));
  }

  public getCandles(tf: Timeframe): Kline[] {
    return this.candlesByTimeframe.get(tf) || [];
  }

  public updateWithTrade(trade: RawTradeEvent) {
    for (const tf of SUPPORTED_TIMEFRAMES) {
      const list = this.candlesByTimeframe.get(tf) || [];
      const tfMs = getTimeframeMs(tf);
      const candleStartTime = Math.floor(trade.time / tfMs) * tfMs;

      if (list.length === 0) {
        list.push({
          time: candleStartTime,
          open: trade.price,
          high: trade.price,
          low: trade.price,
          close: trade.price,
          volume: trade.quantity,
        });
      } else {
        const lastCandle = list[list.length - 1];
        if (lastCandle.time === candleStartTime) {
          // Update current candle
          lastCandle.high = Math.max(lastCandle.high, trade.price);
          lastCandle.low = Math.min(lastCandle.low, trade.price);
          lastCandle.close = trade.price;
          lastCandle.volume += trade.quantity;
        } else if (candleStartTime > lastCandle.time) {
          // New candle started
          list.push({
            time: candleStartTime,
            open: trade.price,
            high: trade.price,
            low: trade.price,
            close: trade.price,
            volume: trade.quantity,
          });
          if (list.length > 150) list.shift();
        }
      }
    }
  }

  public detectSwings(tf: Timeframe): SwingPoint[] {
    const raw = this.candlesByTimeframe.get(tf) || [];
    const tfMs = getTimeframeMs(tf);
    const candles = raw.length > 2 && raw[raw.length - 1].time >= Date.now() - tfMs ? raw.slice(0, -1) : raw;
    if (candles.length < 9) return [];

    const atr = calculateATR(candles);
    const swings: SwingPoint[] = [];

    // Adaptive neighbor window: 3 for 5m/15m, 2 for 1h/4h/1d
    const neighborWindow = tf === '5m' || tf === '15m' ? 3 : 2;

    for (let i = neighborWindow; i < candles.length - neighborWindow; i++) {
      const current = candles[i];
      let isHigh = true;
      let isLow = true;

      for (let offset = 1; offset <= neighborWindow; offset++) {
        if (candles[i - offset].high >= current.high || candles[i + offset].high >= current.high) {
          isHigh = false;
        }
        if (candles[i - offset].low <= current.low || candles[i + offset].low <= current.low) {
          isLow = false;
        }
      }

      if (isHigh) {
        // Displacements relative to ATR
        const displacement = current.high - candles[i - neighborWindow].low;
        const classification =
          displacement > atr * 2.5
            ? 'STRUCTURAL_SWING'
            : displacement > atr * 1.5
            ? 'MAJOR_SWING'
            : 'MINOR_SWING';

        swings.push({
          index: i,
          time: current.time,
          price: current.high,
          type: 'HIGH',
          classification,
        });
      }

      if (isLow) {
        const displacement = candles[i - neighborWindow].high - current.low;
        const classification =
          displacement > atr * 2.5
            ? 'STRUCTURAL_SWING'
            : displacement > atr * 1.5
            ? 'MAJOR_SWING'
            : 'MINOR_SWING';

        swings.push({
          index: i,
          time: current.time,
          price: current.low,
          type: 'LOW',
          classification,
        });
      }
    }

    return swings;
  }

  public analyzeStructure(tf: Timeframe, currentPrice: number): TimeframeStructure {
    const rawCandles = this.candlesByTimeframe.get(tf) || [];
    const tfMs = getTimeframeMs(tf);
    const liveCutoff = Date.now() - tfMs;
    const candles = rawCandles.length > 2 && rawCandles[rawCandles.length - 1].time >= liveCutoff ? rawCandles.slice(0, -1) : rawCandles;
    const swings = this.detectSwings(tf);

    const highSwings = swings.filter((s) => s.type === 'HIGH');
    const lowSwings = swings.filter((s) => s.type === 'LOW');

    let hh = 0;
    let lh = 0;
    for (let i = 1; i < highSwings.length; i++) {
      if (highSwings[i].price > highSwings[i - 1].price) hh++;
      else lh++;
    }

    let hl = 0;
    let ll = 0;
    for (let i = 1; i < lowSwings.length; i++) {
      if (lowSwings[i].price > lowSwings[i - 1].price) hl++;
      else ll++;
    }

    // Determine trend & structure score (-100 to +100)
    let score = 0;
    let trend: 'BULLISH' | 'BEARISH' | 'RANGE' | 'TRANSITION' = 'RANGE';

    const recentHigh = highSwings[highSwings.length - 1];
    const prevHigh = highSwings[highSwings.length - 2];
    const recentLow = lowSwings[lowSwings.length - 1];
    const prevLow = lowSwings[lowSwings.length - 2];

    if (recentHigh && prevHigh && recentLow && prevLow) {
      const isBullishSwings = recentHigh.price > prevHigh.price && recentLow.price > prevLow.price;
      const isBearishSwings = recentHigh.price < prevHigh.price && recentLow.price < prevLow.price;

      if (isBullishSwings) {
        trend = 'BULLISH';
        score = 65 + Math.min(30, hh * 10);
      } else if (isBearishSwings) {
        trend = 'BEARISH';
        score = -65 - Math.min(30, ll * 10);
      } else {
        trend = 'TRANSITION';
        score = (hh - ll) * 15;
      }
    }

    // Detect BOS / CHoCH
    let lastBreak: StructureBreak | undefined;
    if (candles.length > 2 && recentHigh && recentLow) {
      const closedCandles = candles.length > 2 ? candles.slice(0, -1) : candles;
      if (closedCandles.length < 3) return { timeframe: tf, trend, score: Math.max(-100, Math.min(100, score)), recentSwings: swings.slice(-6), higherHighsCount: hh, lowerHighsCount: lh, higherLowsCount: hl, lowerLowsCount: ll };
      const lastClosed = closedCandles[closedCandles.length - 1];
      const lastClose = lastClosed.close;
      const lastVol = lastClosed.volume;
      const volSample = closedCandles.slice(-20);
      const avgVol = volSample.reduce((a, c) => a + c.volume, 0) / volSample.length;

      // Bullish break of recent high
      if (lastClose > recentHigh.price) {
        const isBOS = trend === 'BULLISH';
        lastBreak = {
          type: isBOS ? 'BOS' : 'CHoCH',
          direction: 'BULLISH',
          price: lastClose,
          brokenSwingPrice: recentHigh.price,
          time: lastClosed.time,
          timeframe: tf,
          confirmed: true,
          volumeConfirmed: lastVol > avgVol * 1.2,
        };
      }
      // Bearish break of recent low
      else if (lastClose < recentLow.price) {
        const isBOS = trend === 'BEARISH';
        lastBreak = {
          type: isBOS ? 'BOS' : 'CHoCH',
          direction: 'BEARISH',
          price: lastClose,
          brokenSwingPrice: recentLow.price,
          time: lastClosed.time,
          timeframe: tf,
          confirmed: true,
          volumeConfirmed: lastVol > avgVol * 1.2,
        };
      }
    }

    return {
      timeframe: tf,
      trend,
      score: Math.max(-100, Math.min(100, score)),
      recentSwings: swings.slice(-6),
      lastBreak,
      higherHighsCount: hh,
      lowerHighsCount: lh,
      higherLowsCount: hl,
      lowerLowsCount: ll,
    };
  }

  public getMultiTimeframeStructures(currentPrice: number): Record<Timeframe, TimeframeStructure> {
    const res: Partial<Record<Timeframe, TimeframeStructure>> = {};
    for (const tf of SUPPORTED_TIMEFRAMES) {
      res[tf] = this.analyzeStructure(tf, currentPrice);
    }
    return res as Record<Timeframe, TimeframeStructure>;
  }
}

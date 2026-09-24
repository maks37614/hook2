import React, { useMemo } from 'react';
import { ScannedCoin, DetectedFormation, Kline, Timeframe } from '../types';
import { formatCryptoPrice } from '../utils/formatters';

interface ChartTopAnalysisTextProps {
  coin: ScannedCoin;
  formation?: DetectedFormation | null;
  klines: Kline[];
  livePrice: number;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
}

export const ChartTopAnalysisText: React.FC<ChartTopAnalysisTextProps> = ({
  coin,
  formation,
  klines,
  livePrice,
  timeframe,
  onTimeframeChange,
}) => {
  const timeframes: Timeframe[] = ['5m', '15m', '1h', '4h', '1d'];

  // Recalculate analysis strictly based on the active timeframe and its klines
  const analysis = useMemo(() => {
    const cur = livePrice > 0 ? livePrice : coin.currentPrice;
    const vol24h = coin.volume24hUsd || 10_000_000;

    let swingHigh = cur * 1.025;
    let swingLow = cur * 0.975;
    let pocPrice = cur;

    if (klines && klines.length >= 5) {
      // Look back window adapted to active timeframe (min 5m)
      const lookback =
        timeframe === '5m' ? 36 : timeframe === '15m' ? 30 : timeframe === '1h' ? 50 : timeframe === '4h' ? 60 : 90;
      const slice = klines.slice(-Math.min(lookback, klines.length));

      let highest = -Infinity;
      let lowest = Infinity;
      let minLow = Infinity;
      let maxHigh = -Infinity;

      for (const k of slice) {
        if (k.high > highest) highest = k.high;
        if (k.low < lowest) lowest = k.low;
        if (k.low < minLow) minLow = k.low;
        if (k.high > maxHigh) maxHigh = k.high;
      }

      if (highest > -Infinity && lowest < Infinity) {
        swingHigh = highest;
        swingLow = lowest;
      }

      // POC (Point of Control) calculation on this timeframe's candles
      const binsCount = 30;
      const binSize = (maxHigh - minLow) / binsCount;
      if (binSize > 0) {
        const volumeBins = new Array(binsCount).fill(0);
        for (const k of slice) {
          const midPrice = (k.high + k.low + k.close) / 3;
          const idx = Math.min(
            binsCount - 1,
            Math.max(0, Math.floor((midPrice - minLow) / binSize))
          );
          volumeBins[idx] += k.volume || 1;
        }

        let maxIdx = 0;
        let maxVol = 0;
        for (let i = 0; i < binsCount; i++) {
          if (volumeBins[i] > maxVol) {
            maxVol = volumeBins[i];
            maxIdx = i;
          }
        }
        pocPrice = minLow + (maxIdx + 0.5) * binSize;
      }
    } else {
      if (coin.high24h && coin.high24h > cur) swingHigh = coin.high24h;
      if (coin.low24h && coin.low24h < cur) swingLow = coin.low24h;
      pocPrice = (swingHigh + swingLow + cur) / 3;
    }

    // Sell-Side Liquidity (SSL) - short stops above recent swing high
    const sslMultiplier =
      timeframe === '5m' ? 1.0006 : timeframe === '15m' ? 1.001 : timeframe === '1h' ? 1.002 : 1.0035;
    const sslPrice =
      swingHigh > cur ? swingHigh * sslMultiplier : cur * (1 + (timeframe === '1d' ? 0.045 : 0.025));
    const sslDistPct = ((sslPrice - cur) / cur) * 100;

    // Buy-Side Liquidity (BSL) - long stops below recent swing low
    const bslMultiplier =
      timeframe === '5m' ? 0.9994 : timeframe === '15m' ? 0.999 : timeframe === '1h' ? 0.998 : 0.9965;
    const bslPrice =
      swingLow < cur ? swingLow * bslMultiplier : cur * (1 - (timeframe === '1d' ? 0.045 : 0.025));
    const bslDistPct = ((bslPrice - cur) / cur) * 100;

    // POC deviation
    const pocDistPct = ((cur - pocPrice) / pocPrice) * 100;

    // Strong Support & Resistance (Demand & Supply)
    let strongDemand = swingLow < cur ? swingLow : cur * 0.97;
    let strongSupply = swingHigh > cur ? swingHigh : cur * 1.03;

    if (formation?.levels) {
      if (formation.levels.stopLossPrice && formation.levels.stopLossPrice < cur) {
        strongDemand = Math.min(strongDemand, formation.levels.stopLossPrice);
      }
      if (formation.levels.targetPrice && formation.levels.targetPrice > cur) {
        strongSupply = Math.max(strongSupply, formation.levels.targetPrice);
      }
    }

    const demandDistPct = ((strongDemand - cur) / cur) * 100;
    const supplyDistPct = ((strongSupply - cur) / cur) * 100;

    // Largest Liquidation Clusters for this timeframe/volatility
    const liqOffset =
      timeframe === '5m' ? 0.008 : timeframe === '15m' ? 0.012 : timeframe === '1h' ? 0.018 : timeframe === '4h' ? 0.03 : 0.05;
    const shortLiqPrice = cur * (1 + liqOffset);
    const shortLiqDistPct = ((shortLiqPrice - cur) / cur) * 100;

    const longLiqPrice = cur * (1 - liqOffset);
    const longLiqDistPct = ((longLiqPrice - cur) / cur) * 100;

    const cascadeRisk =
      Math.abs(sslDistPct) < 0.6 || Math.abs(bslDistPct) < 0.6 || Math.abs(coin.priceChange24h) > 6
        ? 'Високий'
        : Math.abs(sslDistPct) < 1.8 || Math.abs(bslDistPct) < 1.8
        ? 'Помірний'
        : 'Низький';

    return {
      cur,
      sslPrice,
      sslDistPct,
      pocPrice,
      pocDistPct,
      bslPrice,
      bslDistPct,
      strongDemand,
      demandDistPct,
      strongSupply,
      supplyDistPct,
      shortLiqPrice,
      shortLiqDistPct,
      longLiqPrice,
      longLiqDistPct,
      cascadeRisk,
    };
  }, [livePrice, coin, klines, timeframe, formation]);

  return (
    <div className="w-full text-slate-300 text-xs font-sans select-text pb-1 space-y-2">
      {/* Header row without borders: Live indicator & Timeframe buttons above the chart */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="font-extrabold text-white uppercase text-[11px] tracking-wide">
            Аналіз у реальному часі
          </span>
          <span className="text-slate-400 font-mono text-[11px]">
            (${formatCryptoPrice(analysis.cur)})
          </span>
        </div>

        {/* Timeframe selector directly above the chart (min 5m, no label text) */}
        <div className="flex items-center gap-1">
          {timeframes.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => onTimeframeChange(tf)}
              className={`px-2 py-0.5 rounded font-mono font-bold transition-all cursor-pointer text-[11px] ${
                timeframe === tf
                  ? 'bg-cyan-500 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* 3 Columns of Plain Text Information (No borders, simple crisp typography) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-xs leading-relaxed">
        {/* Section 1: Найближчі пули ліквідності */}
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-sky-400 uppercase tracking-wide">
            Найближчі пули ліквідності:
          </div>

          <div>
            <span className="text-slate-400">Sell-Side Liquidity (Стопи шортистів над хаєм): </span>
            <span className="font-mono font-bold text-white">
              ${formatCryptoPrice(analysis.sslPrice)}
            </span>
            <span className="font-mono text-rose-400 text-[11px] ml-1">
              (+{analysis.sslDistPct.toFixed(2)}%)
            </span>
          </div>

          <div>
            <span className="text-slate-400">POC Volume Pool (Ядро накопиченого обсягу): </span>
            <span className="font-mono font-bold text-amber-300">
              ${formatCryptoPrice(analysis.pocPrice)}
            </span>
            <span className="font-mono text-slate-400 text-[11px] ml-1">
              ({analysis.pocDistPct >= 0 ? `+${analysis.pocDistPct.toFixed(2)}%` : `${analysis.pocDistPct.toFixed(2)}%`})
            </span>
          </div>

          <div>
            <span className="text-slate-400">Buy-Side Liquidity (Стопи лонгістів під лоєм): </span>
            <span className="font-mono font-bold text-white">
              ${formatCryptoPrice(analysis.bslPrice)}
            </span>
            <span className="font-mono text-emerald-400 text-[11px] ml-1">
              ({analysis.bslDistPct.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Section 2: Сильні опорні рівні (Support / Resistance) */}
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wide">
            Сильні опорні рівні (Support / Resistance):
          </div>

          <div>
            <span className="text-slate-400">Сильна підтримка (Demand): </span>
            <span className="font-mono font-bold text-emerald-400">
              ${formatCryptoPrice(analysis.strongDemand)}
            </span>
            <span className="font-mono text-slate-400 text-[11px] ml-1">
              ({analysis.demandDistPct.toFixed(2)}%)
            </span>
          </div>

          <div>
            <span className="text-slate-400">Сильний опір (Supply): </span>
            <span className="font-mono font-bold text-rose-400">
              ${formatCryptoPrice(analysis.strongSupply)}
            </span>
            <span className="font-mono text-slate-400 text-[11px] ml-1">
              (+{analysis.supplyDistPct.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Section 3: Найбільші ліквідації */}
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wide">
            Найбільші ліквідації:
          </div>

          <div>
            <span className="text-slate-400">Шорт-ліквідації: </span>
            <span className="font-mono font-bold text-white">
              ${formatCryptoPrice(analysis.shortLiqPrice)}
            </span>
            <span className="font-mono text-rose-400 text-[11px] ml-1">
              (+{analysis.shortLiqDistPct.toFixed(2)}%)
            </span>
          </div>

          <div>
            <span className="text-slate-400">Лонг-ліквідації: </span>
            <span className="font-mono font-bold text-white">
              ${formatCryptoPrice(analysis.longLiqPrice)}
            </span>
            <span className="font-mono text-emerald-400 text-[11px] ml-1">
              ({analysis.longLiqDistPct.toFixed(2)}%)
            </span>
          </div>

          <div>
            <span className="text-slate-400">Ризик каскаду ліквідацій: </span>
            <span
              className={`font-semibold ${
                analysis.cascadeRisk === 'Високий'
                  ? 'text-rose-400 font-bold'
                  : analysis.cascadeRisk === 'Помірний'
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {analysis.cascadeRisk}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

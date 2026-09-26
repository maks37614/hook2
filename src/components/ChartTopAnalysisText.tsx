import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
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

interface OpenInterestData {
  valueUsd: number;
  amountCoins: number;
  change5mPct: number | null;
  lastUpdated: number;
}

function formatOI(val: number): string {
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function getCandidateSymbols(symbol: string, baseAsset?: string): string[] {
  const clean = symbol.replace(/[\/\-_]/g, '').toUpperCase();
  const candidates: string[] = [clean];
  if (!clean.startsWith('1000') && (
    clean.startsWith('PEPE') || clean.startsWith('SHIB') || clean.startsWith('FLOKI') ||
    clean.startsWith('BONK') || clean.startsWith('LUNC') || clean.startsWith('SATS') ||
    clean.startsWith('RATS') || clean.startsWith('CAT') || clean.startsWith('MOG')
  )) {
    candidates.unshift('1000' + clean);
  }
  if (baseAsset) {
    const baseClean = baseAsset.toUpperCase();
    candidates.push(`${baseClean}USDT`);
    if (!baseClean.startsWith('1000')) {
      candidates.push(`1000${baseClean}USDT`);
    }
  }
  return Array.from(new Set(candidates));
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

  // Open Interest state for Binance and Bybit with auto-updating
  const [binanceOI, setBinanceOI] = useState<OpenInterestData | null>(null);
  const [bybitOI, setBybitOI] = useState<OpenInterestData | null>(null);
  const [loadingOI, setLoadingOI] = useState<boolean>(true);
  const [oiPulse, setOiPulse] = useState<boolean>(false);
  const pulseTimerRef = useRef<any>(null);

  const fetchOI = useCallback(async (isAuto = false) => {
    const curPrice = livePrice > 0 ? livePrice : coin.currentPrice || 1;
    const candidates = getCandidateSymbols(coin.symbol, coin.baseAsset);

    // Fetch Binance OI
    const fetchBinance = async (): Promise<OpenInterestData | null> => {
      for (const sym of candidates) {
        try {
          const resHist = await fetch(
            `https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=5m&limit=2`,
            { signal: AbortSignal.timeout(4000) }
          );
          if (resHist.ok) {
            const data = await resHist.json();
            if (Array.isArray(data) && data.length > 0) {
              const latest = data[data.length - 1];
              const val = parseFloat(latest.sumOpenInterestValue) || 0;
              const coins = parseFloat(latest.sumOpenInterest) || 0;
              let change5m: number | null = null;
              if (data.length > 1) {
                const prevVal = parseFloat(data[0].sumOpenInterestValue) || 0;
                if (prevVal > 0) {
                  change5m = ((val - prevVal) / prevVal) * 100;
                }
              }
              if (val > 0 || coins > 0) {
                return {
                  valueUsd: val > 0 ? val : coins * curPrice,
                  amountCoins: coins,
                  change5mPct: change5m !== null ? Number(change5m.toFixed(2)) : null,
                  lastUpdated: Date.now(),
                };
              }
            }
          }
        } catch {
          // fallback to standard endpoint
        }

        try {
          const res = await fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`, {
            signal: AbortSignal.timeout(4000),
          });
          if (res.ok) {
            const data = await res.json();
            const coins = parseFloat(data.openInterest) || 0;
            if (coins > 0) {
              return {
                valueUsd: coins * curPrice,
                amountCoins: coins,
                change5mPct: null,
                lastUpdated: Date.now(),
              };
            }
          }
        } catch {
          // next candidate
        }
      }
      return null;
    };

    // Fetch Bybit OI
    const fetchBybit = async (): Promise<OpenInterestData | null> => {
      for (const sym of candidates) {
        const mirrors = [
          `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`,
          `https://api.bytick.com/v5/market/tickers?category=linear&symbol=${sym}`,
        ];

        for (const url of mirrors) {
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
            if (!res.ok) continue;
            const json = await res.json();
            const item = json?.result?.list?.[0];
            if (item) {
              const val = parseFloat(item.openInterestValue) || 0;
              const coins = parseFloat(item.openInterest) || 0;
              if (val > 0 || coins > 0) {
                let change5m: number | null = null;
                try {
                  const histRes = await fetch(
                    `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${sym}&intervalTime=5min&limit=2`,
                    { signal: AbortSignal.timeout(3000) }
                  );
                  if (histRes.ok) {
                    const histJson = await histRes.json();
                    const list = histJson?.result?.list;
                    if (Array.isArray(list) && list.length >= 2) {
                      const latestOi = parseFloat(list[0].openInterest) || 0;
                      const prevOi = parseFloat(list[1].openInterest) || 0;
                      if (prevOi > 0) {
                        change5m = ((latestOi - prevOi) / prevOi) * 100;
                      }
                    }
                  }
                } catch {
                  // ignore
                }

                return {
                  valueUsd: val > 0 ? val : coins * curPrice,
                  amountCoins: coins,
                  change5mPct: change5m !== null ? Number(change5m.toFixed(2)) : null,
                  lastUpdated: Date.now(),
                };
              }
            }
          } catch {
            // next mirror
          }
        }
      }
      return null;
    };

    try {
      const [resB, resBy] = await Promise.allSettled([fetchBinance(), fetchBybit()]);
      if (resB.status === 'fulfilled' && resB.value) {
        setBinanceOI(resB.value);
      }
      if (resBy.status === 'fulfilled' && resBy.value) {
        setBybitOI(resBy.value);
      }
      if (isAuto) {
        setOiPulse(true);
        if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
        pulseTimerRef.current = setTimeout(() => setOiPulse(false), 900);
      }
    } finally {
      setLoadingOI(false);
    }
  }, [coin.symbol, coin.baseAsset, coin.currentPrice, livePrice]);

  // Initial fetch and auto-update every 10 seconds
  useEffect(() => {
    setLoadingOI(true);
    fetchOI(false);

    const interval = setInterval(() => {
      fetchOI(true);
    }, 10000);

    return () => {
      clearInterval(interval);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, [fetchOI]);

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
      {/* 3 Columns of Plain Text Information (No borders, simple crisp typography) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-xs leading-relaxed">
  

       


        {/* Section 1: Найближчі пули ліквідності */}
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-sky-400 uppercase tracking-wide">
            
          </div>

          <div>
            <span className="text-slate-400">Стопи шорт: </span>
            <span className="font-mono font-bold text-white">
              ${formatCryptoPrice(analysis.sslPrice)}
            </span>
            <span className="font-mono text-rose-400 text-[11px] ml-1">
              (+{analysis.sslDistPct.toFixed(2)}%)
            </span>
          </div>

          <div>
            <span className="text-slate-400">POC: </span>
            <span className="font-mono font-bold text-amber-300">
              ${formatCryptoPrice(analysis.pocPrice)}
            </span>
            <span className="font-mono text-slate-400 text-[11px] ml-1">
              ({analysis.pocDistPct >= 0 ? `+${analysis.pocDistPct.toFixed(2)}%` : `${analysis.pocDistPct.toFixed(2)}%`})
            </span>
          </div>

          <div>
            <span className="text-slate-400">Стопи лонг: </span>
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
          
          </div>

          <div>
            <span className="text-slate-400">Підтримка: </span>
            <span className="font-mono font-bold text-emerald-400">
              ${formatCryptoPrice(analysis.strongDemand)}
            </span>
            <span className="font-mono text-slate-400 text-[11px] ml-1">
              ({analysis.demandDistPct.toFixed(2)}%)
            </span>
          </div>

          <div>
            <span className="text-slate-400">Супротив: </span>
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

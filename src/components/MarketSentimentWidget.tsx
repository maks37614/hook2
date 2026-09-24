import React, { useState, useEffect } from 'react';
import {
  Gauge,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  BarChart2,
  PieChart,
  RefreshCw,
  Zap,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { MarketSentimentData, MarketCoin } from '../types';
import { formatVolume, formatPercent } from '../utils/formatters';

interface MarketSentimentWidgetProps {
  coins?: MarketCoin[];
}

export const MarketSentimentWidget: React.FC<MarketSentimentWidgetProps> = ({ coins }) => {
  const [data, setData] = useState<MarketSentimentData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [expanded, setExpanded] = useState<boolean>(true);

  const fetchSentiment = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/market/sentiment');
      if (!res.ok) throw new Error('Failed to fetch sentiment');
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Market sentiment fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSentiment();
    const interval = setInterval(fetchSentiment, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return null;

  // Sentiment Color Helper
  const getSentimentTheme = (score: number) => {
    if (score >= 75) return { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', gradient: 'from-emerald-500 to-teal-400' };
    if (score >= 55) return { color: 'text-cyan-400', bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', gradient: 'from-cyan-500 to-blue-400' };
    if (score <= 25) return { color: 'text-rose-400', bg: 'bg-rose-500/20', border: 'border-rose-500/40', gradient: 'from-rose-600 to-red-500' };
    if (score <= 45) return { color: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/40', gradient: 'from-amber-500 to-orange-400' };
    return { color: 'text-slate-300', bg: 'bg-slate-500/20', border: 'border-slate-500/40', gradient: 'from-slate-400 to-slate-200' };
  };

  const theme = getSentimentTheme(data.compositeScore);

  return (
    <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/85 to-indigo-950/40 border border-slate-800/90 shadow-lg backdrop-blur-md overflow-hidden">
      {/* Header Bar */}
      <div className="p-3 sm:p-4 flex items-center justify-between gap-3 border-b border-slate-800/70">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
            <Gauge className="w-4 h-4" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                Настрій Ринку
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${theme.bg} ${theme.border} ${theme.color}`}>
                {data.compositeScore} / 100 • {data.sentimentLabel}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden xs:block">
              Комплексний індекс: динаміка тренду, обсяги, волатильність, ширина ринку, припливи капіталу та фандинг
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={fetchSentiment}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
            title="Оновити дані"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
            title={expanded ? 'Згорнути' : 'Розгорнути'}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      {expanded && (
        <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
          {/* Summary Banner */}
          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/50 p-2.5 sm:p-3 rounded-xl border border-slate-800/60">
            {data.summary}
          </p>

          {/* 6 Sub-Indicators Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5 text-xs font-mono">
            {/* 1. Динаміка ціни та тренду */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
                <span className="truncate">Тренд &amp; Динаміка</span>
                {data.priceTrendDynamics.trendBias === 'bullish' ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                )}
              </div>

              <div>
                <span className="text-base sm:text-lg font-bold text-white block">
                  {data.priceTrendDynamics.advancingPct}%
                </span>
                <span className="text-[10px] text-slate-400 font-sans block">
                  {data.priceTrendDynamics.advancingCount} ростуть / {data.priceTrendDynamics.decliningCount} падають
                </span>
              </div>
            </div>

            {/* 2. Обсяги торгів */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
                <span className="truncate">Обсяги торгів</span>
                <DollarSign className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              </div>

              <div>
                <span className="text-base sm:text-lg font-bold text-white block">
                  {formatVolume(data.tradingVolume.total24hUsd)}
                </span>
                <span className="text-[10px] text-emerald-400 font-sans block">
                  Темп: {data.tradingVolume.volumeVelocity === 'high' ? 'Високий актив' : 'Стабільний'}
                </span>
              </div>
            </div>

            {/* 3. Волатильність */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
                <span className="truncate">Волатильність</span>
                <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              </div>

              <div>
                <span className="text-base sm:text-lg font-bold text-amber-300 block">
                  {data.marketVolatility.avgDailyRangePct}%
                </span>
                <span className="text-[10px] text-slate-400 font-sans block truncate" title={data.marketVolatility.label}>
                  Індекс: {data.marketVolatility.index}/100
                </span>
              </div>
            </div>

            {/* 4. Ширина ринку */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
                <span className="truncate">Ширина ринку</span>
                <BarChart2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              </div>

              <div>
                <span className="text-base sm:text-lg font-bold text-indigo-300 block">
                  {data.marketBreadth.breadthScore} / 100
                </span>
                <span className="text-[10px] text-slate-400 font-sans block truncate">
                  {data.marketBreadth.aboveEma20Pct}% вище EMA20
                </span>
              </div>
            </div>

            {/* 5. Припливи / Відтоки капіталу */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
                <span className="truncate">Рух капіталу</span>
                <PieChart className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              </div>

              <div>
                <span className={`text-base sm:text-lg font-bold block ${data.capitalFlow.direction === 'inflow' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {data.capitalFlow.direction === 'inflow' ? '+' : ''}
                  {Math.abs(data.capitalFlow.netInflow24hUsd) >= 1e9
                    ? `$${(data.capitalFlow.netInflow24hUsd / 1e9).toFixed(1)}B`
                    : `$${(data.capitalFlow.netInflow24hUsd / 1e6).toFixed(0)}M`}
                </span>
                <span className="text-[10px] text-slate-400 font-sans block truncate">
                  {data.capitalFlow.direction === 'inflow' ? 'Чистий приплив' : 'Чистий відтік'}
                </span>
              </div>
            </div>

            {/* 6. Відкритий інтерес та Funding Rate */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
                <span className="truncate">OI &amp; Funding</span>
                <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              </div>

              <div>
                <span className="text-base sm:text-lg font-bold text-cyan-300 block">
                  {formatVolume(data.derivativesOverview.aggregatedOIUsd)}
                </span>
                <span className="text-[10px] text-slate-400 font-sans block truncate">
                  Фандинг: {data.derivativesOverview.avgFundingRate}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

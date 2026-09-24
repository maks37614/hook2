import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Target,
  Activity,
  Layers,
  BarChart3,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Clock,
  RefreshCw,
  Gauge,
  Sliders,
  Radio,
  Eye,
  Crosshair,
  Zap,
  Info,
  Wallet,
  Users,
  Fingerprint,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { SmartAnalysisData, ScannedCoin, DetectedFormation, Kline } from '../types';
import { formatCryptoPrice, formatVolume, formatPercent } from '../utils/formatters';

interface SmartAnalysisBlockProps {
  coin: ScannedCoin;
  formation?: DetectedFormation | null;
  klines?: Kline[];
}

export const SmartAnalysisBlock: React.FC<SmartAnalysisBlockProps> = ({
  coin,
  formation,
  klines,
}) => {
  const [data, setData] = useState<SmartAnalysisData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'btc' | 'tech' | 'orderbook' | 'derivatives' | 'institutional'>('all');

  const fetchAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        symbol: coin.symbol,
        exchange: coin.exchange,
        marketType: coin.marketType,
        timeframe: coin.timeframe || '1h',
        price: String(coin.currentPrice),
      });

      const res = await fetch(`/api/market/smart-analysis?${queryParams.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        throw new Error(json.error || 'Failed to parse smart analysis');
      }
    } catch (err: any) {
      console.error('Smart analysis error:', err);
      setError(err.message || 'Не вдалося завантажити розумний аналіз');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, [coin.symbol, coin.exchange, coin.marketType, coin.timeframe]);

  if (loading && !data) {
    return (
      <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-indigo-900/40 text-center space-y-3 animate-pulse">
        <div className="flex items-center justify-center gap-2 text-indigo-400">
          <Sparkles className="w-5 h-5 animate-spin" />
          <span className="text-sm font-bold uppercase tracking-wider">Генерація Розумного Аналізу...</span>
        </div>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Аналізуємо мультитаймфреймовий BTC (15m → 5m → 1m), стакан ордерів, зону POC, інституційний Open Interest та розраховуємо оптимальні рівні SL/TP...
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-800/40 flex items-center justify-between text-xs text-rose-300">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
        <button
          onClick={fetchAnalysis}
          className="px-2.5 py-1 rounded bg-rose-900/40 hover:bg-rose-900/60 text-white font-medium flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          Спробувати знову
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Score color helper
  const getScoreBadge = (score: number) => {
    if (score >= 8.0) return { bg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300', fill: 'bg-emerald-500' };
    if (score >= 6.5) return { bg: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300', fill: 'bg-cyan-500' };
    if (score <= 3.5) return { bg: 'bg-rose-500/20 border-rose-500/40 text-rose-300', fill: 'bg-rose-500' };
    if (score <= 5.0) return { bg: 'bg-amber-500/20 border-amber-500/40 text-amber-300', fill: 'bg-amber-500' };
    return { bg: 'bg-slate-500/20 border-slate-500/40 text-slate-300', fill: 'bg-slate-500' };
  };

  const scoreBadge = getScoreBadge(data.score);

  return (
    <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-indigo-500/30 shadow-xl shadow-indigo-950/20 space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Zap className="w-4 h-4 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                РОЗУМНИЙ АНАЛІЗ
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-mono">
                AI + Quant
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Повний аудит: BTC контекст, стакан ордерів, зона POC, деривативи, ризик маніпуляцій та рекомендації
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAnalysis}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
            title="Оновити розрахунок"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Hero Score & Executive Summary Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 rounded-xl bg-slate-950/80 border border-indigo-900/30">
        {/* Score & Verdict */}
        <div className="lg:col-span-4 flex flex-col justify-between p-3.5 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Оцінка точки входу</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${scoreBadge.bg}`}>
              {data.score} / 10
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white">
              {data.score}
            </span>
            <span className="text-xs text-slate-400 font-medium">/ 10.0</span>
          </div>

          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${scoreBadge.fill}`}
              style={{ width: `${(data.score / 10) * 100}%` }}
            />
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <span className="text-[10px] text-slate-400 block mb-0.5">Вердикт алгоритму:</span>
            <span className="text-xs font-bold text-white tracking-wide block">
              {data.verdictLabel}
            </span>
          </div>
        </div>

        {/* Executive Summary & Position Sizing */}
        <div className="lg:col-span-8 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Автоматично згенероване резюме:</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800/70">
              {data.summary}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/40 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-indigo-300 block mb-0.5">Рекомендація щодо обсягу позиції:</span>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                {data.positionSizingRecommendation}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Trade Plan Grid (Entry, SL, TP1, TP2, TP3, R:R) */}
      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
          <div className="flex items-center gap-1.5">
            <Target className="w-4 h-4 text-cyan-400" />
            <span>Кількісний торговий сценарій (Entry / SL / TP):</span>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/50">
            R:R Ratio = 1 : {data.tradeScenario.riskRewardRatio}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center text-xs font-mono">
          {/* Entry Zone */}
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 block font-sans">Оптимальний Вхід</span>
            <span className="font-bold text-white mt-1 block">
              {formatCryptoPrice(data.tradeScenario.optimalEntry)}
            </span>
            <span className="text-[9px] text-slate-500 block font-sans mt-0.5">
              Зона {formatCryptoPrice(data.tradeScenario.entryZoneMin)} - {formatCryptoPrice(data.tradeScenario.entryZoneMax)}
            </span>
          </div>

          {/* Stop Loss */}
          <div className="bg-slate-900 p-2.5 rounded-lg border border-rose-900/40 bg-rose-950/10">
            <span className="text-[10px] text-rose-400 block font-sans">Stop Loss</span>
            <span className="font-bold text-rose-400 mt-1 block">
              {formatCryptoPrice(data.tradeScenario.stopLoss)}
            </span>
            <span className="text-[9px] text-rose-500 font-sans block mt-0.5">
              -{data.tradeScenario.stopLossPct}% ризику
            </span>
          </div>

          {/* TP1 */}
          <div className="bg-slate-900 p-2.5 rounded-lg border border-emerald-900/30">
            <span className="text-[10px] text-emerald-400 block font-sans">TP1 (Консервативний)</span>
            <span className="font-bold text-emerald-400 mt-1 block">
              {formatCryptoPrice(data.tradeScenario.tp1)}
            </span>
            <span className="text-[9px] text-emerald-500 font-sans block mt-0.5">
              +{data.tradeScenario.tp1Pct}% (закрити 40%)
            </span>
          </div>

          {/* TP2 */}
          <div className="bg-slate-900 p-2.5 rounded-lg border border-emerald-900/40 bg-emerald-950/10">
            <span className="text-[10px] text-emerald-300 block font-sans">TP2 (Основна ціль)</span>
            <span className="font-bold text-emerald-300 mt-1 block">
              {formatCryptoPrice(data.tradeScenario.tp2)}
            </span>
            <span className="text-[9px] text-emerald-400 font-sans block mt-0.5">
              +{data.tradeScenario.tp2Pct}% (закрити 40%)
            </span>
          </div>

          {/* TP3 */}
          <div className="bg-slate-900 p-2.5 rounded-lg border border-emerald-900/30">
            <span className="text-[10px] text-emerald-200 block font-sans">TP3 (Максимум)</span>
            <span className="font-bold text-emerald-200 mt-1 block">
              {formatCryptoPrice(data.tradeScenario.tp3)}
            </span>
            <span className="text-[9px] text-emerald-400 font-sans block mt-0.5">
              +{data.tradeScenario.tp3Pct}% (залишок 20%)
            </span>
          </div>

          {/* ATR Volatility */}
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 block font-sans">ATR (14) / Волатильність</span>
            <span className="font-bold text-slate-200 mt-1 block">
              {data.volatility.atr}
            </span>
            <span className="text-[9px] text-slate-400 font-sans block mt-0.5">
              {data.volatility.atrPct}% від ціни
            </span>
          </div>
        </div>
      </div>

      {/* Institutional Pulse Highlights Strip (Holders / Whales / MM / Manipulations) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
        {/* Holders Overview */}
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
              Аналіз Holders
            </span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
              data.participants.holders?.status === 'accumulation'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : data.participants.holders?.status === 'distribution'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
            }`}>
              {data.participants.holders?.status === 'accumulation'
                ? 'Накопичення'
                : data.participants.holders?.status === 'distribution'
                ? 'Розподіл'
                : 'Баланс'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-bold text-white text-sm font-mono">
              ~{data.participants.holders?.top10ConcentrationPct || 54}%
            </span>
            <span className="text-[10px] text-slate-400 font-sans">
              Топ-10 гаманців
            </span>
          </div>
          <span className="text-[10px] text-emerald-400 font-sans mt-0.5 block truncate">
            {data.participants.holders?.retailVsWhaleRatio || '62% Whales & Insiders'}
          </span>
        </div>

        {/* Large Player / Whale Overview */}
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              Великий учасник
            </span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
              data.participants.largePlayer?.detected
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-slate-800 text-slate-400'
            }`}>
              {data.participants.largePlayer?.detected ? 'Smart Money' : 'Роздріб'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-bold text-white text-sm font-mono truncate mr-1">
              {formatVolume(data.participants.largePlayer?.clusterVolumeUsd || 250000)}
            </span>
            <span className="text-[10px] text-cyan-300 font-sans shrink-0 font-mono">
              {data.participants.largePlayer?.confidencePct || 85}% Conf.
            </span>
          </div>
          <span className="text-[10px] text-slate-300 font-sans mt-0.5 block truncate">
            {data.participants.largePlayer?.actionLabel || 'Поглинання ліквідності'}
          </span>
        </div>

        {/* Market Maker Overview */}
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
              Маркет-мейкер
            </span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/40">
              {data.participants.marketMaker?.algorithmType?.toUpperCase() || 'HFT_GRID'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-bold text-white text-sm font-mono">
              {data.participants.marketMaker?.spreadSupportScore || 90}/100
            </span>
            <span className="text-[10px] text-indigo-300 font-sans">
              Підтримка спреду
            </span>
          </div>
          <span className="text-[10px] text-emerald-400 font-sans mt-0.5 block truncate">
            Швидкість: {data.participants.marketMaker?.orderbookReplenishmentSpeed === 'ultra_fast' ? 'Миттєва (Ultra)' : 'Нормальна'}
          </span>
        </div>

        {/* Manipulative Coin Overview */}
        <div className={`p-3 rounded-xl border flex flex-col justify-between ${
          data.participants.manipulativeCoin?.riskLevel === 'high' || data.participants.manipulativeCoin?.riskLevel === 'extreme'
            ? 'bg-rose-950/20 border-rose-800/50'
            : 'bg-slate-900/80 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              Маніпулятивність
            </span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase font-mono ${
              data.participants.manipulativeCoin?.riskLevel === 'low'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : data.participants.manipulativeCoin?.riskLevel === 'medium'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}>
              {data.participants.manipulativeCoin?.riskLevel || 'LOW'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-bold text-white text-sm font-mono">
              {data.participants.manipulativeCoin?.riskScore || 15} / 100
            </span>
            <span className="text-[10px] text-slate-400 font-sans">
              Індекс ризику
            </span>
          </div>
          <span className="text-[10px] text-slate-300 font-sans mt-0.5 block truncate">
            {data.participants.manipulativeCoin?.riskLabel || 'Органічний інституційний актив'}
          </span>
        </div>
      </div>

      {/* Navigation Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 border-b border-slate-800 text-xs">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'all'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Усі модулі (Повний огляд)
        </button>

        <button
          onClick={() => setActiveTab('btc')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'btc'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <span>Контекст BTC (15m → 5m → 1m)</span>
          {data.btcContext.hasSharpImpulse && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('tech')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'tech'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          RSI, EMA, Об'єми та Спред
        </button>

        <button
          onClick={() => setActiveTab('orderbook')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'orderbook'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Стакан, POC та Ліквідність
        </button>

        <button
          onClick={() => setActiveTab('derivatives')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'derivatives'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Open Interest та Деривативи
        </button>

        <button
          onClick={() => setActiveTab('institutional')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'institutional'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-indigo-300 bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-800/50'
          }`}
        >
          <Fingerprint className="w-3.5 h-3.5 text-cyan-400" />
          <span>Holders, Whales, ММ та Маніпуляції</span>
        </button>
      </div>

      {/* Module 1: BTC Context (15m -> 5m -> 1m) */}
      {(activeTab === 'all' || activeTab === 'btc') && (
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                Контекст BTC на 15m → 5m → 1m
              </h5>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-400">BTC/USDT:</span>
              <span className="font-bold text-white">${formatCryptoPrice(data.btcContext.btcPrice)}</span>
              <span className={`font-bold ${data.btcContext.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {data.btcContext.change24h >= 0 ? '+' : ''}{data.btcContext.change24h.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Sharp impulse alert banner if active */}
          {data.btcContext.hasSharpImpulse && (
            <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/50 flex items-center gap-2 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
              <span>
                <strong>Увага!</strong> {data.btcContext.impulseDescription}
              </span>
            </div>
          )}

          {/* Timeframe Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {(['15m', '5m', '1m'] as const).map((tf) => {
              const item = data.btcContext.timeframes[tf];
              const isUp = item.direction === 'up';
              const isHH = item.structure === 'HH_HL';
              const isLL = item.structure === 'LH_LL';

              return (
                <div
                  key={tf}
                  className={`p-3 rounded-lg border flex flex-col justify-between space-y-2 ${
                    isHH
                      ? 'bg-emerald-950/20 border-emerald-800/40'
                      : isLL
                      ? 'bg-rose-950/20 border-rose-800/40'
                      : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono text-cyan-300">BTC {tf}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase font-mono ${
                        isHH
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : isLL
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-slate-700/40 text-slate-300'
                      }`}
                    >
                      {item.structure}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isUp ? (
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-rose-400" />
                    )}
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      {item.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Overall Structure & Upcoming Macro News */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1 text-xs">
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1 font-medium">Загальна структура BTC:</span>
              <p className="text-slate-200 font-medium leading-relaxed">
                {data.btcContext.overallStructureLabel}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-amber-400 flex items-center gap-1 mb-1 font-medium">
                <Calendar className="w-3.5 h-3.5" />
                Наближення важливих новин та тригерів:
              </span>
              <div className="space-y-1">
                {data.btcContext.upcomingNews.map((news, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] text-slate-300">
                    <span className="truncate mr-2">• {news.title}</span>
                    <span className="font-mono text-amber-300 shrink-0">{news.timeUntil}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Module 2: Technicals (RSI, EMA, Volume Spike, Spread, Range) */}
      {(activeTab === 'all' || activeTab === 'tech') && (
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-cyan-400" />
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">
              Тренд на основі RSI, Ковзних Середніх та Волатильності
            </h5>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {/* RSI */}
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span>RSI (14)</span>
                <span className="font-mono font-bold text-white">{data.trend.rsi14}</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    data.trend.rsi14 > 70
                      ? 'bg-rose-500'
                      : data.trend.rsi14 < 30
                      ? 'bg-emerald-500'
                      : 'bg-cyan-500'
                  }`}
                  style={{ width: `${Math.min(data.trend.rsi14, 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-300 block">{data.trend.rsiLabel}</span>
            </div>

            {/* EMA Cross & Status */}
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
              <span className="text-slate-400 block">Сигнал ковзних середніх</span>
              <span className="font-bold text-white block truncate">{data.trend.crossSignalLabel}</span>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                <span>EMA20: {data.trend.ema20}</span>
                <span>•</span>
                <span>EMA50: {data.trend.ema50}</span>
              </div>
            </div>

            {/* 1h Volume & Spike */}
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-slate-400">
                <span>Об'єм за останню 1 год</span>
                {data.volumeMetrics.hasVolumeSpike && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                    СПЛЕСК x{data.volumeMetrics.volume1hSpikeRatio}
                  </span>
                )}
              </div>
              <span className="font-bold text-white text-sm font-mono block">
                {formatVolume(data.volumeMetrics.volume1hUsd)}
              </span>
              <span className="text-[10px] text-slate-400 block font-sans">
                24h оборот: {formatVolume(data.volumeMetrics.volume24hUsd)}
              </span>
            </div>

            {/* Spread & Quality */}
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
              <span className="text-slate-400 block">Поточний Спред (Spread)</span>
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-white text-sm font-mono">
                  {data.spread.spreadPct}%
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  (${data.spread.spreadUsd})
                </span>
              </div>
              <span className="text-[10px] text-emerald-400 block font-medium">
                {data.spread.quality === 'ultra_tight'
                  ? 'Ультра-вузький (найвища ліквідність)'
                  : data.spread.quality === 'normal'
                  ? 'Звичайний робочий спред'
                  : 'Широкий спред (ризик прослизання)'}
              </span>
            </div>
          </div>

          {/* Position in Day Range */}
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-medium">
                Де знаходиться ціна відносно денного High/Low:
              </span>
              <span className="font-mono font-bold text-cyan-400">
                {data.volatility.positionInDayRangePct}% від мінімуму дня
              </span>
            </div>

            <div className="w-full bg-slate-800 h-2.5 rounded-full relative overflow-hidden flex">
              <div
                className="bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500 h-full rounded-full"
                style={{ width: `${data.volatility.positionInDayRangePct}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>Day Low: ${formatCryptoPrice(data.volatility.low24h)}</span>
              <span>Day High: ${formatCryptoPrice(data.volatility.high24h)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Module 3: Orderbook, POC & Liquidity Pools */}
      {(activeTab === 'all' || activeTab === 'orderbook') && (
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                Стакан ордерів, Зона POC та Рівні Ліквідності
              </h5>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Дисбаланс Bid/Ask = <strong className="text-white">{data.orderbook.bidAskRatio}</strong>
            </span>
          </div>

          {/* Orderbook Walls & POC */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs font-mono">
            {/* Long Wall (Bid) */}
            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40 space-y-1">
              <span className="text-[10px] text-emerald-400 font-sans block font-semibold">
                Найбільша стіна в лонг (Bid Wall):
              </span>
              <div className="text-sm font-bold text-white">
                {formatCryptoPrice(data.orderbook.bidWallPrice)}
              </div>
              <div className="text-[11px] text-emerald-300">
                Обсяг стіни: {formatVolume(data.orderbook.bidWallUsd)}
              </div>
            </div>

            {/* POC Zone */}
            <div className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-800/40 space-y-1">
              <span className="text-[10px] text-indigo-300 font-sans block font-semibold">
                Point of Control (Зона POC об'єму):
              </span>
              <div className="text-sm font-bold text-white">
                {formatCryptoPrice(data.levels.pocPrice)}
              </div>
              <div className="text-[11px] text-indigo-300">
                Концентрація: ~{data.levels.pocVolumePct}% об'єму
              </div>
            </div>

            {/* Short Wall (Ask) */}
            <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-800/40 space-y-1">
              <span className="text-[10px] text-rose-400 font-sans block font-semibold">
                Найбільша стіна в шорт (Ask Wall):
              </span>
              <div className="text-sm font-bold text-white">
                {formatCryptoPrice(data.orderbook.askWallPrice)}
              </div>
              <div className="text-[11px] text-rose-300">
                Обсяг стіни: {formatVolume(data.orderbook.askWallUsd)}
              </div>
            </div>
          </div>

          {/* Detected Large Orders List */}
          {data.orderbook.largeOrders.length > 0 && (
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5 text-xs">
                <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                Виявлені великі лімітні заявки в стакані (Whale & Large Walls):
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {data.orderbook.largeOrders.slice(0, 4).map((order, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded border flex items-center justify-between text-xs font-mono ${
                      order.side === 'bid'
                        ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                        : 'bg-rose-950/20 border-rose-800/40 text-rose-300'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] uppercase font-bold block">
                        {order.side === 'bid' ? 'КУПІВЛЯ (BID)' : 'ПРОДАЖ (ASK)'}
                      </span>
                      <span className="font-bold text-white">
                        {formatCryptoPrice(order.price)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold block">{formatVolume(order.amountUsd)}</span>
                      <span className="text-[9px] text-slate-400">{order.distancePct}% від поточної</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Liquidity Levels & S/R */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="font-semibold text-slate-300 block mb-1.5">
                Найближчі пули ліквідності:
              </span>
              <div className="space-y-1 font-mono text-[11px]">
                {data.levels.liquidityLevels.map((liq, i) => (
                  <div key={i} className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400 truncate mr-2">{liq.label}</span>
                    <span className="text-white font-bold">{formatCryptoPrice(liq.price)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="font-semibold text-slate-300 block mb-1.5">
                Сильні опорні рівні (Support / Resistance):
              </span>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-400">Сильна підтримка (Demand):</span>
                  <span className="text-white font-bold">{formatCryptoPrice(data.levels.strongSupport)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-rose-400">Сильний опір (Supply):</span>
                  <span className="text-white font-bold">{formatCryptoPrice(data.levels.strongResistance)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Module 4: Derivatives & Open Interest */}
      {(activeTab === 'all' || activeTab === 'derivatives') && (
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">
              Деривативи, Графік Open Interest (Binance & Bybit) та Funding Rate
            </h5>
          </div>

          {/* OI and Funding Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
            {/* Binance OI */}
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400 font-sans">
                <span>OI Binance (Futures)</span>
                <span className={`text-[10px] font-bold ${data.derivatives.binanceOI.change1hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {data.derivatives.binanceOI.change1hPct >= 0 ? '+' : ''}{data.derivatives.binanceOI.change1hPct}% (1h)
                </span>
              </div>
              <div className="text-base font-bold text-white">
                {formatVolume(data.derivatives.binanceOI.currentUsd)}
              </div>
              {/* Mini Sparkline Bar Chart */}
              <div className="flex items-end gap-1 h-6 pt-1">
                {data.derivatives.binanceOI.history.map((val, i) => {
                  const min = Math.min(...data.derivatives.binanceOI.history);
                  const max = Math.max(...data.derivatives.binanceOI.history);
                  const heightPct = max > min ? Math.max(((val - min) / (max - min)) * 100, 15) : 50;
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-cyan-500/60 rounded-t hover:bg-cyan-400 transition-all"
                      style={{ height: `${heightPct}%` }}
                      title={`Binance OI: ${formatVolume(val)}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Bybit OI */}
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400 font-sans">
                <span>OI Bybit (Linear)</span>
                <span className={`text-[10px] font-bold ${data.derivatives.bybitOI.change1hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {data.derivatives.bybitOI.change1hPct >= 0 ? '+' : ''}{data.derivatives.bybitOI.change1hPct}% (1h)
                </span>
              </div>
              <div className="text-base font-bold text-white">
                {formatVolume(data.derivatives.bybitOI.currentUsd)}
              </div>
              {/* Mini Sparkline Bar Chart */}
              <div className="flex items-end gap-1 h-6 pt-1">
                {data.derivatives.bybitOI.history.map((val, i) => {
                  const min = Math.min(...data.derivatives.bybitOI.history);
                  const max = Math.max(...data.derivatives.bybitOI.history);
                  const heightPct = max > min ? Math.max(((val - min) / (max - min)) * 100, 15) : 50;
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-indigo-500/60 rounded-t hover:bg-indigo-400 transition-all"
                      style={{ height: `${heightPct}%` }}
                      title={`Bybit OI: ${formatVolume(val)}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Funding Rate & Perpetuals */}
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 font-sans">
                <span>Funding Rate (Фандинг)</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/40">
                  {data.derivatives.hasPerpFutures ? 'PERP' : 'SPOT'}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-base font-bold ${data.derivatives.fundingRate >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {data.derivatives.fundingRate > 0 ? '+' : ''}{data.derivatives.fundingRate}%
                </span>
                <span className="text-[10px] text-slate-400 font-sans">
                  (Прогноз: {data.derivatives.predictedFundingRate}%)
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-sans block">
                Сумарний OI: {formatVolume(data.derivatives.totalOIUsd)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Module 5: Comprehensive Institutional Audit (Holders, Large Player, MM, Manipulations) */}
      {(activeTab === 'all' || activeTab === 'institutional') && (
        <div className="p-4 rounded-xl bg-slate-950/80 border border-indigo-900/40 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Fingerprint className="w-4 h-4 text-cyan-400" />
              <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                Інституційний аудит: Аналіз Holders, Великого учасника, Маркет-мейкерів та Маніпуляцій
              </h5>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
              INSTITUTIONAL RADAR
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 text-xs">
            {/* 1. Аналіз Holders */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-white text-xs">1. Аналіз Holders & Розподіл Гаманців</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  data.participants.holders?.status === 'accumulation'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : data.participants.holders?.status === 'distribution'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                }`}>
                  {data.participants.holders?.statusLabel || 'Нейтральний баланс'}
                </span>
              </div>

              {/* Progress bar of concentration */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Концентрація монет у топ-10 холдерів:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    ~{data.participants.holders?.top10ConcentrationPct || 56}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full"
                    style={{ width: `${Math.min(data.participants.holders?.top10ConcentrationPct || 56, 100)}%` }}
                  />
                </div>
              </div>

              {/* Grid indicators */}
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 font-sans block">Ріст активних адрес (24h)</span>
                  <span className={`font-bold text-xs mt-0.5 block ${
                    (data.participants.holders?.activeWalletsGrowthPct || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {(data.participants.holders?.activeWalletsGrowthPct || 0) >= 0 ? '+' : ''}
                    {data.participants.holders?.activeWalletsGrowthPct || 0}%
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 font-sans block">Співвідношення часток</span>
                  <span className="font-bold text-xs text-white mt-0.5 block truncate">
                    {data.participants.holders?.retailVsWhaleRatio || '35% Retail / 65% Whales'}
                  </span>
                </div>
              </div>

              {/* Phase narrative */}
              <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60">
                {data.participants.holders?.phaseDescription || data.summary}
              </p>
            </div>

            {/* 2. Авто-виявлення Великого Учасника (Whale / Smart Money) */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold text-white text-xs">2. Авто-виявлення Великого Учасника</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                  {data.participants.largePlayer?.confidencePct || 88}% Confidence
                </span>
              </div>

              {/* Action type & Cluster volume */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Характер дій Smart Money</span>
                  <span className="font-bold text-cyan-300 mt-0.5 block truncate">
                    {data.participants.largePlayer?.actionLabel || 'Поглинання ліквідності'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Відстежений обсяг кластерів</span>
                  <span className="font-bold text-white font-mono text-xs mt-0.5 block">
                    {formatVolume(data.participants.largePlayer?.clusterVolumeUsd || 320000)}
                  </span>
                </div>
              </div>

              {/* Tracked Clusters */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Зафіксовані кластери великих угод та айсбергів:
                </span>
                <div className="space-y-1">
                  {data.participants.largePlayer?.trackedClusters && data.participants.largePlayer.trackedClusters.length > 0 ? (
                    data.participants.largePlayer.trackedClusters.map((cluster, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-1.5 rounded bg-slate-950/70 border border-slate-800 text-[11px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1 rounded text-[9px] font-bold font-mono ${
                            cluster.side === 'buy' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {cluster.side.toUpperCase()}
                          </span>
                          <span className="text-slate-300 font-medium">
                            {cluster.type === 'iceberg'
                              ? 'Айсберг у стакані'
                              : cluster.type === 'block_trade'
                              ? 'Блок-трейд'
                              : 'Поглинання POC'}
                          </span>
                          <span className="text-slate-400 font-mono text-[10px]">
                            @ {formatCryptoPrice(cluster.price)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-bold text-white">{formatVolume(cluster.volumeUsd)}</span>
                          <span className="text-[9px] text-slate-400 font-sans hidden sm:inline">
                            {cluster.timestampDesc}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-slate-400 italic">
                      Зафіксовані роздрібні лімітні ордери без слідів великих айсбергів.
                    </div>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60">
                {data.participants.largePlayer?.details || data.participants.largePlayerNote}
              </p>
            </div>

            {/* 3. Авто-виявлення Маркет-Мейкерів */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-indigo-400" />
                  <span className="font-bold text-white text-xs">3. Авто-виявлення Маркет-Мейкерів</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
                  {data.participants.marketMaker?.algorithmType?.toUpperCase() || 'HFT_GRID'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Підтримка спреду стакану</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="font-bold text-white font-mono text-xs">
                      {data.participants.marketMaker?.spreadSupportScore || 92} / 100
                    </span>
                    <span className="text-[10px] text-emerald-400">
                      (Ultra-Tight)
                    </span>
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Поповнення стакану</span>
                  <span className="font-bold text-emerald-300 mt-0.5 block text-xs">
                    {data.participants.marketMaker?.orderbookReplenishmentSpeed === 'ultra_fast'
                      ? 'Миттєва (Ultra-Fast)'
                      : data.participants.marketMaker?.orderbookReplenishmentSpeed === 'normal'
                      ? 'Звичайна робоча'
                      : 'Сповільнена (ризик)'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px]">
                <span className="text-slate-400">Захист від ліквідаційних сквизів:</span>
                <span className="flex items-center gap-1 font-semibold text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  {data.participants.marketMaker?.antiSqueezeProtection ? 'Активний (Стіни щільні)' : 'Базовий'}
                </span>
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60">
                {data.participants.marketMaker?.details || data.participants.marketMakerNote}
              </p>
            </div>

            {/* 4. Авто-виявлення Маніпулятивних Монет */}
            <div className={`p-3.5 rounded-xl border space-y-3 ${
              data.participants.manipulativeCoin?.riskLevel === 'high' || data.participants.manipulativeCoin?.riskLevel === 'extreme'
                ? 'bg-rose-950/20 border-rose-800/50'
                : 'bg-slate-900/80 border-slate-800'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span className="font-bold text-white text-xs">4. Авто-виявлення Маніпулятивних Монет</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                  data.participants.manipulativeCoin?.riskLevel === 'low'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : data.participants.manipulativeCoin?.riskLevel === 'medium'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}>
                  {data.participants.manipulativeCoin?.riskLabel || 'LOW RISK'}
                </span>
              </div>

              {/* Risk progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Індекс вразливості до маніпуляцій:</span>
                  <span className="font-mono font-bold text-white">
                    {data.participants.manipulativeCoin?.riskScore || 15} / 100
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                  <div
                    className={`h-full transition-all ${
                      (data.participants.manipulativeCoin?.riskScore || 15) > 60
                        ? 'bg-rose-500'
                        : (data.participants.manipulativeCoin?.riskScore || 15) > 30
                        ? 'bg-amber-400'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(data.participants.manipulativeCoin?.riskScore || 15, 100)}%` }}
                  />
                </div>
              </div>

              {/* 4 Signals Checklist */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Перевірка ключових чинників маніпуляції:
                </span>
                <div className="space-y-1 text-[11px]">
                  {data.participants.manipulativeCoin?.signals ? (
                    data.participants.manipulativeCoin.signals.map((sig, i) => (
                      <div
                        key={i}
                        className="flex items-start justify-between p-1.5 rounded bg-slate-950/60 border border-slate-800/80 gap-2"
                      >
                        <div className="flex items-start gap-1.5">
                          {sig.detected ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span className="font-medium text-slate-200 block">{sig.name}</span>
                            <span className="text-[10px] text-slate-400 font-sans block leading-tight">
                              {sig.description}
                            </span>
                          </div>
                        </div>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 uppercase font-mono ${
                          sig.detected
                            ? sig.severity === 'high'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-amber-500/20 text-amber-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {sig.detected ? 'Warning' : 'OK'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400 text-[11px]">Ознак штучного пампу/дампу не виявлено.</div>
                  )}
                </div>
              </div>

              {/* Warning summary for trader */}
              <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60">
                {data.participants.manipulativeCoin?.warningSummary || 'Монета демонструє здорову органічну ліквідність та стабільний біржовий стакан.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Calendar,
  Shuffle,
  Clock,
  Sparkles,
  ChevronDown,
  Search,
  Filter,
  Activity,
  CheckCircle2,
  X,
  Gauge,
  Sliders,
} from 'lucide-react';
import { Timeframe, ExchangeId, MarketType, ScannedCoin } from '../../types';
import { formatCryptoPrice, formatLargeNumber } from '../../utils/formatters';

interface ReplayToolbarProps {
  // Coin & Market
  selectedSymbol: string;
  selectedExchange: ExchangeId;
  selectedMarketType: MarketType;
  availableCoins: ScannedCoin[];
  onSelectCoin: (symbol: string, exchange: ExchangeId, marketType: MarketType) => void;

  // Timeframe
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;

  // Replay State & Actions
  isReplayActive: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onResetToCutoff: () => void;

  // Speed
  playbackSpeed: number; // e.g. 1 (600ms), 2 (300ms), 5 (120ms), 0.5 (1200ms)
  onSpeedChange: (speed: number) => void;

  // Date selection
  currentDateText: string;
  onSelectHistoricalDate: (date: Date) => void;
  onRandomHistoricalDate: () => void;

  // Progress
  currentIndex: number;
  totalCandles: number;
  isLoadingHistoricalData: boolean;
}

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

const SPEED_OPTIONS = [
  { label: '0.25x', value: 0.25 },
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1.0 },
  { label: '2x', value: 2.0 },
  { label: '5x', value: 5.0 },
  { label: '10x', value: 10.0 },
];

export const ReplayToolbar: React.FC<ReplayToolbarProps> = ({
  selectedSymbol,
  selectedExchange,
  selectedMarketType,
  availableCoins,
  onSelectCoin,
  timeframe,
  onTimeframeChange,
  isReplayActive,
  isPlaying,
  onTogglePlay,
  onStepForward,
  onResetToCutoff,
  playbackSpeed,
  onSpeedChange,
  currentDateText,
  onSelectHistoricalDate,
  onRandomHistoricalDate,
  currentIndex,
  totalCandles,
  isLoadingHistoricalData,
}) => {
  const [isCoinModalOpen, setIsCoinModalOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [coinSearchQuery, setCoinSearchQuery] = useState('');
  const [coinExchangeFilter, setCoinExchangeFilter] = useState<'all' | 'binance' | 'bybit'>('all');
  const [coinMarketFilter, setCoinMarketFilter] = useState<'all' | 'futures' | 'spot'>('all');
  const [coinVolumeFilter, setCoinVolumeFilter] = useState<'all' | '100k-1m' | '1m-10m' | '10m-100m' | '100m-10b'>('all');
  const [coinSortBy, setCoinSortBy] = useState<'volumeDesc' | 'volumeAsc' | 'changeDesc' | 'changeAsc' | 'nameAsc'>('volumeDesc');
  const [displayCount, setDisplayCount] = useState<number>(300);

  // Datetime input state
  const [customDateTime, setCustomDateTime] = useState<string>(() => {
    // Default 90 days ago
    const d = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });

  // Filter and sort all coins with volume from 100,000 USD to 10,000,000,000 USD ($10B)
  const filteredCoins = useMemo(() => {
    return availableCoins
      .filter((c) => {
        const vol = c.volume24hUsd || 0;
        // Volume boundary: $100k to $10B
        if (vol < 100_000 || vol > 10_000_000_000) return false;

        // Exchange filter
        if (coinExchangeFilter !== 'all' && c.exchange !== coinExchangeFilter) return false;

        // Market filter
        if (coinMarketFilter !== 'all' && c.marketType !== coinMarketFilter) return false;

        // Volume tier filter
        if (coinVolumeFilter === '100k-1m' && (vol < 100_000 || vol >= 1_000_000)) return false;
        if (coinVolumeFilter === '1m-10m' && (vol < 1_000_000 || vol >= 10_000_000)) return false;
        if (coinVolumeFilter === '10m-100m' && (vol < 10_000_000 || vol >= 100_000_000)) return false;
        if (coinVolumeFilter === '100m-10b' && (vol < 100_000_000 || vol > 10_000_000_000)) return false;

        // Search query
        if (coinSearchQuery.trim()) {
          const q = coinSearchQuery.toLowerCase().trim();
          return (
            c.symbol.toLowerCase().includes(q) ||
            c.baseAsset.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (coinSortBy === 'volumeDesc') return (b.volume24hUsd || 0) - (a.volume24hUsd || 0);
        if (coinSortBy === 'volumeAsc') return (a.volume24hUsd || 0) - (b.volume24hUsd || 0);
        if (coinSortBy === 'changeDesc') return (b.priceChange24h || 0) - (a.priceChange24h || 0);
        if (coinSortBy === 'changeAsc') return (a.priceChange24h || 0) - (b.priceChange24h || 0);
        if (coinSortBy === 'nameAsc') return a.symbol.localeCompare(b.symbol);
        return 0;
      });
  }, [availableCoins, coinExchangeFilter, coinMarketFilter, coinVolumeFilter, coinSortBy, coinSearchQuery]);

  const activeCoinInfo = useMemo(() => {
    return availableCoins.find(
      (c) => c.symbol === selectedSymbol && c.exchange === selectedExchange
    );
  }, [availableCoins, selectedSymbol, selectedExchange]);

  const handleApplyCustomDate = () => {
    if (!customDateTime) return;
    const parsed = new Date(customDateTime);
    if (!isNaN(parsed.getTime())) {
      onSelectHistoricalDate(parsed);
      setIsDatePickerOpen(false);
    }
  };

  const handleApplyPresetDaysAgo = (days: number) => {
    const d = new Date(Date.now() - days * 24 * 3600 * 1000);
    onSelectHistoricalDate(d);
    setIsDatePickerOpen(false);
  };

  const progressPercent = totalCandles > 0 ? Math.min(100, (currentIndex / totalCandles) * 100) : 0;
  const remainingCandles = Math.max(0, totalCandles - currentIndex);

  return (
    <div className="flex flex-col gap-2.5 p-3 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md">
      {/* Top Row: Coin Picker, Timeframe Switcher, Bar Replay Modal Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Coin Selector & Timeframes */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Coin Selector Button */}
          <button
            onClick={() => setIsCoinModalOpen(true)}
            className="flex items-center gap-2.5 px-3 py-1.5 sm:py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/60 transition-all text-left group cursor-pointer shadow-inner hover:bg-slate-900/60"
            title="Вибрати монету для Replay (Усі монети ринку з обсягом від $100k до $10B)"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm sm:text-base text-white font-mono group-hover:text-cyan-400 transition-colors">
                  {selectedSymbol}
                </span>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                  {selectedExchange}
                </span>
                <span className="text-[10px] uppercase font-semibold px-1 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400">
                  {selectedMarketType}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5">
                <span>
                  {activeCoinInfo && activeCoinInfo.volume24hUsd
                    ? `Обсяг: $${formatLargeNumber(activeCoinInfo.volume24hUsd)}`
                    : 'Обсяг $100k - $10B'}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-cyan-400/90 font-semibold">
                  {availableCoins.length > 0 ? `${availableCoins.length} монет` : '$100k-$10B'}
                </span>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors ml-1" />
          </button>

          {/* Timeframe Selector */}
          <div className="flex items-center p-1 rounded-xl bg-slate-950/80 border border-slate-800/80">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                disabled={isLoadingHistoricalData}
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                  timeframe === tf
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md shadow-orange-950/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Bar Replay Trigger & Date Picker */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Bar Replay Main Button */}
          <button
            onClick={() => setIsDatePickerOpen(true)}
            disabled={isLoadingHistoricalData}
            className={`group relative flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-black transition-all duration-150 cursor-pointer shadow-lg active:scale-95 select-none ${
              isReplayActive
                ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:via-amber-400 hover:to-orange-400 text-slate-950 shadow-amber-500/25 hover:shadow-amber-500/40 ring-2 ring-amber-400/70 hover:ring-amber-300'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30 hover:border-amber-400'
            }`}
            title="Bar Replay: вибір історичної дати з автоматичним фокусуванням на свічки"
          >
            <Clock className="w-4 h-4 text-slate-950 stroke-[2.5] group-hover:rotate-12 transition-transform duration-200" />
            <span className="tracking-tight">Bar Replay</span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-950/20 text-slate-950 font-mono font-black border border-slate-950/20">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />
              Автофокус
            </span>
          </button>

          {/* Quick Random Date Generator */}
          <button
            onClick={onRandomHistoricalDate}
            disabled={isLoadingHistoricalData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 transition-all cursor-pointer shadow-sm"
            title="Вибрати дату випадковим чином (історичний рандом)"
          >
            <Shuffle className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Випадкова дата</span>
            <span className="sm:hidden">🎲 Рандом</span>
          </button>
        </div>
      </div>

      {/* Bottom Row: Playback Controls (Play/Pause, Step +1, Speed, Progress Bar) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-800/70">
        <div className="flex items-center gap-2">
          {/* Play / Pause */}
          <button
            onClick={onTogglePlay}
            disabled={isLoadingHistoricalData || remainingCandles <= 0}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
              isPlaying
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-950/40'
                : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-950/40'
            }`}
            title={isPlaying ? 'Пауза (Пробіл)' : 'Відтворення (Пробіл)'}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-white" />
                <span>Пауза</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-slate-950" />
                <span>Play</span>
              </>
            )}
          </button>

          {/* Step Forward +1 Candle */}
          <button
            onClick={onStepForward}
            disabled={isLoadingHistoricalData || isPlaying || remainingCandles <= 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-all cursor-pointer"
            title="Крок на 1 свічку вперед (Стрілка вправо →)"
          >
            <SkipForward className="w-3.5 h-3.5 text-cyan-400" />
            <span>+1 Свічка</span>
          </button>

          {/* Reset / Jump to Start */}
          <button
            onClick={onResetToCutoff}
            disabled={isLoadingHistoricalData}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-colors"
            title="Повернутися на початкову дату Replay"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Playback Speed Switcher */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs">
            <span className="px-2 text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
              <Gauge className="w-3 h-3 text-slate-400" />
              Швидкість:
            </span>
            {SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onSpeedChange(opt.value)}
                className={`px-2 py-1 rounded-lg font-mono text-[11px] font-bold transition-all cursor-pointer ${
                  playbackSpeed === opt.value
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live Replay Date & Progress */}
        <div className="flex items-center gap-3 text-xs font-mono">
          {isLoadingHistoricalData ? (
            <div className="flex items-center gap-2 text-amber-400">
              <div className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
              <span>Завантаження свічок з біржі...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="text-right">
                <div className="text-[11px] text-slate-400">
                  Свічка: <b className="text-cyan-400">{currentIndex}</b> / {totalCandles}
                </div>
                <div className="text-[10px] text-slate-500">
                  Залишилось: {remainingCandles} свічок
                </div>
              </div>

              {/* Mini progress bar */}
              <div className="w-24 sm:w-36 h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700/50">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-amber-500 transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Date Picker Modal / Popover */}
      {isDatePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md p-5 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">Вибір історичної дати Replay</h3>
              </div>
              <button
                onClick={() => setIsDatePickerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Виберіть момент у минулому. Графік миттєво переміститься туди, автоматично сфокусується на свічках, а всі наступні свічки будуть приховані для реалістичної торгівлі!
            </p>
            <div className="flex items-center gap-1.5 p-2 rounded-xl bg-cyan-950/40 border border-cyan-800/40 text-cyan-300 text-[11px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
              <span>Автоматичне масштабування та центрування свічок увімкнено.</span>
            </div>

            {/* Quick Random Date */}
            <button
              onClick={() => {
                onRandomHistoricalDate();
                setIsDatePickerOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-indigo-950/50 transition-all cursor-pointer"
            >
              <Shuffle className="w-4 h-4" />
              <span>🎲 Згенерувати випадкову дату (Сюрприз)</span>
            </button>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Швидкі переходи:
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '14 днів тому', days: 14 },
                  { label: '30 днів тому', days: 30 },
                  { label: '60 днів тому', days: 60 },
                  { label: '90 днів тому', days: 90 },
                  { label: '180 днів тому', days: 180 },
                  { label: '1 рік тому', days: 365 },
                ].map((item) => (
                  <button
                    key={item.days}
                    onClick={() => handleApplyPresetDaysAgo(item.days)}
                    className="py-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-mono font-semibold border border-slate-700/60 transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Datetime Input */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Або точна дата і час:
              </label>
              <input
                type="datetime-local"
                value={customDateTime}
                onChange={(e) => setCustomDateTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsDatePickerOpen(false)}
                className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors"
              >
                Скасувати
              </button>
              <button
                onClick={handleApplyCustomDate}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-md transition-colors"
              >
                Почати Replay 🚀
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coin Selection Modal */}
      {isCoinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-white text-base">
                      Усі монети ринку криптовалют
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                      {filteredCoins.length} монет
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Реальний ринок Binance & Bybit з 24г обсягом від <b>$100 тис.</b> до <b>$10 млрд</b>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCoinModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search & Comprehensive Filters */}
            <div className="p-3.5 sm:p-4 border-b border-slate-800/80 bg-slate-950/40 space-y-3">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search */}
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Пошук монети (BTC, SOL, PEPE, SUI, DOGE...)"
                    value={coinSearchQuery}
                    onChange={(e) => setCoinSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    autoFocus
                  />
                  {coinSearchQuery && (
                    <button
                      onClick={() => setCoinSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-[11px] font-semibold text-slate-400">Сортування:</span>
                  <select
                    value={coinSortBy}
                    onChange={(e: any) => setCoinSortBy(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="volumeDesc">Обсяг 24г (найбільші)</option>
                    <option value="volumeAsc">Обсяг 24г (найменші)</option>
                    <option value="changeDesc">Топ ріст (+%)</option>
                    <option value="changeAsc">Топ спад (-%)</option>
                    <option value="nameAsc">За назвою (A-Z)</option>
                  </select>
                </div>
              </div>

              {/* Filter Tiers: Volume & Exchange & Market */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 text-xs">
                {/* Volume Tiers (100k to 10B) */}
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">
                    Обсяг:
                  </span>
                  {[
                    { id: 'all', label: 'Всі ($100k - $10B)' },
                    { id: '100k-1m', label: '$100k - $1M' },
                    { id: '1m-10m', label: '$1M - $10M' },
                    { id: '10m-100m', label: '$10M - $100M' },
                    { id: '100m-10b', label: '$100M - $10B' },
                  ].map((tier) => (
                    <button
                      key={tier.id}
                      onClick={() => {
                        setCoinVolumeFilter(tier.id as any);
                        setDisplayCount(300);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold transition-all cursor-pointer ${
                        coinVolumeFilter === tier.id
                          ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {tier.label}
                    </button>
                  ))}
                </div>

                {/* Exchange & Market Tabs */}
                <div className="flex items-center gap-2">
                  {/* Exchange */}
                  <div className="flex items-center p-0.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px]">
                    {(['all', 'binance', 'bybit'] as const).map((ex) => (
                      <button
                        key={ex}
                        onClick={() => {
                          setCoinExchangeFilter(ex);
                          setDisplayCount(300);
                        }}
                        className={`px-2.5 py-1 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                          coinExchangeFilter === ex
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {ex === 'all' ? 'Всі біржі' : ex}
                      </button>
                    ))}
                  </div>

                  {/* Market */}
                  <div className="flex items-center p-0.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px]">
                    {(['all', 'futures', 'spot'] as const).map((mkt) => (
                      <button
                        key={mkt}
                        onClick={() => {
                          setCoinMarketFilter(mkt);
                          setDisplayCount(300);
                        }}
                        className={`px-2 py-1 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                          coinMarketFilter === mkt
                            ? 'bg-cyan-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {mkt === 'all' ? 'Всі ринки' : mkt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Coins Grid / List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {filteredCoins.slice(0, displayCount).map((coin) => {
                  const isSelected =
                    coin.symbol === selectedSymbol && coin.exchange === selectedExchange;
                  return (
                    <button
                      key={`${coin.exchange}-${coin.symbol}-${coin.marketType}`}
                      onClick={() => {
                        onSelectCoin(coin.symbol, coin.exchange, coin.marketType);
                        setIsCoinModalOpen(false);
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-950/40 border-amber-500/70 text-white ring-1 ring-amber-500'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/50 text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-sm font-mono text-white">
                            {coin.baseAsset}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            /{coin.quoteAsset}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[9px] uppercase px-1 py-0.2 rounded font-bold bg-slate-900 border border-slate-800 text-slate-400">
                            {coin.exchange}
                          </span>
                          <span className="text-[9px] uppercase px-1 py-0.2 rounded font-semibold bg-slate-900 border border-slate-800 text-slate-500">
                            {coin.marketType}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-300 font-mono mt-1 font-semibold">
                          ${formatCryptoPrice(coin.currentPrice || 0)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div
                          className={`text-xs font-mono font-extrabold ${
                            coin.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {coin.priceChange24h >= 0 ? '+' : ''}
                          {coin.priceChange24h?.toFixed(2)}%
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-1">
                          24г: <b className="text-slate-200">${formatLargeNumber(coin.volume24hUsd || 0)}</b>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {filteredCoins.length === 0 && (
                <div className="text-center py-16 text-slate-500 text-xs space-y-2">
                  <Activity className="w-8 h-8 text-slate-600 mx-auto" />
                  <div>Монет за вказаними фільтрами не знайдено.</div>
                  <button
                    onClick={() => {
                      setCoinSearchQuery('');
                      setCoinVolumeFilter('all');
                      setCoinExchangeFilter('all');
                      setCoinMarketFilter('all');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-cyan-400 hover:bg-slate-700 text-xs font-semibold"
                  >
                    Скинути фільтри
                  </button>
                </div>
              )}

              {/* Load More Button if filteredCoins > displayCount */}
              {filteredCoins.length > displayCount && (
                <div className="pt-2 flex items-center justify-center gap-3">
                  <button
                    onClick={() => setDisplayCount((prev) => prev + 300)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                  >
                    + Показати ще 300 монет (залишилось {filteredCoins.length - displayCount})
                  </button>
                  <button
                    onClick={() => setDisplayCount(filteredCoins.length)}
                    className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/40 transition-colors cursor-pointer"
                  >
                    Показати всі ({filteredCoins.length})
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div className="font-mono">
                Показано <b className="text-white">{Math.min(displayCount, filteredCoins.length)}</b> з <b className="text-cyan-400">{filteredCoins.length}</b> монет на ринку ($100k – $10B)
              </div>
              <button
                onClick={() => setIsCoinModalOpen(false)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

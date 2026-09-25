import React from 'react';
import { Search, SlidersHorizontal, LayoutGrid, List, ArrowUpDown } from 'lucide-react';
import { ScreenerFilterState, ExchangeId, MarketType, Timeframe, PatternCategory, PatternBias, PatternStatus } from '../types';

interface ScreenerFiltersProps {
  filters: ScreenerFilterState;
  onFilterChange: (newFilters: Partial<ScreenerFilterState>) => void;
  viewMode: 'grid' | 'table';
  onViewModeChange: (mode: 'grid' | 'table') => void;
}

export const ScreenerFilters: React.FC<ScreenerFiltersProps> = ({
  filters,
  onFilterChange,
  viewMode,
  onViewModeChange,
}) => {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-4">
      {/* Row 1: Search and timeframe */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Пошук монети (BTC, SOL...)"
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors uppercase font-mono"
          />
        </div>
        <div className="inline-flex w-fit items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
          {(['5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => onFilterChange({ timeframe: tf })}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                filters.timeframe === tf
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Exchange and market */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* Exchange Selector */}
        <div className="inline-flex w-fit items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => onFilterChange({ exchange: 'all' })}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              filters.exchange === 'all'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Усі біржі
          </button>
          <button
            onClick={() => onFilterChange({ exchange: 'binance' })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              filters.exchange === 'binance'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Binance
          </button>
          <button
            onClick={() => onFilterChange({ exchange: 'bybit' })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              filters.exchange === 'bybit'
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-orange-400" />
            Bybit
          </button>
        </div>

        {/* Market Type */}
        <div className="inline-flex w-fit items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => onFilterChange({ marketType: 'all' })}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              filters.marketType === 'all'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Усі ринки
          </button>
          <button
            onClick={() => onFilterChange({ marketType: 'futures' })}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              filters.marketType === 'futures'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Фʼючерси (USDT)
          </button>
          <button
            onClick={() => onFilterChange({ marketType: 'spot' })}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              filters.marketType === 'spot'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Спот
          </button>
        </div>

      </div>

      {/* Row 4: Categories, Direction, Status, Min Volume, View Mode */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/60 text-xs">
        {/* Category Pills */}
        <div className="flex items-center flex-wrap gap-1.5">
          <span className="text-slate-400 text-[11px] font-medium mr-1 flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3 text-slate-400" />
            Формації:
          </span>
          {[
            { id: 'all', label: 'Усі' },
            { id: 'reversal', label: 'Розворотні (W, M, ГіП)' },
            { id: 'breakout', label: 'Пробої & Трикутники' },
            { id: 'continuation', label: 'Прапори & Трендові' },
            { id: 'compression', label: 'Стиснення (Squeeze)' },
            { id: 'candlestick', label: 'Свічкові (Price Action)' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => onFilterChange({ category: cat.id as any })}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition-all ${
                filters.category === cat.id
                  ? 'bg-slate-700 text-white font-medium shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800/80'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Direction & Status & Volume */}
        <div className="flex items-center flex-wrap gap-2 ml-auto">
          {/* Bias / Direction */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
            <button
              onClick={() => onFilterChange({ bias: 'all' })}
              className={`px-2 py-1 rounded ${filters.bias === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}
            >
              Усі
            </button>
            <button
              onClick={() => onFilterChange({ bias: 'bullish' })}
              className={`px-2 py-1 rounded ${filters.bias === 'bullish' ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'text-slate-400'}`}
            >
              Long (▲)
            </button>
            <button
              onClick={() => onFilterChange({ bias: 'bearish' })}
              className={`px-2 py-1 rounded ${filters.bias === 'bearish' ? 'bg-rose-500/20 text-rose-300 font-semibold' : 'text-slate-400'}`}
            >
              Short (▼)
            </button>
          </div>

          {/* Min Volume */}
          <div className="flex items-center bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-[11px] text-slate-300">
            <span className="text-slate-500 mr-1.5">Обсяг:</span>
            <select
              value={filters.minVolumeUsd}
              onChange={(e) => onFilterChange({ minVolumeUsd: Number(e.target.value) })}
              className="bg-transparent border-none text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value={0} className="bg-slate-900">Всі монети</option>
              <option value={50000} className="bg-slate-900">Від $50k</option>
              <option value={100000} className="bg-slate-900">Від $100k</option>
              <option value={300000} className="bg-slate-900">Від $300k</option>
              <option value={500000} className="bg-slate-900">Від $500k</option>
              <option value={1000000} className="bg-slate-900">Від $1M</option>
              <option value={5000000} className="bg-slate-900">Від $5M+</option>
              <option value={20000000} className="bg-slate-900">Від $20M</option>
              <option value={50000000} className="bg-slate-900">Від $50M</option>
              <option value={100000000} className="bg-slate-900">Від $100M</option>
              <option value={500000000} className="bg-slate-900">Від $500M</option>
              <option value={1000000000} className="bg-slate-900">Від $1B</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-[11px] text-slate-300">
            <ArrowUpDown className="w-3 h-3 text-slate-500 mr-1.5" />
            <select
              value={filters.sortBy}
              onChange={(e) => onFilterChange({ sortBy: e.target.value as any })}
              className="bg-transparent border-none text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="confidence" className="bg-slate-900">За впевненістю</option>
              <option value="volume" className="bg-slate-900">За обсягом 24г</option>
              <option value="priceChange" className="bg-slate-900">За % зміни</option>
              <option value="profitPotential" className="bg-slate-900">За потенціалом (R:R)</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => onViewModeChange('grid')}
              title="Сітка карток"
              className={`p-1 rounded ${viewMode === 'grid' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onViewModeChange('table')}
              title="Компактна таблиця"
              className={`p-1 rounded ${viewMode === 'table' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import {
  Search,
  X,
  Layers,
  Star,
  Flame,
  Plus,
  TrendingUp,
  TrendingDown,
  Activity,
  Check,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { ScannedCoin, DetectedFormation, Timeframe, ExchangeId, MarketType } from '../../types';
import { formatCryptoPrice, formatVolume } from '../../utils/formatters';

interface AddChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  coins: ScannedCoin[];
  watchlist: string[];
  onAddChart: (coin: ScannedCoin, timeframe: Timeframe, mode: 'tradingview' | 'pattern' | 'orderbook', formationId?: string) => void;
}

export const AddChartModal: React.FC<AddChartModalProps> = ({
  isOpen,
  onClose,
  coins,
  watchlist,
  onAddChart,
}) => {
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'formations' | 'watchlist' | 'gainers' | 'volume'>('all');
  const [selectedExchange, setSelectedExchange] = useState<'all' | ExchangeId>('all');
  const [selectedMarket, setSelectedMarket] = useState<'all' | MarketType>('all');
  const [selectedMinVolume, setSelectedMinVolume] = useState<number>(0);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('15m');
  const [selectedMode, setSelectedMode] = useState<'tradingview' | 'pattern' | 'orderbook'>('tradingview');

  const filteredCoins = useMemo(() => {
    let result = coins;

    if (selectedExchange !== 'all') {
      result = result.filter((c) => c.exchange === selectedExchange);
    }

    if (selectedMarket !== 'all') {
      result = result.filter((c) => c.marketType === selectedMarket);
    }

    if (selectedMinVolume > 0) {
      result = result.filter((c) => (c.volume24hUsd || 0) >= selectedMinVolume);
    }

    if (filterTab === 'formations') {
      result = result.filter((c) => c.formations && c.formations.length > 0);
    } else if (filterTab === 'watchlist') {
      result = result.filter((c) => watchlist.includes(c.symbol));
    } else if (filterTab === 'gainers') {
      result = [...result].sort((a, b) => b.priceChange24h - a.priceChange24h);
    } else if (filterTab === 'volume') {
      result = [...result].sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0));
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.symbol.toLowerCase().includes(q) ||
          c.baseAsset.toLowerCase().includes(q) ||
          c.formations?.some((f) => f.name.toLowerCase().includes(q) || f.nameEn.toLowerCase().includes(q))
      );
    }

    return result;
  }, [coins, filterTab, selectedExchange, selectedMarket, selectedMinVolume, watchlist, search]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                Додати графік у термінал
              </h3>
              <p className="text-xs text-slate-400">
                Виберіть монету зі списку або скористайтеся швидким пошуком
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar & Parameters before adding */}
        <div className="p-3 sm:p-4 border-b border-slate-800/80 bg-slate-950/40 space-y-3">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 sm:flex-wrap">
            <span className="text-[11px] text-slate-400 font-semibold mr-1 flex items-center gap-1 shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              Фільтри:
            </span>

            <button
              onClick={() => setFilterTab('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                filterTab === 'all'
                  ? 'bg-cyan-600 text-white font-semibold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              Усі
            </button>

            <button
              onClick={() => setFilterTab('formations')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                filterTab === 'formations'
                  ? 'bg-purple-600 text-white font-semibold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3 h-3 text-purple-400" />
              З формаціями
            </button>

            <button
              onClick={() => setFilterTab('watchlist')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                filterTab === 'watchlist'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Star className="w-3 h-3 text-amber-400" />
              Обрані ({watchlist.length})
            </button>

            <button
              onClick={() => setFilterTab('volume')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                filterTab === 'volume'
                  ? 'bg-slate-800 text-cyan-300 font-semibold border border-cyan-500/30'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              Топ об'єм
            </button>

            <button
              onClick={() => setFilterTab('gainers')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                filterTab === 'gainers'
                  ? 'bg-slate-800 text-emerald-300 font-semibold border border-emerald-500/30'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              Топ зростання
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук монети"
              autoFocus
              className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              <button
                onClick={() => setSelectedExchange('all')}
                className={`px-2 py-0.5 rounded ${
                  selectedExchange === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400'
                }`}
              >
                Всі
              </button>
              <button
                onClick={() => setSelectedExchange('binance')}
                className={`px-2 py-0.5 rounded ${
                  selectedExchange === 'binance' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400'
                }`}
              >
                Binance
              </button>
              <button
                onClick={() => setSelectedExchange('bybit')}
                className={`px-2 py-0.5 rounded ${
                  selectedExchange === 'bybit' ? 'bg-orange-500/20 text-orange-300 font-bold' : 'text-slate-400'
                }`}
              >
                Bybit
              </button>
            </div>

            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              <button
                onClick={() => setSelectedMarket('all')}
                className={`px-2 py-0.5 rounded ${selectedMarket === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400'}`}
              >
                Усі ринки
              </button>
              <button
                onClick={() => setSelectedMarket('futures')}
                className={`px-2 py-0.5 rounded ${selectedMarket === 'futures' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400'}`}
              >
                Фʼючерси
              </button>
              <button
                onClick={() => setSelectedMarket('spot')}
                className={`px-2 py-0.5 rounded ${selectedMarket === 'spot' ? 'bg-indigo-500/20 text-indigo-300 font-bold' : 'text-slate-400'}`}
              >
                Спот
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/60 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[11px]">Таймфрейм:</span>
              <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 font-mono text-[11px]">
                {(['1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setSelectedTimeframe(tf)}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      selectedTimeframe === tf
                        ? 'bg-cyan-600 text-white font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <div className="flex items-center bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 text-[11px] text-slate-300">
              <span className="text-slate-500 mr-1.5">Обсяг:</span>
              <select
                value={selectedMinVolume}
                onChange={(e) => setSelectedMinVolume(Number(e.target.value))}
                className="bg-transparent border-none text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value={0} className="bg-slate-900">Всі монети</option>
                <option value={50000} className="bg-slate-900">$50K+</option>
                <option value={100000} className="bg-slate-900">$100K+</option>
                <option value={500000} className="bg-slate-900">$500K+</option>
                <option value={1000000} className="bg-slate-900">$1M+</option>
                <option value={5000000} className="bg-slate-900">$5M+</option>
              </select>
            </div>
          </div>
        </div>

        {/* Coins List */}
        <div className="flex-1 overflow-y-auto p-3 divide-y divide-slate-800/60 max-h-[480px]">
          {filteredCoins.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Activity className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-xs">За вашим запитом монет не знайдено</p>
            </div>
          ) : (
            filteredCoins.slice(0, 80).map((coin) => {
              const isPositive = coin.priceChange24h >= 0;
              const hasFormations = coin.formations && coin.formations.length > 0;
              const firstFormation = hasFormations ? coin.formations[0] : null;

              return (
                <div
                  key={`${coin.exchange}-${coin.symbol}-${coin.marketType}`}
                  onClick={() => {
                    onAddChart(coin, selectedTimeframe, selectedMode, firstFormation?.id);
                    onClose();
                  }}
                  className="py-2.5 px-3 rounded-xl hover:bg-slate-800/60 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-xs font-mono text-white group-hover:bg-cyan-600/20 group-hover:text-cyan-300 transition-colors">
                      {coin.baseAsset.slice(0, 3)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-sm text-white group-hover:text-cyan-300 transition-colors">
                          {coin.symbol}
                        </span>
                        <span
                          className={`text-[9px] px-1 rounded font-bold uppercase ${
                            coin.exchange === 'binance'
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : 'bg-orange-500/15 text-orange-300 border border-orange-500/30'
                          }`}
                        >
                          {coin.exchange}
                        </span>
                        <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-400 uppercase">
                          {coin.marketType === 'futures' ? 'Perp' : 'Spot'}
                        </span>
                      </div>

                      {/* Formation badges if any */}
                      {hasFormations && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] text-purple-300 flex items-center gap-1 bg-purple-950/60 px-1.5 py-0.2 rounded border border-purple-800/40">
                            <Layers className="w-2.5 h-2.5" />
                            {firstFormation?.name}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="font-mono font-bold text-xs text-white">
                        ${formatCryptoPrice(coin.currentPrice)}
                      </div>
                      <div
                        className={`text-[10px] font-mono flex items-center justify-end gap-0.5 font-semibold ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        <span>
                          {isPositive ? '+' : ''}
                          {coin.priceChange24h.toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/30 text-xs font-semibold transition-all flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Додати</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

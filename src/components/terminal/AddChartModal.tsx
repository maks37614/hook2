import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  X,
  Layers,
  Star,
  Plus,
  TrendingUp,
  TrendingDown,
  Activity,
  SlidersHorizontal,
  Flame,
  ArrowUpDown,
  Zap,
  Globe,
  Loader2,
} from 'lucide-react';
import { ScannedCoin, Timeframe, ExchangeId, MarketType, TerminalBlockMode, MarketCoin } from '../../types';
import { formatCryptoPrice, formatVolume } from '../../utils/formatters';
import { fetchDirectBinanceTickers, fetchDirectBybitTickers } from '../../utils/directExchangeClient';

interface AddChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  coins: ScannedCoin[];
  watchlist: string[];
  initialMode?: TerminalBlockMode;
  onAddChart: (
    coin: ScannedCoin | MarketCoin | { symbol: string; baseAsset: string; quoteAsset: string; exchange: ExchangeId; marketType: MarketType },
    timeframe: Timeframe,
    mode: TerminalBlockMode,
    formationId?: string
  ) => void;
}

// Module-level cache for all 2,400+ exchange market coins between $50k and $10B
let globalMarketCoinsCache: MarketCoin[] | null = null;
let globalMarketCoinsTimestamp = 0;
const CACHE_TTL = 30 * 1000; // 30s cache

export const AddChartModal: React.FC<AddChartModalProps> = ({
  isOpen,
  onClose,
  coins,
  watchlist,
  initialMode = 'tradingview',
  onAddChart,
}) => {
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'volume' | 'gainers' | 'losers' | 'formations' | 'watchlist'>('all');
  const [selectedExchange, setSelectedExchange] = useState<'all' | ExchangeId>('all');
  const [selectedMarket, setSelectedMarket] = useState<'all' | MarketType>('all');
  const [selectedMinVolume, setSelectedMinVolume] = useState<number>(50_000); // Default $50k
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('15m');
  const [selectedMode, setSelectedMode] = useState<TerminalBlockMode>(initialMode);
  const [marketCoins, setMarketCoins] = useState<MarketCoin[]>(() => globalMarketCoinsCache || []);
  const [isLoadingAllCoins, setIsLoadingAllCoins] = useState(false);
  const [displayCount, setDisplayCount] = useState<number>(80);

  // Sync mode on open
  useEffect(() => {
    if (isOpen) {
      setSelectedMode(initialMode);
      setDisplayCount(80);
    }
  }, [isOpen, initialMode]);

  // Load all coins from exchange ($50k to $10B)
  useEffect(() => {
    if (!isOpen) return;

    if (globalMarketCoinsCache && Date.now() - globalMarketCoinsTimestamp < CACHE_TTL) {
      setMarketCoins(globalMarketCoinsCache);
      return;
    }

    let isMounted = true;
    async function loadAllMarketCoins() {
      setIsLoadingAllCoins(true);
      try {
        const res = await fetch('/api/screener/coins?minVolume=50000&maxVolume=10000000000');
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            if (isMounted) {
              setMarketCoins(json.data);
              globalMarketCoinsCache = json.data;
              globalMarketCoinsTimestamp = Date.now();
              setIsLoadingAllCoins(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Backend coins fetch fallback in AddChartModal:', err);
      }

      // Direct exchange fallback (Binance + Bybit)
      try {
        const [binanceTickers, bybitTickers] = await Promise.all([
          fetchDirectBinanceTickers(),
          fetchDirectBybitTickers(),
        ]);
        const combined = [...binanceTickers, ...bybitTickers].filter(
          (c) => c.volumeUsd >= 50_000 && c.volumeUsd <= 10_000_000_000
        );
        if (isMounted && combined.length > 0) {
          setMarketCoins(combined);
          globalMarketCoinsCache = combined;
          globalMarketCoinsTimestamp = Date.now();
        }
      } catch (fallbackErr) {
        console.warn('Direct fallback failed:', fallbackErr);
      } finally {
        if (isMounted) setIsLoadingAllCoins(false);
      }
    }

    loadAllMarketCoins();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Create unified lookup map from ScannedCoins (contains detected formations)
  const formationsMap = useMemo(() => {
    const map = new Map<string, ScannedCoin>();
    for (const c of coins) {
      const key = `${c.exchange}_${c.symbol}_${c.marketType}`.toUpperCase();
      map.set(key, c);
    }
    return map;
  }, [coins]);

  // Unified coins list: merges all market coins with formation metadata
  const unifiedCoins = useMemo(() => {
    if (marketCoins.length > 0) {
      return marketCoins.map((mc) => {
        const key = `${mc.exchange}_${mc.symbol}_${mc.marketType}`.toUpperCase();
        const scanned = formationsMap.get(key);
        return {
          symbol: mc.symbol,
          baseAsset: mc.baseAsset,
          quoteAsset: mc.quoteAsset || 'USDT',
          exchange: mc.exchange,
          marketType: mc.marketType,
          currentPrice: mc.price,
          priceChange24h: mc.change24h,
          volume24hUsd: mc.volumeUsd,
          highPrice24h: mc.high24h,
          lowPrice24h: mc.low24h,
          formations: scanned?.formations || [],
        };
      });
    }

    // If marketCoins haven't loaded yet, fall back to initial scanned coins
    return coins.map((c) => ({
      symbol: c.symbol,
      baseAsset: c.baseAsset,
      quoteAsset: c.quoteAsset,
      exchange: c.exchange,
      marketType: c.marketType,
      currentPrice: c.currentPrice,
      priceChange24h: c.priceChange24h,
      volume24hUsd: c.volume24hUsd || 0,
      highPrice24h: c.highPrice24h || c.currentPrice,
      lowPrice24h: c.lowPrice24h || c.currentPrice,
      formations: c.formations || [],
    }));
  }, [marketCoins, coins, formationsMap]);

  // Filter and sort coins
  const filteredCoins = useMemo(() => {
    let result = unifiedCoins;

    // Exchange filter
    if (selectedExchange !== 'all') {
      result = result.filter((c) => c.exchange === selectedExchange);
    }

    // Market filter
    if (selectedMarket !== 'all') {
      result = result.filter((c) => c.marketType === selectedMarket);
    }

    // Min volume filter ($50k to $10B)
    if (selectedMinVolume > 0) {
      result = result.filter((c) => (c.volume24hUsd || 0) >= selectedMinVolume);
    }

    // Tab category filter
    if (filterTab === 'formations') {
      result = result.filter((c) => c.formations && c.formations.length > 0);
    } else if (filterTab === 'watchlist') {
      result = result.filter((c) => watchlist.includes(c.symbol));
    } else if (filterTab === 'gainers') {
      result = [...result].sort((a, b) => b.priceChange24h - a.priceChange24h);
    } else if (filterTab === 'losers') {
      result = [...result].sort((a, b) => a.priceChange24h - b.priceChange24h);
    } else if (filterTab === 'volume' || filterTab === 'all') {
      result = [...result].sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0));
    }

    // Text search query filter
    if (search.trim()) {
      const q = search.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      result = result.filter((c) => {
        const sym = c.symbol.toLowerCase();
        const base = c.baseAsset.toLowerCase();
        return (
          sym.includes(q) ||
          base.includes(q) ||
          c.formations?.some((f) => f.name.toLowerCase().includes(q) || f.nameEn.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [unifiedCoins, filterTab, selectedExchange, selectedMarket, selectedMinVolume, watchlist, search]);

  if (!isOpen) return null;

  // Clean custom search ticker candidate
  const cleanSearchSymbol = search.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hasExactMatch = cleanSearchSymbol && filteredCoins.some((c) => c.symbol === cleanSearchSymbol || c.symbol === `${cleanSearchSymbol}USDT`);

  const handleQuickAddCustom = (ex: ExchangeId, mt: MarketType) => {
    const symbol = cleanSearchSymbol.endsWith('USDT') ? cleanSearchSymbol : `${cleanSearchSymbol}USDT`;
    const base = symbol.replace(/(USDT|BUSD|USDC)$/, '') || symbol;
    onAddChart(
      {
        symbol,
        baseAsset: base,
        quoteAsset: 'USDT',
        exchange: ex,
        marketType: mt,
      },
      selectedTimeframe,
      selectedMode
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  {selectedMode === 'orderbook'
                    ? 'Додати біржовий стакан у термінал'
                    : selectedMode === 'combined'
                    ? 'Додати Графік + Стакан у термінал'
                    : 'Додати графік у термінал'}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[10px] font-mono font-bold">
                  {unifiedCoins.length > 0 ? `${unifiedCoins.length.toLocaleString()} монет` : 'Завантаження...'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Повний список монет на біржі від $50k до $10B (Binance & Bybit, Futures & Spot)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar & Filter Parameters */}
        <div className="p-3 sm:p-4 border-b border-slate-800/80 bg-slate-950/50 space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setDisplayCount(80);
              }}
              placeholder="Пошук за символом монети (напр. BTC, ETH, SOL, PEPE, WIF, RENDER, SUI, DOGE, TAO...)"
              autoFocus
              className="w-full pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs cursor-pointer p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Add Custom Symbol Card if typing a symbol */}
          {cleanSearchSymbol && !hasExactMatch && (
            <div className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-indigo-950/40 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-xs text-slate-300">
                  Швидко додати графік для <strong className="text-white font-mono">{cleanSearchSymbol}USDT</strong>:
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => handleQuickAddCustom('binance', 'futures')}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                >
                  + Binance Futures
                </button>
                <button
                  onClick={() => handleQuickAddCustom('bybit', 'futures')}
                  className="px-2.5 py-1 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                >
                  + Bybit Linear
                </button>
                <button
                  onClick={() => handleQuickAddCustom('binance', 'spot')}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-all active:scale-95 cursor-pointer"
                >
                  + Binance Spot
                </button>
              </div>
            </div>
          )}

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 flex-nowrap sm:flex-wrap">
            <span className="text-[11px] text-slate-400 font-semibold mr-1 flex items-center gap-1 shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              Вкладка:
            </span>

            <button
              onClick={() => { setFilterTab('all'); setDisplayCount(80); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterTab === 'all'
                  ? 'bg-cyan-600 text-white font-bold shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              Усі монети ({unifiedCoins.length.toLocaleString()})
            </button>

            <button
              onClick={() => { setFilterTab('volume'); setDisplayCount(80); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterTab === 'volume'
                  ? 'bg-slate-800 text-cyan-300 font-bold border border-cyan-500/30'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3 h-3 text-cyan-400 inline mr-1" />
              Топ за обсягом
            </button>

            <button
              onClick={() => { setFilterTab('gainers'); setDisplayCount(80); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterTab === 'gainers'
                  ? 'bg-slate-800 text-emerald-300 font-bold border border-emerald-500/30'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3 h-3 text-emerald-400 inline mr-1" />
              Топ зростання
            </button>

            <button
              onClick={() => { setFilterTab('losers'); setDisplayCount(80); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterTab === 'losers'
                  ? 'bg-slate-800 text-rose-300 font-bold border border-rose-500/30'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingDown className="w-3 h-3 text-rose-400 inline mr-1" />
              Топ падіння
            </button>

            <button
              onClick={() => { setFilterTab('formations'); setDisplayCount(80); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterTab === 'formations'
                  ? 'bg-purple-600 text-white font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3 h-3 text-purple-400" />
              З формаціями
            </button>

            <button
              onClick={() => { setFilterTab('watchlist'); setDisplayCount(80); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterTab === 'watchlist'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Star className="w-3 h-3 text-amber-400" />
              Обрані ({watchlist.length})
            </button>
          </div>

          {/* Secondary Filters: Exchange, Market, Volume Range */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-slate-800/60">
            {/* Exchange Selector */}
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              <span className="text-slate-500 px-1 font-semibold">Біржа:</span>
              <button
                onClick={() => setSelectedExchange('all')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  selectedExchange === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Всі
              </button>
              <button
                onClick={() => setSelectedExchange('binance')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  selectedExchange === 'binance' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Binance
              </button>
              <button
                onClick={() => setSelectedExchange('bybit')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  selectedExchange === 'bybit' ? 'bg-orange-500/20 text-orange-300 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Bybit
              </button>
            </div>

            {/* Market Type Selector */}
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              <span className="text-slate-500 px-1 font-semibold">Ринок:</span>
              <button
                onClick={() => setSelectedMarket('all')}
                className={`px-2 py-0.5 rounded cursor-pointer ${selectedMarket === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                Усі
              </button>
              <button
                onClick={() => setSelectedMarket('futures')}
                className={`px-2 py-0.5 rounded cursor-pointer ${selectedMarket === 'futures' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                Фʼючерси
              </button>
              <button
                onClick={() => setSelectedMarket('spot')}
                className={`px-2 py-0.5 rounded cursor-pointer ${selectedMarket === 'spot' ? 'bg-indigo-500/20 text-indigo-300 font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                Спот
              </button>
            </div>

            {/* Volume Range Selector ($50k - $10B) */}
            <div className="flex items-center bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 text-[11px] text-slate-300">
              <span className="text-slate-500 mr-1.5 font-semibold">Обсяг 24h:</span>
              <select
                value={selectedMinVolume}
                onChange={(e) => {
                  setSelectedMinVolume(Number(e.target.value));
                  setDisplayCount(80);
                }}
                className="bg-transparent border-none text-slate-200 focus:outline-none cursor-pointer font-medium"
              >
                <option value={50000} className="bg-slate-900 text-white">Всі ($50K - $10B)</option>
                <option value={100000} className="bg-slate-900 text-white">&gt; $100K</option>
                <option value={500000} className="bg-slate-900 text-white">&gt; $500K</option>
                <option value={1000000} className="bg-slate-900 text-white">&gt; $1M</option>
                <option value={10000000} className="bg-slate-900 text-white">&gt; $10M</option>
                <option value={50000000} className="bg-slate-900 text-white">&gt; $50M</option>
                <option value={100000000} className="bg-slate-900 text-white">&gt; $100M</option>
              </select>
            </div>
          </div>

          {/* Block Type & Timeframe Configuration */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/60 text-xs">
            {/* Block Type Mode Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[11px] font-semibold">Тип блоку:</span>
              <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSelectedMode('tradingview')}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer font-medium ${
                    selectedMode === 'tradingview'
                      ? 'bg-cyan-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  📈 Графік
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMode('orderbook')}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer font-medium ${
                    selectedMode === 'orderbook'
                      ? 'bg-emerald-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  📑 Стакан (DOM)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMode('combined')}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer font-medium ${
                    selectedMode === 'combined'
                      ? 'bg-gradient-to-r from-cyan-600 to-emerald-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ⚡ Графік + Стакан
                </button>
              </div>
            </div>

            {/* Timeframe Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[11px] font-semibold">Таймфрейм:</span>
              <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 font-mono text-[11px]">
                {(['1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setSelectedTimeframe(tf)}
                    className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
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
        </div>

        {/* Coins List (Virtualized / Paginated) */}
        <div className="flex-1 overflow-y-auto p-3 divide-y divide-slate-800/60 max-h-[500px] touch-scroll">
          {isLoadingAllCoins && marketCoins.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-3">
              <Loader2 className="w-8 h-8 mx-auto text-cyan-400 animate-spin" />
              <p className="text-xs font-semibold text-white">Завантаження повного списку монет з біржі ($50k - $10B)...</p>
              <p className="text-[11px] text-slate-500">Синхронізація Binance Futures, Binance Spot, Bybit Linear та Spot</p>
            </div>
          ) : filteredCoins.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Activity className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-xs font-semibold text-white">За вашим фільтром монет не знайдено</p>
              <p className="text-[11px] text-slate-500">Спробуйте змінити фільтр обсягу або введіть інший символ у пошук</p>
            </div>
          ) : (
            <>
              <div className="text-[11px] text-slate-500 px-3 py-1 flex items-center justify-between">
                <span>Знайдено: <strong className="text-white font-mono">{filteredCoins.length.toLocaleString()}</strong> монет</span>
                <span>Діапазон обсягу: <strong className="text-cyan-400 font-mono">${(selectedMinVolume / 1000).toFixed(0)}K - $10B</strong></span>
              </div>

              {filteredCoins.slice(0, displayCount).map((coin) => {
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
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/50 flex items-center justify-center font-bold text-xs font-mono text-white group-hover:bg-cyan-600/20 group-hover:text-cyan-300 group-hover:border-cyan-500/40 transition-colors shrink-0 shadow-sm">
                        {coin.baseAsset.slice(0, 3)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-bold text-sm text-white group-hover:text-cyan-300 transition-colors">
                            {coin.symbol}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                              coin.exchange === 'binance'
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                : 'bg-orange-500/15 text-orange-300 border border-orange-500/30'
                            }`}
                          >
                            {coin.exchange}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                              coin.marketType === 'futures'
                                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {coin.marketType === 'futures' ? 'Perp' : 'Spot'}
                          </span>
                        </div>

                        {/* Volume and Details */}
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                          <span>
                            Обсяг 24h: <strong className="text-slate-300 font-mono">{formatVolume(coin.volume24hUsd || 0)}</strong>
                          </span>
                          {hasFormations && (
                            <span className="text-[10px] text-purple-300 flex items-center gap-1 bg-purple-950/60 px-1.5 py-0.2 rounded border border-purple-800/40">
                              <Layers className="w-2.5 h-2.5" />
                              {firstFormation?.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3.5 shrink-0">
                      <div className="text-right">
                        <div className="font-mono font-bold text-xs sm:text-sm text-white">
                          ${formatCryptoPrice(coin.currentPrice)}
                        </div>
                        <div
                          className={`text-[10px] sm:text-xs font-mono flex items-center justify-end gap-0.5 font-bold ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          <span>
                            {isPositive ? '+' : ''}
                            {coin.priceChange24h.toFixed(2)}%
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/40 text-xs font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer group-hover:bg-cyan-600 group-hover:text-white"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Додати</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Show more button if filteredCoins exceeds displayCount */}
              {filteredCoins.length > displayCount && (
                <div className="p-3 text-center">
                  <button
                    onClick={() => setDisplayCount((prev) => prev + 80)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white text-xs font-bold transition-all cursor-pointer border border-slate-700"
                  >
                    Показати ще 80 монет (залишилось {(filteredCoins.length - displayCount).toLocaleString()})...
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

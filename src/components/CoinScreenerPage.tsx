import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  Flame,
  Zap,
  Send,
  Bookmark,
  ExternalLink,
  RefreshCw,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Activity,
  Layers,
  BarChart2,
  Maximize2,
  Sparkles,
  Radar,
} from 'lucide-react';
import { useSurveillance } from '../context/SurveillanceContext';
import {
  ExchangeId,
  MarketType,
  MarketCoin,
  ScreenerPresetFilter,
  ScreenerSortBy,
  ScannedCoin,
  DetectedFormation,
} from '../types';
import { formatCryptoPrice, formatVolume, formatPercent } from '../utils/formatters';
import { getStoredPreferences, useAppPreferences } from '../utils/userPreferences';
import { MarketSentimentWidget } from './MarketSentimentWidget';
import {
  fetchDirectBinanceTickers,
  fetchDirectBybitTickers,
  TOP_POPULAR_PAIRS,
} from '../utils/directExchangeClient';

interface CoinScreenerPageProps {
  onSelectCoin: (coin: ScannedCoin, formation?: DetectedFormation) => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
  onOpenTelegramAlerts: (prefill?: any) => void;
  onOpenWatchlist: () => void;
  formationsCoins?: ScannedCoin[];
}

export const CoinScreenerPage: React.FC<CoinScreenerPageProps> = ({
  onSelectCoin,
  onSendMetaScalp,
  metaScalpBinding = '001',
  watchlist,
  onToggleWatchlist,
  onOpenTelegramAlerts,
  onOpenWatchlist,
  formationsCoins = [],
}) => {
  const [coins, setCoins] = useState<MarketCoin[]>(() =>
    TOP_POPULAR_PAIRS.map((p, idx) => ({
      symbol: p.symbol,
      baseAsset: p.baseAsset,
      quoteAsset: 'USDT',
      exchange: 'binance',
      marketType: 'futures',
      price: idx === 0 ? 84500 : idx === 1 ? 2200 : idx === 2 ? 140 : 1.5,
      change24h: 1.25,
      volumeUsd: 100_000_000 - idx * 2_000_000,
      high24h: idx === 0 ? 85500 : 2300,
      low24h: idx === 0 ? 83500 : 2150,
      distanceToHighPct: 1.1,
      distanceToLowPct: 1.2,
      volatility24hPct: 2.3,
      isNearHigh: false,
      isNearLow: false,
      isActiveCoin: true,
      exchangeUrl: `https://www.binance.com/en/futures/${p.symbol}`,
    }))
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const { preferences } = useAppPreferences();

  // Search & Filter state
  const [presetFilter, setPresetFilter] = useState<ScreenerPresetFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [exchange, setExchange] = useState<'all' | ExchangeId>(() => getStoredPreferences().defaultExchange);
  const [marketType, setMarketType] = useState<'all' | MarketType>(() => getStoredPreferences().defaultMarketType);

  useEffect(() => {
    setExchange(preferences.defaultExchange);
    setMarketType(preferences.defaultMarketType);
  }, [preferences.defaultExchange, preferences.defaultMarketType]);
  const [minVolumeUsd, setMinVolumeUsd] = useState<number>(0);
  const [sortBy, setSortBy] = useState<ScreenerSortBy>('volume');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const { coins: surveillanceCoins, addCoinToSurveillance, removeCoinFromSurveillance, isCoinMonitored } = useSurveillance();
  const [surveillanceToast, setSurveillanceToast] = useState<string | null>(null);

  const handleSurveillanceToggle = async (e: React.MouseEvent, coin: MarketCoin) => {
    e.stopPropagation();
    const monitored = isCoinMonitored(coin.symbol, coin.exchange);
    if (monitored) {
      const found = surveillanceCoins.find(
        (c) => c.symbol === coin.symbol && c.exchange === coin.exchange
      );
      if (found) {
        await removeCoinFromSurveillance(found.id);
        setSurveillanceToast(`#${coin.symbol} видалено з системного нагляду`);
        setTimeout(() => setSurveillanceToast(null), 3000);
      }
    } else {
      const res = await addCoinToSurveillance(coin.symbol, coin.exchange, coin.marketType);
      if (res.success) {
        setSurveillanceToast(`#${coin.symbol} додано на системний нагляд!`);
        setTimeout(() => setSurveillanceToast(null), 3000);
      }
    }
  };
  const [displayLimit, setDisplayLimit] = useState<number>(50);

  // Fetch coins from API with direct exchange fallback
  const fetchCoins = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    let dataLoaded = false;

    try {
      const params = new URLSearchParams({
        exchange,
        marketType,
        minVolume: '0',
      });
      const res = await fetch(`/api/screener/coins?${params.toString()}`);
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          if (data.success && Array.isArray(data.data) && data.data.length > 0) {
            setCoins(data.data);
            setLastUpdated(data.timestamp || Date.now());
            dataLoaded = true;
          }
        }
      }
    } catch (err) {
      console.warn('Backend coins fetch failed, trying direct exchange access:', err);
    }

    if (!dataLoaded) {
      try {
        const [binanceCoins, bybitCoins] = await Promise.all([
          exchange === 'all' || exchange === 'binance' ? fetchDirectBinanceTickers() : Promise.resolve([]),
          exchange === 'all' || exchange === 'bybit' ? fetchDirectBybitTickers() : Promise.resolve([]),
        ]);
        const directCoins = [...binanceCoins, ...bybitCoins];
        if (directCoins.length > 0) {
          setCoins(directCoins);
          setLastUpdated(Date.now());
          dataLoaded = true;
        }
      } catch (directErr) {
        console.warn('Direct exchange fetch failed:', directErr);
      }
    }

    setIsLoading(false);
  }, [exchange, marketType, minVolumeUsd]);

  // Initial load and re-fetch when exchange/market/minVolume changes
  useEffect(() => {
    fetchCoins();
  }, [fetchCoins]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchCoins();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchCoins]);

  // Handle Preset Click
  const handlePresetChange = (preset: ScreenerPresetFilter) => {
    setPresetFilter(preset);
    setDisplayLimit(50);
    if (preset === 'top_gainers') {
      setSortBy('priceChange');
      setSortOrder('desc');
    } else if (preset === 'top_losers') {
      setSortBy('priceChange');
      setSortOrder('asc');
    } else if (preset === 'near_highs') {
      setSortBy('distanceToHigh');
      setSortOrder('asc');
    } else if (preset === 'near_lows') {
      setSortBy('distanceToLow');
      setSortOrder('asc');
    } else if (preset === 'active') {
      setSortBy('volatility');
      setSortOrder('desc');
    }
  };

  // Header column click toggle sorting
  const handleHeaderSort = (column: ScreenerSortBy) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(column);
      setSortOrder(column === 'distanceToHigh' || column === 'distanceToLow' ? 'asc' : 'desc');
    }
  };

  // Create lookup for formations
  const formationsMap = useMemo(() => {
    const map = new Map<string, ScannedCoin>();
    for (const c of formationsCoins) {
      const key = `${c.exchange}_${c.symbol}_${c.marketType}`.toUpperCase();
      map.set(key, c);
    }
    return map;
  }, [formationsCoins]);

  // Filter and Sort coins
  const filteredCoins = useMemo(() => {
    let result = coins.filter((coin) => {
      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const symbolMatch = coin.symbol.toLowerCase().includes(query);
        const baseMatch = coin.baseAsset.toLowerCase().includes(query);
        if (!symbolMatch && !baseMatch) return false;
      }

      // Exchange filter
      if (exchange !== 'all' && coin.exchange !== exchange) return false;

      // Market type filter
      if (marketType !== 'all' && coin.marketType !== marketType) return false;

      // Maximum volume filter
      if (minVolumeUsd > 0 && coin.volumeUsd > minVolumeUsd) return false;

      // Preset filters
      if (presetFilter === 'active') {
        return coin.isActiveCoin;
      }
      if (presetFilter === 'top_gainers') {
        return coin.change24h > 0;
      }
      if (presetFilter === 'top_losers') {
        return coin.change24h < 0;
      }
      if (presetFilter === 'near_highs') {
        return coin.isNearHigh;
      }
      if (presetFilter === 'near_lows') {
        return coin.isNearLow;
      }

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'volume') {
        comparison = b.volumeUsd - a.volumeUsd;
      } else if (sortBy === 'priceChange') {
        comparison = b.change24h - a.change24h;
      } else if (sortBy === 'price') {
        comparison = b.price - a.price;
      } else if (sortBy === 'volatility') {
        comparison = b.volatility24hPct - a.volatility24hPct;
      } else if (sortBy === 'distanceToHigh') {
        comparison = a.distanceToHighPct - b.distanceToHighPct;
      } else if (sortBy === 'distanceToLow') {
        comparison = a.distanceToLowPct - b.distanceToLowPct;
      }

      return sortOrder === 'asc' ? -comparison : comparison;
    });

    return result;
  }, [coins, searchQuery, exchange, marketType, minVolumeUsd, presetFilter, sortBy, sortOrder]);

  // Market stats calculated from all coins
  const marketStats = useMemo(() => {
    if (coins.length === 0) {
      return {
        total: 0,
        activeCount: 0,
        nearHighCount: 0,
        nearLowCount: 0,
        totalVolume: 0,
        topGainer: null,
        topLoser: null,
      };
    }

    let activeCount = 0;
    let nearHighCount = 0;
    let nearLowCount = 0;
    let totalVolume = 0;
    let topGainer = coins[0];
    let topLoser = coins[0];

    for (const c of coins) {
      if (c.isActiveCoin) activeCount++;
      if (c.isNearHigh) nearHighCount++;
      if (c.isNearLow) nearLowCount++;
      totalVolume += c.volumeUsd;

      if (c.change24h > topGainer.change24h) topGainer = c;
      if (c.change24h < topLoser.change24h) topLoser = c;
    }

    return {
      total: coins.length,
      activeCount,
      nearHighCount,
      nearLowCount,
      totalVolume,
      topGainer,
      topLoser,
    };
  }, [coins]);

  // Helper to convert MarketCoin to ScannedCoin and trigger modal
  const handleCoinClick = (coin: MarketCoin) => {
    const key = `${coin.exchange}_${coin.symbol}_${coin.marketType}`.toUpperCase();
    const existing = formationsMap.get(key);

    if (existing && existing.formations.length > 0) {
      onSelectCoin(existing, existing.formations[0]);
    } else {
      // Synthesize ScannedCoin and Formation
      const scanned: ScannedCoin = {
        symbol: coin.symbol,
        baseAsset: coin.baseAsset,
        quoteAsset: coin.quoteAsset,
        exchange: coin.exchange,
        marketType: coin.marketType,
        currentPrice: coin.price,
        priceChange24h: coin.change24h,
        highPrice24h: coin.high24h,
        lowPrice24h: coin.low24h,
        volume24hUsd: coin.volumeUsd,
        formations: [],
        timeframe: '1h',
        lastUpdated: Date.now(),
        exchangeUrl: coin.exchangeUrl,
      };

      const defaultFormation: DetectedFormation = {
        id: `screener_${coin.symbol}_${Date.now()}`,
        patternKey: 'range',
        name: coin.isNearHigh
          ? 'Тестування 24h High (Спротив)'
          : coin.isNearLow
          ? 'Тестування 24h Low (Підтримка)'
          : 'Діапазон ціни 24h',
        nameEn: coin.isNearHigh ? '24h High Test' : coin.isNearLow ? '24h Low Test' : '24h Range',
        category: 'breakout',
        bias: coin.change24h >= 0 ? 'bullish' : 'bearish',
        confidence: 85,
        status: 'forming',
        statusLabel: coin.change24h >= 0 ? 'Зростання' : 'Корекція',
        description: `Поточна ціна $${formatCryptoPrice(coin.price)}, 24h максимум $${formatCryptoPrice(coin.high24h)}, 24h мінімум $${formatCryptoPrice(coin.low24h)}.`,
        levels: {
          entryPrice: coin.price,
          targetPrice: coin.high24h > coin.price ? coin.high24h : coin.price * 1.03,
          stopLossPrice: coin.low24h < coin.price ? coin.low24h : coin.price * 0.97,
          resistancePrice: coin.high24h,
          supportPrice: coin.low24h,
        },
        riskRewardRatio: 2.2,
        potentialProfitPct: Math.abs(coin.change24h) || 3.0,
        potentialRiskPct: 1.5,
        detectedAt: Date.now(),
      };

      onSelectCoin(scanned, defaultFormation);
    }
  };

  const handleSendMetaScalpClick = (e: React.MouseEvent, coin: MarketCoin) => {
    e.stopPropagation();
    if (onSendMetaScalp) {
      const scanned: ScannedCoin = {
        symbol: coin.symbol,
        baseAsset: coin.baseAsset,
        quoteAsset: coin.quoteAsset,
        exchange: coin.exchange,
        marketType: coin.marketType,
        currentPrice: coin.price,
        priceChange24h: coin.change24h,
        highPrice24h: coin.high24h,
        lowPrice24h: coin.low24h,
        volume24hUsd: coin.volumeUsd,
        formations: [],
        timeframe: '1h',
        lastUpdated: Date.now(),
        exchangeUrl: coin.exchangeUrl,
      };
      onSendMetaScalp(scanned);
    }
  };

  const handleAlertClick = (e: React.MouseEvent, coin: MarketCoin) => {
    e.stopPropagation();
    onOpenTelegramAlerts({
      symbol: coin.symbol,
      exchange: coin.exchange,
      marketType: coin.marketType,
      currentPrice: coin.price,
      targetPrice: coin.isNearHigh ? coin.high24h : coin.isNearLow ? coin.low24h : coin.price,
      condition: 'gte',
      formationName: `Скрінер: ${coin.symbol}`,
    });
  };

  return (
    <div className="space-y-6 relative">
      {/* Surveillance Action Toast */}
      {surveillanceToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border border-violet-500/50 bg-slate-950/90 text-violet-200 shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 backdrop-blur-md">
          <Radar className="w-4 h-4 text-violet-400 animate-spin" />
          <span>{surveillanceToast}</span>
        </div>
      )}
      {/* Market Sentiment Block ("Настрій Ринку") */}
      <MarketSentimentWidget coins={coins} />

      {/* Quick navigation and watchlist controls */}
      <div className="fixed bottom-4 right-4 z-30 flex flex-col gap-2">
        <button
          onClick={onOpenWatchlist}
          className="p-2 rounded-xl bg-slate-900/95 border border-slate-700 text-amber-400 shadow-lg shadow-black/20 hover:bg-slate-800 transition-colors"
          title="Обрані монети"
          aria-label="Відкрити обрані монети"
        >
          <Bookmark className="w-4 h-4" />
        </button>
      </div>

      {/* Main Filter & Search Toolbar */}
      <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/70 border border-slate-800/90 backdrop-blur-md space-y-3 sm:space-y-4">
        {/* Preset Category Filter Buttons (Prompt Required: Активні монети, топ за зростанням, на хаях, на лоях) */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0 sm:flex-wrap">
          <span className="text-xs text-slate-400 font-semibold mr-1 flex items-center gap-1 shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden xs:inline">Фільтри:</span>
          </span>

          <button
            onClick={() => handlePresetChange('all')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              presetFilter === 'all'
                ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/50'
            }`}
          >
            Усі
          </button>

          <button
            onClick={() => handlePresetChange('active')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              presetFilter === 'active'
                ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20 font-bold'
                : 'bg-slate-800/80 text-amber-400 hover:bg-slate-800 border border-amber-500/30'
            }`}
          >
            <Flame className="w-3.5 h-3.5 fill-current" />
            <span>Активні</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-950/80 text-amber-200 border border-amber-800/50 font-mono">
              {marketStats.activeCount}
            </span>
          </button>

          <button
            onClick={() => handlePresetChange('top_gainers')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              presetFilter === 'top_gainers'
                ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20 font-bold'
                : 'bg-slate-800/80 text-emerald-400 hover:bg-slate-800 border border-emerald-500/30'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Топ ріст 24г</span>
          </button>

          <button
            onClick={() => handlePresetChange('top_losers')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              presetFilter === 'top_losers'
                ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/20 font-bold'
                : 'bg-slate-800/80 text-rose-400 hover:bg-slate-800 border border-rose-500/30'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>Топ спад 24г</span>
          </button>

          <button
            onClick={() => handlePresetChange('near_highs')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              presetFilter === 'near_highs'
                ? 'bg-purple-500 text-white shadow-sm shadow-purple-500/20 font-bold'
                : 'bg-slate-800/80 text-purple-300 hover:bg-slate-800 border border-purple-500/30'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>На хаях</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-950/80 text-purple-200 border border-purple-800/50 font-mono">
              {marketStats.nearHighCount}
            </span>
          </button>

          <button
            onClick={() => handlePresetChange('near_lows')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              presetFilter === 'near_lows'
                ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/20 font-bold'
                : 'bg-slate-800/80 text-blue-300 hover:bg-slate-800 border border-blue-500/30'
            }`}
          >
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>На лоях</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-950/80 text-blue-200 border border-blue-800/50 font-mono">
              {marketStats.nearLowCount}
            </span>
          </button>
        </div>

        {/* Secondary controls: Search, Exchange, Market, Min Volume, View mode */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-800/60">
          <div className="w-full flex justify-center">
            <div className="relative w-full sm:w-auto sm:min-w-[200px] sm:max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Пошук монети"
                className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 flex-1 min-w-0 sm:relative sm:left-12">
            {/* Exchange Filter */}
            <div className="flex items-center rounded-xl bg-slate-950/80 border border-slate-800 p-0.5 text-xs">
              <button
                onClick={() => setExchange('all')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  exchange === 'all' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Всі
              </button>
              <button
                onClick={() => setExchange('binance')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  exchange === 'binance' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-amber-400'
                }`}
              >
                Binance
              </button>
              <button
                onClick={() => setExchange('bybit')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  exchange === 'bybit' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'text-slate-400 hover:text-orange-400'
                }`}
              >
                Bybit
              </button>
            </div>

            {/* Market Type Filter */}
            <div className="flex items-center rounded-xl bg-slate-950/80 border border-slate-800 p-0.5 text-xs">
              <button
                onClick={() => setMarketType('all')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  marketType === 'all' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Всі ринки
              </button>
              <button
                onClick={() => setMarketType('futures')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  marketType === 'futures' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-400 hover:text-indigo-400'
                }`}
              >
                Futures
              </button>
              <button
                onClick={() => setMarketType('spot')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  marketType === 'spot' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                Spot
              </button>
            </div>

          </div>

          {/* Right side: view toggle + refresh */}
          <div className="flex items-center gap-2 self-center">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl bg-slate-950/80 border border-slate-800 p-0.5 text-xs">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'table' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Табличний вигляд"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'cards' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Вигляд карток"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Refresh button */}
            <button
              onClick={() => fetchCoins()}
              disabled={isLoading}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
              title="Оновити котирування"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Separate Sort block row positioned under search */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/40">
          <div className="flex items-center gap-2">
            {/* Sort Selector - Standalone separate block */}
            <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1 text-xs">
              <span className="text-slate-500 text-[11px] shrink-0">Сортувати:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as ScreenerSortBy)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer font-medium text-xs"
              >
                <option value="volume" className="bg-slate-900 text-white">Об'єм 24г</option>
                <option value="priceChange" className="bg-slate-900 text-white">Зміна 24г (%)</option>
                <option value="price" className="bg-slate-900 text-white">Ціна ($)</option>
                <option value="volatility" className="bg-slate-900 text-white">Волатильність</option>
                <option value="distanceToHigh" className="bg-slate-900 text-white">Близькість до High</option>
                <option value="distanceToLow" className="bg-slate-900 text-white">Близькість до Low</option>
              </select>
              <button
                onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                title={sortOrder === 'desc' ? 'За спаданням' : 'За зростанням'}
                className="p-1 rounded text-slate-400 hover:text-cyan-300 transition-colors shrink-0"
              >
                {sortOrder === 'desc' ? <ChevronDown className="w-3.5 h-3.5 text-cyan-400" /> : <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />}
              </button>
            </div>

            {/* Maximum Volume Filter */}
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <span className="hidden sm:inline">Об'єм:</span>
              <select
                value={minVolumeUsd}
                onChange={(e) => {
                  setMinVolumeUsd(Number(e.target.value));
                  setDisplayLimit(50);
                  setPresetFilter('all');
                }}
                className="bg-slate-950/80 border border-slate-800 rounded-xl px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value={0}>Показати всі</option>
                <option value={50_000}>До $50K</option>
                <option value={100_000}>До $100K</option>
                <option value={500_000}>До $500K</option>
                <option value={2_000_000}>До $2M</option>
                <option value={10_000_000}>До $10M</option>
                <option value={50_000_000}>До $50M</option>
                <option value={100_000_000}>До $100M</option>
                <option value={500_000_000}>До $500M</option>
                <option value={1_000_000_000}>До $1B</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Знайдено: <span className="text-slate-300 font-mono font-medium">{filteredCoins.length}</span> з {coins.length}
          </div>
        </div>
      </div>

      {/* Results Header Info */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span>
            Відображено <strong className="text-white font-mono">{Math.min(filteredCoins.length, displayLimit)}</strong> з{' '}
            <strong className="text-cyan-400 font-mono">{filteredCoins.length}</strong> монет
          </span>
          {presetFilter !== 'all' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 border border-slate-700 text-slate-300">
              Фільтр: {presetFilter === 'active' ? 'Активні' : presetFilter === 'top_gainers' ? 'Топ зростання' : presetFilter === 'top_losers' ? 'Топ падіння' : presetFilter === 'near_highs' ? 'На хаях' : 'На лоях'}
            </span>
          )}
        </div>
        {lastUpdated && (
          <div className="text-[11px] text-slate-500 hidden sm:block">
            Оновлено: {new Date(lastUpdated).toLocaleTimeString('uk-UA')}
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchCoins()}
            className="px-3 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-900 font-semibold transition-colors"
          >
            Повторити
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && coins.length === 0 ? (
        <div className="space-y-2">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-xl bg-slate-900/40 border border-slate-800/60 animate-pulse flex items-center justify-between px-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-800" />
                <div className="w-20 h-4 bg-slate-800 rounded" />
              </div>
              <div className="w-24 h-4 bg-slate-800 rounded" />
              <div className="w-16 h-4 bg-slate-800 rounded" />
              <div className="w-32 h-4 bg-slate-800 rounded hidden md:block" />
              <div className="w-20 h-4 bg-slate-800 rounded" />
            </div>
          ))}
        </div>
      ) : filteredCoins.length === 0 ? (
        <div className="py-20 text-center rounded-3xl border border-slate-800/80 bg-slate-900/40 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <Search className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Монет не знайдено</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              За заданими параметрами та фільтрами монет не знайдено. Спробуйте змінити фільтр, зменшити мінімальний об'єм або очистити поле пошуку.
            </p>
          </div>
          <button
            onClick={() => {
              setPresetFilter('all');
              setSearchQuery('');
              setExchange('all');
              setMarketType('all');
              setMinVolumeUsd(0);
            }}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
          >
            Скинути всі фільтри
          </button>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-900/50 backdrop-blur-sm shadow-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-950/60 text-slate-400 select-none">
                <th
                  onClick={() => handleHeaderSort('volume')}
                  className="py-3 px-3.5 font-semibold cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Монета</span>
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('price')}
                  className="py-3 px-3.5 font-semibold text-right cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Ціна ($)</span>
                    {sortBy === 'price' && (sortOrder === 'desc' ? <ChevronDown className="w-3 h-3 text-cyan-400" /> : <ChevronUp className="w-3 h-3 text-cyan-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('priceChange')}
                  className="py-3 px-3.5 font-semibold text-right cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>24г Зміна (%)</span>
                    {sortBy === 'priceChange' && (sortOrder === 'desc' ? <ChevronDown className="w-3 h-3 text-cyan-400" /> : <ChevronUp className="w-3 h-3 text-cyan-400" />)}
                  </div>
                </th>
                <th className="py-3 px-3.5 font-semibold text-center hidden md:table-cell">
                  24г Діапазон (Low - High)
                </th>
                <th
                  onClick={() => handleHeaderSort('distanceToHigh')}
                  className="py-3 px-3.5 font-semibold text-right cursor-pointer hover:text-white transition-colors hidden lg:table-cell"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>До High 24г</span>
                    {sortBy === 'distanceToHigh' && (sortOrder === 'desc' ? <ChevronDown className="w-3 h-3 text-cyan-400" /> : <ChevronUp className="w-3 h-3 text-cyan-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('distanceToLow')}
                  className="py-3 px-3.5 font-semibold text-right cursor-pointer hover:text-white transition-colors hidden lg:table-cell"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>До Low 24г</span>
                    {sortBy === 'distanceToLow' && (sortOrder === 'desc' ? <ChevronDown className="w-3 h-3 text-cyan-400" /> : <ChevronUp className="w-3 h-3 text-cyan-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('volume')}
                  className="py-3 px-3.5 font-semibold text-right cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Об'єм 24г</span>
                    {sortBy === 'volume' && (sortOrder === 'desc' ? <ChevronDown className="w-3 h-3 text-cyan-400" /> : <ChevronUp className="w-3 h-3 text-cyan-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('volatility')}
                  className="py-3 px-3.5 font-semibold text-right cursor-pointer hover:text-white transition-colors hidden sm:table-cell"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Волатильність</span>
                    {sortBy === 'volatility' && (sortOrder === 'desc' ? <ChevronDown className="w-3 h-3 text-cyan-400" /> : <ChevronUp className="w-3 h-3 text-cyan-400" />)}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 font-mono">
              {filteredCoins.slice(0, displayLimit).map((coin, index) => {
                const isWatchlisted = watchlist.includes(coin.symbol);
                const isPositive = coin.change24h >= 0;

                // Calculate where price is positioned between 24h low and high (0 to 100%)
                const rangeDiff = coin.high24h - coin.low24h;
                const pricePosition =
                  rangeDiff > 0
                    ? Math.min(100, Math.max(0, ((coin.price - coin.low24h) / rangeDiff) * 100))
                    : 50;

                return (
                  <tr
                    key={`${coin.exchange}-${coin.symbol}-${coin.marketType}-${index}`}
                    onClick={() => handleCoinClick(coin)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
                  >
                    {/* Symbol & Exchange */}
                    <td className="py-3 px-3.5">
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleWatchlist(coin.symbol);
                          }}
                          className={`p-1 rounded transition-colors ${
                            isWatchlisted
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-600 hover:text-slate-400'
                          }`}
                          title={isWatchlisted ? 'Видалити з обраного' : 'Додати в обране'}
                        >
                          <Bookmark className={`w-3.5 h-3.5 ${isWatchlisted ? 'fill-amber-400' : ''}`} />
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white group-hover:text-cyan-400 transition-colors text-sm">
                              {coin.baseAsset}
                            </span>
                            <span className="text-[10px] text-slate-500">/USDT</span>

                            {/* Badges for Hot / High / Low */}
                            {coin.isActiveCoin && (
                              <span
                                className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/15 border border-amber-500/30 text-amber-300 font-sans font-bold flex items-center gap-0.5"
                                title="Висока активність та об'єм"
                              >
                                <Flame className="w-2.5 h-2.5 fill-current" />
                              </span>
                            )}
                            {coin.isNearHigh && (
                              <span
                                className="px-1.5 py-0.2 rounded text-[9px] bg-purple-500/15 border border-purple-500/30 text-purple-300 font-sans font-semibold"
                                title="Монета біля 24h максимуму"
                              >
                                На хаях
                              </span>
                            )}
                            {coin.isNearLow && (
                              <span
                                className="px-1.5 py-0.2 rounded text-[9px] bg-blue-500/15 border border-blue-500/30 text-blue-300 font-sans font-semibold"
                                title="Монета біля 24h мінімуму"
                              >
                                На лоях
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 mt-0.5">
                            <span
                              className={`text-[9px] px-1 py-0.2 rounded font-sans font-bold uppercase ${
                                coin.exchange === 'binance'
                                  ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                                  : 'bg-orange-950/80 text-orange-400 border border-orange-800/60'
                              }`}
                            >
                              {coin.exchange}
                            </span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-sans uppercase">
                              {coin.marketType}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 ml-1">
                          {onSendMetaScalp && (
                            <button
                              onClick={(e) => handleSendMetaScalpClick(e, coin)}
                              className="p-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition-colors"
                              title={`Відкрити в MetaScalp (${metaScalpBinding})`}
                            >
                              <Zap className="w-3 h-3" />
                            </button>
                          )}

                          <button
                            onClick={(e) => handleAlertClick(e, coin)}
                            className="p-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 transition-colors"
                            title="Встановити сповіщення в Telegram"
                          >
                            <Send className="w-3 h-3" />
                          </button>

                          <button
                            onClick={(e) => handleSurveillanceToggle(e, coin)}
                            className={`p-1 rounded-lg transition-colors cursor-pointer ${
                              isCoinMonitored(coin.symbol, coin.exchange)
                                ? 'bg-violet-500/25 text-violet-300 border border-violet-500/40'
                                : 'bg-violet-500/10 hover:bg-violet-500/20 text-violet-300/70 hover:text-violet-200'
                            }`}
                            title={
                              isCoinMonitored(coin.symbol, coin.exchange)
                                ? 'Монета на системному нагляді (Натисніть щоб зняти)'
                                : 'Взяти монету на системний нагляд'
                            }
                          >
                            <Radar className={`w-3 h-3 ${isCoinMonitored(coin.symbol, coin.exchange) ? 'animate-pulse' : ''}`} />
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td className="py-3 px-3.5 text-right font-bold text-white">
                      ${formatCryptoPrice(coin.price)}
                    </td>

                    {/* 24h Change */}
                    <td className="py-3 px-3.5 text-right">
                      <span
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-bold ${
                          isPositive
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {formatPercent(coin.change24h)}
                      </span>
                    </td>

                    {/* 24h Range Bar */}
                    <td className="py-3 px-3.5 hidden md:table-cell">
                      <div className="w-36 mx-auto space-y-1">
                        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                          <span>${formatCryptoPrice(coin.low24h)}</span>
                          <span>${formatCryptoPrice(coin.high24h)}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden relative">
                          <div
                            className={`h-full rounded-full transition-all ${
                              coin.isNearHigh
                                ? 'bg-gradient-to-r from-emerald-500 to-purple-500'
                                : coin.isNearLow
                                ? 'bg-gradient-to-r from-rose-500 to-blue-500'
                                : 'bg-gradient-to-r from-cyan-500 to-indigo-500'
                            }`}
                            style={{ width: `${pricePosition}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Distance to 24h High */}
                    <td className="py-3 px-3.5 text-right hidden lg:table-cell">
                      <span
                        className={`text-xs font-semibold ${
                          coin.isNearHigh
                            ? 'text-purple-400 font-bold bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20'
                            : 'text-slate-400'
                        }`}
                      >
                        -{coin.distanceToHighPct.toFixed(1)}%
                      </span>
                    </td>

                    {/* Distance to 24h Low */}
                    <td className="py-3 px-3.5 text-right hidden lg:table-cell">
                      <span
                        className={`text-xs font-semibold ${
                          coin.isNearLow
                            ? 'text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20'
                            : 'text-slate-400'
                        }`}
                      >
                        +{coin.distanceToLowPct.toFixed(1)}%
                      </span>
                    </td>

                    {/* 24h Volume */}
                    <td className="py-3 px-3.5 text-right font-bold text-slate-200">
                      {formatVolume(coin.volumeUsd)}
                    </td>

                    {/* Volatility */}
                    <td className="py-3 px-3.5 text-right hidden sm:table-cell">
                      <span
                        className={`text-xs ${
                          coin.volatility24hPct >= 8
                            ? 'text-amber-400 font-bold'
                            : coin.volatility24hPct >= 4
                            ? 'text-slate-300 font-medium'
                            : 'text-slate-500'
                        }`}
                      >
                        {coin.volatility24hPct.toFixed(1)}%
                      </span>
                    </td>


                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* CARDS / GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
          {filteredCoins.slice(0, displayLimit).map((coin, index) => {
            const isWatchlisted = watchlist.includes(coin.symbol);
            const isPositive = coin.change24h >= 0;
            const rangeDiff = coin.high24h - coin.low24h;
            const pricePosition =
              rangeDiff > 0
                ? Math.min(100, Math.max(0, ((coin.price - coin.low24h) / rangeDiff) * 100))
                : 50;

            return (
              <div
                key={`${coin.exchange}-${coin.symbol}-${coin.marketType}-${index}`}
                onClick={() => handleCoinClick(coin)}
                className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 backdrop-blur-sm transition-all hover:shadow-lg hover:shadow-cyan-950/20 cursor-pointer flex flex-col justify-between space-y-3 group"
              >
                {/* Card Top: Symbol, exchange, bookmark */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white group-hover:text-cyan-400 transition-colors text-base font-mono">
                        {coin.baseAsset}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">/USDT</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-sans font-bold uppercase ${
                          coin.exchange === 'binance'
                            ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                            : 'bg-orange-950/80 text-orange-400 border border-orange-800/60'
                        }`}
                      >
                        {coin.exchange}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-sans uppercase">
                        {coin.marketType}
                      </span>
                      {coin.isActiveCoin && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/15 border border-amber-500/30 text-amber-300 font-sans font-bold flex items-center gap-0.5">
                          <Flame className="w-2.5 h-2.5 fill-current" />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleWatchlist(coin.symbol);
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isWatchlisted
                          ? 'text-amber-400 bg-amber-500/10'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Bookmark className={`w-4 h-4 ${isWatchlisted ? 'fill-amber-400' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Price and 24h Change */}
                <div className="flex items-baseline justify-between gap-2 pt-1 border-t border-slate-800/60 font-mono">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-sans">Ціна</div>
                    <div className="text-lg font-bold text-white">
                      ${formatCryptoPrice(coin.price)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-sans">24г Зміна</div>
                    <span
                      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-bold ${
                        isPositive
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {formatPercent(coin.change24h)}
                    </span>
                  </div>
                </div>

                {/* 24h Range Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Low: ${formatCryptoPrice(coin.low24h)}</span>
                    <span>High: ${formatCryptoPrice(coin.high24h)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all ${
                        coin.isNearHigh
                          ? 'bg-gradient-to-r from-emerald-500 to-purple-500'
                          : coin.isNearLow
                          ? 'bg-gradient-to-r from-rose-500 to-blue-500'
                          : 'bg-gradient-to-r from-cyan-500 to-indigo-500'
                      }`}
                      style={{ width: `${pricePosition}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-sans">
                    <span className={coin.isNearLow ? 'text-blue-400 font-bold' : 'text-slate-500'}>
                      +{coin.distanceToLowPct.toFixed(1)}% від лою
                    </span>
                    <span className={coin.isNearHigh ? 'text-purple-400 font-bold' : 'text-slate-500'}>
                      -{coin.distanceToHighPct.toFixed(1)}% від хаю
                    </span>
                  </div>
                </div>

                {/* Card Footer: Volume + Action Buttons */}
                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Оборот 24г</span>
                    <span className="font-bold font-mono text-slate-300">
                      {formatVolume(coin.volumeUsd)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {onSendMetaScalp && (
                      <button
                        onClick={(e) => handleSendMetaScalpClick(e, coin)}
                        className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition-colors"
                        title="Відкрити в MetaScalp"
                      >
                        <Zap className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleAlertClick(e, coin)}
                      className="p-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 transition-colors"
                      title="Telegram сповіщення"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleSurveillanceToggle(e, coin)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer border ${
                        isCoinMonitored(coin.symbol, coin.exchange)
                          ? 'bg-violet-500/25 text-violet-300 border-violet-500/40'
                          : 'bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/30 text-violet-300/70 hover:text-violet-200'
                      }`}
                      title={
                        isCoinMonitored(coin.symbol, coin.exchange)
                          ? 'Монета на системному нагляді (Натисніть щоб зняти)'
                          : 'Взяти монету на системний нагляд'
                      }
                    >
                      <Radar className={`w-3.5 h-3.5 ${isCoinMonitored(coin.symbol, coin.exchange) ? 'animate-pulse' : ''}`} />
                    </button>
                    <a
                      href={coin.exchangeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      title="Біржа"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination / "Load more" button */}
      {filteredCoins.length > displayLimit && (
        <div className="text-center pt-2">
          <button
            onClick={() => setDisplayLimit((prev) => prev + 50)}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-300 border border-slate-700 transition-all shadow-md cursor-pointer"
          >
            Показати ще 50 монет (залишилось {filteredCoins.length - displayLimit})
          </button>
        </div>
      )}
    </div>
  );
};

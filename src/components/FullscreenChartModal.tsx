import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Minimize2,
  Layers,
  BarChart2,
  Send,
  Zap,
  TrendingUp,
  TrendingDown,
  Info,
  RefreshCw,
  Star,
  Search,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Kline, DetectedFormation, Timeframe, ExchangeId, MarketType, ChartMarkerInfo, ChartRestoreParams, ScannedCoin } from '../types';
import { TradingViewChart } from './TradingViewChart';
import { formatCryptoPrice } from '../utils/formatters';

interface FullscreenChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  coin: {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    exchange: ExchangeId;
    marketType: MarketType;
    currentPrice: number;
    priceChange24h: number;
    volume24hUsd?: number;
    exchangeUrl?: string;
  };
  formation?: DetectedFormation | null;
  klines?: Kline[];
  currentTimeframe: string;
  onTimeframeChange?: (tf: Timeframe) => void;
  livePrice?: number | null;
  onOpenTelegramModal?: (data: any) => void;
  onSendMetaScalp?: (coin: any) => void;
  metaScalpBinding?: string;
  onAddToArchive?: () => void;
  isArchived?: boolean;
  customMarkers?: ChartMarkerInfo[];
  savedChartParams?: ChartRestoreParams;
  allCoins?: ScannedCoin[];
  watchlist?: string[];
  onToggleWatchlist?: (symbol: string) => void;
}

export const FullscreenChartModal: React.FC<FullscreenChartModalProps> = ({
  isOpen,
  onClose,
  coin,
  formation,
  klines = [],
  currentTimeframe,
  onTimeframeChange,
  livePrice,
  onOpenTelegramModal,
  onSendMetaScalp,
  metaScalpBinding = '001',
  onAddToArchive,
  isArchived,
  customMarkers,
  savedChartParams,
  allCoins = [],
  watchlist = [],
  onToggleWatchlist,
}) => {
  const [activeCoin, setActiveCoin] = useState(coin);
  const [isFavoritesDrawerOpen, setIsFavoritesDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [localWatchlist, setLocalWatchlist] = useState<string[]>(() => {
    try {
      const initial = watchlist && watchlist.length > 0 ? watchlist : JSON.parse(localStorage.getItem('crypto_screener_watchlist') || '[]');
      return Array.isArray(initial) ? Array.from(new Set(initial)) : [];
    } catch {
      return [];
    }
  });

  // Sync localWatchlist with prop if parent updates
  useEffect(() => {
    if (watchlist && watchlist.length > 0) {
      setLocalWatchlist(Array.from(new Set(watchlist)));
    }
  }, [watchlist]);

  // Sync activeCoin with parent coin prop when symbol changes
  useEffect(() => {
    setActiveCoin(coin);
  }, [coin.symbol]);

  const [activeMode, setActiveMode] = useState<'tradingview' | 'pattern'>('tradingview');
  const [timeframe, setTimeframe] = useState<string>(currentTimeframe || '15m');
  const [iframeLoading, setIframeLoading] = useState<boolean>(true);
  const [showDrawingToolbar, setShowDrawingToolbar] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('crypto_screener_tv_show_tools');
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });

  const handleToggleDrawingToolbar = useCallback(() => {
    setShowDrawingToolbar((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('crypto_screener_tv_show_tools', String(next));
      } catch {}
      return next;
    });
  }, []);

  // Remove symbol from favorites
  const handleRemoveFromWatchlist = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalWatchlist((prev) => {
      const next = prev.filter((s) => s !== sym);
      try {
        localStorage.setItem('crypto_screener_watchlist', JSON.stringify(next));
      } catch {}
      return next;
    });
    onToggleWatchlist?.(sym);
  };

  // Build full coin list for favorites
  const favoriteCoins = useMemo(() => {
    const uniqueSymbols: string[] = Array.from(new Set<string>(localWatchlist));
    const coinsMap = new Map<string, ScannedCoin>();
    allCoins.forEach((c) => {
      if (!coinsMap.has(c.symbol)) {
        coinsMap.set(c.symbol, c);
      }
    });

    return uniqueSymbols.map((sym: string) => {
      const found = coinsMap.get(sym);
      if (found) return found;
      const clean = sym.toUpperCase();
      const base = clean.replace(/(USDT|BUSD|USDC)$/, '') || clean;
      const quote = clean.slice(base.length) || 'USDT';
      return {
        symbol: clean,
        baseAsset: base,
        quoteAsset: quote,
        exchange: 'binance' as ExchangeId,
        marketType: 'futures' as MarketType,
        currentPrice: 0,
        priceChange24h: 0,
        formations: [],
      } as unknown as ScannedCoin;
    });
  }, [allCoins, localWatchlist]);

  // Filter favorites by search query
  const filteredFavorites = useMemo(() => {
    if (!searchQuery.trim()) return favoriteCoins;
    const q = searchQuery.toLowerCase().trim();
    return favoriteCoins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(q) ||
        c.baseAsset.toLowerCase().includes(q)
    );
  }, [favoriteCoins, searchQuery]);

  // Handle clicking a favorite coin to switch chart
  const handleSelectFavoriteCoin = (favCoin: ScannedCoin) => {
    setActiveCoin({
      symbol: favCoin.symbol,
      baseAsset: favCoin.baseAsset,
      quoteAsset: favCoin.quoteAsset,
      exchange: favCoin.exchange,
      marketType: favCoin.marketType,
      currentPrice: favCoin.currentPrice,
      priceChange24h: favCoin.priceChange24h,
      volume24hUsd: favCoin.volume24hUsd,
      exchangeUrl: favCoin.exchangeUrl,
    });
    setIframeLoading(true);
  };

  // Sync internal timeframe if parent changes
  useEffect(() => {
    if (currentTimeframe) {
      setTimeframe(currentTimeframe);
    }
  }, [currentTimeframe]);

  // Handle escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background body scroll when open
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const handleTimeframeSelect = (tf: Timeframe) => {
    setTimeframe(tf);
    onTimeframeChange?.(tf);
    setIframeLoading(true);
  };

  // Build TradingView Embed URL
  const tradingViewUrl = useMemo(() => {
    const cleanSymbol = activeCoin.symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const isBybit = activeCoin.exchange === 'bybit';
    const isFutures = activeCoin.marketType === 'futures';

    let tvPrefix = isBybit ? 'BYBIT' : 'BINANCE';
    // Binance and Bybit futures symbol formatting for TradingView
    let tvSymbol = isFutures ? `${tvPrefix}:${cleanSymbol}.P` : `${tvPrefix}:${cleanSymbol}`;

    // Map interval
    let interval = '15';
    switch (timeframe) {
      case '1m':
        interval = '1';
        break;
      case '5m':
        interval = '5';
        break;
      case '15m':
        interval = '15';
        break;
      case '1h':
        interval = '60';
        break;
      case '4h':
        interval = '240';
        break;
      case '1d':
        interval = 'D';
        break;
      default:
        interval = '15';
    }

    const params = new URLSearchParams({
      symbol: tvSymbol,
      interval: interval,
      theme: 'dark',
      style: '1', // candlesticks
      timezone: 'exchange',
      withdateranges: '0', // Прибрано панель знизу (date ranges bar)
      hide_top_toolbar: '1', // Прибрано верхню панель TradingView
      hide_side_toolbar: '0', // Панель TradingView керується локальним overlay без перезавантаження iframe
      allow_symbol_change: '0', // Прибрано вибір та назву символу з панелі
      save_image: '0',
      hide_legend: '1', // Прибрано назву монети, біржі та легенду з самого графіку
      locale: 'uk',
      toolbar_bg: '#090d16',
      gridColor: 'rgba(0,0,0,0)',
      gridTransparency: '100',
    });
    // NOTE: details, hotlist, calendar, news, watchlist are explicitly OMITTED to ensure NO right-hand panel or hotlists appear!

    return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
  }, [activeCoin.symbol, activeCoin.exchange, activeCoin.marketType, timeframe]);

  if (!isOpen) return null;

  const displayPrice =
    activeCoin.symbol === coin.symbol && livePrice
      ? livePrice
      : activeCoin.currentPrice;
  const isPositive = activeCoin.priceChange24h >= 0;
  const isBullish = formation?.bias === 'bullish';
  const isBearish = formation?.bias === 'bearish';

  return (
    <div
      className="fixed inset-0 z-[100] w-screen h-[100dvh] max-h-[100dvh] min-h-[100dvh] bg-[#090d16] flex flex-col overflow-hidden animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Повноекранний графік TradingView"
    >
      {/* Top Fullscreen Header & Controls */}
      <header className="h-12 sm:h-14 bg-slate-950/95 border-b border-slate-800 px-2.5 sm:px-4 flex items-center justify-between gap-2 shrink-0 z-20 overflow-x-auto no-scrollbar touch-scroll">
        {/* Left: Exit button, Watchlist Drawer Toggle, Symbol info, Price badge */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Quick Exit Fullscreen Button */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all cursor-pointer group shrink-0"
            title="Вийти з повного екрана (Esc)"
            aria-label="Вийти з повного екрана"
          >
            <Minimize2 className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span className="hidden md:inline font-sans">Вийти</span>
            <kbd className="hidden lg:inline-block px-1.5 py-0.2 rounded bg-slate-900 text-[10px] text-slate-400 font-mono border border-slate-800">
              Esc
            </kbd>
          </button>

          {/* Toggle Left Favorites Drawer Button (Шторка зліва) */}
          <button
            onClick={() => setIsFavoritesDrawerOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
              isFavoritesDrawerOpen
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-950/40'
                : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:text-white hover:border-slate-700'
            }`}
            title={isFavoritesDrawerOpen ? 'Сховати шторку обраних монет' : 'Відкрити шторку обраних монет'}
          >
            <Star className={`w-3.5 h-3.5 text-amber-400 ${localWatchlist.length > 0 ? 'fill-amber-400' : ''}`} />
            <span className="hidden xs:inline">Обрані монети</span>
            <span className="text-[10px] font-mono font-bold text-amber-300">
              {localWatchlist.length}
            </span>
          </button>

          {/* Symbol & Exchange Badges */}
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-extrabold text-white text-sm sm:text-base tracking-wide">
              {activeCoin.baseAsset}/{activeCoin.quoteAsset}
            </span>

            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                activeCoin.exchange === 'binance'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'bg-orange-500/15 text-orange-300 border border-orange-500/30'
              }`}
            >
              {activeCoin.exchange}
            </span>

            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-medium hidden xs:inline-block">
              {activeCoin.marketType === 'futures' ? 'Futures' : 'Spot'}
            </span>
          </div>

          {/* Real-time Price */}
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-mono font-bold shrink-0 ${
              isPositive
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                : 'bg-rose-950/60 text-rose-300 border-rose-800/60'
            }`}
          >
            <span>${formatCryptoPrice(displayPrice)}</span>
            <span className="text-[10px] hidden sm:inline">
              ({isPositive ? '+' : ''}{activeCoin.priceChange24h.toFixed(2)}%)
            </span>
          </div>

          {/* Formation Bias Badge (if present) */}
          {formation && activeCoin.symbol === coin.symbol && (
            <div
              className={`hidden xl:flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold uppercase border shrink-0 ${
                isBullish
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : isBearish
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              }`}
              title={formation.name}
            >
              <span>{formation.name}</span>
              <span>{isBullish ? '▲ LONG' : isBearish ? '▼ SHORT' : 'NEUTRAL'}</span>
            </div>
          )}
        </div>

        {/* Center: Mode Toggle, Timeframe Selector, Toolbar Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mode Switcher: TradingView Pro vs Pattern Geometry */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveMode('tradingview')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                activeMode === 'tradingview'
                  ? 'bg-cyan-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="TradingView Pro з усіма технічними індикаторами, лініями тренду та малюванням"
              aria-label="TradingView"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setActiveMode('pattern')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                activeMode === 'pattern'
                  ? 'bg-cyan-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Графік з розрахованими рівнями входу, TP/SL та живою сіткою патерну"
              aria-label="Аналіз патерну"
            >
              <BarChart2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Timeframe selector */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs font-mono">
            {(['1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => handleTimeframeSelect(tf)}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                  timeframe === tf
                    ? 'bg-cyan-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

        </div>

        {/* Right: Quick actions & Exit Button */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Telegram Alert shortcut */}
          {onOpenTelegramModal && (
            <button
              onClick={() =>
                onOpenTelegramModal({
                  symbol: activeCoin.symbol,
                  exchange: activeCoin.exchange,
                  marketType: activeCoin.marketType,
                  currentPrice: displayPrice,
                  targetPrice: formation?.levels.targetPrice,
                  formationName: formation?.name,
                })
              }
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              title="Створити сповіщення в Telegram"
            >
              <Send className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden xl:inline">Сповіщення</span>
            </button>
          )}

          {/* MetaScalp shortcut */}
          {onSendMetaScalp && (
            <button
              onClick={() => onSendMetaScalp(activeCoin)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              title={`Надіслати в MetaScalp (Група ${metaScalpBinding})`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
              <span className="hidden xl:inline">MetaScalp</span>
            </button>
          )}

          {/* Close Modal X Icon */}
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors cursor-pointer"
            title="Закрити повноцінний графік (Esc)"
            aria-label="Закрити повноцінний графік"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Sub-header: Pattern Levels Banner if formation is present */}
      {formation && activeCoin.symbol === coin.symbol && (
        <div className="h-8 sm:h-9 bg-slate-950/80 border-b border-slate-800/80 px-3 sm:px-4 flex items-center justify-between gap-2 text-[11px] font-mono shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-3 sm:gap-6 shrink-0">
            <span className="flex items-center gap-1 text-sky-300">
              <span className="w-2 h-2 rounded-full bg-sky-400"></span>
              Вхід: <strong>${formatCryptoPrice(formation.levels.entryPrice)}</strong>
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Ціль (TP): <strong>${formatCryptoPrice(formation.levels.targetPrice)}</strong> (+{formation.potentialProfitPct}%)
            </span>
            <span className="flex items-center gap-1 text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              Стоп (SL): <strong>${formatCryptoPrice(formation.levels.stopLossPrice)}</strong> (-{formation.potentialRiskPct}%)
            </span>
          </div>

          <div className="flex items-center gap-3 text-slate-400 text-[11px] shrink-0">
            <span>
              R:R <strong className="text-cyan-400 font-bold">1:{formation.riskRewardRatio}</strong>
            </span>
            <span>
              Впевненість: <strong className="text-cyan-400">{formation.confidence}%</strong>
            </span>
          </div>
        </div>
      )}

      {/* Fullscreen Chart Display Area (100% remaining viewport) */}
      <main className="flex-1 w-full h-full relative overflow-hidden bg-[#090d16]">
        {/* Collapsible Left Drawer (Шторка зліва з обраними монетами) */}
        <div
          className={`absolute top-0 bottom-0 left-0 z-30 w-72 sm:w-80 bg-slate-950/95 border-r border-slate-800 backdrop-blur-md flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
            isFavoritesDrawerOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
          }`}
        >
          {/* Drawer Header */}
          <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span className="font-bold text-xs sm:text-sm text-white">Обрані монети</span>
              <span className="text-[10px] font-mono font-bold text-amber-300">
                {localWatchlist.length}
              </span>
            </div>
            <button
              onClick={() => setIsFavoritesDrawerOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Сховати шторку"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search Input in Drawer */}
          <div className="p-2.5 border-b border-slate-800/80 bg-slate-950/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Пошук в обраному..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Coins List in Drawer */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 touch-scroll">
            {filteredFavorites.length === 0 ? (
              <div className="text-center py-10 px-4 text-slate-500 text-xs space-y-2">
                <Star className="w-6 h-6 text-slate-700 mx-auto" />
                <p className="font-semibold text-slate-400">Немає обраних монет</p>
                <p className="text-[11px] text-slate-600">
                  Натисніть на зірочку біля монет у таблиці чи картці формацій, щоб вони з'явились тут.
                </p>
              </div>
            ) : (
              filteredFavorites.map((favCoin, idx) => {
                const isSelected = favCoin.symbol === activeCoin.symbol;
                const isFavPositive = favCoin.priceChange24h >= 0;
                return (
                  <div
                    key={`${favCoin.exchange}-${favCoin.symbol}-${favCoin.marketType}-${idx}`}
                    onClick={() => handleSelectFavoriteCoin(favCoin)}
                    className={`group p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500/60 shadow-sm shadow-cyan-950/50'
                        : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-white truncate">
                          {favCoin.baseAsset}/{favCoin.quoteAsset}
                        </span>
                        {isSelected && (
                          <span className="flex h-1.5 w-1.5 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500"></span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] uppercase font-bold px-1 rounded bg-slate-800 text-slate-400">
                          {favCoin.exchange}
                        </span>
                        <span className="text-[9px] uppercase font-semibold px-1 rounded bg-slate-800/80 text-slate-500">
                          {favCoin.marketType === 'futures' ? 'Fut' : 'Spot'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        {favCoin.currentPrice > 0 && (
                          <div className="font-mono text-xs font-semibold text-slate-200">
                            ${formatCryptoPrice(favCoin.currentPrice)}
                          </div>
                        )}
                        <div
                          className={`text-[10px] font-mono font-semibold ${
                            isFavPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isFavPositive ? '+' : ''}
                          {favCoin.priceChange24h.toFixed(2)}%
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleRemoveFromWatchlist(favCoin.symbol, e)}
                        className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Видалити з обраного"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

       
        {/* Chart View */}
        {activeMode === 'tradingview' ? (
          <div className="w-full h-full relative overflow-hidden">
            {iframeLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-3 z-10 pointer-events-none">
                <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
                <span className="text-sm font-medium">Завантаження графіку {activeCoin.symbol}...</span>
              </div>
            )}
            <div
              className={`absolute top-0 h-full transition-[width,left] duration-200 ease-in-out ${
                showDrawingToolbar ? 'left-0 w-full' : '-left-[54px] w-[calc(100%+54px)]'
              }`}
            >
              <iframe
                key={tradingViewUrl}
                src={tradingViewUrl}
                className="h-full w-full border-0"
                title={`TradingView Chart ${activeCoin.symbol}`}
                onLoad={() => setIframeLoading(false)}
                allow="fullscreen"
                loading="lazy"
              />
            </div>
            <div
              className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-[54px] bg-transparent transition-transform duration-200 ${
                showDrawingToolbar ? '-translate-x-full' : 'translate-x-0'
              }`}
              aria-hidden={showDrawingToolbar}
            />
            <div className="absolute bottom-2 left-2 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleDrawingToolbar}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-300 transition-colors hover:bg-slate-800/60 hover:text-cyan-300"
                title={showDrawingToolbar ? 'Сховати панель TradingView' : 'Показати панель TradingView'}
                aria-label={showDrawingToolbar ? 'Сховати панель TradingView' : 'Показати панель TradingView'}
              >
                {showDrawingToolbar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col p-2 sm:p-4 overflow-hidden">
            <TradingViewChart
              klines={klines}
              formation={formation}
              symbol={activeCoin.symbol}
              timeframe={timeframe}
              exchange={activeCoin.exchange}
              marketType={activeCoin.marketType}
              historyLimit={1000}
              onAddToArchive={onAddToArchive}
              isArchived={isArchived}
              customMarkers={customMarkers}
              savedChartParams={savedChartParams}
            />
          </div>
        )}
      </main>
    </div>
  );
};
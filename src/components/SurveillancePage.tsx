import React, { useState, useEffect, useMemo } from 'react';
import {
  Radar,
  Eye,
  Plus,
  Trash2,
  Play,
  Pause,
  Settings2,
  ExternalLink,
  Search,
  RefreshCw,
  Bell,
  Clock,
  Target,
  Shield,
  Zap,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Check,
  X,
  Crosshair,
  BarChart3,
  Sliders,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Send,
  PieChart,
  History,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react';
import { useSurveillance } from '../context/SurveillanceContext';
import { getStoredPreferences, useAppPreferences } from '../utils/userPreferences';
import {
  SurveillanceCoin,
  SurveillanceConfig,
  SurveillanceEvent,
  ScannedCoin,
  ExchangeId,
  MarketType,
  Timeframe,
  TriggerModeType,
} from '../types';

interface SurveillancePageProps {
  availableCoins?: ScannedCoin[];
  onSelectCoinForChart?: (symbol: string, exchange: ExchangeId, marketType: MarketType) => void;
  onOpenTelegramSettings?: () => void;
  onNavigateToScreener?: () => void;
}

function formatPrice(val?: number): string {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toFixed(4);
  if (val >= 0.0001) return val.toFixed(6);
  return val.toFixed(8);
}

function formatNotionalUsd(val?: number): string {
  if (!val) return '$0';
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${Math.round(val)}`;
}

function formatTimeAgo(timestamp?: number): string {
  if (!timestamp) return 'щойно';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return `${Math.max(1, diffSec)} с тому`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} хв тому`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} год тому`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} д тому`;
}

const TRIGGER_MODE_OPTIONS: { id: TriggerModeType; label: string; desc: string }[] = [
  { id: 'bar_close', label: 'Закриття 4H', desc: 'За закриттям 4h свічки' },
  { id: 'bar_close_1h', label: 'Закриття 1H', desc: 'Свічка 1h закрилась за рівнем' },
  { id: 'bar_close_15m', label: 'Закриття 15m', desc: 'Свічка 15m закрилась за рівнем' },
  { id: 'realtime', label: 'Realtime (Миттєво)', desc: 'В момент перетину ціною' },
];

export const SurveillancePage: React.FC<SurveillancePageProps> = ({
  availableCoins = [],
  onSelectCoinForChart,
  onOpenTelegramSettings,
  onNavigateToScreener,
}) => {
  const {
    coins,
    allEvents,
    loading,
    activeCount,
    addCoinToSurveillance,
    removeCoinFromSurveillance,
    updateCoinConfig,
    toggleCoinActive,
    toggleAllCoinsActive,
    checkCoinNow,
    checkAllCoinsNow,
    getWorkerSnapshot,
    runBacktest,
    refresh,
  } = useSurveillance();

  const { preferences } = useAppPreferences();
  const prefs = getStoredPreferences();
  const defaultEx = prefs.defaultExchange === 'all' ? 'binance' : prefs.defaultExchange;
  const defaultMarket = prefs.defaultMarketType === 'all' ? 'futures' : prefs.defaultMarketType;

  const [searchQuery, setSearchQuery] = useState('');
  const [exchangeFilter, setExchangeFilter] = useState<'all' | ExchangeId>(prefs.defaultExchange);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCoin, setEditingCoin] = useState<SurveillanceCoin | null>(null);
  const [isCheckingMap, setIsCheckingMap] = useState<Record<string, boolean>>({});
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [notificationToast, setNotificationToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Recent surveillance events feed state
  const [isEventsExpanded, setIsEventsExpanded] = useState(true);
  const [eventsTypeFilter, setEventsTypeFilter] = useState<'all' | 'critical' | 'level' | 'structure' | 'density' | 'setup'>('all');
  const [eventsCoinFilter, setEventsCoinFilter] = useState<string>('all');
  const [eventsDisplayLimit, setEventsDisplayLimit] = useState(8);
  const [expandedCoinEventsMap, setExpandedCoinEventsMap] = useState<Record<string, boolean>>({});

  // Granular worker details & backtest modal state
  const [detailedCoin, setDetailedCoin] = useState<SurveillanceCoin | null>(null);
  const [workerData, setWorkerData] = useState<any | null>(null);
  const [loadingWorkerData, setLoadingWorkerData] = useState(false);
  const [backtestResult, setBacktestResult] = useState<any | null>(null);
  const [loadingBacktest, setLoadingBacktest] = useState(false);

  // Screener coins list for selection
  const screenerCoinsList = useMemo(() => {
    if (availableCoins && availableCoins.length > 0) {
      return availableCoins;
    }
    return [
      { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'binance' as ExchangeId, marketType: 'futures' as MarketType, currentPrice: 84300, priceChange24h: 1.2, volume24hUsd: 2500000000 },
      { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', exchange: 'binance' as ExchangeId, marketType: 'futures' as MarketType, currentPrice: 2050, priceChange24h: -0.8, volume24hUsd: 1200000000 },
      { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', exchange: 'binance' as ExchangeId, marketType: 'futures' as MarketType, currentPrice: 125, priceChange24h: 3.4, volume24hUsd: 800000000 },
      { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT', exchange: 'binance' as ExchangeId, marketType: 'futures' as MarketType, currentPrice: 0.165, priceChange24h: -2.1, volume24hUsd: 400000000 },
      { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', exchange: 'binance' as ExchangeId, marketType: 'futures' as MarketType, currentPrice: 1.45, priceChange24h: 0.5, volume24hUsd: 300000000 },
      { symbol: 'SUIUSDT', baseAsset: 'SUI', quoteAsset: 'USDT', exchange: 'binance' as ExchangeId, marketType: 'futures' as MarketType, currentPrice: 2.15, priceChange24h: 4.8, volume24hUsd: 250000000 },
    ] as ScannedCoin[];
  }, [availableCoins]);

  // New coin modal selection state
  const [selectedSymbolInput, setSelectedSymbolInput] = useState(screenerCoinsList[0]?.symbol || 'BTCUSDT');
  const [selectedExchange, setSelectedExchange] = useState<ExchangeId>(defaultEx);
  const [selectedMarketType, setSelectedMarketType] = useState<MarketType>(defaultMarket);

  // Config modal state (for add or edit)
  const [formConfig, setFormConfig] = useState<SurveillanceConfig>({
    timeframe: prefs.defaultTimeframe,
    triggerModes: ['bar_close', 'realtime'],
    triggerMode: 'bar_close',
    levelsEnabled: true,
    structureEnabled: true,
    momentumEnabled: true,
    momentumPct: 2.5,
    momentumBars: 3,
    momentumTf: '15m',
    channelEnabled: true,
    fibonacciEnabled: true,
    cooldownMinutes: 15,
    densityMode: 'AUTO',
    manualDensityThresholdUsd: 1000000,
    formationThreshold: 75,
    confluenceThreshold: 75,
    thirdTouchAlerts: true,
    densityAlerts: true,
    oiAlerts: true,
    newsAlerts: true,
    setupsEnabled: true,
    telegramEnabled: true,
  });

  const toggleTriggerMode = (mode: TriggerModeType) => {
    setFormConfig((prev) => {
      const current: TriggerModeType[] = Array.isArray(prev.triggerModes) && prev.triggerModes.length > 0
        ? (prev.triggerModes as TriggerModeType[])
        : (prev.triggerMode ? [prev.triggerMode as TriggerModeType] : ['bar_close']);
      let next: TriggerModeType[];
      if (current.includes(mode)) {
        if (current.length === 1) return prev;
        next = current.filter((m) => m !== mode);
      } else {
        next = [...current, mode];
      }
      return { ...prev, triggerModes: next, triggerMode: next[0] };
    });
  };

  const handleOpenAddModal = (prefillSymbol?: string) => {
    if (prefillSymbol) {
      setSelectedSymbolInput(prefillSymbol);
      const match = screenerCoinsList.find((c) => c.symbol === prefillSymbol);
      if (match) {
        setSelectedExchange(match.exchange);
        setSelectedMarketType(match.marketType);
      }
    }
    setFormConfig({
      timeframe: prefs.defaultTimeframe,
      triggerModes: ['bar_close', 'realtime'],
      triggerMode: 'bar_close',
      levelsEnabled: true,
      structureEnabled: true,
      momentumEnabled: true,
      momentumPct: 2.5,
      momentumBars: 3,
      momentumTf: '15m',
      channelEnabled: true,
      fibonacciEnabled: true,
      cooldownMinutes: 15,
      densityMode: 'AUTO',
      manualDensityThresholdUsd: 1000000,
      formationThreshold: 75,
      confluenceThreshold: 75,
      thirdTouchAlerts: true,
      densityAlerts: true,
      oiAlerts: true,
      newsAlerts: true,
      setupsEnabled: true,
      telegramEnabled: true,
    });
    setEditingCoin(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (coin: SurveillanceCoin) => {
    setEditingCoin(coin);
    setFormConfig({
      ...coin.config,
      triggerModes: Array.isArray(coin.config.triggerModes) && coin.config.triggerModes.length > 0
        ? coin.config.triggerModes
        : [coin.config.triggerMode || 'bar_close'],
      densityMode: coin.config.densityMode || 'AUTO',
      manualDensityThresholdUsd: coin.config.manualDensityThresholdUsd || 1000000,
      formationThreshold: coin.config.formationThreshold || 75,
      confluenceThreshold: coin.config.confluenceThreshold || 75,
      thirdTouchAlerts: coin.config.thirdTouchAlerts ?? true,
      densityAlerts: coin.config.densityAlerts ?? true,
      oiAlerts: coin.config.oiAlerts ?? true,
      newsAlerts: coin.config.newsAlerts ?? true,
      setupsEnabled: coin.config.setupsEnabled ?? true,
      telegramEnabled: coin.config.telegramEnabled ?? true,
    });
    setIsAddModalOpen(true);
  };

  const handleSaveCoin = async () => {
    if (editingCoin) {
      const ok = await updateCoinConfig(editingCoin.id, formConfig);
      if (ok) {
        setNotificationToast({ message: `Налаштування #${editingCoin.symbol} успішно оновлено`, type: 'success' });
        setIsAddModalOpen(false);
      } else {
        setNotificationToast({ message: 'Помилка оновлення налаштувань', type: 'error' });
      }
    } else {
      const res = await addCoinToSurveillance(
        selectedSymbolInput,
        selectedExchange,
        selectedMarketType,
        formConfig
      );
      if (res.success) {
        setNotificationToast({ message: `Монету #${selectedSymbolInput} взято на 24/7 системний нагляд!`, type: 'success' });
        setIsAddModalOpen(false);
      } else {
        setNotificationToast({ message: res.error || 'Не вдалося додати монету', type: 'error' });
      }
    }
    setTimeout(() => setNotificationToast(null), 3500);
  };

  const handleToggleActive = async (id: string, symbol: string, currentActive: boolean) => {
    const ok = await toggleCoinActive(id);
    if (ok) {
      setNotificationToast({
        message: currentActive ? `Нагляд за #${symbol} призупинено` : `24/7 Нагляд за #${symbol} активовано!`,
        type: currentActive ? 'info' : 'success',
      });
      setTimeout(() => setNotificationToast(null), 3000);
    }
  };

  const handleCheckCoin = async (id: string, symbol: string) => {
    setIsCheckingMap((prev) => ({ ...prev, [id]: true }));
    try {
      const updated = await checkCoinNow(id, true);
      if (updated) {
        setNotificationToast({ message: `Стан #${symbol} оновлено з біржі`, type: 'success' });
      }
    } finally {
      setIsCheckingMap((prev) => ({ ...prev, [id]: false }));
      setTimeout(() => setNotificationToast(null), 3000);
    }
  };

  const handleOpenDetails = async (coin: SurveillanceCoin) => {
    setDetailedCoin(coin);
    setWorkerData(null);
    setBacktestResult(null);
    setLoadingWorkerData(true);
    try {
      const snapshot = await getWorkerSnapshot(coin.id);
      setWorkerData(snapshot);
    } finally {
      setLoadingWorkerData(false);
    }
  };

  const handleRunCausalBacktest = async (coin: SurveillanceCoin) => {
    setLoadingBacktest(true);
    try {
      const res = await runBacktest(coin.symbol, coin.exchange, coin.marketType, '15m');
      setBacktestResult(res);
    } finally {
      setLoadingBacktest(false);
    }
  };

  const filteredCoins = useMemo(() => {
    return coins.filter((c) => {
      const matchSearch =
        c.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.baseAsset.toLowerCase().includes(searchQuery.toLowerCase());
      const matchExchange = exchangeFilter === 'all' || c.exchange === exchangeFilter;
      return matchSearch && matchExchange;
    });
  }, [coins, searchQuery, exchangeFilter]);

  // Aggregate and filter surveillance events across all tracked coins
  const eventCoinsList = useMemo(() => {
    const set = new Set<string>();
    for (const ev of allEvents) {
      if (ev.symbol) set.add(ev.symbol);
    }
    return Array.from(set);
  }, [allEvents]);

  const eventsCountMap = useMemo(() => {
    const critical = allEvents.filter((e) => e.severity === 'critical').length;
    const level = allEvents.filter((e) => e.type === 'level' || e.title.toLowerCase().includes('опор') || e.title.toLowerCase().includes('підтримк') || e.title.toLowerCase().includes('fib')).length;
    const structure = allEvents.filter((e) => e.type === 'structure' || e.title.toLowerCase().includes('структур') || e.title.toLowerCase().includes('bos') || e.title.toLowerCase().includes('choch')).length;
    const density = allEvents.filter((e) => e.title.toLowerCase().includes('щільніст') || e.title.toLowerCase().includes('стакан') || e.title.toLowerCase().includes('density')).length;
    const setup = allEvents.filter((e) => e.title.toLowerCase().includes('сетап') || e.title.toLowerCase().includes('touch') || e.title.toLowerCase().includes('retest')).length;
    return {
      all: allEvents.length,
      critical,
      level,
      structure,
      density,
      setup,
    };
  }, [allEvents]);

  const filteredEvents = useMemo(() => {
    return allEvents.filter((ev) => {
      if (eventsCoinFilter !== 'all' && ev.symbol !== eventsCoinFilter) {
        return false;
      }
      if (eventsTypeFilter === 'all') return true;
      if (eventsTypeFilter === 'critical') return ev.severity === 'critical';
      if (eventsTypeFilter === 'level') return ev.type === 'level' || ev.title.toLowerCase().includes('опор') || ev.title.toLowerCase().includes('підтримк') || ev.title.toLowerCase().includes('fib');
      if (eventsTypeFilter === 'structure') return ev.type === 'structure' || ev.title.toLowerCase().includes('структур') || ev.title.toLowerCase().includes('bos') || ev.title.toLowerCase().includes('choch');
      if (eventsTypeFilter === 'density') return ev.title.toLowerCase().includes('щільніст') || ev.title.toLowerCase().includes('стакан') || ev.title.toLowerCase().includes('density');
      if (eventsTypeFilter === 'setup') return ev.title.toLowerCase().includes('сетап') || ev.title.toLowerCase().includes('touch') || ev.title.toLowerCase().includes('retest');
      return true;
    });
  }, [allEvents, eventsCoinFilter, eventsTypeFilter]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {notificationToast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs font-bold animate-in fade-in slide-in-from-top-2 flex items-center gap-2 ${
            notificationToast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50 shadow-emerald-950/50'
              : notificationToast.type === 'error'
              ? 'bg-rose-950/90 text-rose-300 border-rose-500/50 shadow-rose-950/50'
              : 'bg-cyan-950/90 text-cyan-300 border-cyan-500/50 shadow-cyan-950/50'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-current animate-ping" />
          <span>{notificationToast.message}</span>
        </div>
      )}

      {/* Top Header & 24/7 Engine Status Bar (#90, #92) */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Radar className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black text-white tracking-tight">24/7 Моніторинг</h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE ENGINE
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Постійний фоновий моніторинг ринку на серверах Signalhook: Local Order Book, Multi-Timeframe структура, рівні, щільності та Telegram алерти
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleOpenAddModal()}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-lg shadow-cyan-950/50 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
            {onOpenTelegramSettings && (
              <button
                onClick={onOpenTelegramSettings}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-sky-400" />
              </button>
            )}
            <button
              onClick={() => refresh()}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
              title="Оновити дані"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-3 border-t border-slate-800/80 font-mono text-[11px]">
          <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <div>
              <div className="text-[9px] text-slate-500 uppercase">Стеження</div>
              <div className="font-bold text-cyan-300">{activeCount} МОНЕТ</div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: Останні події нагляду (Recent Surveillance Events Feed) */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 shadow-xl overflow-hidden">
        {/* Panel Header */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                  <span>Останні події нагляду</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {allEvents.length} {allEvents.length === 1 ? 'подія' : allEvents.length >= 2 && allEvents.length <= 4 ? 'події' : 'подій'}
                  </span>
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[10px] font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  LIVE СТРІЧКА 24/7
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Хронологічний лог тестів рівнів, щільностей стакану, пробоїв, змін структури та сигналів сетапів
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => refresh()}
              title="Оновити події"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsEventsExpanded((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>{isEventsExpanded ? 'Згорнути' : 'Розгорнути'}</span>
              {isEventsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Panel Content (Expandable) */}
        {isEventsExpanded && (
          <div className="p-4 space-y-4">
            {/* Filter Chips Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-1 border-b border-slate-800/60">
              {/* Category Filters */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                <button
                  onClick={() => setEventsTypeFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    eventsTypeFilter === 'all'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Всі ({eventsCountMap.all})
                </button>
                <button
                  onClick={() => setEventsTypeFilter('critical')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    eventsTypeFilter === 'critical'
                      ? 'bg-rose-500 text-white font-bold shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-rose-400 hover:text-rose-300'
                  }`}
                >
                  <AlertCircle className="w-3 h-3" />
                  <span>Критичні ({eventsCountMap.critical})</span>
                </button>
                <button
                  onClick={() => setEventsTypeFilter('level')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    eventsTypeFilter === 'level'
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300'
                  }`}
                >
                  <Target className="w-3 h-3" />
                  <span>Рівні ({eventsCountMap.level})</span>
                </button>
                <button
                  onClick={() => setEventsTypeFilter('structure')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    eventsTypeFilter === 'structure'
                      ? 'bg-indigo-500 text-white font-bold shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300'
                  }`}
                >
                  <Shield className="w-3 h-3" />
                  <span>Структура ({eventsCountMap.structure})</span>
                </button>
                <button
                  onClick={() => setEventsTypeFilter('density')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    eventsTypeFilter === 'density'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>Щільності ({eventsCountMap.density})</span>
                </button>
                <button
                  onClick={() => setEventsTypeFilter('setup')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    eventsTypeFilter === 'setup'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-amber-400 hover:text-amber-300'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Сетапи ({eventsCountMap.setup})</span>
                </button>
              </div>

              {/* Coin Filter Selector */}
              {eventCoinsList.length > 1 && (
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-slate-500 text-[11px]">Фільтр монети:</span>
                  <select
                    value={eventsCoinFilter}
                    onChange={(e) => setEventsCoinFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="all">Всі монети ({eventCoinsList.length})</option>
                    {eventCoinsList.map((sym) => (
                      <option key={sym} value={sym}>
                        #{sym}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Events List */}
            {filteredEvents.length === 0 ? (
              <div className="p-8 rounded-xl bg-slate-950/40 border border-slate-800/80 text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-slate-800/50 flex items-center justify-center mx-auto text-slate-400">
                  <Bell className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-slate-300">
                  {allEvents.length === 0
                    ? 'Подій нагляду поки що не зафіксовано'
                    : 'Немає подій за обраним фільтром'}
                </div>
                <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                  {allEvents.length === 0
                    ? '24/7 сервер аналізує стакан, рівні та структуру ринку. Щойно зʼявиться реакція на рівень, щільність або зміна тренду — сповіщення зʼявиться тут та надійде в Telegram.'
                    : 'Спробуйте обрати «Всі події» або інший фільтр категорій.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredEvents.slice(0, eventsDisplayLimit).map((ev) => {
                    const isCritical = ev.severity === 'critical';
                    const isWarning = ev.severity === 'warning';
                    const matchedCoin = coins.find((c) => c.id === ev.coinId || c.symbol === ev.symbol);

                    return (
                      <div
                        key={ev.id}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                          isCritical
                            ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/60 shadow-lg shadow-rose-950/20'
                            : isWarning
                            ? 'bg-amber-950/15 border-amber-500/30 hover:border-amber-500/50'
                            : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {/* Event Header */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded font-black font-mono text-xs bg-slate-800 text-white border border-slate-700">
                              #{ev.symbol}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase bg-slate-900 text-amber-300 border border-slate-800">
                              {ev.exchange} {ev.marketType}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase flex items-center gap-1 border ${
                                isCritical
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  : isWarning
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isCritical
                                    ? 'bg-rose-400 animate-ping'
                                    : isWarning
                                    ? 'bg-amber-400'
                                    : 'bg-cyan-400'
                                }`}
                              />
                              {isCritical ? 'Критично' : isWarning ? 'Увага' : 'Інфо'}
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span title={new Date(ev.timestamp).toLocaleString()}>
                              {formatTimeAgo(ev.timestamp)}
                            </span>
                          </div>
                        </div>

                        {/* Title and Description */}
                        <div className="space-y-1">
                          <div className="font-bold text-white text-xs leading-snug">
                            {ev.title}
                          </div>
                          {ev.description && (
                            <div className="text-[11px] text-slate-300 leading-relaxed font-mono">
                              {ev.description}
                            </div>
                          )}
                        </div>

                        {/* Footer info & quick actions */}
                        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2 text-[11px] font-mono">
                          <div className="flex items-center gap-2 text-slate-400">
                            <span>Ціна:</span>
                            <strong className="text-white">${formatPrice(ev.price)}</strong>
                            {ev.details?.timeframe && (
                              <span className="text-slate-500">• TF: {ev.details.timeframe}</span>
                            )}
                            {ev.details?.confluenceScore && (
                              <span className="text-emerald-400 font-bold">
                                • Conf: {ev.details.confluenceScore}/100
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {matchedCoin && (
                              <button
                                onClick={() => handleOpenDetails(matchedCoin)}
                                title="Відкрити стакан та аналітику монети"
                                className="px-2 py-0.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-[10px] font-semibold border border-cyan-500/20 cursor-pointer flex items-center gap-1"
                              >
                                <Layers className="w-3 h-3" />
                                <span>Стакан</span>
                              </button>
                            )}
                            {onSelectCoinForChart && (
                              <button
                                onClick={() => onSelectCoinForChart(ev.symbol, ev.exchange, ev.marketType)}
                                title="Відкрити графік"
                                className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold cursor-pointer flex items-center gap-1"
                              >
                                <BarChart3 className="w-3 h-3 text-cyan-400" />
                                <span>Графік</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Show more button */}
                {filteredEvents.length > eventsDisplayLimit && (
                  <div className="text-center pt-2">
                    <button
                      onClick={() => setEventsDisplayLimit((prev) => prev + 12)}
                      className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 cursor-pointer transition-colors"
                    >
                      Показати більше подій ({filteredEvents.length - eventsDisplayLimit} ще)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Пошук монети в нагляді..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <select
            value={exchangeFilter}
            onChange={(e) => setExchangeFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="all">Всі біржі</option>
            <option value="binance">Binance</option>
            <option value="bybit">Bybit</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span>Стеження: <strong className="text-white">{activeCount}</strong> активних</span>
          <span>•</span>
          <span>Всього: <strong className="text-white">{coins.length}</strong></span>
        </div>
      </div>

      {/* Monitored Coins Cards Grid (#91, #119) */}
      {filteredCoins.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center space-y-4 bg-slate-900/30">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto text-cyan-400">
            <Radar className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Список системного нагляду порожній</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Оберіть монети нижче та натисніть «Стежити». Сервер веде безперервний 24/7 моніторинг ринку через WebSockets навіть при вимкненому комп'ютері.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button
              onClick={() => handleOpenAddModal('BTCUSDT')}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-md cursor-pointer"
            >
              + Стежити за BTCUSDT (Binance Futures)
            </button>
            <button
              onClick={() => handleOpenAddModal('SOLUSDT')}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 cursor-pointer"
            >
              + Стежити за SOLUSDT (Bybit Linear)
            </button>
            <button
              onClick={() => handleOpenAddModal('ETHUSDT')}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 cursor-pointer"
            >
              + Стежити за ETHUSDT
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredCoins.map((coin) => {
            const state = coin.state;
            const isChecking = Boolean(isCheckingMap[coin.id]);

            return (
              <div
                key={coin.id}
                className={`rounded-2xl border transition-all overflow-hidden flex flex-col ${
                  coin.isActive
                    ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700 shadow-xl'
                    : 'bg-slate-950/60 border-slate-800/60 opacity-70'
                }`}
              >
                {/* Card Header */}
                <div className="p-4 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 flex items-center justify-center font-black font-mono text-cyan-300 text-sm">
                      {coin.baseAsset.slice(0, 3)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white text-base tracking-tight font-mono">
                          {coin.symbol}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                            coin.exchange === 'binance'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                          }`}
                        >
                          {coin.exchange} {coin.marketType}
                        </span>
                        {coin.isActive ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            24/7 LIVE
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono">
                            ПАУЗА
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 font-mono">
                        <span>Ціна:</span>
                        <strong className="text-white text-xs">
                          ${formatPrice(state?.currentPrice)}
                        </strong>
                        <span
                          className={`font-semibold ${
                            (state?.change24h || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {(state?.change24h || 0) >= 0 ? '+' : ''}
                          {state?.change24h || 0}%
                        </span>
                        {state?.spreadPct !== undefined && (
                          <span className="text-slate-500">
                            (Спред: {state.spreadPct.toFixed(3)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleCheckCoin(coin.id, coin.symbol)}
                      disabled={isChecking}
                      title="Оновити зараз"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-cyan-400' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleOpenEditModal(coin)}
                      title="Налаштування монети"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(coin.id, coin.symbol, coin.isActive)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                        coin.isActive
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                      }`}
                    >
                      {coin.isActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      <span>{coin.isActive ? 'Пауза' : 'Стежити'}</span>
                    </button>
                    <button
                      onClick={() => removeCoinFromSurveillance(coin.id)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Видалити"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card Content: Structure, Levels, Densities, Setups */}
                <div className="p-4 space-y-3.5 flex-1 text-xs">
                  {/* Active Setup Banner if any (#67, #76, #83) */}
                  {state?.activeSetupType ? (
                    <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-slate-950 border border-emerald-500/40 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          <span className="font-bold text-white uppercase tracking-wide">
                            {state.activeSetupType} — {state.activeSetupStage}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/40 text-[10px]">
                          Конфлюенс: {state.activeSetupConfluence || 80}/100
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300 font-mono flex items-center justify-between">
                        <span>Підтримка: ${formatPrice(state.support4h)}</span>
                        <span>Опір: ${formatPrice(state.resistance4h)}</span>
                      </div>
                    </div>
                  ) : null}

                  {/* S/R Range bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-emerald-400 font-semibold">
                        Підтримка: ${formatPrice(state?.support4h)}
                      </span>
                      <span className="text-slate-400">
                        {state?.rangePositionPct ?? 50}% в діапазоні
                      </span>
                      <span className="text-rose-400 font-semibold">
                        Опір: ${formatPrice(state?.resistance4h)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-rose-500 transition-all duration-300"
                        style={{ width: `${Math.max(2, Math.min(100, state?.rangePositionPct ?? 50))}%` }}
                      />
                    </div>
                  </div>

                  {/* 4 Pillars Grid: Density | Third Touch | Trade Flow | Open Interest */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                    {/* Order Book Density (#39, #45, #85) */}
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                      <div className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                        <Layers className="w-3 h-3 text-cyan-400" />
                        <span>Плотності</span>
                      </div>
                      <div className="font-bold text-white truncate">
                        {state?.topDensityUsd ? `${state.topDensitySide} ${formatNotionalUsd(state.topDensityUsd)}` : 'Пошук...'}
                      </div>
                      <div className="text-[10px] text-cyan-300 truncate">
                        {state?.densitiesCount ? `${state.densitiesCount} значних щільностей` : 'Normal depth'}
                      </div>
                    </div>

                    {/* Third Touch (#21, #22, #84) */}
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                      <div className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                        <Target className="w-3 h-3 text-amber-400" />
                        <span>Третій дотик</span>
                      </div>
                      <div className={`font-bold truncate ${state?.thirdTouchState === 'ACTIVE' ? 'text-amber-400' : 'text-slate-200'}`}>
                        {state?.thirdTouchState || 'Очікування'}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {state?.thirdTouchDistancePct !== undefined ? `Дистанція: ${state.thirdTouchDistancePct}%` : 'Відсутній'}
                      </div>
                    </div>

                    {/* Trade Flow (#50) */}
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                      <div className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                        <Zap className="w-3 h-3 text-emerald-400" />
                        <span>Торговельний потік (1m)</span>
                      </div>
                      <div className="font-bold text-slate-200 truncate">
                        {state?.tradeFlowImbalance ? `${state.tradeFlowImbalance}x Дисбаланс` : 'Баланс'}
                      </div>
                      <div className="text-[10px] text-emerald-400 truncate">
                        Buy: {formatNotionalUsd(state?.tradeFlowBuyUsd)}
                      </div>
                    </div>

                    {/* Open Interest (#53, #54, #86) */}
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                      <div className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                        <Activity className="w-3 h-3 text-indigo-400" />
                        <span>Відкритий інтерес</span>
                      </div>
                      <div className={`font-bold truncate ${state?.oiAnomaly ? 'text-rose-400 animate-pulse' : 'text-slate-200'}`}>
                        {state?.oiRegime ? state.oiRegime.replace(/_/g, ' ') : 'Neutral'}
                      </div>
                      <div className="text-[10px] text-indigo-300 truncate">
                        15m: {state?.oiChange15mPct !== undefined ? `${state.oiChange15mPct >= 0 ? '+' : ''}${state.oiChange15mPct}%` : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Multi-Timeframe Structure Badges (#11, #16) */}
                  <div className="flex flex-wrap items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] font-mono">
                    <span className="text-slate-500">Структура ринку:</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${state?.structureTrend === 'bullish' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : state?.structureTrend === 'bearish' ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-slate-800 text-slate-300'}`}>
                        Тренд: {state?.structureTrend?.toUpperCase() || 'RANGE'}
                      </span>
                      {state?.formationName && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800 font-bold">
                          {state.formationName} ({state.formationScore}/100)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Latest Surveillance Event & History for this coin */}
                  <div className="pt-2.5 border-t border-slate-800/60 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-400 flex items-center gap-1.5 font-bold">
                        <Activity className="w-3.5 h-3.5 text-amber-400" />
                        <span>Останні події нагляду</span>
                      </span>
                      {state?.recentEvents && state.recentEvents.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCoinEventsMap((prev) => ({
                              ...prev,
                              [coin.id]: !prev[coin.id],
                            }))
                          }
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer font-semibold"
                        >
                          <span>{expandedCoinEventsMap[coin.id] ? 'Згорнути' : `Історія (${state.recentEvents.length})`}</span>
                          {expandedCoinEventsMap[coin.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-500">Поки без подій</span>
                      )}
                    </div>

                    {/* Most recent event */}
                    {state?.lastEvent || (state?.recentEvents && state.recentEvents[0]) ? (
                      (() => {
                        const ev = state.lastEvent || state.recentEvents![0];
                        const isCritical = ev.severity === 'critical';
                        const isWarning = ev.severity === 'warning';

                        return (
                          <div
                            className={`p-2.5 rounded-xl border text-[11px] font-mono transition-all ${
                              isCritical
                                ? 'bg-rose-950/30 text-rose-300 border-rose-500/35'
                                : isWarning
                                ? 'bg-amber-950/25 text-amber-300 border-amber-500/30'
                                : 'bg-slate-950 text-slate-300 border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 pb-1 border-b border-white/5 text-[10px]">
                              <span className="font-bold flex items-center gap-1.5 truncate">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isCritical
                                      ? 'bg-rose-400 animate-ping'
                                      : isWarning
                                      ? 'bg-amber-400'
                                      : 'bg-cyan-400'
                                  }`}
                                />
                                <span className="truncate">{ev.title}</span>
                              </span>
                              <span className="text-slate-400 whitespace-nowrap ml-1">
                                {formatTimeAgo(ev.timestamp)}
                              </span>
                            </div>
                            {ev.description && (
                              <p className="text-[10px] text-slate-400 pt-1 leading-snug line-clamp-2">
                                {ev.description}
                              </p>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/60 text-[10px] text-slate-500 font-mono text-center">
                        24/7 Нагляд активний: очікування тесту рівнів, пробою або щільності
                      </div>
                    )}

                    {/* Expanded list of coin's recent events */}
                    {expandedCoinEventsMap[coin.id] && state?.recentEvents && state.recentEvents.length > 0 && (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pt-1 font-mono text-[10px]">
                        {state.recentEvents.slice(0, 6).map((e, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-2"
                          >
                            <div className="truncate flex-1">
                              <span
                                className={`font-semibold ${
                                  e.severity === 'critical'
                                    ? 'text-rose-400'
                                    : e.severity === 'warning'
                                    ? 'text-amber-400'
                                    : 'text-slate-300'
                                }`}
                              >
                                {e.title}
                              </span>
                            </div>
                            <span className="text-slate-500 whitespace-nowrap text-[9px]">
                              {formatTimeAgo(e.timestamp)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer: Detail Modal Button + Chart Link */}
                <div className="p-3 border-t border-slate-800/80 bg-slate-950/90 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>Оновлено: {state?.lastCalculated ? new Date(state.lastCalculated).toLocaleTimeString() : 'тільки що'}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenDetails(coin)}
                      className="px-3 py-1 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 font-semibold border border-cyan-500/30 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Layers className="w-3 h-3" />
                      <span>Стакан & Бектест</span>
                    </button>
                    {onSelectCoinForChart && (
                      <button
                        onClick={() => onSelectCoinForChart(coin.symbol, coin.exchange, coin.marketType)}
                        className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <BarChart3 className="w-3 h-3 text-cyan-400" />
                        <span>Графік</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Granular Worker Details & Causal Replay / Backtest (#103 - #105) */}
      {detailedCoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-4xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white font-mono flex items-center gap-2">
                    <span>#{detailedCoin.symbol}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-amber-300 uppercase font-mono">
                      {detailedCoin.exchange} {detailedCoin.marketType}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      24/7 LIVE STREAM
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Біржовий стакан, Торговельний потік, активні сетапи та каузальний бектест
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailedCoin(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5 overflow-y-auto flex-1 font-mono text-xs">
              {loadingWorkerData ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <RefreshCw className="w-8 h-8 animate-spin text-cyan-400 mx-auto" />
                  <p>Отримання живого стану з воркера...</p>
                </div>
              ) : workerData ? (
                <div className="space-y-5">
                  {/* Live Order Book Ladder (Bids & Asks) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-cyan-400" />
                        <span>Біржовий стакан</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        Спред: ${formatPrice(workerData.orderBookState?.spread)} ({workerData.orderBookState?.spreadPct}%)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                      {/* Bids */}
                      <div className="space-y-1">
                        <div className="text-[10px] text-emerald-400 font-bold uppercase pb-1 border-b border-slate-800 flex justify-between">
                          <span>BID PRICE</span>
                          <span>QTY (USD)</span>
                        </div>
                        {workerData.orderBookState?.bids?.slice(0, 7).map((b: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-[11px] py-0.5">
                            <span className="text-emerald-400 font-bold">${formatPrice(b.price)}</span>
                            <span className="text-slate-300">{formatNotionalUsd(b.notionalUsd)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Asks */}
                      <div className="space-y-1">
                        <div className="text-[10px] text-rose-400 font-bold uppercase pb-1 border-b border-slate-800 flex justify-between">
                          <span>ASK PRICE</span>
                          <span>QTY (USD)</span>
                        </div>
                        {workerData.orderBookState?.asks?.slice(0, 7).map((a: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-[11px] py-0.5">
                            <span className="text-rose-400 font-bold">${formatPrice(a.price)}</span>
                            <span className="text-slate-300">{formatNotionalUsd(a.notionalUsd)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Significant Densities Detected */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-amber-400" />
                      <span>Виявлені великі плотності</span>
                    </div>

                    {workerData.densities?.length === 0 ? (
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 text-center">
                        Немає щільностей вище адаптивного порогу в поточному стакані
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {workerData.densities?.slice(0, 4).map((d: any) => (
                          <div key={d.id} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={`font-bold ${d.side === 'BID' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {d.side} ${formatPrice(d.price)}
                                </span>
                                <span className="text-[9px] px-1 rounded bg-slate-800 text-cyan-300">
                                  {d.classification}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Дистанція: {d.distancePct}% • Тривалість: {d.ageSeconds}с
                              </div>
                            </div>
                            <div className="font-extrabold text-white text-xs">
                              {formatNotionalUsd(d.notionalUsd)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Causal Backtest & Replay Runner (#103, #104, #105) */}
                  <div className="p-4 rounded-xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-indigo-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white text-xs flex items-center gap-1.5">
                          <History className="w-4 h-4 text-indigo-400" />
                          <span>Каузальний бектест сетапів (Replay Mode без заглядання вперед)</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Перевірка якості: Повторне тестування рівня підтримки алгоритму на історичних свічках 15m
                        </p>
                      </div>

                      <button
                        onClick={() => handleRunCausalBacktest(detailedCoin)}
                        disabled={loadingBacktest}
                        className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                      >
                        <PlayCircle className={`w-4 h-4 ${loadingBacktest ? 'animate-spin' : ''}`} />
                        <span>{loadingBacktest ? 'Аналіз...' : 'Запустити бектест'}</span>
                      </button>
                    </div>

                    {backtestResult && (
                      <div className="pt-2 border-t border-slate-800 space-y-2">
                        <div className="grid grid-cols-4 gap-2 text-center text-xs">
                          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Всього сетапів</span>
                            <span className="font-bold text-white">{backtestResult.totalSetups}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Вінрейт</span>
                            <span className="font-bold text-emerald-400">{backtestResult.winRate}%</span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Медіана MFE</span>
                            <span className="font-bold text-cyan-300">+{backtestResult.medianMfePct}%</span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Медіана MAE</span>
                            <span className="font-bold text-rose-400">-{backtestResult.medianMaePct}%</span>
                          </div>
                        </div>

                        {/* Recent Backtest setups */}
                        <div className="max-h-36 overflow-y-auto space-y-1">
                          {backtestResult.results?.slice(-5).map((r: any, idx: number) => (
                            <div key={idx} className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-[11px]">
                              <div>
                                <span className={r.success ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                  {r.success ? '✓ Успішний рух' : '✗ Просадка'}
                                </span>
                                <span className="text-slate-400 ml-2">Тригер: ${formatPrice(r.triggerPrice)}</span>
                              </div>
                              <div className="space-y-0.5 text-right">
                                <span className="text-cyan-300">MFE: +{r.mfePct}%</span>
                                <span className="text-slate-500 ml-2">1h: {r.future1hPct}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add / Edit Coin Configuration Modal (#93 - #97) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {editingCoin ? `Налаштування #${editingCoin.symbol}` : 'Додати монету на 24/7 системний нагляд'}
                  </h3>
                  <p className="text-[11px] text-slate-400">Параметри Стакана, важливих рівнів, щільностей та Сповіщень</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 font-mono text-xs">
              {!editingCoin && (
                <>
                  {/* Exchange and Market selectors */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400">Біржа</label>
                      <select
                        value={selectedExchange}
                        onChange={(e) => setSelectedExchange(e.target.value as ExchangeId)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                      >
                        <option value="binance">Binance</option>
                        <option value="bybit">Bybit</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400">Ринок</label>
                      <select
                        value={selectedMarketType}
                        onChange={(e) => setSelectedMarketType(e.target.value as MarketType)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                      >
                        <option value="futures">Futures / Linear</option>
                        <option value="spot">Spot</option>
                      </select>
                    </div>
                  </div>

                  {/* Coin Input / Select */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">Символ (Тікер)</label>
                    <input
                      type="text"
                      value={selectedSymbolInput}
                      onChange={(e) => setSelectedSymbolInput(e.target.value.toUpperCase().trim())}
                      placeholder="BTCUSDT, ETHUSDT, SOLUSDT..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white font-bold placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </>
              )}

              {/* Breakout Confirmation Modes (Multi-select) (#94) */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Режими підтвердження пробою</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {TRIGGER_MODE_OPTIONS.map((m) => {
                    const isSelected = formConfig.triggerModes?.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleTriggerMode(m.id)}
                        className={`p-2 rounded-xl text-left transition-all border cursor-pointer flex items-center gap-2 ${
                          isSelected
                            ? 'bg-cyan-500/20 border-cyan-400 text-white font-semibold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] border ${isSelected ? 'bg-cyan-500 border-cyan-400 text-slate-950 font-bold' : 'border-slate-700 bg-slate-950'}`}>
                          {isSelected ? '✓' : ''}
                        </span>
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Density Engine Settings (#95) */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Виявлення великих плотностів</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(['AUTO', 'MANUAL', 'HYBRID'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFormConfig((prev) => ({ ...prev, densityMode: mode }))}
                      className={`py-1.5 px-2 rounded-lg text-center font-bold transition-all border cursor-pointer ${
                        formConfig.densityMode === mode
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                {formConfig.densityMode !== 'AUTO' && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400">Ручний поріг плотності ($ USDT)</label>
                    <input
                      type="number"
                      step="100000"
                      min="50000"
                      value={formConfig.manualDensityThresholdUsd}
                      onChange={(e) => setFormConfig((prev) => ({ ...prev, manualDensityThresholdUsd: Number(e.target.value) }))}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white font-mono text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Setup Detection Toggles (#96, #97) */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Підтвердження</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={formConfig.levelsEnabled}
                      onChange={(e) => setFormConfig((p) => ({ ...p, levelsEnabled: e.target.checked }))}
                      className="rounded text-cyan-500"
                    />
                    <span>Підтримка / Повторне тестування рівня опору</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={formConfig.structureEnabled}
                      onChange={(e) => setFormConfig((p) => ({ ...p, structureEnabled: e.target.checked }))}
                      className="rounded text-cyan-500"
                    />
                    <span>Зміна структури (BOS / CHoCH)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={formConfig.channelEnabled}
                      onChange={(e) => setFormConfig((p) => ({ ...p, channelEnabled: e.target.checked }))}
                      className="rounded text-cyan-500"
                    />
                    <span>Канал / Повторне тестування рівня пробою</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={formConfig.thirdTouchAlerts}
                      onChange={(e) => setFormConfig((p) => ({ ...p, thirdTouchAlerts: e.target.checked }))}
                      className="rounded text-cyan-500"
                    />
                    <span>Третій дотик</span>
                  </label>
                </div>
              </div>

              {/* Telegram Notification Toggles */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-sky-400" />
                    <span>Telegram Сповіщення</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formConfig.telegramEnabled}
                    onChange={(e) => setFormConfig((p) => ({ ...p, telegramEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded text-sky-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                  <span>Cooldown: {formConfig.cooldownMinutes || 15} хв між алерти</span>
                  <span>Confluence поріг: {formConfig.confluenceThreshold || 75}/100</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleSaveCoin}
                className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-lg transition-all"
              >
                {editingCoin ? 'Зберегти зміни' : 'Стежити 24/7'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

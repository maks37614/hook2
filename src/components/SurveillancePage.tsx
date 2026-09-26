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

const TRIGGER_MODE_OPTIONS: { id: TriggerModeType; label: string; desc: string }[] = [
  { id: 'bar_close', label: 'Закриття бару 4H', desc: 'Один раз за закриттям 4h свічки' },
  { id: 'bar_close_1h', label: 'Закриття бару 1H', desc: 'Свічка 1h закрилась за рівнем' },
  { id: 'bar_close_15m', label: 'Закриття бару 15m', desc: 'Свічка 15m закрилась за рівнем' },
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
    loading,
    activeCount,
    addCoinToSurveillance,
    removeCoinFromSurveillance,
    updateCoinConfig,
    toggleCoinActive,
    checkCoinNow,
    checkAllCoinsNow,
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
    triggerModes: ['bar_close'],
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
  });

  const toggleTriggerMode = (mode: TriggerModeType) => {
    setFormConfig((prev) => {
      const current: TriggerModeType[] = Array.isArray(prev.triggerModes) && prev.triggerModes.length > 0
        ? (prev.triggerModes as TriggerModeType[])
        : (prev.triggerMode ? [prev.triggerMode as TriggerModeType] : ['bar_close']);
      let next: TriggerModeType[];
      if (current.includes(mode)) {
        if (current.length === 1) return prev; // keep at least 1 selected
        next = current.filter((m) => m !== mode);
      } else {
        next = [...current, mode];
      }
      return { ...prev, triggerModes: next, triggerMode: next[0] };
    });
  };

  useEffect(() => {
    setExchangeFilter(preferences.defaultExchange);
    const ex = preferences.defaultExchange === 'all' ? 'binance' : preferences.defaultExchange;
    const m = preferences.defaultMarketType === 'all' ? 'futures' : preferences.defaultMarketType;
    setSelectedExchange(ex);
    setSelectedMarketType(m);
    setFormConfig((prev) => ({ ...prev, timeframe: preferences.defaultTimeframe }));
  }, [preferences]);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotificationToast({ message, type });
    setTimeout(() => setNotificationToast(null), 4000);
  };

  // Filtered coins in list
  const filteredCoins = useMemo(() => {
    return coins.filter((coin) => {
      const matchSearch =
        !searchQuery ||
        coin.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        coin.baseAsset.toLowerCase().includes(searchQuery.toLowerCase());
      const matchExchange = exchangeFilter === 'all' || coin.exchange === exchangeFilter;
      return matchSearch && matchExchange;
    });
  }, [coins, searchQuery, exchangeFilter]);

  const handleOpenAddModal = (initialSymbol?: string) => {
    const target = initialSymbol
      ? screenerCoinsList.find((c) => c.symbol === initialSymbol) || screenerCoinsList[0]
      : screenerCoinsList[0];

    if (target) {
      setSelectedSymbolInput(target.symbol);
      setSelectedExchange(target.exchange);
      setSelectedMarketType(target.marketType);
    } else {
      setSelectedSymbolInput(initialSymbol || 'BTCUSDT');
    }

    setFormConfig({
      timeframe: '4h',
      triggerModes: ['bar_close'],
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
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (coin: SurveillanceCoin) => {
    setEditingCoin(coin);
    const modes: TriggerModeType[] = Array.isArray(coin.config.triggerModes) && coin.config.triggerModes.length > 0
      ? (coin.config.triggerModes as TriggerModeType[])
      : (coin.config.triggerMode ? [coin.config.triggerMode as TriggerModeType] : ['bar_close']);
    setFormConfig({ ...coin.config, triggerModes: modes, triggerMode: modes[0] });
  };

  const handleSaveAddCoin = async () => {
    const symbolToUse = selectedSymbolInput.trim().toUpperCase() || (screenerCoinsList[0]?.symbol ?? 'BTCUSDT');
    if (!symbolToUse) {
      showToast('Будь ласка, оберіть монету зі списку Скрінера', 'error');
      return;
    }

    const modes: TriggerModeType[] = Array.isArray(formConfig.triggerModes) && formConfig.triggerModes.length > 0
      ? (formConfig.triggerModes as TriggerModeType[])
      : ['bar_close'];

    const configToSave: SurveillanceConfig = {
      ...formConfig,
      triggerModes: modes,
      triggerMode: modes[0],
    };

    const res = await addCoinToSurveillance(symbolToUse, selectedExchange, selectedMarketType, configToSave);
    if (res.success && res.coin) {
      checkCoinNow(res.coin.id, true);
      showToast(`Монету #${symbolToUse} успішно додано на системний нагляд!`, 'success');
      setIsAddModalOpen(false);
    } else {
      showToast(res.error || 'Не вдалося додати монету', 'error');
    }
  };

  const handleSaveEditConfig = async () => {
    if (!editingCoin) return;
    const modes: TriggerModeType[] = Array.isArray(formConfig.triggerModes) && formConfig.triggerModes.length > 0
      ? (formConfig.triggerModes as TriggerModeType[])
      : ['bar_close'];

    const configToSave: SurveillanceConfig = {
      ...editingCoin.config,
      ...formConfig,
      triggerModes: modes,
      triggerMode: modes[0],
    };

    const ok = await updateCoinConfig(editingCoin.id, configToSave);
    if (ok) {
      showToast(`Налаштування для #${editingCoin.symbol} успішно збережено!`, 'success');
      setEditingCoin(null);
      // Run quick check to recalculate state with new thresholds
      checkCoinNow(editingCoin.id, false);
    } else {
      showToast('Помилка збереження налаштувань', 'error');
    }
  };

  const handleCheckCoin = async (id: string, symbol: string) => {
    setIsCheckingMap((prev) => ({ ...prev, [id]: true }));
    try {
      const updated = await checkCoinNow(id, true);
      if (updated) {
        showToast(`Аналіз #${symbol} оновлено з біржі`, 'info');
      }
    } finally {
      setIsCheckingMap((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Run full system scan / overview on all monitored coins
  const handleRunAllSurveillance = async () => {
    if (coins.length === 0) {
      showToast('Список нагляду порожній. Додайте монету зі скрінера', 'info');
      return;
    }

    setIsRunningAll(true);
    try {
      const ok = await checkAllCoinsNow();
      if (ok) {
        showToast(`Запуск системного огляду виконано для ${coins.length} монет!`, 'success');
      } else {
        showToast('Не вдалося оновити системний нагляд', 'error');
      }
    } catch {
      showToast('Помилка під час запуску системного огляду', 'error');
    } finally {
      setIsRunningAll(false);
    }
  };

  return (
    <div className="max-w-[1720px] mx-auto px-2.5 sm:px-4 lg:px-6 py-4 space-y-5">
      {/* Toast */}
      {notificationToast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 ${
            notificationToast.type === 'error'
              ? 'bg-rose-950/90 border-rose-700 text-rose-200'
              : notificationToast.type === 'info'
              ? 'bg-sky-950/90 border-sky-700 text-sky-200'
              : 'bg-emerald-950/90 border-emerald-700 text-emerald-200'
          }`}
        >
          <Radar className="w-4 h-4 shrink-0 text-cyan-400 animate-spin" />
          <span>{notificationToast.message}</span>
        </div>
      )}

      {/* Hero Header */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 p-4 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
              <Radar className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>Нагляд за монетами</span>
            </div>

            <p className="text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed">
              Серверний нагляд за алгоритмом: <strong>структура 4H/1D → рівні → імпульс % → ризик</strong>.
              Відстежує пробої 6 типів, мульти-режими закриття свічок (4H / 1H / 15m / Realtime), реакцію на Fibonacci 0.618 Golden Pocket та миттєво інформує у ваш Telegram.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Run All Surveillance Button */}
            <button
              onClick={handleRunAllSurveillance}
              disabled={isRunningAll || coins.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50"
              title="Запустити негайний аналіз усіх монет на нагляді"
            >
              <Play className={`w-4 h-4 fill-current ${isRunningAll ? 'animate-spin' : ''}`} />
            
            </button>

            {/* Add Coin Button */}
            <button
              onClick={() => handleOpenAddModal()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-cyan-950/40 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>

            <button
              onClick={() => refresh()}
              title="Оновити дані"
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer border border-slate-700"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 mt-5 pt-4 border-t border-slate-800/80">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              <span>Всього</span>
            </div>
            <div className="text-lg font-bold font-mono text-white mt-0.5">{coins.length}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              <span>Активні</span>
            </div>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">{activeCount}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Режими підтвердження</span>
            </div>
            <div className="text-xs font-bold text-indigo-300 mt-1">Мульти-вибір (4H • 1H • 15m • Realtime)</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-sky-400" />
              <span>Канал сповіщень</span>
            </div>
            <div className="text-xs font-bold text-sky-300 mt-1 flex items-center gap-1">
              <span>Telegram Бот</span>
              <button
                onClick={onOpenTelegramSettings}
                className="text-[10px] text-cyan-400 underline hover:text-cyan-300 ml-1 cursor-pointer"
              >
                (Налаштування)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Control / Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Пошук монети у списку стеження..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-center p-1 rounded-lg bg-slate-950 border border-slate-800 text-xs">
            <button
              onClick={() => setExchangeFilter('all')}
              className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                exchangeFilter === 'all' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Всі
            </button>
            <button
              onClick={() => setExchangeFilter('binance')}
              className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                exchangeFilter === 'binance' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              Binance
            </button>
            <button
              onClick={() => setExchangeFilter('bybit')}
              className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                exchangeFilter === 'bybit' ? 'bg-orange-500/20 text-orange-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              Bybit
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Знайдено: <strong className="text-white">{filteredCoins.length}</strong> з {coins.length} монет
        </div>
      </div>

      {/* Surveillance Coins Cards Grid */}
      {filteredCoins.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center space-y-4 bg-slate-900/30">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto text-cyan-400">
            <Radar className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Список системного нагляду порожній</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Оберіть монети зі сторінки Скрінер або додайте їх через меню вибору нижче. Сервер веде постійне 24/7 технічне спостереження за рівнями та структурою.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {onNavigateToScreener && (
              <button
                onClick={onNavigateToScreener}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-md shadow-cyan-950/40 cursor-pointer flex items-center gap-1.5"
              >
                <span>Відкрити Скрінер монет</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => handleOpenAddModal('BTCUSDT')}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 cursor-pointer"
            >
              + Стежити за BTCUSDT
            </button>
            <button
              onClick={() => handleOpenAddModal('ETHUSDT')}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 cursor-pointer"
            >
              + Стежити за ETHUSDT
            </button>
            <button
              onClick={() => handleOpenAddModal('SOLUSDT')}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 cursor-pointer"
            >
              + Стежити за SOLUSDT
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredCoins.map((coin) => {
            const state = coin.state;
            const isChecking = Boolean(isCheckingMap[coin.id]);
            const isBullish = state?.structureTrend === 'bullish';
            const isBearish = state?.structureTrend === 'bearish';

            const activeModes = Array.isArray(coin.config.triggerModes) && coin.config.triggerModes.length > 0
              ? coin.config.triggerModes
              : (coin.config.triggerMode ? [coin.config.triggerMode] : ['bar_close']);

            return (
              <div
                key={coin.id}
                className={`rounded-2xl border transition-all overflow-hidden flex flex-col ${
                  coin.isActive
                    ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700 shadow-lg'
                    : 'bg-slate-950/60 border-slate-800/60 opacity-70'
                }`}
              >
                {/* Card Top Header */}
                <div className="p-4 border-b border-slate-800/80 bg-slate-950/50 flex items-center justify-between gap-3">
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
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                          {coin.config.timeframe}
                        </span>
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
                      </div>
                    </div>
                  </div>

                  {/* Top Right Controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleCheckCoin(coin.id, coin.symbol)}
                      disabled={isChecking}
                      title="Перевірити стан та оновити рівні з біржі"
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-cyan-400' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleOpenEditModal(coin)}
                      title="Налаштувати параметри спостереження"
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toggleCoinActive(coin.id)}
                      title={coin.isActive ? 'Призупинити нагляд' : 'Увімкнути нагляд'}
                      className={`p-2 rounded-lg transition-colors cursor-pointer ${
                        coin.isActive
                          ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                      }`}
                    >
                      {coin.isActive ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => removeCoinFromSurveillance(coin.id)}
                      title="Видалити зі стеження"
                      className="p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Main Technical State Card Body */}
                <div className="p-4 space-y-4 flex-1">
                  {/* Scheme of 6 Alerts: Visual Range Level Indicator */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <div className="flex items-center gap-1 text-emerald-400 font-semibold">
                        <Shield className="w-3.5 h-3.5" />
                        <span>Підтримка 4H: ${formatPrice(state?.support4h)}</span>
                      </div>
                      <div className="text-slate-400">
                        Позиція: <strong className="text-white font-bold">{state?.rangePositionPct ?? 50}%</strong>
                      </div>
                      <div className="flex items-center gap-1 text-rose-400 font-semibold">
                        <Target className="w-3.5 h-3.5" />
                        <span>Опір 4H: ${formatPrice(state?.resistance4h)}</span>
                      </div>
                    </div>

                    {/* Progress Bar of Range */}
                    <div className="relative h-2.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-rose-500 transition-all duration-500"
                        style={{ width: `${Math.max(3, Math.min(100, state?.rangePositionPct ?? 50))}%` }}
                      />
                    </div>
                  </div>

                  {/* 4 Multi-Timeframe Pillars: Structure -> Levels -> Momentum -> Risk */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {/* 1. Structure */}
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                        <Activity className="w-3 h-3 text-indigo-400" />
                        <span>Структура</span>
                      </div>
                      <div className="font-bold text-white flex items-center gap-1">
                        {isBullish ? (
                          <span className="text-emerald-400 flex items-center gap-0.5">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>BULLISH</span>
                          </span>
                        ) : isBearish ? (
                          <span className="text-rose-400 flex items-center gap-0.5">
                            <TrendingDown className="w-3.5 h-3.5" />
                            <span>BEARISH</span>
                          </span>
                        ) : (
                          <span className="text-amber-400">RANGING</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {state?.structureTrend || '4H Trend'}
                      </div>
                    </div>

                    {/* 2. Senior Levels */}
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                        <Target className="w-3 h-3 text-cyan-400" />
                        <span>Рівні 4H/1D</span>
                      </div>
                      <div className="font-mono font-bold text-white text-[11px] truncate">
                        ${formatPrice(state?.resistance4h)}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        Supp: ${formatPrice(state?.support4h)}
                      </div>
                    </div>

                    {/* 3. Momentum */}
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span>Імпульс</span>
                      </div>
                      <div
                        className={`font-mono font-bold text-[11px] ${
                          (state?.momentumRecentPct || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {(state?.momentumRecentPct || 0) >= 0 ? '+' : ''}
                        {state?.momentumRecentPct || 0}%
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {coin.config.momentumBars}b ({coin.config.momentumTf})
                      </div>
                    </div>

                    {/* 4. Fibonacci 0.618 */}
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                        <Layers className="w-3 h-3 text-violet-400" />
                        <span>Fibo 0.618</span>
                      </div>
                      <div className="font-mono font-bold text-violet-300 text-[11px]">
                        ${formatPrice(state?.fib618)}
                      </div>
                      <div className="text-[10px] text-slate-400">Golden Pocket</div>
                    </div>
                  </div>

                  {/* Target and Invalidation Levels */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono">
                    <div className="flex items-center gap-1.5 text-cyan-300">
                      <Target className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Ціль (Next Zone Up):</span>
                      <strong className="text-white">${formatPrice(state?.nextZoneUp)}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 text-rose-300">
                      <Shield className="w-3.5 h-3.5 text-rose-400" />
                      <span>Скасування (Next Zone Down):</span>
                      <strong className="text-white">${formatPrice(state?.nextZoneDown)}</strong>
                    </div>
                  </div>

                  {/* Recent Triggered Events / Live Stream */}
                  {state?.recentEvents && state.recentEvents.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 text-amber-400" />
                        <span>Останні події нагляду</span>
                      </div>
                      <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                        {state.recentEvents.slice(0, 3).map((ev) => (
                          <div
                            key={ev.id}
                            className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 flex items-start justify-between gap-2 text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="font-bold text-white text-[11px]">{ev.title}</div>
                              <div className="text-[10px] text-slate-400">{ev.description}</div>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">
                              {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="p-3 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between text-xs">
                  {/* Multi-Trigger Mode Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                    <span className="text-slate-500">Режими:</span>
                    {activeModes.map((m) => {
                      const label =
                        m === 'bar_close'
                          ? '4H'
                          : m === 'bar_close_1h'
                          ? '1H'
                          : m === 'bar_close_15m'
                          ? '15m'
                          : 'Realtime';
                      return (
                        <span
                          key={m}
                          className="px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-800/80 text-cyan-300 font-bold"
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    {onSelectCoinForChart && (
                      <button
                        onClick={() => onSelectCoinForChart(coin.symbol, coin.exchange, coin.marketType)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <BarChart3 className="w-3 h-3" />
                        <span>Графік</span>
                      </button>
                    )}
                    <a
                      href={
                        coin.exchange === 'binance'
                          ? `https://www.binance.com/uk-UA/trade/${coin.baseAsset}_${coin.quoteAsset}`
                          : `https://www.bybit.com/trade/usdt/${coin.symbol}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>Біржа</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Add New Coin to Surveillance */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Radar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Додати монету на системний нагляд</h3>
                  <p className="text-[11px] text-slate-400">Автоматичний розрахунок 4H/1D рівнів та сповіщення в Telegram</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Screener Coins Direct Selection (No search input required) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Виберіть монету зі сторінки Скрінер:</span>
                  </label>
                  {onNavigateToScreener && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddModalOpen(false);
                        onNavigateToScreener();
                      }}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 underline cursor-pointer"
                    >
                      <span>Відкрити Скрінер →</span>
                    </button>
                  )}
                </div>

                {/* Coins Grid from Screener */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto p-1 rounded-xl bg-slate-950 border border-slate-800">
                  {screenerCoinsList.map((c) => {
                    const isSelected = selectedSymbolInput === c.symbol;
                    return (
                      <button
                        key={`${c.exchange}-${c.symbol}-${c.marketType}`}
                        type="button"
                        onClick={() => {
                          setSelectedSymbolInput(c.symbol);
                          setSelectedExchange(c.exchange);
                          setSelectedMarketType(c.marketType);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-cyan-500/20 border-cyan-400 shadow-md shadow-cyan-950/40 ring-1 ring-cyan-400'
                            : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono font-extrabold text-white text-xs">{c.symbol}</span>
                          {isSelected ? (
                            <span className="w-3.5 h-3.5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center text-[10px] font-bold">
                              ✓
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-1 text-[10px] font-mono">
                          <span className="text-slate-400">
                            ${c.currentPrice >= 1 ? c.currentPrice.toLocaleString() : c.currentPrice}
                          </span>
                          <span className={c.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {c.priceChange24h >= 0 ? '+' : ''}{c.priceChange24h.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[9px] text-slate-500 uppercase font-mono">
                          <span>{c.exchange}</span>
                          <span>•</span>
                          <span>{c.marketType}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Coin Details Banner */}
              <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-800/40 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-cyan-400 uppercase font-bold tracking-wider">Обрана монета</div>
                  <div className="text-sm font-extrabold font-mono text-white mt-0.5">{selectedSymbolInput}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-mono uppercase font-bold border border-slate-700">
                    {selectedExchange}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono uppercase border border-slate-700">
                    {selectedMarketType}
                  </span>
                </div>
              </div>

              {/* Exchange and Market Type Selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Біржа</label>
                  <select
                    value={selectedExchange}
                    onChange={(e) => setSelectedExchange(e.target.value as ExchangeId)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-500"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="futures">Ф'ючерси (Futures)</option>
                    <option value="spot">Спот (Spot)</option>
                  </select>
                </div>
              </div>

              {/* Trigger Confirmation Modes (Multi-select) */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Режими підтвердження пробою (можна кілька)</span>
                  </label>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono font-bold">
                    МУЛЬТИ-ВИБІР ({formConfig.triggerModes?.length || 1})
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {TRIGGER_MODE_OPTIONS.map((m) => {
                    const isSelected = formConfig.triggerModes?.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleTriggerMode(m.id)}
                        className={`p-2.5 rounded-xl text-left text-xs transition-all border cursor-pointer flex items-start justify-between gap-2 ${
                          isSelected
                            ? 'bg-cyan-500/20 border-cyan-400 text-white font-semibold shadow-sm shadow-cyan-950/30'
                            : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="font-bold flex items-center gap-1.5">
                            <span
                              className={`w-4 h-4 rounded-md flex items-center justify-center text-[10px] border transition-colors ${
                                isSelected
                                  ? 'bg-cyan-500 border-cyan-400 text-slate-950 font-black'
                                  : 'border-slate-700 bg-slate-950 text-transparent'
                              }`}
                            >
                              ✓
                            </span>
                            <span>{m.label}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1 pl-5.5">{m.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Momentum Alert Settings */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Алерт різкого руху (Moving Up/Down %)</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={formConfig.momentumEnabled}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, momentumEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded text-cyan-600 bg-slate-900 border-slate-700 cursor-pointer"
                  />
                </div>

                {formConfig.momentumEnabled && (
                  <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                    <div>
                      <label className="text-[10px] text-slate-400">Поріг руху (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="20"
                        value={formConfig.momentumPct}
                        onChange={(e) => setFormConfig((prev) => ({ ...prev, momentumPct: Number(e.target.value) }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white font-mono text-xs mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400">Кількість свічок</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={formConfig.momentumBars}
                        onChange={(e) => setFormConfig((prev) => ({ ...prev, momentumBars: Number(e.target.value) }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white font-mono text-xs mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400">Таймфрейм</label>
                      <select
                        value={formConfig.momentumTf}
                        onChange={(e) => setFormConfig((prev) => ({ ...prev, momentumTf: e.target.value as any }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white text-xs mt-1"
                      >
                        <option value="15m">15m</option>
                        <option value="1h">1h</option>
                        <option value="4h">4h</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Toggles for Indicators & Levels */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-300 font-medium">Старші рівні 4H/1D (Crossing Up / Down)</span>
                  <input
                    type="checkbox"
                    checked={formConfig.levelsEnabled}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, levelsEnabled: e.target.checked }))}
                    className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-300 font-medium">Зміна структури ринку (BOS / CHoCH)</span>
                  <input
                    type="checkbox"
                    checked={formConfig.structureEnabled}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, structureEnabled: e.target.checked }))}
                    className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-300 font-medium">Вихід із консолідаційного каналу (Channel Break)</span>
                  <input
                    type="checkbox"
                    checked={formConfig.channelEnabled}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, channelEnabled: e.target.checked }))}
                    className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-300 font-medium">Зона Fibonacci 0.618 Golden Pocket</span>
                  <input
                    type="checkbox"
                    checked={formConfig.fibonacciEnabled}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, fibonacciEnabled: e.target.checked }))}
                    className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleSaveAddCoin}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-cyan-950/40 cursor-pointer flex items-center gap-1.5"
              >
                <Radar className="w-4 h-4" />
                <span>Запустити системний нагляд</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Surveillance Config for existing coin */}
      {editingCoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-cyan-400" />
                  <span>Налаштування нагляду: #{editingCoin.symbol}</span>
                </h3>
                <p className="text-[11px] text-slate-400">Зміна параметрів рівнів, імпульсу та підтвердження свічки</p>
              </div>
              <button onClick={() => setEditingCoin(null)} className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Trigger Confirmation Modes (Multi-select) */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Режими підтвердження пробою (можна кілька)</span>
                  </label>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono font-bold">
                    МУЛЬТИ-ВИБІР ({formConfig.triggerModes?.length || 1})
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {TRIGGER_MODE_OPTIONS.map((m) => {
                    const isSelected = formConfig.triggerModes?.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleTriggerMode(m.id)}
                        className={`p-2.5 rounded-xl text-left text-xs transition-all border cursor-pointer flex items-start justify-between gap-2 ${
                          isSelected
                            ? 'bg-cyan-500/20 border-cyan-400 text-white font-semibold shadow-sm shadow-cyan-950/30'
                            : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="font-bold flex items-center gap-1.5">
                            <span
                              className={`w-4 h-4 rounded-md flex items-center justify-center text-[10px] border transition-colors ${
                                isSelected
                                  ? 'bg-cyan-500 border-cyan-400 text-slate-950 font-black'
                                  : 'border-slate-700 bg-slate-950 text-transparent'
                              }`}
                            >
                              ✓
                            </span>
                            <span>{m.label}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1 pl-5.5">{m.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Momentum Alert Settings */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Алерт різкого руху (Moving Up/Down %)</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={formConfig.momentumEnabled}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, momentumEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded text-cyan-600 bg-slate-900 border-slate-700 cursor-pointer"
                  />
                </div>

                {formConfig.momentumEnabled && (
                  <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                    <div>
                      <label className="text-[10px] text-slate-400">Поріг руху (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="20"
                        value={formConfig.momentumPct}
                        onChange={(e) => setFormConfig((prev) => ({ ...prev, momentumPct: Number(e.target.value) }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white font-mono text-xs mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400">Кількість свічок</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={formConfig.momentumBars}
                        onChange={(e) => setFormConfig((prev) => ({ ...prev, momentumBars: Number(e.target.value) }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white font-mono text-xs mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400">Таймфрейм</label>
                      <select
                        value={formConfig.momentumTf}
                        onChange={(e) => setFormConfig((prev) => ({ ...prev, momentumTf: e.target.value as any }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white text-xs mt-1"
                      >
                        <option value="15m">15m</option>
                        <option value="1h">1h</option>
                        <option value="4h">4h</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Timeframe & Cooldown */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 font-medium">Базовий таймфрейм</label>
                  <select
                    value={formConfig.timeframe || '4h'}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, timeframe: e.target.value as Timeframe }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="15m">15m</option>
                    <option value="1h">1h</option>
                    <option value="4h">4h (Рекомендовано)</option>
                    <option value="1d">1d</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 font-medium">Кулдаун сповіщень (хв)</label>
                  <select
                    value={formConfig.cooldownMinutes ?? 15}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, cooldownMinutes: Number(e.target.value) }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value={5}>5 хв</option>
                    <option value={10}>10 хв</option>
                    <option value={15}>15 хв</option>
                    <option value={30}>30 хв</option>
                    <option value={60}>60 хв</option>
                  </select>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-300 font-medium">Старші рівні 4H/1D (Crossing Up / Down)</span>
                  <input
                    type="checkbox"
                    checked={formConfig.levelsEnabled}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, levelsEnabled: e.target.checked }))}
                    className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-300 font-medium">Зміна структури ринку (BOS / CHoCH)</span>
                  <input
                    type="checkbox"
                    checked={formConfig.structureEnabled}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, structureEnabled: e.target.checked }))}
                    className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-300 font-medium">Вихід із консолідаційного каналу (Channel Break)</span>
                  <input
                    type="checkbox"
                    checked={formConfig.channelEnabled}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, channelEnabled: e.target.checked }))}
                    className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-300 font-medium">Зона Fibonacci 0.618 Golden Pocket</span>
                  <input
                    type="checkbox"
                    checked={formConfig.fibonacciEnabled}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, fibonacciEnabled: e.target.checked }))}
                    className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCoin(null)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleSaveEditConfig}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-cyan-950/40 cursor-pointer"
              >
                Зберегти параметри
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

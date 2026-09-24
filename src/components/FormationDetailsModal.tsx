import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  ExternalLink,
  Sparkles,
  Target,
  ShieldAlert,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Zap,
  Send,
  Bell,
  Check,
  Plus,
  Trash2,
  Pause,
  Play,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CheckCircle2,
  Lock,
  LogIn,
} from 'lucide-react';
import { ScannedCoin, DetectedFormation, Kline, FormationAIAnalysis, Timeframe, PriceAlert, ArchivedFormation } from '../types';
import { TradingViewChart } from './TradingViewChart';
import { FullscreenChartModal } from './FullscreenChartModal';
import { formatCryptoPrice } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertsContext';
import { useArchive } from '../context/ArchiveContext';
import { SmartAnalysisBlock } from './SmartAnalysisBlock';
import { ChartTopAnalysisText } from './ChartTopAnalysisText';

interface FormationDetailsModalProps {
  coin: ScannedCoin | null;
  formation: DetectedFormation | null;
  onClose: () => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  onOpenTelegramModal?: (prefill?: any) => void;
  onOpenAuth?: () => void;
  onAlertToast?: (toast: { symbol: string; targetPrice: number; condition: 'gte' | 'lte'; message?: string }) => void;
  archivedItem?: ArchivedFormation | null;
  allCoins?: ScannedCoin[];
  watchlist?: string[];
  onToggleWatchlist?: (symbol: string) => void;
}

export const FormationDetailsModal: React.FC<FormationDetailsModalProps> = ({
  coin,
  formation,
  onClose,
  onSendMetaScalp,
  metaScalpBinding = '001',
  onOpenTelegramModal,
  onOpenAuth,
  onAlertToast,
  archivedItem,
  allCoins = [],
  watchlist = [],
  onToggleWatchlist,
}) => {
  if (!coin || !formation) return null;

  const { user, profile } = useAuth();
  const { alerts, addAlert, addAlertsBatch, deleteAlert, toggleAlert } = useAlerts();
  const { isArchived, saveToArchive } = useArchive();

  const alreadyArchived = isArchived(coin.symbol, formation.id || formation.name);
  const [isSavingArchive, setIsSavingArchive] = useState<boolean>(false);
  const [archiveToastMsg, setArchiveToastMsg] = useState<string | null>(null);

  const chartSectionRef = useRef<HTMLDivElement>(null);

  // Lock background body scroll and auto-focus / center on chart upon entering page
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = setTimeout(() => {
      if (chartSectionRef.current) {
        chartSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    return () => {
      document.body.style.overflow = originalOverflow;
      clearTimeout(focusTimer);
    };
  }, []);

  const [timeframe, setTimeframe] = useState<Timeframe>(
    archivedItem?.chartParams?.timeframe || archivedItem?.timeframe || coin.timeframe || '1h'
  );
  const [historyLimit, setHistoryLimit] = useState<number>(
    archivedItem?.chartParams?.historyLimit || 1000
  );
  const [livePrice, setLivePrice] = useState<number>(
    archivedItem?.savedPrice || coin.currentPrice
  );
  const [klines, setKlines] = useState<Kline[]>([]);
  const [loadingKlines, setLoadingKlines] = useState<boolean>(true);
  const [aiAnalysis, setAiAnalysis] = useState<FormationAIAnalysis | null>(null);
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [alertFeedback, setAlertFeedback] = useState<string | null>(null);
  const [settingAlert, setSettingAlert] = useState<string | null>(null);

  const handleSaveToArchive = async () => {
    if (isSavingArchive) return;
    setIsSavingArchive(true);
    try {
      if (alreadyArchived) {
        setArchiveToastMsg('Формація вже в архіві');
        setTimeout(() => setArchiveToastMsg(null), 3000);
        return;
      }
      await saveToArchive(coin, formation, {
        timeframe,
        historyLimit,
        currentPrice: livePrice || coin.currentPrice,
      });
      setArchiveToastMsg('Формацію додано в архів!');
      onAlertToast?.({
        symbol: coin.symbol,
        targetPrice: formation.levels.targetPrice,
        condition: 'gte',
        message: `${formation.name} • Збережено в архів формацій`,
      });
      setTimeout(() => setArchiveToastMsg(null), 3500);
    } catch (err: any) {
      console.error('Failed to save to archive:', err);
      setArchiveToastMsg('Помилка збереження');
      setTimeout(() => setArchiveToastMsg(null), 3000);
    } finally {
      setIsSavingArchive(false);
    }
  };

  // Custom price alert under chart state
  const [customAlertPrice, setCustomAlertPrice] = useState<string>('');
  const [customAlertCondition, setCustomAlertCondition] = useState<'gte' | 'lte'>('gte');
  const [customAlertNote, setCustomAlertNote] = useState<string>('');
  const [settingCustomAlert, setSettingCustomAlert] = useState<boolean>(false);
  const [customAlertSuccess, setCustomAlertSuccess] = useState<string | null>(null);
  const [customAlertError, setCustomAlertError] = useState<string | null>(null);

  // Fullscreen chart modal state
  const [isFullscreenChartOpen, setIsFullscreenChartOpen] = useState<boolean>(false);

  // Keyboard shortcut 'f' to toggle fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        setIsFullscreenChartOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const cleanSymbol = useMemo(() => coin.symbol.toUpperCase().replace('/', '').trim(), [coin.symbol]);
  const coinAlerts = useMemo(() => alerts.filter((a) => a.symbol === cleanSymbol), [alerts, cleanSymbol]);

  const isTelegramConfigured = Boolean(
    (profile?.telegramBotToken && profile?.telegramChatId) ||
    (typeof window !== 'undefined' &&
      localStorage.getItem('signalhook_tg_token') &&
      localStorage.getItem('signalhook_tg_chat_id'))
  );

  // Keep livePrice in sync if coin changes
  useEffect(() => {
    if (coin?.currentPrice) {
      setLivePrice(coin.currentPrice);
      if (!customAlertPrice) {
        setCustomAlertPrice(coin.currentPrice.toString());
      }
    }
  }, [coin?.currentPrice]);

  // Quick percent deltas
  const applyPercentDelta = (percent: number) => {
    const base = livePrice || coin.currentPrice;
    if (!base) return;
    const newPrice = base * (1 + percent / 100);
    let formatted: string;
    if (newPrice >= 1000) formatted = newPrice.toFixed(2);
    else if (newPrice >= 1) formatted = newPrice.toFixed(4);
    else if (newPrice >= 0.0001) formatted = newPrice.toFixed(6);
    else formatted = newPrice.toFixed(8);

    setCustomAlertPrice(formatted);
    if (percent >= 0) {
      setCustomAlertCondition('gte');
    } else {
      setCustomAlertCondition('lte');
    }
  };

  const handleCustomPriceChange = (val: string) => {
    setCustomAlertPrice(val);
    const num = parseFloat(val);
    if (!isNaN(num) && livePrice) {
      setCustomAlertCondition(num >= livePrice ? 'gte' : 'lte');
    }
  };

  // Submit custom price alert
  const handleCreateCustomAlert = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!user) {
      setCustomAlertError('Встановлювати сповіщення можуть тільки зареєстровані користувачі');
      onOpenAuth?.();
      return;
    }

    const priceNum = parseFloat(customAlertPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setCustomAlertError('Введіть коректну ціну');
      return;
    }

    setSettingCustomAlert(true);
    setCustomAlertError(null);
    setCustomAlertSuccess(null);

    try {
      await addAlert({
        symbol: coin.symbol,
        exchange: coin.exchange,
        marketType: coin.marketType,
        targetPrice: priceNum,
        condition: customAlertCondition,
        formationName: formation.name,
        levelType: 'custom',
        note: customAlertNote.trim() || `Ціль $${formatCryptoPrice(priceNum)}`,
      });

      setCustomAlertSuccess(`Сповіщення на $${formatCryptoPrice(priceNum)} додано!`);
      setCustomAlertNote('');
      onAlertToast?.({
        symbol: coin.symbol,
        targetPrice: priceNum,
        condition: customAlertCondition,
        message: `${coin.symbol} • Своя ціль $${formatCryptoPrice(priceNum)} додана`,
      });
      setTimeout(() => setCustomAlertSuccess(null), 3500);
    } catch (err: any) {
      setCustomAlertError(err.message || 'Не вдалося створити сповіщення');
    } finally {
      setSettingCustomAlert(false);
    }
  };

  const handleToggleCoinAlert = async (id: string) => {
    try {
      await toggleAlert(id);
    } catch (err) {
      console.error('Failed to toggle alert:', err);
    }
  };

  const handleDeleteCoinAlert = async (id: string) => {
    try {
      await deleteAlert(id);
    } catch (err) {
      console.error('Failed to delete alert:', err);
    }
  };

  // Fetch klines when modal opens, timeframe changes, or historyLimit changes
  useEffect(() => {
    let isCancelled = false;

    async function loadKlines() {
      setLoadingKlines(true);
      try {
        const res = await fetch(
          `/api/klines?exchange=${coin?.exchange}&market=${coin?.marketType}&symbol=${coin?.symbol}&timeframe=${timeframe}&limit=${historyLimit}`
        );
        const data = await res.json();
        if (!isCancelled && data.success && Array.isArray(data.data)) {
          setKlines(data.data);
          if (data.data.length > 0) {
            setLivePrice(data.data[data.data.length - 1].close);
          }
        }
      } catch (err) {
        console.error('Failed to load klines:', err);
      } finally {
        if (!isCancelled) setLoadingKlines(false);
      }
    }

    loadKlines();

    return () => {
      isCancelled = true;
    };
  }, [coin, timeframe, historyLimit]);

  // Trigger AI analysis
  const handleRequestAi = async () => {
    if (loadingAi) return;
    setLoadingAi(true);
    try {
      const res = await fetch('/api/ai/analyze-formation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: coin.symbol,
          exchange: coin.exchange,
          timeframe,
          formation,
          currentPrice: coin.currentPrice,
          recentCandles: klines.slice(-10),
        }),
      });

      const data = await res.json();
      if (data.success && data.analysis) {
        setAiAnalysis(data.analysis);
      }
    } catch (err) {
      console.error('Failed to get AI analysis:', err);
    } finally {
      setLoadingAi(false);
    }
  };

  const isBullish = formation.bias === 'bullish';
  const isBearish = formation.bias === 'bearish';

  const formatPrice = (price: number) => formatCryptoPrice(price);

  // Set Telegram price alert
  const handleSetAlert = async (levelType: 'entry' | 'target' | 'stop_loss', targetPrice: number) => {
    if (!targetPrice) return;

    if (!user) {
      setAlertFeedback('Тільки для зареєстрованих');
      onAlertToast?.({
        symbol: coin.symbol,
        targetPrice,
        condition: targetPrice >= livePrice ? 'gte' : 'lte',
        message: 'Встановлення сповіщень доступне тільки для зареєстрованих користувачів. Будь ласка, увійдіть.',
      });
      onOpenAuth?.();
      return;
    }

    setSettingAlert(levelType);
    setAlertFeedback(null);

    const isBull = formation.bias === 'bullish';
    let condition: 'gte' | 'lte';
    if (levelType === 'target') {
      condition = isBull ? 'gte' : 'lte';
    } else if (levelType === 'stop_loss') {
      condition = isBull ? 'lte' : 'gte';
    } else {
      condition = targetPrice >= livePrice ? 'gte' : 'lte';
    }

    const levelLabel = levelType === 'entry' ? 'Вхід' : levelType === 'target' ? 'Тейк-профіт' : 'Стоп-лосс';

    try {
      await addAlert({
        symbol: coin.symbol,
        exchange: coin.exchange,
        marketType: coin.marketType,
        targetPrice,
        condition,
        formationName: formation.name,
        levelType,
        note: `${formation.name} - ${levelLabel}`,
      });

      setAlertFeedback(`Алерт на ${levelLabel} додано!`);
      onAlertToast?.({
        symbol: coin.symbol,
        targetPrice,
        condition,
        message: `${formation.name} • ${levelLabel} ($${formatPrice(targetPrice)})`,
      });
      setTimeout(() => setAlertFeedback(null), 3000);
    } catch (err: any) {
      setAlertFeedback(err.message || 'Помилка');
    } finally {
      setSettingAlert(null);
    }
  };

  // Set Telegram alert from Realtime Liquidity widget
  const handleSetQuickLiquidityAlert = async (targetPrice: number, label: string, condition: 'gte' | 'lte') => {
    if (!targetPrice) return;
    if (!user) {
      onAlertToast?.({
        symbol: coin.symbol,
        targetPrice,
        condition,
        message: 'Встановлення сповіщень доступне для зареєстрованих користувачів. Будь ласка, увійдіть.',
      });
      onOpenAuth?.();
      return;
    }
    try {
      await addAlert({
        symbol: coin.symbol,
        exchange: coin.exchange,
        marketType: coin.marketType,
        targetPrice,
        condition,
        formationName: label,
        levelType: 'custom',
        note: `${coin.symbol} • ${label}`,
      });
      onAlertToast?.({
        symbol: coin.symbol,
        targetPrice,
        condition,
        message: `Сповіщення Telegram встановлено: ${label} ($${formatPrice(targetPrice)})`,
      });
    } catch (err: any) {
      console.error('Failed to set liquidity alert:', err);
    }
  };

  // Set all 3 alerts at once (Entry, Take Profit, Stop Loss)
  const handleSetAllAlerts = async () => {
    if (!user) {
      setAlertFeedback('Тільки для зареєстрованих');
      onAlertToast?.({
        symbol: coin.symbol,
        targetPrice: formation.levels.targetPrice,
        condition: 'gte',
        message: 'Встановлення сповіщень доступне тільки для зареєстрованих користувачів. Будь ласка, увійдіть.',
      });
      onOpenAuth?.();
      return;
    }

    setSettingAlert('all');
    setAlertFeedback(null);
    try {
      const isBull = formation.bias === 'bullish';
      const entryCond = formation.levels.entryPrice >= livePrice ? 'gte' : 'lte';
      const targetCond = isBull ? 'gte' : 'lte';
      const stopLossCond = isBull ? 'lte' : 'gte';

      await addAlertsBatch([
        {
          symbol: coin.symbol,
          exchange: coin.exchange,
          marketType: coin.marketType,
          targetPrice: formation.levels.entryPrice,
          condition: entryCond,
          formationName: formation.name,
          levelType: 'entry',
          note: `${formation.name} - Вхід`,
        },
        {
          symbol: coin.symbol,
          exchange: coin.exchange,
          marketType: coin.marketType,
          targetPrice: formation.levels.targetPrice,
          condition: targetCond,
          formationName: formation.name,
          levelType: 'target',
          note: `${formation.name} - Тейк-профіт (+${formation.potentialProfitPct}%)`,
        },
        {
          symbol: coin.symbol,
          exchange: coin.exchange,
          marketType: coin.marketType,
          targetPrice: formation.levels.stopLossPrice,
          condition: stopLossCond,
          formationName: formation.name,
          levelType: 'stop_loss',
          note: `${formation.name} - Стоп-лосс (-${Math.abs(formation.potentialRiskPct)}%)`,
        },
      ]);

      setAlertFeedback('Всі 3 рівні додано в Telegram!');
      onAlertToast?.({
        symbol: coin.symbol,
        targetPrice: formation.levels.targetPrice,
        condition: targetCond,
        message: `${formation.name} • Всі 3 алерти додано в Telegram`,
      });
      setTimeout(() => setAlertFeedback(null), 3500);
    } catch (err: any) {
      setAlertFeedback(err.message || 'Помилка додавання');
    } finally {
      setSettingAlert(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto no-scrollbar">
      <div className="relative w-full max-w-6xl 2xl:max-w-7xl bg-slate-900 border-0 sm:border border-slate-800 rounded-none sm:rounded-3xl shadow-2xl overflow-hidden my-auto min-h-screen sm:min-h-0 sm:max-h-[95vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-6 py-2.5 sm:py-4 border-b border-slate-800 bg-slate-950/80 sticky top-0 z-20">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                <h2 className="text-base sm:text-xl font-extrabold text-white font-mono tracking-wide">
                  {coin.baseAsset}/{coin.quoteAsset}
                </h2>
                <span
                  className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded font-bold uppercase ${
                    coin.exchange === 'binance'
                      ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                      : 'bg-orange-500/10 text-orange-300 border border-orange-500/30'
                  }`}
                >
                  {coin.exchange}
                </span>
                <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {coin.marketType === 'futures' ? 'USDT-M' : 'Spot'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center flex-wrap gap-1">
                <span className="hidden xs:inline">Поточна ціна:</span>
                <span className="font-mono text-white font-bold">${formatPrice(livePrice)}</span>
                <span className={`font-semibold ml-1 ${coin.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ({coin.priceChange24h >= 0 ? '+' : ''}{coin.priceChange24h.toFixed(2)}%)
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Telegram Alerts button */}
            <button
              onClick={() =>
                onOpenTelegramModal?.({
                  symbol: coin.symbol,
                  exchange: coin.exchange,
                  marketType: coin.marketType,
                  currentPrice: livePrice,
                  targetPrice: formation.levels.targetPrice,
                  formationName: formation.name,
                })
              }
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 hover:text-sky-100 border border-sky-500/40 text-xs font-semibold transition-all active:scale-95 shadow-sm whitespace-nowrap cursor-pointer"
              title="Налаштувати сповіщення в Telegram"
            >
              <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400" />
              <span className="hidden md:inline">Telegram</span>
            </button>

            {onSendMetaScalp && (
              <button
                onClick={() => onSendMetaScalp(coin)}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-100 border border-amber-500/40 text-xs font-semibold transition-all active:scale-95 shadow-sm whitespace-nowrap cursor-pointer"
                title={`Відкрити в MetaScalp (Група ${metaScalpBinding})`}
              >
                <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 fill-amber-400/30" />
                <span className="hidden md:inline">В MetaScalp</span>
                <span className="font-mono text-[10px] px-1 rounded bg-amber-500/20 text-amber-200">
                  {metaScalpBinding}
                </span>
              </button>
            )}

            {/* Return to Main Menu button */}
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 hover:text-cyan-100 border border-cyan-500/40 text-xs sm:text-sm font-semibold transition-all active:scale-95 shadow-sm whitespace-nowrap cursor-pointer"
              title="Повернутися в головне меню"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">В головне меню</span>
              <span className="sm:hidden">Назад</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-3 sm:p-6 overflow-y-auto no-scrollbar space-y-4 sm:space-y-6">
          {/* Main Grid: Left Chart, Right Setup Details */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Left: Chart & Timeframe switch (col-span-2) */}
            <div ref={chartSectionRef} tabIndex={-1} className="lg:col-span-2 space-y-3 outline-none">
              {/* Real-time Analysis Plain Text without borders, dependent on chart timeframe */}
              <ChartTopAnalysisText
                coin={coin}
                formation={formation}
                klines={klines}
                livePrice={livePrice}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
              />

              {loadingKlines ? (
                <div className="w-full h-[220px] xs:h-[260px] sm:h-[300px] md:h-[350px] lg:h-[390px] xl:h-[430px] rounded-xl border border-slate-800 bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                  <span className="text-xs">Завантаження свічок з біржі...</span>
                </div>
              ) : (
                <TradingViewChart
                  klines={klines}
                  formation={formation}
                  symbol={`${coin.symbol}`}
                  timeframe={timeframe}
                  exchange={coin.exchange}
                  marketType={coin.marketType}
                  historyLimit={historyLimit}
                  onHistoryLimitChange={setHistoryLimit}
                  onTimeframeChange={setTimeframe}
                  onLivePriceUpdate={setLivePrice}
                  onOpenFullscreen={() => setIsFullscreenChartOpen(true)}
                  onAddToArchive={handleSaveToArchive}
                  isArchived={alreadyArchived}
                  isSavingArchive={isSavingArchive}
                  customMarkers={archivedItem?.markers}
                  savedChartParams={archivedItem?.chartParams}
                />
              )}

              {/* Custom Price Alert Section Below Chart */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        Власне сповіщення ціни в Telegram
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
                          {coin.symbol}
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400">
                        Вкажіть будь-яку ціну, при досягненні якої бот надішле миттєвий сигнал
                      </p>
                    </div>
                  </div>

                  {/* Telegram status badge */}
                  {isTelegramConfigured === false && onOpenTelegramModal && (
                    <button
                      type="button"
                      onClick={() => onOpenTelegramModal({ symbol: coin.symbol })}
                      className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 flex items-center gap-1.5 transition-colors"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Підключити Telegram-бота</span>
                    </button>
                  )}
                  {isTelegramConfigured && (
                    <div className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Бот підключено</span>
                    </div>
                  )}
                </div>

                {/* Form controls */}
                <form onSubmit={handleCreateCustomAlert} className="space-y-3">
                  {/* Quick Delta Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-slate-400 text-[11px] mr-1">Швидкий вибір:</span>
                    <button
                      type="button"
                      onClick={() => applyPercentDelta(0)}
                      className="px-2 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors"
                    >
                      Поточна (${formatPrice(livePrice || coin.currentPrice)})
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPercentDelta(0.5)}
                      className="px-2 py-1 rounded-md bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/40 text-xs font-mono transition-colors"
                    >
                      +0.5%
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPercentDelta(1)}
                      className="px-2 py-1 rounded-md bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/40 text-xs font-mono transition-colors"
                    >
                      +1%
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPercentDelta(2)}
                      className="px-2 py-1 rounded-md bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/40 text-xs font-mono transition-colors"
                    >
                      +2%
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPercentDelta(5)}
                      className="px-2 py-1 rounded-md bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/40 text-xs font-mono transition-colors"
                    >
                      +5%
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPercentDelta(-0.5)}
                      className="px-2 py-1 rounded-md bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-xs font-mono transition-colors"
                    >
                      -0.5%
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPercentDelta(-1)}
                      className="px-2 py-1 rounded-md bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-xs font-mono transition-colors"
                    >
                      -1%
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPercentDelta(-2)}
                      className="px-2 py-1 rounded-md bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-xs font-mono transition-colors"
                    >
                      -2%
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPercentDelta(-5)}
                      className="px-2 py-1 rounded-md bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-xs font-mono transition-colors"
                    >
                      -5%
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    {/* Price Input */}
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Цільова ціна ($)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">
                          $
                        </span>
                        <input
                          type="number"
                          step="any"
                          value={customAlertPrice}
                          onChange={(e) => handleCustomPriceChange(e.target.value)}
                          placeholder={String(livePrice || coin.currentPrice)}
                          className="w-full pl-7 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                          required
                        />
                      </div>
                    </div>

                    {/* Condition toggle */}
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Умова спрацювання
                      </label>
                      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 border border-slate-700 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setCustomAlertCondition('gte')}
                          className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                            customAlertCondition === 'gte'
                              ? 'bg-emerald-500 text-white font-bold shadow'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>≥ Ріст</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomAlertCondition('lte')}
                          className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                            customAlertCondition === 'lte'
                              ? 'bg-rose-500 text-white font-bold shadow'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <ArrowDownRight className="w-3.5 h-3.5" />
                          <span>≤ Спад</span>
                        </button>
                      </div>
                    </div>

                    {/* Note Input */}
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Нотатка (необов'язково)
                      </label>
                      <input
                        type="text"
                        value={customAlertNote}
                        onChange={(e) => setCustomAlertNote(e.target.value)}
                        placeholder="Напр. Тест рівня, пробій..."
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                      />
                    </div>

                    {/* Submit Button */}
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={settingCustomAlert || !customAlertPrice}
                        className="w-full py-2 px-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {settingCustomAlert ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            <span>Додати</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Feedback messages */}
                  {customAlertSuccess && (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>{customAlertSuccess}</span>
                    </div>
                  )}
                  {customAlertError && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{customAlertError}</span>
                    </div>
                  )}
                </form>

                {/* List of active alerts for this coin */}
                {coinAlerts.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold">Встановлені сповіщення для {coin.symbol}:</span>
                      <span className="font-mono text-cyan-400 font-bold">{coinAlerts.length}</span>
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {coinAlerts.map((a) => (
                        <div
                          key={a.id}
                          className={`flex items-center justify-between gap-2 p-2 rounded-xl border text-xs ${
                            a.triggered
                              ? 'bg-slate-900/50 border-slate-800 text-slate-400'
                              : a.isActive
                              ? 'bg-slate-900 border-slate-700/80 text-white'
                              : 'bg-slate-950 border-slate-800/50 text-slate-500'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`p-1 rounded font-mono text-[10px] font-bold ${
                                a.condition === 'gte'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {a.condition === 'gte' ? '≥' : '≤'}
                            </span>
                            <span className="font-mono font-bold text-white">
                              ${formatPrice(a.targetPrice)}
                            </span>
                            {a.note && (
                              <span className="text-[11px] text-slate-400 truncate max-w-[140px] sm:max-w-[200px]">
                                ({a.note})
                              </span>
                            )}
                            {a.triggered && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                                Спрацював (${formatPrice(a.triggeredPrice || a.targetPrice)})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {!a.triggered && (
                              <button
                                type="button"
                                onClick={() => handleToggleCoinAlert(a.id)}
                                title={a.isActive ? 'Призупинити' : 'Активувати'}
                                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                              >
                                {a.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteCoinAlert(a.id)}
                              title="Видалити"
                              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Formation & Trade Setup Card */}
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                      Виявлена формація
                    </span>
                    <h3 className="text-base font-extrabold text-white mt-0.5">{formation.name}</h3>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-extrabold uppercase ${
                      isBullish
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : isBearish
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {isBullish ? 'LONG ▲' : isBearish ? 'SHORT ▼' : 'NEUTRAL'}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                  {formation.description}
                </p>

                {/* Status & Confidence */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60">
                    <span className="text-slate-400 text-[10px] block">Статус патерну</span>
                    <span className="font-semibold text-slate-100">{formation.statusLabel}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60">
                    <span className="text-slate-400 text-[10px] block">Впевненість</span>
                    <span className="font-bold text-cyan-400 font-mono">{formation.confidence}%</span>
                  </div>
                </div>

                {/* Trade Setup Matrix */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Торгові рівні (Setup)
                  </span>

                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-sky-950/30 border border-sky-900/40">
                      <span className="text-sky-300 font-sans flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-sky-400" />
                        Точка входу (Entry):
                      </span>
                      <span className="font-bold text-white">${formatPrice(formation.levels.entryPrice)}</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-950/30 border border-emerald-900/40">
                      <span className="text-emerald-300 font-sans flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-emerald-400" />
                        Ціль (Take Profit):
                      </span>
                      <div className="text-right">
                        <span className="font-bold text-emerald-400">${formatPrice(formation.levels.targetPrice)}</span>
                        <span className="text-[10px] text-emerald-300 ml-1.5">
                          {formation.status === 'target_reached' ? `(Досягнуто +${formation.potentialProfitPct}%)` : `(+${formation.potentialProfitPct}%)`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-rose-950/30 border border-rose-900/40">
                      <span className="text-rose-300 font-sans flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                        Стоп-лос (Stop Loss):
                      </span>
                      <div className="text-right">
                        <span className="font-bold text-rose-400">${formatPrice(formation.levels.stopLossPrice)}</span>
                        <span className="text-[10px] text-rose-300 ml-1.5">(-{Math.abs(formation.potentialRiskPct)}%)</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 font-sans">Співвідношення Risk / Reward:</span>
                      <span className="font-bold text-cyan-300 text-sm">1 : {formation.riskRewardRatio}</span>
                    </div>
                  </div>
                </div>

                {/* Telegram Price Alerts Quick Box */}
                <div className="p-3.5 rounded-xl bg-sky-950/30 border border-sky-500/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 text-sky-400" />
                      Сповіщення в Telegram
                    </span>
                    {!user ? (
                      <span className="text-[10px] text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1 font-medium">
                        <Lock className="w-3 h-3 text-amber-400" /> Тільки для зареєстрованих
                      </span>
                    ) : alertFeedback ? (
                      <span className="text-[10px] text-emerald-300 font-semibold animate-pulse">
                        {alertFeedback}
                      </span>
                    ) : (
                      <button
                        onClick={() =>
                          onOpenTelegramModal?.({
                            symbol: coin.symbol,
                            exchange: coin.exchange,
                            marketType: coin.marketType,
                            currentPrice: livePrice,
                            targetPrice: formation.levels.targetPrice,
                            formationName: formation.name,
                          })
                        }
                        className="text-[10px] text-sky-400 hover:text-sky-300 underline font-medium cursor-pointer"
                      >
                        Керувати
                      </button>
                    )}
                  </div>

                  {!user ? (
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-center space-y-2">
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Встановлення сповіщень у Telegram на точки входу, тейк-профіт та стоп-лосс доступне тільки зареєстрованим користувачам.
                      </p>
                      {onOpenAuth && (
                        <button
                          type="button"
                          onClick={onOpenAuth}
                          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition-all shadow cursor-pointer"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          <span>Увійти / Зареєструватися</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* 3 Quick Buttons: Entry, Target, Stop Loss */}
                      <div className="grid grid-cols-3 gap-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() => handleSetAlert('entry', formation.levels.entryPrice)}
                          disabled={settingAlert !== null}
                          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/50 text-slate-300 hover:text-white transition-all text-center cursor-pointer group disabled:opacity-50"
                          title="Надіслати в Telegram, коли ціна досягне точки входу"
                        >
                          <div className="text-[10px] text-sky-400 font-medium group-hover:text-sky-300 flex items-center justify-center gap-1">
                            <Bell className="w-2.5 h-2.5" /> Вхід
                          </div>
                          <div className="font-mono font-bold text-[11px] text-white mt-0.5">
                            ${formatPrice(formation.levels.entryPrice)}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSetAlert('target', formation.levels.targetPrice)}
                          disabled={settingAlert !== null}
                          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 text-slate-300 hover:text-white transition-all text-center cursor-pointer group disabled:opacity-50"
                          title="Надіслати в Telegram, коли ціна досягне тейк-профіту"
                        >
                          <div className="text-[10px] text-emerald-400 font-medium group-hover:text-emerald-300 flex items-center justify-center gap-1">
                            <Target className="w-2.5 h-2.5" /> Тейк
                          </div>
                          <div className="font-mono font-bold text-[11px] text-white mt-0.5">
                            ${formatPrice(formation.levels.targetPrice)}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSetAlert('stop_loss', formation.levels.stopLossPrice)}
                          disabled={settingAlert !== null}
                          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-rose-500/50 text-slate-300 hover:text-white transition-all text-center cursor-pointer group disabled:opacity-50"
                          title="Надіслати в Telegram, коли ціна досягне стоп-лосу"
                        >
                          <div className="text-[10px] text-rose-400 font-medium group-hover:text-rose-300 flex items-center justify-center gap-1">
                            <ShieldAlert className="w-2.5 h-2.5" /> Стоп
                          </div>
                          <div className="font-mono font-bold text-[11px] text-white mt-0.5">
                            ${formatPrice(formation.levels.stopLossPrice)}
                          </div>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleSetAllAlerts}
                        disabled={settingAlert !== null}
                        className="w-full py-1.5 px-2.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-sky-300 hover:text-sky-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{settingAlert === 'all' ? 'Встановлення...' : 'Встановити всі 3 рівні в Telegram'}</span>
                      </button>
                    </>
                  )}
                </div>

                {/* AI Analysis Trigger Button */}
                <button
                  onClick={handleRequestAi}
                  disabled={loadingAi}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/40 transition-all cursor-pointer"
                >
                  <Sparkles className={`w-4 h-4 ${loadingAi ? 'animate-spin' : ''}`} />
                  <span>{loadingAi ? 'Аналізуємо патерн...' : 'Інституційний Аналіз'}</span>
                </button>

              </div>
            </div>
          </div>

          {/* AI Analysis Section */}
          {aiAnalysis && (
            <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-cyan-900/40 space-y-4">
              <div className="flex items-center gap-2 text-cyan-400">
                <Sparkles className="w-5 h-5" />
                <h4 className="text-sm font-bold uppercase tracking-wider">
                  Інституційний Розбір Формації
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Summary & Confirmation */}
                <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div>
                    <span className="font-semibold text-slate-300 block mb-1 text-xs">Резюме позиції:</span>
                    <p className="text-slate-300 leading-relaxed">{aiAnalysis.summary}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-cyan-300 block mb-1 text-xs">Підтвердження формації:</span>
                    <p className="text-slate-400 leading-relaxed">{aiAnalysis.patternConfirmation}</p>
                  </div>
                </div>

                {/* Targets & Invalidation */}
                <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div>
                    <span className="font-semibold text-emerald-400 block mb-1 text-xs">Аналіз ліквідності та цілей:</span>
                    <p className="text-slate-300 leading-relaxed">{aiAnalysis.targetAnalysis}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-rose-400 block mb-1 text-xs">Критерій інвалідації (Скасування):</span>
                    <p className="text-slate-400 leading-relaxed">{aiAnalysis.invalidationCriteria}</p>
                  </div>
                </div>
              </div>

              {/* Trade Scenario Box */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="font-semibold text-slate-200 mb-2 text-xs">Торговий сценарій від AI:</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs font-mono">
                  <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">Вхід</span>
                    <span className="font-bold text-white mt-0.5 block">{aiAnalysis.tradeScenario.recommendedEntry}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-emerald-400 block font-sans">TP1 (Консервативний)</span>
                    <span className="font-bold text-emerald-400 mt-0.5 block">{aiAnalysis.tradeScenario.tp1}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-emerald-300 block font-sans">TP2 (Основний)</span>
                    <span className="font-bold text-emerald-300 mt-0.5 block">{aiAnalysis.tradeScenario.tp2}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-rose-400 block font-sans">Стоп-лос</span>
                    <span className="font-bold text-rose-400 mt-0.5 block">{aiAnalysis.tradeScenario.stopLoss}</span>
                  </div>
                </div>

                {/* Key Risks */}
                {aiAnalysis.keyRisks && aiAnalysis.keyRisks.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800/80">
                    <span className="text-[11px] font-semibold text-amber-300 flex items-center gap-1 mb-1">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      Ключові ризики:
                    </span>
                    <ul className="list-disc list-inside text-slate-400 text-xs space-y-0.5">
                      {aiAnalysis.keyRisks.map((risk, idx) => (
                        <li key={idx}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Smart Analysis Block ("Розумний Аналіз") */}
          <SmartAnalysisBlock coin={coin} formation={formation} klines={klines} />
        </div>
      </div>

      {/* Interactive Fullscreen Chart Modal */}
      <FullscreenChartModal
        isOpen={isFullscreenChartOpen}
        onClose={() => setIsFullscreenChartOpen(false)}
        coin={coin}
        formation={formation}
        klines={klines}
        currentTimeframe={timeframe}
        onTimeframeChange={setTimeframe}
        livePrice={livePrice}
        onOpenTelegramModal={onOpenTelegramModal}
        onSendMetaScalp={onSendMetaScalp}
        metaScalpBinding={metaScalpBinding}
        onAddToArchive={handleSaveToArchive}
        isArchived={alreadyArchived}
        customMarkers={archivedItem?.markers}
        savedChartParams={archivedItem?.chartParams}
        allCoins={allCoins}
        watchlist={watchlist}
        onToggleWatchlist={onToggleWatchlist}
      />
    </div>
  );
};

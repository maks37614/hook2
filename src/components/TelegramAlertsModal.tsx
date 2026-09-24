import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  Bell,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plus,
  RefreshCw,
  ExternalLink,
  Eye,
  EyeOff,
  Play,
  Pause,
  Clock,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  ShieldCheck,
  Zap,
  AlertTriangle,
  Lock,
  History,
  RotateCcw,
} from 'lucide-react';
import { PriceAlert, TelegramStatus, ExchangeId, MarketType, ScannedCoin, AlertHistoryItem } from '../types';
import { formatCryptoPrice } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertsContext';
import { LogIn } from 'lucide-react';

interface TelegramAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  scannedCoins?: ScannedCoin[];
  onAlertCreated?: (alert: PriceAlert) => void;
  onOpenAuth?: () => void;
  prefill?: any;
  initialCoin?: {
    symbol: string;
    exchange: ExchangeId;
    marketType: MarketType;
    currentPrice: number;
    targetPrice?: number;
    condition?: 'gte' | 'lte';
    formationName?: string;
    levelType?: 'entry' | 'target' | 'stop_loss' | 'custom';
    note?: string;
  } | null;
}

export const TelegramAlertsModal: React.FC<TelegramAlertsModalProps> = ({
  isOpen,
  onClose,
  scannedCoins = [],
  onAlertCreated,
  onOpenAuth,
  prefill,
  initialCoin,
}) => {
  const { user, profile, updateProfileData } = useAuth();
  const {
    alerts,
    history,
    loading: loadingAlerts,
    loadingHistory,
    fetchHistory,
    clearHistory,
    deleteHistoryItem,
    reactivateAlert,
    addAlert,
    deleteAlert: removeAlert,
    toggleAlert: switchAlert,
    clearTriggered: removeTriggered,
    historyCount,
  } = useAlerts();

  const [activeTab, setActiveTab] = useState<'alerts' | 'history' | 'settings'>('alerts');
  const [clearingHistory, setClearingHistory] = useState<boolean>(false);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);

  // New Alert Form State
  const [formSymbol, setFormSymbol] = useState<string>('BTCUSDT');
  const [formExchange, setFormExchange] = useState<ExchangeId>('binance');
  const [formMarketType, setFormMarketType] = useState<MarketType>('futures');
  const [formCondition, setFormCondition] = useState<'gte' | 'lte'>('gte');
  const [formTargetPrice, setFormTargetPrice] = useState<string>('');
  const [formNote, setFormNote] = useState<string>('');
  const [creatingAlert, setCreatingAlert] = useState<boolean>(false);
  const [createSuccessMsg, setCreateSuccessMsg] = useState<string | null>(null);
  const [createErrorMsg, setCreateErrorMsg] = useState<string | null>(null);

  // Telegram Config State
  const [tgStatus, setTgStatus] = useState<TelegramStatus | null>(null);
  const [loadingTgStatus, setLoadingTgStatus] = useState<boolean>(false);
  const [botToken, setBotToken] = useState<string>(() => {
    try {
      return localStorage.getItem('signalhook_tg_token') || '';
    } catch {
      return '';
    }
  });
  const [chatId, setChatId] = useState<string>(() => {
    try {
      return localStorage.getItem('signalhook_tg_chat_id') || '';
    } catch {
      return '';
    }
  });
  const [showToken, setShowToken] = useState<boolean>(false);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [detectingChatId, setDetectingChatId] = useState<boolean>(false);
  const [detectedUser, setDetectedUser] = useState<{ username?: string; firstName?: string; chatId: string } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (profile) {
      if (profile.telegramBotToken) setBotToken(profile.telegramBotToken);
      if (profile.telegramChatId) setChatId(profile.telegramChatId);
    }
  }, [profile]);

  // Fetch Telegram Status & auto-sync if local storage has credentials
  const fetchTelegramStatus = async () => {
    setLoadingTgStatus(true);
    try {
      const url = `/api/telegram/status${user ? `?userId=${encodeURIComponent(user.uid)}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setTgStatus(data);
        if (data.chatId && !chatId) {
          setChatId(data.chatId);
          try {
            localStorage.setItem('signalhook_tg_chat_id', data.chatId);
          } catch {}
        }
        // Auto-sync credentials to server if client has them but server doesn't
        const localToken = localStorage.getItem('signalhook_tg_token') || '';
        const localChatId = localStorage.getItem('signalhook_tg_chat_id') || '';
        if (!data.isConfigured && localToken && localChatId) {
          fetch('/api/telegram/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botToken: localToken, chatId: localChatId, userId: user?.uid }),
          }).then((r) => r.json()).then((syncData) => {
            if (syncData.success) {
              setTgStatus(prev => prev ? { ...prev, isConfigured: true, botUsername: syncData.botUsername } : null);
            }
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Failed to load telegram status:', err);
    } finally {
      setLoadingTgStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTelegramStatus();
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

  const handleClearHistory = async () => {
    if (!confirm('Ви впевнені, що хочете очистити історію сповіщень?')) return;
    setClearingHistory(true);
    try {
      await clearHistory();
    } catch (err) {
      console.error('Failed to clear history:', err);
    } finally {
      setClearingHistory(false);
    }
  };

  const handleReactivateAlert = async (item: AlertHistoryItem) => {
    setReactivatingId(item.id);
    try {
      await reactivateAlert(item);
      setActiveTab('alerts');
    } catch (err) {
      console.error('Failed to reactivate alert:', err);
    } finally {
      setReactivatingId(null);
    }
  };

  // Handle Initial Coin or Prefill if passed
  useEffect(() => {
    const data = initialCoin || prefill;
    if (data) {
      if (data.symbol) setFormSymbol(data.symbol.toUpperCase().replace('/', ''));
      if (data.exchange) setFormExchange(data.exchange);
      if (data.marketType) setFormMarketType(data.marketType);
      if (data.targetPrice) {
        setFormTargetPrice(String(data.targetPrice));
      } else if (data.currentPrice) {
        setFormTargetPrice(String(data.currentPrice));
      }
      if (data.condition) {
        setFormCondition(data.condition);
      } else if (data.targetPrice && data.currentPrice) {
        setFormCondition(data.targetPrice >= data.currentPrice ? 'gte' : 'lte');
      }
      if (data.note) {
        setFormNote(data.note);
      } else if (data.formationName) {
        setFormNote(`${data.formationName} (${data.levelType || 'рівень'})`);
      }
      setShowCreateForm(true);
      setActiveTab('alerts');
    }
  }, [initialCoin, prefill]);

  // Save Telegram Config
  const handleSaveTelegramConfig = async () => {
    setSavingConfig(true);
    setTestResult(null);
    try {
      if (botToken) localStorage.setItem('signalhook_tg_token', botToken.trim());
      if (chatId) localStorage.setItem('signalhook_tg_chat_id', chatId.trim());

      if (user) {
        await updateProfileData({
          telegramBotToken: botToken.trim(),
          telegramChatId: chatId.trim(),
        });
      }

      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: botToken.trim(),
          chatId: chatId.trim(),
          userId: user?.uid,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchTelegramStatus();
        setTestResult({
          success: true,
          message: data.botUsername
            ? `Налаштування збережено у вашому профілі! Бот @${data.botUsername} готовий до відправки сповіщень.`
            : 'Налаштування успішно збережено у вашому профілі!',
        });
      } else {
        setTestResult({ success: false, message: data.error || 'Помилка збереження' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Не вдалося зберегти' });
    } finally {
      setSavingConfig(false);
    }
  };

  // Auto-detect user Chat ID from incoming messages to the bot
  const handleDetectChatId = async () => {
    const activeToken = botToken.trim();
    if (!activeToken) {
      setTestResult({
        success: false,
        message: 'Спочатку введіть Bot Token у поле вище, щоб бот міг перевірити наявність повідомлень.',
      });
      return;
    }

    setDetectingChatId(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/telegram/detect-chat-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: activeToken }),
      });
      const data = await res.json();
      if (data.success && data.chatId) {
        setChatId(data.chatId);
        try {
          localStorage.setItem('signalhook_tg_chat_id', data.chatId);
          localStorage.setItem('signalhook_tg_token', activeToken);
        } catch {}

        setDetectedUser({
          chatId: data.chatId,
          username: data.username,
          firstName: data.firstName,
        });

        setTestResult({
          success: true,
          message: `Ваш особистий Chat ID успішно визначено: ${data.chatId}${data.firstName ? ` (${data.firstName}${data.username ? ` @${data.username}` : ''})` : ''}! Тепер натисніть «Надіслати тестове сповіщення».`,
        });

        // Auto-save this confirmed config
        fetch('/api/telegram/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken: activeToken, chatId: data.chatId, userId: user?.uid }),
        }).then(() => fetchTelegramStatus()).catch(() => {});
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Не вдалося знайти Chat ID. Переконайтеся, що ви відкрили діалог з ботом у Telegram та натиснули кнопку START.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Помилка звернення до сервера',
      });
    } finally {
      setDetectingChatId(false);
    }
  };

  // Test Telegram Connection
  const handleTestTelegram = async () => {
    const activeToken = botToken.trim();
    const activeChatId = chatId.trim();

    if (!activeToken) {
      setTestResult({ success: false, message: 'Будь ласка, введіть Telegram Bot Token' });
      return;
    }
    if (!activeChatId) {
      setTestResult({ success: false, message: 'Будь ласка, введіть або визначте Telegram Chat ID' });
      return;
    }

    // Pre-check: Did user enter the bot's own ID as the chat_id?
    const botId = activeToken.split(':')[0]?.trim();
    if (botId && activeChatId === botId) {
      setTestResult({
        success: false,
        message: `❌ Помилка: Ви вказали ID самого бота (${activeChatId}) замість вашого особистого Chat ID! Бот не може надсилати повідомлення сам собі.\n\n` +
          `👉 Як виправити:\n` +
          `1. Відкрийте чат з ботом та натисніть «START»\n` +
          `2. Натисніть кнопку «⚡ Автоматично визначити мій Chat ID» або відкрийте @userinfobot щоб дізнатися ваш особистий ID`,
      });
      return;
    }

    setTestingConnection(true);
    setTestResult(null);
    try {
      if (activeToken) localStorage.setItem('signalhook_tg_token', activeToken);
      if (activeChatId) localStorage.setItem('signalhook_tg_chat_id', activeChatId);

      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: activeToken || undefined,
          chatId: activeChatId || undefined,
          userId: user?.uid,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          message: `Тестове повідомлення успішно надіслано в Telegram${data.botUsername ? ` через @${data.botUsername}` : ''}! Налаштування автоматично збережено.`,
        });
        fetchTelegramStatus();
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Telegram не відповів або відхилив повідомлення. Перевірте Token та Chat ID.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Помилка надсилання тестового сповіщення.',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Create New Price Alert
  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setCreateErrorMsg('Встановлювати сповіщення можуть тільки зареєстровані користувачі. Будь ласка, увійдіть або зареєструйтесь.');
      onOpenAuth?.();
      return;
    }

    if (!formSymbol || !formTargetPrice) {
      setCreateErrorMsg('Вкажіть символ та цільову ціну');
      return;
    }

    const priceNum = parseFloat(formTargetPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setCreateErrorMsg('Невірна цільова ціна');
      return;
    }

    setCreatingAlert(true);
    setCreateErrorMsg(null);
    setCreateSuccessMsg(null);

    try {
      const newAlert = await addAlert({
        symbol: formSymbol,
        exchange: formExchange,
        marketType: formMarketType,
        targetPrice: priceNum,
        condition: formCondition,
        note: formNote || undefined,
        formationName: initialCoin?.formationName,
        levelType: initialCoin?.levelType || 'custom',
      });

      setCreateSuccessMsg(`Сповіщення для ${formSymbol} створено у вашому профілі!`);
      onAlertCreated?.(newAlert);
      setFormNote('');
      setTimeout(() => {
        setCreateSuccessMsg(null);
        setShowCreateForm(false);
      }, 1500);
    } catch (err: any) {
      setCreateErrorMsg(err.message || 'Помилка збереження сповіщення');
    } finally {
      setCreatingAlert(false);
    }
  };

  // Toggle Alert Active
  const handleToggleAlert = async (id: string) => {
    try {
      await switchAlert(id);
    } catch (err) {
      console.error('Failed to toggle alert:', err);
    }
  };

  // Delete Alert
  const handleDeleteAlert = async (id: string) => {
    try {
      await removeAlert(id);
    } catch (err) {
      console.error('Failed to delete alert:', err);
    }
  };

  // Clear Triggered Alerts
  const handleClearTriggered = async () => {
    try {
      await removeTriggered();
    } catch (err) {
      console.error('Failed to clear triggered alerts:', err);
    }
  };

  if (!isOpen) return null;

  const activeAlerts = alerts.filter((a) => a.isActive && !a.triggered);
  const triggeredAlerts = alerts.filter((a) => a.triggered);
  const pausedAlerts = alerts.filter((a) => !a.isActive && !a.triggered);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto touch-scroll">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 bg-slate-950/90 border-b border-slate-800">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Сповіщення в Telegram</span>
                {activeAlerts.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/30 text-sky-300 font-mono text-xs font-semibold">
                    {activeAlerts.length}
                  </span>
                )}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 line-clamp-1">
                Миттєві сповіщення при досягненні ваших рівнів
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Profile Isolation Banner */}
        {user ? (
          <div className="px-5 py-2 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold text-[10px]">
                {(profile?.displayName || user.email || 'U')[0].toUpperCase()}
              </div>
              <span className="text-slate-300">
                Профіль: <strong className="text-white">{profile?.displayName || user.email}</strong>
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono">
                ХМАРА • ІЗОЛЬОВАНО
              </span>
            </div>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              Усі сповіщення та налаштування збережено у вашому обліковому записі
            </span>
          </div>
        ) : (
          <div className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/20 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold text-white">Сповіщення доступні тільки для зареєстрованих користувачів</p>
                <p className="text-[11px] text-amber-300/80">Увійдіть або зареєструйтесь, щоб створювати сповіщення та отримувати сигнали в Telegram.</p>
              </div>
            </div>
            {onOpenAuth && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow cursor-pointer active:scale-95"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Увійти / Зареєструватися</span>
              </button>
            )}
          </div>
        )}

        {/* Telegram Status Banner */}
        <div className="px-5 py-2.5 bg-slate-950/50 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Статус Telegram:</span>
            {tgStatus?.isConfigured ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Підключено {tgStatus.botUsername ? `@${tgStatus.botUsername}` : ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 font-medium">
                <AlertCircle className="w-3 h-3" />
                Не налаштовано
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setActiveTab('alerts')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                activeTab === 'alerts'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Сповіщення ({alerts.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Історія ({history.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                activeTab === 'settings'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Налаштування бота
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-5 max-h-[72vh] sm:max-h-[75vh] overflow-y-auto touch-scroll space-y-4">
          {/* TAB 1: ALERTS LIST & CREATION */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              {!user ? (
                <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800 text-center space-y-4 shadow-xl">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-400 mx-auto flex items-center justify-center">
                    <Lock className="w-7 h-7 text-amber-400" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1.5">
                    <h3 className="text-base sm:text-lg font-bold text-white">
                      Встановлення сповіщень вимагає реєстрації
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Щоб створювати та отримувати сповіщення при досягненні цінових рівнів (входу, TP, SL), необхідно увійти у свій обліковий запис або зареєструватися.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-lg mx-auto text-left py-2">
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs">
                      <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 text-cyan-400" /> 24/7 Моніторинг
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Серверний трекінг цін навіть при вимкненому комп'ютері</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs">
                      <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5 text-emerald-400" /> Telegram бот
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Миттєві сигнали прямо в особистий чат або групу</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs">
                      <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Персоналізація
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Приватне збереження ваших торгових сетапів</p>
                    </div>
                  </div>

                  {onOpenAuth && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAuth();
                      }}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 inline-flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>Увійти / Зареєструватися</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Action bar */}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => setShowCreateForm((prev) => !prev)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-900/30 transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{showCreateForm ? 'Сховати форму' : 'Нове сповіщення'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {triggeredAlerts.length > 0 && (
                        <button
                          onClick={handleClearTriggered}
                          className="text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 transition-colors"
                          title="Очистити список уже спрацьованих сповіщень"
                        >
                          Очистити спрацьовані ({triggeredAlerts.length})
                        </button>
                      )}
                      <button
                        onClick={() => fetchTelegramStatus()}
                        disabled={loadingAlerts}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title="Оновити список"
                      >
                        <RefreshCw className={`w-4 h-4 ${loadingAlerts ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

              {/* Create Alert Form Accordion */}
              {showCreateForm && (
                <form
                  onSubmit={handleCreateAlert}
                  className="p-4 rounded-xl bg-slate-950/90 border border-cyan-500/30 space-y-3 shadow-inner"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-cyan-400" />
                      Створити сповіщення ціни
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Telegram надішле повідомлення миттєво
                    </span>
                  </div>

                  {createErrorMsg && (
                    <div className="p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{createErrorMsg}</span>
                    </div>
                  )}

                  {createSuccessMsg && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{createSuccessMsg}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Symbol */}
                    <div>
                      <label className="block text-[11px] text-slate-400 font-medium mb-1">
                        Монета / Символ
                      </label>
                      <input
                        type="text"
                        value={formSymbol}
                        onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                        placeholder="BTCUSDT"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-semibold focus:outline-none focus:border-cyan-500"
                        required
                      />
                    </div>

                    {/* Exchange & Market */}
                    <div>
                      <label className="block text-[11px] text-slate-400 font-medium mb-1">
                        Біржа та тип
                      </label>
                      <div className="flex gap-1.5">
                        <select
                          value={formExchange}
                          onChange={(e) => setFormExchange(e.target.value as ExchangeId)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                        >
                          <option value="binance">Binance</option>
                          <option value="bybit">Bybit</option>
                        </select>
                        <select
                          value={formMarketType}
                          onChange={(e) => setFormMarketType(e.target.value as MarketType)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                        >
                          <option value="futures">Futures</option>
                          <option value="spot">Spot</option>
                        </select>
                      </div>
                    </div>

                    {/* Condition */}
                    <div>
                      <label className="block text-[11px] text-slate-400 font-medium mb-1">
                        Умова спрацювання
                      </label>
                      <select
                        value={formCondition}
                        onChange={(e) => setFormCondition(e.target.value as 'gte' | 'lte')}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-cyan-500"
                      >
                        <option value="gte">≥ Ціна піднялась або досягла</option>
                        <option value="lte">≤ Ціна опустилась або досягла</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Target Price */}
                    <div>
                      <label className="block text-[11px] text-slate-400 font-medium mb-1">
                        Цільова ціна ($)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={formTargetPrice}
                        onChange={(e) => setFormTargetPrice(e.target.value)}
                        placeholder="Наприклад: 78500"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
                        required
                      />
                    </div>

                    {/* Note / Label */}
                    <div>
                      <label className="block text-[11px] text-slate-400 font-medium mb-1">
                        Примітка (необов&apos;язково)
                      </label>
                      <input
                        type="text"
                        value={formNote}
                        onChange={(e) => setFormNote(e.target.value)}
                        placeholder="Наприклад: Пробій трикутника, тейк-профіт"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      Скасувати
                    </button>
                    <button
                      type="submit"
                      disabled={creatingAlert}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      {creatingAlert ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Створення...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Зберегти алерт</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Alerts List */}
              {loadingAlerts && alerts.length === 0 ? (
                <div className="py-12 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                  <span className="text-xs">Завантаження сповіщень...</span>
                </div>
              ) : alerts.length === 0 ? (
                <div className="py-10 text-center rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-6">
                  <Bell className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-slate-300 mb-1">
                    У вас ще немає встановлених сповіщень
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mb-3">
                    Створіть нове сповіщення кнопкою вище або в 1 клік на картці монети чи у вікні детального графіка формації.
                  </p>
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 text-xs font-medium hover:bg-cyan-600/30 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Створити перше сповіщення</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Active Alerts */}
                  {activeAlerts.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
                        Активні сповіщення ({activeAlerts.length})
                      </div>
                      {activeAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                alert.condition === 'gte'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {alert.condition === 'gte' ? (
                                <ArrowUpRight className="w-4 h-4" />
                              ) : (
                                <ArrowDownRight className="w-4 h-4" />
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold font-mono text-sm text-white">
                                  {alert.symbol}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                                  {alert.exchange} {alert.marketType}
                                </span>
                                {alert.levelType && alert.levelType !== 'custom' && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/50 font-medium">
                                    {alert.levelType === 'entry' ? 'Вхід' : alert.levelType === 'target' ? 'Ціль (TP)' : 'Стоп (SL)'}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <span>Умова:</span>
                                <span className="font-mono font-bold text-slate-200">
                                  {alert.condition === 'gte' ? '≥' : '≤'} ${formatCryptoPrice(alert.targetPrice)}
                                </span>
                                {alert.note && (
                                  <span className="text-slate-500 truncate ml-1">• {alert.note}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleToggleAlert(alert.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                              title="Призупинити сповіщення"
                            >
                              <Pause className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteAlert(alert.id)}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
                              title="Видалити сповіщення"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Paused Alerts */}
                  {pausedAlerts.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1">
                        Призупинені ({pausedAlerts.length})
                      </div>
                      {pausedAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 opacity-60 hover:opacity-100 transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 text-slate-500">
                              <Pause className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold font-mono text-sm text-slate-300">
                                {alert.symbol} {alert.condition === 'gte' ? '≥' : '≤'} ${formatCryptoPrice(alert.targetPrice)}
                              </div>
                              <div className="text-xs text-slate-500">Призупинено</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleToggleAlert(alert.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-colors"
                              title="Відновити сповіщення"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteAlert(alert.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
                              title="Видалити"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Triggered Alerts History */}
                  {triggeredAlerts.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex items-center justify-between px-1">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400/80 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3" />
                          Спрацювали та надіслані в Telegram ({triggeredAlerts.length})
                        </div>
                        <button
                          type="button"
                          onClick={handleClearTriggered}
                          className="px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 flex items-center gap-1 transition-colors cursor-pointer"
                          title="Видалити всі спрацьовані сповіщення"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Очистити всі</span>
                        </button>
                      </div>
                      {triggeredAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-emerald-950/20 border border-emerald-900/40 transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400">
                              <Check className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold font-mono text-sm text-emerald-300">
                                  {alert.symbol}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 font-medium">
                                  Виконано
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <span>Ціль: ${formatCryptoPrice(alert.targetPrice)}</span>
                                {alert.triggeredPrice && (
                                  <span className="text-emerald-400 font-mono">
                                    • Зафіксовано: ${formatCryptoPrice(alert.triggeredPrice)}
                                  </span>
                                )}
                                {alert.triggeredAt && (
                                  <span className="text-slate-500 text-[11px]">
                                    ({new Date(alert.triggeredAt).toLocaleTimeString('uk-UA')})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleToggleAlert(alert.id)}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                              title="Перезапустити сповіщення"
                            >
                              Перезапустити
                            </button>
                            <button
                              onClick={() => handleDeleteAlert(alert.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
                              title="Видалити"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB: NOTIFICATION HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {!user ? (
            <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800 text-center space-y-4 shadow-xl">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-400 mx-auto flex items-center justify-center">
                <Lock className="w-7 h-7 text-amber-400" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Історія сповіщень вимагає входу
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Увійдіть у свій обліковий запис, щоб переглядати історію всіх надісланих у Telegram сповіщень, збережених на сервері 24/7.
                </p>
              </div>
              {onOpenAuth && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAuth();
                  }}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 inline-flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Увійти / Зареєструватися</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Header & Controls */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <History className="w-4 h-4 text-cyan-400" />
                      Журнал спрацьованих сповіщень
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-xs font-semibold">
                      {history.length}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Серверне збереження: повідомлення фіксуються навіть після закриття вкладки або браузера.</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchHistory}
                    disabled={loadingHistory}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                    title="Оновити історію із сервера"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                    <span>Оновити</span>
                  </button>

                  {history.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearHistory}
                      disabled={clearingHistory}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                      title="Очистити всю історію"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Очистити все</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Loading State */}
              {loadingHistory && history.length === 0 && (
                <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-slate-800/60 space-y-2">
                  <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-slate-400">Завантаження журналу сповіщень із сервера...</p>
                </div>
              )}

              {/* Empty History */}
              {!loadingHistory && history.length === 0 && (
                <div className="p-8 text-center rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mx-auto flex items-center justify-center">
                    <History className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div className="max-w-sm mx-auto space-y-1">
                    <h4 className="text-sm font-bold text-white">Історія сповіщень порожня</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Коли ринкова ціна монети досягне встановленої цілі, сервер миттєво відправить сповіщення у ваш Telegram і зафіксує запис тут.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('alerts')}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Створити перше сповіщення</span>
                  </button>
                </div>
              )}

              {/* History Items List */}
              {history.length > 0 && (
                <div className="space-y-2">
                  {history.map((item) => {
                    const isGte = item.condition === 'gte';
                    const isSent = Boolean(item.telegramSent || item.telegramStatus === 'sent');
                    const isReactivating = reactivatingId === item.id;
                    const dateStr = new Date(item.triggeredAt).toLocaleString('uk-UA', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isSent
                            ? 'bg-slate-900/60 border-slate-800/90 hover:border-slate-700'
                            : 'bg-rose-950/10 border-rose-900/30'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          {/* Left Info */}
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                                isSent
                                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                                  : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                              }`}
                            >
                              {isSent ? <Send className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                            </div>

                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold font-mono text-sm text-white">
                                  {item.symbol}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase font-semibold">
                                  {item.exchange}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400">
                                  {item.marketType === 'futures' ? "Ф'ючерси" : 'Спот'}
                                </span>

                                {/* Telegram status pill */}
                                {isSent ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-medium">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    Надіслано в Telegram
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-medium">
                                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                                    Помилка доставки
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
                                <span className="flex items-center gap-1 font-mono">
                                  <span className="text-slate-400">Ціль:</span>
                                  <span className={isGte ? 'text-emerald-400' : 'text-rose-400'}>
                                    {isGte ? '≥' : '≤'} ${formatCryptoPrice(item.targetPrice)}
                                  </span>
                                </span>

                                {item.triggeredPrice && (
                                  <span className="flex items-center gap-1 font-mono">
                                    <span className="text-slate-400">Спрацювало на:</span>
                                    <span className="text-amber-300 font-bold">
                                      ${formatCryptoPrice(item.triggeredPrice)}
                                    </span>
                                  </span>
                                )}

                                <span className="text-slate-500 text-[11px] flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-500" />
                                  {dateStr}
                                </span>
                              </div>

                              {(item.formationName || item.note || item.telegramError) && (
                                <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 pt-0.5">
                                  {item.formationName && (
                                    <span className="px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/50 text-cyan-300 text-[11px]">
                                      {item.formationName}
                                    </span>
                                  )}
                                  {item.note && (
                                    <span className="italic text-slate-400">
                                      "{item.note}"
                                    </span>
                                  )}
                                  {item.telegramError && (
                                    <span className="text-rose-400 text-[11px]">
                                      Помилка: {item.telegramError}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right Actions */}
                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-1 sm:pt-0">
                            <button
                              type="button"
                              onClick={() => handleReactivateAlert(item)}
                              disabled={isReactivating}
                              className="px-2.5 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                              title="Відновити це сповіщення знову"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${isReactivating ? 'animate-spin' : ''}`} />
                              <span>{isReactivating ? 'Відновлення...' : 'Відновити'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteHistoryItem(item.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/30 transition-all cursor-pointer"
                              title="Видалити з історії"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 2: TELEGRAM BOT SETUP */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              {/* Instructions Guide */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  Як підключити свій Telegram без помилок
                </h3>

                <div className="space-y-2.5 text-xs text-slate-300">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      1
                    </span>
                    <div>
                      <span>Створіть бота у </span>
                      <a
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 font-semibold underline hover:text-cyan-300 inline-flex items-center gap-0.5"
                      >
                        @BotFather <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      <span> (команда <code>/newbot</code>, введіть ім'я та отримайте <b>Bot Token</b>). Вставте токен у поле нижче.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      2
                    </span>
                    <div>
                      <span className="text-amber-300 font-semibold">Важливо: Chat ID — це ВАШ особистий ID, а не ID чи назва бота! </span>
                      <span>(Бот не може писати сам собі або іншим ботам).</span>
                      <div className="mt-1 text-slate-400">
                        • Відкрийте вашого створеного бота в Telegram та натисніть <b>START</b> (/start).<br />
                        • Після цього натисніть жовту кнопку <b>«⚡ Автоматично визначити мій Chat ID»</b> нижче, і система сама знайде ваш ID!<br />
                        • Або дізнайтесь його через{' '}
                        <a
                          href="https://t.me/userinfobot"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 font-semibold underline hover:text-cyan-300 inline-flex items-center gap-0.5"
                        >
                          @userinfobot <ExternalLink className="w-2.5 h-2.5" />
                        </a>.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      3
                    </span>
                    <div>
                      <span>Натисніть <b>«Надіслати тестове сповіщення»</b>. Бот миттєво надішле тестовий сигнал!</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feedback Test Result */}
              {testResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                    testResult.success
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                      : 'bg-rose-500/15 border-rose-500/30 text-rose-200'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <span className="font-semibold block">{testResult.success ? 'Успіх!' : 'Помилка підключення'}</span>
                    <p className="whitespace-pre-line leading-relaxed">{testResult.message}</p>
                  </div>
                </div>
              )}

              {/* Telegram Form */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
                {/* Bot Token field */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-300">
                      Telegram Bot Token
                    </label>
                    {tgStatus?.botUsername && (
                      <a
                        href={`https://t.me/${tgStatus.botUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
                      >
                        Відкрити @{tgStatus.botUsername} в Telegram <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder={tgStatus?.hasEnvToken ? 'Налаштовано в .env (або введіть для перевизначення)' : '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ'}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-10 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Отримується від @BotFather (рядок з цифрами та двокрапкою).
                  </p>
                </div>

                {/* Chat ID field with Auto-Detect */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-300">
                      Telegram Chat ID (Ваш особистий ID)
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Не плутати з ID бота!
                    </span>
                  </div>

                  {(() => {
                    const botIdFromToken = botToken.trim().split(':')[0]?.trim();
                    const isBotId = Boolean(botIdFromToken && chatId.trim() && chatId.trim() === botIdFromToken);

                    return (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={chatId}
                          onChange={(e) => setChatId(e.target.value)}
                          placeholder={tgStatus?.hasEnvChatId ? 'Налаштовано в .env (або введіть для перевизначення)' : 'Наприклад: 987654321'}
                          className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none ${
                            isBotId ? 'border-rose-500 text-rose-300' : 'border-slate-700 focus:border-cyan-500'
                          }`}
                        />

                        {/* Bot ID Warning */}
                        {isBotId && (
                          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5 animate-pulse">
                            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <span className="font-bold block">Увага: Ви ввели ID бота ({chatId})!</span>
                              <p className="text-[11px] text-rose-300">
                                Саме через це Telegram повертає <code>«Forbidden: the bot can't send messages to the bot»</code>.
                                Бот не може надсилати повідомлення самому собі.
                              </p>
                              <p className="text-[11px] text-slate-300 pt-1">
                                👉 Натисніть кнопку нижче або відкрийте{' '}
                                <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="underline font-bold text-cyan-300">
                                  @userinfobot
                                </a>{' '}
                                щоб вставити ваш справжній ID.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Detected User Badge */}
                        {detectedUser && (
                          <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>
                              Визначено: <b>{detectedUser.firstName || 'Користувач'}</b> {detectedUser.username ? `(@${detectedUser.username})` : ''} • ID: <code className="font-mono font-bold text-emerald-300">{detectedUser.chatId}</code>
                            </span>
                          </div>
                        )}

                        {/* Auto-detect button */}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={handleDetectChatId}
                            disabled={detectingChatId || !botToken.trim()}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                          >
                            <Zap className={`w-3.5 h-3.5 ${detectingChatId ? 'animate-spin text-amber-400' : 'text-amber-400 fill-amber-400'}`} />
                            <span>{detectingChatId ? 'Шукаємо повідомлення від вас у боті...' : '⚡ Автоматично визначити мій Chat ID'}</span>
                          </button>
                          <p className="text-[10px] text-slate-500 text-center mt-1">
                            (Перед натисканням перейдіть у чат з ботом у Telegram та натисніть «START»)
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={handleTestTelegram}
                    disabled={testingConnection}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-sky-300 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Send className={`w-3.5 h-3.5 ${testingConnection ? 'animate-pulse' : ''}`} />
                    <span>{testingConnection ? 'Надсилання...' : 'Надіслати тестове сповіщення'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveTelegramConfig}
                    disabled={savingConfig}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-900/30 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {savingConfig ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Збереження...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Зберегти налаштування</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

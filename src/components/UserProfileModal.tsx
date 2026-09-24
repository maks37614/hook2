import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Mail,
  Send,
  Sliders,
  Bell,
  LogOut,
  Save,
  CheckCircle2,
  AlertCircle,
  Key,
  MessageSquare,
  Sparkles,
  ExternalLink,
  Shield,
  FolderArchive,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertsContext';
import { useArchive } from '../context/ArchiveContext';
import { ExchangeId, MarketType, Timeframe } from '../types';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAlerts?: () => void;
  onOpenArchive?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  onOpenAlerts,
  onOpenArchive,
}) => {
  const { user, profile, updateProfileData, logout } = useAuth();
  const { alerts, activeAlertsCount } = useAlerts();
  const { archiveCount } = useArchive();

  const [displayName, setDisplayName] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [defaultExchange, setDefaultExchange] = useState<'all' | ExchangeId>('all');
  const [defaultMarketType, setDefaultMarketType] = useState<'all' | MarketType>('all');
  const [defaultTimeframe, setDefaultTimeframe] = useState<Timeframe>('1h');
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Test notification & auto-detect state
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isDetectingChatId, setIsDetectingChatId] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || user?.displayName || '');
      setTelegramBotToken(profile.telegramBotToken || '');
      setTelegramChatId(profile.telegramChatId || '');
      setDefaultExchange(profile.defaultExchange || 'all');
      setDefaultMarketType(profile.defaultMarketType || 'all');
      setDefaultTimeframe(profile.defaultTimeframe || '1h');
      setSoundAlertsEnabled(profile.soundAlertsEnabled !== undefined ? profile.soundAlertsEnabled : true);
    }
  }, [profile, user]);

  if (!isOpen || !user) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      await updateProfileData({
        displayName: displayName.trim() || user.email?.split('@')[0] || 'Користувач',
        telegramBotToken: telegramBotToken.trim(),
        telegramChatId: telegramChatId.trim(),
        defaultExchange,
        defaultMarketType,
        defaultTimeframe,
        soundAlertsEnabled,
      });

      // Also sync alerts with backend monitor so any updated Telegram token is applied
      fetch('/api/alerts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          telegramBotToken: telegramBotToken.trim(),
          telegramChatId: telegramChatId.trim(),
          alerts,
        }),
      }).catch(() => {});

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Не вдалося зберегти профіль');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoDetectChatId = async () => {
    const cleanToken = telegramBotToken.trim();
    if (!cleanToken) {
      setErrorMessage('Спочатку введіть Bot Token вашого Telegram бота');
      return;
    }

    setIsDetectingChatId(true);
    setErrorMessage(null);
    setTestResult(null);

    try {
      const res = await fetch('/api/telegram/detect-chat-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: cleanToken }),
      });
      const data = await res.json();
      if (data.success && data.chatId) {
        setTelegramChatId(String(data.chatId));
        setTestResult({
          success: true,
          message: `✅ Знайдено Chat ID: ${data.chatId}${data.username ? ` (@${data.username})` : ''}`,
        });
      } else {
        setErrorMessage(
          data.error ||
            'Не знайдено активних повідомлень. Відкрийте бота в Telegram, натисніть START або надішліть будь-яке повідомлення і повторіть пошук.'
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Помилка виявлення Chat ID');
    } finally {
      setIsDetectingChatId(false);
    }
  };

  const handleSendTestNotification = async () => {
    const cleanToken = telegramBotToken.trim();
    const cleanChatId = telegramChatId.trim();

    if (!cleanToken || !cleanChatId) {
      setErrorMessage('Введіть і збережіть Bot Token та Chat ID перед тестуванням');
      return;
    }

    setIsTestingTelegram(true);
    setErrorMessage(null);
    setTestResult(null);

    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: cleanToken,
          chatId: cleanChatId,
          customMessage: `🔔 Привіт, ${displayName || 'Трейдер'}!\nЦе тестове сповіщення з вашого особистого профілю SignalHook.\nВсі налаштування сповіщень збережено та прив'язано до вашого акаунту!`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          message: '✅ Тестове сповіщення успішно надіслано у ваш Telegram чат!',
        });
      } else {
        setErrorMessage(data.error || 'Не вдалося доставити тестове повідомлення');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Помилка надсилання тестового сповіщення');
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  const initialLetter = (displayName || user.email || 'U')[0].toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-cyan-950/20 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-cyan-950/30">
              {initialLetter}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  {displayName || 'Особистий профіль'}
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  ПРОФІЛЬ
                </span>
                {profile?.inviteCode && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Key className="w-2.5 h-2.5" />
                    <span>КОД: {profile.inviteCode}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">{user.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
            <div
              onClick={() => {
                onClose();
                onOpenAlerts?.();
              }}
              className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Мої сповіщення</span>
                <Bell className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-bold font-mono text-white">
                  {alerts.length}
                </span>
                <span className="text-[11px] text-emerald-400">
                  ({activeAlertsCount} активних)
                </span>
              </div>
            </div>

            <div
              onClick={() => {
                onClose();
                onOpenArchive?.();
              }}
              className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-purple-500/50 cursor-pointer transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Мій архів формацій</span>
                <FolderArchive className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-bold font-mono text-white">
                  {archiveCount}
                </span>
                <span className="text-[11px] text-purple-400">
                  збережено
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Статус Telegram</span>
                <Send className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                {telegramBotToken && telegramChatId ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-400">
                      Підключено
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-xs font-semibold text-amber-400">
                      Не налаштовано
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Privacy & Data Isolation Banner */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start gap-2.5 text-xs text-slate-400">
            <Shield className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-300 block mb-0.5">
                Індивідуальна ізоляція профілю
              </span>
              <span>
                Ваш архів збережених формацій, індивідуальні Telegram-сповіщення, зв'язка MetaScalp та список обраних монет надійно закріплені виключно за вашим обліковим записом.
              </span>
            </div>
          </div>

          {/* Feedback messages */}
          {saveSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Зміни профілю та налаштування збережено успішно!</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 animate-in fade-in ${
                testResult.success
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{testResult.message}</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-5">
            {/* Section 1: User Identity */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                <span>Дані профілю</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Ім'я або позивний
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ваше ім'я"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Email
                  </label>
                  <input
                    type="text"
                    disabled
                    value={user.email || ''}
                    className="w-full bg-slate-950/50 border border-slate-800/60 rounded-xl px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Personal Telegram Bot */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-sky-400" />
                  <span>Особистий Telegram бот для сповіщень</span>
                </div>
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
                >
                  <span>Створити бота (@BotFather)</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Сповіщення про цінові рівні та формації надходитимуть особисто вам у Telegram.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                  <span>Telegram Bot Token</span>
                  <span className="text-[10px] text-slate-500 font-mono">123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11</span>
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    placeholder="Вставте токен бота від @BotFather"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                  <span>Ваш особистий Chat ID</span>
                  <span className="text-[10px] text-slate-500">ID вашого діалогу з ботом</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MessageSquare className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      placeholder="Наприклад: 987654321"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoDetectChatId}
                    disabled={isDetectingChatId || !telegramBotToken.trim()}
                    className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                    title="Шукає останнє повідомлення, надіслане вами боту"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isDetectingChatId ? 'Пошук...' : 'Знайти ID'}</span>
                  </button>
                </div>
              </div>

              {telegramBotToken && telegramChatId && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleSendTestNotification}
                    disabled={isTestingTelegram}
                    className="w-full py-2 px-3 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isTestingTelegram ? 'Надсилання...' : '🔔 Надіслати тестове сповіщення у мій Telegram'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Section 3: User Default Preferences */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>Індивідуальні налаштування інтерфейсу</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Біржа за замовчуванням
                  </label>
                  <select
                    value={defaultExchange}
                    onChange={(e) => setDefaultExchange(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="all">Всі біржі</option>
                    <option value="binance">Binance</option>
                    <option value="bybit">Bybit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Ринок за замовчуванням
                  </label>
                  <select
                    value={defaultMarketType}
                    onChange={(e) => setDefaultMarketType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="all">Всі ринки</option>
                    <option value="futures">Ф'ючерси (Futures)</option>
                    <option value="spot">Спот (Spot)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Таймфрейм за замовчуванням
                  </label>
                  <select
                    value={defaultTimeframe}
                    onChange={(e) => setDefaultTimeframe(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="5m">5 хвилин</option>
                    <option value="15m">15 хвилин</option>
                    <option value="1h">1 година</option>
                    <option value="4h">4 години</option>
                    <option value="1d">1 день</option>
                  </select>
                </div>
              </div>

              {/* Sound toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <Bell className="w-4 h-4 text-cyan-400" />
                  <div>
                    <span className="text-xs font-semibold text-white block">
                      Звукові сповіщення в браузері
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Відтворювати звуковий сигнал при спрацюванні алерту
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={soundAlertsEnabled}
                  onChange={(e) => setSoundAlertsEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-500 focus:ring-0 bg-slate-900 border-slate-700 cursor-pointer"
                />
              </div>
            </div>

            {/* Save Buttons */}
            <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-900 text-slate-400 hover:text-rose-400 text-xs font-semibold transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Вийти з акаунту</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 font-semibold transition-colors cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-lg shadow-cyan-950/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Збереження...' : 'Зберегти зміни'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

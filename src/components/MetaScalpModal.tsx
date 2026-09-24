import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  ExternalLink,
  Settings2,
  Layers,
  HelpCircle,
} from 'lucide-react';
import {
  MetaScalpSettings,
  saveStoredMetaScalpSettings,
  pingMetaScalpPort,
  findActiveMetaScalpPort,
  sendTickerToMetaScalp,
} from '../utils/metaScalpService';

interface MetaScalpModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: MetaScalpSettings;
  onSettingsChange: (newSettings: MetaScalpSettings) => void;
  currentSymbol?: string;
}

const PRESET_BINDINGS = ['001', '002', '003', '004', '005'];

export const MetaScalpModal: React.FC<MetaScalpModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  currentSymbol = 'BTCUSDT',
}) => {
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [activePort, setActivePort] = useState<number>(settings.port);
  const [customBinding, setCustomBinding] = useState<string>(settings.binding);
  const [copiedTestTicker, setCopiedTestTicker] = useState<boolean>(false);

  useEffect(() => {
    setCustomBinding(settings.binding);
    setActivePort(settings.port);
  }, [settings]);

  if (!isOpen) return null;

  // Run ping test
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestStatus('idle');
    setTestMessage('Сканування локального сервера MetaScalp (17845-17855)...');

    try {
      const foundPort = await findActiveMetaScalpPort(settings.port);
      if (foundPort) {
        setActivePort(foundPort);
        const updated = { ...settings, port: foundPort };
        onSettingsChange(updated);
        saveStoredMetaScalpSettings(updated);
        setTestStatus('success');
        setTestMessage(`З'єднання встановлено! MetaScalp активний на порту ${foundPort}`);
      } else {
        setTestStatus('error');
        setTestMessage(
          `Не вдалося підключитися до 127.0.0.1:${settings.port}. Переконайтеся, що термінал MetaScalp запущений на вашому комп'ютері.`
        );
      }
    } catch (e: any) {
      setTestStatus('error');
      setTestMessage(`Помилка перевірки: ${e.message || 'Сервер не відповів'}`);
    } finally {
      setIsTesting(false);
    }
  };

  // Test sending current ticker
  const handleSendTestTicker = async () => {
    setIsTesting(true);
    try {
      const res = await sendTickerToMetaScalp(currentSymbol, 'binance', 'futures', {
        port: activePort,
        binding: customBinding,
      });

      if (res.success) {
        setTestStatus('success');
        setTestMessage(`Успіх! ${res.message}`);
      } else {
        setTestStatus('error');
        setTestMessage(
          `MetaScalp не прийняв команду на 127.0.0.1:${activePort}. ${
            res.copiedToClipboard ? 'Тікер скопійовано в буфер обміну.' : ''
          }`
        );
      }
    } catch (e: any) {
      setTestStatus('error');
      setTestMessage(e.message || 'Помилка відправки');
    } finally {
      setIsTesting(false);
    }
  };

  const handleUpdateBinding = (val: string) => {
    setCustomBinding(val);
    const updated = { ...settings, binding: val };
    onSettingsChange(updated);
    saveStoredMetaScalpSettings(updated);
  };

  const handleToggleAutoSwitch = () => {
    const updated = { ...settings, autoSwitchOnClick: !settings.autoSwitchOnClick };
    onSettingsChange(updated);
    saveStoredMetaScalpSettings(updated);
  };

  const handleToggleEnabled = () => {
    const updated = { ...settings, enabled: !settings.enabled };
    onSettingsChange(updated);
    saveStoredMetaScalpSettings(updated);
  };

  const handlePortChange = (newPort: number) => {
    setActivePort(newPort);
    const updated = { ...settings, port: newPort };
    onSettingsChange(updated);
    saveStoredMetaScalpSettings(updated);
  };

  const testTickerStr = `BINANCE:${currentSymbol}.p`;

  const copyTestTicker = () => {
    navigator.clipboard.writeText(testTickerStr);
    setCopiedTestTicker(true);
    setTimeout(() => setCopiedTestTicker(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Лінковка з MetaScalp</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Terminal Link
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Синхронізація стаканів і графіків терміналу в 1 клік
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 text-xs text-slate-300">
          {/* Main Master Switch */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <div>
              <span className="font-semibold text-white block">Інтеграція з MetaScalp</span>
              <span className="text-[11px] text-slate-400">
                Швидкі кнопки перемикання монет у картках, таблиці та модальному вікні
              </span>
            </div>
            <button
              onClick={handleToggleEnabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.enabled ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Connection Status & Ping */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">Статус підключення:</span>
              <div className="flex items-center gap-1.5 font-mono text-xs">
                {testStatus === 'success' ? (
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Активно (127.0.0.1:{activePort})
                  </span>
                ) : testStatus === 'error' ? (
                  <span className="flex items-center gap-1 text-rose-400 font-semibold">
                    <AlertCircle className="w-3.5 h-3.5" /> Немає зв'язку
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Очікування (127.0.0.1:{activePort})
                  </span>
                )}
              </div>
            </div>

            {testMessage && (
              <div
                className={`p-2.5 rounded-lg text-[11px] ${
                  testStatus === 'success'
                    ? 'bg-emerald-950/30 border border-emerald-800/60 text-emerald-300'
                    : testStatus === 'error'
                    ? 'bg-rose-950/30 border border-rose-800/60 text-rose-300'
                    : 'bg-slate-900 border border-slate-800 text-slate-300'
                }`}
              >
                {testMessage}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors text-xs border border-slate-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>Перевірити з'єднання</span>
              </button>
              <button
                onClick={handleSendTestTicker}
                disabled={isTesting}
                className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold transition-colors text-xs border border-amber-500/30"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Тест ({currentSymbol})</span>
              </button>
            </div>
          </div>

          {/* Binding Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
              <span>Група лінковки (Binding Group):</span>
              <span className="text-[11px] text-slate-400 font-normal">001 — 500</span>
            </label>
            <div className="flex items-center gap-2">
              {PRESET_BINDINGS.map((b) => (
                <button
                  key={b}
                  onClick={() => handleUpdateBinding(b)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border ${
                    customBinding === b
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {b}
                </button>
              ))}
              <div className="w-20">
                <input
                  type="text"
                  maxLength={3}
                  value={customBinding}
                  onChange={(e) => handleUpdateBinding(e.target.value)}
                  placeholder="001"
                  className="w-full text-center py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Вкажіть у MetaScalp цей же номер групи на стакані або графіку для синхронізації.
            </p>
          </div>

          {/* Auto-switch on click */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <div>
              <span className="font-semibold text-white block">Автоперемикання при виборі</span>
              <span className="text-[11px] text-slate-400">
                Миттєво надсилати монету в MetaScalp при кліку на картку чи рядок таблиці
              </span>
            </div>
            <button
              onClick={handleToggleAutoSwitch}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.autoSwitchOnClick ? 'bg-cyan-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.autoSwitchOnClick ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Port Settings & Manual Copy Fallback */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Локальний порт:</span>
              <input
                type="number"
                value={activePort}
                onChange={(e) => handlePortChange(parseInt(e.target.value) || 17845)}
                className="w-20 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-200 text-center"
              />
            </div>

            <button
              onClick={copyTestTicker}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-300 py-1 px-2 rounded bg-slate-950 border border-slate-800 transition-colors"
              title="Скопіювати формат тікера для ручної вставки"
            >
              <Copy className="w-3 h-3" />
              <span>{copiedTestTicker ? 'Скопійовано!' : `Копіювати (${testTickerStr})`}</span>
            </button>
          </div>

          {/* Help Box */}
          <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 text-[11px] space-y-1.5 text-slate-400">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
              <span>Як налаштувати MetaScalp:</span>
            </div>
            <p>
              1. Запустіть <strong>MetaScalp</strong> на цьому комп'ютері. Локальний API (порт 17845) активний автоматично.
            </p>
            <p>
              2. У MetaScalp встановіть групу лінковки (наприклад, <strong>001</strong>) на потрібних стаканах чи графіках.
            </p>
            <p>
              3. Клікайте на кнопку <strong>⚡ MetaScalp</strong> або на будь-яку монету в скрінері — термінал миттєво переключиться на обраний інструмент.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-800/80 bg-slate-950/60">
          <a
            href="https://metascalp.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"
          >
            <span>Офіційний сайт MetaScalp</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors shadow-sm"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};

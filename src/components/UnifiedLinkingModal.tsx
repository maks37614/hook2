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
  Cpu,
  Radio,
  Share2,
  Globe,
  Sliders,
} from 'lucide-react';
import {
  UnifiedLinkingSettings,
  saveStoredUnifiedLinkingSettings,
  pingLocalPort,
  sendTickerToUnifiedTerminals,
  TerminalTarget,
} from '../utils/terminalLinkingService';
import { useAuth } from '../context/AuthContext';

interface UnifiedLinkingModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UnifiedLinkingSettings;
  onSettingsChange: (newSettings: UnifiedLinkingSettings) => void;
  currentSymbol?: string;
}

const METASCALP_BINDINGS = ['001', '002', '003', '004', '005'];
const VATAGA_BINDINGS = ['1', '2', '3', '4', '5'];
const TIGER_BINDINGS = ['1', '2', '3', '4', 'A', 'B', 'C', 'D'];

export const UnifiedLinkingModal: React.FC<UnifiedLinkingModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  currentSymbol = 'BTCUSDT',
}) => {
  const { user, profile, updateProfileData } = useAuth();
  const [activeTab, setActiveTab] = useState<'target' | 'metascalp' | 'vataga' | 'tiger' | 'railway'>('target');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);

  // Local state for smooth edits
  const [currentSettings, setCurrentSettings] = useState<UnifiedLinkingSettings>(settings);

  useEffect(() => {
    setCurrentSettings(settings);
  }, [settings]);

  if (!isOpen) return null;

  const handleUpdate = (updated: UnifiedLinkingSettings) => {
    setCurrentSettings(updated);
    onSettingsChange(updated);
    saveStoredUnifiedLinkingSettings(updated, user?.uid);
    if (user) {
      updateProfileData({ unifiedLinkingSettings: updated }).catch(() => {});
    }
  };

  const handleSetTarget = (target: TerminalTarget) => {
    handleUpdate({ ...currentSettings, activeTarget: target });
  };

  // Test connection to terminal port
  const handleTestPort = async (terminal: 'metascalp' | 'vataga' | 'tiger') => {
    setIsTesting(true);
    setTestResult(null);
    setTestSuccess(null);

    const port = currentSettings[terminal].port;
    try {
      const isOnline = await pingLocalPort(port);
      if (isOnline) {
        setTestSuccess(true);
        setTestResult(`Порт ${port} активний! З'єднання з ${terminal.toUpperCase()} успішне.`);
      } else {
        setTestSuccess(false);
        setTestResult(`Порт ${port} не відповідає. Запустіть ${terminal.toUpperCase()} на вашому комп'ютері.`);
      }
    } catch (e: any) {
      setTestSuccess(false);
      setTestResult(`Помилка перевірки: ${e.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  // Test sending current ticker
  const handleSendTestTicker = async () => {
    setIsTesting(true);
    setTestResult(null);
    setTestSuccess(null);

    try {
      const res = await sendTickerToUnifiedTerminals(currentSymbol, 'binance', 'futures', currentSettings);
      setTestSuccess(res.success || res.copiedToClipboard);
      setTestResult(
        res.success
          ? res.summaryMessage
          : `${res.summaryMessage} (У буфері: ${res.primaryTicker})`
      );
    } catch (err: any) {
      setTestSuccess(false);
      setTestResult(`Помилка: ${err.message || 'Не вдалося відправити'}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
              <Zap className="w-5 h-5 fill-amber-400/20" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Об'єднана Лінковка Терміналів
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-mono font-bold">
                  Railway & Web
                </span>
              </div>
              <p className="text-xs text-slate-400">
                MetaScalp, Vataga (EasyScalp) та TigerTrade в одному кліку
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 bg-slate-950/90 border-b border-slate-800 text-xs overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('target')}
            className={`px-3 py-2 rounded-lg font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'target'
                ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Активний термінал</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('metascalp')}
            className={`px-3 py-2 rounded-lg font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'metascalp'
                ? 'bg-slate-800 text-amber-300 shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>MetaScalp</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('vataga')}
            className={`px-3 py-2 rounded-lg font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'vataga'
                ? 'bg-slate-800 text-emerald-300 shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Vataga</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tiger')}
            className={`px-3 py-2 rounded-lg font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'tiger'
                ? 'bg-slate-800 text-rose-300 shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-rose-400" />
            <span>TigerTrade</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('railway')}
            className={`px-3 py-2 rounded-lg font-semibold transition-all flex items-center gap-1.5 shrink-0 ml-auto ${
              activeTab === 'railway'
                ? 'bg-slate-800 text-purple-300 shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-purple-400" />
            <span>Railway Гайд</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* TAB 1: Target Selector & General */}
          {activeTab === 'target' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
                  Куди передавати тікери при кліку:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSetTarget('metascalp')}
                    className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      currentSettings.activeTarget === 'metascalp'
                        ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-md shadow-amber-500/10'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      {currentSettings.activeTarget === 'metascalp' && (
                        <CheckCircle2 className="w-4 h-4 text-amber-400" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200">MetaScalp</div>
                      <div className="text-[10px] text-slate-400 font-mono">Група {currentSettings.metascalp.binding}</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetTarget('vataga')}
                    className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      currentSettings.activeTarget === 'vataga'
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-md shadow-emerald-500/10'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Layers className="w-4 h-4 text-emerald-400" />
                      {currentSettings.activeTarget === 'vataga' && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200">Vataga</div>
                      <div className="text-[10px] text-slate-400 font-mono">Група {currentSettings.vataga.binding}</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetTarget('tiger')}
                    className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      currentSettings.activeTarget === 'tiger'
                        ? 'bg-rose-500/15 border-rose-500/50 text-white shadow-md shadow-rose-500/10'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Cpu className="w-4 h-4 text-rose-400" />
                      {currentSettings.activeTarget === 'tiger' && (
                        <CheckCircle2 className="w-4 h-4 text-rose-400" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200">TigerTrade</div>
                      <div className="text-[10px] text-slate-400 font-mono">Група {currentSettings.tiger.binding}</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetTarget('all')}
                    className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      currentSettings.activeTarget === 'all'
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-white shadow-md shadow-cyan-500/10'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Share2 className="w-4 h-4 text-cyan-400" />
                      {currentSettings.activeTarget === 'all' && (
                        <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-cyan-300">Всі термінали</div>
                      <div className="text-[10px] text-slate-400">Одночасно у 3</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Behavior Settings */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-slate-200">
                      Автоперемикання при кліку на монету
                    </span>
                    <p className="text-[11px] text-slate-400">
                      При кліку на рядок скрінера чи карточку тікер миттєво відправляється у вибраний термінал
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdate({ ...currentSettings, autoSwitchOnClick: !currentSettings.autoSwitchOnClick })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      currentSettings.autoSwitchOnClick ? 'bg-cyan-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${
                        currentSettings.autoSwitchOnClick ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-slate-800/60 pt-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-slate-200">
                      Звуковий відгук при перемиканні
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Відтворювати короткий клік при успішній передачі тікера
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdate({ ...currentSettings, soundFeedback: !currentSettings.soundFeedback })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      currentSettings.soundFeedback ? 'bg-cyan-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${
                        currentSettings.soundFeedback ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: METASCALP SETTINGS */}
          {activeTab === 'metascalp' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <div className="flex items-center gap-2.5">
                  <Zap className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="text-xs font-bold text-white">Підключення MetaScalp (CScalp)</h3>
                    <p className="text-[11px] text-amber-200/80">Стандартний порт 17845 (або 17845-17855)</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdate({
                      ...currentSettings,
                      metascalp: { ...currentSettings.metascalp, enabled: !currentSettings.metascalp.enabled },
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    currentSettings.metascalp.enabled
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {currentSettings.metascalp.enabled ? 'Увімкнено' : 'Вимкнено'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    HTTP Порт локального API:
                  </label>
                  <input
                    type="number"
                    value={currentSettings.metascalp.port}
                    onChange={(e) =>
                      handleUpdate({
                        ...currentSettings,
                        metascalp: { ...currentSettings.metascalp, port: parseInt(e.target.value, 10) || 17845 },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">За замовчуванням: 17845</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Колір / Група лінковки (Binding):
                  </label>
                  <div className="flex items-center gap-1.5">
                    {METASCALP_BINDINGS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() =>
                          handleUpdate({
                            ...currentSettings,
                            metascalp: { ...currentSettings.metascalp, binding: b },
                          })
                        }
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                          currentSettings.metascalp.binding === b
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={currentSettings.metascalp.binding}
                    onChange={(e) =>
                      handleUpdate({
                        ...currentSettings,
                        metascalp: { ...currentSettings.metascalp, binding: e.target.value },
                      })
                    }
                    placeholder="Власна група (напр. 001)"
                    className="w-full mt-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-amber-300 font-mono"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleTestPort('metascalp')}
                disabled={isTesting}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer border border-amber-500/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>Перевірити з'єднання з MetaScalp (порт {currentSettings.metascalp.port})</span>
              </button>
            </div>
          )}

          {/* TAB 3: VATAGA (EASYSCALP) SETTINGS */}
          {activeTab === 'vataga' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex items-center gap-2.5">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h3 className="text-xs font-bold text-white">Підключення Vataga (EasyScalp)</h3>
                    <p className="text-[11px] text-emerald-200/80">Стандартний порт 17840</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdate({
                      ...currentSettings,
                      vataga: { ...currentSettings.vataga, enabled: !currentSettings.vataga.enabled },
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    currentSettings.vataga.enabled
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {currentSettings.vataga.enabled ? 'Увімкнено' : 'Вимкнено'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    HTTP Порт локального API Vataga:
                  </label>
                  <input
                    type="number"
                    value={currentSettings.vataga.port}
                    onChange={(e) =>
                      handleUpdate({
                        ...currentSettings,
                        vataga: { ...currentSettings.vataga, port: parseInt(e.target.value, 10) || 17840 },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">За замовчуванням: 17840</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Група лінковки Vataga:
                  </label>
                  <div className="flex items-center gap-1.5">
                    {VATAGA_BINDINGS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() =>
                          handleUpdate({
                            ...currentSettings,
                            vataga: { ...currentSettings.vataga, binding: b },
                          })
                        }
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                          currentSettings.vataga.binding === b
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={currentSettings.vataga.binding}
                    onChange={(e) =>
                      handleUpdate({
                        ...currentSettings,
                        vataga: { ...currentSettings.vataga, binding: e.target.value },
                      })
                    }
                    placeholder="Власна група (напр. 1 або 01)"
                    className="w-full mt-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-emerald-300 font-mono"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleTestPort('vataga')}
                disabled={isTesting}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer border border-emerald-500/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>Перевірити з'єднання з Vataga (порт {currentSettings.vataga.port})</span>
              </button>
            </div>
          )}

          {/* TAB 4: TIGER TRADE SETTINGS */}
          {activeTab === 'tiger' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30">
                <div className="flex items-center gap-2.5">
                  <Cpu className="w-5 h-5 text-rose-400" />
                  <div>
                    <h3 className="text-xs font-bold text-white">Підключення TigerTrade (Tiger)</h3>
                    <p className="text-[11px] text-rose-200/80">Стандартний порт 9898 (або 16888)</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdate({
                      ...currentSettings,
                      tiger: { ...currentSettings.tiger, enabled: !currentSettings.tiger.enabled },
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    currentSettings.tiger.enabled
                      ? 'bg-rose-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {currentSettings.tiger.enabled ? 'Увімкнено' : 'Вимкнено'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    HTTP Порт API TigerTrade:
                  </label>
                  <input
                    type="number"
                    value={currentSettings.tiger.port}
                    onChange={(e) =>
                      handleUpdate({
                        ...currentSettings,
                        tiger: { ...currentSettings.tiger, port: parseInt(e.target.value, 10) || 9898 },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">За замовчуванням: 9898</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Група лінковки Tiger:
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {TIGER_BINDINGS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() =>
                          handleUpdate({
                            ...currentSettings,
                            tiger: { ...currentSettings.tiger, binding: b },
                          })
                        }
                        className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                          currentSettings.tiger.binding === b
                            ? 'bg-rose-500 text-slate-950'
                            : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleTestPort('tiger')}
                disabled={isTesting}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer border border-rose-500/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>Перевірити з'єднання з TigerTrade (порт {currentSettings.tiger.port})</span>
              </button>
            </div>
          )}

          {/* TAB 5: RAILWAY & WEB EXPLANATION */}
          {activeTab === 'railway' && (
            <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/30 space-y-3 text-xs leading-relaxed text-slate-300">
              <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
                <Globe className="w-4 h-4 text-purple-400" />
                <span>Як працює лінковка на Railway.app та у Web?</span>
              </div>
              <p>
                Коли скрінер розгорнутий на <strong>Railway (захищений HTTPS протокол)</strong>, а ваш термінал (MetaScalp, Vataga, Tiger) запущений локально на вашому комп'ютері:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-[11px] text-slate-300">
                <li>
                  <strong>Прямий запит:</strong> Додаток надсилає запит на <code className="text-amber-300 bg-slate-950 px-1 py-0.5 rounded">http://127.0.0.1:[порт]</code> локального API вашого терміналу.
                </li>
                <li>
                  <strong>Миттєвий буфер обміну:</strong> При кожному кліку на тікер система автоматично копіює його у буфер обміну у потрібному для терміналу форматі (напр. <code className="text-cyan-300 bg-slate-950 px-1 py-0.5 rounded">BINANCE:BTCUSDT.p</code>), що дозволяє моментально відкрити стакан гарячою клавішею або вставкою.
                </li>
                <li>
                  <strong>Підтримка всіх 3 терміналів:</strong> Ви можете обрати один конкретний термінал або режим «Всі термінали» для одночасної трансляції тікерів у MetaScalp, Vataga та Tiger.
                </li>
              </ul>
            </div>
          )}

          {/* Live Test Results Card */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs animate-in fade-in ${
                testSuccess
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              {testSuccess ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <div className="font-bold">{testSuccess ? 'Результат тесту' : 'Попередження'}</div>
                <div className="text-[11px] opacity-90">{testResult}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Quick Test Action */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleSendTestTicker}
            disabled={isTesting}
            className="py-2 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-cyan-500 hover:from-amber-400 hover:to-cyan-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Тестова відправка {currentSymbol}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};

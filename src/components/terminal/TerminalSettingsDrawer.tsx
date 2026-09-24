import React from 'react';
import {
  X,
  Sliders,
  Maximize2,
  Grid,
  Columns,
  Clock,
  Sparkles,
  Layers,
  RotateCcw,
  Check,
  Monitor,
  LayoutGrid,
} from 'lucide-react';
import { Timeframe, TerminalWorkspaceConfig } from '../../types';

interface TerminalSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  config: TerminalWorkspaceConfig;
  onUpdateConfig: (updated: Partial<TerminalWorkspaceConfig>) => void;
  onApplyGlobalTimeframe: (tf: Timeframe) => void;
  onApplyPreset: (presetKey: 'focus_btc' | 'top_3' | 'top_4_patterns' | 'grid_4') => void;
  onResetWorkspace: () => void;
  totalBlocks: number;
}

export const TerminalSettingsDrawer: React.FC<TerminalSettingsDrawerProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  onApplyGlobalTimeframe,
  onApplyPreset,
  onResetWorkspace,
  totalBlocks,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full overflow-y-auto flex flex-col shadow-2xl animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                Налаштування термінала
              </h3>
              <p className="text-xs text-slate-400">
                Конфігурація робочого простору трейдера ({totalBlocks} графіків)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Sections */}
        <div className="p-5 space-y-6 flex-1 text-xs">
          {/* Layout Presets */}
          <div className="space-y-2.5">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
              <span>Шаблони розташування сітки</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: '1x1', label: '1x1', sub: '1 на весь екран' },
                { id: '1x2', label: '1x2', sub: '2 горизонтально' },
                { id: '2x1', label: '2x1', sub: '2 вертикально' },
                { id: '2x2', label: '2x2', sub: '4 квадрант' },
                { id: '2x3', label: '2x3', sub: '6 сітка' },
                { id: 'custom', label: 'Вільний', sub: 'Гнучкий розмір' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => onUpdateConfig({ layoutPreset: item.id as any })}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    config.layoutPreset === item.id
                      ? 'bg-cyan-950/60 border-cyan-500/60 text-white shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="font-mono font-bold text-sm text-cyan-300">{item.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{item.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Number of columns */}
          <div className="space-y-2.5">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <Columns className="w-3.5 h-3.5 text-cyan-400" />
              <span>Кількість колонок на екрані</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {([1, 2, 3, 4] as (1 | 2 | 3 | 4)[]).map((col) => (
                <button
                  key={col}
                  onClick={() => onUpdateConfig({ columns: col })}
                  className={`py-2 px-3 rounded-xl border font-mono font-bold text-center transition-all ${
                    config.columns === col
                      ? 'bg-cyan-600 border-cyan-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {col} {col === 1 ? 'колонка' : col < 5 ? 'колонки' : 'колонок'}
                </button>
              ))}
            </div>
          </div>

          {/* Screen Adaptation: Auto-fit to viewport */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="font-bold text-white block">Під розмір монітора (Auto-Fit)</span>
                  <span className="text-[11px] text-slate-400 block">
                    Графіки займають рівно 100% висоти вікна без зайвого скролу
                  </span>
                </div>
              </div>
              <button
                onClick={() => onUpdateConfig({ autoFitScreen: !config.autoFitScreen })}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  config.autoFitScreen ? 'bg-emerald-600' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    config.autoFitScreen ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Block Height (when not in auto-fit) */}
          {!config.autoFitScreen && (
            <div className="space-y-2.5">
              <label className="text-slate-300 font-bold flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Масштаб / Висота блоків графіка</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'compact', label: 'Компактний', px: '280px' },
                  { id: 'medium', label: 'Стандартний', px: '380px' },
                  { id: 'large', label: 'Великий', px: '500px' },
                ].map((h) => (
                  <button
                    key={h.id}
                    onClick={() => onUpdateConfig({ blockHeight: h.id as any })}
                    className={`py-2 px-2.5 rounded-xl border text-center transition-all ${
                      config.blockHeight === h.id
                        ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div>{h.label}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{h.px}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Global Timeframe Switcher */}
          <div className="space-y-2.5">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Глобальний таймфрейм (для всіх графіків одразу)</span>
            </label>
            <div className="grid grid-cols-6 gap-1 font-mono">
              {(['1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => onApplyGlobalTimeframe(tf)}
                  className="py-1.5 rounded-lg bg-slate-950/70 hover:bg-cyan-600 hover:text-white border border-slate-800 text-slate-300 text-center font-bold transition-colors"
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Preset Workspaces */}
          <div className="space-y-2.5">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Швидкі набори монет для трейдингу</span>
            </label>
            <div className="space-y-2">
              <button
                onClick={() => onApplyPreset('focus_btc')}
                className="w-full p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-bold text-white">BTC Focus (1 графік)</div>
                  <div className="text-[11px] text-slate-400">Повний екран, максимальна концентрація</div>
                </div>
                <span className="font-mono text-xs text-amber-400 font-bold">BTCUSDT</span>
              </button>

              <button
                onClick={() => onApplyPreset('top_3')}
                className="w-full p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-bold text-white">Топ-3 Ліквідність</div>
                  <div className="text-[11px] text-slate-400">BTC + ETH + SOL</div>
                </div>
                <span className="font-mono text-xs text-cyan-400 font-bold">3 графіки</span>
              </button>

              <button
                onClick={() => onApplyPreset('grid_4')}
                className="w-full p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-bold text-white">2x2 Квадрат (Топ-4)</div>
                  <div className="text-[11px] text-slate-400">BTC + ETH + SOL + SUI</div>
                </div>
                <span className="font-mono text-xs text-cyan-400 font-bold">4 графіки</span>
              </button>

              <button
                onClick={() => onApplyPreset('top_4_patterns')}
                className="w-full p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>Топ-4 монети з формаціями</span>
                    <span className="text-[9px] px-1 rounded bg-purple-900/60 text-purple-300">AI</span>
                  </div>
                  <div className="text-[11px] text-slate-400">Монети з найвищим скорингом патернів</div>
                </div>
                <span className="font-mono text-xs text-purple-400 font-bold">Патерни</span>
              </button>
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between gap-3">
          <button
            onClick={onResetWorkspace}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-950/80 text-rose-300 border border-rose-900/60 text-xs font-semibold transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Очистити робоче місце</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};

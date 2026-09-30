import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShieldAlert,
  Percent,
  Layers,
  Settings,
  X,
  Tag,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Sliders,
  ChevronDown,
} from 'lucide-react';
import {
  ReplayPosition,
  ReplaySimulationSettings,
  ReplayOrderType,
  Kline,
} from '../../types';
import { formatCryptoPrice, formatLargeNumber } from '../../utils/formatters';

interface ReplaySimulatorPanelProps {
  currentPrice: number;
  currentCandle: Kline | null;
  position: ReplayPosition | null;
  settings: ReplaySimulationSettings;
  onUpdateSettings: (newSettings: ReplaySimulationSettings) => void;
  onExecuteMarketOrder: (params: {
    side: 'long' | 'short';
    sizeUsd: number;
    leverage: number;
    slPrice?: number;
    tpPrice?: number;
    tag: string;
    notes?: string;
  }) => void;
  onPlacePendingOrder: (params: {
    side: 'buy' | 'sell';
    orderType: 'limit' | 'stop';
    price: number;
    sizeUsd: number;
    leverage: number;
    slPrice?: number;
    tpPrice?: number;
    tag: string;
  }) => void;
  onClosePosition: () => void;
  onResetBalance: () => void;
}

const PRESET_TAGS = [
  'Пробій рівня',
  'Хибний пробій (Fakeout)',
  'Відскік від підтримки',
  'Відскік від опору',
  'Розворот W / Подвійне дно',
  'Розворот M / Подвійна вершина',
  'Голова і плечі (H&S)',
  'Висхідний тренд',
  'Спадний тренд',
  'Стиснення (Squeeze)',
  'Скальпінг імпульс',
  'Тест зони ліквідності',
];

const LEVERAGE_OPTIONS = [1, 2, 5, 10, 20, 50, 100];

export const ReplaySimulatorPanel: React.FC<ReplaySimulatorPanelProps> = ({
  currentPrice,
  currentCandle,
  position,
  settings,
  onUpdateSettings,
  onExecuteMarketOrder,
  onPlacePendingOrder,
  onClosePosition,
  onResetBalance,
}) => {
  const [orderType, setOrderType] = useState<ReplayOrderType>('market');
  const [limitPriceInput, setLimitPriceInput] = useState<string>('');
  const [stopPriceInput, setStopPriceInput] = useState<string>('');

  // Leverage & Size
  const [leverage, setLeverage] = useState<number>(settings.leverage || 10);
  const [positionSizeUsd, setPositionSizeUsd] = useState<number>(settings.positionSizeUsd || 1000);

  // SL & TP
  const [useSl, setUseSl] = useState<boolean>(true);
  const [slPercent, setSlPercent] = useState<number>(settings.autoSlPct || 2.0);
  const [slCustomPrice, setSlCustomPrice] = useState<string>('');

  const [useTp, setUseTp] = useState<boolean>(true);
  const [tpPercent, setTpPercent] = useState<number>(settings.autoTpPct || 4.0);
  const [tpCustomPrice, setTpCustomPrice] = useState<string>('');

  // Tag & Reason
  const [selectedTag, setSelectedTag] = useState<string>(PRESET_TAGS[0]);
  const [customTagInput, setCustomTagInput] = useState<string>('');
  const [isCustomTag, setIsCustomTag] = useState<boolean>(false);
  const [tradeNotes, setTradeNotes] = useState<string>('');

  // Settings modal
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [tempCommission, setTempCommission] = useState(settings.commissionPct.toString());
  const [tempSpread, setTempSpread] = useState(settings.spreadPct.toString());
  const [tempSlippage, setTempSlippage] = useState(settings.slippagePct.toString());

  const activeTag = isCustomTag ? customTagInput.trim() || 'Користувацький' : selectedTag;

  // Margin required for current order size & leverage
  const requiredMargin = leverage > 0 ? positionSizeUsd / leverage : positionSizeUsd;
  const availableBalance = settings.balance;

  // Calculate target prices based on side
  const calculateTargets = (side: 'long' | 'short') => {
    let slPrice: number | undefined = undefined;
    let tpPrice: number | undefined = undefined;

    const basePrice = orderType === 'market' ? currentPrice : parseFloat(limitPriceInput) || currentPrice;

    if (useSl) {
      if (slCustomPrice) {
        slPrice = parseFloat(slCustomPrice);
      } else {
        const factor = slPercent / 100;
        slPrice = side === 'long' ? basePrice * (1 - factor) : basePrice * (1 + factor);
      }
    }

    if (useTp) {
      if (tpCustomPrice) {
        tpPrice = parseFloat(tpCustomPrice);
      } else {
        const factor = tpPercent / 100;
        tpPrice = side === 'long' ? basePrice * (1 + factor) : basePrice * (1 - factor);
      }
    }

    return { slPrice, tpPrice };
  };

  const handleExecuteLong = () => {
    if (orderType === 'market') {
      const { slPrice, tpPrice } = calculateTargets('long');
      onExecuteMarketOrder({
        side: 'long',
        sizeUsd: positionSizeUsd,
        leverage,
        slPrice,
        tpPrice,
        tag: activeTag,
        notes: tradeNotes,
      });
      setTradeNotes('');
    } else {
      const targetPrice = parseFloat(orderType === 'limit' ? limitPriceInput : stopPriceInput) || currentPrice;
      const { slPrice, tpPrice } = calculateTargets('long');
      onPlacePendingOrder({
        side: 'buy',
        orderType,
        price: targetPrice,
        sizeUsd: positionSizeUsd,
        leverage,
        slPrice,
        tpPrice,
        tag: activeTag,
      });
    }
  };

  const handleExecuteShort = () => {
    if (orderType === 'market') {
      const { slPrice, tpPrice } = calculateTargets('short');
      onExecuteMarketOrder({
        side: 'short',
        sizeUsd: positionSizeUsd,
        leverage,
        slPrice,
        tpPrice,
        tag: activeTag,
        notes: tradeNotes,
      });
      setTradeNotes('');
    } else {
      const targetPrice = parseFloat(orderType === 'limit' ? limitPriceInput : stopPriceInput) || currentPrice;
      const { slPrice, tpPrice } = calculateTargets('short');
      onPlacePendingOrder({
        side: 'sell',
        orderType,
        price: targetPrice,
        sizeUsd: positionSizeUsd,
        leverage,
        slPrice,
        tpPrice,
        tag: activeTag,
      });
    }
  };

  // Quick percent size buttons
  const handleApplySizePercent = (pct: number) => {
    const margin = (availableBalance * pct) / 100;
    const size = Math.round(margin * leverage);
    setPositionSizeUsd(Math.max(10, size));
  };

  const saveSettingsHandler = () => {
    const comm = parseFloat(tempCommission) || 0.05;
    const spr = parseFloat(tempSpread) || 0.02;
    const slip = parseFloat(tempSlippage) || 0.02;
    onUpdateSettings({
      ...settings,
      commissionPct: comm,
      spreadPct: spr,
      slippagePct: slip,
    });
    setIsSettingsModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-3 p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md">
      {/* Account Balance & Settings Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Баланс симулятора
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-extrabold text-xl text-white font-mono">
              ${formatLargeNumber(settings.balance)}
            </span>
            <span className="text-xs text-slate-400 font-mono">USDT</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
            title="Налаштування симулятора (комісія, спред, проковзування)"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onResetBalance}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
            title="Скинути баланс до початкових $10,000"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Active Position Card (if position is open) */}
      {position && (
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-700 shadow-inner space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase font-mono ${
                  position.side === 'long'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {position.side.toUpperCase()} {position.leverage}x
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {position.symbol}
              </span>
            </div>

            {/* Close / Cover Button */}
            <button
              onClick={onClosePosition}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition-colors cursor-pointer"
            >
              Закрити / Cover
            </button>
          </div>

          {/* Position P&L Highlight */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/90 border border-slate-800">
            <div>
              <div className="text-[10px] text-slate-400 font-mono">P&L позиції:</div>
              <div
                className={`text-base font-extrabold font-mono ${
                  position.unrealizedPnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {position.unrealizedPnlUsd >= 0 ? '+' : ''}
                ${position.unrealizedPnlUsd.toFixed(2)} ({position.unrealizedPnlPct >= 0 ? '+' : ''}
                {position.unrealizedPnlPct.toFixed(2)}%)
              </div>
            </div>

            <div className="text-right text-[11px] font-mono text-slate-400">
              <div>Вхід: <b className="text-slate-200">${formatCryptoPrice(position.entryPrice)}</b></div>
              <div>Поточна: <b className="text-cyan-300">${formatCryptoPrice(currentPrice)}</b></div>
            </div>
          </div>

          {/* Position Details Matrix */}
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400">
            <div className="bg-slate-900/50 p-1.5 rounded border border-slate-800/60">
              Розмір: <b className="text-white">${formatLargeNumber(position.sizeUsd)}</b>
            </div>
            <div className="bg-slate-900/50 p-1.5 rounded border border-slate-800/60">
              Маржа: <b className="text-white">${position.marginUsd.toFixed(2)}</b>
            </div>
            <div className="bg-slate-900/50 p-1.5 rounded border border-slate-800/60">
              SL: <b className="text-rose-400">{position.slPrice ? `$${formatCryptoPrice(position.slPrice)}` : 'Немає'}</b>
            </div>
            <div className="bg-slate-900/50 p-1.5 rounded border border-slate-800/60">
              TP: <b className="text-emerald-400">{position.tpPrice ? `$${formatCryptoPrice(position.tpPrice)}` : 'Немає'}</b>
            </div>
            {position.liquidationPrice > 0 && (
              <div className="col-span-2 bg-purple-950/30 p-1.5 rounded border border-purple-800/40 text-purple-300 flex items-center justify-between">
                <span>Ціна ліквідації:</span>
                <b>${formatCryptoPrice(position.liquidationPrice)}</b>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Order Type Tabs: Market / Limit / Stop */}
      <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
        {(['market', 'limit', 'stop'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setOrderType(type)}
            className={`flex-1 py-1.5 rounded-lg font-bold capitalize transition-all cursor-pointer ${
              orderType === type
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {type === 'market' ? 'Ринковий' : type === 'limit' ? 'Лімітний' : 'Стоп'}
          </button>
        ))}
      </div>

      {/* Limit / Stop Price Input */}
      {orderType !== 'market' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>{orderType === 'limit' ? 'Ціна ліміту:' : 'Ціна стопу:'}</span>
            <button
              onClick={() => {
                if (orderType === 'limit') setLimitPriceInput(currentPrice.toString());
                else setStopPriceInput(currentPrice.toString());
              }}
              className="text-[10px] text-cyan-400 hover:underline"
            >
              Поточна (${formatCryptoPrice(currentPrice)})
            </button>
          </div>
          <input
            type="number"
            step="any"
            value={orderType === 'limit' ? limitPriceInput : stopPriceInput}
            onChange={(e) => {
              if (orderType === 'limit') setLimitPriceInput(e.target.value);
              else setStopPriceInput(e.target.value);
            }}
            placeholder={formatCryptoPrice(currentPrice)}
            className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
      )}

      {/* Leverage Selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>Кредитне плече:</span>
          <b className="text-amber-400 font-extrabold">{leverage}x</b>
        </div>
        <div className="flex items-center gap-1.5">
          {LEVERAGE_OPTIONS.map((lev) => (
            <button
              key={lev}
              onClick={() => setLeverage(lev)}
              className={`flex-1 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                leverage === lev
                  ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {lev}x
            </button>
          ))}
        </div>
      </div>

      {/* Position Size Input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>Розмір позиції ($):</span>
          <span>Маржа: <b className="text-slate-200">${requiredMargin.toFixed(1)}</b></span>
        </div>
        <input
          type="number"
          min="10"
          step="50"
          value={positionSizeUsd}
          onChange={(e) => setPositionSizeUsd(Math.max(10, parseFloat(e.target.value) || 0))}
          className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
        />

        {/* Quick Margin % Buttons */}
        <div className="grid grid-cols-4 gap-1.5">
          {[10, 25, 50, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => handleApplySizePercent(pct)}
              className="py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-[10px] font-mono font-bold text-slate-300 border border-slate-800 transition-colors"
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* Stop-Loss & Take-Profit Toggle & Inputs */}
      <div className="space-y-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
        {/* SL */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={useSl}
                onChange={(e) => setUseSl(e.target.checked)}
                className="rounded border-slate-700 text-rose-500 focus:ring-rose-500"
              />
              <span className="font-semibold text-rose-400">Stop-Loss (SL)</span>
            </label>
            <span className="text-[10px] text-slate-500 font-mono">
              -{slPercent}%
            </span>
          </div>
          {useSl && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="0.2"
                max="50"
                value={slPercent}
                onChange={(e) => setSlPercent(parseFloat(e.target.value) || 1)}
                className="w-20 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white"
                placeholder="2.0%"
              />
              <span className="text-[10px] text-slate-500 font-mono">або ціна:</span>
              <input
                type="number"
                step="any"
                value={slCustomPrice}
                onChange={(e) => setSlCustomPrice(e.target.value)}
                placeholder="Ціна SL"
                className="flex-1 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white"
              />
            </div>
          )}
        </div>

        {/* TP */}
        <div className="space-y-1 pt-1.5 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={useTp}
                onChange={(e) => setUseTp(e.target.checked)}
                className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="font-semibold text-emerald-400">Take-Profit (TP)</span>
            </label>
            <span className="text-[10px] text-slate-500 font-mono">
              +{tpPercent}%
            </span>
          </div>
          {useTp && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="100"
                value={tpPercent}
                onChange={(e) => setTpPercent(parseFloat(e.target.value) || 2)}
                className="w-20 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white"
                placeholder="4.0%"
              />
              <span className="text-[10px] text-slate-500 font-mono">або ціна:</span>
              <input
                type="number"
                step="any"
                value={tpCustomPrice}
                onChange={(e) => setTpCustomPrice(e.target.value)}
                placeholder="Ціна TP"
                className="flex-1 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* Trade Reason / Tag Selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1">
            <Tag className="w-3 h-3 text-cyan-400" />
            Причина входу / Тег:
          </span>
          <button
            onClick={() => setIsCustomTag(!isCustomTag)}
            className="text-[10px] text-cyan-400 hover:underline"
          >
            {isCustomTag ? 'Вибрати зі списку' : 'Власний тег'}
          </button>
        </div>

        {isCustomTag ? (
          <input
            type="text"
            placeholder="Введіть свій тег або патерн..."
            value={customTagInput}
            onChange={(e) => setCustomTagInput(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
          />
        ) : (
          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            {PRESET_TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        )}

        {/* Trade Note (Optional) */}
        <input
          type="text"
          placeholder="Коментар або план угоди (необов'язково)..."
          value={tradeNotes}
          onChange={(e) => setTradeNotes(e.target.value)}
          className="w-full px-3 py-1.5 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Big Action Buttons: BUY / LONG vs SELL / SHORT */}
      <div className="grid grid-cols-2 gap-2.5 pt-1">
        <button
          onClick={handleExecuteLong}
          disabled={requiredMargin > availableBalance}
          className="flex flex-col items-center justify-center py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-extrabold text-sm shadow-lg shadow-emerald-950/50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 stroke-[3]" />
            <span>BUY / LONG</span>
          </div>
          <span className="text-[10px] font-mono opacity-80">
            ${formatCryptoPrice(currentPrice)}
          </span>
        </button>

        <button
          onClick={handleExecuteShort}
          disabled={requiredMargin > availableBalance}
          className="flex flex-col items-center justify-center py-3 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-extrabold text-sm shadow-lg shadow-rose-950/50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4 stroke-[3]" />
            <span>SELL / SHORT</span>
          </div>
          <span className="text-[10px] font-mono opacity-80">
            ${formatCryptoPrice(currentPrice)}
          </span>
        </button>
      </div>

      {/* Simulator Settings Modal */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md p-5 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">Параметри симуляції ринку</h3>
              </div>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Вкажіть параметри тейкера, біржовий спред та проковзування ордерів для реалістичного тестування торгової стратегії.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Комісія біржі (%):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={tempCommission}
                  onChange={(e) => setTempCommission(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white"
                  placeholder="0.05"
                />
                <span className="text-[10px] text-slate-500 font-mono">
                  За замовчуванням 0.05% (Binance/Bybit Futures taker)
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Ринковий спред (%):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={tempSpread}
                  onChange={(e) => setTempSpread(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white"
                  placeholder="0.02"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Проковзування / Slippage (%):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={tempSlippage}
                  onChange={(e) => setTempSlippage(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white"
                  placeholder="0.02"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors"
              >
                Скасувати
              </button>
              <button
                onClick={saveSettingsHandler}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-extrabold shadow-md transition-colors"
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

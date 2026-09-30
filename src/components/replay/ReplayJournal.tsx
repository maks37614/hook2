import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  Clock,
  Camera,
  Download,
  Trash2,
  Tag,
  ExternalLink,
  X,
  Target,
  Shield,
  Layers,
  Award,
  AlertCircle,
} from 'lucide-react';
import { ReplayTradeJournalItem, ReplayPendingOrder } from '../../types';
import { formatCryptoPrice, formatLargeNumber } from '../../utils/formatters';

interface ReplayJournalProps {
  journalItems: ReplayTradeJournalItem[];
  pendingOrders: ReplayPendingOrder[];
  onCancelPendingOrder: (orderId: string) => void;
  onClearJournal: () => void;
  onDeleteJournalItem: (id: string) => void;
}

export const ReplayJournal: React.FC<ReplayJournalProps> = ({
  journalItems,
  pendingOrders,
  onCancelPendingOrder,
  onClearJournal,
  onDeleteJournalItem,
}) => {
  const [activeTab, setActiveTab] = useState<'journal' | 'stats' | 'pending'>('journal');
  const [selectedScreenshot, setSelectedScreenshot] = useState<{
    url: string;
    trade: ReplayTradeJournalItem;
  } | null>(null);

  // Statistics calculation
  const stats = useMemo(() => {
    if (journalItems.length === 0) {
      return {
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        totalNetPnl: 0,
        totalProfit: 0,
        totalLoss: 0,
        profitFactor: 0,
        avgTrade: 0,
        bestTrade: 0,
        worstTrade: 0,
        longCount: 0,
        shortCount: 0,
      };
    }

    let winCount = 0;
    let lossCount = 0;
    let totalProfit = 0;
    let totalLoss = 0;
    let bestTrade = -Infinity;
    let worstTrade = Infinity;
    let longCount = 0;
    let shortCount = 0;

    for (const item of journalItems) {
      if (item.side === 'long') longCount++;
      else shortCount++;

      if (item.pnlUsd > 0) {
        winCount++;
        totalProfit += item.pnlUsd;
      } else if (item.pnlUsd < 0) {
        lossCount++;
        totalLoss += Math.abs(item.pnlUsd);
      }

      if (item.pnlUsd > bestTrade) bestTrade = item.pnlUsd;
      if (item.pnlUsd < worstTrade) worstTrade = item.pnlUsd;
    }

    const totalTrades = journalItems.length;
    const totalNetPnl = totalProfit - totalLoss;
    const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 99 : 0;
    const avgTrade = totalTrades > 0 ? totalNetPnl / totalTrades : 0;

    return {
      totalTrades,
      winCount,
      lossCount,
      winRate,
      totalNetPnl,
      totalProfit,
      totalLoss,
      profitFactor,
      avgTrade,
      bestTrade: bestTrade === -Infinity ? 0 : bestTrade,
      worstTrade: worstTrade === Infinity ? 0 : worstTrade,
      longCount,
      shortCount,
    };
  }, [journalItems]);

  // Export to CSV
  const handleExportCsv = () => {
    if (journalItems.length === 0) return;
    const headers = [
      'ID',
      'Symbol',
      'Exchange',
      'Timeframe',
      'Side',
      'Entry Time (UTC)',
      'Exit Time (UTC)',
      'Entry Price',
      'Exit Price',
      'Size USD',
      'Leverage',
      'SL Price',
      'TP Price',
      'Net PnL USD',
      'PnL %',
      'Reason / Tag',
      'Exit Reason',
    ];

    const rows = journalItems.map((j) => [
      j.id,
      j.symbol,
      j.exchange,
      j.timeframe,
      j.side.toUpperCase(),
      new Date(j.entryTime * 1000).toISOString(),
      new Date(j.exitTime * 1000).toISOString(),
      j.entryPrice,
      j.exitPrice,
      j.sizeUsd,
      `${j.leverage}x`,
      j.slPrice || '',
      j.tpPrice || '',
      j.pnlUsd.toFixed(2),
      `${j.pnlPct.toFixed(2)}%`,
      `"${(j.tag || '').replace(/"/g, '""')}"`,
      j.exitReason,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `replay_journal_${Date.now()}.csv`;
    link.click();
  };

  const formatHistoricalTime = (timestampSec: number) => {
    return new Date(timestampSec * 1000).toLocaleString('uk-UA', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  };

  return (
    <div className="flex flex-col rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
      {/* Header Tabs & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('journal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === 'journal'
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Журнал угод</span>
            {journalItems.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-950 text-amber-200 font-mono">
                {journalItems.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === 'stats'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Статистика & Аналітика</span>
          </button>

          <button
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Відкладені ордери</span>
            {pendingOrders.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-mono">
                {pendingOrders.length}
              </span>
            )}
          </button>
        </div>

        {/* Global Journal Actions */}
        <div className="flex items-center gap-2">
          {journalItems.length > 0 && (
            <>
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                title="Експортувати журнал угод в CSV"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Експорт CSV</span>
              </button>

              <button
                onClick={() => {
                  if (window.confirm('Ви впевнені, що хочете очистити журнал угод симулятора?')) {
                    onClearJournal();
                  }
                }}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors"
                title="Очистити журнал"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="p-3.5 sm:p-4">
        {/* Tab 1: Trade Journal Table */}
        {activeTab === 'journal' && (
          <div>
            {journalItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-center space-y-2">
                <BookOpen className="w-10 h-10 text-slate-600 stroke-1" />
                <div className="text-sm font-semibold text-slate-400">
                  Журнал угод порожній
                </div>
                <p className="text-xs max-w-sm text-slate-500">
                  Відкривайте позиції в симуляторі на сторінці Replay. Після закриття угоди за SL, TP або вручну, всі деталі та скриншот графіка збережуться тут!
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950/60 border-b border-slate-800 text-[11px] text-slate-400 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Монета / Напрямок</th>
                      <th className="py-2.5 px-3">Час входу / виходу</th>
                      <th className="py-2.5 px-3">Ціна входу / виходу</th>
                      <th className="py-2.5 px-3">Розмір / Плече</th>
                      <th className="py-2.5 px-3">Stop / TP</th>
                      <th className="py-2.5 px-3">P&L ($ / %)</th>
                      <th className="py-2.5 px-3">Причина / Тег</th>
                      <th className="py-2.5 px-3">Скриншот</th>
                      <th className="py-2.5 px-2 text-right">Дія</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {journalItems.map((trade) => {
                      const isProfit = trade.pnlUsd >= 0;
                      return (
                        <tr
                          key={trade.id}
                          className="hover:bg-slate-800/30 transition-colors"
                        >
                          {/* Symbol & Direction */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                  trade.side === 'long'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                }`}
                              >
                                {trade.side.toUpperCase()}
                              </span>
                              <span className="font-extrabold text-white">
                                {trade.symbol}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {trade.timeframe}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {trade.exitReason === 'tp' ? (
                                <span className="text-emerald-400 font-bold">🎯 TP спрацював</span>
                              ) : trade.exitReason === 'sl' ? (
                                <span className="text-rose-400 font-bold">🛑 SL спрацював</span>
                              ) : trade.exitReason === 'liquidation' ? (
                                <span className="text-purple-400 font-bold">💥 Ліквідація</span>
                              ) : (
                                <span className="text-sky-400">👤 Закрито вручну</span>
                              )}
                            </div>
                          </td>

                          {/* Times */}
                          <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                            <div className="text-[11px]">
                              Вхід: {formatHistoricalTime(trade.entryTime)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Вихід: {formatHistoricalTime(trade.exitTime)}
                            </div>
                          </td>

                          {/* Prices */}
                          <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                            <div>${formatCryptoPrice(trade.entryPrice)}</div>
                            <div className="text-[10px] text-slate-400">
                              → ${formatCryptoPrice(trade.exitPrice)}
                            </div>
                          </td>

                          {/* Size & Leverage */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="text-white font-semibold">
                              ${formatLargeNumber(trade.sizeUsd)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {trade.leverage}x (маржа: ${trade.marginUsd.toFixed(1)})
                            </div>
                          </td>

                          {/* SL / TP */}
                          <td className="py-3 px-3 text-[11px] whitespace-nowrap">
                            <div className="text-rose-400">
                              SL: {trade.slPrice ? `$${formatCryptoPrice(trade.slPrice)}` : '—'}
                            </div>
                            <div className="text-emerald-400">
                              TP: {trade.tpPrice ? `$${formatCryptoPrice(trade.tpPrice)}` : '—'}
                            </div>
                          </td>

                          {/* P&L */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div
                              className={`font-extrabold text-sm ${
                                isProfit ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isProfit ? '+' : ''}
                              ${trade.pnlUsd.toFixed(2)}
                            </div>
                            <div
                              className={`text-[10px] ${
                                isProfit ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              ({isProfit ? '+' : ''}
                              {trade.pnlPct.toFixed(2)}%)
                            </div>
                          </td>

                          {/* Tag & Notes */}
                          <td className="py-3 px-3">
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-200 border border-slate-700 whitespace-nowrap">
                              <Tag className="w-2.5 h-2.5 text-cyan-400" />
                              <span>{trade.tag || 'Без тегу'}</span>
                            </div>
                            {trade.notes && (
                              <div className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5" title={trade.notes}>
                                {trade.notes}
                              </div>
                            )}
                          </td>

                          {/* Screenshot */}
                          <td className="py-3 px-3">
                            {trade.screenshotUrl ? (
                              <button
                                onClick={() => setSelectedScreenshot({ url: trade.screenshotUrl!, trade })}
                                className="group relative w-12 h-8 rounded border border-slate-700 overflow-hidden bg-slate-950 hover:border-cyan-400 transition-colors cursor-pointer"
                                title="Клікніть для перегляду скриншоту графіка"
                              >
                                <img
                                  src={trade.screenshotUrl}
                                  alt="Chart snapshot"
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                />
                                <div className="absolute inset-0 bg-slate-950/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Camera className="w-3.5 h-3.5 text-white" />
                                </div>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-600">Немає</span>
                            )}
                          </td>

                          {/* Delete Item */}
                          <td className="py-3 px-2 text-right">
                            <button
                              onClick={() => onDeleteJournalItem(trade.id)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                              title="Видалити запис"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Performance Statistics */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {/* Total Trades */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                  Всього угод
                </div>
                <div className="text-xl font-extrabold text-white font-mono mt-1">
                  {stats.totalTrades}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Long: {stats.longCount} | Short: {stats.shortCount}
                </div>
              </div>

              {/* Win Rate */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                  Win Rate
                </div>
                <div
                  className={`text-xl font-extrabold font-mono mt-1 ${
                    stats.winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {stats.winRate.toFixed(1)}%
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Виграшних: {stats.winCount} | Програшних: {stats.lossCount}
                </div>
              </div>

              {/* Net PnL */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                  Чистий прибуток (Net P&L)
                </div>
                <div
                  className={`text-xl font-extrabold font-mono mt-1 ${
                    stats.totalNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {stats.totalNetPnl >= 0 ? '+' : ''}${stats.totalNetPnl.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Прибуток: +${stats.totalProfit.toFixed(0)} | Збиток: -${stats.totalLoss.toFixed(0)}
                </div>
              </div>

              {/* Profit Factor */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                  Profit Factor
                </div>
                <div className="text-xl font-extrabold text-cyan-400 font-mono mt-1">
                  {stats.profitFactor.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Співвідношення прибутку
                </div>
              </div>

              {/* Best Trade */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                  Краща угода
                </div>
                <div className="text-xl font-extrabold text-emerald-400 font-mono mt-1">
                  +${stats.bestTrade.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Максимальний профіт
                </div>
              </div>

              {/* Worst Trade */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                  Гірша угода
                </div>
                <div className="text-xl font-extrabold text-rose-400 font-mono mt-1">
                  ${stats.worstTrade.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Максимальний збиток
                </div>
              </div>
            </div>

            {/* Recommendations / Performance notes */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                <Award className="w-4 h-4 text-amber-400" />
                <span>Аналіз вашої практики на Replay</span>
              </div>
              <p>
                {stats.totalTrades < 5
                  ? 'Зробіть щонайменше 5-10 угод на історії, щоб побачити стабільну статистику прибутковості вашої торгової системи.'
                  : stats.winRate >= 50 && stats.profitFactor > 1.5
                  ? 'Чудовий результат! Ваша стратегія показує позитивне математичне очікування та високий Profit Factor.'
                  : 'Зверніть увагу на співвідношення ризику до прибутку (R:R) та рівні Stop-Loss для оптимізації відсотка просідання.'}
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Pending Orders */}
        {activeTab === 'pending' && (
          <div>
            {pendingOrders.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                Немає активних відкладених лімітних або стоп-ордерів.
              </div>
            ) : (
              <div className="space-y-2">
                {pendingOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          order.side === 'buy'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {order.side.toUpperCase()} {order.orderType.toUpperCase()}
                      </span>
                      <span className="font-bold text-white">{order.symbol}</span>
                      <span className="text-amber-400">
                        Ціна: ${formatCryptoPrice(order.price)}
                      </span>
                      <span className="text-slate-400">
                        Розмір: ${formatLargeNumber(order.sizeUsd)} ({order.leverage}x)
                      </span>
                    </div>

                    <button
                      onClick={() => onCancelPendingOrder(order.id)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 text-xs font-semibold transition-colors"
                    >
                      Скасувати
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Screenshot Preview Modal */}
      {selectedScreenshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">
                  Скриншот стану графіка під час угоди
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-800 text-slate-300">
                  {selectedScreenshot.trade.symbol} • {selectedScreenshot.trade.timeframe}
                </span>
              </div>
              <button
                onClick={() => setSelectedScreenshot(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image Preview */}
            <div className="flex-1 overflow-auto p-4 bg-[#090d16] flex items-center justify-center min-h-[300px]">
              <img
                src={selectedScreenshot.url}
                alt="Trade Chart Screenshot"
                className="max-w-full max-h-[70vh] object-contain rounded-xl border border-slate-800 shadow-2xl"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 bg-slate-950 border-t border-slate-800 text-xs">
              <div className="flex items-center gap-3 font-mono">
                <span className="text-slate-400">
                  P&L:{' '}
                  <b
                    className={
                      selectedScreenshot.trade.pnlUsd >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }
                  >
                    {selectedScreenshot.trade.pnlUsd >= 0 ? '+' : ''}$
                    {selectedScreenshot.trade.pnlUsd.toFixed(2)}
                  </b>
                </span>
                <span className="text-slate-400">
                  Тег: <b className="text-cyan-300">{selectedScreenshot.trade.tag}</b>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={selectedScreenshot.url}
                  download={`trade_${selectedScreenshot.trade.symbol}_${selectedScreenshot.trade.id}.png`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Завантажити фото</span>
                </a>
                <button
                  onClick={() => setSelectedScreenshot(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors"
                >
                  Закрити
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

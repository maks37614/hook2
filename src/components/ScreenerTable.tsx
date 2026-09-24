import React from 'react';
import { ExternalLink, Star, BarChart2, TrendingUp, TrendingDown, Zap, Send } from 'lucide-react';
import { ScannedCoin, DetectedFormation } from '../types';
import { formatCryptoPrice, formatVolume } from '../utils/formatters';

interface ScreenerTableProps {
  items: { coin: ScannedCoin; formation: DetectedFormation }[];
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
  onSelect: (coin: ScannedCoin, formation: DetectedFormation) => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  onOpenAlert?: (coin: ScannedCoin, formation: DetectedFormation) => void;
}

export const ScreenerTable: React.FC<ScreenerTableProps> = ({
  items,
  watchlist,
  onToggleWatchlist,
  onSelect,
  onSendMetaScalp,
  metaScalpBinding = '001',
  onOpenAlert,
}) => {
  const formatPrice = (price: number) => formatCryptoPrice(price);

  return (
    <div className="w-full overflow-x-auto touch-scroll no-scrollbar rounded-2xl border border-slate-800 bg-slate-900/60">
      <table className="w-full text-left text-xs text-slate-300">
        <thead className="bg-slate-950/80 text-[11px] text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
          <tr>
            <th className="py-3 px-2 sm:px-3 w-8 sm:w-10 text-center">★</th>
            <th className="py-3 px-3 sm:px-4">Монета</th>
            <th className="py-3 px-3 hidden sm:table-cell">Біржа</th>
            <th className="py-3 px-3 sm:px-4">Формація</th>
            <th className="py-3 px-2 sm:px-3 text-center">Напрямок</th>
            <th className="py-3 px-3 text-center hidden md:table-cell">Статус</th>
            <th className="py-3 px-3 text-center hidden lg:table-cell">Впевненість</th>
            <th className="py-3 px-3 sm:px-4 text-right">Ціна</th>
            <th className="py-3 px-2 sm:px-3 text-right">24г Зміна</th>
            <th className="py-3 px-3 sm:px-4 text-right hidden md:table-cell">Обсяг 24г</th>
            <th className="py-3 px-3 text-center hidden xl:table-cell">Рівні (Вхід / TP / SL)</th>
            <th className="py-3 px-3 text-center hidden 2xl:table-cell">R:R</th>
            <th className="py-3 px-3 sm:px-4 text-center">Дії</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 font-sans">
          {items.map(({ coin, formation }, idx) => {
            const isWatchlisted = watchlist.includes(coin.symbol);
            const isPositive = coin.priceChange24h >= 0;
            const isBullish = formation.bias === 'bullish';
            const isBearish = formation.bias === 'bearish';

            return (
              <tr
                key={`${coin.exchange}-${coin.symbol}-${coin.marketType}-${formation.id}-${idx}`}
                className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                onClick={() => onSelect(coin, formation)}
              >
                {/* Watchlist toggle */}
                <td className="py-3 px-2 sm:px-3 text-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onToggleWatchlist(coin.symbol)}
                    className="text-slate-500 hover:text-amber-400 transition-colors p-1"
                  >
                    <Star className={`w-3.5 h-3.5 ${isWatchlisted ? 'fill-amber-400 text-amber-400' : ''}`} />
                  </button>
                </td>

                {/* Coin Symbol */}
                <td className="py-3 px-3 sm:px-4 font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white text-xs sm:text-sm">{coin.baseAsset}</span>
                    <span className="text-[10px] text-slate-500">/{coin.quoteAsset}</span>
                  </div>
                  {/* Exchange badge on mobile when exchange col is hidden */}
                  <div className="flex items-center gap-1 mt-0.5 sm:hidden">
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-sans font-bold uppercase ${
                        coin.exchange === 'binance'
                          ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                          : 'bg-orange-950/80 text-orange-400 border border-orange-800/60'
                      }`}
                    >
                      {coin.exchange}
                    </span>
                    <span className="text-[9px] text-slate-500 font-sans uppercase">
                      {coin.marketType === 'futures' ? 'FUT' : 'SPOT'}
                    </span>
                  </div>
                </td>

                {/* Exchange */}
                <td className="py-3 px-3 hidden sm:table-cell">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                      coin.exchange === 'binance'
                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                        : 'bg-orange-500/10 text-orange-300 border border-orange-500/20'
                    }`}
                  >
                    {coin.exchange}
                  </span>
                  <div className="text-[10px] text-slate-500 mt-0.5">{coin.marketType}</div>
                </td>

                {/* Formation Name */}
                <td className="py-3 px-3 sm:px-4">
                  <div className="font-semibold text-slate-100 text-xs sm:text-sm">{formation.name}</div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[140px] sm:max-w-xs">{formation.description}</div>
                </td>

                {/* Bias */}
                <td className="py-3 px-2 sm:px-3 text-center">
                  <span
                    className={`inline-block text-[10px] px-1.5 sm:px-2 py-0.5 rounded font-bold uppercase ${
                      isBullish
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : isBearish
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {isBullish ? 'LONG ▲' : isBearish ? 'SHORT ▼' : 'NEUTRAL'}
                  </span>
                </td>

                {/* Status */}
                <td className="py-3 px-3 text-center hidden md:table-cell">
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-medium">
                    {formation.statusLabel}
                  </span>
                </td>

                {/* Confidence */}
                <td className="py-3 px-3 text-center font-mono font-bold text-cyan-400 hidden lg:table-cell">
                  {formation.confidence}%
                </td>

                {/* Price */}
                <td className="py-3 px-3 sm:px-4 text-right font-mono font-bold text-white text-xs sm:text-sm">
                  ${formatPrice(coin.currentPrice)}
                </td>

                {/* 24h Change */}
                <td className="py-3 px-2 sm:px-3 text-right">
                  <span
                    className={`font-semibold font-mono text-xs sm:text-sm flex items-center justify-end gap-0.5 ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isPositive ? '+' : ''}{coin.priceChange24h.toFixed(2)}%
                  </span>
                </td>

                {/* Volume */}
                <td className="py-3 px-3 sm:px-4 text-right font-mono text-slate-400 hidden md:table-cell">
                  {formatVolume(coin.volume24hUsd)}
                </td>

                {/* Trading Levels (Entry, Target, Stop) */}
                <td className="py-3 px-3 font-mono text-[11px] whitespace-nowrap hidden xl:table-cell">
                  <div className="flex items-center gap-1 text-sky-300">
                    <span className="text-[10px] text-slate-400 font-sans">Вхід:</span>
                    <span className="font-semibold">${formatPrice(formation.levels.entryPrice)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                    <span className="text-emerald-400" title="Ціль">
                      TP: ${formatPrice(formation.levels.targetPrice)} (+{formation.potentialProfitPct}%)
                    </span>
                    <span className="text-rose-400" title="Стоп-лос">
                      SL: ${formatPrice(formation.levels.stopLossPrice)} (-{formation.potentialRiskPct}%)
                    </span>
                  </div>
                </td>

                {/* Risk/Reward */}
                <td className="py-3 px-3 text-center font-mono text-cyan-300 font-bold hidden 2xl:table-cell">
                  1:{formation.riskRewardRatio}
                </td>

                {/* Actions */}
                <td className="py-3 px-2 sm:px-4 text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                    {onSendMetaScalp && (
                      <button
                        onClick={() => onSendMetaScalp(coin)}
                        className="p-1 sm:p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-all active:scale-95"
                        title={`Відкрити в MetaScalp (Група ${metaScalpBinding})`}
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                      </button>
                    )}
                    {onOpenAlert && (
                      <button
                        onClick={() => onOpenAlert(coin, formation)}
                        className="p-1 sm:p-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30 transition-colors"
                        title="Сповіщення ціни в Telegram"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => onSelect(coin, formation)}
                      className="p-1 sm:p-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 transition-colors"
                      title="Відкрити графік"
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={coin.exchangeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 sm:p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors hidden xs:inline-flex"
                      title={`Відкрити на ${coin.exchange}`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

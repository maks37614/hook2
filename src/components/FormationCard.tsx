import React, { useState, useEffect } from 'react';
import { ExternalLink, TrendingUp, TrendingDown, Star, Target, ShieldAlert, BarChart2, Zap, Send, Radar, RefreshCw, X } from 'lucide-react';
import { ScannedCoin, DetectedFormation, Kline, Timeframe } from '../types';
import { formatCryptoPrice } from '../utils/formatters';
import { useArchive } from '../context/ArchiveContext';
import { useSurveillance } from '../context/SurveillanceContext';
import { TradingViewChart } from './TradingViewChart';

interface FormationCardProps {
  coin: ScannedCoin;
  formation: DetectedFormation;
  isWatchlisted: boolean;
  onToggleWatchlist: (symbol: string) => void;
  onSelect: (coin: ScannedCoin, formation: DetectedFormation) => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  onOpenAlert?: (coin: ScannedCoin, formation: DetectedFormation) => void;
}

export const FormationCard: React.FC<FormationCardProps> = ({
  coin,
  formation,
  isWatchlisted,
  onToggleWatchlist,
  onSelect,
  onSendMetaScalp,
  metaScalpBinding = '001',
  onOpenAlert,
}) => {
  const { isArchived } = useArchive();
  const archived = isArchived(coin.symbol, formation.id || formation.name);
  const { isCoinMonitored, addCoinToSurveillance, removeCoinFromSurveillance, coins: survCoins } = useSurveillance();
  const isMonitored = isCoinMonitored(coin.symbol, coin.exchange);

  const [isChartExpanded, setIsChartExpanded] = useState<boolean>(false);
  const [klines, setKlines] = useState<Kline[]>([]);
  const [loadingKlines, setLoadingKlines] = useState<boolean>(false);
  const [cardTimeframe, setCardTimeframe] = useState<Timeframe>(coin.timeframe || '1h');
  const [livePrice, setLivePrice] = useState<number>(coin.currentPrice);

  useEffect(() => {
    if (!isChartExpanded) return;
    let isCancelled = false;
    async function fetchCardKlines() {
      setLoadingKlines(true);
      try {
        const res = await fetch(
          `/api/klines?exchange=${coin.exchange}&market=${coin.marketType}&symbol=${coin.symbol}&timeframe=${cardTimeframe}&limit=200`
        );
        const data = await res.json();
        if (!isCancelled && data.success && Array.isArray(data.data)) {
          setKlines(data.data);
          if (data.data.length > 0) {
            setLivePrice(data.data[data.data.length - 1].close);
          }
        }
      } catch (err) {
        console.error('Failed to load card klines:', err);
      } finally {
        if (!isCancelled) setLoadingKlines(false);
      }
    }
    fetchCardKlines();
    return () => {
      isCancelled = true;
    };
  }, [isChartExpanded, cardTimeframe, coin]);

  const isPositive = coin.priceChange24h >= 0;
  const isBullish = formation.bias === 'bullish';
  const isBearish = formation.bias === 'bearish';

  const formatPrice = (price: number) => formatCryptoPrice(price);

  return (
    <div
      className={`bg-slate-900/80 border transition-all rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between hover:shadow-xl group h-[350px] ${
        isChartExpanded
          ? 'border-cyan-500 shadow-xl shadow-cyan-950/40 bg-slate-900'
          : 'border-slate-800 hover:border-slate-700 hover:shadow-cyan-950/20'
      }`}
    >
      {/* Top Bar: Only shown when NOT expanded */}
      {!isChartExpanded && (
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base text-white tracking-wide font-mono">
                  {coin.baseAsset}
                </span>
                <span className="text-xs text-slate-500 font-mono">/{coin.quoteAsset}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                    coin.exchange === 'binance'
                      ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                      : 'bg-orange-500/10 text-orange-300 border border-orange-500/20'
                  }`}
                >
                  {coin.exchange}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-medium">
                  {coin.marketType === 'futures' ? 'Futures' : 'Spot'}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                  {coin.timeframe}
                </span>
              </div>
            </div>
          </div>

          {/* Price & 24h Change */}
          <div className="text-right">
            <div className="font-mono font-bold text-sm text-slate-100">
              ${formatPrice(livePrice)}
            </div>
            <div
              className={`text-xs font-semibold flex items-center justify-end gap-0.5 ${
                isPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isPositive ? '+' : ''}{coin.priceChange24h.toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      {/* Middle Content: Either Formation Details or Clean TradingView Chart */}
      {isChartExpanded ? (
        <div className="flex-1 my-1 bg-slate-950 rounded-xl border border-slate-800 relative overflow-hidden">
          {loadingKlines && klines.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 z-10">
              <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
              <span className="text-[11px] text-slate-400">Завантаження...</span>
            </div>
          ) : null}
          <TradingViewChart
            klines={klines}
            formation={formation}
            symbol={coin.symbol}
            timeframe={cardTimeframe}
            exchange={coin.exchange}
            marketType={coin.marketType}
            showNavigationControls={false}
            onLivePriceUpdate={(p) => setLivePrice(p)}
            onTimeframeChange={(tf) => setCardTimeframe(tf)}
          />
        </div>
      ) : (
        <div className="space-y-2 my-1">
          {/* Formation Info Block */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-bold text-xs text-slate-200 truncate" title={formation.name}>
                {formation.name}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
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

            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
              <span>Статус:</span>
              <span className="font-medium text-slate-300 bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px]">
                {formation.statusLabel}
              </span>
            </div>

            {/* Confidence meter */}
            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                <span>Імовірність:</span>
                <span className="text-cyan-400 font-mono font-bold">{formation.confidence}%</span>
              </div>
              <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    formation.confidence >= 85
                      ? 'bg-gradient-to-r from-cyan-500 to-emerald-400'
                      : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                  }`}
                  style={{ width: `${formation.confidence}%` }}
                />
              </div>
            </div>
          </div>

          {/* Trade Geometry: Target, Stop Loss, Risk/Reward */}
          <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
            <div className="bg-slate-950/50 border border-slate-800/60 p-1.5 rounded-lg min-w-0">
              <div className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5 truncate">
                <Target className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                <span className="truncate">Ціль</span>
              </div>
              <div className="font-mono font-bold text-emerald-400 text-xs mt-0.5">
                +{formation.potentialProfitPct}%
              </div>
              <div className="text-[9px] text-slate-500 font-mono truncate">
                ${formatPrice(formation.levels.targetPrice)}
              </div>
            </div>

            <div className="bg-slate-950/50 border border-slate-800/60 p-1.5 rounded-lg min-w-0">
              <div className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5 truncate">
                <ShieldAlert className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                <span className="truncate">Стоп</span>
              </div>
              <div className="font-mono font-bold text-rose-400 text-xs mt-0.5">
                -{Math.abs(formation.potentialRiskPct)}%
              </div>
              <div className="text-[9px] text-slate-500 font-mono truncate">
                ${formatPrice(formation.levels.stopLossPrice)}
              </div>
            </div>

            <div className="bg-slate-950/50 border border-slate-800/60 p-1.5 rounded-lg min-w-0">
              <div className="text-[10px] text-slate-400 truncate">Вхід / R:R</div>
              <div className="font-mono font-bold text-sky-400 text-xs mt-0.5 truncate">
                ${formatPrice(formation.levels.entryPrice)}
              </div>
              <div className="text-[9px] text-cyan-300 font-mono font-medium">
                1:{formation.riskRewardRatio}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsChartExpanded((prev) => !prev)}
            className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl border text-xs font-semibold transition-colors ${
              isChartExpanded
                ? 'bg-cyan-600 border-cyan-500 text-white shadow-md shadow-cyan-950/40'
                : 'bg-cyan-600/20 hover:bg-cyan-600/30 border-cyan-500/30 text-cyan-300'
            }`}
            title="Висунути інтерактивний графік усередині блоку"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>{isChartExpanded ? 'Інфо' : 'Шторка'}</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(coin, formation);
            }}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition-colors shadow-sm"
            title="Перейти у детальний огляд"
          >
            <span>Детальний огляд</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        {!isChartExpanded && (
          <div className="flex items-center gap-2">
            {onSendMetaScalp && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSendMetaScalp(coin);
                }}
                title={`Відкрити в MetaScalp (Група ${metaScalpBinding})`}
                className="flex items-center gap-1 py-1.5 px-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:text-amber-200 text-xs font-semibold transition-all active:scale-95"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
                <span className="hidden sm:inline">MetaScalp</span>
              </button>
            )}

            {onOpenAlert && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAlert(coin, formation);
                }}
                title="Створити сповіщення ціни в Telegram"
                className="p-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 hover:text-sky-300 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (isMonitored) {
                  const found = survCoins.find((c) => c.symbol === coin.symbol && c.exchange === coin.exchange);
                  if (found) await removeCoinFromSurveillance(found.id);
                } else {
                  await addCoinToSurveillance(coin.symbol, coin.exchange, coin.marketType);
                }
              }}
              title={isMonitored ? 'Монета на системному нагляді' : 'Взяти на системний нагляд'}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                isMonitored
                  ? 'bg-violet-500/20 border-violet-500/40 text-violet-400'
                  : 'bg-slate-800/70 hover:bg-slate-800 border-slate-700/60 text-slate-400 hover:text-violet-400'
              }`}
            >
              <Radar className={`w-3.5 h-3.5 ${isMonitored ? 'animate-pulse' : ''}`} />
            </button>

            <button
              onClick={() => onToggleWatchlist(coin.symbol)}
              title={isWatchlisted ? 'Видалити з обраного' : 'Додати в обране'}
              className={`p-2 rounded-xl border transition-colors ${
                isWatchlisted
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                  : 'bg-slate-800/70 hover:bg-slate-800 border-slate-700/60 text-slate-400 hover:text-amber-400'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${isWatchlisted ? 'fill-amber-400' : ''}`} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

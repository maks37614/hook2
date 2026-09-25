import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  GripVertical,
  Maximize2,
  Minimize2,
  Trash2,
  Zap,
  Send,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  Search,
  Sparkles,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Columns,
  Eye,
  Activity,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import {
  TerminalChartBlock,
  ScannedCoin,
  DetectedFormation,
  ExchangeId,
  MarketType,
  Kline,
} from '../../types';
import { formatCryptoPrice, formatVolume } from '../../utils/formatters';
import { TradingViewChart } from '../TradingViewChart';
import { fetchDirectKlines } from '../../utils/directExchangeClient';

interface TerminalChartWidgetProps {
  block: TerminalChartBlock;
  coin?: ScannedCoin;
  allCoins: ScannedCoin[];
  isSingleBlock: boolean;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onRemove: () => void;
  onUpdateBlock: (updated: Partial<TerminalChartBlock>) => void;
  onOpenFullscreenModal?: (coin: ScannedCoin, formation?: DetectedFormation) => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  onOpenTelegramAlerts?: (prefill?: any) => void;
  onMove?: (direction: 'left' | 'right') => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  heightStyle?: string;
}

export const TerminalChartWidget: React.FC<TerminalChartWidgetProps> = ({
  block,
  coin,
  allCoins,
  isSingleBlock,
  isMaximized,
  onToggleMaximize,
  onRemove,
  onUpdateBlock,
  onOpenFullscreenModal,
  onSendMetaScalp,
  metaScalpBinding = '001',
  onOpenTelegramAlerts,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
  heightStyle,
}) => {
  // Coin switcher popup state
  const [isCoinPickerOpen, setIsCoinPickerOpen] = useState(false);
  const [coinSearch, setCoinSearch] = useState('');
  const [isSpanPickerOpen, setIsSpanPickerOpen] = useState(false);
  const [showDrawingToolbar, setShowDrawingToolbar] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('terminal_widget_show_toolbar');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const handleToggleToolbar = useCallback(() => {
    setShowDrawingToolbar((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('terminal_widget_show_toolbar', String(next));
      } catch {}
      return next;
    });
  }, []);

  // Klines for Pattern mode
  const [klines, setKlines] = useState<Kline[]>([]);
  const [loadingKlines, setLoadingKlines] = useState(false);
  const [livePrice, setLivePrice] = useState<number>(coin?.currentPrice || 0);

  // Update livePrice when coin prop changes
  useEffect(() => {
    if (coin?.currentPrice) {
      setLivePrice(coin.currentPrice);
    }
  }, [coin?.currentPrice]);

  // Active formation if any
  const activeFormation = useMemo(() => {
    if (!coin?.formations || coin.formations.length === 0) return null;
    if (block.formationId) {
      const match = coin.formations.find((f) => f.id === block.formationId);
      if (match) return match;
    }
    return coin.formations[0];
  }, [coin?.formations, block.formationId]);

  // Load Klines if pattern mode is active
  useEffect(() => {
    if (block.mode !== 'pattern') return;

    let isMounted = true;
    const loadKlines = async () => {
      setLoadingKlines(true);
      let loaded = false;
      try {
        const res = await fetch(
          `/api/klines?exchange=${block.exchange}&market=${block.marketType}&symbol=${block.symbol}&timeframe=${block.timeframe}&limit=300`
        );
        const json = await res.json();
        if (isMounted && json.success && Array.isArray(json.data) && json.data.length > 0) {
          setKlines(json.data);
          const lastClose = json.data[json.data.length - 1].close;
          setLivePrice(lastClose);
          loaded = true;
        }
      } catch (err) {
        console.warn('Backend klines failed for block, falling back to direct exchange:', block.symbol);
      }

      if (!loaded) {
        try {
          const direct = await fetchDirectKlines(block.exchange, block.marketType, block.symbol, block.timeframe, 300);
          if (isMounted && direct.length > 0) {
            setKlines(direct);
            const lastClose = direct[direct.length - 1].close;
            setLivePrice(lastClose);
            loaded = true;
          }
        } catch (directErr) {
          console.error('Direct klines failed:', directErr);
        }
      }

      if (isMounted) setLoadingKlines(false);
    };

    loadKlines();
    return () => {
      isMounted = false;
    };
  }, [block.symbol, block.timeframe, block.exchange, block.marketType, block.mode]);

  // Construct TradingView Embed URL
  const tradingViewUrl = useMemo(() => {
    const cleanSymbol = block.symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const isBybit = block.exchange === 'bybit';
    const isFutures = block.marketType === 'futures';

    let tvPrefix = isBybit ? 'BYBIT' : 'BINANCE';
    let tvSymbol = isFutures ? `${tvPrefix}:${cleanSymbol}.P` : `${tvPrefix}:${cleanSymbol}`;

    let interval = '15';
    switch (block.timeframe) {
      case '1m': interval = '1'; break;
      case '5m': interval = '5'; break;
      case '15m': interval = '15'; break;
      case '1h': interval = '60'; break;
      case '4h': interval = '240'; break;
      case '1d': interval = 'D'; break;
      default: interval = '15';
    }

    const params = new URLSearchParams({
      symbol: tvSymbol,
      interval: interval,
      theme: 'dark',
      style: '1',
      timezone: 'exchange',
      withdateranges: '0',
      hide_top_toolbar: '1',
      hide_side_toolbar: '0',
      allow_symbol_change: '0',
      save_image: '0',
      hide_legend: '1',
      locale: 'uk',
      toolbar_bg: '#090d16',
      gridColor: 'rgba(0,0,0,0)',
      gridTransparency: '100',
    });

    return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
  }, [block.symbol, block.exchange, block.marketType, block.timeframe]);

  // Filtered coins for in-place switcher
  const filteredCoins = useMemo(() => {
    if (!coinSearch.trim()) return allCoins.slice(0, 30);
    const q = coinSearch.toLowerCase().trim();
    return allCoins
      .filter((c) => c.symbol.toLowerCase().includes(q) || c.baseAsset.toLowerCase().includes(q))
      .slice(0, 30);
  }, [allCoins, coinSearch]);

  // Compute CSS column span class
  const colSpanClass = useMemo(() => {
    if (isSingleBlock || isMaximized) return 'col-span-full';
    switch (block.colSpan) {
      case 2: return 'col-span-1 md:col-span-2';
      case 3: return 'col-span-1 md:col-span-2 lg:col-span-3';
      case 4:
      case 'full': return 'col-span-full';
      default: return 'col-span-1';
    }
  }, [block.colSpan, isSingleBlock, isMaximized]);

  return (
    <div
      draggable={!isSingleBlock && !isMaximized}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`relative flex flex-col bg-[#090d16] border border-slate-800 rounded-xl overflow-hidden shadow-lg transition-all duration-150 ${colSpanClass} ${
        isMaximized ? 'fixed inset-2 sm:inset-4 z-50 rounded-2xl border-cyan-500/50 shadow-2xl shadow-cyan-950/50' : ''
      }`}
      style={{
        height: isMaximized
          ? 'calc(100vh - 2rem)'
          : block.heightPx
          ? `${block.heightPx}px`
          : heightStyle || undefined,
        minHeight: isSingleBlock || isMaximized ? '420px' : '360px',
      }}
    >
      {/* Block Top Header Bar */}
      <div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 bg-slate-950 border-b border-slate-800/90 text-xs shrink-0 select-none">
        {/* Left: Drag Handle, Coin Selector, Exchange Badge */}
        <div className="flex items-center gap-1.5 min-w-0">
          {!isSingleBlock && !isMaximized && (
            <div
              className="p-1 rounded text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing hover:bg-slate-800/60"
              title="Перетягнути для зміни позиції"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
          )}

          {/* Quick Swap/Move arrows on desktop */}
          {!isSingleBlock && !isMaximized && onMove && (
            <div className="hidden xl:flex items-center text-slate-500">
              <button
                onClick={() => onMove('left')}
                className="p-0.5 hover:text-white hover:bg-slate-800 rounded"
                title="Перемістити ліворуч"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => onMove('right')}
                className="p-0.5 hover:text-white hover:bg-slate-800 rounded"
                title="Перемістити праворуч"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Coin Selector Dropdown trigger */}
          <div className="relative">
            <button
              onClick={() => setIsCoinPickerOpen(!isCoinPickerOpen)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 font-mono font-bold text-white transition-colors cursor-pointer"
              title="Змінити монету"
            >
              <span>{block.symbol}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* In-place Coin Switcher Popover */}
            {isCoinPickerOpen && (
              <div
                className="absolute left-0 top-full mt-1.5 z-40 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-2 border-b border-slate-800 bg-slate-950">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={coinSearch}
                      onChange={(e) => setCoinSearch(e.target.value)}
                      placeholder="Швидкий пошук..."
                      autoFocus
                      className="w-full pl-7 pr-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/60 p-1">
                  {filteredCoins.map((c) => (
                    <button
                      key={`${c.exchange}-${c.symbol}`}
                      onClick={() => {
                        onUpdateBlock({
                          symbol: c.symbol,
                          baseAsset: c.baseAsset,
                          quoteAsset: c.quoteAsset,
                          exchange: c.exchange,
                          marketType: c.marketType,
                          formationId: c.formations?.[0]?.id,
                        });
                        setIsCoinPickerOpen(false);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800 flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-white">{c.symbol}</span>
                        <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-400 uppercase">
                          {c.exchange}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-300">
                        ${formatCryptoPrice(c.currentPrice)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Exchange badge (click to toggle exchange if available) */}
          <button
            onClick={() =>
              onUpdateBlock({
                exchange: block.exchange === 'binance' ? 'bybit' : 'binance',
              })
            }
            className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase cursor-pointer transition-colors ${
              block.exchange === 'binance'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-orange-500/15 text-orange-300 border border-orange-500/30 hover:bg-orange-500/25'
            }`}
            title="Клікніть щоб змінити біржу (Binance / Bybit)"
          >
            {block.exchange}
          </button>

          {/* Market Type badge (Spot / Futures) */}
          <button
            onClick={() =>
              onUpdateBlock({
                marketType: block.marketType === 'futures' ? 'spot' : 'futures',
              })
            }
            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 uppercase cursor-pointer"
            title="Клікніть щоб змінити тип ринку (Perp / Spot)"
          >
            {block.marketType === 'futures' ? 'Perp' : 'Spot'}
          </button>

        </div>

        {/* Right: MetaScalp, Telegram, Maximize, Close */}
        <div className="flex items-center gap-1 shrink-0">
          {/* MetaScalp send button */}
          {coin && onSendMetaScalp && (
            <button
              onClick={() => onSendMetaScalp(coin)}
              className="p-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors"
              title={`Надіслати в MetaScalp (${metaScalpBinding})`}
            >
              <Zap className="w-3 h-3 text-amber-400" />
            </button>
          )}

          {/* Telegram Alert quick button */}
          {coin && onOpenTelegramAlerts && (
            <button
              onClick={() =>
                onOpenTelegramAlerts({
                  symbol: coin.symbol,
                  exchange: coin.exchange,
                  marketType: coin.marketType,
                  currentPrice: livePrice,
                  targetPrice: activeFormation?.levels?.targetPrice,
                  formationName: activeFormation?.name,
                })
              }
              className="p-1 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 transition-colors"
              title="Налаштувати алерт у Telegram"
            >
              <Send className="w-3 h-3 text-sky-400" />
            </button>
          )}

          {/* Col Span Adjuster (Width) */}
          {!isSingleBlock && !isMaximized && (
            <div className="relative hidden md:block">
              <button
                onClick={() => setIsSpanPickerOpen(!isSpanPickerOpen)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Ширина та висота блоку"
              >
                <Columns className="w-3 h-3" />
              </button>

              {isSpanPickerOpen && (
                <div
                  className="absolute right-0 top-full mt-1 z-40 bg-slate-900 border border-slate-700 rounded-xl p-1 shadow-xl flex flex-col gap-0.5 text-[11px] whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      onUpdateBlock({ colSpan: 1 });
                      setIsSpanPickerOpen(false);
                    }}
                    className={`px-2 py-1 rounded text-left hover:bg-slate-800 ${
                      block.colSpan === 1 || !block.colSpan ? 'text-cyan-300 font-bold' : 'text-slate-300'
                    }`}
                  >
                    1 колонка (Стандарт)
                  </button>
                  <button
                    onClick={() => {
                      onUpdateBlock({ colSpan: 2 });
                      setIsSpanPickerOpen(false);
                    }}
                    className={`px-2 py-1 rounded text-left hover:bg-slate-800 ${
                      block.colSpan === 2 ? 'text-cyan-300 font-bold' : 'text-slate-300'
                    }`}
                  >
                    2 колонки (Широкий)
                  </button>
                  <button
                    onClick={() => {
                      onUpdateBlock({ colSpan: 3 });
                      setIsSpanPickerOpen(false);
                    }}
                    className={`px-2 py-1 rounded text-left hover:bg-slate-800 ${
                      block.colSpan === 3 ? 'text-cyan-300 font-bold' : 'text-slate-300'
                    }`}
                  >
                    3 колонки (Дуже широкий)
                  </button>
                  <button
                    onClick={() => {
                      onUpdateBlock({ colSpan: 'full' });
                      setIsSpanPickerOpen(false);
                    }}
                    className={`px-2 py-1 rounded text-left hover:bg-slate-800 ${
                      block.colSpan === 'full' ? 'text-cyan-300 font-bold' : 'text-slate-300'
                    }`}
                  >
                    Повна ширина
                  </button>
                  <div className="my-1 border-t border-slate-800" />
                  <div className="px-2 pt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Висота графіка
                  </div>
                  {[
                    { px: 280, label: 'Мінімум' },
                    { px: 380, label: 'Компактний' },
                    { px: 480, label: 'Стандартний' },
                    { px: 620, label: 'Високий' },
                  ].map((height) => (
                    <button
                      key={height.px}
                      onClick={() => {
                        onUpdateBlock({ heightPx: height.px });
                        setIsSpanPickerOpen(false);
                      }}
                      className={`px-2 py-1 rounded text-left hover:bg-slate-800 ${
                        block.heightPx === height.px ? 'text-cyan-300 font-bold' : 'text-slate-300'
                      }`}
                    >
                      {height.label} ({height.px}px)
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      onUpdateBlock({ heightPx: undefined });
                      setIsSpanPickerOpen(false);
                    }}
                    className="px-2 py-1 rounded text-left text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  >
                    Автоматична висота
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Toggle Drawing Toolbar button */}
          {block.mode === 'tradingview' && (
            <button
              onClick={handleToggleToolbar}
              className={`p-1 rounded transition-colors ${
                showDrawingToolbar
                  ? 'text-cyan-400 bg-cyan-950/50 hover:bg-cyan-900/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={showDrawingToolbar ? 'Сховати панель інструментів на графіку' : 'Показати панель інструментів на графіку'}
              aria-label={showDrawingToolbar ? 'Сховати панель інструментів на графіку' : 'Показати панель інструментів на графіку'}
            >
              {showDrawingToolbar ? <PanelLeftClose className="w-3 h-3" /> : <PanelLeftOpen className="w-3 h-3" />}
            </button>
          )}

          {/* Fullscreen Modal trigger (open full analysis) */}
          {coin && onOpenFullscreenModal && (
            <button
              onClick={() => onOpenFullscreenModal(coin, activeFormation || undefined)}
              className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors hidden sm:block"
              title="Відкрити детальний графік з розширеним аналізом"
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          )}

          {/* Maximize within terminal */}
          {!isSingleBlock && (
            <button
              onClick={onToggleMaximize}
              className={`p-1 rounded transition-colors ${
                isMaximized
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={isMaximized ? 'Зменшити графік' : 'Розгорнути на весь екран термінала'}
            >
              {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </button>
          )}

          {/* Remove / Close Block button */}
          <button
            onClick={onRemove}
            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
            title="Закрити графік"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main Chart Body */}
      <div className="flex-1 w-full relative bg-[#090d16] overflow-hidden">
        {block.mode === 'tradingview' ? (
          <>
            <div
              className={`absolute top-0 h-full transition-[width,left] duration-200 ease-in-out ${
                showDrawingToolbar ? 'left-0 w-full' : '-left-[54px] w-[calc(100%+54px)]'
              }`}
            >
              <iframe
                key={`tv-${block.symbol}-${block.exchange}-${block.marketType}-${block.timeframe}`}
                src={tradingViewUrl}
                className="w-full h-full border-0"
                title={`${block.symbol} TradingView Chart`}
                loading="lazy"
                allowFullScreen
              />
            </div>

            {/* Quick floating toggle button on the chart itself */}
            <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleToggleToolbar}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900/85 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-cyan-300 shadow-md backdrop-blur-sm transition-all cursor-pointer group"
                title={showDrawingToolbar ? 'Сховати панель інструментів' : 'Показати панель інструментів'}
                aria-label={showDrawingToolbar ? 'Сховати панель інструментів' : 'Показати панель інструментів'}
              >
                {showDrawingToolbar ? (
                  <PanelLeftClose className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
                ) : (
                  <PanelLeftOpen className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
                )}
              </button>
            </div>
          </>
        ) : loadingKlines ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2 bg-[#090d16]">
            <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
            <span className="text-xs">Завантаження свічок...</span>
          </div>
        ) : (
          <div className="w-full h-full absolute inset-0">
            <TradingViewChart
              klines={klines}
              formation={null}
              symbol={block.symbol}
              timeframe={block.timeframe}
              exchange={block.exchange}
              marketType={block.marketType}
              onLivePriceUpdate={setLivePrice}
              fullHeight={true}
              showNavigationControls={false}
            />
          </div>
        )}
      </div>

      {/* Bottom status strip */}
      <div className="px-2 py-0.5 bg-slate-950/80 border-t border-slate-800/60 text-[10px] text-slate-400 flex items-center justify-between font-mono shrink-0 select-none">
        <div className="flex items-center gap-2">
          {coin?.volume24hUsd && (
            <span>
              Об'єм 24г: <span className="text-slate-200">${formatVolume(coin.volume24hUsd)}</span>
            </span>
          )}
          {coin?.highPrice24h && (
            <span className="hidden sm:inline">
              Max: <span className="text-emerald-400">${formatCryptoPrice(coin.highPrice24h)}</span>
            </span>
          )}
          {coin?.lowPrice24h && (
            <span className="hidden sm:inline">
              Min: <span className="text-rose-400">${formatCryptoPrice(coin.lowPrice24h)}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] uppercase tracking-wider text-slate-400">Live</span>
        </div>
      </div>
    </div>
  );
};

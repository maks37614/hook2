import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  Send,
  Zap,
  Star,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  RefreshCw,
  Plus,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  ArrowLeft,
  X,
  Grid,
} from 'lucide-react';
import {
  TerminalChartBlock,
  TerminalWorkspaceConfig,
  ScannedCoin,
  DetectedFormation,
  Timeframe,
  ExchangeId,
  MarketType,
  Kline,
  TerminalBlockMode,
} from '../types';
import { TerminalChartWidget } from './terminal/TerminalChartWidget';
import { AddChartModal } from './terminal/AddChartModal';
import { TerminalSettingsDrawer } from './terminal/TerminalSettingsDrawer';
import { formatCryptoPrice, formatVolume } from '../utils/formatters';
import { getStoredPreferences, useAppPreferences } from '../utils/userPreferences';

interface TerminalPageProps {
  coins: ScannedCoin[];
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  onOpenTelegramAlerts?: (prefill?: any) => void;
  onOpenFullscreenModal?: (coin: ScannedCoin, formation?: DetectedFormation) => void;
  onReturnToPatterns?: () => void;
}

const STORAGE_BLOCKS_KEY = 'crypto_screener_terminal_blocks';
const STORAGE_CONFIG_KEY = 'crypto_screener_terminal_config';

const DEFAULT_CONFIG: TerminalWorkspaceConfig = {
  layoutPreset: 'custom',
  columns: 2,
  autoFitScreen: true,
  blocks: [],
  showFormations: true,
  blockHeight: 'medium',
};

export const TerminalPage: React.FC<TerminalPageProps> = ({
  coins,
  watchlist,
  onToggleWatchlist,
  onSendMetaScalp,
  metaScalpBinding = '001',
  onOpenTelegramAlerts,
  onOpenFullscreenModal,
  onReturnToPatterns,
}) => {
  const { preferences } = useAppPreferences();

  // Initialize blocks from localStorage or default to BTCUSDT with preferences
  const [blocks, setBlocks] = useState<TerminalChartBlock[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_BLOCKS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((b: any) => ({ ...b, mode: 'tradingview' as const }));
        }
      }
    } catch (e) {
      console.error('Failed to load saved terminal blocks:', e);
    }
    const prefs = getStoredPreferences();
    const defaultEx = prefs.defaultExchange === 'all' ? 'binance' : prefs.defaultExchange;
    const defaultMarket = prefs.defaultMarketType === 'all' ? 'futures' : prefs.defaultMarketType;
    return [
      {
        id: 'block-btc-default',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        exchange: defaultEx,
        marketType: defaultMarket,
        timeframe: prefs.defaultTimeframe,
        mode: 'tradingview',
        colSpan: 1,
      },
    ];
  });

  // Workspace configuration
  const [config, setConfig] = useState<TerminalWorkspaceConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (e) {}
    return DEFAULT_CONFIG;
  });

  // Active coin for single-chart full view (matching FullscreenChartModal)
  const [activeCoin, setActiveCoin] = useState<ScannedCoin>(() => {
    const firstBlock = blocks[0];
    const found = coins.find((c) => c.symbol === firstBlock?.symbol);
    if (found) return found;
    return {
      symbol: firstBlock?.symbol || 'BTCUSDT',
      baseAsset: firstBlock?.baseAsset || 'BTC',
      quoteAsset: firstBlock?.quoteAsset || 'USDT',
      exchange: firstBlock?.exchange || ('binance' as ExchangeId),
      marketType: firstBlock?.marketType || ('futures' as MarketType),
      currentPrice: 0,
      priceChange24h: 0,
      formations: [],
    } as unknown as ScannedCoin;
  });

  // Update activeCoin when coins prop arrives or blocks change
  useEffect(() => {
    if (blocks.length > 0) {
      const firstBlock = blocks[0];
      const match = coins.find(
        (c) =>
          c.symbol === firstBlock.symbol &&
          c.exchange === firstBlock.exchange &&
          c.marketType === firstBlock.marketType
      ) || coins.find((c) => c.symbol === firstBlock.symbol);

      if (match) {
        setActiveCoin((prev) => (prev.symbol === match.symbol ? { ...prev, ...match } : match));
      }
    }
  }, [coins, blocks]);

  const [timeframe, setTimeframe] = useState<Timeframe>(() => getStoredPreferences().defaultTimeframe);

  useEffect(() => {
    setTimeframe(preferences.defaultTimeframe);
  }, [preferences.defaultTimeframe]);
  const [isFavoritesDrawerOpen, setIsFavoritesDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showDrawingToolbar, setShowDrawingToolbar] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('fullscreen_show_drawing_toolbar');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [iframeLoading, setIframeLoading] = useState<boolean>(true);

  // Modal / Drawer state for multi-chart mode
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [maximizedBlockId, setMaximizedBlockId] = useState<string | null>(null);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null);

  // Watchlist synchronization
  const [localWatchlist, setLocalWatchlist] = useState<string[]>(() => {
    try {
      const initial = watchlist && watchlist.length > 0 ? watchlist : JSON.parse(localStorage.getItem('crypto_screener_watchlist') || '[]');
      return Array.isArray(initial) ? Array.from(new Set(initial)) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (watchlist && watchlist.length > 0) {
      setLocalWatchlist(Array.from(new Set(watchlist)));
    }
  }, [watchlist]);

  // Save blocks to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_BLOCKS_KEY, JSON.stringify(blocks));
    } catch (e) {}
  }, [blocks]);

  // Save config to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
    } catch (e) {}
  }, [config]);

  // Browser fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsBrowserFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handle Escape key to close drawer or return to screener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFavoritesDrawerOpen) {
          setIsFavoritesDrawerOpen(false);
        } else if (onReturnToPatterns) {
          e.preventDefault();
          onReturnToPatterns();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFavoritesDrawerOpen, onReturnToPatterns]);

  const toggleBrowserFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleToggleDrawingToolbar = useCallback(() => {
    setShowDrawingToolbar((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('fullscreen_show_drawing_toolbar', String(next));
      } catch {}
      return next;
    });
  }, []);

  // Watchlist favorites items
  const favoriteCoins = useMemo(() => {
    const uniqueSymbols: string[] = Array.from(new Set<string>(localWatchlist));
    const coinsMap = new Map<string, ScannedCoin>();
    coins.forEach((c) => {
      if (!coinsMap.has(c.symbol)) {
        coinsMap.set(c.symbol, c);
      }
    });

    return uniqueSymbols.map((sym: string) => {
      const found = coinsMap.get(sym);
      if (found) return found;
      const clean = sym.toUpperCase();
      const base = clean.replace(/(USDT|BUSD|USDC)$/, '') || clean;
      const quote = clean.slice(base.length) || 'USDT';
      return {
        symbol: clean,
        baseAsset: base,
        quoteAsset: quote,
        exchange: 'binance' as ExchangeId,
        marketType: 'futures' as MarketType,
        currentPrice: 0,
        priceChange24h: 0,
        formations: [],
      } as unknown as ScannedCoin;
    });
  }, [coins, localWatchlist]);

  const filteredFavorites = useMemo(() => {
    if (!searchQuery.trim()) return favoriteCoins;
    const q = searchQuery.toLowerCase().trim();
    return favoriteCoins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(q) ||
        c.baseAsset.toLowerCase().includes(q)
    );
  }, [favoriteCoins, searchQuery]);

  const handleRemoveFromWatchlist = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalWatchlist((prev) => {
      const next = prev.filter((s) => s !== sym);
      try {
        localStorage.setItem('crypto_screener_watchlist', JSON.stringify(next));
      } catch {}
      return next;
    });
    onToggleWatchlist?.(sym);
  };

  const handleSelectFavoriteCoin = (favCoin: ScannedCoin) => {
    setActiveCoin(favCoin);
    setIframeLoading(true);
    // Update the first block to match the selected coin
    if (blocks.length === 1) {
      setBlocks([
        {
          id: `block-${favCoin.symbol}-${Date.now()}`,
          symbol: favCoin.symbol,
          baseAsset: favCoin.baseAsset,
          quoteAsset: favCoin.quoteAsset,
          exchange: favCoin.exchange,
          marketType: favCoin.marketType,
          timeframe,
          mode: 'tradingview',
          colSpan: 1,
        },
      ]);
    }
  };

  // Build TradingView Embed URL
  const tradingViewUrl = useMemo(() => {
    const cleanSymbol = activeCoin.symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const isBybit = activeCoin.exchange === 'bybit';
    const isFutures = activeCoin.marketType === 'futures';

    const tvPrefix = isBybit ? 'BYBIT' : 'BINANCE';
    const tvSymbol = isFutures ? `${tvPrefix}:${cleanSymbol}.P` : `${tvPrefix}:${cleanSymbol}`;

    let interval = '15';
    switch (timeframe) {
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
  }, [activeCoin.symbol, activeCoin.exchange, activeCoin.marketType, timeframe]);

  // Block management
  const handleAddChart = (
    coin: ScannedCoin,
    tf: Timeframe,
    mode: TerminalBlockMode,
    formationId?: string
  ) => {
    const newBlock: TerminalChartBlock = {
      id: `block-${coin.symbol}-${Date.now()}`,
      symbol: coin.symbol,
      baseAsset: coin.baseAsset,
      quoteAsset: coin.quoteAsset,
      exchange: coin.exchange,
      marketType: coin.marketType,
      timeframe: tf || config.globalTimeframe || '15m',
      mode: mode || 'tradingview',
      formationId,
      colSpan: 1,
    };
    setBlocks((prev) => [...prev, newBlock]);
  };

  const handleUpdateBlock = (blockId: string, updated: Partial<TerminalChartBlock>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, ...updated } : b))
    );
  };

  const handleRemoveBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    if (maximizedBlockId === blockId) {
      setMaximizedBlockId(null);
    }
  };

  const handleMoveBlock = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;

    setBlocks((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const handleDragStart = (index: number) => {
    setDraggedBlockIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedBlockIndex === null || draggedBlockIndex === targetIndex) return;
    setBlocks((prev) => {
      const updated = [...prev];
      const [movedItem] = updated.splice(draggedBlockIndex, 1);
      updated.splice(targetIndex, 0, movedItem);
      return updated;
    });
    setDraggedBlockIndex(null);
  };

  const handleApplyGlobalTimeframe = (tf: Timeframe) => {
    setTimeframe(tf);
    setConfig((prev) => ({ ...prev, globalTimeframe: tf }));
    setBlocks((prev) => prev.map((b) => ({ ...b, timeframe: tf })));
  };

  const handleTimeframeSelect = (tf: Timeframe) => {
    setTimeframe(tf);
    handleApplyGlobalTimeframe(tf);
    setIframeLoading(true);
  };

  const handleApplyPreset = (presetKey: 'focus_btc' | 'top_3' | 'top_4_patterns' | 'grid_4') => {
    if (presetKey === 'focus_btc') {
      const btc = coins.find((c) => c.symbol === 'BTCUSDT') || {
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        exchange: 'binance' as ExchangeId,
        marketType: 'futures' as MarketType,
      };
      setBlocks([
        {
          id: `block-btc-${Date.now()}`,
          symbol: btc.symbol,
          baseAsset: btc.baseAsset,
          quoteAsset: btc.quoteAsset,
          exchange: btc.exchange,
          marketType: btc.marketType,
          timeframe: '15m',
          mode: 'tradingview',
          colSpan: 'full',
        },
      ]);
      setConfig((prev) => ({ ...prev, layoutPreset: '1x1', columns: 1, autoFitScreen: true }));
    } else if (presetKey === 'top_3') {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      const newBlocks = symbols.map((sym, i) => {
        const c = coins.find((coin) => coin.symbol === sym) || {
          symbol: sym,
          baseAsset: sym.replace('USDT', ''),
          quoteAsset: 'USDT',
          exchange: 'binance' as ExchangeId,
          marketType: 'futures' as MarketType,
        };
        return {
          id: `block-${sym}-${Date.now()}-${i}`,
          symbol: c.symbol,
          baseAsset: c.baseAsset,
          quoteAsset: c.quoteAsset,
          exchange: c.exchange,
          marketType: c.marketType,
          timeframe: '15m' as Timeframe,
          mode: 'tradingview' as const,
          colSpan: (i === 0 ? 2 : 1) as any,
        };
      });
      setBlocks(newBlocks);
      setConfig((prev) => ({ ...prev, layoutPreset: 'custom', columns: 2, autoFitScreen: true }));
    } else if (presetKey === 'grid_4') {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'SUIUSDT'];
      const newBlocks = symbols.map((sym, i) => {
        const c = coins.find((coin) => coin.symbol === sym) || {
          symbol: sym,
          baseAsset: sym.replace('USDT', ''),
          quoteAsset: 'USDT',
          exchange: 'binance' as ExchangeId,
          marketType: 'futures' as MarketType,
        };
        return {
          id: `block-${sym}-${Date.now()}-${i}`,
          symbol: c.symbol,
          baseAsset: c.baseAsset,
          quoteAsset: c.quoteAsset,
          exchange: c.exchange,
          marketType: c.marketType,
          timeframe: '15m' as Timeframe,
          mode: 'tradingview' as const,
          colSpan: 1 as const,
        };
      });
      setBlocks(newBlocks);
      setConfig((prev) => ({ ...prev, layoutPreset: '2x2', columns: 2, autoFitScreen: true }));
    } else if (presetKey === 'top_4_patterns') {
      const coinsWithPatterns = coins
        .filter((c) => c.formations && c.formations.length > 0)
        .slice(0, 4);

      if (coinsWithPatterns.length > 0) {
        const newBlocks = coinsWithPatterns.map((c, i) => ({
          id: `block-pattern-${c.symbol}-${Date.now()}-${i}`,
          symbol: c.symbol,
          baseAsset: c.baseAsset,
          quoteAsset: c.quoteAsset,
          exchange: c.exchange,
          marketType: c.marketType,
          timeframe: c.timeframe || '15m',
          mode: 'tradingview' as const,
          formationId: c.formations[0]?.id,
          colSpan: 1 as const,
        }));
        setBlocks(newBlocks);
        setConfig((prev) => ({ ...prev, layoutPreset: '2x2', columns: 2, autoFitScreen: true }));
      }
    }
  };

  const handleResetWorkspace = () => {
    setBlocks([]);
    setMaximizedBlockId(null);
  };

  const getCoinForBlock = useCallback(
    (block: TerminalChartBlock): ScannedCoin | undefined => {
      return coins.find(
        (c) =>
          c.symbol === block.symbol &&
          c.exchange === block.exchange &&
          c.marketType === block.marketType
      ) || coins.find((c) => c.symbol === block.symbol);
    },
    [coins]
  );

  const gridColsClass = useMemo(() => {
    if (blocks.length === 1) return 'grid-cols-1';
    switch (config.columns) {
      case 1: return 'grid-cols-1';
      case 2: return 'grid-cols-1 md:grid-cols-2';
      case 3: return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
      case 4: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
      default: return 'grid-cols-1 md:grid-cols-2';
    }
  }, [config.columns, blocks.length]);

  const computedHeightStyle = useMemo(() => {
    if (blocks.length === 1) {
      return 'calc(100vh - 105px)';
    }

    if (!config.autoFitScreen) {
      switch (config.blockHeight) {
        case 'compact': return '280px';
        case 'medium': return '380px';
        case 'large': return '500px';
        default: return '380px';
      }
    }

    const cols = config.columns || 2;
    const total = blocks.length;
    const rows = Math.ceil(total / cols);

    if (rows <= 1) {
      return 'calc(100vh - 110px)';
    } else if (rows === 2) {
      return 'calc((100vh - 120px) / 2)';
    } else {
      return 'calc((100vh - 130px) / 3)';
    }
  }, [blocks.length, config.autoFitScreen, config.blockHeight, config.columns]);

  const formation = activeCoin.formations?.[0] || null;
  const isBullish = formation?.bias === 'bullish';
  const isBearish = formation?.bias === 'bearish';

  return (
    <div
      className="fixed inset-0 z-40 w-screen h-[100dvh] max-h-[100dvh] min-h-[100dvh] bg-[#090d16] flex flex-col overflow-hidden select-none animate-in fade-in duration-200"
      role="region"
      aria-label="Термінал трейдера"
    >
      {/* Top Header & Controls — Exactly styled like FullscreenChartModal */}
      <header className="h-12 sm:h-14 bg-slate-950/95 border-b border-slate-800 px-2.5 sm:px-4 flex items-center justify-between gap-2 shrink-0 z-20 overflow-x-auto no-scrollbar touch-scroll">
        {/* Left: Exit/Back button, Watchlist Drawer Toggle, Symbol info, Price badge */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {onReturnToPatterns && (
            <button
              onClick={onReturnToPatterns}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all cursor-pointer group shrink-0"
              title="Вийти з терміналу (Esc)"
              aria-label="Вийти з терміналу"
            >
              <Minimize2 className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span className="hidden md:inline font-sans">Вийти</span>
              <kbd className="hidden lg:inline-block px-1.5 py-0.2 rounded bg-slate-900 text-[10px] text-slate-400 font-mono border border-slate-800">
                Esc
              </kbd>
            </button>
          )}

          {/* Toggle Left Favorites Drawer Button */}
          <button
            onClick={() => setIsFavoritesDrawerOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
              isFavoritesDrawerOpen
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-950/40'
                : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:text-white hover:border-slate-700'
            }`}
            title={isFavoritesDrawerOpen ? 'Сховати шторку обраних монет' : 'Відкрити шторку обраних монет'}
          >
            <Star className={`w-3.5 h-3.5 text-amber-400 ${localWatchlist.length > 0 ? 'fill-amber-400' : ''}`} />
            <span className="hidden xs:inline">Обрані монети</span>
            <span className="text-[10px] font-mono font-bold text-amber-300">
              {localWatchlist.length}
            </span>
          </button>

        </div>

        {/* Center: Timeframe Selector & Layout Presets */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">

          {/* Timeframe selector */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs font-mono">
            {(['1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => {
                  setTimeframe(tf);
                  handleApplyGlobalTimeframe(tf);
                  setIframeLoading(true);
                }}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                  timeframe === tf
                    ? 'bg-cyan-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Layout Grid Switcher (1x1, 2x1, 2x2, 3 cols) */}
          <div className="hidden lg:flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs font-mono">
            <button
              onClick={() => {
                setConfig((prev) => ({ ...prev, layoutPreset: '1x1', columns: 1, autoFitScreen: true }));
                if (blocks.length > 1) {
                  setBlocks([blocks[0]]);
                }
              }}
              className={`px-2 py-1 rounded-lg transition-colors ${
                blocks.length <= 1 && config.columns === 1
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="1 Графік (на весь екран)"
            >
              1x1
            </button>
            <button
              onClick={() => {
                setConfig((prev) => ({ ...prev, layoutPreset: '1x2', columns: 2, autoFitScreen: true }));
                if (blocks.length < 2) {
                  handleApplyPreset('top_3');
                }
              }}
              className={`px-2 py-1 rounded-lg transition-colors ${
                config.columns === 2
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="2 Колонки"
            >
              2x
            </button>
            <button
              onClick={() => {
                setConfig((prev) => ({ ...prev, layoutPreset: 'custom', columns: 3, autoFitScreen: true }));
                if (blocks.length < 3) {
                  handleApplyPreset('top_3');
                }
              }}
              className={`px-2 py-1 rounded-lg transition-colors ${
                config.columns === 3
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="3 Колонки"
            >
              3x
            </button>
            <button
              onClick={() => {
                setConfig((prev) => ({ ...prev, layoutPreset: 'custom', columns: 4, autoFitScreen: true }));
                if (blocks.length < 4) {
                  handleApplyPreset('grid_4');
                }
              }}
              className={`px-2 py-1 rounded-lg transition-colors ${
                config.columns === 4
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="4 Колонки"
            >
              4x
            </button>
          </div>
        </div>

        {/* Right: Add Chart, Telegram, MetaScalp, Settings, Fullscreen */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Add Chart Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold text-xs shadow-md shadow-cyan-900/30 transition-all active:scale-95 cursor-pointer"
            title="Додати новий блок з графіком монети"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Додати графік</span>
          </button>

          {/* Telegram Alert shortcut */}
          {onOpenTelegramAlerts && (
            <button
              onClick={() =>
                onOpenTelegramAlerts({
                  symbol: activeCoin.symbol,
                  exchange: activeCoin.exchange,
                  marketType: activeCoin.marketType,
                  currentPrice: activeCoin.currentPrice,
                  targetPrice: formation?.levels?.targetPrice,
                  formationName: formation?.name,
                })
              }
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              title="Створити сповіщення в Telegram"
            >
              <Send className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden xl:inline">Сповіщення</span>
            </button>
          )}

          {/* MetaScalp shortcut */}
          {onSendMetaScalp && (
            <button
              onClick={() => onSendMetaScalp(activeCoin)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              title={`Надіслати в MetaScalp (Група ${metaScalpBinding})`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
              <span className="hidden xl:inline">MetaScalp</span>
            </button>
          )}

          {/* Settings Drawer */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Налаштування робочого простору"
          >
            <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
          </button>

          {/* Browser Fullscreen Button */}
          <button
            onClick={toggleBrowserFullscreen}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title={isBrowserFullscreen ? 'Вийти з повноекранного режиму' : 'На весь екран браузера'}
          >
            {isBrowserFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Close / Return X button */}
          {onReturnToPatterns && (
            <button
              onClick={onReturnToPatterns}
              className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors cursor-pointer"
              title="Закрити термінал (повернутися до скрінера)"
              aria-label="Закрити термінал"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Sub-header: 24h Coin Market Stats Bar */}
      {blocks.length <= 1 && (
        <div className="h-8 sm:h-9 bg-slate-950/80 border-b border-slate-800/80 px-3 sm:px-4 flex items-center justify-between gap-2 text-[11px] font-mono shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-3 sm:gap-6 shrink-0">
            <span className="flex items-center gap-1 text-slate-300">
              Об'єм 24г: <strong className="text-white">${formatVolume(activeCoin.volume24hUsd || 0)}</strong>
            </span>
            {activeCoin.highPrice24h ? (
              <span className="flex items-center gap-1 text-emerald-400">
                Max 24г: <strong>${formatCryptoPrice(activeCoin.highPrice24h)}</strong>
              </span>
            ) : null}
            {activeCoin.lowPrice24h ? (
              <span className="flex items-center gap-1 text-rose-400">
                Min 24г: <strong>${formatCryptoPrice(activeCoin.lowPrice24h)}</strong>
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3 text-slate-400 text-[11px] shrink-0">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Синхронізація: <strong className="text-cyan-400 font-bold">WLive</strong>
            </span>
            <span className="text-slate-500">|</span>
            <span>
              Таймфрейм: <strong className="text-cyan-400 font-bold">{timeframe}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Main Content Area (100% remaining space) */}
      <main className="flex-1 w-full h-full relative overflow-hidden bg-[#090d16]">
        {/* Collapsible Left Drawer (Шторка зліва з обраними монетами) */}
        <div
          className={`absolute top-0 bottom-0 left-0 z-30 w-72 sm:w-80 bg-slate-950/95 border-r border-slate-800 backdrop-blur-md flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
            isFavoritesDrawerOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
          }`}
        >
          {/* Drawer Header */}
          <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span className="font-bold text-xs sm:text-sm text-white">Обрані монети</span>
              <span className="text-[10px] font-mono font-bold text-amber-300">
                {localWatchlist.length}
              </span>
            </div>
            <button
              onClick={() => setIsFavoritesDrawerOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Сховати"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* Search Input in Drawer */}
          <div className="p-2.5 border-b border-slate-800/80 bg-slate-950/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Пошук в обраному..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Coins List in Drawer */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 touch-scroll">
            {filteredFavorites.length === 0 ? (
              <div className="text-center py-10 px-4 text-slate-500 text-xs space-y-2">
                <Star className="w-6 h-6 text-slate-700 mx-auto" />
                <p className="font-semibold text-slate-400">Немає обраних монет</p>
                <p className="text-[11px] text-slate-600">
                  Натисніть на зірочку біля монет у скрінері, щоб вони з'явились тут.
                </p>
              </div>
            ) : (
              filteredFavorites.map((favCoin, idx) => {
                const isSelected = favCoin.symbol === activeCoin.symbol;
                const isFavPositive = (favCoin.priceChange24h || 0) >= 0;
                return (
                  <div
                    key={`${favCoin.exchange}-${favCoin.symbol}-${favCoin.marketType}-${idx}`}
                    onClick={() => handleSelectFavoriteCoin(favCoin)}
                    className={`group p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500/60 shadow-sm shadow-cyan-950/50'
                        : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-white truncate">
                          {favCoin.baseAsset}/{favCoin.quoteAsset}
                        </span>
                        {isSelected && (
                          <span className="flex h-1.5 w-1.5 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500"></span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] uppercase font-bold px-1 rounded bg-slate-800 text-slate-400">
                          {favCoin.exchange || 'binance'}
                        </span>
                        <span className="text-[9px] uppercase font-semibold px-1 rounded bg-slate-800/80 text-slate-500">
                          {favCoin.marketType === 'futures' ? 'Fut' : 'Spot'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        {favCoin.currentPrice > 0 && (
                          <div className="font-mono text-xs font-semibold text-slate-200">
                            ${formatCryptoPrice(favCoin.currentPrice)}
                          </div>
                        )}
                        <div
                          className={`text-[10px] font-mono font-semibold ${
                            isFavPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isFavPositive ? '+' : ''}
                          {(favCoin.priceChange24h || 0).toFixed(2)}%
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleRemoveFromWatchlist(favCoin.symbol, e)}
                        className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Видалити з обраного"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Workspace Display: If 1 block or maximized block, show full single chart. If multiple blocks, show multi-chart grid */}
        {blocks.length <= 1 ? (
          /* Single Screen 100% View TradingView Pro */
          <div className="w-full h-full relative overflow-hidden">
            {iframeLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-3 z-10 pointer-events-none">
                <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
                <span className="text-sm font-medium">Завантаження графіку {activeCoin.symbol}...</span>
              </div>
            )}
            <div
              className={`absolute top-0 h-full transition-[width,left] duration-200 ease-in-out ${
                showDrawingToolbar ? 'left-0 w-full' : '-left-[54px] w-[calc(100%+54px)]'
              }`}
            >
              <iframe
                key={tradingViewUrl}
                src={tradingViewUrl}
                className="h-full w-full border-0"
                title={`TradingView Chart ${activeCoin.symbol}`}
                onLoad={() => setIframeLoading(false)}
                allow="fullscreen"
                loading="lazy"
              />
            </div>
            <div
              className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-[54px] bg-transparent transition-transform duration-200 ${
                showDrawingToolbar ? '-translate-x-full' : 'translate-x-0'
              }`}
              aria-hidden={showDrawingToolbar}
            />
            <div className="absolute bottom-2 left-2 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleDrawingToolbar}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/85 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-cyan-300 shadow-md backdrop-blur-sm transition-all cursor-pointer group"
                title={showDrawingToolbar ? 'Сховати панель TradingView' : 'Показати панель TradingView'}
                aria-label={showDrawingToolbar ? 'Сховати панель TradingView' : 'Показати панель TradingView'}
              >
                {showDrawingToolbar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ) : (
          /* Multi-chart Grid Layout */
          <div className="w-full h-full p-2 sm:p-3 overflow-y-auto no-scrollbar">
            <div className={`grid ${gridColsClass} gap-2 sm:gap-3 transition-all duration-200`}>
              {blocks.map((block, index) => {
                const coinData = getCoinForBlock(block);
                const isMaximized = maximizedBlockId === block.id;

                return (
                  <TerminalChartWidget
                    key={block.id}
                    block={block}
                    coin={coinData}
                    allCoins={coins}
                    isSingleBlock={blocks.length === 1}
                    isMaximized={isMaximized}
                    onToggleMaximize={() =>
                      setMaximizedBlockId((prev) => (prev === block.id ? null : block.id))
                    }
                    onRemove={() => handleRemoveBlock(block.id)}
                    onUpdateBlock={(updated) => handleUpdateBlock(block.id, updated)}
                    onOpenFullscreenModal={onOpenFullscreenModal}
                    onSendMetaScalp={onSendMetaScalp}
                    metaScalpBinding={metaScalpBinding}
                    onOpenTelegramAlerts={onOpenTelegramAlerts}
                    onMove={(dir) => handleMoveBlock(index, dir)}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(index)}
                    heightStyle={computedHeightStyle}
                  />
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Add Chart Modal */}
      <AddChartModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        coins={coins}
        watchlist={localWatchlist}
        onAddChart={handleAddChart}
      />

      {/* Workspace Settings Drawer */}
      <TerminalSettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onUpdateConfig={(updated) => setConfig((prev) => ({ ...prev, ...updated }))}
        onApplyGlobalTimeframe={handleApplyGlobalTimeframe}
        onApplyPreset={handleApplyPreset}
        onResetWorkspace={handleResetWorkspace}
        totalBlocks={blocks.length}
      />
    </div>
  );
};

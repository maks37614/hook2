import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from './components/Header';
import { ScreenerFilters } from './components/ScreenerFilters';
import { FormationCard } from './components/FormationCard';
import { ScreenerTable } from './components/ScreenerTable';
import { CoinScreenerPage } from './components/CoinScreenerPage';
import { TerminalPage } from './components/TerminalPage';
import { SurveillancePage } from './components/SurveillancePage';
import { FormationDetailsModal } from './components/FormationDetailsModal';
import { FormationGuideModal } from './components/FormationGuideModal';
import { WatchlistDrawer } from './components/WatchlistDrawer';
import { MetaScalpModal } from './components/MetaScalpModal';
import { MetaScalpToast, MetaScalpToastState } from './components/MetaScalpToast';
import { TelegramAlertsModal } from './components/TelegramAlertsModal';
import { AuthModal } from './components/AuthModal';
import { UserProfileModal } from './components/UserProfileModal';
import { ArchiveModal } from './components/ArchiveModal';
import { AlertToast, AlertToastState } from './components/AlertToast';
import { useAlerts } from './context/AlertsContext';
import { useAuth } from './context/AuthContext';
import { useArchive } from './context/ArchiveContext';
import { useSurveillance } from './context/SurveillanceContext';
import { useLanguage } from './context/LanguageContext';
import {
  MetaScalpSettings,
  getStoredMetaScalpSettings,
  saveStoredMetaScalpSettings,
  sendTickerToMetaScalp,
} from './utils/metaScalpService';
import { ScannedCoin, DetectedFormation, ScreenerFilterState, PriceAlert, ArchivedFormation, ActivePageType } from './types';
import { runDirectClientScan, getFallbackScannedCoins } from './utils/directExchangeClient';
import {
  AlertCircle,
  RefreshCw,
  Layers,
  Sparkles,
  Lock,
  Key,
  Send,
  ShieldAlert,
  Zap,
  ExternalLink,
  ShieldCheck,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { AUTHOR_TELEGRAM_CHANNEL_URL, AUTHOR_TELEGRAM_USERNAME } from './utils/accessCodes';
import { getStoredPreferences, useAppPreferences } from './utils/userPreferences';

const DEFAULT_FILTERS: ScreenerFilterState = {
  exchange: 'binance',
  marketType: 'futures',
  timeframe: '15m',
  category: 'all',
  bias: 'all',
  status: 'all',
  minVolumeUsd: 0,
  searchQuery: '',
  sortBy: 'confidence',
  sortOrder: 'desc',
};

export default function App() {
  const { preferences } = useAppPreferences();
  const { t } = useLanguage();
  const [coins, setCoins] = useState<ScannedCoin[]>(() => getFallbackScannedCoins());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScreenerFilterState>(() => {
    const prefs = getStoredPreferences();
    return {
      ...DEFAULT_FILTERS,
      exchange: prefs.defaultExchange,
      marketType: prefs.defaultMarketType,
      timeframe: prefs.defaultTimeframe,
    };
  });
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      exchange: preferences.defaultExchange,
      marketType: preferences.defaultMarketType,
      timeframe: preferences.defaultTimeframe,
    }));
  }, [preferences.defaultExchange, preferences.defaultMarketType, preferences.defaultTimeframe]);

  // Active Category: 'patterns' | 'screener' | 'terminal' | 'surveillance'
  const [activePage, setActivePage] = useState<ActivePageType>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#screener') return 'screener';
      if (window.location.hash === '#terminal') return 'terminal';
      if (window.location.hash === '#surveillance') return 'surveillance';
    }
    return 'patterns';
  });

  // Listen to hash changes for browser back/forward buttons
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#screener') {
        setActivePage('screener');
      } else if (window.location.hash === '#terminal') {
        setActivePage('terminal');
      } else if (window.location.hash === '#surveillance') {
        setActivePage('surveillance');
      } else if (window.location.hash === '#patterns') {
        setActivePage('patterns');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handlePageChange = (page: ActivePageType) => {
    setActivePage(page);
    if (typeof window !== 'undefined') {
      window.location.hash = page;
    }
  };

  // Auth & Profile
  const { user, profile, loading: authLoading, updateProfileData } = useAuth();
  const { activeCount: surveillanceActiveCount } = useSurveillance();

  // Watchlist stored per user (isolated)
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [watchlistFolders, setWatchlistFolders] = useState<Record<string, string[]>>({});

  // Synchronize watchlist with current logged-in user profile & user-scoped storage
  useEffect(() => {
    if (!user) {
      try {
        const guestSaved = localStorage.getItem('crypto_screener_watchlist_guest');
        if (guestSaved) {
          const parsed = JSON.parse(guestSaved);
          if (Array.isArray(parsed)) {
            setWatchlist(Array.from(new Set(parsed)));
            return;
          }
        }
      } catch {}
      setWatchlist(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
      return;
    }

    if (profile?.watchlist && Array.isArray(profile.watchlist)) {
      setWatchlist(Array.from(new Set(profile.watchlist)));
      try {
        localStorage.setItem(`crypto_screener_watchlist_${user.uid}`, JSON.stringify(profile.watchlist));
      } catch {}
      return;
    }

    try {
      const userKey = `crypto_screener_watchlist_${user.uid}`;
      const saved = localStorage.getItem(userKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setWatchlist(Array.from(new Set(parsed)));
          return;
        }
      }
    } catch {}

    setWatchlist([]);
  }, [user?.uid, profile?.watchlist]);

  useEffect(() => {
    if (!user) {
      setWatchlistFolders({});
      return;
    }

    const folders = profile?.watchlistFolders;
    if (folders && typeof folders === 'object') {
      setWatchlistFolders(folders);
      return;
    }

    try {
      const saved = localStorage.getItem(`crypto_screener_watchlist_folders_${user.uid}`);
      setWatchlistFolders(saved ? JSON.parse(saved) : {});
    } catch {
      setWatchlistFolders({});
    }
  }, [user?.uid, profile?.watchlistFolders]);

  // Sound enabled
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const prefs = getStoredPreferences();
    return prefs.soundAlertsEnabled;
  });

  useEffect(() => {
    setSoundEnabled(preferences.soundAlertsEnabled);
  }, [preferences.soundAlertsEnabled]);

  const [selectedPair, setSelectedPair] = useState<{
    coin: ScannedCoin;
    formation: DetectedFormation;
  } | null>(null);

  const [isWatchlistOpen, setIsWatchlistOpen] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // MetaScalp terminal linking state (isolated per user)
  const [metaScalpSettings, setMetaScalpSettings] = useState<MetaScalpSettings>(() =>
    getStoredMetaScalpSettings(user?.uid)
  );

  useEffect(() => {
    if (!user) return;
    if (profile?.metaScalpSettings) {
      setMetaScalpSettings(profile.metaScalpSettings);
      saveStoredMetaScalpSettings(profile.metaScalpSettings, user.uid);
    } else {
      const userSettings = getStoredMetaScalpSettings(user.uid);
      setMetaScalpSettings(userSettings);
    }
  }, [user?.uid, profile?.metaScalpSettings]);

  const handleMetaScalpSettingsChange = (newSettings: MetaScalpSettings) => {
    setMetaScalpSettings(newSettings);
    if (user) {
      saveStoredMetaScalpSettings(newSettings, user.uid);
      updateProfileData({ metaScalpSettings: newSettings }).catch(() => {});
    }
  };

  const [isMetaScalpModalOpen, setIsMetaScalpModalOpen] = useState<boolean>(false);
  const [metaScalpToast, setMetaScalpToast] = useState<MetaScalpToastState | null>(null);

  // Telegram price alerts state
  const { activeAlertsCount } = useAlerts();
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState<boolean>(false);
  const [telegramPrefill, setTelegramPrefill] = useState<any>(null);
  const [alertToast, setAlertToast] = useState<AlertToastState | null>(null);

  // Formations Archive state
  const { archivedFormations } = useArchive();
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState<boolean>(false);
  const [selectedArchivedItem, setSelectedArchivedItem] = useState<ArchivedFormation | null>(null);

  // Authentication & Profile modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);

  // Auto-dismiss Alert toast
  useEffect(() => {
    if (alertToast) {
      const timer = setTimeout(() => {
        setAlertToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [alertToast]);

  const handleOpenTelegramAlerts = useCallback((prefill?: any) => {
    setTelegramPrefill(prefill || null);
    setIsTelegramModalOpen(true);
  }, []);

  const handleAlertToast = useCallback(
    (toast: { symbol: string; targetPrice: number; condition: 'gte' | 'lte'; message?: string }) => {
      setAlertToast({
        id: Date.now(),
        symbol: toast.symbol,
        targetPrice: toast.targetPrice,
        condition: toast.condition,
        message: toast.message,
      });
    },
    []
  );

  // Auto-dismiss MetaScalp toast
  useEffect(() => {
    if (metaScalpToast) {
      const timer = setTimeout(() => {
        setMetaScalpToast(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [metaScalpToast]);

  // Send ticker to MetaScalp terminal
  const handleSendToMetaScalp = useCallback(
    async (coin: ScannedCoin) => {
      if (!metaScalpSettings.enabled) {
        setIsMetaScalpModalOpen(true);
        return;
      }

      const res = await sendTickerToMetaScalp(
        coin.symbol,
        coin.exchange,
        coin.marketType,
        metaScalpSettings
      );

      if (res.success) {
        setMetaScalpToast({
          id: Date.now(),
          type: 'success',
          title: 'MetaScalp Оновлено',
          ticker: res.ticker,
          binding: res.binding,
          message: 'Стакан та графік синхронізовано',
        });
      } else {
        setMetaScalpToast({
          id: Date.now(),
          type: 'warning',
          title: 'MetaScalp',
          ticker: res.ticker,
          binding: res.binding,
          message: res.copiedToClipboard
            ? 'Термінал не відповів. Тікер скопійовано в буфер (Ctrl+V)!'
            : 'Термінал не знайдено на 127.0.0.1:17845.',
        });
      }
    },
    [metaScalpSettings]
  );

  // Handler when selecting pair for details modal
  const handleSelectPair = useCallback(
    (coin: ScannedCoin, formation?: DetectedFormation) => {
      setSelectedArchivedItem(null);
      setSelectedPair({ coin, formation: formation || coin.formations[0] });
      if (metaScalpSettings.enabled && metaScalpSettings.autoSwitchOnClick) {
        handleSendToMetaScalp(coin);
      }
    },
    [metaScalpSettings, handleSendToMetaScalp]
  );

  // Handler when selecting archived formation to restore
  const handleSelectArchivedFormation = useCallback(
    (archived: ArchivedFormation) => {
      const foundCoin = coins.find(
        (c) => c.symbol === archived.symbol && c.exchange === archived.exchange
      );
      const matchingCoin: ScannedCoin = foundCoin || {
        symbol: archived.symbol,
        baseAsset: archived.baseAsset,
        quoteAsset: archived.quoteAsset,
        exchange: archived.exchange,
        marketType: archived.marketType,
        currentPrice: archived.savedPrice,
        priceChange24h: 0,
        volume24hUsd: 0,
        highPrice24h: archived.savedPrice,
        lowPrice24h: archived.savedPrice,
        high24h: archived.savedPrice,
        low24h: archived.savedPrice,
        timeframe: archived.timeframe,
        formations: [archived.formation],
        hasFormations: true,
        bestFormation: archived.formation,
        exchangeUrl:
          archived.exchange === 'binance'
            ? `https://www.binance.com/uk-UA/trade/${archived.baseAsset}_${archived.quoteAsset}`
            : `https://www.bybit.com/trade/usdt/${archived.baseAsset}USDT`,
        lastUpdated: archived.savedAtTimestamp,
      };

      setSelectedArchivedItem(archived);
      setSelectedPair({
        coin: matchingCoin,
        formation: archived.formation,
      });
      setIsArchiveModalOpen(false);
      if (metaScalpSettings.enabled && metaScalpSettings.autoSwitchOnClick) {
        handleSendToMetaScalp(matchingCoin);
      }
    },
    [coins, metaScalpSettings, handleSendToMetaScalp]
  );

  // Play a gentle alert tone using Web Audio API
  const playAlertSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn('Audio playback not permitted yet:', e);
    }
  }, [soundEnabled]);

  // Fetch screener data from API
  const fetchScreenerData = useCallback(async (currentTf = filters.timeframe, currentExchange = filters.exchange, currentMarket = filters.marketType) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        timeframe: currentTf,
        exchange: currentExchange,
        marketType: currentMarket,
        minVolume: '0',
      });

      let dataLoaded = false;
      try {
        const res = await fetch(`/api/screener/scan?${params.toString()}`);
        if (res.ok) {
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            if (data.success && Array.isArray(data.data) && data.data.length > 0) {
              setCoins(data.data);
              setLastUpdated(Date.now());
              dataLoaded = true;

              const hasHighConfidence = data.data.some((c: ScannedCoin) =>
                c.formations.some((f) => f.confidence >= 88)
              );
              if (hasHighConfidence) {
                playAlertSound();
              }
            }
          }
        }
      } catch (backendErr) {
        console.warn('Backend scan failed, trying direct exchange access:', backendErr);
      }

      // If backend did not yield data (e.g. cloud provider geoblock on Railway), fall back to direct browser connection
      if (!dataLoaded) {
        const directCoins = await runDirectClientScan({
          exchange: currentExchange,
          marketType: currentMarket,
          timeframe: currentTf,
        });
        if (directCoins.length > 0) {
          setCoins(directCoins);
          setLastUpdated(Date.now());
          dataLoaded = true;
        }
      }
    } catch (err: any) {
      console.warn('Scan complete fallback error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filters.timeframe, filters.exchange, filters.marketType, filters.minVolumeUsd, playAlertSound]);

  // Initial load and re-fetch when exchange, market or timeframe changes
  useEffect(() => {
    fetchScreenerData(filters.timeframe, filters.exchange, filters.marketType);
  }, [filters.timeframe, filters.exchange, filters.marketType, filters.minVolumeUsd]);

  // Auto-refresh interval (every 60 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchScreenerData();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchScreenerData]);

  // Toggle watchlist (isolated per user profile or local guest storage)
  const handleToggleWatchlist = (symbol: string) => {
    if (!user) {
      setWatchlist((prev) => {
        const uniquePrev = Array.from(new Set(prev));
        const next = uniquePrev.includes(symbol)
          ? uniquePrev.filter((s) => s !== symbol)
          : [...uniquePrev, symbol];
        const cleanNext = Array.from(new Set(next));
        try {
          localStorage.setItem('crypto_screener_watchlist_guest', JSON.stringify(cleanNext));
        } catch (e) {}
        return cleanNext;
      });
      return;
    }
    setWatchlist((prev) => {
      const uniquePrev = Array.from(new Set(prev));
      const next = uniquePrev.includes(symbol)
        ? uniquePrev.filter((s) => s !== symbol)
        : [...uniquePrev, symbol];
      const cleanNext = Array.from(new Set(next));
      try {
        localStorage.setItem(`crypto_screener_watchlist_${user.uid}`, JSON.stringify(cleanNext));
      } catch (e) {}
      updateProfileData({ watchlist: cleanNext }).catch(() => {});
      return cleanNext;
    });
  };

  const handleWatchlistFoldersChange = (folders: Record<string, string[]>) => {
    if (!user) return;
    setWatchlistFolders(folders);
    try {
      localStorage.setItem(`crypto_screener_watchlist_folders_${user.uid}`, JSON.stringify(folders));
    } catch {}
    updateProfileData({ watchlistFolders: folders }).catch(() => {});
  };

  // Toggle sound
  const handleToggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('crypto_screener_sound', String(next));
      } catch (e) {}
      return next;
    });
  };

  // Flatten coins to items: { coin, formation }
  const flattenedItems = useMemo(() => {
    const items: { coin: ScannedCoin; formation: DetectedFormation }[] = [];

    for (const coin of coins) {
      // Filter by minimum volume
      if (filters.minVolumeUsd > 0 && coin.volume24hUsd < filters.minVolumeUsd) {
        continue;
      }

      // Filter by search query
      if (
        filters.searchQuery &&
        !coin.symbol.toLowerCase().includes(filters.searchQuery.toLowerCase()) &&
        !coin.baseAsset.toLowerCase().includes(filters.searchQuery.toLowerCase())
      ) {
        continue;
      }

      for (const formation of coin.formations) {
        // Filter by category
        if (filters.category !== 'all' && formation.category !== filters.category) {
          continue;
        }

        // Filter by bias
        if (filters.bias !== 'all' && formation.bias !== filters.bias) {
          continue;
        }

        // Filter by status
        if (filters.status !== 'all' && formation.status !== filters.status) {
          continue;
        }

        items.push({ coin, formation });
      }
    }

    // Sort items
    items.sort((a, b) => {
      if (filters.sortBy === 'confidence') {
        return b.formation.confidence - a.formation.confidence;
      }
      if (filters.sortBy === 'volume') {
        return b.coin.volume24hUsd - a.coin.volume24hUsd;
      }
      if (filters.sortBy === 'priceChange') {
        return Math.abs(b.coin.priceChange24h) - Math.abs(a.coin.priceChange24h);
      }
      if (filters.sortBy === 'profitPotential') {
        return b.formation.riskRewardRatio - a.formation.riskRewardRatio;
      }
      return 0;
    });

    return items;
  }, [coins, filters]);

  // Coins matching search query even if no formation is detected on current timeframe
  const matchingCoinsSearch = useMemo(() => {
    if (!filters.searchQuery.trim()) return [];
    const q = filters.searchQuery.toLowerCase().trim();
    return coins.filter(
      (c) => c.symbol.toLowerCase().includes(q) || c.baseAsset.toLowerCase().includes(q)
    );
  }, [coins, filters.searchQuery]);

  // Counts for header stats
  const bullishCount = useMemo(
    () => flattenedItems.filter((i) => i.formation.bias === 'bullish').length,
    [flattenedItems]
  );
  const bearishCount = useMemo(
    () => flattenedItems.filter((i) => i.formation.bias === 'bearish').length,
    [flattenedItems]
  );

  // Loading screen during initial authentication check
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#070a12] flex flex-col items-center justify-center p-4 text-slate-300">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 mb-4 animate-pulse">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-base font-bold text-white font-mono tracking-wider mb-2 flex items-center gap-2">
          signal<span className="text-cyan-400">hook</span>
        </h2>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="w-4 h-4 border-2 border-cyan-500/40 border-t-cyan-400 rounded-full animate-spin" />
          <span>Завантаження платформи...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 flex flex-col selection:bg-cyan-500/20 selection:text-cyan-300">
      {/* Header */}
      <Header
        isLoading={isLoading}
        totalCoins={coins.length}
        formationsCount={flattenedItems.length}
        bullishCount={bullishCount}
        bearishCount={bearishCount}
        watchlistCount={watchlist.length}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onRefresh={() => fetchScreenerData()}
        onOpenWatchlist={() => setIsWatchlistOpen(true)}
        onOpenArchive={() => setIsArchiveModalOpen(true)}
        archiveCount={archivedFormations.length}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenMetaScalp={() => setIsMetaScalpModalOpen(true)}
        metaScalpSettings={metaScalpSettings}
        onOpenTelegramAlerts={() => handleOpenTelegramAlerts()}
        telegramAlertsCount={activeAlertsCount}
        surveillanceCount={surveillanceActiveCount}
        lastUpdated={lastUpdated}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        activePage={activePage}
        onPageChange={handlePageChange}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto px-2.5 sm:px-4 lg:px-6 py-2.5 sm:py-4 space-y-3 sm:space-y-4">
        {activePage === 'terminal' ? (
          <TerminalPage
            coins={coins}
            watchlist={watchlist}
            onToggleWatchlist={handleToggleWatchlist}
            onSendMetaScalp={handleSendToMetaScalp}
            metaScalpBinding={metaScalpSettings.binding}
            onOpenTelegramAlerts={handleOpenTelegramAlerts}
            onOpenFullscreenModal={(coin, formation) => handleSelectPair(coin, formation)}
            onReturnToPatterns={() => handlePageChange('patterns')}
          />
        ) : activePage === 'surveillance' ? (
          <SurveillancePage
            availableCoins={coins}
            onSelectCoinForChart={(symbol, exchange, marketType) => {
              const matchedCoin = coins.find((c) => c.symbol === symbol);
              if (matchedCoin) {
                handleSelectPair(matchedCoin);
              }
            }}
            onOpenTelegramSettings={() => setIsTelegramModalOpen(true)}
            onNavigateToScreener={() => handlePageChange('screener')}
          />
        ) : activePage === 'screener' ? (
          <CoinScreenerPage
            onSelectCoin={handleSelectPair}
            onSendMetaScalp={handleSendToMetaScalp}
            metaScalpBinding={metaScalpSettings.binding}
            watchlist={watchlist}
            onToggleWatchlist={handleToggleWatchlist}
            onOpenTelegramAlerts={handleOpenTelegramAlerts}
            onOpenWatchlist={() => setIsWatchlistOpen(true)}
            formationsCoins={coins}
          />
        ) : (
          <>
            {/* Filters Toolbar */}
            <ScreenerFilters
              filters={filters}
              onFilterChange={(newFilters) => setFilters((prev) => ({ ...prev, ...newFilters }))}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />

            {/* Error Notification */}
            {error && (
              <div className="flex items-center justify-between p-4 rounded-2xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                  <span>{error}</span>
                </div>
                <button
                  onClick={() => fetchScreenerData()}
                  className="px-3 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-900 font-semibold transition-colors"
                >
                  Повторити
                </button>
              </div>
            )}

            {/* Results Area */}
            {isLoading && coins.length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
                  <div
                    key={idx}
                    className="h-56 rounded-2xl bg-slate-900/40 border border-slate-800/60 animate-pulse p-4 space-y-4"
                  >
                    <div className="flex justify-between items-center">
                      <div className="h-5 w-24 bg-slate-800 rounded-md" />
                      <div className="h-5 w-16 bg-slate-800 rounded-md" />
                    </div>
                    <div className="h-16 bg-slate-800/60 rounded-xl" />
                    <div className="h-10 bg-slate-800/40 rounded-xl" />
                  </div>
                ))}
              </div>
            ) : flattenedItems.length === 0 ? (
              matchingCoinsSearch.length > 0 ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-800/50 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Sparkles className="w-5 h-5 text-cyan-400 shrink-0" />
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          Знайдено {matchingCoinsSearch.length} монет за пошуком "{filters.searchQuery.toUpperCase()}"
                        </h4>
                        <p className="text-xs text-slate-400">
                          На поточному таймфреймі ({filters.timeframe}) активних геометричних патернів ще не сформовано. Ви можете відкрити монету в терміналі або змінити таймфрейм:
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActivePage('screener')}
                      className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white transition-colors"
                    >
                      Відкрити у Скрінері Монет →
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {matchingCoinsSearch.map((coin) => (
                      <div
                        key={`${coin.exchange}-${coin.symbol}-${coin.marketType}`}
                        onClick={() => {
                          handleSelectPair(coin);
                        }}
                        className="bg-slate-900/60 border border-slate-800 hover:border-cyan-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:shadow-lg hover:shadow-cyan-950/20 group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-sm text-white group-hover:text-cyan-400 transition-colors">
                            {coin.symbol}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 uppercase font-mono">
                            {coin.exchange} • {coin.marketType}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between mb-3">
                          <span className="text-lg font-mono font-bold text-white">
                            ${coin.currentPrice >= 1 ? coin.currentPrice.toLocaleString('en-US') : coin.currentPrice}
                          </span>
                          <span className={`text-xs font-mono font-semibold ${coin.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {coin.priceChange24h >= 0 ? '+' : ''}{coin.priceChange24h.toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2.5">
                          <span>Об'єм: ${(coin.volume24hUsd / 1_000_000).toFixed(1)}M</span>
                          <span className="text-cyan-400 font-semibold group-hover:underline">Термінал →</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center rounded-3xl border border-slate-800/80 bg-slate-900/40 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white">Формацій не знайдено</h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      За поточними фільтрами активних формацій не виявлено. Спробуйте змінити таймфрейм (5m / 15m / 1h / 4h), обрати обидві біржі або скинути фільтри.
                    </p>
                  </div>
                  <button
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                  >
                    {t('resetFilters')}
                  </button>
                </div>
              )
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {flattenedItems.map(({ coin, formation }, idx) => (
                  <FormationCard
                    key={`${coin.exchange}-${coin.symbol}-${coin.marketType}-${formation.id}-${idx}`}
                    coin={coin}
                    formation={formation}
                    isWatchlisted={watchlist.includes(coin.symbol)}
                    onToggleWatchlist={handleToggleWatchlist}
                    onSelect={handleSelectPair}
                    onSendMetaScalp={handleSendToMetaScalp}
                    metaScalpBinding={metaScalpSettings.binding}
                    onOpenAlert={(c, f) =>
                      handleOpenTelegramAlerts({
                        symbol: c.symbol,
                        exchange: c.exchange,
                        marketType: c.marketType,
                        currentPrice: c.currentPrice,
                        targetPrice: f.levels.targetPrice,
                        formationName: f.name,
                        condition: f.levels.targetPrice >= c.currentPrice ? 'gte' : 'lte',
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              <ScreenerTable
                items={flattenedItems}
                watchlist={watchlist}
                onToggleWatchlist={handleToggleWatchlist}
                onSelect={handleSelectPair}
                onSendMetaScalp={handleSendToMetaScalp}
                metaScalpBinding={metaScalpSettings.binding}
                onOpenAlert={(c, f) =>
                  handleOpenTelegramAlerts({
                    symbol: c.symbol,
                    exchange: c.exchange,
                    marketType: c.marketType,
                    currentPrice: c.currentPrice,
                    targetPrice: f.levels.targetPrice,
                    formationName: f.name,
                    condition: f.levels.targetPrice >= c.currentPrice ? 'gte' : 'lte',
                  })
                }
              />
            )}
          </>
        )}
      </main>

      {/* Footer with Made in Evgen and Maksym */}
      <footer className="mt-auto border-t border-slate-800/80 bg-slate-950/80 py-4 px-4 text-center">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <p>
            Made in <span className="text-cyan-400 font-semibold">Evgen</span> and <span className="text-indigo-400 font-semibold">Maksym</span>
          </p>
          <p className="text-[11px] text-slate-500 font-mono">
            signalhook • Binance &amp; Bybit
          </p>
        </div>
      </footer>

      {/* Formation Details Modal with Interactive Candlestick Chart & AI */}
      {selectedPair && (
        <FormationDetailsModal
          coin={selectedPair.coin}
          formation={selectedPair.formation}
          archivedItem={selectedArchivedItem}
          allCoins={coins}
          watchlist={watchlist}
          onToggleWatchlist={handleToggleWatchlist}
          onClose={() => {
            setSelectedPair(null);
            setSelectedArchivedItem(null);
          }}
          onSendMetaScalp={handleSendToMetaScalp}
          metaScalpBinding={metaScalpSettings.binding}
          onOpenTelegramModal={handleOpenTelegramAlerts}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onAlertToast={handleAlertToast}
        />
      )}

      {/* Formations Archive Modal */}
      <ArchiveModal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        onSelectFormation={handleSelectArchivedFormation}
        onOpenAuth={() => setIsAuthModalOpen(true)}
      />

      {/* Encyclopedia / Guide Modal */}
      <FormationGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      {/* Watchlist Drawer */}
      <WatchlistDrawer
        isOpen={isWatchlistOpen}
        onClose={() => setIsWatchlistOpen(false)}
        watchlistSymbols={watchlist}
        allCoins={coins}
        onRemove={handleToggleWatchlist}
        folders={watchlistFolders}
        onFoldersChange={handleWatchlistFoldersChange}
        onSendMetaScalp={handleSendToMetaScalp}
        metaScalpBinding={metaScalpSettings.binding}
      />

      {/* MetaScalp Terminal Linking Modal */}
      <MetaScalpModal
        isOpen={isMetaScalpModalOpen}
        onClose={() => setIsMetaScalpModalOpen(false)}
        settings={metaScalpSettings}
        onSettingsChange={handleMetaScalpSettingsChange}
        currentSymbol={selectedPair?.coin.symbol || coins[0]?.symbol || 'BTCUSDT'}
      />

      {/* MetaScalp Notification Toast */}
      <MetaScalpToast
        toast={metaScalpToast}
        onDismiss={() => setMetaScalpToast(null)}
      />

      {/* Telegram Alerts & Configuration Modal */}
      <TelegramAlertsModal
        isOpen={isTelegramModalOpen}
        onClose={() => setIsTelegramModalOpen(false)}
        prefill={telegramPrefill}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onAlertCreated={(alert) => {
          setAlertToast({
            id: Date.now(),
            symbol: alert.symbol,
            targetPrice: alert.targetPrice,
            condition: alert.condition,
            message: alert.note || alert.formationName || 'Алерт додано в чергу моніторингу',
          });
        }}
      />

      {/* User Authentication Modal (Registration / Login) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => {
          setIsAuthModalOpen(false);
        }}
      />

      {/* User Profile & Isolated Settings Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onOpenAlerts={() => handleOpenTelegramAlerts()}
        onOpenArchive={() => setIsArchiveModalOpen(true)}
      />

      {/* Telegram Alert Notification Toast */}
      <AlertToast
        toast={alertToast}
        onDismiss={() => setAlertToast(null)}
      />
    </div>
  );
}

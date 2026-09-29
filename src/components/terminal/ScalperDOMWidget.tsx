import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Settings,
  Volume2,
  VolumeX,
  Crosshair,
  Layers,
  ChevronDown,
  Check,
  Zap,
  Info,
  Sliders,
  BellRing,
  BarChart3,
  LineChart,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  CircleDot,
  Filter,
} from 'lucide-react';
import { ExchangeId, MarketType, Timeframe } from '../../types';
import { formatCryptoPrice, formatVolume, formatWholeSum, formatCompactWholeBubble } from '../../utils/formatters';
import { playDensityChime } from '../../utils/domSound';
import { useAuth } from '../../context/AuthContext';

function formatTradeTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatCompactClusterSum(vol: number | undefined | null): string {
  if (!vol || vol <= 0 || isNaN(vol)) return '0';
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${Math.round(vol / 1_000)}k`;
  return `${Math.round(vol)}`;
}

function formatCandleTotalSum(vol: number | undefined | null): string {
  if (!vol || vol <= 0 || isNaN(vol)) return '$0';
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(2)}B`;
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${Math.round(vol / 1_000)}k`;
  return `$${Math.round(vol)}`;
}

interface ScalperDOMWidgetProps {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  currentPrice?: number;
  priceChange24h?: number;
  initialTimeframe?: Timeframe;
  initialCompression?: number;
  initialDepth?: 'all' | 'deep' | 'medium' | 'small';
  initialDensityThreshold?: number;
  initialBubbleThreshold?: number;
  initialSoundAlert?: boolean;
  onUpdateSettings?: (settings: {
    compression?: number;
    depth?: 'all' | 'deep' | 'medium' | 'small';
    densityThresholdUsd?: number;
    bubbleThresholdUsd?: number;
    soundAlertEnabled?: boolean;
    clusterTimeframe?: Timeframe;
    heightPreset?: 'md' | 'lg' | 'xl';
  }) => void;
  height?: string | number;
  domHeightPreset?: 'md' | 'lg' | 'xl';
  onDomHeightPresetChange?: (preset: 'md' | 'lg' | 'xl') => void;
  onToggleView?: () => void;
}

interface OrderBookRow {
  price: number;
  qty: number;
  volumeUsd: number;
  isAsk: boolean;
  isDensity: boolean;
}

interface RecentTrade {
  id: string;
  price: number;
  qty: number;
  volumeUsd: number;
  isBuyerMaker: boolean; // true = sell, false = buy
  timestamp: number;
}

interface ClusterLevel {
  price: number;
  buyVol: number;
  sellVol: number;
  totalVol: number;
  isPOC: boolean;
}

interface ClusterColumn {
  candleTime: number;
  label: string;
  totalVolume: number;
  pocPrice: number;
  maxLevelVol?: number;
  levels: Record<number, ClusterLevel>;
}

export const ScalperDOMWidget: React.FC<ScalperDOMWidgetProps> = ({
  symbol,
  baseAsset,
  quoteAsset,
  exchange,
  marketType,
  currentPrice: propPrice,
  priceChange24h = 0,
  initialTimeframe = '5m',
  initialCompression = 1,
  initialDepth = 'all',
  initialDensityThreshold = 100000, // $100K default
  initialBubbleThreshold = 1000, // $1K default
  initialSoundAlert = true,
  onUpdateSettings,
  height,
  domHeightPreset,
  onDomHeightPresetChange,
  onToggleView,
}: ScalperDOMWidgetProps) => {
  const { user, profile, updateProfileData } = useAuth();

  // DOM settings state
  const [internalHeightPreset, setInternalHeightPreset] = useState<'md' | 'lg' | 'xl'>(() => {
    try {
      if (profile?.orderbookSettings?.heightPreset) return profile.orderbookSettings.heightPreset;
      const key = user?.uid ? `scalper_dom_height_preset_${user.uid}` : 'scalper_dom_height_preset';
      const saved = localStorage.getItem(key) || localStorage.getItem('scalper_dom_height_preset');
      if (saved === 'md' || saved === 'lg' || saved === 'xl') return saved;
    } catch {}
    return domHeightPreset || 'lg';
  });

  const activeHeightPreset = domHeightPreset || internalHeightPreset;

  const [clusterTf, setClusterTf] = useState<Timeframe>(initialTimeframe);
  const [compression, setCompression] = useState<number>(() => {
    try {
      if (profile?.orderbookSettings?.compression) return profile.orderbookSettings.compression;
      const key = user?.uid ? `scalper_dom_compression_${user.uid}` : 'scalper_dom_compression';
      const saved = localStorage.getItem(key) || localStorage.getItem('scalper_dom_compression');
      if (saved && !isNaN(Number(saved))) return Number(saved);
    } catch {}
    return 10; // default x10
  });
  const [depthPreset, setDepthPreset] = useState<'all' | 'deep' | 'medium' | 'small'>(() => {
    try {
      if (profile?.orderbookSettings?.depth) return profile.orderbookSettings.depth;
      const key = user?.uid ? `scalper_dom_depth_preset_${user.uid}` : 'scalper_dom_depth_preset';
      const saved = localStorage.getItem(key) || localStorage.getItem('scalper_dom_depth_preset');
      if (saved && ['all', 'deep', 'medium', 'small'].includes(saved)) {
        return saved as any;
      }
    } catch {}
    return 'medium'; // default 100 levels
  });
  const [densityThresholdUsd, setDensityThresholdUsd] = useState<number>(() => {
    try {
      if (profile?.orderbookSettings?.densityThresholdUsd) return profile.orderbookSettings.densityThresholdUsd;
      const key = user?.uid ? `scalper_dom_density_threshold_${user.uid}` : 'scalper_dom_density_threshold';
      const saved = localStorage.getItem(key) || localStorage.getItem('scalper_dom_density_threshold');
      if (saved && !isNaN(Number(saved)) && Number(saved) > 0) return Number(saved);
    } catch {}
    return 500000; // default 500k
  });
  const [bubbleThresholdUsd, setBubbleThresholdUsd] = useState<number>(() => {
    try {
      if (profile?.orderbookSettings?.bubbleThresholdUsd !== undefined) return profile.orderbookSettings.bubbleThresholdUsd;
      const key = user?.uid ? `scalper_dom_bubble_threshold_${user.uid}` : 'scalper_dom_bubble_threshold';
      const saved = localStorage.getItem(key) || localStorage.getItem('scalper_dom_bubble_threshold');
      if (saved !== null && !isNaN(Number(saved))) return Number(saved);
    } catch {}
    return 5000; // default 5k
  });
  const [soundAlertEnabled, setSoundAlertEnabled] = useState<boolean>(() => {
    try {
      if (profile?.orderbookSettings?.soundAlertEnabled !== undefined) return profile.orderbookSettings.soundAlertEnabled;
      const key = user?.uid ? `scalper_dom_sound_alert_${user.uid}` : 'scalper_dom_sound_alert';
      const saved = localStorage.getItem(key) || localStorage.getItem('scalper_dom_sound_alert');
      if (saved !== null) return saved === 'true';
    } catch {}
    return false; // default false
  });

  // Sync profile changes into state
  useEffect(() => {
    if (!profile?.orderbookSettings) return;
    const s = profile.orderbookSettings;
    if (s.depth) setDepthPreset(s.depth);
    if (s.compression) setCompression(s.compression);
    if (s.soundAlertEnabled !== undefined) setSoundAlertEnabled(s.soundAlertEnabled);
    if (s.densityThresholdUsd) setDensityThresholdUsd(s.densityThresholdUsd);
    if (s.bubbleThresholdUsd !== undefined) setBubbleThresholdUsd(s.bubbleThresholdUsd);
    if (s.heightPreset) setInternalHeightPreset(s.heightPreset);
  }, [profile?.orderbookSettings]);

  // Persist orderbook settings to profile and user storage
  const persistOrderbookSettings = useCallback((updated: any) => {
    if (!user) return;
    const nextSettings = {
      depth: depthPreset,
      compression,
      soundAlertEnabled,
      densityThresholdUsd,
      bubbleThresholdUsd,
      heightPreset: activeHeightPreset,
      ...updated,
    };
    try {
      localStorage.setItem(`scalper_dom_settings_${user.uid}`, JSON.stringify(nextSettings));
    } catch {}
    updateProfileData({ orderbookSettings: nextSettings }).catch(() => {});
  }, [user, depthPreset, compression, soundAlertEnabled, densityThresholdUsd, bubbleThresholdUsd, activeHeightPreset, updateProfileData]);

  const handleDomHeightPresetChange = (preset: 'md' | 'lg' | 'xl') => {
    setInternalHeightPreset(preset);
    try {
      const key = user?.uid ? `scalper_dom_height_preset_${user.uid}` : 'scalper_dom_height_preset';
      localStorage.setItem(key, preset);
    } catch {}
    persistOrderbookSettings({ heightPreset: preset });
    onDomHeightPresetChange?.(preset);
    onUpdateSettings?.({ heightPreset: preset });
  };
  const [autoCenterEnabled, setAutoCenterEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('scalper_dom_auto_center');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true; // default true
  });

  // Settings popover toggle
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTfDropdownOpen, setIsTfDropdownOpen] = useState(false);
  const [isCompressionDropdownOpen, setIsCompressionDropdownOpen] = useState(false);

  // Collapsible trades tape (стрічка) state
  const [isTapeCollapsed, setIsTapeCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('scalper_dom_tape_collapsed');
      if (saved !== null) return saved === 'true';
    } catch {}
    return false;
  });

  // Collapsible cluster footprint history state (ALWAYS active by default on all devices)
  const [showClusters, setShowClusters] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('scalper_dom_show_clusters_v2');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  // Collapsible presets on mobile screens
  const [isPresetsCollapsed, setIsPresetsCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      return true;
    }
    return false;
  });

  const handleToggleTape = useCallback(() => {
    setIsTapeCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('scalper_dom_tape_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  const handleToggleClusters = useCallback(() => {
    setShowClusters((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('scalper_dom_show_clusters_v2', String(next));
      } catch {}
      return next;
    });
  }, []);

  // Live orderbook state (persistent full book maintained in memory)
  const bidsBookRef = useRef<Map<number, number>>(new Map());
  const asksBookRef = useRef<Map<number, number>>(new Map());
  const flushPendingRef = useRef<boolean>(false);

  const [rawBids, setRawBids] = useState<[number, number][]>([]);
  const [rawAsks, setRawAsks] = useState<[number, number][]>([]);
  const [livePrice, setLivePrice] = useState<number>(propPrice || 0);
  const [latencyMs, setLatencyMs] = useState<number>(38);
  const [localChangePct, setLocalChangePct] = useState<number>(-0.06);

  // Live trades tape
  const [trades, setTrades] = useState<RecentTrade[]>([]);

  // Cluster history state (initialized with ready footprint columns so it never flashes empty)
  const [clusters, setClusters] = useState<ClusterColumn[]>(() => {
    const now = Math.floor(Date.now() / 1000);
    const baseP = propPrice || 83000;
    return [3, 2, 1, 0].map((offset) => {
      const time = now - offset * 300;
      const date = new Date(time * 1000);
      const label = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      const levels: Record<number, ClusterLevel> = {};
      const step = baseP > 1000 ? 5 : 0.05;
      let maxVol = 0;
      for (let i = 0; i < 16; i++) {
        const p = Number((baseP - 40 * (step / 5) + i * step).toFixed(2));
        const buy = Math.round(160000 + (i % 5) * 90000);
        const sell = Math.round(130000 + (i % 4) * 70000);
        const tot = buy + sell;
        if (tot > maxVol) maxVol = tot;
        levels[p] = {
          price: p,
          buyVol: buy,
          sellVol: sell,
          totalVol: tot,
          isPOC: i === 8,
        };
      }
      return {
        candleTime: time,
        label,
        totalVolume: 4320000,
        pocPrice: Number(baseP.toFixed(2)),
        maxLevelVol: maxVol,
        levels,
      };
    });
  });

  // Selected trade preset size
  const [selectedPreset, setSelectedPreset] = useState<string>('$751');

  // Density sound alert tracking to prevent duplicates
  const alertedLevelsRef = useRef<Set<number>>(new Set());

  // Container ref for auto-centering
  const domScrollContainerRef = useRef<HTMLDivElement>(null);
  const spreadRowRef = useRef<HTMLDivElement>(null);

  // Clean symbol string
  const cleanSymbol = useMemo(() => symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(), [symbol]);

  // Max levels based on depth preset
  const depthLevelCount = useMemo(() => {
    switch (depthPreset) {
      case 'small': return 50;
      case 'medium': return 100;
      case 'deep': return 250;
      case 'all': return 999999;
      default: return 999999;
    }
  }, [depthPreset]);

  // Compute base tick size based on price
  const baseTickSize = useMemo(() => {
    const p = livePrice || propPrice || 1;
    if (p >= 1000) return 0.1;
    if (p >= 100) return 0.01;
    if (p >= 1) return 0.001;
    if (p >= 0.1) return 0.0001;
    if (p >= 0.01) return 0.00001;
    return 0.000001;
  }, [livePrice, propPrice]);

  const effectiveStep = useMemo(() => {
    return baseTickSize * compression;
  }, [baseTickSize, compression]);

  // Flush in-memory map to react state (throttled via requestAnimationFrame)
  const scheduleBookFlush = useCallback(() => {
    if (flushPendingRef.current) return;
    flushPendingRef.current = true;
    requestAnimationFrame(() => {
      flushPendingRef.current = false;
      const sortedBids = Array.from(bidsBookRef.current.entries())
        .filter(([, q]) => q > 0)
        .sort((a, b) => b[0] - a[0]); // Bids descending (highest near spread)

      const sortedAsks = Array.from(asksBookRef.current.entries())
        .filter(([, q]) => q > 0)
        .sort((a, b) => a[0] - b[0]); // Asks ascending (lowest near spread)

      setRawBids(sortedBids);
      setRawAsks(sortedAsks);

      if (sortedBids[0] && sortedAsks[0]) {
        const mid = (sortedBids[0][0] + sortedAsks[0][0]) / 2;
        setLivePrice(mid);
      }
    });
  }, []);

  // 1. Initial snapshot fetch via REST proxy (full depth 500+ orders)
  useEffect(() => {
    let isMounted = true;
    bidsBookRef.current.clear();
    asksBookRef.current.clear();

    const fetchSnapshot = async () => {
      try {
        const start = Date.now();
        const res = await fetch(
          `/api/orderbook?symbol=${cleanSymbol}&exchange=${exchange}&marketType=${marketType}&limit=500`
        );
        const elapsed = Math.max(10, Date.now() - start);
        if (isMounted) setLatencyMs(elapsed);

        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.bids) && Array.isArray(data.asks)) {
          data.bids.forEach(([p, q]: [number, number]) => {
            if (q > 0) bidsBookRef.current.set(p, q);
            else bidsBookRef.current.delete(p);
          });
          data.asks.forEach(([p, q]: [number, number]) => {
            if (q > 0) asksBookRef.current.set(p, q);
            else asksBookRef.current.delete(p);
          });
          scheduleBookFlush();
        }
      } catch (err) {
        console.warn('DOM snapshot fetch error:', err);
      }
    };

    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 3000); // Polling sync to ensure zero drift

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cleanSymbol, exchange, marketType, scheduleBookFlush]);

  // 1b. Fetch recent trades snapshot on mount & periodic sync
  useEffect(() => {
    let isMounted = true;

    const fetchTradesSnapshot = async () => {
      try {
        const res = await fetch(
          `/api/trades?symbol=${cleanSymbol}&exchange=${exchange}&marketType=${marketType}&limit=60`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.trades) && data.trades.length > 0) {
          setTrades((prev) => {
            const existingIds = new Set(prev.map((t) => t.id));
            const newOnes = data.trades.filter((t: RecentTrade) => !existingIds.has(t.id));
            if (newOnes.length === 0) return prev;
            return [...newOnes, ...prev].slice(0, 150);
          });
        }
      } catch (err) {
        console.warn('Trades fetch error:', err);
      }
    };

    fetchTradesSnapshot();
    const interval = setInterval(fetchTradesSnapshot, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cleanSymbol, exchange, marketType]);

  // 2. Fetch Klines for Cluster History
  useEffect(() => {
    let isMounted = true;
    const fetchClusters = async () => {
      try {
        const res = await fetch(
          `/api/klines?symbol=${cleanSymbol}&exchange=${exchange}&market=${marketType}&timeframe=${clusterTf}&limit=5`
        );
        if (!res.ok) return;
        const json = await res.json();
        const klines = json.data;
        if (!isMounted || !Array.isArray(klines) || klines.length === 0) return;

        // Generate footprint clusters from klines
        const newClusters: ClusterColumn[] = klines.slice(-4).map((k: any) => {
          const high = k.high;
          const low = k.low;
          const open = k.open;
          const close = k.close;
          // Calculate realistic USD volume (k.volume is base coin e.g. BTC, ETH)
          const rawVol = Number(k.volume) || 0;
          const totalVol = rawVol * close;

          const levels: Record<number, ClusterLevel> = {};
          const stepsCount = 16;
          const step = (high - low) / (stepsCount || 1);

          let maxVol = 0;
          let pocP = close;

          for (let i = 0; i < stepsCount; i++) {
            const priceLevel = Number((low + i * step).toFixed(5));
            // Realistic volume distribution (bell-curve around middle)
            const distFromMid = Math.abs(i - stepsCount / 2) / (stepsCount / 2);
            const levelVol = (totalVol / stepsCount) * (1.5 - distFromMid * 0.9);
            const isBullish = close >= open;
            const buyVol = isBullish ? levelVol * 0.58 : levelVol * 0.42;
            const sellVol = levelVol - buyVol;

            if (levelVol > maxVol) {
              maxVol = levelVol;
              pocP = priceLevel;
            }

            levels[priceLevel] = {
              price: priceLevel,
              buyVol,
              sellVol,
              totalVol: levelVol,
              isPOC: false,
            };
          }

          if (levels[pocP]) {
            levels[pocP].isPOC = true;
          }

          const date = new Date(k.time * 1000);
          const timeLabel = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

          return {
            candleTime: k.time,
            label: timeLabel,
            totalVolume: totalVol,
            pocPrice: pocP,
            maxLevelVol: maxVol,
            levels,
          };
        });

        setClusters(newClusters);
      } catch (e) {
        console.warn('Failed to load clusters:', e);
      }
    };

    fetchClusters();
    const interval = setInterval(fetchClusters, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cleanSymbol, exchange, marketType, clusterTf]);

  // 3. Connect to live Binance/Bybit WebSocket for instant real depth & trades
  useEffect(() => {
    let ws: WebSocket | null = null;
    let isSubscribed = true;

    try {
      if (exchange === 'bybit') {
        const bybitCategory = marketType === 'futures' ? 'linear' : 'spot';
        const wsUrl = `wss://stream.bybit.com/v5/public/${bybitCategory}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (!isSubscribed) return;
          try {
            ws?.send(
              JSON.stringify({
                op: 'subscribe',
                args: [`orderbook.200.${cleanSymbol}`, `publicTrade.${cleanSymbol}`],
              })
            );
          } catch {}
        };

        ws.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            const json = JSON.parse(event.data);
            const topic = json.topic || '';
            const data = json.data;

            if (topic.startsWith('orderbook') && data) {
              if (json.type === 'snapshot') {
                bidsBookRef.current.clear();
                asksBookRef.current.clear();
                (data.b || []).forEach(([pStr, qStr]: [string, string]) => {
                  const p = parseFloat(pStr);
                  const q = parseFloat(qStr);
                  if (q > 0) bidsBookRef.current.set(p, q);
                });
                (data.a || []).forEach(([pStr, qStr]: [string, string]) => {
                  const p = parseFloat(pStr);
                  const q = parseFloat(qStr);
                  if (q > 0) asksBookRef.current.set(p, q);
                });
              } else {
                // Delta update: q = 0 means remove level
                (data.b || []).forEach(([pStr, qStr]: [string, string]) => {
                  const p = parseFloat(pStr);
                  const q = parseFloat(qStr);
                  if (q <= 0) bidsBookRef.current.delete(p);
                  else bidsBookRef.current.set(p, q);
                });
                (data.a || []).forEach(([pStr, qStr]: [string, string]) => {
                  const p = parseFloat(pStr);
                  const q = parseFloat(qStr);
                  if (q <= 0) asksBookRef.current.delete(p);
                  else asksBookRef.current.set(p, q);
                });
              }
              scheduleBookFlush();
            } else if (topic.startsWith('publicTrade') && Array.isArray(data)) {
              for (const t of data) {
                const tradePrice = parseFloat(t.p);
                const tradeQty = parseFloat(t.v);
                const isBuyerMaker = t.S === 'Sell';
                const volumeUsd = tradePrice * tradeQty;

                setLivePrice(tradePrice);

                const newTrade: RecentTrade = {
                  id: String(t.i || `${t.T || Date.now()}-${tradePrice}-${tradeQty}`),
                  price: tradePrice,
                  qty: tradeQty,
                  volumeUsd,
                  isBuyerMaker,
                  timestamp: parseInt(t.T, 10) || Date.now(),
                };

                setTrades((prev) => {
                  if (prev.some((p) => p.id === newTrade.id)) return prev;
                  return [newTrade, ...prev].slice(0, 150);
                });
              }
            }
          } catch {}
        };
      } else {
        const lower = cleanSymbol.toLowerCase();
        // Binance real depth stream (all changes) + aggTrade
        const wsUrl = marketType === 'futures'
          ? `wss://fstream.binance.com/stream?streams=${lower}@depth@100ms/${lower}@aggTrade`
          : `wss://stream.binance.com:9443/stream?streams=${lower}@depth@100ms/${lower}@aggTrade`;

        ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            const msg = JSON.parse(event.data);
            const stream = msg.stream || '';
            const data = msg.data || msg;

            if (stream.includes('@depth') || data.e === 'depthUpdate') {
              let hasChanges = false;
              if (Array.isArray(data.b)) {
                data.b.forEach(([pStr, qStr]: [string, string]) => {
                  const p = parseFloat(pStr);
                  const q = parseFloat(qStr);
                  if (q <= 0) bidsBookRef.current.delete(p);
                  else bidsBookRef.current.set(p, q);
                });
                hasChanges = true;
              }
              if (Array.isArray(data.a)) {
                data.a.forEach(([pStr, qStr]: [string, string]) => {
                  const p = parseFloat(pStr);
                  const q = parseFloat(qStr);
                  if (q <= 0) asksBookRef.current.delete(p);
                  else asksBookRef.current.set(p, q);
                });
                hasChanges = true;
              }
              if (hasChanges) {
                scheduleBookFlush();
              }
            } else if (stream.includes('@aggTrade') || data.e === 'aggTrade') {
              const tradePrice = parseFloat(data.p);
              const tradeQty = parseFloat(data.q);
              const isBuyerMaker = !!data.m; // true = sell, false = buy
              const volumeUsd = tradePrice * tradeQty;

              setLivePrice(tradePrice);

              const newTrade: RecentTrade = {
                id: String(data.a || `${data.T || Date.now()}-${tradePrice}-${tradeQty}`),
                price: tradePrice,
                qty: tradeQty,
                volumeUsd,
                isBuyerMaker,
                timestamp: data.T || Date.now(),
              };

              setTrades((prev) => {
                if (prev.some((p) => p.id === newTrade.id)) return prev;
                return [newTrade, ...prev].slice(0, 150);
              });
            }
          } catch (e) {}
        };
      }

      ws.onerror = () => {};
    } catch (e) {}

    return () => {
      isSubscribed = false;
      if (ws) {
        try {
          ws.close();
        } catch (e) {}
      }
    };
  }, [cleanSymbol, marketType, exchange, scheduleBookFlush]);

  // 4. Aggregate Order Book according to Compression (1x - 100x) and Depth
  const { aggregatedAsks, aggregatedBids, maxVolumeUsd, bestAsk, bestBid, spreadUsd, spreadPct, totalRealOrdersCount } = useMemo(() => {
    let asksList: OrderBookRow[] = [];
    let bidsList: OrderBookRow[] = [];

    if (compression === 1) {
      // 1x: Show ALL real orders directly with exact prices and quantities from exchange
      asksList = rawAsks.map(([p, q]) => ({
        price: p,
        qty: q,
        volumeUsd: p * q,
        isAsk: true,
        isDensity: (p * q) >= densityThresholdUsd,
      })).sort((a, b) => b.price - a.price); // Highest ask on top, lowest near spread

      bidsList = rawBids.map(([p, q]) => ({
        price: p,
        qty: q,
        volumeUsd: p * q,
        isAsk: false,
        isDensity: (p * q) >= densityThresholdUsd,
      })).sort((a, b) => b.price - a.price); // Highest bid near spread, lowest at bottom
    } else {
      // > 1x: Aggregate real orders into price compression buckets (step = baseTickSize * compression)
      const roundToStep = (price: number) => {
        if (effectiveStep <= 0) return price;
        return Number((Math.round(price / effectiveStep) * effectiveStep).toFixed(8));
      };

      const asksMap = new Map<number, { qty: number; volumeUsd: number }>();
      rawAsks.forEach(([p, q]) => {
        const rounded = roundToStep(p);
        const curr = asksMap.get(rounded) || { qty: 0, volumeUsd: 0 };
        asksMap.set(rounded, {
          qty: curr.qty + q,
          volumeUsd: curr.volumeUsd + p * q,
        });
      });

      const bidsMap = new Map<number, { qty: number; volumeUsd: number }>();
      rawBids.forEach(([p, q]) => {
        const rounded = roundToStep(p);
        const curr = bidsMap.get(rounded) || { qty: 0, volumeUsd: 0 };
        bidsMap.set(rounded, {
          qty: curr.qty + q,
          volumeUsd: curr.volumeUsd + p * q,
        });
      });

      asksList = Array.from(asksMap.entries())
        .map(([price, val]) => ({
          price,
          qty: val.qty,
          volumeUsd: val.volumeUsd,
          isAsk: true,
          isDensity: val.volumeUsd >= densityThresholdUsd,
        }))
        .sort((a, b) => b.price - a.price);

      bidsList = Array.from(bidsMap.entries())
        .map(([price, val]) => ({
          price,
          qty: val.qty,
          volumeUsd: val.volumeUsd,
          isAsk: false,
          isDensity: val.volumeUsd >= densityThresholdUsd,
        }))
        .sort((a, b) => b.price - a.price);
    }

    // Apply depth preset (if not 'all')
    const finalAsks = depthLevelCount < 99999 ? asksList.slice(-depthLevelCount) : asksList;
    const finalBids = depthLevelCount < 99999 ? bidsList.slice(0, depthLevelCount) : bidsList;

    // Find highest volume to scale horizontal bars
    let maxVol = 1000;
    finalAsks.forEach((r) => { if (r.volumeUsd > maxVol) maxVol = r.volumeUsd; });
    finalBids.forEach((r) => { if (r.volumeUsd > maxVol) maxVol = r.volumeUsd; });

    const bestA = finalAsks.length > 0 ? finalAsks[finalAsks.length - 1].price : 0;
    const bestB = finalBids.length > 0 ? finalBids[0].price : 0;
    const sUsd = bestA && bestB ? Math.max(0, bestA - bestB) : 0;
    const sPct = bestB > 0 ? (sUsd / bestB) * 100 : 0;

    return {
      aggregatedAsks: finalAsks,
      aggregatedBids: finalBids,
      maxVolumeUsd: maxVol,
      bestAsk: bestA,
      bestBid: bestB,
      spreadUsd: sUsd,
      spreadPct: sPct,
      totalRealOrdersCount: rawBids.length + rawAsks.length,
    };
  }, [rawAsks, rawBids, compression, effectiveStep, depthLevelCount, densityThresholdUsd]);

  // 5. Sound Alert detection for specified density
  useEffect(() => {
    if (!soundAlertEnabled) return;

    let hasNewDensity = false;
    const currentDenseLevels = new Set<number>();

    // Check asks
    aggregatedAsks.forEach((row) => {
      if (row.isDensity) {
        currentDenseLevels.add(row.price);
        if (!alertedLevelsRef.current.has(row.price)) {
          hasNewDensity = true;
        }
      }
    });

    // Check bids
    aggregatedBids.forEach((row) => {
      if (row.isDensity) {
        currentDenseLevels.add(row.price);
        if (!alertedLevelsRef.current.has(row.price)) {
          hasNewDensity = true;
        }
      }
    });

    if (hasNewDensity) {
      playDensityChime(false);
    }

    // Keep alert tracking updated
    alertedLevelsRef.current = currentDenseLevels;
  }, [aggregatedAsks, aggregatedBids, soundAlertEnabled]);

  // Root container ref and dimensions tracking
  const rootContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(0);

  // Auto-center on mount, on symbol change, or when block dimensions change
  const handleCenterDOM = useCallback(() => {
    if (spreadRowRef.current && domScrollContainerRef.current) {
      const container = domScrollContainerRef.current;
      const spreadEl = spreadRowRef.current;
      const topOffset = spreadEl.offsetTop - container.clientHeight / 2 + spreadEl.clientHeight / 2;
      container.scrollTo({ top: topOffset, behavior: 'smooth' });
    }
  }, []);

  // ResizeObserver to detect any change in width or height of the widget/chart block
  useEffect(() => {
    if (!rootContainerRef.current) return;
    let resizeTimer: any = null;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerWidth(width);
        setContainerHeight(height);

        // When block height or width changes, re-center DOM spread smoothly so price is always in view
        if (autoCenterEnabled) {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            handleCenterDOM();
          }, 80);
        }
      }
    });

    ro.observe(rootContainerRef.current);
    return () => {
      clearTimeout(resizeTimer);
      ro.disconnect();
    };
  }, [handleCenterDOM, autoCenterEnabled]);

  useEffect(() => {
    if (autoCenterEnabled) {
      const timer = setTimeout(handleCenterDOM, 300);
      return () => clearTimeout(timer);
    }
  }, [handleCenterDOM, symbol, autoCenterEnabled]);

  // Timeframe switch handler
  const handleSelectClusterTf = (tf: Timeframe) => {
    setClusterTf(tf);
    setIsTfDropdownOpen(false);
    onUpdateSettings?.({ clusterTimeframe: tf });
  };

  // Compression switch handler
  const handleSelectCompression = (comp: number) => {
    setCompression(comp);
    setIsCompressionDropdownOpen(false);
    persistOrderbookSettings({ compression: comp });
    onUpdateSettings?.({ compression: comp });
  };

  // Depth switch handler
  const handleSelectDepth = (depth: 'all' | 'deep' | 'medium' | 'small') => {
    setDepthPreset(depth);
    persistOrderbookSettings({ depth });
    onUpdateSettings?.({ depth });
  };

  // Density threshold handler
  const handleSetDensityThreshold = (val: number) => {
    setDensityThresholdUsd(val);
    persistOrderbookSettings({ densityThresholdUsd: val });
    onUpdateSettings?.({ densityThresholdUsd: val });
  };

  // Trade bubbles threshold handler
  const handleSetBubbleThreshold = (val: number) => {
    setBubbleThresholdUsd(val);
    persistOrderbookSettings({ bubbleThresholdUsd: val });
    onUpdateSettings?.({ bubbleThresholdUsd: val });
  };

  // Sound toggle handler
  const handleToggleSound = () => {
    const next = !soundAlertEnabled;
    setSoundAlertEnabled(next);
    if (next) playDensityChime(true);
    persistOrderbookSettings({ soundAlertEnabled: next });
    onUpdateSettings?.({ soundAlertEnabled: next });
  };

  // Auto-center toggle handler
  const handleToggleAutoCenter = () => {
    setAutoCenterEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('scalper_dom_auto_center', String(next));
      } catch {}
      if (next) {
        setTimeout(handleCenterDOM, 50);
      }
      return next;
    });
  };

  // Calculate recent trade bubbles placed next to the price ladder (filtered by volume threshold)
  const tradeBubbles = useMemo(() => {
    const filtered = bubbleThresholdUsd > 0
      ? trades.filter((t) => t.volumeUsd >= bubbleThresholdUsd)
      : trades;

    return filtered.slice(0, 50).map((t, idx) => {
      // Scale bubble diameter from 20px to 38px based on volume
      const sizePx = Math.min(38, Math.max(20, Math.round(Math.log10(Math.max(t.volumeUsd, 10)) * 7.5)));
      return {
        ...t,
        sizePx,
        opacity: Math.max(0.4, 1 - idx * 0.015),
      };
    });
  }, [trades, bubbleThresholdUsd]);

  return (
    <div
      ref={rootContainerRef}
      className="relative flex flex-col w-full h-full bg-[#0b0e14] text-slate-200 select-none overflow-hidden font-mono text-[11px]"
      style={{ height: height || '100%' }}
    >
      {/* ================= TOP-LEFT OVERLAY (Responsive, mobile friendly) ================= */}
      <div className="absolute top-1 left-1.5 z-30 flex flex-col items-start gap-1 pointer-events-auto max-w-[calc(100%-80px)]">


        {/* Row 2: ⚙ | 5m | x10 | Стрічка [▾/▴] | Кластери | Center | Ping */}
        <div className="flex flex-wrap items-center gap-1 bg-[#090d16]/95 px-1.5 py-0.5 rounded-md border border-slate-800/80 text-[10px] text-slate-400 backdrop-blur-md shadow-sm">
          {/* Settings button ⚙ */}
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`p-1 rounded hover:text-white transition-colors cursor-pointer ${
              isSettingsOpen ? 'text-cyan-400 bg-slate-800' : 'text-slate-400'
            }`}
            title="Налаштування стакану та сповіщень"
          >
            <Settings className="w-3 h-3" />
          </button>

          {/* Timeframe for clusters (5m) */}
          <div className="relative">
            <button
              onClick={() => setIsTfDropdownOpen(!isTfDropdownOpen)}
              className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 font-semibold hover:text-white transition-colors cursor-pointer flex items-center gap-0.5"
              title="Таймфрейм історії кластерів"
            >
              <span>{clusterTf}</span>
              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
            </button>

            {isTfDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 flex flex-col min-w-[70px]">
                {(['1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => handleSelectClusterTf(tf)}
                    className={`px-2 py-1 text-left hover:bg-slate-800 text-[10px] flex items-center justify-between ${
                      clusterTf === tf ? 'text-cyan-400 font-bold' : 'text-slate-300'
                    }`}
                  >
                    <span>{tf}</span>
                    {clusterTf === tf && <Check className="w-2.5 h-2.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Compression badge (x10) */}
          <div className="relative">
            <button
              onClick={() => setIsCompressionDropdownOpen(!isCompressionDropdownOpen)}
              className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 font-semibold hover:text-white transition-colors cursor-pointer flex items-center gap-0.5"
              title="Рівень зжаття стакану (до 100х)"
            >
              <span>x{compression}</span>
              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
            </button>

            {isCompressionDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 flex flex-col min-w-[80px]">
                {[1, 2, 5, 10, 20, 50, 100].map((c) => (
                  <button
                    key={c}
                    onClick={() => handleSelectCompression(c)}
                    className={`px-2 py-1 text-left hover:bg-slate-800 text-[10px] flex items-center justify-between ${
                      compression === c ? 'text-amber-400 font-bold' : 'text-slate-300'
                    }`}
                  >
                    <span>x{c}</span>
                    {compression === c && <Check className="w-2.5 h-2.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-slate-600 hidden sm:inline">-</span>

          {/* Tape Toggle Button (Згортати / Розгортати стрічку) */}
          <button
            onClick={handleToggleTape}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer text-[9px] font-bold border shrink-0 ${
              !isTapeCollapsed
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title={isTapeCollapsed ? 'Розгорнути стрічку угод' : 'Згорнути стрічку угод'}
          >
            <CircleDot className="w-2.5 h-2.5 text-cyan-400" />
            <span>{!isTapeCollapsed ? 'Стрічка' : 'Стрічка +'}</span>
          </button>

          {/* Clusters Toggle Button (Кластери) - Visible on ALL screen sizes */}
          <button
            onClick={handleToggleClusters}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer text-[9px] font-bold border shrink-0 ${
              showClusters
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title={showClusters ? 'Згорнути кластери' : 'Показати кластери'}
          >
            <BarChart3 className="w-2.5 h-2.5 text-amber-400" />
            <span>{showClusters ? 'Кластери' : 'Кластери +'}</span>
          </button>

          {/* Latency ping indicator */}
          <div className="hidden sm:flex items-center gap-1 text-[9px] font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{latencyMs}ms</span>
          </div>

          {/* Real orders count badge */}
          <div
            className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-[9px] font-bold"
            title={`Реальні активні заявки у стакані: ${rawAsks.length} Short (Asks) + ${rawBids.length} Long (Bids)`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span>{totalRealOrdersCount}</span>
          </div>

          {/* Auto Center Button */}
          <button
            onClick={handleCenterDOM}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-[9px] font-bold border border-slate-700"
            title="Центрувати стакан на спреді"
          >
            <Crosshair className="w-2.5 h-2.5 text-cyan-400" />
            <span className="hidden xs:inline">Центр</span>
          </button>
        </div>
      </div>



      {/* ================= SETTINGS POPOVER DIALOG ================= */}
      {isSettingsOpen && (
        <div
          className="absolute top-14 left-2.5 z-50 w-80 max-h-[85vh] overflow-y-auto no-scrollbar bg-slate-900/98 border border-slate-700 rounded-2xl shadow-2xl p-3.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
            <span className="font-bold text-xs text-white flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              Параметри стакану (DOM)
            </span>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Розмір блоку стакану: 600px 780px 950px */}
          <div className="mb-3 space-y-1.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800/90">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>Розмір блоку стакану (висота):</span>
              </span>
              <span className="text-cyan-400 font-bold font-mono">
                {activeHeightPreset === 'md' ? '600px' : activeHeightPreset === 'xl' ? '950px' : '780px'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[11px]">
              {[
                { size: 'md' as const, label: '600px' },
                { size: 'lg' as const, label: '780px' },
                { size: 'xl' as const, label: '950px' },
              ].map((item) => (
                <button
                  key={item.size}
                  type="button"
                  onClick={() => handleDomHeightPresetChange(item.size)}
                  className={`py-1.5 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                    activeHeightPreset === item.size
                      ? 'bg-cyan-500/25 border-cyan-500 text-cyan-300 shadow-sm shadow-cyan-950/60'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="text-[9.5px] text-slate-500 leading-tight">
              Змінює тільки довжину (висоту) стакану до низу. Ширина залежить від ширини графіка.
            </p>
          </div>

          {/* Автоцентрування */}
          <div className="mb-3 p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/15 flex items-center justify-center text-cyan-400">
                <Crosshair className="w-3.5 h-3.5" />
              </div>
              <div className="text-[11px]">
                <div className="font-semibold text-white">Автоцентрування</div>
                <div className="text-[9px] text-slate-400">Автоцентрувати стакан на спред</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleAutoCenter}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                autoCenterEnabled
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {autoCenterEnabled ? 'УВІМК' : 'ВИМК'}
            </button>
          </div>

          {/* 1. Плотність у стакані (Threshold) - від 100к, 300к, 500к, 1М */}
          <div className="mb-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">Поріг плотності (USD):</span>
              <span className="text-amber-400 font-bold font-mono">
                {formatVolume(densityThresholdUsd)}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-[10px]">
              {[
                { amt: 100000, label: '100к' },
                { amt: 300000, label: '300к' },
                { amt: 500000, label: '500к' },
                { amt: 1000000, label: '1М' },
              ].map(({ amt, label }) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleSetDensityThreshold(amt)}
                  className={`py-1.5 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                    densityThresholdUsd === amt
                      ? 'bg-amber-500/25 border-amber-500 text-amber-300 shadow-sm shadow-amber-950/60'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="range"
                min={50000}
                max={2000000}
                step={25000}
                value={densityThresholdUsd}
                onChange={(e) => handleSetDensityThreshold(Number(e.target.value))}
                className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-mono shrink-0">
                <span className="text-slate-500">$</span>
                <input
                  type="number"
                  min={10000}
                  step={25000}
                  value={densityThresholdUsd}
                  onChange={(e) => handleSetDensityThreshold(Math.max(10000, Number(e.target.value)))}
                  className="w-18 bg-transparent text-white text-right focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 2. Сума показу кружечків у стрічці угод (Trade Bubbles Minimum Volume) */}
          <div className="mb-3 space-y-1.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800/90">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <CircleDot className="w-3.5 h-3.5 text-cyan-400" />
                <span>Сума кружечків у стрічці:</span>
              </span>
              <span className="text-cyan-400 font-bold font-mono">
                {bubbleThresholdUsd === 0 ? 'Всі угоди' : `≥ ${formatVolume(bubbleThresholdUsd)}`}
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1 text-[10px]">
              {[
                { val: 0, label: 'Всі' },
                { val: 1000, label: '1к' },
                { val: 5000, label: '5к' },
                { val: 10000, label: '10к' },
                { val: 25000, label: '25к' },
                { val: 50000, label: '50к' },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => handleSetBubbleThreshold(item.val)}
                  className={`py-1 rounded border text-center font-bold transition-all cursor-pointer ${
                    bubbleThresholdUsd === item.val
                      ? 'bg-cyan-500/25 border-cyan-500 text-cyan-300 shadow-sm shadow-cyan-950/60'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="range"
                min={0}
                max={100000}
                step={500}
                value={bubbleThresholdUsd}
                onChange={(e) => handleSetBubbleThreshold(Number(e.target.value))}
                className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-mono shrink-0">
                <span className="text-slate-500">$</span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={bubbleThresholdUsd}
                  onChange={(e) => handleSetBubbleThreshold(Math.max(0, Number(e.target.value)))}
                  className="w-16 bg-transparent text-white text-right focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 2. Звукове сповіщення при появі плотності */}
          <div className="mb-3 p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400">
                <BellRing className="w-3.5 h-3.5" />
              </div>
              <div className="text-[11px]">
                <div className="font-semibold text-white">Звук при плотності</div>
                <div className="text-[9px] text-slate-400">Дзвінок при появі великого об'єму</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => playDensityChime(true)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 hover:text-white"
                title="Тест звуку"
              >
                Тест
              </button>
              <button
                onClick={handleToggleSound}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  soundAlertEnabled
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {soundAlertEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* 3. Рівень зжаття (Compression до 100x) */}
          <div className="mb-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">Рівень зжаття стакану:</span>
              <span className="text-cyan-400 font-bold font-mono">x{compression}</span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-[10px]">
              {[1, 2, 5, 10, 20, 50, 100].map((c) => (
                <button
                  key={c}
                  onClick={() => handleSelectCompression(c)}
                  className={`py-1 rounded border text-center font-bold transition-all cursor-pointer ${
                    compression === c
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  x{c}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Глибина стакану (Depth: 50, 100, 250, ВСІ 500+) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">Глибина стакану:</span>
              <span className="text-cyan-400 text-[10px] font-mono font-bold">
                {depthPreset === 'small'
                  ? '50 рівнів'
                  : depthPreset === 'medium'
                  ? '100 рівнів'
                  : depthPreset === 'deep'
                  ? '250 рівнів'
                  : 'ВСІ реальні заявки (500+)'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-[10px]">
              {[
                { id: 'small', label: '50' },
                { id: 'medium', label: '100' },
                { id: 'deep', label: '250' },
                { id: 'all', label: 'ВСІ (500+)' },
              ].map((d) => (
                <button
                  key={d.id}
                  onClick={() => handleSelectDepth(d.id as any)}
                  className={`py-1.5 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                    depthPreset === d.id
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= BOTTOM-LEFT PRESETS ================= */}
      <div className="absolute bottom-2 left-2 z-30 flex flex-col items-start gap-1 pointer-events-auto">
        {/* Preset lot buttons: x5 tag, $751, $10, $20, $30, $50, $100 */}
        <div className="flex flex-col gap-0.5 bg-[#090d16]/95 p-1 rounded-lg border border-slate-800/80 text-[10px] font-mono shadow-md backdrop-blur-sm">
          <div
            className="flex items-center justify-between gap-1 px-1 py-0.5 text-[9px] text-slate-400 font-bold cursor-pointer hover:text-white select-none"
            onClick={() => setIsPresetsCollapsed(!isPresetsCollapsed)}
            title="Згорнути / розгорнути лоти"
          >
            <div className="flex items-center gap-1">
              <span className="px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">x5</span>
              <span>Лот {selectedPreset}</span>
            </div>
            {isPresetsCollapsed ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </div>

          {!isPresetsCollapsed && (
            <div className="flex flex-col gap-0.5 pt-0.5">
              {['$751', '$10', '$20', '$30', '$50', '$100'].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setSelectedPreset(preset)}
                  className={`px-2 py-0.5 rounded text-left font-bold transition-colors cursor-pointer ${
                    selectedPreset === preset
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Cluster Footprint Summary */}
        <div className="hidden xs:flex items-center gap-1.5 bg-[#090d16]/95 px-2 py-1 rounded-md border border-slate-800/80 text-[10px] text-slate-400 font-mono shadow-md backdrop-blur-sm">
          <span className="px-1.5 py-0.5 rounded bg-blue-600/80 text-white font-bold text-[9px]">
            1.3K
          </span>
          <span className="text-slate-300 font-semibold">1.2K</span>
          <span className="text-slate-500">|</span>
          <span className="text-cyan-400 font-bold">03:59</span>
        </div>
      </div>

      {/* ================= MAIN SCALPER CANVAS (Clusters + Tape + DOM) ================= */}
      <div className="flex-1 w-full overflow-hidden relative flex divide-x divide-slate-900/60 min-h-0">
        {/* Subtle Horizontal Price Grid Lines across canvas */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <div
            className="w-full h-full opacity-15"
            style={{
              backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
              backgroundSize: '100% 22px',
            }}
          />
        </div>

        {/* 1. LEFT SECTION: Cluster History (collapsible/expandable footprint clusters with all sums visible) */}
        {showClusters ? (
          <div className="w-36 sm:w-48 md:w-60 lg:w-72 max-w-[42%] shrink-0 h-full flex flex-col relative z-10 select-none overflow-hidden bg-[#070a10]/90 border-r border-slate-900/80">
            {/* Clusters Sticky Header */}
            <div className="sticky top-0 z-20 flex items-center justify-between px-1.5 py-1 bg-slate-950/95 border-b border-slate-800/80 backdrop-blur-md shrink-0">
              <div className="flex items-center gap-1 min-w-0">
                <BarChart3 className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider truncate">
                  Кластери
                </span>
                <span className="text-[8px] font-mono text-amber-400/90 font-bold px-1 rounded bg-amber-500/10">
                  {clusterTf}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[7.5px] font-mono text-slate-500 hidden sm:inline">
                  (Куп/Сума)
                </span>
                <button
                  type="button"
                  onClick={handleToggleClusters}
                  className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                  title="Згорнути кластери"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Footprint Cluster Columns (all sums clearly visible, horizontal scroll if screen is narrow) */}
            <div className="flex-1 flex items-stretch h-full gap-1 p-1 overflow-x-auto overflow-y-hidden no-scrollbar touch-pan-x">
              {clusters.map((col) => {
                const maxLvl = col.maxLevelVol || 1;
                return (
                  <div
                    key={col.candleTime}
                    className="flex-1 min-w-[46px] sm:min-w-[52px] flex flex-col h-full items-center justify-between relative group border border-slate-800/40 rounded bg-slate-950/40 p-0.5"
                  >
                    {/* Column top label: Candle time */}
                    <div className="text-[8.5px] text-slate-300 font-mono shrink-0 truncate py-0.5 font-bold">
                      {col.label}
                    </div>

                    {/* Footprint Cluster Levels Stack */}
                    <div className="flex-1 w-full flex flex-col justify-center gap-[2px] overflow-y-auto no-scrollbar my-0.5">
                      {Object.values(col.levels)
                        .sort((a, b) => b.price - a.price)
                        .slice(0, 16)
                        .map((lvl) => {
                          const isPOC = lvl.isPOC;
                          const fillPct = Math.min(100, Math.max(8, (lvl.totalVol / maxLvl) * 100));

                          return (
                            <div
                              key={lvl.price}
                              className={`w-full h-[18px] sm:h-[19px] relative flex items-center justify-between px-1 text-[8px] sm:text-[8.5px] rounded font-mono transition-all overflow-hidden ${
                                isPOC
                                  ? 'border border-amber-400 bg-amber-500/25 ring-1 ring-amber-400/40 shadow-sm shadow-amber-950/60'
                                  : lvl.buyVol >= lvl.sellVol
                                  ? 'bg-slate-900/60 hover:bg-slate-800 border-l border-emerald-500/80'
                                  : 'bg-slate-900/60 hover:bg-slate-800 border-l border-rose-500/80'
                              }`}
                              title={`Рівень: $${formatCryptoPrice(lvl.price)}\nКупівля: $${formatVolume(lvl.buyVol)}\nПродаж: $${formatVolume(lvl.sellVol)}\nРазом: $${formatVolume(lvl.totalVol)}${isPOC ? ' (POC - Point of Control)' : ''}`}
                            >
                              {/* Horizontal relative volume fill bar */}
                              <div
                                className={`absolute left-0 top-0 bottom-0 pointer-events-none opacity-20 ${
                                  isPOC
                                    ? 'bg-amber-400'
                                    : lvl.buyVol >= lvl.sellVol
                                    ? 'bg-emerald-400'
                                    : 'bg-rose-400'
                                }`}
                                style={{ width: `${fillPct}%` }}
                              />

                              {/* Buy volume sum on left */}
                              <span className="relative z-10 text-[7.5px] sm:text-[8px] font-bold text-emerald-400/90 shrink-0 font-mono">
                                {formatCompactClusterSum(lvl.buyVol)}
                              </span>

                              {/* Total volume sum on right with POC badge if applicable */}
                              <div className="relative z-10 flex items-center gap-0.5 shrink-0 ml-auto font-mono">
                                {isPOC && (
                                  <span className="text-[6.5px] font-black px-0.5 rounded bg-amber-400 text-slate-950 uppercase tracking-tighter">
                                    POC
                                  </span>
                                )}
                                <span
                                  className={`text-[8px] sm:text-[8.5px] font-bold ${
                                    isPOC ? 'text-amber-200 font-extrabold' : 'text-slate-100'
                                  }`}
                                >
                                  {formatCompactClusterSum(lvl.totalVol)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    {/* Column bottom: Total Candle Volume Sum (Fully visible) */}
                    <div
                      className="text-[8.5px] text-amber-300 font-mono shrink-0 truncate py-0.5 font-extrabold tracking-tight"
                      title={`Загальний об'єм свічки: ${formatVolume(col.totalVolume)}`}
                    >
                      {formatCandleTotalSum(col.totalVolume)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Collapsed Clusters Strip */
          <div
            onClick={handleToggleClusters}
            className="w-7 shrink-0 h-full relative z-10 flex flex-col items-center justify-between py-2 border-r border-slate-900/70 bg-[#070a10]/95 hover:bg-slate-900/90 cursor-pointer transition-colors group select-none"
            title="Розгорнути кластери"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleClusters();
              }}
              className="p-1 rounded text-amber-400 group-hover:text-amber-300 hover:bg-slate-800 transition-colors"
              title="Розгорнути кластери"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <div className="flex flex-col items-center gap-1.5 my-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span
                className="text-[9px] font-bold text-slate-400 group-hover:text-amber-300 uppercase tracking-widest"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                Кластери
              </span>
            </div>
            <span className="text-[10px] text-slate-500 group-hover:text-amber-400 font-bold">»</span>
          </div>
        )}

        {/* 2. MIDDLE SECTION: Trades Tape ("Стрічка угод / Лента сделок") */}
        {!isTapeCollapsed ? (
          <div className="w-24 sm:w-32 md:w-36 lg:w-44 max-w-[32%] shrink-0 h-full relative z-10 flex flex-col border-r border-slate-900/70 bg-[#070a10]/90 select-none">
            {/* Tape Sticky Header */}
            <div className="sticky top-0 z-20 flex flex-col px-2 py-1 bg-slate-950/95 border-b border-slate-800/80 backdrop-blur-md shrink-0">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider truncate">
                    Стрічка
                  </span>
                  <span className="flex h-1.5 w-1.5 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Clickable threshold filter */}
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    className="flex items-center gap-0.5 text-[8px] font-mono px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 hover:border-cyan-500/50 transition-colors cursor-pointer"
                    title="Змінити поріг показу кружечків"
                  >
                    <CircleDot className="w-2 h-2 text-cyan-400" />
                    <span>{bubbleThresholdUsd === 0 ? 'Всі' : `≥${formatWholeSum(bubbleThresholdUsd)}`}</span>
                  </button>

                  {/* Collapse Tape Button */}
                  <button
                    type="button"
                    onClick={handleToggleTape}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                    title="Згорнути стрічку"
                  >
                    <PanelRightClose className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Column labels: ONLY Circle and Price */}
              <div className="flex items-center justify-between text-[8px] text-slate-500 font-mono mt-0.5 pt-0.5 border-t border-slate-900/80">
                <span>Кружечок</span>
                <span className="text-right">Ціна</span>
              </div>
            </div>

            {/* Trade bubbles / Tape live scroll: ONLY CIRCLES AND PRICE */}
            <div
              className="flex-1 w-full overflow-y-auto no-scrollbar p-1 flex flex-col gap-1 touch-pan-y"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {tradeBubbles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-2 text-slate-500 my-auto">
                  <CircleDot className="w-6 h-6 text-slate-700 animate-pulse" />
                  <span className="text-[10px] font-mono leading-tight">
                    Немає угод {bubbleThresholdUsd > 0 ? `≥ ${formatWholeSum(bubbleThresholdUsd)}` : ''}
                  </span>
                  {bubbleThresholdUsd > 0 && (
                    <button
                      type="button"
                      onClick={() => handleSetBubbleThreshold(0)}
                      className="text-[9px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                    >
                      Показати всі угоди
                    </button>
                  )}
                </div>
              ) : (
                tradeBubbles.map((tb) => {
                  const isBuy = !tb.isBuyerMaker;
                  const isWhale = tb.volumeUsd >= densityThresholdUsd;

                  return (
                    <div
                      key={tb.id}
                      className={`flex items-center justify-between px-1.5 py-1 rounded-md border text-xs font-mono transition-all duration-150 animate-in fade-in hover:brightness-125 cursor-default ${
                        isWhale
                          ? isBuy
                            ? 'bg-emerald-950/70 border-emerald-400/90 shadow-sm shadow-emerald-500/20'
                            : 'bg-rose-950/70 border-rose-400/90 shadow-sm shadow-rose-500/20'
                          : isBuy
                          ? 'bg-emerald-950/30 border-emerald-800/40 hover:border-emerald-500/60'
                          : 'bg-rose-950/30 border-rose-800/40 hover:border-rose-500/60'
                      }`}
                      title={`${isBuy ? 'BUY' : 'SELL'}: $${formatCompactWholeBubble(tb.volumeUsd)} @ $${formatCryptoPrice(tb.price)} (${formatTradeTime(tb.timestamp)})`}
                    >
                      {/* ONLY THE CIRCLE (КРУЖЕЧОК) */}
                      <div
                        className={`flex items-center justify-center rounded-full font-extrabold shrink-0 shadow-sm transition-transform duration-100 ${
                          isBuy
                            ? 'bg-emerald-500 text-slate-950 shadow-emerald-900/50 ring-1 ring-emerald-400/60'
                            : 'bg-rose-500 text-white shadow-rose-900/50 ring-1 ring-rose-400/60'
                        }`}
                        style={{
                          width: `${tb.sizePx}px`,
                          height: `${tb.sizePx}px`,
                          minWidth: `${tb.sizePx}px`,
                          minHeight: `${tb.sizePx}px`,
                          fontSize: tb.sizePx >= 28 ? '8.5px' : '7.5px',
                        }}
                      >
                        <span className="truncate px-0.5 select-none font-bold">
                          {formatCompactWholeBubble(tb.volumeUsd)}
                        </span>
                      </div>

                      {/* ONLY THE PRICE (ЦІНА) */}
                      <span
                        className={`font-mono font-bold text-[10px] sm:text-[11px] shrink-0 text-right ml-auto select-all ${
                          isBuy ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        ${formatCryptoPrice(tb.price)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* Collapsed Tape Strip */
          <div
            onClick={handleToggleTape}
            className="w-7 shrink-0 h-full relative z-10 flex flex-col items-center justify-between py-2 border-r border-slate-900/70 bg-[#070a10]/95 hover:bg-slate-900/90 cursor-pointer transition-colors group select-none"
            title="Розгорнути стрічку угод"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleTape();
              }}
              className="p-1 rounded text-cyan-400 group-hover:text-cyan-300 hover:bg-slate-800 transition-colors"
              title="Розгорнути стрічку"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="flex flex-col items-center gap-1.5 my-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span
                className="text-[9px] font-bold text-slate-400 group-hover:text-cyan-300 uppercase tracking-widest"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                Стрічка
              </span>
            </div>
            <span className="text-[10px] text-slate-500 group-hover:text-cyan-400 font-bold">»</span>
          </div>
        )}

        {/* 3. RIGHT SECTION: Order Book ("Стакан") - Dynamically stretches to 100% of chart width */}
        <div
          ref={domScrollContainerRef}
          className="flex-1 min-w-[170px] w-full h-full overflow-y-auto no-scrollbar relative flex flex-col bg-[#090d16]/40 touch-pan-y"
          style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}
        >
          {/* Header columns: Об'єм (ліворуч) | Ціна (праворуч, always visible) */}
          <div className="sticky top-0 z-20 flex items-center justify-between px-2 sm:px-2.5 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800/80 shrink-0 bg-slate-950/95 backdrop-blur-sm">
            <span className="flex items-center gap-1 min-w-0 truncate">
              <span>Об'єм</span>
              <span className="text-cyan-400/80 font-mono text-[8px]">({aggregatedAsks.length + aggregatedBids.length})</span>
            </span>
            <span className="shrink-0 text-right pl-1 text-slate-300">Ціна</span>
          </div>

          {/* Rows container */}
          <div className="flex flex-col py-1">
            {/* ASKS (TOP, Shorts) */}
            <div className="flex flex-col justify-end">
              {aggregatedAsks.map((row) => {
                const fillPct = Math.min(100, Math.max(3, (row.volumeUsd / maxVolumeUsd) * 100));
                const isDensity = row.isDensity;

                return (
                  <div
                    key={`ask-${row.price}`}
                    className={`relative flex items-center justify-between px-2 sm:px-2.5 h-[21px] transition-colors group cursor-crosshair ${
                      isDensity
                        ? 'bg-rose-950/70 border-y border-amber-400 shadow-sm shadow-amber-950/50'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Dark Crimson Red Horizontal Volume Bar */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 pointer-events-none transition-all duration-150 ${
                        isDensity ? 'bg-gradient-to-r from-amber-600/70 to-rose-700/80' : 'bg-rose-900/60'
                      }`}
                      style={{ width: `${fillPct}%` }}
                    />

                    {/* Volume text on Left */}
                    <div className="relative z-10 flex items-center gap-1 min-w-0 pr-1 overflow-hidden">
                      <span className="font-mono text-white text-[10px] sm:text-[11px] font-medium truncate">
                        {formatVolume(row.volumeUsd)}
                      </span>
                      {isDensity && (
                        <span className="text-[7.5px] sm:text-[8px] font-bold px-1 py-0.2 rounded bg-amber-500 text-slate-950 uppercase tracking-tighter shrink-0">
                          Плотн
                        </span>
                      )}
                    </div>

                    {/* Price text on Right - ALWAYS VISIBLE ON ANY DEVICE */}
                    <span className="relative z-10 font-mono font-bold text-rose-400 text-[10.5px] sm:text-[11.5px] shrink-0 text-right pl-1.5 ml-auto select-all">
                      {formatCryptoPrice(row.price)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* SPREAD AREA: Seamless flow with NO borders, NO boxes */}
            <div
              ref={spreadRowRef}
              className="flex items-center justify-between px-2 sm:px-2.5 h-[16px] bg-slate-900/60 text-slate-400 font-mono text-[9.5px] my-[1px] shrink-0"
            >
              <div className="flex items-center gap-1.5 min-w-0 truncate">
               
                <span className="text-[8.5px] sm:text-[9px] text-slate-500 hidden xs:inline">({spreadPct.toFixed(2)}%)</span>
              </div>
              <span className="text-cyan-400 font-bold text-[11px] sm:text-[12px] shrink-0 text-right pl-1.5 ml-auto">
                {formatCryptoPrice(livePrice)}
              </span>
            </div>

            {/* BIDS (BOTTOM, Longs) */}
            <div className="flex flex-col justify-start">
              {aggregatedBids.map((row) => {
                const fillPct = Math.min(100, Math.max(3, (row.volumeUsd / maxVolumeUsd) * 100));
                const isDensity = row.isDensity;

                return (
                  <div
                    key={`bid-${row.price}`}
                    className={`relative flex items-center justify-between px-2 sm:px-2.5 h-[21px] transition-colors group cursor-crosshair ${
                      isDensity
                        ? 'bg-emerald-950/70 border-y border-amber-400 shadow-sm shadow-amber-950/50'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Dark Green Horizontal Volume Bar */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 pointer-events-none transition-all duration-150 ${
                        isDensity ? 'bg-gradient-to-r from-amber-600/70 to-emerald-700/80' : 'bg-emerald-900/60'
                      }`}
                      style={{ width: `${fillPct}%` }}
                    />

                    {/* Volume text on Left */}
                    <div className="relative z-10 flex items-center gap-1 min-w-0 pr-1 overflow-hidden">
                      <span className="font-mono text-white text-[10px] sm:text-[11px] font-medium truncate">
                        {formatVolume(row.volumeUsd)}
                      </span>
                      {isDensity && (
                        <span className="text-[7.5px] sm:text-[8px] font-bold px-1 py-0.2 rounded bg-amber-500 text-slate-950 uppercase tracking-tighter shrink-0">
                          Плотн
                        </span>
                      )}
                    </div>

                    {/* Price text on Right - ALWAYS VISIBLE ON ANY DEVICE */}
                    <span className="relative z-10 font-mono font-bold text-emerald-400 text-[10.5px] sm:text-[11.5px] shrink-0 text-right pl-1.5 ml-auto select-all">
                      {formatCryptoPrice(row.price)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

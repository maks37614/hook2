import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
  LineStyle,
  IPriceLine,
  CrosshairMode,
} from 'lightweight-charts';
import {
  Maximize2,
  ZoomIn,
  Activity,
  Layers,
  Clock,
  Expand,
  FolderArchive,
  CheckCircle2,
} from 'lucide-react';
import { Kline, DetectedFormation, Timeframe, ExchangeId, MarketType, ChartMarkerInfo, ChartRestoreParams } from '../types';
import { getChartPriceFormat, formatCryptoPrice } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

interface TradingViewChartProps {
  klines: Kline[];
  formation?: DetectedFormation | null;
  symbol: string;
  timeframe: string;
  exchange?: ExchangeId;
  marketType?: MarketType;
  historyLimit?: number;
  onHistoryLimitChange?: (limit: number) => void;
  onTimeframeChange?: (timeframe: Timeframe) => void;
  onLivePriceUpdate?: (price: number) => void;
  onOpenFullscreen?: () => void;
  onAddToArchive?: () => void;
  isArchived?: boolean;
  isSavingArchive?: boolean;
  customMarkers?: ChartMarkerInfo[];
  savedChartParams?: ChartRestoreParams;
  fullHeight?: boolean;
  showNavigationControls?: boolean;
  hideHeaderLiveIndicator?: boolean;
  hideHeaderFormationBadge?: boolean;
  hideSymbolAndPrice?: boolean;
  onLiveStatusChange?: (status: { isConnected: boolean; mode: 'ws' | 'rest' }) => void;
}

// Convert timeframe string to Binance WS interval
function toBinanceWsInterval(tf: string): string {
  switch (tf) {
    case '1m': return '1m';
    case '5m': return '5m';
    case '15m': return '15m';
    case '1h': return '1h';
    case '4h': return '4h';
    case '1d': return '1d';
    default: return '1h';
  }
}

// Convert timeframe string to Bybit WS interval
function toBybitWsInterval(tf: string): string {
  switch (tf) {
    case '1m': return '1';
    case '5m': return '5';
    case '15m': return '15';
    case '1h': return '60';
    case '4h': return '240';
    case '1d': return 'D';
    default: return '60';
  }
}

// Calculate remaining time until the active candle closes based on the timeframe
function calculateBarCloseCountdown(tf: string): { totalSeconds: number; formatted: string; isUrgent: boolean } {
  const now = Date.now();
  let durationMs: number;
  let nextCloseMs: number;

  switch (tf) {
    case '1m':
      durationMs = 60 * 1000;
      nextCloseMs = Math.ceil(now / durationMs) * durationMs;
      break;
    case '5m':
      durationMs = 5 * 60 * 1000;
      nextCloseMs = Math.ceil(now / durationMs) * durationMs;
      break;
    case '15m':
      durationMs = 15 * 60 * 1000;
      nextCloseMs = Math.ceil(now / durationMs) * durationMs;
      break;
    case '30m':
      durationMs = 30 * 60 * 1000;
      nextCloseMs = Math.ceil(now / durationMs) * durationMs;
      break;
    case '1h':
      durationMs = 60 * 60 * 1000;
      nextCloseMs = Math.ceil(now / durationMs) * durationMs;
      break;
    case '4h':
      durationMs = 4 * 60 * 60 * 1000;
      nextCloseMs = Math.ceil(now / durationMs) * durationMs;
      break;
    case '1d': {
      // Closes at UTC 00:00:00
      const d = new Date(now);
      const nextDayUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0);
      nextCloseMs = nextDayUtc;
      durationMs = 24 * 60 * 60 * 1000;
      break;
    }
    default:
      durationMs = 60 * 60 * 1000;
      nextCloseMs = Math.ceil(now / durationMs) * durationMs;
  }

  if (nextCloseMs <= now) {
    nextCloseMs += (durationMs || 60000);
  }

  const diffMs = Math.max(0, nextCloseMs - now);
  const totalSeconds = Math.floor(diffMs / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let formatted: string;
  if (hours > 0) {
    formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Urgent threshold when closing is imminent (triggers ticking animation)
  let urgentThreshold = 30;
  if (tf === '1m') urgentThreshold = 15;
  else if (tf === '5m') urgentThreshold = 30;
  else if (tf === '15m') urgentThreshold = 45;
  else if (tf === '1h') urgentThreshold = 90;
  else if (tf === '4h' || tf === '1d') urgentThreshold = 180;

  const isUrgent = totalSeconds <= urgentThreshold;
  return { totalSeconds, formatted, isUrgent };
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  klines,
  formation,
  symbol,
  timeframe,
  exchange = 'binance',
  marketType = 'futures',
  historyLimit = 1000,
  onHistoryLimitChange,
  onTimeframeChange,
  onLivePriceUpdate,
  onOpenFullscreen,
  onAddToArchive,
  isArchived,
  isSavingArchive,
  customMarkers,
  savedChartParams,
  fullHeight = false,
  showNavigationControls = true,
  hideHeaderLiveIndicator = false,
  hideHeaderFormationBadge = false,
  hideSymbolAndPrice = false,
  onLiveStatusChange,
}) => {
  const { profile } = useAuth();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const lastTickTimeRef = useRef<number>(0);
  const latestPriceRef = useRef<number | null>(null);
  const klinesLengthRef = useRef<number>(klines.length);
  const hasInitiallyCenteredRef = useRef<boolean>(false);
  const prevSymbolRef = useRef<string>(symbol);

  useEffect(() => {
    if (prevSymbolRef.current !== symbol) {
      prevSymbolRef.current = symbol;
      hasInitiallyCenteredRef.current = false;
    }
  }, [symbol]);

  // Real-time state
  const [currentPrice, setCurrentPrice] = useState<number | null>(() => {
    return klines.length > 0 ? klines[klines.length - 1].close : null;
  });
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'neutral'>('neutral');
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [liveMode, setLiveMode] = useState<'ws' | 'rest'>('rest');
  const [tickAnimation, setTickAnimation] = useState<boolean>(false);

  useEffect(() => {
    onLiveStatusChange?.({ isConnected: isLiveConnected, mode: liveMode });
  }, [isLiveConnected, liveMode, onLiveStatusChange]);
  const defaultLabelState = profile?.chartLabelSettings || { entry: true, target: true, stop: true };
  const [showEntryLevel, setShowEntryLevel] = useState<boolean>(defaultLabelState.entry);
  const [showTargetLevel, setShowTargetLevel] = useState<boolean>(defaultLabelState.target);
  const [showStopLevel, setShowStopLevel] = useState<boolean>(defaultLabelState.stop);

  useEffect(() => {
    const nextSettings = profile?.chartLabelSettings || { entry: true, target: true, stop: true };
    setShowEntryLevel(nextSettings.entry);
    setShowTargetLevel(nextSettings.target);
    setShowStopLevel(nextSettings.stop);
  }, [profile?.chartLabelSettings]);

  // Bar Close Countdown state
  const [barCountdown, setBarCountdown] = useState<{ totalSeconds: number; formatted: string; isUrgent: boolean }>(() =>
    calculateBarCloseCountdown(timeframe)
  );
  const [tickPulse, setTickPulse] = useState<boolean>(false);

  useEffect(() => {
    const updateCountdown = () => {
      const countdown = calculateBarCloseCountdown(timeframe);
      setBarCountdown(countdown);
      if (countdown.isUrgent) {
        setTickPulse((prev) => !prev);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [timeframe]);

  // Update latest price ref
  useEffect(() => {
    if (klines.length > 0) {
      const p = klines[klines.length - 1].close;
      setCurrentPrice((prev) => prev ?? p);
      latestPriceRef.current = p;
    }
    klinesLengthRef.current = klines.length;
  }, [klines]);

  // Fit content helper
  const handleFitAll = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, []);

  // Focus / Center on recent candles and latest price action
  const centerChartOnScreen = useCallback(() => {
    if (!chartRef.current || !candleSeriesRef.current || klinesLengthRef.current === 0) return;
    const total = klinesLengthRef.current;

    // Always focus on recent / latest candles where the current price and formation are active
    const visibleBars = Math.min(65, total);
    const rightPadding = Math.round(visibleBars * 0.35); // ~22 bars forward space
    chartRef.current.timeScale().setVisibleLogicalRange({
      from: Math.max(0, total - visibleBars),
      to: total + rightPadding,
    });

    // Auto-scale vertical price scale with comfortable margins for centered focus
    try {
      chartRef.current.priceScale('right').applyOptions({
        autoScale: true,
        scaleMargins: {
          top: 0.12,
          bottom: 0.12,
        },
      });
    } catch {
      // Ignored
    }
  }, []);

  // Zoom to recent candles
  const handleZoomRecent = useCallback(() => {
    if (chartRef.current && klinesLengthRef.current > 0) {
      const total = klinesLengthRef.current;
      const visible = Math.min(80, total);
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: total - visible,
        to: total + 4,
      });
    }
  }, []);

  // Update current live candle and price
  const handleLiveTick = useCallback(
    (candle: { time: number; open: number; high: number; low: number; close: number; volume?: number }, mode: 'ws' | 'rest') => {
      if (!candleSeriesRef.current) return;

      try {
        candleSeriesRef.current.update({
          time: candle.time as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        });

        const prevPrice = latestPriceRef.current;
        if (prevPrice !== null && candle.close !== prevPrice) {
          setPriceDirection(candle.close > prevPrice ? 'up' : 'down');
          setTickAnimation(true);
          setTimeout(() => setTickAnimation(false), 500);
        }

        latestPriceRef.current = candle.close;
        setCurrentPrice(candle.close);
        lastTickTimeRef.current = Date.now();
        setIsLiveConnected(true);
        setLiveMode(mode);
        onLivePriceUpdate?.(candle.close);
      } catch (err) {
        // Ignored
      }
    },
    [onLivePriceUpdate]
  );

  // Initialize Lightweight Charts
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: {
        background: { color: '#090d16' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#64748b',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: '#64748b',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
      },
      timeScale: {
        borderColor: 'rgba(51, 65, 85, 0.8)',
        timeVisible: true,
        secondsVisible: false,
        shiftVisibleRangeOnNewBar: true,
      },
      rightPriceScale: {
        borderColor: 'rgba(51, 65, 85, 0.8)',
        autoScale: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        alignLabels: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const removeTvLogo = () => {
      if (chartContainerRef.current) {
        const logo = chartContainerRef.current.querySelector('#tv-attr-logo');
        if (logo) {
          logo.remove();
        }
      }
    };
    removeTvLogo();
    const logoObserver = new MutationObserver(() => {
      removeTvLogo();
    });
    if (chartContainerRef.current) {
      logoObserver.observe(chartContainerRef.current, { childList: true, subtree: true });
    }

    const initialPrice = klines[klines.length - 1]?.close || formation?.levels.entryPrice || 1;
    const initialPriceFormat = getChartPriceFormat(initialPrice);

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      priceFormat: initialPriceFormat,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    let resizeTimer: any;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (chartRef.current && chartContainerRef.current) {
          const width = chartContainerRef.current.clientWidth;
          const height = chartContainerRef.current.clientHeight;
          if (width > 0 && height > 0) {
            chartRef.current.applyOptions({ width, height });
            chartRef.current.timeScale().fitContent();
          }
        }
      }, 60);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      logoObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  // Update data and price lines when klines change
  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current || !klines.length) return;

    const refPrice = klines[klines.length - 1]?.close || formation?.levels.entryPrice || 1;
    const priceFormatConfig = getChartPriceFormat(refPrice);
    candleSeriesRef.current.applyOptions({
      priceFormat: priceFormatConfig,
    });

    const chartData: CandlestickData<Time>[] = klines.map((k) => ({
      time: k.time as Time,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));

    const uniqueSortedData = chartData
      .filter((item, index, self) => index === self.findIndex((t) => t.time === item.time))
      .sort((a, b) => (a.time as number) - (b.time as number));

    candleSeriesRef.current.setData(uniqueSortedData);

    // Initial positioning: auto-focus to center of chart strictly ONCE upon entering page (or restore saved range)
    const totalBars = uniqueSortedData.length;
    if (savedChartParams?.visibleRange && totalBars > 0) {
      chartRef.current.timeScale().setVisibleLogicalRange(savedChartParams.visibleRange);
      hasInitiallyCenteredRef.current = true;
    } else if (totalBars > 0) {
      hasInitiallyCenteredRef.current = true;
      centerChartOnScreen();
      // Ensure executed after layout painting completes
      setTimeout(() => {
        centerChartOnScreen();
      }, 50);
      setTimeout(() => {
        centerChartOnScreen();
      }, 200);
      setTimeout(() => {
        centerChartOnScreen();
      }, 500);
    }

    // Remove existing price lines
    priceLinesRef.current.forEach((pl) => {
      try {
        candleSeriesRef.current?.removePriceLine(pl);
      } catch {
        // Ignored
      }
    });
    priceLinesRef.current = [];

    // Draw custom markers if passed from archive
    if (Array.isArray(customMarkers) && customMarkers.length > 0 && candleSeriesRef.current) {
      customMarkers.forEach((marker) => {
        let style = LineStyle.Solid;
        if (marker.lineStyle === 'dashed') style = LineStyle.Dashed;
        else if (marker.lineStyle === 'dotted') style = LineStyle.Dotted;

        const line = candleSeriesRef.current?.createPriceLine({
          price: marker.price,
          color: marker.color,
          lineWidth: (marker.lineWidth as any) || 2,
          lineStyle: style,
          axisLabelVisible: true,
          title: marker.label ? `${marker.label}` : '',
        });
        if (line) {
          priceLinesRef.current.push(line);
        }
      });
    } else if (formation && candleSeriesRef.current) {
      // Draw formation price levels if available
      if (showEntryLevel && formation.levels.entryPrice) {
        const line = candleSeriesRef.current.createPriceLine({
          price: formation.levels.entryPrice,
          color: '#38bdf8',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'Вхід',
        });
        priceLinesRef.current.push(line);
      }

      if (showTargetLevel && formation.levels.targetPrice) {
        const line = candleSeriesRef.current.createPriceLine({
          price: formation.levels.targetPrice,
          color: '#10b981',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: 'Ціль',
        });
        priceLinesRef.current.push(line);
      }

      if (showStopLevel && formation.levels.stopLossPrice) {
        const line = candleSeriesRef.current.createPriceLine({
          price: formation.levels.stopLossPrice,
          color: '#ef4444',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: 'Стоп',
        });
        priceLinesRef.current.push(line);
      }

      if (
        formation.levels.necklinePrice &&
        Math.abs(formation.levels.necklinePrice - formation.levels.entryPrice) > 0.0001 &&
        Math.abs(formation.levels.necklinePrice - formation.levels.targetPrice) > 0.0001
      ) {
        const line = candleSeriesRef.current.createPriceLine({
          price: formation.levels.necklinePrice,
          color: '#f59e0b',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: '',
        });
        priceLinesRef.current.push(line);
      }

      if (
        formation.levels.resistancePrice &&
        Math.abs(formation.levels.resistancePrice - formation.levels.entryPrice) > 0.0001 &&
        Math.abs(formation.levels.resistancePrice - formation.levels.targetPrice) > 0.0001 &&
        (!formation.levels.necklinePrice || Math.abs(formation.levels.resistancePrice - formation.levels.necklinePrice) > 0.0001)
      ) {
        const line = candleSeriesRef.current.createPriceLine({
          price: formation.levels.resistancePrice,
          color: '#f59e0b',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: '',
        });
        priceLinesRef.current.push(line);
      }

      if (
        formation.levels.supportPrice &&
        Math.abs(formation.levels.supportPrice - formation.levels.stopLossPrice) > 0.0001 &&
        Math.abs(formation.levels.supportPrice - formation.levels.entryPrice) > 0.0001
      ) {
        const line = candleSeriesRef.current.createPriceLine({
          price: formation.levels.supportPrice,
          color: '#a855f7',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: '',
        });
        priceLinesRef.current.push(line);
      }
    }
  }, [klines, formation, customMarkers, showEntryLevel, showTargetLevel, showStopLevel, savedChartParams]);

  // Real-Time Live Stream Connection (WebSocket + Fast REST Poller fallback)
  useEffect(() => {
    let isDisposed = false;
    let ws: WebSocket | null = null;
    let pollInterval: any = null;

    const cleanSymbol = symbol.toUpperCase().replace('/', '').trim();

    // 1. Setup WebSocket
    try {
      if (exchange === 'binance') {
        const interval = toBinanceWsInterval(timeframe);
        const wsUrl =
          marketType === 'futures'
            ? `wss://fstream.binance.com/ws/${cleanSymbol.toLowerCase()}@kline_${interval}`
            : `wss://stream.binance.com:9443/ws/${cleanSymbol.toLowerCase()}@kline_${interval}`;

        ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
          if (isDisposed) return;
          try {
            const data = JSON.parse(event.data);
            if (data.e === 'kline' && data.k) {
              const k = data.k;
              handleLiveTick(
                {
                  time: Math.floor(k.t / 1000),
                  open: parseFloat(k.o),
                  high: parseFloat(k.h),
                  low: parseFloat(k.l),
                  close: parseFloat(k.c),
                  volume: parseFloat(k.v),
                },
                'ws'
              );
            }
          } catch {
            // Ignored
          }
        };

        ws.onopen = () => {
          if (!isDisposed) {
            setIsLiveConnected(true);
            setLiveMode('ws');
          }
        };

        ws.onerror = () => {
          // Handled smoothly by fallback poller
        };
      } else {
        // Bybit
        const wsUrl =
          marketType === 'futures'
            ? 'wss://stream.bybit.com/v5/public/linear'
            : 'wss://stream.bybit.com/v5/public/spot';

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (isDisposed) return;
          setIsLiveConnected(true);
          setLiveMode('ws');
          try {
            const interval = toBybitWsInterval(timeframe);
            ws?.send(
              JSON.stringify({
                op: 'subscribe',
                args: [`kline.${interval}.${cleanSymbol}`],
              })
            );
          } catch {
            // Ignored
          }
        };

        ws.onmessage = (event) => {
          if (isDisposed) return;
          try {
            const data = JSON.parse(event.data);
            if (data.topic && data.topic.startsWith('kline') && Array.isArray(data.data) && data.data[0]) {
              const item = data.data[0];
              handleLiveTick(
                {
                  time: Math.floor(parseInt(item.start, 10) / 1000),
                  open: parseFloat(item.open),
                  high: parseFloat(item.high),
                  low: parseFloat(item.low),
                  close: parseFloat(item.close),
                  volume: parseFloat(item.volume || '0'),
                },
                'ws'
              );
            }
          } catch {
            // Ignored
          }
        };
      }
    } catch {
      // WS setup failed, fallback poller will operate
    }

    // 2. High-Frequency Poller Fallback (ensures live updates in iframes/sandboxes)
    const runFastPoll = async () => {
      if (isDisposed) return;
      // If WebSocket has ticked within the last 4 seconds, skip REST poll to save bandwidth
      if (Date.now() - lastTickTimeRef.current < 4000 && ws && ws.readyState === WebSocket.OPEN) {
        return;
      }

      try {
        const res = await fetch(
          `/api/klines?exchange=${exchange}&market=${marketType}&symbol=${cleanSymbol}&timeframe=${timeframe}&limit=3`
        );
        const json = await res.json();
        if (!isDisposed && json.success && Array.isArray(json.data) && json.data.length > 0) {
          const latest = json.data[json.data.length - 1];
          handleLiveTick(latest, 'rest');
        }
      } catch {
        // Ignored
      }
    };

    pollInterval = setInterval(runFastPoll, 2500);

    return () => {
      isDisposed = true;
      if (pollInterval) clearInterval(pollInterval);
      if (ws) {
        try {
          ws.close();
        } catch {
          // Ignored
        }
      }
    };
  }, [symbol, timeframe, exchange, marketType, handleLiveTick]);

  return (
    <div className={`relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-xl flex flex-col ${fullHeight ? 'h-full flex-1 min-h-0' : ''}`}>
      {/* Top Header Bar */}
      {showNavigationControls && (!hideSymbolAndPrice || !hideHeaderLiveIndicator || (!hideHeaderFormationBadge && !!formation)) && (
        <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 bg-slate-900/95 border-b border-slate-800 text-xs z-10 shrink-0">
          {/* Left: Symbol, Live Price, Badges */}
          <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
            {!hideSymbolAndPrice && (
              <>
                <span className="font-bold text-slate-100 font-mono text-xs sm:text-sm tracking-wide">{symbol}</span>

                {/* Live Price Tag */}
                {currentPrice !== null && (
                  <div
                    className={`flex items-center gap-1 font-mono font-bold px-1.5 sm:px-2 py-0.5 rounded-lg border text-[11px] sm:text-xs transition-all duration-300 ${
                      tickAnimation
                        ? priceDirection === 'up'
                          ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500 scale-105 shadow-sm shadow-emerald-500/20'
                          : 'bg-rose-500/30 text-rose-300 border-rose-500 scale-105 shadow-sm shadow-rose-500/20'
                        : priceDirection === 'up'
                        ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                        : priceDirection === 'down'
                        ? 'bg-rose-950/60 text-rose-400 border-rose-800/60'
                        : 'bg-slate-800 text-slate-200 border-slate-700'
                    }`}
                  >
                    <span>${formatCryptoPrice(currentPrice)}</span>
                    {priceDirection === 'up' ? (
                      <span className="text-[9px] sm:text-[10px] text-emerald-400 font-extrabold">▲</span>
                    ) : priceDirection === 'down' ? (
                      <span className="text-[9px] sm:text-[10px] text-rose-400 font-extrabold">▼</span>
                    ) : null}
                  </div>
                )}
              </>
            )}

            {/* Live Stream Status Indicator */}
            {!hideHeaderLiveIndicator && (
              <div
                className={`flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 rounded-full border text-[10px] sm:text-[11px] font-mono font-medium ${
                  isLiveConnected
                    ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400'
                }`}
                title={`Оновлення в реальному часі (${liveMode.toUpperCase()})`}
              >
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      isLiveConnected ? 'bg-emerald-400' : 'bg-slate-400'
                    }`}
                  ></span>
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      isLiveConnected ? 'bg-emerald-500' : 'bg-slate-500'
                    }`}
                  ></span>
                </span>
                <span className="font-bold tracking-wider">
                  {liveMode === 'ws' ? '⚡' : '●'}
                </span>
              </div>
            )}

            {!hideHeaderFormationBadge && formation && (
              <span
                className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-medium truncate max-w-[130px] sm:max-w-none ${
                  formation.bias === 'bullish'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : formation.bias === 'bearish'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
                title={formation.name}
              >
                {formation.name}
              </span>
            )}
          </div>
        </div>
      )}

      {onTimeframeChange && (
        <div className="flex items-center justify-between gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 bg-slate-900/90 border-b border-slate-800/80 overflow-x-auto no-scrollbar flex-nowrap w-full">
          <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap shrink-0">
            {/* Timeframe selector directly above the chart */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs font-mono shrink-0">
              {(['1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((option) => (
                <button
                  key={option}
                  onClick={() => onTimeframeChange(option)}
                  className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded transition-colors cursor-pointer text-[11px] sm:text-xs shrink-0 ${
                    timeframe === option ? 'bg-cyan-600 text-white font-bold shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            {/* Formation levels toggle badges */}
            {formation && (
              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px] sm:text-[11px] shrink-0">
                {[
                  { key: 'entry', label: 'Вхід', enabled: showEntryLevel, activeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
                  { key: 'target', label: 'Ціль', enabled: showTargetLevel, activeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
                  { key: 'stop', label: 'Стоп', enabled: showStopLevel, activeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      if (item.key === 'entry') setShowEntryLevel((value) => !value);
                      if (item.key === 'target') setShowTargetLevel((value) => !value);
                      if (item.key === 'stop') setShowStopLevel((value) => !value);
                    }}
                    className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md border transition-colors cursor-pointer shrink-0 ${
                      item.enabled ? item.activeClass : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                    title={`${item.enabled ? 'Вимкнути' : 'Увімкнути'} мітку ${item.label}`}
                    aria-label={`${item.enabled ? 'Вимкнути' : 'Увімкнути'} мітку ${item.label}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: View Controls */}
          <div className="flex items-center gap-1 sm:gap-1.5 text-slate-300 text-[10px] sm:text-[11px] flex-nowrap shrink-0 ml-auto">
            {/* Zoom Recent Buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleZoomRecent}
                className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 text-[10px] sm:text-[11px] cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
                title="Наблизити до останніх свічок"
              >
                <ZoomIn className="w-3 h-3 text-cyan-400" />
                <span className="hidden md:inline">Останні свічки</span>
              </button>

              <button
                onClick={handleFitAll}
                className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 text-[10px] sm:text-[11px] cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
                title="Вписати всю завантажену історію свічок"
              >
                <Maximize2 className="w-3 h-3 text-cyan-400" />
                <span className="hidden md:inline">Вся історія</span>
                <span className="font-mono text-[9px] sm:text-[10px] text-slate-400">({klines.length})</span>
              </button>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onAddToArchive && (
                <button
                  type="button"
                  onClick={onAddToArchive}
                  disabled={isSavingArchive}
                  className="p-1 sm:p-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                  title={isArchived ? 'Формацію збережено в архіві' : 'Додати монету та формацію в архів'}
                  aria-label={isArchived ? 'Формацію збережено в архіві' : 'Додати монету та формацію в архів'}
                >
                  {isArchived ? <CheckCircle2 className="w-3.5 h-3.5" /> : <FolderArchive className={`w-3.5 h-3.5 ${isSavingArchive ? 'animate-pulse' : ''}`} />}
                </button>
              )}
              {onOpenFullscreen && (
                <button
                  type="button"
                  onClick={onOpenFullscreen}
                  className="p-1 sm:p-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 transition-colors cursor-pointer shrink-0"
                  title="Відкрити повний графік"
                  aria-label="Відкрити повний графік"
                >
                  <Expand className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Levels Sub-header when formation present */}
      {showNavigationControls && formation && (
        <div className="flex items-center justify-between gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 bg-slate-900/60 border-b border-slate-800/80 text-[10px] sm:text-[11px] font-mono overflow-x-auto no-scrollbar flex-nowrap w-full">
          <div className="flex items-center gap-2 sm:gap-4 flex-nowrap shrink-0">
            <span className="flex items-center gap-1 text-sky-300 font-medium shrink-0">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-sky-400"></span> Вхід: ${formatCryptoPrice(formation.levels.entryPrice)}
            </span>
            <span className="flex items-center gap-1 text-emerald-400 font-bold shrink-0">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500"></span> Ціль: ${formatCryptoPrice(formation.levels.targetPrice)} (+{Math.abs(formation.potentialProfitPct)}%)
            </span>
            <span className="flex items-center gap-1 text-rose-400 font-bold shrink-0">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-rose-500"></span> Стоп: ${formatCryptoPrice(formation.levels.stopLossPrice)} (-{Math.abs(formation.potentialRiskPct)}%)
            </span>
          </div>
          <div className="text-slate-400 font-medium text-[10px] sm:text-[11px] shrink-0 whitespace-nowrap ml-auto">
            R:R <span className="text-cyan-400 font-bold">1:{formation.riskRewardRatio}</span>
          </div>
        </div>
      )}

      {/* Chart Canvas with Bottom-Right Bar Close Countdown */}
      <div className={`relative w-full overflow-hidden ${fullHeight ? "flex-1 min-h-0" : "h-[220px] xs:h-[260px] sm:h-[300px] md:h-[350px] lg:h-[390px] xl:h-[430px]"}`}>
        <div
          ref={chartContainerRef}
          className="w-full h-full relative"
        />

        {/* Right-Bottom: Time to Bar Close Countdown with Ticking */}
        <div
          className={`absolute right-14 sm:right-16 bottom-7 sm:bottom-8 z-20 flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono font-bold select-none transition-all duration-300 backdrop-blur-md shadow-lg ${
            barCountdown.isUrgent
              ? `bg-rose-950/90 text-rose-300 border border-rose-500 shadow-rose-950/50 ${
                  tickPulse ? 'scale-105 opacity-100 border-rose-400 shadow-rose-500/40' : 'scale-100 opacity-90'
                }`
              : 'bg-slate-950/85 text-slate-200 border border-slate-800/90 hover:border-slate-700'
          }`}
          title={`Час до закриття поточної ${timeframe} свічки: ${barCountdown.formatted}`}
        >
          <Clock
            className={`w-3.5 h-3.5 ${
              barCountdown.isUrgent
                ? 'text-rose-400 animate-spin'
                : 'text-cyan-400'
            }`}
            style={{ animationDuration: barCountdown.isUrgent ? '3s' : '10s' }}
          />

          <span className="text-[10px] font-sans text-slate-400 uppercase tracking-tight">
           
          </span>

          <span
            className={`tracking-wider ${
              barCountdown.isUrgent
                ? 'text-rose-300 font-extrabold text-[12px]'
                : 'text-white'
            }`}
          >
            {barCountdown.formatted}
          </span>

          {barCountdown.isUrgent && (
            <span className="relative flex h-2 w-2 ml-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

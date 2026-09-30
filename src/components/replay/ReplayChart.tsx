import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  Time,
  LineStyle,
  IPriceLine,
  CrosshairMode,
} from 'lightweight-charts';
import { Kline, Timeframe, ExchangeId, MarketType, ReplayPosition, ReplayPendingOrder } from '../../types';
import { getChartPriceFormat, formatCryptoPrice } from '../../utils/formatters';
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Camera, MoveVertical, GripHorizontal } from 'lucide-react';

export interface ReplayChartHandle {
  takeScreenshot: () => string | null;
  fitContent: () => void;
  zoomToLatest: () => void;
}

interface ReplayChartProps {
  visibleCandles: Kline[];
  symbol: string;
  timeframe: Timeframe;
  exchange: ExchangeId;
  marketType: MarketType;
  position: ReplayPosition | null;
  pendingOrders: ReplayPendingOrder[];
  isReplaying: boolean;
  focusTrigger?: number;
  height?: number;
  onHeightChange?: (height: number) => void;
  onTakeScreenshotNotification?: () => void;
}

export const ReplayChart = forwardRef<ReplayChartHandle, ReplayChartProps>(({
  visibleCandles,
  symbol,
  timeframe,
  exchange,
  marketType,
  position,
  pendingOrders,
  isReplaying,
  focusTrigger = 0,
  height,
  onHeightChange,
  onTakeScreenshotNotification,
}, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Height state
  const [internalHeight, setInternalHeight] = useState<number>(() => height || 640);
  const activeHeight = height !== undefined ? height : internalHeight;

  // Dragging logic for bottom resize handle
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const handleMouseDownResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = activeHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaY = moveEvent.clientY - startYRef.current;
      const newHeight = Math.max(380, Math.min(1300, Math.round(startHeightRef.current + deltaY)));
      setInternalHeight(newHeight);
      onHeightChange?.(newHeight);
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.resize(chartContainerRef.current.clientWidth, newHeight - 56);
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [activeHeight, onHeightChange]);

  // Price lines refs
  const entryLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);
  const liqLineRef = useRef<IPriceLine | null>(null);
  const pendingLinesRef = useRef<IPriceLine[]>([]);

  // Hovered or active candle state for tooltip
  const [activeCandle, setActiveCandle] = useState<Kline | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFocusedBadge, setIsFocusedBadge] = useState(false);

  // Helper to center/focus on candles with optimal spacing
  const focusOnCandles = useCallback((scrollIntoView = false) => {
    if (!chartRef.current || visibleCandles.length === 0) return;
    const total = visibleCandles.length;
    const visibleBars = Math.min(65, total);

    // Set visible logical range focused on recent cutoff candles + 16 bars of forward breathing room
    chartRef.current.timeScale().setVisibleLogicalRange({
      from: Math.max(0, total - visibleBars),
      to: total + 16,
    });

    if (scrollIntoView && chartContainerRef.current) {
      chartContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Flash a brief focus confirmation badge
    setIsFocusedBadge(true);
    setTimeout(() => setIsFocusedBadge(false), 2400);
  }, [visibleCandles.length]);

  // Capture canvas screenshot
  const captureScreenshot = useCallback((): string | null => {
    try {
      if (chartRef.current) {
        // Lightweight-charts native screenshot
        const screenshotCanvas = chartRef.current.takeScreenshot();
        if (screenshotCanvas) {
          return screenshotCanvas.toDataURL('image/png');
        }
      }
      if (chartContainerRef.current) {
        const canvas = chartContainerRef.current.querySelector('canvas');
        if (canvas) {
          return canvas.toDataURL('image/png');
        }
      }
    } catch (e) {
      console.warn('Failed to capture screenshot:', e);
    }
    return null;
  }, []);

  useImperativeHandle(ref, () => ({
    takeScreenshot: captureScreenshot,
    fitContent: () => {
      chartRef.current?.timeScale().fitContent();
    },
    zoomToLatest: () => {
      if (chartRef.current && visibleCandles.length > 0) {
        const total = visibleCandles.length;
        const visible = Math.min(80, total);
        chartRef.current.timeScale().setVisibleLogicalRange({
          from: total - visible,
          to: total + 4,
        });
      }
    },
  }), [captureScreenshot, visibleCandles.length]);

  // Set latest candle as active candle when visible candles change
  useEffect(() => {
    if (visibleCandles.length > 0) {
      const latest = visibleCandles[visibleCandles.length - 1];
      setActiveCandle(latest);
    }
  }, [visibleCandles]);

  // Initialize Lightweight Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    chartContainerRef.current.innerHTML = '';

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#090d16' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace, -apple-system, BlinkMacSystemFont',
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.45)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(30, 41, 59, 0.45)', style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#38bdf8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0284c7',
        },
        horzLine: {
          color: '#38bdf8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0284c7',
        },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: {
          top: 0.08,
          bottom: 0.18,
        },
        autoScale: true,
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 8,
        minBarSpacing: 3,
        rightOffset: 8,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    });

    // Remove watermark/logo if any
    const logo = chartContainerRef.current.querySelector('#tv-attr-logo');
    if (logo) logo.remove();

    const samplePrice = visibleCandles[visibleCandles.length - 1]?.close || 100;
    const priceFormat = getChartPriceFormat(samplePrice);

    // Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      priceFormat,
    });

    // Volume Histogram Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '', // overlay
    });
    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Crosshair move handler to update candle info display
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        if (visibleCandles.length > 0) {
          setActiveCandle(visibleCandles[visibleCandles.length - 1]);
        }
        return;
      }
      const data = param.seriesData.get(candleSeries) as any;
      if (data && data.open !== undefined) {
        setActiveCandle({
          time: Number(param.time),
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: 0,
        });
      }
    });

    // Handle responsive resize
    let resizeTimer: any;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (chartRef.current && chartContainerRef.current) {
          const w = chartContainerRef.current.clientWidth;
          const h = chartContainerRef.current.clientHeight;
          if (w > 0 && h > 0) {
            chartRef.current.resize(w, h);
          }
        }
      }, 50);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(resizeTimer);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Update data when visibleCandles change
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    if (visibleCandles.length === 0) return;

    const candleData = visibleCandles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData = visibleCandles.map((c) => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)',
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
  }, [visibleCandles]);

  const focusOnCandlesRef = useRef(focusOnCandles);
  useEffect(() => {
    focusOnCandlesRef.current = focusOnCandles;
  }, [focusOnCandles]);

  // Auto-focus on candles whenever a new date/coin is loaded (focusTrigger increments)
  useEffect(() => {
    if (visibleCandles.length === 0) return;
    const timer = setTimeout(() => {
      focusOnCandlesRef.current(true);
    }, 80);
    return () => clearTimeout(timer);
  }, [focusTrigger]);

  // Replay playback auto-follow: ensure newly stepped-in candles stay comfortably inside visible range
  useEffect(() => {
    if (!chartRef.current || visibleCandles.length === 0) return;
    const total = visibleCandles.length;
    const timeScale = chartRef.current.timeScale();
    const logicalRange = timeScale.getVisibleLogicalRange();

    if (logicalRange) {
      // If candle moves past the visible right edge or within 4 bars of it, scroll forward smoothly
      if (total >= logicalRange.to - 4) {
        const barSpan = Math.max(30, logicalRange.to - logicalRange.from);
        timeScale.setVisibleLogicalRange({
          from: total - Math.round(barSpan * 0.75),
          to: total + Math.round(barSpan * 0.25),
        });
      }
    }
  }, [visibleCandles.length]);

  // Update Position Price Lines (Entry, SL, TP, Liquidation)
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    // Clean up old lines
    if (entryLineRef.current) {
      candleSeriesRef.current.removePriceLine(entryLineRef.current);
      entryLineRef.current = null;
    }
    if (slLineRef.current) {
      candleSeriesRef.current.removePriceLine(slLineRef.current);
      slLineRef.current = null;
    }
    if (tpLineRef.current) {
      candleSeriesRef.current.removePriceLine(tpLineRef.current);
      tpLineRef.current = null;
    }
    if (liqLineRef.current) {
      candleSeriesRef.current.removePriceLine(liqLineRef.current);
      liqLineRef.current = null;
    }

    if (position) {
      // Entry Line
      entryLineRef.current = candleSeriesRef.current.createPriceLine({
        price: position.entryPrice,
        color: position.side === 'long' ? '#10b981' : '#f43f5e',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `Вхід ${position.side.toUpperCase()}: ${formatCryptoPrice(position.entryPrice)}`,
      });

      // SL Line
      if (position.slPrice && position.slPrice > 0) {
        slLineRef.current = candleSeriesRef.current.createPriceLine({
          price: position.slPrice,
          color: '#ef4444',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Stop-Loss: ${formatCryptoPrice(position.slPrice)}`,
        });
      }

      // TP Line
      if (position.tpPrice && position.tpPrice > 0) {
        tpLineRef.current = candleSeriesRef.current.createPriceLine({
          price: position.tpPrice,
          color: '#10b981',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Take-Profit: ${formatCryptoPrice(position.tpPrice)}`,
        });
      }

      // Liquidation Line
      if (position.liquidationPrice && position.liquidationPrice > 0) {
        liqLineRef.current = candleSeriesRef.current.createPriceLine({
          price: position.liquidationPrice,
          color: '#a855f7',
          lineWidth: 1,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: true,
          title: `Ліквідація: ${formatCryptoPrice(position.liquidationPrice)}`,
        });
      }
    }
  }, [position]);

  // Update Pending Orders Lines
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    // Remove existing pending lines
    for (const line of pendingLinesRef.current) {
      candleSeriesRef.current.removePriceLine(line);
    }
    pendingLinesRef.current = [];

    // Add new lines for pending limit / stop orders
    for (const order of pendingOrders) {
      const line = candleSeriesRef.current.createPriceLine({
        price: order.price,
        color: '#f59e0b',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `${order.orderType.toUpperCase()} ${order.side.toUpperCase()}: ${formatCryptoPrice(order.price)}`,
      });
      pendingLinesRef.current.push(line);
    }
  }, [pendingOrders]);

  const latestCandle = visibleCandles[visibleCandles.length - 1] || null;
  const displayCandle = activeCandle || latestCandle;
  const candleChangePct =
    displayCandle && displayCandle.open > 0
      ? ((displayCandle.close - displayCandle.open) / displayCandle.open) * 100
      : 0;

  const formattedDate = displayCandle
    ? new Date(displayCandle.time * 1000).toLocaleString('uk-UA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }) + ' UTC'
    : '—';

  return (
    <div
      style={!isFullscreen ? { height: `${activeHeight}px` } : undefined}
      className={`relative flex flex-col bg-[#090d16] border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'w-full'
      }`}
    >
      {/* Chart Top Header Overlay */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-950/70 border-b border-slate-800/60 backdrop-blur-md z-10 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 font-mono">
            <span className="font-extrabold text-white text-sm sm:text-base">{symbol}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {timeframe}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
              {exchange} {marketType}
            </span>
            {isReplaying && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-950/70 border border-amber-500/50 text-amber-300 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Replay Mode
              </span>
            )}
            {isFocusedBadge && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-in fade-in duration-150">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                🎯 Автофокус на свічках
              </span>
            )}
          </div>

          {/* Candle OHLC stats */}
          {displayCandle && (
            <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-slate-400">
              <span>
                O: <b className="text-slate-200">{formatCryptoPrice(displayCandle.open)}</b>
              </span>
              <span>
                H: <b className="text-emerald-400">{formatCryptoPrice(displayCandle.high)}</b>
              </span>
              <span>
                L: <b className="text-rose-400">{formatCryptoPrice(displayCandle.low)}</b>
              </span>
              <span>
                C: <b className={candleChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {formatCryptoPrice(displayCandle.close)}
                </b>
              </span>
              <span
                className={`font-semibold ${
                  candleChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                ({candleChangePct >= 0 ? '+' : ''}
                {candleChangePct.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-1.5">
          <div className="text-[11px] font-mono text-cyan-300/80 mr-1 flex items-center gap-1 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
            <span>📅 {formattedDate}</span>
          </div>

          {/* Quick Height presets */}
          <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-mono mr-1">
            <span className="px-1 text-slate-500 font-sans font-bold flex items-center gap-0.5" title="Швидка зміна висоти блоку графіка">
              <MoveVertical className="w-2.5 h-2.5" />
            </span>
            {[
              { label: 'S', h: 480 },
              { label: 'M', h: 640 },
              { label: 'L', h: 800 },
              { label: 'XL', h: 960 },
            ].map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  setInternalHeight(preset.h);
                  onHeightChange?.(preset.h);
                }}
                className={`px-1.5 py-0.5 rounded font-bold transition-all cursor-pointer ${
                  Math.abs(activeHeight - preset.h) < 30
                    ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title={`Висота ${preset.h}px`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              const img = captureScreenshot();
              if (img) {
                const link = document.createElement('a');
                link.download = `replay_${symbol}_${timeframe}_${displayCandle?.time || Date.now()}.png`;
                link.href = img;
                link.click();
                onTakeScreenshotNotification?.();
              }
            }}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
            title="Завантажити скриншот графіка (PNG)"
          >
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
          </button>

          <button
            onClick={() => chartRef.current?.timeScale().fitContent()}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
            title="Масштабувати графік (Fit Content)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
            title={isFullscreen ? 'Вийти з повного екрана' : 'Повний екран'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Chart Canvas Container */}
      <div ref={chartContainerRef} className="flex-1 w-full relative select-none" />

      {/* Watermark in Replay */}
      <div className="absolute bottom-7 left-4 pointer-events-none opacity-20 font-mono text-xs text-slate-400">
        SignalHook Replay Engine • Future bars hidden
      </div>

      {/* Bottom Drag Resize Handle */}
      {!isFullscreen && (
        <div
          onMouseDown={handleMouseDownResize}
          className="group w-full h-4 bg-slate-950/95 border-t border-slate-800/80 hover:bg-slate-900 cursor-row-resize flex items-center justify-center transition-colors select-none relative z-10 shrink-0"
          title="Потягніть для зміни висоти графіка (вгору / вниз)"
        >
          <div className="flex items-center gap-2 text-[10px] text-slate-500 group-hover:text-amber-400 font-mono transition-colors">
            <div className="w-10 h-1 rounded-full bg-slate-700 group-hover:bg-amber-400 transition-colors" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-amber-300">
              Висота: {activeHeight}px (потягніть)
            </span>
            <div className="w-10 h-1 rounded-full bg-slate-700 group-hover:bg-amber-400 transition-colors" />
          </div>
        </div>
      )}
    </div>
  );
});

ReplayChart.displayName = 'ReplayChart';

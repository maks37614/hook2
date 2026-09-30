import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ScannedCoin,
  Timeframe,
  ExchangeId,
  MarketType,
  Kline,
  ReplayPosition,
  ReplayPendingOrder,
  ReplayTradeJournalItem,
  ReplaySimulationSettings,
} from '../types';
import { ReplayChart, ReplayChartHandle } from './replay/ReplayChart';
import { ReplayToolbar } from './replay/ReplayToolbar';
import { ReplaySimulatorPanel } from './replay/ReplaySimulatorPanel';
import { ReplayJournal } from './replay/ReplayJournal';
import {
  fetchHistoricalReplayCandles,
  generateRandomHistoricalDate,
  calculateExecutionPrice,
  calculateLiquidationPrice,
  calculateUnrealizedPnl,
  checkPositionTriggers,
  checkOrderFill,
  loadReplayJournal,
  saveReplayJournal,
  loadReplaySettings,
  saveReplaySettings,
  DEFAULT_SIMULATION_SETTINGS,
} from '../utils/replayService';
import {
  History,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Info,
  X,
  Volume2,
  GripVertical,
  MoveHorizontal,
  MoveVertical,
} from 'lucide-react';
import { TOP_POPULAR_PAIRS, fetchDirectBinanceTickers, fetchDirectBybitTickers } from '../utils/directExchangeClient';

interface ReplayPageProps {
  coins: ScannedCoin[];
  onNavigateToScreener?: () => void;
}

export const ReplayPage: React.FC<ReplayPageProps> = ({ coins }) => {
  // Chart Handle for taking screenshots
  const chartRef = useRef<ReplayChartHandle>(null);

  // Active Coin & Market Selection
  const [symbol, setSymbol] = useState<string>('BTCUSDT');
  const [exchange, setExchange] = useState<ExchangeId>('binance');
  const [marketType, setMarketType] = useState<MarketType>('futures');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');

  // Replay Candlestick State
  const [allCandles, setAllCandles] = useState<Kline[]>([]);
  const [cutoffIndex, setCutoffIndex] = useState<number>(0);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isLoadingCandles, setIsLoadingCandles] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [focusTrigger, setFocusTrigger] = useState<number>(0);

  // Chart dimensions & layout state
  const [chartHeight, setChartHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('signalhook_replay_chart_height');
      return saved ? Math.max(380, Math.min(1300, parseInt(saved, 10))) : 640;
    } catch {
      return 640;
    }
  });

  const [chartWidthPercent, setChartWidthPercent] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('signalhook_replay_chart_width_pct');
      return saved ? Math.max(50, Math.min(88, parseInt(saved, 10))) : 75;
    } catch {
      return 75;
    }
  });

  const handleChartHeightChange = useCallback((newH: number) => {
    setChartHeight(newH);
    try {
      localStorage.setItem('signalhook_replay_chart_height', newH.toString());
    } catch {}
  }, []);

  const handleChartWidthChange = useCallback((newPct: number) => {
    setChartWidthPercent(newPct);
    try {
      localStorage.setItem('signalhook_replay_chart_width_pct', newPct.toString());
    } catch {}
  }, []);

  // Splitter dragging logic for horizontal resizing between chart and simulator
  const workspaceContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplitterRef = useRef(false);

  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSplitterRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingSplitterRef.current || !workspaceContainerRef.current) return;
      const rect = workspaceContainerRef.current.getBoundingClientRect();
      const relativeX = moveEvent.clientX - rect.left;
      const newPct = Math.max(50, Math.min(88, Math.round((relativeX / rect.width) * 100)));
      setChartWidthPercent(newPct);
    };

    const handleMouseUp = () => {
      isDraggingSplitterRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setChartWidthPercent((latest) => {
        try {
          localStorage.setItem('signalhook_replay_chart_width_pct', latest.toString());
        } catch {}
        return latest;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, []);

  // Playback Control
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0); // 1x = 600ms per bar
  const playbackTimerRef = useRef<any>(null);

  // Trading Simulator State
  const [settings, setSettings] = useState<ReplaySimulationSettings>(() => loadReplaySettings());
  const [position, setPosition] = useState<ReplayPosition | null>(null);
  const [pendingOrders, setPendingOrders] = useState<ReplayPendingOrder[]>([]);
  const [journalItems, setJournalItems] = useState<ReplayTradeJournalItem[]>(() => loadReplayJournal());

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'danger' | 'info';
    title: string;
    description: string;
  } | null>(null);

  // Quick sound generator using Web Audio API
  const playSound = useCallback((type: 'order' | 'tp' | 'sl' | 'liq') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      if (type === 'tp' || type === 'order') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.15); // G5
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(349.23, audioCtx.currentTime); // F4
        osc.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime + 0.2); // A3
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      }

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch {
      // Audio not permitted yet
    }
  }, []);

  const showToast = useCallback(
    (type: 'success' | 'danger' | 'info', title: string, description: string) => {
      setToastMessage({ type, title, description });
      setTimeout(() => setToastMessage(null), 4500);
    },
    []
  );

  // Complete crypto market coins with volume from $100k to $10B
  const [allMarketCoins, setAllMarketCoins] = useState<ScannedCoin[]>([]);

  useEffect(() => {
    let isCancelled = false;
    async function loadAllMarketCoins() {
      try {
        const res = await fetch('/api/screener/coins?minVolume=100000&maxVolume=10000000000');
        if (res.ok) {
          const json = await res.json();
          if (!isCancelled && json.success && Array.isArray(json.data) && json.data.length > 0) {
            const mapped: ScannedCoin[] = json.data.map((c: any) => ({
              symbol: c.symbol,
              baseAsset: c.baseAsset,
              quoteAsset: c.quoteAsset || 'USDT',
              exchange: c.exchange,
              marketType: c.marketType,
              price: c.price,
              currentPrice: c.price,
              priceChange24h: c.change24h || 0,
              volume24hUsd: c.volumeUsd || 0,
              high24h: c.high24h || c.price,
              low24h: c.low24h || c.price,
              highPrice24h: c.high24h || c.price,
              lowPrice24h: c.low24h || c.price,
              timeframe: '1h' as Timeframe,
              formations: [],
              hasFormations: false,
              exchangeUrl: c.exchangeUrl || `https://www.binance.com/en/futures/${c.symbol}`,
              lastUpdated: Date.now(),
            }));
            setAllMarketCoins(mapped);
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to load market coins from server, falling back to direct tickers:', e);
      }

      // Fallback: direct Binance & Bybit tickers
      try {
        const [binanceTickers, bybitTickers] = await Promise.all([
          fetchDirectBinanceTickers(),
          fetchDirectBybitTickers(),
        ]);
        const combined = [...binanceTickers, ...bybitTickers];
        if (!isCancelled && combined.length > 0) {
          const mapped: ScannedCoin[] = combined
            .filter((c) => c.volumeUsd >= 100_000 && c.volumeUsd <= 10_000_000_000)
            .map((c) => ({
              symbol: c.symbol,
              baseAsset: c.baseAsset,
              quoteAsset: c.quoteAsset || 'USDT',
              exchange: c.exchange,
              marketType: c.marketType,
              price: c.price,
              currentPrice: c.price,
              priceChange24h: c.change24h || 0,
              volume24hUsd: c.volumeUsd || 0,
              high24h: c.high24h || c.price,
              low24h: c.low24h || c.price,
              highPrice24h: c.high24h || c.price,
              lowPrice24h: c.low24h || c.price,
              timeframe: '1h' as Timeframe,
              formations: [],
              hasFormations: false,
              exchangeUrl: c.exchangeUrl || `https://www.binance.com/en/futures/${c.symbol}`,
              lastUpdated: Date.now(),
            }));
          setAllMarketCoins(mapped);
        }
      } catch (e) {
        console.warn('Direct tickers fallback failed:', e);
      }
    }

    loadAllMarketCoins();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Save journal whenever it changes
  useEffect(() => {
    saveReplayJournal(journalItems);
  }, [journalItems]);

  // Save settings whenever they change
  useEffect(() => {
    saveReplaySettings(settings);
  }, [settings]);

  // Filter all coins with 24h volume between $100k and $10B
  const qualifiedCoins = useMemo(() => {
    if (allMarketCoins.length > 0) {
      return allMarketCoins;
    }
    const list = coins.filter((c) => {
      const vol = c.volume24hUsd || 0;
      return vol >= 100_000 && vol <= 10_000_000_000;
    });
    if (list.length > 0) return list;
    // Fallback popular pairs if coins not yet loaded
    return TOP_POPULAR_PAIRS.map((p) => ({
      symbol: p.symbol,
      baseAsset: p.baseAsset,
      quoteAsset: 'USDT',
      exchange: 'binance' as ExchangeId,
      marketType: 'futures' as MarketType,
      price: 0,
      currentPrice: 0,
      priceChange24h: 0,
      volume24hUsd: 5_000_000,
      high24h: 0,
      low24h: 0,
      highPrice24h: 0,
      lowPrice24h: 0,
      timeframe: '1h' as Timeframe,
      formations: [],
      hasFormations: false,
      exchangeUrl: `https://www.binance.com/en/futures/${p.symbol}`,
      lastUpdated: Date.now(),
    }));
  }, [allMarketCoins, coins]);

  // Load Historical Candles for a Target Date
  const loadHistoryForDate = useCallback(
    async (targetDate: Date, sym = symbol, ex = exchange, mkt = marketType, tf = timeframe) => {
      setIsLoadingCandles(true);
      setLoadError(null);
      setIsPlaying(false);

      try {
        const { allCandles: fetchedCandles, cutoffIndex: idx } = await fetchHistoricalReplayCandles(
          ex,
          mkt,
          sym,
          tf,
          targetDate.getTime(),
          280,
          350
        );

        if (fetchedCandles.length < 10) {
          throw new Error(
            `Не вдалося отримати історичні свічки для ${sym} на дату ${targetDate.toLocaleDateString()}. Спробуйте іншу дату або монету.`
          );
        }

        setAllCandles(fetchedCandles);
        setCutoffIndex(idx);
        setCurrentIndex(idx);
        setFocusTrigger((prev) => prev + 1);

        showToast(
          'info',
          'Bar Replay готовий',
          `Завантажено ${fetchedCandles.length} свічок. Автофокус на даті ${targetDate.toLocaleDateString()} (наступні свічки приховані).`
        );
      } catch (err: any) {
        console.error('Failed to load replay history:', err);
        setLoadError(err.message || 'Помилка завантаження історичних даних.');
      } finally {
        setIsLoadingCandles(false);
      }
    },
    [symbol, exchange, marketType, timeframe, showToast]
  );

  // Initial Load on mount: generate random historical date or 60 days ago
  useEffect(() => {
    const initialDate = generateRandomHistoricalDate();
    loadHistoryForDate(initialDate, symbol, exchange, marketType, timeframe);
  }, []);

  // Visible Candles strictly up to currentIndex (future candles hidden!)
  const visibleCandles = useMemo(() => {
    if (allCandles.length === 0) return [];
    return allCandles.slice(0, currentIndex + 1);
  }, [allCandles, currentIndex]);

  const currentCandle = visibleCandles[visibleCandles.length - 1] || null;
  const currentPrice = currentCandle ? currentCandle.close : 0;

  // Step Forward +1 Candle Logic
  const handleStepForward = useCallback(() => {
    if (currentIndex >= allCandles.length - 1) {
      setIsPlaying(false);
      showToast('info', 'Кінець історії', 'Досягнуто останню доступну свічку у вікні Replay.');
      return;
    }

    const nextIndex = currentIndex + 1;
    const nextCandle = allCandles[nextIndex];
    setCurrentIndex(nextIndex);

    // 1. Check Pending Orders (Limit / Stop)
    setPendingOrders((prevOrders) => {
      const remaining: ReplayPendingOrder[] = [];
      for (const order of prevOrders) {
        const isFilled = checkOrderFill(order, nextCandle);
        if (isFilled) {
          // Fill order into active position
          const fillPrice = order.price;
          const screenshot = chartRef.current?.takeScreenshot() || undefined;

          // Check if an existing position exists
          setPosition((prevPos) => {
            if (prevPos) {
              // For simplicity, close or ignore if already in position
              return prevPos;
            }
            const posSide = order.side === 'buy' ? 'long' : 'short';
            const margin = order.sizeUsd / order.leverage;
            const liqPrice = calculateLiquidationPrice(fillPrice, posSide, order.leverage);

            showToast(
              'success',
              `Відкладений ${order.orderType.toUpperCase()} виконано`,
              `${order.side.toUpperCase()} ${order.symbol} за ціною $${fillPrice.toFixed(2)}`
            );
            playSound('order');

            return {
              id: 'pos_' + Date.now(),
              symbol: order.symbol,
              side: posSide,
              entryPrice: fillPrice,
              currentPrice: fillPrice,
              sizeUsd: order.sizeUsd,
              marginUsd: margin,
              quantity: order.sizeUsd / fillPrice,
              leverage: order.leverage,
              slPrice: order.slPrice,
              tpPrice: order.tpPrice,
              entryTime: nextCandle.time,
              unrealizedPnlUsd: 0,
              unrealizedPnlPct: 0,
              liquidationPrice: liqPrice,
              tag: order.tag,
              entryScreenshot: screenshot,
            };
          });
        } else {
          remaining.push(order);
        }
      }
      return remaining;
    });

    // 2. Check Open Position (SL, TP, Liquidation)
    setPosition((prevPos) => {
      if (!prevPos) return null;

      // Update current price & unrealized P&L
      const { pnlUsd, pnlPct } = calculateUnrealizedPnl(prevPos, nextCandle.close);
      const updatedPos: ReplayPosition = {
        ...prevPos,
        currentPrice: nextCandle.close,
        unrealizedPnlUsd: pnlUsd,
        unrealizedPnlPct: pnlPct,
      };

      // Check triggers on this new candle's High & Low
      const trigger = checkPositionTriggers(prevPos, nextCandle);
      if (trigger) {
        // Position closed by SL, TP, or Liquidation!
        const exitPrice = trigger.exitPrice;
        let finalPnlUsd = 0;
        if (prevPos.side === 'long') {
          finalPnlUsd = ((exitPrice - prevPos.entryPrice) / prevPos.entryPrice) * prevPos.sizeUsd;
        } else {
          finalPnlUsd = ((prevPos.entryPrice - exitPrice) / prevPos.entryPrice) * prevPos.sizeUsd;
        }

        const comm = (prevPos.sizeUsd * settings.commissionPct) / 100;
        const netPnlUsd = finalPnlUsd - comm;
        const finalPnlPct = (netPnlUsd / prevPos.marginUsd) * 100;

        const screenshot = chartRef.current?.takeScreenshot() || prevPos.entryScreenshot;

        const journalRecord: ReplayTradeJournalItem = {
          id: 'trade_' + Date.now(),
          symbol: prevPos.symbol,
          exchange,
          marketType,
          timeframe,
          side: prevPos.side,
          entryPrice: prevPos.entryPrice,
          exitPrice,
          entryTime: prevPos.entryTime,
          exitTime: nextCandle.time,
          sizeUsd: prevPos.sizeUsd,
          marginUsd: prevPos.marginUsd,
          leverage: prevPos.leverage,
          slPrice: prevPos.slPrice,
          tpPrice: prevPos.tpPrice,
          pnlUsd: netPnlUsd,
          pnlPct: finalPnlPct,
          commissionUsd: comm,
          tag: prevPos.tag || 'Replay Trade',
          screenshotUrl: screenshot,
          exitReason: trigger.reason,
        };

        setJournalItems((items) => [journalRecord, ...items]);

        // Update balance
        setSettings((prevSet) => ({
          ...prevSet,
          balance: Math.max(0, prevSet.balance + netPnlUsd),
        }));

        if (trigger.reason === 'tp') {
          showToast(
            'success',
            'Take-Profit спрацював! 🎯',
            `Позицію закрито з профітом +$${netPnlUsd.toFixed(2)} (+${finalPnlPct.toFixed(2)}%)`
          );
          playSound('tp');
        } else if (trigger.reason === 'sl') {
          showToast(
            'danger',
            'Stop-Loss спрацював! 🛑',
            `Позицію закрито зі збитком -$${Math.abs(netPnlUsd).toFixed(2)} (${finalPnlPct.toFixed(2)}%)`
          );
          playSound('sl');
        } else if (trigger.reason === 'liquidation') {
          showToast(
            'danger',
            'Позицію ліквідовано! 💥',
            `Ціна досягла рівня ліквідації $${exitPrice.toFixed(2)}`
          );
          playSound('liq');
        }

        return null; // Position is now closed
      }

      return updatedPos;
    });
  }, [
    currentIndex,
    allCandles,
    settings.commissionPct,
    exchange,
    marketType,
    timeframe,
    showToast,
    playSound,
  ]);

  const handleStepForwardRef = useRef(handleStepForward);
  useEffect(() => {
    handleStepForwardRef.current = handleStepForward;
  }, [handleStepForward]);

  // Auto-play Timer Loop
  useEffect(() => {
    if (!isPlaying) {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      return;
    }

    const intervalMs = Math.max(80, Math.round(600 / playbackSpeed));
    playbackTimerRef.current = setInterval(() => {
      handleStepForwardRef.current();
    }, intervalMs);

    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed]);

  // Global Keyboard Shortcuts (Space: Play/Pause, Right Arrow: Step +1)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleStepForward();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleStepForward]);

  // Execute Market Order
  const handleExecuteMarketOrder = useCallback(
    (params: {
      side: 'long' | 'short';
      sizeUsd: number;
      leverage: number;
      slPrice?: number;
      tpPrice?: number;
      tag: string;
      notes?: string;
    }) => {
      if (currentPrice <= 0) return;

      if (position) {
        showToast('info', 'Позиція вже відкрита', 'Закрийте поточну позицію перед відкриттям нової.');
        return;
      }

      const execPrice = calculateExecutionPrice(
        currentPrice,
        params.side === 'long' ? 'buy' : 'sell',
        settings.spreadPct,
        settings.slippagePct
      );

      const margin = params.sizeUsd / params.leverage;
      if (margin > settings.balance) {
        showToast('danger', 'Недостатньо маржі', `Потрібно $${margin.toFixed(1)}, баланс: $${settings.balance.toFixed(1)}`);
        return;
      }

      const liqPrice = calculateLiquidationPrice(execPrice, params.side, params.leverage);
      const screenshot = chartRef.current?.takeScreenshot() || undefined;

      const newPos: ReplayPosition = {
        id: 'pos_' + Date.now(),
        symbol,
        side: params.side,
        entryPrice: execPrice,
        currentPrice: execPrice,
        sizeUsd: params.sizeUsd,
        marginUsd: margin,
        quantity: params.sizeUsd / execPrice,
        leverage: params.leverage,
        slPrice: params.slPrice,
        tpPrice: params.tpPrice,
        entryTime: currentCandle ? currentCandle.time : Math.floor(Date.now() / 1000),
        unrealizedPnlUsd: 0,
        unrealizedPnlPct: 0,
        liquidationPrice: liqPrice,
        tag: params.tag,
        entryScreenshot: screenshot,
      };

      setPosition(newPos);
      playSound('order');
      showToast(
        'success',
        `${params.side.toUpperCase()} ордер відкрито!`,
        `${symbol} $${params.sizeUsd} (${params.leverage}x) за ціною $${execPrice.toFixed(2)}`
      );
    },
    [currentPrice, position, settings, symbol, currentCandle, showToast, playSound]
  );

  // Place Pending Order (Limit / Stop)
  const handlePlacePendingOrder = useCallback(
    (params: {
      side: 'buy' | 'sell';
      orderType: 'limit' | 'stop';
      price: number;
      sizeUsd: number;
      leverage: number;
      slPrice?: number;
      tpPrice?: number;
      tag: string;
    }) => {
      const newOrder: ReplayPendingOrder = {
        id: 'order_' + Date.now(),
        symbol,
        side: params.side,
        orderType: params.orderType,
        price: params.price,
        sizeUsd: params.sizeUsd,
        leverage: params.leverage,
        slPrice: params.slPrice,
        tpPrice: params.tpPrice,
        tag: params.tag,
        createdAtTime: currentCandle ? currentCandle.time : Math.floor(Date.now() / 1000),
      };

      setPendingOrders((prev) => [...prev, newOrder]);
      showToast(
        'info',
        `Відкладений ${params.orderType.toUpperCase()} створено`,
        `${params.side.toUpperCase()} за ціною $${params.price.toFixed(2)}`
      );
    },
    [symbol, currentCandle, showToast]
  );

  // Close Position Manually
  const handleClosePosition = useCallback(() => {
    if (!position || currentPrice <= 0) return;

    const exitPrice = calculateExecutionPrice(
      currentPrice,
      position.side === 'long' ? 'sell' : 'buy',
      settings.spreadPct,
      settings.slippagePct
    );

    let finalPnlUsd = 0;
    if (position.side === 'long') {
      finalPnlUsd = ((exitPrice - position.entryPrice) / position.entryPrice) * position.sizeUsd;
    } else {
      finalPnlUsd = ((position.entryPrice - exitPrice) / position.entryPrice) * position.sizeUsd;
    }

    const comm = (position.sizeUsd * settings.commissionPct) / 100;
    const netPnlUsd = finalPnlUsd - comm;
    const finalPnlPct = (netPnlUsd / position.marginUsd) * 100;

    const screenshot = chartRef.current?.takeScreenshot() || position.entryScreenshot;

    const journalRecord: ReplayTradeJournalItem = {
      id: 'trade_' + Date.now(),
      symbol: position.symbol,
      exchange,
      marketType,
      timeframe,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice,
      entryTime: position.entryTime,
      exitTime: currentCandle ? currentCandle.time : Math.floor(Date.now() / 1000),
      sizeUsd: position.sizeUsd,
      marginUsd: position.marginUsd,
      leverage: position.leverage,
      slPrice: position.slPrice,
      tpPrice: position.tpPrice,
      pnlUsd: netPnlUsd,
      pnlPct: finalPnlPct,
      commissionUsd: comm,
      tag: position.tag || 'Manual Close',
      screenshotUrl: screenshot,
      exitReason: 'manual',
    };

    setJournalItems((prev) => [journalRecord, ...prev]);
    setSettings((prev) => ({
      ...prev,
      balance: Math.max(0, prev.balance + netPnlUsd),
    }));

    setPosition(null);
    playSound(netPnlUsd >= 0 ? 'tp' : 'sl');
    showToast(
      netPnlUsd >= 0 ? 'success' : 'danger',
      'Позицію закрито вручну',
      `Результат: ${netPnlUsd >= 0 ? '+' : ''}$${netPnlUsd.toFixed(2)} (${finalPnlPct.toFixed(2)}%)`
    );
  }, [
    position,
    currentPrice,
    settings,
    exchange,
    marketType,
    timeframe,
    currentCandle,
    showToast,
    playSound,
  ]);

  // Coin change handler
  const handleSelectCoin = (newSymbol: string, newExchange: ExchangeId, newMarket: MarketType) => {
    setSymbol(newSymbol);
    setExchange(newExchange);
    setMarketType(newMarket);
    const date = generateRandomHistoricalDate();
    loadHistoryForDate(date, newSymbol, newExchange, newMarket, timeframe);
  };

  // Timeframe change handler
  const handleTimeframeChange = (newTf: Timeframe) => {
    setTimeframe(newTf);
    const date = currentCandle ? new Date(currentCandle.time * 1000) : generateRandomHistoricalDate();
    loadHistoryForDate(date, symbol, exchange, marketType, newTf);
  };

  // Random date generator
  const handleRandomHistoricalDate = () => {
    const randomDate = generateRandomHistoricalDate();
    loadHistoryForDate(randomDate, symbol, exchange, marketType, timeframe);
  };

  // Reset to cutoff index
  const handleResetToCutoff = () => {
    setCurrentIndex(cutoffIndex);
    setIsPlaying(false);
    setFocusTrigger((prev) => prev + 1);
    showToast('info', 'Скинуто на початок', 'Графік повернуто на початкову дату Replay.');
  };

  const currentDateText = currentCandle
    ? new Date(currentCandle.time * 1000).toLocaleString('uk-UA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }) + ' UTC'
    : '—';

  return (
    <div className="space-y-4 max-w-[2560px] mx-auto pb-10">
      {/* Top Banner / Explanation */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-950/30 via-slate-900 to-indigo-950/30 border border-amber-500/20 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/20">
            <History className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-base sm:text-lg text-white font-mono tracking-tight">
                Market Replay
              </h1>
            </div>
            <p className="text-xs text-slate-400 leading-snug">
              Історія ринку відтворюється свічка за свічкою, а майбутні свічки надійно приховані. Приймайте рішення так, ніби ви зараз у минулому!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 flex items-center gap-2">
            <span className="text-slate-500">Гарячі клавіші:</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-bold">Space</span> Play/Pause
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-bold">→</span> +1 Свічка
          </div>
        </div>
      </div>

      {/* Replay Toolbar: Coin, Date, Playback Controls */}
      <ReplayToolbar
        selectedSymbol={symbol}
        selectedExchange={exchange}
        selectedMarketType={marketType}
        availableCoins={qualifiedCoins}
        onSelectCoin={handleSelectCoin}
        timeframe={timeframe}
        onTimeframeChange={handleTimeframeChange}
        isReplayActive={true}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        onStepForward={handleStepForward}
        onResetToCutoff={handleResetToCutoff}
        playbackSpeed={playbackSpeed}
        onSpeedChange={setPlaybackSpeed}
        currentDateText={currentDateText}
        onSelectHistoricalDate={(d) => loadHistoryForDate(d, symbol, exchange, marketType, timeframe)}
        onRandomHistoricalDate={handleRandomHistoricalDate}
        currentIndex={currentIndex}
        totalCandles={allCandles.length}
        isLoadingHistoricalData={isLoadingCandles}
      />

      {/* Error Alert if any */}
      {loadError && (
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            onClick={handleRandomHistoricalDate}
            className="px-3 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-900 font-semibold transition-colors"
          >
            Спробувати іншу дату
          </button>
        </div>
      )}

      {/* Workspace Size / Layout Bar (Desktop) */}
      <div className="hidden lg:flex items-center justify-between text-xs px-3.5 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800/60 text-slate-400 font-mono">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <MoveHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            Розмір блоку графіка:
          </span>
          <span className="text-white font-bold">{chartWidthPercent}% ширини</span>
          <span className="text-slate-600">•</span>
          <span className="text-white font-bold">{chartHeight}px висоти</span>
          <span className="text-[10px] text-slate-500 font-sans ml-1">
            (тягніть розділювач або нижній край графіка)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500 uppercase mr-1">Ширина:</span>
          {[
            { label: '85% (Макс)', pct: 85 },
            { label: '75% (Стандарт)', pct: 75 },
            { label: '65% (Баланс)', pct: 65 },
            { label: '50% (50/50)', pct: 50 },
          ].map((preset) => (
            <button
              key={preset.pct}
              onClick={() => handleChartWidthChange(preset.pct)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                chartWidthPercent === preset.pct
                  ? 'bg-cyan-500 text-slate-950 font-extrabold shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Workspace Layout: Resizable Chart + Splitter + Simulator Panel */}
      <div ref={workspaceContainerRef} className="flex flex-col lg:flex-row gap-3 lg:gap-0 relative items-stretch">
        {/* Chart Column */}
        <div
          className="w-full flex flex-col min-w-0"
          style={{
            width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${chartWidthPercent}%` : '100%',
          }}
        >
          <ReplayChart
            ref={chartRef}
            visibleCandles={visibleCandles}
            symbol={symbol}
            timeframe={timeframe}
            exchange={exchange}
            marketType={marketType}
            position={position}
            pendingOrders={pendingOrders}
            isReplaying={true}
            focusTrigger={focusTrigger}
            height={chartHeight}
            onHeightChange={handleChartHeightChange}
            onTakeScreenshotNotification={() =>
              showToast('success', 'Скриншот завантажено', 'Знімок графіка успішно збережено на вашому пристрої.')
            }
          />
        </div>

        {/* Interactive Vertical Splitter (Desktop) */}
        <div
          onMouseDown={handleSplitterMouseDown}
          className="hidden lg:flex w-3 hover:w-3.5 z-20 cursor-col-resize items-center justify-center group transition-all select-none -mx-0.5"
          title="Потягніть вліво/вправо для зміни ширини блоку графіка"
        >
          <div className="w-1 group-hover:w-1.5 h-20 rounded-full bg-slate-800 group-hover:bg-cyan-400 group-active:bg-cyan-400 transition-all shadow-sm flex items-center justify-center">
            <GripVertical className="w-3 h-3 text-slate-500 group-hover:text-slate-950 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Simulator Column */}
        <div
          className="w-full flex flex-col min-w-0"
          style={{
            width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `calc(${100 - chartWidthPercent}% - 12px)` : '100%',
          }}
        >
          <ReplaySimulatorPanel
            currentPrice={currentPrice}
            currentCandle={currentCandle}
            position={position}
            settings={settings}
            onUpdateSettings={setSettings}
            onExecuteMarketOrder={handleExecuteMarketOrder}
            onPlacePendingOrder={handlePlacePendingOrder}
            onClosePosition={handleClosePosition}
            onResetBalance={() => {
              setSettings((prev) => ({ ...prev, balance: DEFAULT_SIMULATION_SETTINGS.balance }));
              showToast('info', 'Баланс скинуто', 'Баланс відновлено до $10,000 USDT.');
            }}
          />
        </div>
      </div>

      {/* Trading Journal Section (Full Width Below) */}
      <div className="w-full">
        <ReplayJournal
          journalItems={journalItems}
          pendingOrders={pendingOrders}
          onCancelPendingOrder={(orderId) => {
            setPendingOrders((prev) => prev.filter((o) => o.id !== orderId));
            showToast('info', 'Ордер скасовано', 'Відкладений ордер видалено зі списку.');
          }}
          onClearJournal={() => {
            setJournalItems([]);
            showToast('info', 'Журнал очищено', 'Всі записи угод видалено.');
          }}
          onDeleteJournalItem={(id) => {
            setJournalItems((prev) => prev.filter((i) => i.id !== id));
          }}
        />
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full animate-in slide-in-from-bottom-5 duration-200">
          <div
            className={`p-3.5 rounded-2xl shadow-2xl border backdrop-blur-md flex items-start justify-between gap-3 ${
              toastMessage.type === 'success'
                ? 'bg-slate-900/95 border-emerald-500/40 text-emerald-200 shadow-emerald-950/20'
                : toastMessage.type === 'danger'
                ? 'bg-slate-900/95 border-rose-500/40 text-rose-200 shadow-rose-950/20'
                : 'bg-slate-900/95 border-cyan-500/40 text-cyan-200 shadow-cyan-950/20'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  toastMessage.type === 'success'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : toastMessage.type === 'danger'
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'bg-cyan-500/20 text-cyan-400'
                }`}
              >
                {toastMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : toastMessage.type === 'danger' ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  <Info className="w-4 h-4" />
                )}
              </div>
              <div>
                <div className="font-bold text-xs text-white">{toastMessage.title}</div>
                <div className="text-[11px] text-slate-300 leading-snug">
                  {toastMessage.description}
                </div>
              </div>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-slate-400 hover:text-white p-1 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

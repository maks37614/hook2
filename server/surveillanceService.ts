import fs from 'fs';
import path from 'path';
import {
  SurveillanceCoin,
  SurveillanceConfig,
  SurveillanceEvent,
  SurveillanceState,
  ExchangeId,
  MarketType,
  Timeframe,
} from '../src/types';
import { fetchKlines } from './marketService';
import { sendTelegramMessage } from './telegramService';
import { getUserTelegram } from './alertService';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const SURVEILLANCE_FILE = path.join(DATA_DIR, 'surveillance.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error('Failed to create server/data directory:', e);
    }
  }
}

let surveillanceList: SurveillanceCoin[] = [];
let isSurveillanceLoaded = false;

// Format price with adequate decimals
function formatPrice(val: number): string {
  if (!val && val !== 0) return '0.00';
  if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toFixed(4);
  if (val >= 0.0001) return val.toFixed(6);
  return val.toFixed(8);
}

// Load surveillance list
export function loadSurveillanceList(): SurveillanceCoin[] {
  if (isSurveillanceLoaded) return surveillanceList;
  try {
    ensureDataDir();
    if (fs.existsSync(SURVEILLANCE_FILE)) {
      const raw = fs.readFileSync(SURVEILLANCE_FILE, 'utf-8');
      surveillanceList = JSON.parse(raw);
    } else {
      surveillanceList = [];
    }
  } catch (err) {
    console.error('Failed to read surveillance.json:', err);
    surveillanceList = [];
  }
  isSurveillanceLoaded = true;
  return surveillanceList;
}

// Save surveillance list
export function saveSurveillanceList(list: SurveillanceCoin[]): boolean {
  try {
    ensureDataDir();
    surveillanceList = list;
    fs.writeFileSync(SURVEILLANCE_FILE, JSON.stringify(list, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save surveillance.json:', err);
    return false;
  }
}

// Default config
export function getDefaultSurveillanceConfig(): SurveillanceConfig {
  return {
    timeframe: '4h',
    triggerMode: 'bar_close',
    levelsEnabled: true,
    structureEnabled: true,
    momentumEnabled: true,
    momentumPct: 2.5,
    momentumBars: 3,
    momentumTf: '15m',
    channelEnabled: true,
    fibonacciEnabled: true,
    cooldownMinutes: 15,
  };
}

// Technical analysis calculation for surveillance
export async function calculateSurveillanceState(
  symbol: string,
  exchange: ExchangeId,
  marketType: MarketType,
  config: SurveillanceConfig
): Promise<SurveillanceState | null> {
  try {
    // Fetch klines across multiple timeframes concurrently
    const [klines1d, klines4h, klines1h, klines15m] = await Promise.all([
      fetchKlines(exchange, marketType, symbol, '1d', 60).catch(() => []),
      fetchKlines(exchange, marketType, symbol, '4h', 80).catch(() => []),
      fetchKlines(exchange, marketType, symbol, '1h', 60).catch(() => []),
      fetchKlines(exchange, marketType, symbol, '15m', 40).catch(() => []),
    ]);

    if (!klines4h || klines4h.length < 15) {
      console.warn(`[Surveillance] Insufficient 4h klines for ${symbol}`);
      return null;
    }

    const currentCandle = klines4h[klines4h.length - 1];
    const currentPrice = currentCandle.close;

    // 24h change from 1d or 4h
    let change24h = 0;
    if (klines1d.length >= 2) {
      const yesterdayClose = klines1d[klines1d.length - 2].close;
      change24h = Number((((currentPrice - yesterdayClose) / yesterdayClose) * 100).toFixed(2));
    } else if (klines4h.length >= 7) {
      const dayAgo = klines4h[klines4h.length - 7].close;
      change24h = Number((((currentPrice - dayAgo) / dayAgo) * 100).toFixed(2));
    }

    // 1D Extremes (Senior)
    const high1d = klines1d.length > 0 ? Math.max(...klines1d.map((k) => k.high)) : currentCandle.high * 1.05;
    const low1d = klines1d.length > 0 ? Math.min(...klines1d.map((k) => k.low)) : currentCandle.low * 0.95;

    // 4H Swing Highs & Lows (Fractals with 3-bar left and right radius)
    const swingHighs: number[] = [];
    const swingLows: number[] = [];
    for (let i = 3; i < klines4h.length - 3; i++) {
      const c = klines4h[i];
      const isHigh =
        c.high > klines4h[i - 1].high &&
        c.high > klines4h[i - 2].high &&
        c.high > klines4h[i - 3].high &&
        c.high > klines4h[i + 1].high &&
        c.high > klines4h[i + 2].high &&
        c.high > klines4h[i + 3].high;
      if (isHigh) swingHighs.push(c.high);

      const isLow =
        c.low < klines4h[i - 1].low &&
        c.low < klines4h[i - 2].low &&
        c.low < klines4h[i - 3].low &&
        c.low < klines4h[i + 1].low &&
        c.low < klines4h[i + 2].low &&
        c.low < klines4h[i + 3].low;
      if (isLow) swingLows.push(c.low);
    }

    // Fallback if no swing found
    const recent4hSlice = klines4h.slice(-30);
    const maxRecent4h = Math.max(...recent4hSlice.map((k) => k.high));
    const minRecent4h = Math.min(...recent4hSlice.map((k) => k.low));

    const resistance4h =
      swingHighs.filter((h) => h >= currentPrice).sort((a, b) => a - b)[0] || maxRecent4h;
    const support4h =
      swingLows.filter((l) => l <= currentPrice).sort((a, b) => b - a)[0] || minRecent4h;

    const swingHigh4h = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1] : maxRecent4h;
    const swingLow4h = swingLows.length > 0 ? swingLows[swingLows.length - 1] : minRecent4h;

    // Range Position (0 - 100%)
    const rangeSpan = Math.max(0.00000001, resistance4h - support4h);
    let rangePositionPct = ((currentPrice - support4h) / rangeSpan) * 100;
    rangePositionPct = Math.max(0, Math.min(100, Number(rangePositionPct.toFixed(1))));

    // 1H Local levels
    let localHigh1h = currentPrice * 1.01;
    let localLow1h = currentPrice * 0.99;
    if (klines1h && klines1h.length >= 10) {
      const recent1h = klines1h.slice(-15);
      localHigh1h = Math.max(...recent1h.map((k) => k.high));
      localLow1h = Math.min(...recent1h.map((k) => k.low));
    }

    // Donchian Channel on 1H (20 period)
    let channelUpper = resistance4h;
    let channelLower = support4h;
    if (klines1h && klines1h.length >= 20) {
      const last20_1h = klines1h.slice(-20);
      channelUpper = Math.max(...last20_1h.map((k) => k.high));
      channelLower = Math.min(...last20_1h.map((k) => k.low));
    }

    // Fibonacci Retracements & Projections
    // Swing low to swing high
    const fibSpan = Math.max(0.00000001, swingHigh4h - swingLow4h);
    const fib618 = swingHigh4h - fibSpan * 0.618;
    const fib786 = swingHigh4h - fibSpan * 0.786;

    // Target Next Zone & Invalidation
    const nextZoneUp = resistance4h + rangeSpan * 0.5;
    const nextZoneDown = Math.max(0.00000001, support4h - rangeSpan * 0.5);

    // Structure Trend
    let structureTrend: 'bullish' | 'bearish' | 'consolidation' = 'consolidation';
    if (klines4h.length >= 20) {
      const ema20 = klines4h.slice(-20).reduce((acc, c) => acc + c.close, 0) / 20;
      if (currentPrice > resistance4h * 0.985 && currentPrice > ema20) {
        structureTrend = 'bullish';
      } else if (currentPrice < support4h * 1.015 && currentPrice < ema20) {
        structureTrend = 'bearish';
      } else {
        structureTrend = 'consolidation';
      }
    }

    // Momentum over last N bars
    let momentumRecentPct = 0;
    const momentumKlines =
      config.momentumTf === '1h'
        ? klines1h
        : config.momentumTf === '4h'
        ? klines4h
        : klines15m;

    if (momentumKlines && momentumKlines.length > config.momentumBars) {
      const startBar = momentumKlines[momentumKlines.length - 1 - config.momentumBars];
      const latestBar = momentumKlines[momentumKlines.length - 1];
      if (startBar && startBar.open > 0) {
        momentumRecentPct = Number((((latestBar.close - startBar.open) / startBar.open) * 100).toFixed(2));
      }
    }

    return {
      currentPrice,
      change24h,
      high1d,
      low1d,
      swingHigh4h,
      swingLow4h,
      localHigh1h,
      localLow1h,
      rangePositionPct,
      resistance4h,
      support4h,
      nextZoneUp,
      nextZoneDown,
      fib618,
      fib786,
      structureTrend,
      channelUpper,
      channelLower,
      momentumRecentPct,
      lastCalculated: Date.now(),
    };
  } catch (err) {
    console.error(`[Surveillance] Error calculating state for ${symbol}:`, err);
    return null;
  }
}

// Special Telegram notification template for Coin Surveillance
export function formatSurveillanceTelegramMessage(
  coin: SurveillanceCoin,
  state: SurveillanceState,
  event: SurveillanceEvent
): string {
  const symbol = coin.symbol;
  const exchangeUpper = coin.exchange.toUpperCase();
  const marketUpper = coin.marketType.toUpperCase();
  const priceStr = formatPrice(state.currentPrice);
  const changeSign = state.change24h >= 0 ? '+' : '';
  const changeStr = `${changeSign}${state.change24h}%`;

  // Event category emoji and label
  const typeIcons: Record<string, string> = {
    structure: '🔄',
    level: '🔔',
    momentum: '⚡',
    risk: '🌊',
  };
  const typeNames: Record<string, string> = {
    structure: 'СТРУКТУРА',
    level: 'РІВЕНЬ',
    momentum: 'ІМПУЛЬС',
    risk: 'КАНАЛ / РИЗИК',
  };

  const catIcon = typeIcons[event.type] || '🔔';
  const catName = typeNames[event.type] || 'СИСТЕМНИЙ АЛЕРТ';

  // Format confirmation mode
  const modeLabel =
    coin.config.triggerMode === 'bar_close'
      ? `Once Per Bar Close (${coin.config.timeframe})`
      : 'Realtime (Миттєвий перетин)';

  // App & Exchange URLs
  const exchangeUrl =
    coin.exchange === 'binance'
      ? `https://www.binance.com/uk-UA/trade/${coin.baseAsset}_${coin.quoteAsset}`
      : `https://www.bybit.com/trade/usdt/${coin.symbol}`;

  return `🛰 <b>СИСТЕМНИЙ НАГЛЯД [SIGNALHOOK SURVEILLANCE]</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
💎 <b>#${symbol}</b> • <b>${exchangeUpper} ${marketUpper}</b>
💰 <b>Ціна:</b> <code>$${priceStr}</code> (${changeStr})

${catIcon} <b>ТИП ПОДІЇ:</b> <b>${catName}</b>
🚨 <b>СТАТУС:</b> <b>${event.title}</b>
📝 <b>Деталі:</b> ${event.description}

📊 <b>СТАРШІ РІВНІ ТА СТРУКТУРА:</b>
• <b>4H Діапазон:</b> <code>$${formatPrice(state.support4h)}</code> — <code>$${formatPrice(state.resistance4h)}</code>
• <b>Положення в діапазоні:</b> <b>${state.rangePositionPct}%</b>
• <b>Старший Опір (4H/1D):</b> <code>$${formatPrice(state.resistance4h)}</code>
• <b>Старша Підтримка (4H/1D):</b> <code>$${formatPrice(state.support4h)}</code>
• <b>Локальний High (1H):</b> <code>$${formatPrice(state.localHigh1h)}</code>
• <b>Локальний Low (1H):</b> <code>$${formatPrice(state.localLow1h)}</code>

🎯 <b>ЦІЛІ ТА КЛЮЧОВІ ЗОНИ:</b>
• <b>Наступна зона (Next Zone):</b> <code>$${formatPrice(state.nextZoneUp)}</code>
• <b>Рівень скасування:</b> <code>$${formatPrice(state.nextZoneDown)}</code>
• <b>Fibonacci 0.618 (Golden Pocket):</b> <code>$${formatPrice(state.fib618)}</code>
${state.momentumRecentPct !== undefined ? `• <b>Імпульс (${coin.config.momentumBars} бари ${coin.config.momentumTf}):</b> <code>${state.momentumRecentPct >= 0 ? '+' : ''}${state.momentumRecentPct}%</code>\n` : ''}
⏱ <b>Підтвердження:</b> <code>${modeLabel}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 <a href="${exchangeUrl}">Перейти на біржу ${exchangeUpper}</a>`;
}

// Check an individual surveillance coin for new events
export async function checkCoinSurveillance(
  coin: SurveillanceCoin,
  forceCheck = false
): Promise<{ coin: SurveillanceCoin; newEvents: SurveillanceEvent[] }> {
  const newEvents: SurveillanceEvent[] = [];
  const prevState = coin.state;
  const config = coin.config;

  const newState = await calculateSurveillanceState(
    coin.symbol,
    coin.exchange,
    coin.marketType,
    config
  );

  if (!newState) {
    return { coin, newEvents: [] };
  }

  const now = Date.now();
  const cooldownMs = (config.cooldownMinutes || 15) * 60 * 1000;
  const lastNotified = coin.lastNotifiedAt ? new Date(coin.lastNotifiedAt).getTime() : 0;
  const canNotify = forceCheck || now - lastNotified >= cooldownMs;

  const cur = newState.currentPrice;
  const prev = prevState?.currentPrice || cur;

  // 1. Senior Levels (Crossing Up / Crossing Down)
  if (config.levelsEnabled) {
    // Breakout above resistance
    if (prev <= newState.resistance4h && cur > newState.resistance4h) {
      newEvents.push({
        id: `level_break_up_${now}`,
        type: 'level',
        title: `🔔 Пробій вгору (Crossing Up $${formatPrice(newState.resistance4h)})`,
        description: `Ціна вийшла вище ключового 4H опору $${formatPrice(newState.resistance4h)}. Очікується рух до наступної зони $${formatPrice(newState.nextZoneUp)}.`,
        price: cur,
        timestamp: now,
        severity: 'critical',
      });
    }
    // Return below resistance (False breakout / re-entry)
    else if (prev >= newState.resistance4h && cur < newState.resistance4h && prevState) {
      newEvents.push({
        id: `level_retest_res_${now}`,
        type: 'level',
        title: `⚠️ Повернення нижче опору (Crossing Down $${formatPrice(newState.resistance4h)})`,
        description: `Ціна повернулася нижче рівня опору $${formatPrice(newState.resistance4h)}. Можливий хибний пробій або консолідація.`,
        price: cur,
        timestamp: now,
        severity: 'warning',
      });
    }

    // Breakdown below support
    if (prev >= newState.support4h && cur < newState.support4h) {
      newEvents.push({
        id: `level_break_down_${now}`,
        type: 'level',
        title: `🔔 Пробій вниз (Crossing Down $${formatPrice(newState.support4h)})`,
        description: `Ціна пробила 4H підтримку $${formatPrice(newState.support4h)}. Наступна зона підтримки: $${formatPrice(newState.nextZoneDown)}.`,
        price: cur,
        timestamp: now,
        severity: 'critical',
      });
    }
    // Return above support
    else if (prev <= newState.support4h && cur > newState.support4h && prevState) {
      newEvents.push({
        id: `level_recover_sup_${now}`,
        type: 'level',
        title: `🛡 Відновлення вище підтримки (Crossing Up $${formatPrice(newState.support4h)})`,
        description: `Ціна успішно відкупилася вище рівня підтримки $${formatPrice(newState.support4h)}.`,
        price: cur,
        timestamp: now,
        severity: 'info',
      });
    }

    // Local 1H breakout
    if (prev <= newState.localHigh1h && cur > newState.localHigh1h) {
      newEvents.push({
        id: `local_break_up_${now}`,
        type: 'level',
        title: `⚡ Локальний пробій 1H High ($${formatPrice(newState.localHigh1h)})`,
        description: `Імпульсне перетинання локального максимуму 1-годинного графіка.`,
        price: cur,
        timestamp: now,
        severity: 'info',
      });
    }
  }

  // 2. Momentum Moves (Moving Up / Down % in N bars)
  if (config.momentumEnabled && newState.momentumRecentPct !== undefined) {
    if (Math.abs(newState.momentumRecentPct) >= config.momentumPct) {
      const dir = newState.momentumRecentPct > 0 ? 'вгору' : 'вниз';
      const emoji = newState.momentumRecentPct > 0 ? '🚀' : '📉';
      newEvents.push({
        id: `momentum_${now}`,
        type: 'momentum',
        title: `${emoji} Різкий рух ${dir}: ${newState.momentumRecentPct > 0 ? '+' : ''}${newState.momentumRecentPct}%`,
        description: `Зафіксовано різке переміщення ціни на ${newState.momentumRecentPct}% за останні ${config.momentumBars} свічки (${config.momentumTf}).`,
        price: cur,
        timestamp: now,
        severity: 'warning',
      });
    }
  }

  // 3. Structure Changes (BOS / CHoCH)
  if (config.structureEnabled && prevState?.structureTrend && prevState.structureTrend !== newState.structureTrend) {
    newEvents.push({
      id: `structure_change_${now}`,
      type: 'structure',
      title: `🔄 Зміна структури ринку (${newState.structureTrend.toUpperCase()})`,
      description: `Структура ринку змінилася з ${prevState.structureTrend} на ${newState.structureTrend}. Слідкуйте за реакцією на рівні.`,
      price: cur,
      timestamp: now,
      severity: 'critical',
    });
  }

  // 4. Channel Breakout
  if (config.channelEnabled) {
    if (prev <= newState.channelUpper && cur > newState.channelUpper) {
      newEvents.push({
        id: `channel_out_up_${now}`,
        type: 'risk',
        title: `🌊 Вихід із каналу вгору ($${formatPrice(newState.channelUpper)})`,
        description: `Ціна вийшла за межі верхньої межі консолідаційного каналу 1H.`,
        price: cur,
        timestamp: now,
        severity: 'warning',
      });
    } else if (prev >= newState.channelLower && cur < newState.channelLower) {
      newEvents.push({
        id: `channel_out_down_${now}`,
        type: 'risk',
        title: `🌊 Вихід із каналу вниз ($${formatPrice(newState.channelLower)})`,
        description: `Ціна пробила нижню межу консолідаційного каналу 1H.`,
        price: cur,
        timestamp: now,
        severity: 'warning',
      });
    }
  }

  // 5. Fibonacci Reaction (within 0.3% of 0.618 Golden Pocket)
  if (config.fibonacciEnabled && newState.fib618 > 0) {
    const distToFib = Math.abs(cur - newState.fib618) / newState.fib618;
    if (distToFib <= 0.0035) {
      newEvents.push({
        id: `fib_golden_pocket_${now}`,
        type: 'level',
        title: `🎯 Тест зони Fibonacci 0.618 (Golden Pocket)`,
        description: `Ціна дійшла до ключової золотої кишені $${formatPrice(newState.fib618)}. Можливий розворот або потужна реакція обсягу.`,
        price: cur,
        timestamp: now,
        severity: 'info',
      });
    }
  }

  // Update coin state
  const updatedCoin: SurveillanceCoin = {
    ...coin,
    lastCheckedAt: new Date().toISOString(),
    state: {
      ...newState,
      lastEvent: newEvents.length > 0 ? newEvents[0] : prevState?.lastEvent,
      recentEvents: [
        ...newEvents,
        ...(prevState?.recentEvents || []),
      ].slice(0, 10),
    },
  };

  // Dispatch Telegram message if events found and within cooldown
  if (newEvents.length > 0 && canNotify) {
    const highestSeverityEvent =
      newEvents.find((e) => e.severity === 'critical') ||
      newEvents.find((e) => e.severity === 'warning') ||
      newEvents[0];

    const messageHtml = formatSurveillanceTelegramMessage(
      updatedCoin,
      newState,
      highestSeverityEvent
    );

    // Get target user telegram credentials
    const userCreds = getUserTelegram(coin.userId);
    sendTelegramMessage(messageHtml, {
      botToken: userCreds?.botToken,
      chatId: userCreds?.chatId,
    }).then((res) => {
      if (res.success) {
        console.log(`[Surveillance] Notification sent to Telegram for ${coin.symbol} (${highestSeverityEvent.title})`);
      } else {
        console.warn(`[Surveillance] Failed to send Telegram notification: ${res.error}`);
      }
    });

    updatedCoin.lastNotifiedAt = new Date().toISOString();
  }

  return { coin: updatedCoin, newEvents };
}

// Background surveillance loop
let isLoopRunning = false;
export function startSurveillanceMonitor(intervalMs = 25000) {
  if (isLoopRunning) return;
  isLoopRunning = true;
  console.log(`[Surveillance] Monitor started with interval ${intervalMs}ms`);

  setInterval(async () => {
    try {
      const list = loadSurveillanceList();
      const activeCoins = list.filter((c) => c.isActive);
      if (activeCoins.length === 0) return;

      let changed = false;
      const updatedList = [...list];

      // Process sequentially or in small batches to avoid rate limits
      for (const coin of activeCoins) {
        try {
          const { coin: updated } = await checkCoinSurveillance(coin);
          const idx = updatedList.findIndex((c) => c.id === coin.id);
          if (idx !== -1) {
            updatedList[idx] = updated;
            changed = true;
          }
        } catch (e) {
          console.error(`[Surveillance] Failed to check coin ${coin.symbol}:`, e);
        }
      }

      if (changed) {
        saveSurveillanceList(updatedList);
      }
    } catch (err) {
      console.error('[Surveillance] Error in monitor loop:', err);
    }
  }, intervalMs);
}

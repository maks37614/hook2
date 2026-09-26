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
  TriggerModeType,
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

interface UserSurveillanceStore {
  [userId: string]: SurveillanceCoin[];
}

let storeCache: UserSurveillanceStore = {};
let isStoreLoaded = false;

function formatPrice(val: number): string {
  if (!val && val !== 0) return '0.00';
  if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toFixed(4);
  if (val >= 0.0001) return val.toFixed(6);
  return val.toFixed(8);
}

export function loadSurveillanceStore(): UserSurveillanceStore {
  if (isStoreLoaded) return storeCache;
  try {
    ensureDataDir();
    if (fs.existsSync(SURVEILLANCE_FILE)) {
      const raw = fs.readFileSync(SURVEILLANCE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        storeCache = parsed;
      }
    } else {
      const legacyFile = path.join(DATA_DIR, 'surveillance_legacy.json');
      if (fs.existsSync(legacyFile)) {
        const raw = fs.readFileSync(legacyFile, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          storeCache = { guest: list };
        }
      }
    }
  } catch (err) {
    console.error('Failed to read surveillance.json:', err);
    storeCache = {};
  }
  isStoreLoaded = true;
  return storeCache;
}

export function saveSurveillanceStore(store: UserSurveillanceStore): boolean {
  try {
    ensureDataDir();
    storeCache = store;
    fs.writeFileSync(SURVEILLANCE_FILE, JSON.stringify(store, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save surveillance.json:', err);
    return false;
  }
}

export function loadSurveillanceList(userId?: string): SurveillanceCoin[] {
  const store = loadSurveillanceStore();
  const uid = userId && userId.trim() !== '' ? userId.trim() : 'guest';
  const list = store[uid] || [];
  // Normalize triggerModes if migrating
  return list.map((coin) => {
    if (!coin.config.triggerModes) {
      coin.config.triggerModes = coin.config.triggerMode ? [coin.config.triggerMode] : ['bar_close'];
    }
    return coin;
  });
}

export function saveSurveillanceList(userId: string, list: SurveillanceCoin[]): boolean {
  const store = loadSurveillanceStore();
  const uid = userId && userId.trim() !== '' ? userId.trim() : 'guest';
  store[uid] = list;
  return saveSurveillanceStore(store);
}

export function findSurveillanceCoinById(
  id: string,
  preferredUserId?: string
): { userId: string; coin: SurveillanceCoin; index: number; list: SurveillanceCoin[] } | null {
  const store = loadSurveillanceStore();

  // Try preferred user first
  if (preferredUserId && store[preferredUserId]) {
    const list = store[preferredUserId];
    const idx = list.findIndex((c) => c.id === id);
    if (idx !== -1) {
      return { userId: preferredUserId, coin: list[idx], index: idx, list };
    }
  }

  // Fallback: search across all user stores
  for (const [uid, list] of Object.entries(store)) {
    if (Array.isArray(list)) {
      const idx = list.findIndex((c) => c.id === id);
      if (idx !== -1) {
        return { userId: uid, coin: list[idx], index: idx, list };
      }
    }
  }

  return null;
}

export function getAllActiveSurveillanceCoins(): { userId: string; coin: SurveillanceCoin }[] {
  const store = loadSurveillanceStore();
  const results: { userId: string; coin: SurveillanceCoin }[] = [];
  for (const [userId, coins] of Object.entries(store)) {
    if (Array.isArray(coins)) {
      for (const coin of coins) {
        if (coin.isActive) {
          if (!coin.config.triggerModes) {
            coin.config.triggerModes = coin.config.triggerMode ? [coin.config.triggerMode] : ['bar_close'];
          }
          results.push({ userId, coin });
        }
      }
    }
  }
  return results;
}

export function getDefaultSurveillanceConfig(): SurveillanceConfig {
  return {
    timeframe: '4h',
    triggerModes: ['bar_close'],
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

export async function calculateSurveillanceState(
  symbol: string,
  exchange: ExchangeId,
  marketType: MarketType,
  config: SurveillanceConfig
): Promise<SurveillanceState | null> {
  try {
    const [klines1d, klines4h, klines1h, klines15m] = await Promise.all([
      fetchKlines(exchange, marketType, symbol, '1d', 60).catch(() => []),
      fetchKlines(exchange, marketType, symbol, '4h', 80).catch(() => []),
      fetchKlines(exchange, marketType, symbol, '1h', 60).catch(() => []),
      fetchKlines(exchange, marketType, symbol, '15m', 40).catch(() => []),
    ]);

    let activeCandles = klines4h;
    if (!activeCandles || activeCandles.length < 5) {
      if (klines1h && klines1h.length >= 5) activeCandles = klines1h;
      else if (klines15m && klines15m.length >= 5) activeCandles = klines15m;
      else if (klines1d && klines1d.length >= 2) activeCandles = klines1d;
    }

    if (!activeCandles || activeCandles.length === 0) {
      console.warn(`[Surveillance] Attempting fallback fetch for ${symbol}`);
      const altMarket = marketType === 'futures' ? 'spot' : 'futures';
      const fallbackKlines = await fetchKlines(exchange, altMarket, symbol, '1h', 30).catch(() => []);
      if (!fallbackKlines || fallbackKlines.length === 0) {
        return null;
      }
      activeCandles = fallbackKlines;
    }

    const currentCandle = activeCandles[activeCandles.length - 1];
    const currentPrice = currentCandle.close;

    let change24h = 0;
    if (klines1d.length >= 2) {
      const yesterdayClose = klines1d[klines1d.length - 2].close;
      change24h = Number((((currentPrice - yesterdayClose) / yesterdayClose) * 100).toFixed(2));
    } else if (klines4h.length >= 7) {
      const dayAgo = klines4h[klines4h.length - 7].close;
      change24h = Number((((currentPrice - dayAgo) / dayAgo) * 100).toFixed(2));
    }

    const high1d = klines1d.length > 0 ? Math.max(...klines1d.map((k) => k.high)) : currentCandle.high * 1.05;
    const low1d = klines1d.length > 0 ? Math.min(...klines1d.map((k) => k.low)) : currentCandle.low * 0.95;

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

    const recent4hSlice = klines4h.slice(-30);
    const maxRecent4h = Math.max(...recent4hSlice.map((k) => k.high));
    const minRecent4h = Math.min(...recent4hSlice.map((k) => k.low));

    const resistance4h =
      swingHighs.filter((h) => h >= currentPrice).sort((a, b) => a - b)[0] || maxRecent4h;
    const support4h =
      swingLows.filter((l) => l <= currentPrice).sort((a, b) => b - a)[0] || minRecent4h;

    const swingHigh4h = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1] : maxRecent4h;
    const swingLow4h = swingLows.length > 0 ? swingLows[swingLows.length - 1] : minRecent4h;

    const rangeSpan = Math.max(0.00000001, resistance4h - support4h);
    let rangePositionPct = ((currentPrice - support4h) / rangeSpan) * 100;
    rangePositionPct = Math.max(0, Math.min(100, Number(rangePositionPct.toFixed(1))));

    let localHigh1h = currentPrice * 1.01;
    let localLow1h = currentPrice * 0.99;
    if (klines1h && klines1h.length >= 10) {
      const recent1h = klines1h.slice(-15);
      localHigh1h = Math.max(...recent1h.map((k) => k.high));
      localLow1h = Math.min(...recent1h.map((k) => k.low));
    }

    let localHigh15m = currentPrice * 1.005;
    let localLow15m = currentPrice * 0.995;
    if (klines15m && klines15m.length >= 10) {
      const recent15m = klines15m.slice(-15);
      localHigh15m = Math.max(...recent15m.map((k) => k.high));
      localLow15m = Math.min(...recent15m.map((k) => k.low));
    }

    let channelUpper = resistance4h;
    let channelLower = support4h;
    if (klines1h && klines1h.length >= 20) {
      const last20_1h = klines1h.slice(-20);
      channelUpper = Math.max(...last20_1h.map((k) => k.high));
      channelLower = Math.min(...last20_1h.map((k) => k.low));
    }

    const fibSpan = Math.max(0.00000001, swingHigh4h - swingLow4h);
    const fib618 = swingHigh4h - fibSpan * 0.618;
    const fib786 = swingHigh4h - fibSpan * 0.786;

    const nextZoneUp = resistance4h + rangeSpan * 0.5;
    const nextZoneDown = Math.max(0.00000001, support4h - rangeSpan * 0.5);

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
      localHigh15m,
      localLow15m,
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

  const modes = coin.config.triggerModes || (coin.config.triggerMode ? [coin.config.triggerMode] : ['bar_close']);
  const modeLabelsMap: Record<string, string> = {
    bar_close: 'Закриття 4H',
    bar_close_1h: 'Закриття 1H',
    bar_close_15m: 'Закриття 15m',
    realtime: 'Realtime',
  };
  const modeLabel = modes.map((m) => modeLabelsMap[m] || m).join(', ');

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

📊 <b>СТАРШІ ТА ЛОКАЛЬНІ РІВНІ:</b>
• <b>4H Діапазон:</b> <code>$${formatPrice(state.support4h)}</code> — <code>$${formatPrice(state.resistance4h)}</code>
• <b>Старший Опір (4H/1D):</b> <code>$${formatPrice(state.resistance4h)}</code>
• <b>Старша Підтримка (4H/1D):</b> <code>$${formatPrice(state.support4h)}</code>
• <b>Локальний High (1H):</b> <code>$${formatPrice(state.localHigh1h)}</code> | <b>Low (1H):</b> <code>$${formatPrice(state.localLow1h)}</code>
• <b>Локальний High (15m):</b> <code>$${formatPrice(state.localHigh15m)}</code> | <b>Low (15m):</b> <code>$${formatPrice(state.localLow15m)}</code>

🎯 <b>ЦІЛІ ТА КЛЮЧОВІ ЗОНИ:</b>
• <b>Наступна зона:</b> <code>$${formatPrice(state.nextZoneUp)}</code>
• <b>Рівень скасування:</b> <code>$${formatPrice(state.nextZoneDown)}</code>
• <b>Fibonacci 0.618 (Golden Pocket):</b> <code>$${formatPrice(state.fib618)}</code>
${state.momentumRecentPct !== undefined ? `• <b>Імпульс (${coin.config.momentumBars} бари ${coin.config.momentumTf}):</b> <code>${state.momentumRecentPct >= 0 ? '+' : ''}${state.momentumRecentPct}%</code>\n` : ''}
⏱ <b>Режими підтвердження:</b> <code>${modeLabel}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 <a href="${exchangeUrl}">Перейти на біржу ${exchangeUpper}</a>`;
}

export async function checkCoinSurveillance(
  coin: SurveillanceCoin,
  forceCheck = false
): Promise<{ coin: SurveillanceCoin; newEvents: SurveillanceEvent[] }> {
  const newEvents: SurveillanceEvent[] = [];
  const prevState = coin.state;
  const config = coin.config;

  const [klines1h, klines15m] = await Promise.all([
    fetchKlines(coin.exchange, coin.marketType, coin.symbol, '1h', 30).catch(() => []),
    fetchKlines(coin.exchange, coin.marketType, coin.symbol, '15m', 30).catch(() => []),
  ]);

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

  // Evaluate trigger modes (supports multiple active modes)
  const modes = config.triggerModes || (config.triggerMode ? [config.triggerMode] : ['bar_close']);
  const isRealtime = modes.includes('realtime');
  const isBarClose15 = modes.includes('bar_close_15m');
  const isBarClose1h = modes.includes('bar_close_1h');
  const isBarClose4h = modes.includes('bar_close');

  let isTriggerAllowed = forceCheck || isRealtime;

  if (!isTriggerAllowed) {
    if (isBarClose15 && klines15m.length >= 2) {
      const completedCandle = klines15m[klines15m.length - 2];
      const crossedUp15 = completedCandle.close > newState.resistance4h || completedCandle.close > newState.localHigh15m;
      const crossedDown15 = completedCandle.close < newState.support4h || completedCandle.close < newState.localLow15m;
      if (crossedUp15 || crossedDown15) isTriggerAllowed = true;
    }
    if (isBarClose1h && klines1h.length >= 2) {
      const completedCandle = klines1h[klines1h.length - 2];
      const crossedUp1h = completedCandle.close > newState.resistance4h || completedCandle.close > newState.localHigh1h;
      const crossedDown1h = completedCandle.close < newState.support4h || completedCandle.close < newState.localLow1h;
      if (crossedUp1h || crossedDown1h) isTriggerAllowed = true;
    }
    if (isBarClose4h) {
      isTriggerAllowed = true;
    }
  }

  // 1. Senior & Local Levels (Crossing Up / Down)
  if (config.levelsEnabled && (isTriggerAllowed || forceCheck)) {
    if (prev <= newState.resistance4h && cur > newState.resistance4h) {
      newEvents.push({
        id: `level_break_up_4h_${now}`,
        type: 'level',
        title: `🔔 Пробій 4H опору (Crossing Up $${formatPrice(newState.resistance4h)})`,
        description: `Ціна вийшла вище ключового 4H опору $${formatPrice(newState.resistance4h)}. Рух до наступної зони $${formatPrice(newState.nextZoneUp)}.`,
        price: cur,
        timestamp: now,
        severity: 'critical',
      });
    } else if (prev >= newState.resistance4h && cur < newState.resistance4h && prevState) {
      newEvents.push({
        id: `level_retest_res_${now}`,
        type: 'level',
        title: `⚠️ Повернення нижче 4H опору (Crossing Down $${formatPrice(newState.resistance4h)})`,
        description: `Ціна повернулася нижче рівня опору $${formatPrice(newState.resistance4h)}.`,
        price: cur,
        timestamp: now,
        severity: 'warning',
      });
    }

    if (prev >= newState.support4h && cur < newState.support4h) {
      newEvents.push({
        id: `level_break_down_4h_${now}`,
        type: 'level',
        title: `🔔 Пробій 4H підтримки (Crossing Down $${formatPrice(newState.support4h)})`,
        description: `Ціна пробила 4H підтримку $${formatPrice(newState.support4h)}. Наступна зона: $${formatPrice(newState.nextZoneDown)}.`,
        price: cur,
        timestamp: now,
        severity: 'critical',
      });
    } else if (prev <= newState.support4h && cur > newState.support4h && prevState) {
      newEvents.push({
        id: `level_recover_sup_${now}`,
        type: 'level',
        title: `🛡 Відновлення вище 4H підтримки (Crossing Up $${formatPrice(newState.support4h)})`,
        description: `Ціна відкупилася вище підтримки $${formatPrice(newState.support4h)}.`,
        price: cur,
        timestamp: now,
        severity: 'info',
      });
    }

    if (prev <= newState.localHigh1h && cur > newState.localHigh1h) {
      newEvents.push({
        id: `level_cross_up_1h_${now}`,
        type: 'level',
        title: `⚡ Пробій 1H максимуму (Crossing Up $${formatPrice(newState.localHigh1h)})`,
        description: `Імпульсне перетинання 1H рівня опору.`,
        price: cur,
        timestamp: now,
        severity: 'warning',
      });
    }
    if (prev >= newState.localLow1h && cur < newState.localLow1h) {
      newEvents.push({
        id: `level_cross_down_1h_${now}`,
        type: 'level',
        title: `⚠️ Пробій 1H мінімуму (Crossing Down $${formatPrice(newState.localLow1h)})`,
        description: `Пробій 1H рівня підтримки вниз.`,
        price: cur,
        timestamp: now,
        severity: 'warning',
      });
    }

    if (prev <= newState.localHigh15m && cur > newState.localHigh15m) {
      newEvents.push({
        id: `level_cross_up_15m_${now}`,
        type: 'level',
        title: `⚡ Пробій 15m рівня (Crossing Up $${formatPrice(newState.localHigh15m)})`,
        description: `Пробито локальний 15m рівень вгору.`,
        price: cur,
        timestamp: now,
        severity: 'info',
      });
    }
    if (prev >= newState.localLow15m && cur < newState.localLow15m) {
      newEvents.push({
        id: `level_cross_down_15m_${now}`,
        type: 'level',
        title: `⚠️ Пробій 15m рівня (Crossing Down $${formatPrice(newState.localLow15m)})`,
        description: `Пробито локальний 15m рівень підтримки вниз.`,
        price: cur,
        timestamp: now,
        severity: 'info',
      });
    }
  }

  // 2. Momentum Moves
  if (config.momentumEnabled && newState.momentumRecentPct !== undefined) {
    if (Math.abs(newState.momentumRecentPct) >= config.momentumPct) {
      const dir = newState.momentumRecentPct > 0 ? 'вгору' : 'вниз';
      const emoji = newState.momentumRecentPct > 0 ? '🚀' : '📉';
      newEvents.push({
        id: `momentum_${now}`,
        type: 'momentum',
        title: `${emoji} Різкий рух ${dir}: ${newState.momentumRecentPct > 0 ? '+' : ''}${newState.momentumRecentPct}%`,
        description: `Зміна на ${newState.momentumRecentPct}% за ${config.momentumBars} бари (${config.momentumTf}).`,
        price: cur,
        timestamp: now,
        severity: 'warning',
      });
    }
  }

  // 3. Structure Changes
  if (config.structureEnabled && prevState?.structureTrend && prevState.structureTrend !== newState.structureTrend) {
    newEvents.push({
      id: `structure_change_${now}`,
      type: 'structure',
      title: `🔄 Зміна структури ринку (${newState.structureTrend.toUpperCase()})`,
      description: `Структура змінила тренд на ${newState.structureTrend}.`,
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
        description: `Ціна вийшла за верхню межу каналу 1H.`,
        price: cur,
        timestamp: now,
        severity: 'warning',
      });
    } else if (prev >= newState.channelLower && cur < newState.channelLower) {
      newEvents.push({
        id: `channel_out_down_${now}`,
        type: 'risk',
        title: `🌊 Вихід із каналу вниз ($${formatPrice(newState.channelLower)})`,
        description: `Ціна пробила нижню межу каналу 1H.`,
        price: cur,
        timestamp: now,
        severity: 'warning',
      });
    }
  }

  // 5. Fibonacci Reaction
  if (config.fibonacciEnabled && newState.fib618 > 0) {
    const distToFib = Math.abs(cur - newState.fib618) / newState.fib618;
    if (distToFib <= 0.0035) {
      newEvents.push({
        id: `fib_golden_pocket_${now}`,
        type: 'level',
        title: `🎯 Тест зони Fibonacci 0.618 (Golden Pocket)`,
        description: `Ціна дійшла до золотого рівня $${formatPrice(newState.fib618)}.`,
        price: cur,
        timestamp: now,
        severity: 'info',
      });
    }
  }

  const updatedCoin: SurveillanceCoin = {
    ...coin,
    lastCheckedAt: new Date().toISOString(),
    state: {
      ...newState,
      lastEvent: newEvents.length > 0 ? newEvents[0] : prevState?.lastEvent,
      recentEvents: [...newEvents, ...(prevState?.recentEvents || [])].slice(0, 10),
    },
  };

  if (newEvents.length > 0 && canNotify) {
    const highestSeverityEvent =
      newEvents.find((e) => e.severity === 'critical') ||
      newEvents.find((e) => e.severity === 'warning') ||
      newEvents[0];

    const messageHtml = formatSurveillanceTelegramMessage(updatedCoin, newState, highestSeverityEvent);
    const userCreds = getUserTelegram(coin.userId);

    sendTelegramMessage(messageHtml, {
      botToken: userCreds?.botToken,
      chatId: userCreds?.chatId,
    }).then((res) => {
      if (res.success) {
        console.log(`[Surveillance] Notification sent to Telegram for ${coin.symbol}`);
      }
    });

    updatedCoin.lastNotifiedAt = new Date().toISOString();
  }

  return { coin: updatedCoin, newEvents };
}

let isLoopRunning = false;

export async function checkAllUserCoins(userId: string): Promise<SurveillanceCoin[]> {
  const store = loadSurveillanceStore();
  const uid = userId && userId.trim() !== '' ? userId.trim() : 'guest';
  const list = store[uid] || [];
  if (list.length === 0) return [];

  const updatedList: SurveillanceCoin[] = [];
  for (const coin of list) {
    try {
      const { coin: updated } = await checkCoinSurveillance(coin, true);
      updatedList.push(updated);
    } catch {
      updatedList.push(coin);
    }
  }

  store[uid] = updatedList;
  saveSurveillanceStore(store);
  return updatedList;
}

export function startSurveillanceMonitor(intervalMs = 25000) {
  if (isLoopRunning) return;
  isLoopRunning = true;
  console.log(`[Surveillance] 24/7 Monitor started with interval ${intervalMs}ms`);

  setInterval(async () => {
    try {
      const activeItems = getAllActiveSurveillanceCoins();
      if (activeItems.length === 0) return;

      const store = loadSurveillanceStore();

      for (const { userId, coin } of activeItems) {
        try {
          const { coin: updated } = await checkCoinSurveillance(coin);
          const userCoins = store[userId] || [];
          const idx = userCoins.findIndex((c) => c.id === coin.id);
          if (idx !== -1) {
            userCoins[idx] = updated;
            store[userId] = userCoins;
            saveSurveillanceStore(store);
          }
        } catch (e) {
          console.error(`[Surveillance] Failed to check coin ${coin.symbol} for user ${userId}:`, e);
        }
      }
    } catch (err) {
      console.error('[Surveillance] Error in monitor loop:', err);
    }
  }, intervalMs);
}

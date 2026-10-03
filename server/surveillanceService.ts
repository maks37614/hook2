import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import {
  SurveillanceCoin,
  SurveillanceConfig,
  SurveillanceEvent,
  SurveillanceState,
  ExchangeId,
  MarketType,
  Timeframe,
  TriggerModeType,
  Kline,
} from '../src/types';
import { normalizeKlineTimeMs } from '../src/utils/formationValidation';
import { getTimeframeMs } from './surveillance/multiTimeframeEngine';
import { fetchKlines } from './marketService';
import { sendTelegramMessage } from './telegramService';
import { getUserTelegram } from './alertService';
import { surveillanceManager } from './surveillance/surveillanceManager';
import { notificationRouter } from './notificationRouter';

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
      if (Array.isArray(parsed)) {
        // Migrate legacy array format to user-keyed object format
        storeCache = {};
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            const uid = (item.userId && String(item.userId).trim()) || 'guest';
            if (!storeCache[uid]) storeCache[uid] = [];
            storeCache[uid].push(item);
          }
        }
        saveSurveillanceStore(storeCache);
      } else if (parsed && typeof parsed === 'object') {
        storeCache = parsed;
      } else {
        storeCache = {};
      }
    } else {
      const legacyFile = path.join(DATA_DIR, 'surveillance_legacy.json');
      if (fs.existsSync(legacyFile)) {
        const raw = fs.readFileSync(legacyFile, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          storeCache = { guest: list };
          saveSurveillanceStore(storeCache);
        }
      }
    }
  } catch (err) {
    console.error('Failed to read surveillance.json:', err);
    storeCache = {};
  }
  // Older guest copies shared IDs, causing one user's worker to replace another's.
  const ids = new Set<string>();
  let repaired = false;
  for (const [userId, coins] of Object.entries(storeCache)) {
    if (!Array.isArray(coins)) { delete storeCache[userId]; repaired = true; continue; }
    for (const coin of coins) {
      if (coin.userId !== userId) { coin.userId = userId; repaired = true; }
      if (!coin.id || ids.has(coin.id)) { coin.id = `surv_${randomUUID()}`; repaired = true; }
      ids.add(coin.id);
    }
  }
  if (repaired) saveSurveillanceStore(storeCache);
  isStoreLoaded = true;
  return storeCache;
}

export function saveSurveillanceStore(store: UserSurveillanceStore): boolean {
  try {
    ensureDataDir();
    let safeStore: UserSurveillanceStore = store;
    if (Array.isArray(store)) {
      safeStore = {};
      for (const item of store as any[]) {
        if (item && typeof item === 'object') {
          const uid = (item.userId && String(item.userId).trim()) || 'guest';
          if (!safeStore[uid]) safeStore[uid] = [];
          safeStore[uid].push(item);
        }
      }
    }
    storeCache = safeStore;
    const temporaryFile = `${SURVEILLANCE_FILE}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(safeStore, null, 2), 'utf-8');
    fs.renameSync(temporaryFile, SURVEILLANCE_FILE);
    return true;
  } catch (err) {
    console.error('Failed to save surveillance.json:', err);
    return false;
  }
}

export function loadSurveillanceList(userId?: string): SurveillanceCoin[] {
  const store = loadSurveillanceStore();
  const uid = (userId && userId.trim() !== '') ? userId.trim() : 'guest';
  const list = store[uid] || [];

  return list.map((coin) => {
    if (!coin.config.triggerModes) {
      coin.config.triggerModes = coin.config.triggerMode ? [coin.config.triggerMode] : ['bar_close'];
    }

    // Ensure worker is running if coin is active
    if (coin.isActive) {
      surveillanceManager.startWorkerForCoin(coin);
    }

    // Merge live metrics from worker if available
    const snapshot = surveillanceManager.getWorkerSnapshot(coin.id);
    if (snapshot && snapshot.userId === uid && coin.state) {
      const topDensity = snapshot.densities[0];
      const activeSetup = snapshot.setups[0];
      const activePattern = snapshot.patterns[0];
      const activeThirdTouch = snapshot.thirdTouches[0];

      // Convert worker EngineAlertEvents to SurveillanceEvents
      const workerEvents: SurveillanceEvent[] = (snapshot.recentEvents || []).map((e: any) => ({
        id: e.eventId || `worker_evt_${e.timestamp}`,
        type: (e.type?.toLowerCase().includes('level') || e.type?.toLowerCase().includes('retest'))
          ? 'level'
          : (e.type?.toLowerCase().includes('structure') || e.type?.toLowerCase().includes('bos') || e.type?.toLowerCase().includes('choch'))
          ? 'structure'
          : (e.type?.toLowerCase().includes('impulse') || e.type?.toLowerCase().includes('momentum'))
          ? 'momentum'
          : 'risk',
        title: e.title || `Подія ${e.type}`,
        description: e.description || '',
        price: e.price || snapshot.currentPrice,
        timestamp: e.timestamp || Date.now(),
        severity: (e.severity === 'CRITICAL' || e.severity === 'HIGH')
          ? 'critical'
          : (e.severity === 'IMPORTANT' || e.severity === 'WATCH')
          ? 'warning'
          : 'info',
        details: {
          timeframe: e.timeframe,
          confluenceScore: e.confluenceScore,
          type: e.type,
          evidence: e.evidence,
        },
      }));

      const existingEvents: SurveillanceEvent[] = coin.state.recentEvents || [];
      const combinedEvents = [...workerEvents, ...existingEvents];
      const seenIds = new Set<string>();
      const dedupedEvents = combinedEvents.filter((ev) => {
        if (!ev.id || seenIds.has(ev.id)) return false;
        seenIds.add(ev.id);
        return true;
      }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 25);

      coin.state = {
        ...coin.state,
        engineStatus: snapshot.status as any,
        currentPrice: snapshot.currentPrice > 0 ? snapshot.currentPrice : coin.state.currentPrice,
        spreadPct: snapshot.orderBookState?.spreadPct,
        bestBid: snapshot.orderBookState?.bestBid,
        bestAsk: snapshot.orderBookState?.bestAsk,
        densitiesCount: snapshot.densities.length,
        topDensityUsd: topDensity?.notionalUsd,
        topDensityPrice: topDensity?.price,
        topDensitySide: topDensity?.side,
        thirdTouchState: activeThirdTouch?.state,
        thirdTouchDistancePct: activeThirdTouch?.distancePct,
        activeSetupType: activeSetup?.type,
        activeSetupStage: activeSetup?.stage,
        activeSetupConfluence: activeSetup?.confluenceScore,
        oiRegime: snapshot.oiSnapshot?.regime,
        oiChange15mPct: snapshot.oiSnapshot?.change15mPct,
        oiAnomaly: snapshot.oiSnapshot?.isAnomaly,
        tradeFlowBuyUsd: snapshot.tradeFlow?.aggressiveBuyUsd,
        tradeFlowSellUsd: snapshot.tradeFlow?.aggressiveSellUsd,
        tradeFlowImbalance: snapshot.tradeFlow?.imbalanceRatio,
        formationName: activePattern?.name,
        formationScore: activePattern?.score,
        lastCalculated: snapshot.lastAnalysisTimestamp || Date.now(),
        recentEvents: dedupedEvents,
        lastEvent: dedupedEvents[0] || coin.state.lastEvent,
      };
    }

    return coin;
  });
}

export function saveSurveillanceList(userId: string, list: SurveillanceCoin[]): boolean {
  const store = loadSurveillanceStore();
  const uid = (userId && userId.trim() !== '') ? userId.trim() : 'guest';
  for (const coin of store[uid] || []) {
    if (!list.some(item => item.id === coin.id)) surveillanceManager.stopWorkerForCoin(coin.id);
  }
  store[uid] = list;
  return saveSurveillanceStore(store);
}

// An async check must never restore a deleted coin or overwrite a user's edits.
export function commitSurveillanceCheck(checked: SurveillanceCoin): SurveillanceCoin | null {
  const found = findSurveillanceCoinById(checked.id, checked.userId);
  if (!found) return null;
  const current = found.coin;
  if (current.isActive !== checked.isActive || JSON.stringify(current.config) !== JSON.stringify(checked.config)) return current;
  const updated = { ...current, state: checked.state, lastCheckedAt: checked.lastCheckedAt,
    lastNotifiedAt: checked.lastNotifiedAt || current.lastNotifiedAt };
  found.list[found.index] = updated;
  saveSurveillanceList(found.userId, found.list);
  surveillanceManager.updateWorkerCoin(updated);
  return updated;
}

export function updateSurveillanceCoinActive(
  id: string,
  isActive: boolean,
  preferredUserId?: string
): SurveillanceCoin | null {
  const store = loadSurveillanceStore();
  const found = findSurveillanceCoinById(id, preferredUserId);
  if (!found) return null;

  const updatedCoin: SurveillanceCoin = {
    ...found.coin,
    isActive: Boolean(isActive),
    updatedAt: new Date().toISOString(),
  };

  if (Boolean(isActive)) {
    surveillanceManager.startWorkerForCoin(updatedCoin);
  } else {
    surveillanceManager.stopWorkerForCoin(id);
  }

  found.list[found.index] = updatedCoin;
  saveSurveillanceList(found.userId, found.list);
  return updatedCoin;
}

export function setAllSurveillanceCoinsActive(userId: string, isActive: boolean): SurveillanceCoin[] {
  const store = loadSurveillanceStore();
  const uid = (userId && userId.trim() !== '') ? userId.trim() : 'guest';
  const list = store[uid] || [];
  const updatedList = list.map((coin) => {
    const updated = {
      ...coin,
      isActive: Boolean(isActive),
      updatedAt: new Date().toISOString(),
    };
    if (Boolean(isActive)) {
      surveillanceManager.startWorkerForCoin(updated);
    } else {
      surveillanceManager.stopWorkerForCoin(coin.id);
    }
    return updated;
  });
  store[uid] = updatedList;
  saveSurveillanceStore(store);
  return updatedList;
}

export function findSurveillanceCoinById(
  id: string,
  preferredUserId?: string
): { userId: string; coin: SurveillanceCoin; index: number; list: SurveillanceCoin[] } | null {
  const store = loadSurveillanceStore();

  const userId = preferredUserId?.trim() || 'guest';
  const list = store[userId];
  if (!Array.isArray(list)) return null;
  const index = list.findIndex(coin => coin.id === id);
  return index === -1 ? null : { userId, coin: list[index], index, list };
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

export function validateSurveillanceConfig(config: Partial<SurveillanceConfig>): string | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return 'Невірні налаштування стеження';
  if (config.densityMode !== undefined && !['AUTO', 'MANUAL', 'HYBRID'].includes(config.densityMode)) return 'Невірний режим щільностей';
  if (config.manualDensityThresholdUsd !== undefined &&
      (!Number.isFinite(config.manualDensityThresholdUsd) || config.manualDensityThresholdUsd <= 0)) return 'Поріг щільності має бути додатним числом';
  if (config.cooldownMinutes !== undefined && (!Number.isFinite(config.cooldownMinutes) || config.cooldownMinutes < 0)) return 'Невірний інтервал сповіщень';
  if (config.momentumBars !== undefined && (!Number.isInteger(config.momentumBars) || config.momentumBars < 1)) return 'Невірна кількість свічок імпульсу';
  if (config.momentumPct !== undefined && (!Number.isFinite(config.momentumPct) || config.momentumPct <= 0)) return 'Невірний поріг імпульсу';
  if (config.triggerModes !== undefined && (!Array.isArray(config.triggerModes) || !config.triggerModes.length ||
      config.triggerModes.some(mode => !['realtime', 'bar_close', 'bar_close_1h', 'bar_close_15m'].includes(mode)))) return 'Оберіть коректний режим підтвердження';
  return null;
}

export async function calculateSurveillanceState(
  symbol: string,
  exchange: ExchangeId,
  marketType: MarketType,
  config: SurveillanceConfig,
  source?: Record<'1d' | '4h' | '1h' | '15m', Kline[]>
): Promise<SurveillanceState | null> {
  try {
    const [klines1d, klines4h, klines1h, klines15m] = source
      ? [source['1d'], source['4h'], source['1h'], source['15m']]
      : await Promise.all([
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
      return null;
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

    const recent4hSlice = (klines4h.length ? klines4h : activeCandles).slice(-30);
    const maxRecent4h = Math.max(...recent4hSlice.map((k) => k.high));
    const minRecent4h = Math.min(...recent4hSlice.map((k) => k.low));

    // Prefer closest structural swing high >= currentPrice. If none, check 1d high or highest swing high before falling back to window max
    let resistance4h = swingHighs.filter((h) => h >= currentPrice).sort((a, b) => a - b)[0];
    if (!resistance4h) {
      if (high1d > currentPrice) {
        resistance4h = high1d;
      } else if (swingHighs.length > 0) {
        resistance4h = Math.max(...swingHighs);
      } else {
        resistance4h = maxRecent4h;
      }
    }

    // Prefer closest structural swing low <= currentPrice. If none, check 1d low or lowest swing low before falling back to window min
    let support4h = swingLows.filter((l) => l <= currentPrice).sort((a, b) => b - a)[0];
    if (!support4h) {
      if (low1d < currentPrice) {
        support4h = low1d;
      } else if (swingLows.length > 0) {
        support4h = Math.min(...swingLows);
      } else {
        support4h = minRecent4h;
      }
    }

    const swingHigh4h = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1] : maxRecent4h;
    const swingLow4h = swingLows.length > 0 ? swingLows[swingLows.length - 1] : minRecent4h;

    const rangeSpan = Math.max(currentPrice * 0.000001, resistance4h - support4h);
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

    const fibSpan = Math.max(currentPrice * 0.000001, swingHigh4h - swingLow4h);
    const fib618 = swingHigh4h - fibSpan * 0.618;
    const fib786 = swingHigh4h - fibSpan * 0.786;

    const nextZoneUp = resistance4h + rangeSpan * 0.5;
    const nextZoneDown = Math.max(currentPrice * 0.000001, support4h - rangeSpan * 0.5);

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
    const momentumSource =
      config.momentumTf === '1h'
        ? klines1h
        : config.momentumTf === '4h'
        ? klines4h
        : klines15m;

    const momentumKlines = momentumSource.filter(c => normalizeKlineTimeMs(c.time) + getTimeframeMs(config.momentumTf) <= Date.now());
    if (momentumKlines.length >= config.momentumBars && config.momentumBars > 0) {
      const startBar = momentumKlines[momentumKlines.length - config.momentumBars];
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

const checkFlights = new Map<string, Promise<{ coin: SurveillanceCoin; newEvents: SurveillanceEvent[] }>>();

export async function checkCoinSurveillance(
  requestedCoin: SurveillanceCoin,
  options: { forceCheck?: boolean; forceNotify?: boolean } | boolean = false
): Promise<{ coin: SurveillanceCoin; newEvents: SurveillanceEvent[] }> {
  const key = `${requestedCoin.userId}:${requestedCoin.id}`;
  const existing = checkFlights.get(key);
  if (existing) return existing;
  const checking = checkCoinSurveillanceInternal(requestedCoin, options);
  checkFlights.set(key, checking);
  try { return await checking; }
  finally { if (checkFlights.get(key) === checking) checkFlights.delete(key); }
}

async function checkCoinSurveillanceInternal(
  requestedCoin: SurveillanceCoin,
  options: { forceCheck?: boolean; forceNotify?: boolean } | boolean
): Promise<{ coin: SurveillanceCoin; newEvents: SurveillanceEvent[] }> {
  const current = findSurveillanceCoinById(requestedCoin.id, requestedCoin.userId)?.coin;
  if (!current) return { coin: requestedCoin, newEvents: [] };
  const coin = structuredClone(current);
  const config = coin.config;
  const prevState = coin.state;
  const forceNotify = typeof options === 'object' && Boolean(options.forceNotify);
  const frames = ['1d', '4h', '1h', '15m'] as const;
  const fetched = await Promise.all(frames.map(tf => fetchKlines(coin.exchange, coin.marketType, coin.symbol, tf,
    tf === '4h' ? 80 : 60).catch(() => [])));
  const source = Object.fromEntries(frames.map((tf, i) => [tf, fetched[i]])) as Record<typeof frames[number], Kline[]>;
  const newState = await calculateSurveillanceState(coin.symbol, coin.exchange, coin.marketType, config, source);
  if (!newState) return { coin, newEvents: [] };

  const now = Date.now();
  const processed = { '15m': 0, '1h': 0, '4h': 0, ...prevState?.lastProcessedCandleTimes };
  const modes = config.triggerModes || (config.triggerMode ? [config.triggerMode] : ['bar_close']);
  const closingModes = [
    ['4h', 'bar_close'], ['1h', 'bar_close_1h'], ['15m', 'bar_close_15m'],
  ] as const;
  const newEvents: SurveillanceEvent[] = [];

  for (const [tf, mode] of closingModes) {
    if (!modes.includes(mode)) continue;
    const closed = source[tf].filter(c => normalizeKlineTimeMs(c.time) + getTimeframeMs(tf) <= now);
    const candle = closed[closed.length - 1];
    if (!candle || closed.length < 3) continue;
    const startTime = normalizeKlineTimeMs(candle.time);
    // Legacy 4h state stored the live bucket instead of the last closed candle.
    if (processed[tf] > startTime) processed[tf] = startTime;
    if (startTime <= processed[tf]) continue;
    const previousProcessed = processed[tf];
    processed[tf] = startTime;
    // Establish a baseline when tracking starts; an old candle is not a new event.
    if (!prevState || !previousProcessed) continue;

    const causalSource = Object.fromEntries(frames.map(frame => [frame, source[frame].filter(c =>
      normalizeKlineTimeMs(c.time) + getTimeframeMs(frame) <= startTime)])) as typeof source;
    const levels = await calculateSurveillanceState(coin.symbol, coin.exchange, coin.marketType, config, causalSource);
    if (!levels) continue;
    const previousClose = closed[closed.length - 2].close;
    const price = candle.close;
    const add = (kind: string, type: SurveillanceEvent['type'], title: string, description: string,
      severity: SurveillanceEvent['severity'], reference = '') => {
      newEvents.push({ id: `${kind}_${tf}_${startTime}_${reference}`, type, title, description, severity, price,
        timestamp: startTime + getTimeframeMs(tf),
        details: { timeframe: tf, triggerMode: mode, notificationType: kind, eventIdentity: `${kind}_${tf}_${reference}` },
      });
    };
    const crossing = (level: number, kind: string, label: string, severity: SurveillanceEvent['severity']) => {
      if (!(level > 0) || !Number.isFinite(level)) return;
      if (previousClose <= level && price > level) add(kind, 'level', `🔔 ${label}: пробій вгору ($${formatPrice(level)})`,
        `Свічка ${tf} закрилася вище рівня $${formatPrice(level)}.`, severity, String(level));
      else if (previousClose >= level && price < level) add(kind, 'level', `🔔 ${label}: пробій вниз ($${formatPrice(level)})`,
        `Свічка ${tf} закрилася нижче рівня $${formatPrice(level)}.`, severity, String(level));
    };
    if (config.levelsEnabled) {
      crossing(levels.resistance4h, 'LEVEL_CROSS_4H', 'Опір 4H', 'critical');
      crossing(levels.support4h, 'LEVEL_CROSS_4H', 'Підтримка 4H', 'critical');
      crossing(levels.localHigh1h, 'LEVEL_CROSS_1H', 'Максимум 1H', 'warning');
      crossing(levels.localLow1h, 'LEVEL_CROSS_1H', 'Мінімум 1H', 'warning');
      crossing(levels.localHigh15m, 'LEVEL_CROSS_15M', 'Максимум 15m', 'info');
      crossing(levels.localLow15m, 'LEVEL_CROSS_15M', 'Мінімум 15m', 'info');
    }
    if (config.channelEnabled) {
      if (previousClose <= levels.channelUpper && price > levels.channelUpper) add('CHANNEL_BREAKOUT', 'risk',
        '🌊 Вихід із каналу вгору', `Закриття ${tf} вище $${formatPrice(levels.channelUpper)}.`, 'warning', 'UP');
      else if (previousClose >= levels.channelLower && price < levels.channelLower) add('CHANNEL_BREAKOUT', 'risk',
        '🌊 Вихід із каналу вниз', `Закриття ${tf} нижче $${formatPrice(levels.channelLower)}.`, 'warning', 'DOWN');
    }
    const endTime = startTime + getTimeframeMs(tf);
    const completedSource = Object.fromEntries(frames.map(frame => [frame, source[frame].filter(c =>
      normalizeKlineTimeMs(c.time) + getTimeframeMs(frame) <= endTime)])) as typeof source;
    const completedState = await calculateSurveillanceState(coin.symbol, coin.exchange, coin.marketType, config, completedSource);
    if (config.structureEnabled && completedState && levels.structureTrend !== completedState.structureTrend) add(
      'STRUCTURE_SHIFT', 'structure', `🔄 Зміна структури (${completedState.structureTrend.toUpperCase()})`,
      `Підтверджено закриттям ${tf}.`, 'critical', completedState.structureTrend);
    if (config.momentumEnabled && tf === config.momentumTf && completedState &&
        Math.abs(completedState.momentumRecentPct || 0) >= config.momentumPct) add('MOMENTUM', 'momentum',
      `⚡ Імпульс: ${completedState.momentumRecentPct}%`,
      `Рух за ${config.momentumBars} закритих свічок ${tf}.`, 'warning', completedState.momentumRecentPct! > 0 ? 'UP' : 'DOWN');
    if (config.fibonacciEnabled && levels.fib618 > 0 && Math.abs(price - levels.fib618) / levels.fib618 <= 0.0035 &&
        Math.abs(previousClose - levels.fib618) / levels.fib618 > 0.0035) add('FIBONACCI', 'level',
      '🎯 Тест Fibonacci 0.618', `Закриття ${tf} у зоні $${formatPrice(levels.fib618)}.`, 'info', String(levels.fib618));
  }

  const fresh = findSurveillanceCoinById(coin.id, coin.userId)?.coin;
  if (!fresh || fresh.isActive !== coin.isActive || JSON.stringify(fresh.config) !== JSON.stringify(config)) {
    return { coin: fresh || coin, newEvents: [] };
  }
  const allEvents = [...newEvents, ...(fresh.state?.recentEvents || [])];
  const ids = new Set<string>();
  const updatedCoin: SurveillanceCoin = { ...fresh, lastCheckedAt: new Date(now).toISOString(), state: {
    ...newState, lastProcessedCandleTimes: processed,
    lastEvent: newEvents[0] || fresh.state?.lastEvent,
    recentEvents: allEvents.filter(event => { if (ids.has(event.id)) return false; ids.add(event.id); return true; }).slice(0, 25),
  } };
  const cooldownMs = Math.max(0, config.cooldownMinutes ?? 15) * 60 * 1000;
  const lastNotified = fresh.lastNotifiedAt ? new Date(fresh.lastNotifiedAt).getTime() : 0;
  const event = newEvents.find(e => e.severity === 'critical') || newEvents.find(e => e.severity === 'warning') || newEvents[0];
  if ((event && now - lastNotified >= cooldownMs) || forceNotify) {
    const selected = event || { id: `manual_${now}`, type: 'risk' as const, title: '🛰 Ручна перевірка стану монети',
      description: 'Поточний стан отримано з обраної біржі.', severity: 'info' as const, price: newState.currentPrice, timestamp: now };
    const sent = await notificationRouter.dispatch({
      source: 'SURVEILLANCE', userId: coin.userId, coinId: coin.id, symbol: coin.symbol,
      exchange: coin.exchange, marketType: coin.marketType,
      eventType: selected.details?.notificationType || 'MANUAL_CHECK',
      eventIdentity: selected.details?.eventIdentity || selected.id,
      triggerMode: forceNotify ? 'manual' : selected.details?.triggerMode,
      htmlMessage: formatSurveillanceTelegramMessage(updatedCoin, { ...newState, currentPrice: selected.price }, selected),
      customCooldownMs: cooldownMs, forceNotify, coin: updatedCoin,
    });
    if (sent) updatedCoin.lastNotifiedAt = new Date().toISOString();
  }
  return { coin: updatedCoin, newEvents };
}

let isLoopRunning = false;

export async function checkAllUserCoins(userId: string): Promise<SurveillanceCoin[]> {
  const uid = userId && userId.trim() !== '' ? userId.trim() : 'guest';
  const list = [...(loadSurveillanceStore()[uid] || [])];
  if (list.length === 0) return [];

  for (const coin of list) {
    try {
      // #6: check-all runs with forceCheck: true (re-evaluates current levels) but forceNotify: false
      // This strictly enforces cooldown to prevent mass Telegram spam!
      const { coin: updated } = await checkCoinSurveillance(coin, { forceCheck: true, forceNotify: false });
      commitSurveillanceCheck(updated);
    } catch {}
  }

  return loadSurveillanceList(uid);
}

export function startSurveillanceMonitor(intervalMs = 25000) {
  if (isLoopRunning) return;
  isLoopRunning = true;
  console.log(`[Surveillance] 24/7 Monitor started with interval ${intervalMs}ms`);

  // Start 24/7 Realtime Surveillance Engine
  try {
    surveillanceManager.start();
  } catch (e) {
    console.error('[Surveillance] Error starting surveillanceManager:', e);
  }

  setInterval(async () => {
    try {
      const activeItems = getAllActiveSurveillanceCoins();
      if (activeItems.length === 0) return;

      for (const { userId, coin } of activeItems) {
        try {
          const { coin: updated } = await checkCoinSurveillance(coin);
          commitSurveillanceCheck(updated);
        } catch (e) {
          console.error(`[Surveillance] Failed to check coin ${coin.symbol} for user ${userId}:`, e);
        }
      }
    } catch (err) {
      console.error('[Surveillance] Error in monitor loop:', err);
    }
  }, intervalMs);
}

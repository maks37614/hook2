import fs from 'fs';
import path from 'path';
import { PriceAlert, AlertHistoryItem, ExchangeId, MarketType } from '../src/types';
import { sendTelegramMessage } from './telegramService';
import { SetupInstance } from './surveillance/types';
import { validateSetupAlertsMath } from './surveillance/setupValidation';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');
const HISTORY_FILE = path.join(DATA_DIR, 'alert_history.json');
const USER_TELEGRAM_FILE = path.join(DATA_DIR, 'user_telegram.json');
const DELETED_ALERTS_FILE = path.join(DATA_DIR, 'deleted_alerts.json');

// Ensure directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error('Failed to create server/data directory:', e);
    }
  }
}

// Format price nicely
function formatPrice(val: number): string {
  if (!val && val !== 0) return '0.00';
  if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toFixed(4);
  if (val >= 0.0001) return val.toFixed(6);
  return val.toFixed(8);
}

// In-memory caches
let alertsCache: PriceAlert[] = [];
let isAlertsLoaded = false;

let historyCache: AlertHistoryItem[] = [];
let isHistoryLoaded = false;

interface UserTelegramData {
  botToken?: string;
  chatId?: string;
  updatedAt?: string;
}
let userTelegramMap = new Map<string, UserTelegramData>();
let isUserTelegramLoaded = false;

let monitorInterval: any = null;
const deletedAlertIds = new Set<string>();
let areDeletedAlertIdsLoaded = false;
const alertIdentity = (userId: string, id: string) => `${userId}:${id}`;

function loadDeletedAlertIds() {
  if (areDeletedAlertIdsLoaded) return;
  ensureDataDir();
  if (fs.existsSync(DELETED_ALERTS_FILE)) {
    const stored: unknown = JSON.parse(fs.readFileSync(DELETED_ALERTS_FILE, 'utf-8'));
    if (!Array.isArray(stored) || stored.some(id => typeof id !== 'string')) {
      throw new Error('Invalid deleted alert persistence');
    }
    for (const id of stored) deletedAlertIds.add(id);
  }
  areDeletedAlertIdsLoaded = true;
}

function saveDeletedAlertIds() {
  ensureDataDir();
  const temporary = `${DELETED_ALERTS_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify([...deletedAlertIds]), 'utf-8');
  fs.renameSync(temporary, DELETED_ALERTS_FILE);
}

// --- User Telegram persistence ---
export function loadUserTelegram(): Map<string, UserTelegramData> {
  if (isUserTelegramLoaded) return userTelegramMap;
  try {
    ensureDataDir();
    if (fs.existsSync(USER_TELEGRAM_FILE)) {
      const raw = fs.readFileSync(USER_TELEGRAM_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      userTelegramMap = new Map(Object.entries(parsed));
    }
  } catch (err) {
    console.error('Failed to read user_telegram.json:', err);
  }
  isUserTelegramLoaded = true;
  return userTelegramMap;
}

export function saveUserTelegram(userId: string, creds: { botToken?: string; chatId?: string }): void {
  if (!userId) return;
  loadUserTelegram();
  const existing = userTelegramMap.get(userId) || {};
  const updated: UserTelegramData = {
    botToken: creds.botToken && creds.botToken.trim() ? creds.botToken.trim() : existing.botToken,
    chatId: creds.chatId && creds.chatId.trim() ? creds.chatId.trim() : existing.chatId,
    updatedAt: new Date().toISOString(),
  };
  userTelegramMap.set(userId, updated);
  try {
    ensureDataDir();
    const obj = Object.fromEntries(userTelegramMap.entries());
    fs.writeFileSync(USER_TELEGRAM_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save user_telegram.json:', err);
  }
}

export function getUserTelegram(userId?: string): UserTelegramData | undefined {
  if (!userId) return undefined;
  loadUserTelegram();
  return userTelegramMap.get(userId);
}

// --- Alerts persistence ---
export function loadAlerts(): PriceAlert[] {
  loadDeletedAlertIds();
  if (isAlertsLoaded) return alertsCache;
  try {
    ensureDataDir();
    if (fs.existsSync(ALERTS_FILE)) {
      const raw = fs.readFileSync(ALERTS_FILE, 'utf-8');
      alertsCache = JSON.parse(raw);
    } else {
      alertsCache = [];
    }
  } catch (err) {
    console.error('Failed to read alerts.json:', err);
    alertsCache = [];
  }
  isAlertsLoaded = true;
  alertsCache = alertsCache.filter(a => !deletedAlertIds.has(alertIdentity(a.userId || 'guest', a.id)));
  return alertsCache;
}

export function saveAlerts(alerts: PriceAlert[]): boolean {
  try {
    ensureDataDir();
    alertsCache = alerts;
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save alerts.json:', err);
    return false;
  }
}

// --- History persistence ---
export function loadHistory(): AlertHistoryItem[] {
  if (isHistoryLoaded) return historyCache;
  try {
    ensureDataDir();
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
      historyCache = JSON.parse(raw);
    } else {
      historyCache = [];
    }
  } catch (err) {
    console.error('Failed to read alert_history.json:', err);
    historyCache = [];
  }
  isHistoryLoaded = true;
  return historyCache;
}

export function saveHistory(items: AlertHistoryItem[]): boolean {
  try {
    ensureDataDir();
    historyCache = items;
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(items, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save alert_history.json:', err);
    return false;
  }
}

export function getAlertHistory(userId?: string): AlertHistoryItem[] {
  if (!userId || userId === 'guest') return [];
  const all = loadHistory();
  return all.filter((h) => h.userId === userId);
}

export function addHistoryItem(item: AlertHistoryItem): void {
  const history = loadHistory();
  history.unshift(item);
  // Cap history at 500 records to maintain high performance
  if (history.length > 500) {
    history.length = 500;
  }
  saveHistory(history);
}

export function clearAlertHistory(userId?: string): number {
  if (!userId || userId === 'guest') return 0;
  const history = loadHistory();
  const remaining = history.filter((h) => h.userId !== userId);
  const clearedCount = history.length - remaining.length;
  saveHistory(remaining);
  return clearedCount;
}

export function deleteHistoryItem(id: string, userId?: string): boolean {
  if (!userId || userId === 'guest') return false;
  const history = loadHistory();
  const filtered = history.filter((h) => !(h.id === id && h.userId === userId));
  if (filtered.length !== history.length) {
    saveHistory(filtered);
    return true;
  }
  return false;
}

// Get all alerts (strictly filtered by user, never leaked to guests)
export function getAllAlerts(userId?: string): PriceAlert[] {
  if (!userId || userId === 'guest') return [];
  const all = loadAlerts();
  return all.filter((a) => a.userId === userId);
}

// Create alert
export function createAlert(
  data: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered' | 'isActive'> & {
    id?: string;
    createdAt?: number;
    isActive?: boolean;
    userId?: string;
    telegramBotToken?: string;
    telegramChatId?: string;
  }
): PriceAlert {
  const alerts = loadAlerts();
  const userId = data.userId || 'guest';

  // If credentials provided, cache them for this user
  if (data.telegramBotToken || data.telegramChatId) {
    saveUserTelegram(userId, {
      botToken: data.telegramBotToken,
      chatId: data.telegramChatId,
    });
  }

  const userTg = getUserTelegram(userId);
  const effectiveBotToken = data.telegramBotToken || userTg?.botToken;
  const effectiveChatId = data.telegramChatId || userTg?.chatId;

  const alertId = data.id || `alert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  if (deletedAlertIds.has(alertIdentity(userId, alertId))) throw new Error('Сповіщення вже видалено');
  const existing = alerts.find(a => a.id === alertId && a.userId === userId);
  if (existing) return existing;

  const newAlert: PriceAlert = {
    id: alertId,
    userId,
    symbol: data.symbol.toUpperCase().replace('/', '').trim(),
    exchange: data.exchange,
    marketType: data.marketType,
    targetPrice: Number(data.targetPrice),
    condition: data.condition,
    note: data.note ? String(data.note).trim() : undefined,
    formationName: data.formationName ? String(data.formationName).trim() : undefined,
    levelType: data.levelType || 'custom',
    createdAt: data.createdAt || Date.now(),
    isActive: data.isActive !== undefined ? data.isActive : true,
    triggered: false,
    telegramBotToken: effectiveBotToken,
    telegramChatId: effectiveChatId,
  };

  alerts.unshift(newAlert);
  saveAlerts(alerts);
  return newAlert;
}

// Create batch of alerts (e.g. 3 levels: Entry, Take-Profit, Stop-Loss)
export function createAlertsBatch(
  userId: string,
  alertsList: Array<
    Omit<PriceAlert, 'id' | 'createdAt' | 'triggered' | 'isActive'> & {
      id?: string;
      isActive?: boolean;
      telegramBotToken?: string;
      telegramChatId?: string;
    }
  >,
  telegramBotToken?: string,
  telegramChatId?: string
): PriceAlert[] {
  const alerts = loadAlerts();

  if (telegramBotToken || telegramChatId) {
    saveUserTelegram(userId, {
      botToken: telegramBotToken,
      chatId: telegramChatId,
    });
  }

  const userTg = getUserTelegram(userId);
  const effectiveBotToken = telegramBotToken || userTg?.botToken;
  const effectiveChatId = telegramChatId || userTg?.chatId;

  const createdAlerts: PriceAlert[] = [];
  let index = 0;

  for (const item of alertsList) {
    const alertId = item.id || `alert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${index++}`;
    if (deletedAlertIds.has(alertIdentity(userId, alertId))) continue;
    const existing = alerts.find(a => a.id === alertId && a.userId === userId);
    if (existing) {
      createdAlerts.push(existing);
      continue;
    }
    const newAlert: PriceAlert = {
      id: alertId,
      userId,
      symbol: item.symbol.toUpperCase().replace('/', '').trim(),
      exchange: item.exchange,
      marketType: item.marketType,
      targetPrice: Number(item.targetPrice),
      condition: item.condition,
      note: item.note ? String(item.note).trim() : undefined,
      formationName: item.formationName ? String(item.formationName).trim() : undefined,
      levelType: item.levelType || 'custom',
      createdAt: Date.now() + index,
      isActive: item.isActive !== undefined ? item.isActive : true,
      triggered: false,
      telegramBotToken: item.telegramBotToken || effectiveBotToken,
      telegramChatId: item.telegramChatId || effectiveChatId,
    };

    alerts.unshift(newAlert);
    createdAlerts.push(newAlert);
  }

  saveAlerts(alerts);
  return createdAlerts;
}

/**
 * Creates an atomic group of 3 Price Alerts for a setup:
 * setupId
 *  ├── ENTRY
 *  ├── TARGET
 *  └── STOP
 *
 * Mathematically validates before creation:
 * For LONG:  STOP < ENTRY < TARGET
 * For SHORT: TARGET < ENTRY < STOP
 */
export function createSetupAlertsGroup(
  userId: string,
  setup: SetupInstance,
  currentPrice?: number,
  autoActivate = true
): { success: boolean; alerts?: PriceAlert[]; error?: string } {
  const mathValidation = validateSetupAlertsMath(setup);
  if (!mathValidation.valid) {
    return {
      success: false,
      error: mathValidation.reason || 'Mathematical validation failed for setup levels',
    };
  }

  const { entry, target, stop } = mathValidation;
  const curPrice = currentPrice || entry;

  // ENTRY:
  // For LONG: if currentPrice > entry, triggers when dropping to entry ('lte'); if below, when reclaiming ('gte')
  // For SHORT: if currentPrice < entry, triggers when bouncing to entry ('gte'); if above, when dropping ('lte')
  const entryCondition =
    setup.direction === 'LONG'
      ? curPrice >= entry
        ? 'lte'
        : 'gte'
      : curPrice <= entry
      ? 'gte'
      : 'lte';

  // TARGET:
  // For LONG: triggers when price rises to or exceeds target ('gte')
  // For SHORT: triggers when price falls to or drops below target ('lte')
  const targetCondition = setup.direction === 'LONG' ? 'gte' : 'lte';

  // STOP:
  // For LONG: triggers when price falls to or drops below stop ('lte')
  // For SHORT: triggers when price rises to or exceeds stop ('gte')
  const stopCondition = setup.direction === 'LONG' ? 'lte' : 'gte';

  const userTg = getUserTelegram(userId);
  const now = Date.now();

  const alertsToCreate: PriceAlert[] = [
    {
      id: `${setup.id}_ENTRY`,
      userId,
      setupId: setup.id,
      setupRole: 'ENTRY',
      symbol: setup.symbol.toUpperCase().replace('/', '').trim(),
      exchange: setup.exchange,
      marketType: setup.marketType,
      targetPrice: Number(entry),
      condition: entryCondition,
      levelType: 'entry',
      formationName: setup.type,
      note: `[Setup ${setup.direction}] Точка входу (${setup.type} ${setup.timeframe})`,
      createdAt: now,
      isActive: autoActivate,
      triggered: false,
      telegramBotToken: userTg?.botToken,
      telegramChatId: userTg?.chatId,
    },
    {
      id: `${setup.id}_TARGET`,
      userId,
      setupId: setup.id,
      setupRole: 'TARGET',
      symbol: setup.symbol.toUpperCase().replace('/', '').trim(),
      exchange: setup.exchange,
      marketType: setup.marketType,
      targetPrice: Number(target),
      condition: targetCondition,
      levelType: 'target',
      formationName: setup.type,
      note: `[Setup ${setup.direction}] Ціль Take-Profit (TP) +${Math.abs(((target - entry) / entry) * 100).toFixed(1)}%`,
      createdAt: now + 1,
      isActive: autoActivate,
      triggered: false,
      telegramBotToken: userTg?.botToken,
      telegramChatId: userTg?.chatId,
    },
    {
      id: `${setup.id}_STOP`,
      userId,
      setupId: setup.id,
      setupRole: 'STOP',
      symbol: setup.symbol.toUpperCase().replace('/', '').trim(),
      exchange: setup.exchange,
      marketType: setup.marketType,
      targetPrice: Number(stop),
      condition: stopCondition,
      levelType: 'stop_loss',
      formationName: setup.type,
      note: `[Setup ${setup.direction}] Скасування Stop-Loss (SL) -${Math.abs(((entry - stop) / entry) * 100).toFixed(1)}%`,
      createdAt: now + 2,
      isActive: autoActivate,
      triggered: false,
      telegramBotToken: userTg?.botToken,
      telegramChatId: userTg?.chatId,
    },
  ];

  const alerts = loadAlerts();
  for (const newAlert of alertsToCreate) {
    if (deletedAlertIds.has(alertIdentity(userId, newAlert.id))) continue;
    const existingIdx = alerts.findIndex((a) => a.id === newAlert.id && a.userId === userId);
    if (existingIdx >= 0) {
      // Repeated analysis must not rearm a fired setup or undo a manual pause.
      Object.assign(newAlert, alerts[existingIdx]);
    } else {
      alerts.unshift(newAlert);
    }
  }

  saveAlerts(alerts);
  return { success: true, alerts: alertsToCreate.filter(a => !deletedAlertIds.has(alertIdentity(userId, a.id))) };
}

// Sync user alerts batch from client/Firestore with smart merge
export function syncUserAlerts(
  userId: string,
  userAlerts: PriceAlert[],
  telegramBotToken?: string,
  telegramChatId?: string
): PriceAlert[] {
  if (telegramBotToken || telegramChatId) {
    saveUserTelegram(userId, {
      botToken: telegramBotToken,
      chatId: telegramChatId,
    });
  }

  const all = loadAlerts();
  const userTg = getUserTelegram(userId);
  const effectiveBotToken = telegramBotToken || userTg?.botToken;
  const effectiveChatId = telegramChatId || userTg?.chatId;

  // Map of existing alerts on server for this user
  const existingUserAlerts = new Map<string, PriceAlert>();
  for (const a of all) {
    if (a.userId === userId) {
      existingUserAlerts.set(a.id, a);
    }
  }

  // Merge incoming alerts
  const mergedUserAlerts: PriceAlert[] = [];
  const processedIds = new Set<string>();

  for (const incoming of userAlerts) {
    if (deletedAlertIds.has(alertIdentity(userId, incoming.id))) continue;
    processedIds.add(incoming.id);
    const existing = existingUserAlerts.get(incoming.id);

    // CRITICAL: If the alert already triggered on server while user was offline,
    // preserve the triggered status and timestamps so it is never overwritten!
    if (existing && existing.triggered) {
      mergedUserAlerts.push({
        ...incoming,
        userId,
        isActive: false,
        triggered: true,
        triggeredAt: existing.triggeredAt,
        triggeredPrice: existing.triggeredPrice,
        telegramBotToken: effectiveBotToken || incoming.telegramBotToken || existing.telegramBotToken,
        telegramChatId: effectiveChatId || incoming.telegramChatId || existing.telegramChatId,
      });
    } else {
      mergedUserAlerts.push({
        ...incoming,
        userId,
        // Changes to the active state use the explicit toggle endpoint.
        // A delayed Firestore/browser snapshot must not undo a server pause.
        isActive: existing?.isActive ?? incoming.isActive,
        telegramBotToken: effectiveBotToken || incoming.telegramBotToken || existing?.telegramBotToken,
        telegramChatId: effectiveChatId || incoming.telegramChatId || existing?.telegramChatId,
      });
    }
  }

  // Absence in a stale browser snapshot is not a deletion. Deletions use the DELETE endpoint.
  for (const [id, existing] of existingUserAlerts.entries()) {
    if (!processedIds.has(id)) {
      mergedUserAlerts.push({
        ...existing,
        telegramBotToken: effectiveBotToken || existing.telegramBotToken,
        telegramChatId: effectiveChatId || existing.telegramChatId,
      });
    }
  }

  const otherAlerts = all.filter((a) => a.userId !== userId);
  const updatedAll = [...mergedUserAlerts, ...otherAlerts];
  saveAlerts(updatedAll);

  return mergedUserAlerts;
}

// Delete alert
export function deleteAlert(id: string, userId?: string): boolean {
  if (!userId || userId === 'guest') return false;
  const alerts = loadAlerts();
  const initialCount = alerts.length;
  // Record deletion even when it arrives before a delayed create request.
  deletedAlertIds.add(alertIdentity(userId, id));
  saveDeletedAlertIds();
  const filtered = alerts.filter(a => !(a.id === id && a.userId === userId));

  if (filtered.length !== initialCount) {
    saveAlerts(filtered);
    return true;
  }
  return false;
}

// Toggle alert active state
export function toggleAlert(id: string, userId?: string, isActive?: boolean): PriceAlert | null {
  if (!userId || userId === 'guest') return null;
  const alerts = loadAlerts();
  const alert = alerts.find((a) => a.id === id && a.userId === userId);
  if (alert) {
    alert.isActive = isActive ?? !alert.isActive;
    // If reactivating a triggered alert, reset triggered status
    if (alert.isActive && alert.triggered) {
      alert.triggered = false;
      alert.triggeredAt = undefined;
      alert.triggeredPrice = undefined;
    }
    saveAlerts(alerts);
    return alert;
  }
  return null;
}

// Clear triggered alerts
export function clearTriggeredAlerts(userId?: string): number {
  if (!userId || userId === 'guest') return 0;
  const alerts = loadAlerts();
  const remaining = alerts.filter((a) => {
    if (!a.triggered) return true;
    if (a.userId !== userId) return true;
    return false;
  });
  const clearedCount = alerts.length - remaining.length;
  for (const removed of alerts) {
    if (!remaining.includes(removed)) deletedAlertIds.add(alertIdentity(removed.userId || 'guest', removed.id));
  }
  if (clearedCount > 0) saveDeletedAlertIds();
  saveAlerts(remaining);
  return clearedCount;
}

// HTML escaping helper for Telegram
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Fetch single ticker price from exchange with robust cross-exchange fallbacks
async function fetchCurrentPrice(exchange: ExchangeId, market: MarketType, symbol: string): Promise<number | null> {
  const cleanSymbol = symbol.toUpperCase().replace('/', '').trim();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  };

  const urls = exchange === 'binance'
    ? market === 'futures'
      ? [`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${cleanSymbol}`]
      : [`https://data-api.binance.vision/api/v3/ticker/price?symbol=${cleanSymbol}`,
         `https://api.binance.com/api/v3/ticker/price?symbol=${cleanSymbol}`]
    : [`https://api.bybit.com/v5/market/tickers?category=${market === 'futures' ? 'linear' : 'spot'}&symbol=${cleanSymbol}`,
       `https://api.bytick.com/v5/market/tickers?category=${market === 'futures' ? 'linear' : 'spot'}&symbol=${cleanSymbol}`];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(3500) });
      if (!res.ok) continue;
      const data = await res.json();
      const price = Number(exchange === 'binance' ? data.price : data?.result?.list?.[0]?.lastPrice);
      if (Number.isFinite(price) && price > 0) return price;
    } catch {}
  }

  return null;
}

// Check active alerts against live prices
let checkInFlight = false;
export async function checkAlertsOnce() {
  if (checkInFlight) return;
  checkInFlight = true;
  try {
    await checkAlertsInternal();
  } finally {
    checkInFlight = false;
  }
}

async function checkAlertsInternal() {
  const alerts = loadAlerts();
  const activeAlerts = alerts.filter((a) => a.isActive && !a.triggered);
  if (activeAlerts.length === 0) return;

  // Group by unique (exchange, market, symbol)
  const uniqueKeys = new Map<string, { exchange: ExchangeId; market: MarketType; symbol: string }>();
  for (const a of activeAlerts) {
    const key = `${a.exchange}:${a.marketType}:${a.symbol}`;
    if (!uniqueKeys.has(key)) {
      uniqueKeys.set(key, { exchange: a.exchange, market: a.marketType, symbol: a.symbol });
    }
  }

  // Fetch prices in parallel
  const priceMap = new Map<string, number>();
  await Promise.all(
    Array.from(uniqueKeys.entries()).map(async ([key, item]) => {
      const p = await fetchCurrentPrice(item.exchange, item.market, item.symbol);
      if (p !== null && !isNaN(p)) {
        priceMap.set(key, p);
      }
    })
  );

  let updated = false;

  for (const candidate of activeAlerts) {
    const alert = loadAlerts().find((a) => a.id === candidate.id && a.userId === candidate.userId);
    if (!alert || !alert.isActive || alert.triggered) continue;
    const key = `${alert.exchange}:${alert.marketType}:${alert.symbol}`;
    const currentPrice = priceMap.get(key);
    if (currentPrice === undefined) continue;

    let isTriggered = false;
    if (alert.condition === 'gte' && currentPrice >= alert.targetPrice) {
      isTriggered = true;
    } else if (alert.condition === 'lte' && currentPrice <= alert.targetPrice) {
      isTriggered = true;
    }

    if (isTriggered) {
      alert.triggered = true;
      alert.isActive = false;
      alert.triggeredAt = Date.now();
      alert.triggeredPrice = currentPrice;
      updated = true;
      saveAlerts(loadAlerts());

      console.log(`[ALERT TRIGGERED] ${alert.symbol} target: ${alert.targetPrice}, live price: ${currentPrice}, condition: ${alert.condition}`);

      // Construct rich Telegram message in Ukrainian with HTML escaping
      const timeStr = new Date(alert.triggeredAt).toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv' });
      const dateStr = new Date(alert.triggeredAt).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' });

      let levelTitle = 'Цільовий рівень';
      if (alert.levelType === 'entry') levelTitle = 'Рівень входу';
      else if (alert.levelType === 'target') levelTitle = 'Тейк-профіт (Ціль)';
      else if (alert.levelType === 'stop_loss') levelTitle = 'Стоп-лосс';

      const conditionLabel = alert.condition === 'gte'
        ? 'Ціна піднялась або досягла рівня (≥)'
        : 'Ціна опустилась або досягла рівня (≤)';

      const safeSymbol = escapeHtml(alert.symbol);
      const safeFormation = alert.formationName ? escapeHtml(alert.formationName) : '';
      const safeNote = alert.note ? escapeHtml(alert.note) : '';

      const message = `🚨 <b>SIGNALHOOK: СПОВІЩЕННЯ ЦІНИ!</b>\n\n` +
        `🪙 <b>${safeSymbol}</b> (${alert.exchange.toUpperCase()} ${alert.marketType.toUpperCase()})\n` +
        `💵 <b>Поточна ціна:</b> $${formatPrice(currentPrice)}\n` +
        `🎯 <b>Ціль сповіщення:</b> $${formatPrice(alert.targetPrice)}\n` +
        `📊 <b>Умова:</b> ${conditionLabel}\n` +
        (safeFormation ? `📈 <b>Формація:</b> ${safeFormation}\n` : '') +
        (alert.levelType ? `🏷 <b>Рівень:</b> ${levelTitle}\n` : '') +
        (safeNote ? `📝 <b>Коментар:</b> ${safeNote}\n` : '') +
        `\n⏰ <i>Час спрацювання: ${dateStr} ${timeStr} (Київ)</i>`;

      // Determine effective telegram botToken and chatId
      const userTg = getUserTelegram(alert.userId);
      const effectiveBotToken = alert.telegramBotToken || userTg?.botToken;
      const effectiveChatId = alert.telegramChatId || userTg?.chatId;

      let telegramSent = false;
      let telegramError: string | undefined = undefined;

      try {
        const sendRes = await sendTelegramMessage(message, {
          botToken: effectiveBotToken,
          chatId: effectiveChatId,
        });
        if (sendRes.success) {
          telegramSent = true;
          console.log(`[ALERT DISPATCHED] Successfully sent Telegram alert for ${alert.symbol} to user: ${alert.userId || 'default'}`);
        } else {
          telegramError = sendRes.error;
          console.warn(`[ALERT DISPATCH WARNING] Telegram notification for ${alert.symbol} was not delivered:`, sendRes.error);
        }
      } catch (dispatchErr: any) {
        telegramError = dispatchErr?.message || 'Помилка надсилання';
        console.error(`[ALERT DISPATCH ERROR] Failed to send Telegram alert for ${alert.symbol}:`, dispatchErr);
      }

      // Record in Alert History
      const historyItem: AlertHistoryItem = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        userId: alert.userId || 'guest',
        alertId: alert.id,
        symbol: alert.symbol,
        exchange: alert.exchange,
        marketType: alert.marketType,
        condition: alert.condition,
        targetPrice: alert.targetPrice,
        triggeredPrice: currentPrice,
        formationName: alert.formationName,
        levelType: alert.levelType,
        note: alert.note,
        triggeredAt: alert.triggeredAt,
        telegramSent,
        telegramError,
        createdAt: new Date().toISOString(),
      };
      addHistoryItem(historyItem);
    }
  }

  if (updated) {
    saveAlerts(loadAlerts());
  }
}

// Start background monitor loop
export function startAlertMonitor(intervalMs: number = 6000) {
  if (monitorInterval) return;
  loadAlerts();
  loadHistory();
  loadUserTelegram();
  monitorInterval = setInterval(() => {
    checkAlertsOnce().catch((err) => {
      console.error('Error during alert check iteration:', err);
    });
  }, intervalMs);
  console.log(`Telegram price alert monitor started (interval: ${intervalMs}ms)`);
}

// Stop monitor
export function stopAlertMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

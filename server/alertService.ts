import fs from 'fs';
import path from 'path';
import { PriceAlert, AlertHistoryItem, ExchangeId, MarketType } from '../src/types';
import { sendTelegramMessage } from './telegramService';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');
const HISTORY_FILE = path.join(DATA_DIR, 'alert_history.json');
const USER_TELEGRAM_FILE = path.join(DATA_DIR, 'user_telegram.json');

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
  const all = loadHistory();
  if (!userId) return all;
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
  const history = loadHistory();
  const remaining = history.filter((h) => {
    if (userId && h.userId && h.userId !== userId) return true;
    return false;
  });
  const clearedCount = history.length - remaining.length;
  saveHistory(remaining);
  return clearedCount;
}

export function deleteHistoryItem(id: string, userId?: string): boolean {
  const history = loadHistory();
  const filtered = history.filter((h) => {
    if (h.id === id) {
      if (!userId || !h.userId || h.userId === 'guest' || h.userId === userId) {
        return false;
      }
    }
    return true;
  });
  if (filtered.length !== history.length) {
    saveHistory(filtered);
    return true;
  }
  return false;
}

// Get all alerts (optionally filtered by user)
export function getAllAlerts(userId?: string): PriceAlert[] {
  const all = loadAlerts();
  if (!userId) return all;
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

  const existingIdx = alerts.findIndex((a) => a.id === alertId);
  if (existingIdx >= 0) {
    alerts[existingIdx] = newAlert;
  } else {
    alerts.unshift(newAlert);
  }
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

    const existingIdx = alerts.findIndex((a) => a.id === alertId);
    if (existingIdx >= 0) {
      alerts[existingIdx] = newAlert;
    } else {
      alerts.unshift(newAlert);
    }
    createdAlerts.push(newAlert);
  }

  saveAlerts(alerts);
  return createdAlerts;
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
        telegramBotToken: effectiveBotToken || incoming.telegramBotToken || existing?.telegramBotToken,
        telegramChatId: effectiveChatId || incoming.telegramChatId || existing?.telegramChatId,
      });
    }
  }

  // Only preserve alerts on server if they were triggered while the user was offline,
  // so the triggered event is never lost. Any untriggered alerts removed by the user stay deleted!
  for (const [id, existing] of existingUserAlerts.entries()) {
    if (!processedIds.has(id) && existing.triggered) {
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
  const alerts = loadAlerts();
  const initialCount = alerts.length;
  const filtered = alerts.filter((a) => {
    if (a.id === id) {
      // If a userId is specified, ensure it belongs to this user or is unassigned
      if (!userId || !a.userId || a.userId === 'guest' || a.userId === userId) {
        return false; // Remove
      }
    }
    return true; // Keep
  });

  if (filtered.length !== initialCount) {
    saveAlerts(filtered);
    return true;
  }
  return false;
}

// Toggle alert active state
export function toggleAlert(id: string, userId?: string): PriceAlert | null {
  const alerts = loadAlerts();
  const alert = alerts.find((a) => a.id === id && (!userId || !a.userId || a.userId === userId));
  if (alert) {
    alert.isActive = !alert.isActive;
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
  const alerts = loadAlerts();
  const remaining = alerts.filter((a) => {
    if (!a.triggered) return true;
    if (userId && a.userId && a.userId !== userId) return true; // keep triggered alerts of other users
    return false;
  });
  const clearedCount = alerts.length - remaining.length;
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
  
  // 1. Try primary request
  try {
    if (exchange === 'binance') {
      const url = market === 'futures'
        ? `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${cleanSymbol}`
        : `https://api.binance.com/api/v3/ticker/price?symbol=${cleanSymbol}`;

      const res = await fetch(url, { headers: { 'User-Agent': 'CryptoPatternScreener/1.0' }, signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        const p = parseFloat(data.price);
        if (!isNaN(p) && p > 0) return p;
      }
    } else {
      // Bybit
      const category = market === 'futures' ? 'linear' : 'spot';
      const url = `https://api.bybit.com/v5/market/tickers?category=${category}&symbol=${cleanSymbol}`;

      const res = await fetch(url, { headers: { 'User-Agent': 'CryptoPatternScreener/1.0' }, signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        const list = data?.result?.list;
        if (Array.isArray(list) && list.length > 0 && list[0].lastPrice) {
          const p = parseFloat(list[0].lastPrice);
          if (!isNaN(p) && p > 0) return p;
        }
      }
    }
  } catch (err) {
    // Primary failed, proceed to fallback
  }

  // 2. Try secondary exchange / alternate market fallback
  try {
    if (exchange === 'binance') {
      const bybitRes = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${cleanSymbol}`, { signal: AbortSignal.timeout(3000) });
      if (bybitRes.ok) {
        const bybitData = await bybitRes.json();
        const list = bybitData?.result?.list;
        if (Array.isArray(list) && list.length > 0 && list[0].lastPrice) {
          const p = parseFloat(list[0].lastPrice);
          if (!isNaN(p) && p > 0) return p;
        }
      }
    } else {
      const binanceRes = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${cleanSymbol}`, { signal: AbortSignal.timeout(3000) });
      if (binanceRes.ok) {
        const binData = await binanceRes.json();
        const p = parseFloat(binData.price);
        if (!isNaN(p) && p > 0) return p;
      }
    }
  } catch (e) {
    // Silent fallback fail
  }

  return null;
}

// Check active alerts against live prices
export async function checkAlertsOnce() {
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

  for (const alert of activeAlerts) {
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
    saveAlerts(alerts);
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

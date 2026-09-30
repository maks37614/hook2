import { ExchangeId, MarketType, UnifiedLinkingSettings, TerminalTarget } from '../types';

export type { UnifiedLinkingSettings, TerminalTarget };

export const DEFAULT_UNIFIED_LINKING_SETTINGS: UnifiedLinkingSettings = {
  activeTarget: 'vataga',
  autoSwitchOnClick: true,
  soundFeedback: true,
  metascalp: {
    enabled: true,
    port: 17845,
    binding: '001',
  },
  vataga: {
    enabled: true,
    port: 17840,
    binding: '1',
  },
  tiger: {
    enabled: true,
    port: 9898,
    binding: '1',
  },
};

const STORAGE_KEY = 'crypto_screener_unified_linking_settings';

export function getStoredUnifiedLinkingSettings(userId?: string): UnifiedLinkingSettings {
  try {
    const key = userId ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY;
    const saved = localStorage.getItem(key) || (userId ? localStorage.getItem(STORAGE_KEY) : null);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_UNIFIED_LINKING_SETTINGS,
        ...parsed,
        metascalp: { ...DEFAULT_UNIFIED_LINKING_SETTINGS.metascalp, ...(parsed.metascalp || {}) },
        vataga: { ...DEFAULT_UNIFIED_LINKING_SETTINGS.vataga, ...(parsed.vataga || {}) },
        tiger: { ...DEFAULT_UNIFIED_LINKING_SETTINGS.tiger, ...(parsed.tiger || {}) },
      };
    }
  } catch (e) {
    console.error('Failed to load unified linking settings:', e);
  }
  return DEFAULT_UNIFIED_LINKING_SETTINGS;
}

export function saveStoredUnifiedLinkingSettings(settings: UnifiedLinkingSettings, userId?: string): void {
  try {
    const key = userId ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(settings));
    if (userId) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch (e) {
    console.error('Failed to save unified linking settings:', e);
  }
}

/**
 * Format symbol for MetaScalp:
 * Format: EXCHANGE:SYMBOL.p for futures, or EXCHANGE:SYMBOL for spot
 */
export function formatMetaScalpTicker(symbol: string, exchange: ExchangeId, marketType: MarketType): string {
  const ex = exchange.toUpperCase();
  const cleanSymbol = symbol.toUpperCase().replace('/', '');
  const isFutures = marketType === 'futures';
  return `${ex}:${cleanSymbol}${isFutures ? '.p' : ''}`;
}

/**
 * Format symbol for Vataga (EasyScalp / Vataga.terminal):
 * Supports both EXCHANGE:SYMBOL.p for futures and EXCHANGE:SYMBOL
 */
export function formatVatagaTicker(symbol: string, exchange: ExchangeId, marketType: MarketType): string {
  const ex = exchange.toUpperCase();
  const cleanSymbol = symbol.toUpperCase().replace('/', '');
  const isFutures = marketType === 'futures';
  return `${ex}:${cleanSymbol}${isFutures ? '.p' : ''}`;
}

/**
 * Format symbol for TigerTrade:
 * Format: EXCHANGE:SYMBOL (e.g. BINANCE:BTCUSDT)
 */
export function formatTigerTicker(symbol: string, exchange: ExchangeId, marketType: MarketType): string {
  const cleanSymbol = symbol.toUpperCase().replace('/', '');
  return `${exchange.toUpperCase()}:${cleanSymbol}`;
}

/**
 * Check if a local port is responding on 127.0.0.1 or localhost
 * Uses mode 'no-cors' so even without CORS headers, open TCP sockets resolve immediately.
 */
export async function pingLocalPort(port: number, timeoutMs = 800): Promise<boolean> {
  const hosts = ['127.0.0.1', 'localhost'];
  const paths = ['/api/change-ticker', '/api/ticker', '/ping', '/'];

  const checkSingle = async (host: string, path: string): Promise<boolean> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetch(`http://${host}:${port}${path}`, {
        method: 'GET',
        mode: 'no-cors',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return true;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  };

  const probes: Promise<boolean>[] = [];
  for (const host of hosts) {
    for (const path of paths) {
      probes.push(checkSingle(host, path));
    }
  }

  const results = await Promise.allSettled(probes);
  return results.some((r) => r.status === 'fulfilled' && r.value === true);
}

/**
 * Automatically scans candidate ports to find an active Vataga instance
 */
export async function findActiveVatagaPort(preferredPort = 17840): Promise<number | null> {
  const candidatePorts = [preferredPort, 17840, 17845, 17841, 17846, 17842, 17847, 17848, 17849, 17850];
  const uniquePorts = Array.from(new Set(candidatePorts));

  if (await pingLocalPort(preferredPort, 400)) {
    return preferredPort;
  }

  const checks = uniquePorts.map(async (p) => {
    const isOnline = await pingLocalPort(p, 400);
    return isOnline ? p : null;
  });

  const results = await Promise.all(checks);
  return results.find((p) => p !== null) || null;
}

/**
 * Automatically scans candidate ports to find an active MetaScalp instance
 */
export async function findActiveMetaScalpPort(preferredPort = 17845): Promise<number | null> {
  const candidatePorts = [preferredPort, 17845, 17846, 17847, 17848, 17849, 17850, 17840];
  const uniquePorts = Array.from(new Set(candidatePorts));

  if (await pingLocalPort(preferredPort, 400)) {
    return preferredPort;
  }

  const checks = uniquePorts.map(async (p) => {
    const isOnline = await pingLocalPort(p, 400);
    return isOnline ? p : null;
  });

  const results = await Promise.all(checks);
  return results.find((p) => p !== null) || null;
}

export interface TerminalSendResult {
  terminal: 'metascalp' | 'vataga' | 'tiger';
  name: string;
  success: boolean;
  port: number;
  binding: string;
  ticker: string;
  message: string;
}

export interface UnifiedLinkingResult {
  success: boolean;
  target: TerminalTarget;
  results: TerminalSendResult[];
  copiedToClipboard: boolean;
  summaryMessage: string;
  primaryTicker: string;
}

/**
 * Robust, high-speed dispatcher that sends to a local desktop terminal
 * 1. Bypasses CORS preflight using text/plain and no-cors mode
 * 2. Uses navigator.sendBeacon for instant non-blocking delivery
 * 3. Probes standard CORS and query parameters concurrently
 */
async function trySendToLocalEndpoint(
  host: string,
  port: number,
  endpoint: string,
  payload: any,
  timeoutMs = 700
): Promise<boolean> {
  const jsonStr = JSON.stringify(payload);
  const url = `http://${host}:${port}${endpoint}`;

  // 1. SendBeacon: Instant background transmission without CORS preflight
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([jsonStr], { type: 'text/plain;charset=UTF-8' });
      navigator.sendBeacon(url, blob);
    }
  } catch {}

  // 2. Fetch POST with text/plain (no-cors: browser sends POST immediately without OPTIONS preflight)
  const noCorsPost = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: jsonStr,
        mode: 'no-cors',
        signal: controller.signal,
      });
      clearTimeout(timer);
      return true;
    } catch {
      clearTimeout(timer);
      return false;
    }
  })();

  // 3. Fetch POST with application/json (standard CORS for servers with headers)
  const corsPost = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonStr,
        mode: 'cors',
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok || res.status === 200 || res.status === 204;
    } catch {
      clearTimeout(timer);
      return false;
    }
  })();

  // 4. Fetch GET with query parameters (for terminals/bridges listening on GET)
  const getQuery = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const params = new URLSearchParams({
        ticker: String(payload.ticker || ''),
        symbol: String(payload.symbol || ''),
        exchange: String(payload.exchange || ''),
        market: String(payload.market || ''),
        binding: String(payload.binding || ''),
        group: String(payload.group || ''),
      }).toString();
      await fetch(`${url}?${params}`, {
        method: 'GET',
        mode: 'no-cors',
        signal: controller.signal,
      });
      clearTimeout(timer);
      return true;
    } catch {
      clearTimeout(timer);
      return false;
    }
  })();

  const results = await Promise.allSettled([noCorsPost, corsPost, getQuery]);
  return results.some((r) => r.status === 'fulfilled' && r.value === true);
}

/**
 * Sends ticker to MetaScalp instance with instant concurrent dispatch
 */
async function sendToMetaScalpEndpoint(
  symbol: string,
  exchange: ExchangeId,
  marketType: MarketType,
  port: number,
  binding: string
): Promise<TerminalSendResult> {
  const cleanSymbol = symbol.toUpperCase().replace('/', '');
  const exLower = exchange.toLowerCase();
  const exUpper = exchange.toUpperCase();
  const isFutures = marketType === 'futures';
  const ticker = `${exUpper}:${cleanSymbol}${isFutures ? '.p' : ''}`;
  const bindingStr = String(binding || '001');

  const payload = {
    ticker,
    exchange: exLower,
    exchangeUpper: exUpper,
    market: isFutures ? 'futures' : 'spot',
    marketType: isFutures ? 'futures' : 'spot',
    symbol: cleanSymbol,
    binding: bindingStr,
    group: bindingStr,
    linkGroup: bindingStr,
  };

  const endpoints = ['/api/change-ticker', '/change-ticker', '/api/ticker'];
  const candidatePorts = Array.from(new Set([port, 17845, 17846, 17847, 17848, 17840]));
  const hosts = ['127.0.0.1', 'localhost'];

  const attempts: Promise<{ port: number; success: boolean }>[] = [];

  for (const p of candidatePorts) {
    for (const ep of endpoints) {
      for (const h of hosts) {
        attempts.push(
          (async () => {
            const ok = await trySendToLocalEndpoint(h, p, ep, payload, 600);
            return { port: p, success: ok };
          })()
        );
      }
    }
  }

  const results = await Promise.allSettled(attempts);
  const successItem = results.find(
    (r) => r.status === 'fulfilled' && r.value.success
  ) as PromiseFulfilledResult<{ port: number; success: boolean }> | undefined;

  if (successItem && successItem.value.success) {
    return {
      terminal: 'metascalp',
      name: 'MetaScalp',
      success: true,
      port: successItem.value.port,
      binding: bindingStr,
      ticker,
      message: `Передано в MetaScalp (Група ${bindingStr}, порт ${successItem.value.port})`,
    };
  }

  return {
    terminal: 'metascalp',
    name: 'MetaScalp',
    success: false,
    port,
    binding: bindingStr,
    ticker,
    message: `MetaScalp не відповів на 127.0.0.1:${port}`,
  };
}

/**
 * Sends ticker to Vataga (EasyScalp / Vataga.terminal) instance
 * Fast, instant, multi-port, multi-endpoint concurrent delivery
 */
async function sendToVatagaEndpoint(
  symbol: string,
  exchange: ExchangeId,
  marketType: MarketType,
  port: number,
  binding: string
): Promise<TerminalSendResult> {
  const cleanSymbol = symbol.toUpperCase().replace('/', '');
  const exUpper = exchange.toUpperCase();
  const exLower = exchange.toLowerCase();
  const isFutures = marketType === 'futures';
  const tickerWithP = `${exUpper}:${cleanSymbol}${isFutures ? '.p' : ''}`;
  const tickerPlain = `${exUpper}:${cleanSymbol}`;
  const bindingStr = String(binding || '1');
  const bindingPadded = bindingStr.padStart(3, '0');

  // Rich multi-format payload compatible with any Vataga / EasyScalp / CScalp bridge
  const payload = {
    ticker: tickerWithP,
    tickerPlain,
    symbol: cleanSymbol,
    exchange: exLower,
    exchangeUpper: exUpper,
    market: isFutures ? 'futures' : 'spot',
    marketType: isFutures ? 'futures' : 'spot',
    binding: bindingStr,
    group: bindingStr,
    linkGroup: bindingStr,
    bindingId: bindingStr,
    bindingPadded,
    target: 'vataga',
  };

  const endpoints = ['/api/change-ticker', '/api/ticker', '/change-ticker', '/ticker', '/api/v1/ticker'];
  const candidatePorts = Array.from(new Set([port, 17840, 17845, 17841, 17846, 17842, 17847, 17848, 17849, 17850]));
  const hosts = ['127.0.0.1', 'localhost'];

  const attempts: Promise<{ port: number; success: boolean }>[] = [];

  for (const p of candidatePorts) {
    for (const ep of endpoints) {
      for (const h of hosts) {
        attempts.push(
          (async () => {
            const ok = await trySendToLocalEndpoint(h, p, ep, payload, 600);
            return { port: p, success: ok };
          })()
        );
      }
    }
  }

  const results = await Promise.allSettled(attempts);
  const successItem = results.find(
    (r) => r.status === 'fulfilled' && r.value.success
  ) as PromiseFulfilledResult<{ port: number; success: boolean }> | undefined;

  if (successItem && successItem.value.success) {
    return {
      terminal: 'vataga',
      name: 'Vataga (EasyScalp)',
      success: true,
      port: successItem.value.port,
      binding: bindingStr,
      ticker: tickerWithP,
      message: `Миттєво передано у Vataga (Група ${bindingStr}, порт ${successItem.value.port})`,
    };
  }

  return {
    terminal: 'vataga',
    name: 'Vataga (EasyScalp)',
    success: false,
    port,
    binding: bindingStr,
    ticker: tickerWithP,
    message: `Vataga не відповіла на портах (${candidatePorts.slice(0, 3).join(', ')}). Перевірте підключення.`,
  };
}

/**
 * Sends ticker to TigerTrade instance
 */
async function sendToTigerEndpoint(
  symbol: string,
  exchange: ExchangeId,
  marketType: MarketType,
  port: number,
  binding: string
): Promise<TerminalSendResult> {
  const cleanSymbol = symbol.toUpperCase().replace('/', '');
  const exUpper = exchange.toUpperCase();
  const ticker = `${exUpper}:${cleanSymbol}`;
  const bindingStr = String(binding || '1');

  const payload = {
    symbol: cleanSymbol,
    exchange: exUpper,
    marketType,
    linkGroup: bindingStr,
    group: bindingStr,
    binding: bindingStr,
    ticker,
  };

  const endpoints = ['/api/v1/symbol', '/api/symbol', '/api/ticker', '/api/change-ticker'];
  const candidatePorts = Array.from(new Set([port, 9898, 16888, 17848, 17845]));
  const hosts = ['127.0.0.1', 'localhost'];

  const attempts: Promise<{ port: number; success: boolean }>[] = [];

  for (const p of candidatePorts) {
    for (const ep of endpoints) {
      for (const h of hosts) {
        attempts.push(
          (async () => {
            const ok = await trySendToLocalEndpoint(h, p, ep, payload, 600);
            return { port: p, success: ok };
          })()
        );
      }
    }
  }

  const results = await Promise.allSettled(attempts);
  const successItem = results.find(
    (r) => r.status === 'fulfilled' && r.value.success
  ) as PromiseFulfilledResult<{ port: number; success: boolean }> | undefined;

  if (successItem && successItem.value.success) {
    return {
      terminal: 'tiger',
      name: 'TigerTrade',
      success: true,
      port: successItem.value.port,
      binding: bindingStr,
      ticker,
      message: `Передано в TigerTrade (Група ${bindingStr}, порт ${successItem.value.port})`,
    };
  }

  return {
    terminal: 'tiger',
    name: 'TigerTrade',
    success: false,
    port,
    binding: bindingStr,
    ticker,
    message: `TigerTrade не відповів на 127.0.0.1:${port}`,
  };
}

/**
 * Unified sender for MetaScalp, Vataga, and Tiger Trade
 */
export async function sendTickerToUnifiedTerminals(
  symbol: string,
  exchange: ExchangeId = 'binance',
  marketType: MarketType = 'futures',
  settings: UnifiedLinkingSettings = DEFAULT_UNIFIED_LINKING_SETTINGS
): Promise<UnifiedLinkingResult> {
  const target = settings.activeTarget;
  const results: TerminalSendResult[] = [];

  const sendMetaScalp = target === 'metascalp' || target === 'all';
  const sendVataga = target === 'vataga' || target === 'all';
  const sendTiger = target === 'tiger' || target === 'all';

  const promises: Promise<TerminalSendResult>[] = [];

  if (sendMetaScalp && settings.metascalp.enabled) {
    promises.push(
      sendToMetaScalpEndpoint(symbol, exchange, marketType, settings.metascalp.port, settings.metascalp.binding)
    );
  }

  if (sendVataga && settings.vataga.enabled) {
    promises.push(
      sendToVatagaEndpoint(symbol, exchange, marketType, settings.vataga.port, settings.vataga.binding)
    );
  }

  if (sendTiger && settings.tiger.enabled) {
    promises.push(
      sendToTigerEndpoint(symbol, exchange, marketType, settings.tiger.port, settings.tiger.binding)
    );
  }

  // Execute all terminal transmissions concurrently
  const responses = await Promise.all(promises);
  results.push(...responses);

  // Form primary ticker for clipboard copy
  const primaryTicker =
    target === 'vataga'
      ? formatVatagaTicker(symbol, exchange, marketType)
      : target === 'tiger'
      ? formatTigerTicker(symbol, exchange, marketType)
      : formatMetaScalpTicker(symbol, exchange, marketType);

  // Clipboard copy fallback (ensures instant switch on web / Railway)
  let copiedToClipboard = false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(primaryTicker);
      copiedToClipboard = true;
    }
  } catch {}

  const anySuccess = results.some((r) => r.success);
  const successfulNames = results.filter((r) => r.success).map((r) => r.name);

  let summaryMessage = '';
  if (anySuccess) {
    summaryMessage = `Тікер ${symbol} миттєво передано в ${successfulNames.join(', ')}!`;
  } else {
    summaryMessage = `Тікер ${primaryTicker} скопійовано (термінал очікує підключення 127.0.0.1)`;
  }

  return {
    success: anySuccess,
    target,
    results,
    copiedToClipboard,
    summaryMessage,
    primaryTicker,
  };
}

import { ExchangeId, MarketType, UnifiedLinkingSettings, TerminalTarget } from '../types';

export type { UnifiedLinkingSettings, TerminalTarget };

export const DEFAULT_UNIFIED_LINKING_SETTINGS: UnifiedLinkingSettings = {
  activeTarget: 'metascalp',
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
 * Format symbol for Vataga (EasyScalp):
 * Format: EXCHANGE:SYMBOL or SYMBOL
 */
export function formatVatagaTicker(symbol: string, exchange: ExchangeId, marketType: MarketType): string {
  const cleanSymbol = symbol.toUpperCase().replace('/', '');
  return `${exchange.toUpperCase()}:${cleanSymbol}`;
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
 * Check if a local port is responding
 */
export async function pingLocalPort(port: number, timeoutMs = 1200): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/ping`, {
      method: 'GET',
      mode: 'cors',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok || res.status < 500;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
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
 * Sends ticker to MetaScalp instance
 */
async function sendToMetaScalpEndpoint(
  symbol: string,
  exchange: ExchangeId,
  marketType: MarketType,
  port: number,
  binding: string
): Promise<TerminalSendResult> {
  const ticker = formatMetaScalpTicker(symbol, exchange, marketType);
  const payload = {
    ticker,
    exchange: exchange.toLowerCase(),
    market: marketType === 'futures' ? 'futures' : 'spot',
    symbol: symbol.toUpperCase().replace('/', ''),
    binding,
  };

  const portsToTry = [port, 17845, 17846, 17847];
  const uniquePorts = Array.from(new Set(portsToTry));

  for (const p of uniquePorts) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const res = await fetch(`http://127.0.0.1:${p}/api/change-ticker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok || res.status === 200 || res.status === 204) {
        return {
          terminal: 'metascalp',
          name: 'MetaScalp',
          success: true,
          port: p,
          binding,
          ticker,
          message: `Передано в MetaScalp (Група ${binding}, порт ${p})`,
        };
      }
    } catch {
      // Continue to next port or fallback
    }
  }

  return {
    terminal: 'metascalp',
    name: 'MetaScalp',
    success: false,
    port,
    binding,
    ticker,
    message: `MetaScalp не відповів на 127.0.0.1:${port}`,
  };
}

/**
 * Sends ticker to Vataga (EasyScalp) instance
 */
async function sendToVatagaEndpoint(
  symbol: string,
  exchange: ExchangeId,
  marketType: MarketType,
  port: number,
  binding: string
): Promise<TerminalSendResult> {
  const ticker = formatVatagaTicker(symbol, exchange, marketType);
  const payload = {
    symbol: symbol.toUpperCase().replace('/', ''),
    exchange: exchange.toUpperCase(),
    market: marketType,
    binding,
    group: binding,
    ticker,
  };

  const portsToTry = [port, 17840, 17841, 17842];
  const uniquePorts = Array.from(new Set(portsToTry));

  for (const p of uniquePorts) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const res = await fetch(`http://127.0.0.1:${p}/api/ticker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok || res.status === 200 || res.status === 204) {
        return {
          terminal: 'vataga',
          name: 'Vataga (EasyScalp)',
          success: true,
          port: p,
          binding,
          ticker,
          message: `Передано у Vataga (Група ${binding}, порт ${p})`,
        };
      }
    } catch {
      // Continue to next port
    }
  }

  return {
    terminal: 'vataga',
    name: 'Vataga (EasyScalp)',
    success: false,
    port,
    binding,
    ticker,
    message: `Vataga не відповіла на 127.0.0.1:${port}`,
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
  const ticker = formatTigerTicker(symbol, exchange, marketType);
  const payload = {
    symbol: symbol.toUpperCase().replace('/', ''),
    exchange: exchange.toUpperCase(),
    marketType,
    linkGroup: binding,
    group: binding,
    ticker,
  };

  const portsToTry = [port, 9898, 16888, 17848];
  const uniquePorts = Array.from(new Set(portsToTry));

  for (const p of uniquePorts) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const res = await fetch(`http://127.0.0.1:${p}/api/v1/symbol`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok || res.status === 200 || res.status === 204) {
        return {
          terminal: 'tiger',
          name: 'TigerTrade',
          success: true,
          port: p,
          binding,
          ticker,
          message: `Передано в TigerTrade (Група ${binding}, порт ${p})`,
        };
      }
    } catch {
      // Continue to next port
    }
  }

  return {
    terminal: 'tiger',
    name: 'TigerTrade',
    success: false,
    port,
    binding,
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

  const responses = await Promise.all(promises);
  results.push(...responses);

  // Form primary ticker for clipboard copy
  const primaryTicker = formatMetaScalpTicker(symbol, exchange, marketType);

  // Clipboard copy fallback (ensures instant switch on web / Railway)
  let copiedToClipboard = false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(primaryTicker);
      copiedToClipboard = true;
    }
  } catch {}

  const anySuccess = results.some((r) => r.success);
  const successfulNames = results.filter((r) => r.success).map((r) => r.name);

  let summaryMessage = '';
  if (anySuccess) {
    summaryMessage = `Тікер ${symbol} передано в ${successfulNames.join(', ')}!`;
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

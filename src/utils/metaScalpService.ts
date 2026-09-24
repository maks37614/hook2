import { ExchangeId, MarketType } from '../types';

export interface MetaScalpSettings {
  enabled: boolean;
  port: number;
  binding: string; // '001' - '500'
  autoSwitchOnClick: boolean;
}

export const DEFAULT_METASCALP_SETTINGS: MetaScalpSettings = {
  enabled: true,
  port: 17845,
  binding: '001',
  autoSwitchOnClick: true,
};

const STORAGE_KEY = 'crypto_screener_metascalp_settings';

export function getStoredMetaScalpSettings(userId?: string): MetaScalpSettings {
  try {
    const key = userId ? `crypto_screener_metascalp_settings_${userId}` : STORAGE_KEY;
    const saved = localStorage.getItem(key) || (userId ? localStorage.getItem(STORAGE_KEY) : null);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_METASCALP_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load MetaScalp settings from localStorage:', e);
  }
  return DEFAULT_METASCALP_SETTINGS;
}

export function saveStoredMetaScalpSettings(settings: MetaScalpSettings, userId?: string): void {
  try {
    const key = userId ? `crypto_screener_metascalp_settings_${userId}` : STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(settings));
    if (userId) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch (e) {
    console.error('Failed to save MetaScalp settings:', e);
  }
}

/**
 * Format symbol according to MetaScalp specifications:
 * Format: EXCHANGE:SYMBOL.p for futures, or EXCHANGE:SYMBOL for spot
 * Examples: BINANCE:BTCUSDT.p, BYBIT:ETHUSDT.p, BINANCE:SOLUSDT
 */
export function formatMetaScalpTicker(symbol: string, exchange: ExchangeId, marketType: MarketType): string {
  const ex = exchange.toUpperCase();
  const cleanSymbol = symbol.toUpperCase();
  const isFutures = marketType === 'futures';
  return `${ex}:${cleanSymbol}${isFutures ? '.p' : ''}`;
}

/**
 * Checks if a specific port is responding to HTTP ping
 */
export async function pingMetaScalpPort(port: number, timeoutMs = 1200): Promise<boolean> {
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

/**
 * Scans available MetaScalp local ports (17845..17855) to find active instance
 */
export async function findActiveMetaScalpPort(preferredPort = 17845): Promise<number | null> {
  if (await pingMetaScalpPort(preferredPort)) {
    return preferredPort;
  }

  for (let p = 17845; p <= 17855; p++) {
    if (p === preferredPort) continue;
    if (await pingMetaScalpPort(p, 800)) {
      return p;
    }
  }

  return null;
}

export interface SendToMetaScalpResult {
  success: boolean;
  message: string;
  ticker: string;
  binding: string;
  portUsed?: number;
  copiedToClipboard?: boolean;
}

/**
 * Sends a ticker change command to the local MetaScalp terminal
 * via POST http://127.0.0.1:{port}/api/change-ticker
 */
export async function sendTickerToMetaScalp(
  symbol: string,
  exchange: ExchangeId,
  marketType: MarketType,
  settings: Partial<MetaScalpSettings> = {}
): Promise<SendToMetaScalpResult> {
  const port = settings.port || 17845;
  const binding = settings.binding || '001';
  const ticker = formatMetaScalpTicker(symbol, exchange, marketType);

  const payload = {
    ticker,
    exchange: exchange.toLowerCase(),
    market: marketType === 'futures' ? 'futures' : 'spot',
    symbol: symbol.toUpperCase(),
    binding,
  };

  const portsToTry = [port];
  for (let p = 17845; p <= 17855; p++) {
    if (p !== port) portsToTry.push(p);
  }

  let lastError: any = null;

  for (const currentPort of portsToTry.slice(0, 3)) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);

      const res = await fetch(`http://127.0.0.1:${currentPort}/api/change-ticker`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        mode: 'cors',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok || res.status === 200 || res.status === 204) {
        return {
          success: true,
          message: `Тікер ${ticker} передано в MetaScalp (Група ${binding})`,
          ticker,
          binding,
          portUsed: currentPort,
        };
      } else {
        const errorText = await res.text().catch(() => '');
        lastError = new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  // Fallback: Copy to clipboard if local API is not answering
  let copied = false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(ticker);
      copied = true;
    }
  } catch (clipErr) {
    console.warn('Clipboard write failed:', clipErr);
  }

  return {
    success: false,
    message: lastError?.message || 'MetaScalp не відповідає на 127.0.0.1',
    ticker,
    binding,
    copiedToClipboard: copied,
  };
}

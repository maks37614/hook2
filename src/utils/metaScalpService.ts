import { ExchangeId, MarketType } from '../types';

export interface MetaScalpSettings {
  enabled: boolean;
  port: number;
  binding: string; // '001' - '500'
  autoSwitchOnClick: boolean;
  soundFeedback?: boolean;
}

export const DEFAULT_METASCALP_SETTINGS: MetaScalpSettings = {
  enabled: true,
  port: 17845,
  binding: '001',
  autoSwitchOnClick: true,
  soundFeedback: true,
};

export function playMetaScalpClickSound(): void {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
    setTimeout(() => ctx.close().catch(() => {}), 150);
  } catch {}
}

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

  const bindingPadded = String(binding || '001').padStart(3, '0');
  const bindingRaw = String(binding || '001').replace(/^0+/, '') || '1';
  const cleanSymbol = symbol.toUpperCase().replace('/', '');
  const isFutures = marketType === 'futures';

  const payloads = [
    { ticker, binding: bindingPadded },
    { ticker, binding: bindingRaw },
    { ticker },
    {
      exchange: exchange.toLowerCase(),
      market: isFutures ? 'futures' : 'spot',
      ticker: cleanSymbol,
      binding: bindingPadded,
    },
  ];

  const portsToTry = [port];
  for (let p = 17845; p <= 17855; p++) {
    if (p !== port) portsToTry.push(p);
  }

  let lastError: any = null;

  for (const currentPort of portsToTry.slice(0, 3)) {
    for (const bodyObj of payloads) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);

        const res = await fetch(`http://127.0.0.1:${currentPort}/api/change-ticker`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
          },
          body: JSON.stringify(bodyObj),
          mode: 'cors',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.ok || res.status === 200 || res.status === 204) {
          // Also notify active window
          if ('binding' in bodyObj) {
            fetch(`http://127.0.0.1:${currentPort}/api/change-ticker`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticker }),
              mode: 'cors',
            }).catch(() => {});
          }

          if (settings.soundFeedback) {
            playMetaScalpClickSound();
          }

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
  }

  // Fallback: Beacon transmission in case CORS was blocked by browser
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify({ ticker, binding: bindingPadded })], {
        type: 'application/json',
      });
      navigator.sendBeacon(`http://127.0.0.1:${port}/api/change-ticker`, blob);
    }
  } catch {}

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

  if (settings.soundFeedback) {
    playMetaScalpClickSound();
  }

  return {
    success: false,
    message: lastError?.message || `MetaScalp не прийняв запит на порту ${port}`,
    ticker,
    binding,
    copiedToClipboard: copied,
  };
}

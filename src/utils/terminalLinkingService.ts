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
    port: 17845, // Vataga EasyScalp / MetaScalp compatibility port
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
      const settings: UnifiedLinkingSettings = {
        ...DEFAULT_UNIFIED_LINKING_SETTINGS,
        ...parsed,
        metascalp: { ...DEFAULT_UNIFIED_LINKING_SETTINGS.metascalp, ...(parsed.metascalp || {}) },
        vataga: { ...DEFAULT_UNIFIED_LINKING_SETTINGS.vataga, ...(parsed.vataga || {}) },
        tiger: { ...DEFAULT_UNIFIED_LINKING_SETTINGS.tiger, ...(parsed.tiger || {}) },
      };
      // If Vataga was saved with the legacy non-existent 17840 port, upgrade to standard 17845
      if (settings.vataga.port === 17840) {
        settings.vataga.port = 17845;
      }
      return settings;
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
 * e.g. BINANCE:BTCUSDT.p, BYBIT:ETHUSDT.p, BINANCE:SOLUSDT
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
 * Fast and accurate ping to verify if a local port is listening on the computer
 */
export async function pingLocalPort(port: number, timeoutMs = 700): Promise<boolean> {
  const hosts = ['127.0.0.1', 'localhost'];

  for (const host of hosts) {
    // 1. Try standard CORS on /ping or /api/change-ticker
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`http://${host}:${port}/ping`, {
        method: 'GET',
        mode: 'cors',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok || res.status < 500) return true;
    } catch {}

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`http://${host}:${port}/api/change-ticker`, {
        method: 'OPTIONS',
        mode: 'cors',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok || res.status < 500) return true;
    } catch {}

    // 2. Try no-cors probe on root or api
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      await fetch(`http://${host}:${port}/`, {
        method: 'GET',
        mode: 'no-cors',
        signal: controller.signal,
      });
      clearTimeout(timer);
      return true;
    } catch {}
  }

  return false;
}

/**
 * Automatically scans candidate ports to find an active Vataga instance
 */
export async function findActiveVatagaPort(preferredPort = 17845): Promise<number | null> {
  const candidatePorts = [preferredPort, 17845, 17840, 17846, 17841, 17847, 40440, 9898, 16888];
  const uniquePorts = Array.from(new Set(candidatePorts.filter(Boolean)));

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
  const uniquePorts = Array.from(new Set(candidatePorts.filter(Boolean)));

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
 * Sends ticker to MetaScalp instance using the official MetaScalp SDK specification:
 * - Content-Type: application/json
 * - mode: cors (with no-cors/beacon fallback)
 * - Ticker format: BINANCE:BTCUSDT.p (futures) or BINANCE:BTCUSDT (spot)
 * - Binding: "001" - "500", plus active window change
 */
async function sendToMetaScalpEndpoint(
  symbol: string,
  exchange: ExchangeId,
  marketType: MarketType,
  port: number,
  binding: string
): Promise<TerminalSendResult> {
  const cleanSymbol = symbol.toUpperCase().replace('/', '');
  const exUpper = exchange.toUpperCase();
  const isFutures = marketType === 'futures';
  const ticker = `${exUpper}:${cleanSymbol}${isFutures ? '.p' : ''}`;
  const bindingStr = String(binding || '001');
  const bindingPadded = bindingStr.padStart(3, '0');
  const bindingRaw = bindingStr.replace(/^0+/, '') || '1';

  // Candidate ports: configured port first, then standard MetaScalp ports
  const candidatePorts = Array.from(new Set([port, 17845, 17846, 17847, 17848, 17849, 17850]));
  const hosts = ['127.0.0.1', 'localhost'];

  // Payloads strictly compliant with MetaScalp SDK
  const payloads = [
    // Format 1: Ticker pattern with 3-digit padded binding ("001")
    { ticker, binding: bindingPadded },
    // Format 2: Ticker pattern with unpadded binding ("1")
    { ticker, binding: bindingRaw },
    // Format 3: Active window (without binding) - changes whatever orderbook is focused
    { ticker },
    // Format 4: Explicit fields format
    {
      exchange: exchange.toLowerCase(),
      market: isFutures ? 'futures' : 'spot',
      ticker: cleanSymbol,
      binding: bindingPadded,
    },
    // Format 5: Plain symbol without .p
    { ticker: `${exUpper}:${cleanSymbol}`, binding: bindingPadded },
    { ticker: `${exUpper}:${cleanSymbol}` },
  ];

  let lastError = '';

  for (const p of candidatePorts) {
    for (const host of hosts) {
      for (const bodyObj of payloads) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 1200);

          const res = await fetch(`http://${host}:${p}/api/change-ticker`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/plain, */*',
            },
            body: JSON.stringify(bodyObj),
            mode: 'cors',
            signal: controller.signal,
          });

          clearTimeout(timer);

          if (res.ok || res.status === 200 || res.status === 204) {
            // Also notify active window so focused window updates immediately
            if ('binding' in bodyObj) {
              fetch(`http://${host}:${p}/api/change-ticker`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker }),
                mode: 'cors',
              }).catch(() => {});
            }

            return {
              terminal: 'metascalp',
              name: 'MetaScalp',
              success: true,
              port: p,
              binding: bindingStr,
              ticker,
              message: `Тікер ${ticker} передано в MetaScalp (Група ${bindingStr}, порт ${p})`,
            };
          } else {
            const errBody = await res.text().catch(() => '');
            lastError = `HTTP ${res.status}: ${errBody || res.statusText}`;
          }
        } catch (err: any) {
          lastError = err?.message || 'Помилка з\'єднання';
        }
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

  return {
    terminal: 'metascalp',
    name: 'MetaScalp',
    success: false,
    port,
    binding: bindingStr,
    ticker,
    message: `MetaScalp не прийняв запит на порту ${port} (${lastError || 'перевірте налаштування'}). Тікер скопійовано в буфер.`,
  };
}

/**
 * Sends ticker to Vataga (EasyScalp / Vataga.terminal) instance
 * Tries standard ports (17845, 17840, 17846...) and endpoints (/api/change-ticker, /api/ticker)
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
  const isFutures = marketType === 'futures';
  const tickerWithP = `${exUpper}:${cleanSymbol}${isFutures ? '.p' : ''}`;
  const tickerPlain = `${exUpper}:${cleanSymbol}`;
  const bindingStr = String(binding || '1');
  const bindingPadded = bindingStr.padStart(3, '0');

  // Candidate ports: configured port first, then standard 17845, 17840, 17846...
  const candidatePorts = Array.from(new Set([port, 17845, 17840, 17846, 17841, 17847, 40440, 9898]));
  const hosts = ['127.0.0.1', 'localhost'];
  const endpoints = ['/api/change-ticker', '/api/ticker', '/change-ticker', '/ticker'];

  const payloads = [
    { ticker: tickerWithP, binding: bindingPadded },
    { ticker: tickerWithP, binding: bindingStr },
    { ticker: tickerWithP },
    { ticker: tickerPlain, binding: bindingStr },
    { ticker: tickerPlain },
    {
      symbol: cleanSymbol,
      exchange: exchange.toLowerCase(),
      market: isFutures ? 'futures' : 'spot',
      binding: bindingStr,
    },
  ];

  let lastError = '';

  for (const p of candidatePorts) {
    for (const host of hosts) {
      for (const ep of endpoints) {
        for (const bodyObj of payloads) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 1200);

            const res = await fetch(`http://${host}:${p}${ep}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
              },
              body: JSON.stringify(bodyObj),
              mode: 'cors',
              signal: controller.signal,
            });

            clearTimeout(timer);

            if (res.ok || res.status === 200 || res.status === 204) {
              return {
                terminal: 'vataga',
                name: 'Vataga (EasyScalp)',
                success: true,
                port: p,
                binding: bindingStr,
                ticker: tickerWithP,
                message: `Миттєво передано у Vataga (Група ${bindingStr}, порт ${p})`,
              };
            } else {
              const errBody = await res.text().catch(() => '');
              lastError = `HTTP ${res.status}: ${errBody || res.statusText}`;
            }
          } catch (err: any) {
            lastError = err?.message || 'Помилка з\'єднання';
          }
        }
      }
    }
  }

  // Backup: Beacon fallback
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify({ ticker: tickerWithP, binding: bindingStr })], {
        type: 'application/json',
      });
      navigator.sendBeacon(`http://127.0.0.1:${port}/api/change-ticker`, blob);
      navigator.sendBeacon(`http://127.0.0.1:${port}/api/ticker`, blob);
    }
  } catch {}

  return {
    terminal: 'vataga',
    name: 'Vataga (EasyScalp)',
    success: false,
    port,
    binding: bindingStr,
    ticker: tickerWithP,
    message: `Vataga не відповідає на портах (${candidatePorts.slice(0, 3).join(', ')}). Тікер скопійовано в буфер (Ctrl+V у терміналі).`,
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

  for (const p of candidatePorts) {
    for (const ep of endpoints) {
      for (const h of hosts) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 1200);

          const res = await fetch(`http://${h}:${p}${ep}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/plain, */*',
            },
            body: JSON.stringify(payload),
            mode: 'cors',
            signal: controller.signal,
          });

          clearTimeout(timer);

          if (res.ok || res.status === 200 || res.status === 204) {
            return {
              terminal: 'tiger',
              name: 'TigerTrade',
              success: true,
              port: p,
              binding: bindingStr,
              ticker,
              message: `Передано в TigerTrade (Група ${bindingStr}, порт ${p})`,
            };
          }
        } catch {}
      }
    }
  }

  return {
    terminal: 'tiger',
    name: 'TigerTrade',
    success: false,
    port,
    binding: bindingStr,
    ticker,
    message: `TigerTrade не відповів на 127.0.0.1:${port}. Тікер скопійовано в буфер.`,
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

  // Execute terminal transmissions concurrently
  const responses = await Promise.all(promises);
  results.push(...responses);

  // Form primary ticker for clipboard copy
  const primaryTicker =
    target === 'vataga'
      ? formatVatagaTicker(symbol, exchange, marketType)
      : target === 'tiger'
      ? formatTigerTicker(symbol, exchange, marketType)
      : formatMetaScalpTicker(symbol, exchange, marketType);

  // Guaranteed clipboard copy fallback (ensures instant switch on web / desktop)
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
    summaryMessage = `Тікер ${primaryTicker} передано в ${successfulNames.join(', ')}!`;
  } else {
    summaryMessage = `Тікер ${primaryTicker} скопійовано (Ctrl+V у терміналі)`;
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

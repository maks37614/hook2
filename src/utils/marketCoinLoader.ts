import type { ExchangeId, MarketType, MarketCoin } from '../types';
import { fetchDirectBinanceTickers, fetchDirectBybitTickers } from './directExchangeClient';

export interface MarketSelection {
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
}

export interface MarketCoinSnapshot {
  coins: MarketCoin[];
  timestamp: number | null;
  warning: string | null;
}

const defaultDependencies = { request: fetch, binance: fetchDirectBinanceTickers, bybit: fetchDirectBybitTickers };

export async function loadMarketCoins(
  selection: MarketSelection,
  signal: AbortSignal,
  dependencies = defaultDependencies,
): Promise<MarketCoinSnapshot> {
  let backendError = 'Не вдалося отримати дані бірж. Перевірте з’єднання та повторіть запит.';
  try {
    const params = new URLSearchParams({ ...selection, minVolume: '0' });
    const response = await dependencies.request(`/api/screener/coins?${params}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]), cache: 'no-store',
    });
    if (response.headers.get('content-type')?.includes('application/json')) {
      const result = await response.json();
      if (response.ok && result.success && Array.isArray(result.data)) {
        const affected = Array.isArray(result.sources) ? result.sources.filter((source: any) => source.status !== 'live') : [];
        const warning = affected.length ? affected.map((source: any) => {
          const name = `${source.exchange === 'binance' ? 'Binance' : 'Bybit'} ${source.marketType === 'spot' ? 'Spot' : 'Futures'}`;
          return `${name}: ${source.status === 'stale' ? 'показано останні отримані дані' : 'дані недоступні'}${source.error ? ` (${source.error})` : ''}`;
        }).join('; ') : null;
        return { coins: result.data, timestamp: result.timestamp ?? null, warning };
      }
      if (typeof result.error === 'string') backendError = result.error;
    }
  } catch { /* Browser networking may still allow a direct public market request. */ }
  signal.throwIfAborted();
  const options = { marketType: selection.marketType, minVolumeUsd: 0,
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) };
  const results = await Promise.allSettled([
    selection.exchange !== 'bybit' ? dependencies.binance(options) : Promise.resolve([]),
    selection.exchange !== 'binance' ? dependencies.bybit(options) : Promise.resolve([]),
  ]);
  signal.throwIfAborted();
  const coins = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
    .filter(coin => (selection.marketType === 'all' || coin.marketType === selection.marketType)
      && (selection.exchange === 'all' || coin.exchange === selection.exchange));
  if (coins.length) {
    return { coins, timestamp: Date.now(), warning: 'Дані отримано напряму з бірж. Частина джерел може бути недоступною.' };
  }
  throw new Error(backendError);
}

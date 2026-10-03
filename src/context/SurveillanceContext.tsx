import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import { SurveillanceRequestGuard } from '../utils/surveillanceRequests';
import {
  SurveillanceCoin,
  SurveillanceConfig,
  SurveillanceEvent,
  ExchangeId,
  MarketType,
} from '../types';

export interface AggregatedSurveillanceEvent extends SurveillanceEvent {
  coinId: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
}

interface SurveillanceContextType {
  coins: SurveillanceCoin[];
  allEvents: AggregatedSurveillanceEvent[];
  loading: boolean;
  activeCount: number;
  addCoinToSurveillance: (
    symbol: string,
    exchange?: ExchangeId,
    marketType?: MarketType,
    customConfig?: Partial<SurveillanceConfig>
  ) => Promise<{ success: boolean; coin?: SurveillanceCoin; error?: string }>;
  removeCoinFromSurveillance: (id: string) => Promise<boolean>;
  updateCoinConfig: (id: string, config: Partial<SurveillanceConfig>) => Promise<boolean>;
  toggleCoinActive: (id: string) => Promise<boolean>;
  toggleAllCoinsActive: (targetActive: boolean) => Promise<boolean>;
  checkCoinNow: (id: string, forceNotify?: boolean) => Promise<SurveillanceCoin | null>;
  checkAllCoinsNow: () => Promise<boolean>;
  getWorkerSnapshot: (id: string) => Promise<any | null>;
  runBacktest: (symbol: string, exchange?: ExchangeId, marketType?: MarketType, timeframe?: string) => Promise<any | null>;
  isCoinMonitored: (symbol: string, exchange?: ExchangeId) => boolean;
  isCoinOnSurveillance: (symbol: string, exchange?: ExchangeId) => boolean;
  refresh: () => Promise<void>;
}

const SurveillanceContext = createContext<SurveillanceContextType | undefined>(undefined);

export const SurveillanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [coins, setCoins] = useState<SurveillanceCoin[]>([]);
  const currentUserId = useRef(user?.uid || 'guest');
  currentUserId.current = user?.uid || 'guest';
  const requestGuard = useRef(new SurveillanceRequestGuard(currentUserId.current));
  requestGuard.current.setUser(currentUserId.current);
  const removedIds = useRef(new Map<string, Set<string>>());
  const [loading, setLoading] = useState<boolean>(true);

  const fetchCoins = useCallback(async () => {
    const userId = user?.uid || 'guest';
    const request = requestGuard.current.beginRead();
    if (!request) return;
    try {
      const res = await fetch(`/api/surveillance?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!requestGuard.current.canApply(request)) return;
      if (data.success && Array.isArray(data.data)) {
        setCoins(data.data);
        try {
          localStorage.setItem(`signalhook_surveillance_${userId}`, JSON.stringify(data.data));
        } catch {}
      }
    } catch (err) {
      if (!requestGuard.current.canApply(request)) return;
      console.warn('[Surveillance] Fetch error, checking localStorage:', err);
      try {
        const cached = localStorage.getItem(`signalhook_surveillance_${userId}`);
        if (cached) {
          setCoins(JSON.parse(cached));
        }
      } catch {}
    } finally {
      if (requestGuard.current.canApply(request)) setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    setCoins([]);
    setLoading(true);
    fetchCoins();
    const interval = setInterval(() => {
      fetchCoins();
    }, 6000);
    return () => clearInterval(interval);
  }, [fetchCoins]);

  const mutate = async (userId: string, url: string, options: RequestInit) => {
    const finish = requestGuard.current.beginWrite(userId);
    try {
      const res = await fetch(url, options);
      const data = await res.json();
      if (!finish.isCurrent()) throw new Error('Обліковий запис змінено');
      return data;
    } finally { finish(); }
  };

  const getWorkerSnapshot = useCallback(async (id: string): Promise<any | null> => {
    const userId = user?.uid || 'guest';
    try {
      const res = await fetch(`/api/surveillance/worker/${encodeURIComponent(id)}?userId=${encodeURIComponent(user?.uid || 'guest')}`);
      if (!res.ok) return null;
      const json = await res.json();
      if (currentUserId.current !== userId) return null;
      return json.success ? json.data : null;
    } catch {
      return null;
    }
  }, [user?.uid]);

  const runBacktest = async (
    symbol: string,
    exchange: ExchangeId = 'binance',
    marketType: MarketType = 'futures',
    timeframe = '15m'
  ): Promise<any | null> => {
      const res = await fetch('/api/surveillance/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, exchange, marketType, timeframe }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Не вдалося виконати бектест');
      return json.data;
  };

  const addCoinToSurveillance = async (
    symbol: string,
    exchange: ExchangeId = 'binance',
    marketType: MarketType = 'futures',
    customConfig?: Partial<SurveillanceConfig>
  ) => {
    try {
      const userId = user?.uid || 'guest';
      const cleanSymbol = symbol.toUpperCase().trim();
      const baseAsset = cleanSymbol.replace(/USDT$|BUSD$|USDC$/, '');
      const quoteAsset = 'USDT';

      const data = await mutate(userId, '/api/surveillance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: cleanSymbol,
          baseAsset,
          quoteAsset,
          exchange,
          marketType,
          userId,
          config: customConfig,
        }),
      });

      if (data.success && data.coin) {
        if (removedIds.current.get(userId)?.has(data.coin.id)) return { success: false, error: 'Монету вже видалено' };
        setCoins((prev) => {
          const exists = prev.some((c) => c.id === data.coin.id);
          const next = exists ? prev.map((c) => (c.id === data.coin.id ? data.coin : c)) : [data.coin, ...prev];
          try {
            localStorage.setItem(`signalhook_surveillance_${userId}`, JSON.stringify(next));
          } catch {}
          return next;
        });
        return { success: true, coin: data.coin };
      }
      return { success: false, error: data.error || 'Не вдалося додати монету' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Помилка мережі' };
    }
  };

  const removeCoinFromSurveillance = async (id: string): Promise<boolean> => {
    try {
      const userId = user?.uid || 'guest';
      const data = await mutate(userId, `/api/surveillance/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      if (data.success) {
        if (!removedIds.current.has(userId)) removedIds.current.set(userId, new Set());
        removedIds.current.get(userId)!.add(id);
        setCoins((prev) => {
          const next = prev.filter((c) => c.id !== id);
          try {
            localStorage.setItem(`signalhook_surveillance_${userId}`, JSON.stringify(next));
          } catch {}
          return next;
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const updateCoinConfig = async (
    id: string,
    config: Partial<SurveillanceConfig>
  ): Promise<boolean> => {
    try {
      const userId = user?.uid || 'guest';
      const data = await mutate(userId, `/api/surveillance/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, config }),
      });
      if (data.success && data.coin) {
        setCoins((prev) => {
          const next = prev.map((c) => (c.id === id ? data.coin : c));
          try {
            localStorage.setItem(`signalhook_surveillance_${userId}`, JSON.stringify(next));
          } catch {}
          return next;
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const toggleCoinActive = async (id: string): Promise<boolean> => {
    const coin = coins.find((c) => c.id === id);
    if (!coin) return false;
    try {
      const userId = user?.uid || 'guest';
      const data = await mutate(userId, `/api/surveillance/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isActive: !coin.isActive }),
      });
      if (data.success && data.coin) {
        setCoins((prev) => {
          const next = prev.map((c) => (c.id === id ? data.coin : c));
          try {
            localStorage.setItem(`signalhook_surveillance_${userId}`, JSON.stringify(next));
          } catch {}
          return next;
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const checkCoinNow = async (id: string, forceNotify = false): Promise<SurveillanceCoin | null> => {
    try {
      const userId = user?.uid || 'guest';
      const data = await mutate(userId, `/api/surveillance/${encodeURIComponent(id)}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, forceNotify }),
      });
      if (data.success && data.coin) {
        setCoins((prev) => {
          const next = prev.map((c) => (c.id === id ? data.coin : c));
          try {
            localStorage.setItem(`signalhook_surveillance_${userId}`, JSON.stringify(next));
          } catch {}
          return next;
        });
        return data.coin;
      }
      return null;
    } catch {
      return null;
    }
  };

  const checkAllCoinsNow = async (): Promise<boolean> => {
    try {
      const userId = user?.uid || 'guest';
      const data = await mutate(userId, '/api/surveillance/check-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (data.success && Array.isArray(data.data)) {
        await fetchCoins();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const toggleAllCoinsActive = async (targetActive: boolean): Promise<boolean> => {
    try {
      const userId = user?.uid || 'guest';
      const data = await mutate(userId, '/api/surveillance/toggle-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isActive: targetActive }),
      });
      if (data.success && Array.isArray(data.data)) {
        await fetchCoins();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const isCoinMonitored = (symbol: string, exchange?: ExchangeId): boolean => {
    const clean = symbol.toUpperCase().trim();
    return coins.some((c) => c.symbol === clean && (!exchange || c.exchange === exchange) && c.isActive);
  };

  const isCoinOnSurveillance = (symbol: string, exchange?: ExchangeId): boolean => {
    const clean = symbol.toUpperCase().trim();
    return coins.some((c) => c.symbol === clean && (!exchange || c.exchange === exchange));
  };

  const activeCount = coins.filter((c) => c.isActive).length;

  const allEvents = useMemo<AggregatedSurveillanceEvent[]>(() => {
    const list: AggregatedSurveillanceEvent[] = [];
    for (const coin of coins) {
      if (coin.state?.recentEvents && Array.isArray(coin.state.recentEvents)) {
        for (const ev of coin.state.recentEvents) {
          list.push({
            ...ev,
            coinId: coin.id,
            symbol: coin.symbol,
            baseAsset: coin.baseAsset,
            quoteAsset: coin.quoteAsset,
            exchange: coin.exchange,
            marketType: coin.marketType,
          });
        }
      }
    }
    return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [coins]);

  return (
    <SurveillanceContext.Provider
      value={{
        coins,
        allEvents,
        loading,
        activeCount,
        addCoinToSurveillance,
        removeCoinFromSurveillance,
        updateCoinConfig,
        toggleCoinActive,
        toggleAllCoinsActive,
        checkCoinNow,
        checkAllCoinsNow,
        getWorkerSnapshot,
        runBacktest,
        isCoinMonitored,
        isCoinOnSurveillance,
        refresh: fetchCoins,
      }}
    >
      {children}
    </SurveillanceContext.Provider>
  );
};

export const useSurveillance = () => {
  const context = useContext(SurveillanceContext);
  if (!context) {
    throw new Error('useSurveillance must be used within a SurveillanceProvider');
  }
  return context;
};

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
  SurveillanceCoin,
  SurveillanceConfig,
  ExchangeId,
  MarketType,
} from '../types';

interface SurveillanceContextType {
  coins: SurveillanceCoin[];
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
  checkCoinNow: (id: string, forceNotify?: boolean) => Promise<SurveillanceCoin | null>;
  checkAllCoinsNow: () => Promise<boolean>;
  isCoinMonitored: (symbol: string, exchange?: ExchangeId) => boolean;
  refresh: () => Promise<void>;
}

const SurveillanceContext = createContext<SurveillanceContextType | undefined>(undefined);

export const SurveillanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [coins, setCoins] = useState<SurveillanceCoin[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchCoins = useCallback(async () => {
    try {
      const userId = user?.uid || 'guest';
      const res = await fetch(`/api/surveillance?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setCoins(data.data);
        try {
          localStorage.setItem(`signalhook_surveillance_${userId}`, JSON.stringify(data.data));
        } catch {}
      }
    } catch (err) {
      console.warn('[Surveillance] Fetch error, checking localStorage:', err);
      try {
        const userId = user?.uid || 'guest';
        const cached = localStorage.getItem(`signalhook_surveillance_${userId}`);
        if (cached) {
          setCoins(JSON.parse(cached));
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    fetchCoins();
    const interval = setInterval(() => {
      fetchCoins();
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchCoins]);

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

      const res = await fetch('/api/surveillance', {
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

      const data = await res.json();
      if (data.success && data.coin) {
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
      const res = await fetch(`/api/surveillance/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
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
      const res = await fetch(`/api/surveillance/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, config }),
      });
      const data = await res.json();
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
      const res = await fetch(`/api/surveillance/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isActive: !coin.isActive }),
      });
      const data = await res.json();
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
      const res = await fetch(`/api/surveillance/${encodeURIComponent(id)}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, forceNotify }),
      });
      const data = await res.json();
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
      const res = await fetch('/api/surveillance/check-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setCoins(data.data);
        try {
          localStorage.setItem(`signalhook_surveillance_${userId}`, JSON.stringify(data.data));
        } catch {}
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

  const activeCount = coins.filter((c) => c.isActive).length;

  return (
    <SurveillanceContext.Provider
      value={{
        coins,
        loading,
        activeCount,
        addCoinToSurveillance,
        removeCoinFromSurveillance,
        updateCoinConfig,
        toggleCoinActive,
        checkCoinNow,
        checkAllCoinsNow,
        isCoinMonitored,
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

import { useEffect, useState, useCallback } from 'react';
import { ExchangeId, MarketType, Timeframe } from '../types';

export interface AppPreferences {
  defaultExchange: 'all' | ExchangeId;
  defaultMarketType: 'all' | MarketType;
  defaultTimeframe: Timeframe;
  soundAlertsEnabled: boolean;
}

export const PREFERENCES_STORAGE_KEY = 'crypto_screener_site_defaults';
export const PREFERENCES_UPDATED_EVENT = 'crypto_screener_preferences_updated';

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  defaultExchange: 'all',
  defaultMarketType: 'futures',
  defaultTimeframe: '15m',
  soundAlertsEnabled: true,
};

/**
 * Read preferences from localStorage (or fallback to defaults)
 */
export function getStoredPreferences(): AppPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_PREFERENCES;
  }
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        defaultExchange: parsed.defaultExchange || DEFAULT_APP_PREFERENCES.defaultExchange,
        defaultMarketType: parsed.defaultMarketType || DEFAULT_APP_PREFERENCES.defaultMarketType,
        defaultTimeframe: parsed.defaultTimeframe || DEFAULT_APP_PREFERENCES.defaultTimeframe,
        soundAlertsEnabled:
          parsed.soundAlertsEnabled !== undefined
            ? Boolean(parsed.soundAlertsEnabled)
            : DEFAULT_APP_PREFERENCES.soundAlertsEnabled,
      };
    }
  } catch (err) {
    console.warn('Failed to parse stored preferences:', err);
  }
  return DEFAULT_APP_PREFERENCES;
}

/**
 * Save preferences to localStorage and notify all components across the app
 */
export function saveStoredPreferences(updates: Partial<AppPreferences>): AppPreferences {
  const current = getStoredPreferences();
  const next: AppPreferences = {
    ...current,
    ...updates,
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(
        new CustomEvent<AppPreferences>(PREFERENCES_UPDATED_EVENT, { detail: next })
      );
    } catch (err) {
      console.warn('Failed to save stored preferences:', err);
    }
  }

  return next;
}

/**
 * React hook to subscribe to website-wide preferences and apply updates
 */
export function useAppPreferences() {
  const [preferences, setPreferences] = useState<AppPreferences>(() => getStoredPreferences());

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<AppPreferences>;
      if (customEvent.detail) {
        setPreferences(customEvent.detail);
      } else {
        setPreferences(getStoredPreferences());
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === PREFERENCES_STORAGE_KEY) {
        setPreferences(getStoredPreferences());
      }
    };

    window.addEventListener(PREFERENCES_UPDATED_EVENT, handleUpdate);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const updatePreferences = useCallback((updates: Partial<AppPreferences>) => {
    const next = saveStoredPreferences(updates);
    setPreferences(next);
    return next;
  }, []);

  return {
    preferences,
    updatePreferences,
  };
}

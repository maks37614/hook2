import React, { createContext, useContext, useState, useEffect } from 'react';

export type SupportedLanguage = 'uk' | 'en' | 'ru' | 'pl';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string) => string;
}

const translations: Record<SupportedLanguage, Record<string, string>> = {
  uk: {
    screener: 'Скрінер',
    patterns: 'Формації',
    terminal: 'Термінал',
    surveillance: 'Нагляд',
    watchlist: 'Обране',
    archive: 'Архів',
    guide: 'Посібник',
    settings: 'Налаштування',
    refresh: 'Оновити',
    search: 'Пошук монет...',
    exchange: 'Біржа',
    market: 'Ринок',
    price: 'Ціна',
    change24h: 'Зміна 24г',
    volume: 'Обсяг 24г',
    addToSurveillance: 'Додати на нагляд',
    language: 'Мова сайту',
    allExchanges: 'Усі біржі',
    allMarkets: 'Усі ринки',
    futures: 'Ф\'ючерси',
    spot: 'Спот',
    bullish: 'Бичачі',
    bearish: 'Ведмежі',
    totalCoins: 'Монет',
    loading: 'Завантаження...',
    telegramAlerts: 'Telegram Сповіщення',
    metaScalp: 'MetaScalp',
    save: 'Зберегти',
    cancel: 'Скасувати',
    close: 'Закрити',
    delete: 'Видалити',
    success: 'Успішно',
    error: 'Помилка',
  },
  en: {
    screener: 'Screener',
    patterns: 'Patterns',
    terminal: 'Terminal',
    surveillance: 'Surveillance',
    watchlist: 'Watchlist',
    archive: 'Archive',
    guide: 'Guide',
    settings: 'Settings',
    refresh: 'Refresh',
    search: 'Search coins...',
    exchange: 'Exchange',
    market: 'Market',
    price: 'Price',
    change24h: '24h Change',
    volume: '24h Volume',
    addToSurveillance: 'Add to Surveillance',
    language: 'Site Language',
    allExchanges: 'All Exchanges',
    allMarkets: 'All Markets',
    futures: 'Futures',
    spot: 'Spot',
    bullish: 'Bullish',
    bearish: 'Bearish',
    totalCoins: 'Coins',
    loading: 'Loading...',
    telegramAlerts: 'Telegram Alerts',
    metaScalp: 'MetaScalp',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    delete: 'Delete',
    success: 'Success',
    error: 'Error',
  },
  ru: {
    screener: 'Скринер',
    patterns: 'Формации',
    terminal: 'Терминал',
    surveillance: 'Наблюдение',
    watchlist: 'Избранное',
    archive: 'Архив',
    guide: 'Руководство',
    settings: 'Настройки',
    refresh: 'Обновить',
    search: 'Поиск монет...',
    exchange: 'Биржа',
    market: 'Рынок',
    price: 'Цена',
    change24h: 'Изменение 24ч',
    volume: 'Объем 24ч',
    addToSurveillance: 'Добавить в наблюдение',
    language: 'Язык сайта',
    allExchanges: 'Все биржи',
    allMarkets: 'Все рынки',
    futures: 'Фьючерсы',
    spot: 'Спот',
    bullish: 'Бычьи',
    bearish: 'Медвежьи',
    totalCoins: 'Монет',
    loading: 'Загрузка...',
    telegramAlerts: 'Telegram Оповещения',
    metaScalp: 'MetaScalp',
    save: 'Сохранить',
    cancel: 'Отмена',
    close: 'Закрыть',
    delete: 'Удалить',
    success: 'Успешно',
    error: 'Ошибка',
  },
  pl: {
    screener: 'Skaner',
    patterns: 'Formacje',
    terminal: 'Terminal',
    surveillance: 'Nadzór',
    watchlist: 'Obserwowane',
    archive: 'Archiwum',
    guide: 'Poradnik',
    settings: 'Ustawienia',
    refresh: 'Odśwież',
    search: 'Szukaj monet...',
    exchange: 'Giełda',
    market: 'Rynek',
    price: 'Cena',
    change24h: 'Zmiana 24h',
    volume: 'Wolumen 24h',
    addToSurveillance: 'Dodaj do nadzoru',
    language: 'Język strony',
    allExchanges: 'Wszystkie giełdy',
    allMarkets: 'Wszystkie rynki',
    futures: 'Kontrakty',
    spot: 'Spot',
    bullish: 'Wzrostowe',
    bearish: 'Spadkowe',
    totalCoins: 'Monety',
    loading: 'Ładowanie...',
    telegramAlerts: 'Powiadomienia Telegram',
    metaScalp: 'MetaScalp',
    save: 'Zapisz',
    cancel: 'Anuluj',
    close: 'Zamknij',
    delete: 'Usuń',
    success: 'Sukces',
    error: 'Błąd',
  },
};

const LANGUAGE_STORAGE_KEY = 'crypto_screener_language';

const LanguageContext = createContext<LanguageContextType>({
  language: 'uk',
  setLanguage: () => {},
  t: (key) => key,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as SupportedLanguage;
      if (stored && ['uk', 'en', 'ru', 'pl'].includes(stored)) {
        return stored;
      }
    }
    return 'uk';
  });

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }
  };

  const t = (key: string): string => {
    const dict = translations[language] || translations.uk;
    return dict[key] || translations.uk[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);

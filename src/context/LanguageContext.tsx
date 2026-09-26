import React, { createContext, useContext, useState, useEffect } from 'react';

export type SupportedLanguage = 'uk' | 'en' | 'ru' | 'pl';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string) => string;
}

const translations: Record<SupportedLanguage, Record<string, string>> = {
  uk: {
    // Navigation & General
    screener: 'Скрінер',
    patterns: 'Формації',
    terminal: 'Термінал',
    surveillance: 'Нагляд',
    watchlist: 'Обране',
    archive: 'Архів',
    guide: 'Посібник',
    settings: 'Налаштування',
    refresh: 'Оновити',
    search: 'Пошук монети (BTC, SOL...)',
    exchange: 'Біржа',
    market: 'Ринок',
    price: 'Ціна',
    change24h: 'Зміна 24г',
    volume: 'Обсяг 24г',
    addToSurveillance: 'Додати на нагляд',
    language: 'Мова сайту',
    allExchanges: 'Усі біржі',
    allMarkets: 'Усі ринки',
    futures: 'Фʼючерси (USDT)',
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
    retry: 'Повторити',
    emptyResults: 'Нічого не знайдено',
    resetFilters: 'Скинути фільтри',
    
    // Filters & Presets
    filters: 'Фільтри:',
    all: 'Усі',
    activeCoins: 'Активні',
    topGainers: 'Топ ріст 24г',
    topLosers: 'Топ спад 24г',
    nearHighs: 'На хаях',
    nearLows: 'На лоях',
    highVolatility: 'Висока волатильність',
    highVolume: 'Великий обсяг',
    
    // Categories & Formations
    formations: 'Формації:',
    allFormations: 'Усі формації',
    reversal: 'Розворотні (W, M, ГіП)',
    breakout: 'Пробої & Трикутники',
    continuation: 'Прапори & Трендові',
    compression: 'Стиснення (Squeeze)',
    candlestick: 'Свічкові (Price Action)',
    
    // Bias
    direction: 'Напрямок:',
    long: 'Long (▲)',
    short: 'Short (▼)',
    
    // Volume & Sort
    minVolume: 'Обсяг:',
    allCoinsVol: 'Всі монети',
    sortBy: 'Сортування:',
    byConfidence: 'За впевненістю',
    byVolume: 'За обсягом 24г',
    byPriceChange: 'За % зміни',
    byProfitPotential: 'За потенціалом (R:R)',
    viewCards: 'Сітка карток',
    viewTable: 'Компактна таблиця',
    
    // Table Columns
    coin: 'Монета',
    distToHigh: 'До хаю',
    distToLow: 'До лою',
    volatility: 'Волатильність (5m)',
    action: 'Дії',
    openChart: 'Відкрити графік',
    createAlert: 'Створити алерт',
    sendToMetaScalp: 'Відправити в MetaScalp',
    
    // Details Modal
    targetPrice: 'Цільова ціна (TP)',
    stopLoss: 'Стоп-лосс (SL)',
    entryPrice: 'Ціна входу',
    riskReward: 'Співвідношення R:R',
    confidence: 'Впевненість патерну',
    technicalAnalysis: 'Технічний аналіз',
    formationStatus: 'Статус формації',
    statusActive: 'Активна',
    statusCompleted: 'Відпрацьована',
    statusFailed: 'Скасована',
    
    // Terminal
    addChart: 'Додати графік',
    splitScreens: 'Кількість графіків',
    oneScreen: '1 графік',
    twoScreens: '2 графіки',
    fourScreens: '4 графіки',
    sixScreens: '6 графіків',
    fullScreen: 'На весь екран',
    closeChart: 'Закрити графік',
    searchSymbol: 'Введіть символ (BTCUSDT...)',
    timeframe: 'Таймфрейм',
    
    // Surveillance
    surveillanceTitle: 'Системний нагляд за монетами',
    surveillanceDesc: 'Автоматичний моніторинг аномальних обсягів, підтискань до рівнів та імпульсів',
    addCoinToSurveillance: 'Додати монету до нагляду',
    monitoredList: 'Список монет на нагляді',
    noMonitoredCoins: 'Список нагляду порожній. Додайте монету для автоматичного відстеження.',
    
    // Watchlist
    watchlistTitle: 'Обрані монети',
    emptyWatchlist: 'Ваш список обраного порожній',
    addToWatchlist: 'Додати в обране',
    removeFromWatchlist: 'Видалити з обраного',
  },
  en: {
    // Navigation & General
    screener: 'Screener',
    patterns: 'Patterns',
    terminal: 'Terminal',
    surveillance: 'Surveillance',
    watchlist: 'Watchlist',
    archive: 'Archive',
    guide: 'Guide',
    settings: 'Settings',
    refresh: 'Refresh',
    search: 'Search coins (BTC, SOL...)',
    exchange: 'Exchange',
    market: 'Market',
    price: 'Price',
    change24h: '24h Change',
    volume: '24h Volume',
    addToSurveillance: 'Add to Surveillance',
    language: 'Site Language',
    allExchanges: 'All Exchanges',
    allMarkets: 'All Markets',
    futures: 'Futures (USDT)',
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
    retry: 'Retry',
    emptyResults: 'No coins found',
    resetFilters: 'Reset filters',
    
    // Filters & Presets
    filters: 'Filters:',
    all: 'All',
    activeCoins: 'Active',
    topGainers: 'Top Gainers 24h',
    topLosers: 'Top Losers 24h',
    nearHighs: 'Near Highs',
    nearLows: 'Near Lows',
    highVolatility: 'High Volatility',
    highVolume: 'High Volume',
    
    // Categories & Formations
    formations: 'Formations:',
    allFormations: 'All Formations',
    reversal: 'Reversal (W, M, H&S)',
    breakout: 'Breakout & Triangles',
    continuation: 'Flags & Trends',
    compression: 'Compression (Squeeze)',
    candlestick: 'Candlestick (Price Action)',
    
    // Bias
    direction: 'Direction:',
    long: 'Long (▲)',
    short: 'Short (▼)',
    
    // Volume & Sort
    minVolume: 'Volume:',
    allCoinsVol: 'All coins',
    sortBy: 'Sort by:',
    byConfidence: 'By Confidence',
    byVolume: 'By 24h Volume',
    byPriceChange: 'By % Change',
    byProfitPotential: 'By R:R Ratio',
    viewCards: 'Grid View',
    viewTable: 'Table View',
    
    // Table Columns
    coin: 'Coin',
    distToHigh: 'To High',
    distToLow: 'To Low',
    volatility: 'Volatility (5m)',
    action: 'Actions',
    openChart: 'Open Chart',
    createAlert: 'Create Alert',
    sendToMetaScalp: 'Send to MetaScalp',
    
    // Details Modal
    targetPrice: 'Target Price (TP)',
    stopLoss: 'Stop Loss (SL)',
    entryPrice: 'Entry Price',
    riskReward: 'Risk/Reward (R:R)',
    confidence: 'Pattern Confidence',
    technicalAnalysis: 'Technical Analysis',
    formationStatus: 'Formation Status',
    statusActive: 'Active',
    statusCompleted: 'Completed',
    statusFailed: 'Invalidated',
    
    // Terminal
    addChart: 'Add Chart',
    splitScreens: 'Layout Grid',
    oneScreen: '1 Chart',
    twoScreens: '2 Charts',
    fourScreens: '4 Charts',
    sixScreens: '6 Charts',
    fullScreen: 'Fullscreen',
    closeChart: 'Close Chart',
    searchSymbol: 'Search symbol (BTCUSDT...)',
    timeframe: 'Timeframe',
    
    // Surveillance
    surveillanceTitle: 'Coin Surveillance Radar',
    surveillanceDesc: 'Automated monitoring of anomalous volume, level compression and breakouts',
    addCoinToSurveillance: 'Add coin to surveillance',
    monitoredList: 'Monitored Coin List',
    noMonitoredCoins: 'Surveillance list is empty. Add a coin to begin tracking.',
    
    // Watchlist
    watchlistTitle: 'Watchlist',
    emptyWatchlist: 'Your watchlist is empty',
    addToWatchlist: 'Add to Watchlist',
    removeFromWatchlist: 'Remove from Watchlist',
  },
  ru: {
    // Navigation & General
    screener: 'Скринер',
    patterns: 'Формации',
    terminal: 'Терминал',
    surveillance: 'Наблюдение',
    watchlist: 'Избранное',
    archive: 'Архив',
    guide: 'Руководство',
    settings: 'Настройки',
    refresh: 'Обновить',
    search: 'Поиск монеты (BTC, SOL...)',
    exchange: 'Биржа',
    market: 'Рынок',
    price: 'Цена',
    change24h: 'Изменение 24ч',
    volume: 'Объем 24ч',
    addToSurveillance: 'Добавить в наблюдение',
    language: 'Язык сайта',
    allExchanges: 'Все биржи',
    allMarkets: 'Все рынки',
    futures: 'Фьючерсы (USDT)',
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
    retry: 'Повторить',
    emptyResults: 'Ничего не найдено',
    resetFilters: 'Сбросить фильтры',
    
    // Filters & Presets
    filters: 'Фильтры:',
    all: 'Все',
    activeCoins: 'Активные',
    topGainers: 'Топ рост 24ч',
    topLosers: 'Топ падение 24ч',
    nearHighs: 'На хаях',
    nearLows: 'На лоях',
    highVolatility: 'Высокая волатильность',
    highVolume: 'Большой объем',
    
    // Categories & Formations
    formations: 'Формации:',
    allFormations: 'Все формации',
    reversal: 'Разворотные (W, M, ГиП)',
    breakout: 'Пробои & Треугольники',
    continuation: 'Флаги & Трендовые',
    compression: 'Сжатие (Squeeze)',
    candlestick: 'Свечные (Price Action)',
    
    // Bias
    direction: 'Направление:',
    long: 'Long (▲)',
    short: 'Short (▼)',
    
    // Volume & Sort
    minVolume: 'Объем:',
    allCoinsVol: 'Все монеты',
    sortBy: 'Сортировка:',
    byConfidence: 'По уверенности',
    byVolume: 'По объему 24ч',
    byPriceChange: 'По % изменения',
    byProfitPotential: 'По потенциалу (R:R)',
    viewCards: 'Сетка карточек',
    viewTable: 'Компактная таблица',
    
    // Table Columns
    coin: 'Монета',
    distToHigh: 'К хаю',
    distToLow: 'К лою',
    volatility: 'Волатильность (5m)',
    action: 'Действия',
    openChart: 'Открыть график',
    createAlert: 'Создать алерт',
    sendToMetaScalp: 'Отправить в MetaScalp',
    
    // Details Modal
    targetPrice: 'Целевая цена (TP)',
    stopLoss: 'Стоп-лосс (SL)',
    entryPrice: 'Цена входа',
    riskReward: 'Соотношение R:R',
    confidence: 'Уверенность паттерна',
    technicalAnalysis: 'Технический анализ',
    formationStatus: 'Статус формации',
    statusActive: 'Активна',
    statusCompleted: 'Отработана',
    statusFailed: 'Отменена',
    
    // Terminal
    addChart: 'Добавить график',
    splitScreens: 'Количество графиков',
    oneScreen: '1 график',
    twoScreens: '2 графика',
    fourScreens: '4 графика',
    sixScreens: '6 графиков',
    fullScreen: 'На весь экран',
    closeChart: 'Закрыть график',
    searchSymbol: 'Введите символ (BTCUSDT...)',
    timeframe: 'Таймфрейм',
    
    // Surveillance
    surveillanceTitle: 'Системное наблюдение за монетами',
    surveillanceDesc: 'Автоматический мониторинг аномальных объемов, поджатий к уровням и импульсов',
    addCoinToSurveillance: 'Добавить монету в наблюдение',
    monitoredList: 'Список монет под наблюдением',
    noMonitoredCoins: 'Список наблюдения пуст. Добавьте монету для автоматического отслеживания.',
    
    // Watchlist
    watchlistTitle: 'Избранные монеты',
    emptyWatchlist: 'Ваш список избранного пуст',
    addToWatchlist: 'Добавить в избранное',
    removeFromWatchlist: 'Удалить из избранного',
  },
  pl: {
    // Navigation & General
    screener: 'Skaner',
    patterns: 'Formacje',
    terminal: 'Terminal',
    surveillance: 'Nadzór',
    watchlist: 'Obserwowane',
    archive: 'Archiwum',
    guide: 'Poradnik',
    settings: 'Ustawienia',
    refresh: 'Odśwież',
    search: 'Szukaj monet (BTC, SOL...)',
    exchange: 'Giełda',
    market: 'Rynek',
    price: 'Cena',
    change24h: 'Zmiana 24h',
    volume: 'Wolumen 24h',
    addToSurveillance: 'Dodaj do nadzoru',
    language: 'Język strony',
    allExchanges: 'Wszystkie giełdy',
    allMarkets: 'Wszystkie rynki',
    futures: 'Kontrakty (USDT)',
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
    retry: 'Ponów',
    emptyResults: 'Nic nie znaleziono',
    resetFilters: 'Resetuj filtry',
    
    // Filters & Presets
    filters: 'Filtry:',
    all: 'Wszystkie',
    activeCoins: 'Aktywne',
    topGainers: 'Największy wzrost 24h',
    topLosers: 'Największy spadek 24h',
    nearHighs: 'Przy szczytach',
    nearLows: 'Przy dołkach',
    highVolatility: 'Wysoka zmienność',
    highVolume: 'Wysoki wolumen',
    
    // Categories & Formations
    formations: 'Formacje:',
    allFormations: 'Wszystkie formacje',
    reversal: 'Odwrócenia (W, M, RGR)',
    breakout: 'Wybicia & Trójkąty',
    continuation: 'Flagi & Trendowe',
    compression: 'Kompresja (Squeeze)',
    candlestick: 'Świecowe (Price Action)',
    
    // Bias
    direction: 'Kierunek:',
    long: 'Long (▲)',
    short: 'Short (▼)',
    
    // Volume & Sort
    minVolume: 'Wolumen:',
    allCoinsVol: 'Wszystkie monety',
    sortBy: 'Sortowanie:',
    byConfidence: 'Według pewności',
    byVolume: 'Według wolumenu 24h',
    byPriceChange: 'Według % zmiany',
    byProfitPotential: 'Według R:R',
    viewCards: 'Widok kafelków',
    viewTable: 'Kompaktowa tabela',
    
    // Table Columns
    coin: 'Moneta',
    distToHigh: 'Do szczytu',
    distToLow: 'Do dołka',
    volatility: 'Zmienność (5m)',
    action: 'Działania',
    openChart: 'Otwórz wykres',
    createAlert: 'Utwórz alert',
    sendToMetaScalp: 'Wyślij do MetaScalp',
    
    // Details Modal
    targetPrice: 'Cena docelowa (TP)',
    stopLoss: 'Stop Loss (SL)',
    entryPrice: 'Cena wejścia',
    riskReward: 'Stosunek R:R',
    confidence: 'Pewność formacji',
    technicalAnalysis: 'Analiza techniczna',
    formationStatus: 'Status formacji',
    statusActive: 'Aktywna',
    statusCompleted: 'Zrealizowana',
    statusFailed: 'Anulowana',
    
    // Terminal
    addChart: 'Dodaj wykres',
    splitScreens: 'Układ wykresów',
    oneScreen: '1 wykres',
    twoScreens: '2 wykresy',
    fourScreens: '4 wykresy',
    sixScreens: '6 wykresów',
    fullScreen: 'Pełny ekran',
    closeChart: 'Zamknij wykres',
    searchSymbol: 'Wyszukaj symbol (BTCUSDT...)',
    timeframe: 'Interwał',
    
    // Surveillance
    surveillanceTitle: 'Nadzór systemowy monet',
    surveillanceDesc: 'Automatyczne monitorowanie nietypowego wolumenu, kompresji i wybić',
    addCoinToSurveillance: 'Dodaj monetę do nadzoru',
    monitoredList: 'Lista monet pod nadzorem',
    noMonitoredCoins: 'Lista nadzoru jest pusta. Dodaj monetę do automatycznego śledzenia.',
    
    // Watchlist
    watchlistTitle: 'Obserwowane monety',
    emptyWatchlist: 'Twoja lista obserwowanych jest pusta',
    addToWatchlist: 'Dodaj do obserwowanych',
    removeFromWatchlist: 'Usuń z obserwowanych',
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

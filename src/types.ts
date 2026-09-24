export type ExchangeId = 'binance' | 'bybit';
export type MarketType = 'futures' | 'spot';
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export type ActivePageType = 'patterns' | 'screener' | 'terminal' | 'surveillance';

export type TerminalBlockMode = 'tradingview' | 'pattern' | 'orderbook';

export interface TerminalChartBlock {
  id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  timeframe: Timeframe;
  mode: TerminalBlockMode;
  formationId?: string;
  colSpan?: 1 | 2 | 3 | 4 | 'full';
  heightPx?: number;
  domSettings?: {
    compression?: number; // 1, 2, 5, 10, 20, 50, 100
    depth?: 'small' | 'medium' | 'deep'; // 20, 50, 100
    densityThresholdUsd?: number;
    soundAlertEnabled?: boolean;
    clusterTimeframe?: Timeframe;
  };
}

export interface TerminalWorkspaceConfig {
  layoutPreset: '1x1' | '1x2' | '2x1' | '2x2' | '2x3' | 'custom';
  columns: 1 | 2 | 3 | 4;
  autoFitScreen: boolean;
  blocks: TerminalChartBlock[];
  showFormations: boolean;
  blockHeight: 'compact' | 'medium' | 'large';
  globalTimeframe?: Timeframe;
}

export type PatternCategory = 'reversal' | 'continuation' | 'breakout' | 'compression' | 'candlestick';
export type PatternBias = 'bullish' | 'bearish' | 'neutral';
export type PatternStatus = 'forming' | 'breakout' | 'ready_to_break' | 'retest' | 'target_reached';

export interface Kline {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PatternLevel {
  label: string;
  price: number;
  type: 'support' | 'resistance' | 'neckline' | 'target' | 'stop_loss' | 'trigger';
}

export interface DetectedFormation {
  id: string;
  patternKey: string;
  name: string;
  nameEn: string;
  category: PatternCategory;
  bias: PatternBias;
  confidence: number; // 0 - 100
  status: PatternStatus;
  statusLabel: string;
  description: string;
  levels: {
    entryPrice: number;
    targetPrice: number;
    stopLossPrice: number;
    supportPrice?: number;
    resistancePrice?: number;
    necklinePrice?: number;
  };
  riskRewardRatio: number;
  potentialProfitPct: number;
  potentialRiskPct: number;
  detectedAt: number;
  candleStartIndex?: number;
  candleEndIndex?: number;
}

export interface ScannedCoin {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  currentPrice: number;
  priceChange24h: number;
  highPrice24h: number;
  lowPrice24h: number;
  volume24hUsd: number;
  formations: DetectedFormation[];
  timeframe: Timeframe;
  lastUpdated: number;
  exchangeUrl: string;
  high24h?: number;
  low24h?: number;
  hasFormations?: boolean;
  bestFormation?: DetectedFormation;
}

export interface ScreenerFilterState {
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
  timeframe: Timeframe;
  category: 'all' | PatternCategory;
  bias: 'all' | PatternBias;
  status: 'all' | PatternStatus;
  minVolumeUsd: number; // in USD
  searchQuery: string;
  sortBy: 'confidence' | 'volume' | 'priceChange' | 'profitPotential';
  sortOrder: 'asc' | 'desc';
}

export interface FormationAIAnalysis {
  summary: string;
  patternConfirmation: string;
  targetAnalysis: string;
  invalidationCriteria: string;
  volumeRecommendation: string;
  tradeScenario: {
    recommendedEntry: string;
    tp1: string;
    tp2: string;
    stopLoss: string;
    rrRatio: string;
  };
  keyRisks: string[];
}

export type AlertCondition = 'gte' | 'lte';
export type AlertLevelType = 'entry' | 'target' | 'stop_loss' | 'custom';

export interface PriceAlert {
  id: string;
  userId?: string;
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  targetPrice: number;
  condition: AlertCondition; // 'gte' (>=) or 'lte' (<=)
  note?: string;
  formationName?: string;
  levelType?: AlertLevelType;
  createdAt: number;
  isActive: boolean;
  triggered: boolean;
  triggeredAt?: number;
  triggeredPrice?: number;
  // Per-user telegram credentials
  telegramBotToken?: string;
  telegramChatId?: string;
}

export interface AlertHistoryItem {
  id: string;
  userId: string;
  alertId?: string;
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  condition: AlertCondition;
  targetPrice: number;
  triggeredPrice: number;
  formationName?: string;
  levelType?: AlertLevelType;
  note?: string;
  triggeredAt: number;
  telegramSent: boolean;
  telegramError?: string;
  telegramStatus?: 'sent' | 'failed' | 'not_configured';
  createdAt?: string;
}

export interface MetaScalpSettings {
  enabled: boolean;
  port: number;
  binding: string; // '001' - '500'
  autoSwitchOnClick: boolean;
}

export interface UserProfile {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramBotUsername?: string;
  defaultExchange?: 'all' | ExchangeId;
  defaultMarketType?: 'all' | MarketType;
  defaultTimeframe?: Timeframe;
  soundAlertsEnabled?: boolean;
  watchlist?: string[];
  watchlistFolders?: Record<string, string[]>;
  metaScalpSettings?: MetaScalpSettings;
  inviteCode?: string;
  createdAt?: string;
  updatedAt?: string;
  chartLabelSettings?: { entry: boolean; target: boolean; stop: boolean };
}

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
}

export interface TelegramStatus {
  isConfigured: boolean;
  botUsername?: string;
  chatId?: string;
  hasEnvToken: boolean;
  hasEnvChatId: boolean;
}

export type ScreenerPresetFilter =
  | 'all'
  | 'active'
  | 'top_gainers'
  | 'top_losers'
  | 'near_highs'
  | 'near_lows';

export type ScreenerSortBy =
  | 'volume'
  | 'priceChange'
  | 'price'
  | 'volatility'
  | 'distanceToHigh'
  | 'distanceToLow';

export interface MarketCoin {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  price: number;
  change24h: number;
  volumeUsd: number;
  high24h: number;
  low24h: number;
  distanceToHighPct: number;
  distanceToLowPct: number;
  volatility24hPct: number;
  isNearHigh: boolean;
  isNearLow: boolean;
  isActiveCoin: boolean;
  exchangeUrl: string;
  hasFormations?: boolean;
  formationsCount?: number;
}

export interface ChartMarkerInfo {
  id: string;
  type: 'entry' | 'target' | 'stop_loss' | 'neckline' | 'resistance' | 'support' | 'custom' | 'pattern_point';
  label: string;
  price: number;
  color: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
  time?: number; // Candle timestamp in seconds
  position?: 'aboveBar' | 'belowBar' | 'inBar';
  shape?: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  notes?: string;
}

export interface ChartRestoreParams {
  timeframe: Timeframe;
  historyLimit: number;
  lastClosePrice: number;
  visibleRange?: { from: number; to: number };
  savedAtCandleTime?: number;
}

export interface ArchivedFormation {
  id: string;
  userId: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  timeframe: Timeframe;
  formationName: string;
  bias: PatternBias;
  confidence?: number;
  status?: PatternStatus;
  entryPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  necklinePrice?: number;
  resistancePrice?: number;
  supportPrice?: number;
  savedPrice: number;
  formation: DetectedFormation;
  markers: ChartMarkerInfo[];
  chartParams: ChartRestoreParams;
  notes?: string;
  createdAt: string;
  savedAtTimestamp: number;
}

export interface SmartAnalysisData {
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  currentPrice: number;
  lastUpdated: number;

  // 1. Overall Score & Verdict
  score: number; // 1 to 10
  verdict: 'STRONG_BUY' | 'BUY' | 'NEUTRAL_WAIT' | 'SELL' | 'AVOID';
  verdictLabel: string;
  summary: string;
  positionSizingRecommendation: string;
  tradeScenario: {
    entryZoneMin: number;
    entryZoneMax: number;
    optimalEntry: number;
    stopLoss: number;
    stopLossPct: number;
    tp1: number;
    tp1Pct: number;
    tp2: number;
    tp2Pct: number;
    tp3: number;
    tp3Pct: number;
    riskRewardRatio: number;
  };

  // 2. Trend, RSI & Moving Averages
  trend: {
    rsi14: number;
    rsiStatus: 'oversold' | 'neutral' | 'overbought';
    rsiLabel: string;
    ema20: number;
    ema50: number;
    ema200: number;
    priceVsEma: string;
    crossSignal: 'golden_cross' | 'death_cross' | 'bullish_alignment' | 'bearish_alignment' | 'compression';
    crossSignalLabel: string;
    strengthPct: number;
  };

  // 3. BTC Multi-Timeframe Context
  btcContext: {
    btcPrice: number;
    change24h: number;
    timeframes: {
      '15m': { direction: 'up' | 'down' | 'sideways'; structure: 'HH_HL' | 'LH_LL' | 'range'; label: string };
      '5m': { direction: 'up' | 'down' | 'sideways'; structure: 'HH_HL' | 'LH_LL' | 'range'; label: string };
      '1m': { direction: 'up' | 'down' | 'sideways'; structure: 'HH_HL' | 'LH_LL' | 'range'; label: string };
    };
    overallStructure: 'HH_HL' | 'LH_LL' | 'range';
    overallStructureLabel: string;
    hasSharpImpulse: boolean;
    impulseType: 'pump' | 'dump' | 'none';
    impulseDescription: string;
    upcomingNews: Array<{
      title: string;
      timeUntil: string;
      impact: 'high' | 'medium' | 'low';
    }>;
  };

  // 4. Volumes, Spread & Volatility
  volumeMetrics: {
    volume24hUsd: number;
    volume1hUsd: number;
    volume1hSpikeRatio: number;
    hasVolumeSpike: boolean;
  };
  spread: {
    spreadUsd: number;
    spreadPct: number;
    quality: 'ultra_tight' | 'normal' | 'wide';
  };
  volatility: {
    dailyRangePct: number;
    atr: number;
    atrPct: number;
    positionInDayRangePct: number; // 0% = Low, 100% = High
    high24h: number;
    low24h: number;
  };

  // 5. Orderbook & Walls
  orderbook: {
    bidAskRatio: number;
    dominantSide: 'bids' | 'asks' | 'balanced';
    bidWallUsd: number;
    bidWallPrice: number;
    askWallUsd: number;
    askWallPrice: number;
    largeOrders: Array<{
      side: 'bid' | 'ask';
      price: number;
      amountUsd: number;
      distancePct: number;
      significance: 'whale' | 'large' | 'medium';
    }>;
  };

  // 6. Derivatives & Open Interest
  derivatives: {
    hasPerpFutures: boolean;
    fundingRate: number; // in %
    predictedFundingRate: number; // in %
    fundingBias: 'bullish' | 'bearish' | 'neutral';
    binanceOI: {
      currentUsd: number;
      change1hPct: number;
      history: number[]; // mini sparkline
    };
    bybitOI: {
      currentUsd: number;
      change1hPct: number;
      history: number[]; // mini sparkline
    };
    totalOIUsd: number;
    oiTrend: 'increasing' | 'decreasing' | 'stable';
  };

  // 7. POC, Liquidity Levels & S/R
  levels: {
    pocPrice: number;
    pocVolumePct: number;
    liquidityLevels: Array<{
      label: string;
      price: number;
      type: 'buy_side' | 'sell_side';
      distancePct: number;
    }>;
    strongSupport: number;
    strongResistance: number;
  };

  // 8. Institutional & Manipulation Analysis
  participants: {
    // 1. Аналіз Holders
    holders: {
      status: 'accumulation' | 'distribution' | 'neutral';
      statusLabel: string;
      top10ConcentrationPct: number;
      activeWalletsGrowthPct: number;
      retailVsWhaleRatio: string;
      phaseDescription: string;
    };
    // 2. Авто-виявлення Великого Учасника (Whale / Smart Money)
    largePlayer: {
      detected: boolean;
      confidencePct: number;
      actionType: 'accumulation' | 'absorption' | 'twap_buying' | 'distribution' | 'none';
      actionLabel: string;
      clusterVolumeUsd: number;
      details: string;
      trackedClusters: Array<{
        type: 'iceberg' | 'block_trade' | 'absorption' | 'twap';
        side: 'buy' | 'sell';
        price: number;
        volumeUsd: number;
        timestampDesc: string;
      }>;
    };
    // 3. Авто-виявлення Маркет-Мейкерів
    marketMaker: {
      detected: boolean;
      activityLevel: 'high' | 'moderate' | 'low';
      activityLabel: string;
      algorithmType: 'hft_grid' | 'spread_arbitrage' | 'synthetic_liquidity' | 'passive_quoting';
      spreadSupportScore: number; // 0 - 100
      orderbookReplenishmentSpeed: 'ultra_fast' | 'normal' | 'slow';
      antiSqueezeProtection: boolean;
      details: string;
    };
    // 4. Авто-виявлення Маніпулятивних Монет
    manipulativeCoin: {
      isManipulative: boolean;
      riskScore: number; // 0 to 100
      riskLevel: 'low' | 'medium' | 'high' | 'extreme';
      riskLabel: string;
      signals: Array<{
        name: string;
        detected: boolean;
        severity: 'low' | 'medium' | 'high';
        description: string;
      }>;
      warningSummary: string;
    };
    // Backwards compatibility legacy fields
    holdersStatus?: 'accumulation' | 'distribution' | 'neutral';
    holdersConcentrationPct?: number;
    largePlayerDetected?: boolean;
    largePlayerNote?: string;
    marketMakerDetected?: boolean;
    marketMakerNote?: string;
    isManipulativeCoin?: boolean;
    manipulativeRiskLevel?: 'low' | 'medium' | 'high' | 'extreme';
    manipulativeReasons?: string[];
  };
}

export interface MarketSentimentData {
  compositeScore: number; // 0 to 100
  sentimentState: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  sentimentLabel: string;
  summary: string;

  priceTrendDynamics: {
    advancingCount: number;
    decliningCount: number;
    advancingPct: number;
    trendBias: 'bullish' | 'bearish' | 'neutral';
    avgChange24h: number;
  };

  tradingVolume: {
    total24hUsd: number;
    volumeVelocity: 'high' | 'normal' | 'low';
    volumeChangePct: number;
  };

  marketVolatility: {
    index: number; // 0 - 100
    label: string;
    avgDailyRangePct: number;
  };

  marketBreadth: {
    aboveEma20Pct: number;
    nearHighsPct: number;
    nearLowsPct: number;
    breadthScore: number;
    verdict: string;
  };

  capitalFlow: {
    netInflow24hUsd: number;
    direction: 'inflow' | 'outflow' | 'neutral';
    label: string;
  };

  derivativesOverview: {
    aggregatedOIUsd: number;
    oiChange24hPct: number;
    avgFundingRate: number;
    fundingBias: 'long_heavy' | 'short_heavy' | 'balanced';
  };

  lastUpdated: number;
}

export type SurveillanceEventType = 'structure' | 'level' | 'momentum' | 'risk';

export interface SurveillanceConfig {
  timeframe: '15m' | '1h' | '4h' | '1d';
  triggerMode: 'bar_close' | 'realtime'; // Once Per Bar Close vs Instant Realtime
  levelsEnabled: boolean; // Senior 4H/1D levels & local 1H levels
  structureEnabled: boolean; // Market structure BOS/CHoCH
  momentumEnabled: boolean; // Moving Up/Down % in N bars
  momentumPct: number; // e.g. 2.5%
  momentumBars: number; // e.g. 3 bars
  momentumTf: '15m' | '1h' | '4h';
  channelEnabled: boolean; // Donchian/Bollinger breakout
  fibonacciEnabled: boolean; // 0.618 Golden Pocket zones
  cooldownMinutes: number; // Minutes between alerts for same event
}

export interface SurveillanceEvent {
  id: string;
  type: SurveillanceEventType;
  title: string;
  description: string;
  price: number;
  timestamp: number;
  severity: 'info' | 'warning' | 'critical';
  details?: Record<string, any>;
}

export interface SurveillanceState {
  currentPrice: number;
  change24h: number;
  high1d: number;
  low1d: number;
  swingHigh4h: number;
  swingLow4h: number;
  localHigh1h: number;
  localLow1h: number;
  rangePositionPct: number; // 0 - 100% position in 4H range
  resistance4h: number;
  support4h: number;
  nextZoneUp: number;
  nextZoneDown: number;
  fib618: number;
  fib786: number;
  structureTrend: 'bullish' | 'bearish' | 'consolidation';
  channelUpper: number;
  channelLower: number;
  momentumRecentPct?: number;
  lastEvent?: SurveillanceEvent;
  recentEvents?: SurveillanceEvent[];
  lastCalculated?: number;
}

export interface SurveillanceCoin {
  id: string;
  userId: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  lastNotifiedAt?: string;
  config: SurveillanceConfig;
  state?: SurveillanceState;
}


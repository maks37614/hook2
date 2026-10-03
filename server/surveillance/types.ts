import { ExchangeId, MarketType, Timeframe } from '../../src/types';

export type OrderBookStatus = 'CONNECTING' | 'SYNCING' | 'LIVE' | 'STALE' | 'RESYNCING' | 'ERROR';

export interface OrderBookLevel {
  price: number;
  quantity: number;
  notionalUsd: number;
}

export interface OrderBookState {
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadPct: number;
  lastUpdateId: number;
  sequence: number;
  timestamp: number;
  status: OrderBookStatus;
  lastReceivedAt: number;
  dataValid?: boolean;
  sequenceGap?: boolean;
}

export interface DensityItem {
  id: string;
  price: number;
  side: 'BID' | 'ASK';
  quantity: number;
  notionalUsd: number;
  distancePct: number;
  firstSeenAt: number;
  lastSeenAt: number;
  ageSeconds: number;
  maxSizeUsd: number;
  averageSizeUsd: number;
  persistenceRatio: number;
  classification: 'PERSISTENT_LIQUIDITY' | 'TRANSIENT_LIQUIDITY' | 'POSSIBLE_SPOOF' | 'STANDARD';
  qualityScore?: number;
  persistenceSamples?: number;
  cancellationRate?: number;
  replenishmentRate?: number;
  lastSizeChangeAt?: number;
  historicalReaction?: {
    median5mPct: number;
    median15mPct: number;
    median1hPct: number;
    sampleCount: number;
  };
}

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: 'HIGH' | 'LOW';
  classification: 'STRUCTURAL_SWING' | 'MAJOR_SWING' | 'MINOR_SWING';
}

export interface StructureBreak {
  type: 'BOS' | 'CHoCH';
  direction: 'BULLISH' | 'BEARISH';
  price: number;
  brokenSwingPrice: number;
  time: number;
  timeframe: Timeframe;
  confirmed: boolean;
  volumeConfirmed: boolean;
}

export interface TimeframeStructure {
  timeframe: Timeframe;
  trend: 'BULLISH' | 'BEARISH' | 'RANGE' | 'TRANSITION';
  score: number; // -100 to +100
  recentSwings: SwingPoint[];
  lastBreak?: StructureBreak;
  higherHighsCount: number;
  lowerHighsCount: number;
  higherLowsCount: number;
  lowerLowsCount: number;
}

export interface LevelZone {
  id: string;
  timeframe: Timeframe;
  type: 'SUPPORT' | 'RESISTANCE';
  zoneLow: number;
  zoneHigh: number;
  zoneCenter: number;
  touches: number;
  strongReactions: number;
  weakReactions: number;
  averageReactionPct: number;
  maxReactionPct: number;
  strengthScore: number; // 0–100
  firstSeen: number;
  lastTouchTime: number;
  orderBookDensityUsd?: number;
}

export type ThirdTouchState =
  | 'NOT_EXPECTED'
  | 'APPROACHING'
  | 'ACTIVE'
  | 'REACTION'
  | 'BREAKOUT'
  | 'FAILED';

export interface ThirdTouchTracker {
  levelId: string;
  levelType: 'SUPPORT' | 'RESISTANCE';
  price: number;
  touchCount: number;
  state: ThirdTouchState;
  distancePct: number;
  approachSpeed: 'SLOW' | 'NORMAL' | 'FAST';
  compression: boolean;
  higherLowsCount: number;
  lowerHighsCount: number;
  askDensityUsd?: number;
  bidDensityUsd?: number;
  volumeRatio: number;
  updatedAt: number;
}

export interface DetectedPattern {
  id?: string;
  validationPassed?: boolean;
  levels?: { entryPrice: number; stopLossPrice: number; targetPrice: number };
  name: string;
  type:
    | 'Double Top'
    | 'Double Bottom'
    | 'Triple Top'
    | 'Triple Bottom'
    | 'Ascending Triangle'
    | 'Descending Triangle'
    | 'Symmetrical Triangle'
    | 'Range'
    | 'Channel'
    | 'Flag'
    | 'Pennant'
    | 'Wedge'
    | 'Compression';
  bias: 'bullish' | 'bearish' | 'neutral';
  score: number; // 0–100
  upperBoundary: number;
  lowerBoundary: number;
  touchesUpper: number;
  touchesLower: number;
  compression: boolean;
  timeframe: Timeframe;
  status: 'FORMING' | 'READY' | 'BROKEN' | 'INVALIDATED';
}

export interface TradeFlowSnapshot {
  aggressiveBuyUsd: number;
  aggressiveSellUsd: number;
  imbalanceRatio: number; // buy / sell
  largeTradeCount: number;
  totalTradeCount: number;
  averageTradeSizeUsd: number;
  recentTradesWindowMs: number;
  deltaUsd?: number;
  deltaZScore?: number;
  deltaAcceleration?: number;
}

export interface OISnapshot {
  currentUsd: number;
  amountCoins: number;
  change1mPct: number;
  change5mPct: number;
  change15mPct: number;
  change1hPct: number;
  change4hPct: number;
  regime: 'PRICE_UP_OI_UP' | 'PRICE_UP_OI_DOWN' | 'PRICE_DOWN_OI_UP' | 'PRICE_DOWN_OI_DOWN' | 'NEUTRAL';
  isAnomaly: boolean;
}

export interface BTCContextSnapshot {
  currentPrice: number;
  trend1d: 'Bullish' | 'Bearish' | 'Neutral';
  trend4h: 'Bullish' | 'Bearish' | 'Neutral';
  trend1h: 'Bullish' | 'Bearish' | 'Neutral';
  trend15m: 'Bullish' | 'Bearish' | 'Neutral';
  btcDominance: number;
  btcDominanceRegime: 'rising' | 'falling' | 'range' | 'breakout';
  totalMarketCapUsd: number;
  totalMarketCapRegime: 'expansion' | 'contraction' | 'neutral';
  correlationAltBtc: number; // -1 to +1
  relativeStrength: 'STRONG' | 'NEUTRAL' | 'WEAK';
  lastUpdated: number;
}

export type SetupType =
  | 'SUPPORT_RETEST'
  | 'BREAKOUT_RETEST'
  | 'STRUCTURE_SHIFT'
  | 'RESISTANCE_REJECTION'
  | 'LIQUIDITY_REACTION';

export type SetupStage =
  | 'IDLE'
  | 'SUPPORT_APPROACH'
  | 'APPROACHING'
  | 'IN_ZONE'
  | 'REACTION_WATCH'
  | 'TRIGGERING'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'ENTRY_ACTIVE'
  | 'TARGET_1'
  | 'TARGET_2'
  | 'INVALIDATED'
  | 'EXPIRED'
  | 'COMPLETED';


export interface SetupConfluenceComponent {
  score: number;
  max: number;
  status: 'STRONG' | 'GOOD' | 'WEAK' | 'MISSING' | 'CONFLICT';
  evidence: string;
}

export interface SetupConfluenceBreakdown {
  total: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  components: {
    formation: SetupConfluenceComponent;
    htf: SetupConfluenceComponent;
    location: SetupConfluenceComponent;
    trigger: SetupConfluenceComponent;
    volume: SetupConfluenceComponent;
    orderFlow: SetupConfluenceComponent;
    orderBook: SetupConfluenceComponent;
    oi: SetupConfluenceComponent;
    marketContext: SetupConfluenceComponent;
  };
  independentConfirmations: number;
  conflicts: string[];
  missing: string[];
  notes: string[];
}

export interface SetupInstance {
  id: string;
  type: SetupType;
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  timeframe: Timeframe;
  stage: SetupStage;
  direction: 'LONG' | 'SHORT';
  entryZone: { low: number; high: number };
  preferredEntry?: number;
  confirmationEntry?: number;
  aggressiveEntry?: number;
  invalidationPrice: number;
  targetPrice: number;
  targets?: number[];
  confluenceScore: number; // 0–100
  confirmations: string[];
  waitingFor: string;
  evidence: {
    htfStructure: string;
    levelStrength: number;
    densityPresence: string;
    volumeProfile: string;
    oiContext: string;
    btcContext: string;
    formationScore: number;
  };
  createdAt: number;
  updatedAt: number;
  confluenceBreakdown?: SetupConfluenceBreakdown;
  entryQuality?: {
    score: number;
    formationScore?: number;
    htfScore?: number;
    levelScore?: number;
    triggerScore?: number;
    structureScore?: number;
    volumeScore?: number;
    flowScore?: number;
    orderBookScore?: number;
    oiScore?: number;
    marketContextScore?: number;
    riskReward: number;
    hardGatesPassed: boolean;
    independentConfirmations: number;
    entryType: 'REVERSAL_RECLAIM' | 'BREAKOUT_RETEST' | 'BOS_RETEST' | 'LIQUIDITY_REACTION';
    preferredEntry: number;
    entryZone?: { low: number; high: number };
    invalidation?: number;
    targets?: number[];
  };
}

export interface EngineAlertEvent {
  eventId: string;
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  type:
    | 'LEVEL_DETECTED'
    | 'THIRD_TOUCH_APPROACHING'
    | 'THIRD_TOUCH_ACTIVE'
    | 'THIRD_TOUCH_REACTION'
    | 'FORMATION_DETECTED'
    | 'FORMATION_INVALIDATED'
    | 'BREAKOUT_REALTIME'
    | 'BREAKOUT_CONFIRMED'
    | 'CHANNEL_BREAK'
    | 'SUPPORT_RETEST_WATCH'
    | 'SUPPORT_RETEST_CONFIRMED'
    | 'RESISTANCE_RETEST_CONFIRMED'
    | 'FORMATION_SETUP_CONFIRMED'
    | 'BREAKOUT_RETEST'
    | 'STRUCTURE_SHIFT'
    | 'BOS'
    | 'CHoCH'
    | 'DENSITY_APPEARED'
    | 'DENSITY_PERSISTENT'
    | 'DENSITY_REMOVED'
    | 'OI_ANOMALY'
    | 'VOLUME_ANOMALY'
    | 'IMPULSE'
    | 'SESSION_CHANGED'
    | 'NEWS'
    | 'MARKET_CONTEXT_CHANGED'
    | 'SUPPORT_RESISTANCE_FLIP'
    | 'PRESSURE_TO_HIGH'
    | 'PRESSURE_TO_LOW';
  title: string;
  description: string;
  price: number;
  timeframe: Timeframe;
  severity: 'INFO' | 'WATCH' | 'IMPORTANT' | 'HIGH' | 'CRITICAL';
  confluenceScore: number;
  evidence: Record<string, any>;
  timestamp: number;
}

export type TradingSessionName = 'Asia' | 'London' | 'New York' | 'London/NY Overlap' | 'Weekend';

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  publishedAt: number;
  category: string;
  relevance: 'HIGH' | 'MEDIUM' | 'LOW';
  potentialImpact: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'UNCLEAR';
  summary: string;
  symbols: string[];
}

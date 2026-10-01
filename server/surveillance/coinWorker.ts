import { ExchangeId, MarketType, SurveillanceCoin, Timeframe } from '../../src/types';
import { fetchDualExchangeOI, fetchKlines } from '../marketService';
import { ExchangeStreamClient, RawDepthDelta, RawTradeEvent } from './exchangeStream';
import { LevelsAndFormationsEngine } from './levelsAndFormationsEngine';
import { MacroAndNewsEngine } from './macroAndNewsEngine';
import { MultiTimeframeEngine } from './multiTimeframeEngine';
import { OrderBookEngine } from './orderBookEngine';
import { SetupEngine } from './setupEngine';
import { StateMachineAndAlerts } from './stateMachineAndAlerts';
import {
  DensityItem,
  DetectedPattern,
  EngineAlertEvent,
  LevelZone,
  OISnapshot,
  OrderBookState,
  SetupInstance,
  ThirdTouchTracker,
  TimeframeStructure,
  TradeFlowSnapshot,
} from './types';
import { VolumeAndOIEngine } from './volumeAndOIEngine';

export interface CoinWorkerSnapshot {
  id: string;
  userId: string;
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  isActive: boolean;
  status: string;
  currentPrice: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24hUsd: number;
  orderBookState: OrderBookState;
  densities: DensityItem[];
  structures: Record<Timeframe, TimeframeStructure>;
  levelZones: LevelZone[];
  thirdTouches: ThirdTouchTracker[];
  patterns: DetectedPattern[];
  tradeFlow: TradeFlowSnapshot;
  oiSnapshot: OISnapshot;
  setups: SetupInstance[];
  recentEvents: EngineAlertEvent[];
  lastAnalysisTimestamp: number;
}

export class CoinWorker {
  private streamClient: ExchangeStreamClient;
  private orderBookEngine: OrderBookEngine;
  private mtfEngine: MultiTimeframeEngine;
  private levelsEngine: LevelsAndFormationsEngine;
  private volumeOIEngine: VolumeAndOIEngine;
  private setupEngine: SetupEngine;

  private isDestroyed = false;
  private slowAnalysisInterval: NodeJS.Timeout | null = null;
  private oiFetchInterval: NodeJS.Timeout | null = null;

  public currentPrice = 0;
  public high24h = 0;
  public low24h = 0;
  public change24h = 0;
  public volume24hUsd = 0;
  public lastAnalysisTimestamp = 0;

  private structures: Record<Timeframe, TimeframeStructure> = {} as any;
  private levelZones: LevelZone[] = [];
  private thirdTouches: ThirdTouchTracker[] = [];
  private patterns: DetectedPattern[] = [];
  private setups: SetupInstance[] = [];
  private recentEvents: EngineAlertEvent[] = [];

  constructor(
    public readonly coin: SurveillanceCoin,
    private macroEngine: MacroAndNewsEngine,
    private alertManager: StateMachineAndAlerts
  ) {
    this.streamClient = new ExchangeStreamClient(coin.symbol, coin.exchange, coin.marketType);
    this.orderBookEngine = new OrderBookEngine(coin.symbol, coin.exchange, coin.marketType);
    this.mtfEngine = new MultiTimeframeEngine();
    this.levelsEngine = new LevelsAndFormationsEngine();
    this.volumeOIEngine = new VolumeAndOIEngine();
    this.setupEngine = new SetupEngine();

    this.init();
  }

  private async init() {
    this.setupStreamListeners();
    await this.loadInitialHistory();
    this.startPeriodicTasks();
    this.runDeepAnalysis();
  }

  private setupStreamListeners() {
    // 1. Live Ticker / Price Tick
    this.streamClient.on('price', (data: { price: number; high24h: number; low24h: number; volume24hUsd: number; time: number }) => {
      this.currentPrice = data.price;
      this.high24h = data.high24h;
      this.low24h = data.low24h;
      this.volume24hUsd = data.volume24hUsd;
      if (data.low24h > 0 && data.high24h > 0) {
        // approximate change
        this.change24h = Number((((data.price - data.low24h) / data.low24h) * 100).toFixed(2));
      }
    });

    // 2. Real-time Trade Flow
    this.streamClient.on('trade', (trade: RawTradeEvent) => {
      this.currentPrice = trade.price;
      this.volumeOIEngine.addTrade(trade);
      this.mtfEngine.updateWithTrade(trade);
    });

    // 3. Depth Updates for Local Order Book & Densities (Fast Path)
    this.streamClient.on('depth', (delta: RawDepthDelta) => {
      this.orderBookEngine.applyDepth(delta);
    });

    // 4. Stream status
    this.streamClient.on('status', (status) => {
      this.orderBookEngine.setStatus(status);
    });
  }

  private async loadInitialHistory() {
    try {
      const [k1d, k4h, k1h, k15m, k5m] = await Promise.all([
        fetchKlines(this.coin.exchange, this.coin.marketType, this.coin.symbol, '1d', 80).catch(() => []),
        fetchKlines(this.coin.exchange, this.coin.marketType, this.coin.symbol, '4h', 100).catch(() => []),
        fetchKlines(this.coin.exchange, this.coin.marketType, this.coin.symbol, '1h', 100).catch(() => []),
        fetchKlines(this.coin.exchange, this.coin.marketType, this.coin.symbol, '15m', 80).catch(() => []),
        fetchKlines(this.coin.exchange, this.coin.marketType, this.coin.symbol, '5m', 80).catch(() => []),
      ]);

      if (k1d.length > 0) this.mtfEngine.setCandles('1d', k1d);
      if (k4h.length > 0) this.mtfEngine.setCandles('4h', k4h);
      if (k1h.length > 0) this.mtfEngine.setCandles('1h', k1h);
      if (k15m.length > 0) this.mtfEngine.setCandles('15m', k15m);
      if (k5m.length > 0) this.mtfEngine.setCandles('5m', k5m);

      if (k15m.length > 0 && this.currentPrice === 0) {
        this.currentPrice = k15m[k15m.length - 1].close;
      }
    } catch (e) {
      console.warn(`[CoinWorker ${this.coin.symbol}] Error loading initial history:`, e);
    }
  }

  private startPeriodicTasks() {
    // 1. Slow Path Deep Analysis every 6 seconds
    this.slowAnalysisInterval = setInterval(() => {
      if (this.isDestroyed) return;
      this.runDeepAnalysis();
    }, 6000);

    // 2. Fetch Open Interest every 15 seconds
    this.oiFetchInterval = setInterval(() => {
      if (this.isDestroyed) return;
      this.fetchOpenInterest();
    }, 15000);
    this.fetchOpenInterest();
  }

  private async fetchOpenInterest() {
    try {
      const oi = await fetchDualExchangeOI(this.coin.symbol, this.coin.baseAsset, this.currentPrice || 1);
      const exOI = this.coin.exchange === 'binance' ? oi.binance : oi.bybit;
      if (exOI && exOI.valueUsd > 0) {
        this.volumeOIEngine.recordOI(exOI.valueUsd, exOI.amountCoins, this.currentPrice);
      }
    } catch (e) {}
  }

  public async runDeepAnalysis() {
    if (this.isDestroyed || this.currentPrice <= 0) return;
    this.lastAnalysisTimestamp = Date.now();

    const price = this.currentPrice;
    const candles1d = this.mtfEngine.getCandles('1d');
    const candles4h = this.mtfEngine.getCandles('4h');
    const candles1h = this.mtfEngine.getCandles('1h');
    const candles15m = this.mtfEngine.getCandles('15m');

    // 1. Multi-timeframe structure
    this.structures = this.mtfEngine.getMultiTimeframeStructures(price);

    // Check BOS / CHoCH structure change alerts
    for (const [tf, struct] of Object.entries(this.structures)) {
      if (struct.lastBreak && struct.lastBreak.confirmed) {
        const alertKey = `${this.coin.symbol}_${tf}_${struct.lastBreak.type}_${struct.lastBreak.time}`;
        if (this.alertManager.canSendAlert(alertKey, 'STRUCTURE_SHIFT')) {
          const alertHtml = this.alertManager.formatStructureMessage(
            this.coin.symbol,
            tf,
            `${struct.lastBreak.type} ${struct.lastBreak.direction}`,
            price
          );
          this.alertManager.dispatchAlert(this.coin.userId, alertHtml);
          this.addEvent({
            eventId: alertKey,
            symbol: this.coin.symbol,
            exchange: this.coin.exchange,
            marketType: this.coin.marketType,
            type: struct.lastBreak.type,
            title: `${struct.lastBreak.type} на ${tf.toUpperCase()}`,
            description: `Пробій структури ${struct.lastBreak.direction} на рівні $${struct.lastBreak.price}`,
            price,
            timeframe: tf as Timeframe,
            severity: 'IMPORTANT',
            confluenceScore: 75,
            evidence: struct,
            timestamp: Date.now(),
          });
        }
      }
    }

    // 2. Strong S/R Zones
    this.levelZones = this.levelsEngine.findSupportResistanceZones(candles1d, candles4h, candles1h);

    // 3. Third Touch Tracking
    this.thirdTouches = this.levelsEngine.trackThirdTouch(price, candles1h);
    for (const tt of this.thirdTouches) {
      if (tt.state === 'APPROACHING' || tt.state === 'ACTIVE') {
        const ttKey = `${this.coin.symbol}_THIRD_TOUCH_${tt.levelId}`;
        if (this.alertManager.canSendAlert(ttKey, 'THIRD_TOUCH_APPROACHING')) {
          const msg = this.alertManager.formatThirdTouchMessage(tt, this.coin.symbol, this.coin.exchange, price);
          this.alertManager.dispatchAlert(this.coin.userId, msg);
          this.addEvent({
            eventId: ttKey,
            symbol: this.coin.symbol,
            exchange: this.coin.exchange,
            marketType: this.coin.marketType,
            type: 'THIRD_TOUCH_APPROACHING',
            title: `Третій тест рівня $${tt.price}`,
            description: `Наближення до рівня ${tt.levelType}. Дистанція: ${tt.distancePct}%. Компресія: ${tt.compression ? 'ТАК' : 'НІ'}`,
            price,
            timeframe: '1h',
            severity: 'IMPORTANT',
            confluenceScore: 80,
            evidence: tt,
            timestamp: Date.now(),
          });
        }
      }
    }

    // 4. Formations
    this.patterns = this.levelsEngine.detectFormations(candles1h, price);

    // 5. Volume, RVOL, Trade Flow, OI
    const { rvol } = this.volumeOIEngine.calculateRVOL(candles15m);
    const tradeFlow = this.volumeOIEngine.getTradeFlowSnapshot();
    const oiSnapshot = this.volumeOIEngine.getOISnapshot(price);

    // Check OI Anomaly alert
    if (oiSnapshot.isAnomaly) {
      const oiKey = `${this.coin.symbol}_OI_ANOMALY_${Math.floor(Date.now() / 600000)}`;
      if (this.alertManager.canSendAlert(oiKey, 'OI_ANOMALY')) {
        const oiMsg = this.alertManager.formatOIMessage(oiSnapshot, this.coin.symbol, price);
        this.alertManager.dispatchAlert(this.coin.userId, oiMsg);
      }
    }

    // 6. Significant Densities
    const significantDensities = this.orderBookEngine.getSignificantDensities(
      this.orderBookEngine.calculateAdaptiveThreshold(this.volume24hUsd)
    );
    for (const d of significantDensities) {
      if (d.classification === 'PERSISTENT_LIQUIDITY' && d.ageSeconds >= 60) {
        const dKey = `${this.coin.symbol}_DENSITY_${d.side}_${d.price}`;
        if (this.alertManager.canSendAlert(dKey, 'DENSITY_PERSISTENT')) {
          const dMsg = this.alertManager.formatDensityMessage(d, this.coin.symbol, this.coin.exchange);
          this.alertManager.dispatchAlert(this.coin.userId, dMsg);
        }
      }
    }

    // 7. Macro & BTC Context
    const btcContext = await this.macroEngine.updateBTCContext();

    // 8. Setup Detection & Confluence Engine
    this.setups = this.setupEngine.evaluateSetups({
      symbol: this.coin.symbol,
      exchange: this.coin.exchange,
      marketType: this.coin.marketType,
      currentPrice: price,
      structures: this.structures,
      zones: this.levelZones,
      patterns: this.patterns,
      densities: significantDensities,
      tradeFlow,
      oiSnapshot,
      btcContext,
      thirdTouches: this.thirdTouches,
    });

    // Check Setups Telegram Alerts
    for (const setup of this.setups) {
      if (setup.stage === 'CONFIRMED' || setup.stage === 'REACTION_WATCH') {
        const alertType = setup.stage === 'CONFIRMED' ? 'SUPPORT_RETEST_CONFIRMED' : 'SUPPORT_RETEST_WATCH';
        const setupKey = `${setup.id}_${setup.stage}`;
        if (this.alertManager.canSendAlert(setupKey, alertType)) {
          const setupMsg = this.alertManager.formatSupportRetestMessage(setup, price);
          this.alertManager.dispatchAlert(this.coin.userId, setupMsg);
          this.addEvent({
            eventId: setupKey,
            symbol: this.coin.symbol,
            exchange: this.coin.exchange,
            marketType: this.coin.marketType,
            type: alertType,
            title: `Сетап ${setup.type}: ${setup.stage}`,
            description: `Конфлюенс: ${setup.confluenceScore}/100. Зона: $${setup.entryZone.low} - $${setup.entryZone.high}`,
            price,
            timeframe: setup.timeframe,
            severity: setup.stage === 'CONFIRMED' ? 'CRITICAL' : 'HIGH',
            confluenceScore: setup.confluenceScore,
            evidence: setup.evidence,
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  private addEvent(event: EngineAlertEvent) {
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > 25) {
      this.recentEvents.pop();
    }
  }

  public getSnapshot(): CoinWorkerSnapshot {
    return {
      id: this.coin.id,
      userId: this.coin.userId,
      symbol: this.coin.symbol,
      exchange: this.coin.exchange,
      marketType: this.coin.marketType,
      isActive: this.coin.isActive,
      status: this.streamClient.status,
      currentPrice: this.currentPrice,
      change24h: this.change24h,
      high24h: this.high24h,
      low24h: this.low24h,
      volume24hUsd: this.volume24hUsd,
      orderBookState: this.orderBookEngine.getState(),
      densities: this.orderBookEngine.getDensities(),
      structures: this.structures,
      levelZones: this.levelZones,
      thirdTouches: this.thirdTouches,
      patterns: this.patterns,
      tradeFlow: this.volumeOIEngine.getTradeFlowSnapshot(),
      oiSnapshot: this.volumeOIEngine.getOISnapshot(this.currentPrice),
      setups: this.setups,
      recentEvents: this.recentEvents,
      lastAnalysisTimestamp: this.lastAnalysisTimestamp,
    };
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.slowAnalysisInterval) {
      clearInterval(this.slowAnalysisInterval);
      this.slowAnalysisInterval = null;
    }
    if (this.oiFetchInterval) {
      clearInterval(this.oiFetchInterval);
      this.oiFetchInterval = null;
    }
    this.streamClient.destroy();
    this.orderBookEngine.clear();
  }
}

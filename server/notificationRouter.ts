import { SurveillanceCoin } from '../src/types';
import { getUserTelegram } from './alertService';
import { sendTelegramMessage } from './telegramService';
import { findSurveillanceCoinById } from './surveillanceService';

export type NotificationSource =
  | 'PRICE_ALERT'
  | 'SURVEILLANCE'
  | 'SCREENER'
  | 'TRADING_FLOW'
  | 'ORDERBOOK';

export interface NotificationEventPayload {
  source: NotificationSource;
  userId: string;
  coinId?: string;
  symbol: string;
  exchange: string;
  marketType: string;
  eventType: string;
  eventIdentity: string;
  triggerMode?: 'realtime' | 'bar_close' | 'bar_close_1h' | 'bar_close_15m' | 'manual';
  htmlMessage: string;
  timestamp?: number;
  customCooldownMs?: number;
  forceNotify?: boolean;
  metadata?: Record<string, any>;
  coin?: SurveillanceCoin;
}

export interface ShouldNotifyParams {
  source: NotificationSource;
  userId: string;
  coin?: SurveillanceCoin;
  coinId?: string;
  symbol: string;
  exchange: string;
  marketType: string;
  eventType: string;
  eventIdentity: string;
  triggerMode?: 'realtime' | 'bar_close' | 'bar_close_1h' | 'bar_close_15m' | 'manual';
  customCooldownMs?: number;
  forceNotify?: boolean;
}

export interface ShouldNotifyResult {
  allowed: boolean;
  reason?: string;
  scopedKey: string;
}

export class NotificationRouter {
  private static instance: NotificationRouter | null = null;

  // Scoped timestamps: `${source}:${userId}:${coinId}:${exchange}:${marketType}:${eventType}:${eventIdentity}` -> timestamp
  private inFlight = new Set<string>();
  private scopedAlertTimestamps = new Map<string, number>();

  // Default cooldowns per eventType in ms
  private readonly defaultCooldowns: Record<string, number> = {
    // Order Book & Densities
    DENSITY_APPEARED: 10 * 60 * 1000,
    DENSITY_PERSISTENT: 20 * 60 * 1000,
    DENSITY_REPLENISHED: 15 * 60 * 1000,
    DENSITY_REMOVED: 15 * 60 * 1000,
    DENSITY_SPOOF_RISK: 15 * 60 * 1000,
    // Setups & Third Touch
    THIRD_TOUCH_APPROACHING: 15 * 60 * 1000,
    THIRD_TOUCH_ACTIVE: 10 * 60 * 1000,
    SUPPORT_RETEST_WATCH: 15 * 60 * 1000,
    SUPPORT_RETEST_CONFIRMED: 20 * 60 * 1000,
    RESISTANCE_RETEST_CONFIRMED: 20 * 60 * 1000,
    FORMATION_SETUP_CONFIRMED: 25 * 60 * 1000,
    // Structure & OI
    STRUCTURE_SHIFT: 20 * 60 * 1000,
    BOS: 20 * 60 * 1000,
    CHOCH: 20 * 60 * 1000,
    OI_ANOMALY: 12 * 60 * 1000,
    FORMATION_DETECTED: 30 * 60 * 1000,
    BREAKOUT_REALTIME: 10 * 60 * 1000,
    BREAKOUT_CONFIRMED: 20 * 60 * 1000,
    IMPULSE: 10 * 60 * 1000,
    LEVEL_CROSS_4H: 20 * 60 * 1000,
    LEVEL_CROSS_1H: 15 * 60 * 1000,
    LEVEL_CROSS_15M: 10 * 60 * 1000,
    MOMENTUM: 15 * 60 * 1000,
    CHANNEL_BREAKOUT: 20 * 60 * 1000,
    FIBONACCI: 20 * 60 * 1000,
  };

  public static getInstance(): NotificationRouter {
    if (!NotificationRouter.instance) {
      NotificationRouter.instance = new NotificationRouter();
    }
    return NotificationRouter.instance;
  }

  /**
   * Builds an isolated, fully scoped dedup and cooldown key (#2 & #21):
   * source:userId:coinId:exchange:marketType:eventType:eventIdentity
   */
  public buildScopedKey(params: {
    source: NotificationSource;
    userId: string;
    coinId?: string;
    symbol: string;
    exchange: string;
    marketType: string;
    eventType: string;
    eventIdentity: string;
  }): string {
    const src = params.source;
    const uid = (params.userId || 'guest').trim();
    const cid = (params.coinId || params.symbol || 'default').trim();
    const ex = (params.exchange || 'binance').trim().toLowerCase();
    const mkt = (params.marketType || 'futures').trim().toLowerCase();
    const evType = (params.eventType || 'GENERAL').trim().toUpperCase();
    const evIdent = (params.eventIdentity || 'DEFAULT').trim().replace(/[\s:]+/g, '_');

    return `${src}:${uid}:${cid}:${ex}:${mkt}:${evType}:${evIdent}`;
  }

  /**
   * Unified gate for all notification dispatches (#3)
   */
  public shouldNotify(params: ShouldNotifyParams): ShouldNotifyResult {
    const scopedKey = this.buildScopedKey(params);
    const now = Date.now();

    // 1. If coin context provided, check active status & config toggles
    if (params.coin) {
      const coin = params.coin.id && params.coin.userId
        ? findSurveillanceCoinById(params.coin.id, params.userId)?.coin
        : params.coin;
      if (!coin) return { allowed: false, reason: 'coin_removed', scopedKey };

      if (!coin.isActive) {
        return { allowed: false, reason: 'coin_inactive', scopedKey };
      }

      // Central telegramEnabled gate (#3)
      if (coin.config?.telegramEnabled === false) {
        return { allowed: false, reason: 'telegram_disabled_for_coin', scopedKey };
      }

      // Check triggerModes if triggerMode is specified
      if (params.triggerMode && params.triggerMode !== 'manual') {
        const modes = coin.config?.triggerModes || (coin.config?.triggerMode ? [coin.config.triggerMode] : ['bar_close']);
        if (!modes.includes(params.triggerMode)) {
          return { allowed: false, reason: 'trigger_mode_disabled', scopedKey };
        }
      }

      // Check category-specific alerts
      const evUpper = params.eventType.toUpperCase();
      if (evUpper === 'OI_ANOMALY' && coin.config?.oiAlerts === false) {
        return { allowed: false, reason: 'oi_alerts_disabled', scopedKey };
      }
      if ((evUpper.startsWith('DENSITY') || params.source === 'ORDERBOOK') && coin.config?.densityAlerts === false) {
        return { allowed: false, reason: 'density_alerts_disabled', scopedKey };
      }
      if (evUpper.startsWith('THIRD_TOUCH') && coin.config?.thirdTouchAlerts === false) {
        return { allowed: false, reason: 'third_touch_alerts_disabled', scopedKey };
      }
      if ((evUpper.startsWith('SETUP') || evUpper.includes('RETEST') || evUpper === 'FORMATION_SETUP_CONFIRMED' || evUpper === 'BREAKOUT_CONFIRMED') && coin.config?.setupsEnabled === false) {
        return { allowed: false, reason: 'setups_disabled', scopedKey };
      }
      if ((evUpper.startsWith('STRUCT') || evUpper === 'BOS' || evUpper === 'CHOCH') && coin.config?.structureEnabled === false) {
        return { allowed: false, reason: 'structure_disabled', scopedKey };
      }
      if (evUpper.startsWith('LEVEL') && coin.config?.levelsEnabled === false) {
        return { allowed: false, reason: 'levels_disabled', scopedKey };
      }
      if (evUpper.startsWith('MOMENTUM') && coin.config?.momentumEnabled === false) {
        return { allowed: false, reason: 'momentum_disabled', scopedKey };
      }
      if (evUpper.startsWith('CHANNEL') && coin.config?.channelEnabled === false) {
        return { allowed: false, reason: 'channel_disabled', scopedKey };
      }
      if (evUpper.startsWith('FIBONACCI') && coin.config?.fibonacciEnabled === false) {
        return { allowed: false, reason: 'fibonacci_disabled', scopedKey };
      }
    }

    // 2. Check Telegram credentials
    const userTg = getUserTelegram(params.userId);
    if (!userTg?.botToken || !userTg?.chatId) {
      return { allowed: false, reason: 'missing_telegram_credentials', scopedKey };
    }

    // 3. Check Cooldown & Deduplication
    if (params.forceNotify) {
      return { allowed: true, scopedKey };
    }

    const lastTime = this.scopedAlertTimestamps.get(scopedKey) || 0;
    const cooldownMs = params.customCooldownMs ??
      (params.coin?.config?.cooldownMinutes !== undefined
        ? Math.max(0, params.coin.config.cooldownMinutes) * 60 * 1000
        : this.defaultCooldowns[params.eventType.toUpperCase()] ?? 15 * 60 * 1000);

    if (now - lastTime < cooldownMs) {
      return { allowed: false, reason: `cooldown_active (${Math.round((cooldownMs - (now - lastTime)) / 1000)}s left)`, scopedKey };
    }

    return { allowed: true, scopedKey };
  }

  /**
   * Main dispatch method - gates, sends, updates scoped timestamp
   */
  public async dispatch(payload: NotificationEventPayload): Promise<boolean> {
    const gateResult = this.shouldNotify({
      source: payload.source,
      userId: payload.userId,
      coin: payload.coin,
      coinId: payload.coinId,
      symbol: payload.symbol,
      exchange: payload.exchange,
      marketType: payload.marketType,
      eventType: payload.eventType,
      eventIdentity: payload.eventIdentity,
      triggerMode: payload.triggerMode,
      customCooldownMs: payload.customCooldownMs,
      forceNotify: payload.forceNotify,
    });

    if (!gateResult.allowed || this.inFlight.has(gateResult.scopedKey)) {
      return false;
    }

    const userTg = getUserTelegram(payload.userId);
    if (!userTg?.botToken || !userTg?.chatId) {
      return false;
    }

    this.inFlight.add(gateResult.scopedKey);
    try {
      const res = await sendTelegramMessage(payload.htmlMessage, {
        botToken: userTg.botToken,
        chatId: userTg.chatId,
      });

      if (res.success) {
        const now = Date.now();
        this.scopedAlertTimestamps.set(gateResult.scopedKey, now);

        if (payload.coin) {
          payload.coin.lastNotifiedAt = new Date(now).toISOString();
        }

        console.log(`[NotificationRouter] ✅ Sent Telegram [${payload.source}] to ${payload.userId} for ${payload.symbol} (${payload.eventType}:${payload.eventIdentity})`);
        return true;
      }
    } catch (err) {
      console.error(`[NotificationRouter] ❌ Error sending Telegram for ${payload.symbol}:`, err);
    } finally {
      this.inFlight.delete(gateResult.scopedKey);
    }

    return false;
  }

  public recordAlertSent(scopedKey: string, timestamp = Date.now()) {
    this.scopedAlertTimestamps.set(scopedKey, timestamp);
  }

  public getLastAlertTime(scopedKey: string): number {
    return this.scopedAlertTimestamps.get(scopedKey) || 0;
  }

  public clear() {
    this.scopedAlertTimestamps.clear();
  }
}

export const notificationRouter = NotificationRouter.getInstance();

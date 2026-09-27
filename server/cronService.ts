import { checkAlertsOnce, loadAlerts, getAllAlerts } from './alertService';
import { checkCoinSurveillance, getAllActiveSurveillanceCoins, loadSurveillanceStore, saveSurveillanceStore } from './surveillanceService';
import { runScreenerScan } from './marketService';
import { sendTelegramMessage, getEffectiveTelegramConfig } from './telegramService';

export interface CronJobStatus {
  id: string;
  name: string;
  intervalMs: number;
  lastRunAt: string | null;
  lastDurationMs: number;
  runCount: number;
  errorCount: number;
  lastError: string | null;
  isRunning: boolean;
  enabled: boolean;
}

export interface CronSystemStatus {
  uptimeSeconds: number;
  startedAt: string;
  isHealthy: boolean;
  jobs: Record<string, CronJobStatus>;
  stats: {
    totalAlertsMonitored: number;
    activeAlertsCount: number;
    surveillanceCoinsMonitored: number;
    telegramConfigured: boolean;
  };
}

class CronManager {
  private startTime: number = Date.now();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  private jobs: Record<string, CronJobStatus> = {
    price_alerts: {
      id: 'price_alerts',
      name: 'Цінові сповіщення (Binance & Bybit)',
      intervalMs: 5000,
      lastRunAt: null,
      lastDurationMs: 0,
      runCount: 0,
      errorCount: 0,
      lastError: null,
      isRunning: false,
      enabled: true,
    },
    surveillance: {
      id: 'surveillance',
      name: '24/7 Нагляд за ринком (Імпульси, Сплески, Рівні)',
      intervalMs: 15000,
      lastRunAt: null,
      lastDurationMs: 0,
      runCount: 0,
      errorCount: 0,
      lastError: null,
      isRunning: false,
      enabled: true,
    },
    screener_patterns: {
      id: 'screener_patterns',
      name: 'Скринер патернів високої впевненості (≥88%)',
      intervalMs: 60000,
      lastRunAt: null,
      lastDurationMs: 0,
      runCount: 0,
      errorCount: 0,
      lastError: null,
      isRunning: false,
      enabled: true,
    },
  };

  public init() {
    console.log('[CRON] Initializing unified background notification cron system...');
    this.startPriceAlertsCron();
    this.startSurveillanceCron();
    this.startScreenerCron();
  }

  // --- 1. Price Alerts Cron (Every 5s) ---
  private startPriceAlertsCron() {
    const job = this.jobs.price_alerts;
    if (this.timers.has(job.id)) clearInterval(this.timers.get(job.id)!);

    const run = async () => {
      if (job.isRunning || !job.enabled) return;
      job.isRunning = true;
      const start = Date.now();
      try {
        await checkAlertsOnce();
        job.lastRunAt = new Date().toISOString();
        job.lastDurationMs = Date.now() - start;
        job.runCount++;
        job.lastError = null;
      } catch (err: any) {
        job.errorCount++;
        job.lastError = err?.message || 'Помилка виконання перевірки цінових сповіщень';
        console.error('[CRON:price_alerts] Error:', err);
      } finally {
        job.isRunning = false;
      }
    };

    // Run first iteration after 1.5s
    setTimeout(run, 1500);
    const timer = setInterval(run, job.intervalMs);
    this.timers.set(job.id, timer);
  }

  // --- 2. Surveillance Cron (Every 15s) ---
  private startSurveillanceCron() {
    const job = this.jobs.surveillance;
    if (this.timers.has(job.id)) clearInterval(this.timers.get(job.id)!);

    const run = async () => {
      if (job.isRunning || !job.enabled) return;
      job.isRunning = true;
      const start = Date.now();
      try {
        const activeItems = getAllActiveSurveillanceCoins();
        if (activeItems.length > 0) {
          const store = loadSurveillanceStore();
          for (const { userId, coin } of activeItems) {
            try {
              const { coin: updated } = await checkCoinSurveillance(coin);
              const userCoins = store[userId] || [];
              const idx = userCoins.findIndex((c) => c.id === coin.id);
              if (idx !== -1) {
                userCoins[idx] = updated;
                store[userId] = userCoins;
                saveSurveillanceStore(store);
              }
            } catch (coinErr) {
              console.error(`[CRON:surveillance] Error on ${coin.symbol}:`, coinErr);
            }
          }
        }

        job.lastRunAt = new Date().toISOString();
        job.lastDurationMs = Date.now() - start;
        job.runCount++;
        job.lastError = null;
      } catch (err: any) {
        job.errorCount++;
        job.lastError = err?.message || 'Помилка виконання нагляду';
        console.error('[CRON:surveillance] Error:', err);
      } finally {
        job.isRunning = false;
      }
    };

    setTimeout(run, 3000);
    const timer = setInterval(run, job.intervalMs);
    this.timers.set(job.id, timer);
  }

  // --- 3. Screener Patterns Cron (Every 60s) ---
  private startScreenerCron() {
    const job = this.jobs.screener_patterns;
    if (this.timers.has(job.id)) clearInterval(this.timers.get(job.id)!);

    const run = async () => {
      if (job.isRunning || !job.enabled) return;
      job.isRunning = true;
      const start = Date.now();
      try {
        // Run light screener scan to ensure latest high-confidence patterns are warm
        const results = await runScreenerScan({
          exchange: 'all',
          marketType: 'futures',
          timeframe: '1h',
          minVolumeUsd: 100_000,
        });

        job.lastRunAt = new Date().toISOString();
        job.lastDurationMs = Date.now() - start;
        job.runCount++;
        job.lastError = null;
      } catch (err: any) {
        job.errorCount++;
        job.lastError = err?.message || 'Помилка скринера патернів';
      } finally {
        job.isRunning = false;
      }
    };

    setTimeout(run, 10000);
    const timer = setInterval(run, job.intervalMs);
    this.timers.set(job.id, timer);
  }

  // --- Manual Run Trigger ---
  public async triggerJob(jobId: string): Promise<{ success: boolean; message: string; durationMs?: number }> {
    if (jobId === 'all') {
      const start = Date.now();
      await Promise.allSettled([
        checkAlertsOnce(),
        (async () => {
          const active = getAllActiveSurveillanceCoins();
          for (const { coin } of active.slice(0, 5)) {
            await checkCoinSurveillance(coin).catch(() => {});
          }
        })(),
      ]);
      return { success: true, message: 'Усі завдання cron успішно виконано вручну', durationMs: Date.now() - start };
    }

    if (jobId === 'price_alerts') {
      const start = Date.now();
      await checkAlertsOnce();
      this.jobs.price_alerts.lastRunAt = new Date().toISOString();
      return { success: true, message: 'Перевірку цінових алерів виконано', durationMs: Date.now() - start };
    }

    if (jobId === 'surveillance') {
      const start = Date.now();
      const active = getAllActiveSurveillanceCoins();
      for (const { coin } of active) {
        await checkCoinSurveillance(coin).catch(() => {});
      }
      this.jobs.surveillance.lastRunAt = new Date().toISOString();
      return { success: true, message: `Нагляд перевірено (${active.length} активних монет)`, durationMs: Date.now() - start };
    }

    return { success: false, message: `Невідоме завдання cron: ${jobId}` };
  }

  // --- System Diagnostic Status ---
  public getStatus(): CronSystemStatus {
    const allAlerts = getAllAlerts();
    const activeAlerts = allAlerts.filter((a) => a.isActive && !a.triggered);
    const surveillanceCoins = getAllActiveSurveillanceCoins();
    const tgConfig = getEffectiveTelegramConfig();

    return {
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      startedAt: new Date(this.startTime).toISOString(),
      isHealthy: Object.values(this.jobs).every((j) => j.errorCount < 10),
      jobs: this.jobs,
      stats: {
        totalAlertsMonitored: allAlerts.length,
        activeAlertsCount: activeAlerts.length,
        surveillanceCoinsMonitored: surveillanceCoins.length,
        telegramConfigured: Boolean(tgConfig.botToken && tgConfig.chatId),
      },
    };
  }

  // --- Stop all cron jobs cleanly ---
  public stop() {
    for (const [id, timer] of this.timers.entries()) {
      clearInterval(timer);
    }
    this.timers.clear();
    console.log('[CRON] All cron background jobs stopped.');
  }
}

export const cronManager = new CronManager();

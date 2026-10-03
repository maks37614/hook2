import { SurveillanceCoin } from '../../src/types';
import { CoinWorker, CoinWorkerSnapshot } from './coinWorker';
import { MacroAndNewsEngine } from './macroAndNewsEngine';
import { StateMachineAndAlerts } from './stateMachineAndAlerts';
import { loadSurveillanceStore } from '../surveillanceService';

export class SurveillanceManager {
  private static instance: SurveillanceManager | null = null;

  private workers = new Map<string, CoinWorker>(); // coinId -> CoinWorker
  public readonly macroEngine = new MacroAndNewsEngine();
  public readonly alertManager = new StateMachineAndAlerts();

  private isStarted = false;

  public static getInstance(): SurveillanceManager {
    if (!SurveillanceManager.instance) {
      SurveillanceManager.instance = new SurveillanceManager();
    }
    return SurveillanceManager.instance;
  }

  constructor() {}

  public start() {
    if (this.isStarted) return;
    this.isStarted = true;
    console.log('[SurveillanceManager] 🛰 Starting 24/7 Surveillance Engine...');

    // Boot up active workers for all persisted coins
    try {
      const store = loadSurveillanceStore();
      let activeCount = 0;
      for (const [userId, coins] of Object.entries(store)) {
        if (Array.isArray(coins)) {
          for (const coin of coins) {
            if (coin.isActive) {
              this.startWorkerForCoin(coin);
              activeCount++;
            }
          }
        }
      }
      console.log(`[SurveillanceManager] Successfully initialized ${activeCount} active 24/7 surveillance workers.`);
    } catch (e) {
      console.error('[SurveillanceManager] Error booting workers:', e);
    }
  }

  public startWorkerForCoin(coin: SurveillanceCoin): CoinWorker {
    const existing = this.workers.get(coin.id);
    if (existing) {
      existing.updateCoin(coin);
      return existing;
    }

    console.log(`[SurveillanceManager] Spawning 24/7 worker for #${coin.symbol} (${coin.exchange.toUpperCase()} ${coin.marketType})`);
    const worker = new CoinWorker(coin, this.macroEngine, this.alertManager);
    this.workers.set(coin.id, worker);
    return worker;
  }

  public updateWorkerCoin(coin: SurveillanceCoin) {
    const worker = this.workers.get(coin.id);
    if (worker) {
      worker.updateCoin(coin);
    }
  }

  public stopWorkerForCoin(coinId: string): boolean {
    const worker = this.workers.get(coinId);
    if (worker) {
      console.log(`[SurveillanceManager] Stopping worker for ${worker.coin.symbol}`);
      worker.destroy();
      this.workers.delete(coinId);
      return true;
    }
    return false;
  }

  public getWorker(coinId: string): CoinWorker | undefined {
    return this.workers.get(coinId);
  }

  public getWorkerSnapshot(coinId: string): CoinWorkerSnapshot | null {
    const worker = this.workers.get(coinId);
    return worker ? worker.getSnapshot() : null;
  }

  public getAllSnapshots(userId?: string): CoinWorkerSnapshot[] {
    const snapshots: CoinWorkerSnapshot[] = [];
    for (const worker of this.workers.values()) {
      if (!userId || userId === 'all' || worker.coin.userId === userId || worker.coin.userId === 'guest') {
        snapshots.push(worker.getSnapshot());
      }
    }
    return snapshots;
  }

  public getActiveWorkerCount(): number {
    return this.workers.size;
  }
}

export const surveillanceManager = SurveillanceManager.getInstance();

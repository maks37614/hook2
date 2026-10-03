import { ExchangeId, MarketType } from '../../src/types';
import { RawDepthDelta } from './exchangeStream';
import { DensityItem, OrderBookLevel, OrderBookState, OrderBookStatus } from './types';

export interface DensityConfig {
  mode: 'AUTO' | 'MANUAL' | 'HYBRID';
  manualThresholdUsd: number;
  minPersistenceSeconds: number;
  minDistancePct: number;
}

interface DensityStats {
  firstSeenAt: number;
  lastSeenAt: number;
  samples: number;
  presentSamples: number;
  sizeSumUsd: number;
  maxSizeUsd: number;
  lastSizeUsd: number;
  lastSizeChangeAt: number;
  cancellations: number;
  replenishments: number;
  nearestApproachPct: number;
}

export class OrderBookEngine {
  private bids = new Map<number, number>();
  private asks = new Map<number, number>();
  private activeDensities = new Map<string, DensityItem>();
  private densityHistory: DensityItem[] = [];
  private densityStats = new Map<string, DensityStats>();

  public bestBid = 0;
  public bestAsk = 0;
  public spread = 0;
  public spreadPct = 0;
  public lastUpdateId = 0;
  public lastReceivedAt = 0;
  public dataValid = false;
  public sequenceGap = false;
  public status: OrderBookStatus = 'CONNECTING';

  constructor(
    public readonly symbol: string,
    public readonly exchange: ExchangeId,
    public readonly marketType: MarketType,
    private config: DensityConfig = {
      mode: 'AUTO', manualThresholdUsd: 1000000, minPersistenceSeconds: 15, minDistancePct: 0.1,
    }
  ) {}

  public updateConfig(newConfig: Partial<DensityConfig>) { this.config = { ...this.config, ...newConfig }; }
  public setStatus(newStatus: OrderBookStatus) { this.status = newStatus; }

  public applyDepth(delta: RawDepthDelta) {
    const now = Date.now();
    this.lastReceivedAt = now;
    const seq = delta.sequence || now;
    if (!delta.isSnapshot && this.lastUpdateId > 0 && seq <= this.lastUpdateId) {
      this.sequenceGap = true;
      this.dataValid = false;
      this.status = 'RESYNCING';
      return;
    }
    this.sequenceGap = false;
    this.lastUpdateId = seq;
    if (delta.isSnapshot) {
      this.bids.clear();
      this.asks.clear();
      this.dataValid = true;
      this.status = 'SYNCING';
    }

    for (const [price, qty] of delta.bids) qty <= 0 ? this.bids.delete(price) : this.bids.set(price, qty);
    for (const [price, qty] of delta.asks) qty <= 0 ? this.asks.delete(price) : this.asks.set(price, qty);

    this.bestBid = Math.max(0, ...this.bids.keys());
    this.bestAsk = this.asks.size ? Math.min(...this.asks.keys()) : 0;
    if (this.bestBid > 0 && this.bestAsk > 0 && this.bestAsk >= this.bestBid) {
      this.spread = this.bestAsk - this.bestBid;
      this.spreadPct = (this.spread / this.bestBid) * 100;
      this.status = this.dataValid ? 'LIVE' : 'SYNCING';
      this.dataValid = true;
    }
    if (this.dataValid) this.evaluateDensities();
  }

  public getSortedBids(limit = 30): OrderBookLevel[] {
    return Array.from(this.bids.keys()).sort((a,b)=>b-a).slice(0,limit).map(price=>({price, quantity:this.bids.get(price)||0, notionalUsd:price*(this.bids.get(price)||0)}));
  }
  public getSortedAsks(limit = 30): OrderBookLevel[] {
    return Array.from(this.asks.keys()).sort((a,b)=>a-b).slice(0,limit).map(price=>({price, quantity:this.asks.get(price)||0, notionalUsd:price*(this.asks.get(price)||0)}));
  }

  public getState(): OrderBookState {
    if (this.lastReceivedAt > 0 && Date.now() - this.lastReceivedAt > 5000) {
      this.status = 'STALE';
      this.dataValid = false;
    }
    return {
      symbol:this.symbol, exchange:this.exchange, marketType:this.marketType,
      bids:this.getSortedBids(20), asks:this.getSortedAsks(20), bestBid:this.bestBid, bestAsk:this.bestAsk,
      spread:this.spread, spreadPct:Number(this.spreadPct.toFixed(4)), lastUpdateId:this.lastUpdateId,
      sequence:this.lastUpdateId, timestamp:this.lastReceivedAt||Date.now(), status:this.status, lastReceivedAt:this.lastReceivedAt,
    };
  }

  public calculateAdaptiveThreshold(volume24hUsd = 0): number {
    const all = [...Array.from(this.bids, ([p,q])=>p*q), ...Array.from(this.asks, ([p,q])=>p*q)];
    if (!all.length) return this.config.manualThresholdUsd || 1000000;
    all.sort((a,b)=>a-b);
    const p90 = all[Math.min(all.length-1, Math.floor(all.length*0.90))] || 50000;
    const turnoverBaseline = volume24hUsd > 0 ? Math.max(50000, volume24hUsd * 0.0003) : 100000;
    const autoVal = Math.max(turnoverBaseline, p90 * 2);
    if (this.config.mode === 'MANUAL') return this.config.manualThresholdUsd;
    // #13: HYBRID takes the maximum so manual threshold is strictly respected and never diluted
    if (this.config.mode === 'HYBRID') return Math.max(this.config.manualThresholdUsd, autoVal);
    return autoVal;
  }

  private newlyAppearedDensities: DensityItem[] = [];

  public pollNewlyAppearedDensities(): DensityItem[] {
    const items = [...this.newlyAppearedDensities];
    this.newlyAppearedDensities = [];
    return items;
  }

  private evaluateDensities() {
    const now = Date.now();
    const mid = (this.bestBid + this.bestAsk) / 2 || this.bestBid || this.bestAsk || 1;
    const threshold = this.calculateAdaptiveThreshold();
    const seen = new Set<string>();

    const minBidInBook = this.bids.size > 0 ? Math.min(...this.bids.keys()) : 0;
    const maxAskInBook = this.asks.size > 0 ? Math.max(...this.asks.keys()) : Infinity;

    const scan = (book: Map<number, number>, side: 'BID'|'ASK') => {
      for (const [price, qty] of book.entries()) {
        const notional = price * qty;
        if (notional < threshold) continue;
        const id = `${side.toLowerCase()}_${price}`;
        seen.add(id);
        const dist = Math.abs((price-mid)/mid)*100;
        this.updateOrAddDensity(id, side, price, qty, notional, dist, now);
      }
    };
    scan(this.bids,'BID'); scan(this.asks,'ASK');

    for (const [id, item] of this.activeDensities.entries()) {
      if (seen.has(id)) continue;

      // #10 & #12: Check if order simply stepped out of visible top-20 window
      const isOutsideVisibleWindow = (item.side === 'BID' && item.price < minBidInBook) ||
                                     (item.side === 'ASK' && item.price > maxAskInBook);

      if (isOutsideVisibleWindow) {
        // Keep order alive in persistence memory without falsely increasing cancellation rate
        if (now - item.lastSeenAt > 600000) { // Clean up after 10 mins outside window
          this.activeDensities.delete(id);
        }
        continue;
      }

      const stats = this.densityStats.get(id);
      if (stats) stats.cancellations += 1;
      const age = Math.max(0.1, (now-item.firstSeenAt)/1000);
      const disappearedNearPrice = item.distancePct <= 0.25;
      const cancellationRate = stats ? stats.cancellations / Math.max(1, stats.samples) : 1;
      item.cancellationRate = Number(cancellationRate.toFixed(3));
      if (disappearedNearPrice && age < 60 && cancellationRate > 0.15) item.classification='POSSIBLE_SPOOF';
      else if (age < this.config.minPersistenceSeconds) item.classification='TRANSIENT_LIQUIDITY';
      item.qualityScore = this.calculateQuality(item, stats);
      this.densityHistory.unshift(item);
      if (this.densityHistory.length > 100) this.densityHistory.pop();
      this.activeDensities.delete(id);
    }
  }

  private updateOrAddDensity(id:string, side:'BID'|'ASK', price:number, qty:number, notional:number, distPct:number, now:number) {
    let stats = this.densityStats.get(id);
    const isBrandNew = !stats;
    if (!stats) {
      stats = { firstSeenAt:now,lastSeenAt:now,samples:0,presentSamples:0,sizeSumUsd:0,maxSizeUsd:notional,lastSizeUsd:notional,lastSizeChangeAt:now,cancellations:0,replenishments:0,nearestApproachPct:distPct };
      this.densityStats.set(id,stats);
    }
    stats.samples += 1; stats.presentSamples += 1; stats.lastSeenAt=now; stats.sizeSumUsd += notional;
    stats.maxSizeUsd=Math.max(stats.maxSizeUsd,notional); stats.nearestApproachPct=Math.min(stats.nearestApproachPct,distPct);
    if (notional > stats.lastSizeUsd * 1.05 && stats.lastSizeUsd > 0) stats.replenishments += 1;
    if (Math.abs(notional-stats.lastSizeUsd)/Math.max(stats.lastSizeUsd,1) > 0.1) stats.lastSizeChangeAt=now;
    stats.lastSizeUsd=notional;

    const existing=this.activeDensities.get(id);
    if(existing){
      existing.quantity=qty; existing.notionalUsd=notional; existing.distancePct=Number(distPct.toFixed(3)); existing.lastSeenAt=now;
      existing.ageSeconds=Math.floor((now-existing.firstSeenAt)/1000); existing.maxSizeUsd=Math.max(existing.maxSizeUsd,notional);
      existing.averageSizeUsd=stats.sizeSumUsd/Math.max(1,stats.presentSamples); existing.persistenceRatio=stats.presentSamples/Math.max(1,stats.samples);
      existing.persistenceSamples=stats.presentSamples; existing.cancellationRate=stats.cancellations/Math.max(1,stats.samples);
      existing.replenishmentRate=stats.replenishments/Math.max(1,stats.samples); existing.lastSizeChangeAt=stats.lastSizeChangeAt;
      if(existing.ageSeconds>=this.config.minPersistenceSeconds && existing.persistenceRatio>=0.65) existing.classification='PERSISTENT_LIQUIDITY';
      existing.qualityScore=this.calculateQuality(existing,stats);
    } else {
      const item:DensityItem={id,price,side,quantity:qty,notionalUsd:notional,distancePct:Number(distPct.toFixed(3)),firstSeenAt:now,lastSeenAt:now,ageSeconds:0,maxSizeUsd:notional,averageSizeUsd:notional,persistenceRatio:1,classification:'STANDARD',persistenceSamples:1,cancellationRate:0,replenishmentRate:0,qualityScore:20,lastSizeChangeAt:now};
      this.activeDensities.set(id,item);
      if (isBrandNew && notional >= 300000) {
        this.newlyAppearedDensities.push(item);
      }
    }
  }

  private calculateQuality(item:DensityItem, stats?:DensityStats):number {
    if (!stats) return item.qualityScore || 0;
    const persistence = Math.min(25, (item.persistenceRatio || 0) * 25);
    const duration = Math.min(20, (item.ageSeconds / Math.max(1,this.config.minPersistenceSeconds)) * 20);
    const sizeStability = Math.min(15, item.averageSizeUsd > 0 ? Math.min(1.5,item.notionalUsd/item.averageSizeUsd) * 10 : 0);
    const maxDistance = Math.max(this.config.minDistancePct, 0.6);
    const proximity = item.distancePct <= this.config.minDistancePct ? 15 : Math.max(0, 15 * (1 - Math.min(1, item.distancePct / maxDistance)));
    const replenishment = Math.min(15, (item.replenishmentRate || 0) * 60);
    const spoofPenalty = item.classification === 'POSSIBLE_SPOOF' ? 40 : Math.min(20,(item.cancellationRate||0)*50);
    return Math.max(0,Math.min(100,Math.round(persistence+duration+sizeStability+proximity+replenishment-spoofPenalty)));
  }

  public getOrderBookImbalance(levels=20):number {
    if (!this.dataValid || Date.now() - this.lastReceivedAt > 5000) return 0;
    const bids=this.getSortedBids(levels).reduce((s,l)=>s+l.notionalUsd,0);
    const asks=this.getSortedAsks(levels).reduce((s,l)=>s+l.notionalUsd,0);
    if(bids+asks===0)return 0;
    return (bids-asks)/(bids+asks);
  }

  public getDensityQualityAtPrice(side:'BID'|'ASK', price:number, maxDistancePct=0.6):DensityItem|undefined {
    return this.getDensities().filter(d=>d.side===side && d.classification!=='POSSIBLE_SPOOF' && Math.abs(d.price-price)/Math.max(price,1)*100<=maxDistancePct).sort((a,b)=>(b.qualityScore||0)-(a.qualityScore||0))[0];
  }

  public getDensities(): DensityItem[] { return this.dataValid && Date.now() - this.lastReceivedAt <= 5000 ? Array.from(this.activeDensities.values()).sort((a,b)=>b.notionalUsd-a.notionalUsd) : []; }
  public getSignificantDensities(minNotional=500000):DensityItem[]{return this.getDensities().filter(d=>d.notionalUsd>=minNotional);}
  public clear(){this.bids.clear();this.asks.clear();this.activeDensities.clear();this.densityStats.clear();this.dataValid=false;this.sequenceGap=false;this.status='CONNECTING';}
}

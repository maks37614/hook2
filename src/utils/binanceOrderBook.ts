import type { MarketType } from '../types';

export interface BookUpdate {
  bids: [number, number][];
  asks: [number, number][];
  sequence: number;
  isSnapshot?: boolean;
}

export interface BinanceDepthEvent {
  U: number;
  u: number;
  pu?: number;
  b: [string, string][];
  a: [string, string][];
}

// Buffer WS deltas while fetching REST, then bridge exactly to lastUpdateId.
// Never present an incomplete or disconnected book as live.
export class BinanceOrderBookSync {
  private buffer: BinanceDepthEvent[] = [];
  private snapshot: BookUpdate | null = null;
  private lastUpdateId = 0;
  private bridged = false;

  constructor(
    private market: MarketType,
    private apply: (update: BookUpdate) => void,
    private requestSnapshot: () => void,
  ) {}

  get needsSnapshot() { return !this.snapshot && !this.bridged; }

  reset() {
    this.buffer = [];
    this.snapshot = null;
    this.lastUpdateId = 0;
    this.bridged = false;
  }

  setSnapshot(snapshot: BookUpdate) {
    if (!Number.isSafeInteger(snapshot.sequence) || snapshot.sequence <= 0 || !snapshot.bids.length || !snapshot.asks.length) return;
    this.snapshot = { ...snapshot, isSnapshot: true };
    this.lastUpdateId = snapshot.sequence;
    this.bridged = false;
    const buffered = this.buffer;
    this.buffer = [];
    for (const event of buffered) this.push(event);
  }

  push(event: BinanceDepthEvent) {
    if (!Number.isSafeInteger(event.U) || !Number.isSafeInteger(event.u) || event.U > event.u ||
        !Array.isArray(event.b) || !Array.isArray(event.a)) return;
    if (!this.snapshot && !this.bridged) {
      this.buffer.push(event);
      if (this.buffer.length > 2000) this.buffer.shift();
      return;
    }
    const target = this.market === 'futures' ? this.lastUpdateId : this.lastUpdateId + 1;
    if (this.bridged ? event.u <= this.lastUpdateId : event.u < target) return;
    const gap = this.bridged
      ? this.market === 'futures' ? event.pu !== this.lastUpdateId : event.U > this.lastUpdateId + 1
      : event.U > target;
    if (gap) {
      this.reset();
      this.buffer.push(event);
      this.requestSnapshot();
      return;
    }
    if (!this.bridged && this.snapshot) {
      this.apply(this.snapshot);
      this.snapshot = null;
      this.bridged = true;
    }
    const parse = (levels: [string, string][]): [number, number][] => levels.map(([p, q]) => [Number(p), Number(q)]);
    this.apply({ bids: parse(event.b), asks: parse(event.a), sequence: event.u });
    this.lastUpdateId = event.u;
  }
}

export function binanceStreamUrls(symbol: string, market: MarketType): string[] {
  const lower = symbol.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return market === 'futures'
    ? [`wss://fstream.binance.com/public/stream?streams=${lower}@depth@100ms`,
       `wss://fstream.binance.com/market/stream?streams=${lower}@ticker/${lower}@aggTrade`]
    : [`wss://stream.binance.com:9443/stream?streams=${lower}@depth@100ms/${lower}@ticker/${lower}@aggTrade`];
}

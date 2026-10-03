import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { ExchangeId, MarketType } from '../../src/types';
import { OrderBookStatus } from './types';

export interface RawTradeEvent {
  price: number;
  quantity: number;
  side: 'BUY' | 'SELL';
  time: number;
  isBuyerMaker: boolean;
}

export interface RawDepthDelta {
  bids: [number, number][]; // [price, qty]
  asks: [number, number][];
  isSnapshot?: boolean;
  sequence?: number;
}

export class ExchangeStreamClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private isDestroyed = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;

  private reconnectAttempts = 0;
  private readonly backoffSchedule = [1000, 2000, 5000, 10000, 30000, 60000];

  private bybitTicker: Record<string, any> = {};

  public status: OrderBookStatus = 'CONNECTING';
  public lastDataReceivedAt = 0;

  constructor(
    public readonly symbol: string,
    public readonly exchange: ExchangeId,
    public readonly marketType: MarketType
  ) {
    super();
    this.connect();
    this.startWatchdog();
  }

  private cleanSymbol(): string {
    return this.symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  private getWebSocketUrl(): string {
    const sym = this.cleanSymbol();
    if (this.exchange === 'binance') {
      const lower = sym.toLowerCase();
      if (this.marketType === 'futures') {
        return `wss://fstream.binance.com/stream?streams=${lower}@ticker/${lower}@aggTrade/${lower}@depth20@100ms`;
      } else {
        return `wss://stream.binance.com:9443/stream?streams=${lower}@ticker/${lower}@trade/${lower}@depth20@100ms`;
      }
    } else {
      // Bybit
      if (this.marketType === 'futures') {
        return 'wss://stream.bybit.com/v5/public/linear';
      } else {
        return 'wss://stream.bybit.com/v5/public/spot';
      }
    }
  }

  private setStatus(newStatus: OrderBookStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit('status', newStatus);
    }
  }

  public connect() {
    if (this.isDestroyed) return;
    this.cleanupSocket();

    const url = this.getWebSocketUrl();
    this.setStatus('CONNECTING');

    try {
      this.ws = new WebSocket(url, {
        handshakeTimeout: 10000,
      });

      this.ws.on('open', () => {
        if (this.isDestroyed) return;
        this.reconnectAttempts = 0;
        this.setStatus('SYNCING');
        this.lastDataReceivedAt = Date.now();
        this.bybitTicker = {};

        // If Bybit, send subscription payload and start ping interval
        if (this.exchange === 'bybit') {
          const sym = this.cleanSymbol();
          const subscribeMsg = {
            op: 'subscribe',
            args: [`tickers.${sym}`, `publicTrade.${sym}`, `orderbook.50.${sym}`],
          };
          this.ws?.send(JSON.stringify(subscribeMsg));

          // Bybit heartbeat ping every 20 seconds
          this.pingInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ op: 'ping' }));
            }
          }, 20000);
        }
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        if (this.isDestroyed) return;
        this.lastDataReceivedAt = Date.now();
        try {
          const str = data.toString();
          const json = JSON.parse(str);
          this.handleIncomingMessage(json);
        } catch (e) {
          // invalid json ignore
        }
      });

      this.ws.on('error', (err) => {
        if (this.isDestroyed) return;
        this.setStatus('ERROR');
        this.emit('error', err);
      });

      this.ws.on('close', (code, reason) => {
        if (this.isDestroyed) return;
        this.setStatus('STALE');
        this.scheduleReconnect();
      });
    } catch (e) {
      this.setStatus('ERROR');
      this.scheduleReconnect();
    }
  }

  private handleIncomingMessage(msg: any) {
    if (this.exchange === 'binance') {
      this.handleBinanceMessage(msg.data ?? msg);
    } else {
      this.handleBybitMessage(msg);
    }
  }

  private handleBinanceMessage(msg: any) {
    const eventType = msg.e;

    // Ticker stream (24hr ticker)
    if (eventType === '24hrTicker' || (msg.s && msg.c !== undefined)) {
      const price = parseFloat(msg.c);
      const high24h = parseFloat(msg.h || 0);
      const low24h = parseFloat(msg.l || 0);
      const volume24hUsd = parseFloat(msg.q || 0);
      if (!isNaN(price) && price > 0) {
        this.emit('price', {
          price,
          high24h,
          low24h,
          volume24hUsd,
          change24h: Number(msg.P || 0),
          time: msg.E || Date.now(),
        });
      }
    }

    // Trade stream (trade or aggTrade)
    if (eventType === 'trade' || eventType === 'aggTrade') {
      const price = parseFloat(msg.p);
      const quantity = parseFloat(msg.q);
      const isBuyerMaker = Boolean(msg.m);
      // If buyer is maker, taker is seller -> aggressive SELL. If buyer is taker -> aggressive BUY.
      const side: 'BUY' | 'SELL' = isBuyerMaker ? 'SELL' : 'BUY';

      if (!isNaN(price) && price > 0 && !isNaN(quantity) && quantity > 0) {
        const tradeEvent: RawTradeEvent = {
          price,
          quantity,
          side,
          time: msg.T || msg.E || Date.now(),
          isBuyerMaker,
        };
        this.emit('trade', tradeEvent);
      }
    }

    // Depth stream (depth20)
    const rawBids = msg.bids ?? (eventType === 'depthUpdate' ? msg.b : undefined);
    const rawAsks = msg.asks ?? (eventType === 'depthUpdate' ? msg.a : undefined);
    if (Array.isArray(rawBids) && Array.isArray(rawAsks)) {
      this.setStatus('LIVE');
      const bids: [number, number][] = rawBids.map((b: any) => [parseFloat(b[0]), parseFloat(b[1])]);
      const asks: [number, number][] = rawAsks.map((a: any) => [parseFloat(a[0]), parseFloat(a[1])]);
      this.emit('depth', {
        bids,
        asks,
        isSnapshot: true,
        sequence: msg.lastUpdateId ?? msg.u ?? Date.now(),
      } as RawDepthDelta);
    }
  }

  private handleBybitMessage(msg: any) {
    if (msg.op === 'pong' || msg.ret_msg === 'pong') {
      return;
    }

    const topic = msg.topic || '';

    // Tickers
    if (topic.startsWith('tickers.')) {
      if (msg.type === 'snapshot') this.bybitTicker = {};
      Object.assign(this.bybitTicker, msg.data || {});
      const data = this.bybitTicker;
      if (data) {
        const lastPrice = parseFloat(data.lastPrice);
        const high24h = parseFloat(data.highPrice24h || 0);
        const low24h = parseFloat(data.lowPrice24h || 0);
        const volume24hUsd = parseFloat(data.turnover24h || 0);
        if (!isNaN(lastPrice) && lastPrice > 0) {
          this.emit('price', {
            price: lastPrice,
            high24h,
            low24h,
            volume24hUsd,
            change24h: Number(data.price24hPcnt || 0) * 100,
            time: msg.ts || Date.now(),
          });
        }
      }
    }

    // Public trades
    if (topic.startsWith('publicTrade.')) {
      const tradeList = Array.isArray(msg.data) ? msg.data : [msg.data];
      for (const t of tradeList) {
        if (!t) continue;
        const price = parseFloat(t.p);
        const quantity = parseFloat(t.v);
        const side: 'BUY' | 'SELL' = t.S?.toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
        if (!isNaN(price) && price > 0 && !isNaN(quantity) && quantity > 0) {
          this.emit('trade', {
            price,
            quantity,
            side,
            time: t.T || msg.ts || Date.now(),
            isBuyerMaker: side === 'SELL',
          } as RawTradeEvent);
        }
      }
    }

    // Orderbook 50
    if (topic.startsWith('orderbook.')) {
      const type = msg.type; // 'snapshot' or 'delta'
      const data = msg.data;
      if (data && (data.b || data.a)) {
        this.setStatus('LIVE');
        const bids: [number, number][] = (data.b || []).map((b: any) => [parseFloat(b[0]), parseFloat(b[1])]);
        const asks: [number, number][] = (data.a || []).map((a: any) => [parseFloat(a[0]), parseFloat(a[1])]);
        this.emit('depth', {
          bids,
          asks,
          isSnapshot: type === 'snapshot' || data.u === 1,
          sequence: msg.data?.seq || msg.data?.u || Date.now(),
        } as RawDepthDelta);
      }
    }
  }

  private startWatchdog() {
    this.watchdogTimer = setInterval(() => {
      if (this.isDestroyed) return;
      const now = Date.now();
      const elapsed = now - this.lastDataReceivedAt;

      // Watchdog: If no message for > 12 seconds, consider STALE and trigger reconnect
      if (elapsed > 12000 && this.status !== 'CONNECTING') {
        this.setStatus('STALE');
        console.warn(`[Watchdog] Stale stream detected for ${this.symbol} (${this.exchange}) - reconnecting`);
        this.scheduleReconnect();
      }
    }, 4000);
  }

  private scheduleReconnect() {
    if (this.isDestroyed || this.reconnectTimeout) return;
    const backoffIndex = Math.min(this.reconnectAttempts, this.backoffSchedule.length - 1);
    const delay = this.backoffSchedule[backoffIndex];
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (!this.isDestroyed) {
        this.connect();
      }
    }, delay);
  }

  private cleanupSocket() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        // Closing during the opening handshake emits an asynchronous error.
        // Keep a listener while the discarded socket shuts down.
        this.ws.on('error', () => {});
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.cleanupSocket();
    this.removeAllListeners();
  }
}

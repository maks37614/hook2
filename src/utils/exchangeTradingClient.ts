import { ExchangeApiCredentials, ExchangeId, MarketType, PlacedOrder, AccountBalanceInfo, OrderSide, OrderType } from '../types';

const STORAGE_PREFIX = 'signalhook_exchange_api_';

export function getLocalExchangeCredentials(exchange: ExchangeId, userId?: string): ExchangeApiCredentials | null {
  if (!userId || userId === 'guest') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}_${userId}_${exchange}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveLocalExchangeCredentials(creds: ExchangeApiCredentials, userId?: string): void {
  if (!userId || userId === 'guest') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}_${userId}_${creds.exchange}`, JSON.stringify(creds));
  } catch (err) {
    console.error('Failed to save exchange credentials locally', err);
  }
}

export function removeLocalExchangeCredentials(exchange: ExchangeId, userId?: string): void {
  if (!userId || userId === 'guest') return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}_${userId}_${exchange}`);
  } catch {}
}

export async function testExchangeApiKeys(
  credentials: ExchangeApiCredentials
): Promise<{ success: boolean; balance?: AccountBalanceInfo; message: string }> {
  try {
    const res = await fetch('/api/exchange/test-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, message: `Помилка мережі: ${err?.message || err}` };
  }
}

export async function submitExchangeOrder(
  credentials: ExchangeApiCredentials,
  order: {
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: number;
    price?: number;
    stopPrice?: number;
    timeInForce?: 'GTC' | 'IOC' | 'FOK';
    reduceOnly?: boolean;
    clientOrderId?: string;
  }
): Promise<{ success: boolean; order?: PlacedOrder; message: string }> {
  try {
    const res = await fetch('/api/exchange/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials, order }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, message: `Помилка мережі: ${err?.message || err}` };
  }
}

export async function getExchangeOpenOrders(
  credentials: ExchangeApiCredentials,
  symbol?: string
): Promise<{ success: boolean; orders: PlacedOrder[]; message?: string }> {
  try {
    const res = await fetch('/api/exchange/open-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials, symbol }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, orders: [], message: err?.message || 'Помилка завантаження ордерів' };
  }
}

export async function cancelExchangeOrderById(
  credentials: ExchangeApiCredentials,
  symbol: string,
  orderId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/exchange/cancel-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials, symbol, orderId }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, message: err?.message || 'Помилка скасування заявки' };
  }
}

export async function cancelAllExchangeOrdersForSymbol(
  credentials: ExchangeApiCredentials,
  symbol: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/exchange/cancel-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials, symbol }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, message: err?.message || 'Помилка скасування заявок' };
  }
}

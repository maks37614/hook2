import crypto from 'crypto';
import { ExchangeApiCredentials, ExchangeId, MarketType, PlacedOrder, AccountBalanceInfo, OrderSide, OrderType } from '../src/types';

// Helper to sign Binance requests
function signBinance(queryString: string, apiSecret: string): string {
  return crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
}

// Helper to sign Bybit requests (V5 API)
function signBybit(
  timestamp: string,
  apiKey: string,
  recvWindow: string,
  queryStringOrBody: string,
  apiSecret: string
): string {
  const message = timestamp + apiKey + recvWindow + queryStringOrBody;
  return crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
}

function cleanSymbol(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Test API credentials and return account balance details
 */
export async function testExchangeCredentials(
  creds: ExchangeApiCredentials
): Promise<{ success: boolean; balance?: AccountBalanceInfo; message: string }> {
  try {
    if (!creds.apiKey?.trim() || !creds.apiSecret?.trim()) {
      return { success: false, message: 'API Key та Secret Key обов’язкові для заповнення' };
    }

    const apiKey = creds.apiKey.trim();
    const apiSecret = creds.apiSecret.trim();
    const isTestnet = !!creds.isTestnet;
    const marketType = creds.marketType || 'futures';

    if (creds.exchange === 'binance') {
      if (marketType === 'futures') {
        const baseUrl = isTestnet
          ? 'https://testnet.binancefuture.com'
          : 'https://fapi.binance.com';

        const timestamp = Date.now();
        const query = `timestamp=${timestamp}&recvWindow=5000`;
        const signature = signBinance(query, apiSecret);

        const res = await fetch(`${baseUrl}/fapi/v2/account?${query}&signature=${signature}`, {
          method: 'GET',
          headers: {
            'X-MBX-APIKEY': apiKey,
            'Content-Type': 'application/json',
          },
        });

        const data = await res.json();
        if (!res.ok) {
          const errCode = data?.code || res.status;
          const errMsg = data?.msg || 'Помилка підключення до Binance Futures';
          return { success: false, message: `Binance Error [${errCode}]: ${errMsg}` };
        }

        const totalWallet = parseFloat(data.totalWalletBalance || '0');
        const available = parseFloat(data.availableBalance || '0');
        const unrealizedPnl = parseFloat(data.totalUnrealizedProfit || '0');
        const marginBalance = parseFloat(data.totalMarginBalance || '0');

        return {
          success: true,
          message: `✅ Успішно підключено до Binance Futures! Баланс: $${available.toFixed(2)} USDT (Всього: $${totalWallet.toFixed(2)})`,
          balance: {
            exchange: 'binance',
            marketType: 'futures',
            totalWalletBalance: totalWallet,
            availableBalance: available,
            unrealizedPnl,
            marginBalance,
            currency: 'USDT',
            isTestnet,
          },
        };
      } else {
        // Binance Spot
        const baseUrl = isTestnet
          ? 'https://testnet.binance.vision'
          : 'https://api.binance.com';

        const timestamp = Date.now();
        const query = `timestamp=${timestamp}&recvWindow=5000`;
        const signature = signBinance(query, apiSecret);

        const res = await fetch(`${baseUrl}/api/v3/account?${query}&signature=${signature}`, {
          method: 'GET',
          headers: {
            'X-MBX-APIKEY': apiKey,
            'Content-Type': 'application/json',
          },
        });

        const data = await res.json();
        if (!res.ok) {
          const errCode = data?.code || res.status;
          const errMsg = data?.msg || 'Помилка підключення до Binance Spot';
          return { success: false, message: `Binance Spot Error [${errCode}]: ${errMsg}` };
        }

        const usdtAsset = (data.balances || []).find((b: any) => b.asset === 'USDT') || { free: '0', locked: '0' };
        const freeUsdt = parseFloat(usdtAsset.free || '0');
        const lockedUsdt = parseFloat(usdtAsset.locked || '0');

        return {
          success: true,
          message: `✅ Успішно підключено до Binance Spot! Вільний USDT: $${freeUsdt.toFixed(2)}`,
          balance: {
            exchange: 'binance',
            marketType: 'spot',
            totalWalletBalance: freeUsdt + lockedUsdt,
            availableBalance: freeUsdt,
            unrealizedPnl: 0,
            currency: 'USDT',
            isTestnet,
          },
        };
      }
    } else if (creds.exchange === 'bybit') {
      const baseUrl = isTestnet
        ? 'https://api-testnet.bybit.com'
        : 'https://api.bybit.com';

      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const queryString = 'accountType=UNIFIED';
      const signature = signBybit(timestamp, apiKey, recvWindow, queryString, apiSecret);

      const res = await fetch(`${baseUrl}/v5/account/wallet-balance?${queryString}`, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'X-BAPI-SIGN': signature,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();
      if (!res.ok || data.retCode !== 0) {
        const errCode = data?.retCode || res.status;
        const errMsg = data?.retMsg || 'Помилка підключення до Bybit API V5';
        return { success: false, message: `Bybit Error [${errCode}]: ${errMsg}` };
      }

      const account = data.result?.list?.[0] || {};
      const totalWallet = parseFloat(account.totalWalletBalance || '0');
      const totalEquity = parseFloat(account.totalEquity || '0');
      const usdtCoin = (account.coin || []).find((c: any) => c.coin === 'USDT') || {};
      const available = parseFloat(usdtCoin.availableToWithdraw || usdtCoin.walletBalance || account.totalAvailableBalance || '0');
      const unrealizedPnl = parseFloat(account.totalPerpUPL || '0');

      return {
        success: true,
        message: `✅ Успішно підключено до Bybit V5! Доступно: $${available.toFixed(2)} USDT (Еквіті: $${totalEquity.toFixed(2)})`,
        balance: {
          exchange: 'bybit',
          marketType: creds.marketType || 'futures',
          totalWalletBalance: totalWallet,
          availableBalance: available,
          unrealizedPnl,
          marginBalance: totalEquity,
          currency: 'USDT',
          isTestnet,
        },
      };
    }

    return { success: false, message: 'Непідтримувана біржа' };
  } catch (err: any) {
    return { success: false, message: `Мережева помилка перевірки ключів: ${err?.message || err}` };
  }
}

/**
 * Place order on Binance or Bybit
 */
export async function placeExchangeOrder(
  creds: ExchangeApiCredentials,
  params: {
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
): Promise<{ success: boolean; order?: PlacedOrder; message: string; rawResponse?: any }> {
  try {
    const apiKey = creds.apiKey?.trim();
    const apiSecret = creds.apiSecret?.trim();
    const isTestnet = !!creds.isTestnet;
    const marketType = creds.marketType || 'futures';
    const symbol = cleanSymbol(params.symbol);

    if (!apiKey || !apiSecret) {
      return { success: false, message: 'API ключі не налаштовані в профілі' };
    }

    if (params.quantity <= 0) {
      return { success: false, message: 'Кількість ордера повинна бути більшою за 0' };
    }

    if ((params.type === 'LIMIT' || params.type === 'STOP') && (!params.price || params.price <= 0)) {
      return { success: false, message: 'Для лімітної заявки необхідно вказати ціну' };
    }

    if ((params.type === 'STOP_MARKET' || params.type === 'STOP' || params.type === 'TAKE_PROFIT_MARKET' || params.type === 'TAKE_PROFIT') && (!params.stopPrice || params.stopPrice <= 0)) {
      return { success: false, message: 'Для стоп або тейк-профіт заявки необхідно вказати тригерну ціну (stopPrice)' };
    }

    if (creds.exchange === 'binance') {
      if (marketType === 'futures') {
        const baseUrl = isTestnet
          ? 'https://testnet.binancefuture.com'
          : 'https://fapi.binance.com';

        const timestamp = Date.now();
        const payload: Record<string, any> = {
          symbol,
          side: params.side,
          quantity: params.quantity,
          timestamp,
          recvWindow: 5000,
        };

        if (params.clientOrderId) {
          payload.newClientOrderId = params.clientOrderId;
        }

        // Map order types to Binance Futures API
        if (params.type === 'MARKET') {
          payload.type = 'MARKET';
        } else if (params.type === 'LIMIT') {
          payload.type = 'LIMIT';
          payload.price = params.price;
          payload.timeInForce = params.timeInForce || 'GTC';
        } else if (params.type === 'STOP_MARKET') {
          payload.type = 'STOP_MARKET';
          payload.stopPrice = params.stopPrice;
          if (params.reduceOnly) payload.reduceOnly = 'true';
        } else if (params.type === 'STOP') {
          payload.type = 'STOP';
          payload.stopPrice = params.stopPrice;
          payload.price = params.price || params.stopPrice;
          payload.timeInForce = params.timeInForce || 'GTC';
          if (params.reduceOnly) payload.reduceOnly = 'true';
        } else if (params.type === 'TAKE_PROFIT_MARKET') {
          payload.type = 'TAKE_PROFIT_MARKET';
          payload.stopPrice = params.stopPrice;
          if (params.reduceOnly) payload.reduceOnly = 'true';
        } else if (params.type === 'TAKE_PROFIT') {
          payload.type = 'TAKE_PROFIT';
          payload.stopPrice = params.stopPrice;
          payload.price = params.price || params.stopPrice;
          payload.timeInForce = params.timeInForce || 'GTC';
          if (params.reduceOnly) payload.reduceOnly = 'true';
        }

        const queryString = Object.entries(payload)
          .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
          .join('&');

        const signature = signBinance(queryString, apiSecret);
        const fullUrl = `${baseUrl}/fapi/v1/order?${queryString}&signature=${signature}`;

        const res = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });

        const data = await res.json();
        if (!res.ok) {
          const errCode = data?.code || res.status;
          const errMsg = data?.msg || 'Помилка виставлення ордера Binance';
          return { success: false, message: `Помилка Binance [${errCode}]: ${errMsg}`, rawResponse: data };
        }

        const placed: PlacedOrder = {
          orderId: String(data.orderId),
          clientOrderId: data.clientOrderId,
          symbol: data.symbol,
          exchange: 'binance',
          marketType: 'futures',
          side: data.side,
          type: params.type,
          price: data.price ? parseFloat(data.price) : params.price,
          stopPrice: data.stopPrice ? parseFloat(data.stopPrice) : params.stopPrice,
          origQty: parseFloat(data.origQty || params.quantity.toString()),
          executedQty: parseFloat(data.executedQty || '0'),
          status: data.status || 'NEW',
          time: data.updateTime || Date.now(),
        };

        const sideLabel = params.side === 'BUY' ? 'Купівля' : 'Продаж';
        const typeLabel =
          params.type === 'LIMIT' ? 'Лімітна' :
          params.type === 'MARKET' ? 'По ринку' :
          params.type === 'STOP_MARKET' || params.type === 'STOP' ? 'Стоп-лос' : 'Тейк-профіт';

        return {
          success: true,
          order: placed,
          message: `✅ Заявка успішно виставлена: ${typeLabel} ${sideLabel} ${placed.origQty} ${symbol} @ ${placed.price ? `$${placed.price}` : 'Маркет'}`,
          rawResponse: data,
        };
      } else {
        // Binance Spot
        const baseUrl = isTestnet
          ? 'https://testnet.binance.vision'
          : 'https://api.binance.com';

        const timestamp = Date.now();
        const payload: Record<string, any> = {
          symbol,
          side: params.side,
          quantity: params.quantity,
          timestamp,
          recvWindow: 5000,
        };

        if (params.type === 'MARKET') {
          payload.type = 'MARKET';
        } else if (params.type === 'LIMIT') {
          payload.type = 'LIMIT';
          payload.price = params.price;
          payload.timeInForce = params.timeInForce || 'GTC';
        } else {
          payload.type = 'STOP_LOSS_LIMIT';
          payload.stopPrice = params.stopPrice;
          payload.price = params.price || params.stopPrice;
          payload.timeInForce = 'GTC';
        }

        const queryString = Object.entries(payload)
          .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
          .join('&');

        const signature = signBinance(queryString, apiSecret);
        const res = await fetch(`${baseUrl}/api/v3/order?${queryString}&signature=${signature}`, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKey,
          },
        });

        const data = await res.json();
        if (!res.ok) {
          return { success: false, message: `Помилка Binance Spot [${data?.code}]: ${data?.msg || 'Не вдалося виставити ордер'}`, rawResponse: data };
        }

        const placed: PlacedOrder = {
          orderId: String(data.orderId),
          clientOrderId: data.clientOrderId,
          symbol: data.symbol,
          exchange: 'binance',
          marketType: 'spot',
          side: data.side,
          type: params.type,
          price: data.price ? parseFloat(data.price) : params.price,
          origQty: parseFloat(data.origQty || params.quantity.toString()),
          executedQty: parseFloat(data.executedQty || '0'),
          status: data.status || 'NEW',
          time: data.transactTime || Date.now(),
        };

        return {
          success: true,
          order: placed,
          message: `✅ Спот ордер виконано: ${params.side} ${placed.origQty} ${symbol}`,
          rawResponse: data,
        };
      }
    } else if (creds.exchange === 'bybit') {
      const baseUrl = isTestnet
        ? 'https://api-testnet.bybit.com'
        : 'https://api.bybit.com';

      const timestamp = Date.now().toString();
      const recvWindow = '5000';

      const isConditional = params.type === 'STOP_MARKET' || params.type === 'STOP' || params.type === 'TAKE_PROFIT_MARKET' || params.type === 'TAKE_PROFIT';
      const orderType = (params.type === 'MARKET' || params.type === 'STOP_MARKET' || params.type === 'TAKE_PROFIT_MARKET') ? 'Market' : 'Limit';

      const reqBody: Record<string, any> = {
        category: marketType === 'spot' ? 'spot' : 'linear',
        symbol,
        side: params.side === 'BUY' ? 'Buy' : 'Sell',
        orderType,
        qty: params.quantity.toString(),
        timeInForce: params.timeInForce || 'GTC',
      };

      if (params.price && orderType === 'Limit') {
        reqBody.price = params.price.toString();
      }

      if (isConditional && params.stopPrice) {
        reqBody.triggerPrice = params.stopPrice.toString();
        reqBody.orderFilter = 'StopOrder';
      }

      if (params.reduceOnly) {
        reqBody.reduceOnly = true;
      }

      const bodyStr = JSON.stringify(reqBody);
      const signature = signBybit(timestamp, apiKey, recvWindow, bodyStr, apiSecret);

      const res = await fetch(`${baseUrl}/v5/order/create`, {
        method: 'POST',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'X-BAPI-SIGN': signature,
          'Content-Type': 'application/json',
        },
        body: bodyStr,
      });

      const data = await res.json();
      if (!res.ok || data.retCode !== 0) {
        return {
          success: false,
          message: `Помилка Bybit V5 [${data?.retCode}]: ${data?.retMsg || 'Не вдалося створити ордер'}`,
          rawResponse: data,
        };
      }

      const placed: PlacedOrder = {
        orderId: data.result?.orderId || `bybit-${Date.now()}`,
        clientOrderId: data.result?.orderLinkId,
        symbol,
        exchange: 'bybit',
        marketType,
        side: params.side,
        type: params.type,
        price: params.price,
        stopPrice: params.stopPrice,
        origQty: params.quantity,
        executedQty: 0,
        status: 'NEW',
        time: Date.now(),
      };

      return {
        success: true,
        order: placed,
        message: `✅ Заявка успішно зареєстрована на Bybit V5! ID: ${placed.orderId}`,
        rawResponse: data,
      };
    }

    return { success: false, message: 'Невідома біржа' };
  } catch (err: any) {
    return { success: false, message: `Помилка створення заявки: ${err?.message || err}` };
  }
}

/**
 * Fetch open orders for symbol or account
 */
export async function fetchOpenOrders(
  creds: ExchangeApiCredentials,
  symbol?: string
): Promise<{ success: boolean; orders: PlacedOrder[]; message?: string }> {
  try {
    const apiKey = creds.apiKey?.trim();
    const apiSecret = creds.apiSecret?.trim();
    const isTestnet = !!creds.isTestnet;
    const marketType = creds.marketType || 'futures';

    if (!apiKey || !apiSecret) {
      return { success: false, orders: [], message: 'Ключі API не налаштовані' };
    }

    const cleanSym = symbol ? cleanSymbol(symbol) : '';

    if (creds.exchange === 'binance') {
      if (marketType === 'futures') {
        const baseUrl = isTestnet
          ? 'https://testnet.binancefuture.com'
          : 'https://fapi.binance.com';

        const timestamp = Date.now();
        let query = `timestamp=${timestamp}&recvWindow=5000`;
        if (cleanSym) query += `&symbol=${cleanSym}`;

        const signature = signBinance(query, apiSecret);
        const res = await fetch(`${baseUrl}/fapi/v1/openOrders?${query}&signature=${signature}`, {
          method: 'GET',
          headers: { 'X-MBX-APIKEY': apiKey },
        });

        const data = await res.json();
        if (!res.ok) {
          return { success: false, orders: [], message: data?.msg || 'Помилка отримання відкритих ордерів' };
        }

        const orders: PlacedOrder[] = (Array.isArray(data) ? data : []).map((o: any) => ({
          orderId: String(o.orderId),
          clientOrderId: o.clientOrderId,
          symbol: o.symbol,
          exchange: 'binance',
          marketType: 'futures',
          side: o.side,
          type: o.type,
          price: parseFloat(o.price || '0'),
          stopPrice: parseFloat(o.stopPrice || '0'),
          origQty: parseFloat(o.origQty || '0'),
          executedQty: parseFloat(o.executedQty || '0'),
          status: o.status,
          time: o.time || o.updateTime || Date.now(),
        }));

        return { success: true, orders };
      } else {
        // Binance Spot
        const baseUrl = isTestnet
          ? 'https://testnet.binance.vision'
          : 'https://api.binance.com';

        const timestamp = Date.now();
        let query = `timestamp=${timestamp}&recvWindow=5000`;
        if (cleanSym) query += `&symbol=${cleanSym}`;

        const signature = signBinance(query, apiSecret);
        const res = await fetch(`${baseUrl}/api/v3/openOrders?${query}&signature=${signature}`, {
          method: 'GET',
          headers: { 'X-MBX-APIKEY': apiKey },
        });

        const data = await res.json();
        if (!res.ok) {
          return { success: false, orders: [], message: data?.msg || 'Помилка ордерів Spot' };
        }

        const orders: PlacedOrder[] = (Array.isArray(data) ? data : []).map((o: any) => ({
          orderId: String(o.orderId),
          clientOrderId: o.clientOrderId,
          symbol: o.symbol,
          exchange: 'binance',
          marketType: 'spot',
          side: o.side,
          type: o.type,
          price: parseFloat(o.price || '0'),
          stopPrice: parseFloat(o.stopPrice || '0'),
          origQty: parseFloat(o.origQty || '0'),
          executedQty: parseFloat(o.executedQty || '0'),
          status: o.status,
          time: o.time || Date.now(),
        }));

        return { success: true, orders };
      }
    } else if (creds.exchange === 'bybit') {
      const baseUrl = isTestnet
        ? 'https://api-testnet.bybit.com'
        : 'https://api.bybit.com';

      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const category = marketType === 'spot' ? 'spot' : 'linear';
      let queryString = `category=${category}`;
      if (cleanSym) queryString += `&symbol=${cleanSym}`;

      const signature = signBybit(timestamp, apiKey, recvWindow, queryString, apiSecret);
      const res = await fetch(`${baseUrl}/v5/order/realtime?${queryString}`, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'X-BAPI-SIGN': signature,
        },
      });

      const data = await res.json();
      if (!res.ok || data.retCode !== 0) {
        return { success: false, orders: [], message: data?.retMsg || 'Помилка Bybit open orders' };
      }

      const list = data.result?.list || [];
      const orders: PlacedOrder[] = list.map((o: any) => ({
        orderId: String(o.orderId),
        clientOrderId: o.orderLinkId,
        symbol: o.symbol,
        exchange: 'bybit',
        marketType,
        side: o.side?.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
        type: o.orderType?.toUpperCase() === 'MARKET' ? 'MARKET' : 'LIMIT',
        price: parseFloat(o.price || '0'),
        stopPrice: parseFloat(o.triggerPrice || '0'),
        origQty: parseFloat(o.qty || '0'),
        executedQty: parseFloat(o.cumExecQty || '0'),
        status: o.orderStatus === 'New' ? 'NEW' : o.orderStatus === 'PartiallyFilled' ? 'PARTIALLY_FILLED' : 'NEW',
        time: parseInt(o.createdTime, 10) || Date.now(),
      }));

      return { success: true, orders };
    }

    return { success: false, orders: [], message: 'Непідтримувана біржа' };
  } catch (err: any) {
    return { success: false, orders: [], message: err?.message || 'Помилка запиту відкритих ордерів' };
  }
}

/**
 * Cancel single order
 */
export async function cancelExchangeOrder(
  creds: ExchangeApiCredentials,
  symbol: string,
  orderId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const apiKey = creds.apiKey?.trim();
    const apiSecret = creds.apiSecret?.trim();
    const isTestnet = !!creds.isTestnet;
    const marketType = creds.marketType || 'futures';
    const cleanSym = cleanSymbol(symbol);

    if (creds.exchange === 'binance') {
      const baseUrl = marketType === 'futures'
        ? (isTestnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com')
        : (isTestnet ? 'https://testnet.binance.vision' : 'https://api.binance.com');

      const path = marketType === 'futures' ? '/fapi/v1/order' : '/api/v3/order';
      const timestamp = Date.now();
      const query = `symbol=${cleanSym}&orderId=${orderId}&timestamp=${timestamp}&recvWindow=5000`;
      const signature = signBinance(query, apiSecret);

      const res = await fetch(`${baseUrl}${path}?${query}&signature=${signature}`, {
        method: 'DELETE',
        headers: { 'X-MBX-APIKEY': apiKey },
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, message: `Помилка скасування Binance: ${data?.msg || res.statusText}` };
      }

      return { success: true, message: `✅ Ордер #${orderId} успішно скасовано` };
    } else if (creds.exchange === 'bybit') {
      const baseUrl = isTestnet
        ? 'https://api-testnet.bybit.com'
        : 'https://api.bybit.com';

      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const reqBody = {
        category: marketType === 'spot' ? 'spot' : 'linear',
        symbol: cleanSym,
        orderId,
      };

      const bodyStr = JSON.stringify(reqBody);
      const signature = signBybit(timestamp, apiKey, recvWindow, bodyStr, apiSecret);

      const res = await fetch(`${baseUrl}/v5/order/cancel`, {
        method: 'POST',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'X-BAPI-SIGN': signature,
          'Content-Type': 'application/json',
        },
        body: bodyStr,
      });

      const data = await res.json();
      if (!res.ok || data.retCode !== 0) {
        return { success: false, message: `Помилка скасування Bybit: ${data?.retMsg || 'Помилка'}` };
      }

      return { success: true, message: `✅ Ордер #${orderId} успішно скасовано на Bybit` };
    }

    return { success: false, message: 'Непідтримувана біржа' };
  } catch (err: any) {
    return { success: false, message: `Помилка скасування ордера: ${err?.message || err}` };
  }
}

/**
 * Cancel all open orders for symbol
 */
export async function cancelAllExchangeOrders(
  creds: ExchangeApiCredentials,
  symbol: string
): Promise<{ success: boolean; message: string }> {
  try {
    const apiKey = creds.apiKey?.trim();
    const apiSecret = creds.apiSecret?.trim();
    const isTestnet = !!creds.isTestnet;
    const marketType = creds.marketType || 'futures';
    const cleanSym = cleanSymbol(symbol);

    if (creds.exchange === 'binance') {
      if (marketType === 'futures') {
        const baseUrl = isTestnet
          ? 'https://testnet.binancefuture.com'
          : 'https://fapi.binance.com';

        const timestamp = Date.now();
        const query = `symbol=${cleanSym}&timestamp=${timestamp}&recvWindow=5000`;
        const signature = signBinance(query, apiSecret);

        const res = await fetch(`${baseUrl}/fapi/v1/allOpenOrders?${query}&signature=${signature}`, {
          method: 'DELETE',
          headers: { 'X-MBX-APIKEY': apiKey },
        });

        const data = await res.json();
        if (!res.ok) {
          return { success: false, message: `Помилка Binance: ${data?.msg || res.statusText}` };
        }

        return { success: true, message: `✅ Усі відкриті заявки по ${cleanSym} скасовано` };
      }
    } else if (creds.exchange === 'bybit') {
      const baseUrl = isTestnet
        ? 'https://api-testnet.bybit.com'
        : 'https://api.bybit.com';

      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const reqBody = {
        category: marketType === 'spot' ? 'spot' : 'linear',
        symbol: cleanSym,
      };

      const bodyStr = JSON.stringify(reqBody);
      const signature = signBybit(timestamp, apiKey, recvWindow, bodyStr, apiSecret);

      const res = await fetch(`${baseUrl}/v5/order/cancel-all`, {
        method: 'POST',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'X-BAPI-SIGN': signature,
          'Content-Type': 'application/json',
        },
        body: bodyStr,
      });

      const data = await res.json();
      if (!res.ok || data.retCode !== 0) {
        return { success: false, message: `Помилка Bybit: ${data?.retMsg || 'Помилка'}` };
      }

      return { success: true, message: `✅ Усі заявки по ${cleanSym} на Bybit успішно скасовано` };
    }

    return { success: false, message: 'Операція не підтримується для цієї конфігурації' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Помилка скасування заявок' };
  }
}

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { runScreenerScan, fetchKlines, fetchMarketCoins } from './server/marketService';
import { analyzeFormationWithAI } from './server/geminiService';
import { generateSmartAnalysis } from './server/smartAnalysisService';
import { calculateMarketSentiment } from './server/sentimentService';
import {
  getEffectiveTelegramConfig,
  getTelegramBotInfo,
  saveTelegramConfig,
  testTelegramConnection,
  detectChatIdFromUpdates,
} from './server/telegramService';
import {
  getAllAlerts,
  createAlert,
  createAlertsBatch,
  deleteAlert,
  toggleAlert,
  clearTriggeredAlerts,
  syncUserAlerts,
  startAlertMonitor,
  getAlertHistory,
  clearAlertHistory,
  deleteHistoryItem,
  saveUserTelegram,
  getUserTelegram,
} from './server/alertService';
import {
  loadSurveillanceList,
  saveSurveillanceList,
  getDefaultSurveillanceConfig,
  checkCoinSurveillance,
  startSurveillanceMonitor,
  checkAllUserCoins,
  findSurveillanceCoinById,
} from './server/surveillanceService';
import { ExchangeId, MarketType, Timeframe } from './src/types';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Verify access code for registration
  const AUTHOR_VALID_CODES = new Set([
    'SCALPER2025',
    'VIP-TELEGRAM',
    'CRYPTOPATTERN',
    'METASCALP',
    'ALPHA-ACCESS',
    'VIP2025',
    'VIP',
    'TELEGRAM-PRO',
    'SIGNALHOOK',
    'TRADE-UA',
    'VIP-PASS',
    'METASCALP-VIP',
  ]);

  app.post('/api/auth/verify-code', (req, res) => {
    const code = (req.body?.code || '').toString().trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ valid: false, message: 'Код не вказано' });
    }
    const isValid = AUTHOR_VALID_CODES.has(code);
    return res.json({
      valid: isValid,
      code,
      message: isValid
        ? 'Спеціальний код підтверджено'
        : 'Недійсний код доступу. Отримайте дійсний код у Telegram каналі автора.',
    });
  });

  // Screener Scan endpoint
  app.get('/api/screener/scan', async (req, res) => {
    try {
      const exchange = (req.query.exchange as 'all' | ExchangeId) || 'all';
      const marketType = (req.query.marketType as 'all' | MarketType) || 'all';
      const timeframe = (req.query.timeframe as Timeframe) || '1h';
      const minVolumeUsd = req.query.minVolume !== undefined ? parseFloat(req.query.minVolume as string) : 50_000;

      const results = await runScreenerScan({
        exchange,
        marketType,
        timeframe,
        minVolumeUsd,
      });

      res.json({
        success: true,
        count: results.length,
        coinsWithFormationsCount: results.filter((c) => c.formations.length > 0).length,
        data: results,
      });
    } catch (err: any) {
      console.error('Error during screener scan:', err);
      res.status(500).json({ success: false, error: err.message || 'Scan failed' });
    }
  });

  // Dedicated Coins Screener endpoint (all coins with 24h volume, price change, high/low proximity)
  app.get('/api/screener/coins', async (req, res) => {
    try {
      const exchange = (req.query.exchange as 'all' | ExchangeId) || 'all';
      const marketType = (req.query.marketType as 'all' | MarketType) || 'all';
      const minVolumeUsd = req.query.minVolume !== undefined ? parseFloat(req.query.minVolume as string) : 0;

      const coins = await fetchMarketCoins({
        exchange,
        marketType,
        minVolumeUsd,
      });

      res.json({
        success: true,
        count: coins.length,
        data: coins,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      console.error('Error fetching screener coins:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch coins' });
    }
  });

  // Market Sentiment endpoint ("Настрій Ринку")
  app.get('/api/market/sentiment', async (req, res) => {
    try {
      const sentiment = await calculateMarketSentiment();
      res.json({ success: true, data: sentiment });
    } catch (err: any) {
      console.error('Error calculating market sentiment:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to calculate market sentiment' });
    }
  });

  // Smart Analysis endpoint ("Розумний Аналіз")
  app.get('/api/market/smart-analysis', async (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || 'BTCUSDT';
      const exchange = (req.query.exchange as ExchangeId) || 'binance';
      const marketType = (req.query.marketType as MarketType) || 'futures';
      const timeframe = (req.query.timeframe as Timeframe) || '1h';
      const currentPrice = req.query.price ? parseFloat(req.query.price as string) : undefined;

      const analysis = await generateSmartAnalysis({
        symbol,
        exchange,
        marketType,
        timeframe,
        currentPrice,
      });

      res.json({ success: true, data: analysis });
    } catch (err: any) {
      console.error('Error generating smart analysis:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to generate smart analysis' });
    }
  });

  // Klines endpoint for interactive chart
  app.get('/api/klines', async (req, res) => {
    try {
      const exchange = (req.query.exchange as ExchangeId) || 'binance';
      const market = (req.query.market as MarketType) || 'futures';
      const symbol = (req.query.symbol as string) || 'BTCUSDT';
      const timeframe = (req.query.timeframe as Timeframe) || '1h';
      const limit = req.query.limit ? Math.min(Math.max(parseInt(req.query.limit as string, 10) || 500, 10), 1000) : 500;

      const klines = await fetchKlines(exchange, market, symbol, timeframe, limit);
      res.json({ success: true, symbol, exchange, timeframe, data: klines });
    } catch (err: any) {
      console.error('Error fetching klines:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch klines' });
    }
  });

  // AI Formation analysis endpoint
  app.post('/api/ai/analyze-formation', async (req, res) => {
    try {
      const { symbol, exchange, timeframe, formation, currentPrice, recentCandles } = req.body;
      if (!symbol || !formation) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const analysis = await analyzeFormationWithAI(
        symbol,
        exchange || 'binance',
        timeframe || '1h',
        formation,
        currentPrice || formation.levels?.entryPrice || 0,
        recentCandles || []
      );

      res.json({ success: true, analysis });
    } catch (err: any) {
      console.error('Error analyzing formation with AI:', err);
      res.status(500).json({ success: false, error: err.message || 'AI analysis failed' });
    }
  });

  // Telegram config and status endpoints
  app.get('/api/telegram/status', async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const userTg = userId ? getUserTelegram(userId) : undefined;
      const globalCfg = getEffectiveTelegramConfig();

      const activeToken = userTg?.botToken || globalCfg.botToken;
      const activeChatId = userTg?.chatId || globalCfg.chatId;

      let botUsername: string | undefined;
      if (activeToken) {
        const info = await getTelegramBotInfo(activeToken);
        if (info.ok) botUsername = info.username;
      }
      res.json({
        success: true,
        isConfigured: Boolean(activeToken && activeChatId),
        botUsername,
        chatId: activeChatId || undefined,
        hasBotToken: Boolean(activeToken),
        hasEnvToken: globalCfg.hasEnvToken,
        hasEnvChatId: globalCfg.hasEnvChatId,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/telegram/config', async (req, res) => {
    try {
      const { botToken, chatId, userId } = req.body;
      const tokenStr = botToken !== undefined && String(botToken).trim() !== '' ? String(botToken).trim() : undefined;
      const chatStr = chatId !== undefined && String(chatId).trim() !== '' ? String(chatId).trim() : undefined;

      if (userId) {
        saveUserTelegram(String(userId), { botToken: tokenStr, chatId: chatStr });
      }

      saveTelegramConfig({
        botToken: tokenStr,
        chatId: chatStr,
      });

      const globalCfg = getEffectiveTelegramConfig();
      const activeToken = tokenStr || globalCfg.botToken;
      const activeChatId = chatStr || globalCfg.chatId;

      const info = activeToken ? await getTelegramBotInfo(activeToken) : { ok: false };
      res.json({
        success: true,
        isConfigured: Boolean(activeToken && activeChatId),
        botUsername: info.username,
        chatId: activeChatId,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/telegram/test', async (req, res) => {
    try {
      const { botToken, chatId, userId } = req.body;
      const result = await testTelegramConnection(botToken, chatId);
      if (result.success && userId) {
        saveUserTelegram(String(userId), { botToken, chatId });
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/telegram/detect-chat-id', async (req, res) => {
    try {
      const { botToken } = req.body;
      const result = await detectChatIdFromUpdates(botToken);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Price Alerts CRUD endpoints (with per-user scoping)
  app.get('/api/alerts', (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const alerts = getAllAlerts(userId);
      const cfg = getEffectiveTelegramConfig();
      res.json({
        success: true,
        alerts,
        isTelegramConfigured: Boolean(cfg.botToken && cfg.chatId),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // User alerts sync endpoint (connects client-side user alerts to backend background price monitor)
  app.post('/api/alerts/sync', (req, res) => {
    try {
      const { userId, alerts, telegramBotToken, telegramChatId } = req.body;
      if (!userId || !Array.isArray(alerts)) {
        return res.status(400).json({ success: false, error: 'Missing userId or alerts array' });
      }
      const merged = syncUserAlerts(userId, alerts, telegramBotToken, telegramChatId);
      res.json({ success: true, count: merged.length, alerts: merged });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get alert notification history
  app.get('/api/alerts/history', (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const history = getAlertHistory(userId);
      res.json({ success: true, history });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Clear alert history
  app.post('/api/alerts/history/clear', (req, res) => {
    try {
      const userId = (req.body?.userId || req.query.userId) as string | undefined;
      const cleared = clearAlertHistory(userId);
      res.json({ success: true, cleared });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete single history item
  app.delete('/api/alerts/history/:id', (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const success = deleteHistoryItem(req.params.id, userId);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/alerts', (req, res) => {
    try {
      const {
        id,
        symbol,
        exchange,
        marketType,
        targetPrice,
        condition,
        note,
        formationName,
        levelType,
        userId,
        telegramBotToken,
        telegramChatId,
        isActive,
      } = req.body;

      if (!symbol || targetPrice === undefined || !condition) {
        return res.status(400).json({ success: false, error: 'Вкажіть символ, цільову ціну та умову (gte або lte)' });
      }

      const numPrice = parseFloat(targetPrice);
      if (isNaN(numPrice) || numPrice <= 0) {
        return res.status(400).json({ success: false, error: 'Цільова ціна повинна бути додатнім числом' });
      }

      if (!userId || userId === 'guest') {
        return res.status(401).json({
          success: false,
          error: 'Встановлення сповіщень доступне тільки для зареєстрованих користувачів. Будь ласка, увійдіть або зареєструйтесь.',
        });
      }

      const alert = createAlert({
        id: id ? String(id).trim() : undefined,
        userId: String(userId),
        symbol: symbol.toUpperCase().replace('/', '').trim(),
        exchange: exchange || 'binance',
        marketType: marketType || 'futures',
        targetPrice: numPrice,
        condition,
        note: note ? String(note).trim() : undefined,
        formationName: formationName ? String(formationName).trim() : undefined,
        levelType: levelType || 'custom',
        telegramBotToken: telegramBotToken ? String(telegramBotToken).trim() : undefined,
        telegramChatId: telegramChatId ? String(telegramChatId).trim() : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      });

      const cfg = getEffectiveTelegramConfig();
      res.json({
        success: true,
        alert,
        isTelegramConfigured: Boolean(cfg.botToken && cfg.chatId),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Batch create alerts (e.g., all 3 levels: Entry, Take-Profit, Stop-Loss simultaneously)
  app.post('/api/alerts/batch', (req, res) => {
    try {
      const { userId, alerts, telegramBotToken, telegramChatId } = req.body;

      if (!userId || userId === 'guest') {
        return res.status(401).json({
          success: false,
          error: 'Встановлення сповіщень доступне тільки для зареєстрованих користувачів. Будь ласка, увійдіть.',
        });
      }

      if (!Array.isArray(alerts) || alerts.length === 0) {
        return res.status(400).json({ success: false, error: 'Масив сповіщень порожній або відсутній' });
      }

      const created = createAlertsBatch(String(userId), alerts, telegramBotToken, telegramChatId);
      const cfg = getEffectiveTelegramConfig();
      res.json({
        success: true,
        count: created.length,
        alerts: created,
        isTelegramConfigured: Boolean(cfg.botToken && cfg.chatId),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/alerts/:id', (req, res) => {
    try {
      const userId = (req.query.userId || req.body?.userId) as string | undefined;
      const success = deleteAlert(req.params.id, userId);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/alerts/:id/toggle', (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const alert = toggleAlert(req.params.id, userId);
      if (!alert) {
        return res.status(404).json({ success: false, error: 'Алерт не знайдено' });
      }
      res.json({ success: true, alert });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/alerts/clear-triggered', (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const count = clearTriggeredAlerts(userId);
      res.json({ success: true, count });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Surveillance endpoints
  app.get('/api/surveillance', (req, res) => {
    try {
      const userId = (req.query.userId as string) || 'guest';
      const list = loadSurveillanceList(userId);
      res.json({ success: true, data: list });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/surveillance', async (req, res) => {
    try {
      const { symbol, baseAsset, quoteAsset, exchange, marketType, userId, config } = req.body;
      const uid = userId || 'guest';
      if (!symbol) {
        return res.status(400).json({ success: false, error: 'Тікер монети не вказано' });
      }
      const cleanSymbol = symbol.toUpperCase().replace('/', '').trim();
      const list = loadSurveillanceList(uid);

      if (list.some((c) => c.symbol === cleanSymbol && c.exchange === (exchange || 'binance'))) {
        return res.status(400).json({ success: false, error: 'Ця монета вже додана до нагляду' });
      }

      const defaultCfg = getDefaultSurveillanceConfig();
      const newCoin = {
        id: `surv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        userId: uid,
        symbol: cleanSymbol,
        baseAsset: baseAsset || cleanSymbol.replace('USDT', ''),
        quoteAsset: quoteAsset || 'USDT',
        exchange: exchange || 'binance',
        marketType: marketType || 'futures',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        config: { ...defaultCfg, ...(config || {}) },
      };

      const { coin: checkedCoin } = await checkCoinSurveillance(newCoin, true);
      list.unshift(checkedCoin);
      saveSurveillanceList(uid, list);

      res.json({ success: true, coin: checkedCoin });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/surveillance/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, config, isActive } = req.body;
      const found = findSurveillanceCoinById(id, userId);

      if (!found) {
        return res.status(404).json({ success: false, error: 'Монету не знайдено в нагляді' });
      }

      const coin = found.coin;
      const updatedCoin = {
        ...coin,
        isActive: isActive !== undefined ? Boolean(isActive) : coin.isActive,
        config: config ? { ...coin.config, ...config } : coin.config,
        updatedAt: new Date().toISOString(),
      };

      found.list[found.index] = updatedCoin;
      saveSurveillanceList(found.userId, found.list);

      res.json({ success: true, coin: updatedCoin });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/surveillance/:id', (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.query.userId as string) || req.body?.userId;
      const found = findSurveillanceCoinById(id, userId);

      if (!found) {
        // Fallback: try by userId directly
        const uid = userId || 'guest';
        const list = loadSurveillanceList(uid);
        const filtered = list.filter((c) => c.id !== id);
        saveSurveillanceList(uid, filtered);
        return res.json({ success: true });
      }

      const filtered = found.list.filter((c) => c.id !== id);
      saveSurveillanceList(found.userId, filtered);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/surveillance/check-all', async (req, res) => {
    try {
      const { userId } = req.body;
      const uid = userId || 'guest';
      const updatedList = await checkAllUserCoins(uid);
      res.json({ success: true, data: updatedList });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/surveillance/:id/check', async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, forceNotify } = req.body;
      const found = findSurveillanceCoinById(id, userId);

      if (!found) {
        return res.status(404).json({ success: false, error: 'Монету не знайдено' });
      }

      const { coin: updated } = await checkCoinSurveillance(found.coin, Boolean(forceNotify));
      found.list[found.index] = updated;
      saveSurveillanceList(found.userId, found.list);

      res.json({ success: true, coin: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/server/data/**'],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Crypto Pattern Screener server running on http://0.0.0.0:${PORT}`);
    // Start background Telegram price alerts monitor and surveillance monitor
    startAlertMonitor(6000);
    startSurveillanceMonitor(6000);
  });
}

startServer();

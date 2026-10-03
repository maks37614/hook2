import { EngineAlertEvent, SetupInstance, ThirdTouchTracker, DensityItem, OISnapshot, NewsItem } from './types';
import { sendTelegramMessage } from '../telegramService';
import { getUserTelegram } from '../alertService';
import { notificationRouter, NotificationSource } from '../notificationRouter';

function formatCryptoPrice(val: number): string {
  if (!val && val !== 0) return '0.00';
  if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toFixed(4);
  if (val >= 0.0001) return val.toFixed(6);
  return val.toFixed(8);
}

export interface AlertScope {
  userId: string;
  coinId?: string;
  symbol: string;
  exchange: string;
  marketType: string;
  source?: NotificationSource;
}

export class StateMachineAndAlerts {
  public canSendAlert(
    key: string,
    eventType: string,
    customCooldownMs?: number,
    scope?: AlertScope
  ): boolean {
    if (scope) {
      const scopedKey = notificationRouter.buildScopedKey({
        source: scope.source || 'SURVEILLANCE',
        userId: scope.userId,
        coinId: scope.coinId,
        symbol: scope.symbol,
        exchange: scope.exchange,
        marketType: scope.marketType,
        eventType,
        eventIdentity: key,
      });

      const res = notificationRouter.shouldNotify({
        source: scope.source || 'SURVEILLANCE',
        userId: scope.userId,
        coinId: scope.coinId,
        symbol: scope.symbol,
        exchange: scope.exchange,
        marketType: scope.marketType,
        eventType,
        eventIdentity: key,
        customCooldownMs,
      });

      if (res.allowed) {
        notificationRouter.recordAlertSent(scopedKey, Date.now());
        return true;
      }
      return false;
    }

    // Fallback un-scoped check via notificationRouter
    const scopedKey = `GLOBAL:${key}`;
    const now = Date.now();
    const last = notificationRouter.getLastAlertTime(scopedKey);
    const cooldown = customCooldownMs !== undefined ? customCooldownMs : 15 * 60 * 1000;
    if (now - last >= cooldown) {
      notificationRouter.recordAlertSent(scopedKey, now);
      return true;
    }
    return false;
  }

  public recordAlertSent(key: string, timestamp = Date.now(), scope?: AlertScope) {
    if (scope) {
      const scopedKey = notificationRouter.buildScopedKey({
        source: scope.source || 'SURVEILLANCE',
        userId: scope.userId,
        coinId: scope.coinId,
        symbol: scope.symbol,
        exchange: scope.exchange,
        marketType: scope.marketType,
        eventType: 'GENERAL',
        eventIdentity: key,
      });
      notificationRouter.recordAlertSent(scopedKey, timestamp);
    } else {
      notificationRouter.recordAlertSent(`GLOBAL:${key}`, timestamp);
    }
  }

  public getLastAlertTime(key: string, scope?: AlertScope): number {
    if (scope) {
      const scopedKey = notificationRouter.buildScopedKey({
        source: scope.source || 'SURVEILLANCE',
        userId: scope.userId,
        coinId: scope.coinId,
        symbol: scope.symbol,
        exchange: scope.exchange,
        marketType: scope.marketType,
        eventType: 'GENERAL',
        eventIdentity: key,
      });
      return notificationRouter.getLastAlertTime(scopedKey);
    }
    return notificationRouter.getLastAlertTime(`GLOBAL:${key}`);
  }

  // Telegram Support Retest formatted message (#83)
  public formatSupportRetestMessage(setup: SetupInstance, currentPrice: number): string {
    const sym = setup.symbol;
    const ex = setup.exchange.toUpperCase();
    const mkt = setup.marketType === 'futures' ? 'Linear / Futures' : 'Spot';

    return `🟢 <b>SUPPORT RETEST — ${setup.stage === 'CONFIRMED' ? 'CONFIRMED' : 'WATCH'} (LONG)</b>

<b>${sym}</b>
${ex} ${mkt}

<b>Ціна:</b> $${formatCryptoPrice(currentPrice)}
<b>Підтримка:</b> $${formatCryptoPrice(setup.entryZone.low)} – $${formatCryptoPrice(setup.entryZone.high)}
<b>Точка входу (Entry):</b> $${formatCryptoPrice(setup.preferredEntry || (setup.entryZone.low + setup.entryZone.high) / 2)}
<b>Сила рівня:</b> ${setup.evidence.levelStrength}/100
<b>Поточний стан:</b> ${setup.stage}

━━━━━━━━━━━━

<b>СТРУКТУРА</b>
• <b>HTF:</b> ${setup.evidence.htfStructure}
• <b>Статус:</b> ${setup.waitingFor}

━━━━━━━━━━━━

<b>СТАКАН ТА ЩІЛЬНОСТІ</b>
• <b>Стакан:</b> ${setup.evidence.densityPresence}

━━━━━━━━━━━━

<b>OPEN INTEREST</b>
• <b>Режим:</b> ${setup.evidence.oiContext}

━━━━━━━━━━━━

<b>КОНТЕКСТ РИНКУ</b>
• <b>BTC Context:</b> ${setup.evidence.btcContext}
• <b>Формація:</b> ${setup.evidence.formationScore > 0 ? `${setup.evidence.formationScore}/100` : 'Компресія'}

━━━━━━━━━━━━

<b>СЕТАП & РОЗРАХУНОК (LONG)</b>
<b>Тип:</b> ПОВТОРНЕ ТЕСТУВАННЯ ПІДТРИМКИ (LONG)
<b>Підтвердження:</b>
${setup.confirmations.map((c) => `• ✓ ${c}`).join('\n') || '• Очікування'}

<b>Вхід (ENTRY):</b> $${formatCryptoPrice(setup.preferredEntry || (setup.entryZone.low + setup.entryZone.high) / 2)}
<b>Скасування (STOP SL):</b> $${formatCryptoPrice(setup.invalidationPrice)}
<b>Ціль (TARGET TP):</b> $${formatCryptoPrice(setup.targetPrice)}
<b>Конфлюенс:</b> <b>${setup.confluenceScore}/100</b>

<b>СТАТУС:</b> <b>${setup.stage}</b>`;
  }

  // Telegram Resistance Retest / Rejection formatted message (SHORT)
  public formatResistanceRetestMessage(setup: SetupInstance, currentPrice: number): string {
    const sym = setup.symbol;
    const ex = setup.exchange.toUpperCase();
    const mkt = setup.marketType === 'futures' ? 'Linear / Futures' : 'Spot';

    return `🔴 <b>RESISTANCE RETEST / REJECTION — ${setup.stage === 'CONFIRMED' ? 'CONFIRMED' : 'WATCH'} (SHORT)</b>

<b>${sym}</b>
${ex} ${mkt}

<b>Ціна:</b> $${formatCryptoPrice(currentPrice)}
<b>Опір:</b> $${formatCryptoPrice(setup.entryZone.low)} – $${formatCryptoPrice(setup.entryZone.high)}
<b>Точка входу (Entry):</b> $${formatCryptoPrice(setup.preferredEntry || (setup.entryZone.low + setup.entryZone.high) / 2)}
<b>Сила рівня:</b> ${setup.evidence.levelStrength}/100
<b>Поточний стан:</b> ${setup.stage}

━━━━━━━━━━━━

<b>СТРУКТУРА</b>
• <b>HTF:</b> ${setup.evidence.htfStructure}
• <b>Статус:</b> ${setup.waitingFor}

━━━━━━━━━━━━

<b>СТАКАН ТА ЩІЛЬНОСТІ</b>
• <b>Стакан:</b> ${setup.evidence.densityPresence}

━━━━━━━━━━━━

<b>OPEN INTEREST</b>
• <b>Режим:</b> ${setup.evidence.oiContext}

━━━━━━━━━━━━

<b>КОНТЕКСТ РИНКУ</b>
• <b>BTC Context:</b> ${setup.evidence.btcContext}
• <b>Формація:</b> ${setup.evidence.formationScore > 0 ? `${setup.evidence.formationScore}/100` : 'Компресія'}

━━━━━━━━━━━━

<b>СЕТАП & РОЗРАХУНОК (SHORT)</b>
<b>Тип:</b> ВІДБИТТЯ ВІД ОПОРУ (SHORT)
<b>Підтвердження:</b>
${setup.confirmations.map((c) => `• ✓ ${c}`).join('\n') || '• Очікування'}

<b>Вхід (ENTRY):</b> $${formatCryptoPrice(setup.preferredEntry || (setup.entryZone.low + setup.entryZone.high) / 2)}
<b>Скасування (STOP SL):</b> $${formatCryptoPrice(setup.invalidationPrice)}
<b>Ціль (TARGET TP):</b> $${formatCryptoPrice(setup.targetPrice)}
<b>Конфлюенс:</b> <b>${setup.confluenceScore}/100</b>

<b>СТАТУС:</b> <b>${setup.stage}</b>`;
  }

  // Telegram Breakout Retest message (LONG or SHORT)
  public formatBreakoutRetestMessage(setup: SetupInstance, currentPrice: number): string {
    const sym = setup.symbol;
    const ex = setup.exchange.toUpperCase();
    const mkt = setup.marketType === 'futures' ? 'Linear / Futures' : 'Spot';
    const isLong = setup.direction === 'LONG';
    const icon = isLong ? '🟢' : '🔴';

    return `${icon} <b>BREAKOUT RETEST — ${setup.stage === 'CONFIRMED' ? 'CONFIRMED' : 'WATCH'} (${setup.direction})</b>

<b>${sym}</b>
${ex} ${mkt}

<b>Ціна:</b> $${formatCryptoPrice(currentPrice)}
<b>Зона пробою / ретесту:</b> $${formatCryptoPrice(setup.entryZone.low)} – $${formatCryptoPrice(setup.entryZone.high)}
<b>Точка входу (Entry):</b> $${formatCryptoPrice(setup.preferredEntry || (setup.entryZone.low + setup.entryZone.high) / 2)}
<b>Поточний стан:</b> ${setup.stage}

━━━━━━━━━━━━

<b>СТРУКТУРА & КОНФЛЮЕНС</b>
• <b>HTF:</b> ${setup.evidence.htfStructure}
• <b>Стакан:</b> ${setup.evidence.densityPresence}
• <b>OI Режим:</b> ${setup.evidence.oiContext}
• <b>BTC Context:</b> ${setup.evidence.btcContext}

━━━━━━━━━━━━

<b>ПЛАН УГОДИ (${setup.direction})</b>
<b>Вхід (ENTRY):</b> $${formatCryptoPrice(setup.preferredEntry || (setup.entryZone.low + setup.entryZone.high) / 2)}
<b>Скасування (STOP SL):</b> $${formatCryptoPrice(setup.invalidationPrice)}
<b>Ціль (TARGET TP):</b> $${formatCryptoPrice(setup.targetPrice)}
<b>Конфлюенс:</b> <b>${setup.confluenceScore}/100</b>

<b>СТАТУС:</b> <b>${setup.stage}</b>`;
  }

  // Telegram Formation Setup message
  public formatFormationSetupMessage(setup: SetupInstance, currentPrice: number): string {
    const sym = setup.symbol;
    const ex = setup.exchange.toUpperCase();
    const mkt = setup.marketType === 'futures' ? 'Linear / Futures' : 'Spot';
    const isLong = setup.direction === 'LONG';
    const icon = isLong ? '🟢' : '🔴';

    return `${icon} <b>FORMATION SETUP — ${setup.stage === 'CONFIRMED' ? 'CONFIRMED' : 'WATCH'} (${setup.direction})</b>

<b>${sym}</b>
${ex} ${mkt}

<b>Ціна:</b> $${formatCryptoPrice(currentPrice)}
<b>Зона формації:</b> $${formatCryptoPrice(setup.entryZone.low)} – $${formatCryptoPrice(setup.entryZone.high)}
<b>Точка входу (Entry):</b> $${formatCryptoPrice(setup.preferredEntry || (setup.entryZone.low + setup.entryZone.high) / 2)}
<b>Оцінка формації:</b> ${setup.evidence.formationScore}/100

━━━━━━━━━━━━

<b>ПЛАН УГОДИ (${setup.direction})</b>
<b>Вхід (ENTRY):</b> $${formatCryptoPrice(setup.preferredEntry || (setup.entryZone.low + setup.entryZone.high) / 2)}
<b>Скасування (STOP SL):</b> $${formatCryptoPrice(setup.invalidationPrice)}
<b>Ціль (TARGET TP):</b> $${formatCryptoPrice(setup.targetPrice)}
<b>Конфлюенс:</b> <b>${setup.confluenceScore}/100</b>

<b>СТАТУС:</b> <b>${setup.stage}</b>`;
  }

  // Master helper routing to the correct specialized formatter
  public formatSetupAlertMessage(setup: SetupInstance, currentPrice: number, alertType: string): string {
    switch (alertType) {
      case 'RESISTANCE_RETEST_CONFIRMED':
        return this.formatResistanceRetestMessage(setup, currentPrice);
      case 'BREAKOUT_CONFIRMED':
        return this.formatBreakoutRetestMessage(setup, currentPrice);
      case 'FORMATION_SETUP_CONFIRMED':
        return this.formatFormationSetupMessage(setup, currentPrice);
      case 'SUPPORT_RETEST_CONFIRMED':
      default:
        return this.formatSupportRetestMessage(setup, currentPrice);
    }
  }

  // Telegram Third Touch message (#84)
  public formatThirdTouchMessage(item: ThirdTouchTracker, symbol: string, exchange: string, currentPrice: number): string {
    return `⚠️ <b>THIRD TOUCH ${item.state === 'ACTIVE' ? 'ACTIVE' : 'APPROACHING'}</b>

<b>${symbol}</b>
${exchange.toUpperCase()}

<b>Рівень (${item.levelType}):</b> $${formatCryptoPrice(item.price)}
<b>Поточна ціна:</b> $${formatCryptoPrice(currentPrice)}
<b>Дистанція:</b> ${item.distancePct}%
<b>Швидкість наближення:</b> ${item.approachSpeed}

<b>Підтверджених дотиків:</b> ${item.touchCount}
<b>Компресія:</b> ${item.compression ? 'ТАК (Higher Lows / Lower Highs)' : 'Ні'}
${item.askDensityUsd ? `<b>Ask Density:</b> $${(item.askDensityUsd / 1000000).toFixed(2)}M\n` : ''}${item.bidDensityUsd ? `<b>Bid Density:</b> $${(item.bidDensityUsd / 1000000).toFixed(2)}M\n` : ''}
<b>СТАТУС:</b> <b>Стежте за третім підходом</b>`;
  }

  // Telegram Density appeared message (#14)
  public formatDensityAppearedMessage(density: DensityItem, symbol: string, exchange: string): string {
    return `⚡ <b>НОВА ВЕЛИКА ЩІЛЬНІСТЬ У СТАКАНІ</b>

<b>${symbol}</b>
${exchange.toUpperCase()}

<b>Сторона:</b> <b>${density.side}</b>
<b>Ціна:</b> $${formatCryptoPrice(density.price)}
<b>Обсяг:</b> <b>$${(density.notionalUsd / 1000000).toFixed(2)}M</b>
<b>Дистанція до спреду:</b> ${density.distancePct}%
<b>Якість ліквідності:</b> ${density.qualityScore}/100
<b>Статус:</b> НОВОЯВЛЕНА ЗАЯВКА`;
  }

  // Telegram Density persistent message (#85)
  public formatDensityMessage(density: DensityItem, symbol: string, exchange: string): string {
    return `💧 <b>ПІДТВЕРДЖЕНА СТІЙКА ЩІЛЬНІСТЬ</b>

<b>${symbol}</b>
${exchange.toUpperCase()}

<b>Сторона:</b> <b>${density.side}</b>
<b>Ціна:</b> $${formatCryptoPrice(density.price)}
<b>Обсяг:</b> <b>$${(density.notionalUsd / 1000000).toFixed(2)}M</b>
<b>Дистанція:</b> ${density.distancePct}%
<b>Тривалість:</b> ${Math.floor(density.ageSeconds / 60)}хв ${density.ageSeconds % 60}с
<b>Класифікація:</b> <b>${density.classification}</b>
<b>Якість:</b> <b>${density.qualityScore}/100</b>`;
  }

  // Telegram OI message (#86)
  public formatOIMessage(oi: OISnapshot, symbol: string, currentPrice: number): string {
    return `🚨 <b>OPEN INTEREST АНОМАЛЬНА АКТИВНІСТЬ</b>

<b>${symbol}</b>

<b>OI Зміна 15m:</b> <b>${oi.change15mPct >= 0 ? '+' : ''}${oi.change15mPct}%</b>
<b>Поточний OI:</b> $${(oi.currentUsd / 1000000).toFixed(2)}M
<b>Поточна ціна:</b> $${formatCryptoPrice(currentPrice)}
<b>Режим:</b> <b>${oi.regime}</b>

<b>Класифікація:</b> UNUSUAL PARTICIPATION`;
  }

  // Telegram Structure message (#88)
  public formatStructureMessage(symbol: string, tf: string, eventName: string, price: number): string {
    return `📊 <b>Зміна структури (${eventName})</b>

<b>${symbol}</b>
<b>Timeframe:</b> ${tf.toUpperCase()}
<b>Ціна:</b> $${formatCryptoPrice(price)}

<b>Подія:</b> <b>${eventName}</b>
<b>Статус:</b> STRUCTURE SHIFT`;
  }

  // Dispatch alert to user Telegram
  public async dispatchAlert(userId: string, htmlMessage: string, enabled = true) {
    if (!enabled) return;
    const userTg = getUserTelegram(userId);
    if (!userTg?.botToken || !userTg?.chatId) return;
    try {
      await sendTelegramMessage(htmlMessage, {
        botToken: userTg.botToken,
        chatId: userTg.chatId,
      });
    } catch (e) {
      console.error(`[AlertDispatcher] Error sending Telegram message to user ${userId}:`, e);
    }
  }
}

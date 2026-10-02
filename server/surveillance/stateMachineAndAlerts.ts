import { EngineAlertEvent, SetupInstance, ThirdTouchTracker, DensityItem, OISnapshot, NewsItem } from './types';
import { sendTelegramMessage } from '../telegramService';
import { getUserTelegram } from '../alertService';

function formatCryptoPrice(val: number): string {
  if (!val && val !== 0) return '0.00';
  if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toFixed(4);
  if (val >= 0.0001) return val.toFixed(6);
  return val.toFixed(8);
}

export class StateMachineAndAlerts {
  private lastAlertTimestamps = new Map<string, number>();

  // Cooldown durations per alert type in ms
  private readonly cooldowns: Record<string, number> = {
    THIRD_TOUCH_APPROACHING: 15 * 60 * 1000,
    THIRD_TOUCH_ACTIVE: 10 * 60 * 1000,
    DENSITY_APPEARED: 15 * 60 * 1000,
    DENSITY_PERSISTENT: 20 * 60 * 1000,
    OI_ANOMALY: 12 * 60 * 1000,
    FORMATION_DETECTED: 30 * 60 * 1000,
    BREAKOUT_REALTIME: 10 * 60 * 1000,
    BREAKOUT_CONFIRMED: 20 * 60 * 1000,
    SUPPORT_RETEST_WATCH: 15 * 60 * 1000,
    SUPPORT_RETEST_CONFIRMED: 20 * 60 * 1000,
    IMPULSE: 10 * 60 * 1000,
    SESSION_CHANGED: 60 * 60 * 1000,
    NEWS: 30 * 60 * 1000,
    STRUCTURE_SHIFT: 20 * 60 * 1000,
  };

  public canSendAlert(key: string, eventType: string): boolean {
    const now = Date.now();
    const lastTime = this.lastAlertTimestamps.get(key) || 0;
    const cooldown = this.cooldowns[eventType] || 15 * 60 * 1000;

    if (now - lastTime >= cooldown) {
      this.lastAlertTimestamps.set(key, now);
      return true;
    }
    return false;
  }

  // Telegram Support Retest formatted message (#83)
  public formatSupportRetestMessage(setup: SetupInstance, currentPrice: number): string {
    const sym = setup.symbol;
    const ex = setup.exchange.toUpperCase();
    const mkt = setup.marketType === 'futures' ? 'Linear / Futures' : 'Spot';

    return `🟢 <b>SUPPORT RETEST — ${setup.stage === 'CONFIRMED' ? 'CONFIRMED' : 'WATCH'}</b>

<b>${sym}</b>
${ex} ${mkt}

<b>Ціна:</b> $${formatCryptoPrice(currentPrice)}
<b>Підтримка:</b> $${formatCryptoPrice(setup.entryZone.low)} – $${formatCryptoPrice(setup.entryZone.high)}
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

<b>СЕТАП & КОНФЛЮЕНС</b>
<b>Тип:</b> ПОВТОРНЕ ТЕСТУВАННЯ ПІДТРИМКИ
<b>Підтвердження:</b>
${setup.confirmations.map((c) => `• ✓ ${c}`).join('\n') || '• Очікування'}

<b>Скасування (SL):</b> $${formatCryptoPrice(setup.invalidationPrice)}
<b>Ціль (TP):</b> $${formatCryptoPrice(setup.targetPrice)}
<b>Конфлюенс:</b> <b>${setup.confluenceScore}/100</b>

<b>СТАТУС:</b> <b>${setup.stage}</b>`;
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

  // Telegram Density message (#85)
  public formatDensityMessage(density: DensityItem, symbol: string, exchange: string): string {
    return `💧 <b>Виявлено значну щільність</b>

<b>${symbol}</b>
${exchange.toUpperCase()}

<b>Сторона:</b> <b>${density.side}</b>
<b>Ціна:</b> $${formatCryptoPrice(density.price)}
<b>Обсяг:</b> <b>$${(density.notionalUsd / 1000000).toFixed(2)}M</b>
<b>Дистанція:</b> ${density.distancePct}%
<b>Тривалість:</b> ${Math.floor(density.ageSeconds / 60)}хв ${density.ageSeconds % 60}с
<b>Класифікація:</b> <b>${density.classification}</b>`;
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
  public async dispatchAlert(userId: string, htmlMessage: string) {
    const userTg = getUserTelegram(userId);
    try {
      await sendTelegramMessage(htmlMessage, {
        botToken: userTg?.botToken,
        chatId: userTg?.chatId,
      });
    } catch (e) {
      console.error(`[AlertDispatcher] Error sending Telegram message to user ${userId}:`, e);
    }
  }
}

import fs from 'fs';
import path from 'path';

interface TelegramConfigFile {
  botToken?: string;
  chatId?: string;
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'telegram_config.json');

let memoryConfig: TelegramConfigFile = {};
let isConfigLoaded = false;

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error('Failed to create server/data directory:', e);
    }
  }
}

// Load saved config
function loadSavedConfig(): TelegramConfigFile {
  if (isConfigLoaded && (memoryConfig.botToken || memoryConfig.chatId)) {
    return memoryConfig;
  }
  try {
    ensureDataDir();
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      memoryConfig = JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to read telegram_config.json:', err);
  }
  isConfigLoaded = true;
  return memoryConfig;
}

// Save config to file and memory
export function saveTelegramConfig(config: TelegramConfigFile): boolean {
  try {
    ensureDataDir();
    const existing = loadSavedConfig();
    const updated: TelegramConfigFile = {
      botToken: config.botToken && config.botToken.trim() !== '' ? config.botToken.trim() : existing.botToken,
      chatId: config.chatId && config.chatId.trim() !== '' ? config.chatId.trim() : existing.chatId,
    };
    memoryConfig = updated;
    isConfigLoaded = true;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    console.log('[Telegram] Configuration updated and saved. BotToken present:', Boolean(updated.botToken), 'ChatId:', updated.chatId);
    return true;
  } catch (err) {
    console.error('Failed to save telegram_config.json:', err);
    return false;
  }
}

// Get effective Telegram credentials
export function getEffectiveTelegramConfig(): { botToken: string; chatId: string; hasEnvToken: boolean; hasEnvChatId: boolean } {
  const saved = loadSavedConfig();
  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  const envChatId = process.env.TELEGRAM_CHAT_ID?.trim() || '';

  const botToken = saved.botToken?.trim() || envToken;
  const chatId = saved.chatId?.trim() || envChatId;

  return {
    botToken,
    chatId,
    hasEnvToken: Boolean(envToken),
    hasEnvChatId: Boolean(envChatId),
  };
}

// Check Telegram Bot Info
export async function getTelegramBotInfo(token?: string): Promise<{ ok: boolean; username?: string; error?: string }> {
  const effectiveToken = token || getEffectiveTelegramConfig().botToken;
  if (!effectiveToken) {
    return { ok: false, error: 'Bot Token не вказано' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${effectiveToken}/getMe`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (data.ok && data.result) {
      return { ok: true, username: data.result.username };
    }
    return { ok: false, error: data.description || 'Невірний токен Telegram бота' };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Помилка з\'єднання з Telegram API' };
  }
}

// Human-friendly Telegram error translator
export function formatTelegramErrorMessage(rawError: string, botUsername?: string, botId?: string, targetChatId?: string): string {
  const err = rawError.toLowerCase();

  if (err.includes("can't send messages to the bot") || err.includes("can't send message to bot") || (botId && targetChatId && botId === targetChatId)) {
    return `❌ Помилка: Ви вказали ID самого бота замість вашого особистого Chat ID!\n` +
      `Бот не може писати самому собі або іншим ботам.\n\n` +
      `👉 Як виправити:\n` +
      `1. Відкрийте чат з ботом${botUsername ? ` @${botUsername}` : ''} та натисніть «START»\n` +
      `2. Скористайтеся кнопкою «⚡ Автоматично знайти мій Chat ID» або відкрийте @userinfobot щоб дізнатися ваш особистий ID`;
  }

  if (err.includes('bot was blocked by the user')) {
    return `❌ Бот заблокований у вашому Telegram!\n` +
      `Відкрийте діалог з ботом${botUsername ? ` @${botUsername}` : ''} і натисніть «Розблокувати» або /start.`;
  }

  if (err.includes('chat not found')) {
    return `❌ Чат не знайдено!\n` +
      `Telegram забороняє ботам писати першими. Перейдіть у чат з ботом${botUsername ? ` @${botUsername}` : ''}, натисніть «START» (/start) та перевірте правильність Chat ID.`;
  }

  if (err.includes('unauthorized') || err.includes('invalid token')) {
    return `❌ Невірний Bot Token!\n` +
      `Перевірте токен бота, наданий @BotFather (має формат 123456789:ABCdef...).`;
  }

  return rawError;
}

// Send Telegram Message with automatic HTML error fallback
export async function sendTelegramMessage(
  text: string,
  options?: { botToken?: string; chatId?: string; parseMode?: 'HTML' | 'Markdown' }
): Promise<{ success: boolean; error?: string }> {
  const config = getEffectiveTelegramConfig();
  const botToken = options?.botToken || config.botToken;
  const chatId = options?.chatId || config.chatId;

  if (!botToken || !chatId) {
    const msg = 'Telegram не налаштовано: відсутній Bot Token або Chat ID';
    console.warn('[Telegram]', msg);
    return { success: false, error: msg };
  }

  // Pre-check: Did the user enter the bot's own ID as the chat_id?
  const botIdFromToken = botToken.split(':')[0]?.trim();
  if (botIdFromToken && chatId.trim() === botIdFromToken) {
    const friendlyError = formatTelegramErrorMessage("the bot can't send messages to the bot", undefined, botIdFromToken, chatId.trim());
    return { success: false, error: friendlyError };
  }

  try {
    console.log(`[Telegram] Sending notification to chat ${chatId}...`);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parseMode || 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    if (data.ok) {
      console.log(`[Telegram] Successfully sent message to chat ${chatId}`);
      return { success: true };
    }

    // Fallback: If Telegram rejected due to HTML parse entities, retry as plain text!
    if (data.description && (data.description.includes('can\'t parse entities') || data.description.includes('entity'))) {
      console.warn('[Telegram] HTML parsing failed, retrying as plain text without tags...');
      const plainText = text.replace(/<[^>]*>?/gm, '');
      const retryRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: plainText,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const retryData = await retryRes.json();
      if (retryData.ok) {
        console.log(`[Telegram] Fallback plain-text message sent successfully to chat ${chatId}`);
        return { success: true };
      }
    }

    console.error('[Telegram] Telegram API rejected message:', data.description);
    const friendlyErr = formatTelegramErrorMessage(data.description || 'Telegram відхилив повідомлення', undefined, botIdFromToken, chatId.trim());
    return { success: false, error: friendlyErr };
  } catch (err: any) {
    console.error('[Telegram] Error sending telegram message:', err);
    return { success: false, error: err.message || 'Не вдалося надіслати запит до Telegram' };
  }
}

// Auto-detect user Chat ID from incoming messages/updates
export async function detectChatIdFromUpdates(token?: string): Promise<{
  success: boolean;
  chatId?: string;
  username?: string;
  firstName?: string;
  botUsername?: string;
  error?: string;
}> {
  const config = getEffectiveTelegramConfig();
  const effectiveToken = token?.trim() || config.botToken;
  if (!effectiveToken) {
    return { success: false, error: 'Введіть спочатку Bot Token' };
  }

  const botInfo = await getTelegramBotInfo(effectiveToken);
  if (!botInfo.ok) {
    return { success: false, error: botInfo.error || 'Невірний Bot Token' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${effectiveToken}/getUpdates?limit=100&allowed_updates=["message","channel_post","callback_query"]`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (!data.ok) {
      return {
        success: false,
        botUsername: botInfo.username,
        error: data.description || 'Не вдалося отримати оновлення від Telegram',
      };
    }

    const updates = Array.isArray(data.result) ? data.result : [];
    const botIdFromToken = effectiveToken.split(':')[0]?.trim();

    // Loop backwards to get the most recent message from a human user
    for (let i = updates.length - 1; i >= 0; i--) {
      const u = updates[i];
      const msg = u.message || u.edited_message || u.channel_post || u.callback_query?.message;
      const from = u.message?.from || u.callback_query?.from || msg?.from;
      const chat = msg?.chat;

      if (chat && chat.id) {
        // Skip if sender is a bot or matches the bot's own ID
        if (from?.is_bot || (botIdFromToken && String(chat.id) === botIdFromToken)) {
          continue;
        }

        return {
          success: true,
          chatId: String(chat.id),
          username: from?.username || chat.username,
          firstName: from?.first_name || chat.first_name || chat.title,
          botUsername: botInfo.username,
        };
      }
    }

    return {
      success: false,
      botUsername: botInfo.username,
      error: `Повідомлень у боті не знайдено. Перейдіть у Telegram у чат з ботом @${botInfo.username}, натисніть кнопку START (або надішліть будь-який текст), після чого натисніть цю кнопку ще раз!`,
    };
  } catch (err: any) {
    return {
      success: false,
      botUsername: botInfo.username,
      error: err.message || 'Помилка звернення до Telegram API',
    };
  }
}

// Test Telegram notification & auto-save on success
export async function testTelegramConnection(
  token?: string,
  chatId?: string
): Promise<{ success: boolean; botUsername?: string; error?: string }> {
  const config = getEffectiveTelegramConfig();
  const activeToken = token?.trim() || config.botToken;
  const activeChatId = chatId?.trim() || config.chatId;

  if (!activeToken) {
    return { success: false, error: 'Вкажіть Bot Token для тесту' };
  }
  if (!activeChatId) {
    return { success: false, error: 'Вкажіть Chat ID для тесту' };
  }

  // 1. Check Bot validity
  const botInfo = await getTelegramBotInfo(activeToken);
  if (!botInfo.ok) {
    return { success: false, error: botInfo.error };
  }

  // 2. Pre-check: Bot ID vs Chat ID
  const botIdFromToken = activeToken.split(':')[0]?.trim();
  if (botIdFromToken && activeChatId === botIdFromToken) {
    return {
      success: false,
      botUsername: botInfo.username,
      error: formatTelegramErrorMessage("the bot can't send messages to the bot", botInfo.username, botIdFromToken, activeChatId),
    };
  }

  // 3. Send test message
  const now = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  const testMessage = `🔔 <b>SIGNALHOOK: ТЕСТ ПІДКЛЮЧЕННЯ УСПІШНИЙ!</b>\n\n` +
    `🤖 Бот: <b>@${botInfo.username}</b>\n` +
    `✅ Сповіщення цін та патернів налаштовано правильно.\n` +
    `📈 Тепер ви будете отримувати миттєві сповіщення, коли ціна досягне ваших рівнів.\n\n` +
    `⏱ <i>Час тесту: ${now} (Київ)</i>`;

  const sendResult = await sendTelegramMessage(testMessage, {
    botToken: activeToken,
    chatId: activeChatId,
  });

  if (sendResult.success) {
    // Auto-save working credentials so the user never loses them!
    saveTelegramConfig({ botToken: activeToken, chatId: activeChatId });
    return { success: true, botUsername: botInfo.username };
  }

  const friendlyError = formatTelegramErrorMessage(sendResult.error || 'Помилка надсилання', botInfo.username, botIdFromToken, activeChatId);
  return { success: false, botUsername: botInfo.username, error: friendlyError };
}

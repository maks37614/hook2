/**
 * Author Access & Registration Codes System
 * Codes can only be obtained from the author's Telegram channel.
 * Registration works without email verification.
 */

// Default VIP / Channel Access Codes provided by the author
export const DEFAULT_AUTHOR_CODES = [
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
];

// Official Telegram channel link of the author
export const AUTHOR_TELEGRAM_CHANNEL_URL = 'https://t.me/hookprofi';
export const AUTHOR_TELEGRAM_USERNAME = '@hookprofi';

export interface CodeVerificationResult {
  valid: boolean;
  normalizedCode: string;
  message?: string;
}

/**
 * Normalizes an access code (trims whitespace, converts to uppercase)
 */
export function normalizeAccessCode(code: string): string {
  return (code || '').trim().toUpperCase();
}

/**
 * Validates whether the given code is a valid author invite code.
 * Checks against both client-side registered codes and the server endpoint.
 */
export async function verifyAccessCode(code: string): Promise<CodeVerificationResult> {
  const clean = normalizeAccessCode(code);

  if (!clean) {
    return {
      valid: false,
      normalizedCode: '',
      message: 'Будь ласка, введіть спеціальний код доступу.',
    };
  }

  // 1. Try server verification first (if online)
  try {
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: clean }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.valid === 'boolean') {
        return {
          valid: data.valid,
          normalizedCode: clean,
          message: data.valid
            ? 'Код успішно підтверджено!'
            : 'Невірний спеціальний код доступу. Отримайте дійсний код у Telegram каналі автора.',
        };
      }
    }
  } catch {
    // If offline or server error, fallback to local validation list
  }

  // 2. Fallback to client-side author codes
  const isMatch = DEFAULT_AUTHOR_CODES.includes(clean);

  if (isMatch) {
    return {
      valid: true,
      normalizedCode: clean,
      message: 'Код успішно підтверджено!',
    };
  }

  return {
    valid: false,
    normalizedCode: clean,
    message:
      'Невірний спеціальний код доступу. Незареєстровані користувачі можуть отримати код тільки від автора у його Telegram каналі.',
  };
}

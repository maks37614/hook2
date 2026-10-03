import { SetupInstance } from './types';

export interface SetupAlertsValidationResult {
  valid: boolean;
  reason?: string;
  entry: number;
  target: number;
  stop: number;
}

/**
 * Mathematically validates setup price levels before generating Telegram alerts
 * or 3 Price Alerts group (ENTRY, TARGET, STOP).
 *
 * Rules:
 * For LONG:  STOP < ENTRY < TARGET
 * For SHORT: TARGET < ENTRY < STOP
 */
export function validateSetupAlertsMath(setup: {
  direction: 'LONG' | 'SHORT';
  preferredEntry?: number;
  entryZone?: { low: number; high: number };
  targetPrice: number;
  invalidationPrice: number;
}): SetupAlertsValidationResult {
  const entry = setup.preferredEntry || (setup.entryZone ? (setup.entryZone.low + setup.entryZone.high) / 2 : 0);
  const target = setup.targetPrice;
  const stop = setup.invalidationPrice;

  if (!entry || !target || !stop || !Number.isFinite(entry) || !Number.isFinite(target) || !Number.isFinite(stop)) {
    return {
      valid: false,
      reason: `Некоректні або відсутні рівні цін: ENTRY=${entry}, TARGET=${target}, STOP=${stop}`,
      entry,
      target,
      stop,
    };
  }

  if (setup.direction === 'LONG') {
    // STOP < ENTRY < TARGET
    if (!(stop < entry && entry < target)) {
      return {
        valid: false,
        reason: `Порушення математичної умови LONG: STOP ($${stop}) < ENTRY ($${entry}) < TARGET ($${target})`,
        entry,
        target,
        stop,
      };
    }
  } else {
    // SHORT: TARGET < ENTRY < STOP
    if (!(target < entry && entry < stop)) {
      return {
        valid: false,
        reason: `Порушення математичної умови SHORT: TARGET ($${target}) < ENTRY ($${entry}) < STOP ($${stop})`,
        entry,
        target,
        stop,
      };
    }
  }

  return { valid: true, entry, target, stop };
}

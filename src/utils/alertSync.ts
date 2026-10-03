import type { PriceAlert } from '../types';

/** Only mirror new alerts or server-owned state changes, avoiding snapshot/write loops. */
export function getAlertMirrorWrites(serverAlerts: PriceAlert[], mirroredAlerts: PriceAlert[]): PriceAlert[] {
  const mirrored = new Map(mirroredAlerts.map(alert => [alert.id, alert]));
  return serverAlerts.filter(alert => {
    const existing = mirrored.get(alert.id);
    return !existing || existing.isActive !== alert.isActive || existing.triggered !== alert.triggered ||
      existing.triggeredAt !== alert.triggeredAt || existing.triggeredPrice !== alert.triggeredPrice;
  });
}

export function getAlertMirrorDeletes(serverAlerts: PriceAlert[], mirroredAlerts: PriceAlert[]): string[] {
  const serverIds = new Set(serverAlerts.map(alert => alert.id));
  return mirroredAlerts.filter(alert => !serverIds.has(alert.id)).map(alert => alert.id);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Isolate persistence and credentials from real application data.
const originalCwd = process.cwd();
const fixtureDir = fs.mkdtempSync(path.join(originalCwd, '.test-alerts-'));
process.chdir(fixtureDir);
const service = await import('../server/alertService');
const { NotificationRouter } = await import('../server/notificationRouter');
process.chdir(originalCwd);
test.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));

const alert = (id: string, userId = 'test-user') => ({
  id, userId, symbol: 'BTCUSDT', exchange: 'binance' as const, marketType: 'futures' as const,
  targetPrice: 110, condition: 'gte' as const,
});

test('stale client sync cannot delete server-created alerts', () => {
  service.createAlert(alert('new-on-server'));
  const merged = service.syncUserAlerts('test-user', []);
  assert.ok(merged.some(a => a.id === 'new-on-server'));
  service.deleteAlert('new-on-server', 'test-user');
  assert.equal(service.getAllAlerts('test-user').length, 0);
  assert.equal(service.syncUserAlerts('test-user', merged).length, 0);
});

test('setup groups are idempotent and isolated between users', () => {
  const setup: any = { id: 'shared-setup', symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures',
    direction: 'LONG', type: 'BREAKOUT_RETEST', timeframe: '1h', entryZone: { low: 100, high: 100 },
    invalidationPrice: 95, targetPrice: 110, riskReward: 2 };
  const first = service.createSetupAlertsGroup('setup-user-a', setup, 99);
  assert.equal(first.success, true, first.error);
  service.toggleAlert('shared-setup_ENTRY', 'setup-user-a');
  service.createSetupAlertsGroup('setup-user-a', setup, 99);
  assert.equal(service.getAllAlerts('setup-user-a').find(a => a.setupRole === 'ENTRY')?.isActive, false);
  service.createSetupAlertsGroup('setup-user-b', setup, 99);
  assert.equal(service.getAllAlerts('setup-user-a').length, 3);
  assert.equal(service.getAllAlerts('setup-user-b').length, 3);
});

test('alert deleted while fetching price cannot fire or be restored', async () => {
  const originalFetch = globalThis.fetch;
  let resolvePrice!: (value: Response) => void;
  service.saveAlerts([]);
  service.createAlert(alert('deleted-during-check'));
  globalThis.fetch = async () => new Promise<Response>(resolve => { resolvePrice = resolve; });
  try {
    const checking = service.checkAlertsOnce();
    service.deleteAlert('deleted-during-check', 'test-user');
    resolvePrice(Response.json({ price: '120' }));
    await checking;
    assert.equal(service.getAllAlerts('test-user').length, 0);
    assert.equal(service.getAlertHistory('test-user').length, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('futures price alerts never trigger from spot or another exchange on an API outage', async () => {
  const originalFetch = globalThis.fetch;
  service.saveAlerts([]);
  service.createAlert(alert('futures-api-outage', 'outage-user'));
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    return url.includes('fapi.binance.com')
      ? new Response('{}', { status: 503 })
      : Response.json({ price: '999', result: { list: [{ lastPrice: '999' }] } });
  };
  try {
    await service.checkAlertsOnce();
    assert.equal(service.getAllAlerts('outage-user')[0].triggered, false);
    assert.equal(urls.length, 1);
    assert.ok(urls[0].includes('fapi.binance.com/fapi/v1/'));
  } finally { globalThis.fetch = originalFetch; }
});

test('notification dispatch deduplicates concurrent requests and respects setup switches', async () => {
  const originalFetch = globalThis.fetch;
  service.saveUserTelegram('router-test', { botToken: '123:test-fixture', chatId: 'fixture-chat' });
  const router = new NotificationRouter();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ ok: true, result: {} }); };
  const payload: any = { source: 'SURVEILLANCE', userId: 'router-test', coinId: 'coin',
    symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures',
    eventType: 'FORMATION_SETUP_CONFIRMED', eventIdentity: 'closed-setup', htmlMessage: 'Fixture' };
  try {
    const results = await Promise.all([router.dispatch(payload), router.dispatch(payload)]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(calls, 1);
    assert.equal(await router.dispatch(payload), false);
    const blocked = { ...payload, eventIdentity: 'other', coin: { isActive: true, config: { setupsEnabled: false } } };
    assert.equal(await router.dispatch(blocked), false);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

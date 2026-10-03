import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { SurveillanceCoin } from '../src/types';

const originalCwd = process.cwd();
const fixtureDir = fs.mkdtempSync(path.join(originalCwd, '.test-surveillance-'));
process.chdir(fixtureDir);
const service = await import('../server/surveillanceService');
const { SurveillanceManager } = await import('../server/surveillance/surveillanceManager');
process.chdir(originalCwd);
test.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));

const coin: SurveillanceCoin = {
  id: 'owned-coin', userId: 'owner', symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
  exchange: 'binance', marketType: 'futures', isActive: false, createdAt: '', updatedAt: '',
  config: service.getDefaultSurveillanceConfig(),
};

test('coin lookup and pause operations cannot fall back to another user', () => {
  service.saveSurveillanceList('owner', [coin]);
  assert.equal(service.findSurveillanceCoinById(coin.id, 'another-user'), null);
  assert.equal(service.findSurveillanceCoinById(coin.id), null);
  assert.equal(service.updateSurveillanceCoinActive(coin.id, false, 'another-user'), null);
  assert.equal(service.findSurveillanceCoinById(coin.id, 'owner')?.coin.id, coin.id);
});

test('guest migration creates independent worker identities and configurations', () => {
  const guest = { ...coin, userId: 'guest' };
  const first = service.copyGuestSurveillanceCoins([guest], 'first-user')[0];
  const second = service.copyGuestSurveillanceCoins([guest], 'second-user')[0];
  assert.equal(new Set([guest.id, first.id, second.id]).size, 3);
  first.config.triggerModes!.push('realtime');
  assert.deepEqual(guest.config.triggerModes, ['bar_close']);
  assert.deepEqual(second.config.triggerModes, ['bar_close']);
  assert.equal(first.userId, 'first-user');
});

test('worker snapshot lists expose only the requested user, including guest requests', () => {
  const manager = Object.create(SurveillanceManager.prototype);
  manager.workers = new Map(['owner', 'another-user', 'guest'].map(userId => [userId, {
    coin: { userId }, getSnapshot: () => ({ userId }),
  }]));
  assert.deepEqual(manager.getAllSnapshots('owner'), [{ userId: 'owner' }]);
  assert.deepEqual(manager.getAllSnapshots('guest'), [{ userId: 'guest' }]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, ChildProcess } from 'node:child_process';
import { once } from 'node:events';

test('HTTP tracking is explicit; deleting the last coin stays empty after refresh and restart', async () => {
  const root = process.cwd();
  const fixture = fs.mkdtempSync(path.join(root, '.test-surveillance-api-'));
  fs.mkdirSync(path.join(fixture, 'server/data'), { recursive: true });
  const config = { timeframe: '4h', triggerModes: ['bar_close'], levelsEnabled: true, structureEnabled: true,
    momentumEnabled: true, momentumPct: 2.5, momentumBars: 3, momentumTf: '15m',
    channelEnabled: true, fibonacciEnabled: true, cooldownMinutes: 15 };
  const coin = (id: string, userId: string) => ({ id, userId, symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
    exchange: 'binance', marketType: 'futures', isActive: false, createdAt: '', updatedAt: '', config });
  fs.writeFileSync(path.join(fixture, 'server/data/surveillance.json'), JSON.stringify({
    guest: [coin('guest-btc', 'guest')], owner: [coin('owner-btc', 'owner')],
  }));
  let server: ChildProcess | null = null;
  let base = '';
  const stop = async () => {
    if (!server || server.exitCode !== null) return;
    const exited = once(server, 'exit');
    server.kill();
    await exited;
    server = null;
  };
  const start = async () => {
    const reservation = net.createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = (reservation.address() as net.AddressInfo).port;
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    let output = '';
    server = spawn(process.execPath, ['--import', 'tsx', '--import',
      path.join(root, 'tests/fixtures/offline-market.ts'), path.join(root, 'server.ts')], {
      cwd: fixture, env: { ...process.env, PORT: String(port), NODE_ENV: 'production', TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout!.on('data', data => { output = (output + data).slice(-8000); });
    server.stderr!.on('data', data => { output = (output + data).slice(-8000); });
    base = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(output);
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Server did not start: ${output}`);
  };
  const list = async (userId: string) => (await (await fetch(`${base}/api/surveillance?userId=${userId}`)).json()).data;
  const post = (route: string, body: unknown) => fetch(`${base}${route}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    await start();
    const marketResponse = await fetch(`${base}/api/screener/coins?minVolume=0`);
    assert.equal(marketResponse.status, 503);
    const market = await marketResponse.json();
    assert.equal(market.success, false);
    assert.equal(market.timestamp, null);
    assert.equal(market.sources.length, 4);
    assert.ok(market.sources.every((source: any) => source.status === 'unavailable' && source.httpStatus === 503));
    for (const query of ['exchange=invalid', 'marketType=invalid', 'minVolume=NaN', 'minVolume=-1', 'minVolume=20&maxVolume=10']) {
      assert.equal((await fetch(`${base}/api/screener/coins?${query}`)).status, 400);
    }
    assert.deepEqual(await list('new-user'), []);
    const deleted = await fetch(`${base}/api/surveillance/owner-btc?userId=owner`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    assert.deepEqual(await list('owner'), []);
    assert.deepEqual(await list('owner'), []);
    assert.equal((await list('guest')).length, 1);
    const added = await post('/api/surveillance', { userId: 'owner', symbol: 'SOLUSDT', exchange: 'bybit', marketType: 'futures' });
    assert.equal(added.status, 200);
    assert.deepEqual((await list('owner')).map((c: any) => c.symbol), ['SOLUSDT']);
    const selected = (await list('owner'))[0];
    assert.equal((await fetch(`${base}/api/surveillance/${selected.id}?userId=owner`, { method: 'DELETE' })).status, 200);
    assert.equal((await post('/api/surveillance', { userId: 'owner', symbol: '' })).status, 400);
    assert.equal((await post('/api/surveillance', { userId: 'owner', symbol: 'SOLUSDT', config: { manualDensityThresholdUsd: 0 } })).status, 400);
    assert.equal((await post('/api/surveillance/backtest', {})).status, 400);
    assert.equal((await post('/api/surveillance/backtest', { symbol: 'SOLUSDT', exchange: 'bybit', marketType: 'futures' })).status, 503);
    await stop();
    await start();
    assert.deepEqual(await list('owner'), []);
    assert.deepEqual(await list('new-user'), []);
  } finally {
    await stop();
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

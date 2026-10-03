import test from 'node:test';
import assert from 'node:assert/strict';
import { SurveillanceRequestGuard } from '../src/utils/surveillanceRequests';

test('a delayed poll cannot restore the last coin after a delete', () => {
  const guard = new SurveillanceRequestGuard('owner');
  const poll = guard.beginRead()!;
  const finish = guard.beginWrite('owner');
  assert.equal(guard.beginRead(), null);
  finish();
  assert.equal(guard.canApply(poll), false);
  assert.equal(guard.canApply(guard.beginRead()!), true);
});

test('out of order polls and account switches cannot expose old coin lists', () => {
  const guard = new SurveillanceRequestGuard('first');
  const firstPoll = guard.beginRead()!;
  const newerPoll = guard.beginRead()!;
  assert.equal(guard.canApply(firstPoll), false);
  guard.setUser('second');
  assert.equal(guard.canApply(newerPoll), false);
  guard.setUser('first');
  assert.equal(guard.canApply(firstPoll), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { RawLogChannel } from '../src/channel';

test('push and pop batch', async () => {
  const ch = new RawLogChannel(100);
  ch.push({ log: { id: 1 }, sourceIp: '127.0.0.1' });
  ch.push({ log: { id: 2 }, sourceIp: '127.0.0.1' });
  const batch = await ch.popBatch(2, 50);
  assert.equal(batch.length, 2);
  assert.equal(batch[0].log.id, 1);
  assert.equal(batch[1].log.id, 2);
});

test('popBatch waits for items up to timeout', async () => {
  const ch = new RawLogChannel(10);
  const start = Date.now();
  const batch = await ch.popBatch(10, 50);
  const elapsed = Date.now() - start;
  assert.equal(batch.length, 0);
  assert.ok(elapsed >= 40 && elapsed < 100);
});

test('push returns false when buffer full', () => {
  const ch = new RawLogChannel(2);
  assert.equal(ch.push({ log: 1, sourceIp: 'x' }), true);
  assert.equal(ch.push({ log: 2, sourceIp: 'x' }), true);
  assert.equal(ch.push({ log: 3, sourceIp: 'x' }), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { TokenBucket, RateLimiter } from '../src/tokenBucket';

test('TokenBucket allows up to rate tokens instantly', () => {
  const bucket = new TokenBucket(5);
  for (let i = 0; i < 5; i++) {
    assert.equal(bucket.tryConsume(), true);
  }
  assert.equal(bucket.tryConsume(), false);
});

test('TokenBucket refills over time', async () => {
  const bucket = new TokenBucket(1);
  assert.equal(bucket.tryConsume(), true);
  assert.equal(bucket.tryConsume(), false);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(bucket.tryConsume(), true);
});

test('RateLimiter maintains separate buckets per IP', () => {
  const limiter = new RateLimiter(1);
  const ip1 = '1.1.1.1';
  const ip2 = '2.2.2.2';
  assert.equal(limiter.check(ip1), true);
  assert.equal(limiter.check(ip1), false);
  assert.equal(limiter.check(ip2), true);
});

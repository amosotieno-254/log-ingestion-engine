import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLog } from '../src/validation';

test('valid log passes', () => {
  const entry = { timestamp: '2025-01-28T10:00:00Z', service: 'auth', level: 'INFO', message: 'User logged in' };
  const result = validateLog(entry);
  assert.equal(result.valid, true);
  assert.deepEqual(result.log, entry);
});

test('invalid timestamp rejected', () => {
  const entry = { timestamp: 'not-a-date', service: 'auth', level: 'INFO', message: 'x' };
  const result = validateLog(entry);
  assert.equal(result.valid, false);
  assert.ok(result.errors!.some(e => e.field === 'timestamp'));
});

test('invalid level rejected', () => {
  const entry = { timestamp: '2025-01-28T10:00:00Z', service: 'auth', level: 'TRACE', message: 'x' };
  const result = validateLog(entry);
  assert.equal(result.valid, false);
  assert.ok(result.errors!.some(e => e.field === 'level'));
});

test('service too long rejected', () => {
  const entry = { timestamp: '2025-01-28T10:00:00Z', service: 'a'.repeat(101), level: 'INFO', message: 'x' };
  const result = validateLog(entry);
  assert.equal(result.valid, false);
  assert.ok(result.errors!.some(e => e.field === 'service'));
});

test('message too long rejected', () => {
  const entry = { timestamp: '2025-01-28T10:00:00Z', service: 'auth', level: 'INFO', message: 'x'.repeat(10001) };
  const result = validateLog(entry);
  assert.equal(result.valid, false);
  assert.ok(result.errors!.some(e => e.field === 'message'));
});

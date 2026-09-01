import test from 'node:test';
import assert from 'node:assert/strict';
import { Metrics } from '../src/metrics';

test('metrics record and snapshot', () => {
  const metrics = new Metrics();
  metrics.record({ level: 'INFO', service: 'service1' });
  metrics.record({ level: 'ERROR', service: 'service1' });
  metrics.record({ level: 'INFO', service: 'service2' });
  const snap = metrics.snapshot();
  assert.equal(snap.total_logs, 3);
  assert.equal(snap.logs_by_level.INFO, 2);
  assert.equal(snap.logs_by_level.ERROR, 1);
  assert.equal(snap.logs_by_service.service1, 2);
  assert.equal(snap.logs_by_service.service2, 1);
  assert.equal(snap.error_rate, 100 * (1 / 3));
});

test('error rate is 0 when no logs', () => {
  const metrics = new Metrics();
  const snap = metrics.snapshot();
  assert.equal(snap.error_rate, 0);
});

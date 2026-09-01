import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichLog } from '../src/enrichment';

test('enrichLog adds required fields', () => {
  const log = { timestamp: '2025-01-28T10:00:00Z', service: 'auth', level: 'INFO', message: 'hello' };
  const enriched = enrichLog(log, '192.168.1.1', 'production');
  assert.equal(enriched.timestamp, log.timestamp);
  assert.equal(enriched.service, log.service);
  assert.equal(enriched.level, log.level);
  assert.equal(enriched.message, log.message);
  assert.equal(enriched.source_ip, '192.168.1.1');
  assert.equal(enriched.env, 'production');
  assert.ok(typeof enriched.received_at === 'string');
  assert.match(enriched.received_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
});

test('source_ip defaults to unknown if missing', () => {
  const log = { timestamp: '2025-01-28T10:00:00Z', service: 'x', level: 'DEBUG', message: 'y' };
  const enriched = enrichLog(log, '', 'dev');
  assert.equal(enriched.source_ip, 'unknown');
});

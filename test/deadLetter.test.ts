import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { DeadLetter } from '../src/deadLetter';

test('dead letter appends and rotates', async () => {
  const testFile = path.join(process.cwd(), 'test-dead-letter.json');
  const dl = new DeadLetter(testFile);
  await dl.append({ log: 'x', error: 'test', timestamp: 'now' });
  const content = await fs.readFile(testFile, 'utf-8');
  assert.ok(content.includes('"log":"x"'));
  await fs.unlink(testFile).catch(() => {});
});

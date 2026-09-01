import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('classic Safari history runtime matches the tested module source', async () => {
  const [moduleSource, runtimeSource] = await Promise.all([
    readFile(new URL('../extension/history.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../extension/history.js', import.meta.url), 'utf8'),
  ]);

  assert.equal(runtimeSource, moduleSource.replace(/^export /gm, ''));
});

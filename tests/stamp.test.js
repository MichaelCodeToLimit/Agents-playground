import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stamped, compute } from '../scripts/stamp.mjs';

test('index.html carries the current content hash (run `npm run stamp` after editing public/js or style.css)', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.equal(stamped(html), html, 'index.html is stale: run npm run stamp');
});
test('every game module is mapped to a versioned URL', () => {
  const { importmap, v } = compute(), map = JSON.parse(importmap).imports;
  for (const m of ['main', 'sim', 'render', 'rules', 'ai', 'cpu', 'path', 'audio', 'net', 'input']) assert.equal(map[`/js/${m}.js`], `/js/${m}.js?v=${v}`);
});

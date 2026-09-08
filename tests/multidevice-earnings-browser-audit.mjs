// L2 2026-09-07. Real IndexedDB and document visibilitychange listener, two
// independent databases, encrypted mock-peer round trips. CONTROL requires
// no unsolicited PUT and one conflict retry. Expected: 4 passed, 0 failed.
// Browser proof is pending: this work-order sandbox cannot bind local sockets.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree } from './godmode.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = process.argv[2] ? null : await serveTree(root);
const base = process.argv[2] || local.url;
let browser;
try {
  const opened = await boot(base);
  browser = opened.browser;
  const page = opened.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('tests/fixtures/l2-browser.html', base).href);
  const results = await page.evaluate(async () => {
    const D = await import('/js/db.js');
    const L = await import('/js/loot.js');
    const S = await import('/js/social.js');
    const { backupScenarios } = await import('/tests/lib/l2-scenarios.mjs');
    const rows = [];
    const assert = { equal(actual, expected, message = 'equality') {
      if (actual !== expected) throw new Error(`${message}: ${actual} !== ${expected}`);
    } };
    await backupScenarios({ D, L, S, async check(name, fn) {
      try { await fn(assert); rows.push({ name, pass: true }); }
      catch (e) { rows.push({ name, pass: false, error: e.message }); }
    }, hidden() {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    } });
    return rows;
  });
  for (const row of results) console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.name}${row.error ? ': ' + row.error : ''}`);
  if (errors.length) console.log(`FAIL page errors: ${errors.join(', ')}`);
  const failed = results.filter(r => !r.pass).length + errors.length;
  console.log(`${results.filter(r => r.pass).length} passed, ${failed} failed`);
  process.exitCode = failed || results.length !== 4 ? 1 : 0;
} finally {
  await browser?.close();
  local?.close();
}

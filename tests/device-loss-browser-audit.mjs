/* L3 browser companion. Operates the real first-run recovery controls and
 * replacement file import, with visibility and hit tests. Run only on a local
 * disposable origin. No Worker calls: non-origin requests receive a stub 503.
 * CONTROL: the explicit new-player button reaches normal onboarding.
 * Expected: 4/4 rows pass. Not executed in the implementation sandbox.
 * Prove red: revert js/app.js in a disposable copy; the first recovery control
 * is absent, so the first row fails instead of grading an empty sample.
 */
import assert from 'node:assert/strict';
import { auditOutputPath } from './lib/audit-output.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree } from './godmode.js';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = process.argv[2];
if (arg && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(arg).hostname)) throw new Error('Local disposable origin required');
const srv = arg ? null : await serveTree(ROOT);
const base = arg || srv.url;
const temp = fs.mkdtempSync(auditOutputPath(path.join(os.tmpdir(), 'l3-browser-')));
let browser, bad = 0, rows = 0;
try {
  const session = await boot(base, { headless: process.env.HEADLESS_MODE || 'shell' });
  browser = session.browser;
  const page = session.page;
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (new URL(req.url()).origin === new URL(base).origin || req.url().startsWith('data:')) req.continue();
    else req.respond({ status: 503, contentType: 'application/json', body: '{}' });
  });
  async function check(name, run) {
    rows++;
    try { await run(); console.log(`PASS ${name}`); }
    catch (e) { bad++; console.log(`FAIL ${name}: ${e.message}`); }
  }
  async function tap(selector) {
    await page.waitForSelector(selector, { visible: true, timeout: 15000 });
    const hitHandle = await page.waitForFunction(selector => {
      const el = document.querySelector(selector);
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      let opacity = 1;
      for (let n = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return opacity > 0.9 && r.width > 0 && r.height > 0 && (top === el || el.contains(top));
    }, { timeout: 15000 }, selector);
    assert.equal(await hitHandle.jsonValue(), true, `${selector} is covered or invisible`);
    await hitHandle.dispose();
    await page.click(selector);
  }
  await page.goto(base, { waitUntil: 'networkidle2' });
  await check('R54-2 no-key recovery offer opens reachable restore and file controls', async () => {
    await tap('#saveRestore');
    await page.waitForSelector('#rsGo', { visible: true });
    assert.match(await page.$eval('#sheets', el => el.textContent), /This replaces whatever is on this phone now/);
    await page.waitForSelector('#rsFileBtn', { visible: true });
    await tap('#sheets .sheet-close');
  });
  await check('CONTROL explicit new-player choice reaches normal onboarding', async () => {
    await tap('#saveNew');
    await page.waitForSelector('#onbGo', { visible: true });
    await tap('#onbGo');
    await page.waitForSelector('#onbName', { visible: true });
  });
  await check('R54-1 known account missing its save offers retry and refuses welcome flow', async () => {
    await page.evaluate(async () => {
      const d = await import('./js/db.js');
      for (const store of d.STORES) await d.db.clear(store);
      // Only used as evidence by the page; retry's register request is stubbed.
      await d.kvSet('identity', { privJwk: { d: 'fixture' }, pubJwk: { x: 'fixture' } });
      for (let i = 0; i < 5; i++) await d.kvSet(`residue-${i}`, true);
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('#saveRetry', { visible: true });
    assert.equal(await page.$('#saveNew'), null);
    await tap('#saveRetry');
    await page.waitForFunction(() => document.querySelector('#saveRetry')?.disabled === false);
    assert.equal(await page.$('#onbGo'), null);
    const inv = await page.evaluate(async () => (await (await import('./js/db.js')).db.all('inv')).length);
    assert.equal(inv, 0);
  });
  await check('R50-3 recovery file replaces 25 local rows and enters the bound app with 168,680 coins', async () => {
    await page.evaluate(async () => {
      const d = await import('./js/db.js');
      await d.kvSet('coins', 7); await d.kvSet('coinsRev', 999999);
      for (let i = 0; i < 25; i++) await d.db.put('log', { id: `local-${i}`, date: '2026-09-01' });
    });
    const fixture = { app: 'tally', version: 3, log: [{ id: 'restored', date: '2026-09-01', kcal: 123 }],
      kv: [
        { k: 'coins', v: 168680 }, { k: 'coinsRev', v: 1 }, { k: 'game-init', v: true }, { k: 'loot-init', v: true },
        { k: 'settings', v: { profile: { sex: 'm', age: 30, heightCm: 178, weightKg: 80, activity: 'moderate', goal: 'recomp' }, targets: { kcal: 2000, p: 100, c: 250, f: 70 }, units: 'kg', createdAt: 1 } },
      ] };
    const file = path.join(temp, 'backup.json'); fs.writeFileSync(auditOutputPath(file), JSON.stringify(fixture));
    await tap('#saveRestore');
    await page.waitForSelector('#rsFile');
    await (await page.$('#rsFile')).uploadFile(file);
    await page.waitForFunction(() => !document.querySelector('#saveRestore') && getComputedStyle(document.querySelector('#tabbar')).display !== 'none');
    const state = await page.evaluate(async () => {
      const d = await import('./js/db.js');
      return { coins: await d.kvGet('coins'), local: (await d.db.all('log')).filter(r => r.id.startsWith('local-')).length };
    });
    assert.equal(state.coins, 168680); assert.equal(state.local, 0);
    await tap('#gearBtn');
    await page.waitForSelector('#restoreAcctBtn', { visible: true });
    await tap('#restoreAcctBtn');
    await page.waitForSelector('#rsGo', { visible: true });
  });
  console.log(`device-loss-browser: ${rows - bad}/${rows} passed; ${bad} failed`);
  process.exitCode = bad ? 1 : 0;
} finally {
  if (browser) await browser.close();
  if (srv) srv.close();
  fs.rmSync(auditOutputPath(temp), { recursive: true, force: true });
}

/* Tier 3 audit: the six depth screens Tom approved 2026-08-07 must RENDER their
 * mockup language and their controls must still WORK.
 *
 * Rendering a screen proves nothing on its own (anti-regression rule 5), so every
 * screen here is operated: buy arms rather than spends, a rung fights, a bed
 * waters, the talent toggle opens the tree, a stepper moves a stat.
 *
 * PROVE-RED: each check names the marker it needs. Delete `.t3-price` from the
 * shop markup, or drop the `armToConfirm` wiring from `[data-buy]`, and the
 * matching check exits non-zero naming the screen.
 *
 * An empty sample set is a FAILURE, never a pass.
 *
 * Usage: node tests/t3-audit.mjs   (URL=https://... to run against live)
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, openPit } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srv = null;
let base = process.env.URL;
if (!base) {
  srv = spawn('python3', ['-m', 'http.server', '8145', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(900);
  base = 'http://127.0.0.1:8145/';
}

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207, accuracy: 8 });
await seed(page, { level: 16, coins: 4000, dust: 400, beatRungs: [1, 2] });

const count = sel => page.evaluate(s => document.querySelectorAll(s).length, sel);
const hubTab = async re => {
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await sleep(1800);
  await page.evaluate(r => {
    const t = [...document.querySelectorAll('.ch-tab')].find(e => new RegExp(r, 'i').test(e.textContent || ''));
    if (t) t.click();
  }, re);
  await sleep(1800);
};

/* ---------------- SHOP ---------------- */
await hubTab('shop');
const shop = {
  drop: await count('.t3-drop'), prices: await count('.t3-price'),
  cells: await count('.t3-cell'), forage: await count('.t3-forage'),
};
ok('Shop renders the Tier 3 language', shop.drop === 1 && shop.prices >= 4 && shop.cells >= 6 && shop.forage >= 1, JSON.stringify(shop));
// the drop poster IS the disclosure: opening it must reveal the real per-item grid
await page.evaluate(() => document.querySelector('.t3-drop')?.click());
await sleep(700);
ok('drop poster opens the real per-item grid', (await count('.drop-item')) >= 4, `${await count('.drop-item')} items`);
// ONE TAP MUST NEVER SPEND: the first tap arms, the balance does not move
const armed = await page.evaluate(async () => {
  const before = (await (await import('./js/loot.js')).coins());
  const b = document.querySelector('[data-buy]');
  if (!b) return { err: 'no coin-shop button' };
  b.click();
  await new Promise(r => setTimeout(r, 350));
  const after = (await (await import('./js/loot.js')).coins());
  return { armed: b.classList.contains('arming'), label: b.textContent.trim().slice(0, 24), spent: before - after };
});
ok('a first tap in the coin shop ARMS and spends nothing',
  !armed.err && armed.armed === true && armed.spent === 0, JSON.stringify(armed));

/* ---------------- BACKPACK ---------------- */
await hubTab('backpack');
const bp = { cells: await count('.t3-cells .t3-cell'), open: await count('[data-open]'), rows: await count('.t3-row') };
ok('Backpack renders crate cells + consumable rows', bp.cells >= 1 && bp.open >= 1 && bp.rows >= 2, JSON.stringify(bp));

/* ---------------- BUILD ---------------- */
await hubTab('build');
const build = {
  fighter: await count('.t3-fighter'), armor: await count('.t3-armor .t3-cell'),
  faq: await count('.t3-faq'), stats: await count('.t3-stat'), steppers: await count('.t3-pm'),
};
ok('Build renders plate + armor + stat allocators',
  build.fighter === 1 && build.armor === 2 && build.faq === 1 && build.stats >= 5 && build.steppers >= 10, JSON.stringify(build));
// operate a stepper: the stat must actually move
const step = await page.evaluate(async () => {
  const read = () => [...document.querySelectorAll('.t3-stat')].map(s => s.querySelector('.v')?.textContent?.trim());
  const before = read();
  const plus = document.querySelector('.t3-pm.plus:not([disabled])');
  if (!plus) return { err: 'no enabled + stepper' };
  plus.click();
  await new Promise(r => setTimeout(r, 900));
  return { before, after: read() };
});
ok('a + stepper actually raises a stat', !step.err && JSON.stringify(step.before) !== JSON.stringify(step.after), JSON.stringify(step));

/* ---------------- PIT ENTRY ---------------- */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1200);
await openPit(page);
await sleep(1500);
const pit = {
  hero: await count('.t3-hero'), energy: await count('.t3-energy'),
  rungs: await count('.t3-rung'), locks: await count('.t3-lock'),
};
ok('Pit entry renders poster + energy card + rung plates',
  pit.hero === 1 && pit.energy === 1 && pit.rungs >= 5, JSON.stringify(pit));
// a locked rung must say WHY, not just "locked"
const lockText = await page.evaluate(() => [...document.querySelectorAll('.t3-lock')].map(e => e.textContent.trim()));
ok('a locked rung states its condition', lockText.length > 0 && lockText.some(t => /BEAT RUNG \d/.test(t)), JSON.stringify(lockText.slice(0, 3)));
// the live rung must start a real fight
await page.evaluate(() => document.querySelector('[data-rung]:not([disabled])')?.click());
await sleep(2200);
ok('a rung button starts a real fight', (await count('.arena')) === 1, `${await count('.arena')} arena(s)`);
await page.evaluate(() => { [...document.querySelectorAll('.sheet-close')].pop()?.click(); });
await sleep(900);

/* ---------------- GARDEN ---------------- */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1000);
const planted = await page.evaluate(async () => {
  const g = await import('./js/garden.js');
  await g.grantSeed('graveroot', 2);
  const r = await g.plantSeed('graveroot');
  return r.ok === true;
});
/* The Garden moved out from under the Kitchen on 2026-08-07 (Tom: "the garden
   feels like an after thought that you wouldn't think to click into"), so it is
   no longer a #gardenRow buried in the recipe list. It has its own door on Today
   and a GROW door inside the Kitchen; this walks the Today door, which is the
   one a player would use. tests/garden-doors.mjs owns both routes. */
await page.evaluate(() => document.getElementById('gardenActBtn')?.click());
await sleep(1800);
const garden = {
  planted, beds: await count('.t3-bed'), soil: await count('.t3-bed.thirsty, .t3-bed.growing, .t3-bed.ready'),
  buy: await count('.t3-bed.buy'), pouch: await count('.t3-seed'),
};
// an empty sample set is a failure: a garden with no planted bed proves nothing
// about the soil treatment, which is the whole point of the redraw
ok('Garden renders real soil beds (not just empty voids)',
  garden.planted && garden.beds >= 3 && garden.soil >= 1, JSON.stringify(garden));
const watered = await page.evaluate(async () => {
  const b = document.querySelector('.t3-bed.thirsty');
  if (!b) return { err: 'no thirsty bed to water' };
  b.click();
  await new Promise(r => setTimeout(r, 1200));
  return { stillThirsty: !!document.querySelector('.t3-bed.thirsty') };
});
ok('tapping a thirsty bed waters it', !watered.err && watered.stillThirsty === false, JSON.stringify(watered));
await page.evaluate(() => { [...document.querySelectorAll('.sheet-close')].pop()?.click(); });
await sleep(700);

/* ---------------- STABLE ---------------- */
await hubTab('backpack');
await page.evaluate(() => document.querySelector('#openStableFromBp')?.click());
await sleep(1800);
const stable = { cards: await count('.t3-petcard'), steps: await count('.t3-steps'), acts: await count('.t3-ghosty') };
ok('Stable renders trading-card pets', stable.cards >= 1 && stable.steps >= 1 && stable.acts >= 3, JSON.stringify(stable));
const tree = await page.evaluate(async () => {
  const before = document.querySelectorAll('.pet-tree-inline').length;
  const btn = document.querySelector('[data-pettree]');
  if (!btn) return { err: 'no talents control' };
  btn.click();
  await new Promise(r => setTimeout(r, 1000));
  return { before, after: document.querySelectorAll('.pet-tree-inline').length };
});
ok('the TALENTS control toggles the pet tree', !tree.err && tree.before !== tree.after, JSON.stringify(tree));

ok('no page errors during the sweep', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);

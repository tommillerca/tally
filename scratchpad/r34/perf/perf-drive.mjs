/* PERF-4 / PERF-5 driver, round 34. Not a guard: a measurement tool, run by
 * hand, medians reported in the commit / docs/CLAIMS.md row (MANUAL rows are
 * allowed to be driver-based per this round's brief).
 *
 * Usage:
 *   HEADLESS_MODE=shell node scratchpad/r34/perf/perf-drive.mjs wardrobe
 *   HEADLESS_MODE=shell node scratchpad/r34/perf/perf-drive.mjs boneyard
 *
 * Both modes: CPU throttle 4x (Emulation.setCPUThrottlingRate), 3 runs, long
 * tasks (PerformanceObserver('longtask')) collected per run, medians printed.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from '../../../tests/godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const mode = process.argv[2];
if (!['wardrobe', 'boneyard'].includes(mode)) {
  console.error('usage: perf-drive.mjs <wardrobe|boneyard>');
  process.exit(2);
}

const median = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const srvHandle = await serveTree(ROOT);
const base = srvHandle.url;

const bootArgs = mode === 'boneyard'
  ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }
  : {};
const { browser, page } = await boot(base, bootArgs);

// The longtask hook must be present before any navigation that might trigger
// one, so it is (re)installed on every document via evaluateOnNewDocument.
await page.evaluateOnNewDocument(() => {
  window.__lt = [];
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) window.__lt.push({ d: e.duration, t: e.startTime });
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* no longtask support: __lt stays empty, printed as 0/0 */ }
});

const cdp = await page.createCDPSession();

const stats = lt => ({ n: lt.length, totalMs: Math.round(lt.reduce((s, e) => s + e.d, 0)),
  maxMs: lt.length ? Math.round(Math.max(...lt.map(e => e.d))) : 0, over200: lt.filter(e => e.d > 200).length });

async function run() {
  await page.evaluate(() => { window.__lt = []; });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  if (mode === 'wardrobe') {
    await page.evaluate(() => { location.hash = '#/today'; });
    await sleep(500);
    await page.evaluate(() => { location.hash = '#/bonehead'; });
    await sleep(400);
    await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="wardrobe"]')?.click());
    await sleep(1200);
    const mount = stats(await page.evaluate(() => window.__lt));
    await page.evaluate(() => { window.__lt = []; });
    // Scroll the grid: 8 steps of a real wheel event on the scroller.
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel({ deltaY: 400 });
      await sleep(150);
    }
    await sleep(400);
    const scroll = stats(await page.evaluate(() => window.__lt));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    return { mount, scroll };
  } else {
    await page.evaluate(() => { location.hash = '#/today'; });
    await sleep(800);
    await page.evaluate(() => { location.hash = '#/boneyard'; });
    await sleep(1500);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(4500);
    const visit = stats(await page.evaluate(() => window.__lt));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    return { visit };
  }
}

if (mode === 'boneyard') {
  const origin = new URL(base).origin;
  await browser.defaultBrowserContext().overridePermissions(origin, ['geolocation']);
  await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });
}

await seed(page, mode === 'wardrobe' ? { level: 40, coins: 250000, dust: 99999 } : { level: 18, coins: 500 });
if (mode === 'wardrobe') {
  await page.evaluate(async () => {
    const loot = await import('./js/loot.js');
    const { BH_ITEMS } = await import('./data/boneheadz.js');
    for (const i of BH_ITEMS.filter(x => x.slot === 'H')) { try { await loot.grantCosmetic(i.id, 'perf-drive'); } catch { /* not grantable */ } }
  });
}

const results = [];
for (let i = 0; i < 3; i++) results.push(await run());
console.log(`${mode}: runs`, JSON.stringify(results));
for (const phase of Object.keys(results[0])) {
  const rows = results.map(r => r[phase]);
  console.log(`${mode}: MEDIAN ${phase} longtasks=${median(rows.map(r => r.n))} totalMs=${median(rows.map(r => r.totalMs))} maxMs=${median(rows.map(r => r.maxMs))} over200ms=${median(rows.map(r => r.over200))}`);
}

await browser.close();
srvHandle.close();

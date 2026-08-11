/* NO CORAL FLASH BEHIND AN EQUIPPED BACKDROP.
 *
 * Tom, 2026-08-08: "im seeing the coral colour behind my bonehead when switching
 * tabs very briefly". The hero card is `background: var(--coral)` (the deck's
 * hero colour, correct when nothing is equipped) and an equipped backdrop is an
 * <img> painted over it. Switching tabs re-renders the card, so there are a
 * frame or two before that image decodes where the coral is on screen.
 *
 * Measured in PIXELS during the switch, not by reading the CSS: a computed
 * background-color would read "correct" on a frame nobody can see, which is
 * exactly the class of false pass that shipped an invisible punch in v245.
 *
 * PROVE-RED (confirmed 2026-08-08): remove the inline dark ground from the
 * .hero-scene tag in js/app.js and FLASH fails with a coral sample.
 *
 * Usage: node tests/hero-flash.mjs
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree} from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srv = null, srvHandle = null;
let base = process.env.URL;
if (!base) {
  /* serveTree: a free port from the OS, and a HARD ERROR if python never
     bound. The hard-coded port with stdio:'ignore' meant a stranded server
     already holding it made this audit talk to whatever was listening. */
  srvHandle = await serveTree(ROOT);
  srv = { kill: () => srvHandle.close() };
  base = srvHandle.url;
}
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await seed(page, { level: 18 });

/* HOLD THE BACKDROP BACK ON PURPOSE.
   The first version of this test sampled a warm cache and could not fail: with
   the fix REMOVED it still reported no coral, because the image decodes before
   the first sample lands. A check that cannot fail is not a check. Delaying only
   the backdrop request makes the pre-decode window real and deterministic, which
   is also the state a player on a cold cache actually gets. */
await page.setRequestInterception(true);
page.on('request', req => {
  if (/\/assets\/bh\/BG\//.test(req.url())) setTimeout(() => req.continue().catch(() => {}), 700);
  else req.continue().catch(() => {});
});

// equip a backdrop: the whole bug only exists when one is on
const equipped = await page.evaluate(async () => {
  const { kvGet, kvSet } = await import('./js/db.js');
  const { BH_ITEMS } = await import('./data/boneheadz.js');
  const bg = (BH_ITEMS || []).find(i => i.slot === 'BG' || String(i.id || '').startsWith('BG'));
  if (!bg) return null;
  const eq = (await kvGet('equipped', {})) || {};
  await kvSet('equipped', { ...eq, BG: bg.id });
  return bg.id;
});
ok('SETUP a backdrop is equipped (without one there is no bug to test)', !!equipped, String(equipped));

const CORAL = { r: 253, g: 104, b: 87 };
const isCoral = p => Math.abs(p.r - CORAL.r) < 40 && Math.abs(p.g - CORAL.g) < 45 && Math.abs(p.b - CORAL.b) < 45;

// sample the hero repeatedly ACROSS the switch, catching the early frames
const sampleDuring = async () => {
  await page.evaluate(() => { location.hash = '#/friends'; });
  await sleep(900);
  const samples = [];
  const grab = async () => {
    const box = await page.evaluate(() => {
      const el = document.querySelector('.hero-scene');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + 8), y: Math.round(r.y + 8), w: 10, h: 10, ok: r.width > 40 && r.height > 40 };
    });
    if (!box || !box.ok) return;
    const buf = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
    // decode the PNG's average pixel without a dependency: use the browser
    const px = await page.evaluate(async b64 => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let r = 0, gg = 0, bb = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
      return { r: Math.round(r / n), g: Math.round(gg / n), b: Math.round(bb / n) };
    }, buf.toString('base64'));
    samples.push(px);
  };
  // fire the switch and sample the frames right after it
  await page.evaluate(() => { location.hash = '#/today'; });
  for (let i = 0; i < 14; i++) { await grab(); await sleep(45); }
  return samples;
};

const samples = await sampleDuring();
ok('FLASH the audit actually sampled frames (an empty sample is a FAILURE)', samples.length >= 8, `${samples.length} frames`);
const coralFrames = samples.filter(isCoral);
ok('FLASH no frame of the hero is coral while a backdrop is equipped',
  coralFrames.length === 0,
  coralFrames.length ? `${coralFrames.length}/${samples.length} coral, e.g. ${JSON.stringify(coralFrames[0])}`
    : `${samples.length} frames, first ${JSON.stringify(samples[0])}`);

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);

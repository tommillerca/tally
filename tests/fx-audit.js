#!/usr/bin/env node
/* FX audit: does each combat animation actually put pixels on screen?
 *
 * WHY THIS EXISTS. v245 shipped an invisible punch. The jab element was created,
 * played and removed exactly on schedule, but Cam's frames (110KB to 136KB each)
 * had not decoded inside the animation's ~350ms life, so there was nothing to
 * see. Every check I ran before shipping passed, because every one of them called
 * strikeFx() DIRECTLY and measured the element's CSS box. getBoundingClientRect
 * returns that box whether or not an image ever arrived, so the geometry read
 * perfectly over a blank frame. Tom found it by fighting.
 *
 * So this audit is deliberately built to fail in the two ways that mattered:
 *
 *   1. It drives the REAL control. It clicks the actual move button in a real
 *      fight. It never calls the FX function itself. A wiring mistake (the game
 *      never calling the animation) is invisible to a direct call and caught here.
 *   2. It asserts DECODED PIXELS WHILE THE FX IS ON SCREEN: naturalWidth > 0 on
 *      every frame, in the same sample where the frame is visible. Position is
 *      checked too, but position alone is the assertion that lied.
 *
 * Plus two rules borrowed from the anti-regression list in CLAUDE.md:
 *   - An empty sample set is a FAILURE, never a pass.
 *   - Coverage is derived from the SOURCE, not from this file's wishes. Register a
 *     new move in STRIKE_FX and forget to add it below, and the audit fails
 *     rather than quietly testing the old two.
 *
 * Usage:
 *   node tests/fx-audit.js                     # audit the LIVE site
 *   node tests/fx-audit.js http://localhost:8765/   # audit a local build
 *
 * Exits non-zero on any failure, so it cannot report success over a broken
 * animation. Puppeteer is borrowed from the overlay-render-kit rather than added
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer } from './godmode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/* puppeteer is a real dependency of this repo now, resolved by godmode's
   loadPuppeteer: the repo's own node_modules first so a fresh clone works after
   `npm install`, the overlay-render-kit as fallback so machines already set up
   that way need no install. This file used to carry its own copy of the kit path,
   which meant it could only ever run on one Mac. The exit-1-with-a-reason
   behaviour is kept: a missing browser is a SETUP failure and must not read as an
   FX failure. */
let puppeteer;
try { puppeteer = await loadPuppeteer(); }
catch (e) { console.error(`FX AUDIT CANNOT RUN (setup, not a failing check):\n${e.message}`); process.exit(1); }

const BASE = (process.argv[2] || 'https://tommillerca.github.io/tally/').replace(/\/?$/, '/');
const APP_JS = path.join(__dirname, '..', 'js', 'app.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Each entry: the move id as registered in STRIKE_FX, and the button that fires
   it. Adding an animation means adding a row here; see the coverage gate below. */
const MOVES = [
  { id: 'jab', button: /^JAB/i },
  { id: 'swing', button: /^SWING/i },
];

/* ---- coverage gate: read the registered moves out of the source ---- */
function registeredMoves() {
  const src = fs.readFileSync(APP_JS, 'utf8');
  const block = src.match(/const STRIKE_FX = \{([\s\S]*?)\n {2}\};/);
  if (!block) {
    console.error('FAIL: could not find the STRIKE_FX table in js/app.js. If it was renamed, update this audit.');
    process.exit(1);
  }
  return [...block[1].matchAll(/^\s{4}(\w+)\s*:/gm)].map(m => m[1]);
}

const failures = [];
const fail = m => { failures.push(m); console.log('  FAIL: ' + m); };

(async () => {
  const registered = registeredMoves();
  const covered = MOVES.map(m => m.id);
  console.log(`registered in STRIKE_FX: ${registered.join(', ')}`);
  const uncovered = registered.filter(r => !covered.includes(r));
  if (uncovered.length) fail(`these animations are registered but not audited: ${uncovered.join(', ')}. Add a row to MOVES.`);
  const stale = covered.filter(c => !registered.includes(c));
  if (stale.length) fail(`audited moves that no longer exist in STRIKE_FX: ${stale.join(', ')}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(BASE + '?demo', { waitUntil: 'networkidle2' });
  await sleep(2500);

  // Read the build from the served app.js, not from scraped markup: an earlier
  // version of this line matched an unrelated "v187" in the DOM and would have
  // labelled every future audit with the wrong build.
  const build = await page.evaluate(async (base) => {
    try {
      const t = await (await fetch(base + 'js/app.js?b=' + Math.random(), { cache: 'no-store' })).text();
      return (t.match(/APP_BUILD = '(v\d+)'/) || [, 'unknown'])[1];
    } catch { return 'unreachable'; }
  }, BASE);
  console.log(`auditing ${BASE} (build tag seen: ${build})`);

  const clickMatching = async (re) => {
    const hit = await page.evaluate(src => {
      const rx = new RegExp(src, 'i');
      const b = [...document.querySelectorAll('button')]
        .find(x => rx.test((x.textContent || '').trim()) && !x.disabled);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      if (!r.width) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, re.source);
    if (!hit) return false;
    await page.mouse.click(hit.x, hit.y);
    return true;
  };

  // clear the demo profile's opening overlays, then start a fight
  for (let i = 0; i < 6; i++) {
    if (!await clickMatching(/^(spin|nice|done|collect|claim|continue|ok|got it|next|skip)$/)) break;
    await sleep(1800);
  }
  await clickMatching(/^the pit/i) || await page.evaluate(() => document.getElementById('pitBtn')?.click());
  await sleep(1500);
  if (!await clickMatching(/^FIGHT$/)) { console.log('FAIL: could not start a fight'); await browser.close(); process.exit(1); }
  await sleep(2500);
  if (!await page.evaluate(() => !!document.querySelector('#youStage'))) {
    console.log('FAIL: no fight on screen'); await browser.close(); process.exit(1);
  }

  for (const move of MOVES) {
    // Poll at 8ms: with fast battles on, the whole animation can be under 100ms.
    await page.evaluate(() => {
      window.__fx = [];
      window.__fxStop = (id => () => clearInterval(id))(setInterval(() => {
        const w = document.querySelector('.strikefx');
        if (!w) return;
        const imgs = [...w.querySelectorAll('img')];
        const foe = document.querySelector('#foeStage');
        const vb = foe && foe.getBoundingClientRect();
        const vis = imgs.find(i => getComputedStyle(i).opacity !== '0');
        const ir = vis && vis.getBoundingClientRect();
        window.__fx.push({
          cls: w.className,
          decoded: imgs.length > 0 && imgs.every(i => i.naturalWidth > 0),
          visibleCount: imgs.filter(i => getComputedStyle(i).opacity !== '0').length,
          onVictim: !!(ir && vb && ir.right > vb.left && ir.left < vb.right && ir.bottom > vb.top && ir.top < vb.bottom),
        });
      }, 8));
    });

    let fired = await clickMatching(move.button);
    if (!fired) {   // out of AP: hand the turn over and wait for it to come back
      await clickMatching(/^END TURN/i);
      await sleep(6000);
      fired = await clickMatching(move.button);
    }
    await sleep(3000);
    const samples = await page.evaluate(() => { window.__fxStop(); return window.__fx; });

    console.log(`\n${move.id}: button fired=${fired}, samples=${samples.length}`);
    if (!fired) { fail(`${move.id}: never found an enabled button matching ${move.button}`); continue; }
    if (!samples.length) { fail(`${move.id}: no .strikefx element ever appeared. Empty sample set is a failure, not a pass.`); continue; }

    const good = samples.filter(s => s.decoded && s.visibleCount > 0);
    const onVictim = samples.filter(s => s.decoded && s.visibleCount > 0 && s.onVictim);
    console.log(`  decoded+visible: ${good.length}/${samples.length}   and landing on the victim: ${onVictim.length}`);
    if (!good.length) fail(`${move.id}: the animation played with UNDECODED images, so nothing was on screen. This is the v245 bug.`);
    else if (!onVictim.length) fail(`${move.id}: frames decoded but never overlapped the victim.`);
  }

  if (pageErrors.length) fail(`page errors during the audit: ${pageErrors.slice(0, 3).join(' | ')}`);

  await browser.close();
  console.log('');
  if (failures.length) { console.log(`FX AUDIT FAILED (${failures.length})`); process.exit(1); }
  console.log('FX AUDIT PASSED: every registered animation put decoded pixels on the victim.');
})();

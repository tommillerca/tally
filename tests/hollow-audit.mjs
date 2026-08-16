/* tests/hollow-audit.mjs — the Hollow's own guard rail.
 *
 * Every finding the Impeccable critique raised is pinned here, and every
 * assertion was proven RED against the exact code that shipped before the fix:
 *   hit boxes      84px wide -> bed0's right edge answered as bed1, bed2's as
 *                  #hlwBuy (a 1,500-coin spend). Overlap 20.1 x 57.5.
 *   thirst cue     the droplet chip rendered on EVERY growing bed, so the bed
 *                  that wanted water had no cue of its own.
 *   the fold       the only instruction on the screen, "Nothing ever dies"
 *                  included, sat 1007px down a 844px viewport.
 *   reduced motion animation-duration:0.001s alone left 23 of 24 animations
 *                  reporting playState "running", app-wide, not just here.
 *
 * Usage:  node tests/hollow-audit.mjs 390 844 [reduce]
 * Set HLW_OUT to a directory to also write a screenshot and the raw JSON.
 * An empty sample set is a FAILURE, never a pass.
 */
import fs from 'node:fs';
import { boot, serveTree, dismissOverlays, sleep, setWidth } from './godmode.js';

const ROOT = process.env.HLW_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname);
const W = Number(process.argv[2]), H = Number(process.argv[3]);
const REDUCED = process.argv[4] === 'reduce';
const TAG = `${W}x${H}${REDUCED ? '-rm' : ''}`;
const OUT = process.env.HLW_OUT || '';

const srv = await serveTree(ROOT);
const { browser, page, errors } = await boot(srv.url);
const consoleErrs = [];
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
if (REDUCED) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await setWidth(page, W, H);
await sleep(600);
await dismissOverlays(page);

// ---- put the garden into the state the fixes are ABOUT: one ready, one growing
// and watered, one growing and thirsty. Written through the app's own kv. ----
await page.evaluate(async base => {
  const kv = await import(new URL('js/db.js', base).href);
  const now = Date.now();
  await kv.kvSet('garden', {
    seeds: { graveroot: 4, ember: 2 },
    plotsOwned: 3,
    plots: [
      { ing: 'ember', plantedAt: now - 4 * 36e5, readyAt: now - 6e5, watered: true },
      { ing: 'graveroot', plantedAt: now - 36e5, readyAt: now + 72 * 6e4, watered: true },
      { ing: 'bog', plantedAt: now - 18e5, readyAt: now + 38 * 6e4, watered: false },
    ],
    composts: { date: '', used: 0 },
  });
  await kv.kvSet('hlwSeen', 0);
}, srv.url);

await page.evaluate(() => document.querySelector('#kitchenActBtn')?.click());
await sleep(1500);
await page.evaluate(() => document.querySelector('#doorGrow')?.click());
await sleep(2600);

const fail = [];
const note = (cond, msg) => { if (!cond) fail.push(msg); };

// ---------- 1. per-bed hit test: centre AND both horizontal thirds ----------
const hits = await page.evaluate(() => {
  const desc = el => el ? `${el.tagName}${el.id ? '#' + el.id : ''}${((el.className.baseVal ?? el.className) || '').toString().trim().split(/\s+/).filter(Boolean).map(c => '.' + c).join('')}${el.dataset && el.dataset.bed != null ? `[bed=${el.dataset.bed}]` : ''}` : 'null';
  const out = [];
  const btns = [...document.querySelectorAll('#hlwStage .hlw-bed')];
  for (const b of btns) {
    const r = b.getBoundingClientRect();
    const id = b.id || `bed${b.dataset.bed}`;
    const pts = { left: r.left + r.width * 0.17, mid: r.left + r.width / 2, right: r.right - r.width * 0.17 };
    const row = { id, w: +r.width.toFixed(1), h: +r.height.toFixed(1), onscreen: r.top >= 0 && r.bottom <= innerHeight, probes: {} };
    for (const [k, x] of Object.entries(pts)) {
      for (const [ky, y] of [['top', r.top + r.height * 0.2], ['ctr', r.top + r.height / 2], ['bot', r.bottom - r.height * 0.2]]) {
        const inView = y >= 0 && y <= innerHeight && x >= 0 && x <= innerWidth;
        row.probes[`${k}-${ky}`] = inView ? desc(document.elementFromPoint(x, y)) : 'OFFSCREEN';
      }
    }
    out.push(row);
  }
  return out;
});
note(hits.length >= 4, `EMPTY SAMPLE: only ${hits.length} .hlw-bed buttons found`);
for (const r of hits) {
  const bad = Object.entries(r.probes).filter(([, v]) => v !== 'OFFSCREEN' && !v.includes(r.id.startsWith('bed') ? `[bed=${r.id.slice(3)}]` : r.id));
  if (bad.length) fail.push(`HITBOX ${r.id} (${r.w}x${r.h}) leaks at ${bad.map(([k, v]) => `${k}->${v}`).join(', ')}`);
  if (Math.min(r.w, r.h) < 40) fail.push(`TAP TARGET ${r.id} is ${r.w}x${r.h}, under the 40px floor`);
}

// ---------- 2. pairwise bed rect intersection: must be ZERO ----------
const overlaps = await page.evaluate(() => {
  const bs = [...document.querySelectorAll('#hlwStage .hlw-bed')].map(b => ({ id: b.id || `bed${b.dataset.bed}`, r: b.getBoundingClientRect() }));
  const out = [];
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i].r, b = bs[j].r;
    const ow = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const oh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ow > 0 && oh > 0) out.push({ a: bs[i].id, b: bs[j].id, ow: +ow.toFixed(1), oh: +oh.toFixed(1) });
  }
  return out;
});
note(overlaps.length === 0, `OVERLAP: ${JSON.stringify(overlaps)}`);

// ---------- 3. the instruction must be visible WITHOUT scrolling ----------
const foldInfo = await page.evaluate(() => {
  const sc = document.querySelector('#hollowBody');
  sc.scrollTop = 0;
  const n = sc.querySelector('.note');
  const r = n ? n.getBoundingClientRect() : null;
  const say = document.querySelector('#hlwSay');
  const sr = say ? say.getBoundingClientRect() : null;
  return {
    noteText: n ? n.textContent.trim() : null,
    noteFullyVisible: !!r && r.top >= 0 && r.bottom <= innerHeight,
    noteBottom: r ? +r.bottom.toFixed(1) : null,
    keeperSayVisible: !!sr && sr.top >= 0 && sr.bottom <= innerHeight,
    sayBottom: sr ? +sr.bottom.toFixed(1) : null,
    innerH: innerHeight,
    maxScroll: sc.scrollHeight - sc.clientHeight,
  };
});
note(foldInfo.noteText, 'NO .note found in #hollowBody');
note(foldInfo.noteFullyVisible, `NOTE BELOW FOLD: bottom ${foldInfo.noteBottom} vs viewport ${foldInfo.innerH}`);
note(/cauldron/i.test(foldInfo.noteText || ''), 'NOTE never says where the harvest goes');
note(foldInfo.keeperSayVisible, `KEEPER LINE BELOW FOLD: bottom ${foldInfo.sayBottom} vs viewport ${foldInfo.innerH}`);

// ---------- 4. the thirsty bed is the ONLY one wearing the cue ----------
const chips = await page.evaluate(() => {
  const inter = (a, b) => {
    if (!a || !b) return null;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? { w: +w.toFixed(1), h: +h.toFixed(1) } : null;
  };
  const sign = document.querySelector('#hlwSign');
  const sr = sign ? sign.getBoundingClientRect() : null;
  const others = [...document.querySelectorAll('#hlwStage .hlw-chip')].map(c => c.getBoundingClientRect());
  return [...document.querySelectorAll('#hlwStage .hlw-chip')].map((c, i) => {
    const cs = getComputedStyle(c), r = c.getBoundingClientRect();
    return {
      text: c.textContent.trim(), thirst: c.classList.contains('thirst'),
      bg: cs.backgroundColor, color: cs.color, hasDroplet: !!c.querySelector('svg'),
      w: +r.width.toFixed(1), hitsSign: inter(r, sr),
      hitsChip: others.map((o, j) => j === i ? null : inter(r, o)).filter(Boolean),
    };
  });
});
const thirsty = chips.filter(c => c.thirst), timers = chips.filter(c => !c.thirst);
note(chips.length >= 2, `EMPTY SAMPLE: ${chips.length} chips (need a thirsty AND a watered growing bed)`);
note(thirsty.length === 1, `expected exactly 1 thirst chip, got ${thirsty.length}`);
note(timers.every(c => !c.hasDroplet), 'a droplet still renders on a bed that is NOT thirsty');
note(thirsty.every(c => c.hasDroplet), 'the thirsty bed has no droplet');
for (const c of chips) {
  if (c.hitsSign) fail.push(`CHIP "${c.text}" (${c.w}px) overlaps the price sign by ${c.hitsSign.w}x${c.hitsSign.h}`);
  if (c.hitsChip.length) fail.push(`CHIP "${c.text}" overlaps another chip: ${JSON.stringify(c.hitsChip)}`);
}

// ---------- 5. reduced motion: nothing may still be RUNNING ----------
let motion = null;
if (REDUCED) {
  await sleep(900);
  motion = await page.evaluate(() => {
    const all = document.getAnimations().map(a => ({
      name: a.animationName || (a.effect && a.effect.getKeyframes && 'css') || '?',
      state: a.playState,
      iters: a.effect ? a.effect.getTiming().iterations : null,
      target: a.effect && a.effect.target ? (a.effect.target.id || a.effect.target.className.baseVal || a.effect.target.className || a.effect.target.tagName) : null,
    }));
    return { total: all.length, running: all.filter(a => a.state === 'running'), sample: all.slice(0, 24) };
  });
  note(motion.total > 0, 'EMPTY SAMPLE: getAnimations() returned nothing, the check did not run');
  note(motion.running.length === 0, `REDUCED MOTION STILL RUNNING: ${motion.running.length} of ${motion.total} -> ${JSON.stringify(motion.running.slice(0, 6))}`);
}

await sleep(300);
if (OUT) await page.screenshot({ path: `${OUT}/fix-${TAG}.png` });

const res = { TAG, fail, hits, overlaps, foldInfo, chips, motion, pageErrors: errors, consoleErrors: consoleErrs };
if (OUT) fs.writeFileSync(`${OUT}/fix-${TAG}.json`, JSON.stringify(res, null, 1));
note(errors.length === 0, `PAGE ERRORS: ${JSON.stringify(errors.slice(0, 3))}`);
console.log(`\n=== ${TAG} ===`);
console.log(fail.length ? fail.map(f => 'FAIL ' + f).join('\n') : 'ALL PASS');
await browser.close(); srv.close?.();
process.exit(fail.length ? 1 : 0);

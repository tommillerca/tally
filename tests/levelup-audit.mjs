/* THE LEVEL-UP MOMENT ACTUALLY PLAYS, AND SHOWS THE RIGHT NUMBERS.
 *
 * WHY THIS EXISTS. The level-up moment arrived as a three-file PR with no test of
 * its own. Its author verified it thoroughly by hand and caught five real bugs
 * doing so, which is exactly the problem: none of that verification survives the
 * PR. The next person to touch `openLevelUpMoment` inherits the screen with no
 * way to know they broke it.
 *
 * Four of those five bugs were about NUMBERS, not motion, and every one of them
 * would render a perfectly good-looking screen:
 *   - chips read "Lv 9 -> Lv 10" on a jump from level 1 (queueCelebration ate
 *     fromLevel)
 *   - onFoodLogged never reported the level you came from, on the PRIMARY path
 *   - the XP bar read "0 / 310" while the player held 15, because the levelUp
 *     payload is a snapshot taken inside award() at the crossing instant and one
 *     food log grants several chunks after it
 *   - the tall case overflowed the screen by 51-75px
 * So this audit reads the chips and the bar, not just "did a sheet open".
 *
 * The moment is gated on `reducedMotion || navigator.webdriver`, so it cannot run
 * under automation without `window.__motionForce` (the author's seam, the same
 * idiom as __spireForce / __crateForce). With it, webdriver stays true and every
 * first-run takeover stays suppressed on its own, which is why this audit does
 * not have to fight the popup queue.
 *
 * What it locks down:
 *   OPENS     the moment renders at all, with the figure DECODED (a CSS box over
 *             a blank frame passes a position check)
 *   FROM      the chips name the level you actually came FROM, on a multi-level
 *             jump as well as a single one
 *   XP        the bar reads the live carry-over, not the crossing-instant snapshot
 *   FITS      nothing overflows and the CTA is reachable, at the smallest phone
 *             the app supports as well as a normal one
 *   PIX       the reward pills draw the PIXEL art, at a whole step, measured off
 *             the render. Tom, 2026-08-18: "level up screen still doesnt have
 *             the pixel art correct for coins and golden chest". They asked for
 *             15, 15 and 14 against a pixel floor of 16, so all three fell back
 *             to the vector while looking, in the source, exactly like the sites
 *             that did not. A grep cannot tell those apart; this reads the src
 *             and the rendered width off the live element.
 *   EMPTY     an empty sample set is a FAILURE, never a pass
 *
 * Usage: node tests/levelup-audit.mjs        (URL=... for live)
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree} from './godmode.js';

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
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

const close = async () => {
  await page.evaluate(() => {
    const b = document.querySelector('.lu-cta, .lu-wrap .sheet-close, .celebrate .btn');
    if (b) b.click(); else history.back();
  });
  await sleep(500);
};

/* Open the moment directly. There is no hook for it, so drive the same entry the
   app uses: the celebration funnel every level-up passes through. */
const openAt = async (fromLevel, level, into, need) => page.evaluate(async a => {
  window.__motionForce = true;               // the author's seam
  const app = window.__levelUpMoment;
  if (!app) return { err: 'no __levelUpMoment hook' };
  await app({
    levelUp: { level: a.level, into: a.into, need: a.need },
    levelRewards: { coins: 120, crates: [] },
    fromLevel: a.fromLevel, ms: 0, extras: [],
  });
  return { ok: true };
}, { fromLevel, level, into, need });

await sleep(1500);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1800);

/* ---- OPENS ---------------------------------------------------------------- */
const first = await openAt(1, 2, 15, 310);
if (first.err) {
  ok('OPENS the moment could be driven at all', false, first.err);
} else {
  await sleep(900);
  const shown = await page.evaluate(() => {
    const w = document.querySelector('.lu-wrap, .lu-body');
    if (!w) return null;
    const imgs = [...w.querySelectorAll('.lu-avatar img')];
    return {
      title: (document.querySelector('.lu-title')?.textContent || '').trim(),
      layers: imgs.length,
      decoded: imgs.length > 0 && imgs.every(i => i.naturalWidth > 0),
      chips: (document.querySelector('.lu-chips, .lu-levels')?.textContent || '').replace(/\s+/g, ' ').trim(),
      xp: (document.querySelector('.lu-xpnum, .lu-xp')?.textContent || '').replace(/\s+/g, ' ').trim(),
    };
  });
  ok('OPENS the moment renders', !!shown && /level up/i.test(shown.title), JSON.stringify(shown));
  ok('OPENS the figure is DECODED, not an empty stage (a CSS box measures fine over a blank frame)',
    !!shown && shown.layers > 0 && shown.decoded, JSON.stringify({ layers: shown?.layers, decoded: shown?.decoded }));
  ok('XP the bar reads the live carry-over, not the crossing snapshot',
    !!shown && /15/.test(shown.xp) && /310/.test(shown.xp), JSON.stringify(shown?.xp));
  await close();
}

/* ---- FROM: the bug that read "Lv 9 -> Lv 10" on a jump from 1 -------------- */
for (const [from, to] of [[1, 2], [1, 5], [1, 10]]) {
  const r = await openAt(from, to, 40, 500);
  if (r.err) { ok(`FROM ${from} -> ${to}`, false, r.err); continue; }
  await sleep(800);
  const chips = await page.evaluate(() => (document.querySelector('.lu-chips, .lu-levels')?.textContent || '').replace(/\s+/g, ' ').trim());
  ok(`FROM the chips say ${from} -> ${to}, not a level you were never on`,
    new RegExp(`\\b${from}\\b`).test(chips) && new RegExp(`\\b${to}\\b`).test(chips), `chips: "${chips}"`);
  await close();
}

/* ---- PIX: the reward pills draw pixel art, not the vector ------------------ */
const pixOpen = await page.evaluate(async () => {
  window.__motionForce = true;
  await window.__levelUpMoment({
    levelUp: { level: 5, into: 40, need: 500, name: 'Bonepile' },
    levelRewards: { coins: 120, crates: 2, dust: 30, eggs: 1 },
    fromLevel: 4, ms: 0, extras: [],
  });
  return true;
}).catch(e => ({ err: String(e) }));
if (pixOpen && pixOpen.err) {
  ok('PIX the reward row could be driven at all', false, pixOpen.err);
} else {
  await sleep(900);
  const pills = await page.evaluate(() => [...document.querySelectorAll('.lu-rewards .bh-pill')].map(p => {
    const ic = p.querySelector('img, svg');
    const r = ic ? ic.getBoundingClientRect() : null;
    return { label: p.textContent.trim().slice(0, 24),
      tag: ic ? ic.tagName.toLowerCase() : null,
      src: ic && ic.tagName === 'IMG' ? ic.getAttribute('src') : null,
      natural: ic && ic.tagName === 'IMG' ? ic.naturalWidth : 0,
      w: r ? Math.round(r.width) : 0,
      rare: !!(ic && ic.closest('.crate-chip.rare')) };
  }));
  /* An empty row would pass every per-pill assertion below by having nothing to
     assert, which is the exact shape of vacuous green this suite exists against. */
  ok('PIX the reward row rendered pills to grade (an empty sample is a failure)',
    pills.length >= 3, JSON.stringify(pills));
  const want = [/\+120/, /Golden Crate/, /\+30/];
  for (const re of want) {
    const p = pills.find(x => re.test(x.label));
    /* WHOLE STEP, not just "an img". A pixel sprite drawn at 15 or 17 is resampled
       and is the defect this whole 48/24/16 scheme exists to prevent, so the
       rendered width is asserted, not merely the tag. */
    ok(`PIX the ${re.source} pill draws pixel art at a whole step`,
      !!p && p.tag === 'img' && p.natural === 48 && [16, 24, 48].includes(p.w),
      JSON.stringify(p));
  }
  /* At 16px there is one chest drawing, so gold and common would read the same.
     The rarity moved to a glow BEHIND the sprite (app.css .crate-chip.rare). */
  ok('PIX the golden crate still reads as rare, by the glow behind the sprite',
    !!pills.find(x => /Golden Crate/.test(x.label))?.rare,
    JSON.stringify(pills.find(x => /Golden Crate/.test(x.label))));
  await close();
}

/* ---- FITS: the smallest phone the app supports ----------------------------- */
for (const [w, h] of [[393, 852], [375, 667]]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const r = await openAt(1, 25, 40, 500);
  if (r.err) { ok(`FITS ${w}x${h}`, false, r.err); continue; }
  await sleep(900);
  const fit = await page.evaluate(() => {
    const body = document.querySelector('.lu-wrap, .lu-body');
    const cta = document.querySelector('.lu-cta, .celebrate .btn');
    if (!body) return null;
    const b = body.getBoundingClientRect();
    const c = cta ? cta.getBoundingClientRect() : null;
    return {
      overflowPx: Math.max(0, Math.round(b.bottom - window.innerHeight), Math.round(-b.top)),
      ctaVisible: !!c && c.bottom <= window.innerHeight + 1 && c.top >= -1 && c.height > 0,
      scrollable: body.scrollHeight > body.clientHeight + 1,
    };
  });
  ok(`FITS ${w}x${h}: nothing overflows and the CTA is reachable`,
    !!fit && (fit.overflowPx === 0 || fit.scrollable) && fit.ctaVisible, JSON.stringify(fit));
  await close();
}

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(failed ? 'LEVEL UP AUDIT FAILED' : 'LEVEL UP VERIFIED');
process.exit(failed ? 1 : 0);

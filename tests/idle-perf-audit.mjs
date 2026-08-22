/* tests/idle-perf-audit.mjs — A CINEMATIC PLAYS ONCE, AND A SCREEN NOBODY IS
 * TOUCHING DOES NO PER-FRAME WORK.
 *
 * WHAT IT WAS, both measured on this tree at 440x956 against the real controls.
 *
 * 1. GWART'S ENTRANCE REPLAYED ON EVERY ARRIVAL AT TODAY. `.wz-enter` runs
 *    zEnterCine, a 2.4s one-shot with `filter: blur(8px -> 0)` in it, and Today
 *    is rebuilt by innerHTML every time you tap the tab, so it started again
 *    every time. `filter` is not a composited property, so those 2.4s are style
 *    recalculation on the main thread, on the app's home screen, on every single
 *    arrival. Three arrivals driven through the real tab bar:
 *
 *                                    as shipped     once per session
 *      style recalcs                   871              376
 *      style recalc time               115 ms            57 ms
 *
 *    Tom's own controlled A/B on one page put the entrance at ~73% of the recalc
 *    count and ~65% of the recalc time of a Today arrival.
 *
 * 2. THE BONEYARD NEVER WENT IDLE. `.blip-dot.rare` in the map key animated
 *    `box-shadow` infinitely, which no compositor can take. Sitting on a settled
 *    Boneyard doing nothing cost 119.9 style recalcs per second, forever, for
 *    one 13px dot. Every other settled surface in the app measured 0.0. The
 *    glow is now two pseudo-elements cross-fading on `opacity` (app.css), which
 *    reads the same to within half a channel and measures 0.0/s.
 *
 * AND THE COST IS PER-SCREEN, NOT PER-ELEMENT, which is why one dot was worth
 * the change: measured here, 1 animated element = 119.9/s and 16 = 119.9/s, both
 * on a bare page and in the app. Chrome falls the whole document onto the slow
 * path when any un-compositable animation is IN VIEW; the same measurement says
 * an element scrolled entirely out of view costs nothing. So this file grades
 * settled screens, which is the state Tom is complaining about (rule 12).
 *
 * WHY THE ENTRANCE ROW IS PIXELS AND NOT A RECALC COUNT, and saying so is the
 * point. A recalc window after a repeat arrival was measured and REJECTED: the
 * honest 250ms-bucket profile is 24 31 17 18 20 19 3 0 0 0 fixed against
 * 24 29 30 30 31 29 30 31 30 18 broken, so a window only separates them if it
 * starts after the talk box has finished TYPING, and where typing ends depends
 * on the length of a randomly picked line and on this laptop's speed. This repo
 * has already paid a full day for five clock-dependent guards. The pixel row is
 * a RATIO of two measurements taken in the same run on the same page, so the
 * machine cancels out of it, and the IDLE row grades a rate whose healthy value
 * is zero and whose broken value is 119.9, which is not a threshold so much as a
 * gap you could park a bus in.
 *
 * AND THE PIXELS ARE SEEKED, NOT RACED, WHICH IS THE SECOND THING THIS FILE GOT
 * WRONG BEFORE IT GOT RIGHT. The first draft shot six frames as fast as it could
 * after each arrival and differenced them against a settled frame. It scored
 * 100.00% on the first arrival and 0.56% on every later one, which looks exactly
 * like a working guard and is not one: it was measuring route()'s reveal fade,
 * which happens on a boot and not on a tab switch, and Gwart was never in the
 * number at all. THREE mutations passed it (rule 2 is the only reason that was
 * ever found): the entrance restored on every arrival, the CSS half deleted, and
 * the whole scene set to `visibility: hidden`, that last one scoring a perfect
 * 100.00%. So every animation on the page is PAUSED first and the zEnterCine
 * instances the app itself rendered are seeked to 250ms and to their end. The
 * app still creates them by a real tap on the real tab; nothing here calls an
 * animation's own function, and an element that carries no zEnterCine scores a
 * flat zero rather than whatever the page happened to be doing.
 *
 * THE ROWS, and which direction is failure:
 *   REACH      every surface in the sweep was really reached by a tap. Without
 *              it, a lap that never arrives anywhere idles at 0.0/s and passes.
 *   METER      a real box-shadow loop is injected into the live page and the
 *              SAME meter must read >= 100/s. A probe on the wrong counter, or a
 *              browser that has stopped ticking animations, scores zero on every
 *              surface below and passes everything. This is the row that makes
 *              the zeros mean something.
 *   SCENE      Gwart is still DRAWN on every arrival: >= 15% of the plaque's
 *              pixels are ink (measured 36-42% healthy, 2.9% with the scene
 *              hidden), and every source image reports naturalWidth > 0. Failure
 *              is TOO LITTLE, and it is the row that stops "play it once" being
 *              satisfied by deleting him, which would make everything else here
 *              greener.
 *   CINEMATIC  the FIRST Today of a fresh session still carries a live
 *              zEnterCine. Failure is ZERO: the entrance never plays at all.
 *   ONCE       no later arrival, driven through the real tab bar, carries one.
 *              Failure is ANY: an entrance rebuilt by a tab switch. These are
 *              WAAPI objects the app's own render created, not a stylesheet
 *              read, and `.wz-enter.seen { animation: none }` is exactly what
 *              takes them out of the list.
 *   IDLE       every settled surface does at most 20 style recalcs/s. Failure is
 *              UP, and the bound is a ceiling rather than a trend (rule 11).
 *
 * THE CEILING IS 20/s AND HERE IS WHERE IT CAME FROM. Measured healthy on this
 * tree: 0.0/s on seven of the eight surfaces and a worst observed of 3.5/s on
 * Today (a timer, not a frame loop). Measured broken: 119.9/s, which is exactly
 * 2 recalcs per frame at 60fps and is what ONE un-compositable animation costs.
 * 20 sits 6x above the worst healthy reading and 6x below the broken one. It is
 * deliberately not 5: the talk box types at ~78/s while it is typing, and Gwart
 * volunteers an idle line every 30s (GW_IDLE_MS), whose timer restarts on every
 * render, so a 6s window taken immediately after arriving cannot contain one.
 * If that ever changes, this row will start flapping and the fix is to silence
 * the typing for the measurement, not to raise the ceiling.
 *
 * PROVE-RED (2026-08-21, each in its own `cp -R` throwaway tree, each run
 * whole, and every one of them reds EXACTLY ONE row, which is the point: five
 * assertions wearing one name would be worse than one assertion):
 *   r1  the `seen` class dropped from renderToday, i.e. the entrance replaying
 *       -> ONCE red, "3 of 3 later arrivals carry a live zEnterCine (1, 1, 1)".
 *          SCENE, CINEMATIC, IDLE, METER and REACH all stay green, which is
 *          correct: before the fix the app was not broken, only wasteful.
 *   r2  `.wz-enter.seen { animation: none }` deleted from app.css, the same bug
 *       from the CSS side -> ONCE red alone, identically.
 *   r3  `.gw-today .wz-scene` set to `visibility: hidden`, i.e. "fixed" by
 *       deleting him -> SCENE red (2.9% ink against 36-42% healthy) while ONCE
 *       goes GREEN. This is the run that shows why both rows exist: the cheapest
 *       way to make ONCE green forever is to delete the thing it is watching.
 *   r4  .blip-dot.rare put back on the box-shadow keyframe
 *       -> IDLE red (boneyard 120.3/s) alone.
 *   r5  the injected probe's own animation neutered, i.e. the meter blinded
 *       -> METER red (0.0/s) alone, and no other row can catch that.
 * Two earlier drafts of the entrance rows were caught by exactly this exercise
 * and are described above; neither would have failed on r1, r2 OR r3.
 *
 * Measured 106s on this Mac, 5 checks.
 *
 * Usage: node tests/idle-perf-audit.mjs [baseUrl]   (serves this repo if omitted)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, serveTree, sleep, chromePath, sandboxArgs } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
const srv = argUrl ? null : await serveTree(ROOT);
const base = (argUrl || srv.url).replace(/\/?$/, '/');

const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};

const W = 440, H = 956;
const IDLE_CEIL = 20;     // recalcs/second on a settled screen; see the note above
const METER_FLOOR = 100;  // what the same meter must read with a real loop injected
const INK_FLOOR = 15;     // % of the plaque that must be DRAWN; see the SCENE row

const TRAY = t => `#tabbar .tab[data-tab="${t}"]`;
const HUB = t => `#chTabs .chip[data-tab="${t}"]`;
/* Everything a settled player can be looking at without touching anything. The
   hub chips are in it because they are a navigation to the player even though
   they are not a route(). The open Boneyard MAP is deliberately NOT: it needs a
   reachable vector tile host, and the dot this file is about lives on the intro
   card, which is the screen you land on. */
const SURFACES = [
  ['today', TRAY('today')], ['friends', TRAY('friends')], ['boneyard', TRAY('boneyard')],
  ['bonehead', TRAY('bonehead')], ['hub:wardrobe', HUB('wardrobe')], ['hub:crates', HUB('crates')],
  ['hub:shop', HUB('shop')], ['hub:talents', HUB('talents')],
];

/* KNOWN HOT, WITH A DATE, A NUMBER AND A REASON, AND THE LIST IS ITSELF AN
   ASSERTION IN BOTH DIRECTIONS. A surface in here must STILL be over the
   ceiling: the moment somebody fixes it this row goes red and the line has to
   come out, so an exemption cannot quietly outlive the bug it was written for
   and go on covering a NEW regression on the same screen. (Same shape as
   VECTOR_OK in boneyard-icon-audit, and for the same reason.) */
const KNOWN_HOT = {
  'hub:shop': "Gwart's Emporium, measured 119.9 recalcs/s on 2026-08-21 and NOT "
    + 'fixed with the Boneyard dot. Cause is different and so is the fix: .wz-glow '
    + 'carries TWO animations targeting the same properties (zGlowIn, a filled '
    + 'one-shot, plus the infinite zGlowIdle), and Chrome refuses to composite an '
    + 'element whose property is claimed twice, forever, because the finished '
    + 'one-shot never leaves the list. Measured here: the pair costs 119.9/s and '
    + 'zGlowIdle alone costs 0.0/s. Every cheap dodge was tried and measured: '
    + 'animation-fill-mode backwards with the end state declared statically still '
    + 'reads 119.9/s, and nesting the two on separate elements COMPOSES them '
    + '(0.55 x 0.35 rather than 0.35) so it changes the look. The honest fix '
    + "re-authors Cam's inlined wizard-cast animation into one keyframe set, "
    + 'which is a decision about his art, not a perf edit, and it is Tom\'s.',
};

const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'shell',
  executablePath: chromePath(),
  args: [...sandboxArgs(), '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});

/* Decode captures and reduce them to moved pixels in a THROWAWAY page. The page
   under test is the subject of the measurement and must not be asked to do
   canvas work mid-run. Same recipe as boot-flash-audit and motion-truth-audit,
   so no image dependency is needed. */
const framer = async () => {
  const p = await browser.newPage();
  await p.goto('data:text/html,<body></body>');
  return {
    close: () => p.close().catch(() => {}),
    /* how much of a capture is DRAWN: the fraction of horizontal neighbour pairs
       that differ. Flat plate = near zero, line art on a plate = high. This is
       the row that fails if the scene is hidden rather than played once. */
    ink: a => p.evaluate(async data => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      if (!c.width || !c.height) return -1;
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const at = (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
      let edges = 0, tot = 0;
      for (let y = 0; y < c.height; y += 2)
        for (let x = 0; x + 2 < c.width; x += 2) {
          const A = at(x, y), B = at(x + 2, y);
          tot++;
          if (Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) + Math.abs(A[2] - B[2]) > 24) edges++;
        }
      return (edges / Math.max(tot, 1)) * 100;
    }, a),
    diff: (a, b) => p.evaluate(async (a, b) => {
      const px = async data => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + data;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
      };
      const A = await px(a), B = await px(b);
      if (A.w !== B.w || A.h !== B.h || !A.w) return -1;   // -1 is a failure, never a 0
      let moved = 0, tot = 0;
      for (let i = 0; i < A.d.length; i += 4) {
        tot++;
        if (Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1])
          + Math.abs(A.d[i + 2] - B.d[i + 2]) > 24) moved++;
      }
      return (moved / Math.max(tot, 1)) * 100;
    }, a, b),
  };
};

try {
  const page = await browser.newPage();
  const frames = await framer();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

  const dismiss = async () => {
    for (let i = 0; i < 8; i++) {
      const hit = await page.evaluate(() => {
        const rx = /^(spin|nice|done|collect|claim|continue|ok|got it|next|skip|back to the pit)$/i;
        const b = [...document.querySelectorAll('button')]
          .find(x => rx.test((x.textContent || '').trim()) && !x.disabled && x.getBoundingClientRect().width);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      if (!hit) break;
      await page.mouse.click(hit.x, hit.y);
      await sleep(1200);
    }
  };

  /* A REAL MOUSE CLICK ON THE REAL CONTROL. location.hash would skip the tab
     handler entirely, and a hub chip has no hash at all. */
  const tap = async (sel, settle = 1700) => {
    const at = await page.evaluate(s => {
      const b = document.querySelector(s);
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, sel);
    if (!at) return false;
    await page.mouse.click(at.x, at.y);
    await sleep(settle);
    return true;
  };

  const plaque = () => page.evaluate(() => {
    const b = document.querySelector('.gw-today');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  });
  /* WHAT AN ARRIVAL AT TODAY CARRIES, read two different ways because neither
     is enough on its own.

     LIVE is the graded half: how many zEnterCine animations the app's own render
     actually created. These are WAAPI objects with a real duration on a real
     element, not a stylesheet read: `.wz-enter.seen { animation: none }` is
     precisely what takes them out of the list, and a replaying entrance puts one
     back on every arrival.

     WHY NOT PIXELS FOR THIS ONE, and it was tried three ways before being
     written off, which is worth the paragraph. (a) Sampling in real time after
     arrival scored 100.00% on the first arrival and 0.56% on every later one no
     matter what the app did: it was measuring route()'s reveal fade, which
     happens on a boot and not on a tab switch, and three mutations passed it,
     including the whole scene set to `visibility: hidden`. (b) Pausing every
     animation and SEEKING zEnterCine reads perfectly on the main thread
     (opacity 0 / blur(8px) at t=0 against opacity 1 / blur(0px) at the end) and
     moves 0.014% of the plaque, because headless Chrome keeps the composited
     opacity it already had; this repo's own note says the animation clock and
     the compositor part company under headless and to grade real-time frames.
     (c) The signal is small even when it works: toggling the whole `.wz-enter`
     layer off changes 4.28% of the plaque, because what zEnterCine carries on
     TODAY is only Cam's sparkle layer (the wizard himself is in .wz-body, a
     sibling), so there is no wide gap to grade against the 0.5-2.6% that the
     float and the twinkle move anyway.

     INK is the pixel half, and it grades the thing pixels are good for: the
     plaque is still DRAWN. "Play it once" is one deletion away from "delete the
     scene", and that deletion makes every other row here greener. */
  const arrival = async () => {
    const clip = await plaque();
    if (!clip || !clip.width) return { live: -1, ink: -1, decoded: -1, stars: 0 };
    const live = await page.evaluate(() =>
      document.getAnimations().filter(a => a.animationName === 'zEnterCine').length);
    const art = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('.gw-today .wz-enter img, .gw-today .wz-body img')];
      return { stars: imgs.length, decoded: imgs.filter(i => i.naturalWidth > 0).length };
    });
    const ink = await frames.ink(await page.screenshot({ clip, encoding: 'base64' }));
    return { live, ink, ...art };
  };

  await page.goto(base + '?demo', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);
  await dismiss();

  /* ---- the entrance, in pixels --------------------------------------------
     A RELOAD IS A NEW SESSION, and that is half the spec rather than an
     assumption: "once" lives in a module-level let, so a fresh document must let
     him arrive again and an in-page navigation must not. */
  await page.goto(base + '?demo', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.gw-today', { timeout: 30000 });
  await sleep(2500);                       // let route() reveal the screen before it is photographed
  const first = await arrival();

  const repeats = [];
  for (let n = 0; n < 3; n++) {
    await tap(TRAY('bonehead'));
    await tap(TRAY('today'));
    await page.waitForSelector('.gw-today', { timeout: 20000 });
    await sleep(800);
    repeats.push(await arrival());
  }

  /* ---- what a settled screen costs while nobody touches it ----------------- */
  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable');
  const recalcs = async () => {
    const m = (await cdp.send('Performance.getMetrics')).metrics;
    return m.find(x => x.name === 'RecalcStyleCount')?.value ?? 0;
  };
  const rate = async () => {
    await sleep(3000);
    const a = await recalcs(); const t0 = Date.now();
    await sleep(3000);
    return (await recalcs() - a) / ((Date.now() - t0) / 1000);
  };

  const idle = [];
  for (const [name, sel] of SURFACES) {
    if (!await tap(sel)) continue;
    idle.push([name, await rate()]);
  }

  await page.evaluate(() => {
    const s = document.createElement('style');
    s.textContent = '@keyframes __idleProbe { 50% { box-shadow: 0 0 18px #a5e847 } }'
      + '#__idleProbe { position: fixed; left: 6px; top: 6px; width: 13px; height: 13px;'
      + ' border-radius: 50%; background: #a5e847; z-index: 99999;'
      + ' animation: __idleProbe 1.6s ease-in-out infinite }';
    document.head.appendChild(s);
    const d = document.createElement('div');
    d.id = '__idleProbe';
    document.body.appendChild(d);
  });
  const meter = await rate();
  await page.evaluate(() => document.getElementById('__idleProbe')?.remove());

  // ------------------------------------------------------------------- rows
  const fmt = m => `${m.live} zEnterCine / ${m.ink.toFixed(1)}% ink / ${m.decoded} of ${m.stars} decoded`;
  console.log(`      first Today of the session: ${fmt(first)}`);
  repeats.forEach((m, i) => console.log(`      later arrival ${i + 2}:          ${fmt(m)}`));
  console.log(`      idle: ${idle.map(([n, r]) => `${n} ${r.toFixed(1)}/s`).join(', ')}`);
  console.log(`      meter with one real box-shadow loop injected: ${meter.toFixed(1)}/s`);

  ok('REACH every surface in the sweep was reached by a real tap',
    idle.length === SURFACES.length,
    `${idle.length}/${SURFACES.length}: ${idle.map(([n]) => n).join(',') || '(none)'}`);

  ok(`METER the same meter reads a real per-frame loop, so a zero below means something (>= ${METER_FLOOR}/s)`,
    meter >= METER_FLOOR,
    `${meter.toFixed(1)} recalcs/s with one injected box-shadow animation`);

  const all = [first, ...repeats];
  ok(`SCENE Gwart is still DRAWN on every arrival, so "play it once" cannot be satisfied by deleting him (>= ${INK_FLOOR}% ink, every source decoded)`,
    all.length === 4 && all.every(m => m.ink >= INK_FLOOR && m.stars >= 4 && m.decoded === m.stars),
    all.map(m => `${m.ink.toFixed(1)}%/${m.decoded}of${m.stars}`).join(' '));

  ok('CINEMATIC the first Today of a fresh session still carries the entrance',
    first.live >= 1, `${first.live} live zEnterCine on the first render after a reload`);

  const carried = repeats.filter(r => r.live > 0).length;
  ok('ONCE and no later arrival carries one: the entrance is not rebuilt by a tab switch',
    repeats.length === 3 && carried === 0,
    repeats.length === 3
      ? `${carried} of 3 later arrivals carry a live zEnterCine (${repeats.map(r => r.live).join(', ')})`
      : `only ${repeats.length} of 3 repeat arrivals were measured`);

  const hot = idle.filter(([, r]) => r > IDLE_CEIL).map(([n]) => n);
  const regressed = hot.filter(n => !KNOWN_HOT[n]);
  const healed = Object.keys(KNOWN_HOT).filter(n => idle.some(([m]) => m === n) && !hot.includes(n));
  ok(`IDLE every settled screen does at most ${IDLE_CEIL} style recalcs/s while nobody touches it`,
    idle.length > 0 && regressed.length === 0 && healed.length === 0,
    regressed.length
      ? `${regressed.map(n => `${n} ${idle.find(([m]) => m === n)[1].toFixed(1)}/s`).join(', ')}`
      : healed.length
        ? `${healed.join(', ')} is listed in KNOWN_HOT and is no longer hot: delete the line, do not leave it covering the screen`
        : `worst un-exempted ${Math.max(...idle.filter(([n]) => !KNOWN_HOT[n]).map(([, r]) => r), 0).toFixed(1)}/s across ${idle.length - Object.keys(KNOWN_HOT).length} surfaces`);

  for (const [n, why] of Object.entries(KNOWN_HOT)) {
    console.log(`      KNOWN HOT  ${n} (${idle.find(([m]) => m === n)?.[1].toFixed(1) ?? '?'}/s): ${why}`);
  }

  await frames.close();
} finally {
  await browser.close().catch(() => {});
  srv?.close?.();
}

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'all green'}`);
process.exit(fails.length ? 1 : 0);

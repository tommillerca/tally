/* MOTION TRUTH: a surface that is said to move must move IN THE APP, in pixels,
 * and every motion claim must also state what the OTHER half of the players see.
 *
 * WHY THIS EXISTS, verbatim. Tom, 2026-08-21: "im also seeing in the ios
 * simulator that the hype banners you made before had moving components to them?
 * just so you know that NEVER showed on the live app it was always a static grid.
 * you need to figure out why that happened in the past so it doesnt in the
 * future again." Same shape as the overscroll wordmark the same day: something
 * was built, shown moving, called done, and was never moving where he was.
 *
 * WHAT WAS ACTUALLY WRONG, and it is not what it looks like. The animation was
 * never missing. Measured on the LIVE site (tommillerca.github.io/tally) on
 * 2026-08-21, the cosmetics drop banner's heads move 29% of their pixels and the
 * teaser reel moves 30-51% of its own. The CSS shipped, the JS shipped, the
 * service worker served it. There is exactly ONE state in which those surfaces
 * are a permanently static grid, and it is `prefers-reduced-motion: reduce`:
 *
 *   1. app.css's global reduce block sets animation-iteration-count 1,
 *      animation-duration 0.001s and animation-delay 0, with !important, on
 *      `*`. Every looping CSS animation in the app runs one instant cycle and is
 *      then GONE: getAnimations() returns 0, not "paused".
 *   2. js/app.js's drop reel is gated `if (reel && spot && !reducedMotion)`, so
 *      under reduce the driver never runs, #tzReel never gets a beat class, and
 *      the element sits on the bare `.tz-wall` grid. Not a designed still frame:
 *      the FIRST beat, forever. Literally "a static grid".
 *
 * Both are defensible behaviour. Neither was ever verified, and nobody said out
 * loud that a player with Reduce Motion on sees a still picture, so every review
 * happened in the one state where it moved. That is the bug this file is against:
 * not the CSS, the VERIFICATION. Measured here, both states, every run:
 *
 *                                    motion on      under reduce
 *   #tzWall  (36 bobbing heads)         49.6 %           0.000 %
 *   #tzReel  (grid->solo->quad)         29.9 %           0.000 %
 *   .hype    (declared STATIC)          0.000 %          0.000 %
 *
 * The gap has no overlap in either direction, so MOVE_FLOOR = 3% is not a knife
 * edge, and a surface declared still reads EXACTLY zero rather than "small".
 *
 * HOW IT IS GRADED, and why not getComputedStyle. tally/CLAUDE.md and
 * paddock-scene-audit's ALIVE rows: headless Chrome keeps compositing while the
 * MAIN-THREAD animation clock freezes, so a computed `animation-name` and a
 * getBoundingClientRect can both read a frozen identity on motion a player
 * plainly sees, and the reverse. So every row here is decoded PIXELS, counted
 * as the fraction of the surface that changed by more than 24 (sum of RGB
 * deltas) between the first sampled frame and any later one. Decoding happens
 * in a THROWAWAY page, the boot-flash-audit recipe, so no image dependency.
 *
 * THE ROWS, per registered surface:
 *   REACH     the surface is on screen at a real size. Without it every number
 *             below is about an element that was not there.
 *   MOVES     with motion allowed, it changes more than MOVE_FLOOR of itself.
 *   STILL     a surface declared STATIC changes EXACTLY zero with motion
 *             ALLOWED. This is the instrument's negative control: if the
 *             measurement counted compositor noise as movement, this row is the
 *             one that goes red, and MOVES would then mean nothing.
 *   REDUCE    with prefers-reduced-motion emulated, the surface is EXACTLY
 *             still. Two jobs: it is the app's accessibility contract, and it
 *             puts the second shipped state in the gate log next to the first,
 *             so nobody can report "it moves" again without having seen the
 *             number for the players it does not move for.
 *   BEATS     the reel is JS-driven and swaps CONTENT, not just arrangement, so
 *             its beat class must be observed to CHANGE across the window. A
 *             pixel delta alone could be satisfied by the bobbing heads behind
 *             it while the reel itself was dead, which is exactly the state
 *             reduce leaves it in.
 * plus one that is about the NEXT banner rather than these:
 *   COVERAGE  every promo banner on Today carrying a running animation is in
 *             the REGISTER. A new banner that moves and is not declared here
 *             fails by name. This is the only row that makes the class
 *             impossible rather than this instance.
 *
 * prefers-reduced-motion is emulated BEFORE the first navigation on purpose:
 * js/fx.js reads it ONCE at module import (`export const reducedMotion = ...`),
 * so a page that flips it later measures the wrong app.
 *
 * PROVE-RED, all five run on this tree:
 *   MOVES     `.tz-head-in .bh-anim { animation: none !important; }` in app.css
 *   BEATS     drop `!reducedMotion` from the reel gate's inverse, or pause the
 *             stepper; simplest is to make TZ_BEATS a single beat
 *   STILL     give `.hype` any looping animation
 *   COVERAGE  give `.hype` a looping animation and leave it unregistered
 *   REDUCE    a plain looping animation is NOT enough here: app.css's global
 *             reduce block kills it, which is the behaviour this row asserts. It
 *             needs one that SURVIVES reduce, so add both of these to app.css:
 *               @keyframes hypeWob { 50% { transform: translateX(7px); } }
 *               .hype { animation: hypeWob 1s linear infinite; }
 *               @media (prefers-reduced-motion: reduce) { .hype {
 *                 animation-duration: 1s !important;
 *                 animation-iteration-count: infinite !important; } }
 *             Ran on a throwaway tree 2026-08-27, on this exact file: REDUCE
 *             hype-banner peak 28.838% against a bound of 0, red, and STILL went
 *             red the same run at 30.481%. That run ALSO discarded a sample to
 *             the toast and still came back red, which is the thing worth
 *             knowing: the two preconditions below reject a corrupt sample
 *             without swallowing a real one.
 * THE PRECONDITIONS HAVE CONTROLS OF THEIR OWN, both printed on a normal run:
 *   overlay   `NOTE sample of .hype discarded: [toast] was over the clip`. Seen
 *             on 4 of 8 runs on 2026-08-27, each reading 0.000% on the retake.
 *   blank     `MEAN_DEBUG=1` prints every capture's std. 251 captures over 3
 *             runs: 63 rejected, all at 1.21 or 2.67; 188 accepted, 27.19 up.
 *   A run that prints neither never exercised either.
 *
 * Usage: node tests/motion-truth-audit.mjs [baseUrl]   (serves this repo if omitted)
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
  if (!pass) fails.push(name);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

/* Measured on this tree; see the header table. Moving surfaces score 29-51 and
   still ones score 0.000, so this sits in the middle of an empty gap. */
const MOVE_FLOOR = 3.0;
/* EXACTLY zero, not "under a small number". A still surface here has never once
   scored above 0.000 in any run, at either viewport, in either motion state, so
   a tolerance would only ever hide a real regression. */
const STILL_MAX = 0;

/* THE REGISTER. One row per surface anyone has claimed moves, plus the ones
   claimed still. `reach` leaves the app with the surface on screen. A new
   animated banner on Today that is not in here fails COVERAGE by name. */
const REGISTER = [
  {
    key: 'drop-wall',
    what: 'the cosmetics drop wall: 36 heads, each bobbing on bh-idle',
    sel: '#tzWall',
    moves: true,
    /* The heads bob at 3.4s, so a 2.4s window always contains most of a cycle.
       Short ALSO because of quietOn below: it has to fit inside one beat. */
    windowMs: 2400,
    /* WITHOUT THIS THE ROW WAS A LIE, and the prove-red is what said so. The
       wall lives INSIDE #tzReel, and the reel drops it to opacity .12 and
       scale .96 on every solo and quad beat. So `#tzWall` changing pixels was
       being satisfied by the reel's own crossfade: with
       `.tz-head-in .bh-anim { animation: none !important }` in app.css, every
       head frozen solid, this row still read 44.276% and PASSED. A guard that
       passes on the exact bug it names is worse than none.
       quietOn holds the sample inside the GRID beat, where the wall is at
       opacity 1 and scale 1 and the only thing that can move is the art. The
       beat class is recorded across the window and the sample is thrown away
       and retaken if it changed, so a beat boundary landing mid-window cannot
       be mistaken for a bobbing head. */
    quietOn: { sel: '#tzReel', cls: 'tz-s-grid' },
    reach: async page => page.evaluate(() => { window.__cosmeticTeaser?.(); }),
  },
  {
    key: 'drop-reel',
    what: 'the drop reel: grid -> solo -> quad, driven from JS because each beat swaps WHICH items are on screen',
    sel: '#tzReel',
    moves: true,
    beats: true,
    /* TZ_BEATS is 5.2 + 3.6 + 3.6 + 5.6s. 8s guarantees at least one beat
       CHANGE from any starting point in the loop, which is what BEATS needs. */
    windowMs: 8000,
    reach: async page => page.evaluate(() => { window.__cosmeticTeaser?.(); }),
  },
  {
    key: 'hype-banner',
    what: 'the Today hype banner, declared STATIC: bold art and ten words, no motion anywhere in it',
    sel: '.hype',
    moves: false,
    windowMs: 3000,
    /* BACK OUT OF THE TEASER FIRST. The two rows above leave a sheet over the
       whole screen, and a clip is a RECTANGLE: with the popup still up, this row
       measured the reel through .hype's coordinates and reported 29.259% on a
       banner with no animation in it. The STILL row caught it, which is the
       entire reason a still control is in the register. */
    reach: async page => {
      for (let i = 0; i < 4 && await page.evaluate(() => !!document.querySelector('#sheets > *')); i++) {
        await page.evaluate(() => history.back());
        await sleep(700);
      }
    },
  },
];

/* Which surfaces COVERAGE polices. The promo banners on Today and nothing else:
   the hero card's bonehead and its pet are ambient furniture, not an
   announcement, and sweeping them in would make this row noise. */
const TODAY_BANNERS = '#screen .glutton-banner, #screen .hype, #screen .race-banner, #screen .rr-banner';

const puppeteer = await loadPuppeteer();

/* Decode and compare in a throwaway page, never in the page under test: that one
   is the subject of the measurement. Same canvas approach boot-flash-audit and
   crate-exit-flicker-audit use, so this needs no image library. */
const diffPage = async browser => {
  const p = await browser.newPage();
  await p.goto('data:text/html,<body></body>');
  return {
    close: () => p.close().catch(() => {}),
    /* percentage of pixels whose summed RGB delta exceeds 24. 24 is the same
       threshold boot-flash-audit's edge detector uses; a compositor that
       re-encodes an unchanged frame scores 0.000 through it, which is what the
       STILL rows prove on every run. */
    /* How much STRUCTURE one frame has: the standard deviation of per-pixel
       brightness. Used only to tell a REAL capture from an UNPAINTED one, and
       it replaces mean brightness, which could not. Same canvas, no image
       library. See BLANK_STD. */
    spread: a => p.evaluate(async A => {
      const i = new Image(); i.src = 'data:image/png;base64,' + A; await i.decode();
      const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(i, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let s = 0, s2 = 0; const n = d.length / 4;
      for (let k = 0; k < d.length; k += 4) { const v = (d[k] + d[k + 1] + d[k + 2]) / 3; s += v; s2 += v * v; }
      return Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
    }, a),
    diff: (a, b) => p.evaluate(async (A, B) => {
      const load = async s => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; };
      const [ia, ib] = [await load(A), await load(B)];
      if (ia.width !== ib.width || ia.height !== ib.height) return 100;
      const c = document.createElement('canvas');
      c.width = ia.width; c.height = ia.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(ia, 0, 0);
      const da = g.getImageData(0, 0, c.width, c.height).data;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(ib, 0, 0);
      const db = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < da.length; i += 4)
        if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) n++;
      return (n / (c.width * c.height)) * 100;
    }, a, b),
  };
};

/* The clip is re-read AFTER the scroll settles, not before it: a rect taken
   mid-scroll clips the wrong rectangle and every later frame differs from the
   first for a reason that is not motion.
   AND THE CLIP IS HIT-TESTED. A screenshot clip is a rectangle in viewport
   coordinates and knows nothing about what is drawn over it: with a sheet up,
   .hype's rectangle showed the reel and this file reported 29.259% motion on a
   banner that has none. So the element must be the thing actually painted at its
   own centre, or the row reports `covered` and REACH goes red. */
const clipOf = async (page, sel, W, H) => {
  await page.evaluate(s => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel);
  await sleep(700);
  return page.evaluate((s, w, h) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    if (b.width < 8 || b.height < 8) return null;
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    if (!hit || !(e.contains(hit) || hit.contains(e))) return { covered: (hit && hit.className) || 'nothing' };
    const x = Math.max(0, Math.round(b.x)), y = Math.max(0, Math.round(b.y));
    return { x, y, width: Math.min(w - x, Math.round(b.width)), height: Math.min(h - y, Math.round(b.height)) };
  }, sel, W, H);
};

/* AND THE HIT TEST HAS TO HOLD FOR THE WHOLE WINDOW, not just at reach. The
   centre test in clipOf runs ONCE, BEFORE the sample, and it only tests ONE
   point, so it is blind to an overlay that arrives DURING the window or covers
   an edge. Measured 2026-08-27 on b45a8b0d: the REDUCE hype-banner row read
   peak 9.320% on a banner with no animation in it and getAnimations() === 0.
   The changed pixels were the bottom 27 rows of the clip, full width, and they
   changed once and stayed changed. It was `#toast`. The boot toast queue in
   ?demo runs for 22 seconds (measured: 6 messages, 0.0s to 22.0s), `.toast` is
   `position: fixed; bottom: calc(var(--sab) + 96px)`, and a TWO-LINE toast
   occupies y 772-836 at this 932px viewport while .hype sits at y 626-794. So a
   two-line toast overlaps the banner's last 22px. The banner's centre is y 710
   and is never covered, which is exactly why clipOf's one point saw nothing.
   WHY IT WENT RED ON 2026-08-27 AND NOT BEFORE, and it is not the app: measured
   on both trees, the banner's rect (626-794) and the toast timeline (0.0-22.0s)
   are IDENTICAL at v456 (d748ff69) and at b45a8b0d. What moved is when THIS FILE
   takes the sample. Under MEAN_DEBUG, the REDUCE pass at v456 took 39 captures
   of which 12 were blank (31%), and every blank costs a retry plus a backing-off
   sleep; at b45a8b0d it took 27 captures with 0 blanks. Those retries were
   spending 13 seconds, so v456 sampled .hype at +35.5s, safely past the toasts,
   and b45a8b0d samples it at +22.1s, on top of the last one. v456 was green
   because the CAMERA WAS BLINKING. A guard whose pass depends on how many frames
   the compositor dropped is not a guard, so the fix is the missing precondition
   and not the bound: nothing foreign may be painted over the clip AT ANY POINT
   of the sample, and a sample taken while something was is thrown away and
   retaken, the same way sampleQuiet throws away a sample taken across a beat.
   Nine points, not one: an overlay is a rectangle and can take an edge. */
const foreignOver = (page, sel, clip) => page.evaluate((s, c) => {
  const e = document.querySelector(s);
  if (!e) return 'gone';
  for (const fx of [0.04, 0.5, 0.96]) for (const fy of [0.04, 0.5, 0.96]) {
    const hit = document.elementFromPoint(c.x + c.width * fx, c.y + c.height * fy);
    if (hit && !(e.contains(hit) || hit.contains(e))) return hit.id || hit.className || hit.tagName;
  }
  return null;
}, sel, clip);

/* Sample a surface across its window and return the LARGEST change seen against
   the first frame. Peak, not mean: a loop spends part of every cycle back where
   it started, so a mean would punish a slow animation for being slow. */
/* A BLANK FRAME IS NOT A SAMPLE. Under headless 'shell', which this repo forces
   because 'new' cannot screenshot on this Mac (godmode.js:450), a capture of a
   NON-animating layer intermittently comes back unpainted: measured 2026-08-23,
   8 of 24 captures with mean brightness ~7 against ~67 for a real frame, on a DOM
   reporting `anims: 0` with all 130 images decoded. Zero blank frames with motion
   ON, which is why only the REDUCE rows were red.
   Diffing a real frame against a blank one reports ~100% changed pixels on a
   surface that never moved, and REDUCE read peak 99.972% against a bound of 0.
   The app was still; the camera blinked.
   So reject a blank and take another. If every attempt is blank the sample is
   unmeasurable and the caller is told, rather than being handed a number that
   describes the capture pipeline instead of the art. */
/* AND THE DISCRIMINATOR IS STRUCTURE, NOT BRIGHTNESS. It used to be mean
   brightness with a bound of 20, calibrated 2026-08-23 on 63 captures where the
   unpainted frame landed on exactly one value, 9.17, against 35.8+ for a real
   one. That calibration was of the DROP ROWS, whose clip is a 398x429 sheet, and
   it does not describe the hype banner: measured 2026-08-27 over five runs, an
   unpainted .hype capture reads mean 23.98, which is the page's own background
   colour showing through a 398x168 hole, and a real one reads 59.96. 23.98 is
   ABOVE 20, so the blank guard waved it through and the REDUCE row read peak
   87.202% on a banner with getAnimations() === 0 and an unmoved rect. The header
   above predicted exactly this ("if a future row grades a genuinely dark surface
   this will need to stop being absolute"); it arrived as a SMALLER surface
   rather than a darker one, and the answer is the same.
   So grade what an unpainted frame really lacks, which is structure, not light.
   Standard deviation of per-pixel brightness, measured 2026-08-27 across all
   three surfaces in both passes:
       unpainted .hype                     std  2.67   (mean 23.98)
       real .hype                          std 40.66
       #tzReel, dimmest real beat          std 40.32   (mean 39.99)
       #tzWall / #tzReel, other real       std 43-62
   Then measured again over the whole file, 251 captures across 3 runs: 63 came
   back unpainted and every one of them read 1.21 or 2.67, the accepted 188 run
   from 27.19 to 62.62, and NOTHING lands between. 12 sits in that gap, 4.5x
   above the blank and 2.3x below the dimmest frame this file has ever
   legitimately graded, against a factor of 1.7 either side on brightness. A flat
   frame is the camera; art of any brightness has edges in it.
   The 2.67 readings are the .hype blanks, and the old bound accepted them. */
const BLANK_STD = 12;
const shot = async (page, dp, clip, tries = 12) => {
  for (let i = 0; i < tries; i++) {
    const b = await page.screenshot({ clip, encoding: 'base64' });
    const mv = await dp.spread(b);
    if (process.env.MEAN_DEBUG) console.log(`      [std] ${mv.toFixed(2)}`);
    if (mv > BLANK_STD) return b;
    /* BLANKS COME IN RUNS, they are not independent draws: 7 of 63 captures were
       blank but six in a row still happened, which random 11% would not produce.
       The compositor stops painting for a stretch, so waiting the same 220ms
       twelve times is not twelve chances. Nudge it into repainting and back off
       progressively instead. */
    await page.evaluate(() => { void document.body.offsetHeight; });
    await sleep(220 + i * 140);
  }
  return null;
};

const sampleOnce = async (page, sel, dp, clip, windowMs) => {
  const n = 8, gap = Math.max(120, Math.round(windowMs / n));
  let over = await foreignOver(page, sel, clip);
  const first = await shot(page, dp, clip);
  if (!first) return { peak: 0, blank: true, over };
  let peak = 0, blanks = 0;
  for (let i = 0; i < n; i++) {
    await sleep(gap);
    const next = await shot(page, dp, clip);
    over = over || await foreignOver(page, sel, clip);
    if (!next) { blanks++; continue; }
    peak = Math.max(peak, await dp.diff(first, next));
  }
  return { peak, blank: blanks === n, over };
};

/* Throw the sample away and retake it if anything foreign was over the clip
   while it was taken. The overlays that do this are transient by construction
   (a toast, a sheet mid-close), so waiting is the whole fix; a permanent one
   still runs out of tries and the row reports COVERED rather than a number. */
const sampleMotion = async (page, sel, dp, clip, windowMs, tries = 4) => {
  let r;
  for (let t = 0; t < tries; t++) {
    r = await sampleOnce(page, sel, dp, clip, windowMs);
    if (!r.over) return r;
    /* Printed, not silent: a retake is the only visible sign this precondition is
       load-bearing, and a run with no retakes at all would be a green that never
       exercised it. */
    console.log(`NOTE  sample of ${sel} discarded: [${r.over}] was over the clip (attempt ${t + 1}/${tries})`);
    await sleep(1400);
  }
  return r;
};

/* Take the sample only while a driver elsewhere is holding still, so the number
   is about THIS surface's own art. Waits for the quiet class, lets its 0.9s
   crossfade settle, samples, and throws the sample away if the class moved
   underneath it. Returns null after `tries` if the quiet window never came,
   which fails the row rather than reporting a number taken during a transition. */
const sampleQuiet = async (page, sel, dp, clip, windowMs, quiet, tries = 4) => {
  const held = async () => (await page.evaluate(s => document.querySelector(s)?.className || '', quiet.sel)).includes(quiet.cls);
  for (let t = 0; t < tries; t++) {
    for (let i = 0; i < 60 && !await held(); i++) await sleep(250);
    if (!await held()) continue;
    await sleep(1100);                       // the .9s wall crossfade, settled
    if (!await held()) continue;
    const r = await sampleMotion(page, sel, dp, clip, windowMs);
    if (r.blank || r.over) continue;         // unpainted, or something drawn over it: not a sample, try again
    if (await held()) return r.peak;         // the beat never moved: the sample is about the art
  }
  return null;
};

const W = 430, H = 932;

async function pass({ reduce }) {
  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS_MODE || 'shell',
    executablePath: chromePath(),
    args: [...sandboxArgs(), '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  });
  const tag = reduce ? 'REDUCE' : 'MOTION';
  const seen = {};
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    /* BEFORE the first navigation. js/fx.js captures reducedMotion at module
       import time, so emulating it after the load grades the wrong app. */
    if (reduce) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(base + '?demo', { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(2600);

    ok(`${tag}: SETUP the media feature is what this pass claims (a pass that graded the other state would be worse than no pass)`,
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches) === reduce,
      `prefers-reduced-motion: reduce = ${reduce}`);

    /* COVERAGE runs on the MOTION pass only: under reduce every animation has
       already finished its one instant cycle, so the scan would find nothing
       and pass on an empty sample. */
    if (!reduce) {
      const scan = await page.evaluate(sel => {
        const surfaces = [...document.querySelectorAll(sel)];
        return {
          scanned: surfaces.length,
          moving: surfaces.flatMap(s => {
            const running = [s, ...s.querySelectorAll('*')]
              .flatMap(e => (e.getAnimations ? e.getAnimations() : []))
              .filter(a => a.playState === 'running' && a.animationName);
            return running.length ? [{ cls: s.className, names: [...new Set(running.map(a => a.animationName))].join(','), n: running.length }] : [];
          }),
        };
      }, TODAY_BANNERS);
      /* Anti-vacuous: a COVERAGE row over an empty scan proves nothing, and
         Today always has at least the step-race banner and one card on it. */
      ok(`${tag}: COVERAGE the scan found promo banners on Today to police (an empty scan would pass every run while grading nothing)`,
        scan.scanned >= 2, `${scan.scanned} banner surface(s) scanned`);
      const declared = REGISTER.map(r => r.sel);
      const undeclared = scan.moving.filter(m =>
        !declared.some(d => d.startsWith('.') && m.cls.split(/\s+/).includes(d.slice(1))));
      ok(`${tag}: COVERAGE every animated promo banner on Today is in the REGISTER (an undeclared one is a motion claim nobody will ever grade)`,
        undeclared.length === 0,
        undeclared.length
          ? `UNDECLARED: ${undeclared.map(u => `[${u.cls}] ${u.n}x ${u.names}`).join(' | ')}`
          : `${scan.scanned} scanned, ${scan.moving.length} animated, all declared`);
    }

    const dp = await diffPage(browser);
    for (const row of REGISTER) {
      await row.reach(page);
      await sleep(1600);
      const clip = await clipOf(page, row.sel, W, H);
      const reached = !!clip && !clip.covered;
      ok(`${tag}: REACH ${row.key} is on screen at a real size and nothing is drawn over it`, reached,
        !clip ? `${row.sel} absent or under 8px`
          : clip.covered ? `${row.sel} is COVERED by [${clip.covered}]: the clip would grade that instead`
            : `${row.sel} ${clip.width}x${clip.height}`);
      if (!reached) { seen[row.key] = null; continue; }

      let beatClasses = null;
      if (row.beats && !reduce) {
        beatClasses = new Set();
        const poll = setInterval(async () => {
          try { beatClasses.add(await page.evaluate(s => document.querySelector(s)?.className, row.sel)); } catch { /* closing */ }
        }, 400);
        var stopPoll = () => clearInterval(poll);   // eslint-disable-line no-var
      }

      /* quietOn only applies with motion ALLOWED: under reduce the driver it
         waits on never runs, so the quiet class never arrives and the row would
         time out instead of measuring the stillness it is there to measure. */
      let blankSample = false, coveredBy = null;
      let peak;
      if (row.quietOn && !reduce) {
        peak = await sampleQuiet(page, row.sel, dp, clip, row.windowMs, row.quietOn);
      } else {
        const r = await sampleMotion(page, row.sel, dp, clip, row.windowMs);
        peak = r.peak; blankSample = r.blank; coveredBy = r.over;
      }
      /* Something else was painted over the clip for all four attempts, so every
         number available is about that and not about this surface. Say so rather
         than grading the overlay. */
      if (coveredBy) {
        ok(`${tag}: SAMPLE ${row.key} was clear of overlays for a whole window (a clip is a rectangle: whatever is drawn over it is what gets graded)`,
          false, `[${coveredBy}] was over ${row.sel} on all 4 attempts`);
        continue;
      }
      /* Every capture came back unpainted, so there is no frame to grade. Say so
         instead of reporting 0% motion, which would look like a still surface
         passing and would be a green that graded nothing. */
      if (blankSample) {
        ok(`${tag}: SAMPLE ${row.key} produced a paintable frame (every capture was blank, so nothing was graded)`,
          false, `all captures flatter than std ${BLANK_STD}: the capture pipeline, not the art`);
        continue;
      }
      if (row.beats && !reduce) stopPoll();
      seen[row.key] = peak;

      if (row.quietOn && !reduce && peak === null) {
        ok(`${tag}: MOVES ${row.key} was sampled while ${row.quietOn.sel} held on "${row.quietOn.cls}" (a sample taken across a beat change measures the driver, not this surface)`,
          false, `no clear sample in 4 tries: the quiet window never came, every capture was blank, or something was drawn over the clip`);
        continue;
      }

      if (row.moves && !reduce) {
        ok(`${tag}: MOVES ${row.key} actually changes pixels in the app (${row.what})`,
          peak >= MOVE_FLOOR, `peak ${peak.toFixed(3)}% of ${clip.width}x${clip.height} changed (floor ${MOVE_FLOOR}%)${row.quietOn ? `, sampled with ${row.quietOn.sel} held on "${row.quietOn.cls}"` : ''}`);
      } else if (!row.moves && !reduce) {
        ok(`${tag}: STILL ${row.key} is declared static and changes NOTHING with motion allowed (this is the instrument's own control: noise read as motion goes red here)`,
          peak <= STILL_MAX, `peak ${peak.toFixed(3)}% (max ${STILL_MAX}%)`);
      } else {
        ok(`${tag}: REDUCE ${row.key} is exactly still for a player who asked for no motion`,
          peak <= STILL_MAX, `peak ${peak.toFixed(3)}%${row.moves ? `  <- this surface moves ${'>='}${MOVE_FLOOR}% with motion on; both numbers are the shipped app` : ''}`);
      }

      if (row.beats && !reduce) {
        const cls = [...beatClasses].filter(Boolean);
        ok(`${tag}: BEATS ${row.key} advances its beat class, so the REEL is running and not just the art behind it`,
          cls.length >= 2, cls.length ? cls.map(c => `"${c}"`).join(' -> ') : 'never sampled');
      }
      if (row.beats && reduce) {
        const cls = await page.evaluate(s => document.querySelector(s)?.className, row.sel);
        console.log(`NOTE  ${tag}: ${row.key} rests on class "${cls}", the bare wall, which is what "it was always a static grid" is.`);
      }
    }
    await dp.close();
    ok(`${tag}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally {
    await browser.close().catch(() => {});
  }
  return seen;
}

const motion = await pass({ reduce: false });
const reduced = await pass({ reduce: true });

/* THE LINE THIS FILE EXISTS TO PRINT. Both numbers, side by side, for every
   motion claim: whoever reports "the banner moves" has to scroll past the
   column showing what half the players get. */
console.log('\n  surface        motion on     under reduce   claim');
for (const r of REGISTER) {
  const a = motion[r.key], b = reduced[r.key];
  console.log(`  ${r.key.padEnd(14)} ${(a == null ? 'absent' : a.toFixed(3) + '%').padEnd(13)} ${(b == null ? 'absent' : b.toFixed(3) + '%').padEnd(14)} ${r.moves ? 'MOVES' : 'STATIC'}`);
}

if (srv) await srv.close();
console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join('; ') : 'all green'}`);
process.exit(fails.length ? 1 : 0);

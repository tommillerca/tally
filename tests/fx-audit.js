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
 *      every frame, in the same sample where the frame is being shown. Position is
 *      checked too, but position alone is the assertion that lied.
 *
 * Plus two rules borrowed from the anti-regression list in CLAUDE.md:
 *   - An empty sample set is a FAILURE, never a pass.
 *   - Coverage is derived from the SOURCE, not from this file's wishes. Register a
 *     new move in STRIKE_FX and forget to add it below, and the audit fails
 *     rather than quietly testing the old two.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SHAPE OF THE SAMPLING CHANGED (2026-08-16, fixing a ~30% flake)
 *
 * This audit was red about one run in three, on unmodified main, and the message
 * it printed when it went red was "the animation played with UNDECODED images".
 * That message was FALSE. Measured with a per-sample trace: every frame reported
 * naturalWidth 928 (jab) / 985 (swing) from the very first sample, 11ms after the
 * wrapper was appended. Nothing was ever undecoded. The app was fine; the
 * INSTRUMENT was wrong, and it was wrong in the worst possible way, blaming the
 * exact bug it exists to catch.
 *
 * The broken instrument was `getComputedStyle(img).opacity !== '0'`. That reads
 * the LIVE, mid-flight value of the crossfade declared at app.css:4069
 * (`.strikefx img { transition: opacity .05s linear }`), so it only reports
 * non-zero once the compositor has actually committed a frame of that transition.
 * Meanwhile js/app.js:14722 sets `fast = !!navigator.webdriver`, so under any
 * automation the whole animation is played at 4x: js/app.js:15138 scales every JS
 * timing by s = 0.25, giving 15ms between frame swaps and a ~117ms total life for
 * jab. The 50ms CSS crossfade is NOT scaled by s. Traced:
 *
 *     t=11ms  inline ["1","0","0"]   computed ["0","0","0"]
 *     t=15ms  inline ["0","1","0"]   computed ["0","0","0"]
 *     t=31ms  inline ["0","0","1"]   computed ["0","0","0"]
 *     t=87ms  inline ["0","0","1"]   computed ["0","0","0.33322"]   <- first non-zero
 *     ... wrapper removed at ~117ms
 *
 * Frames 0 and 1 never reached a non-zero computed opacity AT ALL, and frame 2's
 * crossfade only began near the end. So the count of "decoded and computed-opacity
 * non-zero" samples was whatever happened to fall in that last sliver: measured 0,
 * 1, 3, 3, 4, 4, 5, 6, 6, 7 across ten strikes. The old floor was `good.length >=
 * 1`, so it passed on the lottery and failed when the sliver landed outside the
 * element's life. That is the entire flake.
 *
 * Two further facts from the same measurement, both worth keeping written down:
 *   - At PLAYER timing (the same trace with fast forced false) there is no sliver:
 *     60 samples over 470ms, computed opacity ramps cleanly 0.33 -> 0.67 -> 1 and
 *     holds at 1 for 40 samples. The compressed automation timing is the only
 *     place the crossfade cannot land. Anti-regression rule 12: this audit had
 *     been measuring in a state no player is ever in.
 *   - Cache was never involved. The six FX PNGs load at fight open via
 *     warmStrikeFx (js/app.js:16096) in ~40ms with transferSize > 0, and the audit
 *     waits 2.5s after that before the first strike.
 *
 * THE FIX. Never gate on a value that only exists once the compositor has drawn.
 * Every predicate below is either the app's OWN STATED INTENT (the inline opacity
 * strikeFx() writes at js/app.js:15139, which is exactly "this is the frame I am
 * putting up") or a layout/decode fact (naturalWidth, offsetWidth, the element
 * box, display/visibility), none of which are animated here. The computed opacity
 * is still SAMPLED and PRINTED, because a human reading the log should be able to
 * see the crossfade land, but it no longer gates anything.
 *
 * The assertions got stronger, not weaker, and they are stated as directions with
 * bounds rather than as trends (anti-regression rule 11):
 *   CEILINGS, bound 0 - none of these may ever happen in any shown sample:
 *     - a frame is being shown while any frame is undecoded   <- THE v245 BUG
 *     - a frame is being shown with a zero-size layout box
 *     - a shown, decoded frame that does not overlap the victim
 *     - the wrapper hidden by display/visibility, or opacity 0 for its whole life
 *     - the element on screen with no frame selected (ceiling 2, observed 0/38)
 *   FLOORS - measured across 38 strikes: life 96..139ms, 8..18 samples in it:
 *     - at least 60ms of observed on-screen life  (was: no duration check at all)
 *     - at least 4 samples showing a frame        (was: 1 lucky sample)
 *   Every floor sits at or under half the smallest measured value, so a genuinely
 *   broken or blink-and-gone animation fails and normal jitter does not.
 * ---------------------------------------------------------------------------
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
import { loadPuppeteer, chromePath, sandboxArgs, serveTree } from './godmode.js';

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

/* NEVER GRADE PRODUCTION. This defaulted to the live site, so a bare run of
   this audit measured whatever is deployed and said nothing at all about the
   working tree it was run from. A pass under that default is not evidence.
   An explicit URL still wins, so the way anyone drove this before still works;
   with no argument it now serves the tree this file lives in. */
const srvHandle = process.argv[2] ? null : await serveTree(path.resolve(__dirname, '..'));
const BASE = (process.argv[2] || srvHandle.url).replace(/\/?$/, '/');
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
    if (srvHandle) srvHandle.close();
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

  /* borrow boot()'s browser resolution rather than re-deriving it: without
     executablePath this died "Could not find Chrome" on any machine whose
     browser is not where puppeteer looks, and without the sandbox args it died
     as uid 0. Both read as an FX failure, which is the one thing the header of
     this file says a setup problem must never do. */
  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS_MODE || 'new',
    defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    executablePath: chromePath(),
    args: sandboxArgs(),
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

  /* split out from clickMatching so a move can be LOCATED before the FX watcher
     is armed. Arming first and clicking second is the whole point of the new
     sampling: the watcher must already be running when the element is created,
     because the element can be born and dead inside 117ms. */
  const findMatching = (re) => page.evaluate(src => {
    const rx = new RegExp(src, 'i');
    const b = [...document.querySelectorAll('button')]
      .find(x => rx.test((x.textContent || '').trim()) && !x.disabled);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    if (!r.width) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, re.source);

  const clickMatching = async (re) => {
    const hit = await findMatching(re);
    if (!hit) return false;
    await page.mouse.click(hit.x, hit.y);
    return true;
  };

  /* Wait for the real precondition instead of sleeping through it. Resolves when
     the .strikefx wrapper has appeared AND been removed again, so the sample set
     covers the whole life of the animation rather than an arbitrary 3s window.
     BOUNDED: if no wrapper ever appears, or one appears and never leaves, this
     resolves anyway with a reason, so a genuinely broken animation fails loudly
     instead of hanging the suite. */
  const watchStrike = (timeoutMs) => page.evaluate(ms => new Promise(resolve => {
    const samples = [];
    const t0 = performance.now();
    let seen = false, bornAt = 0, lastAt = 0, id = 0;
    const finish = reason => { clearInterval(id); resolve({ samples, reason, lifeMs: Math.round(lastAt - bornAt) }); };
    id = setInterval(() => {
      const now = performance.now();
      const w = document.querySelector('.strikefx');
      if (!w) {
        if (seen) finish('removed');
        else if (now - t0 > ms) finish('never-appeared');
        return;
      }
      if (!seen) { seen = true; bornAt = now; }
      lastAt = now;
      const imgs = [...w.querySelectorAll('img')];
      const foe = document.querySelector('#foeStage');
      const vb = foe && foe.getBoundingClientRect();
      /* THE FRAME THE APP SAYS IT IS SHOWING. strikeFx()'s show() writes
         style.opacity = '1' on exactly one img (js/app.js:15139). This is the
         app's own intent and is not animated, unlike getComputedStyle().opacity,
         which is the mid-flight value of the .05s crossfade and is only non-zero
         once the compositor has drawn. Gating on that was the flake. */
      const sel = imgs.findIndex(i => i.style.opacity === '1');
      const im = sel >= 0 ? imgs[sel] : null;
      const ir = im && im.getBoundingClientRect();
      const ws = getComputedStyle(w);
      const is = im && getComputedStyle(im);
      samples.push({
        t: Math.round(now - bornAt),
        shown: sel,
        decoded: imgs.length > 0 && imgs.every(i => i.naturalWidth > 0),
        naturalWidths: imgs.map(i => i.naturalWidth),
        boxed: !!(im && im.offsetWidth > 0 && im.offsetHeight > 0),
        painted: !!(im && ws.display !== 'none' && ws.visibility !== 'hidden'
                    && is.display !== 'none' && is.visibility !== 'hidden'),
        wrapLit: parseFloat(ws.opacity) > 0,
        onVictim: !!(ir && vb && ir.right > vb.left && ir.left < vb.right && ir.bottom > vb.top && ir.top < vb.bottom),
        // diagnostic only, deliberately NOT an assertion: see the header.
        crossfade: imgs.map(i => getComputedStyle(i).opacity),
      });
      if (now - t0 > ms) finish('timeout-still-on-screen');
    }, 8);
  }), timeoutMs);

  // clear the demo profile's opening overlays, then start a fight
  for (let i = 0; i < 6; i++) {
    if (!await clickMatching(/^(spin|nice|done|collect|claim|continue|ok|got it|next|skip)$/)) break;
    await sleep(1800);
  }
  await clickMatching(/^the pit/i) || await page.evaluate(() => document.getElementById('pitBtn')?.click());
  await sleep(1500);
  if (!await clickMatching(/^FIGHT$/)) { console.log('FAIL: could not start a fight'); await browser.close(); if (srvHandle) srvHandle.close(); process.exit(1); }
  await sleep(2500);
  if (!await page.evaluate(() => !!document.querySelector('#youStage'))) {
    console.log('FAIL: no fight on screen'); await browser.close(); if (srvHandle) srvHandle.close(); process.exit(1);
  }

  /* MAKE THE v245 RACE POSSIBLE. Anti-regression rule 1: a check that cannot fail
     is not a check, and rule 4: name the environment property the failure needs,
     then test somewhere that has it. v245 is a RACE between a ~350ms animation and
     100KB+ PNGs arriving over a real network. Against 127.0.0.1 there is no
     network, so an app with warmStrikeFx deleted AND the decode gate removed still
     passed this audit: the frames arrived inside the first 8ms sample. Proven, by
     doing exactly that in a throwaway tree and watching it come back green.
     So the audit now supplies the missing property itself, and only AFTER the
     fight is up: by this point warmStrikeFx (js/app.js:16096) has long since
     fetched all six frames, so a correct app reads them from cache and never
     touches this pipe, while an app that fetches frames at strike time has to drag
     112KB across 400ms of latency against a 117ms animation and cannot win.
     Verified both ways: green 14/14 with this on, and red on the v245 tree. */
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 400, downloadThroughput: 200 * 1024, uploadThroughput: 200 * 1024,
  });
  console.log('network throttled to 400ms latency / 200KB.s so an unwarmed frame cannot win the race');

  /* FLOORS AND THE ONE REMAINING CEILING, all justified from measurement.
     Across 38 traced strikes on this tree: on-screen life 96 to 139ms at
     automation speed (a player gets 470 to 546ms), 8 to 18 samples in that life,
     and in every single one of them the count of samples where the element was up
     with NO frame selected was 0.

     The sample COUNT is deliberately the weakest of the three, because it is the
     only one that a slow sampler can move on its own: one run here logged 8
     samples across a perfectly normal 108ms life, i.e. the interval had starved
     to ~13ms rather than the animation having been short. So duration carries the
     "it played rather than blinked" claim, the count only rejects a sample set too
     thin to mean anything, and the never-started case is caught by counting a
     DEFECT (samples with the element up and no frame selected) instead of a rate,
     which starvation cannot fake. Proven red: a 20ms blink trips the duration and
     count floors, a no-op show() trips the count floor and the unselected ceiling
     at 14 and 15 unselected samples. */
  const MIN_SHOWN_SAMPLES = 4;    // half the smallest observed (8)
  const MIN_LIFE_MS = 60;         // well under half the smallest observed (96ms)
  const MAX_UNSELECTED = 2;       // observed 0 in 38 of 38 strikes

  for (const move of MOVES) {
    /* Locate the button BEFORE arming the watcher, and take the out-of-AP
       recovery first, so the sample set cannot capture the FOE's strike from the
       turn we just handed over. */
    let hit = await findMatching(move.button);
    if (!hit) {   // out of AP: hand the turn over and wait for it to come back
      await clickMatching(/^END TURN/i);
      await sleep(6000);
      hit = await findMatching(move.button);
    }
    console.log(`\n${move.id}: button found=${!!hit}`);
    if (!hit) { fail(`${move.id}: never found an enabled button matching ${move.button}`); continue; }

    // let any FX still on screen from the previous turn clear, so we watch OURS
    for (let i = 0; i < 40 && await page.evaluate(() => !!document.querySelector('.strikefx')); i++) await sleep(50);

    const watching = watchStrike(6000);      // armed first, clicked second
    await page.mouse.click(hit.x, hit.y);
    const { samples, reason, lifeMs } = await watching;

    console.log(`  watcher: ${reason}, samples=${samples.length}, on-screen life=${lifeMs}ms`);
    if (!samples.length) { fail(`${move.id}: no .strikefx element ever appeared within 6s of the real button press (${reason}). Empty sample set is a failure, not a pass.`); continue; }
    if (reason === 'timeout-still-on-screen') { fail(`${move.id}: the .strikefx element never went away. The animation is stuck, not playing.`); continue; }

    const shown = samples.filter(s => s.shown >= 0);
    const undecodedWhileShown = shown.filter(s => !s.decoded);
    const unboxedWhileShown = shown.filter(s => !s.boxed);
    const unpaintedWhileShown = shown.filter(s => !s.painted);
    const offVictim = shown.filter(s => s.decoded && s.boxed && !s.onVictim);
    const litSamples = samples.filter(s => s.wrapLit);
    console.log(`  showing a frame: ${shown.length}/${samples.length}   undecoded while showing: ${undecodedWhileShown.length}   off-victim: ${offVictim.length}`);
    console.log(`  crossfade seen (diagnostic, not asserted): ${samples.filter(s => s.crossfade.some(o => o !== '0')).length}/${samples.length} samples`);

    // CEILING, bound 0. This is the v245 bug and the reason this file exists.
    if (undecodedWhileShown.length) {
      fail(`${move.id}: ${undecodedWhileShown.length}/${shown.length} samples had the animation SHOWING a frame while images were UNDECODED (naturalWidth ${JSON.stringify(undecodedWhileShown[0].naturalWidths)}), so nothing was on screen. This is the v245 bug.`);
      continue;
    }
    // CEILING, bound 0: shown but with no layout box, or removed from rendering.
    if (unboxedWhileShown.length) { fail(`${move.id}: ${unboxedWhileShown.length}/${shown.length} samples showed a frame with a zero-size box, so it decoded but occupied no pixels.`); continue; }
    if (unpaintedWhileShown.length) { fail(`${move.id}: ${unpaintedWhileShown.length}/${shown.length} samples showed a frame that was display:none or visibility:hidden.`); continue; }
    // CEILING, bound 0: the wrapper dark for its entire life (a stylesheet hiding
    // it). Not per-sample: the wrapper legitimately fades to 0 on its way out.
    if (!litSamples.length) { fail(`${move.id}: the .strikefx wrapper had opacity 0 for its entire ${lifeMs}ms life, so the whole effect was invisible.`); continue; }
    // CEILING, bound 2: the element on screen with no frame selected. This is the
    // wiring failure (element built, animation never started) and it is counted as
    // a defect rather than as a rate, so a starved sampler cannot fake it.
    if (samples.length - shown.length > MAX_UNSELECTED) { fail(`${move.id}: ${samples.length - shown.length} of ${samples.length} samples had the .strikefx element on screen with NO frame selected (ceiling ${MAX_UNSELECTED}). It was built but never played.`); continue; }
    // FLOORS.
    if (lifeMs < MIN_LIFE_MS) { fail(`${move.id}: the FX was on screen for ${lifeMs}ms, floor is ${MIN_LIFE_MS}ms. It blinked rather than played.`); continue; }
    if (shown.length < MIN_SHOWN_SAMPLES) { fail(`${move.id}: only ${shown.length} of ${samples.length} samples had a frame selected, floor is ${MIN_SHOWN_SAMPLES}. The sample set is too thin to mean anything.`); continue; }
    // CEILING, bound 0: decoded pixels that land somewhere other than the victim.
    if (offVictim.length) { fail(`${move.id}: ${offVictim.length}/${shown.length} decoded frames did not overlap the victim.`); continue; }

    console.log(`  OK: ${shown.length} decoded frames on the victim across ${lifeMs}ms`);
  }

  if (pageErrors.length) fail(`page errors during the audit: ${pageErrors.slice(0, 3).join(' | ')}`);

  await browser.close();
  if (srvHandle) srvHandle.close();
  console.log('');
  if (failures.length) { console.log(`FX AUDIT FAILED (${failures.length})`); process.exit(1); }
  console.log('FX AUDIT PASSED: every registered animation put decoded pixels on the victim.');
})();

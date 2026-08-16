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
 * ---------------------------------------------------------------------------
 * THE THROTTLE GRADED THE SERVER'S CACHE HEADERS (2026-08-16, second fix)
 *
 * The network throttle added below to make the v245 race possible turned a
 * HEALTHY tree RED, with the v245 message, purely on the basis of the header the
 * static server sends. Same tree, same audit, three runs, exit codes read from a
 * file and not through a pipe:
 *
 *   serveTree (python http.server)          throttle on    PASS, life 112/132ms, exit 0
 *   a server sending cache-control:no-store throttle on    FAIL both moves, exit 1
 *   that same no-store server               throttle off   PASS-ish, exit 1 on one
 *                                                          late frame (see below)
 *
 * MECHANISM. warmStrikeFx (js/app.js:16096) fetches all six frames when the fight
 * opens. Under `cache-control: no-store` the browser may not reuse them, so the
 * <img> tags strikeFx builds at js/app.js:15117 go back to the network for 112KB
 * per frame. With 400ms of emulated latency and a 200KB/s pipe that is about
 * 950ms, while strikeFx's own safety net (js/app.js:15152-15158) gives up waiting
 * after 400ms and plays anyway. So the animation runs over undecoded images and
 * the audit reports the v245 bug against an app that does not have it. python's
 * http.server sends no cache-control at all, so Chrome heuristically caches from
 * Last-Modified and the same tree passes. tests/release-gate.mjs:53-54 sends
 * exactly the no-store header, and so do most dev static servers.
 *
 * That is the same class of defect as the flake above and worse in one way: the
 * thing it was keyed on was invisible in the output, so nobody reading the red
 * would have suspected a response header.
 *
 * THE FIX, in three parts.
 *
 *   1. STOP DEPENDING ON THE SERVER. The audit now controls this property of its
 *      own fixture instead of inheriting it: a CDP Fetch interceptor rewrites the
 *      cache-control on the FX frames only (assets/bh/fx/**) to a normal
 *      cacheable value, at the RESPONSE stage, so bytes still travel the real
 *      network stack and the throttle still applies to them. This is not hiding
 *      anything: production (GitHub Pages) serves these with max-age, so a warm
 *      cache is the state a player is actually in (rule 12), and no-store is the
 *      dev server's artifact. The v245 race is untouched, because an app that
 *      never warms has nothing in that cache to hit.
 *   2. ASSERT THE PRECONDITION, AND FAIL AS SETUP IF IT DOES NOT HOLD. Before the
 *      first strike, with the throttle already on, the audit loads one FX-shaped
 *      URL of its OWN twice (a ?fxaudit-cacheprobe query string, so the app's own
 *      cache entries are never touched or warmed by the probe) and times both:
 *        DIRECTION cold must be SLOW, BOUND >= 200ms   (proves the throttle is on,
 *                                                       measured ~900ms)
 *        DIRECTION warm must be FAST, BOUND < 250ms    (proves a cacheable
 *                                                       response is reusable here,
 *                                                       measured single digits)
 *      If either bound is missed the audit exits 2, SETUP, printing that no FX
 *      claim was made. Exit 1 stays reserved for a finding about the app. The
 *      probe deliberately uses a URL the audit warms itself, never one the app is
 *      responsible for warming, so a real v245 tree (which warms nothing) still
 *      passes the probe and then goes red as a FINDING, which is the whole point.
 *   3. LIFT THE THROTTLE after the FX loop, and drop the interceptor with it.
 *      Everything after the loop used to run at 400ms/200KB for no reason.
 *
 * WHILE PROVING THIS, a second false red fell out of the control run: with the
 * throttle OFF and no-store on, swing failed 1/18 with naturalWidths
 * [985,985,0]. The predicate was `imgs.every(naturalWidth > 0)`, i.e. it blamed
 * v245 when frame 3 was still in flight during a sample where frame 1 was the one
 * on screen and fully decoded. That is not the bug: v245 is A FRAME BEING SHOWN
 * WITH NO PIXELS IN IT. The predicate is now the shown frame's own naturalWidth,
 * which is exactly the v245 statement, loses no coverage (the sampler runs the
 * whole life at 8ms, so a frame that is still blank when its turn comes is caught
 * in the sample where it is shown) and cannot be tripped by a later frame that is
 * merely late. The all-frames count is still printed as a diagnostic.
 *
 * NOTE FOR WHOEVER READS CLAUDE.md NEXT. Its FX rule is worded "naturalWidth > 0
 * on every frame, in the same sample where the frame is visible". The second half
 * of that sentence is the load-bearing half and is exactly what is asserted here;
 * "every frame" as a literal reading is what went red on a healthy tree the
 * moment the frames came off a real network. Do not put it back without first
 * serving the tree with `cache-control: no-store` and watching it lie.
 * ---------------------------------------------------------------------------
 *
 * Usage:
 *   node tests/fx-audit.js                     # serve THIS tree and audit it
 *   node tests/fx-audit.js http://localhost:8765/   # audit a build already served
 *
 * EXIT CODES. 0 pass. 1 a FINDING about the app, i.e. an animation that is not
 * putting pixels on the victim. 2 SETUP: the audit could not establish the
 * conditions it needs (no browser, no cacheable fixture, no throttle) and has
 * therefore made NO claim about the FX. Keeping 1 for findings only is the whole
 * point of the second fix above: a harness that grades its own environment must
 * not be able to spend the word "v245" on it.
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
   which meant it could only ever run on one Mac. The exit-with-a-reason behaviour
   is kept: a missing browser is a SETUP failure and must not read as an FX
   failure. It exits 2 now rather than 1, with the cache precondition below and
   for the same reason: 1 means a finding about the app. Callers that only ask
   "was it zero" are unaffected. */
const EXIT_SETUP = 2;
let puppeteer;
try { puppeteer = await loadPuppeteer(); }
catch (e) { console.error(`FX AUDIT CANNOT RUN (setup, not a failing check):\n${e.message}`); process.exit(EXIT_SETUP); }

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

  /* SETUP failures exit 2, findings exit 1. A harness that cannot establish its
     own preconditions has not checked the app, and saying so with the same exit
     code as "the punch is invisible" is how a false red gets believed. */
  const bailSetup = async (msg) => {
    console.error(`\nFX AUDIT CANNOT RUN (setup, not a failing check):\n  ${msg}\n  No claim has been made about the FX.`);
    try { await browser.close(); } catch { /* already gone */ }
    if (srvHandle) srvHandle.close();
    process.exit(EXIT_SETUP);
  };

  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');

  /* OWN THE CACHE HEADERS ON THE FX FRAMES. See the header: with the throttle on,
     a server that says `cache-control: no-store` (tests/release-gate.mjs:53-54,
     and most dev static servers) forces strikeFx's <img> tags back onto the wire
     for 112KB per frame and produces a v245 red on a healthy app. The response
     stage is deliberate: the bytes still come from the real network through the
     emulated pipe, only the storage policy is rewritten, so an unwarmed frame
     still cannot win the race. Scoped to the FX frames alone. */
  const FX_ASSET_RE = /\/assets\/bh\/fx\//;
  const rewrite = { ok: 0, failed: 0, lastError: '' };
  cdp.on('Fetch.requestPaused', async (ev) => {
    /* Only rewrite a real 200. A redirect or a 404 passes through untouched: this
       exists to make a SUCCESSFUL frame reusable, not to invent a cache entry for
       a frame that is not there, and a missing frame must still fail loudly. */
    if (ev.responseStatusCode !== 200) {
      try { await cdp.send('Fetch.continueRequest', { requestId: ev.requestId }); } catch { /* request already gone */ }
      return;
    }
    const headers = (ev.responseHeaders || []).filter(h => !/^(cache-control|pragma|expires)$/i.test(h.name));
    headers.push({ name: 'cache-control', value: 'public, max-age=600' });
    try {
      /* responseCode is NOT optional here even though only the headers are being
         changed: "Cannot override only status or headers, both should be
         provided". The first version of this omitted it, every rewrite threw, and
         the only reason it was not a silent no-op is the probe below, which
         caught it and exited 2 rather than blaming the app. */
      await cdp.send('Fetch.continueResponse', {
        requestId: ev.requestId,
        responseCode: ev.responseStatusCode,
        responsePhrase: ev.responseStatusText || 'OK',
        responseHeaders: headers,
      });
      rewrite.ok++;
    } catch (e) {
      rewrite.failed++; rewrite.lastError = e.message;
      try { await cdp.send('Fetch.continueRequest', { requestId: ev.requestId }); } catch { /* request already gone */ }
    }
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/assets/bh/fx/*', requestStage: 'Response' }] });

  /* Diagnostic only, never an assertion: which FX frames the app pulled over the
     network before the first strike. On a healthy tree this is 6 (warmStrikeFx);
     on a v245 tree it is 0, which is the line a human wants in the red. */
  const fxWarmed = new Set();
  cdp.on('Network.responseReceived', (e) => {
    const url = (e.response && e.response.url) || '';
    if (FX_ASSET_RE.test(url) && !url.includes('fxaudit-cacheprobe')) fxWarmed.add(url.split('?')[0]);
  });

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
        /* THE v245 STATEMENT, exactly: the frame the app says it is showing has
           no pixels in it. Not `imgs.every(...)`: that also went red when a LATER
           frame was still in flight while a decoded frame was on screen, which is
           lateness, not invisibility, and it fired on a healthy tree the moment
           the frames came off the wire instead of out of the cache. A frame that
           is still blank when its own turn comes is caught here in the sample
           where IT is the shown one, because the sampler runs the whole life. */
        decoded: !!(im && im.naturalWidth > 0),
        allDecoded: imgs.length > 0 && imgs.every(i => i.naturalWidth > 0),   // diagnostic
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
  const THROTTLE = { offline: false, latency: 400, downloadThroughput: 200 * 1024, uploadThroughput: 200 * 1024 };
  await cdp.send('Network.emulateNetworkConditions', THROTTLE);
  console.log(`network throttled to 400ms latency / 200KB.s so an unwarmed frame cannot win the race`);
  console.log(`  FX frames the app pulled before the first strike (diagnostic): ${fxWarmed.size}`);
  console.log(`  FX cache-control rewritten on ${rewrite.ok} responses, ${rewrite.failed} failed${rewrite.failed ? ` (${rewrite.lastError})` : ''}`);

  /* THE THROTTLE'S OWN PRECONDITION, ASSERTED BEFORE IT CAN ACCUSE ANYONE.
     The pipe above only proves something about the APP if a frame the app already
     warmed can be re-read without touching the pipe. That is a property of the
     SERVER's response headers, and when it was left to chance a no-store server
     turned this audit red on a healthy tree with the v245 message (see header).
     So it is measured, here, through the same mechanism strikeFx uses (a fresh
     Image element), under the same throttle the loop will run under, on a URL the
     audit warms ITSELF: the ?fxaudit-cacheprobe query is a distinct cache key, so
     the app's own frames are neither read nor warmed by this, and a genuinely
     unwarmed app still fails as a FINDING rather than being excused as setup.
       DIRECTION: cold SLOW, BOUND >= 200ms   (the throttle is really on)
       DIRECTION: warm FAST, BOUND < 250ms    (a cacheable response is reusable)
     Missing either bound is a SETUP failure, exit 2, never a v245 finding. */
  const timeImageLoad = (url) => page.evaluate(u => new Promise(resolve => {
    const t0 = performance.now();
    const im = new Image();
    const done = () => resolve({ ms: Math.round(performance.now() - t0), w: im.naturalWidth });
    im.onload = done; im.onerror = done;
    im.src = u;
  }), url);
  const PROBE_URL = BASE + 'assets/bh/fx/jab/basic1.png?fxaudit-cacheprobe';
  const COLD_FLOOR_MS = 200, WARM_CEILING_MS = 250;
  const cold = await timeImageLoad(PROBE_URL);
  const warm = await timeImageLoad(PROBE_URL);
  console.log(`  cache probe: cold ${cold.ms}ms (floor ${COLD_FLOOR_MS}ms), warm ${warm.ms}ms (ceiling ${WARM_CEILING_MS}ms), decoded ${cold.w}x`);
  if (!cold.w || !warm.w) await bailSetup(`the cache probe could not even load ${PROBE_URL} (naturalWidth ${cold.w}/${warm.w}). The fixture is not serving the FX frames.`);
  if (cold.ms < COLD_FLOOR_MS) await bailSetup(`an uncached FX frame loaded in ${cold.ms}ms, under the ${COLD_FLOOR_MS}ms floor, so the 400ms-latency pipe is NOT in effect and the v245 race cannot happen here. This audit would pass no matter how broken the FX are, which is not a check (anti-regression rule 1).`);
  if (warm.ms >= WARM_CEILING_MS) await bailSetup(`a frame this audit had just loaded took ${warm.ms}ms to load AGAIN, so nothing is being cached and every re-read pays the throttled network. Under that, even a correct app plays over undecoded frames and this audit would report the v245 bug against a healthy tree. Almost always the server: check for 'cache-control: no-store' (tests/release-gate.mjs:53-54 sends it) and for the FX header rewrite above still being installed.`);

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
    console.log(`  showing a frame: ${shown.length}/${samples.length}   SHOWN frame undecoded: ${undecodedWhileShown.length}   off-victim: ${offVictim.length}`);
    console.log(`  some other frame still undecoded (diagnostic, not asserted): ${shown.filter(s => !s.allDecoded).length}/${shown.length} samples`);
    console.log(`  crossfade seen (diagnostic, not asserted): ${samples.filter(s => s.crossfade.some(o => o !== '0')).length}/${samples.length} samples`);

    // CEILING, bound 0. This is the v245 bug and the reason this file exists.
    if (undecodedWhileShown.length) {
      fail(`${move.id}: ${undecodedWhileShown.length}/${shown.length} samples had the animation SHOWING a frame that was UNDECODED (frame ${undecodedWhileShown[0].shown} of naturalWidths ${JSON.stringify(undecodedWhileShown[0].naturalWidths)}), so nothing was on screen. This is the v245 bug.`);
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

  /* LIFT IT. The throttle exists for the strike loop and nothing else, and it was
     never taken off: every teardown read, every screenshot and anything added
     below this line used to run at 400ms/200KB, which is slow at best and a
     mystery timeout at worst. Same for the header rewrite. Cleanup, so a failure
     here must not become a finding. */
  try {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await cdp.send('Fetch.disable');
    console.log('\nnetwork throttle lifted, FX header rewrite removed');
  } catch (e) { console.log(`\n(could not lift the throttle: ${e.message})`); }

  if (pageErrors.length) fail(`page errors during the audit: ${pageErrors.slice(0, 3).join(' | ')}`);

  await browser.close();
  if (srvHandle) srvHandle.close();
  console.log('');
  if (failures.length) { console.log(`FX AUDIT FAILED (${failures.length})`); process.exit(1); }
  console.log('FX AUDIT PASSED: every registered animation put decoded pixels on the victim.');
})();

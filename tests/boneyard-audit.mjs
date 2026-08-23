/* THE BONEYARD ACTUALLY LOADS, AND THE ACTION BAR OBEYS ITS OWN RULE.
 *
 * Tom, 2026-08-08: "the boneyard now says 'reading the bones' with a loading tab
 * for sooooo long... you need to test this shit before you ship it" and then
 * "fix the boneyard immediately it is unplayable".
 *
 * He was right and this test is the thing that was missing. v296 started hiding
 * the bottom action card unless something was in reach, via the `hidden`
 * attribute, but `.map-act` sets `display: flex`, which BEATS the UA stylesheet's
 * `[hidden] { display: none }`. So the card never hid. It just sat there
 * displaying the placeholder text it ships with, "Reading the bones", forever.
 * Nothing in the suite opened the Boneyard and looked at it.
 *
 * What this locks down:
 *   LOADS    the map renders and the markers get revealed (not stuck at opacity 0)
 *   BAR      with nothing in reach the action card is genuinely not visible
 *   STALE    "Reading the bones" is never left on screen after the map settles
 *
 * PROVE-RED (confirmed 2026-08-08): delete `.map-act[hidden] { display: none; }`
 * from app.css and BAR + STALE fail.
 *
 * Usage: node tests/boneyard-audit.mjs        (URL=... for live)
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, loadPuppeteer,
  boneyardCapability, unproven, unprovenReport, exitFor, unclassifiedRows } from './godmode.js';

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

/* ONE ARRIVAL. Tom, 2026-08-08: "the boneyard is still loading in POIs at
   different times ... it looks cheap when everything staggers in." v294 made the
   reveal wait for the first refreshWorld pass and he was STILL right: measured
   2026-08-07, everything landed at ~2.8s, the map was revealed at 2.9s, and a
   fourth den then appeared at 3.7s. 800ms after the picture was on screen.
   Placement cannot finish until the tiles are loaded (the water/walkability snap
   reads queryRenderedFeatures, empty until `idle`), so the first pass places what
   it can and the idle pass places the rest.
   This records the marker count on a timer from before navigation and fails if
   ANY count changes after .markers-in is added, with no user action.
   PROVE-RED (confirmed 2026-08-07): reveal on worldPassDone alone and ARRIVAL
   fails naming den 3 -> 4 at ~800ms after the reveal. */
const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const origin = new URL(base).origin;
await browser.defaultBrowserContext().overridePermissions(origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

/* ---- BEAT RECORDER, ported from Reggie's stranded 2026-08-20 work ----------
   Runs ALONGSIDE the recorder above, under its own global, deliberately. The
   rows above were verified against `__arr`'s shape (#84's settled read, #94's
   scoping and decoy guard) and rewriting five proven rows onto a new data model
   is where bugs get introduced. This adds a second, event-driven view instead.

   WHY IT IS NEEDED AT ALL. Nothing on main tests the thing Tom actually
   complained about on 2026-08-08: "the boneyard is still loading in POIs at
   different times ... it looks cheap when everything staggers in". Every
   existing row measures WHAT was visible at some instant. None measures HOW MANY
   SEPARATE WAVES the player saw.

   Its clock is BONEYARD-ENTRY relative, unlike `__arr.t0` which starts at
   document creation, before seed() and before navigation. That difference is
   what made a fast reveal read ~16s against an 1800ms cap and is why those two
   numbers were never comparable. `__slow` already does it this way. */
const BEAT_RECORDER = () => {
  const S = window.__beat = { entry: null, reveal: null, marks: [] };
  /* The five marker classes, 2026-08-23. Same list KINDS is keyed on, restated
     because this runs in page context where KINDS is not in scope. Not a
     tunable: a sixth marker type belongs in both places. */
  const POI = ['map-spawn', 'map-den-mark', 'map-mini-mark', 'map-spire', 'map-glutton-mark'];
  const POI_RE = /map-spawn|map-den-mark|map-mini-mark|map-spire|map-glutton-mark/;
  const now = () => S.entry == null ? null : Math.round(performance.now() - S.entry);
  /* Same allowlist as the scoping above and for the same reason: #mapLegend is
     built from real marker markup, sits inside #mapStage, and [hidden] does not
     zero computed opacity. Reggie reached this independently on 2026-08-20.
     The predicate is checked DIRECTLY at read time (see beatDecoys below), not
     by counting rejections here. Counting here cannot work and the first draft
     of this port shipped that bug: MutationObserver.addedNodes carries only the
     TOP-LEVEL inserted node, and #mapLegend arrives as one innerHTML subtree, so
     its nine swatches are never individually observed and the counter stayed 0
     forever. A guard pinned to 9 against a counter that cannot increment is
     permanently red, which is the same species as a guard that cannot fail. */
  const isMarker = el => el.classList.contains('maplibregl-marker') && POI.some(c => el.classList.contains(c));
  /* ONE SHARED POLLER, NOT ONE PER MARKER, AND THIS IS NOT A TIDY-UP.
     Reggie's original gave every marker its own 16ms setInterval calling
     getComputedStyle. As the ONLY recorder that was affordable. Running it
     alongside the recorder above was not: 47 markers x ~62 ticks/s is ~2900
     forced style recalcs per second, and MEASURED on a clear box it changed the
     result it was there to observe. Control, main's audit on the same box:
     44 of 45 markers placed at reveal, 26/26. With the per-marker version added:
     1 of 47 placed at reveal, 5 rows red. Placement was delayed past the 1800ms
     cap by the act of watching it.
     One timer over a pending set, at 50ms. BEAT_MS is 250, so 50ms still gives
     five samples per beat window, and grouping is a comparison between marker
     timings rather than an absolute, so the coarser tick shifts all of them
     alike. getComputedStyle is called only on markers not yet seen visible, and
     a marker leaves the set the moment it is. */
  const pending = new Map();
  const track = el => {
    if (!isMarker(el)) return;
    const rec = { add: now(), kind: POI.find(c => el.classList.contains(c)), vis: null, lat: null, poiIn: false };
    S.marks.push(rec);
    pending.set(el, { rec, t0: performance.now() });
  };
  setInterval(() => {
    if (!pending.size) return;
    for (const [el, { rec, t0 }] of pending) {
      if (el.classList.contains('poi-in')) rec.poiIn = true;
      if (+getComputedStyle(el).opacity > 0.01) {
        rec.vis = now(); rec.lat = Math.round(performance.now() - t0); pending.delete(el);
      } else if (performance.now() - t0 > 8000) pending.delete(el);
    }
  }, 50);
  const attach = () => {
    const root = document.documentElement || document.body;
    if (!root) { setTimeout(attach, 16); return; }
    new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      const cls = n.className || '';
      if (typeof cls === 'string' && POI_RE.test(cls)) track(n);
    } }).observe(root, { childList: true, subtree: true });
    /* THE REVEAL IS AN EVENT, NOT A SAMPLE. Off a 40ms poller it is quantised,
       and the same tick decided initial-batch-vs-straggler for every marker. */
    const watchStage = () => {
      const st = document.querySelector('#mapStage');
      if (!st) { setTimeout(watchStage, 16); return; }
      if (st.classList.contains('markers-in')) { S.reveal = now(); return; }
      const mo = new MutationObserver(() => {
        if (!st.classList.contains('markers-in')) return;
        mo.disconnect(); S.reveal = now();
      });
      mo.observe(st, { attributes: true, attributeFilter: ['class'] });
    };
    watchStage();
  };
  attach();
};

await page.evaluateOnNewDocument(BEAT_RECORDER);

await page.evaluateOnNewDocument(() => {
  /* Recorder for FAST scenario. Same shape as SLOW: reveal timestamp, count
     timeline for the reveal-time-visible check, poiInEver for SHAPE, and
     per-marker stragglers (addedAt/visibleAt) for LATENCY. The old +60ms
     window has been retired: measured 2026-08-13 that both fixed and pre-fix
     builds fail +60 whenever the environment produces a straggler, so the
     window was measuring tile-fetch jitter, not our code. LATENCY + SHAPE
     measure the mechanism we own and go red on the pre-fix path unchanged. */
  window.__arr = { t0: performance.now(), reveal: null, tl: [], poiInEver: false, stragglers: [], revealCount: null };
  const KINDS = { '.map-spawn': 'spawn', '.map-den-mark': 'den', '.map-mini-mark': 'mini',
    '.map-spire': 'spire', '.map-glutton-mark': 'glutton' };
  const POI_RE = /map-spawn|map-den-mark|map-mini-mark|map-spire|map-glutton-mark/;

  const trackStraggler = el => {
    const a = window.__arr;
    if (a.reveal == null) return;   // pre-reveal marker, part of the initial batch
    const addedAt = Math.round(performance.now() - a.t0);
    const t0 = performance.now();
    const iv = setInterval(() => {
      if (+getComputedStyle(el).opacity > 0.01) {
        clearInterval(iv);
        a.stragglers.push({ addedAt, visibleAt: Math.round(performance.now() - a.t0), latency: Math.round(performance.now() - t0) });
      } else if (performance.now() - t0 > 5000) {
        clearInterval(iv);
        a.stragglers.push({ addedAt, visibleAt: null, latency: null });
      }
    }, 20);
  };
  const attachMO = () => {
    const root = document.documentElement || document.body;
    if (!root) { setTimeout(attachMO, 20); return; }
    new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const cls = n.className || '';
        if (typeof cls === 'string' && POI_RE.test(cls)) trackStraggler(n);
      }
    }).observe(root, { childList: true, subtree: true });
  };
  attachMO();

  setInterval(() => {
    const a = window.__arr;
    const snap = { t: Math.round(performance.now() - a.t0) };
    /* VISIBLE markers, not DOM ones. This is the bug that let the Boneyard get
       reported fixed three times while it still trickled: a marker enters the DOM
       at the same instant either way, so counting nodes cannot tell a held marker
       from a shown one. MapLibre writes `opacity: 1` inline on every marker it
       owns, which beat the hide rule outright, and only computed opacity shows
       that. Count what the player can see. */
    /* MARKERS THE MAP OWNS, NOT EVERY NODE WEARING MARKER MARKUP. app.js
       mapLegendHtml() builds #mapLegend out of the REAL marker markup on
       purpose so the key cannot drift from the map, and #mapLegend sits INSIDE
       #mapStage, so the marker CSS applies to its swatches too. It is [hidden],
       i.e. display:none, and getComputedStyle().opacity does not return 0 for
       that: it returns the specified value, which is 1 once .markers-in lands.
       So the key counted as NINE permanently-visible markers, measured exactly:
       5 .map-spawn, 3 .map-den-mark, 1 .map-mini-mark.
       That is what "vis@reveal 9" was, in every run. Not markers inside the
       220ms fade. See docs/FLAKE-CLASSIFICATION-2026-08-22.md, whose mechanism
       for that number was wrong.
       maplibregl-marker is an ALLOWLIST and that is the point: map.js:200 does
       `new maplibregl.Marker({ element: el })`, so MapLibre stamps the class on
       exactly the nodes it owns and never on the key's copies. Excluding
       #mapLegend would work today and miss the next hidden thing built out of
       marker markup. closest() checks the node itself first, which is what we
       want, since `el` IS the .map-spawn node. */
    const owned = sel => [...document.querySelectorAll(sel)].filter(e => e.closest('.maplibregl-marker'));
    for (const [sel, k] of Object.entries(KINDS))
      snap[k] = owned(sel).filter(e => +getComputedStyle(e).opacity > 0.01).length;
    const last = a.tl[a.tl.length - 1];
    if (!last || Object.values(KINDS).some(k => last[k] !== snap[k])) a.tl.push(snap);
    const st = document.querySelector('#mapStage');
    if (st && st.classList.contains('markers-in') && a.reveal == null) {
      a.reveal = snap.t;
      a.revealCount = Object.values(KINDS).reduce((s, k) => s + snap[k], 0);
      /* DOM count at the same instant. The pair is the whole assertion: what
         placement had produced, versus what the player was shown. */
      a.revealDom = Object.keys(KINDS).reduce((s, sel) => s + owned(sel).length, 0);
      /* Decoys ADMITTED BY THE PREDICATE ABOVE, not decoys that exist. The key
         always renders 9 swatches; the question is whether the counter took
         them. Counting the former gives a row that can never be green. */
      a.revealDecoys = Object.keys(KINDS).reduce((s, sel) => s + owned(sel).filter(e => e.closest('#mapLegend')).length, 0);
    }
    /* SETTLED. `revealCount` above is sampled on the tick `.markers-in` lands,
       which is BEFORE the 220ms fade has raised computed opacity, so it reads
       near zero for anything transitioning. That is what broke the old MAJORITY
       row. Re-read once the fade has finished.
       WHY 400ms, measured 2026-08-22: the fade is 220ms, so this is 180ms of
       headroom. Verified under the contention profile that pushes the LATENCY
       row from 42ms to 461ms (four browser suites competing), three runs:
         run1 instant 49 -> settled 49
         run2 instant 49 -> settled 49
         run3 instant 10 -> settled 49   <- the artifact fired, settled corrected
       Run 3 is the case the old row got wrong: 10 of 49 is not a majority, on a
       build that was placing and showing all 49. If this ever reads short under
       load, raise the headroom; do not lower the row to match it. */
    if (a.reveal != null && a.revealSettled == null && snap.t >= a.reveal + 400) {
      a.revealSettled = Object.values(KINDS).reduce((s, k) => s + snap[k], 0);
    }
    if (!a.poiInEver && document.querySelector('#mapStage .map-spawn.poi-in, #mapStage .map-den-mark.poi-in, #mapStage .map-mini-mark.poi-in, #mapStage .map-spire.poi-in, #mapStage .map-glutton-mark.poi-in'))
      a.poiInEver = true;
  }, 40);
});

/* EVERY ROW IN THIS FILE IS THE BONEYARD, so every row needs a reachable vector
 * tile host. Without one, js/app.js swaps the map for its offline message and
 * this suite grades an empty stage. Measured on this container 2026-08-17 it
 * came out 11 green and 11 red, and SEVEN of the eleven greens were vacuous:
 *
 *   ARRIVAL every straggler fades in within 250ms      0 stragglers
 *   ARRIVAL stragglers appear via opacity fade         no .poi-in on 0 markers
 *   ARRIVAL-SLOW stragglers appear via opacity fade    same, on 0 markers
 *   ARRIVAL-SLOW total-pop backstop <=4000ms           final counts all zero
 *   PAN new POIs arrive in coordinated beats           0 beat(s), [] markers
 *   INTERACTED starts false after openMap              false stays false
 *   INTERACTED programmatic easeTo does NOT flip it    false stays false
 *
 * The first of those is the instructive one, because this file already knows
 * better: the ARRIVAL-SLOW twin of that same latency assertion carries
 * `slow.stragglers.length > 0 &&` and a comment explaining that a latency check
 * on an empty sample sails through green, and it correctly went RED. The plain
 * ARRIVAL twin was never given the same guard. Same file, same author, same
 * bug class, one row apart. That is the argument for measuring the environment
 * once at the top rather than per-row vigilance forever.
 *
 * COUNT-BASED, not name-based: two of the 23 rows build their name from a
 * template literal, so a list of quoted names cannot see them. The row count in
 * the source is what is asserted, so a new assertion added without extending
 * this block fails here rather than being graded against a dead map. */
const cls = unclassifiedRows(import.meta.url, []);

/* ---- BEATS: does the map ARRIVE, or trickle? -------------------------------
   A BEAT is every marker that becomes VISIBLE within one fade of the marker
   that opened it. FIXED WINDOW, not a gap-linked chain: a chain lets a 40-marker
   trickle at 240ms apiece read as one long beat, which is exactly the build the
   retired MAJORITY row was written to worry about. With a fixed window that
   build produces ~20 beats and fails on the count.

   Deliberately REVEAL-INDEPENDENT. Measured by Reggie 2026-08-20: the first beat
   lands 14-539ms after the reveal on a fast line and 1810-2168ms after it on a
   slow one, so no fixed offset describes both. Beats describe both without one.

   MAX_BEATS = 3 is the count of documented placement sources, not a tuned
   number. Each is a decision this repo already made:
     1  the reveal itself, carrying everything placeable without tiles
     2  the tile-informed pass, once queryRenderedFeatures can see water/roads
        (v372 fires the reveal on the 1800ms cap ahead of this on purpose)
     3  the spire, which needs its own network round trip
   Fast lines collapse 1 and 2 and land on two beats; a gated slow line uses all
   three. A fourth is a trickle.

   PROVENANCE 2026-08-23: ported from Reggie's stranded work and RE-MEASURED on
   current main before landing, because his version was written against an app
   16+ commits old. Numbers from that re-measurement are in the row output. */
const BEAT_MS = 250;      // one 220ms opacity transition plus slack
/* PROVENANCE 2026-08-23. A grouping claim needs enough markers to be able to
   FAIL. The first draft of these rows floored at "not zero" and a throttled run
   promptly passed on a sample of ONE: one marker is one beat, one beat is <= 3,
   green. That is the vacuous pass this file keeps re-learning. Ten is the same
   floor the ARRIVAL SAMPLE row uses and for the same reason: below it a trickle
   is not distinguishable from a small map. Measured on this fixture the same
   day: 44-47 markers on a healthy run, so the floor has wide clearance and only
   bites when the sample is genuinely degenerate. */
const BEAT_MIN_SAMPLE = 10;
const MAX_BEATS = 3;
const beatsOf = marks => {
  const beats = [];
  for (const m of marks.filter(m => m.vis != null).sort((a, b) => a.vis - b.vis)) {
    const b = beats[beats.length - 1];
    if (b && m.vis - b.start <= BEAT_MS) { b.n++; b.end = m.vis; }
    else beats.push({ start: m.vis, end: m.vis, n: 1 });
  }
  return beats;
};

const MAP_ROW_COUNT = 31;   // every ok() in this file except ROWS-COUNTED below
ok('ROWS-COUNTED every assertion in this file is Boneyard-dependent and accounted for',
  cls.callSites === MAP_ROW_COUNT + 1,
  `${cls.callSites} ok() rows in source, expected ${MAP_ROW_COUNT + 1}. If you added a row, it needs a line in the UNPROVEN block above it.`);

const mapCap = await boneyardCapability(page);
if (!mapCap.ok) {
  const why = 'the Boneyard could not draw on this machine';
  /* Named where the source names them, counted where it does not: the two
     template-literal rows are declared by their line so nothing is silent. */
  for (const n of cls.names.filter(n => !n.startsWith('ROWS-COUNTED'))) unproven(n, why);
  const unnamed = cls.callSites - 1 - cls.names.filter(n => !n.startsWith('ROWS-COUNTED')).length;
  for (let i = 1; i <= unnamed; i++) unproven(`ARRIVAL-SLOW straggler-latency row ${i} of ${unnamed} (name is built from a template literal, see source)`, why);
  await browser.close();
  if (srv) srv.kill();
  const f = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - f}/${results.length} of the checks that COULD run passed`);
  unprovenReport('boneyard-audit.mjs', mapCap);
  process.exit(exitFor(f));
}

await seed(page, { level: 18, coins: 500 });

await page.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(2500);
// the Boneyard opens on a location explainer; the map is behind its button
await page.evaluate(() => {
  /* The beat clock starts HERE, at the moment the player asks for the map, not
     at document creation. See BEAT_RECORDER above for why that distinction cost
     a wrong measurement. */
  if (window.__beat) window.__beat.entry = performance.now();
  const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
  if (b) b.click();
});
await sleep(8000);

const state = await page.evaluate(() => {
  const stage = document.querySelector('#mapStage');
  const act = document.querySelector('#mapAct');
  const vis = el => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
  };
  return {
    stage: !!stage,
    markersIn: !!document.querySelector('#mapStage.markers-in'),
    actExists: !!act,
    actHiddenAttr: act ? act.hidden : null,
    actVisible: vis(act),
    actText: act ? act.innerText.trim().replace(/\s+/g, ' ') : null,
    // is anything ACTUALLY in reach? the card's rule is a biconditional, and
    // asserting one half of it only works while the fixture happens to hold
    inReach: !!document.querySelector('.map-spawn.inrange'),
    screenText: (document.querySelector('#screen')?.innerText || '').replace(/\s+/g, ' ').slice(0, 160),
  };
});

ok('LOADS the Boneyard renders its map stage', state.stage, JSON.stringify({ stage: state.stage }));
ok('LOADS the marker layer gets revealed (not stuck invisible)', state.markersIn,
  `markers-in=${state.markersIn}`);
/* THE CARD IS ABOUT SPAWNS, so only spawns count here. Dens, spires and the
   Glutton each have their own button and their own reach, and since v312 a den
   reaches 80m against a spawn's 75, so a den can be legitimately in range while
   the card stays silent. Counting them made this check compare two different
   rules and fail on correct behaviour.
   SETTLE FIRST, THEN ASSERT. The `.inrange` class is toggled by the placement
   pass and the card is written by the position-update pass, so for a moment they
   can legitimately disagree and a single sample catches the app mid-stride: this
   check failed intermittently reporting inReach true against a card still saying
   "Reading the bones". Poll for agreement and only fail if it never arrives,
   which tests the rule rather than the timing. */
const settled = await (async () => {
  let last = null;
  for (let i = 0; i < 20; i++) {
    last = await page.evaluate(() => {
      const act = document.querySelector('#mapAct');
      const vis = el => {
        if (!el) return false;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
      };
      const text = act ? act.innerText.replace(/\s+/g, ' ').trim() : null;
      return {
        inReach: !!document.querySelector('.map-spawn.inrange'),
        exists: !!act, hiddenAttr: act ? act.hidden : null, visible: vis(act), text,
        tooFast: /too fast/i.test(text || ''),
      };
    });
    // the rule: the card shows exactly when something is in reach OR you are moving too fast
    if (last.exists && last.visible === (last.inReach || last.tooFast)) return last;
    await sleep(500);
  }
  return last;
})();

/* THE CARD IS ON SCREEN IF AND ONLY IF SOMETHING IS IN REACH.
   This used to assert only the empty half, on the assumption that a fixed test
   coordinate has nothing in range. That assumption expired the moment the reach
   radii went up in v312 (spawns 75m, dens 80m): a Bone cache came into range and
   the check failed for the app behaving correctly. Asserting the biconditional
   tests the actual rule and cannot go stale when the numbers are tuned again.
   `hidden` alone is never proof either way: the original bug was an element
   carrying hidden=true while still painting. */
ok('BAR the action card is on screen exactly when something is in reach',
  settled.exists && settled.visible === (settled.inReach || settled.tooFast)
    && settled.hiddenAttr === !(settled.inReach || settled.tooFast),
  JSON.stringify(settled));
/* AND THE OTHER HALF. The fixture above stands next to a Bone cache, so it only
   ever exercises the visible branch; the bug this file was written for lives in
   the HIDDEN branch (.map-act sets display:flex, which beats the UA stylesheet's
   [hidden]{display:none}, so the card carried hidden=true while still painting).
   Walk out to open ocean, where placeWalkable rejects every candidate and nothing
   can be in reach, and check the card is genuinely gone.
   PROVE-RED (confirmed 2026-08-08): set `.map-act[hidden] { display: flex }` and
   EMPTY fails with stillVisible true. */
/* The arrival timeline belongs to the FIRST load, so read it before the reload
   below replaces the page (and with it window.__arr). Asserted further down. */
const arr = await page.evaluate(() => window.__arr);
const beatDecoys = p => p.evaluate(() => {
  /* Exercise the marker predicate against the nodes it MUST reject. `present`
     proves the test is not vacuous (the key really is in the DOM, wearing marker
     markup); `admitted` is the thing that must be zero. */
  /* The five marker classes, 2026-08-23. Same list KINDS is keyed on, restated
     because this runs in page context where KINDS is not in scope. Not a
     tunable: a sixth marker type belongs in both places. */
  const POI = ['map-spawn', 'map-den-mark', 'map-mini-mark', 'map-spire', 'map-glutton-mark'];
  const inLegend = [...document.querySelectorAll('#mapLegend *')].filter(e => POI.some(c => e.classList.contains(c)));
  return { present: inLegend.length, admitted: inLegend.filter(e => e.classList.contains('maplibregl-marker')).length };
});
const beat = await page.evaluate(() => window.__beat);
beat.decoy = await beatDecoys(page);
/* Final DOM count, read after everything has settled. Paired with revealDom it
   answers "was placement essentially finished when we revealed", which is the
   half of the old MAJORITY row worth keeping. */
const domCounts = await page.evaluate(() => {
  /* The five marker classes, 2026-08-23: the same list KINDS is keyed on above,
     restated here because this runs in page context where KINDS is not in scope.
     Not a tunable. If a sixth marker type ships it belongs in both places, and
     ROWS-COUNTED will not catch that, so this comment is the only warning. */
  const SELS = ['.map-spawn', '.map-den-mark', '.map-mini-mark', '.map-spire', '.map-glutton-mark'];
  /* THE COUNTED SET, defined once, so the decoy figure below is derived from the
     SAME predicate rather than from a parallel expression that can drift out of
     agreement with it. The first draft counted `#mapLegend .map-spawn` directly,
     which reports 9 whether the scoping works or not, so the row could never go
     green and would have shipped permanently red. */
  const counted = SELS.flatMap(sel => [...document.querySelectorAll(sel)])
    .filter(e => e.closest('.maplibregl-marker'));
  return { total: counted.length, decoys: counted.filter(e => e.closest('#mapLegend')).length };
});
arr.finalDom = domCounts.total;
arr.legendDecoys = domCounts.decoys;

/* AND THE OTHER HALF, on a FRESH LOAD. The fixture above stands next to a Bone
   cache, so it only exercises the visible branch; the bug this file exists for
   lives in the HIDDEN branch (.map-act sets display:flex, which beats the UA
   stylesheet's [hidden]{display:none}, so the card carried hidden=true while
   still painting).
   It has to be a fresh load rather than a walk: the card's real rule is
   `(inReach || tooFast)`, and ANY jump big enough to clear every POI is by
   definition too fast to loot, so the app correctly keeps the card up saying so.
   Starting cold at sea means no previous fix, no speed, and nothing placeable
   (placeWalkable rejects water), which is the only way to reach the empty state.
   PROVE-RED (confirmed 2026-08-08): set `.map-act[hidden] { display: flex }` and
   EMPTY fails with stillVisible true. */
await page.setGeolocation({ latitude: 48.0, longitude: -140.0 });
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2200);
await page.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(2500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
  if (b) b.click();
});
await sleep(9000);
const empty = await page.evaluate(() => {
  const act = document.querySelector('#mapAct');
  const vis = el => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
  };
  return {
    inReach: !!document.querySelector('.map-spawn.inrange'),
    hiddenAttr: act ? act.hidden : null,
    stillVisible: vis(act),
    text: act ? act.innerText.replace(/\s+/g, ' ').trim() : null,
  };
});
ok('EMPTY starting cold at sea, nothing in reach, so the card is genuinely gone',
  empty.inReach === false && !/too fast/i.test(empty.text || '')
    && empty.hiddenAttr === true && empty.stillVisible === false,
  JSON.stringify(empty));

ok('STALE the loading placeholder is not left on screen',
  !/reading the bones/i.test(state.screenText),
  state.screenText);

/* ARRIVAL contract, retired the +60ms window on 2026-08-13.
   The +60ms rule was measuring tile-fetch jitter, not our code: pre-fix
   build on the fast puppet failed +60 on 10/10 runs (pop 1479-2238ms via
   the 1200ms poi-arriving hold), the fixed build failed +60 on ~2/6 runs
   (pop 198-239ms via the 220ms fade). Both fail when the environment
   produces a straggler, both pass when it does not. That is measuring the
   network, and by Gwart's own rule 5 (does the assertion change when the
   CODE changes with the environment held constant?) it was not measuring
   the code. Retired.
   In its place: the same LATENCY + SHAPE + MAJORITY contract as the SLOW
   scenario, applied to the fast puppet with the same 250ms per-marker
   budget. Bounded by our CSS transition, not by tile latency.
   WHAT THE +60ms ROW USED TO ENCODE, on record so the gap is not silent:
   "on a good network, almost nothing arrives late". LATENCY + SHAPE do not
   catch a hypothetical build that reveals stupidly early with 40 markers
   trickling in at 240ms each: each marker would be under the LATENCY
   budget and no `.poi-in` would appear.

   MAJORITY IS RETIRED, 2026-08-22 (Tom: "fix the arrival guard, it's stale").
   It asserted `revealCount * 2 > finalCount`, and `revealCount` was sampled on
   the polling tick where `.markers-in` first appears. That is BEFORE the 220ms
   opacity transition has run, so computed opacity reads near zero for every
   marker still fading. The row was measuring the first frame of an animation
   and calling it the reveal.
   MEASURED on clean main at f18d479f, 2026-08-22:
       dom@reveal 65   vis@reveal 9   vis@reveal+400ms 65   dom@reveal+400ms 65
   Nothing was withheld and nothing arrived late: the map does arrive whole, and
   the row was red on a build that was behaving correctly. Its historical passes
   were luck rather than verification. With the old ~11-15 markers, the handful
   that were already opaque cleared a majority of 15; at 65 markers the same
   mis-timed sample cannot clear the bar no matter how correct the build is.
   The count changing is what exposed it, but the count was never the defect.

   IN ITS PLACE, two rows that sample AFTER the fade settles:
     - "showed every marker it already had" (revealSettled >= revealDom), which
       is what "arrives whole" actually means and is the direct guard on Tom's
       2026-08-08 complaint, "it looks cheap when everything staggers in".
     - "placement was essentially finished before the reveal fired"
       (revealDom * 2 > finalDom), which keeps the half of MAJORITY worth
       keeping: a build that reveals stupidly early with everything still to
       come. This counts PLACEMENT, not visibility, so it does not re-import the
       timing bug that broke MAJORITY.
   Both are environment-independent, which is the standard that retired the
   +60ms row above: the assertion must not move when the network moves with the
   code held constant. `finalCount` was network-dependent by construction, since
   on a throttled line the final total includes whatever the network delivers.

   RESIDUAL GAP, on record so it is not silent: a build that revealed before
   placement produced ANYTHING would show 0 of 0 and pass both rows. The
   "markers were actually counted" and "reveal happened at all" rows above are
   what stand between that and a green suite. */
ok('ARRIVAL the reveal happened at all (never revealing is a FAILURE)',
  arr.reveal != null, `reveal at ${arr.reveal}ms`);
ok('ARRIVAL markers were actually counted (an empty timeline is a FAILURE)',
  arr.tl.length >= 2, `${arr.tl.length} count changes recorded`);
/* TWO CHECKS, NOT ONE, BECAUSE THEY HAVE DIFFERENT CAUSES AND DIFFERENT ANSWERS.
   The rows below are shaped `revealDom > 0 && <comparison>`. Before the scoping
   above, #mapLegend handed them nine permanently-visible nodes, so on a Boneyard
   that drew ZERO real markers revealDom was 9, revealSettled was 9, and `9 >= 9`
   and `9*2 > 9` both passed. Two green rows over an empty map, shipped in the
   same PR as the ratchet against that class.

   Scoping makes the counts honest but does NOT close it, because honest zeros
   still leave `revealDom > 0` as the only floor. So the floor is asserted here.

   The FIRST draft of this was one row asserting the floor AND the decoys, as a
   FAIL. That was wrong, and a degraded run on this box proved it within the
   hour: real markers 0, so the row went red, and a red row says "the code is
   broken" when the truth was "this machine could not host the map". Shipping
   that costs a wasted investigation every time somebody runs the suite on a
   busy laptop. The two failure modes are:

     a decoy leaks back into the count  -> a CODE regression, environment
       independent, deterministic. That is a FAIL and it is the row below.
     the map drew nothing at all        -> a HOSTING fact, and the honest verdict
       is UNPROVEN (exit 97), the mechanism boneyard-icon-audit already uses to
       refuse a pass it cannot back. boneyardCapability() above does not catch
       this: it proves a WebGL context can be created, not that placement ever
       finished, which is exactly how the degraded run got past it.

   FLOOR is deliberately low: boneyard-supply-audit owns density and measures
   13.5 spawns per viewport against a floor of 8. This is a reach check, not a
   second density guard. Measured on this fixture: 65 nodes carrying marker
   markup, 9 of them the key, 56 owned by MapLibre. */
/* PROVENANCE, 2026-08-23. Not a density bar, a reach floor, and it is set well
   under what the map actually draws so it can only fail when the sample is
   absent rather than merely thin. Measured on this fixture the same day, two
   clean runs: 55 MapLibre-owned markers at rest / 54 at reveal, and 58 / 57 on
   the run after it. boneyard-supply-audit owns density and pins 13.5 spawns per
   viewport against a floor of 8; duplicating that here would give two rows that
   fail together for one cause. */
const MIN_PLAUSIBLE_MARKERS = 10;
/* revealDecoys is only GRADEABLE if a reveal happened. On a run where it never
   fired it is undefined, and `undefined === 0` is false, so the first draft of
   this row went RED on a machine that simply did not draw the map. That is the
   same mistake the SAMPLE row above exists to avoid, one row apart, and it is
   the second time today this file has been given a guard that reports a hosting
   fact as a code defect. legendDecoys stays hard-graded either way: the final
   DOM is countable whether or not the reveal fired. */
const revealMeasured = arr.revealDom != null;
ok('ARRIVAL the legend is not counted as markers (a decoy in the count is a code regression, and it made the two rows below unable to fail)',
  arr.legendDecoys === 0 && (!revealMeasured || arr.revealDecoys === 0),
  `${arr.legendDecoys} decoy(s) in the final count and ${revealMeasured ? arr.revealDecoys : 'not graded (no reveal this run)'} at reveal, both must be 0 when measured. Guarding BOTH sites on purpose: reverting only the recorder's scoping leaves the final count clean and inflates revealDom, which a single-site check would pass. The key is built from real marker markup, sits inside #mapStage, and [hidden] does not zero computed opacity, so it used to supply exactly 9`);

if (!(arr.finalDom > 0)) {
  unproven('ARRIVAL the map drew a plausible sample (SAMPLE: the floor the two rows below stand on)',
    `the map drew 0 MapLibre-owned markers on this machine, so there is no sample to grade. Not a code failure: boneyardCapability passed, meaning WebGL works, but placement never produced a marker. Seen on a contended box 2026-08-23`);
} else {
  ok('ARRIVAL the map drew a plausible sample (SAMPLE: the floor the two rows below stand on)',
    arr.finalDom >= MIN_PLAUSIBLE_MARKERS && arr.revealDom >= MIN_PLAUSIBLE_MARKERS,
    `${arr.finalDom} MapLibre-owned markers at rest and ${arr.revealDom} at reveal, floor ${MIN_PLAUSIBLE_MARKERS}`);
}
ok('ARRIVAL the reveal SHOWED every marker it already had (nothing placed was withheld to fade in afterwards)',
  arr.revealDom > 0 && arr.revealSettled != null && arr.revealSettled >= arr.revealDom,
  `${arr.revealSettled ?? 'null'} visible once the fade settled, against ${arr.revealDom ?? 'null'} already placed at reveal (the reveal-instant reading is ${arr.revealCount}, mid-fade, which is what the retired MAJORITY row graded)`);
ok('ARRIVAL placement was essentially finished before the reveal fired (revealing with almost nothing placed is not "arrives whole")',
  arr.finalDom > 0 && arr.revealDom * 2 > arr.finalDom,
  `${arr.revealDom}/${arr.finalDom} markers placed at reveal`);

/* ---- BEATS ---------------------------------------------------------------
   The arrival-GROUPING rows. Everything else in this file measures WHAT was
   visible at some instant; these measure HOW MANY WAVES the player saw, which
   is the actual 2026-08-08 complaint ("it looks cheap when everything staggers
   in") and was untested on main until now. */
{
  const B = beatsOf(beat.marks || []);
  const seen = (beat.marks || []).filter(m => m.vis != null).length;
  /* PREMISE first. Beat rows on an empty sample are vacuously green: zero
     markers is zero beats, which is <= 3. This is the same empty-sample trap
     the ARRIVAL-SLOW latency row was given a guard for and its fast twin was
     not. UNPROVEN, not FAIL, when the map drew nothing: that is a hosting fact,
     not a code defect. */
  if (seen < BEAT_MIN_SAMPLE) {
    unproven('BEATS the map drew a sample to group (PREMISE: a small sample cannot fail the grouping row below)',
      `only ${seen} marker(s) became visible, floor ${BEAT_MIN_SAMPLE} on this machine, so grouping cannot be graded. beat.marks tracked ${(beat.marks || []).length}, reveal ${beat.reveal}`);
  } else {
    ok('BEATS the map drew a sample to group (PREMISE: a small sample cannot fail the grouping row below)',
      true, `${seen} of ${beat.marks.length} tracked markers became visible`);
  }
  /* The predicate that keeps the key out of `marks` is otherwise self-certifying:
     a legend node it wrongly admits is indistinguishable from a marker once it is
     in the array. Counting rejections is what makes it checkable. */
  ok('BEATS the map key is present and the marker predicate rejects all of it',
    beat.decoy.present === 9 && beat.decoy.admitted === 0,
    `${beat.decoy.present} #mapLegend nodes wearing marker markup (must be 9: 5 spawn + 3 den + 1 mini, or the check is vacuous), ${beat.decoy.admitted} of them admitted by the predicate (must be 0)`);
  if (seen >= BEAT_MIN_SAMPLE) {
    ok(`BEATS the markers arrive in at most ${MAX_BEATS} coordinated beats, never a per-marker trickle`,
      B.length > 0 && B.length <= MAX_BEATS,
      `${B.length} beat(s) of [${B.map(b => b.n).join(', ')}] markers, window ${BEAT_MS}ms, fast line. Ceiling ${MAX_BEATS} is the count of documented placement sources: the reveal, the tile-informed pass, and the spire's round trip`);
  } else {
    unproven(`BEATS the markers arrive in at most ${MAX_BEATS} coordinated beats, never a per-marker trickle`,
      'no visible markers to group');
  }
}

const badFastLatencies = arr.stragglers.filter(s => s.latency == null || s.latency > 250);
ok('ARRIVAL every straggler fades in within 250ms of DOM add (LATENCY: bounded by our 220ms opacity transition, not by tile jitter)',
  badFastLatencies.length === 0,
  arr.stragglers.length === 0
    ? '0 stragglers (all POIs placed pre-reveal, the fast happy path)'
    : badFastLatencies.length
      ? `${badFastLatencies.length}/${arr.stragglers.length} stragglers exceeded: ${JSON.stringify(badFastLatencies.slice(0, 3))}`
      : `all ${arr.stragglers.length} stragglers within budget: max ${Math.max(...arr.stragglers.map(s => s.latency))}ms`);
ok('ARRIVAL stragglers appear via opacity fade, not the trickle-guard poi-in scale (SHAPE: the 1200ms poi-arriving+poi-in flush is the pre-fix bug)',
  arr.poiInEver === false,
  arr.poiInEver ? 'saw .poi-in class on at least one marker after reveal (holdArrival !interacted branch not owning the initial second wave)' : 'no .poi-in class seen; fade path owned the second wave');

/* ---- PANNING, which is where it actually trickles ------------------------------
   Tom, 2026-08-08: "you've told me multiple times that the boneyard doesn't load
   POIs differently anymore. It does. It still doesn't load cleanly, things
   trickle in."
   First load was clean and this audit only ever tested first load. Looking around
   is the other half: POIs found while you pan were born after `markers-in`, so
   they appeared one at a time. Measured before the fix: three separate visible
   arrivals spread over 1281ms after a single pan.
   PROVE-RED: drop `holdArrival` from js/map.js domMarker and this fails with
   multiple arrival timestamps. */
/* The EMPTY check above parks the map at sea on purpose, so panning from there
   finds nothing and the guard below would pass by never running. Go back to a
   POI-rich location and wait for a full arrival FIRST, or this check cannot
   fail (anti-regression rule 1) and an empty sample is a failure (rule 3). */
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1200);
await page.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(2500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
  if (b) b.click();
});
await sleep(14000);

const VIS = `[...document.querySelectorAll('.map-spawn, .map-den-mark, .map-mini-mark, .map-spire, .map-glutton-mark')].filter(e => +getComputedStyle(e).opacity > 0.01).length`;
await page.evaluate(v => {
  window.__pan = { t0: performance.now(), tl: [] };
  setInterval(() => {
    const n = eval(v);
    const last = window.__pan.tl[window.__pan.tl.length - 1];
    if (!last || last.n !== n) window.__pan.tl.push({ t: Math.round(performance.now() - window.__pan.t0), n });
  }, 40);
}, VIS);
await page.evaluate(() => { const m = window.__map || window.map; if (m) m.panBy([320, 260], { duration: 700 }); });
await sleep(12000);
const pan = await page.evaluate(() => window.__pan.tl);
const arrivals = pan.slice(1);   // [0] is the baseline count, not an arrival
const panBaseline = pan.length ? pan[0].n : 0;
ok('PAN the map actually had markers to work with (an empty sample is a FAILURE)',
  panBaseline > 0, `baseline ${panBaseline} visible markers`);
/* Placement genuinely resolves in two waves ~2.6s apart, so "one beat" would
   mean a blank map for 6.6s after every pan. The rule is that markers arrive in
   COORDINATED BEATS rather than one at a time: at most two, never a per-marker
   trickle. Before the fix this was three separate arrivals over 1281ms and the
   count rose by one each time. */
const perBeat = arrivals.map((a, i) => a.n - (i ? arrivals[i - 1].n : panBaseline));
ok('PAN new POIs arrive in coordinated beats, not one marker at a time',
  arrivals.length <= 2,
  `${arrivals.length} beat(s), ${JSON.stringify(perBeat)} markers each: ${JSON.stringify(pan)}`);

await browser.close();

/* ---- SLOW-TILE ARRIVAL, the contract Tom's real device sees ------------------
   The fast ARRIVAL above measures a puppeteer local server delivering tiles
   near-instantly, which is not the case that broke. Tom's device fetches tiles
   from openfreemap over a real network round trip: measured 2026-08-12 with
   SLOW_TILES=800 (each tile request delayed 800ms), the pre-v371 build
   revealed at ~1200ms with SOME markers and popped the rest in 2200ms later
   via a 1200ms hold + poiPop scale (that is the bug this file was extended
   for). v371 fixed the pop-in by delaying the reveal to 3200ms, and Tom
   complained that was too slow. v372's fix (ext/boneyard-speed): keep the
   `if (map.loaded()) placedOnce = true;` gate, drop the hard cap from 4000ms
   to 1800ms so the cap fires the reveal on slow lines, and route the tile-
   informed second wave through the standard markers-in opacity transition
   (map.js:holdArrival's !interacted branch) rather than the pan trickle-guard
   flush. Measured with SLOW_TILES=800, N=5 medians: reveal 1879ms, last
   2401ms, pop 519ms via 220ms opacity fades, no `.poi-in` class touched.

   Contract this locks, and it deliberately does NOT assert on total pop
   because total pop is bounded by tile latency (a property of the network,
   not our code). Optimising for a tight total-pop number would mean hiding
   the map until slow tiles arrive, which is exactly what v371 did and Tom
   rejected. Instead assert on the two properties we OWN:

     ADD-TO-VISIBLE LATENCY  each straggler must become visible within
       250ms of being added to the DOM (one 220ms opacity transition plus
       slack). This is what map.js:holdArrival's !interacted branch owns.
       Not affected by tile latency: a marker added at t=3170ms because
       tiles arrived at t=3170ms MUST still fade in by t=3420ms.
     FADE SHAPE  no POI marker ever carries `.poi-in` during the initial
       load. That class is the trickle-guard flush signature; seeing it
       means the initial second wave took the pan-batched branch instead
       of the fade branch.

   Plus TWO guards against sample-degeneracy that would let a broken build
   sail through with a perfect latency score:

     STRAGGLER COUNT  a slow run MUST observe at least one straggler.
       Zero stragglers means either the map never revealed or no markers
       were ever added, and either way the latency assertion is vacuous.
     TOTAL POP BACKSTOP  pop <= 3000ms. NOT the contract, a screaming
       backstop for pathological cases like the cap never firing.

   PROVE-RED (confirmed 2026-08-12):
     - revert `if (map.loaded()) placedOnce = true;` AND remove holdArrival's
       !interacted branch (v370 pre-fix): reveal fires eagerly at ~1200ms,
       stragglers go through poi-arriving + 1200ms hold + poi-in flush, so
       ADD-TO-VISIBLE LATENCY fires (measured 1200ms+ per straggler) AND
       SHAPE fires (poi-in seen). Confirmed reveal=1225 last=3303 pop=2078,
       both slow-block assertions red.
     - remove ONLY the !interacted branch (keep the gate): same, latency
       red on the stragglers that appear when the cap fires ahead of the
       gate, shape red on the same stragglers.
     - HARNESS-ONLY cap forced to 500 (proves the assertions can fire on
       the fast path too, not just this slow one): ARRIVAL fast row goes
       red at +961ms, SHAPE stays GREEN (fade path still working, just
       fired early), BACKSTOP stays green, so the latency-per-marker vs
       shape distinction is doing its job. */
/* Fresh boot so the fast-run instrumentation and route history do not spill
   into the slow-tile measurement. boot() handles ?demo + dismissOverlays. */
const { browser: slowBrowser, page: slowPage } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await slowBrowser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
await slowPage.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });
await slowPage.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
/* Interception installed AFTER boot: the initial /?demo goto has already
   completed, and hash-routing to #/boneyard triggers map init in-page, so
   tile fetches happen with the delay active.
   TILE DELAY chosen so the scenario RELIABLY produces stragglers WITHOUT
   pushing total pop past the 3000ms backstop. N=5 consecutive full-audit
   runs per candidate:
     SLOW_TILES=800   4/5 bite  (one run reveal=2085 pop=40   0 stragglers)
     SLOW_TILES=1200  4/5 bite  (one run reveal=1878 pop=0    0 stragglers)
     SLOW_TILES=2000  5/5 bite  (see below)
     SLOW_TILES=2500  5/5 bite  BUT backstop fires every run (pop 3600-4700)
                                because sequential tile loads sum past 3s.
   The rule is `delay > cap`. Any tile delay less than the 1800ms cap risks
   a race where tiles happen to complete just before or with the cap, all
   placement finishes in one pass, and the slow-run produces zero
   stragglers. The empty-sample and count>0 guards catch that (as they
   should: an empty-sample slow row is a broken scenario), but a scenario
   that only sometimes exercises the mechanism it exists to test is a
   coin-flip guard and gets ignored inside a week.
   2000 is the smallest value strictly greater than the cap and small
   enough to keep total pop under the 3000ms backstop, so pick it. The
   backstop stays what it says: a screaming pathological guard, not the
   contract; it does not fire on this scenario. */
await slowPage.setRequestInterception(true);
slowPage.on('request', req => {
  if (/openfreemap|openmaptiles|\.pbf|tiles\./.test(req.url())) setTimeout(() => req.continue(), 2000);
  else req.continue();
});
await slowPage.evaluateOnNewDocument(BEAT_RECORDER);
await slowPage.evaluateOnNewDocument(() => {
  /* Recorder for the slow-tile scenario. Tracks:
       tl        opacity-based visible-count timeline (for backstop pop)
       reveal    when `.markers-in` was added
       poiInEver whether `.poi-in` was ever seen (SHAPE assertion)
       stragglers per-marker addedAt/visibleAt for the ADD-TO-VISIBLE latency
                  assertion. Only counted if added AFTER reveal (initial
                  second wave); markers added pre-reveal fade in via the
                  markers-in class transition on the whole batch, which is a
                  different mechanism and outside this contract.
     evaluateOnNewDocument survives seed()'s reload (see godmode.js:196). */
  window.__slow = { entry: null, reveal: null, tl: [], poiInEver: false, stragglers: [], revealCount: null };
  const POI = '.map-spawn, .map-den-mark, .map-mini-mark, .map-spire, .map-glutton-mark';
  const KINDS = { '.map-spawn': 'spawn', '.map-den-mark': 'den', '.map-mini-mark': 'mini',
    '.map-spire': 'spire', '.map-glutton-mark': 'glutton' };

  const trackStraggler = el => {
    const s = window.__slow;
    if (s.reveal == null) return;                        // not a straggler, part of the initial batch
    const addedAt = Math.round(performance.now() - s.entry);
    const t0 = performance.now();
    const iv = setInterval(() => {
      if (+getComputedStyle(el).opacity > 0.01) {
        clearInterval(iv);
        s.stragglers.push({ addedAt, visibleAt: Math.round(performance.now() - s.entry), latency: Math.round(performance.now() - t0) });
      } else if (performance.now() - t0 > 5000) {
        clearInterval(iv);
        s.stragglers.push({ addedAt, visibleAt: null, latency: null });    // never became visible
      }
    }, 20);
  };
  /* MutationObserver picks up MapLibre's DOM marker attachment. evaluateOnNewDocument
     fires before the DOM is parsed so document.documentElement can be null;
     wait for it to exist, then observe. */
  const attachMO = () => {
    const root = document.documentElement || document.body;
    if (!root) { setTimeout(attachMO, 20); return; }
    const mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const cls = n.className || '';
        if (typeof cls !== 'string') continue;
        if (/map-spawn|map-den-mark|map-mini-mark|map-spire|map-glutton-mark/.test(cls)) trackStraggler(n);
      }
    });
    mo.observe(root, { childList: true, subtree: true });
  };
  attachMO();

  setInterval(() => {
    const s = window.__slow;
    if (s.entry == null) return;
    const snap = { t: Math.round(performance.now() - s.entry) };
    for (const [sel, k] of Object.entries(KINDS))
      snap[k] = [...document.querySelectorAll(sel)].filter(e => +getComputedStyle(e).opacity > 0.01).length;
    const last = s.tl[s.tl.length - 1];
    if (!last || Object.values(KINDS).some(k => last[k] !== snap[k])) s.tl.push(snap);
    const st = document.querySelector('#mapStage');
    if (st && st.classList.contains('markers-in') && s.reveal == null) {
      s.reveal = snap.t;
      s.revealCount = Object.values(KINDS).reduce((sum, k) => sum + snap[k], 0);
      s.revealDom = Object.keys(KINDS).reduce((sum, sel) => sum + document.querySelectorAll(sel).length, 0);
    }
    if (s.reveal != null && s.revealSettled == null && snap.t >= s.reveal + 400) {
      s.revealSettled = Object.values(KINDS).reduce((sum, k) => sum + snap[k], 0);
    }
    if (!s.poiInEver && document.querySelector('#mapStage .map-spawn.poi-in, #mapStage .map-den-mark.poi-in, #mapStage .map-mini-mark.poi-in, #mapStage .map-spire.poi-in, #mapStage .map-glutton-mark.poi-in'))
      s.poiInEver = true;
  }, 40);
});
await seed(slowPage, { level: 18, coins: 500 });
await slowPage.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(2500);
await slowPage.evaluate(() => {
  window.__slow.entry = performance.now();
  if (window.__beat) window.__beat.entry = performance.now();
  const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
  if (b) b.click();
});
await sleep(10000);

const slow = await slowPage.evaluate(() => window.__slow);
const slowBeat = await slowPage.evaluate(() => window.__beat);
slowBeat.decoy = await beatDecoys(slowPage);
const slowLast = slow.tl[slow.tl.length - 1] || { t: null };
const slowPop = (slow.reveal != null && slowLast.t != null) ? slowLast.t - slow.reveal : null;
const STRAGGLER_LATENCY_MS = 250;   // one 220ms opacity transition plus slack
/* POP_BACKSTOP is a screaming pathological guard (cap never fires, hung
   refresh, recorder broke), not a contract. Original guess was 3000ms, but
   measured 5/5 audit runs at SLOW_TILES=2000 sit at pop 2638-2800ms (93%
   headroom). A backstop that sits inside jitter distance of the normal
   scenario is one bad run from being the flaky row that gets ignored.
   4000ms gives ~33% headroom over the audit's own scenario while still
   catching pathological cases: a hung cap or dead refresh leaves pop at
   the full sleep duration (~10000ms), which is well past 4000. */
const POP_BACKSTOP_MS = 4000;


/* ---- BEATS-SLOW ------------------------------------------------------------
   Same grouping question on a throttled line, which is the case the beat model
   exists for: v372 fires the reveal on the 1800ms cap AHEAD of the tile-informed
   pass, so a slow line legitimately uses all three placement sources where a
   fast line collapses two of them. If the ceiling is going to be wrong anywhere
   it is here. */
{
  const B = beatsOf(slowBeat.marks || []);
  const seen = (slowBeat.marks || []).filter(m => m.vis != null).length;
  if (seen < BEAT_MIN_SAMPLE) {
    unproven('BEATS-SLOW the map drew a sample to group (PREMISE: a small sample cannot fail the grouping row below)',
      `only ${seen} marker(s) became visible, floor ${BEAT_MIN_SAMPLE} under throttled tiles. tracked ${(slowBeat.marks || []).length}, reveal ${slowBeat.reveal}`);
    unproven(`BEATS-SLOW the markers arrive in at most ${MAX_BEATS} coordinated beats, never a per-marker trickle`,
      'no visible markers to group');
  } else {
    ok('BEATS-SLOW the map drew a sample to group (PREMISE: a small sample cannot fail the grouping row below)',
      true, `${seen} of ${slowBeat.marks.length} tracked markers became visible`);
    ok(`BEATS-SLOW the markers arrive in at most ${MAX_BEATS} coordinated beats, never a per-marker trickle`,
      B.length > 0 && B.length <= MAX_BEATS,
      `${B.length} beat(s) of [${B.map(b => b.n).join(', ')}] markers, window ${BEAT_MS}ms, throttled line. All three sources are legitimate here: the 1800ms cap reveal, the tile-informed pass, and the spire`);
  }
  ok('BEATS-SLOW the map key is present and the marker predicate rejects all of it',
    slowBeat.decoy.present === 9 && slowBeat.decoy.admitted === 0,
    `${slowBeat.decoy.present} #mapLegend nodes wearing marker markup (must be 9), ${slowBeat.decoy.admitted} admitted (must be 0)`);
}

ok('ARRIVAL-SLOW the reveal happened at all under real-network tile timing (never revealing is a FAILURE)',
  slow.reveal != null, `reveal at ${slow.reveal}ms from Boneyard entry`);
ok('ARRIVAL-SLOW markers were actually counted (an empty timeline is a FAILURE)',
  slow.tl.length >= 2, `${slow.tl.length} count changes recorded`);
/* At least one straggler must be observed. Zero stragglers means either the
   map revealed with everything already placed (which would be great, but only
   happens if the cap is above the slow-tile arrival time, which defeats the
   point of the slow contract) OR the map never revealed at all. Either way
   the latency assertion below would pass vacuously, so fail here first. */
ok('ARRIVAL-SLOW at least one straggler was observed (empty sample is a FAILURE: latency assertion would pass vacuously)',
  slow.stragglers.length > 0,
  `${slow.stragglers.length} stragglers tracked`);
/* HELD-BACK, the same check as the fast row and for the same reason (see the
   MAJORITY retirement note above, 2026-08-22). Deliberately NOT paired with the
   fast row's placement-completeness twin: this scenario throttles the network on
   purpose, so placement here is network-bound and `revealDom vs finalDom` would
   be grading the throttle rather than the code. Withholding is still fully
   testable on a slow line, because it compares what was shown against what was
   placed AT THAT MOMENT, whenever that moment happens to be. */
ok('ARRIVAL-SLOW the reveal SHOWED every marker it already had (nothing placed was withheld to fade in afterwards)',
  slow.revealDom > 0 && slow.revealSettled != null && slow.revealSettled >= slow.revealDom,
  `${slow.revealSettled ?? 'null'} visible once the fade settled, against ${slow.revealDom ?? 'null'} already placed at reveal (reveal-instant reading ${slow.revealCount}, mid-fade)`);
/* THE CONTRACT: each straggler fades in within 250ms of being added. Bounded
   by the CSS opacity transition (220ms), NOT by tile latency. A marker added
   at t=3170ms because tiles arrived at t=3170ms must still fade in by 3420ms.
   The pre-fix trickle path held for 1200ms before flushing, so this goes red
   the moment holdArrival's !interacted branch stops owning the second wave. */
const badLatencies = slow.stragglers.filter(s => s.latency == null || s.latency > STRAGGLER_LATENCY_MS);
/* Precondition check on THIS row too, not just the row above. Two rows can
   both be right about the same thing; that is defence in depth. Without this
   guard `Math.max(...[])` is -Infinity, `sorted[floor(-.5)]` is undefined,
   and the assertion prints nonsense evidence as it sails through green on a
   sample of zero. The empty-sample row beside this is the primary guard, but
   a latency check that CANNOT self-verify its own input is a bug in a test,
   which is still a bug. */
ok(`ARRIVAL-SLOW every straggler fades in within ${STRAGGLER_LATENCY_MS}ms of DOM add (bounded by our 220ms opacity transition, not by tile latency)`,
  slow.stragglers.length > 0 && badLatencies.length === 0,
  slow.stragglers.length === 0
    ? 'no stragglers in the sample; latency cannot be measured on an empty set (see empty-sample row above)'
    : badLatencies.length
      ? `${badLatencies.length}/${slow.stragglers.length} stragglers exceeded: ${JSON.stringify(badLatencies.slice(0, 3))}`
      : `all ${slow.stragglers.length} stragglers within budget: max ${Math.max(...slow.stragglers.map(s => s.latency))}ms, median ${slow.stragglers.map(s => s.latency).sort((a, b) => a - b)[Math.floor(slow.stragglers.length / 2)]}ms`);
ok('ARRIVAL-SLOW stragglers appear via opacity fade, not the trickle-guard poi-in scale (no .poi-in on any POI marker during the initial load)',
  slow.poiInEver === false,
  slow.poiInEver ? 'saw .poi-in class on at least one marker after reveal (holdArrival !interacted branch is not owning the initial-load second wave)' : 'no .poi-in class seen; fade path owned the second wave');
/* Backstop only. Not the contract: total pop is bounded by tile latency,
   which is the network, not our code. Firing this means something
   pathological (cap never fired, tiles hung past 3s, or the recorder
   itself broke), so treat a red row here as an investigation trigger, not
   a number to tune. */
ok(`ARRIVAL-SLOW total-pop backstop <=${POP_BACKSTOP_MS}ms (NOT the contract: a red row means investigate, not widen)`,
  slowPop != null && slowPop <= POP_BACKSTOP_MS,
  `reveal=${slow.reveal}ms  last=${slowLast.t}ms  pop=${slowPop}ms  final=${JSON.stringify(slowLast)}`);

/* INTERACTED GATE, both directions. Programmatic camera moves (map.easeTo,
   flyTo) must NOT flip `interacted`, or the initial second wave would land
   in holdArrival's post-pan bundled branch and re-introduce the 1200ms
   trickle Tom complained about. Real user gestures (drag) MUST flip it, or
   holdArrival's pan-trickle guard would never engage after the map settles.
   maplibre discriminates via `e.originalEvent`, which is present only on
   gesture-driven events; the openMap handlers gate on that. This checks
   both. */
const isInteracted = () => slowPage.evaluate(async () => {
  const m = await import('./js/map.js');
  return m.isMapInteracted();
});
const beforeAnything = await isInteracted();
ok('INTERACTED starts false after openMap',
  beforeAnything === false, `isMapInteracted()=${beforeAnything}`);

await slowPage.evaluate(() => {
  /* Programmatic move: no originalEvent on the fired event. easeTo pans and
     zooms slightly so BOTH dragstart and zoomstart candidates fire. */
  const m = window.__map || window.map;
  if (m) m.easeTo({ center: [m.getCenter().lng + 0.001, m.getCenter().lat + 0.001], zoom: m.getZoom() + 0.5, duration: 400 });
});
await sleep(700);
const afterProgrammatic = await isInteracted();
ok('INTERACTED programmatic easeTo does NOT flip interacted (pre-fix would flip and re-introduce the 1200ms trickle on the initial second wave)',
  afterProgrammatic === false, `isMapInteracted()=${afterProgrammatic}`);

/* Real gesture: use maplibre's own DOM canvas + dispatch a synthetic pointer
   drag. maplibre reads originalEvent off the DOM event chain. Puppeteer's
   page.mouse works against the canvas position. */
const canvasBox = await slowPage.evaluate(() => {
  const c = document.querySelector('#mapStage .maplibregl-canvas');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
});
if (canvasBox) {
  await slowPage.mouse.move(canvasBox.x, canvasBox.y);
  await slowPage.mouse.down();
  await slowPage.mouse.move(canvasBox.x + 120, canvasBox.y + 80, { steps: 8 });
  await slowPage.mouse.up();
  await sleep(400);
}
const afterDrag = await isInteracted();
ok('INTERACTED real user drag DOES flip interacted (so holdArrival re-engages its pan-trickle guard once the player has started moving around)',
  afterDrag === true, `isMapInteracted()=${afterDrag}, canvasBox=${JSON.stringify(canvasBox)}`);

await slowBrowser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
/* Also here, not only on the early exit above: a row can go UNPROVEN mid-run
   (the map hosted fine, then drew nothing), and without this the suite would
   exit 97 with no banner saying which check was not graded. */
unprovenReport('boneyard-audit.mjs', null);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(exitFor(failed));

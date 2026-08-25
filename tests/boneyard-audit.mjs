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
 *   ARRIVAL  the markers arrive in coordinated beats, on a fast line and on a
 *            gated slow one, and anything attached after the reveal fades in
 *            within one 220ms transition instead of popping
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
   PROVE-RED (confirmed 2026-08-07): reveal on worldPassDone alone and ARRIVAL
   fails naming den 3 -> 4 at ~800ms after the reveal.

   ==== 2026-08-20, THE FLAKY ROWS, AND WHY THEY WERE NEVER MEASURING THE APP ====
   Reported: 21/23 every run, but WHICH two rows failed alternated between runs.
   Set A: ARRIVAL + ARRIVAL-SLOW "the reveal contained the MAJORITY of markers"
          at 9/66 and 9/67. Set B: ARRIVAL-SLOW "at least one straggler was
          observed" (0 tracked) + its latency twin. Mutually exclusive outcomes
          of one race, which is the tell that both rows read the same coin flip
          with opposite polarity.

   TWO ROOT CAUSES, both measured on a pristine origin/main worktree:

   1. THE COUNTER COUNTED THE MAP KEY. `querySelectorAll('.map-spawn')` was
      unscoped, and js/app.js:mapLegendHtml() builds #mapLegend out of the EXACT
      marker markup on purpose, so the key and the map can never drift. Those
      nine swatches (5 spawns, 3 dens, 1 mini) live inside #mapStage, so the
      marker CSS applies to them: `opacity: 0` until `markers-in`, then 1. They
      are display:none behind [hidden] the whole time, and computed opacity does
      not care. So "9 visible at reveal" was NINE LEGEND SWATCHES, the same nine,
      in every single failing run, and the "66" and "67" totals were 9 + the
      real markers. The row had never once measured the reveal.

   2. THE REVEAL WAS SAMPLED, NOT OBSERVED. A 40ms wall-clock poller decided
      both WHEN the reveal happened and HOW MANY markers were visible in that
      same tick. But `#mapStage.markers-in .poi-arriving { opacity: 0 }` holds a
      same-beat marker invisible for two rAFs BY DESIGN (map.js:holdArrival
      gives the fade a start value that way), so a count snapped at the reveal
      instant lands inside a deliberate hold. Measured on the fast puppet: the
      60-marker batch is attached 40ms BEFORE the reveal in one run and 193ms
      AFTER it in the next, and the poller graded 0/60 or 60/60 accordingly.
      The same tick decided whether a marker was "part of the initial batch" or
      "a straggler", which is why the straggler sample was sometimes empty.

   WHAT REPLACED THEM, and why it is not a widened threshold:
     - real markers only: MapLibre stamps `maplibregl-marker` on what it owns
       and on nothing else, so require it. Legend contamination goes to zero
       (measured: legend swatches seen by the recorder = 0).
     - the reveal is read from a MutationObserver on #mapStage's class, so it is
       an event with no quantisation. Measured reveal spread with the tile gate
       below: 1839/1840/1841ms, N=3.
     - "arrives whole" is asserted in BEATS, the grammar this file already uses
       for PAN, and beats are computed from when markers became VISIBLE, not
       from the reveal instant. Measured 8/8 runs across both scenarios: exactly
       two beats, one of 59 markers and one of 1 (the spire, which needs a
       network round trip). Reveal-relative windows were the flaky idea: the
       first beat lands 14-539ms after the reveal on a fast line and 1810-2168ms
       after it on a slow one, so no fixed offset describes both.
     - the ARRIVAL-SLOW MAJORITY row is GONE, not widened, because with honest
       selectors it is deterministically false and asserts against a signed-off
       decision. Measured N=3: 0 real markers visible at the reveal, still 0 at
       reveal+1000ms, batch at reveal+3559/4855/3883ms. That is exactly what
       v372 was built to do (fire the reveal on the 1800ms cap rather than hide
       the map until slow tiles land; v371 did the opposite and Tom called it
       too slow). A row demanding the majority at reveal on a line slow enough
       for the cap to win is demanding v371 back. It only ever went green when
       nine display:none legend swatches were counted as revealed markers AND
       the tile delay failed to bite, in which case its sibling straggler row
       went red instead. The "arrives whole" claim is not lost: the beat rows
       above assert it in both scenarios, and it passes in both. */

/* THE RECORDER, one copy, both scenarios. It used to be two near-identical
   in-page copies, each with its own 40ms count poller; that poller was the
   flakiness (see the block above). Records, per POI MARKER:
     add    when MapLibre attached it to the DOM
     vis    when its computed opacity first exceeded 0.01
     lat    vis - add, the add-to-visible latency this file's contract owns
     poiIn  whether it ever carried `.poi-in`, the trickle-guard signature
   plus `reveal`, the exact instant #mapStage gained `markers-in`, taken from a
   MutationObserver on that one attribute rather than sampled off a timer.
   `entry` is stamped by the caller at the click that opens the map, so every
   number is relative to the moment the player asked for the Boneyard.
   evaluateOnNewDocument survives seed()'s reload (see godmode.js:196). */
const RECORDER = () => {
  const S = window.__arr = { entry: null, reveal: null, marks: [] };
  const POI = ['map-spawn', 'map-den-mark', 'map-mini-mark', 'map-spire', 'map-glutton-mark'];
  const POI_RE = /map-spawn|map-den-mark|map-mini-mark|map-spire|map-glutton-mark/;
  const now = () => S.entry == null ? null : Math.round(performance.now() - S.entry);
  /* MARKERS, NEVER THE MAP KEY. js/app.js:mapLegendHtml() builds #mapLegend out
     of the exact marker markup so the key and the map cannot drift, and it sits
     inside #mapStage, so `#mapStage .map-spawn { opacity: 0 !important }` and
     the `markers-in` rule both apply to its nine swatches. They are display:none
     behind [hidden] the whole time and computed opacity does not care, so the
     old unscoped selector counted nine invisible legend swatches as revealed
     POIs. MapLibre stamps `maplibregl-marker` on the elements it owns and on
     nothing else, so require it. */
  const isMarker = el => el.classList.contains('maplibregl-marker') && POI.some(c => el.classList.contains(c));
  const track = el => {
    if (!isMarker(el)) return;
    const rec = { add: now(), kind: POI.find(c => el.classList.contains(c)), vis: null, lat: null, poiIn: false };
    S.marks.push(rec);
    const t0 = performance.now();
    const iv = setInterval(() => {
      if (el.classList.contains('poi-in')) rec.poiIn = true;
      if (+getComputedStyle(el).opacity > 0.01) {
        rec.vis = now(); rec.lat = Math.round(performance.now() - t0); clearInterval(iv);
      } else if (performance.now() - t0 > 8000) clearInterval(iv);   // never became visible: vis stays null
    }, 16);
  };
  /* evaluateOnNewDocument fires before the DOM is parsed, so documentElement can
     be null. Wait for it, then observe. */
  const attach = () => {
    const root = document.documentElement || document.body;
    if (!root) { setTimeout(attach, 16); return; }
    new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      const cls = n.className || '';
      if (typeof cls === 'string' && POI_RE.test(cls)) track(n);
    } }).observe(root, { childList: true, subtree: true });
    /* THE REVEAL IS AN EVENT, NOT A SAMPLE. Read off a 40ms poller it was
       quantised, and worse, the same tick snapshotted the marker count and
       decided initial-batch-vs-straggler for every marker. */
    const watchStage = () => {
      const st = document.querySelector('#mapStage');
      if (!st) { setTimeout(watchStage, 16); return; }
      if (st.classList.contains('markers-in')) { S.reveal = now(); return; }
      const mo = new MutationObserver(() => {
        if (!st.classList.contains('markers-in')) return;
        mo.disconnect();
        S.reveal = now();
      });
      mo.observe(st, { attributes: true, attributeFilter: ['class'] });
    };
    watchStage();
  };
  attach();
};

/* BEATS: THE ARRIVAL GRAMMAR, and it is this file's own (see PAN below, which
   has counted beats since 2026-08-08). A beat is every marker that becomes
   VISIBLE within one fade of the marker that opened the beat.
   FIXED WINDOW, not a gap-linked chain: a chain lets a 40-marker trickle at
   240ms apiece read as one long beat, which is the exact hypothetical build the
   retired MAJORITY row was written to worry about. With a fixed window that
   build produces ~20 beats and fails on the count.
   Deliberately reveal-independent. The reveal instant is where the old rows
   went wrong: `#mapStage.markers-in .poi-arriving { opacity: 0 }` holds a
   same-beat marker invisible for two rAFs by design, and measured the first
   beat lands anywhere from 14ms to 539ms after the reveal on a fast line and
   1810-2168ms after it on a slow one. Beats describe both without a magic
   offset. */
const BEAT_MS = 250;                 // one 220ms opacity transition plus slack
const STRAGGLER_LATENCY_MS = 250;    // same budget, per marker, DOM add -> visible
/* THREE DOCUMENTED PLACEMENT SOURCES, so three beats is the ceiling and a
   fourth is a trickle. Not a widened number: it is the count of separate places
   a marker can come from, each of which this repo has already decided is
   legitimate.
     1  the reveal itself, carrying everything placeable without tiles. On a
        slow line that can be the Glutton alone (js/app.js:refreshGlutton places
        him unsnapped on purpose), on a fast line it is the whole batch.
     2  the tile-informed pass, once queryRenderedFeatures can see water and
        roads. v372 fires the reveal on the 1800ms cap ahead of this on purpose.
     3  the spire, which needs its own network round trip (app.css says so above
        the reveal rules: "spires alone need a network round trip").
   Measured: fast lines collapse 1 and 2 into one beat and land on two; a gated
   slow line inside a Glutton window uses all three. The rows that own arrival
   QUALITY rather than arrival grouping are NOTHING-BEFORE-THE-REVEAL, LATENCY
   and SHAPE below, and they are what caught both mutations this file was
   re-proven against. */
const MAX_BEATS = 3;
const analyse = ({ reveal, marks }) => {
  const beats = [];
  for (const m of marks.filter(m => m.vis != null).sort((a, b) => a.vis - b.vis)) {
    const b = beats[beats.length - 1];
    if (b && m.vis - b.start <= BEAT_MS) { b.n++; b.end = m.vis; } else beats.push({ start: m.vis, end: m.vis, n: 1, kinds: {} });
    const last = beats[beats.length - 1];
    last.kinds[m.kind] = (last.kinds[m.kind] || 0) + 1;
  }
  const seen = marks.filter(m => m.vis != null).length;
  /* Stragglers are markers ATTACHED after the reveal: the ones map.js:holdArrival
     owns via its !interacted branch. Markers attached before the reveal fade up
     together on the `markers-in` class transition, which is a different
     mechanism and outside this contract. */
  const late = reveal == null ? [] : marks.filter(m => m.add != null && m.add > reveal);
  /* NOTHING MAY BE VISIBLE BEFORE THE REVEAL. This is app.css's own contract
     for the whole hide-then-fade block ("Hidden until the first full pass
     completes, then everything fades up together"), and until 2026-08-20 no row
     asserted it, which is how `.map-glutton-mark` shipped missing from all
     three reveal rules: its marker was born opacity 1 and painted on a blank
     map ~1.5s before anything else. `vis` can only be reported LATE (a 16ms
     poller) and `reveal` is exact (a MutationObserver), so this needs no
     tolerance and gets none. */
  return {
    beats, seen, late,
    early: reveal == null ? [] : marks.filter(m => m.vis != null && m.vis < reveal),
    biggest: beats.reduce((a, b) => (!a || b.n > a.n ? b : a), null),
    badLate: late.filter(m => m.lat == null || m.lat > STRAGGLER_LATENCY_MS),
    poiIn: late.filter(m => m.poiIn),
    lastVis: marks.reduce((mx, m) => (m.vis != null && m.vis > mx ? m.vis : mx), null),
  };
};

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const origin = new URL(base).origin;
await browser.defaultBrowserContext().overridePermissions(origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(RECORDER);

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
 * Both ARRIVAL twins now route an empty sample to unproven() rather than green,
 * and the ARRIVAL-SLOW pair is held non-empty by the tile gate; the PAN baseline
 * row could not fail at all until 2026-08-20, because its selector was counting
 * the nine #mapLegend swatches. See the ARRIVAL block for that whole story.
 *
 * COUNT-BASED, not name-based: several rows build their name from a template
 * literal or a const, so a list of quoted names cannot see them. The row count
 * in the source is what is asserted, so a new assertion added without extending
 * this block fails here rather than being graded against a dead map. */
const cls = unclassifiedRows(import.meta.url, []);
const MAP_ROW_COUNT = 26;   // every ok() in this file except ROWS-COUNTED below
ok('ROWS-COUNTED every assertion in this file is Boneyard-dependent and accounted for',
  cls.callSites === MAP_ROW_COUNT + 1,
  `${cls.callSites} ok() rows in source, expected ${MAP_ROW_COUNT + 1}. If you added a row, it needs a line in the UNPROVEN block above it.`);

const mapCap = await boneyardCapability(page);
if (!mapCap.ok) {
  const why = 'the Boneyard could not draw on this machine';
  /* Named where the source names them, counted where it does not: the rows whose
     name is built at runtime are declared by their number so nothing is silent. */
  for (const n of cls.names.filter(n => !n.startsWith('ROWS-COUNTED'))) unproven(n, why);
  const unnamed = cls.callSites - 1 - cls.names.filter(n => !n.startsWith('ROWS-COUNTED')).length;
  for (let i = 1; i <= unnamed; i++) unproven(`ARRIVAL/ARRIVAL-SLOW beat, latency or backstop row ${i} of ${unnamed} (name is built at runtime, see source)`, why);
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
  /* Stamp `entry` on the click, so every arrival number is measured from the
     moment the player asked for the map. The fast recorder used to start its
     clock at page load, which is why its rows printed things like
     "reveal at 16258ms" and nobody could tell that was nonsense. */
  window.__arr.entry = performance.now();
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

/* ARRIVAL contract. The +60ms window was retired 2026-08-13 because it was
   measuring tile-fetch jitter: pre-fix builds failed it 10/10 and fixed builds
   ~2/6, both purely on whether the environment produced a straggler. The
   MAJORITY-at-reveal rows that replaced it were retired 2026-08-20 for the same
   class of reason, spelled out at the top of this file: they graded nine
   display:none legend swatches off a 40ms poller.
   WHAT IS ASSERTED NOW, all of it reveal-independent except the reveal's own
   row, all of it measured:
     BEATS    the markers become visible in at most two coordinated beats.
     MAJORITY one of those beats carries most of the markers. Together these two
              are the "arrives whole" contract, and they are what catch both the
              pre-fix pop-in (separate flushes 1200ms apart, so beat 1 is tiny)
              and a hypothetical 240ms-per-marker trickle (a fixed-window beat
              cannot absorb it, so the count blows out).
     LATENCY  every marker attached after the reveal is visible within 250ms of
              being attached. Bounded by our own 220ms transition, never by the
              network: a marker attached at t=3170ms because tiles arrived at
              t=3170ms must still be visible by t=3420ms.
     SHAPE    no marker attached after the reveal ever carries `.poi-in`. That
              class is the pan trickle-guard flush; seeing it on the initial load
              means holdArrival's !interacted branch stopped owning the second
              wave. */
const A = analyse(arr);
ok('ARRIVAL the reveal happened at all (never revealing is a FAILURE)',
  arr.reveal != null, `reveal at ${arr.reveal}ms from Boneyard entry`);
ok('ARRIVAL real POI markers were observed (an empty sample is a FAILURE)',
  A.seen > 0, `${A.seen} of ${arr.marks.length} tracked markers became visible`);
ok('ARRIVAL no marker is visible before the reveal (the reveal owns the first paint; a marker that paints early is the trickle, one marker at a time)',
  arr.reveal != null && A.early.length === 0,
  A.early.length ? `${A.early.length} painted before the ${arr.reveal}ms reveal: ${JSON.stringify(A.early.slice(0, 3))}` : `all ${A.seen} markers waited for the ${arr.reveal}ms reveal`);
ok(`ARRIVAL the markers become visible in at most ${MAX_BEATS} coordinated beats, never a per-marker trickle`,
  A.beats.length > 0 && A.beats.length <= MAX_BEATS,
  `${A.beats.length} beat(s): ${JSON.stringify(A.beats)}`);
ok('ARRIVAL one beat carries the MAJORITY of the markers (a handful now and the rest as a later wave is not the "arrives whole" contract)',
  !!A.biggest && A.biggest.n * 2 > A.seen,
  `biggest beat ${A.biggest ? A.biggest.n : 0}/${A.seen} at ${A.biggest ? A.biggest.start : 'n/a'}ms`);
/* AN EMPTY SAMPLE IS NOT A PASS, AND HERE IT IS NOT A DEFECT EITHER.
   These two rows can only be graded if this run actually produced a marker
   attached after the reveal. On the fast puppet that is the spire, whose
   placement needs a network round trip: measured 5/5 runs it landed ~3.4s after
   entry, but a run where that request fails produces nothing to measure. The
   old code let that case sail through GREEN on a sample of zero, and the
   UNPROVEN block further up this file names it as the instructive example of
   exactly that antipattern. So route it through godmode's third outcome: not
   pass, not fail, exit 97. The ARRIVAL-SLOW twins below hold the tile gate that
   makes the sample non-empty BY CONSTRUCTION, so the mechanism is still graded
   every run; this pair is the fast-line bonus. */
const FAST_LATENCY = `ARRIVAL every marker attached after the reveal is visible within ${STRAGGLER_LATENCY_MS}ms of DOM add (LATENCY: bounded by our 220ms opacity transition, not by tile jitter)`;
const FAST_SHAPE = 'ARRIVAL markers attached after the reveal fade in, never via the trickle-guard poi-in scale (SHAPE: the 1200ms poi-arriving+poi-in flush is the pre-fix bug)';
if (!A.late.length) {
  const why = 'this run attached every POI marker before the reveal, so there was no post-reveal marker to time (the fast happy path). Nothing was learned either way; the ARRIVAL-SLOW twins grade the same mechanism against a tile gate that guarantees a sample.';
  unproven(FAST_LATENCY, why);
  unproven(FAST_SHAPE, why);
} else {
  ok(FAST_LATENCY, A.badLate.length === 0,
    A.badLate.length
      ? `${A.badLate.length}/${A.late.length} exceeded: ${JSON.stringify(A.badLate.slice(0, 3))}`
      : `all ${A.late.length} within budget: max ${Math.max(...A.late.map(m => m.lat))}ms`);
  ok(FAST_SHAPE, A.poiIn.length === 0,
    A.poiIn.length
      ? `${A.poiIn.length}/${A.late.length} post-reveal markers carried .poi-in (holdArrival's !interacted branch is not owning the initial second wave)`
      : `no .poi-in on any of ${A.late.length} post-reveal markers; the fade path owned the second wave`);
}

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

/* MARKERS, NOT THE MAP KEY, same reason as RECORDER above: unscoped, this
   counted the nine #mapLegend swatches, so `panBaseline > 0` was true before a
   single POI had been placed and the guard that exists to prove the sample is
   not empty could not fail. */
const VIS = `[...document.querySelectorAll('#mapStage .maplibregl-marker.map-spawn, #mapStage .maplibregl-marker.map-den-mark, #mapStage .maplibregl-marker.map-mini-mark, #mapStage .maplibregl-marker.map-spire, #mapStage .maplibregl-marker.map-glutton-mark')].filter(e => +getComputedStyle(e).opacity > 0.01).length`;
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
const panBaseline = pan.length ? pan[0].n : 0;
/* AN ARRIVAL IS AN INCREASE, and this row used to count any change. The
   timeline records every change in the visible count, and a marker can also
   LEAVE it: measured 2026-08-20, one run in seven recorded 63 -> 62 -> 63 at
   t=8568ms, a single marker dropping out of the visible set for ~33ms nearly
   eight seconds after the pan. Two frames is the signature of a placement pass
   removing and recreating a marker, whose replacement flashes through
   map.js:holdArrival's two-rAF `poi-arriving` hold (panBy is programmatic, so
   `interacted` stays false and the fade branch owns the replacement).
   Whatever it is, it is not a POI arriving, and counting it as one made this
   row report "a beat of -1 markers" and go red once in seven runs.
   FILTERED, NOT HIDDEN: the raw timeline is still printed in the evidence
   below, so a marker that vanishes and comes back is still in front of whoever
   reads the row. */
const arrivals = pan.slice(1).map((p, i) => ({ ...p, d: p.n - pan[i].n })).filter(a => a.d > 0);
ok('PAN the map actually had markers to work with (an empty sample is a FAILURE)',
  panBaseline > 0, `baseline ${panBaseline} visible markers`);
/* Placement genuinely resolves in two waves ~2.6s apart, so "one beat" would
   mean a blank map for 6.6s after every pan. The rule is that markers arrive in
   COORDINATED BEATS rather than one at a time: at most two, never a per-marker
   trickle. Before the fix this was three separate arrivals over 1281ms and the
   count rose by one each time. */
const perBeat = arrivals.map(a => a.d);
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

   ARRIVES WHOLE, LATER  the batch that lands after the cap lands as ONE
       beat. Added 2026-08-20 in place of a "majority visible at the reveal"
       row, which on this scenario asserted the opposite of v372's design:
       the cap fires the reveal with nothing placed, on purpose, so the
       reveal is empty by construction and the thing worth asserting is that
       the batch behind it does not arrive in pieces.

   Plus TWO guards against sample-degeneracy that would let a broken build
   sail through with a perfect latency score:

     THE GATE BIT  every marker must be attached AFTER the reveal, which is
       what makes this run slow at all. Guaranteed by the hold-until-deadline
       tile gate below rather than hoped for; before 2026-08-20 this row read
       "at least one straggler was observed" and flipped a coin on how many
       rounds of tile fetches MapLibre happened to need.
     TOTAL POP BACKSTOP  NOT the contract, a screaming backstop for
       pathological cases like the cap never firing. See its own comment for
       the current number and why it moved.

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
       shape distinction is doing its job.
   PROVE-RED (re-confirmed 2026-08-20 against the rewritten rows, in a
   throwaway worktree, mutation asserted applied first): see the note at the
   end of this file. */
/* Fresh boot so the fast-run instrumentation and route history do not spill
   into the slow-tile measurement. boot() handles ?demo + dismissOverlays. */
const { browser: slowBrowser, page: slowPage } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await slowBrowser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
await slowPage.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });
await slowPage.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
/* Interception installed AFTER boot: the initial /?demo goto has already
   completed, and hash-routing to #/boneyard triggers map init in-page, so tile
   fetches happen with the gate active.

   A GATE, NOT A PER-REQUEST DELAY, since 2026-08-20. The old form delayed every
   tile request by 2000ms independently, and the scenario's whole purpose (make
   the 1800ms reveal cap fire AHEAD of placement, so the second wave exists to
   be measured) then depended on how many sequential rounds of tile fetches
   MapLibre happened to need. Measured on origin/main, N=3: the second wave
   landed 3559ms, 4855ms and 3883ms after the reveal, and a fourth run produced
   no second wave inside a 12s window at all. That is the coin flip behind the
   "0 stragglers tracked" red: not a defect, a scenario that only sometimes ran.

   The gate holds every tile request until one fixed deadline and then releases
   the lot with no further delay. Tiles CANNOT complete before the deadline, so
   `map.loaded()` cannot be true, so `placedOnce` cannot flip, so the cap is the
   only thing that can fire the reveal. Guaranteed by construction rather than
   by a five-run hope. TILE_HOLD_MS only has to exceed the app's cap; 2500 over
   1800 leaves 700ms of margin. Measured N=3: reveal 1839/1840/1841ms, and every
   one of the ~60 markers attached after it, so the straggler sample can no
   longer be empty. */
const TILE_HOLD_MS = 2500;   // > js/app.js's 1800ms reveal cap, so the cap always wins
let tileReleaseAt = null;    // wall-clock; set at the click, null means "let it through"
await slowPage.setRequestInterception(true);
slowPage.on('request', req => {
  const go = () => req.continue().catch(() => { /* aborted while held */ });
  if (!/openfreemap|openmaptiles|\.pbf|tiles\./.test(req.url())) return go();
  const wait = tileReleaseAt == null ? 0 : Math.max(0, tileReleaseAt - Date.now());
  if (wait) setTimeout(go, wait); else go();
});
await slowPage.evaluateOnNewDocument(RECORDER);
await seed(slowPage, { level: 18, coins: 500 });
await slowPage.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(2500);
tileReleaseAt = Date.now() + TILE_HOLD_MS;   // arm the gate on the same beat as the click
await slowPage.evaluate(() => {
  window.__arr.entry = performance.now();
  const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
  if (b) b.click();
});
await sleep(10000);

const slow = await slowPage.evaluate(() => window.__arr);
const S = analyse(slow);
const slowPop = (slow.reveal != null && S.lastVis != null) ? S.lastVis - slow.reveal : null;
/* POP_BACKSTOP is a screaming pathological guard (cap never fired, hung refresh,
   recorder broke), NOT the contract: total pop is bounded by tile latency, which
   is the network and not our code. Optimising it would mean hiding the map until
   slow tiles land, which is what v371 did and Tom rejected.
   RE-MEASURED 2026-08-20 with the tile gate and with real markers only:
   pop 3275/3484/3517ms, N=3, and the tail of that is the SPIRE, whose placement
   needs its own network round trip ~5.3s after entry regardless of tiles. The
   old 4000 sat 14% above the scenario's own normal range, which is one bad run
   from being the flaky row everybody learns to ignore. 6000 keeps ~70% headroom
   and still catches the cases this row is for: a cap that never fires or a dead
   refresh leaves pop at the full sleep duration, ~10000ms. */
const POP_BACKSTOP_MS = 6000;

ok('ARRIVAL-SLOW the reveal happened at all under slow-tile timing (never revealing is a FAILURE)',
  slow.reveal != null, `reveal at ${slow.reveal}ms from Boneyard entry`);
ok('ARRIVAL-SLOW real POI markers were observed (an empty sample is a FAILURE)',
  S.seen > 0, `${S.seen} of ${slow.marks.length} tracked markers became visible`);
ok('ARRIVAL-SLOW no marker is visible before the reveal (the reveal owns the first paint, on a slow line too)',
  slow.reveal != null && S.early.length === 0,
  S.early.length ? `${S.early.length} painted before the ${slow.reveal}ms reveal: ${JSON.stringify(S.early.slice(0, 3))}` : `all ${S.seen} markers waited for the ${slow.reveal}ms reveal`);
/* THE SCENARIO'S OWN PRECONDITION, MEASURED, NOT ASSUMED. This is the row that
   used to read "at least one straggler was observed" and flip a coin. What it
   actually needs to be true is that the tile gate bit: the reveal fired on the
   cap before the tile-informed placement pass ran, so the bulk of the markers
   are stragglers and the latency and shape rows have a real sample.
   THE MAJORITY, not every marker, and the exception is measured rather than
   assumed: js/app.js:refreshGlutton places the world boss on the FIRST pass
   whether or not tiles have loaded, on purpose ("ALWAYS place him, even
   unsnapped ... gating on it made the world boss permanently invisible"), so
   during a Glutton window one marker is legitimately attached before the cap
   fires. Demanding every marker made this row red for four hours twice a day on
   healthy code, which is how a guard gets ignored.
   Guaranteed by construction otherwise: tiles cannot resolve before
   TILE_HOLD_MS, which is past the cap, so a red row here means the gate broke,
   not that the app regressed. */
ok('ARRIVAL-SLOW the reveal fired on the cap ahead of placement, so this run really was slow (a straggler sample this small means the tile gate did not bite and every row below it would be vacuous)',
  slow.reveal != null && S.late.length > 0 && S.late.length * 2 > slow.marks.length,
  `${S.late.length}/${slow.marks.length} markers attached after the reveal`);
ok(`ARRIVAL-SLOW the markers become visible in at most ${MAX_BEATS} coordinated beats, never a per-marker trickle`,
  S.beats.length > 0 && S.beats.length <= MAX_BEATS,
  `${S.beats.length} beat(s): ${JSON.stringify(S.beats)}`);
/* "ARRIVES WHOLE" STILL HOLDS ON A SLOW LINE, it just holds LATER, and that is
   the distinction the retired MAJORITY-at-reveal row could not draw. The map
   appears empty at the cap and the whole batch fades up together ~2s later, as
   one beat, which is v372's designed behaviour. What would be a defect is that
   batch arriving in pieces, and this is the row that says so. */
ok('ARRIVAL-SLOW one beat carries the MAJORITY of the markers (the batch lands later than on a fast line, but it still lands together)',
  !!S.biggest && S.biggest.n * 2 > S.seen,
  `biggest beat ${S.biggest ? S.biggest.n : 0}/${S.seen} at ${S.biggest ? S.biggest.start : 'n/a'}ms, reveal ${slow.reveal}ms`);
/* THE CONTRACT: each straggler is visible within 250ms of being attached,
   bounded by the CSS opacity transition, NOT by tile latency. The pre-fix
   trickle path held for 1200ms before flushing, so this goes red the moment
   holdArrival's !interacted branch stops owning the second wave. */
ok(`ARRIVAL-SLOW every straggler is visible within ${STRAGGLER_LATENCY_MS}ms of DOM add (bounded by our 220ms opacity transition, not by tile latency)`,
  S.late.length > 0 && S.badLate.length === 0,
  S.late.length === 0
    ? 'no post-reveal markers in the sample; see the tile-gate precondition row above'
    : S.badLate.length
      ? `${S.badLate.length}/${S.late.length} exceeded: ${JSON.stringify(S.badLate.slice(0, 3))}`
      : `all ${S.late.length} within budget: max ${Math.max(...S.late.map(m => m.lat))}ms`);
ok('ARRIVAL-SLOW stragglers appear via opacity fade, not the trickle-guard poi-in scale (no .poi-in on any POI marker during the initial load)',
  S.late.length > 0 && S.poiIn.length === 0,
  S.late.length === 0
    ? 'no post-reveal markers in the sample; see the tile-gate precondition row above'
    : S.poiIn.length
      ? `${S.poiIn.length}/${S.late.length} carried .poi-in (holdArrival's !interacted branch is not owning the initial-load second wave)`
      : `no .poi-in on any of ${S.late.length} post-reveal markers; the fade path owned the second wave`);
ok(`ARRIVAL-SLOW total-pop backstop <=${POP_BACKSTOP_MS}ms (NOT the contract: a red row means investigate, not widen)`,
  slowPop != null && slowPop <= POP_BACKSTOP_MS,
  `reveal=${slow.reveal}ms  lastVisible=${S.lastVis}ms  pop=${slowPop}ms  beats=${JSON.stringify(S.beats)}`);

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

/* ===== PROVE-RED, 2026-08-20, rewritten arrival rows ==========================
 * Every run below is a throwaway worktree, with the mutation asserted present in
 * the tree before the audit was started, not assumed.
 *
 * BASELINE, pristine origin/main (c1ea781) with the OLD audit, N=2:
 *   21/23 both runs, "10/52 visible at reveal" on both MAJORITY rows. The 10 is
 *   nine #mapLegend swatches plus the Glutton, which is the one real marker that
 *   painted before the reveal. So the number the flaky row had been printing all
 *   along was the map key plus a bug, and never the reveal.
 *
 * FIXED TREE, N=3: 27/27, exit 0, inside a Glutton window and outside one.
 *
 * MUTATION 1, js/map.js: holdArrival's `!interacted` branch deleted (the v370
 * pre-fix path, so the initial second wave takes the batched 1200ms hold and the
 * poiPop flush). 23/27, and the four reds are the right four:
 *   ARRIVAL      LATENCY  1/1 exceeded, spire lat=1232ms, poiIn=true
 *   ARRIVAL      SHAPE    1/1 post-reveal markers carried .poi-in
 *   ARRIVAL-SLOW LATENCY  42/42 exceeded, lat=1234ms each
 *   ARRIVAL-SLOW SHAPE    42/42 carried .poi-in
 * The beat and majority rows stay green, correctly: a batched flush still
 * arrives as one beat. Grouping and quality are different claims and the rows
 * that own each of them fired independently, which is the point of splitting
 * them.
 *
 * MUTATION 2, app.css reverted to origin/main (`.map-glutton-mark` absent from
 * the three reveal rules), js/map.js untouched. The NOTHING-BEFORE-THE-REVEAL
 * rows go red in both scenarios and name the marker:
 *   ARRIVAL       1 painted before the 1309ms reveal: glutton, vis=300ms
 *   ARRIVAL-SLOW  1 painted before the 1842ms reveal: glutton, vis=86ms
 * Measured independently of the map, straight off the stylesheet: a
 * `.map-glutton-mark` inside #mapStage computes opacity 1 before `markers-in` on
 * origin/main and 0 after the fix, where every other marker type computes 0 then
 * fades to 1.
 *
 * NOT PROVEN RED, and named so it is not mistaken for coverage: the ARRIVAL and
 * ARRIVAL-SLOW beat-count rows. No mutation available here splits the initial
 * load into a fourth wave, so MAX_BEATS is a ceiling this suite has never seen
 * fire. It is the count of documented placement sources, not a measured
 * threshold. If you want it proven, the mutation is a placement pass that emits
 * markers one at a time.
 * ============================================================================ */
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(exitFor(failed));

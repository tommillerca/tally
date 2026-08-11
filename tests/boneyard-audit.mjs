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
await page.evaluateOnNewDocument(() => {
  window.__arr = { t0: performance.now(), reveal: null, tl: [] };
  const KINDS = { '.map-spawn': 'spawn', '.map-den-mark': 'den', '.map-mini-mark': 'mini',
    '.map-spire': 'spire', '.map-glutton-mark': 'glutton' };
  setInterval(() => {
    const a = window.__arr;
    const snap = { t: Math.round(performance.now() - a.t0) };
    /* VISIBLE markers, not DOM ones. This is the bug that let the Boneyard get
       reported fixed three times while it still trickled: a marker enters the DOM
       at the same instant either way, so counting nodes cannot tell a held marker
       from a shown one. MapLibre writes `opacity: 1` inline on every marker it
       owns, which beat the hide rule outright, and only computed opacity shows
       that. Count what the player can see. */
    for (const [sel, k] of Object.entries(KINDS))
      snap[k] = [...document.querySelectorAll(sel)].filter(e => +getComputedStyle(e).opacity > 0.01).length;
    const last = a.tl[a.tl.length - 1];
    if (!last || Object.values(KINDS).some(k => last[k] !== snap[k])) a.tl.push(snap);
    const st = document.querySelector('#mapStage');
    if (st && st.classList.contains('markers-in') && a.reveal == null) a.reveal = snap.t;
  }, 40);
});

await seed(page, { level: 18, coins: 500 });

await page.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(2500);
// the Boneyard opens on a location explainer; the map is behind its button
await page.evaluate(() => {
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

/* nothing may arrive after the map is shown */
ok('ARRIVAL the reveal happened at all (never revealing is a FAILURE)',
  arr.reveal != null, `reveal at ${arr.reveal}ms`);
ok('ARRIVAL markers were actually counted (an empty timeline is a FAILURE)',
  arr.tl.length >= 2, `${arr.tl.length} count changes recorded`);
const after = arr.tl.filter(r => arr.reveal != null && r.t > arr.reveal + 60);
ok('ARRIVAL nothing pops in after the map is on screen',
  after.length === 0,
  after.length
    ? after.map(r => `+${r.t - arr.reveal}ms spawn=${r.spawn} den=${r.den} mini=${r.mini} spire=${r.spire} glutton=${r.glutton}`).join(' | ')
    : `revealed at ${arr.reveal}ms with everything already placed`);

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
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);

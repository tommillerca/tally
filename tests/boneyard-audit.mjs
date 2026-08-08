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
import { boot, seed, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srv = null;
let base = process.env.URL;
if (!base) {
  srv = spawn('python3', ['-m', 'http.server', '8165', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(900);
  base = 'http://127.0.0.1:8165/';
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
    for (const [sel, k] of Object.entries(KINDS)) snap[k] = document.querySelectorAll(sel).length;
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
    screenText: (document.querySelector('#screen')?.innerText || '').replace(/\s+/g, ' ').slice(0, 160),
  };
});

ok('LOADS the Boneyard renders its map stage', state.stage, JSON.stringify({ stage: state.stage }));
ok('LOADS the marker layer gets revealed (not stuck invisible)', state.markersIn,
  `markers-in=${state.markersIn}`);
/* Nothing is within collect range from a fixed test coordinate, so the action
   card must be genuinely gone. `hidden` alone is not proof: the whole bug was an
   element carrying hidden=true while still painting. */
ok('BAR with nothing in reach the action card is not on screen',
  state.actExists && state.actHiddenAttr === true && state.actVisible === false,
  JSON.stringify({ hiddenAttr: state.actHiddenAttr, stillVisible: state.actVisible, text: state.actText }));
ok('STALE the loading placeholder is not left on screen',
  !/reading the bones/i.test(state.screenText),
  state.screenText);

/* nothing may arrive after the map is shown */
const arr = await page.evaluate(() => window.__arr);
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

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);

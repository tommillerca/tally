/* THE WANDERER'S TRIP WIRE, FIRED FOR REAL.
 *
 * tests/wanderer-boneyard-audit.mjs proves the derivation, the geometry, the
 * money and the ceiling by calling the module. None of that can see the thing
 * the feature actually IS: a GPS fix arriving on the open Boneyard, landing
 * inside a cone nobody tapped, and a fight starting on its own. Every hop of
 * that runs in js/app.js behind a live map, and a module test cannot reach one
 * of them.
 *
 * So this suite drives it. Two boots of the real app, each with the device's
 * position overridden to a point computed off the REAL Wanderer's REAL heading:
 *
 *   BEHIND  45 m behind him. He is drawn, his lantern is drawn, no fight starts.
 *   AHEAD   45 m into his light. The arena opens, on his name, with no tap
 *           anywhere in the run.
 *
 * The BEHIND boot is not decoration: "no fight started" is what a dead trigger
 * reports too, so the two boots are each other's control, and each carries a
 * CONTROL row that says the fix really was on the side of the line it claims.
 *
 * NEEDS A MAP. MapLibre needs WebGL and vector tiles; on a machine with neither,
 * every row here would be graded against a blank screen and pass on nothing. So
 * it measures the capability first and reports UNPROVEN with exit 97 rather than
 * green, the same contract tests/boneyard-audit.mjs runs under.
 *
 *   node tests/wanderer-patrol-live-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, boneyardCapability, unproven, unprovenReport, exitFor } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
console.log(`URL UNDER TEST  ${base}`);
let fails = 0;
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  | ' + d : ''}`); if (!p) fails = 1; };

async function run(offsetDeg, label) {
  const { browser, page } = await boot(base, {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const origin = new URL(base).origin;
  await browser.defaultBrowserContext().overridePermissions(origin, ['geolocation']);
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const HOME = { latitude: 49.2827, longitude: -123.1207 };
  await page.setGeolocation(HOME);
  const cap = await boneyardCapability(page);
  if (!cap.ok) { await browser.close(); return { cap }; }
  await seed(page, { level: 18, coins: 500 });

  // where is he, and where would a player have to stand
  const target = await page.evaluate(async ({ HOME, offsetDeg }) => {
    const W = await import('./js/wanderer.js');
    const { dateKey } = await import('./js/nutrition.js');
    const date = dateKey();
    const w = W.wanderersNear(date, HOME.latitude, HOME.longitude)[0];
    const dest = (lat, lng, brg, d) => {
      const R = 6371000, r = Math.PI / 180;
      const f1 = lat * r, l1 = lng * r, b = brg * r, dr = d / R;
      const f2 = Math.asin(Math.sin(f1) * Math.cos(dr) + Math.cos(f1) * Math.sin(dr) * Math.cos(b));
      const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(dr) * Math.cos(f1), Math.cos(dr) - Math.sin(f1) * Math.sin(f2));
      return { lat: f2 / r, lng: l2 / r };
    };
    const p = dest(w.lat, w.lng, w.heading + offsetDeg, 45);
    return { w: { lat: w.lat, lng: w.lng, heading: w.heading, id: w.id }, p, date,
      predicted: W.inWandererCone(w, p.lat, p.lng) };
  }, { HOME, offsetDeg });

  await page.setGeolocation({ latitude: target.p.lat, longitude: target.p.lng });
  await page.evaluate(() => { location.hash = '#/boneyard'; });
  await sleep(2500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(11000);

  const seenState = await page.evaluate(() => {
    const mark = document.querySelector('.map-wanderer-mark');
    const cone = mark && mark.querySelector('.wanderer-cone');
    const img = mark && mark.querySelector('img');
    const rb = mark && mark.getBoundingClientRect();
    const cb = cone && cone.getBoundingClientRect();
    const cs = cone && getComputedStyle(cone);
    const arena = document.querySelector('#arena');
    const foeName = arena && (arena.textContent.match(/The Wanderer/) ? 'The Wanderer' : arena.textContent.slice(0, 60));
    return {
      hasMark: !!mark,
      markVisible: !!mark && +getComputedStyle(mark).opacity > 0.5 && rb.width > 10,
      imgSrc: img && img.getAttribute('src'),
      conePx: cb ? Math.round(cb.width) : null,
      coneOpacity: cs ? +cs.opacity : null,
      coneBg: cs ? cs.backgroundImage.slice(0, 120) : null,
      coneRadius: cs ? cs.borderRadius : null,
      arena: !!arena, foeName,
    };
  });
  // kept for the eye, not asserted on: the rows above measure the DOM
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/wanderer-${label}.png` });
  await browser.close();
  return { target, seenState };
}

/* EVERY ROW IS NAMED IN THE UNPROVEN LIST TOO, so a machine that cannot draw the
   map reports six ungraded checks by name rather than an empty green run. */
const ROWS = [
  'CONTROL the behind-him fix was really outside his cone',
  'DRAWN-LIVE he is on the real map, as Cam drew him',
  'CONE-LIVE his lantern is painted on the real map, as a circular sector',
  'NO-AMBUSH standing behind him starts no fight',
  'CONTROL the ahead fix was really inside his cone',
  'CHARGE-LIVE walking into the light starts the fight, with no tap anywhere',
];

// ---- 1. BEHIND him: drawn, lit, and NOT fought
const behind = await run(180, 'behind');
let cap = behind && behind.cap;
if (behind && !cap) {
  const { target: t, seenState: s } = behind;
  ok('CONTROL the behind-him fix was really outside his cone', t.predicted === false,
    `45 m at heading+180 from ${t.w.heading.toFixed(0)} deg`);
  ok('DRAWN-LIVE he is on the real map, as Cam drew him', s.hasMark && s.markVisible && /wanderer\.png$/.test(s.imgSrc || ''),
    `marker ${s.markVisible ? 'visible' : 'not visible'}, src ${s.imgSrc}`);
  ok('CONE-LIVE his lantern is painted on the real map, as a circular sector',
    s.conePx > 60 && s.coneOpacity > 0.5 && /conic-gradient/.test(s.coneBg || '') && /50%/.test(s.coneRadius || ''),
    `${s.conePx}px wide, opacity ${s.coneOpacity}, ${String(s.coneBg).slice(0, 60)}`);
  ok('NO-AMBUSH standing behind him starts no fight', s.arena === false, s.foeName || 'no arena');
}

// ---- 2. AHEAD of him, in the light: the encounter fires from the fix alone
const ahead = cap ? null : await run(0, 'ahead');
if (ahead && !ahead.cap) {
  const { target: t, seenState: s } = ahead;
  ok('CONTROL the ahead fix was really inside his cone', t.predicted === true,
    `45 m dead ahead of heading ${t.w.heading.toFixed(0)} deg`);
  ok('CHARGE-LIVE walking into the light starts the fight, with no tap anywhere',
    s.arena === true && s.foeName === 'The Wanderer', s.foeName || 'no arena');
}

if (cap || (ahead && ahead.cap)) {
  const why = 'the Boneyard could not draw on this machine';
  for (const n of ROWS) unproven(n, why);
}
if (srv) await srv.close();
unprovenReport('wanderer-patrol-live-audit.mjs', cap || (ahead && ahead.cap));
console.log(fails ? '\nWANDERER PATROL LIVE AUDIT FAILED'
  : (cap ? '\nWANDERER PATROL LIVE AUDIT UNPROVEN' : '\nWANDERER PATROL LIVE AUDIT VERIFIED'));
process.exit(exitFor(fails));

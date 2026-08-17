/* tests/map-offline-audit.mjs — OPENING THE BONEYARD OFFLINE MUST NOT THROW.
 *
 * WHY THIS EXISTS. The map's failure path is `map.once('error', ...)`, and when
 * it fires it replaces `body.innerHTML` wholesale with the "the Boneyard needs a
 * network signal" message. That is the right outcome for the player. The problem
 * is that an event handler cannot return out of the function that registered it,
 * so the rest of the setup carries straight on against a body whose children it
 * has just deleted, and dereferences `#mapCanvas` and `#mapSpire`. A player
 * opening the Boneyard offline got the polite message AND an uncaught TypeError.
 *
 * Reported by the external session, which found it while investigating why four
 * map audits were red in a sandbox. Those four were red because the sandbox
 * blocks tiles.openfreemap.org, which is an environment fact and not an app bug.
 * This is the one real defect that fell out of it, and it was left unfixed.
 *
 * WHAT IT ASSERTS
 *   OFFLINE   the tile host is blocked, the map fails, and NOTHING throws
 *   MESSAGE   the player still gets the offline message and a Retry button
 *   CONTROL   the run actually reached the map and actually blocked the tiles,
 *             so a test that never opened the Boneyard cannot pass by silence
 *
 * The CONTROL row is the one that matters. "No error was thrown" is trivially
 * true on a page that never ran the code, which is exactly how this kind of
 * guard rots.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = [];
let fails = 0;
const ok = (m, cond, detail = '') => {
  if (cond) out.push(`ok   ${m}${detail ? '  ' + detail : ''}`);
  else { fails++; out.push(`FAIL ${m}${detail ? '  ' + detail : ''}`); }
};

const srv = process.argv[2] ? null : await serveTree(ROOT);
const base = process.argv[2] || srv.url;
console.log(`URL UNDER TEST: ${base}`);

const { browser, page } = await boot(base);

/* Collect everything the page throws, from both channels. An uncaught TypeError
   inside a promise surfaces as unhandledrejection, not pageerror, and the bug
   under test can arrive either way depending on where the await lands. */
const thrown = [];
page.on('pageerror', e => thrown.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') thrown.push(`console.error: ${m.text().slice(0, 160)}`); });

/* Block the tile host the map style points at, which is exactly what an offline
   phone does. Done at the network layer rather than by stubbing app code, so the
   failure arrives through MapLibre's own error event like a real one. */
let blocked = 0;
await page.setRequestInterception(true);
page.on('request', req => {
  const u = req.url();
  if (/openfreemap\.org|tiles?\./.test(u) && !u.startsWith(base)) { blocked++; req.abort().catch(() => {}); }
  else req.continue().catch(() => {});
});

await page.evaluate(async () => {
  const db = await import('/js/db.js');
  await db.kvSet('changelogSeen', 999999);
  for (const k of ['spiresIntroSeen', 'raceIntroSeen', 'gardenIntroSeen', 'surveySeen', 'namePrompted']) await db.kvSet(k, true);
}).catch(() => {});
await sleep(1200);

/* A fixed position, so the run never waits on a real geolocation prompt. */
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207 }).catch(() => {});
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(base, ['geolocation']).catch(() => {});

await page.evaluate(() => { location.hash = '#/boneyard'; });   // the route name is boneyard, not map
await sleep(2500);
/* The Boneyard opens on a location explainer and the map lives behind its
   button, so a run that only sets the hash never starts MapLibre and never
   fetches a tile. Same step tests/boneyard-audit.mjs takes. Without it the
   CONTROL row went red on 0 aborted requests, which is the row doing its job:
   the OFFLINE assertion had been passing on a page that never opened a map. */
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#screen button')]
    .find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
  if (b) b.click();
});
await sleep(8000);

const state = await page.evaluate(() => {
  const body = document.querySelector('.tab-body, #view, main') || document.body;
  const txt = (body.textContent || '');
  return {
    reachedMap: /Boneyard|map|Raising the map/i.test(txt) || !!document.querySelector('#mapCanvas, #mapRetry'),
    offlineMsg: /needs a network signal|could not load|could not start/i.test(txt),
    retry: !!document.querySelector('#mapRetry'),
    canvasGone: !document.querySelector('#mapCanvas'),
  };
});

ok('CONTROL the run reached the Boneyard and the tile host was actually blocked',
  state.reachedMap && blocked > 0, `${blocked} tile request(s) aborted`);
ok('MESSAGE the player gets the offline message with a way back',
  state.offlineMsg && state.retry, `offline copy ${state.offlineMsg}, retry button ${state.retry}`);

const real = thrown.filter(t => !/favicon|net::ERR|Failed to load resource/i.test(t));
ok('OFFLINE nothing throws when the map cannot load', real.length === 0,
  real.length ? real.slice(0, 3).join(' | ') : `${thrown.length} benign network message(s), 0 real errors`);

await browser.close();
if (srv) srv.close();
console.log(out.join('\n'));
console.log(fails ? `\nFAIL (${fails})` : `\nall green, ${out.length} checks`);
process.exit(fails ? 1 : 0);

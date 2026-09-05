/* SOMEBODY HAS TO TAP THE TRIBUTE BUTTON.
 *
 * R20-P1 has been open since 2026-08-02: every tribute collection throws a
 * ReferenceError, because js/app.js calls `boneDustAdd(r.dust)` in the #mapSpire
 * handler and js/app.js has never imported it. Three rounds closed it "in source
 * only" by reading the import block, and the reading was wrong: the name is not
 * in the block on v473 either. Nobody, in any round, had put a real tap on the
 * button with a `pageerror` listener attached, which is the only thing that can
 * tell the difference between "fixed" and "still throwing".
 *
 * So this file taps it. Not `collectTribute()` from a module, not a dispatched
 * event: the actual #mapSpire button on the actual Boneyard, at its actual
 * screen coordinates, with the browser's own pageerror listener live for the
 * whole run (godmode's boot() attaches it before the first navigation).
 *
 * WHAT THIS PINS:
 *   SETUP    a spire really is in range and the button really is on screen,
 *            sized, inside the viewport and owning its own pixels (hit-tested).
 *            An empty sample fails here rather than sailing through below.
 *   TAP      zero page errors across the tap. This is the whole ticket.
 *   PAID     an absence of errors is not a payout, so the money is measured:
 *            coins and Bone Dust both rise by exactly the tribute owed, and the
 *            tower records the collection so a second tap pays nothing.
 *   CONTROL  the listener is proven live in the same run by throwing a real
 *            ReferenceError into the page afterwards and requiring it to be
 *            caught. Without this row a green TAP could just mean the drive
 *            never reached the handler.
 *
 * PROVE-RED. Delete boneDustAdd from the loot.js import block in js/app.js and
 * this goes red three ways at once, which is exactly the shipped bug's shape:
 *   FAIL TAP     ReferenceError: boneDustAdd is not defined
 *   FAIL PAID    dust +0 (coinsAdd ran, the throw landed before boneDustAdd)
 *   PASS PAID    collectedAt still advanced, so the player is charged the day
 *                and gets no dust. Silent from the UI: the toast never fires.
 * Measured on 00979897 (the old tree R20-P1 was filed against), which carries
 * the same missing import: 2 FAILED, the pageerror reading
 * "ReferenceError: boneDustAdd is not defined".
 *
 * Needs a reachable vector tile host and working WebGL: the ONLY route to the
 * tribute button is a spire marker on a rendered Boneyard. Without one it
 * reports UNPROVEN (exit 97) rather than grading an empty stage.
 *
 * Usage: node tests/tribute-collect-audit.mjs [baseUrl]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, boneyardCapability,
  unproven, unprovenReport, exitFor, UNPROVEN_EXIT } from './godmode.js';
import { spireForCell, TRIBUTE_PER_DAY, TRIBUTE_DUST_PER_DAY } from '../js/spires.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const done = async (browser) => {
  console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`);
  await browser?.close();
  srv?.close();
  process.exit(exitFor(fails.length));
};

/* Downtown Vancouver, the same position every other map audit stands on. The
   spire for this cell is a fixed landmark by construction (spireForCell is
   seeded by cell), so standing on its seed coordinates puts it in range: the
   walkability snap can move it at most SNAP_MAX_M (60m), well inside the 80m
   spire radius, so the tower is reachable however the roads fall. */
const SPIRE = spireForCell(2464, -6156);
const DAY = 86400000;
const OWED_DAYS = 2;                                  // under TRIBUTE_CAP_DAYS
const OWED_COINS = OWED_DAYS * TRIBUTE_PER_DAY;       // level 1: no multiplier
const OWED_DUST = OWED_DAYS * TRIBUTE_DUST_PER_DAY;

const { browser, page, errors } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
await page.setGeolocation({ latitude: SPIRE.lat, longitude: SPIRE.lng });
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const cap = await boneyardCapability(page);
if (!cap.ok) {
  const why = 'the Boneyard could not draw on this machine, and the tribute button only exists on it';
  for (const n of ['SETUP a spire is in range and the button owns its own pixels',
    'SETUP the button offers the tribute', 'TAP the real tap throws nothing',
    'PAID coins rose by exactly the tribute owed', 'PAID Bone Dust rose by exactly the tribute owed',
    'PAID the tower recorded the collection', 'CONTROL the pageerror listener is live']) unproven(n, why);
  await browser.close();
  srv?.close();
  unprovenReport('tribute-collect-audit.mjs', cap);
  process.exit(UNPROVEN_EXIT);
}

await seed(page, { level: 18, coins: 500, dust: 100, reload: false });

/* A HELD TOWER WITH TRIBUTE OWED, written the way the game writes it: the same
   kv record claimSpire produces, with the clocks pushed back two days. Held (not
   dormant: tendedAt is well inside RESOLVE_DAYS) and owing exactly two days. */
const seeded = await page.evaluate(async (o) => {
  if (!new URLSearchParams(location.search).has('demo')) return { error: 'not in ?demo mode' };
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const now = Date.now();
  const v = { [o.id]: {
    claimedAt: now - 5 * o.DAY, tendedAt: now - o.days * o.DAY, collectedAt: now - o.days * o.DAY,
    level: 1, meta: { name: o.name, lat: o.lat, lng: o.lng },
  } };
  await new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({ k: 'spires', v });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  return { wrote: o.id };
}, { id: SPIRE.id, name: SPIRE.name, lat: SPIRE.lat, lng: SPIRE.lng, days: OWED_DAYS, DAY });
if (seeded.error) { console.log('FAIL  SETUP could not seed a held tower:', seeded.error); await done(browser); }

await page.reload({ waitUntil: 'networkidle2' });
await sleep(2400);

// The Boneyard opens on a location explainer; the map is behind its button.
await page.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(2500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
  if (b) b.click();
});

/* Poll rather than sleep: the button only appears once the tiles have loaded,
   the walkability snap has resolved and refreshSpires has run, and none of
   those is a constant. */
const readButton = () => page.evaluate(() => {
  const b = document.querySelector('#mapSpire');
  if (!b) return { found: false };
  const r = b.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  return {
    found: true, hidden: b.hidden, disabled: b.disabled,
    label: (b.textContent || '').trim(),
    w: Math.round(r.width), h: Math.round(r.height), x: Math.round(cx), y: Math.round(cy),
    /* The TAP POINT is what has to be on screen, not the whole box: the action
       bar is a full-bleed button whose rect runs a few px past the right edge,
       and demanding the rect be wholly inside the viewport fails a button a
       thumb can hit perfectly well. Centre in the viewport, plus the hit test
       below at that same point, is the pair that actually predicts a tap. */
    inViewport: cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight,
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
    viewport: [innerWidth, innerHeight],
    ownsPixels: !!(hit && (hit === b || b.contains(hit))),
    markers: document.querySelectorAll('.map-spire').length,
  };
});

let btn = { found: false };
for (let i = 0; i < 30; i++) {
  btn = await readButton();
  if (btn.found && !btn.hidden && btn.w > 0) break;
  await sleep(1000);
}

ok('SETUP a spire is in range and the button owns its own pixels',
  btn.found && !btn.hidden && !btn.disabled && btn.w > 0 && btn.h > 0 && btn.inViewport && btn.ownsPixels && btn.markers > 0,
  JSON.stringify(btn));
ok('SETUP the button offers the tribute',
  /^Collect \d+ from /.test(btn.label), `label: ${JSON.stringify(btn.label)}`);
// Everything below grades a tap that never happened if the button is not there.
if (fails.length) await done(browser);

const purse = () => page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const get = k => new Promise(res => {
    const rq = db.transaction('kv').objectStore('kv').get(k);
    rq.onsuccess = () => res(rq.result ? rq.result.v : null); rq.onerror = () => res(null);
  });
  return { coins: (await get('coins')) || 0, dust: (await get('bonedust')) || 0, spires: await get('spires') };
});

const before = await purse();
const errorsBefore = errors.length;

// THE TAP. A real mouse click at the button's real centre, hit-tested above.
await page.mouse.click(btn.x, btn.y);

// Poll for the payout rather than assuming one tick is enough; the handler
// awaits two IndexedDB writes and a refreshSpires.
let after = before;
for (let i = 0; i < 20; i++) {
  await sleep(500);
  after = await purse();
  if (after.coins !== before.coins && after.dust !== before.dust) break;
}
const thrown = errors.slice(errorsBefore);

ok('TAP the real tap throws nothing', thrown.length === 0,
  thrown.length ? thrown.join(' | ') : 'no pageerror across the tap');
ok('PAID coins rose by exactly the tribute owed', after.coins - before.coins === OWED_COINS,
  `${before.coins} -> ${after.coins} (expected +${OWED_COINS})`);
ok('PAID Bone Dust rose by exactly the tribute owed', after.dust - before.dust === OWED_DUST,
  `${before.dust} -> ${after.dust} (expected +${OWED_DUST})`);

const recBefore = before.spires?.[SPIRE.id], recAfter = after.spires?.[SPIRE.id];
ok('PAID the tower recorded the collection',
  !!(recBefore && recAfter && recAfter.collectedAt > recBefore.collectedAt),
  `collectedAt ${recBefore?.collectedAt} -> ${recAfter?.collectedAt}`);

/* CONTROL. A green TAP row above means either "nothing threw" or "the drive
   never got near the handler", and those look identical from here. So throw a
   ReferenceError of the same shape the bug throws, from the page, uncaught, and
   require this run's listener to have caught it. If this row fails, every green
   above it is worthless and the file says so. */
const ctlBefore = errors.length;
await page.evaluate(() => { setTimeout(() => { boneDustAddNotDefinedControl(1); }, 0); });
await sleep(600);
const caught = errors.slice(ctlBefore);
ok('CONTROL the pageerror listener is live',
  caught.some(e => /ReferenceError/.test(e)),
  caught.length ? caught.join(' | ') : 'the listener caught NOTHING: the green rows above prove nothing');

await done(browser);

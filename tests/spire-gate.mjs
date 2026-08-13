/* Dark Spire day-gate audit.
 *
 * THE BUG (reported by Tom 2026-08-07): "the spires on the map had the same
 * problem as the glutton where once you beat it you can just go right back in and
 * fight again." Confirmed: `spireKey` had existed in spires.js since Dark Spires
 * shipped and was wired to nothing, so a spire fight left no ledger row. Beat a
 * tower whose claim is then refused (at SPIRE_CAP, or inside its 1h shield) and
 * the button still read "Take", paying 40 coins per rerun, forever. Losing was
 * equally free to retry.
 *
 * This drives the real map at a real spire and checks the gate BOTH ways, so the
 * red proof is the first half of the test rather than a comment:
 *   1. with no ledger row, the button offers the fight   (fails if I over-gated)
 *   2. with today's row present, it refuses until tomorrow (fails if the gate is dead)
 *
 * Reaching a spire is the hard part: spiresNear() is deterministic cell maths, so
 * the page computes a real spire's coordinates and we teleport onto it rather than
 * hoping one happens to be within SPIRE_RADIUS_M of a hardcoded lat/lng.
 *
 * Usage: node tests/spire-gate.mjs   (or URL=... for live)
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serveTree, loadPuppeteer } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* puppeteer via godmode's loadPuppeteer: the repo's own node_modules first so a
   fresh clone works after `npm install`, the overlay-render-kit as fallback so the
   already-configured machines need no install. Each of these files used to carry
   its OWN copy of a hardcoded path into a sibling project. */
const puppeteer = await loadPuppeteer();
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
base = base.replace(/\/?$/, '/');

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'new',
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207, accuracy: 8 });
await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
await sleep(2600);

// ask the app itself where a spire is, then stand on it
const spire = await page.evaluate(async () => {
  const m = await import('./js/spires.js');
  const s = m.spiresNear(49.2827, -123.1207)[0];
  return s ? { id: s.id, lat: s.lat, lng: s.lng, name: s.name, radius: m.SPIRE_RADIUS_M } : null;
});
if (!spire) { console.log('FAIL  could not locate a spire; the audit cannot run'); await browser.close(); if (srv) srv.kill(); process.exit(1); }
console.log(`  standing on ${spire.name} (${spire.id})`);
await page.setGeolocation({ latitude: spire.lat, longitude: spire.lng, accuracy: 8 });

const openMap = async () => {
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(900);
  await page.evaluate(() => { location.hash = '#/boneyard'; });
  await sleep(2000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /open the map/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(9000);
};
const spireBtn = () => page.evaluate(() => {
  const b = document.querySelector('#mapSpire');
  if (!b) return null;
  return { hidden: b.hidden, disabled: !!b.disabled, spent: b.classList.contains('spent'), text: (b.textContent || '').trim() };
});

/* ---------- 1. no ledger row: the tower must be attackable ---------- */
await openMap();
let b = await spireBtn();
ok('SPIRE button is offered when the day is unspent', !!b && !b.hidden && !b.disabled && /^(Take|Collect|Tend|Break)/.test(b.text), JSON.stringify(b));
const offeredTake = !!b && /^Take/.test(b.text);
ok('SPIRE is an unheld tower, so the day-gate applies to it', offeredTake, b ? b.text : 'no button');

/* ---------- 2. today's attempt on the ledger: it must refuse ---------- */
// write the SAME row shape settle() writes. Demo database only.
const wrote = await page.evaluate(async (id) => {
  const db = await import('./js/db.js');
  const { dateKey } = await import('./js/nutrition.js');
  const { spireKey } = await import('./js/spires.js');
  const key = spireKey(id, dateKey());
  await db.db.put('xp', { key, type: 'spiretry', xp: 0, label: 'audit', date: dateKey(), ts: Date.now() });
  dispatchEvent(new CustomEvent('bh-spire-tried', { detail: { id } }));
  return key;
}, spire.id);
console.log(`  wrote ledger row ${wrote}`);
await sleep(3500);

b = await spireBtn();
ok('SPIRE refuses a second attempt the same day', !!b && b.disabled && /tomorrow/i.test(b.text), JSON.stringify(b));

// and the handler must refuse too, not just the button: tap it anyway
const beforeTap = await page.evaluate(() => document.querySelectorAll('.sheet').length);
await page.evaluate(() => {
  const el = document.querySelector('#mapSpire');
  if (!el) return;
  el.disabled = false;                       // simulate a stale tap getting through
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 4, clientY: r.top + 4 }));
});
await sleep(1600);
const afterTap = await page.evaluate(() => document.querySelectorAll('.sheet').length);
ok('SPIRE handler refuses even if the button is re-enabled', afterTap === beforeTap, `sheets ${beforeTap} -> ${afterTap}`);

/* ---------- 3. the boss-den tap sheet ---------- */
/* Tapping a den used to show a one-line tooltip. It now opens the sheet Tom
   approved, and the point of that sheet is that every number in it is real, so
   this checks the ODDS ADD UP rather than merely that a sheet appeared: a panel
   advertising a 62/29/9 the roll does not honour is worse than the tooltip.

   TRAP: `.map-den-mark` also appears three times inside the map LEGEND
   (mapLegendHtml renders live marker markup so the key can never drift from the
   map). Querying it unscoped finds those legend swatches, which sit at 0,0 with a
   real bounding box while the legend is hidden, so a tap "succeeds" and opens
   nothing. Scope to actual MapLibre markers. */
const den = await page.evaluate(async () => {
  const m = await import('./js/poi.js');
  const { dateKey } = await import('./js/nutrition.js');
  // densNear(WEEK, lat, lng, date). Passing coordinates as the first two args
  // silently returns garbage (a longitude arrives as the latitude).
  const d = m.densNear(m.isoWeekKey(), 49.2827, -123.1207, dateKey())[0];
  return d ? { id: d.id, lat: d.lat, lng: d.lng, name: d.name, boss: d.boss, tier: d.tier } : null;
});
if (!den) {
  console.log('  SKIP den sheet: densNear returned nothing');
} else {
  console.log(`  standing on ${den.name} (tier ${den.tier}, boss ${den.boss})`);
  await page.setGeolocation({ latitude: den.lat, longitude: den.lng, accuracy: 8 });
  await openMap();
  const denTap = await page.evaluate(async () => {
    const els = [...document.querySelectorAll('.maplibregl-marker .map-den-mark, .maplibregl-marker.map-den-mark')];
    if (!els.length) return { reason: 'no den MARKER on the map (legend swatches do not count)' };
    let sheet = null, tried = 0;
    for (const el of els) {
      tried++;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 1100));
      sheet = document.querySelector('.sheet.t1');
      if (sheet) break;
    }
    if (!sheet) return { reason: `none of ${tried} den marker(s) opened a sheet` };
    const odds = [...sheet.querySelectorAll('.den-odds span i')].map(x => parseInt(x.textContent, 10));
    return {
      opened: true, tried,
      title: (sheet.querySelector('.sheet-head h2')?.textContent || '').trim(),
      name: (sheet.querySelector('.den-hero .who b')?.textContent || '').trim(),
      tier: (sheet.querySelector('.den-hero .tier')?.textContent || '').trim(),
      odds, oddsSum: odds.reduce((a, b) => a + b, 0),
      pays: sheet.querySelectorAll('.den-pays .p').length,
      hasArt: !!sheet.querySelector('.den-hero .art img')?.naturalWidth,
      foot: (sheet.querySelector('.t1-foot .btn')?.textContent || '').trim(),
      footEnabled: !sheet.querySelector('.t1-foot .btn')?.disabled,
    };
  });
  if (denTap.reason) {
    ok('DEN tap opens the sheet', false, denTap.reason);
  } else {
    ok('DEN tap opens the sheet, not the tooltip', denTap.opened && /den/i.test(denTap.title), JSON.stringify({ title: denTap.title, name: denTap.name, tier: denTap.tier }));
    ok('DEN sheet odds are real and total 100', denTap.odds.length === 3 && denTap.oddsSum === 100, JSON.stringify(denTap.odds));
    ok('DEN sheet shows what it pays', denTap.pays > 0, `${denTap.pays} payout tiles`);
    // naturalWidth, not a CSS box: the grave art is the whole point of the panel
    ok('DEN sheet grave art actually decoded', !!denTap.hasArt, String(denTap.hasArt));
    ok('DEN sheet foot states the next action', /Fight|cleared/i.test(denTap.foot), `${denTap.foot} (enabled=${denTap.footEnabled})`);
  }
}

ok('NO page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join(', ')); process.exit(1); }
console.log('spire-gate clean');

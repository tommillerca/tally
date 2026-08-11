/* ROAMING MINI-BOSSES MUST LOOK LIKE SOMETHING.
 *
 * Tom, 2026-08-10: "the first miniboss i fought today was not one of the ones we
 * worked on creating yesterday that has a theme to it. what is going on man this
 * is so many mistakes."
 *
 * He was right and it had never worked. Dens and the Gauntlet have passed a
 * themed look into openFight since the roster existed; the mini handler passed
 * only a NAME, and not one of the six mini names is in bosses.js LOOKS, so every
 * mini fell through foeOutfitFor to its random-cosmetic coin flip. A Marsh Ghoul
 * and a Cinder Shade were the same starter skeleton wearing different junk.
 *
 * The unit tests already guard that each mini theme RESOLVES to a look. This
 * guards the end of the chain instead: walk onto a real mini on a real map, start
 * the real fight, and read the layers the foe is actually drawn with. A one-line
 * pass-through is exactly the kind of glue that gets dropped by a later edit, and
 * a table check would not notice.
 *
 * PROVE-RED: with `foeOutfit` removed from the #mapMini openFight call, the drawn
 * layers come back as the coin-flip look and this fails on "drawn layers are the
 * themed ones".
 */
import { boot, seed, sleep, settle } from './godmode.js';
import { minisNear } from '../js/poi.js';
import { themedLook } from '../js/bosses.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const base = process.argv[2] || 'http://localhost:8765/';

/* poi.js is pure, so the fixture is computed here rather than scraped out of the
   page: that way the expectation comes from the generator and the page has to
   agree with it, not the other way round. */
/* THE APP'S dateKey() IS LOCAL, NOT UTC. This used toISOString(), so from the
   moment local time crossed into the next UTC day (17:00 here) the audit asked
   poi.js for TOMORROW's minis, teleported to one that today's map does not spawn,
   and reported "the map put a mini in reach" as a failure against working code.
   It passed all day and would have failed every evening. Same function the app
   uses, same day boundary. */
const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const date = dateKey();
const HOME = { latitude: 49.2827, longitude: -123.1207 };
/* CANDIDATES, NOT JUST THE NEAREST. The generator's position is not where the app
   puts the mini: placeWalkable snaps it onto reachable ground, and that snap can
   move it further than MINI_RADIUS_M (75m) from where we teleported. Standing on
   near[0] therefore works or does not depending on the DAY'S SEED, which is a
   fixture that fails at midnight and passes by morning: exactly the shape of the
   UTC bug this file already carries a comment about. Today (2026-08-11) near[0]
   snapped out of reach and the run went red on working code.
   So the audit tries the closest few in turn and reports which one it stood on.
   Running out of candidates is a real failure, not a silent skip. */
const near = minisNear(date, HOME.latitude, HOME.longitude);
ok('the fixture actually has minis to walk to', near.length > 0,
  near.length ? `${near.length} near Vancouver: ${near.slice(0, 3).map(m => `${m.name} @${Math.round(m.dist)}m`).join(', ')}` : 'none today');
if (!near.length) { console.log('\n1 FAILED: no mini fixture'); process.exit(1); }
const CANDIDATES = near.slice(0, 4);
let mini = CANDIDATES[0];

const want = themedLook(mini.theme.key, `${date}:${mini.id}`);
ok('and its theme has a look behind it', !!want, JSON.stringify(want));

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errs = []; page.on('pageerror', e => errs.push(String(e)));
const origin = new URL(base).origin;
await browser.defaultBrowserContext().overridePermissions(origin, ['geolocation']);
// stand ON it: the handler refuses outside MINI_RADIUS_M, and placeWalkable can
// still shift it a few tens of metres from where the generator put it
await page.setGeolocation({ latitude: mini.lat, longitude: mini.lng });
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await seed(page, { level: 18, coins: 500 });

async function standOn(cand) {
  await page.setGeolocation({ latitude: cand.lat, longitude: cand.lng });
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(600);
  await page.evaluate(() => { location.hash = '#/boneyard'; });
  await sleep(2500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(9000);
  return page.evaluate(() => {
    const b = document.getElementById('mapMini');
    return { exists: !!b, hidden: b ? b.hidden : null, marks: document.querySelectorAll('.map-mini-mark').length };
  });
}
let reach = { exists: false, hidden: true, marks: 0 }, tried = [];
for (const cand of CANDIDATES) {
  reach = await standOn(cand);
  tried.push(`${cand.name}@${Math.round(cand.dist)}m:${reach.hidden === false ? 'IN REACH' : 'snapped away'}`);
  if (reach.exists && reach.hidden === false) { mini = cand; break; }
}
ok('the map put a mini in reach', reach.exists && reach.hidden === false,
  tried.join(' | ') + (reach.hidden === false ? '' : '  <- every candidate snapped out of the 75m radius'));
const want2 = themedLook(mini.theme.key, `${date}:${mini.id}`);

if (reach.exists && reach.hidden === false) {
  await page.evaluate(() => document.getElementById('mapMini').click());
  await sleep(2600);
  await settle(page, 400);
  const foe = await page.evaluate(() => {
    const stage = document.getElementById('foeStage') || document.querySelector('.fighterG.foe-side');
    if (!stage) return { why: 'no foe stage' };
    const imgs = [...stage.querySelectorAll('img')];
    return {
      name: (document.querySelector('.hud-side.foe .hud-name, .hud-side:last-child .hud-name') || {}).textContent?.trim() || null,
      /* ids off the asset paths, because that is what the player is looking at:
         assets/bh/<slot>/<id>.png */
      ids: imgs.map(i => (i.getAttribute('src') || '').replace(/^.*\/bh\/[^/]+\//, '').replace(/\.png.*$/, '')),
      broken: imgs.filter(i => !i.naturalWidth).map(i => i.getAttribute('src')),
    };
  });
  ok('the mini fight opened', !foe.why, foe.why || `foe: ${foe.name}`);
  ok('its art all decodes', !foe.broken?.length, (foe.broken || []).join(', '));
  /* THE ASSERTION. Every id in the themed look must be on screen. Not "some art
     rendered" (the coin-flip look renders art too, which is exactly why this went
     unnoticed) and not a set comparison against the whole look (equipped gear can
     legitimately add a weapon layer). */
  const wantIds = Object.entries(want2 || want || {}).filter(([k]) => k !== 'BG' && k !== 'YD').map(([, v]) => v);
  const drawn = new Set(foe.ids || []);
  const missing = wantIds.filter(id => !drawn.has(id));
  ok('the drawn layers are the themed ones', wantIds.length > 0 && missing.length === 0,
    `want ${wantIds.join(',')} | missing ${missing.join(',') || 'none'} | drawn ${[...drawn].join(',')}`);
}

ok('no page errors', errs.length === 0, errs.join(' ; '));
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);

/* THE SPIRE SHEET IS A POSTER OF ITS KEEPER, AND THE KEEPER IS ACTUALLY DRAWN.
 *
 * Tom, 2026-08-08: "make me a mockup for what happens when you click the spire
 * because it's boring how you fixed it. i told you the bonehead controlling it
 * should be loud and proud... make it feel like someone is excited and proud to
 * be defending their neighbourhood spire with their customized bonehead."
 * Built to market-quality-mockups/spire.html.
 *
 * The failure this exists to catch is NOT layout, it is a blank stage. The
 * keeper's fit arrives as a rival's profile snapshot and is composed by
 * composeAvatars after the sheet is already on screen, so a bad slot list or a
 * missed compose leaves a beautifully laid out poster of nobody. Rule 1 of
 * tally/CLAUDE.md: a check that cannot fail is not a check, so this asserts
 * DECODED pixels (naturalWidth > 0) on layers that are actually visible, and
 * treats zero layers as a failure rather than "no bad layers found".
 *
 * PROVE-RED (confirmed 2026-08-07): point the keeper at `{}` instead of the
 * rival's outfit and ART fails with 0 decoded layers; drop .spp from app.css and
 * SIZE fails because the figure collapses to the old thumbnail height.
 *
 * Usage: node tests/spire-poster.mjs        (URL=... for live)
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

const { browser, page } = await boot(base);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await seed(page, { level: 18, coins: 500 });

/* A real rival tower: the shape the map hands openSpireInfoSheet, with a fit
   copied off an actual player row in production so every asset id is one that
   exists. Held for 34 days, which is deep enough to have earned a warden title. */
const INFO = {
  s: { name: 'Queen Street Spire', dist: 40 },
  view: { tribute: null },
  held: false,
  dormant: false,
  besieged: false,
  siegeUntil: 0,
  siegeName: null,
  lvl: 4,
  heldSince: Date.now() - 34 * 86400000,
  rival: {
    ownerName: 'Bony Wrecker',
    defender: {
      outfit: { B: 'B6-3', SK: 'SK3-1', IL: 'IL8-2', M: 'M10', T: 'T2', FW: 'FW8-3', BG: 'BG4-3', E: 'E5', C: 'C2', H: 'H6-2', S: 'S4-1', G: 'G8', IR: 'IR7-3', P: 'P6-1' },
      pet: { id: 'C2', level: 10, shiny: false },
    },
  },
};

await page.evaluate(async info => { await window.__spireSheet(info); }, INFO);
await sleep(1400);

const shot = await page.evaluate(() => {
  const p = document.querySelector('.spp');
  if (!p) return { open: false };
  const vis = el => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && el.getBoundingClientRect().height > 0;
  };
  const layers = [...document.querySelectorAll('.spp .bh img')];
  return {
    open: true,
    figureH: Math.round(document.querySelector('.spp .bh').getBoundingClientRect().height),
    posterH: Math.round(p.getBoundingClientRect().height),
    layers: layers.length,
    decoded: layers.filter(i => i.naturalWidth > 0 && vis(i)).length,
    blank: layers.filter(i => !(i.naturalWidth > 0)).map(i => i.getAttribute('src')),
    ribbon: document.querySelector('.spp .ribbon')?.textContent.replace(/\s+/g, ' ').trim() || null,
    lvchip: document.querySelector('.spp .lvchip')?.textContent.trim() || null,
    plateName: document.querySelector('.spp-plate b')?.textContent.trim() || null,
    plateSub: document.querySelector('.spp-plate small')?.textContent.trim() || null,
    plateVisible: vis(document.querySelector('.spp-plate')),
    pet: !!document.querySelector('.spp .pet'),
    tower: vis(document.querySelector('.spp .tower')),
    facts: [...document.querySelectorAll('.den-pays .p')].map(x => x.innerText.replace(/\s+/g, ' ').trim()),
    oldThumb: !!document.querySelector('.sp-hero'),
  };
});

ok('POSTER the spire sheet opens on the keeper poster', shot.open, JSON.stringify({ open: shot.open }));
if (shot.open) {
  ok('POSTER the old thumbnail treatment is gone', shot.oldThumb === false, `.sp-hero present: ${shot.oldThumb}`);
  /* An empty sample set is a FAILURE: zero layers means the fit never rendered,
     which is the exact bug this poster exists to make impossible to miss. */
  ok('ART the keeper is actually DRAWN, not an empty stage',
    shot.layers > 0 && shot.decoded === shot.layers,
    JSON.stringify({ layers: shot.layers, decoded: shot.decoded, blank: shot.blank.slice(0, 3) }));
  /* SIZE: the whole complaint was that the person was thumbnail-sized. The old
     treatment gave them 96px; the mockup gives them 215 on a 250px stage. */
  ok('SIZE the keeper is poster-sized, not a filing-cabinet thumbnail',
    shot.figureH >= 180 && shot.posterH >= 220,
    JSON.stringify({ figure: shot.figureH, poster: shot.posterH }));
  ok('BRAG the title they earned by HOLDING it is on the poster',
    !!shot.ribbon && /[A-Z]/.test(shot.ribbon), String(shot.ribbon));
  ok('BRAG the nameplate flies the keeper\'s name', /bony wrecker/i.test(shot.plateName || ''), String(shot.plateName));
  ok('BRAG and says how long they have stood there', /34 day/i.test(shot.plateSub || ''), String(shot.plateSub));
  ok('BRAG the nameplate is on screen, not clipped by the poster it overlaps', shot.plateVisible === true, `visible: ${shot.plateVisible}`);
  ok('BRAG their pet turns up too', shot.pet === true, `pet rendered: ${shot.pet}`);
  ok('SCENE the tower is scenery behind them, still drawn', shot.tower === true, `tower: ${shot.tower}`);
  ok('FACTS the tower\'s history is still stated (an empty row is a FAILURE)',
    shot.facts.length >= 2 && shot.facts.every(f => f.length > 0), JSON.stringify(shot.facts));
  ok('FACTS the tower level reads on the poster itself', /LV 4/.test(shot.lvchip || ''), String(shot.lvchip));
}

/* NOBODY HOLDS IT: the poster must degrade to the tombstone rather than to a
   blank purple box (anti-regression rule 8, never default to hidden). */
await page.evaluate(() => history.back());
await sleep(400);
await page.evaluate(async info => {
  await window.__spireSheet({ ...info, rival: null, heldSince: null });
}, INFO);
await sleep(900);
const empty = await page.evaluate(() => {
  const p = document.querySelector('.spp');
  if (!p) return { open: false };
  const img = p.querySelector('.bh img');
  return {
    open: true,
    empty: p.classList.contains('empty'),
    drawn: !!img && img.naturalWidth > 0 && img.getBoundingClientRect().height > 40,
    name: document.querySelector('.spp-plate b')?.textContent.trim() || null,
  };
});
ok('UNCLAIMED an unheld tower still draws something', empty.open && empty.drawn,
  JSON.stringify(empty));
ok('UNCLAIMED and says so plainly', /nobody/i.test(empty.name || ''), String(empty.name));

/* DORMANT-WITH-HISTORY: a tower the player claimed that has since gone dormant.
   The app promises "never lost, just quiet", and the tester report of 2026-08-15
   (QueenLene, THE BLACK WATCH) caught the plate saying "Never been taken" for
   exactly this case. That copy is factually wrong: the tower WAS taken, and the
   local record still knows when. The sheet must render dormant-with-history
   honestly, not fall back to the never-been-taken branch.

   The fix at js/app.js:13937 preserves heldSince from the local record even when
   `held` flips false at dormancy; the fix at js/app.js:3799 branches the sub to
   "Yours, gone dormant" instead of "Unclaimed" when the same condition holds.
   PROVE-RED: revert either edit and this run goes red naming which copy line
   broke. */
await page.evaluate(() => history.back());
await sleep(400);
await page.evaluate(async info => {
  await window.__spireSheet({
    ...info,
    rival: null,
    held: false,
    dormant: true,
    heldSince: Date.now() - 9 * 86400000,   // claimed 9 days ago, went dormant on day 7
  });
}, INFO);
await sleep(900);
const dorm = await page.evaluate(() => {
  const p = document.querySelector('.spp');
  if (!p) return { open: false };
  return {
    open: true,
    plateName: document.querySelector('.spp-plate b')?.textContent.trim() || null,
    plateSub: document.querySelector('.spp-plate small')?.textContent.trim() || null,
    sub: document.querySelector('.sheet-head .sub')?.textContent.trim() || null,
  };
});
ok('DORMANT the sheet opens on a tower the player let go dormant', dorm.open);
ok('DORMANT the plate does NOT say "Never been taken" (the tower WAS taken)',
   !/never been taken/i.test(dorm.plateSub || ''), `plateSub="${dorm.plateSub}"`);
ok('DORMANT the plate reports the claim history ("Standing N days")',
   /standing \d+ day/i.test(dorm.plateSub || ''), `plateSub="${dorm.plateSub}"`);
ok('DORMANT the sub does NOT say "Unclaimed" (the tower is still yours)',
   !/^unclaimed$/i.test(dorm.sub || ''), `sub="${dorm.sub}"`);

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);

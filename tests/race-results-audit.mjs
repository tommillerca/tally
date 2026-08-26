/* THE STEP RACE RESULT ON TODAY.
 *
 * WHAT THIS EXISTS TO CATCH, stated before the checks so a future reader can
 * tell whether they still discriminate:
 *
 *  1. The podium shown is not the podium that was PAID. This is the whole
 *     reason the feature reads /steps/settled instead of /steps/week. Measured
 *     on production 2026-08-14, seven days after the only race that has ever
 *     settled: three of the five players who were paid had already rolled into
 *     the new week and had VANISHED from /steps/week, which returned three
 *     players who never placed and promoted 5th to 2nd. A poster built on that
 *     board announces the wrong winners, silently, and only in some weeks.
 *     PAID is therefore the first and most important row here.
 *  2. The result is in the DOM but invisible. This app shipped three separate
 *     "present but at opacity 0" bugs in eight days (v370 onboarding, the fight
 *     result, the crate reveal), so presence is not evidence. VISIBLE measures
 *     the effective opacity PRODUCT up the ancestor chain, the way
 *     freeze-reveal-audit does.
 *  3. (RETIRED 2026-08-25 with the poster: it used to show twice on launch.)
 *  4. It renders with nothing in it. An empty podium must produce NO poster at
 *     all, never a frame with an empty board inside it: an empty sample is a
 *     failure, never a pass.
 *  5. The art goes missing, which is what a decaying data source looks like
 *     from the outside.
 *
 * The podium fixture is the REAL production result, byte for byte, because a
 * fixture that cannot fail check 1 makes check 1 decorative.
 */
import { boot, serveTree, dismissOverlays } from './godmode.js';

const PAID = [
  { place: 1, name: 'Bony Wrecker', steps: 115084, coins: 5000, crate: 'golden', dust: 200, outfit: { B: 'B0-1', SK: 'SK0-1' } },
  { place: 2, name: 'Chiseled Goblin', steps: 104000, coins: 2500, crate: 'golden', dust: 100, outfit: { B: 'B0-3', SK: 'SK0-3' } },
  { place: 3, name: 'Massive Horn', steps: 88600, coins: 1500, crate: 'golden', dust: 0, outfit: { B: 'B0-5', SK: 'SK0-5' } },
  { place: 4, name: 'Feisty Fang', steps: 64560, coins: 600, crate: 'daily', dust: 0, outfit: { B: 'B0-2', SK: 'SK0-2' } },
  { place: 5, name: 'Chiseled Patella', steps: 58598, coins: 400, crate: 'daily', dust: 0, outfit: { B: 'B0-6', SK: 'SK0-6' } },
];
/* What /steps/week returns for that same week TODAY. Not invented: this is the
   live board measured against production, and it is what the poster must never
   be able to show. Three of these five never placed. */
const LIVE_BOARD_TODAY = ['Bony Wrecker', 'Chiseled Patella', 'Silent Humerus', 'Grisly Bruiser', 'Mighty Ripper'];

let failed = 0;
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) failed++;
};

const srv = process.argv[2] ? null : await serveTree(process.cwd());
const base = process.argv[2] || srv.url;
const { browser, page } = await boot(base);
const errs = [];
page.on('pageerror', e => errs.push(String(e)));

await page.evaluate(podium => { window.__raceResults = () => podium; }, PAID);
await dismissOverlays(page);

/* THE POSTER IS GONE (2026-08-25) and with it every row that graded it: the
   veil, its FITS/scroll geometry, "Nice one" closing it, and the TWICE / THEN
   STOP / count rows that graded its showing budget. It was a full-screen
   takeover on the launch path, and Tom asked for that whole class to leave the
   game. Measured on a booted simulator on a level-1 account two minutes old
   that had never walked: the poster was the first thing on the screen after the
   daily wheel, because the podium comes off the SERVER and not off your own
   history. So it was not, as the old header implied, a receipt only a racer
   could see.
   WHAT SURVIVES IS EVERY ROW THAT MATTERED. The five failure modes at the top
   of this file are properties of the DATA and of the surface that shows it, and
   the Today banner shows the same podium from the same settledPodium() read:
   PAID, the stray-name discrimination, VISIBLE and the art are all graded on it
   below. The banner also carries strictly MORE than the poster did (every
   place's purse, not just the winner's haul), which is why it was always
   described in js/app.js as the result's permanent home.
   EMPTY moved with them: it is asserted on the banner, which is where an empty
   podium can now render an empty frame. */

/* Give the art a bounded moment to decode. Bounded, not unconditional: if it
   never decodes the REAL row below still goes red, which is the point. */
await page.evaluate(() => { location.hash = '#/'; });
await new Promise(r => setTimeout(r, 1500));
/* OPENED BY A REAL TAP on the card's own summary, not by setting .open. The
   banner is a <details> and expanding it is the only interaction a player has
   with this surface, so driving it any other way would grade a card nobody can
   necessarily reach: exactly the failure guard-hygiene-lint's SEAM row was
   written for after fifteen green rows on an unreachable Paddock viewer. */
await page.waitForSelector('#raceResultCard:not([hidden]) summary', { timeout: 8000 }).catch(() => {});
await page.click('#raceResultCard summary').catch(() => {});
await page.waitForFunction(() => {
  const c = document.querySelector('#raceResultCard');
  if (!c || !c.open) return false;
  const im = [...c.querySelectorAll('img')];
  return im.length > 0 && im.every(i => i.naturalWidth > 0);
}, { timeout: 6000 }).catch(() => {});

const card = await page.evaluate(() => {
  const c = document.querySelector('#raceResultCard');
  if (!c || c.hidden) return { none: true };
  // EFFECTIVE opacity, up the whole ancestor chain. A container at 0 anywhere
  // above the card makes every child invisible while querySelector still finds
  // them, which is exactly how three of these shipped.
  let eff = 1;
  for (let n = c; n && n.nodeType === 1; n = n.parentElement) {
    eff *= parseFloat(getComputedStyle(n).opacity || '1');
    if (getComputedStyle(n).visibility === 'hidden') eff = 0;
  }
  const lanes = [...c.querySelectorAll('.race-lane')].map(l => ({
    place: (l.querySelector('.rk') || {}).textContent,
    name: (l.querySelector('.nm b') || {}).textContent,
    steps: (l.querySelector('.nm .st') || {}).textContent,
  }));
  const imgs = [...c.querySelectorAll('.race-lane .run img')];
  return {
    none: false, eff, lanes, opened: c.open,
    winner: (c.querySelector('.race-h b') || {}).textContent,
    imgs: imgs.length,
    decoded: imgs.filter(i => i.naturalWidth > 0).length,
  };
});

ok('REACH a real tap on the card opens it, so a player can get to the podium at all',
  !card.none && card.opened === true, card.none ? 'no card on Today' : `open=${card.opened}`);
ok('VISIBLE the result is actually on screen, not merely in the DOM',
  !card.none && card.eff > 0.9, `effective opacity ${card.none ? 'no card' : card.eff}`);

/* THE ROW THAT MATTERS. Every place, every name, every step count, against the
   record that was paid. Not "five rows rendered": five SPECIFIC rows. */
const paidMatch = !card.none && card.lanes.length === PAID.length && PAID.every((p, i) =>
  card.lanes[i].place === String(p.place) &&
  card.lanes[i].name === p.name &&
  card.lanes[i].steps === p.steps.toLocaleString());
ok('PAID the podium is exactly the one the server paid, in order',
  paidMatch, JSON.stringify(card.lanes));

/* And the discriminating half: not one name off the live board may appear. If
   somebody ever repoints this at /steps/week, three of these five arrive. */
const strays = card.none ? [] : card.lanes.map(l => l.name)
  .filter(n => LIVE_BOARD_TODAY.includes(n) && !PAID.some(p => p.name === n));
ok('PAID nobody from the live board who was never paid is on the result',
  strays.length === 0, strays.length ? `stray: ${strays.join(', ')}` : 'none');

ok('the winner leads the card by name',
  !card.none && /BONY WRECKER/i.test(card.winner || ''), card.winner);

/* COUNT FIRST, then decode. `decoded === imgs` alone passes vacuously the
   moment the art source goes empty, because avatarLayersHtml emits NO <img> for
   an id it does not know: 2 of 2 decoded reads green on a board of five faceless
   discs. Caught by proving this row red and watching it stay green. Every lane
   must carry its layers AND every layer must have decoded. */
ok('REAL every racer is drawn, and the art actually decoded',
  !card.none && card.imgs >= card.lanes.length * 2 && card.decoded === card.imgs,
  `${card.decoded}/${card.imgs} decoded across ${card.none ? 0 : card.lanes.length} lanes`);

/* EMPTY. No settled result must render NOTHING, not an empty frame. The cache is
   cleared first, or this would read back the podium above and prove nothing: an
   empty sample is a failure, and so is a test fed a full one. */
await page.evaluate(() => window.__raceResultForgetCache());
await page.evaluate(() => { window.__raceResults = () => []; });
await page.evaluate(() => { location.hash = '#/boneyard'; });
await new Promise(r => setTimeout(r, 900));
await page.evaluate(() => { location.hash = '#/'; });
await new Promise(r => setTimeout(r, 1800));
const emptyCard = await page.evaluate(() => {
  const c = document.querySelector('#raceResultCard');
  return { present: !!c, hidden: c ? c.hidden : null, lanes: c ? c.querySelectorAll('.race-lane').length : 0 };
});
ok('EMPTY an empty podium renders no result card at all, rather than an empty one',
  emptyCard.hidden !== false || emptyCard.lanes === 0, JSON.stringify(emptyCard));
await page.evaluate(() => window.__raceResultForgetCache());

/* THE BANNER, which is the surface that carries every place's purse. */
await page.evaluate(podium => { window.__raceResults = () => podium; }, PAID);
/* Bounce off Today and back. The EMPTY rows above left the app sitting on a
   rendered Today with the card hidden, and assigning location.hash its CURRENT
   value fires no hashchange, so route() never runs and the re-seeded podium is
   never read: 0 lanes, and four BANNER rows red on a healthy tree. Same trap
   tray-destination-audit's header describes one layer down. */
await page.evaluate(() => { location.hash = '#/boneyard'; });
await new Promise(r => setTimeout(r, 1200));
await page.evaluate(() => { location.hash = '#/'; });
await new Promise(r => setTimeout(r, 2000));
await page.click('#raceResultCard summary').catch(() => {});
const banner = await page.evaluate(() => {
  const b = document.querySelector('#raceResultCard');
  if (!b) return { none: true };
  let eff = 1;
  for (let n = b; n && n.nodeType === 1; n = n.parentElement) eff *= parseFloat(getComputedStyle(n).opacity || '1');
  return {
    none: false, hidden: b.hidden, eff,
    head: (b.querySelector('.race-h b') || {}).textContent,
    lanes: b.querySelectorAll('.race-lane').length,
    purses: b.querySelectorAll('.rr-prize').length,
    lastPurse: (b.querySelector('.race-lane.r5 .rr-prize') || {}).textContent,
  };
});
ok('BANNER the settled result has a permanent home on Today',
  !banner.none && !banner.hidden && banner.eff > 0.9, JSON.stringify(banner));
ok('BANNER it names the winner in the summary, so it reads collapsed',
  !banner.none && /BONY WRECKER/i.test(banner.head || ''), banner.head);
/* Tom, 2026-08-14: "that's fine 4th and 5th can find out from the banner." So
   the banner carrying every purse is a promise, and this is the row that keeps
   it. The poster deliberately has none, which the FITS row above is why. */
ok('BANNER every place carries its full purse, including 5th',
  !banner.none && banner.purses === 5 && /400/.test(banner.lastPurse || ''),
  `${banner.purses} purses, 5th: ${JSON.stringify(banner.lastPurse)}`);

/* COPY. Tom, 2026-08-14: "there is already another step challenge going it
   should reflect that." A results card that says a race "starts next week" is
   wrong the moment it is read, because the next race began the day this one
   settled. Asserted as an absence, since that is the sentence that was wrong. */
const copy = await page.evaluate(() => {
  const b = document.querySelector('#raceResultCard');
  return { banner: (b ? b.textContent : '') || '' };
});
ok('COPY the banner says the next race is already running, not that one starts later',
  /already running/i.test(copy.banner) && !/starts next week/i.test(copy.banner),
  JSON.stringify(copy.banner.slice(-120)));

ok('NO page errors', errs.length === 0, errs.join(' | '));

await browser.close();
if (srv) srv.close?.();
console.log(failed ? `\n${failed} FAILED` : '\nthe settled result is the one that was paid');
process.exit(failed ? 1 : 0);

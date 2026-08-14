/* THE STEP RACE RESULTS POSTER + TODAY BANNER.
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
 *  2. The poster is in the DOM but invisible. This app shipped three separate
 *     "present but at opacity 0" bugs in eight days (v370 onboarding, the fight
 *     result, the crate reveal), so presence is not evidence. VISIBLE measures
 *     the effective opacity PRODUCT up the ancestor chain, the way
 *     freeze-reveal-audit does.
 *  3. It shows twice. A result is not a recurring card.
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

const shown = await page.evaluate(() => window.__raceResultShow());
ok('the poster opens at all (an unrenderable poster is not a passing test)', shown === true, `__raceResultShow -> ${shown}`);

/* Give the art a bounded moment to decode. Bounded, not unconditional: if it
   never decodes the REAL row below still goes red, which is the point. */
await page.waitForFunction(() => {
  const im = [...document.querySelectorAll('.rr-veil img')];
  return im.length > 0 && im.every(i => i.naturalWidth > 0);
}, { timeout: 5000 }).catch(() => {});

const card = await page.evaluate(() => {
  const veil = document.querySelector('.rr-veil');
  if (!veil) return { none: true };
  // EFFECTIVE opacity, up the whole ancestor chain. A container at 0 anywhere
  // above the card makes every child invisible while querySelector still finds
  // them, which is exactly how three of these shipped.
  let eff = 1;
  for (let n = veil.querySelector('.drop-card'); n && n.nodeType === 1; n = n.parentElement) {
    eff *= parseFloat(getComputedStyle(n).opacity || '1');
    if (getComputedStyle(n).visibility === 'hidden') eff = 0;
  }
  const lanes = [...veil.querySelectorAll('.race-lane')].map(l => ({
    place: (l.querySelector('.rk') || {}).textContent,
    name: (l.querySelector('.nm b') || {}).textContent,
    steps: (l.querySelector('.nm .st') || {}).textContent,
  }));
  const imgs = [...veil.querySelectorAll('.race-lane .run img, .rr-fig img')];
  const box = veil.querySelector('.drop-card').getBoundingClientRect();
  return {
    none: false, eff, lanes,
    winner: (veil.querySelector('.rr-who b') || {}).textContent,
    winnerSteps: (veil.querySelector('.rr-steps') || {}).textContent,
    imgs: imgs.length,
    decoded: imgs.filter(i => i.naturalWidth > 0).length,
    overflow: Math.round(box.bottom - innerHeight),
    /* The card's own box fitting the viewport proves NOTHING, because the body
       scrolls inside it: the first version of this row passed while 5th place
       sat 57px below the fold. What matters is whether a player sees the whole
       podium without being asked to scroll a popup. */
    scrollOverflow: Math.round(veil.querySelector('.rr-scroll').scrollHeight - veil.querySelector('.rr-scroll').clientHeight),
  };
});

ok('VISIBLE the poster is actually on screen, not merely in the DOM',
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
ok('PAID nobody from the live board who was never paid is on the poster',
  strays.length === 0, strays.length ? `stray: ${strays.join(', ')}` : 'none');

ok('the winner leads the card by name and by total',
  !card.none && card.winner === 'BONY WRECKER'.slice(0, 99) || (!card.none && /BONY WRECKER/i.test(card.winner || '')),
  `${card.winner} / ${card.winnerSteps}`);

/* COUNT FIRST, then decode. `decoded === imgs` alone passes vacuously the
   moment the art source goes empty, because avatarLayersHtml emits NO <img> for
   an id it does not know: 2 of 2 decoded reads green on a board of five faceless
   discs. Caught by proving this row red and watching it stay green. Every lane
   must carry its layers AND every layer must have decoded. */
ok('REAL every racer is drawn, and the art actually decoded',
  !card.none && card.imgs >= card.lanes.length * 2 && card.decoded === card.imgs,
  `${card.decoded}/${card.imgs} decoded across ${card.none ? 0 : card.lanes.length} lanes`);

ok('FITS the whole podium is on a 375x667 phone WITHOUT scrolling the popup',
  !card.none && card.overflow <= 0 && card.scrollOverflow <= 0,
  `card ${card.overflow}px past the viewport, body ${card.none ? '?' : card.scrollOverflow}px past the card`);

await page.evaluate(() => { document.querySelector('#rrLater')?.click(); });
ok('"Nice one" closes it', await page.evaluate(() => !document.querySelector('.rr-veil')));

/* ONCE, driven through the REAL boot gate rather than the shortcut hook, since
   the once-only promise lives in maybeShowRaceResults and nowhere else. Two
   consecutive boots: the first must show the poster, the second must not. */
await page.evaluate(() => window.__raceResultForget());
await page.evaluate(() => window.__raceResultBoot());
await new Promise(r => setTimeout(r, 4200));           // the gate waits 3.2s for a clear screen
const first = await page.evaluate(() => !!document.querySelector('.rr-veil'));
ok('ONCE the real boot gate shows it the first time', first);
await page.evaluate(() => { document.querySelector('#rrLater')?.click(); });

const seenAfter = await page.evaluate(async () => (await import('./js/db.js')).kvGet('raceResultSeen', ''));
ok('ONCE the showing is recorded against the WEEK, not a bare boolean',
  /^\d{4}-\d{2}-\d{2}$/.test(seenAfter || ''), `raceResultSeen = ${JSON.stringify(seenAfter)}`);

await page.evaluate(() => window.__raceResultBoot());
await new Promise(r => setTimeout(r, 4200));
ok('ONCE a second boot does not show it again',
  await page.evaluate(() => !document.querySelector('.rr-veil')));

/* EMPTY. No settled result must produce NO poster, not an empty frame. The
   cache is cleared first, or this would read back the podium above and prove
   nothing: an empty sample is a failure, and so is a test fed a full one. */
await page.evaluate(() => window.__raceResultForget());
await page.evaluate(() => { window.__raceResults = () => []; });
const emptyShown = await page.evaluate(() => window.__raceResultShow());
const emptyVeil = await page.evaluate(() => !!document.querySelector('.rr-veil'));
ok('EMPTY an empty podium renders no poster at all, rather than an empty one',
  emptyShown === false && emptyVeil === false, `shown=${emptyShown} veil=${emptyVeil}`);
await page.evaluate(() => window.__raceResultForget());

/* THE BANNER, which is the surface that carries every place's purse. */
await page.evaluate(podium => { window.__raceResults = () => podium; }, PAID);
await page.evaluate(() => { location.hash = '#/'; });
await new Promise(r => setTimeout(r, 1200));
const banner = await page.evaluate(() => {
  const b = document.querySelector('#raceResultCard');
  if (!b) return { none: true };
  b.open = true;
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

ok('NO page errors', errs.length === 0, errs.join(' | '));

await browser.close();
if (srv) srv.close?.();
console.log(failed ? `\n${failed} FAILED` : '\nthe settled result is the one that was paid');
process.exit(failed ? 1 : 0);

/* CREW LAYOUT audit, 2026-09-05. Four checks, one per ticket from round 35's
 * Crew tab pass (docs/HANDOFF-CODEX-2026-09-05.md candidate work; the tickets
 * themselves are CREW-7/8/9/10 in that round's handoff), each driven against
 * a REAL control on the real screen:
 *
 *   GIFT   a sealed gift renders inside the first 390x844 screen instead of
 *          1301-1754px down under the fan, cheers, two beta strips, the
 *          leaderboard, the race and ADD A FRIEND (CREW-7).
 *   WORTH  the WORTH ADDING card (five rows of strangers, 424px, the single
 *          biggest slice of the tab's measured 941px of dead space) opens on
 *          ONE row with a "See N more" control instead (CREW-8).
 *   HIT    a tap aimed at the fan's side card lands on the side card, not on
 *          the featured card sitting on top of it at scale 0.944 (CREW-9).
 *   TOAST  a cheer whose phrase has an apostrophe reads with a real
 *          apostrophe. toast() writes textContent (js/app.js ~3441), which
 *          never decodes entities, so esc()'ing the phrase before handing it
 *          to toast printed "You&#39;re crushing it!" literally for 2 of the
 *          12 phrases (CREW-10). Driven through the real function that builds
 *          that text (window.__presentGrantDelivery, webdriver-gated the same
 *          way window.__toast is) rather than calling toast() directly, which
 *          would pass even with the bug in place.
 *
 * Proven red on the unfixed tree: `git stash push -- js/app.js` (this file
 * and app.css are untouched by that stash) then rerun; every check but the
 * hidden-sample guards goes FAIL, with the offending strings quoted.
 *
 *   node tests/crew-layout-audit.mjs      (self-serves this checkout)
 *   URL=https://... node tests/crew-layout-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

let srv = null, base = process.env.URL;
if (!base) {
  const h = await serveTree(ROOT);
  srv = { kill: () => h.close() };
  base = h.url;
}

/* FIXTURE PINNED 2026-09-05 from the round-35 Crew handoff (HANDOFFcrew20260905.md, CREW-7/8/9/10):
   enough friends to fill the fan and the WORTH ADDING list so the measured positions
   (gift at 1301-1754px, 941px dead space, 424px card) can be reproduced. */
const FRIENDS = [
  ['DUSTY LULU', 12, { B: 'B0-2', SK: 'SK0-2', T: 'T3' }, 'BG1', null],
  ['MARROW MAX', 19, { B: 'B10', SK: 'SK10', T: 'T2', H: 'H4', IR: 'IR2' }, 'BG3-1', { id: 'C3', level: 4, shiny: false }],
  ['BONE JOVI', 31, { B: 'B11-1', SK: 'SK11-1', T: 'T10-3', H: 'H12-1', IR: 'IR7-2' }, 'BG4-1', { id: 'C1', level: 7, shiny: false }],
  ['GRAVE MINT', 42, { B: 'B0-4', SK: 'SK0-4', T: 'T9-7', H: 'H13-4', IR: 'IR8-2' }, 'BG5-3', { id: 'C2', level: 9, shiny: true }],
  ['SWOLE PHANTOM', 28, { B: 'B1', SK: 'SK1', T: 'T4-1', H: 'H2-1', IR: 'IR5-1' }, 'BG2-1', { id: 'C5', level: 3, shiny: false }],
  ['RIB TICKLER', 22, { B: 'B12', SK: 'SK12', T: 'T5-1', H: 'H7-1', IR: 'IR3-1' }, 'BG2-2', null],
  ['GRIM WICH', 15, { B: 'B13', SK: 'SK13', T: 'T6-1', H: 'H9' }, 'BG10', { id: 'C4', level: 2, shiny: false }],
].map(([name, level, outfit, bg, pet], i) => ({
  playerId: `fan-fixture-${i}`, name, alias: null, lastSeen: Date.now() - (i % 2 ? 86400000 : 0),
  profile: { level, levelName: 'Bonehead', badges: i + 1, gearCount: 3 * i, outfit: { ...outfit, BG: bg }, pet },
}));

const { browser, page } = await boot(base);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

await page.evaluate(fx => {
  window.__testMe = { name: 'Probe', handle: 'fan', friendCode: 'BONE-0000' };
  window.__testFriends = { friends: fx, incoming: [], outgoing: [] };
  location.hash = '#/today';
}, FRIENDS);
await sleep(400);
await page.evaluate(() => { location.hash = '#/friends'; });
await sleep(2000);

// Seed a sealed gift and six "worth adding" newcomers so CREW-7 and CREW-8
// have real content to grade. An empty sample is a failure, not a pass.
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('giftbox', [{ key: 'g1', payload: { coins: 100, note: 'A Friend sent you a gift' } }]);
  window.__testLb = [1, 2, 3, 4, 5, 6].map(i => ({
    playerId: `new-${i}`, name: `NEWBIE ${i}`, level: 3, badges: 1, addToken: `tok${i}`,
    lastSeen: Date.now(), joinedAt: Date.now() - 5 * 86400000,
  }));
  location.hash = '#/today';
});
await sleep(300);
await page.evaluate(() => { location.hash = '#/friends'; });
await sleep(1500);

// ---- CREW-7: the sealed gift is on the first screen ----
const gift = await page.evaluate(() => {
  const el = document.querySelector('[data-gift]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
});
ok('GIFT SAMPLE a sealed gift renders on the DOM (an empty sample is a failure)', !!gift, JSON.stringify(gift));
ok('GIFT the sealed gift sits inside the first 390x844 screen, not 1301-1754px down',
  !!gift && gift.top >= 0 && gift.bottom <= 844, JSON.stringify(gift));

// ---- CREW-9: the fan's side card can be hit-tested ----
// Done BEFORE anything below scrolls the page: getBoundingClientRect and
// elementFromPoint are viewport-relative, and #newcomersCard's "see more"
// click (below) scrolls the fan itself out of view.
const hit = await page.evaluate(() => {
  const feat = document.querySelector('.cfan-card.feat');
  const side = [...document.querySelectorAll('.cfan-card')].find(c => c !== feat && !c.classList.contains('off'));
  if (!side) return null;
  const r = side.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const el = document.elementFromPoint(cx, cy);
  const hitCard = el ? el.closest('.cfan-card') : null;
  return { hitIsSide: hitCard === side, hitIsFeat: hitCard === feat };
});
ok('HIT a side card was found to grade (an empty sample is a failure)', !!hit, JSON.stringify(hit));
ok('HIT a tap aimed at the side card lands on the side card, not the featured card on top of it',
  !!hit && hit.hitIsSide && !hit.hitIsFeat, JSON.stringify(hit));

// ---- CREW-10: a cheer with an apostrophe reads with a real apostrophe ----
const hookPresent = await page.evaluate(() => typeof window.__presentGrantDelivery === 'function');
ok('TOAST the test seam for the real delivery-toast function is present', hookPresent);
if (hookPresent) {
  await page.evaluate(() => {
    window.__presentGrantDelivery({ applied: 1, appliedGrants: [
      { type: 'cheer', payload: { cheer: 3, from: 'BONE JOVI' } }, // CHEERS[3] = "You're crushing it!"
    ] });
  });
  // toast() runs a queue (js/app.js toastQ): a boot-time toast can already be
  // showing or queued ahead of the one this triggers, so poll rather than read
  // #toast once after a fixed delay.
  let toastTxt = null;
  /* 2026-09-05 gate 15: under the gate's load the boot queue (Kitchen starter
     ingredients, day close) held #toast past 6 s and this row read the Kitchen
     line. 24 s covers a full boot queue; the row still fails if the cheer never
     shows, because only a toast containing "crushing" is accepted below. */
  for (let i = 0; i < 120 && !(toastTxt || '').includes('crushing'); i++) {
    toastTxt = await page.evaluate(() => document.querySelector('#toast')?.textContent || null);
    if ((toastTxt || '').includes('crushing')) break;
    await sleep(200);
  }
  ok('TOAST the cheer toast fired (an empty sample is a failure)', !!toastTxt, JSON.stringify(toastTxt));
  ok('TOAST the apostrophe in "You\'re crushing it!" reads as a real apostrophe, not &#39;',
    !!toastTxt && toastTxt.includes("You're crushing it!") && !toastTxt.includes('&#39;'), JSON.stringify(toastTxt));
}

// ---- CREW-8: WORTH ADDING opens on one row, with a working "see more" ----
const worth = await page.evaluate(() => {
  const card = document.querySelector('#newcomersCard');
  if (!card || card.hidden) return null;
  const rowsBefore = card.querySelectorAll('.t3-row').length;
  const more = card.querySelector('#newcomersMore');
  const h = Math.round(card.getBoundingClientRect().height);
  return { rowsBefore, hasMore: !!more, h };
});
ok('WORTH the card rendered (an empty sample is a failure)', !!worth, JSON.stringify(worth));
ok('WORTH opens on exactly one row of strangers, not five', !!worth && worth.rowsBefore === 1, JSON.stringify(worth));
ok('WORTH a "See N more" control is offered', !!worth && worth.hasMore, JSON.stringify(worth));
ok('WORTH the collapsed card is well under the old 424px measured height',
  !!worth && worth.h < 300, JSON.stringify(worth));

if (worth && worth.hasMore) {
  await page.click('#newcomersMore');
  await sleep(150);
  const after = await page.evaluate(() => document.querySelectorAll('#newcomersCard .t3-row').length);
  ok('WORTH "See more" reveals the rest of the list in place', after > worth.rowsBefore, `rows after: ${after}`);
}

await browser.close();
if (srv) srv.kill();
console.log(fails ? '\nCREW LAYOUT AUDIT FAILED' : '\nCREW LAYOUT VERIFIED');
process.exit(fails);

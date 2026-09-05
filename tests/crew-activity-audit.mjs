/* CREW ACTIVITY SIGNAL acceptance audit (round 35 handoff, CREW-4/5/13/14).
 *
 * Four findings, one file, because all four are "the Crew tab has a fact and
 * says nothing about it": a friend's own play (CREW-4), the player's own rank
 * (CREW-5), a spire a friend holds (CREW-13), and a stranger's missing stats
 * (CREW-14, the negative case: the tab must say LESS, not something false).
 *
 * Seeds the webdriver-gated __testMe / __testFriends / __testRace fixtures
 * (same pattern as crew-fan-audit.mjs's __testFriends and the leaderboard's
 * __testLb) rather than a live Worker: every assertion here is about
 * RENDERING a payload the client already has, not about the network hop that
 * produces one (that half is covered server-side in server/test/api.test.mjs
 * and, for the pure rank/clock math, in tests/unit.test.js).
 *
 *   node tests/crew-activity-audit.mjs            (self-serves this checkout)
 *   URL=https://... node tests/crew-activity-audit.mjs
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

let srv = null;
let base = process.env.URL;
if (!base) {
  const srvHandle = await serveTree(ROOT);
  srv = { kill: () => srvHandle.close() };
  base = srvHandle.url;
}

const { browser, page } = await boot(base);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

/* -------------------------------------------------------------------------
   CREW-4 + CREW-13: the friend card's "since last time" line and the compact
   spire line. Three friends: one that levels up between the two renders, one
   control that never changes (must stay silent), one that gains a second
   spire (must say "Just took a spire" and must NOT also print the duplicate
   persistent "Holds N spires" line right under it).
   ------------------------------------------------------------------------- */
const friendFixture = (over) => ({
  playerId: over.id, name: over.name, alias: null, lastSeen: Date.now(),
  spires: over.spires ?? 0,
  profile: { level: over.level, levelName: 'Bonehead', badges: over.badges ?? 1,
    gearCount: over.gear ?? 2, outfit: { B: 'B0-1', SK: 'SK0-1' }, pet: null },
});

const V1 = [
  friendFixture({ id: 'act-leveler', name: 'LEVELER', level: 5 }),
  friendFixture({ id: 'act-control', name: 'STEADY', level: 8 }),
  friendFixture({ id: 'act-spirer', name: 'TOWER TAKER', level: 3, spires: 1 }),
];
const V2 = [
  friendFixture({ id: 'act-leveler', name: 'LEVELER', level: 6 }),   // leveled up
  friendFixture({ id: 'act-control', name: 'STEADY', level: 8 }),    // unchanged
  friendFixture({ id: 'act-spirer', name: 'TOWER TAKER', level: 3, spires: 2 }), // took a second spire
];

const seedCrew = async friends => {
  await page.evaluate(fx => {
    window.__testMe = { name: 'Activity Audit', handle: 'act', friendCode: 'BONE-0001' };
    window.__testFriends = { friends: fx, incoming: [], outgoing: [] };
    location.hash = '#/today'; // bounce so re-entering #/crew re-renders and re-diffs
  }, friends);
  await sleep(300);
  await page.evaluate(() => { location.hash = '#/friends'; });
  await sleep(1200);
};

// First visit: nothing has a "since" baseline yet, but a spire already held
// is a standing fact, not a diff, so it must show immediately.
await seedCrew(V1);
const first = await page.evaluate(() => {
  const card = id => document.querySelector(`.cfan-card[data-fan="${id}"]`);
  const text = (id, cls) => card(id)?.querySelector(cls)?.textContent || null;
  return {
    levelerSince: text('act-leveler', '.cfan-since'),
    spirerSpireTag: text('act-spirer', '.cfan-spires'),
    controlSince: text('act-control', '.cfan-since'),
  };
});
ok('CREW-4 a friend seen for the FIRST time gets no since-label (nothing to compare against yet)',
  first.levelerSince === null, JSON.stringify(first));
ok('CREW-13 a spire already held is a standing fact and shows on the very first render',
  first.spirerSpireTag && /1 spire/.test(first.spirerSpireTag), JSON.stringify(first));

// Second visit with the same friends, one changed: the diff must fire for
// exactly the one that changed, and stay silent for the control.
await seedCrew(V2);
const second = await page.evaluate(() => {
  const card = id => document.querySelector(`.cfan-card[data-fan="${id}"]`);
  const text = (id, cls) => card(id)?.querySelector(cls)?.textContent || null;
  return {
    levelerSince: text('act-leveler', '.cfan-since'),
    controlSince: text('act-control', '.cfan-since'),
    controlSpireTag: text('act-control', '.cfan-spires'),
    spirerSince: text('act-spirer', '.cfan-since'),
    spirerSpireTag: text('act-spirer', '.cfan-spires'),
  };
});
ok('CREW-4 FAIL if silent: a friend who leveled up says so on their card',
  second.levelerSince && /Leveled up to 6/.test(second.levelerSince), JSON.stringify(second));
ok('CREW-4 a friend who did not change stays silent (no false "since" signal)',
  second.controlSince === null, JSON.stringify(second));
ok('CREW-13 a friend with no spire never shows the spire tag',
  second.controlSpireTag === null, JSON.stringify(second));
ok('CREW-13 FAIL if going from 1 to 2 spires prints no since-label at all',
  second.spirerSince && /2 spires/.test(second.spirerSince), `spirerSince=${second.spirerSince}`);
ok('CREW-13 the persistent spire tag does not duplicate a since-label that already said it',
  second.spirerSpireTag === null, `a card should not say "holds 2 spires now" twice on one plate, got tag=${second.spirerSpireTag}`);

/* -------------------------------------------------------------------------
   CREW-14: a stranger whose profile carries `stats: {}` (never synced) must
   read as "no stats yet", never as five zero-width bars, and must not offer
   a Battle button that would hand the Pit a foe with no real numbers
   ("Jab ~NaN dmg" in the round 35 handoff). A real snapshot is the CONTROL:
   the same code path must still work normally.
   ------------------------------------------------------------------------- */
const openProfile = f => page.evaluate(fx => window.__openFriendProfile(fx, { stranger: true }), f);

await openProfile({ name: 'Empty Stats', playerId: 'stranger-empty',
  profile: { outfit: { B: 'B0-1', SK: 'SK0-1' }, level: 5, levelName: 'Bonehead', badges: 0, stats: {} } });
await sleep(300);
const emptyStats = await page.evaluate(() => ({
  battleBtn: !!document.querySelector('#fpBattle'),
  bars: document.querySelectorAll('.fps-row').length,
  noteShown: !![...document.querySelectorAll('.sheet-body .note')].find(n => /will show once they next open the app/.test(n.textContent)),
}));
ok('CREW-14 FAIL if a Battle button offers a fight with no real stats',
  emptyStats.battleBtn === false, JSON.stringify(emptyStats));
ok('CREW-14 FAIL if `stats: {}` draws five zero-width bars instead of the honest note',
  emptyStats.bars === 0 && emptyStats.noteShown, JSON.stringify(emptyStats));
await page.evaluate(() => document.querySelector('.sheet-close')?.click());
await sleep(300);

// Control: a real snapshot must still show all five bars and the Battle button.
await openProfile({ name: 'Real Stats', playerId: 'stranger-real',
  profile: { outfit: { B: 'B0-1', SK: 'SK0-1' }, level: 5, levelName: 'Bonehead', badges: 2,
    stats: { power: 20, marrow: 20, wind: 20, reflex: 20, hype: 20 } } });
await sleep(300);
const realStats = await page.evaluate(() => ({
  battleBtn: !!document.querySelector('#fpBattle'),
  bars: document.querySelectorAll('.fps-row').length,
}));
ok('CREW-14 CONTROL: a real stats object still shows the Battle button and all 5 bars',
  realStats.battleBtn === true && realStats.bars === 5, JSON.stringify(realStats));
await page.evaluate(() => document.querySelector('.sheet-close')?.click());
await sleep(300);

// CREW-13 (profile sheet half): a friend/stranger row carrying a spire count
// shows the compact line and the one-line "how to take one".
await openProfile({ name: 'Spire Holder', playerId: 'stranger-spire', spires: 3,
  profile: { outfit: { B: 'B0-1', SK: 'SK0-1' }, level: 5, levelName: 'Bonehead', badges: 0,
    stats: { power: 20, marrow: 20, wind: 20, reflex: 20, hype: 20 } } });
await sleep(300);
const profileSpire = await page.evaluate(() => {
  const p = [...document.querySelectorAll('.sheet-body .note')].find(n => /spire/i.test(n.textContent));
  return p ? p.textContent : null;
});
ok('CREW-13 FAIL if the friend profile has no spire line at all',
  profileSpire && /3 spires/.test(profileSpire) && /beat their defender/i.test(profileSpire), `got: ${profileSpire}`);
await page.evaluate(() => document.querySelector('.sheet-close')?.click());
await sleep(300);

/* -------------------------------------------------------------------------
   CREW-6 (News copy half): the purse pays five, and News must say so. The
   week-close toast and the settlement grant are server-tested (api.test.mjs,
   "a non-podium finisher still gets told where they placed"); the countdown
   copy's own logic is unit-tested (raceClockLabel). This is the one part
   that is neither: static text in a rendered sheet.
   ------------------------------------------------------------------------- */
await page.evaluate(() => { location.hash = '#/friends'; });
await sleep(600);
const whatsNewBtn = await page.$('#crewWhatsNew');
if (whatsNewBtn) await whatsNewBtn.click();
await sleep(500);
await page.evaluate(() => document.querySelector('[data-wntab="news"]')?.click());
await sleep(300);
const raceBlurb = await page.evaluate(() => document.querySelector('[data-news="race"] small')?.textContent || null);
ok('CREW-6 FAIL if News still says the purse pays three (it pays five)',
  raceBlurb && /top five/i.test(raceBlurb) && !/top three/i.test(raceBlurb), `got: ${raceBlurb}`);
await page.evaluate(() => document.querySelector('.sheet-close')?.click());
await sleep(300);

/* -------------------------------------------------------------------------
   CREW-5: the badge counts the player's OWN new milestones the Crew shows,
   not only what other people did. __testRace stands in for a live account
   (fetchStepRace has no other fixture hook); raceRankImproved is exercised
   directly (see js/app.js) so this does not also depend on the network-only
   half of refreshCrewBadge (social.listFriends()).
   ------------------------------------------------------------------------- */
// `seeded` is always written (even `null`, meaning "never checked before"),
// so each call is a clean, explicit precondition rather than inheriting
// whatever the previous call's own write left behind.
const rankCheck = async (race, seededRank) => page.evaluate(async (r, seeded, wk) => {
  window.__testRace = r;
  const { db } = await import('./js/db.js');
  await db.put('kv', { k: `raceRankSeen:${wk}`, v: seeded });
  return window.__raceRankImproved();
}, race, seededRank, await page.evaluate(() => window.__raceWeek()));
// Checks again with NO reseed, so this exercises the natural double-check
// path (kv left exactly as raceRankImproved's own last write set it).
const rankCheckAgain = async race => page.evaluate(r => {
  window.__testRace = r;
  return window.__raceRankImproved();
}, race);

const wk = await page.evaluate(() => window.__raceWeek());
ok('CREW-5 FAIL if moving from 8th to 3rd never counts as an own milestone',
  await rankCheck({ yourRank: 3, players: [] }, 8) === true);
ok('CREW-5 standing still (same rank) is not news',
  await rankCheck({ yourRank: 3, players: [] }, 3) === false);
ok('CREW-5 falling back is not news either (never a shaming signal)',
  await rankCheck({ yourRank: 5, players: [] }, 3) === false);
ok('CREW-5 the FIRST time a rank is ever seen this week is a baseline, not an improvement',
  await rankCheck({ yourRank: 4, players: [] }, null) === false);
// re-running with the SAME rank right after (no reseed: kv now holds 4 from
// the check above) must not re-fire.
ok('CREW-5 checking twice at the same rank does not fire twice',
  await rankCheckAgain({ yourRank: 4, players: [] }) === false, `wk=${wk}`);

await browser.close();
if (srv) srv.kill();
console.log(fails ? '\nCREW ACTIVITY AUDIT FAILED' : '\nCREW ACTIVITY VERIFIED');
process.exit(fails);

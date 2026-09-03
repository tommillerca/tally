/* OPENING A RACER'S PROFILE FROM THE STEP-RACE BOARD.
 *
 * Tom: "we should make it so when you are on the step challenge leader board you
 * can click the players you see and then go to their player page and add them if
 * you want."
 *
 * The lanes were inert markup. They now open the SAME stranger profile the
 * all-players leaderboard opens (openFriendProfile, `stranger` mode), off the
 * SAME /steps/week payload, which the server now fills out with the fields that
 * sheet renders plus an addToken.
 *
 * WHAT THIS GUARDS, AND WHY EACH CHECK IS PIXEL/DOM-LEVEL RATHER THAN A GREP:
 *
 *   1. NATIVE CONTROL. The board is a grid of divs and it would have been one
 *      line to hang a listener on one. This asserts tagName === 'BUTTON' on the
 *      real rendered lane, so a keyboard or screen-reader user gets a control
 *      and not a decorated <div>. A source grep for "<button" would pass over a
 *      lane whose tag was chosen by a branch that never fires.
 *   2. THE RIGHT PLAYER. "A sheet opened" is the check that would have shipped
 *      the bug worth catching: matching a lane to a payload row by NAME (names
 *      are not unique) or by row INDEX (the client splices your own row in and
 *      re-ranks, so lane 2 is not payload row 2). The three racers below carry
 *      DELIBERATELY DIFFERENT levels and badge counts, and the check reads them
 *      back out of the opened sheet: opening the neighbouring racer fails.
 *   3. NOT YOUR OWN LANE. The sheet is stranger-shaped and its only action is
 *      "add to my Crew". Your own lane must not be a button at all.
 *   4. AN EXISTING FRIEND IS NOT RE-OFFERED. The crew list is seeded with one of
 *      the racers, and their lane must open with "Already in your Crew" and no
 *      Add button. This is also the check that catches the ordering trap the
 *      handler was written around: hydrateRace runs BEFORE paint() fills `data`,
 *      so a friend set captured at render time is empty and every friend is
 *      called a stranger.
 *   5. OPENING SENDS NOTHING. Every request the page makes is recorded; opening
 *      a profile must not produce a POST to /friends/add. Adding is a second,
 *      deliberate tap inside the sheet.
 *   6. TOUCH TARGET. The lane's own rendered box must be >= 44 CSS px tall.
 *
 * PROVE-RED (each check has a distinct mutation; none has been run, see below):
 *   1. change `const tag = open ? 'button' : 'div'` to always 'div'      -> NATIVE fails
 *   2. in the click handler, find the row by `x.name === lane.textContent`
 *      or by lane index instead of by data-raceview                     -> IDENTITY fails
 *   3. drop the `&& !p.you` from `const open`                           -> OWN LANE fails
 *   4. hoist the isCrew/sent lookup out of the click handler into
 *      hydrateRace's body (the pre-paint() capture)                     -> CREW fails
 *   5. call social.friendAdd(p.addToken) in the click handler           -> FREE fails
 *   6. delete the `min-height: 44px` from `.race-lane.tap` in app.css   -> TARGET fails
 *
 * NOT RUN. This audit calls boot(), which launches puppeteer, and the session
 * that wrote it was under a machine rule forbidding browser audits (other lanes
 * were running). It has never been executed, green OR red. Before trusting it,
 * run `node tests/race-profile.mjs` on clean code, confirm 6/6, then apply each
 * mutation above one at a time and confirm the named check goes red.
 *
 * Usage: node tests/race-profile.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srvHandle = null;
let base = process.env.URL;
if (!base) {
  srvHandle = await serveTree(ROOT);
  base = srvHandle.url;
}

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

/* Three racers, each with a level and a badge count nobody else has, so the
   sheet's own text identifies WHICH lane was opened. CREW_ID is already a friend
   below; STRANGER_ID is not. Steps are far apart so the client never re-ranks
   them, and your own lane is in the payload so it can be graded too. */
const CREW_ID = 'race-crewmate', STRANGER_ID = 'race-stranger';
const RACERS = [
  { rank: 1, playerId: CREW_ID, name: 'Marrow Max', steps: 41000, level: 31, levelName: 'Bone Sultan', badges: 9 },
  { rank: 2, playerId: STRANGER_ID, name: 'Vile Nightmare', steps: 22000, level: 17, levelName: 'Rib Roaster', badges: 4 },
  { rank: 3, playerId: 'race-me', name: 'Audit Bones', steps: 8000, level: 12, levelName: 'Shin Splinter', badges: 2 },
];
const wire = RACERS.map(r => ({
  rank: r.rank, playerId: r.playerId, name: r.name, steps: r.steps,
  outfit: { B: 'B0-1', SK: 'SK0-1' },
  level: r.level, levelName: r.levelName, badges: r.badges,
  pet: null, stats: { str: 40, end: 50, spd: 30 }, gearCount: 6,
  addToken: r.playerId === 'race-me' ? null : `tok-${r.playerId}`,
  you: r.playerId === 'race-me',
}));

const { browser, page } = await boot(base);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

/* Every request is recorded, so check 5 can assert on the ABSENCE of an add.
   An absence needs a denominator: `posts` is printed with the result, and a run
   where the board never fetched at all would show an empty log and fail check 1
   first. */
const seenRequests = [];
await page.setRequestInterception(true);
page.on('request', req => {
  seenRequests.push(`${req.method()} ${req.url()}`);
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors, body: '' });
  if (/\/steps\/week/.test(req.url())) {
    return req.respond({
      status: 200, contentType: 'application/json', headers: cors,
      body: JSON.stringify({
        week: null, players: wire, yourRank: 3, racers: wire.length,
        podium: [{ place: '1st', coins: 5000, crate: 'golden', dust: 200 }], champion: null,
      }),
    });
  }
  // nothing else may reach production, and an add must be visible if it happens
  if (/bonez-api|workers\.dev/.test(req.url())) return req.respond({ status: 500, headers: cors, body: '{}' });
  return req.continue();
});

await seed(page, { level: 12 });
await page.evaluate(async (crewId, crewName) => {
  const { kvSet } = await import('./js/db.js');
  await kvSet('social', { playerId: 'race-me', handle: 'Audit Bones', friendCode: 'BONE-TEST-TEST', name: 'Audit Bones', onlineAt: Date.now() });
  window.__testMe = { name: 'Audit Bones', handle: 'race-me', friendCode: 'BONE-TEST-TEST' };
  // one racer is already Crew: the state that must never be offered "add" again
  window.__testFriends = {
    friends: [{ playerId: crewId, name: crewName, alias: null, lastSeen: Date.now(),
      profile: { level: 31, levelName: 'Bone Sultan', badges: 9, gearCount: 6, outfit: { B: 'B0-1', SK: 'SK0-1' }, pet: null } }],
    incoming: [], outgoing: [],
  };
}, CREW_ID, RACERS[0].name);

await page.evaluate(() => { location.hash = '#/friends'; });
await sleep(3500);

/* The lanes as RENDERED. Read the tag off the live element, not off the source. */
const lanes = await page.evaluate(() => [...document.querySelectorAll('#raceCard .race-lane')].map(l => {
  const r = l.getBoundingClientRect();
  return {
    tag: l.tagName, type: l.getAttribute('type') || null,
    id: l.dataset.raceview || null,
    name: l.querySelector('.nm b')?.textContent.trim() || '',
    you: l.classList.contains('you'),
    h: Math.round(r.height), w: Math.round(r.width),
  };
}));

ok('BOARD the race board rendered its lanes at all (an empty board grades nothing)',
  lanes.length === 3, JSON.stringify({ lanes: lanes.length, requests: seenRequests.length }));

const strangerLane = lanes.find(l => l.id === STRANGER_ID);
const crewLane = lanes.find(l => l.id === CREW_ID);
const ownLane = lanes.find(l => l.you);

ok('NATIVE a tappable lane is a real <button>, not a div with a handler',
  !!strangerLane && strangerLane.tag === 'BUTTON' && strangerLane.type === 'button',
  JSON.stringify(strangerLane || null));

ok('OWN LANE your own row is not a button into a stranger profile of yourself',
  !!ownLane && ownLane.tag !== 'BUTTON' && !ownLane.id, JSON.stringify(ownLane || null));

ok('TARGET a tappable lane clears the 44px touch floor',
  !!strangerLane && strangerLane.h >= 44 && strangerLane.w >= 44,
  JSON.stringify({ h: strangerLane?.h, w: strangerLane?.w }));

/* Tap the lane the way a finger does (the real control, not the handler), then
   read the sheet back. The level and badge count are what say WHICH racer. */
const openLane = async id => {
  await page.evaluate(() => document.querySelectorAll('.sheet-fp').forEach(s => s.remove()));
  await page.evaluate(sel => document.querySelector(`#raceCard [data-raceview="${sel}"]`)?.click(), id);
  await sleep(800);
  return page.evaluate(() => {
    const w = document.querySelector('.sheet-fp');
    return {
      open: !!w,
      title: w?.querySelector('#fpTitle')?.textContent.trim() || null,
      level: w?.querySelector('.fp-lvlbadge')?.textContent.trim() || null,
      cls: w?.querySelector('.fp-class')?.textContent.trim() || null,
      badges: w?.querySelector('.fp-fact b')?.textContent.trim() || null,
      add: !!w?.querySelector('#fpAdd'),
      gift: !!w?.querySelector('#fpGift'),
      body: (w?.innerText || '').replace(/\s+/g, ' '),
    };
  });
};

const s = await openLane(STRANGER_ID);
const want = RACERS[1];
ok('IDENTITY tapping a lane opens THAT racer, not a neighbour',
  s.open && s.title === want.name && s.level === `Lv ${want.level}`
    && new RegExp(want.levelName).test(s.cls || '') && s.badges === String(want.badges),
  JSON.stringify({ got: { title: s.title, level: s.level, cls: s.cls, badges: s.badges },
    want: { title: want.name, level: `Lv ${want.level}`, cls: want.levelName, badges: want.badges } }));

ok('STRANGER the one action offered is Add, and no friends-only action is',
  s.add && !s.gift, JSON.stringify({ add: s.add, gift: s.gift }));

const c = await openLane(CREW_ID);
ok('CREW a racer already in your Crew is not offered "add" again',
  c.open && !c.add && /Already in your Crew/.test(c.body),
  JSON.stringify({ title: c.title, add: c.add }));

const adds = seenRequests.filter(r => /POST .*friends\/(add|request)/.test(r));
ok('FREE opening a profile sends no friend request',
  adds.length === 0, `adds: ${adds.length} of ${seenRequests.length} requests`);

await browser.close();
if (srvHandle) srvHandle.close();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);

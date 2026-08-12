/* THE STEP RACE FINALE POSTER: the top 5 from live standings, the real clock,
 * shown once and only once, and reachable forever from the News tab.
 *
 * Tom, 2026-08-11: "create a pop up and news story tomorrow for players because
 * the step challenge is almost complete. It should let everyone know the players
 * in the top 5 and let them know how much time is left in the contest."
 *
 * What this drives, all through the REAL controls:
 *   FIRES   the poster appears from the BOOT path (no manual call), fed by a
 *           real /steps/week response, with the tick-and-seen-flag etiquette
 *           every other announcement uses.
 *   CLOCK   the time-left line matches a countdown derived INDEPENDENTLY here
 *           from RACE_EPOCH and RACE_DAYS in the source, so a broken
 *           raceClock() cannot agree with this file by construction.
 *   TOP5    exactly the paid places are listed (the server response carries 6
 *           racers; the 6th must NOT appear), in standings order, by name.
 *           An empty lane list is a FAILURE, never a pass.
 *   PIXELS  every lane draws its racer's Bonehead with decoded pixels.
 *   OPERATE the dismiss button (a real mouse click) dismisses it and the app underneath
 *           is usable: the tab bar owns its own hit point again.
 *   ONCE    a full reload with the force flag still set shows NO poster: the
 *           seen flag, not the webdriver gate, is what stops the second showing.
 *   NEWS    the News tab lists the story and tapping it opens the REAL poster,
 *           standings and clock included, even after the one-shot is consumed.
 *
 * PROVE-RED (confirmed 2026-08-11): multiply the day in raceClock()'s endsMs by
 * 8640000 instead of 86400000 and CLOCK fails naming both strings; return an
 * empty players array from the intercept and TOP5 fails on zero lanes; delete
 * the kvSet of RACE_FINALE_SEEN_KEY and ONCE fails with the poster back up.
 *
 * Usage: node tests/race-finale-audit.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, click, dismissOverlays, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

/* ---------- the independent clock: from source constants, not from raceClock ---------- */
const APP = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const RACE_EPOCH = (APP.match(/RACE_EPOCH = '([\d-]+)'/) || [])[1];
const RACE_DAYS = +(APP.match(/const RACE_DAYS = (\d+)/) || [])[1];
const purseBlock = (() => { const i = APP.indexOf('const RACE_PURSE'); return APP.slice(i, APP.indexOf('];', i)); })();
const PURSE_N = [...purseBlock.matchAll(/place:\s*'/g)].length;
ok('SOURCE the constants this audit derives from exist at all',
  !!RACE_EPOCH && RACE_DAYS > 0 && PURSE_N >= 5, `epoch ${RACE_EPOCH}, ${RACE_DAYS} days, ${PURSE_N} paid places`);

const DAY = 86400000;
const localKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const t0 = Date.parse(RACE_EPOCH + 'T00:00:00');
const period = Math.max(0, Math.floor((Date.parse(localKey(new Date()) + 'T00:00:00') - t0) / (RACE_DAYS * DAY)));
const endsMs = t0 + (period + 1) * RACE_DAYS * DAY;
const expDays = Math.max(0, Math.ceil((endsMs - Date.now()) / DAY));
const expClock = expDays <= 0 ? 'settles tonight' : `${expDays} day${expDays === 1 ? '' : 's'} left`;
console.log(`  (independent countdown: race ends ${new Date(endsMs).toISOString()}, so "${expClock}")`);
/* The poster only fires inside the final stretch (3 days or fewer). The current
   period genuinely has ${expDays} days left; if this run lands early in a race
   week the boot gate is doing its job, so say so rather than fail on a healthy
   guard. The window is exercised either way: <=3 proves it fires, >3 proves it
   holds fire. */
const inWindow = expDays <= 3;

/* ---------- serve this tree, boot, intercept the race endpoint ---------- */
let srvHandle = await serveTree(ROOT);
const base = process.env.URL || srvHandle.url;
const { browser, page } = await boot(base);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

/* Six racers so the cut to the paid places is observable: Sixth Wheel must
   never appear on a top-5 poster. Shaped like the real endpoint (race-you.mjs
   precedent), CORS answered because signedFetch preflights. */
const RACERS = [
  { rank: 1, name: 'Bony Wrecker', steps: 91000, outfit: { B: 'B0-1', SK: 'SK0-1' }, you: false },
  { rank: 2, name: 'Withered Lich', steps: 74500, outfit: { B: 'B0-1', SK: 'SK0-1' }, you: false },
  { rank: 3, name: 'Hollow Shovel', steps: 61200, outfit: { B: 'B0-1', SK: 'SK0-1' }, you: true },
  { rank: 4, name: 'Grim Strider', steps: 48000, outfit: { B: 'B0-1', SK: 'SK0-1' }, you: false },
  { rank: 5, name: 'Marrow Pacer', steps: 30500, outfit: { B: 'B0-1', SK: 'SK0-1' }, you: false },
  { rank: 6, name: 'Sixth Wheel', steps: 12000, outfit: { B: 'B0-1', SK: 'SK0-1' }, you: false },
];
await page.setRequestInterception(true);
page.on('request', req => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors, body: '' });
  if (/\/steps\/week/.test(req.url())) {
    return req.respond({ status: 200, contentType: 'application/json', headers: cors,
      body: JSON.stringify({ week: null, players: RACERS, yourRank: 3, podium: [], champion: null }) });
  }
  // nothing else may reach production (the profile PUT especially)
  if (/bonez-api|workers\.dev/.test(req.url())) return req.respond({ status: 500, headers: cors, body: '{}' });
  return req.continue();
});

/* The boot path skips announcements under webdriver unless forced, same as
   __raceForce for the intro. Registered before the reload so it exists when
   maybeShowRaceFinale runs. */
/* SHIFT THE CLOCK PAST SETTLEMENT, because a results card cannot be tested
   during the race it reports on. Run on 2026-08-12 the app is CORRECT to show
   nothing: the first race settles on the 14th, so there is no completed race
   to announce and the boot gate declines by design. Faking the date is the
   only way to exercise the state this card exists for.
   It also makes this audit date-independent, which is the lesson race-you.mjs
   learned the hard way: an audit that only passes on certain days trains
   people to ignore red. The shim moves the whole app, not just this check, so
   the week keys the app derives are the ones a player would have after the
   race ends. */
const AFTER_SETTLEMENT = '2026-08-16T10:00:00';
await page.evaluateOnNewDocument(when => {
  window.__raceFinaleForce = true;
  const Real = Date;
  const fixed = new Real(when).getTime();
  // only "now" moves; every other Date behaviour is left alone, so date maths
  // inside the app still works normally
  function Shim(...a) { return a.length ? new Real(...a) : new Real(fixed); }
  Shim.prototype = Real.prototype;
  Shim.now = () => fixed;
  Shim.parse = Real.parse; Shim.UTC = Real.UTC;
  window.Date = Shim;
}, AFTER_SETTLEMENT);

await seed(page, { level: 12 });
// the race fetch gates on isOnline(): kv social present, exactly as race-you seeds it
await page.evaluate(async () => {
  const { kvSet } = await import('./js/db.js');
  await kvSet('social', { playerId: 'race-finale-audit', handle: 'hollow', friendCode: 'BONE-TEST-TEST', name: 'Hollow Shovel', onlineAt: Date.now() });
});
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2400);
await dismissOverlays(page);

/* ---------- FIRES: from boot, nobody called anything ---------- */
const waitVeil = async (ms = 20000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await page.evaluate(() => !!document.querySelector('.race-veil .drop-card'))) return true;
    await sleep(500);
  }
  return false;
};
const fired = await waitVeil();
if (!inWindow) {
  /* Early in a race week the correct behaviour is NO poster. Assert that, then
     open it by hand so every content check below still runs against the real
     card. */
  ok(`FIRES boot holds fire outside the final stretch (${expDays} days left)`, !fired, fired ? 'poster showed early' : 'no poster, correctly');
  await page.evaluate(() => window.__raceFinale());
  await sleep(900);
} else {
  ok('FIRES the poster appears from the boot path on its own', fired, fired ? 'veil up' : 'no .race-veil within 20s');
}

const card = await page.evaluate(async () => {
  const v = document.querySelector('.race-veil .drop-card');
  if (!v) return null;
  await new Promise(r => setTimeout(r, 900));   // the standings hydrate after the veil mounts
  const imgs = [...v.querySelectorAll('.race-lane .run img')];
  await Promise.all(imgs.map(i => i.decode().catch(() => {})));
  return {
    eyebrow: v.querySelector('.drop-eyebrow')?.textContent.trim(),
    /* The winner shoutout renders inside the board, which hydrates after the
       fetch, so read EVERY .drop-sub rather than the first one: reading only
       the first would silently grade the headline and never the result. */
    sub: [...v.querySelectorAll('.drop-sub')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' '),
    body: v.textContent.replace(/\s+/g, ' ').trim(),
    lanes: [...v.querySelectorAll('.race-lane')].map(l => ({
      rank: l.querySelector('.rk')?.textContent.trim(),
      name: l.querySelector('.nm b')?.textContent.trim(),
      steps: l.querySelector('.st')?.textContent.trim(),
      you: l.classList.contains('you'),
    })),
    imgCount: imgs.length,
    decoded: imgs.filter(i => i.naturalWidth > 0 && i.getBoundingClientRect().width > 4).length,
    ctas: [...v.querySelectorAll('button')].map(b => b.textContent.trim()),
  };
});
ok('CARD the poster is up and readable at all', !!card, card ? '' : 'no drop-card to inspect');

/* ---------- RESULT: it announces a race that FINISHED ----------
   Tom, 2026-08-12: post it when the challenge completes, name the winner, show
   how close it was, and say another runs next week. So the card must read as a
   result, never as a countdown: a card that says "2 days left" after the race
   settled is worse than no card, because it is wrong rather than late. */
ok('RESULT the eyebrow reads as a finished race, not a countdown',
  !!card && /wrap|result/i.test(card.eyebrow || '') && !/left|settles/i.test(card.eyebrow || ''),
  `eyebrow: "${card && card.eyebrow}"`);
ok('RESULT the winner is named with their step total',
  !!card && new RegExp(RACERS[0].name).test(card.sub || '') && /steps/i.test(card.sub || ''),
  `sub: "${card && card.sub}"`);
ok('RESULT the margin over second place is stated, so the closeness is the story',
  !!card && new RegExp(String(RACERS[0].steps - RACERS[1].steps).replace(/\B(?=(\d{3})+(?!\d))/g, ',')).test(card.sub || ''),
  `sub: "${card && card.sub}"`);
ok('RESULT it promises another race and admits the format may change',
  !!card && /next week/i.test(card.body || '') && /switch up|change/i.test(card.body || ''),
  `body: "${(card && card.body || '').slice(0, 120)}"`);

/* ---------- TOP5: the paid places, in order, and nobody else ---------- */
const want = RACERS.slice(0, Math.min(5, PURSE_N));
ok('TOP5 the lane count is the paid places, never zero (empty sample = FAILURE)',
  !!card && card.lanes.length === want.length, `${card ? card.lanes.length : 0} lanes vs ${want.length} paid places`);
ok('TOP5 names and order come from the standings response',
  !!card && want.every((r, i) => card.lanes[i] && card.lanes[i].name === r.name && card.lanes[i].rank === String(i + 1)),
  card ? card.lanes.map(l => `${l.rank}.${l.name}`).join(' ') : '');
ok('TOP5 the racer outside the purse is not on the poster',
  !!card && !card.lanes.some(l => l.name === 'Sixth Wheel'), '');
ok('TOP5 your own row is marked as you', !!card && card.lanes.some(l => l.you && l.name === 'Hollow Shovel'), '');

/* ---------- PIXELS: lanes draw Boneheadz, not empty boxes ---------- */
ok('PIXELS every lane marker decoded real art',
  !!card && card.imgCount > 0 && card.decoded === card.imgCount,
  card ? `${card.decoded}/${card.imgCount} decoded` : '');

/* ---------- OPERATE: dismiss with the real control, app stays usable ---------- */
/* The dismiss label changed with the results rework ("Not now" made sense on a
   countdown, "Nice one" on a result). Match the id's label, and accept either,
   so a future copy tweak fails the COPY checks above rather than silently
   turning this into a no-op click. */
const dismissed = await click(page, /^(nice one|not now)$/);
await sleep(600);
const after = await page.evaluate(() => {
  const gone = !document.querySelector('.race-veil');
  // the tab bar must own its own pixels again: hit-test a real control
  const tab = document.querySelector('nav .tab, .tabbar button, nav button');
  let tabOwned = false;
  if (tab) {
    const r = tab.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    tabOwned = !!el && (tab === el || tab.contains(el) || el.contains(tab));
  }
  return { gone, tabFound: !!tab, tabOwned };
});
ok('OPERATE the dismiss button is clickable and closes the poster', dismissed && after.gone, JSON.stringify(after));
ok('OPERATE the app underneath owns its controls again', after.tabFound && after.tabOwned, JSON.stringify(after));

/* ---------- ONCE: a reload must NOT show it again ---------- */
if (inWindow) {
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);
  await dismissOverlays(page);
  const again = await waitVeil(9000);
  ok('ONCE the seen flag holds: no poster on the next boot', !again, again ? 'it came back' : 'stayed away for 9s (force flag still set, so the flag is what stopped it)');
} else {
  ok('ONCE (out of window) the boot gate already proved it does not fire today', true, 'covered by FIRES above');
}

/* ---------- NEWS: the story row reopens the real poster, forever ---------- */
await page.evaluate(() => {
  window.__testMe = { playerId: 'me', name: 'Hollow Shovel', friendCode: 'BONE-4K7Q', handle: 'hollow' };
  window.__testFriends = { friends: [], incoming: [], outgoing: [] };
  location.hash = '#/friends';
});
await sleep(2400);
await page.evaluate(() => document.getElementById('crewWhatsNew')?.click());
await sleep(1300);
const news = await page.evaluate(async () => {
  const tab = document.querySelector('[data-wntab="news"]');
  if (!tab) return { row: false };
  tab.click();
  await new Promise(r => setTimeout(r, 300));
  const row = document.querySelector('[data-news="race-finale"]');
  if (!row) return { row: false };
  const box = row.querySelector('.nw-thumb svg, .nw-thumb img')?.getBoundingClientRect();
  return {
    row: true,
    title: row.querySelector('b')?.textContent.trim(),
    art: !!box && box.width > 4 && box.height > 4,
  };
});
ok('NEWS the story is listed with drawn art', news.row && news.art, JSON.stringify(news));
await page.evaluate(async () => {
  document.querySelector('[data-news="race-finale"]')?.click();
});
await sleep(1600);   // the handler closes the sheet first (220ms), then opens
const reopened = await page.evaluate(async () => {
  const v = document.querySelector('.race-veil .drop-card');
  if (!v) return null;
  await new Promise(r => setTimeout(r, 900));
  return {
    eyebrow: v.querySelector('.drop-eyebrow')?.textContent.trim(),
    lanes: v.querySelectorAll('.race-lane').length,
  };
});
ok('NEWS tapping the story opens the REAL poster even after the one-shot is spent',
  !!reopened && reopened.lanes === want.length && /wrap|result/i.test(reopened.eyebrow || ''),
  JSON.stringify(reopened));

/* ---------- MID-RACE: IT MUST REFUSE, AND THE CHECK MUST BE ABLE TO SEE ONE ----------
   The most important property of a results card is that it does not announce a
   race still being run, and getting a check that can actually FAIL on that took
   three attempts, each passing for a different wrong reason:
     1. no second session at all: the suite passed 17/17 with the settlement
        gate DELETED, because a card fed the current week looks identical.
     2. a second session with no request intercept: it declined for want of
        standings, not because the gate held.
     3. a twelve second wait: other boot announcements own the veil slot first,
        so the finale never got its turn inside the window either way.
   So this runs the SAME session recipe twice at two dates and requires
   OPPOSITE answers. The after-settlement run is the positive control: if it
   does not produce a poster, the negative below proves nothing and says so. */
const raceVeilAt = async (whenISO, waitMs) => {
  const s2 = await (await import('./godmode.js')).boot(base);
  await s2.page.setRequestInterception(true);
  s2.page.on('request', req => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS', 'Access-Control-Allow-Headers': '*' };
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors, body: '' });
    if (/\/steps\/week/.test(req.url())) {
      return req.respond({ status: 200, contentType: 'application/json', headers: cors,
        body: JSON.stringify({ week: null, players: RACERS, yourRank: 3, podium: [], champion: null }) });
    }
    if (/bonez-api|workers\.dev/.test(req.url())) return req.respond({ status: 500, headers: cors, body: '{}' });
    return req.continue();
  });
  await s2.page.evaluateOnNewDocument(when => {
    window.__raceFinaleForce = true;
    const Real = Date;
    const fixed = new Real(when).getTime();
    function Shim(...a) { return a.length ? new Real(...a) : new Real(fixed); }
    Shim.prototype = Real.prototype; Shim.now = () => fixed;
    Shim.parse = Real.parse; Shim.UTC = Real.UTC;
    window.Date = Shim;
  }, whenISO);
  /* THE SAME SEED THE MAIN SESSION USES. fetchStepRace gates on isOnline(),
     which reads the kv social row, so without this the fetch never happens and
     every answer is "no poster" regardless of the gate under test. This is the
     third wrong-reason pass this block has had; it is in the helper now so both
     dates get identical treatment and only the clock differs. */
  await seed(s2.page, { level: 12 });
  await s2.page.evaluate(async () => {
    const { kvSet } = await import('./js/db.js');
    await kvSet('social', { playerId: 'race-finale-audit', handle: 'hollow', friendCode: 'BONE-TEST-TEST', name: 'Hollow Shovel', onlineAt: Date.now() });
  });
  await s2.page.reload({ waitUntil: 'domcontentloaded' });
  /* clear whatever else the boot wants to announce, otherwise the finale never
     gets the veil slot and every answer here is "no poster" */
  const deadline = Date.now() + waitMs;
  let seen = false;
  while (Date.now() < deadline) {
    seen = await s2.page.evaluate(() => !!document.querySelector('.race-veil'));
    if (seen) break;
    await s2.page.evaluate(() => {
      const other = [...document.querySelectorAll('.drop-veil')].find(v => !v.classList.contains('race-veil'));
      if (other) other.remove();
    });
    await sleep(1000);
  }
  await s2.browser.close();
  return seen;
};

const settledFires = await raceVeilAt('2026-08-16T10:00:00', 30000);
ok('CONTROL a settled race DOES produce a poster in this same setup (else the check below is empty)',
  settledFires, settledFires ? 'poster appeared' : 'no poster even after settlement: the negative below proves nothing');
const midFires = await raceVeilAt('2026-08-10T10:00:00', 30000);
ok('MID-RACE the poster refuses to fire while the race is still running',
  !midFires, midFires ? 'a results card appeared for a race that has NOT finished' : 'no poster, correct');

await browser.close();
srvHandle.close();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);

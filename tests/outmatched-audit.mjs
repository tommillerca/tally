/* Master handoff B16 (2026-09-07): "at level 2 the Glutton and the Spire are
 * unwinnable and neither sheet says so." The unit rows in tests/unit.test.js
 * prove isOutmatched's threshold against the real fight engine; this proves
 * the SHEETS actually render the copy in a real page, in both states: a fresh
 * level-2 build (the line must show) and a build with real stat + talent
 * progress (the line must not show). It also checks the Spire sheet always
 * states the daily-attempt cost, regardless of the odds.
 *
 * PROVE-RED: on the pre-B16 tree, `.glutton-outmatched` / `.spire-outmatched`
 * never exist (no such class in the source at all), so every OUTMATCHED check
 * below fails, and the daily-attempt text is not on the page either.
 */
import { boot, sleep, serveTree } from './godmode.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let srvHandle = null;
let target = process.argv[2] || process.env.URL;
if (!target) {
  srvHandle = await serveTree(join(dirname(fileURLToPath(import.meta.url)), '..'));
  target = srvHandle.url;
  console.log(`no URL given: serving this tree at ${target} rather than grading production`);
}
const { browser, page } = await boot(target);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

// Real training-point + talent picks, same shape a player's Build screen
// writes (js/pit.js allocatedStats/TRAIN_STEP). LEVEL2 is a fresh install's
// untouched default: no kv rows to set at all.
const PROGRESSED_ALLOC = { power: 18, marrow: 18, wind: 18, reflex: 18, hype: 18 }; // 20 + 18*2 = 56 each
const PROGRESSED_TALENTS = ['callcrows', 'sharpbeaks', 'sharpbeaks', 'sharpbeaks', 'sharpbeaks', 'sharpbeaks', 'flock', 'flock', 'flock', 'carrion', 'roost', 'roost', 'frenzy', 'frenzy', 'murder'];

const setBuild = (alloc, talents) => page.evaluate(async (alloc, talents) => {
  const db = await import('./js/db.js');
  await db.kvSet('trainalloc', alloc);
  await db.kvSet('talents', talents);
}, alloc, talents);

const closeAllSheets = async () => {
  for (let i = 0; i < 6; i++) {
    if (!await page.evaluate(() => !!document.querySelector('#sheets > div'))) break;
    await page.evaluate(() => history.back());
    await sleep(400);
  }
};

// ---- the Glutton sheet ----
await closeAllSheets();
await setBuild({}, []); // fresh level 2: no alloc, no talents
await page.evaluate(() => { window.__openGlutton && window.__openGlutton(); });
await sleep(1200);
let g = await page.evaluate(() => ({
  open: !!document.querySelector('.glutton-card'),
  outmatched: !!document.querySelector('.glutton-outmatched'),
  text: document.querySelector('.glutton-outmatched')?.textContent || null,
}));
console.log('Glutton, fresh level 2:', JSON.stringify(g));
if (!g.open) { console.log('no __openGlutton hook: cannot drive this'); await browser.close(); srvHandle?.close(); process.exit(2); }
check('Glutton sheet warns a fresh level 2 they are outmatched', g.outmatched, JSON.stringify(g));
check('the line is the plain one-liner, no invented numbers', g.text === 'You are outmatched at this level.', g.text);

await closeAllSheets();
await setBuild(PROGRESSED_ALLOC, PROGRESSED_TALENTS);
await page.evaluate(() => { window.__openGlutton && window.__openGlutton(); });
await sleep(1200);
g = await page.evaluate(() => ({
  open: !!document.querySelector('.glutton-card'),
  outmatched: !!document.querySelector('.glutton-outmatched'),
}));
console.log('Glutton, progressed build:', JSON.stringify(g));
check('a build with real progress is NOT told it is outmatched', g.open && !g.outmatched, JSON.stringify(g));

// ---- the Spire sheet ----
const towerS = { id: 'sp-audit-1', name: 'The Audit Spire', warden: 'Test Warden' };
const towerView = { held: false, dormant: false, tribute: { days: 0, coins: 0, dust: 0 } };
const rivalTower = {
  ownerName: 'Rival Bones',
  claimedAt: Date.now() - 2 * 3600000, // outside the 1h shield
  defender: {
    stats: { power: 55, marrow: 55, wind: 55, reflex: 55, hype: 55 },
    talents: ['heavyhands', 'followthrough', 'followthrough', 'followthrough', 'bonebreaker', 'concussive', 'rage', 'titan', 'ironjaw', 'ironjaw', 'ironjaw'],
    outfit: null,
  },
};

const openSpire = (s, view, rival) => page.evaluate((s, view, rival) => {
  window.__spireFightSheet && window.__spireFightSheet(s, view, rival);
}, s, view, rival);

await closeAllSheets();
await setBuild({}, []); // fresh level 2
await openSpire(towerS, towerView, rivalTower);
await sleep(1200);
let sp = await page.evaluate(() => ({
  open: !!document.querySelector('.spire-hero'),
  outmatched: !!document.querySelector('.spire-outmatched'),
  outmatchedText: document.querySelector('.spire-outmatched')?.textContent || null,
  dailyAttempt: document.body.textContent.includes('spends your one shot at it today'),
}));
console.log('Spire (rival tower), fresh level 2:', JSON.stringify(sp));
if (!sp.open) { console.log('no __spireFightSheet hook: cannot drive this'); await browser.close(); srvHandle?.close(); process.exit(2); }
check('Spire sheet warns a fresh level 2 up against a specced rival that they are outmatched', sp.outmatched, JSON.stringify(sp));
check('the line is the plain one-liner, no invented numbers', sp.outmatchedText === 'You are outmatched at this level.', sp.outmatchedText);
check('the Spire sheet always states the daily-attempt cost (outmatched state)', sp.dailyAttempt, JSON.stringify(sp));

await closeAllSheets();
await setBuild(PROGRESSED_ALLOC, PROGRESSED_TALENTS);
await openSpire(towerS, towerView, null); // NPC-held tower, not a rival
await sleep(1200);
sp = await page.evaluate(() => ({
  open: !!document.querySelector('.spire-hero'),
  outmatched: !!document.querySelector('.spire-outmatched'),
  dailyAttempt: document.body.textContent.includes('spends your one shot at it today'),
}));
console.log('Spire (NPC warden), progressed build:', JSON.stringify(sp));
check('a build with real progress vs an NPC warden is NOT told it is outmatched', sp.open && !sp.outmatched, JSON.stringify(sp));
check('the Spire sheet always states the daily-attempt cost (not-outmatched state too)', sp.dailyAttempt, JSON.stringify(sp));

await browser.close(); srvHandle?.close();
console.log(bad ? `\n${bad} FAILED` : '\nTHE BONEYARD STATES THE ODDS');
process.exit(bad ? 1 : 0);

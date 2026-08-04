/* Reproduce the Glutton farm, third attempt at this bug. The two previous fixes
 * targeted the map marker and then history.go(-2); neither addressed the sheet
 * itself, whose markup is built ONCE at open time. Failure = a live, wired
 * FACE THE GLUTTON button after a win. */
import { boot, sleep } from './godmode.js';
const { browser, page } = await boot(process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

// force him active regardless of the wall clock, and open his sheet directly
const state = await page.evaluate(async () => {
  const poi = await import('./js/poi.js');
  const w = poi.gluttonWindow();
  return { active: w.active, slot: w.slot, windows: poi.GLUTTON_WINDOWS };
});
console.log('glutton window right now:', JSON.stringify(state));

const openSheet = async () => {
  // one back() per evaluate, each awaited: batching them tears the execution
  // context out from under the script
  for (let i = 0; i < 6; i++) {
    if (!await page.evaluate(() => !!document.querySelector('#sheets > div'))) break;
    await page.evaluate(() => history.back());
    await sleep(500);
  }
  await page.evaluate(() => { window.__openGlutton && window.__openGlutton(); });
  await sleep(1400);
  return page.evaluate(() => ({
    open: !!document.querySelector('.glutton-card'),
    cta: !!document.getElementById('gluttonFight'),
    cleansed: !!document.querySelector('.glutton-beaten'),
  }));
};
let s = await openSheet();
console.log('sheet on first open:', JSON.stringify(s));
if (!s.open) { console.log('no __openGlutton hook yet: add one to drive this'); await browser.close(); process.exit(2); }
check('an unbeaten Glutton offers the fight', s.cta && !s.cleansed, JSON.stringify(s));

// fight and win through the engine's own settle
await page.evaluate(() => document.getElementById('gluttonFight').click());
await sleep(2500);
const inFight = await page.evaluate(() => !!window.__bhFight);
check('the fight opened', inFight);
const fin = await page.evaluate(async () => {
  const r = await window.__bhFight.finish('p');   // 'p' wins, 'f' loses
  return { ret: r === undefined ? 'void' : r };
});
await sleep(4000);
const fstate = await page.evaluate(async () => {
  const st = await window.__bhFight.state();
  return { over: st.over, winner: st.winner, turn: st.turn, victoryShown: !!document.querySelector('.fight-over'), doneBtn: !!document.getElementById('fightDone') };
});
console.log('finish ->', JSON.stringify(fin), 'state ->', JSON.stringify(fstate));
check('the fight ended with a WIN (a loss proves nothing here)', !!fstate.over && fstate.over.winner === 'p', JSON.stringify(fstate));
const won = await page.evaluate(async () => {
  const db = (await import('./js/db.js')).db;
  const poi = await import('./js/poi.js');
  const { dateKey } = await import('./js/nutrition.js');
  const rows = await db.all('xp');
  return { keys: rows.filter(r => String(r.key).startsWith('glutton-')).map(r => r.key), day: dateKey() };
});
console.log('ledger after the win:', JSON.stringify(won));
check('the win is recorded in the ledger', won.keys.length === 1, JSON.stringify(won.keys));

// THE EXPLOIT: is the sheet behind the fight still offering the fight?
const behind = await page.evaluate(() => {
  const btn = document.getElementById('gluttonFight');
  return {
    sheetsOpen: document.querySelectorAll('#sheets > div').length,
    ctaStillInDom: !!btn,
    ctaVisible: !!(btn && btn.offsetParent),
    cleansedShown: !!document.querySelector('.glutton-beaten'),
  };
});
console.log('while the victory screen is up:', JSON.stringify(behind));
check('the stale FACE THE GLUTTON button is gone from the DOM', !behind.ctaStillInDom, JSON.stringify(behind));

// and the decisive one: can a second win be minted?
const before = await page.evaluate(async () => (await (await import('./js/db.js')).db.all('xp')).filter(r => r.type === 'fight').length);
const refought = await page.evaluate(async () => {
  const btn = document.getElementById('gluttonFight');
  if (!btn) return 'no button';
  btn.click();
  return 'clicked';
});
await sleep(2500);
const second = await page.evaluate(async () => ({
  inFight: !!window.__bhFight && !(await window.__bhFight.state()).over,
}));
console.log('re-fight attempt:', refought, JSON.stringify(second));
check('a second Glutton fight cannot be started', refought === 'no button' || !second.inFight, `${refought} / ${JSON.stringify(second)}`);

// reopening in the same window must read as cleansed
s = await openSheet();
console.log('sheet reopened after the win:', JSON.stringify(s));
check('reopening shows Cleansed, not the fight button', s.cleansed && !s.cta, JSON.stringify(s));

// the combat art: is it decoded when the fight starts, on a COLD cache?
await browser.close();
console.log(bad ? `\n${bad} FAILED (the exploit is real)` : '\nGLUTTON IS NOT FARMABLE');
process.exit(bad ? 1 : 0);

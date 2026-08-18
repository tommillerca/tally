/* Reproduce the Glutton farm, third attempt at this bug. The two previous fixes
 * targeted the map marker and then history.go(-2); neither addressed the sheet
 * itself, whose markup is built ONCE at open time. Failure = a live, wired
 * FACE THE GLUTTON button after a win. */
import { boot, sleep, serveTree } from './godmode.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
/* SELF-SERVE WHEN GIVEN NOTHING. argv first, env.URL second, and with NEITHER
   this fell through to boot()'s default, which is https://tommillerca.github.io/tally/.
   Running it bare therefore graded PRODUCTION while reading as coverage of the
   tree under test, and that is not a theoretical hazard: on 2026-08-16 a
   prove-red run deleted the dedupe guard from this worktree's js/poi.js, the
   audit stayed GREEN because the browser was loading production's poi.js, and
   the mutation test silently proved nothing. A guard that cannot fail is not a
   guard. If nobody names a target, serve the tree this file lives in. */
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
if (!s.open) { console.log('no __openGlutton hook yet: add one to drive this'); await browser.close(); srvHandle?.close(); process.exit(2); }
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
  /* VISIBILITY, not presence. The result card is now hidden by CSS until
     settle() adds .fight-settled (app.css: `.fight-body > .fight-over
     { opacity: 0 }`), and that add sits inside a 900ms timeout guarded by
     body.isConnected. `!!querySelector` would pass on a card the player
     cannot see, which is the exact bug that made the onboarding invisible on
     2026-08-12. Measure the ancestor chain the way onb-audit does. */
  const over = document.querySelector('.fight-over');
  let eff = over ? 1 : 0;
  for (let n = over; n && n.nodeType === 1; n = n.parentElement) eff *= parseFloat(getComputedStyle(n).opacity || '1');
  return { over: st.over, winner: st.winner, turn: st.turn, victoryShown: !!over, victoryOpacity: eff, doneBtn: !!document.getElementById('fightDone') };
});
console.log('finish ->', JSON.stringify(fin), 'state ->', JSON.stringify(fstate));
check('the victory card is VISIBLE, not merely in the DOM', fstate.victoryOpacity > 0.9,
  `effectiveOpacity=${fstate.victoryOpacity} present=${fstate.victoryShown}`);
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

/* THE RETURN TRIP. Tom, 2026-08-11: "after beating the glutton you should just
 * be back on the boneyard and not need to close the popup". The Done button did
 * history.go(-2), which rewinds two entries but fires ONE popstate, and the
 * popstate handler closes ONE sheet: the fight sheet went, the stale glutton
 * sheet stayed up and had to be closed by hand. Tap Done for real and assert
 * BOTH sheets are gone. A celebration sheet on top is the app-wide post-win
 * pattern and is not counted against this. */
await page.evaluate(() => document.getElementById('fightDone')?.click());
await sleep(1600);
const landed = await page.evaluate(() => ({
  fightGone: !document.getElementById('fightBody'),
  gluttonGone: !document.querySelector('.glutton-card'),
}));
console.log('after tapping Done on the victory screen:', JSON.stringify(landed));
check('winning + Done closes the fight AND the glutton sheet, no manual close', landed.fightGone && landed.gluttonGone, JSON.stringify(landed));

// reopening in the same window must read as cleansed
s = await openSheet();
console.log('sheet reopened after the win:', JSON.stringify(s));
check('reopening shows Cleansed, not the fight button', s.cleansed && !s.cta, JSON.stringify(s));

/* THE MONEY, WHICH NOTHING ABOVE LOOKS AT.
 * Every check in this file until now is about a BUTTON and a SHEET. That is the
 * entry point, and closing the entry point is only half of the rewarded-actions
 * SOP: the other half is "prove the second attempt pays nothing". A reward
 * reachable by any route other than #gluttonFight would sail straight past
 * everything above, and this farm has been fixed three times already, twice by
 * closing an entry point that turned out not to be the only one.
 * So call the payout function directly, twice more, in the already-satisfied
 * state, and assert the ledger and the wallet do not move. Measured on a clean
 * tree 2026-08-12: attempt 1 paid +140 coins and +70 xp, attempts 2 and 3 paid
 * +0 and +0, with the ledger stuck at one row. The guard is at js/poi.js:637,
 * where claimGluttonWin returns null the moment its award yields 0 xp, before
 * coins, before gear, before the dust consolation.
 * PROVE-RED: delete that `if (xp === 0) return null;` line and the deltas below
 * go non-zero on the repeat attempts. */
const wallet = () => page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const game = await import('./js/game.js');
  const db = await import('./js/db.js');
  const rows = await db.db.all('xp');
  return { coins: await loot.coins(), xp: await game.totalXp(), gluttonRows: rows.filter(r => r.type === 'glutton').length };
});
const purseBefore = await wallet();
/* RE-CLAIM THE WINDOW THAT WAS ACTUALLY WON, not the default one. This called
   `claimGluttonWin()` bare, and the signature is `(day = dateKey(), slot = 0)`,
   so it re-claimed SLOT 0 while the fight above had won whatever slot was live.
   The Glutton has two windows a day, [8,12] and [17,21]. Run this in the
   morning and slot is 0, the default matches, and it passes. Run it after 17:00
   and it re-claims the untouched morning window, which correctly pays, and the
   audit reports a farming exploit that does not exist.
   That is worse than a missing check: it is a guard that goes red on healthy
   code for half of every day, and a guard nobody can trust is a guard nobody
   reads. Verified 2026-08-16, red on clean main at slot 1, green at slot 0,
   with js/poi.js untouched in both runs. */
/* THE SLOT COMES FROM THE LEDGER, not the clock. Reading gluttonWindow() was
   the second wrong answer: this audit forces the sheet open with __openGlutton
   regardless of the wall clock, so it can win a slot while no window is live,
   and gluttonWindow().slot is then -1. Re-claiming -1 leaves the won slot
   untouched and re-reports the same phantom exploit.
   The row the win actually wrote is the only source that cannot disagree with
   the win. Parse it, and let the SETUP check below fail loudly if it is not
   there, rather than silently re-claiming something else. */
const reclaimSlot = Number((won.keys[0] || '').split('-').pop());
const repeat = await page.evaluate(async slot => {
  const poi = await import('./js/poi.js');
  const out = [];
  for (let i = 0; i < 2; i++) out.push(await poi.claimGluttonWin(undefined, slot));
  return { slot, out: out.map(r => (r === null ? 'null' : JSON.stringify(r))) };
}, reclaimSlot);
const purseAfter = await wallet();
console.log(`re-claim attempts in the already-won state (slot ${reclaimSlot}):`, repeat.out.join(' | '));
console.log('wallet before:', JSON.stringify(purseBefore), "after:", JSON.stringify(purseAfter));
/* An empty sample would make the deltas trivially zero, so require that the win
   above actually banked something first. */
check('SETUP the win actually paid, so a zero delta below means something', purseBefore.gluttonRows === 1 && purseBefore.coins > 0,
  JSON.stringify(purseBefore));
check('SETUP the re-claim targets the window that was won, not a fresh one', won.keys.includes(`glutton-${won.day}-${reclaimSlot}`),
  `re-claiming slot ${reclaimSlot}; ledger holds ${won.keys.join(', ') || 'nothing'}`);
check('PAYOUT a repeat claim pays no coins', purseAfter.coins - purseBefore.coins === 0, `delta=${purseAfter.coins - purseBefore.coins}`);
check('PAYOUT a repeat claim pays no XP', purseAfter.xp - purseBefore.xp === 0, `delta=${purseAfter.xp - purseBefore.xp}`);
check('PAYOUT and mints no second ledger row', purseAfter.gluttonRows === purseBefore.gluttonRows, `${purseBefore.gluttonRows} -> ${purseAfter.gluttonRows}`);
check('PAYOUT the repeat calls returned null, not a reward', repeat.out.every(r => r === 'null'), repeat.out.join(' | '));

// the combat art: is it decoded when the fight starts, on a COLD cache?
await browser.close(); srvHandle?.close();
console.log(bad ? `\n${bad} FAILED (the exploit is real)` : '\nGLUTTON IS NOT FARMABLE');
process.exit(bad ? 1 : 0);

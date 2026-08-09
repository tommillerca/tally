/* The fight screen: it must use the phone's height, and a consumable must not be
   spendable by one stray tap.
   Tom, 2026-08-09: "let's see how the pit looks taller ... maximize the height of
   a phone screen" and "using an item in a fight should take two taps so you dont
   hit it by accident".
   Proven red against v344: arena 258 on a 932 screen (28%), and one tap drank. */
import { boot, sleep } from './godmode.js';
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const { browser, page } = await boot(process.argv[2] || 'http://localhost:8765/');

/* ---- 1. tall phone: the arena claims the slack, nothing falls off ---- */
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(async () => { await window.__denFight(1.6, 0); });
await sleep(1700);
const tall = await page.evaluate(() => {
  const a = document.querySelector('.arena').getBoundingClientRect();
  const act = document.querySelector('.fight-actions').getBoundingClientRect();
  return { vh: innerHeight, arenaH: Math.round(a.height), pct: Math.round(a.height / innerHeight * 100),
           actionsBottom: Math.round(act.bottom), belowActions: Math.round(innerHeight - act.bottom) };
});
ok('the arena uses at least half the screen', tall.pct >= 50, `${tall.arenaH}px = ${tall.pct}% of ${tall.vh}`);
ok('the action buttons are on screen', tall.actionsBottom <= tall.vh, `bottom ${tall.actionsBottom} / ${tall.vh}`);
ok('no dead band under the buttons', tall.belowActions < 60, `${tall.belowActions}px`);

/* ---- 2. short phone: the 258 floor still fits ---- */
await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(700);
const short = await page.evaluate(() => {
  const a = document.querySelector('.arena').getBoundingClientRect();
  const act = document.querySelector('.fight-actions').getBoundingClientRect();
  const end = document.getElementById('endTurn')?.getBoundingClientRect();
  return { vh: innerHeight, arenaH: Math.round(a.height), actionsBottom: Math.round(act.bottom),
           endTurnVisible: end ? end.bottom <= innerHeight + 1 && end.top >= 0 : false };
});
ok('the arena never goes below its 258 floor', short.arenaH >= 258, `${short.arenaH}px on a ${short.vh} screen`);
ok('End Turn is still reachable on a short phone', short.endTurnVisible, JSON.stringify(short));

/* ---- 3. a potion takes TWO taps ---- */
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(async () => {
  // seed a potion so the button exists, then re-open the fight
  const db = await import('./js/db.js');
  await db.kvSet('potions', { 'vital-tonic': 3, 'fury-flask': 2 });
  document.querySelector('.sheet-close')?.click();
});
await sleep(800);
await page.evaluate(async () => { await window.__denFight(1.6, 0); });
await sleep(1700);
const potion = await page.evaluate(async () => {
  const b = document.querySelector('.fight-act.potion:not([disabled])');
  if (!b) return { none: true };
  const label0 = b.textContent.trim();
  const ap0 = +(document.getElementById('endTurn')?.textContent.match(/(\d+) AP/)?.[1] ?? -1);
  b.click(); await new Promise(r => setTimeout(r, 120));
  const armed = b.classList.contains('arming');
  const label1 = b.textContent.trim();
  const apAfterOne = +(document.getElementById('endTurn')?.textContent.match(/(\d+) AP/)?.[1] ?? -1);
  const b2 = document.querySelector('.fight-act.potion.arming') || b;
  b2.click(); await new Promise(r => setTimeout(r, 400));
  const apAfterTwo = +(document.getElementById('endTurn')?.textContent.match(/(\d+) AP/)?.[1] ?? -1);
  return { none: false, label0, armed, label1, ap0, apAfterOne, apAfterTwo };
});
ok('a potion button exists to test', !potion.none, JSON.stringify(potion).slice(0, 120));
// an empty sample is a failure, not a pass
if (!potion.none) {
  ok('one tap ARMS it and spends nothing', potion.armed && potion.apAfterOne === potion.ap0,
    `armed=${potion.armed} ap ${potion.ap0} -> ${potion.apAfterOne}`);
  ok('the label changes so the second tap is obvious', /again/i.test(potion.label1), potion.label1);
  ok('the second tap actually drinks it', potion.apAfterTwo < potion.ap0,
    `ap ${potion.ap0} -> ${potion.apAfterTwo}`);
}
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);

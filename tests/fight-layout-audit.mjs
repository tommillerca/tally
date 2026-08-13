/* The fight screen: it must use the phone's height, and a consumable must not be
   spendable by one stray tap.
   Tom, 2026-08-09: "let's see how the pit looks taller ... maximize the height of
   a phone screen" and "using an item in a fight should take two taps so you dont
   hit it by accident".
   Proven red against v344: arena 258 on a 932 screen (28%), and one tap drank. */
import { boot, sleep, settle, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srvHandle.url;
const { browser, page } = await boot(base);

/* ---- 1. tall phone: the arena claims the slack, nothing falls off ---- */
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(async () => { await window.__denFight(1.6, 0); });
await sleep(1700);
await settle(page);
const tall = await page.evaluate(() => {
  const a = document.querySelector('.arena').getBoundingClientRect();
  /* End Turn lives BELOW the tray now, so the bottom of the fight is its row. */
  const act = (document.getElementById('fendrow') || document.querySelector('.fight-actions')).getBoundingClientRect();
  return { vh: innerHeight, arenaH: Math.round(a.height), pct: Math.round(a.height / innerHeight * 100),
           actionsBottom: Math.round(act.bottom), belowActions: Math.round(innerHeight - act.bottom) };
});
ok('the arena uses at least half the screen', tall.pct >= 50, `${tall.arenaH}px = ${tall.pct}% of ${tall.vh}`);
ok('the action buttons are on screen', tall.actionsBottom <= tall.vh, `bottom ${tall.actionsBottom} / ${tall.vh}`);
ok('no dead band under the buttons', tall.belowActions < 60, `${tall.belowActions}px`);

/* ---- 2. short phone: the 258 floor still fits ---- */
await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(700);
await settle(page);
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
/* WAIT FOR THE PLAYER-TURN TRAY, not a fixed 1700ms sleep. renderActions()
   at js/app.js:13964 early-returns with a "<foe> is acting..." placeholder
   whenever `fight.active !== 'p'`, and #itemsOpen only exists inside the
   player-turn branch (line 14077). A fixed sleep cannot distinguish "not
   ready yet" from "never going to be ready"; waiting on the actual
   precondition can. Cap at 8s so a genuinely broken renderActions still
   surfaces as a real failure rather than an infinite hang.
   NOT motivated by a reproduced failure: this audit passed 5/5 pre-change
   on every correctly-served tree we tested. `sleep(N)-then-read` is
   unsound by construction on any puppet, regardless of whether today's
   run lands inside its window; replacing it with a real-precondition
   wait is the same defect this project has been unwinding for a week
   (year-readout-audit, Discord banner, etc.). */
const trayWait = await page.waitForFunction(() => {
  const f = document.getElementById('factions');
  if (!f) return false;
  if (/is acting/i.test(f.textContent || '')) return false;
  return f.querySelectorAll('.fight-act').length >= 3;
}, { timeout: 8000, polling: 50 }).then(() => 'ready').catch(() => 'timed-out');
const door = await page.evaluate(() => {
  const d = document.getElementById('itemsOpen');
  const f = document.getElementById('factions');
  const trayText = f ? (f.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120) : null;
  const actCount = f ? f.querySelectorAll('.fight-act').length : 0;
  const acting = /is acting/i.test(trayText || '');
  if (!d) return { none: true, trayText, actCount, acting };
  d.click();
  return { none: false, label: (d.textContent || '').trim().slice(0, 40), trayText, actCount };
});
/* Failure message distinguishes the two possible causes explicitly:
     acting=true         still on foe-turn placeholder at sample time
     actCount >= 3       player-turn tray rendered but no #itemsOpen
     tray_wait=timed-out neither condition met inside 8s */
ok('the ITEMS door is on the tray when potions are held',
  !door.none,
  door.none
    ? `tray_wait=${trayWait}  acting=${door.acting}  act_count=${door.actCount}  tray="${door.trayText}"`
    : JSON.stringify({ label: door.label }));
await sleep(500);
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

/* ---- 4. the screen must not resize itself turn to turn ----
   Tom, 2026-08-09: "the pit height was changing nonstop the buttons were moving
   up and down based on the menu that was available really sloppy ui."
   Proven red against v351: End Turn moved 200px+ every time the foe took a turn. */
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(() => document.querySelector('.sheet-close')?.click());
await sleep(600);
await page.evaluate(async () => { await window.__denFight(1.6, 0); });
/* settle the slide-in FIRST: this harness never advances CSS animations, so a
   sheet finished later would move the layout after the tray had already locked
   and the drift would be the harness, not the app. */
await sleep(400); await settle(page); await sleep(1400);
const jitter = await page.evaluate(async () => {
  const read = () => {
    const t = document.querySelector('.fight-actions')?.getBoundingClientRect();
    const a = document.querySelector('.arena')?.getBoundingClientRect();
    return { trayTop: t ? Math.round(t.top) : -1, arenaH: a ? Math.round(a.height) : -1 };
  };
  const seen = [read()];
  /* play three real turns: each one hands over to the foe and back, which is
     exactly when the tray collapsed and everything jumped. */
  for (let i = 0; i < 3; i++) {
    document.getElementById('endTurn')?.click();
    await new Promise(r => setTimeout(r, 500));
    seen.push(read());                      // foe acting: the collapsed tray
    await new Promise(r => setTimeout(r, 2600));
    seen.push(read());                      // back to us
  }
  const tops = seen.map(s => s.trayTop).filter(v => v > 0);
  const arenas = seen.map(s => s.arenaH).filter(v => v > 0);
  return { seen, trayDrift: Math.max(...tops) - Math.min(...tops), arenaDrift: Math.max(...arenas) - Math.min(...arenas) };
});
ok('the buttons hold still across turns', jitter.trayDrift <= 2, `moved ${jitter.trayDrift}px  ${JSON.stringify(jitter.seen)}`);
ok('the arena holds its height across turns', jitter.arenaDrift <= 2, `${jitter.arenaDrift}px`);

await browser.close();
if (srvHandle) srvHandle.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);

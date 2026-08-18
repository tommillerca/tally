/* PRESS AND HOLD A MOVE TO READ IT. A TAP STILL COMMITS IT.
   Tom, 2026-08-18: "maybe players can press and hold in the pit to learn more
   about the move with a pop up?"

   This file exists for the risk, not for the feature. In the Pit a tap SPENDS
   the player's turn, so a long-press that is detected wrongly is worse than the
   problem it solves in both directions: a hold that also fires the move steals
   a turn from someone who only wanted to read, and a tap misread as a hold eats
   the move they meant to make. Neither is visible in a screenshot.

   EVERY CHECK IS DRIVEN THROUGH THE REAL DISPATCH. No handler is called
   directly and no seam is used to perform an act: the press is a real
   CDP-dispatched pointer sequence on the real button, and "the move was used"
   is read from what the player sees change, the AP on End Turn and the boss's
   HP from window.__bhFight.state(). Calling playerAct() from the test would
   prove the function works while the button was broken, which is exactly the
   failure this project keeps re-learning (see the FX contract in tally/CLAUDE.md).

   THE 750ms/8px THRESHOLD IS NOT INVENTED HERE. It is LP_MS/LP_MOVE, the
   Boneyard map's shipped long-press constants, reused so the gesture means one
   thing across the app. What this file pins is that it does not steal an
   ordinary tap: 120ms is asserted to use the move at both 393x852 and 320x568.

   WHAT EACH CHECK WAS PROVEN TO CATCH, by mutating the shipped code in a
   throwaway tree and re-running (never in the working tree):
     - drop `if (takeHeld()) return;` from the click handler
         -> RED "a 950ms hold does NOT use the move". This is the turn-stealing
            bug, and it is the reason the file exists.
     - drop the >8px pointermove cancel
         -> RED "a hold that drags 40px opens no popup" (and 320x568's
            "a hold that scrolls the tray does nothing at all").
     - drop the button's title=
         -> RED both accessibility checks in section 9.
   AND WHAT THEY DO NOT CATCH, recorded so nobody trusts them for more than they
   are worth. Two guards in the shipped code survived their own mutations here,
   because Chromium is kinder than the contract:
     - deciding the hold inside the 750ms timer instead of from pointer event
       timestamps STILL PASSES section 6. Measured cause: Chromium dispatches a
       pending pointerup before an overdue timer callback, so the race the
       timestamp form defends against does not occur in this browser. The
       timestamp form is kept because the app also ships in WKWebView, which
       makes no such promise, but section 6 pins the BEHAVIOUR, not that
       mechanism.
     - dropping the `lpHeld = false` reset at pointerdown STILL PASSES section
       4, because Chromium always fires the click after a long press, so the
       flag is always consumed. It guards iOS, which sometimes does not. */
import { boot, sleep, settle, serveTree, dismissOverlays } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const { browser, page } = await boot(argv || srvHandle.url);

const VP = { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
await page.setViewport(VP);

/* A LOADED TRAY, same seam and same build as fight-hint-audit: the talent moves
   are the ones whose detail was cut to fit one line, so they are the ones the
   popup has to carry. */
async function freshFight() {
  await dismissOverlays(page);
  await page.evaluate(() => document.querySelector('.sheet-close')?.click());
  await sleep(450);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.kvSet('talents', ['callcrows', 'peckeyes', 'murder', 'bonebolt']);
    window.__denFight(1.4, 0, { mage: true });
  });
  await page.waitForFunction(() => {
    const f = document.getElementById('factions');
    return f && !/is acting/i.test(f.textContent || '') && f.querySelectorAll('.fight-act').length >= 4;
  }, { timeout: 15000, polling: 50 }).catch(() => {});
  await sleep(900);
  await settle(page);
}

/* what the PLAYER can see change. AP is the End Turn readout, foe HP is the
   fight's own state; a move that fired moves at least one of them. */
const readState = () => page.evaluate(() => ({
  ap: +(document.getElementById('endTurn')?.textContent.match(/(\d+) AP/)?.[1] ?? -1),
  foe: window.__bhFight ? window.__bhFight.state().foe : -1,
  tip: (() => {
    const t = document.querySelector('.fmove-tip');
    if (!t || t.hidden) return null;
    const r = t.getBoundingClientRect();
    return { text: (t.innerText || '').replace(/\s+/g, ' ').trim(),
             top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1) };
  })(),
}));

/* CENTRE OF A MOVE BUTTON, and it has to be a MEASURED centre. The obvious form
   (tray.scrollTop = b.offsetTop) is wrong and silently so: .fight-actions is not
   the offsetParent, so at 320x568 it put the press point 69px above the tray's
   visible box and every pointer event landed on nothing at all. The whole run
   then graded "no popup opened" as a feature bug. Scroll by the measured
   difference between the two rects, then re-read. */
const centreOf = id => page.evaluate(sel => {
  const b = document.querySelector(`[data-act="${sel}"]`);
  if (!b) return null;
  const tray = document.querySelector('.fight-actions');
  if (tray) {
    const tr = tray.getBoundingClientRect(), br = b.getBoundingClientRect();
    if (br.top < tr.top || br.bottom > tr.bottom) tray.scrollTop += (br.top - tr.top) - 4;
  }
  const r = b.getBoundingClientRect(), t = tray.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
           top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1),
           // an off-tray press point would make every check below vacuous
           inTray: r.top >= t.top - 1 && r.bottom <= t.bottom + 1 };
}, id);

async function press(pt, ms, drag = 0) {
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  if (drag) { await sleep(Math.max(0, ms / 2)); await page.mouse.move(pt.x, pt.y + drag, { steps: 4 }); await sleep(Math.max(0, ms / 2)); }
  else await sleep(ms);
  await page.mouse.up();
  await sleep(450);
}

/* ---- 1. a plain tap still uses the move ---------------------------------- */
await freshFight();
let jab = await centreOf('jab');
ok('SETUP: there is a Jab button, inside the tray, to press', !!jab && jab.inTray, JSON.stringify(jab));
if (jab && !jab.inTray) jab = null;      // an off-tray press point makes every check below vacuous
if (jab) {
  const before = await readState();
  await press(jab, 120);
  const after = await readState();
  ok('a 120ms tap USES the move', after.ap < before.ap && after.ap >= 0,
    `AP ${before.ap} -> ${after.ap}, foe ${before.foe} -> ${after.foe}`);
  ok('a 120ms tap opens no popup', !after.tip, after.tip ? after.tip.text.slice(0, 60) : 'none');
}

/* ---- 2. a hold opens the popup and does NOT use the move ----------------- */
await freshFight();
jab = await centreOf('jab');
if (jab) {
  const before = await readState();
  await press(jab, 950);
  const after = await readState();
  ok('a 950ms hold opens the detail popup', !!after.tip, after.tip ? after.tip.text.slice(0, 80) : 'no popup');
  ok('a 950ms hold does NOT use the move', after.ap === before.ap && after.foe === before.foe,
    `AP ${before.ap} -> ${after.ap}, foe ${before.foe} -> ${after.foe}`);
  // an empty sample is a failure: the popup has to actually say something
  ok('the popup carries the move\'s FULL sentence, not the tray hint',
    !!after.tip && /never misses/i.test(after.tip.text) && after.tip.text.length > 60,
    after.tip ? `${after.tip.text.length} chars: "${after.tip.text}"` : 'no popup');
  if (after.tip) {
    const covered = Math.max(0, Math.min(after.tip.bottom, jab.bottom) - Math.max(after.tip.top, jab.top))
                  * (Math.min(after.tip.right, jab.right) > Math.max(after.tip.left, jab.left) ? 1 : 0);
    ok('the popup does not cover the move it describes', covered === 0,
      `popup ${after.tip.top}..${after.tip.bottom}, button ${jab.top}..${jab.bottom}`);
  }
  /* ---- 3. tapping anywhere dismisses it, and dismissing fires nothing ---- */
  const arena = await page.evaluate(() => {
    const a = document.querySelector('.arena'); if (!a) return null;
    const r = a.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  const mid = await readState();
  await page.mouse.click(arena.x, arena.y);
  await sleep(350);
  const dismissed = await readState();
  ok('tapping away dismisses the popup', !dismissed.tip, dismissed.tip ? 'still open' : 'closed');
  ok('dismissing the popup does not fire the held move',
    dismissed.ap === mid.ap && dismissed.foe === mid.foe,
    `AP ${mid.ap} -> ${dismissed.ap}, foe ${mid.foe} -> ${dismissed.foe}`);
  /* ---- 4. and the NEXT tap works normally (no stale swallow flag) -------- */
  const b4 = await readState();
  await press(jab, 120);
  const a4 = await readState();
  ok('the tap after a hold uses the move (no stale hold flag)', a4.ap < b4.ap,
    `AP ${b4.ap} -> ${a4.ap}`);
}

/* ---- 5. a hold that turns into a scroll does NOTHING --------------------- */
await freshFight();
jab = await centreOf('jab');
if (jab) {
  const before = await readState();
  await press(jab, 1000, 40);      // 40px of finger travel: the tray being scrolled
  const after = await readState();
  ok('a hold that drags 40px opens no popup', !after.tip, after.tip ? after.tip.text.slice(0, 60) : 'none');
  ok('a hold that drags 40px uses no move', after.ap === before.ap && after.foe === before.foe,
    `AP ${before.ap} -> ${after.ap}, foe ${before.foe} -> ${after.foe}`);
}

/* ---- 6. A STALLED FRAME MUST NOT TURN A TAP INTO A HOLD -----------------
   The whole reason the hold is decided from pointer event timestamps rather
   than from the 750ms timer. Here the main thread is frozen for 1200ms while
   the finger is down for ~120ms of real time, so on release the timer callback
   and the pointerup are BOTH pending. A timer-based implementation opens the
   popup and swallows the click; a timestamp-based one sees a 120ms press and
   lets the move through. */
await freshFight();
jab = await centreOf('jab');
if (jab) {
  const before = await readState();
  await page.mouse.move(jab.x, jab.y);
  await page.mouse.down();
  const freeze = page.evaluate(() => { const t = Date.now(); while (Date.now() - t < 1200) { /* wedge the main thread */ } });
  await sleep(120);
  const up = page.mouse.up();
  await freeze; await up;
  await sleep(600);
  const after = await readState();
  ok('a short tap through a 1200ms frozen frame still USES the move', after.ap < before.ap,
    `AP ${before.ap} -> ${after.ap}, foe ${before.foe} -> ${after.foe}`);
  ok('a short tap through a frozen frame opens no popup', !after.tip,
    after.tip ? after.tip.text.slice(0, 60) : 'none');
}

/* ---- 7. a double tap is two moves, not a hold ---------------------------- */
await freshFight();
jab = await centreOf('jab');
if (jab) {
  const before = await readState();
  await page.mouse.click(jab.x, jab.y);
  await sleep(90);
  await page.mouse.click(jab.x, jab.y);
  await sleep(700);
  const after = await readState();
  ok('a double tap spends both action points, none swallowed',
    before.ap - after.ap >= 2 || after.ap === 0,
    `AP ${before.ap} -> ${after.ap}, foe ${before.foe} -> ${after.foe}`);
  ok('a double tap opens no popup', !after.tip, after.tip ? after.tip.text.slice(0, 60) : 'none');
}

/* ---- 8. the fact the one-line hint had to cut is in the popup ------------
   With Heckle taken, Bone Guard's hint is "shield N - weakens" and no longer
   names the Stamina, because three facts do not fit the ~18-character box. That
   is the detail this popup exists to carry, so it is asserted by name. */
await dismissOverlays(page);
await page.evaluate(() => document.querySelector('.sheet-close')?.click());
await sleep(450);
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('talents', ['heckle']);
  window.__denFight(1.4, 0, { mage: true });
});
await page.waitForFunction(() => {
  const f = document.getElementById('factions');
  return f && !/is acting/i.test(f.textContent || '') && f.querySelector('[data-act="guard"]');
}, { timeout: 15000, polling: 50 }).catch(() => {});
await sleep(900); await settle(page);
const guard = await centreOf('guard');
ok('SETUP: Bone Guard is on the tray with Heckle taken', !!guard, JSON.stringify(guard));
if (guard) {
  const hint = await page.evaluate(() => (document.querySelector('[data-act="guard"] small')?.textContent || '').trim());
  ok('the one-line hint really has dropped the Stamina', !/stamina/i.test(hint), `hint "${hint}"`);
  await press(guard, 950);
  const t = await readState();
  ok('holding Bone Guard names the Stamina the hint could not fit',
    !!t.tip && /22 stamina/i.test(t.tip.text), t.tip ? t.tip.text : 'no popup');
}

/* ---- 9. the same detail without the gesture -----------------------------
   A long press has no keyboard and no screen-reader equivalent, so the detail
   is also the button's title, which is its accessible DESCRIPTION. If that ever
   silently drops, the feature becomes touch-only and this goes red. */
const titles = await page.evaluate(() => [...document.querySelectorAll('.fight-actions [data-act]')]
  .map(b => ({ id: b.dataset.act, title: (b.getAttribute('title') || '').trim() })));
ok('every move button has a title to read to (accessible description)',
  titles.length > 0 && titles.every(t => t.title.length > 20),
  `${titles.length} buttons: ${titles.map(t => `${t.id}=${t.title.length}`).join(' ')}`);
ok('the title is the same sentence the popup shows',
  titles.some(t => t.id === 'guard' && /22 Stamina/i.test(t.title)),
  JSON.stringify(titles.find(t => t.id === 'guard') || null));

/* ---- 10. THE SAME THREE ON THE SMALLEST PHONE ---------------------------
   320x568 is the one viewport where the tray genuinely scrolls (96px of box
   holding 165px of buttons, measured), so it is the one where a hold turning
   into a scroll is not a hypothetical. Everything above ran at 393x852, where
   the tray does not scroll at all, and a drag-cancel check on a tray that
   cannot scroll is a weaker check than it looks. */
await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(400);
await freshFight();
let sm = await centreOf('jab');
ok('SETUP 320x568: Jab is inside the scrolling tray', !!sm && sm.inTray, JSON.stringify(sm));
if (sm && !sm.inTray) sm = null;
if (sm) {
  let b0 = await readState();
  await press(sm, 120);
  let a0 = await readState();
  ok('320x568: a tap uses the move', a0.ap < b0.ap, `AP ${b0.ap} -> ${a0.ap}`);

  await freshFight(); sm = await centreOf('jab');
  b0 = await readState();
  await press(sm, 950);
  a0 = await readState();
  ok('320x568: a hold opens the popup and uses no move',
    !!a0.tip && a0.ap === b0.ap && a0.foe === b0.foe,
    `popup=${!!a0.tip} AP ${b0.ap} -> ${a0.ap}, foe ${b0.foe} -> ${a0.foe}`);
  ok('320x568: the popup fits on screen and does not cover the button',
    !!a0.tip && a0.tip.top >= 0 && a0.tip.bottom <= 568 && a0.tip.left >= 0 && a0.tip.right <= 320
      && (a0.tip.bottom <= sm.top || a0.tip.top >= sm.bottom),
    a0.tip ? `popup ${a0.tip.left},${a0.tip.top}..${a0.tip.right},${a0.tip.bottom} vs button ${sm.top}..${sm.bottom}` : 'no popup');

  await freshFight(); sm = await centreOf('jab');
  b0 = await readState();
  await press(sm, 1000, 40);
  a0 = await readState();
  ok('320x568: a hold that scrolls the tray does nothing at all',
    !a0.tip && a0.ap === b0.ap && a0.foe === b0.foe,
    `popup=${!!a0.tip} AP ${b0.ap} -> ${a0.ap}, foe ${b0.foe} -> ${a0.foe}`);
}

await browser.close();
if (srvHandle) srvHandle.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);

/* The fight screen: a taller phone must spend its extra height on the MOVE TRAY,
   the fighters must not be shrunk to buy that, and a consumable must not be
   spendable by one stray tap.
   Tom, 2026-08-18: "you stil lcant ge three rows of buttons fully in the frame
   with your pit fix ? the fighting area is still the same height", and
   2026-08-09: "using an item in a fight should take two taps so you dont hit it
   by accident".
   The height rule here USED to be Tom's other 2026-08-09 line, "maximize the
   height of a phone screen", asserted as arena + hud >= 50% of the viewport.
   That is superseded; section 6 carries the replacement and the full history.
   Proven red against v400 (three of four checks in section 6, with the safe-area
   insets emulated) and against v344 (one tap drank). */
import { boot, sleep, settle, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
/* ---- INK, not boxes ----
   A stage box is not a figure. .fstage is a square with object-fit:contain
   inside it, so a box can sit clear of the HUD while the drawing inside it does
   not, and it can also overlap while nothing visible does. The old assertion in
   this section dodged the problem by measuring the ARENA instead of anything
   drawn in it, which is why it survived a build where the boss was rendering
   with his head cut off.
   This measures what is actually painted: screenshot the arena, hide one side,
   screenshot again, and diff. Every pixel that changed is a pixel that side was
   responsible for, shadows and glows included, so it needs no knowledge of the
   asset, the layer stack or the object-fit maths. Animations are paused first,
   or a torch flickering between the two frames reads as figure ink. */
async function inkOf(page, targetSel) {
  /* MEASURE THE FIGURE, NOT THE HOLE IT IS ALLOWED TO PAINT IN.
     Two earlier forms of this were wrong, and both were wrong in the direction
     that grades a broken screen green, so the history is worth keeping.

     v1 clipped the screenshot to the arena's own rect. That made "the ink is
     inside the arena" true by construction, because ink outside the clip is not
     ink the diff can see, and .arena carries overflow:hidden so a figure shoved
     past the edge does not spill, it VANISHES. Measured: with the boss
     translated 130px up so his head is cut off, v1 read his ink at 1636px
     against a healthy 38395 and printed PASS, 2.1px of clearance. That is
     exactly the decapitation case this file exists to catch.

     v2 lifted overflow and grew the clip past the arena, which fixed the
     blindness and introduced a different lie: the bigger region now included
     the meta row and the move tray, and those change on their own between the
     two frames, so unrelated UI churn was attributed to the figure. It invented
     195.1px of boss ink below the arena at 430x932 where the DOM shows nothing
     below it at all.

     v3, this one, removes the ambiguity instead of chasing it. Everything in
     the fight body is hidden, then ONLY the target subtree is made visible.
     Frame A is the figure alone on the page background; frame B is the same
     page with the figure hidden too. It is document.body that gets hidden, not
     the fight body: toasts and damage floats live OUTSIDE the fight body, they
     appear and vanish on their own schedule, and hiding only the fight body
     left them free to diff. That mistake invented a steady 189px of boss ink
     below the arena at two viewports at once, which is what a toast low on the
     screen looks like when it is credited to a figure. The only thing that can differ between
     them is the figure, so no other element can contribute a pixel, and the
     arena's clip is lifted for both frames so the figure is measured at its
     true extent rather than at the edge that was cutting it. */
  const clip = await page.evaluate(sel => {
    const a = document.querySelector('.arena');
    const body = document.body;   /* the WHOLE page, so a toast or a damage float cannot differ between frames */
    const tgt = document.querySelector(sel);
    if (!a || !body || !tgt) return null;
    a.dataset.inkPrevOverflow = a.style.overflow || '';
    body.dataset.inkPrevVis = body.style.visibility || '';
    tgt.dataset.inkPrevVis = tgt.style.visibility || '';
    a.style.overflow = 'visible';
    body.style.visibility = 'hidden';      /* inherited by everything inside */
    tgt.style.visibility = 'visible';      /* except the one subtree we measure */
    const r = a.getBoundingClientRect();
    const M = 260;
    const x = Math.max(0, Math.round(r.left) - M), y = Math.max(0, Math.round(r.top) - M);
    return { x, y, width: Math.min(innerWidth - x, Math.round(r.width) + M * 2),
             height: Math.min(innerHeight - y, Math.round(r.height) + M * 2) };
  }, targetSel);
  if (!clip) return { px: 0, box: null };
  await sleep(140);
  const before = await page.screenshot({ clip, encoding: 'base64' });
  await page.evaluate(sel => { document.querySelector(sel).style.visibility = 'hidden'; }, targetSel);
  await sleep(140);
  const after = await page.screenshot({ clip, encoding: 'base64' });
  await page.evaluate(sel => {
    /* RESTORE WHAT WAS ACTUALLY HIDDEN. The setup stashes and hides
       document.body; this block used to restore document.querySelector
       ('.fight-body') from a dataset key that element never carried, so
       document.body was left at visibility:hidden for the rest of the run and
       .fight-body had its visibility set to the string "undefined". Nothing
       downstream screenshots, so it graded green, but every later check was
       reading a page that had been invisible since the first measurement, and
       the next inkOf call re-stashed 'hidden' as the value to restore to. */
    const a = document.querySelector('.arena'), body = document.body,
          tgt = document.querySelector(sel);
    a.style.overflow = a.dataset.inkPrevOverflow || ''; delete a.dataset.inkPrevOverflow;
    body.style.visibility = body.dataset.inkPrevVis || ''; delete body.dataset.inkPrevVis;
    if (tgt) { tgt.style.visibility = tgt.dataset.inkPrevVis || ''; delete tgt.dataset.inkPrevVis; }
  }, targetSel);
  const raw = await page.evaluate(async (a, b, thr) => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0);
    const db = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, px = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      /* 30 of summed RGB distance. Tuned against the real render: it keeps the
         figure and its drop shadow and drops the compression noise that makes
         two screenshots of an identical frame differ by 1 or 2 per channel. */
      if (Math.abs(da[i] - db[i]) + Math.abs(da[i+1] - db[i+1]) + Math.abs(da[i+2] - db[i+2]) > thr) {
        px++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return { px, cw: c.width, x0, y0, x1, y1 };
  }, before, after, 30);
  if (!raw.px) return { px: 0, box: null };
  const dpr = raw.cw / clip.width;
  return { px: raw.px, box: {
    top: +(clip.y + raw.y0 / dpr).toFixed(1), bottom: +(clip.y + (raw.y1 + 1) / dpr).toFixed(1),
    left: +(clip.x + raw.x0 / dpr).toFixed(1), right: +(clip.x + (raw.x1 + 1) / dpr).toFixed(1) } };
}
const overlap = (a, b) => (!a || !b) ? 0 : +Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)).toFixed(1);

const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srvHandle.url;
/* HEADLESS 'shell': inkOf() below screenshots, and page.screenshot never
   returns under headless 'new' on this Mac (godmode.js:484, and the gate's own
   note on hero-flash.mjs says the same). Measured here 2026-09-01: a bare run
   died in inkOf on a CDP timeout before grading a single row. */
const { browser, page } = await boot(base, { headless: process.env.HEADLESS_MODE || 'shell' });

/* ---- 1. tall phone: nothing falls off the bottom ---- */
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(async () => { await window.__denFight(1.6, 0); });
await sleep(1700);
await settle(page);
const tall = await page.evaluate(() => {
  /* End Turn lives BELOW the tray now, so the bottom of the fight is its row. */
  const act = (document.getElementById('fendrow') || document.querySelector('.fight-actions')).getBoundingClientRect();
  return { vh: innerHeight,
           actionsBottom: Math.round(act.bottom), belowActions: Math.round(innerHeight - act.bottom) };
});
/* WHERE "THE FIGHT PICTURE USES AT LEAST HALF THE SCREEN" WENT, AND WHY.
   That assertion stood here and read `arena + hud >= 50% of innerHeight`. It
   encoded a real instruction, Tom on 2026-08-09: "let's see how the pit looks
   taller ... maximize the height of a phone screen", given when the arena was
   258px on a 932px phone and 42% of the screen under the buttons was dead. It
   was right for that build.
   IT IS SUPERSEDED, by Tom on 2026-08-18, third report of the same complaint,
   from an iPhone 17 Pro Max: "you stil lcant ge three rows of buttons fully in
   the frame with your pit fix ? the fighting area is still the same height".
   The two cannot both hold. A 50% floor on the picture puts a ceiling of 564 on
   the arena's subtrahend, and because the arena was defined as "the viewport
   minus a constant", that ceiling WAS the tray: the tray measured the same
   149px at 393x852, 402x874 and 440x956 while the arena grew 300 -> 322 -> 404.
   Keeping the old rule would have kept forcing the fix back onto the number
   that could not move.
   So it is REPLACED, not deleted, by section 6 below, which pins what he asked
   for instead: three complete rows of moves, and a taller phone spending its
   extra height on the tray rather than on the boss. The 183px arena floor that
   protects the fighters from being shrunk to buy buttons is asserted there and
   in section 5, so nothing about the composition went unguarded in the trade.
   The two checks the old section shared with it survive unchanged. */
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
/* THE 258 FLOOR IS GONE, AND ITS REPLACEMENT MEASURES THE PICTURE.
   258 was a proxy: it asserted a container size and hoped the figures inside
   were therefore fine. It stopped tracking anything real twice over. The
   fighter rules were re-based onto the arena, so the arena's height no longer
   implies a figure height; and the HUD moved out of the arena, so the number
   the old check read is not the number it used to read. Worse, a proxy this
   loose passed a build in which the boss was rendering with his head cut off:
   at 375x667 against a mage den, 110.4px of a 262px figure was BEHIND an
   opaque HUD, and the arena was 292px, comfortably over 258, so this line was
   green while the screen was broken.
   What the check is FOR is composition: the fighters are inside the picture and
   nothing covers them. So that is what it asserts now, on measured ink rather
   than on stage boxes, at all three phone sizes. */
const COMPOSE = [[390, 844], [375, 667], [430, 932]];
for (const [W, H] of COMPOSE) {
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(500); await settle(page);
  /* the mage is the tall boss, and the tall boss is the whole point: an
     ordinary foe fits everywhere and would prove nothing about clipping. */
  await page.evaluate(() => document.querySelector('.sheet-close')?.click());
  await sleep(500);
  await page.evaluate(async () => { await window.__denFight(1.4, 0, { mage: true }); });
  await sleep(1800); await settle(page); await sleep(400);
  await page.addStyleTag({ content: '*,*::before,*::after{animation-play-state:paused !important;transition:none !important}' });
  await sleep(200);
  const frame = await page.evaluate(() => {
    const g = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
      return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1) }; };
    return { arena: g('.arena'), hud: g('.fight-hud') };
  });
  ok(`SETUP ${W}x${H}: there is an arena and a HUD to compose`, !!frame.arena && !!frame.hud,
    JSON.stringify(frame));
  if (!frame.arena || !frame.hud) continue;
  for (const [who, sel] of [['boss', '.fighterG.foe-side'], ['player', '.fighterG.you-side']]) {
    const ink = await inkOf(page, sel);
    /* an empty sample is a FAILURE, not a pass: no ink means either the figure
       never rendered or the diff is broken, and both must be loud. */
    ok(`SETUP ${W}x${H}: the ${who} put ink on the screen to measure`, ink.px > 0 && !!ink.box,
      `${ink.px} px of ink`);
    if (!ink.box) continue;
    const over = { top: +(frame.arena.top - ink.box.top).toFixed(1), bottom: +(ink.box.bottom - frame.arena.bottom).toFixed(1),
                   left: +(frame.arena.left - ink.box.left).toFixed(1), right: +(ink.box.right - frame.arena.right).toFixed(1) };
    const worst = Math.max(over.top, over.bottom, over.left, over.right);
    ok(`COMPOSE ${W}x${H}: the ${who}'s ink is fully inside the arena`, worst <= 0,
      worst > 0 ? `${worst}px outside (${JSON.stringify(over)})`
                : `${Math.abs(worst)}px is the tightest clearance (${JSON.stringify(over)})`);
    const hid = overlap(ink.box, frame.hud);
    ok(`COMPOSE ${W}x${H}: no part of the ${who} is behind the HUD`, hid === 0,
      hid > 0 ? `${hid}px of ink overlaps the HUD band (ink ${ink.box.top}..${ink.box.bottom}, hud ${frame.hud.top}..${frame.hud.bottom})`
              : `ink ${ink.box.top}..${ink.box.bottom}, hud ends ${frame.hud.bottom}`);
  }
}
await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(600); await settle(page);
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

/* ---- 5. QA round 26 O12: the versus card must not eat taps once it fades ----
   pointer-events auto in 29/29 samples, still swallowing at opacity 0.010 and 0:
   the fade at 1150ms and the removal at 1420ms never turned hit-testing off, so
   every tap for 1,391ms after FIGHT died on the card. The fix sets
   pointer-events none in the same tick the fade starts. Under webdriver the
   card is skipped (fast path), so __giForce puts it back the way batch-audit
   does for the gate intro, and the sample is taken at +200ms after the fade
   begins (1350ms after FIGHT): the card is still in the DOM at ~0 opacity.
   PROVE-RED: on main elementFromPoint over End Turn returns .vs-card and the
   click never reaches the button. Written 2026-09-04 on a static-only machine;
   not yet run. */
await page.evaluate(() => document.querySelector('.sheet-close')?.click());
await sleep(600);
const vsTap = await page.evaluate(async () => {
  window.__giForce = true;
  /* mode:'spar' overrides the seam's default mode:'boss', which takes the GATE
     INTRO branch and never builds a versus card. Spar is the Pit's own fight,
     the surface O12 was measured on. */
  window.__denFight(1.6, 0, { mode: 'spar' });     // fire-and-forget: we sample DURING the card
  await new Promise(r => setTimeout(r, 1350));     // fade started at 1150; card removed at 1420
  window.__giForce = false;
  const card = document.querySelector('.vs-card');
  const btn = document.getElementById('endTurn');
  if (!card) return { why: 'the versus card was not on screen at +1350ms (empty sample = failure)' };
  if (!btn) return { why: 'no End Turn under the card to tap' };
  const pe = getComputedStyle(card).pointerEvents;
  const r = btn.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  let received = false;
  btn.addEventListener('click', () => { received = true; }, { once: true, capture: true });
  hit?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  return { pe, hitIsCard: !!hit?.closest('.vs-card'), hitTag: hit ? (hit.id || hit.className) : null, received, opacity: getComputedStyle(card).opacity };
});
ok('O12 the fading versus card is pointer-events none', !vsTap.why && vsTap.pe === 'none', vsTap.why || JSON.stringify(vsTap));
ok('O12 a tap at +200ms into the fade reaches the control under the card', !vsTap.why && !vsTap.hitIsCard && vsTap.received, vsTap.why || JSON.stringify(vsTap));
await sleep(1200);

/* ---- 5. the smallest phone: the primary action is on screen WITHOUT scrolling
   and the fighters are not shrunk to buy it ----

   320x568 is an iPhone SE 1st gen and the small Androids. Measured on main
   before the fix, in a real den fight: .fight-body is 466px tall holding 520px
   of content, and End Turn's row rendered at 557.9 to 612.6, so 44.6px below the
   fold. What that turned out to NOT be is the interesting part and it is pinned
   here so nobody re-fixes the wrong thing: the body is already overflow-y:auto
   with 54px of range, and driving scrollTop to its maximum brought End Turn to
   503.9-558.6, fully visible. The button was never unreachable. It was below the
   fold on first paint, on the one screen where a player takes turns.
   So this section asserts BOTH halves of the answer, because either alone can be
   satisfied by the fix that was rejected. Shrinking the arena floor from 183 to
   129 puts End Turn on screen too, and it does it by making the fighters small
   on the devices with the least room to lose. */
for (const [W, H] of [[320, 568], [360, 640]]) {
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(800);
  await settle(page);
  const sm = await page.evaluate(() => {
    const body = document.querySelector('.fight-body');
    if (body) body.scrollTop = 0;                 /* first paint, not after a hunt */
    const end = document.getElementById('endTurn');
    const arena = document.querySelector('.arena');
    if (!end || !arena || !body) return null;
    const e = end.getBoundingClientRect(), a = arena.getBoundingClientRect();
    const tray = document.querySelector('.fight-actions');
    const moves = [...document.querySelectorAll('.fight-actions button')];
    return {
      vh: innerHeight, scrollTop: body.scrollTop,
      endTop: +e.top.toFixed(1), endBottom: +e.bottom.toFixed(1),
      arenaH: +a.height.toFixed(1),
      moves: moves.length,
      trayRange: tray ? tray.scrollHeight - tray.clientHeight : 0,
      /* CAN THE LAST MOVE ACTUALLY BE BROUGHT INTO VIEW. Written the obvious way
         first and it could not fail: comparing a button's offsetTop against the
         tray's own scrollHeight is true by construction, because scrollHeight is
         DEFINED as the box that contains the children. So drive the tray to the
         end of its scroll and ask whether the last button now fits inside the
         visible box. That fails the moment the tray is squeezed under one row,
         which is the real way this breaks on a short phone. */
      lastMoveInView: (() => {
        if (!tray || !moves.length) return false;
        tray.scrollTop = tray.scrollHeight;
        const last = moves[moves.length - 1].getBoundingClientRect();
        const t = tray.getBoundingClientRect();
        return last.top >= t.top - 1 && last.bottom <= t.bottom + 1;
      })(),
      trayH: tray ? +tray.getBoundingClientRect().height.toFixed(1) : 0,
    };
  });
  ok(`SMALL ${W}x${H}: the fight screen rendered something to measure`, !!sm && sm.moves > 0,
    sm ? `${sm.moves} move buttons, tray scroll range ${sm.trayRange}px` : 'no fight on screen');
  if (!sm) continue;
  ok(`SMALL ${W}x${H}: End Turn is fully on screen with the column unscrolled`,
    sm.scrollTop === 0 && sm.endBottom <= sm.vh + 1 && sm.endTop >= 0,
    `End Turn ${sm.endTop} to ${sm.endBottom} of ${sm.vh}, scrollTop ${sm.scrollTop}`);
  ok(`SMALL ${W}x${H}: the fighters keep their 183px floor, the button is not bought with them`,
    sm.arenaH >= 183, `arena ${sm.arenaH}px`);
  ok(`SMALL ${W}x${H}: the last move can be scrolled fully into the tray`, sm.lastMoveInView,
    `${sm.moves} buttons, tray ${sm.trayH}px, scroll range ${sm.trayRange}px`);
}

/* ---- 6. THE TRAY GETS THE SLACK, NOT THE ARENA ----

   THIS IS THE REPLACEMENT FOR THE >=50% RULE REMOVED FROM SECTION 1. Both
   instructions and both dates, so a future reader can see which one is live:
     2026-08-09  "maximize the height of a phone screen"          SUPERSEDED
     2026-08-18  "you stil lcant ge three rows of buttons fully in the frame
                  with your pit fix ? the fighting area is still the same
                  height"                                          LIVE
   Tom had raised the same thing three times ("the pit still doesnt have enough
   room for buttons", "make the pit so you can see three rows of three buttons
   and scroll below after that if needed", then the line above) and two fixes
   had missed, so the point of this section is to be the check that could have
   caught it rather than another one that grades the screen healthy.

   WHY EVERY EARLIER MEASUREMENT SAID IT WAS FINE: PUPPETEER HAS NO SAFE AREAS.
   This is anti-regression rule 4, verify where the failure can exist, and the
   fight screen depended on two environment properties nothing here modelled.
     --sab  env(safe-area-inset-bottom), 34px on a home-indicator iPhone.
            #fightBody used to carry an INLINE padding-bottom:10px, which beats
            the stylesheet, so this was the one surface in the app that threw
            the inset away. With contentInset:never in the Capacitor config,
            env() is the only thing holding content off the indicator.
     --sat  env(safe-area-inset-top), 59px on a Dynamic Island iPhone. The
            arena was sized off the raw viewport while it lives inside
            .sheet.full, which is calc(100dvh - var(--sat) - 24px), so the
            arena claimed 59px the sheet had already spent and the tray, the
            leftover, paid for it twice.
   Measured on v400 with both forced: three complete rows at 440x956 with no
   insets, TWO with them. That gap is the whole bug report. So this section
   forces both, and says out loud that it is an EMULATION of a real device, not
   a real device: it proves the layout arithmetic, and a real Pro Max is still
   the only thing that proves the render.

   DIRECTION AND BOUND (anti-regression rule 11), because "more tray" is a trend
   and a trend is not a check:
     ROWS     failure is FEWER than three complete rows of move buttons fully
              inside the tray box at rest. Three, not "some", and it cannot
              drift to two-and-a-half because a grid row's buttons share a
              height. Measured after the fix: 3 at 440x956, 3 at 393x852.
              Measured on v400 with the same insets: 2 and 2.
     FLOOR    failure is the arena falling UNDER 183px, the derived floor from
              app.css. This is the half of the old 50% rule worth keeping: it
              is what stops the next person buying rows by shrinking the boss,
              which is the fix Tom rejected on 2026-08-16. Bound, not trend:
              183 exactly, no percentage of anything.
     SLACK    failure is the 440x956 tray being NO TALLER than the 393x852 one.
              This is the assertion the old rule made impossible: under a
              subtrahend layout both measured 149px and every extra pixel of a
              bigger phone went to the boss. It is the difference of two
              measurements taken in the same run, so it cannot be satisfied by
              a build that merely got lucky on one viewport.
     CLEAR    failure is any part of the End Turn row rendering inside the
              bottom --sab band the OS paints its home indicator over. On v400
              24px of it did.
   393x852 is named deliberately as the LOWER bound of the class: it is the
   shortest Dynamic Island iPhone, so it is where three rows is hardest, and a
   rule that only held on Tom's 956px phone would be a rule fitted to one
   device. Below that height the 183px floor binds and the tray is expected to
   scroll, which Tom accepted for 320x568 explicitly; section 5 owns those. */
const SLACK_SIZES = [[440, 956, 59, 34, 'iPhone 17 Pro Max'], [393, 852, 59, 34, 'iPhone 15 Pro']];
const slack = [];
for (const [W, H, sat, sab, name] of SLACK_SIZES) {
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(500);
  await page.evaluate(() => document.querySelector('.sheet-close')?.click());
  await sleep(500);
  /* the emulated insets, injected on :root exactly where app.css declares them
     so every consumer in the sheet sees them */
  await page.evaluate((sat, sab) => {
    let s = document.getElementById('__insetEmu');
    if (!s) { s = document.createElement('style'); s.id = '__insetEmu'; document.head.appendChild(s); }
    s.textContent = `:root{--sat:${sat}px !important;--sab:${sab}px !important;}`;
  }, sat, sab);
  /* A LOADED TRAY OR NOTHING. A bare four-move fight fits at every viewport and
     would grade this screen healthy, which is exactly how the earlier fixes
     passed. Same seam and same build as fight-tray-audit and fight-hint-audit:
     a caster with three move talents plus brewed potions, 8 moves in a 3+3+2
     grid plus the ITEMS door. */
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.kvSet('talents', ['callcrows', 'peckeyes', 'murder', 'bonebolt']);
    await db.kvSet('potions', { 'vital-tonic': 3, 'fury-flask': 2 });
    window.__denFight(1.4, 0, { mage: true });
  });
  await page.waitForFunction(() => {
    const f = document.getElementById('factions');
    return f && !/is acting/i.test(f.textContent || '') && f.querySelectorAll('.fight-act').length >= 6;
  }, { timeout: 15000, polling: 50 }).catch(() => {});
  await sleep(900);
  await settle(page);
  /* Blank #toast rather than deleting it: `.toast` matches the app's one live
     region, and nextToast() re-reads it by id, so removing it throws on the next
     message. Same line, same fix, in fight-tray-audit, which has the measurement. */
  await page.evaluate(() => {
    document.querySelectorAll('#floats > *, .drop-veil').forEach(n => n.remove());
    const t = document.getElementById('toast');
    if (t) { t.textContent = ''; t.hidden = true; }
  });
  await sleep(200);

  const s = await page.evaluate(sab => {
    const tray = document.getElementById('factions');
    const arena = document.querySelector('.arena');
    const endrow = document.getElementById('fendrow') || document.querySelector('.fight-endrow');
    if (!tray || !arena) return null;
    const tr = tray.getBoundingClientRect();
    /* the ITEMS door spans all three columns and is not a row of moves, so it
       is excluded: Tom asked for three rows of three BUTTONS, and counting a
       full-width door as one of them would let a two-row tray grade green. */
    const moves = [...tray.querySelectorAll('button')].filter(b => !b.classList.contains('items'));
    const tops = [...new Set(moves.map(b => Math.round(b.getBoundingClientRect().top)))].sort((a, b) => a - b);
    const rows = tops.map(t => {
      const inRow = moves.filter(b => Math.abs(b.getBoundingClientRect().top - t) < 2);
      return { n: inRow.length, bottom: +Math.max(...inRow.map(b => b.getBoundingClientRect().bottom)).toFixed(1) };
    });
    const er = endrow ? endrow.getBoundingClientRect() : null;
    return {
      vh: innerHeight,
      sat: getComputedStyle(document.documentElement).getPropertyValue('--sat').trim(),
      sab: getComputedStyle(document.documentElement).getPropertyValue('--sab').trim(),
      arenaH: +arena.getBoundingClientRect().height.toFixed(1),
      trayH: +tray.clientHeight.toFixed(1),
      moves: moves.length,
      gridRows: rows.length,
      shape: rows.map(r => r.n).join('+'),
      rowsFull: rows.filter(r => r.bottom <= tr.bottom + 1).length,
      endUnderIndicator: er ? +Math.max(0, er.bottom - (innerHeight - sab)).toFixed(1) : null,
    };
  }, sab);

  /* an empty or thin sample is a FAILURE, never a pass (anti-regression rule 3):
     a tray that rendered four buttons cannot say anything about three rows. */
  ok(`SETUP ${W}x${H} (${name}): the loaded tray rendered enough moves to ask the question`,
    !!s && s.moves >= 8 && s.gridRows >= 3,
    s ? `${s.moves} moves in ${s.gridRows} grid rows (${s.shape}), insets --sat ${s.sat} / --sab ${s.sab} EMULATED` : 'no fight on screen');
  if (!s) continue;
  slack.push({ W, H, name, ...s });
  ok(`ROWS ${W}x${H} (${name}): three complete rows of moves are inside the tray at rest`,
    s.rowsFull >= 3,
    `${s.rowsFull} of ${s.gridRows} rows fully inside a ${s.trayH}px tray (${s.shape}), arena ${s.arenaH}px, floor is 3 rows`);
  ok(`FLOOR ${W}x${H} (${name}): the rows were not bought by shrinking the fighters`,
    s.arenaH >= 183, `arena ${s.arenaH}px against the 183px floor`);
  ok(`CLEAR ${W}x${H} (${name}): End Turn is out from under the home indicator`,
    s.endUnderIndicator === 0,
    `${s.endUnderIndicator}px of the End Turn row is inside the ${s.sab} indicator band`);
}
/* an empty sample here is a failure too: two viewports or the comparison below
   is meaningless. */
ok('SETUP: both phones in the class were measured, so the comparison means something',
  slack.length === 2, `${slack.length} of 2 measured`);
if (slack.length === 2) {
  const [big, small] = slack;
  ok('SLACK: a taller phone spends its extra height on the tray, not on the arena',
    big.trayH > small.trayH,
    `${big.W}x${big.H} tray ${big.trayH}px vs ${small.W}x${small.H} tray ${small.trayH}px ` +
    `(arena ${big.arenaH} vs ${small.arenaH}). Equal trays mean the arena ate the difference, which is the v400 bug.`);
}

await browser.close();
if (srvHandle) srvHandle.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);

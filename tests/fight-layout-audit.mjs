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
  const hud = document.querySelector('.fight-hud')?.getBoundingClientRect();
  const hudH = hud ? hud.height : 0;
  const pictH = a.height + hudH;
  return { vh: innerHeight, arenaH: Math.round(a.height), hudH: Math.round(hudH), pictH: Math.round(pictH),
           pct: Math.round(a.height / innerHeight * 100), pictPct: Math.round(pictH / innerHeight * 100),
           actionsBottom: Math.round(act.bottom), belowActions: Math.round(innerHeight - act.bottom) };
});
/* THE PICTURE, NOT ONE BOX OF IT. This read .arena alone, which was right only
   while the HUD lived inside the arena. The HUD is a sibling row now, so the
   same layout scores 47% measured that way and 57% measured honestly, and the
   assertion would have failed a change that took nothing away from the player. */
ok('the fight picture uses at least half the screen', tall.pictPct >= 50,
  `arena ${tall.arenaH} + hud ${tall.hudH} = ${tall.pictH}px = ${tall.pictPct}% of ${tall.vh}`);
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

await browser.close();
if (srvHandle) srvHandle.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);

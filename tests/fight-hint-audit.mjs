/* THE MOVE TRAY'S LABELS FIT ONE LINE.
   Tom, 2026-08-18: "fix the label wrapping".
   Measured on v399 with a loaded tray: the move NAMES were never the problem,
   they fit at 375 and up. It was the <small> hint, and a second line of it
   costs 13.5px, which is the whole difference between a 54.8px tray row and a
   68.3px one. Three rows of three need rowH*3 + 16, so 68.3 asks for 220.8px
   of a 208.4px tray and 54.8 asks for 180.4. One line of 10px text was the
   entire three-row question.
   This file is the guard on that, because the failure is silent: a hint written
   two words too long does not look broken in isolation, it just quietly takes a
   row off the bottom of the tray on every phone.

   PROVEN RED against origin/main v399 (33a2dc0): 8 of 8 move buttons at 393x852
   carried a two-line label there and the tray showed 6 of 8 moves.

   LINE COUNTING IS DONE ON TEXT NODES, not on the element box. Two wrong ways
   were tried first. Element height is inflated by the grid: .fight-act is a
   grid whose rows stretch, so a 13.5px line reads as 30.4px on a button that
   was stretched to match a taller neighbour, and every label grades as wrapped.
   Range.getClientRects() over the whole element counts the <span class=ap-pips>
   as its own line, because the pips sit at a different vertical offset from the
   text beside them, so Jab graded as two lines while rendering one. Ranging
   over the TEXT NODES only and collapsing by top is immune to both. */
import { boot, sleep, serveTree, dismissOverlays } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const { browser, page } = await boot(argv || srvHandle.url);

/* THE TRAY MUST BE LOADED. A bare four-move tray fits everywhere and would
   grade a broken screen healthy: it is the caster with three move talents and
   brewed potions that fills the grid, and that is the state the complaint came
   from. Same seam and same build as fight-tray-audit. */
async function openLoadedFight(page) {
  await dismissOverlays(page);
  await page.evaluate(() => document.querySelector('.sheet-close')?.click());
  await sleep(400);
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
  await sleep(1000);
}

const readTray = () => page.evaluate(() => {
  const lines = el => {
    if (!el) return 0;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const tops = new Set();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const box of r.getClientRects()) if (box.width > 0) tops.add(Math.round(box.top));
    }
    return tops.size;
  };
  const tray = document.querySelector('.fight-actions');
  if (!tray) return null;
  tray.scrollTop = 0;
  const tr = tray.getBoundingClientRect();
  /* the MOVE buttons: the full-width rows (SIGNATURE, ITEMS) span the grid and
     have a whole tray width to play with, so they are a different question */
  const moves = [...tray.querySelectorAll('button')].filter(b => getComputedStyle(b).gridColumn === 'auto');
  const rows = new Map();
  for (const b of moves) {
    const r = b.getBoundingClientRect();
    rows.set(Math.round(r.top), Math.max(rows.get(Math.round(r.top)) || 0, r.height));
  }
  return {
    trayH: +tr.height.toFixed(1),
    rowHs: [...rows.entries()].sort((a, b) => a[0] - b[0]).map(e => +e[1].toFixed(1)),
    hidden: tray.scrollHeight - tray.clientHeight,
    moves: moves.map(b => {
      const r = b.getBoundingClientRect();
      return {
        name: (b.querySelector('b')?.textContent || '').trim(),
        hint: (b.querySelector('small')?.textContent || '').trim(),
        nameLines: lines(b.querySelector('b')), hintLines: lines(b.querySelector('small')),
        h: +r.height.toFixed(1),
        inView: r.top >= tr.top - 1 && r.bottom <= tr.bottom + 1,
      };
    }),
    /* HOW MANY ROWS ARE VISIBLE, and how many the tray has ROOM for.
       Counting "rows holding exactly three" was the obvious form and it is
       wrong: this build offers 8 moves, so the rows are 3+3+2 and a tray
       showing every one of them scored 2. The claim is the capacity, so
       measure the capacity: the visible tray box against three rows plus the
       two gaps between them. */
    rowsVisible: (() => {
      const tops = new Set();
      for (const b of moves) { const r = b.getBoundingClientRect();
        if (r.top >= tr.top - 1 && r.bottom <= tr.bottom + 1) tops.add(Math.round(r.top)); }
      return tops.size;
    })(),
    movesVisible: moves.filter(b => { const r = b.getBoundingClientRect();
      return r.top >= tr.top - 1 && r.bottom <= tr.bottom + 1; }).length,
    roomForThreeRows: (() => {
      const rowH = Math.max(...moves.map(b => b.getBoundingClientRect().height));
      const gap = parseFloat(getComputedStyle(tray).rowGap) || 0;
      return { need: +(rowH * 3 + gap * 2).toFixed(1), have: +tray.clientHeight.toFixed(1) };
    })(),
  };
});

/* ---- 1. one line per label, on every phone the copy budget targets ---- */
for (const [W, H] of [[375, 667], [393, 852], [430, 932]]) {
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(400);
  await openLoadedFight(page);
  const t = await readTray();
  ok(`${W}x${H}: the tray rendered move buttons to measure`, !!t && t.moves.length >= 6,
    t ? `${t.moves.length} move buttons` : 'no tray');
  if (!t || !t.moves.length) continue;

  const wrapped = t.moves.filter(m => m.hintLines > 1 || m.nameLines > 1);
  ok(`${W}x${H}: every move label is one line`, wrapped.length === 0,
    wrapped.length ? wrapped.map(m => `"${m.name}"(${m.nameLines}L)/"${m.hint}"(${m.hintLines}L)`).join(', ')
                   : `${t.moves.length} buttons, rows ${JSON.stringify(t.rowHs)}`);

  /* the 44px floor from app.css: "8/7 plus a 44px floor keeps every button a
     legal tap target". Nothing here is allowed to buy a row with it. */
  const short = t.moves.filter(m => m.h < 44);
  ok(`${W}x${H}: every move button clears the 44px tap floor`, short.length === 0,
    short.length ? short.map(m => `"${m.name}" ${m.h}px`).join(', ') : `shortest ${Math.min(...t.moves.map(m => m.h))}px`);
}

/* ---- 2. the point of the exercise: three rows of three, no scrolling ----
   375x667 and 320x568 are NOT in this list and that is deliberate, not an
   oversight. Their trays are 140.4px and 96px, and three rows of the legal
   minimum button need 3*44 + 16 = 148, so neither can hold three rows without
   taking the room from the arena, which is a different argument with its own
   floor. One line of label is worth having there anyway: it took 375x667 from
   three visible moves to six. */
for (const [W, H] of [[393, 852], [430, 932]]) {
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(400);
  await openLoadedFight(page);
  const t = await readTray();
  if (!t) { ok(`${W}x${H}: tray present for the row count`, false); continue; }
  const r3 = t.roomForThreeRows;
  ok(`${W}x${H}: the tray has room for three rows of moves`, r3.have >= r3.need,
    `three rows need ${r3.need}px, the tray gives ${r3.have}px`);
  ok(`${W}x${H}: three rows of moves are visible with no scrolling, and none is cut off`,
    t.rowsVisible >= 3 && t.movesVisible === t.moves.length,
    `${t.rowsVisible} rows, ${t.movesVisible} of ${t.moves.length} moves visible, rows ${JSON.stringify(t.rowHs)} in a ${t.trayH}px tray`);
}

await browser.close();
if (srvHandle) srvHandle.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);

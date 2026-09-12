/* Round 2: SEAT formerly required a literal 96px bottom offset. That is
 * incorrect for measured seating. It now checks the fresh Crew toast reports
 * a geometrically clear seat after leaving the sheet/map. CLEAR and VISIBLE remain intact.
 * Historical reproduction notes below describe the earlier fixed-seat bug.
 */
/* A TOAST NEVER COVERS A CONTROL THE PLAYER IS BEING ASKED TO USE.
 *
 * THE BUG (R41-20). The welcome-kit toast fires 1.2s after onboarding ends
 * (js/app.js, `if (kit) setTimeout(...)`) and a brand-new player is five taps
 * from their first fight, so it arrives on top of the move tray it is not
 * talking about. Measured 2026-09-07 against a real fight, unfixed tree:
 *   375x667  toast 26.3,466 322.5x105 covered SIX move buttons, two of them
 *            whole: Jab 110.3x54.8 of a 110.3x54.8 button, Bone Spike
 *            110.3x40.3, plus 100px slices of Bone Bolt, Call the Murder, Peck
 *            the Eyes and Swing.
 *   393x852  toast 27.5,691.5 338x105 took 104.8x27.8 of Haymaker and
 *            116.3x27.8 of Bone Guard on a nine-move tray.
 *
 * HONEST LIMIT: the collision is a function of how tall the pill wraps and how
 * far down the tray the last row reaches, so it does not bite at every width in
 * every fight. On the unfixed tree CLEAR goes red at 375x667 every run; at
 * 393x852 with an eight-move tray the toast lands in the tray's empty tail
 * (691.5-756 against a last button ending at 678.8) and CLEAR stays green
 * there. Read the 393x852 row as a fence, not as a reproduction.
 *
 * THE FIX IS GENERAL, NOT THE PIT'S. Every sheet in this app puts its controls
 * at the bottom (the move tray, a shop's buy row, the Wardrobe's bar, every
 * .btn-row) and .toast's shipped seat is 96px off the bottom, so the collision
 * is structural. One rule in app.css moves the toast to a seat under the sheet
 * head while ANY sheet is open:
 *   body:has(#sheets .sheet) .toast { top: calc(var(--sat) + 110px); bottom: auto; }
 * Deferring the toast until the sheet closes was the other option on the table
 * and was rejected: most toasts in this app ARE a sheet's own feedback ("Not
 * enough coins", "Equipped"), and holding those back until the sheet closes
 * detaches the answer from the action.
 *
 * THE TOAST HERE IS THE REAL ONE. window.__toast is the webdriver-only seam onto
 * the module-scoped toast() in js/app.js, the same seam tests/toast-map-audit.mjs
 * drives, so the queue, the unhide and the toastin animation are the shipped
 * path. The message is the actual welcome-kit string from js/app.js.
 *
 * ROWS, per viewport
 *   CONTROL  a real fight is open and its tray is populated. Without it CLEAR
 *            could pass on an empty tray, which is a set of zero rectangles.
 *   VISIBLE  the toast is on the glass, full size, inside the viewport. CLEAR
 *            asserts a zero, and the cheapest fake zero is a toast flung off
 *            screen or collapsed to nothing.
 *   CLEAR    the settled toast intersects NONE of the fight's controls: every
 *            move button, the End Turn row, and the sheet's own Flee button
 *            (the seat is at the top now, so the escape hatch is the thing the
 *            fix could most plausibly break).
 * and once, globally
 *   SEAT     after closing the sheet, a fresh Crew toast clears its controls.
 *
 * PROVEN RED, 2026-09-07, one mutation per throwaway copy:
 *   CLEAR   delete the `body:has(#sheets .sheet)` rule from app.css
 *           -> FAIL at 375x667 with the six overlaps quoted above (green at
 *           393x852, see HONEST LIMIT).
 *   SEAT    make the override unconditional -> FAIL, Crew's toast is top-seated.
 *
 * Run: node tests/toast-sheet-audit.mjs [url]
 */
import { boot, serveTree, sleep, setWidth, dismissOverlays } from './godmode.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [[393, 852], [375, 667]];
const KIT = 'Welcome kit: 2 crates and a pet egg ready to hatch on your Bonehead, and 3 ingredients in the Kitchen: exactly one Bone Broth. Cook it.';

let fails = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) fails++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};
const fmt = r => (r ? `${r.x},${r.y} ${r.w}x${r.h}` : 'null');
const overlap = (a, b) => {
  const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return x > 0 && y > 0 ? { x: +x.toFixed(1), y: +y.toFixed(1) } : null;
};

let srv = null;
let target = process.argv[2] || process.env.URL;
if (!target) {
  srv = await serveTree(ROOT);
  target = srv.url;
  console.log(`no URL given: serving this tree at ${target} rather than grading production`);
}

const { browser, page } = await boot(target);

for (const [W, H] of SIZES) {
  await setWidth(page, W, H);
  await sleep(400);
  await dismissOverlays(page);

  /* A real fight through the seam tests/fight-tray-audit.mjs already uses, with
     talents so the tray carries a full nine moves. A day-one tray of four moves
     is a SMALLER target than the one a player grows into, so grading the small
     one would understate the collision. */
  const opened = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.kvSet('talents', ['callcrows', 'peckeyes', 'murder', 'bonebolt']);
    if (typeof window.__denFight !== 'function') return false;
    window.__denFight(1.4, 0, { mage: true });
    return true;
  });
  if (!opened) { ok(`CONTROL ${W}x${H}: a real fight is open with a populated tray`, false, 'no __denFight seam'); continue; }
  await sleep(3000);

  const m = await page.evaluate(async msg => {
    window.__toast(msg, 6000);
    await new Promise(r => setTimeout(r, 700));
    const rect = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
    const named = el => ({ label: (el.querySelector('b')?.textContent || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18), ...rect(el) });
    const t = document.querySelector('#toast');
    const tray = document.querySelector('#factions');
    const ctrls = [
      ...(tray ? [...tray.querySelectorAll('button')] : []),
      ...[...document.querySelectorAll('#fendrow button')],
      ...[...document.querySelectorAll('.sheet .sheet-head .sheet-close')],
    ].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map(named);
    return {
      vw: innerWidth, vh: innerHeight,
      toast: rect(t),
      toastHidden: !t || t.hidden || getComputedStyle(t).display === 'none' || getComputedStyle(t).visibility === 'hidden',
      moves: tray ? tray.querySelectorAll('button').length : 0,
      ctrls,
    };
  }, KIT);

  ok(`CONTROL ${W}x${H}: a real fight is open with a populated tray`,
    m.moves >= 4 && m.ctrls.length > m.moves,
    `${m.moves} move buttons, ${m.ctrls.length} controls in all`);
  ok(`VISIBLE ${W}x${H}: the toast itself is on the glass`,
    !m.toastHidden && !!m.toast && m.toast.w > 100 && m.toast.h > 20
    && m.toast.x >= 0 && m.toast.y >= 0 && m.toast.x + m.toast.w <= m.vw && m.toast.y + m.toast.h <= m.vh,
    `toast ${fmt(m.toast)} in ${m.vw}x${m.vh}`);

  const hits = m.toast ? m.ctrls.map(c => ({ c, o: overlap(m.toast, c) })).filter(r => r.o) : [];
  ok(`CLEAR ${W}x${H}: a live toast covers none of the fight's controls`,
    !!m.toast && hits.length === 0,
    hits.length
      ? `toast ${fmt(m.toast)} over ${hits.map(h => `${h.c.label} (${h.o.x}x${h.o.y} of ${h.c.w}x${h.c.h})`).join(', ')}`
      : `toast ${fmt(m.toast)} vs ${m.ctrls.length} controls`);

  await page.evaluate(() => document.querySelector('.sheet-close')?.click());
  await sleep(7200);   // the 6000ms toast has to expire or the next row reads its tail
}

/* SEAT: navigation after sheet close must measure the new controls. */
await setWidth(page, 393, 852);
await page.evaluate(() => { location.hash = '#/friends'; });
await sleep(2400);
const home = await page.evaluate(async () => {
  window.__toast('Logged.', 6000);
  await new Promise(r => setTimeout(r, 700));
  const t = document.querySelector('#toast');
  const b = t.getBoundingClientRect();
  return { clear: [...document.querySelectorAll('#screen button, #screen a[href], #screen input, #screen select, #screen summary, #screen [role="button"]')].every(el => { const r = el.getBoundingClientRect(), b = t.getBoundingClientRect(); const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); if (!hit || !el.contains(hit)) return true; const area = Math.max(0, Math.min(b.right, r.right) - Math.max(b.left, r.left)) * Math.max(0, Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top)); return !area || (r.height > 160 && area / (r.width * r.height) < .25); }), seat: +(innerHeight - b.bottom).toFixed(1), sheets: document.querySelectorAll('#sheets .sheet').length };
});
ok('SEAT a fresh clear seat is measured when no sheet is open',
  home.sheets === 0 && home.clear,
  `seat ${home.seat}px from the viewport bottom, ${home.sheets} sheets open`);

await browser.close();
if (srv) srv.close();
console.log(`\n${fails ? 'FAILED' : 'OK'}  toast-sheet-audit`);
process.exit(fails ? 1 : 0);

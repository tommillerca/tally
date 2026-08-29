/* THE TOAST DOES NOT LAND ON THE BONEYARD'S ACTION CARD.
 *
 * The defect, measured 2026-08-28 at 430x932: .toast sits at
 * `bottom: calc(var(--sab) + 96px)` (app.css), and on the Boneyard that is the
 * exact ground #mapAct stands on. Toast 30.1,771.5 369.8x64.5 over card
 * 14.0,787.8 402.0x64.0. The card is the one surface that says what you can do
 * right now ("Grab it" / "Slow down" / "Too fast to loot"), and the "Slow down"
 * nag from tooFastToAct() therefore hid the very card it was nagging about.
 *
 * The fix is one conditional rule in app.css: when a .map-act is VISIBLE the
 * toast's seat rises above it. Keyed on the card, not the route, because the
 * card hides itself unless something is in reach (or you are too fast), and an
 * empty Boneyard should keep the toast where every other screen has it.
 *
 * THE TOAST HERE IS THE REAL ONE. window.__toast is a webdriver-only seam onto
 * the module-scoped toast() in js/app.js (same pattern as __cosmeticTeaser and
 * friends), so the queue, the unhide and the toastin animation are all the
 * shipped path, not a hand-rolled `#toast.hidden = false`.
 *
 * ROWS
 *   CONTROL  the action card is up and populated, reached the honest way: six
 *            real geolocation fixes past MAX_LOOT_SPEED, the same drive
 *            tests/badge-centre-audit.mjs uses. Without this row CLEAR could
 *            pass on a hidden card, which is a rectangle nothing can hit.
 *   VISIBLE  the toast itself is on the glass, full size, inside the viewport.
 *            CLEAR asserts a zero (no intersection), and the cheapest way to a
 *            fake zero is a toast flung off screen or collapsed to nothing.
 *   CLEAR    the settled toast rect does not intersect the visible card rect.
 *   SEAT     on Today, where no .map-act exists, the toast still sits at its
 *            shipped 96px seat. This is the regression the fix could most
 *            easily cause: an override that leaks moves EVERY toast in the app.
 *
 * PROVEN RED, 2026-08-29, one mutation per throwaway cp -R copy:
 *   CLEAR  delete the `body:has(.map-act...)` rule from app.css
 *          -> FAIL, toast 771.5-836.0 intersects card 787.8-851.8
 *   SEAT   make the override unconditional (`.toast { bottom: ... }`)
 *          -> FAIL, Today's toast seat 158px instead of 96px
 *   VISIBLE hide #toast via injected CSS -> FAIL (and CLEAR stays green,
 *          which is exactly the vacuous pass VISIBLE exists to block)
 *
 * The map needs WebGL and a reachable tile host; on a machine without them the
 * Boneyard rows report UNPROVEN (exit 97), never a pass. SEAT runs regardless.
 *
 * Run: node tests/toast-map-audit.mjs [url]
 */
import { boot, sleep, serveTree, unproven, unprovenReport, exitFor, boneyardCapability } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) fails++;
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const base = process.argv[2] || null;
const srv = base ? null : await serveTree(ROOT);
const url = base || srv.url;
const { browser, page } = await boot(url, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await browser.defaultBrowserContext().overridePermissions(new URL(url).origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });

const fmt = r => r ? `${r.x},${r.y} ${r.w}x${r.h}` : 'null';
/* Fire the real toast, let toastin (250ms) finish, then read both rects in one
   evaluate so nothing moves between the two reads. */
const toastAndMeasure = msg => page.evaluate(async m => {
  window.__toast(m, 6000);
  await new Promise(r => setTimeout(r, 700));
  const rect = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const card = document.querySelector('.map-act');
  const t = document.querySelector('#toast');
  return {
    vh: innerHeight, vw: innerWidth,
    toast: rect(t),
    toastHidden: !t || t.hidden || getComputedStyle(t).display === 'none' || getComputedStyle(t).visibility === 'hidden',
    card: card && !card.hidden ? rect(card) : null,
    cardText: card && !card.hidden ? card.innerText.replace(/\s+/g, ' ').trim() : '',
  };
}, msg);
/* Between rows the queued toast has to expire, or the next row measures the
   tail of this one. 6000ms show + exit animation + slack. */
const drainToast = () => sleep(7200);
const intersects = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

/* ---- the Boneyard leg: real drive into the too-fast state ---- */
await page.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(2500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#screen button')].find(x => /open the map/i.test(x.textContent || ''));
  if (b) b.click();
});
await sleep(9000);
const mapUp = await page.evaluate(() => !!document.querySelector('#mapStage'));
let cap = null;
if (mapUp) {
  let lat = 49.2827;
  for (let i = 0; i < 6; i++) { lat += 0.0006; await page.setGeolocation({ latitude: lat, longitude: -123.1207 }); await sleep(1500); }
  await sleep(3000);
  const m = await toastAndMeasure("Slow down. You can't loot or fight from a moving vehicle.");
  ok('CONTROL the action card is up and populated', !!m.card && m.cardText.length > 0,
    m.card ? `${fmt(m.card)} "${m.cardText}"` : 'no visible .map-act after the drive');
  ok('VISIBLE the toast itself is on the glass', !m.toastHidden && !!m.toast && m.toast.w > 100 && m.toast.h > 20
    && m.toast.x >= 0 && m.toast.y >= 0 && m.toast.x + m.toast.w <= m.vw && m.toast.y + m.toast.h <= m.vh,
  `toast ${fmt(m.toast)} in ${m.vw}x${m.vh}`);
  ok('CLEAR a live toast does not intersect the visible action card',
    !!m.card && !!m.toast && !intersects(m.toast, m.card),
    `toast ${fmt(m.toast)} vs card ${fmt(m.card)}`);
  await drainToast();
} else {
  cap = await boneyardCapability(page);
  unproven('CONTROL the action card is up and populated', 'the map never came up on this machine');
  unproven('VISIBLE the toast itself is on the glass', 'the map never came up on this machine');
  unproven('CLEAR a live toast does not intersect the visible action card', 'the map never came up on this machine');
}

/* ---- SEAT: everywhere else the toast has not moved ---- */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(2200);
const home = await toastAndMeasure('Logged.');
const seat = home.toast ? +(home.vh - home.toast.y - home.toast.h).toFixed(1) : null;
/* 96px is the shipped seat (app.css .toast). --sab is 0 in this emulation, so
   the offset reads back as the literal. 2px of tolerance for rounding. */
ok('SEAT the toast keeps its shipped 96px seat when no card is visible',
  home.card === null && seat !== null && Math.abs(seat - 96) <= 2,
  `seat ${seat}px from the viewport bottom, card ${home.card ? 'VISIBLE (should not exist here)' : 'absent'}`);

await browser.close();
if (srv) srv.close();
console.log(`\n${fails ? 'FAILED' : 'OK'}  toast-map-audit`);
unprovenReport('toast-map-audit', cap);
process.exit(exitFor(fails));

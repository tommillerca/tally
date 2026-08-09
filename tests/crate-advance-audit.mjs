/* Crate reveal: does a TAP actually advance the pack?
 *
 * Tom, 2026-08-08: "the swipe and tap to see the next item is still glitchy as
 * fuck, it takes multiple tries to get to the next item. This friction cannot be
 * in our biggest dopamine hook."
 *
 * The thing that made this invisible for two rounds is that a mouse click lands
 * at exactly one pixel, so every desktop harness taps with dx === 0 and passes.
 * A thumb does not. It rolls a few pixels in both axes on the way down and up.
 * So this audit taps with REAL touch events and REAL drift, which is the only
 * version of the gesture that has ever failed.
 *
 * Fails if any tap in the sweep leaves the card sitting where it was.
 */
import { boot, sleep } from './godmode.js';

const base = process.argv[2] || 'http://127.0.0.1:8321/';
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? '  | ' + detail : ''}`);
  if (!pass) fails++;
};

const { browser, page } = await boot(base);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const cdp = await page.target().createCDPSession();

const openPack = async n => {
  await page.evaluate(count => {
    window.__crateForce = 1;
    const cards = Array.from({ length: count }, (_, i) => ({
      iconHtml: '<div style="width:120px;height:120px;background:#fd6857"></div>',
      name: `Test Item ${i + 1}`, rarity: 'common', kind: 'GEAR', stats: 'test',
    }));
    window.__packReveal(cards, {});
  }, n);
  await sleep(3200);
};

// a real thumb: presses, rolls a few px in BOTH axes, lifts
const thumbTap = async (x, y, driftX, driftY) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + driftX, y: y + driftY }] });
  await sleep(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(900);
};

const cardName = () => page.evaluate(() => document.querySelector('.pack-reveal .pc-name')?.textContent?.trim() || null);

await openPack(6);
const first = await cardName();
ok('SETUP the pack opened with a card on screen (an empty sample is a failure)', !!first, String(first));

const box = await page.evaluate(() => {
  const t = document.querySelector('.pack-tilt'); if (!t) return null;
  const r = t.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});
ok('SETUP the card is hit-testable', !!box, JSON.stringify(box));

/* The browser must never be allowed to claim this gesture. pan-y told it that
   vertical drags belong to the scroller, so a tap that drifted downward was
   cancelled mid-gesture and silently did nothing. */
const ta = await page.evaluate(() => {
  const t = document.querySelector('.pack-tilt');
  return t ? getComputedStyle(t).touchAction : null;
});
ok('TOUCH-ACTION the card owns its own gesture (not pan-y, which lets the browser cancel it)',
  ta === 'none', `touch-action: ${ta}`);

/* The sweep. 0px is the mouse case that always passed. Everything from 8px up is
   a normal thumb, and every one of those used to land in the 6-to-60px dead zone
   and do nothing. */
const DRIFTS = [[0, 0], [8, 4], [14, 9], [22, 3], [30, 14], [45, 6]];
const results = [];
for (const [dx, dy] of DRIFTS) {
  const before = await cardName();
  if (!before) { results.push({ dx, dy, advanced: false, note: 'no card' }); continue; }
  await thumbTap(box.x, box.y, dx, dy);
  const after = await cardName();
  results.push({ dx, dy, before, after, advanced: after !== before });
}
const stuck = results.filter(r => !r.advanced);
ok('TAP every realistic thumb tap advances the pack (no dead zone)',
  stuck.length === 0,
  stuck.length ? `stuck at drift: ${stuck.map(s => `${s.dx}x${s.dy}px`).join(', ')}` : `${results.length}/${results.length} advanced`);

await browser.close();
console.log(fails ? '\nCRATE ADVANCE AUDIT FAILED' : '\nCRATE ADVANCE VERIFIED');
process.exit(fails);

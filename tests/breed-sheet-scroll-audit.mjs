/* THE SCROLL ROOM FOR A STICKY BAR MUST NOT SIT AFTER THE STICKY BAR.
 *
 * Companion to tests/sheet-action-reachable-audit.mjs, which grades whether the
 * primary action can be TAPPED. This file grades the other half of the same
 * report, which that one cannot see: whether the sheet can be SCROLLED.
 *
 * Brock, 2026-08-14: "The breeding window is opening up weird. It first comes up
 * like this. I can only scroll up on it from the grey area under the window."
 *
 * Cause, measured at 375x667 with the warning mounted: openStable() set
 * `#stableBody { padding-bottom: 401px }` so `.cf-acts` could rise clear of the
 * `position:sticky; bottom:0` breed bar. But sticky only stays pinned while some
 * of its container is still below it, so 401px of padding AFTER the last child
 * un-stuck the bar. On origin/main that put the panel at 105..492, i.e. covering
 * the top of the sheet where the pets you are choosing between should be, and
 * left the 401px of emptiness as the only scrollable surface in the sheet. That
 * emptiness is Brock's "grey area under the window", and it is the only place a
 * swipe moved anything. The fix moves the same amount of room to the sibling
 * ABOVE the bar.
 *
 * PROVEN RED: on origin/main (19c3a99) this file exits 1 with GUTTER and SWIPE
 * red. The numbers there are padding-bottom 401px, a 410px gap under the bar at
 * full scroll, and a swipe on the sheet above the panel moving #stableBody
 * 0 -> 0. On the fix they are 20px, 29px and 0 -> 351.
 *
 * Usage: node tests/breed-sheet-scroll-audit.mjs
 */
import { boot, sleep, settle, setWidth, serveTree } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const VW = 375, VH = 667;
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
await setWidth(page, VW, VH);
await sleep(400);

/* THE WORST STATE, the one the players hit: two precious pets flagged, so
   .breed-warn mounts and the panel is at its tallest. Same recipe and the same
   reasons as sheet-action-reachable-audit.mjs's stable-breed driver. */
await page.evaluate(async () => {
  const l = await import('./js/loot.js');
  const { kvSet } = await import('./js/db.js');
  for (const sp of ['C1', 'C4', 'CX']) if ((await l.petInstances()).length < 3) await l.addPetInstance(sp, {});
  const list = await l.petInstances();
  await kvSet('petInst', list.map(x => ({ ...x, shiny: true, lineage: 0 })));
  await kvSet('petLvlSteps', Object.fromEntries(list.map(x => [x.iid, 500000])));
  await l.boneDustAdd(5000);
});
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1500);
await page.evaluate(() => document.getElementById('stableBtn')?.click());
await sleep(2200);
const picked = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const flag = () => document.querySelector('[data-breedsel]')?.click();
  const spin = () => {
    const dots = [...document.querySelectorAll('.cf-dots i')];
    const on = dots.findIndex(d => d.classList.contains('on'));
    dots[(on + 1) % Math.max(1, dots.length)]?.click();
  };
  if (document.querySelectorAll('.cf-card').length < 2) return 0;
  flag(); await wait(700); spin(); await wait(800); flag(); await wait(1100);
  return document.querySelectorAll('.cf-card.picked').length;
});
await settle(page);
const warn = await page.evaluate(() => !!document.querySelector('.breed-warn'));

/* AN EMPTY SAMPLE IS A FAILURE: if the pair and the warning are not there, every
   row below would be measuring a sheet that never reached the state under test. */
ok('SAMPLE the breeding pair is flagged and the warning is mounted (the state the report describes)',
  picked === 2 && warn, JSON.stringify({ picked, warn }));
if (picked !== 2 || !warn) { await browser.close(); srv.close?.(); process.exit(1); }

/* ---- GUTTER: no scrollable emptiness parked after the sticky bar ---- */
const gut = await page.evaluate(() => {
  const body = document.getElementById('stableBody');
  const bar = document.querySelector('.breed-bar.sticky');
  body.scrollTop = body.scrollHeight - body.clientHeight;
  const br = bar.getBoundingClientRect(), bo = body.getBoundingClientRect();
  return {
    padBottom: getComputedStyle(body).paddingBottom,
    padPx: parseFloat(getComputedStyle(body).paddingBottom) || 0,
    gapUnderBarAtFullScroll: Math.round(bo.bottom - br.bottom),
  };
});
/* 60px is well above the sheet's own 20px padding and far below the 401px that
   caused the report, so this discriminates without pinning an exact number. */
ok('GUTTER at full scroll nothing but the sheet\'s own padding sits below the breed bar',
  gut.gapUnderBarAtFullScroll < 60,
  `padding-bottom=${gut.padBottom}  gap under bar=${gut.gapUnderBarAtFullScroll}px`);

/* ---- SWIPE: the sheet scrolls where the content is, not only in a gutter ----
   Real touch events. A scrollTop write would pass on the broken build too, since
   the bug was never that #stableBody could not be scrolled programmatically, it
   was that no swipe a thumb could make reached it. */
await page.evaluate(() => { document.getElementById('stableBody').scrollTop = 0;
  document.querySelector('.breed-bar.sticky').scrollTop = 0; });
await sleep(300);
const box = await page.evaluate(() => {
  const bo = document.getElementById('stableBody').getBoundingClientRect();
  const pr = document.querySelector('.breed-bar.sticky').getBoundingClientRect();
  const cx = Math.round(bo.left + bo.width / 2);
  /* CLAMP THE START INTO THE WINDOW. The bar is ~387px tall and sticky-clamped,
     so its rect can begin BELOW the bottom of the viewport: measured panelTop
     713 in a 667px window on 2026-08-19, once the Stable grew by one row. The
     old `panelTop - 12` was then 34px off screen, elementFromPoint returned
     nothing, and touchStart touched nowhere, so this row went red saying the
     sheet does not scroll on a build where it scrolled 463px instead of 381.
     A thumb cannot reach y=701 on a 667px phone either, so the unclamped point
     was testing a gesture no player can make. Clamped, and the landing is
     asserted below so it can never silently drift off screen again. */
  const startY = Math.min(Math.round(pr.top) - 12, window.innerHeight - 12);
  const el = document.elementFromPoint(cx, startY);
  return { cx, top: Math.round(bo.top), startY,
    startOnSheet: !!(el && (el.id === 'stableBody' || el.closest('#stableBody'))),
    startTag: el ? el.tagName + (el.id ? '#' + el.id : '') : null,
    panelTop: Math.round(pr.top), panelBottom: Math.round(pr.bottom) };
});
ok('SWIPE the gesture starts on the sheet and inside the window (a start point off screen touches nothing and reads as "it does not scroll")',
  box.startOnSheet, JSON.stringify({ startY: box.startY, panelTop: box.panelTop, on: box.startTag }));
const swipe = async (x, y1, y2) => {
  await page.touchscreen.touchStart(x, y1);
  for (let i = 1; i <= 8; i++) await page.touchscreen.touchMove(x, y1 + (y2 - y1) * i / 8);
  await page.touchscreen.touchEnd();
  await sleep(600);
};
await swipe(box.cx, box.startY, box.top + 10);
const bodyAfter = await page.evaluate(() => Math.round(document.getElementById('stableBody').scrollTop));
ok('SWIPE a swipe on the sheet ABOVE the breed panel scrolls the sheet (the surface the report says did nothing)',
  bodyAfter > 0, `#stableBody 0 -> ${bodyAfter}  (panel occupies ${box.panelTop}..${box.panelBottom} of ${VH})`);

/* ---- COVER: Tom's 2026-08-10 report must stay fixed ----
   "the breeding popup is good but it covers the breed button when you swipe to
   another pet." The room moved, so prove it is still doing its job: there has to
   be a resting scroll position where the whole .cf-acts row is on screen AND not
   under the bar AND every one of its buttons hit-tests to itself. */
const cover = await (async () => {
  const max = await page.evaluate(() => { const b = document.getElementById('stableBody'); return b.scrollHeight - b.clientHeight; });
  const good = [];
  for (let off = 0; off <= max; off += 15) {
    await page.evaluate(o => { document.getElementById('stableBody').scrollTop = o; }, off);
    const r = await page.evaluate(() => {
      const acts = document.querySelector('.cf-acts'), bar = document.querySelector('.breed-bar.sticky');
      if (!acts || !bar) return null;
      const ar = acts.getBoundingClientRect(), br = bar.getBoundingClientRect();
      const btns = [...acts.querySelectorAll('.btn')].map(b => {
        const rr = b.getBoundingClientRect();
        const hit = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2);
        return !!hit && (hit === b || b.contains(hit));
      });
      return { fully: ar.top >= 0 && ar.bottom <= innerHeight, overlap: Math.round(Math.max(0, ar.bottom - br.top)),
        all: btns.length > 0 && btns.every(Boolean), actsTop: Math.round(ar.top), actsBottom: Math.round(ar.bottom), barTop: Math.round(br.top) };
    });
    if (r && r.fully && r.all && r.overlap === 0) good.push({ off, ...r });
  }
  return good;
})();
ok('COVER there is a scroll position where the whole .cf-acts row is on screen and clear of the breed bar (Tom, 2026-08-10)',
  cover.length > 0, cover.length ? `${cover.length} such offsets, first ${JSON.stringify(cover[0])}` : 'NONE: the bar covers the row at every offset');

await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nthe breeding sheet scrolls where its content is');
process.exit(fails.length ? 1 : 0);

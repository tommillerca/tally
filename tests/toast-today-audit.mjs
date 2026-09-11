/* THE TOAST DOES NOT LAND ON TODAY'S DOOR ROW, AND THE BONEHEAD HAS A SHADOW.
 *
 * Two defects Tom found in his own screenshots of live v575, both on Today,
 * both graded here because they share one render.
 *
 * 1. THE DOOR ROW. .toast sits at `bottom: calc(var(--sab) + 96px)` (app.css),
 *    which on Today is the exact ground the five room tiles stand on. Measured
 *    2026-09-11 at 375x812 on live: toast 672.0->716.3 over Trends / Backpack /
 *    Stable / Kitchen / The Pit at 653.0->719.0. A message covered the five
 *    doors that are the whole point of the screen.
 *    Fixed by anchoring the pill to the TOP on Today rather than nudging it up,
 *    because below the art every band on Today is a control (name+level
 *    557->627, doors 653->719, nav 738->804) and the widest gap is 24px, which
 *    a 44px pill cannot sit in. 165->425 is the only clear full-width run.
 *
 * 2. THE CONTACT SHADOW. Tom, 2026-09-11: "he is still clearly not down on the
 *    ground with his own shadow." .hero-cast.c-bh is the sole-line shadow
 *    measured in 2026-08 (centre lands on the soles within 1px), but it paints
 *    at z-index 1 while .hero-fade spans the whole scene at z-index 4, so the
 *    fade had been erasing the only ground cue the figure has. The element was
 *    in the DOM and measurable the whole time, which is why a geometry-only
 *    check never caught it: this row reads PIXELS. NOTE the first diagnosis
 *    (the fade was erasing it, raise the z-index) was measured FALSE: at
 *    z-index 5 the same alpha reads weaker, not stronger. The alpha is the
 *    whole fix and the stacking is untouched.
 *
 * ROWS
 *   VISIBLE  the toast is on the glass, full size, inside the viewport. CLEAR
 *            asserts a zero, and the cheapest fake zero is a toast flung off
 *            screen or collapsed to nothing.
 *   CONTROL  the five door tiles are present and hit-testable. Without this,
 *            CLEAR passes against a screen that never drew them.
 *   CLEAR    the settled toast rect intersects none of the door tiles.
 *   SHADOW   the shadow element actually PAINTS. Two frames of the same page,
 *            the element hidden then shown, differenced at its centre. Sampled
 *            from decoded screenshots, not getComputedStyle: the bug was a
 *            painted element that rendered nothing, so only pixels grade it.
 *            NOT a comparison against nearby ground: the first cut of this row
 *            did that and passed at 33.7% on the broken build, because
 *            .hero-char's own drop-shadow darkens that plate regardless.
 *
 * PROVEN RED, 2026-09-11, one mutation per throwaway cp -R copy:
 *   CLEAR   delete the `body:has(.screen--today)` rule from app.css
 *           -> FAIL, toast 672.0-716.3 intersects 5 tiles
 *   SHADOW  delete the v578 rule entirely (the exact live v575 state)
 *           -> FAIL, the element contributes 29.0%, under the 36% bar
 *   VISIBLE hide #toast via injected CSS -> FAIL
 *
 * Run: node tests/toast-today-audit.mjs [url]
 */
import { boot, sleep, serveTree, exitFor } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) fails++;
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};
const fmt = r => r ? `${r.x},${r.y} ${r.w}x${r.h}` : 'null';
const intersects = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

const base = process.argv[2] || null;
const srv = base ? null : await serveTree(ROOT);
const url = base || srv.url;
const { browser, page } = await boot(url);
const DPR = 2;
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
await sleep(4200);
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(2600);

/* The real toast: window.__toast is the webdriver seam onto the module-scoped
   toast() in js/app.js, so the queue, the unhide and toastin all run. */
const m = await page.evaluate(async () => {
  window.__toast('Tip: back up your log (Settings, Export)', 9000);
  await new Promise(r => setTimeout(r, 700));
  const rect = el => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const t = document.querySelector('#toast');
  const doors = [...document.querySelectorAll('#screen a, #screen button')]
    .filter(el => /^(Trends|Backpack|Stable|Kitchen|The Pit)/.test((el.textContent || '').trim()))
    .map(el => ({ label: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 12), r: rect(el) }))
    .filter(d => d.r.w > 20 && d.r.h > 20);
  const cast = document.querySelector('.hero-cast.c-bh');
  return {
    vw: innerWidth, vh: innerHeight,
    toast: rect(t),
    toastHidden: t.hidden || getComputedStyle(t).display === 'none' || getComputedStyle(t).visibility === 'hidden',
    doors,
    cast: cast ? rect(cast) : null,
  };
});

ok('VISIBLE the toast itself is on the glass',
  !m.toastHidden && m.toast.w > 100 && m.toast.h > 20 && m.toast.x >= 0 && m.toast.y >= 0
  && m.toast.x + m.toast.w <= m.vw && m.toast.y + m.toast.h <= m.vh,
  `toast ${fmt(m.toast)} in ${m.vw}x${m.vh}`);

ok('CONTROL Today drew its five door tiles', m.doors.length === 5,
  m.doors.length ? m.doors.map(d => `${d.label} ${fmt(d.r)}`).join(' | ') : 'no door tiles on the screen');

const hit = m.doors.filter(d => intersects(m.toast, d.r));
ok('CLEAR a live toast covers none of the door tiles', m.doors.length === 5 && hit.length === 0,
  hit.length ? `toast ${fmt(m.toast)} covers ${hit.map(h => h.label).join(', ')}` : `toast ${fmt(m.toast)}, doors from ${m.doors[0] ? m.doors[0].r.y : '?'}`);

/* ---- SHADOW: decoded pixels, same frame, side-by-side comparison ---- */
if (!m.cast) {
  ok('SHADOW the ground darkens under the soles', false, '.hero-cast.c-bh is not in the DOM');
} else {
  /* A/B THE ELEMENT ITSELF, not the ground under the figure.
     The first cut of this row compared the shadow's centre against clear ground
     200px to the side and passed at 33.7% on the BROKEN build, because
     .hero-char carries `drop-shadow(0 10px 12px rgba(0,0,0,.4))` and the scene
     a radial vignette, so the plate under the soles is darker whether or not
     .hero-cast paints at all. That row graded the figure's own filter and would
     have shipped the bug a second time.
     Two frames of the SAME page, the element hidden then shown, differenced at
     its centre, isolate this element's contribution and nothing else. On the
     live v575 stacking the element is fully covered by .hero-fade, so the two
     frames are identical and the delta is 0.
     Decoded in a THROWAWAY page via canvas, the no-dependency pattern
     boot-flash-audit and crate-exit-flicker-audit use. */
  const cy = Math.round((m.cast.y + m.cast.h / 2) * DPR);
  const cx = Math.round((m.cast.x + m.cast.w / 2) * DPR);
  const setCast = vis => page.evaluate(v => {
    document.querySelector('.hero-cast.c-bh').style.visibility = v;
  }, vis);
  await setCast('hidden'); await sleep(400);
  const without = await page.screenshot({ encoding: 'base64' });
  await setCast('visible'); await sleep(400);
  const with_ = await page.screenshot({ encoding: 'base64' });
  const probe = await browser.newPage();
  await probe.goto('data:text/html,<body></body>');
  const px = await probe.evaluate(async (a, b, cx, cy) => {
    const lumAt = async (data) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      /* Mean over a 9x9 patch, so one anti-aliased pixel cannot decide it. */
      let sum = 0, n = 0;
      for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) {
        const i = (y * c.width + x) * 4; sum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++;
      }
      return sum / n;
    };
    return { off: await lumAt(a), on: await lumAt(b) };
  }, without, with_, cx, cy);
  await probe.close().catch(() => {});
  const dip = px.off > 0 ? (px.off - px.on) / px.off : 0;
  /* 0.36 sits between the 29.0% the SHIPPED .55 alpha contributes (what Tom
     was looking at) and the 45.0% measured on the fix. Not a pinned alpha: any
     value that reads as contact rather than smudge clears it. */
  ok('SHADOW the contact shadow reads as contact, not a smudge', dip >= 0.36,
    `soles lum ${px.off.toFixed(1)} with the shadow element hidden, ${px.on.toFixed(1)} with it shown at ${cx},${cy}; the element contributes ${(dip * 100).toFixed(1)}%`);
}

await browser.close();
if (srv) srv.close();
console.log(`\n${fails ? 'FAILED' : 'OK'}  toast-today-audit`);
process.exit(exitFor(fails));

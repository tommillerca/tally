/* THE TOP OF THE BONEHEAD SCREEN IS ONE COLOUR.
 *
 * Tom, 2026-09-07, from a screenshot of the live app on his own iPhone: "ive
 * noticed this top sliver recently a couple times sometimes it goes away i
 * think after an update but looks glitchy". A black band across the full width,
 * a few tens of points down from the top, with the top two rounded corners and
 * the warm amber top edge of a card clipped inside it, and CORRECT hero green
 * both above and below it.
 *
 * WHAT IT WAS. `#updBanner` is an in-flow sibling that sits between
 * `.today-plate` and `.hero-card` and is EMPTY almost always: checkForUpdate()
 * only fills it when version.json says the live build is ahead of the running
 * one. That is the whole of the intermittency, and it is why an update makes it
 * go away.
 *
 * The hero's bleed under the island is a negative `margin-top: calc(-1*(--sat +
 * 14px))` on `.hero-scene`, which collapses out through `.hero-card` and lands
 * the art at y=0 -- but ONLY while nothing above it has height. Measured at
 * 393x852, --sat 59, with the banner mounted:
 *     #updBanner   73 -> 152.9   (79.9 tall)
 *     .hero-scene  91.9          (= 73 + 79.9 + 12 - 73)
 * so the banner is 79.9px tall and 18.9px of it is left over; the hero paints
 * opaquely over the rest. The band is `.today-plate::before`, the page backdrop
 * at rgb(13,12,18), in the 18.9px the hero no longer covers, with the banner's
 * amber top edge on it. Not a fade, not a gap: an overlap.
 *
 * SO THE ROWS ARE THE TWO HALVES OF THAT, AND BOTH STATES ARE GRADED.
 *   TOP  the hero's box still reaches the top of the viewport. Geometry, and it
 *        is the row that goes red the moment anything with height is put above
 *        the hero again.
 *   INK  and the strip above the currency chips carries NO page-background
 *        pixels. Pixels rather than boxes, because TOP can be satisfied by a
 *        hero that reaches y=0 while something else paints over it, and because
 *        the band Tom photographed is a colour, not a rectangle.
 *   BANNER is the positive control: the stale rows are worthless unless the
 *        banner really mounted, and a fix that simply deletes the banner would
 *        pass every other row here.
 *
 * PROVEN RED, 2026-09-07, on this tree with the fix reverted (i.e. `<div
 * id="updBanner"></div>` back above `.hero-card`), exit code read from a file:
 *   FAIL TOP 393x852-sat0-stale   the hero reaches the top of the viewport
 *        hero top 91.9, ceiling 0.5
 *   FAIL INK 393x852-sat0-stale   no page-background pixels above the chips
 *        144 of 408 px are rgb(13,12,18)+-18
 *   FAIL TOP 393x852-sat59-stale  the hero reaches the top of the viewport
 *        hero top 91.9, ceiling 0.5
 *   FAIL INK 393x852-sat59-stale  no page-background pixels above the chips
 *        40 of 644 px are rgb(13,12,18)+-18
 * The two fresh configurations are green on both trees, which is the control
 * that says this file grades the banner's presence and not the screen at large.
 *
 * Run: node tests/top-strip-audit.mjs [baseUrl]
 */
import { boot, seed, settle, sleep, serveTree, exitFor } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv[2] || process.env.URL;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srv = argv ? null : await serveTree(ROOT);
const base = argv || srv.url;
const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};

/* rgb(13,12,18) is --bg, the page backdrop .today-plate paints. The tolerance
   covers the grain the plate's ::after blends over it (soft-light at 50%), which
   moves single pixels by a few counts and nothing like the distance to the
   hero's olive. */
const BG = [13, 12, 18];
const BG_TOL = 18;

const { browser, page } = await boot(base);
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await seed(page, { level: 54, coins: 1240, dust: 380 });
await sleep(800);

/* THE STALE STATE IS DRIVEN, NOT WAITED FOR. version.json is the killswitch
   stamp checkForUpdate() asks the network for, so answering it with a build
   ahead of this one is exactly the state a player on an old build is in. */
let stale = false;
await page.setRequestInterception(true);
page.on('request', r => {
  if (stale && r.url().includes('version.json')) {
    return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 'tally-v99999' }) });
  }
  r.continue().catch(() => {});
});

async function inject(page, css) {
  return page.evaluate(c => {
    const s = document.createElement('style');
    s.dataset.audit = '1'; s.textContent = c;
    document.head.appendChild(s);
  }, css);
}
const unInject = page => page.evaluate(() => document.querySelectorAll('style[data-audit]').forEach(s => s.remove()));

for (const sat of [0, 59]) {
  for (const isStale of [false, true]) {
    const tag = `393x852-sat${sat}-${isStale ? 'stale' : 'fresh'}`;
    console.log(`\n---- ${tag} ----`);
    stale = isStale;
    await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await unInject(page);
    if (sat) await inject(page, ':root{--sat:59px !important}');
    /* Away and back, because checkForUpdate only runs when Today RENDERS, and
       the app is already on Today. */
    await page.evaluate(() => { location.hash = '#/pit'; });
    await sleep(900);
    await page.evaluate(() => { location.hash = '#/today'; });
    await sleep(2200);
    await settle(page);
    await page.evaluate(async () => {
      await Promise.all([...document.querySelectorAll('#screen img')].map(i => i.decode().catch(() => {})));
    });
    await sleep(400);

    const geo = await page.evaluate(() => {
      const box = q => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), h: +r.height.toFixed(1) }; };
      const sc = document.getElementById('screen');
      return {
        today: !!(sc && sc.classList.contains('screen--today')),
        scene: box('.hero-scene'),
        chips: box('.hero-top'),
        banner: box('.upd-banner'),
      };
    });

    ok(`SETUP ${tag} Today rendered with its hero on it`, !!(geo.today && geo.scene && geo.chips),
      `today ${geo.today}, scene ${geo.scene ? geo.scene.top : 'absent'}, chips ${geo.chips ? geo.chips.top : 'absent'}`);
    ok(`BANNER ${tag} the update banner is ${isStale ? 'mounted' : 'absent'}`, !!geo.banner === isStale,
      geo.banner ? `banner ${geo.banner.top} -> ${geo.banner.bottom}` : 'no banner');
    if (!geo.scene || !geo.chips) continue;

    ok(`TOP ${tag} the hero reaches the top of the viewport`, geo.scene.top <= 0.5,
      `hero top ${geo.scene.top}, ceiling 0.5`);

    /* One pixel wide, 6px in from the LEFT EDGE, from y=0 to the top of the
       currency chips: the strip Tom photographed, and the strip the hero's
       upward bleed exists to fill. Screenshotted rather than reasoned about,
       because what he saw is what the compositor put there.
       SIX AND NOT THE MIDDLE, and that is a measurement. The banner is inset by
       --pad (16px) and its own fill is a translucent amber over the backdrop, so
       a column down the centre of the screen reads rgb(45,38,25)-ish inside the
       band and never touches --bg: run at x=196 the INK row stayed green on the
       broken tree while TOP was red. Outside the card's inset the band is the
       raw page backdrop, which is the black Tom saw. */
    const h = Math.max(6, Math.round(geo.chips.top));
    const b64 = await page.screenshot({ clip: { x: 6, y: 0, width: 1, height: h }, encoding: 'base64' });
    const px = await page.evaluate(async (b64) => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      return [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data];
    }, b64);
    const n = px.length / 4;
    let dark = 0;
    for (let i = 0; i < n; i++) {
      const [r, g, b] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
      if (Math.abs(r - BG[0]) <= BG_TOL && Math.abs(g - BG[1]) <= BG_TOL && Math.abs(b - BG[2]) <= BG_TOL) dark++;
    }
    ok(`INK ${tag} no page-background pixels above the chips`, n >= 12 && dark === 0,
      `${dark} of ${n} px are rgb(${BG})+-${BG_TOL}`);
  }
}

ok('PAGE no page errors', errs.length === 0, errs.join(' | '));
console.log(`\n${fails.length ? 'FAILS: ' + fails.join(', ') : 'ALL PASS'}`);
await browser.close();
if (srv) srv.close();
process.exit(exitFor(fails.length));

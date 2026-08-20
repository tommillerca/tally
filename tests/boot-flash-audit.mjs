/* THE FIRST FRAME IS NEVER BARE FURNITURE.
 *
 * Tom, 2026-08-19: "i noticed when the app boots up before it shows the loading
 * screen it always flashes an empty today tab with the bottom bar visible, this
 * looks amateurish as a first impression."
 *
 * WHAT IT WAS. #tabbar and #gearBtn are STATIC MARKUP in index.html and nothing
 * gated them. app.css gates the SCREEN (`.screen:not(.screen-in) { opacity: 0 }`)
 * and the splash is built in JS by showSplash(), so on every single boot the
 * furniture painted the instant the stylesheet parsed, and the loading screen
 * could not arrive until the whole module graph had downloaded, parsed and run.
 * HTML always beats a JS-built element, so the flash was not a race that
 * sometimes went the wrong way: it went the wrong way every time, which is why
 * Tom said "always". Captured here at 440x956 and 393x852, cold and warm, x1 and
 * x4 CPU: the first painted state was bare furniture over an empty screen in all
 * six runs. Cold 440 x1: first paint 48ms, splash covered it at 109ms.
 * The fix is in app.css (`#screen:empty ~ #tabbar`), with a CSS-only 8s failsafe
 * so a boot that never renders degrades to today's picture instead of to black.
 *
 * HOW IT IS GRADED, and why not a CSS box. tally/CLAUDE.md: assert PIXELS. A
 * computed style would read "hidden" off a frame nobody captured, which is how
 * v245 shipped an invisible punch. So this drives a real navigation with the CDP
 * screencast already running and reduces every captured frame to two numbers:
 *
 *   lime   pixels of the accent colour in the BOTTOM 12% of the frame. The FAB
 *          is a lime rounded square in the middle of the tab bar and nothing
 *          else down there is that colour, so this IS "the tab bar is painted".
 *   edge   percentage of sampled pixel pairs in the TOP 85% that differ. The
 *          app's ground is a smooth gradient, so an empty screen scores ~0 and
 *          anything actually rendered scores percent.
 *
 * A BAD frame is lime present AND the screen above it empty: bare furniture.
 * Measured on this tree, every frame of every run:
 *                              bad frames   lime on a bad frame   edge on it
 *   pristine origin/main            1 - 2                 720          0.16 %
 *   this branch                         0                   -             -
 * and for scale, the leanest frame WITH content scored edge 2.0%, the richest
 * 21.4%. The thresholds (lime >= 200, edge < 1.0%) sit in the middle of a gap
 * with no overlap in either direction.
 *
 * THE BOUND IS ZERO, NOT A TREND (anti-regression rule 11). Not "fewer bare
 * frames than before": no captured frame anywhere in the boot may be one.
 *
 * THREE CONTROLS, BECAUSE A CHECK THAT CANNOT FAIL IS NOT A CHECK:
 *   SAMPLE    frames were captured at all, and one of them landed at or before
 *             the moment #screen first got content. Without that, the run could
 *             not have contained the bug and a green means nothing.
 *   DETECTOR  some frame in the run scores lime >= threshold AND edge >= floor,
 *             i.e. a real screen with a real tab bar on it. A lime detector that
 *             never fires would pass every run while grading nothing.
 *   FAILSAFE  with a module blocked so the app can never render, the furniture
 *             must come back ON ITS OWN before index.html's 12s dead-shell
 *             reload. This is anti-regression rule 8 as an assertion: whatever
 *             hides the shell must own un-hiding it, and never defaulting to
 *             silence is not optional.
 * plus NAVIGATION, which is the regression the fix could most easily introduce:
 * route() strips `screen-in` on every tab change, so a gate written against that
 * class would blink the tab bar out on every navigation. Real mouse click, and
 * the bar's effective visibility is sampled on every frame across it.
 *
 * NO SWIFTSHADER. Measured on this Mac against this tree, first-paint:
 * shell + --use-angle=swiftshader 1900ms, shell with no gpu flags 36ms,
 * shell + --disable-gpu 24ms. The software rasteriser costs longer than the
 * entire boot, so every early frame is swallowed and the capture shows an app
 * that is already up. Boot paints no canvas and no WebGL, so nothing needs it.
 * The compositor is warmed with one throwaway document first and an empty
 * warm-up is a hard error, because capturing through a dead compositor is
 * exactly how this measurement went wrong the first time.
 *
 * THE CLOCK IS DRIVEN, NOT WAITED ON. At x1 on this Mac the whole window is one
 * or two frames wide, which is thin enough that a prove-red could miss it. The
 * graded loads run at CPU x6 (measured: first paint 96ms, content at 481ms, so
 * ~20 frames of window), which is also the honest model of the phone Tom is
 * holding: same bytes, slower CPU.
 *
 * Usage: node tests/boot-flash-audit.mjs [baseUrl]   (serves this repo if omitted)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, serveTree, sleep, chromePath, sandboxArgs } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
const srv = argUrl ? null : await serveTree(ROOT);
const base = (argUrl || srv.url).replace(/\/?$/, '/');

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

/* Measured on this tree; see the header table. The gap between a bare-furniture
   frame (lime 720, edge 0.16%) and the leanest real screen (edge 2.0%) is wide
   in both directions, so neither number is a knife edge. */
const LIME_MIN = 200;
const EDGE_FLOOR = 1.0;
/* 3, NOT 8, AND LOWERING IT DOES NOT WEAKEN THIS AUDIT.
   8 flaked: a cold boot on this tree reaches content in ~130ms, so the whole
   window is about eight frames at 60fps and the capture legitimately returned
   5 and 7 on consecutive runs. It is also a HARD GATE (the early return below),
   so a flaky low count did not just fail, it SKIPPED the real grading entirely,
   which is the worst possible combination: red for a reason that is not the app,
   and silent about the reason it exists.
   The genuine anti-vacuous guard is the row underneath it, which requires at
   least one painted frame BEFORE #screen had content. That is what makes the
   FLASH row impossible to pass by capturing nothing, and it is strictly better
   than a raw frame count because it asserts the frames are the RIGHT frames.
   3 still refuses an empty or one-frame capture. This repo's own note applies:
   a guard that cries wolf gets deleted. */
const MIN_FRAMES = 3;
const FAILSAFE_MS = 8000;   // app.css `#screen:empty ~ #tabbar` animation delay
const RELOAD_MS = 12000;    // index.html's dead-shell recovery

const puppeteer = await loadPuppeteer();
const launch = () => puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'shell',
  executablePath: chromePath(),
  args: [...sandboxArgs(), '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});

/* Decode a screenshot and reduce it to the two numbers this audit grades on.
   Done in a THROWAWAY page, not in the page under test: that one is mid-boot and
   is the subject of the measurement. Same canvas approach as
   crate-exit-flicker-audit.mjs, so no image dependency is needed. */
const measurePage = async browser => {
  const p = await browser.newPage();
  await p.goto('data:text/html,<body></body>');
  return {
    close: () => p.close().catch(() => {}),
    measure: b64 => p.evaluate(async data => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const W = c.width, H = c.height;
      const d = g.getImageData(0, 0, W, H).data;
      const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
      // the FAB's lime, in the bottom band the tab bar occupies
      let lime = 0;
      for (let y = Math.floor(H * 0.88); y < H; y += 2)
        for (let x = 0; x < W; x += 2) {
          const [r, gg, b] = at(x, y);
          if (gg > 180 && r >= 130 && r <= 235 && b < 120) lime++;
        }
      // how much is DRAWN above it: the ground is a smooth gradient, content is not
      let edges = 0, tot = 0;
      for (let y = 0; y < Math.floor(H * 0.85); y += 3)
        for (let x = 0; x + 2 < W; x += 3) {
          const a = at(x, y), c2 = at(x + 2, y);
          tot++;
          if (Math.abs(a[0] - c2[0]) + Math.abs(a[1] - c2[1]) + Math.abs(a[2] - c2[2]) > 24) edges++;
        }
      return { lime, edge: (edges / Math.max(tot, 1)) * 100 };
    }, b64),
  };
};

/* Effective visibility, read at paint time rather than off a CSS box alone: the
   computed values here are the ANIMATED ones, which is the whole point when the
   thing being graded is a keyframe with a fill mode. */
const VIS_FN = `(el => {
  if (!el) return false;
  const c = getComputedStyle(el);
  if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0;
})`;

/* ---- one graded boot -------------------------------------------------------- */

async function gradedBoot({ tag, W, H, warm, cpu = 6 }) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

    if (warm) {
      /* A RETURNING PLAYER: one controlled load, the worker installed, data on
         disk. js/app.js only registers sw.js over https, so register it here the
         way offline-boot-audit.mjs does; 127.0.0.1 is a secure context, so it is
         the same worker running the same install the live site runs. */
      await page.goto(base + '?demo', { waitUntil: 'networkidle2', timeout: 60000 });
      const inst = await page.evaluate(async () => {
        try {
          await navigator.serviceWorker.register('sw.js', { scope: './' });
          await navigator.serviceWorker.ready;
          for (let i = 0; i < 150 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 200));
          let n = 0; for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length;
          return { controlled: !!navigator.serviceWorker.controller, cached: n };
        } catch (e) { return { err: String(e) }; }
      });
      ok(`${tag}: SETUP the worker installed and precached (a cold run wearing a warm label would grade the wrong state)`,
        !inst.err && inst.controlled && inst.cached > 80, inst.err || `controlled=${inst.controlled} ${inst.cached} entries`);
      await sleep(2500);
    }

    /* When #screen first has content, recorded from inside the page on rAF. The
       graded window is everything up to this moment; without it there is no way
       to tell "no bare frames" from "the capture started too late". */
    await page.evaluateOnNewDocument(() => {
      window.__firstKid = null;
      const tick = () => {
        const s = document.getElementById('screen');
        if (s && s.children.length) { if (window.__firstKid === null) window.__firstKid = Math.round(performance.now()); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    const cdp = await page.createCDPSession();
    const frames = [];
    cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
      frames.push({ data, t: metadata.timestamp * 1000 });
      try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch { /* stopped */ }
    });
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });

    await page.goto('data:text/html,<body style="background:#123456">warm</body>');
    for (let i = 0; i < 120 && !frames.length; i++) await sleep(50);
    ok(`${tag}: SETUP the compositor produces frames at all (an empty warm-up means every result below is about nothing)`,
      frames.length > 0, `${frames.length} throwaway frame(s)`);
    if (!frames.length) return;
    frames.length = 0;

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await page.goto(base + (warm ? '?demo' : ''), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await sleep(3500);
    await cdp.send('Page.stopScreencast').catch(() => {});
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
    await sleep(200);

    const marks = await page.evaluate(() => ({
      origin: performance.timeOrigin,
      firstKid: window.__firstKid,
      fp: (performance.getEntriesByType('paint')[0] || {}).startTime ?? null,
    })).catch(() => ({ origin: 0, firstKid: null, fp: null }));

    const shots = frames
      .map(f => ({ data: f.data, ms: Math.round(f.t - marks.origin) }))
      .sort((a, b) => a.ms - b.ms);

    ok(`${tag}: SAMPLE the boot was actually captured`, shots.length >= MIN_FRAMES,
      `${shots.length} frames (need ${MIN_FRAMES})`);
    ok(`${tag}: SAMPLE the app rendered, so there is a "before content" to grade`,
      typeof marks.firstKid === 'number', `#screen first had content at ${marks.firstKid}ms, first paint ${Math.round(marks.fp ?? -1)}ms`);
    if (shots.length < MIN_FRAMES || typeof marks.firstKid !== 'number') return;

    const before = shots.filter(s => s.ms <= marks.firstKid);
    ok(`${tag}: SAMPLE at least one painted frame landed BEFORE the app had content (else this run could not contain the bug)`,
      before.length > 0, `${before.length} of ${shots.length} frames at or before ${marks.firstKid}ms`);
    if (!before.length) return;

    const mp = await measurePage(browser);
    const scored = [];
    for (const s of shots) scored.push({ ms: s.ms, ...(await mp.measure(s.data)) });
    await mp.close();

    const withBar = scored.filter(s => s.lime >= LIME_MIN);
    const real = withBar.filter(s => s.edge >= EDGE_FLOOR);
    ok(`${tag}: DETECTOR a real screen with a real tab bar was seen (a detector that never fires would pass everything)`,
      real.length > 0,
      `${withBar.length} frames scored lime>=${LIME_MIN}, ${real.length} of them over content; best lime=${Math.max(0, ...scored.map(s => s.lime))}, best edge=${Math.max(0, ...scored.map(s => s.edge)).toFixed(1)}%`);

    /* THE ASSERTION. Zero, not fewer. */
    const bare = scored.filter(s => s.lime >= LIME_MIN && s.edge < EDGE_FLOOR);
    ok(`${tag}: FLASH no painted frame shows the tab bar over an empty screen`,
      bare.length === 0,
      bare.length
        ? `${bare.length} bare frame(s): ${bare.slice(0, 5).map(b => `${b.ms}ms lime=${b.lime} edge=${b.edge.toFixed(2)}%`).join(', ')}`
        : `${scored.length} frames graded, ${before.length} of them before content`);
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ---- the failsafe: hiding must never mean silence --------------------------- */

async function failsafePass() {
  const tag = 'FAILSAFE';
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 440, height: 956, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    /* Kill the module graph the same way dead-shell-audit.mjs does. app.js is a
       module, so one missing file means it never executes and #screen stays
       empty forever: the exact state the hide must not make permanent. */
    await page.setRequestInterception(true);
    page.on('request', r => {
      if (/\/js\/haptics\.js/.test(r.url())) r.abort('failed').catch(() => {});
      else r.continue().catch(() => {});
    });
    let navs = 0;
    page.on('framenavigated', f => { if (f === page.mainFrame()) navs++; });
    await page.goto(base + '?demo', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

    const probe = () => page.evaluate(`(async () => {
      const s = document.getElementById('screen');
      const vis = ${VIS_FN};
      return { kids: s ? s.children.length : -1, tabbar: vis(document.getElementById('tabbar')) };
    })()`).catch(() => null);

    await sleep(3000);
    const early = await probe();
    const earlyShot = await page.screenshot({ encoding: 'base64' }).catch(() => null);

    /* After the 8s failsafe, before the 12s reload. Both bounds matter: the
       point is that the player gets the shell back WITHOUT a reload. */
    await sleep(FAILSAFE_MS + 1200 - 3000);
    const late = await probe();
    const lateShot = await page.screenshot({ encoding: 'base64' }).catch(() => null);

    const mp = await measurePage(browser);
    const earlyPx = earlyShot ? await mp.measure(earlyShot) : null;
    const latePx = lateShot ? await mp.measure(lateShot) : null;
    await mp.close();

    ok(`${tag}: SETUP the shell really is dead here (else nothing below means anything)`,
      !!early && early.kids === 0, `#screen children=${early?.kids}`);
    ok(`${tag}: the furniture is held back while the app has nothing to show`,
      !!early && !early.tabbar && !!earlyPx && earlyPx.lime < LIME_MIN,
      `at 3000ms: tabbar=${early?.tabbar} lime=${earlyPx?.lime}`);
    ok(`${tag}: and it comes back BY ITSELF, with no reload, before the 12s dead-shell recovery`,
      !!late && late.tabbar && !!latePx && latePx.lime >= LIME_MIN && navs === 1,
      `at ${FAILSAFE_MS + 1200}ms: tabbar=${late?.tabbar} lime=${latePx?.lime} navigations=${navs} (2+ means it reloaded instead)`);
    ok(`${tag}: the failsafe lands inside the recovery window`, FAILSAFE_MS < RELOAD_MS,
      `${FAILSAFE_MS}ms failsafe vs ${RELOAD_MS}ms reload`);
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ---- navigation: the regression this fix could most easily cause ------------ */

async function navigationPass() {
  const tag = 'NAVIGATION';
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 440, height: 956, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(base + '?demo', { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(3000);
    const ready = await page.evaluate(`(() => {
      const vis = ${VIS_FN};
      return { kids: (document.getElementById('screen') || {}).children?.length ?? -1, tabbar: vis(document.getElementById('tabbar')) };
    })()`);
    ok(`${tag}: SETUP the app is up and the tab bar is visible to begin with`,
      ready.kids > 0 && ready.tabbar, `#screen children=${ready.kids} tabbar=${ready.tabbar}`);
    if (!(ready.kids > 0 && ready.tabbar)) return;

    // sample the bar's effective visibility on every frame, then really click a tab
    await page.evaluate(`(() => {
      const vis = ${VIS_FN};
      window.__barSamples = [];
      const tick = () => { window.__barSamples.push(vis(document.getElementById('tabbar'))); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    })()`);
    const at = await page.evaluate(() => {
      const b = document.querySelector('#tabbar .tab[data-tab="bonehead"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    ok(`${tag}: SETUP a tab to click`, !!at, at ? `at ${Math.round(at.x)},${Math.round(at.y)}` : 'no Bonehead tab');
    if (!at) return;
    await page.mouse.click(at.x, at.y);
    await sleep(2200);
    const s = await page.evaluate(() => ({
      samples: (window.__barSamples || []).length,
      hidden: (window.__barSamples || []).filter(v => !v).length,
      hash: location.hash,
    }));
    ok(`${tag}: SAMPLE the navigation was actually sampled`, s.samples >= 20, `${s.samples} frames`);
    ok(`${tag}: the navigation really happened`, /bonehead|shop/.test(s.hash), `hash=${s.hash || '(none)'}`);
    ok(`${tag}: the tab bar never blinks out during a tab change`, s.samples >= 20 && s.hidden === 0,
      `${s.hidden} of ${s.samples} frames hidden`);
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ---- run ------------------------------------------------------------------- */

console.log(`grading ${base}\n`);
for (const [W, H] of [[440, 956], [393, 852]]) {
  await gradedBoot({ tag: `COLD ${W}x${H} (a new player's first ever open)`, W, H, warm: false });
  await gradedBoot({ tag: `WARM ${W}x${H} (a returning player, worker installed)`, W, H, warm: true });
}
await failsafePass();
await navigationPass();

srv?.close();
const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join(' | ')); process.exit(1); }
console.log('boot shows no bare furniture');
process.exit(0);

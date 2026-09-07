/* tests/boneyard-raf-audit.mjs - THE BONEYARD IS QUIET WHEN THE PLAYER IS.
 *
 * QA round 41, R41-18: "walking the Boneyard costs 556 rAF/s and about 90% of a
 * core, against 9 for an idle map". Measured here, on the real map, with the
 * scheduler hooked: 2,071 rAF/s walking and 9.2 standing PERFECTLY still.
 * STANDING STILL WAS THE WORSE HALF, and only a jittering fix shows it. A phone
 * that never moves still reports a position a metre or two away every 1.2s, and
 * on the pre-fix tree that cost 1,843.7 rAF/s -- 21.65 per frame, the same
 * storm as walking, for a picture that does not change. 1.8/s after.
 *
 * WHERE THEY COME FROM, traced rather than guessed (the stack of every
 * requestAnimationFrame was captured and grouped, see the run log):
 *   1. maplibre's Marker._update ends in `frameAsync(...).then(_updateOpacity)`,
 *      so EVERY setLngLat costs one rAF -- including one that sets the position
 *      the marker already has. refreshWorld re-asserted every marker's position
 *      on every pass, which is 7.4 rAF/s with nothing moving at all.
 *   2. a camera ease fires `move` on every frame it runs, and every `move`
 *      re-updates every DOM marker: 49 markers on this map, ~16-22 rAF per
 *      frame. The follow started a fresh 900ms ease on EVERY fix, and a phone
 *      lying still still delivers a fix every 1.2s with a metre of wander, so
 *      the map eased three quarters of the time with nothing to show for it.
 *
 * WHAT THIS FILE GRADES, and what it deliberately does not:
 *   SAMPLE   the map really came up with markers on it. Without this every row
 *            below passes on a blank screen.
 *   METER    the hook counts an injected per-frame loop. A rAF counter that
 *            reads zero because it is not installed is the failure mode this
 *            whole file is exposed to, so the zero has to be earned.
 *   STILL    a phone delivering a jittering fix from one spot schedules almost
 *            nothing: < 3 rAF/s. Broken reads 1,843.7/s on this same harness.
 *   MOVING   the control: the same sweep while the player genuinely walks DOES
 *            schedule work, so STILL cannot pass on a dead map, a stopped
 *            animation clock or a teardown. It is a floor, not a ceiling: the
 *            per-frame cost of DOM markers during a camera ease is maplibre's,
 *            not this app's, and capping it here would be a number nobody can
 *            act on.
 *   ROOTS    no marker ROOT carries a transform animation. Chrome will not
 *            composite a property two animations claim and maplibre owns the
 *            marker root's transform, so an effect put there runs on the main
 *            thread for the life of the marker (memory:
 *            lessons_maplibre_marker_transform). The one running today,
 *            roamDrift, is on .den-fx, an inner child. This keeps it there.
 *
 * PROVE-RED, measured in a throwaway with both reverts applied (moveMarker
 * calling setLngLat unconditionally, and the follow easing on every fix):
 * STILL 1,843.7 rAF/s against a ceiling of 3, with SAMPLE (48 markers), METER
 * (139.5/s), MOVING and ROOTS all still green.
 *
 * Run: node tests/boneyard-raf-audit.mjs [baseUrl]   (serves this checkout if
 * omitted). HEADLESS_MODE=shell; the map needs swiftshader, launched below.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, boneyardCapability, unproven, unprovenReport, UNPROVEN_EXIT } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
const srv = argUrl ? null : await serveTree(ROOT);
const base = (argUrl || srv.url).replace(/\/?$/, '/');

const STILL_CEIL = 3;     // rAF/s standing still. 1,843.7 before the fix, 1.8 after.
const METER_FLOOR = 30;   // what the same hook reads with one real loop injected
const MOVING_FLOOR = 20;  // the control: walking must cost SOMETHING

let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? '  | ' + detail : ''}`);
  if (!pass) fails = 1;
};

const { browser, page } = await boot(base, {
  headless: process.env.HEADLESS_MODE || 'shell',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const cap = await boneyardCapability(page);
  if (!cap.ok) {
    unproven('boneyard-raf-audit', `this machine cannot run the map: ${cap.checks.filter(c => !c.ok).map(c => `${c.kind}: ${c.detail}`).join('; ')}`);
    console.log(unprovenReport('boneyard-raf-audit', 1));
    await browser.close().catch(() => {});
    srv?.close?.();
    process.exit(UNPROVEN_EXIT);
  }

  await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
  const HOME = { latitude: 49.2827, longitude: -123.1207 };
  await page.setGeolocation(HOME);
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await seed(page, { level: 12 });

  /* THE HOOK: count every requestAnimationFrame, and keep a handle on the real
     one so the frame counter below cannot be counted by itself. */
  await page.evaluate(() => {
    if (window.__rafHooked) return;
    window.__rafHooked = true;
    window.__realRaf = window.requestAnimationFrame.bind(window);
    window.__raf = 0;
    window.requestAnimationFrame = cb => { window.__raf++; return window.__realRaf(cb); };
  });

  const sample = async ms => {
    await page.evaluate(() => {
      window.__raf = 0; window.__frames = 0;
      if (window.__tickId) window.cancelAnimationFrame(window.__tickId);
      const tick = () => { window.__frames++; window.__tickId = window.__realRaf(tick); };
      window.__tickId = window.__realRaf(tick);
    });
    const t0 = Date.now();
    await sleep(ms);
    const r = await page.evaluate(() => ({ n: window.__raf, frames: window.__frames }));
    const secs = (Date.now() - t0) / 1000;
    return { rate: r.n / secs, perFrame: r.n / Math.max(1, r.frames), fps: r.frames / secs };
  };

  await page.evaluate(() => { location.hash = '#/boneyard'; });
  await sleep(2200);
  await page.evaluate(() => document.querySelector('#mapStart')?.click());
  await sleep(10000);
  const world = await page.evaluate(() => ({
    markers: document.querySelectorAll('.maplibregl-marker').length,
    canvas: !!document.querySelector('#mapBody canvas'),
  }));
  ok('SAMPLE the Boneyard came up: a map canvas with markers on it', world.canvas && world.markers >= 10,
    `${world.markers} markers, canvas ${world.canvas}`);
  if (fails) { console.log('\n  This audit GRADED NOTHING.'); await browser.close().catch(() => {}); srv?.close?.(); process.exit(2); }

  // METER: one real per-frame loop, so a zero below is a measurement
  await page.evaluate(() => {
    window.__meter = true;
    const spin = () => { if (window.__meter) requestAnimationFrame(spin); };
    requestAnimationFrame(spin);
  });
  const meter = await sample(2500);
  await page.evaluate(() => { window.__meter = false; });
  await sleep(600);

  // STILL: the phone is in one place, its fix wanders about a metre
  const jitter = (async () => {
    for (let i = 0; i < 7; i++) {
      await page.setGeolocation({ latitude: HOME.latitude + (i % 2 ? 0.000009 : -0.000009), longitude: HOME.longitude + (i % 3 ? 0.000006 : 0) });
      await sleep(900);
    }
  })();
  const still = await sample(5000);
  await jitter;

  // MOVING: the control. A real walk, ~13 m a fix.
  const walk = (async () => {
    for (let i = 1; i <= 7; i++) {
      await page.setGeolocation({ latitude: HOME.latitude + i * 0.00012, longitude: HOME.longitude + i * 0.00009 });
      await sleep(900);
    }
  })();
  const moving = await sample(5000);
  await walk;

  const roots = await page.evaluate(() => [...document.querySelectorAll('.maplibregl-marker')]
    .flatMap(el => el.getAnimations().map(a => ({ name: a.animationName || 'waapi', props: (getComputedStyle(el).animationName || '') })))
    .filter(a => a.name && a.name !== 'none'));

  console.log(`      meter ${meter.rate.toFixed(1)}/s (${meter.perFrame.toFixed(2)}/frame at ${meter.fps.toFixed(0)}fps)`);
  console.log(`      still ${still.rate.toFixed(1)}/s (${still.perFrame.toFixed(2)}/frame), walking ${moving.rate.toFixed(1)}/s (${moving.perFrame.toFixed(2)}/frame)`);

  ok(`METER the hook reads an injected per-frame loop (>= ${METER_FLOOR}/s), so the numbers below are measurements`,
    meter.rate >= METER_FLOOR, `${meter.rate.toFixed(1)}/s`);
  ok(`STILL a jittering fix from one spot costs < ${STILL_CEIL} rAF/s (1,843.7/s before, 21.65 per frame)`,
    still.rate < STILL_CEIL, `${still.rate.toFixed(1)}/s, ${still.perFrame.toFixed(2)} per frame`);
  ok(`MOVING the control: genuinely walking still schedules work (>= ${MOVING_FLOOR}/s), so STILL is not a dead map`,
    moving.rate >= MOVING_FLOOR, `${moving.rate.toFixed(1)}/s, ${moving.perFrame.toFixed(2)} per frame`);
  ok('ROOTS no marker ROOT carries an animation: maplibre owns that element\'s transform',
    roots.length === 0, roots.length ? roots.map(r => r.name).join(', ') : 'none (roamDrift lives on .den-fx, an inner child)');
} finally {
  await browser.close().catch(() => {});
  srv?.close?.();
}
console.log(fails ? '\nBONEYARD rAF: FAILED' : '\nBONEYARD rAF: standing still costs nothing, and walking still moves');
process.exit(fails);

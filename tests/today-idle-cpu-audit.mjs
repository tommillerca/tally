/* tests/today-idle-cpu-audit.mjs - ONE LOGGED FOOD DOES NOT LEAVE TODAY HOT.
 *
 * WHY THIS EXISTS. QA round 26 O5 (2026-09-03), the practical verdict of the
 * soak: after a single food was logged, Today sat at 60 style recalculations a
 * second and 15 to 22% of a core, still 59.6/s five minutes later, until the
 * player navigated to another tab; the next log restarted it. Pausing
 * animations dropped it to 0.1/s and 0.3%. Idle never exceeded 1.5%.
 *
 * ROOT CAUSE, traced in source. renderToday adds exactly one class after a log,
 * `bounce` on .hero-scene (S.justLogged), and app.css read
 *   .hero-scene.bounce .bh-anim { animation: bhbounce 0.7s ..., bh-idle 4s ease-in-out 0.7s infinite; }
 * Two animations claiming `transform` on ONE element. Chrome will not composite
 * a property two animations claim, decides that when the animation starts and
 * never re-decides, so the infinite bh-idle ran on the main thread, one style
 * recalc per frame, for as long as the element existed. Today is rebuilt by
 * innerHTML only on a route or refresh, which is why leaving the tab was the
 * only cure. Same trap the Emporium's .wz-glow shipped (idle-perf-audit item 3;
 * memory: lessons_two_animations_one_property). The fix hands the rule the
 * 0.7s bounce alone and removes .bounce on its animationend, so .bh-anim falls
 * back to its own single bh-idle, started fresh, which the compositor takes.
 *
 * WHAT IT ASSERTS, driven through the real portion sheet (the same path
 * add-double-tap-audit drives):
 *   METER    the meter reads a real per-frame loop (an injected box-shadow
 *            animation) at >= 100/s, so every zero below is a measurement and
 *            not a blind probe. Same probe idle-perf-audit uses.
 *   BEFORE   Today, settled, before any log: < 5 recalcs/s (the control that
 *            says the baseline the AFTER row is compared to really is quiet).
 *   LOGGED   the tap wrote a log row (a flow that logs nothing proves nothing).
 *   BOUNCED  .hero-scene carried .bounce within 1.5s of the log: the celebration
 *            Tom kept still fires, so this cannot pass by deleting the reward.
 *   AFTER    5s after the log, a 3s window on Today reads < 5 recalcs/s.
 *            Failure is 60/s (one recalc per frame at 60Hz); the gap between
 *            healthy and broken is not a threshold so much as a bus lane.
 *   ALONE    the hero's .bh-anim carries at most one running animation and the
 *            .bounce class is gone: the mechanism, not just the rate, so a
 *            machine that stops ticking animations cannot pass AFTER by accident.
 *
 * PROVE-RED. Written in a lane that could not run a browser (the machine rule
 * for QA round 26 O5). On origin/main 96c1104a (or with app.css:1681 reverted to
 * the two-animation shorthand): expect AFTER ~60/s and ALONE 2 animations, with
 * METER, BEFORE, LOGGED and BOUNCED still green. On the fix: all green.
 *
 * Usage: node tests/today-idle-cpu-audit.mjs [baseUrl]   (serves this repo if omitted)
 *        HEADLESS_MODE=shell is the default: headless 'new' froze the animation
 *        clock on this Mac (memory: lessons_frozen_anim_clock_is_the_machine).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
const srv = argUrl ? null : await serveTree(ROOT);
const base = (argUrl || srv.url).replace(/\/?$/, '/');

const IDLE_CEIL = 5;      // recalcs/second on Today, before and 5s after a log
const METER_FLOOR = 100;  // what the same meter must read with a real loop injected

const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};

const { browser, page } = await boot(base, { headless: process.env.HEADLESS_MODE || 'shell' });
const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
try {
  await seed(page, { level: 12 });
  await sleep(1500);
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(2500);

  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable');
  const recalcs = async () => {
    const m = (await cdp.send('Performance.getMetrics')).metrics;
    return m.find(x => x.name === 'RecalcStyleCount')?.value ?? 0;
  };
  /* a 3s window, read off CDP's own counter; nothing here touches the page */
  const rate = async (windowMs = 3000) => {
    const a = await recalcs(); const t0 = Date.now();
    await sleep(windowMs);
    return (await recalcs() - a) / ((Date.now() - t0) / 1000);
  };

  // METER: the probe idle-perf-audit uses, so a zero later cannot be a blind counter
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.id = '__idleProbeStyle';
    s.textContent = '@keyframes __idleProbe { 50% { box-shadow: 0 0 18px #a5e847 } }'
      + '#__idleProbe { position: fixed; left: 6px; top: 6px; width: 13px; height: 13px;'
      + ' border-radius: 50%; background: #a5e847; z-index: 99999;'
      + ' animation: __idleProbe 1.6s ease-in-out infinite }';
    document.head.appendChild(s);
    const d = document.createElement('div'); d.id = '__idleProbe'; document.body.appendChild(d);
  });
  await sleep(500);
  const meter = await rate();
  await page.evaluate(() => { document.getElementById('__idleProbe')?.remove(); document.getElementById('__idleProbeStyle')?.remove(); });
  await sleep(1000);

  // BEFORE: Today settled, nobody touching it
  const before = await rate();

  // the log: Today -> a meal row -> search -> pick -> Add (add-double-tap-audit's path)
  const rows = () => page.evaluate(async () => (await (await import('./js/db.js')).db.all('log')).length);
  const rowsBefore = await rows();
  await page.evaluate(() => document.querySelector('[data-addmeal]')?.click());
  await sleep(1600);
  await page.evaluate(() => {
    const inp = document.querySelector('#t1Search, input[type=search]');
    if (inp) { inp.value = 'apple'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await sleep(1600);
  const picked = await page.evaluate(() => {
    const row = document.querySelector('[data-food], .t1-frow, .food-row');
    if (!row) return 'no-food-row';
    row.click(); return 'picked';
  });
  await sleep(1600);
  const tapped = await page.evaluate(() => {
    const b = document.getElementById('addBtn');
    if (!b) return 'no-addBtn';
    b.click(); return 'submitted';
  });
  /* BOUNCED: poll for the class rather than read it once. The re-render lands
     ~80ms after the sheet closes and the fix removes the class 0.7s later. */
  let bounced = false;
  for (let i = 0; i < 30 && !bounced; i++) {
    await sleep(50);
    bounced = await page.evaluate(() => !!document.querySelector('.hero-scene.bounce'));
  }
  const rowsAfter = await rows();

  // AFTER: 5s after the log, then a 3s window
  await sleep(5000);
  const after = await rate();
  const alone = await page.evaluate(() => {
    const el = document.querySelector('#bhStage .bh-anim');
    return {
      present: !!el,
      running: el ? el.getAnimations().filter(a => a.playState === 'running').map(a => a.animationName) : [],
      bounceClass: !!document.querySelector('.hero-scene.bounce'),
    };
  });

  console.log(`      meter ${meter.toFixed(1)}/s, before ${before.toFixed(1)}/s, after ${after.toFixed(1)}/s`);
  console.log(`      hero .bh-anim: ${alone.present ? `running [${alone.running.join(', ')}]` : 'MISSING'}, .bounce ${alone.bounceClass ? 'still on' : 'gone'}`);

  ok(`METER the same meter reads a real per-frame loop (>= ${METER_FLOOR}/s)`, meter >= METER_FLOOR, `${meter.toFixed(1)}/s with one injected box-shadow animation`);
  ok(`BEFORE Today settled before any log does < ${IDLE_CEIL} recalcs/s`, before < IDLE_CEIL, `${before.toFixed(1)}/s`);
  ok('LOGGED the tap wrote a log row (a flow that logs nothing proves nothing)', tapped === 'submitted' && rowsAfter > rowsBefore, `${picked}, ${tapped}, rows ${rowsBefore} -> ${rowsAfter}`);
  ok('BOUNCED the celebration still fires: .hero-scene carried .bounce after the log', bounced, String(bounced));
  ok(`AFTER 5s after the log Today is back under ${IDLE_CEIL} recalcs/s (broken reads ~60/s)`, after < IDLE_CEIL, `${after.toFixed(1)}/s`);
  ok('ALONE the hero carries at most one running animation and .bounce is gone', alone.present && alone.running.length <= 1 && !alone.bounceClass,
    alone.present ? `[${alone.running.join(', ')}], .bounce ${alone.bounceClass ? 'on' : 'gone'}` : 'no #bhStage .bh-anim');
  ok('nothing threw to the page', errs.length === 0, errs.slice(0, 1).join(''));
} finally {
  await browser.close().catch(() => {});
  srv?.close?.();
}

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\none log, then quiet');
process.exit(fails.length ? 1 : 0);

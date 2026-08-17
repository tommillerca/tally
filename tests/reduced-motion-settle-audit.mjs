/* tests/reduced-motion-settle-audit.mjs: REDUCED MOTION MUST NOT ADD MOTION.
 *
 * THE BUG THIS EXISTS FOR, diagnosed 2026-08-17.
 * app.css's `@media (prefers-reduced-motion: reduce)` block collapses
 * `transition-duration` to 0.001s on `*, *::before, *::after`. It never touched
 * `transition-property`, which keeps its initial value: `all`. So the collapse
 * did not REMOVE transitions, it MANUFACTURED them, turning every property on
 * every element into a live 1ms transition, on elements whose designer gave them
 * none. Measured by listening for `transitionrun` across one tab walk: 4 kinds
 * of transition with the setting off, 17 with it on, 13 of those reduce-only.
 * `#screen` opacity was among them, fired 14 times in a session, which is the
 * `screen-in` reveal that every single route goes through.
 *
 * The cosmetic half is invisible (1ms). The correctness half is not: any code
 * that reveals or moves something and then MEASURES on the same task reads the
 * IN-FLIGHT value instead of the settled one, and if that measurement feeds a
 * decision the wrong answer is permanent, not 1ms long. It is a load-dependent
 * coin flip that passes almost always, and it only reproduces under reduced
 * motion, which an ordinary probe does not emulate. It made an audit row latently
 * flaky from the day it was written: the element was present, on top, correctly
 * sized, and read opacity 0.683.
 *
 * WHAT THIS ASSERTS IS THE PROPERTY, NOT THE INSTANCE. Not "app.css line N says
 * transition-property: none". The property: under reduced motion, revealing or
 * moving an element must hand the next reader a SETTLED computed value. Any fix
 * that achieves that passes; the current one is only the cheapest.
 *
 * DIRECTION AND BOUND (anti-regression rule 11). The direction of failure is
 * reduce-ONLY in-flight reads: turning the accessibility setting ON must never
 * add a transition that is not there with it off. The bound is ZERO, not a
 * trend, across a sample that is asserted to be non-empty and asserted to have
 * actually changed something (a flip that is a no-op proves nothing).
 *
 * PROVEN RED with the DIAL. A 1ms race is not a proof, so the prove-red runs in
 * two throwaway trees whose 0.001s is dialled to 2s, one WITHOUT the fix and one
 * WITH it, so the fix is the only variable and the race is observable rather
 * than a coin flip. Red tree: REVEAL rows go red with in-flight reads and live
 * CSSTransitions; green tree: all green at the same 2s dial.
 *
 * Usage: node tests/reduced-motion-settle-audit.mjs [baseUrl]  (serves this repo)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

/* The shapes. Each one is a REAL class flip this app performs, or a real app
   class applied to a probe node so the real cascade is in force. `build` returns
   the element to flip; `cls` is the class the app adds; `prop` is what a caller
   would read. Add a row here whenever a new surface starts revealing itself. */
const SHAPES = `[
  { name: 'route reveal: #screen + screen-in (app.js route/revealWhenReady)',
    build: () => document.getElementById('screen'), cls: 'screen-in', prop: 'opacity' },
  { name: 'map route: #screen + screen--map (padding, app.js route)',
    build: () => document.getElementById('screen'), cls: 'screen--map', prop: 'padding-bottom' },
  { name: 'sheet reveal: #sheets .sheet-body + sheet-in (app.js openSheet)',
    build: () => {
      const host = document.getElementById('sheets') || document.body;
      const d = document.createElement('div');
      d.className = 'sheet-body'; d.textContent = 'probe';
      host.appendChild(d); return d;
    }, cls: 'sheet-in', prop: 'opacity' },
  { name: 'tab bar: #tabbar .tab + active (app.js route)',
    build: () => document.querySelector('#tabbar .tab'), cls: 'active', prop: 'color' },
  { name: 'onboarding reveal: a bare div + screen-in inside .screen (app.js renderOnboarding)',
    build: () => {
      const d = document.createElement('div');
      d.className = 'screen'; d.style.cssText = 'position:fixed;left:-9999px;top:0;width:100px;height:40px';
      document.body.appendChild(d); return d;
    }, cls: 'screen-in', prop: 'opacity' }
]`;

/* One probe, run identically with the setting on and off, so the two runs are
   comparable and "reduce-only" is a real diff rather than an assumption. */
const PROBE = `async (shapes) => {
  const raf = () => new Promise(r => requestAnimationFrame(r));
  const settle = async () => { await raf(); await new Promise(r => setTimeout(r, 120)); await raf(); };
  const out = [];
  for (const s of shapes) {
    let el = null;
    try { el = s.build(); } catch (e) { out.push({ name: s.name, error: String(e) }); continue; }
    if (!el) { out.push({ name: s.name, error: 'no element' }); continue; }
    const read = () => getComputedStyle(el)[s.prop];
    // 1. put it in the pre-reveal state and let that state settle COMPLETELY,
    //    so anything we see afterwards belongs to the flip and not to the setup.
    el.classList.remove(s.cls);
    await settle();
    document.getAnimations().forEach(a => { try { a.finish(); } catch {} });
    const before = read();
    // 2. THE FLIP, then the read a caller on the same task would get.
    el.classList.add(s.cls);
    const sameTask = read();
    const live = document.getAnimations()
      .filter(a => a.constructor.name === 'CSSTransition' && a.effect && a.effect.target === el)
      .map(a => ({ prop: a.transitionProperty || '?', state: a.playState }));
    // 3. what it actually is.
    await settle();
    const settled = read();
    out.push({
      name: s.name, before, sameTask, settled,
      changed: before !== settled,          // a no-op flip proves nothing
      inFlight: sameTask !== settled,       // THE failure
      liveTransitions: live,
    });
    el.classList.remove(s.cls);
    if (!el.isConnected) continue;
    if (el.id !== 'screen' && !el.closest('#tabbar')) el.remove();
  }
  return out;
}`;

async function session(reduced) {
  const { browser, page } = await boot(base);
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);
  const mq = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const rows = await page.evaluate(`(${PROBE})(${SHAPES})`);

  /* THE APP'S OWN MACHINERY, not a synthetic: navigate for real and count the
     transitions the app itself starts. transitionrun fires once per property per
     transition, so zero is the only honest bound. */
  await page.evaluate(() => {
    window.__tr = [];
    document.addEventListener('transitionrun', e => {
      const t = e.target;
      window.__tr.push({ target: (t.tagName || '?').toLowerCase() + (t.id ? '#' + t.id : ''), prop: e.propertyName });
    }, true);
  });
  for (const tab of ['bonehead', 'progress', 'today', 'foods', 'today']) {
    await page.evaluate(t => { location.hash = '#/' + t; }, tab);
    await sleep(1200);
  }
  const routeTr = await page.evaluate(() => window.__tr.filter(r => r.target === 'main#screen'));
  const navs = await page.evaluate(() => !!document.querySelector('#screen.screen-in'));
  await browser.close();
  return { mq, rows, routeTr, navs };
}

const on = await session(true);
const off = await session(false);

/* ---------- SETUP: without these, nothing below means anything ---------- */
ok('SETUP reduced motion really is emulated in the ON session (else every row below is vacuous)',
  on.mq === true && off.mq === false, `on=${on.mq} off=${off.mq}`);
ok('SETUP every shape resolved to a real element (EMPTY SAMPLE: a build() that returns null tests nothing)',
  on.rows.length >= 5 && on.rows.every(r => !r.error), JSON.stringify(on.rows.filter(r => r.error)) || `${on.rows.length} shapes`);
ok('SETUP every flip actually CHANGED the property it claims to (a no-op flip cannot be caught in flight)',
  on.rows.every(r => r.changed), on.rows.filter(r => !r.changed).map(r => `${r.name}: ${r.before} -> ${r.settled}`).join(' | ') || 'all 5 changed');
ok('SETUP the route walk really navigated (EMPTY SAMPLE: no route means no reveal to measure)',
  on.navs === true, `screen-in present after the walk: ${on.navs}`);

/* ---------- CONTROL: the detector can SEE an in-flight read ----------
   Run with the setting OFF, where a long author transition is allowed to exist.
   If this row ever fails, the technique below is blind and its passes are
   worthless (anti-regression rule 1). */
const { browser: cb, page: cp } = await boot(base);
await sleep(1200);
const control = await cp.evaluate(async () => {
  const raf = () => new Promise(r => requestAnimationFrame(r));
  const settle = async () => { await raf(); await new Promise(r => setTimeout(r, 120)); await raf(); };
  const st = document.createElement('style');
  st.textContent = '.rmprobe{opacity:0;transition:opacity 2s linear}.rmprobe.rmshow{opacity:1}';
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.className = 'rmprobe'; d.style.cssText = 'position:fixed;left:-9999px;top:0;width:10px;height:10px';
  document.body.appendChild(d);
  await settle();
  d.classList.add('rmshow');
  const sameTask = getComputedStyle(d).opacity;
  await settle();
  return { sameTask, settled: getComputedStyle(d).opacity };
});
await cb.close();
ok('CONTROL the probe DOES catch an in-flight read when one exists (2s author transition, reduce off)',
  control.sameTask !== control.settled && control.sameTask === '0',
  `same-task=${control.sameTask} settled=${control.settled}`);

/* ---------- THE PROPERTY. DIRECTION: reduce-only. BOUND: zero. ---------- */
const onBad = on.rows.filter(r => r.inFlight).map(r => r.name);
const offBad = new Set(off.rows.filter(r => r.inFlight).map(r => r.name));
const reduceOnly = onBad.filter(n => !offBad.has(n));

ok('REVEAL under reduced motion, a reveal hands the next reader a SETTLED value, never an in-flight one (bound: 0 of 5)',
  onBad.length === 0,
  onBad.length ? on.rows.filter(r => r.inFlight).map(r => `${r.name}: read "${r.sameTask}" mid-flight, settles to "${r.settled}"`).join(' | ') : `0 of ${on.rows.length} in flight`);

ok('REVEAL turning reduced motion ON adds no in-flight read that is absent with it OFF (the accessibility setting must REMOVE motion, not add it)',
  reduceOnly.length === 0, reduceOnly.join(' | ') || 'no reduce-only in-flight reads');

ok('CAUSE under reduced motion a class flip starts NO CSSTransition at all (this is the mechanism, named)',
  on.rows.every(r => !r.liveTransitions || r.liveTransitions.length === 0),
  on.rows.filter(r => r.liveTransitions?.length).map(r => `${r.name}: ${JSON.stringify(r.liveTransitions)}`).join(' | ') || 'none');

ok('LIVE the app routing for real under reduced motion starts no transition on #screen (bound: 0 transitionrun events)',
  on.routeTr.length === 0,
  on.routeTr.length ? `${on.routeTr.length} events: ${JSON.stringify(on.routeTr.slice(0, 6))}` : '0 events across 5 routes');

console.log(fails.length ? `\n${fails.length} FAILING` : '\nREDUCED MOTION SETTLE VERIFIED');
srv?.close();
process.exit(fails.length ? 1 : 0);

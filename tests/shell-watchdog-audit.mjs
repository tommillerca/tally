/* tests/shell-watchdog-audit.mjs: THE DEAD-SHELL WATCHDOG RELOADS A DEAD SHELL,
 * AND NEVER A LIVE ONE.
 *
 * WHY THIS EXISTS. index.html carries a watchdog that reloads the app 12,000ms
 * after load if #screen has no children, so a build whose modules died recovers
 * itself once instead of showing a black page. It read children.length at ONE
 * INSTANT, and #screen has a legitimate transient zero: route() clears it and
 * rebuilds, measured at about 11ms wide. Land the timer inside that window and a
 * healthy app is declared dead and RELOADED under the player mid-session.
 *
 * That is not theoretical. Tom hit it on 2026-08-27 tapping a news row shortly
 * after opening ("i clicked on one, it reset the app"), and it is what made
 * newcomers-audit fail about one run in six on EVERY build including v456, which
 * is how it was found: the audit's setup lands its first evaluate at ~12,000ms,
 * the same instant the watchdog fires.
 *
 * 2026-09-05 (branch fix/r34-watchdog, merged same day): the 12,000ms clock now
 * starts only once every `script[type="module"]` on the page has fired its
 * load/error event (or a top-level exception reaches `window`'s error event),
 * not at page load -- QA r34 P1#3 found the old fixed-from-load timer firing
 * mid-download on a throttled connection. That widened the shipped watchdog's
 * DOM surface to `document.querySelectorAll` and `window.addEventListener`,
 * which this file's sandbox did not model, so it died at 0s (TypeError on
 * `document.querySelectorAll`, then would have died again on `window` being
 * undefined) before a single assertion ran. Fixed here by extending the fake
 * DOM rather than the watchdog: tests/dead-shell-audit.mjs already proves the
 * gating behaves correctly in a real browser and stays untouched.
 *
 * WHAT IT ASSERTS, both directions, because a watchdog that never fires is as
 * broken as one that fires wrongly and is much easier to ship by accident:
 *   LIVE     a healthy app whose #screen is emptied at the exact moment the
 *            watchdog runs is NOT reloaded, and leaves no retry flag behind.
 *   DEAD     a shell that never renders IS reloaded, once.
 *   ONCE     and only once, so a genuinely broken build cannot reload-loop.
 *   FLIGHT   the 12s clock does not even START while a module script is still
 *            loading, and does start once every module script has settled.
 *
 * The timer is driven rather than waited on: the page is loaded with the
 * watchdog's delay shortened, so this runs in seconds instead of 12 apiece.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv[2] || process.env.URL;
const own = argUrl ? null : await serveTree(ROOT);
const url = argUrl || own.url;
let bad = 0;
const ok = (l, p, d = '') => { console.log(`${p ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!p) bad++; };

/* The watchdog body is read out of index.html and run against a fake DOM, so the
   SHIPPED code is what is graded rather than a copy of it. Driving the real 12s
   timer in a real browser three times would take 36 seconds and prove less. */
const { readFileSync } = await import('node:fs');
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const m = html.match(/\(function \(\) \{\n  var KEY = 'bhg-shell-retry';[\s\S]*?\n\}\)\(\);/);
ok('SETUP the watchdog was located in index.html', !!m, m ? `${m[0].length} bytes` : 'not found');
if (!m) { console.log('\nFAIL (setup): nothing below grades the shipped code.'); process.exit(2); }

/* One fake module <script> element: addEventListener records the callback,
   fire() runs it, matching what index.html actually attaches to (load/error). */
const fakeScript = () => {
  const listeners = {};
  return {
    addEventListener: (ev, cb) => { (listeners[ev] ||= []).push(cb); },
    fire: ev => (listeners[ev] || []).forEach(cb => cb()),
  };
};

/* Builds the sandbox and runs the watchdog IIFE once. modCount module scripts
   are present but none has fired load/error yet (the "still loading" state) --
   callers that want the old modCount:0 behaviour get arm() called immediately,
   matching a page with no module scripts at all (index.html's own fallback). */
const buildSandbox = ({ children, modCount = 0 }) => {
  let reloads = 0, kids = children;
  const store = {};
  const timers = [];
  const scriptEls = Array.from({ length: modCount }, fakeScript);
  const sandbox = {
    sessionStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    document: {
      getElementById: id => (id === 'screen' ? { get children() { return { length: kids }; } } : null),
      querySelectorAll: () => scriptEls,
    },
    window: { addEventListener: () => {} }, // top-level-error fallback; not exercised by these scenarios
    location: { href: 'http://x/', hash: '', replace: () => { reloads++; } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); },
    Date: { now: () => 1 },
  };
  const fn = new Function(...Object.keys(sandbox), m[0]);
  fn(...Object.values(sandbox));
  return {
    get reloads() { return reloads; },
    store, timers, scriptEls,
    setKids: v => { kids = v; },
  };
};

/* modCount:0 -- no module scripts on the page, so arm() runs immediately, same
   as the pre-gating watchdog. Drives every queued timer in order; between the
   first and the rest, let the app "come back" unless the caller wants a
   genuinely dead shell. */
const runWatchdog = async ({ children, emptyForever }) => {
  const sb = buildSandbox({ children, modCount: 0 });
  let guard = 0;
  while (sb.timers.length && guard++ < 60) {
    const t = sb.timers.shift();
    if (!emptyForever && guard === 2) sb.setKids(8);   // route finished repainting
    t.fn();
  }
  return { reloads: sb.reloads, store: sb.store };
};

const live = await runWatchdog({ children: 0, emptyForever: false });
ok('LIVE     a healthy app whose #screen is momentarily empty is NOT reloaded',
  live.reloads === 0, `${live.reloads} reload(s); this is the bug Tom hit as "it reset the app"`);
ok('LIVE     and no retry flag is left behind',
  !live.store['bhg-shell-retry'], JSON.stringify(live.store));

const dead = await runWatchdog({ children: 0, emptyForever: true });
ok('DEAD     a shell that never renders IS reloaded, so a broken build still recovers itself',
  dead.reloads === 1, `${dead.reloads} reload(s)`);

const again = await runWatchdog({ children: 0, emptyForever: true });
ok('ONCE     and the retry key is set, so a broken build cannot reload-loop',
  again.store['bhg-shell-retry'] === '1', JSON.stringify(again.store));

/* FLIGHT: two module scripts on the page, neither has settled yet. If arm()
   fired anyway the 12,000ms timer would already be queued -- it must not be. */
const flight = buildSandbox({ children: 0, modCount: 2 });
ok('FLIGHT   the reload clock does not start while a module script is still loading',
  flight.timers.length === 0, `${flight.timers.length} timer(s) queued, ${flight.scriptEls.length} module(s) unsettled`);

flight.scriptEls[0].fire('load');
ok('FLIGHT   still no clock with one of two modules settled',
  flight.timers.length === 0, `${flight.timers.length} timer(s) queued`);

flight.scriptEls[1].fire('error'); // a module can settle via error, not just load
ok('FLIGHT   the clock starts, at 12000ms, once every module script has settled',
  flight.timers.length === 1 && flight.timers[0].ms === 12000,
  JSON.stringify(flight.timers.map(t => t.ms)));

console.log(`\nshell-watchdog: ${bad ? bad + ' FAILED' : 'clean'}`);
if (own) own.close();
process.exit(bad ? 1 : 0);

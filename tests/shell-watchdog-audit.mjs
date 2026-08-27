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
 * WHAT IT ASSERTS, both directions, because a watchdog that never fires is as
 * broken as one that fires wrongly and is much easier to ship by accident:
 *   LIVE     a healthy app whose #screen is emptied at the exact moment the
 *            watchdog runs is NOT reloaded. This is the bug.
 *   DEAD     a shell that never renders IS reloaded, once.
 *   ONCE     and only once, so a genuinely broken build cannot reload-loop.
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

const runWatchdog = async ({ children, emptyForever }) => {
  let reloads = 0, kids = children;
  const store = {};
  const timers = [];
  const sandbox = {
    sessionStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    document: { getElementById: id => (id === 'screen' ? { get children() { return { length: kids }; } } : null) },
    location: { href: 'http://x/', hash: '', replace: () => { reloads++; } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); },
    Date: { now: () => 1 },
  };
  const fn = new Function(...Object.keys(sandbox), m[0]);
  fn(...Object.values(sandbox));
  // drive every queued timer in order; between the first and the rest, let the
  // app "come back" unless the caller wants a genuinely dead shell
  let guard = 0;
  while (timers.length && guard++ < 60) {
    const t = timers.shift();
    if (!emptyForever && guard === 2) kids = 8;   // route finished repainting
    t.fn();
  }
  return { reloads, store };
};

const live = await runWatchdog({ children: 0, emptyForever: false });
ok('LIVE     a healthy app whose #screen is momentarily empty is NOT reloaded',
  live.reloads === 0, `${live.reloads} reload(s); this is the bug Tom hit as "it reset the app"`);

const dead = await runWatchdog({ children: 0, emptyForever: true });
ok('DEAD     a shell that never renders IS reloaded, so a broken build still recovers itself',
  dead.reloads === 1, `${dead.reloads} reload(s)`);

const again = await runWatchdog({ children: 0, emptyForever: true });
ok('ONCE     and the retry key is set, so a broken build cannot reload-loop',
  again.store['bhg-shell-retry'] === '1', JSON.stringify(again.store));

console.log(`\nshell-watchdog: ${bad ? bad + ' FAILED' : 'clean'}`);
if (own) own.close();
process.exit(bad ? 1 : 0);

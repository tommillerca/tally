/* PRODUCTION ERRORS GET REPORTED, capped and anonymous.
 *
 * Before this existed, a player crash reached nobody: "Tom plays daily and
 * finds most bugs himself" was the crash channel. analytics.js now hooks
 * window error + unhandledrejection at module load and queues 'err' rows into
 * the same anonymous events pipe everything else uses.
 *
 * WHAT THIS PROVES, and how each check dies:
 *   QUEUED     an uncaught throw and an unhandled rejection each land in the
 *              kv event queue with kind, message head and source tail.
 *              Remove the addEventListener block and both go red.
 *   NO ORIGIN  the source tail carries no scheme/host (privacy: path tail
 *              only). Queue the full e.filename and this goes red.
 *   DEDUPED    the same message queues at most twice (ERR_DUP).
 *   CAPPED     at most five err rows a session (ERR_CAP), so a crash loop
 *              cannot flood the queue.
 *   BOT GATE   without window.__errProbe a webdriver session queues NOTHING,
 *              so audits never register as phantom testers. Drop the BOT
 *              check in pushErr and this goes red.
 *
 * The probe only proves QUEUEING. flush() keeps its own BOT gate and no audit
 * configures an apiBase, so a probe row can never leave the device. The
 * network half (rows landing in D1) is verified on live after deploy, per the
 * assert-the-end-of-the-chain rule: `SELECT name, count(*) FROM events WHERE
 * name='err'` on the dashboard.
 *
 * PROVE-RED (performed 2026-08-10, see the branch handoff): commented the
 * window.addEventListener block out of analytics.js: QUEUED, DEDUPED, CAPPED
 * and NO ORIGIN all failed, BOT GATE stayed green (nothing queued is also the
 * gate holding). Restored, all green.
 *
 * Run: node tests/error-telemetry-audit.mjs http://127.0.0.1:PORT/
 */
import { boot, sleep } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

/* No default URL: :8765 in this house is usually another session's checkout. */
const base = process.argv[2] || process.env.URL;
if (!base) {
  console.log('FAIL  error-telemetry-audit needs a base URL, and there is no safe default.');
  process.exit(1);
}

const { browser, page } = await boot(base);

/* Phase 1: BOT GATE. No probe flag set: these must queue nothing. Same page and
   same database as phase 2, so the assertion is marker-scoped. */
/* All injections load tests/fixtures/crashtest.js as a REAL same-origin
   <script src>: code injected via evaluate lives in a world whose uncaught
   errors reach window.onerror muted to "Script error." and whose rejections
   never dispatch unhandledrejection at all (measured), and inline scripts
   arrive with an empty e.filename. The app's own modules are same-origin
   files, so a same-origin file is the honest stand-in: real messages, real
   source tails. */
const inject = (marker, full) => page.evaluate(([m, f]) => new Promise(res => {
  window.__crashMarker = m; window.__crashFull = f;
  const s = document.createElement('script');
  s.src = 'tests/fixtures/crashtest.js?' + m;   // cache-bust so it executes per phase
  s.onload = res; s.onerror = res;
  document.head.appendChild(s);
}), [marker, full]);
await inject('bh-bot-marker', 0);
await sleep(900);

/* Phase 2: the probe on. One error, one rejection, the SAME error repeated
   four more times (dedupe), then six distinct errors (cap).
   Expected arithmetic with ERR_CAP=5, ERR_DUP=2:
     bh-live-A x1        -> queued (count 1)
     bh-live-R rejection -> queued (count 2)
     bh-live-A x4        -> one more queued (dup limit 2), three suppressed (count 3)
     bh-live-C1..C6      -> C1, C2 queued (count 4, 5), C3..C6 over the cap
   Total 'bh-live' rows: exactly 5. A exactly twice. C3 never. */
await page.evaluate(() => { window.__errProbe = 1; });
await inject('bh-live', 1);
await sleep(1800);

const q = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const rows = (await db.kvGet('evq', [])) || [];
  return rows.filter(r => r.name === 'err');
});

const live = q.filter(r => r.props && (r.props.m || '').includes('bh-live'));
const bot = q.filter(r => r.props && /bh-bot-marker/.test(r.props.m || ''));
const As = live.filter(r => (r.props.m || '').endsWith('bh-live-A'));
const R = live.find(r => (r.props.m || '').endsWith('bh-live-R'));
const C3 = live.find(r => (r.props.m || '').endsWith('bh-live-C3'));

ok('QUEUED: an uncaught error reaches the event queue', As.length >= 1,
  `${q.length} err rows total, ${live.length} from this run`);
ok('QUEUED: an unhandled rejection reaches it too', !!R && R.props.k === 'rejection',
  R ? JSON.stringify(R.props) : 'no rejection row');
ok('the error row carries kind and a real source tail', As[0] && As[0].props.k === 'error' && /crashtest\.js/.test(As[0].props.src || ''),
  As[0] ? JSON.stringify(As[0].props) : 'no row');
ok('NO ORIGIN: the source tail is a path tail, not a URL', live.every(r => !/https?:|\/\//.test(r.props.src || '')),
  live.map(r => r.props.src).join(' , '));
ok('DEDUPED: the same message queues at most twice', As.length === 2, `bh-live-A appears ${As.length}x (want 2)`);
ok('CAPPED: five err rows a session, a crash loop cannot flood', live.length === 5 && !C3,
  `${live.length} rows queued of 12 thrown${C3 ? ', and C3 leaked past the cap' : ''}`);
ok('BOT GATE: without the probe, a webdriver session queues nothing', bot.length === 0,
  bot.length ? `${bot.length} phantom rows: audits would register as testers` : 'clean');

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nerror telemetry holds');
process.exit(fails.length ? 1 : 0);

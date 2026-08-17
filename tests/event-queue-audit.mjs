/* THE ANALYTICS QUEUE MUST NOT LOSE A RARE EVENT BECAUSE A COMMON ONE WAS NOISY.
 *
 * THE FINDING (Reg, against live production D1, 2026-08-16): 96% of every row in
 * the events table is navigation telemetry - screen_time 20128, feat_open 15842,
 * feat_time 15398, screen 14462, session_ping 10015, against roughly 2945
 * gameplay rows in total. js/analytics.js capped the local queue at QCAP=300 and
 * evicted with `q.slice(-QCAP)`: keep the newest, drop the OLDEST.
 *
 * MEASURED HERE, before the fix, driving the real app: a REAL pit_win from a REAL
 * fight survives exactly 150 further bottom-nav taps and is then gone, because a
 * tap costs exactly two rows (screen_time for the screen you left, screen for the
 * one you arrived on) and 150 x 2 = the whole cap. At the end of that stretch the
 * queue was 300 rows of screen_time and screen and NOTHING else: not the pit_win,
 * not the fight_start, not either feat_open. Below the threshold nothing is lost;
 * above it, everything that is not navigation is lost. It is a cliff, not a rate.
 *
 * That only happens while flush() is not draining, which is any offline stretch:
 * fetch throws, the loop breaks, the queue is kept, and it is kept in IndexedDB
 * so it survives app restarts. An ONLINE player never sees this - 300 rows inside
 * one 60s flush interval is 2.5 taps a second sustained for a minute.
 *
 * THE INVARIANT: no event name may be pushed below its EQUAL SHARE of the cap by
 * another name's volume. analytics.js admit() drops the oldest row of whichever
 * name currently holds the most slots, so a name is only ever an eviction
 * candidate while it is the biggest occupant.
 *
 * WHAT THIS PROVES, and how each check dies:
 *   REAL-WIN    a real pit_win from a real fight is still in the queue after a
 *               real navigation burst that overflows the cap. Restore
 *               `q.slice(-QCAP)` in track() and this goes red.
 *   PRESSURE    the burst actually overflowed: more rows emitted than the cap,
 *               queue sitting exactly at the cap, and the burst really was
 *               dominated by the common names. Without this REAL-WIN could pass
 *               on a queue that never filled, which proves nothing (rule 1/3).
 *   ARITHMETIC  one rare row emitted FIRST, then 500 common: exactly 300 rows
 *               survive, exactly 1 of them is the rare one. Exact, not a trend.
 *   LEVELLING   against a production-shaped mix the policy grinds the LOUDEST
 *               names down toward each other and never starves the quiet tail:
 *               session_ping (12% of live rows, and the denominator of every
 *               play-time number) still has rows, and pit_win is untouched.
 *   FIFO        when no name is commoner than any other the policy degrades to
 *               oldest-first, so the degenerate case is unchanged.
 *   ORDER       the queue stays ascending by ts: admit() splices out of the
 *               middle, and the flush batches slice off the head.
 *   ERR         an 'err' row (ERR_CAP caps it at 5 a session, so it is the
 *               rarest name in the app) survives a navigation flood.
 *   BOT GATE    without window.__evProbe a webdriver session queues NOTHING, so
 *               the probe hatch is not a hole and audits never register as
 *               phantom testers. Drop the BOT half of track()'s gate: red.
 *
 * An empty captured queue is a FAILURE everywhere, never a pass.
 *
 * PROVE-RED (performed 2026-08-16, in a `git archive` copy of this tree with the
 * two admit() call sites reverted to `q.slice(-QCAP)` and NOTHING else changed):
 * FAILED 7, exit 1. Red were both REAL-WIN checks (queue came back
 * {"screen_time":150,"screen":150} and nothing else), both ARITHMETIC checks
 * (pit_win 0, screen_time 300), two LEVELLING checks (pit_win 0; the four common
 * names came back 120/75/69/36 instead of levelled), and ERR (0 of 5 crash rows
 * left). Green in the red tree, correctly: PRESSURE (the cap bit either way, which
 * is the point of that check), FIFO (oldest-first IS the degenerate case, so it
 * must not move), ORDER (order was never the bug) and BOT GATE (untouched by the
 * policy). LEVELLING's "quiet common name was not starved" also stayed green at
 * 36 rows - oldest-first starves the tail slowly, not to zero, which is why the
 * levelled-band check next to it is the one carrying that half.
 *
 * The probe only proves QUEUEING, which is where eviction happens. flush() keeps
 * its own BOT gate, unconditional and never probed, so no row here can leave the
 * device.
 *
 * Usage: node tests/event-queue-audit.mjs [baseUrl]   (serves this repo if omitted)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, serveTree, sleep } from './godmode.js';

const QCAP = 300;   // must match js/analytics.js
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = (argUrl || srv.url).replace(/\/?$/, '/');
console.log(`event-queue-audit against ${base}\n`);

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'new',
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  args: process.getuid?.() === 0 ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
});

/* ?demo so the page is on the demo database and can never touch a real save.
   webdriver stays TRUE, which is what the app's own fight seam (__bhFight)
   needs; the analytics BOT gate is opened with the shipped __evProbe hatch. */
async function openApp({ probe = true } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', e => console.log('PAGEERROR', String(e).split('\n')[0]));
  /* Belt and braces: flush() is BOT-gated and cannot run, but nothing off
     127.0.0.1 is allowed to leave this page either way. A future edit that
     loosens the gate still cannot post a phantom row to production from here. */
  await page.setRequestInterception(true);
  page.on('request', r => (/^https?:\/\/127\.0\.0\.1/.test(r.url()) || /^(data|blob):/.test(r.url())) ? r.continue() : r.abort());
  if (probe) await page.evaluateOnNewDocument(() => { window.__evProbe = 1; });
  await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
  await sleep(2600);
  for (let i = 0; i < 6; i++) {
    if (await page.evaluate(() => !document.querySelector('.onb'))) break;
    await page.evaluate(() => (document.querySelector('#onbGo') || document.querySelector('#onbMe') || document.querySelector('#onbSkip'))?.click());
    await sleep(1400);
  }
  await sleep(1800);
  return page;
}

const evq = p => p.evaluate(async () => (await (await import('./js/db.js')).kvGet('evq', [])) || []);
const clearq = p => p.evaluate(async () => (await import('./js/db.js')).kvSet('evq', []));
const tally = q => { const b = {}; for (const r of q) b[r.name] = (b[r.name] || 0) + 1; return b; };
/* Emit through the REAL exported track(). The returned promise is analytics.js's
   own writeChain, so awaiting the last one means every row is committed to kv. */
const emit = (p, rows) => p.evaluate(async list => {
  const a = await import('./js/analytics.js');
  let last;
  for (const [name, props] of list) last = a.track(name, props);
  await last;
}, rows);

const page = await openApp();

/* ============================ 1. REAL-WIN / PRESSURE =======================
   The headline, and it uses nothing synthetic: a real fight produces a real
   pit_win, then the real bottom nav drives the real router, which calls the real
   screen() and emits the real navigation pair. */
await clearq(page);
await page.evaluate(() => document.querySelector('#tabbar .tab[data-tab="today"]')?.click());
await sleep(900);
await page.evaluate(() => document.getElementById('pitBtn')?.click());
await sleep(1700);
const rungBox = await page.evaluate(() => {
  const b = document.querySelector('button[data-rung="1"]');
  if (!b || b.disabled) return null;
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
ok('REAL-WIN rung 1 is fightable (the subject of the whole audit)', !!rungBox, rungBox ? '' : 'no enabled button[data-rung="1"]');
if (rungBox) {
  await page.mouse.click(rungBox.x, rungBox.y);
  await sleep(2600);
  const inFight = await page.evaluate(() => !!window.__bhFight);
  ok('REAL-WIN a real fight started', inFight);
  if (inFight) { await page.evaluate(() => window.__bhFight.finish('p')); await sleep(2600); }
  await page.evaluate(() => { location.hash = '#/today'; });   // route() closes every sheet
  await sleep(1600);
}
const afterFight = await evq(page);
ok('REAL-WIN a real pit_win was emitted', afterFight.filter(r => r.name === 'pit_win').length === 1,
  `queue ${afterFight.length}: ${JSON.stringify(tally(afterFight))}`);

/* 170 real taps = 340 navigation rows, comfortably past the 300 cap, so the
   pit_win sits more than a whole cap's worth of rows from the end. */
const TAPS = 170, tabs = ['boneyard', 'friends', 'bonehead', 'today'];
for (let i = 1; i <= TAPS; i++) {
  await page.evaluate(t => document.querySelector(`#tabbar .tab[data-tab="${t}"]`)?.click(), tabs[i % 4]);
  await sleep(110);
}
await sleep(900);
const burst = await evq(page);
const bt = tally(burst);
const navRows = (bt.screen || 0) + (bt.screen_time || 0);

ok('PRESSURE the captured queue is not empty', burst.length > 0, `${burst.length} rows`);
ok('PRESSURE the burst overflowed the cap', afterFight.length + TAPS * 2 > QCAP,
  `${afterFight.length} + ${TAPS} taps x 2 = ${afterFight.length + TAPS * 2} rows emitted, cap ${QCAP}`);
ok(`PRESSURE the queue is sitting exactly at the cap`, burst.length === QCAP, `${burst.length}`);
ok('PRESSURE the burst was dominated by the common names', navRows >= 250,
  `screen+screen_time = ${navRows} of ${burst.length}`);
ok('REAL-WIN the pit_win survived the burst', burst.filter(r => r.name === 'pit_win').length === 1,
  JSON.stringify(bt));
ok('REAL-WIN the whole gameplay tail survived, not just pit_win',
  (bt.fight_start || 0) >= 1 && (bt.feat_open || 0) >= 1,
  `fight_start ${bt.fight_start || 0}, feat_open ${bt.feat_open || 0}`);
ok('ORDER the queue is still ascending by ts',
  burst.length > 0 && burst.every((r, i) => i === 0 || r.ts >= burst[i - 1].ts));

/* ============================== 2. ARITHMETIC ==============================
   Exact counts, adversarially ordered: the rare row goes FIRST, so under
   oldest-first it is the first thing thrown away. */
await clearq(page);
await emit(page, [['pit_win', { mode: 'rung' }], ...Array.from({ length: 500 }, (_, i) => ['screen_time', { s: 'today', ms: i }])]);
const arith = await evq(page);
const at = tally(arith);
ok('ARITHMETIC the captured queue is not empty', arith.length > 0, `${arith.length} rows`);
ok(`ARITHMETIC 501 rows in, exactly ${QCAP} survive`, arith.length === QCAP, `${arith.length}`);
ok('ARITHMETIC the one rare row is one of them', at.pit_win === 1, `pit_win ${at.pit_win || 0}`);
ok(`ARITHMETIC the common name absorbed the whole loss (${QCAP - 1})`, at.screen_time === QCAP - 1,
  `screen_time ${at.screen_time || 0}`);

/* ============================== 3. LEVELLING ===============================
   The live mix, scaled: screen_time 40%, feat_open 25%, screen 23%,
   session_ping 12%, plus one pit_win emitted FIRST. 1200 rows into a 300 cap.
   session_ping is the quiet one of the four AND the denominator of every
   play-time number, so "the loudest get ground down before the quiet tail is
   touched" is the property that keeps that denominator honest. */
await clearq(page);
const mix = [];
for (let i = 0; i < 1200; i++) {
  const r = i % 100;
  mix.push([r < 40 ? 'screen_time' : r < 65 ? 'feat_open' : r < 88 ? 'screen' : 'session_ping', { i }]);
}
await emit(page, [['pit_win', { mode: 'boss' }], ...mix]);
const lv = await evq(page);
const lt = tally(lv);
ok('LEVELLING the captured queue is not empty', lv.length > 0, `${lv.length} rows`);
ok('LEVELLING the rare row survived 1200 rows of live-shaped noise', lt.pit_win === 1, JSON.stringify(lt));
ok('LEVELLING the quiet common name was not starved', (lt.session_ping || 0) > 0, `session_ping ${lt.session_ping || 0}`);
const commons = ['screen_time', 'feat_open', 'screen', 'session_ping'].map(n => lt[n] || 0);
ok('LEVELLING the four common names were ground down toward each other',
  Math.max(...commons) - Math.min(...commons) <= 2,
  `screen_time ${commons[0]}, feat_open ${commons[1]}, screen ${commons[2]}, session_ping ${commons[3]}`);

/* ================================= 4. FIFO =================================
   The degenerate case: no name is commoner than any other, so there is nothing
   to prefer and the policy must fall back to oldest-first exactly as before.
   Synthetic names on purpose - the app has ~33 real names and this needs 400
   equally-common ones to make every count identical. */
await clearq(page);
await emit(page, Array.from({ length: 400 }, (_, i) => [`zz_probe_${i}`, { i }]));
const fifo = await evq(page);
ok('FIFO the captured queue is not empty', fifo.length > 0, `${fifo.length} rows`);
ok(`FIFO 400 equally-common names in, the newest ${QCAP} survive`,
  fifo.length === QCAP && fifo[0].name === 'zz_probe_100' && fifo[QCAP - 1].name === 'zz_probe_399',
  `${fifo.length} rows, head ${fifo[0]?.name}, tail ${fifo[QCAP - 1]?.name}`);

/* ================================== 5. ERR =================================
   'err' is the rarest name in the app by construction (ERR_CAP = 5 a session).
   Under oldest-first that rarity bought it nothing: a crash at the start of an
   offline stretch was the FIRST row navigation pushed out. */
await clearq(page);
await page.evaluate(() => { window.__errProbe = 1; });
await page.evaluate(() => new Promise(res => {
  const s = document.createElement('script');
  s.src = 'tests/fixtures/crashtest.js?bh-evq-marker';
  window.__crashMarker = 'bh-evq-marker'; window.__crashFull = 1;
  s.onload = res; s.onerror = res;
  document.head.appendChild(s);
}));
await sleep(1200);
const errBefore = (await evq(page)).filter(r => r.name === 'err').length;
ok('ERR a crash was queued to start with', errBefore > 0, `${errBefore} err rows`);
await emit(page, Array.from({ length: 600 }, (_, i) => ['screen_time', { s: 'today', ms: i }]));
const errAfter = await evq(page);
ok('ERR the captured queue is not empty', errAfter.length > 0, `${errAfter.length} rows`);
ok('ERR the crash rows survived 600 rows of navigation',
  errBefore > 0 && errAfter.filter(r => r.name === 'err').length === errBefore,
  `${errAfter.filter(r => r.name === 'err').length} of ${errBefore} left: ${JSON.stringify(tally(errAfter))}`);
await page.close();

/* ================================ 6. BOT GATE ==============================
   The probe must not be a hole: a webdriver page without it queues nothing. */
const clean = await openApp({ probe: false });
await clearq(clean);
for (let i = 1; i <= 6; i++) {
  await clean.evaluate(t => document.querySelector(`#tabbar .tab[data-tab="${t}"]`)?.click(), tabs[i % 4]);
  await sleep(220);
}
await emit(clean, [['pit_win', { mode: 'rung' }], ['screen_time', { s: 'today', ms: 1 }]]);
const botQ = await evq(clean);
ok('BOT GATE a webdriver session without __evProbe queues nothing', botQ.length === 0,
  `${botQ.length} rows: ${JSON.stringify(tally(botQ))}`);
await clean.close();

await browser.close();
srv?.close();
console.log(`\n${fails.length ? `FAILED ${fails.length}: ${fails.join(' | ')}` : 'ALL GREEN'}`);
process.exit(fails.length ? 1 : 0);

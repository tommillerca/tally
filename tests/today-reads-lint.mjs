/* DRAWING TODAY MUST NOT SCAN A STORE IT ALREADY HOLDS (QA round 25, M13).
 *
 * THE FINDING. At two years of data (17,343 rows) renderToday performed 13
 * full-store reads per draw, 700.8 to 797.9 ms inside them across five runs.
 * The trace (this file's PART A pins it):
 *   renderToday      db.all('log')  streak, priorFoodIds, quest logDays
 *   renderToday      db.all('xp')   pitTried, fightWins, quest counts
 *   renderToday      db.all('health') quest steps/active, today's sleep row
 *   refreshPitEnergy db.all('health') today's steps      (js/energy.js)
 *   unopenedCrates   db.all('inv')  crates               (js/loot.js)
 *   routinesDone     db.all('xp')   today's routine rows (js/wellness.js)
 *   ownedGearIds     db.all('inv')  gear set             (js/loot.js)
 *   buildFighter     db.all('log'), db.all('xp'), db.all('health'),
 *                    ownedGearIds -> db.all('inv'), db.all('xp') AGAIN
 * The last five re-read stores the SAME render had just read in full, so the
 * fix passes those rows into buildFighter and drops its second xp scan:
 * 13 reads become 7, and nothing Today shows changes (same rows, same order).
 *
 * The other seven are NOT date-keyed questions: a streak walks back until the
 * first gap, "have I eaten this food before" spans all history, quests count a
 * month, lifetime steps sum everything. db.byIndex('log','date',d) already
 * serves the only today-scoped log read (entriesFor, twice: today and
 * yesterday), so K = 2 index reads and the lint pins that too.
 *
 * WHY STATIC. renderToday lives in js/app.js, which cannot load in node (DOM at
 * module scope), so PART A counts db.all(...) per store in the SOURCE of
 * renderToday and buildFighter, and checks that renderToday hands buildFighter
 * the rows it holds. PART B drives the real js/db.js under tests/mem-idb.mjs
 * with 730 days x 4 entries and proves the index read that Today relies on:
 * zero full scans, exactly one index read, result identical to the filtered
 * full scan (the correctness control the ticket asked for).
 *
 * PROVE-RED (run 2026-09-04 against integ/playtest-round-a bac126c0):
 *   A2 buildFighter reads 'xp' twice            expected 1 got 2   js/app.js:20107
 *   A3 renderToday calls buildFighter() bare    js/app.js:3738 (A4 red too: no `pre`)
 * PART B is a control on the index shim and js/db.js: it is green on the
 * integ tip too, and says so in its own output.
 *
 * KNOWN CEILING: regexes over source, not an AST. A db.all call spelled through
 * a variable or a helper hides from PART A; the empty-sample guard (both
 * function bodies must be found and non-trivial) fails rather than passing on
 * nothing.
 *
 * Static only, no browser, under 1s.   node tests/today-reads-lint.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './mem-idb.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

let fails = 0;
const ok = (m, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${m}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

/* ---------- PART A: the source of the Today load ---------- */
// body of a top-level `async function name(` up to the first line that is a bare `}`
function fnBody(name) {
  const start = src.indexOf(`\nasync function ${name}(`);
  if (start < 0) return null;
  const end = src.indexOf('\n}\n', start);
  // comments stripped: the fix's own comments quote the bug (`buildFighter()`, `db.all('xp')`)
  const body = src.slice(start + 1, end + 2).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const line = src.slice(0, start + 1).split('\n').length;
  return { body, line, lines: body.split('\n').length };
}
const today = fnBody('renderToday');
const fighter = fnBody('buildFighter');
ok('SAMPLE renderToday and buildFighter both found and non-trivial',
  today && fighter && today.lines > 100 && fighter.lines > 30,
  `renderToday ${today?.lines} lines @${today?.line}, buildFighter ${fighter?.lines} lines @${fighter?.line}`);
if (!today || !fighter) { console.log(`\n${fails} failed`); process.exit(1); }

const reads = body => {
  const n = {};
  for (const m of body.matchAll(/db\.all\('(\w+)'\)/g)) n[m[1]] = (n[m[1]] || 0) + 1;
  return n;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tr = reads(today.body), fr = reads(fighter.body);
ok('A1 renderToday scans log, xp, health once each and nothing else',
  same(tr, { log: 1, xp: 1, health: 1 }), JSON.stringify(tr));
ok('A2 buildFighter scans log, xp, health once each (the second xp scan is gone)',
  same(fr, { log: 1, xp: 1, health: 1 }), JSON.stringify(fr));
ok('A3 renderToday hands buildFighter the rows it already holds',
  /buildFighter\(\{[^)]*log: allLog[^)]*xpRows: allXp[^)]*health: healthRows[^)]*gOwned: unlockGear/.test(today.body)
  && !/buildFighter\(\)/.test(today.body));
ok('A4 buildFighter falls back to its own scans when not handed rows',
  /pre\.log \|\| db\.all\('log'\)/.test(fighter.body) && /pre\.xpRows \|\| db\.all\('xp'\)/.test(fighter.body)
  && /pre\.health \|\| db\.all\('health'\)/.test(fighter.body) && /pre\.gOwned \|\| ownedGearIds\(\)/.test(fighter.body));
const K = (today.body.match(/await entriesFor\(/g) || []).length;
ok('A5 K = 2: the only log index reads on Today are today and yesterday (entriesFor)', K === 2, `K=${K}`);
ok('A6 renderToday itself issues no db.byIndex outside entriesFor', !/db\.byIndex\(/.test(today.body));

/* ---------- PART B: the index read Today relies on, under the real js/db.js ---------- */
const { db, useDbName, newId } = await import('../js/db.js');
useDbName('today-reads-lint');
const READS = globalThis.__memIdbReads;

// 730 days x 4 entries, dates pinned so the run is identical at 23:59 and 00:01
const DAYS = 730, PER = 4, base = Date.UTC(2029, 0, 1);
const key = i => new Date(base + i * 864e5).toISOString().slice(0, 10);
const puts = [];
for (let i = 0; i < DAYS; i++) for (let j = 0; j < PER; j++) {
  puts.push(db.put('log', { id: newId(), date: key(i), meal: j, ts: base + i * 864e5 + j * 3600e3, name: `food ${i}-${j}`, kcal: 100 + j }));
}
await Promise.all(puts);
const TODAY = key(DAYS - 1);
ok('SAMPLE the seeded log holds 730 x 4 rows', (await db.count('log')) === DAYS * PER, `count=${await db.count('log')}`);

READS.full = 0; READS.index = 0;
const viaIndex = await db.byIndex('log', 'date', TODAY);
ok('B1 db.byIndex performs no full-store scan and exactly one index read',
  READS.full === 0 && READS.index === 1, `full=${READS.full} index=${READS.index}`);

READS.full = 0; READS.index = 0;
const viaScan = (await db.all('log')).filter(r => r.date === TODAY);
ok('B2 control: db.all is one full scan', READS.full === 1 && READS.index === 0, `full=${READS.full}`);
const byId = rows => rows.map(r => r.id).sort().join(',');
ok('B3 the index read returns exactly the rows the filtered full scan returns',
  viaIndex.length === PER && byId(viaIndex) === byId(viaScan), `${viaIndex.length} rows`);

/* Timing, for the record only (NOT asserted: mem-idb is a Map filter in the
   same process, not IndexedDB on a device; the ticket's 0.5 ms / 3.8 ms were
   measured in the browser). Method: 20 warm calls each, median of
   performance.now() deltas. */
const med = a => a.sort((x, y) => x - y)[a.length >> 1];
const tI = [], tS = [];
for (let i = 0; i < 20; i++) {
  let t0 = performance.now(); await db.byIndex('log', 'date', TODAY); tI.push(performance.now() - t0);
  t0 = performance.now(); (await db.all('log')).filter(r => r.date === TODAY); tS.push(performance.now() - t0);
}
console.log(`info mem-idb, ${DAYS * PER} rows, median of 20: byIndex ${med(tI).toFixed(2)} ms, full scan + filter ${med(tS).toFixed(2)} ms`);

console.log(fails ? `\n${fails} failed` : '\nall green');
process.exit(fails ? 1 : 0);

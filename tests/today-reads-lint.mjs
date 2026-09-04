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
 * QA ROUND 28 G3 (2026-09-04): THE GUARD WAS NARROWER THAN ITS NAME. PART A
 * graded renderToday's BODY and called the Today load {log, xp, health}, while
 * the screen a player opens paid three whole-inv scans per draw from outside
 * that body (unopenedCrates and ownedGearIds called BY renderToday, and route()'s
 * refreshCrateBadge in the same tick), a second xp scan in routinesDone, a third
 * in totalXp's rebuild, and a health scan in hkStaleInfo. "Scoped to a function
 * while the player pays elsewhere" is the sixth shape on the list.
 * PART A now grades the WHOLE DRAW: renderToday plus every function it calls,
 * transitively, across js/ (a call inside an addEventListener(...) runs on a
 * tap, not in the draw, and is stripped; `x || db.all('s')` / `x || f()` is a
 * hand-down fallback, not a read, and is stripped; a callee called twice is
 * counted twice). The fix reads inv and xp once in renderToday and hands the
 * rows to unopenedCrates, ownedGearIds, routinesDone, hkStaleInfo and the crate
 * badge; the level is summed off the xp rows in hand. Asserted whole-draw
 * reads: exactly {health: 1, inv: 1, log: 1, xp: 1}.
 * Three reads under buildFighter's pet lookup run ONCE (a session flag, two kv
 * migrations) and are exempt by name, each exemption pinning the guard text it
 * relies on (GATE rows): remove the guard and the read is counted again.
 * PROVE-RED on main (7d2b4ce5, v472), run 2026-09-04:
 *   `node tests/today-reads-lint.mjs <main root>`
 *   A1  whole draw   expected {health:1,inv:1,log:1,xp:1}  got {health:2,inv:3,log:1,xp:3}
 *   A1b renderToday  {log:1,xp:1,health:1}, no inv read of its own
 *   A7  route() fires refreshCrateBadge on Today (the third inv reader)
 *   A8  no hand-downs to unopenedCrates/ownedGearIds/routinesDone/hkStaleInfo
 *
 * Static only, no browser, under 1s.   node tests/today-reads-lint.mjs [root]
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './mem-idb.mjs';

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
const sorted = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

/* THE WHOLE DRAW (QA round 28 G3). Every `function name(` in js/ with a
   brace-balanced body, then the closure from renderToday: a function's reads
   are its own db.all calls plus, for EACH call occurrence, its callee's reads.
   Stripped before counting, and each printed under VERBOSE:
     - addEventListener(...) argument lists: a tap, not the draw;
     - `x || db.all('s')` and `x || f()` fallbacks: a hand-down the caller
       satisfied (A4/A8 pin that the hand-downs exist), not a read.
   Recursion is cut by the visiting set; a helper spelled through a variable
   still hides (same ceiling as before, now written on a bigger box). */
const files = new Map();
for (const f of readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js'))) files.set(f, readFileSync(path.join(ROOT, 'js', f), 'utf8'));
/* A body runs to the first line that is a bare `}` (this tree's top-level
   functions all close that way, and fnBody above relies on it too). A brace
   balancer was tried first and lost its place in renderToday's nested template
   literals, silently dropping the second half of the function, buildFighter
   and hkStaleInfo with it: the SAMPLE row's function count is the tell. */
const stripComments = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FNS = new Map();
for (const [f, s] of files) for (const m of s.matchAll(/^(?:export )?(?:async )?function\s+([\w$]+)\s*\(/gm)) {
  const eol = s.indexOf('\n', m.index);
  const oneLiner = /\{.*\}\s*$/.test(s.slice(m.index, eol));   // `export async function inventory() { return db.all('inv'); }`
  const end = oneLiner ? eol : s.indexOf('\n}\n', m.index);
  if (!FNS.has(m[1])) FNS.set(m[1], { file: f, line: s.slice(0, m.index).split('\n').length, body: stripComments(s.slice(m.index, end < 0 ? s.length : end + 2)) });
}
const stripped = [];
function drawBody(name, body) {
  let out = '', i = 0;   // addEventListener(...) argument lists out
  for (;;) {
    const k = body.indexOf('addEventListener(', i);
    if (k < 0) { out += body.slice(i); break; }
    out += body.slice(i, k);
    let d = 0, j = k + 'addEventListener'.length;
    for (; j < body.length; j++) { if (body[j] === '(') d++; else if (body[j] === ')' && --d === 0) break; }
    stripped.push(`${name}: listener ${body.slice(k, Math.min(j + 1, k + 60)).replace(/\s+/g, ' ')}...`);
    i = j + 1;
  }
  return out.replace(/[\w$]+(?:\.[\w$]+)*\s*\|\|\s*(?:await\s+)?(db\.all\('\w+'\)|[\w$]+\(\))/g, (m0, call) => { stripped.push(`${name}: fallback ${m0}`); return `__handed__(${call.replace(/\(.*$/, '')})`; });
}
/* GATED READS: a scan that runs ONCE (per session or per install) and then
   returns a cached value is not a per-draw read, but the static count cannot
   see the gate, so each exemption here PINS the guard it relies on. If the
   guard text goes, the exemption dissolves, the reads are counted, and A1 goes
   red: an exemption is a guard told not to look (QA round 28 G1), so it must at
   least look at its own reason. Both sit under buildFighter's pet lookup. */
const GATED = {
  reclaimOwnedPets: { pin: /if \(_petsReclaimed\) return list;/, why: 'once per session (module flag), then a no-op' },
  petLevelBank: { pin: /if \(bank && ver >= 2\) return bank;/, why: 'once per install (kv migration), then the cached bank' },
  // its own ownedCosmeticIds read sits AFTER the `Array.isArray(list)` branch returns: the first-run migration only
  petInstances: { pin: /return reclaimOwnedPets\(list\);\s*\}\s*const owned = await ownedCosmeticIds\(\);/, why: 'once per install (petInst migration), then the kv list' },
};
const visiting = new Set();
const drawReads = new Map();   // name -> {store: n}
function readsOf(name, via) {
  if (drawReads.has(name)) return drawReads.get(name);
  if (visiting.has(name) || !FNS.has(name)) return {};
  visiting.add(name);
  const fn = FNS.get(name);
  if (GATED[name] && GATED[name].pin.test(fn.body)) { trace.push(`(gated) ${name}: ${GATED[name].why}`); visiting.delete(name); drawReads.set(name, {}); return {}; }
  const body = drawBody(name, fn.body);
  const n = reads(body);
  for (const st of Object.keys(n)) trace.push(`${st} x${n[st]}  in ${name} (${fn.file}:${fn.line}) via ${[...visiting].join(' > ')}`);
  /* EDGES ARE THE AWAITED CALLS (plus `return f(...)` in a thin wrapper such as
     totalXp -> rebuildXpTotal and inventory -> db.all). A store read is async,
     so a callee that reads in THIS draw is one the draw waits for; a bare
     `f()` is a fire-and-forget (route()'s refreshCrateBadge, handled by name
     below), a toast, or a later tick. Walking every call instead reached
     route() through refresh() and graded the whole app (health: 392). */
  const edges = [...body.matchAll(/\bawait\b[^;\n]*/g), ...body.matchAll(/\breturn\s+\(?[A-Za-z_$][\w$]*\([^;\n]*/g)].map(m => m[0]).join('\n');
  for (const m of edges.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (m[1] === name || m[1] === '__handed__') continue;
    for (const [st, c] of Object.entries(readsOf(m[1], name))) { n[st] = (n[st] || 0) + c; if (c) trace.push(`  ${st} x${c} via call ${m[1]}() in ${name}: ${m[0]}`); }
  }
  visiting.delete(name);
  drawReads.set(name, n);
  return n;
}
const trace = [];
const draw = { ...readsOf('renderToday', 'root') };
/* route() runs renderToday and, in the same tick, refreshCrateBadge unless the
   Today branch is skipped: that is a fourth reader of inv the draw pays for. */
const routeBody = FNS.get('route')?.body || '';
const badgeOnToday = /refreshCrateBadge\(\)/.test(routeBody) && !/tab !== 'today'\)\s*refreshCrateBadge\(\)/.test(routeBody);
if (badgeOnToday) for (const [st, c] of Object.entries(readsOf('refreshCrateBadge', 'route'))) draw[st] = (draw[st] || 0) + c;
if (process.env.VERBOSE) { for (const t of trace) console.log('read    ', t); for (const t of stripped) console.log('stripped', t); }

ok('SAMPLE the closure from renderToday walked a real call graph', drawReads.size >= 40 && Object.keys(draw).length >= 3,
  `${drawReads.size} functions, ${trace.length} reading sites, ${stripped.length} listener/fallback strips`);
for (const [name, g] of Object.entries(GATED)) ok(`GATE ${name} still carries the once-guard its exemption pins (${g.why})`, !!FNS.get(name) && g.pin.test(FNS.get(name).body), String(g.pin));
ok('A1 the WHOLE Today draw (renderToday and everything it calls in the tick) scans log, xp, health and inv exactly once each',
  same(draw, { log: 1, xp: 1, health: 1, inv: 1 }), JSON.stringify(sorted(draw)) + (process.env.VERBOSE ? '' : '  (VERBOSE=1 lists every reading site)'));
const tr = reads(today.body), fr = reads(fighter.body);
ok('A1b renderToday itself scans log, xp, health, inv once each and nothing else',
  same(tr, { log: 1, xp: 1, health: 1, inv: 1 }), JSON.stringify(tr));
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
ok('A7 route() does not fire refreshCrateBadge on Today (renderToday sets the badge off the inv rows it holds)',
  !badgeOnToday && /setCrateBadge\(crates\.length\)/.test(today.body));
ok('A8 renderToday hands its inv, xp and health rows to unopenedCrates, ownedGearIds, routinesDone and hkStaleInfo',
  /unopenedCrates\(inv\)/.test(today.body) && /ownedGearIds\(inv\)/.test(today.body)
  && /routinesDone\(S\.date, allXp\)/.test(today.body) && /hkStaleInfo\(healthRows\)/.test(today.body) && !/await totalXp\(\)/.test(today.body));

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

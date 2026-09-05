/* THE RETURNING PLAYER'S OWED DAY CLOSE, AND THE CEILING A RESTORE MUST NOT ROLL BACK.
 *
 * Round 33, LAPSE-1 and LAPSE-2. Two bugs a player hits only by coming back.
 *
 * LAPSE-1. After a gap of 8+ days every daily gate is refused by rule 3 of the
 * day guard (js/db.js claimDay, reason `unwitnessed`) until GET /health answers
 * with a server day. js/social.js bootSync fired touchServerDay() and walked on
 * fire-and-forget, so the answer lost the race with the rest of boot() and
 * awardDayCloseIfDue (js/game.js) read a stale ceiling: the Bone Crate the
 * player EARNED on their last logged day never paid, and Today said nothing.
 * Fix, both halves: settleServerDay() awaits the witness with a bounded 1.5 s
 * wait, only on a gap open; renderToday prints DAY_GUARD_COPY.unwitnessed when
 * the gate really does stand.
 *
 * LAPSE-2. dayWitnessOrd and dayHighWater are the two halves of the same
 * ceiling. importAll kept the higher of the two for the witness only, so a
 * restore carrying an older dayHighWater rolled rule 1's mark backwards.
 *
 * ROWS (LAPSE-1)
 *   SEED      a 14-day gap really is refused as `unwitnessed`, and the gap day
 *             really does hold logged rows. Green on main: this is the row that
 *             proves the scenario is the bug's scenario and not an empty save.
 *   NO-PAY    with the ceiling stale, awardDayCloseIfDue pays nothing and mints
 *             no ledger row. Green on main; it must STAY true after the fix,
 *             because the guard's decision is not what is being changed.
 *   VOICE     dayIsUnwitnessed(today) is true in that state, and renderToday
 *             renders DAY_GUARD_COPY.unwitnessed off that same flag.
 *   OFFLINE   a return with no network still boots: settleServerDay gives up
 *             fast, resolves false, and nothing pays.
 *   BOUND     a server that answers only after 2.5 s does NOT hold the boot:
 *             settleServerDay returns inside the 1.5 s bound (and did really
 *             wait, so the row cannot pass by returning instantly).
 *   PAYS      the witness landing INSIDE the bound pays the owed close: the
 *             golden crate and the dayclose ledger row for the gap day.
 *   ORDER     boot() and the resume handler both settle before the day close
 *             they lead into, so the helper cannot ship inert.
 *
 * ROWS (LAPSE-2)
 *   CLOUD     a merge restore (replace:false, the cloud pull) carrying a
 *             30-day-older ceiling leaves both marks where they were.
 *   FILE      the same for the Settings file restore (replace:true).
 *   HIGHER    a payload carrying a NEWER ceiling still wins. The control: the
 *             rule is "keep the higher", not "ignore the payload", and without
 *             this row a hard-coded "never move" would pass.
 *
 * PROVE-RED on origin/main (v473, 63367157) in a throwaway detached tree, 9
 * FAILED, quoted verbatim:
 *   FAIL EXPORTS the fix's two entry points exist  js/db.js dayIsUnwitnessed: no, js/social.js settleServerDay: no
 *   FAIL VOICE dayIsUnwitnessed(today) is true, and Today renders DAY_GUARD_COPY.unwitnessed off it  predicate Symbol(missing), template wired false
 *   FAIL OFFLINE no network: settleServerDay gives up fast, resolves false, nothing pays  settled Symbol(missing) in 0ms, paid null
 *   FAIL BOUND a 2.5s server does not hold the boot: settled inside the 1.5s bound, having waited  settled Symbol(missing) in 0ms (want 1000..2200), paid null
 *   FAIL PAYS the witness inside the bound pays the owed close  settled Symbol(missing), closed null, ledger no
 *   FAIL ORDER both js/app.js day-close call sites settle first  0 call sites, boot false, resume false
 *   FAIL CLOUD merge restore with a 30-day-older ceiling leaves both marks alone  witness 20670 -> 20700 (want 20700), highWater 2026-08-05 -> 2026-08-05 (want 2026-09-04)
 *   FAIL FILE file restore with a 30-day-older ceiling leaves both marks alone  witness 20670 -> 20700 (want 20700), highWater 2026-08-05 -> 2026-08-05 (want 2026-09-04)
 *   FAIL ESCAPE no request left the process  0 fetches, 0 blocked
 * SEED, NO-PAY, SAMPLE and HIGHER are green on main and MUST be: they are the
 * rows that prove the scenario is real and that the ceiling rule is "keep the
 * higher" rather than "never move". ESCAPE goes red on main only because the
 * missing helper makes its denominator zero, which is the right answer to an
 * empty sample. Note the two restore rows: the WITNESS already survives on main
 * (importAll kept the higher of the two for that key alone); it is dayHighWater,
 * the other half of the same ceiling, that comes back 30 days rolled back.
 *
 * THE WHOLE Date IS FAKED, not just Date.now: dateKey() reads `new Date()`
 * (js/nutrition.js), so moving Date.now alone never moves the app's today.
 * NOTHING LEAVES THE MACHINE: globalThis.fetch is replaced and every URL that
 * is not the loopback sentinel is recorded and refused, and the ESCAPE row
 * fails if any was tried.
 *
 * PURE: node only, no browser, about 4s.   node tests/lapse-witness-audit.mjs
 */
import { readFileSync } from 'node:fs';
import './mem-idb.mjs';   // installs globalThis.indexedDB before js/db.js opens it

/* ---- fake the WHOLE Date before anything reads it ---- */
/* O14 (round 26, merged 2026-09-04): a refused close returns {dayGuard: reason} rather than
   null, so that the surfaces can explain themselves. These rows grade whether anything was
   PAID, which is the same fact under either shape. */
const didNotPay = c => c === null || !!(c && c.dayGuard);

const RealDate = Date;
const realNow = () => RealDate.now();
let NOW = RealDate.parse('2026-09-04T12:00:00Z');
class FakeDate extends RealDate {
  constructor(...a) { super(...(a.length ? a : [NOW])); }
  static now() { return NOW; }
}
globalThis.Date = FakeDate;

/* ---- the wall: no request may leave this process ---- */
const SENTINEL = 'http://127.0.0.1:9';
const escaped = [];
let fetchMode = 'reject';                  // reject | fast | slow
let fetchCalls = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
globalThis.fetch = async (url) => {
  fetchCalls++;
  const u = String(url);
  if (!u.startsWith(SENTINEL)) { escaped.push(u); throw new Error('blocked by the audit wall: ' + u); }
  if (fetchMode === 'reject') throw new Error('offline');
  if (fetchMode === 'fast') { await sleep(120); return { ok: true, json: async () => ({ ok: true, ts: NOW }) }; }
  await sleep(2500); return { ok: false, json: async () => ({ ok: false }) };   // answers past the bound
};

const D = await import('../js/db.js');
const S = await import('../js/social.js');
const { awardDayCloseIfDue } = await import('../js/game.js');
const { dateKey, addDays, dayOrdinal } = await import('../js/nutrition.js');
const { db, kvGet, kvSet, useDbName, importAll, exportAll, claimDay } = D;

const MISSING = Symbol('missing');
const dayIsUnwitnessed = D.dayIsUnwitnessed || (async () => MISSING);
const settleServerDay = S.settleServerDay || (async () => MISSING);

const out = [];
let fails = 0;
const ok = (m, cond, detail = '') => {
  if (cond) out.push(`ok   ${m}${detail ? '  ' + detail : ''}`);
  else { fails++; out.push(`FAIL ${m}${detail ? '  ' + detail : ''}`); }
};

const TARGETS = { kcal: 2000, p: 120 };
const TODAY = dateKey();
const GAP = addDays(TODAY, -14);
const DAY_MS = 86400000;

/* A save that logged its last day 14 days ago, on budget, and whose ceilings
   both stopped moving that same day. That is exactly what a phone left in a
   drawer looks like: nothing wrong with it, just not opened. */
async function seedLapsedSave(name) {
  useDbName(name);
  await db.put('log', { id: 'gap-1', date: GAP, meal: 0, name: 'Oats', kcal: 900, p: 60, c: 100, f: 20 });
  await db.put('log', { id: 'gap-2', date: GAP, meal: 2, name: 'Chili', kcal: 900, p: 70, c: 60, f: 30 });
  await kvSet('apiBase', SENTINEL);
  await kvSet('dayHighWater', GAP);
  await kvSet('dayPaceKey', GAP);
  await kvSet('dayPaceAt', NOW - 14 * DAY_MS);
  await kvSet(D.DAY_WITNESS_KEY, Math.floor((NOW - 14 * DAY_MS) / DAY_MS));
  return { rows: (await db.all('log')).filter(r => r.date === GAP).length };
}
const paidRow = async () => (await db.all('xp')).filter(r => r.type === 'dayclose' || r.type === 'dayeffort').length;

ok('EXPORTS the fix\'s two entry points exist',
  typeof D.dayIsUnwitnessed === 'function' && typeof S.settleServerDay === 'function',
  `js/db.js dayIsUnwitnessed: ${typeof D.dayIsUnwitnessed === 'function' ? 'yes' : 'no'}, js/social.js settleServerDay: ${typeof S.settleServerDay === 'function' ? 'yes' : 'no'}`);

/* ================= LAPSE-1 ================= */

const seed = await seedLapsedSave('lapse-witness-a');
const gate = await claimDay(TODAY);
ok('SEED a 14-day gap holds logged rows and is refused as `unwitnessed`',
  seed.rows === 2 && gate.fresh === false && gate.reason === 'unwitnessed',
  `${seed.rows} rows on ${GAP}, claimDay(${TODAY}) -> ${gate.reason}`);

let before = await paidRow();
let closed = await awardDayCloseIfDue(TARGETS);
let after = await paidRow();
ok('NO-PAY a stale ceiling pays nothing and mints no ledger row',
  didNotPay(closed) && before === 0 && after === 0, `closed ${JSON.stringify(closed)}, ledger ${before} -> ${after}`);

const predicate = await dayIsUnwitnessed(TODAY);
/* The line itself needs a DOM to render, which this audit does not have, so the
   WIRING is read off the source: the flag comes from the predicate and the copy
   comes from DAY_GUARD_COPY, which is what stops the two drifting. The STATE
   (is the gate standing right now) is executed above and below. */
const APP = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const wired = /const unwitnessed = [^\n]*dayIsUnwitnessed\(/.test(APP)
  && /\$\{unwitnessed \?[\s\S]{0,200}?DAY_GUARD_COPY\.unwitnessed/.test(APP)
  && /^\s*unwitnessed: '.+'/m.test(APP);
ok('VOICE dayIsUnwitnessed(today) is true, and Today renders DAY_GUARD_COPY.unwitnessed off it',
  predicate === true && wired, `predicate ${String(predicate)}, template wired ${wired}`);

await seedLapsedSave('lapse-witness-b');
fetchMode = 'reject';
let t0 = realNow();
let settled = await settleServerDay(TODAY);
let elapsed = realNow() - t0;
closed = await awardDayCloseIfDue(TARGETS);
ok('OFFLINE no network: settleServerDay gives up fast, resolves false, nothing pays',
  settled === false && elapsed < 500 && didNotPay(closed) && (await paidRow()) === 0,
  `settled ${String(settled)} in ${elapsed}ms, paid ${JSON.stringify(closed)}`);

await seedLapsedSave('lapse-witness-c');
fetchMode = 'slow';
t0 = realNow();
settled = await settleServerDay(TODAY);
elapsed = realNow() - t0;
closed = await awardDayCloseIfDue(TARGETS);
ok('BOUND a 2.5s server does not hold the boot: settled inside the 1.5s bound, having waited',
  settled === false && elapsed >= 1000 && elapsed <= 2200 && didNotPay(closed) && (await paidRow()) === 0,
  `settled ${String(settled)} in ${elapsed}ms (want 1000..2200), paid ${JSON.stringify(closed)}`);

await seedLapsedSave('lapse-witness-d');
fetchMode = 'fast';
settled = await settleServerDay(TODAY);
closed = await awardDayCloseIfDue(TARGETS);
const ledger = (await db.all('xp')).find(r => r.key === `dayclose-${GAP}`);
ok('PAYS the witness inside the bound pays the owed close',
  settled === true && closed?.closed === true && closed?.date === GAP && closed?.gap === true && !!ledger,
  `settled ${String(settled)}, closed ${JSON.stringify(closed)}, ledger ${ledger ? 'yes' : 'no'}`);

/* A helper nothing calls before the close is a seam with no consumer, and the
   node rows above would still be green. Both call sites, in order. */
const calls = [...APP.matchAll(/social\.settleServerDay\(/g)].map(m => m.index);
const bootClose = APP.indexOf('\n  const closed = await awardDayCloseIfDue(S.settings.targets);');
const resumeRoll = APP.indexOf('\n    rollDayIfNeeded(); nativeAutoSync();');
const bootOrder = bootClose > 0 && calls.some(i => i < bootClose && bootClose - i < 600);
const rollOrder = resumeRoll > 0 && calls.some(i => i < resumeRoll && resumeRoll - i < 900);
ok('ORDER both js/app.js day-close call sites settle first',
  calls.length === 2 && bootOrder && rollOrder,
  `${calls.length} call sites, boot ${bootOrder}, resume ${rollOrder}`);

/* ================= LAPSE-2 ================= */

/* A device standing on today with both marks current, handed a save whose
   ceiling stopped 30 days ago. That is an ordinary cloud pull on a phone that
   has been used since the backup was written. */
async function restoreOlderCeiling(name, replace) {
  useDbName(name);
  await db.put('log', { id: 'r-1', date: TODAY, meal: 0, name: 'Oats', kcal: 400, p: 20, c: 50, f: 10 });
  await kvSet('dayHighWater', TODAY);
  await kvSet(D.DAY_WITNESS_KEY, Math.floor(NOW / DAY_MS));
  const payload = await exportAll();
  const old = { hw: addDays(TODAY, -30), w: Math.floor((NOW - 30 * DAY_MS) / DAY_MS) };
  payload.kv = payload.kv.map(r => r.k === 'dayHighWater' ? { k: r.k, v: old.hw }
    : r.k === D.DAY_WITNESS_KEY ? { k: r.k, v: old.w } : r);
  const kvCount = payload.kv.length;
  await importAll(payload, { replace });
  return { kvCount, old, witness: Number(await kvGet(D.DAY_WITNESS_KEY, 0)) || 0, hw: await kvGet('dayHighWater', null) };
}

const nowOrd = Math.floor(NOW / DAY_MS);
const cloud = await restoreOlderCeiling('lapse-restore-cloud', false);
ok('SAMPLE the restore payload carries kv rows at all', cloud.kvCount >= 2, `${cloud.kvCount} kv rows`);
ok('CLOUD merge restore with a 30-day-older ceiling leaves both marks alone',
  cloud.witness === nowOrd && cloud.hw === TODAY,
  `witness ${cloud.old.w} -> ${cloud.witness} (want ${nowOrd}), highWater ${cloud.old.hw} -> ${cloud.hw} (want ${TODAY})`);

const file = await restoreOlderCeiling('lapse-restore-file', true);
ok('FILE file restore with a 30-day-older ceiling leaves both marks alone',
  file.witness === nowOrd && file.hw === TODAY,
  `witness ${file.old.w} -> ${file.witness} (want ${nowOrd}), highWater ${file.old.hw} -> ${file.hw} (want ${TODAY})`);

/* CONTROL. The rule is "keep the higher", not "never move": a payload from a
   device that has stood on a LATER day still raises the ceiling. Without this
   row a hard-coded refusal would pass every row above. */
useDbName('lapse-restore-higher');
await db.put('log', { id: 'h-1', date: TODAY, meal: 0, name: 'Oats', kcal: 400, p: 20, c: 50, f: 10 });
await kvSet('dayHighWater', TODAY);
await kvSet(D.DAY_WITNESS_KEY, nowOrd);
const up = await exportAll();
const newer = addDays(TODAY, 3);
up.kv = up.kv.map(r => r.k === 'dayHighWater' ? { k: r.k, v: newer }
  : r.k === D.DAY_WITNESS_KEY ? { k: r.k, v: nowOrd + 3 } : r);
await importAll(up, { replace: true });
const hiHw = await kvGet('dayHighWater', null);
const hiW = Number(await kvGet(D.DAY_WITNESS_KEY, 0)) || 0;
ok('HIGHER a payload carrying a NEWER ceiling still wins',
  hiHw === newer && hiW === nowOrd + 3 && dayOrdinal(newer) > dayOrdinal(TODAY),
  `highWater ${TODAY} -> ${hiHw} (want ${newer}), witness ${nowOrd} -> ${hiW}`);

ok('ESCAPE no request left the process', escaped.length === 0 && fetchCalls > 0,
  `${fetchCalls} fetches, ${escaped.length} blocked${escaped.length ? ': ' + escaped.join(', ') : ''}`);

console.log(out.join('\n'));
console.log(fails ? `\n${fails} FAILED` : "\na returning player's owed day close pays, says why when it cannot, and a restore cannot lower the ceiling");
process.exit(fails ? 1 : 0);

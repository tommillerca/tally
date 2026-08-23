/* EVERY WRITE PATH REPORTS ITS OWN FAILURE, AND ONLY ITS FAILURES.
 *
 * js/db.js carries a failure seam: a rejected write is announced to a sink and
 * then RE-THROWN unchanged. This audit pins the two halves that are easy to get
 * wrong, and one that only exists on v417.
 *
 * WHY THE ATOMIC PRIMITIVES ARE IN SCOPE. When the seam was first written every
 * payout went through db.put, so wrapping put/del/clear covered the money. The
 * reward SOP (CLAUDE.md, 2026-08-17) now REQUIRES payouts to go through
 * addIfAbsent / take / kvUpdate / kvBump, and those open their own transactions
 * without touching tx() or db.put. A seam that covers only put/del/clear would
 * therefore look complete and silently miss every coin, crate, pet and XP row.
 * DIRECTION OF FAILURE: an unreported rejection, not a reported one.
 *
 * AND ONLY FAILURES. Each primitive has a legitimate falsy answer (addIfAbsent
 * false, take undefined, kvUpdate undefined). Reporting those would fire on every
 * correctly-refused double claim, which is the same conflation the SOP calls out
 * in award(). A seam that shouts on a refused duplicate is worse than no seam.
 *
 * LOCAL TREE, EXPLICITLY. boot() defaults to the LIVE PRODUCTION SITE, so a bare
 * boot() would grade tommillerca.github.io and prove nothing about this branch.
 * serveTree() returns { url, port, close } and the key is `url`, not `base`:
 * boot(srv.base) would be boot(undefined) and silently fall back to production.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { boot, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0, checked = 0;
const ok = (name, cond, detail) => {
  checked++;
  if (cond) { console.log(`  ok    ${name}`); return; }
  failed++; console.log(`  FAIL  ${name}\n        ${detail}`);
};

const srv = await serveTree(ROOT);
if (!srv || typeof srv.url !== 'string' || !srv.url.startsWith('http://127.0.0.1:')) {
  console.log(`FAIL  serveTree did not return a local url (got ${JSON.stringify(srv && srv.url)})`);
  process.exit(1);
}
const { browser, page } = await boot(srv.url);

const res = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const seen = [];
  db.onWriteFailure(info => seen.push(info));
  const out = { seen, rethrew: {}, resolved: {}, quiet: {} };
  const BAD = '__no_such_store__';
  out.origin = location.origin;

  /* POSITIVE CONTROL. Every "reported exactly once" below would also pass if the
     sink fired on EVERY write, which is the failure mode where the seam looks
     wired and is actually just noise. So first prove a write that SUCCEEDS
     reports nothing at all. If this number is not 0, nothing further in this
     file means anything. */
  const okBefore = seen.length;
  await db.db.put('kv', { k: 'seam-control-probe', v: 1 });
  await db.kvUpdate('seam-control-probe', () => 2);
  out.control = { reportsOnSuccess: seen.length - okBefore, stored: await db.kvGet('seam-control-probe', null) };
  await db.db.del('kv', 'seam-control-probe');

  const rejects = async (label, fn) => {
    const before = seen.length;
    let threw = false;
    try { await fn(); } catch { threw = true; }
    out.rethrew[label] = threw;
    return seen.length - before;
  };

  // --- the six write paths, each forced to reject ---
  out.reported = {};
  out.reported.put         = await rejects('put',         () => db.db.put(BAD, { id: 1 }));
  out.reported.del         = await rejects('del',         () => db.db.del(BAD, 'k'));
  out.reported.clear       = await rejects('clear',       () => db.db.clear(BAD));
  out.reported.addIfAbsent = await rejects('addIfAbsent', () => db.addIfAbsent(BAD, { key: 'x' }));
  out.reported.take        = await rejects('take',        () => db.take(BAD, 'x'));
  out.reported.kvUpdate    = await rejects('kvUpdate',    () => db.kvUpdate('coins', () => { throw new Error('boom'); }));

  // --- legitimate falsy answers must NOT be reported ---
  const quietBefore = seen.length;
  const k = 'seam-probe-' + Math.floor(performance.now());
  out.resolved.firstAdd  = await db.addIfAbsent('xp', { key: k, xp: 0 });
  out.resolved.secondAdd = await db.addIfAbsent('xp', { key: k, xp: 0 });
  out.resolved.takeMissing = await db.take('xp', '__never_existed__');
  out.resolved.kvNoop = await db.kvUpdate('seam-probe-kv', () => undefined);
  out.resolved.reportsDuringAnswers = seen.length - quietBefore;
  await db.db.del('xp', k);

  // --- classification, and the evq recursion guard ---
  out.quiet.evqIsQuiet    = db.writeIsQuiet('kv', { k: 'evq' });
  out.quiet.coinsIsLoud   = db.writeIsQuiet('kv', { k: 'coins' }) === false;
  out.quiet.backupAtQuiet = db.writeIsQuiet('kv', { k: 'backupAt' });
  out.quiet.dropSeenQuiet = db.writeIsQuiet('kv', { k: 'dropSeen.abc' });
  out.quiet.xpRowIsLoud   = db.writeIsQuiet('xp', { key: 'levelup-3' }) === false;

  const evqBefore = seen.length;
  try { await db.kvUpdate('evq', () => { throw new Error('boom'); }); } catch { /* expected */ }
  out.quiet.evqReported = seen.length - evqBefore;   // must be 0: reporting evq recurses forever

  const loudBefore = seen.length;
  try { await db.kvUpdate('coins', () => { throw new Error('boom'); }); } catch { /* expected */ }
  out.quiet.coinsReported = seen.length - loudBefore;

  // --- a frozen tab is rejecting ON PURPOSE. LAST: it freezes this page. ---
  db.watchForWipe();
  const ch = new BroadcastChannel('tally-db-wipe');
  ch.postMessage({ t: 'freeze', id: 'seam-audit' });
  await new Promise(r => setTimeout(r, 150));
  const frozenBefore = seen.length;
  let frozeThrew = false;
  try { await db.db.put('xp', { key: 'after-freeze' }); } catch { frozeThrew = true; }
  out.frozen = { threw: frozeThrew, reported: seen.length - frozenBefore };

  out.sinkShape = seen.length ? Object.keys(seen[0]).sort().join(',') : '(none)';
  return out;
});

console.log('WRITE FAILURE SEAM\n');

console.log('0. positive control: the harness is looking at the right place');
ok('SETUP the page under test is the LOCAL tree, not production',
  res.origin === srv.url.replace(/\/$/, ''),
  `page origin is ${res.origin}, expected ${srv.url.replace(/\/$/, '')}. boot() defaults to the live site, so a wrong key here grades production and every assertion below is meaningless.`);
ok('CONTROL two writes that SUCCEED report nothing', res.control.reportsOnSuccess === 0,
  `${res.control.reportsOnSuccess} reports fired on successful writes. A sink that fires on everything satisfies every "reported exactly once" below without the seam working at all.`);
ok('CONTROL those writes actually reached the database', res.control.stored === 2,
  `read back ${JSON.stringify(res.control.stored)}, expected 2. If the write never landed, "a successful write reports nothing" is vacuous.`);

console.log('\n1. every write path reports its own rejection');
const PATHS = ['put', 'del', 'clear', 'addIfAbsent', 'take', 'kvUpdate'];
for (const p of PATHS) {
  ok(`${p}: rejection reported exactly once`, res.reported[p] === 1,
    `reported ${res.reported[p]} times. 0 means ${p} bypasses the seam, which is how the atomic primitives were missed on v417.`);
  ok(`${p}: rejection re-thrown to the caller`, res.rethrew[p] === true,
    `the seam swallowed it. Callers must keep their control flow, or reward code after a failed write runs anyway.`);
}

console.log('\n2. a legitimate falsy answer is not a failure');
ok('addIfAbsent resolves true then false for the same key',
  res.resolved.firstAdd === true && res.resolved.secondAdd === false,
  `got ${res.resolved.firstAdd} then ${res.resolved.secondAdd}`);
ok('take of a missing row resolves undefined', res.resolved.takeMissing === undefined,
  `got ${JSON.stringify(res.resolved.takeMissing)}`);
ok('kvUpdate returning undefined writes nothing', res.resolved.kvNoop === undefined,
  `got ${JSON.stringify(res.resolved.kvNoop)}`);
ok('none of those four answers reached the sink', res.resolved.reportsDuringAnswers === 0,
  `${res.resolved.reportsDuringAnswers} reports fired on refused-duplicate / already-gone / no-op. The seam would shout on every correctly refused double claim.`);

console.log('\n3. classification, and the queue that cannot report itself');
ok('evq is quiet', res.quiet.evqIsQuiet === true, 'evq must be quiet');
ok('coins is loud', res.quiet.coinsIsLoud === true, 'a currency write must be loud');
ok('backupAt is quiet', res.quiet.backupAtQuiet === true, 'throttle timestamps are quiet');
ok('dropSeen.* prefix is quiet', res.quiet.dropSeenQuiet === true, 'per-drop markers are quiet');
ok('a non-kv store defaults LOUD', res.quiet.xpRowIsLoud === true,
  'anti-regression rule 8: never default to hidden');
ok('a failed evq write reaches the sink ZERO times', res.quiet.evqReported === 0,
  `reported ${res.quiet.evqReported}. Reporting evq queues an event, which writes evq, which fails, forever.`);
ok('a failed coins write DOES reach the sink', res.quiet.coinsReported === 1,
  `reported ${res.quiet.coinsReported}. If this is 0 the evq guard is over-broad and money is silent.`);

console.log('\n4. a frozen tab is rejecting on purpose, not failing');
ok('a write during freeze still rejects', res.frozen.threw === true, 'frozen must still refuse the write');
ok('a frozen rejection is NOT reported', res.frozen.reported === 0,
  `reported ${res.frozen.reported}. "Erase all data" freezes every other tab deliberately; reporting those is a toast storm on the way out.`);

console.log('\n5. the sink is told what died');
ok('sink payload carries store, key, op, quiet, quota, error',
  res.sinkShape === 'error,key,op,quiet,quota,store',
  `got ${res.sinkShape}`);

if (!checked) { console.log('\nFAIL  no assertions ran at all'); await browser.close(); srv.close(); process.exit(1); }
console.log(failed ? `\nFAILED: ${failed} of ${checked} assertions.` : `\nPASS  ${checked} assertions.`);
await browser.close();
srv.close();
process.exit(failed ? 1 : 0);

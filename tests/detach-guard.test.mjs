/* PROVE-RED for godmode's retryOnDetach, by synthetic injection: a real
 * detached-frame race cannot be summoned on demand, so the three cases are
 * driven by a stub that throws the exact strings. */
import { retryOnDetach } from './godmode.js';

let fails = 0;
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails++; };
const DETACH = () => new Error("Attempted to use detached Frame 'ABC123'.");

// 1. clean call is untouched, and resync must NOT fire
let resyncs = 0;
let r = await retryOnDetach(async () => 'clean', async () => { resyncs++; });
ok('a clean call passes through untouched', r === 'clean' && resyncs === 0, `ret=${r} resyncs=${resyncs}`);

// 2. ONE detach: retries, resyncs once, succeeds
let n = 0; resyncs = 0;
r = await retryOnDetach(async () => { if (++n === 1) throw DETACH(); return 'recovered'; }, async () => { resyncs++; });
ok('one detach retries once and recovers', r === 'recovered' && n === 2 && resyncs === 1, `calls=${n} resyncs=${resyncs}`);

// 3. TWO detaches: the second propagates (the guard is not a blindfold)
n = 0;
let threw = null;
try { await retryOnDetach(async () => { n++; throw DETACH(); }, async () => {}); }
catch (e) { threw = String(e); }
ok('two detaches propagate, never swallowed', /detached Frame/i.test(threw || '') && n === 2, `calls=${n} threw=${!!threw}`);

// 4. ANY OTHER error propagates immediately, with no retry and no resync
n = 0; resyncs = 0; threw = null;
try { await retryOnDetach(async () => { n++; throw new Error('Target closed'); }, async () => { resyncs++; }); }
catch (e) { threw = String(e); }
ok('an unrelated error propagates on the FIRST throw', /Target closed/.test(threw || '') && n === 1 && resyncs === 0, `calls=${n} resyncs=${resyncs}`);

// 5. a real assertion downstream of a wrapped call still fails on its own bug
const bad = await retryOnDetach(async () => ['Oct', 'Oct'], async () => {});
ok('a downstream guard still goes red through the wrapper', new Set(bad).size !== bad.length, `months=${JSON.stringify(bad)} (duplicate must still be caught)`);

console.log(`\n${fails ? `${fails} FAILED` : 'ALL PASS'}`);
process.exit(fails ? 1 : 0);

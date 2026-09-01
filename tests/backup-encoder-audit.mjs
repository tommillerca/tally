/* BACKUP ENCODER AUDIT: a mature save must survive base64, and must round-trip.
 *
 * THE BUG THIS EXISTS FOR (round 5, 2026-08-31, PROVEN by the reporter on a real
 * 1.45MB save and re-measured here): js/social.js encoded the encrypted blob with
 *
 *     const u8ToB64 = u8 => btoa(String.fromCharCode(...u8));
 *
 * which passes every byte of the ciphertext as its own argument to one call. Past
 * the engine's call-stack limit that throws RangeError, and pushBackup's blanket
 * `catch { return false; }` turned the throw into a silent false. Result: every
 * cloud-backup push path failed with zero words, forever, for any player whose
 * save had grown past a few weeks of heavy play. `backupAt` never moved, so even
 * the "last backup" surface could not tell anyone.
 *
 * WHY A SIZE THRESHOLD IS NOT THE ASSERTION. The limit is the CALL STACK, not a
 * fixed argument cap: measured 109,841 bytes under this node and ~124,385 in the
 * reporter's Chromium, and it shifts with stack depth. A test pinned to a number
 * would pass on one runtime and lie on another. So this asserts the PROPERTY the
 * fix guarantees instead: the encoder is chunked, so size does not matter.
 *
 * PROVEN RED: restoring the spread one-liner fails SPREAD-1MB and SPREAD-4MB with
 * RangeError while every SMALL row stays green, which is exactly the shape of the
 * shipped bug (small saves fine, mature saves dead).
 */
import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`ok   ${name}${detail ? '  | ' + detail : ''}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? '  | ' + detail : ''}`); }
};

/* The module needs browser globals to even parse-and-run its top level, and we
   only want the two pure encoder functions. Lift them out of source rather than
   importing the whole social module: the point is to test THE SHIPPED TEXT, so a
   copy in this file would test nothing (that is how a guard goes vacuous). */
const src = readFileSync(path.join(ROOT, 'js', 'social.js'), 'utf8');

const encMatch = src.match(/const u8ToB64 = ([\s\S]*?);\nconst b64ToU8/);
ok('SOURCE: u8ToB64 is where this audit thinks it is', !!encMatch,
  encMatch ? 'found' : 'js/social.js no longer defines u8ToB64 before b64ToU8, update this audit');
if (!encMatch) { console.log(`\n${pass} pass, ${fail} fail`); process.exit(1); }

/* STRUCTURAL: the spread form must not come back. This is the cheap row that
   catches a well-meaning "simplify" revert in review rather than in production. */
const spreadBack = /String\.fromCharCode\(\s*\.\.\./.test(encMatch[1]);
ok('NO-SPREAD: the encoder does not spread the whole array into one call', !spreadBack,
  spreadBack ? 'the round-5 critical is back' : 'chunked');

/* BEHAVIOURAL: build the real functions from the real source text and run them.
   btoa/atob are node globals from v16, so the browser primitives are genuine. */
const mkFns = text => {
  const chunkDecl = src.match(/const B64_CHUNK = [^;]+;/);
  const body = `${chunkDecl ? chunkDecl[0] : ''}\nconst u8ToB64 = ${text};\n` +
               `const b64ToU8 = ${src.match(/const b64ToU8 = ([\s\S]*?);\n/)[1]};\n` +
               'return { u8ToB64, b64ToU8 };';
  return new Function(body)();
};
const { u8ToB64, b64ToU8 } = mkFns(encMatch[1]);

const bytes = n => {
  /* Not zeros: a run of one value would let a broken chunk boundary round-trip by
     luck. A deterministic spread over all 256 values makes a dropped or duplicated
     chunk edge change the bytes. */
  const u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = (i * 31 + (i >> 8)) & 0xff;
  return u;
};

const roundTrip = (name, n) => {
  let out = null, err = null;
  try { out = b64ToU8(u8ToB64(bytes(n))); } catch (e) { err = e; }
  if (err) return ok(name, false, `${err.constructor.name}: ${String(err.message).slice(0, 60)}`);
  const src8 = bytes(n);
  const same = out.length === n && out.every((v, i) => v === src8[i]);
  ok(name, same, same ? `${n} bytes round-tripped` : `length ${out.length} of ${n}, or bytes differ`);
};

/* SMALL rows are the CONTROL: they were green through the entire life of the bug,
   so if one of these ever goes red the failure is in this audit, not the encoder. */
roundTrip('SMALL-1B: one byte', 1);
roundTrip('SMALL-1K: a new player', 1024);
roundTrip('SMALL-64K: below every engine limit', 64 * 1024);

/* The rows that were RED before the fix. 200KB is the reporter's suggested floor,
   1MB is past both measured stack limits, 4MB is the server's nominal cap. */
roundTrip('SPREAD-200K: past the reporter\'s floor', 200 * 1024);
roundTrip('SPREAD-1MB: a mature save', 1024 * 1024);
roundTrip('SPREAD-4MB: the server\'s nominal ceiling', 4 * 1024 * 1024);

/* CHUNK-EDGE: an off-by-one in the loop bound shows up exactly at the boundaries,
   and nowhere else, so assert them by name rather than trusting the sizes above. */
const CH = 0x8000;
for (const n of [CH - 1, CH, CH + 1, CH * 2, CH * 2 + 1, CH * 3 + 7]) roundTrip(`EDGE-${n}: chunk boundary`, n);

/* NON-EMPTY SAMPLE: the loop above must actually have run its rows. An audit whose
   sample is empty passes for the wrong reason (this repo has been bitten). */
ok('SAMPLE: the audit ran a real number of rows', pass + fail >= 12, `${pass + fail} rows`);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

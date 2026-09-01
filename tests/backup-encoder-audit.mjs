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

/* ============================================================================
 * COMPRESSION (round 8, 2026-09-01). THE SECOND CEILING, ON THE SAME BLOB.
 *
 * The encoder above stopped the save from failing to ENCODE. It did nothing
 * about the save failing to STORE. server/src/index.js UPSERT_BACKUP archives
 * the blob being REPLACED into daily_blob on the SAME D1 row, so once an account
 * has one good backup and the daily slot fills, every later push writes a row
 * holding live + daily, roughly twice the blob. The binding constraint stops
 * being the single-value limit and becomes the per-ROW one.
 *
 * MEASURED by the round-8 reporter on a local D1 emulator, 2026-09-01: a
 * 2,174,864-byte blob stores fine as a FIRST push, and the SAME save 413s on the
 * re-push once the daily slot is populated (live + daily about 4.35MB). The
 * effective per-push ceiling on an established account is therefore roughly
 * exportAll 0.8MB / blob 1.1MB, which a long-term player reaches. It fails
 * honestly (413 -> backupFail 'too-large' -> "outgrown its slot"), so this is a
 * ceiling rather than a crash, and it gets closer with every session.
 *
 * The fix is to gzip the snapshot BEFORE encrypting it. The rows below measure
 * that it works, and, more importantly, that it did not turn a size ceiling into
 * data loss for the uncompressed backups already sitting in the cloud.
 *
 * NOTE ON THE EMULATOR NUMBER: ~2.2MB is what the LOCAL emulator does. Whether
 * the deployed limit is per-value or per-row is not settleable from a sandbox,
 * so nothing below asserts a production byte count. The rows assert the RATIO
 * and the ROUND TRIP, which hold whichever limit applies.
 *
 * PROVEN RED 2026-09-01, four cp -R copies of the tree, never a git checkout:
 *   pre-change js/social.js     SOURCE red, 1 fail (the gate stops there, by
 *                               design: there is no `through` to lift)
 *   compress AFTER encrypting   10 fails. ORDER red, RATIO red at 1.00x,
 *                               CEILING red at 1,943,728 bytes, all 7 ROUNDTRIP
 *   sniff deleted, reader never
 *     decompresses              7 fails, all ROUNDTRIP, "not valid JSON"
 *   sniff replaced by "always
 *     decompress"               8 fails, all 7 COMPAT plus NO-STREAMS. This is
 *                               the DATA-LOSS shape and it is the reason the
 *                               COMPAT rows are here at all: every other row in
 *                               this file stays green while it eats every
 *                               uncompressed backup in the cloud.
 * ========================================================================== */

/* Run the SHIPPED encryptBackup / decryptBackup, not a copy of them. Node has
   webcrypto, Blob, Response, CompressionStream and DecompressionStream as
   globals, so the only thing the real source needs that this file has to supply
   is backupKey (which reaches into IndexedDB and the OS keychain) and the two
   base64 helpers already lifted above. CompressionStream/DecompressionStream go
   in as PARAMETERS so a row below can shadow them with undefined and exercise
   the iOS-15 device that has neither. */
const grab = re => { const m = src.match(re); return m ? m[0] : null; };
const throughSrc = grab(/const through = async \(u8, stream\) =>[\s\S]*?;\n/);
const encSrc = grab(/async function encryptBackup\(obj\) \{[\s\S]*?\n\}\n/);
const decSrc = grab(/async function decryptBackup\(b64s\) \{[\s\S]*?\n\}\n/);
ok('SOURCE: the backup crypto is where this audit thinks it is',
  !!(throughSrc && encSrc && decSrc),
  `through=${!!throughSrc} encryptBackup=${!!encSrc} decryptBackup=${!!decSrc}`);
if (!(throughSrc && encSrc && decSrc)) { console.log(`\n${pass} pass, ${fail} fail`); process.exit(1); }

/* ORDER OF OPERATIONS, ASSERTED ON THE SOURCE TEXT. Compressing AFTER encrypting
   costs CPU and saves nothing, and it is an easy thing to "tidy" into place
   because both steps are one line. The RATIO row below catches it behaviourally;
   this row names it, so the failure reads as the mistake it is. */
const compAt = encSrc.indexOf('CompressionStream'), encAt = encSrc.indexOf('crypto.subtle.encrypt');
ok('ORDER: encryptBackup compresses BEFORE it encrypts',
  compAt >= 0 && encAt >= 0 && compAt < encAt,
  compAt < 0 ? 'encryptBackup does not compress at all' : `compress at ${compAt}, encrypt at ${encAt}`);

const RAW_KEY = new Uint8Array(32).map((_, i) => (i * 7 + 11) & 0xff); // fixed so runs are comparable
const key = await crypto.subtle.importKey('raw', RAW_KEY, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
const mkBackup = (CS, DS) => new Function(
  'backupKey', 'CompressionStream', 'DecompressionStream', 'u8ToB64', 'b64ToU8',
  `${throughSrc}\n${encSrc}\n${decSrc}\nreturn { encryptBackup, decryptBackup };`
)(async () => key, CS, DS, u8ToB64, b64ToU8);
const shipped = mkBackup(CompressionStream, DecompressionStream);
const noStreams = mkBackup(undefined, undefined);   // an iOS 15 device: Safari got CompressionStream in 16.4

/* A MATURE SAVE, NOT A TOY. Row shapes and per-day volumes come from
   tests/db-quota-finding.mjs (2026-08-17), which is this repo's own measured
   model of a year of typical play: 10 meals, 1 weight, ~30 xp events and ~2 inv
   changes a day. Food names are lifted from data/generic-foods.js rather than
   invented, because "Chicken breast, cooked" and "food-7" do not compress alike
   and the point of this row is a number Tom can believe.

   Reused with a deterministic bias on purpose: people eat the same twenty things,
   so a real log repeats its food ids hard. Deterministic throughout, so the ratio
   printed on one machine is the ratio on the next. */
const FOOD_NAMES = [...readFileSync(path.join(ROOT, 'data', 'generic-foods.js'), 'utf8')
  .matchAll(/\['([^']{6,60})',/g)].map(m => m[1]).slice(0, 200);
ok('FIXTURE: real food names were lifted from data/generic-foods.js', FOOD_NAMES.length >= 100,
  `${FOOD_NAMES.length} names`);

let seed = 20260901;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const matureSnapshot = (days = 365) => {
  const dayISO = i => new Date(Date.UTC(2025, 0, 1) + i * 86400_000).toISOString().slice(0, 10);
  const foods = FOOD_NAMES.map((name, i) => ({
    id: `f-${i}`, name, kcal: 40 + Math.floor(rnd() * 500), protein: +(rnd() * 30).toFixed(1),
    carbs: +(rnd() * 60).toFixed(1), fat: +(rnd() * 25).toFixed(1), useCount: Math.floor(rnd() * 40),
    source: i % 7 === 0 ? 'custom' : 'generic', addedAt: 1735689600000 + i * 3600_000,
  }));
  const log = [], weights = [], xp = [], inv = [], health = [];
  for (let d = 0; d < days; d++) {
    const date = dayISO(d);
    for (let m = 0; m < 10; m++) {
      // a Zipf-ish reuse: most meals come from a handful of favourites
      const f = foods[Math.floor(Math.pow(rnd(), 2.2) * foods.length)];
      const g = 40 + Math.floor(rnd() * 260);
      log.push({ id: `${date}-${m}-${Math.floor(rnd() * 1e6)}`, date, ts: d * 86400_000 + m * 3600_000,
        foodId: f.id, name: f.name, grams: g, kcal: Math.round(f.kcal * g / 100),
        protein: +(f.protein * g / 100).toFixed(1), carbs: +(f.carbs * g / 100).toFixed(1),
        fat: +(f.fat * g / 100).toFixed(1), meal: ['breakfast', 'lunch', 'dinner', 'snack'][m % 4] });
    }
    weights.push({ date, kg: +(78 + Math.sin(d / 30) * 2 + rnd() * 0.4).toFixed(2) });
    health.push({ date, steps: 3000 + Math.floor(rnd() * 12000), restingHr: 52 + Math.floor(rnd() * 14),
      hrv: 40 + Math.floor(rnd() * 50), sleepMin: 300 + Math.floor(rnd() * 180) });
    for (let x = 0; x < 30; x++) {
      xp.push({ key: `xp-${d}-${x}`, ts: d * 86400_000 + x * 60_000,
        type: ['step', 'meal', 'fight', 'quest', 'walk'][x % 5], points: 1 + Math.floor(rnd() * 12) });
    }
    for (let i = 0; i < 2; i++) {
      inv.push({ id: `inv-${d}-${i}`, type: ['egg', 'bone', 'crate', 'gear'][Math.floor(rnd() * 4)],
        qty: 1 + Math.floor(rnd() * 3), day: d, rarity: ['common', 'rare', 'epic'][Math.floor(rnd() * 3)] });
    }
  }
  const kv = [
    { k: 'coins', v: 48210 }, { k: 'dust', v: 3120 }, { k: 'level', v: 41 },
    { k: 'identity', v: { pubJwk: { kty: 'EC', crv: 'P-256', x: 'a'.repeat(43), y: 'b'.repeat(43) } } },
    { k: 'crew', v: Array.from({ length: 12 }, (_, i) => ({ id: `bh-${i}`, name: `Bonehead ${i}`, lvl: 10 + i })) },
  ];
  return { app: 'tally', version: 3, exportedAt: '2026-09-01T00:00:00.000Z', foods, log, weights, kv, xp, health, inv };
};

const SNAP = matureSnapshot();
const snapJson = JSON.stringify(SNAP);
const exportBytes = new TextEncoder().encode(snapJson).length;
/* The reporter's round-8 save was a 1.64MB exportAll. A fixture that is not at
   least in that neighbourhood would be measuring a different problem. */
ok('FIXTURE: the snapshot is a mature save, not a toy', exportBytes > 1_400_000,
  `exportAll ${exportBytes.toLocaleString()} bytes, ${SNAP.log.length} log rows, ${SNAP.xp.length} xp rows`);

/* THE MAGIC-BYTE DECISION, ASSERTED RATHER THAN ASSUMED. The reader tells a
   compressed blob from a legacy one by gzip's 1f 8b on the DECRYPTED plaintext.
   That is only unambiguous because exportAll returns an OBJECT, so the legacy
   plaintext always began '{'. If exportAll ever returned an array or a bare
   value this row goes red and the sniff needs a real version marker. */
ok('MAGIC: a legacy plaintext can never be mistaken for gzip',
  snapJson[0] === '{', `first byte of JSON.stringify(exportAll()) is ${JSON.stringify(snapJson[0])}`);

const blob = await shipped.encryptBackup(SNAP);
const legacyBlob = await noStreams.encryptBackup(SNAP);
const gzBytes = Math.round(blob.length * 3 / 4) - 12;    // base64 -> iv(12) + ciphertext
const ratio = exportBytes / gzBytes;

/* RATIO. A floor, not a pin: gzip's exact output moves with the zlib build, and
   a test pinned to a byte count would lie on the next runtime (same reasoning as
   the stack-limit note at the top of this file).

   WHY 3x IS THE FLOOR. The effective ceiling on an established account is about
   0.8MB of exportAll (measured 2026-09-01, see the header). Clearing a 1.64MB
   mature save needs a bit over 2x just to get level with today, so 2x is the
   line where this change stops being worth making. 3x is that line plus enough
   headroom that the row means "compression is working" rather than "compression
   is barely working", and a compress-after-encrypt mistake lands at 1.00x. */
ok('RATIO: gzip cuts a mature save by at least 3x', ratio >= 3,
  `exportAll ${exportBytes.toLocaleString()} -> compressed ${gzBytes.toLocaleString()} bytes ` +
  `= ${ratio.toFixed(2)}x, blob (base64) ${blob.length.toLocaleString()} bytes`);

/* WHY THE ORDER IS NOT A STYLE PREFERENCE. AES-GCM output is indistinguishable
   from random, so this is the number the "just compress the blob instead"
   suggestion actually buys: nothing, and reliably slightly worse than nothing. */
const ctOnly = b64ToU8(legacyBlob);
const ctGz = new Uint8Array(await new Response(
  new Blob([ctOnly]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
ok('INCOMPRESSIBLE: gzipping the CIPHERTEXT instead saves nothing', ctGz.length >= ctOnly.length * 0.99,
  `ciphertext ${ctOnly.length.toLocaleString()} -> ${ctGz.length.toLocaleString()} bytes ` +
  `= ${(ctOnly.length / ctGz.length).toFixed(3)}x`);

/* CEILING. The whole point of the change: the blob an established account pushes
   has to fit beside its own archived daily copy in one D1 row. Half of the
   emulator's measured 2,199,942-byte single-row limit (server/src/index.js,
   bisected 2026-08-17) is the honest budget, and this is stated as indicative:
   production D1 may differ and a sandbox cannot settle it. */
const ESTABLISHED_BUDGET = Math.floor(2_199_942 / 2);
ok('CEILING: a mature save now fits beside its own archived daily copy',
  blob.length < ESTABLISHED_BUDGET,
  `blob ${blob.length.toLocaleString()} of a ~${ESTABLISHED_BUDGET.toLocaleString()} byte budget ` +
  `(legacy blob was ${legacyBlob.length.toLocaleString()}, which does NOT fit)`);
ok('CEILING-CONTROL: the UNCOMPRESSED blob really did overflow that budget',
  legacyBlob.length > ESTABLISHED_BUDGET,
  `${legacyBlob.length.toLocaleString()} vs ${ESTABLISHED_BUDGET.toLocaleString()}`);

/* DEEP COMPARE, per store, canonical JSON with sorted keys. Same shape
   tests/backup-roundtrip-audit.mjs uses, for the same reason: a shallow equal
   would sail past a dropped field or a reordered array.

   The seven store names are js/db.js's STORES export, unchanged since the export
   format was set (js/db.js:25, read 2026-09-01). Copied rather than imported
   because importing db.js drags in IndexedDB, and this file is in the PURE tier
   precisely so it boots nothing. If a store is ever added, the FIXTURE row above
   keeps passing and these rows go quiet about the new one, so add it here too. */
const STORES = ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv'];
const canon = v => JSON.stringify(v, (_, x) =>
  (x && typeof x === 'object' && !Array.isArray(x))
    ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);

/* A READER THAT THROWS MUST STILL PRODUCE A NAMED ROW. The first cut of these
   rows awaited decryptBackup bare, and two of the four prove-red mutants below
   died on an unhandled rejection: a raw DOMException stack, no row name, nothing
   saying WHICH property broke. Same reason roundTrip above catches. */
const decode = async b64 => {
  try { return { snap: await shipped.decryptBackup(b64) }; }
  catch (e) { return { err: `${e.constructor.name}: ${String(e.message || e).slice(0, 70)}` }; }
};

const back = await decode(blob);
for (const s of STORES) {
  ok(`ROUNDTRIP-${s}: compress -> encrypt -> decrypt -> decompress is byte-identical`,
    !back.err && canon(back.snap[s]) === canon(SNAP[s]),
    back.err || `${(SNAP[s] || []).length} rows, ${canon(SNAP[s]).length.toLocaleString()} canonical bytes`);
}

/* THE ROW THAT MATTERS MOST. Every player with a cloud backup right now has an
   UNCOMPRESSED one, and a reader that cannot read it has turned a size ceiling
   into total data loss, which is far worse than the bug being fixed.
   `legacyBlob` is built by the shipped encryptBackup with CompressionStream
   shadowed away, which is byte-for-byte the pre-change construction (JSON ->
   encrypt -> base64); it is fed to the SHIPPED reader unmodified. */
const legacyBack = await decode(legacyBlob);
for (const s of STORES) {
  ok(`COMPAT-${s}: an OLD uncompressed blob still restores through the new reader`,
    !legacyBack.err && canon(legacyBack.snap[s]) === canon(SNAP[s]),
    legacyBack.err || `${(SNAP[s] || []).length} rows`);
}

/* AND THE DEVICE THAT HAS NEITHER STREAM. iOS deployment target is 15.0 and
   Safari shipped CompressionStream in 16.4, so this is a real phone, not a
   hypothetical. It must still push something the fleet can read. */
const noStreamsBack = await decode(await noStreams.encryptBackup(SNAP));
ok('NO-STREAMS: a device without CompressionStream still writes a readable blob',
  !noStreamsBack.err && canon(noStreamsBack.snap.log) === canon(SNAP.log),
  noStreamsBack.err || `${legacyBlob.length.toLocaleString()} byte blob, uncompressed, readable by the new reader`);

/* NON-EMPTY SAMPLE: the loop above must actually have run its rows. An audit whose
   sample is empty passes for the wrong reason (this repo has been bitten). */
ok('SAMPLE: the audit ran a real number of rows', pass + fail >= 12, `${pass + fail} rows`);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

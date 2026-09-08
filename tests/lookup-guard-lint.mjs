/* M5 frozen order, 2026-09-07. Node-only, no installed parser dependency.
 * Report every candidate, ratchet reviewed sites by identity AND multiplicity,
 * and fail any new site. See lookup-guard-review.md for measured precision and
 * deliberately unsupported syntax/dataflow. This does not close the full class.
 * CONTROL fixtures below exercise the scanner, not hand-written app anchors.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanLookupGuards, codeOnly } from './lib/lookup-guard-scan.mjs';

const root = resolve(process.argv[2] || fileURLToPath(new URL('..', import.meta.url)));
let failed = 0;
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`);
  if (!pass) failed++;
};
// 2026-09-07 review: two unresolved peer-id boundaries, two upstream-validated
// false positives. Identities intentionally exclude line numbers, but every
// occurrence consumes one review entry, so duplication cannot hide in a Set.
const reviewed = [
  { rule: 'id-boundary', key: 'p.pet.id', lookup: 'catalogueviahelper', sink: 'petPortraitHtml(p.pet.id,', classification: 'boundary-debt' },
  { rule: 'id-boundary', key: 'p.pet.id', lookup: 'catalogueviahelper', sink: 'petSpriteHtml(p.pet.id,', classification: 'boundary-debt' },
  { rule: 'record-boundary', key: 'lurkSp', lookup: 'BH_BY_ID[lurkSp]', sink: 'bhAsset', classification: 'false-positive' },
  { rule: 'id-boundary', key: 'petArtId', lookup: 'catalogueviahelper', sink: 'petSpriteHtml(petArtId,', classification: 'false-positive' },
].map(row => ({ file: 'js/app.js', ...row }));
const identity = row => JSON.stringify([row.file, row.rule, row.key, row.lookup, row.sink]);

const controls = [
  ['early return', 'function draw(id) { if (!id) return; const item = BOOK[id]; return item.name; }', 1],
  ['positive lookup', 'function draw(id) { return id && BOOK[id].name; }', 1],
  ['renamed art alias before guard', 'function draw(key) { const art = BOOK[key]; if (!key) return; return bhAsset(art); }', 1],
  ['truth-only filter', 'function draw(rows) { const kept = rows.filter(p => p && p.kind); return kept.map(p => petPortraitHtml(p.kind, 20)); }', 1],
  ['resolved filter', 'function draw(rows) { const kept = rows.filter(p => p && isKnownPet(p.kind)); return kept.map(p => petPortraitHtml(p.kind, 20)); }', 0],
  ['lookup truth test', 'function draw(id) { return id && BOOK[id] && BOOK[id].name; }', 0],
  ['result guard', 'function draw(id) { if (!id) return; const item = BOOK[id]; if (!item) return; return item.name; }', 0],
  ['fallback', 'function draw(id) { if (!id) return; const item = BOOK[id] || {}; return item.name; }', 0],
  ['optional access', 'function draw(id) { return id && BOOK[id]?.name; }', 0],
  ['separate functions', 'function a(id) { if (!id) return; } function b(id) { return BOOK[id].name; }', 0],
  ['comments and strings', '/* id && BOOK[id].name */ const note = "id && BOOK[id].name";', 0],
  ['regex', 'const re = /id && BOOK[id].name/;', 0],
  ['template expression', 'function a(id) { return `${id && BOOK[id].name}`; }', 1],
];
for (const [name, source, count] of controls) {
  const rows = scanLookupGuards(source);
  ok(`CONTROL ${name}`, rows.length === count, `expected ${count}, found ${rows.length}`);
}
assert.equal(codeOnly('/* comment */\nconst x = "hi";').split('\n').length, 2);
const files = ['js', 'data'].flatMap(dir => readdirSync(join(root, dir), { recursive: true })
  .filter(f => /\.(?:js|mjs)$/.test(f)).map(f => `${dir}/${f}`)).sort();
const findings = files.flatMap(file => scanLookupGuards(readFileSync(join(root, file), 'utf8')).map(row => ({ file, ...row })));
ok('SAMPLE source modules and known candidate sites were examined', files.length > 30 && findings.length > 0, `${files.length} files, ${findings.length} candidates`);
const remaining = [...reviewed];
let debt = 0, falsePositives = 0;
for (const row of findings) {
  const index = remaining.findIndex(r => identity(r) === identity(row));
  const review = index < 0 ? null : remaining.splice(index, 1)[0];
  if (review?.classification === 'boundary-debt') debt++;
  if (review?.classification === 'false-positive') falsePositives++;
  console.log(`SITE ${row.file}:${row.line} ${row.rule} ${row.key} -> ${row.lookup} -> ${row.sink} [${review?.classification || 'UNREVIEWED'}]`);
  if (!review) ok('NEW unresolved lookup guard', false, `${row.file}:${row.line} ${row.key}`);
}
ok('REVIEW no stale suppressions', remaining.length === 0, remaining.map(identity).join(', ') || 'all reviewed sites still present');
console.log(`PRECISION ${debt} boundary debts, ${falsePositives} false positives, ${findings.length - debt - falsePositives} unreviewed. Terminal fallbacks mean boundary debts are not proven crashes.`);
console.log(`lookup-guard: ${failed ? `${failed} FAILED` : 'PASS'}`);
process.exitCode = failed ? 1 : 0;

/* Prove-red reference lint, 2026-09-07.
 *
 * Audit prose is part of the release evidence. This cheap, PURE half checks
 * concrete references that can be graded without replaying hundreds of
 * mutations: every repo file named in an audit header must exist, and every
 * row explicitly quoted after FAIL must still exist in executable text.
 *
 * PROVE-RED: add `tests/no-such-proof.mjs` and `FAIL GHOSTROW` to an audit
 * header. FILE and ROW both fail while the subject audit itself is untouched.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = path.join(ROOT, 'tests');
const failures = [];
let proofHeaders = 0, fileRefs = 0, rowRefs = 0;
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) failures.push(name);
};

for (const name of readdirSync(TESTS).filter(n => /\.(?:mjs|js)$/.test(n) && n !== 'prove-red-reference-lint.mjs')) {
  const src = readFileSync(path.join(TESTS, name), 'utf8');
  const importAt = src.search(/^import\s/m);
  const header = src.slice(0, importAt < 0 ? Math.min(src.length, 12000) : importAt);
  if (!/PRO(?:VE|VEN)[ -]?RED/i.test(header)) continue;
  proofHeaders++;

  const refs = new Set(header.match(/\b(?:tests|js|data|docs)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:mjs|js|json|md|html|css|sql)\b/g) || []);
  for (const ref of refs) {
    fileRefs++;
    if (!existsSync(path.join(ROOT, ref))) failures.push(`${name}: missing named proof file ${ref}`);
  }

  for (const m of header.matchAll(/\bFAIL\s+([A-Z][A-Z0-9-]{2,})\b/g)) {
    const row = m[1];
    if (['LINE', 'LINES', 'ROW', 'ROWS', 'WITH'].includes(row)) continue;
    rowRefs++;
    const body = src.slice(importAt < 0 ? header.length : importAt);
    if (!body.includes(row)) failures.push(`${name}: named prove-red row ${row} does not exist`);
  }
}

ok('SETUP audit headers with prove-red evidence were found', proofHeaders > 0, `headers=${proofHeaders}`);
ok('PROOF-FILES every file named in prove-red headers exists', !failures.some(x => /missing named proof file/.test(x)), `refs=${fileRefs}`);
ok('PROOF-ROWS every row quoted in a prove-red FAIL line exists', !failures.some(x => /named prove-red row/.test(x)), `refs=${rowRefs}`);
for (const failure of failures) console.error(`FAIL  ${failure}`);
console.log(failures.length ? `PROVE-RED REFERENCE LINT FAILED (${failures.length})` : `PROVE-RED REFERENCES VERIFIED (${proofHeaders} headers)`);
process.exit(failures.length ? 1 : 0);

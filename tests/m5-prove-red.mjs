import { auditOutputPath } from './lib/audit-output.mjs';
/* M5, 2026-09-07. Node-only positive controls on throwaway source copies.
 * Every replacement must match exactly once; each child exit and full output
 * are saved separately. No working source is reverted, no browser is started.
 * The first-run child executes the three actual unit.test.js test bodies.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const temp = mkdtempSync(auditOutputPath(join(tmpdir(), 'm5-red-')));
for (const dir of ['js', 'data']) cpSync(join(root, dir), auditOutputPath(join(temp, dir)), { recursive: true });
mkdirSync(auditOutputPath(join(temp, 'tests', 'lib')), { recursive: true });
for (const file of ['package.json', 'app.css', 'tests/lookup-guard-lint.mjs', 'tests/lib/lookup-guard-scan.mjs']) {
  cpSync(join(root, file), auditOutputPath(join(temp, file)));
}
const appPath = join(temp, 'js/app.js'), original = readFileSync(appPath, 'utf8');
const unit = readFileSync(join(root, 'tests/unit.test.js'), 'utf8');
const start = unit.indexOf("test('M5 splash keeps"), end = unit.indexOf('/* ---------------------------------------------------------------------------\n * QA round 27 R14(b).', start);
assert(start >= 0 && end > start, 'M5 unit test boundaries missing');
const bodies = unit.slice(start, end);
assert.equal((bodies.match(/^test\(/gm) || []).length, 3, 'expected all three shipped M5 unit guards');
writeFileSync(auditOutputPath(join(temp, 'tests/first-run-node.mjs')), `
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url)), queue = [];
const test = (name, fn) => queue.push([name, fn]);
${bodies}
let failed = 0;
for (const [name, fn] of queue) {
  try { await fn(); console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); }
}
console.log((queue.length - failed) + '/' + queue.length + ' M5 guards passed');
process.exitCode = failed ? 1 : 0;
`);
let failed = 0;
function replaceOnce(text, from, to) {
  assert.equal(text.split(from).length - 1, 1, `mutation must hit exactly once: ${from}`);
  return text.replace(from, to);
}
function run(name, script, expected, failureText) {
  const result = spawnSync(process.execPath, [join(temp, 'tests', script)], { cwd: temp, encoding: 'utf8', timeout: 20000 });
  const output = (result.stdout || '') + (result.stderr || '');
  writeFileSync(auditOutputPath(join(temp, `${name}.log`)), output);
  writeFileSync(auditOutputPath(join(temp, `${name}.exit`)), String(result.status));
  const pass = result.status === expected && (!failureText || output.includes(failureText));
  console.log(`${pass ? 'PASS' : 'FAIL'} CONTROL ${name}: exit ${result.status}, expected ${expected}`);
  console.log(output.split('\n').filter(l => /^(FAIL|SITE .*UNREVIEWED|lookup-guard:|\d\/\d M5)/.test(l)).join('\n'));
  if (!pass) failed++;
}
try {
  run('green-first-run', 'first-run-node.mjs', 0);
  run('green-lint', 'lookup-guard-lint.mjs', 0);
  const variants = [
    ['red-old-disclosure', s => replaceOnce(s,
      "You eat, the skeleton earns. I keep an anonymous account for you. No email, password, or sign-up. The Privacy policy tells the long version.",
      'You eat, the skeleton earns.'), 'FAIL M5 Gwart'],
    ['red-first-run-suppressed', s => replaceOnce(s, 'if (returning && !forced) return;', 'if (!forced) return;'), 'FAIL M5 splash'],
    ['red-old-splash-gate', s => replaceOnce(s, 'if (returning && !forced) return;', 'if (!S.settings) return;'), 'FAIL M5 splash'],
    ['red-returning-splash', s => replaceOnce(s, 'if (returning && !forced) return;', ''), 'FAIL M5 splash'],
    /* v518 (L6): the blunt cap became a ROUTINE-only cap, so an error
       disclosure can no longer be evicted by routine toast spam. Same
       behaviour this row has always guarded (no backlog lecture), new source
       text. Re-pointed at the assertion, deliberately, rather than deleted:
       deleting the loop must still go red. */
    ['red-toast-cap-deleted', s => replaceOnce(s,
      `    while (toastQ.filter(item => !item.error).length > 4) {
      toastQ.splice(toastQ.findIndex(item => !item.error), 1);`,
      '    if (false) {'), 'FAIL M5 toast'],
  ];
  for (const [name, mutate, message] of variants) {
    writeFileSync(auditOutputPath(appPath), mutate(original));
    run(name, 'first-run-node.mjs', 1, message);
    writeFileSync(auditOutputPath(appPath), original);
  }
  writeFileSync(auditOutputPath(appPath), replaceOnce(original, 'instsAll.filter(x => x && isKnownPet(x.sp))', 'instsAll.filter(x => x && x.sp)'));
  run('red-pet-species', 'lookup-guard-lint.mjs', 1, 'FAIL NEW unresolved lookup guard');
  let oldArt = replaceOnce(original,
    'const ownArt = BH_BY_ID[wornGear ? wornGear.artId : rawEq[slot]];\n    const baseArtId = ownArt?.id || null;',
    'const baseArtId = wornGear ? wornGear.artId : (rawEq[slot] || null);');
  oldArt = replaceOnce(oldArt, "    const nameOf = v => v === ''", "    const ownArt = BH_BY_ID[baseArtId];\n    const nameOf = v => v === ''");
  writeFileSync(auditOutputPath(appPath), oldArt);
  run('red-equipped-art', 'lookup-guard-lint.mjs', 1, 'FAIL NEW unresolved lookup guard');
} finally { writeFileSync(auditOutputPath(appPath), original); }
run('restored-first-run', 'first-run-node.mjs', 0);
run('restored-lint', 'lookup-guard-lint.mjs', 0);
console.log(`Evidence: ${resolve(temp)}`);
console.log(`m5-prove-red: ${failed ? `${failed} FAILED` : 'PASS'}`);
process.exitCode = failed ? 1 : 0;

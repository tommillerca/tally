// R3 CONTROL: real files, traversal and symlink aliases, with no browser/server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditOutputPath, protectAuditTree } from './lib/audit-output.mjs';
import { writeSinks } from './lib/audit-write-scan.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(auditOutputPath(path.join(os.tmpdir(), 'r3-output-')));
let failed = 0, passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}: ${error.message}`); }
}
try {
  check('CONTROL external output is written and read back', () => {
    const dest = path.join(temp, 'proof.txt');
    fs.writeFileSync(auditOutputPath(dest), 'outside');
    assert.equal(fs.readFileSync(dest, 'utf8'), 'outside');
  });
  check('CHECKOUT absolute, relative, traversal and URL destinations are refused', () => {
    for (const dest of [root, path.dirname(root), path.join(root, 'new-dir/proof.png'), path.relative(process.cwd(), root) || '.',
      path.join(temp, '..', path.relative(path.dirname(temp), root), 'proof.png'), new URL('../proof.png', import.meta.url)]) {
      assert.throws(() => auditOutputPath(dest), /AUDIT OUTPUT refuses checkout write/);
    }
  });
  check('SYMLINK existing and nonexistent leaves cannot alias the checkout', () => {
    const link = path.join(temp, 'alias');
    fs.symlinkSync(root, auditOutputPath(link));
    assert.throws(() => auditOutputPath(path.join(link, 'CLAUDE.md')), /refuses checkout write/);
    assert.throws(() => auditOutputPath(path.join(link, 'new-dir/proof.png')), /refuses checkout write/);
  });
  check('DANGLING symlink fails closed', () => {
    const link = path.join(temp, 'dangling');
    fs.symlinkSync(path.join(temp, 'missing'), auditOutputPath(link));
    assert.throws(() => auditOutputPath(link), /dangling symlink/);
  });
  check('CONTROL sibling sharing checkout prefix remains outside', () => {
    assert.doesNotThrow(() => auditOutputPath(root + '-output/proof.png'));
  });
  check('GRADED another served tree is also protected', () => {
    const other = path.join(temp, 'graded');
    fs.mkdirSync(auditOutputPath(other));
    const release = protectAuditTree(other);
    try {
      assert.throws(() => auditOutputPath(path.join(other, 'proof.png')), /refuses checkout write/);
      assert.throws(() => auditOutputPath(temp), /refuses checkout write/);
    } finally { release(); }
    assert.doesNotThrow(() => auditOutputPath(other));
  });
  check('CONTROL sink scan sees real writes, aliases and screenshot paths', () => {
    const source = "import { writeFileSync as save } from 'node:fs';\n"
      + "save(join(repo, 'proof.txt'), 'x');\n"
      + "page.screenshot({path: join(repo, 'proof.png')});\n"
      + "fs.copyFileSync(input, join(repo, 'copy'));\n"
      + "page.tracing.start({path: join(repo, 'trace.json')});";
    const rows = writeSinks(source);
    assert.equal(rows.length, 4); assert.ok(rows.every(r => !r.guarded));
    assert.equal(writeSinks("// fs.writeFileSync(repo, 'x')\nconst text = \"page.screenshot({path: repo})\";").length, 0);
    assert.equal(writeSinks("fs.writeFileSync(auditOutputPath(dest), 'x');")[0].guarded, true);
    assert.equal(writeSinks("fs.writeFileSync(auditOutputPath(dest) + '/../../escape', 'x');")[0].guarded, false);
  });
  check('SERVE identity uses memory and cannot create a proof file in the tree', () => {
    const source = fs.readFileSync(new URL('./godmode.js', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('export async function serveTree('), source.indexOf('/* PROCESS-EXIT SAFETY NET'));
    assert.ok(body.includes('proof_token.encode()') && body.includes('protectAuditTree(root)'));
    assert.equal(writeSinks(body).length, 0);
    assert.ok(!body.includes('fs.writeFileSync'));
  });
} finally { fs.rmSync(auditOutputPath(temp), { recursive: true, force: true }); }
console.log(`audit-output: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;

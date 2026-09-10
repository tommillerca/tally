// Frozen verification-tail source contracts and real missing-package child.
import assert from 'node:assert/strict';
import { auditOutputPath } from './lib/audit-output.mjs';
import { readFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const item = process.argv.find(arg => arg.startsWith('--item='))?.split('=')[1];
if (!item || item === '2') {
  const loot = read('js/loot.js');
  const grant = Number(read('js/game.js').match(/DAYONE_TOPUP = (\d+)/)[1]);
  assert.equal(grant, 340, 'CONTROL read the production day-one grant');
  const notes = [loot.slice(loot.indexOf('WHY THE ANCHOR IS EXEMPT'), loot.indexOf('WHAT THIS DOES NOT DO')),
    loot.slice(loot.indexOf('/* THE ANCHOR,'), loot.indexOf("[300, ['U2'"))];
  for (const note of notes) {
    assert.match(note, new RegExp(`\\b${grant}-coin starting wallet`), 'anchor rationale must name the real starting wallet');
    assert.match(note, /can afford the 300-coin anchor once, with 40 left/, 'real grant buys exactly one anchor');
    assert.match(note, /initLootIfNeeded\(\)/, 'rationale must identify the real welcome kit');
    assert.doesNotMatch(note, /cannot afford|pending a product-owner/);
  }
  assert.match(loot, /\[300, \['U2', 'U4', 'U7'\]\]/, 'CONTROL actual common rung price stays 300');
  console.log('PASS item 2: both comments disclose the real 340-coin grant buys the unchanged 300-coin anchor once');
}
if (!item || item === '5') {
  // Copy the actual script and dependency helper into an isolated tree with no
  // node_modules. Never rename the checkout dependency (it may be a symlink).
  const temp = mkdtempSync(auditOutputPath(join(tmpdir(), 'verify-tail-acorn-')));
  try {
    for (const file of ['server/scripts/write-contract.mjs', 'tests/lib/audit-dependencies.mjs']) {
      mkdirSync(auditOutputPath(join(temp, file, '..')), { recursive: true });
      copyFileSync(new URL(file, root), auditOutputPath(join(temp, file)));
    }
    const child = spawnSync(process.execPath, ['server/scripts/write-contract.mjs'], {
      cwd: temp, encoding: 'utf8', timeout: 10000,
    });
    const output = (child.stdout || '') + (child.stderr || '');
    console.log(`item 5 dependency hidden: exit ${child.status}\n${output.trim()}`);
    assert.equal(child.status, 97, 'missing acorn must exit 97');
    assert.match(output, /UNPRV acorn.*DID NOT RUN: missing dependency acorn/);
    assert.doesNotMatch(output, /ERR_MODULE_NOT_FOUND/);
    console.log('PASS item 5: actual write-contract missing acorn is UNPROVEN');
  } finally { rmSync(auditOutputPath(temp), { recursive: true, force: true }); }
}

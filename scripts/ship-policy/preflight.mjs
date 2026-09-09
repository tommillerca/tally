#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { main, options, files, changed, read, ast, walk, registrations, generate, dependencies, command, fail, GATE } from './lib.mjs';
import { git } from './lib.mjs';
// Append-only by construction; every lane touches them and removals there are normal.
const SHARED_APPEND = new Set(['docs/CLAIMS.md', 'js/changelog.js', 'tests/release-gate.mjs', 'sw.js', 'version.json', 'js/app.js']);
main(() => {
  const o = options(process.argv.slice(2)), all = files(o.tree), delta = changed(o.tree, o.base);
  for (const file of all) {
    const full = path.join(o.tree, file);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
    const data = fs.readFileSync(full);
    if (!data.includes(0) && /^(?:<{7}(?: .*)?|={7}|>{7}(?: .*)?|\|{7}(?: .*)?)\r?$/m.test(data.toString())) fail(`CONFLICT_MARKER: ${file}`);
  }
  const source = read(o.tree, GATE), reg = registrations(source, GATE);
  const expected = generate(o.tree, o.base, o.lanes);
  if (source !== expected.source) fail('GENERATED_GATE: registration dropped, changed, or runner differs from baseline plus lanes; regenerate');
  for (const file of delta.filter(f => /\.[cm]?js$/.test(f) && fs.existsSync(path.join(o.tree, f)))) command(o.tree, ['--check', file]);
  for (const name of Object.values(reg.tiers).flat()) if (!fs.existsSync(path.join(o.tree, 'tests', name))) fail(`MISSING_AUDIT: ${name}`);
  const baseFiles = new Set(baselineFiles(o.tree, o.base));
  for (const file of all.filter(f => /^tests\/[^/]+\.[cm]?js$/.test(f) && !baseFiles.has(f))) {
    let control = false;
    walk(ast(read(o.tree, file), file), n => {
      if (n.type === 'CallExpression' && n.arguments.some(a => a.type === 'Literal' && typeof a.value === 'string' && /\b(CONTROL|POSITIVE|PREMISE|SETUP|REACH|SAMPLE)\b/.test(a.value))) control = true;
    });
    if (!control) fail(`CONTROL_LABEL: ${file}: no executable call with a positive-control label; behavioral validity still requires proof`);
  }
  /* A TRAIN CAN SILENTLY REVERT WHAT SHIPPED WHILE ITS LANES WERE OPEN. On
     2026-09-09 a lane cut before v535 was assembled into a train by copying its
     files wholesale; its stale js/db.js reverted v535's failed-erase disclosure
     and only the gate caught it, one audit deep. overlap.mjs already refuses a
     stale lane, but an operator assembling by hand bypasses it entirely, so the
     check belongs on the ASSEMBLED TREE where the build method cannot matter.
     A removed line that is not part of the intended change is the signature. */
  const reverted = [];
  for (const file of delta) {
    if (SHARED_APPEND.has(file) || !fs.existsSync(path.join(o.tree, file))) continue;
    const removed = git(o.tree, 'diff', '--no-ext-diff', '--no-textconv', o.base, '--', file)
      .split('\n').filter(l => /^-[^-]/.test(l));
    if (removed.length) reverted.push(`${file}: ${removed.length} line(s) removed vs base`);
  }
  if (reverted.length && !o.allowRemovals) {
    fail(`REMOVES_FROM_BASE: ${reverted.length} file(s) delete lines that exist on the base:\n        ${reverted.join('\n        ')}\n        Confirm each is part of the intended change, then re-run with --allow-removals.`);
  }
  dependencies(o.tree, [GATE, ...Object.values(reg.tiers).flat().map(n => `tests/${n}`)]);
  const coverage = command(o.tree, [GATE, '--coverage-only']);
  console.log(`PASS preflight: structural checks only; base ${o.base}; ${reg.tiers.PURE.length} PURE`);
  if (coverage) console.log(coverage);
});
function baselineFiles(root, base) { return git(root, 'ls-tree', '-r', '--name-only', '-z', base).split('\0').filter(Boolean); }

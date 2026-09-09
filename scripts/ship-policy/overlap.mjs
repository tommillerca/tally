#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { main, options, git, changed, generate, fail, GATE } from './lib.mjs';
// Coordinates are base lines. Insertion boundaries conflict with touching edits.
function touches(a, b) {
  if (a.count === 0 && b.count === 0) return a.start === b.start;
  if (a.count === 0) return a.start >= b.start - 1 && a.start <= b.start + b.count - 1;
  if (b.count === 0) return touches(b, a);
  return a.start <= b.start + b.count - 1 && b.start <= a.start + a.count - 1;
}
function changes(lane, base) {
  const result = new Map();
  for (const file of changed(lane, base).filter(f => f !== GATE)) {
    const diff = git(lane, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--unified=0', base, '--', file);
    const hunks = [...diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm)].map(m => ({ start: +m[1], count: m[2] === undefined ? 1 : +m[2] }));
    const structural = !hunks.length || /^(?:new file mode|deleted file mode|old mode|new mode|Binary files|GIT binary patch)/m.test(diff);
    result.set(file, { hunks, structural });
  }
  return result;
}
main(() => {
  const o = options(process.argv.slice(2));
  if (!o.lanes.length) fail('USAGE: supply --lane worktree at least once');
  // Validate gate exception before excluding it from collisions.
  generate(o.tree, o.base, o.lanes);
  for (const lane of o.lanes) {
    const common = git(lane, 'merge-base', o.base, 'HEAD').trim();
    if (common !== o.base) fail(`STALE_BASE: ${lane}: rebase to pinned ${o.base} before comparing line coordinates`);
  }
  const maps = o.lanes.map(lane => changes(lane, o.base));
  const blocked = new Set();
  for (let i = 0; i < maps.length; i++) for (let j = i + 1; j < maps.length; j++) {
    const conflicts = [], shared = [];
    for (const [file, a] of maps[i]) {
      const b = maps[j].get(file);
      if (!b) continue;
      shared.push(file);
      if (a.structural || b.structural || a.hunks.some(x => b.hunks.some(y => touches(x, y)))) conflicts.push(file);
    }
    const pair = `${o.lanes[i]} + ${o.lanes[j]}`;
    if (conflicts.length) { blocked.add(`${i}:${j}`); console.log(`REFUSE same train: ${pair}: overlapping edits or structural changes: ${conflicts.join(', ')}`); }
    else console.log(`CANDIDATE same train: ${pair}${shared.length ? `: disjoint hunks in ${shared.join(', ')}` : ': disjoint files'}; behavioral gate still required`);
  }
  // Deterministic greedy partition, not a minimum-colouring claim.
  const groups = [];
  for (let i = 0; i < maps.length; i++) {
    let group = groups.find(g => g.every(j => !blocked.has(`${j}:${i}`)));
    if (!group) { group = []; groups.push(group); }
    group.push(i);
  }
  groups.forEach((g, i) => console.log(`TRAIN CANDIDATE ${i + 1}: ${g.map(j => o.lanes[j]).join(', ')}`));
  console.log(`${blocked.size ? 'REFUSE' : 'PASS'} overlap: ${blocked.size} incompatible pair(s); base ${o.base}`);
  if (blocked.size) process.exitCode = 1;
});

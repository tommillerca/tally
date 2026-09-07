/* serveTree must reject a fixed port already answering from another checkout.
 * Two temporary trees deliberately have different index files. Returning tree
 * A's URL while asked to serve tree B is the exact false-green this guards. */
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { serveTree } from './godmode.js';

const parent = await mkdtemp(path.join(os.tmpdir(), 'serve-tree-identity-'));
const treeA = path.join(parent, 'tree-a');
const treeB = path.join(parent, 'tree-b');
await Promise.all([
  mkdir(treeA),
  mkdir(treeB),
]);
await Promise.all([
  writeFile(path.join(treeA, 'index.html'), 'TREE A'),
  writeFile(path.join(treeB, 'index.html'), 'TREE B'),
]);

let first;
let second;
let thrown;
try {
  first = await serveTree(treeA);
  try {
    second = await serveTree(treeB, { forcePort: first.port, timeoutMs: 3000 });
  } catch (error) {
    thrown = error;
  }
  const served = await fetch(first.url + 'index.html').then(r => r.text());
  const pass = !!thrown && /something else is already serving that port/i.test(String(thrown));
  console.log(`${pass ? 'PASS' : 'FAIL'}  WRONG-TREE  ${thrown ? String(thrown) : `serveTree returned ${second.url}; fetched ${JSON.stringify(served)} from tree A`}`);
  if (!pass) process.exitCode = 1;
} finally {
  second?.close();
  first?.close();
  await rm(parent, { recursive: true, force: true });
}

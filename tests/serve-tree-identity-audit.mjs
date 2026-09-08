import assert from 'node:assert/strict';
import * as execFile_ from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { auditOutputPath } from './lib/audit-output.mjs';
/* serveTree must reject a fixed port already answering from another checkout.
 * Two temporary trees deliberately have different index files. Returning tree
 * A's URL while asked to serve tree B is the exact false-green this guards. */
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { serveTree } from './godmode.js';

const parent = await mkdtemp(auditOutputPath(path.join(os.tmpdir(), 'serve-tree-identity-')));
const treeA = path.join(parent, 'tree-a');
const treeB = path.join(parent, 'tree-b');
await Promise.all([
  mkdir(auditOutputPath(treeA)),
  mkdir(auditOutputPath(treeB)),
]);
await Promise.all([
  writeFile(auditOutputPath(path.join(treeA, 'index.html')), 'TREE A'),
  writeFile(auditOutputPath(path.join(treeB, 'index.html')), 'TREE B'),
]);

let first;
let second;
let thrown;
try {
  const beforeA = await readdir(treeA);
  const beforeB = await readdir(treeB);
  first = await serveTree(treeA);
  assert.deepEqual(await readdir(treeA), beforeA, 'serving must not create tree artifacts');
  try {
    second = await serveTree(treeB, { forcePort: first.port, timeoutMs: 3000 });
  } catch (error) {
    thrown = error;
  }
  assert.deepEqual(await readdir(treeB), beforeB, 'failed serve must not create tree artifacts');
  console.log('PASS READ-ONLY serving and refusal leave both trees unchanged');
  const served = await fetch(first.url + 'index.html').then(r => r.text());
  const pass = !!thrown && /something else is already serving that port/i.test(String(thrown));
  console.log(`${pass ? 'PASS' : 'FAIL'}  WRONG-TREE  ${thrown ? String(thrown) : `serveTree returned ${second.url}; fetched ${JSON.stringify(served)} from tree A`}`);
  if (!pass) process.exitCode = 1;
} finally {
  second?.close();
  first?.close();
  await rm(auditOutputPath(parent), { recursive: true, force: true });
}

/* A SELF-SERVED AUDIT HAS TO BE ABLE TO EXIT. serveTree's python child, and the
   two piped stdio sockets, are refed handles: an audit that falls off the end of
   its file after browser.close() then stays alive forever and has to be SIGTERMed,
   which reports as exit 143 and reads as a red audit. contrast-audit.mjs sat like
   that in the FULL tier of the release gate. Run for real rather than grepped for
   unref(): the assertion is that the process ENDS, which is the thing that broke.
   Goes red on the unfixed serveTree (measured: killed at the 20s cap, exit 143). */
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const script = `import { serveTree } from ${JSON.stringify(join(here, 'godmode.js'))};
    const own = await serveTree(${JSON.stringify(join(here, '..'))});
    process.once('exit', () => own.close());`;
  try {
    execFile_.execFileSync(process.execPath, ['--input-type=module', '-e', script],
      { timeout: 20000, stdio: 'ignore' });
  } catch (e) {
    assert.fail(`serveTree kept node alive, so a self-serving audit can never exit: ${e.signal || e.message}`);
  }
  console.log('PASS serveTree does not hold the event loop open after the script ends');
}

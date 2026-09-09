import { auditOutputPath } from './audit-output.mjs';
// node tests/lib/sync-controls.mjs > docs/sync-bisect/controls.jsonl
// Sensitivity controls, NOT reproductions of the production outage.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
for (const mutation of ['healthy', 'snapshot-throws', 'boot-call-removed', 'resume-call-removed']) {
  const tree = mkdtempSync(auditOutputPath(join(tmpdir(), 'sync-control-')));
  try {
    for (const p of ['package.json', 'js', 'data']) cpSync(join(root, p), auditOutputPath(join(tree, p)), { recursive: true });
    const appPath = join(tree, 'js/app.js');
    let app = readFileSync(appPath, 'utf8');
    if (mutation === 'snapshot-throws') {
      assert.ok(app.includes('async function socialSnapshot() {'));
      app = app.replace('async function socialSnapshot() {', 'async function socialSnapshot() {\n  throw new Error("CONTROL broken snapshot");');
    } else if (mutation.endsWith('call-removed')) {
      const start = app.indexOf('function bindAppLifecycle() {');
      const end = app.indexOf('\n}', start);
      assert.ok(start > 0 && end > start);
      let n = 0;
      const tail = app.slice(start, end).replace(/^.*social\.autoSync\(socialSnapshot, APP_SOCIAL_V\).*$/gm, line => {
        const remove = n++ === (mutation === 'boot-call-removed' ? 0 : 1);
        return remove ? '// CONTROL removed sync call' : line;
      });
      assert.equal(n, 2, 'both real lifecycle calls located');
      app = app.slice(0, start) + tail + app.slice(end);
    }
    writeFileSync(auditOutputPath(appPath), app);
    const r = spawnSync(process.execPath, [join(root, 'tests/sync-path-audit.mjs'), tree], { encoding: 'utf8', timeout: 30000 });
    console.log(JSON.stringify({ mutation, exit: r.status, stdout: r.stdout, stderr: r.stderr }));
    assert.equal(r.status, mutation === 'healthy' ? 0 : 1, `${mutation} exit`);
    if (mutation !== 'healthy') {
      const label = mutation === 'snapshot-throws' ? 'empty' : mutation.startsWith('boot') ? 'boot' : 'resume';
      const row = r.stdout.split('\n').filter(s => s.startsWith('{')).map(JSON.parse).find(r => r.label === label);
      assert.equal(row?.pass, false, `${mutation} must fail its intended row`);
    }
  } finally { rmSync(auditOutputPath(tree), { recursive: true, force: true }); }
}
console.error('PASS: healthy exits 0; snapshot, boot and resume mutations each exit 1 on their intended row');

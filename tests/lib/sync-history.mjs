import { auditOutputPath } from './audit-output.mjs';
// Run from this checkout: node tests/lib/sync-history.mjs > docs/sync-bisect/history.jsonl
// Exports tracked runtime trees into temporary directories, never switches HEAD.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const commits = git(['log', '--first-parent', '--reverse', '--format=%H', '6eb45e81^..HEAD']).toString().trim().split('\n');
let failed = 0;
for (const commit of commits) {
  const tree = mkdtempSync(auditOutputPath(join(tmpdir(), 'sync-history-')));
  try {
    const archive = git(['archive', commit, 'package.json', 'js', 'data', 'server/src']);
    execFileSync('tar', ['-x', '-C', auditOutputPath(tree)], { input: archive });
    const r = spawnSync(process.execPath, [join(root, 'tests/sync-path-audit.mjs'), tree], { encoding: 'utf8', timeout: 30000 });
    const meta = git(['show', '-s', '--format=%cI%x09%s', commit]).toString().trim();
    const build = readFileSync(join(tree, 'js/app.js'), 'utf8').match(/^const APP_BUILD = '([^']+)'/m)?.[1];
    console.log(JSON.stringify({ commit, build, meta, exit: r.status, error: r.error?.message, stdout: r.stdout, stderr: r.stderr }));
    if (r.status !== 0) failed++;
  } finally { rmSync(auditOutputPath(tree), { recursive: true, force: true }); }
}
console.error(`${commits.length} trees probed; ${failed} failed`);
process.exitCode = failed ? 1 : 0;

import { auditOutputPath } from './lib/audit-output.mjs';
/* PROVES native/submission-preflight.mjs GOES RED.
 *
 * The preflight is the only thing standing between a store archive and Apple,
 * and a guard that cannot fail is not a guard. Each of its four failure modes
 * is driven here against a real invocation, plus the healthy case as a control,
 * so a preflight that silently stopped checking would be caught.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readdirSync, symlinkSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PREFLIGHT = path.join(HERE, '..', 'native', 'submission-preflight.mjs');
const dir = mkdtempSync(auditOutputPath(path.join(tmpdir(), 'submission-preflight-')));
const failures = [];

/* The scanner blanks the invitation island between these two markers, so a
   fixture needs both or every bundle reads as malformed. */
const island = [
  "const TESTFLIGHT_URL = 'https://testflight.apple.com/join/xxxx';",
  "const invite = 'Join the beta';",
  '// Test hook (webdriver only), same reasoning as __community above.',
].join('\n');

const bundle = (flag, extra = '') =>
  `const STORE_BUILD = ${flag};\n${island}\n${extra}\n`;

function run(slug, name, { app, config, marker }, wantExit, wantText) {
  const appPath = path.join(dir, `${slug}.js`);
  const cfgPath = path.join(dir, `${slug}.json`);
  writeFileSync(auditOutputPath(appPath), app);
  writeFileSync(auditOutputPath(cfgPath), JSON.stringify(config));
  const markerPath = path.join(dir, `${slug}-submission.json`);
  writeFileSync(auditOutputPath(markerPath), JSON.stringify(marker ?? { kind: 'submission', appSha256: createHash('sha256').update(app).digest('hex') }));
  const r = spawnSync(process.execPath, [PREFLIGHT, appPath, cfgPath, markerPath], { encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`;
  const ok = r.status === wantExit && (!wantText || out.includes(wantText));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  exit ${r.status} (want ${wantExit})  ${out.trim().split('\n')[0] || ''}`);
  if (!ok) failures.push(name);
}

run('healthy', 'HEALTHY  a correct store bundle passes',
  { app: bundle('true'), config: { appId: 'com.boneheadz.gym' } }, 0);

run('wrong-marker', 'MARKER   internal channel is refused even with a correct hash',
  { app: bundle('true'), config: {}, marker: { kind: 'internal', appSha256: createHash('sha256').update(bundle('true')).digest('hex') } },
  1, 'submission marker missing, wrong channel');

run('flag', 'FLAG     a bundle built without STORE_BUILD=1 is refused',
  { app: bundle('false'), config: { appId: 'com.boneheadz.gym' } }, 1, 'does not declare STORE_BUILD = true');

run('server', 'SERVER   a synced config that still has a server URL is refused',
  { app: bundle('true'), config: { appId: 'com.boneheadz.gym', server: { url: 'https://tommillerca.github.io/tally/' } } },
  1, 'still has a server key');

run('string', 'STRING   a reachable TestFlight string is refused',
  { app: bundle('true', "const row = { label: 'Open TestFlight' };"), config: { appId: 'com.boneheadz.gym' } },
  1, 'reachable');

for (const [slug, extra, wantExit] of [
  ['single-url', "function later(){ window.open('https://testflight.apple.com/join/LEAK'); }", 1],
  ['template-url', 'function later(){ window.open(`https://testflight.apple.com/join/LEAK`); }', 1],
  ['double-url', 'function later(){ window.open("https://testflight.apple.com/join/LEAK"); }', 1],
  ['line-comment', '// https://testflight.apple.com/join/COMMENT\nconst safe = "hello";', 0],
  ['comment-in-string', 'const s = "not // a comment"; const row = "Open TestFlight";', 1],
]) {
  run(slug, `SCANNER  ${slug}`,
    { app: bundle('true', extra), config: { appId: 'com.boneheadz.gym' } },
    wantExit, wantExit ? 'reachable' : 'submission preflight passed');
}

// CONTROL: run the gate's real coverage check, then add a runnable file in a
// throwaway tests directory. No fixture touches the checkout or starts a server.
const coverageDir = path.join(dir, 'tests');
mkdirSync(auditOutputPath(coverageDir));
for (const file of readdirSync(HERE)) {
  if (file === 'release-gate.mjs') copyFileSync(path.join(HERE, file), auditOutputPath(path.join(coverageDir, file)));
  else symlinkSync(path.join(HERE, file), auditOutputPath(path.join(coverageDir, file)));
}
function coverage(name, wantExit, wantText) {
  const r = spawnSync(process.execPath, [path.join(coverageDir, 'release-gate.mjs'), '--coverage-only'], { encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`;
  const ok = r.status === wantExit && out.includes(wantText);
  console.log(`${ok ? 'PASS' : 'FAIL'}  COVERAGE ${name}  exit ${r.status} (want ${wantExit})  ${out.trim()}`);
  if (!ok) failures.push(`coverage ${name}`);
}
coverage('registered helper', 0, 'coverage:');
writeFileSync(auditOutputPath(path.join(coverageDir, 'unregistered-store-fixture.mjs')), 'process.exit(0);\n');
coverage('unregistered runnable refused', 1, 'unregistered-store-fixture.mjs');

rmSync(auditOutputPath(dir), { recursive: true, force: true });
if (failures.length) { console.error(`\nsubmission-preflight: ${failures.length} FAILED`); process.exit(1); }
console.log('\nsubmission preflight: refuses marker, flag, server and copy defects; passes the control');

/* Artifact gate, not a claim about a source checkout or an operator's memory.
 * Usage: SUBMISSION=1 node tests/submission-build-audit.mjs <bundle app.js>
 *          <synced capacitor.config.json> <submission-build.json>
 * The native build producer must write the marker after sync and before archive.
 * Native integration is outside the R45 guard lane; existing unmarked builds fail.
 * Hashes bind the marker to these bytes. This is provenance hygiene, not signing.
 */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// No arguments runs fixture tests for PURE. It never certifies a built artifact.
if (process.argv.length === 2) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const dir = mkdtempSync(path.join(tmpdir(), 'submission-build-'));
  const failures = [];
  console.log('SUBMISSION BUILD SELF-TEST: synthetic fixtures only');
  try {
    // R45-9: neither an env flag nor clean content alone marks an artifact.
    const artifactApp = path.join(dir, 'artifact.js');
    const artifactConfig = path.join(dir, 'artifact.json');
    const artifactMarker = path.join(dir, 'submission-build.json');
    const bundle = flag => `const STORE_BUILD = ${flag};
    const TESTFLIGHT_URL = 'https://testflight.apple.com/join/xxxx';
    const invite = 'Join the beta';
    // Test hook (webdriver only), same reasoning as __community above.
    `;
    const cleanApp = bundle('true');
    const cleanConfig = JSON.stringify({ appId: 'com.boneheadz.gym' });
    const sha = text => createHash('sha256').update(text).digest('hex');
    const cleanMarker = { schema: 1, mode: 'submission', appSha256: sha(cleanApp), configSha256: sha(cleanConfig) };
    function artifact(name, { submission = '1', marker = cleanMarker, app = cleanApp, config = cleanConfig } = {}, wantExit = 1, wantText = 'FAIL') {
      writeFileSync(artifactApp, app);
      writeFileSync(artifactConfig, config);
      rmSync(artifactMarker, { force: true });
      if (marker !== null) writeFileSync(artifactMarker, JSON.stringify(marker));
      const env = { ...process.env, SUBMISSION: submission };
      const result = spawnSync(process.execPath, [path.join(HERE, 'submission-build-audit.mjs'), artifactApp, artifactConfig, artifactMarker], { encoding: 'utf8', env });
      const out = `${result.stdout}${result.stderr}`;
      const pass = result.status === wantExit && out.includes(wantText);
      console.log(`${pass ? 'PASS' : 'FAIL'}  ARTIFACT ${name}  exit ${result.status} (want ${wantExit})`);
      if (!pass) { failures.push(name); console.log(out); }
    }
    artifact('CONTROL marked store artifacts', {}, 0, 'VERIFIED marked artifacts');
    artifact('unmarked clean artifacts refused even with SUBMISSION=1', { marker: null });
    artifact('flag omitted', { submission: '' }, 1, 'FAIL  SUBMISSION explicit invocation');
    artifact('internal marker refused', { marker: { ...cleanMarker, mode: 'internal' } }, 1, 'FAIL  SUBMISSION artifact marked');
    artifact('stale app hash refused', { app: cleanApp + '// changed\n' }, 1, 'FAIL  SUBMISSION marker matches');
    artifact('stale config hash refused', { config: cleanConfig + '\n' }, 1, 'FAIL  SUBMISSION marker matches');
    const betaApp = bundle('false');
    artifact('marked beta content still refused', { app: betaApp, marker: { ...cleanMarker, appSha256: sha(betaApp) } }, 1, 'FAIL  SUBMISSION store-content');
    const remoteConfig = JSON.stringify({ server: { url: 'https://example.invalid' } });
    artifact('marked remote config still refused', { config: remoteConfig, marker: { ...cleanMarker, configSha256: sha(remoteConfig) } }, 1, 'FAIL  SUBMISSION store-content');

  } finally { rmSync(dir, { recursive: true, force: true }); }
  console.log(`submission-build self-test: ${failures.length ? failures.length + ' FAILED' : 'clean'}`);
  process.exit(failures.length ? 1 : 0);
}

const [appPath, configPath, markerPath] = process.argv.slice(2);
const failures = [];
const ok = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  if (!pass) failures.push(name);
};
ok('SUBMISSION explicit invocation', process.env.SUBMISSION === '1',
  'SUBMISSION=1 is required; the environment alone is not artifact evidence');
ok('SETUP artifact paths supplied', !!(appPath && configPath && markerPath),
  'requires bundle app.js, synced capacitor config and submission-build.json');
if (appPath && configPath && markerPath) {
  try {
    const app = readFileSync(appPath);
    const config = readFileSync(configPath);
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    ok('SUBMISSION artifact marked', marker?.schema === 1 && marker.mode === 'submission',
      'marker schema 1, mode submission');
    ok('SUBMISSION marker matches inspected artifacts',
      marker?.appSha256 === hash(app) && marker?.configSha256 === hash(config),
      'SHA256 of bundle app.js and synced capacitor config');
    // CONTROL is the real preflight on the exact same files, never source copies.
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../native/submission-preflight.mjs', import.meta.url)),
      appPath, configPath], { encoding: 'utf8' });
    ok('SUBMISSION store-content preflight', result.status === 0,
      `${result.stdout || ''}${result.stderr || ''}${result.error?.message || ''}`.trim());
  } catch (error) {
    ok('SUBMISSION readable marked artifacts', false, error.message);
  }
}
console.log(`submission-build: ${failures.length ? 'FAILED' : 'VERIFIED marked artifacts'}`);
process.exitCode = failures.length ? 1 : 0;
/* Node-only shell integration guard. All platform/network commands are local
 * fixture executables. No Xcode, Capacitor CLI, ASC client or sockets are used.
 * CONTROL cases corrupt the copied resources and the archive independently:
 * a good www directory cannot conceal either defect. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'native/build-ios.sh'), 'utf8');
const failures = [];
const check = (ok, name) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failures.push(name);
};
// Refuse even a fixture run if source could escape into an original checkout.
if (source.includes('/Users/') || !source.includes('BASH_SOURCE[0]')) {
  console.error('FAIL build-ios.sh must resolve its own checkout before fixture execution');
  process.exit(1);
}
const temp = mkdtempSync(path.join(tmpdir(), 'submission-build-'));
const island = "const TESTFLIGHT_URL = 'https://testflight.apple.com/join/HIDDEN';\n"
  + '// Test hook (webdriver only), same reasoning as __community above.\n';
const shim = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const name = path.basename(process.argv[1]), args = process.argv.slice(2);
const base = process.env.FIXTURE_NATIVE;
const log = s => fs.appendFileSync(process.env.FIXTURE_LOG, s + '\\n');
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), {recursive:true}); fs.cpSync(from,to,{recursive:true}); };
log(name + ' ' + args.join(' '));
if (name === 'npx') {
  if (process.env.FAULT === 'sync-fail') process.exit(17);
  copy(base + '/www', base + '/ios/App/App/public');
  copy(base + '/capacitor.config.json', base + '/ios/App/App/capacitor.config.json');
  if (process.env.FAULT === 'sync-copy') fs.appendFileSync(base + '/ios/App/App/public/js/app.js', '\\nconst stale = true;');
} else if (name === 'python3') {
  if (args[1] === 'next') console.log('21');
} else if (name === 'xcodebuild') {
  if (args.includes('-exportArchive')) {
    const dir = args[args.indexOf('-exportPath')+1];
    fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(dir+'/App.ipa','fixture');
  } else {
    if (process.env.FAULT === 'archive-fail') process.exit(18);
    const app = args[args.indexOf('-archivePath')+1] + '/Products/Applications/App.app';
    copy(base + '/ios/App/App/public', app+'/public');
    copy(base + '/ios/App/App/capacitor.config.json', app+'/capacitor.config.json');
    if (process.env.FAULT === 'archive-copy') fs.appendFileSync(app+'/public/js/app.js','\\nconst stale = true;');
    if (process.env.FAULT === 'archive-server') fs.writeFileSync(app+'/capacitor.config.json', '{"server":{"url":"https://example.invalid"}}');
    if (process.env.FAULT === 'archive-unmarked') fs.unlinkSync(app+'/public/submission.json');
  }
} else if (!['sed', 'xcrun'].includes(name)) {
  throw new Error('unexpected fixture executable ' + name);
}
`;
let runId = 0;
function run(mode, fault = '') {
  const dir = path.join(temp, String(++runId));
  const native = path.join(dir, 'native');
  for (const rel of ['native/ios/App/App.xcodeproj', 'tests', 'bin']) mkdirSync(path.join(dir, rel), { recursive: true });
  symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
  for (const file of ['build-store.sh', 'submission-preflight.mjs']) copyFileSync(path.join(root, 'native', file), path.join(native, file));
  copyFileSync(path.join(root, 'tests/store-copy-scan.mjs'), path.join(dir, 'tests/store-copy-scan.mjs'));
  writeFileSync(path.join(native, 'build-ios.sh'), source);
  // Build-store is real. Only the large web copy is replaced with a tiny bundle.
  writeFileSync(path.join(native, 'build-www.sh'), `#!/bin/bash\nset -e\nnode - <<'JS'\nconst fs=require('fs');\nfs.rmSync('www',{recursive:true,force:true}); fs.mkdirSync('www/js',{recursive:true});\nfs.writeFileSync('www/js/app.js', 'const STORE_BUILD = ' + (process.env.STORE_BUILD === '1') + ';\\n' + ${JSON.stringify(island)});\nJS\n`, { mode: 0o755 });
  const originalConfig = '{"appId":"com.boneheadz.gym","server":{"url":"https://example.invalid"}}\n';
  writeFileSync(path.join(native, 'capacitor.config.json'), originalConfig);
  writeFileSync(path.join(native, 'ios/App/App.xcodeproj/project.pbxproj'), 'CURRENT_PROJECT_VERSION = 20;\n');
  const logPath = path.join(dir, 'calls.log');
  for (const name of ['npx', 'python3', 'sed', 'xcodebuild', 'xcrun']) writeFileSync(path.join(dir, 'bin', name), shim, { mode: 0o755 });
  symlinkSync(process.execPath, path.join(dir, 'bin/node'));
  const env = { ...process.env, PATH: `${dir}/bin:/usr/bin:/bin`, FIXTURE_NATIVE: native, FIXTURE_LOG: logPath, FAULT: fault };
  delete env.SUBMISSION;
  delete env.STORE_BUILD;
  if (mode !== undefined) env.SUBMISSION = mode;
  const result = spawnSync('/bin/bash', [path.join(native, 'build-ios.sh')], { cwd: dir, env, encoding: 'utf8' });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  writeFileSync(path.join(dir, 'output.txt'), output);
  writeFileSync(path.join(dir, 'exit.txt'), String(result.status));
  return { status: result.status, output,
    calls: existsSync(logPath) ? readFileSync(logPath, 'utf8') : '',
    restored: readFileSync(path.join(native, 'capacitor.config.json'), 'utf8') === originalConfig,
    native };
}
try {
  for (const mode of [undefined, '', 'true', '2']) {
    const r = run(mode);
    check(r.status === 2 && r.output.includes('BUILD REFUSED:') && !r.calls && r.restored && !existsSync(path.join(r.native, 'www')),
      `unmarked/invalid mode ${JSON.stringify(mode) ?? 'unset'} refuses before side effects (exit ${r.status})`);
  }
  const internal = run('0');
  check(internal.status === 0 && internal.calls.includes('build/internal/App.xcarchive') && internal.calls.includes('build/internal/export/App.ipa') && !internal.calls.includes('build/submission/') && !existsSync(path.join(internal.native, 'www/submission.json')) && JSON.parse(readFileSync(path.join(internal.native, 'ios/App/App/capacitor.config.json'), 'utf8')).server?.url === 'https://example.invalid' && readFileSync(path.join(internal.native, 'ios/App/App/public/js/app.js'), 'utf8').includes('const STORE_BUILD = false;') && internal.restored,
    'explicit internal build remains remote and uses internal artifacts');
  const store = run('1');
  check(store.status === 0 && store.calls.includes('build/submission/App.xcarchive') && store.calls.includes('build/submission/export/App.ipa') && (store.output.match(/submission preflight passed:/g) || []).length === 2 && store.restored,
    'CONTROL marked submission validates copied resources and archive, then exports its own IPA');
  for (const [fault, expected, beforeArchive] of [
    ['sync-copy', 'does not match bundle bytes', true],
    ['archive-copy', 'does not match bundle bytes', false],
    ['archive-server', 'still has a server key', false],
    ['archive-unmarked', 'missing or unreadable submission input', false],
  ]) {
    const r = run('1', fault);
    check(r.status === 1 && r.output.includes(expected) && !r.calls.includes('-exportArchive') && !r.calls.includes('xcrun ') && (!beforeArchive || !r.calls.includes('xcodebuild ')) && r.restored,
      `CONTROL ${fault} refused before ${beforeArchive ? 'archive' : 'export/upload'}; config restored`);
  }
  for (const [fault, status] of [['sync-fail', 17], ['archive-fail', 18]]) {
    const r = run('1', fault);
    check(r.status === status && r.restored && !r.calls.includes('xcrun '), `CONTROL ${fault} restores config and stops upload`);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
if (failures.length) { console.error(`submission build: ${failures.length} FAILED`); process.exit(1); }
console.log('ok submission build: explicit modes, separate artifacts, copied and archived content guarded (fixture tools only)');

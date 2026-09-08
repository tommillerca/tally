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

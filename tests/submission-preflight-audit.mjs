/* PROVES native/submission-preflight.mjs GOES RED.
 *
 * The preflight is the only thing standing between a store archive and Apple,
 * and a guard that cannot fail is not a guard. Each of its three failure modes
 * is driven here against a real invocation, plus the healthy case as a control,
 * so a preflight that silently stopped checking would be caught.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PREFLIGHT = path.join(HERE, '..', 'native', 'submission-preflight.mjs');
const dir = mkdtempSync(path.join(tmpdir(), 'submission-preflight-'));
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

function run(slug, name, { app, config }, wantExit, wantText) {
  const appPath = path.join(dir, `${slug}.js`);
  const cfgPath = path.join(dir, `${slug}.json`);
  writeFileSync(appPath, app);
  writeFileSync(cfgPath, JSON.stringify(config));
  const r = spawnSync(process.execPath, [PREFLIGHT, appPath, cfgPath], { encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`;
  const ok = r.status === wantExit && (!wantText || out.includes(wantText));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  exit ${r.status} (want ${wantExit})  ${out.trim().split('\n')[0] || ''}`);
  if (!ok) failures.push(name);
}

run('healthy', 'HEALTHY  a correct store bundle passes',
  { app: bundle('true'), config: { appId: 'com.boneheadz.gym' } }, 0);

run('flag', 'FLAG     a bundle built without STORE_BUILD=1 is refused',
  { app: bundle('false'), config: { appId: 'com.boneheadz.gym' } }, 1, 'does not declare STORE_BUILD = true');

run('server', 'SERVER   a synced config that still has a server URL is refused',
  { app: bundle('true'), config: { appId: 'com.boneheadz.gym', server: { url: 'https://tommillerca.github.io/tally/' } } },
  1, 'still has a server key');

run('string', 'STRING   a reachable TestFlight string is refused',
  { app: bundle('true', "const row = { label: 'Open TestFlight' };"), config: { appId: 'com.boneheadz.gym' } },
  1, 'reachable');

rmSync(dir, { recursive: true, force: true });
if (failures.length) { console.error(`\nsubmission-preflight: ${failures.length} FAILED`); process.exit(1); }
console.log('\nsubmission preflight: refuses all three, passes the control');

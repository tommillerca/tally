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

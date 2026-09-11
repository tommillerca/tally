// Run the real producer with a minimal source tree, including no native/.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { auditOutputPath } from './audit-output.mjs';

const producer = readFileSync(new URL('../../native/build-www.sh', import.meta.url), 'utf8');
const temp = mkdtempSync(auditOutputPath(path.join(tmpdir(), 'store-bundle-guard-')));
try {
  for (const name of ['index.html', 'app.css', 'manifest.webmanifest', 'privacy.html']) {
    writeFileSync(auditOutputPath(path.join(temp, name)), '');
  }
  for (const name of ['js', 'data', 'vendor', 'icons', 'assets', 'builder']) mkdirSync(auditOutputPath(path.join(temp, name)));
  writeFileSync(auditOutputPath(path.join(temp, 'js/app.js')), 'const STORE_BUILD = false;\n');
  const run = (source, store) => spawnSync('/bin/bash', ['-c', source], {
    cwd: path.join(temp, 'builder'), encoding: 'utf8', env: { ...process.env, STORE_BUILD: store },
  });
  const expected = ['app.css', 'assets', 'data', 'icons', 'index.html', 'js', 'manifest.webmanifest', 'privacy.html', 'vendor'];
  assert.equal(existsSync(path.join(temp, 'native')), false);
  const store = run(producer, '1');
  assert.equal(store.status, 0, store.stderr);
  assert.deepEqual(readdirSync(path.join(temp, 'builder/www')).sort(), expected);
  assert.match(readFileSync(path.join(temp, 'builder/www/js/app.js'), 'utf8'), /const STORE_BUILD = true;/);
  console.log('PASS store producer without native/: exact bundle inventory and store flag');

  const missing = run(producer, '0');
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /native\/capabilities\.json/);
  mkdirSync(auditOutputPath(path.join(temp, 'native')));
  const manifest = '{"guard":"known_gap"}\n';
  writeFileSync(auditOutputPath(path.join(temp, 'native/capabilities.json')), manifest);
  const native = run(producer, '0');
  assert.equal(native.status, 0, native.stderr);
  assert.deepEqual(readdirSync(path.join(temp, 'builder/www')).sort(), [...expected, 'native'].sort());
  assert.equal(readFileSync(path.join(temp, 'builder/www/native/capabilities.json'), 'utf8'), manifest);
  const storeWithManifest = run(producer, '1');
  assert.equal(storeWithManifest.status, 0, storeWithManifest.stderr);
  assert.deepEqual(readdirSync(path.join(temp, 'builder/www')).sort(), expected);
  console.log('PASS missing non-store manifest is loud; present manifest copies only for non-store');
} finally {
  rmSync(auditOutputPath(temp), { recursive: true, force: true });
}

/* THE LAST THING BETWEEN A STORE BUILD AND APPLE.
 *
 * Run by native/build-ios.sh in SUBMISSION mode, after `npx cap sync ios` and
 * before the archive. It asserts the three things that separate a submission
 * build from an internal one, on the bundle that is actually about to be
 * archived rather than on the repo:
 *   1. the bundle declares STORE_BUILD = true
 *   2. the synced iOS config has no server key, so Capacitor serves the local
 *      bundle instead of the live site
 *   3. no TestFlight or beta string is reachable in the bundle
 *
 * Why this exists: build-ios.sh used to call plain ./build-www.sh and sync
 * against the unmodified capacitor.config.json, so every uploaded build shipped
 * the beta surfaces AND loaded the live site over the network. build-store.sh
 * did it correctly but nothing called it, and its own comment expected a human
 * to swap the two configs by hand. A hand step with nothing asserting it
 * happened is the defect this replaces.
 *
 * Exits non-zero, so `set -e` in build-ios.sh stops before the archive.
 * Usage: node submission-preflight.mjs <bundle app.js> <synced capacitor config>
 */
import { readFileSync } from 'node:fs';
import { scanReachable } from '../tests/store-copy-scan.mjs';

const [bundlePath, configPath] = process.argv.slice(2);
if (!bundlePath || !configPath) {
  console.error('SUBMISSION PREFLIGHT FAILED: usage: submission-preflight.mjs <bundle app.js> <synced capacitor config>');
  process.exit(2);
}
const bundle = readFileSync(bundlePath, 'utf8');
const synced = JSON.parse(readFileSync(configPath, 'utf8'));
const failures = [];

if (!/const\s+STORE_BUILD\s*=\s*true\s*;/.test(bundle)) {
  failures.push(`${bundlePath} does not declare STORE_BUILD = true (the bundle was built without STORE_BUILD=1)`);
}
if (Object.prototype.hasOwnProperty.call(synced, 'server')) {
  failures.push(`${configPath} still has a server key, so the app would load the live site over the network instead of its own bundle`);
}
failures.push(...scanReachable(bundle, bundlePath));

if (failures.length) {
  for (const f of failures) console.error(`SUBMISSION PREFLIGHT FAILED: ${f}`);
  process.exit(1);
}
console.log('submission preflight passed: store bundle, local config, no reachable beta strings');

/* THE LAST THING BETWEEN A STORE BUILD AND APPLE.
 *
 * Run by native/build-ios.sh in SUBMISSION mode, after `npx cap sync ios` and
 * before archiving, then on the archive before export. It asserts four things
 * separating a submission build from an internal one, on the copied resources
 * and archive rather than on the repo:
 *   1. a submission marker matches the exact app.js bytes
 *   2. the bundle declares STORE_BUILD = true
 *   3. the synced iOS config has no server key, so Capacitor serves the local
 *      bundle instead of the live site
 *   4. no TestFlight or beta string is reachable in the bundle
 *
 * Why this exists: build-ios.sh used to call plain ./build-www.sh and sync
 * against the unmodified capacitor.config.json, so every uploaded build shipped
 * the beta surfaces AND loaded the live site over the network. build-store.sh
 * did it correctly but nothing called it, and its own comment expected a human
 * to swap the two configs by hand. A hand step with nothing asserting it
 * happened is the defect this replaces.
 *
 * Exits non-zero, so `set -e` stops the build before archive or export.
 * Usage: node submission-preflight.mjs <bundle app.js> <capacitor config> <submission.json>
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { scanReachable } from '../tests/store-copy-scan.mjs';

const [bundlePath, configPath, markerPath] = process.argv.slice(2);
if (!bundlePath || !configPath || !markerPath) {
  console.error('SUBMISSION PREFLIGHT FAILED: usage: submission-preflight.mjs <bundle app.js> <capacitor config> <submission.json>');
  process.exit(2);
}
let bundle, synced, marker;
try {
  bundle = readFileSync(bundlePath, 'utf8');
  synced = JSON.parse(readFileSync(configPath, 'utf8'));
  marker = JSON.parse(readFileSync(markerPath, 'utf8'));
  if (!synced || typeof synced !== 'object' || Array.isArray(synced)) throw new Error('invalid capacitor config');
} catch (error) {
  console.error(`SUBMISSION PREFLIGHT FAILED: missing or unreadable submission input: ${error.message}`);
  process.exit(1);
}
const failures = [];
if (marker?.kind !== 'submission' || marker.appSha256 !== createHash('sha256').update(bundle).digest('hex')) {
  failures.push('submission marker missing, wrong channel or does not match bundle bytes');
}

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
console.log('submission preflight passed: marked store bundle, local config, no reachable beta strings');

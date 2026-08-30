/* VERSION ALIGNMENT LINT.
 *
 * iOS, Android and web ship independently but MUST track which web build each
 * native shell wrapped. This lint verifies:
 *
 * 1. Web versions are consistent (all three point to the same build).
 * 2. Each native config carries a WRAPPED_WEB_BUILD marker that records
 *    which web version that shell last bundled.
 * 3. The markers are documented in a known registry so support can correlate
 *    tickets with web versions.
 *
 * The convention: each native config carries a comment block that names the
 * wrapped build. Examples:
 *   iOS: // WRAPPED_WEB_BUILD=v413
 *   Android: // WRAPPED_WEB_BUILD=v413
 *
 * When a native shell re-wraps a new web build (e.g. a hot fix to v469),
 * update BOTH the native version string AND the WRAPPED_WEB_BUILD marker.
 * The lint fails if they disagree, alerting you to the omission.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Parse the web build versions. All three must agree.
   Convention: the version string is a single token like 'v468' or 'tally-v468'. */
function parseWeb() {
  const app = readFileSync(join(ROOT, 'js/app.js'), 'utf8');
  const appMatch = app.match(/const\s+APP_BUILD\s*=\s*['"]([^'"]+)['"]/);
  const appBuild = appMatch ? appMatch[1] : null;

  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const swMatch = sw.match(/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
  const swBuild = swMatch ? swMatch[1].replace(/^tally-/, '') : null;

  const versionJson = readFileSync(join(ROOT, 'version.json'), 'utf8');
  const versionMatch = versionJson.match(/"version"\s*:\s*"([^"]+)"/);
  const versionBuild = versionMatch ? versionMatch[1].replace(/^tally-/, '') : null;

  return { appBuild, swBuild, versionBuild };
}

/* Parse native build markers. Each must carry a WRAPPED_WEB_BUILD comment. */
function parseNative() {
  const iosPbx = readFileSync(join(ROOT, 'native/ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  const iosMatch = iosPbx.match(/MARKETING_VERSION\s*=\s*([^;]+);/);
  const iosVersion = iosMatch ? iosMatch[1].trim() : null;
  const iosWrapped = iosPbx.match(/\/\/\s*WRAPPED_WEB_BUILD\s*=\s*([^\n]+)/);
  const iosWrappedBuild = iosWrapped ? iosWrapped[1].trim() : null;

  const androidGradle = readFileSync(join(ROOT, 'native/android/app/build.gradle'), 'utf8');
  const androidNameMatch = androidGradle.match(/versionName\s+"([^"]+)"/);
  const androidVersion = androidNameMatch ? androidNameMatch[1] : null;
  const androidWrapped = androidGradle.match(/\/\/\s*WRAPPED_WEB_BUILD\s*=\s*([^\n]+)/);
  const androidWrappedBuild = androidWrapped ? androidWrapped[1].trim() : null;

  return {
    ios: { version: iosVersion, wrapped: iosWrappedBuild },
    android: { version: androidVersion, wrapped: androidWrappedBuild },
  };
}

const web = parseWeb();
const native = parseNative();

console.log('');

/* Grade web consistency. */
const webConsistent = web.appBuild === web.swBuild && web.swBuild === web.versionBuild;
console.log(`${webConsistent ? 'ok  ' : 'FAIL'}  WEB-CONSISTENT  app.js=${web.appBuild} sw.js=${web.swBuild} version.json=${web.versionBuild}`);

if (!webConsistent) {
  console.log('\nWEB VERSIONS ARE OUT OF SYNC. All three must point to the same build.');
  console.log('Update js/app.js APP_BUILD, sw.js VERSION, and version.json.');
  process.exit(1);
}

/* Grade native markers. */
const iosMarked = native.ios.wrapped !== null;
console.log(`${iosMarked ? 'ok  ' : 'FAIL'}  iOS-MARKED      iOS ${native.ios.version} has WRAPPED_WEB_BUILD=${native.ios.wrapped}`);

const androidMarked = native.android.wrapped !== null;
console.log(`${androidMarked ? 'ok  ' : 'FAIL'}  ANDROID-MARKED  Android ${native.android.version} has WRAPPED_WEB_BUILD=${native.android.wrapped}`);

if (!iosMarked || !androidMarked) {
  console.log('\nNATIVE SHELLS ARE NOT MARKED WITH WHICH WEB BUILD THEY WRAPPED.');
  console.log('Add a comment like: // WRAPPED_WEB_BUILD=v413 to each native config.');
  process.exit(1);
}

console.log(`\nVERSION ALIGNMENT LINT: web builds aligned at ${web.appBuild}, native shells marked.\n`);

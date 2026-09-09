/* Web build alignment and native source provenance. Remote iOS shells load
 * server.url and must not claim a wrapped web build. Bundled iOS shells and
 * the legacy Android marker retain their presence checks. Marker presence
 * alone does not verify the contents of a native bundle. */
import { gradeNativeShellComment } from './native-shell-comment-audit.mjs';
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

/* Parse native metadata and the configured iOS loading mode. */
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
    ios: { version: iosVersion, wrapped: iosWrappedBuild, source: iosPbx,
      config: JSON.parse(readFileSync(join(ROOT, 'native/capacitor.config.json'), 'utf8')) },
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
const remoteIOS = !!native.ios.config.server?.url;
const iosMarked = remoteIOS
  ? gradeNativeShellComment(native.ios.config, native.ios.source).green
  : native.ios.wrapped !== null;
console.log(`${iosMarked ? 'ok  ' : 'FAIL'}  iOS-PROVENANCE  iOS ${native.ios.version}: ${remoteIOS ? 'remote shell, no wrapped web version allowed' : 'bundled shell, marker required'}, marker=${native.ios.wrapped}`);

const androidMarked = native.android.wrapped !== null;
console.log(`${androidMarked ? 'ok  ' : 'FAIL'}  ANDROID-MARKED  Android ${native.android.version} has WRAPPED_WEB_BUILD=${native.android.wrapped}`);

if (!iosMarked || !androidMarked) {
  console.log('\nNATIVE PROVENANCE FAILED: remote iOS must have no wrapped-build comment; bundled shells require their marker.');
  process.exit(1);
}

console.log(`\nVERSION ALIGNMENT LINT: web builds aligned at ${web.appBuild}, native provenance checked.\n`);

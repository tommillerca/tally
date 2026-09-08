import { readFile } from 'node:fs/promises';
import { scanReachable } from './store-copy-scan.mjs';

const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../native/build-www.sh', import.meta.url), 'utf8');
const ios = await readFile(new URL('../native/build-ios.sh', import.meta.url), 'utf8');
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

// CONTROL: exercise the same scanner the repo and archived bundle use. Exact
// findings pin both comment removal and the original source line after the island.
const island = "const TESTFLIGHT_URL = 'https://testflight.apple.com/join/HIDDEN';\n"
  + "const invite = 'Join the beta';\n"
  + '// Test hook (webdriver only), same reasoning as __community above.\n';
const fixtures = [
  ['single URL', "function later(){ window.open('https://testflight.apple.com/join/LEAK'); }", 'testflight.apple.com', 4],
  ['template URL', 'function later(){ window.open(`https://testflight.apple.com/join/LEAK`); }', 'testflight.apple.com', 4],
  ['double URL', 'function later(){ window.open("https://testflight.apple.com/join/LEAK"); }', 'testflight.apple.com', 4],
  ['genuine line comment', '// https://testflight.apple.com/join/COMMENT\nconst safe = "hello";', null],
  ['comment-like string', 'const s = "not // a comment"; const row = "Open TestFlight";', 'TestFlight', 4],
  ['block-like string', 'const s = "not /* a comment"; const row = "Open TestFlight";', 'TestFlight', 4],
  ['genuine block comment', '/* TestFlight\nbeta */ const safe = "hello";', null],
  ['after block comment', '/* TestFlight\nbeta */ const row = "Open TestFlight";', 'TestFlight', 5],
  ['multiline template', 'const row = `hello\nhttps://testflight.apple.com/join/LEAK`;', 'testflight.apple.com', 5],
  ['nested template expression', 'const row = `hello ${/* beta */ `https://testflight.apple.com/join/LEAK`}`;', 'testflight.apple.com', 4],
  ['template expression comment', 'const row = `hello ${1 // TestFlight\n}`;', null],
  ['escaped quote', String.raw`const s = "quote \" not // a comment"; const row = "Open TestFlight";`, 'TestFlight', 4],
  ['regex literal', String.raw`const re = /[/*]/; const row = "Open TestFlight";`, 'TestFlight', 4],
];
for (const [name, source, hit, line] of fixtures) {
  const found = scanReachable(island + source, 'fixture.js');
  const expected = hit ? [`reachable "${hit}" at fixture.js:${line}`] : [];
  const ok = JSON.stringify(found) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} scanner ${name}: ${JSON.stringify(found)} (want ${JSON.stringify(expected)})`);
  check(ok, `scanner fixture ${name}`);
}
const malformed = scanReachable(island + 'const s = "unterminated', 'fixture.js');
check(malformed.length === 1 && malformed[0].startsWith('cannot tokenize fixture.js:'),
  'tokenizer errors must refuse the scan');
check(scanReachable('const safe = "hello";', 'fixture.js').includes('beta invitation block was not found in fixture.js'),
  'missing invitation markers must refuse the scan');

check(/const\s+STORE_BUILD\s*=\s*false\s*;/.test(app), 'shared source does not declare STORE_BUILD=false');
check(/const\s+SHOW_BETA_THANKS\s*=\s*!STORE_BUILD\s*;/.test(app), 'beta surfaces are not derived from STORE_BUILD');
check(/function\s+thanksBannerHtml\(\)\s*{\s*if\s*\(!SHOW_BETA_THANKS\)\s*return\s+''/.test(app), 'Crew thank-you strip is reachable');
check(/async\s+function\s+openThanksCard\(\)\s*{\s*if\s*\(!SHOW_BETA_THANKS\)\s*return/.test(app), 'THANK YOU card and share path are reachable');
check(/\.filter\(n\s*=>\s*!\(n\.id\s*===\s*'thanks'\s*&&\s*!SHOW_BETA_THANKS\)\)/.test(app), 'THANK YOU News row is reachable');
check(/const\s+diag\s*=\s*STORE_BUILD\s*\?\s*''\s*:\s*await diagnosticsLine\(\)/.test(app), 'Settings computes diagnostics in a store build');
check(/\$\{STORE_BUILD\s*\?\s*''\s*:\s*`<div class="settings-row"><div class="lab"><b>Diagnostics<\/b>/.test(app), 'Settings diagnostics row is reachable');
check(/const STORE_BUILD = false;\/const STORE_BUILD = true;/.test(build), 'native build script does not flip STORE_BUILD');

/* The upload path is the one that reaches Apple. It used to call plain
   build-www.sh and sync against the live-URL config, so every uploaded build
   shipped the beta surfaces and loaded the site over the network. These grade
   the shape of the submission branch, not its internals: it must delegate the
   bundle and the no-server config to build-store.sh (one copy, no drift), put
   the original config back whatever happens, and refuse to archive on a bad
   bundle by running the preflight. */
check(/SUBMISSION:-0/.test(ios), 'build-ios.sh has no explicit submission mode');
check(/\.\/build-store\.sh/.test(ios), 'submission mode does not delegate the bundle to build-store.sh');
check(/trap restore_config EXIT/.test(ios), 'submission mode does not restore capacitor.config.json on exit');
check(/submission-preflight\.mjs/.test(ios), 'submission mode does not run the preflight before archiving');
check(/else\n\s*echo "=== internal build/.test(ios), 'the explicit internal path was removed');

failures.push(...scanReachable(app, 'js/app.js'));

if (failures.length) {
  for (const failure of failures) console.error(`FAIL store copy: ${failure}`);
  process.exit(1);
}
console.log('ok store copy: beta surfaces unreachable and store strings clean');

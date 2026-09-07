import { readFile } from 'node:fs/promises';
import { scanReachable } from './store-copy-scan.mjs';

const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../native/build-www.sh', import.meta.url), 'utf8');
const ios = await readFile(new URL('../native/build-ios.sh', import.meta.url), 'utf8');
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

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
check(/else\n\s*echo "=== internal build/.test(ios), 'the default (non-submission) path was removed');

failures.push(...scanReachable(app, 'js/app.js'));

if (failures.length) {
  for (const failure of failures) console.error(`FAIL store copy: ${failure}`);
  process.exit(1);
}
console.log('ok store copy: beta surfaces unreachable and store strings clean');

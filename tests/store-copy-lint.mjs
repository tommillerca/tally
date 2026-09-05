import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../native/build-www.sh', import.meta.url), 'utf8');
const forbidden = /testflight\.apple\.com|testflight|\bbeta\b/i;
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

/* The invitation implementation stays in source for internal builds. Its two
   entry points are guarded above, so remove that unreachable island before
   scanning every remaining player-facing string. Leaving one store surface
   ungated makes its literal survive this scan and names its source line. */
const betaStart = app.indexOf('const TESTFLIGHT_URL =');
const betaEnd = app.indexOf('// Test hook (webdriver only), same reasoning as __community above.', betaStart);
check(betaStart >= 0 && betaEnd > betaStart, 'beta invitation block was not found');
const reachable = betaStart >= 0 && betaEnd > betaStart
  ? app.slice(0, betaStart) + '\n'.repeat(app.slice(betaStart, betaEnd).split('\n').length - 1) + app.slice(betaEnd)
  : app;
let inComment = false;
for (const [n, raw] of reachable.split('\n').entries()) {
  let line = raw, code = '';
  while (line) {
    if (inComment) {
      const end = line.indexOf('*/');
      if (end < 0) { line = ''; continue; }
      inComment = false;
      line = line.slice(end + 2);
    }
    const block = line.indexOf('/*');
    const slash = line.indexOf('//');
    if (slash >= 0 && (block < 0 || slash < block)) { code += line.slice(0, slash); break; }
    if (block < 0) { code += line; break; }
    code += line.slice(0, block);
    inComment = true;
    line = line.slice(block + 2);
  }
  const hit = code.match(forbidden);
  if (hit) failures.push(`reachable "${hit[0]}" at js/app.js:${n + 1}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL store copy: ${failure}`);
  process.exit(1);
}
console.log('ok store copy: beta surfaces unreachable and store strings clean');

/* THE BUILD TAG ON A TELEMETRY BATCH MUST BE A BUILD THAT EXISTS.
 *
 * appV is envelope-level in js/analytics.js: one value is attached to the whole
 * POSTed batch (analytics.js:73, :92, :115), and it is whatever the caller
 * handed initAnalytics(). So a single wrong call site does not mislabel one
 * event, it mislabels every event that session.
 *
 * WHY THIS EXISTS. js/app.js had two call sites. Boot passed APP_BUILD, with a
 * comment spelling out the rule: tag events with the real running build, not
 * the frozen social-protocol version. The onboarding path passed APP_SOCIAL_V,
 * which was 'v68' while the app was on v385. v68 is not a build anyone can ship
 * or slice by. Onboarding is the FIRST session, so every install in the app's
 * life reported its day-0 batch under a version that does not exist, which is
 * the exact row any retention question needs.
 *
 * Static on purpose. This is a property of the source, and a browser run would
 * only see whichever path that particular boot happened to take.
 *
 * Exit 1 = findings. Exit 2 = this audit could not run and judged nothing.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const setup = (n, p, d = '') => {
  console.log(`${p ? 'PASS' : 'SETUP'}  ${n}${d ? '  ' + d : ''}`);
  if (!p) { console.log('\n  This audit CHECKED NOTHING.'); process.exit(2); }
};

const src = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');

/* The two constants must both exist AND differ, or this audit is asserting
   nothing: if they were the same string, every call site would pass either way
   and the check could not fail. */
const build = src.match(/const APP_BUILD = '([^']+)'/)?.[1];
const social = src.match(/const APP_SOCIAL_V = '([^']+)'/)?.[1];
setup('APP_BUILD and APP_SOCIAL_V are both declared', !!build && !!social,
  `APP_BUILD=${build} APP_SOCIAL_V=${social}`);
setup('the two differ, so passing the wrong one is detectable', build !== social,
  `${build} vs ${social}`);

/* An empty sample set is a failure, not a pass: no call sites means the import
   was renamed or the function is gone, and silence would read as health. */
const calls = [...src.matchAll(/initAnalytics\(\s*([A-Za-z_$][\w$]*)\s*\)/g)]
  .map(m => ({ arg: m[1], line: src.slice(0, m.index).split('\n').length }));
setup('there is at least one initAnalytics call site to judge', calls.length > 0,
  `${calls.length} found`);

const wrong = calls.filter(c => c.arg !== 'APP_BUILD');
ok('every initAnalytics call tags the batch with the real running build',
  wrong.length === 0,
  wrong.length
    ? `${wrong.length} of ${calls.length} pass the wrong constant: ` +
      wrong.map(c => `js/app.js:${c.line} initAnalytics(${c.arg})`).join(', ')
    : `${calls.length} call site(s), all APP_BUILD: ` + calls.map(c => `js/app.js:${c.line}`).join(', '));

console.log(fails.length ? `\n${fails.length} FAILED` : '\nanalytics build tag holds');
process.exit(fails.length ? 1 : 0);

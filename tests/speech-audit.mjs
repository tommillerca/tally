/* Sweeping every salt is the only honest way to check the pools now that the
 * chatter is picked from a UNION: sampling the live screen would just tell me
 * which line I happened to get. For each condition: with it ON the line must be
 * reachable, and with it OFF it must be unreachable. The second half is the part
 * that fails if a bucket is wired to the wrong variable. */
import { boot, sleep } from './godmode.js';
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

const BASE = { entries: [{}], tot: { kcal: 1200, p: 40 }, targets: { kcal: 2400, p: 150 }, crates: [], streak: 14, isToday: true };
const all = async ctx => page.evaluate(({ ctx, n }) => {
  const out = new Set();
  for (let s = 0; s < n; s++) out.add(window.__speech(ctx, s));
  return [...out];
}, { ctx, n: 400 });

const CASES = [
  ['steps', { steps: 15400 }, /ankles filed|town owed|legs day|lot of ground|spire heard/],
  ['spires', { spires: 2 }, /spires under our name|tribute is not going|come for our tower/],
  ['fights', { fightsReady: 4 }, /fights in the tank|full of vigor|needs hitting/],
  ['dish ready', { dishReady: true }, /cauldron|done in the pot|Kitchen is dinging|no throat|science project/],
  ['crates', { crates: [{}] }, /crate|Loot|rattling|rectangle/i],
  ['empty log', { entries: [] }, /Feed me a log|Bones do not fuel|Scan something|stomach would growl|Blank slate|Zero logs/],
];
const off = await all({ ...BASE, steps: 0, spires: 0, fightsReady: 0, dishReady: false });
console.log(`baseline reachable lines: ${off.length}`);
check('a streaked player still hears more than the streak lines', off.length > 20, `${off.length} lines`);
check('no line is blank', off.every(l => l && l.length > 4));

for (const [name, patch, re] of CASES) {
  const on = await all({ ...BASE, ...patch });
  const hitsOn = on.filter(l => re.test(l)).length;
  const leaks = off.filter(l => re.test(l)).length;
  check(`${name}: reachable when it applies`, hitsOn > 0, `${hitsOn} lines`);
  check(`${name}: silent when it does not`, leaks === 0, leaks ? `LEAKED: ${off.filter(l => re.test(l))[0]}` : '');
}
// the whole point of the change: a single day must not lock one line in
const spread = await page.evaluate(ctx => {
  const seen = new Set();
  for (let s = 0; s < 30; s++) seen.add(window.__speech(ctx, s * 7919));
  return seen.size;
}, { ...BASE, steps: 15400, spires: 1, fightsReady: 4 });
check('30 opens give many different lines', spread >= 10, `${spread} distinct`);

await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nSPEECH POOLS VERIFIED');
process.exit(bad ? 1 : 0);

/* THE FIRST SESSION IS THE ONE PATH NOBODY TESTS.
 *
 * Tom, 2026-08-21, watching a real device boot: "Fix the pop ups that's a night
 * mare." Measured on a booted iPhone 17 Pro before the fix, in order: the
 * recovery-code prompt, the Puffer Pack drop, the Live Wire intro, the daily
 * wheel. Four sheets before Today was reachable.
 *
 * WHY IT WAS INVISIBLE, and this is the part worth keeping. Every one of these
 * suppresses itself under navigator.webdriver. Chromium via puppeteer IS
 * webdriver, so no audit in this repo has ever rendered one. The first session
 * had no test on it at all, which is how it accumulated: each popup was
 * reasonable on the day it was added and nothing ever showed them together.
 *
 * WHAT IS ASSERTED, and which direction is failure:
 *   BUDGET    at most ONE boot sheet may open per app open. Failure is UP. A
 *             second sheet is the whole defect: it tells the player that
 *             dismissing did not end it.
 *   CLAIMED   every boot sheet actually goes through claimBootSheet(). A new one
 *             added without the claim is the regression this file exists to
 *             catch, and it is invisible to BUDGET whenever the new sheet
 *             happens to lose the race.
 *   NOCONSUME a sheet that stands down must NOT have been marked seen, or
 *             "one per open" silently becomes "you get one and lose the rest".
 *   REPEATS   no boot sheet may re-show more than twice. A player who ignores
 *             one should not meet it on their next nine opens.
 *   CONTROL   the sheets can still open at all. Every row above passes on an app
 *             that shows NOTHING, which is the shape that reads as fixed and is
 *             not (anti-regression rule 3).
 *
 * PURE: this greps source. The rendering path is not driven here on purpose,
 * because the defect is structural (a missing claim), and a browser row would
 * only ever see whichever sheet won that particular race.
 *
 * PROVEN RED 2026-08-21 in a throwaway copy:
 *   drop the claim from the drop popup      -> CLAIMED, 1 unclaimed site
 *   put the seen write before the claim     -> NOCONSUME, 1 site
 *   restore `seen >= 10` on the teaser      -> REPEATS, teaser 10
 *   delete claimBootSheet entirely          -> CONTROL + CLAIMED (9 sites)
 *
 * Run: node tests/first-session-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
let fails = 0;
const ok = (n, pass, d = '') => { if (!pass) fails++; console.log(`${pass ? 'ok  ' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

/* The boot queue, read out of the source rather than restated, so a new
   maybeShow* added to boot() is picked up here without editing this file. */
const bootBlock = (src.match(/maybeShowRenameNotice\(\);[\s\S]{0,900}/) || [''])[0];
const queued = [...new Set([...bootBlock.matchAll(/\bmaybeShow(\w+)\(\)/g)].map(m => m[1]))]
  .filter(n => n !== 'DailyWheel');           // the wheel is the reward, not an interruption
ok('CONTROL the boot queue was found and is not empty (an empty sample is a failure)',
  queued.length >= 5, `${queued.length} boot sheets: ${queued.join(', ')}`);

ok('CONTROL claimBootSheet exists and is a real one-shot',
  /function claimBootSheet\(\)\s*\{[\s\S]{0,200}bootSheetClaimed = true/.test(src),
  /function claimBootSheet/.test(src) ? 'defined' : 'NOT DEFINED');

/* Every function that WRITES a seen counter and then opens something is a boot
   sheet, whatever it is called. That is the shape, so that is what is graded. */
const fnRe = /(?:async )?function (maybeShow\w+)\(\)[\s\S]*?\n\}/g;
const claimants = [], unclaimed = [], consumesFirst = [];
for (const m of src.matchAll(fnRe)) {
  const [body, name] = [m[0], m[1]];
  if (name === 'maybeShowDailyWheel') continue;
  if (!/kvSet\(|openWhatsNew\(\)/.test(body)) continue;
  if (/maybeShowGardenPopup/.test(name)) continue;      // retired, not in the boot queue
  const hasClaim = /claimBootSheet\(\)/.test(body);
  (hasClaim ? claimants : unclaimed).push(name);
  if (hasClaim) {
    /* the claim must come BEFORE the counter write, or a loser is marked seen */
    const ci = body.indexOf('claimBootSheet()');
    const wi = body.search(/await kvSet\((?:DROP|TEASER|SPIRE|BOSS|MAGE|RACE|THANKS|COMMUNITY)/);
    if (wi !== -1 && wi < ci) consumesFirst.push(name);
  }
}
ok('CLAIMED every boot sheet asks claimBootSheet() before it opens',
  unclaimed.length === 0,
  unclaimed.length ? `unclaimed: ${unclaimed.join(', ')}` : `${claimants.length} claimants`);
ok('NOCONSUME a sheet that stands down is not marked seen (claim precedes the write)',
  consumesFirst.length === 0,
  consumesFirst.length ? `writes before claiming: ${consumesFirst.join(', ')}` : 'all claim first');

/* BUDGET, structurally: one shared flag, set once, never reset outside tests. */
/* the DECLARATION is `let bootSheetClaimed = false`, which is not a reset. Only
   an assignment that is not a declaration can re-open the budget mid-session. */
const resets = [...src.matchAll(/(?<!let )bootSheetClaimed = false/g)].length;
ok('BUDGET the claim is never cleared during a session, so at most one sheet opens',
  resets === 1 && /__resetBootSheet/.test(src),
  `${resets} reset(s); the only one is the webdriver-only __resetBootSheet test hook`);

const repeats = [...src.matchAll(/if \(seen >= (\d+)\) return;/g)].map(m => Number(m[1]));
const boot = repeats.filter((_, i) => i !== repeats.findIndex(v => v === 5));  // garden is retired
ok('REPEATS no live boot sheet re-shows more than twice',
  boot.every(n => n <= 2) && /COMMUNITY_MAX_SHOWS = [12];/.test(src),
  `seen ceilings ${repeats.join(', ')} (the 5 is the retired garden popup)`);

console.log(`\n${fails ? `${fails} FAILED` : 'all green'}, 6 checks`);
process.exit(fails ? 1 : 0);

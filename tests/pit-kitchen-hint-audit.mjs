/* R38-22: THE PIT NEVER MENTIONED DISHES, BUFFS OR THE KITCHEN.
 *
 * HANDOFFr3820260906.md measured cooking as the strongest lever on fight win
 * rate the game has (tests/fight-sim.mjs, real fight engine, 3,000 seeds per
 * cell): +37.7pp Bone Broth, +50.3pp Hearty Hash, +59.9pp Necromancer's Feast.
 * renderPit (js/app.js) never named a dish, a buff, or the Kitchen anywhere on
 * the sheet where a fight is actually offered, so the mechanic that matters
 * most was invisible at the only point a player is about to spend a fight.
 *
 * ONE line, no new panel, no numbers the game does not already show:
 *   BUFF   a live combat dish buff is active: name it and its effect in plain
 *          words (js/cooking.js foodBuffLabel, the same label the Kitchen
 *          sheet itself uses for "Active dishes").
 *   NUDGE  no buff active, but ingredients or a cooked dish are sitting in the
 *          Kitchen: point at it.
 *   QUIET  neither: say nothing. An empty Kitchen is not a nag.
 *
 * Seeds cooking state directly through js/db.js (kvSet), the same technique
 * tests/first-session-lifecycle-audit.mjs uses for kv, because tests/godmode.js
 * seed() only knows level/coins/dust/xp rows and this is cook state. Reads
 * back through openPit(), the real render, never renderPit() called directly.
 *
 * PROVE-RED: comment out the two `${kitchenLine}` template slots this touches
 * in renderPit (or blank kitchenLine's assignment) and BUFF and NUDGE both go
 * red; QUIET stays green either way, which is the point (it grades an absence
 * correctly regardless of whether the line exists at all).
 *
 * Usage: node tests/pit-kitchen-hint-audit.mjs [baseUrl]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, openPit, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

const { browser, page, errors } = await boot(argUrl);

/* NO QUERY STRING on this import, unlike most seed helpers in this repo: those
   boot a FRESH install (the default 'tally' db either way), but this audit
   runs through boot()'s ?demo path, which points the app's own js/db.js at
   'tally-demo' via useDbName() -- a module-scope variable. Importing db.js
   under a different URL (?q=1) resolves to a SEPARATE module instance whose
   dbName is still the default 'tally', so a seed through it silently writes
   the wrong database and every readback through the app's real code sees
   nothing. Measured directly: kvGet from the query-busted instance echoed the
   seed back; js/cooking.js's activeFoodBuffs() (the app's own, real instance)
   read []. Importing the SAME url the app already loaded shares the module
   and its dbName. */
const seedCook = async (foodbuffs, ingredients, pantry) => page.evaluate(async (fb, ing, p) => {
  const { kvSet } = await import('/js/db.js');
  await kvSet('foodbuffs', fb);
  await kvSet('ingredients', ing);
  await kvSet('pantry', p);
}, foodbuffs, ingredients, pantry);

const pitText = async () => { await openPit(page); return page.evaluate(() => document.querySelector('#pitBody')?.textContent || ''); };

try {
  // ---- BUFF: a live combat dish buff is named on the Pit sheet ----
  await seedCook([{ recipe: 'bone-broth', name: 'Bone Broth', icon: '🍲', kind: 'combat', regenPct: 0.06, fights: 2, fightsLeft: 2 }], {}, []);
  const buffText = await pitText();
  ok('BUFF the Pit names the active dish and its plain-words effect',
    /Bone Broth/.test(buffText) && /heal/i.test(buffText) && /fight/i.test(buffText),
    buffText.match(/[^.]*Bone Broth[^.]*\./)?.[0]?.trim() || '(not found)');

  // ---- NUDGE: no buff, but ingredients are sitting in the Kitchen ----
  await seedCook([], { marrow: 2 }, []);
  const nudgeText = await pitText();
  ok('NUDGE no buff active, ingredients owned: the Pit points at the Kitchen',
    /kitchen/i.test(nudgeText) && !/Bone Broth/.test(nudgeText),
    nudgeText.match(/[^.]*[Kk]itchen[^.]*\./)?.[0]?.trim() || '(not found)');

  // ---- NUDGE (dish variant): no ingredients, but a cooked dish is banked ----
  await seedCook([], {}, [{ recipeId: 'bone-broth', name: 'Bone Broth', icon: '🍲', cookedAt: Date.now() }]);
  const dishNudgeText = await pitText();
  ok('NUDGE a cooked dish with no buff active also points at the Kitchen',
    /kitchen/i.test(dishNudgeText), dishNudgeText.match(/[^.]*[Kk]itchen[^.]*\./)?.[0]?.trim() || '(not found)');

  // ---- QUIET: nothing owned, nothing active, nothing to say ----
  await seedCook([], {}, []);
  const quietText = await pitText();
  ok('QUIET nothing to cook and no buff active: no Kitchen line at all', !/kitchen/i.test(quietText));

  ok('NOERR no page error', errors.length === 0, errors.join(' | ').slice(0, 300));
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.p).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(failed ? 'PIT KITCHEN HINT AUDIT FAILED' : 'PIT KITCHEN HINT AUDIT VERIFIED');
process.exit(failed ? 1 : 0);

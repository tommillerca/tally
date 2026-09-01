/* ONE LEVEL-UP, ONE CEREMONY.
 *
 * WHY THIS EXISTS. Round-9 adversarial pass, 2026-09-01. Logging a food that
 * crossed a level played the level-up moment TWICE, and the second one read
 * "+0". Measured on main at 3d4b208c, driving the real Quick add sheet with the
 * player 5 XP under level 9: two .lu-take sheets, both at opacity 1 and both
 * 430x932, the first at +427ms showing "+65" and the second at +514ms showing
 * "+0". The second opens later, so it stacks ON TOP: the sheet the player reads
 * and has to dismiss first is the one that says their level was worth nothing.
 *
 * The payout was never wrong. grantLevelRewards claims each level through
 * addIfAbsent('levelpaid-<L>'), so the coins, the crate and the ledger row all
 * happened exactly once; the second call correctly returned all zeroes and the
 * sheet printed them. Two PRODUCERS of one announcement, not two payouts:
 * awardOnce dispatches `bh-levelup` the moment a sub-award crosses, AND
 * onFoodLogged used to recompute the same crossing and hand it back for the log
 * handler to queue a second time.
 *
 * WHAT MAKES THIS A CHECK AND NOT A FILE:
 *
 *   1. IT COUNTS CEREMONIES, NOT CALLS. Nothing here reads a flag, spies on
 *      queueCelebration or counts `bh-levelup` events. It polls the live DOM and
 *      tags every .lu-take it has ever seen, so a second sheet counts whether it
 *      stacks on the first or opens after it has gone. A call-count assertion
 *      would have passed the shipped bug outright: both calls were legitimate.
 *   2. IT READS THE NUMBER ON THE SHEET. "+0" was the visible defect, so the
 *      reward pill's coin figure is asserted, off the rendered element. A count
 *      of one, on a sheet reading zero, is still the bug.
 *   3. TWO SOURCES, BOTH GRADED. The fix moved ownership of the food path onto
 *      the same `bh-levelup` dispatch every other XP source already used, so the
 *      audit that only drove food would go green on a fix that silenced steps
 *      and quests too. FOOD drives the real Quick add sheet; OTHER crosses the
 *      same boundary with a direct award() of a non-food type, which is the
 *      shape steps, quests, Pit wins and the road all take.
 *   4. THE COUNTER IS PROVEN ABLE TO COUNT TWO. A guard whose whole output is
 *      "I saw one" passes on a page where it can only ever see one. CONTROL
 *      plants a second .lu-take beside a real one and requires the sampler to
 *      report 2, and both sample sets have to be non-empty.
 *
 * Proven red on a cp -R copy of 3d4b208c with only this file added: FOOD ONCE
 * fails with 2 ceremonies and FOOD REWARDS fails on "+0", while OTHER and
 * CONTROL stay green there, which is the point: the double was specific to the
 * food path and a fix must not buy it by breaking the others.
 *
 * Usage: node tests/ceremony-once-audit.mjs        (URL=... for live)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, seed, serveTree, dismissOverlays } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srvHandle = null;
let base = process.env.URL;
if (!base) {
  srvHandle = await serveTree(ROOT);
  base = srvHandle.url;
}
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const { browser, page } = await boot(base);
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

/* SAMPLING WINDOW. maybeCelebrate waits 380ms before it opens anything, and the
   two sheets this file exists to catch landed at +427ms and +514ms (measured
   2026-09-01). 40ms is a third of the 87ms that separated them, and 2400ms is
   more than four times the later one, so a ceremony that opens late enough to
   look like a separate one is still inside the window. */
const POLL_MS = 40;
const WINDOW_MS = 2400;

/* Put the player 5 XP under the next level. Five, so the FIRST sub-award
   onFoodLogged makes (`log-<id>`, worth 10) is the one that crosses: that is
   the exact shape the bug was reported in, and it leaves the crossing well
   inside one food log rather than depending on which optional award fires. */
async function atLevelBoundary() {
  const before = await page.evaluate(async () => {
    const g = await import('./js/game.js');
    const tot = await g.totalXp();
    return { tot, nextAt: g.levelFor(tot).nextAt };
  });
  await seed(page, { xp: [{ key: `cere-topup-${Date.now()}`, type: 'quest', xp: before.nextAt - before.tot - 5, label: 'ceremony boundary' }] });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  return page.evaluate(async () => {
    const g = await import('./js/game.js');
    /* The author's seam, the same idiom levelup-audit uses: the moment is gated
       on reducedMotion || navigator.webdriver and cannot play without it. */
    window.__motionForce = true;
    const tot = await g.totalXp();
    return { tot, level: g.levelFor(tot).level, nextAt: g.levelFor(tot).nextAt };
  });
}

/* TAGGED, NOT COUNTED. Every .lu-take gets a one-time serial the first time it
   is seen, so `opened` is how many ceremonies existed across the whole window
   and `maxAtOnce` is how many were on screen together. A second sheet that
   replaces the first rather than stacking on it still shows up in `opened`. */
const sample = async ms => {
  const frames = [];
  await page.evaluate(() => { window.__ceremonySeen = 0; });
  for (let t = 0; t < ms; t += POLL_MS) {
    await sleep(POLL_MS);
    frames.push(await page.evaluate(() => {
      const live = [...document.querySelectorAll('.lu-take')].filter(el => {
        const r = el.getBoundingClientRect();
        return +getComputedStyle(el).opacity === 1 && r.width > 0 && r.height > 0;
      });
      for (const el of live) if (!el.dataset.ceremonySeen) el.dataset.ceremonySeen = String(++window.__ceremonySeen);
      return {
        n: live.length,
        opened: window.__ceremonySeen,
        rewards: live.map(el => (el.querySelector('.lu-rewards')?.textContent || '').replace(/\s+/g, ' ').trim()),
      };
    }));
  }
  const coins = [...new Set(frames.flatMap(f => f.rewards))].filter(Boolean)
    .map(t => { const m = t.match(/\+(\d+)/); return m ? +m[1] : null; });
  return {
    frames: frames.length,
    withSheet: frames.filter(f => f.n > 0).length,
    maxAtOnce: Math.max(0, ...frames.map(f => f.n)),
    opened: Math.max(0, ...frames.map(f => f.opened)),
    coins,
  };
};

const clearSheets = async () => {
  for (let i = 0; i < 4; i++) {
    if (!await page.evaluate(() => !!document.querySelector('#sheets > div'))) break;
    await page.evaluate(() => history.back());
    await sleep(400);
  }
};

/* ---- FOOD: the real Quick add sheet, tapped ------------------------------- */
const foodAt = await atLevelBoundary();
await clearSheets();
await dismissOverlays(page);
const drove = await page.evaluate(() => {
  const add = document.querySelector('.meal-add');
  if (!add) return 'no .meal-add on Today';
  add.click();
  return null;
});
await sleep(900);
const quick = await page.evaluate(() => {
  const q = document.querySelector('#actQuick');
  if (!q) return 'no #actQuick in the food sheet';
  q.click();
  return null;
});
await sleep(900);
const filled = await page.evaluate(() => {
  const i = document.querySelector('#qaKcal'), b = document.querySelector('#qaAdd');
  if (!i || !b) return 'no Quick add form';
  i.value = '200';
  i.dispatchEvent(new Event('input', { bubbles: true }));
  b.click();
  return null;
});
const food = (drove || quick || filled) ? null : await sample(WINDOW_MS);

ok('FOOD the real Quick add sheet could be driven to a level crossing',
  !!food, drove || quick || filled || `seeded to ${foodAt.tot} XP, ${foodAt.nextAt - foodAt.tot} under level ${foodAt.level + 1}`);
if (food) {
  ok('FOOD SAMPLE a ceremony was actually on screen (an empty sample set is a failure, never a pass)',
    food.frames > 0 && food.withSheet > 0, JSON.stringify(food));
  ok('FOOD ONCE logging a food that crosses a level plays the moment EXACTLY once',
    food.opened === 1 && food.maxAtOnce === 1, `opened ${food.opened}, at most ${food.maxAtOnce} on screen at once`);
  ok('FOOD REWARDS the sheet the player reads shows the coins they were actually paid, never "+0"',
    food.coins.length > 0 && food.coins.every(c => c > 0), `reward pills: ${JSON.stringify(food.coins)}`);
}

/* ---- CONTROL: the counter can see two ------------------------------------- */
const control = await page.evaluate(() => {
  const count = () => [...document.querySelectorAll('.lu-take')].filter(el => {
    const r = el.getBoundingClientRect();
    return +getComputedStyle(el).opacity === 1 && r.width > 0 && r.height > 0;
  }).length;
  const real = document.querySelector('.lu-take');
  if (!real) return null;
  const before = count();
  /* A DELTA, not an absolute. An absolute "counts 2" is itself a claim about how
     many the app opened, so it fails on a tree that has the bug and reads as a
     broken instrument instead of a broken app. What the sampler has to prove is
     that it SEES an extra stacked sheet, whatever it started from. */
  const twin = real.cloneNode(true);
  twin.removeAttribute('data-ceremony-seen');
  twin.id = 'ceremonyControlTwin';
  real.parentElement.appendChild(twin);
  const after = count();
  twin.remove();
  return { before, after };
});
ok('CONTROL a second stacked sheet is SEEN, so "exactly one" is a measurement and not a blind spot',
  !!control && control.before > 0 && control.after === control.before + 1,
  control === null ? 'no .lu-take was on screen to twin' : `${control.before} -> ${control.after} with a twin planted`);

/* ---- OTHER: the same crossing from a non-food source ---------------------- */
await clearSheets();
const otherAt = await atLevelBoundary();
await clearSheets();
await dismissOverlays(page);
const fired = await page.evaluate(async () => {
  const g = await import('./js/game.js');
  /* A DIRECT award(), which is the shape steps, quests, Pit wins and the road
     all take. 10 XP over a 5 XP gap, so it crosses exactly one level. */
  await g.award(`cere-steps-${Date.now()}`, 'steps', 10, 'Steps', undefined);
  return true;
});
const other = fired ? await sample(WINDOW_MS) : null;
ok('OTHER a non-food XP source could be driven across the same boundary',
  !!other, other ? `seeded to ${otherAt.tot} XP, ${otherAt.nextAt - otherAt.tot} under level ${otherAt.level + 1}` : 'award() never ran');
if (other) {
  ok('OTHER SAMPLE a ceremony was actually on screen (an empty sample set is a failure, never a pass)',
    other.frames > 0 && other.withSheet > 0, JSON.stringify(other));
  ok('OTHER ONCE a direct award that crosses a level still plays the moment EXACTLY once',
    other.opened === 1 && other.maxAtOnce === 1, `opened ${other.opened}, at most ${other.maxAtOnce} on screen at once`);
  ok('OTHER REWARDS it shows the coins that source was paid, never "+0"',
    other.coins.length > 0 && other.coins.every(c => c > 0), `reward pills: ${JSON.stringify(other.coins)}`);
}

await browser.close();
if (srvHandle) srvHandle.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
for (const f of failed) console.log(`FAILED: ${f.name}`);
process.exit(failed.length ? 1 : 0);

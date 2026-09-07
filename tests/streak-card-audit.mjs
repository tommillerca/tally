/* A LATER MILESTONE IS NEVER A THINNER SCREEN THAN AN EARLIER ONE.
 *
 * THE BUG (R41-21). Measured 2026-09-07 at 393x852, on the shipped card:
 *   day 7   3 content blocks: "🔥 7 days" / "Streak milestone · +100 XP" /
 *           the "On a roll" badge.
 *   day 14  2 content blocks: "🔥 14 days" / "Streak milestone · +100 XP".
 * Both are full-screen takeovers, so the OUTER rect is identical at 393x852
 * (0,0 393x852, body 16,28.8 361x746.9) and the difference is entirely content:
 * with the milestone number stripped, day 14's card said nothing day 7's did
 * not. The cause is BADGES (js/game.js): streak-3, streak-7 and streak-30 exist
 * and there is no badge at 14, so the longer streak got the emptier card.
 *
 * THE FIX is copy and counts, on EVERY milestone rather than bolted onto 14
 * (a card keyed to one number breaks again at 50): a per-milestone line
 * (STREAK_LINES) and a row of chips carrying counts the app already holds.
 * A streak-14 badge would also have squared the shape and was NOT taken: a
 * badge pays +25 XP and lands in the badge grid, which is an economy change.
 * The sub-line also names the golden Bone Crate streakAwards() has always
 * granted (js/game.js, grantCrate('golden', 'streak-' + n)) and no card said.
 *
 * ROWS
 *   CONTROL  both cards really rendered through the shipped openCelebration,
 *            and the asymmetry this file exists for is still real: day 7 has a
 *            badge block, day 14 has none. If a streak-14 badge is ever added
 *            this row goes red and this audit should be re-read, not deleted.
 *   BLOCKS   day 14 carries at least three non-empty content blocks. Shipped: 2.
 *   SUBSET   with digits stripped (so "14 days" and "7 days" are the same
 *            sentence), day 14's blocks are NOT a subset of day 7's: the later
 *            card says something the earlier one does not. Digits MUST be
 *            stripped or this row passes on the bug, because "🔥 14 days" is
 *            trivially absent from the day-7 card.
 *   TRUE     every number in the stats row equals the app's own count, read
 *            back from ownedCosmeticIds / petInstances / earnedBadgeIds in the
 *            same page. Tom's ruling is no fabricated numbers, and a card full
 *            of plausible figures is exactly how that rule gets broken.
 *
 * THE CARD HERE IS THE REAL ONE. window.__celebrate is a webdriver-only seam
 * onto the module-scoped openCelebration (same pattern as __toast, __packReveal,
 * __spireSheet): a streak milestone is otherwise reachable only by logging on N
 * real consecutive days, and a hand-rolled copy of the markup grades nothing.
 * The badge payload is taken from the shipped BADGES table, filtered exactly as
 * onFoodLogged's badge sweep would at a 7-day streak.
 *
 * PROVEN RED, 2026-09-07, against a copy of the parent commit's js/app.js and
 * app.css: BLOCKS FAIL (2 blocks), SUBSET FAIL (day 14 ⊆ day 7), TRUE FAIL (no
 * stats row at all), CONTROL green.
 *
 * Run: node tests/streak-card-audit.mjs [url]
 */
import { boot, serveTree, sleep, setWidth, dismissOverlays } from './godmode.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let fails = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) fails++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

let srv = null;
let target = process.argv[2] || process.env.URL;
if (!target) {
  srv = await serveTree(ROOT);
  target = srv.url;
  console.log(`no URL given: serving this tree at ${target} rather than grading production`);
}

const { browser, page } = await boot(target);
await setWidth(page, 393, 852);
await sleep(400);
await dismissOverlays(page);

const SHOTS = process.env.SHOTS || null;
const card = async n => {
  const m = await page.evaluate(async n2 => {
    const g = await import('./js/game.js');
    /* what onFoodLogged's badge sweep would hand openCelebration at this
       streak: the streak badge whose threshold this milestone crosses, if any */
    const badges = g.BADGES.filter(b => b.id === `streak-${n2}`);
    window.__celebrate({ streakMilestone: n2, newBadges: badges });
    await new Promise(r => setTimeout(r, 900));
    const take = document.querySelector('.reveal-take');
    if (!take) return { err: 'no .reveal-take' };
    const blocks = [...take.querySelectorAll('.cele-big, .cele-sub, .cele-line, .cele-stats, .cele-badge, .cele-note')]
      .map(e => ({ cls: e.className, text: e.innerText.replace(/\s+/g, ' ').trim() }))
      .filter(b => b.text.length > 0);
    const b = take.getBoundingClientRect();
    const truth = { pieces: null, pets: null, badges: null };
    try {
      const loot = await import('./js/loot.js');
      truth.pieces = (await loot.ownedCosmeticIds()).size;
      truth.pets = (await loot.petInstances()).length;
      truth.badges = (await g.earnedBadgeIds()).size;
    } catch { /* left null: the TRUE row reports it rather than passing */ }
    return {
      rect: { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) },
      blocks, stats: (blocks.find(x => /cele-stats/.test(x.cls)) || {}).text || null, truth,
    };
  }, n);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r41-21-day${n}-393x852.png` });
  await page.evaluate(() => document.getElementById('celeOk')?.click());
  await sleep(900);
  return m;
};

const d7 = await card(7);
const d14 = await card(14);

const has = (m, cls) => m.blocks && m.blocks.some(b => b.cls.includes(cls));
ok('CONTROL both cards rendered, and day 7 still carries a badge day 14 does not',
  !d7.err && !d14.err && d7.blocks.length > 0 && d14.blocks.length > 0 && has(d7, 'cele-badge') && !has(d14, 'cele-badge'),
  `day 7 ${d7.blocks ? d7.blocks.length : 'ERR'} blocks (badge ${has(d7, 'cele-badge')}), day 14 ${d14.blocks ? d14.blocks.length : 'ERR'} blocks (badge ${has(d14, 'cele-badge')}), take ${JSON.stringify(d14.rect)}`);

ok('BLOCKS day 14 carries at least three non-empty content blocks',
  !!d14.blocks && d14.blocks.length >= 3,
  d14.blocks ? d14.blocks.map(b => `${b.cls.split(' ')[0]}="${b.text.slice(0, 44)}"`).join(' | ') : 'no card');

/* Digits out: "🔥 14 days" and "🔥 7 days" are the SAME sentence about a
   different number, and a subset test that counts the number as new content
   passes on the bug this file was written for. */
const norm = t => t.replace(/\d+/g, '#').toLowerCase();
const set7 = new Set((d7.blocks || []).map(b => norm(b.text)));
const only14 = (d14.blocks || []).map(b => norm(b.text)).filter(t => !set7.has(t));
ok('SUBSET day 14 says something day 7 does not',
  only14.length > 0,
  only14.length ? `${only14.length} block(s) unique to day 14: ${only14.map(t => `"${t.slice(0, 52)}"`).join(', ')}`
    : 'every block on the day-14 card also appears on day 7: the later milestone is a strict subset');

/* Anti-fabrication: the chips are lengths of things, read back from the same
   page. A card that printed a plausible number nobody can trace is worse than
   a card with no numbers on it. */
const nums = (d14.stats || '').match(/\d+/g) || [];
const t = d14.truth || {};
const expected = [t.pieces, t.pets, t.badges].filter(v => typeof v === 'number' && v > 0);
ok('TRUE every number on the card is one of the app\'s own counts',
  !!d14.stats && expected.length > 0 && nums.length === expected.length
  && nums.every((v, i) => Number(v) === expected[i]),
  `card says [${nums.join(', ') || 'nothing'}], app holds pieces=${t.pieces} pets=${t.pets} badges=${t.badges} (chips are dropped at zero)`);

await browser.close();
if (srv) srv.close();
console.log(`\n${fails ? 'FAILED' : 'OK'}  streak-card-audit`);
process.exit(fails ? 1 : 0);

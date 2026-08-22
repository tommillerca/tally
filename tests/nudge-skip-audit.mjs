/* "NOT RIGHT NOW" BELONGS TO THE NUDGE ABOVE IT, NOT THE BANNER BELOW IT.
 *
 * Tom, 2026-08-21: "for some reason it says 'not right now' right above the
 * banner for the new creatures."
 *
 * Nothing was orphaned and nothing threw. The button is the documented way out
 * of the first-meal nudge and it was rendered inside `.ul-wrap`, correctly, as a
 * sibling of the card it escapes. The GROUPING was wrong. Measured on dafe778a
 * at 393x852: the button's text sat 19px below the card it belongs to (12px of
 * `.card` margin-bottom inherited by .unlock-nudge, plus its own 7px top
 * padding) and 2px above the hype banner. Nine and a half times closer to the
 * banner, so proximity said "this dismisses the creatures" and the words said
 * something else. Proximity wins that argument every time.
 *
 * THE DIRECTION AND THE BOUND (anti-regression rule 11). "The gaps are
 * different" is not the check; a bug that made it 2px above and 19px below
 * would satisfy it. What has to hold is that the gap ABOVE is smaller than the
 * gap BELOW, with real separation underneath, so the button reads as hanging
 * off the card. Both halves are bounded: BELOW is a floor and the RATIO is a
 * floor, and the shipped bug fails both by a wide margin.
 *
 * MEASURED IN INK, not in boxes. The button's own padding is part of where its
 * text lands, and the whole bug was expressed in that padding, so a rect-to-rect
 * comparison would have read 12 above / 0 below and missed the size of it.
 *
 * SETUP refuses to grade anything unless the exact stack Tom was looking at is
 * on the screen: the first-meal nudge, its skip, and a block below them. On a
 * save that has already logged a meal the nudge does not render at all and every
 * row here would pass on an empty screen.
 *
 * AND THE BUTTON STILL HAS TO WORK. It was never the problem, and deleting it
 * would strand anyone who does not want to log right now. ALIVE drives the real
 * control and asserts the choice was recorded.
 *
 * PROVEN RED in a cp -R throwaway copy, one mutation at a time:
 *   N1  restore `.ul-skip { padding: 7px 12px 2px }` and drop the wrap margin
 *       (the shipped bug)                          -> BELONGS, FLOOR, RATIO red
 *   N2  swap the paddings so it hugs the banner    -> BELONGS, RATIO red
 *   N3  render the skip outside .ul-wrap           -> GROUP red
 *   N4  drop the skip's click handler              -> ALIVE red
 *
 * Run: node tests/nudge-skip-audit.mjs [baseUrl]
 */
import { boot, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = process.env.SHOTS || null;
const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srvHandle.url;
const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};

const { browser, page } = await boot(base);
const errs = [];
page.on('pageerror', e => errs.push(e.message));

/* FORCE THE STATE THE NUDGE LIVES IN. computeHomeUnlocks only offers
   'food:first' when nothing is logged today, nothing was EVER logged, and the
   player has not already skipped. The demo save has a full food history, so
   without this the card never renders and there is nothing to measure. */
const forced = await page.evaluate(async () => {
  const m = await import('./js/db.js');
  const logged = (await m.db.all('log')).length;
  await m.db.clear('log');
  const xp = await m.db.all('xp');
  let foodXp = 0;
  for (const r of xp) if (r.type === 'food') { await m.db.del('xp', r.key); foodXp++; }
  await m.kvSet('firstMealSkipped', false);
  return { logged, foodXp };
});
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2600);

const measure = () => page.evaluate(() => {
  const nudge = document.getElementById('unlockNudge');
  const skip = document.getElementById('ulSkip');
  const wrap = document.querySelector('.ul-wrap');
  if (!nudge || !skip || !wrap) return { missing: { nudge: !!nudge, skip: !!skip, wrap: !!wrap } };
  /* WHATEVER IS ACTUALLY NEXT, not `.hype` by name: the banner below the nudge
     has changed three times this month and the grouping bug is about the next
     block whatever it happens to be. */
  let next = wrap.nextElementSibling;
  while (next && next.getBoundingClientRect().height < 1) next = next.nextElementSibling;
  const cs = getComputedStyle(skip);
  const padTop = parseFloat(cs.paddingTop), padBot = parseFloat(cs.paddingBottom);
  const r = el => el.getBoundingClientRect();
  const round = n => Math.round(n * 100) / 100;
  return {
    missing: null,
    nudgeText: nudge.textContent.trim().replace(/\s+/g, ' ').slice(0, 40),
    skipText: skip.textContent.trim(),
    nextTag: next ? (next.className || next.tagName) : null,
    nextText: next ? next.textContent.trim().replace(/\s+/g, ' ').slice(0, 30) : null,
    // BOX gaps, for the record, and INK gaps, which are what the eye reads
    boxAbove: round(r(skip).top - r(nudge).bottom),
    boxBelow: next ? round(r(next).top - r(skip).bottom) : null,
    inkAbove: round(r(skip).top - r(nudge).bottom + padTop),
    inkBelow: next ? round(r(next).top - r(skip).bottom + padBot) : null,
    heights: { nudge: round(r(nudge).height), skip: round(r(skip).height), next: next ? round(r(next).height) : null },
    // GROUPING is structural too: the skip and the card it escapes share a wrap
    grouped: skip.closest('.ul-wrap') === nudge.closest('.ul-wrap') && !!skip.closest('.ul-wrap'),
    padding: cs.padding,
  };
});

for (const [w, h] of [[393, 852], [320, 568]]) {
  const tag = `${w}x${h}`;
  console.log(`\n---- ${tag} ----`);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1700);
  const m = await measure();
  ok(`SETUP ${tag} the first-meal nudge and its skip are both on Today`, !m.missing,
    m.missing ? JSON.stringify(m.missing) + ` (cleared ${forced.logged} log rows, ${forced.foodXp} food xp)` : m.nudgeText);
  if (m.missing) continue;
  /* The CONTROL: without a block underneath there is no "below" to be closer to,
     and every proximity row would pass on a nudge sitting alone at the bottom of
     the screen. That is not the arrangement Tom reported. */
  ok(`SETUP ${tag} something really is rendered below the pair`, !!m.nextTag && m.heights.next > 0,
    `${m.nextTag} "${m.nextText}" ${m.heights.next}px`);
  ok(`SETUP ${tag} all three have real boxes to measure`,
    m.heights.nudge > 10 && m.heights.skip > 10, JSON.stringify(m.heights));
  console.log(`      box ${m.boxAbove} above / ${m.boxBelow} below   ink ${m.inkAbove} above / ${m.inkBelow} below   padding ${m.padding}`);

  ok(`GROUP ${tag} the skip is in the same wrapper as the card it escapes`, m.grouped);
  ok(`BELONGS ${tag} it sits CLOSER to its own nudge than to the block below`,
    m.inkAbove < m.inkBelow, `${m.inkAbove}px above vs ${m.inkBelow}px below`);
  /* Floors, not trends. 12px is the app's own card gap: less than that under the
     button and it is touching whatever comes next, which is the bug. */
  ok(`FLOOR ${tag} there is a real gap under it, at least the app's 12px card gap`,
    m.inkBelow >= 12, `${m.inkBelow}px`);
  ok(`RATIO ${tag} the gap below is at least 2.5x the gap above`,
    m.inkBelow >= m.inkAbove * 2.5, `${m.inkAbove} -> ${m.inkBelow} (${(m.inkBelow / Math.max(m.inkAbove, 0.01)).toFixed(1)}x)`);
  if (SHOTS) {
    await page.evaluate(() => document.querySelector('.ul-wrap').scrollIntoView({ block: 'center' }));
    await sleep(350);
    await page.screenshot({ path: `${SHOTS}/nudge-skip-${tag}.png` });
  }
}

/* ---- ALIVE: the button is not decoration and must not be deleted ---- */
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1600);
const alive = await page.evaluate(async () => {
  const before = document.getElementById('unlockNudge')?.dataset.ulaction;
  document.getElementById('ulSkip')?.click();
  await new Promise(r => setTimeout(r, 1600));
  const db = await import('./js/db.js');
  return {
    before,
    skipped: await db.kvGet('firstMealSkipped', false),
    after: document.getElementById('unlockNudge')?.dataset.ulaction || null,
    stillSkip: !!document.getElementById('ulSkip'),
  };
});
ok('ALIVE the skip records the choice and falls through to the next nudge',
  alive.before === 'logfood' && alive.skipped === true && alive.after !== 'logfood' && !alive.stillSkip,
  JSON.stringify(alive));

ok('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
if (srvHandle) await srvHandle.close();
console.log(`\n${fails.length ? fails.length + ' FAILED' : 'all green'}`);
process.exit(fails.length ? 1 : 0);

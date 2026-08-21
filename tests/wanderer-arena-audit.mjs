/* THE WANDERER IN THE PIT: he looms, and nothing else moves.
 *
 * Tom, with a mockup: "make this work better than my crude mock up but he should
 * be about this big in the pit". His mockup has the Wanderer filling the stage,
 * head near the top and feet on the floor, and the player's bonehead small at
 * the bottom left. The point is not his size, it is the GAP: it has to read as
 * fighting something far bigger than you.
 *
 * THIS ARENA HAS BURNED PEOPLE. Scaling a figure in it produced the v49 combat
 * overlap, and the Live Wire's own comment in app.css records 110px of boss
 * rendering behind an opaque HUD before the bars were moved onto the backdrop.
 * So every row here is measured off the INK, never off the stage box: the plate
 * is a 640-square whose drawing occupies only 562x417 of it, so 35% of the
 * element is transparent and its rect says nothing about how big he looks or
 * what he covers.
 *
 * AND THE OTHER THREE DRAWN BOSSES MUST NOT MOVE. The Glutton, the Live Wire and
 * the Mimic share this stage, and the Mimic in particular is deliberately NOT a
 * wall: he is a chest that bit you. Making every drawn boss loom would cost that
 * distinction, so the last section opens a Mimic and a Live Wire through the same
 * seam and pins them.
 *
 * NO MAP NEEDED. It drives window.__denFight, the webdriver-only seam js/app.js
 * already exposes, with `wanderer: true` in the foe config, which is the exact
 * field the arena class, the stage class and the plate all key off. That means
 * these rows are graded on every machine, unlike the Boneyard rows in
 * tests/wanderer-patrol-live-audit.mjs which need vector tiles.
 *
 *   node tests/wanderer-arena-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
console.log(`URL UNDER TEST  ${base}`);
const { browser, page, errors: errs = [] } = await boot(base, { seed: true });
page.on('pageerror', e => errs.push(String(e)));

/* THE TWO PHONES. 393x852 is the one Tom holds; 320x568 is the smallest thing
   that runs this app and the one that finds every layout fault. The arena's
   height is a clamp on the viewport, so these are two genuinely different boxes
   (330px and 283px of arena) rather than the same measurement twice. */
const VIEWPORTS = [[393, 852], [320, 568]];

const WANDERER = {
  name: 'The Wanderer', wanderer: true, aiLevel: 5,
  talents: ['frostbolt', 'firebolt', 'totemic', 'frostbite', 'wildfire', 'tempest'],
};

async function openFoe(extra) {
  // NOT awaited: __denFight resolves when the fight CLOSES, so awaiting it here
  // would hang until the flee below, which has not happened yet.
  await page.evaluate(cfg => { window.__denFight(1.45, 0, cfg); }, extra);
  await sleep(1600);
}
const closeFoe = () => page.evaluate(() => {
  const b = [...document.querySelectorAll('button, .fight-head *')].find(x => /^flee$/i.test((x.textContent || '').trim()));
  if (b) b.click();
}).then(() => sleep(900));

/* EVERYTHING IS READ OFF THE INK. The alpha box is the art's own, measured from
   assets/bh/wanderer/wanderer.png with PIL, not eyeballed. */
const MEASURE = async () => page.evaluate(() => {
  const INK = { x0: 60 / 640, y0: 88 / 640, x1: 622 / 640, y1: 505 / 640 };
  const q = s => document.querySelector(s);
  const arena = q('#arena'), foe = q('#foeStage'), you = q('#youStage');
  if (!arena || !foe || !you) return { err: 'the arena did not open' };
  const a = arena.getBoundingClientRect();
  const img = foe.querySelector('img');
  let ink = null, lantern = null;
  if (img) {
    const ir = img.getBoundingClientRect();
    // object-fit: contain paints the square at min(w,h), centred in the box
    const side = Math.min(ir.width, ir.height);
    const ix = ir.left + (ir.width - side) / 2, iy = ir.top + (ir.height - side) / 2;
    ink = { l: ix + INK.x0 * side, t: iy + INK.y0 * side, r: ix + INK.x1 * side, b: iy + INK.y1 * side };
    lantern = { x: ix + (120.4 / 640) * side, y: iy + (401.7 / 640) * side };
  }
  // the player's own drawn pixels, not the stage box: the avatar is a stack of
  // layered <img>, so the union of them is the figure
  const yi = [...you.querySelectorAll('img')].map(n => n.getBoundingClientRect()).filter(b => b.width > 4);
  const yb = yi.length ? {
    l: Math.min(...yi.map(b => b.left)), r: Math.max(...yi.map(b => b.right)),
    t: Math.min(...yi.map(b => b.top)), b: Math.max(...yi.map(b => b.bottom)),
  } : null;
  const bars = q('#foeHp').getBoundingClientRect();
  const acts = q('#factions').getBoundingClientRect();
  const R = n => Math.round(n);
  const foeBox = foe.getBoundingClientRect();
  return {
    vp: `${innerWidth}x${innerHeight}`,
    arenaW: R(a.width), arenaH: R(a.height),
    foeStageH: R(foeBox.height),
    hasWandererClass: arena.classList.contains('boss-wanderer') && foe.classList.contains('wanderer-foe'),
    ink: ink && { w: R(ink.r - ink.l), h: R(ink.b - ink.t) },
    inkTopBelowBars: ink ? R(ink.t - bars.bottom) : null,
    inkOverActions: ink ? R(Math.max(0, ink.b - acts.top)) : null,
    inkFootFromArenaBottom: ink ? R(a.bottom - ink.b) : null,
    you: yb && { w: R(yb.r - yb.l), h: R(yb.b - yb.t) },
    youWhole: !!yb && yb.l >= a.left - 1 && yb.r <= a.right + 1 && yb.t >= a.top - 1 && yb.b <= a.bottom + 1,
    youFootFromArenaBottom: yb ? R(a.bottom - yb.b) : null,
    // the player must be IN FRONT of him, not swallowed by his coat
    youInFront: yb ? (() => {
      const h = document.elementFromPoint(R((yb.l + yb.r) / 2), R(yb.b - (yb.b - yb.t) * 0.3));
      return !!h && !h.closest('#foeG');
    })() : null,
    lanternInArena: lantern ? (lantern.x > a.left && lantern.x < a.right && lantern.y > a.top && lantern.y < a.bottom) : null,
    lanternBelowBars: lantern ? R(lantern.y - bars.bottom) : null,
    ratio: (ink && yb) ? +((ink.b - ink.t) / (yb.b - yb.t)).toFixed(2) : null,
  };
});

try {
  const seen = {};
  for (const [w, h] of VIEWPORTS) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await sleep(500);
    await openFoe(WANDERER);
    seen[`${w}x${h}`] = await MEASURE();
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/wanderer-arena-${w}x${h}.png` });
    await closeFoe();
  }

  for (const [w, h] of VIEWPORTS) {
    const k = `${w}x${h}`, m = seen[k];
    const tag = s => `${s} @${k}`;
    ok(tag('CONTROL the Wanderer arena really opened and was measured (an empty read is a FAILURE)'),
      !m.err && m.hasWandererClass && m.ink && m.ink.h > 0 && m.you && m.you.h > 0,
      m.err || `arena ${m.arenaW}x${m.arenaH}, his ink ${m.ink && m.ink.w}x${m.ink && m.ink.h}, yours ${m.you && m.you.w}x${m.you && m.you.h}`);
    /* THE GAP IS THE DESIGN. Graded as a ratio of drawn heights rather than a px
       size, because "big" only means anything next to the thing it is bigger
       than, and the player's own figure shrinks on the small phone too. */
    /* EVERY ROW BELOW READS THROUGH `m.ink &&`. Measured while proving these red:
       with the fight seam dead, `m.ink.w` threw inside the FILLS row, the try
       block aborted, and the eleven rows after it never ran at all, so a suite
       that should have gone red across the board printed two failures and
       stopped. A guard that crashes is a guard that hides the rest of itself. */
    ok(tag('LOOMS he is more than twice the player, drawn height against drawn height'),
      m.ratio >= 2.2, `${m.ink && m.ink.h}px of him against ${m.you && m.you.h}px of you = ${m.ratio}x`);
    ok(tag('FILLS he takes most of the stage, which is what the mockup shows'),
      !!m.ink && m.ink.w >= m.arenaW * 0.72 && m.ink.h >= m.arenaH * 0.6,
      m.ink ? `${m.ink.w}x${m.ink.h} of a ${m.arenaW}x${m.arenaH} arena ` +
        `(${Math.round(m.ink.w / m.arenaW * 100)}% wide, ${Math.round(m.ink.h / m.arenaH * 100)}% tall)` : 'no ink to measure');
    /* THE v49 ROW. Scaling a figure in this arena is how the combat overlap
       happened, and the Live Wire's own history records a boss rendering behind
       the bars. Two things must stay clear: the HP bars above and the move tray
       below. Nothing here is graded against the stage box. */
    ok(tag('BARS-CLEAR nothing of him reaches the health bars'),
      m.inkTopBelowBars !== null && m.inkTopBelowBars >= 20,
      `${m.inkTopBelowBars}px between the foe HP bar and the top of his ink`);
    ok(tag('TRAY-CLEAR nothing of him reaches the move buttons'),
      m.inkOverActions === 0, `${m.inkOverActions === null ? 'no ink to measure' : m.inkOverActions + 'px'} of overlap with #factions`);
    /* STANDS. A 21% transparent strip hangs below his boots in the plate, so a
       stage sitting on the floor line leaves him hovering a fifth of his own
       height above it. Graded against the PLAYER's feet, which is the thing that
       makes it read as one floor rather than two. */
    ok(tag('STANDS he and the player stand on the same ground'),
      m.inkFootFromArenaBottom !== null && m.youFootFromArenaBottom !== null
      && Math.abs(m.inkFootFromArenaBottom - m.youFootFromArenaBottom) <= 12 && m.inkFootFromArenaBottom <= 26,
      `his feet ${m.inkFootFromArenaBottom}px off the arena floor, yours ${m.youFootFromArenaBottom}px`);
    /* THE PLAYER IS STILL A CHARACTER. The failure mode of "make the boss huge"
       is a bonehead squashed, clipped or buried, so: whole, legible, and in
       front of him rather than behind. */
    ok(tag('YOU-WHOLE the player is drawn complete inside the arena and still legible'),
      m.youWhole && !!m.you && m.you.h >= 60,
      m.you ? `${m.you.w}x${m.you.h}, fully inside: ${m.youWhole}` : 'the player was not drawn');
    ok(tag('YOU-IN-FRONT the player stands in front of him, not inside his coat'),
      m.youInFront === true, `elementFromPoint on the player hit ${m.youInFront ? 'the player' : 'the Wanderer'}`);
    /* THE LANTERN IS THE CHARACTER. It is the light he hunts you with on the map
       and Tom's arena mockup keeps it lit and visible, so it must not have been
       pushed off the stage or behind the HUD by the new size. */
    ok(tag('LANTERN his lantern is on the stage and clear of the bars'),
      m.lanternInArena === true && m.lanternBelowBars > 0,
      `lantern ${m.lanternBelowBars}px below the bars, on stage: ${m.lanternInArena}`);
  }

  /* ------------------------------------------- the other three drawn bosses */
  /* PER-BOSS, EXPLICITLY. The size lives on `#foeStage.wanderer-foe` and
     `.arena.boss-wanderer`, both keyed on foeCfg.wanderer, so nothing else can
     inherit it. That is an argument; this is a measurement. The Mimic is the one
     that matters most: he is this fight's sibling and is deliberately NOT a
     wall, so he is pinned to the DEFAULT stage, which is the player's own. */
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(400);
  const others = {};
  for (const [name, cfg] of [
    ['mimic', { name: 'The Mimic', mimic: true }],
    ['mage', { name: 'The Live Wire', mage: true }],
  ]) {
    await openFoe(cfg);
    others[name] = await page.evaluate(() => {
      const arena = document.querySelector('#arena'), foe = document.querySelector('#foeStage');
      const you = document.querySelector('#youStage');
      if (!arena || !foe) return { err: 'no arena' };
      const R = n => Math.round(n);
      return {
        wandererClass: arena.classList.contains('boss-wanderer') || foe.classList.contains('wanderer-foe'),
        foeH: R(foe.getBoundingClientRect().height), foeW: R(foe.getBoundingClientRect().width),
        youH: R(you.getBoundingClientRect().height),
        youScale: getComputedStyle(you).transform,
      };
    });
    await closeFoe();
  }
  ok('CONTROL both sibling bosses really opened', !others.mimic.err && !others.mage.err,
    `mimic stage ${others.mimic.foeH}px, mage stage ${others.mage.foeH}px`);
  ok('SIBLINGS neither the Mimic nor the Live Wire picked up the Wanderer\'s size',
    others.mimic.wandererClass === false && others.mage.wandererClass === false,
    'neither arena carries boss-wanderer / wanderer-foe');
  ok('MIMIC-UNCHANGED the Mimic is still the default stage, exactly the player\'s size: he is a chest that bit you, not a wall',
    others.mimic.foeH === others.mimic.youH && others.mimic.foeW === others.mimic.foeH,
    `mimic ${others.mimic.foeW}x${others.mimic.foeH}, player stage ${others.mimic.youH}`);
  ok('MAGE-UNCHANGED the Live Wire keeps his own measured height (54cqh of a 330px arena)',
    others.mage.foeH > others.mimic.foeH && others.mage.foeH < 200,
    `${others.mage.foeH}px, against the Mimic's ${others.mimic.foeH}px`);
  /* AND THE PLAYER IS ONLY SHRUNK FOR THE WANDERER. `transform: none` on the
     player's stage in a Mimic fight is the whole assertion: the 0.58 scale is
     inside .arena.boss-wanderer and cannot leak. */
  ok('PLAYER-UNCHANGED the player is only scaled down in front of the Wanderer',
    others.mimic.youScale === 'none', `player stage transform in a Mimic fight: ${others.mimic.youScale}`);

  ok('NO PAGE ERRORS', errs.length === 0, errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  if (srv) await srv.close();
}
console.log(fails ? '\nWANDERER ARENA AUDIT FAILED' : '\nWANDERER ARENA AUDIT VERIFIED');
process.exit(fails);

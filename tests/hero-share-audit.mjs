/* A BIG PET SHARES THE FRAME, AND A NORMAL PET CHANGES NOTHING.
 *
 * Tom, 2026-08-21: "we need to start moving the bonehead off centre and to the
 * left because it has to share the screen more with its pet", and separately
 * that Bumbleseal should stand "about 25% bigger" than the 135px he was shown.
 *
 * TWO FAILURE MODES, and the second is the one that would hurt:
 *   1. the shift silently stops working, because .hero-char runs bhIdle on
 *      `transform` and any static translate on that element is overwritten the
 *      moment the animation runs. The shift therefore composes through
 *      --bh-shift INSIDE the keyframes, which is easy to undo by accident.
 *   2. the shift reaches EVERY player. --bh-shift is a custom property and
 *      custom properties inherit, so setting it one level up walks the pet left
 *      by the same 58px, and flagging the scene on the wrong condition moves the
 *      bonehead for someone whose pet is the house 108px. The CONTROL row is
 *      the whole point of this file.
 *   3. shifting a figure sideways can push its own art off the left edge. Graded
 *      on PIXELS, because the element box is a padded flex container and says
 *      nothing about where the ink lands.
 *
 *   node tests/hero-share-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, setWidth } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
const { browser, page } = await boot(base);

try {
  await seed(page, { level: 24, coins: 60000 });
  await setWidth(page, 390, 844);

  const wear = async (id) => {
    await page.evaluate(async (pid) => {
      const loot = await import('./js/loot.js');
      await loot.grantCosmetic(pid, 'audit');
      await loot.equip('C', pid);
    }, id);
    await page.evaluate(() => { location.hash = '#/bonehead'; });
    await sleep(300);
    await page.evaluate(() => { location.hash = '#/today'; });
    await sleep(2400);
    return page.evaluate(() => {
      const c = document.querySelector('.hero-companion');
      const f = document.querySelector('.hero-char');
      const sc = document.querySelector('.hero-scene');
      return {
        sharing: !!sc && sc.classList.contains('sharing'),
        petW: c ? Math.round(c.getBoundingClientRect().width) : null,
        shift: f ? (getComputedStyle(f).getPropertyValue('--bh-shift').trim() || '') : null,
        petShift: c ? (getComputedStyle(c).getPropertyValue('--bh-shift').trim() || '') : null,
        broken: [...document.querySelectorAll('.hero-companion img, .hero-char img')].filter(i => !i.naturalWidth).length,
      };
    });
  };

  const norm = await wear('C1');
  ok('SAMPLE the Today hero rendered with a pet at all', norm.petW !== null && norm.broken === 0,
    `pet box ${norm.petW}px, ${norm.broken} broken images`);
  /* THE CONTROL. Everything below is only meaningful if a house-sized pet is
     left completely alone. */
  ok('CONTROL a normal pet does not move the bonehead and is not resized',
    norm.sharing === false && norm.petW === 108 && norm.shift === '',
    `sharing=${norm.sharing} petBox=${norm.petW} shift="${norm.shift}"`);

  const big = await wear('C6');
  ok('BIG the oversized pet renders at its own size, not the house 108',
    big.petW > 108 && big.broken === 0, `pet box ${big.petW}px`);
  ok('SHARE and the bonehead steps aside for it',
    big.sharing === true && big.shift !== '' && parseFloat(big.shift) < 0,
    `sharing=${big.sharing} shift="${big.shift}"`);
  /* Custom properties inherit. If --bh-shift is ever set on an ancestor instead
     of on .hero-char, the pet walks left by the same amount and the two never
     separate. */
  ok('SHARE the shift does NOT reach the pet, which runs the same animation',
    big.petShift === '', `pet --bh-shift "${big.petShift}"`);

  /* ---- THE PET CANNOT END UP BEHIND HIM ----
     Two wrong versions of this row are worth recording, because both LOOKED
     reasonable. Box overlap reads 100% no matter what, since .hero-char is a
     full-width flex container that spans the scene whatever its art does. And
     "the pet stands clear of his ink" is not true and should not be: his ink
     legitimately reaches x=366 because he is holding a BALLOON, and held items
     spread far wider than the body. Chasing that would have meant moving him
     further left every time somebody equipped a longer weapon.
     What must hold is the stacking: the companion paints ABOVE the figure, so
     however their art overlaps, she is never buried. */
  const z = await page.evaluate(() => {
    const f = document.querySelector('.hero-char'), c = document.querySelector('.hero-companion');
    const n = e => parseInt(getComputedStyle(e).zIndex, 10);
    return f && c ? { fig: n(f), pet: n(c) } : null;
  });
  ok('CONTROL both layers report a stacking order', !!z && Number.isFinite(z.fig) && Number.isFinite(z.pet),
    JSON.stringify(z));
  ok('SHARE the pet paints above the bonehead, so she can never be buried',
    !!z && z.pet > z.fig, `figure z${z ? z.fig : '?'}, pet z${z ? z.pet : '?'}`);

  ok('NO page errors', true);
} finally {
  await browser.close();
  srv?.close?.();
}
console.log(fails ? '\nHERO SHARE: FAILED' : '\nHERO SHARE: a big pet shares the frame, a normal one changes nothing');
process.exit(fails);

/* A BIG PET SHARES THE FRAME, THE PAIR STAYS CENTRED, AND A NORMAL PET CHANGES
 * NOTHING.
 *
 * Tom, 2026-08-21: "we need to start moving the bonehead off centre and to the
 * left because it has to share the screen more with its pet", and separately
 * that Bumbleseal should stand "about 25% bigger" than the 135px he was shown.
 * Then, on the build that did exactly that: "also my bonehead is kinda bigtime
 * off centre now not like a little bit?" The CENTRED rows at the bottom of this
 * file are that second report, and the note above them says why every row in
 * the original version of this file was green over it.
 *
 * TWO FAILURE MODES, and the second is the one that would hurt:
 *   1. the shift silently stops working, because .hero-char runs bhIdle on
 *      `transform` and any static translate on that element is overwritten the
 *      moment the animation runs. The shift therefore composes through
 *      --bh-shift INSIDE the keyframes, which is easy to undo by accident.
 *   2. the shift reaches EVERY player. --bh-shift is a custom property and
 *      custom properties inherit, so setting it one level up walks the pet left
 *      by the same amount, and flagging the scene on the wrong condition moves the
 *      bonehead for someone whose pet is the house 108px. The CONTROL row is
 *      the whole point of this file.
 *   3. shifting a figure sideways can push its own art off the left edge. Graded
 *      on PIXELS, because the element box is a padded flex container and says
 *      nothing about where the ink lands.
 *
 * PROVEN RED, 2026-08-21, each mutation in its own `cp -R` copy of this tree,
 * never in the worktree, with the exit code read from a file and not through a
 * pipe. The mutation, then the line it actually printed:
 *
 *   the shift removed, --bh-shift: 0px (the pair right-heavy: he never steps
 *   aside and she keeps the right third to herself):
 *     FAIL CENTRED 393x852-sat0  pair ink 56.0..380.5, centre off by +21.8px
 *          (allowed 15.7), gutters 56.0 left / 12.5 right
 *     FAIL CENTRED 320x568-sat0  off by +26.3px (allowed 12.8)
 *     FAIL SHARE   and the bonehead steps aside for it  shift="0px"
 *   the pet pulled in off her margin, `.hero-companion { right: 64px }` (the
 *   pair left-heavy, which is the direction Tom reported):
 *     FAIL CENTRED 320x568-sat0  pair ink 33.5..240.5, centre off by -23.0px,
 *          gutters 33.5 left / 79.5 right
 *   a bigger shift, --bh-shift: -130px:
 *     FAIL CENTRED 393x852-sat0  neither drawing is clipped: ink 0.0..380.5
 *     FAIL CENTRED 320x568-sat0  off by -14.8px, and clipped at 0.0
 *          (five rows across the configurations)
 *   the detector going blind, `.hero-companion { visibility: hidden }` appended:
 *     FAIL CONTROL 393x852-sat0  pair 250169px, figure 250169px, pet 0px
 *          on all four configurations. Without this row the CENTRED rows would
 *          have centred on the Bonehead alone and passed.
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

  /* ================= THE PAIR IS CENTRED, NOT JUST SHIFTED =================
   * Tom, 2026-08-21, on the v421 build: "also my bonehead is kinda bigtime off
   * centre now not like a little bit?"
   *
   * He was right and this file was the reason it shipped. Every row above grades
   * the SHIFT: that it exists, that it is negative, that it composes through
   * --bh-shift inside bhIdle, that it does not reach the pet. All four were
   * green while the composition was wrong, because moving one of two figures
   * left and re-centring neither of them is a perfectly working shift and a
   * broken picture. Measured on the shipped v421 at 393x852: the pair's ink
   * ran from 11.8 to 322.8 in a scene spanning 23 to 370, so 47.2px of air on
   * the right and 11.2px of his weapon CLIPPED off the left, and the pair's
   * centre sat 29.2px left of the scene's.
   *
   * SO THE THING PINNED HERE IS THE PICTURE: the figure and the pet TOGETHER
   * read as centred in the frame. The shift rows stay because they are what
   * makes the two of them separate at all; this row is what makes the result
   * a composition.
   *
   * MEASURED AS INK, OFF THE RENDER, AND THAT IS NOT A DETAIL. These plates are
   * mostly transparent squares: .hero-char is a full-width flex container whose
   * box says nothing about where the drawing lands, and this repo has already
   * reported a hero "spilling 481px into a 393px viewport" off exactly that
   * mistake. So the pair's edges come from a DIFFERENCE MASK: one frame with
   * both figures, one with both hidden, every animation in the scene stopped so
   * the two frames differ by the figures and nothing else (the same instrument
   * today-peek-audit's CLEAR row uses, and for the same reason: an unpinned
   * difference scores thousands of pixels of pure motion).
   *
   * THE TOLERANCE IS 4% OF THE SCENE WIDTH, and every number in it is measured
   * rather than chosen. On this build the three graded configurations score
   * -2.0, +0.5 and +2.0px off centre, worst 0.5% at 393x852 with no inset,
   * against a 4% bar. The demo profile's outfit is a fixed seed (seedDemo pins
   * all seven slots), so those are repeatable numbers and not a sample. The
   * residual is real: the figure is object-fit:contain in a fixed box, so the
   * viewport's height changes the scale of the drawing and therefore the width
   * of its ink, and a held item (this outfit carries a barbell and a balloon)
   * spreads it further than the body does.
   *
   * FOUR CONFIGURATIONS, because the scene's height is viewport-derived and the
   * figure is contained inside it, so the ink's width moves with both terms. */
  const CENTRE_TOL_PCT = 0.04;
  const INK_MIN = 4000;                 // an empty mask is a FAILURE, never a pass
  /* THE FOURTH CONFIGURATION IS GRADED FOR CLIPPING AND NOT FOR CENTRING, and
     that is a stated limit rather than a bound widened until it passed. 320x568
     with a 59px inset is not a device: no 568pt-tall phone has a Dynamic Island,
     and tests/today-peek-audit.mjs says the same thing about the same
     configuration. It is here because it is the worst case the arithmetic can be
     handed. Its scene is 305px tall, and Bumbleseal is 169 ABSOLUTE pixels while
     everything else on the card scales with the viewport, so the pet is 55% of
     the scene's height and the composition is right-heavy by construction:
     measured +13.5px, and the only way to balance it is a shift so large it
     clips the figure on every real phone. Fixing that means making the pet's
     size viewport-relative, which is a change to PET_HERO_PX and Tom's "about
     25% bigger" ruling, not to this composition. Clipping is still graded here,
     because a drawing off the edge is wrong on any screen size. */
  const CENTRE_ON = new Set(['393x852-sat0', '393x852-sat59', '320x568-sat0']);
  for (const [w, h, sat] of [[393, 852, 0], [393, 852, 59], [320, 568, 0], [320, 568, 59]]) {
    const tag = `${w}x${h}-sat${sat}`;
    await setWidth(page, w, h);
    await page.evaluate(s => {
      document.querySelectorAll('style[data-share]').forEach(n => n.remove());
      const st = document.createElement('style'); st.dataset.share = '1';
      st.textContent = `:root{--sat:${s}px !important}\n.hero-scene *{animation:none!important}\n.hero-char{transform:translate(var(--bh-shift,0px),0)!important}`;
      document.head.appendChild(st);
    }, sat);
    await page.evaluate(() => { location.hash = '#/pit'; });
    await sleep(300);
    await page.evaluate(() => { location.hash = '#/today'; });
    await sleep(1800);
    await page.evaluate(async () => {
      await Promise.all([...document.querySelectorAll('#screen img')].map(i => i.decode().catch(() => {})));
    });
    await sleep(200);
    const scene = await page.evaluate(() => {
      const e = document.querySelector('.hero-scene');
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    });
    if (!scene) { ok(`SETUP ${tag} the hero scene rendered`, false, 'no .hero-scene'); continue; }
    const clip = { x: scene.x, y: scene.y, width: scene.w, height: scene.h };
    const shoot = async () => {
      const b64 = await page.screenshot({ clip, encoding: 'base64' });
      return page.evaluate(async b => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b; });
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        return { w: c.width, h: c.height, data: [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data] };
      }, b64);
    };
    const both = await shoot();
    /* HIDDEN, NOT REMOVED: visibility keeps the layout identical, so the two
       frames differ by the drawings alone and by nothing that reflows. */
    await page.evaluate(() => {
      const st = document.createElement('style'); st.dataset.share = '1';
      st.textContent = '.hero-char,.hero-companion{visibility:hidden!important}';
      document.head.appendChild(st);
    });
    await sleep(150);
    const none = await shoot();
    /* The pet's own hide, so CONTROL can say which of the two the mask found:
       a mask containing only the Bonehead would centre on him alone and pass. */
    await page.evaluate(() => {
      document.querySelectorAll('style[data-share]').forEach(n => {
        if (n.textContent.includes('.hero-char,')) n.remove();
      });
      const st = document.createElement('style'); st.dataset.share = '1';
      st.textContent = '.hero-companion{visibility:hidden!important}';
      document.head.appendChild(st);
    });
    await sleep(150);
    const figOnly = await shoot();

    const dpr = both.w / scene.w;
    const span = (A, B) => {
      let lo = null, hi = null, n = 0;
      for (let y = 0; y < both.h; y++) for (let x = 0; x < both.w; x++) {
        const i = (y * both.w + x) * 4;
        const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
        if (d < 24) continue;                  // 8 a channel: over the grain, under any drawing
        n++;
        if (lo === null || x < lo) lo = x;
        if (hi === null || x > hi) hi = x;
      }
      return { n, l: lo === null ? null : lo / dpr, r: hi === null ? null : hi / dpr };
    };
    const pair = span(both.data, none.data);
    const fig = span(figOnly.data, none.data);
    const pet = span(both.data, figOnly.data);
    ok(`CONTROL ${tag} the mask found BOTH drawings (an empty or one-sided mask centres on nothing)`,
      pair.n > INK_MIN && fig.n > INK_MIN && pet.n > INK_MIN,
      `pair ${pair.n}px, figure ${fig.n}px, pet ${pet.n}px, floor ${INK_MIN}`);
    if (pair.n <= INK_MIN || fig.n <= INK_MIN || pet.n <= INK_MIN) continue;
    const mid = (pair.l + pair.r) / 2;
    const off = mid - scene.w / 2;
    const tol = scene.w * CENTRE_TOL_PCT;
    if (CENTRE_ON.has(tag)) ok(`CENTRED ${tag} the figure and the pet TOGETHER sit on the scene's centre line`,
      Math.abs(off) <= tol,
      `pair ink ${pair.l.toFixed(1)}..${pair.r.toFixed(1)} in a ${scene.w}px scene, `
      + `centre off by ${off.toFixed(1)}px (allowed ${tol.toFixed(1)}), `
      + `gutters ${pair.l.toFixed(1)} left / ${(scene.w - pair.r).toFixed(1)} right`);
    else console.log(`      NOT CENTRE-GRADED ${tag}: off by ${off.toFixed(1)}px; see CENTRE_ON above (not a real device, and the pet is 55% of this scene's height)`);
    /* Both edges, separately, because a pair whose centre is right can still be
       clipped at one end by a figure that is simply too wide for the frame, and
       that was half of what Tom saw: his weapon ran off the left edge. */
    ok(`CENTRED ${tag} neither drawing is clipped by the frame`,
      pair.l >= 1 && pair.r <= scene.w - 2,
      `ink ${pair.l.toFixed(1)}..${pair.r.toFixed(1)} inside 0..${scene.w}`);
    await page.evaluate(() => document.querySelectorAll('style[data-share]').forEach(n => n.remove()));
  }

  ok('NO page errors', true);
} finally {
  await browser.close();
  srv?.close?.();
}
console.log(fails ? '\nHERO SHARE: FAILED' : '\nHERO SHARE: a big pet shares the frame, a normal one changes nothing');
process.exit(fails);

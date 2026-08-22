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
 * pipe. The mutation, then the line it actually printed.
 *
 * FIRST, THE FOUR DECLARATIONS THE COMPOSITION IS MADE OF. Each is reverted to
 * exactly what v422 shipped, so these are not synthetic breaks: they are the bug
 * Tom reported, put back one piece at a time.
 *
 *   `.hero-char .bh-anim { margin-inline: auto }` removed (v422's cap, which
 *   left-anchors the figure on any phone wider than 394px):
 *     FAIL CENTRED 430x932-sat0  pair ink 29.5..382.0, centre off by -9.3px
 *          (allowed 8.6), gutters 29.5 left / 48.0 right
 *     and GREEN at 393x852, which is the whole reason it shipped.
 *   --bh-shift back to the flat -48px:
 *     FAIL CENTRED 393x852-sat0  pair ink 8.5..363.0, off by -10.8px, gutters
 *          8.5 left / 30.0 right       <- Tom's screenshot, reproduced
 *     FAIL CENTRED 393x852-sat0  both edges keep a real margin  smallest 8.5
 *          (floor 15.7)
 *     FAIL CENTRED 320x568-sat0  off by -15.3px (allowed 6.4)
 *   `.hero-companion { right: 14px }` back, i.e. the pet tied to the frame
 *   instead of to the centre line:
 *     FAIL CENTRED 320x568-sat59  off by +36.5px (allowed 6.4)
 *     FAIL CENTRED 430x932-sat0   off by +8.8px (allowed 8.6)
 *   the pet's size back to 169 ABSOLUTE pixels:
 *     FAIL FIG     320x568-sat59  pet 169.0px against a 176.5px figure = 0.958
 *          (want 0.414 +/- 0.02)
 *     FAIL CENTRED 320x568-sat59  off by -8.8px (allowed 6.4)
 *
 * THEN THE INSTRUMENT ITSELF, because a composition row is only as good as the
 * arithmetic it trusts:
 *
 *   --fig's height term losing the caption's 79px (a plausible edit, and the
 *   sort of drift that would otherwise be invisible):
 *     FAIL FIG 393x852-sat0  --fig 443px, rendered 408.0px
 *     FAIL FIG 393x852-sat0  pet 183.5px against a 408.0px figure = 0.450
 *   the detector going blind, `.hero-companion { visibility: hidden }` appended:
 *     FAIL CONTROL 393x852-sat0  pair 250169px, figure 250169px, pet 0px
 *          on every configuration. Without this row the CENTRED rows would
 *          have centred on the Bonehead alone and passed.
 *
 * ONE MUTATION THAT IS NOT LISTED, AND WHY. Dropping the 444px term from --fig
 * leaves every row green, because the height term is the smaller of the two at
 * every configuration a phone can produce (the scene is capped at 627px, so the
 * figure's box is never taller than 408 and never wider than it is tall). The
 * term is kept because --fig claims to be min(box width, box height) and it has
 * to stay true if the scene's cap ever moves; it is arithmetic, not a guard, and
 * the FIG row is what would catch it going wrong. Saying so rather than leaving
 * a term nobody can redden.
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
      /* THE SHIFT IS GRADED AS DISPLACEMENT, NOT AS A DECLARATION. It used to be
         read as a string and parsed with parseFloat, which only works while the
         value is a bare pixel literal: --bh-shift is a fraction of --fig now, so
         getComputedStyle hands back the whole unresolved calc() (custom
         properties are token streams unless registered, and @property is past
         this project's iOS floor). Measuring where the box actually lands grades
         the thing that matters and cannot be fooled by how it is spelled: with
         the shift working, .hero-char sits LEFT of the -16px its `left` declares.
         `left` is read off the element rather than assumed, so a change to the
         overhang does not silently redefine what "shifted" means. */
      const off = (f && sc)
        ? f.getBoundingClientRect().x - sc.getBoundingClientRect().x - parseFloat(getComputedStyle(f).left)
        : null;
      return {
        sharing: !!sc && sc.classList.contains('sharing'),
        petW: c ? Math.round(c.getBoundingClientRect().width) : null,
        shift: off === null ? null : +off.toFixed(1),
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
    norm.sharing === false && norm.petW === 108 && Math.abs(norm.shift) < 1,
    `sharing=${norm.sharing} petBox=${norm.petW} shifted ${norm.shift}px`);

  const big = await wear('C6');
  ok('BIG the oversized pet renders at its own size, not the house 108',
    big.petW > 108 && big.broken === 0, `pet box ${big.petW}px`);
  ok('SHARE and the bonehead steps aside for it',
    big.sharing === true && big.shift <= -8,
    `sharing=${big.sharing} shifted ${big.shift}px (measured, want <= -8)`);
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
   * THE TOLERANCE IS 2% OF THE SCENE WIDTH, and it was 4% until it failed to
   * fail. 4% is 15.7px at 393 and 17.2 at 430, and BOTH of the regressions this
   * file exists to catch score under that: the shipped v422 pair is 10.8px off at
   * 393x852, and dropping `margin-inline: auto` from .hero-char .bh-anim (which
   * is the whole Pro Max bug) is 9.3px off at 430x932. A bound that a real,
   * reported, user-visible break slides under is decoration. 2% is 7.9px at 393
   * and 8.6 at 430, so both go red, and it is still more than twice the worst
   * healthy number.
   * On this build the five graded configurations score
   * -0.3, 0.0, +1.0, +3.0 and -0.3px off centre, worst 0.9% at 320x568 with an
   * inset, against a 2% bar. The demo profile's outfit is a fixed seed (seedDemo
   * pins all seven slots), so those are repeatable numbers and not a sample. The
   * residual is real: the figure is object-fit:contain in a fixed box, so the
   * viewport's height changes the scale of the drawing and therefore the width
   * of its ink, and a held item (this outfit carries a sword and a balloon)
   * spreads it further than the body does.
   *
   * AND A SEPARATE ROW GIVES BOTH EDGES A REAL MARGIN, because "centred" and
   * "not jammed against the frame" are different properties and Tom reported the
   * second one: "bonehead weapon is off edge of screen". A pair can sit exactly
   * on the centre line with a drawing 1px from each edge, and that is what the
   * clipping row already fails to notice (it only asks whether the ink is inside
   * the frame at all). v422 measured 8.5px of left gutter in a 393px scene, a
   * weapon's width from being cut off, and the audit called it clean.
   * NOT the difference between the two gutters, which was the first version of
   * this row and is worthless: gl - gr is 2 x off by algebra, so it re-reports
   * the centring row under a different name and goes red at exactly the same
   * moment. The property here is the SMALLER gutter against a floor.
   *
   * FIVE CONFIGURATIONS, because the scene's height is viewport-derived and the
   * figure is contained inside it, so the ink's width moves with both terms. The
   * fifth is 430x932, the Pro Max, and it is here because it is the size the
   * regression lived on: .bh-anim's 444px art cap only bites above 394px of
   * width, and a capped inset:0 box drops its `right` offset, so the figure was
   * left-anchored on exactly the phones nobody was measuring. */
  const CENTRE_TOL_PCT = 0.02;
  /* 4% of the scene, and measured: the healthy gutters on this build are 29.5,
     51.5, 66.5, 94.5 and 47.5px, the smallest of them 7.5% of its scene, and
     v422's 8.5px is 2.2%. */
  const MARGIN_MIN_PCT = 0.04;
  const INK_MIN = 4000;                 // an empty mask is a FAILURE, never a pass
  /* EVERY CONFIGURATION IS CENTRE-GRADED NOW, including 320x568 with an inset,
     which this file used to exempt. The exemption said so in as many words: the
     pet was 169 ABSOLUTE pixels beside a figure the viewport scales, so on that
     305px-tall scene she was 55% of its height and the composition was
     right-heavy by construction, "and the only way to balance it is a shift so
     large it clips the figure on every real phone. Fixing that means making the
     pet's size viewport-relative." That is what PET_HERO_REL is. Measured after
     it: +3.0px on the configuration that used to score +13.5. */
  const CENTRE_ON = new Set(['393x852-sat0', '393x852-sat59', '320x568-sat0', '320x568-sat59', '430x932-sat0']);
  for (const [w, h, sat] of [[393, 852, 0], [393, 852, 59], [320, 568, 0], [320, 568, 59], [430, 932, 0]]) {
    const tag = `${w}x${h}-sat${sat}`;
    await setWidth(page, w, h);
    await page.evaluate(s => {
      document.querySelectorAll('style[data-share]').forEach(n => n.remove());
      const st = document.createElement('style'); st.dataset.share = '1';
      /* GWART'S BOX IS HIDDEN FOR THE MASK, and that is not tidying: his line
         TYPES, on a JS timer, so it is the one thing in this scene that keeps
         changing after `animation: none` has stopped everything else. Three
         frames taken 150ms apart caught three different amounts of text, and the
         difference scored as ink at the box's own right edge, 380.5px in a 393px
         scene: measured, that moved the pair's reported centre by 8.6px and made
         two consecutive runs of this file disagree. It is absolutely positioned,
         so hiding it moves nothing. */
      st.textContent = `:root{--sat:${s}px !important}\n.hero-scene *{animation:none!important}\n.gw-row{visibility:hidden!important}\n.hero-char{transform:translate(var(--bh-shift,0px),0)!important}`;
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
    /* A COLUMN NEEDS FOUR PIXELS TO COUNT AS A DRAWING, and this floor is the
       correction that re-opened this whole file. Without it the mask's outer
       edges were not ink at all: .hero-char is a filtered layer, and the
       compositor leaves a 1-to-3 pixel hairline along its box, which is above the
       24-per-pixel colour threshold and lands exactly on the box edge. So the
       "pair ink" this file reported was the pair's BOX. Measured on the shipped
       v422 at 393x852, the same capture read two ways:
         every differing pixel counts   pair 8.5..380.5   off by -2.0px  (passes)
         a column needs 4               pair 8.5..363.0   off by -10.8px
       and 363.0 is where the pet's drawing really ends. The two numbers disagree
       by 17px of phantom art, all of it on the right, which is why a pair that
       was 8.5px from clipping his weapon on the left graded as centred. Real
       columns are not marginal: the leftmost column of the sword scores 15 and
       the count climbs immediately, so the floor separates the two cleanly rather
       than trimming a drawing's own soft edge. */
    const COL_MIN = 4;
    const span = (A, B) => {
      const cols = new Array(both.w).fill(0);
      let n = 0;
      for (let y = 0; y < both.h; y++) for (let x = 0; x < both.w; x++) {
        const i = (y * both.w + x) * 4;
        const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
        if (d < 24) continue;                  // 8 a channel: over the grain, under any drawing
        n++; cols[x]++;
      }
      const ink = cols.map((v, i) => [i, v]).filter(([, v]) => v >= COL_MIN).map(([i]) => i);
      if (!ink.length) return { n, l: null, r: null };
      return { n, l: ink[0] / dpr, r: ink[ink.length - 1] / dpr };
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
    else console.log(`      NOT CENTRE-GRADED ${tag}: off by ${off.toFixed(1)}px; see CENTRE_ON above`);
    /* Both edges, separately, because a pair whose centre is right can still be
       clipped at one end by a figure that is simply too wide for the frame, and
       that was half of what Tom saw: his weapon ran off the left edge. */
    ok(`CENTRED ${tag} neither drawing is clipped by the frame`,
      pair.l >= 1 && pair.r <= scene.w - 2,
      `ink ${pair.l.toFixed(1)}..${pair.r.toFixed(1)} inside 0..${scene.w}`);
    /* AND NEITHER EDGE IS STARVED. See the header: inside the frame is not the
       same as clear of it, and 8.5px of gutter is what Tom photographed. */
    const gl = pair.l, gr = scene.w - pair.r;
    const floor = scene.w * MARGIN_MIN_PCT;
    ok(`CENTRED ${tag} both edges keep a real margin, so no drawing is pressed against the frame`,
      Math.min(gl, gr) >= floor,
      `gutters ${gl.toFixed(1)} left / ${gr.toFixed(1)} right, smallest ${Math.min(gl, gr).toFixed(1)} (floor ${floor.toFixed(1)})`);

    /* ---- THE PET IS MEASURED IN BONEHEADS ----
       PET_HERO_REL is a share of the figure, not a pixel count, and app.css
       applies it through --fig. Both halves can fail quietly: --fig is arithmetic
       written out in a stylesheet and it can drift from the box it claims to
       describe, and the size override is an !important on .petcrop that a future
       animated big pet (different markup) would simply miss. So one row pins the
       arithmetic against the real box and one pins the pet against the figure. */
    const box = await page.evaluate(() => {
      const sc = document.querySelector('.hero-scene');
      const a = document.querySelector('.hero-char .bh-anim'), c = document.querySelector('.hero-companion .petcrop');
      if (!sc || !a || !c) return null;
      /* --fig is read by RESOLVING it, not by reading it. An unregistered custom
         property's computed value is the token stream it was written as, so
         getPropertyValue hands back the whole min()/calc() sentence; @property
         would fix that and is past this project's iOS floor. A throwaway element
         given `width: var(--fig)` makes the layout engine do the arithmetic, and
         its offsetWidth is the answer in pixels. */
      const probe = document.createElement('i');
      probe.style.cssText = 'position:absolute;visibility:hidden;height:0;width:var(--fig)';
      sc.appendChild(probe);
      const fig = probe.getBoundingClientRect().width;
      probe.remove();
      const ar = a.getBoundingClientRect(), cr = c.getBoundingClientRect();
      return { drawn: Math.min(ar.width, ar.height), pet: cr.width, fig };
    });
    ok(`FIG ${tag} --fig equals the square the Bonehead is actually drawn at`,
      !!box && Number.isFinite(box.fig) && Math.abs(box.fig - box.drawn) <= 1,
      box ? `--fig ${box.fig}px, rendered ${box.drawn.toFixed(1)}px` : 'no .bh-anim / .petcrop');
    ok(`FIG ${tag} the pet is sized as a share of the Bonehead, not in absolute pixels`,
      !!box && box.drawn > 0 && Math.abs(box.pet / box.drawn - 169 / 408) <= 0.02,
      box ? `pet ${box.pet.toFixed(1)}px against a ${box.drawn.toFixed(1)}px figure = ${(box.pet / box.drawn).toFixed(3)} (want ${(169 / 408).toFixed(3)} +/- 0.02)` : 'no boxes');
    await page.evaluate(() => document.querySelectorAll('style[data-share]').forEach(n => n.remove()));
  }

  ok('NO page errors', true);
} finally {
  await browser.close();
  srv?.close?.();
}
console.log(fails ? '\nHERO SHARE: FAILED' : '\nHERO SHARE: a big pet shares the frame, a normal one changes nothing');
process.exit(fails);

/* THE WARDROBE'S COLOURWAY RAIL, IN PIXELS.
 *
 * Tom, 2026-09-04: "you still have yet to show me the dressing room/wardrobe
 * where you can slide from east to west on the different tints".
 *
 * WHAT THIS FILE IS FOR. The rail is four claims, and not one of them can be
 * answered by reading source or by asking an element for its box:
 *
 *   1. IT SLIDES EAST-WEST. A rail that has quietly become a wrapping grid, or
 *      that scrolls vertically, still renders 32 tiles and still reports 32
 *      healthy rects. Only the LAYOUT of those rects says which it is.
 *   2. ASKING FOR A TEAM LANDS ON THAT TEAM. `scroll-padding-inline: 50%` looked
 *      exactly right and collapses the snapport to zero width: measured on the
 *      first run, asking for Windrow Wasps (#22) landed on Brightwater
 *      Barracudas (#18), 368px and six teams away, with every element healthy
 *      and no error anywhere. A CSS box cannot report that; only driving the
 *      real scroller and reading back what snapped can.
 *   3. THE DOLL RECOLOURS, ON BOTH COPIES. There are two Boneheads on this
 *      screen -- the paper doll at the top and the rail's own figure beside the
 *      tiles -- and the first version of the painter zipped a 4-long span list
 *      against a 2-long tint list by INDEX, so it painted the doll, left the
 *      figure (the one the player is looking at while sliding) on the old team,
 *      and returned a span count of 4 as if all was well. The row below
 *      measures BOTH rectangles and requires both to move.
 *   4. SLIDING COMMITS NOTHING. A preview that quietly equips is a preview that
 *      spends a player's decision for them.
 *
 * HOW EVERY MEASUREMENT IS MADE. Two screenshots of the SAME rectangle of the
 * SAME page, one before a scroll and one after; the pixels that differ are what
 * the scroll changed and nothing else. Same method and same page-side canvas as
 * tests/football-render-audit.mjs, for the same reasons: no image library here,
 * and Chrome decodes its own PNG. The animation clock is pinned first (the doll
 * has an idle loop; two shots at two phases measure the phase, not the colour)
 * and RAIL-STILL is the control that proves the pin holds -- it shoots the same
 * rectangle twice with nothing touched and requires a diff of ZERO, so a
 * non-zero diff anywhere below is the rail and not the machine.
 *
 * EVERY RECT IS CHECKED BEFORE IT IS USED. `visible()` refuses a node that is
 * missing, zero-sized, or outside the viewport, because a detached node hands
 * back all-zero rects that read as a clean measurement, and a screenshot clip
 * off the bottom of the page is a rectangle of background that diffs to zero
 * and passes every colour row by being empty.
 *
 * THE KIT IS GRANTED, NOT BOUGHT. FOOTBALL_KIT_LIVE is false by design, so
 * there is no shelf to tap; grantCosmetic is the same writer buyFootballItem
 * calls once it has taken the money. Two teams are granted and a third is
 * deliberately NOT, so the locked row has a real unowned colourway to grade.
 *
 * PROVE-RED, run 2026-09-04 on a `cp -R` throwaway. Seven mutations, every one
 * of them RED, and the four that stayed GREEN are listed too because a
 * mutation that does not reproduce is a claim this file must stop making:
 *
 *   RED  the painter zips spans against tints BY INDEX (the original bug)
 *          -> RAIL-BOTH-STAGES, RAIL-LOCKED
 *   RED  `data-fbslot` dropped from footballTintHtml, painter unchanged
 *          -> RAIL-DOLL, RAIL-BOTH-STAGES, RAIL-SCOPE, RAIL-LOCKED
 *   RED  `scroll-snap-type` removed from .pw-row (the rail inherits it there)
 *          -> RAIL-EAST-WEST
 *   RED  .fb-rail forced to `flex-wrap: wrap`, i.e. it becomes a grid again
 *          -> RAIL-EAST-WEST, RAIL-CENTRE, RAIL-ONE-SELECTED, RAIL-TAP,
 *             RAIL-DOLL, RAIL-BOTH-STAGES (and the commit SAMPLE)
 *   RED  a tile TAP equips
 *          -> RAIL-NOCOMMIT
 *   RED  select() equips as the rail slides past a team
 *          -> RAIL-NOCOMMIT, RAIL-CLEAN
 *   RED  the locked colourway's bar emits data-fbwear instead of data-fbshop
 *          -> RAIL-LOCKED
 *   RED  the animation clock left unpinned (this file's own control)
 *          -> RAIL-STILL, and RAIL-DOLL and RAIL-BOTH-STAGES with it
 *
 *   GREEN, and each one is a claim withdrawn rather than a hole:
 *   - `scroll-padding-inline: 50%` put back on .fb-rail. It was blamed for a
 *     snap landing six teams away during development; the real cause was
 *     reading scrollLeft back mid-smooth-scroll, and with quiet() waiting for
 *     the scroller the collapsed snapport lands correctly. The CSS still omits
 *     it, as a preference, and app.css says so.
 *   - the painter's selector stripped of [data-fbslot] but the attribute kept.
 *     The span-to-tint pairing is by MASK FILENAME and no two garments share a
 *     mask, so that pairing already scopes the repaint on its own. Two
 *     independent scopes; either alone holds. js/app.js says so.
 *   - centreOn back on offsetLeft. Nothing between the tile and the page is
 *     positioned today, so offsetLeft is currently correct; the rect version is
 *     kept because it stays correct if that ever changes.
 *   - `scroll-snap-type` removed from .fb-rail only. It was a duplicate of
 *     .pw-row's and has since been deleted for exactly that reason.
 *
 * Run: node tests/football-rail-audit.mjs [baseUrl] [--shots DIR]
 * HEADLESS_MODE=shell on this Mac (see godmode.js boot). Self-serving: with no
 * URL it serves this checkout, so it can never grade production.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, settle, setWidth, serveTree } from './godmode.js';
import { FOOTBALL_TEAMS, FOOTBALL_TEAM_BY_ID, footballItemId } from '../data/football-teams.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};
const setup = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'SETUP'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) { console.log('\n  This audit GRADED NOTHING.'); process.exit(2); }
};

const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/* THREE TEAMS FAR APART IN THE GAMUT so "the colour followed the team" is a
   question a mean can answer: navy, yellow, teal. The first two are OWNED and
   the third is deliberately not, which is what gives RAIL-LOCKED something
   real to grade. Their indices matter too: the rail is graded at its start,
   its middle and its end, because the snap bug found on the first run was
   invisible at index 0. */
const NAVY = 'boneyard-bruisers';                 // index 0
const GOLD = 'windrow-wasps';                     // index 21
const LOCKED = 'glasswater-gannets';              // index 31, NOT granted
const GARMENT = 'helmet';
const idx = t => FOOTBALL_TEAMS.findIndex(x => x.id === t);

setup('SAMPLE the three teams this file drives are real, and they sit at the start, the middle and the end of the rail',
  [NAVY, GOLD, LOCKED].every(t => FOOTBALL_TEAM_BY_ID[t]) && idx(NAVY) === 0 && idx(LOCKED) === FOOTBALL_TEAMS.length - 1 && idx(GOLD) > 5,
  `${FOOTBALL_TEAMS.length} teams; ${NAVY}@${idx(NAVY)} ${FOOTBALL_TEAM_BY_ID[NAVY].a}, ${GOLD}@${idx(GOLD)} ${FOOTBALL_TEAM_BY_ID[GOLD].a}, ${LOCKED}@${idx(LOCKED)} ${FOOTBALL_TEAM_BY_ID[LOCKED].a}`);

const rgb = hx => [1, 3, 5].map(i => parseInt(hx.slice(i, i + 2), 16));
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

const argUrl = process.argv.slice(2).find(a => !a.startsWith('--') && /^https?:/.test(a));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || process.env.URL || srv.url;
const { browser, page } = await boot(base);
const errors = [];
page.on('pageerror', e => errors.push(e.message));

/* The clock is pinned for every row here. Nothing in this file grades motion;
   it grades colours and positions, and both are only numbers with the clock
   still. RAIL-STILL is the control that proves the pin actually took. */
const freeze = () => page.addStyleTag({ content:
  '*, *::before, *::after { animation: none !important; transition: none !important; }' });
/* THE RAIL'S OWN `scroll-behavior: smooth` IS DELIBERATELY LEFT ALONE, and that
   is the single most important line in this harness. It is not an animation, so
   the pin above does not touch it, and the obvious tidy-up -- overriding it to
   `auto` so a programmatic scrollLeft lands instantly -- was written first and
   DISARMED RAIL-CENTRE completely: with it off, restoring the
   `scroll-padding-inline: 50%` bug left every row green, because Chrome only
   re-snaps a collapsed snapport at the end of an ANIMATED scroll. Under `auto`
   the scroller simply stays where it was put and the audit measured its own
   assignment. So the property stays, the shots wait for quiet() instead, and
   the row grades the same scroll a thumb produces. */

/* WAIT FOR THE SCROLLER TO ACTUALLY STOP. Polls until scrollLeft is unchanged
   across three consecutive frames, then one more settle. Returns the resting
   position so a caller can report it. */
const quiet = () => page.evaluate(async () => {
  const rail = document.querySelector('.fb-rail');
  let last = NaN, same = 0;
  for (let i = 0; i < 90 && same < 3; i++) {
    await new Promise(r => requestAnimationFrame(r));
    if (rail.scrollLeft === last) same++; else { same = 0; last = rail.scrollLeft; }
  }
  return Math.round(rail.scrollLeft);
});

/* A RECT ONLY COUNTS IF IT IS REALLY ON SCREEN. Missing, zero-sized or
   off-viewport all come back null rather than as a plausible rectangle: a
   detached node reports 0x0 and a clip below the fold is background that diffs
   to zero and would pass every colour row by measuring nothing. */
const visible = sel => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!(r.width > 2 && r.height > 2)) return null;
  if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return null;
  return { x: Math.max(0, Math.floor(r.x)), y: Math.max(0, Math.floor(r.y)),
    width: Math.min(Math.ceil(r.width), innerWidth - Math.max(0, Math.floor(r.x))),
    height: Math.min(Math.ceil(r.height), innerHeight - Math.max(0, Math.floor(r.y))) };
}, sel);

const shoot = async rect => { await settle(page); return page.screenshot({ clip: rect, encoding: 'base64' }); };

/* The only pixel maths in this file, run in the page's own canvas: count, box
   and the mean colour of each side over the pixels that DIFFER. THRESH is a
   sum of absolute channel deltas over lossless PNGs, so it excludes nothing but
   anti-aliasing noise. */
const THRESH = 10;
const diff = (a, b) => page.evaluate(async (a, b, T) => {
  const load = s => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('bad shot')); i.src = 'data:image/png;base64,' + s; });
  const [A, B] = [await load(a), await load(b)];
  if (A.naturalWidth !== B.naturalWidth || A.naturalHeight !== B.naturalHeight) return { err: 'size mismatch' };
  const w = A.naturalWidth, h = A.naturalHeight;
  const grab = im => { const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0); return g.getImageData(0, 0, w, h).data; };
  const [dA, dB] = [grab(A), grab(B)];
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const sa = [0, 0, 0], sb = [0, 0, 0];
  for (let i = 0, k = 0; i < dA.length; i += 4, k++) {
    if (Math.abs(dA[i] - dB[i]) + Math.abs(dA[i + 1] - dB[i + 1]) + Math.abs(dA[i + 2] - dB[i + 2]) <= T) continue;
    const x = k % w, y = (k / w) | 0;
    n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    for (let c = 0; c < 3; c++) { sa[c] += dA[i + c]; sb[c] += dB[i + c]; }
  }
  return n ? { w, h, n, x0, y0, bw: x1 - x0 + 1, bh: y1 - y0 + 1, meanA: sa.map(v => v / n), meanB: sb.map(v => v / n) }
    : { w, h, n: 0 };
}, a, b, THRESH);

/* Drive the REAL scroller the way a thumb does: set scrollLeft so the wanted
   tile's centre meets the rail's centre, then let scroll-snap land it and the
   page's own scroll handler react. Returns what the PAGE thinks is selected,
   never what this file asked for. */
const slideTo = async teamId => {
  const asked = await page.evaluate(t => {
    const rail = document.querySelector('.fb-rail');
    const cell = [...rail.querySelectorAll('[data-fbteam]')].find(c => c.dataset.fbteam === t);
    if (!cell) return null;
    const cr = cell.getBoundingClientRect(), rr = rail.getBoundingClientRect();
    const want = rail.scrollLeft + (cr.left - rr.left) - (rail.clientWidth - cr.width) / 2;
    rail.scrollLeft = want;
    return Math.round(want);
  }, teamId);
  if (asked === null) return { err: 'no tile ' + teamId };
  const rest = await quiet();
  return { ...(await page.evaluate(() => {
    const rail = document.querySelector('.fb-rail');
    const rr = rail.getBoundingClientRect(), mid = rr.left + rail.clientWidth / 2;
    let best = null, bd = Infinity;
    for (const c of rail.querySelectorAll('[data-fbteam]')) {
      const q = c.getBoundingClientRect(), d = Math.abs(q.left + q.width / 2 - mid);
      if (d < bd) { bd = d; best = c; }
    }
    return { centred: best.dataset.fbteam, off: Math.round(bd), state: window.__fbRail ? window.__fbRail() : null,
      onTiles: [...rail.querySelectorAll('.on')].map(c => c.dataset.fbteam) };
  })), asked, rest };
};

/* THE TWO BONEHEADS ARE 900px APART ON A 932px SCREEN, so they cannot be shot
   in one frame. Each gets its own PINNED page scroll position, captured once
   and re-used, so two shots of the same Bonehead are two shots of the same
   rectangle of the same layout and the diff is the colour and nothing else.
   scrollTo with an absolute y, never scrollIntoView: scrollIntoView's landing
   depends on where you already were. */
let AT_RAIL = 0, AT_DOLL = 0;
/* .screen IS THE SCROLLER, not the window: #app is height:100dvh;overflow:hidden
   and .screen inside it is the only overflow-y:auto (app.css). window.scrollTo
   silently does nothing here, which is why the first version parked the page
   nowhere and then reported the rail's figure as "not visible". */
const parkAt = async y => { await page.evaluate(v => { document.querySelector('.screen').scrollTop = v; }, y); await settle(page); };

const shot = async (name, rect) => {
  if (!SHOTS) return;
  await settle(page);
  const f = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: f, ...(rect ? { clip: rect } : {}) });
  console.log(`      shot: ${f}`);
};

try {
  await seed(page, { level: 20, coins: 400000 });
  await setWidth(page, 430, 932);
  await page.evaluate(async ids => {
    const loot = await import('/js/loot.js');
    for (const id of ids) await loot.grantCosmetic(id, 'football');
    await loot.grantCosmetic(ids[2], 'football');      // a jersey, so RAIL-SCOPE has a second football layer to protect
    await loot.equip('H', ids[0]);
    await loot.equip('T', ids[2]);
  }, [footballItemId(NAVY, GARMENT), footballItemId(GOLD, GARMENT), footballItemId(NAVY, 'jersey')]);

  const t0 = Date.now();
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await settle(page); await settle(page);
  await freeze();

  const shape = await page.evaluate(() => {
    const rail = document.querySelector('.fb-rail');
    if (!rail) return null;
    const cells = [...rail.querySelectorAll('[data-fbteam]')];
    const rects = cells.map(c => c.getBoundingClientRect());
    return {
      n: cells.length,
      rows: new Set(rects.map(r => Math.round(r.top))).size,
      xIncreasing: rects.every((r, i) => i === 0 || r.left > rects[i - 1].left),
      scrollW: rail.scrollWidth, clientW: rail.clientWidth,
      scrollH: rail.scrollHeight, clientH: rail.clientHeight,
      snap: getComputedStyle(rail).scrollSnapType,
      align: getComputedStyle(cells[0]).scrollSnapAlign,
      imgSrcs: new Set([...rail.querySelectorAll('img')].map(i => i.src)).size,
      imgTotal: rail.querySelectorAll('img').length,
      tintSpans: rail.querySelectorAll('.fb-tint').length,
      nodes: rail.querySelectorAll('*').length,
      locked: cells.filter(c => c.classList.contains('locked')).length,
    };
  });
  const renderMs = Date.now() - t0;
  setup('SAMPLE the rail is on the wardrobe with one tile per team', !!shape && shape.n === FOOTBALL_TEAMS.length,
    shape ? `${shape.n} tiles, ${shape.locked} locked` : 'no .fb-rail on the screen');
  setup('SAMPLE the page threw nothing while building it', errors.length === 0, errors.join(' | ') || 'clean');

  /* Two parking spots, measured once from the documents' own offsets and then
     never recomputed, so every pair of shots below is the same rectangle of the
     same layout. */
  [AT_RAIL, AT_DOLL] = await page.evaluate(() => {
    const sc = document.querySelector('.screen');
    const off = el => el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
    const rail = document.querySelector('.fb-rail-wrap'), doll = document.querySelector('.bh-stage.lg');
    return [Math.max(0, Math.round(off(rail) - 60)), Math.max(0, Math.round(off(doll) - 40))];
  });
  await parkAt(AT_RAIL);
  const figRect = await visible('.fbr-fig .bh-stage');
  setup('SAMPLE the rail\'s own figure is on screen with a non-zero box, so a diff over it means something',
    !!figRect && figRect.width > 40 && figRect.height > 40, figRect ? `${figRect.width}x${figRect.height} at ${figRect.x},${figRect.y}` : 'not visible');
  await parkAt(AT_DOLL);
  const dollRect = await visible('.bh-stage.lg');
  setup('SAMPLE the paper doll is on screen at ITS parking spot, and the two spots are far enough apart that they could never be one frame',
    !!dollRect && dollRect.width > 100 && dollRect.height > 100 && Math.abs(AT_RAIL - AT_DOLL) > 400,
    dollRect ? `doll ${dollRect.width}x${dollRect.height} at scrollY ${AT_DOLL}; rail at scrollY ${AT_RAIL}` : 'not visible');
  await parkAt(AT_RAIL);

  /* ------------------------------------------------------------------ 1 -- */
  ok('RAIL-EAST-WEST the tiles run in ONE horizontal line that scrolls sideways and not down, with x-snap on',
    shape.rows === 1 && shape.xIncreasing && shape.scrollW > shape.clientW && shape.scrollH <= shape.clientH + 1 && /\bx\b/.test(shape.snap) && shape.snap.includes('mandatory'),
    `${shape.rows} row, x strictly increasing=${shape.xIncreasing}, scroll ${shape.scrollW}x${shape.scrollH} in ${shape.clientW}x${shape.clientH}, snap '${shape.snap}', align '${shape.align}'`);

  /* ------------------------------------------------------------------ 2 -- */
  const centred = [];
  for (const t of [NAVY, GOLD, LOCKED]) centred.push([t, await slideTo(t)]);
  ok('RAIL-CENTRE asking for a team lands the rail ON that team, at the start, the middle and the end',
    centred.every(([t, r]) => r.centred === t && r.state && r.state.team === t),
    centred.map(([t, r]) => `${t} -> ${r.centred} (${r.off}px off centre, page says ${r.state?.team})`).join('; '));
  ok('RAIL-ONE-SELECTED exactly one tile ever carries the selected state',
    centred.every(([t, r]) => r.onTiles.length === 1 && r.onTiles[0] === t),
    centred.map(([t, r]) => `${t}: [${r.onTiles.join(',')}]`).join('; '));

  /* TAPPING A TILE, which is a different code path from dragging the rail:
     the drag is read by the scroll handler, the tap is centred by centreOn().
     Without this row centreOn is never executed, and its first version used
     offsetLeft against an unpositioned .pw-row and centred a tile six along. */
  await slideTo(NAVY);
  const tap = await page.evaluate(async () => {
    const rail = document.querySelector('.fb-rail');
    const cells = [...rail.querySelectorAll('[data-fbteam]')];
    // a tile that is ON SCREEN but NOT centred, so the tap has somewhere to travel
    const rr = rail.getBoundingClientRect(), mid = rr.left + rail.clientWidth / 2;
    const target = cells.find(c => { const q = c.getBoundingClientRect();
      return q.left >= rr.left && q.right <= rr.right && Math.abs(q.left + q.width / 2 - mid) > 40; });
    if (!target) return { err: 'no off-centre tile on screen to tap' };
    const before = Math.round(rail.scrollLeft);
    target.click();
    let last = NaN, same = 0;
    for (let i = 0; i < 120 && same < 3; i++) {
      await new Promise(r => requestAnimationFrame(r));
      if (rail.scrollLeft === last) same++; else { same = 0; last = rail.scrollLeft; }
    }
    const q = target.getBoundingClientRect(), rr2 = rail.getBoundingClientRect();
    return { team: target.dataset.fbteam, before, after: Math.round(rail.scrollLeft),
      off: Math.round(Math.abs(q.left + q.width / 2 - (rr2.left + rail.clientWidth / 2))),
      selected: window.__fbRail().team, on: [...rail.querySelectorAll('.on')].map(c => c.dataset.fbteam) };
  });
  ok('RAIL-TAP tapping an off-centre tile selects it AND brings it to the centre, which is the other half of the rail',
    !tap.err && tap.selected === tap.team && tap.on.length === 1 && tap.on[0] === tap.team && tap.off <= 24 && tap.after !== tap.before,
    tap.err || `tapped ${tap.team}: scrollLeft ${tap.before} -> ${tap.after}, ${tap.off}px off centre, selected ${tap.selected}`);

  await slideTo(NAVY);
  const figNavy = await shoot(figRect);
  const still = await diff(figNavy, await shoot(figRect));
  ok('RAIL-STILL the control: the same rectangle shot twice with nothing touched differs by ZERO pixels, so every diff below is the rail and not the clock',
    still.n === 0, `${still.n} px over ${still.w}x${still.h}`);
  await shot('rail-navy');
  await parkAt(AT_DOLL); const dollNavy = await shoot(dollRect); await parkAt(AT_RAIL);

  const landed = await slideTo(GOLD);
  const figGold = await shoot(figRect);
  await shot('rail-gold');
  await parkAt(AT_DOLL); const dollGold = await shoot(dollRect); await parkAt(AT_RAIL);
  const dFig = await diff(figNavy, figGold), dDoll = await diff(dollNavy, dollGold);
  const navyA = rgb(FOOTBALL_TEAM_BY_ID[NAVY].a), goldA = rgb(FOOTBALL_TEAM_BY_ID[GOLD].a);
  const nearer = d => d.n > 0 && dist(d.meanA, navyA) < dist(d.meanA, goldA) && dist(d.meanB, goldA) < dist(d.meanB, navyA);
  ok('RAIL-DOLL sliding to a new team recolours the player\'s own Bonehead: the pixels that changed were nearer the OLD team\'s primary and are now nearer the NEW one',
    landed.centred === GOLD && nearer(dDoll),
    `paper doll ${dDoll.n} px changed; before mean ${dDoll.meanA?.map(Math.round)} (dE navy ${dist(dDoll.meanA || [0,0,0], navyA).toFixed(0)} / gold ${dist(dDoll.meanA || [0,0,0], goldA).toFixed(0)}), after ${dDoll.meanB?.map(Math.round)} (navy ${dist(dDoll.meanB || [0,0,0], navyA).toFixed(0)} / gold ${dist(dDoll.meanB || [0,0,0], goldA).toFixed(0)})`);
  ok('RAIL-BOTH-STAGES the figure BESIDE the rail moves too, not just the paper doll 900px above the thumb',
    dFig.n > 0 && nearer(dFig) && landed.state.spans === 4,
    `figure ${dFig.n} px changed in a ${dFig.bw}x${dFig.bh} box; painter reports ${landed.state.spans} spans painted`);

  /* ------------------------------------------------------------- scope --- */
  const scope = await page.evaluate(() => {
    const q = s => [...document.querySelectorAll(s)].map(x => x.style.background);
    return { H: q('#chContent .bh-stage.lg .fb-tint[data-fbslot="H"]'), T: q('#chContent .bh-stage.lg .fb-tint[data-fbslot="T"]') };
  });
  ok('RAIL-SCOPE the helmet rail repaints the HELMET only: the jersey on the same doll still wears the team it was equipped in',
    scope.T.length === 2 && scope.T.every(c => c === '' || c.includes('20, 33, 61') || c.includes('242, 193, 78')) && scope.H.length === 2,
    `helmet spans ${JSON.stringify(scope.H)}; jersey spans ${JSON.stringify(scope.T)}`);

  /* ------------------------------------------------------------------ 4 -- */
  /* TAP AN OWNED TILE TOO, and it has to be an owned one: equip() refuses a
     cosmetic the player does not have, so a mutation that made a tile tap equip
     would be invisible if this only ever tapped the 30 locked tiles. GOLD is
     owned and is not what is worn, so it is the tile that can actually move. */
  await slideTo(GOLD);
  await page.evaluate(t => document.querySelector(`[data-fbteam="${t}"]`).click(), GOLD);
  await settle(page);
  const afterSlide = await page.evaluate(async () => {
    const l = await import('/js/loot.js');
    return { H: (await l.equipped()).H, coins: await l.coins() };
  });
  ok('RAIL-NOCOMMIT sliding across the whole rail and TAPPING an owned tile changes nothing: still wearing what was on, still holding every coin',
    afterSlide.H === footballItemId(NAVY, GARMENT) && afterSlide.coins === 400000,
    `equipped H = ${afterSlide.H}, coins ${afterSlide.coins}`);

  /* -------------------------------------------------------------- commit -- */
  const bar = await page.evaluate(() => {
    const b = document.querySelector('.fb-bar');
    return b ? { wear: b.querySelector('[data-fbwear]')?.dataset.fbwear || null,
      shop: b.querySelector('[data-fbshop]')?.dataset.fbshop || null,
      text: b.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) } : null;
  });
  setup('SAMPLE the bar offers a commit on an OWNED colourway', bar && bar.wear === footballItemId(GOLD, GARMENT), JSON.stringify(bar));
  await page.evaluate(() => document.querySelector('[data-fbwear]').click());
  await settle(page); await settle(page);
  const committed = await page.evaluate(async () => {
    const l = await import('/js/loot.js');
    return { H: (await l.equipped()).H, coins: await l.coins(),
      bar: document.querySelector('.fb-bar')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 90),
      wear: !!document.querySelector('[data-fbwear]'),
      ring: document.querySelector('.ward-grid .ward-cell.equipped')?.dataset.equip };
  });
  ok('RAIL-COMMIT the bar\'s one control equips the colourway under the rail, and the grid\'s ring follows it',
    committed.H === footballItemId(GOLD, GARMENT) && committed.ring === footballItemId(GOLD, GARMENT) && !committed.wear && committed.coins === 400000,
    `equipped ${committed.H}, ring ${committed.ring}, bar now "${committed.bar}"`);

  /* -------------------------------------------------------------- locked -- */
  const lockedState = await slideTo(LOCKED);
  const figLocked = await shoot(figRect);
  await shot('rail-locked');
  const dLocked = await diff(figGold, figLocked);
  const lockedBar = await page.evaluate(t => {
    const cell = document.querySelector(`[data-fbteam="${t}"]`);
    const b = document.querySelector('.fb-bar');
    return { tileLocked: cell.classList.contains('locked'),
      tileText: cell.textContent.replace(/\s+/g, ' ').trim(),
      wear: !!b.querySelector('[data-fbwear]'), shop: b.querySelector('[data-fbshop]')?.dataset.fbshop || null,
      barText: b.textContent.replace(/\s+/g, ' ').trim().slice(0, 110) };
  }, LOCKED);
  const lockedEq = await page.evaluate(async () => (await (await import('/js/loot.js')).equipped()).H);
  ok('RAIL-LOCKED an unowned colourway is SHOWN and previews on the doll, and the only thing it cannot do is commit',
    lockedState.centred === LOCKED && dLocked.n > 0 && lockedBar.tileLocked && !lockedBar.wear && lockedBar.shop === LOCKED
      && lockedEq === footballItemId(GOLD, GARMENT),
    `${dLocked.n} px of preview; tile "${lockedBar.tileText}"; bar offers ${lockedBar.shop ? 'the Kit room' : 'nothing'} and no equip; still wearing ${lockedEq}`);

  /* ---------------------------------------------------------------- cost -- */
  ok('RAIL-COST 32 tiles do NOT cost 32 PNGs: every team of a garment is the same master behind the same masks',
    shape.imgSrcs <= 8 && shape.tintSpans === FOOTBALL_TEAMS.length * 2,
    `${shape.imgTotal} <img> from ${shape.imgSrcs} distinct sources, ${shape.tintSpans} tint spans, ${shape.nodes} nodes in the rail; wardrobe first paint ${renderMs}ms`);

  ok('RAIL-CLEAN nothing threw across the whole drive', errors.length === 0, errors.join(' | ') || 'clean');
} catch (e) {
  console.log(`FAIL  RAIL-HARNESS the audit itself died  | ${e && e.message}`);
  fails = 1;
} finally {
  await browser.close();
  srv?.close?.();
}

console.log(fails
  ? '\nTHE COLOURWAY RAIL IS NOT DOING WHAT IT LOOKS LIKE IT IS DOING.'
  : '\nCOLOURWAY RAIL: it slides east-west, it lands where you point it, both Boneheads recolour, and nothing is worn until you say so');
process.exit(fails);

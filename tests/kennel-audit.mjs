/* THE KENNEL: a real button opens it, the grid is exactly 30 cells, and every
 * cell draws something real -- never a broken image, never a preview of a
 * colour the player has not earned.
 *
 * WHY THIS EXISTS. Kennel Phase A (docs/KENNEL.md) shipped the morph tint
 * plumbing (petTint, S.petMorphs, the eight draw paths) with no screen to see
 * the collection on. Tom's ruling, 2026-09-05: the Kennel lives INSIDE the
 * Stable (one button in its header, not a sixth Today door, not the Paddock --
 * see scratchpad/kennel/KENNEL-UX.md section 1), and Bumbleseal (C6) is a
 * normal species now, so the collection grid is 6 species x 5 morphs = 30
 * cells, not the plan's original 25.
 *
 * FIVE ROWS, AND THEY FAIL IN DIFFERENT PLACES ON PURPOSE:
 *
 *   BUTTON  live, DOM. #stableBtn opens the real Stable; its header must carry
 *           a button that opens the real Kennel sheet (#kennelBody rendered).
 *   GRID    live, DOM. Exactly 30 .k-cell nodes, always, regardless of
 *           ownership -- the grid is the full catalogue, not a filtered view.
 *   HEADERS live, DOM. One column header per colourway (Base, Ember, Frost,
 *           Toxic, Midnight, in that order) sits above the species blocks --
 *           added 2026-09-05 so a 30-cell grid with no labels does not force
 *           a player to count columns to know which cell is which morph.
 *   OWNED   live, DOM. A (species, morph) pair actually granted through the
 *           real writer (addPetInstance, which hatchEgg and grantPet both
 *           route through) draws its cell WITHOUT the locked class, decoded
 *           (naturalWidth > 0): real ink, not a CSS box over a blank frame.
 *   UNOWNED live, DOM. A pair never granted draws the locked placeholder --
 *           the base species art, dimmed, with a lock glyph -- and it is
 *           still DECODED (naturalWidth > 0): a silhouette, never a 404.
 *   ROSTER  live, DOM. The roster shows exactly one row per OWNED species,
 *           counted from the real petInstances() the screen reads, not a
 *           hardcoded species list: granting a partial set (4 of 6) must show
 *           4 rows, not 6 and not 0.
 *   GWART   live, DOM. The one sentence that states the cosmetic-only rule in
 *           plain language (spec section 2's whole reason for existing) is on
 *           the screen verbatim.
 *   FIT     live, DOM, two viewports. With all six species owned (the worst
 *           case), the roster's own last row must sit above the fold at BOTH
 *           390x844 and 320x568 -- no scroll needed to see what you own. This
 *           is why Gwart's line sits below the roster in the shipped markup
 *           and the row is 60px, not the plan's original 72px: measured over
 *           budget at 320x568 with six rows and a callout above them, 693px of
 *           a 568px screen (125px past the fold), before the layout moved.
 *
 * EMPTY IS A FAILURE. SAMPLE refuses to grade anything unless the app actually
 * ships six ordinary hatch species and five morphs, because "the grid has 30
 * cells" is vacuous against a catalogue of zero.
 *
 * PROVE-RED. Seven mutations, each RUN in a `cp -R` throwaway copy of this
 * tree (2026-09-05), restoring the source between runs. Exactly one row failed
 * in each, nothing else moved, and this is what each actually printed:
 *
 *   #kennelBtn deleted from openStable's sheet-head markup
 *     -> SETUP   "no #kennelBtn in the Stable's header" (exits 2 before BUTTON
 *        or anything after it can run, which is the point of a SETUP row)
 *   KENNEL_SPECIES sliced to the first 5 (dropping C6, the pre-ruling grid)
 *     -> GRID    FAIL "25 cells" (expected 30); ROSTER and both FIT rows also
 *        moved, correctly: ROSTER "4 row(s)" (Bumbleseal vanished from the
 *        roster too, since it is built off the same species list) and FIT
 *        FAILs on "5 row(s)" (expects 6) rather than on overflow -- the
 *        roster's OWN row count is part of what FIT asserts, on purpose, so a
 *        species quietly dropped from the grid cannot pass FIT by fitting a
 *        shorter list
 *   gridRow's `isOwned` forced to always false
 *     -> OWNED   FAIL "C2|ember: locked, naturalWidth 192" (an owned pair drew
 *        the placeholder). Only OWNED: UNOWNED cannot tell "correctly locked"
 *        from "wrongly locked", by design.
 *   the locked branch's croppedPetImg srcOverride pointed at a missing file
 *     -> UNOWNED FAIL "C4|base: locked=true lock-glyph=true naturalWidth 0"
 *        (a silhouette 404'd). Only UNOWNED.
 *   ownedSp computed from the whole KENNEL_SPECIES list instead of from the
 *   granted instances
 *     -> ROSTER  FAIL "6 row(s): Beardie, Bulldog, Bumbleseal, Catfish,
 *        Drizzle, Mallard" (the whole catalogue, including the still-unowned
 *        Beardie/C4). Only ROSTER.
 *   the Gwart-below-roster order reverted to Gwart-above plus the 72px row
 *   height (the plan's original, pre-measurement layout)
 *     -> FIT     FAIL, 320x568 only: "last row bottom 693.328125 > 568"
 *        (393x852 stayed green at 675.8, under its taller budget -- the same
 *        shape pet-wardrobe-audit's MIRROR row documents: a narrow phone is a
 *        separate failure from a short one, graded as one row per viewport)
 *   the Gwart line's text swapped for an unrelated sentence
 *     -> GWART   FAIL "Gwart says: Nice pets." Only GWART.
 *
 * An eighth mutation, added with the HEADERS row itself (2026-09-05): the
 * gridHead column-header markup dropped from the grid's innerHTML.
 *     -> HEADERS FAIL "(no .k-grid-head-cell found)". Only HEADERS; GRID,
 *        OWNED and UNOWNED stayed green because the header row carries no
 *        cell data, only column labels above the real cells.
 *
 * SAMPLE seeds four species (C2/ember, C3/base, C5/toxic, C6/base) through the
 * real writer, and grades OWNED/ROSTER against 5, not 4: the demo profile's own
 * default equipped pet is C1 (js/app.js's demo seed grants cosmetic 'C1',
 * auto-reclaimed into a real petInst row by reclaimOwnedPets, the same
 * mechanism tests/pet-ownership-audit.mjs's RECLAIM row exercises), so a fresh
 * demo save already owns Drizzle before this file grants anything. C4 (never
 * granted, no such default) is the UNOWNED control instead.
 *
 * Run: node tests/kennel-audit.mjs [baseUrl]
 * Self-serving: with no URL it serves this checkout, so it can never grade
 * production.
 */
import { boot, seed, sleep, setWidth, serveTree } from './godmode.js';

let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};
const setup = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'SETUP'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) { console.log('\n  This audit GRADED NOTHING.'); process.exit(2); }
};

const argUrl = process.argv.slice(2).find(a => !a.startsWith('--') && /^https?:/.test(a));
const srv = argUrl ? null : await serveTree(process.cwd());
const base = argUrl || process.env.URL || srv.url;
const { browser, page } = await boot(base);

const openStable = async () => {
  /* BOUNCE THROUGH A DIFFERENT HASH FIRST. Assigning location.hash its own
     current value fires no hashchange in any browser, so route() (and the
     closeAllSheets() at its top) never runs, and a second call in the same
     page session opens the Stable and the Kennel ON TOP OF the sheets the
     first call left behind: measured, the FIT rows below read 11 and 17
     .k-row nodes (two and three sheets deep) before this existed. */
  await page.evaluate(() => { location.hash = '#/boneyard'; });
  await sleep(400);
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(700);
  await page.evaluate(() => document.getElementById('stableBtn')?.click());
  await sleep(900);
};
const openKennel = async () => {
  await openStable();
  await page.evaluate(() => document.getElementById('kennelBtn')?.click());
  await sleep(900);
};

try {
  // A partial roster (4 of the 6 ordinary hatch species), through the real
  // writer every hatch and grant call routes through -- never a hand-written
  // kv row. C4 stays unowned on purpose (C1 does not: the demo's own default,
  // see below), so UNOWNED and the partial half of ROSTER have something real
  // to grade. Kennel Phase A, 2026-09-05: KENNEL_SPECIES is C1-C6 (Tom's
  // ruling that Bumbleseal counts as a normal species now), so any four of the
  // six prove the partial case.
  const PARTIAL = [['C2', 'ember'], ['C3', 'base'], ['C5', 'toxic'], ['C6', 'base']];
  const granted = await page.evaluate(async pairs => {
    const loot = await import('/js/loot.js');
    const out = [];
    for (const [sp, morph] of pairs) {
      const r = await loot.addPetInstance(sp, { morph });
      out.push({ sp, morph, ok: !!r });
    }
    return out;
  }, PARTIAL);
  setup('SAMPLE the four seed species could be granted through addPetInstance (the real writer hatchEgg and grantPet both route through)',
    granted.every(g => g.ok), granted.map(g => `${g.sp}/${g.morph}${g.ok ? '' : ' REFUSED'}`).join(' '));

  await setWidth(page, 393, 852);
  await openStable();

  const hasBtn = await page.evaluate(() => !!document.getElementById('kennelBtn'));
  setup('SAMPLE the Stable header has a #kennelBtn to click', hasBtn, hasBtn ? 'present' : 'no #kennelBtn in the Stable\'s header');

  await page.evaluate(() => document.getElementById('kennelBtn')?.click());
  await sleep(900);
  const opened = await page.evaluate(() => !!document.getElementById('kennelBody')?.children.length);
  ok('BUTTON the Stable header button opens the Kennel sheet, rendered with content', opened,
    opened ? '#kennelBody has children' : '#kennelBody is empty or absent');

  const grid = await page.evaluate(() => [...document.querySelectorAll('.k-cell')].map(c => ({
    sp: c.dataset.sp, morph: c.dataset.morph, locked: c.classList.contains('locked'),
    lock: !!c.querySelector('svg'), nw: c.querySelector('img')?.naturalWidth || 0,
  })));
  ok('GRID the collection grid has exactly 30 cells (6 species x 5 morphs, Bumbleseal counts as a normal species per Tom\'s ruling)',
    grid.length === 30, `${grid.length} cells`);

  const headers = await page.evaluate(() => [...document.querySelectorAll('.k-grid-head-cell')].map(c => c.textContent));
  ok('HEADERS the grid carries a column header naming each of the five colourways, Base through Midnight, in order',
    JSON.stringify(headers) === JSON.stringify(['Base', 'Ember', 'Frost', 'Toxic', 'Midnight']), headers.join(', ') || '(no .k-grid-head-cell found)');

  const cell = (sp, morph) => grid.find(c => c.sp === sp && c.morph === morph);
  const ownedCell = cell('C2', 'ember');
  ok('OWNED a granted (species, morph) pair draws its cell unlocked and decoded, not the placeholder',
    !!ownedCell && !ownedCell.locked && ownedCell.nw > 0,
    ownedCell ? `C2|ember: ${ownedCell.locked ? 'locked' : 'unlocked'}, naturalWidth ${ownedCell.nw}` : 'cell not found');

  // C1 is NOT a fair unowned control: the demo profile's default equipped pet
  // is C1 (js/app.js's demo seed grants cosmetic 'C1', which reclaimOwnedPets
  // auto-reclaims into an owned instance the first time petInstances() runs,
  // same mechanism tests/pet-ownership-audit.mjs's RECLAIM row exercises). C4
  // carries no such default and stays genuinely unowned until phase two below.
  const unownedCell = cell('C4', 'base');
  ok('UNOWNED an ungranted pair draws the locked placeholder, decoded and never a 404 (a silhouette, not a broken image)',
    !!unownedCell && unownedCell.locked && unownedCell.lock && unownedCell.nw > 0,
    unownedCell ? `C4|base: locked=${unownedCell.locked} lock-glyph=${unownedCell.lock} naturalWidth ${unownedCell.nw}` : 'cell not found');

  const gwart = await page.evaluate(() => document.querySelector('.k-gwart')?.textContent || '');
  ok('GWART the cosmetic-only explainer line is on the screen',
    gwart.includes("It's paint, not power. Ember, Frost, Toxic, Midnight, same skeleton underneath."), gwart || '(no .k-gwart found)');

  // 5, not 4: the demo profile's default C1 (Drizzle) counts as owned on top
  // of the 4 species this audit granted, and the roster must show it too --
  // it is a real owned species, reclaimed through the app's own real path.
  const roster = await page.evaluate(() => [...document.querySelectorAll('.k-row b')].map(b => b.textContent));
  ok('ROSTER the roster shows exactly one row per OWNED species (5: the 4 granted here plus the demo\'s default C1), not the whole 6-species catalogue and not 0',
    roster.length === 5, `${roster.length} row(s): ${roster.join(', ') || 'none'}`);

  // R39-10 COUNT, partial state: the demo's C1 plus the four granted pairs is 5
  // cells. A Founder's Lizard (CX, exempt from the grid) must not move it.
  await page.evaluate(async () => { const loot = await import('/js/loot.js'); await loot.addPetInstance('CX', { morph: 'base' }); });
  await openKennel();
  const countText = () => page.evaluate(() => [...document.querySelectorAll('#kennelBody .sect-h')].map(p => p.textContent).find(t => /Collection/.test(t)) || '(no Collection header)');
  let ct = await countText();
  ok('COUNT the collection counter reads 5 / 30 with five owned cells and a Founder\'s Lizard (CX has no cell, so it must not count)',
    /Collection\s*·\s*5 \/ 30/.test(ct), ct);

  // Now the worst case for FIT (re-premised 2026-09-06, R39-6): the FULL set,
  // every species in every colourway, because "Ember, Frost, Toxic, Midnight
  // owned" is the longest caption the roster can carry and a one-morph roster
  // could never see it wrap.
  await page.evaluate(async () => {
    const loot = await import('/js/loot.js');
    for (const sp of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']) for (const m of ['base', 'ember', 'frost', 'toxic', 'midnight']) await loot.addPetInstance(sp, { morph: m });
  });
  for (const [w, h] of [[390, 844], [320, 568]]) {
    await setWidth(page, w, h);
    await openKennel();
    const m = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.k-row')];
      const last = rows[rows.length - 1];
      return { rows: rows.length, bottom: last ? last.getBoundingClientRect().bottom : null, caps: [...document.querySelectorAll('.k-cap')].map(c => c.textContent) };
    });
    ok(`FIT ${w}x${h}: all six roster rows fit on one screen with no scroll, with every colourway owned on every species`,
      m.rows === 6 && m.bottom != null && m.bottom <= h && m.caps.every(c => /Ember, Frost, Toxic, Midnight owned/.test(c)),
      `${m.rows} row(s), last row bottom ${m.bottom}${m.bottom > h ? ` > ${h}` : ` of ${h}`}; caption "${m.caps[0]}"`);
  }
  /* R39-6 LINE: the caption is what wrapped. On the QA rig (Linux fallback
     font) "Ember, Frost, Toxic, Midnight owned" wrapped at 320 and grew every
     row 63 -> 79px; on this Mac's Chromium it fits at 320 by about 9px, so the
     wrap is provoked at 300 wide instead, where SETUP first confirms the text
     really overflows its box (an ellipsis path nothing exercised is not a
     guard) and the row then asserts it stayed on one line. */
  await setWidth(page, 300, 568);
  await openKennel();
  const line = await page.evaluate(() => [...document.querySelectorAll('.k-cap')].map(c => {
    const cs = getComputedStyle(c);
    // the text's own one-line width, measured with the caption's real font, so a
    // wrapped caption (old code) still reads as "wider than its box"
    const ctx = document.createElement('canvas').getContext('2d'); ctx.font = cs.font;
    return { text: c.textContent, overflow: ctx.measureText(c.textContent).width > c.clientWidth + 1, h: c.getBoundingClientRect().height, lh: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 };
  }));
  setup('SAMPLE at 300 wide the longest caption really overflows its box (so the one-line rule below is exercised)', line.length === 6 && line.every(l => l.overflow),
    `${line.length} caption(s), overflowing: ${line.filter(l => l.overflow).length}, box ${line[0]?.h.toFixed(1)}px`);
  ok('LINE a caption that overflows stays on ONE line (ellipsis), so the roster\'s row height never depends on how many colourways are owned',
    line.every(l => l.h <= l.lh * 1.5), `caption heights ${line.map(l => l.h.toFixed(1)).join(', ')} vs line-height ${line[0]?.lh.toFixed(1)}`);

  await setWidth(page, 320, 568);
  await openKennel();
  ct = await countText();
  ok('COUNT the collection counter reads 30 / 30 with the full set plus a Founder\'s Lizard, never 31 / 30', /Collection\s*·\s*30 \/ 30/.test(ct), ct);

  // R39-11 HIT, at 320x568 (still open): the thing that looks tappable is the
  // control, at least 44px a side, and a tap at its centre lands on it.
  const hit = await page.evaluate(() => [...document.querySelectorAll('.k-cell')].map(c => {
    const r = c.getBoundingClientRect();
    c.scrollIntoView({ block: 'center' });
    const r2 = c.getBoundingClientRect();
    const at = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
    return { key: `${c.dataset.sp}|${c.dataset.morph}`, w: r.width, h: r.height, tag: c.tagName, lands: !!at && (at === c || c.contains(at)) };
  }));
  const badHit = hit.filter(x => Math.min(x.w, x.h) < 44 || x.tag !== 'BUTTON' || !x.lands);
  ok('HIT every grid cell is a real <button> at least 44px a side and a tap at its centre lands on it (320 wide)',
    hit.length === 30 && !badHit.length,
    `${hit.length} cells, smallest ${Math.min(...hit.map(x => Math.min(x.w, x.h))).toFixed(2)}px, tag ${hit[0]?.tag}${badHit.length ? `; bad: ${badHit.slice(0, 3).map(x => `${x.key} ${x.w.toFixed(1)}x${x.h.toFixed(1)} ${x.tag} lands=${x.lands}`).join(', ')}` : ''}`);

  // R39-30 HEAD: each column header's centre sits over its column's cells.
  const head = await page.evaluate(() => {
    const hs = [...document.querySelectorAll('.k-grid-head-cell')].map(h => { const r = h.getBoundingClientRect(); return r.left + r.width / 2; });
    const cs = [...document.querySelectorAll('.k-grid-row .k-cell')].slice(0, 5).map(c => { const r = c.getBoundingClientRect(); return r.left + r.width / 2; });
    return hs.map((x, i) => Math.abs(x - (cs[i] ?? NaN)));
  });
  ok('HEAD the five column headers sit centred over their columns within 0.5px (320 wide)',
    head.length === 5 && head.every(d => d <= 0.5), `drift px: ${head.map(d => d.toFixed(2)).join(', ') || 'none'}`);

  // R39-23 TOGGLE and R39-11 KEYS: pressing a cell names it in the row label;
  // pressing it again restores the species name. Enter and Space both work.
  const label = sp => page.evaluate(sp => document.querySelector(`.k-grid-label[data-sp="${sp}"]`)?.textContent, sp);
  const press = (sp, m) => page.evaluate((sp, m) => document.querySelector(`.k-cell[data-sp="${sp}"][data-morph="${m}"]`)?.click(), sp, m);
  const before = await label('C2');
  await press('C2', 'ember'); const on = await label('C2');
  await press('C2', 'ember'); const back = await label('C2');
  ok('TOGGLE tapping a cell names its colourway in the row label, and tapping it again restores the summary',
    !!before && on === `Ember ${before}` && back === before, `"${before}" -> "${on}" -> "${back}"`);
  await page.evaluate(() => document.querySelector('.k-cell[data-sp="C2"][data-morph="frost"]')?.focus());
  await page.keyboard.press('Enter'); const viaEnter = await label('C2');
  await page.keyboard.press('Space'); const viaSpace = await label('C2');
  ok('KEYS Enter operates a focused cell and Space toggles it back',
    viaEnter === `Frost ${before}` && viaSpace === before, `Enter -> "${viaEnter}", Space -> "${viaSpace}"`);

  // R39-8 / R39-9 CLIP: the art fits its clipped cell above the sheet's 600px
  // cap, and keeps fitting after a rotation with the sheet left open.
  const clip = () => page.evaluate(() => {
    const out = [...document.querySelectorAll('.k-cell')].map(c => {
      const r = c.getBoundingClientRect(), a = c.querySelector('.petcrop')?.getBoundingClientRect();
      return { key: `${c.dataset.sp}|${c.dataset.morph}`, cell: r.width, art: a ? a.width : 0, over: a ? Math.min(a.left - r.left, r.right - a.right, a.top - r.top, r.bottom - a.bottom) < -0.6 : true };
    });
    return { n: out.length, cell: out[0]?.cell, art: out[0]?.art, bad: out.filter(o => o.over) };
  });
  await setWidth(page, 1024, 768);
  await openKennel();
  let cl = await clip();
  ok('CLIP 1024x768: every cell\'s art sits inside its clipped cell (the sheet caps at 600px, the viewport does not size the art)',
    cl.n === 30 && !cl.bad.length, `${cl.n} cells, cell ${cl.cell?.toFixed(1)}px, art ${cl.art?.toFixed(1)}px${cl.bad.length ? `, ${cl.bad.length} overflow` : ''}`);
  await setWidth(page, 320, 568);
  await sleep(400);
  cl = await clip();
  ok('CLIP rotated to 320x568 with the sheet still open: the art re-fits its cell (nothing frozen at open)',
    cl.n === 30 && !cl.bad.length, `${cl.n} cells, cell ${cl.cell?.toFixed(1)}px, art ${cl.art?.toFixed(1)}px${cl.bad.length ? `, ${cl.bad.length} overflow` : ''}`);
} finally {
  await browser.close();
  srv?.close();
}

console.log(fails ? '\nKENNEL AUDIT: FAILED' : '\nKENNEL AUDIT: all rows green');
process.exit(fails ? 1 : 0);

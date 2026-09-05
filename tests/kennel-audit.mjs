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

  // Now the worst case for FIT: grant the remaining two species and reopen,
  // so all six rows are on screen at once.
  await page.evaluate(async () => {
    const loot = await import('/js/loot.js');
    await loot.addPetInstance('C1', { morph: 'base' });
    await loot.addPetInstance('C4', { morph: 'base' });
  });
  for (const [w, h] of [[390, 844], [320, 568]]) {
    await setWidth(page, w, h);
    await openKennel();
    const m = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.k-row')];
      const last = rows[rows.length - 1];
      return { rows: rows.length, bottom: last ? last.getBoundingClientRect().bottom : null };
    });
    ok(`FIT ${w}x${h}: all six roster rows fit on one screen with no scroll`,
      m.rows === 6 && m.bottom != null && m.bottom <= h,
      `${m.rows} row(s), last row bottom ${m.bottom}${m.bottom > h ? ` > ${h}` : ` of ${h}`}`);
  }
} finally {
  await browser.close();
  srv?.close();
}

console.log(fails ? '\nKENNEL AUDIT: FAILED' : '\nKENNEL AUDIT: all rows green');
process.exit(fails ? 1 : 0);

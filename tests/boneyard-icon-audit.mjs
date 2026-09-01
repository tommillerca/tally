/* tests/boneyard-icon-audit.mjs — THE BONEYARD AND ITS MAP KEY DRAW THE SAME
 * PIXEL ART, AT WHOLE STEPS, AND IT ACTUALLY DECODES.
 *
 * WHY THIS EXISTS. v416 shipped the pixel-art batch and Tom came back with six
 * defects in one pass, five of which were the SAME mechanism wearing different
 * hats. pixCur(kind, s) snaps to 48/24/16 and returns null under 16, so a call
 * site that asks for a size which snaps DOWN silently gets smaller art than the
 * space reserved for it, and a call site under the floor silently gets the OLD
 * VECTOR next to a pixel map. Nothing went red, because nothing was looking:
 *   - the map key asked 20, which snaps to 16, and 20 was under crateIcon's own
 *     floor of 24, so the crate and the egg rows drew line-art vectors beside a
 *     pixel map ("legend doesnt have updated pixel art icons")
 *   - the `far` beacons ask 16, also under that floor, so distant crates and
 *     eggs fell back to vector ("some chests still dont have pixel art")
 *   - the mini-boss skull asked 17, snapped to 16, and sat in a 34px disc
 *     ("mini boss den scale up skill it's too small")
 *   - .leg-ico scaled the swatches by 0.82, rendering a 16px sprite at 13.1
 *     actual px: a FRACTIONAL downscale of art that only survives whole steps
 * A guard that only counted markers, or only measured boxes, would have passed
 * through every one of those.
 *
 * WHAT IT ASSERTS, and which direction is failure (anti-regression rule 11):
 *   CONTROL   the map drew spawn markers, mini markers and a 9-row key, and at
 *             least one of them served a real icons-pix PNG that decoded. This
 *             is the positive control: without it every row below passes on a
 *             blank screen or on a probe that is reading the wrong nodes, which
 *             is precisely how four guards went blind on 2026-08-19.
 *   DECODE    every pixel <img> on the map and in the key reports
 *             naturalWidth > 0. Failure is a BLANK TILE: an icon can measure a
 *             perfect 24x24 box while the PNG never loaded, so the box is not
 *             evidence and naturalWidth is.
 *   STEP      every pixel <img> renders at a whole 16 / 24 / 48, never in
 *             between. Failure is the fractional resample: this is the row that
 *             catches a reintroduced transform on a swatch or a marker.
 *   VECTOR    NO key row draws a vector. VECTOR_OK is empty as of 2026-08-21 and
 *             that emptiness is the assertion. Failure is EITHER direction on
 *             purpose: a type falling back to vector is the v416 bug returning,
 *             and an exemption added here has to carry a date and a reason.
 *             It held ['Herb patch'] until the day the food-find art was wired,
 *             and that exemption is exactly why five reports of "the herb marker
 *             is still the old art" all met a green audit. See the note on
 *             VECTOR_OK.
 *   MATCH     every icon in the key is byte-for-byte the same src, at the same
 *             rendered px, as the marker it claims to describe. Failure is
 *             either direction: a key showing vector icons for pixel markers is
 *             worse than no key at all.
 *   MINI      the mini-boss disc is not smaller than a loot disc and its skull
 *             renders at 24. Failure is DOWN. A marker that starts a fight was
 *             a smaller disc AND a slacker fill than a marker that pays coins.
 *   NAME      the rare spawn is called the same thing, character for character,
 *             on BOTH Boneyard surfaces: the "OUT THERE TODAY" card you see
 *             before the map opens, and the map key you see after. It was
 *             "Mystery Egg / rare spawn · walk to hatch a pet" on one and
 *             "Mystery egg / Rare: walk to hatch a pet" on the other, and since
 *             the intro card is destroyed the moment the map starts, a player
 *             never sees them side by side and neither did any screenshot.
 *             Both strings are read out of the rendered DOM. PROVEN RED twice
 *             on 2026-08-20, each in a throwaway tree, with all five CONTROL
 *             rows green in both runs:
 *               revert the map key row to 'Mystery egg'  -> 2 red
 *                 ("the map key calls it", "the two surfaces agree"),
 *                 CONTROL 36 pixel imgs / 36 decoded
 *               revert the intro card note to 'rare spawn · walk to hatch a pet'
 *                 -> 1 red ("both describe it as"),
 *                 CONTROL 37 pixel imgs / 37 decoded
 *
 * PROVE-RED, measured 2026-08-20 against origin/main at v417 (36ea2c6), which
 * has the same map and the same spawn field. FIVE rows go red and all four
 * CONTROL rows stay green (53 pixel imgs, 53 decoded), so the reds are real and
 * not an empty sample:
 *   STEP    "bone.png @13.1px, coin.png @13.1px"  (the .leg-ico 0.82 scale)
 *   VECTOR  "vector rows: Buried crate, Herb patch, Mystery egg"
 *   MATCH   "Bone cache: key @13.1px, map @24px | Coin pile: key @13.1px, map
 *           @24px | Buried crate: key draws a vector, map draws
 *           assets/icons-pix/crate.png | Mystery egg: key draws a vector"
 *   MINI    "mini 34px, loot 42px" and "16px" for the skull
 * On this branch the same run is all green at mini 42px, loot 42px, skull 24px,
 * every pixel icon at 24, and 5 key rows agreeing with the map.
 *
 * PROVE-RED, 2026-08-21, for the Herb patch's pixel art. Throwaway `cp -R` of
 * this tree with its .git removed, exit code read from a FILE, never a pipe:
 *   js/app.js spawnIcon's herbs arm put back to `bhIcon('garden-seed', s)`
 *   -> 2 red, exit 1, with all six CONTROL rows green (63 pixel imgs, 63
 *      decoded; the egg sample present, candidate 2 of 8):
 *        VECTOR "vector rows: Herb patch (expected exactly: none)"
 *        MATCH  "Herb patch: key draws a vector, map draws
 *                assets/icons-pix/herbs.png"
 *   Unmutated, the same run is exit 0 with "6 rows agree with the map".
 *
 * THE EGG SAMPLE IS TAKEN FROM THE RENDERED MAP, NOT THE GENERATOR, and there
 * are TWO dice rolls between a Mystery Egg existing and one being drawn. The
 * note at the eggSpots block has the mechanism and the measurement. When an
 * instance has no placeable rare, the Mystery Egg row is dropped from EXPECT and
 * declared UNPROVEN by name, so this suite can exit 97 (did not fully run)
 * instead of exiting 1 with an art-regression message about a placement
 * outcome. It is never reported as a pass.
 *
 * AND SO IS THE MINI-BOSS SAMPLE, as of 2026-09-01. Where this suite stands is
 * chosen for the EGG, and that choice moves the mini field with it: standing on
 * the nearest rare put every mini-boss either outside placeWalkable's halo or on
 * ground the snap query could not answer for, so the map drew none and
 * "CONTROL the map drew mini-boss markers" killed the run on `sample did not
 * hold` with nothing printed. The walk now asks the rendered map for BOTH
 * samples before it settles, and an instance that can offer neither reports the
 * mini rows UNPROVEN by name rather than as an art regression. The measurement
 * is at the walk.
 *
 * AND THE BUFFERED EVIDENCE IS PRINTED EVEN WHEN THE RUN DIES. See the finally.
 *
 * Serves the tree by default and NEVER defaults to production. Pass a URL as
 * argv[2] only to point it somewhere deliberately.
 * Usage: node tests/boneyard-icon-audit.mjs      (exits non-zero on failure)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, unproven, unprovenReport, exitFor } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STEPS = [16, 24, 48];
/* The key row -> what the map draws for it. Pinned by FILENAME on purpose: the
   drift between these two surfaces IS the bug, so a rename has to be made in
   both places and re-measured, not silently absorbed. */
const EXPECT = {
  'Bone cache':  'assets/icons-pix/bone.png',
  'Coin pile':   'assets/icons-pix/coin.png',
  'Buried crate':'assets/icons-pix/crate.png',
  'Herb patch':  'assets/icons-pix/herbs.png',
  'Mystery Egg': 'assets/icons-pix/egg-basic.png',
  'Mini-boss':   'assets/icons-pix/badge-skull.png',
};
/* THE RARE SPAWN'S NAME AND LINE, as the player must read them on BOTH Boneyard
   surfaces. Pinned as literals on purpose: importing js/app.js's MYSTERY_EGG
   would compare the constant to itself and pass through any rename. */
const EGG_NAME = 'Mystery Egg';
const EGG_DESC = 'Rare: walk to hatch a pet';
/* NO ROW IS ALLOWED TO BE A VECTOR ANY MORE, and the empty list is the point.
   This carried `['Herb patch']` with a written reason ("there is no pixel
   drawing for a food find yet") from the day the row was authored until
   2026-08-21. The art existed the whole time, unclaimed on a rescue branch, and
   THIS EXEMPTION IS WHY NOBODY NOTICED: the only guard that looks at that pixel
   was told to expect the old vector, so it stayed green through five separate
   reports from Tom that the herb marker was still the old art. A guard holding a
   superseded instruction does not merely fail to catch the bug, it certifies it.
   Kept as an empty list rather than deleted so the row still reads as "the set
   of allowed vectors", and so the next exemption has to be written down here
   with a date and a reason instead of being buried in a boolean. */
const VECTOR_OK = [];
/* Cam's drawn art. Never pixel art, never counted as a pixel icon here. */
const CAM = /assets\/(brand|bh)\//;

const out = [];
let fails = 0;
const ok = (m, cond, detail = '') => {
  if (cond) out.push(`ok   ${m}${detail ? '  ' + detail : ''}`);
  else { fails++; out.push(`FAIL ${m}${detail ? '  ' + detail : ''}`); }
};

const srv = process.argv[2] ? null : await serveTree(ROOT);
const base = process.argv[2] || srv.url;
console.log(`URL UNDER TEST: ${base}`);

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let s;
try {
  await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
  await page.setViewport({ width: 440, height: 956, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await seed(page, {});
  /* WHERE THE PLAYER STANDS IS CHOSEN, NOT ASSUMED, and this row is why.
     The Mystery Egg is an 8% roll per cell per 45-minute instance
     (js/hunt.js: `if (rr() < 0.08)`, seeded on date:cx:cy:rare:i<N>), so a
     fixed pin gets an egg on the map in some instances and not in others. That
     is exactly what happened on 2026-08-21: this audit blocked a release gate
     with "no map marker draws assets/icons-pix/egg-basic.png", then passed four
     times in a row half an hour later. Nothing was broken either time. A guard
     whose sample is a dice roll reports the weather, not the code.
     So: ask the app's OWN generator which nearby cell has an egg in the
     instance that is running right now, and stand there. Deterministic given
     the clock, and no app change: spawnsForRoute is a pure function.
     If no cell within range has one, the fixed pin is kept and EGG-PRESENT
     below fails loudly rather than the MATCH row failing for a reason that
     reads like an art regression. */
  const HOME = { latitude: 49.2827, longitude: -123.1207 };
  /* EVERY CANDIDATE, NOT THE NEAREST ONE, and the second dice roll is why.
     The note above is still true and still necessary; it was just not
     sufficient. Asking the generator where an egg is answers the FIRST roll (an
     8% chance per cell per 45-minute instance) and the app then applies a
     SECOND, independent veto that the generator knows nothing about:
     app.js placeWalkable() hides any spawn whose anchor snaps to no walkable
     feature within SNAP_MAX_M (water, a backyard, a rooftop), so a perfectly
     real egg is simply never drawn. Measured on 2026-08-21 at v421: the nearest
     rare was 143 m away, standing on it put it at 0 m and inside NEAR_M, and the
     map drew 43 spawn markers with no egg among them. This audit read that as
     "no map marker draws assets/icons-pix/egg-basic.png" and blocked on it,
     which is an art failure message for a placement outcome.
     So collect the whole ranked list and try them in turn, and let the RENDERED
     MAP decide when a sample has been found. */
  const eggSpots = await page.evaluate(async (home) => {
    const hunt = await import('./js/hunt.js');
    /* LOCAL, not UTC (godmode.js's localDay says why). The spawn field is
       DATE-SEEDED, so a UTC date asks the generator for a different day than the
       map is drawing, and the key then advertises pieces no marker carries. */
    const date = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());
    /* stand ON an egg's own cell so it lands inside NEAR_M and draws as a
       full-density marker rather than a dimmed far beacon */
    return hunt.spawnsForRoute(date, home.latitude, home.longitude)
      .filter(sp => sp.type === 'rare')
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 8)
      .map(e => ({ latitude: e.lat, longitude: e.lng, was: e.dist, id: e.id }));
  }, HOME);
  await page.setGeolocation(eggSpots.length ? { latitude: eggSpots[0].latitude, longitude: eggSpots[0].longitude } : HOME);
  await page.evaluate(() => { location.hash = '#/today'; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await page.evaluate(() => { location.hash = '#/boneyard'; });
  await sleep(1500);
  /* READ THE INTRO CARD FIRST. "OUT THERE TODAY" lives in #mapIntro and is torn
     out the moment the map opens, so a player sees it or the map key but never
     both, which is exactly why the two drifted unnoticed. This has to happen
     before the click below or there is nothing left to read. */
  const intro = await page.evaluate(() => [...document.querySelectorAll('#mapIntro .legend-row')].map(r => ({
    name: (r.querySelector('b')?.textContent || '').trim(),
    note: (r.querySelector('.note')?.textContent || '').replace(/^\s*·\s*/, '').trim(),
  })));
  await page.evaluate(() => { const b = document.querySelector('#mapStart'); if (b && b.offsetParent) b.click(); });
  await sleep(13000);

  /* WALK THE CANDIDATES UNTIL THE MAP ITSELF DRAWS ONE. The authority on
     "is there an egg to compare" is the rendered marker, never the generator:
     placeWalkable has the last word and only the map knows what it decided.
     Retargeting is a setGeolocation and a wait, because refreshSpawns runs off
     the position watch on a 5s tick, so this costs one boot, not eight. */
  /* AND THE MINI-BOSS IS THE SECOND SAMPLE, hunted the same way, because the
     spot chosen for the egg decides the mini field too. Measured 2026-09-01:
     the nearest rare was 1631 m from the fixed pin, and standing on it left
     minisNear returning FOUR minis whose nearest was 960 m away, where the pin
     itself has one at 417 m. Three of the four projected past placeWalkable's
     300px halo (to 1569px below the canvas) and the fourth answered
     queryRenderedFeatures with zero features, so the app vetoed every one of
     them and drew no mini disc at all. The model was healthy the whole time.
     "CONTROL the map drew mini-boss markers" then killed the run on `sample did
     not hold`, which is a broken-app message for a standing point this suite
     chose itself. Seven of the eight rare candidates that day had a mini inside
     500 m, so the premise holds as soon as the walk asks for it. */
  const onMap = () => page.evaluate(() => ({
    egg: [...document.querySelectorAll('#mapStage .map-spawn.maplibregl-marker')]
      .some(el => !el.classList.contains('far')
        && [...el.querySelectorAll('img')].some(i => /egg-basic\.png$/.test(i.getAttribute('src') || ''))),
    /* .maplibregl-marker deliberately: #mapLegend lives inside #mapStage and its
       key row wears .map-mini-mark too, and only a real marker carries this. */
    mini: document.querySelectorAll('#mapStage .map-mini-mark.maplibregl-marker').length > 0,
  }));
  const score = g => (g.egg ? 1 : 0) + (g.mini ? 1 : 0);
  let at = eggSpots[0] || null;              // where the player is standing right now
  let eggUsed = at, eggTried = eggSpots.length ? 1 : 0, drawn = { egg: false, mini: false };
  const stand = async (spot) => {
    at = spot;
    await page.setGeolocation({ latitude: spot.latitude, longitude: spot.longitude });
    await sleep(6500);
  };
  for (let i = 0; i < eggSpots.length; i++) {
    if (i) await stand(eggSpots[i]);
    const here = await onMap();
    if (score(here) > score(drawn)) { drawn = here; eggUsed = eggSpots[i]; eggTried = i + 1; }
    if (here.egg && here.mini) break;
  }
  /* The walk can end PAST the best spot it found, and every row below reads the
     map as it stands now, so go back and re-measure there rather than grading a
     spot the walk already rejected. */
  if (eggUsed && at !== eggUsed) { await stand(eggUsed); drawn = await onMap(); }
  const eggDrawn = drawn.egg;
  /* AN UNPLACEABLE INSTANCE IS UNPROVEN, NOT A PASS AND NOT AN ART FAILURE.
     Dropping the row from EXPECT is what stops MATCH reporting a placement
     outcome as a regression; naming it here is what stops the drop being a
     silent skip. exitFor turns it into 97, which the release gate reads as
     "this did not run", so nothing is certified on an empty sample. */
  if (!eggDrawn) {
    delete EXPECT['Mystery Egg'];
    unproven('MATCH    the Mystery Egg key row against its marker',
      `none of the ${eggSpots.length} rare spawn(s) in this 45-minute instance survived the app's own `
      + 'placeWalkable veto, so the map drew no egg to compare the key against');
  }
  /* SAME RULE FOR THE MINI, and for the same reason: which minis are drawable
     is a property of where this suite chose to stand, not of the art. Naming
     all three rows is what stops the drop being a silent skip. */
  if (!drawn.mini) {
    delete EXPECT['Mini-boss'];
    const why = `no standing point among the ${eggSpots.length} candidate(s) walked had a mini-boss the app `
      + "would draw: minisNear generates them, and placeWalkable's halo and walkability snap vetoed every one";
    unproven('MATCH    the Mini-boss key row against its marker', why);
    unproven('MINI     the mini-boss disc is not smaller than a loot disc', 'same');
    unproven('MINI     the mini-boss skull renders at 24', 'same');
  }

  // the key starts hidden; it is the same markup either way, so unhide it rather
  // than hunting the button, which has moved twice
  await page.evaluate(() => { const l = document.querySelector('#mapLegend'); if (l) l.hidden = false; });
  await sleep(600);

  s = await page.evaluate(() => {
    const px = n => Math.round(n * 10) / 10;
    const icons = el => [...el.querySelectorAll('img')].map(i => ({
      src: i.getAttribute('src'), nw: i.naturalWidth,
      rw: px(i.getBoundingClientRect().width),
    })).concat([...el.querySelectorAll('svg')].map(v => ({
      src: null, nw: null, rw: px(v.getBoundingClientRect().width),
    })));
    const stage = document.querySelector('#mapStage');
    const disc = sel => [...stage.querySelectorAll(`${sel}.maplibregl-marker`)].map(el => ({
      w: px(el.getBoundingClientRect().width),
      far: el.classList.contains('far'),
      icons: icons(el),
    }));
    return {
      spawns: disc('.map-spawn'),
      minis: disc('.map-mini-mark'),
      legend: [...document.querySelectorAll('#mapLegend .leg-row')].map(r => ({
        name: (r.querySelector('b') || {}).textContent || '',
        desc: ((r.querySelector('small') || {}).textContent || '').trim(),
        w: px((r.querySelector('.leg-ico').firstElementChild || r).getBoundingClientRect().width),
        icons: icons(r.querySelector('.leg-ico')),
      })),
    };
  });

  /* ---- CONTROL first. Every row below reads from this sample. ---- */
  /* THE SAMPLE THIS RUN ACTUALLY GOT. Without this the MATCH row's egg failure
     is ambiguous: it reads the same whether the art regressed or whether the
     instance simply had no egg in it. */
  if (eggDrawn) {
    ok('CONTROL  an egg is DRAWN on the map to compare, so the MATCH row has a sample',
      true, `stood on ${eggUsed.id} (${Math.round(eggUsed.was)}m from the fixed pin), `
        + `candidate ${eggTried} of ${eggSpots.length}`);
  } else {
    out.push(`UNPRV CONTROL  no egg is drawn on the map: ${eggSpots.length} rare spawn(s) generated, `
      + 'all vetoed by placeWalkable. The Mystery Egg row is UNGRADED this run, not passed.');
  }

  ok('CONTROL  the map drew spawn markers', s.spawns.length > 0, `${s.spawns.length} spawn discs`);
  if (drawn.mini) {
    ok('CONTROL  the map drew mini-boss markers', s.minis.length > 0, `${s.minis.length} mini discs`);
  } else {
    out.push('UNPRV CONTROL  the map drew no mini-boss marker anywhere the walk stood, so the three '
      + 'mini rows are UNGRADED this run, not passed.');
  }
  ok('CONTROL  the map key rendered all nine rows', s.legend.length === 9, `${s.legend.length} rows`);
  /* POSITIVE CONTROL. Rows below pass for free if the probe is reading nodes
     that hold no pixel art at all, which is failure mode 2 and 4 of
     guard-hygiene-lint. Require that a real icons-pix PNG was seen AND decoded. */
  const allIcons = [...s.spawns, ...s.minis, ...s.legend].flatMap(x => x.icons);
  const pixIcons = allIcons.filter(i => i.src && !CAM.test(i.src));
  ok('CONTROL  the sample actually contains decoded pixel art (not just boxes)',
    pixIcons.length > 0 && pixIcons.some(i => i.nw > 0),
    `${pixIcons.length} pixel imgs, ${pixIcons.filter(i => i.nw > 0).length} decoded`);
  ok('CONTROL  the Boneyard intro card rendered its rows', intro.length > 0,
    `${intro.length} rows: ${intro.map(r => r.name).join(', ') || 'none'}`);
  if (fails) throw new Error('sample did not hold');

  /* ---- NAME. The rare spawn is called the SAME THING on both surfaces.
     Tom, 2026-08-20: "you call mystery eggs rare spawns on the map but different
     in the legend they should be called mystery eggs in both places". The map
     key said "Mystery egg / Rare: walk to hatch a pet" and the intro card said
     "Mystery Egg / rare spawn · walk to hatch a pet": different casing AND
     different phrasing for one marker. Both are read out of the rendered DOM,
     not out of the source, so this is the string the player actually gets. ---- */
  const introEgg = intro.find(r => /egg/i.test(r.name));
  const keyEgg = s.legend.map(r => ({ name: r.name.trim() })).find(r => /egg/i.test(r.name));
  ok('NAME     both Boneyard surfaces name the rare spawn, so there is something to compare',
    !!introEgg && !!keyEgg, `intro "${introEgg?.name ?? 'MISSING'}", key "${keyEgg?.name ?? 'MISSING'}"`);
  ok(`NAME     the map key calls it "${EGG_NAME}"`, keyEgg?.name === EGG_NAME, `got "${keyEgg?.name}"`);
  ok(`NAME     the intro card calls it "${EGG_NAME}"`, introEgg?.name === EGG_NAME, `got "${introEgg?.name}"`);
  ok('NAME     the two surfaces agree, character for character',
    !!introEgg && introEgg.name === keyEgg?.name, `intro "${introEgg?.name}" vs key "${keyEgg?.name}"`);
  ok(`NAME     both describe it as "${EGG_DESC}"`,
    introEgg?.note === EGG_DESC && s.legend.find(r => /egg/i.test(r.name))?.desc === EGG_DESC,
    `intro "${introEgg?.note}" vs key "${s.legend.find(r => /egg/i.test(r.name))?.desc}"`);

  /* ---- DECODE. A perfect box over a PNG that never loaded. ---- */
  const blank = pixIcons.filter(i => !(i.nw > 0));
  ok('DECODE   every pixel icon reports naturalWidth > 0', blank.length === 0,
    blank.length ? blank.map(i => i.src).join(', ') : `${pixIcons.length} icons decoded`);

  /* ---- STEP. Whole steps only: the fractional-resample row. ---- */
  const offStep = pixIcons.filter(i => !STEPS.includes(i.rw));
  ok('STEP     every pixel icon renders at a whole 16 / 24 / 48',
    offStep.length === 0,
    offStep.length ? offStep.map(i => `${i.src.split('/').pop()} @${i.rw}px`).join(', ')
      : `sizes seen: ${[...new Set(pixIcons.map(i => i.rw))].sort((a, b) => a - b).join(', ')}`);

  /* ---- VECTOR. Failure in EITHER direction.
     "Drawing a vector" means the row has NO image at all, not merely that an
     <svg> appears in it. The three den rows each carry Cam's tombstone PNG plus
     one or two SKULL svgs, and those skulls are vector ON PURPOSE: they are
     passed a `currentColor` tint and pixel art cannot be recoloured, which is
     the rule badgePixHtml documents. Counting any-svg-present put all three den
     rows in this list and made the row red on healthy code. ---- */
  const vectorRows = s.legend.filter(r => !r.icons.some(i => i.src)).map(r => r.name.trim());
  ok('VECTOR   no key row draws a vector where pixel art exists',
    vectorRows.length === VECTOR_OK.length && VECTOR_OK.every(n => vectorRows.includes(n)),
    `vector rows: ${vectorRows.join(', ') || 'none'} (expected exactly: ${VECTOR_OK.join(', ') || 'none'})`);

  /* ---- MATCH. The key is the marker, or it is a lie. ---- */
  const mapSrcs = new Map();
  for (const d of [...s.spawns, ...s.minis]) {
    for (const i of d.icons) if (i.src && !CAM.test(i.src) && !d.far) mapSrcs.set(i.src, i.rw);
  }
  const drift = [];
  for (const r of s.legend) {
    const want = EXPECT[r.name.trim()];
    if (!want) continue;                        // the three den rows are Cam's art
    const got = r.icons.find(i => i.src);
    if (!got) { drift.push(`${r.name.trim()}: key draws a vector, map draws ${want}`); continue; }
    if (got.src !== want) { drift.push(`${r.name.trim()}: key has ${got.src}, expected ${want}`); continue; }
    // and the map really is drawing that file, at the same rendered size
    if (!mapSrcs.has(want)) { drift.push(`${r.name.trim()}: no map marker draws ${want}`); continue; }
    if (mapSrcs.get(want) !== got.rw) drift.push(`${r.name.trim()}: key @${got.rw}px, map @${mapSrcs.get(want)}px`);
  }
  ok('MATCH    every key icon is the same file at the same px as its marker',
    drift.length === 0,
    drift.length ? drift.join(' | ') : `${Object.keys(EXPECT).length} rows agree with the map`);

  /* ---- MINI. Failure is DOWN. Declared UNPROVEN above when the map drew no
     mini, because Math.min of an empty set is Infinity and Math.max of one is
     -Infinity, so this block does not merely go red on an empty sample, it goes
     GREEN on it. ---- */
  if (drawn.mini) {
    const spawnW = Math.max(...s.spawns.filter(d => !d.far).map(d => d.w));
    const miniW = Math.min(...s.minis.map(d => d.w));
    ok('MINI     the mini-boss disc is not smaller than a loot disc',
      miniW >= spawnW, `mini ${miniW}px, loot ${spawnW}px`);
    const skulls = s.minis.flatMap(d => d.icons).filter(i => i.src);
    ok('MINI     the mini-boss skull renders at 24',
      skulls.length > 0 && skulls.every(i => i.rw === 24),
      skulls.length ? `${[...new Set(skulls.map(i => i.rw))].join(', ')}px` : 'no skull icons found');
  }
} finally {
  await browser.close().catch(() => {});
  if (srv) srv.close();
  /* PRINT THE EVIDENCE EVEN WHEN THE RUN DIES. Every row is buffered into `out`
     and printed at the end, and the CONTROL block throws BEFORE that print, so
     the one failure mode that stops the suite was also the one that showed
     nobody which row failed: triaging the 2026-09-01 red meant patching a copy
     of this file just to see the line it had already written. Printing here
     covers any throw, not only that one. */
  console.log(out.join('\n'));
}
unprovenReport('boneyard-icon-audit.mjs', null);
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(exitFor(fails));

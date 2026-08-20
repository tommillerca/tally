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
 *   VECTOR    `herbs` is the ONLY spawn still drawing a vector. Failure is
 *             EITHER direction on purpose. A new type falling back to vector is
 *             the v416 bug returning; and the day someone draws the food-find
 *             icon that the Herb patch is waiting on, this row goes red and
 *             tells them to wire it and delete the exemption, instead of the
 *             asset sitting on disk unused.
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
 * Serves the tree by default and NEVER defaults to production. Pass a URL as
 * argv[2] only to point it somewhere deliberately.
 * Usage: node tests/boneyard-icon-audit.mjs      (exits non-zero on failure)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STEPS = [16, 24, 48];
/* The key row -> what the map draws for it. Pinned by FILENAME on purpose: the
   drift between these two surfaces IS the bug, so a rename has to be made in
   both places and re-measured, not silently absorbed. */
const EXPECT = {
  'Bone cache':  'assets/icons-pix/bone.png',
  'Coin pile':   'assets/icons-pix/coin.png',
  'Buried crate':'assets/icons-pix/crate.png',
  'Mystery Egg': 'assets/icons-pix/egg-basic.png',
  'Mini-boss':   'assets/icons-pix/badge-skull.png',
};
/* THE RARE SPAWN'S NAME AND LINE, as the player must read them on BOTH Boneyard
   surfaces. Pinned as literals on purpose: importing js/app.js's MYSTERY_EGG
   would compare the constant to itself and pass through any rename. */
const EGG_NAME = 'Mystery Egg';
const EGG_DESC = 'Rare: walk to hatch a pet';
/* THE ONE ROW ALLOWED TO BE A VECTOR, and the reason, so nobody has to go
   digging: there is no pixel drawing for a food find yet. It cannot borrow one
   of the seven ingredient icons because the spawn does not know which
   ingredient it carries until you collect it. */
const VECTOR_OK = ['Herb patch'];
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
  await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });
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
  ok('CONTROL  the map drew spawn markers', s.spawns.length > 0, `${s.spawns.length} spawn discs`);
  ok('CONTROL  the map drew mini-boss markers', s.minis.length > 0, `${s.minis.length} mini discs`);
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
  ok('VECTOR   the Herb patch is the only key row still drawing a vector',
    vectorRows.length === VECTOR_OK.length && VECTOR_OK.every(n => vectorRows.includes(n)),
    `vector rows: ${vectorRows.join(', ') || 'none'} (expected exactly: ${VECTOR_OK.join(', ')})`);

  /* ---- MATCH. The key is the marker, or it is a lie. ---- */
  const mapSrcs = new Map();
  for (const d of [...s.spawns, ...s.minis]) {
    for (const i of d.icons) if (i.src && !CAM.test(i.src) && !d.far) mapSrcs.set(i.src, i.rw);
  }
  const drift = [];
  for (const r of s.legend) {
    const want = EXPECT[r.name.trim()];
    if (!want) continue;                        // dens are Cam's art; Herb patch is VECTOR_OK
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

  /* ---- MINI. Failure is DOWN. ---- */
  const spawnW = Math.max(...s.spawns.filter(d => !d.far).map(d => d.w));
  const miniW = Math.min(...s.minis.map(d => d.w));
  ok('MINI     the mini-boss disc is not smaller than a loot disc',
    miniW >= spawnW, `mini ${miniW}px, loot ${spawnW}px`);
  const skulls = s.minis.flatMap(d => d.icons).filter(i => i.src);
  ok('MINI     the mini-boss skull renders at 24',
    skulls.length > 0 && skulls.every(i => i.rw === 24),
    skulls.length ? `${[...new Set(skulls.map(i => i.rw))].join(', ')}px` : 'no skull icons found');
} finally {
  await browser.close().catch(() => {});
  if (srv) srv.close();
}

console.log(out.join('\n'));
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);

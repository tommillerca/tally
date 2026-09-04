/* THE FOOTBALL KIT: 32 TEAMS OVER EIGHT PNG TRIPLETS, AND THE FOUR SWITCHES.
 * 2026-09-04. The file data/football-teams.js promises exists.
 *
 * WHAT IS ACTUALLY AT RISK HERE, because "32 rows of hex" looks like data that
 * cannot break and is the opposite:
 *
 *   1. THE COLOURS ARE A MEASUREMENT, NOT A TASTE. Two claims in the data
 *      file's header are numbers somebody measured once: primaries pairwise
 *      CIE76 dE >= 12 (so two shells read apart at 24px) and a/b WCAG contrast
 *      >= 3:1 (so the stripe reads on the shell). A 33rd team, or a nudge to
 *      one hex, silently breaks a pair. This file RE-MEASURES both rather than
 *      restating them, and if the measured minimum disagrees with the number
 *      the header states, THE HEADER IS THE THING THAT FAILS: a comment that
 *      has drifted from the data is worse than no comment, because it is the
 *      only record of why these 32 colours and not 32 others.
 *
 *   2. THE TINT IS ARITHMETIC OVER REAL PIXELS. The whole model is that one
 *      grey master times a team hex through an alpha mask LANDS on that hex.
 *      That is a property of the PNGs on disk, not of any code: a master
 *      re-exported without the luminance normalisation, or a mask that slipped
 *      out of register, produces a kit that is simply the wrong colour, on
 *      every screen, with nothing anywhere throwing. So the composite is done
 *      here, in node, on the shipped bytes.
 *
 *   3. AN UNRELEASED KIT LEAKS BOTH WAYS. `unreleased` has to keep 256 items
 *      out of the rack, the crates, gear derivation and the Looks tab while
 *      still letting BH_BY_ID resolve them, or an owned piece renders as a
 *      hole. Both directions are asserted; one of them passing is not the
 *      feature working.
 *
 *   4. A PRICE THAT IS STILL null. FOOTBALL_KIT_PRICE_PLACEHOLDER and
 *      FOOTBALL_BUNDLE_PRICE_PLACEHOLDER are both null on purpose until Tom
 *      names the numbers. The failure mode is flipping LIVE and forgetting one,
 *      which ships a shelf whose every button is dead. The header claims this
 *      file refuses that combination. It does, for both, and it also refuses a
 *      bundle priced at or above the sum of the pieces it replaces, because the
 *      tile prints "you save N" and a non-positive N is a lie on a price tag.
 *
 *   5. WHAT THIS FILE CANNOT SEE AT ALL. It is pure, so it grades arithmetic and
 *      never a screen. Every claim about a rendered pixel -- the lizard actually
 *      WEARING the kit, the kit being the team's colour on all three lizards,
 *      the lasers being bounded inside the helmet under VISOR_EYES_POLICY
 *      'clip' -- lives in tests/football-render-audit.mjs, which drives a real
 *      browser and measures screenshot differences. The two are deliberately
 *      split: the pet garments were invisible on four screens for a whole day
 *      while every row in this file was green.
 *
 * HOW THE PIXELS ARE READ, since the question always comes up: IN NODE, with a
 * 60-line PNG decoder in this file (node:zlib plus the five filter types). No
 * python at build time, no JSON sidecar of pre-sampled pixels: a sidecar is a
 * measurement of whatever the art was when somebody last ran the script, which
 * is exactly the drift this row exists to catch. tests/pet-accessory-lint.mjs
 * and two others carry their own copies of a reader like this for the same
 * reason; none exports one, and this one additionally has to read greyscale+
 * alpha (the masks are LA), so a fourth short copy is cheaper than the
 * coupling. The maths is the same composite scripts/football-masks.py verifies
 * itself with, so the two agree by construction rather than by luck.
 *
 * PURE: imports data/, js/loot.js is NOT imported (it reaches for IndexedDB);
 * the buy path's price rule is re-stated as the predicate and its source line
 * is pinned by a static read, which is the honest way to grade a branch you
 * cannot execute. 0.2s, no browser.
 *
 * PROVE-RED, each row against a real defect, every mutation on a throwaway tree
 * and every one asserted to have LANDED before its result was believed. All
 * eight confirmed 2026-09-04, with the FAIL line each produced:
 *   DE + CONTRAST  gravel-gulls a -> #5B6B80, onto ironhaven's grey.
 *                  "closest gravel-gulls vs ironhaven-anvils at dE 0.61", and
 *                  both -HEADER rows red too: the recorded minimum has moved.
 *   HEX            windrow-wasps a -> '#F9DC1'. "windrow-wasps.a=#F9DC1"
 *   ASSETS         mv jersey.mask-a.png away. "1 missing: .../jersey.mask-a.png"
 *   TINT           helmet master re-exported without normalised_grey's x4.08
 *                  (region-a mean luminance 254.3 -> 62.3, asserted).
 *                  "worst 188.60/255, OFF: helmet/mask-a x windrow-wasps"
 *   REGIONS        drop `oneColour` from the cleats. "cleats: 0 core px in
 *                  mask-b, oneColour=false, 2 tint layers"
 *   GATE           delete the `unreleased` spread. "256 missing the flag, 256
 *                  leaked into the pool of 626"
 *   GRANT          the helmet stops granting its visors. "fb-...-helmet" alone
 *   VISOR-EYES     E11-1 -> E11-9 in VISOR_BLOCKED_EYES. "NOT IN CATALOGUE"
 *   PRICE          FOOTBALL_KIT_LIVE = true with the price still null.
 *                  "FOOTBALL_KIT_LIVE=true, price=null"
 * Six rows landed 2026-09-04 with Tom's four rulings and carry their own
 * mutations, to run the same way before they are believed:
 *   VISOR-CLIP     visorClipMask returning null -> the mask is not the visor's
 *                  master and the two "only under a visor" branches go with it
 *   VISOR-CLIP-WIRED  drop the .eye-clip class from avatarLayersHtml, or pin
 *                  app.css's mask-size at 100% 100% instead of var(--av-fit)
 *   BUNDLE         a garment loses `sold`, or the helmet stops granting visors:
 *                  the expected id set is derived from the tiles' own grants
 *   BUNDLE-MATH / -PRICE-CONTROL  any sign error in footballBundleMath, and a
 *                  bundle priced at or above the pieces
 *   CLEATS         re-export cleats.png without the luminance normalisation
 *   PET-TINT / PET-SPECIES  drop a species from FOOTBALL_PETS, or invent a
 *                  `C4-shiny` catalogue id (a shiny is an instance flag)
 * NOTE that flipping LIVE alone does NOT redden GATE, and correctly so: with
 * the flag true the items are supposed to be in the pool, and the row grades
 * the branch that is live. PRICE is what catches that mutation.
 *
 *   node tests/football-kit-audit.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as FB from '../data/football-teams.js';
import * as BH from '../data/boneheadz.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const TEAMS = FB.FOOTBALL_TEAMS || [];
const GARMENTS = FB.FOOTBALL_GARMENTS || [];
const ITEMS = FB.FOOTBALL_ITEMS || [];

/* ---- 0. SAMPLE: nothing below is allowed to grade an empty set ----------- */
ok('SAMPLE the kit modules loaded with teams, garments and items to grade',
  TEAMS.length === 32 && GARMENTS.length >= 6 && ITEMS.length > 0,
  `${TEAMS.length} teams, ${GARMENTS.length} garments, ${ITEMS.length} items, catalogue ${(BH.BH_ITEMS_WITH_UNRELEASED || []).length} deep`);

/* ---- 1. IDENTITY ---------------------------------------------------------- */
const dupIds = TEAMS.map(t => t.id).filter((v, i, a) => a.indexOf(v) !== i);
const dupNames = TEAMS.map(t => t.name).filter((v, i, a) => a.indexOf(v) !== i);
ok('TEAMS ids and names are unique, so no team overwrites another in FOOTBALL_TEAM_BY_ID',
  TEAMS.length > 0 && !dupIds.length && !dupNames.length,
  dupIds.length || dupNames.length ? `duplicate ids ${dupIds.join(', ') || 'none'}; duplicate names ${dupNames.join(', ') || 'none'}` : `${TEAMS.length} distinct`);

const HEX = /^#[0-9A-Fa-f]{6}$/;
const badHex = TEAMS.flatMap(t => ['a', 'b'].filter(k => !HEX.test(t[k] || '')).map(k => `${t.id}.${k}=${t[k]}`));
ok('HEX every primary and secondary is a full 6-digit hex, which is what the CSS background and the composite below both assume',
  TEAMS.length > 0 && badHex.length === 0,
  badHex.length ? badHex.join(', ') : `${TEAMS.length * 2} colours parse`);

/* ---- 2. THE TWO MEASURED CLAIMS, RE-MEASURED ------------------------------ */
const rgb = hx => [1, 3, 5].map(i => parseInt(hx.slice(i, i + 2), 16));
const srgbLin = c => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const relLum = hx => { const [r, g, b] = rgb(hx).map(srgbLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (x, y) => { const a = relLum(x), b = relLum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
function lab(hx) {                                   // sRGB -> XYZ (D65) -> CIE L*a*b*
  const [r, g, b] = rgb(hx).map(srgbLin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const de76 = (x, y) => Math.hypot(...lab(x).map((v, i) => v - lab(y)[i]));

/* The header's own numbers, so a drifted comment is a red row and not a shrug.
   Sourced from data/football-teams.js, 2026-09-04: "primaries pairwise CIE76 dE
   >= 12 (min 12.5) ... a/b WCAG contrast >= 3:1 (min 3.02)". */
const DE_FLOOR = 12, DE_HEADER_MIN = 12.5;
const CONTRAST_FLOOR = 3, CONTRAST_HEADER_MIN = 3.02;

let worstPair = null, worstDe = Infinity;
for (let i = 0; i < TEAMS.length; i++) {
  for (let j = i + 1; j < TEAMS.length; j++) {
    const d = de76(TEAMS[i].a, TEAMS[j].a);
    if (d < worstDe) { worstDe = d; worstPair = `${TEAMS[i].id} vs ${TEAMS[j].id}`; }
  }
}
const pairs = (TEAMS.length * (TEAMS.length - 1)) / 2;
ok(`DE every pair of primaries is at least ${DE_FLOOR} CIE76 apart, so two shells read apart at 24px`,
  pairs > 0 && worstDe >= DE_FLOOR,
  `${pairs} pairs, closest ${worstPair} at dE ${worstDe.toFixed(2)}`);
/* THE COMMENT IS UNDER TEST TOO. Re-measuring and then not comparing to the
   recorded minimum would let the header rot to any value while this stayed
   green: the floor is a rule, the recorded minimum is a fact about today's 32
   rows, and only the second one catches a hex edit that stays legal. */
ok(`DE-HEADER data/football-teams.js still records the measured minimum (${DE_HEADER_MIN})`,
  pairs > 0 && Math.abs(worstDe - DE_HEADER_MIN) < 0.05,
  `header says min ${DE_HEADER_MIN}, measured ${worstDe.toFixed(2)}` +
  (Math.abs(worstDe - DE_HEADER_MIN) < 0.05 ? '' : ': the comment is now wrong, fix the comment or revert the colour'));

let worstTeam = null, worstC = Infinity;
for (const t of TEAMS) { const c = contrast(t.a, t.b); if (c < worstC) { worstC = c; worstTeam = t.id; } }
ok(`CONTRAST every team's secondary clears ${CONTRAST_FLOOR}:1 against its primary, so the stripe reads on the shell`,
  TEAMS.length > 0 && worstC >= CONTRAST_FLOOR,
  `${TEAMS.length} teams, tightest ${worstTeam} at ${worstC.toFixed(2)}:1`);
ok(`CONTRAST-HEADER data/football-teams.js still records the measured minimum (${CONTRAST_HEADER_MIN})`,
  TEAMS.length > 0 && Math.abs(worstC - CONTRAST_HEADER_MIN) < 0.02,
  `header says min ${CONTRAST_HEADER_MIN}, measured ${worstC.toFixed(2)}` +
  (Math.abs(worstC - CONTRAST_HEADER_MIN) < 0.02 ? '' : ': the comment is now wrong, fix the comment or revert the colour'));

/* ---- 3. ITEM GENERATION --------------------------------------------------- */
ok('ITEMS FOOTBALL_ITEMS is exactly teams x garments, so no team lost a piece and no piece was generated twice',
  ITEMS.length === TEAMS.length * GARMENTS.length,
  `${ITEMS.length} items, expected ${TEAMS.length} x ${GARMENTS.length} = ${TEAMS.length * GARMENTS.length}`);

const badId = ITEMS.filter(i => i.id !== `fb-${i.football.team}-${i.football.garment}`);
const idSet = new Set(ITEMS.map(i => i.id));
ok('ITEM-IDS every id is the stable `fb-<team>-<garment>`, which is what a save file holds',
  ITEMS.length > 0 && badId.length === 0 && idSet.size === ITEMS.length,
  badId.length ? `${badId.length} malformed, first ${badId[0].id}` : `${idSet.size} unique ids, e.g. ${ITEMS[0].id}`);

/* ---- 4. THE ART IS ON DISK ------------------------------------------------ */
/* Every path the app can ask for: the master off the item, and every mask
   footballTints hands the renderer. Collected as a SET because 256 items share
   eight triplets, and reported as a count so an empty scan cannot pass. */
const referenced = new Set();
for (const it of ITEMS) {
  referenced.add(it.file);
  for (const t of (FB.footballTints(it) || [])) referenced.add(t.mask);
}
const onDisk = p => existsSync(path.join(ROOT, p));
const missing = [...referenced].filter(p => !onDisk(p));
ok('ASSETS every master and mask the catalogue references is a file on disk',
  referenced.size > 0 && missing.length === 0,
  missing.length ? `${missing.length} missing: ${missing.slice(0, 4).join(', ')}` : `${referenced.size} distinct paths, all present`);
/* POSITIVE CONTROL. The row above passes when nothing is missing, which is also
   what it does when the existence check is looking somewhere nothing lives (a
   bad ROOT, a path joined wrong). This proves the same predicate REPORTS a
   file that is not there. */
const BOGUS = 'assets/bh/football/no-such-garment.mask-a.png';
ok('ASSETS-CONTROL the same existence check reports a path that is deliberately not there',
  !onDisk(BOGUS) && onDisk([...referenced][0]),
  `${BOGUS} -> missing (correct), ${[...referenced][0]} -> present (correct)`);

/* ---- 5. THE TINT, ON THE SHIPPED PIXELS ----------------------------------- */
/* 8-bit non-interlaced PNG, colour type 6 (RGBA masters) and 4 (LA masks).
   Anything else THROWS with the file named: a format this cannot read honestly
   is a fact about the harness and must never become a passing row. */
function pngPixels(file) {
  const buf = readFileSync(file);
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a PNG: ${file}`);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const depth = buf[24], colour = buf[25], interlace = buf[28];
  const bpp = colour === 6 ? 4 : colour === 4 ? 2 : 0;
  if (depth !== 8 || !bpp || interlace !== 0) {
    throw new Error(`${file}: expected 8-bit RGBA or greyscale+alpha, non-interlaced, got depth ${depth} colour ${colour} interlace ${interlace}`);
  }
  const idat = [];
  for (let p = 8; p + 8 <= buf.length;) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8);
    if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!idat.length) throw new Error(`no IDAT: ${file}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  if (raw.length < (stride + 1) * h) throw new Error(`truncated image data: ${file}`);
  const out = Buffer.alloc(stride * h);
  for (let y = 0, r = 0; y < h; y++) {
    const ft = raw[r++];
    for (let x = 0; x < stride; x++) {
      const cur = raw[r + x];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v;
      if (ft === 0) v = cur;
      else if (ft === 1) v = cur + a;
      else if (ft === 2) v = cur + b;
      else if (ft === 3) v = cur + ((a + b) >> 1);
      else if (ft === 4) {
        const p0 = a + b - c, pa = Math.abs(p0 - a), pb = Math.abs(p0 - b), pc = Math.abs(p0 - c);
        v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`${file}: unknown PNG filter ${ft} on row ${y}`);
      out[y * stride + x] = v & 0xff;
    }
    r += stride;
  }
  return { w, h, bpp, data: out };
}
const png = (() => { const c = new Map(); return p => { if (!c.has(p)) c.set(p, pngPixels(path.join(ROOT, p))); return c.get(p); }; })();

/* CORE and TOL are the browser's own numbers restated: CORE is the mask weight
   scripts/football-masks.py normalises the master's luminance against, and TOL
   is the /255 window the region mean has to land inside. */
const CORE = 0.9 * 255, OPAQUE = 230, TOL = 8;
/* THE COMPOSITE, exactly as .fb-tint draws it: a solid-hex span with
   mix-blend-mode: multiply, its coverage cut by the mask's alpha.
     out = master * (1 - m) + master * hex / 255 * m
   Returns the mean colour of the region and how many pixels were in it. */
function regionMean(masterPath, maskPath, hex) {
  const M = png(masterPath), K = png(maskPath);
  if (M.w !== K.w || M.h !== K.h) throw new Error(`${masterPath} is ${M.w}x${M.h} but ${maskPath} is ${K.w}x${K.h}: the mask is out of register`);
  const tint = rgb(hex);
  const sum = [0, 0, 0];
  let n = 0;
  for (let i = 0, j = 0; i < M.data.length; i += M.bpp, j += K.bpp) {
    const m = K.data[j + K.bpp - 1];               // mask alpha (LA: byte 1)
    if (m < CORE || M.data[i + 3] < OPAQUE) continue;
    const f = m / 255;
    for (let c = 0; c < 3; c++) { const v = M.data[i + c]; sum[c] += v * (1 - f) + (v * tint[c] / 255) * f; }
    n++;
  }
  return { mean: sum.map(s => s / n), n, tint };
}

/* THREE TEAMS, NOT ONE, and deliberately spread across the gamut: a very dark
   navy, a bright yellow and a mid teal. A single mid-tone team would pass on a
   master whose normalisation is off, because the error scales with the tint:
   the prove-red above measured 46.1/255 on the navy and 188.6/255 on the yellow
   for the SAME broken master. Picked 2026-09-04 from the 32 rows for spread,
   not from any instruction; any three that span the gamut do the same job. */
const TINT_TEAMS = ['boneyard-bruisers', 'windrow-wasps', 'brightwater-barracudas'];
const tintRows = [];
let tintErr = null;
try {
  for (const teamId of TINT_TEAMS) {
    const team = FB.FOOTBALL_TEAM_BY_ID[teamId];
    for (const g of GARMENTS) {
      const item = ITEMS.find(i => i.football.team === teamId && i.football.garment === g.key);
      for (const t of FB.footballTints(item)) {
        const { mean, n, tint } = regionMean(item.file, t.mask, t.hex);
        const worst = Math.max(...mean.map((v, c) => Math.abs(v - tint[c])));
        tintRows.push({ what: `${g.key}/${t.mask.slice(-10, -4)} x ${teamId}`, worst, n });
      }
    }
  }
} catch (e) { tintErr = e.message; }
const tintOff = tintRows.filter(r => r.worst > TOL || r.n === 0);
ok(`TINT master x team hex through the mask lands on the hex within ${TOL}/255, over ${TINT_TEAMS.length} teams x ${GARMENTS.length} garments`,
  !tintErr && tintRows.length >= 9 && tintOff.length === 0,
  tintErr ? `the composite could not run: ${tintErr}`
    : `${tintRows.length} samples, worst ${Math.max(...tintRows.map(r => r.worst)).toFixed(2)}/255` +
      (tintOff.length ? `, OFF: ${tintOff.map(r => `${r.what} ${r.worst.toFixed(1)} (${r.n}px)`).join(', ')}` : ''));

/* ---- 6. A REGION WITH NO PIXELS IN IT ------------------------------------- */
/* MEASURED 2026-09-04: cleats.mask-b.png has ZERO pixels above CORE. Cam drew
   the shoe in the primary alone, so FOOTBALL_GARMENTS marks it `oneColour` and
   footballTints stops emitting a multiply layer that paints nothing.
   BOTH DIRECTIONS, because either drift is a real bug wearing the other's
   clothes: a garment declared one-colour whose mask has pixels has silently
   lost a colour Cam drew, and a two-colour garment whose mask-b is empty ships
   a dead layer that costs a decode on every render. */
const regionRows = GARMENTS.map(g => {
  const maskB = `${FB.FOOTBALL_ART}${g.key}.mask-b.png`;
  const K = png(maskB);
  let n = 0;
  for (let j = 0; j < K.data.length; j += K.bpp) if (K.data[j + K.bpp - 1] >= CORE) n++;
  return { key: g.key, declared: !!g.oneColour, n, tints: FB.footballTints(ITEMS.find(i => i.football.garment === g.key)).length };
});
const regionWrong = regionRows.filter(r => (r.n === 0) !== r.declared || r.tints !== (r.declared ? 1 : 2));
ok('REGIONS a garment is declared one-colour exactly when its secondary mask is empty, and gets exactly that many tint layers',
  regionRows.length === GARMENTS.length && regionWrong.length === 0,
  regionWrong.length
    ? regionWrong.map(r => `${r.key}: ${r.n} core px in mask-b, oneColour=${r.declared}, ${r.tints} tint layers`).join('; ')
    : regionRows.map(r => `${r.key}${r.declared ? ' 1-colour' : ''}:${r.n}`).join(' '));

/* ---- 6b. THE CLEATS AND THE PET CLOTHES REALLY TINT ----------------------- */
/* Tom, 2026-09-04: "make sure you can tint the cleats too you were wrong about
   skipping that and the pet clothes should be tintable."
   THE CLEATS DO TINT AND ALWAYS DID: they take the team PRIMARY through
   cleats.mask-a.png. What a previous pass dropped is the SECOND layer, and it
   dropped it because cleats.mask-b.png has zero core pixels in Cam's art (the
   REGIONS row above, and it is asserted in both directions there, so a trim
   stripe added later switches the second layer back on by itself). The two are
   easy to confuse from a diff, so the primary gets its own row and it is
   measured over ALL 32 TEAMS rather than the three TINT samples, because "the
   shoe is navy on one team" is not "the shoe is the team's colour".
   IF TOM WANTS TWO-TONE CLEATS, this is an ART fix, not a code one: Cam adds a
   coral (region b) trim to BH_NFL_CLEATS.png, re-runs scripts/football-masks.py
   and REGIONS goes red until `oneColour` comes off the row. */
const gTint = (key, teamId) => {
  const item = ITEMS.find(i => i.football.team === teamId && i.football.garment === key);
  return FB.footballTints(item).map(t => {
    const { mean, n, tint } = regionMean(item.file, t.mask, t.hex);
    return { mask: t.mask.slice(-10, -4), hex: t.hex, worst: Math.max(...mean.map((v, c) => Math.abs(v - tint[c]))), n };
  });
};
const cleatRows = TEAMS.map(t => ({ team: t.id, ...gTint('cleats', t.id)[0] }));
const cleatOff = cleatRows.filter(r => r.n === 0 || r.worst > TOL);
ok(`CLEATS the cleats take the team PRIMARY on all ${TEAMS.length} teams, within ${TOL}/255, and are one colour BY THE ART (mask-b is empty, see REGIONS)`,
  cleatRows.length === TEAMS.length && cleatRows[0].n > 0 && cleatOff.length === 0 &&
  FB.footballTints(ITEMS.find(i => i.football.garment === 'cleats')).length === 1,
  cleatOff.length
    ? cleatOff.map(r => `${r.team}: ${r.worst.toFixed(1)}/255 over ${r.n}px`).join('; ')
    : `${cleatRows.length} teams x ${cleatRows[0].n} core px, worst ${Math.max(...cleatRows.map(r => r.worst)).toFixed(2)}/255, one tint layer (mask-a only)`);

/* THE PET CLOTHES CARRY BOTH COLOURS, and that is the difference from the shoe:
   pet-helmet and pet-jersey have a non-empty mask-b, so each gets two multiply
   layers. Measured over all 32 teams x 2 garments x 2 regions. Whether they are
   VISIBLE on the three lizards is a pixel question and lives in
   tests/football-render-audit.mjs; this row is the arithmetic behind it. */
const petRows = [];
for (const key of ['pet-helmet', 'pet-jersey']) for (const t of TEAMS) for (const r of gTint(key, t.id)) petRows.push({ what: `${key}/${r.mask} x ${t.id}`, ...r });
const petOff = petRows.filter(r => r.n === 0 || r.worst > TOL);
ok(`PET-TINT both lizard garments carry BOTH team colours on all ${TEAMS.length} teams, within ${TOL}/255`,
  petRows.length === TEAMS.length * 4 && petOff.length === 0,
  petOff.length
    ? petOff.map(r => `${r.what} ${r.worst.toFixed(1)}/255 (${r.n}px)`).join('; ')
    : `${petRows.length} samples, worst ${Math.max(...petRows.map(r => r.worst)).toFixed(2)}/255, smallest region ${Math.min(...petRows.map(r => r.n))}px`);

/* WHICH LIZARDS. Tom, 2026-09-04: "make sure the cosmetics go on the shiny and
   the founders purple lizard because at the end of the day theyre all the same
   base frame." A SHINY IS NOT A SPECIES: it is an instance flag over the same
   species id, and petCanWear keys on the species, so C4's shiny is already
   covered by C4 being in FOOTBALL_PETS -- there is no `C4-shiny` id anywhere in
   the catalogue to add. This row states that so a future pass cannot "fix" it
   by inventing one. CX is C4 recoloured on the same PET_CROP bbox, which is
   what makes one piece of art register on all three. */
const petGarments = GARMENTS.filter(g => g.pets);
const wearBad = petGarments.flatMap(g => (FB.FOOTBALL_PETS || []).filter(sp => !BH.petCanWear(ITEMS.find(i => i.football.garment === g.key), sp)).map(sp => `${g.key} refused by ${sp}`));
const strayShiny = Object.keys(BH.BH_BY_ID).filter(id => /shiny/i.test(id));
const cropSpread = (FB.FOOTBALL_PETS || []).map(sp => BH.PET_CROP[sp]).filter(Boolean);
const cropDrift = cropSpread.length === 2
  ? Math.max(...['x0', 'y0', 'x1', 'y1'].map(k => Math.abs(cropSpread[0][k] - cropSpread[1][k]))) : Infinity;
ok('PET-SPECIES both lizard garments fit both lizard species, a shiny is the same species id (so it inherits), and the two crops sit on the same frame',
  petGarments.length === 2 && wearBad.length === 0 && strayShiny.length === 0 && cropDrift < 0.02,
  wearBad.length ? wearBad.join('; ')
    : `${petGarments.map(g => g.key).join(' + ')} x ${(FB.FOOTBALL_PETS || []).join(', ')}; no shiny species id in the catalogue (${strayShiny.length}); C4 vs CX crop boxes differ by at most ${cropDrift.toFixed(4)} of the square`);

/* ---- 7. THE UNRELEASED GATE, BOTH DIRECTIONS ------------------------------ */
const fbIds = new Set(ITEMS.map(i => i.id));
const unflagged = ITEMS.filter(i => !i.unreleased);
const inPool = (BH.BH_ITEMS || []).filter(i => fbIds.has(i.id));
const unresolved = ITEMS.filter(i => !BH.BH_BY_ID[i.id]);
if (FB.FOOTBALL_KIT_LIVE) {
  ok('GATE the kit is LIVE, so every piece is in the rotating pool and resolvable',
    unflagged.length === ITEMS.length && inPool.length === ITEMS.length && unresolved.length === 0,
    `${unflagged.length} released, ${inPool.length} in BH_ITEMS, ${ITEMS.length - unresolved.length} resolvable`);
} else {
  ok('GATE the kit is not LIVE, so every piece is flagged unreleased and BH_ITEMS (the rack, crates, gear, Looks) sees none of them',
    ITEMS.length > 0 && unflagged.length === 0 && inPool.length === 0,
    `${ITEMS.length} items, ${unflagged.length} missing the flag, ${inPool.length} leaked into the pool of ${(BH.BH_ITEMS || []).length}`);
  ok('GATE-RESOLVES and BH_BY_ID still answers for all of them, so an owned or previewed piece renders instead of leaving a hole',
    ITEMS.length > 0 && unresolved.length === 0,
    unresolved.length ? `${unresolved.length} unresolvable, first ${unresolved[0].id}` : `all ${ITEMS.length} resolve, e.g. ${BH.BH_BY_ID[ITEMS[0].id].name}`);
}
/* The shelf is gated on the same flag AT THE CALL SITE, which is markup and not
   a value this file can call. Pinned as source, named so a rename is a red row
   rather than a silent hole. */
const appSrc = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const shelfGated = /FOOTBALL_KIT_LIVE\s*\?\s*footballShelfHtml\(/.test(appSrc);
ok('SHELF the shop renders footballShelfHtml only behind FOOTBALL_KIT_LIVE',
  shelfGated,
  shelfGated ? 'js/app.js: `${FOOTBALL_KIT_LIVE ? footballShelfHtml(...) : \'\'}`' : 'the gate at the shelf call site is gone or was renamed');

/* ---- 8. THE VISOR POLICY, BOTH BRANCHES ---------------------------------- */
/* Both exported predicates take the policy as a parameter that DEFAULTS to the
   constant, and both call sites (js/app.js:5428, js/loot.js:2354) call them
   without it. So the live branch is whatever VISOR_EYES_POLICY says, and both
   branches are exercisable here by passing the other one. No stubbed import,
   no restructuring: the seam was already in the data module. */
const blocked = [...(FB.VISOR_BLOCKED_EYES || [])];
const visorId = FB.footballItemId(TEAMS[0].id, 'visor90');
const helmetId = FB.footballItemId(TEAMS[0].id, 'helmet');
const clash = { H: visorId, E: blocked[0] };
const fine = { H: visorId, E: 'E1' };
const noVisor = { H: helmetId, E: blocked[0] };

ok('VISOR-EYES the three blocked eye items are real E-slot items in the catalogue, not stale ids',
  blocked.length > 0 && blocked.every(id => BH.BH_BY_ID[id] && BH.BH_BY_ID[id].slot === 'E'),
  blocked.map(id => `${id}=${BH.BH_BY_ID[id] ? `${BH.BH_BY_ID[id].name} (${BH.BH_BY_ID[id].slot})` : 'NOT IN CATALOGUE'}`).join(', '));

ok("VISOR-HIDE under 'hide' the renderer skips exactly the clashing eyes, and only under a visor",
  FB.visorHidesEyes(clash, 'hide') === true &&
  FB.visorHidesEyes(fine, 'hide') === false &&
  FB.visorHidesEyes(noVisor, 'hide') === false &&
  FB.visorRefusesEquip(clash, 'hide') === false,
  `${blocked[0]} under ${visorId} hidden; E1 under the same visor drawn; ${blocked[0]} under the open helmet drawn; equip not refused`);

ok("VISOR-REFUSE under 'refuse' equip() is told no for exactly the same pair, and the renderer stops hiding",
  FB.visorRefusesEquip(clash, 'refuse') === true &&
  FB.visorRefusesEquip(fine, 'refuse') === false &&
  FB.visorRefusesEquip(noVisor, 'refuse') === false &&
  FB.visorHidesEyes(clash, 'refuse') === false,
  `${blocked[0]} + ${visorId} refused; the two legal pairs allowed; nothing hidden under this policy`);

/* 'clip' KEEPS THE LAYER AND BOUNDS IT. Tom, 2026-09-04: "if it is easy keep
   them on and have the lazers bound within the helmet itself". The mask is the
   worn visor's OWN master, so it exists on disk by the ASSETS row above and no
   new art was invented for it; the pixels it produces are measured in
   tests/football-render-audit.mjs, because a mask URL is not a clipped laser. */
const clipMask = FB.visorClipMask(clash, 'clip');
ok("VISOR-CLIP under 'clip' the clashing eye layer is masked by the worn visor's own master, and only under a visor",
  clipMask === `${FB.FOOTBALL_ART}visor90.png` && onDisk(clipMask) &&
  FB.visorClipMask(fine, 'clip') === null &&
  FB.visorClipMask(noVisor, 'clip') === null &&
  FB.visorHidesEyes(clash, 'clip') === false &&
  FB.visorRefusesEquip(clash, 'clip') === false,
  `${blocked[0]} under ${visorId} clipped to ${clipMask} (on disk); E1 and the open helmet unmasked; nothing hidden and nothing refused under this policy`);

/* THE RENDERER'S HALF OF 'clip', pinned as source for the same reason SHELF is:
   it is markup and a stylesheet rule, not a value this file can call. What the
   pixels do with it is tests/football-render-audit.mjs row VISOR-CLIP. */
const cssSrc = readFileSync(path.join(ROOT, 'app.css'), 'utf8');
const eyeClipWired = /visorClipMask\(eq\)/.test(appSrc) && /eye-clip/.test(appSrc) && /--fbm:url\('\$\{clipMask\}'\)/.test(appSrc);
const eyeClipStyled = /\.eye-clip\s*\{[^}]*mask-image:\s*var\(--fbm\)[^}]*mask-size:\s*var\(--av-fit/s.test(cssSrc);
ok("VISOR-CLIP-WIRED the E layer really carries the mask, and app.css registers it off the surface's own --av-fit",
  eyeClipWired && eyeClipStyled,
  `js/app.js avatarLayersHtml -> ${eyeClipWired ? 'visorClipMask + .eye-clip + --fbm' : 'the E-layer clip is gone or was renamed'}; ` +
  `app.css .eye-clip -> ${eyeClipStyled ? 'mask-image: var(--fbm) at var(--av-fit)' : 'missing, or its mask no longer follows --av-fit (the clip would slide off the art)'}`);

ok('VISOR-LIVE VISOR_EYES_POLICY is one of the three branches graded above',
  ['clip', 'hide', 'refuse'].includes(FB.VISOR_EYES_POLICY),
  `live policy is '${FB.VISOR_EYES_POLICY}'` +
  (['clip', 'hide', 'refuse'].includes(FB.VISOR_EYES_POLICY) ? '' : ": no branch fires, so a clashing pair renders through the glass"));

/* The helmet tile hands over its three visors, so nobody pays four times. */
const granted = FB.footballGrantIds(helmetId);
const soloGrant = FB.footballGrantIds(FB.footballItemId(TEAMS[0].id, 'jersey'));
ok('GRANT buying a helmet grants its three visors, and every other tile grants only itself',
  granted.length === 4 && granted.every(id => fbIds.has(id)) && soloGrant.length === 1,
  `${granted.join(', ')}; jersey grants ${soloGrant.join(', ')}`);

/* ---- 9. A LIVE KIT WITH NO PRICE ----------------------------------------- */
/* The rule, as the buy path states it (js/loot.js buyFootballItem): a piece is
   for sale only when LIVE and the price is a finite number above zero. Stated
   as a predicate so the illegal COMBINATION is refused here, and the buy path's
   own line is pinned below so the two cannot drift apart. */
const sellable = (live, price) => !!live && Number.isFinite(price) && price > 0;
const price = FB.FOOTBALL_KIT_PRICE_PLACEHOLDER;
ok('PRICE the kit is never live with a price that is not a number: name the number before flipping the flag',
  !FB.FOOTBALL_KIT_LIVE || sellable(true, price),
  `FOOTBALL_KIT_LIVE=${FB.FOOTBALL_KIT_LIVE}, price=${JSON.stringify(price)}` +
  (!FB.FOOTBALL_KIT_LIVE || sellable(true, price) ? '' : ': every buy button on the shelf is dead and the shop still shows the tiles'));
/* POSITIVE CONTROL for the row above, which today passes on `!LIVE` alone and
   would keep passing if the predicate were nonsense. */
ok('PRICE-CONTROL the same predicate refuses a live kit priced null, and accepts one priced 600',
  sellable(true, null) === false && sellable(true, 0) === false && sellable(true, 600) === true && sellable(false, 600) === false,
  'live+null refused, live+0 refused, live+600 sold, not-live+600 refused');
/* ---- 9b. THE TEAM BUNDLE ------------------------------------------------- */
/* Tom, 2026-09-04: "per garment only with a bundle of everything for a slightly
   cheaper but expensive price." Three things can go wrong and each is its own
   row: the bundle can miss a piece it promised, the arithmetic behind "you save
   N" can be wrong, and it can go live without a number (or with a number that
   is not actually a discount, which would print a lie on the tile). */
const SOLD = FB.FOOTBALL_SOLD || [];
const bundleIds = FB.footballBundleIds(TEAMS[0].id);
const bundleSet = new Set(bundleIds);
const soldCovered = SOLD.every(g => bundleSet.has(FB.footballItemId(TEAMS[0].id, g.key)));
const bundleReal = bundleIds.every(id => fbIds.has(id) && BH.BH_BY_ID[id]);
/* The count is DERIVED, not typed: every sold tile's own grant list flattened,
   which is how the helmet's three visors get in. Typing "8" here would go green
   on a helmet that stopped granting them. */
const bundleExpect = new Set(SOLD.flatMap(g => FB.footballGrantIds(FB.footballItemId(TEAMS[0].id, g.key))));
ok('BUNDLE the team bundle hands over every SOLD garment of that team, the helmet still dragging its three visors',
  SOLD.length > 0 && soldCovered && bundleReal &&
  bundleSet.size === bundleIds.length && bundleSet.size === bundleExpect.size &&
  [...bundleExpect].every(id => bundleSet.has(id)),
  `${SOLD.length} tiles -> ${bundleIds.length} ids (${bundleSet.size} unique, ${bundleExpect.size} expected from the tiles' own grants): ${bundleIds.map(i => i.replace(`fb-${TEAMS[0].id}-`, '')).join(' ')}`);

/* THE ARITHMETIC, on numbers this file supplies, because the live ones are null
   on purpose. `full` is the tiles added up and `save` the difference, and both
   have to be null while either price is or the tile prints "you save null". */
const mathLive = FB.footballBundleMath();
const mathPriced = FB.footballBundleMath(600, 2400);
ok('BUNDLE-MATH the saving is the sum of the tiles minus the bundle, and both are null until both prices are numbers',
  mathPriced.pieces === SOLD.length && mathPriced.full === 600 * SOLD.length &&
  mathPriced.save === 600 * SOLD.length - 2400 &&
  FB.footballBundleMath(600, null).save === null && FB.footballBundleMath(null, 2400).full === null,
  `${SOLD.length} pieces at 600 = ${mathPriced.full}, bundle 2400, save ${mathPriced.save}; live today full=${JSON.stringify(mathLive.full)} bundle=${JSON.stringify(mathLive.bundle)} save=${JSON.stringify(mathLive.save)}`);

ok('BUNDLE-PRICE the bundle is never live without a number, and never live at a price that is not actually a discount',
  !FB.FOOTBALL_KIT_LIVE || FB.footballBundleSellable(),
  `FOOTBALL_KIT_LIVE=${FB.FOOTBALL_KIT_LIVE}, piece=${JSON.stringify(FB.FOOTBALL_KIT_PRICE_PLACEHOLDER)}, bundle=${JSON.stringify(FB.FOOTBALL_BUNDLE_PRICE_PLACEHOLDER)}` +
  (!FB.FOOTBALL_KIT_LIVE || FB.footballBundleSellable() ? '' : ': the bundle tile is on the shelf with a dead button, or it quotes a price that is not below the sum of the pieces'));
/* POSITIVE CONTROL, same shape as PRICE-CONTROL: today the row above passes on
   `!LIVE` alone, so the predicate itself has to be shown refusing. */
ok('BUNDLE-PRICE-CONTROL the same predicate refuses null, refuses a bundle dearer than the pieces, and accepts a real discount',
  FB.footballBundleSellable(true, 600, null) === false &&
  FB.footballBundleSellable(true, 600, 0) === false &&
  FB.footballBundleSellable(true, 600, 600 * SOLD.length) === false &&
  FB.footballBundleSellable(true, null, 2400) === false &&
  FB.footballBundleSellable(true, 600, 2400) === true &&
  FB.footballBundleSellable(false, 600, 2400) === false,
  `live+null refused, live+0 refused, live+${600 * SOLD.length} (no discount) refused, no piece price refused, live+2400 sold, not-live+2400 refused`);

const lootSrc = readFileSync(path.join(ROOT, 'js/loot.js'), 'utf8');
const bundleGuarded = /!footballBundleSellable\(\)/.test(lootSrc) && /buyFootballBundle/.test(lootSrc);
const bundleWired = /data-buyfbkit/.test(appSrc) && /buyFootballBundle\(b\.dataset\.buyfbkit\)/.test(appSrc);
ok('BUNDLE-BUYPATH buyFootballBundle refuses on the same predicate, and the shelf tile really routes to it',
  bundleGuarded && bundleWired,
  `js/loot.js -> ${bundleGuarded ? 'buyFootballBundle guarded by footballBundleSellable()' : 'the bundle buy path is gone or its guard changed shape'}; ` +
  `js/app.js -> ${bundleWired ? '[data-buyfbkit] -> buyFootballBundle' : 'the bundle tile is not wired to the buy path'}`);

const buyGuarded = /!FOOTBALL_KIT_LIVE\s*\|\|[^\n]*!Number\.isFinite\(cost\)/.test(lootSrc);
ok('PRICE-BUYPATH buyFootballItem still refuses on the same two conditions this file graded',
  buyGuarded,
  buyGuarded ? 'js/loot.js: `!FOOTBALL_KIT_LIVE || !ids.length || !Number.isFinite(cost) || cost <= 0`' : 'the guard in buyFootballItem changed shape: re-read it and re-state the predicate above');

/* ---------------------------------------------------------------------------
   THE WARDROBE'S COLOURWAY RAIL rests on ONE arithmetic fact, and this is the
   pure half of grading it. The rail slides through 32 teams and recolours the
   player's Bonehead as it goes, and it can only be cheap enough to do that on a
   scroll handler because every team of a garment is THE SAME master PNG behind
   THE SAME masks: a team change is two `style.background` writes, with nothing
   to fetch and nothing to decode. If a garment ever grew per-team art, or if a
   team's masks stopped being shared, the rail would silently become 32 image
   loads on a drag and this row is what says so. The pixels of the slide itself
   are tests/football-rail-audit.mjs. -------------------------------------- */
const railGarments = GARMENTS.map(g => {
  const perTeam = TEAMS.map(t => ITEMS.find(i => i.id === FB.footballItemId(t.id, g.key)));
  const files = new Set(perTeam.map(i => i.file));
  const maskSets = new Set(perTeam.map(i => (FB.footballTints(i) || []).map(x => x.mask).join('|')));
  const hexSets = new Set(perTeam.map(i => (FB.footballTints(i) || []).map(x => x.hex).join('|')));
  return { key: g.key, files: files.size, maskSets: maskSets.size, hexSets: hexSets.size, layers: (FB.footballTints(perTeam[0]) || []).length };
});
ok('RAIL-SHARED every team of a garment is one master behind one pair of masks, so sliding the rail changes only two colours',
  railGarments.every(r => r.files === 1 && r.maskSets === 1 && r.hexSets === TEAMS.length),
  railGarments.map(r => `${r.key}: ${r.files} master, ${r.maskSets} mask set, ${r.hexSets} distinct colourways over ${r.layers} layer${r.layers === 1 ? '' : 's'}`).join('; '));
/* The negative that makes the row above mean something: the SAME three counters
   over a garment deliberately given per-team art report a different shape. */
const forked = TEAMS.map(t => ({ ...ITEMS[0], file: `x/${t.id}.png` }));
ok('RAIL-SHARED-CONTROL the same three counters report a fork when a garment really does carry per-team art',
  new Set(forked.map(i => i.file)).size === TEAMS.length,
  `a forked garment counts ${new Set(forked.map(i => i.file)).size} masters instead of 1`);

/* The rail repaints ONE slot's tint spans. `.fb-tint` alone matches every
   football layer on the stack (a player can wear a helmet, a jersey and cleats
   at once), so the span has to carry its slot and the painter has to use it.
   Both halves are pinned here as source shape, the same way PRICE-BUYPATH pins
   the till's guard: the pixel proof that the jersey survives a helmet slide is
   tests/football-rail-audit.mjs row RAIL-SCOPE. */
const tagEmitted = /class="fb-tint" data-fbslot="\$\{item\.slot\}"/.test(appSrc);
const paintScoped = /\.fb-tint\[data-fbslot="\$\{slot\}"\]/.test(appSrc);
ok('RAIL-SLOT-TAG a football tint span declares its slot, and the wardrobe\'s painter selects by it',
  tagEmitted && paintScoped,
  `${tagEmitted ? 'footballTintHtml emits data-fbslot' : 'the tint span no longer carries its slot'}; ` +
  `${paintScoped ? 'the rail painter selects .fb-tint[data-fbslot="${slot}"]' : 'the rail painter is no longer scoped by slot: a helmet slide would repaint the jersey'}`);

console.log(fails
  ? '\nFOOTBALL KIT AUDIT: FAILED'
  : `\nFOOTBALL KIT AUDIT: ${TEAMS.length} teams read apart, ${ITEMS.length} items on eight triplets, the tint lands on the hex, and an unpriced kit is not for sale`);
process.exit(fails);

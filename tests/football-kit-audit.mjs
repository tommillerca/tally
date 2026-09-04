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
 *   4. A PRICE THAT IS STILL null. FOOTBALL_KIT_PRICE_PLACEHOLDER is null on
 *      purpose until Tom names a number. The failure mode is flipping LIVE and
 *      forgetting the price, which ships a shelf whose every button is dead.
 *      The header claims this file refuses that combination. It does.
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
 * PROVE-RED, each row against a real defect (all confirmed 2026-09-04, see
 * docs/FOOTBALL-KIT.md):
 *   DE          set gravel-gulls a to #9AA3AC, 1 unit from ironhaven's grey
 *   CONTRAST    set glasswater-gannets b to #7FB3D5, a light-on-light pair
 *   HEX         set windrow-wasps a to '#F9DC1' (five digits)
 *   ASSETS      rename assets/bh/football/jersey.mask-a.png
 *   TINT        blank the luminance normalisation in normalised_grey (k = 1)
 *   REGIONS     drop `oneColour` from the cleats, so an empty mask is painted
 *   GATE        set FOOTBALL_KIT_LIVE = true with the price still null
 *   PRICE       the same mutation, caught by a second row for a second reason
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
   master whose normalisation is off, because the error scales with the tint. */
const TINT_TEAMS = ['boneyard-bruisers', 'windrow-wasps', 'brightwater-barracudas'];  // 2026-09-04
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

ok('VISOR-LIVE VISOR_EYES_POLICY is one of the two branches graded above',
  FB.VISOR_EYES_POLICY === 'hide' || FB.VISOR_EYES_POLICY === 'refuse',
  `live policy is '${FB.VISOR_EYES_POLICY}'` +
  (FB.VISOR_EYES_POLICY === 'hide' || FB.VISOR_EYES_POLICY === 'refuse' ? '' : ": neither branch fires, so a clashing pair renders through the glass"));

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
const lootSrc = readFileSync(path.join(ROOT, 'js/loot.js'), 'utf8');
const buyGuarded = /!FOOTBALL_KIT_LIVE\s*\|\|[^\n]*!Number\.isFinite\(cost\)/.test(lootSrc);
ok('PRICE-BUYPATH buyFootballItem still refuses on the same two conditions this file graded',
  buyGuarded,
  buyGuarded ? 'js/loot.js: `!FOOTBALL_KIT_LIVE || !ids.length || !Number.isFinite(cost) || cost <= 0`' : 'the guard in buyFootballItem changed shape: re-read it and re-state the predicate above');

console.log(fails
  ? '\nFOOTBALL KIT AUDIT: FAILED'
  : `\nFOOTBALL KIT AUDIT: ${TEAMS.length} teams read apart, ${ITEMS.length} items on eight triplets, the tint lands on the hex, and an unpriced kit is not for sale`);
process.exit(fails);

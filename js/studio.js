/* THE STUDIO COMPOSITOR — docs/PLAN-the-studio.md, build order step 2 and only
 * step 2: "The compositor, headless. Look + options in, a 1080 Blob out. No
 * screen attached."
 *
 * There is no Studio screen, no AR Snap, no frames and no stickers in here. This
 * file is one function: a look descriptor plus the composer knobs go in, a
 * 1080x1920 PNG Blob comes out. Everything that renders a card later (the Studio
 * screen, AR Snap, the auto-cards) calls this, so the figure contract is honoured
 * once instead of per surface.
 *
 * WHAT IS REUSED, and what had to be built (checked by grep, not assumed):
 *   BH_SLOTS / BH_BY_ID / bhAsset   the slot list and its z order, verbatim.
 *   PET_CROP                        the measured pet ink boxes; the same numbers
 *                                   croppedPetImg() uses, so a pet is the same
 *                                   size and crop here as everywhere else.
 *   petHovers()                     a hovering species floats, it does not sit.
 *   the /shiny/ art path            identical to petSpriteHtml's.
 *   sparkIco's path data            the shiny sparkle, same 24-unit path.
 * BUILT, because nothing existing does it:
 *   drawTrimmedArt() centres one PNG inside a canvas. A card seats a STACK on a
 *   ground line and hangs a companion off a tension line, so the ink maths is
 *   shared in spirit but not in code.
 *   avatarLayersHtml() emits <img> tags. A canvas cannot use them.
 *
 * THE FIGURE CONTRACT (tally/CLAUDE.md), applied here:
 *   1. A PET IS AN INSTANCE. `look.pet` must come from petFrom(). Its `shiny`
 *      must be a resolved BOOLEAN: this module has no access to S.shinyPets (it
 *      does not import app.js), so an undefined shiny THROWS rather than
 *      silently drawing a shiny pet in base colours, which is the exact bug the
 *      contract exists to stop.
 *   3. ALIGN ON INK. Every placement comes from a real alpha bounding box: the
 *      body PNG's for the figure, PET_CROP for the pet. No box is ever used.
 *   4. SAFE MARGINS AND TENSION POINTS. LAYOUT below. The Bonehead holds the
 *      centre line; the pet hangs off the right tension line; nothing is nudged.
 *
 * A BLANK RENDER IS A FINDING, NOT A CAPTURE ARTIFACT. Every layer is decoded
 * before anything is drawn and a layer that decodes to nothing THROWS with the
 * asset named. This is the one place the app's "degrade to ugly, never to blank"
 * rule inverts: a screen with a missing garment is a bad five seconds, a SHARED
 * PICTURE with a missing garment is permanent and public. Fail loudly instead.
 *
 * HARD RULE from the plan: no calories, macros, weight, weigh-in trend or step
 * counts may ever reach a card. There is deliberately no input for any of them,
 * and tests/studio-audit.mjs greps this file for one.
 */
import { BH_SLOTS, BH_BY_ID, bhAsset, PET_CROP } from '../data/boneheadz.js';
import { petHovers } from './pets.js';

const W = 1080, H = 1920;
/* Instagram Stories reserved zones, PLAN §3. Decoration may bleed into them,
   INFORMATION may not. The 6% gutter is the figure contract's own margin; the
   two agree at the sides (0.06 * 1080 = 64.8) and IG is stricter top and bottom. */
const GUTTER = 0.06;
const g = Math.round(W * GUTTER), gy = Math.round(H * GUTTER);

export const LAYOUT = {
  W, H,
  /* no DRAWING may enter this */
  gutter: { l: g, t: gy, r: W - g, b: H - gy },
  /* no INFORMATION may enter this (IG top 270 / bottom 380 / sides 65) */
  safe: { l: 65, t: 270, r: W - 65, b: H - 380 },
  centerX: W / 2,
  /* The figure's ground line, and the height its BODY ink is normalised to.
     Anchoring on the body alone (not the whole composite) is deliberate: a tall
     hat or a long weapon must not shrink or shift the character, and it makes
     the render of any one slot land in exactly the same place as the render of
     all of them, which is what lets tests/studio-audit.mjs prove z order on
     pixels. */
  ground: 1062,
  bodyInkH: 450,
  /* The right third of the safe box. Inner edge ON the tension line; the width
     is clamped so the outer edge can never pass the safe margin, because a
     companion sliced by the card edge is worse than a smaller one (PLAN §3). */
  pet: { l: 698, r: 1015, inkH: 300, ground: 1080 },
  plate: { l: 65, t: 1094, r: 1015, b: 1540 },
  /* Fixed row slots, so turning one row off never moves another. Provisional
     look: Tom approves mockups at build-order step 3 and the type here will
     change. The API and the guards are what step 2 is for. */
  rows: {
    name: { l: 93, t: 1122, r: 987, b: 1206 },
    quote: { l: 93, t: 1222, r: 987, b: 1340 },
    gear: { l: 93, t: 1356, r: 987, b: 1440 },
    code: { l: 93, t: 1456, r: 987, b: 1512 },
  },
};

const INK = {                      // brand tokens, matching app.css :root
  wash: '#16151d', plate: '#0d0c12', line: 'rgba(242,233,215,0.17)',
  text: '#f2e9d7', text2: '#b9ac97', accent: '#a5e847', shadow: 'rgba(0,0,0,0.45)',
};
const DISPLAY = "'Bangers', 'Arial Black', system-ui, sans-serif";
const BODY = "system-ui, -apple-system, sans-serif";
/* sparkIco()'s path, verbatim, in its own 24-unit space. */
const SPARK = 'M12 2.5c.7 4.2 2.1 6.6 3 7.5s3.3 2.3 7.5 3c-4.2.7-6.6 2.1-7.5 3s-2.3 3.3-3 7.5c-.7-4.2-2.1-6.6-3-7.5s-3.3-2.3-7.5-3c4.2-.7 6.6-2.1 7.5-3s2.3-3.3 3-7.5z';

const assetUrl = rel => new URL('../' + rel, import.meta.url).href;

/* THE FIGURE'S TRANSFORM IS A CONSTANT, taken from the DEFAULT body's ink box
   and never from the body actually worn. Two reasons, one measured:
   all 32 body drawings sit in the same place on the 640 canvas (ink bottom
   594-596, ink height 376-378, ink centre x 317.5-320.0), so reading the worn
   body's own box buys nothing; and a transform that moves with the garment
   makes the same character jump a couple of pixels between two cards, which is
   both wrong and undetectable by eye. A worn body renders at its natural size
   relative to this, exactly as it does inside avatarLayersHtml's shared canvas. */
const ANCHOR_BODY = BH_SLOTS.find(s => s.code === 'B').default;

/* DECODE BEFORE YOU COMPOSE. These are 100KB+ PNGs; an undecoded layer draws
   nothing at all and the card ships without a garment. */
const artCache = new Map();
function loadArt(rel) {
  if (!artCache.has(rel)) {
    artCache.set(rel, new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => (im.naturalWidth > 0 && im.naturalHeight > 0
        ? res(im) : rej(new Error(`studio: ${rel} decoded to nothing (0x0)`)));
      im.onerror = () => rej(new Error(`studio: ${rel} failed to load`));
      im.src = assetUrl(rel);
    }));
  }
  return artCache.get(rel);
}

/* The alpha bounding box of one PNG, in its own pixels. Same >14 alpha floor
   drawTrimmedArt uses, so "ink" means the same thing on both paths. */
const boxCache = new Map();
async function inkBox(rel) {
  if (boxCache.has(rel)) return boxCache.get(rel);
  const im = await loadArt(rel);
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let py = 0; py < c.height; py++) {
    for (let px = 0; px < c.width; px++) {
      if (d[(py * c.width + px) * 4 + 3] <= 14) continue;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      y1 = py;
    }
  }
  if (x1 < 0) throw new Error(`studio: no ink in ${rel} (a blank layer is a finding)`);
  const box = { x0, y0, x1: x1 + 1, y1: y1 + 1, w: c.width, h: c.height };
  boxCache.set(rel, box);
  return box;
}

let fontReady = null;
function ensureFont() {
  if (!fontReady) {
    const f = new FontFace('Bangers', `url(${assetUrl('assets/fonts/bangers.woff2')})`);
    /* A missing display face is a wrong-typeface card, not a broken one (PLAN §5
       is about exactly this class of silent fallback), so it degrades rather
       than throws. It is still surfaced: composeCard reports it via the console
       once, and the card falls back to Arial Black. */
    fontReady = f.load().then(ff => { document.fonts.add(ff); return true; })
      .catch(e => { console.warn('studio: Bangers did not load, card is in the fallback face', e); return false; });
  }
  return fontReady;
}

/* Fit `text` into `rect` at the largest of `sizes` that fits in `maxLines`. */
function wrapText(ctx, text, rect, sizes, maxLines, font) {
  const width = rect.r - rect.l;
  for (const size of sizes) {
    ctx.font = `${size}px ${font}`;
    const lines = [];
    let line = '';
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= width || !line) { line = next; continue; }
      lines.push(line); line = word;
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines) return { size, lines };
  }
  ctx.font = `${sizes[sizes.length - 1]}px ${font}`;
  return { size: sizes[sizes.length - 1], lines: [String(text)] };
}

function drawRows(ctx, rect, text, { font, size, colour, maxLines, align = 'center' }) {
  const { size: s, lines } = wrapText(ctx, text, rect, size, maxLines, font);
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const lh = s * 1.16;
  const cy = (rect.t + rect.b) / 2 - ((lines.length - 1) * lh) / 2;
  const x = align === 'center' ? (rect.l + rect.r) / 2 : rect.l;
  lines.forEach((ln, i) => ctx.fillText(ln, x, cy + i * lh));
}

function roundRect(ctx, l, t, r, b, rad) {
  ctx.beginPath();
  ctx.moveTo(l + rad, t);
  ctx.arcTo(r, t, r, b, rad); ctx.arcTo(r, b, l, b, rad);
  ctx.arcTo(l, b, l, t, rad); ctx.arcTo(l, t, r, t, rad);
  ctx.closePath();
}

function groundShadow(ctx, cx, y, w) {
  ctx.save();
  ctx.fillStyle = INK.shadow;
  ctx.beginPath();
  ctx.ellipse(cx, y, w / 2, Math.max(8, w * 0.11), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* THE CARD'S ONE PET PATH, the canvas equivalent of petAsideHtml. There is
 * exactly one of these on purpose and tests/figure-audit.mjs enforces it: its
 * COVERAGE rule scans this file as well as js/app.js, so a second place in the
 * Studio that starts drawing a pet its own way FAILS the build until it is
 * registered in SITES. `pet` is an INSTANCE from petFrom() with shiny already
 * resolved; this function never looks at an outfit.
 *
 * Placement is the figure contract's rule 4, not eyeballing: the pet's INK inner
 * edge sits on the right-hand tension line of the safe box, and its width is
 * clamped so the outer edge can never cross the safe margin, because a companion
 * sliced by the card edge is worse than a smaller one.
 */
function drawStudioPet(ctx, pet, im) {
  const c = PET_CROP[pet.id];
  /* PET_CROP is in fractions of the square, so the ink box in image pixels is
     the fraction times the natural size. Mass normalisation is the same rule
     croppedPetImg encodes: every species is drawn to the same INK HEIGHT, so a
     flat lizard does not read a third smaller than the round cloud. */
  const inkW = (c.x1 - c.x0) * im.naturalWidth, inkH = (c.y1 - c.y0) * im.naturalHeight;
  const band = LAYOUT.pet.r - LAYOUT.pet.l;
  const targetH = Math.min(LAYOUT.pet.inkH, band * (inkH / inkW));     // the clamp
  const ps = targetH / inkH;
  const px = LAYOUT.pet.l - c.x0 * im.naturalWidth * ps;
  /* A hovering species floats clear of the ground line rather than sitting on
     it: petHovers is the same source petAsideHtml consults. */
  const hover = petHovers(pet.id) ? targetH * 0.18 : 0;
  const py = LAYOUT.pet.ground - hover - c.y1 * im.naturalHeight * ps;
  if (!hover) groundShadow(ctx, LAYOUT.pet.l + inkW * ps / 2, LAYOUT.pet.ground, inkW * ps * 0.8);
  ctx.drawImage(im, px, py, im.naturalWidth * ps, im.naturalHeight * ps);
  if (!pet.shiny) return;
  /* Clamped to the safe margin: at the tension line the pet's own ink can end
     within half a sparkle of the edge, and the GUTTER check caught the star
     hanging 15px outside it. */
  const sp = 64;
  const sx = Math.min(LAYOUT.pet.l + inkW * ps - sp * 0.55, LAYOUT.pet.r - sp);
  const sy = py + c.y0 * im.naturalHeight * ps - sp * 0.35;
  ctx.save();
  ctx.translate(sx, sy); ctx.scale(sp / 24, sp / 24);
  const star = new Path2D(SPARK);
  ctx.fillStyle = '#ffe08a'; ctx.strokeStyle = '#3a2b12';
  ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
  ctx.fill(star); ctx.stroke(star);
  ctx.restore();
}

/* The gear the card is allowed to name: worn cosmetics only. The body is what
   you are, not what you put on, and BG/C are the backdrop and the pet, which
   have their own knobs. */
const GEAR_SLOTS = BH_SLOTS.filter(s => !['BG', 'C', 'B'].includes(s.code)).map(s => s.code);
const gearNames = outfit => GEAR_SLOTS
  .map(code => outfit[code]).filter(id => id && BH_BY_ID[id])
  .map(id => BH_BY_ID[id].name).slice(0, 5);

/**
 * Compose one 1080x1920 card.
 *
 * @param {object} look
 *   look.outfit  {slotCode: itemId} — the same map avatarLayersHtml takes.
 *   look.pet     a pet INSTANCE from petFrom(), with `shiny` resolved to a
 *                boolean by the caller, or null. NEVER `{ id: outfit.C }`.
 *   look.name    display name.
 *   look.level   player level.
 * @param {object} opts   the composer knobs, PLAN §3.
 *   opts.backdrop  a BG catalogue id, or null for the plain wash.
 *   opts.pet       true = the pet is in shot, false = out.
 *   opts.quote     the line to print, or '' for off.
 *   opts.code      your friend code as text, or '' for off.
 *   opts.gear      true = print the worn-gear list.
 * @returns {Promise<Blob>} an image/png Blob, exactly 1080x1920.
 */
export async function composeCard(look, opts = {}) {
  const o = { backdrop: null, pet: true, quote: '', code: '', gear: false, ...opts };
  const outfit = (look && look.outfit) || {};
  const pet = o.pet ? (look && look.pet) || null : null;
  if (pet) {
    if (!pet.id || !BH_BY_ID[pet.id]) throw new Error(`studio: unknown pet id ${JSON.stringify(pet.id)}`);
    /* THE TRAP, made loud. petFrom() leaves shiny UNDEFINED for your own pet on
       purpose, so S.shinyPets can answer. That set lives in app.js and this
       module cannot see it, so an undefined shiny here would silently draw a
       shiny pet in base colours onto something the player posts publicly. */
    if (typeof pet.shiny !== 'boolean') {
      throw new Error('studio: look.pet.shiny must be a resolved boolean. '
        + 'Use petFrom(snapshotPet, ownSpecies) and, for your OWN pet, resolve shiny '
        + 'through S.shinyPets before calling. Never read shiny off an outfit.');
    }
  }
  if (o.backdrop && !BH_BY_ID[o.backdrop]) throw new Error(`studio: unknown backdrop ${o.backdrop}`);

  await ensureFont();

  // ---- decode everything BEFORE a single pixel is drawn ----------------------
  const bodyRel = bhAsset(BH_BY_ID[ANCHOR_BODY]);
  const layerRels = BH_SLOTS
    .filter(s => s.code !== 'BG' && s.code !== 'C')
    .sort((a, b) => a.z - b.z)
    .map(s => outfit[s.code])
    .filter(id => id && BH_BY_ID[id])
    .map(id => bhAsset(BH_BY_ID[id]));
  const petRel = pet
    ? (pet.shiny && pet.id !== 'CX' ? `assets/bh/C/shiny/${pet.id}.png` : bhAsset(BH_BY_ID[pet.id]))
    : null;
  const rels = [...new Set([bodyRel, ...layerRels, ...(petRel ? [petRel] : []),
    ...(o.backdrop ? [bhAsset(BH_BY_ID[o.backdrop])] : [])])];
  const art = new Map(await Promise.all(rels.map(async r => [r, await loadArt(r)])));
  const bodyBox = await inkBox(bodyRel);

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // ---- backdrop -------------------------------------------------------------
  ctx.fillStyle = INK.wash;
  ctx.fillRect(0, 0, W, H);
  if (o.backdrop) {
    const im = art.get(bhAsset(BH_BY_ID[o.backdrop]));
    const s = Math.max(W / im.naturalWidth, H / im.naturalHeight);   // cover
    ctx.drawImage(im, (W - im.naturalWidth * s) / 2, (H - im.naturalHeight * s) / 2,
      im.naturalWidth * s, im.naturalHeight * s);
  }

  // ---- the figure, seated on INK -------------------------------------------
  const fs = LAYOUT.bodyInkH / (bodyBox.y1 - bodyBox.y0);
  const fx = LAYOUT.centerX - ((bodyBox.x0 + bodyBox.x1) / 2) * fs;
  const fy = LAYOUT.ground - bodyBox.y1 * fs;
  groundShadow(ctx, LAYOUT.centerX, LAYOUT.ground, (bodyBox.x1 - bodyBox.x0) * fs * 0.78);
  for (const rel of layerRels) {
    const im = art.get(rel);
    ctx.drawImage(im, fx, fy, im.naturalWidth * fs, im.naturalHeight * fs);
  }

  // ---- the pet, off the right tension line ---------------------------------
  if (pet) drawStudioPet(ctx, pet, art.get(petRel));

  // ---- the chrome plate -----------------------------------------------------
  /* Rows keep FIXED y positions so turning one off never moves another, which
     is what makes "the quote row is empty when the quote is off" a check on one
     rectangle rather than on a moving target. Only the plate's BOTTOM follows
     the content, because a fixed-height plate under a name-only card is a large
     empty box, and that is visible in the export. */
  const p = LAYOUT.plate;
  const lastRow = o.code ? LAYOUT.rows.code
    : o.gear && gearNames(outfit).length ? LAYOUT.rows.gear
      : o.quote ? LAYOUT.rows.quote : LAYOUT.rows.name;
  /* 14, not the 28 above the first row: the row slots are 16px apart, so a
     larger pad would put the plate's bottom border inside the NEXT row's
     rectangle and the audit would read the border as leftover text. */
  const plateB = Math.min(p.b, lastRow.b + 14);
  roundRect(ctx, p.l, p.t, p.r, plateB, 34);
  ctx.fillStyle = INK.plate; ctx.fill();
  /* Stroke INSIDE the path. A centred 3px stroke put 2px of plate edge outside
     the safe gutter on all four sides and 2px below Instagram's reserved bottom,
     which the gutter check caught: clip to the shape and draw at double width so
     only the inner half survives. */
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = INK.line; ctx.lineWidth = 6; ctx.stroke();
  ctx.restore();

  const name = (look && look.name) || 'BONEHEAD';
  const lvl = look && look.level ? ` · LV ${look.level}` : '';
  drawRows(ctx, LAYOUT.rows.name, `${name}${lvl}`,
    { font: DISPLAY, size: [72, 62, 52, 44], colour: INK.text, maxLines: 1 });
  if (o.quote) {
    drawRows(ctx, LAYOUT.rows.quote, `“${o.quote}”`,
      { font: DISPLAY, size: [50, 44, 38, 32], colour: INK.text, maxLines: 2 });
  }
  if (o.gear) {
    const names = gearNames(outfit);
    if (names.length) {
      drawRows(ctx, LAYOUT.rows.gear, names.join('  ·  '),
        { font: BODY, size: [30, 26, 23, 20], colour: INK.text2, maxLines: 2 });
    }
  }
  if (o.code) {
    drawRows(ctx, LAYOUT.rows.code, `ADD ME   ${o.code}`,
      { font: BODY, size: [34, 30, 26], colour: INK.accent, maxLines: 1 });
  }

  return new Promise((res, rej) => cv.toBlob(
    b => (b ? res(b) : rej(new Error('studio: toBlob returned nothing'))), 'image/png'));
}

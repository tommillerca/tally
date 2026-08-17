/* js/hollow-beds.js — the Hollow's beds, crops, chips and price sign.
 *
 * WHY THIS FILE EXISTS. The designer shipped 28 finished pieces and they are all
 * already ported into js/hollow-art.js as HLW_ART. openHollow drew its beds and
 * crops from hand-written inline SVG instead, which is what Tom has twice said
 * looks wrong against what he prepped. This module draws them from the pieces.
 *
 * WHAT IT IS NOT. It emits ART ONLY: no buttons, no hit areas, nothing that
 * answers a tap. Every root it returns carries pointer-events:none. The bed
 * buttons stay the caller's, at 60px, because an 84px hit box overlapped its
 * row-mate by 21px and the overlap armed a 1,500-coin purchase.
 *
 * THE CALL SITE, exactly:
 *   <div style="position:absolute;left:${cx - BED_BOX.w / 2}px;top:${cy - BED_BOX.h / 2}px;
 *               width:${BED_BOX.w}px;height:${BED_BOX.h}px;pointer-events:none;z-index:2"
 *        id="hlwBedArt${i}">${hlwBedArt(plot)}</div>
 *   <div style="position:absolute;left:${cx}px;top:${cy - 52}px;z-index:5">${hlwChipHtml(plot)}</div>
 *   <div style="position:absolute;left:${spotX - 31}px;top:${spotY - 46}px;z-index:3">${hlwPriceSignHtml(price)}</div>
 *
 * The chip carries NO left/top of its own: .hlw-chip is already
 * transform:translateX(-50%), so it centres itself on the anchor the wrapper
 * sets. That is deliberate. A width-dependent offset broke the moment the label
 * changed length, and .hlw-chip.thirst's -7px nudge (app.css, shipped, measured)
 * is what keeps it off the price sign.
 *
 * BOXES, so a caller can reason about collisions without measuring:
 *   BED_BOX      84 x 60, centred on the bed spot. This is the SOIL footprint.
 *                A ripe plant is taller than its own bed and grows up out of the
 *                top of it: measured in the render it reaches 17.1px above the box
 *                and never outside it left, right or below. The beds are 95px
 *                apart vertically, so that headroom lands on grass, not on the
 *                bed above. tests/hollow-beds-audit.mjs pins it under 30.
 *   SIGN_BOX     66 x 70, top-left at the wrapper. Everything the sign draws stays
 *                inside it, price text included, at 1,500 and at 4,000.
 *                Placed as above, the board lands exactly where the shipped sign
 *                sat: centred on (spotX, spotY - 27).
 *
 * CROP ART IS EMBER PEPPER ONLY. The designer drew four states for one crop. The
 * garden has six commons plus a rare, so every other crop borrows the Ember
 * Pepper silhouette and is TINTED with the colour the app already gives that
 * ingredient (BH_ICON_TINTS), so the hue in the bed matches the hue on the seed
 * in the pouch. Consequence, stated plainly: at sprout and young stage every crop
 * looks the same, because those two pieces are all leaf and carry no tintable
 * fruit. New crop art is NOT generated here: that art is Cam's hand and a separate
 * approval. gwart/HOLLOW-BEDS-REPORT.md lists what is missing.
 */
import { HLW_ART, hlwArt } from './hollow-art.js';
import { INGREDIENTS, fmtCookTime } from './cooking.js';
import { BH_ICON_TINTS } from './icons-pack.js';

export const BED_BOX = { w: 84, h: 60 };

const SIGN_BOX = { w: 66, h: 70 };
const PE = 'pointer-events:none;'; // art never takes a tap; the caller owns the button

/* Where a plant's roots meet the soil, in BED_BOX px. Taken from the piece: the
   empty-bed mound's top surface sits at (40.1, 22.9) and its front edge at 50.6,
   so 34 plants the stem in the mound rather than balancing it on the rim. */
const ANCHOR = { x: 41, y: 34 };

/* Each stage: the piece, its rendered height in px, and the point IN THE
   DESIGNER'S OWN viewBox COORDS where the stem meets the ground. Width and the
   offset are derived from the piece's viewBox, so a reshipped piece with a
   different box cannot silently drift. */
const STAGES = [
  { key: 'seed', id: 'crop-ember-pepper-seed', h: 17, base: [13, 19] },
  { key: 'sprout', id: 'crop-ember-pepper-sprout', h: 22, base: [12, 22] },
  { key: 'young', id: 'crop-ember-pepper-young', h: 34, base: [18, 38] },
  { key: 'ripe', id: 'crop-ember-pepper-ripe', h: 54, base: [22, 50] },
];

/* ponytail: colour swaps on the generated markup string, because hlwArt takes no
   fill override and js/hollow-art.js is another lane's file. Upgrade path: a
   `fills` option on hlwArt the moment a second surface needs recolouring. */
const paint = (id, opts, swaps = []) =>
  swaps.reduce((s, [a, b]) => s.split(a).join(b), hlwArt(id, opts));

const vbOf = id => HLW_ART[id].vb.split(/\s+/).map(Number);

function place(st) {
  const [vx, vy, vw, vh] = vbOf(st.id);
  const w = st.h * vw / vh;
  return { w, x: ANCHOR.x - (st.base[0] - vx) / vw * w, y: ANCHOR.y - (st.base[1] - vy) / vh * st.h };
}

function cropStage(plot) {
  if (plot.ready) return STAGES[3];
  const span = plot.readyAt - plot.plantedAt;
  const t = span > 0 ? 1 - plot.remainingMs / span : 1;
  return t < 0.30 ? STAGES[0] : t < 0.65 ? STAGES[1] : STAGES[2];
}

// Ember Pepper is the one crop with real art, so it is drawn in the designer's
// own colours and never tinted.
const cropTint = plot =>
  plot.ing === 'ember' ? null : (BH_ICON_TINTS[INGREDIENTS[plot.ing]?.iconId] || null);

/* ONE bed's art. `plot` is an entry from gardenState().plots, plus two optional
   flags the caller may add:
     locked  the ghost slot you do not own yet
     tilled  an empty bed that has just been worked (the rake pass between the
             tap and the seed landing) */
export function hlwBedArt(plot) {
  if (plot.locked) {
    return paint('hollow-bed-locked',
      { x: (BED_BOX.w - 76) / 2, y: (BED_BOX.h - 52) / 2, w: 76, cls: 'hlw-p-hollow-bed-locked', style: PE });
  }
  const soilId = plot.empty && !plot.tilled ? 'hollow-bed-empty' : 'hollow-bed-tilled';
  // ids are stripped: up to five beds render at once and duplicate ids are a
  // trap for anything that later reaches for #rake or #fruit.
  const soil = paint(soilId, { x: 0, y: 0, w: BED_BOX.w, cls: `hlw-p-${soilId}`, style: PE },
    [['id="rake"', 'class="hlw-rake"']]);
  if (plot.empty) return soil;

  const st = cropStage(plot), pos = place(st), tint = cropTint(plot);
  const swaps = [['id="fruit"',
    'class="hlw-fruit" style="animation:hlwReady 2.6s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%"']];
  if (tint) swaps.push(['#fd6857', tint], ['#c9a86a', tint]);
  // The droop keeps a thirst cue on the plant itself for anyone running reduced
  // motion, where the sway below is stopped dead.
  if (plot.canWater) swaps.push(['#7fae57', '#9fae6a']);
  const style = PE + (plot.canWater
    ? 'animation:hlwSway 3.4s ease-in-out infinite;transform-origin:50% 100%;' : '');
  return soil + paint(st.id, { x: pos.x, y: pos.y, w: pos.w, cls: `hlw-p-${st.id}`, style }, swaps);
}

/* The bed's chip, or '' when it has none. THE DROPLET IS THE SCREEN'S ONE ACCENT
   MOMENT and appears only when the bed can actually be watered. A growing bed
   that has already been watered gets a plain time chip with no droplet in it:
   every growing bed used to wear the same droplet, so the droplet meant nothing.
   tests/hollow-audit.mjs pins this. */
export function hlwChipHtml(plot) {
  if (plot.locked || plot.empty) return '';
  /* nowrap is not decoration. The caller's anchor is an absolutely positioned
     wrapper with no width, so the chip's containing block is 0 wide and
     shrink-to-fit hands it min-content: "1h 30m" broke onto two lines in the
     render. .hlw-chip carries no white-space rule and app.css is another lane's
     file, so it rides here, where it also survives any anchor the caller picks. */
  const NW = 'white-space:nowrap;';
  /* THE ACCENT BELONGS TO THE PAYOFF, and it was on the optional action.
     Measured on the returning screen: the ripe fruit was 175 css px at 1.81:1
     against grass, LAST by area and LAST by contrast, and a ready bed carried no
     chip at all, while watering (which you can skip) wore a full accent chip.
     Two reviewers found this independently. The accent MOVES here, it is not
     duplicated: ready is lime, thirst drops to the muted chip that keeps the
     droplet. Still exactly one lime object per bed state. */
  if (plot.ready) {
    return `<span class="hlw-chip ready" style="${NW}">READY</span>`;
  }
  /* CROP IDENTITY IS NOT SOLVED HERE, and pretending otherwise would be worse
     than leaving it. Naming the crop in every chip was tried and measured: the
     chips went from 64.7px to 127.7px and started colliding with each other and
     with the price sign on a 63px bed pitch. Six of seven crops being one tinted
     silhouette is an ART problem and it wants art, not a longer label. The bed
     aria-labels already name the crop, so a screen reader is better served than
     a sighted player, which is worth saying out loud. */
  if (plot.canWater) {
    const drop = paint('hollow-water-needs',
      { w: 9, cls: 'hlw-p-hollow-water-needs', style: 'position:static;flex:none;' },
      [['#9fd0e8', 'currentColor']]);
    return `<span class="hlw-chip thirst" style="${NW}">${drop}THIRSTY</span>`;
  }
  return `<span class="hlw-chip" style="${NW}">${fmtCookTime(plot.remainingMs)}</span>`;
}

/* The buy-a-bed sign. Everything, price text included, stays inside SIGN_BOX
   (66 x 70). The text rides its own copy of the board's rotation rather than
   being spliced into the piece, so it lands on the board without editing the
   designer's markup. */
/* THE GHOST BED UNDER THE SIGN. hollow-bed-locked has shipped in HLW_ART since
   the port and nothing ever rendered it, so the 1,500 sign hung over bare grass:
   it priced an object that was not drawn. The designer calls this a ghost slot
   and that is exactly what it is, a bed you can see the shape of and do not own. */
export function hlwGhostBedHtml() {
  return hlwArt('hollow-bed-locked', { w: BED_BOX.w, cls: 'hlw-p-hollow-bed-locked', style: PE });
}

/* `afford` is the player's balance, or null when the caller does not care. A sign
   you cannot pay reads muted and shows the gap, instead of arming an affirmative
   accent confirm and then refusing you after the second tap. */
export function hlwPriceSignHtml(price, afford = null) {
  const art = hlwArt('hollow-price-sign',
    { x: 0, y: 0, w: SIGN_BOX.w, cls: 'hlw-p-hollow-price-sign', style: PE });
  const short = afford != null && afford < price;
  const label = Number(price).toLocaleString();
  const out = art.replace('</svg>',
    `<g transform="rotate(-3 31 19)"><text x="41" y="24" text-anchor="middle" font-family="Bangers, sans-serif" font-size="14" letter-spacing=".5" fill="#17151d">${label}</text>` +
    `</g></svg>`);
  /* NO SECOND LINE ON THE BOARD. A "N SHORT" line was tried and measured: the
     board is 58 x 30 units and the text landed outside it, half over the post,
     unreadable. The muting is the signal, the balance is already on screen top
     right, and the real fix for "you cannot afford this" is refusing BEFORE the
     two-tap commit rather than after it. That lives in the caller. */
  // muted, not disabled: it still says what it costs, it just stops shouting
  return short ? out.replace('<svg', '<svg style="opacity:.62"') : out;
}

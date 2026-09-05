/* THE PADDOCK, Lane W: the pet card slider and the collection panel.
 *
 * Everything here is PURE: it takes a roster (from paddock.js paddockRoster) and an
 * egg summary (paddockEggs) and returns view models and markup strings. No db, no
 * DOM, no timers. That is deliberate: the parts that decide WHAT a player reads can
 * then be unit-tested in node with no browser, and the browser audit is left to
 * check the things only a browser can answer (scroll, pops, decoded art, the reload
 * round trip).
 *
 * NAMESPACE IS `.pdk-`, NOT `.pd-`. `.pd-*` is the wardrobe PAPERDOLL
 * (app.css "wardrobe: paperdoll", `.pd-slot/.pd-art/.pd-center/.pd-gear/.pd-stat`,
 * live in renderCharacter). `pd` there means paperdoll. Putting the Paddock in the
 * same namespace would collide on exactly the generic names a card wants, and this
 * project has already shipped that bug once: the reveal rule scoped to `.sheet-body`
 * which the Boneyard reused as a SCREEN class, tied on specificity, and left the map
 * blank (tally/CLAUDE.md, "Scope reveal CSS to the surface it means").
 */
import { BH_ITEMS, bhAsset, PET_CROP, petWornLayers, petWornTints, bhThumb, bhTierFor, THUMB_FALLBACK } from '../data/boneheadz.js';
import { bhIcon } from './icons-pack.js';

export const PET_SPECIES = BH_ITEMS.filter(i => i.slot === 'C');
const SPECIES_BY_ID = Object.fromEntries(PET_SPECIES.map(p => [p.id, p]));

/* The Paddock's rarity colours are the app.css GLOW family (epic rgb 155,146,232,
   legendary 255,201,97), not `RARITIES[r].color` from js/loot.js, which is a second
   and different rarity palette used for text chips elsewhere (#c084fc epic,
   #4ade80 uncommon). The handoff specifies this family and it is what the pet cards
   already glow with, so the screen agrees with itself. If the two palettes are ever
   unified, this map is one of the places to change. */
export const PDK_RARITY = {
  common:    '#8f8578',
  uncommon:  '#a5e847',
  rare:      '#6fd0ff',
  epic:      '#9b92e8',
  legendary: '#ffc961',
};

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n || 0).toLocaleString();

/* ---- models ------------------------------------------------------------- */

/* One card = one OWNED COPY, keyed by iid. Never species+index: the bond is banked
   against the instance, so an index would move the affection to a different animal
   the first time the roster sorts differently. */
export function cardModel(row) {
  const sp = SPECIES_BY_ID[row.sp] || { name: row.sp, rarity: 'common' };
  return {
    iid: row.iid,
    sp: row.sp,                     // the SPECIES id, kept so the thumb can ink-fit its art
    name: row.name || sp.name,
    species: sp.name,
    rarity: sp.rarity,
    rarityColor: PDK_RARITY[sp.rarity] || PDK_RARITY.common,
    shiny: !!row.shiny,
    level: Math.max(1, 1 + Math.floor((row.levelSteps | 0) / 20000)),
    bond: Math.max(0, Math.min(5, row.bond | 0)),
    maxed: (row.bond | 0) >= 5,
    flavor: row.flavor || '',
    art: bhAsset(sp.id ? sp : { slot: 'C', id: row.sp }),
    /* Her swag, on the card as well as out in the field. petWornLayers owns the
       species check, so this is [] for every pet the accessories are not drawn
       for and no caller here has to remember which one that is. */
    worn: petWornLayers(row.sp, row.wear),
    tints: petWornTints(row.sp, row.wear),   // Football kit, 2026-09-04: per worn layer
  };
}

/* ONE FIGURE, N LAYERS. Every accessory is painted pre-positioned inside the pet's
   own 2048 canvas, so a layer is the base image's crop transform applied to a
   different file: the SAME inkFitStyle string, verbatim, for all of them. That is
   the whole mechanism, and doing it any other way (a per-layer nudge, a second
   fit) would be a second source of truth fighting the art.
   The wrapper is what makes the stack possible at all: the layers are absolutely
   positioned by inkFitStyle, so without a positioned box around them they would
   resolve against the page. Callers already wrap these in `.pdk-thumb` /
   `.pdk-tile`, both of which are positioned, so the layers are emitted as
   siblings of the base and inherit exactly its geometry. */
/* WHICH SHEET THESE LAYERS COME OFF, AND WHY IT IS A BOX AND NOT A FLAG.
   Every layer here was a MASTER, which was harmless while a pet was a 640 square
   and is not now: C6 and the five accessories drawn for her are 2048x2048, so one
   layer is 16.0000 MB of decoded RGBA and a dressed pet is five of them. Measured
   2026-08-24 at 430x932 DPR 2 with tests/memory-census.mjs's instrument, the
   species grid alone stood at 80.0 MB inside a 322.8 MB screen.
   THE TIER IS DERIVED, NOT NAMED, because one literal cannot be right for two
   species on the same screen. inkFitStyle blows the square up until the INK fills
   the box, and Cam paints the companion-drawn pets small in one corner of their
   640 canvas: in an 84px tile C6's whole square lands at 96px and C1's at 235px,
   so 192 is the honest tier for her and a 2.4x upscale for him. bhTierFor answers
   with the master when no tier can serve the box, which is why C1-C5 and CX come
   out of this byte-identical to before.
   `box` is the tile's own CSS width, handed in by whoever mounts it. Absent (the
   node unit tests, which have no layout) it is 0 and nothing is tiered, so the
   markup those grade is unchanged -- and the memory census asserts the decoded
   width on the live screen, because a box that arrives 0 in the app would look
   exactly like a pass while restoring all 80 MB. */
const layeredArt = (sp, art, worn, { alt = '', eager = false, box = 0, tints = [] } = {}) => {
  const tier = box ? bhTierFor(box * inkSize(sp)) : 0;
  return [art, ...(worn || [])].map((src, i) => {
    const use = tier ? bhThumb(src, tier) : src;
    /* A thumbnail that 404s falls back to the master rather than leaving a hole,
       and the fallback string is the app's own, imported rather than retyped. */
    /* Football kit, 2026-09-04: a tinted garment's multiply spans ride the same
       inkFitStyle string as its <img>, so they stay registered to it. */
    const tint = (i > 0 && tints[i - 1] ? tints[i - 1] : [])
      .map(t => `<span class="fb-tint" style="${inkFitStyle(sp)}--fbm:url('${esc(t.mask)}');background:${t.hex}" aria-hidden="true"></span>`).join('');
    return `<img src="${esc(use)}"${use === src ? '' : ` data-full="${esc(src)}" ${THUMB_FALLBACK}`}`
      + ` style="${inkFitStyle(sp)}"${i === 0 ? ` alt="${esc(alt)}"` : ' alt=""'}${eager ? ' loading="eager"' : ''}>${tint}`;
  }).join('');
};

/* The slider: every copy of ONE species, in roster order, plus the dots model. Dots
   only exist above one copy, per the handoff. */
export function sliderModel(roster, sp) {
  const copies = (roster || []).filter(r => r.sp === sp).map(cardModel);
  return { sp, copies, dots: copies.length > 1 ? copies.length : 0 };
}

/* The species grid: one tile per OWNED species, plus every unowned species as a
   locked tile, so the shelf shows what is missing rather than hiding it. */
export function gridModel(roster) {
  const owned = new Map();
  for (const r of roster || []) {
    const t = owned.get(r.sp) || { sp: r.sp, count: 0, anyShiny: false };
    t.count++; t.anyShiny = t.anyShiny || !!r.shiny;
    owned.set(r.sp, t);
  }
  /* The wardrobe is one record for the ACCOUNT, so it is read off the roster
     rather than per tile, and a LOCKED tile never gets it: a silhouette of a pet
     you do not own must not be wearing clothes you do. */
  const wear = (roster || [])[0] ? (roster || [])[0].wear : null;
  return PET_SPECIES.map(s => {
    const t = owned.get(s.id);
    return {
      sp: s.id, name: s.name, rarity: s.rarity, rarityColor: PDK_RARITY[s.rarity] || PDK_RARITY.common,
      art: bhAsset(s), owned: !!t, count: t ? t.count : 0,
      worn: t ? petWornLayers(s.id, wear) : [],
      tints: t ? petWornTints(s.id, wear) : [],
      showCount: !!t && t.count > 1, anyShiny: !!(t && t.anyShiny),
      glow: s.rarity === 'legendary' || s.rarity === 'epic',
    };
  });
}

/* "14 PETS · 5 OF 6 KINDS". Counts COPIES for pets and distinct owned species for
   kinds, which is what the handoff's demo numbers mean (14 copies, 5 of 6 species). */
export function footerLabel(roster) {
  const rows = roster || [];
  const kinds = new Set(rows.map(r => r.sp)).size;
  return `${rows.length} PET${rows.length === 1 ? '' : 'S'} · ${kinds} OF ${PET_SPECIES.length} KINDS`;
}

/* The egg card's second line carries a REAL step count. `paddockEggs()` returns
   nearest:null when nothing is incubating, and ready when the walk is done, so all
   three states say something true rather than printing a placeholder. */
export function eggCardModel(eggs) {
  const count = (eggs && eggs.count) | 0;
  const near = eggs && eggs.nearest;
  let line;
  if (!count) line = 'Nothing in the nest yet.';
  else if (!near) line = `${count} in the nest.`;
  /* THE NEST IS NOT WHERE EGGS OPEN, so a ready egg says where it does. The Paddock
     has no hatch control (hatchEgg is wired to the Backpack's Incubating rows, app.js
     [data-hatch]), and a card that only announces "ready" with nothing to press reads
     as a broken button. One line of pointing beats a second door. */
  else if (near.ready) line = `${count} in the nest. One is ready to hatch: open it in your Backpack.`;
  else line = `${count} in the nest. Nearest hatch: ${num(near.togo)} steps to go.`;
  const ready = !!(near && near.ready);
  /* READY IS 100%, whatever the goal. A ready egg carries goal 0 (loot.js grantEgg) and
     the divisor said 0%, on the tile as well as the card: both bars read this number. */
  return { count, line, pct: ready ? 1 : (near ? Math.max(0, Math.min(1, near.pct || 0)) : 0), ready };
}

/* ---- markup ------------------------------------------------------------- */

/* INK FIT. Tom: "the pets in the bottom pane seem small in their boxes they should be
   centred and bigger". They were: every pet PNG is a 640² canvas whose drawing covers
   only ~0.30 x 0.29 of it, centred at (0.70, 0.75), so `width:84%; object-fit:contain`
   drew ~25% of the box worth of pet and parked it low and right of centre. Box-fitting
   a figure is exactly what the figure contract's rule 3 forbids.
   FILL is the ink's longest edge as a fraction of the box, matching croppedPetImg's
   0.82 so a Paddock pet is the same visual size as the same pet anywhere else. This is
   croppedPetImg's maths in percentages instead of pixels, so one style string is right
   for the 54px card thumb and for a fluid grid tile, and it anchors the art at the
   box's top-left for the same reason croppedPetImg does: these boxes are
   `overflow:hidden`, and Chrome clamps a centred OVERFLOWING grid item back to the
   start edge in the block axis, so `place-items:center` centred the art across and
   dropped it 0.85 of a box low. Never trust the parent's alignment for a figure.
   An unknown species returns '' and keeps the plain contain fit rather than guessing. */
const INK_FILL = 0.82;
/* HOW MUCH BIGGER THAN ITS BOX THE SQUARE HAS TO BE DRAWN for the ink to fill it.
   Split out of inkFitStyle because layeredArt needs the same number to pick a
   tier: the box a LAYER lands in is this multiple of the box the TILE occupies,
   and using the tile's width would under-tier every companion-drawn pet by 2-3x. */
const inkSize = (sp, fill = INK_FILL) => {
  const c = PET_CROP[sp];
  return c ? fill / Math.max(c.x1 - c.x0, c.y1 - c.y0) : 1;
};
export function inkFitStyle(sp, fill = INK_FILL) {
  const c = PET_CROP[sp];
  if (!c) return '';
  const cw = c.x1 - c.x0, ch = c.y1 - c.y0;
  const size = inkSize(sp, fill);                           // image size, fraction of the box
  const tx = (0.5 / size - (c.x0 + cw / 2)) * 100;          // ink centre -> box centre, % of the IMAGE
  const ty = (0.5 / size - (c.y0 + ch / 2)) * 100;
  /* WIDTH ONLY, height:auto. A percentage HEIGHT resolves against a grid row that is
     itself sized from this image's auto height, and the browser settles that in two
     passes: `height:279%` measured 623px on a 223px-wide image in an 84px tile. The
     art is square, so auto height is the width and needs no second guess. */
  return `position:absolute;left:0;top:0;width:${(size * 100).toFixed(1)}%;height:auto;max-width:none;transform:translate(${tx.toFixed(1)}%,${ty.toFixed(1)}%)`;
}

/* REAL HEARTS. Tom: "tapping the give hearts thing gives red dots not hearts". They
   were CSS circles (and the burst glyphs were rotated rounded squares), which at 17px
   read as dots because that is what they were. This is game-icons.net's heart (Skoll,
   CC-BY 3.0), added through assets/icons-proposal + the manifest and regenerated with
   gen_icons.mjs rather than pasted into the generated file, so a future regen keeps it.
   Icon-system rules: flat fill, no rim, tint from the manifest (#fd6857 coral), and
   the soft drop-shadow lives in CSS. An empty pip is the SAME shape dimmed, so five
   hearts read as five hearts whether or not they are filled.
   THE TINT MUST BE `currentColor`, NOT THE MANIFEST'S. bhIcon inlines
   `style="color:#fd6857"` on the svg when no tint is passed, and an inline style beats
   the `.pdk-heart { color:#26232e }` / `.on { color:#fd6857 }` pair on the wrapper: every
   pip painted coral, so a bond of 2 read as a bond of 5 and the meter said nothing.
   Passing currentColor hands the decision back to the wrapper's CSS, which is the only
   thing that knows which pips are filled. bhIcon itself is unchanged: its other call
   sites want the manifest tint. */
const heartsHtml = n => Array.from({ length: 5 }, (_, i) =>
  `<i class="pdk-heart${i < n ? ' on' : ''}" aria-hidden="true">${bhIcon('heart', 17, 'currentColor')}</i>`).join('');

/* THE TWO BOXES A PET LAYER LANDS IN, and both are needed before the markup
   exists, so neither can be measured off the element it describes.
     PDK_THUMB_PX  the card's portrait is FIXED (app.css .pdk-thumb:
                   `flex: 0 0 54px`), so it is declared, not measured.
     the tile      is FLUID -- a quarter of a panel whose width is the sheet's --
                   so mountPaddockPanel measures the mounted panel and hands the
                   number down. Gaps are deliberately NOT subtracted: an over-
                   estimate can only choose a LARGER tier, so the error direction
                   is toward sharpness and never toward blur. */
const PDK_THUMB_PX = 54;
const PDK_COLS = 4;                 // app.css .pdk-grid: repeat(4, minmax(0, 1fr))
const pdkTileBox = el => Math.ceil((el && el.clientWidth ? el.clientWidth : 0) / PDK_COLS);

export function cardHtml(m) {
  return `<article class="pdk-card" data-iid="${esc(m.iid)}">
    <button class="pdk-x-btn" data-act="close" aria-label="Close">×</button>
    <div class="pdk-head">
      <span class="pdk-thumb">${layeredArt(m.sp, m.art, m.worn, { eager: true, box: PDK_THUMB_PX, tints: m.tints })}</span>
      <div class="pdk-id">
        <b class="pdk-name">${esc(m.name)}</b>
        <span class="pdk-chips">
          <span class="pdk-chip pdk-rar" style="background:${m.rarityColor}">${esc(m.rarity)}</span>
          ${m.shiny ? '<span class="pdk-chip pdk-shiny">SHINY</span>' : ''}
          <span class="pdk-chip pdk-lv">LV ${m.level}</span>
        </span>
      </div>
    </div>
    <p class="pdk-flavor">${esc(m.flavor)}</p>
    <div class="pdk-bond" data-bond="${m.bond}">${heartsHtml(m.bond)}</div>
    ${m.maxed ? '<span class="pdk-bff">BEST FRIEND</span>' : ''}
    <div class="pdk-acts">
      <button class="pdk-btn pdk-btn-pet" data-act="pet" data-iid="${esc(m.iid)}">Pet</button>
      <button class="pdk-btn pdk-btn-feed" data-act="feed" data-iid="${esc(m.iid)}">Feed</button>
    </div>
  </article>`;
}

/* Locked and egg cards carry NO hearts and NO buttons: there is nothing to bond
   with, and offering a control that cannot work is worse than not offering it. */
export function lockedCardHtml(sp) {
  const s = SPECIES_BY_ID[sp] || { name: sp };
  return `<article class="pdk-card pdk-locked" data-sp="${esc(sp)}">
    <button class="pdk-x-btn" data-act="close" aria-label="Close">×</button>
    <div class="pdk-head"><span class="pdk-thumb pdk-sil"><img src="${esc(bhAsset(s.id ? s : { slot: 'C', id: sp }))}" style="${inkFitStyle(sp)}" alt=""></span>
      <div class="pdk-id"><b class="pdk-name">${esc(s.name)}</b></div></div>
    <p class="pdk-flavor">${esc(lockedFlavor(sp))}</p>
  </article>`;
}

/* Tom, 2026-08-31: "make the mystery just pets they dont have yet outside of
   the founders lizard because that wont be available to nonbeta testers."
   Every locked card used to carry the founder line, so a pet the player simply
   had not hatched yet read as forever unobtainable, which is exactly backwards:
   a completionist filed it as an uncompletable collection. Three honest cases,
   and only the Lizard's is a closed door. */
function lockedFlavor(sp) {
  if (sp === 'CX') return "A founder's companion, from the very first days of Boneheadz. Wears it proudly on someone else's shoulder.";
  if (sp === 'C6') return 'Not yours yet. Gwart sells her in the Emporium, for those with deep pockets.';
  return 'Not yours yet. Eggs know the way.';
}

export function eggCardHtml(eggs) {
  const m = eggCardModel(eggs);
  return `<article class="pdk-card pdk-egg">
    <button class="pdk-x-btn" data-act="close" aria-label="Close">×</button>
    <div class="pdk-head"><span class="pdk-thumb pdk-eggico" aria-hidden="true"></span>
      <div class="pdk-id"><b class="pdk-name">SOUL EGGS ×${m.count}</b></div></div>
    <p class="pdk-flavor">${esc(m.line)}</p>
    <div class="pdk-eggbar"><i style="width:${Math.round(m.pct * 100)}%"></i></div>
  </article>`;
}

export function sliderHtml(roster, sp) {
  const { copies, dots } = sliderModel(roster, sp);
  if (!copies.length) return lockedCardHtml(sp);
  return `<div class="pdk-slider" data-sp="${esc(sp)}">
    <div class="pdk-rail">${copies.map(cardHtml).join('')}</div>
    ${dots ? `<div class="pdk-dots">${copies.map((c, i) =>
      `<i class="pdk-dot${i === 0 ? ' on' : ''}" data-i="${i}"></i>`).join('')}</div>` : ''}
  </div>`;
}

/* TWO THINGS ONLY THE CALLER CAN ANSWER, so neither is guessed here.
 *
 * `showTeaser` false = this player already owns the Day One Lizard. The banner
 * rendered unconditionally, so the veteran who has carried the Lizard since the
 * beta was advertised his own pet and, on tapping it, handed the locked card
 * telling him someone ELSE owns one. Ownership comes off the cosmetic inventory
 * (a legacy grant never made an instance row), which is openPaddock's to read.
 * This is the one place Tom's 2026-08-31 mystery ruling keeps its exception:
 * the bushes tease something huntable, the banner teases the founder pet, and
 * neither is shown to somebody who already has it.
 *
 * `inField` = how many roster rows actually got a place in the scene. The walk
 * cap is 8, so a 16-pet roster puts 14 animals on the grass while the footer
 * says 16 and nothing explains the other two. This is the sentence that does.
 * Absent (openFriendPaddock, the unit tests) means "claim no number", which is
 * why it is a null check and not a falsy one. */
export function panelHtml(roster, eggs, { tileBox = 0, showTeaser = true, inField = null } = {}) {
  const tiles = gridModel(roster);
  const egg = eggCardModel(eggs);
  const total = (roster || []).length;
  const out = inField == null ? null : Math.max(0, Math.min(inField | 0, total));
  return `<div class="pdk-inner">
    ${showTeaser ? `<button class="pdk-teaser" data-sp="CX">
      <span class="pdk-thumb pdk-sil"><img src="${esc(bhAsset(SPECIES_BY_ID.CX || { slot: 'C', id: 'CX' }))}" style="${inkFitStyle('CX')}" alt=""></span>
      <span class="pdk-teaser-tx"><small>SOMETHING'S IN THE BUSHES</small>
        <b>Riding since day one? Check your inbox, bony buddy.</b></span>
    </button>` : ''}
    <div class="pdk-grid">
      ${/* AN EMPTY NEST DOES NOT DRAW A FULL EGG. The glyph was unconditional, so the
           tile showed an egg at full strength while the card behind it said "SOUL EGGS
           ×0 / Nothing in the nest yet". Dimmed rather than removed: the tile is still
           the door to the nest, and an empty square would not read as one. */''}
      <button class="pdk-tile pdk-eggtile" data-egg="1">
        <span class="pdk-eggico${egg.count ? '' : ' pdk-empty'}" aria-hidden="true"></span>
        <span class="pdk-eggbar"><i style="width:${Math.round(egg.pct * 100)}%"></i></span>
      </button>
      ${tiles.map(t => `<button class="pdk-tile${t.owned ? '' : ' pdk-lockt'}${t.glow ? ' r-' + t.rarity : ''}" data-sp="${esc(t.sp)}">
        ${layeredArt(t.sp, t.art, t.worn, { alt: t.name, box: tileBox, tints: t.tints })}
        ${t.showCount ? `<span class="pdk-x">×${t.count}</span>` : ''}
        ${t.anyShiny ? '<span class="pdk-star" aria-hidden="true"></span>' : ''}
        ${t.owned ? '' : '<span class="pdk-q">?</span>'}
      </button>`).join('')}
    </div>
    ${/* NOT A TAB BAR. Two segments, one disabled and one lit lime, read as a toggle
         whose other half was broken: the lit one is a COUNT, not a selected tab, and
         BONEPEDIA is not built. So the count is a label (it was never a control), and
         the door that does not open yet says so. */''}
    <div class="pdk-foot">
      <button class="pdk-seg" data-seg="pedia" disabled>BONEPEDIA · SOON</button>
      <span class="pdk-seg pdk-count">${esc(footerLabel(roster))}</span>
    </div>
    ${out !== null && out < total ? `<p class="pdk-bench">${out} of ${total} out today, the rest are resting.</p>` : ''}
  </div>`;
}

/* ---- live half: state, mount, handlers ---------------------------------- *
 * The slider owns its OWN state (Reggie's call, so neither half waits on the
 * other): the scene calls open on a pet tap and close on a scene tap, and asks
 * isPaddockCardOpen() for the coach mark. Nothing else crosses the seam.
 */
import { bondUp } from './loot.js';
import { haptic } from './haptics.js';

let sel = null;        // species id whose slider is open, or null
let host = null;       // the element the cards are mounted into
let rosterRef = [];    // the roster the open slider was built from

export function isPaddockCardOpen() { return sel !== null; }
export function paddockSel() { return sel; }

export function closePaddockCards() {
  sel = null;
  if (host) host.innerHTML = '';
  host?.classList.remove('pdk-open');
  host?.classList.remove('pdk-hi');
  markPanelSelection(null);
  /* detach from the element we ATTACHED to, not from whatever #pdkScene resolves to
     now: on a second visit that is a different element and this removed nothing */
  if (outsideTap && tapScene) tapScene.removeEventListener('click', outsideTap, true);
  outsideTap = null; tapScene = null;
}

/* SECOND VISIT. The sheet can close without this module hearing about it (openPaddock
   has no onClose into here), so `sel` and `host` outlive the DOM they described and the
   next visit starts with a lie: the first tap on whichever species was last open hit
   `sel === sp`, "closed" a card that no longer existed, and did nothing. Liveness is
   the check, not a flag: if the host is no longer in the live document, there is no
   open card, whatever the module last remembered. */
function dropStaleState() {
  if (sel !== null && !(host && host.isConnected)) { sel = null; host = null; }
}

/* EVERY WAY OUT LIVES HERE, TOGETHER. Tom: "it's kinda hard to get out of the paddock
 * feed/affection for pet dialogue". There were two exits and both were guessable only
 * if you already knew them: tap the same pet again, or leave the sheet. Now there are
 * four, and they are declared in one place so the rules cannot drift apart:
 *   1. tap the same species again        (openPaddockCards, below)
 *   2. the × on the card                 (wired in wire())
 *   3. tap anywhere in the scene that is not the card
 *   4. leave the sheet                   (unchanged, the sheet owns that)
 * The outside-tap listener is CAPTURING and checks the target itself rather than
 * relying on stopPropagation inside the card: a capturing listener sees the tap first,
 * so a card control can never be swallowed by the dismisser, and the pets underneath
 * stay tappable because a tap on another pet closes this card and the scene's own
 * handler then opens that one. */
let outsideTap = null;
let tapScene = null;      // the #pdkScene element the listener is attached to
/* KEYED ON THE ELEMENT, NOT ON `outsideTap` BEING TRUTHY. A sheet close leaves the
   listener nulled only if closePaddockCards ran, and nothing calls it when the sheet
   goes away, so `outsideTap` stayed set while its scene was destroyed: this returned
   early on the next visit and exit 3 was dead for the rest of the session. Re-arm
   whenever the live scene is not the one we attached to. */
function armOutsideTap() {
  const scene = document.getElementById('pdkScene');
  if (!scene) return;
  if (outsideTap && tapScene === scene) return;
  if (outsideTap && tapScene) tapScene.removeEventListener('click', outsideTap, true);
  outsideTap = e => {
    if (!sel) return;
    if (host && host.contains(e.target)) return;          // inside the card: not a dismissal
    /* A TAP ON A PET OR THE NEST IS THE SCENE'S OWN, and exit 1 and exit 3 were
       cancelling each other on it. This listener captures, so on a re-tap of the OPEN
       species it closed the card first; the scene's bubbling handler then saw sel ===
       null, and openPaddockCards REOPENED instead of dismissing. The card was destroyed
       and silently rebuilt, so the exit the player was told about did nothing (proven by
       stamping the card node and reading a different node back). Let the scene answer
       for its own targets: a different pet opens that pet, the same one closes. */
    if (e.target.closest && e.target.closest('[data-pdk], #pdkNest')) return;
    closePaddockCards();
  };
  tapScene = scene;
  scene.addEventListener('click', outsideTap, true);
}

/* SCROLL THE RAIL TO ONE COPY, by index into the open species' copies. Two callers,
   one rule: the field opens the animal you actually tapped, and a dot moves to the copy
   it stands for. offsetLeft is measured against the same offsetParent for the rail and
   for its cards, so the difference is the card's position INSIDE the scroller and no
   caller has to know where the host sits. Setting scrollLeft fires the rail's own
   scroll listener, which is what repaints the dots: there is no second source of truth
   for which copy is current. */
function scrollToCopy(i) {
  const rail = host && host.querySelector('.pdk-rail');
  const card = rail && rail.querySelectorAll('.pdk-card')[i];
  if (!card) return;
  /* CENTRED, because the cards are `scroll-snap-align: center` and narrower than the
     rail: parking the card's left edge at the rail's would leave the snap to argue with
     us afterwards. This is the same centre the scroll handler picks the lit dot by. */
  rail.scrollLeft = card.offsetLeft - rail.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2;
}

/* Re-tap dismiss lives HERE rather than in the scene, so the rule is one line and
   cannot disagree with itself: opening the species already open closes it.
   `iid` is the COPY that was tapped out in the field. Optional: the panel's species
   tiles have no copy to name and open at the first one, as before. */
/* WHICH TILE IS OPEN, SAID ON THE TILE. A grid tap gave no pressed and no
   selected state at all, so the only feedback that anything happened was a card
   appearing 278px away (measured 2026-08-31 at 430x932: tile centre y754, card
   centre y476). The lit tile is the other half of leading the eye. */
function markPanelSelection(sp) {
  document.querySelectorAll('#pdkPanel .pdk-tile.on, #pdkPanel .pdk-teaser.on')
    .forEach(b => b.classList.remove('on'));
  if (!sp) return;
  const sel = sp === 'egg' ? '#pdkPanel [data-egg]' : `#pdkPanel [data-sp="${CSS.escape(sp)}"]`;
  document.querySelectorAll(sel).forEach(b => b.classList.add('on'));
}

export async function openPaddockCards(sp, iid, { from = null } = {}) {
  /* THE SCENE CALLS THIS WITH ONE ARGUMENT (js/app.js: the #pdkScene tap handler and
     the nest), so the module fetches its own data and owns its own host rather than
     making the scene carry state for it. Re-tap dismiss lives here too, so the rule
     is one line and cannot disagree with itself. */
  dropStaleState();                       // a previous visit's sel/host may be dead DOM
  if (sel === sp) { closePaddockCards(); return false; }
  const scene = document.getElementById('pdkScene');
  if (!scene) return false;
  host = document.getElementById('pdkCards');
  if (!host) {
    host = document.createElement('div');
    host.id = 'pdkCards';
    host.className = 'pdk-host';
    scene.appendChild(host);
  }
  const { paddockRoster, paddockEggs } = await import('./paddock.js');
  const [roster, eggs] = await Promise.all([paddockRoster(), paddockEggs()]);
  sel = sp;
  rosterRef = roster;
  host.innerHTML = sp === 'egg' ? eggCardHtml(eggs) : sliderHtml(rosterRef, sp);
  host.classList.add('pdk-open');
  /* THE CARD SITS LOW BY DEFAULT, which is the half of the screen every door
     into it is on: the collection grid is BELOW the scene, and a card pinned at
     y284 landed 278px above the tile the finger just pressed. Low means it ends
     at the panel's own top edge, about a tile's height from the tap.
     A FIELD TAP THEN MEASURES, rather than being told: mount low, and if the
     card actually covers the figure the player pressed, try high and keep
     whichever of the two covers less. Measuring beats a rule of thumb here
     because the answer depends on the row the animal happens to be standing on,
     which is placePaddock's business and not this module's. */
  host.classList.remove('pdk-hi');
  if (from) {
    const fr = from.getBoundingClientRect();
    const cover = () => { const r = host.getBoundingClientRect(); return Math.max(0, Math.min(r.bottom, fr.bottom) - Math.max(r.top, fr.top)); };
    const low = cover();
    if (low > 0) {
      host.classList.add('pdk-hi');
      if (cover() >= low) host.classList.remove('pdk-hi');
    }
  }
  markPanelSelection(sp);
  /* THE COACH MARK IS NOT SCENERY WHILE A CARD IS OPEN. It sits at z-index 9 over the
     host's 6 and covers exactly where a tall card's Pet/Feed row lands, and because it
     is OUTSIDE the card the outside-tap dismisser read the press as "close". The scene's
     own pet handler already dropped it; the panel and the nest never did, so every card
     opened from the grid kept it. Dropped HERE, where every door passes. */
  document.getElementById('pdkCoach')?.remove();
  wire();
  /* open on the copy the player tapped, not on copy 1 */
  if (iid) {
    const i = rosterRef.filter(r => r.sp === sp).findIndex(r => r.iid === iid);
    if (i > 0) scrollToCopy(i);
  }
  armOutsideTap();
  return true;
}

/* The collection panel is not tap-driven: it is the screen's lower half and must be
   there the moment the Paddock opens. The scene leaves `#pdkPanel` empty for me. */
export async function mountPaddockPanel({ showTeaser = true, inField = null } = {}) {
  const el = document.getElementById('pdkPanel');
  if (!el) return false;
  const { paddockRoster, paddockEggs } = await import('./paddock.js');
  const [roster, eggs] = await Promise.all([paddockRoster(), paddockEggs()]);
  el.innerHTML = panelHtml(roster, eggs, { tileBox: pdkTileBox(el), showTeaser, inField });
  el.querySelectorAll('[data-sp]').forEach(b => b.addEventListener('click', () => openPaddockCards(b.dataset.sp)));
  el.querySelector('[data-egg]')?.addEventListener('click', () => openPaddockCards('egg'));
  return true;
}

function wire() {
  const rail = host.querySelector('.pdk-rail');
  /* DOTS FOLLOW THE REAL SCROLL. Not a click counter and not an index we increment
     ourselves: the carousel is scroll-snap, so a swipe moves it without telling us,
     and any state we kept in parallel would drift from what the player sees. */
  if (rail) rail.addEventListener('scroll', () => {
    const cards = [...rail.querySelectorAll('.pdk-card')];
    if (!cards.length) return;
    const mid = rail.scrollLeft + rail.clientWidth / 2;
    let best = 0, bestD = Infinity;
    cards.forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bestD) { bestD = d; best = i; } });
    host.querySelectorAll('.pdk-dot').forEach((d, i) => d.classList.toggle('on', i === best));
  }, { passive: true });

  /* AND THE DOTS ARE A CONTROL, not a readout. They shipped with no handler at all, so
     the one affordance that says "there are more of these" did nothing when pressed. */
  host.querySelectorAll('.pdk-dot').forEach((d, i) => d.addEventListener('click', e => {
    e.stopPropagation();
    scrollToCopy(i);
  }));

  host.querySelectorAll('.pdk-x-btn').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    closePaddockCards();
  }));
  host.querySelectorAll('.pdk-btn').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    const iid = b.dataset.iid, kind = b.dataset.act;
    const card = host.querySelector(`.pdk-card[data-iid="${CSS.escape(iid)}"]`);
    if (!card || b.disabled) return;
    b.disabled = true;
    /* ASK THE AUTHORITY, THEN PAINT. bondUp is the persisted write and it refuses a
       ghost iid by name, so rendering from its RETURN means a refusal can never
       paint a heart that was not banked. Incrementing a local copy would. */
    const res = await bondUp(iid).catch(() => ({ ok: false, reason: 'threw' }));
    b.disabled = false;
    if (!res || !res.ok) return;
    paintBond(card, res.bond, res.maxed);
    /* AND THE ANIMATION MUST NOT LIE. changed:false means the cap refused the
       press, so there is nothing to celebrate: no burst. That is the invisible
       punch lesson inverted, an FX that plays over a write that never happened. */
    if (res.changed) { burst(card, kind); try { haptic.success(); } catch { /* haptics optional */ } }
  }));
}

export function paintBond(card, bond, maxed) {
  const hearts = [...card.querySelectorAll('.pdk-heart')];
  hearts.forEach((h, i) => h.classList.toggle('on', i < bond));
  card.querySelector('.pdk-bond')?.setAttribute('data-bond', String(bond));
  if (maxed && !card.querySelector('.pdk-bff')) {
    const b = document.createElement('span');
    b.className = 'pdk-bff pdk-pop';
    b.textContent = 'BEST FRIEND';
    card.querySelector('.pdk-bond')?.after(b);
  }
}

/* Three glyphs, staggered, drifting up and fading. Hearts for Pet, bones for Feed. */
export function burst(card, kind) {
  const head = card.querySelector('.pdk-head') || card;
  const wrap = document.createElement('span');
  wrap.className = 'pdk-burst';
  for (let i = 0; i < 3; i++) {
    const g = document.createElement('i');
    g.className = `pdk-glyph pdk-${kind === 'feed' ? 'bone' : 'heart'}g`;
    /* the floating glyphs are the same real heart, so the burst matches the meter it
       fills; Feed keeps its bone shape, which was never a dot */
    if (kind !== 'feed') g.innerHTML = bhIcon('heart', 13);
    g.style.animationDelay = `${i * 100}ms`;
    g.style.setProperty('--dx', `${(i - 1) * 14}px`);
    wrap.appendChild(g);
  }
  head.appendChild(wrap);
  setTimeout(() => wrap.remove(), 950);
}

/* THE SEAM. Webdriver-only, and it stays after the scene shell lands: it mounts the
   REAL builders with a REAL roster and wires the REAL handlers, so the audit drives
   what ships instead of hand-calling functions. Deleting a seam that earns its keep
   is how audits drift back to proving nothing. */
export function installPaddockSeam() {
  if (typeof window === 'undefined' || navigator.webdriver !== true) return;
  window.__pdkMountCards = async (sp) => {
    const { paddockRoster } = await import('./paddock.js');
    const roster = await paddockRoster();
    const opened = await openPaddockCards(sp);
    return { opened, copies: roster.filter(r => r.sp === sp).length, open: isPaddockCardOpen() };
  };
  window.__pdkClose = () => { closePaddockCards(); return isPaddockCardOpen(); };
}

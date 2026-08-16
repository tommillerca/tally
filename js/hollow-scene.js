/* js/hollow-scene.js — THE HOLLOW'S STATIC BACKDROP.
 *
 * Every drawn object here comes out of HLW_ART (the designer's 27 shipped SVG
 * pieces) through hlwArt(). Nothing in this file is hand-inked scenery. The two
 * exceptions are flagged inline and in gwart/HOLLOW-BACKDROP-REPORT.md:
 *   - the path's two curved bands and the sign's "THE HOLLOW" label, which the
 *     handoff never shipped as trimmable pieces (a full-scene bezier and a text
 *     run; NOTES.md: "Text is never baked in"). Both are copied VERBATIM from
 *     the designer's prototype, not restyled.
 *   - the gradients: sky glow, the dusk/night tints, the two warm glows and the
 *     fireflies. NOTES.md specifies those as CSS values, not as art.
 *
 * COORDINATES ARE THE COMP'S, taken from "The Hollow.dc.html" and mapped through
 * each piece's own viewBox origin (hlwArt anchors the viewBox min-corner at x,y,
 * so a piece whose vb starts at "136 54" goes back to its comp spot at x:136,
 * y:54). The comp is 900/930 tall and the shipped stage is 740, so the only
 * pieces that moved are the ones the crop would have pushed off the bottom edge;
 * each says so. The path running off the bottom is intended, not a bug.
 *
 * NOTHING HERE IS INTERACTIVE. Every node carries pointer-events:none so the
 * backdrop can never sit between a thumb and a bed, and tests/hollow-backdrop-
 * audit.mjs hit-tests an 800-point grid to keep it that way.
 */
import { hlwArt } from './hollow-art.js';

export const HLW_STAGE = { w: 390, h: 740 };   // the shipped stage, not the comp's 900

const NONE = 'pointer-events:none';

/* THE STEPPING STONES. Comp centres, trimmed to the 13 that land on a 740 stage
   (the comp's last three sit at cy 764/810/854, entirely below the crop). The
   dirt band keeps running past the bottom edge, which is the intended read. */
const STONES = [
  [196, 172, 21], [200, 216, 17], [196, 260, 22], [200, 304, 17],
  [195, 350, 21], [199, 396, 17], [196, 442, 22], [200, 488, 17],
  [196, 534, 21], [191, 580, 17], [196, 626, 22], [198, 672, 17], [195, 718, 21],
];
/* hollow-path-stone is drawn at rx 21 inside a 46x21 box with its centre at
   (23,11). Scale to the comp's rx and re-centre from the centre, not the corner. */
const stone = ([cx, cy, rx]) => {
  const s = rx / 21;
  return hlwArt('hollow-path-stone', { x: cx - 23 * s, y: cy - 11 * s, w: 46 * s, style: NONE });
};

/* The six fireflies of NOTES.md, comp positions and comp duration/delay pairs.
   Two of them (comp y 780 and 845) fell below the 740 crop and were lifted into
   the lower third rather than dropped: NOTES.md says SIX. */
const FLIES = [
  [60, 540, 5, 6, 0], [300, 480, 4, 7, 1.4], [140, 680, 5, 5.4, 2.6],
  [330, 700, 4, 6.6, 0.8], [44, 690, 4, 7.4, 3.4], [220, 420, 4, 6, 4.2],
];

/* EVERY STAGGER IS A NEGATIVE DELAY, and that is not cosmetic.
 * app.css's prefers-reduced-motion block caps animation-duration and
 * animation-iteration-count. It does NOT cap animation-delay, so an ambient loop
 * carrying the handoff's positive stagger sits in playState "running" for the
 * whole delay with reduce on: measured, 8 of these reported running 400ms in,
 * the longest for 4.2s. Negating the delay is exactly equivalent for an infinite
 * loop (it phase-shifts instead of waiting), it keeps the designer's staggers,
 * and it lets the iteration cap actually finish them. Do not turn these positive.
 */
const stagger = s => -s;

/* The three grass tufts. One asset, three placements: comp tuft 1 sits at its own
   viewBox origin, tufts 2 and 3 are its comp offsets. Durations/delays verbatim
   from hollow-anim.css (3.2s/0 · 3.8s/.6s · 3.5s/1.1s). hlwSway's origin is
   50% 100% of the box, and the box is trimmed to the tuft, so the base pivots. */
/* Tuft 2 sits at (340,620), not the comp's (327,639): the compost heap had to
   come up 18 units to clear the 740 floor and it brought its steam glyphs with
   it, which then landed on top of this tuft. Measured in the render, both read
   as one blob at (322,654). Nudged clear rather than dropped. */
const TUFTS = [[27, 659, 28, 3.2, 0], [340, 620, 28, 3.8, 0.6], [138, 715, 24, 3.5, 1.1]];

const glow = (x, y, w, h, shape, rgba, secs) =>
  `<span style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:50%;background:radial-gradient(${shape},${rgba},transparent 68%);animation:hlwGlow ${secs}s ease-in-out ${stagger(0)}s infinite;${NONE};z-index:3"></span>`;

export function hollowBackdropHtml({ band } = {}) {
  const lit = band !== 'day';   // NOTES.md: glowOn = band !== day

  return `
  ${/* sky glow, verbatim comp gradient */''}
  <div style="position:absolute;inset:0;z-index:0;${NONE};background:radial-gradient(80% 30% at 50% 0%,rgba(255,236,180,.14),transparent 70%)"></div>

  ${/* THE PATH BANDS. Not in HLW_ART: a 730-unit bezier is not a trimmable piece.
        Both <path> elements are the designer's own, character for character. */''}
  <svg viewBox="0 0 ${HLW_STAGE.w} ${HLW_STAGE.h}" style="position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0;${NONE}">
    <path d="M195 150 C205 240 184 380 196 500 C206 590 188 680 195 790 C198 830 195 860 195 880" stroke="#44532f" stroke-width="46" fill="none" stroke-linecap="round" opacity=".45"></path>
    <path d="M195 150 C205 240 184 380 196 500 C206 590 188 680 195 790 C198 830 195 860 195 880" stroke="#7d7257" stroke-width="38" fill="none" stroke-linecap="round" opacity=".85"></path>
  </svg>
  <div style="position:absolute;inset:0;z-index:0;${NONE}">${STONES.map(stone).join('')}</div>

  ${/* FENCE. Left run ends at the sign post, right run carries the gate post and
        its cap; the gap between them is the gate, over the path. */''}
  <div style="position:absolute;inset:0;z-index:0;${NONE}">
    ${hlwArt('hollow-fence-left', { x: 6, y: 112, style: NONE })}
    ${hlwArt('hollow-fence-right', { x: 231, y: 105, style: NONE })}
  </div>

  ${/* THE CROW. Comp spot (26,150) plus the piece's own viewBox origin. It stands
        on the grass: the comp perched it on a small rock, and the rock is one of
        the two things the asset pack never shipped (see the report). Bob only —
        app.css carries hlwCrowBob but no flap keyframe, and app.css is not mine. */''}
  <div style="position:absolute;left:39px;top:152px;width:45px;height:25px;z-index:0;${NONE};animation:hlwCrowBob 5s ease-in-out ${stagger(0)}s infinite;transform-origin:50% 100%">
    ${hlwArt('hollow-crow', { style: NONE })}
  </div>

  ${/* HANGING SIGN. Board top lands at y84, clear of the Dynamic Island zone
        (~y10-48) exactly as the handoff requires. The label is a text run the
        pack deliberately does not bake in; attributes are the comp's. */''}
  <div style="position:absolute;inset:0;z-index:0;${NONE}">
    ${hlwArt('hollow-sign', { x: 136, y: 54, style: NONE })}
    <svg viewBox="136 54 133 114" style="position:absolute;left:136px;top:54px;width:133px;height:114px;overflow:visible;${NONE}">
      <g transform="rotate(-2 205 102)"><text x="205" y="110" text-anchor="middle" font-family="Bangers, sans-serif" font-size="23" letter-spacing="2" fill="#f2e9d7">THE HOLLOW</text></g>
    </svg>
  </div>

  ${/* SEED SHED. The comp draws it as one group at translate(292 44); the pack
        splits it into body, hanging lantern, crate and sack, whose viewBoxes are
        all in that same group space, so the group offset puts them back. The sack
        is the one exception: the pack redrew it taller than the comp's, so it is
        seated on the shed's ground line instead of the comp's y. */''}
  <div style="position:absolute;inset:0;z-index:0;${NONE}">
    ${hlwArt('hollow-shed', { x: 281, y: 51, style: NONE })}
    ${hlwArt('hollow-shed-lantern', { x: 307, y: 105, style: NONE })}
    ${hlwArt('hollow-crate', { x: 292, y: 136, style: NONE })}
    ${hlwArt('hollow-sack', { x: 350, y: 121, style: NONE })}
    ${lit ? glow(301, 54, 70, 56, 'ellipse', 'rgba(255,190,130,.5)', 3) : ''}
  </div>

  ${/* GRASS TUFTS */''}
  <div style="position:absolute;inset:0;z-index:0;${NONE}">
    ${TUFTS.map(([x, y, w, d, dl]) => hlwArt('hollow-grass-tuft', { x, y, w, style: `${NONE};animation:hlwSway ${d}s ease-in-out ${stagger(dl)}s infinite;transform-origin:50% 100%` })).join('')}
  </div>

  ${/* COMPOST HEAP, bottom-right per the comp. Raised 18 units from its comp y
        (694 -> 676) because the comp's 900-tall stage let it finish at 754 and
        this one ends at 740. Steam glyphs are the comp's, on app.css's hlwSteam. */''}
  <div style="position:absolute;left:256px;top:676px;width:112px;height:60px;z-index:0;${NONE}">
    ${hlwArt('hollow-compost', { style: NONE })}
    <span style="position:absolute;left:34px;top:-26px;color:#9fc27a;font-size:16px;animation:hlwSteam 2.6s ease-out ${stagger(0)}s infinite">〜</span>
    <span style="position:absolute;left:66px;top:-22px;color:#9fc27a;font-size:14px;animation:hlwSteam 2.6s ease-out ${stagger(1.2)}s infinite">〜</span>
  </div>

  ${/* LANTERN. The pack draws post, cap, glass and base as ONE piece 151 tall, a
        little longer than the comp's separate post, so it is anchored by its FOOT
        at the stage floor (740 - 151 = 589); that puts the glass within 2 units of
        the comp's y and keeps the post out of the crop. Flame is its own piece and
        rides the same origin. Glass and flame are always drawn; only the glow is
        gated on the band (NOTES.md). */''}
  <div style="position:absolute;inset:0;z-index:0;${NONE}">
    ${hlwArt('hollow-lantern-post', { x: 75, y: 589, style: `${NONE};filter:drop-shadow(0 0 5px rgba(255,217,138,.95)) drop-shadow(0 0 16px rgba(255,217,138,.6))` })}
    ${hlwArt('hollow-lantern-flame', { x: 82.5, y: 614, style: NONE })}
    ${lit ? glow(38, 572, 96, 96, 'circle', 'rgba(255,217,138,.42)', 4) : ''}
  </div>

  ${/* TIME OF DAY. Dusk is TWO layers (NOTES.md): a soft-light wash plus a normal
        gradient. Night is one. Both sit at z8, over the beds and the keeper and
        under the coin chip, which is where the comp puts them. */''}
  ${band === 'dusk' ? `<div style="position:absolute;inset:0;z-index:8;${NONE};background:rgba(201,127,90,.2);mix-blend-mode:soft-light"></div>
  <div style="position:absolute;inset:0;z-index:8;${NONE};background:linear-gradient(180deg,rgba(201,127,90,.16),rgba(60,40,70,.18))"></div>` : ''}
  ${/* .22, not the handoff's .42. Tom's call, 2026-08-16, and the reason is worth
        keeping: at .42 the grass measured (64,78,62) against a spec of (97,116,66),
        a 27% luminance cut, and his first reaction to a night render was "why does
        it look like there is a dark overlay on top of the hollow". A time-of-day
        effect that reads as a defect is failing at its job whatever the spec says.
        At .22 the lantern, the shed glow and the fireflies carry the nighttime
        instead of the wash doing all of it. Day is untouched and measures within
        2 luma of spec. */''}
  ${band === 'night' ? `<div style="position:absolute;inset:0;z-index:8;${NONE};background:rgba(22,28,58,.22)"></div>` : ''}
  ${lit ? `<div style="position:absolute;inset:0;z-index:9;${NONE}">
    ${FLIES.map(([x, y, s, d, dl]) => `<span class="hlw-fly" style="position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;border-radius:999px;background:#ffe08a;box-shadow:0 0 8px 3px rgba(255,224,138,.7);animation:hlwFirefly ${d}s ease-in-out ${stagger(dl)}s infinite"></span>`).join('')}
  </div>` : ''}`;
}

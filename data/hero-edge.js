// THE COLOUR EACH BACKDROP SHOWS AT ITS TOP EDGE, computed from the art.
//
// Today's scroller paints this behind the page so an overscroll bounce runs the
// wallpaper colour straight up off the top instead of ending at a line. Tom,
// 2026-08-26: "extend the boneheadz decided wallpaper colour upwards so if you
// scroll beyond it just shows the same colour."
//
// WHY THIS IS A TABLE AND NOT A CANVAS READ. It used to be sampled at runtime:
// draw the backdrop into a 1x1 canvas through the same filter and read the pixel
// back. That works in a desktop browser and failed on Tom's phone for reasons no
// harness here could reproduce, and every failure mode is silent, ending in an
// unset variable and a black band. A table has no failure modes: no image load,
// no canvas, no timing, no per-engine filter support.
//
// EACH VALUE IS THE SOURCE PNG'S TOP-CENTRE PIXEL PUT THROUGH saturate(0.92),
// because .hero-backdrop carries that filter, so the pixel a player sees is not
// the pixel in the file. The matrix is SVG feColorMatrix type="saturate" applied
// in sRGB, which is what the CSS filter shorthand uses. Verified against the
// browser: BG2-1's source rgb(107,124,56) computes to rgb(108,123,61), which is
// exactly what a live sample through the real filter returned.
//
// Regenerating is not a manual step: tests/hero-edge-audit.mjs recomputes every
// row from the PNGs and fails on any drift, so the art and this file cannot part
// company without the gate saying so.
export const HERO_EDGE = {
  'BG1': 'rgb(62 62 155)',
  'BG10': 'rgb(223 172 65)',
  'BG2-1': 'rgb(108 123 61)',
  'BG2-2': 'rgb(150 144 75)',
  'BG2-3': 'rgb(166 223 169)',
  'BG3-1': 'rgb(164 163 248)',
  'BG3-2': 'rgb(191 135 176)',
  'BG3-3': 'rgb(144 129 208)',
  'BG4-1': 'rgb(249 159 159)',
  'BG4-2': 'rgb(251 182 220)',
  'BG4-3': 'rgb(248 141 159)',
  'BG5-1': 'rgb(245 108 80)',
  'BG5-2': 'rgb(246 111 111)',
  'BG5-3': 'rgb(245 100 85)',
  'BG6-1': 'rgb(254 245 105)',
  'BG6-2': 'rgb(251 254 159)',
  'BG6-3': 'rgb(227 254 154)',
  'BG7-1': 'rgb(106 228 240)',
  'BG7-2': 'rgb(120 187 234)',
  'BG7-3': 'rgb(118 148 236)',
  'BG8': 'rgb(77 68 68)',
  'BG9': 'rgb(254 249 224)',
};

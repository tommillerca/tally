// The Glutton: presentational creature stage only (art + animation). No game
// state lives here — encounter/reward logic stays in app.js next to the other
// fight modes. Kept isolated on purpose: this is a self-contained visual, safe
// to touch without risking the map/den/combat systems.
//
// Simple hold-crossfade between the artist's 3 drawings (idle -> tongue ->
// middle/drool -> idle), plus the drawn slime bubbles looping via CSS. No
// masked frame-swapping, no motion blur, no radial reveals: a lightweight
// stand-in for the fuller animation, once real in-between art exists.
const PHASES = [
  { cls: 'p-idle', hold: 4200 },
  { cls: 'p-tongue', hold: 1500 },
  { cls: 'p-middle', hold: 2600 },
];

// The static reveal hero: the tongue-out portrait, the approved poster/hero
// frame. Used for the announcement card + sheet (a still creature, per the
// locked design), NOT the combat stage (which gets the idle/attack loop below).
export function gluttonHeroHtml() {
  return `<div class="glutton-hero">
    <div class="gh-glow"></div>
    <img class="gh-img" src="assets/bh/glutton/tongue.png" alt="The Glutton">
    <span class="glutton-bub gb0"><img src="assets/bh/glutton/bub0.png" alt=""></span>
    <span class="glutton-bub gb1"><img src="assets/bh/glutton/bub1.png" alt=""></span>
    <span class="glutton-bub gb2"><img src="assets/bh/glutton/bub2.png" alt=""></span>
  </div>`;
}

// Combat stage: the same idle/tongue/middle plates, but pre-cropped tight to
// the actual creature (the source canvases are ~35% empty transparent sky, so
// scaling the whole 448-square as the "boss is bigger" fix wasted most of the
// size increase on blank space and made it read as floating). No bubbles here
// — this is the fast-paced arena, not the hero portrait.
export function gluttonStageHtml() {
  return `<div class="glutton-stage">
    <img class="glutton-plate p-idle on" src="assets/bh/glutton/combat/idle.png" alt="The Glutton">
    <img class="glutton-plate p-tongue" src="assets/bh/glutton/combat/tongue.png" alt="">
    <img class="glutton-plate p-middle" src="assets/bh/glutton/combat/middle.png" alt="">
  </div>`;
}

// Starts the idle->tongue->middle loop inside `stageEl` (the .glutton-stage
// node). Returns a stop() fn; timers only (rAF is unreliable in the app's
// WebView, per lesson learned elsewhere in this codebase).
export function startGluttonLoop(stageEl) {
  if (!stageEl) return () => {};
  let alive = true, timer = null, i = 0;
  const plates = PHASES.map(p => stageEl.querySelector('.' + p.cls));
  const step = () => {
    if (!alive) return;
    plates.forEach((el, idx) => el && el.classList.toggle('on', idx === i));
    timer = setTimeout(() => { i = (i + 1) % PHASES.length; step(); }, PHASES[i].hold);
  };
  step();
  return () => { alive = false; if (timer) clearTimeout(timer); };
}

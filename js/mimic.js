/* THE MIMIC. Tom, 2026-08-20: "i want to add this new character to the boneyard
 * where 1/3 chests can trigger a fight with this mimic. it should show the pixel
 * art animation and then enter a battle with him... also make the mimic blink
 * with these frames alternating eyes."
 *
 * Everything the Mimic needs that is not a fight lives here, for two reasons:
 * app.js is 18k lines and contested by other work, and an overlay module that
 * injects its own <style> (the js/gateintro.js pattern) means this feature adds
 * ZERO lines to app.css.
 *
 * THE ART, AND WHY IT IS SHAPED THIS WAY. Cam drew three 2048px plates that are
 * pixel-identical apart from a 553x163 band of coin-eyes along the lid, plus a
 * 48x48 pixel loop. Measured:
 *
 *   mimic-loop.gif   9 frames, 5 UNIQUE. It is a palindrome: closed, opening,
 *                    wide (held 450ms), closing, closed (held 300ms), 1800ms a
 *                    cycle. Shipped byte-identical, 10,358 bytes. A browser
 *                    already decodes and loops a GIF at its authored per-frame
 *                    delays; rebuilding it as a sprite sheet with steps(9) would
 *                    be a bigger asset AND would flatten the two holds that make
 *                    it read as a chest opening rather than a flicker.
 *
 *   mimic.png        plate 1, cropped to the art's own alpha box and scaled to
 *                    640px, 248,893 bytes.
 *   mimic-eyes-2/3   ONLY the eye band of plates 2 and 3, 15,010 / 14,978 bytes.
 *
 * That last decision is the Wanderer rule applied here: his flame animates 4.2
 * pixels on a 92px marker and shipping three 1.2MB plates for it was rejected.
 * Same arithmetic. Two extra FULL plates cost 498KB to change 0.2% of the image.
 * The eye band costs 30KB.
 *
 * The seam that would normally kill a crop-overlay is quantisation: two images
 * palettised independently disagree on the pixels that were identical, and the
 * crop edge shows. All three plates were quantised through ONE shared 128-colour
 * palette, and the generator asserted it: outside the band the three quantised
 * plates differ in exactly 0 pixels. So the overlay is invisible where it
 * overlaps and there is no edge to see.
 *
 * Cam's art is not altered anywhere in here. It is cropped, scaled and
 * composited back into the arrangement he drew.
 */

/* Small stable hash, kept local rather than imported. Same call as js/bosses.js
   makes: this module is loaded on the Boneyard's hot path and has no business
   dragging in hunt.js (which imports game.js, loot.js and nutrition.js) just to
   reach a nine-line function. */
function hash(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const MIMIC_ART = {
  plate: 'assets/bh/mimic/mimic.png',
  eyes2: 'assets/bh/mimic/mimic-eyes-2.png',
  eyes3: 'assets/bh/mimic/mimic-eyes-3.png',
  loop: 'assets/bh/mimic/mimic-loop.gif',
};

// one in every MIMIC_SHARE buried crates is not a crate
export const MIMIC_SHARE = 3;

/* IS THIS CHEST A MIMIC? DERIVED, NEVER ROLLED.
 *
 * This is a money path, so the property that matters is not "one in three", it
 * is that the answer NEVER CHANGES. A chest the player closed the sheet on must
 * still be a Mimic when they tap it again, and must not turn back into loot on
 * the next 5-second refreshWorld pass. `Math.random()` at tap time gives one in
 * three and fails both.
 *
 * So it is a pure function of the spawn's own id, which js/hunt.js already
 * builds as `${cx}_${cy}_s${k}_i${inst}` from the cell, the slot and the 45-min
 * instance. Every device computes the same answer for the same chest, offline,
 * forever, with no state to store and nothing to desync. This is the same shape
 * the whole Boneyard is already built on: spawnsForCell, gluttonSpot and
 * denForCell are all pure (period, cell) -> content.
 *
 * The id also gives the respawn behaviour for free. When the slot rolls to its
 * next 45-minute instance the id changes, so the same physical spot re-rolls
 * mimic-or-not on its own, exactly as it already re-rolls its type.
 */
export function isMimicSpawn(spawn) {
  return !!spawn && spawn.type === 'crate' && hash(`mimic:${spawn.id}`) % MIMIC_SHARE === 0;
}

/* ---------------------------------------------------------------- the blink */

/* THE BLINK IS A PLATE SWAP, NOT AN EFFECT. Three of Cam's frames, alternated.
   Nothing is tinted, scaled, re-timed or redrawn.
   Ordering was measured off the ink in the eye band, not guessed: plate 1 is the
   lightest (25,097 dark px, eyes open), plate 3 is intermediate (31,564) and
   plate 2 is the darkest (33,278, eyes shut). So the cycle runs open -> half ->
   shut -> half -> open, which is a blink. Running 1 -> 2 -> 3 -> 1 instead would
   snap shut and then half-open on the way out, which reads as a glitch.

   350ms of blink in a 5.2s cycle. Long enough to see, rare enough that he is a
   still drawing that happens to be alive rather than a strobing GIF. */
const BLINK_MS = 5200;
// the eye band's rect inside the 640x518 plate, as percentages. Measured from
// the union of the two diff boxes plus 3px, NOT eyeballed. If the plates are
// ever re-exported at another size these stay correct: they are ratios.
const BAND = { left: 18.2812, top: 11.7761, width: 38.1250, height: 15.0579 };

const STYLE_ID = 'mimic-style';
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
.mimic-plate { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
/* the fitter carries the plate's real aspect, so the eye band can be positioned
   in PERCENT and land on the eyes at every viewport. object-fit:contain on the
   image would letterbox inside a box of unknown aspect and the overlay would
   drift off the lid. */
.mimic-plate .mimic-fit { position: relative; width: 100%; max-height: 100%; aspect-ratio: 640 / 518; }
.mimic-plate img { position: absolute; display: block; }
.mimic-plate .mimic-base { inset: 0; width: 100%; height: 100%; }
.mimic-plate .mimic-eye {
  left: ${BAND.left}%; top: ${BAND.top}%; width: ${BAND.width}%; height: ${BAND.height}%;
  opacity: 0;
  animation-duration: ${BLINK_MS}ms;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.mimic-plate .mimic-eye.e2 { animation-name: mimicShut; }
.mimic-plate .mimic-eye.e3 { animation-name: mimicHalf; }
/* stops are PAIRED, so each change is a 0.5ms ramp: a hard swap without asking
   for steps(), which would quantise the whole 5.2s cycle. */
@keyframes mimicHalf {
  0%, 92.3077% { opacity: 0 }
  92.3577%, 94.1808% { opacity: 1 }
  94.2308%, 97.0654% { opacity: 0 }
  97.1154%, 98.9885% { opacity: 1 }
  99.0385%, 100% { opacity: 0 }
}
@keyframes mimicShut {
  0%, 94.1808% { opacity: 0 }
  94.2308%, 97.0654% { opacity: 1 }
  97.1154%, 100% { opacity: 0 }
}
.mimic-reveal {
  position: fixed; inset: 0; z-index: 200; display: flex;
  flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  background: radial-gradient(120% 90% at 50% 45%, rgba(24,10,6,0.95), rgba(3,2,4,0.995));
  animation: mimicRevealIn 220ms ease both;
}
.mimic-reveal.out { animation: mimicRevealOut 260ms ease both; }
.mimic-reveal img {
  width: min(58vw, 240px); height: auto; image-rendering: pixelated;
  filter: drop-shadow(0 10px 26px rgba(0,0,0,0.7));
}
.mimic-reveal b {
  font-size: 15px; letter-spacing: 0.26em; color: #f4d98a; text-transform: uppercase;
}
.mimic-reveal small { font-size: 12px; letter-spacing: 0.14em; color: rgba(255,255,255,0.62); }
@keyframes mimicRevealIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes mimicRevealOut { from { opacity: 1 } to { opacity: 0 } }
/* REDUCED MOTION DISABLES, IT DOES NOT SPEED UP. animation-duration:0.001s is
   the trap: it does not stop a loop, it runs it a thousand times a second. */
/* The selectors below MUST match .e2/.e3's specificity or they lose to them:
   both live in this one stylesheet, and specificity beats source order across a
   media query. The first build of this rule used the bare .mimic-eye selector
   and measured animation-name "mimicHalf" with reduce emulated, i.e. it did
   nothing at all. Guard: tests/mimic-audit.mjs REDUCED. */
@media (prefers-reduced-motion: reduce) {
  .mimic-plate .mimic-eye.e2, .mimic-plate .mimic-eye.e3 { animation: none; opacity: 0; }
  .mimic-reveal, .mimic-reveal.out { animation: none; }
}`;
  document.head.appendChild(st);
}

/* The blinking Mimic, as markup. One string, used by the arena and by anything
   else that wants to show him large. */
export function mimicPlateHtml() {
  ensureStyle();
  return `<div class="mimic-plate"><div class="mimic-fit">` +
    `<img class="mimic-base" src="${MIMIC_ART.plate}" alt="">` +
    `<img class="mimic-eye e3" src="${MIMIC_ART.eyes3}" alt="" aria-hidden="true">` +
    `<img class="mimic-eye e2" src="${MIMIC_ART.eyes2}" alt="" aria-hidden="true">` +
    `</div></div>`;
}

/* -------------------------------------------------------------- the reveal */

/* THE CHEST OPENS BEFORE THE FIGHT DOES. One full cycle of Cam's pixel loop
   (1800ms, measured off the GIF's own frame delays) then it hands over.
   Awaited by the caller, unlike showGateIntro which is fire-and-forget: the
   whole point is that the player sees the chest turn into a monster BEFORE the
   arena exists, so overlapping them would throw the reveal away. */
export const MIMIC_REVEAL_MS = 1800;

export function showMimicReveal({ reduced = false } = {}) {
  if (typeof document === 'undefined') return Promise.resolve();
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'mimic-reveal';
  el.innerHTML = `<img src="${MIMIC_ART.loop}" alt="">` +
    `<b>It has teeth</b><small>The chest was never a chest</small>`;
  document.body.appendChild(el);
  // reduced motion still gets the beat, just a shorter, still one
  const hold = reduced ? 700 : MIMIC_REVEAL_MS;
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('click', finish);
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(); }, reduced ? 0 : 260);
    };
    el.addEventListener('click', finish);          // tap to skip
    setTimeout(finish, hold);
  });
}

/* ---------------------------------------------------------------- the fight */

/* What a Boneyard Mimic is worth. He is an ambush on a Common Crate, so he pays
   what the crate would have paid PLUS the fight, and he still hands over the
   crate: the chest was real, it just had opinions. */
export const MIMIC_FIGHT = { mult: 1.15, aiLevel: 3, xp: 70, coins: 90 };

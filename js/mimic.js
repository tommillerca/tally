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

import { talkBoxHtml, runTalkBox } from './talkbox.js';

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

/* one in every MIMIC_SHARE buried crates is not a crate.
   WENT 3 -> 5 ON 2026-09-03 AND STRAIGHT BACK. The theory was that nobody had
   ever reported meeting a Mimic, so it must be too rare. A player told Tom the
   shipped rate is good, and the shipped rate is this one: nothing had been
   deployed, so every opinion in the world was formed on 3. Leave it. */
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
/* A SCRIM, NOT A BLACKOUT, and the difference is deliberate. The Wanderer paints
   an opaque #05040a and the map is gone: he is a boss who hunted you down. This
   is an ambush on a crate you chose to tap, so the room you are standing in is
   still faintly there behind him. Measured on the real Today screen at 430x932:
   the ground under it reads mean luma 77.5, through this scrim 7.6 with a
   contrast (std) ratio of 0.03, against 0.00 for the Wanderer's blackout. */
.mimic-reveal {
  position: fixed; inset: 0; z-index: 200; display: flex;
  flex-direction: column; align-items: center; justify-content: center; gap: 20px;
  padding: 0 16px;
  background: radial-gradient(120% 90% at 50% 45%, rgba(24,10,6,0.972), rgba(3,2,4,0.998));
  animation: mimicRevealIn 220ms ease both;
}
.mimic-reveal.out { animation: mimicRevealOut 260ms ease both; }
.mimic-reveal img {
  width: min(58vw, 240px); height: auto; image-rendering: pixelated;
  filter: drop-shadow(0 10px 26px rgba(0,0,0,0.7));
}
/* The line is the app's talk box, not two centred labels. Narrower than the
   screen and centred under the chest: he is an OBJECT you are looking down at,
   where the Wanderer is a figure filling a stage. */
.mimic-reveal .mimic-enc-box { position: relative; z-index: 2; width: min(84vw, 330px); --tb-size: 14px; }
/* THE HANDOVER COVER. One beat, no strobe and no charge: the scrim closes to
   black and STAYS there while the caller builds the arena underneath it. It is a
   layer rather than a background swap because a gradient cannot interpolate to a
   flat colour, and z-index 3 so it covers the box as well as the chest.
   NOT switched off under reduced motion, and the fill mode is why: this is a
   ONE-SHOT, so app.css's global reduce rule collapses it to an instant that
   holds its end state (its own comment says exactly that), and the map stays
   hidden. The trap that block warns about is a fast duration on something that
   REPEATS, which this is not. The BOTH fill mode is load-bearing: without it
   the collapsed animation lands back on opacity 0 and the handover uncovers
   the map, which was measured on that exact mutation.
   Guard: tests/mimic-audit.mjs REDUCED. */
.mimic-reveal::after {
  content: ''; position: absolute; inset: 0; z-index: 3; pointer-events: none;
  background: #05040a; opacity: 0;
}
.mimic-reveal.snap::after { animation: mimicSnap ${SNAP_MS}ms ease both; }
@keyframes mimicSnap { from { opacity: 0 } to { opacity: 1 } }
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
   arena exists, so overlapping them would throw the reveal away.
 *
 * SMALLER THAN THE WANDERER, ON PURPOSE. Tom, 2026-08-21: "do something similar
 * for the mimic but not quite as intense." Similar means it speaks the same
 * language as showWandererEncounter; not as intense means every dial is turned
 * down, and the reasons are not cosmetic:
 *
 *   NO CHOICE. He gets no Fight/Flee. You already reached into the crate, so the
 *   trap has sprung; a prompt here would hand the ambush an escape hatch and
 *   flatten the difference between a boss who hunted you across the map and a
 *   box you chose to tap. The Wanderer's Flee is free BECAUSE nobody asked for
 *   him. Nobody asks for a Mimic either, but they do ask for the chest.
 *
 *   ONE LINE, through the app's one typing path. Not two beats with a staged
 *   arrival between them, and emphatically not a second typer: talkBoxHtml /
 *   runTalkBox is the same module the Wanderer speaks through (js/talkbox.js's
 *   own header on why there is only ever one). What it replaced was two centred
 *   labels, which is the thing that made this read as a toast with a picture
 *   next to it rather than as an encounter.
 *
 *   ONE BEAT AT THE HANDOVER. The Wanderer gets a stepped charge, a white/black
 *   strobe and a fade to black over 900ms. This gets a 260ms close to black and
 *   nothing else. The sequence never brightens after the scrim lands, which is
 *   the measurable difference between a beat and a strobe, and is the shape the
 *   NOSTROBE row in tests/mimic-audit.mjs pins.
 *
 *   HALF THE LENGTH. 2060ms to the arena against his 5100ms, both derived from
 *   the two modules' own exported constants in the SMALLER row rather than from
 *   numbers typed into a test.
 *
 * THE OVERLAY IS NOT REMOVED WHEN THIS RESOLVES. Same handover as the Wanderer,
 * and for the same reason: the caller builds the arena underneath the black hold
 * frame and calls dismiss() afterwards, so there is no frame where the map comes
 * back between the chest and the fight. */
export const MIMIC_REVEAL_MS = 1800;
const SNAP_MS = 260;

/* His one line. Both of the phrases the two labels used to carry, said once, in
   the app's dialogue voice. Exported so the guard asserts the SHIPPED string. */
export const MIMIC_LINE = 'The chest was never a chest. It has teeth.';

export function showMimicReveal({ reduced = false } = {}) {
  if (typeof document === 'undefined') return Promise.resolve({ dismiss: () => {} });
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'mimic-reveal';
  el.innerHTML = `<img src="${MIMIC_ART.loop}" alt="">` +
    talkBoxHtml(MIMIC_LINE, { cls: 'mimic-enc-box' });
  document.body.appendChild(el);
  const box = el.querySelector('.talkbox');
  runTalkBox(box, MIMIC_LINE);
  // reduced motion still gets the beat, just a shorter, still one
  const hold = reduced ? 700 : MIMIC_REVEAL_MS;
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('click', tap);
      el.classList.add('snap');
      setTimeout(resolve, reduced ? 0 : SNAP_MS);
    };
    /* TAP TO SKIP, IN TWO STAGES, which is the talk box's own contract rather
       than a second rule invented here: a tap while the line is still typing
       finishes the LINE (box.onclick owns that), and a tap after it ends the
       beat. Taps that land on the box never reach this handler at all while it
       is typing, because runTalkBox stops them there. */
    const tap = () => {
      if (!box.classList.contains('tb-done')) { box.click(); return; }
      finish();
    };
    el.addEventListener('click', tap);
    setTimeout(finish, hold);
  }).then(() => ({
    dismiss: () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); },
  }));
}

/* ---------------------------------------------------------------- the fight */

/* What a Boneyard Mimic is worth. He is an ambush on a Common Crate, so he pays
   what the crate would have paid PLUS the fight, and he still hands over the
   crate: the chest was real, it just had opinions. */
export const MIMIC_FIGHT = { mult: 1.15, aiLevel: 3, xp: 70, coins: 90 };

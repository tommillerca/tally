// Animated pet sprites. Two pets ship as always-on CSS animations built from layered
// PNGs (assets/bh/anim/*). The layouts are the exact native-pixel stages that were
// tuned + QC'd frame-by-frame; here they're just wrapped in a JS-scaled stage so they
// drop into any pet slot at the requested pixel width. Every other pet falls back to
// its static image (animatedPetHtml returns null).
//
//   C1  cloud  — floats, blinks, rains (drops fall in front, fade before the ground)
//   C4  lizard — fly loops above the head, blinks, tongue slurps into a closed mouth
//
// Keyframes + layer geometry live in app.css (.pa-* classes). Loop = 6s, seamless.

const CLOUD_W = 222, CLOUD_H = 219;
const LIZ_W = 273, LIZ_H = 218;
const A = 'assets/bh/anim';

function cloud(px) {
  const s = px / CLOUD_W;
  return `<div class="petanim" style="width:${px}px;height:${(px * CLOUD_H / CLOUD_W).toFixed(1)}px">
    <div class="pa-stage pa-cloud" style="transform:scale(${s.toFixed(4)})">
      <div class="pa-art">
        <img class="pa-shadow" src="${A}/cloud/shadow.png" alt="">
        <div class="pa-bob">
          <img class="pa-body" src="${A}/cloud/body-noeyes.png" alt="">
          <img class="pa-eyes" src="${A}/cloud/eyes.png" alt="">
          <img class="pa-closed" src="${A}/cloud/closed.png" alt="">
        </div>
        <img class="pa-drop pa-d1" src="${A}/cloud/drop.png" alt="">
        <img class="pa-drop pa-d2" src="${A}/cloud/drop.png" alt="">
        <img class="pa-drop pa-d3" src="${A}/cloud/drop.png" alt="">
        <img class="pa-drop pa-d4" src="${A}/cloud/drop.png" alt="">
      </div>
    </div>
  </div>`;
}

// `skin` picks the layer folder: 'lizard' (base C4 orange) or 'lizard-amethyst'
// (the exclusive Founder's Lizard, CX). Only base + lid are recolored; the shared
// tongue/mouthline/drool/fly layers ride the original folder either way.
function lizard(px, skin = 'lizard') {
  const s = px / LIZ_W;
  const body = `${A}/${skin}`;
  return `<div class="petanim" style="width:${px}px;height:${(px * LIZ_H / LIZ_W).toFixed(1)}px">
    <div class="pa-stage pa-lizard" style="transform:scale(${s.toFixed(4)})">
      <div class="pa-art">
        <div class="pa-creature">
          <img class="pa-base" src="${body}/base.png" alt="">
          <div class="pa-tongueclip"><img class="pa-tongue" src="${A}/lizard/tongue.png" alt=""></div>
          <img class="pa-mouthline" src="${A}/lizard/mouthline.png" alt="">
          <img class="pa-drool" src="${A}/lizard/drool.png" alt="">
          <img class="pa-lid" src="${body}/lid.png" alt="">
        </div>
        <img class="pa-fly" src="${A}/lizard/fly.png" alt="">
      </div>
    </div>
  </div>`;
}

// Returns animated HTML for an animated pet id, or null to fall back to a static image.
// px = target display width in CSS pixels.
export function animatedPetHtml(petId, px) {
  if (petId === 'C1') return cloud(px);
  if (petId === 'C4') return lizard(px);
  if (petId === 'CX') return lizard(px, 'lizard-amethyst'); // Founder's Lizard (survey reward)
  return null;
}

export const ANIMATED_PETS = new Set(['C1', 'C4', 'CX']);

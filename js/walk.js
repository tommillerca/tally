// Minimal walk cycle for the player's avatar. The Boneheadz sprite is a flat
// layered stack (no rig), so "walking" is a puppet walk: a step-rhythm bob +
// rock that swaps in for the idle animation while GPS fixes show movement,
// plus an east/west facing flip from the movement bearing. Generic: attach to
// any container that wraps a .bh-anim layer stack (map marker, hero, etc).
//
//   const walk = attachWalk(el);   // el wraps the .bh-anim layers
//   walk.move(lat, lng);           // feed it position fixes; walks while moving
//   walk.stop();                   // snap back to idle now
//   walk.destroy();
//
// Movement gate (~1.2 m between smoothed fixes) filters GPS jitter; the walk
// holds a few seconds past the last movement so throttled fixes don't strobe
// the animation. The sprite faces east natively; westward travel flips the
// container with scaleX(-1). Self-contained: injects its own styles.

import { distanceM, bearingDeg } from './hunt.js';

const STYLE = `
.bh-walking .bh-anim, .map-you-av.bh-walking .bh-anim {
  animation: bhWalkCycle 1.2s ease-in-out infinite;
}
.bh-face-w { transform: scaleX(-1); }
@keyframes bhWalkCycle {
  0%   { transform: translateY(0) rotate(-1.1deg); }
  25%  { transform: translateY(-2.6%) rotate(0deg); }
  50%  { transform: translateY(0) rotate(1.1deg); }
  75%  { transform: translateY(-2.6%) rotate(0deg); }
  100% { transform: translateY(0) rotate(-1.1deg); }
}
@media (prefers-reduced-motion: reduce) {
  .bh-walking .bh-anim, .map-you-av.bh-walking .bh-anim { animation: none; }
}
`;

function ensureStyle() {
  if (document.getElementById('walk-style')) return;
  const s = document.createElement('style');
  s.id = 'walk-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

export function attachWalk(el, { minMoveM = 1.2, holdMs = 2600 } = {}) {
  ensureStyle();
  let last = null;
  let timer = 0;

  const stop = () => { clearTimeout(timer); timer = 0; el?.classList.remove('bh-walking'); };

  const move = (lat, lng) => {
    if (!el || !el.isConnected) return;
    if (last) {
      const d = distanceM(last.lat, last.lng, lat, lng);
      if (d >= minMoveM) {
        el.classList.add('bh-walking');
        // face the way we're headed (east = native pose); ignore near-N/S
        // bearings so the flip doesn't flap on a straight north/south walk
        const east = Math.sin(bearingDeg(last.lat, last.lng, lat, lng) * Math.PI / 180);
        if (Math.abs(east) > 0.35) el.classList.toggle('bh-face-w', east < 0);
        clearTimeout(timer);
        timer = setTimeout(() => el.classList.remove('bh-walking'), holdMs);
      }
    }
    last = { lat, lng };
  };

  return { move, stop, destroy: () => { stop(); last = null; } };
}

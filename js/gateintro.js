// Boss gate intro: the tomb gate materializes, the portal wakes, eyes ignite
// and blink in the dark, low fog rolls across the ground, and the boss
// breaches the plane. Plays full-screen before a boss fight, then hands off
// to the fight sheet.
//
// Creature-agnostic on purpose: the eyes hold Cam's painted positions (they
// never sync to the sprite's anatomy) and the emerging figure is whatever
// spriteHtml you pass, shown as a silhouette until the flash. Any den boss,
// skeleton or not, gets the same ritual.
//
// Self-contained (injects its own styles, touches no app CSS):
//   await showGateIntro({ foeName, venue, spriteHtml, sounds });
// spriteHtml is the same markup the arena uses, e.g.
//   avatarLayersHtml(foe.outfit, { noYard: true, skip: ['BG'] })
// Skippable by tap. Skipped entirely under reduced motion and webdriver,
// mirroring the vs-card. All motion is CSS keyframes on a fixed timeline so
// the whole sequence is deterministic and seekable (tests/gateintro-harness).
//
// Timeline: gate 0-0.85 · void 0.45-1.4 · eyes ignite 1.5-2.1 · blinks at
// ~2.4 / ~3.0 (double) / ~3.95 · fog rolls in 2.35-3.45 · emerge (silhouette,
// behind the arch) 3.5-4.36 · flash + quake + breach 4.32-4.94 · name 4.7 ·
// fade out 6.05-6.33.

import { hitSound, reducedMotion } from './fx.js';

const GATE_SRC = new URL('../assets/pit/gate-boneyard.webp', import.meta.url);
const MASK_SRC = new URL('../assets/pit/gate-portal-mask.png', import.meta.url);

// Geometry measured from the gate art (fractions of the image box):
// portal center x 0.5012, doorway floor y 0.9309, eye line y 0.774.

const STYLE = `
.gi {
  position: fixed; inset: 0; z-index: 200; overflow: hidden; touch-action: none;
  display: grid; place-items: center;
  background: radial-gradient(circle at 50% 42%, #171226 0%, #0d0a16 55%, #07060c 100%);
  animation: giIn 0.25s ease-out both, giOut 0.28s ease 6.05s both;
}
.gi-stage {
  position: relative;
  width: min(88vw, 62vh * 0.7282); aspect-ratio: 0.7282;
  animation: giRise 0.8s cubic-bezier(0.22, 1, 0.36, 1) both, giQuake 0.4s linear 4.36s;
}
.gi-gate { position: absolute; inset: 0; width: 100%; height: 100%; }
.gi-ground {
  position: absolute; left: -8%; right: -8%; bottom: 6.4%; height: 3px;
  background: rgba(242, 233, 215, 0.12); border-radius: 50%;
  box-shadow: 0 10px 30px 14px rgba(0, 0, 0, 0.5);
}
.gi-portal {
  position: absolute; inset: 0;
  -webkit-mask-image: url('${MASK_SRC}'); mask-image: url('${MASK_SRC}');
  -webkit-mask-size: 100% 100%; mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
}
.gi-deep { position: absolute; inset: 0 0 6.9% 0; overflow: hidden; } /* the void stops at the doorway floor */
.gi-void {
  position: absolute; inset: 0;
  background: radial-gradient(90% 70% at 50% 30%, #2a1850 0%, #150d2c 45%, #08060f 78%);
  animation: giFade 0.9s ease 0.45s both;
}
.gi-swirl {
  position: absolute; left: -30%; top: 10%; width: 160%; aspect-ratio: 1;
  filter: blur(5px);
  background: conic-gradient(from 0deg at 50% 50%,
    transparent 0deg, rgba(122, 82, 220, 0.16) 40deg, transparent 95deg,
    rgba(84, 205, 195, 0.10) 150deg, transparent 210deg,
    rgba(122, 82, 220, 0.13) 300deg, transparent 360deg);
  animation: giSpin 10s linear infinite, giFadeHalf 0.9s ease 0.9s both;
}
.gi-boss { position: absolute; left: 50.1%; bottom: 6.9%; width: 61%; aspect-ratio: 1; margin-left: -30.5%; transform-origin: 50% 100%; }
.gi-behind {
  filter: brightness(0) saturate(0) drop-shadow(0 0 14px rgba(150, 90, 255, 0.35));
  animation: giEmerge 0.86s cubic-bezier(0.3, 0.6, 0.4, 1) 3.5s both, giCutOut 0.01s linear 4.36s both;
}
.gi-front {
  filter: drop-shadow(0 10px 12px rgba(0, 0, 0, 0.5));
  animation: giCutIn 0.01s linear 4.36s both, giBreach 0.58s cubic-bezier(0.34, 1.56, 0.64, 1) 4.36s both;
}
.gi-eyes {
  position: absolute; left: 50.1%; top: 77.4%; width: 12%; height: 6%; margin: -3% 0 0 -6%;
  animation: giIgnite 0.62s steps(1, end) 1.5s both, giCutOut 0.01s linear 3.66s both;
}
.gi-eyes i { position: absolute; top: 22%; width: 19%; height: 58%; }
.gi-eyes i.l { left: 24%; transform: rotate(-10deg); }
.gi-eyes i.r { right: 24%; transform: rotate(10deg); }
.gi-eyes b {
  display: block; width: 100%; height: 100%; border-radius: 50%;
  background: radial-gradient(circle at 50% 40%, #ff6a3d 0%, #ff3517 45%, #a01000 100%);
  box-shadow: 0 0 12px 4px rgba(255, 53, 23, 0.55);
  transform-origin: 50% 60%;
  animation: giBlink 1.3s linear 2.3s both; /* two blinks, then the eyes shut for good as the fog peaks */
}
.gi-fog { position: absolute; overflow: hidden; pointer-events: none; }
.gi-fog > b {
  position: absolute; left: 0; top: 0; display: block; width: 200%; height: 100%;
  background-size: 25% 100%; background-repeat: repeat-x;
  animation: giFogDrift 11s linear infinite;
}
.gi-fog-deep { inset: auto 0 4% 0; height: 32%; opacity: 0.9; animation: giFogIn 1s ease 2.35s both, giFogBob 4.4s ease-in-out 2.35s infinite alternate; }
.gi-fog-deep > b {
  filter: blur(10px); animation-duration: 10s;
  background-image:
    radial-gradient(45% 62% at 20% 72%, rgba(160, 200, 208, 0.62), transparent 70%),
    radial-gradient(34% 48% at 55% 86%, rgba(140, 175, 192, 0.54), transparent 70%),
    radial-gradient(50% 68% at 86% 66%, rgba(160, 200, 208, 0.58), transparent 72%);
}
.gi-fog-mid { inset: auto -6% 1.5% -6%; height: 20%; opacity: 0.8; animation: giFogIn 1s ease 2.55s both, giFogBob 3.8s ease-in-out 2.55s infinite alternate; }
.gi-fog-mid > b {
  filter: blur(9px); animation-duration: 7s;
  background-image:
    radial-gradient(42% 58% at 14% 68%, rgba(180, 210, 218, 0.52), transparent 70%),
    radial-gradient(30% 44% at 47% 84%, rgba(155, 190, 205, 0.44), transparent 70%),
    radial-gradient(48% 62% at 82% 62%, rgba(180, 210, 218, 0.50), transparent 72%);
}
.gi-fog-fore { inset: auto -10% -1% -10%; height: 14%; opacity: 0.55; animation: giFogIn 1s ease 2.8s both, giFogBob 3.2s ease-in-out 2.8s infinite alternate; }
.gi-fog-fore > b {
  filter: blur(11px); animation-duration: 5.5s;
  background-image:
    radial-gradient(46% 64% at 24% 70%, rgba(195, 222, 228, 0.55), transparent 70%),
    radial-gradient(36% 50% at 60% 82%, rgba(170, 205, 215, 0.45), transparent 70%),
    radial-gradient(52% 66% at 90% 64%, rgba(195, 222, 228, 0.50), transparent 72%);
}
.gi-flash {
  position: absolute; inset: 0;
  background: radial-gradient(80% 60% at 50% 55%, #d8fff2 0%, rgba(216, 255, 242, 0) 72%);
  animation: giFlash 0.34s ease-out 4.32s both;
}
.gi-skulleyes i {
  position: absolute; width: 2%; aspect-ratio: 1; border-radius: 50%;
  background: radial-gradient(circle, #ff5a30 0%, rgba(255, 53, 23, 0) 70%);
  box-shadow: 0 0 10px 4px rgba(255, 53, 23, 0.5);
  animation: giFade 0.35s ease 1.05s both, giEmber 2.6s ease-in-out 1.4s infinite alternate;
}
.gi-skulleyes i.l { left: 47.1%; top: 19.2%; }
.gi-skulleyes i.r { left: 50.1%; top: 19.2%; }
.gi-venue {
  position: absolute; top: max(7vh, 54px); left: 0; right: 0; text-align: center;
  font-size: 12.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--text-3, #8f8a99);
  animation: giFade 0.5s ease 0.2s both;
}
.gi-name {
  position: absolute; bottom: 10vh; left: 0; right: 0; text-align: center;
  font-family: var(--display, 'Bangers', 'Arial Black', sans-serif);
  font-size: clamp(34px, 11vw, 46px); letter-spacing: 0.05em; color: #ff7a45;
  text-shadow: 3px 3px 0 rgba(0, 0, 0, 0.6);
  animation: giStamp 0.45s cubic-bezier(0.34, 1.8, 0.64, 1) 4.7s both;
}
.gi-hint {
  position: absolute; bottom: max(3.6vh, 24px); left: 0; right: 0; text-align: center;
  font-size: 11px; font-weight: 600; color: var(--text-3, #8f8a99); opacity: 0;
  animation: giHint 0.6s ease 1.2s both;
}
.gi .bh-anim { position: absolute; inset: 0; }
.gi .bh-anim img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }

@keyframes giIn { from { opacity: 0; } }
@keyframes giOut { to { opacity: 0; } }
@keyframes giFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes giFadeHalf { from { opacity: 0; } to { opacity: 0.55; } }
@keyframes giFogIn { from { opacity: 0; } }
@keyframes giFogDrift { to { transform: translateX(-25%); } }
@keyframes giFogBob { to { transform: translateY(-5%); } }
@keyframes giHint { from { opacity: 0; } to { opacity: 0.7; } }
@keyframes giSpin { to { transform: rotate(360deg); } }
@keyframes giRise { from { opacity: 0; transform: translateY(36px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes giQuake { 0%, 100% { translate: 0 0; } 25% { translate: -5px 2px; } 50% { translate: 4px -2px; } 75% { translate: -3px 1px; } }
@keyframes giEmerge {
  from { opacity: 0; transform: translateY(-11%) scale(0.30); filter: brightness(0) saturate(0) drop-shadow(0 0 14px rgba(150, 90, 255, 0.35)); }
  25% { opacity: 1; }
  to { opacity: 1; transform: translateY(0) scale(0.62); filter: brightness(0.28) saturate(0.4) drop-shadow(0 0 14px rgba(150, 90, 255, 0.35)); }
}
@keyframes giIgnite { 0% { opacity: 0; } 12% { opacity: 1; } 26% { opacity: 0.25; } 42% { opacity: 1; } 58% { opacity: 0.55; } 74% { opacity: 1; } }
@keyframes giBlink {
  0%, 2.8% { transform: scaleY(1); }
  5% { transform: scaleY(0.06); }
  9%, 43% { transform: scaleY(1); }
  46% { transform: scaleY(0.06); }
  50% { transform: scaleY(1); }
  54% { transform: scaleY(0.06); }
  58%, 92% { transform: scaleY(1); }
  96%, 100% { transform: scaleY(0.06); }
}
@keyframes giCutOut { to { opacity: 0; visibility: hidden; } }
@keyframes giCutIn { from { opacity: 0; visibility: hidden; } to { opacity: 1; visibility: visible; } }
@keyframes giBreach { from { transform: scale(0.62); } to { transform: translateY(3.5%) scale(1); } }
@keyframes giFlash { 0% { opacity: 0; } 18% { opacity: 0.95; } 100% { opacity: 0; } }
@keyframes giStamp { from { opacity: 0; transform: scale(2.4); } to { opacity: 1; transform: scale(1); } }
@keyframes giEmber { from { opacity: 0.55; } to { opacity: 1; } }
`;

function ensureStyle() {
  if (document.getElementById('gi-style')) return;
  const s = document.createElement('style');
  s.id = 'gi-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function showGateIntro({ foeName, venue = 'The Boneyard Gate', spriteHtml = '', sounds = true } = {}) {
  // __giForce lets tests/gateintro-harness.html run the intro under webdriver
  if ((navigator.webdriver && !window.__giForce) || reducedMotion) return Promise.resolve();
  ensureStyle();
  return new Promise(resolve => {
    const gi = document.createElement('div');
    gi.className = 'gi';
    gi.setAttribute('role', 'presentation');
    gi.innerHTML = `
      <div class="gi-stage">
        <div class="gi-ground"></div>
        <div class="gi-portal">
          <div class="gi-deep"><div class="gi-void"></div><div class="gi-swirl"></div></div>
          <div class="gi-boss gi-behind">${spriteHtml}</div>
          <div class="gi-eyes"><i class="l"><b></b></i><i class="r"><b></b></i></div>
          <div class="gi-fog gi-fog-deep"><b></b></div>
          <div class="gi-flash"></div>
        </div>
        <img class="gi-gate" src="${GATE_SRC}" alt="" decoding="async">
        <div class="gi-skulleyes"><i class="l"></i><i class="r"></i></div>
        <div class="gi-fog gi-fog-mid"><b></b></div>
        <div class="gi-boss gi-front">${spriteHtml}</div>
        <div class="gi-fog gi-fog-fore"><b></b></div>
      </div>
      <div class="gi-venue">${esc(venue)}</div>
      <div class="gi-name">${esc((foeName || '').toUpperCase())}</div>
      <div class="gi-hint">tap to skip</div>`;
    document.body.appendChild(gi);

    let done = false;
    const timers = [setTimeout(() => hitSound(sounds, 'thud'), 4380)];
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      gi.remove();
      resolve();
    };
    // the overlay's own fade-out is the end-of-sequence sentinel
    gi.addEventListener('animationend', e => { if (e.target === gi && e.animationName === 'giOut') finish(); });
    gi.addEventListener('pointerdown', () => {
      // fast-forward every finite animation to its end state (incl. the fade-out).
      // document.getAnimations + containment beats Element.getAnimations({subtree})
      // for cross-engine reliability.
      const anims = document.getAnimations ? document.getAnimations() : [];
      for (const a of anims) {
        const target = a.effect && a.effect.target;
        if (!target || !gi.contains(target)) continue;
        const t = a.effect.getTiming();
        if (t.iterations !== Infinity) { try { a.finish(); } catch { /* not finishable */ } }
      }
      // engines that ignore WAAPI fast-forward on CSS animations still tear down
      timers.push(setTimeout(finish, 450));
    }, { once: true });
    // belt and braces: if animation events never fire, resolve anyway
    // (skipped under the harness, which freezes time to capture frames)
    if (!window.__giForce) timers.push(setTimeout(finish, 7000));
  });
}

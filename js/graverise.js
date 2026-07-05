// Grave rise: Cam's tombstone, split into layers, wakes up. Fog drifts, the
// ground trembles, and a skeleton hand bursts out of the mound with a puff of
// grave-dirt, then sways gently. An embeddable scene, not a full-screen card:
// drop it wherever a grave should open (den claim, KO moment, Haunts decor).
//
//   const rise = mountGraveRise(parentEl, { sounds: true });
//   await rise.play();          // trigger the burst (replays fine)
//
// Layers (assets/boneyard/): graverise-back (tombstone, hand inpainted away,
// Cam's baked fog kept), graverise-hand (the sprite), graverise-mound
// (foreground grass strip with densified alpha so the buried hand stays
// hidden). Geometry fractions come from the art: hand box l 37.09% t 35.76%
// w 37.16% h 60.77%, mound strip top 75.54%.
//
// Ambient fog is procedural, not baked: three tileable CSS layers drift in
// alternating directions (rear behind the stone billows around the
// silhouette, mid crosses the panel face, fore is low ground mist) so the
// scene always has swirl even before the hand rises. Motion is CSS keyframes
// on a fixed timeline (deterministic, seekable via graverise-harness).
// Reduced motion mounts the resting pose (hand risen) with static fog.

import { hitSound, reducedMotion } from './fx.js';

const BACK_SRC = new URL('../assets/boneyard/graverise-back.webp', import.meta.url);
const HAND_SRC = new URL('../assets/boneyard/graverise-hand.webp', import.meta.url);
const MOUND_SRC = new URL('../assets/boneyard/graverise-mound.webp', import.meta.url);

const STYLE = `
.gr { position: relative; aspect-ratio: 0.8259; overflow: hidden; }
.gr img { -webkit-user-drag: none; user-select: none; }
.gr-back { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; }
/* clip stays fixed in scene space so the buried hand can't peek below the
   mound silhouette (the strip art goes transparent near the bottom edge) */
.gr-handwrap { position: absolute; inset: 0; z-index: 3; clip-path: inset(0 0 13% 0); -webkit-clip-path: inset(0 0 13% 0); }
.gr-hand {
  position: absolute; left: 37.09%; top: 35.76%; width: 37.16%; height: 60.77%;
  transform: translateY(88%); transform-origin: 50% 96%;
}
.gr.gr-rest .gr-hand { transform: translateY(0); }
.gr-mound { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; z-index: 4; }

/* ---- procedural swirling fog ---- */
.gr-fog { position: absolute; overflow: hidden; pointer-events: none; will-change: transform; }
.gr-fog > b {
  position: absolute; left: 0; top: 0; display: block; width: 200%; height: 100%;
  background-size: 25% 100%; background-repeat: repeat-x;
}
/* rear: behind the stone, billows out around the silhouette + glows through
   the translucent panel. Slow drift one way, container breathes + bobs. */
.gr-fog-rear { inset: 6% -10% 4% -10%; z-index: 0; opacity: 0.5; animation: grBob 9s ease-in-out infinite alternate; }
.gr-fog-rear > b {
  filter: blur(16px); animation: grDriftL 19s linear infinite;
  background-image:
    radial-gradient(40% 52% at 16% 52%, rgba(168, 232, 200, 0.85), transparent 72%),
    radial-gradient(34% 46% at 44% 40%, rgba(143, 215, 208, 0.70), transparent 72%),
    radial-gradient(46% 58% at 72% 56%, rgba(168, 232, 200, 0.80), transparent 74%),
    radial-gradient(30% 42% at 92% 44%, rgba(150, 220, 200, 0.65), transparent 72%);
}
/* mid: crosses the panel face the OTHER way (opposing drift reads as swirl) */
.gr-fog-mid { inset: 24% 2% 26% 2%; z-index: 2; opacity: 0.3; animation: grBob 6.5s ease-in-out 0.4s infinite alternate; }
.gr-fog-mid > b {
  filter: blur(13px); animation: grDriftR 14s linear infinite;
  background-image:
    radial-gradient(38% 50% at 26% 46%, rgba(190, 245, 218, 0.75), transparent 72%),
    radial-gradient(32% 44% at 60% 62%, rgba(170, 232, 210, 0.60), transparent 72%),
    radial-gradient(44% 56% at 88% 50%, rgba(190, 245, 218, 0.70), transparent 74%);
}
/* fore: low ground mist over the mound base, closest so brightest + fastest */
.gr-fog-fore { inset: 70% -12% -3% -12%; z-index: 5; opacity: 0.5; animation: grBob 4.5s ease-in-out infinite alternate; }
.gr-fog-fore > b {
  filter: blur(14px); animation: grDriftL 10.5s linear infinite;
  background-image:
    radial-gradient(42% 58% at 20% 60%, rgba(198, 248, 222, 0.9), transparent 70%),
    radial-gradient(34% 46% at 54% 78%, rgba(176, 236, 212, 0.72), transparent 72%),
    radial-gradient(48% 62% at 86% 58%, rgba(198, 248, 222, 0.85), transparent 72%);
}
.gr-poof { position: absolute; left: 50%; top: 76%; width: 0; height: 0; z-index: 6; }
.gr-poof i {
  position: absolute; left: -5px; top: -5px; width: 10px; height: 10px;
  border-radius: 50%; opacity: 0; will-change: transform;
}
.gr-poof i:nth-child(1) { background: #aef2c8; }
.gr-poof i:nth-child(2) { background: #f2ecd0; }
.gr-poof i:nth-child(3) { background: #e9fbf0; }
.gr-poof i:nth-child(4) { background: #aef2c8; }
.gr-poof i:nth-child(5) { background: #f2ecd0; }
.gr-poof i:nth-child(6) { background: #cdeeda; }

.gr.go .gr-back, .gr.go .gr-mound { animation: grTremble 0.34s linear 2; }
.gr.go { animation: grQuake 0.4s linear 0.68s; }
.gr.go .gr-hand { animation: grBurst 0.62s cubic-bezier(0.3, 0.8, 0.3, 1) 0.68s both, grSway 3.6s ease-in-out 1.3s infinite alternate; }
.gr.go .gr-poof i { animation: grPoof 0.6s ease-out both; }
.gr.go .gr-poof i:nth-child(1) { --dx: -46px; --dy: -34px; animation-delay: 0.70s; }
.gr.go .gr-poof i:nth-child(2) { --dx: 38px; --dy: -44px; animation-delay: 0.72s; }
.gr.go .gr-poof i:nth-child(3) { --dx: -22px; --dy: -52px; animation-delay: 0.74s; }
.gr.go .gr-poof i:nth-child(4) { --dx: 52px; --dy: -20px; animation-delay: 0.76s; }
.gr.go .gr-poof i:nth-child(5) { --dx: -56px; --dy: -12px; animation-delay: 0.78s; }
.gr.go .gr-poof i:nth-child(6) { --dx: 16px; --dy: -58px; animation-delay: 0.80s; }

@keyframes grDriftL { from { transform: translateX(0); } to { transform: translateX(-25%); } }
@keyframes grDriftR { from { transform: translateX(-25%); } to { transform: translateX(0); } }
@keyframes grBob { from { transform: translate(0, 0) scale(1); } to { transform: translate(1.5%, -3.5%) scale(1.05); } }
@keyframes grTremble { 0%, 100% { translate: 0 0; } 25% { translate: -2px 1px; } 50% { translate: 2px -1px; } 75% { translate: -1px 0; } }
@keyframes grQuake { 0%, 100% { translate: 0 0; } 25% { translate: -4px 2px; } 50% { translate: 3px -2px; } 75% { translate: -2px 1px; } }
@keyframes grBurst {
  0% { transform: translateY(88%) rotate(0deg); }
  55% { transform: translateY(-3%) rotate(-3deg); }
  76% { transform: translateY(1.4%) rotate(1.8deg); }
  100% { transform: translateY(0) rotate(0deg); }
}
@keyframes grSway { from { transform: translateY(0) rotate(0deg); } to { transform: translateY(0) rotate(1.2deg); } }
@keyframes grPoof {
  0% { opacity: 0; transform: translate(0, 0) scale(0.4); }
  12% { opacity: 0.9; }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1); }
}
`;

function ensureStyle() {
  if (document.getElementById('gr-style')) return;
  const s = document.createElement('style');
  s.id = 'gr-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

export function mountGraveRise(parent, { sounds = true, playOnMount = false } = {}) {
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'gr';
  el.setAttribute('role', 'presentation');
  el.innerHTML = `
    <div class="gr-fog gr-fog-rear"><b></b></div>
    <img class="gr-back" src="${BACK_SRC}" alt="" decoding="async">
    <div class="gr-fog gr-fog-mid"><b></b></div>
    <div class="gr-handwrap"><img class="gr-hand" src="${HAND_SRC}" alt="" decoding="async"></div>
    <img class="gr-mound" src="${MOUND_SRC}" alt="" decoding="async">
    <div class="gr-fog gr-fog-fore"><b></b></div>
    <div class="gr-poof"><i></i><i></i><i></i><i></i><i></i><i></i></div>`;
  parent.appendChild(el);

  if (reducedMotion) el.classList.add('gr-rest'); // no theatrics, hand simply risen

  let timer = 0;
  const play = () => new Promise(resolve => {
    if (reducedMotion) { resolve(); return; }
    clearTimeout(timer);
    el.classList.remove('go');
    void el.offsetWidth; // restart the fixed timeline
    el.classList.add('go');
    timer = setTimeout(() => hitSound(sounds, 'thud'), 700);
    // burst lands at ~1.3s; resolve once the hand has settled
    el.querySelector('.gr-hand').getAnimations().forEach(a => {
      if (a.effect.getTiming().iterations !== Infinity) a.onfinish = () => resolve();
    });
    setTimeout(resolve, 1600); // fallback if animation events never fire
  });

  if (playOnMount && !reducedMotion) requestAnimationFrame(() => requestAnimationFrame(play));
  return { el, play };
}

// Full-screen pre-fight intro for roaming map mini-bosses: the grave rises, a
// hand bursts out, and "<NAME> RISES" stamps in. Fire-and-forget overlay
// (z-index above the fight sheet, which builds underneath) — same contract as
// showGateIntro: skips under webdriver (unless window.__grForce) and reduced
// motion. Usage: showGraveRiseIntro({ name: mini.name, sounds: S.sounds }).
const INTRO_STYLE = `
.gr-intro { position: fixed; inset: 0; z-index: 210; display: grid; place-items: center; overflow: hidden;
  background: radial-gradient(circle at 50% 42%, #16221a 0%, #0c0f0c 55%, #07060c 100%);
  animation: grIntroIn 0.3s ease-out both; touch-action: none; }
.gr-intro.gr-out { animation: grIntroOut 0.3s ease both; }
.gr-intro .gr { width: min(84vw, 60vh * 0.8259); }
.gr-intro-title { position: absolute; bottom: 12vh; left: 0; right: 0; text-align: center;
  font-family: var(--display, 'Bangers', 'Arial Black', sans-serif); font-size: clamp(30px, 9vw, 44px);
  letter-spacing: .04em; color: #b6f04a; text-shadow: 3px 3px 0 rgba(0,0,0,.6);
  animation: grStamp 0.45s cubic-bezier(.34,1.8,.64,1) 1.1s both; }
.gr-intro-hint { position: absolute; bottom: max(3.4vh, 22px); left: 0; right: 0; text-align: center;
  font-size: 11px; font-weight: 600; color: #8f8a99; opacity: 0; animation: grIntroFade 0.5s ease 1.5s both; }
@keyframes grIntroIn { from { opacity: 0; } }
@keyframes grIntroOut { to { opacity: 0; } }
@keyframes grStamp { from { opacity: 0; transform: scale(2.2); } to { opacity: 1; transform: scale(1); } }
@keyframes grIntroFade { to { opacity: 0.7; } }
`;
function ensureIntroStyle() {
  if (document.getElementById('gr-intro-style')) return;
  const s = document.createElement('style'); s.id = 'gr-intro-style'; s.textContent = INTRO_STYLE;
  document.head.appendChild(s);
}
const escHtml = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function showGraveRiseIntro({ name = 'A challenger', sounds = true } = {}) {
  if ((navigator.webdriver && !window.__grForce) || reducedMotion) return Promise.resolve();
  ensureStyle(); ensureIntroStyle();
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'gr-intro'; ov.setAttribute('role', 'presentation');
    const stage = document.createElement('div');
    ov.appendChild(stage);
    ov.insertAdjacentHTML('beforeend',
      `<div class="gr-intro-title">${escHtml(name).toUpperCase()} RISES</div><div class="gr-intro-hint">tap to skip</div>`);
    document.body.appendChild(ov);
    const rise = mountGraveRise(stage, { sounds });
    let done = false;
    const finish = () => { if (done) return; done = true; ov.classList.add('gr-out'); setTimeout(() => { ov.remove(); resolve(); }, 300); };
    ov.addEventListener('pointerdown', finish, { once: true });
    requestAnimationFrame(() => requestAnimationFrame(() => rise.play().then(() => setTimeout(finish, 1500))));
    setTimeout(finish, 6500); // safety net
  });
}

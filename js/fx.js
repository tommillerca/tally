// Visual + audio feedback: confetti, number tweens, tiny sounds.
// Everything respects prefers-reduced-motion and fails silent.

export const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let canvas = null, ctx = null, parts = [], raf = 0;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:300';
  document.body.appendChild(canvas);
  const fit = () => { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; };
  fit();
  addEventListener('resize', fit);
  ctx = canvas.getContext('2d');
}

// On-theme burst: tumbling bones, flipping gold coins, and the odd skull —
// not party confetti. (Function names kept for all the existing call sites.)
const BONE = '#f2e9d7', BONE_SH = '#cdbfa6', GOLD = '#ffc961', GOLD_RIM = '#a9781f', SKULL = '#efe6d2', SOCKET = '#221f2b';
const PART_TYPES = ['bone', 'bone', 'bone', 'coin', 'coin', 'skull']; // mostly bones + coins

function spawn(x, y, count, power) {
  ensureCanvas();
  const dpr = devicePixelRatio;
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
    const v = (120 + Math.random() * 260) * power;
    parts.push({
      x: x * dpr, y: y * dpr,
      vx: Math.cos(a) * v * dpr / 60, vy: Math.sin(a) * v * dpr / 60,
      s: (9 + Math.random() * 7) * dpr,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.5,
      type: PART_TYPES[(Math.random() * PART_TYPES.length) | 0],
      life: 0, maxLife: 55 + Math.random() * 35,
    });
  }
  if (!raf) loop();
}

function drawBone(c, s) {
  const L = s * 1.5, kr = s * 0.32, ko = s * 0.28;
  c.fillStyle = BONE;
  c.fillRect(-L / 2, -s * 0.15, L, s * 0.3);              // shaft
  for (const ex of [-L / 2, L / 2]) {                     // two knobs at each end
    c.beginPath(); c.arc(ex, -ko, kr, 0, 7); c.fill();
    c.beginPath(); c.arc(ex, ko, kr, 0, 7); c.fill();
  }
  c.fillStyle = BONE_SH;
  c.fillRect(-L / 2 + kr, s * 0.02, L - kr * 2, s * 0.07); // faint underside shading
}
function drawCoin(c, s, rot) {
  const rx = Math.abs(Math.cos(rot * 1.7)) * (s * 0.5), ry = s * 0.5;
  if (rx < s * 0.06) { c.fillStyle = GOLD_RIM; c.fillRect(-s * 0.05, -ry, s * 0.1, ry * 2); return; } // edge-on
  c.fillStyle = GOLD_RIM; c.beginPath(); c.ellipse(0, 0, rx + s * 0.06, ry, 0, 0, 7); c.fill();
  c.fillStyle = GOLD; c.beginPath(); c.ellipse(0, 0, rx, ry - s * 0.06, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(-rx * 0.3, -ry * 0.32, rx * 0.28, ry * 0.22, 0, 0, 7); c.fill();
}
function drawSkull(c, s) {
  c.fillStyle = SKULL;
  c.beginPath(); c.arc(0, -s * 0.05, s * 0.46, 0, 7); c.fill();     // cranium
  c.fillRect(-s * 0.3, s * 0.18, s * 0.6, s * 0.24);                // jaw
  c.fillStyle = SOCKET;
  c.beginPath(); c.arc(-s * 0.18, -s * 0.05, s * 0.14, 0, 7); c.fill();
  c.beginPath(); c.arc(s * 0.18, -s * 0.05, s * 0.14, 0, 7); c.fill();
  c.fillRect(-s * 0.05, s * 0.1, s * 0.1, s * 0.12);               // nose
}

function loop() {
  raf = requestAnimationFrame(loop);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const g = 0.16 * devicePixelRatio;
  parts = parts.filter(p => p.life < p.maxLife);
  if (!parts.length) { cancelAnimationFrame(raf); raf = 0; return; }
  for (const p of parts) {
    p.life++;
    p.vy += g;
    p.vx *= 0.985;
    p.x += p.vx; p.y += p.vy;
    p.rot += p.vr;
    const fade = 1 - Math.max(0, (p.life - p.maxLife * 0.6) / (p.maxLife * 0.4));
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(p.x, p.y);
    if (p.type === 'coin') { drawCoin(ctx, p.s, p.rot); }
    else { ctx.rotate(p.rot); p.type === 'skull' ? drawSkull(ctx, p.s) : drawBone(ctx, p.s); }
    ctx.restore();
  }
}

export function confettiBurst(x, y, count = 18) {
  if (reducedMotion) return;
  try { spawn(x, y, count, 0.85); } catch { /* no fx */ }
}

export function confettiRain(count = 110) {
  if (reducedMotion) return;
  try {
    for (let i = 0; i < 5; i++) {
      spawn(innerWidth * (0.15 + 0.175 * i), innerHeight * 0.22, Math.round(count / 5), 1.25);
    }
  } catch { /* no fx */ }
}

// Animate a number in an element. Skips animation under reduced motion.
export function tweenNumber(el, from, to, ms = 650, fmt = v => Math.round(v).toLocaleString()) {
  if (!el) return;
  if (reducedMotion || from === to || from == null) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  function step(now) {
    const t = Math.min(1, (now - t0) / ms);
    el.textContent = fmt(from + (to - from) * ease(t));
    if (t < 1 && el.isConnected) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---- sounds ----
let actx = null;
function ac() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function note(freq, t0, dur, gain = 0.07, type = 'sine') {
  const c = ac();
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + t0);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
}
export function popSound(enabled = true) {
  if (!enabled) return;
  try { note(880, 0, 0.09, 0.05); note(1320, 0.05, 0.08, 0.04); } catch { /* no audio */ }
}
export function levelSound(enabled = true) {
  if (!enabled) return;
  try { note(523, 0, 0.14); note(659, 0.09, 0.14); note(784, 0.18, 0.22, 0.08); } catch { /* no audio */ }
}

// per-hit combat foley: heavies thud, casts zap, quick strikes tick
export function hitSound(enabled = true, kind = 'tick') {
  if (!enabled) return;
  try {
    if (kind === 'thud') {
      const c = ac();
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(150, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(45, c.currentTime + 0.16);
      g.gain.setValueAtTime(0.16, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.2);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + 0.24);
    } else if (kind === 'zap') {
      const c = ac();
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(1100, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(220, c.currentTime + 0.14);
      g.gain.setValueAtTime(0.05, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.16);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + 0.2);
    } else {
      note(660, 0, 0.05, 0.035, 'square');
    }
  } catch { /* no audio */ }
}

// A small palette so not every action is the same blip. Each is short + distinct.
export function coinSound(enabled = true) {   // bright metallic ching (coins)
  if (!enabled) return;
  try { note(1568, 0, 0.06, 0.045, 'triangle'); note(2093, 0.055, 0.09, 0.04, 'triangle'); } catch { /* no audio */ }
}
export function chimeSound(enabled = true) {  // warm soft bell (wellness / gentle reward)
  if (!enabled) return;
  try { note(784, 0, 0.16, 0.05, 'sine'); note(1175, 0.07, 0.20, 0.045, 'sine'); } catch { /* no audio */ }
}
export function sparkleSound(enabled = true) { // rising sparkle (crate / egg open)
  if (!enabled) return;
  try { note(659, 0, 0.07, 0.04, 'triangle'); note(988, 0.07, 0.07, 0.04, 'triangle'); note(1319, 0.14, 0.13, 0.05, 'triangle'); } catch { /* no audio */ }
}
export function questSound(enabled = true) {  // short bright fanfare (quest / goal claimed)
  if (!enabled) return;
  try { note(784, 0, 0.1, 0.05, 'square'); note(1047, 0.08, 0.1, 0.05, 'square'); note(1319, 0.17, 0.2, 0.06, 'triangle'); } catch { /* no audio */ }
}
export function dropSound(enabled = true) {   // little water droplet (glide down)
  if (!enabled) return;
  try {
    const c = ac(); const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(1250, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(520, c.currentTime + 0.12);
    g.gain.setValueAtTime(0.06, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.16);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.2);
  } catch { /* no audio */ }
}

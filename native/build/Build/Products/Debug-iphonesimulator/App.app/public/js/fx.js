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

const COLORS = ['#b9ef4a', '#f2f5f2', '#6fd0ff', '#ffc961', '#ff9fb9'];

function spawn(x, y, count, power) {
  ensureCanvas();
  const dpr = devicePixelRatio;
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
    const v = (120 + Math.random() * 260) * power;
    parts.push({
      x: x * dpr, y: y * dpr,
      vx: Math.cos(a) * v * dpr / 60, vy: Math.sin(a) * v * dpr / 60,
      w: (4 + Math.random() * 5) * dpr, h: (7 + Math.random() * 6) * dpr,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life: 0, maxLife: 55 + Math.random() * 35,
    });
  }
  if (!raf) loop();
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
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
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

// Daily haunted prize wheel: once per real day, on first open (after the splash
// intro), a spinning graveyard wheel pops up with a spooky quote and pays out a
// login reward. All-win, economy-calibrated, and DATE-SEEDED so the day's prize
// is fixed (no reroll-by-reload) — same server-verifiable pattern as spawns/dens.
//
//   await maybeShowDailyWheel({ sounds });   // called once from boot()
//
// Self-contained (injects its own styles). Gate: once/day via kv 'wheelLastDate';
// skipped under webdriver (unless window.__wheelForce) like the other intros.
// Reduced motion still grants + shows the prize, just without the spin.

import { kvGet, kvSet } from './db.js';
import { dateKey } from './nutrition.js';
import { coinsAdd, grantCrate, grantConsumable, coins } from './loot.js';
import { grantIngredient, INGREDIENTS, COMMON_INGREDIENT_IDS } from './cooking.js';
import { popSound, levelSound, reducedMotion } from './fx.js';
import { bhIconRaw } from './icons-pack.js';

// the app's bone-coin (self-colored), so coin prizes match the rest of the UI
const COIN_RAW = { vb: '0 0 24 24', tint: 'currentColor', inner: '<circle cx="12" cy="12" r="10.2" fill="#ffb454" stroke="#3a2b12" stroke-width="1.6"/><circle cx="12" cy="12" r="6.9" fill="none" stroke="#3a2b12" stroke-width="1" opacity="0.45"/><g fill="#5a3f14"><circle cx="7.8" cy="10.6" r="1.6"/><circle cx="7.8" cy="13.4" r="1.6"/><circle cx="16.2" cy="10.6" r="1.6"/><circle cx="16.2" cy="13.4" r="1.6"/><rect x="7.4" y="10.7" width="9.2" height="2.6" rx="1.3"/></g>' };
// resolve a prize to a raw icon (pack icon, or the coin/ingredient art)
function prizeRaw(p) {
  if (p.coin) return COIN_RAW;
  if (p.iconId === 'ingredient') return bhIconRaw('ingr-sinew') || COIN_RAW; // "fresh scrap"
  return bhIconRaw(p.iconId) || COIN_RAW;
}
// an SVG icon positioned inside the wheel's own <svg> (nested svg scales the viewBox)
function iconAt(p, cx, cy, size) {
  const r = prizeRaw(p);
  return `<svg x="${(cx - size / 2).toFixed(1)}" y="${(cy - size / 2).toFixed(1)}" width="${size}" height="${size}" viewBox="${r.vb}" style="color:${r.tint}" overflow="visible">${r.inner}</svg>`;
}
// a standalone SVG icon for HTML contexts (the reveal)
function iconHtml(p, size) {
  const r = prizeRaw(p);
  return `<svg viewBox="${r.vb}" width="${size}" height="${size}" style="color:${r.tint};filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">${r.inner}</svg>`;
}

// ---- prize table (wheel order; adjacent segments differ in value) ----
// weights sum to 100. jackpot (Golden Crate) is the gold wedge.
const PRIZES = [
  { key: 'c30',    coin: true,               tag: '30',     name: '30 Coins',       weight: 22, gold: false, grant: () => coinsAdd(30) },
  { key: 'daily',  iconId: 'crate-daily',    tag: 'Crate',  name: 'Daily Crate',    weight: 12, gold: false, grant: () => grantCrate('daily', 'wheel') },
  { key: 'ingr',   iconId: 'ingredient',     tag: 'Scrap',  name: 'a Fresh Scrap',  weight: 20, gold: false, grant: (rng) => grantIngredient(seededIngredient(rng), 1) },
  { key: 'golden', iconId: 'crate-golden',   tag: 'GOLD',   name: 'a Golden Crate', weight: 3,  gold: true,  grant: () => grantCrate('golden', 'wheel') },
  { key: 'c75',    coin: true,               tag: '75',     name: '75 Coins',       weight: 18, gold: false, grant: () => coinsAdd(75) },
  { key: 'freeze', iconId: 'freeze',         tag: 'Freeze', name: 'a Streak Freeze',weight: 5,  gold: false, grant: () => grantConsumable('freeze', 'wheel') },
  { key: 'c150',   coin: true,               tag: '150',    name: '150 Coins',      weight: 8,  gold: false, grant: () => coinsAdd(150) },
  { key: 'charm',  iconId: 'charm',          tag: 'Charm',  name: 'a Battle Charm', weight: 12, gold: false, grant: () => grantConsumable('xp2', 'wheel') },
];
const SEG = PRIZES.length;                 // 8
const SEG_DEG = 360 / SEG;                  // 45

const QUOTES = [
  'The bones remember who showed up.',
  "Spin it. The dead don't get do-overs. You do.",
  'Fortune favors the femur.',
  'Even the grave loves a daily visitor.',
  'The crypt pays out to the consistent.',
  'Luck is just a skeleton in a good mood.',
  'Feed the bones, spin the stones.',
  "Whatever crawls out today, it's yours.",
  'The reaper clocked in. So did you.',
  'Marrow money, coming right up.',
  'Rattle the wheel, wake the luck.',
  'Show up, spin up, bone up.',
];

// ---- seeded RNG (mulberry32) so the day's outcome is deterministic ----
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function pickPrizeIndex(rng) {
  const total = PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (let i = 0; i < SEG; i++) { r -= PRIZES[i].weight; if (r < 0) return i; }
  return 0;
}
function seededIngredient(rng) {
  const ids = COMMON_INGREDIENT_IDS;
  return ids[Math.floor(rng() * ids.length)];
}
function quoteForDay(day) { return QUOTES[hashStr('q' + day) % QUOTES.length]; }

// ---- geometry: wedge path, clockwise from 12 o'clock ----
function pt(cx, cy, r, aDeg) { const a = aDeg * Math.PI / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; }
function wedgePath(cx, cy, r, i) {
  const [x0, y0] = pt(cx, cy, r, i * SEG_DEG);
  const [x1, y1] = pt(cx, cy, r, (i + 1) * SEG_DEG);
  return `M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
}

function wheelSvg() {
  const cx = 100, cy = 100, R = 94;
  const darkA = '#1c1b26', darkB = '#26242f', goldW = '#3c3016';
  let wedges = '', labels = '';
  for (let i = 0; i < SEG; i++) {
    const p = PRIZES[i];
    const fill = p.gold ? goldW : (i % 2 ? darkB : darkA);
    wedges += `<path d="${wedgePath(cx, cy, R, i)}" fill="${fill}" stroke="rgba(165,232,71,.28)" stroke-width="1"/>`;
    const mid = i * SEG_DEG + SEG_DEG / 2;
    // one anchor per wedge: icon ABOVE, label BELOW, both upright + centered.
    // Same treatment in every wedge (no radial side-by-side), so it stays tidy.
    const [mx, my] = pt(cx, cy, 60, mid);
    const col = p.gold ? '#e8c24d' : '#f2e9d7';
    labels += iconAt(p, mx, my - 8, 26);
    labels += `<text x="${mx.toFixed(1)}" y="${(my + 17).toFixed(1)}" font-size="9" font-weight="800" fill="${col}" text-anchor="middle" dominant-baseline="central" style="font-family:var(--body,system-ui);letter-spacing:.02em">${p.tag}</text>`;
  }
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="97" fill="none" stroke="#0d0c12" stroke-width="6"/>
    <circle cx="100" cy="100" r="94.5" fill="none" stroke="rgba(165,232,71,.5)" stroke-width="2"/>
    ${wedges}${labels}</svg>`;
}

const STYLE = `
.dw{position:fixed;inset:0;z-index:210;display:grid;place-items:center;padding:20px;overflow:hidden;
  background:radial-gradient(circle at 50% 42%,#16221a 0%,#0c0f0c 55%,#070806 100%);
  animation:dwIn .3s ease-out both}
.dw.dw-out{animation:dwOut .3s ease both}
.dw-wisp{position:absolute;width:60%;aspect-ratio:1;border-radius:50%;filter:blur(46px);pointer-events:none;
  background:radial-gradient(circle,rgba(120,200,120,.14),transparent 70%);animation:dwWisp 9s ease-in-out infinite alternate}
.dw-wisp.two{right:-10%;top:30%;animation-duration:12s;animation-delay:-3s}
.dw-card{position:relative;width:min(90vw,420px);display:grid;justify-items:center;gap:14px;text-align:center}
.dw-quote{font-family:var(--display,'Bangers','Arial Black',sans-serif);font-size:clamp(20px,5.4vw,26px);
  line-height:1.05;color:#f2e9d7;letter-spacing:.02em;text-shadow:2px 2px 0 rgba(0,0,0,.6);max-width:22ch;text-wrap:balance;
  transform:rotate(-1.5deg)}
.dw-title{font-size:11px;font-weight:800;letter-spacing:.28em;text-transform:uppercase;color:#a5e847;
  animation:dwFlicker 4s steps(1,end) infinite}
.dw-wheelwrap{position:relative;width:min(80vw,320px);aspect-ratio:1;margin:2px auto}
.dw-wheel{width:100%;height:100%;transform:rotate(0deg);filter:drop-shadow(0 12px 26px rgba(0,0,0,.6))}
.dw-wheel svg{width:100%;height:100%;display:block}
.dw-spinning{transition:transform 4.4s cubic-bezier(.13,.72,.16,1)}
.dw-hub{position:absolute;left:50%;top:50%;width:23%;aspect-ratio:1;transform:translate(-50%,-50%);
  border-radius:50%;background:radial-gradient(circle at 50% 38%,#2a2833,#141118);
  border:2px solid rgba(165,232,71,.55);display:grid;place-items:center;font-size:min(7vw,26px);
  box-shadow:0 0 16px rgba(165,232,71,.25),inset 0 -3px 8px rgba(0,0,0,.6)}
.dw-pointer{position:absolute;left:50%;top:-4%;transform:translateX(-50%);z-index:3;
  width:0;height:0;border-left:15px solid transparent;border-right:15px solid transparent;
  border-top:26px solid #f2e9d7;filter:drop-shadow(0 3px 2px rgba(0,0,0,.55))}
.dw-pointer::after{content:'';position:absolute;left:-15px;top:-30px;width:0;height:0;
  border-left:15px solid transparent;border-right:15px solid transparent;border-top:5px solid #0d0c12}
.dw-cta{font-family:var(--display,'Bangers',sans-serif);font-size:22px;letter-spacing:.06em;
  color:#16210b;background:#a5e847;border:0;border-radius:14px;padding:12px 40px;cursor:pointer;
  box-shadow:0 4px 0 #6f9c2f,0 0 18px rgba(165,232,71,.4);transition:transform .1s}
.dw-cta:active{transform:translateY(3px);box-shadow:0 1px 0 #6f9c2f}
.dw-cta[disabled]{opacity:.5;pointer-events:none}
.dw-result{display:grid;justify-items:center;gap:8px;min-height:70px;animation:dwPop .45s cubic-bezier(.34,1.6,.64,1) both}
.dw-result .ri{font-size:46px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.5))}
.dw-result .rl{font-family:var(--display,'Bangers',sans-serif);font-size:24px;color:#f2e9d7}
.dw-result .rl b{color:#a5e847}
.dw-result.gold .rl b{color:#e8c24d}
.dw-sub{font-size:12.5px;color:#8f8a99;font-weight:600}
@keyframes dwIn{from{opacity:0}}
@keyframes dwOut{to{opacity:0}}
@keyframes dwWisp{from{transform:translate(-8%,4%) scale(1)}to{transform:translate(10%,-6%) scale(1.15)}}
@keyframes dwFlicker{0%,100%{opacity:1}17%{opacity:.35}19%{opacity:1}52%{opacity:.5}54%{opacity:1}83%{opacity:.7}}
@keyframes dwPop{from{opacity:0;transform:scale(.6)}}
@media (prefers-reduced-motion:reduce){.dw,.dw-result{animation:none}.dw-wisp,.dw-title{animation:none}}
`;

function ensureStyle() {
  if (document.getElementById('dw-style')) return;
  const s = document.createElement('style');
  s.id = 'dw-style'; s.textContent = STYLE;
  document.head.appendChild(s);
}

function waitForSplash(maxMs = 6000) {
  return new Promise(res => {
    const t0 = Date.now();
    const tick = () => {
      if (!document.getElementById('splash') || Date.now() - t0 > maxMs) return res();
      setTimeout(tick, 120);
    };
    tick();
  });
}

// final rotation that lands wedge `idx` under the top pointer (+ full spins)
function landingRotation(idx, spins = 5) {
  const center = idx * SEG_DEG + SEG_DEG / 2;   // clockwise from top
  return spins * 360 + (360 - center);
}

export async function maybeShowDailyWheel({ sounds = true, force = false } = {}) {
  // ?wheel=1 = preview: shows the wheel anytime, no gate, no grant (safe to demo)
  const preview = typeof location !== 'undefined' && location.search.includes('wheel=1');
  if (navigator.webdriver && !window.__wheelForce && !force && !preview) return false;
  ensureStyle();
  const today = dateKey();
  // one-time make-good: the pre-v61 bug consumed the day on SHOW, so anyone who
  // saw-but-didn't-spin lost today's spin. Clear that stale gate once so the
  // wheel returns. Runs a single time ever, then normal daily gating resumes.
  if (!(await kvGet('wheelResetOnce_v61', false))) {
    await kvSet('wheelResetOnce_v61', true);
    await kvSet('wheelLastDate', null);
  }
  if (!force && !preview && (await kvGet('wheelLastDate', null)) === today) return false;

  await waitForSplash();
  if (sheetStackOpen()) return false;              // don't stack over an open sheet

  const rng = preview ? mulberry32((Math.random() * 1e9) | 0) : mulberry32(hashStr('wheel:' + today));
  const idx = pickPrizeIndex(rng);
  const prize = PRIZES[idx];

  // Gate + grant happen ON SPIN, not on show — so closing the wheel without
  // spinning does NOT burn your daily spin (it comes back next open). Setting
  // the date BEFORE the grant still blocks a mid-spin reload double-dip, and the
  // prize is date-seeded so it can't be rerolled by reloading.
  const commit = async () => {
    if (preview) return { coinDelta: 0 };
    if ((await kvGet('wheelLastDate', null)) === today) return { coinDelta: 0 };
    await kvSet('wheelLastDate', today);
    const before = await coins();
    await prize.grant(rng);
    return { coinDelta: (await coins()) - before };
  };
  const result = { iconHtml: iconHtml(prize, 40), name: prize.name, gold: prize.gold, coinDelta: 0 };
  return showWheel(idx, prize, result, commit, { sounds });
}

function sheetStackOpen() {
  return !!document.querySelector('#sheets .sheet');
}

function showWheel(idx, prize, result, commit, { sounds }) {
  return new Promise(resolve => {
    const dw = document.createElement('div');
    dw.className = 'dw';
    dw.setAttribute('role', 'dialog');
    dw.innerHTML = `
      <div class="dw-wisp"></div><div class="dw-wisp two"></div>
      <div class="dw-card">
        <div class="dw-title">Daily Spin</div>
        <div class="dw-quote">${esc(quoteForDay(dateKey()))}</div>
        <div class="dw-wheelwrap">
          <div class="dw-pointer"></div>
          <div class="dw-wheel">${wheelSvg()}</div>
          <div class="dw-hub">💀</div>
        </div>
        <button class="dw-cta" id="dwSpin">SPIN</button>
        <div class="dw-sub" id="dwSub">Free spin, once a day</div>
      </div>`;
    document.body.appendChild(dw);
    const wheel = dw.querySelector('.dw-wheel');
    const spinBtn = dw.querySelector('#dwSpin');
    const sub = dw.querySelector('#dwSub');

    let done = false;
    const finish = () => { if (done) return; done = true; dw.classList.add('dw-out'); setTimeout(() => { dw.remove(); resolve(true); }, 300); };

    const reveal = () => {
      const detail = result.coinDelta > 0
        ? `You won <b>${result.coinDelta} coins</b>`
        : `You won <b>${prize.name}</b>`;
      const card = dw.querySelector('.dw-card');
      card.querySelector('.dw-cta')?.remove();
      const r = document.createElement('div');
      r.className = 'dw-result' + (result.gold ? ' gold' : '');
      r.innerHTML = `<div class="ri">${result.iconHtml}</div><div class="rl">${detail}</div>`;
      sub.replaceWith(r);
      const collect = document.createElement('button');
      collect.className = 'dw-cta'; collect.textContent = 'COLLECT';
      collect.addEventListener('click', finish, { once: true });
      card.appendChild(collect);
      if (sounds) { try { levelSound(true); } catch { /* no audio */ } }
      try { window.dispatchEvent(new CustomEvent('bh-wheel-won', { detail: result })); } catch { /* noop */ }
    };

    const spin = async () => {
      spinBtn.disabled = true;
      // consume the day + grant the prize the moment they commit to spinning
      try { const c = await commit(); result.coinDelta = c.coinDelta; } catch { /* grant best-effort */ }
      if (sounds) { try { popSound(true); } catch { /* no audio */ } }
      if (reducedMotion) {
        wheel.style.transform = `rotate(${360 - (idx * SEG_DEG + SEG_DEG / 2)}deg)`;
        reveal(); return;
      }
      wheel.classList.add('dw-spinning');
      // double-rAF so the transition class is live before we set the target
      requestAnimationFrame(() => requestAnimationFrame(() => {
        wheel.style.transform = `rotate(${landingRotation(idx)}deg)`;
      }));
      wheel.addEventListener('transitionend', reveal, { once: true });
      // safety net if transitionend never fires
      setTimeout(() => { if (!dw.querySelector('.dw-result')) reveal(); }, reducedMotion ? 50 : 5200);
    };

    spinBtn.addEventListener('click', spin, { once: true });
    // test hook (headless only): deterministic drive
    if (navigator.webdriver) window.__dw = { spin, idx, prize: prize.key, reveal, finish, el: dw };
  });
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

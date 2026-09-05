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

import { kvGet, kvSet, claimDay } from './db.js';
import { dateKey } from './nutrition.js';
import { coinsAdd, grantCrate, grantConsumable, coins } from './loot.js';
import { grantIngredient, INGREDIENTS, COMMON_INGREDIENT_IDS } from './cooking.js';
import { popSound, levelSound, reducedMotion } from './fx.js';
import { bhIconRaw } from './icons-pack.js';
import { pixCur } from './icons-pix.js';

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

/* WHICH PRIZES HAVE PIXEL ART. All seven, as of v421.
   Three of them used to be listed here as art that did not exist, and that note
   was wrong on all three counts, which is what Tom was looking at: "the daily
   spin wheel still doesnt have the pixel art icons in some of the wheel's
   parts" (2026-08-21).
     COINS and the BATTLE CHARM map 1:1 onto Tom's 48px set. Always did.
     THE TWO CRATES were held back on the reasoning that "the set has one crate
       drawing", so the gold wedge could only stay distinct in its tint. It is
       not one drawing: assets/crates/common/f0.png and assets/crates/golden/f0.png
       are two different 48px chests, already precached, already what
       app.js:crateIcon serves at its top step on the Shop cells. They live
       outside PIX_CUR only because that table is keyed to assets/icons-pix/.
     THE FRESH SCRAP was called "no pixel drawing at all". All seven cooking
       ingredients have one. The wedge already picked sinew as the stand-in for
       a prize that grants a RANDOM common ingredient (bhIconRaw('ingr-sinew')
       below), so this swaps the medium and changes no subject.
   The vector arms below are the fallback, not the plan: they still fire if a
   PNG ever goes missing, so a wedge can never come up bare. */
/* EXPORTED SO THE GUARD CAN ASK RATHER THAN GUESS. tests/wheel-audit.mjs used to
   derive its expected count from the rendered LABEL text (a numeric tag, or the
   word "Charm"), and its header claimed that was "derived from the module's own
   prize table". It was not: it was a proxy for the table, and when the Scrap
   wedge joined the pixel set the proxy stayed behind and the row went red on
   healthy code. Now both sides of that row come from here.
   pixelPrizeCount is a function of the SAME table wheelSvg draws, so a wedge
   cannot join or leave the pixel set without moving the expectation with it. */
const PIX_PRIZE = p => (p.coin ? 'coin' : p.iconId === 'charm' ? 'xp2' : p.iconId === 'ingredient' ? 'sinew' : null);
export const pixelPrizeCount = () => PRIZES.filter(p => PIX_PRIZE(p)).length;
/* Keyed by iconId, and it reuses .crate-ico-pix on purpose: that class is where
   image-rendering:pixelated lives (app.css). A private class here would render
   these two through the browser's smooth scaler, which is the exact failure this
   whole set of art is fighting. */
const CRATE_PRIZE = { 'crate-daily': 'crates/common/f0', 'crate-golden': 'crates/golden/f0' };
// Ask for the ARTWORK, never just the kind: wheelSvg drops its vector only when
// this returns something, so a helper that declines can never leave a bare wedge.
const pixPrizeImg = p => {
  const k = PIX_PRIZE(p);
  if (k) return pixCur(k, 48) || null;
  const f = CRATE_PRIZE[p.iconId];
  return f ? `<img src="assets/${f}.png" alt="" class="crate-ico-pix" width="48" height="48"`
    + ` style="width:48px;height:48px" decoding="sync">` : null;
};

/* The pixel art is placed as DOM <img> SIBLINGS of the wheel svg, not inside it.
   The svg is a 0..200 viewBox scaled to a fluid min(80vw,320px) box, so anything
   drawn in svg units lands on a viewport-dependent fractional pixel size, and
   this art only survives 48/24/16. Absolute-positioned children of .dw-wheel
   ride the same rotate() transform, so they spin with their wedge exactly as the
   nested svgs did. Percentages come from the same pt() geometry as the wedges,
   so icon and label cannot drift apart. */
function wheelIconsHtml() {
  return PRIZES.map((p, i) => {
    const img = pixPrizeImg(p);
    if (!img) return '';
    const [mx, my] = pt(100, 100, 60, i * SEG_DEG + SEG_DEG / 2);
    /* top rides a variable so .dw-flip can move the icon to the label's slot
       (the pair swaps around its shared anchor; an inline top would outrank
       the class rule). --dwt is the normal slot, --dwft the flipped one. */
    return `<span class="dw-ico" style="left:${(mx / 2).toFixed(2)}%;--dwt:${((my - 8) / 2).toFixed(2)}%;--dwft:${((my + 17) / 2).toFixed(2)}%">${img}</span>`;
  }).join('');
}

// ---- prize table (wheel order; adjacent segments differ in value) ----
// weights sum to 95; probabilities are w/95. jackpot (the Bone Crate) is the gold wedge.
const PRIZES = [
  { key: 'c30',    coin: true,               tag: '30',     name: '30 Coins',       weight: 22, gold: false, grant: () => coinsAdd(30) },
  { key: 'daily',  iconId: 'crate-daily',    tag: 'Crate',  name: 'Common Crate',    weight: 12, gold: false, grant: () => grantCrate('daily', 'wheel') },
  { key: 'ingr',   iconId: 'ingredient',     tag: 'Scrap',  name: 'a Fresh Scrap',  weight: 20, gold: false, grant: (rng) => grantIngredient(seededIngredient(rng), 1) },
  /* 'Bone', not 'Golden', and the same fix one level up. v421 renamed this tag
     from 'GOLD' to 'Golden' because the drawing and the grant agreed with each
     other and only the word was the odd one out. Tom, 2026-08-21: "we need to
     rename the golden crate to bone crate because the icon doesnt match
     anymore". Right: assets/crates/golden/f0.png is a BONE chest, and 'Golden'
     was still describing the vector treasure chest it replaced, so this time it
     is the PRODUCT that was the odd one out, not one wedge.
     WHAT DID NOT MOVE: `key: 'golden'`, `iconId: 'crate-golden'` and
     grantCrate('golden') are save keys and shop ids. Only the words changed.
     The tag has to be a WHOLE WORD of the Shop's label for the art this wedge
     draws, which tests/pixel-art-swap-audit.mjs grades by scraping loot.js, so
     'Bone' tracks 'Bone Crate' automatically and 'Golden' now fails there. */
  { key: 'golden', iconId: 'crate-golden',   tag: 'Bone',   name: 'a Bone Crate', weight: 3,  gold: true,  grant: () => grantCrate('golden', 'wheel') },
  { key: 'c75',    coin: true,               tag: '75',     name: '75 Coins',       weight: 18, gold: false, grant: () => coinsAdd(75) },
  { key: 'c150',   coin: true,               tag: '150',    name: '150 Coins',      weight: 8,  gold: false, grant: () => coinsAdd(150) },
  { key: 'charm',  iconId: 'charm',          tag: 'Charm',  name: 'a Battle Charm', weight: 12, gold: false, grant: () => grantConsumable('xp2', 'wheel') },
];
// Derived, never hardcoded: the Streak Freeze prize was removed in v253 and the
// wheel went from 8 segments to 7 without a single other change.
const SEG = PRIZES.length;
const SEG_DEG = 360 / SEG;

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
    if (!pixPrizeImg(p)) labels += iconAt(p, mx, my - 8, 26);   // the rest ride as DOM imgs, see wheelIconsHtml
    /* transform-origin: the midpoint between icon center (my-8) and label
       center (my+17), in viewBox units (transform-box:view-box), so .dw-flip
       can rotate the label 180° about the pair's shared anchor. Combined with
       a wheel resting near 180°, that lands the label back upright AND back
       below its icon. See the .dw-flip comment in spin(). */
    labels += `<text x="${mx.toFixed(1)}" y="${(my + 17).toFixed(1)}" font-size="9" font-weight="800" fill="${col}" text-anchor="middle" dominant-baseline="central" style="font-family:var(--body,system-ui);letter-spacing:.02em;transform-box:view-box;transform-origin:${mx.toFixed(1)}px ${(my + 4.5).toFixed(1)}px">${p.tag}</text>`;
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
.dw-wheel{width:100%;height:100%;transform:rotate(0deg);filter:drop-shadow(0 12px 26px rgba(0,0,0,.6));position:relative}
.dw-ico{position:absolute;top:var(--dwt);transform:translate(-50%,-50%);line-height:0;pointer-events:none;
  filter:drop-shadow(0 2px 2px rgba(0,0,0,.5))}
/* Landing counter-flip: labels and icons ride the wheel's rotate(), so a rest
   angle in the 90..270 band would leave every tag upside down (Tom, 2026-08-22:
   "some of the text was upside down and hard to read"). .dw-flip rotates each
   icon+label pair 180 deg about its wedge anchor (the text via its baked
   transform-origin, the icon by taking the label's slot + spinning in place),
   which at a near-180 rest restores icon-above-label, both upright. */
.dw-flip svg text{transform:rotate(180deg)}
.dw-flip .dw-ico{top:var(--dwft);transform:translate(-50%,-50%) rotate(180deg)}
.dw-result .ri img{display:block}
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
  /* ?calm is the device-side twin of navigator.webdriver, and the wheel needs it
     named separately because it is the one boot interruption that does NOT live
     in js/app.js's !S.settings family: it is its own module and its own gate.
     Without it a phone opened with simctl lands on the wheel every time and no
     device check can reach Today. See the CALM_BOOT comment in js/app.js. */
  const calm = navigator.webdriver
    || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('calm'));
  if (calm && !window.__wheelForce && !force && !preview) return false;
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
  /* MONOTONIC DAY GUARD (js/db.js claimDay). The date gate above re-arms the
     spin the instant dateKey() changes, so a clock nudge past local midnight
     is a whole extra spin. Ask whether today is a day this device has honestly
     reached before offering one. Deliberately AFTER the force/preview escapes:
     ?wheel=1 grants nothing, so it must not open a day either. */
  if (!force && !preview && !(await claimDay(today)).fresh) return false;

  await waitForSplash();
  if (sheetStackOpen()) return false;              // don't stack over an open sheet

  const rng = preview ? mulberry32((Math.random() * 1e9) | 0) : mulberry32(hashStr('wheel:' + today));
  let idx = pickPrizeIndex(rng);
  /* webdriver-only landing pin (same family as __wheelForce): the upright-label
     rows in tests/wheel-audit.mjs must land CHOSEN wedges in both the top and
     bottom half, and date-seeding gives a test no lever over idx. The prize
     follows the pinned wedge, so grant and drawing still agree. */
  if (navigator.webdriver && Number.isInteger(window.__wheelIdx)) idx = ((window.__wheelIdx % SEG) + SEG) % SEG;
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
  const result = { iconHtml: pixPrizeImg(prize) || iconHtml(prize, 40), name: prize.name, gold: prize.gold, coinDelta: 0 };
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
          <div class="dw-wheel">${wheelSvg()}${wheelIconsHtml()}</div>
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

    /* SKIP. The prize is already decided (idx is fixed before the wheel is even
       built) so ending the spin early reveals nothing sooner than it should; it
       only stops costing the player five seconds a day. reveal() now guards
       itself because a skip, the transitionend and the 5.2s safety net can all
       reach it, and it is not idempotent: sub is replaced on the first run. */
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
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
      /* Any landing whose rest angle sits in the 90..270 band would leave every
         label upside down, so counter-flip them (see .dw-flip in STYLE). The
         class goes on in the SAME frame as the landing transform: the spin's
         fast start masks the snap, and the slow deceleration tail then settles
         with the labels already upright, so nothing pops at rest. */
      const rest = ((360 - (idx * SEG_DEG + SEG_DEG / 2)) % 360 + 360) % 360;
      const flip = rest > 90 && rest < 270;
      if (reducedMotion) {
        if (flip) wheel.classList.add('dw-flip');
        wheel.style.transform = `rotate(${360 - (idx * SEG_DEG + SEG_DEG / 2)}deg)`;
        reveal(); return;
      }
      wheel.classList.add('dw-spinning');
      // double-rAF so the transition class is live before we set the target
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (flip) wheel.classList.add('dw-flip');
        wheel.style.transform = `rotate(${landingRotation(idx)}deg)`;
      }));
      wheel.addEventListener('transitionend', reveal, { once: true });
      // safety net if transitionend never fires
      setTimeout(reveal, reducedMotion ? 50 : 5200);
      // the CTA becomes the skip: same button, same place, no new furniture
      spinBtn.disabled = false;
      spinBtn.textContent = 'SKIP';
      spinBtn.addEventListener('click', () => {
        if (revealed) return;
        wheel.classList.remove('dw-spinning');   // drop the transition so the snap is instant
        wheel.style.transform = `rotate(${landingRotation(idx)}deg)`;
        reveal();
      }, { once: true });
    };

    spinBtn.addEventListener('click', spin, { once: true });
    // test hook (headless only): deterministic drive
    /* `coin` is exposed because the KEY cannot be used to infer it. Coin prizes
       are c30/c75/c150 and a test that reads "starts with c" also catches
       'charm', which pays no coins by design and was therefore graded as a coin
       prize that failed to pay. The table already carries the flag; hand it over
       rather than making the caller guess from a naming convention. */
    if (navigator.webdriver) window.__dw = { spin, idx, prize: prize.key, coin: !!prize.coin, reveal, finish, el: dw };
  });
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

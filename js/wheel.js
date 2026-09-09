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

import { db, kvGet, kvSet, claimDay } from './db.js';
import { dateKey } from './nutrition.js';
import { crateRow, consumableRow } from './loot.js';
import { INGREDIENTS, COMMON_INGREDIENT_IDS } from './cooking.js';
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

/* Presentation only: a single 48px art ring, with names in a fixed key outside
   the rotating wheel. Never offset individual icons to make room for text. */
function wheelIconsHtml() {
  return PRIZES.map((p, i) => {
    const img = pixPrizeImg(p) || iconHtml(p, 48);
    const [mx, my] = pt(100, 100, 60, i * SEG_DEG + SEG_DEG / 2);
    return `<span class="dw-ico" style="left:${(mx / 2).toFixed(2)}%;top:${(my / 2).toFixed(2)}%">${img}</span>`;
  }).join('');
}

// Prize TYPE controls the spot colour. This never participates in selection.
const prizeColour = p => p.coin ? '#E2AB36' : CRATE_PRIZE[p.iconId] ? '#F0EDD6' : '#2A2D28';
function wheelPrizesHtml() {
  return `<ul class="dw-prizes" aria-label="Wheel prizes">${PRIZES.map(p =>
    `<li><span class="dw-swatch" aria-hidden="true" style="background:${prizeColour(p)}"></span><span class="dw-prize-name">${esc(p.name)}</span></li>`
  ).join('')}</ul>`;
}

// Payout descriptions contain no writes. claimSpin commits them with the date
// and receipt, so a failed storage write leaves the whole spin available.
const coinPay = amount => ({ coinDelta: amount, kv: {
  coins: cur => Math.max(0, (Number(cur) || 0) + amount),
  coinsRev: cur => Math.max(0, (Number(cur) || 0) + amount),
} });

// ---- prize table (wheel order; adjacent segments differ in value) ----
// Weights sum to 95; probabilities are w/95. Spot colours are presentation only.
const PRIZES = [
  { key: 'c30',    coin: true,               tag: '30',     name: '30 Coins',       weight: 22, gold: false, pay: () => coinPay(30) },
  { key: 'daily',  iconId: 'crate-daily',    tag: 'Crate',  name: 'Common Crate',    weight: 12, gold: false, pay: () => ({ puts: [{ store: 'inv', val: crateRow('daily', 'wheel') }] }) },
  { key: 'ingr',   iconId: 'ingredient',     tag: 'Scrap',  name: 'a Fresh Scrap',  weight: 20, gold: false, pay: rng => {
    const id = seededIngredient(rng);
    return { kv: { ingredients: inv => ({ ...(inv || {}), [id]: ((inv && inv[id]) || 0) + 1 }) } };
  } },
  /* 'Bone', not 'Golden', and the same fix one level up. v421 renamed this tag
     from 'GOLD' to 'Golden' because the drawing and the grant agreed with each
     other and only the word was the odd one out. Tom, 2026-08-21: "we need to
     rename the golden crate to bone crate because the icon doesnt match
     anymore". Right: assets/crates/golden/f0.png is a BONE chest, and 'Golden'
     was still describing the vector treasure chest it replaced, so this time it
     is the PRODUCT that was the odd one out, not one wedge.
     WHAT DID NOT MOVE: `key: 'golden'`, `iconId: 'crate-golden'` and
     crateRow('golden') are save keys and shop ids. Only the words changed.
     The tag has to be a WHOLE WORD of the Shop's label for the art this wedge
     draws, which tests/pixel-art-swap-audit.mjs grades by scraping loot.js, so
     'Bone' tracks 'Bone Crate' automatically and 'Golden' now fails there. */
  { key: 'golden', iconId: 'crate-golden',   tag: 'Bone',   name: 'a Bone Crate', weight: 3,  gold: true,  pay: () => ({ puts: [{ store: 'inv', val: crateRow('golden', 'wheel') }] }) },
  { key: 'c75',    coin: true,               tag: '75',     name: '75 Coins',       weight: 18, gold: false, pay: () => coinPay(75) },
  { key: 'c150',   coin: true,               tag: '150',    name: '150 Coins',      weight: 8,  gold: false, pay: () => coinPay(150) },
  { key: 'charm',  iconId: 'charm',          tag: 'Charm',  name: 'a Battle Charm', weight: 12, gold: false, pay: () => ({ puts: [{ store: 'inv', val: consumableRow('xp2', 'wheel') }] }) },
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
  const cx = 100, cy = 100, R = 91;
  const wedges = PRIZES.map((p, i) =>
    `<path d="${wedgePath(cx, cy, R, i)}" fill="${prizeColour(p)}" stroke="#2A2D28" stroke-width="1.25"/>`
  ).join('');
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="100" cy="100" r="97" fill="#FD6857" stroke="#2A2D28" stroke-width="2"/>
    ${wedges}</svg>`;
}

const STYLE = `
.dw{position:fixed;inset:0;z-index:210;display:grid;place-items:center;padding:20px;overflow:auto;
  background:#0d0c12;animation:dwIn .3s ease-out both}
.dw.dw-out{animation:dwOut .3s ease both}
.dw-card{position:relative;box-sizing:border-box;width:min(100%,420px);margin:auto;display:grid;
  justify-items:center;gap:12px;padding:20px 16px;text-align:center;background:#EDE7D6;color:#2A2D28;
  border:2px solid #2A2D28;border-radius:20px;box-shadow:4px 5px 0 #2A2D28}
/* Printed paper texture sits behind the content, never filters the artwork. */
.dw-card::before{content:'';position:absolute;inset:0;border-radius:18px;pointer-events:none;opacity:.05;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%232A2D28' filter='url(%23n)' d='M0 0h160v160H0z'/%3E%3C/svg%3E")}
.dw-card>*{position:relative}
.dw-quote{font-family:var(--display,'Bangers','Arial Black',sans-serif);font-size:clamp(20px,5.4vw,26px);
  line-height:1.05;letter-spacing:.02em;max-width:22ch;text-wrap:balance}
.dw-title{font-size:11px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;
  background:#FD6857;padding:6px 14px;border:2px solid #2A2D28;border-radius:8px;box-shadow:2px 3px 0 #2A2D28}
.dw-wheelwrap{position:relative;width:min(100%,320px);aspect-ratio:1;margin:10px auto 4px}
.dw-wheel{width:100%;height:100%;transform:rotate(0deg);filter:drop-shadow(4px 5px 0 #2A2D28);position:relative}
.dw-ico{position:absolute;transform:translate(-50%,-50%);line-height:0;pointer-events:none}
.dw-ico img{display:block;width:48px;height:48px;image-rendering:pixelated}
.dw-prizes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 14px;
  width:100%;margin:0;padding:0;list-style:none;text-align:left;font-size:.8125rem;font-weight:700}
.dw-prizes li{display:flex;align-items:center;gap:7px;min-width:0}
.dw-swatch{flex:0 0 10px;height:10px;border:2px solid #2A2D28;border-radius:3px}
.dw-prize-name{overflow-wrap:anywhere}
.dw-result .ri img{display:block}
.dw-wheel svg{width:100%;height:100%;display:block}
.dw-ico svg{width:48px;height:48px}
.dw-spinning{transition:transform 4.4s cubic-bezier(.13,.72,.16,1)}
.dw-hub{position:absolute;left:50%;top:50%;width:23%;aspect-ratio:1;transform:translate(-50%,-50%);
  border-radius:50%;background:#2A2D28;border:2px solid #F0EDD6;display:grid;place-items:center;
  font-size:min(7vw,26px);box-shadow:3px 3px 0 #2A2D28}
.dw-pointer{position:absolute;left:50%;top:-4%;transform:translateX(-50%);z-index:3;
  width:0;height:0;border-left:15px solid transparent;border-right:15px solid transparent;
  border-top:26px solid #2A2D28;filter:drop-shadow(2px 3px 0 #2A2D28)}
.dw-pointer::after{content:'';position:absolute;left:-11px;top:-24px;width:0;height:0;
  border-left:11px solid transparent;border-right:11px solid transparent;border-top:19px solid #F0EDD6}
.dw-cta{font-family:var(--display,'Bangers',sans-serif);font-size:22px;letter-spacing:.06em;
  color:#2A2D28;background:#A5E847;border:2px solid #2A2D28;border-radius:14px;padding:12px 40px;cursor:pointer;
  box-shadow:4px 5px 0 #2A2D28;transition:transform .1s}
.dw-cta:active{transform:translate(2px,3px);box-shadow:2px 2px 0 #2A2D28}
.dw-cta[disabled]{opacity:.5;pointer-events:none}
.dw-result{display:grid;justify-items:center;gap:8px;min-height:70px;animation:dwPop .45s cubic-bezier(.13,.72,.16,1) both}
.dw-result .ri{font-size:46px}
.dw-result .rl{font-family:var(--display,'Bangers',sans-serif);font-size:24px;color:#2A2D28;text-transform:uppercase}
.dw-result .rl b{background:#E2AB36;padding:0 4px}
.dw-result.gold .rl b{background:#F0EDD6}
.dw-sub{font-size:12.5px;color:#64605A;font-weight:600}
@keyframes dwIn{from{opacity:0}}
@keyframes dwOut{to{opacity:0}}
@keyframes dwPop{from{opacity:0;transform:scale(.6)}}
@media (prefers-reduced-motion:reduce){.dw,.dw-result{animation:none}}
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
  if (!force && !preview) {
    const day = await claimDay(today);
    /* The refusal is HANDED BACK, not swallowed (QA round 26 O14): the caller in
       js/app.js owns the toast copy (DAY_GUARD_COPY) and this used to be one of
       the five day-keyed rewards that said nothing when the guard refused. */
    if (!day.fresh) return { dayGuard: day.reason || true };
  }

  await waitForSplash();
  /* B14: this used to return a bare false, indistinguishable from "already
     claimed today" or "webdriver" to the caller, so nothing ever retried once
     the blocking sheet closed. A level-up sheet opening during boot's splash
     wait (initGameIfNeeded's XP replay dispatches bh-levelup synchronously)
     measured 5 of 14 days losing the spin outright: it never re-fired that
     session. Nothing has been claimed yet (the date gate above is idempotent
     and commit() below is what actually spends the day), so telling the
     caller "still owed, try again once the stack drains" is free. */
  if (sheetStackOpen()) return { pending: true };  // don't stack over an open sheet

  const rng = preview ? mulberry32((Math.random() * 1e9) | 0) : mulberry32(hashStr('wheel:' + today));
  let idx = pickPrizeIndex(rng);
  /* webdriver-only landing pin (same family as __wheelForce): the upright-label
     rows in tests/wheel-audit.mjs must land CHOSEN wedges in both the top and
     bottom half, and date-seeding gives a test no lever over idx. The prize
     follows the pinned wedge, so grant and drawing still agree. */
  if (navigator.webdriver && Number.isInteger(window.__wheelIdx)) idx = ((window.__wheelIdx % SEG) + SEG) % SEG;
  const prize = PRIZES[idx];

  // Freeze random ingredients and inventory ids for retries of this spin.
  const pay = prize.pay(rng);
  const commit = async () => {
    if (preview) return { coinDelta: 0 };
    if ((await kvGet('wheelLastDate', null)) === today) return { coinDelta: 0, already: true };
    if (!(await claimSpin(today, pay))) return { coinDelta: 0, already: true };
    return { coinDelta: pay.coinDelta || 0 };
  };
  const result = { iconHtml: pixPrizeImg(prize) || iconHtml(prize, 40), name: prize.name, gold: prize.gold, coinDelta: 0 };
  return showWheel(idx, prize, result, commit, { sounds });
}

/* The day's spin claim and payout share one transaction. Exactly one caller
   is told true for a given day. An abort leaves neither receipt nor spent date.
   Exported so the race can be driven in node (tests/unit.test.js, mem-idb). */
export function claimSpin(today, pay = {}) {
  return db.claimAndPay('kv', { k: `wheelspin:${today}`, v: Date.now() }, {
    ...pay, kv: { ...(pay.kv || {}), wheelLastDate: () => today },
  });
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
      <div class="dw-card">
        <div class="dw-title">Daily Spin</div>
        <div class="dw-quote">${esc(quoteForDay(dateKey()))}</div>
        <div class="dw-wheelwrap">
          <div class="dw-pointer"></div>
          <div class="dw-wheel">${wheelSvg()}${wheelIconsHtml()}</div>
          <div class="dw-hub">💀</div>
        </div>
        ${wheelPrizesHtml()}
        <button class="dw-cta" id="dwSpin">SPIN</button>
        <div class="dw-sub" id="dwSub">Free spin, once a day</div>
      </div>`;
    document.body.appendChild(dw);
    const wheel = dw.querySelector('.dw-wheel');
    const spinBtn = dw.querySelector('#dwSpin');
    const sub = dw.querySelector('#dwSub');

    let spinning = false;
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
      const detail = result.already ? 'Already spun today'
        : result.coinDelta > 0
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
      if (!result.already) try { window.dispatchEvent(new CustomEvent('bh-wheel-won', { detail: result })); } catch { /* noop */ }
    };

    const spin = async () => {
      if (spinning) return;
      spinning = true;
      spinBtn.disabled = true;
      try {
        const c = await commit(); result.coinDelta = c.coinDelta; result.already = !!c.already;
      } catch {
        spinning = false;
        spinBtn.disabled = false;
        spinBtn.textContent = 'RETRY';
        sub.textContent = 'Your spin was not saved. Retry to collect your prize.';
        return;
      }
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

    spinBtn.addEventListener('click', spin);
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

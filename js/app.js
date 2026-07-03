// Tally: app orchestrator. Screens, sheets, and flows.
import { db, kvGet, kvSet, newId, exportAll, importAll, useDbName, requestPersistence } from './db.js';
import { confettiBurst, confettiRain, tweenNumber, popSound, levelSound, reducedMotion } from './fx.js';
import {
  levelFor, totalXp, onFoodLogged, onWeighIn, onHealthSync, awardDayCloseIfDue,
  initGameIfNeeded, initLootIfNeeded, checkStreakFreeze, evaluateBadges, earnedBadgeIds,
  BADGES, xpForDate, parseHkPayload,
} from './game.js';
import {
  RARITIES, CRATES, CONSUMABLES, SHOP, coins, inventory, ownedCosmeticIds,
  unopenedCrates, openCrate, buyShopItem, equipped, equip, activateXpBoost,
  xpBoostCharges, consumableCount,
} from './loot.js';
import { dailyQuests, questState, claimQuest, claimAllBonusIfDue, weeklyState, claimWeekly, WEEKLY } from './quests.js';
import { spawnsNear, spawnKey, collectSpawn, SPAWN_TYPES, COLLECT_RADIUS_M, VIEW_RADIUS_M, fmtDist, compassLabel } from './hunt.js';
import { BH_SLOTS, BH_ITEMS, BH_BY_ID, bhAsset } from '../data/boneheadz.js';
import {
  computeTargets, nutrientsFor, portionLabel, dayTotals, dateKey, addDays,
  mealForHour, MEALS, fmtKcal, fmtG, fmtQty, streakFrom, weightTrend, trendRatePerWeek,
  lbToKg, kgToLb, ftInToCm, cmToFtIn, ACTIVITY_LEVELS, GOALS, kcalConsistent,
} from './nutrition.js';
import { GENERIC_FOODS, searchFoods } from '../data/generic-foods.js';
import { fetchOffProduct, fetchFdcByBarcode, searchFdc } from './sources.js';
import { parseNutritionText } from './labelparse.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };

const S = {
  settings: null,
  userFoods: [],
  date: dateKey(),
  demo: new URLSearchParams(location.search).has('demo'),
  onlineCache: new Map(),
  ui: { ringPct: 0, remainShown: null, macroPcts: [0, 0, 0] }, // last-rendered values so charts animate between states
  celebration: null,
  sounds: true,
};

const ICONS = {
  barcode: '<svg viewBox="0 0 24 24"><path d="M3 6v12M7 6v12M10 6v8M13 6v12M16 6v8M19 6v12M21 6v12"/></svg>',
  label: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2L4.5 13.5H11L9.5 22 19 10h-6.5z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  star: (on) => `<svg viewBox="0 0 24 24" style="width:21px;height:21px;${on ? 'fill:var(--carbs);stroke:var(--carbs)' : 'fill:none;stroke:var(--text-3)'};stroke-width:1.8"><path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.9 6.4 20l1.3-6.2L3 9.5l6.3-.7z"/></svg>`,
  coin: (s = 14) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.2" fill="#ffb454" stroke="#3a2b12" stroke-width="1.6"/><circle cx="12" cy="12" r="6.9" fill="none" stroke="#3a2b12" stroke-width="1" opacity="0.45"/><g fill="#5a3f14"><circle cx="7.8" cy="10.6" r="1.6"/><circle cx="7.8" cy="13.4" r="1.6"/><circle cx="16.2" cy="10.6" r="1.6"/><circle cx="16.2" cy="13.4" r="1.6"/><rect x="7.4" y="10.7" width="9.2" height="2.6" rx="1.3"/></g></svg>`,
  flame: (s = 15) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 2.6s5.8 4.6 5.8 10.4c0 3.9-2.6 6.9-5.8 6.9s-5.8-3-5.8-6.9c0-2.4 1.2-4.6 2.4-6.1 0 1.5.6 2.6 1.6 2.6 1.3.6 1.8-2.9 1.8-6.9z" fill="#ffb454" stroke="#3a2313" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 12.3c1.4 1 2.1 2.2 2.1 3.4 0 1.6-.9 2.7-2.1 2.7s-2.1-1.1-2.1-2.7c0-1.2.7-2.4 2.1-3.4z" fill="#ffe08a"/></svg>`,
  freeze: (s = 20) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4.5" fill="#bfe7ff" opacity="0.92" stroke="#173a52" stroke-width="1.6"/><path d="M12 7v10M8.5 9l7 6M15.5 9l-7 6" stroke="#5fa8d8" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  boltIco: (s = 18) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M13 2.5L5.4 13h5l-1.6 8.5L18.6 10h-5z" fill="#ffe08a" stroke="#3a2b12" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  sneaker: (s = 19) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M3 15.5c0-1.1.8-2 2-2h4l3-3.6c2.5 2 6.4 3 8.4 3.5.9.2 1.6 1 1.6 2v2.1H3z" fill="#ff9dc7" stroke="#33121f" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 18h19" stroke="#33121f" stroke-width="1.7" stroke-linecap="round"/><path d="M10.5 12.5l1.2 1.2M12.5 10.7l1.2 1.2" stroke="#33121f" stroke-width="1.2" stroke-linecap="round"/></svg>`,
};

ICONS.radar = (s = 14) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.4" fill="none" stroke="#7cc4ff" stroke-width="1.7"/><circle cx="12" cy="12" r="5" fill="none" stroke="#7cc4ff" stroke-width="1.4" opacity="0.6"/><circle cx="12" cy="12" r="1.8" fill="#7cc4ff"/><path d="M12 12L18.5 5.5" stroke="#7cc4ff" stroke-width="1.7" stroke-linecap="round"/></svg>`;
ICONS.bone = (s = 18) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><g fill="#f2e9d7" stroke="#3a352a" stroke-width="1.3"><circle cx="6.2" cy="7.6" r="2.6"/><circle cx="8.8" cy="5" r="2.6"/><circle cx="17.8" cy="16.4" r="2.6"/><circle cx="15.2" cy="19" r="2.6"/><rect x="6.4" y="9.2" width="11.4" height="4" rx="2" transform="rotate(45 12 12)"/></g></svg>`;

function spawnIcon(type, s = 20) {
  if (type === 'coins') return ICONS.coin(s);
  if (type === 'crate') return crateIcon('daily', s);
  if (type === 'rare') return crateIcon('egg', s);
  return ICONS.bone(s);
}

function crateIcon(kind, s = 22) {
  if (kind === 'golden') return `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><rect x="2.5" y="7" width="19" height="13" rx="2.6" fill="#ffb454" stroke="#3a2b12" stroke-width="1.6"/><path d="M2.5 11.4h19" stroke="#3a2b12" stroke-width="1.4"/><rect x="10.3" y="9.6" width="3.4" height="4.8" rx="1.1" fill="#f2e9d7" stroke="#3a2b12" stroke-width="1.2"/></svg>`;
  if (kind === 'egg') return `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 2.8c3.6 0 6.5 4.6 6.5 9.3 0 4.4-2.9 7.4-6.5 7.4s-6.5-3-6.5-7.4c0-4.7 2.9-9.3 6.5-9.3z" fill="#e8f7d0" stroke="#2a3313" stroke-width="1.6"/><path d="M8.5 10.5l2 1.8 1.8-2 2 2.1 1.7-1.6" fill="none" stroke="#93b45e" stroke-width="1.3" stroke-linecap="round"/></svg>`;
  return `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2.6" fill="#a9825a" stroke="#2e2113" stroke-width="1.6"/><rect x="3" y="9.6" width="18" height="3.2" fill="#8a6845" stroke="#2e2113" stroke-width="1.1"/><circle cx="12" cy="16.4" r="1.8" fill="#f2e9d7" stroke="#2e2113" stroke-width="1.1"/></svg>`;
}
function consumableIcon(type, s = 20) { return type === 'freeze' ? ICONS.freeze(s) : ICONS.boltIco(s); }

/* ================= splash montage ================= */

function randomOutfit() {
  const eq = { B: 'B0-1', SK: 'SK0-1' };
  for (const slot of BH_SLOTS) {
    if (slot.code === 'B' || slot.code === 'SK') continue;
    if (Math.random() < 0.55) {
      const pool = BH_ITEMS.filter(i => i.slot === slot.code);
      eq[slot.code] = pool[(Math.random() * pool.length) | 0].id;
    }
  }
  return eq;
}

async function showSplash(userEq) {
  const forced = location.search.includes('splash=1');
  if (navigator.webdriver && !forced) return;
  if (reducedMotion && !forced) return;
  if (sessionStorage.getItem('bhg-splash') && !forced) return;
  try { sessionStorage.setItem('bhg-splash', '1'); } catch { /* private mode */ }
  const el = document.createElement('div');
  el.id = 'splash';
  document.body.appendChild(el);
  let done = false;
  const finish = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => el.remove(), 380); };
  el.addEventListener('click', finish);
  const beat = ms => new Promise(r => setTimeout(r, ms));
  for (const word of ['EAT.', 'LOG.', 'EVOLVE.']) {
    if (done) return;
    el.innerHTML = `<div class="splash-inner"><div class="splash-stage">${avatarLayersHtml(randomOutfit())}</div><div class="splash-word">${word}</div></div>`;
    await beat(430);
  }
  if (done) return;
  el.innerHTML = `<div class="splash-inner"><div class="splash-stage">${avatarLayersHtml(userEq || { B: 'B0-1', SK: 'SK0-1' })}</div><div class="splash-title">BONEHEADZ<br>GYM</div><div class="splash-sub">Feed the bones</div></div>`;
  await beat(forced ? 2600 : 950);
  finish();
}

/* ================= boot ================= */

async function boot() {
  if (S.demo) { useDbName('tally-demo'); document.body.insertAdjacentHTML('beforeend', '<div class="demo-badge">DEMO</div>'); }
  S.settings = await kvGet('settings');
  if (S.demo && !S.settings) { await seedDemo(); S.settings = await kvGet('settings'); }
  S.userFoods = await db.all('foods');

  if ('serviceWorker' in navigator && !S.demo && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      // resumed PWAs never re-navigate, so check for updates whenever we come back
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; } // first-ever install
      if (performance.now() < 20000 && !sheetStack.length) location.reload();
      else toast('Update ready: close and reopen to apply', 3600);
    });
  }
  requestPersistence();
  S.sounds = (await kvGet('sounds', true)) !== false;
  equipped().then(eq => showSplash(eq)).catch(() => {});

  if (!S.settings) { renderOnboarding(); return; }

  const init = await initGameIfNeeded(S.settings.targets);
  if (init && init.xp > 0) setTimeout(() => toast(`Progress imported: Level ${init.level.level} · ${init.xp.toLocaleString()} XP`, 3200), 700);
  const kit = await initLootIfNeeded();
  if (kit) setTimeout(() => toast('Welcome kit: 2 crates + a Streak Freeze are waiting on your Bonehead', 3600), init && init.xp > 0 ? 4200 : 900);
  const frozen = await checkStreakFreeze();
  if (frozen) setTimeout(() => toast(`Streak Freeze used: yesterday is covered, your ${frozen.saved + 1}-day streak lives`, 3800), 1600);
  const closed = await awardDayCloseIfDue(S.settings.targets);
  if (closed) setTimeout(() => toast('Yesterday closed on budget: Golden Crate earned', 3400), 2400);
  await ingestHkFromUrl();
  backupNudge();

  window.addEventListener('hashchange', route);
  bindTabs();
  route();
}

async function backupNudge() {
  try {
    const log = await db.all('log');
    if (log.length < 20) return;
    const last = await kvGet('lastExportAt', 0);
    const nudged = await kvGet('lastNudgeAt', 0);
    const twoWeeks = 14 * 86400e3;
    if (Date.now() - last > twoWeeks && Date.now() - nudged > 7 * 86400e3) {
      await kvSet('lastNudgeAt', Date.now());
      setTimeout(() => toast('Tip: back up your log (Settings, Export)', 3400), 4000);
    }
  } catch { /* non-critical */ }
}

function bindTabs() {
  $$('#tabbar .tab').forEach(b => b.addEventListener('click', () => { location.hash = '#/' + b.dataset.tab; }));
  $('#fab').addEventListener('click', () => {
    if (currentTab() !== 'today') location.hash = '#/today';
    const now = new Date();
    openAdd(mealForHour(now.getHours() + now.getMinutes() / 60));
  });
}

function currentTab() {
  const m = location.hash.match(/^#\/(\w+)/);
  return m ? m[1] : 'today';
}

function route() {
  closeAllSheets();
  const tab = currentTab();
  $$('#tabbar .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const el = $('#screen');
  if (tab === 'trends') renderTrends(el);
  else if (tab === 'foods') renderFoods(el);
  else if (tab === 'settings') renderSettings(el);
  else renderToday(el);
  el.scrollTop = 0;
  maybeCelebrate();
}

function refresh() { route(); }

/* ================= shared ui ================= */

let toastTimer = 0;
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

const sheetStack = [];
function openSheet(html, { cls = '', onClose = null } = {}) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet ${cls}" role="dialog"><div class="sheet-grab"></div>${html}</div>`;
  $('#sheets').appendChild(wrap);
  const rec = { wrap, onClose };
  sheetStack.push(rec);
  history.pushState({ sheet: sheetStack.length }, '');
  $('.sheet-backdrop', wrap).addEventListener('click', () => history.back());
  $$('.sheet-close', wrap).forEach(b => b.addEventListener('click', () => history.back()));
  return wrap;
}
function closeTopSheet() {
  const rec = sheetStack.pop();
  if (!rec) return;
  try { rec.onClose?.(); } catch { /* noop */ }
  rec.wrap.remove();
}
function closeAllSheets() {
  while (sheetStack.length) closeTopSheet();
}
window.addEventListener('popstate', () => { if (sheetStack.length) closeTopSheet(); });

function audioTick() {
  try {
    const ctx = audioTick.ctx || (audioTick.ctx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 1150; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.07);
  } catch { /* no audio */ }
}

/* ================= data helpers ================= */

function allSearchableFoods() {
  return [...S.userFoods, ...GENERIC_FOODS];
}

function findFood(id) {
  return S.userFoods.find(f => f.id === id) || GENERIC_FOODS.find(f => f.id === id) || null;
}

async function persistFoodUse(food) {
  if (food.source === 'generic') return; // generics ship with the app
  food.useCount = (food.useCount || 0) + 1;
  food.lastUsedAt = Date.now();
  await db.put('foods', food);
  const i = S.userFoods.findIndex(f => f.id === food.id);
  if (i >= 0) S.userFoods[i] = food; else S.userFoods.push(food);
}

async function entriesFor(date) {
  const rows = await db.byIndex('log', 'date', date);
  return rows.sort((a, b) => a.ts - b.ts);
}

async function recentFoods(limit = 8) {
  const rows = await db.all('log');
  rows.sort((a, b) => b.ts - a.ts);
  const seen = new Set(); const out = [];
  for (const r of rows) {
    const key = r.foodId || r.name;
    if (seen.has(key)) continue;
    seen.add(key);
    const food = r.foodId ? findFood(r.foodId) : null;
    out.push({ entry: r, food });
    if (out.length >= limit) break;
  }
  return out;
}

function defaultSel(food) {
  if (food.lastPortion) return { ...food.lastPortion };
  return { mode: 'serving', idx: 0, qty: 1 };
}

function foodSubtitle(food) {
  const bits = [];
  if (food.brand) bits.push(food.brand);
  const s = food.servings && food.servings[0];
  if (s) bits.push(s.label);
  return bits.join(' · ');
}

function foodDefaultKcal(food) {
  const n = nutrientsFor(food, { mode: 'serving', idx: 0, qty: 1 });
  return n ? Math.round(n.kcal) : null;
}

/* ================= today ================= */

async function renderToday(el) {
  const t = S.settings.targets;
  const entries = await entriesFor(S.date);
  const yEntries = await entriesFor(addDays(S.date, -1));
  const allLog = await db.all('log');
  const streak = streakFrom([...new Set(allLog.map(e => e.date))], dateKey());
  const xp = await totalXp();
  const lvl = levelFor(xp);
  const hk = await db.get('health', S.date);
  const eq = await equipped();
  const coinBal = await coins();
  const crates = await unopenedCrates();
  const allXp = await db.all('xp');
  const dateXp = allXp.filter(r => r.date === S.date);
  const huntEnabled = !!(await kvGet('hunt-enabled'));
  const quests = dailyQuests(S.date, { hkConnected: !!S.settings.hkConnected, huntEnabled });
  const qctx = {
    date: S.date, entries, xpRows: dateXp, health: hk, targets: S.settings.targets,
    priorFoodIds: new Set(allLog.filter(e => e.date < S.date && e.foodId).map(e => e.foodId)),
    weighedToday: !!(await db.get('weights', S.date)),
  };
  const weekly = weeklyState(allXp, S.date);
  const tot = dayTotals(entries);
  const remaining = Math.round(t.kcal - tot.kcal);
  const pct = Math.min(1, tot.kcal / t.kcal);
  const over = tot.kcal > t.kcal;
  const isToday = S.date === dateKey();
  const [y, m, d] = S.date.split('-').map(Number);
  const dObj = new Date(y, m - 1, d);
  const title = isToday ? 'Today' : dObj.toLocaleDateString(undefined, { weekday: 'long' });
  const sub = dObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: y === new Date().getFullYear() ? undefined : 'numeric' });

  const C = 2 * Math.PI * 66;
  const prev = S.ui;
  const protHit = t.p && tot.p >= t.p;

  el.innerHTML = `
  <div class="day-head">
    <button class="icon-btn" id="prevDay" aria-label="Previous day"><svg viewBox="0 0 24 24"><path d="M14.5 5l-7 7 7 7"/></svg></button>
    <div class="day-title">
      <h1>${title}</h1><div class="sub">${sub}</div>
      <input type="date" id="datePick" value="${S.date}" aria-label="Pick date">
    </div>
    <button class="icon-btn" id="nextDay" aria-label="Next day"><svg viewBox="0 0 24 24"><path d="M9.5 5l7 7-7 7"/></svg></button>
  </div>

  <div class="chip-row">
    <button class="streak-chip ${streak >= 3 ? 'hot' : ''}" id="streakChip"><span class="flame">${ICONS.flame(15)}</span> <b>${streak}</b> day${streak === 1 ? '' : 's'}</button>
    <button class="level-chip" id="lvlChip">
      <span class="lvl-n">Lv ${lvl.level}</span> ${esc(lvl.name)}
      <span class="xp-mini"><i style="width:${lvl.pct}%"></i></span>
    </button>
  </div>

  <div class="card bh-card">
    <button class="bh-stage ${S.justLogged ? 'bounce' : ''}" id="bhStage" aria-label="Your Bonehead">
      ${avatarLayersHtml(eq)}
    </button>
    <div class="bh-side">
      <div class="bh-topline">
        <button class="bh-coin" id="coinBtn">${ICONS.coin(14)} <b>${coinBal.toLocaleString()}</b></button>
        ${crates.length ? `<button class="bh-crates" id="cratesBtn">${crateIcon(crates[0].crate, 14)} ${crates.length} to open</button>` : ''}
        <button class="bh-hunt" id="huntBtn">${ICONS.radar(13)} Hunt</button>
      </div>
      <div class="bh-bubble">${esc(speechLine({ entries, tot, targets: t, crates, streak, isToday }))}</div>
    </div>
  </div>

  <div class="card ring-card">
    <div class="ring-wrap">
      <svg viewBox="0 0 158 158">
        <circle class="ring-track" cx="79" cy="79" r="66" fill="none" stroke-width="13"/>
        <circle class="ring-fill ${over ? 'over' : ''}" id="ringFill" cx="79" cy="79" r="66" fill="none" stroke-width="13" stroke-linecap="round"
          stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - prev.ringPct)}"/>
      </svg>
      <div class="ring-center">
        <div class="big" id="ringBig">${Math.abs(prev.remainShown ?? remaining).toLocaleString()}</div>
        <div class="lbl">${over ? 'kcal over' : 'kcal left'}</div>
      </div>
    </div>
    <div class="ring-side">
      <div class="kv"><span>Eaten</span><b>${Math.round(tot.kcal).toLocaleString()}</b></div>
      <div class="kv"><span>Target</span><b>${t.kcal.toLocaleString()}</b></div>
      <div class="divider" style="margin:2px 0"></div>
      ${macroRow('Protein', tot.p, t.p, 'protein', prev.macroPcts[0], protHit)}
      ${macroRow('Carbs', tot.c, t.c, 'carbs', prev.macroPcts[1], false)}
      ${macroRow('Fat', tot.f, t.f, 'fat', prev.macroPcts[2], false)}
    </div>
  </div>

  ${isToday ? `
  <div class="card q-card">
    <div class="card-title">TODAY'S QUESTS <button class="link" id="qProg">Progress</button></div>
    <div class="q-list">
      ${quests.map(q => {
        const st = questState(q, qctx, dateXp);
        const pct = Math.min(100, Math.round((st.cur / st.target) * 100));
        return `<div class="q-row">
          <div class="q-main">
            <div class="q-name">${esc(q.name)} <span class="q-coins">+${q.coins}${ICONS.coin(11)}</span></div>
            <div class="q-bar"><i style="width:${pct}%"></i></div>
          </div>
          ${st.claimed ? '<span class="q-done">✓</span>'
            : st.done ? `<button class="q-claim" data-claim="${q.id}">Claim</button>`
            : `<span class="q-frac">${st.target > 9 ? Math.round((st.cur / st.target) * 100) + '%' : st.cur + '/' + st.target}</span>`}
        </div>`;
      }).join('')}
      <div class="q-row weekly">
        <div class="q-main">
          <div class="q-name">Weekly: ${esc(WEEKLY.name)} <span class="q-coins">${crateIcon('golden', 13)}</span></div>
          <div class="q-bar gold"><i style="width:${Math.min(100, (weekly.cur / weekly.target) * 100)}%"></i></div>
        </div>
        ${weekly.claimed ? '<span class="q-done">✓</span>'
          : weekly.done ? '<button class="q-claim" id="claimWeekly">Claim</button>'
          : `<span class="q-frac">${weekly.cur}/${weekly.target}</span>`}
      </div>
    </div>
  </div>` : ''}

  ${healthCardHtml(hk, isToday)}

  ${MEALS.map((name, i) => mealBlock(name, i, entries.filter(e => e.meal === i), yEntries.filter(e => e.meal === i))).join('')}

  ${tot.kcal > 0 ? `<div class="micro-line">Fiber ${fmtG(tot.fiber)} g · Sugar ${fmtG(tot.sugar)} g · Sodium ${Math.round(tot.sodium).toLocaleString()} mg</div>` : ''}
  `;

  // animate ring, macro bars, and the remaining number from their previous states
  const macroPcts = [
    Math.min(100, t.p ? (tot.p / t.p) * 100 : 0),
    Math.min(100, t.c ? (tot.c / t.c) * 100 : 0),
    Math.min(100, t.f ? (tot.f / t.f) * 100 : 0),
  ];
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const ring = $('#ringFill', el);
    if (ring) ring.style.strokeDashoffset = String(C * (1 - pct));
    $$('.ring-side .bar i', el).forEach((bar, i) => { bar.style.width = macroPcts[i] + '%'; });
  }));
  tweenNumber($('#ringBig', el), prev.remainShown ?? remaining, Math.abs(remaining), 650, v => Math.round(Math.abs(v)).toLocaleString());
  S.ui = { ringPct: pct, remainShown: Math.abs(remaining), macroPcts };

  $('#prevDay').addEventListener('click', () => { S.date = addDays(S.date, -1); refresh(); });
  $('#nextDay').addEventListener('click', () => { S.date = addDays(S.date, 1); refresh(); });
  $('#datePick').addEventListener('change', e => { if (e.target.value) { S.date = e.target.value; refresh(); } });
  $('#lvlChip').addEventListener('click', () => openCharacter('progress'));
  $('#streakChip').addEventListener('click', () => openCharacter('progress'));
  $('#bhStage').addEventListener('click', () => openCharacter('wardrobe'));
  $('#qProg')?.addEventListener('click', () => openCharacter('progress'));
  $('#coinBtn')?.addEventListener('click', () => openCharacter('crates'));
  $('#cratesBtn')?.addEventListener('click', () => openCharacter('crates'));
  $('#huntBtn')?.addEventListener('click', openHunt);
  $('#hkSync', el)?.addEventListener('click', syncFromClipboard);
  S.justLogged = false;
  $$('[data-claim]').forEach(b => b.addEventListener('click', async ev => {
    const q = quests.find(x => x.id === b.dataset.claim);
    if (!q) return;
    const res = await claimQuest(S.date, q);
    if (!res) return;
    confettiBurst(ev.clientX || innerWidth / 2, ev.clientY || 240, 14);
    popSound(S.sounds);
    const dateXp2 = (await db.all('xp')).filter(r => r.date === S.date);
    const bonus = await claimAllBonusIfDue(S.date, quests, dateXp2);
    toast(bonus ? `Quest done · +${res.xp + bonus.xp} XP · +${res.coins} coins · Daily Crate earned!`
      : `Quest done · +${res.xp} XP · +${res.coins} coins`, 2800);
    refresh();
  }));
  $('#claimWeekly')?.addEventListener('click', async ev => {
    const res = await claimWeekly(weekly.weekKey);
    if (!res) return;
    confettiBurst(ev.clientX || innerWidth / 2, ev.clientY || 240, 22);
    levelSound(S.sounds);
    toast(`Weekly complete · +${res.xp} XP · +${res.coins} coins · Golden Crate earned!`, 3200);
    refresh();
  });
  $$('[data-addmeal]').forEach(b => b.addEventListener('click', () => openAdd(Number(b.dataset.addmeal))));
  $$('[data-entry]').forEach(b => b.addEventListener('click', () => openEntryEdit(b.dataset.entry)));
  $$('[data-copymeal]').forEach(b => b.addEventListener('click', async ev => {
    const meal = Number(b.dataset.copymeal);
    const src = yEntries.filter(e => e.meal === meal);
    let gained = 0, last = null;
    for (const e of src) {
      const copy = { ...e, id: newId(), date: S.date, ts: Date.now() };
      await db.put('log', copy);
      last = await onFoodLogged(copy, { targets: S.settings.targets, entriesForDate: await entriesFor(S.date) });
      gained += last.xp;
    }
    confettiBurst(ev.clientX || innerWidth / 2, ev.clientY || 300, 14);
    popSound(S.sounds);
    toast(`Copied ${src.length} item${src.length === 1 ? '' : 's'} from yesterday${gained ? ` · +${gained} XP` : ''}`);
    if (last) queueCelebration(last);
    refresh();
  }));
}

function macroRow(label, val, target, cls, prevPct = 0, glow = false) {
  return `<div class="macro">
    <div class="row"><span>${label}${glow ? ' <span class="hit-dot">✓</span>' : ''}</span><span class="val">${fmtG(val)} / ${target} g</span></div>
    <div class="bar ${cls} ${glow ? 'glow' : ''}"><i style="width:${prevPct}%"></i></div>
  </div>`;
}

function speechLine({ entries, tot, targets, crates, streak, isToday }) {
  const pick = arr => arr[(new Date().getDate() + arr.length) % arr.length];
  if (crates.length) return pick(['Crack that crate open already!', 'Loot is burning a hole in my ribs.', 'Crates do not open themselves, chief.']);
  if (!isToday) return 'Time traveling, are we? Tap me to change my fit.';
  if (!entries.length) return pick(['Feed me a log, chief.', 'Bones do not fuel themselves.', 'Scan something tasty. I dare you.']);
  if (targets && targets.p && tot.p >= targets.p) return pick(['Protein secured. Bones swole.', 'Full protein. Maximum calcium energy.']);
  if (targets && tot.kcal > targets.kcal) return pick(['Big day. We log it all anyway.', 'Honest logs make strong bones.']);
  if (targets && targets.kcal - tot.kcal <= 350 && targets.kcal - tot.kcal > 0) return pick(['Right in the zone. Finish strong.', 'Stick the landing tonight.']);
  if (streak >= 3) return `Day ${streak}. Keep the flame alive.`;
  return pick(['Solid pace today.', 'What is next on the menu?', 'More protein never hurt a skeleton.']);
}

function avatarLayersHtml(eq) {
  const slots = [...BH_SLOTS].sort((a, b) => a.z - b.z);
  const layers = slots.map(s => {
    const itemId = eq[s.code];
    if (!itemId || !BH_BY_ID[itemId]) return '';
    return `<img src="${bhAsset(BH_BY_ID[itemId])}" alt="" loading="lazy" decoding="async">`;
  }).join('');
  return `<div class="bh-anim">${layers}</div>`;
}

function healthCardHtml(hk, isToday) {
  if (!hk && !(S.settings.hkConnected && isToday)) return '';
  const steps = hk?.steps;
  const active = hk?.activeKcal;
  const goal = 10000;
  const stepPct = steps ? Math.min(100, (steps / goal) * 100) : 0;
  return `<div class="card">
    <div class="card-title">ACTIVITY · APPLE HEALTH ${isToday ? '<button class="link" id="hkSync">Sync</button>' : ''}</div>
    ${hk ? `
      <div class="hk-rows">
        <div class="hk-row"><span class="hk-ico">${ICONS.sneaker(21)}</span>
          <div style="flex:1">
            <div class="row" style="display:flex;justify-content:space-between;font-size:13px;font-weight:600"><span>${steps != null ? steps.toLocaleString() : '·'} steps</span><span style="color:var(--text-3)">${steps >= goal ? 'goal hit!' : 'of ' + goal.toLocaleString()}</span></div>
            <div class="bar steps" style="margin-top:5px"><i style="width:${stepPct}%"></i></div>
          </div>
        </div>
        ${active != null ? `<div class="hk-row"><span class="hk-ico">${ICONS.boltIco(19)}</span><div style="font-size:13.5px;font-weight:600">${active.toLocaleString()} kcal active burn <span style="color:var(--text-3);font-weight:500">· shown for context, your target already covers activity</span></div></div>` : ''}
      </div>` :
      '<p class="note">No sync yet today. Run your "Sync Tally" shortcut, then tap Sync.</p>'}
  </div>`;
}

function mealBlock(name, i, entries, yEntries) {
  const kcal = Math.round(dayTotals(entries).kcal);
  return `<section class="meal">
    <div class="meal-head">
      <h2>${name}</h2>
      ${kcal ? `<span class="kcal">${kcal.toLocaleString()} kcal</span>` : '<span class="kcal"></span>'}
      <button class="meal-add" data-addmeal="${i}" aria-label="Add to ${name}"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
    </div>
    ${entries.map(e => `
      <button class="entry" data-entry="${e.id}">
        <div class="n"><div class="name">${esc(e.name)}</div><div class="sub">${esc(e.portionLabel || '')}</div></div>
        <span class="kc">${Math.round(e.kcal)}</span>
      </button>`).join('')}
    ${!entries.length && yEntries.length ? `<button class="chip-btn" data-copymeal="${i}">↺ Copy yesterday's ${name} (${Math.round(dayTotals(yEntries).kcal)} kcal)</button>` : ''}
  </section>`;
}

/* ================= add flow ================= */

function openAdd(meal = 0) {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Add food</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <div class="chips" id="mealChips" style="margin-bottom:12px">
        ${MEALS.map((m, i) => `<button class="chip ${i === meal ? 'on' : ''}" data-meal="${i}">${m}</button>`).join('')}
      </div>
      <div class="action-tiles">
        <button class="action-tile" id="actScan">${ICONS.barcode}Scan barcode</button>
        <button class="action-tile" id="actLabel">${ICONS.label}Scan label</button>
        <button class="action-tile" id="actQuick">${ICONS.bolt}Quick add</button>
      </div>
      <div class="search-wrap">${ICONS.search}<input id="q" class="input" type="search" placeholder="Search foods" autocomplete="off" enterkeyhint="search"></div>
      <div id="results"></div>
    </div>`, { cls: 'full' });

  let curMeal = meal;
  $$('#mealChips .chip', wrap).forEach(c => c.addEventListener('click', () => {
    curMeal = Number(c.dataset.meal);
    $$('#mealChips .chip', wrap).forEach(x => x.classList.toggle('on', x === c));
  }));
  $('#actScan', wrap).addEventListener('click', () => openScanner(() => curMeal));
  $('#actLabel', wrap).addEventListener('click', () => openLabelFlow(() => curMeal));
  $('#actQuick', wrap).addEventListener('click', () => openQuickAdd(() => curMeal));

  const results = $('#results', wrap);
  const input = $('#q', wrap);

  async function showDefault() {
    const recents = await recentFoods(8);
    const favs = allSearchableFoods().filter(f => f.favorite).slice(0, 6);
    let html = '';
    if (recents.length) {
      html += '<div class="sect-h">Recent</div>' + recents.map(r => {
        if (r.food) return foodRowHtml(r.food);
        return `<button class="food-row" data-relog="${r.entry.id}">
          <div class="n"><div class="name">${esc(r.entry.name)}</div><div class="sub">${esc(r.entry.portionLabel || 'quick add')}</div></div>
          <span class="kc">${Math.round(r.entry.kcal)}<small>kcal</small></span></button>`;
      }).join('');
    }
    if (favs.length) html += '<div class="sect-h">Favorites</div>' + favs.map(foodRowHtml).join('');
    if (!html) html = `<p class="note" style="text-align:center;padding:26px 20px">Search ${GENERIC_FOODS.length}+ built-in foods, or scan a barcode to add packaged food in seconds.</p>`;
    results.innerHTML = html;
    bindRows();
  }

  function bindRows() {
    $$('[data-food]', results).forEach(b => b.addEventListener('click', () => {
      const f = findFood(b.dataset.food) || onlineById(b.dataset.food);
      if (f) openPortion(f, { meal: curMeal });
    }));
    $$('[data-relog]', results).forEach(b => b.addEventListener('click', async (ev) => {
      const rows = await db.all('log');
      const src = rows.find(r => r.id === b.dataset.relog);
      if (!src) return;
      const copy = { ...src, id: newId(), date: S.date, meal: curMeal, ts: Date.now() };
      await db.put('log', copy);
      const game = await onFoodLogged(copy, { targets: S.settings.targets, entriesForDate: await entriesFor(S.date) });
      confettiBurst(ev.clientX || innerWidth / 2, ev.clientY || 300, 12);
      popSound(S.sounds);
      toast(`Added ${src.name}${game.xp ? ` · +${game.xp} XP` : ''}`);
      S.justLogged = true;
      queueCelebration(game);
      history.back();
      setTimeout(refresh, 60);
    }));
    $$('[data-online]', results).forEach(b => b.addEventListener('click', () => runOnlineSearch(input.value.trim())));
  }

  function onlineById(id) {
    for (const list of S.onlineCache.values()) {
      const f = list.find(x => x.id === id);
      if (f) return f;
    }
    return null;
  }

  async function runOnlineSearch(q) {
    if (!q) return;
    const holder = $('#onlineSect', results);
    if (holder) holder.innerHTML = '<div class="sect-h">Online results <span class="spin"></span></div>';
    try {
      let foods = S.onlineCache.get(q.toLowerCase());
      if (!foods) {
        foods = await searchFdc(q, S.settings.fdcKey || 'DEMO_KEY');
        S.onlineCache.set(q.toLowerCase(), foods);
      }
      if (input.value.trim() !== q) return;
      const sect = $('#onlineSect', results);
      if (!sect) return;
      sect.innerHTML = '<div class="sect-h">Online results</div>' +
        (foods.length ? foods.map(foodRowHtml).join('') : '<p class="note" style="padding:8px 2px">Nothing found online. Try the barcode or label scanner.</p>');
      bindRows();
    } catch (e) {
      const sect = $('#onlineSect', results);
      if (sect) sect.innerHTML = `<p class="note" style="padding:8px 2px">${e.message === 'rate_limit'
        ? 'Online search limit reached for now. Add a free USDA key in Settings for 1,000 searches/hour.'
        : 'Online search unavailable right now.'}</p>`;
    }
  }

  let debounce = 0;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (!q) { showDefault(); return; }
    debounce = setTimeout(() => {
      const local = searchFoods(allSearchableFoods(), q, 25);
      results.innerHTML =
        (local.length ? local.map(foodRowHtml).join('') : '<p class="note" style="padding:14px 2px 6px;text-align:center">Nothing local matches.</p>') +
        `<div id="onlineSect">${q.length >= 3 ? `<button class="food-row" data-online><div class="n"><div class="name" style="color:var(--accent)">Search online for "${esc(q)}"</div><div class="sub">USDA branded + generic database</div></div></button>` : ''}</div>`;
      bindRows();
    }, 120);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runOnlineSearch(input.value.trim()); } });

  showDefault();
}

function foodRowHtml(f) {
  const kcal = foodDefaultKcal(f);
  return `<button class="food-row" data-food="${esc(f.id)}">
    <div class="n"><div class="name">${esc(f.name)}</div><div class="sub">${esc(foodSubtitle(f))}</div></div>
    <span class="kc">${kcal != null ? kcal : '·'}<small>kcal</small></span>
  </button>`;
}

/* ================= portion sheet ================= */

function openPortion(food, { meal = 0, entry = null, via = null } = {}) {
  const sel = entry ? (entry.sel ? { ...entry.sel } : { mode: 'serving', idx: 0, qty: entry.qty || 1 }) : defaultSel(food);
  if (sel.mode === 'serving' && (!food.servings || !food.servings[sel.idx])) { sel.idx = 0; }
  let curMeal = entry ? entry.meal : meal;
  const editing = !!entry;
  const srcLabel = { generic: 'Built-in', off: 'Open Food Facts', fdc: 'USDA', custom: 'My food' }[food.source] || '';

  const wrap = openSheet(`
    <div class="sheet-head">
      <div style="min-width:0">
        <h2 style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(food.name)}</h2>
        <div class="note" style="margin-top:2px">${esc(food.brand || '')}${food.brand ? ' · ' : ''}<span class="src-badge">${srcLabel}</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        <button id="favBtn" aria-label="Favorite">${ICONS.star(!!food.favorite)}</button>
        <button class="sheet-close">Cancel</button>
      </div>
    </div>
    <div class="sheet-body">
      <div class="preview">
        <div class="kcal"><span id="pvKcal">0</span><small>kcal</small></div>
        <div class="pcf">
          <span><i class="dot p"></i><span id="pvP">0</span>P</span>
          <span><i class="dot c"></i><span id="pvC">0</span>C</span>
          <span><i class="dot f"></i><span id="pvF">0</span>F</span>
        </div>
      </div>
      <div class="chips scroll" id="servChips">
        ${(food.servings || []).map((s, i) => `<button class="chip" data-serv="${i}">${esc(s.label)}</button>`).join('')}
        ${food.per100 ? '<button class="chip" data-grams>grams</button>' : ''}
      </div>
      <div style="height:12px"></div>
      <div id="qtyArea"></div>
      <div style="height:14px"></div>
      <div class="chips" id="pMealChips">
        ${MEALS.map((m, i) => `<button class="chip ${i === curMeal ? 'on' : ''}" data-meal="${i}">${m}</button>`).join('')}
      </div>
      <div style="height:16px"></div>
      <button class="btn" id="addBtn">${editing ? 'Save changes' : 'Add'}</button>
      ${editing ? '<div style="height:8px"></div><button class="btn danger" id="delBtn">Delete entry</button>' : ''}
      ${food.source === 'custom' ? '<div style="height:8px"></div><button class="btn ghost" id="editFoodBtn">Edit food details</button>' : ''}
    </div>`);

  const qtyArea = $('#qtyArea', wrap);

  function renderQty() {
    if (sel.mode === 'grams') {
      qtyArea.innerHTML = `
        <div class="stepper">
          <button data-d="-10">-</button>
          <input id="gramsIn" type="text" inputmode="decimal" value="${fmtQty(sel.grams)}" aria-label="grams">
          <button data-d="10">+</button>
        </div>
        <div class="note" style="text-align:center;margin-top:8px">grams</div>`;
      $('#gramsIn', wrap).addEventListener('input', e => { sel.grams = num(e.target.value) || 0; preview(); });
      $$('.stepper button', qtyArea).forEach(b => b.addEventListener('click', () => {
        sel.grams = Math.max(1, (sel.grams || 0) + Number(b.dataset.d));
        $('#gramsIn', wrap).value = fmtQty(sel.grams);
        preview();
      }));
    } else {
      qtyArea.innerHTML = `
        <div class="stepper">
          <button data-d="-0.25">-</button>
          <div class="val" id="qtyVal">${fmtQty(sel.qty)}</div>
          <button data-d="0.25">+</button>
        </div>
        <div class="note" style="text-align:center;margin-top:8px">servings</div>`;
      $$('.stepper button', qtyArea).forEach(b => b.addEventListener('click', () => {
        sel.qty = Math.max(0.25, Math.round(((sel.qty || 1) + Number(b.dataset.d)) * 100) / 100);
        $('#qtyVal', wrap).textContent = fmtQty(sel.qty);
        preview();
      }));
    }
    markChips();
  }

  function markChips() {
    $$('#servChips .chip', wrap).forEach(c => {
      const on = c.hasAttribute('data-grams') ? sel.mode === 'grams' : (sel.mode === 'serving' && Number(c.dataset.serv) === sel.idx);
      c.classList.toggle('on', on);
    });
  }

  function preview() {
    const n = nutrientsFor(food, sel) || { kcal: 0, p: 0, c: 0, f: 0 };
    $('#pvKcal', wrap).textContent = Math.round(n.kcal).toLocaleString();
    $('#pvP', wrap).textContent = fmtG(n.p) + 'g ';
    $('#pvC', wrap).textContent = fmtG(n.c) + 'g ';
    $('#pvF', wrap).textContent = fmtG(n.f) + 'g ';
  }

  $$('#servChips .chip', wrap).forEach(c => c.addEventListener('click', () => {
    if (c.hasAttribute('data-grams')) {
      const cur = nutrientsFor(food, sel);
      sel.mode = 'grams';
      sel.grams = sel.grams || (cur && food.per100 ? Math.round((cur.kcal / food.per100.kcal) * 100) : 100);
    } else {
      sel.mode = 'serving'; sel.idx = Number(c.dataset.serv); sel.qty = sel.qty && sel.mode === 'serving' ? sel.qty : 1;
    }
    renderQty(); preview();
  }));

  $$('#pMealChips .chip', wrap).forEach(c => c.addEventListener('click', () => {
    curMeal = Number(c.dataset.meal);
    $$('#pMealChips .chip', wrap).forEach(x => x.classList.toggle('on', x === c));
  }));

  $('#favBtn', wrap).addEventListener('click', async () => {
    food.favorite = !food.favorite;
    $('#favBtn', wrap).innerHTML = ICONS.star(!!food.favorite);
    if (food.source !== 'generic') await db.put('foods', food);
    else await kvSet('fav-' + food.id, food.favorite); // generic favs live in kv
  });

  $('#addBtn', wrap).addEventListener('click', async (ev) => {
    const btn = ev.currentTarget; // capture now: currentTarget is nulled after awaits
    const n = nutrientsFor(food, sel);
    if (!n || !isFinite(n.kcal)) { toast('Pick a portion first'); return; }
    const e = {
      id: editing ? entry.id : newId(),
      date: editing ? entry.date : S.date,
      meal: curMeal,
      ts: editing ? entry.ts : Date.now(),
      foodId: food.id,
      name: food.name, brand: food.brand || null,
      portionLabel: portionLabel(food, sel),
      sel: { ...sel },
      kcal: n.kcal, p: n.p || 0, c: n.c || 0, f: n.f || 0,
      fiber: n.fiber || 0, sugar: n.sugar || 0, sodium: n.sodium || 0,
    };
    await db.put('log', e);
    food.lastPortion = { ...sel };
    await persistFoodUse(food);
    const game = await onFoodLogged(e, { via, targets: S.settings.targets, entriesForDate: await entriesFor(e.date) });
    if (!editing && btn && btn.isConnected) {
      const r = btn.getBoundingClientRect();
      confettiBurst(r.left + r.width / 2, r.top, 18);
      popSound(S.sounds);
    }
    toast(editing ? 'Saved' : `Added · ${Math.round(n.kcal)} kcal${game.xp ? ` · +${game.xp} XP${game.boosted ? ' ⚡️x2' : ''}` : ''}`);
    S.justLogged = !editing;
    queueCelebration(game);
    closeAllSheetsViaHistory();
    setTimeout(refresh, 80);
  });

  if (editing) $('#delBtn', wrap).addEventListener('click', async () => {
    await db.del('log', entry.id);
    toast('Deleted');
    closeAllSheetsViaHistory();
    setTimeout(refresh, 80);
  });
  if (food.source === 'custom') $('#editFoodBtn', wrap)?.addEventListener('click', () => openFoodForm({ existing: food, meal: curMeal }));

  // restore generic favorite state async
  if (food.source === 'generic') kvGet('fav-' + food.id).then(v => { if (v != null) { food.favorite = v; $('#favBtn', wrap).innerHTML = ICONS.star(!!v); } });

  renderQty();
  preview();
}

function closeAllSheetsViaHistory() {
  const n = sheetStack.length;
  if (n > 0) history.go(-n);
}

async function openEntryEdit(entryId) {
  const rows = await db.byIndex('log', 'date', S.date);
  const entry = rows.find(r => r.id === entryId);
  if (!entry) return;
  const food = entry.foodId ? findFood(entry.foodId) : null;
  if (food) { openPortion(food, { entry }); return; }
  // quick-add entry: numeric edit
  openQuickAdd(() => entry.meal, entry);
}

/* ================= quick add ================= */

function openQuickAdd(getMeal, entry = null) {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>${entry ? 'Edit quick add' : 'Quick add'}</h2><button class="sheet-close">Cancel</button></div>
    <div class="sheet-body">
      <div class="field"><label>Name (optional)</label><input id="qaName" placeholder="e.g. Dinner out" value="${esc(entry?.name === 'Quick add' ? '' : entry?.name || '')}"></div>
      <div class="field"><label>Calories</label><input id="qaKcal" type="text" inputmode="numeric" placeholder="0" value="${entry ? Math.round(entry.kcal) : ''}"></div>
      <div class="grid3">
        <div class="field"><label>Protein g</label><input id="qaP" type="text" inputmode="decimal" placeholder="·" value="${entry?.p ? fmtG(entry.p) : ''}"></div>
        <div class="field"><label>Carbs g</label><input id="qaC" type="text" inputmode="decimal" placeholder="·" value="${entry?.c ? fmtG(entry.c) : ''}"></div>
        <div class="field"><label>Fat g</label><input id="qaF" type="text" inputmode="decimal" placeholder="·" value="${entry?.f ? fmtG(entry.f) : ''}"></div>
      </div>
      <div style="height:8px"></div>
      <button class="btn" id="qaAdd">${entry ? 'Save' : 'Add'}</button>
      ${entry ? '<div style="height:8px"></div><button class="btn danger" id="qaDel">Delete entry</button>' : ''}
    </div>`);
  $('#qaKcal', wrap).focus();
  $('#qaAdd', wrap).addEventListener('click', async (ev) => {
    const btn = ev.currentTarget; // capture now: currentTarget is nulled after awaits
    const kcal = num($('#qaKcal', wrap).value);
    if (kcal == null) { toast('Calories required'); return; }
    const e = {
      id: entry ? entry.id : newId(),
      date: entry ? entry.date : S.date,
      meal: getMeal(),
      ts: entry ? entry.ts : Date.now(),
      foodId: null,
      name: $('#qaName', wrap).value.trim() || 'Quick add',
      portionLabel: '',
      kcal, p: num($('#qaP', wrap).value) || 0, c: num($('#qaC', wrap).value) || 0, f: num($('#qaF', wrap).value) || 0,
    };
    await db.put('log', e);
    const game = await onFoodLogged(e, { targets: S.settings.targets, entriesForDate: await entriesFor(e.date) });
    if (!entry && btn && btn.isConnected) {
      const r = btn.getBoundingClientRect();
      confettiBurst(r.left + r.width / 2, r.top, 16);
      popSound(S.sounds);
    }
    toast(entry ? 'Saved' : `Added · ${Math.round(kcal)} kcal${game.xp ? ` · +${game.xp} XP${game.boosted ? ' ⚡️x2' : ''}` : ''}`);
    S.justLogged = !entry;
    queueCelebration(game);
    closeAllSheetsViaHistory();
    setTimeout(refresh, 80);
  });
  if (entry) $('#qaDel', wrap).addEventListener('click', async () => {
    await db.del('log', entry.id);
    toast('Deleted');
    closeAllSheetsViaHistory();
    setTimeout(refresh, 80);
  });
}

/* ================= barcode scanner ================= */

async function openScanner(getMeal) {
  const wrap = openSheet(`
    <div class="scan-stage">
      <video muted playsinline></video>
      <div class="reticle"></div>
      <div class="scan-status" id="scanStatus"></div>
      <div class="scan-hint">Center the barcode · hold 10-15 cm away</div>
      <div class="scan-tools">
        <button class="icon-btn" id="torchBtn" hidden aria-label="Flashlight"><svg viewBox="0 0 24 24"><path d="M8 2h8l-1 7h3l-9 13 2-9H7z"/></svg></button>
        <button class="icon-btn sheet-close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
    </div>
    <div class="scan-foot">
      <input class="input" id="manualCode" type="text" inputmode="numeric" placeholder="Type barcode digits" autocomplete="off">
      <button class="btn small" id="manualGo" style="flex:none">Look up</button>
    </div>`, { cls: 'scanner', onClose: () => scanner && scanner.stop() });

  const video = $('video', wrap);
  const status = $('#scanStatus', wrap);
  let scanner = null;

  const { createScanner } = await import('./scanner.js');
  scanner = createScanner(video, {
    onCode: code => { audioTick(); handleBarcode(code, getMeal); },
    onState: (st) => {
      if (st === 'denied') status.innerHTML = 'Camera access denied.<br><span style="font-weight:500;font-size:12.5px">Allow camera for this site in iOS Settings, or type the barcode below.</span>';
      else if (st === 'error') status.textContent = 'Camera unavailable. Type the barcode below.';
      else if (st === 'stalled') status.textContent = 'Camera is not sending frames. Close and reopen the scanner.';
      else if (st === 'running') { status.textContent = ''; if (scanner.hasTorch()) $('#torchBtn', wrap).hidden = false; }
      else status.textContent = 'Starting camera...';
    },
  });
  scanner.start();

  let torchOn = false;
  $('#torchBtn', wrap).addEventListener('click', () => { torchOn = !torchOn; scanner.setTorch(torchOn); });
  $('#manualGo', wrap).addEventListener('click', () => {
    const code = $('#manualCode', wrap).value.replace(/\D/g, '');
    if (code.length >= 8) handleBarcode(code, getMeal);
    else toast('Enter at least 8 digits');
  });

  async function handleBarcode(code, getMeal) {
    scanner.stop();
    status.innerHTML = '<span class="spin" style="display:inline-block;vertical-align:-3px"></span>  Looking up ' + code;
    // 1. local (previously scanned / created)
    let food = S.userFoods.find(f => f.barcode && barcodeMatch(f.barcode, code));
    // 2. Open Food Facts
    if (!food) { food = await fetchOffProduct(code); }
    // 3. USDA branded fallback
    if (!food) { status.textContent = 'Checking USDA...'; food = await fetchFdcByBarcode(code, S.settings.fdcKey || 'DEMO_KEY'); }
    if (food) {
      openPortion(food, { meal: getMeal(), via: 'scan' });
      return;
    }
    status.textContent = '';
    openSheet(`
      <div class="sheet-head"><h2>Not in database</h2><button class="sheet-close">Back</button></div>
      <div class="sheet-body">
        <p class="note" style="margin-bottom:14px">Barcode <b style="color:var(--text)">${esc(code)}</b> isn't in Open Food Facts or USDA yet. Add it once and it's yours forever:</p>
        <button class="btn" id="missLabel">Scan the nutrition label</button>
        <div style="height:8px"></div>
        <button class="btn ghost" id="missManual">Enter nutrition manually</button>
      </div>`);
    $('#missLabel').addEventListener('click', () => openLabelFlow(getMeal, code));
    $('#missManual').addEventListener('click', () => openFoodForm({ barcode: code, meal: getMeal() }));
  }
}

function barcodeMatch(a, b) {
  const x = String(a).replace(/^0+/, ''), y = String(b).replace(/^0+/, '');
  return x === y;
}

/* ================= label OCR flow ================= */

function openLabelFlow(getMeal, barcode = null) {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Scan nutrition label</h2><button class="sheet-close">Cancel</button></div>
    <div class="sheet-body">
      <p class="note" style="margin-bottom:14px">Take a straight-on photo of the Nutrition Facts panel in good light. Tally reads it on-device; nothing is uploaded.</p>
      <input type="file" accept="image/*" capture="environment" id="labelFile" hidden>
      <input type="file" accept="image/*" id="labelPick" hidden>
      <button class="btn" id="takeBtn">Take photo</button>
      <div style="height:8px"></div>
      <button class="btn ghost" id="pickBtn">Choose from library</button>
      <div id="ocrArea" style="margin-top:16px"></div>
    </div>`);

  const area = $('#ocrArea', wrap);
  $('#takeBtn', wrap).addEventListener('click', () => $('#labelFile', wrap).click());
  $('#pickBtn', wrap).addEventListener('click', () => $('#labelPick', wrap).click());
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    area.innerHTML = `
      <img src="${url}" alt="label" style="width:100%;border-radius:14px;max-height:260px;object-fit:contain;background:var(--surface-2)">
      <div class="progress"><i id="ocrBar" style="width:4%"></i></div>
      <p class="note" style="text-align:center" id="ocrMsg">Reading label... first use downloads the reader (~10 MB)</p>`;
    try {
      const { ocrLabel } = await import('./ocr.js');
      const text = await ocrLabel(file, p => { const b = $('#ocrBar', wrap); if (b) b.style.width = Math.round(p * 100) + '%'; });
      const parsed = parseNutritionText(text);
      openLabelConfirm(parsed, { getMeal, barcode, photoUrl: url });
    } catch (err) {
      area.innerHTML = `<p class="warn">Could not read that photo (${esc(err.message || 'error')}). Try more light, less glare, and fill the frame with the label.</p>`;
    }
  };
  $('#labelFile', wrap).addEventListener('change', onFile);
  $('#labelPick', wrap).addEventListener('change', onFile);
}

function openLabelConfirm(parsed, { getMeal, barcode, photoUrl }) {
  openFoodForm({
    barcode,
    meal: getMeal(),
    fromLabel: true,
    photoUrl,
    prefill: {
      servingText: parsed.servingText || '1 serving',
      servingGrams: parsed.servingGrams,
      kcal: parsed.kcal, p: parsed.protein, c: parsed.carbs, f: parsed.fat,
      fiber: parsed.fiber, sugar: parsed.sugar, sodium: parsed.sodium,
    },
    warnings: parsed.warnings,
  });
}

/* ================= food form (create/edit custom) ================= */

function openFoodForm({ existing = null, barcode = null, meal = 0, prefill = null, warnings = [], photoUrl = null, fromLabel = false } = {}) {
  const f = existing;
  const pv = prefill || {};
  const perServ = f ? (f.perServing || (f.per100 && f.servings[0]?.g ? scalePer100(f.per100, f.servings[0].g) : f.per100)) : null;
  const servingLabel = f ? (f.servings[0]?.label || '1 serving') : (pv.servingText || '1 serving');
  const servingGrams = f ? f.servings[0]?.g : pv.servingGrams;
  const v = k => {
    if (pv[k] != null) return pv[k];
    if (perServ && perServ[k] != null) return Math.round(perServ[k] * 10) / 10;
    return '';
  };

  const wrap = openSheet(`
    <div class="sheet-head"><h2>${f ? 'Edit food' : 'New food'}</h2><button class="sheet-close">Cancel</button></div>
    <div class="sheet-body">
      ${photoUrl ? `<img src="${photoUrl}" alt="label" style="width:100%;border-radius:14px;max-height:190px;object-fit:contain;background:var(--surface-2);margin-bottom:12px">` : ''}
      ${warnings.length ? `<div class="warn">${warnings.map(esc).join('<br>')}</div>` : ''}
      <div class="field"><label>Name</label><input id="ffName" placeholder="e.g. Protein granola" value="${esc(f?.name || '')}"></div>
      <div class="field"><label>Brand (optional)</label><input id="ffBrand" value="${esc(f?.brand || '')}"></div>
      <div class="grid2">
        <div class="field"><label>Serving name</label><input id="ffServ" value="${esc(servingLabel)}"></div>
        <div class="field"><label>Serving grams (optional)</label><input id="ffGrams" type="text" inputmode="decimal" value="${servingGrams ?? ''}" placeholder="e.g. 55"></div>
      </div>
      <div class="sect-h" style="margin-top:6px">Per serving</div>
      <div class="grid2">
        <div class="field"><label>Calories</label><input id="ffKcal" type="text" inputmode="numeric" value="${v('kcal')}"></div>
        <div class="field"><label>Protein g</label><input id="ffP" type="text" inputmode="decimal" value="${v('p')}"></div>
        <div class="field"><label>Carbs g</label><input id="ffC" type="text" inputmode="decimal" value="${v('c')}"></div>
        <div class="field"><label>Fat g</label><input id="ffF" type="text" inputmode="decimal" value="${v('f')}"></div>
        <div class="field"><label>Fiber g</label><input id="ffFib" type="text" inputmode="decimal" value="${v('fiber')}"></div>
        <div class="field"><label>Sugar g</label><input id="ffSug" type="text" inputmode="decimal" value="${v('sugar')}"></div>
      </div>
      <div class="field"><label>Sodium mg</label><input id="ffNa" type="text" inputmode="numeric" value="${v('sodium')}"></div>
      ${barcode ? `<p class="note">Will be linked to barcode ${esc(barcode)} so scanning finds it instantly next time.</p>` : ''}
      <div style="height:10px"></div>
      <button class="btn" id="ffSave">${f ? 'Save changes' : 'Save food'}</button>
      ${f ? '<div style="height:8px"></div><button class="btn danger" id="ffDel">Delete food</button>' : ''}
    </div>`);

  $('#ffSave', wrap).addEventListener('click', async () => {
    const name = $('#ffName', wrap).value.trim();
    const kcal = num($('#ffKcal', wrap).value);
    if (!name) { toast('Name required'); return; }
    if (kcal == null) { toast('Calories required'); return; }
    const grams = num($('#ffGrams', wrap).value);
    const perServing = {
      kcal, p: num($('#ffP', wrap).value) || 0, c: num($('#ffC', wrap).value) || 0, f: num($('#ffF', wrap).value) || 0,
      fiber: num($('#ffFib', wrap).value), sugar: num($('#ffSug', wrap).value), sodium: num($('#ffNa', wrap).value),
    };
    const food = {
      id: f ? f.id : 'c-' + newId(),
      source: 'custom',
      barcode: (f && f.barcode) || barcode || undefined,
      name,
      brand: $('#ffBrand', wrap).value.trim() || null,
      perServing,
      per100: grams ? scaleToPer100(perServing, grams) : undefined,
      servings: [
        { label: $('#ffServ', wrap).value.trim() || '1 serving', g: grams || null },
        ...(grams ? [{ label: '100 g', g: 100 }] : []),
      ],
      favorite: f?.favorite || false,
      useCount: f?.useCount || 0,
      createdAt: f?.createdAt || Date.now(),
    };
    await db.put('foods', food);
    const i = S.userFoods.findIndex(x => x.id === food.id);
    if (i >= 0) S.userFoods[i] = food; else S.userFoods.push(food);
    toast('Food saved');
    if (!kcalConsistent(perServing)) toast('Heads up: calories and macros disagree, double-check the label', 3400);
    if (f) { closeAllSheetsViaHistory(); setTimeout(refresh, 80); }
    else openPortion(food, { meal, via: fromLabel ? 'label' : null });
  });

  if (f) $('#ffDel', wrap).addEventListener('click', async () => {
    await db.del('foods', f.id);
    S.userFoods = S.userFoods.filter(x => x.id !== f.id);
    toast('Food deleted');
    closeAllSheetsViaHistory();
    setTimeout(refresh, 80);
  });
}

function scaleToPer100(n, grams) {
  const k = 100 / grams; const out = {};
  for (const key of Object.keys(n)) if (n[key] != null) out[key] = Math.round(n[key] * k * 100) / 100;
  return out;
}
function scalePer100(per100, grams) {
  const k = grams / 100; const out = {};
  for (const key of Object.keys(per100)) if (per100[key] != null) out[key] = per100[key] * k;
  return out;
}

/* ================= trends ================= */

async function renderTrends(el) {
  const t = S.settings.targets;
  const weights = (await db.all('weights')).sort((a, b) => a.date.localeCompare(b.date));
  const trended = weightTrend(weights);
  const rate = trendRatePerWeek(trended, 14);
  const unit = S.settings.units === 'kg' ? 'kg' : 'lb';
  const toUnit = kg => S.settings.units === 'kg' ? kg : kgToLb(kg);
  const latest = trended[trended.length - 1];

  const log = await db.all('log');
  const byDate = {};
  for (const e of log) { (byDate[e.date] = byDate[e.date] || []).push(e); }
  const days14 = [];
  for (let i = 13; i >= 0; i--) {
    const dk = addDays(dateKey(), -i);
    days14.push({ date: dk, tot: dayTotals(byDate[dk] || []) });
  }
  const days7 = days14.slice(-7);
  const pAvg = days7.reduce((a, d) => a + d.tot.p, 0) / 7;
  const loggedDays7 = days7.filter(d => d.tot.kcal > 0).length;

  const xp = await totalXp();
  const lvl = levelFor(xp);
  const earned = await earnedBadgeIds();

  el.innerHTML = `
  <h1 class="page-h1">Trends<span class="sub">Progress, weight, and intake</span></h1>

  <div class="card">
    <div class="card-title">PROGRESS <button class="link" id="openProg">Details</button></div>
    <div class="big-stat"><span class="v">Lv ${lvl.level}</span><span class="d">${esc(lvl.name)} · ${xp.toLocaleString()} XP</span></div>
    <div class="xp-bar"><i style="width:${lvl.pct}%"></i></div>
    <p class="note" style="margin-top:7px">${(lvl.need - lvl.into).toLocaleString()} XP to level ${lvl.level + 1}</p>
    ${badgesGridHtml(earned)}
  </div>

  <div class="card">
    <div class="card-title">WEIGHT ${weights.length ? `<span class="note">${weights.length} entries</span>` : ''}</div>
    ${latest ? `
      <div class="big-stat">
        <span class="v">${toUnit(latest.trend).toFixed(1)} ${unit}</span>
        ${rate != null ? `<span class="trend-chip ${rate > 0.02 ? 'up' : ''}">${rate > 0 ? '+' : ''}${toUnit(rate).toFixed(1)} ${unit}/wk</span>` : ''}
      </div>
      <p class="note" style="margin-bottom:10px">Trend weight (smoothed). Last weigh-in: ${toUnit(latest.kg).toFixed(1)} ${unit}</p>
      <div class="chart">${weightChart(trended.slice(-45), toUnit)}</div>` :
      '<p class="note" style="padding:6px 0 12px">Log your weight a few times a week. The smoothed trend line cuts through daily water-weight noise so you can see if your plan is working.</p>'}
    <div style="height:10px"></div>
    <button class="btn ghost" id="logWeight">Log weight</button>
  </div>

  <div class="card">
    <div class="card-title">CALORIES · LAST 14 DAYS</div>
    <div class="chart">${kcalChart(days14, t.kcal)}</div>
    <p class="note" style="margin-top:8px">Line = your ${t.kcal.toLocaleString()} kcal target.</p>
  </div>

  <div class="card">
    <div class="card-title">PROTEIN · LAST 7 DAYS</div>
    <div class="big-stat"><span class="v">${Math.round(pAvg)} g</span><span class="d">avg / day · target ${t.p} g</span></div>
    <div class="chart">${proteinChart(days7, t.p)}</div>
    ${loggedDays7 < 5 ? '<p class="note" style="margin-top:8px">Log most days for a meaningful average.</p>' : ''}
  </div>`;

  $('#logWeight').addEventListener('click', openWeightSheet);
  $('#openProg').addEventListener('click', openProgressSheet);
  bindBadgeTaps(el);
}

function weightChart(points, toUnit) {
  if (points.length < 2) return '<p class="note">Add more weigh-ins to see the trend.</p>';
  const W = 560, H = 150, P = 8;
  const vals = points.flatMap(p => [toUnit(p.kg), toUnit(p.trend)]);
  const min = Math.min(...vals) - 0.4, max = Math.max(...vals) + 0.4;
  const x = i => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = v => P + (1 - (v - min) / (max - min)) * (H - 2 * P);
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(toUnit(p.kg)).toFixed(1)}" r="2.6" fill="var(--text-3)"/>`).join('');
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(toUnit(p.trend)).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${W} ${H}">${dots}<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/></svg>`;
}

function kcalChart(days, target) {
  const W = 560, H = 150, P = 6, gap = 6;
  const bw = (W - 2 * P - gap * (days.length - 1)) / days.length;
  const max = Math.max(target * 1.25, ...days.map(d => d.tot.kcal)) || 1;
  const y = v => H - 18 - (v / max) * (H - 34);
  const bars = days.map((d, i) => {
    const bx = P + i * (bw + gap);
    const v = d.tot.kcal;
    const h = Math.max(2, (v / max) * (H - 34));
    const over = v > target;
    const dow = 'SMTWTFS'[new Date(d.date + 'T12:00').getDay()];
    return `<rect x="${bx.toFixed(1)}" y="${(H - 18 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3.5" fill="${v === 0 ? 'var(--surface-3)' : over ? 'var(--amber)' : 'var(--accent)'}" opacity="${v === 0 ? 0.6 : over ? 0.85 : 0.9}"/>
      <text x="${(bx + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="9.5" fill="var(--text-3)">${dow}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}">${bars}<line x1="${P}" x2="${W - P}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}" stroke="var(--line-strong)" stroke-width="1.5" stroke-dasharray="5 5"/></svg>`;
}

function proteinChart(days, target) {
  const W = 560, H = 110, P = 6, gap = 8;
  const bw = (W - 2 * P - gap * (days.length - 1)) / days.length;
  const max = Math.max(target * 1.2, ...days.map(d => d.tot.p)) || 1;
  const bars = days.map((d, i) => {
    const bx = P + i * (bw + gap);
    const h = Math.max(2, (d.tot.p / max) * (H - 30));
    const hit = d.tot.p >= target * 0.9;
    const dow = 'SMTWTFS'[new Date(d.date + 'T12:00').getDay()];
    return `<rect x="${bx.toFixed(1)}" y="${(H - 16 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3.5" fill="var(--protein)" opacity="${hit ? 0.95 : 0.35}"/>
      <text x="${(bx + bw / 2).toFixed(1)}" y="${H - 2}" text-anchor="middle" font-size="9.5" fill="var(--text-3)">${dow}</text>`;
  }).join('');
  const ty = H - 16 - (target / max) * (H - 30);
  return `<svg viewBox="0 0 ${W} ${H}">${bars}<line x1="${P}" x2="${W - P}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="var(--line-strong)" stroke-width="1.5" stroke-dasharray="5 5"/></svg>`;
}

function openWeightSheet() {
  const unit = S.settings.units === 'kg' ? 'kg' : 'lb';
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Log weight</h2><button class="sheet-close">Cancel</button></div>
    <div class="sheet-body">
      <div class="grid2">
        <div class="field"><label>Weight (${unit})</label><input id="wVal" type="text" inputmode="decimal" placeholder="0.0"></div>
        <div class="field"><label>Date</label><input id="wDate" type="date" value="${dateKey()}"></div>
      </div>
      <div style="height:8px"></div>
      <button class="btn" id="wSave">Save</button>
    </div>`);
  $('#wVal', wrap).focus();
  $('#wSave', wrap).addEventListener('click', async () => {
    const v = num($('#wVal', wrap).value);
    const d = $('#wDate', wrap).value;
    if (v == null || !d) { toast('Enter a weight'); return; }
    const kg = S.settings.units === 'kg' ? v : lbToKg(v);
    await db.put('weights', { date: d, kg });
    // keep profile weight fresh for future target recalcs
    S.settings.profile.weightKg = kg;
    await kvSet('settings', S.settings);
    const game = await onWeighIn(d);
    confettiBurst(innerWidth / 2, innerHeight * 0.4, 12);
    popSound(S.sounds);
    toast(`Weight logged${game.xp ? ` · +${game.xp} XP` : ''}`);
    if (game.newBadges.length) queueCelebration({ newBadges: game.newBadges });
    closeAllSheetsViaHistory();
    setTimeout(refresh, 80);
  });
}

/* ================= foods tab ================= */

async function renderFoods(el) {
  const customs = S.userFoods.filter(f => f.source === 'custom').sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
  const scanned = S.userFoods.filter(f => f.source !== 'custom').sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0)).slice(0, 12);
  const favIds = S.userFoods.filter(f => f.favorite).map(f => f.id);
  const kvRows = await db.all('kv');
  const genFavs = kvRows.filter(r => r.k.startsWith('fav-') && r.v).map(r => GENERIC_FOODS.find(g => g.id === r.k.slice(4))).filter(Boolean);
  const favs = [...S.userFoods.filter(f => f.favorite), ...genFavs];

  el.innerHTML = `
  <h1 class="page-h1">Foods<span class="sub">${GENERIC_FOODS.length} built-in · ${customs.length} custom · ${scanned.length ? scanned.length + ' scanned' : 'none scanned yet'}</span></h1>
  <div class="search-wrap">${ICONS.search}<input id="fq" class="input" type="search" placeholder="Search all foods" autocomplete="off"></div>
  <div id="fList"></div>`;

  const list = $('#fList', el);
  function base() {
    let html = '<button class="btn ghost" id="newFood" style="margin:4px 0 6px">+ Create a food</button>';
    if (favs.length) html += '<div class="sect-h">Favorites</div>' + favs.map(foodRowHtml).join('');
    if (customs.length) html += '<div class="sect-h">My foods</div>' + customs.map(foodRowHtml).join('');
    if (scanned.length) html += '<div class="sect-h">Recently scanned</div>' + scanned.map(foodRowHtml).join('');
    if (!favs.length && !customs.length && !scanned.length) html += '<p class="note" style="text-align:center;padding:20px">Foods you scan, create, or favorite collect here.</p>';
    list.innerHTML = html;
    bind();
  }
  function bind() {
    $$('[data-food]', list).forEach(b => b.addEventListener('click', () => {
      const f = findFood(b.dataset.food);
      if (f) openPortion(f, { meal: mealForHour(new Date().getHours()) });
    }));
    $('#newFood', list)?.addEventListener('click', () => openFoodForm({}));
  }
  $('#fq', el).addEventListener('input', e => {
    const q = e.target.value.trim();
    if (!q) { base(); return; }
    const res = searchFoods(allSearchableFoods(), q, 40);
    list.innerHTML = res.length ? res.map(foodRowHtml).join('') : '<p class="note" style="text-align:center;padding:20px">No matches.</p>';
    bind();
  });
  base();
}

/* ================= settings ================= */

async function renderSettings(el) {
  const t = S.settings.targets;
  const p = S.settings.profile;
  const units = S.settings.units;
  const lastExport = await kvGet('lastExportAt', 0);
  const exportAgo = lastExport ? Math.round((Date.now() - lastExport) / 86400e3) : null;
  el.innerHTML = `
  <h1 class="page-h1">Settings</h1>

  <div class="card">
    <div class="card-title">DAILY TARGETS <button class="link" id="recalc">Recalculate</button></div>
    <div class="grid4">
      <div class="field"><label>kcal</label><input id="tKcal" type="text" inputmode="numeric" value="${t.kcal}"></div>
      <div class="field"><label>Protein</label><input id="tP" type="text" inputmode="numeric" value="${t.p}"></div>
      <div class="field"><label>Carbs</label><input id="tC" type="text" inputmode="numeric" value="${t.c}"></div>
      <div class="field"><label>Fat</label><input id="tF" type="text" inputmode="numeric" value="${t.f}"></div>
    </div>
    <button class="btn small ghost" id="saveTargets">Save targets</button>
    <p class="note" style="margin-top:10px">Based on: ${p.sex === 'm' ? 'male' : 'female'}, ${p.age}, ${S.settings.units === 'kg' ? Math.round(p.heightCm) + ' cm' : cmToFtIn(p.heightCm).ft + "'" + cmToFtIn(p.heightCm).inch + '"'}, ${units === 'kg' ? p.weightKg.toFixed(1) + ' kg' : kgToLb(p.weightKg).toFixed(0) + ' lb'}, ${esc((ACTIVITY_LEVELS.find(a => a.id === p.activity) || {}).label || '')}, goal: ${esc((GOALS.find(g => g.id === p.goal) || {}).label || '')}.</p>
  </div>

  <div class="card">
    <div class="card-title">PREFERENCES</div>
    <div class="settings-row">
      <div class="lab"><b>Weight units</b><span>For logging and trends</span></div>
      <div class="seg" style="width:130px"><button id="uLb" class="${units === 'lb' ? 'on' : ''}">lb</button><button id="uKg" class="${units === 'kg' ? 'on' : ''}">kg</button></div>
    </div>
    <div class="settings-row">
      <div class="lab"><b>Sounds</b><span>Little pops and level-up chimes</span></div>
      <div class="seg" style="width:130px"><button id="sndOn" class="${S.sounds ? 'on' : ''}">On</button><button id="sndOff" class="${S.sounds ? '' : 'on'}">Off</button></div>
    </div>
    <div class="settings-row">
      <div class="lab"><b>USDA API key</b><span>Optional: raises online search limit to 1,000/hr. <a href="https://fdc.nal.usda.gov/api-key-signup.html" target="_blank" rel="noopener">Get a free key</a></span></div>
    </div>
    <input class="input" id="fdcKey" placeholder="DEMO_KEY (default)" value="${esc(S.settings.fdcKey || '')}" style="margin-top:2px">
    <button class="btn small ghost" id="saveKey" style="margin-top:10px">Save key</button>
  </div>

  <div class="card">
    <div class="card-title">APPLE HEALTH</div>
    <div class="settings-row">
      <div class="lab"><b>Steps, active energy, weight</b><span>${S.settings.hkConnected ? 'Connected via your Sync Tally shortcut' : 'Bridge from your Apple Watch via a one-time Shortcut'}</span></div>
      <button class="btn small ghost" id="hkGuide">${S.settings.hkConnected ? 'Guide' : 'Connect'}</button>
    </div>
    <button class="btn small ghost" id="hkSyncNow" style="margin-top:8px">Sync from clipboard now</button>
  </div>

  <div class="card">
    <div class="card-title">DATA</div>
    <div class="settings-row"><div class="lab"><b>Export backup</b><span>${exportAgo == null ? 'Never backed up yet' : exportAgo === 0 ? 'Last backup: today' : `Last backup: ${exportAgo} day${exportAgo === 1 ? '' : 's'} ago`}</span></div><button class="btn small ghost" id="exportBtn">Export</button></div>
    <div class="settings-row"><div class="lab"><b>Import backup</b><span>Restore from a Tally export</span></div><button class="btn small ghost" id="importBtn">Import</button></div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
    <div class="settings-row"><div class="lab"><b>Erase all data</b><span>Removes log, foods, weights</span></div><button class="btn small danger" id="eraseBtn">Erase</button></div>
  </div>

  <p class="note" style="text-align:center;margin-top:18px">
    Boneheadz Gym v4 · data lives only on this device<br>
    Food lookups: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> · <a href="https://fdc.nal.usda.gov" target="_blank" rel="noopener">USDA FoodData Central</a>
  </p>`;

  $('#saveTargets').addEventListener('click', async () => {
    const kcal = num($('#tKcal').value), p2 = num($('#tP').value), c = num($('#tC').value), f = num($('#tF').value);
    if (!kcal || kcal < 800) { toast('Calorie target looks too low'); return; }
    S.settings.targets = { ...S.settings.targets, kcal: Math.round(kcal), p: Math.round(p2 || 0), c: Math.round(c || 0), f: Math.round(f || 0) };
    await kvSet('settings', S.settings);
    toast('Targets saved');
  });
  $('#recalc').addEventListener('click', () => openProfileSheet());
  $('#uLb').addEventListener('click', async () => { S.settings.units = 'lb'; await kvSet('settings', S.settings); refresh(); });
  $('#uKg').addEventListener('click', async () => { S.settings.units = 'kg'; await kvSet('settings', S.settings); refresh(); });
  $('#saveKey').addEventListener('click', async () => {
    S.settings.fdcKey = $('#fdcKey').value.trim() || null;
    await kvSet('settings', S.settings);
    toast('Saved');
  });
  $('#sndOn').addEventListener('click', async () => { S.sounds = true; await kvSet('sounds', true); popSound(true); refresh(); });
  $('#sndOff').addEventListener('click', async () => { S.sounds = false; await kvSet('sounds', false); refresh(); });
  $('#hkGuide').addEventListener('click', openHealthGuide);
  $('#hkSyncNow').addEventListener('click', syncFromClipboard);
  $('#exportBtn').addEventListener('click', async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tally-backup-${dateKey()}.json`;
    a.click();
    await kvSet('lastExportAt', Date.now());
    toast('Backup exported');
  });
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const counts = await importAll(JSON.parse(await file.text()));
      S.settings = await kvGet('settings') || S.settings;
      S.userFoods = await db.all('foods');
      toast(`Imported ${counts.log} log entries, ${counts.foods} foods`);
      refresh();
    } catch (err) { toast('Import failed: ' + err.message, 3200); }
  });
  $('#eraseBtn').addEventListener('click', async () => {
    if (!confirm('Erase ALL Tally data on this device? This cannot be undone.')) return;
    if (!confirm('Last check: your log, foods, and weights will be gone.')) return;
    for (const st of ['foods', 'log', 'weights', 'kv', 'xp', 'health']) await db.clear(st);
    location.reload();
  });
}

/* ================= profile / onboarding ================= */

function profileFormHtml(p, units) {
  const imp = units !== 'kg';
  const { ft, inch } = cmToFtIn(p.heightCm || 178);
  return `
    <div class="field"><label>Units</label>
      <div class="seg"><button type="button" id="pfLb" class="${imp ? 'on' : ''}">lb / ft</button><button type="button" id="pfKg" class="${imp ? '' : 'on'}">kg / cm</button></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Sex (for BMR)</label>
        <div class="seg"><button type="button" id="pfM" class="${p.sex !== 'f' ? 'on' : ''}">Male</button><button type="button" id="pfF" class="${p.sex === 'f' ? 'on' : ''}">Female</button></div>
      </div>
      <div class="field"><label>Age</label><input id="pfAge" type="text" inputmode="numeric" value="${p.age || ''}" placeholder="30"></div>
    </div>
    <div class="grid2">
      <div class="field" id="hImp" ${imp ? '' : 'hidden'}><label>Height</label>
        <div class="grid2"><input id="pfFt" type="text" inputmode="numeric" value="${ft}" placeholder="ft"><input id="pfIn" type="text" inputmode="numeric" value="${inch}" placeholder="in"></div>
      </div>
      <div class="field" id="hMet" ${imp ? 'hidden' : ''}><label>Height (cm)</label><input id="pfCm" type="text" inputmode="numeric" value="${Math.round(p.heightCm || 178)}"></div>
      <div class="field"><label>Weight (<span id="wUnit">${imp ? 'lb' : 'kg'}</span>)</label><input id="pfW" type="text" inputmode="decimal" value="${p.weightKg ? (imp ? kgToLb(p.weightKg).toFixed(0) : p.weightKg.toFixed(1)) : ''}" placeholder="${imp ? '180' : '82'}"></div>
    </div>
    <div class="field"><label>Activity</label>
      <div id="pfAct">${ACTIVITY_LEVELS.map(a => `<button type="button" class="chip ${p.activity === a.id ? 'on' : ''}" data-act="${a.id}" style="margin:0 6px 7px 0">${a.label}</button>`).join('')}</div>
    </div>
    <div class="field"><label>Goal</label>
      <div id="pfGoal">${GOALS.map(g => `<button type="button" class="chip ${p.goal === g.id ? 'on' : ''}" data-goal="${g.id}" style="margin:0 6px 7px 0">${g.label}</button>`).join('')}</div>
      <p class="note" id="goalHint"></p>
    </div>
    <div class="card" style="background:var(--surface-2);margin:4px 0 12px">
      <div class="card-title">YOUR PLAN</div>
      <div id="pfPreview" class="note">Fill in the fields above.</div>
    </div>`;
}

function bindProfileForm(wrap, initial, onChange) {
  const state = { units: initial.units || 'lb', sex: initial.sex || 'm', activity: initial.activity || 'moderate', goal: initial.goal || 'recomp' };
  const get = () => {
    const imp = state.units === 'lb';
    const age = num($('#pfAge', wrap).value);
    const heightCm = imp ? ftInToCm(num($('#pfFt', wrap).value) || 0, num($('#pfIn', wrap).value) || 0) : (num($('#pfCm', wrap).value) || 0);
    const w = num($('#pfW', wrap).value);
    const weightKg = w == null ? null : (imp ? lbToKg(w) : w);
    return { sex: state.sex, age, heightCm, weightKg, activity: state.activity, goal: state.goal, units: state.units };
  };
  const upd = () => {
    const p = get();
    const hint = GOALS.find(g => g.id === state.goal);
    $('#goalHint', wrap).textContent = hint ? hint.hint : '';
    if (p.age && p.heightCm > 90 && p.weightKg) {
      const t = computeTargets(p);
      $('#pfPreview', wrap).innerHTML = `<div class="big-stat" style="margin:0"><span class="v" style="font-size:26px">${t.kcal.toLocaleString()} kcal</span><span class="d">/ day</span></div>
        <div style="margin-top:6px;font-weight:600;color:var(--text)">Protein ${t.p} g · Carbs ${t.c} g · Fat ${t.f} g</div>
        <div style="margin-top:4px">Maintenance ~${t.tdee.toLocaleString()} kcal</div>`;
      onChange?.(p, t);
    }
  };
  const setSeg = (sel, on) => { $$(sel, wrap).forEach(x => x.classList.remove('on')); on.classList.add('on'); };
  $('#pfLb', wrap).addEventListener('click', e => { state.units = 'lb'; setSeg('#pfLb,#pfKg', e.target); switchUnits(); });
  $('#pfKg', wrap).addEventListener('click', e => { state.units = 'kg'; setSeg('#pfLb,#pfKg', e.target); switchUnits(); });
  function switchUnits() {
    const imp = state.units === 'lb';
    $('#hImp', wrap).hidden = !imp; $('#hMet', wrap).hidden = imp;
    $('#wUnit', wrap).textContent = imp ? 'lb' : 'kg';
    const w = num($('#pfW', wrap).value);
    if (w != null) $('#pfW', wrap).value = imp ? kgToLb(w).toFixed(0) : lbToKg(w).toFixed(1);
    upd();
  }
  $('#pfM', wrap).addEventListener('click', e => { state.sex = 'm'; setSeg('#pfM,#pfF', e.target); upd(); });
  $('#pfF', wrap).addEventListener('click', e => { state.sex = 'f'; setSeg('#pfM,#pfF', e.target); upd(); });
  $$('#pfAct .chip', wrap).forEach(c => c.addEventListener('click', () => { state.activity = c.dataset.act; $$('#pfAct .chip', wrap).forEach(x => x.classList.toggle('on', x === c)); upd(); }));
  $$('#pfGoal .chip', wrap).forEach(c => c.addEventListener('click', () => { state.goal = c.dataset.goal; $$('#pfGoal .chip', wrap).forEach(x => x.classList.toggle('on', x === c)); upd(); }));
  ['#pfAge', '#pfFt', '#pfIn', '#pfCm', '#pfW'].forEach(sel => $(sel, wrap)?.addEventListener('input', upd));
  upd();
  return get;
}

function openProfileSheet() {
  const p = { ...S.settings.profile, units: S.settings.units, goal: S.settings.profile.goal, };
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Your plan</h2><button class="sheet-close">Cancel</button></div>
    <div class="sheet-body">
      ${profileFormHtml(p, S.settings.units)}
      <button class="btn" id="pfSave">Update targets</button>
    </div>`, { cls: 'full' });
  const get = bindProfileForm(wrap, p);
  $('#pfSave', wrap).addEventListener('click', async () => {
    const np = get();
    if (!np.age || !np.weightKg || np.heightCm < 90) { toast('Fill in age, height, weight'); return; }
    S.settings.profile = { sex: np.sex, age: np.age, heightCm: np.heightCm, weightKg: np.weightKg, activity: np.activity, goal: np.goal };
    S.settings.units = np.units;
    S.settings.targets = computeTargets(S.settings.profile);
    await kvSet('settings', S.settings);
    toast('Plan updated');
    closeAllSheetsViaHistory();
    setTimeout(refresh, 80);
  });
}

function renderOnboarding() {
  const el = $('#screen');
  $('#tabbar').style.display = 'none';
  el.innerHTML = `
  <div class="onb">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>BONEHEADZ GYM</h1>
    <p class="tag">Feed the bones. Scan barcodes, photograph labels, and log meals in seconds while a very cool skeleton earns loot on your behalf. Private: your data never leaves this device.</p>
    <div class="feature">${ICONS.barcode.replace('<svg', '<svg class="fi"')}<div><b>Instant barcode scanning</b><span>Millions of packaged foods via Open Food Facts + USDA</span></div></div>
    <div class="feature">${ICONS.label.replace('<svg', '<svg class="fi"')}<div><b>Label camera</b><span>Photograph any Nutrition Facts panel, Tally reads it on-device</span></div></div>
    <div class="feature">${ICONS.bolt.replace('<svg', '<svg class="fi"')}<div><b>Built for consistency</b><span>Recents, favorites, copy-yesterday, streaks</span></div></div>
    <div class="spacer"></div>
    <button class="btn" id="onbGo">Set up my plan</button>
    <div style="height:9px"></div>
    <button class="btn ghost" id="onbSkip">Skip, use defaults</button>
  </div>`;
  $('#onbGo').addEventListener('click', () => {
    el.innerHTML = `<div class="onb" style="padding-top:calc(var(--sat) + 18px)">
      <h1 style="font-size:26px;margin-bottom:14px">Your plan</h1>
      <div id="pfHost">${profileFormHtml({ }, 'lb')}</div>
      <button class="btn" id="onbSave">Start tracking</button>
      <div style="height:30px"></div>
    </div>`;
    const get = bindProfileForm(el, { units: 'lb' });
    $('#onbSave').addEventListener('click', async () => {
      const np = get();
      if (!np.age || !np.weightKg || np.heightCm < 90) { toast('Fill in age, height, weight'); return; }
      await saveInitialSettings(np);
    });
  });
  $('#onbSkip').addEventListener('click', async () => {
    await saveInitialSettings({ sex: 'm', age: 30, heightCm: 178, weightKg: lbToKg(180), activity: 'moderate', goal: 'recomp', units: 'lb' });
    toast('Using defaults. Tune them in Settings.', 3000);
  });
}

async function saveInitialSettings(np) {
  const profile = { sex: np.sex, age: np.age, heightCm: np.heightCm, weightKg: np.weightKg, activity: np.activity, goal: np.goal };
  S.settings = {
    profile,
    targets: computeTargets(profile),
    units: np.units,
    fdcKey: null,
    createdAt: Date.now(),
  };
  await kvSet('settings', S.settings);
  await kvSet('game-init', true); // fresh install: nothing to backfill
  const kit = await initLootIfNeeded();
  if (kit) setTimeout(() => toast('Welcome kit: 2 crates + a Streak Freeze are waiting on your Bonehead', 3600), 1200);
  $('#tabbar').style.display = '';
  window.addEventListener('hashchange', route);
  bindTabs();
  location.hash = '#/today';
  route();
}

/* ================= game: celebrations + progress ================= */

function queueCelebration(game) {
  if (!game) return;
  if (game.levelUp || (game.newBadges && game.newBadges.length) || game.streakMilestone) {
    S.celebration = game;
  }
}

function maybeCelebrate() {
  if (!S.celebration) return;
  const c = S.celebration;
  S.celebration = null;
  setTimeout(() => openCelebration(c), 380);
}

function openCelebration({ levelUp = null, newBadges = [], streakMilestone = null }) {
  const bits = [];
  if (levelUp) bits.push(`<div class="cele-big">Level ${levelUp.level}</div><div class="cele-sub">${esc(levelUp.name)}</div>`);
  if (streakMilestone) bits.push(`<div class="cele-big">🔥 ${streakMilestone} days</div><div class="cele-sub">Streak milestone · +100 XP</div>`);
  for (const b of newBadges) bits.push(`<div class="cele-badge"><span>${b.icon}</span><div><b>${esc(b.name)}</b><small>${esc(b.desc)} · +25 XP</small></div></div>`);
  if (!bits.length) return;
  confettiRain();
  levelSound(S.sounds);
  const wrap = openSheet(`
    <div class="sheet-body" style="text-align:center;padding-top:26px">
      <div style="font-size:44px;line-height:1">${levelUp ? '🎉' : streakMilestone ? '🔥' : '🏅'}</div>
      <div style="height:10px"></div>
      ${bits.join('<div style="height:14px"></div>')}
      <div style="height:22px"></div>
      <button class="btn" id="celeOk">Keep it going</button>
      <div style="height:6px"></div>
    </div>`);
  $('#celeOk', wrap).addEventListener('click', () => history.back());
}

function badgesGridHtml(earned, newIds = new Set()) {
  return `<div class="badge-grid">${BADGES.map(b => `
    <button class="badge ${earned.has(b.id) ? '' : 'locked'} ${newIds.has(b.id) ? 'new' : ''}" data-badge="${b.id}">
      <span class="bicon">${b.icon}</span>${esc(b.name)}
    </button>`).join('')}</div>`;
}

function bindBadgeTaps(wrap) {
  $$('[data-badge]', wrap).forEach(el => el.addEventListener('click', () => {
    const b = BADGES.find(x => x.id === el.dataset.badge);
    if (b) toast(`${b.icon} ${b.name}: ${b.desc}`, 2600);
  }));
}

async function openCharacter(tab = 'wardrobe') {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Your Bonehead</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body" id="chBody"></div>`, { cls: 'full' });
  await renderCharacter(wrap, tab);
}

async function renderCharacter(wrap, tab) {
  const body = $('#chBody', wrap);
  if (!body) return;
  const [xp, eq, coinBal, inv, boost] = await Promise.all([totalXp(), equipped(), coins(), inventory(), xpBoostCharges()]);
  const lvl = levelFor(xp);
  const crates = inv.filter(r => r.kind === 'crate').sort((a, b) => a.ts - b.ts);
  const freezes = inv.filter(r => r.kind === 'freeze').length;
  const boosts = inv.filter(r => r.kind === 'xp2').length;
  const ownedCount = inv.filter(r => r.kind === 'cos').length;

  body.innerHTML = `
    <div class="bh-hero">
      <div class="bh-stage lg">${avatarLayersHtml(eq)}</div>
      <div class="bh-hero-meta">
        <b>Lv ${lvl.level} · ${esc(lvl.name)}</b>
        <div class="xp-mini" style="width:110px"><i style="width:${lvl.pct}%"></i></div>
        <span class="note">${ICONS.coin(13)} ${coinBal.toLocaleString()} · ${ownedCount}/${BH_ITEMS.length} cosmetics${boost ? ` · ${ICONS.boltIco(13)}x${boost}` : ''}</span>
      </div>
    </div>
    <div class="chips" id="chTabs" style="margin:12px 0 4px">
      <button class="chip ${tab === 'wardrobe' ? 'on' : ''}" data-tab="wardrobe">Wardrobe</button>
      <button class="chip ${tab === 'crates' ? 'on' : ''}" data-tab="crates">Crates & Shop ${crates.length ? `(${crates.length})` : ''}</button>
      <button class="chip ${tab === 'progress' ? 'on' : ''}" data-tab="progress">Progress</button>
    </div>
    <div id="chContent"></div>`;

  $$('#chTabs .chip', body).forEach(c => c.addEventListener('click', () => renderCharacter(wrap, c.dataset.tab)));
  const content = $('#chContent', body);

  if (tab === 'wardrobe') {
    const owned = await ownedCosmeticIds();
    const slot = S.wardrobeSlot || 'H';
    const counts = {};
    for (const s of BH_SLOTS) counts[s.code] = BH_ITEMS.filter(i => i.slot === s.code && owned.has(i.id)).length;
    const slotMeta = BH_SLOTS.find(s => s.code === slot);
    const items = BH_ITEMS.filter(i => i.slot === slot && owned.has(i.id));
    const lockedCount = BH_ITEMS.filter(i => i.slot === slot).length - items.length;
    content.innerHTML = `
      <div class="chips scroll" id="slotChips">
        ${BH_SLOTS.map(s => `<button class="chip ${s.code === slot ? 'on' : ''}" data-slot="${s.code}">${s.label} ${counts[s.code] ? `· ${counts[s.code]}` : ''}</button>`).join('')}
      </div>
      <div class="ward-grid">
        ${slotMeta.default || !items.length ? '' : `<button class="ward-cell none ${!eq[slot] ? 'equipped' : ''}" data-equip="">None</button>`}
        ${items.map(i => `
          <button class="ward-cell r-${i.rarity} ${eq[slot] === i.id ? 'equipped' : ''}" data-equip="${i.id}" title="${esc(i.name)}">
            <img src="${bhAsset(i)}" alt="${esc(i.name)}" loading="lazy">
          </button>`).join('')}
      </div>
      ${lockedCount ? `<p class="note" style="text-align:center;margin-top:10px">${lockedCount} more ${slotMeta.label.toLowerCase()} item${lockedCount === 1 ? '' : 's'} still in crates somewhere</p>` : ''}
      ${!items.length && !lockedCount ? '<p class="note" style="text-align:center;padding:14px">Nothing here yet.</p>' : ''}
      ${!items.length && lockedCount ? '<p class="note" style="text-align:center;padding:14px">Nothing unlocked here yet. Crates await.</p>' : ''}`;
    $$('#slotChips .chip', content).forEach(c => c.addEventListener('click', () => { S.wardrobeSlot = c.dataset.slot; renderCharacter(wrap, 'wardrobe'); }));
    $$('[data-equip]', content).forEach(cell => cell.addEventListener('click', async () => {
      await equip(slot, cell.dataset.equip || null);
      popSound(S.sounds);
      renderCharacter(wrap, 'wardrobe');
    }));
  }

  if (tab === 'crates') {
    content.innerHTML = `
      ${crates.length ? crates.map(c => {
        const def = CRATES[c.crate] || CRATES.daily;
        return `<div class="crate-row">
          <span class="crate-ico">${crateIcon(c.crate, 27)}</span>
          <div style="flex:1"><b>${def.label}</b><small>from ${esc(c.source || 'quests')}</small></div>
          <button class="btn small" data-open="${c.id}">Open</button>
        </div>`;
      }).join('') : '<p class="note" style="text-align:center;padding:12px 0 16px">No unopened crates. Finish quests, close days on budget, and walk 10k steps to earn more.</p>'}
      <div class="sect-h">Consumables</div>
      <div class="crate-row"><span class="crate-ico">${ICONS.freeze(24)}</span><div style="flex:1"><b>Streak Freeze</b><small>${CONSUMABLES.freeze.desc}</small></div><span class="q-frac">x${freezes}</span></div>
      <div class="crate-row"><span class="crate-ico">${ICONS.boltIco(24)}</span><div style="flex:1"><b>XP Boost</b><small>${CONSUMABLES.xp2.desc}</small></div>
        ${boosts ? `<button class="btn small ghost" id="useBoost">Activate (x${boosts})</button>` : `<span class="q-frac">x0</span>`}</div>
      ${boost ? `<p class="note" style="margin:6px 2px">${ICONS.boltIco(13)} Boost active: ${boost} double-XP log${boost === 1 ? '' : 's'} remaining</p>` : ''}
      <div class="sect-h">Shop</div>
      <div class="grid2">
        ${SHOP.map(s => `<button class="shop-cell" data-buy="${s.id}" ${coinBal < s.cost ? 'disabled' : ''}>
          <span class="crate-ico">${s.id === 'crate-daily' ? crateIcon('daily', 26) : s.id === 'crate-golden' ? crateIcon('golden', 26) : consumableIcon(s.id, 26)}</span><b>${s.label}</b><small>${ICONS.coin(12)} ${s.cost}</small></button>`).join('')}
      </div>`;
    $$('[data-open]', content).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      const result = await openCrate(b.dataset.open);
      await openCrateReveal(result);
      renderCharacter(wrap, 'crates');
    }));
    $('#useBoost', content)?.addEventListener('click', async () => {
      if (await activateXpBoost()) { popSound(S.sounds); toast('XP Boost active: next 5 logs give double XP'); }
      renderCharacter(wrap, 'crates');
    });
    $$('[data-buy]', content).forEach(b => b.addEventListener('click', async () => {
      const r = await buyShopItem(b.dataset.buy);
      if (!r.ok) { toast('Not enough coins yet'); return; }
      popSound(S.sounds);
      toast('Purchased');
      renderCharacter(wrap, 'crates');
    }));
  }

  if (tab === 'progress') {
    const earned = await earnedBadgeIds();
    const todayRows = await xpForDate(dateKey());
    const todayXp = todayRows.reduce((a, r) => a + r.xp, 0);
    const keys = new Set(todayRows.map(r => r.key));
    const earnables = [];
    if (![...keys].some(k => k.startsWith('protein-'))) earnables.push('+40 hit your protein target');
    if (![...keys].some(k => k.startsWith('meals3-'))) earnables.push('+20 log all three meals');
    if (![...keys].some(k => k.startsWith('scan-'))) earnables.push('+15 log something by barcode');
    if (![...keys].some(k => k.startsWith('weigh-'))) earnables.push('+15 log a weigh-in');
    earnables.push('+50 finish the day inside budget');
    content.innerHTML = `
      <p class="note" style="margin:4px 2px 2px">${lvl.into.toLocaleString()} / ${lvl.need.toLocaleString()} XP to level ${lvl.level + 1} · ${xp.toLocaleString()} XP total</p>
      <div class="sect-h">Today · ${todayXp} XP earned</div>
      ${todayRows.slice(0, 6).map(r => `<div class="xp-row"><span>${esc(r.label)}</span><b>+${r.xp}</b></div>`).join('') || '<p class="note" style="padding:6px 2px">Nothing yet. Log something!</p>'}
      <div class="sect-h">Still on the table today</div>
      ${earnables.slice(0, 4).map(e => `<div class="xp-row dim"><span>${esc(e)}</span></div>`).join('')}
      <div class="sect-h">Badges · ${earned.size}/${BADGES.length}</div>
      ${badgesGridHtml(earned)}
      <div style="height:10px"></div>`;
    bindBadgeTaps(content);
  }
}

// kept as an alias: some entry points still ask for "progress"
function openProgressSheet() { return openCharacter('progress'); }

async function openCrateReveal(result) {
  const def = result.def;
  const best = result.results.reduce((acc, r) => {
    if (r.type !== 'cos' && r.type !== 'dupe') return acc;
    const idx = ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(r.item.rarity);
    return Math.max(acc, idx);
  }, 0);
  const wrap = openSheet(`
    <div class="sheet-body" style="text-align:center;padding-top:24px">
      <div class="crate-shake" id="crateAnim">${crateIcon(result.crate, 96)}</div>
      <div id="crateResults" hidden>
        ${result.results.map(r => {
          if (r.type === 'consumable') {
            const c = CONSUMABLES[r.consumable];
            return `<div class="reveal-card r-uncommon"><span class="reveal-ico">${consumableIcon(r.consumable, 34)}</span><div><b>${c.label}</b><small>${c.desc}</small></div></div>`;
          }
          const rar = RARITIES[r.item.rarity];
          if (r.type === 'dupe') {
            return `<div class="reveal-card r-${r.item.rarity}"><img src="${bhAsset(r.item)}" alt=""><div><b>${esc(r.item.name)}</b><small>Duplicate → +${r.coins}🪙</small><span class="rar-chip" style="color:${rar.color}">${rar.label}</span></div></div>`;
          }
          return `<div class="reveal-card r-${r.item.rarity}"><img src="${bhAsset(r.item)}" alt=""><div><b>${esc(r.item.name)}</b><small>${esc((BH_SLOTS.find(s => s.code === r.item.slot) || {}).label || '')}</small><span class="rar-chip" style="color:${rar.color}">${rar.label}</span></div></div>`;
        }).join('')}
        <p class="note" style="margin:10px 0 16px">+${result.coins} ${ICONS.coin(13)} coins</p>
        <button class="btn" id="crateOk">Collect</button>
      </div>
      <div style="height:10px"></div>
    </div>`);
  return new Promise(resolve => {
    setTimeout(() => {
      const anim = $('#crateAnim', wrap);
      if (anim) anim.hidden = true;
      const res = $('#crateResults', wrap);
      if (res) res.hidden = false;
      if (best >= 3) { confettiRain(90); levelSound(S.sounds); }
      else { confettiBurst(innerWidth / 2, innerHeight * 0.35, 22); popSound(S.sounds); }
    }, 950);
    $('#crateOk', wrap).addEventListener('click', () => { history.back(); setTimeout(resolve, 150); });
  });
}

/* ================= Apple Health bridge ================= */

async function ingestHealth(payload, { celebrate = true } = {}) {
  const existing = await db.get('health', payload.date);
  const row = { ...(existing || {}), date: payload.date };
  if (payload.steps != null) row.steps = payload.steps;
  if (payload.activeKcal != null) row.activeKcal = payload.activeKcal;
  await db.put('health', row);
  if (payload.weightKg != null) {
    await db.put('weights', { date: payload.date, kg: payload.weightKg });
    await onWeighIn(payload.date);
  }
  if (!S.settings.hkConnected) { S.settings.hkConnected = true; await kvSet('settings', S.settings); }
  const game = await onHealthSync(payload.date, { steps: payload.steps });
  const bits = [];
  if (payload.steps != null) bits.push(`${payload.steps.toLocaleString()} steps`);
  if (payload.activeKcal != null) bits.push(`${payload.activeKcal.toLocaleString()} active kcal`);
  if (payload.weightKg != null) bits.push(`weight ${S.settings.units === 'kg' ? payload.weightKg.toFixed(1) + ' kg' : kgToLb(payload.weightKg).toFixed(1) + ' lb'}`);
  if (celebrate) {
    confettiBurst(innerWidth / 2, 160, 14);
    popSound(S.sounds);
    toast(`Health synced: ${bits.join(' · ')}${game.xp ? ` · +${game.xp} XP` : ''}`, 3200);
    if (game.newBadges.length) { queueCelebration({ newBadges: game.newBadges }); maybeCelebrate(); }
  }
  return bits;
}

async function ingestHkFromUrl() {
  const h = location.hash || '';
  if (!h.startsWith('#/hk')) return;
  const payload = parseHkPayload(decodeURIComponent(h));
  history.replaceState(null, '', location.pathname + location.search + '#/today');
  if (payload) await ingestHealth(payload, { celebrate: true });
  else toast('Could not read the Health sync link');
}

async function syncFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    const payload = parseHkPayload(text);
    if (!payload) {
      toast('No Tally sync data on the clipboard. Run your "Sync Tally" shortcut first.', 3400);
      return;
    }
    await ingestHealth(payload);
    refresh();
  } catch {
    toast('Clipboard not available. Run the shortcut, then tap Sync again.', 3200);
  }
}

const HK_TEMPLATE = 'tally-hk steps=[Steps Sum] active=[Active Sum] weightlb=[Latest Weight]';

function openHealthGuide() {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Connect Apple Health</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <p class="note" style="margin-bottom:12px">iPhone web apps can't read Health directly, so Tally uses a tiny Shortcut you build once (about 3 minutes). It copies your day's numbers and opens Tally; one tap on Sync pulls them in. You can automate it to run every evening.</p>
      <div class="sect-h">One-time setup</div>
      <ol class="guide">
        <li>Open the <b>Shortcuts</b> app, tap <b>+</b>, name it <b>Sync Tally</b></li>
        <li>Add action <b>Find Health Samples</b>. Set Type: <b>Steps</b>, add filter <b>Start Date · is today</b></li>
        <li>Add action <b>Calculate Statistics</b>, operation <b>Sum</b> (input: Health Samples)</li>
        <li>Repeat steps 2-3 for Type: <b>Active Energy</b></li>
        <li>Optional: add another <b>Find Health Samples</b>, Type: <b>Weight</b>, Sort by Start Date, Order Latest First, Limit 1</li>
        <li>Add action <b>Text</b> and type this, inserting the variables from the steps above:</li>
      </ol>
      <div class="code-line" id="hkTpl">${esc(HK_TEMPLATE)}</div>
      <button class="btn small ghost" id="copyTpl" style="margin:8px 0 14px">Copy template</button>
      <ol class="guide" start="7">
        <li>Add action <b>Copy to Clipboard</b></li>
        <li>Add action <b>Open App</b> and pick <b>Tally</b> (install Tally to your home screen first)</li>
        <li>Run it, then tap <b>Sync</b> on Tally's Today screen and allow the paste</li>
      </ol>
      <div class="sect-h">Automate it</div>
      <p class="note">Shortcuts app → Automation → New → Time of Day (e.g. 9:00 PM) → Run Immediately → pick Sync Tally. Or just say "Hey Siri, Sync Tally".</p>
      <div style="height:12px"></div>
      <button class="btn" id="hkTrySync">I ran it, sync now</button>
      <div style="height:8px"></div>
    </div>`, { cls: 'full' });
  $('#copyTpl', wrap).addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(HK_TEMPLATE); toast('Template copied'); } catch { toast('Long-press the text to copy it'); }
  });
  $('#hkTrySync', wrap).addEventListener('click', syncFromClipboard);
}

/* ================= the boneyard (gps hunt) ================= */

let huntWatchId = null;
function stopHuntWatch() {
  if (huntWatchId != null && navigator.geolocation) navigator.geolocation.clearWatch(huntWatchId);
  huntWatchId = null;
}

async function openHunt() {
  const eq = await equipped();
  const wrap = openSheet(`
    <div class="sheet-head"><h2>The Boneyard</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <div id="huntBody">
        <p class="note" style="margin-bottom:6px">Fresh spawns appear around your neighborhood every day: bone caches, coin piles, buried crates, and sometimes a RARE. Walk within ${COLLECT_RADIUS_M} m of a blip and collect it.</p>
        <p class="note" style="margin-bottom:14px">Your location is used on this phone only, never stored, never uploaded. Spawns are computed on-device.</p>
        <button class="btn" id="huntStart">Start the radar</button>
      </div>
    </div>`, { cls: 'full', onClose: stopHuntWatch });

  const body = $('#huntBody', wrap);
  function startRadar() {
    stopHuntWatch();
    if (!('geolocation' in navigator)) { body.innerHTML = '<p class="warn">This device has no location support.</p>'; return; }
    body.innerHTML = '<p class="note" style="text-align:center;padding:40px 0">Acquiring signal...</p>';
    let lastTick = 0;
    huntWatchId = navigator.geolocation.watchPosition(pos => {
      const now = Date.now();
      if (now - lastTick < 1200) return;
      lastTick = now;
      renderRadar(body, pos.coords.latitude, pos.coords.longitude, eq);
    }, err => {
      body.innerHTML = `<p class="warn">${err.code === 1
        ? 'Location permission denied. Allow location for this app in iOS Settings, then try again.'
        : 'No location fix yet. Step outside or near a window and retry.'}</p><button class="btn ghost" id="huntRetry" style="margin-top:10px">Retry</button>`;
      $('#huntRetry', body)?.addEventListener('click', startRadar);
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
  }
  $('#huntStart', wrap).addEventListener('click', startRadar);
}

async function renderRadar(body, lat, lng, eq) {
  if (!body.isConnected) { stopHuntWatch(); return; }
  const date = dateKey();
  const xpRows = await db.all('xp');
  const collected = new Set(xpRows.filter(r => r.type === 'spawn').map(r => r.key));
  const live = spawnsNear(date, lat, lng).map(s => ({ ...s, collected: collected.has(spawnKey(date, s)) }));
  const rare = live.find(s => s.type === 'rare' && !s.collected);

  body.innerHTML = `
    ${rare ? `<div class="rare-banner">${crateIcon('egg', 15)} RARE spawn today: ${fmtDist(rare.dist)} ${compassLabel(rare.bearing)}</div>` : ''}
    <div class="radar">
      <div class="radar-sweep"></div>
      <div class="radar-ring" style="inset:16.6%"></div>
      <div class="radar-ring" style="inset:33.3%"></div>
      <div class="radar-ring" style="inset:8px"></div>
      <div class="radar-you">${avatarLayersHtml(eq)}</div>
      ${live.filter(s => !s.collected).map(s => {
        const r = Math.min(s.dist, VIEW_RADIUS_M - 25) / VIEW_RADIUS_M * 46;
        const x = 50 + r * Math.sin(s.bearing * Math.PI / 180);
        const y = 50 - r * Math.cos(s.bearing * Math.PI / 180);
        return `<div class="radar-blip ${s.type === 'rare' ? 'rare' : ''} ${s.dist <= COLLECT_RADIUS_M ? 'inrange' : ''}" style="left:${x}%;top:${y}%">${spawnIcon(s.type, 19)}</div>`;
      }).join('')}
    </div>
    <div class="note" style="text-align:center;margin:6px 0 10px">Rings: 200 / 400 / 600 m · spawns refresh at midnight</div>
    ${live.map(s => `
      <div class="crate-row">
        <span class="crate-ico">${spawnIcon(s.type, 25)}</span>
        <div style="flex:1"><b>${SPAWN_TYPES[s.type].label}</b><small>${fmtDist(s.dist)} ${compassLabel(s.bearing)}${s.type === 'rare' ? ' · today only' : ''}</small></div>
        ${s.collected ? '<span class="q-done">✓</span>' : s.dist <= COLLECT_RADIUS_M
          ? `<button class="btn small" data-collect="${s.id}">Collect</button>`
          : `<span class="q-frac">${fmtDist(Math.max(1, s.dist - COLLECT_RADIUS_M))} to go</span>`}
      </div>`).join('')}
  `;
  $$('[data-collect]', body).forEach(b => b.addEventListener('click', async () => {
    const s2 = live.find(x => x.id === b.dataset.collect);
    if (!s2) return;
    const res = await collectSpawn(s2);
    if (!res) return;
    await kvSet('hunt-enabled', true);
    confettiBurst(innerWidth / 2, innerHeight * 0.32, 20);
    popSound(S.sounds);
    const bits = [`+${res.xp} XP`];
    if (res.coins) bits.push(`+${res.coins} coins`);
    if (res.crate) bits.push((res.crate === 'egg' ? 'Step Egg' : 'Daily Crate') + ' added to your stash');
    toast(`${res.label} collected · ${bits.join(' · ')}`, 3400);
    const badges = await evaluateBadges();
    if (badges.length) { queueCelebration({ newBadges: badges }); maybeCelebrate(); }
    renderRadar(body, lat, lng, eq);
  }));
}

/* ================= demo seed ================= */

async function seedDemo() {
  const profile = { sex: 'm', age: 33, heightCm: 180, weightKg: 84, activity: 'moderate', goal: 'recomp' };
  const settings = { profile, targets: computeTargets(profile), units: 'lb', fdcKey: null, hkConnected: true, createdAt: Date.now() };
  await kvSet('settings', settings);
  for (let i = 0; i < 4; i++) {
    await db.put('health', {
      date: addDays(dateKey(), -i),
      steps: [8421, 11250, 6480, 9902][i],
      activeKcal: [512, 640, 388, 545][i],
    });
  }
  await kvSet('coins', 340);
  const demoCos = ['H11-1', 'FW1', 'IL1-1', 'IR1', 'C1', 'P1', 'BG2-1', 'E2', 'T6-2', 'U3', 'S3', 'G1', 'SK0-3', 'B0-5'];
  for (const id of demoCos) await db.put('inv', { id: 'demo-' + id, kind: 'cos', itemId: id, source: 'demo', ts: Date.now() });
  await kvSet('equipped', { H: 'H11-1', FW: 'FW1', IL: 'IL1-1', IR: 'IR1', C: 'C1', P: 'P1', BG: 'BG2-1' });
  await db.put('inv', { id: 'demo-crate1', kind: 'crate', crate: 'golden', source: 'level-7', ts: Date.now() });
  await db.put('inv', { id: 'demo-crate2', kind: 'crate', crate: 'daily', source: 'quests', ts: Date.now() });
  await db.put('inv', { id: 'demo-freeze', kind: 'freeze', source: 'welcome', ts: Date.now() });
  await db.put('inv', { id: 'demo-xp2', kind: 'xp2', source: 'crate', ts: Date.now() });
  await kvSet('loot-init', true);
  const g = id => GENERIC_FOODS.find(f => f.id === id);
  const put = async (date, meal, foodId, idx, qty, hourTs) => {
    const food = g(foodId);
    const sel = { mode: 'serving', idx, qty };
    const n = nutrientsFor(food, sel);
    await db.put('log', {
      id: newId(), date, meal, ts: new Date(date + 'T12:00').getTime() + hourTs * 3600e3,
      foodId, name: food.name, brand: null, portionLabel: portionLabel(food, sel), sel,
      kcal: n.kcal, p: n.p || 0, c: n.c || 0, f: n.f || 0, fiber: n.fiber || 0, sugar: n.sugar || 0, sodium: n.sodium || 0,
    });
  };
  const today = dateKey();
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const skipDinner = i === 0;
    await put(d, 0, 'g-oats-dry-rolled', 1, 1, -4);
    await put(d, 0, 'g-banana', 0, 1, -4);
    await put(d, 0, 'g-greek-yogurt-plain-2', 0, 1, -3.8);
    await put(d, 0, 'g-coffee-black', 0, 1, -4.2);
    await put(d, 1, 'g-chicken-breast-cooked', 1, 1, 0.5);
    await put(d, 1, 'g-white-rice-cooked', 1, i % 2 ? 1 : 1.5, 0.5);
    await put(d, 1, 'g-broccoli-cooked', 0, 1, 0.5);
    if (i % 3 === 0) await put(d, 3, 'g-almonds', 0, 1, 3);
    if (i % 2 === 0) await put(d, 3, 'g-apple', 0, 1, 3.2);
    if (!skipDinner) {
      await put(d, 2, 'g-salmon-cooked', 0, 1, 7);
      await put(d, 2, 'g-potato-baked-with-skin', 0, 1, 7);
      await put(d, 2, 'g-mixed-salad-greens', 0, 1, 7);
      await put(d, 2, 'g-olive-oil', 1, 1, 7);
      if (i % 4 === 1) await put(d, 2, 'g-dark-chocolate-70-85', 1, 1, 8.5);
    }
  }
  for (let i = 30; i >= 0; i -= 1) {
    if (i % 7 === 2 || i % 7 === 5) continue; // not every day
    const kg = 87.4 - (30 - i) * 0.045 + ((i * 7) % 3) * 0.14 - 0.1;
    await db.put('weights', { date: addDays(today, -i), kg: Math.round(kg * 10) / 10 });
  }
}

/* ================= go ================= */

boot();

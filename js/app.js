// Tally: app orchestrator. Screens, sheets, and flows.
import { db, kvGet, kvSet, newId, exportAll, importAll, useDbName, requestPersistence } from './db.js';
import { confettiBurst, confettiRain, tweenNumber, popSound, levelSound, hitSound, reducedMotion } from './fx.js';
import {
  levelFor, totalXp, onFoodLogged, onWeighIn, onHealthSync, awardDayCloseIfDue,
  initGameIfNeeded, initLootIfNeeded, checkStreakFreeze, evaluateBadges, earnedBadgeIds,
  BADGES, xpForDate, parseHkPayload, award,
} from './game.js';
import {
  RARITIES, CRATES, CONSUMABLES, SHOP, coins, coinsAdd, grantCrate, inventory, ownedCosmeticIds,
  unopenedCrates, openCrate, buyShopItem, equipped, equip, activateBattleCharm,
  ownedGearIds, grantGear, gearLoadout, equipGear,
  migrateLegacyEggs, eggProgress, hatchEgg, lifetimeStepsSum,
  battleCharmCharges, consumeBattleCharmCharge, consumableCount, redeemCode,
  WEAPON_COST, buyWeapon,
  boneDust, disenchantGear, salvagePet, gearDustValue, petDustValue, DUST_SHOP, buyWithDust,
} from './loot.js';
import { dailyQuests, weeklyQuests, monthlyQuests, questCtx, questState, claimQuest, claimAllBonusIfDue, periodKeyOf } from './quests.js';
import { getWellness, addWater, markBed, markSleep, WATER_GOAL } from './wellness.js';
import { spawnsNear, spawnKey, collectSpawn, SPAWN_TYPES, COLLECT_RADIUS_M, fmtDist, compassLabel, distanceM, bearingDeg } from './hunt.js';
import { snapToWalkable } from './geo.js';
import { bhIcon, hasBhIcon } from './icons-pack.js';
import * as social from './social.js';
import { loadMaplibre, createBoneyardMap, domMarker, MAP_START_ZOOM } from './map.js';
import { GEAR_ITEMS, GEAR_BY_ID, GEAR_SLOTS, GEAR_SLOT_LABELS, gearStats, gearLabel, gearTalents, gearSetInfo, setBonusLabel, gearArmor } from './gear.js';
import { petStepsSince, petPicks, setPetPick } from './loot.js';
import { buildBattlePet, familyOf, petLevel, unlockedTiers, PET_TREES, PET_FAMILIES } from './pets.js';
import { densNear, denKey, denRewardLabel, claimDenWin, claimDenLoot, isoWeekKey, DEN_RADIUS_M, denWinsCount, minisNear, miniKey, claimMiniWin, MINI_RADIUS_M } from './poi.js';
import { showGateIntro } from './gateintro.js';
import { maybeShowDailyWheel } from './wheel.js';
import { attachWalk } from './walk.js';
import { refreshPitEnergy, spendPitFight, FREE_FIGHTS } from './energy.js';
import {
  INGREDIENTS, INGREDIENT_IDS, COMMON_INGREDIENT_IDS, RARE_INGREDIENT, RECIPES, ingredients, grantIngredient, canCook, ingredientCount,
  spawnIngredient, cookState, startCook, collectDish, activeFoodBuffs, foodCoinMult, foodCombatBuff, consumeFightFoodBuffs, fmtCookTime,
  POTIONS, POTION_BY_ID, potionsInv, usePotion, potionCount,
} from './cooking.js';
import { isNative, nativeHealthAvailable, nativeRequestAuth, nativeQueryToday, onAppResume } from './native.js';
import {
  deriveStats, derived, STAT_META, WEAPONS, ACTIONS, makeFighter, createFight, actionsFor, allocatedStats, TRAIN_STEP,
  applyAction, endTurn, planTelegraph, aiTakeTurn, LADDER, CHAMPION, scaleStats, expectedDamage,
  TALENT_TREES, talentPoints, canTakeTalent, RUNG_TALENTS, MISS_CHANCE, endlessFoe, endlessCeiling,
  petActionsFor, applyPetAction, talentRanks, nodeRanks,
} from './pit.js';
import { BH_SLOTS, BH_ITEMS, BH_BY_ID, bhAsset } from '../data/boneheadz.js';
import {
  computeTargets, nutrientsFor, portionLabel, dayTotals, dateKey, addDays,
  mealForHour, MEALS, fmtKcal, fmtG, fmtQty, streakFrom, weightTrend, trendRatePerWeek,
  lbToKg, kgToLb, ftInToCm, cmToFtIn, ACTIVITY_LEVELS, GOALS, kcalConsistent,
  activeCalorieBonus, assumedActiveBurn,
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
  mapmark: (s = 20) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#8fd0ff" stroke-width="1.8" stroke-linecap="round"><path d="M12 21c-4.4-4.5-6.6-8-6.6-11A6.6 6.6 0 0 1 12 3.4 6.6 6.6 0 0 1 18.6 10c0 3-2.2 6.5-6.6 11z" fill="rgba(143,208,255,0.14)"/><circle cx="9.8" cy="9.6" r="1.15" fill="#8fd0ff" stroke="none"/><circle cx="14.2" cy="9.6" r="1.15" fill="#8fd0ff" stroke="none"/><path d="M10.4 12.6h3.2" stroke-width="1.6"/></svg>`,
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

ICONS.pit = (s = 22) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><g stroke="#3a352a" stroke-width="1.2" fill="#f2e9d7"><g transform="rotate(45 12 12)"><circle cx="12" cy="4.6" r="2"/><circle cx="9.6" cy="6.2" r="2"/><circle cx="12" cy="19.4" r="2"/><circle cx="14.4" cy="17.8" r="2"/><rect x="10.9" y="5.5" width="2.2" height="13" rx="1.1"/></g><g transform="rotate(-45 12 12)"><circle cx="12" cy="4.6" r="2"/><circle cx="14.4" cy="6.2" r="2"/><circle cx="12" cy="19.4" r="2"/><circle cx="9.6" cy="17.8" r="2"/><rect x="10.9" y="5.5" width="2.2" height="13" rx="1.1"/></g></g></svg>`;
ICONS.radar = (s = 14) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.4" fill="none" stroke="#7cc4ff" stroke-width="1.7"/><circle cx="12" cy="12" r="5" fill="none" stroke="#7cc4ff" stroke-width="1.4" opacity="0.6"/><circle cx="12" cy="12" r="1.8" fill="#7cc4ff"/><path d="M12 12L18.5 5.5" stroke="#7cc4ff" stroke-width="1.7" stroke-linecap="round"/></svg>`;
ICONS.bone = (s = 18) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><g fill="#f2e9d7" stroke="#3a352a" stroke-width="1.3"><circle cx="6.2" cy="7.6" r="2.6"/><circle cx="8.8" cy="5" r="2.6"/><circle cx="17.8" cy="16.4" r="2.6"/><circle cx="15.2" cy="19" r="2.6"/><rect x="6.4" y="9.2" width="11.4" height="4" rx="2" transform="rotate(45 12 12)"/></g></svg>`;
ICONS.water = (s = 22) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 3.2s6.2 6.6 6.2 10.8A6.2 6.2 0 0 1 5.8 14C5.8 9.8 12 3.2 12 3.2z" fill="#7cc4ff" stroke="#173a52" stroke-width="1.5" stroke-linejoin="round"/><path d="M9.4 13.6a2.6 2.6 0 0 0 2.6 2.6" fill="none" stroke="#e8f5ff" stroke-width="1.4" stroke-linecap="round"/></svg>`;
ICONS.bed = (s = 22) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#f2e9d7" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-7M3 14h18v4M21 18v-4a3 3 0 0 0-3-3H9v3" fill="rgba(242,233,215,0.12)"/><path d="M5.5 11V9.4a1.6 1.6 0 0 1 1.6-1.6" /></svg>`;
ICONS.moon = (s = 22) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5z" fill="#b6a8e8" stroke="#2a2340" stroke-width="1.5" stroke-linejoin="round"/><circle cx="16.5" cy="7.5" r="0.9" fill="#f0ecff"/></svg>`;

function spawnIcon(type, s = 20) {
  if (type === 'coins') return ICONS.coin(s);
  if (type === 'crate') return crateIcon('daily', s);
  if (type === 'rare') return `<img class="ico" src="assets/brand/sword.png" style="width:${Math.round(s * 0.8)}px" alt="rare">`;
  return ICONS.bone(s);
}

function crateIcon(kind, s = 22) {
  const id = kind === 'golden' ? 'crate-golden' : kind === 'egg' ? 'egg' : 'crate-daily';
  return `<span class="bhi-wrap">${bhIcon(id, s)}</span>`;
}
function consumableIcon(type, s = 20) { return `<span class="bhi-wrap">${bhIcon(type === 'freeze' ? 'freeze' : 'charm', s)}</span>`; }
// pack icons for cooking ingredients/recipes (fall back to the emoji if missing)
function ingIconHtml(id, s = 22) { const m = INGREDIENTS[id]; return m && m.iconId && hasBhIcon(m.iconId) ? `<span class="bhi-wrap">${bhIcon(m.iconId, s)}</span>` : (m ? m.icon : ''); }
function recipeIconHtml(r, s = 24) { return r && r.iconId && hasBhIcon(r.iconId) ? `<span class="bhi-wrap">${bhIcon(r.iconId, s)}</span>` : (r ? r.icon : ''); }
// badges: map the emoji to a pack icon where we have one (else keep the emoji)
const BADGE_ICON = {
  '💀': 'badge-skull', '👑': 'badge-crown', '🏆': 'badge-trophy', '🥊': 'badge-boxing',
  '🎯': 'badge-target', '💪': 'badge-muscle', '🦾': 'badge-muscle', '🗺': 'badge-map',
  '🍽': 'badge-meal', '📷': 'badge-scan', '🔍': 'badge-magnify', '🔥': 'flame',
  '🚀': 'badge-rocket', '💯': 'badge-laurels', '🛒': 'badge-cart', '⚖': 'badge-scales',
  '👟': 'badge-footprint', '🎩': 'badge-tophat', '🧥': 'badge-coat', '🦴': 'ingr-marrow',
  '🪧': 'badge-signpost', '🗿': 'badge-moai', '🏚': 'tombstone',
};
function badgeIconHtml(emoji, s = 22) { const id = BADGE_ICON[(emoji || '').replace(/️/g, '')]; return id ? `<span class="bhi-wrap">${bhIcon(id, s)}</span>` : (emoji || ''); }

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
  el.innerHTML = `<div class="splash-inner"><div class="splash-stage">${avatarLayersHtml(userEq || { B: 'B0-1', SK: 'SK0-1' })}</div><img class="splash-mark" src="assets/brand/wordmark.png" alt="BONEHEADZ"><div class="splash-title" style="font-size:30px">GYM</div><div class="splash-sub">Feed the bones</div></div>`;
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
  if (closed?.closed) setTimeout(() => toast('Yesterday closed on budget: Golden Crate earned', 3400), 2400);
  else if (closed?.consoled) setTimeout(() => toast("You logged yesterday. You'll get 'em next time: Daily Crate earned", 3600), 2400);
  await ingestHkFromUrl();
  backupNudge();
  nativeAutoSync();
  setTimeout(checkPetLevelUp, 1500); // catch pet level-ups that happened while away
  // social: push the game snapshot + pull server grants (opt-in, throttled, silent)
  social.initFromQuery().then(() => social.autoSync(socialSnapshot, APP_SOCIAL_V).then(r => {
    if (r && r.applied > 0) { toast(`Crew delivery: ${r.applied} reward${r.applied === 1 ? '' : 's'} arrived. Check your Backpack.`, 3600); refresh(); }
  }));
  onAppResume(() => { nativeAutoSync(); social.autoSync(socialSnapshot, APP_SOCIAL_V); });

  window.addEventListener('hashchange', route);
  bindTabs();
  route();

  // daily haunted prize wheel: once per day, after the splash intro. Self-gates
  // (once/day kv, waits for splash, skips webdriver). Fire-and-forget.
  maybeShowDailyWheel({ sounds: S.sounds }).catch(() => {});
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
  const entries = await entriesFor(S.date);
  const yEntries = await entriesFor(addDays(S.date, -1));
  const allLog = await db.all('log');
  const streak = streakFrom([...new Set(allLog.map(e => e.date))], dateKey());
  const xp = await totalXp();
  const lvl = levelFor(xp);
  const hk = await db.get('health', S.date);
  // extra-active days earn calories back: measured active energy ABOVE what your
  // activity level already assumes (BMR x (factor-1)), credited at 50%.
  const activeBonus = activeCalorieBonus(S.settings.profile, hk?.activeKcal);
  const t = activeBonus > 0 ? { ...S.settings.targets, kcal: S.settings.targets.kcal + activeBonus } : S.settings.targets;
  const cook = await cookState();
  const foodbuffs = await activeFoodBuffs();
  const ingCount = ingredientCount(await ingredients());
  const eq = await equipped();
  const coinBal = await coins();
  const crates = await unopenedCrates();
  const allXp = await db.all('xp');
  const huntEnabled = !!(await kvGet('hunt-enabled'));
  const wellness = S.date === dateKey() ? await getWellness(S.date) : null;
  const qopts = { hkConnected: !!S.settings.hkConnected, huntEnabled };
  const healthRows = await db.all('health');
  const qbase = {
    date: S.date, entries, allXp, allLog, healthRows, targets: S.settings.targets,
    priorFoodIds: new Set(allLog.filter(e => e.date < S.date && e.foodId).map(e => e.foodId)),
    weighedToday: !!(await db.get('weights', S.date)),
    hkConnected: qopts.hkConnected, huntEnabled,
  };
  // three quest tiers, each with its own period-scoped context
  const questTiers = [
    { period: 'day', label: "TODAY'S QUESTS", quests: dailyQuests(S.date, qopts), ctx: questCtx('day', qbase) },
    { period: 'week', label: 'THIS WEEK', quests: weeklyQuests(S.date, qopts), ctx: questCtx('week', qbase) },
    { period: 'month', label: 'THIS MONTH', quests: monthlyQuests(S.date, qopts), ctx: questCtx('month', qbase) },
  ];
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

  <div class="hero-scene ${S.justLogged ? 'bounce' : ''}" id="bhStage">
    ${eq.BG && BH_BY_ID[eq.BG] ? `<img class="hero-backdrop" src="${bhAsset(BH_BY_ID[eq.BG])}" alt="">` : ''}
    <div class="hero-char">${avatarLayersHtml(eq, { skip: ['BG'], noYard: true })}</div>
    ${eq.YD && BH_BY_ID[eq.YD] ? `<img class="hero-yard" src="${bhAsset(BH_BY_ID[eq.YD])}" alt="">` : ''}

    <div class="hero-top">
      <button class="streak-chip ${streak >= 3 ? 'hot' : ''}" id="streakChip"><span class="flame">${bhIcon('flame', 15)}</span> <b>${streak}</b></button>
      <div class="hero-top-right">
        <button class="bh-coin" id="coinBtn">${ICONS.coin(14)} <b>${coinBal.toLocaleString()}</b></button>
        ${crates.length ? `<button class="bh-crates" id="cratesBtn">${crateIcon(crates[0].crate, 14)} ${crates.length}</button>` : ''}
      </div>
    </div>
    <div class="hero-bubble ${bubbleSideCache[JSON.stringify(eq)] === 'r' ? 'side-r' : ''}">${esc(speechLine({ entries, tot, targets: t, crates, streak, isToday }))}</div>
    <div class="hero-meta">
      <button class="hero-level" id="lvlChip">
        <span class="hero-lv">Lv ${lvl.level}</span>
        <span class="hero-title">${esc(lvl.name)}</span>
        <span class="hero-xpbar"><i style="width:${lvl.pct}%"></i></span>
        <span class="hero-xpnum">${lvl.into.toLocaleString()} / ${lvl.need.toLocaleString()} XP · Lv ${lvl.level + 1} unlocks a Golden Crate</span>
      </button>
    </div>
  </div>

  <div class="hero-actions five">
    <button class="hero-act" id="huntBtn">${ICONS.mapmark(23)}<span>Boneyard</span></button>
    <button class="hero-act" id="wardBtn">${ICONS.bone(23)}<span>Wardrobe</span></button>
    <button class="hero-act" id="kitchenActBtn">${bhIcon('dish-broth', 23)}<span>Kitchen${cook && cook.ready ? ' <i class="hero-badge">!</i>' : ''}</span></button>
    <button class="hero-act" id="crateActBtn">${crateIcon('golden', 23)}<span>Backpack${crates.length ? ` (${crates.length})` : ''}</span></button>
    <button class="hero-act" id="pitBtn">${ICONS.pit(23)}<span>The Pit</span></button>
  </div>

  ${isToday ? `
  <details class="q-collapse">
    <summary>QUESTS${questTiers.some(tier => tier.quests.some(q => { const st = questState(q, tier.ctx); return st.done && !st.claimed; })) ? ' <i class="q-badge">!</i>' : ''}</summary>
    <div class="q-card-body">
    ${questTiers.map(tier => `
    <div class="q-tier ${tier.period}">
      <div class="q-tier-h">${tier.label}</div>
      <div class="q-list">
      ${tier.quests.map(q => {
        const st = questState(q, tier.ctx);
        const pct = Math.min(100, Math.round((st.cur / st.target) * 100));
        return `<div class="q-row ${tier.period !== 'day' ? 'longterm' : ''}">
          <div class="q-main">
            <div class="q-name">${esc(q.name)} <span class="q-coins">+${q.coins}${ICONS.coin(11)}${q.crate ? ' ' + crateIcon(q.crate, 12) : ''}</span></div>
            <div class="q-desc">${esc(q.desc)}</div>
            <div class="q-bar ${tier.period !== 'day' ? 'gold' : ''}"><i style="width:${pct}%"></i></div>
          </div>
          ${st.claimed ? '<span class="q-done">✓</span>'
            : st.done ? `<button class="q-claim" data-claim="${q.id}" data-period="${tier.period}" data-pkey="${tier.ctx.periodKey}">Claim</button>`
            : `<span class="q-frac">${st.target > 20 ? Math.round((st.cur / st.target) * 100) + '%' : st.cur + '/' + st.target}</span>`}
        </div>`;
      }).join('')}
      </div>
    </div>`).join('')}
    <button class="link" id="qProg" style="margin-top:4px">Quest progress</button>
    </div>
  </details>` : ''}

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

  ${isToday ? wellnessCardHtml(wellness) : ''}
  ${isToday ? kitchenCardHtml(cook, ingCount, foodbuffs) : ''}
  ${healthCardHtml(hk, isToday)}

  ${MEALS.map((name, i) => mealBlock(name, i, entries.filter(e => e.meal === i), yEntries.filter(e => e.meal === i), Math.round(t.kcal * MEAL_SPLIT[i]))).join('')}

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
  measureBubbleSide($('#bhStage'), eq).then(side => {
    $('.hero-bubble')?.classList.toggle('side-r', side === 'r');
  });
  $('#wardBtn')?.addEventListener('click', () => openCharacter('wardrobe'));
  $('#crateActBtn')?.addEventListener('click', () => openCharacter('crates'));
  $('#pitBtn')?.addEventListener('click', openPit);
  $('#qProg')?.addEventListener('click', () => openCharacter('progress'));
  $('#coinBtn')?.addEventListener('click', () => openCharacter('crates'));
  $('#cratesBtn')?.addEventListener('click', () => openCharacter('crates'));
  $('#huntBtn')?.addEventListener('click', openMap);
  $('#kitchenActBtn')?.addEventListener('click', openKitchen);
  $('#kitchenCard')?.addEventListener('click', openKitchen);
  // daily wellness (pure-positive self-care: only ever adds a reward)
  $('#wWater')?.addEventListener('click', async () => { const w = await addWater(1); popSound(S.sounds); if (w.water >= WATER_GOAL) { confettiBurst(innerWidth / 2, innerHeight * 0.4, 12); toast('Hydrated! Claim the quest for coins.', 2600); } refresh(); });
  $('#wBed')?.addEventListener('click', async () => { await markBed(); popSound(S.sounds); toast('Bed made. Small win banked.', 2200); refresh(); });
  $('#wSleep')?.addEventListener('click', async () => { await markSleep(); popSound(S.sounds); toast('Good sleep logged. Rest is training too.', 2400); refresh(); });
  // dev hook: ?automap=1 walks straight into the map with stubbed coords
  // (simulator smoke tests: no permission prompts, deterministic location)
  if (!window.__automapRan && new URLSearchParams(location.search).has('automap')) {
    window.__automapRan = true;
    const fake = { coords: { latitude: 49.2827, longitude: -123.1207, accuracy: 5, heading: null, speed: 0 } };
    navigator.geolocation.getCurrentPosition = ok => setTimeout(() => ok(fake), 60);
    navigator.geolocation.watchPosition = ok => { setTimeout(() => ok(fake), 400); return 1; };
    navigator.geolocation.clearWatch = () => {};
    setTimeout(() => { $('#huntBtn')?.click(); setTimeout(() => $('#mapStart')?.click(), 900); }, 1200);
  }
  $('#hkSync', el)?.addEventListener('click', syncFromClipboard);
  S.justLogged = false;
  $$('[data-claim]').forEach(b => b.addEventListener('click', async ev => {
    const period = b.dataset.period || 'day';
    const tier = questTiers.find(t => t.period === period);
    const q = tier?.quests.find(x => x.id === b.dataset.claim);
    if (!q) return;
    const res = await claimQuest(b.dataset.pkey, q, period);
    if (!res) return;
    confettiBurst(ev.clientX || innerWidth / 2, ev.clientY || 240, period === 'day' ? 14 : 22);
    period === 'day' ? popSound(S.sounds) : levelSound(S.sounds);
    let msg = `Quest done · +${res.xp} XP · +${res.coins} coins`;
    if (res.crate) msg += ` · ${res.crate === 'golden' ? 'Golden Crate' : res.crate === 'egg' ? 'Step Egg' : 'Daily Crate'} earned!`;
    // daily all-clear bonus crate
    if (period === 'day') {
      const dateXp2 = (await db.all('xp')).filter(r => r.date === S.date);
      const bonus = await claimAllBonusIfDue(S.date, tier.quests, dateXp2);
      if (bonus) msg = `Quest done · +${res.xp + bonus.xp} XP · +${res.coins} coins · Daily Crate earned!`;
    }
    toast(msg, 2800);
    refresh();
  }));
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

const bubbleSideCache = {};
async function measureBubbleSide(stage, eq) {
  const key = JSON.stringify(eq);
  if (bubbleSideCache[key]) return bubbleSideCache[key];
  try {
    const imgs = $$('.bh-anim img', stage);
    if (!imgs.length) return 'l';
    await Promise.allSettled(imgs.map(i => i.decode ? i.decode() : Promise.resolve()));
    const N = 64;
    const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    for (const i of imgs) { try { ctx.drawImage(i, 0, 0, N, N); } catch { /* not ready */ } }
    const d = ctx.getImageData(0, 0, N, N).data;
    // top band of the artwork, where the bubble lives
    const y0 = Math.floor(N * 0.05), y1 = Math.floor(N * 0.38);
    let left = 0, right = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < N; x++) {
      const a = d[(y * N + x) * 4 + 3];
      if (a > 40) { if (x < N * 0.46) left++; else if (x > N * 0.54) right++; }
    }
    const side = right < left ? 'r' : 'l';
    bubbleSideCache[key] = side;
    return side;
  } catch { return 'l'; }
}

function speechLine({ entries, tot, targets, crates, streak, isToday }) {
  const pick = arr => arr[(new Date().getDate() + arr.length) % arr.length];
  if (S.pendingLevelLine) { const l = S.pendingLevelLine; S.pendingLevelLine = null; return l; }
  if (crates.length) return pick([
    'Crack that crate open already!',
    'Loot is burning a hole in my ribs.',
    'Crates do not open themselves, chief.',
    'I can hear something rattling in there. Relatable.',
    'Unopened crates keep me up at night. I do not sleep anyway.',
  ]);
  if (!isToday) return 'Time traveling, are we? Tap me to change my fit.';
  if (!entries.length) return pick([
    'Feed me a log, chief.',
    'Bones do not fuel themselves.',
    'Scan something tasty. I dare you.',
    'My stomach would growl if I had one.',
    'I have not eaten in years. You have no excuse.',
    'Breakfast: the most important meal I cannot have.',
  ]);
  if (targets && targets.p && tot.p >= targets.p) return pick([
    'Protein secured. Bones swole.',
    'Full protein. Maximum calcium energy.',
    'Somewhere, a cow is proud of us.',
    'These femurs? Sponsored by protein.',
  ]);
  if (targets && tot.kcal > targets.kcal) return pick([
    'Big day. We log it all anyway.',
    'Honest logs make strong bones.',
    'We feast like kings. Kings log too.',
  ]);
  if (targets && targets.kcal - tot.kcal <= 350 && targets.kcal - tot.kcal > 0) return pick([
    'Right in the zone. Finish strong.',
    'Stick the landing tonight.',
    'So close I can taste it. Figure of speech.',
  ]);
  if (streak >= 3) return pick([
    `Day ${streak}. Keep the flame alive.`,
    `${streak} days straight. Absolutely unkillable. Well. Again.`,
    `Streak day ${streak}. The calcium is compounding.`,
  ]);
  return pick([
    'The bones are our money!',
    'Solid pace today.',
    'What is next on the menu?',
    'More protein never hurt a skeleton.',
    'Cardio? In this economy?',
    'I am 206 bones of pure potential.',
    'Every day is leg day when you are mostly legs.',
    'I do all my thinking with my skull.',
    'Hydrate. Marrow does not make itself.',
  ]);
}

function avatarLayersHtml(eq, opts = {}) {
  const skip = new Set(opts.skip || []);
  skip.add('YD'); // yard decor is anchored, never a full-frame layer
  const slots = [...BH_SLOTS].sort((a, b) => a.z - b.z);
  const layers = slots.map(s => {
    if (skip.has(s.code)) return '';
    const itemId = eq[s.code];
    if (!itemId || !BH_BY_ID[itemId]) return '';
    const item = BH_BY_ID[itemId];
    // weapon / off-hand glow by rarity (epic/legendary)
    const glow = (s.code === 'IR' || s.code === 'IL') && (item.rarity === 'epic' || item.rarity === 'legendary')
      ? ` class="wpn-glow r-${item.rarity}"` : '';
    return `<img${glow} src="${bhAsset(item)}" alt="" loading="lazy" decoding="async">`;
  }).join('');
  const yd = !opts.noYard && eq.YD && BH_BY_ID[eq.YD]
    ? `<img class="yard-decor" src="${bhAsset(BH_BY_ID[eq.YD])}" alt="">` : '';
  return `<div class="bh-anim">${layers}</div>${yd}`;
}

function healthCardHtml(hk, isToday) {
  if (!hk && !(S.settings.hkConnected && isToday)) return '';
  const steps = hk?.steps;
  const active = hk?.activeKcal;
  const goal = 10000;
  const stepPct = steps ? Math.min(100, (steps / goal) * 100) : 0;
  return `<div class="card">
    <div class="card-title">ACTIVITY · APPLE HEALTH ${isToday ? (isNative() && S.settings.hkNative ? '<span class="link auto" title="Syncs automatically on open">Auto ✓</span>' : '<button class="link" id="hkSync">Sync</button>') : ''}</div>
    ${hk ? `
      <div class="hk-rows">
        <div class="hk-row"><span class="hk-ico">${ICONS.sneaker(21)}</span>
          <div style="flex:1">
            <div class="row" style="display:flex;justify-content:space-between;font-size:13px;font-weight:600"><span>${steps != null ? steps.toLocaleString() : '·'} steps</span><span style="color:var(--text-3)">${steps >= goal ? 'goal hit!' : 'of ' + goal.toLocaleString()}</span></div>
            <div class="bar steps" style="margin-top:5px"><i style="width:${stepPct}%"></i></div>
          </div>
        </div>
        ${active != null ? (() => {
          const bonus = activeCalorieBonus(S.settings.profile, active);
          const note = bonus > 0
            ? `<span style="color:var(--accent);font-weight:700">· +${bonus} kcal earned back</span>`
            : `<span style="color:var(--text-3);font-weight:500">· within your activity baseline</span>`;
          return `<div class="hk-row"><span class="hk-ico">${ICONS.boltIco(19)}</span><div style="font-size:13.5px;font-weight:600">${active.toLocaleString()} kcal active burn ${note}</div></div>`;
        })() : ''}
      </div>` :
      '<p class="note">No sync yet today. Run your "Sync Boneheadz" shortcut, then tap Sync.</p>'}
  </div>`;
}

// ---- Kitchen: cook scavenged ingredients into buff dishes ----
function foodBuffLabel(b) {
  if (b.kind === 'coins') return `+${Math.round(b.pct * 100)}% coins · ${fmtCookTime(Math.max(0, b.untilMs - Date.now()))} left`;
  const bits = [];
  if (b.damagePct) bits.push(`+${Math.round(b.damagePct * 100)}% dmg`);
  if (b.hype) bits.push(`+${b.hype} Hype start`);
  if (b.regenPct) bits.push(`heal ${Math.round(b.regenPct * 100)}%/turn`);
  if (b.petFree) bits.push('pet special free');
  return `${bits.join(' · ')} · ${b.fightsLeft} fight${b.fightsLeft === 1 ? '' : 's'} left`;
}
function potionShort(p) {
  const e = p.effect || {};
  if (e.heal && e.stamina) return 'refill + heal';
  if (e.heal) return `heal ${Math.round(e.heal * 100)}%`;
  if (e.dmgPct) return `+${Math.round(e.dmgPct * 100)}% dmg`;
  if (e.shield) return `+${e.shield} shield`;
  return 'potion';
}

// a Today alert card, ONLY when a dish is ready to collect (access lives in the
// shortcut row now). Cooking-in-progress just shows a badge on the Kitchen button.
function wellnessCardHtml(w) {
  if (!w) return '';
  const waterDone = w.water >= WATER_GOAL;
  const row = (cls, ico, title, doneLbl, todoLbl, done, btnId, btnLabel, extra = '') => `
    <div class="well-row ${done ? 'done' : ''}">
      <span class="well-ico">${ico}</span>
      <div class="well-body"><b>${title}</b><small>${done ? doneLbl : todoLbl}</small>${extra}</div>
      ${done ? '<span class="well-check">✓</span>' : `<button class="btn small ${cls}" id="${btnId}">${btnLabel}</button>`}
    </div>`;
  const waterBar = `<div class="well-bar"><i style="width:${Math.round(w.water / WATER_GOAL * 100)}%"></i></div>`;
  return `<div class="card wellness-card">
    <div class="sect-h" style="margin:0 0 4px">Daily wellness</div>
    ${row('', ICONS.water(22), 'Water', `${WATER_GOAL} cups down. Hydrated.`, `${w.water} / ${WATER_GOAL} cups`, waterDone, 'wWater', '+1 cup', waterBar)}
    ${row('ghost', ICONS.bed(22), 'Make your bed', 'Done. A small win banked.', 'Start the day with a small win', w.bed, 'wBed', 'Mark done')}
    ${row('ghost', ICONS.moon(22), 'Good sleep', 'Logged. Rest is training too.', 'Log a solid night of sleep', w.sleep, 'wSleep', 'Log it')}
  </div>`;
}

function kitchenCardHtml(cook, ingCount, buffs) {
  if (!cook || !cook.ready) return '';
  return `<div class="card kitchen-card" id="kitchenCard">
    <div class="card-title">KITCHEN <span class="link">Collect</span></div>
    <div class="kc-line"><b style="color:var(--accent)">${recipeIconHtml(cook.recipe,18)} ${esc(cook.recipe.name)} is ready!</b></div>
  </div>`;
}

async function openKitchen() {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Kitchen</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body" id="kitchenBody"></div>`, { cls: '', onClose: () => refresh() });
  const body = $('#kitchenBody', wrap);

  async function render() {
    if (!body.isConnected) return;
    const [inv, cook, buffs, potInv] = await Promise.all([ingredients(), cookState(), activeFoodBuffs(), potionsInv()]);
    const pct = cook && !cook.ready ? Math.max(0, Math.min(100, Math.round((1 - cook.remainingMs / Math.max(1, cook.readyAt - cook.startedAt)) * 100))) : (cook && cook.ready ? 100 : 0);
    const cauldronState = cook ? (cook.ready ? 'ready' : 'cooking') : 'idle';
    const recipeCard = r => {
      const have = canCook(r, inv);
      const needStr = Object.entries(r.needs).map(([id, n]) => `${ingIconHtml(id, 13)}${(inv[id] || 0)}/${n}`).join('  ');
      const canStart = have && !cook;
      return `<div class="crate-row recipe ${have ? '' : 'lack'}"><span class="crate-ico">${recipeIconHtml(r, 26)}</span>
        <div style="flex:1"><b>${esc(r.name)}</b><small>${esc(r.desc)}</small><small class="recipe-need">${needStr} · ${r.cookMin < 60 ? r.cookMin + 'm' : (r.cookMin / 60) + 'h'} cook</small></div>
        <button class="btn small ${canStart ? '' : 'ghost'}" data-cook="${r.id}" ${canStart ? '' : 'disabled'}>${r.potion ? 'Brew' : 'Cook'}</button></div>`;
    };
    body.innerHTML = `
      <div class="kitchen-hero">
        <div class="kitchen-atmos"><span class="k-embers"></span><span class="k-steam l"></span><span class="k-steam r"></span></div>
        <div class="kitchen-hero-title">THE HAUNTED KITCHEN</div>
        <div class="kitchen-quote">Something is always simmering.</div>
      </div>
      <div class="cauldron-stage ${cauldronState}">
        <div class="cauldron">
          <div class="cauldron-brew"></div>
          <span class="c-bub c1"></span><span class="c-bub c2"></span><span class="c-bub c3"></span>
          <div class="cauldron-fire"></div>
        </div>
        <div class="cauldron-status">
          ${cook ? `<b>${recipeIconHtml(cook.recipe, 18)} ${esc(cook.recipe.name)}</b>
            ${cook.ready ? '<span class="cauldron-ready">Ready to serve!</span>'
              : `<div class="cook-bar"><i style="width:${pct}%"></i></div><small>${fmtCookTime(cook.remainingMs)} left · ${pct}%</small>`}`
            : '<b>The cauldron is cold</b><small>Pick a recipe below to get it bubbling.</small>'}
        </div>
        ${cook && cook.ready ? '<button class="btn cauldron-serve" id="collectDish">Serve it</button>' : ''}
      </div>
      ${buffs.length ? `<div class="sect-h">Active dishes</div>
        ${buffs.map(b => `<div class="crate-row"><span class="crate-ico">${b.icon}</span><div style="flex:1"><b>${esc(b.name)}</b><small>${esc(foodBuffLabel(b))}</small></div></div>`).join('')}` : ''}
      ${potionCount(potInv) ? `<div class="sect-h">Potion satchel · drink these mid-fight</div>
        <div class="ingredient-grid">${POTIONS.filter(p => potInv[p.id] > 0).map(p => `<div class="ing-cell"><span class="ing-ico">${p.icon}</span><span class="ing-n">${potInv[p.id]}</span><span class="ing-name">${esc(p.name)}</span></div>`).join('')}</div>` : ''}
      <div class="sect-h" style="display:flex;justify-content:space-between;align-items:center">Ingredients <button class="btn small ghost" id="forageBtn">Forage · 45${ICONS.coin(13)}</button></div>
      <div class="ingredient-grid">
        ${INGREDIENT_IDS.map(id => `<div class="ing-cell ${(inv[id] || 0) > 0 ? '' : 'empty'}"><span class="ing-ico">${ingIconHtml(id,26)}</span><span class="ing-n">${inv[id] || 0}</span><span class="ing-name">${esc(INGREDIENTS[id].name)}</span></div>`).join('')}
      </div>
      <div class="sect-h">Dishes · passive buffs for your next fights</div>
      ${RECIPES.map(recipeCard).join('')}
      <div class="sect-h">Potions · drink one mid-fight, any class</div>
      ${POTIONS.map(recipeCard).join('')}`;
    $('#collectDish', body)?.addEventListener('click', async () => {
      const dish = await collectDish();
      if (dish) {
        await award(`cook-${Date.now().toString(36)}`, 'cook', 8, `Cooked ${dish.name}`); // small XP + powers cooking quests
        confettiBurst(innerWidth / 2, innerHeight * 0.35, 20); levelSound(S.sounds);
        toast(dish.potion ? `${dish.icon} ${dish.name} brewed! Drink it mid-fight.` : `${dish.icon} ${dish.name} served! Buff active.`, 3200);
      }
      render();
    });
    $('#forageBtn', body)?.addEventListener('click', async () => {
      const FORAGE_COST = 45;
      if ((await coins()) < FORAGE_COST) { toast('Not enough coins to forage. Walk the Boneyard for free ingredients.', 3000); return; }
      await coinsAdd(-FORAGE_COST);
      const ing = COMMON_INGREDIENT_IDS[Math.floor(Math.random() * COMMON_INGREDIENT_IDS.length)];
      await grantIngredient(ing);
      popSound(S.sounds);
      toast(`Foraged ${INGREDIENTS[ing].icon} ${INGREDIENTS[ing].name}.`, 2400);
      render();
    });
    $$('[data-cook]', body).forEach(btn => btn.addEventListener('click', async () => {
      const res = await startCook(btn.dataset.cook);
      if (res.ok) { popSound(S.sounds); toast('Into the pot. Check back when it’s ready.', 2600); }
      else if (res.reason === 'busy') toast('The pot is already cooking something.');
      else toast('Not enough ingredients for that dish.');
      render();
    }));
  }
  await render();
  // live countdown while the sheet is open
  const timer = setInterval(() => { if (body.isConnected) render(); else clearInterval(timer); }, 1000);
}


// how the day's calorie target splits across meals (a per-meal cap you can see)
const MEAL_SPLIT = [0.25, 0.35, 0.30, 0.10]; // breakfast / lunch / dinner / snacks

function mealBlock(name, i, entries, yEntries, budget = 0) {
  const kcal = Math.round(dayTotals(entries).kcal);
  const over = budget > 0 && kcal > budget;
  return `<section class="meal">
    <div class="meal-head">
      <h2>${name}</h2>
      ${budget > 0
        ? `<span class="kcal ${over ? 'over' : ''}">${kcal.toLocaleString()} / ${budget.toLocaleString()}</span>`
        : (kcal ? `<span class="kcal">${kcal.toLocaleString()} kcal</span>` : '<span class="kcal"></span>')}
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
    toast(editing ? 'Saved' : `Added · ${Math.round(n.kcal)} kcal${game.xp ? ` · +${game.xp} XP` : ''}`);
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
    toast(entry ? 'Saved' : `Added · ${Math.round(kcal)} kcal${game.xp ? ` · +${game.xp} XP` : ''}`);
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
      <div class="scan-hint">Fill the box with the barcode · hold ~20 cm so it stays sharp</div>
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
      <div class="sheet-head"><h2>New food</h2><button class="sheet-close">Back</button></div>
      <div class="sheet-body">
        <p class="note" style="margin-bottom:14px">We couldn't find this barcode in the food databases (lots of packaged foods aren't listed). Snap the nutrition label instead, it takes a few seconds and it's yours forever after:</p>
        <button class="btn" id="missLabel">📷 Scan the nutrition label</button>
        <div style="height:8px"></div>
        <button class="btn ghost" id="missManual">Type it in manually</button>
        <p class="note" style="margin-top:12px;font-size:11.5px;opacity:.7">Barcode ${esc(code)}</p>
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
      <p class="note" style="margin-bottom:14px">Take a straight-on photo of the Nutrition Facts panel in good light. Boneheadz reads it on-device; nothing is uploaded.</p>
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
    <div class="big-stat"><span class="v">${(() => { const logged = days14.filter(d => d.tot.kcal > 0); return logged.length ? Math.round(logged.reduce((a, d) => a + d.tot.kcal, 0) / logged.length).toLocaleString() : '·'; })()}</span><span class="d">avg / logged day · target ${t.kcal.toLocaleString()}</span></div>
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
    if (!favs.length && !customs.length && !scanned.length) html += '<p class="note" style="text-align:center;padding:14px 20px 6px">Foods you scan, create, or favorite collect here.</p>';
    const sample = [...GENERIC_FOODS].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
    html += `<div class="sect-h">Built-in library · ${GENERIC_FOODS.length}</div>` + sample.map(foodRowHtml).join('');
    if (GENERIC_FOODS.length > sample.length) html += '<p class="note" style="text-align:center;padding:10px">Showing the first 40 A to Z. Search finds the rest.</p>';
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
  const apiConfigured = !!(await social.apiBase());
  const me = apiConfigured ? await social.socialMe() : null;
  el.innerHTML = `
  <h1 class="page-h1">Settings</h1>

  ${apiConfigured ? `
  <div class="card">
    <div class="card-title">THE CREW · ${me ? 'ONLINE' : 'GO ONLINE'}</div>
    ${me ? `
    <div class="crew-id">
      <div class="crew-handle">${esc(me.handle)}</div>
      <button class="crew-code" id="copyCode" title="Copy friend code">${esc(me.friendCode)} ⧉</button>
    </div>
    <p class="note" style="margin:8px 0 0">Share your friend code so friends can add you. Your game profile syncs when you open the app. Food logs, weight, and location never leave this phone. Your backup export carries your account: restore it on a new phone to keep this identity.</p>`
    : `
    <p class="note" style="margin:0 0 10px">Go online to join the Crew: friend codes, and soon trading and PvP. Only your game profile syncs (level, stats, outfit, gear, badges). Food logs, weight, and location <b>never</b> leave this phone.</p>
    <button class="btn" id="goOnlineBtn">Go Online</button>`}
  </div>` : ''}

  <div class="card">
    <div class="card-title">REDEEM A CODE</div>
    <p class="note" style="margin:0 0 10px">Got a code from a friend? Redeem it for a pet.</p>
    <div style="display:flex;gap:8px">
      <input id="redeemInput" type="text" placeholder="Enter code" autocapitalize="characters" autocomplete="off" style="flex:1;text-transform:uppercase">
      <button class="btn small" id="redeemBtn">Redeem</button>
    </div>
  </div>

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
    ${isNative() ? `
    <div class="settings-row">
      <div class="lab"><b>Steps, active energy, weight</b><span>${S.settings.hkConnected ? 'Connected · syncs automatically every time you open' : 'Connect once, then it syncs automatically'}</span></div>
      <button class="btn small ${S.settings.hkConnected ? 'ghost' : ''}" id="hkGuide">${S.settings.hkConnected ? 'Reconnect' : 'Connect'}</button>
    </div>
    ${S.settings.hkConnected ? '<button class="btn small ghost" id="hkSyncNow" style="margin-top:8px">Sync now</button>' : ''}` : `
    <div class="settings-row">
      <div class="lab"><b>Steps, active energy, weight</b><span>${S.settings.hkConnected ? 'Connected via your Sync Boneheadz shortcut' : 'Bridge from your Apple Watch via a one-time Shortcut'}</span></div>
      <button class="btn small ghost" id="hkGuide">${S.settings.hkConnected ? 'Guide' : 'Connect'}</button>
    </div>
    <button class="btn small ghost" id="hkSyncNow" style="margin-top:8px">Sync from clipboard now</button>`}
  </div>

  <div class="card">
    <div class="card-title">DATA</div>
    <div class="settings-row"><div class="lab"><b>Export backup</b><span>${exportAgo == null ? 'Never backed up yet' : exportAgo === 0 ? 'Last backup: today' : `Last backup: ${exportAgo} day${exportAgo === 1 ? '' : 's'} ago`}</span></div><button class="btn small ghost" id="exportBtn">Export</button></div>
    <div class="settings-row"><div class="lab"><b>Import backup</b><span>Restore from a Boneheadz Gym export</span></div><button class="btn small ghost" id="importBtn">Import</button></div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
    <div class="settings-row"><div class="lab"><b>Erase all data</b><span>Removes log, foods, weights</span></div><button class="btn small danger" id="eraseBtn">Erase</button></div>
  </div>

  <p class="note" style="text-align:center;margin-top:18px">
    Boneheadz Gym v4 · data lives only on this device<br>
    Food lookups: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> · <a href="https://fdc.nal.usda.gov" target="_blank" rel="noopener">USDA FoodData Central</a><br>
    Icons: <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a> (CC-BY 3.0)
  </p>`;

  $('#saveTargets').addEventListener('click', async () => {
    const kcal = num($('#tKcal').value), p2 = num($('#tP').value), c = num($('#tC').value), f = num($('#tF').value);
    if (!kcal || kcal < 800) { toast('Calorie target looks too low'); return; }
    S.settings.targets = { ...S.settings.targets, kcal: Math.round(kcal), p: Math.round(p2 || 0), c: Math.round(c || 0), f: Math.round(f || 0) };
    await kvSet('settings', S.settings);
    toast('Targets saved');
  });
  $('#goOnlineBtn', el)?.addEventListener('click', async () => {
    const btn = $('#goOnlineBtn', el);
    btn.disabled = true; btn.textContent = 'Connecting...';
    const r = await social.goOnline().catch(() => ({ ok: false, reason: 'network' }));
    if (!r.ok) { toast('Could not reach the Crew server. Try again in a bit.'); btn.disabled = false; btn.textContent = 'Go Online'; return; }
    confettiRain(70); levelSound(S.sounds);
    await social.syncProfile(await socialSnapshot(), APP_SOCIAL_V).catch(() => {});
    const pulled = await social.pullGrants().catch(() => null);
    toast(`You're online as ${r.me.handle}!${pulled && pulled.applied ? ' A welcome gift is in your Backpack.' : ''}`, 4200);
    renderSettings(el);
  });
  $('#copyCode', el)?.addEventListener('click', async () => {
    const me = await social.socialMe();
    try { await navigator.clipboard.writeText(me.friendCode); toast('Friend code copied. Send it to a friend!'); }
    catch { toast(me.friendCode, 4000); }
  });
  $('#redeemBtn', el)?.addEventListener('click', async () => {
    const res = await redeemCode($('#redeemInput', el).value);
    if (!res.ok) {
      toast(res.reason === 'used' ? 'That code was already redeemed.' : res.reason === 'invalid' ? "That code isn't valid." : 'Enter a code first.');
      return;
    }
    confettiBurst(innerWidth / 2, innerHeight * 0.35, 24); levelSound(S.sounds);
    toast(res.pet ? `${res.pet.name} unlocked! Equip it in your Wardrobe.${res.coins ? ` +${res.coins} coins.` : ''}`
      : `Code redeemed!${res.dupe ? ' (pet already owned — coins instead)' : ''}${res.coins ? ` +${res.coins} coins.` : ''}`, 3600);
    renderSettings(el);
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
  $('#hkGuide')?.addEventListener('click', openHealthGuide);
  $('#hkSyncNow')?.addEventListener('click', syncFromClipboard);
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
    if (!confirm('Erase ALL Boneheadz Gym data on this device? This cannot be undone.')) return;
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
    <img src="assets/brand/logo.png" alt="" style="width:150px;margin-bottom:14px">
    <h1>BONEHEADZ GYM</h1>
    <p class="tag">Feed the bones. Scan barcodes, photograph labels, and log meals in seconds while a very cool skeleton earns loot on your behalf. Private: your data never leaves this device.</p>
    <div class="feature">${ICONS.barcode.replace('<svg', '<svg class="fi"')}<div><b>Instant barcode scanning</b><span>Millions of packaged foods via Open Food Facts + USDA</span></div></div>
    <div class="feature">${ICONS.label.replace('<svg', '<svg class="fi"')}<div><b>Label camera</b><span>Photograph any Nutrition Facts panel, Boneheadz reads it on-device</span></div></div>
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
    const prev = S.celebration || {};
    S.celebration = {
      levelUp: game.levelUp || prev.levelUp,
      levelRewards: game.levelRewards || prev.levelRewards,
      streakMilestone: game.streakMilestone || prev.streakMilestone,
      newBadges: [...(prev.newBadges || []), ...(game.newBadges || [])],
    };
  }
}

// any XP source (steps, quests, pit, road) can level you up
addEventListener('bh-levelup', e => {
  queueCelebration({ levelUp: e.detail.levelUp, levelRewards: e.detail.rewards });
  maybeCelebrate();
});

const LEVELUP_LINES = [
  'Another level? I felt that in my femurs.',
  'New level, same beautiful skull.',
  'We grind, we rattle, we rise.',
  'Somewhere, the Marrow King just shivered.',
  'Level up! The bones are our money and business is BOOMING.',
  'Stronger bones, bigger drip. The system works.',
  'They said I had no guts. Look at me now. Still no guts.',
  'That XP went straight to my spine.',
];

function maybeCelebrate() {
  if (!S.celebration) return;
  const c = S.celebration;
  S.celebration = null;
  setTimeout(() => openCelebration(c), 380);
}

async function openCelebration({ levelUp = null, levelRewards = null, newBadges = [], streakMilestone = null }) {
  const bits = [];
  if (streakMilestone) bits.push(`<div class="cele-big">🔥 ${streakMilestone} days</div><div class="cele-sub">Streak milestone · +100 XP</div>`);
  for (const b of newBadges) bits.push(`<div class="cele-badge"><span>${badgeIconHtml(b.icon,26)}</span><div><b>${esc(b.name)}</b><small>${esc(b.desc)} · +25 XP</small></div></div>`);
  if (!levelUp && !bits.length) return;
  confettiRain();
  levelSound(S.sounds);
  let hero = '';
  if (levelUp) {
    const eq = await equipped();
    const line = LEVELUP_LINES[levelUp.level % LEVELUP_LINES.length];
    S.pendingLevelLine = line;
    hero = `
      <div class="lvlup-stage">
        <div class="lvl-rays"></div>
        <div class="bh-stage lg lvlup-avatar">${avatarLayersHtml(eq, { noYard: true, skip: ['BG'] })}</div>
      </div>
      <div class="lvl-stamp">LEVEL ${levelUp.level}!</div>
      <div class="cele-sub" style="font-size:16px;margin-top:2px">${esc(levelUp.name)}</div>
      <div class="cele-bubble">${esc(line)}</div>
      ${levelRewards ? `<div class="lvl-rewards">
        <span class="bh-pill">${ICONS.coin(15)} +${levelRewards.coins}</span>
        <span class="bh-pill">${crateIcon('golden', 15)} ${levelRewards.crates > 1 ? levelRewards.crates + ' Golden Crates' : 'Golden Crate'}</span>
      </div>` : ''}`;
  }
  const wrap = openSheet(`
    <div class="sheet-body" style="text-align:center;padding-top:${levelUp ? 10 : 26}px">
      ${hero || `<div style="font-size:44px;line-height:1">${streakMilestone ? '🔥' : '🏅'}</div>`}
      <div style="height:10px"></div>
      ${bits.join('<div style="height:14px"></div>')}
      <div style="height:22px"></div>
      <button class="btn" id="celeOk">${levelUp ? 'RATTLE ON' : 'Keep it going'}</button>
      <div style="height:6px"></div>
    </div>`);
  $('#celeOk', wrap).addEventListener('click', () => history.back());
}

function badgesGridHtml(earned, newIds = new Set()) {
  return `<div class="badge-grid">${BADGES.map(b => `
    <button class="badge ${earned.has(b.id) ? '' : 'locked'} ${newIds.has(b.id) ? 'new' : ''}" data-badge="${b.id}">
      <span class="bicon">${badgeIconHtml(b.icon,22)}</span>${esc(b.name)}
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
    <div class="sheet-body" id="chBody"></div>`, { cls: 'full', onClose: () => { if (currentTab() === 'today') refresh(); } });
  await renderCharacter(wrap, tab);
}

// Egg hatch: a bone egg wobbles, cracks spread, it bursts into shards and the
// pet rises out. reducedMotion / headless skip straight to the reveal.
function openHatchReveal(res, charWrap) {
  const item = res.item;
  const reduced = reducedMotion || navigator.webdriver;
  const shards = Array.from({ length: 8 }, (_, i) => `<span class="egg-shard" style="--a:${i * 45}deg"></span>`).join('');
  const stageHtml = item ? `
    <div class="hatch-stage${reduced ? ' burst' : ''}" id="hatchStage">
      <div class="hatch-glow"></div>
      <div class="hatch-flash"></div>
      <div class="bone-egg" id="boneEgg">
        <svg class="egg-cracks" viewBox="0 0 100 130" preserveAspectRatio="none" aria-hidden="true">
          <path class="ec" d="M50 8 L45 36 L55 58 L46 82"/>
          <path class="ec" d="M50 8 L59 32 L49 54"/>
          <path class="ec" d="M28 62 L46 68 L38 88 L54 100"/>
        </svg>
        ${shards}
      </div>
    </div>` : `<div class="hatch-stage"><div class="cele-big">All pets found!</div></div>`;
  const revealHtml = item
    ? `<div class="lvl-stamp" style="font-size:30px">IT HATCHED!</div>
       <div class="hatch-prize r-${item.rarity}">
         <img src="${bhAsset(item)}" alt="">
         <b>${esc(item.name)}</b>
         <small>Pet · follows your bonehead</small>
         <span class="rar-chip" style="color:${RARITIES[item.rarity].color}">${RARITIES[item.rarity].label}</span>
       </div>`
    : `<p class="note">+${res.coins} coins instead. Legend.</p>`;
  const wrap2 = openSheet(`
    <div class="sheet-body" style="text-align:center;padding-top:22px">
      ${stageHtml}
      <div class="hatch-reveal${reduced ? ' show' : ''}">
        ${revealHtml}
        <div style="height:16px"></div>
        <button class="btn" id="hatchOk">${item ? 'Adopt' : 'Nice'}</button>
      </div>
    </div>`);
  const stage = $('#hatchStage', wrap2);
  const revealEl = $('.hatch-reveal', wrap2);
  // once the pet is revealed, retire the egg cinematic so the pet is centred
  const finish = () => { if (stage) stage.style.display = 'none'; revealEl.classList.add('show'); confettiRain(80); levelSound(S.sounds); };
  if (reduced || !item) {
    finish();
  } else {
    const egg = $('#boneEgg', wrap2);
    const cracks = $$('.egg-cracks .ec', wrap2);
    hitSound(S.sounds, 'thud');
    [[520, 0], [960, 1], [1400, 2]].forEach(([t, i]) => setTimeout(() => {
      if (!egg.isConnected) return;
      egg.classList.remove('wob'); void egg.offsetWidth; egg.classList.add('wob');
      cracks[i]?.classList.add('draw');
      hitSound(S.sounds, 'thud');
    }, t));
    setTimeout(() => { if (stage.isConnected) { stage.classList.add('burst'); hitSound(S.sounds, 'zap'); } }, 1800);
    setTimeout(() => { if (revealEl.isConnected) finish(); }, 2350);
  }
  $('#hatchOk', wrap2).addEventListener('click', () => history.back());
  setTimeout(() => renderCharacter(charWrap, 'crates'), 400);
}

async function renderCharacter(wrap, tab, opts = {}) {
  const body = $('#chBody', wrap);
  if (!body) return;
  // instant re-renders come from an in-page action (equip, salvage, etc.): keep the
  // scroll position so equipping a piece doesn't bounce you back to the top. A tab
  // switch renders WITHOUT instant, so it still starts fresh at the top.
  const keepScroll = opts.instant ? body.scrollTop : null;
  const [xp, eq, coinBal, inv, boost] = await Promise.all([totalXp(), equipped(), coins(), inventory(), battleCharmCharges()]);
  const lvl = levelFor(xp);
  const crates = inv.filter(r => r.kind === 'crate').sort((a, b) => a.ts - b.ts);
  const freezes = inv.filter(r => r.kind === 'freeze').length;
  const boosts = inv.filter(r => r.kind === 'xp2').length;
  const ownedCount = inv.filter(r => r.kind === 'cos').length;
  const takenTal = await kvGet('talents', []);
  const unspentTal = Math.max(0, talentPoints(levelFor(xp).level) - takenTal.length);

  const curtains = false; // dressing-room curtains retired (Tom's call)
  body.innerHTML = `
    ${tab === 'wardrobe' ? `
    <div class="bh-hero mini">
      <div class="bh-hero-meta" style="justify-items:start">
        <b class="bh-title">Lv ${lvl.level} · ${esc(lvl.name)}</b>
        <div class="bh-pills">
          <span class="bh-pill">${ICONS.coin(14)} ${coinBal.toLocaleString()}</span>
<span class="bh-pill">${ICONS.bone(14)} ${ownedCount} found</span>
          ${boost ? `<span class="bh-pill">${ICONS.boltIco(14)} x${boost}</span>` : ''}
        </div>
      </div>
    </div>` : `
    <div class="bh-hero mini">
      <div class="bh-stage lg">${avatarLayersHtml(eq, { noYard: true })}</div>
      <div class="bh-hero-meta">
        <b class="bh-title">Lv ${lvl.level} · ${esc(lvl.name)}</b>
        <div class="xp-mini" style="width:110px"><i style="width:${lvl.pct}%"></i></div>
        <div class="bh-pills">
          <span class="bh-pill">${ICONS.coin(14)} ${coinBal.toLocaleString()}</span>
<span class="bh-pill">${ICONS.bone(14)} ${ownedCount} found</span>
          ${boost ? `<span class="bh-pill">${ICONS.boltIco(14)} x${boost}</span>` : ''}
        </div>
      </div>
    </div>`}
    <div class="ch-tabs" id="chTabs">
      <button class="chip ch-tab ${tab === 'wardrobe' ? 'on' : ''}" data-tab="wardrobe">${ICONS.bone(21)}<span>Wardrobe</span></button>
      <button class="chip ch-tab ${tab === 'crates' ? 'on' : ''}" data-tab="crates">${crateIcon('golden', 21)}<span>Backpack</span>${crates.length ? `<i class="ch-badge">${crates.length}</i>` : ''}</button>
      <button class="chip ch-tab ${tab === 'talents' ? 'on' : ''}" data-tab="talents">${ICONS.pit(21)}<span>Build</span>${unspentTal > 0 ? `<i class="ch-badge">${unspentTal}</i>` : ''}</button>
      <button class="chip ch-tab ${tab === 'progress' ? 'on' : ''}" data-tab="progress">${ICONS.star(21)}<span>Progress</span></button>
    </div>
    <div id="chContent"></div>`;

  $$('#chTabs .chip', body).forEach(c => c.addEventListener('click', () => renderCharacter(wrap, c.dataset.tab)));
  const content = $('#chContent', body);
  if (curtains) requestAnimationFrame(() => requestAnimationFrame(() => $$('.curt', body).forEach(x => x.classList.add('open'))));

  if (tab === 'wardrobe') {
    const owned = await ownedCosmeticIds();
    const [gOwnedSet, gearLo, fighter] = await Promise.all([ownedGearIds(), gearLoadout(), buildFighter()]);
    const wLevel = levelFor(await totalXp()).level;
    const slot = S.wardrobeSlot || 'H';
    const slotMeta = BH_SLOTS.find(s => s.code === slot);
    const items = BH_ITEMS.filter(i => i.slot === slot && owned.has(i.id));
    const gearItems = GEAR_ITEMS.filter(g => g.slot === slot && gOwnedSet.has(g.id));
    const lockedCount = BH_ITEMS.filter(i => i.slot === slot).length - items.length;

    const pdSlot = code => {
      const meta = BH_SLOTS.find(x => x.code === code);
      const isGearSlot = GEAR_SLOTS.includes(code);
      const g = isGearSlot ? GEAR_BY_ID[gearLo[code]] : null;
      const art = eq[code] && BH_BY_ID[eq[code]] ? BH_BY_ID[eq[code]] : null;
      const label = isGearSlot ? GEAR_SLOT_LABELS[code] : meta.label;
      return `<button class="pd-slot ${slot === code ? 'sel' : ''} ${g ? 'gear-on r-' + g.rarity : ''}" data-pd="${code}" title="${esc(label)}">
        ${art ? `<img src="${bhAsset(art)}" alt="" loading="lazy">` : '<span class="pd-empty">+</span>'}
        <span class="pd-tag">${esc(label)}</span>
        ${g ? `<span class="pd-gear">${gearLabel(g)}${g.talent ? ' ⚡' : ''}</span>` : ''}
      </button>`;
    };
    const LEFT = ['H', 'E', 'M', 'T', 'P'];
    const RIGHT = ['IR', 'IL', 'G', 'U', 'S'];
    const BOTTOM = ['SK', 'B', 'FW', 'C', 'BG', 'YD'];
    const statChip = m => {
      const gb = fighter.gearBonus[m.key] || 0;
      return `<span class="pd-stat"><small>${m.label}</small><b>${fighter.stats[m.key]}</b>${gb ? `<i>+${gb}</i>` : ''}</span>`;
    };

    content.innerHTML = `
      <div class="paperdoll">
        <div class="pd-col">${LEFT.map(pdSlot).join('')}</div>
        <div class="pd-center">
          <div class="bh-stage lg${curtains ? ' dressing' : ''}">${avatarLayersHtml(eq, { noYard: true })}${curtains ? '<div class="curt l"></div><div class="curt r"></div>' : ''}</div>
        </div>
        <div class="pd-col">${RIGHT.map(pdSlot).join('')}</div>
      </div>
      <div class="pd-bottom">${BOTTOM.map(pdSlot).join('')}</div>
      <div class="pd-stats">${STAT_META.map(statChip).join('')}</div>
      ${slot === 'C' && eq.C ? petPanelHtml(eq.C, fighter) : ''}
      <div class="sect-h" style="margin-top:10px">${esc(GEAR_SLOTS.includes(slot) ? GEAR_SLOT_LABELS[slot] : slotMeta.label)} · pick your fit</div>
      <div class="ward-grid">
        ${slotMeta.default || (!items.length && !gearItems.length) ? '' : `<button class="ward-cell none ${!eq[slot] ? 'equipped' : ''}" data-equip="">None</button>`}
        ${items.map(i => `
          <button class="ward-cell r-${i.rarity} ${eq[slot] === i.id && !gearLo[slot] ? 'equipped' : ''}" data-equip="${i.id}" title="${esc(i.name)}">
            <img src="${bhAsset(i)}" alt="${esc(i.name)}" loading="lazy">
          </button>`).join('')}
        ${gearItems.map(g => {
          const art = BH_BY_ID[g.artId];
          const locked = wLevel < g.minLevel;
          return `
          <button class="ward-cell gear r-${g.rarity} ${gearLo[slot] === g.id ? 'equipped' : ''} ${S.wardrobePreview === g.id ? 'selected' : ''} ${locked ? 'locked' : ''}" data-equipgear="${g.id}" title="${esc(g.name)}">
            <img src="${bhAsset(art)}" alt="${esc(g.name)}" loading="lazy">
            <span class="gear-stat">${gearLabel(g)}${g.talent ? ' ⚡' : ''}</span>
            ${locked ? `<span class="gear-lock">Lv ${g.minLevel}</span>` : ''}
          </button>`;
        }).join('')}
      </div>
      ${(() => {
        // Inspect panel: tap a gear cell to preview its full stats + special ability
        // (⚡ talent + what it does), then Equip. Falls back to the equipped piece.
        if (!GEAR_SLOTS.includes(slot)) return '';
        const pid = S.wardrobePreview;
        const ig = (pid && gearItems.find(x => x.id === pid)) ? GEAR_BY_ID[pid] : (gearLo[slot] ? GEAR_BY_ID[gearLo[slot]] : null);
        if (!ig) return '<p class="note" style="text-align:center;margin-top:10px">Tap a piece to inspect its stats and special ability.</p>';
        const locked = wLevel < ig.minLevel;
        const isEq = gearLo[slot] === ig.id;
        const rar = RARITIES[ig.rarity] || RARITIES.uncommon;
        return `<div class="gear-inspect r-${ig.rarity}">
          <img src="${bhAsset(BH_BY_ID[ig.artId])}" alt="">
          <div class="gi-body">
            <b>${esc(ig.name)}</b>
            <span class="gi-stats">${gearLabel(ig)}</span>
            ${ig.talent ? `<span class="gi-talent">⚡ ${esc(ig.talentName)}</span><small class="gi-desc">${esc(TALENT_DESC[ig.talent] || 'a special ability')}</small>` : '<small class="gi-desc">No special ability. Pure stats.</small>'}
            <span class="rar-chip" style="color:${rar.color}">${rar.label} · ${GEAR_SLOT_LABELS[ig.slot]}${ig.minLevel > 1 ? ` · Lv ${ig.minLevel}` : ''}</span>
          </div>
          <div class="gi-actions">
            <button class="btn gi-equip ${isEq ? 'ghost' : ''}" data-equipgear-commit="${ig.id}" ${isEq || locked ? 'disabled' : ''}>${isEq ? 'Equipped' : locked ? `Locked · Lv ${ig.minLevel}` : 'Equip this'}</button>
            <button class="btn danger gi-melt" data-melt-gear="${ig.id}">Melt · +${gearDustValue(ig)} dust</button>
          </div>
        </div>`;
      })()}
      ${GEAR_SLOTS.includes(slot) ? '<p class="note" style="text-align:center;margin-top:10px">Statted gear boosts your Pit fighter. Same look can roll different stats; ⚡ pieces grant a talent. Rarer rolls hit harder.</p>' : ''}
      ${lockedCount ? `<p class="note" style="text-align:center;margin-top:10px">More ${slotMeta.label.toLowerCase()} pieces are out there. Keep hunting.</p>` : ''}`;
    $$('[data-pd]', content).forEach(b => b.addEventListener('click', () => { S.wardrobeSlot = b.dataset.pd; S.wardrobePreview = null; renderCharacter(wrap, 'wardrobe', { instant: true }); }));
    $$('[data-equip]', content).forEach(cell => cell.addEventListener('click', async () => {
      await equip(slot, cell.dataset.equip || null);
      popSound(S.sounds);
      renderCharacter(wrap, 'wardrobe', { instant: true });
    }));
    // tapping a gear cell INSPECTS it (preview): the panel below shows its stats +
    // special ability. Tapping the already-selected piece, or the panel button, equips.
    $$('[data-equipgear]', content).forEach(cell => cell.addEventListener('click', async () => {
      const g = GEAR_BY_ID[cell.dataset.equipgear];
      if (!g) return;
      if (S.wardrobePreview === g.id && gearLo[slot] !== g.id) {
        if (wLevel < g.minLevel) { toast(`Locked: reach level ${g.minLevel} to wear ${g.name}.`, 2800); return; }
        await equipGear(slot, g.id);
        popSound(S.sounds);
        renderCharacter(wrap, 'wardrobe', { instant: true });
        return;
      }
      S.wardrobePreview = g.id;
      popSound(S.sounds);
      renderCharacter(wrap, 'wardrobe', { instant: true });
      requestAnimationFrame(() => $('.gear-inspect', content)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    }));
    $$('[data-equipgear-commit]', content).forEach(btn => btn.addEventListener('click', async () => {
      const g = GEAR_BY_ID[btn.dataset.equipgearCommit];
      if (!g || wLevel < g.minLevel) return;
      await equipGear(slot, g.id);
      levelSound(S.sounds);
      renderCharacter(wrap, 'wardrobe', { instant: true });
    }));
    $$('[data-melt-gear]', content).forEach(btn => btn.addEventListener('click', async () => {
      // arm-then-confirm so a piece is never melted by accident
      if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Tap again to melt'; setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = '0'; btn.textContent = `Melt · +${gearDustValue(GEAR_BY_ID[btn.dataset.meltGear])} dust`; } }, 2600); return; }
      const res = await disenchantGear(btn.dataset.meltGear);
      if (!res.ok) { toast('Could not melt that piece.'); return; }
      S.wardrobePreview = null;
      popSound(S.sounds);
      toast(`${res.name} melted into ${res.dust} Bone Dust.`, 2800);
      renderCharacter(wrap, 'wardrobe', { instant: true });
    }));
    $$('[data-petpick]', content).forEach(b => b.addEventListener('click', async () => {
      const petId = b.dataset.pet, tier = Number(b.dataset.tier), node = b.dataset.petpick;
      const meta = fighter.petMeta;
      if (!meta || meta.level < tier) { toast(`Pet reaches this at level ${tier}: keep walking.`, 2600); return; }
      const cur = await petPicks(petId);
      const tierNodes = (PET_TREES[familyOf(petId).key].find(t => t.tier === tier) || {}).opts.map(o => o.id);
      const next = [...cur.filter(id => !tierNodes.includes(id)), node]; // one pick per tier
      await setPetPick(petId, node, next);
      popSound(S.sounds);
      // update the highlight IN PLACE (a full re-render resets scroll and bounces
      // the view back up to the paperdoll); keep petMeta in sync for later renders
      $$(`.pet-opt[data-tier="${tier}"]`, content).forEach(o => o.classList.toggle('on', o.dataset.petpick === node));
      if (fighter.petMeta && fighter.petMeta.id === petId) fighter.petMeta.picks = next;
    }));
  }
  if (tab === 'talents') {
    content.innerHTML = '<div id="talBody" style="margin-top:6px"></div>';
    await renderTalents(content);
  }

  if (tab === 'crates') {
    await migrateLegacyEggs();
    const [invAll, lifeSteps, pendingLoot, ingInv, foodActive, cook, dust] = await Promise.all([inventory(), lifetimeStepsSum(), kvGet('denloot', []), ingredients(), activeFoodBuffs(), cookState(), boneDust()]);
    const eggs = invAll.filter(r => r.kind === 'egg').sort((a, b) => a.ts - b.ts);
    const ownedPets = invAll.filter(r => r.kind === 'cos' && BH_BY_ID[r.itemId] && BH_BY_ID[r.itemId].slot === 'C').map(r => BH_BY_ID[r.itemId]);
    content.innerHTML = `
      ${(pendingLoot || []).length ? `<div class="sect-h" style="margin-top:2px">Boss loot · tap to compare, keep one per drop</div>
      ${pendingLoot.map((p, i) => `
        <div class="loot-pending" data-lootkey="${esc(p.key)}">
          <small>${esc(p.den)} dropped:</small>
          <div class="loot-cards">${p.choices.map(id => GEAR_BY_ID[id] ? lootCardHtml(GEAR_BY_ID[id]) : '').join('')}</div>
          <button class="btn loot-keep" disabled>Tap a piece to preview</button>
        </div>`).join('')}` : ''}
      ${eggs.length ? `<div class="sect-h" style="margin-top:2px">Eggs · hatch by walking</div>
      ${eggs.map(e => {
        const p = eggProgress(e, lifeSteps);
        const pct = Math.min(100, Math.round(p.walked / p.goal * 100));
        return `<div class="crate-row egg-row">
          <span class="crate-ico">${crateIcon('egg', 27)}</span>
          <div style="flex:1">
            <b>${p.ready ? 'Ready to hatch!' : 'Incubating...'}</b>
            <div class="q-bar egg-bar"><i style="width:${pct}%"></i></div>
            <small>${p.walked.toLocaleString()} / ${p.goal.toLocaleString()} steps · a PET is inside</small>
          </div>
          ${p.ready ? `<button class="btn small" data-hatch="${e.id}">Hatch</button>` : `<span class="q-frac">${(p.goal - p.walked).toLocaleString()} to go</span>`}
        </div>`;
      }).join('')}` : ''}
      <div class="sect-h" style="margin-top:${eggs.length ? '14px' : '2px'}">Crates${crates.length ? ` · ${crates.length} to open` : ''}</div>
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
      <div class="crate-row"><span class="crate-ico">${CONSUMABLES.xp2.icon}</span><div style="flex:1"><b>Battle Charm</b><small>${CONSUMABLES.xp2.desc}</small></div>
        ${boosts ? `<button class="btn small ghost" id="useBoost">Activate (x${boosts})</button>` : `<span class="q-frac">x0</span>`}</div>
      ${boost ? `<p class="note" style="margin:6px 2px">${CONSUMABLES.xp2.icon} Charm active: ${boost} Pit win${boost === 1 ? '' : 's'} left at +25% coins</p>` : ''}
      <div class="sect-h">Kitchen · food &amp; buffs</div>
      ${(foodActive || []).length ? (foodActive.map(b => `<div class="crate-row"><span class="crate-ico">${b.icon || '🍲'}</span><div style="flex:1"><b>${esc(b.name || 'Dish')} active</b><small>${b.kind === 'combat' ? `${b.fightsLeft} fight${b.fightsLeft === 1 ? '' : 's'} left` : `${Math.max(0, Math.ceil((b.untilMs - Date.now()) / 3600e3))}h left`}</small></div></div>`).join('')) : '<p class="note" style="margin:2px 2px 6px">No dish active. Cook one in the Kitchen for a Pit or coin buff.</p>'}
      ${cook && cook.recipe ? `<div class="crate-row"><span class="crate-ico">${cook.ready ? '✅' : '🍳'}</span><div style="flex:1"><b>${cook.ready ? 'Dish ready!' : 'Cooking...'}</b><small>${esc(cook.recipe.name)}</small></div></div>` : ''}
      ${(() => { const owned = INGREDIENT_IDS.filter(id => (ingInv[id] || 0) > 0); return owned.length ? `<div class="ingredient-grid" style="margin-top:6px">${owned.map(id => `<div class="ing-cell"><span class="ing-ico">${ingIconHtml(id,26)}</span><span class="ing-n">${ingInv[id]}</span><span class="ing-name">${esc(INGREDIENTS[id].name)}</span></div>`).join('')}</div>` : '<p class="note" style="margin:2px 2px">No ingredients yet. Collect them on the Boneyard map.</p>'; })()}
      <button class="btn ghost small" id="bpKitchen" style="margin-top:8px">Open the Kitchen to cook</button>
      <div class="sect-h">Shop</div>
      <div class="grid2">
        ${SHOP.map(s => `<button class="shop-cell" data-buy="${s.id}" ${coinBal < s.cost ? 'disabled' : ''}>
          <span class="crate-ico">${s.id === 'crate-daily' ? crateIcon('daily', 26) : s.id === 'crate-golden' ? crateIcon('golden', 26) : consumableIcon(s.id, 26)}</span><b>${s.label}</b><small>${ICONS.coin(12)} ${s.cost}</small></button>`).join('')}
      </div>
      <div class="sect-h">Salvage Bench · nothing wasted</div>
      <div class="wallet-line"><span class="note">Bone Dust</span><b><span class="dust-ico">◆</span> ${dust.toLocaleString()}</b></div>
      <p class="note" style="margin:0 2px 8px">Melt unwanted gear in your Wardrobe (tap a piece, then Melt). Feed pets you don't want here. Bad drops and dupe eggs still pay off.</p>
      ${ownedPets.length ? ownedPets.map(p => `<div class="crate-row"><span class="crate-ico"><img src="${bhAsset(p)}" alt="" style="width:27px;height:27px;object-fit:contain"></span><div style="flex:1"><b>${esc(p.name)}</b><small>${RARITIES[p.rarity].label} pet</small></div><button class="btn small danger" data-salvage="${p.id}">+${petDustValue(p)} dust</button></div>`).join('') : '<p class="note" style="margin:2px 2px 8px">No pets to salvage. Hatch eggs by walking.</p>'}
      <div class="sect-h">Bone Dust Shop</div>
      <div class="grid2">
        ${DUST_SHOP.map(d => `<button class="shop-cell" data-dustbuy="${d.id}" ${dust < d.cost ? 'disabled' : ''}>
          <span class="crate-ico">${d.id === 'egg' ? crateIcon('egg', 26) : d.id === 'crate-daily' ? crateIcon('daily', 26) : consumableIcon(d.id, 26)}</span><b>${d.label}</b><small><span class="dust-ico">◆</span> ${d.cost}</small></button>`).join('')}
      </div>`;
    $$('.loot-pending', content).forEach(scope => {
      wireLootChoice(scope, gid => claimDenLoot(scope.dataset.lootkey, gid), picked => {
        toast(`${picked.name} claimed. Equip it in your Wardrobe.`, 3200);
        setTimeout(() => renderCharacter(wrap, 'crates'), 900);
      });
    });
    $$('[data-hatch]', content).forEach(b => b.addEventListener('click', async () => {
      const res = await hatchEgg(b.dataset.hatch);
      if (!res.ready) { toast('Keep walking: this egg is not ready yet.'); return; }
      openHatchReveal(res, wrap);
    }));
    $$('[data-open]', content).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      const result = await openCrate(b.dataset.open);
      await openCrateReveal(result);
      renderCharacter(wrap, 'crates');
    }));
    $('#useBoost', content)?.addEventListener('click', async () => {
      if (await activateBattleCharm()) { popSound(S.sounds); toast('Battle Charm active: your next 5 Pit wins pay +25% coins'); }
      renderCharacter(wrap, 'crates');
    });
    $$('[data-salvage]', content).forEach(btn => btn.addEventListener('click', async () => {
      // arm-then-confirm: pets are earned, so never salvage on a stray tap
      if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; const t = btn.textContent; btn.textContent = 'Tap to confirm'; setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = '0'; btn.textContent = t; } }, 2600); return; }
      const res = await salvagePet(btn.dataset.salvage);
      if (!res.ok) { toast('Could not salvage that pet.'); return; }
      popSound(S.sounds);
      toast(`${res.name} salvaged into ${res.dust} Bone Dust.`, 2800);
      renderCharacter(wrap, 'crates');
    }));
    $$('[data-dustbuy]', content).forEach(btn => btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await buyWithDust(btn.dataset.dustbuy);
      if (!res.ok) { toast(res.reason === 'dust' ? `Need ${res.need} Bone Dust (you have ${res.have}).` : 'Could not buy that.'); btn.disabled = false; return; }
      popSound(S.sounds);
      toast(res.id === 'egg' ? 'Egg incubating. Walk to hatch it.' : res.id === 'crate-daily' ? 'Daily Crate added. Open it above.' : 'Added to your consumables.', 2800);
      renderCharacter(wrap, 'crates');
    }));
    $('#bpKitchen', content)?.addEventListener('click', () => { history.back(); setTimeout(openKitchen, 250); });
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
  // restore scroll for in-page re-renders (equip/salvage) so the view doesn't jump
  if (keepScroll != null) {
    body.scrollTop = keepScroll;
    requestAnimationFrame(() => { body.scrollTop = keepScroll; });
  }
}

// kept as an alias: some entry points still ask for "progress"
function openProgressSheet() { return openCharacter('progress'); }

// what each gear-granted talent actually DOES (so loot can be compared, not just named)
const TALENT_DESC = Object.fromEntries(TALENT_TREES.flatMap(t => t.nodes.map(n => [n.id, n.desc])));

function lootCardHtml(g) {
  const rar = RARITIES[g.rarity] || RARITIES.uncommon;
  return `<button class="loot-card r-${g.rarity}" data-gear="${g.id}" aria-pressed="false">
    <img src="${bhAsset(BH_BY_ID[g.artId])}" alt="">
    <b>${esc(g.name)}</b>
    <span class="loot-stats">${gearLabel(g)}</span>
    ${g.talent ? `<span class="loot-talent">⚡ ${esc(g.talentName)}</span><span class="loot-talent-desc">${esc(TALENT_DESC[g.talent] || 'special ability')}</span>` : ''}
    <span class="rar-chip" style="color:${rar.color}">${rar.label} · ${GEAR_SLOT_LABELS[g.slot]}${g.minLevel > 1 ? ` · Lv ${g.minLevel}` : ''}</span>
  </button>`;
}

// Select-then-confirm for a boss loot drop: tapping a card PREVIEWS/selects it
// (never commits), an explicit Keep button claims. `scope` wraps the .loot-cards
// + a .loot-keep button. claimFn(gearId) -> picked|null; onDone(picked) after.
function wireLootChoice(scope, claimFn, onDone) {
  const cards = $$('.loot-card', scope);
  const keep = $('.loot-keep', scope);
  let sel = null, busy = false;
  const select = card => {
    sel = card.dataset.gear;
    cards.forEach(c => { const on = c === card; c.classList.toggle('selected', on); c.setAttribute('aria-pressed', on); });
    if (keep) { keep.disabled = false; keep.textContent = `Keep ${GEAR_BY_ID[sel] ? GEAR_BY_ID[sel].name : 'this piece'}`; }
  };
  cards.forEach(card => card.addEventListener('click', () => { if (!busy && !card.classList.contains('taken')) select(card); }));
  keep?.addEventListener('click', async () => {
    if (!sel || busy) return;
    busy = true;
    const picked = await claimFn(sel);
    if (!picked) { busy = false; return; }
    cards.forEach(c => { const won = c.dataset.gear === sel; c.classList.toggle('taken', won); c.classList.remove('selected'); c.disabled = true; });
    if (keep) { keep.disabled = true; keep.textContent = `${picked.name} kept`; }
    confettiBurst(innerWidth / 2, innerHeight * 0.4, 22);
    popSound(S.sounds);
    onDone?.(picked);
  });
}

function petPanelHtml(petId, fighter) {
  const fam = familyOf(petId);
  const meta = fighter.petMeta && fighter.petMeta.id === petId ? fighter.petMeta : { level: petLevel(0), picks: [] };
  const lvl = meta.level, picks = meta.picks;
  const tree = PET_TREES[fam.key];
  const passives = { yourDamage: 'your attacks hit harder', damageTaken: 'you take less damage', hypeGain: 'you build Hype faster' };
  return `
    <div class="pet-card r-${(BH_BY_ID[petId] || {}).rarity || 'common'}">
      <img src="${bhAsset(BH_BY_ID[petId])}" alt="">
      <div class="pet-card-meta">
        <b>${esc(fam.name)} <span class="pet-role" style="color:${fam.color}">${fam.role}</span></b>
        <small>Pet level ${lvl}${lvl < 6 ? ' · walk to grow' : ' · maxed'}</small>
        <span class="note" style="font-size:11.5px">${esc(fam.blurb)} Passive: ${passives[fam.passive]}.</span>
      </div>
    </div>
    <div class="pet-tree">
      ${tree.map(row => `
        <div class="pet-tier ${lvl >= row.tier ? '' : 'locked'}">
          <span class="pet-tier-lbl">Lv ${row.tier}${lvl < row.tier ? ' · locked' : ''}</span>
          <div class="pet-opts">
            ${row.opts.map(o => `<button class="pet-opt ${picks.includes(o.id) ? 'on' : ''}" data-pet="${petId}" data-tier="${row.tier}" data-petpick="${o.id}" ${lvl < row.tier ? 'disabled' : ''}>
              <b>${esc(o.name)}</b><small>${esc(o.desc)}</small></button>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

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
          if (r.type === 'ingredient') {
            const ing = INGREDIENTS[r.ingredient];
            return `<div class="reveal-card r-common"><span class="reveal-ico">${ingIconHtml(ing.id,34)}</span><div><b>${esc(ing.name)}</b><small>Cooking ingredient</small></div></div>`;
          }
          if (r.type === 'gear' || r.type === 'geardupe') {
            const g = r.gear, grar = RARITIES[g.rarity];
            const dup = r.type === 'geardupe';
            return `<div class="reveal-card gear r-${g.rarity}"><img src="${bhAsset(BH_BY_ID[g.artId])}" alt=""><div><b>${esc(g.name)}</b><small>${dup ? `Duplicate → +${r.coins}${ICONS.coin(11)}` : `GEAR · ${gearLabel(g)}${g.minLevel > 1 ? ` · Lv ${g.minLevel}` : ''}`}</small><span class="rar-chip" style="color:${grar.color}">${grar.label}</span></div></div>`;
          }
          const rar = RARITIES[r.item.rarity];
          if (r.type === 'dupe') {
            return `<div class="reveal-card r-${r.item.rarity}"><img src="${bhAsset(r.item)}" alt=""><div><b>${esc(r.item.name)}</b><small>Duplicate → +${r.coins}${ICONS.coin(11)}</small><span class="rar-chip" style="color:${rar.color}">${rar.label}</span></div></div>`;
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
  await checkPetLevelUp();
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

// Pets level up from walking; when a new tier unlocks (Lv 2/4/6) the player
// earns a pet talent to pick. Make that obvious with a toast + celebration.
// First sighting records silently (no retroactive spam).
async function checkPetLevelUp() {
  const eq = await equipped();
  if (!eq.C) return;
  const cur = petLevel(await petStepsSince(eq.C));
  const seen = (await kvGet('petSeenLevel', {})) || {};
  const prev = seen[eq.C];
  if (prev == null) { seen[eq.C] = cur; await kvSet('petSeenLevel', seen); return; }
  if (cur <= prev) return;
  const newTalent = unlockedTiers(cur).length > unlockedTiers(prev).length;
  seen[eq.C] = cur; await kvSet('petSeenLevel', seen);
  const petName = (BH_BY_ID[eq.C] && BH_BY_ID[eq.C].name) || 'Your pet';
  if (newTalent) {
    confettiRain(60); levelSound(S.sounds);
    toast(`🐾 ${petName} reached Lv ${cur} and unlocked a new talent — pick it in Wardrobe (tap your pet)!`, 4600);
  } else {
    popSound(S.sounds);
    toast(`🐾 ${petName} reached Lv ${cur}!`, 3000);
  }
}

async function ingestHkFromUrl() {
  const h = location.hash || '';
  if (!h.startsWith('#/hk')) return;
  const payload = parseHkPayload(decodeURIComponent(h));
  history.replaceState(null, '', location.pathname + location.search + '#/today');
  if (payload) await ingestHealth(payload, { celebrate: true });
  else toast('Could not read the Health sync link');
}

let lastNativeSync = 0;
async function nativeSyncNow({ silent = false } = {}) {
  try {
    const r = await nativeQueryToday();
    if (!r || (r.steps == null && r.activeKcal == null)) return false;
    lastNativeSync = Date.now();
    const payload = { date: r.date, steps: r.steps ?? null, activeKcal: r.activeKcal ?? null, weightKg: r.weightKg ?? null };
    await ingestHealth(payload, { celebrate: !silent });
    if (!S.settings.hkConnected || S.settings.hkNative !== true) {
      S.settings.hkConnected = true; S.settings.hkNative = true;
      await kvSet('settings', S.settings);
    }
    return true;
  } catch { return false; }
}

async function nativeAutoSync() {
  if (!isNative() || !S.settings?.hkNative) return;
  if (Date.now() - lastNativeSync < 10 * 60e3) return; // at most every 10 min
  const ok = await nativeSyncNow({ silent: true });
  if (ok && currentTab() === 'today') refresh();
}

async function connectNativeHealth() {
  if (!(await nativeHealthAvailable())) { toast('Health is not available on this device'); return; }
  const granted = await nativeRequestAuth();
  if (!granted) { toast('Health permission was not granted. You can enable it in iOS Settings > Health.', 3600); return; }
  S.settings.hkConnected = true; S.settings.hkNative = true;
  await kvSet('settings', S.settings);
  await nativeSyncNow({ silent: false });
  toast('Apple Health connected. Boneheadz now syncs automatically.', 3400);
  closeAllSheetsViaHistory();
  setTimeout(refresh, 120);
}

async function syncFromClipboard() {
  if (isNative()) { const ok = await nativeSyncNow(); if (ok) refresh(); else toast('Nothing to sync yet today.'); return; }
  try {
    const text = await navigator.clipboard.readText();
    const payload = parseHkPayload(text);
    if (!payload) {
      toast('No sync data on the clipboard. Run your "Sync Boneheadz" shortcut first.', 3400);
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
  if (isNative()) {
    const wrap = openSheet(`
      <div class="sheet-head"><h2>Connect Apple Health</h2><button class="sheet-close">Done</button></div>
      <div class="sheet-body">
        <p class="note" style="margin-bottom:14px">One tap. iOS will ask permission to share your steps, active energy, and weight. After that, Boneheadz syncs automatically every time you open it: no shortcuts, no clipboard.</p>
        <button class="btn" id="nativeConnect">Connect Apple Health</button>
      </div>`);
    $('#nativeConnect', wrap).addEventListener('click', connectNativeHealth);
    return;
  }
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Connect Apple Health</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <p class="note" style="margin-bottom:14px">Apple only lets real apps read Health directly, so Boneheadz uses a tiny companion shortcut. Good news: it's pre-built. No assembly required.</p>
      <div class="sect-h">One-time setup (about 20 seconds)</div>
      <ol class="guide">
        <li>Tap the button below, then <b>Open in Shortcuts</b> and <b>Add Shortcut</b></li>
        <li>Run <b>Sync Boneheadz</b> once and allow Health access (steps + active energy)</li>
        <li>Come back here and tap <b>Sync</b>, then allow the paste</li>
      </ol>
      <div style="height:10px"></div>
      <a class="btn" id="getShortcutBtn" href="https://www.icloud.com/shortcuts/53ce57388e954d16812509ea81c6a56a" rel="noopener" style="text-decoration:none">Get the shortcut</a>
      <div style="height:8px"></div>
      <button class="btn ghost" id="hkTrySync">I ran it, sync now</button>
      <p class="note" style="margin-top:8px;text-align:center">Opens the Shortcuts app via iCloud. <a href="assets/shortcut/Sync-Boneheadz.shortcut" download="Sync-Boneheadz.shortcut">Direct file</a> if you prefer Safari downloads.</p>
      <div class="sect-h">Every day after that</div>
      <p class="note">Run it any time with "Hey Siri, Sync Boneheadz", or automate it: Shortcuts app → Automation → New → Time of Day (e.g. 9:00 PM) → Run Immediately → Sync Boneheadz. Then Boneheadz picks it up next time you open it and tap Sync.</p>
      <details style="margin-top:14px">
        <summary class="note" style="cursor:pointer">Prefer to build the shortcut by hand?</summary>
        <ol class="guide" style="margin-top:10px">
          <li>Shortcuts app → <b>+</b> → name it <b>Sync Boneheadz</b></li>
          <li><b>Find Health Samples</b>: Type <b>Steps</b>, filter <b>Start Date is today</b></li>
          <li><b>Calculate Statistics</b>: <b>Sum</b></li>
          <li>Repeat steps 2-3 for Type <b>Active Calories</b></li>
          <li><b>Text</b>: <span class="code-line" style="display:inline;padding:2px 8px">${esc(HK_TEMPLATE)}</span> inserting the two Sum variables</li>
          <li><b>Copy to Clipboard</b></li>
        </ol>
      </details>
      <div style="height:8px"></div>
    </div>`, { cls: 'full' });
  $('#hkTrySync', wrap).addEventListener('click', syncFromClipboard);
}

/* ================= the boneyard (gps hunt) ================= */

let huntWatchId = null;
let huntStopOrient = null;
function stopHuntWatch() {
  if (huntWatchId != null && navigator.geolocation) navigator.geolocation.clearWatch(huntWatchId);
  huntWatchId = null;
}

async function openMap() {
  const eq = await equipped();
  let map = null, maplibregl = null;
  let cleanupExtras = () => {};
  const cleanup = () => {
    stopHuntWatch();
    if (huntStopOrient) huntStopOrient();
    cleanupExtras();
    try { map?.remove(); } catch { /* already gone */ }
    map = null;
  };
  const wrap = openSheet(`
    <div class="sheet-head"><h2>The Boneyard</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body map-sheet">
      <div id="mapBody">
        <div id="mapIntro" style="padding:16px 16px 0">
          <p class="note" style="margin-bottom:6px">The Boneyard is your real neighborhood, skinned for skeletons. Fresh spawns appear around you every day: walk within ${COLLECT_RADIUS_M} m of one and collect it.</p>
          <p class="note" style="margin-bottom:14px">Your location is used on this phone only, never stored, never uploaded. Spawns are computed on-device; the map itself loads over the network.</p>
          <button class="btn" id="mapStart">Open the map</button>
          <div class="card" style="margin-top:16px">
            <div class="card-title">OUT THERE TODAY</div>
            <div class="legend-row"><span class="blip-dot" style="background:#f2e9d7"></span><div><b>Bone cache</b><span class="note"> · XP for your bonehead</span></div></div>
            <div class="legend-row"><span class="blip-dot" style="background:var(--amber)"></span><div><b>Coin pile</b><span class="note"> · spend in the crate shop</span></div></div>
            <div class="legend-row"><span class="blip-dot" style="background:#b48ead"></span><div><b>Buried crate</b><span class="note"> · a wearable inside</span></div></div>
            <div class="legend-row"><span class="blip-dot rare"></span><div><b>RARE</b><span class="note"> · shiny cosmetic, one-day-only spawn</span></div></div>
          </div>
        </div>
      </div>
    </div>`, { cls: 'full', onClose: cleanup });

  const body = $('#mapBody', wrap);
  let heading = null, headingSeen = false;
  const onOrient = e => {
    const h = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.alpha != null ? 360 - e.alpha : null);
    if (h == null || Number.isNaN(h)) return;
    heading = h; headingSeen = true;
    const cone = $('.map-cone', body);
    if (cone) { cone.hidden = false; cone.style.transform = `rotate(${Math.round(h)}deg)`; }
  };
  const stopOrient = () => removeEventListener('deviceorientation', onOrient);
  huntStopOrient = stopOrient;

  async function startMap() {
    stopHuntWatch();
    if (!('geolocation' in navigator)) { body.innerHTML = '<p class="warn" style="margin:16px">This device has no location support.</p>'; return; }
    // compass permission must be requested inside this tap
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(st => { if (st === 'granted') addEventListener('deviceorientation', onOrient); }).catch(() => {});
      } else if (typeof DeviceOrientationEvent !== 'undefined') {
        addEventListener('deviceorientation', onOrient);
      }
    } catch { /* no compass */ }
    body.innerHTML = '<p class="note" style="text-align:center;padding:40px 0">Raising the map from the dirt...</p>';

    let boot;
    try {
      [maplibregl, boot] = await Promise.all([
        loadMaplibre(),
        new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 })),
      ]);
    } catch (err) {
      const geoErr = err && typeof err.code === 'number';
      body.innerHTML = `<p class="warn" style="margin:16px">${geoErr && err.code === 1
        ? 'Location permission denied. Allow location for this app in iOS Settings, then try again.'
        : geoErr ? 'No location fix yet. Step outside or near a window and retry.'
        : 'The map could not load. The Boneyard needs a network signal; your spawns are safe and will be here when you are back online.'}</p><button class="btn ghost" id="mapRetry" style="margin:0 16px">Retry</button>`;
      $('#mapRetry', body)?.addEventListener('click', startMap);
      return;
    }

    let lat = boot.coords.latitude, lng = boot.coords.longitude;
    body.innerHTML = `
      <div class="map-stage" id="mapStage">
        <div class="map-canvas" id="mapCanvas"></div>
        <div class="map-attrib">© OpenStreetMap</div>
        <button class="map-recenter" id="mapRecenter" hidden>⌖</button>
        <div class="map-readout" id="mapReadout"><span class="spin" style="display:inline-block;vertical-align:-3px"></span>  Reading the bones...</div>
        <button class="btn map-den" id="mapDen" hidden>Enter the den</button>
        <button class="btn map-mini" id="mapMini" hidden>Fight</button>
        <button class="btn map-collect" id="mapCollect" hidden>Collect</button>
      </div>`;

    let loaded = false, follow = true;
    try {
      map = createBoneyardMap(maplibregl, $('#mapCanvas', body), { lat, lng });
    } catch (e) {
      body.innerHTML = `<p class="warn" style="margin:16px">The map renderer could not start on this device.</p>`;
      return;
    }
    if (navigator.webdriver) window.__map = map;
    map.on('load', () => { loaded = true; map.resize(); });
    // the sheet lays out while the map initializes: keep canvas matched to stage
    const stageEl = $('#mapStage', body);
    requestAnimationFrame(() => requestAnimationFrame(() => map && map.resize()));
    const ro = new ResizeObserver(() => { try { map && map.resize(); } catch { /* gone */ } });
    ro.observe(stageEl);
    const prevCleanupRO = cleanupExtras;
    cleanupExtras = () => { prevCleanupRO(); try { ro.disconnect(); } catch { /* noop */ } };
    map.once('error', e => {
      if (!loaded) {
        body.innerHTML = `<p class="warn" style="margin:16px">The Boneyard needs a network signal to draw the map. Your spawns are safe; try again when you are back online.</p><button class="btn ghost" id="mapRetry" style="margin:0 16px">Retry</button>`;
        $('#mapRetry', body)?.addEventListener('click', startMap);
      }
    });
    map.on('dragstart', () => { follow = false; const r = $('#mapRecenter', body); if (r) r.hidden = false; });
    $('#mapRecenter', body).addEventListener('click', () => {
      follow = true; $('#mapRecenter', body).hidden = true;
      map.easeTo({ center: [lng, lat], zoom: MAP_START_ZOOM, duration: 700 });
    });

    // player marker: mini bonehead + facing cone
    const youEl = document.createElement('div');
    youEl.className = 'map-you';
    youEl.innerHTML = `<div class="map-cone" hidden></div><div class="map-you-av">${avatarLayersHtml(eq, { noYard: true, skip: ['BG'] })}</div>`;
    const youMarker = domMarker(maplibregl, map, { lat, lng, el: youEl });
    const youWalk = attachWalk($('.map-you-av', youEl)); // puppet walk while GPS fixes move

    const date = dateKey();
    const week = isoWeekKey();
    const xpRows0 = await db.all('xp');
    const collected = new Set(xpRows0.filter(r => r.type === 'spawn').map(r => r.key));
    let claimedBoss = new Set(xpRows0.filter(r => r.type === 'boss').map(r => r.key));
    let claimedMini = new Set(xpRows0.filter(r => r.type === 'mini').map(r => r.key));
    const spawnMarkers = new Map(); // id -> {marker, el, spawn}
    const spawnSnap = new Map();    // id -> {lat,lng} snapped onto walkable ground
    const denMarkers = new Map();   // id -> {marker, el, den}
    const miniMarkers = new Map();  // id -> {marker, el, mini}
    let lastNearest = null;

    function refreshDens() {
      const dens = densNear(week, lat, lng);
      for (const d of dens) {
        let rec = denMarkers.get(d.id);
        if (!rec) {
          const el = document.createElement('div');
          el.className = 'map-den-mark';
          el.innerHTML = `<span class="den-eyes"><i></i><i></i></span><img src="assets/brand/tombstone.png" alt=""><span class="den-skulls">${'☠'.repeat(Math.min(3, 1 + Math.floor(d.tier / 3)))}</span>`;
          rec = { marker: domMarker(maplibregl, map, { lat: d.lat, lng: d.lng, el, anchor: 'bottom' }), el, den: d };
          denMarkers.set(d.id, rec);
        }
        rec.den = d;
        rec.el.classList.toggle('claimed', claimedBoss.has(denKey(week, d)));
        rec.el.classList.toggle('inrange', d.dist <= DEN_RADIUS_M && !claimedBoss.has(denKey(week, d)));
        rec.el.classList.toggle('big', d.tier >= 4);
      }
      const openDen = dens.find(d => d.dist <= DEN_RADIUS_M && !claimedBoss.has(denKey(week, d)));
      const db2 = $('#mapDen', body);
      if (db2) {
        db2.hidden = !openDen;
        if (openDen) { db2.textContent = `☠ Enter ${openDen.name}`; db2.dataset.denId = openDen.id; }
      }
      return dens;
    }

    function refreshMinis() {
      const minis = minisNear(date, lat, lng);
      const liveIds = new Set(minis.map(m => m.id));
      for (const [id, rec] of miniMarkers) { if (!liveIds.has(id)) { rec.marker.remove(); miniMarkers.delete(id); } }
      for (const m of minis) {
        let rec = miniMarkers.get(m.id);
        if (!rec) {
          const el = document.createElement('div');
          el.className = 'map-mini-mark';
          el.innerHTML = `<span class="mini-glyph">☠</span>`;
          rec = { marker: domMarker(maplibregl, map, { lat: m.lat, lng: m.lng, el, anchor: 'center' }), el, mini: m };
          miniMarkers.set(m.id, rec);
        }
        rec.mini = m;
        rec.el.classList.toggle('claimed', claimedMini.has(miniKey(date, m)));
        rec.el.classList.toggle('inrange', m.dist <= MINI_RADIUS_M && !claimedMini.has(miniKey(date, m)));
        rec.el.classList.toggle('t2', m.tier >= 2);
      }
      const open = minis.find(m => m.dist <= MINI_RADIUS_M && !claimedMini.has(miniKey(date, m)));
      const mb = $('#mapMini', body);
      if (mb) {
        // den takes precedence over a mini if both are in range (bosses are the event)
        const denOpen = !$('#mapDen', body)?.hidden;
        mb.hidden = !open || denOpen;
        if (open && !denOpen) { mb.textContent = `⚔ Fight the ${open.name}`; mb.dataset.miniId = open.id; }
      }
    }

    async function refreshWorld() {
      const rows = await db.all('xp');
      claimedBoss = new Set(rows.filter(r => r.type === 'boss').map(r => r.key));
      claimedMini = new Set(rows.filter(r => r.type === 'mini').map(r => r.key));
      refreshSpawns();
      refreshDens();
      refreshMinis();
    }

    function refreshSpawns() {
      const live = spawnsNear(date, lat, lng).filter(s => !collected.has(spawnKey(date, s)));
      // Snap each spawn onto the nearest walkable feature (road/path/park) so none
      // sit in a backyard or building. The seeded anchor (ledger key) is untouched;
      // only the shown + collectible position moves. Cached per id once found.
      if (map.loaded()) {
        const c = map.getCanvas();
        for (const s of live) {
          let snap = spawnSnap.get(s.id);
          if (!snap) {
            const pt = map.project([s.lng, s.lat]);
            if (pt.x > -60 && pt.y > -60 && pt.x < c.clientWidth + 60 && pt.y < c.clientHeight + 60) {
              const feats = map.queryRenderedFeatures([[pt.x - 55, pt.y - 55], [pt.x + 55, pt.y + 55]]);
              snap = snapToWalkable({ lat: s.lat, lng: s.lng }, feats, 40);
              if (snap) spawnSnap.set(s.id, snap);
            }
          }
          if (snap) { s.lat = snap.lat; s.lng = snap.lng; s.dist = distanceM(lat, lng, s.lat, s.lng); s.bearing = bearingDeg(lat, lng, s.lat, s.lng); }
        }
        live.sort((a, b) => a.dist - b.dist);
      }
      const liveIds = new Set(live.map(s => s.id));
      for (const [id, rec] of spawnMarkers) {
        if (!liveIds.has(id)) { rec.marker.remove(); spawnMarkers.delete(id); }
      }
      for (const s of live) {
        let rec = spawnMarkers.get(s.id);
        if (!rec) {
          const el = document.createElement('div');
          el.className = `map-spawn ${s.type === 'rare' ? 'rare' : ''}`;
          el.innerHTML = `${spawnIcon(s.type, 20)}<span class="spawn-ing">${ingIconHtml(spawnIngredient(s).id,15)}</span>`;
          rec = { marker: domMarker(maplibregl, map, { lat: s.lat, lng: s.lng, el }), el, spawn: s };
          spawnMarkers.set(s.id, rec);
        } else {
          rec.marker.setLngLat([s.lng, s.lat]); // keep marker on its snapped position
        }
        rec.spawn = s;
        rec.el.classList.toggle('inrange', s.dist <= COLLECT_RADIUS_M);
      }
      // readout + collect button
      const nearest = live.length ? live.reduce((a, b) => (a.dist < b.dist ? a : b)) : null;
      let trend = '';
      if (nearest && lastNearest && lastNearest.id === nearest.id) {
        const d = nearest.dist - lastNearest.dist;
        if (d <= -2) trend = ' · getting closer!';
        else if (d >= 2) trend = ' · getting farther';
      }
      if (nearest) lastNearest = { id: nearest.id, dist: nearest.dist };
      const ro = $('#mapReadout', body);
      if (ro) ro.innerHTML = nearest
        ? `<b>${SPAWN_TYPES[nearest.type].label}</b> ${(() => { const ing = INGREDIENTS[spawnIngredient(nearest).id]; return `<span class="ro-ing">${ingIconHtml(ing.id,15)} ${esc(ing.name)}</span>`; })()} · ${nearest.dist <= COLLECT_RADIUS_M ? '<b style="color:var(--accent)">IN RANGE!</b>' : `${fmtDist(nearest.dist)} ${compassLabel(nearest.bearing)} ${bearingArrow(nearest.bearing)}${trend}`}`
        : 'All spawns collected. Legend. Fresh bones at midnight.';
      const btn = $('#mapCollect', body);
      const inRange = nearest && nearest.dist <= COLLECT_RADIUS_M;
      if (btn) {
        btn.hidden = !inRange;
        if (inRange) btn.textContent = `Collect ${SPAWN_TYPES[nearest.type].label}`;
        btn.dataset.spawnId = inRange ? nearest.id : '';
      }
    }

    $('#mapDen', body).addEventListener('click', async () => {
      const id = $('#mapDen', body).dataset.denId;
      const rec = denMarkers.get(id);
      if (!rec || rec.den.dist > DEN_RADIUS_M) return;
      const den = rec.den;
      const fighter = await buildFighter();
      openFight(wrap, fighter, {
        mode: 'boss', name: den.boss, mult: den.mult, aiLevel: den.aiLevel,
        talents: den.talents || [], venue: den.name, den, week, add: den.add || null, bossMult: den.bossMult || null,
      });
    });

    $('#mapMini', body).addEventListener('click', async () => {
      const id = $('#mapMini', body).dataset.miniId;
      const rec = miniMarkers.get(id);
      if (!rec || rec.mini.dist > MINI_RADIUS_M || claimedMini.has(miniKey(date, rec.mini))) return;
      const mini = rec.mini;
      const fighter = await buildFighter();
      openFight(wrap, fighter, { mode: 'mini', name: mini.name, mult: mini.mult, aiLevel: mini.aiLevel, talents: [], venue: 'The Boneyard', mini, date });
    });

    $('#mapCollect', body).addEventListener('click', async () => {
      const id = $('#mapCollect', body).dataset.spawnId;
      const rec = [...spawnMarkers.values()].find(r => r.spawn.id === id);
      if (!rec || rec.spawn.dist > COLLECT_RADIUS_M) return;
      const res = await collectSpawn(rec.spawn);
      if (!res) return;
      collected.add(spawnKey(date, rec.spawn));
      await kvSet('hunt-enabled', true);
      confettiBurst(innerWidth / 2, innerHeight * 0.4, 20);
      popSound(S.sounds);
      // scavenging drops a cooking ingredient (deterministic per spawn; RAREs give Ectoplasm)
      const { id: ingId, n: ingN } = spawnIngredient(rec.spawn);
      await grantIngredient(ingId, ingN);
      // active feast buff boosts the spawn's coins too
      const fcm = await foodCoinMult();
      if (res.coins && fcm > 1) { const bonus = Math.round(res.coins * (fcm - 1)); await coinsAdd(bonus); res.coins += bonus; }
      const bits = [`+${res.xp} XP`];
      if (res.coins) bits.push(`+${res.coins} coins`);
      bits.push(`${INGREDIENTS[ingId].icon} ${INGREDIENTS[ingId].name}${ingN > 1 ? ' x' + ingN : ''}`);
      if (res.crate) bits.push((res.crate === 'egg' ? 'Step Egg' : 'Daily Crate') + ' added to your stash');
      toast(`${res.label} collected · ${bits.join(' · ')}`, 3400);
      const badges = await evaluateBadges();
      if (badges.length) { queueCelebration({ newBadges: badges }); maybeCelebrate(); }
      refreshWorld();
    });

    refreshWorld();
    // claims and day rollovers must surface even when standing still
    const worldTimer = setInterval(() => { if (body.isConnected) refreshWorld(); else clearInterval(worldTimer); }, 5000);
    // occasionally a den STIRS (boss eyes glow + a shake) to give the map life —
    // not a loop, just a random flicker; the full gate cinematic plays on entry.
    const denAwaken = setInterval(() => {
      if (!body.isConnected) { clearInterval(denAwaken); return; }
      if (reducedMotion) return;
      const marks = [...denMarkers.values()].filter(r => r.el && !r.el.classList.contains('awaken'));
      if (!marks.length) return;
      const pick = marks[Math.floor(Math.random() * marks.length)];
      pick.el.classList.add('awaken');
      setTimeout(() => pick.el && pick.el.classList.remove('awaken'), 2600);
    }, 14000);
    const prevCleanupWT = cleanupExtras;
    cleanupExtras = () => { prevCleanupWT(); clearInterval(worldTimer); clearInterval(denAwaken); };

    let lastTick = 0, ema = null;
    huntWatchId = navigator.geolocation.watchPosition(pos => {
      const now = Date.now();
      if (now - lastTick < 1200) return;
      lastTick = now;
      if (!body.isConnected) { cleanup(); return; }
      // smooth the jitter: exponential moving average, fresh fixes weighted 40%
      if (!ema) ema = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      else { ema.lat += (pos.coords.latitude - ema.lat) * 0.4; ema.lng += (pos.coords.longitude - ema.lng) * 0.4; }
      lat = ema.lat; lng = ema.lng;
      // GPS course as compass fallback while walking
      if (!headingSeen && pos.coords.heading != null && !Number.isNaN(pos.coords.heading) && pos.coords.speed > 0.4) {
        heading = pos.coords.heading;
        const cone = $('.map-cone', body);
        if (cone) { cone.hidden = false; cone.style.transform = `rotate(${Math.round(heading)}deg)`; }
      }
      youMarker.setLngLat([lng, lat]);
      youWalk.move(lat, lng);
      if (follow && map) map.easeTo({ center: [lng, lat], duration: 900 });
      refreshWorld();
    }, () => { /* transient errors after boot: keep last position */ }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
  }
  $('#mapStart', wrap).addEventListener('click', () => { kvSet('map-seen', true); startMap(); });
  // been here before + location already allowed: go straight to the map
  if (await kvGet('map-seen', false)) startMap();
}

const bearingArrow = b => ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][Math.round(b / 45) % 8];

async function buildFighter() {
  const [log, xpRows, health] = await Promise.all([db.all('log'), db.all('xp'), db.all('health')]);
  const behavior = {
    proteinDays: xpRows.filter(r => r.type === 'protein').length,
    closes: xpRows.filter(r => r.type === 'dayclose').length,
    streak: streakFrom([...new Set(log.map(e => e.date))], dateKey()),
    lifetimeSteps: health.reduce((a, r) => a + (r.steps || 0), 0),
    spawns: xpRows.filter(r => r.type === 'spawn').length,
    eggDays: xpRows.filter(r => r.type === 'egg').length,
    questsDone: xpRows.filter(r => r.type === 'quest').length,
    variety: new Set(log.filter(e => e.foodId).map(e => e.foodId)).size,
  };
  const baseStats = deriveStats(behavior);
  const alloc = await kvGet('trainalloc', {});
  const [gearLo, gOwned, xpAll] = await Promise.all([gearLoadout(), ownedGearIds(), db.all('xp')]);
  const level = levelFor(xpAll.reduce((a, r) => a + (r.xp || 0), 0)).level;
  const gBonus = gearStats(gearLo, gOwned, level);
  const setInfo = gearSetInfo(gearLo, gOwned, level); // 2pc/4pc tier-set bonuses
  for (const k of Object.keys(gBonus)) gBonus[k] += (setInfo.stats[k] || 0);
  const gArmor = gearArmor(gearLo, gOwned, level); // {armor, spellArmor} points from worn gear
  const gearedBase = {};
  for (const k of Object.keys(baseStats)) gearedBase[k] = baseStats[k] + (gBonus[k] || 0);
  const stats = allocatedStats(gearedBase, alloc);
  // training points: one per wellbeing-safe positive day (protein hit / day closed on budget)
  const tpTotal = (behavior.proteinDays || 0) + (behavior.closes || 0);
  const tpSpent = STAT_META.reduce((a, m) => a + (alloc[m.key] || 0), 0);
  const tpAvail = Math.max(0, tpTotal - tpSpent);
  const inv = await inventory();
  const owned = ['starter', ...inv.filter(r => r.kind === 'weapon').map(r => r.weaponId)];
  let loadout = await kvGet('loadout', 'starter');
  if (!owned.includes(loadout)) loadout = 'starter';
  const talents = await kvGet('talents', []);
  // keep the player's talent array WITH repeats (ranks matter); gear/set talents
  // are single-rank moves, add them only if not already specced.
  const extraTalents = [...gearTalents(gearLo, gOwned, level), ...setInfo.talents].filter(id => !talents.includes(id));
  const fightTalents = [...talents, ...extraTalents];
  // battle pet: equipped C slot, level from steps since hatch, its spec picks
  let battlePet = null, petMeta = null;
  const eqForPet = await equipped();
  if (eqForPet.C) {
    const pl = petLevel(await petStepsSince(eqForPet.C));
    const picks = await petPicks(eqForPet.C);
    battlePet = buildBattlePet(eqForPet.C, pl, picks);
    petMeta = { id: eqForPet.C, level: pl, picks };
  }
  return { stats, baseStats: gearedBase, habitStats: baseStats, gearBonus: gBonus, gearArmor: gArmor, gearLo, alloc, tpTotal, tpAvail, behavior, owned, loadout, talents, fightTalents, battlePet, petMeta, setInfo };
}

// The GAME-ONLY profile snapshot that syncs when online. Level, stats, outfit
// ids (art renders locally on friends' devices), gear, badges. Deliberately
// NEVER: food logs, weights, location, health data.
const APP_SOCIAL_V = 'v68';
async function socialSnapshot() {
  const [fighter, eq, xp, gOwned, earned] = await Promise.all([buildFighter(), equipped(), totalXp(), ownedGearIds(), earnedBadgeIds()]);
  const lvl = levelFor(xp);
  return {
    level: lvl.level,
    levelName: lvl.name,
    stats: fighter.stats,
    talents: fighter.talents,
    weapon: fighter.loadout,
    outfit: eq,
    gearLo: fighter.gearLo,
    gear: [...gOwned].slice(0, 400),
    badges: earned.size ?? [...earned].length,
    pet: fighter.petMeta ? { id: fighter.petMeta.id, level: fighter.petMeta.level } : null,
  };
}

function pitBeatKeys(xpRows) {
  return new Set(xpRows.filter(r => r.type === 'pitrung' || r.type === 'pitchamp').map(r => r.key));
}

async function openPit() {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>The Pit</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body" id="pitBody"></div>`, { cls: 'full' });
  renderPit(wrap);
}

async function renderPit(wrap) {
  const body = $('#pitBody', wrap);
  if (!body) return;
  const fighter = await buildFighter();
  const xpRows = await db.all('xp');
  const beaten = pitBeatKeys(xpRows);
  const rungsBeaten = LADDER.filter(r => beaten.has(`pitrung-${r.rung}`)).length;
  const champOpen = rungsBeaten >= LADDER.length;
  const champBeaten = beaten.has('pitchamp');
  // Endless: unlocked after the Champion. You may climb up to a CEILING that
  // grows only when you beat world-boss dens out on the map (the outside gate).
  const denWins = await denWinsCount();
  const ceiling = endlessCeiling(denWins);
  const endlessBeaten = xpRows.filter(r => r.type === 'endless').length;
  const nextRank = endlessBeaten + 1;
  const canNewRank = nextRank <= ceiling;           // a fresh rank is available
  const fightRank = canNewRank ? nextRank : Math.max(1, ceiling); // else rematch the cap rank
  const fightFoe = endlessFoe(fightRank);
  const d = derived(fighter.stats, WEAPONS[fighter.loadout], new Set(fighter.fightTalents || fighter.talents));
  const wins = xpRows.filter(r => r.type === 'fight').length;
  const lvl = levelFor(xpRows.reduce((a, r) => a + (r.xp || 0), 0));
  const unspent = Math.max(0, talentPoints(lvl.level) - fighter.talents.length);
  const energy = await refreshPitEnergy();     // hybrid: free floor + Vigor from logging/steps
  const tapped = energy.ready <= 0;
  const gate = tapped ? 'disabled' : '';

  body.innerHTML = `
    <div class="pit-hero">
      <div class="pit-hero-atmos">
        <span class="pit-arch"></span>
        <span class="pit-crowd"></span>
        <span class="pit-torch l"></span><span class="pit-torch r"></span>
        <span class="pit-banner l"></span><span class="pit-banner r"></span>
        <span class="pit-fog"></span>
      </div>
      <img class="pit-emblem" src="assets/brand/sword.png" alt="" draggable="false">
      <div class="pit-hero-title">THE PIT</div>
      <div class="pit-quote">Many enter. Few leave.</div>
      <div class="pit-hero-sub">${d.maxHp} HP · ${d.maxWind} STAMINA${wins ? ` · ${wins} win${wins === 1 ? '' : 's'}` : ''}</div>
    </div>
    <p class="note" style="margin:12px 2px 8px">Step into the ring. Your fighter mirrors your habits: protein powers the swing, steps power the lungs, streaks thicken the bones. Pick your fight below.</p>
    <button class="btn ghost" id="buildBtn" style="margin:2px 0 6px">${ICONS.pit(18)} Shape your build · stats, weapon &amp; talents${unspent > 0 ? ` <i class="hero-badge" style="position:static;display:inline-block;margin-left:4px">${unspent}</i>` : ''}</button>
    <div class="pit-energy ${tapped ? 'empty' : ''}">
      <span class="pe-ico">${ICONS.pit(20)}</span>
      <div style="flex:1">
        <b>${energy.ready} fight${energy.ready === 1 ? '' : 's'} ready</b>
        <div class="pe-bar"><i style="width:${Math.min(100, Math.round(energy.ready / (energy.freeMax + 6) * 100))}%"></i></div>
        <small>${energy.free} free today + ${energy.vigor} Vigor${tapped ? ' · rest up! log a meal or take a walk to earn Vigor' : ' · earn more by logging food &amp; walking'}</small>
      </div>
    </div>
    <p class="note" style="margin:6px 2px 8px">Sparring is always free. Ladder, Champion and Gauntlet fights cost one charge: ${FREE_FIGHTS} free a day, then Vigor you earn by logging food and getting your steps.</p>
    <details class="pit-sect"><summary>Sparring · no stakes</summary>
    ${[['easy', 'Loose Bones', 0.8], ['even', 'Your Shadow', 1.0], ['hard', 'Mean Mirror', 1.15]].map(([id, name, m]) => `
      <div class="crate-row"><span class="crate-ico">${ICONS.pit(22)}</span>
        <div style="flex:1"><b>${name}</b><small>${Math.round(m * 100)}% of your stats · +15 coins on a win</small></div>
        <button class="btn small ghost" data-spar="${m}" data-name="${name}">Fight</button>
      </div>`).join('')}
    </details>
    <details class="pit-sect" open><summary>The Ladder</summary>
    ${LADDER.map(r => {
      const done = beaten.has(`pitrung-${r.rung}`);
      const locked = r.rung > rungsBeaten + 1;
      return `<div class="crate-row">
        <span class="crate-ico" style="font-family:var(--display);font-size:19px;color:${done ? 'var(--text-3)' : 'var(--accent)'}">${r.rung}</span>
        <div style="flex:1"><b>${r.name} ${done ? '✓' : ''}</b><small>${Math.round(r.mult * 100)}% stats · first win: ${r.coins} coins + ${r.xp} XP</small></div>
        ${locked ? '<span class="q-frac">locked</span>' : `<button class="btn small ${done ? 'ghost' : ''}" data-rung="${r.rung}" ${gate}>Fight</button>`}
      </div>`;
    }).join('')}
    </details>
    <details class="pit-sect"${champOpen && !champBeaten ? ' open' : ''}><summary>Champion</summary>
    <div class="crate-row">
      <span class="crate-ico">${crateIcon('golden', 24)}</span>
      <div style="flex:1"><b>${CHAMPION.name} ${beaten.has('pitchamp') ? '✓' : ''}</b><small>Wields the Bonecrusher · first win drops it + a Golden Crate</small></div>
      ${champOpen ? `<button class="btn small" id="champBtn" ${gate}>Fight</button>` : `<span class="q-frac">beat the ladder</span>`}
    </div>
    </details>
    <details class="pit-sect"${champBeaten ? ' open' : ''}><summary>Endless · The Gauntlet</summary>
    ${champBeaten ? `
    <p class="note" style="margin:2px 2px 8px">Foes scale <b>forever</b> — the Pit never runs dry. Cleared <b>${endlessBeaten}</b> rank${endlessBeaten === 1 ? '' : 's'}.${canNewRank ? '' : ` You've hit the current cap: <b>beat a world boss</b> to unlock rank ${ceiling + 1}.`}</p>
    <div class="crate-row">
      <span class="crate-ico" style="font-family:var(--display);font-size:18px;color:var(--accent)">${fightRank}</span>
      <div style="flex:1"><b>${esc(fightFoe.name)}</b><small>${Math.round(fightFoe.mult * 100)}% stats · ${canNewRank ? `${fightFoe.xp} XP + ${fightFoe.coins} coins` : `rematch · +${fightFoe.repeatCoins} coins`}</small></div>
      <button class="btn small" id="endlessBtn" ${gate}>Fight</button>
    </div>
    ${canNewRank ? '' : `<button class="link" id="endlessGate" style="margin:4px 2px 0">Go beat a world boss to climb higher →</button>`}`
    : `
    <div class="crate-row" style="opacity:.75">
      <span class="crate-ico">🔒</span>
      <div style="flex:1"><b>The Gauntlet</b><small>Beat the Champion to enter, then foes scale <b>forever</b>. The climb never ends.</small></div>
    </div>`}
    </details>`;

  $('#buildBtn', body)?.addEventListener('click', () => { history.back(); setTimeout(() => openCharacter('talents'), 250); });
  const start = (foeCfg) => openFight(wrap, fighter, foeCfg);
  // sparring is always free (practice); real fights spend the hybrid energy
  const startPit = async (foeCfg) => {
    const spent = await spendPitFight();
    if (!spent.ok) { toast('Rest up! Log a meal or take a walk to earn Vigor. Free fights refill tomorrow.', 3400); renderPit(wrap); return; }
    openFight(wrap, fighter, foeCfg);
  };
  $$('[data-spar]', body).forEach(b => b.addEventListener('click', () =>
    start({ mode: 'spar', name: b.dataset.name, mult: Number(b.dataset.spar) })));
  $$('[data-rung]', body).forEach(b => b.addEventListener('click', () => {
    const r = LADDER[Number(b.dataset.rung) - 1];
    startPit({ mode: 'rung', rung: r.rung, name: r.name, mult: r.mult, coins: r.coins, repeatCoins: r.repeatCoins, xp: r.xp, done: beaten.has(`pitrung-${r.rung}`) });
  }));
  $('#champBtn', body)?.addEventListener('click', () =>
    startPit({ mode: 'champ', name: CHAMPION.name, mult: CHAMPION.mult, coins: CHAMPION.coins, repeatCoins: CHAMPION.repeatCoins, xp: CHAMPION.xp, weaponId: CHAMPION.weaponId, done: beaten.has('pitchamp') }));
  $('#endlessBtn', body)?.addEventListener('click', () =>
    startPit({ mode: 'endless', rank: fightFoe.rank, name: fightFoe.name, mult: fightFoe.mult, talents: fightFoe.talents, weaponId: fightFoe.weaponId, aiLevel: fightFoe.aiLevel, coins: fightFoe.coins, repeatCoins: fightFoe.repeatCoins, xp: fightFoe.xp, venue: 'The Gauntlet' }));
  $('#endlessGate', body)?.addEventListener('click', () => { toast('Beat a world-boss den on the map to climb higher.', 2600); history.back(); setTimeout(openMap, 250); });
}

function foeOutfitFor(name) {
  // deterministic outfit per opponent name
  const seedRand = (() => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; let a = h || 7; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const eq = { B: 'B0-1', SK: 'SK0-1' };
  for (const slot of BH_SLOTS) {
    if (slot.code === 'B' || slot.code === 'SK' || slot.code === 'YD' || slot.code === 'BG') continue;
    if (seedRand() < 0.5) {
      const pool = BH_ITEMS.filter(i => i.slot === slot.code && !i.file);
      if (pool.length) eq[slot.code] = pool[Math.floor(seedRand() * pool.length)].id;
    }
  }
  return eq;
}

const PIT_VENUES = {
  spar: 'The Back Alley',
  1: 'The Boneyard Gate', 2: 'The Catacomb Club', 3: 'The Chapel Undercroft',
  4: 'The Sunken Colosseum', 5: 'The Old Crypt Arena', champ: 'The Marrow Throne',
};

async function openFight(pitWrap, fighter, foeCfg) {
  const eq = await equipped();
  const food = await foodCombatBuff(); // active dish buffs (damage / hype / regen / pet-free)
  let potionInv = await potionsInv(); // brewed potions you can drink mid-fight
  const player = makeFighter({ name: 'You', stats: fighter.stats, weaponId: fighter.loadout, outfit: eq, talents: fighter.fightTalents || fighter.talents, pet: fighter.battlePet, food, gearArmor: fighter.gearArmor });
  const foeTalents = foeCfg.mode === 'champ' ? CHAMPION.talents : (foeCfg.mode === 'rung' ? (RUNG_TALENTS[foeCfg.rung] || []) : (foeCfg.talents || []));
  const foe = makeFighter({
    name: foeCfg.name,
    stats: scaleStats(fighter.stats, foeCfg.bossMult || foeCfg.mult),
    weaponId: foeCfg.weaponId || 'starter',
    outfit: foeOutfitFor(foeCfg.name),
    talents: foeTalents,
  });
  const add = foeCfg.add ? makeFighter({
    name: foeCfg.add.name,
    stats: scaleStats(fighter.stats, foeCfg.add.mult),
    talents: foeCfg.add.talents || [],
    outfit: foeOutfitFor(foeCfg.add.name),
  }) : null;
  const fight = createFight({ player, foe, add, seed: navigator.webdriver ? (window.__pitSeed = (window.__pitSeed || 1336) + 1) : (Date.now() % 100000) + 1, aiLevel: foeCfg.aiLevel || (foeCfg.mode === 'champ' ? 3 : foeCfg.mode === 'rung' ? 2 : 1) });
  const fast = !!navigator.webdriver;
  const beatMs = fast ? 60 : 700;
  const fxMs = fast ? 30 : 300;
  const petBody = fight.pAux;                              // your pet as a real body
  const petArtId = fighter.petMeta ? fighter.petMeta.id : null;
  const venue = foeCfg.venue || PIT_VENUES[foeCfg.mode === 'champ' ? 'champ' : foeCfg.mode === 'rung' ? foeCfg.rung : 'spar'] || 'The Pit';
  if (!fast && !reducedMotion) {
    if (foeCfg.mode === 'boss') {
      // world-map Boneyard dens get the full gate cinematic: the boss breaches
      // the tomb portal. Fire-and-forget overlay (z-index 200 covers the sheet
      // building underneath); tap-to-skip. Reduced motion / webdriver no-op.
      showGateIntro({
        foeName: foeCfg.name,
        venue,
        spriteHtml: avatarLayersHtml(foe.outfit, { noYard: true, skip: ['BG'] }),
        sounds: S.sounds,
      });
    } else {
      const vs = document.createElement('div');
      vs.className = 'vs-card quake';
      vs.innerHTML = `
        <div class="vs-inner">
          <div class="vs-name">YOU</div>
          <div class="vs-bones">
            <span class="vs-bone l">${ICONS.bone(46)}</span>
            <span class="vs-bone r">${ICONS.bone(46)}</span>
            <div class="vs-impact"></div>
          </div>
          <div class="vs-vs">VS</div>
          <div class="vs-name foe">${esc(foeCfg.name.toUpperCase())}</div>
          <div class="vs-venue">at ${esc(venue)}</div>
        </div>`;
      document.body.appendChild(vs);
      setTimeout(() => hitSound(S.sounds, 'thud'), 430);
      setTimeout(() => { vs.style.opacity = '0'; vs.style.transition = 'opacity .25s'; }, 1150);
      setTimeout(() => vs.remove(), 1420);
    }
  }
  let settled = false;
  let showMore = false;

  const wrap = openSheet(`
    <div class="sheet-head"><h2>${esc(foeCfg.name)}</h2><button class="sheet-close">Flee</button></div>
    <div class="sheet-body" id="fightBody" style="padding-bottom:10px"></div>`,
    { cls: 'full', onClose: () => { if (!fight.over && !settled) toast('You slipped out of The Pit. No harm done.'); } });

  const body = $('#fightBody', wrap);
  body.innerHTML = `
    <div class="arena" id="arena">
      <div class="pit-crowd"></div>
      <div class="pit-banner l"></div><div class="pit-banner r"></div>
      <div class="pit-torch l"></div><div class="pit-torch r"></div>
      <div class="pit-floor"></div>
      <div class="pit-fog"></div>
      <div class="arena-floor"></div>
      <span class="venue-tag">${esc(venue)}</span>
      <div class="fighterG foe-side" id="foeG" data-target="f">
        <div class="fplate">
          <div class="fname">${esc(foe.name)}<span class="fstate" id="foeState" hidden></span></div>
          <div class="bar fhp"><i id="foeHp" style="width:100%"></i></div>
          <div class="microbars"><div class="bar fwind"><i id="foeWind" style="width:100%"></i></div><div class="bar fhype"><i id="foeHype" style="width:0%"></i></div></div>
        </div>
        <div class="bh-stage fstage" id="foeStage"><div class="mirror-wrap">${avatarLayersHtml(foe.outfit, { noYard: true, skip: ['BG'] })}</div></div>
        ${add ? `
        <div class="pet-fighter add" id="addG" data-target="fa">
          <div class="bh-stage fstage petmini" id="addStage"><div class="mirror-wrap">${avatarLayersHtml(add.outfit, { noYard: true, skip: ['BG'] })}</div></div>
          <div class="petplate"><span class="petname">${esc(add.name)}</span><div class="bar fhp mini"><i id="addHp" style="width:100%"></i></div></div>
        </div>` : ''}
      </div>
      <div class="fighterG you-side" id="youG">
        <div class="fplate">
          <div class="fname">You<span class="fstate" id="youState" hidden></span></div>
          <div class="bar fhp"><i id="youHp" style="width:100%"></i></div>
          <div class="microbars"><div class="bar fwind"><i id="youWind" style="width:100%"></i></div><div class="bar fhype"><i id="youHype" style="width:0%"></i></div></div>
        </div>
        <div class="bh-stage fstage" id="youStage">${avatarLayersHtml(player.outfit, { noYard: true, skip: ['BG', 'C'] })}</div>
        ${petBody ? `
        <div class="pet-fighter" id="petG">
          <div class="bh-stage fstage petmini r-${(BH_BY_ID[petArtId] || {}).rarity || 'common'}" id="petStage">${petArtId && BH_BY_ID[petArtId] ? `<img src="${bhAsset(BH_BY_ID[petArtId])}" alt="">` : ''}</div>
          <div class="petplate"><span class="petname">${esc(petBody.name)}</span><div class="bar fhp mini"><i id="petHp" style="width:100%"></i></div></div>
        </div>` : ''}
      </div>
      <div class="telegraph arena-tele" id="teleBanner" hidden></div>
      <div id="floats"></div>
    </div>
    <div class="fight-meta"><span class="range-pill" id="rangePill"></span><span class="fight-log" id="flog">Round one. Your turn.</span></div>
    <div class="fight-actions" id="factions"></div>`;

  const el = id => $('#' + id, body);

  // 2v1: tap an enemy plate to focus it. Default stays the boss; retargets to a
  // living enemy automatically (updateBars). Highlight shows the current focus.
  if (add) {
    [el('foeG'), el('addG')].forEach(g => g && g.addEventListener('click', (e) => {
      e.stopPropagation(); // #addG is nested in #foeG; don't let the tap bubble
      const t = g.dataset.target;
      const tf = t === 'fa' ? add : foe;
      if (!tf || tf.hp <= 0) return;
      fight.pTarget = t;
      updateBars();
    }));
  }

  function positionFighters() {
    const close = fight.range === 'close';
    el('youG').style.left = close ? '12%' : '-2%';
    el('foeG').style.right = close ? '12%' : '-2%';
    el('rangePill').textContent = `${fight.range === 'close' ? 'CLOSE' : 'FAR'} · turn ${fight.turn}`;
  }

  function updateBars() {
    el('youHp').style.width = (player.hp / player.d.maxHp * 100) + '%';
    el('youHp').style.background = player.hp / player.d.maxHp < 0.3 ? 'var(--danger)' : '';
    el('foeHp').style.width = (foe.hp / foe.d.maxHp * 100) + '%';
    el('foeHp').style.background = foe.hp / foe.d.maxHp < 0.3 ? 'var(--danger)' : '';
    if (petBody && el('petHp')) {
      el('petHp').style.width = Math.max(0, petBody.hp / petBody.d.maxHp * 100) + '%';
      const pg = el('petG');
      if (pg) pg.classList.toggle('fainted', !!petBody.fainted);
    }
    if (add && el('addHp')) {
      el('addHp').style.width = Math.max(0, add.hp / add.d.maxHp * 100) + '%';
      const ag = el('addG'); if (ag) ag.classList.toggle('fainted', add.hp <= 0);
      // auto-retarget onto a living enemy, then highlight the current target
      if (fight.pTarget === 'fa' && add.hp <= 0) fight.pTarget = 'f';
      else if (fight.pTarget === 'f' && foe.hp <= 0 && add.hp > 0) fight.pTarget = 'fa';
      const eff = (add.hp > 0 && fight.pTarget === 'fa') ? 'fa' : 'f';
      el('foeG')?.classList.toggle('targeted', eff === 'f');
      el('addG')?.classList.toggle('targeted', eff === 'fa');
    }
    el('youWind').style.width = (player.wind / player.d.maxWind * 100) + '%';
    el('foeWind').style.width = (foe.wind / foe.d.maxWind * 100) + '%';
    el('youHype').style.width = player.hype + '%';
    el('foeHype').style.width = foe.hype + '%';
    for (const [f, id] of [[player, 'youState'], [foe, 'foeState']]) {
      const chip = el(id);
      const bits = [];
      if (f.stagger) bits.push('STAGGERED');
      if (f.bleed) bits.push(`BLEED x${f.bleed.stacks}`);
      if (f.burn) bits.push('BURNING');
      if (f.poison) bits.push(`POISON x${f.poison.stacks}`);
      if (f.blind) bits.push('BLINDED');
      if (f.marked) bits.push('MARKED');
      if (f.ward > 0) bits.push(`GUARD ${f.ward}`);
      if (f.sunder) bits.push('SUNDERED');
      if (f.weaken) bits.push('WEAKENED');
      if (f.rage) bits.push('RAGING');
      if (f.minion) bits.push('MINION');
      if (f.totem) bits.push('TOTEM');
      if (f.toxicity > 0) bits.push(`TOXIC ${f.toxicity}`);
      if (f.flock > 0) bits.push(`FLOCK ${f.flock}`);
      if (bits.length) {
        chip.hidden = false;
        chip.textContent = bits.join(' · ');
        chip.classList.toggle('stag', !!f.stagger || !!f.sunder);
        chip.classList.toggle('raging', !!f.rage);
      } else chip.hidden = true;
    }
    // persistent class-identity auras on the fighter stages
    const youStg = el('youStage'), foeStg = el('foeStage');
    if (youStg) { youStg.classList.toggle('raging', !!player.rage); youStg.classList.toggle('has-minion', !!player.minion); youStg.classList.toggle('has-totem', !!player.totem); }
    if (foeStg) { foeStg.classList.toggle('raging', !!foe.rage); foeStg.classList.toggle('has-minion', !!foe.minion); foeStg.classList.toggle('has-totem', !!foe.totem); }
    el('teleBanner').hidden = !fight.telegraph;
    if (fight.telegraph) el('teleBanner').textContent = `⚠ ${foe.name} is winding up something heavy. Guard or race it!`;
  }

  function floatNode(html, side, cls = '') {
    const n = document.createElement('div');
    n.className = 'float ' + cls;
    n.innerHTML = html;
    n.style.left = side === 'f' ? '68%' : '22%';
    el('floats').appendChild(n);
    setTimeout(() => n.remove(), fast ? 200 : 1100);
  }

  function pulse(node, cls, ms) {
    const tokens = cls.split(' ').filter(Boolean);
    node.classList.add(...tokens);
    setTimeout(() => node.classList.remove(...tokens), ms);
  }

  // a magic bolt that flies across the arena
  function projectile(who, school) {
    const p = document.createElement('div');
    p.className = `proj ${school} ${who === 'p' ? 'ltr' : 'rtl'}`;
    p.style.animationDuration = (fast ? 90 : 340) + 'ms';
    el('arena').appendChild(p);
    setTimeout(() => p.remove(), fast ? 120 : 380);
  }

  // an expanding impact ring at a fighter, colored by school
  function impactBurst(side, school, big = false) {
    const b = document.createElement('div');
    b.className = `burst ${school}${big ? ' bigburst' : ''}`;
    b.style.left = side === 'f' ? '68%' : '22%';
    el('arena').appendChild(b);
    setTimeout(() => b.remove(), fast ? 150 : 500);
  }

  const schoolOf = ev => ev.school || (ACTIONS[ev.move] && ACTIONS[ev.move].school) || 'phys';

  // choreograph one engine event
  function playFx(ev) {
    // multi-body staging: an enemy going after your pet lands on the pet plate;
    // you going after the add lands on the add plate; the add attacks from its plate
    const foeHitsPet = (ev.who === 'f' || ev.who === 'fa') && fight.fTarget === 'pa' && el('petStage');
    const playerHitsAdd = ev.who === 'p' && add && fight.pTarget === 'fa' && el('addStage');
    const atkStage = ev.who === 'p' ? el('youStage') : (ev.who === 'fa' && el('addStage') ? el('addStage') : el('foeStage'));
    const vicStage = ev.who === 'p' ? (playerHitsAdd ? el('addStage') : el('foeStage')) : (foeHitsPet ? el('petStage') : el('youStage'));
    const vicSide = ev.who === 'p' ? 'f' : 'p';
    const lungeCls = ev.who === 'p' ? 'lunge-r' : 'lunge-l';
    if (ev.t === 'hit') {
      if (ev.whiffed && !ev.damage) {
        floatNode('whiff', ev.who === 'p' ? 'f' : 'p', 'stamp dim');
        return;
      }
      if (ev.magic || ACTIONS[ev.move]?.magic) {
        const school = schoolOf(ev);
        pulse(atkStage, 'castfx cast-' + school, fxMs + 200);
        setTimeout(() => projectile(ev.who, school), fast ? 10 : fxMs * 0.25);
        setTimeout(() => {
          pulse(vicStage, 'hurt', fxMs + 150);
          impactBurst(vicSide, school, ev.crit);
          floatNode(`-${ev.damage}`, vicSide, 'dmg ' + (school === 'phys' ? 'magic' : school));
          if (ev.crit) { floatNode('CRIT!', vicSide, 'stamp hot'); }
          hitSound(S.sounds, 'zap');
        }, fast ? 30 : fxMs * 0.6);
        return;
      }
      const heavy = ev.move === 'haymaker' || ev.move === 'titan' || ev.signature;
      const strike = () => {
        pulse(atkStage, heavy ? lungeCls + ' big' : lungeCls, fxMs + 120);
        setTimeout(() => {
          pulse(vicStage, 'hurt', fxMs + 150);
          impactBurst(vicSide, 'phys', heavy);
          if (heavy) pulse(el('arena'), 'quake', fxMs + 160);
          floatNode(`-${ev.damage}`, vicSide, 'dmg' + (ev.crit ? ' crit' : '') + (ev.signature ? ' sig' : ''));
          if (ev.crit) floatNode('CRIT!', vicSide, 'stamp hot');
          if (ev.glance) floatNode('glancing', vicSide, 'stamp dim');
          if (ev.breaksGuard) floatNode('GUARD BREAK', vicSide, 'stamp hot');
          if (ev.signature) { confettiBurst(innerWidth / 2, innerHeight * 0.3, 20); levelSound(S.sounds); }
          else if (ev.crit) { confettiBurst(innerWidth / 2, innerHeight * 0.3, 10); popSound(S.sounds); }
          else hitSound(S.sounds, heavy ? 'thud' : 'tick');
        }, fxMs * 0.6);
      };
      if (heavy && !ev.signature && !fast) { pulse(atkStage, 'windup', fxMs * 0.55); setTimeout(strike, fxMs * 0.5); }
      else strike();
    } else if (ev.t === 'miss') {
      if (ev.whiffed || false) {
        if (!fast) pulse(atkStage, 'windup', fxMs * 0.55);
        setTimeout(() => {
          pulse(atkStage, lungeCls + ' big whiff', fxMs + 250);
          floatNode('WHIFF!', ev.who, 'stamp hot');
          if (ev.offBalance) floatNode('off-balance!', ev.who, 'stamp dim');
        }, fast ? 0 : fxMs * 0.5);
      } else {
        pulse(atkStage, lungeCls + ' big whiff', fxMs + 250);
        floatNode('MISS', vicSide, 'stamp');
        floatNode('off-balance!', ev.who, 'stamp dim');
      }
    } else if (ev.t === 'absorb') {
      pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), 'wardfx', fxMs + 200);
      floatNode(`${ev.amount} absorbed`, ev.who, 'stamp holy');
      if (ev.broken) setTimeout(() => floatNode('WARD BROKEN', ev.who, 'stamp dim'), fxMs * 0.4);
    } else if (ev.t === 'lastlight') {
      pulse(el('arena'), 'holyflash', fxMs + 400);
      pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), 'mendfx', fxMs + 400);
      floatNode('LAST LIGHT!', ev.who, 'stamp gold');
      levelSound(S.sounds);
    } else if (ev.t === 'burntick') {
      floatNode(`-${ev.damage}`, ev.who, 'dmg fire');
      pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), 'hurt', fxMs);
    } else if (ev.t === 'poisontick') {
      floatNode(`-${ev.damage}`, ev.who, 'dmg poison');
      pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), 'hurt', fxMs);
    } else if (ev.t === 'ragetick') {
      floatNode(`-${ev.damage}`, ev.who, 'dmg rage');
      pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), 'ragefx', fxMs);
    } else if (ev.t === 'ragefade') {
      floatNode('rage fades', ev.who, 'stamp dim');
    } else if (ev.t === 'summon') {
      const stage = ev.who === 'p' ? el('youStage') : el('foeStage');
      pulse(stage, ev.kind === 'totem' ? 'totemfx' : 'summonfx', fxMs + 400);
      impactBurst(ev.who, ev.kind === 'totem' ? 'nature' : 'shadow', true);
      floatNode(ev.kind === 'minion' ? '☠ RISE' : ev.kind === 'crows' ? `🐦 FLOCK ${ev.crows}` : '⚡ TOTEM', ev.who, ev.kind === 'totem' ? 'stamp cool' : 'stamp hex');
      hitSound(S.sounds, 'zap');
    } else if (ev.t === 'crowpeck') {
      const vs = ev.who;
      pulse(vs === 'p' ? el('youStage') : el('foeStage'), 'hurt', fxMs);
      impactBurst(vs, 'shadow');
      floatNode(`🐦 -${ev.damage}`, vs, 'dmg shadow');
      hitSound(S.sounds, 'tick');
    } else if (ev.t === 'minionstrike') {
      const vs = ev.who; // event carries the victim's who
      pulse(vs === 'p' ? el('youStage') : el('foeStage'), 'hurt', fxMs);
      impactBurst(vs, 'shadow');
      floatNode(`☠ -${ev.damage}`, vs, 'dmg shadow');
      hitSound(S.sounds, 'tick');
    } else if (ev.t === 'totemtick') {
      const vs = ev.who;
      pulse(vs === 'p' ? el('youStage') : el('foeStage'), 'hurt', fxMs);
      impactBurst(vs, 'nature');
      floatNode(`⚡ -${ev.damage}`, vs, 'dmg nature');
    } else if (ev.t === 'pethit') {
      pulse(ev.who === 'p' ? (el('petStage') || el('youStage')) : el('foeStage'), 'petpounce', fxMs + 150);
      setTimeout(() => { impactBurst(ev.who === 'p' ? 'f' : 'p', 'phys'); floatNode(`-${ev.damage}`, ev.who === 'p' ? 'f' : 'p', 'dmg'); }, fast ? 20 : fxMs * 0.4);
      floatNode(`🐾 ${esc(ev.name)}`, ev.who, 'stamp warm');
      hitSound(S.sounds, 'tick');
    } else if (ev.t === 'petshield') {
      pulse(ev.who === 'p' ? (el('petStage') || el('youStage')) : el('foeStage'), 'wardfx', fxMs + 250);
      floatNode(ev.laststand ? 'LAST STAND!' : (ev.shield ? `+${ev.shield} ward` : '+heal'), ev.who, 'stamp holy');
      if (ev.heal) floatNode(`+${ev.heal}`, ev.who, 'dmg heal');
    } else if (ev.t === 'petguard') {
      pulse(el('petStage') || el('youStage'), 'wardfx', fxMs + 200);
      floatNode('🐾 steady', ev.who, 'stamp cool');
    } else if (ev.t === 'petdebuff') {
      pulse(ev.who === 'p' ? (el('petStage') || el('youStage')) : el('foeStage'), 'hexfx', fxMs + 250);
      floatNode('🐾 cursed', ev.who, 'stamp hex');
    } else if (ev.t === 'faint') {
      const pg = el('petG'); if (pg) pg.classList.add('fainted');
      floatNode('🐾 DOWN', 'p', 'stamp dim');
      hitSound(S.sounds, 'thud');
    } else if (ev.t === 'aoe') {
      const arena = $('#arena'); if (arena) pulse(arena, 'quake', fxMs + 200);
      pulse(el('foeStage'), 'lunge-l', fxMs);
      if (ev.dmgYou > 0) floatNode(`-${ev.dmgYou}`, 'p', 'dmg');
      const petStage = el('petStage');
      if (petStage && ev.dmgPet > 0) { setTimeout(() => { pulse(petStage, 'hurt', fxMs); floatNode(`🐾 -${ev.dmgPet}`, 'p', 'dmg bleed'); }, 120); }
      floatNode('SWEEP!', 'f', 'stamp hot');
      hitSound(S.sounds, 'thud');
    } else if (ev.t === 'shove') {
      pulse(atkStage, lungeCls, fxMs);
      setTimeout(() => pulse(vicStage, 'hurt', fxMs), fxMs * 0.5);
    } else if (ev.t === 'counter') {
      const vs = ev.who === 'p' ? 'f' : 'p';
      pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), ev.who === 'p' ? 'lunge-r' : 'lunge-l', fxMs);
      floatNode(`-${ev.damage}`, vs, 'dmg');
      floatNode('COUNTER!', vs, 'stamp hot');
    } else if (ev.t === 'heal' || ev.t === 'secondwind') {
      floatNode(`+${ev.amount || ev.heal}`, ev.who, 'dmg heal');
      pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), 'mendfx', fxMs + 250);
    } else if (ev.t === 'status') {
      const label = { sunder: 'SUNDERED', bleed: 'BLEEDING', hex: 'HEXED', weaken: 'WEAKENED', chill: 'CHILLED', burn: 'BURNING', ward: 'WARDED', blind: 'BLINDED', guard: 'GUARD UP', rattle: 'RATTLED', rage: 'RAGE!' }[ev.kind] || '';
      floatNode(label, ev.who, ev.kind === 'burn' ? 'stamp fire' : ev.kind === 'rage' ? 'stamp rage' : (ev.kind === 'ward' || ev.kind === 'guard') ? 'stamp holy' : ev.kind === 'guard' ? 'stamp cool' : 'stamp hex');
      if (ev.kind === 'hex' || ev.kind === 'weaken' || ev.kind === 'chill' || ev.kind === 'blind' || ev.kind === 'rattle') pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), 'hexfx', fxMs + 250);
      if (ev.kind === 'ward' || ev.kind === 'guard') pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), ev.kind === 'guard' ? 'guard' : 'wardfx', fxMs + 300);
      if (ev.kind === 'rage') { pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), 'ragefx', fxMs + 400); impactBurst(ev.who, 'rage', true); hitSound(S.sounds, 'thud'); }
      if (ev.kind === 'burn') impactBurst(ev.who, 'fire');
      if (ev.kind === 'blind') impactBurst(ev.who, 'phys');
    } else if (ev.t === 'bleedtick') {
      floatNode(`-${ev.damage}`, ev.who, 'dmg bleed');
    } else if (ev.t === 'taunt') {
      floatNode(`+${ev.gain} hype`, ev.who, 'stamp warm');
    }
  }

  function describe(ev) {
    const who = ev.who === 'p' ? 'You' : (ev.who === 'fa' && add) ? add.name : foe.name;
    const them = ev.who === 'p' ? ((fight.pTarget === 'fa' && add) ? add.name : foe.name) : 'you';
    if (ev.t === 'hit') {
      if (ev.titan) return `${who} brought down the TITAN SLAM on ${them} for ${ev.damage}`;
      if (ev.storm) {
        const [label, last] = ({ bonestorm: ['BONE STORM', 3], tempest: ['TEMPEST', 4] })[ev.move] || ['BONE STORM', 3];
        const val = ev.whiffed ? 'miss' : ev.damage;
        return ev.hitNo === 1 ? `${who} called down the ${label}: ${val}...` : `...${val}${ev.hitNo === last ? '!' : '...'}`;
      }
      if (ev.move === 'bonebolt') return `${who} hurled a bone bolt at ${them} for ${ev.damage}`;
      if (ev.move === 'smite') return `${who} smote ${them} with grave-light for ${ev.damage}`;
      if (ev.move === 'frostbolt') return `${who} lanced ${them} with frost for ${ev.damage}`;
      if (ev.move === 'firebolt') return `${who} seared ${them} with fire for ${ev.damage}`;
      if (ev.whiffed && !ev.damage) return null;
      if (ev.flurry) return ev.hitNo === 1 ? `${who} unleashed a flurry: ${ev.damage}...` : `...${ev.damage}${ev.hitNo === 3 ? '!' : '...'}`;
      return `${who} ${ev.signature ? 'UNLEASHED THE SIGNATURE on' : ev.move === 'throwb' ? 'threw a bone at' : `landed a ${ACTIONS[ev.move].label.toLowerCase()} on`} ${them} for ${ev.damage}`;
    }
    if (ev.t === 'counter') return `${who === 'You' ? 'You counterstep' : who + ' countersteps'} for ${ev.damage}!`;
    if (ev.t === 'heal') return ev.mend ? `${who} mended ${who === 'You' ? 'your' : 'their'} marrow (+${ev.amount} HP)` : `${who} drank the marrow (+${ev.amount} HP)`;
    if (ev.t === 'status') {
      if (ev.kind === 'sunder') return `${who === 'You' ? 'You are' : who + ' is'} SUNDERED: +15% damage taken`;
      if (ev.kind === 'bleed') return `${who === 'You' ? 'You are' : who + ' is'} bleeding (x${ev.stacks})`;
      if (ev.kind === 'hex' || ev.kind === 'weaken') return `${who === 'You' ? 'You are' : who + ' is'} cursed: -damage`;
      if (ev.kind === 'chill') return `the chill drains ${who === 'You' ? 'your' : 'their'} stamina`;
      if (ev.kind === 'burn') return `${who === 'You' ? 'You catch' : who + ' catches'} fire`;
      if (ev.kind === 'guard') return `${who === 'You' ? 'You raise' : who + ' raises'} a Bone Guard (absorbs ${ev.shield})`;
      if (ev.kind === 'rattle') return `${who === 'You' ? 'You are' : who + ' is'} RATTLED: less damage, drained stamina`;
      if (ev.kind === 'ward') return `${who === 'You' ? 'You raise' : who + ' raises'} a shimmering ward`;
      if (ev.kind === 'blind') return `${who === 'You' ? 'You are' : who + ' is'} BLINDED: bone dust in the eyes`;
      if (ev.kind === 'poison') return `${who === 'You' ? 'You are' : who + ' is'} POISONED (x${ev.stacks})`;
      if (ev.kind === 'mark') return `${who === 'You' ? 'You are' : who + ' is'} MARKED for death`;
      if (ev.kind === 'rage') return `${who === 'You' ? 'You fly' : who + ' flies'} into a RAGE`;
    }
    if (ev.t === 'summon') return ev.kind === 'minion' ? `${who === 'You' ? 'You raise' : who + ' raises'} a bone minion` : ev.kind === 'crows' ? `${who === 'You' ? 'You call' : who + ' calls'} crows (Flock ${ev.crows})` : `${who === 'You' ? 'You plant' : who + ' plants'} a spirit totem`;
    if (ev.t === 'crowpeck') return `the flock pecks ${who === 'You' ? 'you' : (who === 'p' ? 'you' : foe.name)} for ${ev.damage}`;
    if (ev.t === 'minionstrike') return `the bone minion claws ${who === 'You' ? 'you' : (who === 'p' ? 'you' : foe.name)} for ${ev.damage}`;
    if (ev.t === 'totemtick') return `the totem zaps ${who === 'You' ? 'you' : (who === 'p' ? 'you' : foe.name)} for ${ev.damage}`;
    if (ev.t === 'ragetick') return `${who === 'You' ? 'You bleed' : who + ' bleeds'} ${ev.damage} from the rage`;
    if (ev.t === 'ragefade') return `${who === 'You' ? 'your' : who + "'s"} rage fades`;
    if (ev.t === 'secondwind') return `${who} found a SECOND WIND (+${ev.heal} HP)`;
    if (ev.t === 'bleedtick') return `${who === 'You' ? 'You bleed' : who + ' bleeds'} for ${ev.damage}`;
    if (ev.t === 'burntick') return `${who === 'You' ? 'You burn' : who + ' burns'} for ${ev.damage}`;
    if (ev.t === 'poisontick') return `${who === 'You' ? 'You take' : who + ' takes'} ${ev.damage} poison`;
    if (ev.t === 'pethit') return `${esc(ev.name)} savaged ${who === 'You' ? foe.name : 'you'} for ${ev.damage}`;
    if (ev.t === 'petshield') return ev.laststand ? `${esc(ev.name)} threw itself in front of the blow!` : `${esc(ev.name)} shielded ${who === 'You' ? 'you' : foe.name}`;
    if (ev.t === 'petdebuff') return `${esc(ev.name)} cursed ${who === 'You' ? 'you' : foe.name}`;
    if (ev.t === 'petguard') return `${esc(ev.name)} steadies itself`;
    if (ev.t === 'faint') return `${esc(ev.name)} went down! You fight on alone.`;
    if (ev.t === 'absorb') return `${who === 'You' ? 'Your' : who + "'s"} ward drinks ${ev.amount} damage${ev.broken ? ' and shatters' : ''}`;
    if (ev.t === 'lastlight') return `${who === 'You' ? 'You refuse' : who + ' refuses'} to fall: LAST LIGHT!`;
    if (ev.t === 'miss') return ev.whiffed ? `${who} put everything into a ${ACTIONS[ev.move] ? ACTIONS[ev.move].label.toLowerCase() : 'swing'}... and hit nothing but air` : `${who} whiffed the haymaker`;
    if (ev.t === 'aoe') return `${esc(ev.name)} unleashed a bone sweep — ${ev.dmgYou} to you${ev.dmgPet ? ` and ${ev.dmgPet} to your pet` : ''}!`;
    if (ev.t === 'shove') return `${who} shoved ${them} back`;
    if (ev.t === 'advance') return `${who} closed in`;
    if (ev.t === 'taunt') return `${who} talked trash`;
    if (ev.t === 'ko') return `${who} wins by KO`;
    return '';
  }

  function renderActions() {
    const factions = el('factions');
    const playerTurn = fight.active === 'p' && !fight.over;
    if (!playerTurn) {
      factions.innerHTML = `<p class="note" style="grid-column:1/-1;text-align:center;padding:8px">${fight.over ? '' : esc(foe.name) + ' is acting...'}</p>`;
      return;
    }
    if (petPhase) {           // your pet's turn: pick one of its moves
      const acts = petActionsFor(fight);
      let ph = `<p class="pet-turn-h" style="grid-column:1/-1">🐾 ${esc(petBody ? petBody.name : 'Pet')}'S TURN · pick a move</p>`;
      ph += acts.map(a => `<button class="fight-act petmove" data-petmove="${a.id}" ${a.enabled ? '' : 'disabled'}>
        <b>${a.name}</b><small>${a.enabled ? esc(a.desc) : `ready in ${a.cd}`}</small></button>`).join('');
      factions.innerHTML = ph;
      $$('[data-petmove]', factions).forEach(b => b.addEventListener('click', () => petAct(b.dataset.petmove)));
      return;
    }
    const legal = actionsFor(fight);
    const get = id => legal.find(a => a.id === id);
    const btn = (a, { hint = '', glow = false, weak = false } = {}) => a ? `
      <button class="fight-act ${glow ? 'glow' : ''} ${weak ? 'weak' : ''}" data-act="${a.id}" ${a.enabled ? '' : 'disabled'}>
        <b>${a.label}</b><small>${hint || `${'●'.repeat(a.ap)}${a.windCost ? ' ' + a.windCost + 'w' : ''}`}</small>
      </button>` : '';
    const dmgHint = id => {
      const est = expectedDamage(id === 'throwb' ? 'throwb' : id, player, null, foe);
      const mc = MISS_CHANCE[id];
      return `~${est} dmg · ${mc ? Math.round((1 - mc) * 100) + '% hit' : '●'.repeat(ACTIONS[id].ap)}`;
    };
    const guardAmt = Math.round(16 + player.stats.marrow * 0.15);
    // active defense (no more Block/Dodge): raise a shield or land a debuff
    const defenseRow = () => {
      let h = '';
      const g = get('guard');
      if (g) h += btn(g, { hint: `shield ~${guardAmt} · +stamina`, glow: (!!fight.telegraph && (player.ward || 0) <= 0) || player.hp < player.d.maxHp * 0.4 || player.wind < 20 });
      const r = get('rattle');
      if (r) h += btn(r, { hint: '-18% their dmg · saps stamina', weak: !!foe.weaken });
      return h;
    };

    let html = '';
    const sig = get('signature');
    if (sig) html += `<button class="fight-act sig" data-act="signature" ${sig.enabled ? '' : 'disabled'} style="grid-column:1/-1"><b>SIGNATURE</b><small>~${Math.round(120 * player.d.powerMult * (player.talents.has('showstopper') ? 1.25 : 1) * Math.pow(0.75, player.sigsUsed || 0))} dmg · full power${player.sigsUsed ? ' · encore' : ''}</small></button>`;

    const casterRow = () => {
      let h = '';
      const bolt = get('bonebolt');
      if (bolt) h += btn(bolt, { hint: `~${expectedDamage('bonebolt', player, null, foe)} dmg · any range` });
      const smiteA = get('smite');
      if (smiteA) h += btn(smiteA, { hint: `~${expectedDamage('smite', player, null, foe)} dmg${foe.sunder || foe.stagger ? ' · JUDGED!' : ' · holy'}`, glow: player.talents.has('judgement') && (!!foe.sunder || !!foe.stagger) });
      const fbolt = get('frostbolt');
      if (fbolt) h += btn(fbolt, { hint: `~${expectedDamage('frostbolt', player, null, foe)} dmg · chills`, glow: player.talents.has('frostbite') && foe.wind < 30 });
      const fire = get('firebolt');
      if (fire) h += btn(fire, { hint: `~${expectedDamage('firebolt', player, null, foe)} dmg · burns`, weak: !!foe.burn });
      const mendA = get('mend');
      if (mendA) h += btn(mendA, { hint: `heal · ${player.mendUses} left`, glow: player.hp < player.d.maxHp * 0.45 && player.mendUses > 0 });
      const wardA = get('ward');
      if (wardA) h += btn(wardA, { hint: 'shield: absorbs 25' });
      const spike = get('bonespike');
      if (spike) h += btn(spike, { hint: foe.blind ? 'blinds · already blind' : `~${expectedDamage('bonespike', player, null, foe)} dmg · blinds`, glow: !foe.blind });
      const hexA = get('hex');
      if (hexA) h += btn(hexA, { hint: 'curse: -20% their dmg', weak: !!foe.weaken });
      const raise = get('raisedead');
      if (raise) h += btn(raise, { hint: player.minion ? 'minion already up' : 'raise a bone minion · 3t', glow: !player.minion });
      const tot = get('totem');
      if (tot) h += btn(tot, { hint: player.totem ? 'totem already up' : 'zaps + stamina · 3t', glow: !player.totem });
      // Alchemist potions (build Toxicity, which powers alchemy damage)
      const flask = get('fireflask');
      if (flask) h += btn(flask, { hint: `~${expectedDamage('fireflask', player, null, foe)} dmg · burns · +tox`, weak: !!foe.burn });
      const acid = get('acidvial');
      if (acid) h += btn(acid, { hint: `~${expectedDamage('acidvial', player, null, foe)} dmg · sunders · +tox`, weak: !!foe.sunder });
      const swal = get('swallow');
      if (swal) h += btn(swal, { hint: `heal · ${player.swallowUses} left`, glow: player.hp < player.d.maxHp * 0.45 && player.swallowUses > 0 });
      const dbomb = get('deathbomb');
      if (dbomb) h += btn(dbomb, { hint: `bomb x3 · scales with Toxicity (${player.toxicity})`, glow: (player.toxicity || 0) >= 40 });
      // Crow Lord: grow the Flock, blind, then unleash the Murder
      const crows = get('callcrows');
      if (crows) h += btn(crows, { hint: `+2 crows · Flock ${player.flock || 0} pecks each turn`, glow: (player.flock || 0) < 2 });
      const peck = get('peckeyes');
      if (peck) h += btn(peck, { hint: `~${expectedDamage('peckeyes', player, null, foe)} dmg · blinds · +1 crow`, weak: !!foe.blind });
      const mrdr = get('murder');
      if (mrdr) h += btn(mrdr, { hint: `unleash ${player.flock || 0} crows · once`, glow: (player.flock || 0) >= 4 });
      return h;
    };
    // Blood Rage (Slab): any-range self-buff, offered in both rows
    const rageBtn = () => { const rg = get('rage'); return rg ? btn(rg, { hint: player.rage ? 'already raging' : '+35% dmg 3t · costs HP', glow: !player.rage && player.hp > player.d.maxHp * 0.5 }) : ''; };
    if (fight.range === 'close') {
      const titan = get('titan');
      if (titan) html += btn(titan, { hint: 'big hit · once', glow: true });
      const storm = get('bonestorm');
      if (storm) html += btn(storm, { hint: '3 magic hits · once', glow: true });
      const temp = get('tempest');
      if (temp) html += btn(temp, { hint: 'fire+frost x4 · once', glow: true });
      const flurry = get('flurry');
      if (flurry) html += btn(flurry, { hint: `all wind · 3 hits`, glow: player.wind > player.d.maxWind * 0.7 });
      html += rageBtn();
      html += casterRow();
      html += btn(get('jab'), { hint: dmgHint('jab') });
      html += btn(get('swing'), { hint: dmgHint('swing') });
      html += btn(get('haymaker'), { hint: dmgHint('haymaker') });
      html += defenseRow();
      html += `<button class="fight-act" id="moreBtn"><b>More</b><small>${showMore ? 'hide' : 'shove, taunt'}</small></button>`;
      if (showMore) {
        html += btn(get('shove'), { hint: 'knock to far' });
        html += btn(get('taunt'), { hint: player.talents.has('heckle') ? '+hype · weakens' : '+hype' });
      }
    } else {
      html += btn(get('advance'), { hint: 'close the gap', glow: !get('bonebolt') });
      html += btn(get('throwb'), { hint: dmgHint('throwb') });
      html += rageBtn();
      html += casterRow();
      html += defenseRow();
      html += btn(get('taunt'), { hint: player.talents.has('heckle') ? '+hype · weakens' : '+hype' });
    }
    // Potions: any brewed potion can be DRUNK mid-fight (1 AP), any class. This is
    // the kitchen's "beaming potion" — separate from the Alchemist's Toxicity kit.
    for (const p of POTIONS) {
      const n = potionInv[p.id] || 0;
      if (n <= 0) continue;
      const enabled = fight.active === 'p' && fight.ap >= 1 && !fight.over;
      html += `<button class="fight-act potion" data-potion="${p.id}" ${enabled ? '' : 'disabled'}><b>${p.icon} ${esc(p.name)}</b><small>x${n} · ${esc(potionShort(p))}</small></button>`;
    }
    html += `<button class="fight-act endturn" id="endTurn"><b>End Turn</b><small>${fight.ap} AP left</small></button>`;
    factions.innerHTML = html;
    $$('[data-act]', factions).forEach(b => b.addEventListener('click', () => playerAct(b.dataset.act)));
    $$('[data-potion]', factions).forEach(b => b.addEventListener('click', () => drinkPotion(b.dataset.potion)));
    $('#moreBtn', factions)?.addEventListener('click', () => { showMore = !showMore; renderActions(); });
    $('#endTurn', factions)?.addEventListener('click', endPlayerBody);
  }

  async function drinkPotion(id) {
    if (fight.over || fight.active !== 'p' || fight.ap < 1) return;
    const p = POTION_BY_ID[id];
    if (!p || !(potionInv[id] > 0)) return;
    if (!(await usePotion(id))) return;
    potionInv[id] -= 1; // keep local satchel in sync for the button count
    fight.ap -= 1;
    const e = p.effect || {};
    const floats = [];
    if (e.heal) { const h = Math.round(player.d.maxHp * e.heal); player.hp = Math.min(player.d.maxHp, player.hp + h); floats.push(`+${h}`); }
    if (e.stamina) { player.wind = player.d.maxWind; floats.push('+stamina'); }
    if (e.shield) { player.ward = Math.max(player.ward || 0, e.shield); floats.push(`+${e.shield} shield`); }
    if (e.dmgPct) { player.elixir = { pct: e.dmgPct, turns: (e.turns || 3) + 1 }; floats.push('FURY!'); }
    pulse(el('youStage'), e.dmgPct ? 'ragefx' : (e.shield ? 'wardfx' : 'mendfx'), fxMs + 300);
    floatNode(`${p.icon}`, 'p', 'stamp warm');
    floats.forEach((t, i) => setTimeout(() => floatNode(t, 'p', e.dmgPct ? 'stamp rage' : 'dmg heal'), 120 * (i + 1)));
    levelSound(S.sounds);
    setLog(`You drink a ${p.name}.`);
    refreshAll();
    if (fight.ap <= 0) endPlayerBody();
  }

  function setLog(msg) { const f = el('flog'); if (f) f.textContent = msg || '...'; }

  function refreshAll(msg) {
    positionFighters();
    updateBars();
    renderActions();
    if (msg != null) setLog(msg);
  }

  let pendingEnd = null;
  let petPhase = false;   // after your body's turn, you drive the pet's turn
  function playerAct(id) {
    if (fight.active !== 'p' || fight.over || petPhase) return;
    const evs = applyAction(fight, id);
    if (!evs.length) return;
    evs.forEach(playFx);
    refreshAll(evs.map(describe).filter(Boolean).join(' · '));
    if (fight.over) return settle();
    if (fight.ap <= 0 && !pendingEnd) pendingEnd = setTimeout(endPlayerBody, fast ? 120 : 500);
  }

  // your body's turn is done -> hand control to the pet (its own turn), or end
  function endPlayerBody() {
    if (pendingEnd) { clearTimeout(pendingEnd); pendingEnd = null; }
    if (fight.active !== 'p' || fight.over || petPhase) return;
    if (petActionsFor(fight).length) { petPhase = true; refreshAll("Your pet's turn."); return; }
    doEndTurn();
  }

  function petAct(id) {
    if (!petPhase || fight.over) return;
    petPhase = false;
    const evs = applyPetAction(fight, id);
    evs.forEach(playFx);
    updateBars();
    if (evs.length) setLog(evs.map(describe).filter(Boolean).join(' · '));
    if (fight.over) return settle();
    setTimeout(doEndTurn, fast ? 100 : 520);
  }

  function doEndTurn() {
    if (fight.active !== 'p' || fight.over) return;
    endTurn(fight);
    for (const tick of (fight.pendingTicks || [])) playFx(tick);
    fight.pendingTick = null; fight.pendingTicks = [];
    if (fight.over) return settle();
    refreshAll('');
    aiPlay();
  }

  function aiPlay() {
    const evs = aiTakeTurn(fight);
    let i = 0;
    const step = () => {
      if (!body.isConnected) return;
      const batch = [];
      while (i < evs.length) {
        const e = evs[i++];
        if (e.t === 'foeAction') { if (batch.length) break; continue; }
        batch.push(e);
        break;
      }
      if (batch.length) {
        batch.forEach(playFx);
        positionFighters(); updateBars();
        setLog(batch.map(describe).filter(Boolean).join(' · '));
      }
      if (i < evs.length && !fight.over) { setTimeout(step, beatMs); return; }
      if (fight.over) return settle();
      endTurn(fight);
      const ticks = fight.pendingTicks || [];
      if (ticks.length) { ticks.forEach(playFx); setLog(ticks.map(describe).join(' · ')); fight.pendingTick = null; fight.pendingTicks = []; if (fight.over) return settle(); }
      planTelegraph(fight);
      setTimeout(() => refreshAll('Your turn.'), beatMs * 0.7);
    };
    setTimeout(step, beatMs * 0.6);
  }

  async function settle() {
    if (settled) return; settled = true;
    await consumeFightFoodBuffs(); // combat dish buffs are spent one fight at a time
    const won = fight.over.winner === 'p';
    // KO choreography
    const loserStage = fight.over.winner === 'p' ? el('foeStage') : fight.over.winner === 'f' ? el('youStage') : null;
    if (loserStage) loserStage.classList.add('ko');
    if (fight.over.winner === 'p' && add && el('addStage')) el('addStage').classList.add('ko'); // both enemies drop
    renderActions();
    let coins = 0, xp = 0, extras = [], bossLoot = null;
    if (won) {
      await award(`fight-${Date.now().toString(36)}`, 'fight', 10, 'Pit win');
      xp += 10;
      if (foeCfg.mode === 'spar') { coins = 15; }
      else if (foeCfg.mode === 'boss') {
        const r = await claimDenWin(foeCfg.den, foeCfg.week);
        if (r) {
          xp += r.xp || 0;
          coins = r.coins || 0;
          if (r.crate) {
            extras.push(r.crate === 'golden' ? 'a Golden Crate' : r.crate === 'egg' ? 'a Step Egg' : 'a Daily Crate');
          }
          if (r.gearChoices) bossLoot = { key: denKey(foeCfg.week, foeCfg.den), den: foeCfg.den.name, choices: r.gearChoices };
          // world bosses are the other source of the RARE cooking ingredient
          const eN = foeCfg.add ? 2 : 1;
          await grantIngredient(RARE_INGREDIENT, eN);
          extras.push(`${INGREDIENTS[RARE_INGREDIENT].icon} Ectoplasm${eN > 1 ? ' x' + eN : ''}`);
        } else coins = 10; // den already cracked this week: pocket change
      }
      else if (foeCfg.mode === 'mini') {
        const r = await claimMiniWin(foeCfg.mini, foeCfg.date);
        if (r) {
          xp += r.xp || 0; coins = r.coins || 0;
          if (r.crate) extras.push(r.crate === 'golden' ? 'a Golden Crate' : r.crate === 'egg' ? 'a Step Egg' : 'a Daily Crate');
          if (r.dust) extras.push(`${r.dust} Bone Dust`);
        } else coins = 8; // already beaten today
      }
      else if (foeCfg.mode === 'rung') {
        if (!foeCfg.done) {
          const g = await award(`pitrung-${foeCfg.rung}`, 'pitrung', foeCfg.xp, `Ladder: beat ${foeCfg.name}`);
          if (g) { xp += g; coins = foeCfg.coins; } else coins = foeCfg.repeatCoins;
        } else coins = foeCfg.repeatCoins;
      } else if (foeCfg.mode === 'champ') {
        if (!foeCfg.done) {
          const g = await award('pitchamp', 'pitchamp', foeCfg.xp, `Champion: beat ${CHAMPION.name}`);
          if (g) {
            xp += g; coins = foeCfg.coins;
            await grantCrate('golden', 'pit-champion');
            await db.put('inv', { id: newId(), kind: 'weapon', weaponId: 'bonecrusher', source: 'pit-champion', ts: Date.now() });
            extras.push('the BONECRUSHER', 'a Golden Crate');
          } else coins = foeCfg.repeatCoins;
        } else coins = foeCfg.repeatCoins;
      } else if (foeCfg.mode === 'endless') {
        // first clear of each rank pays XP + full coins; re-clears pay diminishing coins
        const g = await award(`endless-${foeCfg.rank}`, 'endless', foeCfg.xp, `Gauntlet rank ${foeCfg.rank}: ${foeCfg.name}`);
        if (g) { xp += g; coins = foeCfg.coins; } else coins = foeCfg.repeatCoins;
      }
      // Battle Charm: spend a charge on the win for +25% coins.
      if (coins > 0) {
        const bonusPct = await consumeBattleCharmCharge();
        if (bonusPct > 0) {
          const bonus = Math.round(coins * bonusPct);
          coins += bonus;
          extras.push(`Battle Charm +${bonus} coins`);
        }
      }
      // Food dish coin boost (Zombie Fajita etc.)
      const fcm = await foodCoinMult();
      if (coins > 0 && fcm > 1) {
        const bonus = Math.round(coins * (fcm - 1));
        coins += bonus;
        extras.push(`Feast +${bonus} coins`);
      }
      if (coins) await coinsAdd(coins);
      const badges = await evaluateBadges();
      confettiRain(90); levelSound(S.sounds);
      if (badges.length) queueCelebration({ newBadges: badges });
    } else if (fight.over.winner === 'f') {
      coins = 5;
      await coinsAdd(coins);
    }
    const title = won ? 'VICTORY' : fight.over.winner === 'draw' ? 'DOUBLE KO' : 'DOWN, NOT OUT';
    const rewardHtml = won
      ? `<div class="sect-h" style="text-align:center;margin:10px 0 6px">You won</div>
         <div class="reward-row">
           <span class="reward-pill">${ICONS.coin(15)} +${coins}</span>
           ${xp ? `<span class="reward-pill">${ICONS.star(14)} +${xp} XP</span>` : ''}
           ${extras.map(e => `<span class="reward-pill">${esc(e)}</span>`).join('')}
         </div>`
      : `<p class="note" style="margin:8px 0 16px">${esc(fight.over.winner === 'draw' ? 'Both of you collapse. Call it cardio.' : `+${coins} consolation coins. Your bones keep every stat: eat well, walk far, run it back.`)}</p>`;
    setTimeout(() => {
      body.insertAdjacentHTML('beforeend', `
        <div class="fight-over">
          <div class="cele-big" style="color:${won ? 'var(--accent)' : 'var(--text-2)'}">${title}</div>
          ${bossLoot ? `
          <div class="loot-choice">
            <div class="sect-h" style="text-align:center">THE BOSS DROPPED · TAP TO COMPARE</div>
            <div class="loot-cards">
              ${bossLoot.choices.map(g => lootCardHtml(g)).join('')}
            </div>
            <button class="btn loot-keep" disabled>Tap a piece to preview</button>
          </div>` : ''}
          ${rewardHtml}
          <div style="height:12px"></div>
          <button class="btn ${bossLoot ? 'ghost' : ''}" id="fightDone">${bossLoot ? 'Skip loot · back to the map' : 'Back to The Pit'}</button>
        </div>`);
      const overEl = $('.fight-over', body);
      if (overEl) requestAnimationFrame(() => overEl.scrollIntoView({ behavior: 'smooth', block: bossLoot ? 'start' : 'nearest' }));
      if (bossLoot) {
        wireLootChoice($('.loot-choice', body), gid => claimDenLoot(bossLoot.key, gid), picked => {
          toast(`${picked.name} claimed. Equip it in your Wardrobe.`, 3200);
          const fd = $('#fightDone', body); if (fd) fd.textContent = 'Back to the map';
        });
      }
      $('#fightDone', body).addEventListener('click', () => { history.back(); setTimeout(() => renderPit(pitWrap), 250); maybeCelebrate(); });
    }, fast ? 80 : 750);
  }

  planTelegraph(fight);
  refreshAll('Round one. Your turn.');
}

/* ================= talents ================= */

// The Bone Merchant reads your build and recommends an archetype of weapon.
const ARCH_META = {
  melee:   { label: 'Melee', blurb: 'Power & Marrow bruisers', ico: '🦴' },
  caster:  { label: 'Caster', blurb: 'Hype spellcasters', ico: '☠' },
  support: { label: 'Support', blurb: 'Menders, wards & totems', ico: '✚' },
};
const ARCH_SIGNALS = {
  melee: ['heavyhands', 'marrowlust', 'bonebreaker', 'concussive', 'titan', 'rage', 'flurry', 'kite', 'bleedout', 'lightfeet'],
  caster: ['bonebolt', 'darkstudy', 'gravechill', 'bonestorm', 'frostbolt', 'firebolt', 'attunement', 'tempest', 'raisedead', 'bonespike'],
  support: ['mend', 'ward', 'smite', 'radiance', 'hallowed', 'blessedward', 'sanctified', 'totem', 'totemic', 'soulsiphon'],
};
function recommendArch(fighter) {
  const tals = new Set(fighter.fightTalents || fighter.talents || []);
  const score = { melee: 0, caster: 0, support: 0 };
  for (const [arch, ids] of Object.entries(ARCH_SIGNALS)) for (const id of ids) if (tals.has(id)) score[arch]++;
  let best = null, top = 0;
  for (const a of ['melee', 'caster', 'support']) if (score[a] > top) { top = score[a]; best = a; }
  if (best) return best;
  // no talent signal yet: fall back to the dominant stat
  const s = fighter.stats || {};
  if ((s.hype || 0) >= (s.power || 0) && (s.hype || 0) >= (s.marrow || 0)) return 'caster';
  if ((s.marrow || 0) > (s.power || 0)) return 'support';
  return 'melee';
}

async function openTalents(pitWrap) {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Talents</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body" id="talBody"></div>`, { cls: 'full', onClose: () => pitWrap && renderPit(pitWrap) });
  renderTalents(wrap);
}

async function renderTalents(wrap) {
  const body = $('#talBody', wrap) || (wrap && wrap.id === 'talBody' ? wrap : null);
  if (!body) return;
  const [xpRows, takenArr, fighter, coinBal] = await Promise.all([db.all('xp'), kvGet('talents', []), buildFighter(), coins()]);
  const taken = new Set(takenArr);
  const tranks = talentRanks(takenArr);
  const lvl = levelFor(xpRows.reduce((a, r) => a + (r.xp || 0), 0));
  const points = talentPoints(lvl.level);
  const unspent = Math.max(0, points - takenArr.length);
  const fightArr = fighter.fightTalents || fighter.talents;
  const d = derived(fighter.stats, WEAPONS[fighter.loadout], new Set(fightArr), fighter.gearArmor, talentRanks(fightArr));
  const recArch = recommendArch(fighter);

  // ----- Fighter stats (moved out of the Pit): what each stat DOES + spec it powers -----
  const statBlock = `
    <div class="sect-h">Your Fighter · ${d.maxHp} HP · ${d.maxWind} Stamina</div>
    <p class="note" style="margin:2px 2px 10px">Your base stats grow from your real habits. Spend <b>training points</b> to lean into a stat and shape your build. Every point here is a choice about how you fight.</p>
    <div class="def-readout">
      <span class="def-chip"><small>Armor</small><b>${Math.round(d.armor * 100)}%</b><i>vs melee</i></span>
      <span class="def-chip"><small>Spell Armor</small><b>${Math.round(d.spellArmor * 100)}%</b><i>vs magic</i></span>
    </div>
    <p class="note" style="margin:0 2px 10px">Armor cuts incoming damage by type. Physical Armor grows from Marrow, Spell Armor from Reflex, and worn gear adds to both.</p>
    <div class="stat-build">
      ${STAT_META.map(m => {
        const bonus = (fighter.alloc[m.key] || 0) * TRAIN_STEP;
        const gb = fighter.gearBonus?.[m.key] || 0;
        return `
        <div class="statx">
          <div class="statx-top">
            <span class="statx-name">${m.label}</span>
            <span class="statx-val">${fighter.stats[m.key]}${bonus ? ` <span class="stat-bonus">+${bonus}</span>` : ''}${gb ? ` <span class="stat-gear">+${gb} gear</span>` : ''}</span>
          </div>
          <div class="statline">
            <div class="bar pitstat" style="flex:1"><i style="width:${fighter.stats[m.key]}%"></i>${bonus ? `<span class="statbase" style="left:${fighter.baseStats[m.key]}%"></span>` : ''}</div>
            <button class="tp-btn" data-tpminus="${m.key}" ${(fighter.alloc[m.key] || 0) <= 0 ? 'disabled' : ''}>−</button>
            <button class="tp-btn" data-tpplus="${m.key}" ${fighter.tpAvail <= 0 ? 'disabled' : ''}>+</button>
          </div>
          <div class="statx-do">${esc(m.combat)}</div>
          <div class="statx-spec"><b>Good for:</b> ${esc(m.spec)} <span class="statx-from">· grows from ${esc(m.fedBy)}</span></div>
        </div>`;
      }).join('')}
      <div class="tp-bar">
        <span><b>Training points</b> · earned from protein hits + closing days</span>
        <span class="tp-count">${fighter.tpAvail} to spend${fighter.tpTotal ? ` · ${fighter.tpTotal - fighter.tpAvail}/${fighter.tpTotal} used` : ''}</span>
      </div>
      ${fighter.tpTotal - fighter.tpAvail > 0 ? '<button class="btn ghost small" id="tpReset" style="margin-top:8px">Reset training</button>' : ''}
    </div>
    <div class="sect-h">The Bone Merchant</div>
    <p class="note" style="margin:2px 2px 10px">The old skeleton lays out his wares by fighting style. He nods at your build: <b style="color:var(--accent)">${ARCH_META[recArch].label}</b> suits you. Weapons multiply your effort; they never replace it.</p>
    <div class="wallet-line"><span class="note">Your coins</span><b>${ICONS.coin(14)} ${coinBal.toLocaleString()}</b></div>
    ${(() => {
      const weaponCard = w => {
        const ownedW = fighter.owned.includes(w.id);
        const on = fighter.loadout === w.id;
        const cost = WEAPON_COST[w.id];
        const tierTag = w.tier ? `<span class="weap-tier t${w.tier}">${'★'.repeat(w.tier)}</span>` : '';
        const specTag = w.spec ? `<span class="weap-spec">rewards ${STAT_META.find(m => m.key === w.spec)?.label || w.spec}</span>` : '<span class="weap-spec">all-rounder</span>';
        const cta = ownedW
          ? `<button class="btn small ${on ? 'ghost' : ''}" data-weapon="${w.id}" ${on ? 'disabled' : ''}>${on ? 'Equipped' : 'Equip'}</button>`
          : cost != null
            ? `<button class="btn small" data-buyweapon="${w.id}" ${coinBal < cost ? 'disabled' : ''}>${ICONS.coin(13)} ${cost.toLocaleString()}</button>`
            : `<span class="q-frac">Champion drop</span>`;
        return `<div class="weap-card r-${w.rarity} ${on ? 'on' : ''} ${ownedW ? 'owned' : ''}">
          <div class="weap-top"><b>${esc(w.name)} ${tierTag}</b>${specTag}</div>
          <small class="weap-desc">${esc(w.desc)}</small>
          <div class="weap-cta">${cta}</div>
        </div>`;
      };
      const all = Object.values(WEAPONS);
      const baseline = all.find(w => !w.arch);
      const order = [recArch, ...['melee', 'caster', 'support'].filter(a => a !== recArch)];
      return `${baseline ? `<div class="weap-rack">${weaponCard(baseline)}</div>` : ''}
      ${order.map(arch => {
        const list = all.filter(w => w.arch === arch).sort((a, b) => (a.tier || 0) - (b.tier || 0) || (WEAPON_COST[a.id] || 9999) - (WEAPON_COST[b.id] || 9999));
        if (!list.length) return '';
        const rec = arch === recArch;
        return `<div class="merch-group${rec ? ' rec' : ''}">
          <div class="merch-head"><span class="merch-ico">${ARCH_META[arch].ico}</span><b>${ARCH_META[arch].label}</b><small>${ARCH_META[arch].blurb}</small>${rec ? '<span class="merch-rec">for your build</span>' : ''}</div>
          <div class="weap-rack">${list.map(weaponCard).join('')}</div>
        </div>`;
      }).join('')}`;
    })()}
    ${(() => {
      const parts = Object.entries(fighter.gearBonus || {}).filter(([, v]) => v > 0).map(([k, v]) => `+${v} ${k.toUpperCase()}`);
      const setActive = (fighter.setInfo?.sets || []).some(s => s.tiers.length);
      if (!parts.length && !setActive) return '';
      return `<div class="sect-h">Gear bonuses</div>
      ${parts.length ? `<p class="note" style="margin:2px 2px 8px">Worn gear grants ${parts.join(' · ')}. Equip pieces in your Wardrobe.</p>` : ''}
      ${setActive ? `<div class="set-note">${fighter.setInfo.sets.filter(s => s.tiers.length).map(s => `<div class="set-row"><b>${esc(s.epithet)} Set (${s.pieces})</b>${s.tiers.map(t => `<small>${t}pc: ${esc(setBonusLabel(s.arch, t))}</small>`).join('')}</div>`).join('')}</div>` : ''}`;
    })()}`;

  body.innerHTML = `
    ${statBlock}
    <div class="tal-head" style="margin-top:14px">
      <div><b style="font-family:var(--display);font-size:24px;letter-spacing:1px">${unspent}</b> <span class="note">talent point${unspent === 1 ? '' : 's'} to spend</span></div>
      <span class="note">1 point per level · Lv ${lvl.level}</span>
    </div>
    <p class="note" style="margin:2px 2px 14px">Specs change how you fight: new moves, new rhythms. Mix trees or go deep. Respec any time, free.</p>
    ${TALENT_TREES.map(tree => {
      const treeMax = tree.nodes.reduce((a, n) => a + nodeRanks(n), 0);
      const treeIn = tree.nodes.reduce((a, n) => a + Math.min(tranks[n.id] || 0, nodeRanks(n)), 0);
      return `
      <details class="tal-tree" ${treeIn > 0 ? 'open' : ''}>
        <summary class="tal-tree-head">
          <b style="color:${tree.color}">${tree.name}</b>
          <span class="tal-tag">${tree.tag}</span>
          <span class="note" style="margin-left:auto">${treeIn}/${treeMax} pts</span>
        </summary>
        <p class="note" style="margin:0 2px 8px">${tree.flavor}</p>
        ${[1, 2, 3, 4].map(tier => {
          const nodes = tree.nodes.map((n, i) => ({ n, i })).filter(x => x.n.tier === tier);
          if (!nodes.length) return '';
          const gate = { 1: 0, 2: 2, 3: 6, 4: 10 }[tier];
          const gateTxt = treeIn < gate ? `<div class="tal-gate">needs ${gate} point${gate === 1 ? '' : 's'} in ${tree.name}</div>` : '';
          const cards = nodes.map(({ n, i }) => {
            const max = nodeRanks(n);
            const cur = Math.min(tranks[n.id] || 0, max);
            const full = cur >= max;
            const can = !full && unspent > 0 && canTakeTalent(takenArr, tree.id, i);
            const cls = full ? 'taken' : cur > 0 ? 'partial' : can ? 'can' : 'locked';
            const pips = max > 1
              ? `<span class="tal-ranks">${Array.from({ length: max }, (_, r) => `<i class="${r < cur ? 'on' : ''}" style="${r < cur ? `background:${tree.color}` : ''}"></i>`).join('')}</span>`
              : '';
            const pipTxt = max > 1 ? `${cur}/${max}` : (full ? '✓' : tier === 4 ? '★' : 'T' + tier);
            return `<button class="tal-node ${cls}" data-talent="${n.id}" data-tree="${tree.id}" data-idx="${i}" ${can ? '' : 'disabled'}>
              <span class="tal-pip" style="${cur > 0 ? `background:${tree.color};border-color:${tree.color}` : ''}">${pipTxt}</span>
              <span class="tal-body"><b>${n.name}${n.move ? ' <span class="tal-move">NEW MOVE</span>' : ''}</b><small>${n.desc}</small>${pips}</span>
            </button>`;
          }).join('');
          return `${gateTxt}<div class="tal-tier ${nodes.length > 1 ? 'pair' : ''}">${cards}</div>`;
        }).join('')}
      </details>`; }).join('')}
    ${taken.size ? '<button class="btn danger" id="respecBtn">Respec (free) · refund all points</button>' : ''}`;

  async function adjustAlloc(key, delta) {
    const alloc = { ...(await kvGet('trainalloc', {})) };
    const cur = alloc[key] || 0;
    if (delta > 0 && fighter.tpAvail <= 0) return;
    if (delta < 0 && cur <= 0) return;
    alloc[key] = Math.max(0, cur + delta);
    await kvSet('trainalloc', alloc);
    popSound(S.sounds);
    renderTalents(wrap);
  }
  $$('[data-tpplus]', body).forEach(b => b.addEventListener('click', () => adjustAlloc(b.dataset.tpplus, +1)));
  $$('[data-tpminus]', body).forEach(b => b.addEventListener('click', () => adjustAlloc(b.dataset.tpminus, -1)));
  $('#tpReset', body)?.addEventListener('click', async () => { await kvSet('trainalloc', {}); popSound(S.sounds); renderTalents(wrap); });
  $$('[data-weapon]', body).forEach(b => b.addEventListener('click', async () => {
    await kvSet('loadout', b.dataset.weapon);
    popSound(S.sounds);
    renderTalents(wrap);
  }));
  $$('[data-buyweapon]', body).forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    const res = await buyWeapon(b.dataset.buyweapon);
    if (!res.ok) { toast(res.reason === 'coins' ? 'Not enough coins for that weapon.' : 'Already owned.'); b.disabled = false; return; }
    await kvSet('loadout', res.weaponId); // auto-equip the new weapon
    levelSound(S.sounds);
    confettiBurst(innerWidth / 2, innerHeight * 0.35, 14);
    toast(`${WEAPONS[res.weaponId].name} bought and equipped.`);
    renderTalents(wrap);
  }));
  $$('[data-talent]', body).forEach(b => b.addEventListener('click', async () => {
    const arr = await kvGet('talents', []); // rank = one entry each, so push (never dedupe)
    if (!canTakeTalent(arr, b.dataset.tree, Number(b.dataset.idx))) return;
    arr.push(b.dataset.talent);
    await kvSet('talents', arr);
    popSound(S.sounds);
    confettiBurst(innerWidth / 2, innerHeight * 0.3, 12);
    renderTalents(wrap);
  }));
  $('#respecBtn', body)?.addEventListener('click', async () => {
    await kvSet('talents', []);
    toast('Points refunded. Build something new.');
    renderTalents(wrap);
  });
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
  await kvSet('equipped', { H: 'H11-1', FW: 'FW1', IL: 'IL1-1', IR: 'IR1', C: 'C1', P: 'P1', BG: 'BG2-1', YD: 'YD1' });
  await db.put('inv', { id: 'demo-YD1', kind: 'cos', itemId: 'YD1', source: 'demo', ts: Date.now() });
  await db.put('inv', { id: 'demo-YD2', kind: 'cos', itemId: 'YD2', source: 'demo', ts: Date.now() });
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

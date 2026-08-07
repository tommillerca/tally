// Tally: app orchestrator. Screens, sheets, and flows.
import { db, kvGet, kvSet, newId, exportAll, importAll, useDbName, requestPersistence } from './db.js';
import { haptic, setHaptics } from './haptics.js';
import { setFxLayer, confettiBurst, confettiRain, tweenNumber, popSound, levelSound, hitSound, coinSound, chimeSound, sparkleSound, questSound, dropSound, reducedMotion } from './fx.js';
import {
  levelFor, totalXp, onFoodLogged, onWeighIn, onHealthSync, awardDayCloseIfDue,
  initGameIfNeeded, initLootIfNeeded, evaluateBadges, earnedBadgeIds,
  BADGES, xpForDate, parseHkPayload, award, claimFriendBattle,
} from './game.js';
import {
  RARITIES, CRATES, CONSUMABLES, SHOP, coins, coinsAdd, grantCrate, inventory, ownedCosmeticIds,
  unopenedCrates, openCrate, buyShopItem, equipped, equip, activateBattleCharm,
  ownedGearIds, grantGear, gearLoadout, equipGear,
  migrateLegacyEggs, eggProgress, hatchEgg, lifetimeStepsSum,
  battleCharmCharges, consumeBattleCharmCharge, consumableCount, consumeConsumable, VIGOR_DRAUGHT_AMOUNT, redeemCode,
  WEAPON_COST, weaponCoinCost, weaponDustCost, buyWeapon,
  boneDust, disenchantGear, salvagePet, gearDustValue, petDustValue, DUST_SHOP, buyWithDust, slimedGearIds,
  shinyPetIds,
  transmogMap, applyTransmog, clearTransmog, collectedLooks, transmogCost, TRANSMOG_HIDE, transmogPrice,
  fits, captureFit, applyFit, renameFit, deleteFit, fitPrice, fitThumbArt, MAX_FITS,
  DROP, buyDropItem, refundStreakFreezes,
} from './loot.js';
import { dailyQuests, weeklyQuests, monthlyQuests, questCtx, questState, claimQuest, claimAllBonusIfDue, periodKeyOf } from './quests.js';
import { getWellness, addWater, markBed, markSleep, WATER_GOAL, getRoutines, routinesDone, markRoutine, addRoutine, removeRoutine, ROUTINE_XP_CAP } from './wellness.js';
import { spawnsForRoute, spawnKey, collectSpawn, SPAWN_TYPES, COLLECT_RADIUS_M, RARE_CUE_M, fmtDist, compassLabel, distanceM, bearingDeg } from './hunt.js';
import { notifPrefs, setNotifPrefs, notifPlatform, requestNotifPermission, notifPermissionState, notifyNow, syncNotifications, scheduleRares, scheduleSiegeReminder, cancelSiegeReminder } from './notify.js';
import { snapToWalkable } from './geo.js';
import { CHANGES, changelogUnseen, changelogLatest } from './changelog.js';
import { bhIcon, hasBhIcon, BH_ICON_TINTS } from './icons-pack.js';
import * as social from './social.js';
import { NAME_ADJ, NAME_NOUN, buildName as buildDisplayName, randomName } from './names.js';
import { initAnalytics, track as trackEvent, flush as flushAnalytics, screen as trackScreen, sendReport, sendSurvey } from './analytics.js';
import { loadMaplibre, createBoneyardMap, domMarker, MAP_START_ZOOM } from './map.js';
import { spiresNear, readSpire, spireState, claimSpire, tendSpire, collectTribute, wardenFor, heldSpires,
  setSpireLevel, boonBonusFor, syncSieges, breakSiege, besiegedSpires, wardenTier, WARDEN_TIERS, spireKey,
  SPIRE_RADIUS_M, SPIRE_CAP, TRIBUTE_CAP_DAYS, RESOLVE_DAYS,
  BOON_PER_SPIRE, BOON_SPIRE_CAP, TRIBUTE_PER_DAY, TRIBUTE_DUST_PER_DAY } from './spires.js';
import { gluttonHeroHtml, gluttonStageHtml, startGluttonLoop } from './glutton.js';
import { GEAR_ITEMS, GEAR_BY_ID, GEAR_SLOTS, GEAR_SLOT_LABELS, gearStats, gearLabel, gearTalents, gearSetInfo, setBonusLabel, gearArmor } from './gear.js';
import { petPicks, setPetPick, petCounts, creditEquippedPetSteps, petInstances, equippedPetIid, equippedPetInstance, setEquippedPet, petStepsForIid, petLevelBank, salvageInstance, breedStatus, breedPets, breedCost, BREED_COOLDOWN_STEPS, grantPet } from './loot.js';
import { buildBattlePet, familyOf, petLevel, unlockedTiers, PET_TREES, PET_FAMILIES, petHovers, petBattleStats, PET_MAX_LEVEL, PET_LEVEL_STEPS, petStepsToNext, petSignature } from './pets.js';
import { densNear, denKey, denRewardLabel, remoteDen, denGearOdds, claimDenWin, claimDenLoot, isoWeekKey, DEN_RADIUS_M, denWinsCount, escalateDen, minisNear, miniKey, claimMiniWin, MINI_RADIUS_M, secretsNear, SECRET_WHISPER_M, SECRET_REVEAL_M, SECRET_RADIUS_M, gluttonSpot, GLUTTON_RADIUS_M, GLUTTON_BLIGHT_M, gluttonWindow, gluttonKey, claimGluttonWin } from './poi.js';
import { showGateIntro } from './gateintro.js';
import { maybeShowDailyWheel } from './wheel.js';
import { attachWalk } from './walk.js';
import { refreshPitEnergy, spendPitFight, addVigor, FREE_FIGHTS } from './energy.js';
import {
  INGREDIENTS, INGREDIENT_IDS, COMMON_INGREDIENT_IDS, RARE_INGREDIENT, RECIPES, ingredients, grantIngredient, canCook, ingredientCount,
  spawnIngredient, cookState, startCook, collectDish, activeFoodBuffs, foodCoinMult, foodCombatBuff, consumeFightFoodBuffs, fmtCookTime,
  POTIONS, POTION_BY_ID, RECIPE_BY_ID, potionsInv, usePotion, potionCount,
  MAX_POTS, nextPotPrice, addPot,
  pantryDishes, activatePantryDish, discardPantryDish,
  transmuteStatus, doTransmute, TRANSMUTE,
} from './cooking.js';
import {
  gardenState, cropsReady, seeds, grantSeed, plantSeed, waterPlot, harvestPlot,
  compostStatus, compostIngredient, plotPrice, addPlot, rollSpawnSeed,
  SEED_IDS, seedName, isRareSeed, growMinutes, PLOTS_MAX, SEED_ODDS,
  HARVEST_BASE, HARVEST_BASE_RARE,
} from './garden.js';
import { isNative, nativeHealthAvailable, nativeRequestAuth, nativeQueryToday, onAppResume } from './native.js';
import {
  deriveStats, derived, STAT_META, WEAPONS, ACTIONS, makeFighter, createFight, actionsFor, allocatedStats, TRAIN_STEP, TRAIN_CAP,
  applyAction, endTurn, aiTakeTurn, LADDER, CHAMPION, scaleStats, expectedDamage,
  TALENT_TREES, talentPoints, canTakeTalent, RUNG_TALENTS, MISS_CHANCE, endlessFoe, endlessCeiling,
  petActionsFor, applyPetAction, talentRanks, nodeRanks,
} from './pit.js';
import { BH_SLOTS, BH_ITEMS, BH_BY_ID, bhAsset } from '../data/boneheadz.js';
import { animatedPetHtml, petMassScale, ANIMATED_PETS } from './petanim.js';
import {
  computeTargets, nutrientsFor, portionLabel, dayTotals, dateKey, addDays,
  mealForHour, MEALS, fmtKcal, fmtG, fmtQty, streakFrom, weightTrend, trendRatePerWeek,
  lbToKg, kgToLb, ftInToCm, cmToFtIn, ACTIVITY_LEVELS, GOALS, kcalConsistent,
  activeCalorieBonus, assumedActiveBurn,
} from './nutrition.js';
import { GENERIC_FOODS, searchFoods } from '../data/generic-foods.js';
import { fetchOffProduct, fetchFdcByBarcode, searchOnline } from './sources.js';
import { parseNutritionText } from './labelparse.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };
// Online/last-seen label for Crew + leaderboard. last_seen updates on the ~5-min
// social sync, so "online now" = within ~6 min (accurate at session boundaries).
function onlineLabel(lastSeen) {
  if (!lastSeen) return { on: false, text: '' };
  const mins = (Date.now() - lastSeen) / 60000;
  if (mins < 6) return { on: true, text: 'online now' };
  if (mins < 60) return { on: false, text: `${Math.max(1, Math.round(mins))}m ago` };
  const hrs = mins / 60;
  if (hrs < 24) return { on: false, text: `${Math.round(hrs)}h ago` };
  const days = Math.round(hrs / 24);
  return { on: false, text: days <= 1 ? 'yesterday' : `${days}d ago` };
}

const S = {
  settings: null,
  userFoods: [],
  date: dateKey(),
  demo: new URLSearchParams(location.search).has('demo'),
  onlineCache: new Map(),
  ui: { ringPct: 0, remainShown: null, macroPcts: [0, 0, 0] }, // last-rendered values so charts animate between states
  celebration: null,
  sounds: true,
  glow: true,      // rarity/slime glow on your Bonehead's gear (Settings > App)
  shinyPets: new Set(), // pet ids the player owns as the ultra-rare shiny variant
  slimeSlots: new Set(), // avatar slots wearing SLIMED gear (Glutton drops)
};

// The pet art PNGs draw the creature small in the lower-right of a 640² canvas,
// so a plain <img> renders tiny. These are the measured content bounding boxes
// (fractions of the square) so we can crop each pet to its art and scale it to
// fill the slot — matching the tightly-framed animated pets (cloud/lizard).
const PET_CROP = {
  C1: { x0: 0.5594, y0: 0.6047, x1: 0.8531, y1: 0.8938 },
  C2: { x0: 0.5453, y0: 0.5922, x1: 0.9187, y1: 0.8500 },
  C3: { x0: 0.5422, y0: 0.6125, x1: 0.8969, y1: 0.8812 },
  C4: { x0: 0.5344, y0: 0.6250, x1: 0.8891, y1: 0.8938 },
  C5: { x0: 0.5375, y0: 0.6391, x1: 0.8422, y1: 0.8797 },
  CX: { x0: 0.5375, y0: 0.6281, x1: 0.8859, y1: 0.8906 },   // Day One Lizard = C4 recolored at the same bbox
};
// Height-per-unit-width for a STATIC cropped pet, matching croppedPetImg's maths
// (FILL 0.82 against the longest content edge). Pairs with petMassScale() for the
// animated stack so a pet is the same visual size whichever path draws it.
function staticMassScale(petId) {
  const c = PET_CROP[petId];
  if (!c) return 1;
  const h = id => {
    const k = PET_CROP[id]; if (!k) return null;
    const cw = k.x1 - k.x0, ch = k.y1 - k.y0;
    return ch / Math.max(cw, ch);
  };
  const mine = h(petId);
  const tallest = Math.max(...Object.keys(PET_CROP).map(h).filter(Boolean));
  return mine ? tallest / mine : 1;
}
// A pet's display scale, whichever way it is drawn. Flat species (lizards) would
// otherwise render a third shorter than round ones (the cloud) in the same box.
function petScale(petId) {
  return ANIMATED_PETS.has(petId) ? petMassScale(petId) : staticMassScale(petId);
}
// Render a static pet image cropped to its content and scaled to ~fill a px box.
// ground=true seats the art on the box floor; else it's vertically centered (hover).
function croppedPetImg(petId, px, ground = false, srcOverride = null) {
  const src = srcOverride || bhAsset(BH_BY_ID[petId]);
  const c = PET_CROP[petId];
  if (!c) return `<span class="petcrop" style="width:${px}px;height:${px}px"><img src="${src}" style="width:${px}px;height:${px}px;object-fit:contain" alt=""></span>`;
  const FILL = 0.82;                                   // match the animated pets' ~63px fill in a 76px box
  const cw = c.x1 - c.x0, ch = c.y1 - c.y0;            // content size (fraction of the square)
  const imgSize = (px * FILL) / Math.max(cw, ch);      // displayed size of the whole square image
  const tx = (px - cw * imgSize) / 2 - c.x0 * imgSize; // center content horizontally
  const ty = ground ? (px - c.y1 * imgSize)            // seat content bottom on the floor
                     : ((px - ch * imgSize) / 2 - c.y0 * imgSize); // else center (hover)
  return `<span class="petcrop" style="width:${px}px;height:${px}px"><img src="${src}" style="position:absolute;left:0;top:0;width:${imgSize.toFixed(1)}px;height:${imgSize.toFixed(1)}px;max-width:none;transform:translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px)" alt=""></span>`;
}
// Pet sprite: shiny -> static recolored variant (+ glow); else the animated
// layer stack (C1/C4) or a content-cropped base image. Shiny state is cached in
// S.shinyPets (refreshed at boot + after hatch) so render stays synchronous.
// mass:true normalises flat species up so they read the same size as round ones.
// Opt-in, because the fight arena's 76px stage is tuned against the fighter sprite
// and scaling the pet there re-creates the combat overlap fixed back in v49.
// opts.shiny OVERRIDES the S.shinyPets lookup. S.shinyPets is the VIEWER's own
// collection, so it is only correct for the viewer's own pet: rendering a
// FRIEND's pet through it showed their shiny in base colours (Brock's lizard).
function petSpriteHtml(petId, px, ground = false, { mass = false, shiny } = {}) {
  // CX (Day One Lizard) has no shiny static variant; its amethyst art IS the
  // special look, so always render its animated self even if the instance is shiny.
  // Every path scales by the species' visual mass, so a colourway is never a
  // different size from its base pet.
  const S2 = mass ? Math.round(px * petScale(petId)) : px;
  const isShiny = shiny !== undefined ? !!shiny : S.shinyPets.has(petId);
  if (petId !== 'CX' && isShiny) {
    // Cropped like every other pet. This used to be a raw <img> at px, which drew
    // the creature tiny inside its box because the source art sits small in a 640²
    // canvas: a shiny lizard came out a fraction of the normal one.
    return `<div class="pet-shiny-wrap">${croppedPetImg(petId, S2, ground, `assets/bh/C/shiny/${petId}.png`)}<span class="shiny-spark">${sparkIco(14)}</span></div>`;
  }
  return animatedPetHtml(petId, S2) || croppedPetImg(petId, S2, ground);
}
// PORTRAIT: always content-cropped + vertically CENTERED in its box (no animation,
// no floor-seating), so a pet reads the same in a roster tile regardless of whether
// it's an animated/hovering/grounded species. Shiny uses its recolour, same crop.
function petPortraitHtml(petId, px, shiny = false, { mass = false } = {}) {
  if (petId === 'CX') shiny = false; // Day One Lizard: amethyst CX.png is the portrait (no shiny static)
  const src = shiny ? `assets/bh/C/shiny/${petId}.png` : bhAsset(BH_BY_ID[petId]);
  const inner = croppedPetImg(petId, mass ? Math.round(px * petScale(petId)) : px, false, src);
  return shiny ? `<div class="pet-shiny-wrap">${inner}<span class="shiny-spark">${sparkIco(12)}</span></div>` : inner;
}
async function refreshShinyPets() { S.shinyPets = new Set(await shinyPetIds()); }
/* Which avatar slots are wearing SLIMED gear. Cached the same way shiny pets are,
   because the glow has to appear on every avatar render and avatarLayersHtml has
   14 call sites: threading a parameter through all of them is how one of them
   ends up missed. The wardrobe cell glowed while the Bonehead itself did not,
   which is exactly that mistake made once already. */
async function refreshSlimedSlots() {
  try {
    const [ids, lo] = await Promise.all([slimedGearIds(), gearLoadout()]);
    const set = new Set();
    for (const [slot, gid] of Object.entries(lo || {})) if (gid && ids.has(gid)) set.add(slot);
    S.slimeSlots = set;
  } catch { S.slimeSlots = new Set(); }
}

// 4-point sparkle in the game's art style (flat gold fill, thick dark outline).
// Replaces ✨/✦ emoji + text glyphs so decorations match Cam's illustrations.
function sparkIco(s = 14, fill = '#ffe08a') {
  return `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 2.5c.7 4.2 2.1 6.6 3 7.5s3.3 2.3 7.5 3c-4.2.7-6.6 2.1-7.5 3s-2.3 3.3-3 7.5c-.7-4.2-2.1-6.6-3-7.5s-3.3-2.3-7.5-3c4.2-.7 6.6-2.1 7.5-3s2.3-3.3 3-7.5z" fill="${fill}" stroke="#3a2b12" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

const ICONS = {
  mapmark: (s = 20) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#8fd0ff" stroke-width="1.8" stroke-linecap="round"><path d="M12 21c-4.4-4.5-6.6-8-6.6-11A6.6 6.6 0 0 1 12 3.4 6.6 6.6 0 0 1 18.6 10c0 3-2.2 6.5-6.6 11z" fill="rgba(143,208,255,0.14)"/><circle cx="9.8" cy="9.6" r="1.15" fill="#8fd0ff" stroke="none"/><circle cx="14.2" cy="9.6" r="1.15" fill="#8fd0ff" stroke="none"/><path d="M10.4 12.6h3.2" stroke-width="1.6"/></svg>`,
  barcode: '<svg viewBox="0 0 24 24"><path d="M3 6v12M7 6v12M10 6v8M13 6v12M16 6v8M19 6v12M21 6v12"/></svg>',
  label: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2L4.5 13.5H11L9.5 22 19 10h-6.5z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  star: (a, filled) => {
    const px = typeof a === 'number' ? a : 21;
    const on = typeof a === 'number' ? filled !== false : !!a;
    return `<svg class="ico" viewBox="0 0 24 24" style="width:${px}px;height:${px}px;${on ? 'fill:var(--carbs);stroke:var(--carbs)' : 'fill:none;stroke:var(--text-3)'};stroke-width:1.8"><path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.9 6.4 20l1.3-6.2L3 9.5l6.3-.7z"/></svg>`;
  },
  coin: (s = 14) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.2" fill="#ffb454" stroke="#3a2b12" stroke-width="1.6"/><circle cx="12" cy="12" r="6.9" fill="none" stroke="#3a2b12" stroke-width="1" opacity="0.45"/><g fill="#5a3f14"><circle cx="7.8" cy="10.6" r="1.6"/><circle cx="7.8" cy="13.4" r="1.6"/><circle cx="16.2" cy="10.6" r="1.6"/><circle cx="16.2" cy="13.4" r="1.6"/><rect x="7.4" y="10.7" width="9.2" height="2.6" rx="1.3"/></g></svg>`,
  flame: (s = 15) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 2.6s5.8 4.6 5.8 10.4c0 3.9-2.6 6.9-5.8 6.9s-5.8-3-5.8-6.9c0-2.4 1.2-4.6 2.4-6.1 0 1.5.6 2.6 1.6 2.6 1.3.6 1.8-2.9 1.8-6.9z" fill="#ffb454" stroke="#3a2313" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 12.3c1.4 1 2.1 2.2 2.1 3.4 0 1.6-.9 2.7-2.1 2.7s-2.1-1.1-2.1-2.7c0-1.2.7-2.4 2.1-3.4z" fill="#ffe08a"/></svg>`,
  boltIco: (s = 18) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M13 2.5L5.4 13h5l-1.6 8.5L18.6 10h-5z" fill="#ffe08a" stroke="#3a2b12" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  sneaker: (s = 19) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M3 15.5c0-1.1.8-2 2-2h4l3-3.6c2.5 2 6.4 3 8.4 3.5.9.2 1.6 1 1.6 2v2.1H3z" fill="#ff9dc7" stroke="#33121f" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 18h19" stroke="#33121f" stroke-width="1.7" stroke-linecap="round"/><path d="M10.5 12.5l1.2 1.2M12.5 10.7l1.2 1.2" stroke="#33121f" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  paw: (s = 23) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><g fill="#c084fc" stroke="#2a1c3d" stroke-width="1.2"><ellipse cx="12" cy="15.5" rx="4.6" ry="3.6"/><ellipse cx="6.4" cy="10.4" rx="1.9" ry="2.4"/><ellipse cx="17.6" cy="10.4" rx="1.9" ry="2.4"/><ellipse cx="9.4" cy="7.4" rx="1.8" ry="2.3"/><ellipse cx="14.6" cy="7.4" rx="1.8" ry="2.3"/></g></svg>`,
};

/* Tier 1 additions. Stroke icons sized at the call site, so they can sit in a
   40px control without the CSS having to know which icon it got. */
const t1Stroke = (s, d) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
ICONS.close = (s = 18) => t1Stroke(s, `<path d="M6 6l12 12M18 6L6 18"/>`);
ICONS.chev = (s = 16) => t1Stroke(s, `<path d="M9 5l7 7-7 7"/>`);
ICONS.hidden = (s = 18) => t1Stroke(s, `<circle cx="12" cy="12" r="8.6"/><path d="M6 18L18 6"/>`);
ICONS.warn = (s = 16) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 3.2l9 15.6H3z" fill="#ff6d5e" stroke="#2a2d28" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 8.6v4.6" stroke="#2a2d28" stroke-width="2.1" stroke-linecap="round"/><circle cx="12" cy="16.2" r="1.15" fill="#2a2d28"/></svg>`;
/* Bone Dust: a violet sticker gem in the game's own style, replacing the ◆ text
   glyph it has used everywhere since launch. Flat fill + ink outline, like the coin. */
ICONS.dust = (s = 14) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 2.6l7.8 9.4-7.8 9.4-7.8-9.4z" fill="#9b92e8" stroke="#2a2d28" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 6.4l4.6 5.6-4.6 5.6" fill="none" stroke="#f2e9d7" stroke-width="1.3" opacity=".55"/></svg>`;
/* a drawn tick, for the 18 places a ✓ text glyph marked something done */
ICONS.check = (s = 14) => t1Stroke(s, `<path d="M4.5 12.5l5 5 10-11"/>`);
ICONS.up = (s = 12) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 5l7 11H5z" fill="currentColor"/></svg>`;
ICONS.down = (s = 12) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 19L5 8h14z" fill="currentColor"/></svg>`;
ICONS.quest = (s = 18) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M5.4 3.4h10.2c1 0 1.8.8 1.8 1.8v13.6c0 1-.8 1.8-1.8 1.8H5.4c-1 0-1.8-.8-1.8-1.8V5.2c0-1 .8-1.8 1.8-1.8z" fill="#f2e9d7" stroke="#3a352a" stroke-width="1.6" stroke-linejoin="round"/><path d="M17.4 7.4h1.4c1 0 1.8.8 1.8 1.8v9.6c0 1-.8 1.8-1.8 1.8" fill="none" stroke="#3a352a" stroke-width="1.5" stroke-linecap="round"/><path d="M6.6 7.4h7.2M6.6 11h7.2M6.6 14.6h4.6" stroke="#3a352a" stroke-width="1.5" stroke-linecap="round"/></svg>`;
ICONS.torchIco = (s = 18) => t1Stroke(s, `<path d="M9 2h6l-1 5h3l-8 15 1.6-9H7z"/>`);
ICONS.crosshair = (s = 18) => t1Stroke(s, `<circle cx="12" cy="12" r="7.4"/><path d="M12 1.6v3.4M12 19v3.4M1.6 12H5M19 12h3.4"/>`);
ICONS.lock = (s = 15) => t1Stroke(s, `<rect x="4.5" y="10" width="15" height="10" rx="2.4"/><path d="M8 10V7.6a4 4 0 0 1 8 0V10"/>`);
ICONS.camera = (s = 18) => t1Stroke(s, `<path d="M3.4 8.4h3.4l1.6-2.4h7.2l1.6 2.4h3.4v10.2H3.4z"/><circle cx="12" cy="13.2" r="3.4"/>`);
ICONS.photos = (s = 18) => t1Stroke(s, `<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.4"/><path d="M3.6 16.4l4.6-4.4 3.4 3 3.2-3.6 5.6 5.4"/><circle cx="8.6" cy="9.4" r="1.5"/>`);
ICONS.barcodeIco = (s = 19) => t1Stroke(s, `<path d="M3 6v12M7 6v12M10 6v8M13 6v12M16 6v8M19 6v12M21 6v12"/>`);
ICONS.labelIco = (s = 19) => t1Stroke(s, `<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>`);
ICONS.boltStroke = (s = 19) => t1Stroke(s, `<path d="M13 2L4.5 13.5H11L9.5 22 19 10h-6.5z"/>`);
ICONS.searchIco = (s = 18) => t1Stroke(s, `<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>`);

ICONS.pit = (s = 22) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><g stroke="#3a352a" stroke-width="1.2" fill="#f2e9d7"><g transform="rotate(45 12 12)"><circle cx="12" cy="4.6" r="2"/><circle cx="9.6" cy="6.2" r="2"/><circle cx="12" cy="19.4" r="2"/><circle cx="14.4" cy="17.8" r="2"/><rect x="10.9" y="5.5" width="2.2" height="13" rx="1.1"/></g><g transform="rotate(-45 12 12)"><circle cx="12" cy="4.6" r="2"/><circle cx="14.4" cy="6.2" r="2"/><circle cx="12" cy="19.4" r="2"/><circle cx="9.6" cy="17.8" r="2"/><rect x="10.9" y="5.5" width="2.2" height="13" rx="1.1"/></g></g></svg>`;
ICONS.radar = (s = 14) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.4" fill="none" stroke="#7cc4ff" stroke-width="1.7"/><circle cx="12" cy="12" r="5" fill="none" stroke="#7cc4ff" stroke-width="1.4" opacity="0.6"/><circle cx="12" cy="12" r="1.8" fill="#7cc4ff"/><path d="M12 12L18.5 5.5" stroke="#7cc4ff" stroke-width="1.7" stroke-linecap="round"/></svg>`;
ICONS.bone = (s = 18) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><g fill="#f2e9d7" stroke="#3a352a" stroke-width="1.3"><circle cx="6.2" cy="7.6" r="2.6"/><circle cx="8.8" cy="5" r="2.6"/><circle cx="17.8" cy="16.4" r="2.6"/><circle cx="15.2" cy="19" r="2.6"/><rect x="6.4" y="9.2" width="11.4" height="4" rx="2" transform="rotate(45 12 12)"/></g></svg>`;
ICONS.water = (s = 22) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 3.2s6.2 6.6 6.2 10.8A6.2 6.2 0 0 1 5.8 14C5.8 9.8 12 3.2 12 3.2z" fill="#7cc4ff" stroke="#173a52" stroke-width="1.5" stroke-linejoin="round"/><path d="M9.4 13.6a2.6 2.6 0 0 0 2.6 2.6" fill="none" stroke="#e8f5ff" stroke-width="1.4" stroke-linecap="round"/></svg>`;
ICONS.bed = (s = 22) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#f2e9d7" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-7M3 14h18v4M21 18v-4a3 3 0 0 0-3-3H9v3" fill="rgba(242,233,215,0.12)"/><path d="M5.5 11V9.4a1.6 1.6 0 0 1 1.6-1.6" /></svg>`;
ICONS.moon = (s = 22) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5z" fill="#b6a8e8" stroke="#2a2340" stroke-width="1.5" stroke-linejoin="round"/><circle cx="16.5" cy="7.5" r="0.9" fill="#f0ecff"/></svg>`;
ICONS.trend = (s = 15) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15l4.6-4.6 3 3L20 6.5"/><path d="M14.5 6.5H20v5.5"/></svg>`;

function spawnIcon(type, s = 20) {
  if (type === 'coins') return ICONS.coin(s);
  if (type === 'crate') return crateIcon('daily', s);
  if (type === 'rare') return crateIcon('egg', s); // Mystery Egg spawn
  if (type === 'herbs') return bhIcon('garden-seed', s);
  return ICONS.bone(s);
}

function crateIcon(kind, s = 22) {
  const id = kind === 'golden' ? 'crate-golden' : kind === 'egg' ? 'egg' : 'crate-daily';
  return `<span class="bhi-wrap">${bhIcon(id, s)}</span>`;
}
// The Boneyard map key: every marker type that can appear out there, rendered with
// the EXACT same marker markup the map draws (so the legend and the map never drift).
// Covers spawns + all three den looks incl. the pink secret dens.
function mapLegendHtml() {
  const den = (cls = '') => `<div class="map-den-mark${cls}"><div class="den-fx"><span class="den-eyes"><i></i><i></i></span><img src="assets/brand/tombstone.png" alt=""><span class="den-skulls">${bhIcon('badge-skull', 13, 'currentColor').repeat(2)}</span></div></div>`;
  const spawn = (type, extra = '') => `<div class="map-spawn${extra}">${spawnIcon(type)}</div>`;
  const mini = `<div class="map-mini-mark">${bhIcon('badge-skull', 17)}</div>`;
  const rows = [
    [spawn('bones'), 'Bone cache', 'XP for your bonehead'],
    [spawn('coins'), 'Coin pile', 'Coins to spend in the shop'],
    [spawn('crate'), 'Buried crate', 'A common crate of loot'],
    [spawn('herbs'), 'Herb patch', 'Seeds for the Bone Garden'],
    [spawn('rare', ' rare'), 'Mystery egg', 'Rare: walk to hatch a pet'],
    [mini, 'Mini-boss', 'A quick fight for coins + XP'],
    [den(), 'Boss den', 'A landmark boss: rare gear'],
    [den(' roaming'), 'Roaming den', 'A daily den: here today, gone tomorrow'],
    [den(' secret'), 'Secret den', 'A hidden boss, only where one is buried'],
  ];
  return `<div class="leg-h">MAP KEY</div>${rows.map(([m, n, d]) =>
    `<div class="leg-row"><span class="leg-ico">${m}</span><span class="leg-txt"><b>${n}</b><small>${d}</small></span></div>`).join('')}`;
}
function consumableIcon(type, s = 20) {
  if (type === 'vigor') return ICONS.boltIco(s);
  return `<span class="bhi-wrap">${bhIcon('charm', s)}</span>`;
}
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
/* ONE TAP MUST NEVER SPEND. Tom's rule, after a player bought a 1,000-coin cauldron
 * by accident, and after he lost 25 dust to the Bone Dust shop the same way.
 *
 * Four separate places had grown their own copy of this arm-then-confirm dance and
 * four more had none at all, which is exactly how the expensive ones got missed. So
 * it lives here once. Wrap ANY control that spends coins or dust:
 *
 *   armToConfirm(btn, 'Spend 1,000?', async () => { ...actually buy... });
 *
 * The first tap only arms and relabels; the second buys. It cools off on its own so
 * a forgotten armed button can never be triggered by a later stray tap, and it
 * restores the original label whatever happens. */
const ARM_COOLOFF_MS = 3200;
function armToConfirm(btn, confirmLabel, onConfirm, { cooloff = ARM_COOLOFF_MS } = {}) {
  if (!btn || btn.dataset.armWired === '1') return;
  btn.dataset.armWired = '1';
  let t = null;
  const restore = () => {
    if (!btn.isConnected) return;
    btn.dataset.armed = '0';
    btn.classList.remove('arming');
    if (btn.dataset.armLabel != null) btn.innerHTML = btn.dataset.armLabel;
  };
  btn.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();
    if (btn.dataset.armed !== '1') {
      if (btn.dataset.armLabel == null) btn.dataset.armLabel = btn.innerHTML;
      btn.dataset.armed = '1';
      btn.classList.add('arming');
      btn.innerHTML = esc(confirmLabel);
      clearTimeout(t);
      t = setTimeout(restore, cooloff);
      return;
    }
    clearTimeout(t);
    haptic.heavy();   // the second tap commits: every spend/destroy thumps once
    restore();
    await onConfirm();
  });
}

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
  // Pick the outfits and warm everything BEFORE the sequence starts. Each word
  // only holds for 430ms, so a stack that begins loading when it appears is still
  // assembling when it is replaced, which read as the previews glitching.
  const outfits = ['EAT.', 'LOG.', 'EVOLVE.'].map(() => randomOutfit());
  const warm = Promise.all(outfits.flatMap(eq => BH_SLOTS
    .map(s => (eq[s.code] && BH_BY_ID[eq[s.code]]) ? bhAsset(BH_BY_ID[eq[s.code]]) : null)
    .filter(Boolean)
    .map(src => new Promise(res => { const i = new Image(); i.onload = i.onerror = res; i.src = src; }))));
  // Bangers is font-display:swap and the splash is the first paint, so without
  // this "EAT." renders in the fallback face and swaps a beat later.
  const font = document.fonts ? document.fonts.load('60px Bangers').catch(() => {}) : Promise.resolve();
  // Bounded: a slow network must never hold the app on a blank splash.
  await Promise.race([Promise.all([warm, font]), beat(900)]);

  for (const [i, word] of ['EAT.', 'LOG.', 'EVOLVE.'].entries()) {
    if (done) return;
    el.innerHTML = `<div class="splash-inner"><div class="splash-stage">${avatarLayersHtml(outfits[i])}</div><div class="splash-word">${word}</div></div>`;
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

  // One-off: players who claimed the Day One Lizard before v241 got it filed in
  // the Stable and never put on their shoulder, so the celebration was followed by
  // an unchanged home screen. Only fires when the companion slot is empty, so it
  // can never displace a pet someone picked.
  try {
    if (!(await kvGet('dayOneEquipFix', false))) {
      await kvSet('dayOneEquipFix', true);
      const eqNow = await equipped({ raw: true });
      if (!eqNow.C && (await ownedCosmeticIds()).has('CX')) await equip('C', 'CX');
    }
  } catch { /* cosmetic backfill; never block boot */ }

  if ('serviceWorker' in navigator && !S.demo && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      // resumed PWAs never re-navigate, so check for updates whenever we come back
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; } // first-ever install
      if (!sheetStack.length) location.reload();   // apply the new build as soon as no sheet is open
      else toast('Update ready — leave this screen to apply', 3600);
    });
  }
  requestPersistence();
  S.sounds = (await kvGet('sounds', true)) !== false;
  S.haptics = (await kvGet('haptics', true)) !== false;
  setHaptics(S.haptics);
  S.glow = (await kvGet('glow', true)) !== false;
  equipped().then(eq => showSplash(eq)).catch(() => {});

  // Cloud restore (fresh / wiped / new phone): pull the encrypted backup BEFORE
  // the onboarding gate, so a reinstalled or reset device comes back to its
  // progress instead of a blank slate. ensureIdentity inside bootSync recovers
  // the account key from the OS keychain first. Inert until the backend is
  // configured (apiBase '' -> returns immediately), so this is a no-op today.
  // Never register demo/automated sessions on the real social server: each
  // fresh ?demo or webdriver session has empty storage, so bootSync would mint
  // a brand-new phantom player (this once put 20 fake level-8 "players" in the
  // DB, polluting the leaderboard). Real users never run with ?demo.
  const NOSOCIAL = S.demo || navigator.webdriver === true;
  await social.initFromQuery();
  const cloudRestore = NOSOCIAL ? null : await social.bootSync().catch(() => null);
  if (cloudRestore && cloudRestore.restored) {
    S.settings = await kvGet('settings');
    S.userFoods = await db.all('foods');
    setTimeout(() => toast('Welcome back. Your progress was restored from your cloud backup.', 4600), 900);
  }

  if (!S.settings) { renderOnboarding(); return; }

  const init = await initGameIfNeeded(S.settings.targets);
  if (init && init.xp > 0) setTimeout(() => toast(`Progress imported: Level ${init.level.level} · ${init.xp.toLocaleString()} XP`, 3200), 700);
  const kit = await initLootIfNeeded();
  if (kit) setTimeout(() => toast('Welcome kit: 2 crates are waiting on your Bonehead', 3600), init && init.xp > 0 ? 4200 : 900);
  await refreshShinyPets();
  await refreshSlimedSlots();
  const closed = await awardDayCloseIfDue(S.settings.targets);
  if (closed?.closed) setTimeout(() => toast('Yesterday closed on budget: Golden Crate earned', 3400), 2400);
  else if (closed?.consoled) setTimeout(() => toast("You logged yesterday. You'll get 'em next time: Common Crate earned", 3600), 2400);
  await ingestHkFromUrl();
  backupNudge();
  nativeAutoSync();
  setTimeout(checkPetLevelUp, 1500); // catch pet level-ups that happened while away
  // social: push the game snapshot + encrypted backup, pull server grants
  // (throttled, silent). initFromQuery + bootSync already ran above.
  if (!NOSOCIAL) social.autoSync(socialSnapshot, APP_SOCIAL_V).then(presentGrantDelivery).then(() => checkFriendRequests()).then(checkSieges);
  onAppResume(() => { rollDayIfNeeded(); nativeAutoSync(); if (!NOSOCIAL) social.autoSync(socialSnapshot, APP_SOCIAL_V).then(presentGrantDelivery).then(() => checkFriendRequests()).then(checkSieges); flushAnalytics(); refreshNotifSchedules(); });
  setInterval(rollDayIfNeeded, 60e3); // and for an app left open across midnight
  refreshNotifSchedules(); // (re)schedule reminders + upcoming rare pushes per prefs
  initAnalytics(APP_BUILD); // anonymous first-party usage analytics — tag events with the real running build (not the frozen social-protocol version)

  window.addEventListener('hashchange', route);
  bindTabs();
  route();

  // daily haunted prize wheel: once per day, after the splash intro. Self-gates
  // (once/day kv, waits for splash, skips webdriver). Fire-and-forget.
  maybeShowDailyWheel({ sounds: S.sounds }).catch(() => {});
  refundStreakFreezes().then(r => {
    if (r) toast(`Streak Freezes have been retired. Your ${r.count} paid out: +${r.coins.toLocaleString()} coins.`, 5200);
  }).catch(() => {});
  maybeShowWhatsNew();
  maybeShowDropPopup();
  maybeShowGardenPopup();
  maybeShowSpireIntro();
  maybeShowRaceIntro();
  maybePromptRecovery();
  maybePromptName();
  maybeRequestNotifPermission();
  maybeShowSurvey();
  setTimeout(checkFriendRequests, 3000);
}

/* DAY ROLLOVER (v224).
   The native shell is a long-lived WebView: iOS suspends and resumes it rather
   than relaunching, so boot() can go days without running. Everything
   day-shaped used to roll over ONLY in boot() — S.date, the day close-out,
   yesterday's close-out crate, the daily wheel, quests, Pit energy. So the
   second morning you opened the app it was still on yesterday's date, and
   because renders compare S.date against a live dateKey() (`isToday`), the app
   treated your own Today screen as a PAST day and suppressed the wellness card.
   Now the day is re-checked on every resume, and once a minute so an app left
   open across midnight rolls over on its own. */
let _dayAnchor = dateKey();
let _rolling = false;
async function rollDayIfNeeded() {
  if (_rolling || !S.settings) return false;
  const today = dateKey();
  if (today === _dayAnchor) return false;
  _rolling = true;
  try {
    // If you had deliberately paged back to an earlier day, stay there: only
    // follow the clock forward when you were actually sitting on "today".
    const wasOnToday = S.date === _dayAnchor;
    _dayAnchor = today;
    if (wasOnToday) S.date = today;
    const closed = await awardDayCloseIfDue(S.settings.targets);
    if (wasOnToday) route(); // a new day starts at the top, like a fresh open
    if (closed?.closed) setTimeout(() => toast('Yesterday closed on budget: Golden Crate earned', 3400), 1400);
    else if (closed?.consoled) setTimeout(() => toast("You logged yesterday. You'll get 'em next time: Common Crate earned", 3600), 1400);
    maybeShowDailyWheel({ sounds: S.sounds }).catch(() => {});
    refreshNotifSchedules();
    return true;
  } finally { _rolling = false; }
}

// R2 (v151): the first time the app opens after an update, pop the What's New
// sheet once so players (and friends) actually see what changed. Gated so it
// never nags: only when there ARE unseen entries, never over onboarding / the
// daily wheel / any open sheet (retries next boot), and new players are seeded
// caught-up at onboarding so they don't get the historical backlog. Opening the
// sheet sets changelogSeen = latest, so it won't fire again until the next patch.
async function maybeShowWhatsNew() {
  try {
    if (navigator.webdriver || !S.settings) return;
    if (changelogUnseen(await kvGet('changelogSeen', 0)) <= 0) return;
    await new Promise(r => setTimeout(r, 1700)); // let splash/wheel settle
    if ($('#sheets')?.children.length) return;   // something already open — try again next launch
    openWhatsNew();
  } catch { /* never block boot */ }
}

/* ---------- Dark Spires: the announcement + the pinned explainer ---------- */
// Shown once (kv flag), then the Today banner carries it, same etiquette as the
// drop: never over the splash, the wheel, or an open sheet.
const SPIRE_SEEN_KEY = 'spiresIntroSeen';

async function maybeShowSpireIntro() {
  try {
    if ((navigator.webdriver && !window.__spireForce) || !S.settings) return;
    if (await kvGet(SPIRE_SEEN_KEY, false)) return;
    let tries = 0;
    const tick = async () => {
      if (sheetStack.length || document.querySelector('.dw') || document.getElementById('splash') || document.querySelector('.drop-veil')) {
        if (tries++ < 60) setTimeout(tick, 500);
        return;
      }
      await kvSet(SPIRE_SEEN_KEY, true);
      openSpireIntro();
    };
    setTimeout(tick, 2600);
  } catch { /* never block boot */ }
}

function openSpireIntro() {
  const veil = document.createElement('div');
  veil.className = 'drop-veil spire-veil';
  veil.innerHTML = `
    <div class="drop-card">
      <span class="drop-count">NEW</span>
      <p class="drop-eyebrow">TAKE THE TOWN</p>
      <h1 class="drop-title">Dark <em>Spires</em></h1>
      <p class="drop-sub">Towers have risen across your town. Walk to one, beat what guards it, and it flies your name.</p>
      <div class="spire-intro-art"><img src="assets/brand/tomb.png" alt=""></div>
      <ul class="spire-terms">
        <li>Held spires pay <b>tribute</b> daily. Collect it in person: that is the walk.</li>
        <li>Visit within <b>${RESOLVE_DAYS} days</b> or it goes dormant. Never lost, just quiet.</li>
        <li>Hold any spire for the <b>Keeper's Boon</b>: +10% coins from every quest.</li>
      </ul>
      <button class="drop-cta" id="spireIntroGo">FIND A SPIRE</button>
      <button class="drop-later" id="spireIntroLater">Maybe later</button>
    </div>`;
  document.body.appendChild(veil);
  const close = () => veil.remove();
  $('#spireIntroLater', veil).addEventListener('click', close);
  veil.addEventListener('click', e => { if (e.target === veil) close(); });
  $('#spireIntroGo', veil).addEventListener('click', () => { close(); location.hash = '#/boneyard'; });
}

/* THE STEP RACE ANNOUNCEMENT (market-quality-mockups/race-announce.html).
 * Shown once, with the same etiquette as the Dark Spires intro above: never over
 * the splash, the wheel or an open sheet, and never twice (a kv flag).
 *
 * The prize numbers come from RACE_PURSE, which is the SAME literal the Crew
 * card renders from, because Tom asked for exactly this: "make sure your popup
 * reflects the new date and prizes we cant have mixed messaging". Hard-coding
 * them here is how the poster and the board drift apart.
 */
const RACE_SEEN_KEY = 'raceIntroSeen';
const RACE_PURSE = [
  { place: '1st', coins: 5000, crate: 'golden', dust: 200 },
  { place: '2nd', coins: 2500, crate: 'golden', dust: 100 },
  { place: '3rd', coins: 1500, crate: 'golden', dust: 0 },
  { place: '4th', coins: 600, crate: 'daily', dust: 0 },
  { place: '5th', coins: 400, crate: 'daily', dust: 0 },
];

function openRaceIntro() {
  const top = RACE_PURSE[0];
  const veil = document.createElement('div');
  veil.className = 'drop-veil race-veil';
  veil.innerHTML = `
    <div class="drop-card">
      <span class="drop-count">NEW</span>
      <p class="drop-eyebrow">STARTS TODAY</p>
      <h1 class="drop-title">The Step <em>Race</em></h1>
      <p class="drop-sub">Every Bonehead in the game is in one race. Most steps in ${RACE_DAYS} days takes the purse.</p>
      <div class="race-intro-art">
        <span class="startline"></span>
        <span class="bh-stage lg">${avatarLayersHtml(raceIntroFit, { noYard: true, skip: ['BG', 'C'] })}</span>
      </div>
      <ul class="spire-terms">
        <li>Every step from <b>today</b> counts. Nothing to join, nothing to tap.</li>
        <li>Watch the board on the <b>Crew tab</b>: who is first, who is behind you, and by how much.</li>
        <li>The <b>top ${RACE_PURSE.length}</b> all get paid. First takes <b>${top.coins.toLocaleString()} coins</b>, a Golden Crate and <b>${top.dust} dust</b>.</li>
      </ul>
      <button class="drop-cta" id="raceIntroGo">SEE THE BOARD</button>
      <button class="drop-later" id="raceIntroLater">Not now</button>
    </div>`;
  document.body.appendChild(veil);
  composeAvatars(veil);
  const close = () => veil.remove();
  $('#raceIntroLater', veil).addEventListener('click', close);
  veil.addEventListener('click', e => { if (e.target === veil) close(); });
  $('#raceIntroGo', veil).addEventListener('click', () => { close(); location.hash = '#/friends'; });
}

/* Test hook (webdriver only), same pattern as __openFriendProfile. The poster is
   fired from the boot path behind a one-shot kv flag, so by the time a test can
   set anything the gate has already returned: without this the only way to check
   the announcement renders is to watch a real phone on release day. */
if (typeof window !== 'undefined' && navigator.webdriver) {
  window.__raceIntro = async () => { raceIntroFit = await equipped(); openRaceIntro(); };
}

let raceIntroFit = { B: 'B0-1', SK: 'SK0-1' };
async function maybeShowRaceIntro() {
  try {
    if (!RACE_LIVE) return;
    if ((navigator.webdriver && !window.__raceForce) || !S.settings) return;
    if (await kvGet(RACE_SEEN_KEY, false)) return;
    raceIntroFit = await equipped();       // it is YOUR bonehead on the start line
    let tries = 0;
    const tick = async () => {
      if (sheetStack.length || document.querySelector('.dw') || document.getElementById('splash') || document.querySelector('.drop-veil')) {
        if (tries++ < 60) setTimeout(tick, 500);
        return;
      }
      await kvSet(RACE_SEEN_KEY, true);
      openRaceIntro();
    };
    setTimeout(tick, 3200);
  } catch { /* never block boot */ }
}

// Pinned Today card: what you hold, what it owes you, and how close it is to
// going quiet. Doubles as the explainer for anyone who dismissed the popup.
function spireBannerHtml(held) {
  const owed = held.reduce((n, s) => n + s.tribute.coins, 0);
  const soon = held.filter(s => s.resolvePct < 0.3).length;
  // A SIEGE LEADS. It is the only spire state with a deadline, so it must never sit
  // below "3 held, all standing" where a player would scroll past it.
  const sieged = held.filter(s => s.siege).sort((a, b) => a.siege.until - b.siege.until);
  const line = sieged.length ? `${esc(sieged[0].siege.name)} is at ${esc(sieged[0].name || 'your spire')} · ${fmtCookTime(sieged[0].siege.msLeft)} left`
    : !held.length ? 'Take one and it pays you to visit'
    : owed ? `${owed} coins waiting to be collected`
    : soon ? `${soon} need${soon === 1 ? 's' : ''} a visit soon`
    : `${held.length} held · all standing`;
  return `<details class="glutton-banner spire-banner${sieged.length ? ' under-siege' : ''}">
    <summary>
      <span class="gbn-ico spire-ico"><img src="assets/brand/tomb.png" alt=""></span>
      <span class="gbn-txt"><i>Dark Spires</i><b>${esc(line)}</b></span>
      <span class="gbn-chev">›</span>
    </summary>
    <div class="gbn-body">
      ${held.length ? `<div class="spire-list">${held.map(s => `
        <div class="spire-row">
          <b>${esc(s.name || 'A spire')}${(s.level || 1) > 1 ? ` <span class="spire-lvtag">LV ${s.level}</span>` : ''}</b>
          <span class="spire-row-r">${s.siege ? `<span class="spire-siege-tag">${ICONS.pit(11)} ${fmtCookTime(s.siege.msLeft)}</span>` : s.tribute.coins ? `${ICONS.coin(12)} ${s.tribute.coins}` : '<span class="q-frac">nothing owed</span>'}</span>
          <div class="spire-bar"><i style="width:${Math.round(s.resolvePct * 100)}%"></i></div>
          <small>${s.siege ? `<b>${esc(s.siege.name)} is at the gate</b>` : `${s.heldDays} day${s.heldDays === 1 ? '' : 's'} held · resolve ${Math.round(s.resolvePct * 100)}%`}</small>
        </div>`).join('')}</div>`
        : '<p class="glutton-mech">You hold none yet. Spires sit on the Boneyard map as tall dark gates.</p>'}
      ${spireHowItWorksHtml()}
      <button class="btn ghost" id="spireToMap" style="width:100%">Open the Boneyard</button>
    </div>
  </details>`;
}

/* HOW A SPIRE WORKS, drawn rather than written. The old card was four lines of
 * prose that nobody read, so the mechanics people kept asking about (what tribute
 * is, what dormant means, what a siege does to you) were invisible. This is the
 * loop as four numbered steps with real numbers pulled from the constants, so the
 * card can never drift from the game, plus the two rules that reassure: nothing is
 * ever lost, and the boon is capped. */
function spireHowItWorksHtml() {
  // Numbers only, Tom's call. Every icon I tried was borrowed from somewhere it
  // belonged more (the garden's watering can was the worst of them) and none of
  // them earned its space. A step number is the only thing here that carries real
  // information: the order you do it in.
  const step = (n, title, body) => `
    <div class="sp-step">
      <span class="sp-n">${n}</span>
      <div class="sp-txt"><b>${title}</b><small>${body}</small></div>
    </div>`;
  return `<div class="sp-how">
    <div class="sp-how-h">How a spire works</div>
    ${step(1, 'Walk to a tower and beat its warden',
      `It flies your name from then on. You can hold <b>${SPIRE_CAP}</b>, so pick ones you actually pass.`)}
    ${step(2, 'It pays tribute every day',
      `<b>${TRIBUTE_PER_DAY} coins</b> and <b>${TRIBUTE_DUST_PER_DAY} dust</b> a day, banking up to ${TRIBUTE_CAP_DAYS} days. You collect it standing there, not from your couch.`)}
    ${step(3, `Visit within ${RESOLVE_DAYS} days to keep it`,
      `Any visit resets the clock. Miss it and the tower goes <b>dormant</b>, which is not a loss: walk back and it is yours again.`)}
    ${step(4, 'Sometimes something comes for it',
      `A rival can take it, or a siege can lay in. Beat them and the tower <b>levels up</b> and pays more. Lose the clock and it just goes dormant.`)}
    <div class="sp-rules">
      <span class="sp-rule"><b>+${Math.round(BOON_PER_SPIRE * 100)}%</b> quest coins per spire<i>capped at ${BOON_SPIRE_CAP}</i></span>
      <span class="sp-rule"><b>7 / 30 / 100</b> days held<i>the tower changes</i></span>
      <span class="sp-rule"><b>Never lost</b> to a clock<i>only ever dormant</i></span>
    </div>
  </div>`;
}

/* ---------- the Bone Garden announcement ---------- */
// Same etiquette as the drop card: five launches, then the pinned Today banner
// carries it. A feature nobody finds is a feature nobody has.
const GARDEN_SEEN_KEY = 'gardenIntroSeen';

async function maybeShowGardenPopup() {
  try {
    if ((navigator.webdriver && !window.__gardenForce) || !S.settings) return;
    const seen = await kvGet(GARDEN_SEEN_KEY, 0);
    if (seen >= 5) return;
    let tries = 0;
    const tick = async () => {
      if (sheetStack.length || document.querySelector('.dw') || document.getElementById('splash') || document.querySelector('.drop-veil')) {
        if (tries++ < 60) setTimeout(tick, 500);
        return;      // busy boot: does NOT consume one of the 5 showings
      }
      await kvSet(GARDEN_SEEN_KEY, seen + 1);
      openGardenPopup();
    };
    setTimeout(tick, 3000);   // after the drop card, never on top of it
  } catch { /* never block boot */ }
}

// The three growth stages read left to right, so the card explains the loop
// without a word of instruction.
function gardenStagesHtml() {
  return `<div class="gd-stages">
    <span class="gd-stage"><span>${bhIcon('garden-seed', 34)}</span><i>PLANT</i></span>
    <span class="gd-arrow">›</span>
    <span class="gd-stage"><span>${bhIcon('garden-water', 34, '#7cc4ff')}</span><i>WATER</i></span>
    <span class="gd-arrow">›</span>
    <span class="gd-stage"><span>${bhIcon('garden-sprout', 40)}</span><i>HARVEST</i></span>
  </div>`;
}

function openGardenPopup() {
  const veil = document.createElement('div');
  veil.className = 'drop-veil garden-veil';
  veil.innerHTML = `
    <div class="drop-card garden-card">
      <span class="drop-count">3 BEDS</span>
      <p class="drop-eyebrow">NEW IN THE KITCHEN</p>
      <h1 class="drop-title">The <em>Bone</em> Garden</h1>
      <p class="drop-sub">Grow your own ingredients. Plant a seed, water it once while it grows, and pick more than you put in.</p>
      ${gardenStagesHtml()}
      <p class="drop-how"><b>Seeds come off your walks.</b> Roughly one in three Boneyard spawns drops one. Short on seeds? The compost heap turns a spare ingredient into 1 to 3, three times a day. Nothing in the garden ever dies.</p>
      <button class="drop-cta" id="gardenSeeBtn">SEE THE GARDEN</button>
      <button class="drop-later" id="gardenLaterBtn">Maybe later</button>
    </div>`;
  document.body.appendChild(veil);
  const close = () => veil.remove();
  $('#gardenLaterBtn', veil).addEventListener('click', close);
  veil.addEventListener('click', e => { if (e.target === veil) close(); });
  $('#gardenSeeBtn', veil).addEventListener('click', async () => {
    await kvSet(GARDEN_SEEN_KEY, 99);   // they took the tour: the popup's job is done
    close();
    openGardenSheet(() => refresh());
  });
}

// The pinned Today dropdown, same shape as the Glutton and drop banners.
function gardenBannerHtml(cropsRipe) {
  return `<details class="glutton-banner garden-banner">
    <summary>
      <span class="gbn-ico garden-bnr-ico">${bhIcon(cropsRipe ? 'garden-sprout' : 'garden-seedling', 26)}</span>
      <span class="gbn-txt"><i>The Bone Garden</i><b>${cropsRipe ? `${cropsRipe} ${cropsRipe === 1 ? 'crop is' : 'crops are'} ready to pick` : 'Grow your own ingredients'}</b></span>
      <span class="gbn-chev">›</span>
    </summary>
    <div class="gbn-body">
      ${gardenStagesHtml()}
      <p class="glutton-mech"><b>Three beds in the Kitchen.</b> Seeds come off your walks, or compost a spare ingredient into 1 to 3 of them. A common takes 3 hours and pays 2, or 3 if you watered it, or 4 on a bumper crop. Nothing ever dies.</p>
      <button class="btn ghost" id="gardenToKitchen" style="width:100%">Open the garden</button>
    </div>
  </details>`;
}

/* ---------- the drop announcement ---------- */
// A streetwear-style release card for DROP. Shows on the first 5 launches after
// the drop lands (kv counter, bumped once per boot), then retires; the pinned
// banner on Today (dropBannerHtml) carries it from there, glutton-style. Skips
// webdriver unless forced so audits stay quiet, and follows the house popup
// etiquette: never over the splash, the wheel, or an open sheet.
const DROP_SEEN_KEY = `dropSeen.${DROP.id}`;

// One outfit, layered exactly like avatarLayersHtml stacks slots (z order:
// body < pants < top < skull < hat), on the default body so the popup shows the
// GEAR, not anyone's loadout.
function dropFitHtml(topId, hatId) {
  const layers = ['assets/bh/B/B0-1.png', 'assets/bh/P/P2.png',
    bhAsset(BH_BY_ID[topId]), 'assets/bh/SK/SK0-1.png', bhAsset(BH_BY_ID[hatId])];
  return `<span class="drop-fit">${layers.map(s => `<img src="${s}" alt="">`).join('')}</span>`;
}

async function maybeShowDropPopup() {
  try {
    if ((navigator.webdriver && !window.__dropForce) || !S.settings) return;
    const seen = await kvGet(DROP_SEEN_KEY, 0);
    if (seen >= 5) return;
    let tries = 0;
    const tick = async () => {
      if (sheetStack.length || document.querySelector('.dw') || document.getElementById('splash')) {
        if (tries++ < 60) setTimeout(tick, 500);
        return;      // busy boot: does NOT consume one of the 5 showings
      }
      await kvSet(DROP_SEEN_KEY, seen + 1);
      openDropPopup();
    };
    setTimeout(tick, 2200);
  } catch { /* never block boot */ }
}

function openDropPopup() {
  const veil = document.createElement('div');
  veil.className = 'drop-veil';
  veil.innerHTML = `
    <div class="drop-card">
      <span class="drop-count">10 NEW FITS</span>
      <p class="drop-eyebrow">FRESH DROP</p>
      <h1 class="drop-title">The <em>Puffer</em> Pack</h1>
      <p class="drop-sub">${DROP.blurb} Wear the fish or fear the fish.</p>
      <div class="drop-row">${dropFitHtml('T9-6', 'H13-3')}${dropFitHtml('T9-5', 'H13-2')}${dropFitHtml('T9-8', 'H13-5')}</div>
      <p class="drop-how">${DROP.acquire}</p>
      <button class="drop-cta" id="dropSeeBtn">SEE THE DROP</button>
      <button class="drop-later" id="dropLaterBtn">Maybe later</button>
    </div>`;
  document.body.appendChild(veil);
  const close = () => veil.remove();
  $('#dropLaterBtn', veil).addEventListener('click', close);
  veil.addEventListener('click', e => { if (e.target === veil) close(); });
  $('#dropSeeBtn', veil).addEventListener('click', async () => {
    await kvSet(DROP_SEEN_KEY, 99);   // they took the tour: the popup's job is done
    close();
    openCharacter('shop');
  });
  composeAvatars(veil);
}

// The pinned Today dropdown, same pattern as the Glutton banner: collapsed one-
// liner, expands to the pitch + how-to-get-it + a straight line to the Shop.
function dropBannerHtml() {
  return `<details class="glutton-banner drop-banner">
    <summary>
      <span class="gbn-ico drop-ico"><img src="assets/bh/H/H13-2.png" alt=""></span>
      <span class="gbn-txt"><i>Fresh drop</i><b>${esc(DROP.title)} is live</b></span>
      <span class="gbn-chev">›</span>
    </summary>
    <div class="gbn-body">
      <div class="drop-row sm">${dropFitHtml('T9-6', 'H13-3')}${dropFitHtml('T9-5', 'H13-2')}${dropFitHtml('T9-8', 'H13-5')}</div>
      <p class="glutton-mech"><b>${esc(DROP.blurb)}</b> ${esc(DROP.acquire)}</p>
      <button class="btn ghost" id="dropToShop" style="width:100%">Open the Shop</button>
    </div>
  </details>`;
}

// First run online: actively invite the player to pick their own Crew name
// instead of silently living with the random bone-name handle the server hands
// out as a fallback. Fires once ever (kv flag), only when online with no chosen
// name, and never over the splash / daily wheel / an open sheet.
async function maybePromptName() {
  try {
    if (navigator.webdriver) return;
    if (await kvGet('namePrompted', false)) return;
    const me = await social.socialMe();
    if (!me || me.name) return;
    let tries = 0;
    const tick = async () => {
      if (sheetStack.length || document.querySelector('.dw') || document.getElementById('splash')) {
        if (tries++ < 60) setTimeout(tick, 500);
        return;
      }
      await kvSet('namePrompted', true);
      toast('Welcome to the Crew! Pick a name so friends know who you are.', 3600);
      openNameBuilder();
    };
    setTimeout(tick, 2000);
  } catch { /* noop */ }
}

// Poll for NEW incoming friend requests and surface them: an OS notification
// (if enabled, so it lands when the app is backgrounded) plus an in-app toast.
// Cheap network call; runs at boot + on resume + after each autoSync.
// Badge on the Crew tab: a count of PENDING incoming friend requests, so a new
// request visibly points you to the Crew tab. Persists until you accept/decline
// (not just until you glance at it).
function setCrewBadge(n) {
  const el = $('#crewBadge');
  if (!el) return;
  if (n > 0) { el.textContent = n > 9 ? '9+' : String(n); el.hidden = false; }
  else el.hidden = true;
}
/* THE DELIVERIES INBOX.
 *
 * Tom, 2026-08-06: "if you miss the pop up from a gift then you don't know your
 * friend sent it or how many friends sent one."
 *
 * He was right, and the data was already there the whole time: applyGrant writes
 * every gift, cheer and crew reward into the xp ledger with the server's note as
 * its label ("Vile Nightmare #8 sent you a gift!"). Nothing ever read it back.
 * So this is a reader, not a new store: no schema change, and every gift ever
 * received is already in the list the first time you open it.
 */
const DELIVERY_TYPES = new Set(['gift', 'cheer', 'social', 'welcome', 'spire']);
async function crewDeliveries(limit = 40) {
  const rows = await db.all('xp');
  return rows.filter(r => DELIVERY_TYPES.has(r.type) && r.label)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, limit);
}
/* The read watermark. It used to default to 0, which meant that the first time
   anyone opened the inbox EVERY gift they had ever received counted as new:
   Tom, 2026-08-08, "showing new gifts for past gifts from whenever you started
   playing it's way too much". History is not news. So on the very first read we
   stamp the watermark at the newest delivery already in the ledger: nothing that
   pre-dates the inbox is ever "new", and anything that lands after it is. */
async function deliverySeenTs() {
  const seen = await kvGet('crewSeenTs', null);
  if (seen !== null && seen !== undefined) return seen;
  const rows = await crewDeliveries(1);
  const ts = rows.length ? (rows[0].ts || 0) : 0;
  await kvSet('crewSeenTs', ts);
  return ts;
}
async function unseenDeliveryCount() {
  const seen = await deliverySeenTs();
  return (await crewDeliveries(60)).filter(r => (r.ts || 0) > seen).length;
}
// Test hooks (webdriver only): the inbox reads a ledger the Crew tab only
// renders once you have an account, so the reader has to be checkable directly.
if (typeof window !== 'undefined' && navigator.webdriver) {
  window.__crewDeliveries = () => crewDeliveries();
  window.__unseenDeliveries = () => unseenDeliveryCount();
  window.__refreshCrewBadge = () => refreshCrewBadge();
}
// The badge is the sum of what is waiting for you in the tab: friend requests
// AND unread deliveries. It used to count requests only, so a gift never
// announced itself anywhere you could go back and find it.
async function setCrewBadgeFrom(incomingCount) {
  try { setCrewBadge((incomingCount || 0) + (await unseenDeliveryCount())); }
  catch { setCrewBadge(incomingCount || 0); }
}
async function refreshCrewBadge() {
  try {
    if (!(await social.isOnline())) { await setCrewBadgeFrom(0); return; }
    const d = await social.listFriends();
    await setCrewBadgeFrom((d.incoming || []).length);
  } catch { /* noop */ }
}

async function checkFriendRequests() {
  try {
    if (!(await social.isOnline())) return;
    const { fresh, incoming } = await social.newFriendRequests();
    await setCrewBadgeFrom((incoming || []).length); // requests + unread deliveries
    if (!fresh.length) return;
    const prefs = await notifPrefs();
    if (prefs.enabled && prefs.friends) {
      if (fresh.length === 1) await notifyNow('New friend request', `${fresh[0].name || 'A Bonehead'} wants to join your Crew.`);
      else await notifyNow('New friend requests', `${fresh.length} Boneheadz want to join your Crew.`);
    }
    toast(fresh.length === 1 ? `${fresh[0].name || 'Someone'} wants to be friends. Open The Crew to accept.` : `${fresh.length} new friend requests. Open The Crew.`, 4200);
    if (currentTab() === 'friends') renderFriends($('#screen'));
  } catch { /* noop */ }
}

// New users default to notifications ON, so ask for OS permission once (guarded
// by a kv flag) so the default actually delivers. Never over the splash / wheel
// / an open sheet, so it doesn't interrupt onboarding or name-picking.
async function maybeRequestNotifPermission() {
  try {
    if (navigator.webdriver) return;
    if (await kvGet('notifAsked', false)) return;
    if (notifPlatform() === 'none') { await kvSet('notifAsked', true); return; }
    const prefs = await notifPrefs();
    if (!prefs.enabled) { await kvSet('notifAsked', true); return; }
    const state = await notifPermissionState();
    if (state === 'granted' || state === 'denied' || state === 'unsupported') { await kvSet('notifAsked', true); return; }
    let tries = 0;
    const tick = async () => {
      if (sheetStack.length || document.querySelector('.dw') || document.getElementById('splash')) {
        if (tries++ < 60) setTimeout(tick, 500);
        return;
      }
      await kvSet('notifAsked', true);
      const ok = await requestNotifPermission();
      if (ok) {
        await syncNotifications();
        const loc = await kvGet('lastLoc', null);
        await scheduleRares();   // retired: clears any rare pushes still queued
      }
    };
    setTimeout(tick, 3500);
  } catch { /* noop */ }
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
  $$('#tabbar .tab').forEach(b => b.addEventListener('click', () => {
    location.hash = '#/' + b.dataset.tab;
  }));
  $('#gearBtn')?.addEventListener('click', () => { location.hash = '#/settings'; });
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

// keepScroll: an in-place re-render must NOT reset the scroll, because undoing a
// reset after the fact means fighting the user for it. Returns the render promise
// so a caller can wait for real content instead of guessing when it lands.
// A screen that owns a live resource (the Boneyard's MapLibre instance, its GPS
// watch) registers a teardown here. Leaving the screen must release it, or the
// map keeps running and draining battery behind whatever you opened next.
let screenCleanup = null;

function route({ keepScroll = false } = {}) {
  closeAllSheets();
  try { screenCleanup?.(); } catch { /* never block navigation on teardown */ }
  screenCleanup = null;
  const tab = currentTab();
  trackScreen(tab); // screen-dwell heatmap: time spent per bottom-nav screen
  // #/shop is a deep link into the hub, so it must light the Bonehead tab rather
  // than leaving the bar with nothing selected.
  const navTab = tab === 'shop' ? 'bonehead' : tab;
  $$('#tabbar .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === navTab));
  // Redundant on Settings itself, and the Boneyard is full-bleed map.
  const gear = $('#gearBtn');
  // Today carries its own gear in the day strip, so the floating one stays out
  // of the way and nothing sits above the Bonehead.
  if (gear) gear.hidden = tab === 'settings' || tab === 'boneyard' || tab === 'today';
  const el = $('#screen');
  let done;
  // #/shop is a deep link into the hub's Shop tab, not a screen of its own.
  if (tab === 'shop') { pendingHubTab = 'shop'; done = renderBonehead(el); }
  else if (tab === 'bonehead') done = renderBonehead(el);
  // #/progress is the HEALTH data screen (steps, sleep, weight, intake). The hub's
  // "Level" tab is character progression. Similar names, different features: do
  // not fold one into the other.
  else if (tab === 'progress' || tab === 'trends') done = renderTrends(el);
  else if (tab === 'foods') done = renderFoods(el);
  else if (tab === 'friends') done = renderFriends(el);
  else if (tab === 'settings') done = renderSettings(el);
  else if (tab === 'boneyard') done = renderBoneyard(el);
  else done = renderToday(el);
  // the map fills the screen, so this route drops the usual padding and scroll
  el.classList.toggle('screen--map', tab === 'boneyard');
  if (!keepScroll) el.scrollTop = 0;
  maybeCelebrate();
  return Promise.resolve(done).catch(() => {}).then(() => {
    composeAvatars(el);
    // Phase 4: a route lands with a 200ms fade instead of a hard cut. The class
    // goes on the rendered child so an in-place refresh() never re-triggers it.
    el.firstElementChild?.classList.add('route-in');
  });
}

// In-place re-render of the current tab. Unlike navigation (hashchange -> route(),
// which intentionally lands at the top), an in-place refresh should keep the
// player where they were: logging water/sleep, changing the day, closing a sheet.
// This used to reset the scroll (inside route) and then spend 1.2 seconds
// writing scrollTop back every 50ms to undo it. On a touch screen that loop
// fights the player: momentum keeps moving after the finger lifts, so the
// release fired early and the loop dragged them back, which is the "shop keeps
// jumping to the top" testers reported. Nothing resets the scroll now, so
// nothing has to fight to restore it.
function refresh() {
  const sc = $('#screen');
  const before = sc ? sc.scrollTop : 0;
  const p = route({ keepScroll: true });
  // The render is async: content can be shorter for a frame, which clamps
  // scrollTop. Reassert ONCE when it resolves, and only if the player has not
  // scrolled away themselves in the meantime.
  p.then(() => {
    const el = $('#screen');
    if (!el || before <= 0) return;
    if (Math.abs(el.scrollTop - before) > 1 && el.scrollTop < 2) el.scrollTop = before;
  });
  return p;
}

// Background/unprompted refresh (auto health-sync, crew deliveries on resume):
// only re-render when the player is already near the top. If they've scrolled
// down to read, we skip the visual refresh (data is already saved; it shows on
// the next navigation) rather than yank them back to the top. iOS momentum made
// the scroll-restore unreliable, so the safest fix is to not refresh at all here.
function bgRefresh() {
  const sc = $('#screen');
  const atTop = (scrollY || 0) < 48 && ((sc && sc.scrollTop) || 0) < 48;
  if (atTop) refresh();
}

/* ================= shared ui ================= */

let toastTimer = 0;
const toastQ = [];
let toastBusy = false;
function toast(msg, ms = 2200) {
  toastQ.push({ msg, ms });
  if (toastQ.length > 4) toastQ.splice(0, toastQ.length - 4); // never a backlog lecture
  if (!toastBusy) nextToast();
}
function nextToast() {
  const t = $('#toast');
  const job = toastQ.shift();
  if (!job) { toastBusy = false; return; }
  toastBusy = true;
  if (!t.getAttribute('aria-live')) { t.setAttribute('aria-live', 'polite'); t.setAttribute('role', 'status'); }
  t.classList.remove('out');
  t.textContent = job.msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.add('out');
    // exit animation, then the next message; reduced-motion gets the instant path
    const done = () => { t.hidden = true; t.classList.remove('out'); nextToast(); };
    if (reducedMotion) done(); else setTimeout(done, 180);
  }, job.ms);
}

const sheetStack = [];
function openSheet(html, { cls = '', onClose = null, name = null } = {}) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet ${cls}" role="dialog"><div class="sheet-grab"></div>${html}</div>`;
  $('#sheets').appendChild(wrap);
  // analytics: which feature-sheets get opened + how long they're held (dwell).
  // Auto-labels from the sheet's <h2> title unless an explicit name is passed.
  const feat = (name || (html.match(/<h2[^>]*>([^<]{1,40})<\/h2>/) || [])[1] || 'sheet').trim();
  const openedAt = Date.now();
  try { trackEvent('feat_open', { f: feat }); } catch { /* noop */ }
  const rec = { wrap, onClose: () => { try { trackEvent('feat_time', { f: feat, ms: Date.now() - openedAt }); } catch { /* noop */ } try { onClose?.(); } catch { /* noop */ } } };
  sheetStack.push(rec);
  history.pushState({ sheet: sheetStack.length }, '');
  $('.sheet-backdrop', wrap).addEventListener('click', () => history.back());
  $$('.sheet-close', wrap).forEach(b => b.addEventListener('click', () => history.back()));
  composeAvatars(wrap);   // sheets show Boneheads too, same reveal-when-ready rule
  return wrap;
}
function closeTopSheet() {
  const rec = sheetStack.pop();
  if (!rec) return;
  try { rec.onClose?.(); } catch { /* noop */ }
  const sheet = $('.sheet', rec.wrap), back = $('.sheet-backdrop', rec.wrap);
  if (reducedMotion || !sheet) { rec.wrap.remove(); return; }
  // slide down + backdrop fade, then remove. pointer-events off immediately so a
  // dying sheet can never eat a tap meant for what is behind it.
  rec.wrap.style.pointerEvents = 'none';
  sheet.classList.add('closing');
  back?.classList.add('closing');
  let gone = false;
  const bury = () => { if (!gone) { gone = true; rec.wrap.remove(); } };
  sheet.addEventListener('animationend', bury, { once: true });
  setTimeout(bury, 320);   // animationend can be swallowed by a display:none tab
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
// one default serving, all macros: the Tier 1 food row shows protein next to
// kcal because protein is the macro the game actually pays for (+40 XP).
function foodDefaultNutr(food) {
  return nutrientsFor(food, { mode: 'serving', idx: 0, qty: 1 });
}

/* What is left in the day, including the active-calorie credit renderToday
   applies, so the picker and Today can never disagree about the number. */
async function dayBudget() {
  const entries = await entriesFor(S.date);
  const hk = await db.get('health', S.date);
  const bonus = activeCalorieBonus(S.settings.profile, hk?.activeKcal);
  const targets = S.settings.targets || {};
  const target = (targets.kcal || 0) + (bonus > 0 ? bonus : 0);
  const tot = dayTotals(entries);
  return {
    target, used: tot.kcal, left: target - tot.kcal,
    p: tot.p, pTarget: targets.p || 0,
    proteinHit: !!(targets.p && tot.p >= targets.p),
    meals: new Set(entries.map(e => e.meal)),
    firstOfDay: entries.length === 0,
  };
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
  const cropsRipe = await cropsReady();
  const foodbuffs = await activeFoodBuffs();
  const ingCount = ingredientCount(await ingredients());
  const eq = await equipped();
  const [coinBal, dustBal, pitEnergy, heldSpiresNow] = await Promise.all([coins(), boneDust(), refreshPitEnergy(), heldSpires()]);
  const crates = await unopenedCrates();
  const allXp = await db.all('xp');
  const huntEnabled = !!(await kvGet('hunt-enabled'));
  const wellness = S.date === dateKey() ? await getWellness(S.date) : null;
  const routines = wellness ? await getRoutines() : [];
  const routinesDoneToday = wellness ? await routinesDone(S.date) : new Set();
  const qopts = { hkConnected: !!S.settings.hkConnected, huntEnabled, socialOn: await social.isOnline().catch(() => false) };
  const healthRows = await db.all('health');
  // Surface an auto watch sleep read in the wellness card when the player hasn't
  // hand-logged tonight (so it reads "from your watch" instead of asking).
  if (wellness && wellness.sleepHours == null) {
    const hToday = healthRows.find(h => h.date === S.date);
    if (hToday && hToday.sleepMin > 0) {
      wellness.sleepHours = Math.round(hToday.sleepMin / 6) / 10;
      wellness.sleepAuto = true;
      wellness.sleepScore = sleepScore(hToday);
    }
  }
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
  // quest header status: how many are claimable right now (drives the accent cue)
  const questClaimable = questTiers.reduce((n, tier) => n + tier.quests.filter(q => { const st = questState(q, tier.ctx); return st.done && !st.claimed; }).length, 0);
  // v146 unlock guidance: surface Build/gear/weapon moments the player would miss
  const [unlockFighter, unlockGear] = isToday ? await Promise.all([buildFighter(), ownedGearIds()]) : [null, null];
  const unlocks = isToday ? computeHomeUnlocks({
    fighter: unlockFighter, level: lvl.level, coinBal, dustBal,
    gearOwnedCount: unlockGear.size, gearEquippedCount: Object.keys(unlockFighter.gearLo || {}).length,
    fightWins: allXp.filter(r => r.type === 'fight').length,
  }) : [];
  const pitAttn = unlocks.some(u => u.hero === 'pit');
  const wardAttn = unlocks.some(u => u.hero === 'ward');
  const topNudge = unlocks[0] || null;
  const hkStale = isToday ? await hkStaleInfo() : null;
  if (hkStale && !(await kvGet('hkStaleNotified', false))) {
    await kvSet('hkStaleNotified', true); // once per stall episode; cleared on the next good sync
    notifyNow('Steps stopped syncing', 'Apple Health has gone quiet — your walking is not counting. Open Boneheadz and tap the banner to fix it.').catch(() => {});
  }
  const [y, m, d] = S.date.split('-').map(Number);
  const dObj = new Date(y, m - 1, d);
  const title = isToday ? 'Today' : dObj.toLocaleDateString(undefined, { weekday: 'long' });
  const sub = dObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: y === new Date().getFullYear() ? undefined : 'numeric' });

  const C = 2 * Math.PI * 66;
  const prev = S.ui;
  const protHit = t.p && tot.p >= t.p;

  el.innerHTML = `
  <div class="hero-scene ${S.justLogged ? 'bounce' : ''}" id="bhStage">
    ${eq.BG && BH_BY_ID[eq.BG] ? `<img class="hero-backdrop" src="${bhAsset(BH_BY_ID[eq.BG])}" alt="">` : ''}
    <div class="hero-char">${avatarLayersHtml(eq, { skip: ['BG', 'C'], noYard: true })}</div>
    ${eq.C && BH_BY_ID[eq.C] ? `<div class="hero-companion">${petSpriteHtml(eq.C, 98, false, { mass: true })}</div>` : ''}

    <div class="hero-top">
      <button class="streak-chip trend-chip" id="streakChip" aria-label="Open your trends and progress"><span class="tico">${ICONS.trend(15)}</span> <b>Trends</b></button>
      <div class="hero-top-right">
        <button class="bh-coin" id="coinBtn">${ICONS.coin(14)} <b>${coinBal.toLocaleString()}</b></button>
        <button class="bh-coin" id="dustBtn" title="Bone Dust"><span class="dust-ico">${ICONS.dust(13)}</span> <b>${dustBal.toLocaleString()}</b></button>
        <button class="bh-coin" id="vigorBtn" title="Pit fights ready">${ICONS.boltIco(13)} <b>${pitEnergy.ready}</b></button>
        ${crates.length ? `<button class="bh-crates" id="cratesBtn">${crateIcon(crates[0].crate, 14)} ${crates.length}</button>` : ''}
      </div>
    </div>
    <div class="hero-bubble ${bubbleSideCache[JSON.stringify(eq)] === 'r' ? 'side-r' : ''}">${esc(speechLine({ entries, tot, targets: t, crates, streak, isToday, steps: hk?.steps || 0, dishReady: !!(cook && cook.ready), cropsRipe, fightsReady: pitEnergy.ready, spires: heldSpiresNow.length }))}</div>
    <div class="hero-meta">
      <button class="hero-level" id="lvlChip">
        <span class="hero-lvrow"><span class="hero-lv">Lv ${lvl.level}</span><span class="hero-title">${esc(lvl.name)}</span></span>
        <span class="hero-xpbar"><i style="width:${lvl.pct}%"></i></span>
        <span class="hero-xpnum">${lvl.into.toLocaleString()} / ${lvl.need.toLocaleString()} XP · Lv ${lvl.level + 1} unlocks a Golden Crate</span>
      </button>
    </div>
  </div>

  <div class="hero-actions four">
    <button class="hero-act${wardAttn ? ' attn' : ''}" id="charBtn">${ICONS.bone(23)}<span>Character${wardAttn ? ' <i class="hero-badge">!</i>' : crates.length ? ` <i class="hero-badge">${crates.length}</i>` : ''}</span></button>
    <button class="hero-act" id="stableBtn">${ICONS.paw(23)}<span>Stable</span></button>
    <button class="hero-act" id="kitchenActBtn">${bhIcon('dish-broth', 23)}<span>Kitchen${(cook && cook.ready) || cropsRipe ? ' <i class="hero-badge">!</i>' : ''}</span></button>
    <button class="hero-act${pitAttn ? ' attn' : ''}" id="pitBtn">${ICONS.pit(23)}<span>The Pit${pitAttn ? ' <i class="hero-badge">!</i>' : ''}</span></button>
  </div>

  ${isToday && topNudge ? `
  <button class="card unlock-nudge" id="unlockNudge" data-ulaction="${topNudge.action}">
    <span class="ul-ico">${topNudge.hero === 'ward' ? ICONS.bone(20) : ICONS.pit(20)}</span>
    <span class="ul-txt"><b>${esc(topNudge.nudge)}</b><small>${topNudge.action === 'pit' ? 'Tap to enter The Pit' : topNudge.hero === 'ward' ? 'Tap to open your Wardrobe' : 'Tap to open Build and spend it'}</small></span>
    <span class="ul-chev">›</span>
  </button>` : ''}

  ${isToday && hkStale ? `
  <button class="card hk-stale" id="hkStaleFix">
    <b>⚠️ Steps aren't syncing</b>
    <span>Apple Health hasn't sent steps in ${hkStale.days >= 2 ? `${hkStale.days} days` : `${hkStale.hours} hours`} — your walking isn't counting. Tap to fix.</span>
  </button>` : ''}

  ${isToday ? outThereHtml({ held: heldSpiresNow, cropsRipe }) : ''}

  ${isToday ? `
  <details class="q-collapse${questClaimable ? ' has-claim' : ''}">
    <summary><span class="q-sum-ico">${ICONS.quest(18)}</span>QUESTS${questClaimable ? `<span class="q-badge">${questClaimable} ready</span>` : ''}</summary>
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
            <div class="q-name">${esc(q.name)} <span class="q-coins">+${q.coins}${ICONS.coin(11)}${q.crate ? ' ' + crateIcon(q.crate, 12) : ''}${q.dust ? ` <span class="dust-ico">${ICONS.dust(13)}</span>${q.dust}` : ''}${q.item ? ' ' + consumableIcon(q.item, 12) : ''}${q.ingredient ? ' ' + ingIconHtml(q.ingredient, 12) : ''}</span></div>
            <div class="q-desc">${esc(q.desc)}</div>
            <div class="q-bar ${tier.period !== 'day' ? 'gold' : ''}"><i style="width:${pct}%"></i></div>
          </div>
          ${st.claimed ? `<span class="q-done">${ICONS.check(13)}</span>`
            : st.done ? `<button class="q-claim" data-claim="${q.id}" data-period="${tier.period}" data-pkey="${tier.ctx.periodKey}">Claim</button>`
            : `<span class="q-frac">${st.target > 20 ? Math.round((st.cur / st.target) * 100) + '%' : st.cur + '/' + st.target}</span>`}
        </div>`;
      }).join('')}
      </div>
    </div>`).join('')}
    <button class="link" id="qProg" style="margin-top:4px">Quest progress</button>
    </div>
  </details>` : ''}

  <div class="day-strip">
    <button class="icon-btn" id="prevDay" aria-label="Previous day"><svg viewBox="0 0 24 24"><path d="M14.5 5l-7 7 7 7"/></svg></button>
    <div class="day-title">
      <h1>${title}</h1><div class="sub">${sub}</div>
      <input type="date" id="datePick" value="${S.date}" aria-label="Pick date">
    </div>
    <button class="icon-btn" id="nextDay" aria-label="Next day"><svg viewBox="0 0 24 24"><path d="M9.5 5l7 7-7 7"/></svg></button>
    <button class="icon-btn" id="todaySettings" aria-label="Settings"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" fill="none" stroke-width="2"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2z" fill="none" stroke-width="1.6" stroke-linejoin="round"/></svg></button>
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

  ${isToday ? wellnessCardHtml(wellness, routines, routinesDoneToday) : ''}
  ${isToday ? kitchenCardHtml(cook, ingCount, foodbuffs, cropsRipe) : ''}
  ${healthCardHtml(hk, isToday)}

  ${MEALS.map((name, i) => mealBlock(name, i, entries.filter(e => e.meal === i), yEntries.filter(e => e.meal === i), Math.round(t.kcal * MEAL_SPLIT[i]))).join('')}

  ${tot.kcal > 0 ? `<div class="micro-line">Fiber ${fmtG(tot.fiber)} g · Sugar ${fmtG(tot.sugar)} g · Sodium ${Math.round(tot.sodium).toLocaleString()} mg</div>` : ''}
  ${isToday ? `<p class="day-signoff">${esc(signOffLine(entries.length, tot, t))}</p>` : ''}
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

  $('#todaySettings', el)?.addEventListener('click', () => { location.hash = '#/settings'; });
  $('#prevDay').addEventListener('click', () => { S.date = addDays(S.date, -1); refresh(); });
  $('#nextDay').addEventListener('click', () => { S.date = addDays(S.date, 1); refresh(); });
  $('#datePick').addEventListener('change', e => { if (e.target.value) { S.date = e.target.value; refresh(); } });
  $('#lvlChip').addEventListener('click', () => { location.hash = '#/progress'; });
  $('#streakChip').addEventListener('click', () => { location.hash = '#/progress'; });
  // Tapping the scene opens the Wardrobe, but the Trends chip and the
  // coin/dust/vigor/crate chips live INSIDE it, so their clicks bubbled here and
  // this handler ran too. It always did; it used to be masked because
  // openCharacter opened a sheet on top, and once it navigated by hash instead it
  // started overwriting the chip's own destination. Buttons handle themselves.
  $('#bhStage').addEventListener('click', e => {
    if (e.target.closest('button')) return;
    openCharacter('wardrobe');
  });
  measureBubbleSide($('#bhStage'), eq).then(side => {
    $('.hero-bubble')?.classList.toggle('side-r', side === 'r');
  });
  $('#charBtn')?.addEventListener('click', () => openCharacter('wardrobe')); // Character hub: Wardrobe + Backpack + Build + Progress
  $('#stableBtn')?.addEventListener('click', openStable);
  $('#pitBtn')?.addEventListener('click', openPit);
  $('#qProg')?.addEventListener('click', () => { location.hash = '#/progress'; });
  $('#coinBtn')?.addEventListener('click', () => openCharacter('crates'));
  $('#dustBtn')?.addEventListener('click', () => openCharacter('crates'));
  $('#vigorBtn')?.addEventListener('click', openPit);
  $('#cratesBtn')?.addEventListener('click', () => openCharacter('crates'));
  $('#unlockNudge')?.addEventListener('click', () => {
    const a = $('#unlockNudge')?.dataset.ulaction;
    if (a === 'wardrobe') openCharacter('wardrobe');
    else if (a === 'pit') openPit();
    else openTalents();
  });
  if (isToday && unlocks.length) fireUnlockToasts(unlocks);
  $('#kitchenActBtn')?.addEventListener('click', openKitchen);
  $('#kitchenCard')?.addEventListener('click', openKitchen);
  $('#gluttonToMap')?.addEventListener('click', () => { location.hash = '#/boneyard'; });
  $('#dropToShop')?.addEventListener('click', () => openCharacter('shop'));
  $('#spireToMap')?.addEventListener('click', () => { location.hash = '#/boneyard'; });
  // Expanding the banner leaves its CTA exactly under the fixed bottom nav, so
  // taps fall through to the nav (ui-audit hit-test caught this pre-ship; it is
  // the same failure shape as the Settings-gear/next-day collision). Scroll the
  // CTA clear the moment the banner opens.
  $('details.drop-banner')?.addEventListener('toggle', e => {
    if (e.target.open) $('#dropToShop')?.scrollIntoView({ block: 'center' });
  });
  $('details.garden-banner')?.addEventListener('toggle', e => {
    if (e.target.open) $('#gardenToKitchen')?.scrollIntoView({ block: 'center' });
  });
  $('#gardenToKitchen')?.addEventListener('click', () => openGardenSheet(() => refresh()));
  // daily wellness (pure-positive self-care: only ever adds a reward). refresh()
  // now preserves scroll for in-place re-renders, so logging these below-the-fold
  // controls no longer yanks the player to the top.
  $('#wWater')?.addEventListener('click', async () => {
    const { w, xp } = await addWater(1); dropSound(S.sounds);
    if (xp > 0) { confettiBurst(innerWidth / 2, innerHeight * 0.4, 12); chimeSound(S.sounds); toast(`Hydrated! +${xp} XP. Claim the water quest for coins.`, 2800); }
    else toast(`Water ${w.water}/${WATER_GOAL} cups${w.water >= WATER_GOAL ? '' : ` · ${WATER_GOAL - w.water} to go for +8 XP`}`, 1800);
    refresh();
  });
  $('#wBed')?.addEventListener('click', async () => {
    const { xp } = await markBed(); chimeSound(S.sounds);
    toast(xp > 0 ? `Bed made. +${xp} XP banked.` : 'Already made today.', 2200); refresh();
  });
  $$('[data-routine]').forEach(b => b.addEventListener('click', async () => {
    const r = await markRoutine(b.dataset.routine);
    if (!r.ok) return;
    chimeSound(S.sounds); haptic.success();
    toast(r.xp > 0 ? `Done. +${r.xp} XP banked.`
      : r.already ? 'Already done today.'
      : `Done. (${ROUTINE_XP_CAP} routines a day pay XP; the rest are for you.)`, 2600);
    refresh();
  }));
  $$('[data-routinedel]').forEach(b => armToConfirm(b, 'Remove?', async () => {
    await removeRoutine(b.dataset.routinedel); toast('Routine removed.', 2000); refresh();
  }));
  $('#addRoutine')?.addEventListener('click', () => {
    openTextSheet({ title: 'New routine', placeholder: 'e.g. Stretch for ten minutes', cta: 'Add it' }, async name => {
      const r = await addRoutine(name);
      if (!r.ok) { toast(r.reason === 'full' ? `That is the lot (${r.max} routines).` : 'Give it a name first.', 2600); return; }
      popSound(S.sounds); refresh();
    });
  });
  $$('[data-sleep]').forEach(b => b.addEventListener('click', async () => {
    const hours = Number(b.dataset.sleep);
    const { xp } = await markSleep(hours); chimeSound(S.sounds);
    toast(xp > 0 ? `${hours}h logged. +${xp} XP. Rest is training too.` : `Updated to ${hours}h.`, 2400); refresh();
  }));
  // dev hook: ?automap=1 walks straight into the map with stubbed coords
  // (simulator smoke tests: no permission prompts, deterministic location)
  if (!window.__automapRan && new URLSearchParams(location.search).has('automap')) {
    window.__automapRan = true;
    const fake = { coords: { latitude: 49.2827, longitude: -123.1207, accuracy: 5, heading: null, speed: 0 } };
    navigator.geolocation.getCurrentPosition = ok => setTimeout(() => ok(fake), 60);
    navigator.geolocation.watchPosition = ok => { setTimeout(() => ok(fake), 400); return 1; };
    navigator.geolocation.clearWatch = () => {};
    setTimeout(() => { location.hash = '#/boneyard'; setTimeout(() => $('#mapStart')?.click(), 900); }, 1200);
  }
  $('#hkSync', el)?.addEventListener('click', syncFromClipboard);
  $('#hkStaleFix', el)?.addEventListener('click', async () => {
    // best case: a manual native sync brings steps right back
    if (isNative() && S.settings.hkNative) {
      toast('Retrying Health sync…', 1800);
      const ok = await nativeSyncNow({ silent: false });
      if (ok) { toast('Steps are flowing again. All good.', 2600); refresh(); return; }
    }
    location.hash = '#/settings'; // reconnect / re-run the Health setup from Settings
  });
  S.justLogged = false;
  $$('[data-claim]').forEach(b => b.addEventListener('click', async ev => {
    // claiming re-renders home; hold the reading position from THIS closure and
    // reassert it for ~1s so the re-render (and any late layout) can't yank the
    // player back to the top while they work down the quest list
    const period = b.dataset.period || 'day';
    const tier = questTiers.find(t => t.period === period);
    const q = tier?.quests.find(x => x.id === b.dataset.claim);
    if (!q) return;
    const res = await claimQuest(b.dataset.pkey, q, period);
    if (!res) return;
    trackEvent('quest_claim', { id: q.id, period });
    confettiBurst(ev.clientX || innerWidth / 2, ev.clientY || 240, period === 'day' ? 14 : 22);
    period === 'day' ? questSound(S.sounds) : levelSound(S.sounds);
    let bonusXp = 0;
    const crates2 = [];
    if (res.crate) crates2.push(res.crate);
    // daily all-clear bonus crate
    if (period === 'day') {
      const dateXp2 = (await db.all('xp')).filter(r => r.date === S.date);
      const bonus = await claimAllBonusIfDue(S.date, tier.quests, dateXp2);
      if (bonus) { bonusXp = bonus.xp; crates2.push('daily'); }
    }
    if (crates2.length) {
      // item rewards pop as pack cards; coins/XP ride the footer
      openPackReveal(crates2.map(k => ({ iconHtml: crateIcon(k, 120), name: CRATES[k].label, rarity: k === 'daily' ? 'uncommon' : 'rare', kind: 'CRATE', stats: k === 'egg' ? 'Incubates · walk to hatch it' : 'Open it in your Backpack' })), { coins: res.coins, footerNote: `+${res.xp + bonusXp} XP` }).then(() => { refresh(); });
    } else {
      toast(`Quest done · +${res.xp} XP · +${res.coins} coins`, 2800);
      refresh();
    }
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
    <div class="row"><span>${label}${glow ? ` <span class="hit-dot">${ICONS.check(11)}</span>` : ''}</span><span class="val">${fmtG(val)} / ${target} g</span></div>
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

/* What your Bonehead says on the home screen.
 *
 * The pools used to be indexed by the DAY OF THE MONTH, which meant he said one
 * line all day no matter how many times you opened the app — nine lines read like
 * one. The index is now a per-open salt, so every launch gets a fresh line and the
 * bubble still holds still within a session instead of flickering on each render.
 *
 * House rules for anything added here: never comment on a number being too high,
 * never imply eating less is the win, and keep him fond of the player. He is a
 * skeleton who is delighted you showed up, not a coach. */
function speechLine({ entries, tot, targets, crates, streak, isToday, steps = 0, dishReady = false, cropsRipe = 0, fightsReady = 0, spires = 0 }) {
  if (S.speechSalt == null) S.speechSalt = Math.floor(Math.random() * 1e6);
  const pick = arr => arr[(S.speechSalt + arr.length) % arr.length];
  const hour = new Date().getHours();
  if (S.pendingLevelLine) { const l = S.pendingLevelLine; S.pendingLevelLine = null; return l; }
  if (crates.length) return pick([
    'Crack that crate open already!',
    'Loot is burning a hole in my ribs.',
    'Crates do not open themselves, chief.',
    'I can hear something rattling in there. Relatable.',
    'Unopened crates keep me up at night. I do not sleep anyway.',
    'That crate has been staring at me. Rude.',
    'Could be a hat in there. Could be socks. Open it.',
    'I shook it. Something moved. Your turn.',
    'Loot goes stale, you know. It does not, but open it anyway.',
    'A closed crate is just a rectangle. Fix that.',
  ]);
  if (!isToday) return pick([
    'Time traveling, are we? Tap me to change my fit.',
    'The past. Nice place. I was there.',
    'Nothing to log back here, chief. Just vibes.',
    'History cannot be re-cooked. It can be admired.',
  ]);
  if (cropsRipe) return pick([
    cropsRipe === 1 ? 'Something in the garden is ready. I have been watching it.' : `${cropsRipe} beds are ready. The garden is showing off.`,
    'The patch is done. Go and pick it before I try.',
    'I have no thumbs and yet I grew that.',
    'Harvest time. My favourite kind of standing around.',
    'The garden delivered. Unlike most of my plans.',
  ]);
  if (dishReady) return pick([
    'Something is done in the pot. I can smell it. Somehow.',
    'The cauldron is finished and very smug about it.',
    'Dinner is ready and I have no throat. Go on.',
    'Kitchen is dinging. Kitchen never dings gently.',
    'Serve that dish before it becomes a science project.',
  ]);
  if (!entries.length) return pick([
    'Feed me a log, chief.',
    'Bones do not fuel themselves.',
    'Scan something tasty. I dare you.',
    'My stomach would growl if I had one.',
    'I have not eaten in years. You have no excuse.',
    'Breakfast: the most important meal I cannot have.',
    'Blank slate. Put something delicious on it.',
    'Whatever it is, it counts. Log it.',
    'I live vicariously through your lunch.',
    'Zero logs. Bold opening move.',
    hour < 11 ? 'Morning. What are we eating? I mean you.' : 'Still nothing logged. I am extremely patient and mildly nosy.',
  ]);
  if (targets && targets.p && tot.p >= targets.p) return pick([
    'Protein secured. Bones swole.',
    'Full protein. Maximum calcium energy.',
    'Somewhere, a cow is proud of us.',
    'These femurs? Sponsored by protein.',
    'Protein target: obliterated. Politely.',
    'You could bench a tombstone right now.',
    'Every gram went straight into the good bones.',
    'That is the stuff. Structural integrity rising.',
  ]);
  if (targets && tot.kcal > targets.kcal) return pick([
    'Big day. We log it all anyway.',
    'Honest logs make strong bones.',
    'We feast like kings. Kings log too.',
    'Logged it. That is the whole trick, chief.',
    'A big day is still a tracked day. Nice work.',
    'No notes. Just numbers. Onward.',
    'The ledger does not judge. Neither do I.',
  ]);
  if (targets && targets.kcal - tot.kcal <= 350 && targets.kcal - tot.kcal > 0) return pick([
    'Right in the zone. Finish strong.',
    'Stick the landing tonight.',
    'So close I can taste it. Figure of speech.',
    'This is the good part of the day.',
    'Dialled in. Do not let me distract you.',
    'Textbook. Frame it.',
    'You have got room for something good. Use it well.',
  ]);
  // Everything from here down is chatter rather than a nudge, so the eligible
  // pools are POOLED and picked across, not tried in order. As separate early
  // returns, `streak >= 3` sat above the general pool and swallowed it whole: any
  // player with a streak going only ever heard the streak lines, which is most of
  // why a pile of lines read like a handful.
  const chatter = [
    ...(steps >= 12000 ? [
      `${steps.toLocaleString()} steps. My ankles filed a complaint.`,
      'You walked like the town owed you money.',
      'Big legs day. Literally all I am.',
      'That is a lot of ground. Any of it have loot on it?',
      'Somewhere out there a spire heard you coming.',
    ] : []),
    ...(streak >= 3 ? [
      `Day ${streak}. Keep the flame alive.`,
      `${streak} days straight. Absolutely unkillable. Well. Again.`,
      `Streak day ${streak}. The calcium is compounding.`,
      `${streak} in a row. I am starting to expect this of you.`,
      `Day ${streak} and the streak is load-bearing now.`,
      `${streak} days. Consistency looks good on you. So does that hat.`,
    ] : []),
    ...(spires > 0 ? [
      spires === 1 ? 'One tower flies our name. I check on it hourly.' : `${spires} spires under our name. Landlord energy.`,
      'The tribute is not going to walk itself over here.',
      'Someone will come for our tower eventually. Let them.',
    ] : []),
    ...(fightsReady >= 3 ? [
      `${fightsReady} fights in the tank. The Pit is right there.`,
      'I am full of vigor and bad decisions.',
      'Something in the Pit needs hitting. I volunteer you.',
    ] : []),
    ...(hour >= 23 || hour < 5 ? [
      'Late one. I do not sleep, but you should.',
      'The witching hour. My hour, technically.',
      'Logging at midnight is a lifestyle. Respect.',
    ] : []),
  ];
  return pick([
    ...chatter,
    'The bones are our money!',
    'Solid pace today.',
    'What is next on the menu?',
    'More protein never hurt a skeleton.',
    'Cardio? In this economy?',
    'I am 206 bones of pure potential.',
    'Every day is leg day when you are mostly legs.',
    'I do all my thinking with my skull.',
    'Hydrate. Marrow does not make itself.',
    'I have no organs and yet somehow opinions.',
    'Do these ribs make me look confident?',
    'I would kill for a sandwich. I have killed for less.',
    'Nothing hurts when you are all frame and no complaints.',
    'Tap me. I got a new fit and nobody has noticed.',
    'They said I would never amount to anything. I amounted to 206 things.',
    'Skipped leg day once. Grew them back.',
    'I am not lazy, I am structurally efficient.',
    'Bone density: rising. Mood: also rising.',
    'You keep showing up. I keep standing here. Great system.',
    'One day I will get a nose. Today is not that day.',
    'Bones out, standards high.',
    'Nobody has ever won an arm wrestle against me twice.',
    'I peaked in the Cretaceous and I am peaking again.',
    'Been dead for years, never felt better.',
  ]);
}
// The pools are picked from a union, so sampling the real screen cannot prove a
// given pool is reachable at all. This lets a test drive the salt and read back
// every line a state can produce. Webdriver only, same as the other hooks.
if (typeof window !== 'undefined' && navigator.webdriver) {
  window.__speech = (ctx, salt) => { S.speechSalt = salt; return speechLine(ctx); };
}

// NOTE: the `noYard` option some callers still pass is a legacy no-op — the
// yard-decor slot was retired, so there is no anchored decor layer any more.
/* Eye items whose ARTWORK depicts something lit, so a glow is telling the truth
 * about the drawing rather than adding an effect to it. E4 is two coals with hot
 * cream centres; E9 (fire in the socket) and E2 are the obvious next candidates
 * once Tom decides they should breathe too. */
const EMBER_EYES = new Set(['E4']);

function avatarLayersHtml(eq, opts = {}) {
  const skip = new Set(opts.skip || []);
  const slots = [...BH_SLOTS].sort((a, b) => a.z - b.z);
  const layers = slots.map(s => {
    if (skip.has(s.code)) return '';
    const itemId = eq[s.code];
    if (!itemId || !BH_BY_ID[itemId]) return '';
    const item = BH_BY_ID[itemId];
    // opts.shinyPetId: the ONE renderer that keeps the pet inside the stack
    // (the leaderboard) needs the shiny recolour swapped in; the shiny PNG
    // shares the base art's canvas geometry so it stacks identically
    const src = s.code === 'C' && itemId !== 'CX' && opts.shinyPetId === itemId
      ? `assets/bh/C/shiny/${itemId}.png` : bhAsset(item);
    // weapon / off-hand glow by rarity (epic/legendary)
    const slimed = S.slimeSlots && S.slimeSlots.has(s.code);
    const cls = [
      // COSMETIC ONLY. S.glow never touches stats, gear bonuses or the slimed
      // ledger: it decides whether the halo is drawn, nothing else.
      S.glow && (s.code === 'IR' || s.code === 'IL') && (item.rarity === 'epic' || item.rarity === 'legendary') ? `wpn-glow r-${item.rarity}` : '',
      S.glow && slimed ? 'bh-slimed' : '',
      // EMBER EYES: the eye items drawn as lit coals get a slow breathing glow.
      // A set rather than a rarity test, because "does this art depict light?" is
      // a property of the drawing, not of how rare it is. Add ids here as Cam
      // draws more lit eyes.
      S.glow && s.code === 'E' && EMBER_EYES.has(itemId) ? 'eye-ember' : '',
    ].filter(Boolean).join(' ');
    const glow = cls ? ` class="${cls}"` : '';
    // NOT lazy, NOT async-decoded: these layers only mean anything stacked
    // together. Loading them independently is what made the character visibly
    // assemble itself, piece by piece, every single render.
    // onerror removes the node: a failed layer (cold cache, flaky network)
    // must degrade to a missing garment, never iOS's blue "?" box over the body
    return `<img${glow} src="${src}" alt="" onerror="this.remove()">`;
  }).join('');
  // Visible by DEFAULT. v233 shipped this with bh-composing baked into the
  // markup, which meant any stack injected somewhere composeAvatars() never
  // reached (the map "you" marker, the fight arena) stayed at opacity 0 and the
  // character was simply invisible. Hiding is now owned by the same code that
  // un-hides it, so a missed call costs a little pop-in, never the whole avatar.
  //
  // The weapon charge lives INSIDE the stack, next to the layers it lights, for
  // the same reason the ember eyes do: a cosmetic that only some screens call is
  // a cosmetic that looks broken on the rest. Emitting it here is what makes it
  // reach all 17 avatar surfaces instead of only the Wardrobe.
  return `<div class="bh-anim">${layers}${weaponSheenHtml(eq, skip)}</div>`;
}

// A leaderboard/podium row's Bonehead. The ONE renderer that keeps the pet
// inside the stack, so it must pass the row's own shiny flag through: reading
// S.shinyPets here would paint every friend's pet from the VIEWER's collection
// (how Brock's shiny lizard rendered base-purple on the board).
const lbAvatar = (p, cls = 'lb-av') =>
  `<div class="${cls}">${avatarLayersHtml(p.outfit || { B: 'B0-1', SK: 'SK0-1' },
    { noYard: true, skip: ['BG'], shinyPetId: p.pet && p.pet.shiny ? p.pet.id : null })}</div>`;
// Test hook (webdriver only): the board renders from a server payload, so
// "does a shiny row render shiny" was only ever checkable on a real phone.
if (typeof window !== 'undefined' && navigator.webdriver) window.__lbAvatar = lbAvatar;

/* Reveal a layered Bonehead only once every layer has decoded, so it appears as
   one finished character instead of assembling on screen. Cheap after the first
   paint: decoded images come straight from cache, so this is a no-op on
   re-renders. Called after any render that can contain a .bh-anim stack. */
function composeAvatars(root = document) {
  const scope = root && root.querySelectorAll ? root : document;
  for (const stack of scope.querySelectorAll('.bh-anim:not([data-composed])')) {
    stack.dataset.composed = '1';
    const imgs = [...stack.querySelectorAll('img')];
    if (!imgs.length) continue;
    // Already decoded (cache hit) means there is nothing to hide: skip straight
    // through rather than blink the character out and back in.
    if (imgs.every(i => i.complete && i.naturalWidth > 0)) continue;
    stack.classList.add('bh-composing');
    const ready = imgs.map(i => (i.decode ? i.decode() : Promise.resolve()).catch(() => {}));
    // Never leave a character invisible because one asset 404s or hangs.
    Promise.race([Promise.all(ready), new Promise(r => setTimeout(r, 1500))])
      .then(() => stack.classList.remove('bh-composing'));
  }
}

function healthCardHtml(hk, isToday) {
  if (!hk && !(S.settings.hkConnected && isToday)) return '';
  const steps = hk?.steps;
  const active = hk?.activeKcal;
  const goal = 10000;
  const stepPct = steps ? Math.min(100, (steps / goal) * 100) : 0;
  return `<div class="card">
    <div class="card-title">ACTIVITY · APPLE HEALTH ${isToday ? (isNative() && S.settings.hkNative ? `<span class="link auto" title="Syncs automatically on open">Auto ${ICONS.check(12)}</span>` : '<button class="link" id="hkSync">Sync</button>') : ''}</div>
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
        ${(hk.workouts || hk.exerciseMin) ? `<div class="hk-row"><span class="hk-ico">🏋️</span><div style="font-size:13.5px;font-weight:600">${[
          hk.workouts ? `${hk.workouts} workout${hk.workouts === 1 ? '' : 's'}` : '',
          hk.exerciseMin ? `${hk.exerciseMin} min` : '',
        ].filter(Boolean).join(' · ')}${hk.wtypes && hk.wtypes.length ? ` <span style="color:var(--text-3);font-weight:500">${hk.wtypes.slice(0, 3).join(', ')}</span>` : ''}</div></div>` : ''}
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
function wellnessCardHtml(w, routines = [], done = new Set()) {
  if (!w) return '';
  const waterDone = w.water >= WATER_GOAL;
  const row = (cls, ico, title, doneLbl, todoLbl, done, btnId, btnLabel, extra = '') => `
    <div class="well-row ${done ? 'done' : ''}">
      <span class="well-ico">${ico}</span>
      <div class="well-body"><b>${title}</b><small>${done ? doneLbl : todoLbl}</small>${extra}</div>
      ${done ? `<span class="well-check">${ICONS.check(14)}</span>` : `<button class="btn small ${cls}" id="${btnId}">${btnLabel}</button>`}
    </div>`;
  const waterBar = `<div class="well-bar"><i style="width:${Math.round(w.water / WATER_GOAL * 100)}%"></i></div>`;
  return `<div class="card wellness-card">
    <div class="sect-h" style="margin:0 0 4px">Daily wellness</div>
    ${row('', ICONS.water(22), 'Water', `${WATER_GOAL} cups down. Hydrated.`, `${w.water} / ${WATER_GOAL} cups`, waterDone, 'wWater', '+1 cup', waterBar)}
    ${row('ghost', ICONS.bed(22), 'Make your bed', 'Done. A small win banked.', 'Start the day with a small win', w.bed, 'wBed', 'Mark done')}
    ${sleepRowHtml(w)}
    ${/* YOUR OWN routines, under the three the game has opinions about. Same row
         language, same ledger, so they count toward the wellness quest too. */''}
    <div class="sect-h" style="margin:14px 0 4px">Your routines</div>
    ${routines.length ? routines.map(r => `
      <div class="well-row ${done.has(r.id) ? 'done' : ''}">
        <span class="well-ico">${ICONS.check(20)}</span>
        <div class="well-body"><b>${esc(r.name)}</b><small>${done.has(r.id) ? 'Done today' : 'Tap when it is done'}</small></div>
        ${done.has(r.id)
          ? `<span class="well-check">${ICONS.check(14)}</span>`
          : `<button class="btn small ghost" data-routine="${r.id}">Mark done</button>`}
        <button class="link routine-x" data-routinedel="${r.id}" aria-label="Remove ${esc(r.name)}">Remove</button>
      </div>`).join('')
      : '<p class="note" style="margin:2px 2px 8px">Anything you want to hold yourself to: stretch, meds, walk the dog, ten minutes of guitar.</p>'}
    <button class="btn ghost small" id="addRoutine" style="margin-top:6px">Add a routine</button>
  </div>`;
}

// Sleep logs HOURS (tracked over time), not a yes/no. Tapping a chip logs/updates
// the night; the chosen hours highlights. Wellbeing: never scolds a short night.
function sleepRowHtml(w) {
  const logged = w.sleepHours != null;
  const auto = !!w.sleepAuto;
  const hm = h => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;
  const chips = [5, 6, 7, 8, 9].map(h =>
    `<button class="hchip ${w.sleepHours === h ? 'on' : ''}" data-sleep="${h}">${h === 9 ? '9+' : h}h</button>`).join('');
  // Auto (from the watch): show the hours + score, no manual chips to tap. Manual
  // fallback (no watch data): the hour chips.
  const line = auto
    ? `${hm(w.sleepHours)} from your watch${w.sleepScore != null ? ` · sleep score ${w.sleepScore}` : ''}. Rest is training too.`
    : logged ? `${w.sleepHours} h logged. Rest is training too.` : 'How many hours did you get?';
  return `
    <div class="well-row ${logged ? 'done' : ''}">
      <span class="well-ico">${ICONS.moon(22)}</span>
      <div class="well-body">
        <b>Sleep</b>
        <small>${line}</small>
        ${auto ? '' : `<div class="sleep-picks">${chips}</div>`}
      </div>
      ${logged ? `<span class="well-check">${ICONS.check(14)}</span>` : ''}
    </div>`;
}

// The Glutton (v215): a one-time world-boss spectacle. Lightweight interim
// version — no map marker, no blight/spawn-suppression mechanic yet (those are
// still ROADMAP items). Reachable from a card on Today; the win is idempotent
// via the same award() ledger every other one-time encounter uses.
// He surfaces twice a day. Tell the player which it is, in plain language.
const hr12 = h => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;
function gluttonWhenHtml() {
  const w = gluttonWindow();
  return w.active
    ? `<b style="color:var(--glutton-sick)">He's out on the map right now</b>, until ${hr12(w.endHour)}.`
    : `He feeds twice a day. Next sighting <b>${hr12(w.nextHour)}${w.tomorrow ? ' tomorrow' : ''}</b>.`;
}
// The exact lore lockup + copy Tom already approved (scratchpad/glutton.src.html,
// direction locked). Reused verbatim for both the compact card and the full
// sheet reveal — do not paraphrase this, it's Brock's, use it as written.
function gluttonLoreHtml() {
  return `<div class="glutton-lore">
    <p class="lead">With a comparable appetite to a chocolate lab and the expansion rate of spray foam insulation, the Glutton is no mere dungeon monster.</p>
    <p>It seeks out and devours every goodie and gold piece its blobby body can slime up to, leaving a dead <span class="accent">blight</span> where nothing will spawn until it is dealt with.</p>
    <p>Muster your might and face this abomination. You may become its next snack. You may make off with its entire jellified hoard.</p>
    <p class="sign">Best of luck, my bony buddy.</p>
    <div class="glutton-quote">&ldquo;Plan for what is difficult while it is easy,<br>do what is great while it is small.&rdquo;<br><b>- Sun Tzu&hellip; probably</b></div>
  </div>`;
}
// A collapsible teaser banner on Today (above Quests), not a fight entry point:
// he's a world boss now, only fightable by finding his marker on the live map.
/* ONE card instead of four competing ones.
 *
 * Today used to stack the Glutton, Dark Spires, the Puffer Pack and the Bone
 * Garden as four separate cards, each 62px, each with the same icon + uppercase
 * eyebrow + Bangers title + chevron. Four identical shouts is silence: nothing
 * earned attention because everything looked equally urgent, and every feature
 * shipped from here on would have added another 62px forever.
 *
 * They keep their own <details> bodies and their own button ids, so every handler
 * and every expanded panel still works exactly as before. What changes is that
 * they now share one container and are ORDERED BY URGENCY, because a deadline
 * must never sit below a standing offer. */
function outThereHtml({ held = [], cropsRipe = 0 } = {}) {
  const sieged = held.filter(s => s.siege).length;
  const owed = held.reduce((n, s) => n + (s.tribute ? s.tribute.coins : 0), 0);
  const soon = held.filter(s => s.resolvePct < 0.3).length;
  // `act` marks a row that is WAITING ON THE PLAYER. Only those get the accent, so
  // the colour still means "do this next" instead of decorating every row.
  const act = h => h.replace('class="glutton-banner', 'class="glutton-banner has-action');
  const rows = [
    // a siege has a clock on it, so it outranks everything
    { pri: sieged ? 0 : owed ? 30 : soon ? 35 : 45,
      html: (owed || soon || sieged) ? act(spireBannerHtml(held)) : spireBannerHtml(held) },
    // the Glutton's feeding window closes; still time-limited, just less sharp
    { pri: 10, html: gluttonBannerHtml() },
    // crops rot into nothing, but a ready crop is money sitting on the table
    { pri: cropsRipe ? 20 : 50,
      html: cropsRipe ? act(gardenBannerHtml(cropsRipe)) : gardenBannerHtml(cropsRipe) },
    // evergreen: the shop is not going anywhere
    { pri: 60, html: dropBannerHtml() },
  ].sort((a, b) => a.pri - b.pri);
  return `<div class="card out-there">
    <div class="sect-h ot-head">Out there today</div>
    ${rows.map(r => r.html).join('')}
  </div>`;
}

function gluttonBannerHtml() {
  return `<details class="glutton-banner">
    <summary>
      <span class="gbn-ico">${gluttonHeroHtml()}</span>
      <span class="gbn-txt"><i>New on the map</i><b>The Glutton is loose</b></span>
      <span class="gbn-chev">›</span>
    </summary>
    <div class="gbn-body">
      <div class="gbn-hero">${gluttonHeroHtml()}</div>
      ${gluttonLoreHtml()}
      <div class="gbn-maplabel">How the blight reads on the map</div>
      ${gluttonBlightMapHtml()}
      <p class="glutton-mech">${gluttonWhenHtml()} He <b>blights</b> the ground he squats on, so nothing spawns near him. Walk out, find him, and fight him there: no button teleports you to him.</p>
      <button class="btn ghost" id="gluttonToMap" style="width:100%">Open the Boneyard</button>
    </div>
  </details>`;
}

// A stylized "map screenshot" for the banner: the approved feathered-fog blight
// with the REAL Glutton art at its heart + a couple of Boneyard markers, so the
// banner shows what the player will see, not just describe it. Asset paths (not
// base64) so it stays in sync with the shipped art.
function gluttonBlightMapHtml() {
  return `<div class="gbn-map"><svg viewBox="0 0 350 150" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="gbnGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#9fb04e" stop-opacity="0.24"/><stop offset="100%" stop-color="#9fb04e" stop-opacity="0"/></radialGradient>
      <radialGradient id="gbnCore" cx="45%" cy="45%" r="62%"><stop offset="0%" stop-color="#070a04" stop-opacity="0.9"/><stop offset="55%" stop-color="#111806" stop-opacity="0.5"/><stop offset="100%" stop-color="#111806" stop-opacity="0"/></radialGradient>
      <filter id="gbnOoze" x="-40%" y="-40%" width="180%" height="180%"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="11" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="26" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="4"/></filter>
      <filter id="gbnMottle" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.04 0.05" numOctaves="4" seed="6" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0.22  0 0 0 0 0.27  0 0 0 0 0.09  0 0 0 1.6 -0.55"/></filter>
      <mask id="gbnMask"><g filter="url(#gbnOoze)" fill="#fff"><ellipse cx="232" cy="92" rx="88" ry="60"/><ellipse cx="176" cy="80" rx="38" ry="28"/><ellipse cx="286" cy="104" rx="40" ry="30"/><ellipse cx="258" cy="54" rx="30" ry="22"/></g></mask>
    </defs>
    <rect width="350" height="150" fill="#0d0c13"/>
    <g stroke="#EAE3D2" stroke-opacity="0.09" stroke-width="4" stroke-linecap="round"><line x1="-10" y1="44" x2="360" y2="44"/><line x1="-10" y1="104" x2="360" y2="104"/><line x1="70" y1="-10" x2="70" y2="160"/><line x1="160" y1="-10" x2="160" y2="160"/></g>
    <g transform="translate(40,52)"><path d="M0-11c6 0 11 5 11 11 0 8-11 18-11 18S-11 8-11 0c0-6 5-11 11-11z" fill="#e06a86" stroke="#12140a" stroke-width="2.5"/></g>
    <circle cx="112" cy="34" r="7" fill="#c9a24a" stroke="#12140a" stroke-width="2.5"/>
    <ellipse cx="232" cy="94" rx="110" ry="80" fill="url(#gbnGlow)"/>
    <g mask="url(#gbnMask)">
      <rect x="120" y="10" width="230" height="140" fill="#0a0d07" opacity="0.6"/>
      <rect x="120" y="10" width="230" height="140" fill="url(#gbnCore)"/>
      <rect x="120" y="10" width="230" height="140" filter="url(#gbnMottle)" opacity="0.85"/>
    </g>
    <image href="assets/bh/glutton/idle.png" x="196" y="52" width="74" height="74" preserveAspectRatio="xMidYMid meet"/>
  </svg></div>`;
}

// Which appearance are we on? The window is the source of truth, but a fight that
// STARTS inside a window can settle after it closes, and the settle used to fall
// back to slot 0 in that case: the win got filed under an appearance that was
// never fought, so the sheet looked unbeaten. The slot is captured when the
// encounter opens and carried through the fight instead.
function gluttonSlotNow() {
  const w = gluttonWindow();
  return w.active ? w.slot : 0;
}
async function gluttonBeaten(slot) {
  const allXp = await db.all('xp');
  return allXp.some(r => r.key === gluttonKey(dateKey(), slot));
}

async function openGluttonSheet() {
  const slot = gluttonSlotNow();
  // "beaten" is per APPEARANCE, not forever: he's back next window. Note this no
  // longer requires w.active — a win recorded for this slot reads as beaten even
  // if the window closed while you were fighting, which is exactly the state that
  // used to re-offer the fight.
  const beaten = await gluttonBeaten(slot);
  const wrap = openSheet(`
    <button class="sheet-close" style="position:absolute;top:12px;right:14px;z-index:2">Done</button>
    <div class="sheet-body glutton-card" style="border:none;background:none;padding-top:8px">
      <div class="glutton-tag">something is eating the boneyard</div>
      <h2 class="glutton-h1"><span class="sm">BEWARE THE</span><span class="big">GLUTTON</span></h2>
      ${gluttonHeroHtml()}
      ${gluttonLoreHtml()}
      <p class="glutton-mech">It <b>blights</b> the ground it eats. Hunt it down and win to <b>cleanse the land</b> and claim its hoard.</p>
      ${beaten
        ? '<p class="glutton-beaten">Cleansed for now. He crawls back out at his next feeding.</p>'
        : '<button class="glutton-cta" id="gluttonFight">FACE THE GLUTTON</button>'}
    </div>`, { cls: '', name: 'The Glutton' });
  /* THREE independent guards, because this is the third attempt at the same
     exploit and the previous two each relied on a single mechanism.

     Attempt one moved the map marker. Attempt two used history.go(-2) to pop the
     fight AND this sheet. Neither touched the sheet's own markup, which is built
     once at open time: land back here by any route (a loot reveal changing the
     history depth so go(-2) pops the wrong two entries, an iOS edge-swipe, a
     backdrop tap) and the button was still sitting there, still wired. A Glutton
     fight costs no Vigor and every win mints a uniquely-keyed `fight` row, so one
     stale button is a farm.

     So: the sheet HEALS itself on the win event, it re-checks on becoming visible
     again, and the handler re-reads the ledger before it will open a fight. Any
     one of the three alone kills it. */
  const healCleansed = () => {
    const cta = $('#gluttonFight', wrap);
    if (!cta) return;
    const p = document.createElement('p');
    p.className = 'glutton-beaten';
    p.textContent = 'Cleansed for now. He crawls back out at his next feeding.';
    cta.replaceWith(p);
  };
  const onBeaten = () => healCleansed();
  addEventListener('bh-glutton-beaten', onBeaten);
  // the sheet outlives the listener otherwise: stop leaking one per open
  const mo = new MutationObserver(() => { if (!wrap.isConnected) { removeEventListener('bh-glutton-beaten', onBeaten); mo.disconnect(); } });
  mo.observe(document.getElementById('sheets'), { childList: true });
  // coming back to a backgrounded app, or back from any pushed sheet, re-checks
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && wrap.isConnected && await gluttonBeaten(slot)) healCleansed();
  });

  $('#gluttonFight', wrap)?.addEventListener('click', async () => {
    // last line of defence: the ledger, read at the moment of the tap
    if (await gluttonBeaten(slot)) {
      healCleansed();
      toast('Already cleansed. He crawls back out at his next feeding.', 3000);
      return;
    }
    const fighter = await buildFighter();
    openFight(wrap, fighter, {
      mode: 'glutton', name: 'The Glutton', mult: 1.3, aiLevel: 3,
      talents: ['heavyhands', 'marrowlust', 'bonebreaker'], venue: 'The Blighted Yard',
      // carry the appearance INTO the fight, so a settle after the window closes
      // still files the win under the appearance that was actually fought
      gluttonSlot: slot,
    });
  });
}
if (typeof window !== 'undefined' && navigator.webdriver) window.__openGlutton = () => openGluttonSheet();

/* The spire pitch, shown when you stand at an unclaimed one. States what you get
   in plain terms, because a wall of territory rules is how a good idea dies. */
/* Tapping a boss den. The map can show you WHERE a tower is; it cannot tell you
   whether it is worth the walk, which is the whole reason this sheet exists (Tom,
   2026-08-06, on the persistent distance list: "showing the distance from things
   doesnt seem useful i can jsut look at the map"). Every value shown is real and
   already computed: the weekly theme and boss, the tier, `den.reward`, and the
   gear odds straight off the roll's own weights.
   `onFight` is passed in so this sheet never has to know how a fight is built. */
/* THE SPIRE SHEET. Tapping a tower on the Boneyard tells you whose it is.
 *
 * Tom, 2026-08-08: "why cant i click a Spire on the map in boneyard and see
 * somethign cool like who has it right now etc. it should be like pokemon go
 * where youre proud to rep your gym and flex on other players." Spires were not
 * in the map's click selector at all, so a tap did nothing.
 *
 * Every fact here already arrives on the /spires poll (owner name, level,
 * claimed_at, siege): this is a reader, no new request and no server change.
 * The flex is the point, so the holder's name and their earned warden title are
 * the loudest things on the sheet, and the tower's level is its history: every
 * takeover and every repelled siege adds one.
 */
function openSpireInfoSheet(info, onAct = null) {
  const { s, view, held, rival, dormant, besieged, siegeUntil, siegeName, lvl, heldSince } = info;
  const days = heldSince ? Math.floor((Date.now() - heldSince) / 86400000) : 0;
  const wt = wardenTier(days);
  const holder = held ? 'You hold it' : rival ? esc(rival.ownerName || 'A rival') : dormant ? 'Gone dormant' : 'Nobody';
  const standing = heldSince
    ? (days >= 1 ? `Standing ${days} day${days === 1 ? '' : 's'}` : 'Taken today')
    : 'Never been taken';
  const inRange = s.dist != null && s.dist <= SPIRE_RADIUS_M;
  const facts = [
    { ico: bhIcon('tombstone', 20), big: `LV ${lvl}`, lab: 'TOWER' },
    heldSince ? { ico: ICONS.star(20), big: String(days), lab: days === 1 ? 'DAY HELD' : 'DAYS HELD' } : null,
    held && view.tribute && view.tribute.coins ? { ico: ICONS.coin(20), big: String(view.tribute.coins), lab: 'TRIBUTE' } : null,
  ].filter(Boolean);

  openSheet(`
    <div class="sheet-head">
      <div class="hd">
        <h2>${esc(s.name || 'Dark Spire')}</h2>
        <div class="sub">${besieged ? 'Under siege' : held ? 'Your tower' : rival ? 'Rival territory' : 'Unclaimed'}</div>
      </div>
      <div class="t1-tools"><button class="sheet-close t1-icon-btn" aria-label="Close">${ICONS.close(17)}</button></div>
    </div>
    <div class="sheet-body">
      <div class="den-hero sp-hero${held ? ' mine' : rival ? ' rival' : ''}">
        <span class="art"><img src="assets/brand/tomb.png" alt=""></span>
        <div class="who">
          <b>${holder}</b>
          <small>${esc(standing)}</small>
          ${wt.tier ? `<span class="tier warden t${wt.tier}">${esc(wt.name.toUpperCase())}</span>` : `<span class="tier">LV ${lvl} TOWER</span>`}
        </div>
      </div>
      ${besieged ? `<div class="sp-siege">${esc(siegeName || 'Someone')} is laying siege. It falls in ${esc(fmtCookTime(Math.max(0, siegeUntil - Date.now())))} unless you break it.</div>` : ''}
      ${t1Sect('The tower')}
      <div class="den-pays">
        ${facts.map(f => `<div class="p"><span>${f.ico}</span><b>${esc(f.big)}</b><small>${f.lab}</small></div>`).join('')}
      </div>
      <p class="note" style="margin:10px 2px 0">${held
        ? 'Every day it stands it pays you tribute, and holding towers lifts every quest payout you claim.'
        : rival
          ? 'Beat their warden and the tower flies your name instead. It keeps its level, and its level is how hard it has been fought over.'
          : 'Take it and it flies your name on the map for everyone who walks past.'}</p>
      <div class="den-walk">
        <span class="ic">${bhIcon('badge-signpost', 20)}</span>
        <div><div class="d">${s.dist != null ? esc(fmtDist(s.dist)) : 'Nearby'}</div><small>${inRange ? 'You are close enough' : `Get within ${SPIRE_RADIUS_M} m to act`}</small></div>
      </div>
    </div>
    ${inRange && onAct ? `<div class="t1-foot"><button class="btn" id="spireAct">${besieged && held ? 'Break the siege'
      : rival ? `Take it from ${esc(rival.ownerName || 'them')}`
      : !held ? 'Take this tower'
      : view.tribute && view.tribute.days ? 'Collect the tribute'
      : 'Tend it'}</button></div>` : ''}`, { cls: 't1', name: 'spire-sheet' });
  // delegate to the existing in-range button rather than restating the rules of
  // taking, tending and sieges: that flow already owns energy, shields and adds
  if (inRange && onAct) $('#spireAct')?.addEventListener('click', () => { history.back(); setTimeout(onAct, 220); });
}

function openDenSheet(den, { cleared = false, inRange = false, onFight = null } = {}) {
  const odds = denGearOdds(den.tier || 0);
  const r = den.reward || {};
  const crateName = r.crate === 'golden' ? 'Golden' : r.crate === 'egg' ? 'Step Egg' : r.crate ? 'Common' : null;
  const pay = [
    crateName ? [crateIcon(r.crate, 22), crateName.toUpperCase(), 'CRATE'] : null,
    r.coins ? [ICONS.coin(22), String(r.coins), 'COINS'] : null,
    r.xp ? [ICONS.star(20), String(r.xp), 'XP'] : null,
  ].filter(Boolean);

  const wrap = openSheet(`
    <div class="sheet-head">
      <div class="hd">
        <h2>${den.roaming ? 'Roaming den' : 'Boss den'}</h2>
        <div class="sub">${den.roaming ? 'Here today, gone tomorrow' : 'Rerolls its boss every Monday'}</div>
      </div>
      <div class="t1-tools"><button class="sheet-close t1-icon-btn" aria-label="Close">${ICONS.close(17)}</button></div>
    </div>
    <div class="sheet-body">
      <div class="den-hero">
        <span class="art"><img src="assets/brand/tombstone.png" alt=""></span>
        <div class="who">
          <b>${esc(den.name || 'Boss den')}</b>
          <small>${esc(den.boss || 'Warden')}</small>
          <span class="tier">TIER ${(den.tier || 0) + 1}</span>
        </div>
      </div>
      ${pay.length ? `${t1Sect('Pays out')}
      <div class="den-pays">
        ${pay.map(([ico, big, lab]) => `<div class="p"><span>${ico}</span><b>${esc(big)}</b><small>${lab}</small></div>`).join('')}
      </div>` : ''}
      ${t1Sect('Gear drop')}
      <p class="note" style="margin-bottom:7px">Two pieces drop, you keep one. This den's odds:</p>
      <div class="den-odds">
        ${odds.map(o => `<span class="${o.rarity}"><i>${o.pct}%</i>${o.rarity.toUpperCase()}</span>`).join('')}
      </div>
      <div class="den-walk">
        <span class="ic">${bhIcon('badge-signpost', 20)}</span>
        <div><div class="d">${den.dist != null ? esc(fmtDist(den.dist)) : 'Nearby'}</div><small>${inRange ? 'You are close enough to fight' : `Get within ${DEN_RADIUS_M} m to start`}</small></div>
      </div>
    </div>
    <div class="t1-foot">
      <button class="btn${inRange && !cleared ? '' : ' spent'}" id="denFight"${inRange && !cleared ? '' : ' disabled'}>
        ${cleared ? 'Already cleared today' : `Fight ${esc(den.boss || 'the warden')}`}
      </button>
      ${cleared
        ? '<div class="why">It pays again tomorrow. The tribute is once a day per den.</div>'
        : inRange ? '' : `<div class="why">Walk to within ${DEN_RADIUS_M} m and this lights up.</div>`}
    </div>`, { cls: 't1', name: 'den-sheet' });

  if (inRange && !cleared && onFight) {
    $('#denFight', wrap).addEventListener('click', () => { history.back(); setTimeout(onFight, 220); });
  }
  return wrap;
}

function openSpireSheet(s, view, rival = null) {
  const holder = rival ? (rival.ownerName || 'A rival') : s.warden;
  const wrap = openSheet(`
    <div class="sheet-head"><h2>${esc(s.name)}</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <div class="spire-hero"><img src="assets/brand/tomb.png" alt=""></div>
      <p class="note" style="margin:10px 2px">${rival
        ? `<b>${esc(holder)}</b> holds this tower. Beat their Bonehead and it is yours: they will hear about it.`
        : view.dormant
        ? `You let this one go dormant. Beat <b>${esc(s.warden)}</b> again to take it back.`
        : `<b>${esc(s.warden)}</b> holds this tower. Beat it and the spire flies your name.`}</p>
      <ul class="spire-terms">
        <li>It pays <b>tribute</b> every day, up to ${TRIBUTE_CAP_DAYS} days' worth. Collect it here, in person.</li>
        <li>Visit within <b>${RESOLVE_DAYS} days</b> to keep it. Miss that and it goes dormant, never lost.</li>
        <li>Each spire you hold earns the <b>Keeper's Boon</b>: <b>+${Math.round(BOON_PER_SPIRE * 100)}% quest coins</b> each, up to +${Math.round(boonBonusFor(BOON_SPIRE_CAP) * 100)}%.</li>
        <li>A tower <b>levels up</b> every time it changes hands or survives a siege, and pays more tribute for it.</li>
        <li>You can hold <b>${SPIRE_CAP}</b> at once, so pick towers you actually walk past.</li>
        ${rival ? '<li>Taking one off another player costs <b>one Pit fight</b>, and a tower just taken holds its walls for an hour.</li>' : ''}
      </ul>
      <button class="btn" id="spireFight" style="width:100%">Face ${esc(holder)}</button>
    </div>`, { cls: '', name: 'Dark Spire' });
  $('#spireFight', wrap)?.addEventListener('click', async () => {
    const fighter = await buildFighter();
    if (rival) {
      // Taking a tower off a PLAYER costs a Pit fight. Spire fights were free, so
      // two friends at one corner could flip a spire back and forth for 80 coins a
      // pass all afternoon. The 1h server shield stops the fast loop; this makes
      // the slow one cost something. NPC wardens stay free: walking out to an
      // unclaimed tower should never be gated.
      // spendPitFight returns {ok:false} when tapped out, and an object is always
      // truthy, so `if (!spent)` NEVER fired: this gate has never once blocked a
      // rival-tower fight, at any energy level. The comment above described a rule
      // the code did not implement.
      const spent = await spendPitFight();
      if (!spent.ok) { toast('No fights left in the tank. Log a meal or take a walk, then come back for it.', 4200); return; }
      // A rival's tower is defended by a faithful clone of THEIR fighter, the
      // same snapshot friend battles already use. No stats invented for them.
      const d = rival.defender || {};
      openFight(wrap, fighter, {
        mode: 'spire', name: rival.ownerName || 'Rival Warden', mult: 1,
        aiLevel: 3, venue: s.name, spire: s, rival: true,
        // the exact fields the friend-battle clone builder already reads, so a
        // rival's tower is defended by their real build, not an invented one
        foeStats: d.stats || null, foeOutfit: d.outfit || null,
        weaponId: d.weapon || d.loadout || 'starter', talents: d.talents || [],
      });
      return;
    }
    const w = wardenFor(s, levelFor(await totalXp()).level);
    openFight(wrap, fighter, { mode: 'spire', name: w.name, mult: w.mult, aiLevel: w.aiLevel,
      venue: w.venue, spire: s });
  });
}

/* The defense. A named NPC is at the gate and the clock is real, so this sheet
   says who, how long, and what happens either way: winning levels the tower,
   losing nothing but the clock running out leaves it DORMANT, never lost. */
function openSiegeSheet(s, view, siege) {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Under siege</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <div class="spire-hero besieged">
        <img class="spire-ico" src="assets/brand/tomb.png" alt="">
        <div class="spire-hero-title">${esc(s.name)}</div>
        <div class="spire-quote">LV ${view.level || 1} · YOURS</div>
      </div>
      <div class="siege-clock">
        <span class="sc-name">${esc(siege.name)}</span>
        <b class="sc-left">${fmtCookTime(Math.max(0, siege.until - Date.now()))}</b>
        <span class="sc-lab">left to break it</span>
      </div>
      <ul class="spire-terms">
        <li>Beat them and the tower <b>levels up</b>, pays more tribute, and counts as visited.</li>
        <li>Let the clock run out and it goes <b>dormant</b>. You never lose it: walk back any time and take it again.</li>
        <li>No other tower of yours can be besieged while this one is.</li>
      </ul>
      <button class="btn" id="siegeFight" style="width:100%">Break the siege</button>
    </div>`, { cls: '', name: 'Siege' });
  $('#siegeFight', wrap)?.addEventListener('click', async () => {
    const fighter = await buildFighter();
    const lvl = view.level || 1;
    // the besieger scales with the tower it wants: a long-held, high-level spire
    // is worth more and is defended harder
    openFight(wrap, fighter, {
      mode: 'spire', name: siege.name, mult: 1.05 + 0.05 * Math.min(6, lvl - 1),
      aiLevel: 3, venue: s.name, spire: s, siege: true,
    });
  });
}

function kitchenCardHtml(cook, ingCount, buffs, cropsRipe = 0) {
  if ((!cook || !cook.ready) && !cropsRipe) return '';
  const line = !cook || !cook.ready
    ? `<b style="color:var(--accent)">${bhIcon('garden-sprout', 18)} ${cropsRipe} crop${cropsRipe === 1 ? '' : 's'} ready to pick!</b>`
    : cook.readyCount > 1
    ? `<b style="color:var(--accent)">${cook.readyCount} dishes are ready!</b>`
    : `<b style="color:var(--accent)">${recipeIconHtml(cook.recipe, 18)} ${esc(cook.recipe.name)} is ready!</b>`;
  return `<div class="card kitchen-card" id="kitchenCard">
    <div class="card-title">KITCHEN <span class="link">Collect</span></div>
    <div class="kc-line">${line}</div>
  </div>`;
}

/* ---- The Bone Garden: its own screen, reached from the Kitchen ---- *
 *
 * It started as a section AT THE TOP of the Kitchen sheet and that was wrong: you
 * open the Kitchen to cook, and walking in to a grid of empty beds buried the
 * cauldrons under a system you had not asked for yet. So the Kitchen keeps ONE
 * row, the way the Today screen keeps one row per feature, and the garden gets a
 * screen with room for the beds, the pouch and the heap. */

// The row in the Kitchen. Reads its state so a ripe crop is obvious without
// opening anything, and stays quiet the rest of the time.
function gardenRowHtml(garden, seedTotal) {
  const ready = garden.readyCount, thirsty = garden.thirsty;
  const status = ready ? `<b style="color:var(--accent)">${ready} ${ready === 1 ? 'crop is' : 'crops are'} ready to pick</b>`
    : thirsty ? `<b>${thirsty} ${thirsty === 1 ? 'bed needs' : 'beds need'} water</b>`
    : garden.growing ? `<b>${garden.growing} growing</b>`
    : seedTotal ? `<b>${seedTotal} seed${seedTotal === 1 ? '' : 's'} to plant</b>`
    : '<b>Grow your own ingredients</b>';
  const sub = ready ? 'Bring them in' : thirsty ? 'A watered bed pays its top yield'
    : garden.growing ? 'Check back when it is done' : seedTotal ? 'Beds are standing empty' : 'Seeds come off your walks';
  return `<button class="crate-row garden-row${ready ? ' ripe' : ''}" id="gardenRow">
    <span class="crate-ico">${bhIcon(ready ? 'garden-sprout' : garden.growing ? 'garden-seedling' : 'garden-bed', 26)}</span>
    <span style="flex:1;text-align:left"><span class="gr-ttl">The Bone Garden</span>${status}<small>${esc(sub)}</small></span>
    <span class="gbn-chev">›</span>
  </button>`;
}

function openGardenSheet(after) {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>The Bone Garden</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body" id="gardenBody"></div>`, { cls: '', onClose: () => after?.() });
  const body = $('#gardenBody', wrap);

  // Tier 3 (mockup t3-garden.html, approved 2026-08-07): a bed you own is SOIL,
  // not a dashed void, so an occupied plot reads as a thing. The bed that needs
  // water carries the only loud cue on the screen (sky edge + a drawn droplet).
  const plotCard = p => {
    if (p.empty) return `<button class="t3-bed empty" data-plant="${p.index}">
      <span class="art">${bhIcon('garden-bed', 40)}</span><b>EMPTY BED</b><small>plant a seed</small></button>`;
    const pct = p.ready ? 100 : Math.max(0, Math.min(100, Math.round((1 - p.remainingMs / Math.max(1, p.readyAt - p.plantedAt)) * 100)));
    const inner = `
      ${p.canWater ? `<span class="drop"><svg width="12" height="12" viewBox="0 0 24 24" fill="var(--ink)"><path d="M12 3c3 4.5 6 7.6 6 11a6 6 0 1 1-12 0c0-3.4 3-6.5 6-11z"/></svg></span>` : ''}
      <span class="art">${bhIcon(p.ready ? 'garden-sprout' : 'garden-seedling', 40, p.rare ? '#9fe3cf' : undefined)}</span>
      <b>${esc(p.name).toUpperCase()}</b>
      <small>${p.ready ? (p.watered ? 'watered · full yield' : 'unwatered') : p.canWater ? 'needs water' : `${fmtCookTime(p.remainingMs)} left`}</small>
      ${p.ready ? '' : `<div class="bar t3-timer"><i style="width:${pct}%"></i></div>`}`;
    // ready -> harvest, thirsty -> water: the bed IS the button in both states,
    // which is the whole point of making it read as a tappable plot
    return p.ready
      ? `<button class="t3-bed ready" data-harvest="${p.index}">${inner}</button>`
      : p.canWater
        ? `<button class="t3-bed thirsty" data-water="${p.index}">${inner}</button>`
        : `<div class="t3-bed growing">${inner}</div>`;
  };

  async function render() {
    if (!body.isConnected) return;
    const [garden, compost] = await Promise.all([gardenState(), compostStatus()]);
    const bedPrice = plotPrice(garden.plotsOwned);
    const seedTotal = SEED_IDS.reduce((a, id) => a + (garden.seeds[id] || 0), 0);
    body.innerHTML = `
      <p class="note" style="margin:2px 2px 12px">Water once while it grows and a bed pays its top yield. Miss it and it still grows, just lean. <b style="color:var(--text)">Nothing ever dies.</b></p>
      <div class="t3-sect"><b>Beds · ${garden.plotsOwned} of ${PLOTS_MAX}</b><i></i></div>
      <div class="t3-beds">
        ${garden.plots.map(plotCard).join('')}
        ${bedPrice != null ? `<button class="t3-bed buy" id="buyBed">
          <span class="art">${bhIcon('garden-bed', 36)}</span><b>DIG A BED</b>
          <span class="t3-price" style="margin-top:3px">${ICONS.coin(12)} ${bedPrice.toLocaleString()}</span></button>` : ''}
      </div>
      <div class="t3-sect"><b>Seed pouch${seedTotal ? ` · ${seedTotal}` : ''}</b><i></i><button class="r chip" id="compostBtn" style="font-size:11px">Compost · ${compost.left} left</button></div>
      ${seedTotal ? `<div class="t3-pouch">
        ${SEED_IDS.filter(id => (garden.seeds[id] || 0) > 0).map(id => `<button class="t3-seed" data-plantseed="${id}">
          ${bhIcon('garden-seed', 22, BH_ICON_TINTS[INGREDIENTS[id].iconId] || undefined)}
          <b>x${garden.seeds[id]}</b><small>${esc(seedName(id))}</small></button>`).join('')}
      </div>` : '<p class="note" style="margin:2px 2px 10px">No seeds yet. They turn up while you walk the Boneyard, or compost a spare ingredient into some.</p>'}
      <p class="note" style="margin:10px 2px 4px">Seeds turn up while you walk the Boneyard. Harvests land in your ingredients, ready for the cauldrons.</p>`;

    $$('[data-water]', body).forEach(btn => btn.addEventListener('click', async () => {
      const res = await waterPlot(Number(btn.dataset.water));
      if (res.ok) { popSound(S.sounds); toast('Watered. That bed will pay its best.', 2400); }
      render();
    }));
    $$('[data-harvest]', body).forEach(btn => btn.addEventListener('click', async () => {
      const res = await harvestPlot(Number(btn.dataset.harvest));
      if (!res.ok) { render(); return; }
      await award(`harvest-${Date.now().toString(36)}`, 'garden', 6, `Harvested ${res.name}`);
      confettiBurst(innerWidth / 2, innerHeight * 0.35, res.bumper ? 26 : 16); levelSound(S.sounds);
      showHarvest(res);
      render();
    }));
    $$('[data-plant]', body).forEach(btn => btn.addEventListener('click', () => openPlantSheet(Number(btn.dataset.plant), render)));
    $$('[data-plantseed]', body).forEach(btn => btn.addEventListener('click', async () => {
      // tapping a seed in the pouch plants it in the first free bed, which is what
      // you meant; if every bed is busy, say so instead of doing nothing
      const res = await plantSeed(btn.dataset.plantseed);
      if (!res.ok) toast(res.reason === 'full' || res.reason === 'occupied' ? 'Every bed is busy. Harvest one, or dig another bed.' : 'No seeds of that kind.', 2800);
      else { popSound(S.sounds); toast(`${seedName(btn.dataset.plantseed)} planted. ${fmtCookTime(res.readyAt - Date.now())} to grow.`, 2800); }
      render();
    }));
    $('#compostBtn', body)?.addEventListener('click', () => openCompostSheet(render));
    {
      const price = plotPrice(garden.plotsOwned);
      armToConfirm($('#buyBed', body), price != null ? `Spend ${price.toLocaleString()}?` : 'Spend?', async () => {
        if (price == null) return;
        if ((await coins()) < price) { toast(`Need ${price.toLocaleString()} coins for another bed.`, 2800); return; }
        await coinsAdd(-price);
        await addPlot();
        popSound(S.sounds);
        toast(`Bed dug. ${garden.plotsOwned + 1} growing at once.`, 3000);
        render();
      });
    }
  }
  render();
  // live countdown while the sheet is open, same as the cauldrons
  // These screens re-render every second to tick their timers, which REPLACES the
  // markup and therefore throws away any half-made decision. That gave a player
  // under a second to confirm a purchase before the button reset itself. Hold the
  // tick while something is armed: a countdown being one second stale matters far
  // less than a confirm that vanishes under your thumb.
  const timer = setInterval(() => {
    if (!body.isConnected) { clearInterval(timer); return; }
    if (body.querySelector('.arming')) return;
    render();
  }, 1000);
}

/* ---- plant / compost / harvest ---- */

// Pick what goes in a specific bed. Separate from tapping a seed in the pouch
// (which fills the first free bed) because tapping the bed itself should let you
// choose, not guess.
function openPlantSheet(slot, after) {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Plant a seed</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body" id="plantBody"></div>`, { cls: '', onClose: () => after?.() });
  const body = $('#plantBody', wrap);
  async function render() {
    if (!body.isConnected) return;
    const g = await gardenState();
    const owned = SEED_IDS.filter(id => (g.seeds[id] || 0) > 0);
    body.innerHTML = owned.length ? owned.map(id => {
      const rare = isRareSeed(id);
      const mins = growMinutes(id);
      return `<div class="crate-row"><span class="crate-ico">${bhIcon('garden-seed', 26, BH_ICON_TINTS[INGREDIENTS[id].iconId] || undefined)}</span>
        <div style="flex:1"><b>${esc(seedName(id))} seed${g.seeds[id] > 1 ? ` ×${g.seeds[id]}` : ''}</b>
        <small>grows into ${esc(INGREDIENTS[id].name)}</small>
        <small class="recipe-need">${mins < 60 ? mins + 'm' : (mins / 60) + 'h'} · yields ${rare ? `${HARVEST_BASE_RARE} to ${HARVEST_BASE_RARE + 1}` : `${HARVEST_BASE} to ${HARVEST_BASE + 2}`}</small></div>
        <button class="btn small" data-sow="${id}">Plant</button></div>`;
    }).join('') : `<p class="note" style="margin:6px 2px">No seeds. Walk the Boneyard to find some, or compost a spare ingredient at the heap.</p>`;
    $$('[data-sow]', body).forEach(btn => btn.addEventListener('click', async () => {
      const res = await plantSeed(btn.dataset.sow, slot);
      if (!res.ok) { toast(res.reason === 'occupied' ? 'That bed is already growing something.' : 'No seeds of that kind.', 2800); render(); return; }
      popSound(S.sounds);
      toast(`${seedName(btn.dataset.sow)} planted. ${fmtCookTime(res.readyAt - Date.now())} to grow.`, 2800);
      history.back();       // straight back to the garden, where the bed is now busy
    }));
  }
  render();
}

// The heap: one ingredient in, 1 to 3 seeds out, three a day. The daily cap is the
// only thing standing between this and an ingredient printer, so it is stated on
// the sheet rather than discovered.
function openCompostSheet(after) {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Compost heap</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body" id="compostBody"></div>`, { cls: '', onClose: () => after?.() });
  const body = $('#compostBody', wrap);
  async function render() {
    if (!body.isConnected) return;
    const [inv, st] = await Promise.all([ingredients(), compostStatus()]);
    body.innerHTML = `
      <p class="note" style="margin:2px 2px 12px">Turn one ingredient into seeds of the same kind. The heap only takes <b>${st.cap} a day</b>, so this converts a glut into something growing rather than printing food out of nothing.</p>
      <div class="compost-card">
        <div class="compost-top"><span>${bhIcon('garden-bed', 30)}</span>
          <div style="flex:1"><b>1 ingredient in, 1 to 3 seeds out</b><small>Rolled when you compost, not when you plant.</small></div></div>
        <div class="odds">${SEED_ODDS.map((p, i) => `<span><b>${i + 1}</b>${Math.round(p * 100)}%</span>`).join('')}</div>
      </div>
      <div class="sect-h">Your ingredients · ${st.left} compost${st.left === 1 ? '' : 's'} left today</div>
      ${COMMON_INGREDIENT_IDS.map(id => {
        const have = inv[id] || 0;
        const can = have > 0 && st.left > 0;
        return `<div class="crate-row ${can ? '' : 'lack'}"><span class="crate-ico">${ingIconHtml(id, 26)}</span>
          <div style="flex:1"><b>${esc(INGREDIENTS[id].name)}</b><small>you hold ${have}</small></div>
          <button class="btn small ${can ? '' : 'ghost'}" data-compost="${id}" ${can ? '' : 'disabled'}>Compost 1</button></div>`;
      }).join('')}
      <div class="sect-h">${esc(INGREDIENTS[RARE_INGREDIENT].name)}</div>
      <div class="crate-row lack"><span class="crate-ico">${ingIconHtml(RARE_INGREDIENT, 26)}</span>
        <div style="flex:1"><b>Cannot be composted</b><small>Spores come off rare finds and world bosses only, so the Necromancer's Feast stays something you earn out there.</small></div></div>`;
    $$('[data-compost]', body).forEach(btn => btn.addEventListener('click', async () => {
      const res = await compostIngredient(btn.dataset.compost);
      if (!res.ok) {
        toast(res.reason === 'cap' ? `The heap is full for today. ${res.cap} a day.` : 'You do not have one of those.', 2800);
        render(); return;
      }
      popSound(S.sounds);
      if (res.seeds > 1) confettiBurst(innerWidth / 2, innerHeight * 0.4, res.seeds === 3 ? 22 : 14);
      toast(`${res.seeds} ${seedName(res.id)} seed${res.seeds === 1 ? '' : 's'}${res.seeds === 3 ? '. That is the good roll.' : '.'}`, 3000);
      render();
    }));
  }
  render();
}

// The payoff moment. A crop you cared for reads differently from one you forgot.
function showHarvest(res) {
  const kick = res.bumper ? 'BUMPER CROP' : res.watered ? 'FINE HARVEST' : 'HARVEST';
  const sub = res.rare
    ? (res.watered ? 'Watered on time' : 'Grown without watering')
    : res.bumper ? `Watered and then some: ${HARVEST_BASE} base, +${res.n - HARVEST_BASE} on the day`
    : res.watered ? `${HARVEST_BASE} base, +1 for the care` : `${HARVEST_BASE} base · water it next time for more`;
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Harvest</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <div class="hv-wrap">
        <div class="hv-card${res.bumper ? ' bumper' : ''}">
          <div class="hv-kick">${kick}</div>
          <div class="hv-ico">${bhIcon('garden-sprout', 96, res.rare ? '#9fe3cf' : undefined)}</div>
          <div class="hv-name">${esc(res.name)} ×${res.n}</div>
          <div class="hv-sub">${esc(sub)}</div>
        </div>
        <p class="note" style="margin:14px 18px 12px">That bed is empty again. Plant another seed, or leave it fallow.</p>
        <button class="btn sheet-close" style="width:100%">Back to the garden</button>
      </div>
    </div>`, { cls: '' });
  $$('.sheet-close', wrap).forEach(b => b.addEventListener('click', () => history.back()));
}

async function openKitchen() {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Kitchen</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <!-- the scene sits BESIDE the render target: render() replaces
           #kitchenBody on every tick and would otherwise wipe it, and
           restart every animation each time the pot state changed. -->
      <div class="marquee">
    <svg class="garland" width="100%" height="26" viewBox="0 0 375 26" preserveAspectRatio="none">
      <path d="M-4 2 Q 60 22 130 12 Q 200 2 260 14 Q 320 24 380 6" fill="none" stroke="#2A2D28" stroke-width="2.5"/>
      <g fill="#F0EDD6" stroke="#2A2D28" stroke-width="1.4">
        <rect x="52" y="12" width="5" height="12" rx="2.5" transform="rotate(8 54 18)"/>
        <rect x="126" y="10" width="5" height="12" rx="2.5" transform="rotate(-6 128 16)"/>
        <rect x="196" y="6" width="5" height="12" rx="2.5" transform="rotate(5 198 12)"/>
        <rect x="268" y="12" width="5" height="12" rx="2.5" transform="rotate(-9 270 18)"/>
      </g>
    </svg>
    <h2>THE HAUNTED KITCHEN</h2>
    <p>SOMETHING IS ALWAYS SIMMERING.</p>
    <div class="scene">
      <svg width="190" height="108" viewBox="0 0 190 108">
        <!-- steam wisps -->
        <path class="wisp" style="--wo:.28" d="M78 44 C 72 32, 84 28, 80 16" fill="none" stroke="#F0EDD6" stroke-width="3.4" stroke-linecap="round"/>
        <path class="wisp w2" style="--wo:.38" d="M98 40 C 104 28, 92 24, 98 10" fill="none" stroke="#F0EDD6" stroke-width="3.4" stroke-linecap="round"/>
        <path class="wisp w3" style="--wo:.24" d="M116 46 C 112 36, 122 32, 118 22" fill="none" stroke="#F0EDD6" stroke-width="3" stroke-linecap="round"/>
        <!-- fire glow + logs -->
        <ellipse cx="95" cy="102" rx="52" ry="9" fill="#0a0e0a"/>
        <path d="M70 99 l16 -8 M86 99 l-16 -8 M104 99 l16 -8 M120 99 l-16 -8" stroke="#5a4632" stroke-width="4.5" stroke-linecap="round"/>
        <g class="flame"><path d="M88 96 c-2 -7 3 -9 4 -14 c4 5 8 6 7 12 c-1 4 -3 6 -5 6 c-3 0 -5 -1 -6 -4z" fill="#E2AB36" stroke="#2A2D28" stroke-width="1.6"/>
        <path d="M92 95 c-1 -3 1.5 -4 2 -7 c2 2.5 4 3 3.5 6 c-.4 2 -1.6 3 -2.7 3 c-1.4 0 -2.4 -.7 -2.8 -2z" fill="#FCF35E"/></g>
        <!-- cauldron -->
        <path d="M48 56 h94 c2 26 -14 44 -47 44 s-49 -18 -47 -44z" fill="#3a3f3a" stroke="#2A2D28" stroke-width="3"/>
        <ellipse cx="95" cy="56" rx="47" ry="12" fill="#A2E0A6" stroke="#2A2D28" stroke-width="3"/>
        <ellipse cx="80" cy="54" rx="6" ry="3.4" fill="#c9f0cb"/><circle class="bub b4" cx="88" cy="57" r="2.6" fill="#c9f0cb"/>
        <circle cx="112" cy="58" r="3.4" fill="#c9f0cb"/>
        <circle class="bub" cx="66" cy="50" r="3" fill="#A2E0A6" stroke="#2A2D28" stroke-width="1.6"/>
        <circle class="bub b2" cx="124" cy="46" r="4" fill="#A2E0A6" stroke="#2A2D28" stroke-width="1.6"/>
        <circle class="bub b3" cx="103" cy="42" r="2.6" fill="#A2E0A6" stroke="#2A2D28" stroke-width="1.4"/>
        <!-- a bone stirring out of the pot -->
        <g class="stir"><rect x="125" y="14" width="6" height="34" rx="3" fill="#F0EDD6" stroke="#2A2D28" stroke-width="1.8"/>
        <circle cx="125" cy="14" r="4.4" fill="#F0EDD6" stroke="#2A2D28" stroke-width="1.8"/>
        <circle cx="132" cy="12" r="4.4" fill="#F0EDD6" stroke="#2A2D28" stroke-width="1.8"/></g>
      </svg>
      <i class="spore" style="left:14%; bottom:64px; width:5px; height:5px; --dur:7s; --dx:6px; --so:.55"></i>
      <i class="spore g" style="left:22%; bottom:34px; width:4px; height:4px; --dur:5.5s; --del:-2s; --dx:-5px; --so:.45"></i>
      <i class="spore" style="left:79%; bottom:70px; width:6px; height:6px; --dur:6.5s; --del:-3.5s; --dx:-7px; --so:.55"></i>
      <i class="spore g" style="left:86%; bottom:40px; width:4px; height:4px; --dur:5s; --del:-1.2s; --dx:5px; --so:.45"></i>
      <i class="spore" style="left:70%; bottom:22px; width:3px; height:3px; --dur:4.5s; --del:-2.8s; --dx:4px; --so:.4"></i>
      <i class="spore" style="left:30%; bottom:84px; width:3px; height:3px; --dur:6s; --del:-4.4s; --dx:-4px; --so:.4"></i>
    </div>
  </div>
      <div id="kitchenBody"></div>
    </div>`, { cls: '', onClose: () => refresh() });
  const body = $('#kitchenBody', wrap);

  async function render() {
    if (!body.isConnected) return;
    const [inv, cook, buffs, potInv, coinBal, tmute, pantry, garden, compost] = await Promise.all([ingredients(), cookState(), activeFoodBuffs(), potionsInv(), coins(), transmuteStatus(), pantryDishes(), gardenState(), compostStatus()]);
    const canStartAny = cook.freeCount > 0;
    const recipeCard = r => {
      const have = canCook(r, inv);
      const needStr = Object.entries(r.needs).map(([id, n]) => `${ingIconHtml(id, 13)}${(inv[id] || 0)}/${n}`).join('  ');
      const canStart = have && canStartAny;
      return `<div class="crate-row recipe ${have ? '' : 'lack'}"><span class="crate-ico">${recipeIconHtml(r, 26)}</span>
        <div style="flex:1"><b>${esc(r.name)}</b><small>${esc(r.desc)}</small><small class="recipe-need">${needStr} · ${r.cookMin < 60 ? r.cookMin + 'm' : (r.cookMin / 60) + 'h'} cook</small></div>
        <button class="btn small ${canStart ? '' : 'ghost'}" data-cook="${r.id}" ${canStart ? '' : 'disabled'}>${r.potion ? 'Brew' : 'Cook'}</button></div>`;
    };
    // one card per owned pot: idle / cooking (progress) / ready (serve)
    const potCard = s => {
      if (s.empty) return `<div class="pot-card idle"><span class="pot-ico">🍲</span><small>Empty pot<br>pick a recipe below</small></div>`;
      const pct = s.ready ? 100 : Math.max(0, Math.min(100, Math.round((1 - s.remainingMs / Math.max(1, s.readyAt - s.startedAt)) * 100)));
      return `<div class="pot-card ${s.ready ? 'ready' : 'cooking'}">
        <span class="pot-ico">${recipeIconHtml(s.recipe, 26)}</span>
        <b>${esc(s.recipe.name)}</b>
        ${s.ready ? `<button class="btn small pot-serve" data-serve="${s.index}">Serve</button>`
          : `<div class="cook-bar"><i style="width:${pct}%"></i></div><small>${fmtCookTime(s.remainingMs)} left</small>`}
      </div>`;
    };
    const seedTotal = SEED_IDS.reduce((a, id) => a + (garden.seeds[id] || 0), 0);
    const buyPrice = nextPotPrice(cook.potsOwned);
    body.innerHTML = `
      <div class="sect-h">Cauldrons${cook.potsOwned > 1 ? ` · ${cook.potsOwned} pots` : ''}</div>
      <div class="pot-row">
        ${cook.slots.map(potCard).join('')}
        ${buyPrice != null ? `<button class="pot-card buy" id="buyPot"><span class="pot-ico">➕</span><b>Extra pot</b><small>${buyPrice.toLocaleString()} ${ICONS.coin(12)}</small></button>` : ''}
      </div>
      ${gardenRowHtml(garden, seedTotal)}
      ${buffs.length ? `<div class="sect-h">Active dishes</div>
        ${buffs.map(b => `<div class="crate-row"><span class="crate-ico">${b.icon}</span><div style="flex:1"><b>${esc(b.name)}</b><small>${esc(foodBuffLabel(b))}</small></div></div>`).join('')}` : ''}
      <div class="sect-h">Pantry${pantry.length ? ` · ${pantry.length} stocked` : ''}</div>
      ${pantry.length
        ? pantry.map((p, i) => { const r = RECIPE_BY_ID[p.recipeId]; return `<div class="crate-row"><span class="crate-ico">${r ? recipeIconHtml(r, 26) : (p.icon || '🍲')}</span>
            <div style="flex:1"><b>${esc(p.name)}</b><small>${r && r.buff ? esc(foodBuffLabel({ ...r.buff, ...(r.buff.kind === 'combat' ? { fightsLeft: r.buff.fights } : {}) })) : 'Ready to eat'}</small></div>
            <button class="btn small" data-eat="${i}">Eat</button><button class="btn small ghost" data-toss="${i}" title="Discard" style="margin-left:6px">${ICONS.close(13)}</button></div>`; }).join('')
        : '<p class="note" style="margin:2px 2px 6px">Empty. Cook a dish and it waits here until you choose to eat it, so you can save buffs for the fight or day you want them.</p>'}
      ${potionCount(potInv) ? `<div class="sect-h">Potion satchel · drink these mid-fight</div>
        <div class="ingredient-grid">${POTIONS.filter(p => potInv[p.id] > 0).map(p => `<div class="ing-cell"><span class="ing-ico">${p.icon}</span><span class="ing-n">${potInv[p.id]}</span><span class="ing-name">${esc(p.name)}</span></div>`).join('')}</div>` : ''}
      <div class="sect-h">Transmute · once a day</div>
      <div class="crate-row transmute ${tmute.ready && tmute.canAfford ? '' : 'lack'}">
        <span class="crate-ico">${ingIconHtml(TRANSMUTE.yields, 26)}</span>
        <div style="flex:1"><b>Transmute Ectoplasm</b><small>Merge ${TRANSMUTE.commons} common ingredients into 1 rare ${esc(INGREDIENTS[TRANSMUTE.yields].name)} (gates the Necromancer's Feast). You have ${tmute.commonsHave}.</small></div>
        <button class="btn small ${tmute.ready && tmute.canAfford ? '' : 'ghost'}" id="transmuteBtn" ${tmute.ready && tmute.canAfford ? '' : 'disabled'}>${!tmute.ready ? `${fmtCookTime(tmute.msLeft)}` : !tmute.canAfford ? `Need ${TRANSMUTE.commons}` : 'Transmute'}</button>
      </div>
      <div class="sect-h" style="display:flex;justify-content:space-between;align-items:center">Ingredients <button class="btn small ghost" id="forageBtn">Forage · 45${ICONS.coin(13)}</button></div>
      <div class="ingredient-grid">
        ${INGREDIENT_IDS.map(id => `<div class="ing-cell ${(inv[id] || 0) > 0 ? '' : 'empty'}"><span class="ing-ico">${ingIconHtml(id,26)}</span><span class="ing-n">${inv[id] || 0}</span><span class="ing-name">${esc(INGREDIENTS[id].name)}</span></div>`).join('')}
      </div>
      <div class="sect-h">Dishes · cook, then eat from your Pantry when you want the buff</div>
      ${RECIPES.map(recipeCard).join('')}
      <div class="sect-h">Potions · drink one mid-fight, any class</div>
      ${POTIONS.map(recipeCard).join('')}`;
    $('#gardenRow', body)?.addEventListener('click', () => openGardenSheet(render));
    $$('[data-serve]', body).forEach(btn => btn.addEventListener('click', async () => {
      const dish = await collectDish(Number(btn.dataset.serve));
      if (dish) {
        await award(`cook-${Date.now().toString(36)}`, 'cook', 8, `Cooked ${dish.name}`); // small XP + powers cooking quests
        confettiBurst(innerWidth / 2, innerHeight * 0.35, 20); levelSound(S.sounds);
        toast(dish.potion ? `${dish.icon} ${dish.name} brewed! Drink it mid-fight.` : `${dish.icon} ${dish.name} is in your Pantry. Eat it when you want the buff.`, 3400);
      }
      render();
    }));
    $$('[data-eat]', body).forEach(btn => btn.addEventListener('click', async () => {
      const dish = await activatePantryDish(Number(btn.dataset.eat));
      if (dish) { popSound(S.sounds); toast(`${dish.icon} ${dish.name} eaten. Buff active${dish.buff && dish.buff.kind === 'combat' ? ' for your next fights' : ''}.`, 3000); }
      render();
    }));
    $$('[data-toss]', body).forEach(btn => btn.addEventListener('click', async () => {
      if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Toss it?'; setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = '0'; btn.innerHTML = ICONS.close(13); } }, 2400); return; }
      await discardPantryDish(Number(btn.dataset.toss));
      render();
    }));
    // THE CAULDRON. A player bought one of these by accident on a single tap, which
    // is what made one-tap-spending a rule rather than a preference.
    {
      const price = nextPotPrice(cook.potsOwned);
      armToConfirm($('#buyPot', body), price != null ? `Spend ${price.toLocaleString()}?` : 'Spend?', async () => {
        if (price == null) return;
        if ((await coins()) < price) { toast(`Need ${price.toLocaleString()} coins for another pot.`, 2800); return; }
        await coinsAdd(-price);
        await addPot();
        popSound(S.sounds);
        toast(`New cauldron bought! You can now cook ${cook.potsOwned + 1} dishes at once.`, 3200);
        render();
      });
    }
    $('#transmuteBtn', body)?.addEventListener('click', async () => {
      const res = await doTransmute();
      if (!res.ok) { toast(res.reason === 'cooldown' ? `Transmute recharges in ${fmtCookTime(res.msLeft)}.` : `Need ${res.need} common ingredients (you have ${res.have}).`, 3000); return; }
      trackEvent('transmute');
      confettiBurst(innerWidth / 2, innerHeight * 0.4, 18); levelSound(S.sounds);
      toast(`${INGREDIENTS[res.yields].icon} Transmuted a rare ${INGREDIENTS[res.yields].name}!`, 3000);
      render();
    });
    armToConfirm($('#forageBtn', body), 'Spend 45?', async () => {
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
      if (res.ok) { trackEvent('cook', { r: btn.dataset.cook }); popSound(S.sounds); toast('Into the pot. Check back when it’s ready.', 2600); }
      else if (res.reason === 'busy') toast('Every pot is full. Serve one, or buy another pot.', 3000);
      else toast('Not enough ingredients for that dish.');
      render();
    }));
  }
  await render();
  // live countdown while the sheet is open
  // These screens re-render every second to tick their timers, which REPLACES the
  // markup and therefore throws away any half-made decision. That gave a player
  // under a second to confirm a purchase before the button reset itself. Hold the
  // tick while something is armed: a countdown being one second stale matters far
  // less than a confirm that vanishes under your thumb.
  const timer = setInterval(() => {
    if (!body.isConnected) { clearInterval(timer); return; }
    if (body.querySelector('.arming')) return;
    render();
  }, 1000);
}


// how the day's calorie target splits across meals (a per-meal cap you can see)
const MEAL_SPLIT = [0.25, 0.35, 0.30, 0.10]; // breakfast / lunch / dinner / snacks

/* What he says about an empty meal.
 *
 * The critique found the emptiest state on the primary screen was also the only
 * one with no voice: an empty Dinner was a header and a dashed button. Every
 * other empty state in this app says something.
 *
 * House rules, same as the home-screen speech: never imply the player SHOULD be
 * eating (or shouldn't), never nag, never treat an unlogged meal as a failure.
 * These are observations from a skeleton with no stomach, not reminders. */
const EMPTY_MEAL_LINES = {
  Breakfast: [
    'Nothing yet. The day is young and so are you, relatively.',
    'Empty. I have gone about nine hundred mornings without one.',
    'Blank. No notes, no opinions.',
  ],
  Lunch: [
    'Nothing logged. Midday is a suggestion anyway.',
    'Empty so far. I am not keeping score, I am keeping a list.',
    'Blank. Whenever you get to it.',
  ],
  Dinner: [
    'Dinner is a blank page. I have no notes.',
    'Nothing here yet. The evening is still deciding.',
    'Empty. Some days end quietly.',
  ],
  Snacks: [
    'No snacks logged. Suspicious, but I believe you.',
    'Empty. A rare and noble sight.',
    'Nothing here. Or nothing that got written down.',
  ],
};
function emptyMealLine(name) {
  const pool = EMPTY_MEAL_LINES[name];
  if (!pool) return '';
  if (S.speechSalt == null) S.speechSalt = Math.floor(Math.random() * 1e6);
  return pool[(S.speechSalt + name.length) % pool.length];
}

/* The last thing on the page.
 *
 * Peak-end says the close carries disproportionate weight, and Today used to end
 * on "Fiber 21 g · Sugar 44 g · Sodium 262 mg" in the faintest text on the screen.
 * A logging screen should not end on a lab result. He signs off instead.
 *
 * Never a verdict on the food. The only thing being acknowledged is that the
 * player showed up and wrote it down. */
function signOffLine(count, tot, targets) {
  if (S.speechSalt == null) S.speechSalt = Math.floor(Math.random() * 1e6);
  const pick = arr => arr[(S.speechSalt + arr.length) % arr.length];
  if (!count) return pick([
    'Nothing written down yet. I will be here.',
    'A blank day. It stays blank until you say otherwise.',
    'No entries. No hurry.',
  ]);
  const protHit = targets && targets.p && tot.p >= targets.p;
  if (protHit) return pick([
    `${count} logged and the protein landed. The bones thank you personally.`,
    `${count} entries, protein target met. Structurally, an excellent day.`,
  ]);
  return pick([
    `${count} things written down today. That is the whole job.`,
    `${count} logged. The ledger is honest, which is all I ask.`,
    `${count} entries. Nothing else required of you.`,
    `That is ${count} in the book. See you tomorrow.`,
  ]);
}

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
    ${!entries.length ? `<p class="meal-empty">${esc(emptyMealLine(name))}</p>` : ''}
    ${!entries.length && yEntries.length ? `<button class="chip-btn" data-copymeal="${i}">↺ Copy yesterday's ${name} (${Math.round(dayTotals(yEntries).kcal)} kcal)</button>` : ''}
  </section>`;
}

/* ================= add flow ================= */

function openAdd(meal = 0) {
  const wrap = openSheet(`
    <div class="sheet-head">
      <div class="hd"><h2>Add food</h2></div>
      <div class="t1-tools"><button class="sheet-close t1-icon-btn" aria-label="Done">${ICONS.close(17)}</button></div>
    </div>
    <div class="t1-budget" id="addBudget" hidden></div>
    <div class="sheet-body">
      <div class="t1-seg" id="mealChips">
        ${MEALS.map((m, i) => `<button class="${i === meal ? 'on' : ''}" data-meal="${i}">${m}</button>`).join('')}
      </div>
      <div class="t1-routes" style="margin:12px 0 4px">
        <button class="t1-route" id="actScan">${ICONS.barcodeIco()}<b>Barcode</b><span class="xp">+15 XP</span></button>
        <button class="t1-route" id="actLabel">${ICONS.labelIco()}<b>Label</b><span class="xp">+20 XP</span></button>
        <button class="t1-route" id="actQuick">${ICONS.boltStroke()}<b>Quick</b></button>
        <button class="t1-route" id="actMyFoods">${ICONS.bone(19)}<b>My foods</b></button>
      </div>
      <div style="height:12px"></div>
      <div class="t1-search">${ICONS.searchIco()}<input id="q" type="search" placeholder="Search ${GENERIC_FOODS.length}+ foods" autocomplete="off" enterkeyhint="search"></div>
      <div id="results"></div>
    </div>`, { cls: 'full t1' });

  // the number you are deciding against. Async so the sheet opens instantly.
  dayBudget().then(b => {
    const el = $('#addBudget', wrap);
    if (!el || !el.isConnected) return;
    const pct = b.target > 0 ? Math.max(0, Math.min(100, (b.used / b.target) * 100)) : 0;
    el.innerHTML = `
      <div class="n${b.left < 0 ? ' over' : ''}">${Math.abs(Math.round(b.left)).toLocaleString()}<small>${b.left < 0 ? 'OVER' : 'LEFT'}</small></div>
      <div class="tr"><i style="width:${pct}%"></i></div>
      ${b.pTarget ? `<div class="p">${Math.round(b.p)} / ${Math.round(b.pTarget)} P</div>` : ''}`;
    el.hidden = false;
  });

  $('#actMyFoods', wrap)?.addEventListener('click', () => { closeAllSheetsViaHistory(); setTimeout(() => { location.hash = '#/foods'; }, 200); });

  let curMeal = meal;
  $$('#mealChips button', wrap).forEach(c => c.addEventListener('click', () => {
    curMeal = Number(c.dataset.meal);
    $$('#mealChips button', wrap).forEach(x => x.classList.toggle('on', x === c));
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
      html += t1Sect('Log it again') + recents.map(r => {
        if (r.food) return foodRowHtml(r.food);
        return `<button class="t1-frow" data-relog="${r.entry.id}">
          <span class="t1-med"><b>${Math.round(r.entry.kcal)}</b><small>KCAL</small></span>
          <span class="nm"><b>${esc(r.entry.name)}</b><small>${esc(r.entry.portionLabel || 'quick add')}</small></span>
          ${r.entry.p ? `<span class="pg"><b>${fmtG(r.entry.p)}g</b><small>PROTEIN</small></span>` : ''}</button>`;
      }).join('');
    }
    if (favs.length) html += t1Sect('Favorites') + favs.map(foodRowHtml).join('');
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
    if (holder) holder.innerHTML = t1Sect('Online results', '<span class="spin"></span>');
    try {
      let foods = S.onlineCache.get(q.toLowerCase());
      if (!foods) {
        foods = await searchOnline(q, S.settings.fdcKey || 'DEMO_KEY');
        S.onlineCache.set(q.toLowerCase(), foods);
      }
      if (input.value.trim() !== q) return;
      const sect = $('#onlineSect', results);
      if (!sect) return;
      sect.innerHTML = t1Sect('Online results') +
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
        `<div id="onlineSect">${q.length >= 3 ? `<button class="t1-frow" data-online><span class="t1-med">${ICONS.searchIco(19)}</span><span class="nm"><b style="color:var(--accent)">Search online for "${esc(q)}"</b><small>USDA + Open Food Facts</small></span></button>` : ''}</div>`;
      bindRows();
    }, 120);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runOnlineSearch(input.value.trim()); } });

  showDefault();
}

const t1Sect = (label, extra = '') => `<div class="t1-sect"><b>${label}</b><i></i>${extra}</div>`;

function foodRowHtml(f) {
  const n = foodDefaultNutr(f);
  const kcal = n ? Math.round(n.kcal) : null;
  return `<button class="t1-frow" data-food="${esc(f.id)}">
    <span class="t1-med"><b>${kcal != null ? kcal : '·'}</b><small>KCAL</small></span>
    <span class="nm"><b>${esc(f.name)}</b><small>${esc(foodSubtitle(f))}</small></span>
    ${n && n.p ? `<span class="pg"><b>${fmtG(n.p)}g</b><small>PROTEIN</small></span>` : ''}
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
      <div class="hd">
        <h2 style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(food.name)}</h2>
        <div class="sub">${esc(food.brand || '')}${food.brand ? ' · ' : ''}<span class="t1-tag">${srcLabel}</span></div>
      </div>
      <div class="t1-tools">
        <button id="favBtn" class="t1-icon-btn${food.favorite ? ' gold' : ''}" aria-label="Favorite">${ICONS.star(!!food.favorite)}</button>
        <button class="sheet-close t1-icon-btn" aria-label="Cancel">${ICONS.close(17)}</button>
      </div>
    </div>
    <div class="sheet-body">
      <div class="t1-hero">
        <div class="k"><b id="pvKcal">0</b><small>KCAL</small><span class="of" id="pvServ"></span></div>
        <div class="t1-macros">
          <div class="mp"><small>PROTEIN</small><b id="pvP">0g</b><div class="tr"><i id="pvPBar"></i></div></div>
          <div class="mc"><small>CARBS</small><b id="pvC">0g</b><div class="tr"><i id="pvCBar"></i></div></div>
          <div class="mf"><small>FAT</small><b id="pvF">0g</b><div class="tr"><i id="pvFBar"></i></div></div>
        </div>
      </div>
      <div class="t1-seg scroll" id="servChips">
        ${(food.servings || []).map((s, i) => `<button data-serv="${i}">${esc(s.label)}</button>`).join('')}
        ${food.per100 ? '<button data-grams>grams</button>' : ''}
      </div>
      <div style="height:12px"></div>
      <div id="qtyArea"></div>
      <div style="height:14px"></div>
      <div class="t1-seg" id="pMealChips">
        ${MEALS.map((m, i) => `<button class="${i === curMeal ? 'on' : ''}" data-meal="${i}">${m}</button>`).join('')}
      </div>
      <div class="t1-payoff" id="payoff" hidden></div>
      <div style="height:16px"></div>
      ${editing ? '<button class="btn danger" id="delBtn">Delete entry</button>' : ''}
      ${food.source === 'custom' ? '<div style="height:8px"></div><button class="btn ghost" id="editFoodBtn">Edit food details</button>' : ''}
    </div>
    <div class="t1-foot"><button class="btn" id="addBtn">${editing ? 'Save changes' : 'Add'}</button></div>`, { cls: 't1' });

  /* THE PAYOFF. Every row is an award onFoodLogged already pays; none of it was
     visible before the tap, which is why the XP economy read as invisible.
     Editing an existing entry pays nothing new, so the block stays hidden. */
  let budget = null;
  if (!editing) dayBudget().then(b => { budget = b; preview(); });
  function renderPayoff(n) {
    const box = $('#payoff', wrap);
    if (!box || editing || !budget || !n) return;
    const rows = [];
    rows.push(['+10', 'Logged a food', '']);
    if (budget.firstOfDay) rows.push(['+15', 'First log of the day', '']);
    if (via === 'scan') rows.push(['+15', 'Barcode scan', '']);
    if (via === 'label') rows.push(['+20', 'Label scan', '']);
    if (budget.pTarget && !budget.proteinHit && budget.p + (n.p || 0) >= budget.pTarget) {
      rows.push(['+40', 'Hits your protein target for today', 'hit']);
    }
    const meals = new Set([...budget.meals, curMeal]);
    if (!budget.meals.has(curMeal) && [0, 1, 2].every(m => meals.has(m))) {
      rows.push(['+20', 'All meals logged today', 'hit']);
    }
    const left = budget.left - n.kcal;
    box.innerHTML = `<h3>What this does</h3>` + rows.map(([xp, t, cls]) =>
      `<div class="t1-pr${cls ? ' ' + cls : ''}"><span class="xp">${xp}</span><span class="t">${t}</span></div>`).join('') +
      `<div class="t1-pr rest"><span class="xp">&nbsp;</span><span class="t">Left after this</span>
        <span class="left${left < 0 ? ' over' : ''}">${Math.abs(Math.round(left)).toLocaleString()} kcal${left < 0 ? ' over' : ''}</span></div>`;
    box.hidden = false;
  }

  const qtyArea = $('#qtyArea', wrap);

  function renderQty() {
    if (sel.mode === 'grams') {
      qtyArea.innerHTML = `
        <div class="t1-step">
          <button data-d="-10" aria-label="less"></button>
          <div class="val"><input id="gramsIn" type="text" inputmode="decimal" value="${fmtQty(sel.grams)}" aria-label="grams"><small>GRAMS</small></div>
          <button class="plus" data-d="10" aria-label="more"></button>
        </div>`;
      $('#gramsIn', wrap).addEventListener('input', e => { sel.grams = num(e.target.value) || 0; preview(); });
      $$('.t1-step button', qtyArea).forEach(b => b.addEventListener('click', () => {
        sel.grams = Math.max(1, (sel.grams || 0) + Number(b.dataset.d));
        $('#gramsIn', wrap).value = fmtQty(sel.grams);
        preview();
      }));
    } else {
      qtyArea.innerHTML = `
        <div class="t1-step">
          <button data-d="-0.25" aria-label="fewer"></button>
          <div class="val"><input id="qtyIn" type="text" inputmode="decimal" value="${fmtQty(sel.qty)}" aria-label="servings"><small>SERVINGS</small></div>
          <button class="plus" data-d="0.25" aria-label="more"></button>
        </div>
        <div class="note" style="text-align:center;margin-top:8px">Tap the number to type any amount, e.g. 1.33</div>`;
      const qin = $('#qtyIn', wrap);
      qin.addEventListener('input', e => { sel.qty = Math.max(0, num(e.target.value) || 0); preview(); });
      qin.addEventListener('focus', () => qin.select());
      qin.addEventListener('blur', () => { if (!(sel.qty > 0)) { sel.qty = 0.25; } qin.value = fmtQty(sel.qty); });
      $$('.t1-step button', qtyArea).forEach(b => b.addEventListener('click', () => {
        sel.qty = Math.max(0.25, Math.round(((sel.qty || 1) + Number(b.dataset.d)) * 100) / 100);
        qin.value = fmtQty(sel.qty);
        preview();
      }));
    }
    markChips();
  }

  function markChips() {
    $$('#servChips button', wrap).forEach(c => {
      const on = c.hasAttribute('data-grams') ? sel.mode === 'grams' : (sel.mode === 'serving' && Number(c.dataset.serv) === sel.idx);
      c.classList.toggle('on', on);
    });
  }

  function preview() {
    const n = nutrientsFor(food, sel) || { kcal: 0, p: 0, c: 0, f: 0 };
    $('#pvKcal', wrap).textContent = Math.round(n.kcal).toLocaleString();
    $('#pvP', wrap).textContent = fmtG(n.p) + 'g';
    $('#pvC', wrap).textContent = fmtG(n.c) + 'g';
    $('#pvF', wrap).textContent = fmtG(n.f) + 'g';
    $('#pvServ', wrap).textContent = portionLabel(food, sel) || '';
    /* The bars show THIS food's own macro split, not its share of the day. A
       single apple against a daily protein target is 1% and every bar reads as
       broken; its share of its own calories is always meaningful. */
    const kp = (n.p || 0) * 4, kc = (n.c || 0) * 4, kf = (n.f || 0) * 9;
    const sum = kp + kc + kf;
    const bar = (id, part) => {
      const el = $(id, wrap);
      if (el) el.style.width = sum > 0 ? Math.round((part / sum) * 100) + '%' : '0%';
    };
    bar('#pvPBar', kp); bar('#pvCBar', kc); bar('#pvFBar', kf);
    renderPayoff(n);
  }

  $$('#servChips button', wrap).forEach(c => c.addEventListener('click', () => {
    if (c.hasAttribute('data-grams')) {
      const cur = nutrientsFor(food, sel);
      sel.mode = 'grams';
      sel.grams = sel.grams || (cur && food.per100 ? Math.round((cur.kcal / food.per100.kcal) * 100) : 100);
    } else {
      sel.mode = 'serving'; sel.idx = Number(c.dataset.serv); sel.qty = sel.qty && sel.mode === 'serving' ? sel.qty : 1;
    }
    renderQty(); preview();
  }));

  $$('#pMealChips button', wrap).forEach(c => c.addEventListener('click', () => {
    curMeal = Number(c.dataset.meal);
    $$('#pMealChips button', wrap).forEach(x => x.classList.toggle('on', x === c));
    preview(); // the all-meals bonus depends on which meal this lands in
  }));

  $('#favBtn', wrap).addEventListener('click', async () => {
    food.favorite = !food.favorite;
    $('#favBtn', wrap).innerHTML = ICONS.star(!!food.favorite);
    $('#favBtn', wrap).classList.toggle('gold', !!food.favorite);
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
    if (!editing) trackEvent('food_log', { via: via || 'search' });
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
  if (food.source === 'generic') kvGet('fav-' + food.id).then(v => {
    if (v == null) return;
    food.favorite = v;
    const fb = $('#favBtn', wrap);
    if (!fb) return;
    fb.innerHTML = ICONS.star(!!v);
    fb.classList.toggle('gold', !!v);
  });

  renderQty();
  preview();
}

/* Phase 4: window.prompt in a hand-illustrated game read like a fire alarm in a
   theatre. One small sheet replaces both fit-naming prompts; Enter submits. */
function openTextSheet({ title, value = '', placeholder = '', cta = 'Save' }, onSave) {
  const wrap = openSheet(`
    <div class="sheet-head">
      <div class="hd"><h2>${esc(title)}</h2></div>
      <div class="t1-tools"><button class="sheet-close t1-icon-btn" aria-label="Cancel">${ICONS.close(17)}</button></div>
    </div>
    <div class="sheet-body">
      <div class="t1-field"><input id="txIn" type="text" maxlength="40" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></div>
    </div>
    <div class="t1-foot"><button class="btn" id="txGo">${esc(cta)}</button></div>`, { cls: 't1', name: title });
  const input = $('#txIn', wrap);
  setTimeout(() => { input.focus(); input.select(); }, 120);
  const go = () => { const v = input.value.trim(); history.back(); setTimeout(() => onSave(v), 180); };
  $('#txGo', wrap).addEventListener('click', go);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  return wrap;
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
    <div class="sheet-head">
      <div class="hd"><h2>${entry ? 'Edit quick add' : 'Quick add'}</h2></div>
      <div class="t1-tools"><button class="sheet-close t1-icon-btn" aria-label="Cancel">${ICONS.close(17)}</button></div>
    </div>
    <div class="sheet-body">
      <div class="t1-field hot"><label>Calories</label><input id="qaKcal" type="text" inputmode="numeric" placeholder="0" value="${entry ? Math.round(entry.kcal) : ''}"></div>
      <div class="t1-field"><label>What was it</label><input id="qaName" placeholder="Dinner out (optional)" value="${esc(entry?.name === 'Quick add' ? '' : entry?.name || '')}"></div>
      ${t1Sect('Macros, if you know them')}
      <div class="t1-g3">
        <div class="t1-field"><label>Protein<span class="u">g</span></label><input id="qaP" type="text" inputmode="decimal" placeholder="·" value="${entry?.p ? fmtG(entry.p) : ''}"></div>
        <div class="t1-field"><label>Carbs<span class="u">g</span></label><input id="qaC" type="text" inputmode="decimal" placeholder="·" value="${entry?.c ? fmtG(entry.c) : ''}"></div>
        <div class="t1-field"><label>Fat<span class="u">g</span></label><input id="qaF" type="text" inputmode="decimal" placeholder="·" value="${entry?.f ? fmtG(entry.f) : ''}"></div>
      </div>
      ${entry ? '' : '<p class="note" style="margin-top:2px">Worth +10 XP, same as any other log.</p>'}
      ${entry ? '<div style="height:12px"></div><button class="btn danger" id="qaDel">Delete entry</button>' : ''}
    </div>
    <div class="t1-foot"><button class="btn" id="qaAdd">${entry ? 'Save' : 'Add'}</button></div>`, { cls: 't1' });
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
      <div class="scan-head"><b>SCAN A BARCODE</b><span>+15 XP</span></div>
      <div class="reticle t1"><i></i><i></i><i></i><i></i></div>
      <div class="scan-status" id="scanStatus"></div>
      <div class="scan-hint"><span>${ICONS.crosshair(15)}Fill the brackets, hold about 20 cm away</span></div>
      <div class="scan-tools">
        <button class="icon-btn sheet-close" aria-label="Close">${ICONS.close(18)}</button>
        <button class="icon-btn" id="torchBtn" hidden aria-label="Flashlight">${ICONS.torchIco(18)}</button>
      </div>
    </div>
    <div class="scan-foot">
      <div class="row">
        <div class="t1-search">${ICONS.barcodeIco(17)}<input id="manualCode" type="text" inputmode="numeric" placeholder="Type the digits instead" autocomplete="off"></div>
        <button class="btn small" id="manualGo">Look up</button>
      </div>
      <button class="scan-alt" id="scanToLabel">No barcode on it? <b>Scan the label</b></button>
    </div>`, { cls: 'scanner t1', onClose: () => scanner && scanner.stop() });

  const video = $('video', wrap);
  const status = $('#scanStatus', wrap);
  let scanner = null;

  const { createScanner } = await import('./scanner.js');
  scanner = createScanner(video, {
    onCode: code => { audioTick(); handleBarcode(code, getMeal); },
    onState: (st) => {
      // the status and the aiming hint share one slot, so only one can speak
      const say = (msg, sub = '') => {
        status.innerHTML = `<span class="plate">${msg}${sub ? `<small>${sub}</small>` : ''}</span>`;
        const h = $('.scan-hint', wrap); if (h) h.hidden = true;
      };
      if (st === 'denied') say('Camera access denied', `Allow camera for Boneheadz Gym in ${/android/i.test(navigator.userAgent || '') ? 'Settings, Apps, Boneheadz Gym, Permissions, Camera' : 'iOS Settings'}, or type the barcode below.`);
      else if (st === 'error') say('Camera unavailable', 'Type the barcode below.');
      else if (st === 'stalled') say('The camera stopped sending frames', 'Close and reopen the scanner.');
      else if (st === 'running') {
        status.textContent = '';
        const h = $('.scan-hint', wrap); if (h) h.hidden = false;
        if (scanner.hasTorch()) $('#torchBtn', wrap).hidden = false;
      } else say('Starting the camera');
    },
  });
  scanner.start();

  let torchOn = false;
  $('#torchBtn', wrap).addEventListener('click', (ev) => {
    torchOn = !torchOn;
    scanner.setTorch(torchOn);
    ev.currentTarget.classList.toggle('on', torchOn);
  });
  // the miss-case used to need a whole extra sheet to discover
  $('#scanToLabel', wrap).addEventListener('click', () => { scanner.stop(); openLabelFlow(getMeal); });
  $('#manualGo', wrap).addEventListener('click', () => {
    const code = $('#manualCode', wrap).value.replace(/\D/g, '');
    if (code.length >= 8) handleBarcode(code, getMeal);
    else toast('Enter at least 8 digits');
  });

  async function handleBarcode(code, getMeal) {
    scanner.stop();
    $('.scan-hint', wrap)?.setAttribute('hidden', '');
    status.innerHTML = `<span class="plate"><span class="spin" style="display:inline-block;vertical-align:-3px"></span> Looking up ${esc(code)}</span>`;
    // 1. local (previously scanned / created)
    let food = S.userFoods.find(f => f.barcode && barcodeMatch(f.barcode, code));
    // 2. Open Food Facts
    if (!food) { food = await fetchOffProduct(code); }
    // 3. USDA branded fallback
    if (!food) { status.innerHTML = '<span class="plate">Checking USDA</span>'; food = await fetchFdcByBarcode(code, S.settings.fdcKey || 'DEMO_KEY'); }
    if (food) {
      openPortion(food, { meal: getMeal(), via: 'scan' });
      return;
    }
    status.textContent = '';
    openSheet(`
      <div class="sheet-head">
        <div class="hd"><h2>Not in the books</h2><div class="sub">Barcode ${esc(code)}</div></div>
        <div class="t1-tools"><button class="sheet-close t1-icon-btn" aria-label="Back">${ICONS.close(17)}</button></div>
      </div>
      <div class="sheet-body">
        <p class="note" style="margin-bottom:14px">Plenty of packaged food was never listed in the databases. Snap the nutrition label instead: a few seconds now, and it is yours forever after.</p>
        <button class="btn" id="missLabel">${ICONS.camera(18)}Scan the label</button>
        <div style="height:10px"></div>
        <button class="btn ghost" id="missManual">Type it in manually</button>
      </div>`, { cls: 't1' });
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
    <div class="sheet-head">
      <div class="hd"><h2>Scan a label</h2><div class="sub xp">+20 XP</div></div>
      <div class="t1-tools"><button class="sheet-close t1-icon-btn" aria-label="Cancel">${ICONS.close(17)}</button></div>
    </div>
    <div class="sheet-body">
      <div class="t1-stage" id="labelStage">
        <img src="assets/brand/label-guide.svg" alt="" onerror="this.remove()">
        <div class="brk"><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="t1-rules">
        <div><span>1</span>Shoot it straight on, not at an angle</div>
        <div><span>2</span>Good light, no glare across the numbers</div>
        <div><span>3</span>Fill the frame with the panel itself</div>
      </div>
      <div class="t1-priv">${ICONS.lock(15)}<div><b>Read on your phone.</b> The photo never leaves the device.</div></div>
      <input type="file" accept="image/*" capture="environment" id="labelFile" hidden>
      <input type="file" accept="image/*" id="labelPick" hidden>
      <div id="ocrArea" style="margin-top:14px"></div>
    </div>
    <div class="t1-foot">
      <div class="t1-g2">
        <button class="btn" id="takeBtn">${ICONS.camera(18)}Photo</button>
        <button class="btn ghost" id="pickBtn">${ICONS.photos(18)}Library</button>
      </div>
    </div>`, { cls: 't1' });

  const area = $('#ocrArea', wrap);
  $('#takeBtn', wrap).addEventListener('click', () => $('#labelFile', wrap).click());
  $('#pickBtn', wrap).addEventListener('click', () => $('#labelPick', wrap).click());
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    // the guide and the rules have done their job once there is a photo; leaving
    // them above the read would stack two labels in one sheet.
    $('#labelStage', wrap)?.remove();
    $('.t1-rules', wrap)?.remove();
    $('.t1-priv', wrap)?.remove();
    area.innerHTML = `
      <img src="${url}" alt="label" style="width:100%;border:2px solid var(--ink);border-radius:14px;max-height:300px;object-fit:contain;background:var(--surface-2)">
      <div class="progress"><i id="ocrBar" style="width:4%"></i></div>
      <p class="note" style="text-align:center" id="ocrMsg">Reading the label. First use downloads the reader, about 10 MB.</p>`;
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

  /* After a label read this screen IS the confirmation step, so it says so, and
     the fields the reader could not fill are flagged where the eye already is
     instead of in a paragraph at the top. */
  const READ_KEYS = ['kcal', 'p', 'c', 'f', 'fiber', 'sugar', 'sodium'];
  const readCount = fromLabel
    ? READ_KEYS.filter(k => v(k) !== '' && v(k) != null).length + (servingGrams ? 1 : 0)
    : 0;
  const missing = k => (fromLabel && (v(k) === '' || v(k) == null) ? ' check' : '');
  const flag = k => (missing(k) ? '<span class="t1-tag warn">Check</span>' : '');
  const fld = (id, label, key, unit = '', extra = '') => `
    <div class="t1-field${missing(key)}">
      <div class="lbl"><label>${label}${unit ? `<span class="u">${unit}</span>` : ''}</label>${flag(key)}</div>
      <input id="${id}" type="text" inputmode="${extra || 'decimal'}" value="${v(key)}">
    </div>`;

  const wrap = openSheet(`
    <div class="sheet-head">
      <div class="hd">
        <h2>${fromLabel ? 'Check the numbers' : f ? 'Edit food' : 'New food'}</h2>
        <div class="sub">${fromLabel ? 'Then it is yours forever' : barcode ? `Barcode ${esc(barcode)}` : 'Saved to My foods'}</div>
      </div>
      <div class="t1-tools"><button class="sheet-close t1-icon-btn" aria-label="Cancel">${ICONS.close(17)}</button></div>
    </div>
    <div class="sheet-body">
      ${photoUrl ? `<div class="t1-read">
        <span class="th"><img src="${photoUrl}" alt="label"></span>
        <span class="tx"><b>Read ${readCount} of 8 fields</b><small>${8 - readCount > 0 ? `${8 - readCount} need a look, flagged below` : 'Everything came through'}</small></span>
        <button class="again" id="ffRetake">RETAKE</button>
      </div>` : ''}
      ${warnings.length ? `<div class="warn">${warnings.map(esc).join('<br>')}</div>` : ''}
      ${t1Sect('What is it')}
      <div class="t1-field"><label>Name</label><input id="ffName" placeholder="e.g. Protein granola" value="${esc(f?.name || '')}"></div>
      <div class="t1-field"><label>Brand</label><input id="ffBrand" placeholder="Optional" value="${esc(f?.brand || '')}"></div>
      ${t1Sect('One serving')}
      <div class="t1-g2">
        <div class="t1-field"><label>Serving</label><input id="ffServ" value="${esc(servingLabel)}"></div>
        <div class="t1-field"><label>Grams<span class="u">(optional)</span></label><input id="ffGrams" type="text" inputmode="decimal" value="${servingGrams ?? ''}" placeholder="e.g. 55"></div>
      </div>
      ${t1Sect('Per serving')}
      <div class="t1-g2">
        ${fld('ffKcal', 'Calories', 'kcal', '', 'numeric')}
        ${fld('ffP', 'Protein', 'p', 'g')}
        ${fld('ffC', 'Carbs', 'c', 'g')}
        ${fld('ffF', 'Fat', 'f', 'g')}
        ${fld('ffFib', 'Fiber', 'fiber', 'g')}
        ${fld('ffSug', 'Sugars', 'sugar', 'g')}
      </div>
      ${fld('ffNa', 'Sodium', 'sodium', 'mg', 'numeric')}
      ${barcode ? `<p class="note">Linked to barcode ${esc(barcode)}, so scanning finds it instantly next time.</p>` : ''}
      ${f ? '<div style="height:12px"></div><button class="btn danger" id="ffDel">Delete food</button>' : ''}
    </div>
    <div class="t1-foot"><button class="btn" id="ffSave">${f ? 'Save changes' : 'Save food'}</button></div>`, { cls: 't1' });

  $('#ffRetake', wrap)?.addEventListener('click', () => history.back());

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

/* ================= shop (v150) ================= */
// One home for everything you spend on: the Bone Merchant (weapons, moved out of
// the buried Build sheet), the coin + Bone Dust shops (moved out of Backpack), a
// route to Forage, and a placeholder for future real-money packs. Renders into
// #screen like the other main tabs; re-renders itself after each purchase.
async function renderShop(el) {
  const [fighter, coinBal, dustBal, ownedCos] = await Promise.all([buildFighter(), coins(), boneDust(), ownedCosmeticIds()]);
  const recArch = recommendArch(fighter);
  const rerender = () => renderShop(el);

  const weaponCard = w => {
    const ownedW = fighter.owned.includes(w.id);
    const on = fighter.loadout === w.id;
    const cost = weaponCoinCost(w.id);
    const dust = weaponDustCost(w.id);
    const tierTag = w.tier ? `<span class="weap-tier t${w.tier}">${ICONS.star(12).repeat(w.tier)}</span>` : '';
    const specTag = w.spec ? `<span class="weap-spec">rewards ${STAT_META.find(m => m.key === w.spec)?.label || w.spec}</span>` : '<span class="weap-spec">all-rounder</span>';
    const priceLabel = `${ICONS.coin(13)} ${cost != null ? cost.toLocaleString() : ''}${dust ? ` <span class="cta-dust">+ <span class="dust-ico">${ICONS.dust(13)}</span> ${dust}</span>` : ''}`;
    const cta = ownedW
      ? `<button class="btn small ${on ? 'ghost' : ''}" data-weapon="${w.id}" ${on ? 'disabled' : ''}>${on ? 'Equipped' : 'Equip'}</button>`
      : cost != null
        ? `<button class="btn small" data-buyweapon="${w.id}" ${(coinBal < cost || dustBal < dust) ? 'disabled' : ''}>${priceLabel}</button>`
        : `<span class="q-frac">Champion drop</span>`;
    return `<div class="weap-card r-${w.rarity} ${on ? 'on' : ''} ${ownedW ? 'owned' : ''}">
      <div class="weap-top"><b>${esc(w.name)} ${tierTag}</b>${specTag}</div>
      <small class="weap-desc">${esc(w.desc)}</small>
      <div class="weap-cta">${cta}</div>
    </div>`;
  };
  const allW = Object.values(WEAPONS);
  const baseline = allW.find(w => !w.arch);
  const order = [recArch, ...['melee', 'caster', 'support'].filter(a => a !== recArch)];
  const merchantHtml = `${baseline ? `<div class="weap-rack">${weaponCard(baseline)}</div>` : ''}
    ${order.map(arch => {
      const list = allW.filter(w => w.arch === arch).sort((a, b) => (a.tier || 0) - (b.tier || 0) || (weaponCoinCost(a.id) || 9999) - (weaponCoinCost(b.id) || 9999));
      if (!list.length) return '';
      const rec = arch === recArch;
      return `<div class="merch-group${rec ? ' rec' : ''}">
        <div class="merch-head"><span class="merch-ico">${ARCH_META[arch].ico}</span><b>${ARCH_META[arch].label}</b><small>${ARCH_META[arch].blurb}</small>${rec ? '<span class="merch-rec">for your build</span>' : ''}</div>
        <div class="weap-rack">${list.map(weaponCard).join('')}</div>
      </div>`;
    }).join('')}`;

  // No page heading or back button: the Shop is a tab inside Your Bonehead now,
  // so the hub supplies both and a second title would just repeat itself.
  // Tier 3 (mockup t3-shop.html, approved 2026-08-07): wallet chips, the drop as
  // a coral poster that opens the real per-item grid, sticker cells with gold
  // price chips, the merchant as rows. The mockup showed the drop as a single
  // 600-coin pack; the game sells the pieces individually, so the poster quotes
  // the real "from" price and opens the real grid rather than inventing a SKU.
  const dropCheapest = Math.min(...DROP.items.map(d => d.cost));
  const dropOwned = DROP.items.filter(d => ownedCos.has(d.id)).length;
  const shopDesc = { vigor: '+3 Pit fights right now', xp2: 'Next Pit wins pay more' };
  // The mockup is a standalone screen with its own wallet row. In the app the
  // Shop is a hub tab whose header already carries the balances, so the dust
  // pill moved up there rather than printing the same two numbers twice.
  el.innerHTML = `

  <details class="t3-dropsect" id="dropSect">
    <summary class="t3-drop">
      ${dropOwned < DROP.items.length ? '<span class="new">NEW</span>' : ''}
      <span class="eyebrow">Fresh drop · ${DROP.items.length} pieces${dropOwned ? ` · ${dropOwned} yours` : ''}</span>
      <h2>${esc(DROP.title).toUpperCase()}</h2>
      <div class="row">
        <div class="art"><canvas class="t3-art" width="220" height="220" data-art="${esc(bhAsset(BH_BY_ID[DROP.items[5].id]))}"></canvas></div>
        <div class="tx">
          <small>${esc(DROP.blurb)} Every piece also drops from crates like any legendary.</small>
          <span class="t3-price">${ICONS.coin(13)} from ${dropCheapest.toLocaleString()}</span>
        </div>
      </div>
    </summary>
    <div class="t3-dropbody">
      <p class="drop-sub2">${esc(DROP.acquire)}</p>
      <div class="drop-grid">
        ${DROP.items.map(d => {
          const it = BH_BY_ID[d.id];
          const owned = ownedCos.has(d.id);
          return `<div class="drop-item ${owned ? 'owned' : ''}">
            <img src="${bhAsset(it)}" alt="" loading="lazy">
            <b>${esc(it.name)}</b>
            ${owned
              ? `<button class="drop-buy" disabled>In your Wardrobe</button>`
              : `<button class="drop-buy" data-buydrop="${d.id}" ${coinBal < d.cost ? 'disabled' : ''}>${ICONS.coin(12)} ${d.cost.toLocaleString()}</button>`}
          </div>`;
        }).join('')}
      </div>
    </div>
  </details>

  <div class="t3-sect"><b>Coin shop</b><i></i></div>
  <div class="t3-cells">
    ${SHOP.map(s => `<button class="t3-cell" data-buy="${s.id}" data-label="${esc(s.label)}" ${coinBal < s.cost ? 'disabled' : ''}>
      <span class="art">${s.id === 'crate-daily' ? crateIcon('daily', 54) : s.id === 'crate-golden' ? crateIcon('golden', 54) : consumableIcon(s.id, 46)}</span>
      <b>${esc(s.label).toUpperCase()}</b>
      <span class="t3-price">${ICONS.coin(13)} ${s.cost}</span>
      ${shopDesc[s.id] ? `<small>${shopDesc[s.id]}</small>` : ''}
    </button>`).join('')}
  </div>

  <div class="t3-sect"><b>Bone Dust shop</b><i></i><span class="r chip" style="font-size:11px">Melt gear to earn it</span></div>
  <div class="t3-cells">
    ${DUST_SHOP.map(d => `<button class="t3-cell dust-cell" data-dustbuy="${d.id}" data-label="${esc(d.label)}" data-cost="${d.cost}" ${dustBal < d.cost ? 'disabled' : ''}>
      <span class="art">${d.id === 'egg' ? crateIcon('egg', 54) : d.id === 'crate-daily' ? crateIcon('daily', 54) : consumableIcon(d.id, 46)}</span>
      <b>${esc(d.label).toUpperCase()}</b>
      <span class="t3-price dust">${ICONS.dust(13)} ${d.cost}</span>
      <small>${esc(d.desc)}</small>
    </button>`).join('')}
  </div>
  <button class="t3-forage" id="shopSalvage" style="margin-top:10px">${ICONS.dust(20)}<b>Melt gear for Bone Dust</b><small>Salvage Bench ›</small></button>

  <div class="t3-sect"><b>Bone Merchant</b><i></i><span class="r chip" style="font-size:11px">${ARCH_META[recArch].label} suits you</span></div>
  <p class="note" style="margin:0 2px 10px">Weapons multiply your effort; they never replace it.</p>
  ${merchantHtml}

  <button class="t3-forage" id="shopForage">${ingIconHtml('graveroot', 24)}<b>Forage for ingredients</b><small>in the Kitchen ›</small></button>`;

  el.querySelectorAll('[data-weapon]').forEach(b => b.addEventListener('click', async () => {
    await kvSet('loadout', b.dataset.weapon); popSound(S.sounds); pushProfileSoon(); rerender();
  }));
  // the priciest single tap in the game: up to 6,000 coins AND 350 Bone Dust
  el.querySelectorAll('[data-buyweapon]').forEach(b => armToConfirm(b, (() => {
    const id = b.dataset.buyweapon;
    const c = weaponCoinCost(id), d = weaponDustCost(id);
    return c != null ? `Spend ${c.toLocaleString()}${d ? ` + ${d} dust` : ''}?` : 'Spend?';
  })(), async () => {
    b.disabled = true;
    const res = await buyWeapon(b.dataset.buyweapon);
    if (!res.ok) {
      toast(res.reason === 'coins' ? 'Not enough coins for that weapon.'
        : res.reason === 'dust' ? `Need ${res.need} Bone Dust (you have ${res.have}). Melt gear at the Salvage Bench.`
        : 'Already owned.');
      b.disabled = false; return;
    }
    await kvSet('loadout', res.weaponId);
    pushProfileSoon();
    trackEvent('buy_weapon', { id: res.weaponId });
    levelSound(S.sounds); confettiBurst(innerWidth / 2, innerHeight * 0.35, 14);
    toast(`${WEAPONS[res.weaponId].name} bought and equipped.`);
    rerender();
  }));
  // Both shop grids use the shared arm-then-confirm helper now. They each used to
  // carry their own copy of the dance, and the coin one swapped textContent,
  // which would wipe a Tier 3 cell's art and price chip on the first tap.
  el.querySelectorAll('[data-buy]').forEach(b => armToConfirm(b, `Spend ${SHOP.find(s => s.id === b.dataset.buy)?.cost ?? ''}?`, async () => {
    const r = await buyShopItem(b.dataset.buy);
    if (!r.ok) { toast(`Not enough coins. That costs ${r.need}, you have ${r.have}.`, 2600); return; }
    popSound(S.sounds);
    toast(`${r.label} bought. −${r.cost} coins, ${r.coins} left. You now have ${r.owned}.`, 3000);
    rerender();
  }));
  // Drop pieces: same two-tap arm-then-buy ritual as the coin shop, because these
  // are the most expensive single taps in the game.
  el.querySelectorAll('[data-buydrop]').forEach((b => {
    let t = null;
    const reset = () => { b.dataset.armed = '0'; b.innerHTML = b.dataset.label || b.innerHTML; };
    b.addEventListener('click', async () => {
      if (b.dataset.armed !== '1') {
        b.dataset.label = b.dataset.label || b.innerHTML;
        b.dataset.armed = '1'; b.textContent = 'Tap again to buy';
        clearTimeout(t); t = setTimeout(() => { if (b.isConnected) reset(); }, 2600);
        return;
      }
      clearTimeout(t); reset();
      const r = await buyDropItem(b.dataset.buydrop);
      if (!r.ok) {
        toast(r.reason === 'owned' ? 'Already in your Wardrobe.' : `Not enough coins. That costs ${r.need.toLocaleString()}, you have ${r.have.toLocaleString()}.`, 2600);
        return;
      }
      levelSound(S.sounds); confettiBurst(innerWidth / 2, innerHeight * 0.35, 14);
      toast(`${r.label} is yours. −${r.cost.toLocaleString()} coins, ${r.coins.toLocaleString()} left. Equip it in your Wardrobe.`, 3200);
      rerender();
    });
  }));
  // A single tap used to spend on the spot. Tom lost 25 dust just looking at what
  // a Battle Charm was, so the first tap only ARMS the cell.
  el.querySelectorAll('[data-dustbuy]').forEach(btn => armToConfirm(btn, `Spend ${btn.dataset.cost} dust?`, async () => {
    btn.disabled = true;
    const res = await buyWithDust(btn.dataset.dustbuy);
    if (!res.ok) { toast(res.reason === 'dust' ? `Need ${res.need} Bone Dust (you have ${res.have}).` : 'Could not buy that.'); btn.disabled = false; return; }
    popSound(S.sounds);
    toast(res.id === 'egg' ? 'Egg incubating. Walk to hatch it.' : res.id === 'crate-daily' ? 'Common Crate added. Open it in your Backpack.' : 'Added to your consumables.', 2800);
    rerender();
  }));
  // the drop art sits small inside a 640² sprite sheet, so trim it to its ink
  // the same way the reveal cards do rather than showing a stamp in a big box
  hydratePackArt(el, '.t3-art[data-art]');
  $('#shopForage', el)?.addEventListener('click', openKitchen);
  $('#shopSalvage', el)?.addEventListener('click', () => openCharacter('crates'));
}

/* ================= trends ================= */

const STEP_REF = 10000; // step reference line on the activity chart (matches the home step goal)

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
  const health = await db.all('health');
  const hByDate = {};
  for (const h of health) hByDate[h.date] = h;

  // 56-day window (8 weeks) for the heatmap; slices for the charts + week recap
  const N = 56, days = [];
  for (let i = N - 1; i >= 0; i--) {
    const dk = addDays(dateKey(), -i);
    const tot = dayTotals(byDate[dk] || []);
    const h = hByDate[dk] || {};
    days.push({
      date: dk, kcal: tot.kcal, p: tot.p, logged: tot.kcal > 0,
      steps: h.steps || 0, sleepHours: h.sleepHours ?? null,
      sleepMin: h.sleepMin ?? null, sleepDeepMin: h.sleepDeepMin ?? null,
      sleepRemMin: h.sleepRemMin ?? null, sleepCoreMin: h.sleepCoreMin ?? null,
      sleepAwakeMin: h.sleepAwakeMin ?? null, sleepStaged: !!h.sleepStaged, sleepAuto: !!h.sleepAuto,
      activeKcal: h.activeKcal ?? null, exerciseMin: h.exerciseMin ?? null,
      workouts: h.workouts || 0, wtypes: Array.isArray(h.wtypes) ? h.wtypes : [],
      restingHr: h.restingHr ?? null, hrv: h.hrv ?? null,
    });
  }
  const days14 = days.slice(-14), days7 = days.slice(-7);

  // week recap
  const loggedWk = days7.filter(d => d.logged).length;
  const stepsWk = days7.reduce((a, d) => a + d.steps, 0);
  const kmWk = stepsWk * 0.000762;
  const sleepWk = days7.filter(d => d.sleepHours != null);
  const avgSleep = sleepWk.length ? sleepWk.reduce((a, d) => a + d.sleepHours, 0) / sleepWk.length : null;
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) { if (days[i].logged || days[i].steps >= 3000) streak++; else break; }

  const xp = await totalXp();
  const lvl = levelFor(xp);
  const earned = await earnedBadgeIds();
  const pAvg = days7.reduce((a, d) => a + d.p, 0) / 7;
  const loggedDays7 = days7.filter(d => d.logged).length;
  const kcalLogged14 = days14.filter(d => d.logged);

  // Step averages EXCLUDE today (in-progress: no fair way to have a full day's
  // steps yet, so it must not drag the average down). Count only days with steps.
  const doneDays = days.slice(0, -1);
  const stepAvg = arr => { const v = arr.filter(d => d.steps > 0); return v.length ? Math.round(v.reduce((a, d) => a + d.steps, 0) / v.length) : 0; };
  const stepsToday = days[days.length - 1].steps;
  const stepAvg7 = stepAvg(doneDays.slice(-7));
  const stepAvg30 = stepAvg(doneDays.slice(-30));
  const stepsHasData = days.some(d => d.steps > 0);

  const pill = (v, sub) => `<div class="recap-pill"><span class="rp-v">${v}</span><span class="rp-s">${sub}</span></div>`;

  el.innerHTML = `
  <div id="updBanner"></div>
  <h1 class="page-h1">Progress<span class="sub">Your level, streak, badges and data</span></h1>

  ${activityRecoveryHtml(days)}

  <div class="card recap-card">
    <div class="card-title">THIS WEEK</div>
    <div class="recap-grid">
      ${pill(`${loggedWk}<small>/7</small>`, 'days logged')}
      ${pill(stepsWk ? `${kmWk.toFixed(1)}<small>km</small>` : '·', 'walked (7d)')}
      ${pill(avgSleep != null ? `${avgSleep.toFixed(1)}<small>h</small>` : '·', 'avg sleep')}
      ${pill(`${streak}<small>${ICONS.flame(13)}</small>`, 'day streak')}
    </div>
    <div class="recap-lvl">
      <div class="rl-top"><b>Lv ${lvl.level} · ${esc(lvl.name)}</b><span class="note">${(lvl.need - lvl.into).toLocaleString()} XP to Lv ${lvl.level + 1}</span></div>
      <div class="xp-bar"><i style="width:${lvl.pct}%"></i></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">STEPS${stepsHasData ? '<button class="link" data-metric="steps">History ›</button>' : ''}</div>
    <div class="trend-stats" style="margin:2px 0 12px">
      <div class="st"><div class="l">Today</div><div class="v">${stepsToday.toLocaleString()}</div></div>
      <div class="st"><div class="l">7-day avg</div><div class="v">${stepAvg7 ? stepAvg7.toLocaleString() : '·'}</div></div>
      <div class="st"><div class="l">30-day avg</div><div class="v">${stepAvg30 ? stepAvg30.toLocaleString() : '·'}</div></div>
    </div>
    <div class="chart" id="stepsChart">${barChart(days14, d => d.steps, { target: STEP_REF, color: 'var(--accent)', fmt: v => (v / 1000).toFixed(0) + 'k' })}
      <p class="bc-readout note">${stepsHasData ? 'Tap any bar for that day\'s exact steps.' : ''}</p></div>
    <p class="note" style="margin-top:8px">${stepsHasData ? `Line = ${(STEP_REF / 1000)}k steps. Averages skip today (still counting). Tap History for week / month / year.` : 'Connect Apple Health (Settings) so your steps power the game and show here.'}</p>
  </div>

  <div class="card">
    <div class="card-title">SLEEP · LAST 14 DAYS</div>
    <div class="big-stat"><span class="v">${avgSleep != null ? avgSleep.toFixed(1) : '·'}<span class="d" style="margin-left:4px">h avg (7d)</span></span></div>
    <div class="chart" id="sleepChart">${barChart(days14, d => d.sleepHours, { target: 8, color: 'var(--protein)', fmt: v => v.toFixed(0) + 'h', band: [7, 9] })}
      <p class="bc-readout note">${sleepWk.length ? 'Tap any bar for that night.' : ''}</p></div>
    <p class="note" style="margin-top:8px">${sleepWk.length ? 'Shaded band = 7 to 9 hours. Log your hours each morning on the home screen.' : 'Log hours slept on the home screen (Daily wellness) to start your sleep trend.'}</p>
  </div>

  <div class="card">
    <div class="card-title">WEIGHT ${weights.length ? `<span class="note">${weights.length} entries</span><button class="link" data-metric="weight">History ›</button>` : ''}</div>
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
    <div class="card-title">INTAKE · CALORIES 14D · PROTEIN 7D</div>
    <div class="big-stat"><span class="v">${kcalLogged14.length ? Math.round(kcalLogged14.reduce((a, d) => a + d.kcal, 0) / kcalLogged14.length).toLocaleString() : '·'}</span><span class="d">avg kcal / logged day · target ${t.kcal.toLocaleString()}</span></div>
    <div class="chart">${kcalChart(days14.map(d => ({ date: d.date, tot: { kcal: d.kcal } })), t.kcal)}</div>
    <div class="big-stat" style="margin-top:12px"><span class="v">${Math.round(pAvg)} g</span><span class="d">protein avg / day · target ${t.p} g</span></div>
    <div class="chart">${proteinChart(days7.map(d => ({ date: d.date, tot: { p: d.p } })), t.p)}</div>
    ${loggedDays7 < 5 ? '<p class="note" style="margin-top:8px">Log most days for a meaningful average.</p>' : ''}
  </div>

  <div class="card">
    <div class="card-title">BADGES <button class="link" id="openProg">Details</button></div>
    ${badgesGridHtml(earned)}
  </div>`;

  $('#logWeight').addEventListener('click', openWeightSheet);
  $('#openProg').addEventListener('click', openProgressSheet);
  el.querySelectorAll('[data-metric]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); openMetricDetail(b.dataset.metric); }));
  wireBarChart($('#stepsChart', el), v => `${v.toLocaleString()} steps`);
  wireBarChart($('#sleepChart', el), v => `${v.toFixed(1)} hours`);
  el.querySelectorAll('[data-sleepdetail]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); openSleepDetail(); }));
  $('#trendConnect', el)?.addEventListener('click', openHealthGuide);
  $('#trendSync', el)?.addEventListener('click', async () => { await nativeSyncNow({ silent: false }); refresh(); });
  $('#trendHeartAuth', el)?.addEventListener('click', async () => { try { await nativeRequestAuth(); } catch { /* noop */ } await nativeSyncNow({ silent: false }); refresh(); });
  checkForUpdate(el);
  bindBadgeTaps(el);
}

// Generic bar chart. pick(d) -> value|null; opts: target line, color, fmt, band [lo,hi].
/* Tappable bars. Each bar carries its date and exact value, and a FULL-HEIGHT
   transparent hit target sits over it: a 300-step day is a 2px sliver, and asking
   someone to hit that with a thumb is the same as not being tappable at all.
   readBarChart() below wires the readout. */
function barChart(days, pick, opts = {}) {
  const W = 560, H = 150, P = 8, gap = 5;
  const vals = days.map(pick);
  const maxV = Math.max(opts.target || 0, ...vals.map(v => v || 0), 1);
  const top = maxV * 1.15;
  const n = days.length, bw = (W - 2 * P - gap * (n - 1)) / n;
  const y = v => P + (1 - v / top) * (H - 2 * P);
  let bandRect = '';
  if (opts.band) bandRect = `<rect x="0" y="${y(opts.band[1]).toFixed(1)}" width="${W}" height="${(y(opts.band[0]) - y(opts.band[1])).toFixed(1)}" fill="${opts.color}" opacity="0.12"/>`;
  const bars = days.map((d, i) => {
    const v = pick(d); if (!v) return '';
    const x = P + i * (bw + gap), h = H - P - y(v);
    return `<rect class="bc-bar" data-i="${i}" x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="2" fill="${opts.color}" opacity="0.9"/>`;
  }).join('');
  const hits = days.map((d, i) => {
    const v = pick(d);
    const x = P + i * (bw + gap);
    return `<rect class="bc-hit" data-i="${i}" data-date="${esc(d.date || '')}" data-val="${v == null ? '' : v}"
      x="${x.toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}" fill="transparent"/>`;
  }).join('');
  const tl = opts.target ? `<line x1="0" y1="${y(opts.target).toFixed(1)}" x2="${W}" y2="${y(opts.target).toFixed(1)}" stroke="var(--text-3)" stroke-width="1.5" stroke-dasharray="5 5"/>` : '';
  return `<svg class="bc" viewBox="0 0 ${W} ${H}">${bandRect}${bars}${tl}${hits}</svg>`;
}

/* Tap a bar, read the exact number for that day. Delegated, so it survives the
   in-place re-renders this screen does. `fmt` turns a raw value into the label. */
function wireBarChart(wrap, fmt) {
  const svg = $('.bc', wrap); if (!svg) return;
  const out = $('.bc-readout', wrap); if (!out) return;
  const idle = out.textContent;
  svg.addEventListener('click', e => {
    const hit = e.target.closest('.bc-hit'); if (!hit) return;
    const i = hit.dataset.i;
    svg.querySelectorAll('.bc-bar').forEach(b => b.classList.toggle('on', b.dataset.i === i));
    const raw = hit.dataset.val;
    if (raw === '') { out.textContent = `${prettyDay(hit.dataset.date)} · nothing recorded`; return; }
    out.textContent = `${prettyDay(hit.dataset.date)} · ${fmt(Number(raw))}`;
  });
  svg.addEventListener('pointerleave', () => {
    svg.querySelectorAll('.bc-bar.on').forEach(b => b.classList.remove('on'));
    out.textContent = idle;
  });
}

// "Tue 29 Jul" from a YYYY-MM-DD key, parsed as LOCAL time. new Date('2026-07-29')
// is parsed as UTC and renders as the 28th for anyone west of Greenwich.
function prettyDay(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
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

/* ================= activity & recovery trends (v192) =================
   Heart + activity modules for the Progress screen, plus Apple-Health-style
   drill-in detail views (Day / Week / Month / Year). Everything reads the daily
   `health` rows ingestHealth() already stores (restingHr / hrv / activeKcal /
   exerciseMin / workouts / wtypes), so anyone without a watch just sees nothing
   extra here (the blocks self-hide when there is no data). */

const WORKOUT_LABEL = {
  running: 'Running', walking: 'Walking', biking: 'Cycling', cycling: 'Cycling',
  hiking: 'Hiking', swimming: 'Swimming', rowing: 'Rowing', elliptical: 'Elliptical',
  hiit: 'HIIT', strength: 'Strength', yoga: 'Yoga', pilates: 'Pilates', other: 'Other',
};

// Metric registry shared by the Progress modules and the drill-in sheet.
// goodLow: true = lower is better (resting HR), false = higher is better,
// null = neither (weight — we show the trend, no "best day").
const TREND_METRICS = {
  restingHr:   { label: 'Resting heart rate', short: 'Resting HR',    unit: 'bpm',   color: 'var(--fat)',     pick: h => h.restingHr,   goodLow: true },
  hrv:         { label: 'Heart rate variability', short: 'HRV',       unit: 'ms',    color: 'var(--protein)', pick: h => h.hrv,         goodLow: false },
  activeKcal:  { label: 'Active energy',      short: 'Active energy',  unit: 'kcal',  color: 'var(--carbs)',   pick: h => h.activeKcal,  goodLow: false },
  exerciseMin: { label: 'Move minutes',       short: 'Move minutes',   unit: 'min',   color: 'var(--gold)',    pick: h => h.exerciseMin, goodLow: false },
  steps:       { label: 'Steps',              short: 'Steps',          unit: 'steps', color: 'var(--accent)',  pick: h => h.steps,       goodLow: false },
  weight:      { label: 'Weight',             short: 'Weight',         unit: '',      color: 'var(--protein)', pick: null,               goodLow: null },
};

// date -> value map for a metric. Weight comes from the weights store; the rest
// from health rows. Zero/absent readings are treated as "no data" (gaps).
function metricValueByDate(metricKey, health, weights) {
  const m = {};
  if (metricKey === 'weight') { for (const w of (weights || [])) if (w.kg) m[w.date] = w.kg; }
  else { const M = TREND_METRICS[metricKey]; for (const h of health) { const v = M.pick(h); if (v != null && v > 0) m[h.date] = v; } }
  return m;
}

// Series of {label,date,value|null} for a range. We only capture one aggregate
// reading per day, so Week/Month are daily bars, Year is 12 monthly averages,
// and Day shows the last 14 days as recent context (no intraday feed to plot).
function metricSeries(metricKey, rangeKey, health, weights) {
  const byDate = metricValueByDate(metricKey, health, weights);
  const today = dateKey();
  const points = [];
  if (rangeKey === 'year') {
    const buckets = {};
    for (const dk in byDate) { const mk = dk.slice(0, 7); (buckets[mk] = buckets[mk] || []).push(byDate[dk]); }
    const d = new Date(today + 'T12:00');
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const mk = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
      const arr = buckets[mk] || [];
      const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      points.push({ label: 'JFMAMJJASOND'[dt.getMonth()], value: avg });
    }
  } else {
    const n = rangeKey === 'week' ? 7 : rangeKey === 'day' ? 14 : 30;
    for (let i = n - 1; i >= 0; i--) {
      const dk = addDays(today, -i);
      points.push({ label: 'SMTWTFS'[new Date(dk + 'T12:00').getDay()], date: dk, value: byDate[dk] ?? null });
    }
  }
  return points;
}

// format a metric value (unit handled by caller where needed)
function metricNum(metricKey, v) {
  if (v == null) return '·';
  if (metricKey === 'weight') return (S.settings.units === 'kg' ? v : kgToLb(v)).toFixed(1);
  if (metricKey === 'steps' || metricKey === 'activeKcal') return Math.round(v).toLocaleString();
  return String(Math.round(v));
}
function metricUnit(metricKey) {
  if (metricKey === 'weight') return S.settings.units === 'kg' ? 'kg' : 'lb';
  return TREND_METRICS[metricKey].unit;
}

// tiny bar sparkline for the summary cards (nulls = gaps)
function metricSpark(vals, color) {
  const W = 120, H = 26, nn = vals.filter(v => v != null && v > 0);
  if (!nn.length) return '';
  const mx = Math.max(...nn), mn = Math.min(...nn), span = (mx - mn) || 1, n = vals.length, bw = W / n;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none">${vals.map((v, i) => {
    if (v == null || v <= 0) return '';
    const h = 4 + ((v - mn) / span) * (H - 4);
    return `<rect x="${(i * bw).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 1.5).toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${color}" opacity="0.5"/>`;
  }).join('')}</svg>`;
}

// full drill-in chart: bars, a dashed average baseline, best day highlighted green
function metricDetailChart(points, metricKey) {
  const metric = TREND_METRICS[metricKey];
  const vals = points.map(p => p.value).filter(v => v != null);
  if (!vals.length) return '<p class="note" style="text-align:center;padding:26px 0">No readings in this window yet.</p>';
  const maxV = Math.max(...vals), minV = Math.min(...vals);
  const base = vals.reduce((a, b) => a + b, 0) / vals.length;
  const lo = Math.min(minV, base) * 0.94, hi = Math.max(maxV, base) * 1.06, span = (hi - lo) || 1;
  const W = 360, H = 150, P = 8, gap = 3, n = points.length, bw = (W - 2 * P - gap * (n - 1)) / n;
  const y = v => P + (1 - (v - lo) / span) * (H - 2 * P - 16);
  let best = -1;
  if (metric.goodLow != null) points.forEach((p, i) => { if (p.value == null) return; if (best < 0 || (metric.goodLow ? p.value < points[best].value : p.value > points[best].value)) best = i; });
  const bars = points.map((p, i) => {
    if (p.value == null) return '';
    const x = P + i * (bw + gap), yy = y(p.value), h = (H - 16 - P) - yy;
    const isBest = i === best;
    return `<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, h).toFixed(1)}" rx="1.5" fill="${isBest ? 'var(--accent)' : metric.color}" opacity="${isBest ? 1 : 0.55}"/>`;
  }).join('');
  const by = y(base);
  const bl = `<line x1="${P}" y1="${by.toFixed(1)}" x2="${W - P}" y2="${by.toFixed(1)}" stroke="var(--text-3)" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/><text x="${W - P}" y="${(by - 3).toFixed(1)}" fill="var(--text-3)" font-size="9" text-anchor="end">avg ${metricNum(metricKey, base)}</text>`;
  const leftLbl = { day: '2 wks ago', week: '7 days ago', month: '30 days ago', year: '12 mo ago' };
  const axis = `<text x="${P}" y="${H - 2}" fill="var(--text-3)" font-size="9">${leftLbl[points.length === 12 ? 'year' : (n === 7 ? 'week' : n === 14 ? 'day' : 'month')] || ''}</text><text x="${W - P}" y="${H - 2}" fill="var(--text-3)" font-size="9" text-anchor="end">now</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${bl}${bars}${axis}</svg>`;
}

// a plain-language insight comparing the first vs second half of the window
function metricInsight(metricKey, points) {
  const metric = TREND_METRICS[metricKey];
  const half = Math.floor(points.length / 2);
  const avg = arr => { const v = arr.map(p => p.value).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const a = avg(points.slice(0, half)), b = avg(points.slice(half));
  if (a == null || b == null || a === 0) return '';
  const pct = (b - a) / a * 100;
  if (Math.abs(pct) < 3) return `Holding steady across this window.`;
  const p = Math.abs(pct).toFixed(0), up = pct > 0;
  const good = metric.goodLow == null ? null : (metric.goodLow ? !up : up);
  const line = {
    restingHr: up ? `Up about <b>${p}%</b>. A rising resting heart rate can mean fatigue, stress or a hard training block, worth an easier day.` : `Down about <b>${p}%</b>. A falling resting heart rate usually means your fitness is improving, nice work.`,
    hrv: up ? `Up about <b>${p}%</b>. Higher HRV generally points to good recovery.` : `Down about <b>${p}%</b>. Lower HRV can follow poor sleep or heavy load, ease in if it keeps dropping.`,
    activeKcal: `${up ? 'Up' : 'Down'} about <b>${p}%</b> in active energy${up ? ', you are moving more.' : ' vs earlier in the window.'}`,
    exerciseMin: `${up ? 'Up' : 'Down'} about <b>${p}%</b> in move minutes${up ? '. Momentum.' : ' vs earlier in the window.'}`,
    steps: `${up ? 'Up' : 'Down'} about <b>${p}%</b> in daily steps${up ? '. Keep it rolling.' : ' vs earlier in the window.'}`,
    weight: `Trend is ${up ? 'up' : 'down'} about <b>${p}%</b> across this window.`,
  }[metricKey] || '';
  return line ? `<div class="trend-insight ${good === true ? 'ti-good' : good === false ? 'ti-warn' : ''}">${line}</div>` : '';
}

// Apple-Health-style drill-in: header + Day/Week/Month/Year + chart + stats + insight.
async function openMetricDetail(metricKey) {
  const metric = TREND_METRICS[metricKey];
  if (!metric) return;
  const health = await db.all('health');
  const weights = metricKey === 'weight' ? await db.all('weights') : [];

  const byDate = metricValueByDate(metricKey, health, weights);
  const dates = Object.keys(byDate).sort();
  const latest = dates.length ? byDate[dates[dates.length - 1]] : null;
  const recent = dates.slice(-28).map(d => byDate[d]);
  const base = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
  // cumulative-per-day metrics build up over the day, so today is always partial:
  // never compare today's running total to a baseline (it reads falsely low early).
  const cumulative = ['steps', 'activeKcal', 'exerciseMin'].includes(metricKey);
  const delta = (!cumulative && latest != null && base != null) ? latest - base : null;
  let deltaHtml = '';
  if (delta != null && Math.abs(delta) >= (metricKey === 'weight' ? 0.2 : 1)) {
    const down = delta < 0;
    const good = metric.goodLow == null ? null : (metric.goodLow ? down : !down);
    deltaHtml = `<span class="now-d ${good === false ? 'bad' : ''}">${down ? ICONS.down(11) : ICONS.up(11)}${metricNum(metricKey, Math.abs(delta))} vs baseline</span>`;
  }

  const bodyHtml = (rangeKey) => {
    const pts = metricSeries(metricKey, rangeKey, health, weights);
    const vals = pts.map(p => p.value).filter(v => v != null);
    if (!vals.length) return `<div class="trend-panel"><p class="note" style="text-align:center;padding:22px 0">No readings in this window yet. They will appear here as your watch syncs.</p></div>`;
    // stats exclude the in-progress current day for cumulative metrics (steps etc.)
    // so a partial today never drags the average/lowest down; the chart still shows it.
    const statPts = (cumulative && rangeKey !== 'year' && pts.length > 1) ? pts.slice(0, -1) : pts;
    const svals = statPts.map(p => p.value).filter(v => v != null);
    const useVals = svals.length ? svals : vals;
    const avg = useVals.reduce((a, b) => a + b, 0) / useVals.length, mn = Math.min(...useVals), mx = Math.max(...useVals);
    const u = metricUnit(metricKey);
    const stat = (l, v) => `<div class="st"><div class="l">${l}</div><div class="v">${v}</div></div>`;
    let stats;
    if (metric.goodLow == null) { // weight: Average / Range / Latest
      stats = stat('Average', `${metricNum(metricKey, avg)}<small> ${u}</small>`) + stat('Range', `${metricNum(metricKey, mn)}–${metricNum(metricKey, mx)}`) + stat('Latest', `${metricNum(metricKey, vals[vals.length - 1])}<small> ${u}</small>`);
    } else {
      const exLbl = metric.goodLow ? 'Lowest' : 'Highest', exVal = metric.goodLow ? mn : mx;
      stats = stat('Average', `${metricNum(metricKey, avg)}<small> ${u}</small>`) + stat('Range', `${metricNum(metricKey, mn)}–${metricNum(metricKey, mx)}`) + stat(exLbl, `${metricNum(metricKey, exVal)}<small> ${u}</small>`);
    }
    return `<div class="trend-panel">${metricDetailChart(pts, metricKey)}</div><div class="trend-stats">${stats}</div>${metricInsight(metricKey, pts)}`;
  };

  const range0 = 'month';
  const tabs = ['day', 'week', 'month', 'year'].map(r => `<button class="rtab ${r === range0 ? 'on' : ''}" data-r="${r}">${r[0].toUpperCase() + r.slice(1)}</button>`).join('');
  const html = `
    <button class="sheet-close" style="position:absolute;top:12px;right:14px;z-index:2">Close</button>
    <div class="trend-scroll">
      <h2 style="margin:2px 40px 2px 0;font-size:19px">${metric.label}</h2>
      <div class="trend-now"><span class="n">${latest != null ? metricNum(metricKey, latest) : '·'}</span><span class="u">${metricUnit(metricKey)}</span>${deltaHtml}</div>
      <div class="rtabs">${tabs}</div>
      <div class="trend-body">${bodyHtml(range0)}</div>
      <p class="note" style="margin:14px 2px 2px">Day, Week, Month and Year switch the window, like Apple Health. Baseline dashes = your recent average${metric.goodLow != null ? '; the green bar is your best day' : ''}.</p>
    </div>`;
  const wrap = openSheet(html, { cls: 'sheet-trend', name: 'trend_' + metricKey });
  $$('.rtab', wrap).forEach(b => b.addEventListener('click', () => {
    $$('.rtab', wrap).forEach(x => x.classList.toggle('on', x === b));
    $('.trend-body', wrap).innerHTML = bodyHtml(b.dataset.r);
  }));
}

// The Progress-screen "Activity & recovery" block. Returns '' when there is no
// watch data, so non-fitness users never see an empty or nagging section.
// Sleep score (0-100), OUR read, computed from the stage minutes the watch
// records. Apple exposes no numeric sleep score through HealthKit (only the
// stages + durations), so we derive one: mostly duration (ideal 7-9h), plus
// deep %, REM % and efficiency when the watch logged stages. A manual "hours
// slept" entry has no stages, so it scores on duration alone. Returns null if
// there's no usable sleep on record.
function sleepScore(r) {
  const asleep = r && r.sleepMin;
  if (asleep == null || asleep < 30) return null;
  const durFrac = asleep >= 420 && asleep <= 540 ? 1
    : asleep < 420 ? Math.max(0, (asleep - 180) / 240)
      : Math.max(0.8, 1 - (asleep - 540) / 600); // long lie-ins get a mild trim
  if (r.sleepStaged && r.sleepDeepMin != null) {
    const deepS = Math.max(0, Math.min(1, ((r.sleepDeepMin || 0) / asleep) / 0.16));
    const remS = Math.max(0, Math.min(1, ((r.sleepRemMin || 0) / asleep) / 0.22));
    const eff = asleep / (asleep + (r.sleepAwakeMin || 0));
    const effS = Math.max(0, Math.min(1, (eff - 0.75) / 0.20));
    return Math.round(100 * (0.55 * durFrac + 0.18 * deepS + 0.17 * remS + 0.10 * effS));
  }
  return Math.round(Math.max(40, Math.min(95, durFrac * 95)));
}

// Daily readiness: blend resting HR + HRV + sleep vs their baselines into a 0-100
// score. Returns null if there's no heart data to read.
function readinessScore(days) {
  const col = k => days.map(d => d[k]).filter(v => v != null && v > 0);
  const rhrs = col('restingHr'), hrvs = col('hrv'), sleeps = col('sleepHours');
  if (!rhrs.length && !hrvs.length) return null;
  const last = a => a.length ? a[a.length - 1] : null;
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  let score = 72;
  const rhrL = last(rhrs), rhrB = mean(rhrs);
  if (rhrL != null) score += Math.max(-16, Math.min(14, (rhrB - rhrL) * 2.5)); // lower resting HR = better
  const hrvL = last(hrvs), hrvB = mean(hrvs);
  if (hrvL != null) score += Math.max(-15, Math.min(15, (hrvL - hrvB) * 0.6));   // higher HRV = better
  // Sleep: prefer the richer sleep score (stages) when we have it; fall back to
  // raw hours otherwise. `sl` is the most recent day carrying any sleep data.
  const slDays = days.filter(d => (d.sleepMin != null && d.sleepMin > 0) || (d.sleepHours != null && d.sleepHours > 0));
  const sl = slDays.length ? slDays[slDays.length - 1] : null;
  const slScore = sl ? sleepScore(sl) : null;
  const slHours = sl ? (sl.sleepMin != null ? sl.sleepMin / 60 : sl.sleepHours) : last(sleeps);
  if (slScore != null) score += Math.max(-15, Math.min(13, (slScore - 65) * 0.4));
  else if (slHours != null) score += Math.max(-14, Math.min(12, (slHours - 7) * 6));
  return {
    score: Math.round(Math.max(5, Math.min(99, score))),
    rhrL, rhrB, hrvL, hrvB,
    // slDate: WHICH night slL/slScore actually came from. `sl` is the most recent
    // day in the window that has any sleep, which is not necessarily last night,
    // and the tile used to render it undated. So a stale entry looked exactly
    // like a fresh watch read, which hid a broken auto-read for days.
    slL: slHours, slScore, slDate: sl ? sl.date : null, slStaged: sl ? !!sl.sleepStaged : false,
    slDeep: sl ? sl.sleepDeepMin : null, slRem: sl ? sl.sleepRemMin : null,
    slCore: sl ? sl.sleepCoreMin : null, slAwake: sl ? sl.sleepAwakeMin : null,
    slAuto: sl ? !!sl.sleepAuto : false,
  };
}

function readinessHtml(r) {
  const s = r.score;
  const band = s >= 80 ? { lab: 'PRIMED TO TRAIN', sub: 'Recovered and rested. Good day to push in the Pit or a long walk.', col: '#a5e847' }
    : s >= 62 ? { lab: 'READY', sub: 'In good shape. Train as normal today.', col: '#a5e847' }
    : s >= 45 ? { lab: 'STEADY', sub: 'A middling read. Warm up and see how you feel.', col: '#5fe6d0' }
    : { lab: 'EASE IN', sub: 'Still recovering. Keep it lighter today.', col: '#ffc961' };
  const cx = 135, cy = 135, R = 104, start = 135, sweep = 270, N = 44;
  let ticks = '';
  for (let i = 0; i <= N; i++) { const a = (start + sweep * i / N) * Math.PI / 180, r1 = (i % 5 === 0) ? R + 12 : R + 8, r2 = R + 15; ticks += `<line x1="${(cx + Math.cos(a) * r1).toFixed(1)}" y1="${(cy + Math.sin(a) * r1).toFixed(1)}" x2="${(cx + Math.cos(a) * r2).toFixed(1)}" y2="${(cy + Math.sin(a) * r2).toFixed(1)}"/>`; }
  const capA = (start + sweep * s / 100) * Math.PI / 180;
  const capX = (cx + Math.cos(capA) * R).toFixed(1), capY = (cy + Math.sin(capA) * R).toFixed(1);
  const arrow = (v, goodLow) => v == null ? '' : (goodLow
    ? (v < 0 ? `<i class="up">${ICONS.down(10)}${Math.abs(Math.round(v))}</i>` : v > 0 ? `<i class="warn">${ICONS.up(10)}${Math.round(v)}</i>` : '')
    : (v > 0 ? `<i class="up">${ICONS.up(10)}${Math.round(v)}</i>` : v < 0 ? `<i class="warn">${ICONS.down(10)}${Math.abs(Math.round(v))}</i>` : ''));
  const tile = (mk, lab, val, unit, tr) => `<button class="rd-tile${mk ? '' : ' static'}"${mk ? ` data-metric="${mk}"` : ''}><span class="rl">${lab}</span><span class="rv">${val}<small>${unit}</small></span>${tr}</button>`;
  const hm = h => `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  // Sleep tile: when the watch gave us a score, that's the headline (Tom wanted
  // the sleep score shown) with hours beneath, and it's tappable for the stage
  // breakdown. A manual hours-only entry just shows the hours.
  // A score means "last night". If the newest sleep on record is from an earlier
  // night, say which night instead of passing it off as last night's.
  const slStale = !!(r.slDate && r.slDate !== dateKey());
  const sleepTile = (r.slScore != null && !slStale)
    ? `<button class="rd-tile" data-sleepdetail="1"><span class="rl">Sleep score</span><span class="rv">${r.slScore}</span>${r.slL != null ? `<i>${hm(r.slL)}</i>` : ''}</button>`
    : r.slL != null
      ? `<button class="rd-tile" data-sleepdetail="1"><span class="rl">Sleep${slStale ? ` · ${r.slDate.slice(5)}` : ''}</span><span class="rv">${hm(r.slL)}</span>${slStale ? '<i class="warn">not last night</i>' : ''}</button>`
      : `<button class="rd-tile static"><span class="rl">Sleep</span><span class="rv">&mdash;</span></button>`;
  const tiles = [
    r.rhrL != null ? tile('restingHr', 'Resting HR', Math.round(r.rhrL), 'bpm', arrow(r.rhrL - r.rhrB, true)) : '',
    r.hrvL != null ? tile('hrv', 'HRV', Math.round(r.hrvL), 'ms', arrow(r.hrvL - r.hrvB, false)) : '',
    sleepTile,
  ].filter(Boolean).join('');
  return `<div class="card rd-card">
    <div class="rd-eyebrow">DAILY READINESS</div>
    <div class="rd-gauge-wrap">
      <svg class="rd-gauge" viewBox="0 0 270 270" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="rdg" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#5fe6d0"/><stop offset="55%" stop-color="${band.col}"/><stop offset="100%" stop-color="#d6ff6b"/></linearGradient>
          <filter id="rdglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <g stroke="var(--text-2)" stroke-opacity="0.16" stroke-width="2">${ticks}</g>
        <path d="M 56.5 203.5 A 104 104 0 1 1 213.5 203.5" fill="none" stroke="#1e2230" stroke-width="14" stroke-linecap="round"/>
        <path d="M 56.5 203.5 A 104 104 0 1 1 213.5 203.5" fill="none" stroke="url(#rdg)" stroke-width="14" stroke-linecap="round" pathLength="100" stroke-dasharray="${s} 100" filter="url(#rdglow)"/>
        <circle r="7" cx="${capX}" cy="${capY}" fill="#d6ff6b" filter="url(#rdglow)"/>
      </svg>
      <div class="rd-center"><span class="rd-score">${s}</span><span class="rd-of">/ 100</span></div>
    </div>
    <div class="rd-status" style="color:${band.col}">${band.lab}</div>
    <p class="rd-sub">${band.sub}</p>
    <div class="rd-tiles">${tiles}</div>
  </div>`;
}

// Last night's sleep, broken into stages, as a bottom sheet. Opened from the
// readiness Sleep tile. Honest about what it is: the score is our own read of
// the watch's stage data (Apple gives no sleep-score API), and manual entries
// have hours but no stages.
async function openSleepDetail() {
  const health = await db.all('health');
  const withSleep = health.filter(h => h.sleepMin != null && h.sleepMin > 0).sort((a, b) => a.date.localeCompare(b.date));
  const r = withSleep.length ? withSleep[withSleep.length - 1] : null;
  if (!r) { toast('No sleep recorded yet.', 2200); return; }
  const sc = sleepScore(r);
  const hm = m => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;
  const asleep = r.sleepMin;
  const stages = [
    { k: 'Deep', m: r.sleepDeepMin || 0, col: '#7b6cff' },
    { k: 'REM', m: r.sleepRemMin || 0, col: '#5fe6d0' },
    { k: 'Core', m: r.sleepCoreMin || 0, col: '#7cc4ff' },
    { k: 'Awake', m: r.sleepAwakeMin || 0, col: 'var(--gold)' },
  ];
  const tot = stages.reduce((a, s) => a + s.m, 0) || asleep;
  const staged = r.sleepStaged && (r.sleepDeepMin != null || r.sleepRemMin != null);
  const bar = staged
    ? `<div class="sleep-bar">${stages.filter(s => s.m > 0).map(s => `<i style="flex:${s.m};background:${s.col}"></i>`).join('')}</div>
       <div class="sleep-legend">${stages.filter(s => s.m > 0).map(s => `<div class="sl-row"><span class="sl-dot" style="background:${s.col}"></span><span class="sl-k">${s.k}</span><span class="sl-m">${hm(s.m)}</span><span class="sl-p">${Math.round(s.m / tot * 100)}%</span></div>`).join('')}</div>`
    : `<p class="note" style="margin:10px 0 0">Stage breakdown (deep / REM / core) needs an Apple Watch worn to bed. ${r.sleepAuto ? 'Your watch logged the hours but not the stages last night.' : 'This night was logged by hand.'}</p>`;
  const bandCol = sc >= 80 ? 'var(--accent)' : sc >= 60 ? '#5fe6d0' : 'var(--gold)';
  const when = r.date === dateKey() ? 'Last night' : `Night of ${r.date}`;
  const html = `<button class="sheet-close" style="position:absolute;top:12px;right:14px;z-index:2">Close</button>
    <div class="trend-scroll">
      <h2 style="margin:2px 40px 6px 0;font-size:19px">Sleep</h2>
      <div class="sleep-top">
        <div class="sleep-score" style="color:${bandCol}">${sc}<small>/100</small></div>
        <div class="sleep-meta"><b>${hm(asleep)} asleep</b><span>${when}${r.sleepAuto ? ' · auto from your watch' : ''}</span></div>
      </div>
      ${bar}
      <p class="note" style="margin:14px 2px 2px">Your sleep score is Boneheadz's own read of ${staged ? 'how long and how well you slept (duration, deep, REM and how settled the night was)' : 'how long you slept'}. It feeds your daily readiness up top. Apple doesn't hand apps a sleep number, so this is our take on the same data your watch records.</p>
    </div>`;
  openSheet(html, { cls: 'sheet-trend' });
}

function activityRecoveryHtml(days) {
  const has = k => days.some(d => d[k] != null && d[k] > 0);
  const hasHeart = has('restingHr') || has('hrv');
  const hasActive = has('activeKcal') || has('exerciseMin') || days.some(d => d.workouts > 0);
  const hasSteps = has('steps');
  if (!hasHeart && !hasActive && !hasSteps) {
    // NEVER vanish. With no synced data, show a visible connect/sync state so the
    // section is discoverable for everyone and gives a path to fix a dead sync.
    const connected = !!S.settings.hkConnected;
    const line = connected
      ? 'No activity synced in the last little while. Tap Sync now, or take a walk and reopen the app, and your steps, workouts and heart data land here with full history.'
      : 'Connect Apple Health and your steps, workouts, active energy and heart data show up here, with day / week / month / year history.';
    const btn = connected
      ? (isNative() ? '<button class="btn small" id="trendSync">Sync now</button>' : '')
      : '<button class="btn small" id="trendConnect">Connect Apple Health</button>';
    return `<div class="card trend-hero"><div class="card-title">ACTIVITY &amp; RECOVERY</div>
      <p class="note" style="margin:2px 0 13px;line-height:1.55">${line}</p>${btn}</div>`;
  }

  // Your real workout mix (weekly, not daily tiles) — kept as its own card.
  const mix = (() => {
    const counts = {};
    for (const d of days) for (const t of (d.wtypes || [])) counts[t] = (counts[t] || 0) + 1;
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!rows.length) return '';
    const max = rows[0][1];
    return `<div class="card"><div class="card-title">YOUR ACTIVITIES · LAST 8 WEEKS</div>${rows.map(([t, c]) => `<div class="mix-row"><span class="mix-lab">${WORKOUT_LABEL[t] || t}</span><div class="mix-bar"><i style="width:${Math.round(c / max * 100)}%"></i></div><span class="mix-n">${c}</span></div>`).join('')}<p class="note" style="margin-top:9px">Your real workout mix, straight from your watch. New activities show up here on their own.</p></div>`;
  })();

  // With heart data, lead with the futuristic readiness dashboard.
  const r = readinessScore(days);
  if (r) return readinessHtml(r) + mix;

  // Activity but no heart data yet: a light card + an on-screen way to turn heart on.
  const heartPrompt = isNative()
    ? `<div class="heart-cta"><div class="hc-txt"><b>Add heart &amp; recovery</b><span>Allow Heart Rate &amp; HRV to unlock your daily readiness score here.</span></div><button class="btn small" id="trendHeartAuth">Turn on</button></div>`
    : '';
  return `<div class="card trend-hero"><div class="card-title">ACTIVITY</div>${heartPrompt}<p class="note" style="margin-top:${heartPrompt ? '12' : '2'}px">Your steps and workouts are tracked below. Connect a watch (Heart Rate + HRV) to unlock a daily readiness score up here.</p></div>${mix}`;
}

// Hard refresh: drop the service worker + all caches and reload, so a stale
// client actually pulls the newest build. Shared by Settings and the Trends banner.
async function hardRefresh() {
  toast('Getting the latest build...', 2200);
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch { /* best effort */ }
  setTimeout(() => location.reload(true), 500);
}

// Ask the network (not the SW cache) what the latest shipped build is, and show a
// "Get latest" banner at the top of Progress when this client is behind. It hides
// itself the moment the running build matches, so it only nags when truly stale.
async function checkForUpdate(el) {
  try {
    const res = await fetch('sw.js?cb=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const m = (await res.text()).match(/tally-v(\d+)/);
    if (!m) return;
    const latest = +m[1];
    const running = parseInt(String(APP_BUILD).replace(/\D/g, ''), 10) || 0;
    if (latest <= running) return; // up to date -> no banner
    const b = $('#updBanner', el);
    if (!b) return;
    b.innerHTML = `<button class="upd-banner" id="updBannerBtn">
      <span class="ub-txt"><b>Update available</b><span>New features are ready. You're on ${esc(APP_BUILD)}; v${latest} is live.</span></span>
      <span class="ub-cta">Get latest</span></button>`;
    $('#updBannerBtn', el)?.addEventListener('click', hardRefresh);
  } catch { /* offline / blocked: just skip the banner */ }
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

/* ================= social: name builder + friends ================= */

function parseDisplayName(name) {
  if (!name) return null;
  const parts = String(name).trim().split(/\s+/);
  const adj = NAME_ADJ.indexOf(parts[0]);
  const noun = NAME_NOUN.indexOf(parts[1]);
  if (adj < 0 || noun < 0) return null;
  const num = parts[2] && parts[2][0] === '#' ? parseInt(parts[2].slice(1), 10) : null;
  return { adj, noun, num: Number.isInteger(num) ? num : null };
}

async function openNameBuilder(after) {
  const me = await social.socialMe();
  // the pick made at onboarding seeds the first real (server) name
  let sel = parseDisplayName(me && me.name) || (await kvGet('onbName', null)) || randomName();
  const chipRow = (list) => list.map((w, i) => `<button class="nb-chip chip" data-i="${i}">${esc(w)}</button>`).join('');
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Your Bonehead name</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <p class="note" style="margin:0 0 12px">This is how the Crew sees you. Build it from the bone pile: no typing, so there's nothing to moderate and nothing rude gets through.</p>
      <div class="nb-preview" id="nbPreview"></div>
      <button class="btn ghost nb-shuffle" id="nbShuffle">Shuffle</button>
      <div class="nb-group"><div class="nb-lab">First</div><div class="nb-chips" id="nbAdj">${chipRow(NAME_ADJ)}</div></div>
      <div class="nb-group"><div class="nb-lab">Last</div><div class="nb-chips" id="nbNoun">${chipRow(NAME_NOUN)}</div></div>
      <div class="nb-numrow">
        <label class="nb-numtog"><input type="checkbox" id="nbNumOn"> Lucky number</label>
        <input id="nbNumVal" class="nb-numinput" type="text" inputmode="numeric" maxlength="3" placeholder="0-999" hidden>
      </div>
      <button class="btn primary nb-save" id="nbSave">Save name</button>
    </div>
  `, { cls: 'sheet-namebuild', onClose: after });

  const paint = () => {
    $('#nbPreview', wrap).textContent = buildDisplayName(sel.adj, sel.noun, sel.num) || '—';
    $$('#nbAdj .nb-chip', wrap).forEach((c, i) => c.classList.toggle('on', i === sel.adj));
    $$('#nbNoun .nb-chip', wrap).forEach((c, i) => c.classList.toggle('on', i === sel.noun));
    const numOn = sel.num != null;
    $('#nbNumOn', wrap).checked = numOn;
    const nv = $('#nbNumVal', wrap); nv.hidden = !numOn;
    // don't stomp what the user is mid-typing
    if (numOn && document.activeElement !== nv) nv.value = String(sel.num);
    // keep the picked chips in view
    $('#nbAdj .nb-chip.on', wrap)?.scrollIntoView({ block: 'nearest', inline: 'center' });
    $('#nbNoun .nb-chip.on', wrap)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  };

  $('#nbAdj', wrap).addEventListener('click', e => { const c = e.target.closest('.nb-chip'); if (c) { sel.adj = +c.dataset.i; paint(); } });
  $('#nbNoun', wrap).addEventListener('click', e => { const c = e.target.closest('.nb-chip'); if (c) { sel.noun = +c.dataset.i; paint(); } });
  $('#nbShuffle', wrap).addEventListener('click', () => { sel = randomName(); popSound(S.sounds); paint(); });
  $('#nbNumOn', wrap).addEventListener('change', e => {
    sel.num = e.target.checked ? (Number.isInteger(sel.num) ? sel.num : 7) : null;
    paint();
    if (e.target.checked) { const nv = $('#nbNumVal', wrap); nv.focus(); nv.select(); }
  });
  $('#nbNumVal', wrap).addEventListener('input', e => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
    e.target.value = digits;
    sel.num = digits === '' ? null : parseInt(digits, 10);
    // live-update the preview without repainting the field (keeps the caret)
    $('#nbPreview', wrap).textContent = buildDisplayName(sel.adj, sel.noun, sel.num) || '—';
  });
  $('#nbNumVal', wrap).addEventListener('blur', e => { if (!e.target.value) { sel.num = null; paint(); } });
  $('#nbSave', wrap).addEventListener('click', async () => {
    const btn = $('#nbSave', wrap); btn.disabled = true; btn.textContent = 'Saving...';
    const r = await social.setName(sel.adj, sel.noun, sel.num);
    if (!r.ok) { btn.disabled = false; btn.textContent = 'Save name'; toast('Could not save your name. Try again in a bit.'); return; }
    social.syncProfile(await socialSnapshot(), APP_SOCIAL_V).catch(() => {});
    confettiRain(40); chimeSound(S.sounds);
    toast(`You're now ${r.name}!`, 3000);
    history.back(); // closes sheet -> onClose(after) refreshes settings
  });
  paint();
}

// Preset cheers: fixed emoji + phrase (the INDEX is the wire format; the server
// only stores/validates the index, so there's no free text = nothing to
// moderate, same stance as the name builder).
const CHEERS = [
  { emo: '💀', txt: 'GG!' },
  { emo: '🔥', txt: 'Nice gains!' },
  { emo: '💪', txt: "Let's train!" },
  { emo: '👑', txt: "You're crushing it!" },
  { emo: '⚡', txt: 'Boneyard run?' },
  { emo: '🦴', txt: 'Feed the bones!' },
  { emo: '🎯', txt: 'Beat my score!' },
  { emo: '😤', txt: 'Rematch in the Pit!' },
  { emo: '🥩', txt: 'Eat up, champ!' },
  { emo: '🤝', txt: 'Welcome to the Crew!' },
  { emo: '🎉', txt: 'Level up!' },
  { emo: '🫡', txt: 'Respect.' },
];

function friendRowAvatar(f) {
  const eq = (f.profile && f.profile.outfit) || { B: 'B0-1', SK: 'SK0-1' };
  return `<div class="fl-av">${avatarLayersHtml(eq, { noYard: true, skip: ['BG'] })}</div>`;
}

// Big, collectible-feeling card for an accepted friend: their Bonehead posed on
// a stage with their pet peeking in, name, class, and quick stat chips.
function friendCardHtml(f) {
  const p = f.profile || {};
  const eq = p.outfit || { B: 'B0-1', SK: 'SK0-1' };
  const pet = p.pet && p.pet.id ? `<div class="fc-pet">${petPortraitHtml(p.pet.id, 40, !!p.pet.shiny, { mass: true })}</div>` : '';
  const chips = [];
  if (p.level) chips.push(`<span class="fc-chip lvl">Lv ${p.level}</span>`);
  if (p.badges) chips.push(`<span class="fc-chip">${bhIcon('badge-trophy', 13)} ${p.badges}</span>`);
  if (p.gear && p.gear.length) chips.push(`<span class="fc-chip">${p.gear.length} gear</span>`);
  if (p.pet) chips.push(`<span class="fc-chip">${bhIcon('egg', 12)} Lv ${p.pet.level}</span>`);
  const ol = onlineLabel(f.lastSeen);
  return `<button class="fc-card tap" data-view="${esc(f.playerId)}">
    <div class="fc-stage">${eq.BG && BH_BY_ID[eq.BG] ? `<img class="fc-backdrop" src="${bhAsset(BH_BY_ID[eq.BG])}" alt="">` : ''}${avatarLayersHtml(eq, { noYard: true, skip: ['BG', 'C'] })}${pet}${ol.on ? '<span class="fc-online" title="Online now"></span>' : ''}</div>
    <div class="fc-body">
      <div class="fc-name">${esc(f.alias || f.name)}${ol.text ? ` <span class="fc-seen ${ol.on ? 'on' : ''}">${ol.on ? '<i class="live-dot"></i> online' : ol.text}</span>` : ''}</div>
      <div class="fc-class">${p.level ? esc(p.levelName || 'Bonehead') : 'New Bonehead'}${f.alias ? ` · ${esc(f.name)}` : ''}</div>
      <div class="fc-chips">${chips.join('') || '<span class="fc-chip">Tap to view</span>'}</div>
    </div>
    <span class="crew-chev">›</span>
  </button>`;
}

function friendsListHtml(data) {
  const { friends, incoming, outgoing } = data;
  if (!friends.length && !incoming.length && !outgoing.length) {
    return `<div class="friends-empty">
      <p class="fe-title">No Crew yet</p>
      <p class="note">Send a friend your code, or type theirs in above. Once you've added each other you'll see their Bonehead, gear and badges right here, and you can send gifts and cheers.</p>
    </div>`;
  }
  let h = '';
  if (incoming.length) h += `<div class="fl-sect"><div class="fl-h">Wants to be friends</div>${incoming.map(f => `
    <div class="fl-row">
      ${friendRowAvatar(f)}
      <div class="fl-main"><b>${esc(f.alias || f.name)}</b><span>${f.profile ? 'Lv ' + f.profile.level : 'New Bonehead'}</span></div>
      <div class="fl-actions"><button class="btn small" data-accept="${esc(f.playerId)}">Accept</button><button class="btn small ghost" data-remove="${esc(f.playerId)}">Ignore</button></div>
    </div>`).join('')}</div>`;
  if (friends.length) h += `<div class="fl-sect"><div class="fl-h">Your Crew · ${friends.length}</div><div class="fc-grid">${friends.map(friendCardHtml).join('')}</div></div>`;
  if (outgoing.length) h += `<div class="fl-sect"><div class="fl-h">Pending</div>${outgoing.map(f => `
    <div class="fl-row">
      ${friendRowAvatar(f)}
      <div class="fl-main"><b>${esc(f.alias || f.name)}</b><span>Waiting for them to add you back</span></div>
      <button class="btn small ghost" data-remove="${esc(f.playerId)}">Cancel</button>
    </div>`).join('')}</div>`;
  return h;
}

// The Crew tab (full screen). Not online yet -> a Go Online prompt; online ->
// your friend code up top (share + copy), an add-a-friend field, and your list.
async function renderFriends(el) {
  const apiConfigured = !!(await social.apiBase());
  const me = apiConfigured ? await social.socialMe() : null;
  const clUnseen = changelogUnseen(await kvGet('changelogSeen', 0));
  const whatsNewCard = `
    <button class="card crew-friends" id="crewWhatsNew" style="margin-bottom:12px">
      <span>What's New${clUnseen ? ` <i class="q-badge">${clUnseen}</i>` : ''}</span>
      <span class="crew-friends-r"><span style="color:var(--text-3);font-size:12.5px">See recent updates</span><span class="crew-chev">›</span></span>
    </button>`;

  if (!me) {
    el.innerHTML = `
      <h1 class="page-h1">The Crew</h1>
      ${whatsNewCard}
      <div class="card">
        <p class="note" style="margin:0 0 12px">Go online to get your friend code and build your Crew. Your whole save backs up too, end-to-end <b>encrypted</b> so only your phone can read it.</p>
        <button class="btn" id="crewGoOnline">Go Online</button>
      </div>`;
    $('#crewWhatsNew', el)?.addEventListener('click', openWhatsNew);
    $('#crewGoOnline', el)?.addEventListener('click', async () => {
      const btn = $('#crewGoOnline', el); btn.disabled = true; btn.textContent = 'Connecting...';
      const r = await social.goOnline();
      if (!r.ok) { btn.disabled = false; btn.textContent = 'Go Online'; toast('Could not connect. Try again in a bit.'); return; }
      trackEvent('go_online');
      confettiRain(60); levelSound(S.sounds);
      await social.syncProfile(await socialSnapshot(), APP_SOCIAL_V).catch(() => {});
      await social.pushBackup(APP_SOCIAL_V).catch(() => {});
      toast("You're online! Here's your friend code.", 3600);
      renderFriends(el);
      if (!(await social.socialMe())?.name) { await kvSet('namePrompted', true); setTimeout(() => openNameBuilder(() => renderFriends(el)), 500); }
    });
    return;
  }

  const dispName = me.name || me.handle;
  el.innerHTML = `
    <h1 class="page-h1">The Crew<span class="sub">You're <b>${esc(dispName)}</b> · <button class="link" id="crewEditName">${me.name ? 'change name' : 'pick a name'}</button></span></h1>

    <!-- ORDER MATTERS HERE. Tom, 2026-08-08: "the crew tab is still fucked up as
         a hierarchy. you go there and all you see is a code and text... you need
         to rejig it so when you go there youre immediately greeted with the
         leader board. the tab feels like homework right now."
         So: the standings first (the reason to come here), then your Crew, then
         what arrived, then people to add. Your own friend code is REFERENCE, not
         a greeting, so it moves to the bottom where you go looking for it. -->
    <button class="card lb-open" id="crewLeaderboard">
      <div class="card-title">LEADERBOARD</div>
      <!-- never greet the tab with an empty box: this card is the FIRST thing on
           the screen now, so it says something before the fetch lands and says
           something honest if the fetch never does -->
      <div class="lb-podium" id="lbPodium" hidden></div>
      <div class="lb-youare" id="lbYouAre" hidden></div>
      <div class="lb-wait" id="lbWait">Counting the Boneheadz... <span class="spin"></span></div>
      <p class="note" style="margin:8px 0 0">Every Bonehead ranked by level. Tap anyone to see their fit, gear and badges.</p>
      <span class="ul-chev">›</span>
    </button>

    <!-- THE WEEKLY RACE. Above your Crew because it is the thing with a clock on
         it: a standing you can still change this week beats a list that will look
         the same tomorrow. -->
    <details class="glutton-banner race-banner" id="raceCard" hidden></details>

    <div class="card">
      <div class="card-title">YOUR CREW</div>
      <div id="friendsList"><div class="friends-loading">Loading your Crew...</div></div>
      <div class="friends-add" style="margin-top:12px">
        <input id="friendCode" type="text" placeholder="Enter a friend's code" autocapitalize="characters" autocomplete="off" spellcheck="false">
        <button class="btn small" id="friendAddBtn">Add</button>
      </div>
    </div>

    <div class="card" id="deliveriesCard" hidden>
      <div class="card-title">DELIVERIES</div>
      <p class="note" style="margin:0 0 10px">Miss the popup and the gift still lands here. Nothing to claim: it is already yours.</p>
      <div id="deliveriesList"></div>
    </div>

    <div class="card" id="newcomersCard" hidden>
      <div class="card-title">WORTH ADDING</div>
      <p class="note" style="margin:0 0 10px">Boneheadz who are actually playing and are not in your Crew yet.</p>
      <div id="newcomersList"></div>
    </div>

    ${whatsNewCard}

    <div class="card">
      <div class="card-title">YOUR FRIEND CODE</div>
      <p class="note" style="margin:0 0 12px">Share this with a friend. When they type it in, you're Crew, and you'll see each other's Bonehead, gear and badges.</p>
      <div class="crew-code-big" id="crewCodeBig">${esc(me.friendCode)}</div>
      <div class="crew-code-btns">
        <button class="btn small" id="crewShare">Share my code</button>
        <button class="btn small ghost" id="crewCopy">Copy</button>
      </div>
    </div>`;

  // Deliveries: read the ledger, mark them seen, then drop the badge. Opening
  // the tab IS the read receipt, which is the whole point of the inbox.
  const paintDeliveries = async () => {
    const rows = await crewDeliveries();
    const card = $('#deliveriesCard', el), list = $('#deliveriesList', el);
    if (!card || !list) return;
    if (!rows.length) { card.hidden = true; return; }
    const seen = await deliverySeenTs();
    const isNew = r => (r.ts || 0) > seen;
    /* Show what is actually news, not the archive. Tom, 2026-08-08: "the
       deliveries history of your gifts just spams the top of the crew tab it
       shouldn't be taking over the whole page it defeats the tab itself." So:
       anything unread, else the last few, and the rest behind one tap. */
    const fresh = rows.filter(isNew);
    const shown = fresh.length ? fresh : rows.slice(0, 3);
    const rowHtml = r => `
      <div class="t3-row${isNew(r) ? ' unread' : ''}">
        <span class="t3-med">${r.type === 'spire' ? bhIcon('tombstone', 20) : r.type === 'cheer' ? ICONS.bone(20) : ICONS.coin(20)}</span>
        <div class="t3-tx"><b>${esc(r.label)}</b><small>${esc(onlineLabel(r.ts).text || 'just now')}${r.xp ? ` · +${r.xp} XP` : ''}</small></div>
        ${isNew(r) ? '<span class="t3-lock" style="color:var(--coral);border-color:var(--coral)">NEW</span>' : ''}
      </div>`;
    const rest = rows.length - shown.length;
    list.innerHTML = shown.map(rowHtml).join('')
      + (rest > 0 ? `<button class="btn small ghost" id="deliveriesMore" style="width:100%;margin-top:8px">Show all ${rows.length}</button>` : '');
    $('#deliveriesMore', list)?.addEventListener('click', () => {
      list.innerHTML = rows.map(rowHtml).join('');
    });
    card.hidden = false;
    await kvSet('crewSeenTs', Date.now());
  };

  // The inbox is LOCAL data (the xp ledger), so it paints immediately and never
  // waits on the friends fetch: on a bad signal your gift history is still
  // there, which is the entire point of having an inbox.
  paintDeliveries();

  let data = { friends: [], incoming: [], outgoing: [] };
  const paint = async () => {
    data = await social.listFriends();
    const list = $('#friendsList', el);
    if (list) list.innerHTML = friendsListHtml(data);
    await setCrewBadgeFrom((data.incoming || []).length); // in sync after accept/decline/add
    // seeing the tab means these requests are no longer "new" for notifications
    await kvSet('knownIncoming', (data.incoming || []).map(f => f.playerId));
  };

  const submitCode = async () => {
    const inp = $('#friendCode', el);
    const code = (inp.value || '').toUpperCase().trim();
    if (!code) return;
    const btn = $('#friendAddBtn', el); btn.disabled = true; btn.textContent = '...';
    const r = await social.friendRequest(code);
    btn.disabled = false; btn.textContent = 'Add';
    if (!r.ok) { toast(r.error === 'that is your own code' ? "That's your own code!" : 'No Bonehead has that code. Double-check it.', 3200); return; }
    inp.value = '';
    if (r.status === 'accepted') { confettiRain(50); chimeSound(S.sounds); toast('Friend added! You two are in the Crew.', 3200); }
    else toast('Request sent. They just enter your code back to seal it.', 3600);
    await paint();
  };

  const shareCode = async () => {
    const text = `Add me on Boneheadz Gym! My friend code is ${me.friendCode}`;
    try { if (navigator.share) { await navigator.share({ title: 'Boneheadz Gym', text }); return; } } catch { return; /* user cancelled */ }
    try { await navigator.clipboard.writeText(me.friendCode); toast('Friend code copied. Send it to a friend!'); } catch { toast(me.friendCode, 4000); }
  };

  // The all-players leaderboard: ranked by level, one-tap add-friend on every
  // row (friend codes are share-keys; while the community is small, everyone
  // can find everyone). Adding someone who already requested you auto-accepts.
  // Every row shows the player's actual Bonehead — the customization IS the flex.
  let lbData = null; // one fetch shared by the podium tile + the full sheet
  const fetchLb = async () => (lbData || (lbData = await social.leaderboard()));
  // the Crew-tab tile: top-3 Boneheadz on a podium (center = #1, raised)
  const hydratePodium = async () => {
    const players = await fetchLb();
    const pod = $('#lbPodium', el);
    const wait = $('#lbWait', el);
    if (!pod || !pod.isConnected) return;
    if (!players || !players.length) {
      if (wait) wait.textContent = players ? 'No standings yet. Be the first name on the board.' : 'Could not reach the Crew server. Tap to try again.';
      return;
    }
    if (wait) wait.hidden = true;
    const top = players.slice(0, 3);
    const order = top.length === 3 ? [top[1], top[0], top[2]] : top; // silver, GOLD, bronze
    pod.innerHTML = order.map(p => {
      const rank = players.indexOf(p) + 1;
      return `<div class="lb-pod p${rank}">
        <span class="lb-medal">${rank === 1 ? '👑 1st' : rank === 2 ? '2nd' : '3rd'}</span>
        ${lbAvatar(p, 'lb-pod-av')}
        <b>${esc(p.name)}</b><small>Lv ${p.level}</small>
      </div>`;
    }).join('');
    pod.hidden = false;
    // WHERE YOU STAND. A podium of three strangers is somebody else's business;
    // your own rank is the reason to care about it.
    const meIdx = players.findIndex(p => p.you);
    const you = $('#lbYouAre', el);
    if (you && meIdx >= 0) {
      const ahead = meIdx > 0 ? players[meIdx - 1] : null;
      you.innerHTML = `<b>#${meIdx + 1}</b><span>of ${players.length}${ahead ? ` · ${esc(ahead.name)} is one rung up at Lv ${ahead.level}` : ' · nobody above you'}</span>`;
      you.hidden = false;
    }
  };
  const openLeaderboard = async () => {
    openSheet(`
      <div class="sheet-head"><h2>Leaderboard</h2><button class="sheet-close">Done</button></div>
      <div class="sheet-body" id="lbBody"><p class="note" style="text-align:center;padding:22px 0">Summoning the Boneheadz... <span class="spin"></span></p></div>
    `, { cls: 'full', name: 'Leaderboard' });
    const body = $('#lbBody');
    const players = await fetchLb();
    if (!body || !body.isConnected) return;
    if (!players) { body.innerHTML = '<p class="note" style="text-align:center;padding:22px 0">Could not reach the Crew server. Try again in a bit.</p>'; return; }
    const friendIds = new Set((data.friends || []).map(f => f.playerId));
    const outIds = new Set((data.outgoing || []).map(f => f.playerId));
    const inIds = new Set((data.incoming || []).map(f => f.playerId));
    body.innerHTML = `
      <p class="note" style="margin:0 0 10px">Every Bonehead in the game, ranked by level. Add anyone: they accept by adding you back.</p>
      ${players.map((p, i) => {
        const btn = p.you ? '<span class="lb-tag you">You</span>'
          : friendIds.has(p.playerId) ? `<span class="lb-tag crew">${ICONS.check(11)} Crew</span>`
          : outIds.has(p.playerId) ? '<span class="lb-tag sent">Sent</span>'
          : `<button class="btn small ${inIds.has(p.playerId) ? '' : 'ghost'}" data-lbadd="${esc(p.friendCode)}">${inIds.has(p.playerId) ? 'Accept' : '+ Add'}</button>`;
        const ol = onlineLabel(p.lastSeen);
        return `<div class="lb-row ${p.you ? 'me' : ''}" ${p.you ? '' : `data-lbview="${esc(p.playerId)}"`}>
          <span class="lb-rank r${i + 1}">${i + 1}</span>
          ${lbAvatar(p)}
          <div class="lb-who"><b>${esc(p.name)}</b><small>Level ${p.level}${p.levelName ? ' · ' + esc(p.levelName) : ''}${p.badges ? ` · ${p.badges} badges` : ''}${p.spires ? ` · <span class="lb-spires">${bhIcon('tombstone', 11)} ${p.spires} spire${p.spires === 1 ? '' : 's'}</span>` : ''}${ol.text ? ` · <span class="lb-seen ${ol.on ? 'on' : ''}">${ol.on ? '<i class="live-dot"></i> online' : ol.text}</span>` : ''}</small></div>
          ${btn}
        </div>`;
      }).join('')}`;
    /* Tapping a row opens their profile. The leaderboard payload already carries
       everything the profile sheet renders from (outfit, pet, level, badges), so
       this is a reader, not a new request. Friend-only actions are hidden for
       anyone who is not Crew; see openFriendProfile's `stranger` mode. */
    body.addEventListener('click', e => {
      if (e.target.closest('[data-lbadd]')) return;   // the Add button is its own action
      const row = e.target.closest('[data-lbview]');
      if (!row) return;
      const p = players.find(x => x.playerId === row.dataset.lbview);
      if (!p) return;
      openFriendProfile(
        { name: p.name, playerId: p.playerId, friendCode: p.friendCode, lastSeen: p.lastSeen,
          profile: { outfit: p.outfit, pet: p.pet, level: p.level, levelName: p.levelName, badges: p.badges } },
        null,
        { stranger: true, isCrew: friendIds.has(p.playerId), sent: outIds.has(p.playerId) });
    });
    $$('[data-lbadd]', body).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = '...';
      const r = await social.friendRequest(b.dataset.lbadd);
      if (!r.ok) { b.disabled = false; b.textContent = '+ Add'; toast('Could not send that request. Try again.', 2600); return; }
      if (r.status === 'accepted') { confettiRain(50); chimeSound(S.sounds); toast('Friend added! You two are in the Crew.', 3200); b.outerHTML = `<span class="lb-tag crew">${ICONS.check(11)} Crew</span>`; }
      else { popSound(S.sounds); toast('Request sent. They accept by adding you back.', 3200); b.outerHTML = '<span class="lb-tag sent">Sent</span>'; }
      await paint();
    }));
  };
  $('#crewLeaderboard', el)?.addEventListener('click', openLeaderboard);
  hydratePodium(); // fire-and-forget: fills the top-3 tile when the fetch lands

  /* THE WEEKLY STEP RACE. One row per racer, ordered, with YOUR row marked, and
     a countdown, because a race with no clock is just a list. Opening this tab
     is also what settles last week and pays its winner (see /steps/week). */
  /* THE STEP RACE, built to market-quality-mockups/race.html + race-open.html
     (Tom: "art is approved"). A <details> banner, the same pattern the Dark
     Spires and the Bone Garden already use, because the announcement fires once
     and the art needs a permanent home. The SUMMARY carries the only two facts
     that change behaviour: where you stand and how long is left.
     The board is a TRACK, not a table: the fill is each racer's distance
     relative to the leader and their own Bonehead is the marker, so the GAP is
     what you read and you can see whose head is in front of yours. */
  const hydrateRace = async () => {
    if (!RACE_LIVE) return;
    const myFit = await equipped();
    const wk = raceWeekKey(dateKey());
    const race = await social.fetchStepRace(wk);
    const card = $('#raceCard', el);
    if (!card || !card.isConnected || !race) return;
    const endsMs = Date.parse(wk + 'T00:00:00') + RACE_DAYS * 86400000;
    const daysLeft = Math.max(0, Math.ceil((endsMs - Date.now()) / 86400000));
    const clock = daysLeft <= 0 ? 'settles tonight' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
    const rows = race.players || [];
    const lead = rows.length ? rows[0].steps : 0;
    const mine = rows.find(p => p.you) || null;
    const behind = mine && lead > mine.steps ? lead - mine.steps : 0;

    // the one line the collapsed banner exists to show
    const standing = !rows.length ? 'Nobody has walked a step yet. Go take the lead.'
      : !mine ? `${esc(rows[0].name)} leads with ${rows[0].steps.toLocaleString()} steps`
      : behind ? `You are ${ordinal(race.yourRank)}, ${behind.toLocaleString()} behind ${esc(rows[0].name)}`
      : 'You are in front. Keep it that way.';

    const podium = race.podium || [];
    card.innerHTML = `
      <summary>
        <span class="race-art">${avatarLayersHtml(myFit, { noYard: true, skip: ['BG', 'C'] })}</span>
        <span class="gbn-ico race-ico">${bhIcon('badge-footprint', 21)}</span>
        <span class="gbn-txt"><i>The Step Race · ${clock}</i><b>${standing}</b></span>
        <span class="gbn-chev">›</span>
      </summary>
      <div class="gbn-body">
        ${race.champion ? `<div class="race-champ">${bhIcon('badge-trophy', 22)}
          <span>Last race <b>${esc(race.champion.name)}</b> took it with ${race.champion.steps.toLocaleString()} steps.</span></div>` : ''}
        ${rows.length ? `<div class="race-lanes">
          ${rows.map(p => {
            const pct = lead > 0 ? Math.max(6, Math.round(p.steps / lead * 100)) : 6;
            return `<div class="race-lane r${p.rank}${p.you ? ' you' : ''}">
              <span class="rk">${p.rank}</span>
              <div class="bd">
                <div class="nm"><b>${esc(p.name)}</b><span class="st">${p.steps.toLocaleString()}</span></div>
                <div class="track"><i style="width:${pct}%"></i>
                  <span class="run" style="left:${pct}%">${avatarLayersHtml(p.outfit || { B: 'B0-1', SK: 'SK0-1' }, { noYard: true, skip: ['BG', 'C'] })}</span>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>` : '<p class="note" style="margin:0">Nobody has walked a step yet this race. The top of this board is going spare.</p>'}
        ${behind ? `<div class="race-gap">You are <b>${behind.toLocaleString()} steps</b> off first. About <b>${Math.max(1, Math.round(behind / 5500 * 60))} minutes</b> of walking.</div>` : ''}
        ${podium.length ? `<div class="race-purse">
          <span class="lab">When it settles, the top ${podium.length} take</span>
          <div class="rows">
            ${podium.map((z, i) => `<div class="row p${i + 1}">
              <span class="pl">${esc(z.place)}</span>
              <span class="t3-price">${ICONS.coin(13)} ${z.coins.toLocaleString()}</span>
              ${z.crate ? `<span class="t3-price crate">${crateIcon(z.crate, 15)} ${z.crate === 'golden' ? 'Golden' : 'Crate'}</span>` : ''}
              ${z.dust ? `<span class="t3-price dust">${ICONS.dust(12)} ${z.dust}</span>` : ''}
            </div>`).join('')}
          </div>
        </div>` : ''}
        <p class="note" style="margin:10px 2px 0">Everyone playing is in it. Steps count from the day the race starts.</p>
      </div>`;
    card.hidden = false;
    composeAvatars(card);
  };
  hydrateRace();

  /* NEW BONEHEADZ. A public launch's first problem is that a new player opens
     the Crew tab and it is empty. This surfaces the people who joined this week
     from the same leaderboard fetch (no extra request), so there is always
     somebody to add. Add is the real action available: /gift is friends-only,
     so a "welcome gift" button would just 403. */
  const hydrateNewcomers = async () => {
    const players = await fetchLb();
    const card = $('#newcomersCard', el), list = $('#newcomersList', el);
    if (!card || !list || !card.isConnected || !players) return;
    const known = new Set([...(data.friends || []), ...(data.outgoing || [])].map(f => f.playerId));
    /* WORTH ADDING, not merely NEW.
       v281 showed "joined this week", which on a pre-launch community meant the
       card was hidden almost every week. v285 dropped the window entirely, and
       that surfaced the opposite problem: Tom, 2026-08-08, "the new player
       feature needs work and im pretty sure youre still adding ghost accounts
       because it's just showing bot lvl 1s in there."
       Registration has been gated to onboarding-completion since v279, so these
       are not phantom rows: they are real accounts that finished onboarding and
       never came back. Adding one gets you a Crew member who will never play.
       So the bar is EVIDENCE OF PLAY: past level 1, or seen in the last fortnight.
       Newest first among those who qualify. */
    const FORTNIGHT = 14 * 86400000;
    const playing = p => (p.level || 1) > 1 || (p.lastSeen && Date.now() - p.lastSeen < FORTNIGHT);
    const fresh = players
      .filter(p => !p.you && !known.has(p.playerId) && playing(p))
      .sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0))
      .slice(0, 5);
    if (!fresh.length) { card.hidden = true; return; }
    list.innerHTML = fresh.map(p => `
      <div class="t3-row">
        ${lbAvatar(p, 'lb-av')}
        <div class="t3-tx"><b>${esc(p.name)}</b><small>Level ${p.level}${p.badges ? ` · ${p.badges} badges` : ''} · ${esc(onlineLabel(p.lastSeen).text || 'online now')}</small></div>
        <button class="btn ghost" data-lbadd="${esc(p.friendCode)}">+ ADD</button>
      </div>`).join('');
    $$('[data-lbadd]', list).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = '...';
      const r = await social.friendRequest(b.dataset.lbadd);
      if (!r.ok) { b.disabled = false; b.textContent = '+ ADD'; toast('Could not send that request. Try again.', 2600); return; }
      if (r.status === 'accepted') { confettiRain(50); chimeSound(S.sounds); toast('Friend added! You two are in the Crew.', 3200); }
      else { popSound(S.sounds); toast('Request sent. They accept by adding you back.', 3200); }
      await paint();
      hydrateNewcomers();
    }));
    card.hidden = false;
  };
  $('#crewWhatsNew', el)?.addEventListener('click', openWhatsNew);
  $('#crewEditName', el)?.addEventListener('click', () => openNameBuilder(() => renderFriends(el)));
  $('#crewShare', el)?.addEventListener('click', shareCode);
  $('#crewCopy', el)?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(me.friendCode); toast('Friend code copied!'); } catch { toast(me.friendCode, 4000); } });
  $('#friendAddBtn', el).addEventListener('click', submitCode);
  $('#friendCode', el).addEventListener('keydown', e => { if (e.key === 'Enter') submitCode(); });
  $('#friendsList', el).addEventListener('click', async e => {
    const acc = e.target.closest('[data-accept]');
    const rem = e.target.closest('[data-remove]');
    const view = e.target.closest('[data-view]');
    if (acc) {
      acc.disabled = true;
      const ok = await social.acceptFriend(acc.dataset.accept);
      if (ok) { confettiRain(50); chimeSound(S.sounds); toast('Friend added!'); } else toast('Could not accept. Try again.');
      await paint();
    } else if (rem) {
      if (await social.removeFriend(rem.dataset.remove)) { toast('Removed.'); await paint(); }
    } else if (view) {
      const f = [...data.friends, ...data.incoming, ...data.outgoing].find(x => x.playerId === view.dataset.view);
      if (f) openFriendProfile(f, paint);
    }
  });

  await paint();
  hydrateNewcomers();   // needs `data` from paint(), so it runs after it
}

// Test hook (webdriver only), same pattern as __strikeFx / __bhFight. A friend
// profile needs a real friend on the server, so the pet-clipping bug in this
// sheet was only ever reproducible by hand on Tom's phone. Now it is measurable.
if (typeof window !== 'undefined' && navigator.webdriver) window.__openFriendProfile = (f, opts) => openFriendProfile(f, () => {}, opts || {});
/* opts.stranger: opened from the LEADERBOARD, where the player is not (yet) your
   Crew. Tom, 2026-08-08: "in the crew tab when i go into the leaderboard why
   cant i then click who's on it and see more about their profile". Same sheet,
   minus every action that needs a friendship (gift and cheer are friends-only on
   the server and would 403; nicknames and Remove are meaningless), plus the one
   action that IS available: adding them. */
function openFriendProfile(f, onChange, opts = {}) {
  const stranger = !!opts.stranger;
  const p = f.profile || {};
  const eq = p.outfit || { B: 'B0-1', SK: 'SK0-1' };
  const petName = p.pet ? ((BH_BY_ID[p.pet.id] || {}).name || 'Pet') : null;
  const statBars = p.stats ? STAT_META.map(m => {
    const v = p.stats[m.key] ?? 0;
    return `<div class="fps-row"><span class="fps-lab">${m.label}</span><div class="fps-bar"><i style="width:${Math.max(4, Math.min(100, v))}%"></i></div><span class="fps-val">${v}</span></div>`;
  }).join('') : '';
  const wrap = openSheet(`
    <div class="sheet-head"><h2 id="fpTitle">${esc(f.alias || f.name)}</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <div class="fp-hero${eq.BG && BH_BY_ID[eq.BG] ? ' framed' : ''}">
        ${eq.BG && BH_BY_ID[eq.BG] ? `<img class="fp-hero-backdrop" src="${bhAsset(BH_BY_ID[eq.BG])}" alt="">` : ''}
        <div class="bh-stage lg">${avatarLayersHtml(eq, { noYard: true, skip: ['BG', 'C'] })}</div>
        ${p.pet && p.pet.id ? `<div class="fp-pet">${petSpriteHtml(p.pet.id, 70, false, { mass: true, shiny: !!p.pet.shiny })}<span class="fp-pet-lvl">Lv ${p.pet.level}</span></div>` : ''}
        <div class="fp-lvlbadge">Lv ${p.level ?? '?'}</div>
      </div>
      <div class="fp-title"><div class="fp-class">${esc(p.levelName || 'Bonehead')}</div><div class="fp-real" id="fpReal"${f.alias ? '' : ' hidden'}>Bonehead name: ${esc(f.name)}</div></div>

      ${p.stats && p.outfit ? `<button class="btn fp-battle" id="fpBattle">${ICONS.pit(18)} Battle their bonehead</button>` : ''}
      ${stranger ? (opts.isCrew
        ? `<p class="note" style="text-align:center;margin:6px 0 0">Already in your Crew.</p>`
        : opts.sent
          ? `<p class="note" style="text-align:center;margin:6px 0 0">Request sent. They accept by adding you back.</p>`
          : `<button class="btn" id="fpAdd">+ Add to my Crew</button>`)
      : `<div class="fp-actions">
        <button class="btn ghost fp-gift" id="fpGift">${ICONS.coin(18)} Send a gift</button>
        <button class="btn ghost fp-cheer" id="fpCheer">📣 Cheer</button>
      </div>`}

      <div class="fp-facts">
        <div class="fp-fact"><b>${p.badges ?? 0}</b><span>Badges</span></div>
        <div class="fp-fact"><b>${p.gear ? p.gear.length : 0}</b><span>Gear</span></div>
        <div class="fp-fact"><b>${petName ? 'Lv ' + p.pet.level : '-'}</b><span>${petName ? esc(petName) : 'No pet'}</span></div>
      </div>

      ${statBars ? `<div class="fp-stats-h">Stats</div><div class="fp-statbars">${statBars}</div>` : '<p class="note" style="text-align:center">Their stats will show once they next open the app.</p>'}

      ${stranger ? '' : `<div class="fp-alias">
        <div class="nb-lab">Your nickname for them <span class="fp-alias-hint">only you see this</span></div>
        <div class="fp-alias-row">
          <input id="fpAlias" type="text" maxlength="24" placeholder="e.g. Coach Mike" value="${esc(f.alias || '')}">
          <button class="btn small" id="fpAliasSave">Save</button>
        </div>
      </div>`}
      <p class="note" style="text-align:center;margin-top:12px">Friend code <b>${esc(f.friendCode)}</b></p>
      ${stranger ? '' : '<button class="btn ghost danger fp-remove" id="fpRemove">Remove friend</button>'}
    </div>
  `, { cls: 'sheet-fp' });
  $('#fpGift', wrap)?.addEventListener('click', () => openGiftSheet(f));
  $('#fpCheer', wrap)?.addEventListener('click', () => openCheerSheet(f));
  $('#fpAdd', wrap)?.addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Sending...';
    const r = await social.friendRequest(f.friendCode);
    if (!r.ok) { b.disabled = false; b.textContent = '+ Add to my Crew'; toast('Could not send that request. Try again.', 2600); return; }
    if (r.status === 'accepted') { confettiRain(50); chimeSound(S.sounds); toast('Friend added! You two are in the Crew.', 3200); }
    else { popSound(S.sounds); toast('Request sent. They accept by adding you back.', 3200); }
    b.outerHTML = `<p class="note" style="text-align:center;margin:6px 0 0">${r.status === 'accepted' ? 'Already in your Crew.' : 'Request sent.'}</p>`;
    onChange && onChange();
  });
  $('#fpBattle', wrap)?.addEventListener('click', async () => {
    const fighter = await buildFighter();
    openFight(wrap, fighter, {
      mode: 'friend',
      friendId: f.playerId,
      name: f.alias || f.name,
      venue: `${esc(f.alias || f.name)}'s turf`,
      foeStats: p.stats,
      foeOutfit: p.outfit,
      weaponId: p.weapon || 'starter',
      talents: p.talents || [],
      aiLevel: Math.max(1, Math.min(6, 1 + Math.floor((p.level || 1) / 4))),
    });
  });
  $('#fpAliasSave', wrap)?.addEventListener('click', async () => {
    const clean = await social.setFriendAlias(f.playerId, $('#fpAlias', wrap).value);
    f.alias = clean || null;
    $('#fpTitle', wrap).textContent = clean || f.name;
    const real = $('#fpReal', wrap); real.hidden = !clean; real.textContent = 'Bonehead name: ' + f.name;
    $('#fpAlias', wrap).value = clean;
    popSound(S.sounds);
    toast(clean ? `Saved. You'll see them as "${clean}".` : 'Nickname cleared.');
    onChange && onChange();
  });
  $('#fpRemove', wrap)?.addEventListener('click', async () => {
    if (await social.removeFriend(f.playerId)) { toast('Removed.'); onChange && onChange(); history.back(); }
  });
}

function giftRewardLabel(reward) {
  if (!reward) return 'a gift';
  if (reward.crate === 'egg') return 'a Mystery Egg';
  if (reward.crate) return CRATES[reward.crate] ? CRATES[reward.crate].label : 'a crate';
  if (reward.consumable) return CONSUMABLES[reward.consumable] ? CONSUMABLES[reward.consumable].label : 'an item';
  if (reward.coins) return `${reward.coins} coins`;
  return 'a gift';
}

// Send-a-gift sheet: one free server-rolled gift/day, plus spend-your-own coins.
async function openGiftSheet(f) {
  const bal = await coins();
  const day = dateKey();
  const freeMap = (await kvGet('giftFreeSent', {})) || {};
  const alreadyFree = freeMap[f.playerId] === day;
  const amts = [25, 50, 100, 250, 500];
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Send a gift</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <p class="note" style="margin:0 0 14px">To <b>${esc(f.alias || f.name)}</b>. Gifts land in their Backpack the next time they open the app.</p>
      <div class="gift-free ${alreadyFree ? 'done' : ''}" id="giftFreeCard">
        <div class="gift-free-l"><div class="gift-free-t">${ICONS.coin(16)} Free daily gift</div><div class="note">A surprise drop: coins, a crate, sometimes an egg. Once a day per friend, on the house.</div></div>
        <button class="btn small" id="giftFree"${alreadyFree ? ' disabled' : ''}>${alreadyFree ? `Sent ${ICONS.check(11)}` : 'Send'}</button>
      </div>
      <div class="gift-spend">
        <div class="nb-lab">Or send your own coins <span class="fp-alias-hint" id="giftBal">you have ${bal}</span></div>
        <div class="gift-amts">${amts.map(a => `<button class="chip gift-amt" data-amt="${a}"${a > bal ? ' disabled' : ''}>${ICONS.coin(14)} ${a}</button>`).join('')}</div>
        <p class="note" style="margin:10px 2px 0">Up to 5 coin gifts per friend a day.</p>
      </div>
    </div>
  `, { cls: 'sheet-gift' });

  $('#giftFree', wrap).addEventListener('click', async () => {
    const btn = $('#giftFree', wrap); btn.disabled = true; btn.textContent = '...';
    const r = await social.sendGift(f.playerId, 'free');
    if (r.ok) {
      const fm = (await kvGet('giftFreeSent', {})) || {}; fm[f.playerId] = day; await kvSet('giftFreeSent', fm);
      $('#giftFreeCard', wrap).classList.add('done'); btn.textContent = 'Sent';
      confettiBurst(innerWidth / 2, innerHeight * 0.4, 20); coinSound(S.sounds);
      toast(`You sent ${esc(f.alias || f.name)} ${giftRewardLabel(r.reward)}!`, 3600);
    } else if (r.status === 409) {
      const fm = (await kvGet('giftFreeSent', {})) || {}; fm[f.playerId] = day; await kvSet('giftFreeSent', fm);
      $('#giftFreeCard', wrap).classList.add('done'); btn.textContent = 'Sent';
      toast(`You already sent ${esc(f.alias || f.name)} their free gift today.`, 3400);
    } else { btn.disabled = false; btn.textContent = 'Send'; toast('Could not send. Try again in a bit.'); }
  });

  $('.gift-amts', wrap).addEventListener('click', async e => {
    const b = e.target.closest('[data-amt]'); if (!b || b.disabled) return;
    const amt = +b.dataset.amt;
    const have = await coins();
    if (amt > have) { toast("You don't have that many coins."); return; }
    b.disabled = true;
    await coinsAdd(-amt); // deduct locally first; refund if the send fails
    const r = await social.sendGift(f.playerId, 'spend', amt);
    if (r.ok) {
      coinSound(S.sounds);
      toast(`You sent ${esc(f.alias || f.name)} ${amt} coins!`, 3400);
      const nb = await coins(); const bl = $('#giftBal', wrap); if (bl) bl.textContent = `you have ${nb}`;
      $$('.gift-amt', wrap).forEach(x => { x.disabled = (+x.dataset.amt) > nb; });
    } else {
      await coinsAdd(amt); // refund
      b.disabled = false;
      toast(r.status === 429 ? "That's the daily coin-gift limit for this friend." : 'Could not send. Your coins were not spent.', 3400);
    }
  });
}

// Send-a-cheer sheet: preset emoji + phrase, no free text.
function openCheerSheet(f) {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Send a cheer</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <p class="note" style="margin:0 0 14px">To <b>${esc(f.alias || f.name)}</b>. A quick shout, no typing.</p>
      <div class="cheer-grid">${CHEERS.map((c, i) => `<button class="cheer-chip" data-cheer="${i}"><span class="cheer-emo">${c.emo}</span><span class="cheer-txt">${esc(c.txt)}</span></button>`).join('')}</div>
    </div>
  `, { cls: 'sheet-cheer' });
  $('.cheer-grid', wrap).addEventListener('click', async e => {
    const b = e.target.closest('[data-cheer]'); if (!b) return;
    const i = +b.dataset.cheer;
    $$('.cheer-chip', wrap).forEach(x => x.disabled = true);
    const r = await social.sendCheer(f.playerId, i);
    if (r.ok) { popSound(S.sounds); toast(`Sent ${CHEERS[i].emo} "${CHEERS[i].txt}" to ${esc(f.alias || f.name)}!`, 3000); history.back(); }
    else { $$('.cheer-chip', wrap).forEach(x => x.disabled = false); toast(r.status === 429 ? "You've cheered them plenty today. Give 'em a rest!" : 'Could not send. Try again.', 3200); }
  });
}

// General tester feedback: a free-text note straight to the developer (reuses
// the same private /report channel as the map reports; kind='feedback', no
// coords). Not shown to other players. Surveys + identity opt-in come later.
function openFeedbackSheet() {
  openSheet(`
    <h2>Send feedback</h2>
    <p class="muted" style="margin:0 0 12px">What's fun, what's confusing, what you'd change. This goes straight to the developer, not to other players.</p>
    <textarea id="fbNote" rows="4" maxlength="280" placeholder="What's on your mind?" style="width:100%;box-sizing:border-box;resize:vertical"></textarea>
    <div class="row" style="gap:8px;margin-top:12px">
      <button class="btn ghost sheet-close" style="flex:0 0 auto">Cancel</button>
      <button class="btn" id="fbSend" style="flex:1">Send</button>
    </div>
    <p class="muted" id="fbStatus" style="font-size:12px;margin:10px 0 0"></p>
  `, { cls: 'sheet-report', name: 'feedback' });
  const btn = $('#fbSend'), st = $('#fbStatus');
  btn?.addEventListener('click', async () => {
    const note = ($('#fbNote')?.value || '').trim();
    if (!note) { if (st) st.textContent = 'Type something first.'; return; }
    btn.disabled = true; if (st) st.textContent = 'Sending...';
    const r = await sendReport('feedback', { note });
    trackEvent('feedback_send');
    if (r && r.ok) { if (st) st.textContent = 'Sent. Thanks — every note gets read. 💀'; btn.textContent = 'Sent'; setTimeout(closeTopSheet, 1400); }
    else { if (st) st.textContent = 'Could not send. Try again when you are online.'; btn.disabled = false; }
  });
}

// One-time founding-player survey. Prize-led: fill it out (name, email, what you
// think, the one thing that would make you play more) and you keep the exclusive
// amethyst Day One Lizard: a pet nobody can hatch or buy. Email is optional
// contact info with an explicit opt-in (declared in the store data-safety forms);
// the pet is granted LOCALLY on submit whether or not the network send succeeds,
// so being offline never costs you the reward. Never returns once submitted.
// the main features we want to know people are actually using (value -> label)
const SURVEY_FEATURES = [
  ['log', 'Logging food'],
  ['steps', 'Walking / steps'],
  ['pit', 'The Pit (fighting)'],
  ['boneyard', 'The Boneyard (map)'],
  ['pets', 'Pets & the Stable'],
  ['kitchen', 'The Kitchen (cooking)'],
  ['crew', 'The Crew (friends)'],
  ['quests', 'Quests & the wheel'],
];
function openSurveySheet(source = 'auto') {
  trackEvent('survey_open', { src: source });
  const lizard = animatedPetHtml('CX', 132) || '';
  const featChecks = SURVEY_FEATURES.map(([v, label]) =>
    `<label class="survey-feat"><input type="checkbox" value="${v}"> ${label}</label>`).join('');
  openSheet(`
    <div class="survey" id="surveyForm">
      <div class="survey-hero">
        <div class="survey-liz">${lizard}</div>
        <div class="survey-glow"></div>
      </div>
      <h2 class="survey-title">Claim the Day One Lizard</h2>
      <p class="survey-sub">You showed up early, and that means a lot. Tell us what you think and this <b>exclusive amethyst lizard</b> is yours to keep. No one can hatch or buy it. It only goes to the players who were here at the start.</p>
      <label class="survey-label" for="svName">Your name</label>
      <input id="svName" class="survey-in" type="text" maxlength="60" autocomplete="name" placeholder="What should we call you?">
      <label class="survey-label" for="svEmail">Email <span class="survey-opt">(optional)</span></label>
      <input id="svEmail" class="survey-in" type="email" maxlength="120" autocomplete="email" placeholder="you@example.com">
      <label class="survey-check"><input id="svOptin" type="checkbox"> Email me the occasional Boneheadz update</label>
      <label class="survey-label">Which parts are you actually using?</label>
      <div class="survey-feats" id="svFeats">${featChecks}</div>
      <label class="survey-label" for="svFeel">What do you think so far?</label>
      <textarea id="svFeel" class="survey-in" rows="3" maxlength="500" placeholder="What's fun, what's confusing, what you'd change..."></textarea>
      <label class="survey-label" for="svWant">The one thing that would make you play more?</label>
      <textarea id="svWant" class="survey-in" rows="2" maxlength="280" placeholder="If we built one thing next, it should be..."></textarea>
      <p class="survey-priv">Goes straight to the developers, never shared or shown to other players. <a href="privacy.html" target="_blank" rel="noopener">Privacy</a></p>
      <div class="row" style="gap:8px;margin-top:6px">
        <button class="btn ghost" id="svLater" style="flex:0 0 auto">Maybe later</button>
        <button class="btn" id="svSend" style="flex:1">Claim my lizard 💜</button>
      </div>
      <p class="muted" id="svStatus" style="font-size:12px;margin:10px 2px 0;text-align:center"></p>
    </div>
  `, { cls: 'sheet-survey', name: 'survey' });

  $('#svLater')?.addEventListener('click', async () => {
    trackEvent('survey_later', { src: source });
    // snooze, don't kill: a "later" comes back in a few days (never after submit)
    await kvSet('surveySnoozeAt', Date.now());
    history.back();
  });

  $('#svSend')?.addEventListener('click', async () => {
    const btn = $('#svSend'), st = $('#svStatus');
    const name = ($('#svName')?.value || '').trim();
    const email = ($('#svEmail')?.value || '').trim();
    const optin = !!$('#svOptin')?.checked;
    const feedback = ($('#svFeel')?.value || '').trim();
    const mostWanted = ($('#svWant')?.value || '').trim();
    const features = [...document.querySelectorAll('#svFeats input:checked')].map(c => c.value);
    // light validation: we want SOMETHING useful, but never trap the player.
    if (!name && !feedback && !mostWanted && !features.length) { if (st) st.textContent = 'Add your name, tick a feature, or leave a quick note, then the lizard is yours.'; return; }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { if (st) st.textContent = "That email doesn't look right. Fix it, or leave it blank."; return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Claiming...'; }
    // Grant LOCALLY first so the reward never depends on the network.
    let granted = false;
    try {
      if (!(await kvGet('surveyDone', false))) { await grantPet('CX', 'survey'); granted = true; }
      await kvSet('surveyDone', true);
      await refreshShinyPets();
    } catch { /* grant best-effort; gating below still marks done */ }
    sendSurvey({ name, email, emailOptin: optin, feedback, mostWanted, features }); // fire-and-forget
    trackEvent('survey_submit', { optin: optin ? 1 : 0, hasEmail: email ? 1 : 0, feats: features.length });
    showDayOneReveal(granted);
  });
}

// The celebratory reveal after a survey submit: swaps the form for a big animated
// Day One Lizard and a thank-you. Replaces the sheet body in place.
function showDayOneReveal(granted) {
  const wrap = sheetStack[sheetStack.length - 1]?.wrap;
  const form = wrap && $('#surveyForm', wrap);
  if (!form) { toast(granted ? 'The Day One Lizard is yours! Find it in your Stable. 💜' : 'Thanks, every note gets read. 💜', 3600); history.back(); return; }
  form.innerHTML = `
    <div class="survey-hero big">
      <div class="survey-liz">${animatedPetHtml('CX', 168) || ''}</div>
      <div class="survey-glow on"></div>
    </div>
    <h2 class="survey-title">The Day One Lizard is yours! 💜</h2>
    <p class="survey-sub">An exclusive amethyst companion, only for the players who were here at the start and helped shape the game. Find it in your <b>Stable</b> and equip it any time. Thank you: every word gets read.</p>
    <div class="row" style="margin-top:6px"><button class="btn" id="svDone" style="flex:1">See it in my Stable</button></div>
  `;
  $('#svDone', wrap)?.addEventListener('click', () => { history.back(); setTimeout(openStable, 260); });
}

// Boot trigger: invite engaged players to the survey once. Gated so it never nags
// — the few-days wait is ONLY for brand-new accounts (they need time to form an
// opinion); established players (older account OR already levelled up) see it right
// away. Never over onboarding / the splash / the daily wheel / any open sheet
// (retries next boot), snoozes on "Maybe later", and NEVER returns once submitted.
// Skips webdriver/demo.
async function maybeShowSurvey() {
  try {
    if (navigator.webdriver || !S.settings) return;
    if (await kvGet('surveyDone', false)) return;
    // Established-player check: an account created 3+ days ago (or with a missing
    // createdAt = pre-dates the field = old account) OR already past level 2 is
    // "established" and eligible now. Only a genuinely new account has to wait.
    const created = S.settings.createdAt || 0;
    const ageDays = created ? (Date.now() - created) / 86400e3 : 999;
    let established = ageDays >= 3;
    if (!established) { try { established = levelFor(await totalXp()) >= 3; } catch { /* noop */ } }
    if (!established) return;
    // "Maybe later" snooze: wait ~4 days before asking again
    const snooze = await kvGet('surveySnoozeAt', 0);
    if (snooze && Date.now() - snooze < 4 * 86400e3) return;
    let tries = 0;
    const tick = async () => {
      if (sheetStack.length || document.querySelector('.dw') || document.getElementById('splash')) {
        if (tries++ < 60) setTimeout(tick, 500);
        return;
      }
      openSurveySheet('auto');
    };
    setTimeout(tick, 2600); // after What's New / wheel have had their chance
  } catch { /* never block boot */ }
}

// What's New: the player-facing changelog. Opening it marks everything seen so
// the "new" dot clears. Reachable from Settings and the Crew tab.
// Changelog copy is written with a little emphasis markup. esc() was escaping it,
// so players read a literal "<b>" in their patch notes. Escape EVERYTHING first,
// then re-open only <b>/<i>/<br>: the copy lives in-repo, but an allowlist means
// a stray angle bracket can never become markup.
function richLine(str) {
  return esc(String(str))
    .replace(/&lt;(\/?)(b|i)&gt;/g, '<$1$2>')
    .replace(/&lt;br\s*\/?&gt;/g, '<br>');
}

async function openWhatsNew() {
  const cards = CHANGES.map(c => `
    <div class="wn-entry">
      <div class="wn-head"><b>${esc(c.title)}</b><span class="wn-date">${esc(c.date)}</span></div>
      ${c.needsBuild ? `<div class="wn-buildflag">📲 Needs the latest app update ${isNative() ? '(TestFlight / Play Store)' : ''} to work on your phone</div>` : ''}
      ${c.hero ? `<div class="wn-hero">
        ${c.hero.tag ? `<span class="rip">${esc(c.hero.tag)}</span>` : ''}
        <img src="${esc(c.hero.img)}" alt="${esc(c.hero.alt || '')}">
        ${c.hero.name ? `<div class="meta">
          <span class="m-name">${esc(c.hero.name)}</span>
          ${c.hero.rank ? `<span class="m-rank">${esc(c.hero.rank)}</span>` : ''}
          ${c.hero.tally ? `<span class="m-tally">${esc(c.hero.tally)}</span>` : ''}
        </div>` : ''}
      </div>` : ''}
      <ul class="wn-list">${c.items.map(i => `<li>${richLine(i)}</li>`).join('')}</ul>
    </div>`).join('');
  openSheet(`
    <div class="sheet-head"><h2>What's New</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <p class="note" style="margin:2px 2px 14px">Boneheadz Gym changes often. Here's what's new, newest first.</p>
      ${isNative() ? `<div class="wn-update-note">
        <b>📲 Update the app to get everything</b>
        <span>The game here refreshes on its own, but brand-new <b>device features</b> (like workout &amp; bike-ride tracking from your watch) only arrive when you update the actual app. Open <b>TestFlight</b> (iPhone) or the <b>Play Store</b> (Android) and tap <b>Update</b>, then reopen Boneheadz.</span>
      </div>` : ''}
      ${cards}
    </div>`, { cls: 'full' });
  await kvSet('changelogSeen', changelogLatest());
}

async function renderSettings(el) {
  const t = S.settings.targets;
  const p = S.settings.profile;
  const units = S.settings.units;
  const lastExport = await kvGet('lastExportAt', 0);
  const sleepDiag = await kvGet('hkSleepDiag', null);   // written by ingestHealth on every sync
  const recoverySet = await social.hasRecoveryPhrase();
  const vault = await social.vaultStatus();             // null on the web: no vault to describe
  const myRid = await social.myRecoveryId();
  const exportAgo = lastExport ? Math.round((Date.now() - lastExport) / 86400e3) : null;
  // native shell build (TestFlight/APK build number) — the WEB build updates by
  // itself, so without this there's no way to tell which SHELL a device runs
  // (needed to diagnose shell-level bugs like the portrait-lock regression).
  let shellV = '';
  try {
    const AppPlug = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (AppPlug && AppPlug.getInfo) { const i = await AppPlug.getInfo(); shellV = ` · shell ${i.version} (${i.build})`; }
  } catch { /* web: no shell */ }
  const apiConfigured = !!(await social.apiBase());
  const me = apiConfigured ? await social.socialMe() : null;
  const crewData = me ? await social.listFriends().catch(() => ({ friends: [], incoming: [], outgoing: [] })) : null;
  const incomingCount = crewData ? crewData.incoming.length : 0;
  const friendCount = crewData ? crewData.friends.length : 0;
  const backupOn = apiConfigured ? await social.cloudBackupOn() : false;
  const backupAt = apiConfigured ? await kvGet('backupAt', 0) : 0;
  const backupLabel = !backupOn ? 'Off: your progress lives only on this phone'
    : backupAt ? `On · last backup ${Date.now() - backupAt < 36e5 ? 'just now' : Math.round((Date.now() - backupAt) / 36e5) + 'h ago'}`
    : 'On · backing up automatically';
  const np = await notifPrefs();
  const notifPlat = notifPlatform();
  const notifPerm = await notifPermissionState();
  const clUnseen = changelogUnseen(await kvGet('changelogSeen', 0));
  const surveyDone = await kvGet('surveyDone', false);
  const notifRow = (key, label, sub) => `
    <div class="settings-row">
      <div class="lab"><b>${label}</b><span>${sub}</span></div>
      <div class="seg" style="width:110px"><button data-noti="${key}" data-on="1" class="${np[key] ? 'on' : ''}">On</button><button data-noti="${key}" data-on="0" class="${np[key] ? '' : 'on'}">Off</button></div>
    </div>`;
  el.innerHTML = `
  <h1 class="page-h1">Settings</h1>

  ${apiConfigured ? `
  <div class="card">
    <div class="card-title">THE CREW · ${me ? 'ONLINE' : 'GO ONLINE'}</div>
    ${me ? `
    <div class="crew-id">
      <div class="crew-name-wrap">
        <div class="crew-handle" id="crewName">${esc(me.name || me.handle)}</div>
        <button class="link crew-editname" id="editName">${me.name ? 'Change name' : 'Pick a name'}</button>
      </div>
      <button class="crew-code" id="copyCode" title="Copy friend code">${esc(me.friendCode)} ⧉</button>
    </div>
    <button class="crew-friends" id="friendsBtn">
      <span>${friendCount ? `${friendCount} friend${friendCount === 1 ? '' : 's'}` : 'Add friends'}</span>
      <span class="crew-friends-r">${incomingCount ? `<span class="req-badge">${incomingCount} new</span>` : ''}<span class="crew-chev">›</span></span>
    </button>
    <div class="settings-row" style="margin-top:12px">
      <div class="lab"><b>Cloud backup</b><span>${backupLabel}</span></div>
      <div class="seg" style="width:130px"><button id="cbOn" class="${backupOn ? 'on' : ''}">On</button><button id="cbOff" class="${backupOn ? '' : 'on'}">Off</button></div>
    </div>
    <p class="note" style="margin:8px 0 0">Your whole save backs up automatically, end-to-end <b>encrypted</b> so only your phone can read it (the server can't). Reinstall the app or get a new phone and your progress comes back on its own. Share your friend code so friends can add you.</p>`
    : `
    <p class="note" style="margin:0 0 10px">Go online to back up your progress (end-to-end encrypted, only your phone can read it) and join the Crew: friend codes, and soon trading and PvP.</p>
    <button class="btn" id="goOnlineBtn">Go Online</button>
    <button class="btn small ghost" id="restoreAcctBtn" style="margin-top:8px">I already have an account</button>`}
    ${me ? `<div class="settings-row" style="margin-top:10px">
      <div class="lab"><b>Recovery code</b><span>${recoverySet ? (myRid ? `Set. Restore anywhere with <b>${esc(myRid)}</b> and your phrase.` : 'Set. Add a recovery ID so you do not need your friend code to restore.') : 'NOT SET. Delete the app and this account is gone for good.'}</span></div>
      <button class="btn small ${recoverySet ? 'ghost' : ''}" id="recoveryBtn">${recoverySet ? 'Change' : 'Set it'}</button>
    </div>` : ''}
    ${vaultRowHtml(vault)}
  </div>` : ''}

  <div class="card">
    <div class="card-title">YOUR DATA</div>
    <div class="settings-row"><div class="lab"><b>Export backup</b><span>${exportAgo == null ? 'Never backed up yet' : exportAgo === 0 ? 'Last backup: today' : `Last backup: ${exportAgo} day${exportAgo === 1 ? '' : 's'} ago`}</span></div><button class="btn small ghost" id="exportBtn">Export</button></div>
    <div class="settings-row"><div class="lab"><b>Import backup</b><span>Restore from a Boneheadz Gym export</span></div><button class="btn small ghost" id="importBtn">Import</button></div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
    <div class="settings-row"><div class="lab"><b>Erase all data</b><span>Removes log, foods, weights</span></div><button class="btn small danger" id="eraseBtn">Erase</button></div>
  </div>

  ${notifPlat !== 'none' ? `
  <div class="card">
    <div class="card-title">NOTIFICATIONS</div>
    <div class="settings-row">
      <div class="lab"><b>Notifications</b><span>${np.enabled ? (notifPerm === 'denied' ? 'Blocked in system settings' : 'On') : 'Off: nothing gets pushed to you'}</span></div>
      <div class="seg" style="width:110px"><button data-noti="enabled" data-on="1" class="${np.enabled ? 'on' : ''}">On</button><button data-noti="enabled" data-on="0" class="${np.enabled ? '' : 'on'}">Off</button></div>
    </div>
    ${np.enabled ? `
    ${notifRow('friends', 'Crew activity', 'Friend requests, gifts and cheers')}
    ${notifRow('reminder', 'Daily log reminder', 'A nudge in the evening to log your food')}
    ${notifRow('streak', 'Streak saver', 'Warns you before a streak would break')}
    <div class="notif-presets">
      <button class="btn small ghost" id="notifAll">Everything (power user)</button>
      <button class="btn small ghost" id="notifEss">Just essentials</button>
    </div>
    <button class="btn small ghost" id="notifTest" style="margin-top:8px">Send a test notification</button>
    ${notifPlat === 'web' ? '<p class="note" style="margin:8px 2px 0">In a browser only immediate notifications work; scheduled rare + reminder pushes need the installed app.</p>' : ''}
    ${notifPerm === 'denied' ? '<p class="note" style="margin:8px 2px 0">Notifications are blocked. Enable Boneheadz Gym in your device Settings, then flip this back on.</p>' : ''}` : ''}
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
      <div class="lab"><b>Haptics</b><span>A little thump on collects, hits and level-ups</span></div>
      <div class="seg" style="width:130px"><button id="hapOn" class="${S.haptics ? 'on' : ''}">On</button><button id="hapOff" class="${S.haptics ? '' : 'on'}">Off</button></div>
    </div>
    <div class="settings-row">
      <div class="lab"><b>Gear glow</b><span>The coloured halo on epic weapons and slimed pieces. Turn it off for a clean look; stats are unaffected.</span></div>
      <div class="seg" style="width:130px"><button id="glowOn" class="${S.glow ? 'on' : ''}">On</button><button id="glowOff" class="${S.glow ? '' : 'on'}">Off</button></div>
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
    ${S.settings.hkConnected ? '<button class="btn small ghost" id="hkSyncNow" style="margin-top:8px">Sync now</button>' : ''}
    ${S.settings.hkConnected ? `
    <div class="sect-h" style="margin-top:16px">Sleep read</div>
    <div id="hkSleepDiagBox">${sleepDiagHtml(sleepDiag)}</div>` : ''}` : `
    <div class="settings-row">
      <div class="lab"><b>Steps, active energy, weight</b><span>${S.settings.hkConnected ? 'Connected via your Sync Boneheadz shortcut' : 'Bridge from your Apple Watch via a one-time Shortcut'}</span></div>
      <button class="btn small ghost" id="hkGuide">${S.settings.hkConnected ? 'Guide' : 'Connect'}</button>
    </div>
    <button class="btn small ghost" id="hkSyncNow" style="margin-top:8px">Sync from clipboard now</button>`}
  </div>


  <div class="card">
    <div class="card-title">ABOUT</div>
    <div class="settings-row"><div class="lab"><b>Send feedback</b><span>Tell the developer what you think</span></div><button class="btn small ghost" id="feedbackBtn">Write</button></div>
    ${surveyDone ? '' : `<div class="settings-row"><div class="lab"><b>Day One survey 💜</b><span>Share your thoughts, keep the exclusive Day One Lizard</span></div><button class="btn small" id="surveyBtn" style="background:#b96cf0;color:#1a0f26">Claim</button></div>`}
    <div class="settings-row"><div class="lab"><b>What's New</b><span>See what changed in recent updates</span></div><button class="btn small ghost" id="whatsNewBtn">Read${clUnseen ? ` <i class="q-badge">${clUnseen}</i>` : ''}</button></div>
    <div class="settings-row"><div class="lab"><b>App version</b><span>Build ${APP_BUILD}${shellV} · tap if the app looks out of date</span></div><button class="btn small ghost" id="updateBtn">Get latest</button></div>
  </div>

  <p class="note" style="text-align:center;margin-top:18px">
    Boneheadz Gym · build ${APP_BUILD} · your data is yours: cloud backups are end-to-end encrypted, readable only on your device<br>
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
  $('#recoveryBtn', el)?.addEventListener('click', () => openRecoverySheet());
  $('#restoreAcctBtn', el)?.addEventListener('click', () => openRestoreSheet());
  armToConfirm($('#vaultAdoptBtn', el), 'Replace this save?', async () => {
    const other = await social.vaultOtherIdentity();
    if (!other) { toast('That other Bonehead is no longer on this phone.'); refresh(); return; }
    const r = await social.adoptIdentity(other);
    if (!r.ok) return toast(r.reason || 'Could not switch to it.', 3600);
    S.settings = await kvGet('settings', S.settings);
    toast(r.restored ? 'Switched. Welcome back.' : 'Switched, but there was no save to pull.', 4200);
    route();
  });
  $('#goOnlineBtn', el)?.addEventListener('click', async () => {
    const btn = $('#goOnlineBtn', el);
    btn.disabled = true; btn.textContent = 'Connecting...';
    const r = await social.goOnline().catch(() => ({ ok: false, reason: 'network' }));
    if (!r.ok) { toast('Could not reach the Crew server. Try again in a bit.'); btn.disabled = false; btn.textContent = 'Go Online'; return; }
    confettiRain(70); levelSound(S.sounds);
    await social.syncProfile(await socialSnapshot(), APP_SOCIAL_V).catch(() => {});
    await social.pushBackup(APP_SOCIAL_V).catch(() => {});
    const pulled = await social.pullGrants().catch(() => null);
    toast(`You're in the Crew! Your progress is now backed up.${pulled && pulled.applied ? ' A welcome gift is in your Backpack.' : ''}`, 4200);
    renderSettings(el);
    // straight into picking a name (they just joined; don't leave them as the
    // random fallback handle). namePrompted stops the boot nudge double-firing.
    if (!(await social.socialMe())?.name) { await kvSet('namePrompted', true); setTimeout(() => openNameBuilder(() => renderSettings(el)), 500); }
  });
  $('#cbOn', el)?.addEventListener('click', async () => {
    await social.setCloudBackup(true);
    await social.pushBackup(APP_SOCIAL_V).catch(() => {});
    toast('Cloud backup on. Your progress is safe.');
    renderSettings(el);
  });
  $('#cbOff', el)?.addEventListener('click', async () => {
    await social.setCloudBackup(false);
    toast('Cloud backup off. Your progress will only live on this phone.', 3600);
    renderSettings(el);
  });
  $('#copyCode', el)?.addEventListener('click', async () => {
    const me = await social.socialMe();
    try { await navigator.clipboard.writeText(me.friendCode); toast('Friend code copied. Send it to a friend!'); }
    catch { toast(me.friendCode, 4000); }
  });
  $('#editName', el)?.addEventListener('click', () => openNameBuilder(() => renderSettings(el)));
  $('#friendsBtn', el)?.addEventListener('click', () => { location.hash = '#/friends'; });
  // ---- notifications ----
  const applyNotifs = async (prefs, note) => {
    await setNotifPrefs(prefs);
    await syncNotifications();
    const loc = await kvGet('lastLoc', null);
    await scheduleRares();   // retired: clears any rare pushes still queued
    if (note) toast(note, 2600);
    renderSettings(el);
  };
  $$('[data-noti]', el).forEach(b => b.addEventListener('click', async () => {
    const key = b.dataset.noti, on = b.dataset.on === '1';
    const prefs = await notifPrefs();
    if (key === 'enabled' && on) {
      const ok = await requestNotifPermission();
      if (!ok) { toast('Notifications need permission. Allow them when prompted, or enable in system settings.', 3600); renderSettings(el); return; }
    }
    prefs[key] = on;
    if (key === 'enabled' && on && !prefs.reminder && !prefs.streak && !prefs.friends) { prefs.reminder = prefs.streak = prefs.friends = true; }
    await applyNotifs(prefs);
  }));
  $('#notifAll', el)?.addEventListener('click', async () => {
    const ok = await requestNotifPermission();
    if (!ok) { toast('Allow notifications when prompted to turn these on.', 3400); return; }
    await applyNotifs({ enabled: true, reminder: true, streak: true, friends: true }, 'All notifications on.');
  });
  $('#notifEss', el)?.addEventListener('click', async () => {
    const ok = await requestNotifPermission();
    if (!ok) { toast('Allow notifications when prompted to turn these on.', 3400); return; }
    await applyNotifs({ enabled: true, reminder: true, streak: true, friends: true }, 'Essentials only: reminders, streak saver + friend requests.');
  });
  $('#notifTest', el)?.addEventListener('click', async () => {
    const fired = await notifyNow('Boneheadz Gym', 'Test notification. If you can see this, you are all set.');
    toast(fired ? (notifPlatform() === 'native' ? 'Sent. Background the app to see it.' : 'Test notification sent.') : 'Could not send. Check permission.', 3200);
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
  $('#hapOn')?.addEventListener('click', async () => { S.haptics = true; setHaptics(true); await kvSet('haptics', true); haptic.success(); refresh(); });
  $('#hapOff')?.addEventListener('click', async () => { S.haptics = false; setHaptics(false); await kvSet('haptics', false); refresh(); });
  $('#sndOff').addEventListener('click', async () => { S.sounds = false; await kvSet('sounds', false); refresh(); });
  $('#glowOn')?.addEventListener('click', async () => { S.glow = true; await kvSet('glow', true); popSound(S.sounds); refresh(); });
  $('#glowOff')?.addEventListener('click', async () => { S.glow = false; await kvSet('glow', false); refresh(); });
  $('#hkGuide')?.addEventListener('click', openHealthGuide);
  $('#hkSyncNow')?.addEventListener('click', syncFromClipboard);
  $('#exportBtn').addEventListener('click', async () => {
    // On the native shells the WebView can't save a blob download, so don't fake
    // success — your progress is already safe via the auto cloud backup. The file
    // export is a web-only convenience.
    if (isNative()) { toast('Your progress is auto-saved to the cloud (end-to-end encrypted). A downloadable file export is available in the web version.', 4600); return; }
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
  $('#eraseBtn').addEventListener('click', () => {
    const wrap = openSheet(`
      <div class="sheet-head">
        <div class="hd"><h2>Erase everything?</h2><div class="sub">This cannot be undone</div></div>
        <div class="t1-tools"><button class="sheet-close t1-icon-btn" aria-label="Cancel">${ICONS.close(17)}</button></div>
      </div>
      <div class="sheet-body">
        <p class="note" style="margin-bottom:12px">Your log, foods, weights, XP and Bonehead on <b>this device</b> will be gone. If cloud backup is on, the vault copy survives and can be restored later.</p>
        <div class="t1-field"><label>Type ERASE to confirm</label><input id="erIn" type="text" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ERASE"></div>
      </div>
      <div class="t1-foot"><button class="btn danger-ish" id="erGo" disabled>Erase it all</button></div>`, { cls: 't1', name: 'Erase' });
    const input = $('#erIn', wrap), go = $('#erGo', wrap);
    input.addEventListener('input', () => { go.disabled = input.value.trim().toUpperCase() !== 'ERASE'; });
    go.addEventListener('click', async () => {
      if (input.value.trim().toUpperCase() !== 'ERASE') return;   // belt and braces
      go.disabled = true; go.textContent = 'Erasing...';
      await social.forgetIdentity();   // else the vault re-adopts this account on the next boot
      for (const st of ['foods', 'log', 'weights', 'kv', 'xp', 'health']) await db.clear(st);
      location.reload();
    });
  });
  // Force-fetch the latest build: drop the service worker + all caches, then
  $('#whatsNewBtn')?.addEventListener('click', openWhatsNew);
  $('#feedbackBtn')?.addEventListener('click', openFeedbackSheet);
  $('#surveyBtn')?.addEventListener('click', () => openSurveySheet('settings'));
  // reload from the network. This is the escape hatch when a stale cached build
  // is stuck on the device (data is untouched — it lives in IndexedDB).
  $('#updateBtn')?.addEventListener('click', hardRefresh);
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

/* Onboarding, rebuilt to the approved mockups (market-quality-mockups/onb-*.html,
   signed off 2026-08-07). Three steps with one job each: sell the actual product,
   hand the player their character, capture the plan HONESTLY. The old version was
   a feature list any tracker ships, a hard cut to a form, and a Skip that faked a
   body silently. Every step is a funnel event: launch lives or dies here. */
function renderOnboarding(step = 0, ctx = {}) {
  const el = $('#screen');
  $('#tabbar').style.display = 'none';
  trackEvent('onb_step', { n: step });
  const dots = `<div class="onb-dots">${[0, 1, 2].map(i => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('')}</div>`;
  const back = step > 0 ? `<button class="onb-back" id="onbBack" aria-label="Back">${ICONS.chev(18)}</button>` : '';
  const ly = id => BH_BY_ID[id] ? `<img class="ly" src="${bhAsset(BH_BY_ID[id])}" alt="">` : '';

  if (step === 0) {
    el.innerHTML = `
    <div class="onb onb-in">
      ${dots}
      <h1>FEED THE<br>BONES</h1>
      <p class="onb-sub">The food tracker with a <b>skeleton in it</b>. Log your meals, and your Bonehead earns the loot.</p>
      <div class="onb-poster">
        ${['B0-1', 'FW1', 'P1', 'SK0-1', 'H11-1', 'IL1-1', 'IR1'].map(ly).join('')}
        <div class="onb-pet"><img src="assets/bh/anim/cloud/body-noeyes.png" alt=""><img src="assets/bh/anim/cloud/eyes.png" alt=""></div>
      </div>
      <div class="onb-foot">
        <button class="btn" id="onbGo">Meet your Bonehead</button>
        <button class="onb-quiet" id="onbRestore">Played before? <b>Restore a backup</b></button>
      </div>
    </div>`;
    $('#onbGo').addEventListener('click', () => renderOnboarding(1, ctx));
    // switching phones is a launch-day path, not a Settings scavenger hunt
    $('#onbRestore').addEventListener('click', () => { trackEvent('onb_restore'); openRestoreSheet(); });
    return;
  }

  if (step === 1) {
    // the BARE starter (kicks default is null): gear is what you earn, so the
    // reveal shows what you start with, not a dressed promo shot
    if (!ctx.pick) ctx.pick = randomName();
    el.innerHTML = `
    <div class="onb onb-in">
      ${back}${dots}
      <h1>THIS ONE'S<br>YOURS</h1>
      <div class="onb-poster bare">${['B0-1', 'SK0-1'].map(ly).join('')}</div>
      <div class="onb-nameplate">
        <span class="nm" id="onbName">${esc(buildDisplayName(ctx.pick.adj, ctx.pick.noun, ctx.pick.num))}</span>
        <button class="onb-reroll" id="onbReroll" aria-label="New name">${t1Stroke(18, '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 5v6h-6"/>')}</button>
      </div>
      <div class="onb-earns">
        <div class="onb-earn"><span class="ic">${ICONS.star(18)}</span><b>LOG FOOD</b><small>XP and coins, every meal</small></div>
        <div class="onb-earn"><span class="ic">${bhIcon('egg', 18)}</span><b>WALK</b><small>Hatch pets, find loot</small></div>
        <div class="onb-earn"><span class="ic">${ICONS.pit(18)}</span><b>FIGHT</b><small>Spend it all in the Pit</small></div>
      </div>
      <div class="onb-foot">
        <button class="btn" id="onbMe">That's me</button>
        <span class="onb-quiet">Every piece of gear is earned by playing. Nothing is pay-to-win.</span>
      </div>
    </div>`;
    $('#onbBack')?.addEventListener('click', () => renderOnboarding(0, ctx));
    $('#onbReroll').addEventListener('click', () => {
      ctx.pick = randomName();
      $('#onbName').textContent = buildDisplayName(ctx.pick.adj, ctx.pick.noun, ctx.pick.num);
      popSound(S.sounds);
    });
    $('#onbMe').addEventListener('click', async () => {
      // names live on the server (Crew), which needs the account that does not
      // exist yet: stash the pick and the Crew name builder starts from it
      await kvSet('onbName', ctx.pick);
      renderOnboarding(2, ctx);
    });
    return;
  }

  el.innerHTML = `
  <div class="onb onb-in onb-plan">
    ${back}${dots}
    <h1>THE PLAN</h1>
    <p class="onb-sub left">Four questions. Your Bonehead does the maths.</p>
    <div id="pfHost">${profileFormHtml({}, 'lb')}</div>
    <button class="btn" id="onbSave">Start tracking</button>
    <button class="onb-quiet" id="onbSkip">Skip for now: uses a rough default plan <b>(30 yr &middot; 5'10" &middot; 180 lb)</b> you can fix any time in Settings.</button>
    <div style="height:26px"></div>
  </div>`;
  $('#onbBack')?.addEventListener('click', () => renderOnboarding(1, ctx));
  const get = bindProfileForm(el, { units: 'lb' });
  $('#onbSave').addEventListener('click', async () => {
    const np = get();
    if (!np.age || !np.weightKg || np.heightCm < 90) { toast('Fill in age, height, weight'); return; }
    trackEvent('onb_done', { skip: 0 });
    await saveInitialSettings(np);
  });
  /* the Skip is HONEST: it says the body it assumes instead of silently faking
     one, and it still tells you where to fix it */
  $('#onbSkip').addEventListener('click', async () => {
    trackEvent('onb_done', { skip: 1 });
    /* no toast here: the skip line above already stated the defaults BEFORE the
       tap (the honest half), and the welcome-kit toast fires ~1.2s in and there
       is only one toast slot, so anything said here is stomped unread. */
    await saveInitialSettings({ sex: 'm', age: 30, heightCm: 178, weightKg: lbToKg(180), activity: 'moderate', goal: 'recomp', units: 'lb' });
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
  await kvSet('changelogSeen', changelogLatest()); // new player starts caught-up; What's New only pops for real updates
  const kit = await initLootIfNeeded();
  if (kit) setTimeout(() => toast('Welcome kit: 2 crates are waiting on your Bonehead', 3600), 1200);
  // The cloud account is created HERE, not at first boot: bootSync no longer
  // registers brand-new installs (that minted one abandoned level-1 "player"
  // per bounced install). Finishing onboarding is the opt-in moment.
  if (!(S.demo || navigator.webdriver === true)) {
    social.goOnline().then(r => { if (r.ok) return social.autoSync(socialSnapshot, APP_SOCIAL_V); }).catch(() => {});
  }
  $('#tabbar').style.display = '';
  window.addEventListener('hashchange', route);
  bindTabs();
  initAnalytics(APP_SOCIAL_V); // start analytics from the first session too (boot's init is skipped by the onboarding return)
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
  haptic.reward();
  // a milestone level gets a stamp of its own, so 25 does not feel like 24
  const ms = levelRewards && levelRewards.milestone;
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
      ${ms ? `<div class="lvl-milestone t-${ms.tier}">${ms.label}</div>` : ''}
      <div class="cele-bubble">${esc(line)}</div>
      ${levelRewards ? `<div class="lvl-rewards">
        <span class="bh-pill">${ICONS.coin(15)} +${levelRewards.coins}</span>
        <span class="bh-pill">${crateIcon('golden', 15)} ${levelRewards.crates > 1 ? levelRewards.crates + ' Golden Crates' : 'Golden Crate'}</span>
        ${levelRewards.dust ? `<span class="bh-pill">${ICONS.dust(14)} +${levelRewards.dust}</span>` : ''}
        ${levelRewards.eggs ? `<span class="bh-pill">${crateIcon('egg', 15)} ${levelRewards.eggs > 1 ? levelRewards.eggs + ' Step Eggs' : 'Step Egg'}</span>` : ''}
      </div>` : ''}`;
  }
  const wrap = openSheet(`
    <div class="reveal-take${levelUp ? ' warm' : ''}">
      <div class="grainy"></div>
      <div class="reveal-eyebrow">${levelUp ? 'Level up' : streakMilestone ? 'Streak milestone' : 'Badge earned'}</div>
      <div class="reveal-body">
        ${hero || `<div style="font-size:44px;line-height:1">${streakMilestone ? sparkIco(40) : ICONS.star(44)}</div>`}
        ${bits.length ? `<div style="height:10px"></div>${bits.join('<div style="height:14px"></div>')}` : ''}
      </div>
      <div class="reveal-foot">
        <button class="btn" id="celeOk">${levelUp ? 'RATTLE ON' : 'Keep it going'}</button>
      </div>
    </div>`, { cls: 'takeover', onClose: () => setFxLayer() });
  setFxLayer(305);
  $('#celeOk', wrap).addEventListener('click', () => history.back());
}

function badgesGridHtml(earned, newIds = new Set()) {
  // secret (easter-egg) badges stay masked as ??? until earned — the mystery
  // tile IS the hint that there's something out there to find.
  return `<div class="badge-grid">${BADGES.map(b => {
    const hidden = b.secret && !earned.has(b.id);
    return `
    <button class="badge ${earned.has(b.id) ? '' : 'locked'} ${newIds.has(b.id) ? 'new' : ''}" data-badge="${b.id}">
      <span class="bicon">${hidden ? '❓' : badgeIconHtml(b.icon, 22)}</span>${hidden ? '???' : esc(b.name)}
    </button>`;
  }).join('')}</div>`;
}

function bindBadgeTaps(wrap) {
  $$('[data-badge]', wrap).forEach(el => el.addEventListener('click', async () => {
    const b = BADGES.find(x => x.id === el.dataset.badge);
    if (!b) return;
    if (b.secret && !(await earnedBadgeIds()).has(b.id)) { toast('❓ ???: Some things are only found out in the world...', 2800); return; }
    toast(`${b.icon} ${b.name}: ${b.desc}`, 2600);
  }));
}

// Your Bonehead is a real screen with a tab, not a modal. It is the game hub
// (Wardrobe, Backpack, Shop, Build, Progress), and it used to be reachable only
// by tapping small chips on Today. openCharacter(tab) is kept as the one way in
// so every old caller lands in the right place.
function openCharacter(tab = 'wardrobe') {
  pendingHubTab = tab;
  if (currentTab() === 'bonehead') return route();   // already here: just switch tabs
  location.hash = '#/bonehead';
}

let pendingHubTab = null;

async function renderBonehead(el) {
  const tab = pendingHubTab || 'wardrobe';
  pendingHubTab = null;
  el.innerHTML = `<h1 class="page-h1 hub-title">Your Bonehead</h1><div id="chBody"></div>`;
  await renderCharacter(el, tab);
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
    </div>` : `<div class="hatch-stage"><div class="hatch-glow"></div></div>`;
  const revealHtml = item
    ? `<div class="lvl-stamp" style="font-size:30px${res.shiny ? ';color:var(--gold)' : ''}">${res.shiny ? `${sparkIco(24)} SHINY! ${sparkIco(24)}` : res.dupe ? 'ANOTHER ONE!' : 'IT HATCHED!'}</div>
       <div class="hatch-prize r-${item.rarity}${res.shiny ? ' is-shiny' : ''}">
         <canvas class="hatch-art" width="512" height="512"></canvas>
         <b>${esc(item.name)}${res.shiny ? ` <span class="shiny-tag">${sparkIco(11)} SHINY</span>` : ''}</b>
         <small>${res.shiny ? 'Ultra-rare variant · follows your bonehead' : res.dupe ? 'A duplicate · joins your crew as breeding stock' : 'Pet · follows your bonehead'}</small>
         <span class="rar-chip" style="color:${res.shiny ? 'var(--gold)' : RARITIES[item.rarity].color}">${res.shiny ? 'SHINY' : RARITIES[item.rarity].label}</span>
       </div>`
    : `<div class="lvl-stamp" style="font-size:26px">A FAMILIAR FRIEND</div>
       <p class="note">This egg hatched a pet you already know. It scampered back into your crew and left you +${res.coins} coins. Keep hatching for shinies.</p>`;
  const wrap2 = openSheet(`
    <div class="reveal-take cool">
      <div class="grainy"></div>
      <div class="reveal-eyebrow">Step egg</div>
      <div class="reveal-body">
        ${stageHtml}
        <div class="hatch-reveal${reduced ? ' show' : ''}">${revealHtml}</div>
      </div>
      <div class="reveal-foot">
        <button class="btn" id="hatchOk">${item ? 'Adopt' : 'Nice'}</button>
      </div>
    </div>`, { cls: 'takeover', onClose: () => setFxLayer() });
  setFxLayer(305);
  const stage = $('#hatchStage', wrap2);
  const revealEl = $('.hatch-reveal', wrap2);
  // draw the pet big + centered (the source PNG parks it in a corner)
  if (item) { const cv = $('.hatch-art', wrap2); if (cv) drawTrimmedArt(cv, res.shiny ? `assets/bh/C/shiny/${item.id}.png` : bhAsset(item)); }
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
  //
  // Read it off the SCROLLER, not #chBody. #chBody is a plain div inside .screen,
  // which is the element with overflow-y, so its scrollTop is always 0: the
  // previous version of this fix saved and restored zero and did nothing, which
  // is why equipping still bounced to the top. Replacing the markup shortens the
  // content and the browser clamps the real scroller's offset.
  const scroller = body.closest('.screen') || body;
  const keepScroll = opts.instant ? scroller.scrollTop : null;
  const [xp, eq, coinBal, inv, boost, dustBal] = await Promise.all([totalXp(), equipped(), coins(), inventory(), battleCharmCharges(), boneDust()]);
  const lvl = levelFor(xp);
  const crates = inv.filter(r => r.kind === 'crate').sort((a, b) => a.ts - b.ts);
  const boosts = inv.filter(r => r.kind === 'xp2').length;
  const vigors = inv.filter(r => r.kind === 'vigor').length;
  const ownedCount = inv.filter(r => r.kind === 'cos').length;
  const takenTal = await kvGet('talents', []);
  const unspentTal = Math.max(0, talentPoints(levelFor(xp).level) - takenTal.length);
  const looksAll = BH_ITEMS.filter(i => !i.default);
  const looksHave = await collectedLooks();
  const looksN = looksAll.filter(i => looksHave.has(i.id)).length;

  const curtains = false; // dressing-room curtains retired (Tom's call)
  body.innerHTML = `
    ${tab === 'wardrobe' ? `
    <div class="ward-head">
      <span class="ward-lv">Lv ${lvl.level}</span>
      <span class="ward-rank">${esc(lvl.name)}</span>
      <span class="bh-pill">${ICONS.coin(14)} ${coinBal.toLocaleString()}</span>
      <span class="bh-pill">${ICONS.dust(13)} ${dustBal.toLocaleString()}</span>
      <span class="bh-pill">${ICONS.bone(14)} ${ownedCount} found</span>
      ${boost ? `<span class="bh-pill">${ICONS.boltIco(14)} x${boost}</span>` : ''}
    </div>` : `
    <div class="bh-hero mini">
      <div class="bh-stage lg">${avatarLayersHtml(eq, { noYard: true })}</div>
      <div class="bh-hero-meta">
        <b class="bh-title">Lv ${lvl.level} · ${esc(lvl.name)}</b>
        <div class="xp-mini" style="width:110px"><i style="width:${lvl.pct}%"></i></div>
        <div class="bh-pills">
          <span class="bh-pill">${ICONS.coin(14)} ${coinBal.toLocaleString()}</span>
          <span class="bh-pill">${ICONS.dust(13)} ${dustBal.toLocaleString()}</span>
<span class="bh-pill">${ICONS.bone(14)} ${ownedCount} found</span>
          ${boost ? `<span class="bh-pill">${ICONS.boltIco(14)} x${boost}</span>` : ''}
        </div>
      </div>
    </div>`}
    <div class="ch-tabs" id="chTabs">
      <button class="chip ch-tab ${tab === 'wardrobe' ? 'on' : ''}" data-tab="wardrobe">${ICONS.bone(21)}<span>Wardrobe</span></button>
      <button class="chip ch-tab ${tab === 'crates' ? 'on' : ''}" data-tab="crates">${crateIcon('golden', 21)}<span>Backpack</span>${crates.length ? `<i class="ch-badge">${crates.length}</i>` : ''}</button>
      <button class="chip ch-tab ${tab === 'shop' ? 'on' : ''}" data-tab="shop">${ICONS.coin(21)}<span>Shop</span></button>
      <button class="chip ch-tab ${tab === 'talents' ? 'on' : ''}" data-tab="talents">${ICONS.pit(21)}<span>Build</span>${unspentTal > 0 ? `<i class="ch-badge">${unspentTal}</i>` : ''}</button>
      <button class="chip ch-tab ${tab === 'progress' ? 'on' : ''}" data-tab="progress">${ICONS.star(21)}<span>Level</span></button>
    </div>
    <button class="looks-card ${tab === 'looks' ? 'on' : ''}" data-tab="looks">
      <span class="lc-top"><b>Looks</b><span>${looksN} / ${looksAll.length} collected</span></span>
      <span class="lc-bar"><i style="width:${((looksN / looksAll.length) * 100).toFixed(1)}%"></i></span>
    </button>
    <div id="chContent"></div>`;

  $$('#chTabs .chip, .looks-card', body).forEach(c => c.addEventListener('click', () => renderCharacter(wrap, c.dataset.tab)));
  const content = $('#chContent', body);
  if (curtains) requestAnimationFrame(() => requestAnimationFrame(() => $$('.curt', body).forEach(x => x.classList.add('open'))));

  if (tab === 'wardrobe') {
    const owned = await ownedCosmeticIds();
    const [gOwnedSet, gearLo, fighter, slimedSet, tm, looks, dustBal, fitList] = await Promise.all([
      ownedGearIds(), gearLoadout(), buildFighter(), slimedGearIds(), transmogMap(), collectedLooks(), boneDust(), fits(),
    ]);
    const fitPrices = await Promise.all(fitList.map(f => fitPrice(f)));
    // `eq` is the RAW equipment (what the grids tick as equipped); `look` is what
    // you actually appear as once transmog resolves, so the doll and the stage
    // agree with the rest of the app.
    const look = await equipped();
    const wLevel = levelFor(await totalXp()).level;
    const slot = S.wardrobeSlot || 'H';
    const mogOf = code => (gearLo[code] ? tm[code] : null); // only reads while gear is worn
    const slotMeta = BH_SLOTS.find(s => s.code === slot);
    const items = BH_ITEMS.filter(i => i.slot === slot && owned.has(i.id));
    const gearItems = GEAR_ITEMS.filter(g => g.slot === slot && gOwnedSet.has(g.id));
    const lockedCount = BH_ITEMS.filter(i => i.slot === slot).length - items.length;

    const pdSlot = code => {
      const meta = BH_SLOTS.find(x => x.code === code);
      const isGearSlot = GEAR_SLOTS.includes(code);
      const g = isGearSlot ? GEAR_BY_ID[gearLo[code]] : null;
      // show the LOOK (so the doll matches the avatar beside it); the stat line
      // below still reports the real gear, and a badge marks a disguised slot.
      const art = look[code] && BH_BY_ID[look[code]] ? BH_BY_ID[look[code]] : null;
      const mog = mogOf(code);
      const label = isGearSlot ? GEAR_SLOT_LABELS[code] : meta.label;
      return `<button class="pd-slot ${slot === code ? 'sel' : ''} ${g ? 'gear-on r-' + g.rarity : ''}" data-pd="${code}" title="${esc(label)}${mog ? ' (look changed)' : ''}">
        ${art
          ? (code === 'BG'
              ? `<span class="pd-swatch" style="background-image:url('${esc(bhAsset(art))}')"></span>`
              // trim-normalize makes a compact skull render as big as a whole
              // body; extra pad keeps the skull tile from shouting (Tom, Aug 6)
              : `<canvas class="pd-art" width="200" height="200" data-art="${esc(bhAsset(art))}"${code === 'SK' ? ' data-pad="0.2"' : ''}></canvas>`)
          : `<span class="pd-empty">${mog === TRANSMOG_HIDE ? ICONS.hidden(18) : '+'}</span>`}
        ${mog ? `<span class="pd-mog" title="Look changed">${sparkIco(11)}</span>` : ''}
        <span class="pd-tag">${esc(label)}</span>
        ${g ? `<span class="pd-gear">${gearLabel(g)}${g.talent ? ' ' + ICONS.boltIco(11) : ''}</span>` : ''}
      </button>`;
    };
    const LEFT = ['H', 'E', 'M', 'T', 'P'];
    const RIGHT = ['IR', 'IL', 'G', 'U', 'S'];
    const BOTTOM = ['SK', 'B', 'FW', 'BG']; // pets in the Stable; yard decor retired
    const statChip = m => {
      const gb = fighter.gearBonus[m.key] || 0;
      return `<span class="pd-stat"><small>${m.label}</small><b>${fighter.stats[m.key]}</b>${gb ? `<i>+${gb}</i>` : ''}</span>`;
    };
    // Trying a look is FREE and shows on the doll immediately; only the Apply
    // button in the bar below spends dust. Nobody pays for a tap.
    const wornGear = gearLo[slot] ? GEAR_BY_ID[gearLo[slot]] : null;
    const stageEq = (() => {
      const p = S.lookPreview;
      if (p == null || !wornGear) return look;
      const e = { ...look };
      if (p === TRANSMOG_HIDE) delete e[slot];
      else if (p === '') e[slot] = wornGear.artId;
      else if (BH_BY_ID[p]) e[slot] = p;
      return e;
    })();
    // Prices are paid-aware: a look you have already bought for this slot reads
    // free forever, which is what lets fits swap without a tax.
    const slotArts = wornGear
      ? BH_ITEMS.filter(i => i.slot === slot && looks.has(i.id) && i.id !== wornGear.artId) : [];
    const lookPriceMap = {};
    for (const i of slotArts) lookPriceMap[i.id] = await transmogPrice(slot, i.id);

    // SAVED FITS: a look you can put back on in one tap. Stats never move.
    const fitRail = `
      <div class="fit-rail">
        ${fitList.map((f, i) => {
          // No art thumbnail: the source PNGs are full-body canvases with a lot of
          // transparent padding, so at chip size they render as an empty square.
          // A rarity pip off the fit's headline piece reads at any size.
          const art = fitThumbArt(f);
          const price = fitPrices[i];
          return `<button class="fit-chip ${S.fitEdit === f.id ? 'editing' : ''}" data-fit="${f.id}" title="${esc(f.name)}">
            <span class="fc-pip r-${art ? art.rarity : 'common'}"></span>
            ${esc(f.name)}${price ? `<i class="fc-cost">${price} <span class="dust-ico">${ICONS.dust(11)}</span></i>` : ''}
            ${S.fitEdit === f.id ? '<i class="fc-x" data-fit-del="' + f.id + '">' + ICONS.close(12) + '</i>' : ''}
          </button>`;
        }).join('')}
        ${fitList.length < MAX_FITS ? '<button class="fit-chip add" data-fit-save="1">+ Save this fit</button>' : ''}
      </div>
      ${fitList.length ? `<p class="note fit-note">Tap a fit to wear it. Fits change your look only, never your stats. Long-press a fit to rename or bin it.</p>` : ''}`;

    content.innerHTML = `
      ${fitRail}
      <div class="paperdoll">
        <div class="pd-col">${LEFT.map(pdSlot).join('')}</div>
        <div class="pd-center">
          <div class="bh-stage lg${curtains ? ' dressing' : ''}">${stageEq.BG && BH_BY_ID[stageEq.BG] ? `<img class="bh-backdrop" src="${bhAsset(BH_BY_ID[stageEq.BG])}" alt="">` : ''}${avatarLayersHtml(stageEq, { noYard: true, skip: ['C', 'BG'] })}${curtains ? '<div class="curt l"></div><div class="curt r"></div>' : ''}</div>
        </div>
        <div class="pd-col">${RIGHT.map(pdSlot).join('')}</div>
      </div>
      <div class="pd-bottom">${BOTTOM.map(pdSlot).join('')}</div>
      <div class="pd-stats">${STAT_META.map(statChip).join('')}</div>
      <div class="sect-h" style="margin-top:10px">${esc(GEAR_SLOTS.includes(slot) ? GEAR_SLOT_LABELS[slot] : slotMeta.label)} · pick your fit</div>
      <div class="ward-grid" data-wslot="${slot}">
        ${slotMeta.default || (!items.length && !gearItems.length) ? '' : `<button class="ward-cell none ${!eq[slot] ? 'equipped' : ''}" data-equip="">None</button>`}
        ${items.map(i => `
          <button class="ward-cell r-${i.rarity} ${eq[slot] === i.id && !gearLo[slot] ? 'equipped' : ''}" data-equip="${i.id}" title="${esc(i.name)}">
            <img src="${bhAsset(i)}" alt="${esc(i.name)}" loading="lazy">
          </button>`).join('')}
        ${gearItems.map(g => {
          const art = BH_BY_ID[g.artId];
          const locked = wLevel < g.minLevel;
          return `
          <button class="ward-cell gear r-${g.rarity} ${slimedSet.has(g.id) ? 'slimed' : ''} ${gearLo[slot] === g.id ? 'equipped' : ''} ${S.wardrobePreview === g.id ? 'selected' : ''} ${locked ? 'locked' : ''}" data-equipgear="${g.id}" title="${esc(g.name)}${slimedSet.has(g.id) ? ' (SLIMED)' : ''}">
            <img src="${bhAsset(art)}" alt="${esc(g.name)}" loading="lazy">
            <span class="gear-stat">${gearLabel(g)}${g.talent ? ' ' + ICONS.boltIco(11) : ''}</span>
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
            ${ig.talent ? `<span class="gi-talent">${ICONS.boltIco(12)} ${esc(ig.talentName)}</span><small class="gi-desc">${esc(TALENT_DESC[ig.talent] || 'a special ability')}</small>` : '<small class="gi-desc">No special ability. Pure stats.</small>'}
            <span class="rar-chip" style="color:${rar.color}">${rar.label} · ${GEAR_SLOT_LABELS[ig.slot]}${ig.minLevel > 1 ? ` · Lv ${ig.minLevel}` : ''}</span>
          </div>
          <div class="gi-actions">
            <button class="btn gi-equip ${isEq ? 'ghost' : ''}" data-equipgear-commit="${ig.id}" ${isEq || locked ? 'disabled' : ''}>${isEq ? 'Equipped' : locked ? `Locked · Lv ${ig.minLevel}` : 'Equip this'}</button>
            <button class="btn danger gi-melt" data-melt-gear="${ig.id}">Melt · +${gearDustValue(ig)} dust</button>
          </div>
        </div>`;
      })()}
      ${(() => {
        // TRANSMOG. Only offered where a look is actually forced on you, i.e. a
        // statted piece is worn. Equip a plain cosmetic and the look you picked
        // is the look you get, so there is nothing to disguise.
        if (!GEAR_SLOTS.includes(slot) || !wornGear) return '';
        const cur = tm[slot] ?? '';                        // '' = the gear's own look
        const sel = S.lookPreview == null ? cur : S.lookPreview;
        const arts = slotArts;
        const cell = (val, inner, title) => `<button class="ward-cell look ${cur === val ? 'equipped' : ''} ${sel === val ? 'selected' : ''}" data-look="${esc(val)}" title="${esc(title)}">${inner}</button>`;
        const ownArt = BH_BY_ID[wornGear.artId];
        const nameOf = v => v === '' ? `${wornGear.name}, its own look` : v === TRANSMOG_HIDE ? 'Nothing, slot hidden' : (BH_BY_ID[v]?.name || '');
        const cost = (sel === '' || sel === TRANSMOG_HIDE) ? 0 : (lookPriceMap[sel] || 0);
        const afford = dustBal >= cost;
        const changed = sel !== cur;
        return `
        <div class="sect-h" style="margin-top:14px">${esc(GEAR_SLOT_LABELS[slot])} · pick your look</div>
        <div class="ward-grid look-grid">
          ${cell('', `<img src="${bhAsset(ownArt)}" alt="" loading="lazy"><span class="look-tag">Its own look</span>`, 'Wear the gear as it is')}
          ${cell(TRANSMOG_HIDE, '<span class="look-hide">🚫</span><span class="look-tag">Hide</span>', 'Show nothing in this slot')}
          ${arts.map(i => cell(i.id, `<img src="${bhAsset(i)}" alt="${esc(i.name)}" loading="lazy">${lookPriceMap[i.id] ? `<span class="look-cost">${lookPriceMap[i.id]}</span>` : '<span class="look-cost paid">owned</span>'}`, i.name)).join('')}
        </div>
        <div class="look-bar${changed ? ' armed' : ''}">
          <span class="lb-txt">${changed ? 'Trying' : 'Wearing'}: <b>${esc(nameOf(sel))}</b></span>
          ${changed
            ? (afford
                ? `<button class="btn" data-look-apply="${esc(sel)}" data-look-price="${cost || 0}">${cost ? `Wear it · ${cost} dust` : 'Wear it · free'}</button>`
                : `<button class="btn ghost" disabled>Need ${cost} dust · you have ${dustBal}</button>`)
            : ''}
        </div>
        <p class="note" style="text-align:center;margin-top:8px">Your ${esc(GEAR_SLOT_LABELS[slot].toLowerCase())} keeps <b>${gearLabel(wornGear)}</b> whatever it looks like. Trying one on is free, you only spend Bone Dust when you wear it. You have <b><span class="dust-ico">${ICONS.dust(12)}</span> ${dustBal}</b>.${arts.length ? '' : ' No other looks collected for this slot yet, keep hunting.'}</p>`;
      })()}
      ${GEAR_SLOTS.includes(slot) ? '<p class="note" style="text-align:center;margin-top:10px">Statted gear boosts your Pit fighter. Same look can roll different stats; pieces marked with a bolt grant a talent. Rarer rolls hit harder. Melting a piece keeps its look forever.</p>' : ''}
      ${lockedCount ? `<p class="note" style="text-align:center;margin-top:10px">More ${slotMeta.label.toLowerCase()} pieces are out there. Keep hunting.</p>` : ''}`;
    // --- saved fits: tap to wear, long-press for rename / bin ---
    $$('[data-fit]', content).forEach(chip => {
      let held = false, t = null;
      const arm = () => { held = false; t = setTimeout(() => { held = true; S.fitEdit = S.fitEdit === chip.dataset.fit ? null : chip.dataset.fit; popSound(S.sounds); renderCharacter(wrap, 'wardrobe', { instant: true }); }, 520); };
      const disarm = () => { if (t) clearTimeout(t); t = null; };
      chip.addEventListener('pointerdown', arm);
      chip.addEventListener('pointerup', disarm);
      chip.addEventListener('pointerleave', disarm);
      chip.addEventListener('pointercancel', disarm);
      chip.addEventListener('click', async e => {
        if (held) { held = false; return; }
        if (e.target.closest('[data-fit-del]')) return;      // the ✕ has its own handler
        if (S.fitEdit === chip.dataset.fit) {                 // in edit mode a tap renames
          const cur = (await fits()).find(f => f.id === chip.dataset.fit);
          openTextSheet({ title: 'Name this fit', value: cur ? cur.name : '', cta: 'Rename' }, async name => {
            if (name) await renameFit(chip.dataset.fit, name);
            S.fitEdit = null;
            renderCharacter(wrap, 'wardrobe', { instant: true });
          });
          return;
        }
        const res = await applyFit(chip.dataset.fit);
        if (!res.ok) {
          toast(res.reason === 'dust' ? `That fit needs ${res.need} dust, you have ${res.have}.` : 'Could not wear that fit.', 2800);
          return;
        }
        S.lookPreview = null;
        levelSound(S.sounds); pushProfileSoon();
        toast(res.cost ? `${res.name} on. −${res.cost} dust.` : `${res.name} on.`, 2000);
        renderCharacter(wrap, 'wardrobe', { instant: true });
      });
    });
    $$('[data-fit-del]', content).forEach(x => x.addEventListener('click', async e => {
      e.stopPropagation();
      await deleteFit(x.dataset.fitDel);
      S.fitEdit = null; popSound(S.sounds);
      renderCharacter(wrap, 'wardrobe', { instant: true });
    }));
    $('[data-fit-save]', content)?.addEventListener('click', async () => {
      openTextSheet({ title: 'Name this fit', value: `Fit ${fitList.length + 1}`, cta: 'Save fit' }, async name => {
        if (!name) return;
        const res = await captureFit(name);
        if (!res.ok) { toast(res.reason === 'full' ? `You can keep ${res.max} fits. Bin one first.` : 'Could not save that fit.', 2800); return; }
        levelSound(S.sounds);
        toast(`Saved "${res.fit.name}". Tap it any time to put it back on.`, 2600);
        renderCharacter(wrap, 'wardrobe', { instant: true });
      });
    });
    /* Trim the transparent padding off every paper-doll slot, the same way the
       reveal cards do. Raw assets are only ~30-60% ink on their own canvas, so an
       <img> rendered them as specks in a 66px slot. Runs AFTER content.innerHTML,
       which is where the slots actually live (#chContent, not #chBody). */
    hydratePackArt(content, '.pd-art[data-art]');
    $$('[data-pd]', content).forEach(b => b.addEventListener('click', () => { S.wardrobeSlot = b.dataset.pd; S.wardrobePreview = null; S.lookPreview = null; renderCharacter(wrap, 'wardrobe', { instant: true }); }));
    $$('[data-equip]', content).forEach(cell => cell.addEventListener('click', async () => {
      await equip(slot, cell.dataset.equip || null);
      S.lookPreview = null;
      popSound(S.sounds); pushProfileSoon();
      // Update IN PLACE. This used to call renderCharacter(), which rebuilt the
      // whole screen for one garment: every image element in every cell was
      // destroyed and re-created, so each tap flashed the entire page. Only two
      // things actually change when you equip something, so only those two move.
      const done = await restageWardrobe(content, slot);
      if (!done) renderCharacter(wrap, 'wardrobe', { instant: true });   // fall back rather than leave it stale
    }));
    // Tap a look to try it on: free, instant, no commitment. Dust is only spent
    // by the Apply button in the bar.
    $$('[data-look]', content).forEach(cell => cell.addEventListener('click', () => {
      S.lookPreview = cell.dataset.look;
      popSound(S.sounds);
      renderCharacter(wrap, 'wardrobe', { instant: true });
    }));
    $$('[data-look-apply]', content).forEach(btn => {
      // free actions (revert to the gear's own look, or hide the slot) stay one tap:
      // a confirm on something that costs nothing is just friction
      const price = Number(btn.dataset.lookPrice || 0);
      if (price > 0) { armToConfirm(btn, `Spend ${price} dust?`, () => applyLook(btn)); return; }
      btn.addEventListener('click', () => applyLook(btn));
    });
    async function applyLook(btn) {
      const val = btn.dataset.lookApply;
      const res = val === '' ? await clearTransmog(slot) : await applyTransmog(slot, val);
      if (!res.ok) {
        toast(res.reason === 'dust' ? `Need ${res.need} dust, you have ${res.have}.` : 'Could not change that look.', 2600);
        return;
      }
      S.lookPreview = null;
      levelSound(S.sounds); pushProfileSoon();
      toast(res.cost ? `Look changed. −${res.cost} dust.` : 'Look changed.', 2000);
      renderCharacter(wrap, 'wardrobe', { instant: true });
    }
    // tapping a gear cell INSPECTS it (preview): the panel below shows its stats +
    // special ability. Tapping the already-selected piece, or the panel button, equips.
    $$('[data-equipgear]', content).forEach(cell => cell.addEventListener('click', async () => {
      const g = GEAR_BY_ID[cell.dataset.equipgear];
      if (!g) return;
      if (S.wardrobePreview === g.id && gearLo[slot] !== g.id) {
        if (wLevel < g.minLevel) { toast(`Locked: reach level ${g.minLevel} to wear ${g.name}.`, 2800); return; }
        await equipGear(slot, g.id);
        await refreshSlimedSlots();   // keep the Bonehead's slime glow in step
        S.lookPreview = null;
        popSound(S.sounds); pushProfileSoon();
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
      await refreshSlimedSlots();   // keep the Bonehead's slime glow in step
      S.lookPreview = null;
      levelSound(S.sounds); pushProfileSoon();
      renderCharacter(wrap, 'wardrobe', { instant: true });
    }));
    $$('[data-melt-gear]', content).forEach(btn => btn.addEventListener('click', async () => {
      // arm-then-confirm so a piece is never melted by accident
      if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Tap again to melt'; setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = '0'; btn.textContent = `Melt · +${gearDustValue(GEAR_BY_ID[btn.dataset.meltGear])} dust`; } }, 2600); return; }
      const res = await disenchantGear(btn.dataset.meltGear);
      if (!res.ok) { toast('Could not melt that piece.'); return; }
      S.wardrobePreview = null; S.lookPreview = null;
      popSound(S.sounds);
      toast(`${res.name} melted into ${res.dust} Bone Dust. Its look is yours forever.`, 3200);
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
  if (tab === 'looks') {
    // THE COLLECTION. Locked pieces are deliberately identical: no art, no
    // outline, no rarity, no name. The unlock stays a surprise, and the only
    // information you get is the per-slot tally, which spoils nothing.
    const worn = await equipped();
    const wornSet = new Set(Object.values(worn));
    const RAR_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
    const sections = BH_SLOTS.map(s => {
      const all = looksAll.filter(i => i.slot === s.code);
      if (!all.length) return '';
      const have = all.filter(i => looksHave.has(i.id));
      const missing = all.filter(i => !looksHave.has(i.id));
      const label = GEAR_SLOTS.includes(s.code) ? GEAR_SLOT_LABELS[s.code] : s.label;
      // tease WHAT is still out there by tier, never WHICH piece it is
      const byRar = {};
      for (const m of missing) byRar[m.rarity] = (byRar[m.rarity] || 0) + 1;
      const tease = RAR_ORDER.filter(r => byRar[r] && (r === 'legendary' || r === 'epic'))
        .map(r => `${byRar[r]} ${r}`).join(', ');
      const sorted = [...have].sort((a, b) => RAR_ORDER.indexOf(a.rarity) - RAR_ORDER.indexOf(b.rarity));
      return `
        <div class="col-head"><span>${esc(label)}</span><em>${have.length} of ${all.length}${tease ? ` · ${esc(tease)} out there` : ''}</em></div>
        <div class="col-grid">
          ${sorted.map(i => `<button class="col-cell r-${i.rarity} ${wornSet.has(i.id) ? 'worn' : ''} ${S.lookInspect === i.id ? 'selected' : ''}" data-look-info="${i.id}" title="${esc(i.name)}"><img src="${bhAsset(i)}" alt="${esc(i.name)}" loading="lazy"></button>`).join('')}
          ${missing.map(() => '<button class="col-cell locked" data-look-locked="1" title="Not collected yet"><span class="lock-q">?</span></button>').join('')}
        </div>
        ${(() => {
          const it = S.lookInspect && have.find(x => x.id === S.lookInspect);
          if (!it) return '';
          const rar = RARITIES[it.rarity] || RARITIES.common;
          const gearSlot = GEAR_SLOTS.includes(it.slot);
          return `<div class="col-inspect r-${it.rarity}">
            <img src="${bhAsset(it)}" alt="">
            <div class="ci-body">
              <b>${esc(it.name)}</b>
              <span class="rar-chip" style="color:${rar.color}">${rar.label} · ${esc(label)}</span>
            </div>
            ${gearSlot ? `<button class="btn small" data-wear-look="${it.id}">Wear this look</button>` : '<span class="ci-note">Equip it in the Wardrobe</span>'}
          </div>`;
        })()}`;
    }).join('');
    content.innerHTML = `
      <p class="note" style="text-align:center;margin-top:4px">Every piece you have ever owned is here for good, even the ones you melted. Locked pieces stay hidden until you find them.</p>
      ${sections}`;
    $$('[data-look-info]', content).forEach(c => c.addEventListener('click', () => {
      S.lookInspect = S.lookInspect === c.dataset.lookInfo ? null : c.dataset.lookInfo;
      popSound(S.sounds);
      renderCharacter(wrap, 'looks', { instant: true });
    }));
    $$('[data-look-locked]', content).forEach(c => c.addEventListener('click', () =>
      toast('Still out there. Crates, boss dens and the Glutton all drop new looks.', 2600)));
    $$('[data-wear-look]', content).forEach(b => b.addEventListener('click', () => {
      const it = BH_BY_ID[b.dataset.wearLook];
      S.wardrobeSlot = it.slot; S.lookPreview = it.id; S.lookInspect = null;
      renderCharacter(wrap, 'wardrobe');
      requestAnimationFrame(() => $('.look-bar')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }));
  }

  if (tab === 'talents') {
    content.innerHTML = '<div id="talBody" style="margin-top:6px"></div>';
    await renderTalents(content);
  }

  // The Shop lives here rather than on its own tabless route, which was only
  // reachable from two buttons buried inside other sheets. renderShop owns its
  // own re-render, so it just needs a container.
  if (tab === 'shop') await renderShop(content);

  if (tab === 'crates') {
    await migrateLegacyEggs();
    const [invAll, lifeSteps, pendingLoot, ingInv, foodActive, cook, dust, pCounts, gearLoNow] = await Promise.all([inventory(), lifetimeStepsSum(), kvGet('denloot', []), ingredients(), activeFoodBuffs(), cookState(), boneDust(), petCounts(), gearLoadout()]);
    const eggs = invAll.filter(r => r.kind === 'egg').sort((a, b) => a.ts - b.ts);
    const ownedPets = invAll.filter(r => r.kind === 'cos' && BH_BY_ID[r.itemId] && BH_BY_ID[r.itemId].slot === 'C').map(r => BH_BY_ID[r.itemId]);
    const pCountTotal = Object.values(pCounts).reduce((a, n) => a + n, 0);
    content.innerHTML = `
      ${(pendingLoot || []).length ? `<div class="t3-sect" style="margin-top:2px"><b>Boss loot · keep one per drop</b><i></i></div>
      ${pendingLoot.map((p, i) => `
        <div class="loot-pending" data-lootkey="${esc(p.key)}">
          <small>${esc(p.den)} dropped:</small>
          <div class="loot-cards">${p.choices.map(id => GEAR_BY_ID[id] ? lootCardHtml(GEAR_BY_ID[id]) : '').join('')}</div>
          <button class="btn loot-keep" disabled>Tap a piece to preview</button>
        </div>`).join('')}` : ''}
      ${/* Tier 3 (mockup t3-backpack.html): crates as crackable cells with a
            quantity badge, the egg as a card with its own bar, consumables as
            rows. Crates group BY TYPE now: eight identical rows each saying
            "Golden Crate / Open" was a list to grind, not a stash to raid. */''}
      <div class="t3-sect"><b>Crates · tap to crack</b><i></i>${crates.length ? `<span class="r chip" style="font-size:11px">${crates.length} to open</span>` : ''}</div>
      ${crates.length ? `<div class="t3-cells">${(() => {
        const byType = new Map();
        for (const c of crates) { if (!byType.has(c.crate)) byType.set(c.crate, []); byType.get(c.crate).push(c); }
        return [...byType.entries()].map(([kind, list]) => {
          const def = CRATES[kind] || CRATES.daily;
          return `<div class="t3-cell">
            ${list.length > 1 ? `<span class="t3-qty">${list.length}</span>` : ''}
            <span class="art">${crateIcon(kind, 56)}</span>
            <b>${esc(def.label).toUpperCase()}</b>
            <button class="btn" data-open="${list[0].id}">OPEN</button>
          </div>`;
        }).join('');
      })()}</div>` : '<p class="note" style="text-align:center;padding:12px 0 16px">No unopened crates. Finish quests, close days on budget, and walk 10k steps to earn more.</p>'}
      ${eggs.length ? `<div class="t3-sect"><b>Incubating</b><i></i></div>
      ${eggs.map(e => {
        const p = eggProgress(e, lifeSteps);
        const pct = Math.min(100, Math.round(p.walked / p.goal * 100));
        return `<div class="t3-egg" style="margin-bottom:9px">
          <span class="art">${crateIcon('egg', 46)}</span>
          <div class="tx">
            <b>${p.ready ? 'READY TO HATCH' : 'STEP EGG'}</b>
            <div class="bar"><i style="width:${pct}%"></i></div>
            <small>${p.walked.toLocaleString()} / ${p.goal.toLocaleString()} steps${p.ready ? ' · a pet is inside' : ` · ${(p.goal - p.walked).toLocaleString()} to go`}</small>
          </div>
          ${p.ready ? `<button class="btn" style="width:auto;padding:9px 16px;font-size:16px;box-shadow:var(--sh-sm)" data-hatch="${e.id}">HATCH</button>` : ''}
        </div>`;
      }).join('')}` : ''}
      <div class="t3-sect"><b>Consumables</b><i></i></div>
      <div class="t3-row">
        <span class="t3-med">${consumableIcon('xp2', 20)}</span>
        <div class="t3-tx"><b>Battle Charm</b><small>${CONSUMABLES.xp2.desc}</small></div>
        <span class="t3-lock">x${boosts}</span>
        ${boosts ? '<button class="btn" id="useBoost">USE</button>' : ''}
      </div>
      <div class="t3-row">
        <span class="t3-med">${consumableIcon('vigor', 20)}</span>
        <div class="t3-tx"><b>Vigor Draught</b><small>${CONSUMABLES.vigor.desc}</small></div>
        <span class="t3-lock">x${vigors}</span>
        ${vigors ? '<button class="btn" id="useVigor">USE</button>' : ''}
      </div>
      ${boost ? `<p class="note" style="margin:6px 2px">${consumableIcon('xp2', 14)} Charm active: ${boost} Pit win${boost === 1 ? '' : 's'} left at +25% coins</p>` : ''}
      <div class="t3-sect"><b>Kitchen · food &amp; buffs</b><i></i></div>
      ${(foodActive || []).length ? (foodActive.map(b => `<div class="crate-row"><span class="crate-ico">${b.icon || '🍲'}</span><div style="flex:1"><b>${esc(b.name || 'Dish')} active</b><small>${b.kind === 'combat' ? `${b.fightsLeft} fight${b.fightsLeft === 1 ? '' : 's'} left` : `${Math.max(0, Math.ceil((b.untilMs - Date.now()) / 3600e3))}h left`}</small></div></div>`).join('')) : '<p class="note" style="margin:2px 2px 6px">No dish active. Cook one in the Kitchen for a Pit or coin buff.</p>'}
      ${(() => { const busy = cook.slots.filter(s => !s.empty); if (!busy.length) return ''; const rc = cook.readyCount, cc = busy.length - rc; const label = rc && cc ? `${rc} ready · ${cc} cooking` : rc ? `${rc} dish${rc === 1 ? '' : 'es'} ready!` : `${cc} cooking...`; return `<div class="crate-row"><span class="crate-ico">${rc ? '✅' : '🍳'}</span><div style="flex:1"><b>${label}</b><small>${busy.map(s => esc(s.recipe.name)).join(', ')}</small></div></div>`; })()}
      ${(() => { const owned = INGREDIENT_IDS.filter(id => (ingInv[id] || 0) > 0); return owned.length ? `<div class="ingredient-grid" style="margin-top:6px">${owned.map(id => `<div class="ing-cell"><span class="ing-ico">${ingIconHtml(id,26)}</span><span class="ing-n">${ingInv[id]}</span><span class="ing-name">${esc(INGREDIENTS[id].name)}</span></div>`).join('')}</div>` : '<p class="note" style="margin:2px 2px">No ingredients yet. Collect them on the Boneyard map.</p>'; })()}
      <button class="btn ghost small" id="bpKitchen" style="margin-top:8px">Open the Kitchen to cook</button>
      <div class="t3-sect"><b>Salvage Bench · nothing wasted</b><i></i></div>
      <div class="wallet-line"><span class="note">Bone Dust</span><b><span class="dust-ico">${ICONS.dust(13)}</span> ${dust.toLocaleString()}</b></div>
      <p class="note" style="margin:0 2px 8px">Melt gear you don't wear straight from the list below. Manage, breed, and destroy pets in the <b>Stable</b>. Bad drops and dupe eggs still pay off.</p>
      ${pCountTotal ? `<button class="btn small" id="openStableFromBp">Open the Stable (${pCountTotal} ${pCountTotal === 1 ? 'pet' : 'pets'})</button>` : ''}
      ${(() => {
        const rows = invAll.filter(r => r.kind === 'gear' && GEAR_BY_ID[r.gearId]).map(r => GEAR_BY_ID[r.gearId])
          .sort((a, b) => RAR_ORDER.indexOf(a.rarity) - RAR_ORDER.indexOf(b.rarity));
        if (!rows.length) return '';
        const totalDust = rows.reduce((a, g) => a + gearDustValue(g), 0);
        // Tick as many as you like, melt them in ONE confirm. Melting used to be
        // two taps per piece, and the Wardrobe cannot melt cosmetic-only pieces at
        // all because tapping one opens the equip sheet. Clearing a backlog of
        // twenty spare drops was the worst chore in the game.
        const spare = rows.filter(g => gearLoNow[g.slot] !== g.id);
        const hasStats = g => !!(g.stats && Object.keys(g.stats).length);
        // "junk" is the low-rarity tail, NOT stat-less gear: every catalog piece
        // carries stats, so a stat-less sweep would have selected nothing.
        const JUNK_RARITIES = new Set(['common', 'uncommon']);
        const junk = spare.filter(g => JUNK_RARITIES.has(g.rarity));
        return `<details class="melt-fold" style="margin-top:12px"><summary>Melt gear · ${rows.length} spare piece${rows.length === 1 ? '' : 's'} worth <span class="dust-ico">${ICONS.dust(13)}</span> ${totalDust.toLocaleString()}</summary>
          <button class="btn danger melt-go" id="meltGo" hidden></button>
          <div class="melt-tools">
            <button class="link" id="meltAll">Select all ${spare.length} unworn</button>
            ${junk.length && junk.length !== spare.length ? `<button class="link" id="meltJunk">Only the ${junk.length} junk</button>` : ''}
            <button class="link" id="meltNone">Clear</button>
          </div>` + rows.map(g => {
          const worn = gearLoNow[g.slot] === g.id;
          // WORN gear is listed but never bulk-selectable: losing the piece you are
          // wearing to a stray tap is not a mistake worth allowing.
          return `<label class="crate-row melt-row${worn ? ' worn' : ''}">
            <input type="checkbox" class="melt-pick" data-meltsel="${g.id}" data-dust="${gearDustValue(g)}" data-junk="${JUNK_RARITIES.has(g.rarity) ? '1' : '0'}"${worn ? ' disabled' : ''}>
            <span class="crate-ico"><img src="${bhAsset(BH_BY_ID[g.artId])}" alt="" style="width:27px;height:27px;object-fit:contain"></span>
            <div style="flex:1"><b>${esc(g.name)}</b><small>${RARITIES[g.rarity].label} · ${esc(GEAR_SLOT_LABELS[g.slot] || g.slot)}${worn ? ' · <b>worn, tap to melt on its own</b>' : ''}</small><small>${
              hasStats(g) ? `<span class="melt-stat">${esc(gearLabel(g))}${g.talent ? ` ${ICONS.boltIco(11)} ${esc(g.talentName)}` : ''}</span>` : '<span class="melt-nostat">no stats · looks only</span>'
            }</small></div>
            ${worn ? `<button class="btn small danger" data-meltbench="${g.id}">+${gearDustValue(g)} dust</button>`
                   : `<span class="melt-val">+${gearDustValue(g)}</span>`}
          </label>`;
        }).join('') + `</details>`;
      })()}`;
    $('.melt-fold', content)?.addEventListener('toggle', e => {
      if (e.target.open) e.target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    $$('.loot-pending', content).forEach(scope => {
      wireLootChoice(scope, gid => claimDenLoot(scope.dataset.lootkey, gid), picked => {
        toast(`${picked.name} claimed. Equip it in your Wardrobe.`, 3200);
        setTimeout(() => renderCharacter(wrap, 'crates'), 900);
      });
    });
    $$('[data-hatch]', content).forEach(b => b.addEventListener('click', async () => {
      const res = await hatchEgg(b.dataset.hatch);
      if (!res.ready) { toast('Keep walking: this egg is not ready yet.'); return; }
      trackEvent('hatch');
      await refreshShinyPets();
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
    $('#useVigor', content)?.addEventListener('click', async () => {
      if (await consumeConsumable('vigor')) { const e = await addVigor(VIGOR_DRAUGHT_AMOUNT); popSound(S.sounds); toast(`Vigor Draught drunk: +${VIGOR_DRAUGHT_AMOUNT} Vigor. You have ${e.ready} Pit fights ready.`, 3000); }
      renderCharacter(wrap, 'crates');
    });
    $('#openStableFromBp', content)?.addEventListener('click', () => openStable());
    // ---- bulk melt: tick pieces, one confirm ----
    const meltPicks = () => $$('.melt-pick', content).filter(c => c.checked && !c.disabled);
    const syncMeltBar = () => {
      const go = $('#meltGo', content);
      if (!go) return;
      const picks = meltPicks();
      const dust = picks.reduce((a, c) => a + (parseInt(c.dataset.dust, 10) || 0), 0);
      go.hidden = !picks.length;
      go.dataset.armed = '0';
      go.innerHTML = `Melt ${picks.length} piece${picks.length === 1 ? '' : 's'} · <span class="dust-ico">${ICONS.dust(13)}</span> +${dust.toLocaleString()}`;
    };
    $$('.melt-pick', content).forEach(c => c.addEventListener('change', syncMeltBar));
    $('#meltAll', content)?.addEventListener('click', e => {
      e.preventDefault();
      $$('.melt-pick', content).forEach(c => { if (!c.disabled) c.checked = true; });
      syncMeltBar();
    });
    $('#meltJunk', content)?.addEventListener('click', e => {
      e.preventDefault();
      // the sweep Tom asked for: clear the good stuff, tick only the cosmetics
      $$('.melt-pick', content).forEach(c => { c.checked = !c.disabled && c.dataset.junk === '1'; });
      syncMeltBar();
    });
    $('#meltNone', content)?.addEventListener('click', e => {
      e.preventDefault();
      $$('.melt-pick', content).forEach(c => { c.checked = false; });
      syncMeltBar();
    });
    $('#meltGo', content)?.addEventListener('click', async () => {
      const go = $('#meltGo', content);
      const picks = meltPicks();
      if (!picks.length) return;
      // arm-then-confirm, because this destroys several pieces at once and there
      // is no undo. The count is in the label both times so you can see the size
      // of what you are about to do.
      if (go.dataset.armed !== '1') {
        go.dataset.armed = '1';
        const label = go.innerHTML;
        go.textContent = `Tap again to melt ${picks.length}`;
        setTimeout(() => { if (go.isConnected && go.dataset.armed === '1') { go.dataset.armed = '0'; go.innerHTML = label; } }, 3000);
        return;
      }
      go.disabled = true;
      let dust = 0, n = 0;
      for (const c of picks) {
        const res = await disenchantGear(c.dataset.meltsel);
        if (res.ok) { dust += res.dust; n++; c.closest('.melt-row')?.remove(); }
      }
      go.disabled = false;
      popSound(S.sounds);
      toast(n ? `${n} piece${n === 1 ? '' : 's'} melted into ${dust.toLocaleString()} Bone Dust.` : 'Nothing melted.', 2800);
      renderCharacter(wrap, 'crates');   // one re-render at the end, not per piece
    });

    $$('[data-meltbench]', content).forEach(btn => btn.addEventListener('click', async () => {
      // arm-then-confirm, same contract as the Wardrobe melt
      if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; const t = btn.textContent; btn.textContent = 'Tap to confirm'; setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = '0'; btn.textContent = t; } }, 2600); return; }
      const res = await disenchantGear(btn.dataset.meltbench);
      if (!res.ok) { toast('Could not melt that piece.'); return; }
      popSound(S.sounds);
      toast(`${res.name} melted into ${res.dust} Bone Dust.`, 2200);
      // melt in place (no full re-render) so the list doesn't jump to the top —
      // you can melt a whole stack of spare gear in one pass.
      btn.closest('.crate-row')?.remove();
      const fold = content.querySelector('.melt-fold');
      const left = $$('[data-meltbench]', content);
      if (fold && !left.length) { fold.remove(); }
      else if (fold) {
        const total = left.reduce((a, b) => a + (parseInt((b.textContent.match(/\d+/) || [0])[0], 10) || 0), 0);
        const sum = fold.querySelector('summary');
        if (sum) sum.innerHTML = `Melt gear · ${left.length} spare piece${left.length === 1 ? '' : 's'} worth <span class="dust-ico">${ICONS.dust(13)}</span> ${total.toLocaleString()}`;
      }
      const nd = await boneDust();
      content.querySelectorAll('.wallet-line b').forEach(b => { if (b.querySelector('.dust-ico')) b.innerHTML = `<span class="dust-ico">${ICONS.dust(13)}</span> ${nd.toLocaleString()}`; });
    }));
    $$('[data-dustbuy]', content).forEach(btn => btn.addEventListener('click', async () => {
      // A single tap used to spend on the spot. Tom lost 25 dust just looking at
      // what a Battle Charm was. Now the first tap only ARMS the cell (and the
      // card already states what the item does), so buying takes intent.
      if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        btn.classList.add('arming');
        const prev = btn.innerHTML;
        btn.innerHTML = `<span class="crate-ico">${ICONS.coin(26)}</span><b>Spend ${btn.dataset.cost}?</b><small class="dc-desc">tap again to buy</small><small>tap elsewhere to cancel</small>`;
        clearTimeout(btn._armT);
        btn._armT = setTimeout(() => {
          if (!btn.isConnected) return;
          btn.dataset.armed = '0'; btn.classList.remove('arming'); btn.innerHTML = prev;
        }, 3200);
        return;
      }
      clearTimeout(btn._armT);
      btn.disabled = true;
      const res = await buyWithDust(btn.dataset.dustbuy);
      if (!res.ok) { toast(res.reason === 'dust' ? `Need ${res.need} Bone Dust (you have ${res.have}).` : 'Could not buy that.'); btn.disabled = false; return; }
      popSound(S.sounds);
      toast(res.id === 'egg' ? 'Egg incubating. Walk to hatch it.' : res.id === 'crate-daily' ? 'Common Crate added. Open it above.' : 'Added to your consumables.', 2800);
      renderCharacter(wrap, 'crates');
    }));
    $('#bpKitchen', content)?.addEventListener('click', () => openKitchen());
    $$('[data-buy]', content).forEach((b => {
      let t = null;
      const reset = () => { b.dataset.armed = '0'; b.textContent = b.dataset.label || b.textContent; };
      b.addEventListener('click', async () => {
        if (b.dataset.armed !== '1') {
          b.dataset.label = b.dataset.label || b.textContent;
          b.dataset.armed = '1'; b.textContent = 'Tap again to buy';
          clearTimeout(t); t = setTimeout(() => { if (b.isConnected) reset(); }, 2600);
          return;
        }
        clearTimeout(t); reset();
        const r = await buyShopItem(b.dataset.buy);
        if (!r.ok) { toast(`Not enough coins. That costs ${r.need}, you have ${r.have}.`, 2600); return; }
        popSound(S.sounds);
        toast(`${r.label} bought. −${r.cost} coins, ${r.coins} left. You now have ${r.owned}.`, 3000);
        renderCharacter(wrap, 'crates');
      });
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
  // restore scroll for in-page re-renders (equip/salvage) so the view doesn't jump.
  // Twice: once now, once after layout, because images finishing decode can change
  // the content height and re-clamp the offset.
  if (keepScroll != null) {
    scroller.scrollTop = keepScroll;
    requestAnimationFrame(() => { scroller.scrollTop = keepScroll; });
  }
}

// kept as an alias: some entry points still ask for "progress"
function openProgressSheet() { return openCharacter('progress'); }

// what each gear-granted talent actually DOES (so loot can be compared, not just named)
const TALENT_DESC = Object.fromEntries(TALENT_TREES.flatMap(t => t.nodes.map(n => [n.id, n.desc])));

// Turn a gear def into a pack card (same format as the loot reveal).
function gearToCard(g) {
  return {
    id: g.id, imgSrc: bhAsset(BH_BY_ID[g.artId]), name: g.name, rarity: g.rarity,
    kind: `GEAR · ${GEAR_SLOT_LABELS[g.slot]}${g.minLevel > 1 ? ` · Lv ${g.minLevel}` : ''}`,
    stats: `${gearLabel(g)}${g.talent ? `<div class="pc-perk">${ICONS.boltIco(13)} ${esc(g.talentName)}</div><div class="pc-perk-desc">${esc(TALENT_DESC[g.talent] || 'special ability')}</div>` : ''}`,
  };
}
function lootCardHtml(g) { return packCardHtml(gearToCard(g), { selectable: true }); }

// Select-then-confirm for a boss loot drop: the choices show side-by-side as pack
// cards; tapping PREVIEWS/selects (never commits), an explicit Keep button claims.
// `scope` wraps the .loot-cards + a .loot-keep button. claimFn(gearId) -> picked|null.
function wireLootChoice(scope, claimFn, onDone) {
  hydratePackArt(scope);
  const cards = $$('.pack-card.selectable', scope);
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
    // the piece you KEPT stays bright + gets a "kept" ring; the one you left
    // behind greys out. (Previously inverted: it greyed the kept one.)
    cards.forEach(c => { const won = c.dataset.gear === sel; c.classList.toggle('kept', won); c.classList.toggle('taken', !won); c.classList.remove('selected'); c.disabled = true; });
    if (keep) { keep.disabled = true; keep.textContent = `${picked.name} kept`; }
    confettiBurst(innerWidth / 2, innerHeight * 0.4, 22);
    popSound(S.sounds);
    onDone?.(picked);
  });
}

function petPanelHtml(petId, fighter) {
  const fam = familyOf(petId);
  const meta = fighter.petMeta && fighter.petMeta.id === petId ? fighter.petMeta : { level: petLevel(0), picks: [], steps: 0 };
  const lvl = meta.level, picks = meta.picks;
  const toNext = petStepsToNext(meta.steps || 0);
  const tree = PET_TREES[fam.key];
  const passives = { yourDamage: 'your attacks hit harder', damageTaken: 'you take less damage', hypeGain: 'you build Hype faster' };
  const shiny = S.shinyPets.has(petId);
  const lineage = meta.lineage || 0;
  const rarity = (BH_BY_ID[petId] || {}).rarity || 'common';
  const bs = petBattleStats(petId, lvl, shiny, lineage); // intrinsic battle stats (rarity + tilt + shiny + lineage)
  const statLine = `<span class="pet-stats"><b>${bs.power}</b> PWR · <b>${bs.hp}</b> HP · <b>${bs.reflex}</b> REF</span>`;
  return `
    <div class="pet-card r-${rarity} lin-${Math.min(lineage, 6)}${shiny ? ' is-shiny' : ''}">
      ${petSpriteHtml(petId, 60)}
      <div class="pet-card-meta">
        <b>${esc(fam.name)}${lineage ? ` <span class="lin-tag">${ICONS.star(11)}${lineage}</span>` : ''}${shiny ? ` <span class="shiny-tag">${sparkIco(10)} SHINY</span>` : ''} <span class="pet-role" style="color:${fam.color}">${fam.role}</span></b>
        <small><span class="rar-lbl r-${rarity}">${(RARITIES[rarity] || {}).label || rarity}</span> · Pet level ${lvl}${lvl < PET_MAX_LEVEL ? ` · ${toNext.toLocaleString()} steps to Lv ${lvl + 1}` : ' · maxed'}</small>
        ${statLine}
        <span class="note" style="font-size:11.5px">${esc(fam.blurb)} Passive: ${passives[fam.passive]}.${shiny ? ' Shiny: +8%.' : ''}${lineage ? ` Lineage ${lineage}: +${lineage * 5}% to all stats.` : ''}</span>
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

const RAR_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// Trim an image to its non-transparent content and draw it CENTERED + as large as
// fits into the canvas. Fixes art (pets, gear, cosmetics) that sits parked in a
// corner of its 640x640 sprite sheet so it fills the reveal card instead.
function drawTrimmedArt(canvas, src, pad = 0.08) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const off = document.createElement('canvas'); off.width = iw; off.height = ih;
      const octx = off.getContext('2d'); octx.drawImage(img, 0, 0);
      let x0 = iw, y0 = ih, x1 = 0, y1 = 0, found = false;
      try {
        const d = octx.getImageData(0, 0, iw, ih).data;
        for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
          if (d[(y * iw + x) * 4 + 3] > 14) { found = true; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
      } catch { /* tainted; use full image */ }
      if (!found) { x0 = 0; y0 = 0; x1 = iw - 1; y1 = ih - 1; }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      const cw = canvas.width, ch = canvas.height, p = 1 - pad * 2;
      // Upscale cap + two-step scaling keep small source art (e.g. a 43px
      // grillz) BOLD and crisp instead of smoothing it into mush: an integer
      // nearest-neighbor step preserves the hard cartoon outlines, then one
      // small smooth pass removes the jaggies. (Art style: clean thick lines.)
      const scale = Math.min(cw * p / bw, ch * p / bh, 7);
      const dw = bw * scale, dh = bh * scale;
      const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, cw, ch);
      let src = img, sx = x0, sy = y0, sw = bw, sh = bh;
      const k = Math.min(3, Math.floor(scale));
      if (k >= 2) {
        const off2 = document.createElement('canvas'); off2.width = bw * k; off2.height = bh * k;
        const o2 = off2.getContext('2d'); o2.imageSmoothingEnabled = false;
        o2.drawImage(img, x0, y0, bw, bh, 0, 0, bw * k, bh * k);
        src = off2; sx = 0; sy = 0; sw = bw * k; sh = bh * k;
      }
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, sx, sy, sw, sh, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      res();
    };
    img.onerror = () => res();
    img.src = src;
  });
}

// Shared pack-card markup. card: {imgSrc?|iconHtml?, name, rarity, kind, stats, id?}.
// Image art uses a canvas that hydratePackArt() fills (trimmed + centered).
function packCardHtml(c, { selectable = false } = {}) {
  const rar = RARITIES[c.rarity] || RARITIES.common;
  const holo = RAR_ORDER.indexOf(c.rarity) >= 2 ? ' holo' : '';
  const art = c.imgSrc ? `<canvas class="pc-canvas" width="600" height="600" data-art="${esc(c.imgSrc)}"></canvas>` : `<div class="pc-icon">${c.iconHtml || ''}</div>`;
  const sparks = RAR_ORDER.indexOf(c.rarity) >= 3
    ? `<span class="pc-spark k1">${sparkIco(16)}</span><span class="pc-spark k2">${sparkIco(11)}</span><span class="pc-spark k3">${sparkIco(12)}</span><span class="pc-spark k4">${sparkIco(15)}</span>`
    : '';
  /* name + rarity + stats sit on a bottom PLATE. The rarity is a chip tinted by
     the card's own .r-<rarity> class, not inline-coloured text, so the frame and
     the label can never disagree about what you just pulled. */
  const inner = `<div class="pc-foil"></div><div class="pc-glare"></div>${sparks}`
    + `<div class="pc-kind">${esc(c.kind || '')}</div>`
    + `<div class="pc-art">${art}</div>`
    + `<div class="pc-plate"><div class="pc-name">${esc(c.name)}</div>`
    + `<div class="pc-rar">${rar.label}</div>`
    + `${c.stats ? `<div class="pc-stats">${c.stats}</div>` : ''}</div>`;
  return selectable
    ? `<button class="pack-card selectable r-${c.rarity}${holo}" data-gear="${esc(c.id || '')}" aria-pressed="false">${inner}</button>`
    : `<div class="pack-card r-${c.rarity}${holo}">${inner}</div>`;
}
function hydratePackArt(scope, sel = '.pc-canvas[data-art]') {
  return Promise.all($$(sel, scope)
    .map(cv => drawTrimmedArt(cv, cv.getAttribute('data-art'), parseFloat(cv.getAttribute('data-pad')) || undefined)));
}

// Pokemon-pack-crack reveal: cards you flip through one at a time, big centered
// art, rarity foil (holo for rare+), name + stats. Tap or swipe to advance; the
// last card dismisses. cards: [{imgSrc?|iconHtml?, name, rarity, kind, stats}].
function openPackReveal(cards, { coins = 0, crate = null, footerNote = '' } = {}) {
  if (!cards.length && !coins) return Promise.resolve();
  // Warm every card's art up front so flicking through a multi-card pack never
  // waits: by the time you tap to advance, the next one is already decoded.
  for (const c of cards) {
    const src = c.imgSrc || c.art;
    if (src) { const im = new Image(); im.src = src; }
  }
  return new Promise(resolve => {
    /* a TAKEOVER, not a sheet over a live screen: this is the payoff. The count
       is pips you can read at a glance instead of a grey "1 / 3". */
    const wrap = openSheet(`
      <div class="reveal-take">
        <div class="grainy"></div>
        <div class="pack-reveal" id="packReveal">
          ${cards.length > 1 ? `<div class="pack-pips" id="packCount">${cards.map(() => '<i></i>').join('')}</div>` : ''}
          <div class="pack-stage" id="packStage"></div>
          <div class="pack-foot" id="packFoot">${cards.length ? '<span class="pack-hint">tap or swipe</span>' : ''}${footerNote ? `<span class="pack-coins">${footerNote}</span>` : ''}${coins ? `<span class="pack-coins">+${coins} ${ICONS.coin(14)} coins</span>` : ''}</div>
        </div>
      </div>`, { cls: 'takeover', onClose: () => setFxLayer() });
    setFxLayer(305);   // particles burst BEHIND the card, never across its name
    const stage = $('#packStage', wrap), countEl = $('#packCount', wrap);
    let i = 0;
    const done = () => { history.back(); setTimeout(resolve, 150); };
    const advance = () => { i++; if (i >= cards.length) return done(); renderCard(); };
    function renderCard() {
      const c = cards[i];
      if (countEl) $$('i', countEl).forEach((p, n) => {
        p.classList.toggle('done', n < i);
        p.classList.toggle('on', n === i);
      });
      const tier = RAR_ORDER.indexOf(c.rarity);
      const reduced = reducedMotion || navigator.webdriver;
      // god-rays behind rare+, a bloom flash for epic+, then the tiltable card
      stage.innerHTML =
        (tier >= 2 ? `<div class="pack-rays r-${c.rarity}"></div>` : '') +
        (tier >= 3 ? '<div class="pack-flash"></div>' : '') +
        `<div class="pack-tilt${reduced ? '' : ' swaying'}">${packCardHtml(c)}</div>`;
      const tilt = $('.pack-tilt', stage), card = $('.pack-card', stage), glare = $('.pc-glare', stage);
      // Art first, THEN the entrance. The card used to fly in with an empty art
      // panel and fill itself a moment later, which robbed the payoff. Capped so
      // a slow asset delays the reveal rather than blocking it forever.
      card.classList.add('art-wait');
      Promise.race([hydratePackArt(stage), new Promise(r => setTimeout(r, 700))]).then(() => {
        card.classList.remove('art-wait');
        requestAnimationFrame(() => card.classList.add('in'));
        if (tier >= 4) { confettiRain(95); levelSound(S.sounds); haptic.reward(); }   // legendary
        else if (tier >= 2) { confettiBurst(innerWidth / 2, innerHeight * 0.42, tier >= 3 ? 26 : 18); levelSound(S.sounds); haptic.success(); }
        else { sparkleSound(S.sounds); haptic.tap(); }
      });

      let sx = 0, dx = 0, pid = null;
      const settle = () => { tilt.style.transform = ''; if (!reduced) tilt.classList.add('swaying'); if (glare) glare.style.opacity = 0; };
      tilt.addEventListener('pointerdown', e => { pid = e.pointerId; sx = e.clientX; dx = 0; try { tilt.setPointerCapture(pid); } catch {} tilt.classList.remove('swaying'); tilt.style.transition = 'none'; });
      tilt.addEventListener('pointermove', e => {
        if (pid != null) { // dragging → fling
          dx = e.clientX - sx; tilt.style.transform = `translateX(${dx}px) rotate(${(dx * 0.05).toFixed(2)}deg)`; return;
        }
        if (reduced) return; // hover → 3D tilt + moving glare (desktop/pointer)
        const r = tilt.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        tilt.classList.remove('swaying');
        tilt.style.transition = 'transform .08s ease-out';
        tilt.style.transform = `rotateX(${((0.5 - py) * 16).toFixed(1)}deg) rotateY(${((px - 0.5) * 18).toFixed(1)}deg)`;
        if (glare) { glare.style.setProperty('--mx', (px * 100).toFixed(0) + '%'); glare.style.setProperty('--my', (py * 100).toFixed(0) + '%'); glare.style.opacity = 1; }
      });
      const end = () => {
        if (pid == null) return; pid = null; tilt.style.transition = '';
        if (Math.abs(dx) > 80) { tilt.style.transform = `translateX(${dx > 0 ? 680 : -680}px) rotate(${dx > 0 ? 20 : -20}deg)`; tilt.style.opacity = '0'; setTimeout(advance, 170); }
        else settle();
      };
      tilt.addEventListener('pointerup', end);
      tilt.addEventListener('pointercancel', end);
      tilt.addEventListener('pointerleave', () => { if (pid == null) settle(); });
      // The listener has to sit on TILT, not on the card. pointerdown calls
      // setPointerCapture(tilt), and a captured pointer delivers its click to the
      // capture element, so a click bound to the card (a child) never fired: the
      // footer said "tap or swipe" while only swiping worked. Measured with an
      // event probe, not guessed.
      tilt.addEventListener('click', () => { if (Math.abs(dx) < 6) advance(); });
    }
    const start = () => { if (cards.length) renderCard(); else setTimeout(done, 700); };
    if (crate) {
      stage.innerHTML = `<div class="crate-shake pack-crate">${crateIcon(crate, 120)}</div>`;
      sparkleSound(S.sounds);
      setTimeout(() => { confettiBurst(innerWidth / 2, innerHeight * 0.42, 22); start(); }, 850);
    } else start();
  });
}

// Normalize a crate result row into a pack card.
function crateResultToCard(r) {
  if (r.type === 'consumable') { const c = CONSUMABLES[r.consumable]; return { iconHtml: consumableIcon(r.consumable, 130), name: c.label, rarity: 'uncommon', kind: 'ITEM', stats: esc(c.desc) }; }
  if (r.type === 'ingredient') { const ing = INGREDIENTS[r.ingredient]; return { iconHtml: ingIconHtml(ing.id, 130), name: ing.name, rarity: 'common', kind: 'INGREDIENT', stats: 'Cooking ingredient' }; }
  if (r.type === 'gear' || r.type === 'geardupe') {
    const g = r.gear, dup = r.type === 'geardupe';
    return { imgSrc: bhAsset(BH_BY_ID[g.artId]), name: g.name, rarity: g.rarity, kind: dup ? 'GEAR · DUPE' : 'GEAR',
      stats: dup ? `Duplicate → +${r.coins} ${ICONS.coin(11)}` : `${gearLabel(g)}${g.minLevel > 1 ? ` · Lv ${g.minLevel}` : ''}${g.talent ? `<br>${ICONS.boltIco(12)} ${esc(g.talentName)}` : ''}` };
  }
  const isPet = r.item && r.item.slot === 'C';
  if (r.type === 'dupe') return { imgSrc: bhAsset(r.item), name: r.item.name, rarity: r.item.rarity, kind: isPet ? 'PET · DUPE' : 'DUPE', stats: `Duplicate → +${r.coins} ${ICONS.coin(11)}` };
  return { imgSrc: bhAsset(r.item), name: r.item.name, rarity: r.item.rarity, kind: isPet ? 'PET' : (esc((BH_SLOTS.find(s => s.code === r.item.slot) || {}).label || 'COSMETIC').toUpperCase()), stats: '' };
}

async function openCrateReveal(result) {
  const cards = (result.results || []).map(crateResultToCard).filter(Boolean);
  return openPackReveal(cards, { coins: result.coins, crate: result.crate });
}

/* ================= Apple Health bridge ================= */

// Health-sync watchdog: Apple Health can silently stop delivering steps (Tom got
// burned). Every successful steps ingest stamps hkLastSync; the home screen shows a
// fix-it banner + fires one notification when the stamp goes stale while connected.
const HK_STALE_MS = 36 * 3600e3;
async function hkStaleInfo() {
  if (!S.settings.hkConnected) return null;
  let last = await kvGet('hkLastSync', null);
  if (!last) {
    // pre-watchdog installs: seed from the newest day that has steps
    const latest = (await db.all('health')).filter(r => r.steps != null).map(r => r.date).sort().pop();
    if (!latest) return null;
    last = Date.parse(latest) + 24 * 3600e3;
    await kvSet('hkLastSync', last);
  }
  const ms = Date.now() - last;
  if (ms < HK_STALE_MS) return null;
  return { hours: Math.round(ms / 3600e3), days: Math.floor(ms / 86400e3) };
}

async function ingestHealth(payload, { celebrate = true } = {}) {
  const existing = await db.get('health', payload.date);
  const row = { ...(existing || {}), date: payload.date };
  if (payload.steps != null) row.steps = payload.steps;
  if (payload.activeKcal != null) row.activeKcal = payload.activeKcal;
  if (payload.exerciseMin != null) row.exerciseMin = payload.exerciseMin;
  if (payload.workouts != null) row.workouts = payload.workouts;
  if (Array.isArray(payload.wtypes)) row.wtypes = payload.wtypes;
  if (payload.restingHr != null) row.restingHr = payload.restingHr;
  if (payload.hrv != null) row.hrv = payload.hrv;
  // (hkHeartOk retired in v224: a single boolean could not tell which scopes were
  // granted, so it blocked the sheet for every scope added after heart. See
  // HK_SCOPES_V.)
  // Auto sleep read (last night). Skip if the player hand-logged sleep for this
  // date (sleepManual) so a manual override sticks for the day.
  // Sleep actually read: stop re-requesting the scope (see HK_SCOPES_V).
  if (payload.sleepMin != null && payload.sleepMin > 0) await kvSet('hkScopesV', HK_SCOPES_V);
  // Keep the plugin's own account of the sleep read, so a failure is inspectable
  // in Settings instead of being invisible. Includes the case where it found
  // nothing, which is the case that took three rounds to pin down.
  if (payload.sleepDiag) await kvSet('hkSleepDiag', { ...payload.sleepDiag, at: Date.now(), manual: !!row.sleepManual });
  if (payload.sleepMin != null && payload.sleepMin > 0 && !row.sleepManual) {
    row.sleepMin = payload.sleepMin;
    row.sleepDeepMin = payload.sleepDeepMin ?? null;
    row.sleepRemMin = payload.sleepRemMin ?? null;
    row.sleepCoreMin = payload.sleepCoreMin ?? null;
    row.sleepAwakeMin = payload.sleepAwakeMin ?? null;
    row.sleepStaged = !!payload.sleepStaged;
    row.sleepHours = Math.round(payload.sleepMin / 6) / 10; // 0.1h precision, keeps the sleep chart fed
    row.sleepAuto = true;
  }
  if (payload.exerciseMin != null) row.exerciseMin = payload.exerciseMin;
  if (payload.cycleKm != null) row.cycleKm = payload.cycleKm;
  if (payload.workouts != null) row.workouts = payload.workouts;
  if (payload.wtypes) row.wtypes = payload.wtypes;
  await db.put('health', row);
  if (payload.steps != null) { await kvSet('hkLastSync', Date.now()); await kvSet('hkStaleNotified', false); }
  if (payload.weightKg != null) {
    await db.put('weights', { date: payload.date, kg: payload.weightKg });
    await onWeighIn(payload.date);
  }
  if (!S.settings.hkConnected) { S.settings.hkConnected = true; await kvSet('settings', S.settings); }
  const game = await onHealthSync(payload.date, {
    steps: payload.steps, activeKcal: payload.activeKcal,
    exerciseMin: payload.exerciseMin, cycleKm: payload.cycleKm,
    workouts: payload.workouts, wtypes: payload.wtypes,
  });
  await checkPetLevelUp();
  const bits = [];
  if (payload.steps != null) bits.push(`${payload.steps.toLocaleString()} steps`);
  if (payload.activeKcal != null) bits.push(`${payload.activeKcal.toLocaleString()} active kcal`);
  if (payload.workouts) bits.push(`${payload.workouts} workout${payload.workouts === 1 ? '' : 's'}`);
  if (payload.cycleKm) bits.push(`${payload.cycleKm.toFixed(1)} km ride`);
  if (payload.weightKg != null) bits.push(`weight ${S.settings.units === 'kg' ? payload.weightKg.toFixed(1) + ' kg' : kgToLb(payload.weightKg).toFixed(1) + ' lb'}`);
  if (celebrate) {
    confettiBurst(innerWidth / 2, 160, 14);
    popSound(S.sounds);
    const extras = [game.workout ? '🏋️ Workout crate!' : '', ...(game.themed || [])].filter(Boolean);
    toast(`Health synced: ${bits.join(' · ')}${game.xp ? ` · +${game.xp} XP` : ''}${extras.length ? ' · ' + extras.join(' · ') : ''}`, 3600);
    if (game.newBadges.length) { queueCelebration({ newBadges: game.newBadges }); maybeCelebrate(); }
  }
  return bits;
}

// Pets level up from walking; when a new tier unlocks (Lv 2/4/6/8/10) the player
// earns a pet talent to pick. Leveling is a real grind now, so the pay-off has to
// LAND: a full-screen celebration (stat gains + talent CTA) when the app is idle,
// falling back to a toast only if a sheet/fight is already open. First sighting
// records silently (no retroactive spam).
async function checkPetLevelUp() {
  await creditEquippedPetSteps(); // only the equipped individual banks the steps you just walked
  const inst = await equippedPetInstance();
  if (!inst) return;
  const iid = inst.iid;
  const cur = petLevel(await petStepsForIid(iid));
  const seen = (await kvGet('petSeenLevel', {})) || {};
  const prev = seen[iid];
  if (prev == null) { seen[iid] = cur; await kvSet('petSeenLevel', seen); return; }
  if (cur <= prev) return;
  const newTalent = unlockedTiers(cur).length > unlockedTiers(prev).length;
  seen[iid] = cur; await kvSet('petSeenLevel', seen);
  const petName = (BH_BY_ID[inst.sp] && BH_BY_ID[inst.sp].name) || 'Your pet';
  // if something is already on screen (a fight, another sheet) don't hijack it
  if (sheetStack.length) {
    if (newTalent) { confettiRain(60); levelSound(S.sounds); toast(`🐾 ${petName} hit Lv ${cur} and unlocked a new talent — pick it in the Stable!`, 4600); }
    else { popSound(S.sounds); toast(`🐾 ${petName} reached Lv ${cur}!`, 3000); }
    return;
  }
  openPetLevelUp(inst.sp, cur, prev, newTalent, inst);
}

// Full-screen pet level-up reveal: the pet rises on a burst of rays, the new level
// stamps in, and the exact stat gains (and any freshly unlocked talent) are spelled
// out so the moment is unmistakable.
function openPetLevelUp(petId, level, prevLevel, newTalent, inst = null) {
  const fam = familyOf(petId);
  const petName = (BH_BY_ID[petId] && BH_BY_ID[petId].name) || fam.name;
  const shiny = inst ? !!inst.shiny : S.shinyPets.has(petId);
  const lineage = inst ? (inst.lineage || 0) : 0;
  const before = petBattleStats(petId, prevLevel, shiny, lineage);
  const after = petBattleStats(petId, level, shiny, lineage);
  const rows = [['PWR', before.power, after.power], ['HP', before.hp, after.hp], ['REF', before.reflex, after.reflex]];
  const gains = rows.map(([k, b, a]) => `<span class="pet-gain">${k} <b>${a}</b>${a > b ? ` <i>+${a - b}</i>` : ''}</span>`).join('');
  confettiRain(70); levelSound(S.sounds);
  const wrap = openSheet(`
    <div class="sheet-body" style="text-align:center;padding-top:12px">
      <div class="lvlup-stage"><div class="lvl-rays"></div><div class="bh-stage lg petlvl-avatar r-${(BH_BY_ID[petId] || {}).rarity || 'common'} lin-${Math.min(lineage, 6)}${shiny ? ' is-shiny' : ''}">${petPortraitHtml(petId, 104, shiny)}</div></div>
      <div class="lvl-stamp" style="font-size:30px">PET LEVEL ${level}!</div>
      <div class="cele-sub" style="font-size:15px;margin-top:2px">${esc(petName)}${lineage ? ` <span class="lin-tag">${ICONS.star(11)}${lineage}</span>` : ''}${shiny ? ` <span class="shiny-tag">${sparkIco(11)} SHINY</span>` : ''}</div>
      <div class="pet-gains">${gains}</div>
      ${newTalent ? `<div class="cele-bubble">New talent unlocked. Choose it in the Stable.</div>
        <button class="btn" id="petTalentBtn">Pick my talent</button>
        <div style="height:8px"></div>
        <button class="btn ghost" id="celeOk">Later</button>`
      : `<div style="height:16px"></div><button class="btn" id="celeOk">Nice</button>`}
      <div style="height:6px"></div>
    </div>`);
  $('#celeOk', wrap).addEventListener('click', () => history.back());
  const tb = $('#petTalentBtn', wrap);
  if (tb) tb.addEventListener('click', () => { history.back(); setTimeout(openStable, 260); });
}

const BREED_ERR = { 'pick-two': 'Pick two different pets.', gone: 'One of those pets is no longer here.', 'bad-species': 'Choose the offspring species.', cooldown: 'Walk a bit more before breeding again.', dust: 'Not enough Bone Dust.' };

// THE STABLE: the pet hub. Every pet you own, grouped by species, each individual
// copy showing its own level/lineage/shiny/stats with Equip / Breed / Destroy.
// Only the equipped pet levels. Breeding + the active pet's talent tree live here.
async function openStable() {
  let sel = [];      // iids flagged for breeding
  let offSp = null;
  // undefined = never chosen (open the active pet's tree); null = deliberately
  // CLOSED. Both used to be null, so render() re-opened the active pet's tree
  // every time you closed it and the control looked broken.
  let openIid;        // which pet's talent tree is expanded inline
  const wrap = openSheet(`
    <div class="sheet-head"><h2>The Stable</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body" id="stableBody"></div>`, { cls: 'full', onClose: () => { if (currentTab() === 'today') refresh(); } });
  async function render() {
    const body = $('#stableBody', wrap);
    if (!body) return;
    const [insts, eqIid, bank, st] = await Promise.all([petInstances(), equippedPetIid(), petLevelBank(), breedStatus()]);
    sel = sel.filter(iid => insts.some(x => x.iid === iid));
    // expanded talent tree: default to the active pet so it's visible right away
    if (openIid === undefined || (openIid !== null && !insts.some(x => x.iid === openIid))) openIid = eqIid;
    const openInst = insts.find(x => x.iid === openIid) || null;
    const openPicks = openInst ? await petPicks(openInst.sp) : [];
    // inline talent tree for one pet, rendered directly under its card
    const petTalentTree = (inst, lvl, picks) => {
      const fam = familyOf(inst.sp);
      const isEq = inst.iid === eqIid;
      const nextRow = PET_TREES[fam.key].find(row => lvl < row.tier);
      const nextHint = nextRow
        ? `<p class="tree-next">${ICONS.star(12)} Next talent at <b>Lv ${nextRow.tier}</b>${isEq ? ', keep walking this pet' : ', equip this pet to keep leveling it'} (top tier is Lv 10).</p>`
        : `<p class="tree-next">Every talent unlocked, this pet is fully trained.</p>`;
      let html = `<div class="pet-tree-inline"><p class="tree-head">${esc((BH_BY_ID[inst.sp] || {}).name || '')} talents${isEq ? ' · ACTIVE' : ''}</p>${nextHint}
        <div class="pet-tree">${PET_TREES[fam.key].map(row => `
          <div class="pet-tier ${lvl >= row.tier ? '' : 'locked'}">
            <span class="pet-tier-lbl">Lv ${row.tier}${lvl < row.tier ? ' · locked' : ''}</span>
            <div class="pet-opts">${row.opts.map(o => `<button class="pet-opt ${picks.includes(o.id) ? 'on' : ''}" data-petpick2="${o.id}" data-sp="${inst.sp}" data-tier="${row.tier}" data-lvl="${lvl}" ${lvl < row.tier ? 'disabled' : ''}><b>${esc(o.name)}</b><small>${esc(o.desc)}</small></button>`).join('')}</div>
          </div>`).join('')}</div>`;
      const sigObj = petSignature(inst.sp);
      if (sigObj) {
        const sigOn = lvl >= PET_MAX_LEVEL;
        html += `<div class="pet-sig ${sigOn ? 'on' : 'locked'}"><div class="pet-sig-h">${sparkIco(12)} Species Signature${sigOn ? '' : ` · Lv ${PET_MAX_LEVEL}`}</div><b>${esc(sigObj.name)}</b><small>${esc(sigObj.desc)}</small><span class="pet-sig-tag">${sigOn ? 'ACTIVE' : `unlocks at Lv ${PET_MAX_LEVEL}`}</span></div>`;
      }
      return html + `</div>`;
    };
    const bySp = {};
    for (const x of insts) (bySp[x.sp] = bySp[x.sp] || []).push(x);
    const order = Object.keys(bySp).sort((p, q) => RAR_ORDER.indexOf((BH_BY_ID[q] || {}).rarity) - RAR_ORDER.indexOf((BH_BY_ID[p] || {}).rarity));
    const a = sel[0] ? insts.find(x => x.iid === sel[0]) : null;
    const b = sel[1] ? insts.find(x => x.iid === sel[1]) : null;
    const pair = a && b;
    // offSp now holds the IID of the pet being KEPT, not a species. There is no
    // offspring under the feed model: the keeper is the same pet all the way
    // through, so the old "which one does it become?" question had no answer.
    if (pair && offSp !== a.iid && offSp !== b.iid) offSp = a.iid;
    const keeper = pair ? (offSp === b.iid ? b : a) : null;
    const spare = pair ? (offSp === b.iid ? a : b) : null;
    const offLineage = keeper ? (keeper.lineage || 0) + 1 : 0;
    const spareLvl = spare ? petLevel(bank[spare.iid] || 0) : 0;
    // "maybe you shouldn't": a shiny, a bred bloodline or a levelled pet is a
    // real loss, and the player has to be told BEFORE they commit.
    const spareIsPrecious = !!spare && (spare.shiny || (spare.lineage || 0) > 0 || spareLvl >= 5);
    const cost = breedCost(offLineage);
    const afford = st.dust >= cost;
    const canBreedNow = pair && st.ready && afford;

    const sections = order.map(sp => {
      const it = BH_BY_ID[sp] || {};
      const cards = bySp[sp].map(x => {
        const lvl = petLevel(bank[x.iid] || 0);
        const toNext = petStepsToNext(bank[x.iid] || 0);
        const bs = petBattleStats(sp, lvl, x.shiny, x.lineage || 0);
        const isEq = x.iid === eqIid;
        const inSel = sel.includes(x.iid);
        const isOpen = x.iid === openIid;
        const dustVal = petDustValue(it) + (x.shiny ? 15 : 0) + (x.lineage || 0) * 8;
        // Tier 3 (mockup t3-stable.html, approved 2026-08-07): the pet card joins
        // the Tier 2 trading-card language. Rarity IS the frame; the active pet's
        // frame goes lime. Level and ACTIVE are chips, growth is a bar.
        const span = lvl >= PET_MAX_LEVEL ? 0 : (PET_LEVEL_STEPS[lvl] || 0) - (PET_LEVEL_STEPS[lvl - 1] || 0);
        const pct = lvl >= PET_MAX_LEVEL ? 100 : Math.max(0, Math.min(100, Math.round((1 - toNext / Math.max(1, span)) * 100)));
        return `<div class="t3-petcard r-${it.rarity || 'common'} lin-${Math.min(x.lineage || 0, 6)}${x.shiny ? ' is-shiny' : ''}${isEq ? ' active' : ''}${inSel ? ' breedsel' : ''}${isOpen ? ' talk-open' : ''}" data-petsel="${x.iid}">
          <span class="portrait">${petPortraitHtml(sp, 60, x.shiny)}</span>
          <div class="tx">
            <div class="nm">
              <b>${esc(it.name || sp).toUpperCase()}</b>
              <span class="lv">LV ${lvl}</span>
              ${isEq ? '<span class="on">ACTIVE</span>' : ''}
              ${x.lineage ? `<span class="lin-tag">${ICONS.star(11)}${x.lineage}</span>` : ''}
              ${x.shiny ? `<span class="shiny-tag">${sparkIco(10)} SHINY</span>` : ''}
            </div>
            <div class="st">${bs.power} PWR · ${bs.hp} HP · ${bs.reflex} REF${lvl < PET_MAX_LEVEL ? ` · ${toNext.toLocaleString()} steps to Lv ${lvl + 1}` : ' · maxed'}</div>
            <div class="bar t3-steps"><i style="width:${pct}%"></i></div>
            <div class="acts">
              ${isEq ? '' : `<button class="btn" data-eq="${x.iid}">EQUIP</button>`}
              <button class="t3-ghosty" data-pettree="${x.iid}">${isOpen ? 'HIDE TALENTS' : 'TALENTS'}</button>
              <button class="t3-ghosty${inSel ? ' on' : ''}" data-breedsel="${x.iid}">${inSel ? 'BREEDING' : 'BREED'}</button>
              <button class="t3-ghosty danger" data-destroy="${x.iid}" data-dust="${dustVal}">DESTROY ${dustVal}</button>
            </div>
          </div>
        </div>${isOpen ? petTalentTree(x, lvl, openPicks) : ''}`;
      }).join('');
      return `<div class="t3-sect"><b>${esc(it.name || sp)} · ${(RARITIES[it.rarity] || {}).label || ''}</b><i></i><span class="r chip" style="font-size:11px">${bySp[sp].length}</span></div>${cards}`;
    }).join('');


    const spChips = pair ? [a, b]
      .map(x => `<button class="chip ${offSp === x.iid ? 'on' : ''}" data-offsp="${x.iid}">${esc((BH_BY_ID[x.sp] || {}).name || x.sp)}${x.shiny ? ' ✦' : ''}</button>`).join('') : '';

    body.innerHTML = `
      <div style="display:flex;gap:7px;margin-bottom:12px;flex-wrap:wrap">
        <span class="chip">${ICONS.dust(14)} ${st.dust.toLocaleString()}</span>
        <span class="chip" style="font-size:11px">Only the active pet levels as you walk</span>
      </div>
      ${pair ? `<div class="breed-bar${spareIsPrecious ? ' careful' : ''}">
          <div class="breed-h">What breeding does</div>
          <div class="breed-trade">
            <span class="bt-out">
              <span class="bt-row"><span class="bt-pet keep">${petPortraitHtml(keeper.sp, 44, keeper.shiny)}</span></span>
              <small>Kept &middot; lineage ${keeper.lineage || 0} &rarr; ${offLineage}</small>
            </span>
            <span class="bt-arrow">${ICONS.chev(20)}</span>
            <span class="bt-in">
              <span class="bt-row"><span class="bt-pet">${petPortraitHtml(spare.sp, 38, spare.shiny)}</span></span>
              <small>Fed in &middot; gone</small>
            </span>
          </div>
          <ul class="breed-facts">
            <li>You keep <b>${esc((BH_BY_ID[keeper.sp] || {}).name || keeper.sp)}</b>. Same pet, same name, <b>same level and look</b>.</li>
            <li>It reaches <b>lineage ${offLineage}</b>: <b>+${Math.round(offLineage * 5)}% to every stat</b>.</li>
            <li><b>${esc((BH_BY_ID[spare.sp] || {}).name || spare.sp)} is destroyed</b> and does not come back.</li>
          </ul>
          ${spareIsPrecious ? `<div class="breed-warn">
            ${ICONS.warn(17)}
            <div><b>You are about to destroy ${spare.shiny ? 'a SHINY' : (spare.lineage || 0) > 0 ? `a lineage ${spare.lineage} pet` : `a level ${spareLvl} pet`}.</b>
            ${spare.shiny ? 'Shinies are about a 1 in 30 hatch and its colour will NOT carry over.' : (spare.lineage || 0) > 0 ? 'Its bloodline is lost; lineage does not transfer.' : 'Its levels are lost.'}
            Feed a plain spare in instead unless you are sure.</div>
          </div>` : ''}
          <div class="breed-pick"><span class="note">Which one are you keeping?</span><div class="breed-sp">${spChips}</div></div>
          <div class="wallet-line"><span class="note">Cost</span><b><span class="dust-ico">${ICONS.dust(13)}</span> ${cost}${afford ? '' : ' · not enough'}</b></div>
          ${st.ready ? '' : `<p class="note">Walk ${st.cooldownLeft.toLocaleString()} more steps before breeding again.</p>`}
          <button class="btn" id="doBreed" ${canBreedNow ? '' : 'disabled'}>Feed ${esc((BH_BY_ID[spare.sp] || {}).name || spare.sp)} in</button>
        </div>`
      : `<p class="note" style="margin:2px 2px 10px"><b>Breed</b> feeds a spare pet into one you keep: the <b>keeper gains a lineage rank</b> (+5% to every stat) and the spare is destroyed. <b>Destroy</b> trades a spare for Bone Dust instead.</p>`}
      ${sections || '<p class="note" style="text-align:center;margin-top:14px">No pets yet. Hatch eggs by walking.</p>'}`;

    $$('[data-petsel]', body).forEach(card => card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return; // don't hijack Equip/Breed/Destroy
      const iid = card.dataset.petsel;
      openIid = (openIid === iid) ? null : iid;
      render();
    }));
    // the card is still tappable, but the mockup gives the talent tree its own
    // named control: "tap the card somewhere that isn't a button" is not an
    // affordance anyone finds
    $$('[data-pettree]', body).forEach(btn => btn.addEventListener('click', () => {
      const iid = btn.dataset.pettree;
      openIid = (openIid === iid) ? null : iid;
      render();
    }));
    $$('[data-eq]', body).forEach(btn => btn.addEventListener('click', async () => {
      await setEquippedPet(btn.dataset.eq);
      popSound(S.sounds); pushProfileSoon();
      render();
    }));
    $$('[data-breedsel]', body).forEach(btn => btn.addEventListener('click', () => {
      const iid = btn.dataset.breedsel;
      if (sel.includes(iid)) sel = sel.filter(x => x !== iid);
      else if (sel.length < 2) sel.push(iid);
      else sel = [sel[1], iid];
      offSp = null; render();
    }));
    $$('[data-destroy]', body).forEach(btn => btn.addEventListener('click', async () => {
      const inst = insts.find(x => x.iid === btn.dataset.destroy);
      const isShiny = !!(inst && inst.shiny);
      const dustVal = btn.dataset.dust || '?';
      if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1'; const t = btn.innerHTML;
        btn.innerHTML = isShiny ? `SHINY! Melt for <span class="dust-ico">${ICONS.dust(13)}</span>${dustVal}?` : `Melt for <span class="dust-ico">${ICONS.dust(13)}</span>${dustVal}?`;
        if (isShiny) toast(`⚠️ That's a SHINY pet, ultra-rare (~3% on hatch). Destroying it is permanent and only gives ${dustVal} Bone Dust. Tap again to confirm.`, 4600);
        setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = '0'; btn.innerHTML = t; } }, isShiny ? 4600 : 2800);
        return;
      }
      const res = await salvageInstance(btn.dataset.destroy);
      if (!res.ok) { toast('Could not destroy that pet.'); return; }
      popSound(S.sounds);
      toast(`${res.name} salvaged into ${res.dust} Bone Dust.`, 2600);
      render();
    }));
    $$('[data-offsp]', body).forEach(c => c.addEventListener('click', () => { offSp = c.dataset.offsp; render(); }));
    $('#doBreed', body)?.addEventListener('click', async e => {
      // breeding CONSUMES both parents. If one is shiny, warn once — the shiny
      // colour carries to (and overtakes any common colour in) the offspring,
      // but the parent itself is gone. Arm-then-confirm.
      const spareInst = insts.find(x => x.iid === sel.find(y => y !== offSp)) || {};
      const spareName = (BH_BY_ID[spareInst.sp] || {}).name || 'that pet';
      const btn = e.currentTarget;
      /* ARM ON EVERY BREED. It permanently destroys a pet, and since v270 every
         irreversible spend takes two taps. A precious spare gets a louder line,
         because "maybe you shouldn't" is the whole point of the pause. */
      if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        const t = btn.textContent;
        btn.textContent = spareInst.shiny ? `Destroy the SHINY ${spareName}?` : `Destroy ${spareName}?`;
        btn.classList.add('danger-ish');
        toast(spareInst.shiny
          ? `${spareName} is SHINY, roughly a 1 in 30 hatch, and its colour will not carry over. Destroying it is permanent. Tap again only if you are sure.`
          : `${spareName} is destroyed for good and your keeper gains a lineage rank. Tap again to confirm.`, 5200);
        setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = '0'; btn.textContent = t; btn.classList.remove('danger-ish'); } }, 5200);
        return;
      }
      const keepIid = offSp, feedIid = sel.find(x => x !== offSp);
      const res = await breedPets(keepIid, feedIid);
      if (!res.ok) { toast(BREED_ERR[res.reason] || 'Could not breed those.'); render(); return; }
      sel = []; offSp = null;
      await render();                          // refresh the stable underneath
      openPetBreedResult(res.offspring);       // reveal on top (Stable stays open, no race)
    });
    $$('[data-petpick2]', body).forEach(btn => btn.addEventListener('click', async () => {
      const sp = btn.dataset.sp, tier = Number(btn.dataset.tier), node = btn.dataset.petpick2, lvl = Number(btn.dataset.lvl);
      if (lvl < tier) { toast(`Reaches this at level ${tier}: keep walking.`, 2400); return; }
      const cur = await petPicks(sp);
      const tierNodes = (PET_TREES[familyOf(sp).key].find(t => t.tier === tier) || {}).opts.map(o => o.id);
      await setPetPick(sp, node, [...cur.filter(id => !tierNodes.includes(id)), node]);
      popSound(S.sounds);
      $$(`.pet-opt[data-tier="${tier}"]`, body).forEach(o => o.classList.toggle('on', o.dataset.petpick2 === node));
    }));
  }
  render();
}

// Breeding pay-off reveal, styled like the level-up: the offspring on a burst of
// rays with its new lineage star.
function openPetBreedResult(off) {
  const it = BH_BY_ID[off.sp] || {};
  confettiRain(70); levelSound(S.sounds);
  const parents = (off.parents || []).slice(0, 2);
  const wrap = openSheet(`
    <div class="reveal-take cool">
      <div class="grainy"></div>
      <div class="reveal-eyebrow">Bred in the Stable</div>
      <div class="reveal-stamp">Lineage ${off.lineage}</div>
      <div class="reveal-sub">${esc(it.name || off.sp)} got stronger</div>
      <div class="reveal-body">
        <div class="lvlup-stage"><div class="lvl-rays"></div><div class="bh-stage lg petlvl-avatar r-${it.rarity || 'common'} lin-${Math.min(off.lineage, 6)}${off.shiny ? ' is-shiny' : ''}">${petPortraitHtml(off.sp, 104, off.shiny)}</div></div>
        <div class="reveal-sub" style="font-size:var(--fs-3)">${esc(it.name || off.sp)}${off.shiny ? ` <span class="shiny-tag">${sparkIco(11)} SHINY</span>` : ''}</div>
        <div class="cele-bubble">A stronger bloodline: +${Math.round(off.lineage * 5)}% to every stat, and a brighter glow.</div>
        ${parents.length ? `<div class="fused">
          <div class="fused-row">
            <span class="gone-pet">${petPortraitHtml(parents[0].sp, 42, parents[0].shiny)}</span>
          </div>
          <div class="fused-note">${esc((BH_BY_ID[parents[0].sp] || {}).name || parents[0].sp)} was fed in</div>
        </div>` : ''}
      </div>
      <div class="reveal-foot">
        <button class="btn" id="celeOk">Adopt</button>
      </div>
    </div>`, { cls: 'takeover', onClose: () => setFxLayer() });
  setFxLayer(305);
  $('#celeOk', wrap).addEventListener('click', () => history.back());
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
    const payload = {
      date: r.date, steps: r.steps ?? null, activeKcal: r.activeKcal ?? null, weightKg: r.weightKg ?? null,
      exerciseMin: r.exerciseMin ?? null, cycleKm: r.cycleKm ?? null,
      workouts: r.workouts ?? null, wtypes: Array.isArray(r.wtypes) ? r.wtypes : null,
      restingHr: r.restingHr ?? null, hrv: r.hrv ?? null,
      // Sleep. THIS is why sleep never worked: the plugin has returned these since
      // v213, but this payload is an explicit allow-list and nobody added them, so
      // every sleep field was dropped here before ingestHealth could see it. The
      // permission, the query window and the native read were all fine; the glue
      // in the middle silently discarded the result.
      sleepMin: r.sleepMin ?? null, sleepDeepMin: r.sleepDeepMin ?? null,
      sleepRemMin: r.sleepRemMin ?? null, sleepCoreMin: r.sleepCoreMin ?? null,
      sleepAwakeMin: r.sleepAwakeMin ?? null, sleepStaged: r.sleepStaged ?? null,
      sleepDiag: r.sleepDiag ?? null,
    };
    await ingestHealth(payload, { celebrate: !silent });
    if (!S.settings.hkConnected || S.settings.hkNative !== true) {
      S.settings.hkConnected = true; S.settings.hkNative = true;
      await kvSet('settings', S.settings);
    }
    return true;
  } catch { return false; }
}

// Bump whenever the native HealthKit / Health Connect read set gains a type, so
// the permission sheet is presented once more for the new scope. 1 = the original
// set, 2 = + sleep stages (v213, never actually requested until v224).
const HK_SCOPES_V = 2;

async function nativeAutoSync() {
  if (!isNative() || !S.settings?.hkNative) return;
  // iOS / Health Connect only surface the permission sheet for scopes that are
  // NOT yet decided, and silently no-op once they are, so we have to ask again
  // whenever the read set grows.
  //
  // This used to gate on a single `hkHeartOk` boolean, set as soon as heart data
  // flowed. That worked for heart and then actively BROKE every scope added
  // afterwards: sleep landed in v213, but by then hkHeartOk was true, so we
  // never asked again, so iOS never showed the sleep sheet, so sleep read empty
  // forever. The flag that fixed one scope silently blocked the next.
  //
  // Now it is versioned: bump HK_SCOPES_V whenever the native read set changes
  // and everyone gets asked exactly once more, no repeat nag after that.
  // NB: the version is advanced in ingestHealth, when sleep data actually ARRIVES,
  // not here. v224 set it right after the request resolved, which repeated the
  // hkHeartOk mistake in a new form: iOS resolves requestAuthorization even when
  // you deny, and no-ops for types already decided, so one silent non-grant burned
  // the flag forever. Asking again is invisible when the type is already decided,
  // so retrying until data flows costs nothing.
  if ((await kvGet('hkScopesV', 0)) < HK_SCOPES_V) {
    try { await nativeRequestAuth(); } catch { /* best-effort */ }
  }
  if (Date.now() - lastNativeSync < 10 * 60e3) return; // at most every 10 min
  const ok = await nativeSyncNow({ silent: true });
  if (ok && currentTab() === 'today') bgRefresh();
}

async function connectNativeHealth() {
  if (!(await nativeHealthAvailable())) { toast('Health is not available on this device'); return; }
  const granted = await nativeRequestAuth();
  if (!granted) { toast('Health permission was not granted. You can enable it in iOS Settings > Health.', 3600); return; }
  S.settings.hkConnected = true; S.settings.hkNative = true;
  await kvSet('settings', S.settings);
  // (deliberately NOT advancing hkScopesV here: asking is not evidence of a grant.
  // ingestHealth advances it once sleep data actually arrives.)
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

// Sleep read diagnostics, rendered inline in Settings under APPLE HEALTH.
// HealthKit exposes no way to check READ permission, so when a sleep read comes
// back empty the ONLY way to tell "not shared" from "no samples" from "all inBed"
// from "under the 30-min floor" is to report what the query actually saw. This
// lived behind the "Reconnect" button in v227, which nobody would ever tap to
// look at sleep, so it may as well not have existed.
/* The one place the app states what the DEVICE vault can actually do, measured
   rather than assumed. The old copy promised "reinstall and your progress comes
   back on its own", which on Android is only true when Google Backup is on. A
   promise we cannot keep is worse than no promise: that is how an account gets
   lost by someone who thought they were covered. */
function vaultRowHtml(v) {
  if (!v) return '';                                   // web: no vault, claim nothing
  // Native reasons arrive unpunctuated, and they are followed by another sentence.
  const why = s => esc(String(s).replace(/\s*[.!?]?$/, '.'));
  let cls = 'ok', body;
  if (v.conflict) {
    cls = 'warn';
    body = `<b>Another Bonehead is saved on this phone</b><span>We kept it instead of overwriting it. You can switch to it, which replaces what is on this phone now.</span>`;
    return `<div class="settings-row vault-row ${cls}" style="margin-top:10px">
      <div class="lab">${body}</div>
      <button class="btn small" id="vaultAdoptBtn">Switch to it</button>
    </div>`;
  }
  if (v.available === false || v.unreadable || v.readError) {
    cls = 'warn';
    body = `<b>This phone's secure store is unavailable</b><span>${why(v.reason || v.readError || 'It could not be read')} Your recovery code is what will bring your Bonehead back.</span>`;
  } else if (!v.hasIdentity) {
    body = `<b>Not saved on this phone yet</b><span>It saves itself the first time your account is created or restored.</span>`;
  } else if (v.e2e === false) {
    cls = 'warn';
    body = `<b>Saved on this phone only</b><span>${why(v.reason || 'No screen lock is set')} Set a screen lock and this can also travel to a new phone.</span>`;
  } else {
    body = `<b>Saved on this phone</b><span>Delete and reinstall and your Bonehead comes back on its own. This is a convenience, not a guarantee: your recovery code is the thing that always works.</span>`;
  }
  return `<div class="settings-row vault-row ${cls}" style="margin-top:10px"><div class="lab">${body}</div></div>`;
}

function sleepDiagHtml(dg) {
  if (!dg) {
    return `<p class="note">Nothing recorded yet. Tap <b>Sync now</b> above. If it still says this afterwards, the app on this phone is older than the sleep diagnostics and needs a TestFlight update.</p>`;
  }
  const asleep = dg.rawAsleepMin || 0, inBed = dg.inBedMin || 0, n = dg.samples ?? 0;
  const verdict =
    dg.err ? `Health returned an error: ${esc(dg.err)}`
    : dg.manual ? 'You hand-logged sleep for today, so the automatic read is deliberately skipped to keep your entry.'
    : n === 0 ? 'No sleep samples came back at all for that window. Either Sleep is not shared with Boneheadz (iOS Settings > Health > Data Access & Devices > Boneheadz Gym) or nothing is recorded in it.'
    : asleep === 0 && inBed > 0 ? 'Your sleep is recorded as time IN BED with no asleep stages. Boneheadz currently throws in-bed time away, which is exactly why nothing shows. This is a bug on our side, not your watch.'
    : asleep === 0 ? 'Samples came back but none of them were asleep, in-bed, or staged time.'
    : asleep < 30 ? 'Under the 30-minute minimum, so it was discarded as a stray reading.'
    : 'Sleep read correctly on the last sync.';
  return `
    <div class="hk-diag">
      <div><span>Window searched</span><b>${esc(dg.window || '?')}</b></div>
      <div><span>Samples found</span><b>${n}</b></div>
      <div><span>Counted as asleep</span><b>${asleep} min</b></div>
      <div><span>Of that, staged</span><b>${dg.stagedMin || 0} min</b></div>
      <div><span>In bed, not asleep</span><b>${inBed} min</b></div>
    </div>
    <p class="note" style="margin-top:8px">${verdict}</p>`;
}

/* ---------------- account recovery ----------------
   Exists because a real level 27 account was lost on 2026-07-27: the cloud
   backup survived but the key lived only in the device keychain, and deleting
   the app took it. A phrase the player chooses can rebuild the account on any
   device. The phrase never leaves the phone. */
async function openRecoverySheet({ firstRun = false } = {}) {
  const existingId = await social.myRecoveryId();
  // Someone who set a phrase before v231 has no ID, so restoring still demands
  // their friend code. Say why they are being asked again rather than repeating
  // the new-player pitch at them.
  const upgrading = !existingId && await social.hasRecoveryPhrase();
  const intro = upgrading
    ? 'You already have a recovery phrase, but restoring with it still needs your friend code, and that is on the phone you would have lost. Pick a Recovery ID and re-enter a phrase, and the ID is all you need from now on.'
    : 'Two things you pick and remember. Together they bring your Bonehead back on any phone, even if this one is lost or wiped. We never see your phrase, so we can never reset it for you.';
  const wrap = openSheet(`
    <div class="sheet-head"><h2>${upgrading ? 'Finish your recovery code' : 'Recovery code'}</h2><button class="sheet-close">${firstRun ? 'Later' : 'Done'}</button></div>
    <div class="sheet-body">
      <p class="note" style="margin:2px 2px 14px">${intro}</p>
      <div class="field">
        <label>Recovery ID <span class="rc-hint">the name you look yourself up by</span></label>
        <input id="rcId" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="e.g. tom-bones" value="${esc(existingId || '')}">
        <p class="rc-note" id="rcIdState"></p>
      </div>
      <div class="field">
        <label>Your phrase <span class="rc-hint">the secret</span></label>
        <input id="rcPhrase" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="two words you will not forget">
      </div>
      <div class="field">
        <label>Type it again</label>
        <input id="rcPhrase2" type="text" autocomplete="off" autocapitalize="none" spellcheck="false">
      </div>
      <p class="rc-err" id="rcErr" hidden></p>
      <button class="btn" id="rcSave" style="margin-top:14px">Save my recovery code</button>
      <p class="note" style="margin-top:12px">Anyone can guess a recovery ID, so the phrase is what actually protects you. That is why it needs to be a bit longer than a password you would rush.</p>
    </div>`, { cls: '', name: 'Recovery code' });
  const err = m => { const e = $('#rcErr', wrap); e.hidden = !m; e.textContent = m || ''; };
  const state = (m, cls = '') => { const e = $('#rcIdState', wrap); e.textContent = m; e.className = 'rc-note ' + cls; };

  // Live availability, so nobody types a phrase twice only to be told the name is gone.
  let idTimer = null;
  $('#rcId', wrap).addEventListener('input', () => {
    clearTimeout(idTimer);
    const v = $('#rcId', wrap).value.toLowerCase().trim();
    if (!v) return state('');
    const bad = social.recoveryIdProblem(v);
    if (bad) return state(bad, 'bad');
    if (v === existingId) return state('This is your current ID.', 'good');
    state('Checking...');
    idTimer = setTimeout(async () => {
      const r = await social.recoveryIdAvailable(v);
      if (!r.ok) return state(r.reason || 'Could not check that right now.');
      state(r.available ? `"${v}" is free.` : `"${v}" is taken.`, r.available ? 'good' : 'bad');
    }, 450);
  });

  $('#rcSave', wrap).addEventListener('click', async () => {
    const id = $('#rcId', wrap).value.toLowerCase().trim();
    const a = $('#rcPhrase', wrap).value, b = $('#rcPhrase2', wrap).value;
    if (!id) return err('Pick a recovery ID. It is how you find your account again.');
    const badId = social.recoveryIdProblem(id);
    if (badId) return err(badId);
    if (a !== b) return err('Those two do not match.');
    const bad = social.phraseProblem(a);
    if (bad) return err(bad);
    const btn = $('#rcSave', wrap); btn.disabled = true; btn.textContent = 'Saving...';
    const r = await social.setRecoveryPhrase(a, id);
    btn.disabled = false; btn.textContent = 'Save my recovery code';
    if (!r.ok) return err(r.reason || 'Could not save that.');
    levelSound(S.sounds);
    closeAllSheetsViaHistory();
    toast(`Saved. Restore anywhere with "${r.recoveryId}" and your phrase.`, 4600);
    refresh();
  });
}

async function openRestoreSheet() {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Restore an account</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <p class="note" style="margin:2px 2px 14px">Enter the recovery ID and phrase you picked on your old device. This replaces whatever is on this phone now.</p>
      <div class="field">
        <label>Recovery ID <span class="rc-hint">or an old BONE- friend code</span></label>
        <input id="rsCode" type="text" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="tom-bones">
      </div>
      <div class="field">
        <label>Recovery phrase</label>
        <input id="rsPhrase" type="text" autocomplete="off" autocapitalize="none" spellcheck="false">
      </div>
      <p class="rc-err" id="rsErr" hidden></p>
      <button class="btn" id="rsGo" style="margin-top:14px">Restore my Bonehead</button>
    </div>`, { cls: '', name: 'Restore' });
  const err = m => { const e = $('#rsErr', wrap); e.hidden = !m; e.textContent = m || ''; };
  $('#rsGo', wrap).addEventListener('click', async () => {
    const btn = $('#rsGo', wrap); btn.disabled = true; btn.textContent = 'Restoring...';
    const r = await social.restoreWithPhrase($('#rsCode', wrap).value, $('#rsPhrase', wrap).value);
    btn.disabled = false; btn.textContent = 'Restore my Bonehead';
    if (!r.ok) return err(r.reason || 'Could not restore.');
    S.settings = await kvGet('settings', S.settings);
    levelSound(S.sounds);
    closeAllSheetsViaHistory();
    toast(r.restored ? 'Welcome back. Your Bonehead is restored.' : 'Account restored, but there was no save to pull.', 4600);
    route();
  });
}

// Nag until a phrase exists. Tom: "make sure that people that skip the recovery
// phrase popup see it each time they open until they pick one, for their own
// good." So this is NOT once-per-session: every open, until it is set.
async function maybePromptRecovery(tries = 0) {
  try {
    if (navigator.webdriver || !S.settings) return;
    // Offline players used to be skipped here. They are the MOST exposed group,
    // with no cloud backup at all, so they get the prompt too: setRecoveryPhrase
    // now takes them online as part of saving it.
    if (!(await social.apiBase())) return;           // no server configured at all
    // A v230 phrase with no recovery ID still needs the friend code to restore,
    // which is the gap v231 exists to close. Checking only for a phrase left every
    // early player silently uninvited to the fix, so both count as "not covered".
    if (await social.hasRecoveryPhrase() && await social.myRecoveryId()) return;
    // Never stack over another sheet, but do NOT give up: What's New pops on the
    // very release that introduces recovery, and simply bailing here would swallow
    // the prompt on the one open where it matters most. Wait for the stack to
    // clear instead, for up to a minute.
    if (document.querySelector('#sheets .sheet')) {
      if (tries < 30) setTimeout(() => maybePromptRecovery(tries + 1), 2000);
      return;
    }
    openRecoverySheet({ firstRun: true });
  } catch { /* never block boot */ }
}

const HK_TEMPLATE = 'tally-hk steps=[Steps Sum] active=[Active Sum] weightlb=[Latest Weight]';

async function openHealthGuide() {
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

const APPROACH_LOCK_M = 400; // within this, a spawn is "yours": it won't move/despawn until collected

// The Boneyard draws the same handful of PNGs across every marker, so without
// this each den and the Glutton decode separately and the map fills in piecemeal.
// Decoding them once up front means every marker paints on its first frame,
// including the ones that appear later as you walk. Spawn pips are inline SVG and
// need nothing. Failures are ignored: this is a warm-up, never a gate.
// The map marker art, PLUS the Glutton's combat plates. Those are ~90KB each and
// the arena renders them as plain <img> tags at fight start, so on a cold cache
// the boss simply was not there for the opening moves. Warmed with the map, which
// is the screen you must be on to reach him.
const MAP_ART = ['assets/brand/tombstone.png', 'assets/bh/glutton/idle.png',
  'assets/bh/glutton/combat/idle.png', 'assets/bh/glutton/combat/tongue.png', 'assets/bh/glutton/combat/middle.png'];
let _mapArtWarm = null;
function warmMapArt() {
  if (!_mapArtWarm) {
    _mapArtWarm = Promise.all(MAP_ART.map(src => new Promise(res => {
      const i = new Image();
      i.onload = () => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()).then(res);
      i.onerror = res;
      i.src = src;
    })));
  }
  return _mapArtWarm;
}

// The Boneyard is a screen, not a modal. It used to be a "full" sheet opened by
// a special case in the tab handler, which is why it had a Done button and its
// own back semantics while every other tab was a route.
async function renderBoneyard(el) {
  warmMapArt();                       // starts now, resolves long before a marker needs it
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
  const wrap = el;
  screenCleanup = cleanup;            // route() tears the map down when you leave
  el.innerHTML = `
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
            <div class="legend-row"><span class="blip-dot rare"></span><div><b>Mystery Egg</b><span class="note"> · rare spawn · walk to hatch a pet</span></div></div>
          </div>
        </div>
      </div>
    </div>`;

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
      const isAndroid = /android/i.test(navigator.userAgent || '');
      const locDenied = isAndroid
        ? 'Location is off. Allow it in Settings → Apps → Boneheadz Gym → Permissions → Location, then retry.'
        : 'Location is off. Allow it in Settings → Boneheadz Gym → Location, then retry.';
      body.innerHTML = `<p class="warn" style="margin:16px">${geoErr && err.code === 1
        ? locDenied
        : geoErr ? 'No location fix yet. Step outside or near a window and retry.'
        : 'The map could not load. The Boneyard needs a network signal; your spawns are safe and will be here when you are back online.'}</p><button class="btn ghost" id="mapRetry" style="margin:0 16px">Retry</button>`;
      $('#mapRetry', body)?.addEventListener('click', startMap);
      return;
    }

    let lat = boot.coords.latitude, lng = boot.coords.longitude;
    // remember where we are (used by the map, not by notifications any more);
    // scheduleRares now only clears rare pushes already queued on the device.
    kvSet('lastLoc', { lat, lng, at: Date.now() }).then(() => scheduleRares()).catch(() => {});
    body.innerHTML = `
      <div class="map-stage" id="mapStage">
        <div class="map-canvas" id="mapCanvas"></div>
        <div class="map-attrib">© OpenStreetMap</div>
        <div class="map-topbar">
          <div class="mt-tx"><h1>Boneyard</h1><small id="mapCount">Reading the bones</small></div>
          <button class="map-ctl" id="mapRecenter" hidden aria-label="Recentre">${ICONS.crosshair(18)}</button>
          <button class="map-ctl" id="mapKeyBtn" aria-label="Map key">${bhIcon('badge-map', 19)}</button>
        </div>
        <div class="map-legend" id="mapLegend" hidden>${mapLegendHtml()}</div>
        <button class="btn map-den" id="mapDen" hidden>Enter the den</button>
        <button class="btn map-den" id="mapSecret" hidden></button>
        <button class="btn map-mini" id="mapMini" hidden>Fight</button>
        <button class="btn map-den" id="mapGlutton" hidden>Face The Glutton</button>
        <button class="btn map-spire-btn" id="mapSpire" hidden></button>
        <!-- the nearest-spawn readout and the Collect button were two separate
             floating things; they are one card now. #mapReadout is re-rendered on
             every fix, so #mapCollect has to be its SIBLING or the innerHTML
             update would destroy the button and its listener. -->
        <div class="map-act" id="mapAct">
          <div class="ma-body" id="mapReadout"><span class="spin" style="display:inline-block;vertical-align:-3px"></span> Reading the bones</div>
          <button class="btn map-collect" id="mapCollect" hidden>Collect</button>
        </div>
      </div>`;

    // Map key: toggle the legend; tapping the map closes it.
    const legendEl = $('#mapLegend', body);
    $('#mapKeyBtn', body)?.addEventListener('click', e => { e.stopPropagation(); legendEl.hidden = !legendEl.hidden; });
    $('#mapCanvas', body)?.addEventListener('pointerdown', () => { if (!legendEl.hidden) legendEl.hidden = true; });

    let loaded = false, follow = true;
    try {
      map = createBoneyardMap(maplibregl, $('#mapCanvas', body), { lat, lng });
    } catch (e) {
      body.innerHTML = `<p class="warn" style="margin:16px">The map renderer could not start on this device.</p>`;
      return;
    }
    if (navigator.webdriver) window.__map = map;
    map.on('load', () => { loaded = true; map.resize(); });
    // one-time discovery hint: the press-and-hold report/nominate feature is
    // invisible otherwise (zero den nominations since launch = nobody found it)
    kvGet('mapLpHint', false).then(seen => {
      if (seen) return;
      kvSet('mapLpHint', true);
      setTimeout(() => toast('Tip: press and hold the map to suggest a boss den spot, or to report loot you can\'t reach.', 5200), 2600);
    });
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
    let worldReady = false;   // flipped once every marker layer's state exists
    // panning/zooming to plan a route: re-snap + reveal spawns in the new view
    const rerunPlacement = () => {
      // 'idle' fires after the camera settles AND tiles finish loading, so
      // queryRenderedFeatures actually has the water/road features — the moment
      // to resolve which POIs snap to a path vs stay hidden (water/backyard).
      // It can also fire BEFORE this setup finishes: the `typeof fn === 'function'`
      // guards pass (declarations hoist) while the consts those functions close
      // over are still in the temporal dead zone, so the first idle threw
      // "Cannot access 'collected' before initialization" and placement silently
      // did not run. Wait until the setup below has actually completed.
      if (!worldReady) return;
      if (typeof refreshSpawns === 'function') refreshSpawns();
      if (typeof refreshDens === 'function') refreshDens();
      if (typeof refreshMinis === 'function') refreshMinis();
      if (typeof refreshGlutton === 'function') refreshGlutton();
    };
    map.on('moveend', rerunPlacement);
    map.on('idle', rerunPlacement); // tiles loaded → placement can see water + roads
    $('#mapRecenter', body).addEventListener('click', () => {
      follow = true; $('#mapRecenter', body).hidden = true;
      map.easeTo({ center: [lng, lat], zoom: MAP_START_ZOOM, duration: 700 });
    });

    // player marker: mini bonehead + facing cone + the collect-radius ring
    const youEl = document.createElement('div');
    youEl.className = 'map-you';
    youEl.innerHTML = `<div class="map-radius" hidden><b>${COLLECT_RADIUS_M} M</b></div><div class="map-cone" hidden></div><div class="map-you-av">${avatarLayersHtml(eq, { noYard: true, skip: ['BG'] })}</div>`;
    composeAvatars(youEl);   // marker is built outside route(), so it needs its own call
    const youMarker = domMarker(maplibregl, map, { lat, lng, el: youEl });
    const youWalk = attachWalk($('.map-you-av', youEl)); // puppet walk while GPS fixes move

    /* The collect rule, drawn instead of explained in a paragraph. Sized
       from the map's OWN projection (player pixel vs a point COLLECT_RADIUS_M
       north of it), not from a zoom-to-pixels guess, so it stays truthful at any
       zoom. Recomputed on zoom and on every fix. */
    const radiusEl = $('.map-radius', youEl);
    function sizeRadius() {
      if (!radiusEl) return;
      try {
        const a = map.project([lng, lat]);
        // 1 deg latitude ~ 111,320 m; due north so longitude is untouched
        const b = map.project([lng, lat + COLLECT_RADIUS_M / 111320]);
        const px = Math.abs(a.y - b.y);
        // below a few pixels the ring is noise, not information
        if (!isFinite(px) || px < 14) { radiusEl.hidden = true; return; }
        radiusEl.style.width = radiusEl.style.height = (px * 2) + 'px';
        radiusEl.hidden = false;
      } catch { radiusEl.hidden = true; }
    }
    map.on('zoom', sizeRadius);
    map.on('move', sizeRadius);
    sizeRadius();

    const date = dateKey();
    const week = isoWeekKey();
    const xpRows0 = await db.all('xp');
    const collected = new Set(xpRows0.filter(r => r.type === 'spawn').map(r => r.key));
    let claimedBoss = new Set(xpRows0.filter(r => r.type === 'bossday' || r.type === 'roamboss').map(r => r.key));
    let claimedMini = new Set(xpRows0.filter(r => r.type === 'mini').map(r => r.key));
    const spawnMarkers = new Map(); // id -> {marker, el, spawn}
    const spawnSnap = new Map();    // id -> {lat,lng} | null(suppressed), placed onto walkable ground
    const denSnap = new Map();      // id -> {lat,lng} | null(suppressed)
    const miniSnap = new Map();     // id -> {lat,lng} | null(suppressed)
    const spireSnap = new Map();    // id -> {lat,lng} | null(suppressed)

    /* The egg strip: the one number on this screen that walking moves. Refreshed
       on its own slow clock, because the spawn refresh runs every 5s and reading
       IndexedDB that often to render one line would be silly. */
    let eggStrip = null, eggStripAt = 0;
    async function refreshEggStrip() {
      if (Date.now() - eggStripAt < 25000) return;
      eggStripAt = Date.now();
      try {
        const [inv, steps] = await Promise.all([inventory(), lifetimeStepsSum()]);
        const eggs = inv.filter(r => r.kind === 'egg').map(r => eggProgress(r, steps)).filter(p => !p.ready);
        if (!eggs.length) { eggStrip = null; return; }
        const soonest = eggs.reduce((a, b) => (a.goal - a.walked <= b.goal - b.walked ? a : b));
        eggStrip = { left: Math.max(0, soonest.goal - soonest.walked), n: eggs.length };
      } catch { eggStrip = null; }
    }
    const denMarkers = new Map();   // id -> {marker, el, den}
    const miniMarkers = new Map();  // id -> {marker, el, mini}
    const secretMarkers = new Map(); // key -> {marker, el} (easter-egg dens, materialize on approach)
    const whisperedSecrets = new Set(); // one cryptic cue per spot per map session
    let claimedSecret = new Set(xpRows0.filter(r => r.type === 'secret').map(r => r.key));
    // Twice-daily world event: cleared windows are remembered per appearance,
    // so he comes back tomorrow morning but can't be farmed inside one window.
    const gluttonCleared = new Set(xpRows0.filter(r => r.type === 'glutton').map(r => r.key));
    /* One attempt per tower per day. `spireKey` has existed in spires.js since
       Dark Spires shipped and was wired to NOTHING, so a spire fight had no
       ledger at all: beat a tower whose claim is then refused (you are at
       SPIRE_CAP, or it is inside its 1h shield) and the button still said "Take",
       paying 40 coins per rerun forever. Losing was equally free to retry.
       Same shape as gluttonCleared, including the re-read on focus. */
    const spireTried = new Set(xpRows0.filter(r => r.type === 'spiretry').map(r => r.key));
    // dateKey() at call time, not the map-open `date`: settle writes with the key
    // for the day it settles on, and a map left open past midnight would otherwise
    // check yesterday's key forever.
    const spireSpentToday = id => spireTried.has(spireKey(id, dateKey()));
    const syncSpireTried = async () => {
      for (const r of await db.all('xp')) if (r.type === 'spiretry') spireTried.add(r.key);
    };
    const gluttonLive = () => { const w = gluttonWindow(); return (w.active && !gluttonCleared.has(gluttonKey(date, w.slot))) ? w : null; };
    // gluttonCleared starts as a SNAPSHOT taken when this screen opened, so any
    // clear that happens elsewhere (or a slot/date the event payload got wrong)
    // would leave a dead boss standing. Re-read the ledger and let the next
    // refreshGlutton() take him off the map.
    const syncGluttonCleared = async () => {
      try {
        for (const r of await db.all('xp')) if (r.type === 'glutton') gluttonCleared.add(r.key);
      } catch { /* keep the snapshot we have */ }
    };
    let gluttonRec = null; // single marker, not a Map (one-of-a-kind world boss)
    let gluttonPos = null; // where he ACTUALLY ended up, so the blight matches the marker
    // Anti-cheat: block looting/fighting above a driving speed. GPS speed (m/s)
    // when the device reports it, else derived from raw position deltas. ~8 m/s
    // = ~29 km/h: comfortably above running/cycling, clearly a vehicle.
    const MAX_LOOT_SPEED = 8;
    let youSpeed = 0, lastFix = null;

    // Place a POI onto reachable ground. A POI is only SHOWN once we've confirmed
    // it snaps to a walkable feature (road / path / park) within ~80m; otherwise
    // it stays hidden (returns null → caller skips it). This is the robust rule:
    // water and backyards never snap, so they never show. Crucially we cache ONLY
    // successes — an undecided point (off-screen, or tiles still loading so
    // queryRenderedFeatures is empty) returns null WITHOUT caching, so it keeps
    // retrying on the next refresh/idle until its tiles load and it either snaps
    // (appears on the nearest path) or stays hidden (water). The seeded ledger key
    // never moves; only the shown position does.
    const SNAP_MAX_M = 60; // was 80: generous enough to pull a POI across a highway or "onto" the far bank
    function placeWalkable(raw, cache, id) {
      const cached = cache.get(id);
      if (cached) return cached;                     // already resolved to a walkable spot
      if (!map || !map.loaded()) return null;         // gone or not ready → hide for now, retry
      const c = map.getCanvas();
      const pt = map.project([raw.lng, raw.lat]);
      const onScreen = pt.x > -120 && pt.y > -120 && pt.x < c.clientWidth + 120 && pt.y < c.clientHeight + 120;
      if (!onScreen) return null;                    // can't query off-screen tiles → hide until it pans in
      // query box sized from the snap radius (a fixed 95px was smaller than the
      // radius at street zoom, so real paths just outside the box were invisible
      // and reachable POIs got hidden). +25% margin covers projection skew.
      const ptN = map.project([raw.lng, raw.lat + SNAP_MAX_M / 111320]);
      const r = Math.max(40, Math.abs(pt.y - ptN.y) * 1.25);
      const feats = map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]]);
      const snap = snapToWalkable(raw, feats, SNAP_MAX_M);
      if (snap) { const p = { lat: snap.lat, lng: snap.lng }; cache.set(id, p); return p; }
      return null;                                   // no reachable ground yet (water / backyard / tiles loading) → hide
    }

    // ---- long-press map feedback -------------------------------------------
    // Press and hold on the map: on a marker -> "report this spot as
    // unreachable" (private property, etc.); on empty ground -> "nominate this
    // landmark for a boss den". Both send a private note to the devs.
    let lpTimer = null, lpStart = null, lpPointer = null, reportOpen = false;
    const LP_MS = 750, LP_MOVE = 8;   // a deliberate, stationary hold — not an accidental brush
    function lpClear() { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } lpStart = null; lpPointer = null; }
    function markerAt(target) {
      const el = target && target.closest && target.closest('.map-den-mark, .map-mini-mark, .map-spawn');
      if (!el) return null;
      for (const r of denMarkers.values()) if (r.el === el) return { label: r.den.name || 'Boss den', lat: r.den.lat, lng: r.den.lng };
      for (const r of miniMarkers.values()) if (r.el === el) return { label: r.mini.name || 'Mini-boss', lat: r.mini.lat, lng: r.mini.lng };
      for (const r of spawnMarkers.values()) if (r.el === el) return { label: (r.spawn.type === 'rare' ? 'Rare pile' : 'Bone pile'), lat: r.spawn.lat, lng: r.spawn.lng };
      return { label: 'Map marker', lat: null, lng: null };
    }
    const mapEl = $('#mapCanvas', body);
    mapEl.addEventListener('pointerdown', ev => {
      if (ev.button && ev.button !== 0) return;
      // one long-press at a time: ignore secondary touch points (multi-touch),
      // a press already being tracked, or any press while a report sheet is open.
      if (ev.isPrimary === false || lpTimer || lpStart || reportOpen) return;
      const startX = ev.clientX, startY = ev.clientY, tgt = ev.target;
      lpStart = { x: startX, y: startY };
      lpPointer = ev.pointerId;
      lpTimer = setTimeout(() => {
        lpTimer = null; lpStart = null; lpPointer = null;
        if (reportOpen) return;                    // don't stack a second dialogue
        const hit = markerAt(tgt);
        if (hit) { reportOpen = true; openReportSheet('unreachable', hit); return; }
        // empty ground: convert the press point to a coordinate on the map
        let pt = null;
        try { const rect = mapEl.getBoundingClientRect(); pt = map.unproject([startX - rect.left, startY - rect.top]); } catch { /* map gone */ }
        if (pt) { reportOpen = true; openReportSheet('den-nominate', { label: null, lat: pt.lat, lng: pt.lng }); }
      }, LP_MS);
    });
    mapEl.addEventListener('pointermove', ev => {
      if (!lpStart || (lpPointer != null && ev.pointerId !== lpPointer)) return;
      if (Math.abs(ev.clientX - lpStart.x) > LP_MOVE || Math.abs(ev.clientY - lpStart.y) > LP_MOVE) lpClear();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => mapEl.addEventListener(t, ev => {
      if (lpPointer != null && ev.pointerId !== lpPointer) return;
      lpClear();
    }));

    // ---- tap a marker: quick inspect tooltip (name · what it drops · distance).
    // Short tap = inspect; the 750ms hold above still opens the report sheet.
    const poiTip = document.createElement('div');
    poiTip.className = 'map-poi-tip'; poiTip.hidden = true;
    $('#mapStage', body).appendChild(poiTip);
    const hidePoiTip = () => { poiTip.hidden = true; };
    function markerInfo(el) {
      for (const r of denMarkers.values()) if (r.el === el) { const d = r.den; return { name: d.name || 'Boss den', reward: d.roaming ? 'A daily boss: rare gear and coins' : 'A boss fight: rare gear and coins', distM: d.dist }; }
      for (const r of miniMarkers.values()) if (r.el === el) { const m = r.mini; return { name: m.name || 'Mini-boss', reward: 'A quick fight for coins + XP', distM: m.dist }; }
      for (const r of spawnMarkers.values()) if (r.el === el) {
        const s = r.spawn, def = SPAWN_TYPES[s.type] || {};
        const rw = def.crate === 'egg' ? 'Rare: walk to hatch a pet' : def.crate ? 'A crate of loot' : def.seeds ? `${def.seeds} seeds for the garden` : def.coins ? `${def.coins} coins` : def.xp ? `${def.xp} XP` : 'A find';
        return { name: def.label || 'Cache', reward: rw, distM: s.dist };
      }
      return null;
    }
    function showPoiTip(el) {
      const info = markerInfo(el); if (!info) return;
      poiTip.innerHTML = `<b>${esc(info.name)}</b><span class="pt-b">${esc(info.reward)}</span>${info.distM != null ? `<span class="pt-f">${fmtDist(info.distM)} away · walk to reach it</span>` : ''}`;
      poiTip.hidden = false;
      const stage = $('#mapStage', body).getBoundingClientRect(), m = el.getBoundingClientRect();
      const tw = poiTip.offsetWidth, th = poiTip.offsetHeight;
      let left = Math.max(8, Math.min(stage.width - tw - 8, (m.left - stage.left) + m.width / 2 - tw / 2));
      let top = (m.top - stage.top) - th - 10;
      if (top < 8) top = (m.bottom - stage.top) + 10;
      poiTip.style.left = left + 'px'; poiTip.style.top = top + 'px';
    }
    mapEl.addEventListener('click', ev => {
      if (reportOpen) return;
      const el = ev.target && ev.target.closest && ev.target.closest('.map-den-mark, .map-mini-mark, .map-spawn, .map-spire');
      if (el) {
        /* A SPIRE IS SOMEBODY'S TURF. Tom, 2026-08-08: "why cant i click a Spire
           on the map in boneyard and see somethign cool like who has it right
           now etc. it should be like pokemon go where youre proud to rep your
           gym and flex on other players." It was not even in this selector, so
           tapping one did nothing at all. Every fact below already arrives with
           the /spires poll; nothing new is fetched. */
        const spireRec = [...spireMarkers.values()].find(r => r.el === el);
        if (spireRec && spireRec.info) {
          hidePoiTip();
          openSpireInfoSheet(spireRec.info, () => $('#mapSpire', body)?.click());
          ev.stopPropagation();
          return;
        }
        // A boss den gets the full sheet: it is the only marker where "is this
        // worth the walk" is a real question (tier, payout, gear odds). A bone
        // pile or a mini keeps the light tooltip; a sheet for a coin pile would
        // be ceremony over nothing.
        const denRec = [...denMarkers.values()].find(r => r.el === el);
        if (denRec) {
          hidePoiTip();
          const d = denRec.den;
          openDenSheet(d, {
            cleared: claimedBoss.has(denKey(dateKey(), d)),
            inRange: d.dist != null && d.dist <= DEN_RADIUS_M,
            // reuse the existing #mapDen path rather than rebuilding the fight:
            // it owns escalation, the paired add and the too-fast gate. Point it
            // at the den that was actually TAPPED, since two dens can be in
            // range at once and the button targets whichever it found first.
            onFight: () => {
              const btn = $('#mapDen', body);
              if (!btn) return;
              btn.dataset.denId = d.id;
              btn.click();
            },
          });
        } else showPoiTip(el);
        ev.stopPropagation();
      } else hidePoiTip();
    });
    map.on('movestart', hidePoiTip);

    function openReportSheet(kind, ctx) {
      const isDen = kind === 'den-nominate';
      const coords = (Number.isFinite(ctx.lat) && Number.isFinite(ctx.lng)) ? `${ctx.lat.toFixed(5)}, ${ctx.lng.toFixed(5)}` : null;
      const title = isDen ? 'Nominate a boss den' : 'Report this spot';
      const lead = isDen
        ? 'Know a spot that would make a great boss den? A landmark, a park, somewhere with meaning. Tell the devs why it belongs on the map.'
        : `Can't reach <b>${esc(ctx.label || 'this spot')}</b>? If it's on private property or otherwise off-limits, let the devs know and they'll review it.`;
      const ph = isDen ? 'Why here? (e.g. the old lighthouse, the town square...)' : "What's wrong? (e.g. this is on private property)";
      openSheet(`
        <h2>${title}</h2>
        <p class="muted" style="margin:0 0 12px">${lead}</p>
        ${coords ? `<p class="muted" style="font-size:12px;margin:0 0 10px">📍 ${coords}</p>` : ''}
        <textarea id="rptNote" rows="3" maxlength="280" placeholder="${esc(ph)}" style="width:100%;box-sizing:border-box;resize:vertical"></textarea>
        <div class="row" style="gap:8px;margin-top:12px">
          <button class="btn ghost sheet-close" style="flex:0 0 auto">Cancel</button>
          <button class="btn" id="rptSend" style="flex:1">Send to devs</button>
        </div>
        <p class="muted" id="rptStatus" style="font-size:12px;margin:10px 0 0"></p>
      `, { cls: 'sheet-report', name: 'map_report', onClose: () => { reportOpen = false; } });
      const btn = $('#rptSend'); const statusEl = $('#rptStatus');
      btn?.addEventListener('click', async () => {
        const note = ($('#rptNote')?.value || '').trim();
        if (isDen && !note) { statusEl.textContent = 'Add a quick reason first.'; return; }
        btn.disabled = true; statusEl.textContent = 'Sending...';
        const r = await sendReport(kind, { lat: ctx.lat, lng: ctx.lng, target: ctx.label, note });
        trackEvent(isDen ? 'den_nominate' : 'report_unreachable');
        if (r && r.ok) { statusEl.textContent = 'Sent. Thanks for the scouting report, bonehead. 💀'; btn.textContent = 'Sent'; setTimeout(closeTopSheet, 1400); }
        else { statusEl.textContent = 'Could not reach the devs. Try again when you are online.'; btn.disabled = false; }
      });
    }

    function refreshDens() {
      const dens = densNear(week, lat, lng, date);
      // snap each den onto reachable ground; drop ones with nowhere reachable
      // (open water). Distance is recomputed from the placed spot so "in range"
      // and the Enter button match the marker you actually see.
      const shown = [];
      for (const d of dens) {
        const placed = placeWalkable({ lat: d.lat, lng: d.lng }, denSnap, d.id);
        if (placed === null) continue;                 // suppressed (unreachable / in water)
        d.lat = placed.lat; d.lng = placed.lng;
        d.dist = distanceM(lat, lng, d.lat, d.lng);
        d.bearing = bearingDeg(lat, lng, d.lat, d.lng);
        shown.push(d);
      }
      // remove markers no longer shown (roaming rotated out, or now suppressed)
      const liveIds = new Set(shown.map(d => d.id));
      for (const [id, rec] of denMarkers) { if (!liveIds.has(id)) { rec.marker.remove(); denMarkers.delete(id); } }
      for (const d of shown) {
        let rec = denMarkers.get(d.id);
        if (!rec) {
          const el = document.createElement('div');
          el.className = 'map-den-mark' + (d.roaming ? ' roaming' : '');
          // visuals + animations live on .den-fx, NOT the marker root — MapLibre
          // owns the root's transform to position the marker, so a transform-based
          // CSS animation on the root would fight it and strand the marker at 0,0.
          el.innerHTML = `<div class="den-fx"><span class="den-eyes"><i></i><i></i></span><img src="assets/brand/tombstone.png" alt=""><span class="den-skulls">${bhIcon('badge-skull', 13, 'currentColor').repeat(Math.min(3, 1 + Math.floor(d.tier / 3)))}</span></div>`;
          rec = { marker: domMarker(maplibregl, map, { lat: d.lat, lng: d.lng, el, anchor: 'bottom' }), el, den: d };
          denMarkers.set(d.id, rec);
        } else {
          rec.marker.setLngLat([d.lng, d.lat]); // reposition if the snap resolved after first render
        }
        rec.den = d;
        rec.el.classList.toggle('claimed', claimedBoss.has(denKey(date, d)));
        rec.el.classList.toggle('inrange', d.dist <= DEN_RADIUS_M && !claimedBoss.has(denKey(date, d)));
        rec.el.classList.toggle('big', d.tier >= 4);
      }
      const openDen = shown.find(d => d.dist <= DEN_RADIUS_M && !claimedBoss.has(denKey(date, d)));
      const db2 = $('#mapDen', body);
      if (db2) {
        db2.hidden = !openDen;
        // drawn skull, not a ☠ dingbat, on a button that sits over hand-inked art
        // drawn skull, not a ☠ dingbat. Tinted to the button's ink, because the
        // icon's default bone fill is nearly invisible on amber.
        if (openDen) { db2.innerHTML = `${bhIcon('badge-skull', 19, '#201500')}Enter ${esc(openDen.name)}`; db2.dataset.denId = openDen.id; }
      }
      return dens;
    }

    function refreshMinis() {
      const minis = minisNear(date, lat, lng);
      // snap onto reachable ground; suppress ones with nowhere reachable (water)
      const shown = [];
      for (const m of minis) {
        const placed = placeWalkable({ lat: m.lat, lng: m.lng }, miniSnap, m.id);
        if (placed === null) continue;
        m.lat = placed.lat; m.lng = placed.lng;
        m.dist = distanceM(lat, lng, m.lat, m.lng);
        m.bearing = bearingDeg(lat, lng, m.lat, m.lng);
        shown.push(m);
      }
      const liveIds = new Set(shown.map(m => m.id));
      for (const [id, rec] of miniMarkers) { if (!liveIds.has(id)) { rec.marker.remove(); miniMarkers.delete(id); } }
      for (const m of shown) {
        let rec = miniMarkers.get(m.id);
        if (!rec) {
          const el = document.createElement('div');
          el.className = 'map-mini-mark';
          el.innerHTML = bhIcon('badge-skull', 17);
          rec = { marker: domMarker(maplibregl, map, { lat: m.lat, lng: m.lng, el, anchor: 'center' }), el, mini: m };
          miniMarkers.set(m.id, rec);
        } else {
          rec.marker.setLngLat([m.lng, m.lat]); // reposition if the snap resolved after first render
        }
        rec.mini = m;
        rec.el.classList.toggle('claimed', claimedMini.has(miniKey(date, m)));
        rec.el.classList.toggle('inrange', m.dist <= MINI_RADIUS_M && !claimedMini.has(miniKey(date, m)));
        rec.el.classList.toggle('t2', m.tier >= 2);
      }
      const open = shown.find(m => m.dist <= MINI_RADIUS_M && !claimedMini.has(miniKey(date, m)));
      const mb = $('#mapMini', body);
      if (mb) {
        // den takes precedence over a mini if both are in range (bosses are the event)
        const denOpen = !$('#mapDen', body)?.hidden;
        mb.hidden = !open || denOpen;
        if (open && !denOpen) { mb.innerHTML = `${ICONS.pit(15)} Fight the ${esc(open.name)}`; mb.dataset.miniId = open.id; }
      }
    }

    // The Glutton: a single world-boss marker, real art + a pulsing blight
    // halo. Skips entirely once beaten (one-time encounter).
    const glutSnap = new Map();
    function refreshGlutton() {
      const w = gluttonLive();
      if (!w) {                                    // between windows, or already cleared
        if (gluttonRec) { gluttonRec.marker.remove(); gluttonRec = null; }
        gluttonPos = null;
        const gb = $('#mapGlutton', body); if (gb) gb.hidden = true;
        return;
      }
      const c = gluttonSpot(lat, lng, date, w.slot);
      let placed = placeWalkable({ lat: c.lat, lng: c.lng }, glutSnap, 'glutton' + w.slot);
      // ALWAYS place him, even unsnapped. placeWalkable returns null while
      // `map.loaded()` is false, and on a live map that streams tiles it is
      // false almost always — gating on it made the world boss permanently
      // invisible. Spawns already behave this way (raw coords until the snap
      // resolves); the marker just refines its spot on a later pass.
      if (!placed) placed = { lat: c.lat, lng: c.lng };
      const glat = placed.lat, glng = placed.lng;
      gluttonPos = { lat: glat, lng: glng };
      const dist = distanceM(lat, lng, glat, glng);
      if (!gluttonRec) {
        const el = document.createElement('div');
        el.className = 'map-glutton-mark';
        el.innerHTML = `<div class="glutton-blight-halo"></div><img src="assets/bh/glutton/idle.png" alt="The Glutton">`;
        gluttonRec = { marker: domMarker(maplibregl, map, { lat: glat, lng: glng, el, anchor: 'center' }), el };
      } else {
        gluttonRec.marker.setLngLat([glng, glat]);
      }
      // Size the blight fog to the REAL suppression radius so the dead ground you
      // see matches where loot actually stops spawning. Convert metres -> px at
      // the current zoom via map.project (falls back to a fixed size pre-load).
      const halo = gluttonRec.el.querySelector('.glutton-blight-halo');
      if (halo && map && map.loaded()) {
        try {
          const a = map.project([glng, glat]);
          const b = map.project([glng, glat + GLUTTON_BLIGHT_M / 111320]);
          const px = Math.max(120, Math.hypot(b.x - a.x, b.y - a.y) * 2);
          halo.style.width = px + 'px'; halo.style.height = px + 'px';
        } catch { /* projection not ready */ }
      }
      gluttonRec.el.classList.toggle('inrange', dist <= GLUTTON_RADIUS_M);
      const gb = $('#mapGlutton', body);
      if (gb) gb.hidden = dist > GLUTTON_RADIUS_M;
    }

    // Dark Spires: permanent territory. Unclaimed ones are held by an NPC warden;
    // yours light up, accrue tribute you must walk to, and fade to dormant if you
    // stop visiting. Marker root carries position ONLY (MapLibre owns its
    // transform) — every filter and animation lives on the inner .spire-fx.
    const spireMarkers = new Map();
    let spireState_ = {};
    let spireInRange = null;
    let spireRemote = new Map();   // id -> server record (who really holds it)
    // Your own towers carry YOUR name, not the word "YOURS": a spire is a
    // territory marker, and reading your handle on it is the whole point. Same
    // name source the Crew tab uses. Offline players have no account name, so
    // they fall back to the neutral label rather than an empty plate.
    let myName = null;
    const loadMyName = async () => {
      try { const me = await social.socialMe(); myName = (me && (me.name || me.handle)) || null; }
      catch { myName = null; }
    };
    await loadMyName();
    let spireFetchedAt = 0, spireFetchKey = '', spireFetching = false;
    const SPIRE_POLL_MS = 60000;
    async function refreshSpires({ force = false } = {}) {
      spireState_ = await spireState();
      // Spires were the one POI family that skipped the walkability snap, so
      // they alone could stand in lakes and backyards. Same rule as dens now:
      // snap to reachable ground or stay hidden; distance from the placed spot.
      const near = spiresNear(lat, lng).slice(0, 4).filter(s => {
        const placed = placeWalkable({ lat: s.lat, lng: s.lng }, spireSnap, s.id);
        if (placed === null) return false;
        s.lat = placed.lat; s.lng = placed.lng;
        s.dist = distanceM(lat, lng, s.lat, s.lng);
        return true;
      });
      // Ownership is shared, so ask the server who holds these. THROTTLED: this
      // runs on the 5s world tick, and polling ownership twelve times a minute
      // would burn battery and data to learn nothing. Refresh at most once a
      // minute, immediately when the set of nearby spires changes, and always
      // right after a claim. Fails soft: no network means the local model drives.
      const key = near.map(s => s.id).join(',');
      const stale = force || key !== spireFetchKey || Date.now() - spireFetchedAt > SPIRE_POLL_MS;
      if (stale && !spireFetching) {
        spireFetching = true;
        try {
          await loadMyName();
          const rows = await social.fetchSpires(near.map(s => s.id)).catch(() => null);
          if (rows) {
            spireRemote = new Map(rows.map(r => [r.id, r]));
            spireFetchedAt = Date.now(); spireFetchKey = key;
            // The server owns spire level. Mirror it onto my own records so the
            // pennant and the tribute multiplier agree with every other phone.
            for (const r of rows) if (r.mine && r.level) await setSpireLevel(r.id, r.level);
          }
        } finally { spireFetching = false; }
      }
      const live = new Set(near.map(s => s.id));
      for (const [id, rec] of spireMarkers) { if (!live.has(id)) { rec.marker.remove(); spireMarkers.delete(id); } }
      spireInRange = null;
      for (const s of near) {
        const view = readSpire(spireState_, s);
        const remote = spireRemote.get(s.id);
        // The server wins on ownership. Someone taking your tower while you were
        // away must show up as THEIRS, not as yours-from-a-stale-local-record.
        const rival = remote && !remote.mine ? remote : null;
        const held = rival ? false : view.held;
        let rec = spireMarkers.get(s.id);
        if (!rec) {
          const el = document.createElement('div');
          el.className = 'map-spire';
          el.innerHTML = `<div class="spire-fx"><span class="spire-flag"></span><span class="spire-lv"></span><img src="assets/brand/tomb.png" alt=""><span class="spire-tribute"></span></div>`;
          rec = { marker: domMarker(maplibregl, map, { lat: s.lat, lng: s.lng, el, anchor: 'bottom' }), el };
          spireMarkers.set(s.id, rec);
        }
        const dormant = !rival && view.dormant;
        // a siege is server truth: read it from the poll when we have it, and fall
        // back to the mirrored local copy between polls
        const siegeUntil = (remote && remote.siegeUntil) || (view.siege ? view.siege.until : 0);
        const siegeName = (remote && remote.siegeName) || (view.siege ? view.siege.name : '');
        const besieged = !!(siegeUntil && siegeUntil > Date.now());
        // How long it has stood, from whoever's claim it is. A rival's tower shows
        // its age too, which is exactly the point: an old tower looks worth taking.
        const heldSince = rival ? (rival.claimedAt || 0) : (held ? (spireState_[s.id]?.claimedAt || 0) : 0);
        const ageTier = heldSince ? wardenTier(Math.floor((Date.now() - heldSince) / 86400000)).tier : 0;
        rec.el.dataset.age = String(ageTier);
        rec.el.classList.toggle('besieged', besieged);
        rec.el.classList.toggle('mine', held);
        rec.el.classList.toggle('rival', !!rival);
        rec.el.classList.toggle('free', !held && !rival);
        rec.el.classList.toggle('dormant', dormant);
        rec.el.classList.toggle('inrange', s.dist <= SPIRE_RADIUS_M);
        $('.spire-flag', rec.el).textContent = besieged ? 'UNDER SIEGE'
          : rival ? (rival.ownerName || 'RIVAL').toUpperCase()
          : held ? (myName ? myName.toUpperCase() : 'YOURS')
          : dormant ? 'DORMANT' : 'UNCLAIMED';
        // A tower's level is its history: every takeover and every repelled siege
        // adds one, and it pays more tribute. Worth reading from across the map.
        const lvl = rival ? (rival.level || 1) : (view.level || 1);
        rec.el.classList.toggle('levelled', lvl > 1);
        const trib = besieged ? `⚔ ${fmtCookTime(siegeUntil - Date.now())}`
          : held && view.tribute.coins ? `${ICONS.coin(11)} ${view.tribute.coins}` : '';
        $('.spire-lv', rec.el).textContent = lvl > 1 ? `LV ${lvl}` : '';
        $('.spire-tribute', rec.el).innerHTML = trib;
        // everything the tap sheet needs, captured at paint time so the sheet
        // never has to re-derive ownership (the server is the authority here)
        rec.info = { s, view, held, rival, dormant, besieged, siegeUntil, siegeName, lvl, heldSince };
        if (s.dist <= SPIRE_RADIUS_M && !spireInRange) {
          spireInRange = { s, view: { ...view, held }, rival, siege: besieged ? { until: siegeUntil, name: siegeName } : null };
        }
      }
      const sb = $('#mapSpire', body);
      if (sb) {
        sb.hidden = !spireInRange;
        if (spireInRange) {
          const { s, view, rival, siege } = spireInRange;
          // A tower you do not hold is one attempt a day. Defending your own
          // (breaking a siege), collecting tribute and tending are NOT gated:
          // they are not fights you can farm.
          const takeSpent = !view.held && spireSpentToday(s.id);
          sb.disabled = takeSpent;
          sb.classList.toggle('spent', takeSpent);
          sb.textContent = siege && view.held ? `Break the siege at ${s.name}`
            : takeSpent ? `${s.name} holds you off until tomorrow`
            : rival ? `Take ${s.name} from ${rival.ownerName || 'them'}`
            : !view.held ? `Take ${s.name}`
            : view.tribute.days ? `Collect ${view.tribute.coins} from ${s.name}`
            : `Tend ${s.name}`;
        }
      }
    }

    // Easter-egg secret dens: whisper within earshot, materialize on approach.
    // No marker, readout or button exists beyond SECRET_REVEAL_M — the whole
    // point is that these spread by rumor, not by map-reading.
    function refreshSecrets() {
      const secrets = secretsNear(lat, lng);
      const liveKeys = new Set();
      let inRange = null;
      for (const s of secrets) {
        if (s.dist <= SECRET_WHISPER_M && s.dist > SECRET_REVEAL_M && !whisperedSecrets.has(s.key)) {
          whisperedSecrets.add(s.key);
          toast(s.whisper, 4600);
        }
        if (s.dist > SECRET_REVEAL_M) continue;
        liveKeys.add(s.key);
        let rec = secretMarkers.get(s.key);
        if (!rec) {
          const el = document.createElement('div');
          el.className = 'map-den-mark secret';
          el.innerHTML = `<div class="den-fx"><span class="den-eyes"><i></i><i></i></span><img src="assets/brand/tombstone.png" alt=""><span class="den-skulls">🥁</span></div>`;
          rec = { marker: domMarker(maplibregl, map, { lat: s.lat, lng: s.lng, el, anchor: 'bottom' }), el };
          secretMarkers.set(s.key, rec);
          toast(`${s.name} has been waiting for you.`, 4200);
          sparkleSound(S.sounds);
        }
        rec.el.classList.toggle('claimed', claimedSecret.has(`secret-${s.bossId}`));
        if (s.dist <= SECRET_RADIUS_M && !inRange) inRange = s;
      }
      for (const [key, rec] of secretMarkers) { if (!liveKeys.has(key)) { rec.marker.remove(); secretMarkers.delete(key); } }
      const sb = $('#mapSecret', body);
      if (sb) {
        const denOpen = !$('#mapDen', body)?.hidden;
        sb.hidden = !inRange || denOpen;
        if (inRange && !denOpen) {
          sb.textContent = claimedSecret.has(`secret-${inRange.bossId}`) ? `🥁 Rematch ${inRange.name}` : `🥁 ${inRange.name.toUpperCase()} AWAITS`;
          sb.dataset.secretKey = inRange.key;
        }
      }
    }

    async function refreshWorld() {
      await refreshEggStrip();   // self-throttled to ~25s; drives the map's purpose line
      const rows = await db.all('xp');
      claimedBoss = new Set(rows.filter(r => r.type === 'bossday' || r.type === 'roamboss').map(r => r.key));
      claimedMini = new Set(rows.filter(r => r.type === 'mini').map(r => r.key));
      claimedSecret = new Set(rows.filter(r => r.type === 'secret').map(r => r.key));
      refreshSpawns();
      refreshDens();
      refreshMinis();
      refreshSecrets();
      refreshGlutton();
      await refreshSpires();
    }

    const raresCued = new Set(); // rares we've already announced this session
    function refreshSpawns() {
      const live = spawnsForRoute(date, lat, lng).filter(s => !collected.has(spawnKey(date, s)));
      const liveById = new Set(live.map(s => s.id));
      // LOCK-ON-APPROACH: a spawn you're closing in on must never vanish or move
      // when its 45m slot rolls. Any shown, uncollected spawn within COLLECT..lock
      // range is kept alive (re-measured to you) even if it dropped out of `live`.
      for (const [, rec] of spawnMarkers) {
        if (liveById.has(rec.spawn.id) || rec.spawn.far) continue;
        if (collected.has(spawnKey(date, rec.spawn))) continue;
        const d = distanceM(lat, lng, rec.spawn.lat, rec.spawn.lng);
        if (d <= APPROACH_LOCK_M) {
          live.push({ ...rec.spawn, dist: d, bearing: bearingDeg(lat, lng, rec.spawn.lat, rec.spawn.lng) });
          liveById.add(rec.spawn.id);
        }
      }
      // Snap on-screen spawns onto the nearest walkable feature (road/path/park)
      // so none sit in a backyard/building, and SUPPRESS any that would land in
      // open water with nothing reachable nearby. The seeded anchor (ledger key)
      // is untouched; only the shown + collectible position moves. Cached per id.
      // NO map.loaded() gate here: loaded() is false throughout a pan while
      // tiles fetch, and skipping this block rendered raw water POIs mid-move
      // (the "flash near water" bug). placeWalkable itself returns null while
      // unready, so an unresolved spawn stays hidden instead of showing raw.
      if (map) {
        for (let i = live.length - 1; i >= 0; i--) {
          const s = live[i];
          const placed = placeWalkable({ lat: s.lat, lng: s.lng }, spawnSnap, s.id);
          if (placed === null) { live.splice(i, 1); continue; } // in the sea / unresolved → hide
          s.lat = placed.lat; s.lng = placed.lng; s.dist = distanceM(lat, lng, s.lat, s.lng); s.bearing = bearingDeg(lat, lng, s.lat, s.lng);
        }
        live.sort((a, b) => a.dist - b.dist);
      }
      // THE BLIGHT: while the Glutton lives, nothing spawns in the dead ground
      // around him. Suppress any spawn within the blight radius of his spot
      // (deterministic from the player position, so no ordering dependency on
      // refreshGlutton). Beating him flips gluttonBeaten -> spawns return.
      // Only while he's actually out: centre on where he PLACED so the dead
      // zone lines up with the fog you can see.
      if (gluttonPos) {
        for (let i = live.length - 1; i >= 0; i--) {
          if (distanceM(live[i].lat, live[i].lng, gluttonPos.lat, gluttonPos.lng) <= GLUTTON_BLIGHT_M) live.splice(i, 1);
        }
      }
      // Rare cue: the ONLY interruption. Fires once per rare when it surfaces nearby.
      for (const s of live) {
        if (s.type === 'rare' && s.dist <= RARE_CUE_M && !raresCued.has(s.id)) {
          raresCued.add(s.id);
          toast(`A rare stirs ${fmtDist(s.dist)} ${compassLabel(s.bearing)}. Track it down.`, 4000);
          sparkleSound(S.sounds);
        }
      }
      const liveIds = new Set(live.map(s => s.id));
      for (const [id, rec] of spawnMarkers) {
        if (!liveIds.has(id)) { rec.marker.remove(); spawnMarkers.delete(id); }
      }
      // the one thing the map itself cannot tell you: how much is out there, and
      // how much of it you have already picked up today. `collected` holds keys
      // shaped `spawn-<date>-<id>` across every day, so filter to this one.
      // Tom, 2026-08-06: "how many are nearby or collected is a stat no one will
      // care about. It might be more useful to see how many steps are left on a
      // hatching egg". So an incubating egg owns this line when there is one:
      // it is the only number on this screen that walking actually moves.
      const cnt = $('#mapCount', body);
      if (cnt) {
        const near = live.filter(s => !s.far).length;
        cnt.innerHTML = eggStrip
          ? `<b>${eggStrip.left.toLocaleString()}</b> steps to hatch`
          : `<b>${near || 'Nothing'}</b> ${near === 1 ? 'spawn nearby' : near ? 'nearby' : 'nearby yet'}`;
      }
      for (const s of live) {
        let rec = spawnMarkers.get(s.id);
        if (!rec) {
          const el = document.createElement('div');
          el.className = `map-spawn ${s.type === 'rare' ? 'rare' : ''} ${s.far ? 'far' : ''}`;
          el.innerHTML = spawnIcon(s.type, 20); // ingredient is a surprise on collect, not previewed
          rec = { marker: domMarker(maplibregl, map, { lat: s.lat, lng: s.lng, el }), el, spawn: s };
          spawnMarkers.set(s.id, rec);
        } else {
          rec.marker.setLngLat([s.lng, s.lat]); // keep marker on its snapped position
        }
        rec.spawn = s;
        rec.el.classList.toggle('inrange', s.dist <= COLLECT_RADIUS_M);
      }
      // readout + collect button (drive off the near field, not distant beacons)
      const reachable = live.filter(s => !s.far);
      const nearest = reachable.length ? reachable.reduce((a, b) => (a.dist < b.dist ? a : b)) : null;
      const tooFast = youSpeed > MAX_LOOT_SPEED;
      const ro = $('#mapReadout', body);
      const inRange = nearest && nearest.dist <= COLLECT_RADIUS_M;
      if (ro) {
        const icon = nearest ? `<span class="ic${inRange ? ' near' : ''}">${spawnIcon(nearest.type, 20)}</span>` : '';
        // The compass bearing and the "getting closer" trend are gone: the map
        // already shows where the thing is, and a second, worse copy of the map
        // in words is what Tom called out. When nothing is at your feet, this
        // card carries PURPOSE instead: the egg your steps are actually feeding.
        ro.innerHTML = tooFast
          ? `<span class="ic warn">${ICONS.boltStroke(20)}</span><span class="tx"><b>Too fast to loot</b><small>Slow to a walk to collect.</small></span>`
          : inRange
            ? `${icon}<span class="tx"><b>${SPAWN_TYPES[nearest.type].label}</b><small>At your feet</small></span>`
            : eggStrip
              ? `<span class="ic">${crateIcon('egg', 20)}</span><span class="tx"><b>${eggStrip.left.toLocaleString()} steps to hatch</b><small>${eggStrip.n > 1 ? `${eggStrip.n} eggs incubating · ` : ''}every step out here counts</small></span>`
              : nearest
                ? `${icon}<span class="tx"><b>${SPAWN_TYPES[nearest.type].label}</b><small>${fmtDist(nearest.dist)} away</small></span>`
                : `<span class="tx"><b>Cleared nearby</b><small>Keep walking, spawns keep surfacing.</small></span>`;
      }
      const card = $('#mapAct', body);
      if (card) card.classList.toggle('live', !!inRange && !tooFast);
      const btn = $('#mapCollect', body);
      if (btn) {
        btn.hidden = !inRange;
        if (inRange) { btn.textContent = tooFast ? 'Slow down' : 'Grab it'; btn.disabled = tooFast; }
        btn.dataset.spawnId = inRange ? nearest.id : '';
      }
    }

    // Anti-cheat gate shared by every map interaction: no looting/fighting from
    // a moving vehicle. Returns true (and nags) when you're going too fast.
    const tooFastToAct = () => { if (youSpeed > MAX_LOOT_SPEED) { toast('Slow down. You can\'t loot or fight from a moving vehicle.', 2800); return true; } return false; };

    $('#mapDen', body).addEventListener('click', async () => {
      if (tooFastToAct()) return;
      const id = $('#mapDen', body).dataset.denId;
      const rec = denMarkers.get(id);
      if (!rec || rec.den.dist > DEN_RADIUS_M) return;
      const den = rec.den;
      const fighter = await buildFighter();
      // landmark dens escalate with your progression; roaming dens use their raw
      // daily tier (they're fresh variety, not the progression ladder).
      const esc = den.roaming ? { mult: den.mult, aiLevel: den.aiLevel, add: null, bossMult: null } : escalateDen(den, await denWinsCount());
      openFight(wrap, fighter, {
        mode: 'boss', name: den.boss, mult: esc.mult, aiLevel: esc.aiLevel,
        talents: den.talents || [], venue: den.name, den, week, add: esc.add, bossMult: esc.bossMult,
      });
    });

    $('#mapSecret', body).addEventListener('click', async () => {
      if (tooFastToAct()) return;
      const key = $('#mapSecret', body).dataset.secretKey;
      const s = secretsNear(lat, lng).find(x => x.key === key);
      if (!s || s.dist > SECRET_RADIUS_M) return;
      const fighter = await buildFighter();
      openFight(wrap, fighter, {
        mode: 'secret', bossId: s.bossId, name: s.name, mult: s.mult, aiLevel: s.aiLevel,
        talents: s.talents || [], venue: 'The Burial Mound',
      });
    });

    $('#mapMini', body).addEventListener('click', async () => {
      if (tooFastToAct()) return;
      const id = $('#mapMini', body).dataset.miniId;
      const rec = miniMarkers.get(id);
      if (!rec || rec.mini.dist > MINI_RADIUS_M || claimedMini.has(miniKey(date, rec.mini))) return;
      const mini = rec.mini;
      const fighter = await buildFighter();
      openFight(wrap, fighter, { mode: 'mini', name: mini.name, mult: mini.mult, aiLevel: mini.aiLevel, talents: [], venue: 'The Boneyard', mini, date });
    });

    // One button, three jobs, because a spire only ever wants one thing from you:
    // take it, collect from it, or keep it alive.
    $('#mapSpire', body).addEventListener('click', async () => {
      if (tooFastToAct()) return;
      if (!spireInRange) return;
      const { s, view, rival, siege } = spireInRange;
      // A SIEGE OUTRANKS EVERYTHING. There is a deadline on it, so a besieged tower
      // must never offer to be tended or milked instead of defended.
      if (siege && view.held) return openSiegeSheet(s, view, siege);
      // belt as well as braces: the button is disabled, but a stale tap or a
      // second entry point must not get a free run at a tower again today.
      if (!view.held && spireSpentToday(s.id)) {
        toast(`${s.name} has already fought you off today. Come back tomorrow.`, 3600);
        return;
      }
      if (rival || !view.held) return openSpireSheet(s, view, rival);
      if (view.tribute.days) {
        const r = await collectTribute(s.id);
        if (!r.ok) { toast('Nothing to collect here yet.'); return; }
        await coinsAdd(r.coins);
        await boneDustAdd(r.dust);
        popSound(S.sounds); confettiBurst(innerWidth / 2, innerHeight * 0.4, 16);
        toast(`${s.name} pays up: +${r.coins} coins, +${r.dust} Bone Dust.`, 3200);
      } else {
        await tendSpire(s.id);
        social.tendSpireRemote(s.id).catch(() => {});
        toast(`${s.name} stands. Resolve restored.`, 2600);
      }
      await refreshSpires();
    });

    $('#mapGlutton', body).addEventListener('click', () => {
      if (tooFastToAct()) return;
      // `gluttonBeaten` never existed: this threw ReferenceError on EVERY tap, so
      // Face The Glutton has never once opened. Beaten/out-of-window is already
      // handled by refreshGlutton, which nulls gluttonRec and hides this button.
      if (!gluttonRec || !gluttonRec.el.classList.contains('inrange')) return;
      openGluttonSheet();
    });

    $('#mapCollect', body).addEventListener('click', async () => {
      if (tooFastToAct()) return;
      haptic.success();
      const id = $('#mapCollect', body).dataset.spawnId;
      const rec = [...spawnMarkers.values()].find(r => r.spawn.id === id);
      if (!rec || rec.spawn.dist > COLLECT_RADIUS_M) return;
      const res = await collectSpawn(rec.spawn);
      if (!res) return;
      collected.add(spawnKey(date, rec.spawn));
      await kvSet('hunt-enabled', true);
      confettiBurst(innerWidth / 2, innerHeight * 0.4, 20);
      coinSound(S.sounds);
      // scavenging drops a cooking ingredient (deterministic per spawn; RAREs give Ectoplasm)
      const { id: ingId, n: ingN } = spawnIngredient(rec.spawn);
      await grantIngredient(ingId, ingN);
      // active feast buff boosts the spawn's coins too
      const fcm = await foodCoinMult();
      if (res.coins && fcm > 1) { const bonus = Math.round(res.coins * (fcm - 1)); await coinsAdd(bonus); res.coins += bonus; }
      // and sometimes a seed of the same thing. This is deliberately the best seed
      // source in the game: the garden is meant to reward walking, not replace it.
      // an Herb patch always pays seeds (that is what it IS); everything else rolls
      const seedN = res.seeds || (rollSpawnSeed() ? 1 : 0);
      const gotSeed = seedN > 0;
      if (gotSeed) await grantSeed(ingId, seedN);
      // reveal the item(s) earned as pack cards (ingredient always; crate if any)
      const ing = INGREDIENTS[ingId];
      const cards = [{ iconHtml: ingIconHtml(ingId, 130), name: `${ing.name}${ingN > 1 ? ` x${ingN}` : ''}`, rarity: ingId === RARE_INGREDIENT ? 'rare' : 'common', kind: 'INGREDIENT', stats: 'Cooking ingredient' }];
      if (gotSeed) cards.push({ iconHtml: bhIcon('garden-seed', 130, BH_ICON_TINTS[ing.iconId] || undefined), name: `${seedName(ingId)} seed${seedN > 1 ? ` x${seedN}` : ''}`, rarity: isRareSeed(ingId) ? 'rare' : 'common', kind: 'SEED', stats: 'Plant it in the Bone Garden' });
      if (res.crate) cards.push({ iconHtml: crateIcon(res.crate, 130), name: res.crate === 'egg' ? 'Step Egg' : 'Common Crate', rarity: res.crate === 'egg' ? 'rare' : 'uncommon', kind: 'CRATE', stats: 'Open it in your Backpack' });
      openPackReveal(cards, { coins: res.coins || 0, footerNote: `+${res.xp} XP` });
      const badges = await evaluateBadges();
      if (badges.length) { queueCelebration({ newBadges: badges }); maybeCelebrate(); }
      refreshWorld();
    });

    worldReady = true;
    refreshWorld();
    // claims and day rollovers must surface even when standing still
    const worldTimer = setInterval(async () => {
      if (!body.isConnected) { clearInterval(worldTimer); return; }
      await syncGluttonCleared();   // self-heal: a boss cleared anywhere leaves the map here
      refreshWorld();
    }, 5000);
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

    // When the Glutton is beaten (fired from the fight settle), he leaves the
    // map at once: marker gone, button hidden, and the blight lifts so loot
    // spawns come back. Cleaned up when the map sheet closes.
    const onGluttonBeaten = async e => {
      if (e?.detail?.key) gluttonCleared.add(e.detail.key);
      await syncGluttonCleared();   // never trust the payload alone: read the ledger
      if (gluttonRec) { gluttonRec.marker.remove(); gluttonRec = null; }
      gluttonPos = null;
      const gb = $('#mapGlutton', body); if (gb) gb.hidden = true;
      refreshSpawns();                             // blight lifts: loot returns
      toast('The blight lifts. The Boneyard breathes again.', 3600);
    };
    addEventListener('bh-glutton-beaten', onGluttonBeaten);
    const onSpireClaimed = async () => { await syncSpireTried(); refreshSpires({ force: true }); };
    addEventListener('bh-spire-claimed', onSpireClaimed);
    // a LOST attempt dispatches only this one, and it still has to spend the day
    const onSpireTried = async () => { await syncSpireTried(); refreshSpires({ force: true }); };
    addEventListener('bh-spire-tried', onSpireTried);
    const prevCleanupGB = cleanupExtras;
    cleanupExtras = () => { prevCleanupGB(); removeEventListener('bh-glutton-beaten', onGluttonBeaten); removeEventListener('bh-spire-claimed', onSpireClaimed); removeEventListener('bh-spire-tried', onSpireTried); };

    let lastTick = 0, ema = null;
    huntWatchId = navigator.geolocation.watchPosition(pos => {
      const now = Date.now();
      if (now - lastTick < 1200) return;
      const dt = lastTick ? (now - lastTick) / 1000 : 0;
      lastTick = now;
      if (!body.isConnected) { cleanup(); return; }
      // travel speed for the anti-cheat gate: prefer the device's own GPS speed,
      // fall back to raw position delta / dt, then smooth it.
      const raw = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      let sp = (pos.coords.speed != null && pos.coords.speed >= 0) ? pos.coords.speed
        : (lastFix && dt > 0 ? distanceM(lastFix.lat, lastFix.lng, raw.lat, raw.lng) / dt : 0);
      lastFix = raw;
      youSpeed += (sp - youSpeed) * 0.5;
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
      sizeRadius();   // lat changed, so metres-per-pixel did too
      youWalk.move(lat, lng);
      if (follow && map) map.easeTo({ center: [lng, lat], duration: 900 });
      refreshWorld();
    }, () => { /* transient errors after boot: keep last position */ }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
  }
  $('#mapStart', wrap).addEventListener('click', () => { kvSet('map-seen', true); startMap(); });
  // been here before + location already allowed: go straight to the map
  if (await kvGet('map-seen', false)) startMap();
}


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
  // training points: one per wellbeing-safe positive day (protein hit / day closed on
  // budget) PLUS one per 25,000 lifetime steps — walking earns build power too.
  // Derived from history, so it's retroactive and idempotent by construction.
  const tpTotal = (behavior.proteinDays || 0) + (behavior.closes || 0) + Math.floor((behavior.lifetimeSteps || 0) / 25000);
  const tpSpent = STAT_META.reduce((a, m) => a + (alloc[m.key] || 0), 0);
  const tpAvail = Math.max(0, tpTotal - tpSpent);
  const inv = await inventory();
  const owned = ['starter', ...inv.filter(r => r.kind === 'weapon').map(r => r.weaponId)];
  let loadout = await kvGet('loadout', 'starter');
  if (!owned.includes(loadout)) loadout = 'starter';
  const talents = await kvGet('talents', []);
  // keep the player's talent array WITH repeats (ranks matter); gear/set talents
  // are single-rank moves, add them only if not already specced.
  //
  // ECONOMY-BENDING TALENTS ARE NOT FREE (2026-08-08). A gear affix or a 4-piece
  // set could previously hand you ANY talent, including ones that change how many
  // actions you get per turn. The sim measured that: Light Feet (+1 AP) is worth
  // almost nothing on its own, because stamina is the real limiter, but bolted
  // onto a stamina-engine build it took the stack from 2.07x to 2.99x baseline
  // damage. That is a 45% power swing from a bonus that costs no talent point and
  // skips the tier gates everyone else pays. Gear can still grant MOVES and
  // damage passives; it can no longer grant action economy.
  const extraTalents = [...gearTalents(gearLo, gOwned, level), ...setInfo.talents]
    .filter(id => !talents.includes(id) && !ECONOMY_TALENTS.has(id));
  const fightTalents = [...talents, ...extraTalents];
  // battle pet: the equipped INSTANCE (its own level, lineage, shiny)
  let battlePet = null, petMeta = null;
  const petInst = await equippedPetInstance();
  if (petInst) {
    const steps = await petStepsForIid(petInst.iid);
    const pl = petLevel(steps);
    const picks = await petPicks(petInst.sp);
    battlePet = buildBattlePet(petInst.sp, pl, picks, { shiny: !!petInst.shiny, lineage: petInst.lineage || 0 });
    petMeta = { id: petInst.sp, iid: petInst.iid, level: pl, picks, steps, lineage: petInst.lineage || 0, shiny: !!petInst.shiny };
  }
  return { stats, baseStats: gearedBase, habitStats: baseStats, gearBonus: gBonus, gearArmor: gArmor, gearLo, alloc, tpTotal, tpAvail, behavior, owned, loadout, talents, fightTalents, battlePet, petMeta, setInfo };
}

/* Talents that change ACTION ECONOMY rather than raw numbers. Gear and set
   bonuses must never grant these: an extra action per turn multiplies every
   other multiplier you own, so it is the one thing that has to be paid for with
   a talent point like everyone else's. Measured in tests/fight-sim.mjs. */
const ECONOMY_TALENTS = new Set(['lightfeet']);

// v146: unlock guidance. The Build screen (talent trees + Bone Merchant) is buried
// under the Pit, so "you have points to spend" or "you can afford a weapon" moments
// were easy to miss. This surfaces them as a home nudge + a "!" on the hero button,
// deep-linking straight to the right screen. Pure fn over already-fetched data;
// returns active signals highest-priority first. Each: {key, hero, action, nudge, toast}.
function computeHomeUnlocks({ fighter, level, coinBal, dustBal, gearOwnedCount, gearEquippedCount, fightWins = 1 }) {
  const sig = [];
  // activation: brand-new players open the app, browse, and stall without ever
  // fighting (seen in tester telemetry). One clear invitation to the core loop.
  if (fightWins === 0) sig.push({
    key: 'fight:first', hero: 'pit', action: 'pit', priority: 6,
    nudge: 'Ready for your first fight?',
    toast: 'The Pit is open. Sparring is free, and your first win pays coins + XP.',
  });
  // first gear owned but nothing worn — the biggest "free power you're missing"
  if (gearOwnedCount > 0 && gearEquippedCount === 0) sig.push({
    key: 'gear:first', hero: 'ward', action: 'wardrobe', priority: 5,
    nudge: 'You have gear to equip',
    toast: "You've got gear waiting. Equip it in your Wardrobe for a stat boost.",
  });
  const unspentTal = Math.max(0, talentPoints(level) - (fighter.talents?.length || 0));
  if (unspentTal > 0) sig.push({
    key: 'tal:' + unspentTal, hero: 'pit', action: 'talents', priority: 4,
    nudge: `${unspentTal} talent point${unspentTal === 1 ? '' : 's'} to spend`,
    toast: `New talent point${unspentTal === 1 ? '' : 's'} ready. Tap Build to spec your Bonehead.`,
  });
  if (fighter.tpAvail > 0) sig.push({
    key: 'tp:' + fighter.tpAvail, hero: 'pit', action: 'talents', priority: 3,
    nudge: `${fighter.tpAvail} training point${fighter.tpAvail === 1 ? '' : 's'} to spend`,
    toast: `You earned ${fighter.tpAvail} training point${fighter.tpAvail === 1 ? '' : 's'}. Shape your build in the Pit.`,
  });
  // affordable vendor weapon that's a genuine UPGRADE — never nudge a weapon
  // weaker than what you already run. We ONLY ever suggest a weapon in the SAME
  // fighting style you currently WIELD, and only if it strictly out-tiers your
  // equipped weapon. Suggesting another archetype (a melee maul to a caster) is
  // what read as "buy a weaker weapon" — a side-grade in a style you don't play.
  const owned = new Set(fighter.owned || []);
  const equipped = WEAPONS[fighter.loadout] || null;
  const equippedArch = equipped && equipped.arch ? equipped.arch : null;    // null = still on the Taped Pipe starter
  // treat a non-tiered found weapon (e.g. the Skull Scepter) as tier 3 so we never suggest below it.
  const equippedTier = equipped ? (equipped.tier || (equipped.arch ? 3 : 0)) : 0;
  let bestW = null;
  for (const w of Object.values(WEAPONS)) {
    if (!w.vendor || owned.has(w.id)) continue;
    const tier = w.tier || 0;
    if (tier < 3) continue;                                 // aspirational only, no entry weapons
    if (equippedArch) {
      if (w.arch !== equippedArch) continue;                // same style you actually fight in
      if (tier <= equippedTier) continue;                   // must strictly out-tier your equipped weapon
    }                                                        // (no real weapon yet → any endgame piece is a fair nudge)
    const c = weaponCoinCost(w.id), d = weaponDustCost(w.id);
    if (c == null || coinBal < c || dustBal < d) continue;
    if (!bestW || tier > bestW.tier || (tier === bestW.tier && c < bestW.c)) bestW = { id: w.id, name: w.name, c, tier };
  }
  if (bestW) sig.push({
    key: 'wpn:' + bestW.id, hero: 'pit', action: 'talents', priority: 2,
    nudge: `You can afford the ${bestW.name}`,
    toast: `The Bone Merchant has an upgrade you can afford: ${bestW.name}.`,
  });
  return sig.sort((a, b) => b.priority - a.priority);
}

// Toast the highest-priority NEW unlock once. seenUnlocks kv is pruned to only
// currently-active keys, so a state that goes away and returns notifies again;
// the in-memory memo stops double-toasts across the rapid re-renders of refresh().
async function fireUnlockToasts(unlocks) {
  const active = unlocks.map(u => u.key);
  const prevSeen = new Set(await kvGet('seenUnlocks', []));
  await kvSet('seenUnlocks', active); // persist = currently active (bounded, self-pruning)
  const fresh = unlocks.filter(u => !prevSeen.has(u.key));
  if (!fresh.length) return;
  const memo = S.unlockToasted || (S.unlockToasted = new Set());
  const top = fresh.find(u => !memo.has(u.key));
  if (!top) return;
  fresh.forEach(u => memo.add(u.key));
  toast(top.toast, 3600);
  levelSound(S.sounds);
}

// The GAME-ONLY profile snapshot that syncs when online. Level, stats, outfit
// ids (art renders locally on friends' devices), gear, badges. Deliberately
// NEVER: food logs, weights, location, health data.
const APP_SOCIAL_V = 'v68';
const APP_BUILD = 'v291'; // shown in Settings so we can confirm the running build; bump with sw.js VERSION
// Crew grants land as a pack reveal (item grants get cards, coins/XP ride the
// footer); pure coin/XP deliveries keep the light toast so boot stays calm.
function presentGrantDelivery(r) {
  if (!r || !(r.applied > 0)) return;
  const cards = [];
  let coinsSum = 0, xpSum = 0;
  const cheers = [];      // reward-less friend cheers
  const coinGifts = [];   // coins-only gifts (shown as a line, not a card)
  const giftInfos = [];   // every gift (for the OS notification)
  const spireNews = [];    // towers lost or left dormant while I was away
  for (const g of r.appliedGrants || []) {
    const p = g.payload || {};
    if (g.type === 'cheer') { cheers.push(p); continue; }
    // A LOST TOWER. The server has always sent this grant and the client has
    // always applied it to the ledger, but nothing here displayed it, so having
    // your spire taken was completely silent. It is the revenge-walk hook: it
    // gets a card of its own.
    if (g.type === 'spire') { spireNews.push(p); continue; }
    coinsSum += p.coins || 0; xpSum += p.xp || 0;
    const kind = p.gift ? 'GIFT' : 'CREW DELIVERY';
    if (p.gift) giftInfos.push({ from: p.from, label: giftRewardLabel(p) });
    const note = p.note || (p.gift ? `A gift${p.from ? ' from ' + p.from : ''}` : 'From the Crew');
    let hadCard = false;
    if (p.crate && CRATES[p.crate]) { cards.push({ iconHtml: crateIcon(p.crate, 120), name: CRATES[p.crate].label, rarity: p.crate === 'daily' ? 'uncommon' : 'rare', kind, stats: esc(note) }); hadCard = true; }
    if (p.gearId && GEAR_BY_ID[p.gearId]) { cards.push({ ...gearToCard(GEAR_BY_ID[p.gearId]), kind }); hadCard = true; }
    if (p.consumable && CONSUMABLES[p.consumable]) { cards.push({ iconHtml: consumableIcon(p.consumable, 120), name: CONSUMABLES[p.consumable].label, rarity: 'uncommon', kind, stats: esc(note) }); hadCard = true; }
    if (p.gift && !hadCard && p.coins) coinGifts.push(`${p.from || 'A friend'} sent you ${p.coins} coins!`);
  }
  for (const p of spireNews) {
    cards.push({
      iconHtml: `<img src="assets/brand/tomb.png" style="width:110px;height:110px;object-fit:contain;filter:grayscale(1) brightness(.75)">`,
      name: 'Spire Lost', rarity: 'rare', kind: 'DARK SPIRE',
      stats: esc(p.note || 'One of your towers no longer flies your name.'),
    });
  }
  // OS notification for friend gifts + cheers (so it feels like an event, not
  // just an in-app toast). Fire-and-forget; gated on the Crew notif pref.
  maybeNotifyFriendGrants(giftInfos, cheers);
  // cheers: friendly stacked toasts (staggered so multiple are readable)
  cheers.forEach((c, i) => {
    const em = CHEERS[c.cheer] ? CHEERS[c.cheer].emo : '📣';
    const tx = CHEERS[c.cheer] ? CHEERS[c.cheer].txt : 'cheered you on';
    setTimeout(() => toast(`${em} ${esc(c.from || 'A friend')}: ${esc(tx)}`, 4200), i * 900);
  });
  if (cards.length) { openPackReveal(cards, { coins: coinsSum, footerNote: xpSum ? `+${xpSum} XP` : '' }).then(refresh); return; }
  if (coinGifts.length) { toast(coinGifts[0] + (coinGifts.length > 1 ? ` (+${coinGifts.length - 1} more)` : ''), 4200); bgRefresh(); return; }
  if (coinsSum || xpSum) { toast(`Crew delivery: ${[coinsSum ? `+${coinsSum} coins` : '', xpSum ? `+${xpSum} XP` : ''].filter(Boolean).join(' · ')}.`, 3600); bgRefresh(); return; }
  if (cheers.length) { bgRefresh(); return; } // cheers already toasted, nothing else to reveal
  toast(`Crew delivery: ${r.applied} reward${r.applied === 1 ? '' : 's'} arrived.`, 3600); bgRefresh();
}

// Push a local notification when a friend sends a gift or cheer. Gated on the
// same 'friends' (Crew) notif pref as friend requests. Aggregates so a batch
// pull doesn't fire a dozen banners.
async function maybeNotifyFriendGrants(gifts, cheers) {
  try {
    if (!gifts.length && !cheers.length) return;
    const prefs = await notifPrefs();
    if (!prefs.enabled || !prefs.friends) return;
    if (gifts.length === 1) await notifyNow('🎁 A gift arrived', `${gifts[0].from || 'A friend'} sent you ${gifts[0].label}.`);
    else if (gifts.length > 1) await notifyNow('🎁 Gifts arrived', `Your Crew sent you ${gifts.length} gifts.`);
    if (cheers.length === 1) {
      const c = cheers[0]; const ph = CHEERS[c.cheer] ? CHEERS[c.cheer].txt : 'cheered you on';
      await notifyNow('📣 A cheer', `${c.from || 'A friend'}: ${ph}`);
    } else if (cheers.length > 1) await notifyNow('📣 Cheers', `${cheers.length} cheers from your Crew.`);
  } catch { /* noop */ }
}

// Keep local notifications in sync with prefs: recurring reminders + the next
// few upcoming rare pushes computed from the last place you opened the map.
async function refreshNotifSchedules() {
  try {
    await syncNotifications();
    const loc = await kvGet('lastLoc', null);
    await scheduleRares();   // retired: clears any rare pushes still queued
  } catch { /* fails silent */ }
}

/* THE WEEKLY RACE. Tom, 2026-08-08: "there should be weekly events that show
   which player has the most steps and then a prize that they win for having the
   most... creates rivalry and gets people moving."
   Steps already live in the local `health` store per day; this is the only new
   thing the profile has to carry, and it is stamped with the week it belongs to
   so a stale sync can never be counted into the wrong week. */
/* The race runs in 7-day periods anchored to the day it LAUNCHES, not to the
   calendar Monday. Tom, 2026-08-08: "the step race should start today if we're
   posting it today why the fuck would we do it monday". A Monday-anchored week
   means announcing it on a Thursday hands whoever already walked Mon-Wed a lead
   nobody else agreed to race for. Day one is day one. */
const RACE_EPOCH = '2026-08-08';
const RACE_LIVE = true;    // art approved by Tom 2026-08-08; the race starts the day this ships
const RACE_DAYS = 7;

function raceWeekKey(date = dateKey()) {
  const ms = Date.parse(date + 'T00:00:00') - Date.parse(RACE_EPOCH + 'T00:00:00');
  if (!(ms >= 0)) return RACE_EPOCH;                     // before launch: everything is period one
  const period = Math.floor(ms / (RACE_DAYS * 86400000));
  return dateKey(new Date(Date.parse(RACE_EPOCH + 'T00:00:00') + period * RACE_DAYS * 86400000));
}
// Test hook (webdriver only): the race period boundary is the one rule a player
// cannot see, so it has to be measurable without waiting a week.
if (typeof window !== 'undefined' && navigator.webdriver) window.__raceWeek = d => raceWeekKey(d);
// "2nd", not "2": the banner reads as a sentence, not a stat line
function ordinal(n) {
  if (!(n > 0)) return '';
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function raceWeekDates(weekKey) {
  const t0 = Date.parse(weekKey + 'T00:00:00');
  return Array.from({ length: RACE_DAYS }, (_, i) => dateKey(new Date(t0 + i * 86400000)));
}

async function weekStepsNow(date = dateKey()) {
  const wk = raceWeekKey(date);
  const days = new Set(raceWeekDates(wk));
  const rows = await db.all('health');
  return { weekKey: wk, steps: rows.reduce((a, r) => a + (days.has(r.date) ? (r.steps || 0) : 0), 0) };
}

async function socialSnapshot() {
  const [fighter, eq, xp, gOwned, earned, wk] = await Promise.all([buildFighter(), equipped(), totalXp(), ownedGearIds(), earnedBadgeIds(), weekStepsNow()]);
  const lvl = levelFor(xp);
  return {
    weekKey: wk.weekKey,
    weekSteps: wk.steps,
    level: lvl.level,
    levelName: lvl.name,
    stats: fighter.stats,
    talents: fighter.talents,
    weapon: fighter.loadout,
    outfit: eq,
    gearLo: fighter.gearLo,
    gear: [...gOwned].slice(0, 400),
    badges: earned.size ?? [...earned].length,
    pet: fighter.petMeta ? { id: fighter.petMeta.id, level: fighter.petMeta.level, shiny: !!fighter.petMeta.shiny, lineage: fighter.petMeta.lineage || 0 } : null,
  };
}

// Push the public profile snapshot to the server RIGHT AWAY after the player
// changes what friends see (equip a weapon / outfit / gear / pet), instead of
// waiting for the 5-min throttled background sync. Debounced ~1.2s so a flurry
// of equips coalesces into one upload. The Crew tab already pulls live on open,
/* SIEGES. Asking /spires/mine is what lets the server start one, and it only ever
   starts one while we are here to see it, so the full 48h is always walkable. This
   is also the only new notification in the game: announced once on discovery
   (kv 'siegeSeen' keyed by id+deadline, so a re-open never re-announces), plus a
   single native reminder 12h out. */
async function checkSieges() {
  try {
    if (navigator.webdriver && !window.__siegeForce) return;
    const rows = await social.fetchMySpires();
    if (!rows) return;                       // offline: keep whatever we knew
    const fresh = await syncSieges(rows);
    const live = await besiegedSpires();
    if (!live.length) { await cancelSiegeReminder(); return; }
    const top = live[0];
    await scheduleSiegeReminder(top.siege.name, top.name || 'your spire', top.siege.until);
    if (!fresh.length) return;
    const seen = new Set((await kvGet('siegeSeen', [])) || []);
    const announce = fresh.filter(f => !seen.has(`${f.id}:${f.until}`));
    if (!announce.length) return;
    for (const f of announce) seen.add(`${f.id}:${f.until}`);
    // keep the ledger small; only recent keys matter
    await kvSet('siegeSeen', [...seen].slice(-40));
    const a = announce[0];
    const hrs = Math.max(1, Math.round((a.until - Date.now()) / 3600000));
    notifyNow('Your spire is under siege', `${a.siegeName || 'A siege'} is at ${a.name}. ${hrs}h to walk out and break it.`).catch(() => {});
    toast(`${a.siegeName || 'A siege'} is at ${a.name}. ${hrs}h to defend it.`, 5200);
    refresh();
  } catch { /* never let a siege check break a boot */ }
}

// so friends see new gear within seconds. No-op when offline.
let _profilePushT = null;
function pushProfileSoon() {
  if (_profilePushT) clearTimeout(_profilePushT);
  _profilePushT = setTimeout(async () => {
    _profilePushT = null;
    try { if (await social.isOnline()) await social.syncProfile(await socialSnapshot(), APP_SOCIAL_V); } catch { /* best-effort */ }
  }, 1200);
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
  const date = dateKey();
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

  // Sections. The "current fight to spot" floats to the top and opens; anything
  // you've finished collapses out of the way. Pre-Champion the Ladder leads;
  // once you've beaten the Champion, the endless Gauntlet (your live fight) leads
  // and the beaten Ladder/Champion tuck away below.
  const ladderOpen = !champOpen;              // still climbing the ladder
  // Tier 3 (mockup t3-pitentry.html, approved 2026-08-07): the collapsed
  // <details> stack becomes a flat, readable board. Rungs are numbered plates,
  // a locked rung says WHY ("BEAT RUNG 1") instead of just "locked", and the
  // live fight is never hidden behind a summary you have to open.
  const sparringSect = `
    <div class="t3-sect"><b>Sparring · no stakes</b><i></i><span class="r chip" style="font-size:11px">Always free</span></div>
    ${[['easy', 'Loose Bones', 0.8], ['even', 'Your Shadow', 1.0], ['hard', 'Mean Mirror', 1.15]].map(([id, name, m]) => `
      <div class="t3-row"><span class="t3-med">${ICONS.pit(20)}</span>
        <div class="t3-tx"><b>${name}</b><small>${Math.round(m * 100)}% of your stats · +15 coins on a win</small></div>
        <button class="btn ghost" data-spar="${m}" data-name="${name}">FIGHT</button>
      </div>`).join('')}`;
  const ladderSect = `
    <div class="t3-sect"><b>The ladder</b><i></i><span class="r chip" style="font-size:11px">${champOpen ? 'Cleared' : `Rung ${Math.min(rungsBeaten + 1, LADDER.length)} of ${LADDER.length}`}</span></div>
    ${LADDER.map(r => {
      const done = beaten.has(`pitrung-${r.rung}`);
      const locked = r.rung > rungsBeaten + 1;
      return `<div class="t3-row${done ? ' done' : ''}">
        <span class="t3-rung">${r.rung}</span>
        <div class="t3-tx"><b>${r.name}</b><small>${Math.round(r.mult * 100)}% stats · ${done ? `rematch · ${ICONS.coin(12)}${r.repeatCoins}` : `first win ${ICONS.coin(12)}${r.coins} + ${r.xp} XP`}</small></div>
        ${locked ? `<span class="t3-lock">BEAT RUNG ${rungsBeaten + 1}</span>` : `<button class="btn ${done ? 'ghost' : ''}" data-rung="${r.rung}" ${gate}>${done ? 'REMATCH' : 'FIGHT'}</button>`}
      </div>`;
    }).join('')}`;
  /* THE REMOTE DEN. Tom, 2026-08-06: "People that can't get out for walks feel
     like there's no point to log on." One boss a day, no location needed, free.
     It counts as a den win, which is the actual thing walking used to gate: the
     Gauntlet's ceiling. Modest on purpose so walking to a real den still pays
     better. Lives at the TOP of the Pit because for a housebound player it is
     the day's event. */
  const rDen = remoteDen(date);
  const rDone = beaten.has(denKey(date, rDen));
  const remoteSect = `
    <div class="t3-sect"><b>Remote den · one a day</b><i></i><span class="r chip" style="font-size:11px">No walking needed</span></div>
    <div class="t3-row${rDone ? ' done' : ''}">
      <span class="t3-med">${bhIcon('badge-skull', 20)}</span>
      <div class="t3-tx"><b>${esc(rDen.boss)}</b><small>${esc(rDen.name)} · ${rDone ? 'cleared today · back tomorrow' : `${denRewardLabel(rDen)} · free`}</small></div>
      ${rDone ? '<span class="t3-lock">TOMORROW</span>' : '<button class="btn" id="remoteDenBtn">FIGHT</button>'}
    </div>`;

  const champSect = `
    <div class="t3-sect"><b>After the ladder</b><i></i></div>
    <div class="t3-row${champBeaten ? ' done' : ''}">
      <span class="t3-med">${crateIcon('golden', 22)}</span>
      <div class="t3-tx"><b>${CHAMPION.name}</b><small>${champBeaten ? `rematch · ${ICONS.coin(12)}${CHAMPION.repeatCoins}` : 'Wields the Bonecrusher · first win drops it + a Golden Crate'}</small></div>
      ${champOpen ? `<button class="btn ${champBeaten ? 'ghost' : ''}" id="champBtn" ${gate}>${champBeaten ? 'REMATCH' : 'FIGHT'}</button>` : `<span class="t3-lock">BEAT RUNG ${LADDER.length}</span>`}
    </div>`;
  const endlessSect = `
    <div class="t3-sect"><b>Endless · The Gauntlet</b><i></i>${champBeaten ? `<span class="r chip" style="font-size:11px">${canNewRank ? `Rank ${fightRank}` : 'At the cap'}</span>` : ''}</div>
    ${champBeaten ? `
    ${canNewRank
      ? `<p class="note" style="margin:2px 2px 8px">Foes scale <b>forever</b>, the Pit never runs dry. Cleared <b>${endlessBeaten}</b> rank${endlessBeaten === 1 ? '' : 's'} of a possible ${ceiling}.</p>`
      : `<div class="pit-gate">
          <div class="pg-head"><span class="pg-ico">${bhIcon('tombstone', 22)}</span><b>You have hit the ceiling at rank ${ceiling}</b></div>
          <p class="pg-why">The Gauntlet does not go higher until you beat a <b>world boss den</b> out on the map. Each boss you beat raises the ceiling by <b>3 ranks</b>.</p>
          <div class="pg-meter"><span>${denWins} boss${denWins === 1 ? '' : 'es'} beaten</span><b>cap ${ceiling}</b><span>next boss → cap ${ceiling + 3}</span></div>
          <button class="btn" id="endlessGate" style="width:100%">Find a world boss on the map</button>
          <p class="pg-foot">You can still rematch rank ${ceiling} below for coins while you look.</p>
        </div>`}
    <div class="t3-row${canNewRank ? '' : ' capped'}">
      <span class="t3-rung">${fightRank}</span>
      <div class="t3-tx"><b>${esc(fightFoe.name)}</b><small>${Math.round(fightFoe.mult * 100)}% stats · ${canNewRank ? `${fightFoe.xp} XP + ${ICONS.coin(12)}${fightFoe.coins}` : `<b>rematch only</b> · ${ICONS.coin(12)}${fightFoe.repeatCoins}, no new rank`}</small></div>
      <button class="btn${canNewRank ? '' : ' ghost'}" id="endlessBtn" ${gate}>${canNewRank ? 'FIGHT' : 'REMATCH'}</button>
    </div>`
    : `
    <div class="t3-row">
      <span class="t3-med">${ICONS.lock(20)}</span>
      <div class="t3-tx"><b>The Gauntlet</b><small>Foes scale <b>forever</b>. The climb never ends.</small></div>
      <span class="t3-lock">BEAT THE CHAMPION</span>
    </div>`}`;
  // beaten the Champion → your live endless fight leads, spent content tucks below.
  const pitSections = (champBeaten
    ? [remoteSect, endlessSect, ladderSect, champSect, sparringSect]
    : [remoteSect, ladderSect, champSect, sparringSect, endlessSect]).join('');

  // The mockup's hero sat on a raster capture of the arena. The app already
  // draws that arena in CSS, live and lighter than shipping a screenshot as
  // art, so the poster keeps the drawn scene and takes the mockup's typography.
  body.innerHTML = `
    <div class="t3-hero">
      <div class="pit-hero-atmos">
        <span class="pit-arch"></span>
        <span class="pit-crowd"></span>
        <span class="pit-torch l"></span><span class="pit-torch r"></span>
        <span class="pit-banner l"></span><span class="pit-banner r"></span>
        <span class="pit-fog"></span>
      </div>
      <h2>MANY ENTER.<br>FEW LEAVE.</h2>
      <p>${champBeaten ? `THE GAUNTLET · RANK ${fightRank}` : `THE LADDER · RUNG ${Math.min(rungsBeaten + 1, LADDER.length)} OF ${LADDER.length}`}</p>
      <div class="stats">
        <span class="chip">${d.maxHp} HP</span>
        <span class="chip">${d.maxWind} STAMINA</span>
        <span class="chip">${ICONS.boltIco(13)} ${energy.ready} READY</span>
      </div>
    </div>
    <div class="t3-energy ${tapped ? 'empty' : ''}">
      <span class="ic">${ICONS.boltIco(20)}</span>
      <div class="tx">
        <b>${energy.ready} fight${energy.ready === 1 ? '' : 's'} in the tank</b>
        <div class="bar"><i style="width:${Math.min(100, Math.round(energy.ready / (energy.freeMax + 6) * 100))}%"></i></div>
        <small>${energy.free} free today + ${energy.vigor} Vigor${tapped ? ' · log a meal or take a walk to earn Vigor' : ' · log food and walk to earn more'}</small>
      </div>
    </div>
    <button class="t3-forage" id="buildBtn" style="margin:0 0 4px">${ICONS.pit(20)}<b>Shape your build</b><small>stats, weapon &amp; talents ›</small>${unspent > 0 ? `<i class="hero-badge" style="position:static;display:inline-block;margin-left:4px">${unspent}</i>` : ''}</button>
    ${pitSections}`;

  $('#buildBtn', body)?.addEventListener('click', () => openCharacter('talents'));
  // the remote den spends NO energy: being unable to walk is the whole reason
  // it exists, so charging for it would re-create the wall it removes
  $('#remoteDenBtn', body)?.addEventListener('click', () => {
    openFight(wrap, fighter, {
      mode: 'boss', name: rDen.boss, mult: rDen.mult, aiLevel: rDen.aiLevel,
      talents: rDen.talents || [], venue: rDen.name, den: rDen, add: null, bossMult: null,
    });
  });
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
  $('#endlessGate', body)?.addEventListener('click', () => { toast('Beat a world-boss den on the map to climb higher.', 2600); location.hash = '#/boneyard'; });
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

// Active statuses on a fighter, as tappable chips: {k, lab, turns, det}. Powers
// the always-on debuff chips on the plates so you can see what's already applied
// (and how long) before re-blinding/re-burning.
function fighterStatuses(f) {
  const tn = x => (x && typeof x.turns === 'number' && x.turns > 0) ? x.turns : null;
  const ts = x => tn(x) ? tn(x) + 't' : '';
  const s = [];
  if (f.burn) s.push({ k: 'burn', ic: '🔥', n: ts(f.burn), det: `Burn: ~${f.burn.per || 5} fire damage per turn${tn(f.burn) ? `, ${tn(f.burn)} turn${tn(f.burn) === 1 ? '' : 's'} left` : ''}. Re-applying refreshes the timer.` });
  if (f.bleed) s.push({ k: 'bleed', ic: '🩸', n: '×' + f.bleed.stacks, det: `Bleed, ${f.bleed.stacks} stack${f.bleed.stacks === 1 ? '' : 's'}: loses HP each turn${tn(f.bleed) ? `, ${tn(f.bleed)}t left` : ''}. Re-applying adds a stack (max 3) and more damage.` });
  if (f.poison) s.push({ k: 'poison', ic: '🧪', n: '×' + f.poison.stacks, det: `Poison, ${f.poison.stacks} stack${f.poison.stacks === 1 ? '' : 's'}: ~${(f.poison.per || 0) * f.poison.stacks} damage/turn${tn(f.poison) ? `, ${tn(f.poison)}t left` : ''}.` });
  if (f.blind) s.push({ k: 'blind', ic: '🌀', n: ts(f.blind), det: `Blind: about ${Math.round((f.blind.pct || 0) * 100)}% higher chance to miss${tn(f.blind) ? `, ${tn(f.blind)}t left` : ''}. No point re-applying until it fades.` });
  if (f.weaken) s.push({ k: 'weaken', ic: '🔻', n: ts(f.weaken), det: `Weaken: deals ${Math.round((f.weaken.pct || 0) * 100)}% less damage${tn(f.weaken) ? `, ${tn(f.weaken)}t left` : ''}.` });
  if (f.sunder) s.push({ k: 'sunder', ic: '💢', n: ts(f.sunder), det: `Sunder: takes +15% damage${tn(f.sunder) ? `, ${tn(f.sunder)}t left` : ''}.` });
  if (f.marked) s.push({ k: 'mark', ic: '🎯', n: ts(f.marked), det: `Marked for death: takes extra finisher damage${tn(f.marked) ? `, ${tn(f.marked)}t left` : ''}.` });
  if (f.stagger) s.push({ k: 'stagger', ic: '💫', n: '', det: `Stagger: off balance, the next hit on them lands harder.` });
  if (f.rage) s.push({ k: 'rage', ic: '😤', n: '', det: `Rage: deals more damage but bleeds itself each turn.` });
  if (f.ward > 0) s.push({ k: 'ward', ic: '🛡', n: String(f.ward), det: `Bone Guard: absorbs the next ${f.ward} damage before HP is touched.` });
  if (f.minion) s.push({ k: 'summon', ic: '💀', n: '', det: `A bone minion is fighting alongside them.` });
  if (f.totem) s.push({ k: 'summon', ic: '⚡', n: '', det: `A spirit totem zaps each turn.` });
  if (f.flock > 0) s.push({ k: 'summon', ic: '🐦', n: String(f.flock), det: `${f.flock} crows pecking each turn.` });
  if (f.toxicity > 0) s.push({ k: 'poison', ic: '☣', n: String(f.toxicity), det: `Toxicity ${f.toxicity}: alchemist buildup, bigger payoff when it pops.` });
  return s;
}

async function openFight(pitWrap, fighter, foeCfg) {
  const eq = await equipped();
  const food = await foodCombatBuff(); // active dish buffs (damage / hype / regen / pet-free)
  let potionInv = await potionsInv(); // brewed potions you can drink mid-fight
  const player = makeFighter({ name: 'You', stats: fighter.stats, weaponId: fighter.loadout, outfit: eq, talents: fighter.fightTalents || fighter.talents, pet: fighter.battlePet, food, gearArmor: fighter.gearArmor });
  const foeTalents = foeCfg.mode === 'champ' ? CHAMPION.talents : (foeCfg.mode === 'rung' ? (RUNG_TALENTS[foeCfg.rung] || []) : (foeCfg.talents || []));
  const foe = makeFighter({
    name: foeCfg.name,
    // friend battles use the friend's REAL stats + outfit (a faithful AI clone);
    // Pit/boss foes scale off the player's stats by the tier multiplier
    stats: foeCfg.foeStats ? foeCfg.foeStats : scaleStats(fighter.stats, foeCfg.bossMult || foeCfg.mult),
    weaponId: foeCfg.weaponId || 'starter',
    outfit: foeCfg.foeOutfit || foeOutfitFor(foeCfg.name),
    talents: foeTalents,
  });
  const add = foeCfg.add ? makeFighter({
    name: foeCfg.add.name,
    stats: scaleStats(fighter.stats, foeCfg.add.mult),
    talents: foeCfg.add.talents || [],
    outfit: foeOutfitFor(foeCfg.add.name),
  }) : null;
  trackEvent('fight_start', { mode: foeCfg.mode || 'pit', pet: !!fighter.petMeta });
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

  // mini + boss fights are launched from the Boneyard map, not the Pit; the
  // done/flee copy and the return target follow from that.
  const fromMap = foeCfg.mode === 'mini' || foeCfg.mode === 'boss' || foeCfg.mode === 'secret' || foeCfg.mode === 'glutton';
  const wrap = openSheet(`
    <div class="sheet-head"><div class="fight-title"><h2>${esc(foeCfg.name)}</h2><span class="fight-venue">${esc(venue)}</span></div><button class="sheet-close">Flee</button></div>
    <div class="sheet-body" id="fightBody" style="padding-bottom:10px"></div>`,
    { cls: 'full', onClose: () => { stopGluttonFoeAnim(); if (!fight.over && !settled) toast(fromMap ? 'You slipped away. No harm done.' : 'You slipped out of The Pit. No harm done.'); } });

  const body = $('#fightBody', wrap);
  let stopGluttonFoeAnim = () => {};
  body.innerHTML = `
    <div class="arena" id="arena">
      <div class="pit-crowd"></div>
      <div class="pit-banner l"></div><div class="pit-banner r"></div>
      <div class="pit-torch l"></div><div class="pit-torch r"></div>
      <div class="pit-floor"></div>
      <div class="pit-fog"></div>
      <div class="arena-floor"></div>
      <!-- fighting-game HUD: bars pinned to the arena's top corners with a
           guaranteed center gap (they used to ride the fighters and collided
           mid-arena, with the pet's bar piling under yours) -->
      <div class="fight-hud">
        <div class="hud-side you">
          <div class="fname">You</div>
          <div class="bar fhp"><i id="youHp" style="width:100%"></i></div>
          <div class="microbars"><div class="bar fwind"><i id="youWind" style="width:100%"></i></div><div class="bar fhype"><i id="youHype" style="width:0%"></i></div></div>
          <div class="fstate" id="youState" hidden></div>
          ${petBody ? `<div class="hud-pet" id="hudPet"><span class="petname">${esc(petBody.name)}</span><div class="bar fhp mini"><i id="petHp" style="width:100%"></i></div></div>` : ''}
        </div>
        <div class="hud-side foe">
          <div class="fname">${esc(foe.name)}</div>
          <div class="bar fhp"><i id="foeHp" style="width:100%"></i></div>
          <div class="microbars"><div class="bar fwind"><i id="foeWind" style="width:100%"></i></div><div class="bar fhype"><i id="foeHype" style="width:0%"></i></div></div>
          <div class="fstate" id="foeState" hidden></div>
          ${add ? `<div class="hud-pet" id="hudAdd"><span class="petname">${esc(add.name)}</span><div class="bar fhp mini"><i id="addHp" style="width:100%"></i></div></div>` : ''}
        </div>
      </div>
      <div class="fighterG foe-side${foeCfg.mode === 'glutton' ? ' glutton-boss' : ''}" id="foeG" data-target="f">
        <div class="bh-stage fstage${foeCfg.mode === 'glutton' ? ' glutton-foe' : ''}" id="foeStage">${foeCfg.mode === 'glutton' ? gluttonStageHtml() : `<div class="mirror-wrap">${avatarLayersHtml(foe.outfit, { noYard: true, skip: ['BG'] })}</div>`}</div>
        ${add ? `
        <div class="pet-fighter add" id="addG" data-target="fa">
          <div class="bh-stage fstage petmini${foeCfg.add && foeCfg.add.beast ? ' beast' : ''}" id="addStage"><div class="mirror-wrap">${avatarLayersHtml(add.outfit, { noYard: true, skip: ['BG'] })}</div></div>
        </div>` : ''}
      </div>
      <div class="fighterG you-side" id="youG">
        <div class="bh-stage fstage" id="youStage">${avatarLayersHtml(player.outfit, { noYard: true, skip: ['BG', 'C'] })}</div>
        ${petBody ? `
        <div class="pet-fighter" id="petG">
          <div class="bh-stage fstage petmini${petArtId && petHovers(petArtId) ? ' flyer' : ''} r-${(BH_BY_ID[petArtId] || {}).rarity || 'common'} lin-${Math.min((petBody.kit && petBody.kit.lineage) || 0, 6)}${petArtId && S.shinyPets.has(petArtId) ? ' is-shiny' : ''}" id="petStage">${petArtId && BH_BY_ID[petArtId] ? petSpriteHtml(petArtId, 76, !petHovers(petArtId)) : ''}</div>
        </div>` : ''}
      </div>
      <div id="floats"></div>
    </div>
    <div class="fight-meta"><span class="range-pill" id="rangePill"></span><span class="fight-log" id="flog">Round one. Your turn.</span></div>
    <div class="fight-actions" id="factions"></div>`;

  if (foeCfg.mode === 'glutton') stopGluttonFoeAnim = startGluttonLoop($('.glutton-stage', body));
  composeAvatars(body);   // arena is built outside route(); without this the fighters never reveal

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

  // Tap a status chip -> an anchored tooltip (like the Boneyard marker tip),
  // not a fleeting toast. Delegated so it survives updateBars rebuilds.
  const fchipTip = document.createElement('div');
  fchipTip.className = 'fchip-tip'; fchipTip.hidden = true;
  body.appendChild(fchipTip);
  const hideChipTip = () => { fchipTip.hidden = true; };
  function showChipTip(b) {
    const det = b.dataset.det || '';
    const ci = det.indexOf(':');
    const name = ci > 0 ? det.slice(0, ci) : det;
    const detail = ci > 0 ? det.slice(ci + 1).trim() : '';
    fchipTip.innerHTML = `<b>${esc(name)}</b>${detail ? `<span>${esc(detail)}</span>` : ''}`;
    fchipTip.hidden = false;
    const tw = fchipTip.offsetWidth, th = fchipTip.offsetHeight, m = b.getBoundingClientRect();
    let left = Math.max(8, Math.min(window.innerWidth - tw - 8, m.left + m.width / 2 - tw / 2));
    let top = m.top - th - 9;
    if (top < 8) top = m.bottom + 9;
    fchipTip.style.left = left + 'px'; fchipTip.style.top = top + 'px';
  }
  [el('youState'), el('foeState')].forEach(sp => sp && sp.addEventListener('click', (e) => {
    const b = e.target.closest('.fchip'); if (!b) return;
    e.stopPropagation();
    if (!fchipTip.hidden && fchipTip.dataset.for === b.dataset.det) { hideChipTip(); return; } // tap again to close
    fchipTip.dataset.for = b.dataset.det;
    showChipTip(b);
  }));
  body.addEventListener('click', (e) => { if (!e.target.closest('.fchip') && !e.target.closest('.fchip-tip')) hideChipTip(); });

  function positionFighters() {
    // the Glutton's stage is much wider than a normal fighter, so give both
    // sides more room to keep a real gap instead of crowding the middle.
    const big = foeCfg.mode === 'glutton';
    el('youG').style.left = big ? '0%' : '12%';
    el('foeG').style.right = big ? '0%' : '12%';
    el('rangePill').textContent = `Turn ${fight.turn}`;
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
      el('hudPet')?.classList.toggle('down', !!petBody.fainted);
    }
    if (add && el('addHp')) {
      el('addHp').style.width = Math.max(0, add.hp / add.d.maxHp * 100) + '%';
      const ag = el('addG'); if (ag) ag.classList.toggle('fainted', add.hp <= 0);
      el('hudAdd')?.classList.toggle('down', add.hp <= 0);
      // auto-retarget onto a living enemy, then highlight the current target
      if (fight.pTarget === 'fa' && add.hp <= 0) fight.pTarget = 'f';
      else if (fight.pTarget === 'f' && foe.hp <= 0 && add.hp > 0) fight.pTarget = 'fa';
      const eff = (add.hp > 0 && fight.pTarget === 'fa') ? 'fa' : 'f';
      // Only cue a target while there are actually two live enemies: once one is
      // down there is nothing to choose, so the reticle is pure noise.
      const choice = add.hp > 0 && foe.hp > 0;
      const fg = el('foeG');
      if (fg) { fg.dataset.tgt = String(foe.name || '').toUpperCase(); fg.classList.toggle('targeted', choice && eff === 'f'); }
      if (ag) { ag.dataset.tgt = String(add.name || '').toUpperCase(); ag.classList.toggle('targeted', choice && eff === 'fa'); }
    }
    el('youWind').style.width = (player.wind / player.d.maxWind * 100) + '%';
    el('foeWind').style.width = (foe.wind / foe.d.maxWind * 100) + '%';
    el('youHype').style.width = player.hype + '%';
    el('foeHype').style.width = foe.hype + '%';
    for (const [f, id] of [[player, 'youState'], [foe, 'foeState']]) {
      const chip = el(id);
      const list = fighterStatuses(f);
      if (list.length) {
        chip.hidden = false;
        chip.innerHTML = list.map(s => `<button type="button" class="fchip s-${s.k}" data-det="${esc(s.det)}"><span class="fi">${s.ic}</span>${s.n ? `<i>${esc(s.n)}</i>` : ''}</button>`).join('');
      } else { chip.hidden = true; chip.innerHTML = ''; }
    }
    // persistent class-identity auras on the fighter stages
    const youStg = el('youStage'), foeStg = el('foeStage');
    if (youStg) { youStg.classList.toggle('raging', !!player.rage); youStg.classList.toggle('has-minion', !!player.minion); youStg.classList.toggle('has-totem', !!player.totem); }
    if (foeStg) { foeStg.classList.toggle('raging', !!foe.rage); foeStg.classList.toggle('has-minion', !!foe.minion); foeStg.classList.toggle('has-totem', !!foe.totem); }
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
  // Counterstep jab: Cam's 3 fist frames revealed as a stacked anime flurry
  // (1-2-3, light->dark), aimed at the victim (mirrored when the victim is you).
  function jabFlurry(vic) {
    const arena = el('arena'); if (!arena) return;
    const wrap = document.createElement('div');
    wrap.className = 'jabfx' + (vic === 'p' ? ' mir' : '');
    wrap.innerHTML = "<img src='assets/bh/fx/jab/jab1.png' alt=''><img src='assets/bh/fx/jab/jab2.png' alt=''><img src='assets/bh/fx/jab/jab3.png' alt=''>";
    arena.appendChild(wrap);
    const L = [...wrap.querySelectorAll('img')];
    const pop = e => { e.style.opacity = '1'; e.style.animation = 'none'; void e.offsetWidth; e.style.animation = 'jabpop .16s ease-out'; };
    const s = fast ? 0.25 : 1;
    pop(L[0]);
    setTimeout(() => pop(L[1]), 80 * s);
    setTimeout(() => pop(L[2]), 160 * s);
    setTimeout(() => { wrap.style.transition = 'opacity .16s'; wrap.style.opacity = '0'; }, 520 * s);
    setTimeout(() => wrap.remove(), 780 * s);
  }

  // Basic-move FX (v245): Cam's jab and swing frames. Unlike the Counterstep
  // flurry above, these three frames are CUMULATIVE snapshots of one motion (frame
  // 2 contains frame 1, frame 3 contains frame 2 plus the impact burst), measured
  // at 100% pixel containment. So they play as a REPLACE, one visible at a time.
  // Stacking them the way jabFlurry stacks its separate pieces would draw six
  // fists at once.
  const STRIKE_FX = {
    jab:   { dir: 'assets/bh/fx/jab/basic',   step: 60, hold: 150, cls: 'sfx-jab' },
    swing: { dir: 'assets/bh/fx/swing/swing', step: 75, hold: 190, cls: 'sfx-swing' },
  };
  // Cam's frames are 110KB to 136KB each and the whole animation lives about
  // 350ms. On a cold cache that means the element is created, played and removed
  // before one pixel decodes, so the punch is simply invisible: exactly what Tom
  // saw on the first fight after updating to v245. Warm them when the fight
  // opens, long before anyone can tap JAB, and hold the references so they are
  // not collected. Cheap: six images, once per fight, straight from cache after.
  const strikeFxWarm = [];
  function warmStrikeFx() {
    if (strikeFxWarm.length) return;
    for (const cfg of Object.values(STRIKE_FX)) {
      for (let i = 1; i <= 3; i++) { const im = new Image(); im.src = `${cfg.dir}${i}.png`; strikeFxWarm.push(im); }
    }
  }
  function strikeFx(vic, move) {
    const cfg = STRIKE_FX[move];
    const arena = el('arena');
    if (!cfg || !arena) return;
    const wrap = document.createElement('div');
    wrap.className = `strikefx ${cfg.cls}`;
    wrap.innerHTML = [1, 2, 3].map(i => `<img src="${cfg.dir}${i}.png" alt="">`).join('');
    arena.appendChild(wrap);
    const L = [...wrap.querySelectorAll('img')];

    // Anchor to the VICTIM, not the arena. Measured off Cam's comps: the FX's
    // vertical centre sits 35% down the victim's body and its leading edge lands
    // 75% into them, which is what makes the punch connect with the skull instead
    // of sailing over it. Percentages of the arena cannot express that: the arena
    // is much wider and taller than a fighter, so the same numbers drift.
    const vicStage = vic === 'p' ? el('youStage') : (vic === 'fa' && el('addStage')) || el('foeStage');
    const ar = arena.getBoundingClientRect();
    const vr = (vicStage || arena).getBoundingClientRect();
    const toRight = vic !== 'p';                       // a foe victim is struck left-to-right
    const cy = (vr.top - ar.top) + vr.height * 0.35;
    const lead = (vr.left - ar.left) + vr.width * (toRight ? 0.75 : 0.25);
    for (const im of L) {
      const w = im.offsetWidth || parseFloat(getComputedStyle(im).width) || 0;
      im.style.left = `${Math.round(toRight ? lead - w / 2 : lead + w / 2)}px`;
      im.style.top = `${Math.round(cy)}px`;
      im.style.transform = `translate(-50%, -50%)${toRight ? '' : ' scaleX(-1)'}`;
    }
    const s = fast ? 0.25 : 1;
    const show = i => L.forEach((im, k) => { im.style.opacity = k === i ? '1' : '0'; });
    const run = () => {
      show(0);
      setTimeout(() => show(1), cfg.step * s);
      setTimeout(() => show(2), cfg.step * 2 * s);
      // hold the impact frame, then fade the whole thing out
      setTimeout(() => { wrap.style.transition = `opacity ${140 * s}ms`; wrap.style.opacity = '0'; },
        (cfg.step * 2 + cfg.hold) * s);
      setTimeout(() => wrap.remove(), (cfg.step * 2 + cfg.hold + 200) * s);
    };
    // Never play over undecoded images. warmStrikeFx() means this is normally
    // already true; the wait is the safety net for a first fight on a slow
    // connection, and it degrades to a slightly late punch rather than no punch.
    if (L[0].complete && L[0].naturalWidth) run();
    else {
      let started = false;
      const go = () => { if (!started) { started = true; run(); } };
      L[0].addEventListener('load', go, { once: true });
      L[0].addEventListener('error', go, { once: true });
      setTimeout(go, 400);
    }
  }
  // The mirrored branch (a foe striking YOU) is otherwise unreachable in a test:
  // rung 1 dies before it gets a turn. Same webdriver-only hook the map uses.
  if (navigator.webdriver) window.__strikeFx = strikeFx;

  // Heckle rattle: Cam's two skulls jeer AT THE RATTLED FIGHTER, one over each
  // shoulder of their head, yapping in alternation (frame swap) then fading.
  function heckleTaunt(vic) {
    const arena = el('arena'); if (!arena) return;
    const stage = el(vic === 'p' ? 'youStage' : 'foeStage') || el('foeStage'); if (!stage) return;
    const ar = arena.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    if (!sr.width) return;
    const cx = (sr.left - ar.left) + sr.width / 2;
    const headY = (sr.top - ar.top) + sr.height * 0.12;   // near the top of the fighter (head)
    const sz = Math.round(Math.max(42, sr.width * 0.52));
    const st = document.createElement('div'); st.className = 'heckfx';
    st.innerHTML = "<div class='hsk hdark'></div><div class='hsk hbone'></div>";
    arena.appendChild(st);
    const d = st.querySelector('.hdark'), b = st.querySelector('.hbone');
    const place = (elm, centerX) => { elm.style.width = elm.style.height = sz + 'px'; elm.style.left = Math.round(centerX - sz / 2) + 'px'; elm.style.top = Math.round(headY - sz / 2) + 'px'; };
    place(d, cx - sr.width * 0.46);   // left shoulder
    place(b, cx + sr.width * 0.46);   // right shoulder
    const D = ['assets/bh/fx/heckle/dark1.png', 'assets/bh/fx/heckle/dark2.png'];
    const B = ['assets/bh/fx/heckle/bone1.png', 'assets/bh/fx/heckle/bone2.png'];
    let i = 0; const set = () => { d.style.backgroundImage = `url(${D[i]})`; b.style.backgroundImage = `url(${B[i]})`; };
    set();
    const iv = setInterval(() => { i ^= 1; set(); }, fast ? 130 : 320);
    const life = fast ? 280 : 1500;
    setTimeout(() => { st.style.transition = 'opacity .2s'; st.style.opacity = '0'; }, life);
    setTimeout(() => { clearInterval(iv); st.remove(); }, life + 260);
  }

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
          haptic.heavy();
          floatNode(`-${ev.damage}`, vicSide, 'dmg ' + (school === 'phys' ? 'magic' : school));
          if (ev.crit) { floatNode('CRIT!', vicSide, 'stamp hot'); }
          hitSound(S.sounds, 'zap');
        }, fast ? 30 : fxMs * 0.6);
        return;
      }
      const heavy = ev.move === 'haymaker' || ev.move === 'titan' || ev.signature;
      const strike = () => {
        pulse(atkStage, heavy ? lungeCls + ' big' : lungeCls, fxMs + 120);
        // Cam's frames travel toward the victim as the lunge starts, so the burst
        // frame lands with the hurt pulse rather than trailing after it.
        strikeFx(vicSide, ev.move);
        setTimeout(() => {
          pulse(vicStage, 'hurt', fxMs + 150);
          impactBurst(vicSide, 'phys', heavy);
          if (heavy) pulse(el('arena'), 'quake', fxMs + 160);
          haptic.heavy();
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
      el('hudPet')?.classList.add('down');
      floatNode('🐾 DOWN', 'p', 'stamp dim');
      hitSound(S.sounds, 'thud');
    } else if (ev.t === 'aoe') {
      const arena = $('#arena');
      if (arena) {
        pulse(arena, 'quake', fxMs + 200);
        const flash = document.createElement('div'); flash.className = 'aoe-flash';
        arena.appendChild(flash); setTimeout(() => flash.remove(), 460);
      }
      pulse(el('foeStage'), 'lunge-l', fxMs);
      if (ev.dmgYou > 0) floatNode(`-${ev.dmgYou}`, 'p', 'dmg');
      const petStage = el('petStage');
      if (petStage && ev.dmgPet > 0) { setTimeout(() => { pulse(petStage, 'hurt', fxMs); floatNode(`🐾 -${ev.dmgPet}`, 'p', 'dmg bleed'); }, 120); }
      floatNode('SWEEP!', 'f', 'stamp hot');
      hitSound(S.sounds, 'thud');
    } else if (ev.t === 'counter') {
      const vs = ev.who === 'p' ? 'f' : 'p';
      pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), ev.who === 'p' ? 'lunge-r' : 'lunge-l', fxMs);
      jabFlurry(vs); // Counterstep's counter-jab: Cam's 3-fist anime flurry, aimed at the victim
      floatNode('COUNTER!', vs, 'stamp hot');
      const s = fast ? 0.25 : 1;
      setTimeout(() => { floatNode(`-${ev.damage}`, vs, 'dmg'); hitSound(S.sounds, 'tick'); }, 170 * s);
    } else if (ev.t === 'heal' || ev.t === 'secondwind') {
      floatNode(`+${ev.amount || ev.heal}`, ev.who, 'dmg heal');
      pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), 'mendfx', fxMs + 250);
    } else if (ev.t === 'status') {
      if (ev.kind === 'weaken' && ev.heckle) heckleTaunt(ev.who); // Heckle rattle: two skulls jeer at the victim
      const label = { sunder: 'SUNDERED', bleed: 'BLEEDING', hex: 'HEXED', weaken: 'WEAKENED', chill: 'CHILLED', burn: 'BURNING', ward: 'WARDED', blind: 'BLINDED', guard: 'GUARD UP', rage: 'RAGE!' }[ev.kind] || '';
      floatNode(label, ev.who, ev.kind === 'burn' ? 'stamp fire' : ev.kind === 'rage' ? 'stamp rage' : (ev.kind === 'ward' || ev.kind === 'guard') ? 'stamp holy' : ev.kind === 'guard' ? 'stamp cool' : 'stamp hex');
      if (ev.kind === 'hex' || ev.kind === 'weaken' || ev.kind === 'chill' || ev.kind === 'blind') pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), 'hexfx', fxMs + 250);
      if (ev.kind === 'ward' || ev.kind === 'guard') pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), ev.kind === 'guard' ? 'guard' : 'wardfx', fxMs + 300);
      if (ev.kind === 'rage') { pulse(ev.who === 'p' ? el('youStage') : el('foeStage'), 'ragefx', fxMs + 400); impactBurst(ev.who, 'rage', true); hitSound(S.sounds, 'thud'); }
      if (ev.kind === 'burn') impactBurst(ev.who, 'fire');
      if (ev.kind === 'blind') impactBurst(ev.who, 'phys');
    } else if (ev.t === 'bleedtick') {
      floatNode(`-${ev.damage}`, ev.who, 'dmg bleed');
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
      return `${who} ${ev.signature ? 'UNLEASHED THE SIGNATURE on' : `landed a ${ACTIONS[ev.move].label.toLowerCase()} on`} ${them} for ${ev.damage}`;
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
        <b>${a.label}</b><small>${hint || `<span class="ap-pips">${'<i></i>'.repeat(a.ap)}</span>${a.windCost ? ' ' + a.windCost + 'w' : ''}`}</small>
      </button>` : '';
    const dmgHint = id => {
      const est = expectedDamage(id, player, null, foe);
      const mc = MISS_CHANCE[id];
      return `~${est} dmg · ${mc ? Math.round((1 - mc) * 100) + '% hit' : `<span class="ap-pips">${'<i></i>'.repeat(ACTIONS[id].ap)}</span>`}`;
    };
    const guardAmt = Math.round(16 + player.stats.marrow * 0.15);
    // THE defensive move (Rattle retired): shield + stamina, heckle adds a weaken
    const defenseRow = () => {
      const g = get('guard');
      if (!g) return '';
      const hint = `shield ~${guardAmt} · +stamina${player.talents.has('heckle') ? ' · weakens' : ''}`;
      return btn(g, { hint, glow: player.hp < player.d.maxHp * 0.4 || player.wind < 20 });
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
    let coins = 0, xp = 0, extras = [], extraCards = [], bossLoot = null;
    // item rewards render as pack cards (extras keeps coin-modifier notes only)
    const crateCard = kind => ({ iconHtml: crateIcon(kind, 120), name: CRATES[kind].label, rarity: kind === 'daily' ? 'uncommon' : 'rare', kind: 'CRATE', stats: kind === 'egg' ? 'Incubates · walk to hatch it' : 'Open it in your Backpack' });
    if (foeCfg.mode === 'friend') {
      // battle a friend's AI bonehead: pays once per friend per day (win > loss),
      // never counts as a Pit win, feeds the friend quests
      const r = await claimFriendBattle(foeCfg.friendId, won);
      xp = r.xp; coins = r.coins; foeCfg._friendFirst = r.firstToday;
      trackEvent('friend_battle', { won });
      if (coins) await coinsAdd(coins);
      if (won) {
        confettiRain(90); levelSound(S.sounds);
        const badges = await evaluateBadges();
        if (badges.length) queueCelebration({ newBadges: badges });
      }
    } else if (won) {
      await award(`fight-${Date.now().toString(36)}`, 'fight', 10, 'Pit win');
      trackEvent(foeCfg.mode === 'boss' ? 'boss_win' : foeCfg.mode === 'mini' ? 'mini_win' : 'pit_win', { mode: foeCfg.mode });
      xp += 10;
      if (foeCfg.mode === 'spar') { coins = 15; }
      else if (foeCfg.mode === 'boss') {
        const r = await claimDenWin(foeCfg.den);
        if (r) {
          xp += r.xp || 0;
          coins = r.coins || 0;
          if (r.crate) extraCards.push(crateCard(r.crate));
          if (r.gearChoices) bossLoot = { key: denKey(dateKey(), foeCfg.den), den: foeCfg.den.name, choices: r.gearChoices };
          // landmark world bosses are the other source of the RARE cooking
          // ingredient; roaming dens don't drop it (they stay a lighter reward).
          if (!foeCfg.den.roaming) {
            const eN = foeCfg.add ? 2 : 1;
            await grantIngredient(RARE_INGREDIENT, eN);
            extraCards.push({ iconHtml: ingIconHtml(RARE_INGREDIENT, 120), name: `Ectoplasm${eN > 1 ? ' x' + eN : ''}`, rarity: 'rare', kind: 'INGREDIENT', stats: 'Rare cooking ingredient' });
          }
        } else coins = 10; // den already cracked this week: pocket change
      }
      else if (foeCfg.mode === 'mini') {
        const r = await claimMiniWin(foeCfg.mini, foeCfg.date);
        if (r) {
          xp += r.xp || 0; coins = r.coins || 0;
          if (r.crate) extraCards.push(crateCard(r.crate));
          if (r.dust) extraCards.push({ iconHtml: `<span class="dust-ico">${ICONS.dust(112)}</span>`, name: `${r.dust} Bone Dust`, rarity: 'common', kind: 'MATERIAL', stats: 'Spend it at the Salvage Bench' });
        } else coins = 8; // already beaten today
      }
      else if (foeCfg.mode === 'secret') {
        // easter-egg boss: the first win (at ANY of its buried spots) pays the
        // full prize + unlocks the hidden badge via evaluateBadges below.
        const g = await award(`secret-${foeCfg.bossId}`, 'secret', 150, `Found ${foeCfg.name}`);
        trackEvent('secret_boss_win', { id: foeCfg.bossId, first: !!g });
        if (g) {
          xp += g; coins = 400;
          await grantCrate('golden', `secret-${foeCfg.bossId}`);
          extraCards.push(crateCard('golden'));
        } else coins = 25; // rematch: pocket change, no re-farm
      }
      else if (foeCfg.mode === 'glutton') {
        // one-time world-boss spectacle, same idempotent shape as a secret boss.
        // Twice-daily event: pays once per appearance, so the reward is sized
        // like a den clear (not the old one-off jackpot) to keep the economy sane.
        // the appearance carried in from the encounter; falling back to the live
        // window filed a win under slot 0 whenever the window closed mid-fight,
        // which is one of the ways he read as unbeaten afterwards
        const slot = foeCfg.gluttonSlot != null ? foeCfg.gluttonSlot : gluttonSlotNow();
        const r = await claimGluttonWin(dateKey(), slot);
        trackEvent('glutton_win', { first: !!r, slimed: !!r?.gear?.slimed });
        if (r) {
          xp += r.xp; coins = r.coins;
          if (r.gear) {
            // Show the ACTUAL piece, the way every other gear reward card does
            // (imgSrc -> the artId's real art). This drew a generic tombstone
            // icon instead, so beating the Glutton revealed a card that looked
            // nothing like the gear it had just given you.
            const gArt = GEAR_BY_ID[r.gear.id] && BH_BY_ID[GEAR_BY_ID[r.gear.id].artId];
            extraCards.push({
              ...(gArt ? { imgSrc: bhAsset(gArt) } : { iconHtml: bhIcon('tombstone', 96) }),
              slimed: !!r.gear.slimed,
              name: r.gear.name, rarity: r.gear.rarity, kind: r.gear.slimed ? 'SLIMED GEAR' : 'GEAR',
              stats: r.gear.slimed ? 'Dripping with Glutton slime. Equip it in your Wardrobe.' : 'Equip it in your Wardrobe.',
            });
          }
        } else coins = 25; // already cleared this window: pocket change, no re-farm
        // Tell the map he is DOWN on every win, not just the first claim. Firing
        // only inside `if (r)` meant a repeat win left the marker and the Face
        // The Glutton button on screen, so he read as farmable: and he was, since
        // a glutton fight costs no Pit energy while every win still mints a
        // uniquely-keyed `fight` row (+10 XP and quest credit).
        dispatchEvent(new CustomEvent('bh-glutton-beaten', { detail: { key: gluttonKey(dateKey(), slot) } }));
      }
      else if (foeCfg.mode === 'spire' && foeCfg.siege) {
        // A repelled siege: the server clears it and levels the tower, and we mirror
        // that. Deliberately pays less than a takeover: keeping what you have should
        // not out-earn going and taking something new.
        coins = 50;
        // a uniquely-keyed ledger row, so the Siegebreaker badge has something to
        // count and a repeated settle can never double-count it
        await award(`siege-${foeCfg.spire.id}-${Date.now().toString(36)}`, 'siege', 12, `Broke the siege at ${foeCfg.spire.name}`);
        const res = await social.defendSpireRemote(foeCfg.spire.id).catch(() => ({ ok: false, reason: 'offline' }));
        await breakSiege(foeCfg.spire.id);
        if (res && res.ok && res.level) await setSpireLevel(foeCfg.spire.id, res.level);
        await cancelSiegeReminder();
        const lv = (res && res.level) || (foeCfg.spire.level || 1) + 1;
        extraCards.push({ iconHtml: `<img src="assets/brand/tomb.png" style="width:110px;height:110px;object-fit:contain">`,
          name: foeCfg.spire.name, rarity: 'epic', kind: `SIEGE BROKEN · LV ${lv}`,
          stats: `${esc(foeCfg.name)} is scattered. The tower is level ${lv} now and pays more tribute for it.` });
        dispatchEvent(new CustomEvent('bh-spire-claimed', { detail: { id: foeCfg.spire.id } }));
      }
      else if (foeCfg.mode === 'spire') {
        // Taking a tower: the claim itself is the prize, so the payout is modest
        // and the tribute stream does the real earning. Re-taking a dormant spire
        // pays the same, because walking back out there deserves the same.
        // REMOTE FIRST. This used to write the local record before asking the
        // server, so a refused claim (cap, or now a shield) left the client
        // believing it owned a tower until the next 60s poll corrected it.
        // Offline is the one case we still trust locally: that is the fail-soft
        // rule the whole social layer is built on.
        const remote = await social.claimSpireRemote(foeCfg.spire).catch(() => ({ ok: false, reason: 'offline' }));
        const refused = remote && remote.ok === false && remote.reason !== 'offline';
        const r = refused ? { ok: false, reason: remote.reason } : await claimSpire(foeCfg.spire);
        if (refused && remote.reason === 'shielded') {
          coins = 40;
          const mins = Math.max(1, Math.ceil(((remote.until || 0) - Date.now()) / 60000));
          toast(`That tower was just taken. Its walls hold for another ${mins} min: come back and it is yours.`, 4600);
        } else if (refused) {
          coins = 40;
          toast(`You already hold ${SPIRE_CAP} spires. Let one go dormant to take another.`, 4200);
        } else if (r.ok) {
          coins = 80;
          // the server owns the level; mirror what it just told us
          if (remote && remote.ok && remote.level) await setSpireLevel(foeCfg.spire.id, remote.level);
          const lvl = (remote && remote.level) || r.level || 1;
          extraCards.push({ iconHtml: `<img src="assets/brand/tomb.png" style="width:110px;height:110px;object-fit:contain">`,
            name: foeCfg.spire.name, rarity: 'epic', kind: lvl > 1 ? `DARK SPIRE · LV ${lvl}` : 'DARK SPIRE',
            stats: remote && remote.tookFrom
              ? `Taken from ${remote.tookFrom}. It flies your name now: come back to collect tribute and keep it standing.`
              : `It flies your name now. Come back to collect tribute and keep it standing.` });
          dispatchEvent(new CustomEvent('bh-spire-claimed', { detail: { id: foeCfg.spire.id } }));
        } else {
          coins = 40;
          toast(`You hold ${SPIRE_CAP} spires already. Let one go dormant to take another.`, 4000);
        }
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
            extraCards.push(
              { iconHtml: '<img src="assets/brand/sword.png" style="width:118px;height:118px;object-fit:contain">', name: 'The Bonecrusher', rarity: 'legendary', kind: 'WEAPON', stats: 'Champion weapon · equip it in Build' },
              crateCard('golden'));
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
    /* Spend the day's attempt on this tower, whatever the outcome. Outside the
       win/lose branches on purpose: a loss and a draw have to consume it too, or
       you simply rerun the fight until you win. Sieges are exempt (defending what
       you own is not farmable), and so is a fight the claim actually stuck for,
       because holding it changes the button anyway. */
    if (foeCfg.mode === 'spire' && !foeCfg.siege && foeCfg.spire) {
      await award(spireKey(foeCfg.spire.id, dateKey()), 'spiretry', 0, `Fought for ${foeCfg.spire.name}`);
      dispatchEvent(new CustomEvent('bh-spire-tried', { detail: { id: foeCfg.spire.id } }));
    }
    // the fight is decided, so the escape hatch stops making sense
    const fleeBtn = $('.sheet-head .sheet-close', wrap);
    if (fleeBtn && /flee/i.test(fleeBtn.textContent || '')) fleeBtn.hidden = true;
    const title = won ? 'VICTORY' : fight.over.winner === 'draw' ? 'DOUBLE KO' : 'DOWN, NOT OUT';
    const friendRepeat = foeCfg.mode === 'friend' && !foeCfg._friendFirst;
    const rewardHtml = friendRepeat
      ? `<p class="note" style="margin:8px 0 16px">${won ? 'Nice win!' : 'Good scrap.'} You already claimed today's reward against ${esc(foeCfg.name)}. Battle a different friend for more coins + XP.</p>`
      : won
      ? `<div class="reward-row">
           <span class="reward-pill">${ICONS.coin(15)} +${coins}</span>
           ${xp ? `<span class="reward-pill">${ICONS.star(14)} +${xp} XP</span>` : ''}
           ${extras.map(e => `<span class="reward-pill">${esc(e)}</span>`).join('')}
         </div>
         ${extraCards.length ? (bossLoot
            /* a gear choice is pending, so the automatic loot is NEWS, not a
               decision: rows, so it cannot out-shout the thing needing a tap. */
            ? `<div class="got-rows">${extraCards.map(c => {
                 const r = RARITIES[c.rarity] || RARITIES.common;
                 return `<div class="got-row"><span class="got-ic">${c.iconHtml || ''}</span><b>${esc(c.name)}</b><span class="got-rar r-${c.rarity}">${r.label}</span></div>`;
               }).join('')}</div>`
            : `<div class="loot-cards settle-cards${extraCards.length === 1 ? ' one' : ''}">${extraCards.map(c => packCardHtml(c)).join('')}</div>`) : ''}`
      : `<p class="note" style="margin:8px 0 16px">${esc(fight.over.winner === 'draw' ? 'Both of you collapse. Call it cardio.' : `+${coins} consolation coins. Your bones keep every stat: eat well, walk far, run it back.`)}</p>`;
    setTimeout(() => {
      body.insertAdjacentHTML('beforeend', `
        <div class="fight-over">
          <div class="cele-big" style="color:${won ? 'var(--accent)' : 'var(--text-2)'}">${title}</div>
          ${bossLoot ? `
          <div class="loot-choice">
            <div class="choice-h"><i></i><b>Choose one to keep</b><i></i></div>
            <p class="note" style="text-align:center;margin:2px 0 6px">Two pieces dropped. Tap to compare; the one you leave behind is gone.</p>
            <div class="loot-cards">
              ${bossLoot.choices.map(g => lootCardHtml(g)).join('')}
            </div>
            <button class="btn loot-keep" disabled>Tap a piece to choose</button>
          </div>` : ''}
          ${rewardHtml}

          <div style="height:12px"></div>
          <button class="btn ${bossLoot ? 'ghost' : ''}" id="fightDone">${bossLoot ? 'Skip the pick · back to the map' : foeCfg.mode === 'glutton' ? 'Done' : fromMap ? 'Back to the Boneyard' : 'Back to The Pit'}</button>
        </div>`);
      const overEl = $('.fight-over', body);
      // Any pack card with imgSrc renders an EMPTY <canvas> until hydratePackArt
      // fills it. openPackReveal and wireLootChoice both call it; the plain reward
      // cards here never did, so every gear reward on this screen showed its name
      // and rarity over a blank art panel. Hydrating the whole block covers the
      // reward cards AND anything added to it later.
      if (overEl) hydratePackArt(overEl);
      if (overEl) requestAnimationFrame(() => overEl.scrollIntoView({ behavior: 'smooth', block: bossLoot ? 'start' : 'nearest' }));
      if (bossLoot) {
        wireLootChoice($('.loot-choice', body), gid => claimDenLoot(bossLoot.key, gid), picked => {
          toast(`${picked.name} claimed. Equip it in your Wardrobe.`, 3200);
          const fd = $('#fightDone', body); if (fd) fd.textContent = 'Back to the map';
        });
      }
      $('#fightDone', body).addEventListener('click', () => {
        // Glutton win: pop BOTH the fight sheet AND the (now stale) glutton
        // sheet so you land back on the map with him gone, never on a re-fight
        // prompt. A loss just backs out one level so you can try again.
        if (foeCfg.mode === 'glutton' && won) { history.go(-2); maybeCelebrate(); return; }
        history.back(); if (!fromMap && foeCfg.mode !== 'friend') setTimeout(() => renderPit(pitWrap), 250); maybeCelebrate();
      });
    }, fast ? 80 : 750);
  }

  warmStrikeFx();   // fetch Cam's jab/swing frames now, not on the first punch

  /* Test-only fight control (webdriver, so never a real player or a ?demo
     screen-share). Playing a fight out by script is slow and can simply fail to
     end: a ladder check once ran 140 turns without finishing because the pet kept
     healing while the foe kept guarding. Everything behind a win (reward cards,
     KO choreography, level-up, the ladder marking a rung beaten) was effectively
     unverifiable, so it went unverified.
     This does NOT fake the result. It puts a body one hit from death and then
     takes a REAL action, so the engine's own damage, checkOver and settle() run.
     What the test sees is what a player sees. */
  if (navigator.webdriver) {
    window.__bhFight = {
      state: () => ({
        turn: fight.turn, active: fight.active, over: fight.over,
        you: fight.p.hp, pet: fight.pAux ? fight.pAux.hp : null,
        foe: fight.f.hp, add: fight.fAux ? fight.fAux.hp : null,
      }),
      // finish('p') wins, finish('f') loses. Resolves through the real path or
      // reports false; it never claims an outcome it did not reach.
      finish: async (winner = 'p') => {
        for (let i = 0; i < 12 && !fight.over; i++) {
          if (winner === 'p') {
            fight.f.hp = 1; fight.f.ward = 0;
            if (fight.fAux) { fight.fAux.hp = 1; fight.fAux.ward = 0; }
            if (fight.active === 'p' && !petPhase) playerAct('jab');   // a real swing, so it can still whiff
            else doEndTurn();
          } else {
            fight.p.hp = 1; fight.p.ward = 0;
            if (fight.pAux) { fight.pAux.hp = 0; }
            doEndTurn();                                               // let the foe land the real killing blow
          }
          await new Promise(r => setTimeout(r, 260));
        }
        return fight.over || false;
      },
    };
  }
  refreshAll('Round one. Your turn.');
}

/* ================= talents ================= */

// The Bone Merchant reads your build and recommends an archetype of weapon.
/* The Build tab FAQ. Tom's brief: the playerbase is a mix of gamers and
 * non-gamers, so hold hands where needed without dumbing it down.
 *
 * Two layers, in this order:
 *   1. PLAYSTYLES. Plain language, no jargon, no numbers. "I want to hit hard" ->
 *      here is where your points go. A non-gamer should be able to act on this
 *      without knowing what a stat is.
 *   2. THE DETAIL, folded away. Per-stat mechanics straight out of STAT_META (so
 *      this card can never drift from what the engine actually does) plus the real
 *      numbers a gamer wants.
 *
 * The most important line for a non-gamer is the last one: you can ignore all of
 * this and still play. An RPG system nobody understands must not read as homework.
 */
const BUILD_PLAYSTYLES = [
  { ico: '🦴', name: 'I want to hit hard',
    put: ['power', 'marrow'],
    plain: 'Big damage, and enough HP to stay standing while you swing. The simplest way to play and it never stops working.' },
  { ico: '🛡', name: 'I want to survive anything',
    put: ['marrow', 'reflex'],
    plain: 'More HP and better armor. Fights take longer, but you win the ones other builds lose. Good if you would rather not think mid-fight.' },
  { ico: '⚡', name: 'I want to move fast',
    put: ['wind', 'reflex'],
    plain: 'More moves per turn and more lucky big hits. The most active way to play, because you always have fuel to do something.' },
  { ico: '☠', name: 'I want to cast spells',
    put: ['hype', 'wind'],
    plain: 'Bolts, heals and a Signature move that charges quickly. Needs Stamina to keep casting, so take both.' },
];

function buildFaqHtml(fighter, openAttr = '') {
  const nm = k => (STAT_META.find(m => m.key === k) || {}).label || k;
  return `<details class="bsect faq-card" data-bsect="faq" ${openAttr}>
    <summary class="t3-faq">How do I build my fighter?<b>Start here ›</b></summary>
    <div class="bsect-body">
      <p class="note" style="margin:2px 2px 12px">Your stats grow on their own from your real habits. <b>Training points are extra</b>, on top of that, and they are yours to place. There is no wrong answer and <b>nothing is permanent</b>: Reset training below refunds every point, any time.</p>

      <div class="sect-h">Pick how you want to fight</div>
      ${BUILD_PLAYSTYLES.map(p => `<div class="faq-style">
        <span class="faq-ico">${p.ico}</span>
        <div>
          <b>${esc(p.name)}</b>
          <small>${esc(p.plain)}</small>
          <small class="faq-put">Put your points in <b>${p.put.map(nm).join('</b> and <b>')}</b></small>
        </div>
      </div>`).join('')}

      <details class="faq-deep">
        <summary>What each stat actually does</summary>
        ${STAT_META.map(m => `<div class="faq-stat">
          <b>${esc(m.label)}</b>
          <small>${esc(m.combat)}</small>
          <small class="faq-put">Suits: ${esc(m.spec)} · grows from ${esc(m.fedBy)}</small>
        </div>`).join('')}
        <p class="note" style="margin:8px 2px 2px">Each training point adds <b>+${TRAIN_STEP}</b> to a stat, up to <b>+${TRAIN_CAP}</b> in any one of them. Points come from hitting your protein target, closing a day on budget, and every 25,000 steps you walk, so the build grows out of the habits, not out of grinding.</p>
      </details>

      <details class="faq-deep">
        <summary>Common questions</summary>
        <div class="faq-qa"><b>Can I change my mind?</b><small>Yes, always. <b>Reset training</b> below hands back every point you have spent so you can place them again. It asks before it does it.</small></div>
        <div class="faq-qa"><b>Do I need to do any of this?</b><small><b>No.</b> Leave every point unspent and the game plays perfectly well. Your habits already raise your stats, and Pit foes scale to you, so you are never locked out of anything. This is here for people who enjoy tinkering.</small></div>
        <div class="faq-qa"><b>Should I spread points around or stack one?</b><small>Stacking one or two is stronger than spreading five thin, because each stat only helps the things it is attached to. Two is the sweet spot.</small></div>
        <div class="faq-qa"><b>Do stats matter more than gear?</b><small>Neither wins on its own. Gear adds the same kinds of points, so a good piece can cover a stat you skipped. Check what you are wearing before you respec.</small></div>
        <div class="faq-qa"><b>What is Armor?</b><small>Damage reduction. <b>${nm('marrow')}</b> gives armor against melee, <b>${nm('reflex')}</b> against magic, and worn gear adds to both. You can see both percentages just below.</small></div>
        <div class="faq-qa"><b>Which weapon should I buy?</b><small>The one that matches the stat you are stacking. Every weapon in the <b>Bone Merchant</b> prints what it rewards, so a Power build wants a Power weapon and a ${nm('hype')} build wants a caster one. A mismatch is not wasted, it just does less for you. The plain <b>Taped Pipe</b> has no bonus and no penalty, so it is never a wrong answer.</small></div>
        <div class="faq-qa"><b>What are talents, then?</b><small>A separate pool, one per level, spent on the trees further down this tab. Stats decide how hard you hit; talents decide what moves you get.</small></div>
      </details>
    </div>
  </details>`;
}

/* Swap the wardrobe's Bonehead and its selection ring without re-rendering the
 * screen. Returns false if the DOM is not what we expect, so the caller can fall
 * back to a full render rather than silently leaving a stale character on screen.
 *
 * The new garment is DECODED BEFORE the swap. Without that the fresh <img> paints
 * empty for a frame, which is the same class of bug as the invisible punch: a
 * layer stack is only ever meaningful complete. */
async function restageWardrobe(content, slot) {
  const stage = $('.bh-stage.lg', content);
  if (!stage) return false;
  const eqNow = await equipped();
  const html = (eqNow.BG && BH_BY_ID[eqNow.BG] ? `<img class="bh-backdrop" src="${bhAsset(BH_BY_ID[eqNow.BG])}" alt="">` : '')
    + avatarLayersHtml(eqNow, { noYard: true, skip: ['C', 'BG'] });
  // preload every layer, capped, so the swap lands on decoded art
  const srcs = [...html.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
  await Promise.race([
    Promise.all(srcs.map(src => new Promise(res => {
      const im = new Image();
      im.onload = im.onerror = res;
      im.src = src;
    }))),
    new Promise(res => setTimeout(res, 450)),
  ]);
  const curtains = $$('.curt', stage).map(c => c.outerHTML).join('');
  stage.innerHTML = html + curtains;
  // NOT composeAvatars(): that hides the stack until it decodes, and we just
  // decoded it. Calling it here would reintroduce the very flash this removes.
  // move the ring inside THIS slot's grid only: every slot renders its own grid, so
  // a global toggle would light up the wrong cells in every other section
  const grid = $(`.ward-grid[data-wslot="${slot}"]`, content);
  if (!grid) return false;
  const wanted = eqNow[slot] || '';
  for (const c of $$('[data-equip]', grid)) {
    c.classList.toggle('equipped', (c.dataset.equip || '') === wanted);
  }
  return true;
}

/* The charge that runs a top-tier weapon in the Wardrobe.
 *
 * WHY IT IS MASKED BY THE ART ITSELF. The sheen element wears the weapon's own PNG
 * as its mask, so the light can only ever fall inside Cam's silhouette. A free
 * gradient over the stage would spill onto the Bonehead and the backdrop, and
 * "never degrade Cam's art" is a rule worth enforcing structurally instead of by
 * eye. mask-size must be `cover` because .bh-stage img is object-fit: cover; any
 * other value slides the mask out of register with the layer underneath.
 *
 * Colours are sampled FROM the artwork (cyan #92F5FF from the hilt wrap and the
 * charm's iris, cream #FFF5D6 from the blade edge), not invented.
 *
 * EVERY SURFACE, and only for epic/legendary main-hands. It shipped Wardrobe-only
 * on the theory that the arena and the map carry their own motion; that was wrong
 * in the way cosmetics are always wrong when they are scoped, because a charge
 * that runs on your character in one room and not the next reads as a bug rather
 * than as restraint. Rarity is the scarcity control, not screen count. Honors the
 * Gear glow setting, so a player who turned the halo off does not get a light show.
 *
 * `skip` is the caller's slot skip-list: if a surface is not drawing the main hand
 * then there is no artwork to light, and a sheen masked to an absent layer would
 * be a rectangle of light over the character. */
function weaponSheenHtml(eq, skip) {
  if (!S.glow) return '';
  if (skip && skip.has && skip.has('IR')) return '';
  const w = eq && eq.IR && BH_BY_ID[eq.IR];
  if (!w || (w.rarity !== 'epic' && w.rarity !== 'legendary' && w.rarity !== 'prestige')) return '';
  return `<span class="wpn-sheen r-${w.rarity}" style="--wpn:url('${bhAsset(w)}')" aria-hidden="true"></span>`;
}

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
    <div class="sheet-body" id="talBody"></div>`, { cls: 'full', onClose: () => { if (pitWrap) renderPit(pitWrap); else if (currentTab() === 'today') refresh(); } });
  renderTalents(wrap);
}

// Bar colour per stat, so the five allocators read apart at a glance (the
// mockup's palette). Lives here, not in STAT_META: pit.js is fight logic and
// has no business carrying a hex code.
const STAT_BAR_COLOR = {
  power: 'var(--accent)', marrow: 'var(--protein)', wind: 'var(--gold)',
  reflex: 'var(--violet)', hype: 'var(--coral)',
};
async function renderTalents(wrap) {
  const body = $('#talBody', wrap) || (wrap && wrap.id === 'talBody' ? wrap : null);
  if (!body) return;
  const [xpRows, takenArr, fighter, coinBal, dustBal] = await Promise.all([db.all('xp'), kvGet('talents', []), buildFighter(), coins(), boneDust()]);
  const taken = new Set(takenArr);
  const tranks = talentRanks(takenArr);
  const lvl = levelFor(xpRows.reduce((a, r) => a + (r.xp || 0), 0));
  const points = talentPoints(lvl.level);
  const unspent = Math.max(0, points - takenArr.length);
  const fightArr = fighter.fightTalents || fighter.talents;
  const d = derived(fighter.stats, WEAPONS[fighter.loadout], new Set(fightArr), fighter.gearArmor, talentRanks(fightArr));
  const recArch = recommendArch(fighter);

  // Collapsible build sections (same <details> pattern as the talent trees /
  // quests). Open state survives the wholesale re-render on every tap.
  const prevOpen = new Map($$('.bsect', body).map(el => [el.dataset.bsect, el.open]));
  const sectOpen = (key, dflt = false) => (prevOpen.has(key) ? prevOpen.get(key) : dflt) ? 'open' : '';

  // ----- Fighter stats (moved out of the Pit): what each stat DOES + spec it powers -----
  // Tier 3 (mockup t3-build.html, approved 2026-08-07): the essay is gone. A
  // fighter plate with the unspent points as a coral badge, the FAQ as one pill,
  // armor as two tiles, and each stat as a plated row with its bar, one line of
  // meaning and real drawn +/- steppers.
  const statBlock = `
    <div class="t3-fighter">
      <div class="n"><b>YOUR FIGHTER</b><small>${d.maxHp} HP · ${d.maxWind} Stamina · grows from your real habits</small></div>
      ${fighter.tpAvail ? `<div class="tp"><b>${fighter.tpAvail}</b><small>TO SPEND</small></div>` : ''}
    </div>
    ` + buildFaqHtml(fighter, sectOpen('faq', false)) + `
    <div class="t3-armor">
      <div class="t3-cell"><b>${Math.round(d.armor * 100)}%</b><span class="lab">ARMOR</span><small>cuts melee damage · grows from Marrow</small></div>
      <div class="t3-cell"><b>${Math.round(d.spellArmor * 100)}%</b><span class="lab">SPELL ARMOR</span><small>cuts magic damage · grows from Reflex</small></div>
    </div>

    <div class="t3-sect"><b>Training points</b><i></i><span class="r chip" style="font-size:11px">${fighter.tpAvail} to spend${fighter.tpTotal ? ` · ${fighter.tpTotal - fighter.tpAvail}/${fighter.tpTotal} used` : ''}</span></div>
    ${STAT_META.map(m => {
      const bonus = (fighter.alloc[m.key] || 0) * TRAIN_STEP;
      const gb = fighter.gearBonus?.[m.key] || 0;
      return `
      <div class="t3-stat">
        <div class="top"><b>${m.label.toUpperCase()}</b><span class="v">${fighter.stats[m.key]}${bonus ? `<span class="stat-bonus"> +${bonus}</span>` : ''}${gb ? `<span class="stat-gear"> +${gb} gear</span>` : ''}</span></div>
        <div class="bar"><i style="width:${Math.min(100, fighter.stats[m.key])}%;background:${STAT_BAR_COLOR[m.key] || 'var(--accent)'}"></i></div>
        <div class="foot">
          <small>${esc(m.combat)}</small>
          <button class="t3-pm" data-tpminus="${m.key}" aria-label="Spend one less point on ${esc(m.label)}" ${(fighter.alloc[m.key] || 0) <= 0 ? 'disabled' : ''}></button>
          <button class="t3-pm plus" data-tpplus="${m.key}" aria-label="Spend a point on ${esc(m.label)}" ${fighter.tpAvail <= 0 ? 'disabled' : ''}></button>
        </div>
      </div>`;
    }).join('')}
    <p class="note" style="margin:2px 2px 10px">Points come from hitting protein, closing days on budget, and every 25,000 steps.</p>
    ${fighter.tpTotal - fighter.tpAvail > 0 ? '<button class="btn ghost small" id="tpReset" style="margin-bottom:6px">Reset training</button>' : ''}
    <button class="card bsect-link" id="toShopMerchant">
      <div><b>The Bone Merchant</b><span class="note" style="display:block">Buy &amp; equip weapons in the Shop · you own ${fighter.owned.length}/${Object.keys(WEAPONS).length}</span></div>
      <span class="crew-chev">›</span>
    </button>
    ${(() => {
      const parts = Object.entries(fighter.gearBonus || {}).filter(([, v]) => v > 0).map(([k, v]) => `+${v} ${k.toUpperCase()}`);
      const setActive = (fighter.setInfo?.sets || []).some(s => s.tiers.length);
      if (!parts.length && !setActive) return '';
      return `<details class="bsect" data-bsect="gearbonus" ${sectOpen('gearbonus')}>
      <summary class="bsect-head"><b>Gear bonuses</b><span class="note">${parts.length ? parts.join(' · ') : 'set bonuses active'}</span></summary>
      <div class="bsect-body">
      ${parts.length ? `<p class="note" style="margin:2px 2px 8px">Worn gear grants ${parts.join(' · ')}. Equip pieces in your Wardrobe.</p>` : ''}
      ${setActive ? `<div class="set-note">${fighter.setInfo.sets.filter(s => s.tiers.length).map(s => `<div class="set-row"><b>${esc(s.epithet)} Set (${s.pieces})</b>${s.tiers.map(t => `<small>${t}pc: ${esc(setBonusLabel(s.arch, t))}</small>`).join('')}</div>`).join('')}</div>` : ''}
      </div></details>`;
    })()}`;

  body.innerHTML = `
    ${statBlock}
    ${/* The mockup put a row here linking to "the talent tree". The trees are
          already inline on this screen, so a button pointing 100px down would be
          furniture: the section rule + its count carries the same job. */''}
    <div class="t3-sect"><b>Talents</b><i></i><span class="r chip" style="font-size:11px">${unspent} to pick · Lv ${lvl.level}</span></div>
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
            const pipTxt = max > 1 ? `${cur}/${max}` : (full ? ICONS.check(11) : tier === 4 ? ICONS.star(11) : 'T' + tier);
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
  // Refund-and-respend already worked, but on ONE tap, which is the same trap that
  // cost Tom 25 dust in the shop. Wiping a build is worse: it drops your stats
  // mid-session, and your Dark Spire defender and friend-battle clone are both built
  // from these stats, so a stray tap could lose you a tower. Arm first, and say what
  // comes back.
  $('#tpReset', body)?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    const spent = fighter.tpTotal - fighter.tpAvail;
    if (btn.dataset.armed !== '1') {
      btn.dataset.armed = '1';
      btn.classList.add('danger');
      btn.textContent = `Refund all ${spent} point${spent === 1 ? '' : 's'}? Tap again`;
      clearTimeout(btn._t);
      btn._t = setTimeout(() => {
        if (!btn.isConnected) return;
        btn.dataset.armed = '0'; btn.classList.remove('danger'); btn.textContent = 'Reset training';
      }, 3600);
      return;
    }
    clearTimeout(btn._t);
    await kvSet('trainalloc', {});
    popSound(S.sounds);
    toast(`${spent} training point${spent === 1 ? '' : 's'} refunded. Spend them again below: your stats stay low until you do.`, 4200);
    renderTalents(wrap);
  });
  // weapons now live in the Shop tab (v150); Build just links there
  $('#toShopMerchant', body)?.addEventListener('click', () => openCharacter('shop'));
  /* Keep the Build tab's unspent-point badge honest without a full hub re-render.
     Recomputed from the SAME source renderCharacter uses, so the two can never
     disagree about the number. */
  async function syncTalentBadge() {
    const tabBtn = document.querySelector('.ch-tab[data-tab="talents"]');
    if (!tabBtn) return;
    const [arr, xp] = await Promise.all([kvGet('talents', []), totalXp()]);
    const left = Math.max(0, talentPoints(levelFor(xp).level) - arr.length);
    const badge = tabBtn.querySelector('.ch-badge');
    if (left > 0) {
      if (badge) badge.textContent = String(left);
      else tabBtn.insertAdjacentHTML('beforeend', `<i class="ch-badge">${left}</i>`);
    } else if (badge) badge.remove();
  }

  $$('[data-talent]', body).forEach(b => b.addEventListener('click', async () => {
    const arr = await kvGet('talents', []); // rank = one entry each, so push (never dedupe)
    if (!canTakeTalent(arr, b.dataset.tree, Number(b.dataset.idx))) return;
    arr.push(b.dataset.talent);
    await kvSet('talents', arr);
    popSound(S.sounds);
    confettiBurst(innerWidth / 2, innerHeight * 0.3, 12);
    renderTalents(wrap);
    syncTalentBadge();
  }));
  $('#respecBtn', body)?.addEventListener('click', async () => {
    await kvSet('talents', []);
    toast('Points refunded. Build something new.');
    renderTalents(wrap);
    syncTalentBadge();
  });
}

/* ================= demo seed ================= */

async function seedDemo() {
  const profile = { sex: 'm', age: 33, heightCm: 180, weightKg: 84, activity: 'moderate', goal: 'recomp' };
  const settings = { profile, targets: computeTargets(profile), units: 'lb', fdcKey: null, hkConnected: true, createdAt: Date.now() };
  await kvSet('settings', settings);
  const demoSteps = [8421, 11250, 6480, 9902, 7300, 12010, 5400, 9100, 10250, 6800, 8800, 11500, 7000, 9600];
  const demoSleep = [7, 8, 6.5, 7.5, 6, 8, 5.5, 7, 8, 6.5, 7, 9, 6, 7.5];
  const demoRhr = [49, 48, 52, 50, 54, 47, 55, 51, 48, 53, 50, 46, 54, 50];
  const demoHrv = [66, 71, 58, 64, 54, 74, 51, 62, 70, 57, 63, 78, 55, 65];
  for (let i = 0; i < demoSteps.length; i++) {
    const sleepMin = Math.round(demoSleep[i] * 60);
    const deepMin = Math.round(sleepMin * 0.20);
    const remMin = Math.round(sleepMin * 0.22);
    const awakeMin = Math.round(sleepMin * 0.05);
    await db.put('health', {
      date: addDays(dateKey(), -i),
      steps: demoSteps[i],
      activeKcal: Math.round(demoSteps[i] * 0.06),
      exerciseMin: Math.round(demoSteps[i] / 900),
      sleepHours: demoSleep[i],
      sleepMin, sleepDeepMin: deepMin, sleepRemMin: remMin,
      sleepCoreMin: sleepMin - deepMin - remMin, sleepAwakeMin: awakeMin,
      sleepStaged: true, sleepAuto: true,
      restingHr: demoRhr[i],
      hrv: demoHrv[i],
    });
  }
  await kvSet('coins', 340);
  const demoCos = ['H11-1', 'FW1', 'IL1-1', 'IR1', 'C1', 'P1', 'BG2-1', 'E2', 'T6-2', 'U3', 'S3', 'G1', 'SK0-3', 'B0-5'];
  for (const id of demoCos) await db.put('inv', { id: 'demo-' + id, kind: 'cos', itemId: id, source: 'demo', ts: Date.now() });
  await kvSet('equipped', { H: 'H11-1', FW: 'FW1', IL: 'IL1-1', IR: 'IR1', C: 'C1', P: 'P1', BG: 'BG2-1' });
  await db.put('inv', { id: 'demo-crate1', kind: 'crate', crate: 'golden', source: 'level-7', ts: Date.now() });
  await db.put('inv', { id: 'demo-crate2', kind: 'crate', crate: 'daily', source: 'quests', ts: Date.now() });
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

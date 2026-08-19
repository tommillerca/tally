/* THE SMALL FINDS COLLECT QUIETLY. THE OPENABLE ONES KEEP THE CEREMONY.
 *
 * Tom, 2026-08-18: "ok then let's lose the full screen reveal on the smaller
 * items." Every Boneyard collect used to end in openPackReveal, a full-screen
 * takeover with a card to flick away, at roughly one interruption every 105
 * seconds on a walk at the density the Boneyard is heading for. That is the
 * thing that has to move before the map can get denser.
 *
 * THE RULE, and it is read off the data rather than off a list of type names:
 * a spawn whose SPAWN_TYPES entry has a `crate` hands you an OBJECT (the Buried
 * crate's Common Crate, the RARE's Step Egg) with its own art and its own next
 * step, and a card is the only place that reads. Bones, coins and herbs pay
 * COUNTERS: XP, coins, seeds, an ingredient. Those collect quietly, into the
 * toast the app already has. A new spawn type is therefore quiet unless it
 * actually drops a box, which is the direction that fails safe.
 *
 * THE OTHER HALF IS NOT COSMETIC, and this suite measures it rather than
 * asserting it in prose. openPackReveal is built on openSheet, and openSheet
 * fires feat_open on open and feat_time on close. The D1 `events` table carries
 * three indexes, so one insert is four row-writes: those two events cost EIGHT
 * of the free tier's 100,000 daily row-writes on EVERY collect, purely as a side
 * effect of which helper drew the reward. Three rows below pin that arithmetic
 * to the actual sources (js/app.js and server/schema.sql) so it cannot rot into
 * a comment that used to be true.
 *
 * HOW THE EVENT COUNT IS TAKEN. js/analytics.js refuses to record anything under
 * navigator.webdriver OR ?demo, and godmode requires ?demo, so the queue is
 * structurally empty in a test and counting it would be the empty sample this
 * project keeps getting burned by. Instead the suite serves a ONE LINE patched
 * copy of js/analytics.js over request interception, which pushes every track()
 * call into window.__ev BEFORE that refusal. The patch is asserted applied, and
 * the ceremony collects are the control: if they did not show 2 events each, the
 * zero on the quiet path would be measuring a dead instrument, not the fix.
 *
 * PROVE-RED: in the #mapCollect handler in js/app.js, drop the `if (ceremony)`
 * and call openPackReveal unconditionally. QUIET bones/coins/herbs, GUARD and
 * COST all go red, naming the takeover and 2 events on a bone cache.
 *
 * Usage: node tests/spawn-quiet-audit.mjs        (SHOTS=<dir> to save screens)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, settle, serveTree, dismissOverlays, boneyardCapability,
  unproven, unprovenReport, exitFor } from './godmode.js';
import { spawnsForCell, cellOf, distanceM, SPAWN_TYPES } from '../js/hunt.js';
import { SPAWN_FOOD, INGREDIENTS } from '../js/cooking.js';
/* WHICH SPAWNS ARE GUARANTEED TO CARRY FOOD, derived rather than named, so
   renaming a spawn or retuning the table cannot silently retire this rule. Under
   the Boneyard supply change most spawns carry food only sometimes (SPAWN_FOOD
   below 1), and only the food spawn is guaranteed. A spawn that IS guaranteed
   and delivers nothing is a real bug; one that is not guaranteed and delivers
   nothing is correct. */
const FOOD_GUARANTEED = new Set(Object.keys(SPAWN_FOOD || {}).filter(t => (SPAWN_FOOD[t] ?? 0) >= 1));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const SHOTS = process.env.SHOTS || null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

/* ---------------------------------------------------------------- STATIC ---
 * These need no browser, so they grade on every machine including one that
 * cannot draw a map, and they are what turn the write-cost claim into a fact.
 */
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const schema = fs.readFileSync(path.join(ROOT, 'server/schema.sql'), 'utf8');

// The rule itself, taken from hunt.js rather than restated: exactly the two
// openable spawns carry a crate, and exactly the three counter spawns do not.
const withCrate = Object.keys(SPAWN_TYPES).filter(t => SPAWN_TYPES[t].crate).sort();
const noCrate = Object.keys(SPAWN_TYPES).filter(t => !SPAWN_TYPES[t].crate).sort();
ok('RULE the openable spawns are exactly crate + rare, and the counter spawns are the rest',
  withCrate.join(',') === 'crate,rare' && noCrate.join(',') === 'bones,coins,herbs',
  `crate: ${withCrate.join(',')} | counters: ${noCrate.join(',')}`);

// The app must decide from that data, not from a list of type names it keeps in
// sync by hand. A literal 'bones'/'coins'/'herbs' inside the collect handler is
// the failure this row exists to catch.
const handler = appSrc.slice(appSrc.indexOf("$('#mapCollect', body)?.addEventListener"),
  appSrc.indexOf("worldReady = true;"));
const nameLits = ["'bones'", "'coins'", "'herbs'"].filter(s => handler.includes(s));
ok('RULE the collect handler branches on SPAWN_TYPES, never on a hardcoded type list',
  handler.length > 500 && /SPAWN_TYPES\[[^\]]+\]\.crate/.test(handler) && nameLits.length === 0,
  `handler ${handler.length}b | stray type literals: ${nameLits.join(',') || 'none'}`);

// One sheet is two events. If a third emitter appears, or the pair moves out of
// openSheet, the arithmetic every COST row below uses is wrong and says so.
const openSheetBody = appSrc.slice(appSrc.indexOf('function openSheet('), appSrc.indexOf('function closeTopSheet('));
const openTotal = (appSrc.match(/trackEvent\('feat_open'/g) || []).length;
const timeTotal = (appSrc.match(/trackEvent\('feat_time'/g) || []).length;
ok('COST openSheet is still the ONLY emitter of feat_open/feat_time, so one sheet is 2 events',
  openTotal === 1 && timeTotal === 1
  && openSheetBody.includes("trackEvent('feat_open'") && openSheetBody.includes("trackEvent('feat_time'"),
  `feat_open x${openTotal}, feat_time x${timeTotal}, both inside openSheet: ${openSheetBody.includes("trackEvent('feat_open'") && openSheetBody.includes("trackEvent('feat_time'")}`);

// And one event is four row-writes, because the row lands in three indexes too.
const evIdx = (schema.match(/CREATE INDEX[^;]*\bON events\b/gi) || []).length;
ok('COST the D1 events table still carries 3 indexes, so 1 insert is 4 row-writes',
  evIdx === 3, `${evIdx} indexes on events -> 1 sheet = 2 events = ${2 * (1 + evIdx)} row-writes of the 100k/day free tier`);

/* ---------------------------------------------------------------- FIXTURE ---
 * Computed from hunt.js, which is pure, so the expectation comes from the
 * generator and the page has to agree with it. Local date, not UTC: the app's
 * dateKey() is local and asking for tomorrow's field teleports you to spawns
 * today's map does not have (the bug mini-theme-audit already carries a note on).
 */
const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const date = dateKey();
const HOME = { lat: 49.2827, lng: -123.1207 };   // Vancouver

/* Recomputed on every lookup, never cached. Slots roll on staggered 45 minute
   instances, so a table built at the top of a run that takes minutes goes stale
   mid-run and mislabels a spawn's type. */
function field() {
  const { cx, cy } = cellOf(HOME.lat, HOME.lng);
  const out = [];
  for (let dx = -6; dx <= 6; dx++) {
    for (let dy = -6; dy <= 6; dy++) {
      for (const s of spawnsForCell(date, cx + dx, cy + dy)) out.push({ ...s, dist: distanceM(HOME.lat, HOME.lng, s.lat, s.lng) });
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}
const typeOfId = id => (field().find(s => s.id === id) || {}).type || null;

const TYPES = ['bones', 'coins', 'herbs', 'crate', 'rare'];
const first = field();
const haveAll = TYPES.every(t => first.some(s => s.type === t));
ok('FIXTURE today\'s field around Vancouver offers all five spawn types to walk to',
  first.length > 0 && haveAll,
  TYPES.map(t => `${t}:${first.filter(s => s.type === t).length}`).join(' '));
if (!first.length || !haveAll) { console.log('\nFAILED: no fixture to drive'); process.exit(1); }

/* ------------------------------------------------------------------ BOOT --- */
const srvHandle = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srvHandle.url;
const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errs = []; page.on('pageerror', e => errs.push(String(e)));
const origin = new URL(base).origin;
await browser.defaultBrowserContext().overridePermissions(origin, ['geolocation']);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

/* THE INSTRUMENT. One line into js/analytics.js, served over the wire, ahead of
   the BOT refusal that would otherwise make every count zero. Nothing on disk is
   touched; the app under test is the app that ships. */
const analyticsSrc = fs.readFileSync(path.join(ROOT, 'js/analytics.js'), 'utf8');
const NEEDLE = 'export function track(name, props) {';
/* The recorder is created at MODULE EVALUATION, not on the first event, so its
   presence proves the patched copy actually loaded. Created lazily inside
   track() it would be absent both when the patch failed to reach the page and
   when the app simply has not fired an event yet, and those two are the
   difference between a measurement and an empty sample. */
const patched = `self.__ev = self.__ev || [];\n` + analyticsSrc.replace(NEEDLE,
  `${NEEDLE}\n  try { self.__ev.push({ name, props }); } catch { /* probe */ }`);
const patchApplied = patched.includes('self.__ev.push(');
let served = 0;
await page.setRequestInterception(true);
/* CACHE OFF, or the whole instrument is a no-op. boot() has already loaded the
   app once, and Chrome's memory cache answers the second navigation's module
   requests without ever reaching the network layer, so the interceptor is never
   consulted and the patched copy never lands. Measured: two runs where the patch
   applied cleanly and window.__ev was still absent. */
await page.setCacheEnabled(false);
page.on('request', req => {
  if (patchApplied && /\/js\/analytics\.js(\?|$)/.test(req.url())) {
    served++;
    return req.respond({ status: 200, contentType: 'text/javascript; charset=utf-8', body: patched });
  }
  return req.continue();
});
// re-navigate so the patched module is the one the module graph gets
await page.goto(base.replace(/\/?$/, '/') + '?demo', { waitUntil: 'networkidle2' });
await sleep(2400);
await dismissOverlays(page);
await seed(page, { level: 14, coins: 0 });

const liveProbe = await page.evaluate(() => Array.isArray(self.__ev));
ok('PROBE the analytics recorder is live (a dead probe would score every collect as zero)',
  patchApplied && served > 0 && liveProbe,
  `patch built: ${patchApplied}, patched copy served ${served}x, window.__ev present: ${liveProbe}`);

/* Silence the badge celebration: it opens a sheet of its own 380ms after a
   collect, which would land in the same window as the collect and be counted as
   the reveal's. Pre-marking every badge as already claimed makes evaluateBadges
   return nothing, so the only sheet that can appear is the one under test. */
const silenced = await page.evaluate(async () => {
  const { db } = await import('/js/db.js');
  const { BADGES } = await import('/js/game.js');
  const today = new Date().toISOString().slice(0, 10);
  for (const b of BADGES) await db.put('xp', { key: 'badge-' + b.id, type: 'badge', xp: 0, label: 'audit: pre-claimed', date: today, ts: Date.now() });
  return BADGES.length;
});
ok('PROBE the badge celebration is silenced, so the only sheet that can open is the reveal',
  silenced > 0, `${silenced} badges pre-claimed`);

const cap = await boneyardCapability(page);

/* --------------------------------------------------------------- DRIVING --- */
const store = () => page.evaluate(async () => {
  const [loot, cooking, garden, game] = await Promise.all([
    import('/js/loot.js'), import('/js/cooking.js'), import('/js/garden.js'), import('/js/game.js')]);
  // crates and Step Eggs are both rows in `inv` (grantCrate / grantEgg)
  const inv = await loot.inventory();
  return {
    coins: await loot.coins(), xp: await game.totalXp(),
    ing: await cooking.ingredients(), seeds: await garden.seeds(),
    crates: inv.filter(r => r.kind === 'crate' || r.kind === 'egg').length,
    ev: (self.__ev || []).length,
  };
});

async function standOn(s) {
  await page.setGeolocation({ latitude: s.lat, longitude: s.lng });
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(700);
  await page.evaluate(() => { location.hash = '#/boneyard'; });
  await sleep(2200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
    if (b) b.click();
  });
  // the map has to boot, place, and snap onto walkable ground before the bar can offer anything
  for (let i = 0; i < 30; i++) {
    await sleep(700);
    const btn = await page.evaluate(() => {
      const b = document.getElementById('mapCollect');
      return b ? { hidden: b.hidden, id: b.dataset.spawnId || '', text: (b.textContent || '').trim(), disabled: b.disabled } : null;
    });
    if (btn && !btn.hidden && btn.id && !btn.disabled && /grab/i.test(btn.text)) return btn;
  }
  return null;
}

/* One collect, measured from both ends: what the player saw, and what the
   analytics probe recorded while they saw it. */
const screenState = () => page.evaluate(() => ({
  // `.reveal-take` is shared with the level-up and the badge celebration, so the
  // collect's own reveal is identified by #packReveal, which only openPackReveal
  // emits. Both are recorded: a takeover with no pack reveal is somebody ELSE's
  // sheet, and reading them as one is how the first run of this suite scored a
  // badge celebration as a bone cache taking over the screen.
  takeover: !!document.querySelector('.reveal-take'),
  packReveal: !!document.getElementById('packReveal'),
  sheets: document.querySelectorAll('#sheets .sheet').length,
  toast: document.getElementById('toast').hidden ? '' : (document.getElementById('toast').textContent || '').trim(),
}));

// Never measure a collect over somebody else's open sheet.
async function clearScreen() {
  for (let i = 0; i < 8; i++) {
    const s = await screenState();
    if (!s.sheets && !s.takeover) return true;
    await page.evaluate(() => history.back());
    await sleep(650);
  }
  return false;
}

/* THE TOAST IS A QUEUE, AND ENTERING THE BONEYARD FILLS IT.
 * Every rare within 1500m fires a "a rare stirs nearby" cue on the first pass,
 * each held for 4s, capped at 4. So on a rare-dense map the collect's own toast
 * can be up to 16 seconds behind the tap, and a 5 second window sees only the
 * cues. Measured, not guessed: run 4 of this suite captured three cue messages
 * and no collect message on a bone cache that had toasted correctly.
 * (Worth saying out loud as a product note: this is pre-existing behaviour of
 * the queue, and it now delays the ONLY feedback a quiet collect gets.)
 * So: wait for the queue to drain before tapping, then the next toast is ours. */
async function drainToast() {
  for (let i = 0; i < 70; i++) {
    if (await page.evaluate(() => document.getElementById('toast').hidden)) return true;
    await sleep(500);
  }
  return false;
}

async function collect(shotName) {
  const clean = await clearScreen();
  await drainToast();
  const before = await store();
  await page.evaluate(() => { self.__ev = []; });
  await page.evaluate(() => document.getElementById('mapCollect').click());
  /* The HIGH WATER MARK over the whole window, not the reading at the moment it
     broke out: the toast lives 2.6s and a reveal is dismissible, so a single
     late sample can miss either one and score it as nothing happening. */
  /* EVERY toast in the window, not the last one. The toast is a QUEUE, and
     refreshWorld fires the "a rare stirs nearby" cue moments after a collect, so
     the single last reading is reliably somebody else's message: the first run of
     this suite scored three good quiet collects as unnamed on exactly that. */
  const saw = { takeover: false, packReveal: false, sheets: 0, toasts: [] };
  let shot = false;
  for (let i = 0; i < 32; i++) {
    await sleep(250);
    const s = await screenState();
    saw.takeover ||= s.takeover;
    saw.packReveal ||= s.packReveal;
    saw.sheets = Math.max(saw.sheets, s.sheets);
    if (s.toast && !saw.toasts.includes(s.toast)) saw.toasts.push(s.toast);
    // shoot the moment there is something to look at, not 5s later when the
    // toast has expired and the next queued message is on screen instead
    if (SHOTS && shotName && !shot && (s.packReveal || s.toast)) {
      shot = true; await settle(page, 150); await page.screenshot({ path: path.join(SHOTS, `${shotName}.png`) });
    }
    if (saw.packReveal && shot) break;
  }
  /* CLOSE IT INSIDE THE WINDOW. feat_time is emitted on close, so measuring
     before the player dismisses the reveal reports half the real cost. */
  if (saw.takeover) { await page.evaluate(() => history.back()); await sleep(900); }
  await sleep(600);
  const evs = await page.evaluate(() => (self.__ev || []).map(e => e.name));
  const after = await store();
  return { before, after, saw, clean, evs, feat: evs.filter(n => n === 'feat_open' || n === 'feat_time') };
}

/* Walk the field until every type has been collected once. Opportunistic: the
   bar offers the NEAREST spawn, and placeWalkable can snap a different one into
   reach, so whatever it offers is taken if that type is still wanted. */
const runs = {};
let attempts = 0;
for (const want of TYPES) {
  if (runs[want]) continue;
  const cands = field().filter(s => s.type === want && !Object.values(runs).some(r => r.id === s.id)).slice(0, 5);
  for (const c of cands) {
    if (runs[want] || attempts >= 22) break;
    attempts++;
    const btn = await standOn(c);
    if (!btn) continue;
    const got = typeOfId(btn.id);
    if (!got || runs[got]) continue;                 // already have this type, or a slot rolled under us
    const r = await collect(`collect-${got}`);
    if (r.after.xp === r.before.xp && !r.saw.packReveal && !r.saw.toasts.length) continue;   // nothing happened: stale ledger row
    runs[got] = { id: btn.id, type: got, ...r };
    console.log(`      drove ${got} @ ${btn.id}: packReveal=${r.saw.packReveal} takeover=${r.saw.takeover} sheets=${r.saw.sheets} clean=${r.clean} toasts=${JSON.stringify(r.saw.toasts)} feat=${r.feat.length} [${r.evs.join(',')}]`);
  }
}

const droveAny = Object.keys(runs).length > 0;
const QUIET = ['bones', 'coins', 'herbs'], LOUD = ['crate', 'rare'];
const mapRow = (name, fn) => {
  if (!droveAny) return unproven(name, `the map never offered a spawn to collect in ${attempts} attempts (webgl/tiles: ${cap.ok ? 'present' : 'MISSING'})`);
  return fn();
};

ok('DROVE every spawn type was actually collected in a real map (an empty sample is a FAILURE)',
  TYPES.every(t => runs[t]), TYPES.map(t => `${t}:${runs[t] ? 'yes' : 'NO'}`).join(' ') + ` in ${attempts} attempts`);

for (const t of QUIET) {
  mapRow(`QUIET ${t} collects with no full-screen reveal`, () => {
    const r = runs[t];
    if (!r) return ok(`QUIET ${t} collects with no full-screen reveal`, false, 'never driven');
    return ok(`QUIET ${t} collects with no full-screen reveal`,
      !r.saw.packReveal && !r.saw.takeover && r.saw.sheets === 0 && r.saw.toasts.length > 0,
      `packReveal=${r.saw.packReveal} takeover=${r.saw.takeover} sheets=${r.saw.sheets} toasts=${JSON.stringify(r.saw.toasts)}`);
  });
}

/* THE TOAST NAMES AN INGREDIENT IF AND ONLY IF ONE WAS GRANTED, and the "only
   if" half is the one that matters. This row used to demand an ingredient in
   EVERY toast, which was correct while every collect carried exactly one. The
   Boneyard supply change made the count VARIABLE and about 63% of finds now
   carry none, so the old form went red on healthy code.
   It is NOT relaxed. It is now two-directional: a toast that omits an ingredient
   the player DID receive fails, and a toast that names one they did NOT receive
   also fails. That second direction is a real bug this repo shipped three
   separate times in one merge (the reveal card, the removal branch's card, and
   this toast), each branch correct against main on its own. */
mapRow('QUIET the toast names the find, the amount, and an ingredient only when one was granted', () => {
  const rows = QUIET.map(t => runs[t]).filter(Boolean);
  const verdict = r => {
    const label = SPAWN_TYPES[r.type].label;
    const gained = Object.keys(r.after.ing).find(k => (r.after.ing[k] || 0) > (r.before.ing[k] || 0));
    const toast = r.saw.toasts.find(t => t.includes(label) && /\+\d+/.test(t));
    if (!toast) return { ok: false, why: 'NO TOAST naming the find and an amount' };
    const names = id => toast.toLowerCase().includes(String(id).slice(0, 4).toLowerCase());
    /* The toast prints the DISPLAY NAME ("Ember Pepper"), not the id ("ember"),
       so an id-only match misses every ingredient whose name does not start with
       its id. Both are checked. */
    const nameOf = id => {
      const n = INGREDIENTS[id] && INGREDIENTS[id].name;
      return !!n && toast.toLowerCase().includes(String(n).toLowerCase());
    };
    if (gained && !names(gained)) return { ok: false, why: `granted ${gained} but the toast never says so: "${toast}"` };
    if (!gained) {
      /* SEARCH THE WHOLE INGREDIENT TABLE, not the player's inventory. The first
         version of this looked for the lie among `r.after.ing` keys, which are
         only the ingredients the player ALREADY HAS. A toast naming something
         they do not own therefore matched nothing and passed. Measured: with the
         bug deliberately reintroduced the toasts read "Bone cache: +16 XP, Sinew"
         and "Coin pile: +12 coins, +6 XP, Ember Pepper", both plainly wrong, and
         this row still went green. A lie is by definition about a thing that is
         NOT in the player's hand, so the inventory is exactly the wrong set. */
      const lied = Object.keys(INGREDIENTS).find(k => names(k) || nameOf(k));
      if (lied) return { ok: false, why: `granted NO ingredient but the toast names ${lied}: "${toast}"` };
    }
    return { ok: true, why: toast };
  };
  const v = rows.map(verdict);
  return ok('QUIET the toast names the find, the amount, and an ingredient only when one was granted',
    rows.length === 3 && v.every(x => x.ok),
    rows.map((r, i) => `${r.type}: ${v[i].why}`).join(' | ') || 'no quiet collects');
});

mapRow('GRANT a quiet collect banks its XP and coins, never loses ingredients, and never pays a seed', () => {
  const rows = QUIET.map(t => runs[t]).filter(Boolean);
  const bad = rows.filter(r => {
    const def = SPAWN_TYPES[r.type];
    /* NO SEEDS ROW ANY MORE. The Bone Garden left the player's path, so a collect
       that granted seeds would be the bug, not the proof. INGREDIENTS ARE NO
       LONGER GUARANTEED EITHER: the supply change made the count variable, so
       this asserts ingredients never go DOWN and that the food-carrying spawn
       (the one whose SPAWN_FOOD is >= 1) does still deliver. XP and coins remain
       hard requirements, because those are unconditional on every collect. */
    const ingDelta = Object.keys(r.after.ing).reduce((a, k) => a + ((r.after.ing[k] || 0) - (r.before.ing[k] || 0)), 0);
    const ingOk = ingDelta >= 0 && (FOOD_GUARANTEED.has(r.type) ? ingDelta > 0 : true);
    const coinsOk = def.coins ? r.after.coins >= r.before.coins + def.coins : true;
    const seedsOk = Object.keys(r.after.seeds || {}).every(k => (r.after.seeds[k] || 0) <= (r.before.seeds[k] || 0));
    return !(r.after.xp > r.before.xp && ingOk && coinsOk && seedsOk);
  });
  return ok('GRANT a quiet collect banks its XP and coins, never loses ingredients, and never pays a seed',
    rows.length === 3 && bad.length === 0,
    rows.map(r => `${r.type}: xp ${r.before.xp}->${r.after.xp}, coins ${r.before.coins}->${r.after.coins}, ing ${JSON.stringify(r.before.ing)}->${JSON.stringify(r.after.ing)}, seeds ${JSON.stringify(r.before.seeds)}->${JSON.stringify(r.after.seeds)}`).join(' | '));
});

mapRow('COST a quiet collect fires ZERO feat_open/feat_time, so it writes 0 D1 rows', () => {
  const rows = QUIET.map(t => runs[t]).filter(Boolean);
  return ok('COST a quiet collect fires ZERO feat_open/feat_time, so it writes 0 D1 rows',
    rows.length === 3 && rows.every(r => r.feat.length === 0),
    rows.map(r => `${r.type}:${r.feat.length} events (${r.feat.join(',') || 'none'}) = ${r.feat.length * 4} rows`).join(' | '));
});

for (const t of LOUD) {
  mapRow(`CEREMONY ${t} still gets the full-screen reveal, untouched`, () => {
    const r = runs[t];
    if (!r) return ok(`CEREMONY ${t} still gets the full-screen reveal, untouched`, false, 'never driven');
    return ok(`CEREMONY ${t} still gets the full-screen reveal, untouched`,
      r.saw.packReveal && r.saw.takeover && r.saw.sheets >= 1,
      `packReveal=${r.saw.packReveal} takeover=${r.saw.takeover} sheets=${r.saw.sheets}`);
  });
}

mapRow('CONTROL the retained reveal DOES fire its 2 events, so the zero above is a measurement', () => {
  const rows = LOUD.map(t => runs[t]).filter(Boolean);
  return ok('CONTROL the retained reveal DOES fire its 2 events, so the zero above is a measurement',
    rows.length === 2 && rows.every(r => r.feat.length === 2 && r.feat.includes('feat_open') && r.feat.includes('feat_time')),
    rows.map(r => `${r.type}:${r.feat.length} events (${r.feat.join(',')}) = ${r.feat.length * 4} D1 rows`).join(' | '));
});

mapRow('GRANT the ceremony collect still banks its crate', () => {
  const rows = LOUD.map(t => runs[t]).filter(Boolean);
  return ok('GRANT the ceremony collect still banks its crate',
    rows.length === 2 && rows.every(r => r.after.crates > r.before.crates),
    rows.map(r => `${r.type}: crates ${r.before.crates}->${r.after.crates}`).join(' | '));
});

/* THE GUARD Tom asked for, stated once over the whole quiet set so it cannot be
   satisfied by an empty sample: three low-value types driven, zero takeovers. */
mapRow('GUARD no low-value spawn type has regained the full-screen takeover', () => {
  const rows = QUIET.map(t => runs[t]).filter(Boolean);
  const loud = rows.filter(r => r.saw.packReveal || r.saw.takeover || r.saw.sheets > 0);
  return ok('GUARD no low-value spawn type has regained the full-screen takeover',
    rows.length === QUIET.length && loud.length === 0,
    `${rows.length}/${QUIET.length} quiet types driven, ${loud.length} took over${loud.length ? ': ' + loud.map(r => r.type).join(',') : ''}`);
});

ok('CLEAN nothing threw while collecting', errs.length === 0, errs.slice(0, 3).join(' | '));

console.log(`\n${fails.length ? `${fails.length} FAILED: ${fails.join(' | ')}` : 'SPAWN QUIET COLLECT VERIFIED'}`);
unprovenReport('spawn-quiet-audit', cap);
await browser.close();
srvHandle?.close();
process.exit(exitFor(fails.length));

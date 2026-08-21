/* THE BONE GARDEN IS OFF THE PLAYER'S PATH, AND THE KITCHEN STANDS ALONE.
 *
 * Tom, 2026-08-18: "I've decided that the hollow/garden is a feature that is
 * taking us away from our major purpose here ... we should go back to just the
 * kitchen and ingredients are found out in the boneyard."
 *
 * The removal is a HIDE, not a delete: js/hollow-*.js, js/garden.js, the art and
 * every kv row survive so the feature can come back. That is exactly the shape
 * that rots quietly, because "the code is still there" and "a player can still
 * get to it" look identical from the source. So this suite operates the real
 * surfaces on a real boot and asks whether a door is still open.
 *
 *   ROUTES   every known entrance to the Hollow, the garden and the compost heap
 *            is gone from the player's path: the Kitchen's GROW door and its
 *            compost button, the Today ripe-crop banner and its CTA, the Kitchen
 *            badge, the ripe-crop speech lines, the boot popup, the News row, the
 *            two garden quests, and the seed payout on a map collect.
 *   KITCHEN  a player with ZERO seeds and ZERO plots gets a Kitchen that is
 *            complete: it renders, it says where ingredients come from, the
 *            route it offers lands on the Boneyard, and a dish really cooks.
 *
 * WHY IT CANNOT PASS VACUOUSLY. Three separate guards, because "the selector is
 * absent" is the same answer as "the screen never rendered" (anti-regression
 * rule 3) and this whole suite is a list of absent selectors:
 *   - every surface must prove it rendered, by a control that IS still there
 *     (#forageBtn in the Kitchen, a row in Out There, a News row, a non-empty
 *     quest pool), before any absence on that surface is graded;
 *   - the ripe-crop rows are graded on a save that REALLY HAS RIPE CROPS, seeded
 *     and read back through gardenState() at check time, because on a save with
 *     nothing planted those rows are absent on main too and the check would
 *     prove nothing (anti-regression rule 12);
 *   - CONTROL asserts window.__openHollow still WORKS. If the Hollow had simply
 *     been deleted, every row above would pass while the parked feature was
 *     gone, so the suite would be measuring the wrong removal.
 *
 * Self-serves this checkout when given no URL: boot()'s default is PRODUCTION,
 * and an audit that silently grades the live site is worse than no audit.
 *
 * Usage: node tests/garden-closed-audit.mjs [url]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2] || process.env.URL;
const server = arg ? null : await serveTree(ROOT);
const { browser, page, errors } = await boot(arg || server.url);

let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

const closeSheets = async () => {
  for (let i = 0; i < 6; i++) {
    if (!await page.evaluate(() => !!document.querySelector('#sheets > div'))) break;
    await page.evaluate(() => history.back());
    await sleep(500);
  }
};
const clearVeils = () => page.evaluate(() => {
  document.querySelector('.dw')?.remove();
  document.querySelectorAll('.drop-veil').forEach(v => v.remove());
});
const gotoToday = async () => {
  await closeSheets();
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1700);
  await clearVeils();
  await sleep(300);
};
const openKitchen = async () => {
  await gotoToday();
  await page.evaluate(() => document.getElementById('kitchenActBtn')?.click());
  await sleep(1800);
  await clearVeils();
  await sleep(300);
};
// a real mouse click where a thumb would land, after scrolling into view
const tap = async (sel) => {
  const hit = await page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return { dead: true };
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  if (!hit || hit.dead) return false;
  await page.mouse.click(hit.x, hit.y);
  return true;
};

/* ==================== CONTROL: the parked feature is still THERE ==================
   Runs first on purpose. Every ROUTES row below is an absence, and an absence is
   only meaningful if the thing it is absent from still exists. */
await gotoToday();
const hollowAlive = await page.evaluate(async () => {
  if (typeof window.__openHollow !== 'function') return { seam: false };
  window.__openHollow();
  await new Promise(r => setTimeout(r, 1800));
  const el = document.querySelector('.hlw-stage, .hlw-wrap, #hollowBody, [class*="hlw-"]');
  return { seam: true, opened: !!el, cls: el ? el.className.slice(0, 40) : '' };
});
check('CONTROL the webdriver seam window.__openHollow still exists', hollowAlive.seam);
check('CONTROL the Hollow itself still opens through it, so this suite is grading CLOSED DOORS and not a deleted feature',
  hollowAlive.opened, JSON.stringify(hollowAlive));
await closeSheets();

/* ==================== ROUTES 1: the Kitchen landing ==================== */
await openKitchen();
const kitchen = await page.evaluate(() => {
  const body = document.getElementById('kitchenBody');
  return {
    rendered: !!body && body.textContent.trim().length > 200,
    chars: body ? body.textContent.trim().length : 0,
    forage: !!document.getElementById('forageBtn'),          // the control: still there
    doorGrow: !!document.getElementById('doorGrow'),
    doorCook: !!document.getElementById('doorCook'),
    kdDoors: !!document.querySelector('.kd-doors'),
    kdBack: !!document.getElementById('kdBack'),
    compostBtn2: !!document.getElementById('compostBtn2'),
    compostBtn: !!document.getElementById('compostBtn'),
    buyBed: !!document.getElementById('buyBed'),
    hlwBuy: !!document.getElementById('hlwBuy'),
  };
});
check('SETUP the Kitchen sheet really rendered (an empty sheet would pass every absence below)',
  kitchen.rendered && kitchen.forage, JSON.stringify(kitchen));
check('ROUTES the Kitchen has no GROW door', !kitchen.doorGrow);
check('ROUTES the Kitchen has no two-door landing left behind it (.kd-doors, #doorCook, #kdBack)',
  !kitchen.kdDoors && !kitchen.doorCook && !kitchen.kdBack, JSON.stringify(kitchen));
check('ROUTES the compost button is gone from the Kitchen (it destroyed an ingredient for an unplantable seed)',
  !kitchen.compostBtn2 && !kitchen.compostBtn);
check('ROUTES no bed-buying control is reachable from the Kitchen', !kitchen.buyBed && !kitchen.hlwBuy);

/* ==================== KITCHEN: zero seeds, zero plots, still complete ========== */
// Wipe the garden to the state a player who has never seen one is in, and prove
// it IS that state before grading anything (rule 12).
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('garden', null);
});
await openKitchen();
const virgin = await page.evaluate(async () => {
  const g = await import('./js/garden.js');
  const st = await g.gardenState();
  const seeds = Object.values(st.seeds).reduce((a, n) => a + n, 0);
  return { seeds, planted: st.plots.filter(p => !p.empty).length, plotsOwned: st.plotsOwned };
});
check('SETUP the profile under test really has zero seeds and nothing planted',
  virgin.seeds === 0 && virgin.planted === 0, JSON.stringify(virgin));

const standalone = await page.evaluate(() => {
  const body = document.getElementById('kitchenBody');
  const txt = body ? body.textContent : '';
  const toMap = document.getElementById('kitchenToMap');
  let hit = null;
  if (toMap) {
    toMap.scrollIntoView({ block: 'center' });
    const r = toMap.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    hit = at === toMap || toMap.contains(at);
  }
  return {
    recipes: document.querySelectorAll('[data-cook]').length,
    ingCells: document.querySelectorAll('#kitchenBody .ing-cell').length,
    toMap: !!toMap, toMapHit: hit,
    saysBoneyard: /boneyard/i.test(txt),
    // the words that only make sense with a garden upstream
    stale: (txt.match(/\b(seed|seeds|garden|plant|planted|compost|harvest|crop|crops|grow|growing|bed|beds)\b/gi) || []),
  };
});
check('SETUP the Kitchen really rendered its content with an empty larder (recipes + ingredient cells present)',
  standalone.recipes > 0 && standalone.ingCells > 0, JSON.stringify({ recipes: standalone.recipes, cells: standalone.ingCells }));
check('KITCHEN it names where ingredients come from: the Boneyard', standalone.saysBoneyard);
check('KITCHEN no copy refers to growing, seeds, beds or compost',
  standalone.stale.length === 0, standalone.stale.slice(0, 8).join(', '));
check('KITCHEN the Boneyard route is present', standalone.toMap);
check('KITCHEN the Boneyard route is really TAPPABLE (elementFromPoint at its centre, not its rectangle)',
  standalone.toMapHit === true, String(standalone.toMapHit));

check('KITCHEN the Boneyard route can be tapped', await tap('#kitchenToMap'));
await sleep(1600);
const landed = await page.evaluate(() => ({ hash: location.hash, sheet: !!document.querySelector('#sheets > div') }));
check('KITCHEN tapping it lands on the Boneyard and closes the Kitchen', landed.hash === '#/boneyard' && !landed.sheet, JSON.stringify(landed));

// AND IT STILL COOKS. "Usable" is a dish going into a pot, not a screen rendering.
await page.evaluate(async () => {
  const c = await import('./js/cooking.js');
  const inv = {};
  c.COMMON_INGREDIENT_IDS.forEach(id => { inv[id] = 6; });
  const db = await import('./js/db.js');
  await db.kvSet('ingredients', inv);
});
await openKitchen();
const cookable = await page.evaluate(() => document.querySelectorAll('[data-cook]:not([disabled])').length);
check('KITCHEN with ingredients and no garden there are dishes you can actually cook', cookable > 0, `${cookable} enabled`);
check('KITCHEN the first Cook button can be tapped', await tap('[data-cook]:not([disabled])'));
await sleep(1800);
const potState = await page.evaluate(async () => {
  const c = await import('./js/cooking.js');
  const st = await c.cookState();
  return { busy: st.slots.filter(s => !s.empty).length, potsOwned: st.potsOwned };
});
check('KITCHEN a pot is really cooking afterwards (the loop closes with zero garden)',
  potState.busy > 0, JSON.stringify(potState));

/* ============ ROUTES 2: Today, on a save that REALLY HAS RIPE CROPS ============
   The banner, the Kitchen badge, the speech lines and the Kitchen card all hang
   off one number, cropsRipe. On a save with nothing planted they are absent on
   main too, so grading them there would prove nothing. Seed the state that used
   to light every one of them. */
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const now = Date.now();
  await db.kvSet('garden', {
    seeds: { marrow: 3 },
    plotsOwned: 5,
    plots: [
      { ing: 'marrow', plantedAt: now - 9e6, readyAt: now - 6e6, watered: true },
      { ing: 'sinew', plantedAt: now - 9e6, readyAt: now - 6e6, watered: false },
      { ing: 'salt', plantedAt: now - 9e6, readyAt: now - 6e6, watered: false },
      null, null,
    ],
    composts: { date: '', used: 0 },
  });
});
await gotoToday();
const ripe = await page.evaluate(async () => {
  const g = await import('./js/garden.js');
  return { ready: await g.cropsReady(), owned: (await g.gardenState()).plotsOwned };
});
check('SETUP the save under test really has ripe crops and bought beds (rule 12: measure in the complaining state)',
  ripe.ready === 3 && ripe.owned === 5, JSON.stringify(ripe));

const today = await page.evaluate(() => {
  const screen = document.getElementById('screen');
  return {
    rendered: !!screen && screen.textContent.trim().length > 200,
    /* THE CONTROL. It used to count the rows in "Out there today", which is the
       card the garden banner would have appeared in. That card came off Today on
       2026-08-21 (Tom: every banner but the step winner), so the control moved to
       the hype banner that replaced it: a Today that rendered its banner really
       rendered, and every absence below is a measurement rather than a blank. */
    bannerRendered: !!document.querySelector('.card.hype .hype-line'),
    gardenBanner: !!document.querySelector('.garden-banner'),
    gardenCta: !!document.getElementById('gardenToKitchen'),
    kitchenBadge: !!document.querySelector('#kitchenActBtn .hero-badge'),
    kitchenCard: !!document.getElementById('kitchenCard'),
    speech: document.querySelector('.hero-bubble')?.textContent || '',
    words: (screen?.textContent || '').match(/\b(garden|crop|crops|harvest|seed|seeds)\b/gi) || [],
  };
});
check('SETUP Today really rendered, hype banner and all (an empty screen would pass every absence below)',
  today.rendered && today.bannerRendered, JSON.stringify({ rendered: today.rendered, banner: today.bannerRendered }));
check('ROUTES no ripe-crop banner on Today, with three crops standing ripe', !today.gardenBanner);
check('ROUTES no "Open the garden" CTA on Today', !today.gardenCta);
check('ROUTES the Kitchen button carries no ripe-crop badge', !today.kitchenBadge);
check('ROUTES no Kitchen card offering a harvest', !today.kitchenCard);
/* The ripe-crop SPEECH LINES are covered by the row below and not by a row of
   their own. speechLine() picks at random from a pool, so a per-line assertion
   passes by luck on a broken tree: it did exactly that during the prove-red on
   pristine main, where the garden was wide open and the Bonehead happened to
   talk about crates. The screen-wide word check is deterministic and went red on
   the same run. Anti-regression rule 1: a check that cannot reliably fail is not
   a check. */
check('ROUTES the word garden/crop/harvest/seed appears nowhere on Today, speech lines included',
  today.words.length === 0, today.words.slice(0, 8).join(', '));

/* ==================== ROUTES 3: the boot popup ====================
   maybeShowGardenPopup bumps kv gardenIntroSeen every time it decides to show
   the card, so the counter is the receipt. Force the flag the popup honours,
   reset the counter, boot for real, and read both back. */
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('gardenIntroSeen', 0);
});
await page.evaluateOnNewDocument(() => { window.__gardenForce = 1; });
await page.reload({ waitUntil: 'networkidle2' });
await sleep(9000);                      // the popup's own window is 3s + up to 30s of retries
/* READ THE VEIL BEFORE CLEARING ANYTHING. The first version of this block called
   clearVeils() first and then asserted the veil was absent, which passed on
   pristine main with the popup demonstrably open: the check removed its own
   evidence. Only the counter row caught it. Both rows stay, and this one now
   measures before it tidies. */
const popup = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  return { veil: !!document.querySelector('.garden-veil'), seen: await db.kvGet('gardenIntroSeen', null),
    booted: !!document.getElementById('screen')?.textContent.trim() };
});
await clearVeils();
check('SETUP the app really booted during the popup window (a dead boot shows no card either)', popup.booted);
check('SETUP the counter was readable, so this row measured something', popup.seen !== null, String(popup.seen));
check('ROUTES the Bone Garden intro card never opens on boot', !popup.veil);
check('ROUTES boot never even ASKS for it (kv gardenIntroSeen was not bumped)', popup.seen === 0, `gardenIntroSeen = ${popup.seen}`);

/* ==================== ROUTES 4: the News tab ====================
   The News pane lives behind the Crew tab's What's New card, and that card gates
   on being online, so it uses the same webdriver fixtures news-tab-audit.mjs
   does. Every row there is a re-openable announcement; the Bone Garden's row
   reopened the intro popup, whose CTA opened the Hollow. */
await closeSheets();
await page.evaluate(() => {
  window.__testMe = { playerId: 'me', name: 'Hollow Shovel', friendCode: 'BONE-4K7Q', handle: 'hollow' };
  window.__testFriends = { friends: [], incoming: [], outgoing: [] };
  location.hash = '#/friends';
});
await sleep(2400);
await page.evaluate(() => document.getElementById('crewWhatsNew')?.click());
await sleep(1400);
const newsRows = await page.evaluate(async () => {
  document.querySelector('[data-wntab="news"]')?.click();
  await new Promise(r => setTimeout(r, 700));
  return [...document.querySelectorAll('[data-news]')].map(b => b.dataset.news);
});
check('SETUP the News register is non-empty, so the absence below is a real absence',
  newsRows.length >= 4, `${newsRows.length} rows: ${newsRows.join(', ')}`);
check('ROUTES there is no Bone Garden row in News', !newsRows.includes('garden'), newsRows.join(', '));
await closeSheets();

/* ==================== ROUTES 5: the quests (pure) ==================== */
const quests = await page.evaluate(async () => {
  const q = await import('./js/quests.js');
  const ids = p => p.map(x => x.id);
  return { daily: ids(q.DAILY_POOL), weekly: ids(q.WEEKLY_POOL), monthly: ids(q.MONTHLY_POOL) };
});
const allQuests = [...quests.daily, ...quests.weekly, ...quests.monthly];
check('SETUP the quest pools are non-empty', allQuests.length >= 20, `${allQuests.length} quests`);
check('ROUTES no quest asks for a harvest a player can no longer perform',
  !allQuests.includes('q-harvest') && !allQuests.includes('w-garden'),
  allQuests.filter(x => /harvest|garden/.test(x)).join(', ') || 'none');
/* REMOVING CONTENT MUST NOT EMPTY A LIST. quest-daymore-audit.mjs makes this
   assertion for the dailies; the weekly pool lost a member too and nothing was
   watching it. pick() indexes into the filtered pool, so a pool that shrinks past
   the draw size silently hands out a short slate. A whole year, both periods. */
const slates = await page.evaluate(async () => {
  const q = await import('./js/quests.js');
  const opts = { hkConnected: true, huntEnabled: true, socialOn: true, pitTried: true, kitchenReady: true };
  const daily = new Set(), weekly = new Set();
  for (let i = 0; i < 365; i++) {
    const d = new Date(2026, 0, 1 + i).toISOString().slice(0, 10);
    daily.add(q.dailyQuests(d, opts).length);
    weekly.add(q.weeklyQuests(d, opts).length);
  }
  return { daily: [...daily], weekly: [...weekly] };
});
check('ROUTES a full slate of 3 dailies and 3 weeklies survives the removal, every day of a year',
  slates.daily.length === 1 && slates.daily[0] === 3 && slates.weekly.length === 1 && slates.weekly[0] === 3,
  JSON.stringify(slates));
check('ROUTES no quest DESCRIPTION mentions the garden either',
  !(await page.evaluate(async () => {
    const q = await import('./js/quests.js');
    return [...q.DAILY_POOL, ...q.WEEKLY_POOL, ...q.MONTHLY_POOL].some(x => /garden|harvest|crop|seed/i.test(x.desc + x.name));
  })));

/* ================ ROUTES 6: a map collect pays no seed (STATIC) ================
   Stated rather than hidden: this one is graded from source, because the collect
   handler needs a GPS fix and a spawn inside COLLECT_RADIUS_M, which no headless
   run has. The source check is narrow on purpose: grantSeed must not be CALLED
   anywhere in js/app.js. It is still imported, and the Hollow still calls it
   through its own module, which is why the assertion is about the call and not
   about the name. */
const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
check('SETUP js/app.js was really read', src.length > 200000, `${src.length} bytes`);
const stripped = src
  .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments
const seedCalls = [...stripped.matchAll(/\bgrantSeed\s*\(/g)].length;
check('ROUTES js/app.js never calls grantSeed: a collect cannot pay an unplantable seed',
  seedCalls === 0, `${seedCalls} call sites`);
const seedCard = /kind:\s*'SEED'/.test(stripped);
check('ROUTES no SEED reveal card is built on a collect', !seedCard);

check('NO page errors during the run', errors.length === 0, errors.join(' | '));

await browser.close();
server?.close();
console.log(bad ? `\n${bad} FAILED` : '\nTHE GARDEN IS CLOSED AND THE KITCHEN STANDS ALONE');
process.exit(bad ? 1 : 0);

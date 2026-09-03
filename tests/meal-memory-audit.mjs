/* "MEALS REMEMBER" HAS TO COVER THE WAY MOST PEOPLE LOG. 2026-09-02, R14-P9.
 *
 * mealDefault reads kv 'lastMealToday' so the add sheet reopens on the meal you
 * were just logging, and recordMealUsed writes it. Four paths commit a log row
 * and THREE of them called it: the search path, the relog path and the
 * copy-yesterday path. Quick add did not.
 *
 * Measured on the reviewer walk: after a Quick add to Dinner the add button
 * reopened on Lunch; after a relog to Dinner it correctly reopened on Dinner.
 * Quick add is the likeliest way a brand-new player logs their first meal, so
 * it is the path where the feature most needs to work.
 *
 * WHY THE TARGET MEAL IS CHOSEN AT RUN TIME rather than written down. With no
 * mark stored, mealDefault falls back to mealForHour, so a fixed target would
 * pass for the wrong reason on any run started in that meal's hours. This asks
 * the app what the hour default is (it opens the sheet once and reads the chip),
 * then deliberately logs to a DIFFERENT meal. Same trap as the date-seeded
 * fixtures elsewhere in this suite; the answer is the same, take the lever away.
 *
 * THE ROWS:
 *   SETUP    the add sheet opened, its meal chips rendered, and the two meals
 *            this file logs to are both different from the hour default. An
 *            empty or coincidental sample is a failure, never a pass.
 *   QUICK    after a Quick add to a chosen meal, the add button reopens on it.
 *            This is the row that is red before the fix.
 *   CONTROL  the SEARCH path, which has always recorded, still reopens on its
 *            meal. Green on both trees on purpose: it proves the driver reaches
 *            the sheet and the reader can see a remembered meal at all, so QUICK
 *            failing means the feature is missing and not that the check is
 *            looking in the wrong place.
 *
 * Run: node tests/meal-memory-audit.mjs [baseUrl]
 */
import { boot, sleep } from './godmode.js';

const fails = [];
const ok = (n, pass, d = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!pass) fails.push(n); };

const { browser, page } = await boot(process.argv[2] || process.env.URL);

const closeSheets = async () => {
  for (let i = 0; i < 8; i++) {
    if (!await page.evaluate(() => !!document.querySelector('#sheets .sheet'))) return;
    await page.evaluate(() => history.back());
    await sleep(400);
  }
};

/* THE CONTROL A PLAYER PRESSES. #fab is the add-food button, and it is the one
   that asks mealDefault which meal to open on. The per-meal rows on Today pass
   an explicit meal instead, so they could never show this. */
const openAdd = async () => {
  await closeSheets();
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1100);
  await page.evaluate(() => document.querySelector('.dw')?.remove());
  await page.evaluate(() => document.querySelector('#fab')?.click());
  await sleep(1300);
  return page.evaluate(() => {
    const chips = [...document.querySelectorAll('#mealChips button')];
    return {
      count: chips.length,
      on: chips.findIndex(c => c.classList.contains('on')),
      label: (chips.find(c => c.classList.contains('on')) || {}).textContent || null,
      labels: chips.map(c => (c.textContent || '').trim()),
    };
  });
};

// Quick add, driven through its own real controls from the open add sheet.
const quickAdd = async (meal, kcal) => {
  await page.evaluate(m => document.querySelector(`#mealChips button[data-meal="${m}"]`)?.click(), meal);
  await sleep(400);
  await page.evaluate(() => document.querySelector('#actQuick')?.click());
  await sleep(1100);
  const typed = await page.evaluate(k => {
    const el = document.querySelector('#qaKcal');
    if (!el) return false;
    el.value = String(k);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, kcal);
  await page.evaluate(() => document.querySelector('#qaAdd')?.click());
  await sleep(1800);
  return typed;
};

// The search path, the one that has always recorded the meal.
const searchAdd = async (meal, query) => {
  const typed = await page.evaluate(q => {
    const el = document.querySelector('#q');
    if (!el) return false;
    el.value = q;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, query);
  await sleep(1400);
  const picked = await page.evaluate(() => {
    const row = document.querySelector('#results [data-food]');
    if (!row) return null;
    row.click();
    return (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  });
  await sleep(1400);
  await page.evaluate(m => document.querySelector(`#pMealChips button[data-meal="${m}"]`)?.click(), meal);
  await sleep(400);
  await page.evaluate(() => document.querySelector('#addBtn')?.click());
  await sleep(1900);
  return typed ? picked : null;
};

/* ---- what the app opens on with nothing remembered ---- */
const hourDefault = await openAdd();
const target = (hourDefault.on + 1) % (hourDefault.count || 1);   // Quick add lands here
const control = (hourDefault.on + 2) % (hourDefault.count || 1);  // the search path lands here

const quickTyped = await quickAdd(target, 410);
const afterQuick = await openAdd();

const picked = await searchAdd(control, 'banana');
const afterSearch = await openAdd();

ok('SETUP the add sheet opened on a real chip row and both logged meals differ from the hour default',
  hourDefault.count >= 3 && hourDefault.on >= 0
    && target !== hourDefault.on && control !== hourDefault.on && target !== control
    && quickTyped && !!picked,
  `chips ${JSON.stringify(hourDefault.labels)}, hour default ${hourDefault.on} (${hourDefault.label}), ` +
  `quick -> ${target}, search -> ${control} on "${picked}"`);

ok('QUICK a Quick add makes the add button reopen on the meal it was logged to',
  afterQuick.on === target,
  `logged to ${target} (${hourDefault.labels[target]}), reopened on ${afterQuick.on} (${afterQuick.label})` +
  (afterQuick.on === hourDefault.on ? ': it fell back to the hour default, so nothing was remembered' : ''));

ok('CONTROL the search path still reopens on its meal (this row proves the driver and the reader work)',
  afterSearch.on === control,
  `logged to ${control} (${hourDefault.labels[control]}), reopened on ${afterSearch.on} (${afterSearch.label})`);

await browser.close();
console.log(fails.length
  ? `\n${fails.length} FAILED: ${fails.join(', ')}`
  : '\nall four commit paths leave the same mark: the add sheet reopens where you were');
process.exit(fails.length ? 1 : 0);

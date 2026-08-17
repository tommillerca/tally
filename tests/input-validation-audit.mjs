/* EVERY NUMBER A PLAYER CAN TYPE, DRIVEN THROUGH THE REAL UI.
 *
 * WHY THIS EXISTS. This is a food and weight tracker, so a bad number is not a
 * cosmetic bug. It lands in a permanent log row, it feeds the day total, the
 * smoothed weight trend and the per-week rate the player makes decisions from,
 * it feeds the XP payout and the shared leaderboard, and the player is never
 * told it happened. Measured on v387 (2026-08-17), before the fix, driving the
 * real controls:
 *
 *   #wVal    "12abc"   -> weights row kg 12, and profile.weightKg 12
 *   #wVal    "0"       -> weights row kg 0; the 14-day trend jumped from 80.7
 *                         to 56.65 and the rate read -12.67 kg/week; the next
 *                         target recalc gave a protein target of 0 g
 *   #wVal    "-70"     -> stored, silently, "Weight logged"
 *   #qaKcal  "1,234"   -> log row kcal 1.234, rendered on Today as "1"
 *   #qaKcal  "1e9"     -> log row kcal 1000000000
 *   #ffGrams "-70"     -> a custom food with per100.kcal -285.71, forever
 *   #ffKcal  "1e308" + #ffGrams "0.5" -> per100.kcal Infinity in the `foods`
 *                         store; that food's portion sheet then read "NaN" and
 *                         it could never be logged again
 *   #gramsIn "-70"     -> log row kcal -115.5, portionLabel "-70 g"
 *   #qtyIn   1e20      -> log row 1.98e22 kcal, and the amount stuck to the
 *                         food as lastPortion so every future log started there
 *   #pfW     "-70"     -> protein target -154 g, shown and saved
 *   #tKcal   "1e9"     -> the calorie ring's denominator, no ceiling at all
 *
 * THE COMMA IS THE ONE TO READ TWICE. `num` used to do
 * `String(v).replace(',', '.')` unconditionally. That is RIGHT for "1,5", which
 * is how most of the world writes 1.5, and catastrophically wrong for "1,234",
 * which came back as 1.234. Every kcal readout in this app is printed with
 * toLocaleString(), so "1,234" is the app's OWN format, and typing it back into
 * Quick add lost 99.9% of the meal. Both halves are pinned below: a comma
 * decimal must still read as a decimal, and a grouped thousands separator must
 * be REFUSED rather than guessed at. Refusing is the product decision (see the
 * handover note): guessing at intent is what caused the loss.
 *
 * DIRECTION AND BOUND, both stated, because a guard that only refuses is not a
 * guard, it is an outage:
 *   - REFUSE direction, bound ZERO: after a refused value, the number of rows
 *     in the target store must be EXACTLY the baseline. Not "fewer", not
 *     "roughly". A ceiling, not a trend.
 *   - ACCEPT direction: every surface also drives a legitimate value and
 *     asserts the exact number reaches the store. Without this the whole file
 *     would pass on an app that refuses everything, which is the failure mode
 *     a validation change actually has.
 *   - TOLD: a refusal must put a non-empty message on #toast and must leave the
 *     sheet open, because silent coercion is worse than rejection and a player
 *     who has just been refused needs somewhere to land.
 *
 * COVERAGE. Every numeric player input in js/app.js is derived from the source
 * and must appear in FIELDS below, so a new number field that nobody drove
 * FAILS this audit rather than quietly shipping. Undriven fields must state
 * why and are printed on every run so they cannot rot into "covered".
 *
 * PROVE-RED: restore `const num = v => { const x = parseFloat(String(v)
 * .replace(',', '.')); return isFinite(x) ? x : null; };` at js/app.js and drop
 * any one readNum call back to it. The REFUSE rows for that surface go red on
 * the store count, and the TOLD rows go red on the empty toast.
 *
 * Run: node tests/input-validation-audit.mjs [baseUrl]
 */
import { boot, sleep, serveTree, retryOnDetach } from './godmode.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv[2] || process.env.URL;
/* Never run bare: godmode's boot() defaults to the LIVE PRODUCTION site, and
   this audit writes to stores. Serve this tree unless a base was named. */
const srvHandle = argv ? null : await serveTree(ROOT);
const base = argv || srvHandle.url;

const { browser, page } = await boot(base, { headless: process.env.HEADLESS_MODE || 'shell' });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e).split('\n')[0]));

/* Under CPU contention Chrome's CDP flips a frame's execution-context id
   between calls and puppeteer throws "Attempted to use detached Frame" even
   though nothing navigated. That is a harness fault, not this app's, and
   godmode owns the ONE bounded retry for it. This file makes hundreds of
   evaluate calls, so every one goes through it. */
const evalPage = (fn, arg) => retryOnDetach(() => page.evaluate(fn, arg), () => sleep(500));

let bad = 0, checks = 0;
const check = (l, ok, d = '') => { checks++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

const KG_PER_LB = 0.45359237;
const near = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9;

/* ---------------------------------------------------------------- harness */

async function typeInto(sel, value) {
  await page.focus(sel);
  await evalPage(s => {
    const el = document.querySelector(s);
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, sel);
  if (value !== '') await page.keyboard.type(value, { delay: 3 });
  return evalPage(s => document.querySelector(s).value, sel);
}

/* TOASTS ARE A QUEUE WITH ONE SLOT, AND THAT IS A TRAP FOR THIS AUDIT.
   `toast()` pushes onto toastQ and the next message is only painted when the
   current one's timer expires (2.2s, up to 5.2s). Hiding the element does not
   drain the queue, so "clear it, act, read after a sleep" reads the PREVIOUS
   case's message: the first run of this file attributed "Added 200 kcal" to a
   refusal three surfaces later. So: WAIT FOR SILENCE first, then act, then wait
   for the message that must belong to this action. */
async function settleToast(ms = 8000) {
  const t0 = Date.now();
  for (;;) {
    const busy = await evalPage(() => { const t = document.querySelector('#toast'); return !!(t && !t.hidden); });
    if (!busy) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(120);
  }
}
const killToast = async () => { await settleToast(); await evalPage(() => { const t = document.querySelector('#toast'); if (t) { t.hidden = true; t.textContent = ''; } }); };
async function waitToast(ms = 3000) {
  const t0 = Date.now();
  for (;;) {
    const v = await evalPage(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.textContent.trim() : ''; });
    if (v) return v;
    if (Date.now() - t0 > ms) return '';
    await sleep(80);
  }
}

/* A real tap. scrollIntoView first: a below-the-fold button measures fine and a
   mouse click at its coordinates lands in dead space (the portion sheet's Add
   sits at y=1098 in a 932px viewport, and clicking it blind silently did
   nothing for nine of eleven cases the first time this was measured). The real
   mouse also BLURS the focused input, which is part of the behaviour under
   test: the qty field only clamps on blur. */
async function tap(sel) {
  const present = await evalPage(s => {
    const b = document.querySelector(s);
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    return true;
  }, sel);
  if (!present) return false;
  await sleep(220);
  const p = await evalPage(s => {
    const b = document.querySelector(s);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  if (!p) return false;
  await page.mouse.click(p.x, p.y);
  return true;
}

async function closeSheets() {
  for (let i = 0; i < 10; i++) {
    const n = await evalPage(() => document.querySelectorAll('#sheets .sheet').length);
    if (!n) return true;
    await evalPage(() => history.back());
    await sleep(320);
  }
  return false;
}

async function reset(units = 'kg') {
  await evalPage(async u => {
    const { db, kvGet, kvSet } = await import('./js/db.js');
    await db.clear('weights'); await db.clear('log'); await db.clear('foods');
    const s = (await kvGet('settings', null)) || {};
    s.units = u;
    s.profile = { sex: 'm', age: 30, heightCm: 178, weightKg: 82, activity: 'moderate', goal: 'recomp' };
    s.targets = { kcal: 2570, p: 185, c: 298, f: 71 };
    await kvSet('settings', s);
  }, units);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);
  await closeSheets();
}

const storeRows = store => evalPage(async s => (await (await import('./js/db.js')).db.all(s)).length, store);
const settings = () => evalPage(async () => (await (await import('./js/db.js')).kvGet('settings', null)));

/* ------------------------------------------------------------ the matrix */

/* One shared vocabulary of malformed values, so no surface can quietly skip a
   shape. `good` and `goodComma` are per surface: they are the ACCEPT direction
   and they are what stops this file passing on an app that refuses everything. */
const MALFORMED = [
  ['empty', ''],
  ['whitespace', '   '],
  ['partial-parse', '12abc'],           // parseFloat('12abc') === 12
  ['scientific', '1e9'],                // parseFloat('1e9') === 1000000000
  ['grouped-comma', '1,234'],           // THE comma case: was read as 1.234
  ['absurd', '99999999999999999999'],
  ['negative', '-70'],
  ['zero', '0'],
];

/* A surface: how to open it, how to type, how to commit, and what the store
   looked like before. `expectAccept` names the exact number that must land. */
async function runSurface(s) {
  console.log(`\n--- ${s.title} ---`);
  let drove = 0, refusals = 0;
  const skipped = s.skip || [];

  for (const [caseId, value] of MALFORMED) {
    if (s.skip && s.skip.includes(caseId)) continue;
    await s.reset();
    const before = await s.read();
    await s.open();
    await killToast();
    await typeInto(s.field, value);
    await tap(s.commit);
    const toast = await waitToast();
    await sleep(400);
    const after = await s.read();
    const stillOpen = await evalPage(sel => !!document.querySelector(sel), s.commit);
    drove++; refusals++;

    /* REFUSE, bound ZERO: the store is byte-identical to before. */
    check(`${s.id} REFUSE ${caseId.padEnd(14)} "${value}" never reaches the store`,
      JSON.stringify(after) === JSON.stringify(before),
      `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    /* TOLD: silent coercion is worse than rejection. */
    check(`${s.id} TOLD   ${caseId.padEnd(14)} the player is given a reason`,
      toast.length > 0, `toast="${toast}"`);
    if (s.sheet !== false) {
      check(`${s.id} STAY   ${caseId.padEnd(14)} the sheet stays open to land on`,
        stillOpen, `commit control gone: ${s.commit}`);
    }
    await closeSheets();
  }

  /* ACCEPT direction. Without these three the guard could pass by refusing
     everything, which is exactly how a validation change breaks an app. */
  for (const [label, value, expected] of s.accept) {
    await s.reset();
    await s.open();
    await killToast();
    await typeInto(s.field, value);
    await tap(s.commit);
    await waitToast();
    await sleep(500);
    const after = await s.read();
    drove++;
    check(`${s.id} ACCEPT ${label.padEnd(14)} "${value}" stores exactly ${expected}`,
      s.matches(after, expected), `stored=${JSON.stringify(after)}`);
    await closeSheets();
  }

  /* Anti-regression rule 3: an empty sample set is a FAILURE, and so is a
     surface that quietly skipped its way to nothing. Every case is either
     driven or named in `skip` with a reason in the source above. */
  const expected = MALFORMED.length - skipped.length + s.accept.length;
  check(`${s.id} SAMPLE every case was driven or explicitly skipped`,
    drove === expected && refusals >= 5,
    `${drove} driven (${refusals} malformed, ${s.accept.length} legitimate), expected ${expected}; skipped: ${skipped.join(', ') || 'none'}`);
}

/* ------------------------------------------------------- surface drivers */

async function openWeight() {
  await evalPage(() => { location.hash = '#/progress'; });
  await page.waitForSelector('#logWeight', { timeout: 12000 });
  await evalPage(() => document.querySelector('#logWeight').click());
  await page.waitForSelector('#wSave', { timeout: 6000 });
}
const weightRead = () => evalPage(async () => {
  const { db, kvGet } = await import('./js/db.js');
  const w = await db.all('weights');
  const s = await kvGet('settings', null);
  return { rows: w.length, kg: w[0]?.kg ?? null, profileKg: s?.profile?.weightKg ?? null };
});

async function openQuickAdd() {
  await evalPage(() => { location.hash = '#/today'; });
  await page.waitForSelector('[data-addmeal]', { timeout: 12000 });
  await evalPage(() => document.querySelector('[data-addmeal="2"]').click());
  await page.waitForSelector('#actQuick', { timeout: 6000 });
  await evalPage(() => document.querySelector('#actQuick').click());
  await page.waitForSelector('#qaKcal', { timeout: 6000 });
}
const logRead = () => evalPage(async () => {
  const rows = await (await import('./js/db.js')).db.all('log');
  return { rows: rows.length, kcal: rows[0]?.kcal ?? null, p: rows[0]?.p ?? null };
});

async function openFoodForm() {
  await evalPage(() => { location.hash = '#/progress'; });
  await sleep(400);
  await evalPage(() => { location.hash = '#/foods'; });
  await page.waitForSelector('#newFood', { timeout: 12000 });
  await evalPage(() => document.querySelector('#newFood').click());
  await page.waitForSelector('#ffSave', { timeout: 6000 });
  await typeInto('#ffName', 'Audit food');
}
const foodsRead = () => evalPage(async () => {
  const all = await (await import('./js/db.js')).db.all('foods');
  const f = all[0];
  return { rows: all.length, kcal: f?.perServing?.kcal ?? null, per100kcal: f?.per100?.kcal ?? null, g: f?.servings?.[0]?.g ?? null };
});

/* The portion sheet needs a real food with a per100 block so the grams chip
   exists at all. A generic is fine and keeps the run offline. */
async function openPortion(mode) {
  await evalPage(() => { location.hash = '#/today'; });
  await page.waitForSelector('[data-addmeal]', { timeout: 12000 });
  await evalPage(() => document.querySelector('[data-addmeal="2"]').click());
  await page.waitForSelector('#q', { timeout: 6000 });
  await page.focus('#q');
  await page.keyboard.type('chicken breast', { delay: 5 });
  await sleep(650);
  await page.waitForSelector('#results [data-food]', { timeout: 6000 });
  await evalPage(() => document.querySelector('#results [data-food]').click());
  await page.waitForSelector('#addBtn', { timeout: 6000 });
  /* ALWAYS PICK THE CHIP, never assume the sheet opened in the mode we want.
     `food.lastPortion = { ...sel }` mutates the food object on every successful
     add, and GENERIC_FOODS are module-level constants, so a grams add earlier
     in this run leaves the sheet opening in grams mode for the rest of the
     session and #qtyIn simply is not there. */
  const ok = await evalPage(m => {
    const b = m === 'grams'
      ? document.querySelector('#servChips [data-grams]')
      : document.querySelector('#servChips [data-serv="0"]');
    if (!b) return false;
    b.click();
    return true;
  }, mode);
  if (!ok) throw new Error(`the food used by this audit has no ${mode} chip, so that path cannot be driven`);
  await page.waitForSelector(mode === 'grams' ? '#gramsIn' : '#qtyIn', { timeout: 4000 });
}

async function openTargets() {
  await evalPage(() => { location.hash = '#/today'; });
  await sleep(350);
  await evalPage(() => { location.hash = '#/settings'; });
  await page.waitForSelector('#tKcal', { timeout: 12000 });
}
const targetsRead = async () => ({ kcal: (await settings())?.targets?.kcal ?? null });

async function openProfile() {
  await evalPage(() => { location.hash = '#/today'; });
  await sleep(350);
  await evalPage(() => { location.hash = '#/settings'; });
  await page.waitForSelector('#recalc', { timeout: 12000 });
  await evalPage(() => document.querySelector('#recalc').click());
  await page.waitForSelector('#pfSave', { timeout: 6000 });
}
const profileRead = async () => {
  const s = await settings();
  return { weightKg: s?.profile?.weightKg ?? null, age: s?.profile?.age ?? null, targetP: s?.targets?.p ?? null };
};

/* ================================ SURFACES ================================ */

await reset('kg');

await runSurface({
  id: 'WEIGHT-KG', title: 'Log weight, #wVal, units kg (permanent history + profile.weightKg)',
  field: '#wVal', commit: '#wSave',
  reset: async () => { await evalPage(async () => { const { db } = await import('./js/db.js'); await db.clear('weights'); }); await closeSheets(); },
  open: openWeight, read: weightRead,
  accept: [['plain', '82.5', 82.5], ['comma-decimal', '82,5', 82.5], ['integer', '90', 90]],
  matches: (a, e) => a.rows === 1 && near(a.kg, e) && near(a.profileKg, e),
});

await reset('lb');
await runSurface({
  id: 'WEIGHT-LB', title: 'Log weight, #wVal, units lb (the conversion is permanent)',
  field: '#wVal', commit: '#wSave',
  reset: async () => { await evalPage(async () => { const { db } = await import('./js/db.js'); await db.clear('weights'); }); await closeSheets(); },
  open: openWeight, read: weightRead,
  accept: [['plain', '200.5', 200.5 * KG_PER_LB], ['comma-decimal', '200,5', 200.5 * KG_PER_LB]],
  matches: (a, e) => a.rows === 1 && near(a.kg, e) && near(a.profileKg, e),
});

await reset('kg');
await runSurface({
  id: 'QUICK-KCAL', title: 'Quick add, #qaKcal (the app prints kcal as "1,234"; typing it back lost 99.9%)',
  field: '#qaKcal', commit: '#qaAdd',
  reset: async () => { await evalPage(async () => { const { db } = await import('./js/db.js'); await db.clear('log'); }); await closeSheets(); },
  open: openQuickAdd, read: logRead,
  skip: ['zero'], // a 0 kcal quick add is legal (water, black coffee) and is asserted below
  accept: [['plain', '1234', 1234], ['comma-decimal', '1234,5', 1234.5], ['zero', '0', 0]],
  matches: (a, e) => a.rows === 1 && near(a.kcal, e),
});

await runSurface({
  id: 'QUICK-P', title: 'Quick add, #qaP, an OPTIONAL field (blank means 0, "12abc" does not)',
  field: '#qaP', commit: '#qaAdd',
  reset: async () => { await evalPage(async () => { const { db } = await import('./js/db.js'); await db.clear('log'); }); await closeSheets(); },
  open: async () => { await openQuickAdd(); await typeInto('#qaKcal', '200'); },
  read: logRead,
  /* blank IS legal here, and zero IS legal: both mean "no protein", and a
     whitespace-only box is a blank box (a stray spacebar, not a quantity).
     Every OTHER shape must be refused rather than silently coerced to 0. */
  skip: ['empty', 'zero', 'whitespace'],
  accept: [['plain', '30', 30], ['comma-decimal', '30,5', 30.5]],
  matches: (a, e) => a.rows === 1 && near(a.p, e) && near(a.kcal, 200),
});

await runSurface({
  id: 'FOOD-KCAL', title: 'Custom food, #ffKcal (a TEMPLATE: a bad number is re-logged forever)',
  field: '#ffKcal', commit: '#ffSave',
  reset: async () => { await evalPage(async () => { const { db } = await import('./js/db.js'); await db.clear('foods'); }); await closeSheets(); },
  open: openFoodForm, read: foodsRead,
  skip: ['zero'],
  accept: [['plain', '450', 450], ['comma-decimal', '450,5', 450.5], ['zero', '0', 0]],
  matches: (a, e) => a.rows === 1 && near(a.kcal, e),
});

await runSurface({
  id: 'FOOD-GRAMS', title: 'Custom food, #ffGrams (divides into per100: a negative minted negative calories)',
  field: '#ffGrams', commit: '#ffSave',
  reset: async () => { await evalPage(async () => { const { db } = await import('./js/db.js'); await db.clear('foods'); }); await closeSheets(); },
  open: async () => { await openFoodForm(); await typeInto('#ffKcal', '200'); },
  read: foodsRead,
  // grams is optional: blank (and a whitespace-only box) means "serving size unknown"
  skip: ['empty', 'whitespace'],
  accept: [['plain', '50', 400], ['comma-decimal', '12,5', 1600]],
  matches: (a, e) => a.rows === 1 && near(a.per100kcal, e),
});

await runSurface({
  id: 'PORTION-G', title: 'Portion sheet, #gramsIn (a negative logged -115 kcal against the day)',
  field: '#gramsIn', commit: '#addBtn',
  reset: async () => { await evalPage(async () => { const { db } = await import('./js/db.js'); await db.clear('log'); }); await closeSheets(); },
  open: () => openPortion('grams'), read: logRead,
  accept: [['plain', '150', 247.5], ['comma-decimal', '150,5', 248.325]],
  matches: (a, e) => a.rows === 1 && near(a.kcal, e),
});

await runSurface({
  id: 'PORTION-QTY', title: 'Portion sheet, #qtyIn (1e20 servings logged 1.98e22 kcal and stuck as lastPortion)',
  field: '#qtyIn', commit: '#addBtn',
  reset: async () => { await evalPage(async () => { const { db } = await import('./js/db.js'); await db.clear('log'); }); await closeSheets(); },
  open: () => openPortion('serving'), read: logRead,
  /* A BLANK box (and a whitespace-only one, which is a stray spacebar) is the
     only case the field's own blur clamp to 0.25 of a serving still handles,
     and that clamp is asserted separately below rather than left as a hole.
     A typed 0 is not blank and is refused like anything else out of range. */
  skip: ['empty', 'whitespace'],
  accept: [['plain', '1.5', 297], ['comma-decimal', '1,5', 297]],
  matches: (a, e) => a.rows === 1 && near(a.kcal, e),
});

await runSurface({
  id: 'TARGET-KCAL', title: 'Daily targets, #tKcal (the ring denominator: 1e9 made every day read 100% left)',
  field: '#tKcal', commit: '#saveTargets', sheet: false,
  reset: async () => { await closeSheets(); },
  open: openTargets, read: targetsRead,
  skip: [],
  accept: [['plain', '2200', 2200], ['comma-decimal', '2200,4', 2200]],
  matches: (a, e) => a.kcal === e,
});

await reset('kg');
await runSurface({
  id: 'PROFILE-W', title: 'Your plan, #pfW (a negative body weight computed a protein target of -154 g)',
  field: '#pfW', commit: '#pfSave',
  reset: async () => { await closeSheets(); },
  open: openProfile, read: profileRead,
  accept: [['plain', '75', 75], ['comma-decimal', '75,5', 75.5]],
  matches: (a, e) => near(a.weightKg, e) && a.targetP > 0,
});

await reset('kg');
await runSurface({
  id: 'PROFILE-AGE', title: 'Your plan, #pfAge (feeds Mifflin, so it feeds every target)',
  field: '#pfAge', commit: '#pfSave',
  reset: async () => { await closeSheets(); },
  open: openProfile, read: profileRead,
  accept: [['plain', '41', 41]],
  matches: (a, e) => a.age === e,
});

/* The two cases PORTION-QTY skips, asserted rather than left as a hole. A
   BLANK servings box is clamped to 0.25 by the field's own blur handler, and
   the tap that commits is the same gesture that blurs, so the player watches
   the box and the live preview change to a quarter serving before the entry
   lands. That is a coercion, but a VISIBLE one of a field the player left
   empty, which is a different thing from silently rewriting a number they
   typed: a typed 0 or -70 is refused (see PORTION-QTY above). */
console.log('\n--- PORTION QTY BLUR CLAMP ---');
for (const [label, typed] of [['empty', ''], ['spaces', '   ']]) {
  await evalPage(async () => { const { db } = await import('./js/db.js'); await db.clear('log'); });
  await closeSheets();
  await openPortion('serving');
  await killToast();
  await typeInto('#qtyIn', typed);
  await tap('#addBtn');
  await waitToast();
  await sleep(500);
  const r = await evalPage(async () => {
    const rows = await (await import('./js/db.js')).db.all('log');
    return { rows: rows.length, qty: rows[0]?.sel?.qty ?? null, label: rows[0]?.portionLabel ?? null };
  });
  check(`QTY-BLUR ${label.padEnd(6)} clamps to 0.25 of a serving, visibly, not to 0 or NaN`,
    r.rows === 1 && r.qty === 0.25 && /0\.25/.test(r.label || ''),
    `stored=${JSON.stringify(r)}`);
  await closeSheets();
}

/* ============ THE COMMA, PINNED SEPARATELY AND BOTH WAYS ============ */
console.log('\n--- THE COMMA CASE ---');
await reset('kg');
await openWeight();
await killToast();
await typeInto('#wVal', '82,5');
await tap('#wSave');
await waitToast();
await sleep(600);
const commaW = await weightRead();
check('COMMA  a decimal comma is READ AS A DECIMAL: "82,5" stores 82.5, not 82 and not 825',
  commaW.rows === 1 && near(commaW.kg, 82.5), `stored=${JSON.stringify(commaW)}`);
await closeSheets();

await reset('kg');
await openWeight();
await killToast();
await typeInto('#wVal', '82,500');
const groupedTap = await tap('#wSave');
const groupedToast = await waitToast();
await sleep(500);
const groupedW = await weightRead();
check('COMMA  a GROUPED thousands comma is refused, never guessed: "82,500" writes nothing',
  groupedTap && groupedW.rows === 0, `stored=${JSON.stringify(groupedW)}`);
check('COMMA  and the refusal names the fix rather than just failing',
  /comma/i.test(groupedToast), `toast="${groupedToast}"`);
await closeSheets();

/* ============ DOWNSTREAM: follow the bad value to a rendered number ============ */
console.log('\n--- DOWNSTREAM ---');
await reset('kg');
/* Seed 14 honest days so the trend and the per-week rate have something real to
   be poisoned. Measured pre-fix: logging 0 kg on day 15 moved the smoothed
   trend from 80.7 to 56.65 and the rate to -12.67 kg/week, and dropped the
   next recalc's protein target to 0 g. */
const appToday = await evalPage(async () => (await import('./js/nutrition.js')).dateKey());
await evalPage(async today => {
  const { db } = await import('./js/db.js');
  const { addDays } = await import('./js/nutrition.js');
  for (let i = 14; i >= 1; i--) await db.put('weights', { date: addDays(today, -i), kg: 82 - (14 - i) * 0.1 });
}, appToday);
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2400);
await closeSheets();

const trendNow = () => evalPage(async () => {
  const { db, kvGet } = await import('./js/db.js');
  const { weightTrend, trendRatePerWeek, computeTargets } = await import('./js/nutrition.js');
  const w = (await db.all('weights')).sort((a, b) => a.date.localeCompare(b.date));
  const t = weightTrend(w);
  const s = await kvGet('settings', null);
  return {
    rows: w.length,
    trend: t.length ? t[t.length - 1].trend : null,
    rate: trendRatePerWeek(t),
    profileKg: s?.profile?.weightKg,
    recalcProtein: computeTargets(s.profile).p,
  };
});
const beforeTrend = await trendNow();
await openWeight();
await killToast();
await typeInto('#wVal', '0');
await tap('#wSave');
const zeroToast = await waitToast();
await sleep(600);
const afterTrend = await trendNow();
await closeSheets();
check('TRACE  weight "0" never joins the series (rows unchanged)',
  afterTrend.rows === beforeTrend.rows, `${beforeTrend.rows} -> ${afterTrend.rows}`);
check('TRACE  the smoothed trend line the player reads is untouched',
  near(afterTrend.trend, beforeTrend.trend), `${beforeTrend.trend} -> ${afterTrend.trend}`);
check('TRACE  the per-week rate is untouched (pre-fix it read -12.67 kg/week)',
  near(afterTrend.rate, beforeTrend.rate), `${beforeTrend.rate} -> ${afterTrend.rate}`);
check('TRACE  profile.weightKg is untouched, so the next recalc still has a body',
  near(afterTrend.profileKg, beforeTrend.profileKg) && afterTrend.recalcProtein > 0,
  `profileKg ${beforeTrend.profileKg} -> ${afterTrend.profileKg}, protein target ${afterTrend.recalcProtein}`);
check('TRACE  and the player was told why', zeroToast.length > 0, `toast="${zeroToast}"`);

/* CONTROL: the same path with a real number MUST move all of it, otherwise
   every TRACE row above passes on a dead Save button. */
await openWeight();
await killToast();
await typeInto('#wVal', '79.4');
await tap('#wSave');
await waitToast();
await sleep(700);
const controlTrend = await trendNow();
await closeSheets();
check('CONTROL a legitimate weight DOES reach the store and DOES move the trend',
  controlTrend.rows === beforeTrend.rows + 1 && !near(controlTrend.trend, beforeTrend.trend) && near(controlTrend.profileKg, 79.4),
  `rows ${beforeTrend.rows} -> ${controlTrend.rows}, trend ${beforeTrend.trend} -> ${controlTrend.trend}, profileKg=${controlTrend.profileKg}`);

/* The grouped-comma quick add, followed to the number on Today. */
await reset('kg');
await openQuickAdd();
await killToast();
await typeInto('#qaKcal', '1,234');
await typeInto('#qaName', 'Steakhouse');
await tap('#qaAdd');
const qaToast = await waitToast();
await sleep(500);
const qaAfter = await logRead();
await closeSheets();
check('TRACE  quick add "1,234" writes nothing (pre-fix it wrote 1.234 kcal and Today rendered "1")',
  qaAfter.rows === 0, `rows=${qaAfter.rows} kcal=${qaAfter.kcal}`);
check('TRACE  and the player is told to drop the comma',
  /comma/i.test(qaToast), `toast="${qaToast}"`);

/* ============ OVERFLOW: a food can no longer poison itself ============ */
console.log('\n--- OVERFLOW ---');
await reset('kg');
await openFoodForm();
await killToast();
await typeInto('#ffKcal', '1e308');
await typeInto('#ffGrams', '0.5');
await tap('#ffSave');
const ovToast = await waitToast();
await sleep(700);
const ov = await evalPage(async () => {
  const all = await (await import('./js/db.js')).db.all('foods');
  const f = all[0];
  return {
    rows: all.length,
    perServingFinite: f ? isFinite(f.perServing?.kcal) : null,
    per100Finite: f && f.per100 ? isFinite(f.per100.kcal) : null,
  };
});
check('OVERFLOW 1e308 kcal over a 0.5 g serving never mints a food at all',
  ov.rows === 0, `${ov.rows} food rows, per100 finite: ${ov.per100Finite}`);
check('OVERFLOW and the player is told, rather than getting a food that reads "NaN" forever',
  ovToast.length > 0, `toast="${ovToast}"`);
await closeSheets();

/* ============ COVERAGE: a new number field nobody drove must FAIL ============ */
console.log('\n--- COVERAGE ---');
/* Derived from the source, not from a list somebody remembered to update. Two
   shapes, because openFoodForm builds its fields through a helper:
     <input id="X" type="text" inputmode="numeric|decimal">
     fld('X', 'Label', 'key', ...)                                             */
const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const found = new Set();
for (const m of src.matchAll(/id="([A-Za-z0-9_]+)"[^>]*\binputmode="(?:numeric|decimal)"/g)) found.add(m[1]);
for (const m of src.matchAll(/\bfld\(\s*'([A-Za-z0-9_]+)'/g)) found.add(m[1]);

/* Every field, with its verdict. DRIVEN means a surface above types into it.
   Anything else must say why, and is printed on every run so it cannot rot. */
const FIELDS = {
  wVal: 'DRIVEN  WEIGHT-KG + WEIGHT-LB',
  qaKcal: 'DRIVEN  QUICK-KCAL',
  qaP: 'DRIVEN  QUICK-P',
  qaC: 'SIBLING same readNum call shape as qaP, same LIMITS.macroG, same handler, driven once',
  qaF: 'SIBLING same readNum call shape as qaP, same LIMITS.macroG, same handler, driven once',
  ffKcal: 'DRIVEN  FOOD-KCAL',
  ffGrams: 'DRIVEN  FOOD-GRAMS',
  ffP: 'SIBLING same macro() wrapper as ffFib/ffSug, one bound, driven through FOOD-KCAL save path',
  ffC: 'SIBLING same macro() wrapper',
  ffF: 'SIBLING same macro() wrapper',
  ffFib: 'SIBLING same macro() wrapper',
  ffSug: 'SIBLING same macro() wrapper',
  ffNa: 'SIBLING same macro() wrapper, LIMITS.sodiumMg',
  gramsIn: 'DRIVEN  PORTION-G',
  qtyIn: 'DRIVEN  PORTION-QTY',
  tKcal: 'DRIVEN  TARGET-KCAL',
  tP: 'SIBLING same readNum call shape as tKcal, LIMITS.macroG',
  tC: 'SIBLING same readNum call shape as tKcal, LIMITS.macroG',
  tF: 'SIBLING same readNum call shape as tKcal, LIMITS.macroG',
  pfW: 'DRIVEN  PROFILE-W',
  pfAge: 'DRIVEN  PROFILE-AGE',
  pfCm: 'SIBLING same profileProblem() gate as pfW, LIMITS.heightCm',
  pfFt: 'SIBLING same profileProblem() gate, folded into heightCm',
  pfIn: 'SIBLING same profileProblem() gate, folded into heightCm',
  manualCode: 'NOT-A-QUANTITY  a barcode, stripped to digits with /\\D/g and length-gated at 8; it never becomes a stored number',
  nbNumVal: 'NOT-A-QUANTITY  the lucky number in a display name; stripped to digits live, maxlength 3, never enters a food or weight store',
};
check('COVERAGE the source yielded numeric fields at all (empty set is a failure)',
  found.size >= 20, `${found.size} fields found in js/app.js`);
const unregistered = [...found].filter(f => !FIELDS[f]);
check('COVERAGE every numeric player input in js/app.js is registered here',
  unregistered.length === 0, unregistered.length ? `unregistered: ${unregistered.join(', ')}` : '');
const stale = Object.keys(FIELDS).filter(f => !found.has(f));
check('COVERAGE and no registered field has been deleted from the app',
  stale.length === 0, stale.length ? `gone from source: ${stale.join(', ')}` : '');
console.log('  fields and verdicts:');
for (const f of [...found].sort()) console.log(`    ${f.padEnd(12)} ${FIELDS[f] || 'UNREGISTERED'}`);

check('NO PAGE ERRORS during the whole run', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
if (srvHandle) srvHandle.close();
console.log(`\n${checks} checks`);
console.log(bad ? `${bad} FAILED` : 'INPUT VALIDATION VERIFIED');
process.exit(bad ? 1 : 0);

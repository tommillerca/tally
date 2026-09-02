/* THE PLAN FORM'S SHARP EDGES, driven through the real controls on a virgin
 * install. 2026-09-02.
 *
 * WHY THIS FILE. A 100-persona onboarding census (2026-09-02) found five defects
 * on a screen that otherwise works: 100 of 100 personas reached a working
 * profile and every target floored correctly, so nothing here is about the form
 * being broken. It is about the form quietly storing a body the player did not
 * enter. onb-audit.mjs already drives the funnel end to end; it never touches
 * the unit segment, so none of this was visible to it.
 *
 * WHAT EACH ROW PROVES, and how it dies:
 *   DOUBLE-TAP     re-tapping the ALREADY-LIT unit button does not convert the
 *                  weight. Measured pre-fix on origin/main 6bf08cc: select kg,
 *                  type 80, tap "kg / cm" again, field reads 36.3 and Save
 *                  stores weightKg 36.3 / 1,920 kcal / 80 g protein for an 80 kg
 *                  person. A guard that only tested ONE switch passed
 *                  throughout this bug's life, so this drives the SECOND tap and
 *                  compares the saved body against a single-tap run of the same
 *                  input.
 *   CONTROL        an HONEST switch still converts. Without this row every
 *                  DOUBLE-TAP assertion above would also pass on a form whose
 *                  unit segment did nothing at all.
 *   HEIGHT-FOLLOWS the height survives a unit switch. Pre-fix, switchUnits()
 *                  converted the weight only and merely toggled the two height
 *                  fields hidden, so 165 cm silently became the 5'10 render
 *                  default and 5'10 saved.
 *   CHIPS-TRUTH    the Activity and Goal chips lit on the form ARE what Save
 *                  stores. Pre-fix nothing lit while moderate/recomp saved. This
 *                  is also the drift guard between profileFormHtml's defaults
 *                  and bindProfileForm's, which are two separate literals.
 *   REROLL-RESUMES the name on screen when you quit is the name you come back
 *                  to. Pre-fix the step-1 stamp always wrote pick:null.
 *   STEP-TOP       every onboarding step opens at its own top, at three widths.
 *
 * THE WEBDRIVER MASK. CALM_BOOT and NOSOCIAL both key off navigator.webdriver
 * (js/app.js), so an unmasked run exercises the calm boot rather than the first
 * run a player gets. The mask is installed before app.js parses and asserted in
 * page; MASK below is a hard row, not a comment.
 *
 * It arrives through godmode's maskWebdriver, which brings the egress wall with
 * it, and that is not cosmetic here: NOSOCIAL off plus no ?api= override means
 * PROD_API, and the seven virgin installs below each used to boot, finish
 * onboarding and register a real account against the production Worker.
 *
 * PROVE-RED (run 2026-09-02, on a cp -R copy of origin/main 6bf08cc): DOUBLE-TAP,
 * DOUBLE-TAP-SAVED, HEIGHT-FOLLOWS, CHIPS-TRUTH, REROLL-RESUMES and STEP-TOP all
 * fail; MASK and CONTROL stay green, which is what says the harness was looking
 * in the right place.
 *
 * Usage: node tests/profile-units-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveTree, loadPuppeteer, chromePath, sandboxArgs, sleep, maskWebdriver } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const puppeteer = await loadPuppeteer();

let srvHandle = null;
let base = process.env.URL;
if (!base) { srvHandle = await serveTree(ROOT); base = srvHandle.url; }
base = base.replace(/\/?$/, '/');

const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'new',
  executablePath: chromePath(),
  args: sandboxArgs(),
});
const errors = [];
const masks = [];

/* A virgin IndexedDB per run, with navigator.webdriver reading false BEFORE
   app.js runs. Every page records whether the mask took, so MASK below grades
   the whole suite rather than one page. */
async function freshPage(w = 390, h = 844) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await maskWebdriver(p);
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on('pageerror', e => { errors.push(e.message); console.log('  PAGEERROR:', e.message.slice(0, 140)); });
  await p.goto(base, { waitUntil: 'networkidle2' });   // NO ?demo: onboarding only exists on a virgin install
  await sleep(2600);
  masks.push(await p.evaluate(() => navigator.webdriver));
  return p;
}
const click = (p, id) => p.evaluate(i => document.getElementById(i)?.click(), id);
const val = (p, id) => p.evaluate(i => document.getElementById(i)?.value ?? null, id);
const setV = (p, id, v) => p.evaluate((i, x) => {
  const e = document.getElementById(i); if (!e) return false;
  e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); return true;
}, id, v);
const toPlan = async p => { await click(p, 'onbGo'); await sleep(800); await click(p, 'onbMe'); await sleep(1000); };
const savedProfile = p => p.evaluate(async () => {
  const db = await import('./js/db.js');
  const s = await db.kvGet('settings', null);
  return s ? { weightKg: s.profile.weightKg, heightCm: s.profile.heightCm,
               activity: s.profile.activity, goal: s.profile.goal, kcal: s.targets?.kcal } : null;
});

/* ---------- run A: the honest single tap, and the chips as rendered -------- */
let p = await freshPage();
await toPlan(p);
const chips = await p.evaluate(() => ({
  act: [...document.querySelectorAll('#pfAct .chip.on')].map(c => c.dataset.act),
  goal: [...document.querySelectorAll('#pfGoal .chip.on')].map(c => c.dataset.goal),
}));
await click(p, 'pfKg'); await sleep(300);
await setV(p, 'pfW', '80'); await setV(p, 'pfCm', '180'); await setV(p, 'pfAge', '30');
await sleep(500);
await click(p, 'onbSave'); await sleep(2600);
const single = await savedProfile(p);
await p.browserContext().close();

/* ---------- run B: the SAME input, with the lit button tapped again -------- */
p = await freshPage();
await toPlan(p);
await click(p, 'pfKg'); await sleep(300);
await setV(p, 'pfW', '80'); await sleep(300);
const wBefore = await val(p, 'pfW');
await click(p, 'pfKg'); await sleep(400);          // the confirming tap: kg was already lit
const wAfter = await val(p, 'pfW');
await setV(p, 'pfCm', '180'); await setV(p, 'pfAge', '30'); await sleep(500);
await click(p, 'onbSave'); await sleep(2600);
const doubled = await savedProfile(p);
await p.browserContext().close();

ok('SETUP both weight samples were actually read from the rendered field',
  !!wBefore && !!wAfter && !!single && !!doubled,
  `before=${wBefore} after=${wAfter} single=${JSON.stringify(single)} double=${JSON.stringify(doubled)}`);
ok('DOUBLE-TAP re-tapping the already-lit unit leaves the weight field alone',
  wBefore === wAfter, `${wBefore} -> ${wAfter}`);
ok('DOUBLE-TAP-SAVED the stored body is the same as the single-tap run',
  single && doubled && Math.abs(single.weightKg - doubled.weightKg) < 0.05 && single.kcal === doubled.kcal,
  `single ${single?.weightKg}kg/${single?.kcal}kcal  vs double ${doubled?.weightKg}kg/${doubled?.kcal}kcal`);

/* ---------- run C: the honest switch (control) and the height ------------- */
p = await freshPage();
await toPlan(p);
await click(p, 'pfKg'); await sleep(300);
await setV(p, 'pfW', '70'); await setV(p, 'pfCm', '165'); await setV(p, 'pfAge', '30');
await sleep(400);
const cmTyped = await val(p, 'pfCm'), kgTyped = await val(p, 'pfW');
await click(p, 'pfLb'); await sleep(500);           // a REAL change of unit
const lbShown = await val(p, 'pfW');
const ftShown = await val(p, 'pfFt'), inShown = await val(p, 'pfIn');
await click(p, 'onbSave'); await sleep(2600);
const cRun = await savedProfile(p);
await p.browserContext().close();

/* THE CONTROL. Every DOUBLE-TAP row above would also pass on a unit segment that
   had been broken to do nothing at all, which is the cheapest way to make this
   suite lie. 70 kg reads as 154 lb, so an honest switch MUST move the field. */
ok('CONTROL an honest change of unit still converts the weight',
  kgTyped === '70' && Math.abs(Number(lbShown) - 154.3) < 1.5, `${kgTyped} kg -> ${lbShown} lb`);
/* 178 cm / 5'10 is profileFormHtml's render default (js/app.js, the `p.heightCm
   || 178` fallback and the Skip line's stated body). Pre-fix that default was
   what a cm-then-switch player shipped, so the row asserts BOTH that the typed
   height came through and that the default is not what came through. */
const ftInCm = (Number(ftShown) * 12 + Number(inShown)) * 2.54;
ok('HEIGHT-FOLLOWS the typed height survives a unit switch, the 5\'10 default does not replace it',
  cmTyped === '165' && Math.abs(ftInCm - 165) < 2.6 && cRun && Math.abs(cRun.heightCm - 165) < 2.6,
  `typed ${cmTyped}cm -> shown ${ftShown}'${inShown}" (${ftInCm.toFixed(1)}cm) -> saved ${cRun?.heightCm}cm`);

/* THE FORM SAYS WHAT IT SAVES. Two rendered states: the chips lit on the freshly
   rendered form (run A, before anything was touched) against the activity and
   goal that run A's Save actually stored without either being picked. */
ok('CHIPS-TRUTH exactly one Activity and one Goal chip is lit on the fresh form',
  chips.act.length === 1 && chips.goal.length === 1, JSON.stringify(chips));
ok('CHIPS-TRUTH the lit chips are the values an untouched Save stores',
  chips.act[0] === single?.activity && chips.goal[0] === single?.goal,
  `lit ${chips.act[0]}/${chips.goal[0]}  saved ${single?.activity}/${single?.goal}`);

/* ---------- run D: quitting on the reveal keeps the name on screen -------- */
p = await freshPage();
await click(p, 'onbGo'); await sleep(900);
const firstName = await p.evaluate(() => document.getElementById('onbName')?.textContent || '');
let rolled = firstName;
for (let i = 0; i < 5 && rolled === firstName; i++) {
  await click(p, 'onbReroll'); await sleep(300);
  rolled = await p.evaluate(() => document.getElementById('onbName')?.textContent || '');
}
await p.reload({ waitUntil: 'networkidle2' }); await sleep(3000);
const resumed = await p.evaluate(() => document.getElementById('onbName')?.textContent || '');
await p.browserContext().close();
ok('SETUP the reroll moved the name, so there is something to lose',
  !!firstName && rolled !== firstName, `${firstName} -> ${rolled}`);
ok('REROLL-RESUMES relaunching brings back the name that was on screen',
  !!resumed && resumed === rolled, `on screen ${rolled}  after relaunch ${resumed}`);

/* ---------- runs E-G: every step opens at its own top --------------------- */
/* Three widths, the census set (2026-09-02): 390x844 is the modern default,
   375x667 the iPhone SE 2/3 and 320x568 the SE 1, which is the shortest screen
   the app still supports. REAL taps, not element.click(): a tap scrolls its
   target into view exactly as a thumb reaching a bottom-of-page CTA does, and
   that scroll is what used to survive into the next step. */
const tops = [];
for (const [w, h] of [[390, 844], [375, 667], [320, 568]]) {
  p = await freshPage(w, h);
  const backTop = () => p.evaluate(() => {
    const b = document.getElementById('onbBack');
    return b ? Math.round(b.getBoundingClientRect().top) : null;
  });
  const realTap = async sel => { const el = await p.$(sel); if (el) await el.tap(); };
  await realTap('#onbGo'); await sleep(900);
  const s1 = await backTop();
  await realTap('#onbMe'); await sleep(1100);
  const s2 = await backTop();
  tops.push({ w, h, s1, s2 });
  await p.browserContext().close();
}
ok('SETUP the back arrow was found on both steps at all three widths',
  tops.length === 3 && tops.every(t => t.s1 != null && t.s2 != null), JSON.stringify(tops));
/* Two RENDERED states, not a pinned pixel: step 1 is reached without scrolling
   at every width, so its arrow position IS the correct one, and step 2's must
   match it. Pre-fix at 320x568 step 1 read 30 and step 2 read -203. */
ok('STEP-TOP the plan step opens at the same top as the reveal, at every width',
  tops.every(t => t.s1 > 0 && Math.abs(t.s2 - t.s1) <= 2),
  tops.map(t => `${t.w}x${t.h} step1=${t.s1} step2=${t.s2}`).join('  '));

ok('MASK navigator.webdriver read false on every page, so this is the real first run',
  masks.length >= 7 && masks.every(m => m === false), `${masks.length} pages: ${[...new Set(masks)].join(',')}`);
ok('NO page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
if (srvHandle) srvHandle.close();
const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join(', ')); process.exit(1); }
console.log('profile-units-audit clean');

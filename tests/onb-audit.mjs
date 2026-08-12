/* Onboarding audit: the launch funnel, driven for real on a FRESH profile.
 *
 * WHY. Onboarding is the highest-leverage screen for going public (Tom's stated
 * main goal, 2026-08-07) and it is only reachable on a virgin IndexedDB, which
 * no other suite ever sees: screen-sweep and t1/t2 all boot ?demo. A regression
 * here is invisible everywhere else and costs installs, not sessions.
 *
 * WHAT IT PROVES, and how each check dies:
 *   STEP-1 HOOK      the character poster + restore path exist. Kill the
 *                    onbRestore wiring and RESTORE fails.
 *   STEP-2 REVEAL    the reroll actually changes the generated name (a dead
 *                    reroll renders fine and does nothing), and the pick is
 *                    stashed for the Crew name builder.
 *   STEP-3 PLAN      filling the real form computes real targets, START lands
 *                    on Today with settings persisted.
 *   HONEST SKIP      skipping states the default body in the toast, and the
 *                    saved profile IS that body (30 / 178cm / ~180lb).
 *   BACK             steps 2 and 3 can go back without losing the name pick.
 *
 * PROVE-RED (run 2026-08-07): remove the syncTalent-style reroll listener or
 * stub randomName to a constant and REROLL fails; break saveInitialSettings and
 * PLAN-SAVED fails.
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serveTree, loadPuppeteer } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* puppeteer via godmode's loadPuppeteer: the repo's own node_modules first so a
   fresh clone works after `npm install`, the overlay-render-kit as fallback so the
   already-configured machines need no install. Each of these files used to carry
   its OWN copy of a hardcoded path into a sibling project. */
const puppeteer = await loadPuppeteer();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let srv = null, srvHandle = null;
let base = process.env.URL;
if (!base) {
  /* serveTree: a free port from the OS, and a HARD ERROR if python never
     bound. The hard-coded port with stdio:'ignore' meant a stranded server
     already holding it made this audit talk to whatever was listening. */
  srvHandle = await serveTree(ROOT);
  srv = { kill: () => srvHandle.close() };
  base = srvHandle.url;
}
base = base.replace(/\/?$/, '/');
const sh = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;

const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

const browser = await puppeteer.launch({
  headless: 'new',
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});
const errors = [];

async function freshPage() {
  const ctx = await browser.createBrowserContext();   // its own storage: a virgin install
  const p = await ctx.newPage();
  p.on('pageerror', e => { errors.push(e.message); console.log('  PAGEERROR:', e.message.slice(0, 140)); });
  await p.goto(base, { waitUntil: 'networkidle2' });  // NO ?demo
  await sleep(2400);
  return p;
}
const shot = async (p, n) => { if (sh) await p.screenshot({ path: path.join(sh, `onb-${n}.png`) }); };

/* ---------- run 1: the full happy path ---------- */
let p = await freshPage();
ok('STEP-1 fresh install lands on onboarding', await p.evaluate(() => !!document.querySelector('.onb')));
ok('STEP-1 the character poster renders its layers', await p.evaluate(() =>
  document.querySelectorAll('.onb-poster img.ly').length >= 5 &&
  [...document.querySelectorAll('.onb-poster img.ly')].every(i => i.naturalWidth > 0)));
await p.evaluate(() => document.getElementById('onbRestore')?.click());
await sleep(1200);
ok('RESTORE opens the recovery sheet from screen 1', await p.evaluate(() =>
  !!document.querySelector('.sheet') && /recovery id/i.test(document.querySelector('.sheet').innerText)));
await p.evaluate(() => history.back());
await sleep(800);
await shot(p, '1');

await p.evaluate(() => document.getElementById('onbGo')?.click());
await sleep(900);
const name1 = await p.evaluate(() => document.getElementById('onbName')?.textContent);
ok('STEP-2 the reveal shows a generated name', !!name1 && name1.length > 3, name1);
// reroll until the name changes: two random picks CAN collide, so one identical
// draw is not a failure, but five in a row means the reroll is dead
let name2 = name1;
for (let i = 0; i < 5 && name2 === name1; i++) {
  await p.evaluate(() => document.getElementById('onbReroll')?.click());
  await sleep(300);
  name2 = await p.evaluate(() => document.getElementById('onbName')?.textContent);
}
ok('STEP-2 REROLL actually changes the name', name2 !== name1, `${name1} -> ${name2}`);
ok('STEP-2 the bare starter has no gear layers', await p.evaluate(() =>
  document.querySelectorAll('.onb-poster.bare img.ly').length === 2));
await shot(p, '2');

// back keeps the pick
await p.evaluate(() => document.getElementById('onbBack')?.click());
await sleep(700);
await p.evaluate(() => document.getElementById('onbGo')?.click());
await sleep(700);
const nameBack = await p.evaluate(() => document.getElementById('onbName')?.textContent);
ok('BACK returning to the reveal keeps the same name', nameBack === name2, `${nameBack}`);

await p.evaluate(() => document.getElementById('onbMe')?.click());
await sleep(900);
ok('STEP-3 the plan form renders', await p.evaluate(() => !!document.getElementById('pfAge')));
await p.evaluate(() => {
  const set = (id, v) => { const e = document.getElementById(id); if (!e) return; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
  set('pfAge', '29'); set('pfFt', '5'); set('pfIn', '10'); set('pfW', '180');
});
await sleep(700);
const preview = await p.evaluate(() => document.getElementById('pfPreview')?.textContent || '');
ok('STEP-3 the live preview computed real targets', /\d{3,4}/.test(preview), preview.slice(0, 60));
await shot(p, '3');
await p.evaluate(() => document.getElementById('onbSave')?.click());
await sleep(2600);
const landed = await p.evaluate(async () => {
  const db = (await import('./js/db.js'));
  const s = await db.kvGet('settings', null);
  const pick = await db.kvGet('onbName', null);
  return { hash: location.hash, saved: !!s, age: s?.profile?.age, tabbar: getComputedStyle(document.getElementById('tabbar')).display !== 'none', pick: !!pick };
});
ok('PLAN-SAVED start lands on Today with settings persisted',
   landed.hash.includes('today') && landed.saved && landed.age === 29 && landed.tabbar, JSON.stringify(landed));
ok('NAME-STASHED the pick is stored for the Crew name builder', landed.pick);
await p.browserContext().close();

/* ---------- run 2: the honest skip ---------- */
p = await freshPage();
await p.evaluate(() => document.getElementById('onbGo')?.click()); await sleep(700);
await p.evaluate(() => document.getElementById('onbMe')?.click()); await sleep(700);
const skipText = await p.evaluate(() => document.getElementById('onbSkip')?.textContent || '');
ok('HONEST-SKIP the skip states the default body up front', /30 yr/.test(skipText) && /180 lb/.test(skipText), skipText.slice(0, 70));
/* v278 gave the toast a QUEUE, so a single read at a fixed time now sees
   whichever message is at the head (a boot tip fires before the welcome kit and
   is no longer stomped). Observe the slot for the whole window instead: the
   contract is that the welcome kit is SAID, not that it is said first. */
await p.evaluate(() => {
  window.__toasts = [];
  const t = document.getElementById('toast');
  new MutationObserver(() => { if (!t.hidden && t.textContent) window.__toasts.push(t.textContent); })
    .observe(t, { childList: true, attributes: true, characterData: true, subtree: true });
});
await p.evaluate(() => document.getElementById('onbSkip')?.click());
await sleep(7000);
const skipped = await p.evaluate(async () => {
  const db = (await import('./js/db.js'));
  const s = await db.kvGet('settings', null);
  return { saved: !!s, h: s?.profile?.heightCm, kg: Math.round(s?.profile?.weightKg || 0), toast: [...new Set(window.__toasts)].join(' | ') };
});
ok('HONEST-SKIP saved profile IS the stated body', skipped.saved && skipped.h === 178 && skipped.kg === 82, JSON.stringify(skipped));
/* the defaults statement lives in the skip line BEFORE the tap (asserted above);
   after it, the single toast slot belongs to the welcome kit. A defaults toast
   here was being stomped unread at +1.2s, so it was removed rather than queued. */
ok('HONEST-SKIP the welcome kit still greets the skipper', /welcome kit/i.test(skipped.toast), skipped.toast.slice(0, 60));
await p.browserContext().close();

ok('NO page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join(', ')); process.exit(1); }
console.log('onb-audit clean');

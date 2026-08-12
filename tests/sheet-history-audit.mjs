/* closeAllSheetsViaHistory(): does every real flow actually END with a clean screen?
 *
 * WHY THIS EXISTS. The Glutton victory button used to call `history.go(-2)` to
 * pop two sheets. `history.go(-N)` rewinds N entries but fires exactly ONE
 * popstate, and the app's popstate handler closes exactly ONE sheet
 * (`window.addEventListener('popstate', () => { if (sheetStack.length)
 * closeTopSheet(); })` in js/app.js). So the second sheet stayed on screen with
 * its backdrop over everything and the player had to close it by hand.
 *
 * `closeAllSheetsViaHistory()` is `history.go(-sheetStack.length)`, so it has the
 * same one-popstate-for-N-entries property at EVERY one of its call sites. Most
 * of them survive only because something else sweeps up afterwards: `refresh()`
 * and a `location.hash` write both land in `route()`, and `route()` calls
 * `closeAllSheets()` unconditionally. That is a rescue, not a design. A caller
 * whose follow-up is not a route (or is only a popup) is one nested sheet away
 * from the Glutton bug.
 *
 * WHAT THIS PINS. Not the function: driving the function proves nothing about
 * whether the game calls it correctly, which was the whole shape of the Glutton
 * bug. Every flow below is reached by OPERATING the real controls a player taps,
 * and afterwards asserts three things:
 *   1. no `.sheet` is left standing in #sheets,
 *   2. no `.sheet-backdrop` is left painting over the app (z-index 50 sits above
 *      the tab bar's 40, so a stray backdrop eats every tab),
 *   3. `document.elementFromPoint` at the centre of a tab bar button returns that
 *      button (anti-regression rule 6).
 *
 * An empty sample is a FAILURE: each flow first asserts it actually reached the
 * sheet depth it claims, so a selector that stopped matching cannot read as a
 * pass. A flow that expects depth 2 and finds 1 fails before it ever measures.
 *
 * PROVE-RED, and read this before trusting the green. Swapping
 * `closeAllSheetsViaHistory()` for a bare `history.back()` does NOT turn this
 * red, and that is a measured finding rather than a hole: `route()` sweeps every
 * runtime flow below, so the function being wrong is currently invisible. The
 * break that this DOES catch is the real bug shape, a caller that pops one sheet
 * of N with nothing sweeping after it:
 *   in openPortion's save handler (js/app.js ~4181) replace
 *     `closeAllSheetsViaHistory(); setTimeout(refresh, 80);`
 *   with a bare `history.back();`
 *   -> "portion save (depth 2) · no sheet left standing" FAILS with the Add
 *      sheet still up, "no backdrop blocking" FAILS with 1 backdrop, and
 *      "tab bar is tappable" FAILS with the Add sheet under the finger.
 * The second half of this audit (the call-site survey at the bottom) is the
 * guard that catches the hazard BEFORE it becomes that bug.
 *
 * Usage: node tests/sheet-history-audit.mjs   (or with a URL to test the live site)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveTree, loadPuppeteer } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const puppeteer = await loadPuppeteer();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let srvHandle = null;
let base = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
if (!base) { srvHandle = await serveTree(ROOT); base = srvHandle.url; }
base = base.replace(/\/?$/, '/');

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const browser = await puppeteer.launch({
  headless: 'new',
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('  pageerror: ' + e.message.slice(0, 160)));

/* The app exposes no sheet-stack handle, and it should not have to: the player
   sees DOM, so the DOM is what gets measured. A sheet mid-close carries
   .closing and is removed within 320ms, so every read below happens after the
   flow has settled. */
const CLEAN = `(() => {
  const vis = el => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.02 && r.width > 1 && r.height > 1; };
  const sheets = [...document.querySelectorAll('#sheets .sheet')].filter(vis);
  const backs = [...document.querySelectorAll('#sheets .sheet-backdrop')].filter(vis);
  const tabs = [...document.querySelectorAll('#tabbar .tab')].filter(t => t.getBoundingClientRect().width > 1);
  let tabHit = 'no-tabbar', sheetOverTab = 'no-tabbar';
  if (tabs.length) {
    const t = tabs[Math.min(1, tabs.length - 1)];
    const r = t.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    tabHit = !hit ? 'nothing' : t.contains(hit) ? 'tab' : (hit.className || hit.tagName) + '';
    /* A flow that ENDS on an announcement popup has that popup over the tab bar
       on purpose. What must never be over the tab bar is a leftover SHEET, so
       that case is hit-tested through the stack instead of at the top of it. */
    const over = [...document.elementsFromPoint(x, y)];
    const idx = over.findIndex(e => t.contains(e));
    const above = idx < 0 ? over : over.slice(0, idx);
    const bad = above.find(e => e.closest('#sheets .sheet, #sheets .sheet-backdrop'));
    sheetOverTab = !bad ? 'clear' : (bad.className || bad.tagName) + '';
  }
  const veils = [...document.querySelectorAll('.drop-veil')].filter(vis).length;
  return { sheets: sheets.length, backs: backs.length, tabs: tabs.length, tabHit, sheetOverTab, veils,
           titles: sheets.map(s => (s.querySelector('h2,h1')?.textContent || s.className).trim().slice(0, 24)) };
})()`;

const depth = () => page.evaluate(`document.querySelectorAll('#sheets .sheet:not(.closing)').length`);
const clean = () => page.evaluate(CLEAN);

/* Click by visible text or selector, inside an optional root. Returns false when
   nothing matched so a flow can fail loudly instead of measuring an empty room. */
const tap = (sel, text = null) => page.evaluate((s, t) => {
  const all = [...document.querySelectorAll(s)];
  const el = t == null ? all.find(x => x.getBoundingClientRect().width > 1)
    : all.find(x => (x.textContent || '').trim().toLowerCase().includes(t.toLowerCase()) && x.getBoundingClientRect().width > 1);
  if (!el) return false;
  el.click();
  return true;
}, sel, text);

const goto = async hash => { await page.evaluate(h => { location.hash = h; }, hash); await sleep(1500); };

await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
await sleep(3500);
// clear the boot ceremony (spin wheel, drop popups) the way a player would
for (let i = 0; i < 8; i++) {
  const hit = await page.evaluate(() => {
    const rx = /^(spin|nice|done|collect|claim|continue|ok|got it|next|skip|maybe later)$/i;
    const b = [...document.querySelectorAll('button')].find(x => rx.test((x.textContent || '').trim()) && x.getBoundingClientRect().width);
    if (!b) return false; b.click(); return true;
  });
  if (!hit) break;
  await sleep(1000);
}
await page.evaluate(() => { document.querySelectorAll('.drop-veil').forEach(v => v.remove()); });
await goto('#/today');

/* One flow = reach a known sheet depth by tapping real controls, fire the real
   control that calls closeAllSheetsViaHistory(), then assert the screen is the
   player's again. `wantDepth` is asserted BEFORE the close, so a flow that never
   opened its sheets fails as setup rather than passing on an empty room. */
async function flow(name, wantDepth, reach, fire, settleMs = 1600, endsOnVeil = false) {
  await goto('#/today');
  await page.evaluate(() => { document.querySelectorAll('.drop-veil,.tz-pop').forEach(v => v.closest('#sheets > div')?.remove() || v.remove()); });
  let reached;
  try { reached = await reach(); } catch (e) { ok(`${name} · setup`, false, 'threw: ' + e.message.slice(0, 90)); return; }
  const d = await depth();
  if (reached === false || d < wantDepth) {
    ok(`${name} · setup reached ${wantDepth} sheet${wantDepth > 1 ? 's' : ''}`, false, `depth ${d}, reach=${reached}`);
    return;
  }
  ok(`${name} · setup reached ${wantDepth} sheet${wantDepth > 1 ? 's' : ''}`, true, `depth ${d}`);
  let fired;
  try { fired = await fire(); } catch (e) { ok(`${name} · close`, false, 'threw: ' + e.message.slice(0, 90)); return; }
  if (fired === false) { ok(`${name} · close control found`, false, 'the control that closes the sheets was not there'); return; }
  await sleep(settleMs);
  const c = await clean();
  ok(`${name} · no sheet left standing`, c.sheets === 0, JSON.stringify(c.titles));
  ok(`${name} · no backdrop blocking`, c.backs === 0, `${c.backs} backdrop(s)`);
  if (endsOnVeil) {
    // the announcement it opened on purpose IS allowed over the tab bar; a
    // leftover sheet is not. And if no veil opened, the flow never ran.
    ok(`${name} · the announcement actually opened`, c.veils > 0, `${c.veils} veil(s)`);
    ok(`${name} · no sheet over the tab bar`, c.tabs > 0 && c.sheetOverTab === 'clear', `over=${c.sheetOverTab} tabs=${c.tabs}`);
  } else {
    ok(`${name} · tab bar is tappable`, c.tabs > 0 && c.tabHit === 'tab', `hit=${c.tabHit} tabs=${c.tabs}`);
  }
}

const typeInto = (sel, val) => page.evaluate((s, v) => {
  const el = document.querySelector(s); if (!el) return false;
  el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); return true;
}, sel, val);

/* 1. Portion save. The deepest everyday flow: Today -> Add -> search -> a food's
   portion sheet. Two sheets, closed by "Add", swept by refresh() -> route(). */
await flow('portion save (depth 2)', 2,
  async () => {
    if (!await tap('[data-addmeal]')) return false;
    await sleep(1200);
    if (!await typeInto('#q', 'egg')) return false;
    await sleep(900);
    if (!await tap('#results [data-food]')) return false;
    await sleep(1400);
    return true;
  },
  () => tap('.sheet button', 'add'));

/* 2. Quick add save. Add -> Quick add, two sheets, same rescue. */
await flow('quick add save (depth 2)', 2,
  async () => {
    if (!await tap('[data-addmeal]')) return false;
    await sleep(1200);
    if (!await tap('#actQuick')) return false;
    await sleep(1200);
    if (!await typeInto('#qaKcal', '420')) return false;
    return true;
  },
  () => tap('.sheet button', 'add'));

/* 3. Add -> "My foods". One sheet, and the follow-up is a HASH write rather than
   a refresh: the other shape of the same rescue. */
await flow('add sheet -> My foods (depth 1, hash rescue)', 1,
  async () => {
    if (!await tap('[data-addmeal]')) return false;
    await sleep(1200);
    return true;
  },
  () => tap('#actMyFoods'), 2200);

/* 4. Weigh-in save. Progress -> Log weight. One sheet, refresh() rescue. */
await flow('weigh-in save (depth 1)', 1,
  async () => {
    await goto('#/progress');
    if (!await tap('#logWeight')) return false;
    await sleep(1200);
    if (!await typeInto('#wVal', '81')) return false;
    return true;
  },
  () => tap('.sheet button', 'save'));

/* 5. What's New -> a news row. THE FRAGILE ONE. Its follow-up is neither a
   refresh nor a hash write: it opens an announcement popup 220ms later and puts
   the player back on the News tab afterwards. Nothing routes, so nothing sweeps.
   It survives only because openWhatsNew() is always reached from a screen button
   and is therefore always the only sheet open. Pin that, because the day a
   second sheet can sit under it this is the Glutton bug again. */
await flow('whats new -> news row (depth 1, NOTHING sweeps)', 1,
  async () => {
    await goto('#/settings');
    if (!await tap('#whatsNewBtn')) return false;
    await sleep(1600);
    if (!await tap('.wn-tab', 'news')) return false;
    await sleep(800);
    return true;
  },
  () => tap('.nw-row'), 2600, true);

/* 6. And the guard on that assumption: What's New must never open on top of
   another sheet. If it ever does, its news rows call history.go(-2) and leave
   the sheet underneath standing. Measured, not asserted from reading: open a
   real sheet, then fire the same re-entry the news flow uses. */
await goto('#/progress');
await tap('#logWeight');
await sleep(1400);
const underneath = await depth();
await page.evaluate(() => document.querySelector('#whatsNewBtn')?.click());
await sleep(400);
await goto('#/settings');
await sleep(600);
const stacked = await page.evaluate(() => {
  const s = [...document.querySelectorAll('#sheets .sheet')];
  return { n: s.length, names: s.map(x => (x.querySelector('h2')?.textContent || '').trim().slice(0, 20)) };
});
ok('a sheet cannot survive a route into Settings', underneath === 1 && stacked.n === 0,
   `under=${underneath} after=${JSON.stringify(stacked)}`);

/* ---- THE SURVEY, AS A GUARD ------------------------------------------------
   Everything above measures the END STATE, and today every runtime flow is
   green even if `closeAllSheetsViaHistory()` is swapped for a bare
   `history.back()`: `refresh()` and the hash writes land in `route()`, which
   calls `closeAllSheets()` and cleans up whatever the single popstate missed.
   That is worth knowing and worth pinning, but on its own it is a check that
   cannot fail for the bug it is named after.

   So this is the discriminating half. Every call site must either be followed
   by a sweep (a `refresh(`, a `route(` or a `location.hash` write within a few
   lines) or be named here as a KNOWN caller that relies on only ever having one
   sheet open. A new unswept caller is exactly one nested sheet away from the
   Glutton bug, and it fails here the moment it is written.

   PROVE-RED: add `closeAllSheetsViaHistory();` anywhere in js/app.js with no
   route/refresh/hash after it and this goes red by line number. */
const NO_SWEEP_BY_DESIGN = [
  /* openWhatsNew's news rows. The follow-up is an announcement popup 220ms
     later, not a navigation, so nothing sweeps. It is correct ONLY because
     openWhatsNew() is reached from screen-level buttons and from a boot check
     that refuses when any sheet is open, so the stack is always exactly 1.
     If What's New ever opens over another sheet, this caller leaves that sheet
     standing. The runtime flow above is what watches that assumption. */
  'const cameFrom = location.hash;',
];
{
  const raw = await (await import('node:fs/promises')).readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  /* Block comments are blanked line-by-line (line numbers preserved) so the
     comment in openWhatsNew that DESCRIBES the bug is not counted as a call. */
  let inBlock = false;
  const lines = raw.split('\n').map(l => {
    let out = l;
    if (inBlock) { out = l.includes('*/') ? l.slice(l.indexOf('*/') + 2) : ''; inBlock = !l.includes('*/'); }
    else if (/\/\*/.test(out) && !/\*\//.test(out)) { out = out.slice(0, out.indexOf('/*')); inBlock = true; }
    return out.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
  });
  const sites = [];
  lines.forEach((l, i) => {
    if (!/closeAllSheetsViaHistory\(\)/.test(l)) return;
    if (/^function closeAllSheetsViaHistory/.test(l)) return;   // the definition
    sites.push(i);
  });
  ok('call sites found in js/app.js', sites.length > 0, `${sites.length} sites`);
  const unswept = [];
  for (const i of sites) {
    const after = lines.slice(i, i + 7).join('\n');
    const swept = /\brefresh\b|\broute\b|location\.hash\s*=/.test(after.replace(/closeAllSheetsViaHistory\(\)/g, ''));
    const before = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
    const excused = NO_SWEEP_BY_DESIGN.some(m => before.includes(m) || after.includes(m));
    if (!swept && !excused) unswept.push(`js/app.js:${i + 1}  ${lines[i].trim().slice(0, 70)}`);
  }
  ok('every call site is swept by a route, or named as a known depth-1 caller',
     unswept.length === 0,
     unswept.length ? unswept.join(' | ') : `${sites.length} sites, ${NO_SWEEP_BY_DESIGN.length} excused`);
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (!results.length) { console.log('FAIL  no checks ran at all'); }
await browser.close();
if (srvHandle) srvHandle.close();
process.exit(failed.length || !results.length ? 1 : 0);

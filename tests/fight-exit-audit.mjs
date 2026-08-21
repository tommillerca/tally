/* tests/fight-exit-audit.mjs
 *
 * THE BUG (Tom, 2026-08-16): "i just beat a spire and instead of it saying take
 * this spire after my win it looped me back to fight the boss again this has
 * happened so many times with the glutton and elsewhere stop making this
 * mistake. Once the fight is done you have to think what the logical next step
 * is."
 *
 * THE CLASS, not the incident. Every fight is launched FROM a sheet, and that
 * sheet rendered its markup before the fight happened. After a win it still
 * offers the fight you just won. The Glutton got a bespoke fix on 2026-08-11
 * (closeAllSheetsViaHistory + closeAllSheets, gated on mode === 'glutton').
 * Spire never got one, because spire was also missing from `fromMap`, so it
 * fell through to the Pit branch: history.back() onto a live "Face the Warden"
 * button, plus a renderPit() of a screen the player was never on.
 *
 * Fixing the spire alone would be the same mistake a third time. So:
 *
 * 1. COVERAGE IS DERIVED FROM THE SOURCE, not from a list somebody maintains.
 *    Every `openFight(` call site in js/app.js is scanned for its mode, and a
 *    mode with no row in EXITS is a FAILURE. A new fight type cannot be added
 *    without stating where a win drops you. This is the same shape as
 *    STRIKE_FX coverage in fx-audit and SITES in figure-audit, which is how
 *    this project makes a class stop recurring.
 *
 * 2. THE LIVE HALF DRIVES A REAL WIN. The fight is won through the __bhFight
 *    finish seam, which arranges the fight and then takes a REAL action, so
 *    the engine's own damage, checkOver and settle() all run. It does not fake
 *    a result. Then it taps the real #fightDone button and asserts what is on
 *    screen, per anti-regression rule 5: UI changes are verified by OPERATING
 *    controls, not by rendering screens.
 *
 * 3. WHICH DIRECTION IS FAILURE (rule 11). Failure is "a control offering the
 *    fight I just won is present and clickable". Not "a sheet is open", not
 *    "the DOM changed". The exact string on the spire button is the bug.
 *
 * An empty sample set is a FAILURE, never a pass.
 *
 * Usage: node tests/fight-exit-audit.mjs      (or URL=... for live)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadPuppeteer, serveTree, chromePath, sandboxArgs,
  boneyardCapability, unproven, unprovenReport, exitFor, unclassifiedRows } from './godmode.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

/* ---------------------------------------------------------------------------
 * WHERE A FINISHED FIGHT PUTS YOU. One row per fight mode. `dismiss` means the
 * launching sheet is STALE after a win and must be closed past, never landed
 * on. `map` and `pit` mean the surface underneath re-renders itself and is
 * safe to return to.
 * ------------------------------------------------------------------------ */
const EXITS = {
  glutton: 'dismiss',   // he is gone; his sheet still says "face him"
  spire:   'dismiss',   // the tower is already claimed by settle(); its sheet still says "Face the Warden"
  boss:    'map',       // the den row re-renders as TOMORROW once beaten
  mini:    'map',
  secret:  'map',
  /* The two spawn ambushes. Both are launched from the map's own "Grab it"
     button, not from a sheet, so there is no stale launcher to close past: the
     marker they came from is gone on the next refreshWorld. They only have to
     be recognised as map-launched, which mimic was not, which is what this row
     has been red about since the Mimic shipped. */
  mimic:    'map',
  wanderer: 'map',
  friend:  'pit',       // nothing about the friend list goes stale
  spar:    'pit',       // renderPit() refreshes the rungs
};

/* ---------- 1. COVERAGE: every call site's mode must have a row ---------- */
const src = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');
const sites = [];
let i = -1;
while ((i = src.indexOf('openFight(', i + 1)) !== -1) {
  // the mode literal always lands inside the foeCfg object that follows
  const window_ = src.slice(i, i + 900);
  const m = window_.match(/mode:\s*'([a-z]+)'/);
  const line = src.slice(0, i).split('\n').length;
  if (m) sites.push({ line, mode: m[1] });
  else sites.push({ line, mode: null });   // e.g. a call taking a prebuilt foeCfg
}
const modes = [...new Set(sites.filter(s => s.mode).map(s => s.mode))].sort();
ok('COVERAGE the openFight call sites could be read at all (an empty scan is a FAILURE)',
  sites.length >= 8 && modes.length >= 5, `${sites.length} call sites, modes: ${modes.join(', ')}`);
for (const mode of modes) {
  ok(`COVERAGE fight mode "${mode}" declares where a win drops you`, !!EXITS[mode],
    EXITS[mode] || 'NO ROW IN EXITS: add one, and make openFight honour it');
}

/* ---------- 2. the dismiss modes must not fall through to the Pit ------- */
/* Read the exit branch itself. A mode whose sheet goes stale must be handled
   BEFORE the shared `history.back()`, and must not trigger renderPit. */
/* Read the handler by its BOUNDARIES, never by a character count. The first
   version sliced a fixed 1400 chars from the addEventListener and went red the
   moment the comment above the fix grew: a guard pinned to formatting reports a
   false RED on healthy code, and a false RED trains everyone to ignore it. The
   handler is bounded by its own opening and the shared history.back() line. */
const exitStart = src.indexOf("$('#fightDone', body).addEventListener");
const exitEnd = src.indexOf('history.back();', exitStart);
const exitBranch = exitStart >= 0 && exitEnd > exitStart ? src.slice(exitStart, exitEnd) : '';
ok('EXIT the fightDone handler was located by its boundaries (an empty read is a FAILURE)',
  exitBranch.length > 200, `${exitBranch.length} chars, ends at the shared history.back()`);
const dismissList = (exitBranch.match(/STALE_LAUNCHER\s*=\s*\[([^\]]*)\]/) || [])[1] || '';
ok('EXIT a STALE_LAUNCHER list exists, so the rule is a list and not a hand-written condition',
  !!dismissList, dismissList || 'no STALE_LAUNCHER: the dismiss rule is inlined per mode, which is how spire got missed');
for (const [mode, kind] of Object.entries(EXITS)) {
  if (kind !== 'dismiss') continue;
  const listed = new RegExp(`'${mode}'`).test(dismissList);
  ok(`EXIT "${mode}" closes past its stale launcher on a win`,
    listed && /closeAllSheets/.test(exitBranch),
    listed ? 'in STALE_LAUNCHER' : `NOT listed: a ${mode} win falls through to history.back() onto the sheet that launched it`);
}
/* fromMap decides the Done copy AND whether renderPit fires. A map-launched
   fight that is missing from it re-renders The Pit, a screen never visited. */
const fromMapLine = (src.match(/const fromMap = [^;]+;/) || [''])[0];
ok('EXIT the fromMap line was located (an empty read is a FAILURE)', fromMapLine.length > 20, fromMapLine.slice(0, 120));
for (const [mode, kind] of Object.entries(EXITS)) {
  if (kind === 'pit') continue;
  ok(`EXIT "${mode}" is recognised as map-launched, so it never re-renders The Pit`,
    new RegExp(`'${mode}'`).test(fromMapLine),
    new RegExp(`'${mode}'`).test(fromMapLine) ? 'in fromMap' : `MISSING from fromMap: a ${mode} fight re-renders The Pit and its Done button says "Back to The Pit"`);
}

/* ---------- 3. LIVE: drive a real spire win and tap the real button ----- */
const puppeteer = await loadPuppeteer();
let srvHandle = null;
let base = process.env.URL;
if (!base) { srvHandle = await serveTree(ROOT); base = srvHandle.url; }
base = base.replace(/\/?$/, '/');

const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'new',
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  executablePath: chromePath(),
  args: [...sandboxArgs(), '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207, accuracy: 8 });
await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
await sleep(2600);

const spire = await page.evaluate(async () => {
  const m = await import('./js/spires.js');
  const s = m.spiresNear(49.2827, -123.1207)[0];
  return s ? { id: s.id, lat: s.lat, lng: s.lng, name: s.name } : null;
});
ok('LIVE a real spire could be located (an empty locate is a FAILURE)', !!spire, spire ? `${spire.name} (${spire.id})` : 'none');

/* CAN THIS MACHINE REACH THE SPIRE AT ALL?
 *
 * The only route to a spire fight is a tap on #mapSpire, which is a marker on
 * the Boneyard, which is MapLibre over a REMOTE vector tile host. Where that
 * host is unreachable, js/app.js:13287 swaps the whole Boneyard for "The
 * Boneyard needs a network signal to draw the map", and this suite gets no
 * button to press.
 *
 * The dishonesty here is not a wrong answer, it is a DISAPPEARING QUESTION.
 * Four of the six rows below live inside `if (launcher)`, so on a machine with
 * no map they do not fail, they are never written at all: measured on this
 * container 2026-08-17, 22 assertions ran, and on a machine that can draw the
 * map the same file runs 26. Nothing in the output said which four were
 * missing, and 20/22 reads healthier than 20/26. A count that shrinks quietly
 * is the same lie as a check that passes on an empty set.
 *
 * So the capability is MEASURED (godmode.boneyardCapability) and every one of
 * the six is declared UNPROVEN BY NAME, including the four that would have
 * vanished, and the suite exits 97. The static half above (COVERAGE derived
 * from every openFight call site in js/app.js) needs no browser and keeps
 * grading, which is the half that catches a new fight mode with no exit rule. */
const MAP_ROWS = [
  'LIVE the map offered the spire (no offer means the audit did not run)',
  'LIVE the spire sheet offered the fight (no offer means the audit did not run)',
  'LIVE the fight opened and exposed its test seam',
  'LIVE the fight actually ended in a win (a fight that never ended proves nothing)',
  'LIVE the Done button existed and was tapped',
  'LIVE beating a spire does NOT drop you back on a live "Face the Warden" button',
];
/* These two need no map: spiresNear is pure seeded arithmetic, and the error
   list here is pageerror only, which an unreachable host does not populate. */
const NO_MAP_ROWS = [
  'LIVE a real spire could be located (an empty locate is a FAILURE)',
  'LIVE no page errors during the run',
  'ROWS-CLASSIFIED every LIVE row is declared map-dependent or not',
];
const cls = unclassifiedRows(import.meta.url, [MAP_ROWS, NO_MAP_ROWS],
  { after: '/* ---------- 3. LIVE: drive a real spire win and tap the real button ----- */' });
ok('ROWS-CLASSIFIED every LIVE row is declared map-dependent or not',
  cls.missing.length === 0 && cls.seen > 0,
  cls.missing.length ? `unclassified: ${cls.missing.join(' | ')}` : `${cls.seen} row names read from section 3`);

const mapCap = await boneyardCapability(page);
if (!mapCap.ok) {
  for (const n of MAP_ROWS) unproven(n, 'the Boneyard could not draw, so no spire could be reached on this machine');
  ok('LIVE no page errors during the run', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  await browser.close();
  srvHandle?.close();
  const f = results.filter(r => !r.pass);
  console.log(`\n${results.length - f.length}/${results.length} of the checks that COULD run passed`);
  unprovenReport('fight-exit-audit.mjs', mapCap);
  process.exit(exitFor(f.length));
}

let landed = null;
if (spire) {
  await page.setGeolocation({ latitude: spire.lat, longitude: spire.lng, accuracy: 8 });
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(900);
  await page.evaluate(() => { location.hash = '#/boneyard'; });
  await sleep(2000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /open the map/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(9000);

  const took = await page.evaluate(() => {
    const b = document.querySelector('#mapSpire');
    if (!b || b.hidden || b.disabled) return null;
    const t = (b.textContent || '').trim();
    b.click();
    return t;
  });
  ok('LIVE the map offered the spire (no offer means the audit did not run)', !!took, took || 'no #mapSpire');
  await sleep(1800);

  // the launching sheet: this is the thing that goes stale
  const launcher = await page.evaluate(() => {
    const b = document.querySelector('#spireFight');
    return b ? (b.textContent || '').trim() : null;
  });
  ok('LIVE the spire sheet offered the fight (no offer means the audit did not run)', !!launcher, launcher || 'no #spireFight');

  if (launcher) {
    await page.evaluate(() => document.querySelector('#spireFight').click());
    await sleep(3200);
    const seam = await page.evaluate(() => !!window.__bhFight);
    ok('LIVE the fight opened and exposed its test seam', seam);

    if (seam) {
      // a REAL win: the seam arranges the fight, the engine lands the blow
      await page.evaluate(async () => { await window.__bhFight.finish('p'); });
      await sleep(1200);
      const over = await page.evaluate(() => window.__bhFight && window.__bhFight.state().over);
      ok('LIVE the fight actually ended in a win (a fight that never ended proves nothing)',
        !!over && over.winner === 'p', JSON.stringify(over));

      // the real Done button, not a synthetic navigation
      await sleep(2200);
      const tapped = await page.evaluate(() => {
        const b = document.querySelector('#fightDone');
        if (!b) return null;
        const t = (b.textContent || '').trim();
        b.click();
        return t;
      });
      ok('LIVE the Done button existed and was tapped', !!tapped, tapped || 'no #fightDone');
      await sleep(2600);

      /* THE ASSERTION. Failure is a control offering the fight you just won,
         present and clickable. That is the literal reported bug. */
      landed = await page.evaluate(() => {
        const sf = document.querySelector('#spireFight');
        const vis = el => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        return {
          spireFightPresent: !!sf,
          spireFightVisible: vis(sf),
          spireFightText: sf ? (sf.textContent || '').trim() : null,
          openSheets: document.querySelectorAll('#sheets .sheet-body').length,
          hash: location.hash,
        };
      });
      ok('LIVE beating a spire does NOT drop you back on a live "Face the Warden" button',
        !landed.spireFightVisible,
        landed.spireFightVisible ? `STALE LAUNCHER: "${landed.spireFightText}" is on screen and clickable after the win` : JSON.stringify(landed));
    }
  }
}

ok('LIVE no page errors during the run', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
srvHandle?.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (!results.length) { console.log('EMPTY SAMPLE SET: the audit did not run'); process.exit(1); }
if (failed.length) { console.log('fight-exit FAILED'); process.exit(1); }
console.log('fight-exit clean');
process.exit(exitFor(0));

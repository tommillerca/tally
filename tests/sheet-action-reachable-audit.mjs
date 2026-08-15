/* A PRIMARY ACTION MUST BE TAPPABLE IN THE WORST CONTENT STATE, NOT THE DEFAULT ONE.
 *
 * ONE DEFECT, FOUND TWICE BY PLAYERS, NEVER BY US:
 *   1. The fight tray at 375x667 with potions held: a potion button's CENTRE
 *      hit-tested to the sheet, not the button. No scroll offset showed every
 *      control at once.
 *   2. The breeding sheet, reported 2026-08-14: picking a precious spare raises a
 *      warning, and the warning pushes BREED out of `.breed-bar.sticky`, which is
 *      `max-height: 58vh; overflow-y: auto` (app.css:6432). So the control sits
 *      outside its OWN clip and you must scroll a panel to reach it. The action
 *      behind that button permanently destroys a pet.
 *
 * Same shape both times: a container whose contents can grow, with the primary
 * action at the bottom, so the action ends up outside its own clip. Both were
 * found by players because EVERY CHECK WE OWN RENDERS THE DEFAULT STATE, and the
 * bug only exists in the worst-case one.
 *
 * SO THE MEASURE IS THE PLAYER'S THUMB, NOT A RECTANGLE. `getBoundingClientRect`
 * says a clipped button is 132x44 at a fine position; it does not know the button
 * is behind its own scroller's edge. `document.elementFromPoint` at the button's
 * centre is what a tap actually resolves to, so that is what is asserted, WITHOUT
 * scrolling first: "you can reach it if you scroll" is the bug, not the pass.
 *
 * COVERAGE IS PRINTED, INCLUDING WHAT IS NOT COVERED. An unlisted sheet must not
 * read as a passing sheet, so the roster at the bottom names every sheet this file
 * drives AND every one it deliberately does not, with the reason.
 *
 * PROVE-RED: see tests/fixtures/sheet-action-overflow.html, an inert fixture built
 * from the real `.breed-bar.sticky` rule. Run this file with
 * `FIXTURE=1 node tests/sheet-action-reachable-audit.mjs`: the fixture row goes red
 * with the grown content and green with it collapsed, so the hit test is proven to
 * discriminate before any app sheet is graded by it.
 *
 * Usage: node tests/sheet-action-reachable-audit.mjs
 */
import { boot, sleep, settle, setWidth, serveTree } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

/* The smallest phone the app supports. Every measurement below is at this size:
   the bug does not exist at 430x932, which is why the default audits missed it. */
const VW = 375, VH = 667;

const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });

/* THE MEASURE. No scrolling, no scrollIntoView: a tap lands where the thumb is. */
const reach = sel => page.evaluate(s => {
  const b = document.querySelector(s);
  if (!b) return { missing: true };
  const r = b.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hit = (r.width && r.height) ? document.elementFromPoint(cx, cy) : null;
  const name = e => !e ? 'nothing' : e.tagName.toLowerCase()
    + (e.id ? '#' + e.id : '')
    + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  /* which ancestor is clipping it, if any: names the culprit in the failure line
     instead of leaving the next reader to go find it */
  let clipper = null;
  for (let n = b.parentElement; n && n !== document.body && !clipper; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (!/auto|scroll|hidden/.test(cs.overflowY + cs.overflowX)) continue;
    const nr = n.getBoundingClientRect();
    if (cy > nr.bottom + 0.5 || cy < nr.top - 0.5 || cx > nr.right + 0.5 || cx < nr.left - 0.5) clipper = name(n) + ` (${Math.round(nr.top)}..${Math.round(nr.bottom)})`;
  }
  return {
    missing: false, w: Math.round(r.width), h: Math.round(r.height),
    cx: Math.round(cx), cy: Math.round(cy), vh: innerHeight, vw: innerWidth,
    onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
    hit: name(hit), reachable: !!hit && (hit === b || b.contains(hit)),
    disabled: !!b.disabled, clipper,
  };
}, sel);

/* Close the top sheet the way a thumb does. NEVER a bare history.back(): with no
   sheet open that walks the BROWSER back off the app, and the next page.evaluate
   dies with "Execution context was destroyed" while the real complaint is that
   there was nothing to close. (Cost one run here.) */
const closeAll = async () => {
  for (let i = 0; i < 6; i++) {
    const had = await page.evaluate(() => {
      const wraps = document.querySelectorAll('#sheets > div');
      if (!wraps.length) return false;
      const btn = wraps[wraps.length - 1].querySelector('.sheet-close');
      if (btn) btn.click(); else history.back();
      return true;
    });
    if (!had) return;
    await sleep(320);
  }
};

/* ============================ THE FIXTURE ============================
   Proves the hit test discriminates, on a page whose only content is the real
   `.breed-bar.sticky` rule and a button at the bottom of it. Nothing about the
   app is asserted here; this is the check on the check. */
if (process.env.FIXTURE) {
  await setWidth(page, VW, VH);
  await page.goto(srv.url + 'tests/fixtures/sheet-action-overflow.html', { waitUntil: 'networkidle2' });
  await sleep(400);
  const grown = await reach('#fixtureAction');
  ok('FIXTURE the guard goes RED when grown content pushes the action out of its own clip',
    !grown.reachable, JSON.stringify(grown));
  await page.evaluate(() => document.body.classList.add('collapsed'));
  await sleep(300);
  const small = await reach('#fixtureAction');
  ok('FIXTURE the guard goes GREEN on the same page with the content collapsed (so it is not just always red)',
    small.reachable, JSON.stringify(small));
  await browser.close(); srv.close?.();
  console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nthe hit test discriminates');
  process.exit(fails.length ? 1 : 0);
}

/* ============================ THE SHEETS ============================
   Each entry drives ONE sheet twice: its DEFAULT content state and its WORST one.
   The default run is not padding, it is the control INSIDE the app: this harness
   never advances CSS animations and a sheet measured mid-slide reads ~545px low
   (see godmode.settle), so a red row with no green companion could be the rig
   rather than the app. Default green + worst red is a content-state bug and
   nothing else. `drive` must report `reached`; a driver that could not build its
   state is a FAILURE, never a pass. */
const SHEETS = [
  {
    id: 'stable-breed',
    what: 'The Stable, a pair flagged for breeding',
    states: {
      default: 'two plain spares flagged: no warning, the panel at its shortest',
      worst: 'the "you are about to destroy a SHINY" warning showing, the panel at its tallest',
    },
    action: '#doBreed',
    async drive(mode) {
      await closeAll();
      /* Grant three pets once, then set every instance's shiny/level for the mode.
         Written straight to the `petInst` rows the game reads, because WHICH of
         the pair becomes the spare depends on flag order and rarity sort, and I
         refuse to encode that: making them all precious (or all plain) removes the
         question. Dust and cooldown are satisfied so the button is ENABLED in both
         modes, i.e. a real tap here really would destroy a pet. */
      await page.evaluate(async worst => {
        const l = await import('./js/loot.js');
        const { kvGet, kvSet } = await import('./js/db.js');
        /* top up to three, do not assume zero: the demo profile can already own a
           pet, and "grant only if empty" left a one-card ring the coverflow cannot
           make a pair from (picked 0, which this driver correctly called a
           failure rather than a pass). */
        for (const sp of ['C1', 'C4', 'CX']) if ((await l.petInstances()).length < 3) await l.addPetInstance(sp, {});
        const list = await l.petInstances();
        await kvSet('petInst', list.map(x => ({ ...x, shiny: worst, lineage: 0 })));
        await kvSet('petLvlSteps', Object.fromEntries(list.map(x => [x.iid, worst ? 500000 : 0])));
        await l.boneDustAdd(5000);
        await kvGet('petInst');
      }, mode === 'worst');
      await page.evaluate(() => { location.hash = '#/today'; });
      await sleep(1500);
      await page.evaluate(() => document.getElementById('stableBtn')?.click());
      await sleep(2200);
      /* flag one, spin the ring, flag the next: the coverflow shows exactly one
         BREED button at a time, so clicking "two buttons" would test nothing.
         (Same recipe as tests/t2-audit.mjs, and the same reason.) */
      const picked = await page.evaluate(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const flag = () => document.querySelector('[data-breedsel]')?.click();
        const spin = () => {
          const dots = [...document.querySelectorAll('.cf-dots i')];
          const on = dots.findIndex(d => d.classList.contains('on'));
          dots[(on + 1) % Math.max(1, dots.length)]?.click();
        };
        if (document.querySelectorAll('.cf-card').length < 2) return 0;
        flag(); await wait(700);
        spin(); await wait(800);
        flag(); await wait(1100);
        return document.querySelectorAll('.cf-card.picked').length;
      });
      await settle(page);
      const warn = await page.evaluate(() => !!document.querySelector('.breed-warn'));
      return { picked, warn, reached: picked === 2 && warn === (mode === 'worst') };
    },
  },
  {
    id: 'fight-tray-potions',
    what: 'The fight tray',
    states: {
      default: 'an empty kitchen: no potion rows at all',
      worst: 'all six brewable potions stocked and the ITEMS door open, the most rows the tray can carry',
    },
    action: '#endTurn',
    also: '.fight-act.potion',
    async drive(mode) {
      await closeAll();
      await page.evaluate(async worst => {
        const { kvSet } = await import('./js/db.js');
        const { POTIONS } = await import('./js/cooking.js');
        await kvSet('potions', worst ? Object.fromEntries(POTIONS.map(p => [p.id, 3])) : {});
      }, mode === 'worst');
      await page.evaluate(async () => { await window.__denFight(1.6, 0); });
      const trayWait = await page.waitForFunction(() => {
        const f = document.getElementById('factions');
        if (!f || /is acting/i.test(f.textContent || '')) return false;
        return f.querySelectorAll('.fight-act').length >= 3;
      }, { timeout: 9000, polling: 50 }).then(() => 'ready').catch(() => 'timed-out');
      /* v373 put potions behind an ITEMS door; open it, or the worst case is not
         on screen and this grades the same tray twice. */
      await page.evaluate(() => document.getElementById('itemsOpen')?.click());
      await sleep(700);
      await settle(page);
      const potions = await page.evaluate(() => document.querySelectorAll('.fight-act.potion').length);
      return { trayWait, potions, reached: trayWait === 'ready' && (mode === 'worst' ? potions > 0 : potions === 0) };
    },
  },
];

for (const s of SHEETS) {
  for (const mode of ['default', 'worst']) {
    await setWidth(page, VW, VH);
    await sleep(400);
    let setup;
    try { setup = await s.drive(mode); } catch (e) { setup = { reached: false, error: String(e).split('\n')[0] }; }
    const tag = `${s.id}/${mode}`;

    /* AN EMPTY SAMPLE IS A FAILURE. If the state could not be built, nothing was
       measured, and staying quiet here is how a check starts passing about a
       screen it never opened. */
    ok(`SAMPLE ${tag}: the state was actually built (${s.states[mode]})`,
      !!setup.reached, JSON.stringify(setup));
    if (!setup.reached) continue;

    const r = await reach(s.action);
    ok(`REACH ${tag}: the primary action ${s.action} exists`, !r.missing, JSON.stringify(r));
    if (!r.missing) {
      /* ONE assertion, the hit test. `onScreen` is REPORTED, never asserted: a
         healthy #endTurn measures bottom 667.5 on a 667 screen, so a
         rect-in-viewport rule goes red on shipped, working code, and this project
         has already learned what a guard that is red on healthy code is worth. */
      ok(`REACH ${tag}: a tap at the centre of ${s.action} lands ON it${mode === 'default' ? ' (CONTROL: red here means the measurement is wrong, not the app)' : ''}`,
        r.reachable, `hit=${r.hit} at ${r.cx},${r.cy} of ${r.vw}x${r.vh}  onScreen=${r.onScreen}${r.clipper ? `  CLIPPED BY ${r.clipper}` : ''}`);
    }

    if (s.also && mode === 'worst') {
      const many = await page.evaluate(sel => [...document.querySelectorAll(sel)].map((b, i) => {
        const rr = b.getBoundingClientRect();
        const hit = (rr.width && rr.height) ? document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2) : null;
        return { i, label: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24), on: !!hit && (hit === b || b.contains(hit)),
          hit: hit ? hit.tagName.toLowerCase() + (hit.className && typeof hit.className === 'string' ? '.' + hit.className.trim().split(/\s+/)[0] : '') : 'nothing' };
      }), s.also);
      ok(`REACH ${tag}: there are ${s.also} controls to grade (zero would mean this row measured nothing)`,
        many.length > 0, `${many.length} found`);
      if (many.length) {
        const bad = many.filter(m => !m.on);
        ok(`REACH ${tag}: every ${s.also} is tappable where it is drawn`,
          bad.length === 0, bad.length ? JSON.stringify(bad) : `all ${many.length} tappable`);
      }
    }
  }
}

await closeAll();
await browser.close(); srv.close?.();

/* ---- COVERAGE, stated so an unlisted sheet cannot read as a passing sheet ---- */
console.log(`\nCOVERAGE at ${VW}x${VH}`);
for (const s of SHEETS) console.log(`  covered      ${s.id.padEnd(20)} ${s.what} — worst case: ${s.states.worst}`);
for (const [id, why] of [
  ['paddock-*', 'js/paddock.js and js/paddock-cards.js are off limits and five unmerged branches are rewriting them; driving them here would encode markup that is about to change'],
  ['the other ~49 openSheet call sites in js/app.js', 'NOT COVERED. Most have no bottom-anchored primary action inside a clipping container; none has been graded here, so none of them is proven by this file'],
]) console.log(`  NOT covered  ${String(id).padEnd(20)} ${why}`);

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nevery graded primary action is tappable where it is drawn');
process.exit(fails.length ? 1 : 0);

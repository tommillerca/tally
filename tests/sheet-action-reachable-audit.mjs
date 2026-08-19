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
 * centre is what a tap actually resolves to, so that is what is measured.
 *
 * TWO READINGS, AND ONLY ONE OF THEM FAILS THE RUN. The first version asserted the
 * hit test with NO scrolling at all, on the reasoning that "you can reach it if you
 * scroll" is the bug. Extending the file to more sheets disproved that rule on its
 * own control: `[data-destroy]` came up unreachable in its DEFAULT state simply
 * because the Stable's action row sits below the fold of #stableBody, and dragging
 * a sheet is something every player does. Rather than explain that away, the rule
 * changed to the one that is actually true:
 *   REPORTED  the hit test as shipped, with no scrolling. Rides along in every
 *             detail line, so "you have to scroll to your own confirm button"
 *             stays visible.
 *   ASSERTED  the hit test after scrolling THE SHEET'S OWN BODY toward the action,
 *             the one scroll surface a player knows about. Red here means ordinary
 *             scrolling does not help, which happens for exactly two reasons and
 *             both are real bugs: the control lives in a NESTED scroller (a
 *             max-height panel pinned inside the sheet, which is `.breed-bar.sticky`
 *             at app.css:6432), or something is drawn OVER it.
 *
 * COVERAGE IS PRINTED, INCLUDING WHAT IS NOT COVERED. An unlisted sheet must not
 * read as a passing sheet, so the roster at the bottom names every sheet this file
 * drives AND every one it deliberately does not, with the reason. The risk surface
 * itself is not guessed: every destructive-or-paying control goes through
 * `armToConfirm` (js/app.js:396), so `grep -n 'armToConfirm(' js/*.js` IS the list,
 * and every line of it is accounted for down there.
 *
 * AND THE WORST CASE HAS TO BE MEASURABLY WORSE. A driver that claims a worst state
 * but leaves the clipping container the same height has graded the default twice.
 * The WORSE row asserts the scroller's scrollHeight actually grew.
 *
 * PROVE-RED: see tests/fixtures/sheet-action-overflow.html, an inert fixture with
 * both scrollers in it: an outer body standing in for `.sheet-body`, and inside it
 * the real `.breed-bar.sticky` rule. Run
 * `FIXTURE=1 node tests/sheet-action-reachable-audit.mjs`: the fixture goes red with
 * the grown content EVEN THOUGH the outer scroller was scrolled, and green with it
 * collapsed. So the measure is proven to discriminate, and proven not to be
 * satisfiable by scrolling, before any app sheet is graded by it.
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
  /* The nearest scrollable ancestor, whether or not it is currently clipping.
     Its scrollHeight is how the WORSE row below proves the worst-case driver
     really made the container taller. */
  let scroller = null;
  for (let n = b.parentElement; n && n !== document.body && !scroller; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (/auto|scroll/.test(cs.overflowY)) scroller = { sel: name(n), scrollH: n.scrollHeight, clientH: n.clientHeight };
  }
  return {
    missing: false, w: Math.round(r.width), h: Math.round(r.height),
    cx: Math.round(cx), cy: Math.round(cy), vh: innerHeight, vw: innerWidth,
    onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
    hit: name(hit), reachable: !!hit && (hit === b || b.contains(hit)),
    disabled: !!b.disabled, clipper, scroller,
  };
}, sel);

/* THE SECOND MEASURE, AND THE ONE THAT IS ASSERTED.
 *
 * The first run of the extended file forced this distinction and I am not going to
 * paper over it. `[data-destroy]` measured unreachable in its DEFAULT state, which
 * by this file's own control rule would mean the measurement is wrong. It was not
 * wrong; the rule was too crude. In the default Stable the action row is simply
 * BELOW THE FOLD of #stableBody, and scrolling a sheet is something every player
 * does. That is not the bug.
 *
 * The bug is when ordinary scrolling does not help:
 *   - the control sits in a NESTED scroller (`.breed-bar.sticky` is
 *     `max-height:58vh; overflow-y:auto` and pinned `bottom:0`, so dragging the
 *     sheet moves nothing and the second scroll surface is invisible), or
 *   - something is drawn OVER it, so the tap lands on the overlay.
 *
 * So: scroll the sheet's OWN body as far as it goes toward the action, the one
 * scroll surface a player knows about, and hit-test there. The no-scroll reading
 * is still taken and still printed, because "you have to scroll to your own
 * confirm button" is worth seeing, but it is not what fails the run.
 */
const reachAfterBodyScroll = async sel => {
  await page.evaluate(s => {
    const b = document.querySelector(s);
    if (!b) return;
    /* the OUTERMOST scroller inside the sheet, i.e. the sheet body: the innermost
       one is the nested panel this check exists to refuse to use */
    let outer = null;
    for (let n = b.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/auto|scroll/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) outer = n;
    }
    if (!outer) return;
    const orect = outer.getBoundingClientRect(), brect = b.getBoundingClientRect();
    const delta = (brect.top + brect.height / 2) - (orect.top + orect.height / 2);
    outer.scrollTop = Math.max(0, Math.min(outer.scrollHeight - outer.clientHeight, outer.scrollTop + delta));
  }, sel);
  await sleep(400);
  return reach(sel);
};

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
  const grown = await reachAfterBodyScroll('#fixtureAction');
  ok('FIXTURE the guard goes RED when grown content pushes the action into a NESTED clip that scrolling the sheet cannot reach',
    !grown.reachable, JSON.stringify(grown));
  await page.evaluate(() => document.body.classList.add('collapsed'));
  await sleep(300);
  const small = await reachAfterBodyScroll('#fixtureAction');
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
   state is a FAILURE, never a pass.

   PRIORITISED BY DAMAGE, not by how easy the sheet is to open. The complete list
   of destructive-or-paying actions in this app is not a guess: every one of them
   is wired through `armToConfirm` (js/app.js:396), so `grep -n 'armToConfirm('
   js/*.js` enumerates them exactly. That inventory is printed in the COVERAGE
   block at the bottom, each line either covered here or given a reason. */

/* Open the Kitchen and step through the v304 COOK door. `#buyPot` and
   `#forageBtn` are BEHIND that door; a driver that stops at the landing reads
   null and dies, which is exactly what two-tap-audit has been doing since v304. */
const openCook = async () => {
  await closeAll();
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1500);
  await page.evaluate(() => document.querySelector('.dw')?.remove());
  await page.evaluate(() => document.getElementById('kitchenActBtn')?.click());
  await sleep(1700);
  // the Kitchen lost its two-door landing on 2026-08-18 and IS the cook view now
  const door = await page.evaluate(() => { const d = document.getElementById('doorCook'); if (!d) return 'no-door'; d.click(); return true; });
  await sleep(1400);
  await settle(page);
  return door === 'no-door' ? true : door;
};

/* Stock or strip everything the Kitchen's COOK body renders. The body grows with
   the pantry, the potion satchel and the ingredient grid, and #forageBtn is the
   LAST thing in it, which is the shape this whole file is about. */
const stockKitchen = worst => page.evaluate(async w => {
  const { kvSet } = await import('./js/db.js');
  const { POTIONS, RECIPES } = await import('./js/cooking.js');
  const { INGREDIENT_IDS } = await import('./js/cooking.js');
  await kvSet('potions', w ? Object.fromEntries(POTIONS.map(p => [p.id, 3])) : {});
  await kvSet('ingredients', w ? Object.fromEntries((INGREDIENT_IDS || []).map(i => [i, 9])) : {});
  await kvSet('pantry', w
    ? (RECIPES || []).slice(0, 8).map(r => ({ recipeId: r.id, name: r.name, icon: r.icon, cookedAt: Date.now() }))
    : []);
  return { potions: w, recipes: (RECIPES || []).length, ings: (INGREDIENT_IDS || []).length };
}, worst);

/* The Stable, driven to the state a pair is flagged in. Shared by the two actions
   that live in that sheet, because they are clipped by the same container. */
const openStablePair = async (mode, { pair = true } = {}) => {
  await closeAll();
  /* Grant three pets once, then set every instance's shiny/level for the mode.
     Written straight to the `petInst` rows the game reads, because WHICH of the
     pair becomes the spare depends on flag order and rarity sort, and I refuse to
     encode that: making them all precious (or all plain) removes the question.
     Dust and cooldown are satisfied so the button is ENABLED in both modes, i.e.
     a real tap here really would destroy a pet. */
  await page.evaluate(async worst => {
    const l = await import('./js/loot.js');
    const { kvSet } = await import('./js/db.js');
    /* top up to three, do not assume zero: the demo profile can already own a
       pet, and "grant only if empty" left a one-card ring the coverflow cannot
       make a pair from (picked 0, which this driver correctly called a failure
       rather than a pass). */
    for (const sp of ['C1', 'C4', 'CX']) if ((await l.petInstances()).length < 3) await l.addPetInstance(sp, {});
    const list = await l.petInstances();
    await kvSet('petInst', list.map(x => ({ ...x, shiny: worst, lineage: 0 })));
    await kvSet('petLvlSteps', Object.fromEntries(list.map(x => [x.iid, worst ? 500000 : 0])));
    await l.boneDustAdd(5000);
  }, mode === 'worst');
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1500);
  await page.evaluate(() => document.getElementById('stableBtn')?.click());
  await sleep(2200);
  /* flag one, spin the ring, flag the next: the coverflow shows exactly one BREED
     button at a time, so clicking "two buttons" would test nothing. (Same recipe
     as tests/t2-audit.mjs, and the same reason.) */
  const picked = pair ? await page.evaluate(async () => {
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
  }) : 0;
  await settle(page);
  const warn = await page.evaluate(() => !!document.querySelector('.breed-warn'));
  return { picked, warn };
};

const SHEETS = [
  {
    id: 'stable-breed',
    what: 'The Stable, a pair flagged for breeding',
    risk: 'DESTRUCTIVE: destroys one of the two pets, permanently',
    states: {
      default: 'two plain spares flagged: no warning, the panel at its shortest',
      worst: 'the "you are about to destroy a SHINY" warning showing, the panel at its tallest',
    },
    action: '#doBreed',
    async drive(mode) {
      const r = await openStablePair(mode);
      return { ...r, reached: r.picked === 2 && r.warn === (mode === 'worst') };
    },
  },
  {
    id: 'stable-destroy',
    what: 'The Stable, DESTROY on the focused pet',
    risk: 'DESTRUCTIVE: melts a pet down for dust, permanently',
    states: {
      default: 'nothing flagged: the action row sits under the ring with the whole sheet to itself',
      worst: 'a precious pair flagged, so the sticky breed panel is at full height under the same action row',
    },
    /* DESTROY shares `.cf-acts` with BREED, and `.breed-bar.sticky` is the thing
       that once "sat over .cf-acts by 15px" (app.css:6425). So the tall panel is
       the worst case for BOTH buttons in that row, and this one melts a pet. */
    action: '[data-destroy]',
    async drive(mode) {
      const r = await openStablePair(mode, { pair: mode === 'worst' });
      const cards = await page.evaluate(() => document.querySelectorAll('.cf-card').length);
      return { ...r, cards, reached: cards >= 2 && r.warn === (mode === 'worst') && r.picked === (mode === 'worst' ? 2 : 0) };
    },
  },
  {
    id: 'kitchen-forage',
    what: 'The Kitchen behind the COOK door, Forage',
    risk: 'PAYS: 45 coins on the confirm',
    states: {
      default: 'nothing stocked: no pantry rows, no potion satchel, empty ingredient grid',
      worst: 'eight dishes banked, every potion held and every ingredient stocked',
    },
    /* #forageBtn is the LAST section of #kitchenBody and everything above it
       grows with what the player owns. Textbook shape for this file. */
    action: '#forageBtn',
    async drive(mode) {
      const stock = await stockKitchen(mode === 'worst');
      const door = await openCook();
      const seen = await page.evaluate(() => ({
        forage: !!document.getElementById('forageBtn'),
        pantryRows: document.querySelectorAll('#kitchenBody [data-eat]').length,
        satchel: !!document.querySelector('#kitchenBody .ing-name'),
      }));
      return { door, stock, ...seen,
        reached: door && seen.forage && (mode === 'worst' ? seen.pantryRows > 0 : seen.pantryRows === 0) };
    },
  },
  {
    id: 'kitchen-buypot',
    what: 'The Kitchen behind the COOK door, Extra pot',
    risk: 'PAYS: 1,000 coins on the confirm',
    states: {
      default: 'nothing stocked, so the body is at its shortest',
      worst: 'eight dishes banked, every potion held and every ingredient stocked',
    },
    action: '#buyPot',
    async drive(mode) {
      await page.evaluate(async () => { await (await import('./js/loot.js')).coinsAdd(20000); });
      const stock = await stockKitchen(mode === 'worst');
      const door = await openCook();
      const seen = await page.evaluate(() => ({
        buyPot: !!document.getElementById('buyPot'),
        pantryRows: document.querySelectorAll('#kitchenBody [data-eat]').length,
      }));
      return { door, stock, ...seen,
        reached: door && seen.buyPot && (mode === 'worst' ? seen.pantryRows > 0 : seen.pantryRows === 0) };
    },
  },
  /* THE 'garden-buybed' ROW WAS HERE, removed 2026-08-18. Both of its actions
     (#buyBed on the old list UI, #hlwBuy in the Hollow) are UNREACHABLE from the
     player's path now that the Bone Garden's doors are closed, so the row could
     only ever report UNPROVEN: it needs to build two states through a door that
     no longer opens, and an action nobody can reach is not an action this suite
     has anything to say about. Nothing was deleted from the app; openHollow and
     its buy control are intact behind window.__openHollow, and
     tests/garden-closed-audit.mjs asserts neither control is reachable, which is
     the opposite assertion and the one that now matters. Restore this block from
     git history with the doors. */
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

const seen = {};   // id -> { default: reachResult, worst: reachResult }

for (const s of SHEETS) {
  seen[s.id] = {};
  for (const mode of ['default', 'worst']) {
    await setWidth(page, VW, VH);
    await sleep(400);
    let setup;
    try { setup = await s.drive(mode); } catch (e) { setup = { reached: false, error: String(e).split('\n')[0] }; }
    const tag = `${s.id}/${mode}`;

    /* A TOAST IS NOT A CLIPPED CONTROL. Toasts float over the bottom of the
       phone for a few seconds after a fight opens, and elementFromPoint had
       been blaming `div.toast` for three of the six potion buttons. That is a
       banner, not the layout defect this file grades, and the fix for it is not
       in the tray. Wait it out, bounded: if a toast NEVER clears it is a real
       occluder and the hit test below still reports it. */
    await page.waitForFunction(() => ![...document.querySelectorAll('.toast')]
      .some(t => t.getBoundingClientRect().height > 0), { timeout: 8000, polling: 100 }).catch(() => {});

    /* AN EMPTY SAMPLE IS A FAILURE. If the state could not be built, nothing was
       measured, and staying quiet here is how a check starts passing about a
       screen it never opened. */
    ok(`SAMPLE ${tag}: the state was actually built (${s.states[mode]})`,
      !!setup.reached, JSON.stringify(setup));
    if (!setup.reached) continue;

    /* A TOAST IS NOT A CONTENT STATE, AND IT IS NOT AN EXCUSE EITHER.
       backupNudge (js/app.js:1969) fires ONCE a session, 4 seconds late, for
       3.4s, at `bottom: calc(var(--sab) + 96px)` — which is the middle of the
       fight tray on a 375x667 phone. It landed on the bottom potion row here and
       it would land on whatever any other sheet draws at that height, on a timer
       set by how long the suite took to reach this row. That is a flake
       generator, not the "clipped out of its own container" bug this file
       grades, and it belongs in front of EVERY row rather than special-cased
       into the one that noticed it.
       It is waited out, never ignored, and the wait is bounded: a toast still
       standing after 6s is not transient, so the row is failed rather than
       measured through. `getBoundingClientRect` rather than presence, because
       the element lingers at 0x0 after its exit animation and a presence check
       would time out on a clean screen. */
    const toastGone = await page.waitForFunction(
      () => ![...document.querySelectorAll('.toast')].some(n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }),
      { timeout: 6000, polling: 100 }).then(() => true).catch(() => false);
    ok(`SAMPLE ${tag}: no transient toast is standing over the sheet when it is measured`,
      toastGone, toastGone ? '' : await page.evaluate(() => [...document.querySelectorAll('.toast')].map(n => (n.textContent || '').slice(0, 60)).join(' | ')));
    if (!toastGone) continue;

    const asShipped = await reach(s.action);
    const r = asShipped.missing ? asShipped : await reachAfterBodyScroll(s.action);
    /* HOW MUCH CONTENT THE WORST CASE ADDED, anywhere in the open sheet. See the
       WORSE block for why this is measured across every scroller and not just
       the primary action's own. */
    const stress = await page.evaluate(() => {
      const sheet = document.querySelector('.sheet-body') ? document.querySelector('.sheet') || document.body : document.body;
      const scr = [...sheet.querySelectorAll('*')].filter(n => /auto|scroll/.test(getComputedStyle(n).overflowY));
      return { total: scr.reduce((n, e) => n + e.scrollHeight, 0), where: scr.map(e => `${e.id || e.className.toString().split(/\s+/)[0]}:${e.scrollHeight}`).join(' ') };
    });
    seen[s.id][mode] = { ...r, asShipped, stress };
    ok(`REACH ${tag}: the primary action ${s.action} exists`, !r.missing, JSON.stringify(asShipped));
    if (!r.missing) {
      /* ONE assertion, the hit test after an ordinary sheet scroll. `onScreen` is
         REPORTED, never asserted: a healthy #endTurn measures bottom 667.5 on a
         667 screen, so a rect-in-viewport rule goes red on shipped, working code,
         and this project has already learned what that is worth. The unscrolled
         reading rides along in the detail so the "you had to scroll to your own
         confirm button" cases stay visible without failing the run. */
      ok(`REACH ${tag}: a tap at the centre of ${s.action} lands ON it after scrolling the SHEET (not a nested panel)${mode === 'default' ? ' (CONTROL: red here means the measurement is wrong, not the app)' : ''}`,
        r.reachable, `hit=${r.hit} at ${r.cx},${r.cy} of ${r.vw}x${r.vh}  onScreen=${r.onScreen}${r.clipper ? `  CLIPPED BY ${r.clipper}` : ''}`
          + `  |  before any scroll: hit=${asShipped.hit} at ${asShipped.cx},${asShipped.cy} reachable=${asShipped.reachable}`);
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

  /* ---- THE WORST CASE HAS TO ACTUALLY BE WORSE ----
     A driver that claims a worst-case state but leaves the clipping container the
     same height has graded the DEFAULT twice and would report a clean sheet on a
     sheet nobody stressed. That is the exact failure this whole file exists to
     stop, so it is an assertion, not a note: the worst state must put
     measurably more content inside the sheet than the default did.

     IT USED TO NAME ONE CONTAINER, the primary action's own scroller, and that
     made it go red on a FIX. On 2026-08-15 the fight arena was pinned to a
     fixed height and the tray became the flexing element, so #endTurn stopped
     riding the sheet's scrollHeight entirely: the sheet measured 565 -> 565
     while the tray inside it went 134 -> 274 of content. The worst case was
     genuinely worse, the primary action was simply no longer at risk from it,
     and an assertion that demands otherwise is demanding the fix stay un-made.
     So the measure is now every scroller in the open sheet. It still cannot be
     satisfied by a driver that built the same state twice (nothing grows), and
     the detail names which scroller moved. */
  const d = seen[s.id].default, w = seen[s.id].worst;
  if (d && w && !d.missing && !w.missing) {
    const dh = d.stress?.total ?? 0, wh = w.stress?.total ?? 0;
    ok(`WORSE ${s.id}: the worst state really puts more content in the sheet than the default (UNPROVEN if it does not)`,
      wh > dh,
      `sheet scroll content ${dh} -> ${wh}\n              default: ${d.stress?.where}\n              worst:   ${w.stress?.where}`);
  } else {
    ok(`WORSE ${s.id}: UNPROVEN, both states were needed and at least one was never measured`, false,
      `default=${d ? (d.missing ? 'action missing' : 'ok') : 'not built'} worst=${w ? (w.missing ? 'action missing' : 'ok') : 'not built'}`);
  }
}

await closeAll();
await browser.close(); srv.close?.();

/* ---- COVERAGE, stated so an unlisted sheet cannot read as a passing sheet ----
   The risk surface is not guessed. Every destructive-or-paying control in this app
   goes through `armToConfirm` (js/app.js:396), so `grep -n 'armToConfirm(' js/*.js`
   IS the list, and every line of it appears below with a verdict. */
console.log(`\nCOVERAGE at ${VW}x${VH}`);
for (const s of SHEETS) {
  const d = seen[s.id]?.default, w = seen[s.id]?.worst;
  const state = (d && w && !d.missing && !w.missing) ? 'covered   ' : 'UNPROVEN  ';
  console.log(`  ${state}  ${s.id.padEnd(18)} ${s.risk || ''}\n${' '.repeat(14)}${s.what} — worst: ${s.states.worst}`);
}
console.log('\n  NOT COVERED, and therefore NOT PROVEN by this file:');
for (const [what, why] of [
  ['[data-buyweapon] / [data-buy] / [data-dustbuy]',
    'NOT IN THIS CLASS. The shop renders into #screen as a main tab, so its scroller is the page. A button below the page fold is normal scrolling, not a control clipped out of its own container.'],
  ['[data-look-apply] (wardrobe, spends dust)',
    'NOT IN THIS CLASS for the same reason: #chTabs wardrobe is a main-tab render, not a .sheet.'],
  ['#vaultAdoptBtn ("Replace this save?")',
    'THE HIGHEST-STAKES TAP IN THE APP AND IT IS UNPROVEN. It needs a readable cloud vault holding a DIFFERENT save to render at all, which this harness cannot fabricate yet. Worth a driver next.'],
  ['[data-routinedel] (removes a routine)',
    'UNPROVEN. Needs seeded routines; not driven here.'],
  ['paddock-*',
    'OFF LIMITS. js/paddock.js and js/paddock-cards.js are owned elsewhere and five unmerged branches are rewriting them.'],
  ['the other ~45 openSheet call sites in js/app.js',
    'UNPROVEN. Not graded here, in any state. An unlisted sheet is not a clean sheet.'],
]) console.log(`    - ${what}\n        ${why}`);

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nevery graded primary action is tappable where it is drawn');
process.exit(fails.length ? 1 : 0);

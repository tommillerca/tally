/* THE BOTTOM TRAY IS FOUR DESTINATIONS, AND A TAP ON ONE ALWAYS LANDS THERE.
 *
 * WHY THIS EXISTS. Tom, on v421: "if i tap on the bottom bonehead icon on the home
 * tray when im in shop it does nothign. bonehead and wardrobe are not the same
 * part of the app but they act like it sometimes based on clicks."
 *
 * THE BUG, MEASURED BEFORE IT WAS TOUCHED, by driving the real controls in a real
 * page (scratchpad probe, 2026-08-21):
 *     #/bonehead -> tap the hub's Shop chip -> hash "#/bonehead", surface Gwart
 *     -> tap the tray's Bonehead    -> hash "#/bonehead", surface STILL Gwart
 * and, from the deep link instead:
 *     #/shop                        -> hash "#/shop",     surface Gwart
 *     -> tap the tray's Bonehead    -> hash "#/bonehead", surface the Wardrobe
 * Same tap, same screen, two different outcomes, decided entirely by which hash
 * you happened to arrive with. bindTabs() navigated by ASSIGNING location.hash,
 * and assigning a hash the value it already holds fires no hashchange in any
 * browser, so route() never ran. The hub's chips move the SURFACE without touching
 * the hash (renderCharacter() straight, js/app.js), so inside the hub the hash
 * reports where you came in, not where you are.
 *
 * THE RULE THIS FILE ENFORCES: a tray tap lands you on that tab's HOME surface
 * from anywhere, and never does nothing. Today, Boneyard and Crew have one surface
 * each. Bonehead's home is the hub's WARDROBE, where the Bonehead stands, which is
 * what makes it a destination rather than "whichever hub tab you last opened".
 *
 * WHICH DIRECTION IS FAILURE (anti-regression rule 11). Not "the tap did
 * something": the shipped bug is a tap that does NOTHING, and a tap that lands on
 * the wrong screen is equally red. So every cell asserts the LANDING SURFACE BY
 * NAME, and the three hub-sibling cells get their own row because they are the
 * ones that were broken and the ones a future short-circuit would break first.
 *
 * IT CANNOT PASS ON A BLIND PREDICATE. After every landing all four surface
 * predicates are evaluated, and EXACTLY ONE must be true. A predicate that
 * answered true everywhere (or a screen that rendered blank, where all four answer
 * false) fails the EXCLUSIVE row before any cell is graded.
 *
 * IT FIRES THE REAL CONTROL. A real mouse click at the button's centre, never
 * el.click(): godmode's own note says programmatic clicks do not reach some of
 * this app's handlers. The centre point is hit-tested with elementFromPoint first
 * (anti-regression rule 6), so a control covered by something else fails here
 * rather than reading as a routing bug.
 *
 * Run:  node tests/tray-destination-audit.mjs http://127.0.0.1:PORT/
 * argv FIRST, env.URL second, and it serves the tree itself if given neither:
 * boot()'s default is the LIVE site, and an audit that silently grades production
 * reads as coverage of the tree under test.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

/* THE FOUR SURFACES, each recognised by something only that screen renders.
   today    route() toggles .screen--today on the scroller (it is also what gates
            the overscroll wordmark, so it is the app's own answer to "is this
            Today", not a second list of tab names).
   boneyard .screen--map, likewise toggled by route() for the full-bleed map.
   friends  the Crew heading. Present in BOTH branches of renderFriends, the
            signed-out one and the signed-in one, so a demo profile with no
            account still matches.
   bonehead the hub with its WARDROBE chip selected. Not "the hub": landing on the
            hub's Shop tab is exactly the bug. */
const SURFACES = {
  today: `!!document.querySelector('#screen.screen--today') && document.getElementById('screen').children.length > 0`,
  boneyard: `!!document.querySelector('#screen.screen--map')`,
  friends: `/The Crew/.test(document.querySelector('#screen .page-h1')?.textContent || '')`,
  bonehead: `!!document.querySelector('#chTabs .chip.on[data-tab="wardrobe"]')`,
};
const TABS = ['today', 'boneyard', 'friends', 'bonehead'];

let srv = null;
let base = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
if (!base) { srv = await serveTree(ROOT); base = srv.url; }
const { browser, page } = await boot(base);

const probe = () => page.evaluate(s => {
  const out = {};
  for (const [k, expr] of Object.entries(s)) { try { out[k] = !!eval(expr); } catch { out[k] = false; } }
  return {
    on: out, hash: location.hash,
    active: document.querySelector('#tabbar .tab.active')?.dataset.tab || null,
    hubTab: [...document.querySelectorAll('#chTabs .chip')].find(c => c.classList.contains('on'))?.dataset.tab || null,
  };
}, SURFACES);

/* THE REAL CONTROL, hit-tested first. Returns what the browser says is at the
   button's centre, so "the tap did nothing" and "something is sitting on top of
   the tab bar" are distinguishable failures rather than one confusing one. */
async function tapTray(tab) {
  const hit = await page.evaluate(t => {
    const b = document.querySelector(`#tabbar .tab[data-tab="${t}"]`);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const at = document.elementFromPoint(x, y);
    return { x, y, mine: !!at && (at === b || b.contains(at)), at: at ? at.tagName + '.' + at.className : 'none' };
  }, tab);
  if (!hit) return { hit: null };
  await page.mouse.click(hit.x, hit.y);
  return { hit };
}

/* THE START STATES. The four hub ones are the point of the file: they are the same
   #/bonehead hash wearing four different surfaces, which is the condition the bug
   needed. Reached by driving the hub's own chips, not by seeding a variable. */
async function reach(state) {
  const hubTab = state.startsWith('hub:') ? state.slice(4) : null;
  await page.evaluate(h => { location.hash = h; }, hubTab ? '#/bonehead' : '#/' + state);
  await sleep(1400);
  if (hubTab && hubTab !== 'wardrobe') {
    await page.evaluate(t => document.querySelector(`#chTabs .chip[data-tab="${t}"]`)?.click(), hubTab);
    await sleep(1100);
  }
  return page.evaluate(t => ({
    hash: location.hash,
    hubTab: [...document.querySelectorAll('#chTabs .chip')].find(c => c.classList.contains('on'))?.dataset.tab || null,
    kids: document.getElementById('screen').children.length,
    want: t,
  }), hubTab);
}

const STATES = ['today', 'boneyard', 'friends', 'hub:wardrobe', 'hub:crates', 'hub:shop', 'hub:talents', 'settings'];

const cells = [];
const badStart = [];
const badHit = [];
for (const state of STATES) {
  for (const tab of TABS) {
    const start = await reach(state);
    /* THE START STATE IS ASSERTED, NOT ASSUMED. A hub cell that never reached its
       chip would grade "tap Bonehead from the Wardrobe", which is the one case
       that was never broken, and the file would pass on the bug. */
    const startOk = start.kids > 0 && (start.want ? start.hubTab === start.want : true);
    if (!startOk) badStart.push(`${state} (hubTab ${start.hubTab}, ${start.kids} kids)`);
    const { hit } = await tapTray(tab);
    if (!hit || !hit.mine) badHit.push(`${state} -> ${tab}: ${hit ? hit.at : 'no button'}`);
    await sleep(1600);
    const after = await probe();
    cells.push({ state, tab, startOk, after, hit });
  }
}

ok(`SAMPLE    the whole matrix ran: ${STATES.length} start surfaces x ${TABS.length} tray buttons`,
  cells.length === STATES.length * TABS.length, `${cells.length} taps`);
ok('SAMPLE    every start surface was really reached before its tap (a hub cell that never got to its chip would grade the one case that was never broken)',
  badStart.length === 0, badStart.join(' | ') || 'all 32 starts confirmed');
ok('HITTEST   the centre of every tray button belongs to that button: nothing is sitting on top of the tray (anti-regression rule 6)',
  badHit.length === 0, badHit.join(' | ') || `${cells.length} centres, all own`);

/* EXCLUSIVE, and it runs BEFORE the landing row so a blind predicate cannot make
   that row meaningless. A screen that rendered blank scores zero true and fails
   here; a predicate that matched everywhere scores more than one. */
const ambiguous = cells.filter(c => Object.values(c.after.on).filter(Boolean).length !== 1);
ok('EXCLUSIVE every landing matches EXACTLY ONE of the four surface predicates, so the row below cannot pass on a blind test or on a blank screen',
  ambiguous.length === 0,
  ambiguous.slice(0, 4).map(c => `${c.state}->${c.tab}: ${JSON.stringify(c.after.on)}`).join(' | ') || `${cells.length} landings, one match each`);

const wrong = cells.filter(c => !c.after.on[c.tab]);
ok('LAND      every tray tap lands on its own destination, from every start surface: never nothing, never a sibling',
  wrong.length === 0 && cells.length === STATES.length * TABS.length,
  wrong.length
    ? wrong.map(c => `${c.state} -> tapped ${c.tab}, landed ${Object.entries(c.after.on).find(([, v]) => v)?.[0] || 'NOWHERE'} (hash ${c.after.hash}, hub ${c.after.hubTab})`).join(' | ')
    : `${cells.length}/${cells.length}`);

/* THE REPORTED BUG, ON ITS OWN ROW. Three cells, and the direction of failure is
   named: landing on the sibling you were already on IS the bug, not a near miss. */
const siblings = cells.filter(c => c.tab === 'bonehead' && /^hub:(crates|shop|talents)$/.test(c.state));
ok('SAMPLE    the three hub siblings were each graded for the Bonehead tap (the exact cell Tom reported)',
  siblings.length === 3, siblings.map(c => c.state).join(', '));
const stuck = siblings.filter(c => c.after.hubTab !== 'wardrobe');
ok('BONEHEAD  from Backpack, Shop and Build the tray\'s Bonehead lands on the WARDROBE, not on the hub tab you were already looking at: v421 left you exactly where you were',
  siblings.length === 3 && stuck.length === 0,
  siblings.map(c => `${c.state.slice(4)} -> ${c.after.hubTab}`).join(', '));

/* AND THE TAB BAR AGREES WITH THE SCREEN. #/shop lights the Bonehead tab by
   design (route()'s navTab), so this is not free: it fails if a destination ever
   lands somewhere the bar does not admit to. */
const mismatched = cells.filter(c => c.after.active !== c.tab);
ok('ACTIVE    the tray highlights the button you tapped, on every landing',
  mismatched.length === 0,
  mismatched.slice(0, 4).map(c => `${c.state}->${c.tab}: bar says ${c.after.active}`).join(' | ') || `${cells.length} landings`);

await browser.close();
if (srv) srv.close();

const failed = results.filter(r => !r.pass);
if (results.length < 7) { console.log(`\nFAIL: only ${results.length} checks ran, expected 7`); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join(', ')); process.exit(1); }
console.log('tray-destination-audit clean');

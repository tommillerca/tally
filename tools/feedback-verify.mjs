#!/usr/bin/env node
/* WHY THIS EXISTS.
 *
 * On 2026-09-11 I told Tom that all eighteen of his UI notes were in v575. Six
 * were not. Three had shipped their markup while a chain-merge silently dropped
 * their CSS, two were never built, and one was sitting unshipped on a branch.
 * He updated his phone, looked, and found nothing.
 *
 * The cause was not the merge. It was that I reported from LANE DISPATCH, not
 * from the deployed site. Four lanes green individually is not a shipped
 * feature, and "I asked Codex to do it" is not evidence.
 *
 * So: every feedback item gets a probe that runs against a URL and answers one
 * question, "can a player see this". Exits non-zero when any CLAIMED item is
 * missing, so a release cannot report success over a feature that is not there.
 *
 *   node tools/feedback-verify.mjs https://tommillerca.github.io/tally/
 */
import { readFileSync } from 'node:fs';

const url = (process.argv[2] || 'https://tommillerca.github.io/tally/').replace(/\/?$/, '/');
const bust = `?cb=${Date.now()}`;
const get = async p => { const r = await fetch(url + p + bust); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.text(); };

/* Each item: the note Tom wrote, and the marker a player's browser would load.
   `css` items need BOTH: markup alone shipped an invisible feature once. */
const ITEMS = [
  { id: 'G3', note: 'Backpack tab uses the selected highlight', js: 'bp-navigation', css: '#chTabs.bp-navigation .ch-tab.on' },
  { id: 'G4', note: 'Lab banner drops "Recipes"', absent: 'Recipes &rsaquo;' },
  { id: 'G5', note: 'Crate and item explanations in a dropdown', js: 'bp-item-details', css: '#chContent .bp-item-details summary' },
  { id: 'G6', note: 'Tapping a paperdoll slot scrolls to its items', js: 'data-slot-scroll' },
  { id: 'G7', note: 'Cosmetics with the same look stack together', js: 'lookStack' },
  { id: 'G9', note: 'DESTROY is not in the pet talents flow', js: 'meltMode' },
  { id: 'F1', note: 'Bonehead and pet stop floating', js: 'hero-still' },
  { id: 'F5', note: 'Fit count removed', absent: 'ward-fits' },
  { id: 'F9', note: 'Bigger box for the pet', js: 'bp-identity', css: '.bh-hero.mini.bp-identity .bh-stage.lg' },
  { id: 'F15', note: 'Favourite from the card, star is a filter', js: 'Filter: favourites' },
  { id: 'RH', note: 'Laboratory and Kitchen room headers', js: 'roomHeaderHtml' },
];

const app = await get('js/app.js'), css = await get('app.css');
let missing = 0;
for (const it of ITEMS) {
  const bad = [];
  if (it.js && !app.includes(it.js)) bad.push('no markup');
  if (it.css && !css.includes(it.css)) bad.push('NO CSS');
  if (it.absent && app.includes(it.absent)) bad.push('still present');
  if (bad.length) missing++;
  console.log(`${bad.length ? 'MISSING' : 'live   '}  ${it.id}  ${it.note}${bad.length ? '  <- ' + bad.join(', ') : ''}`);
}
console.log(`\n${ITEMS.length - missing} of ${ITEMS.length} visible to a player at ${url}`);
if (missing) { console.log('A release must not be reported as complete while any row says MISSING.'); process.exit(1); }

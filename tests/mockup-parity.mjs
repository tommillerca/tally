/* Mockup parity: has every APPROVED mockup actually been built?
 *
 * WHY THIS EXISTS. Tom approved four Phase 0 mockups (Today, Wardrobe, The Pit,
 * Kitchen) and then eight Tier 1 surfaces. I built the Tier 1 sheets, the
 * Boneyard and the Tier 2 moments, and reported "Tier 1 complete" because the
 * surface inventory listed Today as "Mocked". Mocked meant approved-and-pending,
 * not done. Tom installed the update and said: "The boneyard looks different but
 * I'm not seeing the today page changes etc. stuff seems missing." He was right.
 *
 * Nothing could have caught it. t1-audit and t2-audit assert the surfaces I DID
 * build. screen-sweep only checks that other screens still render, which they
 * did, unchanged. No check compared the shipped app against an approved design.
 *
 * So: each approved mockup declares signature markers that MUST exist in the app
 * once it is built. A mockup with `built: false` is an explicit, visible debt
 * entry rather than a silent gap; flipping it to true without the markers fails.
 *
 * PROVE-RED: set built:true on any unbuilt row, or delete `.t1-frow` from
 * js/app.js, and this exits 1 naming the screen.
 *
 * Usage: node tests/mockup-parity.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCKS = process.env.MOCKUP_PARITY_DIR
  ? path.resolve(process.env.MOCKUP_PARITY_DIR)
  : path.resolve(ROOT, '../market-quality-mockups');

/* The mockups live in a sibling directory OUTSIDE the repo, so most checkouts
   do not have them. Without this guard readdirSync threw before the first
   assertion: the file read as coverage while being unrunnable anywhere but one
   machine. Skip loudly on exit 3 (1 = a built:true claim is a lie, 2 = approved
   work still owed, 3 = the audit could not run at all). */
if (!existsSync(MOCKS)) {
  console.log('mockup-parity SKIPPED: no mockups directory at ' + MOCKS);
  console.log('  This audit checked NOTHING. It needs the market-quality-mockups');
  console.log('  sibling directory (set MOCKUP_PARITY_DIR to point elsewhere).');
  process.exit(3);
}

/* Every mockup Tom has signed off, with the markers that prove it shipped.
   `built: false` means approved but NOT implemented: real, tracked debt. */
const APPROVED = [
  // Phase 0, approved 2026-08-06 at rev 3 ("okay im liking this now")
  { screen: 'Today',      mock: 'today.html',        built: true,  markers: ['hero-lvrow', 'hero-scene', 'var(--coral)'] },
  { screen: 'Wardrobe',   mock: 'wardrobe.html',     built: true,  markers: ['ward-head', 'ward-lv', 'pd-swatch', 'pd-center'] },
  { screen: 'The Pit',    mock: 'pit.html',          built: true,  markers: ['fight-hud', 'border-bottom: 2px solid var(--ink)', 'range-pill'] },
  { screen: 'Kitchen',    mock: 'kitchen.html',      built: true,  markers: ['marquee', 'garland', 'wisp', 'spore'] },
  // Tier 1, approved 2026-08-06 ("these are looking really good let's build them")
  { screen: 'Add food',        mock: 't1-picker.html',   built: true, markers: ['t1-routes', 't1-budget', 't1-frow'] },
  { screen: 'Portion sheet',   mock: 't1-portion.html',  built: true, markers: ['t1-hero', 't1-payoff', 't1-step'] },
  { screen: 'Quick add',       mock: 't1-quickadd.html', built: true, markers: ['t1-field hot'] },
  { screen: 'Barcode scanner', mock: 't1-scanner.html',  built: true, markers: ['reticle t1', 'scan-alt'] },
  { screen: 'Label scan',      mock: 't1-label.html',    built: true, markers: ['t1-stage', 't1-rules', 't1-priv'] },
  { screen: 'Food form',       mock: 't1-foodform.html', built: true, markers: ['t1-read', 't1-field'] },
  { screen: 'Boneyard',        mock: 't1-boneyard.html', built: true, markers: ['map-topbar', 'map-act', 'map-radius'] },
  { screen: 'Boss den sheet',  mock: 't1-boneyard-tap.html', built: true, markers: ['den-hero', 'den-odds', 'den-pays'] },
  // Onboarding, approved 2026-08-07 ("approved"; launch is the stated main goal)
  { screen: 'Onboarding hook',   mock: 'onb-1.html', built: true, markers: ['onb-poster', 'onbRestore'] },
  { screen: 'Onboarding reveal', mock: 'onb-2.html', built: true, markers: ['onbReroll', 'onb-nameplate', 'onb-earns'] },
  { screen: 'Onboarding plan',   mock: 'onb-3.html', built: true, markers: ['onbSkip', 'onb-plan'] },
  // Tier 2, approved 2026-08-07 ("these look good, start building tier 2")
  { screen: 'Crate reveal',  mock: 't2-crate.html',   built: true, markers: ['reveal-take', 'pc-plate'] },
  { screen: 'Level up',      mock: 't2-levelup.html', built: true, markers: ['reveal-take', 'reveal-eyebrow'] },
  { screen: 'Fight victory', mock: 't2-victory.html', built: true, markers: ['choice-h', 'got-rows'] },
  { screen: 'Pet hatch',     mock: 't2-hatch.html',   built: true, markers: ['reveal-take cool'] },
  /* was ['pack-pips'], which 5c609fb deleted when it rebuilt the crate reveal.
     The screen is fine: driven through __packReveal it renders .pack-reveal with
     a card in it. Only the marker rotted. */
  { screen: 'Pack reveal',   mock: 't2-pack.html',    built: true, markers: ['pack-reveal', 'pack-stage', 'pack-deck'] },
  { screen: 'Breed result',  mock: 't2-breed.html',   built: true, markers: ['fused-note', 'breed-trade'] },
  // The step race, approved 2026-08-08 ("art is approved")
  { screen: 'Step race banner',  mock: 'race.html',          built: true, markers: ['race-banner', 'race-art'] },
  { screen: 'Step race board',   mock: 'race-open.html',     built: true, markers: ['race-lanes', 'race-purse', 'race-gap'] },
  { screen: 'Step race intro',   mock: 'race-announce.html', built: true, markers: ['race-veil', 'race-intro-art', 'raceIntroGo'] },
  // Tier 3, approved 2026-08-07 ("Approved, build all six")
  { screen: 'Shop',       mock: 't3-shop.html',     built: true, markers: ['t3-drop', 't3-dropsect', 't3-price', 't3-forage'] },
  { screen: 'Backpack',   mock: 't3-backpack.html', built: true, markers: ['t3-qty', 't3-egg', 't3-cells'] },
  { screen: 'Build',      mock: 't3-build.html',    built: true, markers: ['t3-fighter', 't3-armor', 't3-faq', 't3-pm'] },
  { screen: 'Pit entry',  mock: 't3-pitentry.html', built: true, markers: ['t3-hero', 't3-energy', 't3-rung'] },
  { screen: 'Garden',     mock: 't3-garden.html',   built: true, markers: ['t3-beds', 't3-bed', 't3-pouch', 't3-seed'] },
  /* was the three t3-* classes, which survive in app.css (24 rules) but are
     emitted by nothing: the Stable shipped as a carousel with its own classes.
     Driven, it opens as "The Stable" with cards in it. Marker rot, not debt. */
  { screen: 'Stable',     mock: 't3-stable.html',   built: true, markers: ['stableBody', 'pet-tier-lbl', 'pet-opts'] },
];

/* WHERE a marker lives is the whole point, so js and css are read separately.
   The Stable passed this audit for days on three classes that exist ONLY in
   app.css: 24 rules of styling that no code ever emits. Concatenating the two
   files made "we styled it" and "we shipped it" the same observation, which is
   the hollow-check shape rule 1 is about. A marker in js/ is a screen that
   renders; a marker in app.css alone is a stylesheet for a screen that may not
   exist. Every js module counts, not just app.js: garden, pets and the map all
   build their own markup. */
const jsSrc = readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))
  .map(f => readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n');
const cssSrc = readFileSync(path.join(ROOT, 'app.css'), 'utf8');
const src = jsSrc + '\n' + cssSrc;
const mockFiles = new Set(readdirSync(MOCKS).filter(f => f.endsWith('.html')));

const missing = [], pending = [], ghosts = [];
for (const row of APPROVED) {
  if (!mockFiles.has(row.mock)) ghosts.push(`${row.screen}: mockup ${row.mock} is gone from market-quality-mockups/`);
  if (!row.built) { pending.push(row.screen); continue; }
  if (!row.markers.length) { missing.push(`${row.screen}: marked built with no markers to prove it`); continue; }
  const absent = row.markers.filter(m => !src.includes(m));
  if (absent.length) { missing.push(`${row.screen} (${row.mock}): missing ${absent.map(a => `"${a}"`).join(', ')}`); continue; }
  if (!row.markers.some(m => jsSrc.includes(m))) {
    missing.push(`${row.screen} (${row.mock}): every marker is CSS-only, so this is styled but never rendered — ${row.markers.map(a => `"${a}"`).join(', ')}`);
  }
}

console.log(`mockup-parity: ${APPROVED.length} approved designs, ${APPROVED.filter(r => r.built).length} marked built`);
if (ghosts.length) { console.log('\nMOCKUP FILES MISSING:'); ghosts.forEach(g => console.log('  ' + g)); }
if (pending.length) {
  console.log(`\nAPPROVED BUT NOT BUILT (${pending.length}) — this is the debt, not a pass:`);
  pending.forEach(p => console.log('  - ' + p));
}
if (missing.length) {
  console.log(`\nCLAIMED BUILT BUT NOT IN THE APP (${missing.length}):`);
  missing.forEach(m => console.log('  FAIL  ' + m));
}
if (missing.length || ghosts.length) process.exit(1);
if (pending.length) {
  console.log('\nEvery screen marked built is really in the app. The list above is still owed.');
  process.exit(2);   // distinct from a broken claim: work remaining, nothing lying
}
console.log('mockup-parity clean: every approved design is in the app');

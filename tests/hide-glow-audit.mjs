/* Hide-a-garment (already shipped) must keep its STATS, and the new glow toggle must
 * be cosmetic only. The failure that matters is a cosmetic switch that quietly
 * changes how hard you hit. */
import { boot, sleep } from './godmode.js';
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

// equip a statted, glowing piece: an epic/legendary weapon
const setup = await page.evaluate(async () => {
  // a legendary main-hand needs level 14; the demo profile is level 8, and equipGear
  // enforces it, so earn the levels first rather than fighting the guard
  const db = await import('./js/db.js');
  const { dateKey } = await import('./js/nutrition.js');
  await db.db.put('xp', { key: 'seed-lvl', type: 'seed', xp: 40000, date: dateKey(), note: 'test' });
  const loot = await import('./js/loot.js');
  const { GEAR_ITEMS } = await import('./js/gear.js');
  const pick = GEAR_ITEMS.find(g => g.slot === 'IR' && g.rarity === 'legendary')
            || GEAR_ITEMS.find(g => g.slot === 'IR');
  await loot.grantGear(pick.id, 'test');
  await loot.equipGear(pick.slot, pick.id);
  return { id: pick.id, rarity: pick.rarity, stats: pick.stats };
});
console.log('wearing:', JSON.stringify(setup));

const stats = async () => page.evaluate(async () => {
  const { gearStats } = await import('./js/gear.js');
  const { gearLoadout, ownedGearIds } = await import('./js/loot.js');
  const lo = await gearLoadout(), owned = await ownedGearIds();
  return gearStats(lo, owned, 40);
});

/* EQUIP SOMETHING THAT CAN ACTUALLY GLOW, FIRST.
   The glow only ever applies to an EPIC or LEGENDARY item in a hand slot
   (js/app.js: `S.glow && (s.code === 'IR' || s.code === 'IL') && (rarity ===
   'epic' || 'legendary')`). The demo profile holds IR1 and IL1-1, both COMMON,
   so nothing on screen could glow whatever the setting said, and the check below
   measured 0 with the toggle ON and reported the feature broken. Measured during
   the gate:all debut triage: canGlowAtAll=false, onScreen=0. That is an EMPTY
   SAMPLE, which anti-regression rule 3 calls a failure of the CHECK, and the
   assertion's own parenthetical ("else the check proves nothing") shows its
   author knew the hole was there.
   The glow is not broken. This arranges the one state in which the question can
   be asked at all. */
await page.evaluate(async () => {
  const { kvGet, kvSet } = await import('./js/db.js');
  const eq = (await kvGet('equipped', {})) || {};
  await kvSet('equipped', { ...eq, IL: 'IL11-3' });   // Nightfall Katana, legendary
});
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2600);
await page.evaluate(() => document.querySelector('.dw')?.remove());
const glowable = await page.evaluate(async () => {
  const { kvGet } = await import('./js/db.js');
  const eq = (await kvGet('equipped', {})) || {};
  return eq.IL === 'IL11-3';
});
check('a glowing item is actually equipped (an empty sample proves nothing)', glowable,
  glowable ? 'IL11-3 Nightfall Katana, legendary' : 'the equip did not stick, so every glow result below is meaningless');

// ---- the glow toggle is COSMETIC ----
const before = await stats();
await page.evaluate(async () => { const db = await import('./js/db.js'); await db.kvSet('glow', false); });
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2600);
await page.evaluate(() => document.querySelector('.dw')?.remove());
const after = await stats();
console.log('gear stats glow-on vs glow-off:', JSON.stringify(before), JSON.stringify(after));
check('turning the glow off does NOT change any gear stat', JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before)} vs ${JSON.stringify(after)}`);

const off = await page.evaluate(() => ({
  glow: window.__glowState ?? null,
  glowClasses: document.querySelectorAll('.bh-anim img.wpn-glow, .bh-anim img.bh-slimed').length,
}));
console.log('with the glow off:', JSON.stringify(off));
check('no glow class is rendered when it is off', off.glowClasses === 0, String(off.glowClasses));

await page.evaluate(async () => { const db = await import('./js/db.js'); await db.kvSet('glow', true); });
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2600);
await page.evaluate(() => document.querySelector('.dw')?.remove());
const on = await page.evaluate(() => document.querySelectorAll('.bh-anim img.wpn-glow, .bh-anim img.bh-slimed').length);
console.log('glow classes with it ON:', on);
check('the glow comes back when switched on (else the check proves nothing)', on > 0, String(on));
const restored = await stats();
check('and stats are still identical', JSON.stringify(restored) === JSON.stringify(before));

// ---- the settings control exists and operates ----
await page.evaluate(() => { location.hash = '#/settings'; });
await sleep(1900);
const ctl = await page.evaluate(() => ({
  hasOn: !!document.getElementById('glowOn'), hasOff: !!document.getElementById('glowOff'),
  label: [...document.querySelectorAll('.settings-row .lab b')].map(b => b.textContent.trim()).find(t => /glow/i.test(t)),
  says: [...document.querySelectorAll('.settings-row .lab span')].map(s => s.textContent).find(t => /glow|halo/i.test(t)) || '',
}));
console.log('settings control:', JSON.stringify(ctl));
check('there is a Gear glow control in Settings', ctl.hasOn && ctl.hasOff && !!ctl.label, JSON.stringify(ctl));
check('and it promises stats are unaffected', /stats are unaffected/i.test(ctl.says), ctl.says);
await page.evaluate(() => document.getElementById('glowOff').click());
await sleep(1200);
const persisted = await page.evaluate(async () => (await (await import('./js/db.js')).kvGet('glow', true)));
check('tapping Off persists', persisted === false, String(persisted));

// ---- hiding a slot keeps its stats (the half that already shipped) ----
const hide = await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const { gearStats } = await import('./js/gear.js');
  const { gearLoadout, ownedGearIds } = await import('./js/loot.js');
  const lo = await gearLoadout(), owned = await ownedGearIds();
  const s0 = gearStats(lo, owned, 40);
  await loot.applyTransmog('IR', loot.TRANSMOG_HIDE);
  const s1 = gearStats(await gearLoadout(), await ownedGearIds(), 40);
  const mog = await loot.transmogMap();
  return { before: s0, after: s1, mog: mog.IR, free: loot.transmogCost(loot.TRANSMOG_HIDE) };
});
console.log('hiding a slot:', JSON.stringify(hide));
check('hiding a slot is recorded', hide.mog === '__hide', String(hide.mog));
check('hiding is free', hide.free === 0, String(hide.free));
check('and hiding changes NO stats', JSON.stringify(hide.before) === JSON.stringify(hide.after), `${JSON.stringify(hide.before)} vs ${JSON.stringify(hide.after)}`);
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nHIDE + GLOW ARE COSMETIC ONLY');
process.exit(bad ? 1 : 0);

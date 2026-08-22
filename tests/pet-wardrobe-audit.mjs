/* AN ACCESSORY YOU BOUGHT IS AN ACCESSORY YOU CAN PUT ON, AND SEE.
 *
 * WHY THIS EXISTS. v422 shipped the whole selling half and none of the wearing
 * half. Gwart's Menagerie sold five pieces at 3,500 to 12,000 coins each, the
 * renderer could composite them (`petWornLayers` + `croppedPetImg` have taken a
 * `wear` argument since v421), and NOTHING in the app ever passed one: there was
 * no equip control, no kv row, and no caller with a non-null `wear`. A player
 * could spend 38,500 coins on clothes for a pet and have nowhere at all to put
 * them on. Tom, 2026-08-21: "did you make it possible to put the accessories on
 * bumbleseal yet people are waiting."
 *
 * So this file grades the CHAIN, end to end, through the real controls:
 * buy -> the piece is in her wardrobe -> tap it on -> she is wearing it on every
 * surface she is drawn on -> it survives a reload -> tap it off.
 *
 * WHAT IS BEING GUARDED, and each row fails somewhere different on purpose:
 *
 *   SAMPLE    setup. The shop sells a pet and accessories, PET_SLOTS has
 *             distinct z values, and the wardrobe actually renders a tile per
 *             owned piece. Nothing below can grade an empty screen: exits 2.
 *   CONTROL   the negative. On a save that owns everything and wears NOTHING,
 *             every surface draws exactly ONE layer. Without this, "5 layers"
 *             means nothing: a renderer that stacked the whole catalogue
 *             unconditionally would pass every other row in this file.
 *   EQUIP     tap each of the five REAL tiles; the piece must appear on the pet
 *             in the Stable, decoded (naturalWidth > 0) and visible (a non-zero
 *             rect). tally/CLAUDE.md rule 1: a CSS box measures fine over a
 *             blank frame.
 *   SLOT      one item per slot. Put the second purse on over the first and
 *             exactly one bag layer survives, and it is the second one.
 *   ZORDER    the worn layers are stacked in PET_SLOTS z order and the GLASSES
 *             are last, i.e. painted on top. Tom, 2026-08-20: "the glasses are
 *             ALWAYS on top in the hierarchy for cosmetics."
 *   RELOAD    persistence. A real page reload, not a re-render: she is still
 *             wearing the same four afterwards.
 *   SPECIES   an accessory refuses any pet but the one it is drawn for. Measured
 *             2026-08-21: the glasses overlap Bumbleseal's ink by 94.8% and
 *             every other pet by 0.0%, so on a lizard they would hang in empty
 *             air. With a full wardrobe stored, a different pet draws ONE layer.
 *   SURFACES  she wears them EVERYWHERE she is drawn, not just where they were
 *             equipped: Today's hero companion, the Stable's card, the Paddock
 *             scene and the fight plate, all four driven for real.
 *   REMOVE    tapping a worn tile takes that piece off and leaves the rest on.
 *   SNAPSHOT  static. Wear is a property of the INSTANCE, never of the viewer.
 *             Every call site that draws a SNAPSHOT pet (a friend, a rival, a
 *             defender) must name `wear`, or S.petWear answers and a rival's
 *             Bumbleseal is dressed out of your wardrobe. Same shape as the
 *             STACK rule in tests/figure-audit.mjs, and the same bug the figure
 *             contract already paid for once with shiny.
 *
 * PROVE-RED. Ten mutations, each RUN in a `cp -R` throwaway copy of this tree on
 * 2026-08-22, restoring the sources between runs. Every row below is red in at
 * least one of them, and this is what each actually printed:
 *
 *   petWearFor returns a fixed full wardrobe regardless of state
 *     -> CONTROL  an unworn save draws "5 layer(s): C6 + CG1 + CB2 + CM1 + CE1"
 *        EQUIP    every piece measures as all five already on
 *        SLOT, REMOVE  nothing a tap does changes anything
 *   croppedPetImg's `wear` default put back to `null`, which IS v422 verbatim
 *     -> 6 FAILED: EQUIP (every stack empty), SLOT, ZORDER ("stack " with
 *        nothing in it), RELOAD, SURFACES (all four screens empty) and REMOVE.
 *        This is the shipped bug, and it reds the whole file.
 *   petWear keyed by item id instead of by slot
 *     -> SLOT     "CB1 -> [CB1], then CB2 -> [CB1]", two bags fighting for one
 *        slot, and ZORDER / RELOAD / SURFACES / REMOVE follow it down
 *   CE's z swapped with CG's in PET_SLOTS
 *     -> ZORDER   "stack CE1 > CB2 > CM1 > CG1 ... top layer is slot CG, the
 *        glasses are CE": the stinger painted over the shades. ONLY ZORDER.
 *        (The first version of that row derived the top slot from the highest z
 *        and came back GREEN on this exact mutation. See the GLASSES note below.)
 *   the wardrobe held in a module variable instead of the kv row
 *     -> RELOAD   "nothing (was CG1 > CB2 > CM1 > CE1)", plus SURFACES, SPECIES
 *        and REMOVE, because a reload is how every one of them arrives
 *   the `petId === PET_SHOP.pet.id` test dropped from petWearFor
 *     -> SPECIES  "C2 draws 5 layer(s)": Mallard in a bee's glasses. ONLY SPECIES.
 *   petAsideHtml passing `wear: null`
 *     -> SURFACES "today-hero: [nothing]" and nothing else, which is the point:
 *        the Stable card is a direct petSpriteHtml call and stayed green, so the
 *        row really does fail per-surface rather than all-or-nothing
 *   togglePetWear always assigning, never deleting
 *     -> REMOVE   "removed CE1, still wearing [CG1,CB2,CM1,CE1]", plus EQUIP and
 *        SLOT, which both depend on being able to take a piece off again
 *   `wear: p.pet.wear || null` dropped from the friend profile
 *     -> SNAPSHOT names js/app.js and the line. ONLY SNAPSHOT.
 *   PET_SHOP.items emptied
 *     -> SETUP, exit 2, and not one live row runs
 *
 * Run: node tests/pet-wardrobe-audit.mjs [baseUrl] [--shots DIR]
 * HEADLESS_MODE=shell is required for --shots on this Mac (see godmode boot).
 * Self-serving: with no URL it serves this checkout, so it can never grade
 * production.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, settle, setWidth, serveTree, fightRung } from './godmode.js';
import { PET_SHOP, PET_SLOTS, BH_BY_ID, PET_CROP } from '../data/boneheadz.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};
const setup = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'SETUP'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) { console.log('\n  This audit GRADED NOTHING.'); process.exit(2); }
};

const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
/* THE SHOT HAS TO CONTAIN THE PET. Tapping a tile scrolls the wardrobe row into
   view, which puts the carousel above the top of a 852px viewport, so a
   screenshot taken straight after a tap frames the buttons and not the animal
   the tap just dressed. `pet: true` brings the ring back into frame first. */
const shot = async (page, name, { pet = false } = {}) => {
  if (!SHOTS) return;
  const file = path.join(SHOTS, `${name}.png`);
  if (pet) {
    await page.evaluate(() => document.querySelector('.cf-frame')?.scrollIntoView({ block: 'center' }));
    await sleep(350);
  }
  await settle(page);
  await page.screenshot({ path: file });
  console.log(`      shot: ${file}`);
};

/* ---------------------------------------------------------------- SAMPLE ---- */
const PET = PET_SHOP.pet && PET_SHOP.pet.id;
const ITEMS = (PET_SHOP.items || []).filter(i => BH_BY_ID[i.id]);
setup('SAMPLE Gwart sells a pet and accessories for it', !!PET && ITEMS.length > 0,
  `${PET} + ${ITEMS.length} pieces: ${ITEMS.map(i => `${i.id}/${(BH_BY_ID[i.id] || {}).slot}`).join(' ')}`);
/* The species check in petWearFor keys on this, so a pet with no measured crop
   would take the accessory path and land it somewhere nobody has looked. */
setup('SAMPLE the shop pet has a measured ink box, which is what every layer is registered against',
  !!PET_CROP[PET], PET ? JSON.stringify(PET_CROP[PET]) : 'no pet');
const zs = PET_SLOTS.map(s => s.z);
setup('SAMPLE every pet slot has its own z, so "stacked in order" is a fact and not a coin toss',
  new Set(zs).size === zs.length, PET_SLOTS.map(s => `${s.code}:${s.z}`).join(' '));
/* THE GLASSES ARE FOUND BY NAME, NEVER BY z, and that is the whole reason this
   row exists twice in the file. The first version of ZORDER derived "the top
   layer" from the highest z in PET_SLOTS and then checked the render against it,
   so swapping CE's z with CG's moved the expectation and the render together and
   the mutation came back GREEN: a check that cannot fail (tally/CLAUDE.md rule
   1). Tom's rule is about the GLASSES, not about whatever happens to hold the
   largest number: "the glasses are ALWAYS on top in the hierarchy for
   cosmetics." So the slot is identified by its label and the render is graded
   against that, independently of the z table. A rename reds this SAMPLE row
   rather than quietly disarming ZORDER. */
const GLASSES = PET_SLOTS.find(s => /glass/i.test(s.label || ''));
setup('SAMPLE the glasses slot is findable by name, so "glasses on top" is graded against Tom\'s rule and not against the z table',
  !!GLASSES, GLASSES ? `${GLASSES.label} = ${GLASSES.code} (z ${GLASSES.z})` : `no slot labelled like glasses in ${PET_SLOTS.map(s => s.label).join(', ')}`);
/* Two items in ONE slot is what SLOT below is made of. Without a doubled slot
   in the catalogue that row cannot be driven at all, and would pass on nothing. */
const bySlot = {};
for (const i of ITEMS) (bySlot[BH_BY_ID[i.id].slot] ||= []).push(i.id);
const DOUBLED = Object.entries(bySlot).find(([, ids]) => ids.length >= 2);
setup('SAMPLE two accessories share a slot, so one-item-per-slot is drivable',
  !!DOUBLED, DOUBLED ? `${DOUBLED[0]}: ${DOUBLED[1].join(' + ')}` : 'every slot holds exactly one item');

/* The expected stack, derived from the catalogue rather than typed out: base
   first, then one layer per filled slot in ascending z. Glasses last. */
const wornOrder = ids => PET_SLOTS.slice().sort((a, b) => a.z - b.z)
  .map(sl => ids.find(id => (BH_BY_ID[id] || {}).slot === sl.code)).filter(Boolean);

/* ------------------------------------------------------------- SNAPSHOT ---- */
/* A snapshot pet belongs to somebody else. `wear` left undefined means "ask
   S.petWear", which is the VIEWER's wardrobe, so a call site that draws a
   rival's pet without naming wear paints your purse on their Bumbleseal. This
   is the shiny bug in a new coat, so it gets the shiny bug's guard shape: a line
   grep, with the reason printed. */
const APP = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8').split('\n');
const SNAP_CALL = /pet(?:SpriteHtml|PortraitHtml|AsideHtml)\s*\(/;
const snapBad = [];
let snapSites = 0;
APP.forEach((ln, i) => {
  if (!SNAP_CALL.test(ln)) return;
  if (/^\s*(?:function|\/\/|\*|\/\*)/.test(ln)) return;
  /* A SNAPSHOT is recognised by the shape every one of them has: a `.pet`
     property read off somebody else's profile object on the same line. Your own
     pet is passed as a bare species or an instance row and never looks like
     this. The holder must start LOWERCASE, which is what separates `p.pet.id`
     (a friend's profile) from `PET_SHOP.pet.id` (the shop shelf, a species with
     no owner at all); without that the shelf was reported as an undressed
     rival on the first run of this file. */
  if (!/\b[a-z]\w*\.pet\.(?:id|shiny|wear)\b/.test(ln)) return;
  snapSites++;
  if (!/\bwear\s*:/.test(ln)) snapBad.push(`js/app.js:${i + 1}  ${ln.trim().slice(0, 96)}`);
});
setup('SNAPSHOT there are snapshot-pet call sites to grade at all', snapSites > 0, `${snapSites} found`);
ok('SNAPSHOT every call site drawing somebody ELSE\'s pet says whose wardrobe it draws',
  snapBad.length === 0,
  snapBad.length
    ? '\n      ' + snapBad.join('\n      ') + '\n      (wear left undefined means S.petWear, which is the VIEWER\'s wardrobe)'
    : `${snapSites} snapshot sites, all naming wear`);

/* ------------------------------------------------------------------ live ---- */
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--') && /^https?:/.test(a));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || process.env.URL || srv.url;
const { browser, page } = await boot(base);

/* The layer stack of a rendered pet, as the player's eye sees it: DOM order is
   paint order here (every layer is position:absolute inside one .petcrop), so
   the LAST entry is the one on top. Decoded and visible are asserted per layer,
   never inferred from the box. */
const stackAt = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  return [...el.querySelectorAll('img')].map(i => {
    const r = i.getBoundingClientRect();
    return { src: i.getAttribute('src'), nw: i.naturalWidth, w: Math.round(r.width), h: Math.round(r.height) };
  });
}, sel);
const idsOf = st => (st || []).slice(1).map(l => (l.src.match(/([A-Z]+\d+)\.png$/) || [])[1]).filter(Boolean);
const allDrawn = st => (st || []).length > 0 && st.every(l => l.nw > 0 && l.w > 0 && l.h > 0);

const STABLE_PET = '.cf-card.active .cf-art .petcrop';
const openStable = async () => {
  await page.evaluate(() => { location.hash = '#/pets'; });
  await sleep(900);
  await page.evaluate(() => document.getElementById('stableBtn')?.click());
  await sleep(1700);
};
/* A REAL TAP on a real tile, at its centre, after scrolling it into the
   horizontal scroller's view. Programmatic .click() does not reach some of this
   app's handlers (see godmode.click), and a tile below or beside the fold
   measures fine while a mouse click at its coordinates lands in dead space. */
const tapTile = async id => {
  const hit = await page.evaluate(i => {
    const b = document.querySelector(`[data-petwear="${i}"]`);
    if (!b) return null;
    b.scrollIntoView({ block: 'center', inline: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
  if (!hit) return false;
  await page.mouse.click(hit.x, hit.y);
  await sleep(650);
  return true;
};
const storedWear = () => page.evaluate(async () => (await (await import('/js/loot.js')).petWear()));

try {
  await seed(page, { level: 20, coins: 400000 });
  await setWidth(page, 393, 852);

  /* BOUGHT, NOT GRANTED. buyPetItem is the path the money goes through and the
     only way an accessory legitimately enters the save; a hand-written inv row
     would prove the wardrobe can render something somebody else wrote. */
  const bought = await page.evaluate(async ids => {
    const loot = await import('/js/loot.js');
    const out = [];
    for (const id of ids) { const r = await loot.buyPetItem(id); out.push({ id, ok: !!r && r.ok !== false }); }
    return out;
  }, [PET, ...ITEMS.map(i => i.id)]);
  setup('SAMPLE the pet and every accessory could be bought through the real shop path',
    bought.every(b => b.ok), bought.map(b => `${b.id}${b.ok ? '' : ' REFUSED'}`).join(' '));

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);
  await openStable();

  const tiles = await page.evaluate(() => [...document.querySelectorAll('[data-petwear]')].map(b => b.dataset.petwear));
  setup('SAMPLE her wardrobe renders a tile for every piece owned',
    tiles.length === ITEMS.length && ITEMS.every(i => tiles.includes(i.id)),
    `${tiles.length} tiles: ${tiles.join(' ')} (owns ${ITEMS.length})`);

  /* ---- CONTROL: the zero state, before a single tap ---- */
  const bare = await stackAt(page, STABLE_PET);
  ok('CONTROL a save that owns every piece and wears none draws the pet and nothing else',
    !!bare && bare.length === 1 && allDrawn(bare),
    bare ? `${bare.length} layer(s): ${bare.map(l => l.src.split('/').pop()).join(' + ')}` : 'no pet rendered in the Stable');
  await shot(page, '00-wardrobe-nothing-worn');

  /* ---- EQUIP: each piece, one at a time, by tapping its real tile ---- */
  const solo = [];
  for (const it of ITEMS) {
    if (!await tapTile(it.id)) { solo.push({ id: it.id, err: 'no tile' }); continue; }
    const st = await stackAt(page, STABLE_PET);
    const worn = idsOf(st);
    solo.push({ id: it.id, worn, drawn: allDrawn(st), on: worn.length === 1 && worn[0] === it.id });
    await shot(page, `01-worn-${it.id}-${(BH_BY_ID[it.id].name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, { pet: true });
    await tapTile(it.id);   // back off, so the next one is measured alone
  }
  const soloBad = solo.filter(s => !s.on || !s.drawn);
  ok('EQUIP tapping a wardrobe tile puts that piece on the pet, decoded and visible',
    soloBad.length === 0 && solo.length === ITEMS.length,
    soloBad.length
      ? soloBad.map(s => `${s.id}: ${s.err || `stack [${(s.worn || []).join(',')}] drawn=${s.drawn}`}`).join('; ')
      : `${solo.length} of ${ITEMS.length} pieces, each alone on the pet`);

  /* ---- SLOT: one item per slot ---- */
  const [dslot, dids] = DOUBLED;
  await tapTile(dids[0]);
  const first = idsOf(await stackAt(page, STABLE_PET));
  await tapTile(dids[1]);
  const second = idsOf(await stackAt(page, STABLE_PET));
  const inSlot = second.filter(id => (BH_BY_ID[id] || {}).slot === dslot);
  ok(`SLOT a second ${dslot} replaces the first: one item per slot, never two`,
    first.length === 1 && first[0] === dids[0] && inSlot.length === 1 && inSlot[0] === dids[1],
    `${dids[0]} -> [${first.join(',')}], then ${dids[1]} -> [${second.join(',')}]`);

  /* ---- ZORDER: fill every slot, then read the paint order ---- */
  const oneEach = PET_SLOTS.map(sl => (bySlot[sl.code] || []).slice(-1)[0]).filter(Boolean);
  const wearNow = await storedWear();
  for (const id of oneEach) if (wearNow[BH_BY_ID[id].slot] !== id) await tapTile(id);
  const full = await stackAt(page, STABLE_PET);
  const fullIds = idsOf(full);
  const expect = wornOrder(oneEach);
  const topSlot = (BH_BY_ID[fullIds[fullIds.length - 1]] || {}).slot;
  ok('ZORDER every worn piece is stacked in PET_SLOTS z order, with the GLASSES painted last (on top)',
    fullIds.join(',') === expect.join(',')
      && fullIds.length === oneEach.length
      && topSlot === GLASSES.code
      && allDrawn(full),
    `stack ${fullIds.join(' > ')} | expected by z ${expect.join(' > ')} | top layer is slot ${topSlot}, the glasses are ${GLASSES.code}`);
  await shot(page, '02-wardrobe-all-slots-worn', { pet: true });

  /* ---- RELOAD: a real reload, not a re-render ---- */
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);
  await openStable();
  const afterReload = idsOf(await stackAt(page, STABLE_PET));
  ok('RELOAD what she is wearing survives a full page reload',
    afterReload.join(',') === expect.join(','),
    `${afterReload.join(' > ') || 'nothing'} (was ${expect.join(' > ')})`);
  await shot(page, '03-after-reload', { pet: true });

  /* ---- SURFACES: every screen she is drawn on ---- */
  const surfaces = [];
  const measure = async (key, sel) => {
    const st = await stackAt(page, sel);
    surfaces.push({ key, ids: idsOf(st), drawn: allDrawn(st) });
  };
  await measure('stable-card', STABLE_PET);
  await page.evaluate(() => document.getElementById('stableToPaddock')?.click());
  await sleep(2200);
  await measure('paddock-scene', '.pdk-bob .petcrop');
  await shot(page, '04-paddock-scene');
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(2200);
  await measure('today-hero', '#bhStage .hero-companion .petcrop');
  await shot(page, '05-today-hero');
  const inFight = await fightRung(page, 1);
  setup('SAMPLE a real fight could be reached, so the fight plate can be graded', inFight, `fightRung(1) -> ${inFight}`);
  await sleep(1200);
  await measure('fight-plate', '#petStage .petcrop');
  await shot(page, '06-fight-plate');
  const surfBad = surfaces.filter(s => s.ids.join(',') !== expect.join(',') || !s.drawn);
  ok('SURFACES she wears her wardrobe on every surface she is drawn on, not only where it was equipped',
    surfaces.length === 4 && surfBad.length === 0,
    surfBad.length
      ? surfBad.map(s => `${s.key}: [${s.ids.join(',') || 'nothing'}] drawn=${s.drawn}`).join('; ')
      : surfaces.map(s => `${s.key} ${s.ids.length}`).join(', ') + ` layers each (expected ${expect.length})`);

  /* ---- SPECIES: the wardrobe is HERS ---- */
  /* An accessory is drawn pre-positioned for one body, so on any other pet it
     hangs in empty air. Granted and equipped through the real paths, with the
     full wardrobe still in the kv row: the refusal has to come from the
     renderer, not from an empty save. A STATIC species, because an animated one
     never reaches croppedPetImg and would pass by not being measured at all. */
  const other = Object.keys(PET_CROP).find(id => id !== PET && BH_BY_ID[id] && !['C1', 'C4', 'CX'].includes(id));
  setup('SAMPLE there is a second, statically drawn pet to refuse the wardrobe', !!other, `using ${other}`);
  /* No sheet-closing dance here: the fight above is still on screen, and
     clicking through .sheet-close in a loop navigates mid-evaluate and kills the
     execution context. The grant does not need the DOM, and the reload that
     follows clears whatever was open anyway. */
  await page.evaluate(async sp => {
    const loot = await import('/js/loot.js');
    await loot.grantPet(sp);
    const inst = (await loot.petInstances()).find(x => x.sp === sp);
    if (inst) await loot.setEquippedPet(inst.iid);
  }, other);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);
  const otherStack = await stackAt(page, '#bhStage .hero-companion .petcrop');
  const stillStored = await storedWear();
  ok('SPECIES an accessory drawn for one pet is refused by every other pet',
    !!otherStack && otherStack.length === 1 && Object.keys(stillStored).length === expect.length,
    `${other} draws ${otherStack ? otherStack.length : 0} layer(s) while the wardrobe still holds ${JSON.stringify(stillStored)}`);
  await shot(page, '07-other-pet-refuses');

  /* ---- REMOVE: put her back on, then take one off ---- */
  await page.evaluate(async sp => {
    const loot = await import('/js/loot.js');
    const inst = (await loot.petInstances()).find(x => x.sp === sp);
    if (inst) await loot.setEquippedPet(inst.iid);
  }, PET);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);
  await openStable();
  const takeOff = expect[expect.length - 1];              // the glasses: the top layer
  await tapTile(takeOff);
  const left = idsOf(await stackAt(page, STABLE_PET));
  ok('REMOVE tapping a worn tile takes that piece off and leaves the rest on',
    !left.includes(takeOff) && left.join(',') === expect.filter(id => id !== takeOff).join(','),
    `removed ${takeOff}, still wearing [${left.join(',') || 'nothing'}]`);
  await shot(page, '08-after-remove', { pet: true });
} finally {
  await browser.close();
  if (srv) await srv.close();
}

console.log(fails
  ? '\nPET WARDROBE: FAILED'
  : '\nPET WARDROBE: bought, worn, stacked in order, persistent, hers alone, and on every surface');
process.exit(fails);

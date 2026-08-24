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
 *   MIRROR    you can SEE her while you dress her. Tom, 2026-08-21: "when you
 *             put the item on you have to scroll back up to see if it equipped
 *             and how it looks." Her drawn INK and one WHOLE tile inside the
 *             viewport at the same time, at the position the sheet opens in,
 *             at 393x852 and 320x568 with --sat 0 and 59. Ink rather than the
 *             .petcrop box, per figure-contract rule 3.
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
 * MIRROR got its own three, RUN the same way on 2026-08-22, each in a `cp -R`
 * copy of the fixed tree. Both halves of the v424 fix are load-bearing and each
 * one is red on its own:
 *
 *   the wardrobe put back under the action row, which IS v423 verbatim
 *     -> MIRROR  all four: "tile 1 785.7..911.9 of 852 (+59.9px past the fold,
 *        0 whole tiles)". The sheet still opens far enough down to hold the
 *        strip, but the panel no longer fits under the ring at any scroll
 *        position, so buying the tile costs the pet and the row stays red.
 *   the scroll-to-hold-both block deleted from render()
 *     -> MIRROR  the two 320x568 rows ONLY: "ink 514.5..615.2 OFF-SCREEN | tile
 *        1 703..829.2 of 568". 393x852 stays green on the reorder alone, which
 *        is the point: the narrow phone is a separate failure and is graded as
 *        one.
 *   both, i.e. the shipped v423 layout
 *     -> MIRROR  all four, at +343.9 / +402.9 / +696.5 / +755.5px past the fold
 *
 * The four MIRROR configurations are one row on purpose, because a viewport
 * that quietly stopped being measured would be a green pass on nothing: the
 * SAMPLE row above it requires the wardrobe to be VISIBLE with tiles in it and
 * a pet rendered in every one of the four before MIRROR grades anything.
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

  /* ---- BENCHED: she keeps her swag with somebody else out front ----
   * Tom, 2026-08-22: "you should also be able to have pets unequipped but keep
   * their custom swag on like the bumbleseal outfit and then she can wear it
   * while idle in the paddock."
   *
   * THE SPECIES ROW ABOVE HAS ALREADY BENCHED HER, which is why this sits here
   * and not in a setup of its own: `other` is equipped, she is idle, and the
   * wardrobe is still in the kv row. So the state is free and the only question
   * left is whether the Paddock draws it.
   *
   * THREE SURFACES, because they are three different renderers and only one of
   * them was ever right. Measured on this tree 2026-08-23, benched, with a
   * Mallard out front:
   *   scene  five decoded layers at 87px. This ALREADY worked: the scene draws
   *          through the app's own petSpriteHtml, which defaults wear to
   *          S.petWear and never asked who was equipped.
   *   tile   ONE layer. The species grid is a plain image built in
   *          js/paddock-cards.js, a pure module that could not reach the app's
   *          renderer and had no wear in its model at all.
   *   card   ONE layer, same cause. So the collection panel showed her bare two
   *          inches under a scene that showed her dressed.
   * SURFACES above cannot catch any of this: it drives the same three-quarters
   * of the app with her EQUIPPED, and it never opens the collection panel.
   *
   * The negative is carried by the OTHER species in the same sample rather than
   * by a second run: an unowned/locked tile and a pet the clothes are not drawn
   * for must both still measure exactly one layer in the same screenshot, so a
   * renderer that stacked the wardrobe onto everything fails here rather than
   * passing for the wrong reason. */
  const benchedEquipped = await page.evaluate(async () => (await (await import('/js/loot.js')).equippedPetIid()));
  const benchedWear = await storedWear();
  setup('SAMPLE somebody else is out front, so "benched" is the state being graded',
    !!benchedEquipped && !benchedEquipped.endsWith(`-${PET}`) && Object.keys(benchedWear).length === expect.length,
    `equipped ${benchedEquipped}, ${PET} benched, wardrobe still ${JSON.stringify(benchedWear)}`);
  await page.evaluate(() => { location.hash = '#/pets'; });
  await sleep(900);
  await page.evaluate(() => document.getElementById('stableBtn')?.click());
  await sleep(1500);
  await page.evaluate(() => document.getElementById('stableToPaddock')?.click());
  await sleep(2400);
  const benchScene = await stackAt(page, `.pdk-pet[data-pdk="${PET}"] .petcrop`);
  const layersIn = sel => page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    return [...el.querySelectorAll('img')].map(i => {
      const r = i.getBoundingClientRect();
      return { src: i.getAttribute('src'), nw: i.naturalWidth, w: Math.round(r.width), h: Math.round(r.height) };
    });
  }, sel);
  const benchTile = await layersIn(`.pdk-tile[data-sp="${PET}"]`);
  const otherTile = await layersIn(`.pdk-tile[data-sp="${other}"]`);
  const lockedTile = await page.evaluate(() => {
    const el = document.querySelector('.pdk-tile.pdk-lockt[data-sp]');
    return el ? { sp: el.dataset.sp, n: el.querySelectorAll('img').length } : null;
  });
  await shot(page, '07b-benched-paddock');
  /* The card is behind a real tap on her tile, not a mounted builder: the panel
     is the surface Tom is looking at and a model that renders correctly into
     nothing is the seam-with-no-consumer failure. */
  const tapped = await page.evaluate(sp => {
    const t = document.querySelector(`.pdk-tile[data-sp="${sp}"]`);
    if (!t) return false;
    t.scrollIntoView({ block: 'center' });
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, PET);
  if (tapped) await page.mouse.click(tapped.x, tapped.y);
  await sleep(1200);
  const benchCard = await layersIn('.pdk-card .pdk-thumb');
  await shot(page, '07c-benched-card');
  const stackOf = st => (st || []).slice(1).map(l => (l.src.match(/([A-Z]+\d+)\.png$/) || [])[1]).filter(Boolean);
  const benchBad = [];
  for (const [key, st] of [['paddock-scene', benchScene], ['collection-tile', benchTile], ['collection-card', benchCard]]) {
    if (!st || !st.length) { benchBad.push(`${key}: nothing rendered`); continue; }
    const ids = stackOf(st);
    if (ids.join(',') !== expect.join(',')) benchBad.push(`${key}: [${ids.join(',') || 'nothing'}] (expected ${expect.join(',')})`);
    else if (!allDrawn(st)) benchBad.push(`${key}: stack correct but not decoded/visible`);
  }
  // the negative, in the same screenshot: a pet the clothes are not drawn for,
  // and a species nobody owns, both still bare
  if (!otherTile || otherTile.length !== 1) benchBad.push(`${other} tile draws ${otherTile ? otherTile.length : 0} layer(s), expected 1`);
  if (!lockedTile || lockedTile.n !== 1) benchBad.push(`a locked tile draws ${lockedTile ? lockedTile.n : 'no'} layer(s), expected 1`);
  ok('BENCHED an idle pet keeps her swag on in the Paddock: the scene, the collection tile and the card',
    benchBad.length === 0,
    benchBad.length ? benchBad.join('; ')
      : `scene/tile/card all ${expect.length} layers (${expect.join(' > ')}); ${other} and a locked tile still 1 each`);

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

  /* ---- MIRROR: you cannot judge a piece you cannot see while you tap it ---- */
  /* Tom, 2026-08-21: "when you put the item on you have to scroll back up to see
     if it equipped and how it looks. You need to be able to see her and the
     items at the same time so you know how it looks trying on."
     Graded on the RENDER, at the position the sheet OPENS in, with no scrolling
     of our own: her drawn INK and at least one WHOLE tile inside the viewport at
     the same time. Ink, not the box, per figure-contract rule 3: .petcrop is a
     square with a lot of transparent air in it and its rect says nothing about
     where the animal is, so the ink is the PET_CROP fractions mapped through the
     rendered image's geometry. A whole tile, not any part of one, because half a
     tile is not something you can read a name off or aim a thumb at.
     Both widths and both insets (anti-regression rule 4): 320x568 is the
     narrowest phone this app supports and the one where the Stable's header
     stack pushes the ring itself under the fold, and a 59px inset takes another
     59px off the sheet. Measured on the shipped v423 tree, all four were red:
     the first tile ended 343.9 / 402.9 / 696.5 / 755.5px past the fold, and on
     320x568 the ring itself was off-screen before the wardrobe was reached. */
  const MIRROR = [[393, 852, 0], [393, 852, 59], [320, 568, 0], [320, 568, 59]];
  const seen = [];
  for (const [w, h, sat] of MIRROR) {
    for (let i = 0; i < 3; i++) {
      if (!await page.evaluate(() => { const b = document.querySelector('.sheet-close'); if (b) { b.click(); return true; } return false; })) break;
      await sleep(400);
    }
    await setWidth(page, w, h);
    await page.evaluate(s => {
      document.querySelectorAll('style[data-mirror-sat]').forEach(n => n.remove());
      if (!s) return;
      const st = document.createElement('style');
      st.dataset.mirrorSat = '1';
      st.textContent = `:root{--sat:${s}px !important}`;
      document.head.appendChild(st);
    }, sat);
    await sleep(300);
    await openStable();
    seen.push(await page.evaluate(c => {
      const img = document.querySelector('.cf-card.active .cf-art .petcrop img');
      const tiles = [...document.querySelectorAll('.pw-item')];
      const wear = document.querySelector('.pet-wear');
      const sat2 = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
      const W = window.innerWidth, H = window.innerHeight;
      const r = img && img.getBoundingClientRect();
      /* every worn layer carries the identical transform (croppedPetImg), so any
         one of them maps the crop the same way; the base layer is the honest one. */
      const ink = r ? {
        y: +(r.top + c.y0 * r.height).toFixed(1),
        b: +(r.top + c.y1 * r.height).toFixed(1),
        x: +(r.left + c.x0 * r.width).toFixed(1),
      } : null;
      const whole = tiles.map(t => t.getBoundingClientRect())
        .filter(b => b.top >= sat2 && b.bottom <= H && b.left >= 0 && b.right <= W);
      const first = tiles[0] && tiles[0].getBoundingClientRect();
      return {
        sat: sat2, hidden: !wear || wear.hasAttribute('hidden'),
        ink, inkIn: !!ink && ink.y >= sat2 && ink.b <= H,
        tiles: tiles.length, whole: whole.length, H,
        firstTile: first ? { y: +first.top.toFixed(1), b: +first.bottom.toFixed(1) } : null,
      };
    }, PET_CROP[PET]));
    await shot(page, `09-mirror-${w}x${h}-sat${sat}`);
  }
  setup('SAMPLE the wardrobe is on screen in every viewport graded, so MIRROR is not grading a hidden panel',
    seen.every(s => !s.hidden && s.tiles > 0 && s.ink),
    seen.map((s, i) => `${MIRROR[i][0]}x${MIRROR[i][1]}-sat${MIRROR[i][2]}: ${s.hidden ? 'HIDDEN' : `${s.tiles} tiles`}${s.ink ? '' : ', NO PET'}`).join('; '));
  const mirrorBad = seen.filter(s => !s.inkIn || s.whole < 1);
  ok('MIRROR she and a whole wardrobe tile are on screen together, at the position the sheet opens in',
    mirrorBad.length === 0,
    seen.map((s, i) => {
      const cfg = `${MIRROR[i][0]}x${MIRROR[i][1]}-sat${MIRROR[i][2]}`;
      const gap = s.firstTile ? (s.firstTile.b - s.H).toFixed(1) : '?';
      return `${cfg} ink ${s.ink.y}..${s.ink.b}${s.inkIn ? '' : ' OFF-SCREEN'} | tile 1 ${s.firstTile.y}..${s.firstTile.b} of ${s.H}${s.whole ? '' : ` (${gap > 0 ? `+${gap}` : gap}px past the fold, 0 whole tiles)`}`;
    }).join('\n      '));
} finally {
  await browser.close();
  if (srv) await srv.close();
}

console.log(fails
  ? '\nPET WARDROBE: FAILED'
  : '\nPET WARDROBE: bought, worn, stacked in order, persistent, hers alone, and on every surface');
process.exit(fails);

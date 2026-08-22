/* "TAKE IT ALL OFF": THE WARDROBE'S ONE-TAP RESET.
 *
 * A player suggested a button that clears the Bonehead so a new outfit starts
 * from nothing, and Tom approved it on 2026-08-21. The feature is four lines.
 * The RISK is the whole reason this file exists: a button that touches worn
 * cosmetics sits one careless line away from touching OWNED ones, and a reset
 * that quietly bins a legendary somebody paid coins or real money for is not a
 * bug you get to apologise for. Everything here is built around that.
 *
 * WHAT IT MUST DO
 *   every non-gear cosmetic slot comes off, slots with a `default` (B, SK) go
 *   back to the default rather than empty, and the transmog map clears.
 *
 * WHAT IT MUST NEVER DO, and these are the rows that matter
 *   1. remove, sell, salvage or refund anything. The `inv` store is compared
 *      ROW BY ROW, not by count: a swap that deleted a legendary and added a
 *      common would keep the count identical.
 *   2. move stats. `gearloadout` is compared whole, and a gear slot must keep
 *      BOTH its piece and its `equipped` art, because the two desyncing is how
 *      a "look" change silently becomes a power change.
 *   3. touch the pet. Slot C belongs to the Stable and `petWear` (v423) is its
 *      own system.
 *   4. bin the saved fits, or the paid-look receipts. transmogPrice reads
 *      `paidlooks`, and paidLooks() grandfathers v221-era purchases by seeding
 *      from the LIVE transmog map: clear the map without banking the receipts
 *      first and the player is charged dust a second time for a look they
 *      already own. FREE asserts the price of putting it back is still 0.
 *   5. commit on one tap. It arms first, the fit-rail idiom.
 *
 * HOW IT IS DRIVEN. The REAL chip, tapped twice, in the real Wardrobe, after a
 * seeded save that actually has something on. Nothing here calls resetLook()
 * directly: that would prove the function and nothing about whether the app
 * ever reaches it (tally/CLAUDE.md, the FX rule, same class of mistake).
 *
 * SETUP and CONTROL refuse to grade anything unless the seed really landed and
 * the doll really had several pieces on it, because "every slot is now empty"
 * passes perfectly on a Bonehead that was already naked.
 *
 * PROVEN RED in a cp -R throwaway copy, one mutation at a time, each verified
 * to have applied before the result was read:
 *   M1  resetLook() also does db.clear('inv')      -> OWNED x3 + REVERSIBLE red
 *   M2  resetLook() writes kvSet('gearloadout', {}) -> STATS, GEAR, CLEARED red
 *   M3  the plan stops excluding slot 'C'           -> PET red
 *   M4  the plan stops excluding slots holding gear -> GEAR red
 *   M5  resetLook() also does kvSet('outfits', [])  -> FITS red
 *   M6  the loop kvSets equipped to {} wholesale    -> GEAR, PET red
 *   M7  resetLookPlan() returns no slots            -> CLEARED, DEFAULT, VISIBLE red
 *   M8  the chip is wired with a plain click        -> ARM x2 red
 *   M9  resetLook() skips the paidLooks() bank      -> FREE red
 *   M10 resetLook() also does coinsAdd(-50)         -> CURRENCY red
 *   M11 the chip renders unconditionally            -> EXIT red
 *   M12 resetLook() leaves the transmog map alone   -> MOG, EXIT red
 * And the SETUP row that the chip is offered at all goes red on the parent
 * commit dafe778a, where the feature does not exist.
 *
 * M6 is worth reading twice: wiping `equipped` wholesale does NOT red DEFAULT,
 * because equipped() merges the slot defaults back in on every read, so B and
 * SK come back on their own. DEFAULT's real job is the other direction, and M7
 * is what proves it: a reset that clears nothing leaves the seeded non-default
 * body and skull in place, and DEFAULT and VISIBLE both go red on it.
 *
 * Run: node tests/wardrobe-reset-audit.mjs [baseUrl]
 */
import { boot, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = process.env.SHOTS || null;
const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srvHandle.url;
const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};
const finish = async (browser) => {
  if (browser) await browser.close();
  if (srvHandle) await srvHandle.close();
  console.log(`\n${fails.length ? fails.length + ' FAILED' : 'all green'}`);
  process.exit(fails.length ? 1 : 0);
};

const { browser, page } = await boot(base);
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

/* ---------- SEED: a Bonehead that is actually wearing things ---------- */
/* One plain cosmetic in every slot we can fill, a statted piece with a
   transmog over it in one gear slot, a saved fit, and a petWear row. The pieces
   are granted through loot.grantCosmetic / grantGear, the real ownership path,
   so the `inv` rows below are the shape the app really stores. */
const seed = await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const { BH_ITEMS, BH_SLOTS } = await import('./data/boneheadz.js');
  const { GEAR_ITEMS, GEAR_SLOTS } = await import('./js/gear.js');
  const db = await import('./js/db.js');

  const wornPlain = [];
  for (const s of BH_SLOTS) {
    if (s.code === 'C') continue;                       // the Stable owns the pet
    // a piece that is NOT this slot's default, so "it came off" is observable
    const item = BH_ITEMS.find(i => i.slot === s.code && i.id !== s.default);
    if (!item) continue;
    await loot.grantCosmetic(item.id, 'test');
    await loot.equip(s.code, item.id);
    wornPlain.push([s.code, item.id]);
  }

  // one statted piece, level 1 so it can actually be worn, plus a disguise on it
  const gear = GEAR_ITEMS.find(g => g.minLevel <= 1 && GEAR_SLOTS.includes(g.slot));
  let gearOn = null, mogOn = null, mogCost = null;
  if (gear) {
    await loot.grantGear(gear.id, 'test');
    await loot.equipGear(gear.slot, gear.id);
    gearOn = { slot: gear.slot, id: gear.id, art: gear.artId };
    const alt = BH_ITEMS.find(i => i.slot === gear.slot && i.id !== gear.artId);
    if (alt) {
      await loot.grantCosmetic(alt.id, 'test');
      // a disguise over a statted piece is the only transmog that costs dust,
      // so the seed has to be able to afford one or the whole branch is skipped
      await loot.boneDustAdd(5000);
      mogCost = await loot.transmogPrice(gear.slot, alt.id);
      const r = await loot.applyTransmog(gear.slot, alt.id);
      if (r.ok) mogOn = { slot: gear.slot, art: alt.id };
    }
  }

  await loot.captureFit('Audit fit');
  await db.kvSet('petWear', { PH: 'PH-audit-sentinel' });   // v423's own key, untouched by this
  return {
    wornPlain, gearOn, mogOn, mogCost,
    fits: (await loot.fits()).length,
  };
}).catch(e => ({ error: String(e) }));

if (seed.error) { ok('SETUP the seed landed', false, seed.error); await finish(browser); }

/* Every read the assertions are built on, in one pass. `inv` is normalised with
   sorted keys so two rows differing only in property order do not read as a
   change, and it is kept as a SORTED LIST OF ROWS: a count is not enough,
   because deleting a legendary and adding a common leaves the count alone. */
const snap = () => page.evaluate(async () => {
  const db = await import('./js/db.js');
  const loot = await import('./js/loot.js');
  const { BH_SLOTS } = await import('./data/boneheadz.js');
  const norm = r => JSON.stringify(Object.keys(r).sort().map(k => [k, r[k]]));
  const inv = await db.db.all('inv');
  const eq = await loot.equipped({ raw: true });
  const lo = await loot.gearLoadout();
  return {
    inv: inv.map(norm).sort(),
    invCount: inv.length,
    cosIds: [...await loot.ownedCosmeticIds()].sort(),
    gearIds: [...await loot.ownedGearIds()].sort(),
    equipped: eq,
    look: await loot.equipped(),
    gearLo: lo,
    transmog: await loot.transmogMap(),
    outfits: await db.kvGet('outfits', []),
    petWear: await db.kvGet('petWear', null),
    coins: await loot.coins(),
    dust: await loot.boneDust(),
    // slots holding a plain cosmetic that is not the slot default, and not gear
    dressed: BH_SLOTS.filter(s => s.code !== 'C' && !lo[s.code] && eq[s.code] && eq[s.code] !== s.default)
      .map(s => s.code),
    defaults: Object.fromEntries(BH_SLOTS.filter(s => s.default).map(s => [s.code, s.default])),
  };
});

const openWardrobe = async () => {
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await sleep(1800);
  await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="wardrobe"]')?.click());
  await sleep(2200);
};
const chip = () => page.evaluate(() => {
  const b = document.querySelector('[data-fit-reset]');
  return b ? { there: true, label: b.textContent.trim(), armed: b.dataset.armed || '0' } : { there: false };
});
const shoot = async (name) => {
  if (!SHOTS) return;
  const el = await page.$('#chContent');
  if (el) await el.screenshot({ path: `${SHOTS}/${name}.png` });
};

await openWardrobe();
const before = await snap();
const chip0 = await chip();

/* ---------- SETUP + CONTROL: nothing below may pass vacuously ---------- */
ok('SETUP the seed granted and equipped real pieces', !seed.error && seed.wornPlain.length >= 6,
  `${seed.wornPlain?.length || 0} slots seeded`);
ok('SETUP the inventory is not empty (an empty sample cannot prove ownership survived)',
  before.invCount > 0, `${before.invCount} inv rows`);
ok('SETUP the Wardrobe rendered its fit rail', await page.evaluate(() => !!document.querySelector('.fit-rail')));
ok('SETUP the reset chip is offered while something is on', chip0.there, JSON.stringify(chip0));
/* THE CONTROL. "every cosmetic slot is empty afterwards" is trivially true of a
   naked Bonehead, so the run is only meaningful if several slots were dressed
   AND a disguise was on. If this row is red, every CLEARED row below is noise. */
ok('CONTROL the Bonehead really was dressed before the tap', before.dressed.length >= 6,
  `${before.dressed.length} dressed slots: ${before.dressed.join(',')}`);
ok('CONTROL a statted piece is worn, so STATS has something to protect',
  !!seed.gearOn && !!before.gearLo[seed.gearOn.slot], JSON.stringify(seed.gearOn));
ok('CONTROL a transmog is on, so MOG and FREE have something to protect',
  Object.keys(before.transmog).length > 0, JSON.stringify(before.transmog));
ok('CONTROL the disguise genuinely costs dust when it has not been paid for',
  seed.mogCost > 0, `cost ${seed.mogCost} dust`);
await shoot('reset-before');

if (!chip0.there) { await finish(browser); }

/* ---------- ARM: one tap must not commit ---------- */
await page.evaluate(() => document.querySelector('[data-fit-reset]').click());
await sleep(700);
const armed = await chip();
const midway = await snap();
ok('ARM one tap arms the chip instead of stripping', armed.armed === '1' && armed.label !== chip0.label,
  JSON.stringify(armed));
ok('ARM one tap changes nothing on the Bonehead',
  JSON.stringify(midway.equipped) === JSON.stringify(before.equipped)
  && JSON.stringify(midway.transmog) === JSON.stringify(before.transmog),
  `${JSON.stringify(midway.equipped)} vs ${JSON.stringify(before.equipped)}`);

/* ---------- THE v221 SAVE, staged one line before the commit ----------
   `paidlooks` grandfathers pre-v221 purchases by seeding from the LIVE transmog
   map, and it WRITES on read: opening the Wardrobe prices every look in the
   slot, so by now the receipt has been re-banked as a side effect of rendering.
   Emptying it HERE puts the save back in the only state where the FREE row can
   fail, and makes resetLook's own bank the one thing standing between the
   player and paying twice. Nothing between this line and the tap reads a price,
   so nothing else can re-bank it. */
const staged = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('paidlooks', []);
  return ((await db.kvGet('paidlooks', [])) || []).length;
});
ok('CONTROL the receipt really is gone before the tap (else FREE passes for free)',
  staged === 0, `${staged} paidlooks rows`);

/* ---------- the second tap commits ---------- */
await page.evaluate(() => document.querySelector('[data-fit-reset]').click());
await sleep(1800);
const after = await snap();
await shoot('reset-after');

/* ---------- OWNED: the rows that would cost a player money ---------- */
ok('OWNED every inventory row survives, byte for byte',
  JSON.stringify(after.inv) === JSON.stringify(before.inv),
  `${before.invCount} rows before, ${after.invCount} after` +
  (before.invCount === after.invCount ? '' : ' -- ROWS WERE REMOVED'));
ok('OWNED the set of owned cosmetics is unchanged',
  JSON.stringify(after.cosIds) === JSON.stringify(before.cosIds),
  `${before.cosIds.length} -> ${after.cosIds.length}`);
ok('OWNED the set of owned gear is unchanged',
  JSON.stringify(after.gearIds) === JSON.stringify(before.gearIds),
  `${before.gearIds.length} -> ${after.gearIds.length}`);
ok('CURRENCY nothing was refunded, charged or salvaged',
  after.coins === before.coins && after.dust === before.dust,
  `coins ${before.coins}->${after.coins}, dust ${before.dust}->${after.dust}`);

/* ---------- CLEARED: it actually did the job ---------- */
ok('CLEARED every plain cosmetic slot came off', after.dressed.length === 0,
  after.dressed.length ? `still dressed: ${after.dressed.join(',')}` : 'bare');
ok('MOG the disguises are gone', Object.keys(after.transmog).length === 0,
  JSON.stringify(after.transmog));

/* ---------- STATS + GEAR: a look button must not change power ---------- */
ok('STATS the gear loadout is untouched',
  JSON.stringify(after.gearLo) === JSON.stringify(before.gearLo),
  `${JSON.stringify(before.gearLo)} -> ${JSON.stringify(after.gearLo)}`);
ok('GEAR the worn piece keeps BOTH its stats slot and its art (no desync)',
  !!seed.gearOn && after.gearLo[seed.gearOn.slot] === seed.gearOn.id
  && after.equipped[seed.gearOn.slot] === seed.gearOn.art,
  `lo=${after.gearLo[seed.gearOn?.slot]} eq=${after.equipped[seed.gearOn?.slot]} want art=${seed.gearOn?.art}`);

/* ---------- PET + FITS: other people's systems ---------- */
ok('PET the companion slot is untouched', after.equipped.C === before.equipped.C,
  `${before.equipped.C} -> ${after.equipped.C}`);
ok('PET the pet wardrobe (petWear, v423) is untouched',
  JSON.stringify(after.petWear) === JSON.stringify(before.petWear),
  JSON.stringify(after.petWear));
ok('FITS the saved fits survive', JSON.stringify(after.outfits) === JSON.stringify(before.outfits),
  `${before.outfits.length} -> ${after.outfits.length}`);

/* ---------- DEFAULT + VISIBLE: bare is not invisible ---------- */
ok('DEFAULT slots with a default go BACK to it, not empty',
  Object.entries(before.defaults).every(([code, def]) => after.equipped[code] === def),
  Object.keys(before.defaults).map(c => `${c}=${after.equipped[c]}`).join(' '));
/* NOT JUST "some layers": the DEFAULT body and the DEFAULT skull, by asset name,
   on the doll the player is looking at. "layers > 0" cannot tell a stripped
   Bonehead from one still wearing the seeded alternates, which is the direction
   this actually fails in. */
const drawn = await page.evaluate(() => [...document.querySelectorAll('.bh-stage.lg .bh-anim img')]
  .map(i => (i.getAttribute('src') || '').split('/').pop().replace(/\.\w+$/, '')));
const wantArt = Object.values(before.defaults);
ok('VISIBLE the doll draws the DEFAULT body and skull, not the seeded ones',
  drawn.length > 0 && wantArt.every(a => drawn.includes(a)),
  `drawn ${drawn.join(',')} want ${wantArt.join(',')}`);

/* ---------- FREE: putting a look back costs nothing ---------- */
const freeAgain = await page.evaluate(async (mog) => {
  if (!mog) return null;
  const loot = await import('./js/loot.js');
  return loot.transmogPrice(mog.slot, mog.art);
}, seed.mogOn || null);
ok('FREE the disguise that was on can be re-worn for 0 dust (the receipt was banked)',
  freeAgain === 0, `price ${freeAgain}`);

/* ---------- REVERSIBLE: it comes straight back on, through the real UI ---- */
const putBack = await page.evaluate(async (want) => {
  const slot = want[0], id = want[1];
  document.querySelector(`.pd-slot[data-pd="${slot}"]`)?.click();
  await new Promise(r => setTimeout(r, 1400));
  const cell = document.querySelector(`.ward-grid[data-wslot="${slot}"] [data-equip="${id}"]`);
  if (!cell) return { offered: false, slot, id };
  cell.click();
  await new Promise(r => setTimeout(r, 1400));
  const loot = await import('./js/loot.js');
  return { offered: true, slot, id, now: (await loot.equipped({ raw: true }))[slot] };
}, before.dressed.length ? [before.dressed[0], before.equipped[before.dressed[0]]] : ['H', '']);
ok('REVERSIBLE a piece that came off is still on the rack and goes straight back on',
  putBack.offered && putBack.now === putBack.id, JSON.stringify(putBack));

/* ---------- EXIT: the entry point closes with the state (SOP rule 4) ------ */
await openWardrobe();
const stripped = await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  await loot.resetLook();
  return true;
});
await openWardrobe();
const chip2 = await chip();
ok('EXIT with nothing left to take off the chip is not offered', stripped && !chip2.there,
  JSON.stringify(chip2));

ok('no page errors', errs.length === 0, errs.join(' | '));
await finish(browser);

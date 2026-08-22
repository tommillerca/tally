/* "TAKE IT ALL OFF": THE WARDROBE'S ONE-TAP STRIP.
 *
 * A player suggested a button that clears the Bonehead so a new outfit starts
 * from nothing. Tom approved it, then settled the one thing I had held back on,
 * 2026-08-22: "reset should strip everything but there needs to be a gwart
 * reminder or something that reminds players they will be weaker in fights if
 * they dont choose statted gear to wear." So it takes the STATTED GEAR too, and
 * the risk that made me build it the cautious way first (a player walks into the
 * Pit weaker with nothing telling them why) is answered by TELLING THEM. Both
 * halves are graded here, because either one alone is the bug.
 *
 * THE RISK IS THE WHOLE REASON THIS FILE EXISTS. A button that touches worn
 * equipment sits one careless line away from touching OWNED equipment, and a
 * strip that binned a legendary somebody paid coins or real money for is not a
 * bug you get to apologise for.
 *
 * WHAT IT MUST DO
 *   every slot comes off, gear included; slots with a `default` (B, SK) go back
 *   to the default rather than empty; the transmog map clears; and Gwart starts
 *   saying a no-gear line on Today.
 *
 * WHAT IT MUST NEVER DO, and these are the rows that matter
 *   1. remove, sell, salvage or refund anything. `inv` is compared ROW BY ROW,
 *      not by count: a swap that deleted a legendary and added a common would
 *      keep the count identical. OWNS then pins the specific statted piece that
 *      was just unequipped as still owned, which is the whole difference between
 *      a strip and a theft.
 *   2. desync `equipped` from `gearloadout`. Nothing writes them separately;
 *      equip(slot, null) does the slot, its gear row and its transmog together.
 *   3. touch the pet. Slot C belongs to the Stable and `petWear` (v423) is its
 *      own system. Nor the saved fits: a fit is how you put a look BACK.
 *   4. bin the paid-look receipts. transmogPrice reads `paidlooks`, and
 *      paidLooks() grandfathers v221-era purchases by seeding from the LIVE
 *      transmog map, so the seed must run before the FIRST equip() now that
 *      equip() shreds tm entries slot by slot. FREE asserts re-wearing is 0.
 *   5. commit on one tap. It arms first, and the confirm names the gear.
 *   6. leave the player uninformed. WARNED drives it end to end.
 *
 * HOW IT IS DRIVEN. The REAL chip, tapped twice, in the real Wardrobe, on a
 * seeded save that actually has something on. Nothing here calls stripAll()
 * directly except the EXIT teardown: driving the function would prove the
 * function and nothing about whether the app ever reaches it (tally/CLAUDE.md,
 * the FX rule, same class of mistake).
 *
 * SETUP and CONTROL refuse to grade anything unless the seed really landed and
 * the doll really had several pieces on it, because "every slot is now empty"
 * passes perfectly on a Bonehead that was already naked.
 *
 * PROVEN RED in a throwaway made with `git archive` (NOT cp -R: a linked
 * worktree's .git is a FILE pointing at the shared gitdir, so a copy shares HEAD
 * and a git command inside it moves the real worktree). One mutation at a time,
 * each asserted to have applied before the result was read, exit codes from a
 * file:
 *   M1  stripAll() also does db.clear('inv')     -> OWNED x3, OWNS, REVERSIBLE,
 *                                                   and both WARNED rows
 *   M2  the plan keeps the OLD gear exclusion    -> STATS, GEAR, CLEARED red
 *       (literally my first build: cosmetics only)
 *   M3  the plan stops excluding slot 'C'        -> PET red
 *   M4  stripAll() DELETES the gear it took off  -> OWNS, OWNED red (the theft)
 *   M5  stripAll() also does kvSet('outfits',[]) -> FITS red
 *   M6  the loop kvSets equipped {} wholesale    -> GEAR, PET red
 *   M7  stripAllPlan() returns no slots          -> CLEARED, DEFAULT, VISIBLE,
 *                                                   WARNED red
 *   M8  the chip is wired with a plain click     -> ARM x2 red
 *   M9  stripAll() skips the paidLooks() bank    -> FREE red, but only after
 *       the row was moved: see below
 *   M10 stripAll() also does coinsAdd(-50)       -> CURRENCY red
 *   M11 the chip renders unconditionally         -> EXIT red
 *   M12 stripAll() drops the wholesale tm clear -> MOG, EXIT red, but only
 *       after the seed was strengthened: see below
 *   M13 the no-gear bucket is deleted            -> WARNED red
 *   M14 the no-gear bucket never retires         -> WARNED-retire red
 *   M15 js/loot.js reverted to pre-v425 (fits do not record gear, cp -R copy
 *       with the .git pointer file DELETED)      -> CONTROL-gear and both
 *       FITBACK rows red, everything else green: the player's exact report
 * And the SETUP row that the chip is offered at all goes red on dafe778a, where
 * the feature does not exist. tests/talkbox-audit.mjs carries the other two:
 * unregistering the bucket in its ctx table fails POOL, and a no-gear line too
 * long for the plaque fails TYPE.
 *
 * M9 CAUGHT A DEAD ROW, which is the more useful half of doing this at all.
 * FREE originally sat straight after the strip, and there it could not fail:
 * transmogPrice returns 0 for ANY look in a slot with no gear in it, and a full
 * strip empties every gear slot, so it was reading a structural free rather than
 * a banked receipt. Skipping the bank left the whole suite green. It now runs
 * AFTER the gear goes back on, which is both the state where the money is real
 * and the real player path (strip, re-gear, want your old look back), and it is
 * paired with a CONTROL row asserting an unworn look in that same slot really
 * does charge. Measured: unpaid 6 dust, previously-worn 0 dust.
 *
 * M12 CAUGHT A SECOND DEAD ROW, the same way. Dropping stripAll's final
 * kvSet('transmog', {}) left the suite green, because every slot that HOLDS
 * something is in the plan and has its own transmog cleared by equip() inside
 * the loop. The wholesale clear exists for the case the seed did not build: a
 * STALE entry on a gear slot holding nothing, which this codebase creates for
 * real (unequipping gear never cleared its transmog, and equipped() carries an
 * explicit guard so it cannot "conjure a look into a genuinely empty slot").
 * Invisible until something fills that slot again, and then it silently changes
 * how the player looks. The seed now plants one and a CONTROL row asserts it is
 * really there and really unreachable by the loop.
 *
 * BOTH DEAD ROWS WERE FOUND BY THE MUTATION, NOT BY READING. That is the whole
 * argument for doing this: the suite was green, the feature worked, and two of
 * its rows had quietly stopped being able to fail.
 *
 * M1 to M11 were run before the stale-transmog seed was added. Adding state to a
 * seed can only give a row more ways to fail, never fewer, so those reds stand.
 *
 * M6 is worth reading twice: wiping `equipped` wholesale does NOT red DEFAULT,
 * because equipped() merges the slot defaults back in on every read, so B and
 * SK come back on their own. DEFAULT's real job is the other direction, and M7
 * is what proves it: a strip that clears nothing leaves the seeded non-default
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
  let gearOn = null, mogOn = null, mogCost = null, ctrl = null;
  if (gear) {
    await loot.grantGear(gear.id, 'test');
    await loot.equipGear(gear.slot, gear.id);
    gearOn = { slot: gear.slot, id: gear.id, art: gear.artId };
    const alt = BH_ITEMS.find(i => i.slot === gear.slot && i.id !== gear.artId);
    /* A THIRD look in the same slot, collected but never worn, so never paid for.
       It is the positive control for FREE: it proves the slot really does charge
       in the state FREE is measured in, so a 0 there means "banked", not "the
       pricing happened to be free right now". */
    ctrl = BH_ITEMS.find(i => i.slot === gear.slot && i.id !== gear.artId && (!alt || i.id !== alt.id)) || null;
    if (ctrl) await loot.grantCosmetic(ctrl.id, 'test');
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

  /* A STALE TRANSMOG, on a gear slot that holds NOTHING. This is a real,
     documented state in this codebase, not a contrivance: unequipping gear never
     cleared its transmog (see the note in equip(), js/loot.js), and equipped()
     carries an explicit guard so a stale entry cannot "conjure a look into a
     genuinely empty slot". It is invisible until something fills that slot again,
     at which point it silently changes how the player looks.
     It is here because it is the ONLY case that exercises stripAll's final
     wholesale kvSet('transmog', {}): every slot that HOLDS something is in the
     plan and has its entry cleared by equip() inside the loop, so without a stale
     entry the wholesale clear is unreachable and the MOG row cannot see it going
     missing. Measured: deleting that line left the whole suite green. */
  let staleMog = null;
  const STALE = 'S';                                  // Socks, a gear slot
  if (GEAR_SLOTS.includes(STALE)) {
    await loot.equip(STALE, null);                    // make sure it holds nothing
    const art = BH_ITEMS.find(i => i.slot === STALE);
    if (art) {
      await loot.grantCosmetic(art.id, 'test');
      const tm = (await db.kvGet('transmog', {})) || {};
      tm[STALE] = art.id;                             // written straight in: no UI path leaves it
      await db.kvSet('transmog', tm);
      staleMog = { slot: STALE, art: art.id };
    }
  }

  await loot.captureFit('Audit fit');
  await db.kvSet('petWear', { PH: 'PH-audit-sentinel' });   // v423's own key, untouched by this
  return {
    wornPlain, gearOn, mogOn, mogCost, ctrlArt: ctrl ? ctrl.id : null, staleMog,
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
    /* Every slot holding ANYTHING: a statted piece, or a plain cosmetic that is
       not the slot's own default. Mirrors stripAllPlan's predicate, deliberately
       re-stated here rather than imported, so a bug that widens or narrows the
       plan cannot also widen or narrow the thing measuring it. */
    dressed: BH_SLOTS.filter(s => s.code !== 'C' && (lo[s.code] || (eq[s.code] && eq[s.code] !== s.default)))
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
/* Without this the MOG row cannot fail: every slot the plan touches has its own
   transmog cleared by equip(), so only a STALE entry can prove the wholesale
   clear still runs. */
ok('CONTROL a stale transmog sits on a slot that holds nothing, unreachable by the slot loop',
  !!seed.staleMog && before.transmog[seed.staleMog.slot] === seed.staleMog.art
  && !before.equipped[seed.staleMog.slot] && !before.gearLo[seed.staleMog.slot],
  JSON.stringify(seed.staleMog) + ' in ' + JSON.stringify(before.transmog));
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
   fail, and makes stripAll's own bank the one thing standing between the
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

/* ---------- STATS + GEAR: INVERTED 2026-08-22 on Tom's call ----------
   These two rows used to assert that statted gear SURVIVED the strip, which was
   my first build's behaviour. Tom: "reset should strip everything but there
   needs to be a gwart reminder". So gear comes off, and the pair of rows now
   guards the thing that makes that safe: it is UNEQUIPPED, not taken. STATS
   asserts the loadout really emptied; OWNS asserts the very same piece is still
   in the gear inventory afterwards, which is the difference between a strip and
   a theft. Neither is a check without the other, and the row above them that
   must never move whatever else does is OWNED, the `inv` comparison. */
ok('STATS the gear loadout really is empty afterwards',
  Object.keys(after.gearLo).length === 0,
  `${JSON.stringify(before.gearLo)} -> ${JSON.stringify(after.gearLo)}`);
ok('GEAR the slot that held a statted piece is empty of BOTH its stats and its art (no desync)',
  !!seed.gearOn && !after.gearLo[seed.gearOn.slot]
  && after.equipped[seed.gearOn.slot] !== seed.gearOn.art,
  `lo=${after.gearLo[seed.gearOn?.slot]} eq=${after.equipped[seed.gearOn?.slot]} was art=${seed.gearOn?.art}`);
/* THE ROW THAT SEPARATES UNEQUIPPING FROM DESTROYING. A strip that deleted the
   piece would satisfy both rows above perfectly. */
ok('OWNS the statted piece that came off is STILL OWNED and re-equippable',
  !!seed.gearOn && after.gearIds.includes(seed.gearOn.id),
  `${seed.gearOn?.id} in ${JSON.stringify(after.gearIds)}`);

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
  await loot.stripAll();
  return true;
});
await openWardrobe();
const chip2 = await chip();
ok('EXIT with nothing left to take off the chip is not offered', stripped && !chip2.there,
  JSON.stringify(chip2));

/* ---------- WARNED: the half of this feature that makes the other half safe ----
   Tom, 2026-08-22: "reset should strip everything but there needs to be a gwart
   reminder or something that reminds players they will be weaker in fights if
   they dont choose statted gear to wear." So a player who has just taken every
   statted piece off MUST be told, and the telling is Gwart's no-gear bucket in
   gwartPool (js/app.js). Driven end to end: strip through the real button above,
   go to Today, and read the line the app actually put in his box. Membership in
   the bucket is how the line is identified, because gwPick draws at random and
   pinning one string would fail nine times in ten for the right reason.

   CRATES OUTRANK THE WARNING, deliberately: an unopened crate may hold the very
   gear this is asking for. So the crate rows are emptied first and the SETUP row
   below refuses to grade unless they really are gone; otherwise this would pass
   or fail on which bucket won, not on whether the warning exists. Safe here
   because every OWNED comparison above has already been made. */
const warnSetup = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const loot = await import('./js/loot.js');
  const inv = await db.db.all('inv');
  for (const r of inv) if (r.kind === 'crate') await db.db.del('inv', r.id);
  return { crates: (await loot.unopenedCrates()).length,
    gearOwned: (await loot.ownedGearIds()).size,
    gearWorn: Object.keys(await loot.gearLoadout()).length };
});
ok('SETUP the player is in the exact state the warning is for: owns gear, wears none, no crate outranking it',
  warnSetup.crates === 0 && warnSetup.gearOwned > 0 && warnSetup.gearWorn === 0,
  JSON.stringify(warnSetup));

const readGw = () => page.evaluate(async () => {
  location.hash = '#/bonehead';
  await new Promise(r => setTimeout(r, 700));
  location.hash = '#/today';
  await new Promise(r => setTimeout(r, 1600));
  const line = document.querySelector('.talkbox.gw-box .tb-line');
  const nogear = window.__gwartPool
    ? window.__gwartPool({ entries: [{}], tot: { p: 0, kcal: 0 }, targets: { p: 100, kcal: 2000 },
        crates: [], streak: 0, level: 0, isToday: true, gearOwned: 3, gearWorn: 0 })
    : null;
  return { said: line ? (line.dataset.tb || line.textContent || '').trim() : null,
    pool: nogear, inPool: !!(line && nogear && nogear.includes((line.dataset.tb || '').trim())) };
});
const warned = await readGw();
ok('SETUP the no-gear bucket exists and is deep enough to be a bucket',
  Array.isArray(warned.pool) && warned.pool.length >= 5, `${warned.pool?.length} lines`);
ok('WARNED a stripped Bonehead gets told: Gwart says a no-gear line on Today',
  warned.inPool, `he said "${warned.said}"`);

/* AND IT RETIRES. Direction and bound, not just presence: a warning that is
   permanent is wallpaper, and this one has to be gone the moment the player does
   the thing it asked for. One piece back on is enough. */
const retired = await page.evaluate(async (g) => {
  const loot = await import('./js/loot.js');
  await loot.equipGear(g.slot, g.id);
  return Object.keys(await loot.gearLoadout()).length;
}, seed.gearOn);
const after1 = await readGw();
/* STRICT ON PURPOSE. The first version of this row asserted only "not a no-gear
   line" and went green while Gwart was saying a CRATE line, i.e. while the
   warning was being outranked rather than retired: a pass with the check blind,
   which is anti-regression rule 1. So it requires the WARNED row above to have
   genuinely seen the warning on this same page first, which is what makes
   "it is gone now" mean anything. */
ok('WARNED it retires the moment one statted piece goes back on',
  retired === 1 && warned.inPool && !after1.inPool,
  `worn ${retired}, warning was shown before: ${warned.inPool}, he now says "${after1.said}"`);

/* ---------- FREE: the paid-look receipt survived the strip ----------
   THIS ROW MOVED HERE, and the move is the finding. It used to sit straight
   after the strip and it could not fail: transmogPrice returns 0 for ANY look in
   a slot with no gear in it ("no stats in the slot: free"), and a full strip
   empties every gear slot, so the row was reading a structural free rather than
   a banked receipt. Measured: mutating stripAll() to skip paidLooks() left the
   whole suite GREEN. A row that cannot go red is not a check (anti-regression
   rule 1), and this one had quietly stopped being one the moment the button
   started taking gear.
   The real player path is the later one anyway: you strip, you gear up again,
   and THEN you want your old look back. That is where the money is, so that is
   where it is measured, with the gear back in the slot. */
const price = await page.evaluate(async (mog, ctrl) => {
  const loot = await import('./js/loot.js');
  return { paid: await loot.transmogPrice(mog.slot, mog.art),
    unpaid: ctrl ? await loot.transmogPrice(mog.slot, ctrl) : null };
}, seed.mogOn, seed.ctrlArt);
ok('CONTROL with gear back in the slot it really does charge for an unworn look',
  price.unpaid > 0, `an unpaid look in that slot costs ${price.unpaid} dust`);
ok('FREE the look that was on before the strip is still paid for: 0 dust to wear again',
  price.paid === 0, `paid look ${price.paid} dust, unpaid look ${price.unpaid} dust`);

/* ---------- FITBACK: a saved fit survives the strip WHOLE (v425) ----------
   The player report, verbatim: "I saved my fit then did the take it all off
   option and when I clicked my old fit that I saved it only remembered a couple
   things." A fit used to store only tm + cos (v222: "a fit is a LOOK, never
   stats"), which assumed gear slots always hold something. v424's strip broke
   that: applyFit wrote transmogs onto emptied gear slots and equipped() ignores
   a transmog on a slot holding nothing, so every gear-slot look silently
   vanished and only plain cosmetics returned. Since v425 captureFit records the
   gear loadout and applyFit re-equips it into empty slots first.
   Driven the player's way: the REAL fit chip, tapped in the real Wardrobe, on a
   doll stripped by the same code the real button runs. The bar is the FULL
   pre-strip look (equipped(), transmog resolved) AND the full loadout, not
   "some pieces came back": partial restoration IS the reported bug.
   PROVEN RED (M15) by reverting js/loot.js to its pre-fix v424 state in a
   throwaway copy: the fit records no gear, so CONTROL-gear, FITBACK-look and
   FITBACK-stats all go red while the seed and strip stay healthy. */
const fitId = await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const f = (await loot.fits()).find(x => x.name === 'Audit fit');
  return f ? { id: f.id, gear: f.gear || null } : null;
});
ok('CONTROL the saved fit recorded the statted loadout it was captured in',
  !!fitId && JSON.stringify(fitId.gear) === JSON.stringify(before.gearLo),
  `fit.gear=${JSON.stringify(fitId?.gear)} want ${JSON.stringify(before.gearLo)}`);
const strippedAgain = await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  await loot.stripAll();                       // same function the real chip runs, graded above
  return { lo: Object.keys(await loot.gearLoadout()).length,
    tm: Object.keys(await loot.transmogMap()).length };
});
ok('CONTROL the doll really is bare again before the fit is tapped (else FITBACK grades nothing)',
  strippedAgain.lo === 0 && strippedAgain.tm === 0, JSON.stringify(strippedAgain));
await openWardrobe();
const tapped = await page.evaluate(async (id) => {
  const c = document.querySelector(`[data-fit="${id}"]`);
  if (!c) return { there: false };
  c.click();
  await new Promise(r => setTimeout(r, 1800));
  return { there: true };
}, fitId?.id);
ok('SETUP the fit chip is on the rail and was tapped', tapped.there, JSON.stringify(tapped));
const restored = await snap();
// key order differs between an equip-by-equip rebuild and the original save
const normObj = o => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));
ok('FITBACK the FULL look is back: every slot shows what it showed when the fit was saved',
  normObj(restored.look) === normObj(before.look),
  `now ${JSON.stringify(restored.look)}\n      was ${JSON.stringify(before.look)}`);
ok('FITBACK the stats came back too: the gear loadout matches the one the fit was saved in',
  normObj(restored.gearLo) === normObj(before.gearLo),
  `now ${JSON.stringify(restored.gearLo)} was ${JSON.stringify(before.gearLo)}`);
/* And the compat half: a fit saved BEFORE v425 has no gear map at all. It must
   behave exactly as it did yesterday: apply cleanly, touch no gear. */
const legacy = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const loot = await import('./js/loot.js');
  const list = await db.kvGet('outfits', []);
  const f = { ...list[0], id: 'legacy-fit-test' };
  delete f.gear;                               // the exact shape a v222-v424 save left behind
  await db.kvSet('outfits', [...list, f]);
  await loot.stripAll();
  const r = await loot.applyFit('legacy-fit-test');
  const lo = await loot.gearLoadout();
  await db.kvSet('outfits', list);             // leave no test rows behind
  return { ok: r.ok, worn: Object.keys(lo).length };
});
ok('LEGACY a pre-v425 fit (no gear map) still applies and equips no gear',
  legacy.ok === true && legacy.worn === 0, JSON.stringify(legacy));

ok('no page errors', errs.length === 0, errs.join(' | '));
await finish(browser);

/* A MAKE-GOOD LANDS, AND TAKES NOTHING WITH IT.
 *
 * WHY THIS EXISTS. Tom, 2026-08-21, about a player who deleted her Day One
 * Lizard by accident: "make sure that this is some sort of feature youre
 * figuring out for the future. there will be tiems that we need to go god mode
 * and fix player's mistakes by giving them a new pet etc".
 *
 * The server half of that (POST /admin/grant, its allowlist, its caps and its
 * idempotency key) is graded by server/admin-grant.test.mjs. This file grades
 * the CLIENT half, which is the end of the chain and the only end that matters
 * to the player: a grant row on the server is not a lizard in her Stable.
 *
 * It drives the REAL ingest, `social.__testApplyGrant`, which is `applyGrant`
 * itself, the same function pullGrants calls. Nothing here re-implements the
 * payload arms.
 *
 * FIVE ROWS, and each states which direction is failure:
 *   LANDS      the granted species arrives in BOTH places ownership lives: a
 *              copy in petInst (what the Stable, the Paddock and the battle pet
 *              read) and the `cos` inv row (what the wardrobe and the paper-doll
 *              read). Failure is a ghost pet, which is exactly what 50,000 coins
 *              bought on v421.
 *   KEEPS      every row that existed before the grant is still there, byte for
 *              byte, across every store. Failure is this channel being able to
 *              take something away, which it must never be able to do.
 *   COMPANION  a make-good does not displace the pet the player chose. grantPet
 *              equips only into an EMPTY companion slot, so the seeded C stays
 *              equipped. Failure is a gift silently re-dressing the player.
 *   FREE       a payload carrying only a pet moves no coins, no dust and no XP.
 *              Failure in either direction: a pet grant that quietly pays, or
 *              one that quietly charges.
 *   ONCE       the same key delivered twice mints ONE copy, sequentially and
 *              concurrently (two tabs pull the same feed, tally/CLAUDE.md
 *              rewarded-actions rule 6). Failure is the copy count growing on a
 *              re-delivery, and the direction is up: this is a mint, so the
 *              check is a CEILING, not a trend.
 *   REVEAL     she SEES it arrive. A pet-only payload pays no coins and no XP,
 *              so before the card branch was added every arm of
 *              presentGrantDelivery fell through and the lizard landed with no
 *              reveal, no toast and nothing to look at. Failure is a silent
 *              make-good, which is the same failure as no make-good at all: the
 *              only part of this she experiences is the moment it shows up.
 *
 * CONTROL ROWS. Nothing is graded unless the setup actually reached the state:
 * the target species must be UNOWNED before the grant and the save must hold
 * rows to preserve, because "nothing was removed" is satisfied vacuously by an
 * empty database and "it landed" is satisfied vacuously by a pet already owned.
 *
 * PROVE-RED. Every row has a mutation that turns it red, and all six were run on
 * 2026-08-21 against a `cp -R` throwaway copy of this tree, one at a time,
 * reverted between runs, green again afterwards:
 *   1. delete `if (p.pet) await grantPet(p.pet, 'social');` from applyPayload
 *      -> LANDS-INST (0 copies), LANDS-COS, ONCE-SEQ and ONCE-RACE go red: the
 *      grant applies and nothing arrives.
 *   2. `if (p.pet) { await kvSet('petInst', []); await grantPet(...); }`
 *      -> KEEPS ("kv:petInst lost 2 of 2 entries") and KEEPS the keeper's copy.
 *      LANDS still passes, which is the point: the pet arrives and the player's
 *      other pets are gone.
 *   3. drop the `if (!eq.C)` guard in grantPet, so it equips unconditionally
 *      -> COMPANION (equipped C is CX) and KEEPS ("kv:equipped ... C").
 *   4. `if (p.pet) { await coinsAdd(500); await grantPet(...); }`
 *      -> FREE (+500 coins) and KEEPS ("kv:coins 1234 -> 1734").
 *   5. move the arms ABOVE the `if (!claim.claimed) return false;` line
 *      -> ONCE-SEQ (2 copies from one grant).
 *   6. swap awardOnce for a check-then-act claim (`!(await db.get('xp', key))`
 *      then award), which is the v390 shape
 *      -> ONCE-RACE (both overlapping deliveries are told they claimed it).
 *   7. delete the `p.pet && BH_BY_ID[p.pet]` card line from
 *      presentGrantDelivery -> REVEAL-STATIC (the grant lands and shows
 *      nothing, which is the bug this row was written for).
 *   8. move assets/bh/C/CX.png aside -> REVEAL-PIXELS (0 colours, 0% coverage).
 *   9. blank `${esc(c.name)}` out of packCardHtml's nameplate -> REVEAL-NAME.
 *
 * TWO ROWS HERE WERE BLIND UNTIL THOSE MUTATIONS WERE RUN, which is the whole
 * reason to run them:
 *   - REVEAL-PIXELS first asserted `img.naturalWidth > 0` over the card's
 *     images. Card art is a `<canvas class="pc-canvas">` that hydratePackArt
 *     paints, not an `<img>`, so the check was reading some other image on the
 *     page: mutation 8 left it GREEN over a blank card. It counts distinct
 *     colours in the canvas now, because hydratePackArt's onerror fallback
 *     paints a uniform rounded rect and "the canvas has pixels" would pass on
 *     that too.
 *   - REVEAL-NAME first searched the whole card's textContent for the species
 *     name, and the note passed to the reveal was "Your Day One Lizard, back
 *     where it belongs", which contains it. Mutation 9 left it GREEN with the
 *     nameplate empty. It reads `.pc-name` now, and the note no longer names
 *     the species.
 *
 * Mutation 5 does NOT turn ONCE-RACE red, and that is worth knowing rather than
 * assuming: with the arms outside the claim, two overlapping grantPet calls
 * still land one copy, because both read the same petInst array and the second
 * write happens to overwrite the first. One copy by luck of last-write-wins is
 * not one copy by design, so ONCE-RACE is proven by mutation 6 instead, which
 * attacks the claim itself.
 *
 * Run: node tests/admin-grant-audit.mjs [baseUrl]
 * Self-serving: with no URL it serves this checkout, so it can never grade
 * production.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

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

const srv = process.argv[2] ? null : await serveTree(ROOT);
const base = process.argv[2] || srv.url;
console.log(`URL UNDER TEST: ${base}`);
const { browser, page } = await boot(base);
await sleep(800);

const r = await page.evaluate(async () => {
  const [loot, game, social, db] = await Promise.all([
    import('/js/loot.js'), import('/js/game.js'), import('/js/social.js'), import('/js/db.js'),
  ]);
  const { BH_ITEMS, BH_BY_ID, bhAsset } = await import('/data/boneheadz.js');

  /* THE WHOLE SAVE, row by row, as comparable strings. kv rows are compared by
     key so a "nothing was removed" failure can NAME the record that vanished. */
  const STORES = db.STORES;
  const snap = async () => {
    const out = {};
    for (const s of STORES) {
      const rows = await db.db.all(s);
      out[s] = Object.fromEntries(rows.map((x, i) => [String(x.k ?? x.id ?? x.key ?? i), JSON.stringify(x)]));
    }
    return out;
  };
  /* WHAT THE GRANT WAS ALLOWED TO DO IS GROW. A pet legitimately appends to
     several kv containers (petInst gains a copy, `pets` and `petLvlSteps` gain
     an entry, `looks` gains the collected art), so a flat "byte-identical"
     comparison would go red on a correct grant. Rather than an exclusion list
     that would also blind this to a rewrite of one of those very records, a
     container is graded on CONTAINMENT: every entry it held before must still
     be there, with the same value. Growth is fine; loss and rewriting are not,
     in any store. */
  const loss = (a, b) => {
    if (Array.isArray(a)) {
      if (!Array.isArray(b)) return 'array replaced';
      const have = new Set(b.map(x => JSON.stringify(x)));
      const gone = a.filter(x => !have.has(JSON.stringify(x)));
      return gone.length ? `lost ${gone.length} of ${a.length} entries` : null;
    }
    if (a && typeof a === 'object') {
      if (!b || typeof b !== 'object') return 'object replaced';
      const gone = Object.keys(a).filter(k => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
      return gone.length ? `entries lost or rewritten: ${gone.join(', ')}` : null;
    }
    return `value changed: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
  };
  const damage = (before, after) => {
    const out = [];
    for (const s of Object.keys(before)) {
      for (const [k, val] of Object.entries(before[s])) {
        if (!(k in after[s])) { out.push(`${s}:${k} REMOVED`); continue; }
        if (after[s][k] === val) continue;
        const why = s === 'kv' ? loss(JSON.parse(val).v, JSON.parse(after[s][k]).v) : 'row rewritten';
        if (why) out.push(`${s}:${k} ${why}`);
      }
    }
    return out;
  };
  const wallet = async () => ({ coins: await loot.coins(), dust: await loot.boneDust(), xp: await game.totalXp() });
  const copies = async sp => (await loot.petInstances()).filter(x => x.sp === sp).length;

  /* SETUP: a lived-in save. A pet already owned and EQUIPPED (so the courtesy
     equip in grantPet must not fire), gear, a crate, coins, dust and an XP row,
     because every KEEPS row is about rows that already exist. */
  const KEEP = 'C1', GIVE = 'CX';
  if (!BH_ITEMS.some(i => i.id === GIVE && i.slot === 'C' && i.exclusive)) {
    return { error: `${GIVE} is not an exclusive slot-C species any more; this audit is about the Day One Lizard` };
  }
  await loot.grantPet(KEEP, 'audit');
  await loot.grantCrate('daily', 'audit');
  await db.kvSet('coins', 1234);
  await db.kvSet('bonedust', 77);
  await game.award('audit-preexisting', 'quest', 40, 'audit');
  // strip any copy of the target so the grant has real work to do
  const stripped = (await loot.petInstances()).filter(x => x.sp !== GIVE);
  await db.kvSet('petInst', stripped);
  for (const row of await db.db.all('inv')) if (row.kind === 'cos' && row.itemId === GIVE) await db.db.del('inv', row.id);
  const eq = await db.kvGet('equipped', {});
  await db.kvSet('equipped', { ...eq, C: KEEP });

  const ownedBefore = await loot.ownedCosmeticIds();
  const before = await snap();
  const w0 = await wallet();
  const rowsBefore = Object.values(before).reduce((n, s) => n + Object.keys(s).length, 0);
  const control = {
    targetUnowned: !ownedBefore.has(GIVE) && (await copies(GIVE)) === 0,
    keeperOwned: (await copies(KEEP)) > 0,
    equippedKeeper: (await db.kvGet('equipped', {})).C === KEEP,
    rowsBefore,
  };

  /* THE GRANT, through the real ingest path. */
  const key = 'admin-audit-' + Math.random().toString(36).slice(2);
  const payload = { pet: GIVE, note: 'Your Day One Lizard, back where it belongs.' };
  const applied = await social.__testApplyGrant({ key, type: 'social', ts: Date.now(), payload });

  const after = await snap();
  const w1 = await wallet();
  const landed = {
    applied,
    inst: await copies(GIVE),
    cos: (await loot.ownedCosmeticIds()).has(GIVE),
    keeperCopies: await copies(KEEP),
    equippedC: (await db.kvGet('equipped', {})).C,
    damage: damage(before, after),
    pay: { coins: w1.coins - w0.coins, dust: w1.dust - w0.dust, xp: w1.xp - w0.xp },
  };

  /* ONCE, sequentially: the same key re-delivered, as a re-pull would. */
  const again = await social.__testApplyGrant({ key, type: 'social', ts: Date.now(), payload });
  const afterTwice = { again, inst: await copies(GIVE) };

  /* ONCE, concurrently: two tabs pull the same feed and both ingest at the same
     instant. This is the shape that paid twice everywhere on 2026-08-17. */
  const raceKey = 'admin-audit-race-' + Math.random().toString(36).slice(2);
  const raceSp = 'C3';
  const raced0 = await copies(raceSp);
  const both = await Promise.all([
    social.__testApplyGrant({ key: raceKey, type: 'social', ts: Date.now(), payload: { pet: raceSp, note: 'race' } }),
    social.__testApplyGrant({ key: raceKey, type: 'social', ts: Date.now(), payload: { pet: raceSp, note: 'race' } }),
  ]);
  const race = { wins: both.filter(x => x === true).length, minted: (await copies(raceSp)) - raced0 };

  /* THE END OF THE CHAIN: SHE HAS TO SEE IT.
     A pet-only payload pays no coins and no XP, so before the card branch was
     added every arm of presentGrantDelivery fell through and the lizard arrived
     with no reveal, no toast, and nothing to look at.
     Two halves, and each is blind to the other's failure. STATIC reads the
     branch out of js/app.js (presentGrantDelivery is module-scope and reachable
     only from autoSync's .then, so no audit can call it), which proves the card
     is built and built BEFORE the reveal fires but says nothing about pixels.
     PIXELS builds the card exactly as that branch builds it and drives the REAL
     reveal through the webdriver-gated __packReveal seam, then asserts the art
     is DECODED and VISIBLE: a CSS box over a blank frame reads perfectly, which
     is how an invisible animation shipped in v245. */
  const src = await (await fetch('./js/app.js')).text();
  const i = src.indexOf('function presentGrantDelivery');
  const body = src.slice(i, src.indexOf('\nfunction ', i + 10));
  const iPush = body.indexOf('p.pet && BH_BY_ID[p.pet]');
  const iRev = body.indexOf('if (cards.length)');
  const branch = {
    found: i > -1,
    pushesCard: iPush > -1 && /cards\.push\(\{ imgSrc: bhAsset\(it\)/.test(body),
    usesTheNote: iPush > -1 && /stats: esc\(note\)/.test(body.slice(iPush, iPush + 200)),
    beforeReveal: iPush > -1 && iRev > -1 && iPush < iRev,
  };

  let pixels = { err: 'no __packReveal hook (webdriver seam missing)' };
  if (window.__packReveal) {
    const it = BH_BY_ID[GIVE];
    /* The note deliberately does NOT contain the species name. It used to read
       "Your Day One Lizard, back where it belongs", and the NAME row below then
       passed on the note's own text with the nameplate blanked out: measured, by
       deleting `${esc(c.name)}` from packCardHtml and watching the row stay
       green. Assert against .pc-name specifically, with a note that cannot
       satisfy it by accident. */
    window.__packReveal([{ imgSrc: bhAsset(it), name: it.name, rarity: it.rarity, kind: 'CREW DELIVERY', stats: 'Back where it belongs. Sorry about that!' }], { coins: 0 });
    /* THE ART IS A CANVAS, NOT AN <img>. packCardHtml renders imgSrc into
       `<canvas class="pc-canvas">` and hydratePackArt paints it, so the obvious
       `img.naturalWidth > 0` check reads some OTHER image on the page and passes
       over a blank card: measured, by moving assets/bh/C/CX.png aside and
       watching the row stay green. And hydratePackArt's own onerror fallback
       paints a faint uniform rounded rect, so "the canvas has non-transparent
       pixels" is not enough either. Count DISTINCT colours: real art has many,
       the fallback has one. */
    const deadline = Date.now() + 4000;
    let el = null;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 200));
      el = document.querySelector('.pack-card');
      if (el && el.querySelector('canvas.pc-canvas')) break;
    }
    if (!el) pixels = { err: 'the reveal opened no card' };
    else {
      const cv = el.querySelector('canvas.pc-canvas');
      const box = el.getBoundingClientRect();
      let ink = 0, colours = 0, total = 0;
      if (cv) {
        // let the paint land, then read it back
        for (let t = 0; t < 20 && ink === 0; t++) {
          await new Promise(r => setTimeout(r, 150));
          const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
          const seen = new Set();
          ink = 0; total = d.length / 4;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 24) continue;
            ink++;
            seen.add(`${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`);
          }
          colours = seen.size;
        }
      }
      pixels = {
        canvas: !!cv, colours,
        coverage: total ? Math.round((ink / total) * 1000) / 10 : 0,
        visible: box.width > 40 && box.height > 40,
        plate: (el.querySelector('.pc-name')?.textContent || '').trim(),
      };
    }
  }

  return { control, landed, afterTwice, race, branch, pixels, giveName: BH_BY_ID[GIVE].name };
});

if (r.error) { console.log(`SETUP  ${r.error}`); process.exit(2); }

setup('CONTROL the target species is UNOWNED before the grant', r.control.targetUnowned);
setup('CONTROL the save already holds a pet, equipped, plus rows to preserve',
  r.control.keeperOwned && r.control.equippedKeeper && r.control.rowsBefore > 10,
  `${r.control.rowsBefore} rows across the save`);

/* A CONTROL, not a guard: it exists so nothing below is graded on a grant that
   never ran (a reused key returns false and pays nothing, correctly). */
setup('CONTROL the grant was applied at all', r.landed.applied === true);
ok('LANDS-INST a copy arrives in petInst (the Stable, the Paddock, the battle pet)',
  r.landed.inst === 1, `${r.landed.inst} copies`);
ok('LANDS-COS the `cos` ownership row arrives too (the wardrobe, the paper doll)',
  r.landed.cos === true);

ok('KEEPS nothing that existed before the grant was removed or changed',
  r.landed.damage.length === 0, r.landed.damage.join(', ') || `${r.control.rowsBefore} rows intact`);
ok('KEEPS the pet the player already had still has its copy',
  r.landed.keeperCopies >= 1, `${r.landed.keeperCopies} copies`);
ok('COMPANION the make-good does not displace the pet the player chose',
  r.landed.equippedC === 'C1', `equipped C is ${r.landed.equippedC}`);
ok('FREE a pet-only payload moves no coins, no dust and no XP',
  r.landed.pay.coins === 0 && r.landed.pay.dust === 0 && r.landed.pay.xp === 0,
  JSON.stringify(r.landed.pay));

ok('ONCE-SEQ the same key re-delivered is refused and mints nothing',
  r.afterTwice.again === false && r.afterTwice.inst === 1,
  JSON.stringify(r.afterTwice));
ok('ONCE-RACE two overlapping deliveries of one key mint exactly ONE copy',
  r.race.wins === 1 && r.race.minted === 1, JSON.stringify(r.race));

setup('CONTROL presentGrantDelivery was found in js/app.js to read', r.branch.found);
ok('REVEAL-STATIC a pet payload builds a card, with the note, before the reveal fires',
  r.branch.pushesCard && r.branch.usesTheNote && r.branch.beforeReveal, JSON.stringify(r.branch));
setup('CONTROL the reveal seam opened a card with an art canvas to measure',
  !r.pixels.err && r.pixels.canvas === true, r.pixels.err || 'canvas present');
ok('REVEAL-PIXELS the granted pet is PAINTED in the reveal, not a blank or a fallback',
  r.pixels.colours >= 8 && r.pixels.coverage > 2 && r.pixels.visible, JSON.stringify(r.pixels));
ok('REVEAL-NAME the nameplate says which species arrived',
  r.pixels.plate === r.giveName, `nameplate "${r.pixels.plate}" should be "${r.giveName}"`);

await browser.close();
if (srv) srv.close();
console.log(fails ? '\nFAILED' : '\nOK');
process.exit(fails);

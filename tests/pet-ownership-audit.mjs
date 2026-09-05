/* A PET YOU OWN IS A PET YOU CAN SEE, IN THE STABLE AND IN THE PADDOCK.
 *
 * WHY THIS EXISTS. v421 sold Bumbleseal for 50,000 coins and she did not arrive.
 * Tom: "bumbleseal cannot be seen in the stable or the paddock even though i
 * purahased her... this means when i bought my cosmetics to equip and dress her
 * up with, there was no where to put them on."
 *
 * Ownership is written in TWO places and `buyPetItem` wrote one of them. An inv
 * row of kind 'cos' is what the wardrobe, the shop tile and the paper-doll slot
 * read, which is why she rendered perfectly on Today: Today draws the equipped
 * SPECIES. The Stable (js/app.js openStable, `.cf-card`) and the Paddock
 * (js/paddock.js paddockRoster) list COPIES, out of the kv `petInst` array, and
 * nothing ever put one there. The Paddock then fell through to
 * `lockedCardHtml`, which is why he saw a silhouette carrying the Day One
 * Lizard's copy on a pet he had just paid for.
 *
 * Nothing threw. Nothing looked broken. The pet was simply absent from the two
 * screens that answer "what do I own", and the five accessories he then bought
 * had no figure to hang on.
 *
 * FOUR ROWS, AND THEY FAIL IN DIFFERENT PLACES ON PURPOSE:
 *
 *   MINT     static. Every function in js/loot.js that calls grantCosmetic must
 *            mint an instance in the same function or be listed PET_PROOF with a
 *            reason. This is the row that catches the NEXT path: a battle-pass
 *            pet, a gift, a promo, anything that writes ownership and forgets
 *            the copy, in code that does not exist yet. It goes red on v421.
 *   OWNED    live. Every species in the catalogue is granted through its REAL
 *            path (the shop for anything PET_SHOP sells, grantPet otherwise) and
 *            must land in petInstances and in paddockRoster. Derived from
 *            BH_ITEMS, so a new species is covered the day it is added rather
 *            than the day somebody remembers to register it.
 *   STABLE   live, DOM. The real Stable, opened by the real button, must carry a
 *            visible card for every species owned. The data rows above are blind
 *            to a screen that filters or throws.
 *   PADDOCK  live, DOM. Same, for the Paddock's tiles and its card slider: an
 *            owned species must not be a locked tile or a silhouette card.
 *   RECLAIM  live. Fixing the purchase does nothing for the account that already
 *            made it, so v421's exact broken write is reproduced and a reload
 *            must heal it, once, without minting a second copy on the reload
 *            after that.
 *
 * EMPTY IS A FAILURE. SAMPLE refuses to grade anything unless the catalogue has
 * pets in it and the shop is selling one, because every row here is "this thing
 * is present" and an empty roster satisfies all of them vacuously.
 *
 * PROVE-RED, each row against the real v421 defect (all confirmed 2026-08-21 in
 * a `cp -R` throwaway copy of this tree):
 *   MINT     restore buyPetItem's `if (isPet) await equip('C', id);` in place of
 *            deliverPet: 1 FAILED, naming buyPetItem.
 *   OWNED /  the same revert PLUS deleting reclaimOwnedPets' body (`return
 *   STABLE / list;` first line), which is v421 exactly: 4 FAILED. C6 is owned,
 *   PADDOCK  equipped and drawn on Today, and absent from petInst, from the
 *            roster, from the Stable's cards and from the Paddock's tiles.
 *   RECLAIM  deleting reclaimOwnedPets' body alone: 1 FAILED, the pre-existing
 *            account stays broken across three reloads.
 *   SAMPLE   drop C6 and the other species from BH_ITEMS: 2 FAILED (SETUP), and
 *            the run stops rather than passing on nothing.
 *
 * Run: node tests/pet-ownership-audit.mjs [baseUrl] [--shots DIR]
 * Self-serving: with no URL it serves this checkout, so it can never grade
 * production.
 */
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, settle, setWidth, serveTree } from './godmode.js';
import { BH_ITEMS, PET_SHOP } from '../data/boneheadz.js';
import { PET_ASSIGN, PET_STATS, PET_SIGNATURE } from '../js/pets.js';

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
const shot = async (page, name) => {
  if (!SHOTS) return;
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`      shot: ${file}`);
};

/* ---- SAMPLE: is there anything to grade? ---- */
const PETS = BH_ITEMS.filter(i => i.slot === 'C');
setup('SAMPLE the catalogue carries pet species', PETS.length >= 5,
  `${PETS.length} species: ${PETS.map(p => p.id).join(' ')}`);
setup('SAMPLE Gwart is selling one of them, so the shop path is drivable',
  !!(PET_SHOP && PET_SHOP.pet && PETS.some(p => p.id === PET_SHOP.pet.id)),
  `shop pet ${PET_SHOP && PET_SHOP.pet && PET_SHOP.pet.id} at ${PET_SHOP && PET_SHOP.pet && PET_SHOP.pet.coin} coins`);

/* ---- MINT: ownership without a copy, caught in the source ---- */
/* PET_PROOF is a claim about the POOL each site draws from, not about the
   function being careful. Each of these grants an id chosen from a list that
   holds no species, which tests/pet-pool-audit.mjs measures directly (no pet and
   no pet accessory can come out of a crate at either rarity floor) and
   tests/pet-accessory-lint.mjs pins statically (nothing sellable carries slot
   'C'). If one of those pools ever gains a pet, it gains a ghost too, and the
   OWNED row below cannot see it because it drives the honest paths. */
const PET_PROOF = {
  buyDropItem: 'DROP.items is a hand-written list of T9/H13 cosmetics, no slot C',
  buyRackItem: "the weekly rack is built from wearable slots; pet-pool-audit measures the pools",
  openCrate: 'crate pools exclude pets and pet accessories, measured in pet-pool-audit',
  /* Football kit, 2026-09-04: both paths grant footballGrantIds / footballBundleIds,
     which are copies of the FIVE FOOTBALL_SHELF garments (H, T, FW and the lizard's
     two accessory slots) across 32 teams. No species is in that list; the lizard
     pieces are accessories the player's own lizard wears, not a lizard. */
  buyFootballItem: 'footballGrantIds is one wearable garment in 32 colourways, no slot C',
  buyFootballBundle: 'footballBundleIds is the five FOOTBALL_SHELF garments in 32 colourways, no slot C',
};
const lootSrc = readFileSync(path.join(ROOT, 'js/loot.js'), 'utf8');
const fnStarts = [...lootSrc.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)]
  .map(m => ({ name: m[1], at: m.index }));
const enclosing = at => {
  let cur = null;
  for (const f of fnStarts) { if (f.at < at) cur = f; else break; }
  return cur ? cur.name : '(top level)';
};
const grantSites = [...lootSrc.matchAll(/\bgrantCosmetic\s*\(/g)]
  .map(m => ({ at: m.index, line: lootSrc.slice(0, m.index).split('\n').length }))
  .map(s => ({ ...s, fn: enclosing(s.at) }))
  .filter(s => s.fn !== 'grantCosmetic');
const bodyOf = name => {
  const i = fnStarts.findIndex(f => f.name === name);
  if (i < 0) return '';
  return lootSrc.slice(fnStarts[i].at, i + 1 < fnStarts.length ? fnStarts[i + 1].at : lootSrc.length);
};
setup('MINT there are grantCosmetic call sites to grade', grantSites.length > 0,
  `${grantSites.length} sites in ${new Set(grantSites.map(s => s.fn)).size} functions`);
const ghosts = [...new Set(grantSites.map(s => s.fn))].filter(fn =>
  !PET_PROOF[fn] && !/\b(addPetInstance|deliverPet)\s*\(/.test(bodyOf(fn)));
ok('MINT every js/loot.js path that grants ownership either mints a pet copy or says why it cannot grant a pet',
  ghosts.length === 0,
  ghosts.length
    ? `${ghosts.join(', ')} write an inv 'cos' row and no petInst row: a pet granted there is owned, equippable and invisible in the Stable and the Paddock`
    : [...new Set(grantSites.map(s => s.fn))].map(fn => `${fn}${PET_PROOF[fn] ? ' (pet-proof)' : ' (mints)'}`).join(', '));

/* ---- TABLES: the same bug class, one module over ---- */
/* Found while fixing the ownership bug and it is the identical shape: a lookup
   with rows for C1..C5 and nothing for C6. buildBattlePet's FIRST LINE is
   `if (!petId || !PET_ASSIGN[petId]) return null`, so equipping the 50,000-coin
   legendary handed the Pit no pet at all, and petBattleStats' `|| { rarity:
   'common', mult: 1 }` gave her a COMMON stat line. Neither throws, neither
   renders wrong, and both were reachable in v421 through the 1% egg without
   buying anything. PET_SIGNATURE is reported and NOT graded: a missing capstone
   degrades to an absent panel at Lv 10, which is a hole in the writing rather
   than a broken mechanic, and it is Cam and Tom's line to write. */
const TABLES = { PET_ASSIGN: PET_ASSIGN, PET_STATS: PET_STATS };
const unregistered = Object.entries(TABLES).flatMap(([name, table]) =>
  PETS.filter(p => !table[p.id]).map(p => `${p.id} missing from ${name}`));
const noSig = PETS.filter(p => !PET_SIGNATURE[p.id]).map(p => p.id);
ok('TABLES every pet species is registered in the tables that decide whether it can fight and how hard',
  PETS.length > 0 && unregistered.length === 0,
  unregistered.length
    ? unregistered.join(', ') + ' (a species absent from PET_ASSIGN cannot fight at all; absent from PET_STATS it fights as a common)'
    : `${PETS.length} species in both${noSig.length ? `; NOTE no PET_SIGNATURE capstone for ${noSig.join(', ')}, not graded` : ''}`);

/* ---- live ---- */
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--') && /^https?:/.test(a));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || process.env.URL || srv.url;
const { browser, page } = await boot(base);

try {
  await seed(page, { level: 20, coins: 400000 });
  await setWidth(page, 393, 852);

  /* THE REAL PATHS. Anything the shop sells is BOUGHT, through buyPetItem, which
     is the path that was broken; everything else arrives through grantPet, which
     is what hatching and code redemption call. Nothing here hand-writes a
     petInst row, because a hand-written row proves the screens can render a row
     somebody else wrote and says nothing about the paths a player uses. */
  const granted = await page.evaluate(async (petIds, shopPetId) => {
    const loot = await import('/js/loot.js');
    const before = (await loot.petInstances()).reduce((m, x) => (m[x.sp] = (m[x.sp] || 0) + 1, m), {});
    window.__petsBefore = before;
    const out = [];
    for (const id of petIds) {
      const via = id === shopPetId ? 'shop' : 'grantPet';
      const r = via === 'shop' ? await loot.buyPetItem(id) : await loot.grantPet(id);
      out.push({ id, via, ok: !!r && (r.ok !== false) });
    }
    return out;
  }, PETS.map(p => p.id), PET_SHOP.pet.id);
  const refused = granted.filter(g => !g.ok);
  setup('SAMPLE every species could be granted through its real path', refused.length === 0,
    granted.map(g => `${g.id} via ${g.via}${g.ok ? '' : ' REFUSED'}`).join(', '));

  const data = await page.evaluate(async () => {
    const loot = await import('/js/loot.js');
    const pdk = await import('/js/paddock.js');
    const cards = await import('/js/paddock-cards.js');
    const insts = await loot.petInstances();
    const roster = await pdk.paddockRoster();
    return {
      counts: insts.reduce((m, x) => (m[x.sp] = (m[x.sp] || 0) + 1, m), {}),
      before: window.__petsBefore || {},
      roster: roster.map(r => r.sp),
      grid: cards.gridModel(roster).filter(t => t.owned).map(t => t.sp),
    };
  });
  const missingInst = PETS.filter(p => !data.counts[p.id]).map(p => p.id);
  const missingRoster = PETS.filter(p => !data.roster.includes(p.id)).map(p => p.id);
  ok('OWNED every species granted through its real path holds a copy in petInst and in the Paddock roster',
    missingInst.length === 0 && missingRoster.length === 0,
    missingInst.length || missingRoster.length
      ? `absent from petInst: ${missingInst.join(', ') || 'none'}; absent from the roster: ${missingRoster.join(', ') || 'none'}`
      : PETS.map(p => `${p.id}x${data.counts[p.id]}`).join(' '));

  /* ONE GRANT, ONE PET. The fix mints from two places (the purchase and the
     read-time reclaim) and on a fresh buy they run in that order, so the failure
     this bounds is a 50,000-coin legendary arriving twice. Rule 11: state the
     BOUND, not the trend. A DELTA, because dupes legitimately stack (grantPet on
     a species you own is a second copy on purpose) and the demo save opens
     already owning one, so an absolute count of 1 would fail on healthy code. */
  const doubled = PETS.map(p => ({ id: p.id, d: (data.counts[p.id] || 0) - (data.before[p.id] || 0) }))
    .filter(x => x.d !== 1);
  ok('OWNED and each grant adds exactly one copy, never two', doubled.length === 0,
    doubled.length
      ? `${doubled.map(x => `${x.id} +${x.d}`).join(', ')}: one grant must add exactly one copy (0 = it never arrived, 2+ = the purchase and the reclaim both minted)`
      : PETS.map(p => `${p.id} +1`).join(' '));

  /* ---- STABLE, through the real button ---- */
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);
  await page.waitForFunction(() => !!document.getElementById('stableBtn'), { timeout: 30000, polling: 100 }).catch(() => {});
  await page.evaluate(() => document.getElementById('stableBtn')?.click());
  await page.waitForFunction(() => !!document.querySelector('#stableBody .cf-card'), { timeout: 30000, polling: 100 }).catch(() => {});
  await settle(page, 400);
  const stable = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#stableBody .cf-card')];
    return {
      species: [...new Set(cards.map(c => c.dataset.sp))],
      /* DRAWN, not merely in the DOM: the carousel is overflow:hidden and a card
         with no box is a card nobody can tap (figure contract, and anti-regression
         rule 5). Width, because the ring lays the cards out horizontally. */
      sized: [...new Set(cards.filter(c => c.getBoundingClientRect().width > 8).map(c => c.dataset.sp))],
      total: cards.length,
    };
  });
  const notInStable = PETS.filter(p => !stable.sized.includes(p.id)).map(p => p.id);
  ok('STABLE the real Stable draws a card for every species owned',
    stable.total > 0 && notInStable.length === 0,
    notInStable.length
      ? `${notInStable.join(', ')} owned and absent from the Stable (${stable.total} cards: ${stable.species.join(' ')})`
      : `${stable.total} cards, species ${stable.sized.join(' ')}`);
  await shot(page, 'stable');

  /* ---- PADDOCK, through the real door ---- */
  const reached = await page.evaluate(async () => {
    const b = document.getElementById('stableToPaddock');
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (reached) await page.mouse.click(reached.x, reached.y);
  await page.waitForFunction(() => !!document.getElementById('pdkScene'), { timeout: 30000, polling: 100 }).catch(() => {});
  await settle(page, 600);
  const tiles = await page.evaluate(() => [...document.querySelectorAll('#pdkPanel .pdk-tile[data-sp]')]
    .map(t => ({ sp: t.dataset.sp, locked: t.classList.contains('pdk-lockt') })));
  const lockedOwned = PETS.filter(p => {
    const t = tiles.find(x => x.sp === p.id);
    return !t || t.locked;
  }).map(p => p.id);
  ok('PADDOCK the collection panel shows every owned species unlocked, not as a "?" tile',
    tiles.length > 0 && lockedOwned.length === 0,
    lockedOwned.length
      ? `${lockedOwned.join(', ')} still locked or absent (${tiles.length} tiles)`
      : `${tiles.length} tiles, all owned species unlocked`);

  /* AND THE CARD, which is where the silhouette and the wrong copy lived: a
     species with no roster row renders lockedCardHtml, a `.pdk-sil` thumb over
     the Day One Lizard's "check your inbox" line. Driven through the app's own
     mount seam, on the shop pet specifically. */
  const card = await page.evaluate(async id => {
    if (typeof window.__pdkMountCards !== 'function') return { seam: false };
    const m = await window.__pdkMountCards(id);
    const el = document.querySelector('#pdkCards .pdk-card');
    return {
      seam: true, mounted: m,
      locked: !!el && el.classList.contains('pdk-locked'),
      silhouette: !!document.querySelector('#pdkCards .pdk-sil'),
      text: el ? (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90) : null,
    };
  }, PET_SHOP.pet.id);
  ok(`PADDOCK tapping ${PET_SHOP.pet.id} opens her real card, not a silhouette with somebody else's copy`,
    card.seam && !card.locked && !card.silhouette && !!card.text,
    JSON.stringify(card));
  await shot(page, 'paddock');

  /* ---- RECLAIM: the account that already paid ---- */
  /* v421's buyPetItem, verbatim: the ownership row and the paper-doll slot, and
     no copy. Written through the real functions so this cannot drift away from
     the bug it reproduces. */
  const broke = await page.evaluate(async id => {
    const loot = await import('/js/loot.js');
    const insts = (await loot.petInstances()).filter(x => x.sp !== id);
    const db = await new Promise((res, rej) => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ k: 'petInst', v: insts });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    return { left: insts.length, owned: [...await loot.ownedCosmeticIds()].includes(id) };
  }, PET_SHOP.pet.id);
  setup('SAMPLE v421\'s broken state was reproduced: owned, no copy',
    broke.owned && broke.left >= 1, JSON.stringify(broke));

  const healed = [];
  for (let i = 0; i < 3; i++) {
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2000);
    healed.push(await page.evaluate(async id => {
      const loot = await import('/js/loot.js');
      const pdk = await import('/js/paddock.js');
      return {
        copies: (await loot.petInstances()).filter(x => x.sp === id).length,
        inRoster: (await pdk.paddockRoster()).some(r => r.sp === id),
      };
    }, PET_SHOP.pet.id));
  }
  ok('RECLAIM an account that already bought her gets her back on the next boot, exactly once',
    healed.every(h => h.copies === 1 && h.inRoster),
    healed.map((h, i) => `boot ${i + 1}: ${h.copies} copies, roster ${h.inRoster}`).join('; '));
} finally {
  await browser.close();
  if (srv) srv.close();
}

console.log(fails ? '\nPET OWNERSHIP: FAILED' : '\nPET OWNERSHIP: every pet you own has a copy, and both screens show it');
process.exit(fails);

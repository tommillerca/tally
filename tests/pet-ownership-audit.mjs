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
 *   COLLAPSE live, DOM (2026-09-05). Tom on v476: "the stable is overwhelming
 *            with too much of the same pet ... scrolling past 50 bulldogs to get
 *            to the lizard." Twelve Bulldogs and one lizard, and the ring must
 *            draw TWO cards, the Bulldog card must carry the 12, and one real
 *            pointer swipe from the Bulldog must land on the lizard. Proven red
 *            on v476 (fca972e2): 13 cards, no count, the swipe lands on Bulldog
 *            number two.
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
 * PROVE-RED, the R39 rows (2026-09-06), on v487 d7906217 in a throwaway worktree
 * with this file copied in unchanged, HEADLESS_MODE=shell. 5 FAILED, the 21
 * older rows green, exit 1:
 *   FAIL  HER the Stable's wardrobe heading shows a species name containing <b> as text, not markup  | {"found":true,"text":"Bumblesealx's wardrobe","bold":true}
 *   FAIL  GHOST an instance row with no sp is skipped: the Stable still draws every real species and throws nothing  | 0 cards, ghost card false, page errors TypeError: Cannot read properties of undefined (reading 'file') bhAsset (.../data/boneheadz.js:2034:45)
 *   FAIL  STABLE-EQ the Stable never disables EQUIP for a pet the worn outfit does not hold (the button is disabled only while C is her species)  | {"found":true,"disabled":true,"label":"OUT WITH YOU","sp":"C6"}
 *   FAIL  STABLE-EQ and opening the Stable heals the slot, so Today draws her again  | C=undefined petEquipped species=C6
 *   FAIL  FIRSTPET hatching the welcome egg through the real HATCH button puts her on Today: C slot set, #heroPetBtn drawn, both records agree  | {"hash":"#/today","petEquipped":"pmtq2uv10-1-C5","eqSp":"C5","instances":["C5"],"heroPetBtn":false}
 * Green on hotfix/first-pet: 26 PASS, 52s.
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
const { browser, page, errors } = await boot(base);   // errors: boot's pageerror log, read by GHOST below

try {
  await seed(page, { level: 20, coins: 400000 });
  await setWidth(page, 393, 852);

  /* ---- COLLAPSE: one card per species ---- */
  /* FIRST, before the grants below own every species: the demo save opens with
     its own pet or two and reclaimOwnedPets re-mints a copy of anything owned at
     boot, so a roster of exactly two species is only buildable while almost
     nothing is owned. The herd goes in through the same writer hatching uses
     (addPetInstance), everything but the herd and the lizard is cut with kvSet
     the way breed-sheet-scroll-audit builds its roster, and a Bulldog is
     EQUIPPED so the ring OPENS on the herd: a ring that already opened on the
     lizard would pass REACH without moving. Whatever the demo save reclaims on
     top is read back live and graded as species, never assumed. */
  const HERD = 'C5', ONE = 'C4', N_HERD = 12;
  const herd = await page.evaluate(async ([herdSp, oneSp, n]) => {
    const loot = await import('/js/loot.js');
    const { kvSet } = await import('/js/db.js');
    for (let i = (await loot.petInstances()).filter(x => x.sp === herdSp).length; i < n; i++) await loot.addPetInstance(herdSp, {});
    if (!(await loot.petInstances()).some(x => x.sp === oneSp)) await loot.addPetInstance(oneSp, {});
    const all = await loot.petInstances();
    const list = [...all.filter(x => x.sp === herdSp).slice(0, n), all.find(x => x.sp === oneSp)];
    await kvSet('petInst', list);
    await loot.setEquippedPet(list[0].iid);
    return { herd: list.filter(x => x.sp === herdSp).length, total: list.length };
  }, [HERD, ONE, N_HERD]);
  setup(`SAMPLE the roster was cut to ${N_HERD} ${HERD} and one ${ONE}`, herd.total === N_HERD + 1 && herd.herd === N_HERD, JSON.stringify(herd));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);
  await page.waitForFunction(() => !!document.getElementById('stableBtn'), { timeout: 30000, polling: 100 }).catch(() => {});
  await page.evaluate(() => document.getElementById('stableBtn')?.click());
  await page.waitForFunction(() => !!document.querySelector('#stableBody .cf-card.focus'), { timeout: 30000, polling: 100 }).catch(() => {});
  await settle(page, 600);
  const ring = await page.evaluate(async herdSp => {
    const loot = await import('/js/loot.js');
    const insts = await loot.petInstances();
    const cards = [...document.querySelectorAll('#stableBody .cf-card')];
    const herdCard = cards.find(c => c.dataset.sp === herdSp);
    const badge = herdCard && herdCard.querySelector('.cf-n');
    return {
      owned: insts.length, herdOwned: insts.filter(x => x.sp === herdSp).length, species: [...new Set(insts.map(x => x.sp))],
      cards: cards.map(c => c.dataset.sp),
      badge: badge ? badge.textContent.trim() : null,
      badgeBox: badge ? badge.getBoundingClientRect().width > 0 && badge.getBoundingClientRect().height > 0 : false,
      focus: document.querySelector('#stableBody .cf-card.focus')?.dataset.sp || null,
      kin: document.querySelectorAll('#stableBody .cf-kin [data-kin]').length,
    };
  }, HERD);
  ok(`COLLAPSE the ring draws ONE card per species owned, not one per copy: ${N_HERD} ${HERD} collapse to a single card`,
    ring.herdOwned === N_HERD && ring.cards.length === ring.species.length && ring.species.every(sp => ring.cards.includes(sp)),
    `${ring.owned} copies of ${ring.species.length} species (${ring.species.join(' ')}), ${ring.cards.length} cards: ${ring.cards.join(' ')}`);
  ok(`COLLAPSE-COUNT the ${HERD} card carries the herd's size and the caption lists every copy`,
    ring.badge !== null && new RegExp(`\\b${N_HERD}\\b`).test(ring.badge) && ring.badgeBox && ring.kin === N_HERD,
    `badge ${JSON.stringify(ring.badge)} (drawn ${ring.badgeBox}), ${ring.kin} copy chips under the caption`);
  setup(`SAMPLE the ring opened on the ${HERD}, so the swipe below has somewhere to go`, ring.focus === HERD, `opened on ${ring.focus}`);
  /* ONE REAL SWIPE, towards the lizard (the ring wraps, so the short way is
     read off the card indexes), slow enough that the ring's own momentum carries
     at most a card: 0.6 of a card over ~600ms, which the spring rounds to the
     next card. Mouse pointer events are what the frame listens for; a tap is
     excluded by moving past its 5px slop. */
  const fr = await page.evaluate(oneSp => {
    const r = document.getElementById('cfFrame').getBoundingClientRect();
    const cards = [...document.querySelectorAll('#stableBody .cf-card')];
    const from = cards.findIndex(c => c.classList.contains('focus')), to = cards.findIndex(c => c.dataset.sp === oneSp);
    let d = to - from; if (d > cards.length / 2) d -= cards.length; if (d < -cards.length / 2) d += cards.length;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, card: cards[0].getBoundingClientRect().width, dir: Math.sign(d) || 1 };
  }, ONE);
  await page.mouse.move(fr.x, fr.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(fr.x - fr.dir * fr.card * 0.6 * i / 12, fr.y); await sleep(50); }
  await page.mouse.up();
  await sleep(1200);
  const after = await page.evaluate(() => document.querySelector('#stableBody .cf-card.focus')?.dataset.sp || null);
  ok(`COLLAPSE-REACH one swipe from the ${HERD} lands on the ${ONE}, not on the next ${HERD}`,
    after === ONE, `focused ${after} after one swipe (started on ${ring.focus}, ${ring.cards.length} cards in the ring)`);
  await shot(page, 'stable-collapse');
  await page.evaluate(() => document.querySelector('.sheet-close')?.click());
  await sleep(600);

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

  /* ---- R39-31 (2026-09-06): the Stable over a name and a row it did not expect ---- */
  /* HER: the wardrobe heading interpolated the species name raw (`${her}`). The
     catalogue names are ours today, so this pins the sink rather than a live
     exploit: the shop pet's name is given a `<b>` in the live module (the app
     and this evaluate share one module instance per URL), the real Stable is
     opened, and the heading must carry the brackets as TEXT with no element
     born from them. Pre-fix: textContent "Bumbleseal's wardrobe", a <b> node. */
  const her = await page.evaluate(async id => {
    const { BH_BY_ID } = await import('/data/boneheadz.js');
    const real = BH_BY_ID[id].name;
    BH_BY_ID[id].name = real + '<b>x</b>';
    try {
      document.getElementById('stableBtn')?.click();
      const t0 = Date.now();
      while (!document.querySelector(`#stableBody .pet-wear[data-pwsp="${id}"] .pw-h`) && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
      const h = document.querySelector(`#stableBody .pet-wear[data-pwsp="${id}"] .pw-h`);
      return { found: !!h, text: h ? h.textContent : null, bold: !!(h && h.querySelector('b')) };
    } finally { BH_BY_ID[id].name = real; }
  }, PET_SHOP.pet.id);
  ok(`HER the Stable's wardrobe heading shows a species name containing <b> as text, not markup`,
    her.found && her.text.includes('<b>x</b>') && !her.bold, JSON.stringify(her));
  await page.evaluate(() => document.querySelector('.sheet-close')?.click());
  await settle(page, 500);

  /* GHOST: an instance row with no `sp` threw a TypeError out of bhAsset and the
     whole Stable came up with ZERO cards (measured on d7906217). The Stable must
     draw everybody else and throw nothing; the ghost is logged once, not fatal. */
  const ghostBefore = await page.evaluate(async () => {
    const { kvGet, kvSet } = await import('/js/db.js');
    const l = await kvGet('petInst', []);
    l.push({ iid: 'p-ghost-r39-31', lineage: 0, shiny: false, hatchedAtSteps: 0 });
    await kvSet('petInst', l);
    return l.length;
  });
  const errs0 = errors.length;
  await page.evaluate(() => document.getElementById('stableBtn')?.click());
  await page.waitForFunction(() => !!document.querySelector('#stableBody .cf-card'), { timeout: 15000, polling: 100 }).catch(() => {});
  await settle(page, 500);
  const ghost = await page.evaluate(() => ({
    cards: document.querySelectorAll('#stableBody .cf-card').length,
    ghostCard: !!document.querySelector('#stableBody .cf-card[data-sp="undefined"]'),
  }));
  ok('GHOST an instance row with no sp is skipped: the Stable still draws every real species and throws nothing',
    ghostBefore > 1 && ghost.cards >= 1 && !ghost.ghostCard && errors.length === errs0,
    `${ghost.cards} cards, ghost card ${ghost.ghostCard}, page errors ${errors.slice(errs0).join(' | ') || 'none'}`);
  await page.evaluate(async () => {
    document.querySelector('.sheet-close')?.click();
    const { kvGet, kvSet } = await import('/js/db.js');
    await kvSet('petInst', (await kvGet('petInst', [])).filter(x => x && x.sp));
  });
  await settle(page, 500);

  /* ---- R39-1 (2026-09-06), P0: the first pet you hatch reaches Today ---- */
  /* STABLE-EQ: the shipped state exactly. petEquipped names a real instance and
     the paper-doll C slot is empty, which is what v482..v487 left every player in
     after their first hatch. The Stable then said OUT WITH YOU with EQUIP
     disabled, so no control anywhere could put her on Today. The rule is
     CONSISTENCY, in the direction that matters: the button may only be disabled
     while the worn outfit actually holds her. Pre-fix: disabled=true, C=undefined. */
  const stuck = await page.evaluate(async () => {
    const loot = await import('/js/loot.js');
    const { kvSet } = await import('/js/db.js');
    const iid = await loot.equippedPetIid();
    const eq = await loot.equipped({ raw: true }); delete eq.C; await kvSet('equipped', eq);
    return { iid, C: (await loot.equipped({ raw: true })).C };
  });
  setup('SAMPLE the shipped disagreement was reproduced: petEquipped set, C slot empty',
    !!stuck.iid && stuck.C === undefined, JSON.stringify(stuck));
  await page.evaluate(() => document.getElementById('stableBtn')?.click());
  await page.waitForFunction(() => !!document.querySelector('#stableBody [data-eq]'), { timeout: 15000, polling: 100 }).catch(() => {});
  await settle(page, 500);
  const eqBtn = await page.evaluate(async () => {
    const loot = await import('/js/loot.js');
    const b = document.querySelector('#stableBody [data-eq]');
    const inst = (await loot.petInstances()).find(x => x.iid === (b && b.dataset.eq));
    return { found: !!b, disabled: !!(b && b.disabled), label: b ? b.textContent : null, sp: inst ? inst.sp : null, C: (await loot.equipped({ raw: true })).C };
  });
  ok('STABLE-EQ the Stable never disables EQUIP for a pet the worn outfit does not hold (the button is disabled only while C is her species)',
    eqBtn.found && !(eqBtn.disabled && eqBtn.C !== eqBtn.sp), JSON.stringify(eqBtn));
  ok('STABLE-EQ and opening the Stable heals the slot, so Today draws her again',
    eqBtn.found && !!eqBtn.sp && eqBtn.C === eqBtn.sp, `C=${eqBtn.C} petEquipped species=${eqBtn.sp}`);
  await page.evaluate(() => document.querySelector('.sheet-close')?.click());
  await settle(page, 400);

  /* FIRSTPET: the whole path, as a player walks it. A SECOND page on the plain
     `tally` database (this profile has never opened it, so it is a cold install):
     the real onboarding buttons, the Bonehead hub's Backpack chip, the welcome
     egg's own HATCH button, the reveal's Adopt, then home. Today must draw her
     (#heroPetBtn, which petFrom(null, eq.C) only yields with a C slot) and both
     records must agree. Pre-fix on d7906217: eq={B,SK}, petEquipped set,
     #heroPetBtn absent. */
  const fresh = await browser.newPage();
  const freshErrors = [];
  fresh.on('pageerror', e => freshErrors.push(String(e)));
  try {
    await fresh.goto(base.replace(/\/?$/, '/'), { waitUntil: 'networkidle2' });
    await sleep(900);
    const onb = [];
    for (const id of ['#onbGo', '#onbMe', '#onbSkip']) {
      const has = await fresh.$(id);
      onb.push(`${id}:${!!has}`);
      if (has) { await fresh.click(id); await sleep(id === '#onbSkip' ? 1800 : 500); }
    }
    await fresh.evaluate(() => (document.getElementById('cratesBtn') || document.getElementById('charBtn'))?.click());
    await fresh.waitForFunction(() => !!document.querySelector('#chTabs .chip[data-tab="crates"]'), { timeout: 15000, polling: 100 }).catch(() => {});
    await fresh.evaluate(() => document.querySelector('#chTabs .chip[data-tab="crates"]')?.click());
    await fresh.waitForFunction(() => !!document.querySelector('[data-hatch]'), { timeout: 15000, polling: 100 }).catch(() => {});
    const hatchable = await fresh.evaluate(() => document.querySelectorAll('[data-hatch]').length);
    ok('FIRSTPET-SETUP real onboarding landed on Today and the Backpack offers the welcome egg\'s HATCH button',
      hatchable >= 1, `${onb.join(' ')} hatch buttons ${hatchable}`);
    await fresh.evaluate(() => document.querySelector('[data-hatch]')?.click());
    await fresh.waitForFunction(() => !!document.querySelector('#hatchOk'), { timeout: 15000, polling: 100 }).catch(() => {});
    await sleep(600);
    /* Adopt is two states (skip the cinematic, then leave); under webdriver the
       reveal is already shown, so one tap leaves and a second is a no-op. */
    for (let i = 0; i < 2; i++) { await fresh.evaluate(() => document.querySelector('#hatchOk')?.click()); await sleep(700); }
    await fresh.evaluate(() => { location.hash = '#/today'; });
    await fresh.waitForFunction(() => !!document.querySelector('#heroPetBtn'), { timeout: 8000, polling: 100 }).catch(() => {});
    const home = await fresh.evaluate(async () => {
      const loot = await import('/js/loot.js');
      const { kvGet } = await import('/js/db.js');
      const insts = await loot.petInstances();
      const iid = await kvGet('petEquipped', null);
      return { hash: location.hash, C: (await loot.equipped({ raw: true })).C, petEquipped: iid, eqSp: (insts.find(x => x.iid === iid) || {}).sp || null, instances: insts.map(x => x.sp), heroPetBtn: !!document.querySelector('#heroPetBtn') };
    });
    ok('FIRSTPET hatching the welcome egg through the real HATCH button puts her on Today: C slot set, #heroPetBtn drawn, both records agree',
      home.instances.length === 1 && !!home.C && home.C === home.instances[0] && home.eqSp === home.C && home.heroPetBtn,
      JSON.stringify(home));
    ok('FIRSTPET no page error across onboarding, the hatch and the return home', freshErrors.length === 0, freshErrors.join(' | ').slice(0, 300));
  } finally { await fresh.close(); }

} finally {
  await browser.close();
  if (srv) srv.close();
}

console.log(fails ? '\nPET OWNERSHIP: FAILED' : '\nPET OWNERSHIP: every pet you own has a copy, and both screens show it');
process.exit(fails);

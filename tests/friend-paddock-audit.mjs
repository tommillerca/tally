/* A FRIEND'S PADDOCK, AND THE FIRST TIME PETS HAVE EVER LEFT THE DEVICE.
 *
 * Tom, 2026-08-22: "lets make it so when you click on a friend in the crew you
 * can see their paddock and how many cool pets they have it'll make people want
 * to show off to their friends."
 *
 * Showing off needs the roster on somebody else's phone, and this project has
 * two channels to somebody else's phone which are NOT interchangeable:
 *
 *   players.backups  the END-TO-END ENCRYPTED vault. AES-GCM, key never leaves
 *                    the device, server cannot read it. Correct for a save.
 *                    USELESS for this: a friend cannot decrypt it either.
 *   players.profile  the plaintext social snapshot. The server reads it, and
 *                    GET /friends hands the whole blob to accepted friends.
 *
 * So `yard` rides the PLAINTEXT one, and the entire risk of this feature is that
 * "plaintext" and "crew-only" are two different promises and only one of them is
 * enforced by the channel. Crew-only is enforced by WHICH ROUTE returns the
 * blob, and there are two routes:
 *
 *   GET /friends      returns the whole profile, joined through an ACCEPTED
 *                     friendship. This is the one the feature wants.
 *   GET /leaderboard  returns a FIXED json_extract list for the top 100, to any
 *                     authenticated caller. Anything named in that list is
 *                     public to every player in the game.
 *
 * A field is crew-only precisely when it is absent from the second list. That is
 * a fact about a SQL statement, so PUBLIC below reads the real statement out of
 * server/src/index.js and fails if `yard` ever appears in it. It is also why the
 * pet wardrobe is NOT hung off `snapshot.pet`: `pet` IS in that list, so wear on
 * `pet` would have published the wardrobe to the whole leaderboard. WEARHOME
 * pins that specific mistake, because it is one line and an easy one to make.
 *
 * WHAT EACH ROW FAILS ON:
 *
 *   SHAPE     the snapshot the app really builds carries yard.n, yard.pets
 *             (sp + shiny only) and yard.wear, and NOTHING else. Derived from
 *             the live payload, so a field added later fails here until somebody
 *             decides it belongs on the wire.
 *   MINIMAL   no instance ids, no nicknames, no bonds, no lineage, no per-pet
 *             levels. Nicknames especially: kv 'petNick' is private and
 *             tests/nickname-private-audit.mjs already pins it, so this is the
 *             same promise at the new field.
 *   CAP       a big roster cannot push the profile past the server's 24KB bound,
 *             and the true total still rides beside the capped list.
 *   PUBLIC    `yard` is absent from /leaderboard's extract list: crew-only, as a
 *             property of the query rather than of anyone's intention.
 *   WEARHOME  the wardrobe is NOT on `snapshot.pet`, which is leaderboard-public.
 *   VAULT     nothing about the yard is read out of the encrypted backup path.
 *   RENDER    a friend's profile draws their pets, decoded and visible, with the
 *             count, driven through the real __openFriendProfile seam.
 *   THEIRS    their Bumbleseal wears THEIR wardrobe. The viewer is wearing a
 *             DIFFERENT set in the same run, so a render that reached for
 *             S.petWear draws the wrong clothes and this row names them. This is
 *             the figure contract's rule 1 and the shiny bug in a new coat.
 *   OLDBUILD  a friend with no `yard` (an older client, or a stranger off the
 *             leaderboard, who correctly has none) shows NO paddock strip and an
 *             undressed pet, rather than an empty shelf that reads as "they own
 *             nothing" or a pet wearing the viewer's clothes.
 *   DOOR      the way into their field is on the profile exactly when there is a
 *             field to walk into.
 *   FIELD     the door opens their PADDOCK, the same scene the player sees their
 *             own herd in: their pets placed in the field, every sprite decoded,
 *             their Bonehead standing in it. Driven by a real tap, continuing
 *             REACH's chain, so the whole path from the crew deck to the field is
 *             one thing a player did.
 *   DRESSED   THEIRS one surface further in. The shelf can be right and the field
 *             wrong: the scene is a different render path and it is the path that
 *             used to answer S.petWear for everybody, because the player's own
 *             field was the only one it had ever drawn.
 *   TALLY     the count under their field is what they OWN. Three numbers are in
 *             play (owned, on the wire, on screen after the walk cap) and the wire
 *             cap is our bookkeeping, not their collection.
 *   HONEST    their field borrows the scene but not its promises: no coach mark
 *             inviting a tap onto a card slider with no data behind it, and no
 *             collection panel to mount one in.
 *
 * WHAT THE SCENE DOES WITHOUT, rather than asking the wire for it: their eggs (the
 * nest stands empty), their bonds and levels (so nothing there is tappable) and
 * their instance ids (the herd is keyed by position). `yard` rides the plaintext
 * blob to every accepted friend, so a field added to make the picture nicer is a
 * field published, and SHAPE below is what makes that a decision rather than a
 * side effect.
 *
 * PROVE-RED: see the block at the end of this file.
 *
 * Run: node tests/friend-paddock-audit.mjs [baseUrl] [--shots DIR]
 */
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, settle, serveTree } from './godmode.js';
import { PET_SHOP, BH_BY_ID } from '../data/boneheadz.js';

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
  await settle(page);
  const f = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: f });
  console.log(`      shot: ${f}`);
};

/* ---- PUBLIC + WEARHOME + VAULT: static, against the real server source ---- */
const SRV = readFileSync(path.join(ROOT, 'server/src/index.js'), 'utf8');
const lbAt = SRV.indexOf("path === '/leaderboard'");
setup('SAMPLE the /leaderboard route was found in server/src/index.js', lbAt > 0, `at char ${lbAt}`);
/* The route's own SELECT, to its terminating .all(): the only thing that decides
   what a non-friend can read off somebody's profile. */
const lbSrc = SRV.slice(lbAt, SRV.indexOf('.all()', lbAt));
const lbFields = [...lbSrc.matchAll(/json_extract\(profile,'\$\.(\w+)'\)/g)].map(m => m[1]);
setup('SAMPLE the leaderboard query really does extract named profile fields',
  lbFields.length >= 5, `${lbFields.length} fields: ${lbFields.join(', ')}`);
ok('PUBLIC the pet roster is absent from /leaderboard, so it reaches accepted friends and nobody else',
  !lbFields.includes('yard'),
  `leaderboard publishes [${lbFields.join(', ')}] to any authenticated caller; yard is ${lbFields.includes('yard') ? 'AMONG THEM' : 'not among them'}`);

const APP = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const snapAt = APP.indexOf('async function socialSnapshot(');
setup('SAMPLE socialSnapshot was found in js/app.js', snapAt > 0, `at char ${snapAt}`);
const snapSrc = APP.slice(snapAt, APP.indexOf('\n}', APP.indexOf('  return {', snapAt)));
/* The `pet:` line of the payload, which is the one leaderboard-public object a
   wardrobe could be attached to by mistake. */
const petLine = (snapSrc.match(/^\s*pet:.*$/m) || [''])[0];
setup('SAMPLE the snapshot has a pet field to grade', !!petLine.trim(), petLine.trim().slice(0, 90));
ok('WEARHOME the pet wardrobe is not hung off `pet`, which /leaderboard publishes to every player',
  lbFields.includes('pet') && !/\bwear\b/.test(petLine),
  `pet is leaderboard-public=${lbFields.includes('pet')}; its payload line ${/\bwear\b/.test(petLine) ? 'CARRIES wear' : 'carries no wear'}`);

/* The encrypted vault is built by exportAll and pushed by pushBackup; the social
   snapshot is a different function feeding a different route. If socialSnapshot
   ever reached into the backup path, "plaintext" and "encrypted" would have
   stopped being two channels. */
ok('VAULT the yard is built in the plaintext snapshot and never touches the encrypted backup path',
  /yard\s*=/.test(snapSrc) && !/exportAll|pushBackup|encryptBackup/.test(snapSrc),
  `socialSnapshot builds yard=${/yard\s*=/.test(snapSrc)}, references the vault=${/exportAll|pushBackup|encryptBackup/.test(snapSrc)}`);

/* ------------------------------- live ------------------------------------- */
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--') && /^https?:/.test(a));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || process.env.URL || srv.url;
const { browser, page } = await boot(base);

const PET = PET_SHOP.pet.id;                                   // the one dressable pet
const ITEMS = (PET_SHOP.items || []).filter(i => BH_BY_ID[i.id]);
const bySlot = {};
for (const i of ITEMS) (bySlot[BH_BY_ID[i.id].slot] ||= []).push(i.id);
/* TWO DIFFERENT WARDROBES, and they must differ in a slot BOTH of them fill, or
   "she is wearing theirs" and "she is wearing yours" would be indistinguishable.
   The doubled slot in the catalogue is what makes that possible at all. */
const DOUBLED = Object.entries(bySlot).find(([, ids]) => ids.length >= 2);
setup('SAMPLE two accessories share a slot, so THEIRS can tell two wardrobes apart',
  !!DOUBLED, DOUBLED ? `${DOUBLED[0]}: ${DOUBLED[1].join(' + ')}` : 'every slot holds one item');
const [DSLOT, DIDS] = DOUBLED;
const THEIR_WEAR = { [DSLOT]: DIDS[0] };
const MY_WEAR = { [DSLOT]: DIDS[1] };

try {
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await seed(page, { level: 18, coins: 400000 });

  /* ---- SHAPE / MINIMAL / CAP: grade the payload the app really builds ---- */
  const built = await page.evaluate(async n => {
    const loot = await import('/js/loot.js');
    for (let i = 0; i < n; i++) await loot.grantPet(i % 2 ? 'C2' : 'C1');
    return window.__socialSnapshot ? await window.__socialSnapshot() : null;
  }, 30);
  setup('SAMPLE the real socialSnapshot could be built', !!built && !!built.yard,
    built ? `yard=${JSON.stringify(built.yard).slice(0, 90)}` : 'no snapshot seam');

  const yardKeys = Object.keys(built.yard).sort();
  const petKeys = [...new Set(built.yard.pets.flatMap(x => Object.keys(x)))].sort();
  ok('SHAPE the yard carries a count, a capped pet list and one wardrobe, and nothing else',
    yardKeys.join(',') === 'n,pets,wear' && petKeys.join(',') === 'shiny,sp',
    `yard keys [${yardKeys.join(',')}], per-pet keys [${petKeys.join(',')}]`);

  /* PROVENANCE, 2026-08-23: the fields that must NEVER reach another player. Source
     is the privacy decision taken with this feature, recorded in the PR: the pet
     roster and wear ride the PLAINTEXT `players.profile` blob, crew-only, and
     carry a count, a capped species list and one wardrobe and nothing else.
     Everything named here was in the local pet record and was deliberately left
     behind. Adding a field to the payload means deciding, on purpose, to publish
     it to every accepted friend, so this list should GROW, never shrink, unless
     that decision is explicitly revisited. */
  const LEAKY = ['iid', 'name', 'nick', 'bond', 'lineage', 'level', 'levelSteps', 'flavor'];
  const leaked = LEAKY.filter(k => petKeys.includes(k));
  ok('MINIMAL no instance ids, nicknames, bonds, lineage or per-pet levels ride the wire',
    leaked.length === 0, leaked.length ? `LEAKED: ${leaked.join(', ')}` : `checked ${LEAKY.join(', ')}`);

  const bytes = JSON.stringify({ snapshot: built, appV: 'v425' }).length;
  ok('CAP a 30-pet roster is capped on the wire and the profile stays inside the server 24KB bound',
    built.yard.pets.length <= 24 && built.yard.n >= 30 && bytes < 24 * 1024,
    `${built.yard.n} owned, ${built.yard.pets.length} on the wire, whole profile ${bytes} bytes of 24576`);

  /* ---- RENDER / THEIRS: the viewer wears one set, the friend another ---- */
  await page.evaluate(async ({ pet, ids, mine }) => {
    const loot = await import('/js/loot.js');
    await loot.buyPetItem(pet);
    for (const id of ids) await loot.buyPetItem(id);
    // the VIEWER's own wardrobe, deliberately different from the friend's
    for (const id of Object.values(mine)) await loot.togglePetWear(id);
  }, { pet: PET, ids: ITEMS.map(i => i.id), mine: MY_WEAR });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);

  const openFriend = (yard, name) => page.evaluate(async ({ y, n, pet }) => {
    document.querySelectorAll('.sheet').forEach(() => history.back());
    await new Promise(r => setTimeout(r, 300));
    window.__openFriendProfile({
      playerId: 'yard-fixture', name: n, alias: null, friendCode: 'BONE-1111-2222',
      lastSeen: Date.now(),
      profile: {
        level: 27, levelName: 'Bonehead', badges: 5, gearCount: 9,
        outfit: { B: 'B0-1', SK: 'SK0-1', BG: 'BG1' },
        pet: { id: pet, level: 6, shiny: false, lineage: 0 },
        ...(y ? { yard: y } : {}),
      },
    });
    await new Promise(r => setTimeout(r, 900));
  }, { y: yard, n: name, pet: PET });

  /* REACH: a PLAYER can get here, not just __openFriendProfile.
     Every row in this file opened the sheet through the test seam, so the suite
     proved the paddock RENDERS and never once proved anybody could OPEN it. That
     is the seam-without-consumer shape: a feature can be complete, guarded and
     green while being unreachable, and the guard cannot tell.
     Tom, 2026-08-24: "I don't see the crew tab paddock viewer here that never
     actually got launched no? ... when u looked I couldn't find it."
     He was right to ask. The tap does work with real state (proved below), but
     nothing in this suite was checking it, so nobody could have answered him
     without going and looking. This row answers it mechanically from now on.
     PROVE-RED: delete the openFriendProfile call in the .cfan-card handler. */
  /* The herd the tap-through walks into. Deliberately more walkers than the
     scene's WALK_CAP and an `n` far past the 24 the wire carries, so FIELD
     measures the capped path and TALLY has three different numbers to get
     wrong. C6 is in it because C6 is the one species that can be dressed, which
     is what DRESSED reads. */
  const REACH_YARD = {
    n: 37,
    pets: [{ sp: PET, shiny: false }, { sp: 'C1', shiny: true }, { sp: 'C2', shiny: false },
      { sp: 'C3', shiny: false }, ...Array.from({ length: 11 }, () => ({ sp: 'C4', shiny: false }))],
    wear: THEIR_WEAR,
  };
  const reachByTap = async () => {
    await page.evaluate(async yard => {
      document.querySelectorAll('.sheet').forEach(() => history.back());
      await new Promise(r => setTimeout(r, 300));
      /* The rest of this file never populates the crew deck, because it opens the
         sheet through the seam. A player has to have the deck in front of them, so
         put a friend in it first. */
      window.__testMe = { name: 'Reach', handle: 'reach', friendCode: 'BONE-0000' };
      window.__testFriends = { friends: [{
        playerId: 'reach-fixture', name: 'Pal One', alias: null, lastSeen: Date.now(),
        profile: { level: 20, levelName: 'Bonehead', badges: 2, gearCount: 4,
                   outfit: { B: 'B0-1', SK: 'SK0-1', BG: 'BG1' }, pet: null, yard },
      }], incoming: [], outgoing: [] };
      location.hash = '#/today';
      await new Promise(r => setTimeout(r, 400));
      location.hash = '#/friends';
      await new Promise(r => setTimeout(r, 2600));
      const card = document.querySelector('.cfan-card');
      if (!card) { window.__reach = { card: false }; return; }
      card.click();                                    // the deck centres it
      await new Promise(r => setTimeout(r, 900));
      card.click();                                    // the centred card opens
      await new Promise(r => setTimeout(r, 1300));
      window.__reach = { card: true, sheet: !!document.querySelector('.sheet-fp .fp-facts') };
    }, REACH_YARD);
    return page.evaluate(() => window.__reach);
  };

  /* THE THIRD TAP: the door on the profile into their FIELD. Same real control,
     no seam, continuing the chain reachByTap started. */
  const walkIntoField = async () => {
    const clicked = await page.evaluate(() => {
      const b = document.querySelector('#fpYardGo');
      if (!b) return false;
      b.click();
      return true;
    });
    await sleep(2200);
    return { clicked, ...await page.evaluate(async () => {
      const pdk = await import('/js/paddock.js');
      const scene = document.querySelector('.sheet-paddock .pdk-scene');
      const pets = [...document.querySelectorAll('.sheet-paddock .pdk-pet')];
      const imgs = [...document.querySelectorAll('.sheet-paddock .pdk-pet img')];
      const box = el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
      const file = i => (i.getAttribute('src').match(/([A-Z]+\d+)\.png$/) || [])[1] || null;
      /* THE CAP ARITHMETIC COMES FROM THE APP'S OWN MODULE and the fixture on the
         page, not from a number typed into this file: WALK_CAP and motionFor are
         the scene's rules, and a copy of them here would agree with a broken
         scene by construction. */
      const wire = window.__testFriends.friends[0].profile.yard;
      const walkers = wire.pets.filter(x => pdk.motionFor(x.sp) === 'walk').length;
      return {
        scene: !!scene,
        owned: wire.n,
        onWire: wire.pets.length,
        expect: wire.pets.length - Math.max(0, walkers - pdk.WALK_CAP),
        figures: pets.length,
        drawn: pets.filter(p => { const b = box(p); return b.w > 0 && b.h > 0; }).length,
        decoded: imgs.filter(i => i.naturalWidth > 0).length,
        imgs: imgs.length,
        keeper: [...document.querySelectorAll('.sheet-paddock .pdk-keeper img')].filter(i => i.naturalWidth > 0).length,
        /* the dressable species, out in the field, and what it is wearing:
           layer 0 is the animal, everything after it is the wardrobe */
        wornOn: [...document.querySelectorAll('.sheet-paddock .pdk-pet img.pw')].map(file).filter(Boolean),
        dressedBoxes: [...document.querySelectorAll('.sheet-paddock .pdk-pet .petcrop.dressed')].length,
        count: (document.querySelector('.sheet-paddock .fpdk-note b') || {}).textContent || null,
        note: (document.querySelector('.sheet-paddock .fpdk-note .note') || {}).textContent || null,
        /* borrowed chrome that must NOT come along: their bonds and levels never
           left their phone, so nothing here invites a tap */
        coach: !!document.querySelector('.sheet-paddock .pdk-coach'),
        panel: !!document.querySelector('.sheet-paddock #pdkPanel'),
      };
    }) };
  };

  const readYard = () => page.evaluate(() => {
    const box = document.querySelector('.fp-yard');
    const hero = document.querySelector('.fp-pet .petcrop');
    const layers = el => el ? [...el.querySelectorAll('img')].map(i => {
      const r = i.getBoundingClientRect();
      return { f: (i.getAttribute('src').match(/([A-Z]+\d+)\.png$/) || [])[1] || null, nw: i.naturalWidth, w: Math.round(r.width), h: Math.round(r.height) };
    }) : null;
    return {
      /* THE SHEET ITSELF RENDERED. Without this, "no paddock strip" is
         indistinguishable from "the profile sheet threw and there is nothing on
         screen at all", and OLDBUILD passes on a page that is completely broken.
         Measured: a mutation that emitted the strip unconditionally threw on a
         null yard, took the whole sheet down, and OLDBUILD went GREEN. */
      sheet: !!document.querySelector('.sheet-fp .fp-facts'),
      present: !!box,
      count: box ? (box.querySelector('.fp-yard-h b') || {}).textContent.trim() : null,
      pets: box ? [...box.querySelectorAll('.fp-yard-pet')].map(p => layers(p.querySelector('.petcrop') || p)) : [],
      hero: layers(hero),
      /* The way through to their FIELD. Present exactly when there is a yard to
         walk into: a door onto nothing is worse than no door. */
      door: !!document.querySelector('#fpYardGo'),
      bodyScrolls: document.body.scrollWidth > document.body.clientWidth,
    };
  });

  const THEIR_YARD = {
    n: 12,
    pets: [{ sp: PET, shiny: false }, { sp: 'C1', shiny: true }, { sp: 'C2', shiny: false }, { sp: 'C4', shiny: false }],
    wear: THEIR_WEAR,
  };
  await openFriend(THEIR_YARD, 'BONE JOVI');
  const shown = await readYard();
  await shot(page, '00-friend-paddock');
  const drawn = st => st && st.length > 0 && st.every(l => l.nw > 0 && l.w > 0 && l.h > 0);
  ok('RENDER a friend\'s profile draws their paddock, decoded and visible, with the true count',
    shown.sheet && shown.present && shown.pets.length === THEIR_YARD.pets.length
      && shown.pets.every(drawn) && /12/.test(shown.count || '') && !shown.bodyScrolls,
    `strip=${shown.present}, ${shown.pets.length} pets, count "${shown.count}", all decoded=${shown.pets.every(drawn)}, body scrolls sideways=${shown.bodyScrolls}`);

  /* THEIRS. Their Bumbleseal must wear DIDS[0]; the viewer is wearing DIDS[1]
     right now, so a render that consulted S.petWear names the wrong file here. */
  const theirPet = shown.pets[0] || [];
  const theirIds = theirPet.map(l => l.f).filter(Boolean).slice(1);
  const heroIds = (shown.hero || []).map(l => l.f).filter(Boolean).slice(1);
  ok('THEIRS their pet wears THEIR wardrobe, not the viewer\'s, on the shelf and on the hero',
    theirIds.includes(DIDS[0]) && !theirIds.includes(DIDS[1])
      && heroIds.includes(DIDS[0]) && !heroIds.includes(DIDS[1]),
    `shelf [${theirIds.join(',') || 'bare'}], hero [${heroIds.join(',') || 'bare'}] | theirs=${DIDS[0]} viewer's=${DIDS[1]}`);

  /* OLDBUILD: no yard at all. */
  await openFriend(null, 'MARROW MAX');
  const none = await readYard();
  const oldHeroIds = (none.hero || []).map(l => l.f).filter(Boolean).slice(1);
  await shot(page, '01-friend-no-yard');
  ok('OLDBUILD a friend whose client never sent a yard shows no paddock strip and an undressed pet, never the viewer\'s clothes',
    none.sheet && !none.present && oldHeroIds.length === 0,
    `sheet rendered=${none.sheet}, strip=${none.present}, hero layers [${oldHeroIds.join(',') || 'none'}]`);

  /* DOOR: the way into their field exists exactly where there is a field. A door
     onto an empty scene is worse than no door: it promises a place and opens on
     nothing, which is the same lie OLDBUILD refuses on the shelf. */
  ok('DOOR the way into their field is on the profile when they have one, and absent when they do not',
    shown.door === true && none.door === false,
    `with a yard=${shown.door}, without one=${none.door}`);

  /* The row itself. Placed last so it runs against a tree the rest has already
     seeded, which is the state a real player is in. */
  const reach = await reachByTap();
  ok('REACH a PLAYER can open a friend, not just the test seam: two taps on the crew card open the profile',
    !!reach && reach.card === true && reach.sheet === true,
    reach ? `card found ${reach.card}, sheet opened ${reach.sheet}` : 'the deck never rendered a card');

  /* ---- the field itself, walked into from that same profile ---------------- */
  const fld = await walkIntoField();
  await shot(page, '02-friend-field');
  ok('FIELD the door on the profile opens their PADDOCK: their herd out in the field, drawn and decoded, their Bonehead standing in it',
    fld.clicked && fld.scene && fld.figures > 0 && fld.figures === fld.expect
      && fld.drawn === fld.figures && fld.imgs > 0 && fld.decoded === fld.imgs && fld.keeper > 0,
    `door clicked=${fld.clicked}, scene=${fld.scene}, ${fld.figures} figures of ${fld.expect} expected `
    + `(${fld.onWire} on the wire, walk cap applied), boxes drawn ${fld.drawn}, sprites decoded ${fld.decoded}/${fld.imgs}, keeper layers ${fld.keeper}`);

  /* DRESSED is THEIRS again, one surface further in. The shelf could be right and
     the field wrong: the scene is a different render path (petSpriteHtml at 76px,
     seated on the ground) and it is the path that used to answer S.petWear for
     everybody, because the player's own scene is the only one it ever drew. */
  ok('DRESSED their pet is wearing THEIR wardrobe out in their field, not the viewer\'s',
    fld.dressedBoxes > 0 && fld.wornOn.includes(DIDS[0]) && !fld.wornOn.includes(DIDS[1]),
    `${fld.dressedBoxes} dressed pet(s) in the field wearing [${fld.wornOn.join(',') || 'nothing'}] | theirs=${DIDS[0]} viewer's=${DIDS[1]}`);

  /* TALLY: three numbers are in play and only one is the brag. 37 owned, 15 on
     the wire, 11 standing in the field after the walk cap. The count must be the
     37: the wire cap is our bookkeeping, not their collection. */
  ok('TALLY the count under their field is what they OWN, not the capped wire list and not the herd on screen',
    new RegExp(`\\b${fld.owned}\\b`).test(fld.count || '')
      && !new RegExp(`\\b${fld.onWire}\\b`).test(fld.count || '')
      && (fld.note || '').includes(String(fld.figures)),
    `panel reads "${(fld.count || '').trim()}" / "${(fld.note || '').trim()}" | owned ${fld.owned}, on the wire ${fld.onWire}, in the field ${fld.figures}`);

  /* NOTHING THAT LIES. The friend's bonds, levels and nicknames never left their
     phone, so the scene must not carry over the chrome that promises them: the
     coach mark invites a tap onto a card slider that has no data to fill, and the
     collection panel is that slider's mount point. */
  ok('HONEST their field borrows the scene but not the promises: no tap-a-pet coach mark and no collection panel',
    fld.scene && !fld.coach && !fld.panel, `scene=${fld.scene}, coach=${fld.coach}, collection panel=${fld.panel}`);
} finally {
  await browser.close();
  if (srv) srv.close();
}

process.exit(fails);

/* PROVE-RED, RUN rather than predicted, 2026-08-23.
 *
 * Seven mutations, each written DIRECTLY INTO a copy of this tree with `.git`
 * removed so the copy is not a git worktree (a plain cp -R of a worktree keeps
 * a .git FILE pointing back at the original, and a checkout inside it writes to
 * the ORIGINAL, so the mutation never lands and the run proves nothing). Every
 * copy was grepped for the mutation AND for both seams (__socialSnapshot,
 * __openFriendProfile) before the run: a revert that also removes a seam makes
 * the file fail for the wrong reason while its real rows pass green.
 *
 * Every line below is the complete FAIL list for that run.
 *
 *   R1  js/app.js: `wear: yardWear` changed back to `wear: undefined` on both
 *       the hero and the shelf, i.e. ask the VIEWER's own wardrobe. The figure
 *       contract's rule 1, the shiny bug in a new coat, and the single mistake
 *       this feature could most easily have shipped.
 *       exit 1:
 *         THEIRS    "shelf [CB2], hero [CB2] | theirs=CB1 viewer's=CB2" -- the
 *                   friend's Bumbleseal wearing the auditor's bag, both surfaces
 *         OLDBUILD  "hero layers [CB2]" -- and a friend who owns NOTHING drawn
 *                   in the viewer's clothes, which is the same bug's worst face
 *       RENDER stays green: the strip draws perfectly, it is just wearing the
 *       wrong clothes, and that is exactly the distinction worth having.
 *   R2  js/app.js socialSnapshot: `wear` moved onto the `pet` object.
 *       exit 1, ONE row: WEARHOME "pet is leaderboard-public=true; its payload
 *       line CARRIES wear". Static, so it fails before a browser starts.
 *   R3  server/src/index.js: json_extract(profile,'$.yard') added to the
 *       /leaderboard SELECT, publishing the roster to every player in the game.
 *       exit 1, ONE row: PUBLIC "leaderboard publishes [level, levelName,
 *       badges, outfit, pet, yard, stats, gear] ...; yard is AMONG THEM".
 *   R4  js/app.js: the 24-pet cap removed from the yard.
 *       exit 1, ONE row: CAP "31 owned, 31 on the wire".
 *   R5  js/app.js: the per-pet map widened to spread the whole instance row.
 *       exit 1, two rows:
 *         SHAPE    "per-pet keys [hatchedAtSteps,iid,lineage,shiny,sp]"
 *         MINIMAL  "LEAKED: iid, lineage"
 *       Note hatchedAtSteps, which nobody would have thought to name in a
 *       hand-written expectation. That is why SHAPE derives the key set from
 *       the real payload instead of comparing against a list in this file.
 *   R6  js/app.js: an EMPTY shelf emitted for a friend with no yard, instead of
 *       no shelf, rendered safely so the sheet still comes up.
 *       exit 1: OLDBUILD "sheet rendered=true, strip=true" -- a paddock reading
 *       "0 PETS" at a friend who simply has not updated. RENDER and THEIRS go
 *       with it, because this crude mutation replaces the real shelf outright.
 *   R6b THE ONE THAT EXPOSED A FAULT IN THIS FILE.
 *   (see the second block below for the FIELD rows, 2026-08-24) Before it, OLDBUILD asserted
 *       only that no strip was present, so `p.yard.pets` made to throw (the
 *       whole profile sheet dies, nothing renders at all) came back GREEN: "no
 *       strip" and "no page" were the same measurement. OLDBUILD and RENDER now
 *       both require `.sheet-fp .fp-facts` to exist first. Re-run against the
 *       fixed file the mutation exits 1 with an uncaught TypeError, "Cannot read
 *       properties of undefined (reading 'pets')", the stack naming
 *       openFriendProfile: a crash rather than a graded row, but non-zero and
 *       pointing at the line, which is what a harness owes you.
 */

/* PROVE-RED for the FIELD rows, RUN rather than predicted, 2026-08-24.
 *
 * Same method as the block above and for the same reason: each mutation written
 * DIRECTLY INTO a tar-built copy of this tree with no `.git` at all (a cp -R of a
 * git WORKTREE keeps a .git FILE pointing back at the original, so a checkout
 * inside it writes to the ORIGINAL and the run proves nothing), then grepped to
 * confirm the mutation landed AND that both seams survived it.
 *
 *   R7  js/app.js: the `#fpYardGo` listener deleted, i.e. a door that opens on
 *       nothing. This is the seam-without-consumer shape one layer further in:
 *       every earlier row still passes, because the profile and its shelf are
 *       perfect and simply lead nowhere.
 *       exit 1, four rows:
 *         FIELD    "door clicked=true, scene=false, 0 figures of 11 expected"
 *         DRESSED  "0 dressed pet(s) in the field wearing [nothing]"
 *         TALLY    'panel reads "" / ""'
 *         HONEST   "scene=false"
 *       DOOR stays GREEN, correctly: the button IS on the profile. That is the
 *       distinction between "no way in" and "a way in that goes nowhere".
 *   R8  js/app.js: `wear: r.wear || null` dropped from the herd's petSpriteHtml
 *       call, which is what the scene did before this change: no wear argument
 *       means S.petWear answers, and S.petWear is the VIEWER's wardrobe. The
 *       figure contract's rule 1, at the one surface that had never drawn
 *       anybody else's animals.
 *       exit 1, ONE row: DRESSED "1 dressed pet(s) in the field wearing [CB2] |
 *       theirs=CB1 viewer's=CB2" -- the friend's Bumbleseal grazing her own
 *       field in the auditor's bag. THEIRS stays GREEN throughout: the shelf on
 *       the profile is a different render path and it was already correct, which
 *       is exactly why the field needed its own row.
 *   R9  js/app.js: the panel count changed from `yard.n` to `yard.pets.length`,
 *       i.e. report the WIRE CAP as the collection.
 *       exit 1, two rows (the string appears on the shelf header too, so the
 *       crude replace hits both surfaces):
 *         TALLY   'panel reads "15 PETS" ... owned 37, on the wire 15'
 *         RENDER  'count "4 PETS"'
 *   R10 js/app.js: the door lifted out of the yard ternary so EVERY profile gets
 *       one, including a friend on an older build with no field behind it.
 *       exit 1, ONE row: DOOR "with a yard=true, without one=true". OLDBUILD
 *       stays green, because the shelf is still correctly absent: the lie is the
 *       button, not the shelf.
 *   R11 js/app.js: `coach: 'Tap a pet to say hi'` passed through to the friend's
 *       scene, inviting a tap onto a card slider that has no data behind it
 *       (their bonds, levels and nicknames never left their phone).
 *       exit 1, ONE row: HONEST "scene=true, coach=true".
 */

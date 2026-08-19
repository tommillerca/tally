/* THE COOK QUEUE AND THE STARTER-POUCH BACKFILL, driven through the real app.
 *
 * WHAT IT IS FOR. Two changes that a source-level check would grade green while
 * the player saw nothing:
 *
 *  ITEM 1, the backfill. The starter seed pouch lives inside the 'loot-init'
 *  guard, which every install made before it shipped already has set, so the
 *  pouch reaches new players and nobody else. The migration has its own ledger
 *  key. The interesting failure is not "does it pay" but "does it pay TWICE",
 *  so the guard is exercised by running it twice in one session and pinning the
 *  seed count, per the rewarded-actions SOP.
 *
 *  ITEM 2, the queue. tests/garden-sim.mjs measured that ingredient spend is
 *  capped by cook STARTS per visit, not by what a recipe costs. So the assertion
 *  that matters is that a SECOND cook really starts in one visit with one pot,
 *  fired from the real Cook button, and that the queued one really takes the pot
 *  when the first is done. Calling queueCook() directly would prove the model and
 *  nothing about whether the Kitchen ever calls it.
 *
 * Usage:  node tests/kitchen-queue-audit.mjs [url]
 * With no url it serves this tree itself and prints the url it chose. It never
 * falls through to boot()'s default, which is production.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2] || process.env.URL;
const server = arg ? null : await serveTree(ROOT);
console.log(`grading ${arg || server.url}`);
const { browser, page, errors } = await boot(arg || server.url);

let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

const closeSheets = async () => {
  for (let i = 0; i < 6; i++) {
    if (!await page.evaluate(() => !!document.querySelector('#sheets > div'))) break;
    await page.evaluate(() => history.back());
    await sleep(450);
  }
};
const openKitchen = async () => {
  await closeSheets();
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1500);
  await page.evaluate(() => { document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil')?.remove(); });
  await sleep(400);
  const kb = await page.$('#kitchenActBtn');
  if (!kb) throw new Error('the Kitchen button is missing on Today');
  await kb.click();
  await sleep(1600);
};
const openCook = async () => {
  await openKitchen();
  /* THE KITCHEN NO LONGER HAS DOORS. It landed on COOK and GROW until
     2026-08-18, when the Bone Garden left the player's path and the landing
     became the cook view itself. Tapping the door when it exists keeps this
     runnable against an older tree; its absence is not a failure here, it is
     garden-closed-audit.mjs's assertion. */
  const door = await page.$('#doorCook');
  if (door) { await door.click(); await sleep(1300); }
};

/* ================= ITEM 1: the starter-pouch backfill ================= */

// an EXISTING install: the welcome kit has already been paid, the garden is
// untouched, and the backfill has never run. That is Tom's beta tester.
const asExistingInstall = () => page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('loot-init', true);
  await db.kvSet('garden', null);
  await db.kvSet('seedpouch-backfill', null);
  /* AND AN EMPTY LARDER. The pouch pays ingredients since 2026-08-18 and the
     welcome kit already put three of them there at boot, so without this the
     "starts empty" row reads 3 and every delta below is measured off a floor
     that is not zero. */
  await db.kvSet('ingredients', {});
});
/* THE POUCH PAYS INGREDIENTS, NOT SEEDS, since 2026-08-18: the Bone Garden left
   the player's path, so a seed cannot be planted and the pouch hands over the
   ingredients the seeds would have grown into. Same ledger key, same
   write-before-pay order, same one-shot; only the currency moved, so this reads
   the Kitchen's larder where it used to read the garden's pouch. */
const seedTotal = () => page.evaluate(async () => {
  const inv = await (await import('./js/cooking.js')).ingredients();
  return Object.values(inv).reduce((a, n) => a + (n || 0), 0);
});

await asExistingInstall();
const before = await seedTotal();
const run1 = await page.evaluate(async () => (await import('./js/game.js')).backfillStarterSeedsIfNeeded());
const after1 = await seedTotal();
const run2 = await page.evaluate(async () => (await import('./js/game.js')).backfillStarterSeedsIfNeeded());
const after2 = await seedTotal();
const pouch = await page.evaluate(async () => (await (await import('./js/cooking.js')).ingredients()));
console.log('backfill:', JSON.stringify({ before, run1, after1, run2, after2, pouch }));
check('ITEM 1 an existing install starts with an empty pouch', before === 0, String(before));
check('ITEM 1 the first run pays the pouch', after1 === 3 && !!run1, `${before} -> ${after1}`);
check('ITEM 1 the pouch is exactly one Bone Broth', pouch.marrow === 2 && pouch.salt === 1, JSON.stringify(pouch));
check('ITEM 1 the second run pays nothing', after2 === after1 && run2 === null, `${after1} -> ${after2}, returned ${JSON.stringify(run2)}`);

/* AND THE SAME AGAIN WITH THE PLAYER'S POUCH EMPTY, which is the run that
   actually isolates the ledger. The check above passes for the wrong reason if
   the key is deleted: three seeds are sitting there, so the "already gardening"
   rule refuses the second grant all by itself and a missing guard reads green.
   Deleting the guard was PROVEN not to turn that check red. This is the shape of
   the farm: cook the pouch, spend it, reopen the app. Only the ledger key stands
   between that player and a fresh three ingredients every single boot.
   Both stores are cleared: the garden (which the who-gets-it rule reads) and the
   larder (which the payout lands in), so an empty read here really means empty. */
await page.evaluate(async () => { const db = await import('./js/db.js'); await db.kvSet('garden', null); await db.kvSet('ingredients', {}); });
const run3 = await page.evaluate(async () => (await import('./js/game.js')).backfillStarterSeedsIfNeeded());
const after3 = await seedTotal();
console.log('spent the pouch, ran again:', JSON.stringify({ run3, after3 }));
check('ITEM 1 a player who SPENT the pouch is not paid a second one', after3 === 0 && run3 === null, `${after3} ingredients, returned ${JSON.stringify(run3)}`);

// it must not reach for 'loot-init', which guards two crates and a Draught
const kitFlag = await page.evaluate(async () => (await import('./js/db.js')).kvGet('loot-init'));
check('ITEM 1 the welcome-kit guard is left alone', kitFlag === true, String(kitFlag));

// a player already gardening is not paid, and is still marked so we never look again
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('garden', null); await db.kvSet('seedpouch-backfill', null); await db.kvSet('ingredients', {});
  /* THE WHO-GETS-IT RULE STILL READS THE GARDEN, deliberately: it asks "did this
     player ever find their own way in", and a seed in the pouch is still the
     honest answer to that even now that the payout is ingredients. */
  await (await import('./js/garden.js')).grantSeed('bog', 1);
});
const gRun = await page.evaluate(async () => (await import('./js/game.js')).backfillStarterSeedsIfNeeded());
const gAfter = await seedTotal();
const gFlag = await page.evaluate(async () => (await import('./js/db.js')).kvGet('seedpouch-backfill'));
console.log('already gardening:', JSON.stringify({ gRun, gAfter, gFlag }));
check('ITEM 1 a player who already has seeds is not paid', gAfter === 0 && gRun === null, `${gAfter} ingredients in the larder, returned ${JSON.stringify(gRun)}`);
check('ITEM 1 and is still marked, so the check can never become a farm', gFlag === true, String(gFlag));

/* THE END OF THE CHAIN: not "the function pays" but "an existing install that
   reopens the app finds seeds in its pouch". Everything above would pass on a
   migration nothing calls. */
await closeSheets();
await asExistingInstall();
await page.reload({ waitUntil: 'networkidle2' });
await sleep(5200);
const booted = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const inv = await (await import('./js/cooking.js')).ingredients();
  return { seeds: Object.values(inv).reduce((a, n) => a + (n || 0), 0), flag: await db.kvGet('seedpouch-backfill') };
});
console.log('after a real boot:', JSON.stringify(booted));
check('ITEM 1 REACH: reopening the app actually delivers the pouch', booted.seeds === 3 && booted.flag === true, JSON.stringify(booted));

/* ================= ITEM 2: the cook queue ================= */

// one pot, empty line, and a full larder so nothing here is about affording it
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const c = await import('./js/cooking.js');
  await db.kvSet('potsOwned', 1);
  await db.kvSet('cooking', []);
  await db.kvSet('cookq', []);
  await db.kvSet('pantry', []);
  const inv = {};
  for (const id of c.INGREDIENT_IDS) inv[id] = 20;
  await db.kvSet('ingredients', inv);
});

await openCook();
const firstCookable = await page.evaluate(() => {
  const b = [...document.querySelectorAll('#kitchenBody [data-cook]')].filter(x => !x.disabled);
  return { n: b.length, ids: b.slice(0, 2).map(x => x.dataset.cook), label: b[0]?.textContent.trim() };
});
console.log('cook view:', JSON.stringify(firstCookable));
check('ITEM 2 the recipes are offered (an empty sample is not a pass)', firstCookable.n >= 2, `${firstCookable.n} enabled`);
if (firstCookable.n < 2) { console.log('nothing to cook; stopping'); await browser.close(); server?.close(); process.exit(1); }

const [idA, idB] = firstCookable.ids;
// FIRST cook: the real button. This is what shipped already does.
await page.evaluate(id => document.querySelector(`#kitchenBody [data-cook="${id}"]`).click(), idA);
await sleep(1500);
const afterOne = await page.evaluate(async () => {
  const c = await import('./js/cooking.js');
  const st = await c.cookState();
  return { busy: st.freeCount === 0, queue: st.queue.length, buttonsLive: [...document.querySelectorAll('#kitchenBody [data-cook]')].filter(x => !x.disabled).length,
           verb: [...document.querySelectorAll('#kitchenBody [data-cook]')].find(x => !x.disabled)?.textContent.trim() };
});
console.log('after the first cook:', JSON.stringify(afterOne));
check('ITEM 2 the only pot is now busy', afterOne.busy);
/* THE GUARD. On the shipped build every button here goes ghost/disabled the
   moment the pot is full, and the visit is over. A FAILING result is buttonsLive
   === 0, or a second click that does not land. */
check('ITEM 2 a full pot no longer ends the visit', afterOne.buttonsLive >= 1, `${afterOne.buttonsLive} still live`);
check('ITEM 2 and it says so plainly', /line up/i.test(afterOne.verb || ''), afterOne.verb);

// SECOND cook, one pot, same visit, the real button
const invBefore = await page.evaluate(async () => (await (await import('./js/cooking.js')).ingredients()));
await page.evaluate(id => document.querySelector(`#kitchenBody [data-cook="${id}"]`).click(), idB);
await sleep(1500);
const afterTwo = await page.evaluate(async id => {
  const c = await import('./js/cooking.js');
  const st = await c.cookState();
  return { queue: st.queue.map(r => r.id), left: st.queueLeft, inv: await c.ingredients(),
           needs: c.RECIPE_BY_ID[id].needs, cards: document.querySelectorAll('#kitchenBody .pot-card.queued').length };
}, idB);
console.log('after the second cook:', JSON.stringify({ queue: afterTwo.queue, left: afterTwo.left, cards: afterTwo.cards }));
check('ITEM 2 THE SECOND COOK STARTED with one pot in one visit', afterTwo.queue.length === 1 && afterTwo.queue[0] === idB, JSON.stringify(afterTwo.queue));
const paid = Object.entries(afterTwo.needs).every(([id, n]) => afterTwo.inv[id] === invBefore[id] - n);
// the whole reason the queue exists: it is a SPEND, taken at the moment you line up
check('ITEM 2 the ingredients were really spent', paid, JSON.stringify(afterTwo.needs));
check('ITEM 2 the line is drawn on screen', afterTwo.cards === 1, `${afterTwo.cards} queued cards`);

// the depth is flat: fill it, then a further one is refused. No purchase, no gate.
const depth = await page.evaluate(async () => {
  const c = await import('./js/cooking.js');
  const filled = await c.queueCook(c.RECIPES[0].id);
  const refused = await c.queueCook(c.RECIPES[0].id);
  return { filled, refused, len: (await c.cookState()).queue.length, max: c.QUEUE_MAX };
});
console.log('depth:', JSON.stringify(depth));
check('ITEM 2 the line is capped and the cap is flat', depth.filled.ok && depth.len === depth.max && depth.refused.ok === false && depth.refused.reason === 'full', JSON.stringify(depth));

/* THE HANDOVER. Fast-forward the pot past its readyAt (the only honest way to
   test a cook timer), reopen the Kitchen through the real controls, and assert
   the queued dish took the pot and the finished one landed in the Pantry. */
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const arr = await db.kvGet('cooking');
  await db.kvSet('cooking', arr.map(c => c ? { ...c, readyAt: Date.now() - 5000 } : c));
});
await openCook();
const handed = await page.evaluate(async () => {
  const c = await import('./js/cooking.js');
  const st = await c.cookState();
  const slot = st.slots.find(s => !s.empty);
  return {
    queue: st.queue.length,
    inPot: slot ? slot.recipe.id : null,
    cookMin: slot ? slot.recipe.cookMin : null,
    span: slot ? slot.readyAt - slot.startedAt : null,
    pantry: (await c.pantryDishes()).length,
  };
});
const cookXp = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const rows = await db.db.all('xp');
  return rows.filter(r => r.type === 'cook').length;
});
console.log('handover:', JSON.stringify(handed), 'cook xp rows:', cookXp);
check('ITEM 2 THE QUEUED COOK TOOK THE POT ON ITS OWN', handed.inPot === idB, `pot holds ${handed.inPot}`);
check('ITEM 2 the finished dish went to the Pantry', handed.pantry >= 1, `${handed.pantry} stocked`);
check('ITEM 2 the line moved up', handed.queue === 1, `${handed.queue} still queued`);
// throughput, NOT potency: a queued dish cooks for exactly as long as a fresh one
check('ITEM 2 the queue did not change how long a dish takes', handed.span === handed.cookMin * 60e3, `${handed.span}ms vs ${handed.cookMin}m`);
// a dish the app collected for you still pays what a manual Serve pays
check('ITEM 2 the auto-collected dish still paid its cook XP', cookXp >= 1, `${cookXp} rows`);

/* THE COMPOST SECTION WAS HERE, and it came out on 2026-08-18 with the Bone
   Garden. It drove #compostBtn2 in the Kitchen and graded the heap's ordering;
   compost turns an ingredient into SEEDS, which cannot be planted any more, so
   the button was removed and the sheet has no route into it. openCompostSheet
   and its ordering logic are UNTOUCHED in js/app.js for the revival, and
   tests/garden-closed-audit.mjs asserts the button is gone. Restore this block
   from git history alongside the button. */

check('NO page errors during the run', errors.length === 0, errors.join(' | '));

await browser.close();
server?.close();
console.log(bad ? `\n${bad} FAILED` : '\nKITCHEN QUEUE + STARTER POUCH VERIFIED');
process.exit(bad ? 1 : 0);

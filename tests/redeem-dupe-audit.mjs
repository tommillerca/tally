/* REDEEM A CODE, ALREADY-OWNED SPECIES: the decision-neutral pin.
 *
 * NOT REGISTERED IN tests/release-gate.mjs, and RED on purpose at v385. It
 * exists to hold whichever behaviour Tom picks, and it is written so that BOTH
 * candidate behaviours satisfy it. Register it in the gate once the behaviour
 * lands and it goes green.
 *
 * WHAT IS BROKEN TODAY (measured, see the FINDING lines this prints):
 *   grantPet (js/loot.js:592) returns the species unconditionally for an
 *   explicit pet id, so redeemCode's dupe branch (js/loot.js:641,
 *   `if (!pet) { dupe = true; coins += 120 }`) can never fire. Redeeming a
 *   pet-only code for a species you ALREADY OWN mints an extra INSTANCE, pays 0
 *   coins, and shows the byte-identical toast it would show for a brand-new
 *   pet: "<Name> unlocked! Equip it in your Wardrobe." (js/app.js:9097). The
 *   already-owned consolation copy at js/app.js:9098 is dead with it.
 *
 * THE TWO BEHAVIOURS THIS FILE ACCEPTS, and nothing else:
 *   A. Dupes stack (the rest of the game's answer). One extra INSTANCE, 0
 *      consolation coins, and copy that says a copy joined the crew.
 *   B. The dupe consolation is restored. NO new instance, +120 coins, and copy
 *      that says you already own it and were paid instead.
 * Either is fine. What is NOT fine, and is what these checks pin, is the
 * already-owned case being INDISTINGUISHABLE from the first-time case, and the
 * toast disagreeing with what the save actually did.
 *
 * SOP notes this file obeys:
 *   - Every measurement drives the REAL #redeemBtn, not redeemCode() directly.
 *     The direct call is taken too, but only as corroborating evidence for the
 *     `dupe` flag, which the UI cannot show.
 *   - The PRECONDITION IS PROVEN, not assumed. tests/redeem-audit.mjs seeded
 *     kv 'petInsts' with a `C` field; the real key is 'petInst' and the field
 *     is `sp` (js/loot.js:492, :499), so that seed wrote to a key nothing
 *     reads and its finding held only because the demo profile happens to own
 *     C1 already. Here the species is owned through the app's own
 *     addPetInstance and the count is asserted on both sides of the redeem.
 *   - An empty sample set is a FAILURE. No pet-only code, or a precondition
 *     that did not take, exits non-zero rather than passing vacuously.
 *   - Direction and bound, not a trend: the owned run must move the instance
 *     count by EXACTLY 0 or EXACTLY 1, never "at least one".
 *
 * UN-REDEEMING TAKES TWO WRITES NOW, 2026-08-17. This file resets between runs
 * by clearing the kv 'redeemed' LIST, because that list used to be the whole
 * record of what a device had redeemed. It is not any more: redeemCode claims a
 * per-code kv row `redeemed:<code>` with db.addIfAbsent, because the list is a
 * read-modify-write and four concurrent redemptions of one code all read an
 * empty list and all paid (measured 2026-08-17: BONEHEADZ redeemed 4/4 times
 * from one tap window). The list is still read first, and still written, so
 * devices that redeemed before the change stay redeemed and a restore still
 * carries it. So a reset that clears only the list leaves the code redeemed,
 * every run after the first is refused as 'used', and PIN-2 and PIN-4 go red
 * for the reset's reason rather than the app's. unredeem() below clears BOTH
 * halves. It does not soften either pin: PIN-4 still requires the code to be
 * recorded after a redeem that actually went through, which is the only way it
 * can be recorded at all.
 */
import { boot, sleep, serveTree } from './godmode.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(ROOT);
const base = argv || srvHandle.url;
const killSrv = () => srvHandle && srvHandle.close();

const { browser, page } = await boot(base);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const die = async code => { await browser.close(); killSrv(); process.exit(code); };

await page.evaluate(() => { location.hash = '#/today'; });
await sleep(600);
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForSelector('#redeemBtn', { timeout: 10000 });

/* Record every message SHOWN from here on, REPEATS INCLUDED. Two earlier
   observers here both reported the already-owned toast as the empty string,
   which is a measurement artifact and would have graded the two copies as
   "different" for exactly the wrong reason:
     1. Skipping a message equal to the previous one drops a repeat, and a
        repeat is the whole subject of this file.
     2. Arming on hide and recording on show does not work either, because a
        MutationObserver callback fires ONCE PER BATCH, not per mutation, and
        nextToast() (js/app.js:2264) hides the old message and shows the next
        one inside a single synchronous task. The callback sees only the final
        state, hidden=false, and never observes the hide at all.
   So read the RECORDS, not the element state. A `hidden` attribute record with
   oldValue '' means the attribute was present and has just been removed: that
   is a SHOW. textContent is assigned immediately before it in the same task,
   so the element already carries the message being shown. */
await page.evaluate(() => {
  window.__toastLog = [];
  const el = document.getElementById('toast');
  if (!el) return;
  if (!el.hidden) {
    const t0 = (el.textContent || '').trim();
    if (t0) window.__toastLog.push(t0);
  }
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type !== 'attributes' || r.attributeName !== 'hidden') continue;
      if (r.oldValue === null) continue;            // just became hidden
      const t = (el.textContent || '').trim();
      if (t) window.__toastLog.push(t);
    }
  }).observe(el, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
});
/* Let the boot-time ambient toasts drain BEFORE the first click, so the
   messages attributed to a redeem are actually the redeem's. */
await sleep(12000);

/* ---- pick a pet-only code with an EXPLICIT species. 'random' is excluded:
   its species is not knowable in advance, so neither precondition could be
   established. ---- */
const codeTable = await page.evaluate(async () => {
  const { REDEEM_CODES } = await import('./js/loot.js');
  return Object.entries(REDEEM_CODES).map(([k, v]) => ({ code: k, def: v }));
});
const picked = codeTable.find(c => c.def.pet && c.def.pet !== 'random' && !c.def.coins);
check('SETUP  a pet-only code with an explicit species exists',
  !!picked, picked ? `${picked.code} -> ${picked.def.pet}` : `${codeTable.length} codes, none qualify`);
if (!picked) await die(2);
const SP = picked.def.pet;

/* UN-REDEEM, BOTH HALVES. See the header note. Installed as a page global so
   the three resets below cannot drift apart, and it ASSERTS that the per-code
   row is really gone afterwards, because a reset that silently stopped working
   would put PIN-2 and PIN-4 red for a reason that has nothing to do with the
   app. */
await page.evaluate(() => {
  window.UNREDEEM = async (kvSet, db, code) => {
    await kvSet('redeemed', []);            // the legacy list, still read first by redeemCode
    await db.del('kv', `redeemed:${code}`); // the per-code claim row, which IS the authority now
    const left = await db.get('kv', `redeemed:${code}`);
    const list = await db.get('kv', 'redeemed');
    if (left !== undefined || (list && list.v && list.v.length)) {
      throw new Error(`UNREDEEM did not clear ${code}: row=${JSON.stringify(left)} list=${JSON.stringify(list && list.v)}`);
    }
  };
});

/* ---- drive the real button and report what the player got ---- */
const snapshot = () => page.evaluate(async sp => {
  const { kvGet } = await import('./js/db.js');
  const { coins, petInstances } = await import('./js/loot.js');
  const list = await petInstances();
  return {
    coins: await coins(),
    instances: list.length,
    species: list.filter(x => x.sp === sp).length,
    redeemed: (await kvGet('redeemed', [])) || [],
    toasts: (window.__toastLog || []).slice(),
  };
}, SP);

async function redeemRun(label) {
  const before = await snapshot();
  await page.evaluate(c => { document.querySelector('#redeemInput').value = c; }, picked.code);
  await page.evaluate(() => document.querySelector('#redeemBtn').click());
  /* STATE FIRST: the handler awaits redeemCode + coinsAdd + kvSet and none of
     that is observable through the toast. Then wait on the CONDITION (a new
     message appeared), never on a duration, because toast lengths vary. */
  await sleep(2600);
  for (const t0 = Date.now(); Date.now() - t0 < 25000;) {
    const grew = await page.evaluate(n => (window.__toastLog || []).length > n, before.toasts.length);
    if (grew) break;
    await sleep(250);
  }
  const after = await snapshot();
  /* SLICE BY INDEX, never filter by value. The two runs can legitimately show
     the identical string (that is the bug), and a value filter would drop the
     second one and report an empty toast. */
  const fresh = after.toasts.slice(before.toasts.length);
  const out = {
    label,
    coinsDelta: after.coins - before.coins,
    instDelta: after.instances - before.instances,
    speciesBefore: before.species,
    speciesAfter: after.species,
    toast: fresh[fresh.length - 1] || '',
    allNew: fresh,
    recorded: after.redeemed.includes(picked.code),
  };
  console.log(`info  ${label}  coinsDelta=${out.coinsDelta} instances ${before.instances}->${after.instances} ${SP} ${before.species}->${after.species} toast=${JSON.stringify(out.toast)}`);
  console.log(`info  ${label}  every message shown during this attempt: ${JSON.stringify(fresh)}`);
  return out;
}

/* ---- RUN 1: species NOT owned. This is the reference copy. ---- */
await page.evaluate(async ({ sp, code }) => {
  const { db, kvSet } = await import('./js/db.js');
  const { BH_BY_ID } = await import('./data/boneheadz.js');
  await UNREDEEM(kvSet, db, code);
  await kvSet('petInst', []);
  await kvSet('pets', {});
  await kvSet('petEquipped', null);
  await kvSet('petLvlSteps', {});
  await kvSet('petLvlV', 2);
  for (const r of await db.all('inv')) {
    if (r.kind === 'cos' && (BH_BY_ID[r.itemId] || {}).slot === 'C') await db.del('inv', r.id);
  }
  void sp;
}, { sp: SP, code: picked.code });
const pre1 = await snapshot();
check(`SETUP  precondition for the FIRST-TIME run: ${SP} is owned 0 times`,
  pre1.species === 0, `${SP} count=${pre1.species}, instances=${pre1.instances}`);
if (pre1.species !== 0) await die(2);
const fresh = await redeemRun('FIRST-TIME');

/* ---- RUN 2: the SAME species, now genuinely owned, through the app's own
   writer so the save shape is the real one. ---- */
await page.evaluate(async ({ sp, code }) => {
  const { db, kvSet } = await import('./js/db.js');
  const { addPetInstance } = await import('./js/loot.js');
  await UNREDEEM(kvSet, db, code);
  await addPetInstance(sp, {});
}, { sp: SP, code: picked.code });
const pre2 = await snapshot();
check(`SETUP  precondition for the ALREADY-OWNED run: ${SP} is owned at least once`,
  pre2.species > 0, `${SP} count=${pre2.species}, instances=${pre2.instances}`);
if (!(pre2.species > 0)) await die(2);
const owned = await redeemRun('ALREADY-OWNED');

/* Corroborating evidence the UI cannot show: the `dupe` flag redeemCode
   returns, taken in the same already-owned state. */
const direct = await page.evaluate(async code => {
  const { db, kvSet } = await import('./js/db.js');
  const { redeemCode } = await import('./js/loot.js');
  await UNREDEEM(kvSet, db, code);
  const r = await redeemCode(code);
  return { ok: !!r.ok, pet: r.pet ? r.pet.id : null, coins: r.coins, dupe: !!r.dupe };
}, picked.code);
console.log(`info  direct redeemCode('${picked.code}') with ${SP} owned: ${JSON.stringify(direct)}`);

/* ================= THE PINS ================= */

/* PIN-1  The already-owned case must not be INDISTINGUISHABLE from the
   first-time case. Behaviour A rewrites the copy ("another one joined your
   crew"); behaviour B rewrites it the other way ("+120 coins instead"). Both
   pass. Identical strings fail, which is exactly v385. */
check('PIN-1  DISTINCT-COPY  the already-owned toast differs from the first-time toast',
  !!owned.toast && !!fresh.toast && owned.toast !== fresh.toast,
  `first-time=${JSON.stringify(fresh.toast)} already-owned=${JSON.stringify(owned.toast)}`);

/* PIN-2  HONEST-PAYOUT. Exactly one of the two shapes, with the copy agreeing.
   Bound, not trend: instDelta is 1 or 0, never "some". */
const shapeA = owned.instDelta === 1 && owned.coinsDelta === 0
  && /another|one more|copy|joins your crew|second/i.test(owned.toast);
const shapeB = owned.instDelta === 0 && owned.coinsDelta >= 120
  && /already|instead/i.test(owned.toast) && /coin/i.test(owned.toast);
check('PIN-2  HONEST-PAYOUT  the save and the toast tell the same story (stacked copy, or consolation coins)',
  shapeA || shapeB,
  `instDelta=${owned.instDelta} coinsDelta=${owned.coinsDelta} toast=${JSON.stringify(owned.toast)} (shapeA=${shapeA} shapeB=${shapeB})`);

/* PIN-3  NO-DEAD-COPY. The already-owned consolation string in js/app.js and
   the `dupe` flag must agree about whether that path exists. Symmetric on
   purpose: it cannot pass by BOTH being absent-and-false only, it compares
   them, so deleting the copy under behaviour A passes only if dupe is also
   false, and keeping the copy under behaviour B passes only if dupe fires. */
const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const copyPresent = appSrc.includes('pet already owned, coins instead');
check('PIN-3  NO-DEAD-COPY  the "(pet already owned, coins instead)" copy exists if and only if redeemCode can return dupe:true',
  copyPresent === direct.dupe,
  `copyPresent=${copyPresent} redeemCode().dupe=${direct.dupe}`);

/* PIN-4  The one-shot guard is untouched by whichever answer is picked. */
check('PIN-4  ONE-SHOT  the code is still recorded in kv \'redeemed\' after the already-owned attempt',
  owned.recorded, `redeemed included ${picked.code}: ${owned.recorded}`);

if (!shapeA && !shapeB) {
  console.log(`FINDING-DUPE-UNREACHABLE  ${picked.code} redeemed with ${SP} already owned (${pre2.species} copies) minted a NEW instance (delta ${owned.instDelta}) and paid ${owned.coinsDelta} coins, showing ${JSON.stringify(owned.toast)}, which is the SAME string the first-time redeem showed. redeemCode's dupe branch (js/loot.js:641) is unreachable because grantPet (js/loot.js:607) returns the species unconditionally, so js/app.js:9098's consolation copy is dead too.`);
}

await browser.close();
killSrv();
console.log(bad ? `\n${bad} FAILED` : '\nREDEEM DUPE PINNED');
process.exit(bad ? 1 : 0);

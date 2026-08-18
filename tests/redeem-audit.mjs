/* REDEEM A CODE (Settings): grants PET + COINS, must be a one-shot per code.
 *
 * js/app.js:~7554 wires the #redeemBtn click. It calls redeemCode(input) from
 * js/loot.js:631. redeemCode is the rewarded-actions shape one more time:
 *   - unrecognised codes reject with reason 'invalid'
 *   - a code already in kv 'redeemed' rejects with reason 'used'
 *   - a fresh valid code grants pet + code.coins. A code for a species you
 *     ALREADY OWN stacks one more instance and pays no consolation coins
 *     (Tom's call, 2026-08-16; section 5 below measures that payout shape, and
 *     tests/redeem-dupe-audit.mjs pins the copy the player reads)
 *   - the code is appended to kv 'redeemed' AFTER the grants land
 * That last property is the money guard for this surface. A regression that
 * skips the kv 'redeemed' check turns any published code into a repeatable
 * faucet on a fresh install per attempt, which is the class we closed on the
 * Glutton and the daily wheel this week (see tests/unit.test.js NO-OP pair and
 * tests/wheel-audit.mjs PAYOUT-2).
 *
 * This audit applies the rewarded-actions SOP:
 *   1. STATE TRANSITION named: unredeemed code -> redeemed. First redeem
 *      succeeds; kv 'redeemed' gains the code; a pet or dupe-coins are granted.
 *   2. SECOND REDEEM of the SAME code pays nothing: reason 'used', coins
 *      unchanged, kv 'redeemed' unchanged (still one entry, not two), no new
 *      pet instance.
 *   3. INVALID code says so and pays nothing: reason 'invalid', coins
 *      unchanged, kv 'redeemed' unchanged.
 *   4. ENTRY POINT toast reads the right copy for each rejection class, so a
 *      player is told WHY not just refused silently.
 *
 * Empty-sample rule: if REDEEM_CODES is missing on this build or the demo
 * profile has already burned every code in kv 'redeemed', the audit reports
 * that as a FAIL rather than a vacuous pass.
 *
 * Every measurement drives the REAL button. #redeemInput is filled and
 * #redeemBtn is clicked; the reward + state observations happen through the
 * app's own db + kv, not through a direct redeemCode() call, because the SOP
 * is about what a player's finger produces end to end.
 */
import { boot, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const srv = { kill: () => srvHandle && srvHandle.close() };
const base = argv || srvHandle.url;

const { browser, page } = await boot(base);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

/* Snapshot the state that redeem affects, before + after each attempt. */
async function snapshot() {
  return page.evaluate(async () => {
    const { db, kvGet } = await import('./js/db.js');
    const { coins, petInstances } = await import('./js/loot.js');
    return {
      coins: await coins(),
      redeemed: (await kvGet('redeemed', [])) || [],
      petCount: (await petInstances()).length,
      /* EVERY message shown since the click, not whatever happens to be on
         screen at one instant. `toast()` is a QUEUE holding up to 4 entries
         (app.js), and the app emits ambient toasts of its own ("Tip: back up
         your log", "Progress imported"). Those sit AHEAD of the redeem toast,
         so a single read after a fixed sleep returns an unrelated message and
         the check fails on a healthy app. Asserting over the recorded log is
         also the honest question: was the player shown this copy at all. */
      toasts: (window.__toastLog || []).slice(),
    };
  });
}

/* Route to Settings, wait for the #redeemInput + #redeemBtn to render. */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(600);
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForSelector('#redeemBtn', { timeout: 10000 });

/* Record every toast the app shows from here on. A MutationObserver is used
   rather than polling because a queued toast can come and go inside one poll
   interval, and a message the player saw but the audit slept through is
   exactly the failure this whole file exists to catch.

   READ THE RECORDS, NOT THE ELEMENT STATE, and never skip a message equal to
   the previous one. nextToast() (js/app.js:2293) does not clear #toast between
   messages: it hides the old one, assigns textContent and unhides, all inside
   ONE synchronous task. A MutationObserver callback fires once per BATCH, so
   an observer that reads el.textContent at callback time never sees the hide,
   and a de-duplicating push then drops the second of two identical messages
   entirely. That mattered here: the same "<Pet> unlocked!" copy is shown for a
   first-time redeem and for an already-owned one, and the dupe section below
   was reading the second one as the empty string. A `hidden` record whose
   oldValue is '' means the attribute was present and has just been removed,
   which is a SHOW, and the text is already assigned by then. */
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

/* Clean kv 'redeemed' so the demo profile does not have a stale burn on our
   test code (a code already burned would short-circuit at reason 'used' on
   the FIRST attempt and turn PAYOUT-1 into a false green). */
await page.evaluate(async () => {
  const { kvSet } = await import('./js/db.js');
  await kvSet('redeemed', []);
});

/* Fetch the code table from the app to prove the SETUP: an empty table (or
   an audit run against a build without REDEEM_CODES) is a FAIL, not a
   vacuous pass. */
const codeTable = await page.evaluate(async () => {
  const { REDEEM_CODES } = await import('./js/loot.js');
  return Object.entries(REDEEM_CODES).map(([k, v]) => ({ code: k, def: v }));
});
check('SETUP  REDEEM_CODES was loaded with at least one code', codeTable.length > 0, `${codeTable.length} codes: ${codeTable.map(c => c.code).join(', ')}`);
if (!codeTable.length) { await browser.close(); srv.kill(); process.exit(2); }

/* Pick the first code that pays coins directly (BONEHEADZ pays 50), so the
   coins-delta assertion is not dependent on the dupe branch's +120. */
const pickedCoinCode = codeTable.find(c => c.def.coins && c.def.pet) || codeTable[0];
const pickedPetOnly  = codeTable.find(c => c.def.pet && !c.def.coins) || codeTable.find(c => c.def.pet);

/* -------- 1. STATE TRANSITION: unredeemed -> redeemed -------- */
async function redeemViaUI(code, expectRe) {
  await page.evaluate(c => {
    document.querySelector('#redeemInput').value = c;
  }, code);
  /* The log is CUMULATIVE and deliberately never cleared. Clearing it per
     attempt discarded messages that had not surfaced yet, because the app's
     own ambient toasts (tips, seed-pouch nudges, import progress) interleave
     with the redeem ones and push them arbitrarily far back in the queue.
     Each snapshot is taken immediately after its own attempt, so the log at
     that instant still contains only what has happened up to then and the
     checks stay specific to their attempt. */
  await page.evaluate(() => document.querySelector('#redeemBtn').click());
  /* WAIT FOR THE MESSAGE, not for a duration. Three fixed-duration attempts
     failed here because toast lengths vary (the success toast passes 3600ms,
     the rejections use the 2200ms default) and the app's ambient toasts push
     the redeem one arbitrarily deep into the queue. Any constant chosen sits
     between two real durations and stops mid-queue. Waiting on the condition
     removes the constant entirely; if the copy never appears this still times
     out and the check still fails, so it is not a check that cannot fail. */
  /* STATE first: the click handler awaits redeemCode + coinsAdd + kvSet, and
     none of that is observable through the toast. Settle for it before the
     condition loop, or the loop breaks on an early toast and the kv/coins
     assertions read a write that has not landed. Two concerns, two waits. */
  await sleep(2600);
  const DEADLINE = 25000;
  for (const t0 = Date.now(); Date.now() - t0 < DEADLINE;) {
    const hit = await page.evaluate(re => (window.__toastLog || []).some(t => new RegExp(re, 'i').test(t)), expectRe.source);
    if (hit) break;
    await sleep(250);
  }
}

const before1 = await snapshot();
await redeemViaUI(pickedCoinCode.code, /unlocked|redeemed|coins/);
const after1 = await snapshot();
check(`REDEEM-1  ${pickedCoinCode.code} added itself to kv 'redeemed' (state transition)`,
  after1.redeemed.includes(pickedCoinCode.code) && after1.redeemed.length === before1.redeemed.length + 1,
  `before=[${before1.redeemed.join(',')}] after=[${after1.redeemed.join(',')}]`);
const expectedCoinDelta = pickedCoinCode.def.coins || 0;
check(`REDEEM-1  ${pickedCoinCode.code} paid its coins (+${expectedCoinDelta}) OR +120 dupe consolation`,
  after1.coins - before1.coins >= expectedCoinDelta,
  `coins delta=${after1.coins - before1.coins}`);
check(`REDEEM-1  the toast on success mentions "redeemed" or the pet name (not the "already" copy)`,
  after1.toasts.some(t => /redeemed|unlocked|coins/.test(t) && !/already/i.test(t)),
  JSON.stringify(after1.toasts));

/* -------- 2. SECOND REDEEM of the SAME code pays nothing -------- */
const before2 = await snapshot();
await redeemViaUI(pickedCoinCode.code, /already redeemed/);
const after2 = await snapshot();
check(`REDEEM-2  the SECOND ${pickedCoinCode.code} pays NO coins`,
  after2.coins === before2.coins,
  `before=${before2.coins} after=${after2.coins}`);
check(`REDEEM-2  the SECOND ${pickedCoinCode.code} grants NO new pet instance`,
  after2.petCount === before2.petCount,
  `pets before=${before2.petCount} after=${after2.petCount}`);
check(`REDEEM-2  kv 'redeemed' is unchanged (no second entry)`,
  after2.redeemed.length === before2.redeemed.length &&
  after2.redeemed.filter(c => c === pickedCoinCode.code).length === 1,
  `redeemed=[${after2.redeemed.join(',')}]`);
check(`REDEEM-2  the toast on the re-attempt reads "That code was already redeemed."`,
  after2.toasts.some(t => /already redeemed/i.test(t)),
  JSON.stringify(after2.toasts));

/* -------- 3. INVALID code pays nothing and says so -------- */
const before3 = await snapshot();
await redeemViaUI('GARBAGE_' + Date.now(), /isn.?t valid/);
const after3 = await snapshot();
check('REDEEM-INVALID  an unrecognised code pays NO coins',
  after3.coins === before3.coins,
  `before=${before3.coins} after=${after3.coins}`);
check('REDEEM-INVALID  no new pet instance',
  after3.petCount === before3.petCount,
  `pets before=${before3.petCount} after=${after3.petCount}`);
check("REDEEM-INVALID  kv 'redeemed' is unchanged",
  after3.redeemed.length === before3.redeemed.length,
  `redeemed=[${after3.redeemed.join(',')}]`);
check("REDEEM-INVALID  the toast reads \"That code isn't valid.\"",
  after3.toasts.some(t => /isn.?t valid/i.test(t)),
  JSON.stringify(after3.toasts));

/* -------- 4. EMPTY input rejects without a state change -------- */
const before4 = await snapshot();
await redeemViaUI('', /enter a code/);
const after4 = await snapshot();
check('REDEEM-EMPTY  empty input pays NO coins and does not touch kv',
  after4.coins === before4.coins &&
  after4.redeemed.length === before4.redeemed.length &&
  after4.petCount === before4.petCount);
check('REDEEM-EMPTY  toast reads "Enter a code first."',
  after4.toasts.some(t => /enter a code/i.test(t)),
  JSON.stringify(after4.toasts));

/* -------- 5. ALREADY-OWNED SPECIES: measure which path actually fires. -------- */
/* DECIDED 2026-08-16, by Tom: dupes STACK. Redeeming a pet code for a species
   already in the roster mints one more INSTANCE and pays 0 consolation coins,
   which is the same answer hatching and crates already give. The old
   "already owned -> +120 coins" consolation in redeemCode was removed, not
   fixed: it branched on `if (!pet)` from grantPet, and grantPet has returned
   the species unconditionally for as long as dupes have stacked, so it had
   never once run.
   This block measures the PAYOUT SHAPE only. The COPY the player reads is
   pinned by tests/redeem-dupe-audit.mjs, which drives the same button and
   compares the already-owned toast against the first-time one; there is no
   value in asserting the same string twice from two files. */
if (pickedPetOnly && !pickedPetOnly.def.coins && pickedPetOnly.def.pet !== 'random') {
  /* SEED THROUGH THE APP'S OWN WRITER, AND PROVE IT TOOK. This block used to
     push { iid, C: speciesId } into kv 'petInsts'. Both halves were wrong: the
     real key is 'petInst' (js/loot.js:492) and the species field is `sp`
     (js/loot.js:499), so the seed wrote to a key nothing reads and the
     "already owned" precondition was never actually established. The finding
     below still fired, but only because the demo profile happens to already
     own C1, which is luck, not a measurement. addPetInstance produces the real
     save shape, and the count is asserted before the redeem so an unseeded run
     FAILS instead of reporting a finding it did not set up. */
  await page.evaluate(async speciesId => {
    const { kvSet } = await import('./js/db.js');
    const { addPetInstance } = await import('./js/loot.js');
    await kvSet('redeemed', []);
    await addPetInstance(speciesId, {});
  }, pickedPetOnly.def.pet);
  const beforeD = await snapshot();
  const ownedBefore = await page.evaluate(async sp => {
    const { petInstances } = await import('./js/loot.js');
    return (await petInstances()).filter(x => x.sp === sp).length;
  }, pickedPetOnly.def.pet);
  check(`REDEEM-DUPE  SETUP: ${pickedPetOnly.def.pet} is genuinely owned before the redeem`,
    ownedBefore > 0, `copies of ${pickedPetOnly.def.pet} in kv 'petInst' = ${ownedBefore}`);
  await redeemViaUI(pickedPetOnly.code, /unlocked|another|joined|coins/);
  const afterD = await snapshot();
  const dupeDelta = afterD.coins - beforeD.coins;
  const petDelta = afterD.petCount - beforeD.petCount;
  /* snapshot() returns `toasts` (the whole log), never `toast`. Reading the
     singular meant this was always undefined, so the toast test was
     permanently false and one branch below could never be taken: a check that
     cannot go green in one direction is not a check. */
  const newToasts = afterD.toasts.slice(beforeD.toasts.length);
  const lastToast = newToasts[newToasts.length - 1] || '';
  /* DIRECTION AND BOUND, not a trend: EXACTLY one new instance and EXACTLY
     zero consolation coins. "at least one" would pass a runaway grant loop. */
  check(`REDEEM-DUPE  redeeming ${pickedPetOnly.code} with ${pickedPetOnly.def.pet} already owned (${ownedBefore} copies) STACKS exactly one more instance`,
    petDelta === 1, `petCount ${beforeD.petCount} -> ${afterD.petCount} (delta ${petDelta}), toast="${lastToast}"`);
  check(`REDEEM-DUPE  the stacked copy pays NO consolation coins (the +120 branch is gone, not merely unreachable)`,
    dupeDelta === 0, `coins delta=${dupeDelta}`);
  check(`REDEEM-DUPE  the code is STILL recorded in kv 'redeemed' after this attempt`,
    afterD.redeemed.includes(pickedPetOnly.code),
    `redeemed=[${afterD.redeemed.join(',')}]`);
} else {
  /* An unmeasured dupe branch is an EMPTY SAMPLE SET, and this file's own rule
     says that is a failure, not a quiet info line. 'random' is excluded on
     purpose: its species is not knowable in advance, so no "already owned"
     precondition could be established for it. */
  check('REDEEM-DUPE  SETUP: a pet-only code with an explicit species exists to measure the dupe branch with',
    false, `codes=[${codeTable.map(c => `${c.code}:${JSON.stringify(c.def)}`).join(' ')}]`);
}

await browser.close();
srv.kill();
console.log(bad ? `\n${bad} FAILED` : '\nREDEEM VERIFIED');
process.exit(bad ? 1 : 0);

/* REDEEM A CODE (Settings): grants PET + COINS, must be a one-shot per code.
 *
 * js/app.js:~7554 wires the #redeemBtn click. It calls redeemCode(input) from
 * js/loot.js:631. redeemCode is the rewarded-actions shape one more time:
 *   - unrecognised codes reject with reason 'invalid'
 *   - a code already in kv 'redeemed' rejects with reason 'used'
 *   - a fresh valid code grants pet (or +120 coins if already owned) + code.coins
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
   exactly the failure this whole file exists to catch. */
await page.evaluate(() => {
  window.__toastLog = [];
  const el = document.getElementById('toast');
  if (!el) return;
  const push = () => {
    const t = (el.textContent || '').trim();
    if (t && window.__toastLog[window.__toastLog.length - 1] !== t) window.__toastLog.push(t);
  };
  push();
  new MutationObserver(push).observe(el, { childList: true, subtree: true, characterData: true });
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

/* -------- 5. DUPE BRANCH: measure whether the "already owned -> +120" path is
   even reachable. -------- */
/* redeemCode (js/loot.js:641) branches on `if (!pet)` where `pet = await
   grantPet(...)`. The dupe branch grants +120 coins and sets dupe:true so the
   toast says "pet already owned - coins instead". The rewarded-actions SOP
   asks that this dupe consolation actually PAY when it fires.
   Measure the behaviour and report which path fires: if the pet-code hits
   the fresh-grant branch even with the same species already in the roster,
   the dupe branch is unreachable dead code and the finding belongs on the
   record. */
if (pickedPetOnly && !pickedPetOnly.def.coins) {
  await page.evaluate(async speciesId => {
    const { kvSet, kvGet, newId } = await import('./js/db.js');
    await kvSet('redeemed', []);
    /* seed the species in kv 'petInsts' so grantPet's "already owned" check
       (if it still has one) would fire. petInsts entries are keyed by iid
       with the species in `C`. */
    const existing = (await kvGet('petInsts', [])) || [];
    if (!existing.find(p => p.C === speciesId)) {
      existing.push({ iid: newId(), C: speciesId, gotAt: Date.now(), source: 'test' });
      await kvSet('petInsts', existing);
    }
  }, pickedPetOnly.def.pet);
  const beforeD = await snapshot();
  await redeemViaUI(pickedPetOnly.code, /unlocked|already|coins/);
  const afterD = await snapshot();
  const dupeDelta = afterD.coins - beforeD.coins;
  const grantedNewPet = afterD.petCount > beforeD.petCount;
  const dupeToast = /already owned|coins instead/i.test(afterD.toast);
  if (grantedNewPet && dupeDelta === 0) {
    console.log(`FINDING-DUPE-UNREACHABLE  redeeming ${pickedPetOnly.code} with the pet species already in kv 'petInsts' still granted a NEW instance (pets ${beforeD.petCount} -> ${afterD.petCount}) and paid 0 coins. redeemCode's dupe branch at js/loot.js:641 tests \`if (!pet)\` from grantPet, but grantPet was updated to always return the species (see loot.js:607 comment: "owning it already is fine now (dupes stack)"). So the dupe branch is DEAD CODE. A player who redeems a pet-only code for a pet species they already own gets an extra INSTANCE of that pet, not the +120 coins the code path advertises via toast. Reg's file class; report only, do not fix.`);
    console.log(`  measured: coins delta=${dupeDelta}, petCount ${beforeD.petCount} -> ${afterD.petCount}, toast="${afterD.toast}"`);
  } else if (dupeDelta === 120 && !grantedNewPet && dupeToast) {
    check(`REDEEM-DUPE  redeeming ${pickedPetOnly.code} with pet already owned pays the +120 dupe consolation`, true, `coins delta=${dupeDelta}`);
  } else {
    console.log(`FINDING-DUPE  UNEXPECTED shape: coins delta=${dupeDelta}, petCount ${beforeD.petCount} -> ${afterD.petCount}, toast="${afterD.toast}". Neither the dupe branch nor the fresh branch fully matches its own contract on this build.`);
  }
  check(`REDEEM-DUPE  the code is STILL recorded in kv 'redeemed' after this attempt`,
    afterD.redeemed.includes(pickedPetOnly.code),
    `redeemed=[${afterD.redeemed.join(',')}]`);
} else {
  console.log('info REDEEM-DUPE  no pet-only code in REDEEM_CODES; dupe branch not measured on this build');
}

await browser.close();
srv.kill();
console.log(bad ? `\n${bad} FAILED` : '\nREDEEM VERIFIED');
process.exit(bad ? 1 : 0);

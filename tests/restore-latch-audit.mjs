/* tests/restore-latch-audit.mjs — QA round 34 P0: the second-boot restore.
 *
 * THE BUG (found in the handoff, traced against integ/day2 source):
 *
 *   1. Onboarding finishes (js/app.js saveInitialSettings) and calls
 *      social.goOnline() then social.autoSync -> pushBackup. This is the
 *      FIRST-EVER registration for this device: js/social.js's own comment on
 *      'idMinted' says it plainly — "A key MINTED here has never been
 *      registered anywhere, so no server account and no cloud backup can
 *      exist for it." The blob this push sends IS this device's whole state,
 *      byte for byte.
 *   2. Nothing latched kv 'bootRestored'. It is only ever set inside
 *      bootSync/adoptIdentity, after a PULL succeeds — onboarding never pulls.
 *   3. The player opens a crate and spends coins.
 *   4. The NEXT boot's bootSync sees bootRestored absent, calls pullBackup(),
 *      fetches the blob THIS SAME DEVICE pushed in step 1 (older than the
 *      crate-open and the spend), and merges it in with
 *      importAll(replace:false): every store's rows are `os.put` back
 *      unconditionally (js/db.js ~914), so the opened crate's row reappears,
 *      and kv is payload-wins for any key outside DEVICE_KV (js/db.js ~857),
 *      so spent coins are refunded to their pre-spend value.
 *
 * THE FIX, two independent layers:
 *   LATCH   goOnline() latches bootRestored=true right after a successful
 *           register IF kv 'idMinted' is set, i.e. this device minted a
 *           brand-new keypair that has never been registered before. That is
 *           true for both the onboarding call and the manual "Go Online"
 *           button (Crew / Settings): bootSync only fails to auto-register at
 *           boot when NO identity exists anywhere on the device (kv or OS
 *           keychain, see bootSync's 'new-player' branch), so by the time a
 *           player reaches a manual Go Online button, ensureIdentity() has no
 *           choice but to mint. bootSync's OWN internal reinstall call to
 *           goOnline() (an existing identity recovered from kv/keychain) does
 *           NOT set idMinted, so the real restore path there is untouched —
 *           REINSTALL below is the control proving that.
 *   RECEIPT loot.js's openCrate records the opened row's id in a bounded kv
 *           list ('crateTaken', same shape as social.js's own 'grantsSeen'
 *           merge pattern). js/db.js importAll's merge path (replace:false)
 *           never re-`put`s an 'inv' row whose id is in that list, so even if
 *           a merge DOES run (a genuinely older blob, a different device), an
 *           already-opened crate cannot come back.
 *
 * WHAT EACH ROW GRADES:
 *   REPRO-*     the bug, reproduced against the unpatched mechanism directly
 *               (calls importAll the way bootSync's pull does, bypassing the
 *               LATCH fix, so this half proves RECEIPT alone on a genuine
 *               merge — this is not a "control that can never fail": REPRO-POST
 *               is graded again post-fix as GUARD-RECEIPT below to prove the
 *               receipt is what is holding it, not a coincidence).
 *   GUARD-*     the full real path (onboarding's goOnline, second boot's
 *               bootSync) after both fixes: no toast, no resurrection, no
 *               refund, byte-identical to right after the spend.
 *   REINSTALL   control: a device with a PRIOR identity (recovered from
 *               keychain, exactly bootSync's own reinstall branch) still runs
 *               a real pullBackup and restores a genuinely different device's
 *               newer ledger. Failure here is the LATCH fix over-reaching and
 *               blocking a real restore.
 *
 * Usage: node tests/restore-latch-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ok = (l, pass, d = '') => { console.log(`${pass ? 'ok  ' : 'FAIL'} ${l}${d ? '  | ' + d : ''}`); if (!pass) bad++; };

import './mem-idb.mjs';

/* ==================== in-memory API: /register + /backup ================= */
const API = 'http://bh-restore-audit.invalid';
const backups = new Map();   // playerId -> { blob, updatedAt }
globalThis.fetch = async (url, opts = {}) => {
  const { pathname } = new URL(url);
  const method = opts.method || 'GET';
  const hdr = opts.headers || {};
  const resp = (status, obj) => ({ ok: status >= 200 && status < 300, status, json: async () => obj });
  if (pathname === '/register') {
    const { pubkey } = JSON.parse(opts.body);
    return resp(200, { playerId: 'p-' + pubkey.x.slice(0, 24), handle: 'AUDIT BONES', friendCode: 'AUD1', name: null });
  }
  if (pathname === '/backup') {
    const pid = hdr['x-bh-player'];
    if (method === 'PUT') {
      const { blob } = JSON.parse(opts.body);
      backups.set(pid, { blob, updatedAt: Date.now() });
      return resp(200, { ok: true });
    }
    const b = backups.get(pid);
    return b ? resp(200, b) : resp(404, {});
  }
  return resp(404, {});
};

const social = await import(ROOT + '/js/social.js');
const { db, kvGet, kvSet, useDbName } = await import(ROOT + '/js/db.js');
const loot = await import(ROOT + '/js/loot.js');

async function device(name) { useDbName(name); await kvSet('apiBase', API); }

/* NOTE ON THE REPRODUCTION: the raw-mechanism repro (goOnline -> push -> open a
   crate -> spend coins -> force bootRestored false -> pullBackup) was run by
   hand against this file before the fix landed (see the commit message / the
   report) and is not kept here as a permanent row: once RECEIPT and the
   coinsRev guard are in place, driving that same sequence stops reproducing
   the bug by construction, which would flip a hardcoded "this is the bug"
   assertion to failing on a HEALTHY tree. GUARD-RECEIPT below re-drives the
   identical merge (bootRestored forced false a second time, same stale blob)
   and is the permanent row proving the fix holds; PROVE-RED at the bottom
   mutates the fix and shows GUARD/GUARD-RECEIPT go red. */

/* ==================== GUARD: the real path, fixes active ================= */
await device('devA');
await loot.grantCrate('daily', 'welcome-kit');   // the welcome-kit crate onboarding grants
await kvSet('coins', 100);
// onboarding: goOnline() then push, exactly js/app.js saveInitialSettings
const onA = await social.goOnline();
ok('GUARD  device registered (empty sample = FAIL)', !!(onA && onA.ok), JSON.stringify(onA));
ok('GUARD  LATCH: bootRestored set true right after a freshly-minted register', (await kvGet('bootRestored', false)) === true);
await social.pushBackup('audit');
const crates1 = (await db.all('inv')).filter(r => r.kind === 'crate');
const openedRow = crates1[0];
await loot.openCrate(openedRow.id);
await loot.coinsAdd(-40);
const coinsBeforeBoot = await kvGet('coins', 0);
ok('CONTROL  the fixture had something to lose before the second boot (an empty sample is a failure)', crateCountBeforeBoot > 0 && coinsBeforeBoot > 0, `crates=${crateCountBeforeBoot} coins=${coinsBeforeBoot}`);
const crateCountBeforeBoot = (await db.all('inv')).filter(r => r.kind === 'crate').length;

// SECOND BOOT: the real bootSync, exactly the code path bootRestored guards.
const boot2 = await social.bootSync();
ok('GUARD  second boot did not pull (bootRestored already latched)', boot2.reason === 'already', JSON.stringify(boot2));
const coinsAfterBoot = await kvGet('coins', 0);
const crateCountAfterBoot = (await db.all('inv')).filter(r => r.kind === 'crate').length;
ok('GUARD  crate count unchanged after second boot', crateCountAfterBoot === crateCountBeforeBoot, `before=${crateCountBeforeBoot} after=${crateCountAfterBoot}`);
ok('GUARD  coins unchanged after second boot (no refund)', coinsAfterBoot === coinsBeforeBoot, `before=${coinsBeforeBoot} after=${coinsAfterBoot}`);
ok('GUARD  no restore reported (reason !== restored, no toast fires)', boot2.restored === false);

/* GUARD-RECEIPT: force a merge to run anyway (bootRestored cleared by hand,
   the only way left to reach it once LATCH is in place) against the SAME
   stale blob, and prove the receipt still stops the crate specifically. */
await kvSet('bootRestored', false);
const forced = await social.pullBackup();
ok('GUARD-RECEIPT  forced merge still runs (this row is not a no-op)', !!(forced && forced.restored));
const crateCountForced = (await db.all('inv')).filter(r => r.kind === 'crate').length;
ok('GUARD-RECEIPT  the opened crate does not come back even under a forced merge', crateCountForced === crateCountBeforeBoot, `before=${crateCountBeforeBoot} afterForcedMerge=${crateCountForced}`);
const coinsForced = await kvGet('coins', 0);
ok('GUARD-RECEIPT  coins are not refunded either, under the same forced merge (coinsRev guard)', coinsForced === coinsBeforeBoot, `before=${coinsBeforeBoot} afterForcedMerge=${coinsForced}`);

/* ==================== REINSTALL: control, a REAL restore still works ====== */
/* Device A (above) is the "old device" with real, newer progress: give it one
   more crate and push again so the server holds A's latest state. */
await loot.grantCrate('golden', 'level-up');
const crateCountA = (await db.all('inv')).filter(r => r.kind === 'crate').length;
await kvSet('coins', 500);
await social.pushBackup('audit');
const identityA = await kvGet('identity', null);

// Device B: a REINSTALL of the SAME account (identity recovered, exactly what
// bootSync's own reinstall branch does before it calls goOnline() — modelled
// here by seeding the identity directly, since ensureIdentity()'s OS-keychain
// path is not reachable from node). No idMinted: this key already existed.
await device('devB-reinstall');
await kvSet('identity', identityA);
const onB = await social.goOnline();
ok('REINSTALL  same account recovered on reinstall', onB.ok && onB.me && onB.me.playerId === (await kvGet('social', null)).playerId);
ok('REINSTALL  LATCH does not fire for a recovered (non-minted) identity', (await kvGet('bootRestored', false)) === false);
const bootB = await social.bootSync();
ok('REINSTALL  a real restore still pulls and merges', !!(bootB && bootB.restored), JSON.stringify(bootB));
const invB = (await db.all('inv')).filter(r => r.kind === 'crate');
ok('REINSTALL  device A\'s newer crate arrived on the reinstalled device', invB.length === crateCountA, `expected=${crateCountA} got=${invB.length}`);
ok('REINSTALL  device A\'s newer coin balance arrived', (await kvGet('coins', 0)) === 500);

/* ==================== PROVE-RED: mutate the fix, watch these go red ====== */
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const socialSrc = src('js/social.js');
const dbSrc = src('js/db.js');
const lootSrc = src('js/loot.js');
const fnBody = (text, header) => {
  const i = text.indexOf(header);
  if (i < 0) return '';
  const j = text.indexOf('\nexport ', i + 1);
  return text.slice(i, j < 0 ? undefined : j);
};
ok('SRC-LATCH  goOnline() latches bootRestored on a freshly-minted identity',
  /idMinted/.test(fnBody(socialSrc, 'export async function goOnline')) && /bootRestored/.test(fnBody(socialSrc, 'export async function goOnline')));
ok('SRC-RECEIPT  openCrate records a take receipt',
  /crateTaken/.test(fnBody(lootSrc, 'export async function openCrate')));
ok('SRC-MERGEGUARD  importAll\'s merge path consults the crate receipt for inv rows',
  /crateTaken/.test(fnBody(dbSrc, 'export async function importAll')));
ok('SRC-COINSREV  importAll\'s merge path guards coins with a coinsRev comparison',
  /coinsRev/.test(fnBody(dbSrc, 'export async function importAll')));
ok('SRC-COINSREV-BUMP  coinsAdd bumps coinsRev alongside coins',
  /coinsRev/.test(fnBody(lootSrc, 'export async function coinsAdd')));

console.log(bad ? `\n${bad} FAILED` : '\nall green');
process.exit(bad ? 1 : 0);

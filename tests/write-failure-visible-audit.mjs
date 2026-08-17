/* A WRITE THAT DID NOT LAND MUST NOT BE SILENT.
 *
 * THE BUG (measured on 56c5058, v385). Exactly ONE write in this app survived a
 * full disk: the meal log, which wraps its own `db.put('log', e)` and tells the
 * player. Every other write was bare. Reported sites, all verified on that tree:
 *
 *   js/app.js   weight entry, health/steps row, three foods writes, 88 kvSet
 *               call sites (coins, energy, quests, pet levels, ...)
 *   js/game.js  EVERY XP award, plus the friend-battle and level-reward rows
 *   js/loot.js  crates, gear, pets, weapons, eggs (7 sites)
 *
 * On a quota abort the promise rejects, everything after the write is skipped,
 * and the rejection unwinds to window.unhandledrejection where js/analytics.js
 * files it as an anonymous `err` row. The player watches the fight-win
 * animation and never gets the crate. At 1000 players on real phones with full
 * storage that is a steady trickle of "my reward vanished" with no diagnosis.
 *
 * THE SHAPE UNDER TEST. Not 100+ try/catch blocks. js/db.js reports every
 * rejected write to ONE registered sink (and re-throws unchanged), and
 * js/app.js registers that sink at module level next to toast(). The sink is
 * the only new thing that speaks to the player. Because it sits at the DB
 * layer it also catches the failures a caller ALREADY swallows in a
 * `.catch(() => {})`, which no per-call-site catch can do.
 *
 * WHAT THIS CHECKS, and which DIRECTION is failure in each case:
 *   REWARD    a real meal logged through the real UI while the `xp` store
 *             fails: the player MUST be told, in words about storage.
 *             FAILING = zero storage messages (that is main today).
 *   COUNTED   the failure is counted as LOUD. FAILING = 0.
 *   ONE-VOICE the meal-log path, which has its own specific message, produces
 *             EXACTLY ONE storage message, not its own plus the generic one.
 *             BOUND, not a trend: 1, never 2.
 *   QUIET     a fire-and-forget bookkeeping key fails and the player is NOT
 *             interrupted. FAILING = a storage toast appears. This is the half
 *             that makes the fix survivable; without it a full disk would spray
 *             the screen with toasts about popup-seen flags.
 *   DEFAULT   a kv key nobody classified is LOUD. FAILING = quiet. Anti-
 *             regression rule 8: an unclassified write degrades to a toast
 *             nobody needed, never to a reward that vanishes in silence.
 *   SEAM      static: db.put/db.del/db.clear all route through the reporter,
 *             and app.js registers the sink at MODULE level, not inside boot()
 *             (boot writes before it finishes). FAILING = a write op that
 *             bypasses the seam, or a sink installed late.
 *
 * THE FAILURE IS INJECTED, below db.put, at IDBDatabase.prototype.transaction:
 * a matching readwrite transaction aborts and reports a QuotaExceededError,
 * which is the shape a real quota abort has (`t.onabort`, not a synchronous
 * throw). Injecting ABOVE db.put, the way tests/log-write-failure-audit.mjs
 * does, would replace the very code under test. tests/db-quota-finding.mjs is
 * right that JS injection cannot prove what the PLATFORM does; this proves what
 * OUR code does with a rejected write, which is ours, and injection is the
 * honest way to reach it.
 *
 * PROVE-RED (measured, see the deliverable): run against the tree before the
 * fix and REWARD, COUNTED, QUIET, DEFAULT and SEAM all go red; the meal still
 * submits (SETUP green) so the red is about the message, not the flow.
 *
 * Usage: node tests/write-failure-visible-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const checked = [];
const ok = (n, p, d = '') => { checked.push(n); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

/* ---------------- SEAM: static, no browser ---------------- */
const dbSrc = fs.readFileSync(path.join(ROOT, 'js/db.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const WRITE_OPS = ['put', 'del', 'clear'];
const unseamed = WRITE_OPS.filter(op => {
  const m = dbSrc.match(new RegExp(`^\\s*${op}:\\s*\\(([^)]*)\\)\\s*=>\\s*(.+)$`, 'm'));
  return !m || !/\bwrite\(/.test(m[2]);
});
ok('SEAM every db write op routes through the failure reporter', unseamed.length === 0 && WRITE_OPS.length === 3,
  unseamed.length ? `bypassing: ${unseamed.join(', ')}` : `${WRITE_OPS.length} ops`);
ok('SEAM js/db.js exports onWriteFailure', /export function onWriteFailure\(/.test(dbSrc));
/* Module level means column 0. Inside boot() it would be indented, and it would
   be deaf for the whole of boot, which writes (day rollover, backfills, sync). */
const sinkAtModuleLevel = /^onWriteFailure\(/m.test(appSrc);
ok('SEAM js/app.js registers the sink at MODULE level, not inside boot()', sinkAtModuleLevel,
  sinkAtModuleLevel ? '' : (/onWriteFailure\(/.test(appSrc) ? 'registered, but indented: it would be deaf for all of boot()' : 'not registered at all'));

/* ---------------- the rest needs the real app ---------------- */
const srv = await serveTree(ROOT);
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));

/* EVERY hook goes in at document-start so it survives seed()'s reload. An
   earlier draft installed them with page.evaluate and lost the injector to that
   reload, which would have left the "failing" writes quietly succeeding: a
   check that cannot fail. */
await page.evaluateOnNewDocument(() => {
  /* 1. Rejection recorder. A rejected write still REJECTS, by design: callers
        keep their control flow and the code after the failed write still does
        not run. What must change is that the rejection is no longer ANONYMOUS
        by the time it reaches window.unhandledrejection, which is where
        js/analytics.js files it as an `err` row with a truncated message and
        no idea which write it was. */
  window.__rejections = [];
  addEventListener('unhandledrejection', e => {
    const r = e.reason;
    window.__rejections.push({ name: (r && r.name) || String(r), tallyWrite: (r && r.tallyWrite) || null });
  });

  /* 2. Toast recorder. Record EVERY message, not whatever happens to be on
        screen at read time: a message that came and went is still a message the
        player got, and the ONE-VOICE bound cannot be measured from a snapshot. */
  window.__toasts = [];
  window.__toastObserverFailed = true;
  const arm = () => {
    const t = document.getElementById('toast');
    if (!t) return false;
    window.__toastObserverFailed = false;
    new MutationObserver(() => {
      const s = (t.textContent || '').trim();
      if (s && window.__toasts[window.__toasts.length - 1] !== s) window.__toasts.push(s);
    }).observe(t, { childList: true, characterData: true, subtree: true });
    return true;
  };
  if (!arm()) {
    const iv = setInterval(() => { if (arm()) clearInterval(iv); }, 50);
    setTimeout(() => clearInterval(iv), 15000);
  }

  /* 3. THE INJECTOR. Below db.put, above IndexedDB. A readwrite transaction
        that touches the targeted store aborts on the targeted write and
        surfaces a real QuotaExceededError through onabort, which is the shape
        a full disk has. Everything else forwards to the genuine transaction
        untouched, so the app keeps working around the one write being killed. */
  window.__failWrite = null;          // { store, key } | null   (key null = any row)
  window.__failHits = 0;
  const realTx = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (stores, mode, ...rest) {
    const real = realTx.call(this, stores, mode, ...rest);
    if (mode !== 'readwrite' || !window.__failWrite) return real;
    const want = window.__failWrite;
    const names = Array.isArray(stores) ? stores : [stores];
    if (!names.includes(want.store)) return real;
    let injected = null;
    const w = {
      get error() { return injected || real.error; },
      abort: () => { try { real.abort(); } catch { /* already gone */ } },
      objectStore(name) {
        const os = real.objectStore(name);
        return new Proxy(os, {
          get(target, prop) {
            if (prop === 'put' && name === want.store) {
              return (val) => {
                const key = val && typeof val === 'object' ? (name === 'kv' ? val.k : (val.id ?? val.key ?? val.date)) : val;
                if (want.key != null && key !== want.key) return target.put(val);
                window.__failHits++;
                injected = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
                try { real.abort(); } catch { /* already aborting */ }
                return {};
              };
            }
            const v = target[prop];
            return typeof v === 'function' ? v.bind(target) : v;
          },
        });
      },
    };
    for (const h of ['oncomplete', 'onerror', 'onabort']) {
      Object.defineProperty(w, h, { set(fn) { real[h] = fn; }, get() { return real[h]; } });
    }
    return w;
  };
});

/* seed() reloads, which is where the hooks above actually take effect. */
await seed(page, { level: 12, coins: 900 });
await sleep(1500);
ok('SETUP the toast recorder is attached (an unrecorded run proves nothing)',
  !(await page.evaluate(() => !!window.__toastObserverFailed)));

const readState = () => page.evaluate(async () => {
  const app = await import('./js/app.js');
  return { ...(app.writeFailures || {}), toasts: (window.__toasts || []).slice(),
    hits: window.__failHits, rejections: (window.__rejections || []).slice() };
});
/* db.js may not export writeIsQuiet at all on a pre-fix tree. Report that as
   the finding it is instead of dying with a stack halfway through the run. */
const classify = (store, val) => page.evaluate(async (s, v) => {
  const d = await import('./js/db.js');
  return typeof d.writeIsQuiet === 'function' ? d.writeIsQuiet(s, v) : 'no-writeIsQuiet-export';
}, store, val);
const STORAGE_RE = /out of storage|did not save|could not save|device storage/i;
const clearToasts = () => page.evaluate(() => { window.__toasts = []; });

/* ============ REWARD: a real meal, through the real UI, XP store dead ============
   Direction: with the xp store failing, the count of storage messages must go
   from 0 to at least 1. On main it stays 0 forever. */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1400);
await clearToasts();
const before = await readState();
await page.evaluate(() => { window.__failWrite = { store: 'xp', key: null }; });
await page.evaluate(() => document.querySelector('[data-addmeal]')?.click());
await sleep(1600);
await page.evaluate(() => {
  const inp = document.querySelector('#t1Search, input[type=search]');
  if (inp) { inp.value = 'apple'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await sleep(1600);
const picked = await page.evaluate(() => {
  const row = document.querySelector('.t1-frow, [data-food], .food-row');
  if (!row) return 'no-food-row';
  row.click(); return 'picked';
});
await sleep(1500);
const submitted = await page.evaluate(() => {
  const b = document.getElementById('addBtn');
  if (!b) return 'no-addBtn';
  b.click(); return 'submitted';
});
await sleep(2600);
const afterXp = await readState();
await page.evaluate(() => { window.__failWrite = null; });

ok('SETUP the meal really reached the Add button (a flow that never submits proves nothing)',
  submitted === 'submitted', `${picked} / ${submitted}`);
ok('SETUP the injected write really fired (an empty sample set is a failure)',
  afterXp.hits > 0, `${afterXp.hits} injected aborts`);
ok('REWARD the player is TOLD when the XP award could not be saved',
  afterXp.toasts.some(t => STORAGE_RE.test(t)),
  JSON.stringify(afterXp.toasts.slice(-3)));
ok('COUNTED the failure is recorded as LOUD, not swallowed',
  (afterXp.loud || 0) > (before.loud || 0), `loud ${before.loud || 0} -> ${afterXp.loud || 0}`);
ok('REWARD the message names storage as the cause the player can act on',
  afterXp.toasts.some(t => /out of storage/i.test(t)), JSON.stringify(afterXp.toasts.slice(-3)));

/* ============ ONE-VOICE: the log path speaks for itself, once ============
   The meal log already has its own message naming the Add button. The new
   app-wide handler must not add a second, generic one on top of it.
   BOUND: exactly 1 storage message for one failed log write. Never 2. */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1400);
await clearToasts();
await page.evaluate(() => { window.__failWrite = { store: 'log', key: null }; });
await page.evaluate(() => document.querySelector('[data-addmeal]')?.click());
await sleep(1500);
await page.evaluate(() => {
  const inp = document.querySelector('#t1Search, input[type=search]');
  if (inp) { inp.value = 'apple'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await sleep(1500);
await page.evaluate(() => document.querySelector('.t1-frow, [data-food], .food-row')?.click());
await sleep(1400);
const submitted2 = await page.evaluate(() => { const b = document.getElementById('addBtn'); if (!b) return 'no-addBtn'; b.click(); return 'submitted'; });
await sleep(2400);
const afterLog = await readState();
await page.evaluate(() => { window.__failWrite = null; });
const logMsgs = afterLog.toasts.filter(t => STORAGE_RE.test(t));
ok('SETUP the second meal reached the Add button', submitted2 === 'submitted', String(submitted2));
ok('ONE-VOICE a failed meal save produces EXACTLY ONE storage message, not two',
  logMsgs.length === 1, `${logMsgs.length}: ${JSON.stringify(logMsgs)}`);
ok('ONE-VOICE and it is the specific one that names the Add button',
  logMsgs.some(t => /tap add/i.test(t)), JSON.stringify(logMsgs));

/* ============ QUIET: fire-and-forget bookkeeping must not interrupt ============
   Direction: a failing quiet key must produce ZERO storage messages. FAILING =
   one appears, which is what a fix with no quiet list would do on a full disk:
   a wall of toasts about popup-seen flags nobody can act on. */
await clearToasts();
const beforeQuiet = await readState();
const quietRes = await page.evaluate(async () => {
  const d = await import('./js/db.js');
  window.__failWrite = { store: 'kv', key: 'discordIntroSeen' };
  let threw = false;
  try { await d.kvSet('discordIntroSeen', true); } catch { threw = true; }
  window.__failWrite = null;
  return { threw };
});
quietRes.quiet = await classify('kv', { k: 'discordIntroSeen' });
await sleep(900);
const afterQuiet = await readState();
ok('SETUP the quiet write really failed (an empty sample set is a failure)',
  quietRes.threw === true, `rejected: ${quietRes.threw}`);
ok('QUIET a fire-and-forget bookkeeping key is classified quiet', quietRes.quiet === true);
ok('QUIET its failure does NOT interrupt the player',
  !afterQuiet.toasts.some(t => STORAGE_RE.test(t)), JSON.stringify(afterQuiet.toasts));
ok('QUIET but it is still counted, so a drowning device is still visible to us',
  (afterQuiet.quiet || 0) > (beforeQuiet.quiet || 0), `quiet ${beforeQuiet.quiet || 0} -> ${afterQuiet.quiet || 0}`);

/* ============ DEFAULT: an unclassified key is LOUD ============
   Wait out the toast gap first. The handler deliberately holds one message per
   WRITE_TOAST_GAP_MS, because a full disk fails every write at once and forty
   stacked toasts is the same information delivered as a wall. That gap is a
   GAP, not a mute, and this is also where that is proven: a fresh loud failure
   after it must speak again. */
await sleep(13000);
await clearToasts();
const beforeDef = await readState();
const defRes = await page.evaluate(async () => {
  const d = await import('./js/db.js');
  window.__failWrite = { store: 'kv', key: 'zzUnclassifiedKeyNobodyTriaged' };
  let threw = false;
  try { await d.kvSet('zzUnclassifiedKeyNobodyTriaged', 1); } catch { threw = true; }
  window.__failWrite = null;
  return { threw };
});
defRes.quiet = await classify('kv', { k: 'zzUnclassifiedKeyNobodyTriaged' });
await sleep(900);
const afterDef = await readState();
ok('SETUP the unclassified write really failed', defRes.threw === true);
ok('DEFAULT a kv key nobody classified is LOUD, never silently quiet', defRes.quiet === false);
ok('DEFAULT and the player hears about it',
  (afterDef.loud || 0) > (beforeDef.loud || 0) && afterDef.toasts.some(t => STORAGE_RE.test(t)),
  `loud ${beforeDef.loud || 0} -> ${afterDef.loud || 0}  ${JSON.stringify(afterDef.toasts)}`);

/* ============ LOUD stores: a reward store can never be classified quiet ============ */
const storeRows = [['inv', { id: 'x' }], ['xp', { key: 'x' }], ['log', { id: 'x' }],
  ['weights', { date: 'x' }], ['health', { date: 'x' }], ['foods', { id: 'x' }]];
const storeClass = [];
for (const [st, v] of storeRows) storeClass.push([st, await classify(st, v)]);
ok('LOUD every reward/record store is loud (inv, xp, log, weights, health, foods)',
  storeClass.length === 6 && storeClass.every(([, q]) => q === false), JSON.stringify(storeClass));
/* The player's spendable and earned kv values must never drift into the quiet
   list. Direction: any true here is the failure. */
const VALUE_KEYS = ['coins', 'bonedust', 'pets', 'petInst', 'talents', 'garden', 'pantry', 'potions',
  'equipped', 'outfits', 'looks', 'paidlooks', 'spires', 'giftbox', 'petBonds', 'ingredients',
  'settings', 'wellness', 'routines', 'redeemed', 'buffs', 'loadout', 'gearloadout'];
const valueKeys = [];
for (const k of VALUE_KEYS) if ((await classify('kv', { k })) === true) valueKeys.push(k);
ok('LOUD no player-value kv key is on the quiet list', valueKeys.length === 0, valueKeys.join(', '));

/* ============ DIAGNOSIS: the rejection is no longer anonymous ============
   The write still rejects, by design. What must change is that whoever
   receives it can say WHICH write died. Direction: failing = a rejection with
   no tallyWrite tag, which is the "no diagnosis possible" half of the report. */
const finalState = await readState();
const quotaRejections = finalState.rejections.filter(r => /Quota/i.test(r.name || ''));
ok('SETUP the rejections really reached window.unhandledrejection',
  quotaRejections.length > 0, `${finalState.rejections.length} rejections, ${quotaRejections.length} quota`);
ok('DIAGNOSIS every rejected write names its store and key instead of arriving anonymous',
  quotaRejections.length > 0 && quotaRejections.every(r => r.tallyWrite && r.tallyWrite.store),
  JSON.stringify(quotaRejections.slice(0, 3)));
/* The write rejections themselves are expected. A TypeError is not. */
const unexpected = errs.filter(e => !/Quota/i.test(e));
ok('NO-CRASH nothing OTHER than the injected write rejections throws',
  unexpected.length === 0, unexpected.slice(0, 2).join(' | '));

await browser.close(); srv.close?.();
if (!checked.length) { console.log('\nNO CHECKS RAN'); process.exit(1); }
console.log(fails.length ? `\n${fails.length}/${checked.length} FAILED: ${fails.join(', ')}` : `\n${checked.length} checks: a failed write is visible`);
process.exit(fails.length ? 1 : 0);

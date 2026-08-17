/* A NATIVE SHELL MUST NEVER BE TOLD TO USE A WEB-ONLY PATH.
 *
 * The bug this was written for: backupNudge fired
 *   toast('Tip: back up your log (Settings, Export)')
 * on every shell. On iOS and Android, Settings > Export is a dead end BY DESIGN
 * (js/app.js, the #exportBtn handler: the WebView cannot save a blob, so it
 * shows an explanation and returns). So the one proactive backup instruction in
 * the app pointed the entire TestFlight / APK cohort at a button that does
 * nothing, and its trigger (lastExportAt, which native can never write) meant it
 * came back every 7 days forever.
 *
 * WHY A REGISTRY AND NOT ONE ASSERTION. "Platform-specific dead instruction" is
 * a class, not an incident: any copy that names a web-only affordance is the
 * same bug the moment a native player reads it. WEB_ONLY below is the registry.
 * Adding an affordance that only exists on the web means adding a row here, and
 * from then on NO toast raised in a native shell may name it.
 *
 * MEASURED, NOT PARSED. This does not grep js/app.js for the string. It boots
 * the real app twice, once with window.Capacitor.isNativePlatform() -> true and
 * once without, records every toast the app actually raises through #toast, and
 * grades those. A refactor that keeps the bug but moves the line still fails,
 * and a different correct fix still passes.
 *
 * THREE ROWS, AND THE THIRD IS THE POINT:
 *   NATIVE-CLEAN   no toast in the native shell names a web-only affordance.
 *   NATIVE-SPOKE   the native shell still said SOMETHING about backup. Without
 *                  this, deleting the tip passes NATIVE-CLEAN, and the fix for
 *                  "we told them the wrong thing" must not be "tell them
 *                  nothing" when the account is genuinely unprotected.
 *   WEB-KEEPS      the web shell still names the export path. This is the
 *                  DIRECTION check (tally/CLAUDE.md rule 11): without it, a
 *                  change that removes the export tip from every platform is
 *                  indistinguishable from the fix.
 *
 * DIRECTION AND BOUND. Failure is not "fewer toasts", it is a native toast
 * whose text matches a WEB_ONLY pattern: bound is ZERO such toasts across the
 * whole boot window, not a reduction. An empty toast sample is a FAILURE, not a
 * pass (rule 3): a boot that raised no toast at all cannot show the tip either,
 * so the run is void and says so.
 *
 * PROVE-RED, run 2026-08-16 against origin/main (56c5058), extracted with
 * `git archive origin/main | tar -x -C <tmp>` and this file copied in:
 *   FAIL  NATIVE-CLEAN (file export)  "Tip: back up your log (Settings, Export)"
 *   FAIL  NATIVE-SPOKE               nothing was said about backup at all
 *   PASS  NATIVE-CLEAN (file import), SAMPLE-NATIVE, SAMPLE-WEB, WEB-KEEPS
 *   exit 1
 * Discriminating, not uniformly red: the pre-fix tree is wrong in exactly the
 * two places the fix is about, and the web row that must NOT move did not move.
 * On the fixed tree all six rows pass, exit 0.
 *
 * Usage: node tests/native-deadpath-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* THE REGISTRY. name: what the affordance is. re: how its instruction reads in
   copy. why: what a native player actually experiences on following it. */
const WEB_ONLY = [
  {
    name: 'file export',
    re: /Settings\s*,?\s*(and\s+|then\s+)?Export|\bExport\b\s*button|export a file/i,
    why: 'js/app.js #exportBtn returns early on isNative(): the WebView cannot save a blob download, so the button explains itself and saves nothing.',
  },
  {
    name: 'file import',
    re: /import (your |a )?(backup|json|file)|Settings\s*,?\s*(and\s+|then\s+)?Import/i,
    why: 'the importer is an <input type=file> picker; there is no exported file on a native device to feed it, because there is no exporter.',
  },
];

/* What the native shell IS allowed to point at, and the only honest backup it
   has: the recovery code. Used by NATIVE-SPOKE. */
const NATIVE_PATH = /recovery/i;

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const srv = await serveTree(ROOT);
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });

/* Reduced motion so the splash and the gate intro do not paint over the run,
   and so the toast queue takes its instant path between messages. */
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

/* ---- the demo database, seeded and reset between shells ----------------
   backupNudge needs >= 20 log rows before it says anything, and it self-gates
   on lastNudgeAt for 7 days, so the first shell would silence the second. Both
   are reset before each run. Writes go to tally-demo ONLY, which godmode's
   ?demo boot created; the guard below refuses anything else. */
const prepare = () => page.evaluate(async () => {
  const names = (await indexedDB.databases()).map(d => d.name);
  if (!names.includes('tally-demo')) return { error: `no tally-demo database (saw: ${names.join(', ') || 'none'})` };
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const today = new Date().toISOString().slice(0, 10);
  await new Promise((res, rej) => {
    const tx = db.transaction('log', 'readwrite');
    const s = tx.objectStore('log');
    for (let i = 0; i < 24; i++) s.put({ id: `deadpath-${i}`, date: today, ts: Date.now() - i * 6e4, name: 'seed', kcal: 100, p: 1, c: 1, f: 1, qty: 1 });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  const rows = await new Promise((res, rej) => {
    const tx = db.transaction('log', 'readonly');
    const r = tx.objectStore('log').getAll(); r.onsuccess = () => res(r.result.length); r.onerror = () => rej(r.error);
  });
  await new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete('lastNudgeAt');
    tx.objectStore('kv').delete('lastExportAt');   // web: never exported, which is the nudged state
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
  return { rows };
});

/* ---- one shell, one boot, every toast it raised ------------------------
   Recorded off the live #toast node rather than by wrapping toast(), which is
   module-private and unreachable from here. The observer is installed before
   any script runs, so a toast raised during boot cannot be missed. */
async function runShell(native) {
  const p = await prepare();
  if (p.error) { console.log(`ABORT  ${p.error}`); await browser.close(); srv.close(); process.exit(1); }

  await page.evaluateOnNewDocument((isNative) => {
    window.__toasts = [];
    const attach = () => {
      const t = document.getElementById('toast');
      if (!t) return setTimeout(attach, 50);
      const push = () => {
        const s = (t.textContent || '').trim();
        if (s && window.__toasts[window.__toasts.length - 1] !== s) window.__toasts.push(s);
      };
      new MutationObserver(push).observe(t, { childList: true, characterData: true, subtree: true });
      push();
    };
    attach();
    if (isNative) {
      /* The minimum shape isNative() reads (js/native.js). Plugins stays empty:
         this is about copy, not about any plugin being present. */
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
    } else {
      try { delete window.Capacitor; } catch { /* not defined */ }
    }
  }, native);

  await page.goto(srv.url.replace(/\/?$/, '/') + '?demo', { waitUntil: 'networkidle2' });
  /* backupNudge posts its toast on a 4s timer, behind whatever boot toasts the
     demo profile raises first, each holding the queue for its own duration.
     12s covers the queue with room; the sample size is asserted, not assumed. */
  await sleep(12000);
  const toasts = await page.evaluate(() => window.__toasts || []);
  return toasts;
}

/* ---- NATIVE ---- */
const nativeToasts = await runShell(true);
console.log(`\nnative shell raised ${nativeToasts.length} toast(s):`);
for (const t of nativeToasts) console.log(`        ${t}`);

ok('SAMPLE-NATIVE  the native boot raised at least one toast (an empty sample is not a pass)',
  nativeToasts.length > 0, `${nativeToasts.length} recorded`);

for (const w of WEB_ONLY) {
  const hit = nativeToasts.filter(t => w.re.test(t));
  ok(`NATIVE-CLEAN   no native toast points at the web-only ${w.name}`,
    hit.length === 0, hit.length ? `"${hit.join('" | "')}"  (${w.why})` : `0 of ${nativeToasts.length}`);
}

const spoke = nativeToasts.filter(t => NATIVE_PATH.test(t));
ok('NATIVE-SPOKE   the native shell still names the path that DOES work (recovery code)',
  spoke.length > 0, spoke.length ? `"${spoke.join('" | "')}"` : 'nothing was said about backup at all');

/* ---- WEB ---- */
await page.deleteCookie(...(await page.cookies()));
const webToasts = await runShell(false);
console.log(`\nweb shell raised ${webToasts.length} toast(s):`);
for (const t of webToasts) console.log(`        ${t}`);

ok('SAMPLE-WEB     the web boot raised at least one toast (an empty sample is not a pass)',
  webToasts.length > 0, `${webToasts.length} recorded`);

const kept = webToasts.filter(t => WEB_ONLY[0].re.test(t));
ok('WEB-KEEPS      the web shell still offers the export path (direction check: deleting the tip everywhere is not the fix)',
  kept.length > 0, kept.length ? `"${kept.join('" | "')}"` : 'the export tip is gone from the web too');

await browser.close();
srv.close();
console.log(`\n${fails.length ? 'FAIL' : 'PASS'}  ${fails.length} failing row(s)`);
process.exit(fails.length ? 1 : 0);

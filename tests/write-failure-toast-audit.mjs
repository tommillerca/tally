/* THE PLAYER IS TOLD WHEN A WRITE IS LOST, which is the half the seam did not
 * ship with.
 *
 * WHAT IT WAS. v425 landed js/db.js's write-failure seam: all six write paths
 * (put, del, clear, addIfAbsent, take, kvUpdate) route a rejection through
 * reportWriteFailure and then re-throw unchanged. That reporter ends in
 * `if (!writeFailureSink) return;` and NOTHING IN THE APP CALLED onWriteFailure.
 * Measured on origin/main at e7b4ca75: `onWriteFailure` appears once in the whole
 * shipped tree, at its own export in js/db.js, and zero times in js/app.js. So
 * `writeFailureSink` was permanently null, every rejection returned early, and a
 * lost meal, weight, crate or coin row was exactly as silent as before the seam
 * existed. The mechanism shipped without its consumer.
 *
 * tests/write-failure-seam-audit.mjs cannot catch this and is not supposed to:
 * it registers its OWN sink to observe the seam, which is the correct way to test
 * the seam and the precise reason it stays green while the app has none. This
 * file registers nothing. It drives the real page, breaks a real write, and looks
 * at the real #toast.
 *
 * THE ROWS, and which direction is failure:
 *   PREMISE   the induced write really rejects. Failure is a write that quietly
 *             succeeds, which would make every row below vacuous: no rejection,
 *             no report, no toast, and a green run proving nothing. This is the
 *             positive control and it is the reason the zeros mean anything.
 *   LOUD      a rejected write the player could NAME (an xp row) puts a message
 *             on screen. Failure is SILENCE, and silence is exactly the bug.
 *   QUIET     ambient bookkeeping does NOT. db.js already classifies this and
 *             this file does not re-implement the list; it picks one key from
 *             each side. Failure is a toast, i.e. lecturing somebody because a
 *             throttle timestamp did not persist.
 *   THROTTLE  three rejections in the same second produce ONE message, not
 *             three. Failure is UP. A failing database does not fail once, and
 *             toast() caps its queue at four, which is still four identical
 *             lectures.
 *   QUOTA     an out-of-storage rejection says so, because "free some space" is
 *             actionable and "that did not save" is not. Failure is the generic
 *             copy on a quota error.
 *   NORECURSE reporting must not feed itself: the sink calls track(), track()
 *             queues by writing kv 'evq', and on a full disk that write fails
 *             too. db.js returns early for exactly kv/evq. Failure is any toast
 *             at all from an evq rejection.
 *
 * PROVE-RED: against a tree with the onWriteFailure block deleted from
 * js/app.js, LOUD, THROTTLE and QUOTA go red and PREMISE, QUIET and NORECURSE
 * stay green, which is the correct shape: without a sink nothing is announced,
 * and "nothing is announced" is trivially true for the rows that assert silence.
 *
 * Usage: node tests/write-failure-toast-audit.mjs [baseUrl]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

const fails = [];
const ok = (n, pass, d = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!pass) fails.push(n); };

const { browser, page } = await boot(base, { headless: process.env.HEADLESS_MODE || 'shell' });

try {
  await page.goto(`${base.replace(/\/?$/, '/')}?demo`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);

  /* BLANK IT, NEVER REMOVE IT: #toast is one persistent element the app reuses,
     so removing it breaks every later message instead of clearing this one. */
  const clear = () => page.evaluate(() => {
    const t = document.querySelector('#toast');
    if (t) { t.textContent = ''; t.hidden = true; }
  });
  const toastNow = () => page.evaluate(() => {
    const t = document.querySelector('#toast');
    return t && !t.hidden ? (t.textContent || '').trim() : '';
  });

  /* Break a write for real: a store name that does not exist rejects inside the
     transaction, which is the same path a quota or a corrupt store takes. */
  const breakWrite = (n = 1) => page.evaluate(async count => {
    const d = await import('./js/db.js');
    let threw = 0;
    for (let i = 0; i < count; i++) {
      try { await d.db.put('__no_such_store__', { key: 'probe-' + i }); } catch { threw++; }
    }
    return threw;
  }, n);

  await clear();
  const threw = await breakWrite(1);
  await sleep(600);
  const loud = await toastNow();
  ok('PREMISE the induced write really rejects, so the rows below are not vacuous',
    threw === 1, `${threw} of 1 rejected`);
  ok('LOUD a rejected write the player could name puts a message on screen',
    /did not save/i.test(loud), loud ? `toast: "${loud}"` : 'NO TOAST (this is the bug: nothing registered a sink)');

  /* QUIET: one key from db.js's own quiet list. Not a second classification. */
  await sleep(9000);                      // outlast the throttle so silence means silence
  await clear();
  const quietThrew = await page.evaluate(async () => {
    const d = await import('./js/db.js');
    try { await d.kvUpdate('backupAt', () => { throw new Error('boom'); }); return true; } catch { return true; }
  });
  await sleep(700);
  const quietToast = await toastNow();
  ok('QUIET ambient bookkeeping does not lecture the player',
    quietThrew && quietToast === '', quietToast ? `toast: "${quietToast}"` : 'silent, correct');

  /* THROTTLE: a failing database does not fail once. */
  await sleep(9000);
  await clear();
  const shown = await page.evaluate(async () => {
    const d = await import('./js/db.js');
    const seen = [];
    const t = document.querySelector('#toast');
    const obs = new MutationObserver(() => { const v = (t.textContent || '').trim(); if (v && seen[seen.length - 1] !== v) seen.push(v); });
    obs.observe(t, { childList: true, characterData: true, subtree: true });
    for (let i = 0; i < 3; i++) { try { await d.db.put('__no_such_store__', { key: 'burst-' + i }); } catch { /* expected */ } }
    await new Promise(r => setTimeout(r, 1200));
    obs.disconnect();
    return seen;
  });
  ok('THROTTLE three rejections in the same second produce ONE message, not three',
    shown.filter(x => /did not save/i.test(x)).length === 1,
    `${shown.length} message(s): ${JSON.stringify(shown)}`);

  /* QUOTA: the copy has to be actionable. */
  await sleep(9000);
  await clear();
  await page.evaluate(async () => {
    const d = await import('./js/db.js');
    const e = new Error('The quota has been exceeded.');
    e.name = 'QuotaExceededError';
    try { await d.kvUpdate('coins', () => { throw e; }); } catch { /* expected */ }
  });
  await sleep(700);
  const quotaToast = await toastNow();
  ok('QUOTA an out-of-storage rejection says so, because "free some space" is actionable',
    /storage/i.test(quotaToast), quotaToast ? `toast: "${quotaToast}"` : 'NO TOAST');

  /* NORECURSE: the sink reports by writing evq, so an evq failure must not report. */
  await sleep(9000);
  await clear();
  await page.evaluate(async () => {
    const d = await import('./js/db.js');
    try { await d.kvUpdate('evq', () => { throw new Error('boom'); }); } catch { /* expected */ }
  });
  await sleep(700);
  const evqToast = await toastNow();
  ok('NORECURSE a failed telemetry write reports nothing, or the reporter feeds itself forever',
    evqToast === '', evqToast ? `toast: "${evqToast}"` : 'silent, correct');
} finally {
  await browser.close().catch(() => {});
  srv?.close?.();
}

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'all green'}`);
process.exit(fails.length ? 1 : 0);

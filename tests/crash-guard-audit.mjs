/* THREE CRASH / DEAD-CONTROL GUARDS, all three proven red against the bugs.
 *
 * These are not related by feature. They are related by shape: each one is a
 * failure the app could not tell you about, on a surface where the player is
 * simply stuck.
 *
 *   BOOT-HASH   a stray '%' in the URL fragment threw URIError out of
 *               ingestHkFromUrl(), inside boot(), BEFORE route() and bindTabs().
 *               boot() is called bare, so the throw left #screen empty with a
 *               tab bar that did nothing, and the hash survives a reload, so
 *               the app stayed dead. Measured: innerHTML length 0.
 *   NAME-STUCK  social.setName() was the one signedFetch caller in social.js
 *               with no try/catch. With no network the Save button in the name
 *               builder sat at "Saving...", disabled, forever: no toast, no way
 *               back except closing the sheet.
 *   VAULT-DIAG  the Settings diagnostics line read s.readable / s.present, and
 *               BhVault.status() returns neither on either platform. Every
 *               phone printed `BhVault:ok:empty`, including one whose vault
 *               could NOT BE READ. This project's hardest rule is that an
 *               unreadable vault must never read as an empty one, and this is
 *               the diagnostic written to catch exactly that.
 *
 * WHAT FAILURE LOOKS LIKE (anti-regression rule 1), per check, below. Every
 * check carries a CONTROL that fails if the harness never reached the state,
 * because an empty sample set is a failure and not a pass (rule 3).
 *
 * Usage: node tests/crash-guard-audit.mjs [baseUrl]   (serves this repo if omitted)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, serveTree, sleep, chromePath, sandboxArgs } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = (argUrl || srv.url).replace(/\/?$/, '/');
console.log(`crash-guard-audit against ${base}\n`);

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'new',
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  executablePath: chromePath(),
  args: sandboxArgs(),
});

/* A fresh page per case on purpose. page.goto() to a URL that differs only in
   its FRAGMENT is a same-document navigation, so boot() never re-runs and every
   case would silently read the previous one's DOM. Measured while writing this:
   five different hashes, byte-identical #screen length. */
async function load(url, { onNewDoc = null, waitMs = 4200 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  if (onNewDoc) await page.evaluateOnNewDocument(onNewDoc.fn, onNewDoc.arg);
  await page.evaluateOnNewDocument(() => {
    window.__unh = [];
    addEventListener('unhandledrejection', e => window.__unh.push(String((e.reason && e.reason.message) || e.reason)));
  });
  await page.goto(url, { waitUntil: 'networkidle2' });
  await sleep(waitMs);
  return { page, errs };
}

/* ---------------- 1. BOOT-HASH ----------------------------------------------
 * FAILURE LOOKS LIKE: screenLen 0 and a "URI malformed" pageerror on the
 * malformed hash. The two CONTROL rows are the direction check: if the harness
 * were measuring nothing at all they would be 0 too, and they must not be. */
{
  const cases = [
    ['plain boot (CONTROL)', '?demo', true],
    ['well-formed #/hk (CONTROL)', '?demo#/hk?steps=4321', true],
    ['bare percent  #/hk%', '?demo#/hk%', false],
    ['trailing percent  #/hk?n=100%', '?demo#/hk?n=100%', false],
  ];
  for (const [label, q, isControl] of cases) {
    const { page, errs } = await load(base + q);
    const screenLen = await page.evaluate(() => (document.getElementById('screen') || {}).innerHTML?.length ?? -1);
    const uriErr = errs.filter(e => /URI malformed/i.test(e));
    ok(`BOOT-HASH renders  ${label}`, screenLen > 500,
      `#screen innerHTML ${screenLen} chars${isControl ? ' (control: proves the measurement is live)' : ''}`);
    ok(`BOOT-HASH no URIError  ${label}`, uriErr.length === 0, uriErr.join(' | ') || 'none');
    // the tab bar is only wired by bindTabs(), which runs AFTER the throw site,
    // so this is the half a player actually feels: a bar that does nothing.
    const navWorks = await page.evaluate(async () => {
      document.querySelector('#tabbar .tab[data-tab="bonehead"]')?.click();
      await new Promise(r => setTimeout(r, 1200));
      return location.hash;
    });
    ok(`BOOT-HASH tab bar is wired  ${label}`, /bonehead/.test(navWorks), `hash after tapping Bonehead: ${navWorks || '(none)'}`);
    await page.close();
  }
}

/* ---------------- 2. NAME-STUCK ---------------------------------------------
 * Points the app at a port nothing listens on, so every signedFetch REJECTS
 * (airplane mode), rather than merely answering !ok.
 * FAILURE LOOKS LIKE: btn "Saving..." disabled=true, zero toasts, and an
 * unhandled rejection "Failed to fetch". The CONTROL is that the builder really
 * opened with an ENABLED Save button before the click; without it a sheet that
 * never opened would read as a pass. */
{
  const DEAD_API = 'http://127.0.0.1:65534';
  const { page } = await load(base + '?demo', { waitMs: 3000 });
  // an account row is what makes the Crew tab offer the name builder at all
  await page.evaluate(async () => {
    const db = await new Promise(res => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); });
    await new Promise(res => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ k: 'social', v: { playerId: 'p-guard', handle: 'Guard Bone', friendCode: 'BONE-AAAA-BBBB' } });
      tx.oncomplete = res;
    });
  });
  await page.goto(`${base}?demo&api=${encodeURIComponent(DEAD_API)}#/friends`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => { window.__unh = []; addEventListener('unhandledrejection', e => window.__unh.push(String((e.reason && e.reason.message) || e.reason))); });
  await sleep(3800);

  const apiSeen = await page.evaluate(async () => (await import('./js/social.js')).apiBase());
  ok('NAME-STUCK CONTROL app is pointed at the dead API', apiSeen === DEAD_API, apiSeen);

  const opened = await page.evaluate(() => { const b = document.getElementById('crewEditName'); if (!b) return false; b.click(); return true; });
  await sleep(1400);
  const before = await page.evaluate(() => {
    const b = document.getElementById('nbSave');
    return b ? { txt: b.textContent.trim(), disabled: b.disabled } : null;
  });
  ok('NAME-STUCK CONTROL the name builder opened with a live Save button',
    !!(opened && before && !before.disabled), JSON.stringify(before));

  /* RECORD the toast, do not sample it. A toast lives ~2.2s and the button needs
     ~6s of network timeout to settle, so a single read at the end sees an empty
     #toast and grades a working message as missing. */
  await page.evaluate(() => {
    window.__toasts = [];
    const t = document.getElementById('toast');
    new MutationObserver(() => { const s = (t.textContent || '').trim(); if (s && !window.__toasts.includes(s)) window.__toasts.push(s); })
      .observe(t, { childList: true, characterData: true, subtree: true });
  });
  await page.evaluate(() => document.getElementById('nbSave').click());
  await sleep(6000);
  const after = await page.evaluate(() => {
    const b = document.getElementById('nbSave');
    return { txt: b ? b.textContent.trim() : null, disabled: b ? b.disabled : null,
      toast: window.__toasts.join(' | '), unh: window.__unh };
  });
  ok('NAME-STUCK the Save button recovers when the network is gone',
    after.disabled === false && after.txt === 'Save name', JSON.stringify({ txt: after.txt, disabled: after.disabled }));
  ok('NAME-STUCK the player is told why', /could not save/i.test(after.toast || ''), after.toast || '(no toast)');
  ok('NAME-STUCK no unhandled rejection escapes setName', (after.unh || []).length === 0, (after.unh || []).join(' | ') || 'none');
  await page.close();
}

/* ---------------- 3. VAULT-DIAG ---------------------------------------------
 * The shapes below are copied from the plugins, not invented:
 *   iOS     native/ios/App/App/BhVault.swift  -> { available, e2e, hasIdentity, readError? }
 *   Android native/android/.../BhVault.kt     -> the same, plus reason?
 * FAILURE LOOKS LIKE: all four shapes reporting `empty`, which is what the
 * s.readable / s.present version did, and the two unreadable shapes are the
 * ones that matter: an unreadable vault reported as empty is how a recoverable
 * account gets minted over. */
{
  const SHAPES = [
    ['ios: key present', { available: true, e2e: true, hasIdentity: true }, 'has-key'],
    ['ios: vault empty', { available: true, e2e: true, hasIdentity: false }, 'empty'],
    ['ios: keychain read error', { available: true, e2e: true, hasIdentity: false, readError: 'keychain status -25300' }, 'unreadable'],
    ['android: no play services', { available: false, e2e: false, hasIdentity: false, reason: 'Google Play services is unavailable' }, 'unreadable'],
  ];
  const seen = [];
  for (const [label, shape, want] of SHAPES) {
    const { page } = await load(base + '?demo#/settings', {
      // Capacitor with no isNativePlatform stays FALSE, so this stubs the one
      // plugin the diagnostics line reads and changes nothing else.
      onNewDoc: { fn: s => { window.Capacitor = { Plugins: { BhVault: { status: async () => s } } }; }, arg: shape },
      waitMs: 5200,
    });
    const line = await page.evaluate(() => (document.getElementById('diagLine') || {}).textContent || '');
    const m = /BhVault:ok:([a-z-]+)/.exec(line);
    // an unmatched regex is a FAILURE, never a quiet pass
    ok(`VAULT-DIAG the line reports a BhVault state  ${label}`, !!m, m ? m[1] : `no BhVault token in: ${line.slice(0, 160)}`);
    ok(`VAULT-DIAG ${label} -> ${want}`, !!m && m[1] === want, m ? `got ${m[1]}` : 'nothing');
    seen.push(m ? m[1] : null);
    await page.close();
  }
  ok('VAULT-DIAG the three states are three DIFFERENT strings',
    new Set(seen.filter(Boolean)).size === 3, `states seen: ${seen.join(', ')}`);
}

await browser.close();
srv?.close();
console.log(`\n${fails.length ? `FAILED ${fails.length}` : 'ALL GREEN'}`);
process.exit(fails.length ? 1 : 0);

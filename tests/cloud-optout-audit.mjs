/* CLOUD BACKUP OFF MUST ACTUALLY STOP THE UPLOAD.
 *
 * WHAT IT WAS, traced 2026-08-23 while correcting privacy.html. Settings ->
 * Cloud backup -> Off calls setCloudBackup(false), which sets exactly one kv
 * flag, `cloudOff`. That flag was read in exactly ONE place in the whole app:
 * bootSync's RESTORE path (js/social.js). Nothing on the WRITE path read it.
 * autoSync() runs on every boot and every resume (js/app.js) and calls
 * pushBackup() unconditionally, so the encrypted save kept being uploaded after
 * a player turned backup off, while the toast told them "Cloud backup off. Your
 * progress will only live on this phone." privacy.html told them the same.
 *
 * The blast radius is the whole save: pushBackup sends exportAll(), which is the
 * food log, weights, health rows and every game store. It is encrypted, so no
 * plaintext was ever exposed, and that is the ONLY reason this was a broken
 * promise rather than a leak. A player who opts out is not asking for their data
 * to be unreadable, they are asking for it not to be sent.
 *
 * THE FIX is one guard inside pushBackup, not in its callers. Four call sites
 * reach it (autoSync, both Go Online buttons, the cbOn toggle) and there is
 * exactly one `signedFetch('PUT', '/backup')` in the app, so the guard belongs
 * where they converge. Gating a caller would leave the other three open.
 *
 * WHAT THIS FILE GRADES, and which direction is failure:
 *   PREMISE   the fake API really received a PUT /backup while backup was ON.
 *             Failure is ZERO. Without this row, every assertion below passes on
 *             a tree where nothing uploads at all, which is the exact shape of
 *             the two blind probes this repo wrote earlier the same day.
 *   OFF       after the REAL Settings "Off" button is pressed, driving both the
 *             direct call and autoSync sends NOTHING. Failure is ANY.
 *   SINGLEPATH there is exactly ONE place in the app that writes a backup and it
 *             is inside pushBackup, which is what makes a single guard enough.
 *             Failure is a SECOND write site. This replaces a reload-based row
 *             that could not fail: navigator.webdriver disables the boot sync
 *             outright (NOSOCIAL), so no automated reload can exercise it.
 *   BACKON    pressing "On" starts it again. Failure is ZERO: a fix that wedges
 *             backup off forever would make OFF and BOOT green and lose people
 *             their saves, which is a far worse bug than the one being fixed.
 *   RESTORE   cloudOff still gates the boot RESTORE, so the fix did not trade
 *             one half of the flag for the other.
 *
 * The server's own received-log is the authority, not page.on('request'):
 * a request the browser attempts and abandons is not an upload. Both are
 * recorded and the rows read `served`.
 *
 * PROVE-RED: run against a tree without the guard and OFF and BOOT both go red
 * with the PUT counted; that is how this file was written, before the fix.
 *
 * Usage: node tests/cloud-optout-audit.mjs [baseUrl]
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argvBase = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
const srvHandle = argvBase ? null : await serveTree(ROOT);
const base = argvBase || srvHandle.url;

const fails = [];
const ok = (n, pass, d = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!pass) fails.push(n); };

const served = [];      // what the SERVER received: the authority
const wire = [];        // what the browser attempted: context only
const api = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    served.push({ method: req.method, url: req.url, bytes: body.length });
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('content-type', 'application/json');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.url.startsWith('/register')) {
      res.end(JSON.stringify({ playerId: 'p-audit', handle: 'AUDIT BONES', friendCode: 'AUDIT1', name: null }));
      return;
    }
    if (req.url.startsWith('/friends')) { res.end(JSON.stringify({ friends: [], incoming: [], outgoing: [] })); return; }
    if (req.url.startsWith('/grants')) { res.end(JSON.stringify({ grants: [], cursor: 0 })); return; }
    if (req.url.startsWith('/leaderboard')) { res.end(JSON.stringify({ rows: [] })); return; }
    // a GET /backup with no row is what a fresh account sees
    if (req.url.startsWith('/backup') && req.method === 'GET') { res.end(JSON.stringify({ blob: null })); return; }
    res.end(JSON.stringify({ ok: true }));
  });
});
await new Promise(r => api.listen(0, '127.0.0.1', r));
const apiUrl = `http://127.0.0.1:${api.address().port}`;

/* PRESS A REAL SETTINGS CONTROL, POLLING FOR IT RATHER THAN SLEEPING AT IT.
   A fixed 1400ms wait after setting the hash flaked once here: renderSettings
   awaits social reads before the toggle exists, and the row only renders for an
   online account. A flaky control row fails the three rows below it and reads
   like the feature is broken, so this waits for the element and reports whether
   it ever appeared. */
const pressSetting = async sel => {
  await page.evaluate(() => { location.hash = '#/settings'; });
  try {
    await page.waitForSelector(sel, { timeout: 12000, visible: true });
  } catch { return false; }
  return page.evaluate(s => { const b = document.querySelector(s); if (!b) return false; b.click(); return true; }, sel);
};

const puts = () => served.filter(r => r.method === 'PUT' && r.url.startsWith('/backup'));
const putsSince = mark => puts().length - mark;

const { browser, page } = await boot(base, { headless: process.env.HEADLESS_MODE || 'shell' });
page.on('request', r => wire.push({ url: r.url(), method: r.method() }));

try {
  const open = async () => {
    await page.goto(`${base.replace(/\/?$/, '/')}?demo&api=${encodeURIComponent(apiUrl)}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(2500);
  };
  await open();
  // a real account, so isOnline() is true and the write path is live
  await page.evaluate(async () => { const s = await import('./js/social.js'); await s.goOnline(); });
  await sleep(800);

  /* ---- PREMISE: the upload works at all while backup is ON --------------- */
  let mark = puts().length;
  await page.evaluate(async () => { const s = await import('./js/social.js'); await s.pushBackup('audit'); });
  await sleep(700);
  const onCount = putsSince(mark);
  ok('PREMISE the fake API really receives PUT /backup while cloud backup is ON, so a zero below means something',
    onCount > 0, `${onCount} PUT /backup received, ${puts()[0]?.bytes ?? 0} bytes`);

  /* ---- OFF: through the REAL Settings control, not by setting the kv ----- */
  const pressed = await pressSetting('#cbOff');
  await sleep(1200);
  ok('CONTROL the real Settings "Off" button exists and was pressed', pressed);
  const flag = await page.evaluate(async () => (await import('./js/social.js')).cloudBackupOn());
  ok('CONTROL the toggle actually recorded the opt-out', flag === false, `cloudBackupOn() = ${flag}`);

  mark = puts().length;
  await page.evaluate(async () => {
    const s = await import('./js/social.js');
    await s.pushBackup('audit');                       // the direct call
    await s.autoSync(async () => ({ level: 1 }), 'audit');  // the path that actually leaked
  });
  await sleep(1000);
  ok('OFF nothing is uploaded after the player turns cloud backup off',
    putsSince(mark) === 0, `${putsSince(mark)} PUT /backup after opting out`);

  /* ---- SINGLEPATH: what makes ONE guard sufficient ----------------------
     THE BOOT ROW THIS REPLACES COULD NOT FAIL, AND THAT IS WORTH WRITING DOWN.
     It reloaded the page with the flag set and asserted no upload, and it read 0
     on the UNPATCHED tree, twice. Not because the boot was clean: `NOSOCIAL =
     S.demo || navigator.webdriver === true` (js/app.js), and puppeteer sets
     navigator.webdriver, so the boot autoSync never runs under ANY automation,
     with or without ?demo. The row was grading the harness. The OFF row above
     drives autoSync() directly instead, which is the same function boot and
     resume call.

     What the boot row was really trying to protect is that ONE guard covers
     every path, so this asserts that directly and statically: there is exactly
     one place in the app that writes a backup, and it is inside the function
     that carries the guard. Failure is a SECOND write site appearing, which is
     the only way a caller could get around it. */
  const raw = await import('node:fs').then(fs => fs.readFileSync(path.join(ROOT, 'js/social.js'), 'utf8'));
  /* COMMENTS STRIPPED BEFORE COUNTING, and this is not a nicety: the guard's own
     comment quotes the call it guards, so counting raw text found TWO write
     sites and went red on the fixed tree. An assertion that cannot tell code
     from prose about code is a false-red generator; fix it at the assertion. */
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const writeSites = [...src.matchAll(/signedFetch\(\s*'PUT'\s*,\s*'\/backup'/g)].length;
  const guardIdx = src.search(/export async function pushBackup/);
  const nextExport = src.indexOf('\nexport ', guardIdx + 1);
  const pushBody = src.slice(guardIdx, nextExport === -1 ? src.length : nextExport);
  ok('SINGLEPATH exactly one place in the app uploads a backup, and it is inside pushBackup, which is what makes one guard enough',
    writeSites === 1 && /signedFetch\(\s*'PUT'\s*,\s*'\/backup'/.test(pushBody),
    `${writeSites} PUT /backup call site(s) in js/social.js, inside pushBackup: ${/signedFetch\(\s*'PUT'\s*,\s*'\/backup'/.test(pushBody)}`);
  ok('SINGLEPATH and pushBackup consults cloudOff before it sends',
    /cloudOff|cloudBackupOn/.test(pushBody), 'pushBackup body references the opt-out flag');

  /* ---- RESTORE: the half of the flag that already worked still works ----- */
  const restore = await page.evaluate(async () => (await import('./js/social.js')).bootSync?.constructor?.name || 'present');
  const reason = await page.evaluate(async () => {
    const s = await import('./js/social.js');
    const r = await s.bootSync();
    return r && r.reason;
  });
  ok('RESTORE cloudOff still refuses the boot restore, so the write guard did not replace the read guard',
    reason === 'opted-out', `bootSync reason = ${reason} (${restore})`);

  /* ---- BACKON: turning it on again must resume, or this fix loses saves -- */
  const backOn = await pressSetting('#cbOn');
  await sleep(1500);
  ok('CONTROL the real Settings "On" button exists and was pressed', backOn);
  mark = puts().length;
  await page.evaluate(async () => { const s = await import('./js/social.js'); await s.pushBackup('audit'); });
  await sleep(800);
  ok('BACKON turning cloud backup back on resumes uploading, so the guard cannot wedge a player off forever',
    putsSince(mark) > 0, `${putsSince(mark)} PUT /backup after opting back in`);

  console.log(`      server received ${served.length} requests, ${puts().length} of them PUT /backup`);
  console.log(`      browser attempted ${wire.filter(w => w.method === 'PUT' && w.url.includes('/backup')).length} PUT /backup`);
} finally {
  await browser.close().catch(() => {});
  await new Promise(r => api.close(r));
  srvHandle?.close?.();
}

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'all green'}`);
process.exit(fails.length ? 1 : 0);

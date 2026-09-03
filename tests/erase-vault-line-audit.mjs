/* THE ERASE SHEET SAYS WHAT IS TRUE FOR THIS PLAYER, AND THE SERVER'S CLAMP
 * SIGNAL SURVIVES THE TRIP HOME. Two seams, one Worker, because both are the
 * same shape: a fact the server already knows that the client threw away.
 *
 * WHY IT NEEDS A REAL WORKER. Both checks are about a STATUS CODE and a
 * RESPONSE BODY, which are exactly the two things a stub would be inventing.
 * GET /backup answers 404 for a player with no blob and 200 once one is pushed;
 * PUT /profile answers with `bounded` naming every field it pulled down to its
 * ceiling, and only when there is one. Assert against a fake and the audit is
 * grading its own fixture. So this spawns the real Worker against a local D1
 * and drives the real client at it, the way tests/crew-pair-audit.mjs does.
 *
 * WHY THE COPY MATTERS. The erase sheet is a destructive confirmation. It used
 * to hedge, "If cloud backup is on, the vault copy survives", leaving the player
 * to work out whether that if was about them. The three states below are the
 * three sentences it can now say, and the one that must never appear is a
 * promise of a surviving copy on a device that could not reach the server.
 *
 * THE COPY IS READ OFF THE RENDERED SHEET, never off js/app.js. A source grep
 * would go green on a string that no state ever reaches.
 *
 * PROVE-RED: against origin/main every row here fails, because #erVault does
 * not exist and kv `profileBounded` is never written.
 *
 *   node tests/erase-vault-line-audit.mjs
 *   API=http://127.0.0.1:8788 node tests/erase-vault-line-audit.mjs   (reuse a Worker)
 */
import path from 'node:path';
import net from 'node:net';
import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree, dismissOverlays } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};
const die = msg => { console.log(`FAIL  ${msg}`); process.exit(1); };

/* ---------------- the Worker ----------------
   A DELIBERATE COPY of tests/crew-pair-audit.mjs's spawn, not an import of it.
   That file owns the original and carries the measurements behind every line of
   it (npx kills the child; SIGKILL on wrangler alone orphans workerd and eats
   the ephemeral port range). It is under active edit elsewhere, and reaching
   into it from here would put a merge conflict between this audit and that one.
   Fold the two together once that file is quiet. 2026-09-02. */
function wranglerEntry() {
  const candidates = [
    path.join(ROOT, 'server/node_modules/wrangler/bin/wrangler.js'),
    path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'),
  ];
  const npxRoot = path.join(process.env.HOME || '/root', '.npm/_npx');
  try {
    for (const d of readdirSync(npxRoot)) candidates.push(path.join(npxRoot, d, 'node_modules/wrangler/bin/wrangler.js'));
  } catch { /* no npx cache */ }
  const hit = candidates.find(f => existsSync(f));
  if (!hit) die(`no wrangler found. Looked in:\n    ${candidates.join('\n    ')}\n  Fix: npm i -D wrangler in server/.`);
  return hit;
}

async function startWorker() {
  if (process.env.API) return { url: process.env.API, close: () => {} };
  const port = await new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
  const dir = path.join(ROOT, 'server');
  const bin = wranglerEntry();
  const seed = spawn(process.execPath, [bin, 'd1', 'execute', 'bonez', '--local', '--file=schema.sql'],
    { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(r => seed.on('exit', r));
  const p = spawn(process.execPath, [bin, 'dev', '--local', '--port', String(port),
    '--var', 'DEV:1', '--var', 'ADMIN_TOKEN:devtoken'],
    { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const killTree = () => { try { process.kill(-p.pid, 'SIGKILL'); } catch { /* group already gone */ } };
  process.once('exit', killTree);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { killTree(); process.exit(1); });
  let err = '';
  p.stderr.on('data', d => { err += d; });
  p.stdout.on('data', d => { err += d; });
  let exited = null;
  p.on('exit', (c, s) => { exited = s || `exit ${c}`; });
  const url = `http://127.0.0.1:${port}`;
  const t0 = Date.now();
  for (;;) {
    if (exited) die(`the Worker died before serving ${url} (${exited}). ${err.trim().split('\n').pop() || ''}`);
    try { if ((await fetch(url + '/health')).ok) break; } catch { /* not up */ }
    if (Date.now() - t0 > 60000) { killTree(); die(`nothing answered on ${url}/health within 60s. ${err.trim() || '(silent)'}`); }
    await sleep(400);
  }
  return { url, close: killTree };
}

const api = await startWorker();
const srvHandle = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srvHandle.url;
const pageUrl = `${base.replace(/\/?$/, '/')}?demo&api=${encodeURIComponent(api.url)}`;

const { browser, page } = await boot(base);
await page.goto(pageUrl, { waitUntil: 'networkidle2' });
await sleep(2600);
await dismissOverlays(page);

/* The SAME live module instance app.js imported, so every call below goes over
   the real signed fetch rather than a re-implementation of it. */
const soc = (fn, ...args) => page.evaluate(async (f, a) => {
  const m = await import('/js/social.js');
  return await m[f](...a);
}, fn, args);
const kvGet = k => page.evaluate(async key => {
  const d = await new Promise((res, rej) => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return await new Promise((res, rej) => { const t = d.transaction('kv').objectStore('kv').get(key); t.onsuccess = () => res(t.result ? t.result.v : null); t.onerror = () => rej(t.error); });
}, k);

/* Open the erase sheet and read the vault sentence OFF THE SCREEN. The probe is
   async by design (the sheet must not wait on the network to open), so this
   waits for the placeholder to be replaced rather than sampling once: a guard
   that sampled the instant the sheet opened would only ever read "Checking". */
async function vaultLine() {
  await page.evaluate(() => { location.hash = '#/settings'; });
  await sleep(1800);
  await page.evaluate(() => document.getElementById('eraseBtn')?.click());
  const t0 = Date.now();
  let txt = '';
  for (;;) {
    txt = await page.evaluate(() => document.getElementById('erVault')?.textContent || '');
    if (txt && !/Checking/i.test(txt)) break;
    if (Date.now() - t0 > 15000) break;
    await sleep(200);
  }
  await page.evaluate(() => document.querySelector('.sheet-close')?.click());
  await sleep(600);
  return txt;
}
const PROMISES_A_COPY = /copy survives|can be restored later/i;

await soc('goOnline');
await sleep(1200);
const me = await kvGet('social');
if (!me || !me.playerId) die(`the device must register against the Worker before any of this means anything (social=${JSON.stringify(me)})`);

/* ---------------- 1. no blob on the server ---------------- */
const lineNone = await vaultLine();
console.log(`      NONE  ${JSON.stringify(lineNone)}`);
ok('NO BACKUP  the sheet says plainly that there is none, and never that a copy survives',
  /no cloud backup/i.test(lineNone) && !PROMISES_A_COPY.test(lineNone), lineNone || '(empty: #erVault never rendered)');

/* ---------------- 2. a blob really on the server ---------------- */
const pushed = await soc('pushBackup', 'audit');
ok('SETUP  a real encrypted blob is now on the Worker (if this fails the row below is checking nothing)', pushed === true, `pushBackup -> ${pushed}`);
const lineHas = await vaultLine();
console.log(`      HAS   ${JSON.stringify(lineHas)}`);
ok('HAS BACKUP  the same sheet now states the copy exists, with no "if" left in it',
  PROMISES_A_COPY.test(lineHas) && !/\bIf cloud backup is on\b/i.test(lineHas) && !/no cloud backup/i.test(lineHas),
  lineHas || '(empty: #erVault never rendered)');
ok('DISTINCT  the two states are different sentences, not one sentence sampled twice',
  !!lineNone && !!lineHas && lineNone !== lineHas, `${JSON.stringify(lineNone)} vs ${JSON.stringify(lineHas)}`);

/* ---------------- 3. the server's clamp signal is kept ---------------- */
/* A level no honest client can hold. sanitizeSnapshot pulls it down to the
   no-teleporting ceiling and names the field in `bounded`, which is the whole
   signal: empty on every honest sync, so an entry is a real cheat or one of our
   own bugs. It used to be answered into a function that returned r.ok. */
await soc('syncProfile', { level: 999999, outfit: { SK: 'SK0-1' }, gear: [] }, 'audit');
await sleep(800);
const bounded = await kvGet('profileBounded');
console.log(`      BOUND ${JSON.stringify(bounded)}`);
ok('BOUNDED  the fields the server clamped are recorded on the device, not discarded',
  !!bounded && Array.isArray(bounded.fields) && bounded.fields.length > 0 && bounded.at > 0,
  JSON.stringify(bounded));

await page.evaluate(() => { location.hash = '#/today'; }); await sleep(400);
await page.evaluate(() => { location.hash = '#/settings'; }); await sleep(2200);
const diag = await page.evaluate(() => document.getElementById('diagLine')?.textContent || '');
console.log(`      DIAG  ${JSON.stringify(diag)}`);
ok('DIAGNOSTICS  and they ride out on the line Tom already copies, naming the field',
  /\bbounded\s/.test(diag) && (bounded ? bounded.fields.every(f => diag.includes(f)) : false),
  diag || '(no #diagLine)');

/* ---------------- 4. the server unreachable ---------------- */
/* THE STATE THAT MUST NOT LIE. A dead server is not a missing backup and it is
   not a surviving one: the sheet has to decline to promise. Killing the Worker
   is the only honest way to produce it, so it is last. */
api.close();
await sleep(1500);
const lineDead = await vaultLine();
console.log(`      DEAD  ${JSON.stringify(lineDead)}`);
/* NAMED, not just "does not promise". A client that collapsed unknown back into
   false would still refuse to promise here, and this row would go green on it
   while the sheet told a player with a perfectly good vault copy that their save
   is about to be the only one. So the wording is the assertion. */
ok('UNREACHABLE  with the server gone the sheet says it could not check, rather than reporting a definite no',
  !PROMISES_A_COPY.test(lineDead) && /could not be reached/i.test(lineDead) && !/no cloud backup/i.test(lineDead),
  lineDead || '(empty: #erVault never rendered)');

await browser.close().catch(() => {});
srvHandle?.close();
console.log(fails ? '\nerase-vault-line-audit FAILED' : '\nerase-vault-line-audit clean');
process.exit(fails);

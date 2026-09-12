// PURE: signed in-process Worker, SQLite D1, real client model and mem-idb.
// --main reads main sources without modifying any checkout.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { kvGet, useDbName } from '../js/db.js';
let killed = false, aborted = 0, abortReceipt = false;
const open = indexedDB.open.bind(indexedDB);
indexedDB.open = (...args) => {
  const req = open(...args); let success;
  Object.defineProperty(req, 'onsuccess', {
    set(fn) { success = fn; }, get() { return success && (e => {
      const d = req.result;
      if (!d.killWrapped) {
        d.killWrapped = true; const transaction = d.transaction.bind(d);
        d.transaction = (...a) => {
          const t = transaction(...a);
          if (killed) { aborted++; t.abort(); }
          const objectStore = t.objectStore.bind(t);
          t.objectStore = name => {
            const store = objectStore(name), add = store.add;
            store.add = row => {
              const r = add(row);
              if (abortReceipt && row.k === 'spire-takeover:aborted') { aborted++; t.abort(); }
              return r;
            };
            return store;
          };
          return t;
        };
      }
      success(e);
    }); },
  });
  return req;
};
const main = process.argv.includes('--main');
const read = p => main ? execFileSync('git', ['show', `main:${p}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }) : readFileSync(new URL('../' + p, import.meta.url), 'utf8');
async function moduleAt(p) {
  const source = read(p).replace(/(['"])(\.\/[^'"]+)\1/g, (_, q, rel) => JSON.stringify(new URL(rel, new URL('../' + p, import.meta.url)).href));
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
const worker = (await moduleAt('server/src/index.js')).default;
const sp = await moduleAt('js/spires.js');
const sql = new DatabaseSync(':memory:');
sql.exec(read('server/schema.sql'));
const DB = { prepare(query) {
  const stmt = sql.prepare(query); let args = [];
  return { bind(...a) { args = a; return this; }, async first() { return stmt.get(...args) ?? null; },
    async all() { return { results: stmt.all(...args) }; },
    async run() { return { success: true, meta: { changes: Number(stmt.run(...args).changes) } }; } };
}, async batch(stmts) { sql.exec('BEGIN'); try { const out = []; for (const s of stmts) out.push(await s.run()); sql.exec('COMMIT'); return out; } catch(e) { sql.exec('ROLLBACK'); throw e; } } };
const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
sql.prepare('INSERT INTO players (id,pubkey,handle,friend_code,created_at,last_seen,siege_last) VALUES (?,?,?,?,?,?,?)').run('p1', JSON.stringify(await crypto.subtle.exportKey('jwk', keys.publicKey)), 'Owner', 'fixture', Date.now(), Date.now(), Date.now());
async function request(path, method = 'GET', payload) {
  const body = payload ? JSON.stringify(payload) : '', ts = String(Date.now());
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(`${method}\n${path}\n${ts}\n${body}`));
  const r = await worker.fetch(new Request('https://spire.invalid' + path, { method, ...(body ? { body } : {}), headers: { 'x-bh-player': 'p1', 'x-bh-ts': ts, 'x-bh-sig': Buffer.from(sig).toString('base64') } }), { DB });
  assert.equal(r.status, 200); return r.json();
}
const claim = id => request(`/spires/${id}/claim`, 'PUT', { name: 'Audit tower', lat: 1, lng: 2 });
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log(`PASS ${name}`); passed++; } catch(e) { console.error(`FAIL ${name}: ${e.message}`); failed++; } }
await test('CRASH', async () => {
  useDbName('spire-crash');
  const accepted = await claim('sp-1-1'); assert.equal(accepted.ok, true);
  // Kill all local transactions after the server accepts, then reopen same disk.
  killed = true;
  await assert.rejects(sp.syncSieges((await request('/spires/mine')).spires));
  killed = false;
  assert.ok(aborted > 0, 'kill boundary must be reached');
  useDbName('spire-other'); useDbName('spire-crash');
  await sp.syncSieges((await request('/spires/mine')).spires);
  await sp.syncSieges((await request('/spires/mine')).spires);
  assert.ok((await sp.spireState())['sp-1-1']);
  assert.equal(await kvGet('coins', 0), 80, 'server ownership must recover exactly 80 coins');
  assert.equal(await kvGet(`spire-takeover:${accepted.takeover_id}`, false), true);
});
await test('ONCE', async () => {
  const remote = await claim('sp-1-1'); assert.equal(remote.already, true);
  // Execute the production branch through its consolation selection.
  const app = read('js/app.js');
  const start = app.indexOf(main ? '        const already = !!(remote' : '        takeoverPaid = remote?.ok');
  const end = app.indexOf("        } else if (refused && remote.reason", start);
  assert.ok(start > 0 && end > start);
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const settle = new AsyncFunction('remote', 'paySpireTakeover', 'claimSpire', 'foeCfg', 'toast', `let takeoverPaid = 0, coins = 0; const refused = false, pending = false; ${app.slice(start, end)} } return { coins, takeoverPaid };`);
  assert.deepEqual(await settle(remote, sp.paySpireTakeover, () => { throw Error('repeat claimed locally'); }, { spire: { name: 'Audit' } }, () => {}), { coins: 25, takeoverPaid: 0 });
  assert.equal(await kvGet('coins', 0), main ? 0 : 80);
});
await test('LEGACY', async () => {
  useDbName('spire-legacy');
  const rows = (await request('/spires/mine')).spires.map(({ takeover_id, ...r }) => r);
  await sp.syncSieges(rows); await sp.syncSieges(rows);
  assert.ok((await sp.spireState())['sp-1-1']); assert.equal(await kvGet('coins', 0), 0);
});
await test('CONTROL', async () => {
  useDbName('spire-control');
  const r = await claim('sp-2-2'); assert.ok(r.takeover_id);
  assert.equal(await sp.paySpireTakeover(r.takeover_id), 80);
  assert.equal(await sp.paySpireTakeover(r.takeover_id), 0);
  assert.equal(await kvGet('coins'), 80); assert.equal(await kvGet('coinsRev'), 80);
  const before = aborted; abortReceipt = true;
  try { await assert.rejects(sp.paySpireTakeover('aborted')); }
  finally { abortReceipt = false; }
  assert.ok(aborted > before);
  assert.equal(await kvGet('coins'), 80);
  assert.equal(await kvGet('spire-takeover:aborted', false), false);
});
sql.close(); console.log(`${passed} passed, ${failed} failed`); process.exitCode = failed ? 1 : 0;

// Source-level diagnostics only. No sockets, real network, or device storage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import './mem-idb.mjs';
import { kvGet, kvSet } from '../js/db.js';
import { autoSync, isOnline, syncHealthState } from '../js/social.js';
import { onAppResume } from '../js/native.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const cfg = JSON.parse(read('native/capacitor.config.json'));
assert.equal(cfg.server.url, 'https://tommillerca.github.io/tally/');
console.log('PASS tracked native config selects the remote HTTPS shell');

// Real signing and database modules. All transport is intercepted before I/O.
globalThis.crypto ??= webcrypto;
const realFetch = globalThis.fetch;
const requests = [];
let rejectTransport = false;
globalThis.fetch = async (url, opts) => {
  requests.push({ url, opts });
  if (rejectTransport) throw new TypeError('simulated WebView transport failure');
  const path = new URL(url).pathname;
  if (path === '/register') return Response.json({ playerId: 'local-fixture', handle: 'Fixture', friendCode: 'TEST-1234' });
  assert.ok(path === '/profile' || path === '/grants', `unexpected request: ${path}`);
  return Response.json(path === '/profile' ? { ok: true } : { cursor: 0, grants: [] });
};
try {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const identity = {
    privJwk: await crypto.subtle.exportKey('jwk', keys.privateKey),
    pubJwk: await crypto.subtle.exportKey('jwk', keys.publicKey),
  };
  await kvSet('identity', identity);
  await kvSet('backupAt', Date.now()); // isolate profile sync from backup scheduling
  let snapshots = 0;
  const snapshot = () => { snapshots++; return { level: 1 }; };
  assert.equal(await isOnline(), false);
  assert.equal((await autoSync(snapshot)).applied, 0);
  assert.equal(snapshots, 1);
  assert.deepEqual(requests.map(r => new URL(r.url).pathname), ['/register', '/profile', '/grants']);
  assert.deepEqual(JSON.parse(requests[0].opts.body).pubkey, identity.pubJwk);
  assert.deepEqual(await kvGet('identity'), identity);
  assert.equal((await syncHealthState()).entries.at(-1).hop, 'success');
  console.log('PASS identity without social registration recovers before profile sync');
  requests.length = 0;
  await kvSet('socialSyncAt', 0);

  await kvSet('social', { playerId: 'local-fixture' });
  const synced = await autoSync(snapshot, 'audit');
  assert.equal(synced.applied, 0);
  assert.deepEqual(requests.map(r => r.opts.method), ['PUT', 'GET']);
  const put = requests[0];
  const signed = `PUT\n/profile\n${put.opts.headers['x-bh-ts']}\n${put.opts.body}`;
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey,
    Buffer.from(put.opts.headers['x-bh-sig'], 'base64'), new TextEncoder().encode(signed)), true);
  assert.ok(await kvGet('socialSyncAt', 0));
  console.log('PASS CONTROL intact identity and registration produce a verifiable signed profile PUT');

  requests.length = 0;
  await kvSet('socialSyncAt', 0);
  await kvSet('identity', { privJwk: { broken: true }, pubJwk: identity.pubJwk });
  assert.equal(await isOnline(), true);
  assert.equal(await autoSync(snapshot), null);
  assert.equal(requests.length, 0);
  assert.equal(await kvGet('socialSyncAt', 0), 0);
  assert.equal((await syncHealthState()).entries.at(-1).hop, 'request-failed');
  console.log('PASS malformed stored signing key stops sync before transport and records the failure');

  await kvSet('identity', identity);
  rejectTransport = true;
  assert.equal(await autoSync(snapshot), null);
  assert.equal(requests.length, 1);
  assert.equal(await kvGet('socialSyncAt', 0), 0);
  console.log('PASS rejected transport returns null without advancing sync stamp');
} finally {
  globalThis.fetch = realFetch;
}

// Exercise the real native adapter with explicit plugin and DOM events.
let nativeEvent, visibilityEvent, resumes = 0;
globalThis.window = { Capacitor: { Plugins: { App: { addListener(name, cb) {
  assert.equal(name, 'appStateChange'); nativeEvent = cb;
} } } } };
globalThis.document = { hidden: false, addEventListener(name, cb) {
  assert.equal(name, 'visibilitychange'); visibilityEvent = cb;
} };
const realNow = Date.now;
try {
  let now = 1000;
  Date.now = () => now;
  onAppResume(() => resumes++);
  nativeEvent({ isActive: false });
  assert.equal(resumes, 0);
  nativeEvent({ isActive: true });
  visibilityEvent();
  assert.equal(resumes, 1);
  now += 501;
  visibilityEvent();
  assert.equal(resumes, 2);
  console.log('PASS native and visibility resume events share the 500ms deduplication window');
} finally {
  Date.now = realNow;
  delete globalThis.window;
  delete globalThis.document;
}

// Execute the actual SW fetch handler in a VM. This models CacheStorage,
// not WebKit registration, install atomicity, process lifetime, or eviction.
function worker(ready) {
  const handlers = {}, network = [], writes = [];
  const scope = 'https://tommillerca.github.io/tally/';
  const context = vm.createContext({
    URL, Request: class extends Request {
      constructor(input, init) {
        super(typeof input === 'string' ? new URL(input, scope) : input, init);
      }
    }, Response, Set, Map, Date,
    location: new URL(scope),
    self: { location: new URL(scope), registration: { scope, update: async () => {} },
      addEventListener: (name, cb) => { handlers[name] = cb; } },
    caches: {
      match: async key => {
        const url = typeof key === 'string' ? key : key.url;
        if (url.endsWith('/__shell-ready__')) return ready ? new Response('ready') : undefined;
        if (url.endsWith('/js/social.js')) return new Response('cached-social-fixture');
      },
      open: async () => ({ put: async (...args) => { writes.push(args); } }),
    },
    fetch: async req => {
      network.push(req.url);
      return req.url.endsWith('/version.json') ? Response.json({}) : new Response('network-social-fixture');
    },
  });
  vm.runInContext(read('sw.js'), context);
  return { handlers, network, writes, scope };
}
for (const ready of [true, false]) {
  const w = worker(ready);
  let answer;
  w.handlers.fetch({ request: new Request(w.scope + 'js/social.js'), respondWith: p => { answer = p; } });
  assert.ok(answer, 'social.js request must be handled');
  assert.equal(await (await answer).text(), ready ? 'cached-social-fixture' : 'network-social-fixture');
  assert.equal(w.network.some(url => url.endsWith('/js/social.js')), !ready);
  console.log(`PASS ${ready ? 'ready cache serves social.js without module fetch' : 'missing READY falls through to network for social.js'}`);
  for (const method of ['GET', 'PUT']) {
    let intercepted = false;
    w.handlers.fetch({ request: new Request('https://bonez-api.boneheadz.workers.dev/profile', { method }),
      respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
  }
}
console.log('PASS cross-origin API GET and PUT bypass the service worker');
console.log('9 diagnostic checks passed; device behavior remains unverified');

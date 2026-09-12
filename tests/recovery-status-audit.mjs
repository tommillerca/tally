// R57-F3: exercise the real restore entry point with in-memory HTTP responses.
// No sockets or browser. CONTROL pins both existing 404 messages.
import assert from 'node:assert/strict';
import './mem-idb.mjs';
import { kvGet, kvSet } from '../js/db.js';
import { restoreWithPhrase, setRecoveryPhrase } from '../js/social.js';

const API = 'https://recovery-audit.invalid';
await kvSet('apiBase', API);
const originalFetch = globalThis.fetch;
let response;
let calls = 0;
let expectedPath;
globalThis.fetch = async url => {
  calls++;
  assert.equal(String(url), API + expectedPath);
  if (response instanceof Error) throw response;
  return response;
};

const reply = (status, body = {}) => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
});
const noAccountClaim = /no account|no recovery data|(?:account|save).*(?:gone|lost|deleted|not found|does not exist)/i;
let checks = 0;
async function attempt(handle, next) {
  response = next;
  const before = calls;
  const result = await restoreWithPhrase(handle, 'a phrase long enough for recovery');
  assert.equal(calls, before + 1, 'each case must reach the recovery lookup exactly once');
  assert.equal(result.ok, false);
  checks++;
  return result.reason;
}
function retryable(reason) {
  assert.doesNotMatch(reason, noAccountClaim);
  assert.match(reason, /wait/i);
  assert.match(reason, /try again/i);
}

try {
  for (const [handle, pathname, missing] of [
    ['tom-bones', '/recovery/id/tom-bones', 'No account found for that recovery ID.'],
    ['BONE-AAAA-BBBB', '/recovery/BONE-AAAA-BBBB', 'No recovery data found for that friend code. If you have set a recovery ID, use that instead: a friend code only works for an account that never set one.'],
  ]) {
    expectedPath = pathname;
    const notFound = await attempt(handle, reply(404));
    assert.equal(notFound, missing, 'CONTROL: preserve the exact existing 404 copy');
    for (const status of [500, 502, 503, 599]) {
      const reason = await attempt(handle, reply(status));
      assert.notEqual(reason, notFound, `${status} must differ from 404`);
      retryable(reason);
      assert.match(reason, /server/i);
    }
    for (const status of [302, 400, 401, 403, 408]) {
      const reason = await attempt(handle, reply(status));
      assert.notEqual(reason, notFound);
      assert.doesNotMatch(reason, noAccountClaim);
      assert.match(reason, /could not|unexpected/i);
    }
    for (const [ms, wait] of [[137_000, '3m'], [1_001, '2s']]) {
      const reason = await attempt(handle, reply(429, { retryAfterMs: ms }));
      retryable(reason);
      assert.ok(reason.includes(`Wait ${wait} and try again.`), 'retain server retry timing');
    }
    retryable(await attempt(handle, reply(429)));
    const badJson = { json: async () => { throw new SyntaxError('invalid JSON'); } };
    retryable(await attempt(handle, { ...reply(429), ...badJson }));
    const network = await attempt(handle, new TypeError('Failed to fetch'));
    retryable(network);
    assert.match(network, /reach the server/i);
    const unreadable = await attempt(handle, { ...reply(200), ...badJson });
    retryable(unreadable);
    assert.match(unreadable, /response/i, 'an unreadable response is not a connection failure');
  }
  console.log(`PASS recovery-status: ${checks} cases, including 404 CONTROL, server faults, throttling, network and unexpected responses`);
} finally {
  globalThis.fetch = originalFetch;
}

// Save acknowledgement rows use the real signing, wrapping and storage path.
let failures = 0;
try {
  await kvSet('social', { playerId: 'audit-player', friendCode: 'BONE-AAAA-BBBB' });
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  await kvSet('identity', {
    privJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
    pubJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
  });
  for (const [name, body, accepted, requested = 'new-code', status = 200] of [
    ['HTML', '<html>interstitial</html>', false],
    ['empty object', {}, false],
    ['ok false', { ok: false }, false],
    ['wrong ID', { ok: true, recoveryId: 'wrong-code' }, false],
    ['missing ID', { ok: true }, false],
    ['null body', null, false],
    ['real success', { ok: true, updatedAt: 123, recoveryId: 'new-code' }, true],
    ['existing ID success', { ok: true, updatedAt: 123, recoveryId: 'old-code' }, true, null],
    ['existing ID mismatch', { ok: true, recoveryId: 'new-code' }, false, null],
    ['409 control', {}, false, 'new-code', 409],
  ]) {
    await kvSet('recoverySetAt', 17);
    await kvSet('recoveryId', 'old-code');
    let puts = 0;
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), API + '/recovery');
      assert.equal(options.method, 'PUT');
      assert.equal(JSON.parse(options.body).recoveryId, requested);
      puts++;
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
    };
    try {
      const result = await setRecoveryPhrase('a phrase long enough for recovery', requested);
      assert.equal(puts, 1);
      assert.equal(result.ok, accepted);
      if (accepted) {
        assert.ok(await kvGet('recoverySetAt') > 17);
        assert.equal(await kvGet('recoveryId'), requested || 'old-code');
        assert.equal(result.recoveryId, requested || 'old-code');
      } else {
        assert.equal(result.reason, status === 409 ? 'That recovery ID is taken. Pick another.' : 'The server did not confirm your recovery code. Try again.');
        if (status === 409) assert.equal(result.field, 'id');
        assert.equal(await kvGet('recoverySetAt'), 17);
        assert.equal(await kvGet('recoveryId'), 'old-code');
      }
      console.log(`PASS recovery save: ${name}`);
    } catch (error) {
      failures++;
      console.error(`FAIL recovery save: ${name}: ${error.message}`);
    }
  }
} finally {
  globalThis.fetch = originalFetch;
}
console.log(`recovery save: ${10 - failures} passed, ${failures} failed`);
if (failures) process.exitCode = 1;

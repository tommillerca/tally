// R57-F3: exercise the real restore entry point with in-memory HTTP responses.
// No sockets or browser. CONTROL pins both existing 404 messages.
import assert from 'node:assert/strict';
import './mem-idb.mjs';
import { kvSet } from '../js/db.js';
import { restoreWithPhrase } from '../js/social.js';

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

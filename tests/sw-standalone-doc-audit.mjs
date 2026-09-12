// Execute the production fetch listener with a ready cache. No browser or sockets.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const base = 'https://standalone.invalid/app/';
const listeners = {};
const documents = new Map([
  [base + '__shell-ready__', 'ready'],
  [base + 'index.html', 'APP DOCUMENT'],
  [base + 'privacy.html', 'PRIVACY DOCUMENT'],
]);
const context = vm.createContext({
  URL, Response, console,
  Request: class extends Request { constructor(url, options) { super(new URL(url, base), options); } },
  location: new URL(base + 'sw.js'),
  self: { location: new URL(base + 'sw.js'), addEventListener: (name, fn) => { listeners[name] = fn; } },
  caches: { match: async key => {
    const body = documents.get(new URL(typeof key === 'string' ? key : key.url, base).href);
    return body ? new Response(body) : undefined;
  } },
  fetch: async () => { throw new Error('offline'); },
});
vm.runInContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), context);
let failures = 0;
for (const [path, expected] of [
  ['privacy.html', 'PRIVACY DOCUMENT'],
  ['privacy.html?read=1', 'PRIVACY DOCUMENT'],
  ['#/today', 'APP DOCUMENT'],
  ['index.html?bhgr=123', 'APP DOCUMENT'],
  ['today', 'APP DOCUMENT'],
]) {
  try {
    let response;
    listeners.fetch({ request: { url: new URL(path, base).href, method: 'GET', mode: 'navigate' }, respondWith: p => { response = p; } });
    assert.equal(await (await response).text(), expected);
    console.log(`PASS ${expected === 'APP DOCUMENT' ? 'CONTROL app route still gets index.html' : 'standalone navigation'}: ${path}`);
  } catch (error) {
    failures++;
    console.error(`FAIL standalone navigation: ${path}: ${error.message}`);
  }
}
console.log(`standalone navigation: ${5 - failures} passed, ${failures} failed`);
if (failures) process.exitCode = 1;

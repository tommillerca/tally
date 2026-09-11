// Node proof of the production clock policy. Browser order is graded separately.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = process.argv.find(a => a.startsWith('--source='))?.slice(9);
const app = readFileSync(source || new URL('../js/app.js', import.meta.url), 'utf8');
const now = Date.parse('2026-09-09T12:00:00Z');
class Clock extends Date { static now() { return now; } }
const fn = name => {
  const code = app.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'))?.[0];
  assert.ok(code, `CONTROL production ${name} exists`);
  return code;
};
const ctx = vm.createContext({ Date: Clock });
vm.runInContext(fn('onlineLabel') + '\n' + fn('snapshotNotice'), ctx);
const state = stamp => {
  ctx.stamp = stamp;
  return JSON.parse(JSON.stringify(vm.runInContext('onlineLabel(stamp)', ctx)));
};
let passed = 0, failed = 0;
function check(label, run) {
  try { run(); passed++; console.log(`PASS ${label}`); }
  catch (e) { failed++; console.error(`FAIL ${label}: ${e.message}`); }
}
check('fresh timestamps do not claim presence', () => {
  for (const age of [0, 60000, 359999])
    assert.deepEqual(state(now - age), { on: true, fresh: true, text: '' });
});
check('CONTROL minute and hour comparison eligibility remains', () => {
  for (const [age, text] of [[360000, 'Synced 6m ago'], [3599999, 'Synced 59m ago'], [3600000, 'Synced 1h ago'], [86399999, 'Synced 23h ago']])
    assert.deepEqual(state(now - age), { on: false, fresh: true, text: '' });
});
check('CONTROL day-old comparisons disabled without notices', () => {
  for (const age of [86400000, 7 * 86400000]) {
    assert.deepEqual(state(now - age), { on: false, fresh: false, text: '' });
    ctx.stamp = now - age;
    assert.equal(vm.runInContext('snapshotNotice([{lastSeen: stamp}])', ctx),
      '');
  }
});
check('CONTROL missing, invalid and future clocks remain unknown', () => {
  for (const stamp of [undefined, null, 0, -1, NaN, Infinity, 'yesterday', now + 1, now + 86400000])
    assert.deepEqual(state(stamp), { on: false, fresh: false, text: '' });
});
check('no player presence claims or freshness wording in shipped social renderers', () => {
  const crew = app.slice(app.indexOf('function crewCardHtml('), app.indexOf('function openFriendProfile('));
  assert.doesNotMatch(crew, /Online now|Synced|recent syncs|Sync time unavailable|Showing last shared snapshots|cfan-live|live-dot/);
  assert.match(crew, /Filter: favourites/);
  assert.match(crew, /!fanFavouritesOnly \|\| favs.has\(f.playerId\)/);
  assert.match(crew, /Tap the star to favourite/);
});
console.log(`CREW PRESENCE: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;

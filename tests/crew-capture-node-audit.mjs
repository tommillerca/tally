/* PURE routing proof only. CONTROL samples are emitted by shipped renderers in
 * Node DOM doubles. No layout, image decode, compositing or screenshot claims.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { crewFixture, assertDemoPage } from './lib/crew-capture.mjs';
import { studioCrewAppearance } from '../js/studio.js';
import { raceStanding, raceClockLabel } from '../js/social.js';
const source = process.argv.find(a => a.startsWith('--source='));
const app = readFileSync(source ? source.slice(9) : new URL('../js/app.js', import.meta.url), 'utf8');
const fn = name => {
  const code = app.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'))?.[0];
  assert.ok(code, `Missing production function ${name}`); return code;
};
const nested = name => {
  const code = app.slice(app.indexOf('async function renderFriends(el)')).match(new RegExp(`^  const ${name} = [^]*?^  };`, 'm'))?.[0];
  assert.ok(code, `Missing production closure ${name}`); return code;
};
const now = Date.now();
let passes = 0;
async function check(label, test) { await test(); console.log(`PASS ${label}`); passes++; }
const safety = overrides => vm.createContext({ URL, location: { href: 'http://localhost:8765/?demo' },
  navigator: { webdriver: true }, indexedDB: { databases: async () => [{ name: 'tally-demo' }] },
  document: { querySelector: () => ({}) }, ...overrides });
await check('CONTROL safety accepts local booted webdriver demo', async () => {
  await vm.runInContext(`(${assertDemoPage})()`, safety());
});
for (const [name, override] of [
  ['real save despite existing demo DB', { location: { href: 'http://localhost:8765/' } }],
  ['production demo', { location: { href: 'https://boneheadz.com/?demo' } }],
  ['non-webdriver', { navigator: { webdriver: false } }],
  ['missing demo DB', { indexedDB: { databases: async () => [] } }],
  ['API override', { location: { href: 'http://localhost:8765/?demo&api=https://example.com' } }],
  ['unbooted demo', { document: { querySelector: () => null } }],
]) await check(`CONTROL refuses ${name}`, async () => {
  await assert.rejects(vm.runInContext(`(${assertDemoPage})()`, safety(override)), /Refusing capture/);
});
async function harness(scenario, webdriver = true) {
  const fixture = crewFixture({ scenario, now }), nodes = new Map();
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, { innerHTML: '', textContent: '', hidden: false, isConnected: true, events: {},
      classList: { toggle() {} }, remove() {}, setAttribute() {}, addEventListener(k, f) { this.events[k] = f; } });
    return nodes.get(key);
  };
  let socialCalls = 0;
  const fallback = async () => { socialCalls++; throw new Error('CONTROL reached server fallback'); };
  const ctx = vm.createContext({ studioCrewAppearance, studioCrew: [], studioCrewOwner: null, me: fixture.me, console, Date, fixture, window: {}, navigator: { webdriver: true }, el: {},
    URL, location: { href: 'http://localhost:8765/?demo' }, indexedDB: { databases: async () => [{ name: 'tally-demo' }] }, document: { querySelector: () => ({}) },
    $: node, $$: () => [], esc: String, nameWithAlias: f => f.alias || f.name,
    ICONS: new Proxy({}, { get: () => () => '<i></i>' }), badgePixHtml: () => '<i></i>',
    BH_BY_ID: { 'B0-1': {}, 'SK0-1': {} },
    avatarLayersHtml: eq => eq?.B && eq?.SK ? '<span class="bh-anim"><img src="control.png"></span>' : '', lbHeadInner: () => '',
    social: { listFriends: fallback, leaderboard: fallback, fetchStepRace: fallback, raceStanding, raceClockLabel, displayName: async () => fixture.me.name },
    apiConfigured: false, kvGet: async (k, d) => k === 'racePushAt' ? now : k === 'raceDebutWk' ? '2020-01-01' : d,
    kvSet: async () => {}, setCrewBadgeFrom: async () => {}, friendSinceYesterdayMap: async () => ({}),
    equipped: async () => fixture.leaderboard[2].outfit, RACE_LIVE: true, RACE_DAYS: 7,
    dateKey: () => '2026-09-09', raceWeekKey: () => '2026-09-07',
    weekStepsNow: async () => ({ weekKey: '2026-09-07', steps: 18000 }), ordinal: n => `${n}th`,
    composeAvatars() {}, openSheet() {}, paintFaves() {}, applyFan() {},
    fanMatches: () => true, fanRank: id => Number(id.split('-')[1]),
  });
  await vm.runInContext(`(${assertDemoPage})(fixture)`, ctx);
  ctx.navigator.webdriver = webdriver;
  // Execute the exact browser hook branch rather than injecting its local data.
  const meBranch = app.slice(app.indexOf('  const me = (apiConfigured', app.indexOf('async function renderFriends')), app.indexOf('  const clUnseen', app.indexOf('async function renderFriends')));
  assert.ok(meBranch.includes('window.__testMe'));
  const fetchBranch = app.match(/^  const fetchLb = async \(\) => [^]*?;$/m)?.[0];
  assert.ok(fetchBranch?.includes('window.__testLb'));
  vm.runInContext(`let data = { friends: [], incoming: [], outgoing: [] }, lbData = null;
    let favs = new Set(), fanOrder = [], centerId = null, fanQuery = '', fanFavouritesOnly = false;
    ${app.match(/^  let fanPaintRevision = 0;$/m)?.[0] || ''}
    const fanFriend = id => data.friends.find(f => f.playerId === id);
    ${['leaderboardLastOnline', 'onlineLabel', 'snapshotNotice', 'crewCardHtml', 'crewCount', 'crewTruncText', 'requestRowsHtml'].map(fn).join('\n')}
    ${fetchBranch}
    ${['resortFan', 'paintFan', 'paint', 'openLeaderboard', 'raceFreshHtml', 'hydrateRace'].map(nested).join('\n')}
    globalThis.run = async () => { ${meBranch}
      if (!me) throw new Error('No fixture identity');
      await paint(); await paintFan(); await openLeaderboard(); await hydrateRace(); return me;
    };`, ctx);
  return { ctx, node, fixture, calls: () => socialCalls };
}
for (const scenario of ['degraded', 'fresh', 'one-stale', 'all-stale', 'unknown']) await check(`CONTROL ${scenario}: installed hooks reach real paint, paintFan, openLeaderboard and hydrateRace`, async () => {
  const h = await harness(scenario);
  const me = await vm.runInContext('run()', h.ctx);
  assert.equal(me.playerId, 'capture-self');
  assert.equal((h.node('#cfanDeck').innerHTML.match(/class="cfan-card"/g) || []).length, 7);
  assert.match(h.node('#cfanDeck').innerHTML, /Marrow Max/);
  assert.equal((h.node('#lbBody').innerHTML.match(/class="lb-row/g) || []).length, 5);
  assert.match(h.node('#lbBody').innerHTML, /lb-tag you/);
  const race = h.node('#raceCard').innerHTML;
  assert.equal((race.match(/class="race-lane /g) || []).length, 5);
  assert.match(race, /race-lane r3 you/);
  assert.equal((race.match(/class="run"/g) || []).length, 5, 'Every row retains its figure container, including stale rows');
  assert.equal((race.match(/class="(?:track|race-pending-track)"/g) || []).length, 5, 'Every row retains a track');
  if (scenario === 'degraded') {
    assert.equal(h.fixture.data.friends[6].profile, null);
    assert.ok(!h.fixture.race.players.some(p => p.playerId === 'capture-6'), 'Never-synced friend is absent from the server race');
    assert.match(race, /Placeholder figure: outfit not shared/);
    assert.match(race, /Progress comparison unavailable/);
    const lanes = [...race.matchAll(/class="race-lane [^]*?<i style="width:([\d.]+)%"/g)];
    for (const [i, p] of h.fixture.race.players.entries()) {
      h.ctx.laneStamp = p.seenAt;
      const fresh = vm.runInContext('onlineLabel(laneStamp).fresh', h.ctx);
      assert.equal(Number(lanes[i][1]) > 0, fresh, 'Only the lane awaiting sync has no fill');
      assert.equal(lanes[i][0].includes('race-pending-track'), !fresh);
    }
    assert.match(race, /24,000/);
  }
  assert.equal(h.calls(), 0);
});
await check('CONTROL missing __testFriends hits the real social fallback', async () => {
  const h = await harness('fresh'); delete h.ctx.window.__testFriends;
  await assert.rejects(vm.runInContext('run()', h.ctx), /reached server fallback/);
  assert.equal(h.calls(), 1);
});
await check('CONTROL fresh partial outfits get drawable placeholder layers', async () => {
  const h = await harness('fresh');
  h.fixture.race.players[0].outfit = {};
  h.fixture.race.players[1].outfit = null;
  await vm.runInContext('run()', h.ctx);
  const race = h.node('#raceCard').innerHTML;
  assert.equal((race.match(/class="bh-anim"/g) || []).length, 6, 'Summary plus all five figures receive body and skull');
  assert.equal((race.match(/Placeholder figure: outfit not shared/g) || []).length, 2);
});
await check('CONTROL defensive zero and tiny counts never receive a minimum fill', async () => {
  const h = await harness('fresh');
  // Remote /steps/week excludes zero. This is a defensive renderer boundary,
  // not a claim that the server emits zero-step or never-synced racers.
  h.fixture.race.players[3].steps = 1;
  h.fixture.race.players[4].steps = 0;
  await vm.runInContext('run()', h.ctx);
  const race = h.node('#raceCard').innerHTML;
  assert.match(race, /width:0%/);
  assert.ok(race.includes(`width:${1 / 24000 * 100}%`));
  assert.match(race, /0 recorded steps/);
});
await check('CONTROL hooks cannot route without webdriver', async () => {
  await assert.rejects(vm.runInContext('run()', (await harness('fresh', false)).ctx), /No fixture identity/);
});
console.log(`CREW CAPTURE NODE: ${passes} passed; browser geometry UNPROVEN`);

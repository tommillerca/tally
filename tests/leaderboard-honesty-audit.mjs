/* Frozen leaderboard honesty proof. Executes shipped renderers with Node DOM
 * doubles and a fixed clock. No sockets, live API, or browser/pixel claims.
 * --source=/path/to/app.js runs these same assertions against a baseline.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as paddock from '../js/paddock.js';
import { raceStanding, raceClockLabel } from '../js/social.js';
const arg = process.argv.find(a => a.startsWith('--source='));
const app = readFileSync(arg ? arg.slice(9) : new URL('../js/app.js', import.meta.url), 'utf8');
const now = Date.parse('2026-09-09T12:00:00Z'), DAY = 86400000;
class Clock extends Date { static now() { return now; } }
const fn = name => app.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'))?.[0] || '';
const nested = name => app.match(new RegExp(`^  const ${name} = [^]*?^  };`, 'm'))?.[0] || '';
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
let passed = 0, failed = 0;
async function check(label, run) {
  try { await run(); passed++; console.log(`PASS ${label}`); }
  catch (e) { failed++; console.log(`FAIL ${label}: ${e.message}`); }
}
function harness(age, fleet = false) {
  const p = { playerId: 'pal', name: 'Pal', addToken: 'token', level: 8, levelName: 'Bones', steps: 12345, rank: 1, lastSeen: now - age, seenAt: now - age,
    joinedAt: now - 30 * DAY, outfit: {}, stats: {}, badges: 2, spires: 1 };
  const me = { ...p, playerId: 'me', name: 'Me', rank: 2, steps: 10000, you: true, lastSeen: now - (fleet ? 3 * DAY : 60000), seenAt: now - (fleet ? 3 * DAY : 60000) };
  const friend = { ...p, profile: { ...p, yard: { n: 3, pets: [{ sp: 'C4' }] } } };
  const data = { friends: [friend, { ...friend, playerId: 'other', lastSeen: me.lastSeen }], incoming: [friend], outgoing: [], truncated: {} };
  const nodes = new Map(); let sheet = '';
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, { innerHTML: '', textContent: '', hidden: false, isConnected: true, dataset: {}, events: {},
      addEventListener(event, cb) { this.events[event] = cb; }, classList: { toggle() {} }, setAttribute() {}, remove() {} });
    return nodes.get(key);
  };
  const ctx = vm.createContext({ Date: Clock, console, data, el: {}, f: friend, paddock,
    isMorph: () => false, paddockSceneHtml: () => '<div>Shared paddock scene</div>',
    esc: String, nameWithAlias: f => f.name, ICONS: new Proxy({}, { get: () => () => '' }),
    badgePixHtml: () => '', avatarLayersHtml: () => '<i class="avatar-control"></i>', lbAvatar: () => '<i class="avatar-control"></i>',
    lbHeadInner: () => '', BH_BY_ID: {}, STAT_META: [], hasFightableStats: () => false,
    openSheet: html => { sheet = html; return {}; }, $: node, $$: () => [], composeAvatars() {},
    fetchLb: async () => [p, me], favs: new Set(), centerId: 'pal', fanFriend: () => friend,
    kvGet: async (key, fallback) => key === 'racePushAt' ? now : key === 'raceDebutWk' ? '2026-08-01' : fallback,
    kvSet: async () => {}, equipped: async () => ({}), dateKey: () => '2026-09-09', raceWeekKey: () => '2026-09-07',
    RACE_LIVE: true, RACE_DAYS: 7, navigator: { webdriver: false }, window: {}, raceFixture: { players: [p, me], yourRank: 2 },
    weekStepsNow: async () => ({ weekKey: '2026-09-07', steps: 10000 }), ordinal: n => `${n}th`,
    social: { raceStanding, raceClockLabel, displayName: async () => 'Me' },
    S: {}, REQUEST_SENT_MSG: 'Request sent.', friendRowAvatar: () => '<i></i>',
    crewCount: a => String(a.length), crewTruncText: () => '',
  });
  ctx.social.fetchStepRace = async () => ctx.raceFixture;
  vm.runInContext(['relativeAgo', 'leaderboardLastOnline', 'onlineLabel', 'snapshotNotice', 'snapshotDetail', 'crewCardHtml', 'requestRowsHtml', 'openFriendProfile'].map(fn).join('\n') + '\n'
    + ['paintFanSel', 'openLeaderboard', 'hydratePodium', 'raceFreshHtml', 'hydrateRace', 'hydrateNewcomers'].map(nested).join('\n'), ctx);
  vm.runInContext(fn('openFriendPaddock').replace("await import('./paddock.js')", 'paddock'), ctx);
  return { ctx, p, friend, nodes, node, sheet: () => sheet };
}
const scenarios = [['fresh', 60000, false], ['day-old', DAY, false], ['week-old', 7 * DAY, false], ['fleet-stale', 7 * DAY, true]];
for (const [label, age, fleet] of scenarios) {
  const expected = age < DAY ? 'Online now' : 'Awaiting a recent sync';
  for (const surface of ['leaderboard', 'fan card', 'fan selection', 'requests', 'profile', 'podium', 'newcomers', 'race', 'paddock']) {
    await check(`${label}: ${surface}`, async () => {
      const h = harness(age, fleet); let html;
      if (surface === 'leaderboard') { await vm.runInContext('openLeaderboard()', h.ctx); html = h.node('#lbBody').innerHTML; }
      if (surface === 'fan card') html = vm.runInContext('crewCardHtml(f, "Just took a spire")', h.ctx);
      if (surface === 'fan selection') { vm.runInContext('paintFanSel()', h.ctx); html = h.node('#cfanSel').innerHTML;
        const block = app.slice(app.indexOf('    const unreached = data.reached === false;'), app.indexOf("    const unrBox = $('#cfanUnreached', el);"));
        vm.runInContext(block, h.ctx); html += h.node('#cfanSnapshot').textContent; }
      if (surface === 'requests') html = vm.runInContext('requestRowsHtml(data)', h.ctx);
      if (surface === 'profile') { vm.runInContext('openFriendProfile(f, null, { stranger: true })', h.ctx); html = h.sheet(); }
      if (surface === 'podium') { await vm.runInContext('hydratePodium()', h.ctx); html = h.node('#lbPodium').innerHTML + h.node('#lbWait').textContent + h.node('#lbYouAre').innerHTML; }
      if (surface === 'newcomers') { h.ctx.data.friends = []; await vm.runInContext('hydrateNewcomers()', h.ctx); html = h.node('#newcomersList').innerHTML; }
      if (surface === 'paddock') { await vm.runInContext('openFriendPaddock(f)', h.ctx); html = h.sheet(); }
      if (surface === 'race') { await vm.runInContext('hydrateRace()', h.ctx); html = h.node('#raceCard').innerHTML; }
      const copy = text(html);
      assert.ok(copy.includes('Pal'), 'CONTROL player stays reachable');
      /* v589 re-anchor. Tom, 2026-09-12: "there is way too much UTC timezone
         chatter text on the leader board now ... it should just say \"logged
         on 2 hours ago or 2 days ago etc\"". The leaderboard row now carries
         ONE relative phrase and never a date, a clock time or UTC. Every other
         surface keeps the old bans. */
      assert.doesNotMatch(copy, /Synced|recent sync|sync time|awaiting.*sync|Showing last shared snapshots/i);
      if (surface === 'leaderboard') {
        assert.match(copy, /online now|\d+ (minutes?|hours?|days?|weeks?) ago|yesterday/i, 'leaderboard carries a relative last-seen phrase');
        assert.doesNotMatch(copy, /UTC|\d{4}-\d{2}-\d{2}|\b\d{2}:\d{2}\b|Last online:/i, 'leaderboard carries no timestamp');
      } else {
        assert.doesNotMatch(copy, /last seen|\b\d+d ago|\byesterday\b|Online now/i);
        assert.doesNotMatch(copy, /\bonline\b/i);
      }
      assert.doesNotMatch(html, /cfan-live|live-dot/);
      if (['podium', 'requests'].includes(surface)) assert.match(copy, /last shared/i);
      if (surface === 'race') {
        assert.match(copy, /12,345/); // CONTROL saved count retained, never fabricated.
        if (age >= DAY) assert.doesNotMatch(copy, /\b2,345|minutes.*walking|You are.*behind/);
        else assert.match(copy, /2,345/); // CONTROL fresh comparisons still work.
        const lane = h.node('#raceCard').events.click;
        assert.equal(typeof lane, 'function', 'CONTROL profile navigation still wired');
        h.ctx.openFriendProfile = f => { h.opened = f; };
        lane({ target: { closest: () => ({ dataset: { raceview: 'pal' } }) } });
        assert.equal(h.opened.lastSeen, h.p.seenAt, 'race profile must retain snapshot time');
      }
      if (surface === 'fan card' && age >= DAY) assert.doesNotMatch(copy, /Just took|Holds .* now/);
    });
  }
}
for (const [label, age] of scenarios) await check(`${label}: favourites filter`, () => {
  const h = harness(age);
  h.ctx.data.friends = [h.friend];
  if (age < DAY) h.ctx.favs.add(h.friend.playerId);
  const start = app.indexOf("      noHit.textContent = !empty ? ''");
  const end = app.indexOf(";", start) + 1;
  assert.ok(start > 0 && end > start, 'CONTROL real empty-filter message exists');
  vm.runInContext(`let fanOrder = [], centerId = null; const fanQuery = '', fanFavouritesOnly = true;
    const fanMatches = () => true, fanRank = () => 1;
    ${nested('resortFan')}; resortFan();
    const noHit = {}, empty = fanOrder.length === 0;
    ${app.slice(start, end)}; globalThis.filterResult = { count: fanOrder.length, copy: noHit.textContent };`, h.ctx);
  if (age < DAY) assert.equal(h.ctx.filterResult.count, 1, 'CONTROL fresh friend is selectable');
  else { assert.equal(h.ctx.filterResult.count, 0); assert.equal(h.ctx.filterResult.copy, 'No favourites in this selection. Tap Filter: favourites to see everyone.'); }
});
for (const [label, age, fleet] of scenarios) await check(`${label}: map race strip`, () => {
  const h = harness(age, fleet);
  const start = app.indexOf('          const rows = (race && race.players) || [];', app.indexOf('async function refreshEggStrip()'));
  const end = app.indexOf('\n        }\n      } catch { mapRace', start);
  assert.ok(start > 0 && end > start, 'CONTROL map race production block exists');
  const code = `let mapRace; const race = raceFixture; ${app.slice(start, end)}; mapRace`;
  const copy = text(vm.runInContext(code, h.ctx));
  if (age < DAY) { assert.match(copy, /Last shared/); assert.match(copy, /2,345 behind Pal/); }
  else { assert.equal(copy, 'Step race updates may be delayed.'); assert.doesNotMatch(copy, /\d|behind|hold it/); }
});
await check('CONTROL pending rows do not invent sync times', () => {
  const h = harness(0);
  h.ctx.data.incoming = [];
  h.ctx.data.outgoing = [{ playerId: 'pending', name: 'Pending Pal' }];
  const copy = text(vm.runInContext('requestRowsHtml(data)', h.ctx));
  assert.match(copy, /Waiting for them to add you back/);
  assert.doesNotMatch(copy, /Synced|ago|online|undefined|NaN/);
});
await check('CONTROL empty race and stale own row do not imply player inactivity', async () => {
  const h = harness(60000);
  h.ctx.raceFixture = { players: [], yourRank: null };
  h.ctx.weekStepsNow = async () => ({ weekKey: '2026-09-07', steps: 0 });
  await vm.runInContext('hydrateRace()', h.ctx);
  assert.match(text(h.node('#raceCard').innerHTML), /No steps have reached this board yet/);
  assert.doesNotMatch(text(h.node('#raceCard').innerHTML), /Nobody has walked/);
  h.ctx.raceFixture = { players: [{ ...h.p, you: true, seenAt: now - DAY }], yourRank: 1 };
  await vm.runInContext('hydrateRace()', h.ctx);
  assert.match(text(h.node('#raceCard').innerHTML), /Standings await recent updates/);
  assert.doesNotMatch(h.node('#raceCard').innerHTML, /class="track"/);
  h.ctx.raceFixture.players[0].seenAt = null;
  await vm.runInContext('hydrateRace()', h.ctx);
  assert.doesNotMatch(text(h.node('#raceCard').innerHTML), /sync|online/i);
  assert.doesNotMatch(text(h.node('#raceCard').innerHTML), /On this phone/);
});
await check('CONTROL timestamp boundaries and unavailable clocks', () => {
  const { ctx } = harness(0);
  for (const value of [null, 0, -1, NaN, Infinity, now + 1, 'yesterday']) {
    ctx.stamp = value;
    const state = vm.runInContext('onlineLabel(stamp)', ctx);
    assert.equal(state.on, false); assert.equal(state.text, '');
  }
  for (const [age, expected] of [[0, 'Online now'], [6 * 60000, 'Synced 6m ago'], [3600000, 'Synced 1h ago'], [DAY - 1, 'Synced 23h ago'], [DAY, 'Awaiting a recent sync']]) {
    ctx.stamp = now - age;
    assert.equal(vm.runInContext('onlineLabel(stamp).text', ctx), '');
  }
});
await check('CONTROL shared notice is bounded to available snapshots', () => {
  const { ctx } = harness(0);
  assert.equal(vm.runInContext('snapshotNotice([])', ctx), '');
  assert.equal(vm.runInContext('snapshotNotice([{lastSeen: null}])', ctx), '');
  assert.doesNotMatch(vm.runInContext('snapshotNotice([{lastSeen: Date.now()}, {lastSeen: 1}])', ctx), /No recent updates/);
});
await check('filter copy and stale fan notice are wired', () => {
  assert.ok(app.includes('aria-label="Filter: show only favourite friends"'), 'favourites filter label');
  assert.ok(app.includes('No favourites in this selection. Tap Filter: favourites to see everyone.'), 'honest empty filter');
  assert.ok(app.includes('snapshotNotice(data.friends)'), 'shared Crew notice');
  assert.ok(!app.includes('Their stats will show once they next open the app'), 'no promise that app open fixes stats');
});
// Step race regression: execute hydrateRace itself, including its lane markup.
for (const staleAbove of [false, true]) await check(`mixed race: fresh lanes and own standing (stale above=${staleAbove})`, async () => {
  const h = harness(60000);
  const me = h.ctx.raceFixture.players[1];
  h.ctx.raceFixture.players.push({ ...h.p, playerId: 'idle', name: 'Idle', rank: 3, steps: 5000, seenAt: now - 3 * DAY });
  if (staleAbove) h.p.seenAt = now - DAY;
  await vm.runInContext('hydrateRace()', h.ctx);
  const html = h.node('#raceCard').innerHTML;
  const lanes = [...html.matchAll(/class="race-lane [^]*?<i style="width:([\d.]+)%"/g)];
  assert.equal(lanes.length, 3, 'CONTROL all three production lanes rendered');
  assert.ok(Number(lanes[1][1]) > 0, 'fresh own lane must have a non-zero computed bar');
  assert.equal(Number(lanes[2][1]), 0, 'stale lane must have zero computed width');
  assert.match(lanes[2][0], /race-pending-track/);
  assert.equal(Number(lanes[0][1]) > 0, !staleAbove);
  assert.match(html, /Last shared standings: You are <b>2th<\/b>/);
  assert.doesNotMatch(html, /Showing last shared snapshots/);
  assert.equal(/At the recorded standings, you were/.test(html), !staleAbove, 'gap requires both own and adjacent row fresh');
  me.seenAt = now - DAY;
  await vm.runInContext('hydrateRace()', h.ctx);
  const staleOwn = h.node('#raceCard').innerHTML;
  assert.match(staleOwn, /Standings await recent updates/);
  assert.doesNotMatch(staleOwn, /At the recorded standings, you were/);
});
console.log(`LEADERBOARD HONESTY: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;

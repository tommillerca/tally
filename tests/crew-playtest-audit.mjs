/* Frozen Crew playtest. Real services over mem-idb and real app source blocks.
 * CONTROL rows exercise successful delivery, requests, profiles and cheers.
 * No sockets, browser, disk writes or pixel claims. --known-issues runs the
 * unfixed sender-loss reproductions and intentionally exits nonzero.
 */
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { db, kvGet, kvSet, useDbName } from '../js/db.js';
import * as social from '../js/social.js';
import { coins, coinsAdd, spendCoins } from '../js/loot.js';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const CHEERS = new Function(app.match(/^const CHEERS = \[[^]*?^\];/m)[0] + '\nreturn CHEERS;')();
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const icons = new Proxy({}, { get: () => () => '<i></i>' });
const f = { playerId: 'friend', name: 'Friendly Bones' };
let passed = 0, failed = 0, seq = 0, responder, calls = [];
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const identity = { privJwk: await crypto.subtle.exportKey('jwk', kp.privateKey), pubJwk: await crypto.subtle.exportKey('jwk', kp.publicKey) };
globalThis.fetch = async (url, opts) => {
  assert(String(url).startsWith('https://crew-audit.invalid/'), 'unexpected network target');
  const request = { path: new URL(url).pathname, body: opts.body ? JSON.parse(opts.body) : null };
  calls.push(request);
  return responder(request, url);
};
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
async function seed() {
  useDbName(`crew-playtest-${++seq}`);
  await kvSet('apiBase', 'https://crew-audit.invalid');
  await kvSet('identity', identity);
  await kvSet('social', { playerId: 'me' });
  calls = [];
  responder = () => { throw new Error('offline'); };
}
function cut(start, end) {
  const a = app.indexOf(start), b = app.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `CONTROL missing production block: ${start}`);
  return app.slice(a, b);
}
async function run(code, deps = {}) {
  const all = { social, db, kvGet, kvSet, coins, coinsAdd, spendCoins, esc, ICONS: icons,
    S: { sounds: false }, f, CHEERS, toast() {}, popSound() {}, coinSound() {},
    chimeSound() {}, confettiRain() {}, confettiBurst() {}, innerWidth: 390, innerHeight: 844,
    REQUEST_SENT_MSG: 'Request sent. Waiting for them to accept.', ...deps };
  return new AsyncFunction(...Object.keys(all), code)(...Object.values(all));
}
function node(dataset = {}) {
  return { dataset, disabled: false, textContent: '', innerHTML: '', hidden: false,
    events: {}, classList: { add() {} }, addEventListener(type, fn) { this.events[type] = fn; },
    remove() { this.removed = true; } };
}
async function test(name, fn) {
  try { await seed(); await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
const gift = (i, coins = 25) => ({ id: i + 1, key: `crew-gift-${i}`, type: 'gift', payload: { coins, from: f.name, note: `${f.name} sent you a gift!` }, ts: 1000 + i });

async function giftSheet() {
  const nodes = Object.fromEntries(['#giftFree', '#giftFreeCard', '#giftBal'].map(s => [s, node()]));
  const chips = [25, 50, 100, 250, 500].map(amt => node({ amt: String(amt) }));
  let html;
  const messages = [];
  await run(cut('async function openGiftSheet(f)', '// Send-a-cheer sheet:') + '\nawait openGiftSheet(f);', {
    dateKey: () => '2026-09-08', openSheet: s => { html = s; return {}; },
    $: s => nodes[s], $$: () => chips, armToConfirm: (b, label, fn) => { b.confirm = fn; },
    giftRewardLabel: r => `${r.coins} coins`, toast: m => messages.push(m),
  });
  return { nodes, chips, html, messages };
}

if (process.argv.includes('--known-issues')) {
  await test('UNFIXED sender termination after debit leaves no recoverable gift intent', async () => {
    await kvSet('coins', 500);
    const h = await giftSheet();
    let reached, rejectRequest;
    const sent = new Promise(r => { reached = r; });
    // Pending response models termination after the persisted debit. No socket.
    responder = () => { reached(); return new Promise((resolve, reject) => { rejectRequest = reject; }); };
    const attempt = h.chips[3].confirm();
    await sent;
    const balanceAtTermination = await coins();
    const stored = (await db.all('kv')).filter(r => /gift|send/i.test(r.k));
    rejectRequest(new Error('stopped response')); // Clean up the surviving harness after recording the boundary.
    await attempt;
    console.log(`OBSERVED termination boundary: balance=${balanceAtTermination}, gift/send records=${JSON.stringify(stored)}`);
    assert.equal(balanceAtTermination, 500, '250 debited before delivery, without a persisted retry/refund intent');
  });

} else {
  await test('C6 simultaneous confirmed chips cannot deliver more than the wallet', async () => {
    await kvSet('coins', 500);
    const h = await giftSheet();
    let delivered = 0;
    responder = ({ body }) => { delivered += body.coins; return reply(200, { ok: true }); };
    await Promise.all([h.chips[3].confirm(), h.chips[4].confirm()]);
    console.log(`OBSERVED concurrent sends: delivered=${delivered}, balance=${await coins()}`);
    assert(delivered <= 500, `${delivered} delivered from a 500-coin wallet`);
    assert.equal(delivered + await coins(), 500);
    assert.equal(calls.length, 1, 'one affordable gift must reach the service');
  });
  await test('C1 every one of 101 pulled gifts remains openable after cursor advance', async () => {
    const grants = Array.from({ length: 101 }, (_, i) => gift(i));
    // The production Worker returns at most 50 rows per pull.
    responder = (request, url) => {
      assert.equal(request.path, '/grants');
      const since = Number(new URL(url).searchParams.get('since'));
      const batch = grants.filter(g => g.id > since).slice(0, 50);
      return reply(200, { grants: batch, cursor: batch.at(-1)?.id || since });
    };
    for (let i = 0; i < 3; i++) await social.pullGrants();
    assert.equal(calls.length, 3);
    assert.equal(await kvGet('grantCursor'), 101);
    assert.equal((await social.giftBox()).length, 101, 'sealed gifts were discarded');
    for (const g of grants) assert(await social.openGift(g.key), `lost ${g.key}`);
    assert.equal(await coins(), 2525);
    assert.equal((await social.giftBox()).length, 0);
  });
  await test('CONTROL concurrent ingest and open pay one receipt per gift', async () => {
    await Promise.all([social.__testApplyGrant(gift(1)), social.__testApplyGrant(gift(2)), social.__testApplyGrant(gift(1))]);
    assert.equal((await social.giftBox()).length, 2);
    const opened = await Promise.all([social.openGift(gift(1).key), social.openGift(gift(1).key)]);
    assert.equal(opened.filter(Boolean).length, 1);
    assert.equal(await coins(), 25);
    await social.__testApplyGrant(gift(1));
    assert.deepEqual((await social.giftBox()).map(g => g.key), [gift(2).key]);
  });
  await test('C2 aborted reward write leaves the OPEN control retryable', async () => {
    await social.__testApplyGrant(gift(1));
    const b = node({ gift: gift(1).key });
    const messages = [], revealed = [];
    let paints = 0;
    await run(cut("        $$('[data-gift]', giftList).forEach", '        giftCard.hidden = false;'), {
      giftList: {}, $$: () => [b], toast: m => messages.push(m),
      setTimeout: fn => { fn(); }, revealGift: g => revealed.push(g),
      paintDeliveries: async () => { paints++; }, refreshCrewBadge: async () => {},
    });
    // Abort the actual reward transaction, preserving all production readers.
    const open = indexedDB.open;
    indexedDB.open = function (...args) {
      const req = open(...args);
      let success;
      Object.defineProperty(req, 'onsuccess', { get: () => event => {
        const tx = req.result.transaction.bind(req.result);
        req.result.transaction = (...args) => {
          const t = tx(...args);
          if (Array.isArray(args[0]) && args[0].includes('xp') && args[1] === 'readwrite') t.abort();
          return t;
        };
        success?.(event);
      }, set: fn => { success = fn; } });
      return req;
    };
    useDbName(`crew-playtest-${seq}`); // Reopen same persisted in-memory database.
    let error;
    try { await b.events.click(); } catch (e) { error = e; }
    indexedDB.open = open;
    useDbName(`crew-playtest-${seq}`);
    assert.equal((await social.giftBox()).length, 1);
    assert.equal(await coins(), 0);
    assert(!error, `handler rejected: ${error?.message}`);
    assert.notEqual(b.dataset.busy, '1', 'OPEN remains busy after aborted write');
    assert(messages.some(m => /try again/i.test(m)), 'no retry message');
    await b.events.click();
    assert.equal(await coins(), 25);
    assert.equal(revealed.length, 1);
    assert.equal(paints, 1);
  });
  async function submit(response) {
    responder = () => response;
    const input = { value: ' bone-test-code ' }, button = node(), messages = [];
    let paints = 0;
    await run(cut('  const submitCode = async () => {', '  const shareCode =') + '\nawait submitCode();', {
      el: {}, $: s => s === '#friendCode' ? input : button,
      toast: m => messages.push(m), paint: async () => { paints++; },
    });
    assert.equal(calls.at(-1).body.code, 'BONE-TEST-CODE');
    assert.equal(button.disabled, false);
    return { input, messages, paints };
  }
  await test('C3 transient server refusal never says a valid friend code does not exist', async () => {
    for (const status of [401, 429, 500]) {
      const h = await submit(reply(status, { error: 'temporarily unavailable' }));
      assert(!h.messages.some(m => /no bonehead|double-check/i.test(m)), `${status}: ${h.messages.join(' ')}`);
      assert(h.messages.some(m => /try again/i.test(m)));
      assert(h.input.value.trim());
    }
  });
  await test('CONTROL missing, own and accepted friend codes keep distinct results', async () => {
    assert((await submit(reply(404, { error: 'no player with that code' }))).messages.some(m => /no bonehead/i.test(m)));
    assert((await submit(reply(400, { error: 'that is your own code' }))).messages.some(m => /own code/i.test(m)));
    const accepted = await submit(reply(200, { status: 'accepted' }));
    assert.equal(accepted.paints, 1);
    assert.equal(accepted.input.value, '');
    assert(accepted.messages.some(m => /friend added/i.test(m)));
  });
  await test('C4 failed remove explains retry in both profile and request list', async () => {
    for (const profile of [true, false]) {
      const button = node({ remove: f.playerId }), messages = [];
      let changed = 0, closed = 0;
      const deps = { wrap: {}, el: {}, $: () => button, toast: m => messages.push(m),
        onChange: () => { changed++; }, paint: async () => { changed++; }, history: { back: () => { closed++; } } };
      const code = profile ? cut("  $('#fpRemove', wrap)?.addEventListener", '\n}\n\nfunction giftRewardLabel')
        : cut("  $('#friendsList', el).addEventListener('click'", '\n\n  await paint();');
      await run(code, deps);
      const click = () => button.events.click({ currentTarget: button, target: { closest: s => s === '[data-remove]' ? button : null } });
      responder = () => reply(503, {});
      await click();
      assert(messages.some(m => /could not remove.*try again/i.test(m)), `${profile ? 'profile' : 'list'} failed silently`);
      assert.equal(changed, 0);
      assert.equal(closed, 0);
      responder = () => reply(200, { ok: true });
      await click();
      assert.equal(changed, 1);
      assert(messages.includes('Removed.'));
    }
  });
  await test('C5 gift sheet tells the recipient to open their gift in Crew', async () => {
    const h = await giftSheet();
    assert.match(h.html, /open[^<.]*Crew|Crew[^<.]*open/i, 'sheet sends recipient straight to Backpack');
  });
  await test('CONTROL gift success spends once and confirmed refusal refunds', async () => {
    await kvSet('coins', 500);
    const h = await giftSheet();
    responder = ({ body }) => reply(200, { ok: true, reward: { coins: body.coins || 25 } });
    await h.chips[3].confirm();
    assert.equal(await coins(), 250);
    assert.equal(h.nodes['#giftBal'].textContent, 'you have 250');
    responder = () => reply(403, {});
    await h.chips[0].confirm();
    assert.equal(await coins(), 250);
    assert(h.messages.some(m => /not in your Crew/i.test(m)));
  });
  await test('CONTROL free gift and already-sent response preserve wallet', async () => {
    for (const status of [200, 409]) {
      const h = await giftSheet();
      responder = () => reply(status, { ok: status === 200, reward: { coins: 25 } }); // v590: the client requires ok:true on a 200, which the Worker always sends
      await h.nodes['#giftFree'].events.click();
      assert.equal(await coins(), 0);
      assert.equal((await kvGet('giftFreeSent'))[f.playerId], '2026-09-08');
      assert.equal(h.nodes['#giftFree'].textContent, 'Sent');
    }
  });
  await test('CONTROL cheers retain phrase zero, sender and original send time', async () => {
    const grant = { key: 'cheer-control', type: 'cheer', ts: 12345,
      payload: { cheer: 0, cheerFrom: f.playerId, from: f.name, note: `${f.name} cheered you!` } };
    assert.equal(await social.__testApplyGrant(grant), true);
    assert.equal(await social.__testApplyGrant(grant), false);
    const row = await db.get('xp', grant.key);
    assert.equal(row.cheer, 0); assert.equal(row.cheerFrom, f.playerId); assert.equal(row.sentAt, 12345);
    const grid = node(), chip = node({ cheer: '0' }), messages = [];
    await run(cut('function openCheerSheet(f)', '// General tester feedback:') + '\nopenCheerSheet(f);', {
      openSheet: () => ({}), $: () => grid, $$: () => [chip], history: { back() {} }, toast: m => messages.push(m),
    });
    responder = () => reply(503, {});
    await grid.events.click({ target: { closest: () => chip } });
    const key = calls.at(-1).body.ck;
    assert.equal(chip.disabled, false);
    responder = () => reply(200, { ok: true });
    await grid.events.click({ target: { closest: () => chip } });
    assert.equal(calls.at(-1).body.ck, key);
    assert(messages.some(m => m.includes(CHEERS[0].txt)));
  });
  await test('CONTROL friends and leaderboard separate empty, offline and clock refusal', async () => {
    responder = () => reply(200, { friends: [], incoming: [], outgoing: [] });
    assert.equal((await social.listFriends()).reached, true);
    responder = () => reply(200, { players: [] });
    assert.deepEqual(await social.leaderboard(), []);
    responder = () => { throw new Error('offline'); };
    assert.equal((await social.listFriends()).reached, false);
    assert.equal(await social.leaderboard(), null);
    responder = () => reply(401, { error: 'stale timestamp' });
    assert.equal((await social.listFriends()).reason, 'clock');
    assert.equal(await social.leaderboard(), null);
    assert.equal((await kvGet('lbFail')).reason, 'clock');
  });
}
console.log(`CREW PLAYTEST: ${passed} passed, ${failed} failed (Node only; no pixel claim)`);
process.exitCode = failed ? 1 : 0;

// PURE: production db.js transactions and production gift functions, transport double.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { db, kvGet, kvSet, useDbName } from '../js/db.js';
const main = process.argv.includes('--main');
const source = p => main ? execFileSync('git', ['show', `main:${p}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }) : readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const social = source('js/social.js');
let delivered = new Map(), lost = false, refuse = false;
const transport = async (method, path, body) => {
  if (refuse) return { ok: false, status: 403, json: async () => ({ error: 'not friends' }) };
  if (!delivered.has(body.ck)) delivered.set(body.ck, { ok: true, reward: { coins: body.coins }, mode: 'spend' });
  if (lost) throw new Error('reply dropped');
  return { ok: true, status: 200, json: async () => delivered.get(body.ck) };
};
function load() {
  const code = social.slice(social.indexOf('export async function sendGift('), social.indexOf('/* Send a preset cheer')).replaceAll('export ', '');
  return new Function('db', 'kvGet', 'signedFetch', 'newSendKey', code + '; return { beginGiftIntent, resolveGiftIntent, resumeGiftIntents };')(db, kvGet, transport, () => crypto.randomUUID().replaceAll('-', ''));
}
let failed = 0;
async function test(name, fn) {
  useDbName(`gift-${name}`); await kvSet('coins', 200); delivered = new Map(); lost = false; refuse = false;
  try { await fn(); console.log(`PASS ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
await test('CRASH', async () => {
  if (main) {
    const app = source('js/app.js');
    const start = app.indexOf('    if (await spendCoins(amt) === null)', app.indexOf('const giftKeys = new Map()'));
    const end = app.indexOf('    const r = await social.sendGift', start);
    assert.ok(start > 0 && end > start, 'legacy debit path reached');
    await new Function('spendCoins', 'amt', 'b', 'toast', 'giftKeys', 'social', `return (async()=>{${app.slice(start, end)}})()`)(async n => { await kvSet('coins', (await kvGet('coins')) - n); return 150; }, 50, {}, () => {}, new Map(), { newSendKey: () => 'crash' });
  } else await load().beginGiftIntent('friend', 50, 'crash');
  assert.equal(await kvGet('coins'), 150);
  assert.deepEqual(await kvGet('giftPending', {}), { crash: { to: 'friend', amount: 50, ck: 'crash' } }, 'debit must persist its resumable intent');
  await load().resumeGiftIntents(); await load().resumeGiftIntents();
  assert.equal(delivered.size, 1); assert.equal(await kvGet('coins'), 150);
});
if (!main) {
await test('LOST-REPLY', async () => {
  const api = load(), i = await api.beginGiftIntent('friend', 50, 'lost'); lost = true;
  assert.equal((await api.resolveGiftIntent(i)).pending, true); assert.equal(await kvGet('coins'), 150);
  lost = false; await load().resumeGiftIntents(); assert.equal(delivered.size, 1);
  assert.deepEqual(await kvGet('giftPending'), {}); assert.equal(await kvGet('coins'), 150);
});
await test('REFUND', async () => {
  const api = load(), i = await api.beginGiftIntent('friend', 50, 'refund'); refuse = true;
  await Promise.all([api.resolveGiftIntent(i), load().resolveGiftIntent(i)]);
  await api.resolveGiftIntent(i); assert.equal(await kvGet('coins'), 200); assert.equal(delivered.size, 0);
});
await test('ONCE', async () => {
  const api = load(); const intents = await Promise.all([api.beginGiftIntent('friend', 50, 'once'), api.beginGiftIntent('friend', 50, 'once')]);
  await Promise.all(intents.map(api.resolveGiftIntent)); assert.equal(await kvGet('coins'), 150); assert.equal(delivered.size, 1);
});
await test('CONTROL', async () => {
  const api = load(); assert.equal(await api.beginGiftIntent('friend', 500, 'poor'), null);
  assert.equal(await kvGet('gift-intent:poor', null), null, 'aborted debit must not leave an intent');
  const app = source('js/app.js');
  assert.ok(app.includes('await social.resumeGiftIntents();'));
  assert.ok(app.includes('await social.beginGiftIntent(f.playerId, amt)'));
  assert.ok(app.includes('await social.resolveGiftIntent(intent)'));
  assert.match(social, /syncProfile[^]*?await resumeGiftIntents\(\);/);
  assert.equal(await kvGet('coins'), 200); assert.deepEqual(await kvGet('giftPending', {}), {});
  await api.resolveGiftIntent(await api.beginGiftIntent('friend', 25, 'one'));
  await api.resolveGiftIntent(await api.beginGiftIntent('friend', 25, 'two'));
  assert.equal(delivered.size, 2); assert.equal(await kvGet('coins'), 150);
});
}
process.exitCode = failed ? 1 : 0;

// Node-only: real modules and wheel commit closure over transactional mem-idb.
// No browser, sockets, live account or native IndexedDB claims.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fault = { key: null, hits: 0 };
const open = indexedDB.open.bind(indexedDB);
indexedDB.open = (...args) => {
  const req = open(...args);
  let callback;
  Object.defineProperty(req, 'onsuccess', {
    get: () => callback && (event => {
      const connection = req.result;
      if (!connection.budgetWrapped) {
        connection.budgetWrapped = true;
        const transaction = connection.transaction.bind(connection);
        connection.transaction = (...args) => {
          const tx = transaction(...args), objectStore = tx.objectStore.bind(tx);
          tx.objectStore = name => {
            const store = objectStore(name), put = store.put;
            store.put = value => {
              const result = put(value);
              if ((name === 'kv' && value.k === fault.key) || (name === 'inv' && fault.key === 'inv')) {
                fault.hits++; tx.abort();
              }
              return result;
            };
            return store;
          };
          return tx;
        };
      }
      callback(event);
    }),
    set: fn => { callback = fn; },
  });
  return req;
};
const dbm = await import('../js/db.js');
const quests = await import('../js/quests.js');
const energy = await import('../js/energy.js');
const nutrition = await import('../js/nutrition.js');
const RealDate = Date;
let now;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};
const setDay = day => { now = new RealDate(`${day}T12:00:00`).getTime(); };
let serial = 0;
async function reset(day = '2026-09-07') {
  fault.key = null; fault.hits = 0; setDay(day);
  dbm.useDbName(`quest-wheel-budget-${++serial}`);
  await dbm.kvSet(dbm.DAY_WITNESS_KEY, nutrition.dayOrdinal(day));
}
const allOn = { hkConnected: true, huntEnabled: true, socialOn: true, pitTried: true, kitchenReady: true };
const paid = result => !!result && !result.capped && !result.dayGuard;
const attempt = async promise => { try { return await promise; } catch { return null; } };
let passes = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); passes++; console.log(`PASS ${name}`); }
  catch (error) { failures++; console.log(`FAIL ${name}: ${error.message.split('\n')[0]}`); }
}

// Evaluate the shipped wheel module, replacing only its DOM renderer with a
// capture of its actual commit closure. All imported payout functions are real.
const wheelSource = readFileSync(new URL('../js/wheel.js', import.meta.url), 'utf8');
const bindings = {};
for (const match of wheelSource.matchAll(/^import \{([^}]+)\} from '([^']+)';/gm)) {
  const module = await import(new URL(match[2], new URL('../js/wheel.js', import.meta.url)));
  for (const name of match[1].split(',').map(s => s.trim())) bindings[name] = module[name];
}
bindings.document = {
  getElementById: id => id === 'dw-style' ? {} : null,
  querySelector: () => null,
};
bindings.navigator = { webdriver: true };
bindings.window = {};
bindings.showWheel = (idx, prize, result, commit) => ({ idx, prize, result, commit });
const wheel = new Function(...Object.keys(bindings), wheelSource
  .slice(0, wheelSource.indexOf('\nfunction showWheel('))
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '')
  + '\nreturn { maybeShowDailyWheel, PRIZES };')(...Object.values(bindings));
async function spinFor(key) {
  bindings.window.__wheelIdx = wheel.PRIZES.findIndex(p => p.key === key);
  return wheel.maybeShowDailyWheel({ force: true, sounds: false });
}

await check('F04 Monday dailies leave weekly claims available Monday and Tuesday', async () => {
  await reset();
  const board = quests.dailyQuests('2026-09-07', allOn);
  assert.equal(board.length, 3);
  for (const quest of board) assert.ok(paid(await quests.claimQuest('2026-09-07', quest)));
  const first = await quests.claimQuest('2026-09-07', quests.WEEKLY_POOL[0], 'week');
  setDay('2026-09-08');
  const second = await quests.claimQuest('2026-09-07', quests.WEEKLY_POOL[1], 'week');
  const count = [first, second].filter(paid).length;
  assert.equal(count, 2, `weekly rewards paid=${count}; Monday capped=${!!first?.capped}; Tuesday capped=${!!second?.capped}`);
});

for (const [period, pool, key] of [
  ['day', quests.DAILY_POOL, '2026-09-07'],
  ['week', quests.WEEKLY_POOL, '2026-09-07'],
  ['month', quests.MONTHLY_POOL, '2026-09'],
]) {
  await check(`F05 ${period} three aborted payouts preserve the reward budget`, async () => {
    await reset();
    const quest = pool[0];
    for (let i = 0; i < 3; i++) {
      fault.key = 'coins'; await attempt(quests.claimQuest(key, quest, period)); fault.key = null;
    }
    assert.equal(await dbm.kvGet('coins', 0), 0);
    const slots = (await dbm.db.all('xp')).filter(r => r.type === 'questslot').length;
    const result = await quests.claimQuest(key, quest, period);
    assert.ok(paid(result), `retry paid=${paid(result)}; capped=${!!result?.capped}; orphan slots=${slots}; aborted coin writes=${fault.hits}`);
    assert.equal(fault.hits, 3);
    assert.equal(await dbm.kvGet('coins'), quest.coins);
    assert.equal(await quests.claimQuest(key, quest, period), null);
  });
}

await check('F21 aborted 150-coin spin can retry and pays exactly once', async () => {
  await reset();
  const { commit } = await spinFor('c150');
  fault.key = 'coins'; await attempt(commit()); fault.key = null;
  assert.equal(fault.hits, 1);
  assert.equal(await dbm.kvGet('coins', 0), 0);
  const result = await commit();
  const balance = await dbm.kvGet('coins', 0);
  assert.equal(balance, 150, `retry balance=${balance}; already=${!!result.already}; spent date=${await dbm.kvGet('wheelLastDate', null)}`);
  assert.equal(result.coinDelta, 150);
  assert.equal((await commit()).already, true);
  assert.equal(await dbm.kvGet('coins'), 150);
});

// Additional controls cover successful rewards, cap races, old save rows and
// every shipped wheel prize type. The five rows above are the unchanged red checks.
for (const [period, pool, key] of [
  ['day', quests.DAILY_POOL, '2026-09-07'],
  ['week', quests.WEEKLY_POOL, '2026-09-07'],
  ['month', quests.MONTHLY_POOL, '2026-09'],
]) {
  await check(`CONTROL ${period} concurrent distinct claims stop at the cap`, async () => {
    await reset();
    const cap = quests.QUEST_N[period];
    const results = await Promise.all(pool.slice(0, cap + 2).map(q => quests.claimQuest(key, q, period)));
    assert.equal(results.filter(paid).length, cap);
    assert.equal(results.filter(r => r?.capped).length, 2);
    const rows = await dbm.db.all('xp');
    assert.equal(quests.claimsThisPeriod(rows, key, period), cap);
    const expectedCoins = pool.slice(0, cap + 2).reduce((sum, q, i) => sum + (paid(results[i]) ? q.coins : 0), 0);
    // Level rewards can also mint coins at the larger monthly XP threshold.
    assert.ok(await dbm.kvGet('coins') >= expectedCoins);
  });
}
await check('CONTROL legacy paid claims count; orphan reservations do not', async () => {
  await reset();
  for (let i = 0; i < 3; i++) await dbm.db.put('xp', {
    key: `quest-2026-09-07-slot-${i}`, type: 'questslot', xp: 0,
  });
  for (const q of quests.DAILY_POOL.slice(0, 2)) await dbm.db.put('xp', {
    key: `quest-2026-09-07-${q.id}`, type: 'quest', xp: 25,
  });
  const results = await Promise.all(quests.DAILY_POOL.slice(2, 5).map(q => quests.claimQuest('2026-09-07', q)));
  assert.equal(results.filter(paid).length, 1);
  assert.equal(results.filter(r => r?.capped).length, 2);
  assert.ok(paid(await quests.claimQuest('2026-09-07', quests.WEEKLY_POOL[0], 'week')));
});
await check('CONTROL concurrent duplicate quest spends one budget unit', async () => {
  await reset();
  const q = quests.DAILY_POOL[0];
  const results = await Promise.all(Array.from({ length: 4 }, () => quests.claimQuest('2026-09-07', q)));
  assert.equal(results.filter(paid).length, 1);
  for (const next of quests.DAILY_POOL.slice(1, 3)) assert.ok(paid(await quests.claimQuest('2026-09-07', next)));
});
await check('CONTROL a capped quest is a refusal, not a save failure', async () => {
  await reset();
  const failures = [];
  dbm.onWriteFailure(error => failures.push(error));
  try {
    for (const q of quests.DAILY_POOL.slice(0, 3)) await quests.claimQuest('2026-09-07', q);
    assert.equal((await quests.claimQuest('2026-09-07', quests.DAILY_POOL[3])).capped, true);
    assert.deepEqual(failures, []);
  } finally { dbm.onWriteFailure(null); }
});
await check('CONTROL closed quest periods still refuse', async () => {
  await reset('2026-10-01');
  assert.equal(await quests.claimQuest('2026-09-30', quests.DAILY_POOL[0]), null);
  assert.equal(await quests.claimQuest('2026-09', quests.MONTHLY_POOL[0], 'month'), null);
});
for (const key of ['c30', 'c75', 'c150', 'daily', 'golden', 'charm', 'ingr']) {
  await check(`CONTROL wheel ${key} abort, reopen and concurrent retry pay once`, async () => {
    await reset();
    const first = await spinFor(key);
    fault.key = first.prize.coin ? 'coins' : key === 'ingr' ? 'ingredients' : 'inv';
    await attempt(first.commit()); fault.key = null;
    assert.equal(fault.hits, 1);
    assert.equal(await dbm.kvGet('wheelLastDate', null), null);
    assert.equal(await dbm.kvGet('wheelspin:2026-09-07', null), null);
    assert.equal(await dbm.kvGet('coins', 0), 0);
    assert.deepEqual(await dbm.db.all('inv'), []);
    assert.deepEqual(await dbm.kvGet('ingredients', {}), {});
    const reopened = await spinFor(key);
    const results = await Promise.all([first.commit(), reopened.commit()]);
    assert.equal(results.filter(r => !r.already).length, 1);
    assert.equal(await dbm.kvGet('wheelLastDate'), '2026-09-07');
    assert.ok(await dbm.kvGet('wheelspin:2026-09-07'));
    if (first.prize.coin) {
      assert.equal(await dbm.kvGet('coins'), Number(first.prize.tag));
      assert.equal(await dbm.kvGet('coinsRev'), Number(first.prize.tag));
    } else if (key === 'ingr') {
      assert.equal(Object.values(await dbm.kvGet('ingredients')).reduce((a, n) => a + n, 0), 1);
    } else {
      const inventory = await dbm.db.all('inv');
      assert.equal(inventory.length, 1);
      assert.equal(inventory[0].kind, key === 'charm' ? 'xp2' : 'crate');
      if (key !== 'charm') assert.equal(inventory[0].crate, key);
      assert.equal(inventory[0].source, 'wheel');
    }
  });
}
await check('CONTROL wheel spent-date write failure rolls back the prize', async () => {
  await reset();
  const { commit } = await spinFor('c150');
  fault.key = 'wheelLastDate'; await attempt(commit()); fault.key = null;
  assert.equal(fault.hits, 1);
  assert.equal(await dbm.kvGet('coins', 0), 0);
  assert.equal(await dbm.kvGet('wheelspin:2026-09-07', null), null);
  assert.equal((await commit()).coinDelta, 150);
});
await check('CONTROL wheel save failure discloses retry without a win reveal', async () => {
  await reset();
  const { commit } = await spinFor('c150');
  let reveals = 0;
  // Node button adapter drives the shipped click registration and callback.
  // This checks reachability through that binding, not browser hit testing.
  const handlers = [];
  const button = {
    addEventListener(type, fn, options) { handlers.push({ type, fn, once: options?.once }); },
    async click() {
      for (const handler of [...handlers]) {
        if (handler.type !== 'click') continue;
        if (handler.once) handlers.splice(handlers.indexOf(handler), 1);
        await handler.fn();
      }
    },
  }, sub = {}, result = {};
  const start = wheelSource.indexOf('    const spin = async () => {');
  const binding = wheelSource.indexOf("\n    spinBtn.addEventListener('click', spin", start);
  const end = wheelSource.indexOf('\n', binding + 1);
  assert.ok(start > 0 && end > start);
  new Function('commit', 'spinBtn', 'sub', 'result', 'reveal', 'wheel',
    `let spinning = false; const sounds = false, idx = 0, SEG_DEG = 360 / 7, reducedMotion = true;
     ${wheelSource.slice(start, end)};`)(
    commit, button, sub, result, () => { reveals++; }, { style: {}, classList: { add() {} } });
  fault.key = 'coins'; await button.click(); fault.key = null;
  assert.equal(reveals, 0);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'RETRY');
  assert.match(sub.textContent, /not saved.*Retry/);
  await button.click();
  assert.equal(reveals, 1);
  assert.equal(result.coinDelta, 150);
  await button.click(); assert.equal(reveals, 1);
});

// F19 is deliberately observation-only: fixing it requires an out-of-lane
// Spire caller to carry the date/identity of the particular charge being refunded.
if (process.argv.includes('--observe-energy')) {
  await reset(); await energy.spendPitFight();
  setDay('2026-09-08'); await energy.refreshPitEnergy(); await energy.spendPitFight();
  const before = await energy.pitEnergy(); await energy.refundPitFight('free');
  const after = await energy.pitEnergy();
  console.log(`UNFIXED F19 delayed refund: free=${before.free}->${after.free}; vigor=${before.vigor}->${after.vigor}; caller receipt required`);
}
globalThis.Date = RealDate;
console.log(`${passes} passed, ${failures} failed`);
if (failures) process.exitCode = 1;

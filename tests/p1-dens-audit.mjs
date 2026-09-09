// Node-only real modules and extracted production Pit branches. No sockets.
import './mem-idb.mjs';
import { readFileSync } from 'node:fs';
const fault = { match: null, hits: 0 };
const open = indexedDB.open.bind(indexedDB);
indexedDB.open = (...args) => {
  const req = open(...args);
  Object.defineProperty(req, 'onsuccess', { get() { return this.cb; }, set(fn) {
    this.cb = e => {
      const conn = req.result, transaction = conn.transaction.bind(conn);
      conn.transaction = (...a) => {
        const tx = transaction(...a), objectStore = tx.objectStore.bind(tx);
        tx.objectStore = name => {
          const os = objectStore(name), put = os.put.bind(os);
          os.put = row => {
            if (fault.match?.(name, row)) { fault.match = null; fault.hits++; tx.abort(); throw new Error('injected write abort'); }
            return put(row);
          };
          return os;
        };
        return tx;
      };
      fn(e);
    };
  } });
  return req;
};
const D = await import('../js/db.js'), L = await import('../js/loot.js');
const G = await import('../js/game.js'), P = await import('../js/poi.js'), E = await import('../js/energy.js');
const { dateKey } = await import('../js/nutrition.js');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
let passed = 0, failed = 0, seq = 0;
const check = async (name, fn) => {
  try { const detail = await fn(); passed++; console.log(`PASS ${name}: ${detail}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
};
const expect = (yes, message) => { if (!yes) throw Error(message); };
async function reset() {
  fault.match = null; fault.hits = 0; D.useDbName(`p1-dens-${++seq}`);
  await D.db.put('xp', { key: 'seed', type: 'seed', xp: 1000000, date: dateKey() });
}
async function abortAt(match, action) {
  fault.match = match;
  try { await action(); } catch (e) { if (!fault.hits) throw e; }
  fault.match = null;
  expect(fault.hits === 1, 'fault boundary was not exercised exactly once');
}
function between(start, end) {
  const a = app.indexOf(start), b = app.indexOf(end, a);
  expect(a >= 0 && b > a, `production branch missing: ${start}`);
  return app.slice(a, b);
}
function compiled(source, env) {
  // Resolve production relative dynamic imports from this test's location.
  return new AsyncFunction(...Object.keys(env), source.replaceAll("import('./", "import('../js/"))(...Object.values(env));
}
const den = () => P.densNear(P.isoWeekKey(), 49.28, -123.12).find(d => d.reward.crate);
await check('F12 seventh pending den reward', async () => {
  await reset();
  const old = Array.from({ length: 6 }, (_, i) => ({ key: `earned-${i}`, choices: ['fixture'] }));
  await D.kvSet('denloot', old);
  const r = await P.claimDenWin(den());
  const pending = await D.kvGet('denloot', []);
  expect(r?.gearChoices && pending.length === 7 && pending.some(p => p.key === 'earned-0'), `pending=${pending.length}, earned-0=${pending.some(p => p.key === 'earned-0')}`);
  return 'pending=7, earned-0=true';
});
await check('F13 den crate abort and retry', async () => {
  const results = [];
  for (const kind of ['landmark', 'remote', 'roaming']) {
    await reset();
    const d = { ...den(), ...(kind === 'remote' ? { remote: true } : kind === 'roaming' ? { roaming: true } : {}) };
    await abortAt(s => s === 'inv', () => P.claimDenWin(d));
    const cleared = !!await D.db.get('xp', P.denKey(dateKey(), d));
    const retry = await P.claimDenWin(d);
    const crates = (await L.inventory()).filter(r => r.kind === 'crate').length;
    expect(!cleared && retry && crates === 1, `${kind}: cleared=${cleared}, retry=${!!retry}, crates=${crates}`);
    expect(await P.claimDenWin(d) === null, 'duplicate den paid');
    results.push(`${kind}=1 crate`);
  }
  await reset(); const d = den();
  await abortAt((store, row) => store === 'kv' && row.k === 'denloot', () => P.claimDenWin(d));
  expect(!await D.db.get('xp', P.denKey(dateKey(), d)) && (await L.inventory()).length === 0, 'gear-choice abort partially committed');
  const concurrent = await Promise.all([P.claimDenWin(d), P.claimDenWin(d)]);
  expect(concurrent.filter(Boolean).length === 1 && (await D.kvGet('denloot')).length === 1, 'concurrent den claims duplicated');
  return results.join(', ') + ', duplicates=0; gear-choice abort rolls back; concurrent claim=1';
});
await check('F14 Battle Charm buffs abort', async () => {
  await reset(); await L.grantConsumable('xp2', 'audit');
  await abortAt((s, r) => s === 'kv' && r.k === 'buffs', () => L.activateBattleCharm());
  const items = (await L.inventory()).filter(r => r.kind === 'xp2').length;
  const charges = (await D.kvGet('buffs', {})).xp2 || 0;
  expect(items === 1 && charges === 0, `items=${items}, charges=${charges}`);
  const r = await L.activateBattleCharm();
  expect(r.ok && r.charges === 5, 'retry did not activate');
  await L.grantConsumable('xp2', 'audit');
  expect((await L.activateBattleCharm()).reason === 'active', 'active charm accepted another item');
  await D.kvSet('buffs', { xp2: 0, future: 'preserved' });
  await L.grantConsumable('xp2', 'audit');
  const concurrent = await Promise.all([L.activateBattleCharm(), L.activateBattleCharm()]);
  expect(concurrent.filter(r => r.ok).length === 1 && (await L.inventory()).filter(r => r.kind === 'xp2').length === 1, 'concurrent charm stacked or lost an item');
  expect((await D.kvGet('buffs')).future === 'preserved', 'unrelated buff lost');
  return 'abort retains item; retry=5 charges; active/concurrent stacking refused';
});
async function wanderer(coinMult = 1) {
  const source = between("      } else if (foeCfg.mode === 'wanderer') {", '      window.__refreshWalletPill?.();');
  return compiled(`let xp=0, coins=0, extras=[], extraCards=[]; if(false) {\n${source}\nreturn {xp,coins,extras,extraCards};`, {
    foeCfg: { mode: 'wanderer', claimKey: `wanderer-${dateKey()}-audit_i1`, date: dateKey(), xp: 150, coins: 200 },
    award: G.award, grantCrate: L.grantCrate, coinsAdd: L.coinsAdd,
    consumeBattleCharmCharge: L.consumeBattleCharmCharge, foodCoinMult: async () => coinMult,
    crateCard: kind => kind, dispatchEvent: () => {}, CustomEvent: class {},
  });
}
await check('F17 Wanderer egg abort and replay', async () => {
  await reset();
  await abortAt(s => s === 'inv', () => wanderer());
  const claimed = !!await D.db.get('xp', `wanderer-${dateKey()}-audit_i1`);
  const r = await wanderer();
  const eggs = (await L.inventory()).filter(r => r.kind === 'egg').length;
  const coins = await L.coins();
  expect(!claimed && eggs === 1 && coins === 200 && r.xp === 150, `claimed=${claimed}, eggs=${eggs}, coins=${coins}, replayXP=${r.xp}`);
  const duplicate = await wanderer();
  expect(duplicate.xp === 0 && await L.coins() === 200, 'duplicate Wanderer paid');
  await reset(); await D.kvSet('buffs', { xp2: 2 });
  await abortAt((store, row) => store === 'kv' && row.k === 'coins', () => wanderer(1.5));
  expect((await D.kvGet('buffs')).xp2 === 2 && (await L.inventory()).length === 0, 'coin abort lost charm or committed egg');
  const concurrent = await Promise.all([wanderer(1.5), wanderer(1.5)]);
  expect(concurrent.filter(r => r.xp === 150).length === 1 && await L.coins() === 375 && (await D.kvGet('buffs')).xp2 === 1,
    'concurrent boosted Wanderer reward or charm debit incorrect');
  expect((await L.inventory()).filter(r => r.kind === 'egg').length === 1, 'concurrent Wanderer duplicated egg');
  return 'abort unclaimed; replay=150 XP, 200 coins, 1 egg; duplicate=0; coin abort rolls back; concurrent boosted payout=375';
});
async function startPit(toasts = []) {
  const source = between('  const startPitInner = async (foeCfg) => {', "  $$('[data-spar]'");
  const helper = app.includes('async function reservePitFight(')
    ? between('async function reservePitFight(', 'async function openFight(') : '';
  return compiled(`${helper}\n${source}\nawait startPitInner({mode:'rung',name:'Audit'});`, {
    ...D, ...E, dateKey, wrap: {}, body: {}, fighter: {}, $: () => null,
    renderPit: async () => {}, toast: s => toasts.push(s),
    openFight: async (wrap, fighter, foeCfg) => {
      const prefix = between('async function openFight(', '  /* THE FIRST FIGHT IS UNLOSABLE');
      await compiled(`${prefix}\n}\nawait openFight({}, {stats:{}}, foeCfg);`, {
        ...D, foeCfg, equipped: async () => ({}), foodCombatBuff: async () => null,
        potionsInv: async () => [], makeFighter: o => o, RUNG_TALENTS: {},
        hasFightableStats: () => false, scaleStats: () => ({}), foeOutfitFor: () => ({}),
        trackEvent: () => {}, PIT_STAKED_MODES: ['rung', 'champ', 'endless'],
      });
    },
  });
}
await check('F15 Pit setup record abort', async () => {
  await reset(); await E.refreshPitEnergy();
  await abortAt((s, r) => s === 'kv' && r.k === 'pitFight', startPit);
  const ready = (await E.refreshPitEnergy()).ready;
  const record = await D.kvGet('pitFight', null);
  expect(ready === 3 && record === null, `ready=${ready}, pitFight=${JSON.stringify(record)}`);
  await startPit();
  expect((await E.refreshPitEnergy()).ready === 2 && (await D.kvGet('pitFight')).phase === 'open', 'successful setup missing charge or open record');
  await startPit(); expect((await E.refreshPitEnergy()).ready === 2, 'open record failed to block next spend');
  return 'abort=3 charges, no record; retry=2 charges, open record; next spend blocked';
});
await check('F16 capped non-staked XP', async () => {
  await reset();
  for (let i = 0; i < 12; i++) await G.awardCapped('fight', 'fight', 10, 'seed', 12);
  const before = await G.totalXp();
  const start = app.indexOf('      } else {', app.indexOf('const pitRecovery =')) + '      } else {'.length;
  const source = app.slice(start, app.indexOf('      /* QA round 28 P4: 15 coins', start));
  const value = await compiled(`let xp=0; ${source}; return xp;`, {
    awardCapped: G.awardCapped, FIGHT_ROW_LABEL: {}, foeCfg: {mode:'spar'}, XP_DAILY_CAP:G.XP_DAILY_CAP, trackEvent: () => {},
  });
  const delta = await G.totalXp() - before;
  expect(value === delta && delta === 0, `displayXP=${value}, actualXP=${delta}`);
  await reset(); const beforeControl = await G.totalXp();
  const control = await compiled(`let xp=0; ${source}; return xp;`, {
    awardCapped: G.awardCapped, FIGHT_ROW_LABEL: {}, foeCfg: {mode:'spar'}, XP_DAILY_CAP:G.XP_DAILY_CAP, trackEvent: () => {},
  });
  expect(control === 10 && await G.totalXp() - beforeControl === 10, 'uncapped win stopped paying 10 XP');
  return 'displayXP=0, actualXP=0; uncapped control=10 (game.js board copy remains outside lane)';
});
await check('F18 empty Pit guidance', async () => {
  await reset(); await E.refreshPitEnergy();
  for (let i = 0; i < 3; i++) await E.spendPitFight();
  const toasts = []; await startPit(toasts);
  expect(toasts.length === 1 && !/meal|log food/i.test(toasts[0]) && /walk/i.test(toasts[0]), `toast=${JSON.stringify(toasts[0])}`);
  expect((await E.refreshPitEnergy()).ready === 0, 'empty Pit opened a fight');
  await D.db.put('log', { id: 'meal', date: dateKey(), meal: 0, kcal: 400 });
  expect((await E.refreshPitEnergy()).ready === 0, 'meal unexpectedly earned Vigor');
  await D.db.put('health', { date: dateKey(), steps: 2500 });
  expect((await E.refreshPitEnergy()).ready === 1, 'walk guidance does not unlock a charge');
  return `toast=${JSON.stringify(toasts[0])}; meal=0, 2500 steps=1 charge`;
});
console.log(`P1 DENS: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;

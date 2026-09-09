// Production services, templates and click handlers over mem-idb. No file writes,
// sockets or browser. RED evidence and remaining limits: docs/PLAYTEST-MAP.md.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fault = { match: null, hits: 0 };
const open = indexedDB.open.bind(indexedDB);
indexedDB.open = (...args) => {
  const req = open(...args);
  let callback;
  Object.defineProperty(req, 'onsuccess', { get: () => callback, set(fn) {
    callback = event => {
      const conn = req.result, transaction = conn.transaction.bind(conn);
      conn.transaction = (...args) => {
        const tx = transaction(...args), objectStore = tx.objectStore.bind(tx);
        tx.objectStore = name => {
          const store = objectStore(name);
          for (const method of ['put', 'add']) {
            const write = store[method].bind(store);
            store[method] = row => {
              if (fault.match?.(name, row)) {
                fault.match = null; fault.hits++;
                tx.error = Error('injected map save abort'); tx.abort();
                return {};
              }
              return write(row);
            };
          }
          return store;
        };
        return tx;
      };
      fn(event);
    };
  } });
  return req;
};
const D = await import('../js/db.js'), P = await import('../js/poi.js');
const L = await import('../js/loot.js'), H = await import('../js/hunt.js');
const G = await import('../js/game.js');
const { GEAR_ITEMS, GEAR_BY_ID } = await import('../js/gear.js');
const { dateKey } = await import('../js/nutrition.js');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
const cut = (start, end) => {
  const a = app.indexOf(start), b = app.indexOf(end, a);
  assert(a >= 0 && b > a, `production slice missing: ${start}`);
  return app.slice(a, b);
};
const run = (source, env) => new AsyncFunction(...Object.keys(env), source)(...Object.values(env));
let passed = 0, failed = 0, seq = 0;
async function test(name, fn) {
  try { const detail = await fn(); passed++; console.log(`PASS ${name}${detail ? ': ' + detail : ''}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
  finally { fault.match = null; }
}
async function reset() {
  fault.match = null; fault.hits = 0; D.useDbName(`map-playtest-${++seq}`);
  await D.db.put('xp', {key:'seed',type:'seed',xp:1000000,date:dateKey()});
}
async function abortAt(match, action) {
  fault.match = match;
  try { await action(); } catch (e) { assert.equal(e.message, 'injected map save abort'); }
  fault.match = null;
  assert.equal(fault.hits, 1, 'fault did not reach a production write');
}
const gear = GEAR_ITEMS[0], otherGear = GEAR_ITEMS[1];
async function pending() {
  await D.kvSet('denloot', [{key:'earned-den',den:'Audit den',choices:[gear.id, otherGear.id]}]);
}

await test('M1 gear inventory abort retains earned choice', async () => {
  await reset(); await pending();
  await abortAt(s => s === 'inv', () => P.claimDenLoot('earned-den', gear.id));
  const left = (await D.kvGet('denloot', [])).length;
  assert.equal(left, 1, `pending=${left}, inventory=${(await L.inventory()).length}`);
  assert.equal((await P.claimDenLoot('earned-den', gear.id))?.id, gear.id);
  assert.equal((await L.inventory()).filter(r => r.gearId === gear.id).length, 1);
  return 'pending=1 after abort; retry delivers one gear';
});
await test('M1 appearance abort rolls back gear and choice together', async () => {
  await reset(); await pending();
  await abortAt((s,r) => s === 'kv' && r.k === 'looks', () => P.claimDenLoot('earned-den', gear.id));
  assert.equal((await D.kvGet('denloot', [])).length, 1, 'appearance abort consumed choice');
  assert.equal((await L.inventory()).length, 0, 'appearance abort committed gear alone');
  await P.claimDenLoot('earned-den', gear.id);
  assert((await D.kvGet('looks', [])).includes(gear.artId));
});
await test('CONTROL gear overlap, invalid choice and existing variant', async () => {
  await reset(); await pending();
  assert.equal(await P.claimDenLoot('earned-den', 'unknown'), null);
  const results = await Promise.all([P.claimDenLoot('earned-den', gear.id), P.claimDenLoot('earned-den', otherGear.id)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await L.inventory()).length, 1);
  await pending();
  const owned = L.gearRow(gear.id, 'glutton', {slimed:true});
  await D.db.put('inv', owned);
  await P.claimDenLoot('earned-den', gear.id);
  assert.deepEqual(await D.db.get('inv', owned.id), owned, 'existing variant overwritten');
});

await test('M1 Keep handler recovers after rejected save', async () => {
  await reset(); await pending();
  const element = dataset => ({dataset, events:{}, disabled:false,
    classList:{toggle(){},contains(){return false;},remove(){}}, setAttribute(){},
    addEventListener(name, fn){this.events[name] = fn;}});
  const card = element({gear:gear.id}), keep = element({}), messages = [];
  let delivered = 0;
  await run(cut('function wireLootChoice(', '\nfunction petPanelHtml(') + '\nwireLootChoice({}, claimFn, onDone);', {
    hydratePackArt(){}, $$:()=>[card], $:()=>keep, GEAR_BY_ID,
    claimFn:id=>P.claimDenLoot('earned-den',id), onDone:()=>delivered++,
    confettiBurst(){}, popSound(){}, innerWidth:400,innerHeight:800,S:{sounds:false}, toast:m=>messages.push(m),
  });
  card.events.click();
  await abortAt(s=>s === 'inv', ()=>keep.events.click());
  // Isolate the handler latch on the RED service; the GREEN service retains it.
  if (!(await D.kvGet('denloot', [])).length) await pending();
  await keep.events.click();
  assert.equal(delivered, 1, 'Keep stays busy after an aborted claim');
  assert(messages.length > 0, 'failed save was not explained');
});

await test('M2 mini crate abort is retryable', async () => {
  await reset();
  const mini = {...P.minisNear(dateKey(),49.28,-123.12)[0], reward:P.MINI_TIERS[2].reward};
  await abortAt(s=>s === 'inv', ()=>P.claimMiniWin(mini));
  const spent = !!await D.db.get('xp', P.miniKey(dateKey(), mini));
  assert.equal(spent, false, `spent=${spent}, crates=${(await L.inventory()).length}`);
  const retry = await P.claimMiniWin(mini);
  assert.equal(retry.xp, mini.reward.xp);
  assert.equal(await L.boneDust(), mini.reward.dust);
  assert.equal((await L.inventory()).length, 1);
  return 'unspent after abort; retry=40 XP, one crate, 12 dust';
});
await test('M2 mini dust abort and concurrent retry', async () => {
  await reset();
  const mini = {...P.minisNear(dateKey(),49.28,-123.12)[0],reward:P.MINI_TIERS[2].reward};
  await abortAt((s,r)=>s === 'kv' && r.k === 'bonedust', ()=>P.claimMiniWin(mini));
  assert.equal((await L.inventory()).length, 0, 'dust abort left spent crate claim');
  const results = await Promise.all([P.claimMiniWin(mini), P.claimMiniWin(mini)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await L.boneDust(), 12);
  assert.equal(await D.kvGet('dustRev',0), 12);
  assert.equal(await P.denWinsCount(), 0);
});

await test('M3 interrupted ceiling backfill resumes missing weeks', async () => {
  await reset();
  for (const day of ['2026-08-04','2026-08-11']) await D.db.put('xp', {
    key:`boss-${day}-4928_-12312`,type:'bossday',xp:40,date:day});
  await abortAt((s,r)=>s === 'xp' && r.key === 'bossfirst-2026-W33-4928_-12312', ()=>P.backfillDenCeilingIfNeeded());
  await P.backfillDenCeilingIfNeeded();
  assert.equal(await P.denWinsCount(), 2, `restored=${await P.denWinsCount()}, expected=2`);
  await P.backfillDenCeilingIfNeeded();
  assert.equal(await P.denWinsCount(), 2);
  return 'two weeks restored once after retry';
});

await test('M3 legacy completion flag cannot hide missing ceiling markers', async () => {
  await reset();
  await D.kvSet('denceil-backfill', true);
  await D.db.put('xp', {key:'boss-2026-08-04-4928_-12312',type:'bossday',xp:40,date:'2026-08-04'});
  await P.backfillDenCeilingIfNeeded();
  assert.equal(await P.denWinsCount(), 1, 'legacy early flag prevents repair');
});

async function sheet(den, options={}) {
  const events={}, button={addEventListener:(name,fn)=>events[name]=fn};
  let html='';
  await run(cut('function openDenSheet(', '\nasync function openSpireSheet(') + '\nopenDenSheet(den, options);', {
    ...P, ...H, den, options, esc:String, crateIcon:()=>'<i/>', badgePixHtml:()=>'<i/>',
    ICONS:{coin:()=>'',star:()=>'',close:()=>''}, t1Sect:s=>`<h3>${s}</h3>`,
    openSheet:s=>{html=s;return {};}, $:()=>button,history:{back(){}},setTimeout:fn=>fn(),
  });
  return {html,events};
}
await test('M4 roaming preview matches absence of gear choices', async () => {
  await reset();
  const den = P.densNear(P.isoWeekKey(),49.28,-123.12,dateKey()).find(d=>d.roaming);
  assert(den, 'no roaming sample');
  const {html} = await sheet(den);
  const result = await P.claimDenWin(den);
  assert.equal(result.gearChoices, null);
  assert(!html.includes('Two pieces drop'), 'roaming den promises a gear chooser it never pays');
});
await test('M4 mage location copy agrees with weekly movement', async () => {
  const weeks=['2026-W36','2026-W37'].map(w=>P.densNear(w,49.28,-123.12));
  const den=weeks[0].find(d=>d.theme.art === 'mage'), next=weeks[1].find(d=>d.id === den.id);
  assert.notEqual(den.lat, next.lat);
  const {html} = await sheet(den);
  assert(!html.includes('he is not moving'), 'mage moved next week but preview promises he is not moving');
  assert(/moves.*Monday/i.test(html), 'weekly relocation not explained');
});
await test('CONTROL den reach, cleared state and fight callback', async () => {
  const den=P.densNear(P.isoWeekKey(),49.28,-123.12)[0]; let fights=0;
  const near=await sheet(den,{inRange:true,onFight:()=>fights++});
  assert(near.html.includes('Two pieces drop')); assert(near.events.click);
  near.events.click(); assert.equal(fights,1);
  for (const options of [{inRange:false},{inRange:true,cleared:true}]) {
    const s=await sheet(den,options); assert(s.html.includes(' disabled')); assert.equal(s.events.click,undefined);
  }
});
await test('CONTROL remote den actual card, handler, payout and tomorrow', async () => {
  await reset(); const day=dateKey(); let fight;
  const card=async()=>run(cut('  const rDen = remoteDen(date);', '\n  const remoteSect =') +
    cut('  const remoteSect =', '\n\n') + '\nreturn remoteSect;',
    {...P,date:day,xpRows:await D.db.all('xp'),esc:String,badgePixHtml:()=>''});
  assert((await card()).includes('id="remoteDenBtn"'));
  const events={};
  await run(cut("  $('#remoteDenBtn', body)?.addEventListener", '\n  const start = (foeCfg)'), {
    rDen:P.remoteDen(day), $:()=>({addEventListener:(n,fn)=>events[n]=fn}),body:{},wrap:{},fighter:{},
    openFight:(w,f,c)=>fight=c,themedLook:()=>({}),
  });
  events.click(); assert.equal(fight.mode,'boss'); assert.equal(fight.den.remote,true);
  assert(await P.claimDenWin(fight.den)); assert.equal(await P.denWinsCount(),1);
  assert.equal(await P.claimDenWin(fight.den),null);
  const after=await card(); assert(after.includes('TOMORROW')); assert(!after.includes('id="remoteDenBtn"'));
});
await test('CONTROL all five spawn types pay once on overlapping collects', async () => {
  for (const type of Object.keys(H.SPAWN_TYPES)) {
    await reset(); const spawn={id:`audit-${type}`,type};
    const results=await Promise.all([H.collectSpawn(spawn),H.collectSpawn(spawn)]);
    assert.equal(results.filter(Boolean).length,1);
    const reward=results.find(Boolean);
    assert.equal(await L.coins(),reward.coins);
    assert.equal((await L.inventory()).length,reward.crate ? 1 : 0);
    assert.equal(await G.totalXp(),1000000+reward.xp);
  }
});
console.log(`MAP PLAYTEST: ${passed} passed, ${failed} failed (Node only; no pixel claim)`);
process.exitCode=failed ? 1 : 0;

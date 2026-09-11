import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resolve } from 'node:path';
const read = p => readFileSync(process.env.V576_SOURCE_ROOT ? resolve(process.env.V576_SOURCE_ROOT, p) : new URL('../' + p, import.meta.url), 'utf8');
const app = read('js/app.js'), social = read('js/social.js'), ui = read('tests/ui-audit.js');
let failures = 0, passed = 0;
async function test(name, run) { try { await run(); passed++; console.log('PASS ' + name); } catch (e) { failures++; console.log('FAIL ' + name + ': ' + e.message.split('\n')[0]); } }
await test('CONTROL server-confirmed claim retains full reward after local cap failure', async () => {
  const source = app.slice(app.indexOf('const already = !!(remote'), app.indexOf("else if (foeCfg.mode === 'mimic')"));
  assert.ok(source.startsWith('const already = !!(remote'), 'SETUP production settlement branch found');
  const branch = source.slice(0, source.lastIndexOf('\n      }'));
  for (const local of [{ok:false,reason:'cap'}, {ok:true,level:1}, null]) {
   for (const mirrorFails of [false, true]) {
    const context = { remote:{ok:true,level:2}, refused:false,pending:false,foeCfg:{spire:{id:'s',name:'Tower'}},claimSpire:async()=>{if(!local)throw Error('storage');return local;}, social:{fetchMySpires:async()=>mirrorFails?[{id:'s'}]:null},syncSieges:async()=>{if(mirrorFails)throw Error('storage');},setSpireLevel:async()=>{if(mirrorFails)throw Error('storage');},toast:()=>{},dispatchEvent:()=>{},CustomEvent:class {}, extraCards:[],SPIRE_CAP:3 };
    const result = await vm.runInNewContext(`(async()=>{let coins=0;${branch};return {coins,cards:extraCards.length};})()`, context);
    assert.equal(result.coins,80); assert.equal(result.cards,1);
   }
  }
  for (const mode of ['offline', 'cap', 'already']) {
    let refunded=0, localCalls=0;
    const remote=mode==='already'?{ok:true,already:true}:{ok:false,reason:mode};
    const context={remote,refused:mode==='cap',pending:mode==='offline',foeCfg:{spire:{id:'s',name:'Tower'},charge:'charge'},claimSpire:async()=>{localCalls++;return {ok:false,reason:'cap'};},refundPitFight:async()=>{refunded++;},toast:()=>{},dispatchEvent:()=>{},CustomEvent:class {},SPIRE_CAP:3};
    const coins=await vm.runInNewContext(`(async()=>{let coins=0;${branch};return coins;})()`,context);
    assert.equal(coins,mode==='offline'?0:mode==='cap'?40:25);
    assert.equal(localCalls,mode==='offline'?1:0);
    assert.equal(refunded,mode==='offline'?1:0);
  }
});
await test('API override resets persisted cache and query while preserving other parameters', async () => {
  const source = social.slice(social.indexOf('const PROD_API'), social.indexOf('/* ---------------- identity')) .replaceAll('export ', '');
  const kv = new Map(); let href='https://game.test/?api=https%3A%2F%2Ftest.example&demo=1#/settings';
  const location = {get search(){return new URL(href).search;},get href(){return href;}};
  const c = {URL,URLSearchParams,location,history:{state:null,replaceState:(_a,_b,url)=>{href=String(url);}},kvGet:async(k,d)=>kv.get(k)??d,kvSet:async(k,v)=>kv.set(k,v)};
  await vm.runInNewContext(`(async()=>{${source};await initFromQuery();if(await apiBase()!=='https://test.example')throw Error('override ignored');await resetApiBase();await initFromQuery();if(await apiBase()!==PROD_API)throw Error('reset did not stick');})()`,c);
  assert.equal(new URL(href).searchParams.has('api'),false); assert.equal(new URL(href).searchParams.get('demo'),'1'); assert.equal(new URL(href).hash,'#/settings');
  assert.match(read('js/device-report.js'),/API base/); assert.match(read('js/device-report.js'),/resetDeviceApi/); assert.match(app,/resetApiBase: social.resetApiBase/);
});
await test('coin audit follows Shop destination', () => {
  assert.match(app,/id="coinBtn" aria-label="Coins"/);
  assert.match(app,/\$\('#coinBtn'\).*openCharacter\('shop'\)/);
  assert.match(ui,/id: 'coinBtn'[^\n]+hubTab: 'shop'/);
});
await test('character audit follows Backpack label', () => {
  assert.match(app,/id="charBtn"[^\n]+<span>Backpack/);
  assert.match(ui,/id: 'charBtn'[^\n]+hubTab: 'crates'/);
});
await test('retired drop audit uses current Shop control', () => {
  assert.doesNotMatch(app,/id="dropToShop"/);
  assert.doesNotMatch(ui,/id: 'dropToShop'/);
});
await test('siege coverage is explicitly conditional', () => {
  assert.match(ui,/conditional: '#activeSiegeBanner'/);
  assert.match(ui,/checked\.skipped\.push/);
});
await test('notch guard measures character instead of background', () => {
  assert.match(ui,/#bhStage > \.hero-char/);
});
await test('changelog versions unique with correct v544 date', () => {
  const changes=vm.runInNewContext(read('js/changelog.js').replaceAll('export ', '')+';CHANGES');
  assert.equal(new Set(changes.map(c=>c.n)).size,changes.length);
  assert.equal(changes.find(c=>c.n===544).date,'2026-09-10');
});
await test('refused charm costs zero full rebuilds; successful charm costs one', async () => {
  const start=app.indexOf("$('#useBoost', content)?.addEventListener");
  const source=app.slice(start,app.indexOf("$('#useVigor'",start));
  for(const ok of [false,true]) {
    let handler, calls=0;
    vm.runInNewContext(source,{content:{},$:()=>({addEventListener:(_e,h)=>{handler=h;}}),activateBattleCharm:async()=>({ok,reason:'active',charges:3}),S:{},popSound:()=>{},toast:()=>{},renderCharacter:()=>{calls++;},wrap:{}});
    await handler(); assert.equal(calls,ok?1:0);
  }
});
console.log(`${passed}/${passed+failures} passed`); process.exitCode=failures?1:0;

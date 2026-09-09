// Finding 1, frozen work order 2026-09-08. Recovery never draws or redispatches.
import assert from 'node:assert/strict';
import {D,L,pet,seed,dateKey} from './lib/pet-destruction-harness.mjs';
const roster=[pet('a'),pet('b'),pet('c')];
for (const credit of [false,true]) {
  await seed(roster,{petEquipped:'a',equipped:{C:'C1'}});
  const q=(await L.laboratory.quote({iids:['a','b']})).quote;
  assert.equal((await L.saveLabIntent(q.request,{acknowledgedRisk:'ANIMATE'})).ok,true);
  await D.db.put('health',{date:dateKey(),steps:100});
  if(credit)await L.creditEquippedPetSteps();
  for(let i=0;i<3;i++)assert.equal((await L.laboratory.snapshot()).status,'ready','CONTROL health-only interruption must leave a usable room');
  assert.equal((await D.kvGet('petInst')).length,3);assert.equal((await D.kvGet('petLvlSteps')).a,100);
  assert.equal(Object.keys(await D.kvGet('labIntents')).length,0);
  assert.equal((await L.animateLaboratory(q.request,{acknowledgedRisk:'ANIMATE',requireIntent:true})).ok,false);
  const fresh=(await L.laboratory.quote({iids:['a','b']})).quote;assert.ok(fresh);
  const result=await L.laboratory.animate({quote:fresh,acknowledgedRisk:'ANIMATE'});assert.equal(result.ok,true);
  const retry=await L.laboratory.animate({quote:fresh,acknowledgedRisk:'ANIMATE'});assert.equal(retry.receipt.result.iid,result.receipt.result.iid);
  assert.equal((await D.kvGet('petInst')).length,2);assert.equal((await L.laboratory.snapshot()).used,1);
}
console.log('PASS CONTROL: pending and credited health changes recover, fence late dispatch, and allow exactly one fresh experiment');
// A missing input without a matching receipt is still unsafe, not health drift.
await seed(roster);const q=(await L.laboratory.quote({iids:['a','b']})).quote;
await L.saveLabIntent(q.request,{acknowledgedRisk:'reviewed'});
await D.kvSet('petInst',roster.slice(1));await D.db.put('health',{date:dateKey(),steps:100});
assert.equal((await L.laboratory.snapshot()).status,'unknown');
assert.equal(Object.keys(await D.kvGet('labIntents')).length,1);
assert.equal((await L.animateLaboratory(q.request,{acknowledgedRisk:'reviewed',requireIntent:true})).ok,false);
console.log('PASS CONTROL: unexplained missing input remains blocked and is never destroyed again');

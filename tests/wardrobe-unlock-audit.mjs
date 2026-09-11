import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {GEAR_ITEMS,gearLabel} from '../js/gear.js';
import {BH_BY_ID,bhAsset,bhFamilyKey,bhFamilies} from '../data/boneheadz.js';
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const start=app.indexOf('gearItems.map(g => {');
const end=app.indexOf("}).join('')}",start)+"}).join('')".length;
const gearItems=GEAR_ITEMS.map(g=>({...g,lookFamily:bhFamilyKey(BH_BY_ID[g.artId])}));
const render=source=>vm.runInNewContext(source,{gearItems,BH_BY_ID,bhAsset,bhTrim:x=>x,esc:String,wLevel:999,slimedSet:new Set(),gearLo:{},slot:'H',S:{},rarityTagHtml:()=>'',gearLabel,ICONS:{boltIco:()=>''},newIds:new Set()});
const html=render(app.slice(start,end));
const families=bhFamilies(GEAR_ITEMS.map(g=>BH_BY_ID[g.artId]));
assert.equal((html.match(/data-gear-family=/g)||[]).length,families.size);
const uncollapsed=app.slice(start,end).replace("if (gearItems.find(x => (x.lookFamily || x.artId) === key) !== g) return '';", '');
assert.notEqual(uncollapsed,app.slice(start,end));
assert.throws(()=>assert.equal((render(uncollapsed).match(/data-gear-family=/g)||[]).length,families.size));
console.log('PASS CONTROL removing family deduplication fails the tile count');
const railStart=app.indexOf('      <div class="ward-variants">');
const railEnd=app.indexOf('      ${fbRailHtml()}',railStart);
for(const key of families.keys()) {
 const familyGear=k=>gearItems.filter(g=>g.lookFamily===k);
 const rail=vm.runInNewContext('`'+app.slice(railStart,railEnd)+'`',{gearFamilyMap:families,S:{wardrobeGearFamily:key},familyGear,esc:String,gearLabel,slimedSet:new Set(),items:[],bhFamilyKey});
 for(const g of familyGear(key)) {
  assert.ok(rail.includes(`data-equipgear="${g.id}"`));
  assert.ok(rail.includes(gearLabel(g)));
 }
}
assert.match(app,/wardrobeReturnTop \?\?= scroller.scrollTop/);
assert.match(app,/scroller.scrollTo\(\{ top, behavior: reducedMotion \? 'auto' : 'smooth' \}\)/);
assert.match(app,/data-ward-pieces\$\{S.wardrobeLookMode \? ' hidden' : ''\}/);
assert.match(app,/data-ward-looks\$\{S.wardrobeLookMode \? '' : ' hidden'\}/);
console.log(`PASS ${GEAR_ITEMS.length} gear variants reachable with stats across ${families.size} tiles; exclusive picker markup and reduced-motion return contract. Browser unproven.`);

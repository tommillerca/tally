// Pending requirement guard. Expected RED until the lower-region lock is relaxed.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {GEAR_ITEMS, gearLabel} from '../../js/gear.js';
import {BH_BY_ID, bhAsset, bhFamilyKey} from '../../data/boneheadz.js';
const app=readFileSync(new URL('../../js/app.js',import.meta.url),'utf8');
const start=app.indexOf('gearItems.map(g => {');
const end=app.indexOf("}).join('')}",start)+"}).join('')".length;
const groups=new Map();
for(const g of GEAR_ITEMS) {
 const key=bhFamilyKey(BH_BY_ID[g.artId]);
 if(!groups.has(key))groups.set(key,[]);
 groups.get(key).push(g);
}
const pair=[...groups.values()].find(g=>g.length>1).slice(0,2);
const count=gearItems=>{
 const html=vm.runInNewContext(app.slice(start,end),{gearItems,BH_BY_ID,bhAsset,bhTrim:x=>x,esc:String,wLevel:999,slimedSet:new Set(),gearLo:{},slot:pair[0].slot,S:{},rarityTagHtml:()=>'',gearLabel,ICONS:{boltIco:()=>''},newIds:new Set()});
 return (html.match(/class="ward-cell gear /g)||[]).length;
};
console.log(JSON.stringify({ids:pair.map(g=>g.id),one:count(pair.slice(0,1)),duplicate:count(pair)}));
assert.equal(count(pair),count(pair.slice(0,1)),'duplicate-look gear must not grow the grid');

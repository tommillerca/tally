/* THROWAWAY: what would win rates look like if the FOE clamp were not 100?
   Nothing is changed in js/: the foe stats are built here, so this is a
   prediction instrument only. */
import { makeFighter, createFight, actionsFor, applyAction, endTurn, aiTakeTurn,
  expectedDamage, ACTIONS, TURN_CAP, endlessFoe } from '../js/pit.js';
const SEEDS = 80;
const SETUP = ['rage','totem','raisedead','callcrows','ward'];
function pTurn(f){let g=0;while(!f.over&&f.active==='p'&&f.ap>0&&g++<8){const L=actionsFor(f).filter(x=>x.enabled);if(!L.length)break;const h=i=>L.find(x=>x.id===i);let p=null;
 if(f.p.hp<f.p.d.maxHp*0.3&&(h('mend')||h('guard')))p=h('mend')?'mend':'guard';
 if(!p&&h('callcrows')&&(f.p.flock||0)<3)p='callcrows';
 if(!p)for(const i of SETUP)if(i!=='callcrows'&&h(i)){p=i;break;}
 if(!p&&h('signature'))p='signature';
 if(!p){const d=L.filter(a=>ACTIONS[a.id]&&ACTIONS[a.id].base).map(a=>({id:a.id,v:expectedDamage(a.id,f.p,f.f,f.f)/Math.max(1,a.ap)})).sort((x,y)=>y.v-x.v);p=d.length?d[0].id:L[0].id;}
 applyAction(f,p);} if(!f.over)endTurn(f);}
const RAGE=['heavyhands','followthrough','followthrough','followthrough','bonebreaker','concussive','rage','titan','ironjaw','ironjaw','ironjaw'];
function scale(st,m,clamp){const o={};for(const k of Object.keys(st))o[k]=Math.max(5,Math.min(clamp,Math.round(st[k]*m)));return o;}
function wr(pStats,foe,clamp){let w=0,n=0;for(let s=1;s<=SEEDS;s++){
 const P=makeFighter({name:'P',stats:pStats,weaponId:'bonecrusher',talents:RAGE});
 const F=makeFighter({name:'F',stats:scale(pStats,foe.mult,clamp),weaponId:foe.weaponId||'starter',talents:foe.talents||[]});
 if(foe.mage)F.wraith=true;
 const f=createFight({player:P,foe:F,seed:s*7919,aiLevel:foe.aiLevel||3});
 let g=0;while(!f.over&&g++<TURN_CAP*4){if(f.active==='p')pTurn(f);else{aiTakeTurn(f);if(!f.over)endTurn(f);}}
 n++; if(f.over&&f.over.winner==='p')w++;}
 if(!n)throw new Error('EMPTY SAMPLE'); return (w/n*100).toFixed(0)+'%';}
const pad=(s,n)=>String(s).padEnd(n);
const P100={power:100,marrow:100,wind:100,reflex:100,hype:100};
const P150={power:150,marrow:150,wind:150,reflex:150,hype:150};
console.log('rage-stack player. "clamp" = the ceiling scaleStats applies to the FOE (shipped: 100).\n');
console.log(pad('rank',8)+pad('mult',8)+pad('p100 c100',11)+pad('p100 c150',11)+pad('p100 c250',11)+pad('p150 c100',11)+pad('p150 c250',11)+'p150 c400');
for(const r of [10,20,30,50,80,100]){const foe=endlessFoe(r);
 console.log(pad(r,8)+pad(foe.mult.toFixed(2),8)+pad(wr(P100,foe,100),11)+pad(wr(P100,foe,150),11)+pad(wr(P100,foe,250),11)+pad(wr(P150,foe,100),11)+pad(wr(P150,foe,250),11)+wr(P150,foe,400));}

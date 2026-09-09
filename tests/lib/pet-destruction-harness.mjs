// Frozen work order, 2026-09-08. Real services and extracted production handlers.
// In-memory IndexedDB and DOM event doubles, no browser or device claims.
import '../mem-idb.mjs';
import {readFileSync} from 'node:fs';
import {pathToFileURL, fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root = process.env.DESTRUCTION_SOURCE_ROOT || fileURLToPath(new URL('../../', import.meta.url));
const moduleAt = file => import(pathToFileURL(`${root}/${file}`));
export const D = await moduleAt('js/db.js');
export const L = await moduleAt('js/loot.js');
export const P = await moduleAt('js/pets.js');
export const {dateKey} = await moduleAt('js/nutrition.js');
const {BH_BY_ID} = await moduleAt('data/boneheadz.js');
const app = readFileSync(`${root}/js/app.js`, 'utf8');
let seq = 0;
export const pet = (iid, morph='base', extra={}) => ({iid, sp:'C1', morph, shiny:false, lineage:0, hatchedAtSteps:0, ...extra});
export async function seed(roster, extra={}) {
  D.useDbName(`destruction-${++seq}`);
  const species = [...new Set(roster.map(p=>p.sp))];
  for (const [k,v] of Object.entries({petInst:roster, pets:Object.fromEntries(species.map(sp=>[sp,{hatchedAtSteps:0}])), looks:species,
    petLvlV:2, petLvlSteps:Object.fromEntries(roster.map(p=>[p.iid,0])), pettalents:{__iidV:2}, petStepCredit:0,
    petEquipped:null, equipped:{}, coins:100000, coinsRev:0, ...extra})) await D.kvSet(k,v);
  for (const sp of species) await D.db.put('inv',{id:`ownership-${sp}`,kind:'cos',itemId:sp});
  await L.laboratory.snapshot();
}
const esc = x => String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export async function stable(roster, mode='destroy') {
  const messages=[], sheets=[], results=[];
  const el = () => ({dataset:{}, value:'', innerHTML:'', textContent:'', disabled:false, isConnected:true, events:{},
    classList:{add(){},remove(){}}, focus(){}, addEventListener(k,fn){this.events[k]=fn;}});
  const button=el();button.dataset={destroy:roster[0].iid,dust:'60'};
  let current;
  const context=vm.createContext({...P,...L,BH_BY_ID,esc,insts:roster,bank:await D.kvGet('petLvlSteps'),body:{},S:{},
    ICONS:{dust:()=>'',chev:()=>'',warn:()=>''},setTimeout:()=>0,queueMicrotask,popSound(){},render:async()=>{},
    toast:x=>messages.push(x),sel:roster.map(p=>p.iid),offSp:roster[0].iid,BREED_ERR:{},saveBreed(){},
    openPetBreedResult:x=>results.push(x),
    $$:()=>[button], $:(selector,wrap)=>wrap?.nodes?.[selector] || (selector==='#doBreed'?button:null),
    openSheet:(html,opts)=>{
      const wrap={nodes:{},isConnected:true,opts,html};
      for (const id of ['#pdIn','#pdGo','#pdStatus','h2','.lab-review']) wrap.nodes[id]=el();
      wrap.nodes['#pdGo'].disabled=/id="pdGo" disabled/.test(html);
      let bodyHtml=html;
      Object.defineProperty(wrap.nodes['.lab-review'],'innerHTML',{get:()=>bodyHtml,set:value=>{
        bodyHtml=value;wrap.nodes['#pdIn']=el();wrap.nodes['#pdStatus']=el();
      }});
      sheets.push(wrap);current=wrap;return wrap;
    },
    history:{back(){if(current){current.isConnected=false;current.opts.onClose?.();}}},
  });
  const pure=app.split('// PET DESTRUCTION UI PURE BEGIN')[1]?.split('// PET DESTRUCTION UI PURE END')[0];
  if(pure)vm.runInContext(pure,context);
  vm.runInContext(app.slice(app.indexOf('function openPetDestructionReview('),app.indexOf('\nfunction wireLabLinks(')),context);
  const start=app.indexOf(mode==='destroy'?"    $$('[data-destroy]', body).forEach":"    $('#doBreed', body)?.addEventListener", app.indexOf('async function openStable'));
  const end=app.indexOf(mode==='destroy'?"    $$('[data-offsp]', body).forEach":"    $$('[data-petpick2]', body).forEach", start);
  vm.runInContext(app.slice(start,end),context);
  return {messages,sheets,results,button,
    click:()=>{
      const event={currentTarget:button,target:button};
      // DOM dispatch does not await listeners. currentTarget is cleared before
      // their promise resumes; target remains the original dispatch target.
      try { return button.events.click(event); }
      finally { event.currentTarget=null; }
    },
    get review(){return current;},
    get disclosure(){return current?.nodes['.lab-review'].innerHTML || messages.join(' ');},
    type(value){current.nodes['#pdIn'].value=value;current.nodes['#pdIn'].events.input();},
    submit:()=>current.nodes['#pdGo'].events.click(),
    cancel(){current.isConnected=false;current.opts.onClose?.();},
    bar(){
      Object.assign(context,{keeper:roster[0],spare:roster[1],pair:true,offLineage:1,spareLvl:1,spareIsPrecious:false,
        petPortraitHtml:()=>'',petBreedGainText:()=>'',petStatBonusText:()=>'',spChips:'',breedLockNote:'',canBreedNow:true});
      const a=app.indexOf('${pair ? `<div class="breed-bar'), b=app.indexOf("</div>` : ''}`;",a)+"</div>` : ''}`;".length;
      return vm.runInContext(app.slice(a+2,b-3),context);
    },
  };
}

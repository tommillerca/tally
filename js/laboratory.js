// Pure Laboratory rules. Current ownership is the shipped ownedPairs view.
import { MORPHS, ownedPairs, petLevel } from './pets.js';
export const LAB_RULES = 'lab-final-v1';
export const LAB_PRICES = Object.freeze({2:20000, 3:40000});
export const LAB_DEFAULTS = Object.freeze({labV:1, labExperiments:{}, labDaily:{}, labIncubators:{}, labIntents:{}, labSeen:[], labUi:{format:1,introRead:false,todayHidden:false,revision:0}});
const species = sp => typeof sp === 'string' && /^C[1-6]$/.test(sp);
export const labMorph = m => m == null || m === '' ? 'base' : MORPHS.includes(m) ? m : null;
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const labEqual = (a,b) => canonical(a) === canonical(b);
function canonical(v) { return JSON.stringify(v, (_, x) => x && !Array.isArray(x) && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])) : x); }
export function labRefuse(reason) { throw Object.assign(new Error(reason), {refused:true,reason}); }
export function labInput(row, state = {}) {
  if (!row || typeof row.iid !== 'string' || !row.iid.trim() || !species(row.sp) ||
      (row.shiny !== undefined && row.shiny !== false) || !labMorph(row.morph)) return null;
  const lineage = row.lineage ?? 0, bankedSteps = state.petLvlSteps?.[row.iid] ?? 0;
  const bond = state.petBonds?.[row.iid] ?? 0, nickname = state.petNick?.[row.iid] ?? '';
  const talents = state.pettalents?.[row.iid] ?? [];
  if (!finite(lineage) || !Number.isInteger(lineage) || !finite(bankedSteps) || !finite(bond) || bond > 5 ||
      typeof nickname !== 'string' || !Array.isArray(talents) || !talents.every(t=>typeof t==='string') ||
      (row.hatchedAtSteps != null && !finite(row.hatchedAtSteps))) return null;
  return {iid:row.iid,sp:row.sp,morph:labMorph(row.morph),shiny:false,lineage,bankedSteps,
    level:petLevel(bankedSteps),nickname,bond,talents:[...talents],equipped:state.petEquipped===row.iid};
}
export function labRecipe(roster, iids, state = {}) {
  if (!Array.isArray(roster) || !Array.isArray(iids) || iids.length!==2 || iids[0]===iids[1]) return null;
  const ids=roster.map(x=>x?.iid).filter(x=>typeof x==='string');
  if(new Set(ids).size!==ids.length)return null;
  const inputs=iids.map(id=>labInput(roster.find(x=>x?.iid===id),state));
  if(inputs.some(x=>!x) || inputs[0].sp!==inputs[1].sp)return null;
  const pair=inputs.map(x=>x.morph).sort().join('+');
  const recipe={'base+base':'base-base','ember+frost':'ember-frost','rose+toxic':'toxic-rose'}[pair];
  return recipe ? {recipe,species:inputs[0].sp,inputs} : null;
}
export function labDistribution(roster, recipe, sp, state = {}) {
  if(recipe==='toxic-rose')return {distribution:[{morph:'midnight',weight:4}],protection:'none'};
  if(!['base-base','ember-frost'].includes(recipe))labRefuse('invalid-pair');
  const [left,right,weight]=recipe==='base-base'?['ember','frost',22]:['toxic','rose',10];
  // Ownership and ingredient stock never alter either coin flip.
  return {distribution:[left,right].map(morph=>({morph,weight})),protection:'none'};
}
function cells(roster) { return [...ownedPairs(roster.filter(x=>x && species(x.sp) && labMorph(x.morph)).map(x=>({...x,morph:labMorph(x.morph)})))].sort(); }
export function labPreview(roster, iids, state = {}) {
  const match=labRecipe(roster,iids,state);
  if(!match)return {ok:false,reason:'invalid-pair'};
  const odds=labDistribution(roster,match.recipe,match.species,state);
  const beforeCells=cells(roster), survivors=roster.filter(x=>!iids.includes(x?.iid));
  const branches=odds.distribution.map(({morph})=>{
    const after=cells([...survivors,{sp:match.species,morph}]);
    const lost=beforeCells.filter(k=>!after.includes(k)),gained=after.filter(k=>!beforeCells.includes(k));
    const affected=[...new Set([...match.inputs.map(x=>`${x.sp}|${x.morph}`),`${match.species}|${morph}`])];
    return {morph,lost,gained,afterCount:after.length,duplicate:gained.length===0,
      counts:Object.fromEntries(affected.map(k=>[k,survivors.filter(x=>`${x?.sp}|${labMorph(x?.morph)}`===k).length+(k===`${match.species}|${morph}`?1:0)]))};
  });
  const risk=match.inputs.some(x=>x.bankedSteps>0||x.lineage>0||x.bond>0||x.nickname||x.talents.length||x.equipped)||branches.some(b=>b.lost.length);
  return {ok:true,...match,...odds,beforeCells,branches,risk};
}
export function resolveLabOutcome(distribution, rng) {
  if(!Array.isArray(distribution)||!distribution.length||distribution.some(x=>!MORPHS.includes(x.morph)||!finite(x.weight)||x.weight===0))labRefuse('invalid-distribution');
  if(distribution.length===1)return distribution[0].morph;
  const sample=rng();if(!finite(sample)||sample>=1)labRefuse('invalid-random');
  let value=sample*distribution.reduce((n,x)=>n+x.weight,0);
  for(const x of distribution){value-=x.weight;if(value<0)return x.morph;}
  return distribution.at(-1).morph;
}
export function labCapacity(incubators = {}) {
  for(const [key,r] of Object.entries(incubators))if(!['2','3'].includes(key)||r?.format!==1||r.slot!==Number(key)||r.price!==LAB_PRICES[key]||typeof r.opId!=='string'||!r.opId||!finite(r.purchasedAt)||r.currencyReceipt!==`lab-incubator:${r.opId}:coins`)labRefuse('invalid-incubators');
  if(incubators['3']&&!incubators['2'])labRefuse('invalid-incubators');
  return 1+Number(!!incubators['2'])+Number(!!incubators['3']);
}
export function labDayProjection(experiments = {}, incubators = {}) {
  const capacity=labCapacity(incubators),days={},consumed=new Set(),results=new Set();
  for(const [id,r] of Object.entries(experiments)){
    if(!r||r.format!==1||r.rules!==LAB_RULES||r.opId!==id||!id||!/^\d{4}-\d{2}-\d{2}$/.test(r.day)||!Number.isInteger(r.slot)||r.slot<1||r.slot>capacity||!finite(r.committedAt)||typeof r.zone!=='string')labRefuse('invalid-experiment');
    if(!species(r.species)||!Array.isArray(r.inputs)||r.inputs.length!==2||!labRecipe(r.inputs,r.inputs.map(x=>x.iid))||labRecipe(r.inputs,r.inputs.map(x=>x.iid)).recipe!==r.recipe||r.inputs.some(x=>x.sp!==r.species||!finite(x.bankedSteps)||!finite(x.bond)||x.bond>5||!finite(x.level)||x.level!==petLevel(x.bankedSteps)||typeof x.nickname!=='string'||typeof x.equipped!=='boolean'||!Array.isArray(x.talents)||!x.talents.every(t=>typeof t==='string')))labRefuse('invalid-experiment');
    const allowed={'base-base':{ember:22,frost:22},'ember-frost':{toxic:10,rose:10},'toxic-rose':{midnight:4}}[r.recipe];
    if(!Array.isArray(r.distribution)||!r.distribution.length||r.distribution.some(x=>allowed[x.morph]!==x.weight)||new Set(r.distribution.map(x=>x.morph)).size!==r.distribution.length||!['collection','ingredient','none'].includes(r.protection))labRefuse('invalid-experiment');
    if(r.recipe==='toxic-rose'&&(!labEqual(r.distribution,[{morph:'midnight',weight:4}])||r.protection!=='none'))labRefuse('invalid-experiment');
    if(!Array.isArray(r.branches)||!labEqual(r.branches.map(x=>x.morph),r.distribution.map(x=>x.morph))||!Array.isArray(r.beforeCells)||r.branches.some(x=>!Array.isArray(x.lost)||!Array.isArray(x.gained)||!finite(x.afterCount)))labRefuse('invalid-experiment');
    const out=r.result;if(!out||typeof out.iid!=='string'||!out.iid||out.sp!==r.species||out.shiny!==false||out.lineage!==0||!finite(out.hatchedAtSteps)||!allowed[out.morph]||!r.distribution.some(x=>x.morph===out.morph)||results.has(out.iid)||r.inputs.some(x=>x.iid===out.iid))labRefuse('invalid-experiment');
    results.add(out.iid);
    for(const input of r.inputs){if(consumed.has(input.iid))labRefuse('conflicting-experiments');consumed.add(input.iid);}
    const d=days[r.day]??={slots:{},used:0};if(d.slots[r.slot])labRefuse('conflicting-experiments');d.slots[r.slot]=id;d.used++;
  }
  return days;
}

// Restore helpers fail before the importer dispatches a single write. They do
// not synthesize results from receipts: later legitimate consumption stays final.
export function validateLabSave(s) {
  const present=Object.keys(LAB_DEFAULTS).some(k=>s[k]!==undefined);
  if(!present)return;
  if(s.labV!==1)labRefuse('unsupported-laboratory');
  for(const k of ['labExperiments','labDaily','labIncubators','labIntents','labUi'])if(!s[k]||typeof s[k]!=='object'||Array.isArray(s[k]))labRefuse('invalid-laboratory');
  if(!Array.isArray(s.labSeen)||!s.labSeen.every(x=>typeof x==='string')||s.labUi.format!==1||typeof s.labUi.introRead!=='boolean'||typeof s.labUi.todayHidden!=='boolean'||!Number.isSafeInteger(s.labUi.revision)||s.labUi.revision<0)labRefuse('invalid-laboratory');
  if(!labEqual(labDayProjection(s.labExperiments,s.labIncubators),s.labDaily))labRefuse('invalid-daily');
  const taken=new Set(s.petTaken||[]), roster=s.petInst||[];
  if(!Array.isArray(roster)||new Set(roster.map(x=>x?.iid)).size!==roster.length)labRefuse('invalid-roster');
  for(const r of Object.values(s.labExperiments)){
    for(const input of r.inputs){
      if(!taken.has(input.iid)||roster.some(x=>x?.iid===input.iid))labRefuse('incomplete-experiment');
      for(const k of ['petLvlSteps','petNick','petBonds','pettalents'])if(Object.hasOwn(s[k]||{},input.iid))labRefuse('incomplete-experiment');
    }
    const out=roster.find(x=>x?.iid===r.result.iid);
    if(!out&&!taken.has(r.result.iid))labRefuse('incomplete-experiment');
    if(out&&(out.sp!==r.species||out.morph!==r.result.morph||out.shiny!==false||out.hatchedAtSteps!==r.result.hatchedAtSteps))labRefuse('conflicting-result');
  }
  for(const r of Object.values(s.labIncubators))if(s.coinsHistory?.ops?.[r.currencyReceipt]!==-r.price)labRefuse('incomplete-purchase');
  for(const [id,r] of Object.entries(s.labIntents))if(r?.format!==1||r.quote?.opId!==id||r.quote?.rules!==LAB_RULES||!finite(r.createdAt))labRefuse('invalid-intent');
}
export function mergeLabSave(local, file, merged, replace) {
  if(!Object.keys(LAB_DEFAULTS).some(k=>local[k]!==undefined||file[k]!==undefined))return {};
  validateLabSave(local);validateLabSave(file);
  const union=(a={},b={})=>{const out={...a};for(const [k,v] of Object.entries(b)){if(Object.hasOwn(out,k)&&!labEqual(out[k],v))labRefuse('laboratory-restore-conflict');out[k]=v;}return out;};
  if(replace){
    for(const key of ['labExperiments','labIncubators'])for(const [id,r] of Object.entries(local[key]||{}))if(!labEqual(file[key]?.[id],r))labRefuse('laboratory-restore-conflict');
    validateLabSave(merged);return {};
  }
  const labExperiments=union(local.labExperiments,file.labExperiments),labIncubators=union(local.labIncubators,file.labIncubators);
  const a=local.labUi||LAB_DEFAULTS.labUi,b=file.labUi||LAB_DEFAULTS.labUi;
  const labUi=a.revision>b.revision?a:b.revision>a.revision?b:{...a,introRead:a.introRead||b.introRead,todayHidden:a.todayHidden||b.todayHidden};
  const intents=union(local.labIntents,file.labIntents);for(const id of Object.keys(labExperiments))delete intents[id];
  const out={labV:1,labExperiments,labIncubators,labDaily:labDayProjection(labExperiments,labIncubators),labUi,labIntents:intents,labSeen:[...new Set([...(local.labSeen||[]),...(file.labSeen||[])])]};
  const taken=new Set(merged.petTaken||[]);
  for(const key of ['petLvlSteps','petNick','petBonds','pettalents'])out[key]=Object.fromEntries(Object.entries(merged[key]||{}).filter(([id])=>!taken.has(id)));
  validateLabSave({...merged,...out});return out;
}

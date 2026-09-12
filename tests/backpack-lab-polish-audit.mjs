import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const actions = app.slice(app.indexOf('    const cfActs ='), app.indexOf('\n\n    /* HER WARDROBE', app.indexOf('    const cfActs =')));
assert.ok(actions.includes('data-pettree') && actions.includes('data-destroy'), 'CONTROL real Stable actions must be extracted');
console.log('PASS CONTROL nonempty production Stable template includes talents and salvage actions');
function render(openIid, meltMode = false) {
  return vm.runInNewContext(actions + '\ncfActs', {
    focused: {iid:'pet1',sp:'C1'}, BH_BY_ID:{C1:{}}, eqIid:'pet1', sel:[], openIid,
    pair:null, nicks:{}, meltMode, petDustValue:()=>10, esc:x=>x, petInstanceName:()=> 'Pet'
  });
}
assert.doesNotMatch(render('pet1'), /data-destroy|data-pet-salvage/, 'talents must not offer destruction or its entry control');
assert.doesNotMatch(render('pet1', true), /data-destroy|data-pet-salvage/, 'talents suppress salvage even after entering melt mode');
assert.doesNotMatch(render(null), /data-destroy/, 'ordinary Stable greeting must not offer destruction');
assert.match(render(null), /data-pet-salvage/, 'deliberate salvage entry remains reachable');
assert.match(render(null,true), /data-destroy="pet1"[^>]*data-dust="10"/, 'salvage retains instance and payout');
console.log('PASS 5/5: talents exclude destruction; deliberate salvage retains instance and payout');
const pure = app.split('// LAB UI PURE BEGIN:')[1].split('\n').slice(1).join('\n').split('// LAB UI PURE END')[0];
const ui = vm.createContext({esc:String, petPortraitHtml:()=>'', BH_BY_ID:{C1:{name:'Pet'}}, MORPH_LABEL:{toxic:'Toxic',rose:'Rose'}});
vm.runInContext(pure,ui);
const pet = (iid,morph) => ({iid,morph,sp:'C1',eligible:true,bankedSteps:0,level:1,talents:[],bond:0});
const base=pet('base','base'), toxic=pet('toxic','toxic'), rose=pet('rose','rose');
for (const [first, second] of [[base,toxic],[toxic,base]]) {
  const html=ui.labPickerHtml({pets:[first,second]},[first.iid,null],1);
  assert.match(html,/data-lab-pick="[^"]+" disabled/);
  assert.match(html,/Base \(plain\) needs another Base/);
  assert.match(html,/Toxic needs Rose/);
}
assert.ok(ui.labPair(base,pet('base2','base')));
assert.ok(ui.labPair(toxic,rose));
assert.doesNotMatch(ui.labPickerHtml({pets:[toxic,rose]},['toxic',null],1), / disabled/);
assert.equal(ui.labNeedsTyped({inputs:[{...base,bankedSteps:10}],branches:[]}),true);
assert.equal(ui.labNeedsTyped({inputs:[base],branches:[{lost:['C1|base']}]}),true);
assert.equal(ui.labNeedsTyped({inputs:[base],branches:[{lost:[]}]}),false);
console.log('PASS 10/10: pair warnings in both directions, valid recipes, preserved risk gates');
const backpack=app.slice(app.indexOf("  if (tab === 'crates') {"),app.indexOf("    $('#bpKitchen', content)") /* v588: the bench and its handlers left the Backpack for the Wardrobe; the Kitchen handler is the last thing still in this block */);
assert.doesNotMatch(backpack,/lab-banner-recipes/);
assert.match(backpack,/data-lab-open/);
for(const description of ['${CONSUMABLES.xp2.desc}','${CONSUMABLES.vigor.desc}','${esc(p.desc)}']) {
  assert.ok(backpack.includes('<details class="bp-item-details"><summary>Details</summary><p>'+description+'</p></details>'));
}
assert.ok(backpack.indexOf('<summary>Details &amp; odds</summary>') < backpack.indexOf('<p>${def.rolls}'));
assert.match(app,/\$\('\[data-pet-salvage\]', body\)\?\.addEventListener/);
console.log('PASS 7/7: banner entry, closed card explanations and wired salvage entry');

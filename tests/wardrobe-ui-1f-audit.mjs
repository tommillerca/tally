// PURE contract only. Browser geometry and hit targets require independent review.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = read('js/app.js'), css = read('app.css');
const hash = s => createHash('sha256').update(s).digest('hex');
const locks = {"dollMarkup": "50d29535de11128bf518696e2a89f94c169bff60fe6f932760b23d4d56de90f3", "lowerHandlers": "9be74654fd35895beb325aa43b55b4a9b01b861e98991bf136f047763af0db2e", "cssPrefixLength": 812158, "cssPrefixHash": "31e2702ba835e59fbea471754b76ba4381f678564bd5f371ac83e2df1209bed8"};
function grade(source) {
  assert.equal(hash(source.slice(source.indexOf('    const pdSlot = code => {'), source.indexOf('    const statChip', source.indexOf('    const pdSlot = code => {')))), '7889f55f1ea010200eabeadf40cd189b69d32c156d4d58e010364ea53240c462', 'paperdoll slot definitions changed');
  assert.match(source, /data-fit-switcher/, 'compact saved-fit switcher missing');
  assert.match(source, /data-fit-rename/, 'explicit rename missing');
  const start = source.indexOf('      <div class="mog-dock">', source.indexOf('    const fitRail ='));
  const end = source.indexOf('    // --- saved fits:', start);
  assert.ok(start > 0 && end > start);
  assert.equal(hash(source.slice(start,end)), locks.dollMarkup, 'paperdoll and lower markup changed');
  const handlers = source.indexOf('    /* Trim the transparent padding', end);
  const stop = source.indexOf("  if (tab === 'looks')", handlers);
  assert.ok(handlers > end && stop > handlers);
  assert.equal(hash(source.slice(handlers,stop)), locks.lowerHandlers, 'lower equipment handlers changed');
}
grade(app);
assert.throws(() => grade(app.replaceAll('data-fit-switcher','data-broken-switcher')), assert.AssertionError);
assert.throws(() => grade(app.replace('<div class="paperdoll">','<div class="paperdoll broken">')), assert.AssertionError);
assert.equal(hash(css.slice(0,locks.cssPrefixLength)),locks.cssPrefixHash,'inherited CSS changed');
const a=app.indexOf('    const fitRail ='), b=app.indexOf('\n    content.innerHTML =',a);
function toolbar(n, stripped=false) {
  return vm.runInNewContext(app.slice(a,b)+'\nfitRail;', {
    fitList:Array.from({length:n},(_,i)=>({id:'f'+i,name:'Long & fit '+i,gear:{}})),
    fitPrices:Array(n).fill(12),fitThumbArt:()=>null,S:{},esc:s=>String(s).replaceAll('&','&amp;'),
    MAX_FITS:6,stripPlan:{slots:stripped?[]:['H'],mogs:[]},
    pixCur:()=>'<img alt="">',ICONS:{dust:()=>'',camera:()=>'',close:()=>''}
  });
}
for (const n of [0,1,6]) {
  const html=toolbar(n);
  assert.equal((html.match(/data-fit-switcher/g)||[]).length,1);
  assert.doesNotMatch(html,/\d+\/6 fits/);
  assert.equal((html.match(/data-fit="/g)||[]).length,n);
  assert.equal((html.match(/data-fit-rename="/g)||[]).length,n);
  assert.equal((html.match(/data-fit-del="/g)||[]).length,n);
  assert.match(html,/data-fit-reset/);
  assert.match(html,/data-fit-save/);
  if(n) assert.match(html,/Long &amp; fit/);
  if(n===6) assert.match(html,/data-fit-save="1" aria-disabled="true"/);
}
assert.doesNotMatch(toolbar(0,true),/data-fit-reset/);

console.log('PASS CONTROL switcher removal and locked doll mutation rejected; 0/1/6 fits, escaped names, prices, management, cap and strip visibility. Inherited CSS retained; authorized lower markup and handler hashes renewed. Browser UNPROVEN.');
// Execute the actual fit event bindings with DOM doubles. No rendered-hit claim.
function button(dataset={}) {
  return {dataset,attrs:{},handlers:{},disabled:false,
    addEventListener(type,fn){this.handlers[type]=fn;},
    setAttribute(k,v){this.attrs[k]=v;},
    click(){return this.handlers.click?.({currentTarget:this,target:{closest:()=>null},stopPropagation(){}});}
  };
}
const switcher=button(), equip=button({fit:'f0'}), rename=button({fitRename:'f0'}), del=button({fitDel:'f0'}), confirm=button();
const list={hidden:true}, events=[], state={}; let renameCommit;
const bindings=app.slice(app.indexOf('    // --- saved fits:'),app.indexOf('    // one string, said from both the ghosted chip'));
const ctx={S:state,content:{},wrap:{},setTimeout,clearTimeout,
  $:s=>s==='[data-fit-switcher]'?switcher:s==='#wardFitList'?list:s==='[data-fit-delete-confirm]'?confirm:null,
  $$:s=>s==='[data-fit]'?[equip]:s==='[data-fit-rename]'?[rename]:s==='[data-fit-del]'?[del]:[],
  fits:async()=>[{id:'f0',name:'Own fit'}],
  applyFit:async id=>{events.push(['equip',id]);return {ok:true,name:'Own fit',cost:0};},
  renameFit:async(id,name)=>events.push(['rename',id,name]),deleteFit:async id=>events.push(['delete',id]),
  openTextSheet:(opts,fn)=>{events.push(['text',opts.cta]);renameCommit=fn;},
  openSheet:html=>{events.push(['review',html]);return {};},
  history:{back:()=>events.push(['back'])},esc:String,toast(){},haptic:{tap(){},heavy(){}},
  popSound(){},levelSound(){},pushProfileSoon(){},renderCharacter:()=>events.push(['render'])};
vm.runInNewContext(bindings,ctx);
switcher.click();assert.equal(list.hidden,false);assert.equal(switcher.attrs['aria-expanded'],'true');
switcher.click();assert.equal(list.hidden,true);assert.equal(switcher.attrs['aria-expanded'],'false');
await equip.click();assert.deepEqual(events[0],['equip','f0']);
rename.click();await new Promise(resolve=>setImmediate(resolve));
assert.ok(renameCommit,'explicit rename must open the existing text sheet');
await renameCommit('Changed');assert.ok(events.some(e=>e[0]==='rename'&&e[1]==='f0'&&e[2]==='Changed'));
await del.click();assert.ok(events.some(e=>e[0]==='review'&&e[1].includes('data-fit-delete-confirm')));
assert.equal(events.filter(e=>e[0]==='delete').length,0,'Delete must not mutate before confirmation');
await confirm.click();await confirm.click();
assert.equal(events.filter(e=>e[0]==='delete').length,1,'confirmed deletion is locked against double clicks');
console.log('PASS real fit bindings in DOM model: toggle state, equip, explicit rename, confirmed delete and duplicate-confirm lock. Browser UNPROVEN.');

// Header grouping: execute the shipped template with real title lookup.
const headerStart = app.indexOf('    <div class="ward-head">');
const headerEnd = app.indexOf("` : tab === 'shop'", headerStart);
const headerTemplate = app.slice(headerStart, headerEnd);
const names = vm.runInNewContext(read('js/game.js').match(/export const LEVEL_NAMES = (\[[\s\S]*?\]);/)[1]);
const titleLookup = app.slice(app.indexOf('function todayEarnedTitle('), app.indexOf('async function refreshLevelChip('));
function header(myTitle, level) {
  return vm.runInNewContext(titleLookup + '\n`' + headerTemplate + '`', {
    LEVEL_NAMES:names, lvl:{level}, myTitle, esc:String, coinBal:1234, dustBal:567,
    ownedCount:8, boost:2, lookCounts:{collected:9,total:100,alternatives:91},
    fitCount:3, MAX_FITS:6, sparkIco:()=>'', ICONS:{coin:()=>'',dust:()=>'',bone:()=>'',boltIco:()=>''}
  });
}
assert.match(header('',21), /class="ward-rank">Bone Grandmaster<\/span>/);
assert.match(header('Title 101',21), /class="ward-rank">Title 101<\/span>/);
assert.doesNotMatch(header('',21), /class="ward-lv"|Lv 21|Grandmaster 21/);
assert.match(header('',21), /class="ward-wallet">[\s\S]*1,234[\s\S]*567[\s\S]*<\/div>/);
assert.match(header('',21), /class="ward-collection">[\s\S]*8 found[\s\S]*x2[\s\S]*9\/100 collected looks[\s\S]*91 other looks to try/);
assert.doesNotMatch(header('',21), /ward-fits|3\/6 fits/);
assert.match(app, /class="hub-name">\$\{esc\(title\)\}<\/span><span class="ward-lv" hidden><\/span>/);
const headingBlock = app.slice(app.indexOf("  const hubHeading = $('.hub-title', wrap);"), app.indexOf("  const floatingGear = $('#gearBtn');", app.indexOf("  const hubHeading = $('.hub-title', wrap);")));
const chip = {}, heading = {classList:{toggle:(_,on)=>{heading.identity=on;}}};
for (const tab of ['wardrobe','shop','crates','wardrobe']) {
  vm.runInNewContext(headingBlock, {tab,lvl:{level:21},wrap:{},$:s=>s==='.hub-title'?heading:chip});
  assert.equal(heading.hidden, tab==='shop');
  assert.equal(heading.identity, tab==='wardrobe');
  assert.equal(chip.hidden, tab!=='wardrobe');
  assert.equal(chip.textContent, 'Lv 21');
}
console.log('PASS wardrobe header: separate earned title preserves digits, live wallet/collection values, one name-row level chip and tab restoration. Geometry UNPROVEN.');

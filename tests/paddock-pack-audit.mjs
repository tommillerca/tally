import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = path.resolve(process.argv[2] || process.cwd());
const read = f => fs.readFileSync(path.join(root,f),'utf8');
const app = read('js/app.js'), css = read('app.css');
const source = read('js/paddock.js').replace(/^import .*;\n/gm,'');
const P = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let failed = 0;
async function check(name, fn) { try { console.log('PASS '+name+' '+await fn()); } catch(e) { failed++;console.log('FAIL '+name+' '+e.message); } }
const motions = ['hover','fly','flop','walk','walk','walk','walk'];
const roster = Array.from({length:200},(_,i)=>({iid:'pet-'+i,sp:['C1','C2','C3','C4','C5','C6','CX'][i%7],motion:motions[i%7]}));
await check('R44-12 packing', () => {
  // Conservative motion envelopes, from production placement and CSS, not DOM measurements.
  const cast = P.placePaddock(roster,undefined,'2026-09-07');
  const oldDrift = css.includes('translateX(-30px)');
  const entries=Object.entries(cast);
  assert.ok(entries.length>10,'empty or undersized cast');
  let bad=0, samples=0, worst='';
  for (const width of [320,375,393]) for(let t=0;t<60;t+=.125) {
    const boxes=entries.map(([iid,p])=>{
      let x0,x1,y0,y1;
      if(p.kind==='fly') {
        const u=((t-(p.phase||0))/p.dur)%1;
        x0=-170+610*u;x1=x0+p.w;y0=p.y-Math.round(p.w*.5);y1=y0+Math.round(p.w*.8);
      } else {
        x0=p.kind==='walk'?p.x0:p.x;
        x1=p.kind==='walk'?p.x1:p.x+p.w;
        if(p.kind==='hover') { x0-=oldDrift?30:0; x1+=oldDrift?30:(p.range||0); }
        y0=p.y-p.w;y1=p.y;
      }
      return {iid,x0:Math.max(0,x0),x1:Math.min(width,x1),y0,y1};
    }).filter(b=>b.x1>b.x0);
    for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) {
      samples++;
      const a=boxes[i],b=boxes[j],ox=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0),oy=Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0);
      if(ox>20&&oy>20) {bad++;worst=`${ox.toFixed(1)}x${oy.toFixed(1)}`;}
    }
  }
  assert.equal(bad,0,`${entries.length} placed; ${bad} pair-samples exceed 20px in both axes; last ${worst}px`);
  assert.ok(samples>10000);
  return `${entries.length}/200 placed; 0 overlaps across ${samples} conservative pair-samples (Node model only)`;
});
await check('R44-20 selected instances are placed',()=>{
  for(const motion of ['fly','hover','flop','walk']) {
    const rows=Array.from({length:200},(_,i)=>({iid:'x'+i,motion}));
    rows[199].equipped=true;rows[198].breeding=true;rows[197].breeding=true;
    const out=P.placePaddock(rows,undefined,'2026-09-07');
    for(const i of [197,198,199]) assert.ok(out['x'+i],`${motion} selected x${i} missing from field`);
    assert.notDeepEqual(Object.keys(P.placePaddock(rows,undefined,'2026-09-08')),Object.keys(out),'resting copies never rotate');
  }
  return 'all 3 selected instances placed for all 4 motion classes; daily rotation holds';
});
await check('R44-20 actual sprite markup',()=>{
  const start=app.indexOf('  const petHtml = r => {',app.indexOf('function paddockSceneHtml'));
  const end=app.indexOf('\n  return `',start);
  assert.ok(start>0&&end>start,'sprite builder missing');
  const build=vm.runInNewContext(app.slice(start,end)+'\npetHtml',{
    places:{chosen:{kind:'walk',w:76,y:338,x0:86,x1:164}},
    petSpriteHtml:()=>'<img alt="fixture">',BH_BY_ID:{C4:{rarity:'common'}}
  });
  const markup=build({iid:'chosen',sp:'C4',equipped:true,breeding:true});
  assert.match(markup,/>OUT WITH YOU</,'equipped label absent');
  assert.match(markup,/>BREEDING</,'breeding label absent');
  assert.ok(!build({iid:'chosen',sp:'C4'}).includes('pdk-state'),'unselected pet marked');
  const wiringStart=app.indexOf('  const breeding =',app.indexOf('async function openPaddock'));
  const wiringEnd=app.indexOf('  /* THE HERD',wiringStart);
  assert.ok(wiringStart>0,'field does not read saved selection');
  const rows=vm.runInNewContext(app.slice(wiringStart,wiringEnd)+'\nroster',{
    S:{settings:{stableBreed:{iids:['chosen']}}},rows:[{iid:'chosen',sp:'C4'},{iid:'other',sp:'C4'}],eqIid:'chosen',eqOwn:{C:'C4'}
  });
  assert.ok(rows[0].equipped&&rows[0].breeding&&!rows[1].equipped&&!rows[1].breeding);
  assert.match(css,/\.pdk-state\s*\{/,'state labels lack CSS');
  return 'saved iid -> roster -> both visible text labels; same-species neighbour stays unmarked';
});
const stableStart=app.indexOf('async function openStable(opts = {}) {');
const init=app.slice(stableStart+'async function openStable(opts = {}) {'.length,app.indexOf('  // which pet the carousel',stableStart));
const clickStart=app.indexOf("    $$('[data-breedsel]', body)",stableStart);
const clickEnd=app.indexOf('    /* THE FIRST PICK',clickStart);
const cancelStart=app.indexOf("    $('#breedCancel', body)",stableStart);
const cancelEnd=app.indexOf('\n',cancelStart);
await check('R44-25 breeding persistence and cancel',()=>{
  const S={settings:{}};let saves=0;
  const open=()=>{
    const handlers={};
    const context={S,Map,saveSettings:()=>saves++,body:{},render:()=>{},$$:()=>[{dataset:{breedsel:'chosen'},addEventListener:(event,fn)=>handlers.pick=fn}],$:()=>({addEventListener:(event,fn)=>handlers.cancel=fn})};
    const state=vm.runInNewContext(init+app.slice(clickStart,clickEnd)+app.slice(cancelStart,cancelEnd)+'\n({selection:()=>sel})',context);
    return {...state,...handlers};
  };
  open().pick();
  const reopened=open();
  assert.equal(reopened.selection().join(','),'chosen','closing/reopening lost the breeding pick');
  reopened.cancel();
  assert.equal(open().selection().length,0,'cancel did not persist');
  assert.ok(saves>=2,'settings were never saved');
  return 'pick survives reopen; Cancel survives reopen';
});
await check('R44-25 copy rail restores 2160px',()=>{
  assert.ok(init.includes('const rememberKin ='),'no production copy-scroll preservation');
  let kin={dataset:{sp:'C4'},scrollLeft:2160};
  const context={S:{settings:{}},Map,saveSettings:()=>{},$:()=>kin};
  const f=vm.runInNewContext(init+'\n({rememberKin,restoreKin})',context);
  f.rememberKin({});
  kin={dataset:{},scrollLeft:0};f.restoreKin({},'C4');
  assert.equal(kin.scrollLeft,2160,'copy tap lost 2160px');
  f.restoreKin({},'C1');assert.equal(kin.scrollLeft,0,'another species inherited scroll');
  f.restoreKin({},'C4');assert.equal(kin.scrollLeft,2160,'returning species lost scroll');
  const render=app.slice(stableStart,app.indexOf('/* THE SIX ORDINARY',stableStart));
  assert.ok(render.indexOf('rememberKin(body);')<render.indexOf('body.innerHTML ='),'capture occurs after DOM replacement');
  assert.match(render,/body\.scrollTop = bodyScroll;\s*restoreKin\(body, focused\?\.sp\)/,'re-render does not restore body and copy scroll');
  assert.match(render,/rememberKin\(body\);\s*kin\.innerHTML = kinChips\(inst\);[\s\S]*?restoreKin\(body, inst\.sp\)/,'carousel caption loses species scroll');
  return '2160px restored after replacement; per-species state; production rebuild and repaint hooks present (no DOM proof)';
});
await check('R44-17 scoreboard units',()=>{
  assert.match(read('js/paddock-cards.js'),/Pets are individual copies\. Kinds are species, including the founder/,'Paddock counts have no unit explanation');
  assert.match(app.slice(stableStart),/species colourways &middot; founder excluded/,'Stable Kennel door has no cell unit');
  assert.ok(!app.slice(stableStart,app.indexOf('/* THE SIX ORDINARY',stableStart)).includes('out in the field</small>'),'Stable door falsely claims every pet is in field');
  return 'copies, species (CX included), species colourways (CX excluded) named separately';
});
console.log(`${6-failed}/6 R1 Node guards pass. Real-render proofs were not run.`);
process.exitCode=failed?1:0;

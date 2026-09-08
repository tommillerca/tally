// Reviewer-only. Never executed in the implementation sandbox.
// Run from the target checkout: node /tmp/r1-proof/r1-browser-audit.mjs http://127.0.0.1:PORT/
// Serve precisely that checkout. Repeat against a throwaway pre-fix copy for red.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const base=process.argv[2];
assert(base && ['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'explicit local checkout URL required');
const {boot,seed,sleep,setWidth,dismissOverlays}=await import(pathToFileURL(path.resolve('tests/godmode.js')));
const {browser,page,errors}=await boot(base);
const shots=path.resolve(process.argv[3]||'/tmp/r1-proof/browser');fs.mkdirSync(shots,{recursive:true});
let failures=0, checks=0;
const row=async(name,fn)=>{checks++;try{console.log('PASS '+name+' '+await fn());}catch(e){failures++;console.log('FAIL '+name+' '+e.message);}};
const click=async selector=>{await page.waitForSelector(selector,{visible:true});await page.click(selector);await sleep(900);};
const close=async()=>{await click('#sheets > div:last-child .sheet-close');};
try {
  await seed(page,{level:30,coins:5000,dust:5000});
  await page.evaluate(async()=>{
    assertDemo();function assertDemo(){if(!new URLSearchParams(location.search).has('demo'))throw Error('demo fixture required');}
    const {kvSet,kvGet}=await import('/js/db.js');
    const species=['C1','C2','C3','C4','C5','C6','CX'];
    const insts=Array.from({length:200},(_,i)=>({iid:'r1-'+i,sp:species[i%7],lineage:0,shiny:false,morph:'base',hatchedAtSteps:0}));
    await kvSet('petInst',insts);await kvSet('petLvlV',2);await kvSet('petLvlSteps',{});
    await kvSet('petEquipped','r1-3');await kvSet('equipped',{...await kvGet('equipped',{}),C:'C4'});
    await kvSet('settings',{...await kvGet('settings',{}),stableBreed:{iids:[],keep:null}});
  });
  await page.reload({waitUntil:'networkidle2'});await sleep(2000);await dismissOverlays(page);
  for(const [width,height] of [[320,568],[375,667],[393,852]]) {
    await setWidth(page,width,height,2);
    await page.evaluate(()=>{location.hash='#/friends';});await sleep(1000);
    await page.evaluate(()=>{location.hash='#/today';});await sleep(1200);
    await click('#stableBtn');
    if(await page.$('#breedCancel')) await click('#breedCancel');
    let selected='';
    await row(`R44-25 copy scroll ${width}x${height}`,async()=>{
      selected=await page.evaluate(()=>{
        const rail=document.querySelector('#stableBody .cf-kin');
        if(!rail||rail.children.length<20)throw Error('full species copy rail missing');
        const target=rail.lastElementChild;target.scrollIntoView({block:'center',inline:'center',behavior:'instant'});return target.dataset.kin;
      });
      await sleep(350);
      const before=await page.$eval('#stableBody .cf-kin',el=>el.scrollLeft);
      assert(before>1000,`copy row did not scroll far enough: ${before}`);
      await click(`#stableBody [data-kin="${selected}"]`);
      const after=await page.$eval('#stableBody .cf-kin',el=>el.scrollLeft);
      assert(Math.abs(after-before)<=2,`lost ${(before-after).toFixed(1)}px (${before} -> ${after})`);
      assert.equal(await page.$eval('#stableBody [data-eq]',el=>el.dataset.eq),selected);
      return `${before.toFixed(1)} -> ${after.toFixed(1)}px`;
    });
    await row(`R44-25 pick reopen ${width}x${height}`,async()=>{
      assert(selected,'no instance selected');
      const selector=`#stableBody [data-breedsel="${selected}"]`;
      await page.$eval(selector,el=>el.scrollIntoView({block:'center',behavior:'instant'}));
      await click(selector);
      await close();await click('#stableBtn');
      assert(await page.$('#breedCancel'),'breeding selection was lost on leaving sheet');
      return 'first breeding pick survives Done and reopen';
    });
    await page.$eval('#stableToPaddock',el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    await click('#stableToPaddock');await page.waitForSelector('.pdk-pet');
    await row(`R44-12 real packing ${width}x${height}`,async()=>{
      const measurement=await page.evaluate(async()=>{
        const scene=document.querySelector('#pdkScene');if(!scene)throw Error('no scene');
        scene.scrollIntoView({block:'start',behavior:'instant'});
        const pets=[...scene.querySelectorAll('.pdk-pet')];
        if(pets.length<10)throw Error('empty or undersized cast');
        const imgs=pets.flatMap(p=>[...p.querySelectorAll('img')]);if(!imgs.length)throw Error('no sprite images');
        await Promise.all(imgs.map(img=>img.decode()));
        if(imgs.some(img=>!img.naturalWidth))throw Error('blank sprite');
        let comparisons=0,bad=0,worst=0,worstBox='';
        // Includes flyers. Sample every phase of the shared crossing and ambient loops.
        const animations=scene.getAnimations({subtree:true});if(!animations.length)throw Error('no ambient animations');
        animations.forEach(a=>a.pause());
        for(let ms=0;ms<60000;ms+=125){
          animations.forEach(a=>a.currentTime=ms);
          const bounds=scene.getBoundingClientRect();
          const boxes=pets.map(p=>p.getBoundingClientRect()).map(r=>({left:Math.max(bounds.left,r.left),right:Math.min(bounds.right,r.right),top:r.top,bottom:r.bottom})).filter(r=>r.right>r.left);
          for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
            comparisons++;const a=boxes[i],b=boxes[j],x=Math.min(a.right,b.right)-Math.max(a.left,b.left),y=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
            if(x>20&&y>20){bad++;if(x*y>worst){worst=x*y;worstBox=`${x.toFixed(1)}x${y.toFixed(1)}`;}}
          }
        }
        animations.forEach(a=>{a.currentTime=0;a.play();});
        return{drawn:pets.length,comparisons,bad,worstBox};
      });
      assert(measurement.comparisons>10000);assert.equal(measurement.bad,0,JSON.stringify(measurement));
      return JSON.stringify(measurement);
    });
    await row(`R44-20 field states ${width}x${height}`,async()=>{
      const states=await page.evaluate(iid=>{
        const get=id=>document.querySelector(`#pdkScene .pdk-pet[data-iid="${id}"] .pdk-state`);
        const eq=get('r1-3'),br=get(iid);
        return{eq:eq?.textContent,breed:br?.textContent,visible:!!eq&&!!br&&[eq,br].every(el=>getComputedStyle(el).visibility==='visible'&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().height>0)};
      },selected);
      assert(states.visible&&states.eq.includes('OUT WITH YOU')&&states.breed.includes('BREEDING'),JSON.stringify(states));return JSON.stringify(states);
    });
    await page.screenshot({path:path.join(shots,`paddock-${width}x${height}.png`)});
    await close();
    // This is intentionally still red pending the Kennel lane's R44-21 fix.
    await page.$eval('#kennelBtn',el=>el.scrollIntoView({block:'center',behavior:'instant'}));await click('#kennelBtn');
    await row(`R44-21 pending Kennel ${width}x${height}`,async()=>{
      const m=await page.evaluate(()=>{
        const body=document.querySelector('#kennelBody'),grid=body?.querySelector('.k-grid'),head=body?.querySelector('.k-grid-head');
        if(!body||!grid||!head)throw Error('Kennel grid missing');
        body.scrollTop=0;
        const belowFold=grid.getBoundingClientRect().top-body.getBoundingClientRect().bottom;
        const rows=[...grid.querySelectorAll('.k-grid-row')];if(rows.length!==6)throw Error('expected six species');
        let lost=0;
        for(const r of rows){r.scrollIntoView({block:'center',behavior:'instant'});const h=head.getBoundingClientRect(),b=body.getBoundingClientRect();if(h.bottom<=b.top||h.top>=b.bottom)lost++;}
        return{belowFold,lost};
      });
      assert(m.belowFold<=0&&m.lost===0,JSON.stringify(m));return JSON.stringify(m);
    });
    await page.screenshot({path:path.join(shots,`kennel-${width}x${height}.png`)});await close();await close();
  }
  await row('runtime errors',()=>{assert.equal(errors.length,0,JSON.stringify(errors));return '0';});
} finally {await browser.close();}
console.log(`${checks-failures}/${checks} browser rows passed`);process.exitCode=failures?1:0;

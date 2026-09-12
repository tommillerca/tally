// In-page clicks invoke real controls and real handlers, including below the fold.
// This is a real-control audit, not a seam-only audit.
// Cold browser contexts and decoded screenshot pixels prove the reveal.
// Skip means a decoded reveal is currently running (240ms for either recipe).
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
let createCanvas, loadImage;
const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.env.LAB_REVEAL_OUTPUT || '/tmp/lab-reveal-audit';

process.env.HEADLESS_MODE = 'shell';
let server;
let failures = 0, rows = 0;
function check(name, condition, detail) {
  rows++;
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
  if (!condition) failures++;
}
async function reach(page, selector, value) {
  try {
    await page.waitForFunction(selector => {
      const control = document.querySelector(selector);
      return control && !control.disabled && !control.hidden && control.getClientRects().length;
    }, {timeout:5000}, selector);
    await page.evaluate(({selector,value}) => {
      const control = document.querySelector(selector);
      if (!control || control.disabled || control.hidden || !control.getClientRects().length)
        throw new Error(`Control unavailable: ${selector}`);
      control.scrollIntoView({block:'center',behavior:'instant'});
      if (value === undefined) control.click();
      else {
        control.value = value;
        control.dispatchEvent(new Event('input', {bubbles:true}));
        control.dispatchEvent(new Event('change', {bubbles:true}));
      }
    }, {selector,value});
  } catch (error) {
    throw new Error(`Cannot reach ${selector}: ${error.message}`);
  }
}
async function pixels(buffer) {
  const img = await loadImage(buffer), canvas = createCanvas(img.width,img.height);
  const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0);
  return ctx.getImageData(0,0,img.width,img.height).data;
}
try {
  mkdirSync(output, {recursive:true});
  ({createCanvas, loadImage} = await import('@napi-rs/canvas'));
  const {boot, seed, sleep, serveTree, dismissOverlays} = await import('./godmode.js');
  server = process.argv[2] || process.env.URL ? null : await serveTree(root);
  const base = process.argv[2] || process.env.URL || server.url;
  for (const mode of ['normal','reduce','skip']) for (const certain of [true,false]) {
    const reduce = mode === 'reduce', skipEarly = mode === 'skip';
    const name = `${certain ? 'CERTAIN' : 'UNCERTAIN'}${reduce ? '-REDUCED' : skipEarly ? '-SKIPPED' : ''}`;
    let browser;
    try {
      const session = await boot(base,{deviceScaleFactor:1});
      browser = session.browser;
      const page = session.page;
      await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:reduce?'reduce':'no-preference'}]);
      await page.goto(`${base}/?demo=1&godmode=1`,{waitUntil:'networkidle0'});
      await seed(page,{level:12});
      await page.evaluate(async certain => {
        const D = await import('./js/db.js');
        const morphs = certain ? ['toxic','rose','toxic','rose'] : ['base','base','base'];
        const pets = morphs.map((morph,i)=>({iid:`audit-${i}`,sp:'C5',morph,shiny:false,lineage:0,hatchedAtSteps:0}));
        for (const [k,v] of Object.entries({petInst:pets,pets:{C5:{hatchedAtSteps:0}},looks:['C5'],petLvlV:2,petLvlSteps:{},pettalents:{__iidV:2},petEquipped:null,equipped:{},petStepCredit:0})) await D.kvSet(k,v);
        await D.db.put('inv',{id:'audit-C5',kind:'cos',itemId:'C5'});
      },certain);
      await page.reload({waitUntil:'networkidle0'});
      // Isolate reveal pixels from the unrelated sheet entrance transition.
      await page.addStyleTag({content:'#sheets .sheet-body { animation: none !important; opacity: 1 !important; }'});
      await dismissOverlays(page);
      await page.evaluate(()=>{location.hash='#/today';});
      await reach(page,'#charBtn');
      await reach(page,'[data-lab-open]');
      for (const slot of [0,1]) {
        await reach(page,`[data-lab-slot="${slot}"]`);
        await reach(page,`[data-lab-pick="audit-${slot}"]`);
        await sleep(350);
      }
      await reach(page,'[data-lab-review]');
      await page.waitForSelector('#pdGo');
      if (await page.$('#pdIn')) await reach(page,'#pdIn','ANIMATE');
      await page.evaluate(skipEarly=>{
        window.labSeen = null;
        window.labSkipClicked = false;
        if (skipEarly) document.addEventListener('animationstart',event=>{
          if(event.animationName !== 'lab-result-arrive') return;
          const button = document.querySelector('#labSkip:not([hidden])');
          if(button) { button.click(); window.labSkipClicked = true; }
        });
        const observer = new MutationObserver(()=>{
          const el = document.querySelector('.lab-reveal');
          if(el && !window.labSeen) window.labSeen = performance.now();
        });
        observer.observe(document.querySelector('#sheets'),{childList:true,subtree:true});
      },skipEarly);
      await reach(page,'#pdGo');
      check(`REACH ${name}`,true,'all fixture controls invoked through real handlers');
      await page.waitForFunction(()=>!!document.querySelector('.lab-reveal'),{polling:'raf'});
      const art = await page.$('[data-lab-result-art]');
      const box = await art.boundingBox(); assert.ok(box);
      const clip = {x:Math.floor(box.x)-5,y:Math.floor(box.y)-5,width:Math.ceil(box.width)+10,height:Math.ceil(box.height)+10};
      const frames=[];
      for (const target of [30,140,400]) {
        await page.waitForFunction(t=>performance.now()-window.labSeen>=t,{},target);
        const state = await page.evaluate(()=>{
          const el=document.querySelector('.lab-reveal');
          const imgs=[...el.querySelectorAll('img')];
          return {ms:performance.now()-window.labSeen,decoded:imgs.length>0&&imgs.every(i=>i.complete&&i.naturalWidth>0),skip:!!document.querySelector('#labSkip:not([hidden])'),running:el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length,transform:getComputedStyle(el.querySelector('[data-lab-result-art]')).transform};
        });
        const buffer=await page.screenshot({clip});
        writeFileSync(`${output}/${name}-${target}.png`,buffer);
        const capturedMs = await page.evaluate(()=>performance.now()-window.labSeen);
        frames.push({...state,capturedMs,pixels:await pixels(buffer)});
      }
      const control=await page.evaluate(async()=>{
        const D=await import('./js/db.js');
        const receipts=await D.kvGet('labExperiments');
        const r=Object.values(receipts||{}).at(-1);
        return {r,present:(await D.kvGet('petInst')).some(p=>p.iid===r?.result?.iid),outcomes:Number(document.querySelector('.lab-reveal').dataset.outcomes)};
      });
      check(`CONTROL ${name}`,!!control.r?.result?.iid&&control.present&&control.r.distribution?.length===(certain?1:2)&&control.outcomes===(certain?1:2),`distribution=${control.r?.distribution?.length}, pet=${control.r?.result?.iid}, present=${control.present}`);
      check(`DECODE ${name}`,frames.every(f=>f.decoded),'every sampled frame has decoded art');
      let changed=0; for(let i=0;i<frames[0].pixels.length;i+=4) if(frames[0].pixels.slice(i,i+4).some((v,j)=>v!==frames[1].pixels[i+j])) changed++;
      const detail=`changedPixels=${changed}, samplesMs=${frames.map(f=>f.ms.toFixed(1)).join(',')}, capturedMs=${frames.map(f=>f.capturedMs.toFixed(1)).join(',')}`;
      writeFileSync(`${output}/${name}.json`,JSON.stringify({control,changedPixels:changed,frames:frames.map(({pixels,...state})=>state)},null,2)+'\n');
      check(`TIMING ${name}`,frames[0].ms<100&&frames[1].capturedMs<240&&frames[2].ms>=400,'two samples during the 240ms reveal and a +400ms final capture');
      if(skipEarly) {
        check(`SKIP CONTROL ${name}`,await page.evaluate(()=>window.labSkipClicked)&&frames.every(f=>!f.running&&!f.skip),'real Skip reveal button ends the reveal');
      } else if(!reduce) {
        check(name,changed>0&&frames.slice(0,2).every(f=>f.running>0),detail);
        check(`SKIP ${name}`,frames[0].skip&& !frames[2].skip,'visible during reveal, hidden at +400ms');
      } else {
        check(`REDUCED ${name}`,frames.every(f=>!f.running&&!f.skip)&&frames[2].transform==='none'&&changed===0,detail);
      }
      check(`END ${name}`,frames[2].running===0&&['none','matrix(1, 0, 0, 1, 0, 0)'].includes(frames[2].transform),'final size, no reveal animation running');
    } catch (error) {
      check(`FIXTURE ${name}`,false,error.message);
    } finally { await browser?.close(); }
  }
} catch (error) {
  check('FIXTURE SETUP',false,error.message);
} finally { server?.close(); }
console.log(`rows=${rows}, ${failures} failures`);
process.exitCode=failures?1:0;

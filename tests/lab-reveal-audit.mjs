// In-page clicks invoke real controls and real handlers, including below the fold.
// This is a real-control audit, not a seam-only audit.
// Cold browser contexts and decoded screenshot pixels prove the reveal.
// Skip means a decoded reveal is currently running (240ms for either recipe).
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
const hash = buffer => createHash('sha256').update(buffer).digest('hex').slice(0,16);
function changedPixels(a,b) {
  assert.equal(a.length,b.length,'compared regions must have identical dimensions');
  let changed=0;
  for(let i=0;i<a.length;i+=4) {
    if(a[i]!==b[i] || a[i+1]!==b[i+1] || a[i+2]!==b[i+2] || a[i+3]!==b[i+3]) changed++;
  }
  return changed;
}
async function sample(page, name, selector, clock) {
  // Capture the visible viewport, then crop decoded pixels. Puppeteer's clip
  // uses page coordinates, while DOM rects use viewport coordinates. Avoid
  // that ambiguity and any offscreen capture that paints only the background.
  await page.evaluate(async selector => {
    document.querySelector(selector).scrollIntoView({block:'center',behavior:'instant'});
    await new Promise(requestAnimationFrame);
  },selector);
  // Keep crop dimensions fixed for pixel comparisons, but follow the current
  // viewport position on every frame. The untransformed box bounds the scale.
  const size = await page.evaluate(selector => {
    const el=document.querySelector(selector);
    return {width:el.offsetWidth+12,height:el.offsetHeight+12};
  },selector);
  const frames=[];
  for(const target of [30,140,400]) {
    await page.waitForFunction(({clock,target})=>performance.now()-window[clock]>=target,{}, {clock,target});
    const state=await page.evaluate(({selector,clock,size})=>{
      const el=document.querySelector(selector), r=el.getBoundingClientRect();
      const imgs=[...el.querySelectorAll('img')];
      const v=window.visualViewport;
      return {ms:performance.now()-window[clock],
        region:{x:Math.floor(r.x+r.width/2-size.width/2),
          y:Math.floor(r.y+r.height/2-size.height/2),...size},
        rect:{x:r.x,y:r.y,width:r.width,height:r.height},
        viewport:{x:v?.offsetLeft||0,y:v?.offsetTop||0,width:v?.width||innerWidth,height:v?.height||innerHeight},
        scrollers:(()=>{
          const result=[];
          for(let parent=el.parentElement;parent;parent=parent.parentElement) {
            if(/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
              const rect=parent.getBoundingClientRect();
              result.push({element:parent.id||parent.className,scrollTop:parent.scrollTop,clientHeight:parent.clientHeight,
                rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}});
            }
          }
          return result;
        })(),
        decoded:imgs.length>0&&imgs.every(i=>i.complete&&i.naturalWidth>0),
        skip:!!document.querySelector('#labSkip:not([hidden])'),
        running:el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length,
        animations:el.getAnimations({subtree:true}).map(a=>({name:a.animationName||'WAAPI',
          target:a.effect?.target?.tagName,properties:[...new Set(a.effect?.getKeyframes().flatMap(k=>Object.keys(k)))]})),
        transform:getComputedStyle(el).transform};
    },{selector,clock,size});
    const region=state.region;
    const contains=(outer,inner)=>inner.x>=outer.x&&inner.y>=outer.y&&
      inner.x+inner.width<=outer.x+outer.width&&inner.y+inner.height<=outer.y+outer.height;
    const contained=contains(region,state.rect), visible=contains(state.viewport,region);
    console.log(`REGION ${name}-${target}: sample=${JSON.stringify(region)}, animated=${JSON.stringify(state.rect)}, viewport=${JSON.stringify(state.viewport)}, scrollers=${JSON.stringify(state.scrollers)}, contains=${contained}, visible=${visible}`);
    assert.ok(contained&&visible,`sample must contain the animated box and be fully visible: animated=${JSON.stringify(state.rect)}, sample=${JSON.stringify(region)}, scrollers=${JSON.stringify(state.scrollers)}`);
    const buffer=await page.screenshot({type:'png',captureBeyondViewport:false});
    const capturedMs=await page.evaluate(clock=>performance.now()-window[clock],clock);
    const img=await loadImage(buffer), v=state.viewport;
    const sx=img.width/v.width, sy=img.height/v.height;
    const canvas=createCanvas(region.width,region.height), ctx=canvas.getContext('2d');
    ctx.drawImage(img,(region.x-v.x)*sx,(region.y-v.y)*sy,region.width*sx,region.height*sy,0,0,region.width,region.height);
    const crop=canvas.toBuffer('image/png');
    writeFileSync(`${output}/${name}-${target}.png`,crop);
    writeFileSync(`${output}/${name}-${target}-viewport.png`,buffer);
    const frame={...state,capturedMs,bytes:buffer.length,hash:hash(buffer),cropBytes:crop.length,cropHash:hash(crop),
      pixels:ctx.getImageData(0,0,region.width,region.height).data};
    console.log(`FRAME ${name}-${target}: bytes=${frame.bytes}, hash=${frame.hash}, cropBytes=${frame.cropBytes}, cropHash=${frame.cropHash}`);
    frames.push(frame);
  }
  const changed=changedPixels(frames[0].pixels,frames[1].pixels);
  const detail=`changedPixels=${changed}, samplesMs=${frames.map(f=>f.ms.toFixed(1)).join(',')}, capturedMs=${frames.map(f=>f.capturedMs.toFixed(1)).join(',')}`;
  writeFileSync(`${output}/${name}.json`,JSON.stringify({sampling:"per-frame current rect with fixed untransformed size plus 12px margin",changedPixels:changed,frames:frames.map(({pixels,...state})=>state)},null,2)+'\n');
  return {frames,changed,detail};
}
async function samplerControl(page,name) {
  await page.evaluate(()=>{
    const stage=document.createElement('div');
    stage.id='labSampler';
    stage.style.cssText='position:fixed;left:20px;top:100px;width:280px;height:100px;background:#000;z-index:2147483647;';
    const mover=document.createElement('div');
    mover.style.cssText='width:64px;height:64px;background:#fff;';
    stage.append(mover); document.body.append(stage);
    mover.animate([{transform:'translateX(0)'},{transform:'translateX(200px)'}],{duration:600,iterations:Infinity,direction:'alternate'});
    window.labSamplerSeen=performance.now();
  });
  try {
    const {frames,changed,detail}=await sample(page,`SAMPLER-${name}`,'#labSampler','labSamplerSeen');
    const valid=changed>1000&&frames.slice(0,2).every(f=>f.running>0);
    check(`SAMPLER ${name}`,valid,detail);
    return valid;
  } catch(error) {
    check(`SAMPLER ${name}`,false,error.message);
    return false;
  } finally { await page.evaluate(()=>document.querySelector('#labSampler')?.remove()); }
}

try {
  mkdirSync(output, {recursive:true});
  ({createCanvas, loadImage} = await import('@napi-rs/canvas'));
  const {boot, seed, sleep, serveTree, dismissOverlays} = await import('./godmode.js');
  server = process.argv[2] || process.env.URL ? null : await serveTree(root);
  const base = process.argv[2] || process.env.URL || server.url;
  console.log('AUDIT viewport=393x852; whole animated box required; no partial-region fallback');
  cases: for (const mode of ['normal','reduce','skip']) for (const certain of [true,false]) {
    const reduce = mode === 'reduce', skipEarly = mode === 'skip';
    const name = `${certain ? 'CERTAIN' : 'UNCERTAIN'}${reduce ? '-REDUCED' : skipEarly ? '-SKIPPED' : ''}`;
    let browser;
    try {
      const session = await boot(base,{deviceScaleFactor:1,defaultViewport:{width:393,height:852,isMobile:true,hasTouch:true}});
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
      const samplerOK=await samplerControl(page,name);
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
      const {frames,changed,detail}=await sample(page,name,'[data-lab-result-art]','labSeen');
      check(`FIXTURE ${name}`,true,'all three samples contain the whole animated box and are fully visible');
      const control=await page.evaluate(async()=>{
        const D=await import('./js/db.js');
        const receipts=await D.kvGet('labExperiments');
        const r=Object.values(receipts||{}).at(-1);
        return {r,present:(await D.kvGet('petInst')).some(p=>p.iid===r?.result?.iid),outcomes:Number(document.querySelector('.lab-reveal').dataset.outcomes)};
      });
      writeFileSync(`${output}/${name}-control.json`,JSON.stringify(control,null,2)+'\n');
      check(`CONTROL ${name}`,!!control.r?.result?.iid&&control.present&&control.r.distribution?.length===(certain?1:2)&&control.outcomes===(certain?1:2),`distribution=${control.r?.distribution?.length}, pet=${control.r?.result?.iid}, present=${control.present}`);
      check(`DECODE ${name}`,frames.every(f=>f.decoded),'every sampled frame has decoded art');
      if(!samplerOK) console.log(`VOID ${name}: sampler failed; pixel-dependent rows cannot pass`);
      check(`TIMING ${name}`,frames[0].ms<100&&frames[1].capturedMs<240&&frames[2].ms>=400,'two samples during the 240ms reveal and a +400ms final capture');
      if(skipEarly) {
        check(`SKIP CONTROL ${name}`,samplerOK&&await page.evaluate(()=>window.labSkipClicked)&&frames.every(f=>!f.running&&!f.skip),'real Skip reveal button ends the reveal');
      } else if(!reduce) {
        const animated=changed>0&&frames.slice(0,2).every(f=>f.running>0);
        check(name,samplerOK&&animated,detail);
        if(certain&&samplerOK&&!animated) console.log('CERTAIN RED: sampler and fixture passed; the tested build has an incomplete animation fix');
        check(`SKIP ${name}`,frames[0].skip&&frames[0].running>0&&frames.every(f=>f.skip===(f.running>0))&&!frames[2].skip,'the 240ms arrival is something to skip even with one outcome; visible only while it runs');
      } else {
        check(`REDUCED ${name}`,samplerOK&&frames.every(f=>!f.running&&!f.skip)&&frames[2].transform==='none'&&changed===0,detail);
      }
      if(!certain&&!reduce&&!skipEarly&&samplerOK&&!(changed>0&&frames.slice(0,2).every(f=>f.running>0))) {
        console.log('STOP UNCERTAIN: valid sampler and fixture but animation failed; investigate before continuing');
        break cases;
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

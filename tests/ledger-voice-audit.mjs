import { boot, sleep } from './godmode.js';
const D='/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/a40abded-9d02-469c-8111-2200136500f1/scratchpad/shots';
const { browser, page } = await boot(process.env.URL);
let bad=0; const check=(l,ok,d='')=>{console.log(`${ok?'ok  ':'FAIL'} ${l}${d?'  '+d:''}`); if(!ok)bad++;};
await page.evaluate(() => { location.hash='#/today'; }); await sleep(2500);
await page.evaluate(() => { document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil')?.remove();
  const s=document.createElement('style'); s.textContent='.demo-badge,#demoBadge{display:none!important}#toast{display:none!important}'; document.head.appendChild(s); });
const r = await page.evaluate(() => {
  const f = el => el ? getComputedStyle(el).fontFamily.split(',')[0].replace(/['"]/g,'') : null;
  const empt=[...document.querySelectorAll('.meal-empty')].map(e=>e.textContent.trim());
  return {
    mealHeadFont: f(document.querySelector('.meal-head h2')),
    ringLblFont: f(document.querySelector('.ring-center .lbl')),
    sectHFont: f(document.querySelector('.sect-h')),
    signoff: document.querySelector('.day-signoff')?.textContent.trim(),
    signoffIsLast: document.querySelector('#screen > :last-child')?.className,
    emptyLines: empt,
    microStillThere: !!document.querySelector('.micro-line'),
  };
});
console.log(JSON.stringify(r,null,1));
check('meal names wear his lettering', r.mealHeadFont==='Bangers', r.mealHeadFont);
check('the ring label matches its own number', r.ringLblFont==='Bangers', r.ringLblFont);
check('but section headers stay chrome, not voice', r.sectHFont!=='Bangers', r.sectHFont);
check('an empty meal now says something', r.emptyLines.length>0, JSON.stringify(r.emptyLines));
check('the page ends on him, not on a lab result', /day-signoff/.test(r.signoffIsLast||''), r.signoffIsLast);
check('and the micronutrients are still there, just no longer last', r.microStillThere);
check('the sign-off counts the entries', /\d/.test(r.signoff||''), r.signoff);
// the close
await page.evaluate(() => document.querySelector('.day-signoff')?.scrollIntoView({block:'center'}));
await sleep(600);
await page.screenshot({ path:`${D}/ledger-close.png`, clip:{x:0,y:380,width:430,height:520} });
// an empty meal
await page.evaluate(() => [...document.querySelectorAll('section.meal')].find(m=>/Dinner/.test(m.textContent))?.scrollIntoView({block:'center'}));
await sleep(600);
await page.screenshot({ path:`${D}/ledger-empty.png`, clip:{x:0,y:300,width:430,height:420} });
console.log('shots written');
await browser.close();
console.log(bad?`\n${bad} FAILED`:'\nLEDGER VOICE VERIFIED');
process.exit(bad?1:0);

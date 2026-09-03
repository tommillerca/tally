import { boot, sleep, shotDir } from './godmode.js';
const D = shotDir('tally-shots');  // machine-local, see godmode shotDir
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
/* 'shell', not 'new': on this Mac Page.captureScreenshot never returns under
   headless 'new', and this suite takes a screenshot. Measured 2026-09-03 on a
   4-cell probe (headless new|shell x captureBeyondViewport default|false):
   'new' hit the 45s protocolTimeout on BOTH cbv settings, 'shell' returned in
   234ms. So the camera was the fault, not the clip. See boot(). */
const { browser, page } = await boot(process.argv[2] || process.env.URL, { headless: process.env.HEADLESS_MODE || 'shell' });
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
    // the DAY's tail, not the PAGE's: see the check below for why they differ
    signoffLastInDay: (() => { const so = document.querySelector('.day-signoff');
      return so ? so.parentElement.lastElementChild === so : null; })(),
    micBeforeSignoff: (() => { const so = document.querySelector('.day-signoff'), m = document.querySelector('.micro-line');
      return (so && m) ? !!(m.compareDocumentPosition(so) & Node.DOCUMENT_POSITION_FOLLOWING) : null; })(),
    dayTail: document.querySelector('.day-signoff')?.parentElement?.lastElementChild?.className || null,
    emptyLines: empt,
    microStillThere: !!document.querySelector('.micro-line'),
  };
});
console.log(JSON.stringify(r,null,1));
check('meal names wear his lettering', r.mealHeadFont==='Bangers', r.mealHeadFont);
check('the ring label matches its own number', r.ringLblFont==='Bangers', r.ringLblFont);
check('but section headers stay chrome, not voice', r.sectHFont!=='Bangers', r.sectHFont);
check('an empty meal now says something', r.emptyLines.length>0, JSON.stringify(r.emptyLines));
/* RE-ANCHORED 2026-09-03, and the app did NOT regress. This read
   `#screen > :last-child` and required day-signoff. One thing is now queued
   deliberately BELOW the whole day: LOG_ONLY_LINE, whose own app.css
   comment calls it "fine print you can find rather than a notice". So #screen's
   tail is p.log-only and is meant to be, and this row was grading page furniture
   rather than its own subject.
   Its subject is THE DAY, and the defect it was written for is the day ending on
   a micronutrient string. Measured on origin/main a876d8f4: .day-signoff is the
   last element child of details.dayrest and .micro-line precedes it, which is
   exactly what the fix was. BOTH elements must be present, so a day that
   rendered neither cannot satisfy an ordering rule by having nothing to order. */
check('the day ends on him, not on a lab result', r.signoffLastInDay === true && r.micBeforeSignoff === true, `day tail .${r.dayTail}`);
check('and the micronutrients are still there, just no longer last', r.microStillThere);
check('the sign-off counts the entries', /\d/.test(r.signoff||''), r.signoff);
// the close
await page.evaluate(() => document.querySelector('.day-signoff')?.scrollIntoView({block:'center'}));
await sleep(600);
/* THE SHOTS ARE FOR READING, NOT FOR GRADING, so they must not be able to
   swallow the result. Before the pin above, page.screenshot threw here AFTER
   every row had printed: no summary line, no exit code, and a browser left
   open. The verdict is the evidence; a camera that fails says so and the run
   still ends on its own count. */
try {
  await page.screenshot({ path:`${D}/ledger-close.png`, clip:{x:0,y:380,width:430,height:520} });
  // an empty meal
  await page.evaluate(() => [...document.querySelectorAll('section.meal')].find(m=>/Dinner/.test(m.textContent))?.scrollIntoView({block:'center'}));
  await sleep(600);
  await page.screenshot({ path:`${D}/ledger-empty.png`, clip:{x:0,y:300,width:430,height:420} });
  console.log('shots written');
} catch (e) { console.log(`shots FAILED (reading only, verdict below stands): ${String(e).split('\n')[0]}`); }
await browser.close();
console.log(bad?`\n${bad} FAILED`:'\nLEDGER VOICE VERIFIED');
process.exit(bad?1:0);

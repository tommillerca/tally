/* Confirm pass. The accent rule is only real if a waiting row looks different
 * from a quiet one, so capture BOTH states and assert the colours differ. */
import { boot, sleep } from './godmode.js';
const DIR='/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/a40abded-9d02-469c-8111-2200136500f1/scratchpad/shots';
const { browser, page } = await boot(process.env.URL);
let bad=0; const check=(l,ok,d='')=>{console.log(`${ok?'ok  ':'FAIL'} ${l}${d?'  '+d:''}`); if(!ok)bad++;};
const hush = () => page.evaluate(() => {
  document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil')?.remove();
  const t=document.getElementById('toast'); if(t){t.hidden=true;t.textContent='';}
  const s=document.createElement('style'); s.textContent='.demo-badge,#demoBadge{display:none!important}#toast{display:none!important}'; document.head.appendChild(s);
});
const read = () => page.evaluate(() => {
  const card=document.querySelector('.card.out-there');
  if(!card) return {none:true};
  return {
    height: Math.round(card.getBoundingClientRect().height),
    title: card.querySelector('.ot-head')?.textContent.trim(),
    rows: [...card.querySelectorAll('.glutton-banner')].map(b => ({
      name: b.querySelector('.gbn-txt i')?.textContent.trim(),
      line: b.querySelector('.gbn-txt b')?.textContent.trim().slice(0,34),
      eyebrow: getComputedStyle(b.querySelector('.gbn-txt i')).color,
      action: b.classList.contains('has-action'),
    })),
  };
});
// STATE A: nothing waiting
await page.evaluate(() => { location.hash='#/today'; }); await sleep(2400); await hush();
const quiet = await read();
console.log('QUIET:', JSON.stringify(quiet.rows.map(r=>`${r.name}|${r.action?'ACT':'--'}|${r.eyebrow}`)));
check('one card, not four', !quiet.none && !!quiet.title, quiet.title);
check('all four features still listed', quiet.rows.length === 4, `${quiet.rows.length} rows`);
check('with nothing waiting, no row claims the accent', quiet.rows.every(r=>!r.action));
const eyeColors = new Set(quiet.rows.map(r=>r.eyebrow));
check('and every eyebrow is the same quiet colour', eyeColors.size === 1, [...eyeColors].join(' / '));
let el = await page.$('.card.out-there'); await el.screenshot({ path: `${DIR}/ot-quiet.png` });

// STATE B: crops ready -> that row must light up AND lead
await page.evaluate(async () => {
  const db=await import('./js/db.js'), g=await import('./js/garden.js');
  await g.grantSeed('graveroot',1); await g.plantSeed('graveroot');
  const raw=await db.kvGet('garden'); raw.plots=raw.plots.map(p=>p?{...p,readyAt:Date.now()-1000}:p);
  await db.kvSet('garden', raw);
});
await page.reload({ waitUntil:'networkidle2' }); await sleep(2800); await hush();
const busy = await read();
console.log('BUSY :', JSON.stringify(busy.rows.map(r=>`${r.name}|${r.action?'ACT':'--'}|${r.eyebrow}`)));
const garden = busy.rows.find(r=>/garden/i.test(r.name||''));
check('the ready crop row takes the accent', !!garden && garden.action, JSON.stringify(garden));
check('and its eyebrow colour actually differs from the quiet rows',
      garden && garden.eyebrow !== quiet.rows[0].eyebrow, `${garden?.eyebrow} vs ${quiet.rows[0].eyebrow}`);
check('urgency reorders: the waiting row moves up', busy.rows.findIndex(r=>/garden/i.test(r.name||'')) < 2,
      busy.rows.map(r=>r.name).join(' > '));
el = await page.$('.card.out-there'); await el.screenshot({ path: `${DIR}/ot-busy.png` });
console.log(`\nheights: quiet ${quiet.height}px, busy ${busy.height}px`);
await browser.close();
console.log(bad?`\n${bad} FAILED`:'\nOUT THERE TODAY VERIFIED');
process.exit(bad?1:0);

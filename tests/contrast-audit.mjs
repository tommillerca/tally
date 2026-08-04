/* Re-measure the exact thing the critique flagged: composited contrast on every
 * distinct text/background pair on Today. Token changes do not always propagate. */
import { boot, sleep } from './godmode.js';
const { browser, page } = await boot(process.env.URL);
await page.evaluate(() => { location.hash='#/today'; }); await sleep(2500);
await page.evaluate(() => { document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil')?.remove(); });
const res = await page.evaluate(() => {
  const L = c => { const f=v=>{v/=255; return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};
    return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]); };
  const parse = s => (s.match(/[\d.]+/g)||[]).map(Number);
  const bgOf = el => { // composite through ancestors until opaque
    let n=el;
    while(n && n!==document.documentElement){
      const c=parse(getComputedStyle(n).backgroundColor);
      if(c.length>=3 && (c[3]===undefined || c[3]>0.95)) return c;
      n=n.parentElement;
    }
    return [13,12,18];
  };
  const seen=new Map();
  for (const el of document.querySelectorAll('#screen *')) {
    const txt=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('');
    if(!txt) continue;
    const r=el.getBoundingClientRect(); if(r.width<2||r.height<2) continue;
    const cs=getComputedStyle(el);
    if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity<0.1) continue;
    const fg=parse(cs.color), bg=bgOf(el);
    const l1=L(fg), l2=L(bg);
    const ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    const size=parseFloat(cs.fontSize), w=parseInt(cs.fontWeight)||400;
    const large = size>=24 || (size>=18.66 && w>=700);
    const need = large?3:4.5;
    const key=`${cs.color}|${bg.join(',')}|${size}|${w}`;
    if(!seen.has(key)) seen.set(key,{ratio:+ratio.toFixed(2),need,size,w,fg:cs.color,pass:ratio>=need,
      sample:txt.slice(0,26), sel: el.tagName.toLowerCase()+'.'+(el.className||'').toString().split(' ')[0]});
  }
  const all=[...seen.values()];
  return { pairs: all.length, fails: all.filter(p=>!p.pass) };
});
console.log(`distinct text pairs: ${res.pairs}`);
console.log(`FAILING: ${res.fails.length}`);
for (const f of res.fails.sort((a,b)=>a.ratio-b.ratio).slice(0,10))
  console.log(`   ${f.ratio} (need ${f.need})  ${f.size}px/${f.w}  ${f.fg}  ${f.sel}  "${f.sample}"`);
await browser.close();

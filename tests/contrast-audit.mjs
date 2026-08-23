/* Re-measure the exact thing the critique flagged: composited contrast on every
 * distinct text/background pair on Today. Token changes do not always propagate. */
import { boot, sleep } from './godmode.js';
/* argv FIRST, env.URL second, which is the convention error-telemetry-audit and
   year-readout-audit already use. This read env.URL ONLY, and the release gate
   passes the URL as argv, so inside the gate this was boot(undefined) and godmode's
   signature defaults to https://tommillerca.github.io/tally/: the row sat in the
   FAST tier GRADING PRODUCTION while reading as coverage of the tree under test.
   Measured, invoked exactly as the gate does, against an instrumented local server:
   0 requests reached the tree before this line, 101 after. Count REQUESTS, not the
   pair count it prints, which matches production today only because main was just
   deployed and the two are the same code.
   FIXED HERE AND NOT IN THE GATE ON PURPOSE. Teaching the gate to export env.URL
   looks equivalent and is not: 53 suites read process.env.URL and 24 of them spawn
   their OWN server when it is unset, so exporting it changes what tree two dozen
   suites test, all at once, on one line. One file reading argv like everyone else
   has no blast radius at all. */
const base = process.argv[2] || process.env.URL;
const { browser, page } = await boot(base);
await page.evaluate(() => { location.hash='#/today'; }); await sleep(2500);
await page.evaluate(() => { document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil')?.remove(); });
/* CONTROL. This file reports by NOT finding failures, and a sweep that walks the
   wrong subtree, or whose compositing quietly hands back the same colour for
   everything, finds none either: "0 failing" and "measured nothing" print the
   same. So plant one pair that MUST fail. #2a2a2a on #1a1a1a is a ratio of about
   1.1 against a 4.5 floor, and it is held out of the real report below. */
await page.evaluate(() => {
  const p = document.createElement('div');
  p.className = 'wcag-probe';
  p.style.cssText = 'background:#1a1a1a;color:#2a2a2a;font-size:16px;width:120px;height:20px';
  p.textContent = 'contrast probe';
  document.getElementById('screen')?.appendChild(p);
});
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
const probe = res.fails.find(f => f.sel === 'div.wcag-probe');
res.fails = res.fails.filter(f => f.sel !== 'div.wcag-probe');
res.pairs -= 1;   // the planted control pair is not one of Today's own
console.log(`distinct text pairs: ${res.pairs}`);
console.log(`FAILING: ${res.fails.length}`);
for (const f of res.fails.sort((a,b)=>a.ratio-b.ratio).slice(0,10))
  console.log(`   ${f.ratio} (need ${f.need})  ${f.size}px/${f.w}  ${f.fg}  ${f.sel}  "${f.sample}"`);
await browser.close();
/* IT HAS TO BE ABLE TO GO RED. This printed its report and exited 0 whatever it
   found, which made it the one audit in tests/ that could not fail, so putting it
   on the release gate would have added a row that always says PASS: anti-regression
   rule 1, in the gate itself. Zero pairs is a failure too, not a clean sheet: it
   means Today never rendered and nothing was measured (rule 3). Measured at the
   time this was wired up: 65 pairs, 0 failing. */
if (!res.pairs) {
  console.log('FAIL  no text pairs measured at all: Today did not render, so nothing was checked.');
  process.exit(1);
}
if (!probe) {
  console.log('FAIL  CONTROL the planted 1.1-ratio pair was not caught, so this sweep cannot see a contrast failure and "0 failing" means nothing.');
  process.exit(1);
}
console.log(`ok    CONTROL the planted 1.1-ratio pair was caught (${probe.ratio}, need ${probe.need}), so the sweep can see a failure`);
if (res.fails.length) {
  console.log(`FAILED: ${res.fails.length} of ${res.pairs} text pairs are below the WCAG AA ratio.`);
  process.exit(1);
}

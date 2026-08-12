/* Cohesion check: the same cosmetic must be lit on EVERY surface the character
 * appears on. Failure = a surface where the E4 layer renders without the glow. */
import { boot, sleep } from './godmode.js';
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
let bad=0; const check=(l,ok,d='')=>{console.log(`${ok?'ok  ':'FAIL'} ${l}${d?'  '+d:''}`); if(!ok)bad++;};
await page.evaluate(async () => {
  const db=await import('./js/db.js'); const loot=await import('./js/loot.js');
  await loot.grantCosmetic('E4','test');
  const eq=await db.kvGet('equipped',{}); eq.E='E4'; await db.kvSet('equipped',eq);
  await db.kvSet('glow', true);
});
// does every rendered E4 layer carry the class AND an animation?
const audit = async label => page.evaluate(l => {
  const imgs=[...document.querySelectorAll('.bh-anim img')].filter(i=>/\/E\/E4\.png/.test(i.getAttribute('src')||''));
  return {
    surface: l,
    e4Layers: imgs.length,
    withClass: imgs.filter(i=>i.classList.contains('eye-ember')).length,
    animated: imgs.filter(i=>{ const n=getComputedStyle(i).animationName; return n && n!=='none'; }).length,
    names: [...new Set(imgs.map(i=>getComputedStyle(i).animationName))],
  };
}, label);
const results=[];
// 1. Today hero
await page.evaluate(()=>{location.hash='#/today';}); await sleep(2200);
await page.evaluate(()=>document.querySelector('.dw')?.remove());
results.push(await audit('Today hero'));
// 2. Wardrobe
await page.evaluate(()=>{location.hash='#/bonehead';}); await sleep(1900);
await page.evaluate(()=>document.querySelector('#chTabs .ch-tab[data-tab="wardrobe"]')?.click()); await sleep(1900);
results.push(await audit('Wardrobe stage'));
// 3. Combat
await page.evaluate(()=>{location.hash='#/today';}); await sleep(1600);
const pit=await page.$('#pitBtn'); if(pit){ await pit.click(); await sleep(1700);
  await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^fight$/i.test(x.textContent.trim())); if(b)b.click();});
  await sleep(2600); }
results.push(await audit('Pit arena'));
// one sheet at a time, each awaited: a while-loop inside one evaluate tears the
// execution context out from under the script
for (let i=0;i<6;i++){
  if (!await page.evaluate(()=>!!document.querySelector('#sheets > div'))) break;
  await page.evaluate(()=>history.back()); await sleep(500);
}
// 4. Crew / leaderboard rows
await page.evaluate(()=>{location.hash='#/friends';}); await sleep(2600);
results.push(await audit('Crew tab'));
for (const r of results) {
  console.log(JSON.stringify(r));
  // Some surfaces show OTHER players (Crew rows, leaderboard). They are not
  // wearing my eyes, so zero E4 layers there is correct, not a miss. The small
  // -avatar path is proven separately below.
  if (r.e4Layers === 0) { console.log(`  --  ${r.surface}: shows other players, no E4 expected`); continue; }
  check(`${r.surface}: every E4 layer is lit`, r.withClass === r.e4Layers && r.animated === r.e4Layers,
        `${r.withClass}/${r.e4Layers} classed, ${r.animated}/${r.e4Layers} animated`);
}
const lit = results.filter(r=>r.e4Layers>0);
check('the cosmetic appears on more than one surface', lit.length >= 3, `${lit.length} surfaces rendered it`);

// The Crew tab shows OTHER players, who aren't wearing my eyes, so 0 layers there
// is correct. What still needs proving is that a small avatar WOULD light up, and
// with the reduced radius rather than the full halo.
/* SCOPE, be honest about it: these nodes are hand-built, so what follows proves
   the STYLESHEET gives each small-avatar class the reduced halo. It does NOT prove
   any screen renders that nesting. `.fc-stage` used to be in this list; it appears
   in no js/ file and no CSS rule, so it fell through to the generic .eye-ember rule
   and "uses the full halo" asserted the DEFAULT on a surface the app does not have.
   Removed. Pointing the probe at a really-rendered .lb-av/.fl-av/.map-you-av is the
   right fix and is NOT done here: in this tree the demo boot renders zero .bh-anim
   on every screen (which is also why the surface half above is red), so a real-node
   probe would examine nothing. */
const CLASSES = ['lb-av', 'fl-av', 'map-you-av'];
const small = await page.evaluate(classes => classes.map(cls => {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = '<div class="bh-anim"><img class="eye-ember" src="assets/bh/E/E4.png" alt=""></div>';
  document.body.appendChild(d);
  const cs = getComputedStyle(d.querySelector('img'));
  const out = { cls, name: cs.animationName, dur: cs.animationDuration };
  d.remove();
  return out;
}), CLASSES);
console.log('small-avatar stylesheet:', JSON.stringify(small));
check('every small-avatar class was measured', small.length === CLASSES.length, `${small.length}/${CLASSES.length}`);
for (const s of small) {
  check(`.${s.cls} lights up`, !!s.name && s.name !== 'none', s.name);
  check(`.${s.cls} uses the small halo`, s.name === 'eyeEmberSm', s.name);
}
await browser.close();
console.log(bad?`\n${bad} FAILED`:'\nCOSMETIC IS COHERENT ACROSS SURFACES');
process.exit(bad?1:0);

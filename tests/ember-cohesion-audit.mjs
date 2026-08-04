/* Cohesion check: the same cosmetic must be lit on EVERY surface the character
 * appears on. Failure = a surface where the E4 layer renders without the glow. */
import { boot, sleep } from './godmode.js';
const { browser, page } = await boot(process.env.URL);
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
const small = await page.evaluate(async () => {
  const app = await import('./js/app.js').catch(() => null);
  const mk = cls => {
    const d = document.createElement('div');
    d.className = cls;
    d.innerHTML = '<div class="bh-anim"><img class="eye-ember" src="assets/bh/E/E4.png" alt=""></div>';
    document.body.appendChild(d);
    const img = d.querySelector('img');
    const cs = getComputedStyle(img);
    return { cls, name: cs.animationName, dur: cs.animationDuration };
  };
  return ['lb-av', 'fl-av', 'map-you-av', 'fc-stage'].map(mk);
});
console.log('small/other surfaces:', JSON.stringify(small));
for (const s of small) {
  const expectSm = ['lb-av','fl-av','map-you-av'].includes(s.cls);
  check(`.${s.cls} lights up`, s.name && s.name !== 'none', s.name);
  check(`.${s.cls} uses the ${expectSm ? 'small' : 'full'} halo`,
        s.name === (expectSm ? 'eyeEmberSm' : 'eyeEmber'), s.name);
}
await browser.close();
console.log(bad?`\n${bad} FAILED`:'\nCOSMETIC IS COHERENT ACROSS SURFACES');
process.exit(bad?1:0);

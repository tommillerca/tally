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
  /* Only layers a player can SEE. A shut <details> still lays its content out, so
     a src filter alone picks up the headshots inside the closed news banner that
     v457 added to Today, and app.css deliberately cancels animations behind a
     shut disclosure (one un-compositable animation drops the whole document onto
     the slow path). That decoy is what made this read "2/2 classed, 1/2
     animated": the visible ember was lit the whole time. */
  const imgs=[...document.querySelectorAll('.bh-anim img')]
    .filter(i=>/\/E\/E4\.png/.test(i.getAttribute('src')||''))
    .filter(i=>!i.closest('details:not([open])'));
  return {
    surface: l,
    e4Layers: imgs.length,
    withClass: imgs.filter(i=>i.classList.contains('eye-ember')).length,
    animated: imgs.filter(i=>{ const n=getComputedStyle(i).animationName; return n && n!=='none'; }).length,
    names: [...new Set(imgs.map(i=>getComputedStyle(i).animationName))],
  };
}, label);
/* GO THERE EVEN WHEN WE ARE ALREADY THERE (2026-09-03).
   Every navigation in this file used to be a bare `location.hash = '#/x'`, which
   only re-renders when the hash actually CHANGES. That was fine while boot left
   the hash empty. It stopped being fine when boot started writing one: app.js
   now does `if (!location.hash) history.replaceState(null,'','#/today')` at the
   end of boot(), to kill a double-render on the first tab tap. So by the time
   this file equips E4 the hash is ALREADY '#/today', the assignment fires no
   hashchange, Today is never rebuilt, and the audit graded the hero that had
   been painted at boot -- before the cosmetic existed. It read "0 E4 layers on
   Today", i.e. it accused the app of dropping the player's eyes off the hero.
   Measured both ways on this tree, same fixture: bare assignment -> 0 E4 layers
   on Today, this helper -> 2 (one hero + one news headshot), which is exactly
   what origin/main reports. The other three surfaces were never affected
   because they arrive from a DIFFERENT hash and so changed it for real.
   Dispatching hashchange is what the assignment used to do, not a shortcut
   round it: app.js binds routeFromHash to that event and nothing else. */
const go = async (hash, ms) => {
  await page.evaluate(h => {
    if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else location.hash = h;
  }, hash);
  await sleep(ms);
};
const results=[];
// 1. Today hero
await go('#/today', 2200);
await page.evaluate(()=>document.querySelector('.dw')?.remove());
results.push(await audit('Today hero'));
// 2. Wardrobe
await go('#/bonehead', 1900);
await page.evaluate(()=>document.querySelector('#chTabs .ch-tab[data-tab="wardrobe"]')?.click()); await sleep(1900);
results.push(await audit('Wardrobe stage'));
// 3. Combat
await go('#/today', 1600);
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
await go('#/friends', 2600);
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
   right fix and is NOT done here, but the reason given for that has to be struck:
   "in this tree the demo boot renders zero .bh-anim on every screen (which is also
   why the surface half above is red)". Measured 2026-09-03: the demo boot renders
   FIVE .bh-anim stacks on Today alone. The surface half was red because this file
   never re-rendered Today after equipping (see `go` above), not because the app
   draws nothing. A real-node probe would have plenty to examine; it is simply
   still unwritten. */
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

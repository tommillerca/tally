/* The explainer has to be TRUE: every number in it must come from the constants,
 * or the card will drift from the game the first time a dial is tuned. */
import { boot, sleep, shotDir } from './godmode.js';
const DIR = shotDir('tally-shots');  // machine-local, see godmode shotDir
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

// hold a couple of spires so the banner renders with content
await page.evaluate(async () => {
  const sp = await import('./js/spires.js');
  const db = await import('./js/db.js');
  await db.kvSet('spires', {});
  await sp.claimSpire({ id: 'sp-1-1', name: 'The Ashen Fang', lat: 1, lng: 2, cx: 1, cy: 1, warden: 'W' });
  const st = await sp.spireState();
  st['sp-1-1'].claimedAt = Date.now() - 40 * 86400000;   // a Keeper-tier tower
  st['sp-1-1'].collectedAt = Date.now() - 2 * 86400000;
  st['sp-1-1'].level = 3;
  await db.kvSet('spires', st);
});
// a real reload: the boot render is what reads heldSpires(), and setting the hash
// to the route we are already on fires no hashchange
// boot() already leaves us on #/today, so setting the same hash fires no
// hashchange and we would read a render from BEFORE the spire was seeded. Route
// away to a light screen, then back, and POLL for the banner instead of guessing a
// sleep (the heavy hub render can otherwise land last and clobber Today).
await page.evaluate(() => { location.hash = '#/settings'; });
await sleep(1200);
await page.evaluate(() => { location.hash = '#/today'; });
let ready = false;
for (let i = 0; i < 30; i++) {
  ready = await page.evaluate(() => !!document.querySelector('details.spire-banner'));
  if (ready) break;
  await sleep(500);
}
if (!ready) console.log('the Today card never appeared: not claiming a pass');
await page.evaluate(() => { document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil')?.remove(); document.querySelector('.spire-veil')?.remove(); });
await page.evaluate(() => { const b = document.querySelector('details.spire-banner'); if (b) { b.open = true; b.scrollIntoView({ block: 'center' }); } });
await sleep(700);

const where = await page.evaluate(() => ({
  banner: !!document.querySelector('details.spire-banner'),
  how: !!document.querySelector('.sp-how'),
  onToday: location.hash,
}));
console.log('where:', JSON.stringify(where));
const info = await page.evaluate(async () => {
  const sp = await import('./js/spires.js');
  const card = document.querySelector('.sp-how');
  if (!card) return { none: true };
  const txt = card.textContent.replace(/\s+/g, ' ');
  return {
    steps: card.querySelectorAll('.sp-step').length,
    numbered: [...card.querySelectorAll('.sp-n')].map(n => n.textContent.trim()),
    rules: card.querySelectorAll('.sp-rule').length,
    // NUMBERS ONLY (Tom's call): the steps must carry no icon at all
    svgs: card.querySelectorAll('.sp-step svg').length,
    imgs: card.querySelectorAll('.sp-step img').length,
    nums: [...card.querySelectorAll('.sp-n')].map(n => n.textContent.trim()).join(''),
    // every figure must match the constants, not a hardcoded string
    saysCap: txt.includes(`hold ${sp.SPIRE_CAP}`),
    saysTribute: txt.includes(`${sp.TRIBUTE_PER_DAY} coins`) && txt.includes(`${sp.TRIBUTE_DUST_PER_DAY} dust`),
    saysBank: txt.includes(`${sp.TRIBUTE_CAP_DAYS} days`),
    saysResolve: txt.includes(`within ${sp.RESOLVE_DAYS} days`),
    saysBoon: txt.includes(`+${Math.round(sp.BOON_PER_SPIRE * 100)}%`) && txt.includes(`capped at ${sp.BOON_SPIRE_CAP}`),
    saysTiers: txt.includes('7 / 30 / 100'),
    reassures: /never lost|Never lost/i.test(txt) && /dormant/i.test(txt),
    noProseList: !document.querySelector('.spire-banner .spire-terms'),
  };
});
console.log(JSON.stringify(info, null, 1));
check('the explainer renders in the banner', !info.none);
check('it is four numbered steps', info.steps === 4 && info.numbered.join('') === '1234', JSON.stringify(info.numbered));
check('the steps carry NO icons, just numbers', info.svgs === 0 && info.imgs === 0, `${info.svgs} svg / ${info.imgs} img`);
check('numbered 1 to 4 in order', info.nums === '1234', info.nums);
// Each icon must MEAN its step. A watering can shipped here first, borrowed from the
// Bone Garden purely because the mechanic is internally called "tend", which told a
// player nothing about a tower. No garden or kitchen icon belongs on this card.
check('there is a three-chip rule strip', info.rules === 3, String(info.rules));
check('the tower cap comes from the constant', info.saysCap);
check('tribute coins AND dust per day come from the constants', info.saysTribute);
check('the banking cap comes from the constant', info.saysBank);
check('the resolve window comes from the constant', info.saysResolve);
check('the boon rate AND its cap come from the constants', info.saysBoon);
check('the milestone days are stated', info.saysTiers);
check('it reassures that nothing is ever lost', info.reassures);
check('the old prose list is gone', info.noProseList);

/* The bug Tom spotted: `.sp-txt b` made every INLINE bold a block, so each bold
 * fragment inside a sentence broke onto its own line. Measured, not eyeballed: an
 * inline <b> must compute to display:inline AND sit on the same baseline as the
 * text around it. */
const inlineBolds = await page.evaluate(() => {
  const bolds = [...document.querySelectorAll('.sp-txt small b')];
  return bolds.map(b => {
    const cs = getComputedStyle(b);
    const prev = b.previousSibling;                       // the text before it
    let sameLine = null;
    if (prev && prev.nodeType === 3 && prev.textContent.trim()) {
      const r = document.createRange();
      r.selectNodeContents(prev);
      const pr = r.getBoundingClientRect(), br = b.getBoundingClientRect();
      sameLine = Math.abs(pr.bottom - br.bottom) < 6;     // same baseline
    }
    return { display: cs.display, fontSize: cs.fontSize, sameLine, text: b.textContent.slice(0, 14) };
  });
});
console.log('inline bolds:', JSON.stringify(inlineBolds));
check('there ARE inline bolds to check (an empty set is not a pass)', inlineBolds.length >= 3, `${inlineBolds.length} found`);
check('every inline bold is display:inline, not a block', inlineBolds.every(b => b.display === 'inline'), JSON.stringify(inlineBolds.map(b => b.display)));
// NOT asserting "same line as the preceding text": a bold can legitimately land at
// the start of a wrapped line, and that is normal flow, not the bug. `display` is
// the thing that was broken and it is checked above; font-size too, since the old
// rule also inflated inline bolds to the heading size.
check('and none of them is inflated to the heading size', inlineBolds.every(b => b.fontSize === '12px'), JSON.stringify(inlineBolds.map(b => b.fontSize)));
const heads = await page.evaluate(() => [...document.querySelectorAll('.sp-txt > b')].map(b => getComputedStyle(b).display));
check('while the step HEADINGS are still blocks', heads.length === 4 && heads.every(d => d === 'block'), JSON.stringify(heads));
const lead = await page.evaluate(() => {
  const l = document.querySelector('.sp-n');
  const t = document.querySelector('.sp-txt');
  return { leadW: Math.round(l.getBoundingClientRect().width), textW: Math.round(t.getBoundingClientRect().width) };
});
console.log('columns:', JSON.stringify(lead));
check('the text column gets most of the width', lead.textW > lead.leadW * 8, JSON.stringify(lead));

const el = await page.$('details.spire-banner');
if (el) { await el.screenshot({ path: `${DIR}/spire-explainer.png` }); console.log('shot spire-explainer'); }
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nSPIRE EXPLAINER VERIFIED');
process.exit(bad ? 1 : 0);

/* The explainer has to be TRUE: every number in it must come from the constants,
 * or the card will drift from the game the first time a dial is tuned. */
import { boot, sleep } from './godmode.js';
const DIR = '/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/a40abded-9d02-469c-8111-2200136500f1/scratchpad/shots';
const { browser, page } = await boot(process.env.URL);
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
    icons: card.querySelectorAll('.sp-ico svg, .sp-ico .sp-emoji').length,
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
check('each step is drawn, not just text', info.icons === 4, `${info.icons} icons`);
check('there is a three-chip rule strip', info.rules === 3, String(info.rules));
check('the tower cap comes from the constant', info.saysCap);
check('tribute coins AND dust per day come from the constants', info.saysTribute);
check('the banking cap comes from the constant', info.saysBank);
check('the resolve window comes from the constant', info.saysResolve);
check('the boon rate AND its cap come from the constants', info.saysBoon);
check('the milestone days are stated', info.saysTiers);
check('it reassures that nothing is ever lost', info.reassures);
check('the old prose list is gone', info.noProseList);

const el = await page.$('details.spire-banner');
if (el) { await el.screenshot({ path: `${DIR}/spire-explainer.png` }); console.log('shot spire-explainer'); }
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nSPIRE EXPLAINER VERIFIED');
process.exit(bad ? 1 : 0);

/* Hitting the Gauntlet ceiling must be OBVIOUS. Failure = the cap only readable in
 * body text, or the section summary still claiming a rank you cannot fight. */
import { boot, sleep } from './godmode.js';
const DIR = '/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/a40abded-9d02-469c-8111-2200136500f1/scratchpad/shots';
const { browser, page } = await boot(process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

// reach the capped state honestly: champion beaten, zero world bosses, and enough
// endless wins to sit on the ceiling
const seeded = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const { endlessCeiling } = await import('./js/pit.js');
  const { dateKey } = await import('./js/nutrition.js');
  const rows = await db.db.all('xp');
  for (const r of rows) if (r.type === 'endless' || r.type === 'denboss') await db.db.del('xp', r.key);
  const put = (key, type, n) => db.db.put('xp', { key, type, xp: n, date: dateKey(), note: 'seed' });
  // pitBeatKeys only counts type 'pitrung' / 'pitchamp', and the Champion only
  // opens once every ladder rung is beaten: seed BOTH or the section stays locked
  const { LADDER } = await import('./js/pit.js');
  for (const r of LADDER) await put(`pitrung-${r.rung}`, 'pitrung', 5);
  await put('pitchamp', 'pitchamp', 10);
  const cap = endlessCeiling(0);
  for (let i = 1; i <= cap; i++) await put(`endless-${i}`, 'endless', 5);
  return { cap };
});
console.log('seeded to the cap:', JSON.stringify(seeded));
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1700);
await page.evaluate(() => document.querySelector('.dw')?.remove());
await (await page.$('#pitBtn')).click();
await sleep(2200);

const st = await page.evaluate(() => {
  const sects = [...document.querySelectorAll('.pit-sect')];
  const g = sects.find(s => /Gauntlet/.test(s.querySelector('summary')?.textContent || ''));
  if (!g) return { none: true };
  g.open = true;
  const gate = g.querySelector('.pit-gate');
  return {
    summary: g.querySelector('summary').textContent.replace(/\s+/g, ' ').trim(),
    hasGateCard: !!gate,
    gateHead: gate?.querySelector('.pg-head b')?.textContent.trim(),
    hasMeter: !!gate?.querySelector('.pg-meter'),
    meter: gate?.querySelector('.pg-meter')?.textContent.replace(/\s+/g, ' ').trim(),
    ctaIsButton: gate?.querySelector('#endlessGate')?.tagName === 'BUTTON',
    ctaIsLink: !!gate?.querySelector('a#endlessGate') || (gate?.querySelector('#endlessGate')?.className || '').includes('link'),
    ctaText: gate?.querySelector('#endlessGate')?.textContent.trim(),
    fightBtn: g.querySelector('#endlessBtn')?.textContent.trim(),
    rowSaysRematchOnly: /rematch only/i.test(g.querySelector('.crate-row')?.textContent || ''),
  };
});
console.log('gauntlet at the cap:', JSON.stringify(st));
check('the Gauntlet section exists', !st.none);
check('the SUMMARY says you are at the cap, not a fightable rank', /AT THE CAP/.test(st.summary), st.summary);
check('there is a real gate card, not a sentence in a note', st.hasGateCard);
check('it names the ceiling', /ceiling at rank \d+/i.test(st.gateHead || ''), st.gateHead);
check('it shows the arithmetic (bosses beaten, cap, next cap)', st.hasMeter && /cap \d+/.test(st.meter || ''), st.meter);
check('the way out is a real button, not fine print', st.ctaIsButton && !st.ctaIsLink, `${st.ctaText} (${st.ctaIsButton ? 'button' : 'not a button'})`);
check('the fight row admits it is a rematch only', st.rowSaysRematchOnly && /Rematch/i.test(st.fightBtn || ''), `${st.fightBtn} / ${st.rowSaysRematchOnly}`);

// and the CTA actually goes to the map
await page.evaluate(() => document.querySelector('#endlessGate').click());
await sleep(1800);
const went = await page.evaluate(() => location.hash);
check('the button lands you on the Boneyard', went === '#/boneyard', went);

// UNCAPPED must look different, or the check proves nothing
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const rows = await db.db.all('xp');
  for (const r of rows) if (r.type === 'endless') await db.db.del('xp', r.key);
});
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1600);
await (await page.$('#pitBtn')).click();
await sleep(2000);
const un = await page.evaluate(() => {
  const g = [...document.querySelectorAll('.pit-sect')].find(s => /Gauntlet/.test(s.querySelector('summary')?.textContent || ''));
  g.open = true;
  return { summary: g.querySelector('summary').textContent.replace(/\s+/g, ' ').trim(), hasGate: !!g.querySelector('.pit-gate'), btn: g.querySelector('#endlessBtn')?.textContent.trim() };
});
console.log('gauntlet below the cap:', JSON.stringify(un));
check('below the cap there is NO gate card', un.hasGate === false, JSON.stringify(un));
check('and the summary shows a fightable rank', /rank \d+/.test(un.summary) && !/AT THE CAP/.test(un.summary), un.summary);
check('and the button says Fight', /^Fight$/i.test(un.btn || ''), un.btn);

await page.evaluate(() => {
  const g = [...document.querySelectorAll('.pit-sect')].find(s => /Gauntlet/.test(s.querySelector('summary')?.textContent || ''));
  g.scrollIntoView({ block: 'center' });
});
await sleep(400);
const el = await page.$('.pit-sect');
if (el) { await el.screenshot({ path: `${DIR}/pit-uncapped.png` }); }
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nPIT CEILING IS UNMISSABLE');
process.exit(bad ? 1 : 0);

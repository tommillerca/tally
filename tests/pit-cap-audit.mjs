/* Hitting the Gauntlet ceiling must be OBVIOUS. Failure = the cap only readable in
 * body text, or the section summary still claiming a rank you cannot fight. */
import { boot, sleep } from './godmode.js';
const DIR = '/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/a40abded-9d02-469c-8111-2200136500f1/scratchpad/shots';
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
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
  /* RE-ANCHORED, AND HERE IS THE DESIGN CHANGE. The Pit sheet's sections used to be
     collapsible `<details class="pit-sect"><summary>Endless · The Gauntlet</summary>`.
     They are flat `<div class="t3-sect"><b>Endless · The Gauntlet</b></div>` headers
     now, the same section pattern the rest of the app uses: `.t3-sect` appears 18
     times in js/app.js and `.pit-sect` survives only in one stale guard, so this is a
     deliberate unification rather than an accident. Consequences for this audit:
     there is no summary to read, nothing to open (the content was never collapsed),
     and the section is a HEADER plus the siblings that follow it, so the body has to
     be gathered up to the next header instead of queried inside a wrapper. */
  const heads = [...document.querySelectorAll('.t3-sect')];
  const head = heads.find(h => /Gauntlet/.test(h.textContent || ''));
  if (!head) return { none: true };
  /* the section body: every sibling after the header until the next header */
  const body = [];
  for (let n = head.nextElementSibling; n && !n.classList.contains('t3-sect'); n = n.nextElementSibling) body.push(n);
  const q = sel => { for (const n of body) { const hit = n.matches?.(sel) ? n : n.querySelector?.(sel); if (hit) return hit; } return null; };
  const g = { querySelector: q, textContent: body.map(n => n.textContent).join(' ') };
  const gate = q('.pit-gate');
  return {
    summary: head.textContent.replace(/\s+/g, ' ').trim(),   // the header IS the summary now
    hasGateCard: !!gate,
    gateHead: gate?.querySelector('.pg-head b')?.textContent.trim(),
    hasMeter: !!gate?.querySelector('.pg-meter'),
    meter: gate?.querySelector('.pg-meter')?.textContent.replace(/\s+/g, ' ').trim(),
    ctaIsButton: gate?.querySelector('#endlessGate')?.tagName === 'BUTTON',
    ctaIsLink: !!gate?.querySelector('a#endlessGate') || (gate?.querySelector('#endlessGate')?.className || '').includes('link'),
    ctaText: gate?.querySelector('#endlessGate')?.textContent.trim(),
    fightBtn: g.querySelector('#endlessBtn')?.textContent.trim(),
    rowSaysRematchOnly: /rematch only/i.test(q('.t3-row')?.textContent || ''),   // was .crate-row
  };
});
console.log('gauntlet at the cap:', JSON.stringify(st));
check('the Gauntlet section exists', !st.none);
/* CASE-INSENSITIVE, and that is a re-anchor with a reason rather than a relaxation.
   The cap state used to be uppercase copy inside the `<summary>`; it now lives in a
   `<span class="r chip">At the cap</span>` beside the header. `.t3-sect b` is
   uppercased by CSS (text-transform) while `.chip` is not, so the SOURCE text this
   audit reads is title case even though the heading still LOOKS uppercase on screen.
   The check is about what the section says, not how the stylesheet cases it. */
check('the SUMMARY says you are at the cap, not a fightable rank', /at the cap/i.test(st.summary), st.summary);
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
  /* same re-anchor as above: header + following siblings, no summary, nothing to open */
  const head = [...document.querySelectorAll('.t3-sect')].find(h => /Gauntlet/.test(h.textContent || ''));
  if (!head) return { none: true };
  const body = [];
  for (let n = head.nextElementSibling; n && !n.classList.contains('t3-sect'); n = n.nextElementSibling) body.push(n);
  const q = sel => { for (const n of body) { const hit = n.matches?.(sel) ? n : n.querySelector?.(sel); if (hit) return hit; } return null; };
  return { summary: head.textContent.replace(/\s+/g, ' ').trim(), hasGate: !!q('.pit-gate'), btn: q('#endlessBtn')?.textContent.trim() };
});
console.log('gauntlet below the cap:', JSON.stringify(un));
check('below the cap there is NO gate card', !un.none && un.hasGate === false, JSON.stringify(un));
check('and the summary shows a fightable rank', /rank \d+/i.test(un.summary) && !/at the cap/i.test(un.summary), un.summary);
check('and the button says Fight', /^Fight$/i.test(un.btn || ''), un.btn);

await page.evaluate(() => {
  const head = [...document.querySelectorAll('.t3-sect')].find(h => /Gauntlet/.test(h.textContent || ''));
  head?.scrollIntoView({ block: 'center' });   // optional-chained: a missing header is
});                                            // a reported failure above, not a throw here
await sleep(400);
/* the shot used to query the dead `.pit-sect` and skip in silence, so a moved
   anchor cost the evidence too. */
const el = await page.$('.t3-sect');
if (el) { const { mkdirSync } = await import('node:fs'); mkdirSync(DIR, { recursive: true }); await el.screenshot({ path: `${DIR}/pit-uncapped.png` }); }
else { console.log('note: no .t3-sect to shoot'); }
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nPIT CEILING IS UNMISSABLE');
process.exit(bad ? 1 : 0);

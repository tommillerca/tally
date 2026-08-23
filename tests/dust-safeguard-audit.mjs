/* One curious tap must not spend dust. The failing result this guards against is
 * a dust balance that drops on the FIRST tap. */
import { boot, sleep } from './godmode.js';
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const dust = () => page.evaluate(async () => (await import('./js/loot.js')).boneDust());

await page.evaluate(async () => { await (await import('./js/loot.js')).boneDustAdd(500); });
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(1800);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="shop"]').click());
await sleep(1800);

/* THE DUST SHOP MOVED BEHIND A DISCLOSURE. v410 (92a8b3de, "the Shop is open")
   put crates, potions and weapons inside #shopRestBody, which ships `hidden`.
   A hidden ancestor gives the charm cell a 0x0 rect, so Puppeteer refused to
   click it and this suite died on "Node is either not clickable or not an
   Element" before its first assertion. The app is right; the audit had not
   followed it.
   This also un-blinds the two rows below. They read `textContent` off the cell,
   and textContent works fine on a display:none element, so both were passing
   while grading a cell no player could see: a green that could not fail. Same
   family as `[hidden]` never hiding anything from an opacity-based counter.
   Open the disclosure the way a player does. */
await page.evaluate(() => document.querySelector('#shopRest')?.click());
await sleep(500);

const before = await dust();
/* WHAT THE CELL MUST HAVE, not what one build's markup called it. This asked for
   `.dc-desc`, a class that only ever existed in the OLD Backpack-crates dust grid
   (js/app.js ~8880). The Tier 3 shop that actually renders on this screen writes a
   bare `<small>`, so the check went red on a cell that explains itself perfectly:
   "BATTLE CHARM 25 Next Pit win pays more". A class name is not the property. The
   property is that a player is told what the item DOES before spending on it, so
   read the description text and require it to say something the name does not.
   PROVE-RED: drop `<small>${esc(d.desc)}</small>` from the DUST_SHOP cell template
   and `desc` comes back empty. */
const cell = await page.evaluate(() => {
  const b = document.querySelector('[data-dustbuy="charm"]');
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const name = (b.querySelector('b')?.textContent || '').trim();
  const desc = [...b.querySelectorAll('small')].map(s => s.textContent.trim()).filter(Boolean).join(' ');
  return { label: b.textContent.replace(/\s+/g, ' ').trim(), name, desc };
});
console.log('charm cell:', JSON.stringify(cell), 'dust', before);
check('the cell exists and explains the item', !!cell && cell.desc.length > 3 && cell.desc.toLowerCase() !== cell.name.toLowerCase(),
  JSON.stringify(cell));
check('it names what it does', /pays more|Pit win/i.test(cell?.label || ''), cell?.label);

// FIRST tap: must not spend
await (await page.$('[data-dustbuy="charm"]')).click();
await sleep(700);
const afterOne = await dust();
const armed = await page.evaluate(() => {
  const b = document.querySelector('[data-dustbuy="charm"]');
  return { armed: b?.dataset.armed, text: b?.textContent.replace(/\s+/g, ' ').trim() };
});
console.log('after one tap:', afterOne, JSON.stringify(armed));
check('ONE tap spends nothing', afterOne === before, `${before} -> ${afterOne}`);
/* ASK FOR CONFIRMATION, in whatever words. This pinned /tap again/i, the literal
   copy of the old grid. The shared armToConfirm helper the Tier 3 shop uses says
   "Spend 25 dust?" instead, so a working safeguard read as a broken one. What has
   to be true: the cell is armed, the face of it CHANGED so the player can see the
   tap landed, and the new face states the price they are about to pay.
   PROVE-RED: delete `btn.innerHTML = esc(confirmLabel)` from armToConfirm and the
   face never changes; delete the arm branch entirely and `armed` is undefined. */
check('and it asks for confirmation', armed.armed === '1' && armed.text !== cell.label && armed.text.includes('25'),
  JSON.stringify(armed));

// SECOND tap: buys
await (await page.$('[data-dustbuy="charm"]')).click();
await sleep(1600);
const afterTwo = await dust();
console.log('after the confirm:', afterTwo);
check('the second tap actually buys', afterTwo === before - 25, `${before} -> ${afterTwo}`);

// and the arm times out rather than staying hot forever
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(1500);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="shop"]').click());
/* Re-entering the shop re-renders it, so the disclosure is shut again. */
await sleep(900);
await page.evaluate(() => document.querySelector('#shopRest')?.click());
await sleep(500);
await sleep(1600);
const d0 = await dust();
await (await page.$('[data-dustbuy="charm"]')).click();
await sleep(4000);
/* The disarm re-renders the shop, which shuts the disclosure again, so the cell
   is gone from the DOM rather than merely hidden and `?.dataset.armed` reads
   undefined. Re-open before reading, and assert the cell is actually there so a
   future disappearance reports as a missing cell rather than as "not cooled". */
await page.evaluate(() => { if (!document.querySelector('[data-dustbuy="charm"]')) document.querySelector('#shopRest')?.click(); });
await sleep(400);
const cellBack = await page.evaluate(() => !!document.querySelector('[data-dustbuy="charm"]'));
check('REACH the charm cell is still on screen to be graded', cellBack, String(cellBack));
const cooled = await page.evaluate(() => document.querySelector('[data-dustbuy="charm"]')?.dataset.armed);
/* THIS ROW CANNOT BE SALVAGED BY RELAXING IT, and I tried. The cool-off
   RE-RENDERS the shop, so the cell being read is a fresh one with no
   data-armed at all, and `cooled` is undefined regardless of what the disarm
   code did. Accepting undefined as "disarmed" makes the row unable to fail:
   PROVED 2026-08-23 by mutating all 8 `btn.dataset.armed = '0'` sites to '1',
   i.e. never disarming, and the relaxed row still passed rc=0.
   Left strict on purpose. It is red because it is observing a button that no
   longer exists, and the honest fix is to observe the ARMED button across the
   cool-off without triggering a re-render, which is a redesign rather than a
   tweak. A red row that means something beats a green one that cannot fail. */
check('the armed state cools off on its own', cooled === '0', String(cooled));
check('and nothing was spent while it cooled', (await dust()) === d0);
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nDUST SHOP SAFEGUARD VERIFIED');
process.exit(bad ? 1 : 0);

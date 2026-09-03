/* THE BESTIARY IS A TEASER, NOT A CATALOGUE.
   Tom, 2026-08-09: "the beastiary was just supposed to be a marketing popup
   showing some of the monsters... instead you've ... [made] a click in
   beastiary that you can click into and ruin the surprise of every new enemy.
   This was a teaser that you've made an analytical report for players."
   So this file guards the absence of what I built: no roster sheet, no way to
   browse the cast, and a Today row that names TODAY'S hunt and nothing else.
   Proven red against v351: the sheet opened 74 monsters in 10 labelled groups. */
import { boot, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srvHandle.url;
const { browser, page } = await boot(base, { seed: true });

/* ---- the teaser itself: a wall of monsters, no names, one screen ---- */
await page.evaluate(() => window.__bossIntro());
await sleep(900);
const teaser = await page.evaluate(() => {
  const veil = document.querySelector('.boss-veil');
  if (!veil) return { none: true };
  const cells = [...veil.querySelectorAll('.boss-cell')];
  return {
    cells: cells.length,
    // rot-audit: negative v352 stripped the labels off the wall, this holds them off
    named: [...veil.querySelectorAll('.bst-name, .bst-label')].length,
    scrolls: veil.scrollHeight > veil.clientHeight + 4,
    cta: veil.querySelector('#bossIntroGo')?.textContent.trim(),
  };
});
ok('the teaser shows a wall of monsters', teaser.cells >= 8 && teaser.cells <= 20, `${teaser.cells} cells`);
ok('it names none of them', teaser.named === 0, `${teaser.named} labels`);
ok('it fits one screen, it is not a list to read', !teaser.scrolls, JSON.stringify(teaser));
ok('it sends you hunting', /HUNT/i.test(teaser.cta || ''), teaser.cta);

/* ---- and nothing anywhere opens a browsable roster ---- */
await page.evaluate(() => document.querySelector('.boss-veil')?.remove());
const spoiler = await page.evaluate(() => ({
  hasOpener: typeof window.openBestiary === 'function',
  // rot-audit: negative v352 deleted the roster button, this proves it stayed deleted
  seeWholeBtn: !!document.getElementById('bestiaryOpen'),
  rosterCta: [...document.querySelectorAll('button, a')]
    .filter(b => /whole bestiary|all monsters|see them all/i.test(b.textContent || '')).length,
}));
ok('there is no roster to open', !spoiler.hasOpener && !spoiler.seeWholeBtn, JSON.stringify(spoiler));
ok('nothing offers to show them all', spoiler.rosterCta === 0, `${spoiler.rosterCta} buttons`);

/* ---- the Today row is GONE, and nothing else claims to be it ----
   Tom, 2026-08-21: every banner off Today except the step winner, one hype
   banner in their place. The "Out here hunting today" row went with the whole
   "Out there today" card, so what this file has to hold now is the ABSENCE, and
   an absence needs a control: the teaser rows above are it. They opened a real
   wall of monsters on this same boot, so a blank page cannot pass the rows
   below by having nothing on it. The hype banner that stood there instead came off
   in its turn on 2026-09-03, so the absence is now the whole of it and
   tests/hype-banner-audit.mjs is retired in the gate. */
const today = await page.evaluate(async () => {
  location.hash = '#/today';
  await new Promise(r => setTimeout(r, 1800));
  const screen = document.getElementById('screen');
  return {
    rendered: !!screen && screen.textContent.trim().length > 200,
    row: !!document.querySelector('.bestiary-banner'),
    card: !!document.querySelector('.out-there'),
    hunting: /out hunting today/i.test(screen?.textContent || ''),
    /* THE CONTROL, and it was `.card.hype` until 2026-09-03, when the hype
       banner came off Today with the whole promo slot. The five doors are the
       one thing Today has always drawn and can never be a teaser, so they are
       the positive control now: a blank screen still cannot pass the absences
       below by having nothing on it. */
    doors: document.querySelectorAll('.hero-actions .hero-act').length,
  };
});
ok('CONTROL Today really rendered (an empty screen would pass every absence below)',
  today.rendered && today.doors >= 4, JSON.stringify(today));
ok('no bestiary row on Today', !today.row);
ok('no "Out there today" card to hold one', !today.card);
ok('and nothing else names the day\'s hunt on Today', !today.hunting);

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nbestiary stays a teaser');
await browser.close();
if (srvHandle) srvHandle.close();
process.exit(fails.length ? 1 : 0);

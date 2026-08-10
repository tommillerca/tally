/* THE BESTIARY IS A TEASER, NOT A CATALOGUE.
   Tom, 2026-08-09: "the beastiary was just supposed to be a marketing popup
   showing some of the monsters... instead you've ... [made] a click in
   beastiary that you can click into and ruin the surprise of every new enemy.
   This was a teaser that you've made an analytical report for players."
   So this file guards the absence of what I built: no roster sheet, no way to
   browse the cast, and a Today row that names TODAY'S hunt and nothing else.
   Proven red against v351: the sheet opened 74 monsters in 10 labelled groups. */
import { boot, sleep } from './godmode.js';
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const { browser, page } = await boot(process.argv[2] || 'http://127.0.0.1:8791/', { seed: true });

/* ---- the teaser itself: a wall of monsters, no names, one screen ---- */
await page.evaluate(() => window.__bossIntro());
await sleep(900);
const teaser = await page.evaluate(() => {
  const veil = document.querySelector('.boss-veil');
  if (!veil) return { none: true };
  const cells = [...veil.querySelectorAll('.boss-cell')];
  return {
    cells: cells.length,
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
  seeWholeBtn: !!document.getElementById('bestiaryOpen'),
  rosterCta: [...document.querySelectorAll('button, a')]
    .filter(b => /whole bestiary|all monsters|see them all/i.test(b.textContent || '')).length,
}));
ok('there is no roster to open', !spoiler.hasOpener && !spoiler.seeWholeBtn, JSON.stringify(spoiler));
ok('nothing offers to show them all', spoiler.rosterCta === 0, `${spoiler.rosterCta} buttons`);

/* ---- the Today row: today's hunt, and a way to go find it ---- */
const row = await page.evaluate(async () => {
  location.hash = '#/today';
  await new Promise(r => setTimeout(r, 1800));
  const d = document.querySelector('.bestiary-banner');
  if (!d) return { none: true };
  const fig = d.querySelector('.bst-fig');
  const box = fig ? fig.getBoundingClientRect() : null;
  /* the figure has to be DRAWN, at a size a person can read. A composed avatar
     that never got its layers is an empty box that measures perfectly. */
  const imgs = fig ? [...fig.querySelectorAll('img')] : [];
  await Promise.all(imgs.map(i => i.decode().catch(() => {})));
  return {
    title: d.querySelector('.gbn-txt b')?.textContent.trim() || '',
    figures: d.querySelectorAll('.bst-fig').length,
    size: box ? Math.round(Math.min(box.width, box.height)) : 0,
    layers: imgs.length,
    drawn: imgs.filter(i => i.naturalWidth > 0).length,
    expandable: d.tagName === 'DETAILS' || !!d.querySelector('summary'),
    tag: d.tagName,
  };
});
ok("the row names today's hunt", !!row.title && row.title.length > 3, row.title);
ok('it shows that one monster, not a cast', row.figures === 1, `${row.figures} figures`);
ok('the monster is drawn, not an empty tile', row.layers > 0 && row.drawn === row.layers,
  `${row.drawn}/${row.layers} layers`);
ok('at a size you can actually see', row.size >= 72, `${row.size}px  (a 52px head is what Tom rejected)`);
ok('it is a tap, not a paragraph to expand', !row.expandable, row.tag);

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nbestiary stays a teaser');
await browser.close();
process.exit(fails.length ? 1 : 0);

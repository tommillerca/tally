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
    /* NAMING IS TEXT, NOT A CLASS NAME. This looked for `.bst-name, .bst-label`,
       both of which went out with the v350 roster in v352, so "it names none of
       them" asserted against markup the app can no longer emit and passed for
       free. A teaser cell today (js/app.js, openBossIntro) is a `.bh-stage
       .boss-cell` holding image layers and NO text node at all, so the rule Tom
       actually stated is checkable directly: any text in a cell, in any class,
       is a name. Alt/aria text counts too, because a monster named to a screen
       reader is still named. */
    named: cells.filter(c => (c.textContent || '').trim()
      || [...c.querySelectorAll('[alt], [aria-label], [title]')]
        .some(e => (e.getAttribute('alt') || e.getAttribute('aria-label') || e.getAttribute('title') || '').trim())).length,
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
/* NO NAMED ENTRY POINT, RATHER THAN NO NAMED GHOST. This asked for
   `window.openBestiary` and `#bestiaryOpen`, both deleted with the v350 roster
   in v352, so it could only ever answer false: the roster could come back under
   any other name and this would still pass. There is nothing left to pin to, so
   it enumerates instead: any global function or element id that offers to open
   a bestiary/roster fails, whatever it is called. `#bestiaryToMap` and
   `.bestiary-banner` are the teaser row and are matched on id only, so the row
   itself cannot trip it. */
const spoiler = await page.evaluate(() => ({
  openers: Object.keys(window).filter(k => /bestiary|roster/i.test(k) && typeof window[k] === 'function'),
  openIds: [...document.querySelectorAll('[id]')].map(e => e.id)
    .filter(id => /(bestiary|roster).*(open|all|browse|list)|^(open|all|browse|list).*(bestiary|roster)/i.test(id)),
  rosterCta: [...document.querySelectorAll('button, a')]
    .filter(b => /whole bestiary|all monsters|see them all/i.test(b.textContent || '')).length,
}));
ok('there is no roster to open', !spoiler.openers.length && !spoiler.openIds.length, JSON.stringify(spoiler));
ok('nothing offers to show them all', spoiler.rosterCta === 0, `${spoiler.rosterCta} buttons`);

/* ---- the Today row: today's hunt, and a way to go find it ---- */
const rowRhythm = await page.evaluate(() => {
  const card = document.querySelector('.out-there');
  if (!card) return { ok: false, heights: ['no Out there today card'] };
  const hs = [...card.querySelectorAll('.glutton-banner')].map(b => Math.round(b.getBoundingClientRect().height));
  if (hs.length < 2) return { ok: false, heights: hs };
  // ONE RHYTHM: no row may be more than a quarter taller than the shortest.
  // 1.5 was too slack to fail on the real regression (102px against 72px passed).
  const icons = [...card.querySelectorAll('.glutton-banner')]
    .map(b => b.querySelector('.bst-fig, .gbn-ico'))
    .map(e => e ? Math.round(e.getBoundingClientRect().width) : 0);
  return { ok: Math.max(...hs) <= Math.min(...hs) * 1.25, heights: hs,
    icons, iconsMatch: icons.length > 1 && Math.max(...icons) <= Math.min(...icons) * 1.15 };
});
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
/* THE SIZE FLOOR MOVED, ON TOM'S INSTRUCTION, AND THIS RECORDS WHY.
   2026-08-09 he rejected a 52px head next to a paragraph and asked for the
   monster itself, so this asserted >= 72px and the row was built at 88.
   2026-08-10 he came back with "the 'out hunting today' banner is bigger than
   the rest": measured 110px against 50 and 51 for its two siblings, which reads
   as a layout fault rather than emphasis. Every row now shares a 72px minimum
   and the figure is 58px inside it, which is still a whole monster and still
   comfortably above the head-plus-paragraph he rejected.
   The floor is 54, not 58: it guards against a collapse back to a thumbnail, and
   pinning it to the exact current value would fail on any harmless tweak. */
/* AND IT MUST NOT TOWER OVER ITS NEIGHBOURS. This is the check that was missing:
   every size assertion here was a FLOOR, so a row that grew to twice the height
   of the rest of the card passed everything. Tom found it instead. */
ok('the row does not tower over the others in the card', rowRhythm.ok,
  rowRhythm.heights.map(h => h + 'px').join(' / '));
/* NOT A BARE FLOOR. This has now been wrong twice in two days in both directions:
   72 when the figure was 88, then 54 when it was 58, then it failed at 48 after
   Tom asked for the hunt figure to MATCH its sibling icons rather than tower over
   them. The requirement is consistency plus legibility, so that is what it checks:
   the same box as the other rows in the card, and never so small it becomes a
   thumbnail again. 40 is the floor because Tom rejected a 52px HEAD; a 48px whole
   monster is a different thing and is what he asked for. */
ok('at a size you can actually see', row.size >= 40, `${row.size}px  (a 52px head is what Tom rejected)`);
ok('and the same size as the other rows in the card', rowRhythm.iconsMatch,
  rowRhythm.icons.map(n => n + 'px').join(' / '));
ok('it is a tap, not a paragraph to expand', !row.expandable, row.tag);

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nbestiary stays a teaser');
await browser.close();
process.exit(fails.length ? 1 : 0);

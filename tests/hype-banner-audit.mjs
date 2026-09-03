/* THE NEWS PILL'S HERO BANNER.
 *
 * Tom, 2026-09-03: "just make sure there is always one banner that looks good and
 * the others below can be the list as is but we need to have one stand out banner
 * that is showing more than a list of homework in the new section that gets people
 * excited."
 *
 * RE-PREMISED, NOT RETIRED. This file was written on 2026-08-21 for the Today hype
 * banner ("remove all banners on the today page except the step winner but above
 * it we need to create a new hypebanner"). That banner was deleted on the morning
 * of 2026-09-03 on a reading of a later note as DELETE when it meant RELOCATE, and
 * this file was moved to the gate's skip tier for a surface that had simply moved.
 * It grades the hero slot inside the news pill now. Every row here that survived
 * survived because its subject did; the rows about TWO HALVES (a caption each, a
 * count in each, no box around the seal, a second route into the shop) are gone
 * with the two-half layout, which was the 2026-08-21 brief and is not this one.
 *
 * Three things go wrong with a banner like this and none of them throw:
 *   1. a creature does not decode, and an empty box measures perfectly. Every
 *      figure is graded on naturalWidth, never on its rect.
 *   2. it grows until the pill is a screen rather than a banner.
 *   3. the copy clips. Graded on the element's own overflow, not a word count.
 *
 * And two that are new, because the slot is now chosen rather than hand-written:
 *   4. the hero renders EMPTY. newsHero() falls back to a literal that depends on
 *      neither NEWS nor HYPE_PLATES precisely so this cannot happen; NEVER-EMPTY
 *      is the row that fails if somebody removes that fallback.
 *   5. it escapes the pill and lands back on Today, which is the thing Tom asked
 *      to stop. IN-PILL grades that here; today-container-audit grades the same
 *      claim from the other side.
 *
 * THE PILL IS COLLAPSED BY DEFAULT and a closed <details> is display:none, so
 * every measurement below goes through a real tap on the summary first. Without
 * it every rect is 0 and every row reads on a surface nobody can reach.
 *
 * Both viewports are graded because the copy and the figures fail differently at
 * 320 (the narrowest phone this app supports) than at 393. An empty sample is a
 * failure: SETUP refuses to grade anything unless Today really rendered and the
 * hero is really in the pill.
 *
 * Run: node tests/hype-banner-audit.mjs [baseUrl]
 */
import { boot, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srvHandle.url;
const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};

const { browser, page } = await boot(base);
const errs = [];
page.on('pageerror', e => errs.push(e.message));

/* Read everything in one pass, AFTER opening the pill and decoding every image
   in the hero. An img.decode() that resolves is the only honest answer to "did
   the art draw": naturalWidth is 0 both while a good image is still loading and
   forever on a broken path, so measuring without awaiting turns a real hole into
   a flake. */
async function measure() {
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1600);
  /* A REAL TAP ON THE SUMMARY, not `details.open = true`. The pill is a control
     the player operates, and rule 5 of the anti-regression list is that UI is
     verified by operating controls. It also matters mechanically: a closed
     <details> renders its contents display:none, so without this every rect
     below is 0x0 and every row grades a surface nobody reached. */
  await page.click('#newsBanner > summary').catch(() => {});
  await sleep(500);
  await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('.nb-hero img')];
    await Promise.all(imgs.map(i => i.decode().catch(() => {})));
  });
  return page.evaluate(() => {
    const screen = document.getElementById('screen');
    const card = document.querySelector('.nb-hero');
    const pillOpen = !!document.querySelector('#newsBanner')?.open;
    if (!card) return { rendered: !!screen && screen.textContent.trim().length > 200, missing: true, pillOpen };
    const r = card.getBoundingClientRect();
    const imgs = [...card.querySelectorAll('img')];
    /* THE COPY IS A TITLE AND A BLURB, the same two strings the row below it
       carries. What has to hold is that neither is cut and that the pair stays a
       caption rather than a paragraph. */
    const b = card.querySelector('.nb-hero-txt b');
    const i = card.querySelector('.nb-hero-txt i');
    const texts = [b, i];
    /* CLIPPING, measured on the element's own overflow rather than on a
       character count: a word that has been ellipsed or cut by a fixed height
       reports scrollWidth/scrollHeight past its client box. */
    const clipped = el => !!el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    const rr = document.getElementById('raceResultCard');
    const ring = document.querySelector('.ring-card');
    const nodes = [...document.querySelectorAll('#screen *')];
    return {
      rendered: !!screen && screen.textContent.trim().length > 200,
      missing: false, pillOpen,
      top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width),
      right: Math.round(r.right),
      figures: imgs.length,
      drawn: imgs.filter(x => x.naturalWidth > 0).length,
      sources: imgs.map(x => x.getAttribute('src')),
      figBoxes: [...card.querySelectorAll('.hype-fig')]
        .map(e => Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))),
      words: texts.reduce((n, e) => n + (e?.textContent || '').trim().split(/\s+/).filter(Boolean).length, 0),
      copy: texts.map(e => (e?.textContent || '').trim()).join(' / '),
      lineClipped: texts.some(clipped),
      /* NEVER EMPTY. Two independent ways the slot could render as nothing and
         still leave a button on the page: no plate at all, or no words. Both are
         graded, because newsHero()'s fallback is the only thing standing between
         "the newest NEWS entry with art" and an empty hero, and a fallback
         nobody grades is a fallback somebody deletes. */
      hasArt: imgs.length > 0,
      hasCopy: (b?.textContent || '').trim().length > 0,
      // exactly ONE hero, ever. Not zero, and not one per NEWS entry either.
      heroes: document.querySelectorAll('.nb-hero').length,
      // WHERE it lives. Inside the pill, and nowhere else on Today.
      inPill: !!card.closest('#newsBanner'),
      promoOnToday: !!document.querySelector('#screen .promo-slot, #screen .hype'),
      /* ORDER: the hero is the first thing behind the tap, above the settled step
         race and above the announcement rows. document order, not a pixel
         comparison, because the race card renders hidden until a week settles and
         a hidden element has no box to compare with. */
      aboveRace: !!rr && (card.compareDocumentPosition(rr) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      aboveRows: (() => {
        const first = document.querySelector('#newsBanner .nb-row');
        return !!first && (card.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      })(),
      raceExists: !!rr,
      rows: document.querySelectorAll('#newsBanner .nb-row').length,
      ringTop: ring ? Math.round(ring.getBoundingClientRect().top) : null,
      // the banner stack Tom asked to be gone, still gone
      outThere: !!document.querySelector('.out-there'),
      oldBanners: nodes.filter(n => n.classList.contains('glutton-banner')).length,
      viewport: innerHeight,
    };
  });
}

/* Measured on 6212e75, where Today still carried the "Out there today" card:
   .ring-card top, per viewport. It is a CEILING, not a pin: whatever stands above
   the ring may not push it lower than that 275px banner stack did. The hero lives
   behind a disclosure that is SHUT at rest, so at rest it costs the ring nothing;
   this is measured with the pill OPEN, which is the state where it can push, and
   is rule 12 (measure in the state the complaint is about). */
const BASE_RING_TOP = { '393x852': 1133, '320x568': 973 };

for (const [w, h] of [[393, 852], [320, 568]]) {
  console.log(`\n---- ${w}x${h} ----`);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const m = await measure();
  const tag = `${w}x${h}`;
  ok(`SETUP ${tag} Today rendered`, m.rendered);
  ok(`SETUP ${tag} the news pill opened on a real tap (a shut one is display:none and every row below would grade a 0x0 box)`, m.pillOpen);
  ok(`SETUP ${tag} the hero banner is in it (nothing below can pass without this)`, !m.missing);
  if (m.missing) continue;

  ok(`NEVER-EMPTY ${tag} the hero drew art`, m.hasArt, `${m.figures} figure(s)`);
  ok(`NEVER-EMPTY ${tag} the hero drew copy`, m.hasCopy, m.copy);
  ok(`NEVER-EMPTY ${tag} exactly one hero, not zero and not one per entry`, m.heroes === 1, `${m.heroes} found`);

  ok(`IN-PILL ${tag} the hero is inside the collapsed news pill`, m.inPill);
  /* THE OTHER HALF OF THE SAME CLAIM. Tom, 2026-09-03: "today still has the step
     challenge winner and monster banner at the bottom these should be gone now
     things will live in the collapsed news pill." A hero that reappeared on Today
     would satisfy every row above and be exactly the thing he asked to stop, so
     the absence is asserted here with the hero itself as its positive control:
     the rows above proved a banner really rendered, so this cannot pass by the
     screen being blank. */
  ok(`IN-PILL ${tag} and nothing promo-shaped is back on Today itself`, !m.promoOnToday);

  ok(`ORDER ${tag} the step-race banner exists to be ordered against`, m.raceExists);
  ok(`ORDER ${tag} the hero sits ABOVE the settled step race`, m.aboveRace);
  ok(`ORDER ${tag} there are announcement rows to be ordered against`, m.rows > 0, `${m.rows} rows`);
  ok(`ORDER ${tag} and ABOVE the list of rows: it is the hero, not row ten`, m.aboveRows);

  ok(`ART ${tag} every figure the hero drew decoded`, m.figures > 0 && m.drawn === m.figures,
    `${m.drawn}/${m.figures} drawn: ${m.sources.join(', ')}`);
  /* THE FLOOR. Tom rejected the first Today banner's 56px plates ("the creatures
     are bigger"), and the whole point of a hero rather than a row is that the art
     is not a thumbnail: the pill's own .nb-thumb tiles render at 40 and normalise
     their art to a 24px step. 72 is under the smallest shipped box (--hf is 88 at
     320, 104 above 380) and well over both of those, so a quiet slide back into
     the band of thumbnails goes red. */
  ok(`ART ${tag} every figure is a whole creature, not a thumbnail`,
    m.figBoxes.length > 0 && Math.min(...m.figBoxes) >= 72, m.figBoxes.join(' / ') + 'px');
  ok(`FIT ${tag} the hero does not run off the right edge`, m.right <= w + 1, `right ${m.right}`);
  ok(`FIT ${tag} the ring card sits no lower than the old banner stack left it`,
    m.ringTop !== null && m.ringTop <= BASE_RING_TOP[tag],
    `ring top ${m.ringTop}, was ${BASE_RING_TOP[tag]}`);
  /* IT IS A BANNER, NOT A SCREEN. The bound is arithmetic on the shipped rules
     rather than a pin on the current render: 23px of padding + --hf (104 at 393,
     88 at 320) + 6px gap + a ~17px display title + a blurb that may wrap to four
     lines at ~14px comes to about 192. 210 leaves the copy room to breathe and
     still goes red on a hero that has grown a second figure row or a paragraph. */
  ok(`FIT ${tag} it is a banner, not a screen`, m.height <= 210, `${m.height}px tall`);
  ok(`COPY ${tag} nothing is clipped`, !m.lineClipped, m.copy);
  /* A CAPTION, NOT A BRIEFING. The title and blurb come straight off the NEWS
     entry, where the blurb is already written to one line of a 40px row, so this
     bound catches a hero given its own longer copy rather than the row's. */
  ok(`COPY ${tag} it stays a caption: thirty words or fewer`, m.words <= 30, `${m.words} words: ${m.copy}`);
  ok(`GONE ${tag} the Out there today card is off Today`, !m.outThere);
  ok(`GONE ${tag} no old banner rows survive on Today`, m.oldBanners === 0, `${m.oldBanners} rows`);
}

/* WHERE THE HERO GOES, asserted by driving the real button rather than by reading
   the array: newsHero() decides both what is drawn and what is opened, and the
   only way to prove those two agree is to press the thing that was drawn.
   The hero is the Wanderer while he is the newest NEWS entry carrying a measured
   plate, and both he and the fallback banner open the Boneyard, so the
   destination is stable across the selection rule's two branches. */
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await measure();
const went = await page.evaluate(async () => {
  const before = location.hash;
  document.querySelector('.nb-hero').click();
  await new Promise(r => setTimeout(r, 1400));
  return { before, hash: location.hash, sheets: document.querySelectorAll('.sheet, .sheet-wrap').length };
});
/* IT LANDS SOMEWHERE. Either a route change or an announcement sheet, because the
   two branches of the rule legitimately do different things: a NEWS entry may open
   its card and leave you on Today, the Wanderer and the fallback both navigate.
   What would be a bug is a hero that looks pressable and does nothing at all. */
ok('ROUTE pressing the hero does something: it navigates or opens its card',
  went.hash !== went.before || went.sheets > 0, JSON.stringify(went));

ok('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
if (srvHandle) await srvHandle.close();
console.log(`\n${fails.length ? fails.length + ' FAILED' : 'all green'}`);
process.exit(fails.length ? 1 : 0);

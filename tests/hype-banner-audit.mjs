/* THE TODAY HYPE BANNER.
 *
 * Tom, 2026-08-21: "remove all banners on the today page except the step winner
 * but above it we need to create a new hypebanner that is bold and stands out and
 * shows the 2 new creatures that are out in the boneyard and simultaneously
 * teases bumbleseal being sold in the shop."
 *
 * Three things go wrong with a banner like this and none of them throw:
 *   1. one of the three creatures does not decode, and an empty box measures
 *      perfectly. Every figure is graded on naturalWidth, never on its rect.
 *   2. it grows and pushes the step-race banner or the calorie ring off the
 *      first screen, which is the whole reason it sits where it does.
 *   3. the copy clips. It is eleven words; a clipped one is a tenth of the brief.
 *
 * And the ORDER is the instruction itself: above the step winner, not below.
 *
 * Both viewports are graded because the copy and the figures are the two things
 * that fail differently at 320 (the narrowest phone this app supports) than at
 * 393. An empty sample is a failure: SETUP refuses to grade anything unless
 * Today really rendered and the banner is really on it.
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

/* Read everything in one pass, AFTER decoding every image in the banner. An
   img.decode() that resolves is the only honest answer to "did the art draw":
   naturalWidth is 0 both while a good image is still loading and forever on a
   broken path, so measuring without awaiting turns a real hole into a flake. */
async function measure() {
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1600);
  await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('.hype img')];
    await Promise.all(imgs.map(i => i.decode().catch(() => {})));
  });
  return page.evaluate(() => {
    const screen = document.getElementById('screen');
    const card = document.querySelector('.card.hype');
    if (!card) return { rendered: !!screen && screen.textContent.trim().length > 200, missing: true };
    const r = card.getBoundingClientRect();
    const imgs = [...card.querySelectorAll('img')];
    /* THE COPY IS NOW THREE PIECES, one heading and one caption per half. Tom
       struck the single spanning sentence out on 2026-08-21 and wrote a caption
       under Bumbleseal instead, so what has to hold is that each half labels
       ITSELF and that the three together stay inside the word budget. */
    const eye = card.querySelector('.hype-eye');
    const caps = [...card.querySelectorAll('.hype-cap')];
    const texts = [eye, ...caps];
    /* CLIPPING, measured on the element's own overflow rather than on a
       character count: a word that has been ellipsed or cut by a fixed height
       reports scrollWidth/scrollHeight past its client box. */
    const clipped = el => !!el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    const rr = document.getElementById('raceResultCard');
    const ring = document.querySelector('.ring-card');
    const nodes = [...document.querySelectorAll('#screen *')];
    return {
      rendered: !!screen && screen.textContent.trim().length > 200,
      missing: false,
      top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width),
      right: Math.round(r.right),
      figures: imgs.length,
      drawn: imgs.filter(i => i.naturalWidth > 0).length,
      sources: imgs.map(i => i.getAttribute('src')),
      figBoxes: [...card.querySelectorAll('.hype-fig, .petcrop')]
        .map(e => Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))),
      words: texts.reduce((n, e) => n + (e?.textContent || '').trim().split(/\s+/).filter(Boolean).length, 0),
      copy: texts.map(e => (e?.textContent || '').trim()).join(' / '),
      /* THE PAIR OF TALLIES. "Two want to eat you." / "One likes to shop": a
         count on each side is the joke, and the shop caption shipped without its
         number for one revision (Tom: "it is meant to say ONE likes to shop").
         Word-initial, so a stray "one" inside a sentence cannot satisfy it. */
      capCounts: caps.map(e => (/^(one|two|three)\b/i.exec((e?.textContent || '').trim()) || [''])[0].toLowerCase()),
      lineClipped: texts.some(clipped),
      caps: caps.length,
      // each caption inside its OWN half, and no full-width sentence spanning both
      capsOwned: caps.length === 2
        && !!document.querySelector('#hypeYard .hype-cap') && !!document.querySelector('#hypeShop .hype-cap'),
      // rot-audit: negative the two halves were split in v422; this holds them apart
      spanningLine: !!card.querySelector('.hype-line'),
      // one frame: both halves are children of the SAME card, never two cards
      oneFrame: document.querySelectorAll('.card.hype').length === 1
        && card.contains(document.getElementById('hypeYard')) && card.contains(document.getElementById('hypeShop')),
      /* NO BOX AROUND THE BEE. Tom, 2026-08-21: "there shouldnt be any button
         thing around the bee remove that." She sat on a sunken plate for one
         revision (rgba(0,0,0,.28), a hairline border, 14px radius) and it read
         as a control. Both halves ARE controls and the left one carries no box,
         so the assertion is a COMPARISON, not a constant: nothing inside the
         shop half may paint a fill, a border or a radius that the Boneyard half
         does not. Graded on computed style, because the plate was one rule and a
         source scan for it would go blind the moment it is spelt differently.
         A BOX IS NOT A DIVIDER, and the difference is the number of edges: the
         hairline between the columns is ONE border side, no fill, no radius, and
         that is the separation Tom kept. Two or more sides, a fill or a corner
         radius is a surround. The half itself is walked too, so moving the plate
         up onto the button cannot slip past. */
      boxed: (() => {
        const skin = root => [root, ...root.querySelectorAll('*')].map(e => {
          const c = getComputedStyle(e);
          const fill = c.backgroundColor !== 'rgba(0, 0, 0, 0)' && c.backgroundColor !== 'transparent';
          const sides = ['Top', 'Right', 'Bottom', 'Left']
            .filter(s => parseFloat(c['border' + s + 'Width']) > 0 && c['border' + s + 'Style'] !== 'none');
          const rad = parseFloat(c.borderTopLeftRadius) > 0;
          return { tag: e.className || e.tagName, fill, bord: sides.length >= 2 ? sides.join('+') : '', rad };
        }).filter(x => x.fill || x.bord || x.rad);
        return { shop: skin(document.getElementById('hypeShop')), yard: skin(document.getElementById('hypeYard')) };
      })(),
      yard: !!document.getElementById('hypeYard'),
      shop: !!document.getElementById('hypeShop'),
      // ORDER: the banner's own position among Today's children, against the
      // step-race banner's. document order, not a pixel comparison, because a
      // hidden <details> has no box to compare with.
      aboveRace: !!rr && (card.compareDocumentPosition(rr) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      raceExists: !!rr,
      ringTop: ring ? Math.round(ring.getBoundingClientRect().top) : null,
      // the banner stack Tom asked to be gone
      outThere: !!document.querySelector('.out-there'),
      oldBanners: nodes.filter(n => n.classList.contains('glutton-banner')).length,
      viewport: innerHeight,
    };
  });
}

/* Measured on 6212e75 (this branch's parent), where Today still carried the
   "Out there today" card: .ring-card top, per viewport. */
const BASE_RING_TOP = { '393x852': 1133, '320x568': 973 };

for (const [w, h] of [[393, 852], [320, 568]]) {
  console.log(`\n---- ${w}x${h} ----`);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const m = await measure();
  const tag = `${w}x${h}`;
  ok(`SETUP ${tag} Today rendered`, m.rendered);
  ok(`SETUP ${tag} the hype banner is on it (nothing below can pass without this)`, !m.missing);
  if (m.missing) continue;
  ok(`ORDER ${tag} the step-race banner exists to be ordered against`, m.raceExists);
  ok(`ORDER ${tag} the hype banner sits ABOVE the step winner`, m.aboveRace);
  ok(`ART ${tag} all three creatures decoded`, m.figures === 3 && m.drawn === 3,
    `${m.drawn}/${m.figures} drawn: ${m.sources.join(', ')}`);
  /* THE FLOOR ROSE WITH TOM'S REVISION. It was 56 when the plates were 78/74 and
     he came back with "the creatures are bigger": measured after, 100 / 100 / 92
     at 393 and 78 / 78 / 78 at 320. 72 is the floor because it is under the
     smallest shipped box and above the 56 that let the first version pass, so a
     quiet slide back to the band of thumbnails he rejected goes red. */
  ok(`ART ${tag} every figure is a whole creature, not a thumbnail`,
    m.figBoxes.length === 3 && Math.min(...m.figBoxes) >= 72, m.figBoxes.join(' / ') + 'px');
  ok(`FIT ${tag} the banner does not run off the right edge`, m.right <= w + 1, `right ${m.right}`);
  /* THE RING WAS NEVER ON THE FIRST SCREEN, and an absolute "above the fold" row
     here would have been a check that cannot pass on any tree. Measured on
     6212e75, the commit this replaced: the ring card sat at 1133 / 973 under the
     275px "Out there today" stack. So the honest bound is the one that would
     catch this banner GROWING: it may not push the ring lower than the stack it
     replaced did. It currently pulls it 129px UP. */
  ok(`FIT ${tag} the ring card sits no lower than the old banner stack left it`,
    m.ringTop !== null && m.ringTop <= BASE_RING_TOP[tag],
    `ring top ${m.ringTop}, was ${BASE_RING_TOP[tag]}`);
  ok(`FIT ${tag} it is a banner, not a screen`, m.height <= 180, `${m.height}px tall`);
  ok(`COPY ${tag} nothing is clipped`, !m.lineClipped, m.copy);
  ok(`COPY ${tag} minimal wording: eleven words or fewer`, m.words <= 11, `${m.words} words: ${m.copy}`);
  ok(`COPY ${tag} each half carries its own caption`, m.capsOwned, `${m.caps} captions`);
  ok(`COPY ${tag} both captions lead with their count`, m.capCounts.length === 2 && m.capCounts.every(Boolean),
    m.capCounts.map(c => c || '(none)').join(' / ') + ' -- ' + m.copy);
  ok(`COPY ${tag} no single sentence spanning both halves`, !m.spanningLine);
  ok(`REACH ${tag} both halves are real controls`, m.yard && m.shop);
  ok(`ONE ${tag} it is one banner in one frame, not two cards`, m.oneFrame);
  ok(`ONE ${tag} nothing pressable-looking around the seal: no box the other half lacks`,
    m.boxed.shop.length <= m.boxed.yard.length,
    `shop ${JSON.stringify(m.boxed.shop)} vs yard ${JSON.stringify(m.boxed.yard)}`);
  ok(`GONE ${tag} the Out there today card is off Today`, !m.outThere);
  ok(`GONE ${tag} no old banner rows survive on Today`, m.oldBanners === 0, `${m.oldBanners} rows`);
}

/* WHERE THE HALVES GO. Asserted by driving the real buttons, because the whole
   point of the two targets is that they land in two different places. */
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await measure();
const yard = await page.evaluate(async () => {
  document.getElementById('hypeYard').click();
  await new Promise(r => setTimeout(r, 1200));
  return location.hash;
});
ok('ROUTE the Boneyard half opens the Boneyard', yard === '#/boneyard', yard);
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1500);
const shop = await page.evaluate(async () => {
  document.getElementById('hypeShop').click();
  await new Promise(r => setTimeout(r, 1400));
  return { hash: location.hash, shop: !!document.querySelector('[data-hubtab="shop"].on, .ch-tab.on') ,
    text: (document.getElementById('screen')?.textContent || '').slice(0, 0) };
});
ok('ROUTE the shop half opens the Bonehead hub', shop.hash === '#/bonehead', JSON.stringify(shop));

ok('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
if (srvHandle) await srvHandle.close();
console.log(`\n${fails.length ? fails.length + ' FAILED' : 'all green'}`);
process.exit(fails.length ? 1 : 0);

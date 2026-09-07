/* tests/locker-polish-audit.mjs - THE LOCKER ROOM, MEASURED ON THE RENDERED APP.
 *
 * QA round 40, R40-21..27. Five defects that a source read cannot see and that
 * every existing football guard passed straight over, because each one is a
 * number that only exists once the browser has laid the thing out:
 *
 *   DISCS   the "all 32 colourways" proof was 32 discs in a 16-column grid of
 *           `1fr` columns, so the disc was whatever the container had left over.
 *           MEASURED before the fix: 5.84px at 393, 5.28 at 375, 3.56 at 320,
 *           in strips 138.5 / 129.5 / 102px wide. A row of dots. The fix caps
 *           the count and gives the disc a real size, so this row grades the
 *           SIZE and the honesty of the "+N" together: no disc under 8px, and
 *           the teams the strip does not draw are still counted on screen.
 *   FAB     #fab has margin-top:-26px, so it hangs into .screen's scrollport:
 *           measured, its box starts 8.1px above the scroller's bottom edge and
 *           its 4px ring another 4px above. A News row passing through that band
 *           is covered by it, and document.elementFromPoint at the row's own
 *           VISIBLE centre answered #fab. This walks the whole scroll range at
 *           both phone widths and fails on any intersection at all.
 *           CLIPPED TO THE PADDING BOX, not the border box: an unclipped rect
 *           reports rows that are behind the tab bar as "under the FAB", which
 *           is how the round's own 58 x 20.1px came out of a 58 x 7.9px defect.
 *   PILL    the kit room's buy pills were graded against the balance renderShop
 *           closed over, and the room's body is built LATER, on the details'
 *           'toggle'. So the wallet moves and the pill does not: this empties it
 *           behind the app's back and requires the pill to know.
 *   HERO    the news hero shipped the 359 KB poster master into a 97.8px box.
 *           Bytes ON THE WIRE, off CDP, not a src string.
 *   NOART   a garment master that fails left its .fb-tint spans painting the
 *           team's colours in the shape of a garment that is not there, and the
 *           tile went on charging 4,200 coins for it.
 *
 * PROVE-RED (measured on this tree by reverting each fix in a throwaway):
 *   .fb-swatch.xs back to `width:auto;aspect-ratio:1` in a 16-col grid -> DISCS
 *   drop .screen's transparent bottom border                           -> FAB
 *   footballDropBodyHtml built from renderShop's `coinBal`             -> PILL
 *   hypePlateHtml emitting `src` instead of bhThumb(src, 384)          -> HERO
 *   THUMB_FALLBACK's give-up branch back to a bare this.remove()       -> NOART
 *
 * Run: node tests/locker-polish-audit.mjs [baseUrl]   (serves this checkout if
 * omitted, so it can never grade production). HEADLESS_MODE=shell on this Mac.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
const srv = argUrl ? null : await serveTree(ROOT);
const base = (argUrl || srv.url).replace(/\/?$/, '/');

const DISC_FLOOR = 8;        // px: below this a colourway disc is a dot
const HERO_CEIL = 200 * 1024; // bytes: the 384 tier is 157 KB, the master 359 KB

let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? '  | ' + detail : ''}`);
  if (!pass) fails = 1;
};
const setup = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'SETUP'}  ${label}${detail ? '  | ' + detail : ''}`);
  if (!pass) { console.log('\n  This audit GRADED NOTHING.'); process.exit(2); }
};

const { browser, page } = await boot(base, { headless: process.env.HEADLESS_MODE || 'shell' });
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));

/* bytes ON THE WIRE for the hero plate, keyed by path. Hooked before any
   navigation so the very first Today counts. */
const wire = new Map();
page.on('response', r => {
  const u = r.url();
  if (/poster\.png$/.test(u)) wire.set(u.replace(base, ''), +(r.headers()['content-length'] || 0));
});

try {
  await seed(page, { level: 20, coins: 400000 });

  const openShop = async () => {
    await page.evaluate(() => { location.hash = '#/today'; });
    await sleep(700);
    await page.evaluate(() => { location.hash = '#/shop'; });
    await sleep(1800);
  };
  const openKit = async () => {
    await page.evaluate(() => { const d = document.querySelector('#fbSect'); if (d && !d.open) d.querySelector('summary').click(); });
    await sleep(1500);
  };

  /* ------------------------------------------------------------- DISCS ---- */
  const discRows = [];
  for (const [w, h] of [[393, 852], [375, 667], [320, 568]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await openShop();
    await openKit();
    discRows.push(await page.evaluate(teams => {
      const strips = [...document.querySelectorAll('.fb-teams')];
      const discs = [...document.querySelectorAll('.fb-swatch.xs')].map(e => e.getBoundingClientRect().width);
      const honest = strips.every(s => {
        const shown = s.querySelectorAll('.fb-swatch.xs').length;
        const more = s.querySelector('.fb-more');
        return shown >= teams || (!!more && +(more.textContent.replace(/\D/g, '')) === teams - shown);
      });
      return {
        strips: strips.length,
        stripW: strips.map(s => +s.getBoundingClientRect().width.toFixed(1)).slice(0, 3),
        discs: discs.length,
        min: discs.length ? +Math.min(...discs).toFixed(2) : 0,
        honest,
        overflow: strips.some(s => s.scrollWidth > Math.ceil(s.clientWidth) + 1),
      };
    }, 32).then(r => ({ w, ...r })));
  }
  setup('SAMPLE the kit room opened with its colourway strips on screen at all three widths',
    discRows.every(r => r.strips >= 3 && r.discs > 0),
    discRows.map(r => `${r.w}: ${r.strips} strips (${r.stripW.join('/')}px), ${r.discs} discs`).join('; '));
  ok(`DISCS every colourway disc clears ${DISC_FLOOR}px at 393, 375 and 320 (measured 5.84 / 5.28 / 3.56 before)`,
    discRows.every(r => r.min >= DISC_FLOOR),
    discRows.map(r => `${r.w}: ${r.min}px`).join(', '));
  ok('DISCS-HONEST a strip that draws fewer than 32 says how many it left out, and none of them overflows its strip',
    discRows.every(r => r.honest && !r.overflow),
    discRows.map(r => `${r.w}: ${r.honest ? 'counted' : 'SILENTLY TRUNCATED'}${r.overflow ? ', OVERFLOWS' : ''}`).join('; '));

  /* --------------------------------------------------------------- FAB ---- */
  const fabRows = [];
  for (const [w, h] of [[393, 852], [375, 667]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluate(() => { location.hash = '#/today'; });
    await sleep(1600);
    await page.evaluate(() => document.querySelector('#newsBanner > summary')?.click());
    await sleep(900);
    fabRows.push(await page.evaluate(async () => {
      const sc = document.querySelector('#screen');
      const fab = document.querySelector('#fab');
      if (!sc || !fab) return { err: `screen=${!!sc} fab=${!!fab}` };
      const f = fab.getBoundingClientRect();
      const bb = parseFloat(getComputedStyle(sc).borderBottomWidth) || 0;
      let worst = null, rows = 0;
      for (let t = 0; t <= sc.scrollHeight; t += 8) {
        sc.scrollTop = t;
        await new Promise(r => requestAnimationFrame(r));
        for (const row of document.querySelectorAll('.nb-row')) {
          const raw = row.getBoundingClientRect();
          const b = sc.getBoundingClientRect();
          const top = Math.max(raw.top, b.top), bot = Math.min(raw.bottom, b.bottom - bb);
          if (bot <= top) continue;
          rows++;
          const ow = Math.max(0, Math.min(raw.right, f.right) - Math.max(raw.left, f.left));
          const oh = Math.max(0, Math.min(bot, f.bottom) - Math.max(top, f.top));
          if (ow * oh > 0 && (!worst || ow * oh > worst.area)) {
            const cx = (raw.left + raw.right) / 2, cy = (top + bot) / 2;
            worst = { id: row.dataset.news, area: ow * oh, ov: [+ow.toFixed(1), +oh.toFixed(1)], at: t,
              hit: document.elementFromPoint(cx, cy)?.id || null };
          }
        }
      }
      return { rows, worst, fabTop: +f.top.toFixed(1), padBottom: +(sc.getBoundingClientRect().bottom - bb).toFixed(1) };
    }).then(r => ({ w, h, ...r })));
  }
  setup('SAMPLE the News pill is open with rows visible at both widths, so the sweep below has something to grade',
    fabRows.every(r => r.rows > 20), fabRows.map(r => `${r.w}x${r.h}: ${r.rows} visible row-positions swept`).join('; '));
  ok('FAB no News row is ever under the FAB, at any scroll position, at 393x852 and 375x667',
    fabRows.every(r => !r.worst),
    fabRows.map(r => `${r.w}x${r.h}: ${r.worst
      ? `${r.worst.id} covered ${r.worst.ov.join(' x ')}px at scrollTop ${r.worst.at}, elementFromPoint = ${r.worst.hit}`
      : `clear (FAB top ${r.fabTop}, scrollport ends ${r.padBottom})`}`).join('; '));

  /* -------------------------------------------------------------- HERO ---- */
  const hero = await page.evaluate(() => {
    const img = document.querySelector('.nb-hero-figs img[src*="poster"]');
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return { src: img.getAttribute('src'), nat: img.naturalWidth, css: +r.width.toFixed(1), full: img.dataset.full || null };
  });
  setup('SAMPLE the news hero is the Locker Room poster', !!hero, hero ? `${hero.src} at ${hero.css}px` : 'no poster in .nb-hero-figs');
  /* BYTES AS THE PAGE TOOK THEM. Resource Timing first, the response header
     second: a plate answered by the service worker's cache arrives with no
     content-length at all, and a row that fails because a header is missing is
     not a row about bytes. encodedBodySize is the body the page decoded either
     way, and it is 0 only when nothing was fetched, which this row treats as
     ungraded rather than as a pass. */
  const perf = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(e => /football\/poster\.png$/.test(e.name))
    .map(e => [e.name.replace(location.origin + '/', ''), e.encodedBodySize || e.transferSize || 0]));
  const heroBytes = perf.filter(([, b]) => b > 0).length ? perf : [...wire.entries()];
  const worstBytes = heroBytes.length ? Math.max(...heroBytes.map(([, b]) => b)) : 0;
  ok(`HERO the hero plate on the wire is under ${(HERO_CEIL / 1024) | 0} KB (the 640 master is 359 KB for a ${hero.css}px box)`,
    worstBytes > 0 && worstBytes <= HERO_CEIL,
    heroBytes.map(([u, b]) => `${u} ${(b / 1024).toFixed(1)} KB`).join(', ') || 'no poster fetch was seen');
  ok('HERO-SHARP the tier it serves still covers the box at dpr 2, and the master is kept as the onerror fallback',
    !!hero && hero.nat >= hero.css * 2 && !!hero.full,
    hero ? `${hero.nat}px source for ${hero.css} CSS px (needs ${(hero.css * 2).toFixed(0)}), data-full ${hero.full || 'MISSING'}` : '');

  /* -------------------------------------------------------------- PILL ---- */
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await seed(page, { coins: 400000 });
  await openShop();
  const kitClosed = await page.evaluate(() => document.querySelector('#fbSect')?.open === false);
  /* SCROLLED DOWN, AND NO RELOAD. Two things have to be true for this to grade
     the closure rather than a fresh render: seed()'s default page reload would
     re-run renderShop with the new balance (which is the harness re-rendering,
     not the app), and bgRefresh re-renders in place whenever the screen is
     within 48px of the top. A player reading the shelf is scrolled down; that
     is the state where the stale closure survives, and the row below asserts
     the scroll really was preserved so it cannot pass on a re-render. */
  await page.evaluate(() => { document.querySelector('#screen').scrollTop = 220; });
  await sleep(300);
  await seed(page, { coins: 0, reload: false });   // the wallet moves while the room is shut
  await sleep(1200);
  const held = await page.evaluate(() => document.querySelector('#screen').scrollTop);
  await openKit();
  const pill = await page.evaluate(async () => {
    const b = document.querySelector('.drop-item.fb .drop-buy:not([disabled])');
    if (!b) return { err: 'no enabled kit-room buy pill' };
    const cant = b.classList.contains('cant');
    b.click();
    await new Promise(r => setTimeout(r, 900));
    return { cant, label: b.textContent.trim().slice(0, 24), toast: document.querySelector('.toast')?.textContent || null };
  });
  setup('SAMPLE the kit room was SHUT when the shop rendered and the shop was NOT re-rendered after the wallet moved',
    kitClosed && held > 48 && !pill.err,
    `#fbSect closed at render: ${kitClosed}, scroll held at ${held} (a re-render resets it to 0)${pill.err ? `; ${pill.err}` : ''}`);
  ok('PILL a pill built after the wallet emptied knows it: it reads `cant` and its tap quotes the LIVE balance, not the render-time one',
    pill.cant === true && /You have 0\./.test(pill.toast || ''),
    `cant=${pill.cant}, tap said ${JSON.stringify(pill.toast)} (stale reads "You have 400,000.", or arms to buy)`);

  /* ------------------------------------------------------------- NOART ---- */
  await seed(page, { coins: 400000 });
  await openShop();
  await openKit();
  const noart = await page.evaluate(async () => {
    const tiles = [...document.querySelectorAll('.drop-item.fb')];
    const t = tiles.find(x => /^jersey$/i.test((x.querySelector('b')?.textContent || '').trim()));
    if (!t) return { err: `no Jersey tile among ${tiles.map(x => x.querySelector('b')?.textContent).join(', ')}` };
    const img = [...t.querySelectorAll('img')].find(i => /jersey/.test(i.getAttribute('src') || ''));
    if (!img) return { err: 'the Jersey tile draws no jersey image' };
    const before = { tints: t.querySelectorAll('.fb-tint').length, dis: t.querySelector('.drop-buy').disabled };
    img.removeAttribute('data-full');       // the tier already failed; this is the master failing too
    img.src = 'assets/bh/football/__missing__.png';
    await new Promise(r => setTimeout(r, 1200));
    const others = tiles.filter(x => x !== t).reduce((n, x) => n + x.querySelectorAll('.fb-tint').length, 0);
    return {
      before,
      tints: t.querySelectorAll('.fb-tint').length,
      painted: [...t.querySelectorAll('.fb-tint')].filter(s => s.getBoundingClientRect().width > 0).length,
      dis: t.querySelector('.drop-buy').disabled,
      others,
    };
  });
  setup('SAMPLE the Jersey tile drew its garment and its two tint spans before anything was broken',
    !noart.err && noart.before.tints >= 2 && noart.before.dis === false,
    noart.err || `${noart.before.tints} tint spans, buy enabled`);
  ok('NOART a garment whose master fails takes its tint spans with it: no disembodied paint',
    noart.tints === 0 && noart.painted === 0, `${noart.tints} spans left, ${noart.painted} still painting`);
  ok('NOART-CHARGE and the tile it emptied stops selling', noart.dis === true, `buy disabled: ${noart.dis}`);
  ok('NOART-SCOPE only that garment lost its paint: every other tile still has its own',
    noart.others > 0, `${noart.others} tint spans across the other tiles`);

  ok('nothing threw to the page', errs.length === 0, errs.slice(0, 2).join(' | '));
} finally {
  await browser.close().catch(() => {});
  srv?.close?.();
}

console.log(fails ? '\nLOCKER POLISH: FAILED' : '\nLOCKER POLISH: the proof is readable, the FAB owns nothing, the pill knows the wallet, the hero is tiered and a missing master sells nothing');
process.exit(fails);

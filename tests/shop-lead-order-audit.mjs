/* WHICH SHELF LEADS THE SHOP, MEASURED AS BOXES ON A SCREEN.
 *
 * Tom, 2026-09-04: "bumbleseal moves to the shelf make sure it looks good and
 * resized as needed, nfl shit goes to the lead shelf of the shop." So there are
 * two orders and one flag between them:
 *
 *   FOOTBALL_KIT_LIVE false   the pet hero leads, the Kit room does not exist
 *   FOOTBALL_KIT_LIVE true    the Kit room leads and the pet shelf drops into
 *                             the supplies panel beside the Puffer Pack
 *
 * THE OFF ORDER IS THE ONE THAT MATTERS. The flag is false in the shipped tree,
 * so every player alive is looking at the off order; a broken Shop for all of
 * them is far worse than a late kit. That is why the off rows here are not just
 * "the pet shelf is present" but "the pet shelf is the FIRST child of the Shop
 * container, above the rack strip, with no football markup anywhere in it".
 *
 * WHY A BROWSER ROW AT ALL, when tests/unit.test.js already pins the order of
 * the string the Shop builds: a string order is not a screen order. A block can
 * lead the markup and paint at zero height, or be detached, or sit below the
 * fold of a scroller that was left where the last render put it. Every box read
 * here is required to be in the live document, non-zero, and inside the
 * viewport before any claim is made about where it sits, because a detached node
 * hands back an all-zero rect that reads perfectly clean.
 *
 * HOW THE FLAG IS FLIPPED, and it is never flipped on disk: data/football-teams.js
 * is intercepted at the network and served with FOOTBALL_KIT_LIVE = true for the
 * ON half. The interception is COUNTED and the page is asked to import the module
 * and report the flag back, so an override that silently failed to match a URL
 * reads as SETUP rather than passing three rows about an unchanged shop. That was
 * a real failure of the first draft of this file: with no counter, an override
 * that never fired produced "the flag-off shop looks like the flag-off shop",
 * which is true and worthless.
 *
 * PROVE-RED, on a `tar`-copied throwaway tree, 2026-09-04, exit codes read
 * directly and never through a pipe. All three exit 1:
 *
 *   const petLead = petShelf            (drop the gate: she leads AND drops)
 *     FAIL  DROP-ON Bumbleseal moved into the supplies panel behind the Puffer
 *     Pack, and the Puffer Pack is still there  | 2 pet shelf/shelves in the
 *     Shop (want exactly 1), inside #shopRestBody: true, after #dropSect in the
 *     document: false, Puffer Pack present: true
 *
 *   const fbLead = footballShelfHtml(...)   (ungated: the kit leaks into the
 *                                            shop every player has today)
 *     FAIL  LEAD-OFF with the kit shut the pet hero leads the Shop and there is
 *     no football markup in it  | first child details#fbSect.t3-dropsect (1 pet
 *     shelf/shelves), #fbSect present: true, football markup: true; hero
 *     .pet-hero 398x211.6 at 16,573.5 ... above rack strip .rk-theme ...
 *
 *   ${petDrop} moved above ${fbLead}     (she takes the lead back)
 *     FAIL  LEAD-ON the Kit room is the first shelf in the Shop and the pet
 *     shelf is not  | the Shop's first child is div.rk-theme, wanted the Kit
 *     room (#fbSect); kit #fbSect 398x164.6 at 16,899.8 ...
 *     FAIL  DROP-ON ... | 1 pet shelf/shelves in the Shop (want exactly 1),
 *     inside #shopRestBody: false, after #dropSect in the document: false
 *
 * Run: node tests/shop-lead-order-audit.mjs [baseUrl] [--shots DIR]
 * HEADLESS_MODE=shell on this Mac. Self-serving: with no URL it serves this
 * checkout, so it can never grade production.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, settle, setWidth, serveTree, sleep } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};
const setup = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'SETUP'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) { console.log('\n  This audit GRADED NOTHING.'); process.exit(2); }
};
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/* The ON half's module, built from the file this audit is about to SERVE rather
   than from a copy pasted in here, so a rename of the flag is a hard error and
   not a silent "the shop did not change". */
const FB_SRC = readFileSync(path.join(ROOT, 'data', 'football-teams.js'), 'utf8');
const FB_LIVE = FB_SRC.replace('export const FOOTBALL_KIT_LIVE = false;', 'export const FOOTBALL_KIT_LIVE = true;');
setup('SETUP the shipped tree has the kit shut and this file can open it for the ON half',
  /export const FOOTBALL_KIT_LIVE = false;/.test(FB_SRC) && /export const FOOTBALL_KIT_LIVE = true;/.test(FB_LIVE),
  `committed data/football-teams.js declares the flag false: ${/= false;/.test(FB_SRC)}`);

const argUrl = process.argv.slice(2).find(a => !a.startsWith('--') && /^https?:/.test(a));
const srv = argUrl ? null : await serveTree(ROOT);
const { browser, page } = await boot(argUrl || process.env.URL || srv.url);
const errors = [];
page.on('pageerror', e => errors.push(e.message));

let hits = 0;
const overrideFlag = async on => {
  hits = 0;
  page.removeAllListeners('request');
  await page.setCacheEnabled(false);
  await page.setRequestInterception(true);
  page.on('request', r => {
    if (on && new URL(r.url()).pathname.endsWith('/data/football-teams.js')) {
      hits++;
      return r.respond({ status: 200, contentType: 'text/javascript; charset=utf-8', body: FB_LIVE });
    }
    r.continue();
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2600);
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
};

/* A real navigation. Setting location.hash to the value it already holds fires
   no hashchange, so route() never runs. */
const goShop = async () => {
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(400);
  await page.evaluate(() => { location.hash = '#/shop'; });
  await sleep(3200);
  await settle(page);
  await page.evaluate(() => { document.querySelectorAll('#toast, .toast').forEach(n => n.remove()); });
};

/* Every box comes back with what makes it trustworthy attached: whether it is in
   the live document, whether it paints, and whether it is on screen. Nothing
   below compares two rects without both having passed LIVE first. */
const read = () => page.evaluate(() => {
  const box = sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      sel, x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      inDoc: document.contains(el),
      paints: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
      inView: r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight,
    };
  };
  const c = document.querySelector('#chContent');
  const name = n => n ? n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className ? '.' + String(n.className).trim().split(/\s+/).join('.') : '') : null;
  const drop = document.querySelector('#dropSect'), pet = document.querySelector('.pet-shelf');
  return {
    found: !!c,
    len: c ? c.innerHTML.length : 0,
    /* The id and the class separately, not the composed name: pinning a row to
       the full class list of a <details> is how a guard goes red on healthy code
       the day somebody adds a modifier class to it. The composed name is carried
       for the failure line only. */
    first: name(c && c.firstElementChild),
    firstId: (c && c.firstElementChild && c.firstElementChild.id) || '',
    firstCls: [...(c?.firstElementChild?.classList || [])],
    kids: [...(c?.children || [])].map(name),
    hero: box('.pet-hero'), shelf: box('.pet-shelf'), fb: box('#fbSect'),
    drop: box('#dropSect'), rack: box('.rk-theme'),
    hasFb: !!document.querySelector('#fbSect'),
    fbMarkup: /data-buyfb|fb-kitline|id="fbSect"/.test(c ? c.innerHTML : ''),
    petCount: document.querySelectorAll('.pet-shelf').length,
    petInSupplies: !!document.querySelector('#shopRestBody .pet-shelf'),
    petAfterDrop: drop && pet ? (drop.compareDocumentPosition(pet) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 : null,
  };
});
const live = b => !!b && b.inDoc && b.paints && b.w > 8 && b.h > 8;
const fmt = b => b ? `${b.sel} ${b.w}x${b.h} at ${b.x},${b.y} (inDoc ${b.inDoc}, paints ${b.paints}, inView ${b.inView})` : 'absent';

try {
  await seed(page, { level: 20, coins: 400000 });
  await setWidth(page, 430, 932);

  /* ---------------- THE SHOP EVERY PLAYER HAS TODAY ---------------- */
  await overrideFlag(false);
  await goShop();
  const off = await read();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'shop-flag-off.png') });
  setup('SAMPLE the Shop rendered with real content and a real pet hero in it',
    off.found && off.len > 5000 && off.kids.length > 4 && live(off.hero),
    `#chContent ${off.len} chars, ${off.kids.length} shelves, hero ${fmt(off.hero)}`);

  ok('LEAD-OFF with the kit shut the pet hero leads the Shop and there is no football markup in it',
    off.firstCls.includes('pet-shelf') && off.petCount === 1 && !off.hasFb && !off.fbMarkup
      && live(off.hero) && off.hero.inView && live(off.rack) && off.hero.y < off.rack.y,
    `first child ${off.first} (${off.petCount} pet shelf/shelves), #fbSect present: ${off.hasFb}, football markup: ${off.fbMarkup}; hero ${fmt(off.hero)} above rack strip ${fmt(off.rack)}`);

  /* ---------------- AND THE SHOP ONCE TOM FLIPS THE FLAG ---------------- */
  await overrideFlag(true);
  await goShop();
  const on = await read();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'shop-flag-on.png') });
  const flagInPage = await page.evaluate(async () => (await import('/data/football-teams.js')).FOOTBALL_KIT_LIVE);
  setup('SAMPLE the ON half really is the ON half: the override was served and the page reports the flag true',
    hits > 0 && flagInPage === true && on.found && on.hasFb,
    `override served ${hits}x, page reads FOOTBALL_KIT_LIVE=${flagInPage}, #fbSect present: ${on.hasFb}`);

  ok('LEAD-ON the Kit room is the first shelf in the Shop and the pet shelf is not',
    on.firstId === 'fbSect' && live(on.fb) && on.fb.inView && live(on.rack) && on.fb.y < on.rack.y,
    `the Shop's first child is ${on.first}, wanted the Kit room (#fbSect); kit ${fmt(on.fb)} above rack strip ${fmt(on.rack)}`);

  ok('DROP-ON Bumbleseal moved into the supplies panel behind the Puffer Pack, and the Puffer Pack is still there',
    on.petCount === 1 && on.petInSupplies && on.petAfterDrop === true && !!on.drop,
    `${on.petCount} pet shelf/shelves in the Shop (want exactly 1), inside #shopRestBody: ${on.petInSupplies}, ` +
    `after #dropSect in the document: ${on.petAfterDrop}, Puffer Pack present: ${!!on.drop}`);

  /* Open the supplies panel and park her on screen: everything above measured
     her collapsed, which is a zero rect and proves nothing about how she looks. */
  await page.evaluate(() => document.querySelector('#shopRest')?.click());
  await sleep(900);
  await settle(page);
  await page.evaluate(() => {
    const sc = document.querySelector('.screen'), el = document.querySelector('.pet-hero');
    if (sc && el) sc.scrollTop = Math.max(0, el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 70);
    document.querySelectorAll('#toast, .toast').forEach(n => n.remove());
  });
  await sleep(500);
  await settle(page);
  const opened = await read();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'shop-flag-on-bumbleseal.png') });
  setup('SAMPLE the supplies panel opened and Bumbleseal is on screen to be measured',
    live(opened.hero) && opened.hero.inView,
    `hero ${fmt(opened.hero)}`);

  const vw = await page.evaluate(() => innerWidth);
  ok('SIZE-ON her hero is the same box in its new slot as it is in the lead, and it still fits the screen',
    Math.abs(opened.hero.w - off.hero.w) <= 1 && Math.abs(opened.hero.h - off.hero.h) <= 1
      && opened.hero.x >= 0 && opened.hero.x + opened.hero.w <= vw + 1,
    `lead slot ${off.hero.w}x${off.hero.h}, drop slot ${opened.hero.w}x${opened.hero.h}, ` +
    `left edge ${opened.hero.x} and right edge ${(opened.hero.x + opened.hero.w).toFixed(1)} inside a ${vw}px viewport`);

  ok('LEAD-CLEAN nothing threw across either order', errors.length === 0, errors.join(' | ') || 'clean');
} catch (e) {
  console.log(`FAIL  LEAD-HARNESS the audit itself died  | ${e && e.message}`);
  fails = 1;
} finally {
  await browser.close();
  srv?.close?.();
}

console.log(fails
  ? '\nTHE SHOP IS NOT LEADING WITH THE SHELF IT WAS TOLD TO LEAD WITH.'
  : '\nLEAD SHELF: the pet hero leads while the kit is shut, the Kit room leads once it is open, and she keeps her box on the way down');
process.exit(fails);

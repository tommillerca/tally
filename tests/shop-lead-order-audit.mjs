/* WHICH SHELF LEADS THE SHOP AND WHICH ONE IS SECOND, MEASURED AS BOXES ON A
 * SCREEN.
 *
 * Tom, 2026-09-04: "nfl shit goes to the lead shelf of the shop", then, on the
 * first attempt at the rest of it: "dont put her in potion supplies find a way
 * to have her prominent in the shop but less than NFL." That first attempt put
 * Bumbleseal in the drop-shelf area, which lives inside #shopRestBody behind the
 * "Potions and charms . Supplies" button, so a 50,000-coin legendary pet was
 * invisible until somebody tapped. The ruling is SECOND, in the open:
 *
 *   FOOTBALL_KIT_LIVE true    the Kit room leads, Bumbleseal follows it under a
 *                             heading of her own, both above the rack strip and
 *                             neither of them inside #shopRestBody
 *   FOOTBALL_KIT_LIVE false   the pet hero leads, the Kit room does not exist
 *
 * THE FLAG NOW SHIPS TRUE (Tom: "if it is ready ship it live like i said
 * before"), so the ON half is the shop every player has and it is graded on the
 * REAL data/football-teams.js, not on an override. The OFF half is the shop
 * every build before this one shipped, and it is the one that proves the flag is
 * still a single line back to safety: it is produced by serving the same file
 * with the flag rewritten to false at the network.
 *
 * WHY A BROWSER ROW AT ALL, when tests/unit.test.js already pins the order of
 * the string the Shop builds: a string order is not a screen order. A block can
 * lead the markup and paint at zero height, or be detached, or sit below the
 * fold of a scroller that was left where the last render put it. Every box read
 * here is required to be in the live document, non-zero, and inside the
 * viewport before any claim is made about where it sits, because a detached node
 * hands back an all-zero rect that reads perfectly clean.
 *
 * HOW THE OFF HALF IS PRODUCED, and the flag is never flipped on disk:
 * data/football-teams.js is intercepted at the network and served with
 * FOOTBALL_KIT_LIVE = false. The interception is COUNTED and the page is asked
 * to import the module and report the flag back, so an override that silently
 * failed to match a URL reads as SETUP rather than passing rows about an
 * unchanged shop. That was a real failure of the first draft of this file: with
 * no counter, an override that never fired produced "the flag-off shop looks
 * like the flag-off shop", which is true and worthless. The ON half asks the
 * page for the flag too, for the same reason in the other direction.
 *
 * THE RACK STRIP IS FOUND BY ITS OWN TEXT, never by `.rk-theme`. Three strips
 * carry that class (the rack, the rotating shelf, and now Bumbleseal's own
 * heading), so `querySelector('.rk-theme')` returns HER heading in the ON order
 * and the row that claims "above the rack" would have been comparing her to
 * herself.
 *
 * PROVE-RED, on a `tar`-copied throwaway tree, 2026-09-04, exit codes read
 * directly and never through a pipe. All exit 1:
 *
 *   petLead put back inside #shopRestBody (the rejected first pass)
 *     FAIL  SECOND-ON Bumbleseal is the second shelf in the Shop, above the rack
 *     and out in the open  | (see the run log recorded with this branch)
 *
 *   ${fbLead}${petLead} swapped to ${petLead}${fbLead}
 *     FAIL  LEAD-ON the Kit room is the first shelf in the Shop and the pet shelf
 *     is not
 *
 *   const fbLead = footballShelfHtml(...)   (ungated: the kit leaks into the
 *                                            flag-off shop)
 *     FAIL  LEAD-OFF with the kit shut the pet hero leads the Shop and there is
 *     no football markup in it
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

/* The OFF half's module, built from the file this audit is about to SERVE rather
   than from a copy pasted in here, so a rename of the flag is a hard error and
   not a silent "the shop did not change". */
const FB_SRC = readFileSync(path.join(ROOT, 'data', 'football-teams.js'), 'utf8');
const FB_OFF = FB_SRC.replace(/export const FOOTBALL_KIT_LIVE = true;/, 'export const FOOTBALL_KIT_LIVE = false;');
setup('SETUP the shipped tree has the kit LIVE and this file can shut it again for the OFF half',
  /export const FOOTBALL_KIT_LIVE = true;/.test(FB_SRC) && /export const FOOTBALL_KIT_LIVE = false;/.test(FB_OFF),
  `committed data/football-teams.js declares the flag true: ${/export const FOOTBALL_KIT_LIVE = true;/.test(FB_SRC)}, ` +
  `the served OFF variant declares it false: ${/export const FOOTBALL_KIT_LIVE = false;/.test(FB_OFF)}`);

const argUrl = process.argv.slice(2).find(a => !a.startsWith('--') && /^https?:/.test(a));
const srv = argUrl ? null : await serveTree(ROOT);
const { browser, page } = await boot(argUrl || process.env.URL || srv.url);
const errors = [];
page.on('pageerror', e => errors.push(e.message));

let hits = 0;
/* on=true is the SHIPPED file, served by the server with nothing intercepted.
   on=false serves FB_OFF, and only that direction increments the counter. */
const overrideFlag = async on => {
  hits = 0;
  page.removeAllListeners('request');
  await page.setCacheEnabled(false);
  await page.setRequestInterception(true);
  page.on('request', r => {
    if (!on && new URL(r.url()).pathname.endsWith('/data/football-teams.js')) {
      hits++;
      return r.respond({ status: 200, contentType: 'text/javascript; charset=utf-8', body: FB_OFF });
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
  /* THE RACK STRIP BY ITS OWN TEXT. `.rk-theme` is on three strips now (the
     rack, the rotating shelf, and Bumbleseal's heading), so selecting the first
     one returns HER heading in the ON order and "above the rack" would compare
     her to herself. Tag the real one and hand back a selector for it. */
  const rackEl = [...document.querySelectorAll('.rk-theme')].find(n => /RACK\s+\d+\s+OF\s+\d+/.test(n.textContent));
  if (rackEl) rackEl.setAttribute('data-rackstrip', '1');
  const rackSel = '[data-rackstrip]';
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
    drop: box('#dropSect'), rack: box(rackSel),
    hasFb: !!document.querySelector('#fbSect'),
    fbMarkup: /data-buyfb|fb-kitline|id="fbSect"/.test(c ? c.innerHTML : ''),
    petCount: document.querySelectorAll('.pet-shelf').length,
    petInSupplies: !!document.querySelector('#shopRestBody .pet-shelf'),
    petAfterDrop: drop && pet ? (drop.compareDocumentPosition(pet) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 : null,
    /* Which top-level child of the Shop she is. 0 = leading, 1 = second. Read
       off the real child list rather than from a y-coordinate, because two
       shelves can share a y in a future layout and 'second' is an order. */
    petSlot: pet ? [...(c?.children || [])].findIndex(n => n === pet || n.contains(pet)) : -1,
    fbSlot: (() => { const f = document.querySelector('#fbSect'); return f ? [...(c?.children || [])].findIndex(n => n === f || n.contains(f)) : -1; })(),
    /* Her own heading: present, between the kit and her, and carrying words. */
    petHeadingText: (() => {
      if (!pet) return null;
      let n = pet.previousElementSibling;
      return n && n.classList.contains('rk-theme') ? n.textContent.trim() : null;
    })(),
    restHidden: (() => { const b = document.querySelector('#shopRestBody'); return b ? b.hidden : null; })(),
  };
});
const live = b => !!b && b.inDoc && b.paints && b.w > 8 && b.h > 8;
const fmt = b => b ? `${b.sel} ${b.w}x${b.h} at ${b.x},${b.y} (inDoc ${b.inDoc}, paints ${b.paints}, inView ${b.inView})` : 'absent';

try {
  await seed(page, { level: 20, coins: 400000 });
  await setWidth(page, 430, 932);

  /* ------- THE SHOP EVERY BUILD BEFORE THIS ONE SHIPPED (flag off) ------- */
  await overrideFlag(false);
  await goShop();
  const off = await read();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'shop-flag-off.png') });
  const flagOffInPage = await page.evaluate(async () => (await import('/data/football-teams.js')).FOOTBALL_KIT_LIVE);
  setup('SAMPLE the OFF half really is the OFF half: the override was served, the page reports the flag false, and the Shop has real content in it',
    hits > 0 && flagOffInPage === false && off.found && off.len > 5000 && off.kids.length > 4 && live(off.hero),
    `override served ${hits}x, page reads FOOTBALL_KIT_LIVE=${flagOffInPage}; #chContent ${off.len} chars, ${off.kids.length} shelves, hero ${fmt(off.hero)}`);

  ok('LEAD-OFF with the kit shut the pet hero leads the Shop and there is no football markup in it',
    off.firstCls.includes('pet-shelf') && off.petCount === 1 && !off.hasFb && !off.fbMarkup
      && live(off.hero) && off.hero.inView && live(off.rack) && off.hero.y < off.rack.y,
    `first child ${off.first} (${off.petCount} pet shelf/shelves), #fbSect present: ${off.hasFb}, football markup: ${off.fbMarkup}; hero ${fmt(off.hero)} above rack strip ${fmt(off.rack)}`);

  /* ---------------- AND THE SHOP AS IT SHIPS (flag true on disk) ---------------- */
  await overrideFlag(true);
  await goShop();
  const on = await read();
  const flagInPage = await page.evaluate(async () => (await import('/data/football-teams.js')).FOOTBALL_KIT_LIVE);
  setup('SAMPLE the ON half is the SHIPPED file with nothing intercepted, and the page reports the flag true',
    hits === 0 && flagInPage === true && on.found && on.hasFb,
    `interceptions in this half: ${hits} (must be 0), page reads FOOTBALL_KIT_LIVE=${flagInPage}, #fbSect present: ${on.hasFb}`);

  ok('LEAD-ON the Kit room is the first shelf in the Shop and the pet shelf is not',
    on.firstId === 'fbSect' && on.fbSlot === 0 && live(on.fb) && on.fb.inView && live(on.rack) && on.fb.y < on.rack.y,
    `the Shop's first child is ${on.first}, wanted the Kit room (#fbSect); kit ${fmt(on.fb)} above rack strip ${fmt(on.rack)}`);

  /* Park her on screen before anything is claimed about her box: she sits below
     the kit poster, and a rect measured off-viewport proves nothing about how
     she looks. Scroll first, THEN read, THEN shoot. */
  await page.evaluate(() => {
    const sc = document.querySelector('.screen'), el = document.querySelector('.pet-hero');
    if (sc && el) sc.scrollTop = Math.max(0, el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 70);
    document.querySelectorAll('#toast, .toast').forEach(n => n.remove());
  });
  await sleep(500);
  await settle(page);
  const onPet = await read();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'shop-flag-on.png') });
  /* THE SAMPLE ROW ASSERTS THE RUN HAPPENED, NEVER THE VERDICT. Its first draft
     required her hero to be live and in view, so the rejected first pass (her
     inside the collapsed supplies panel, hero 0x0) aborted the audit at SETUP
     with exit 2 and SECOND-ON was never graded at all: a guard that stops
     grading on exactly the defect it exists for. What belongs here is that the
     Shop rendered, that there is a pet shelf somewhere in it, and that nothing
     on this screen was tapped. Where she is and whether she paints is the
     verdict, and it is SECOND-ON's. */
  setup('SAMPLE the ON order rendered a Shop with a pet shelf in it and NOTHING on the screen was tapped',
    onPet.found && onPet.len > 5000 && onPet.petCount === 1 && onPet.restHidden === true,
    `#chContent ${onPet.len} chars, ${onPet.petCount} pet shelf/shelves, hero ${fmt(onPet.hero)}; ` +
    `#shopRestBody still hidden: ${onPet.restHidden} (nothing on this screen was clicked)`);

  /* THE ROW TOM'S SECOND NOTE EXISTS FOR. "dont put her in potion supplies find
     a way to have her prominent in the shop but less than NFL." Second, above
     the rack, under her own heading, and provably NOT behind the supplies
     button: #shopRestBody is still hidden at the moment this is measured, so a
     shelf inside it would have a zero rect and no reader would ever see it. */
  ok('SECOND-ON Bumbleseal is the second shelf in the Shop, above the rack and out in the open rather than in the supplies panel',
    on.petCount === 1 && !on.petInSupplies && on.petSlot > on.fbSlot && on.petSlot <= on.fbSlot + 2
      && !!on.petHeadingText && live(onPet.hero) && onPet.hero.inView
      && live(onPet.rack) && onPet.hero.y < onPet.rack.y && onPet.restHidden === true,
    `${on.petCount} pet shelf/shelves; #chContent child index: kit ${on.fbSlot}, her ${on.petSlot}; ` +
    `inside #shopRestBody: ${on.petInSupplies} (and that panel is hidden: ${onPet.restHidden}); ` +
    `her own heading above her: ${JSON.stringify(on.petHeadingText)}; hero ${fmt(onPet.hero)} above rack strip ${fmt(onPet.rack)}`);

  ok('PUFFER-ON the Puffer Pack stayed exactly where it was, inside the supplies panel, and did not follow her out',
    !!on.drop && on.petAfterDrop === false && !!(on.kids || []).length,
    `#dropSect present: ${!!on.drop}, and the pet shelf is AFTER it in the document: ${on.petAfterDrop} (must be false: she is above it now); Shop children: ${on.kids.join(' > ')}`);

  const vw = await page.evaluate(() => innerWidth);
  ok('SIZE-ON her hero is the same box in the second slot as it is in the lead, and it still fits the screen',
    Math.abs(onPet.hero.w - off.hero.w) <= 1 && Math.abs(onPet.hero.h - off.hero.h) <= 1
      && onPet.hero.x >= 0 && onPet.hero.x + onPet.hero.w <= vw + 1,
    `lead slot ${off.hero.w}x${off.hero.h}, second slot ${onPet.hero.w}x${onPet.hero.h}, ` +
    `left edge ${onPet.hero.x} and right edge ${(onPet.hero.x + onPet.hero.w).toFixed(1)} inside a ${vw}px viewport`);

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
  : '\nSHELF ORDER: the Kit room leads, Bumbleseal is second and needs no tap to be seen, the Puffer Pack stayed put, and shutting the flag puts the old Shop back exactly');
process.exit(fails);

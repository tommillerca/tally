/* GWART IS THE ONE PLACE ANSWERS LIVE, AND HE HAS TO BE TAPPABLE EVERYWHERE HE
 * STANDS. 2026-08-23.
 *
 * Tom, 2026-08-22 (docs/FEEDBACK-2026-08-22-v424.md, item 4): "ectoplasm needs an
 * explanation the transmute thing as confused almost all of my friends and leads
 * to a bigger question, clicking on gwart should take you to an explainer FAQ
 * page that can help all confuse players."
 *
 * THE FEATURE IS THE COPY, so two of the rows below grade WORDS and not markup.
 * A Guide sheet that opens perfectly and explains the transmute wrongly is the
 * bug Tom reported, shipped a second time with a nicer container around it.
 *
 * WHAT EACH ROW IS FOR, and why none of them is decoration:
 *
 *   REACH-TODAY   a real mouse click at the plaque's own coordinates opens the
 *   REACH-SHOP    Guide, on both surfaces Gwart is drawn on. Real clicks, never
 *                 a call to openGwartGuide: the whole defect class here is a tap
 *                 target that is not a tap target.
 *   COVERAGE      the blind-detector, and the row that catches the NEXT one.
 *                 Static: every site in js/app.js that draws gwart.png must sit
 *                 inside a control that opens the Guide. A third Gwart panel
 *                 added next month with no tap fails this before it ships, which
 *                 is the half REACH-TODAY and REACH-SHOP structurally cannot do
 *                 because they only know about the surfaces that exist today.
 *   ENTRIES       the sheet holds the whole launch set. An empty sheet opens,
 *                 scrolls and dismisses flawlessly, so without this the three
 *                 rows above pass on nothing.
 *   INK           and it is PAINTED. Scored off a REAL SCREENSHOT of the open
 *                 sheet, because a DOM full of text reads perfectly over a blank
 *                 frame. The score is distinct byte values in the PNG plus its
 *                 size: a panel of text runs into the thousands and an unpainted
 *                 frame compresses to almost nothing, which is all this row
 *                 needs to tell "painted" from "blank". It is deliberately not a
 *                 layout measurement; nothing here grades position.
 *   SCROLL        the body is longer than the sheet and scrollTop really moves.
 *   DISMISS       and it goes away again.
 *   DEEPLINK      the inline "What is this?" on the Kitchen's Transmute row
 *                 opens the Guide with the Transmute entry ALREADY OPEN. Driven
 *                 by opening the real Kitchen and clicking the real button.
 *   TRUTH         the Transmute entry still names the numbers js/cooking.js
 *                 actually implements. Derived from TRANSMUTE at run time, never
 *                 pinned: re-cost the transmute and this goes red until the words
 *                 are rewritten, which is the only guard here that survives a
 *                 balance change.
 *
 * PROVEN RED, each mutation applied to the FILE in a throwaway `git archive`
 * tree and grepped to confirm it landed (a cp -R of a worktree shares its .git
 * and a checkout inside the copy writes back to the original, which proves
 * nothing):
 *   1. #gwartBtn's handler put back to gwSay(gwartLine(gwCtx)), i.e. the tap
 *      before Tom asked for the Guide -> 5 FAILED: REACH-TODAY, both ENTRIES
 *      rows, INK (score -1, there is no panel to clip) and SCROLL ("no body").
 *   2. TRANSMUTE.commons 6 -> 5 in js/cooking.js -> 1 FAILED: TRUTH alone, and
 *      it names the new number in its own row so the fix is the copy, not the
 *      threshold.
 *   3. the Emporium's <button class="gw-art"> put back to a <div>, i.e. the
 *      shop panel as it shipped -> 3 FAILED: COVERAGE (which reports the byte
 *      offset of the uncovered draw site), plus both REACH-SHOP rows.
 *
 * WHAT MUTATION 1 DID NOT RED, said plainly: DISMISS passed, because Escape on a
 * screen with no sheet on it leaves nothing behind perfectly well. It is a
 * regression row for the Guide that IS open, not a detector, and REACH-TODAY is
 * what fails loudly when the tap dies. Do not read its green as coverage.
 *
 * Run: node tests/gwart-guide-audit.mjs [baseUrl]   (serves this repo if omitted)
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree, dismissOverlays } from './godmode.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const argv = process.argv[2] || process.env.URL;
const srv = argv ? null : await serveTree(repo);
const base = argv || srv.url;
const fails = [];
const ok = (name, pass, detail = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!pass) fails.push(name); };

const appSrc = readFileSync(path.join(repo, 'js', 'app.js'), 'utf8');

/* ---------- COVERAGE: static, and it runs before a browser starts ----------
   Every gwart.png in js/app.js, with the markup around it. The window is 900
   characters back, which comfortably spans the largest of his two scenes (the
   Emporium panel opens its control 8 lines above the first img). A site whose
   window holds no Guide-opening control is a surface a player can tap forever. */
const gwartSites = [...appSrc.matchAll(/assets\/gwart\/gwart\.png/g)].map(m => m.index);
const OPENERS = /id="gwartBtn"|data-guide=/;
const uncovered = [];
const seen = new Set();
for (const at of gwartSites) {
  const before = appSrc.slice(Math.max(0, at - 900), at);
  const ctrl = before.lastIndexOf('<button');
  const covered = ctrl >= 0 && OPENERS.test(before.slice(ctrl));
  const key = before.slice(Math.max(0, ctrl), ctrl + 60).replace(/\s+/g, ' ');
  if (!covered) uncovered.push(`@${at}`); else seen.add(key);
}
ok('SETUP gwart.png is drawn somewhere in js/app.js at all (an empty sweep is a failure, never a pass)',
  gwartSites.length >= 2, `${gwartSites.length} draw sites`);
ok('COVERAGE every surface that draws Gwart sits inside a control that opens the Guide',
  uncovered.length === 0, uncovered.length ? `uncovered: ${uncovered.join(', ')}` : `${seen.size} distinct controls cover ${gwartSites.length} sites`);

/* ---------- TRUTH: the words against js/cooking.js, derived not pinned ---------- */
const { TRANSMUTE } = await import(path.join(repo, 'js', 'cooking.js'));
const transmuteEntry = (appSrc.match(/id: 'transmute'[\s\S]*?\n  \] \},/) || [''])[0];
const hours = TRANSMUTE.cooldownMs / 3600e3;
/* Spelled numbers, because the copy says "six" and "twenty hours" rather than
   "6" and "20h": Gwart writes prose. Not an expectation about the game, so it
   carries no instruction to go stale. PROVENANCE: written 2026-08-23 with
   GUIDE_ENTRIES, alongside docs/GWARTS-GUIDE-COPY.md. It is a spelling table for
   English integers and the only reason it stops at twenty is that TRANSMUTE's
   cooldown is 20 hours; extend it if a number in the copy outgrows it. */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const says = n => transmuteEntry.includes(String(n)) || (WORDS[n] && new RegExp(`\\b${WORDS[n]}\\b`, 'i').test(transmuteEntry));
ok('SETUP the Transmute entry was found in GUIDE_ENTRIES', transmuteEntry.length > 200, `${transmuteEntry.length} chars`);
ok(`TRUTH the Transmute entry names the real cost (${TRANSMUTE.commons} commons)`, says(TRANSMUTE.commons), `TRANSMUTE.commons = ${TRANSMUTE.commons}`);
ok(`TRUTH the Transmute entry names the real cooldown (${hours} hours)`, says(hours), `cooldownMs = ${hours}h`);
ok(`TRUTH the Transmute entry names what it yields (${TRANSMUTE.yields})`,
  new RegExp(TRANSMUTE.yields, 'i').test(transmuteEntry), `yields ${TRANSMUTE.yields}`);

const { browser, page } = await boot(base);
await sleep(600);
await dismissOverlays(page);

const guideOpen = () => page.evaluate(() => {
  const s = [...document.querySelectorAll('.sheet')].find(el => /Gwart/i.test(el.getAttribute('aria-label') || ''));
  if (!s) return null;
  const body = s.querySelector('.sheet-body');
  return {
    entries: [...s.querySelectorAll('.gd-e')].map(d => ({ id: d.dataset.gd, open: d.open })),
    text: (body?.innerText || '').trim().length,
    scrollH: body?.scrollHeight || 0,
    clientH: body?.clientHeight || 0,
  };
});
/* REAL MOUSE, at the element's own coordinates. Programmatic .click() reaches
   handlers a thumb does not, which is how a dead tap target passes an audit.
   SCROLL FIRST, same lesson godmode's own click() carries: a control below the
   fold measures perfectly and a click at its coordinates lands in dead space. */
const tapSel = async (sel, clip = null) => {
  const at = await page.evaluate(async (s, c) => {
    const e = document.querySelector(s);
    if (!e) return null;
    (document.querySelector(c) || e).scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 350));
    let r = e.getBoundingClientRect();
    /* CLIP, because .gw-art is a 480px square inside a .gw-panel that is
       overflow:hidden and shorter than it. Its geometric centre is in the part
       the panel throws away, so a click there hits whatever is BELOW the panel
       and the tap reads as dead. A thumb lands on the drawn wizard, which is the
       part still on screen, so intersect the two rects and aim at that. */
    const cr = c && document.querySelector(c)?.getBoundingClientRect();
    if (cr) {
      const top = Math.max(r.top, cr.top), bottom = Math.min(r.bottom, cr.bottom);
      const left = Math.max(r.left, cr.left), right = Math.min(r.right, cr.right);
      if (bottom <= top || right <= left) return null;
      r = { top, bottom, left, right, width: right - left, height: bottom - top };
    }
    return r.width && r.height && r.top >= 0 && r.bottom <= innerHeight
      ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, sel, clip);
  if (!at) return false;
  await page.mouse.click(at.x, at.y);
  await sleep(700);
  return true;
};
const close = async () => { await page.keyboard.press('Escape'); await sleep(600); };

/* ---------- REACH-TODAY ---------- */
ok('SETUP Today is up with Gwart on it', await page.evaluate(() => !!document.getElementById('gwartBtn')));
const tappedToday = await tapSel('#gwartBtn');
const fromToday = await guideOpen();
ok('REACH-TODAY a real tap on the Today plaque opens the Guide', tappedToday && !!fromToday,
  fromToday ? `${fromToday.entries.length} entries` : 'no Gwart sheet');

/* ---------- ENTRIES / INK / SCROLL / DISMISS, on the sheet that is open ---------- */
/* The launch set Tom asked for, in the order the entries ship in. PROVENANCE:
   Tom's brief for this branch, 2026-08-22 (docs/FEEDBACK-2026-08-22-v424.md item
   4 plus the build request): "ectoplasm, transmute, crates, eggs and pets, the
   wanderer, dust, saved fits, the wheel, streaks", with ectoplasm and transmute
   named as the two that carry the feature, which is why their POSITION is
   asserted and not only their presence. A tenth entry is a copy decision and
   belongs in docs/GWARTS-GUIDE-COPY.md first; add it here in the same change. */
const WANT = ['ectoplasm', 'transmute', 'crates', 'pets', 'wanderer', 'dust', 'fits', 'wheel', 'streaks'];
const haveIds = (fromToday?.entries || []).map(e => e.id);
ok('ENTRIES the launch set is all there, ectoplasm and transmute first',
  WANT.every(id => haveIds.includes(id)) && haveIds[0] === 'ectoplasm' && haveIds[1] === 'transmute',
  haveIds.join(', ') || 'none');
ok('ENTRIES nothing arrives pre-expanded when the Guide is opened from Gwart himself',
  (fromToday?.entries || []).every(e => !e.open) && (fromToday?.entries || []).length > 0);

/* INK: pixels, off a real screenshot, with every entry expanded so there is
   something to see. HEADLESS_MODE=shell drops the odd unpainted frame, so a
   blank capture is retried once before it is believed. */
await page.evaluate(() => document.querySelectorAll('.gd-e').forEach(d => { d.open = true; }));
await sleep(500);
const inkOf = async () => {
  const box = await page.evaluate(() => {
    const s = [...document.querySelectorAll('.sheet')].find(el => /Gwart/i.test(el.getAttribute('aria-label') || ''));
    const r = s?.querySelector('.sheet-body')?.getBoundingClientRect();
    return r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(Math.min(r.height, 600)) } : null;
  });
  if (!box || box.width < 10 || box.height < 10) return -1;
  const buf = await page.screenshot({ clip: box });
  /* Distinct byte values across the raw PNG: a painted panel of text runs into
     the thousands, an unpainted frame compresses to almost nothing. Cheap, and
     it needs no decoder. */
  return new Set(buf).size + buf.length / 1000;
};
let ink = await inkOf();
if (ink < 200) { await sleep(1200); ink = await inkOf(); }   // shell drops frames; retry once
ok('INK the open Guide is actually painted, not an empty panel', ink > 200, `score ${Math.round(ink)}`);

const scrolled = await page.evaluate(async () => {
  const s = [...document.querySelectorAll('.sheet')].find(el => /Gwart/i.test(el.getAttribute('aria-label') || ''));
  const b = s?.querySelector('.sheet-body');
  if (!b) return null;
  const before = b.scrollTop;
  b.scrollTop = 400;
  await new Promise(r => requestAnimationFrame(r));
  return { before, after: b.scrollTop, scrollH: b.scrollHeight, clientH: b.clientHeight };
});
ok('SCROLL the Guide is longer than the sheet and the body really scrolls',
  !!scrolled && scrolled.scrollH > scrolled.clientH + 40 && scrolled.after > scrolled.before,
  scrolled ? `${scrolled.scrollH}px in ${scrolled.clientH}px, scrollTop ${scrolled.before} -> ${scrolled.after}` : 'no body');

await close();
ok('DISMISS Escape closes it and leaves nothing behind', !(await guideOpen()));

/* ---------- DEEPLINK: the real Kitchen, the real "What is this?" ---------- */
await tapSel('#kitchenActBtn');
await sleep(900);
const hasWhat = await page.evaluate(() => !!document.querySelector('[data-guide="transmute"]'));
ok('SETUP the Kitchen carries a "What is this?" on its Transmute row', hasWhat);
if (hasWhat) {
  await tapSel('[data-guide="transmute"]');
  const deep = await guideOpen();
  const t = deep?.entries.find(e => e.id === 'transmute');
  ok('DEEPLINK the Kitchen link opens the Guide with the Transmute entry already expanded',
    !!t && t.open === true, deep ? `transmute open=${t?.open}` : 'no Gwart sheet');
  ok('DEEPLINK and it expanded that one ONLY, so the answer is on screen rather than nine headings down',
    !!deep && deep.entries.filter(e => e.open).length === 1,
    deep ? `${deep.entries.filter(e => e.open).length} expanded` : '');
  await close();
} else {
  ok('DEEPLINK the Kitchen link opens the Guide with the Transmute entry already expanded', false, 'link not rendered');
  ok('DEEPLINK and it expanded that one ONLY, so the answer is on screen rather than nine headings down', false, 'link not rendered');
}

/* ---------- REACH-SHOP: he is tappable in his own Emporium too ---------- */
/* CLEAR THE STACK WITH ESCAPE, one at a time. A `while (querySelector('.sheet'))
   history.back()` here spun the loop synchronously past the app's own history
   entry and navigated the page out from under the run: "Execution context was
   destroyed". Escape is the app's own top-sheet close, and it cannot overshoot. */
for (let i = 0; i < 4; i++) {
  if (!await page.evaluate(() => !!document.querySelector('.sheet'))) break;
  await close();
}
await sleep(700);
const inShop = await page.evaluate(async () => {
  const hit = [...document.querySelectorAll('#tabbar button, #tabbar a, [data-route]')]
    .find(b => /bonehead|character|hero/i.test(b.textContent + ' ' + (b.dataset.route || '') + ' ' + (b.getAttribute('aria-label') || '')));
  hit?.click();
  await new Promise(r => setTimeout(r, 1400));
  const shop = [...document.querySelectorAll('.ch-tabs [data-tab]')].find(b => b.dataset.tab === 'shop');
  shop?.click();
  await new Promise(r => setTimeout(r, 1600));
  return !!document.querySelector('.gw-art');
});
ok('SETUP the Emporium rendered with Gwart in it', inShop);
if (inShop) {
  const tappedShop = await tapSel('.gw-art', '.gw-panel');
  const fromShop = await guideOpen();
  ok('REACH-SHOP a real tap on Gwart in his own Emporium opens the same Guide',
    tappedShop && !!fromShop && fromShop.entries.length === WANT.length,
    fromShop ? `${fromShop.entries.length} entries` : 'no Gwart sheet');
  ok('REACH-SHOP .gw-art is a real control, so the keyboard and a screen reader get it too',
    await page.evaluate(() => document.querySelector('.gw-art')?.tagName === 'BUTTON'));
} else {
  ok('REACH-SHOP a real tap on Gwart in his own Emporium opens the same Guide', false, 'Emporium never rendered');
  ok('REACH-SHOP .gw-art is a real control, so the keyboard and a screen reader get it too', false, 'Emporium never rendered');
}

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`);
await browser.close();
srv?.close();
process.exit(fails.length ? 1 : 0);

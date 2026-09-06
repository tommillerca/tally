/* crew-slime-leak-audit: the viewer's slime glow stays on the viewer, and the
 * Crew's sealed-gift card is a headline, not a list.
 *
 * WHY (Tom, 2026-09-06, on v476): "every shoe slot seems to have a green glow
 * now that im looking at my friends in crew" and "it's just a massive list of
 * gifts from my friends needs immediate fix".
 *
 * Mechanism 1: avatarLayersHtml read S.slimeSlots (the PLAYER's slimed gear
 * slots) for EVERY outfit it drew, so a viewer wearing slimed kicks lit the
 * kicks on every friend card, leaderboard head, race runner and foe. Now the
 * layer must be the player's own worn item AND the render must not be marked
 * `foreign`. Mechanism 2: #giftTopList rendered every sealed gift; now one,
 * plus "and N more waiting".
 *
 * ROWS
 *   CONTROL  the player's own Bonehead on Today shows the slime glow (else the
 *            LEAK row below measures an empty sample)
 *   SAMPLE   the Crew deck drew friend outfits, two of them in kicks
 *   LEAK     zero slimed layers inside .cfan-stage
 *   GIFT     six sealed gifts render one button and a "5 more" line
 *   REDRAW   a real .cfan-card tap re-seats the deck; redrawn stages stay unlit
 *
 * PROVEN RED on origin/main fca972e2 (v476) with this exact probe, 2026-09-06:
 *   LEAK: stageSlimed 2 of 8 friend layers (both friends in kicks lit up)
 *   GIFT: giftButtons 6, no more-line
 * Green on hotfix/v477-crew: stageSlimed 0, hero slimed 2, giftButtons 1. */
import { boot, seed, sleep } from './godmode.js';

const { browser, page } = await boot(process.argv[2] || process.env.URL);
let bad = 0;
const ok = (name, cond, note) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  | ${note}`); if (!cond) bad++; };
try {
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await seed(page, { level: 18, coins: 5000 });
  const setup = await page.evaluate(async () => {
    const db = await import('./js/db.js'); const { dateKey } = await import('./js/nutrition.js');
    await db.db.put('xp', { key: 'seed-lvl', type: 'seed', xp: 40000, date: dateKey(), note: 'test' });
    const loot = await import('./js/loot.js'); const { GEAR_ITEMS } = await import('./js/gear.js');
    const pick = GEAR_ITEMS.find(g => g.slot === 'FW');
    await loot.grantGear(pick.id, 'test', { slimed: true });
    await loot.equipGear('FW', pick.id);
    await db.kvSet('giftbox', Array.from({ length: 6 }, (_, i) => ({ key: `g${i}`, ts: Date.now() - i * 1000, payload: { note: `Pal ${i} sent you a gift`, coins: 50 } })));
    await db.kvSet('glow', true);
    const { BH_ITEMS } = await import('./data/boneheadz.js');
    return { gear: pick.id, fw: BH_ITEMS.filter(i => i.slot === 'FW' && !i.default).slice(0, 2).map(i => i.id) };
  });
  // a real boot, so refreshSlimedSlots runs the way a session does
  await page.evaluate(() => location.reload()); await sleep(2500);
  await page.evaluate((fw) => {
    window.__testMe = { name: 'Me', handle: 'me', friendCode: 'BONE-0000' };
    const mk = (i, FW) => ({ playerId: `p${i}`, name: `Pal ${i}`, alias: null, lastSeen: Date.now(),
      profile: { level: 20, levelName: 'Bonehead', badges: 2, gearCount: 4, outfit: { B: 'B0-1', SK: 'SK0-1', ...(FW ? { FW } : {}) }, pet: null } });
    window.__testFriends = { friends: [mk(1, fw[0]), mk(2, fw[1]), mk(3, null)], incoming: [], outgoing: [] };
    location.hash = '#/today';
  }, setup.fw);
  await sleep(1500);
  const hero = await page.evaluate(() => document.querySelectorAll('#screen .bh-anim img.bh-slimed, #screen .bh-stage img.bh-slimed').length);
  ok('CONTROL the player\'s own Bonehead shows the slime glow on Today', hero >= 1, `${hero} slimed layer(s) on the hero, wearing ${setup.gear}`);
  await page.evaluate(() => { location.hash = '#/friends'; }); await sleep(3000);
  const crew = await page.evaluate(() => ({
    stages: document.querySelectorAll('.cfan-stage').length,
    imgs: document.querySelectorAll('.cfan-stage img').length,
    fw: [...document.querySelectorAll('.cfan-stage img')].filter(i => /\/FW/.test(i.getAttribute('src') || '')).length,
    slimed: document.querySelectorAll('.cfan-stage img.bh-slimed').length,
    giftButtons: document.querySelectorAll('#giftTopList .gift-sealed').length,
    more: (document.querySelector('#giftTopList .gift-more') || {}).textContent || '',
  }));
  ok('SAMPLE the Crew deck drew friend outfits with kicks on them', crew.stages >= 3 && crew.fw >= 2, `${crew.stages} stages, ${crew.imgs} layers, ${crew.fw} kicks`);
  ok('LEAK no friend layer carries the viewer\'s slime glow', crew.slimed === 0, `${crew.slimed} slimed of ${crew.imgs} friend layers`);
  ok('GIFT six sealed gifts render as one button and a count', crew.giftButtons === 1 && /5 more/.test(crew.more), `${crew.giftButtons} button(s), "${crew.more}"`);
  /* A REAL TAP, not a seam: tapping a side card centres it, and applyFan
     re-seats the deck and redraws each stage through crewCardArtHtml, which is
     the render path the leak lived in. The fixture only fills the deck; the
     control a player touches is what drives the redraw this row reads. */
  const redraw = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll('.cfan-card')];
    const side = cards.find(c => !c.classList.contains('is-front') && !c.classList.contains('front')) || cards[1] || cards[0];
    if (!side) return { tapped: false };
    side.click();
    await new Promise(r => setTimeout(r, 1200));
    return { tapped: true, imgs: document.querySelectorAll('.cfan-stage img').length, slimed: document.querySelectorAll('.cfan-stage img.bh-slimed').length };
  });
  ok('REDRAW a real tap re-seats the deck and the redrawn friends still carry no glow', redraw.tapped && redraw.imgs > 0 && redraw.slimed === 0, `tapped=${redraw.tapped}, ${redraw.slimed} slimed of ${redraw.imgs} layers after the tap`);
} catch (e) { console.log('FAIL  the suite itself died: ' + (e && e.message)); bad++; }
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nCREW SLIME LEAK: the glow stays on the viewer, the gift card is a headline');
process.exit(bad ? 1 : 0);

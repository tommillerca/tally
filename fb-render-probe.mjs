/* Scratch probe, 2026-09-04: does a football item actually PAINT the team colours
   on the real doll? Not a gate audit; the render proof Tom's verification
   contract demands before any football screenshot is shown. Measures pixels off
   the rendered stage, never off the source PNGs. */
import { boot, sleep, serveTree, setWidth, seed } from './tests/godmode.js';
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
await setWidth(page, 390, 844);
await seed(page, { dust: 500, coins: 9000, reload: false });
const out = await page.evaluate(async () => {
  const loot = await import(new URL('js/loot.js', location.href).href);
  const fb = await import(new URL('data/football-teams.js', location.href).href);
  const team = fb.FOOTBALL_TEAMS[0];
  const helmet = fb.footballItemId(team.id, 'helmet');
  const jersey = fb.footballItemId(team.id, 'jersey');
  const bh = await import(new URL('data/boneheadz.js', location.href).href);
  const resolves = { helmet: !!bh.BH_BY_ID[helmet], jersey: !!bh.BH_BY_ID[jersey] };
  await loot.grantCosmetic(helmet, 'fb-probe');
  await loot.grantCosmetic(jersey, 'fb-probe');
  await loot.equip('H', helmet);
  await loot.equip('T', jersey);
  location.hash = '#/bonehead';
  return { team: { name: team.name, a: team.a, b: team.b }, helmet, jersey, resolves,
           owned: [...(await loot.collectedLooks())].filter(x => x.startsWith('fb-')).length };
});
await sleep(2600);
const dom = await page.evaluate(() => {
  const stage = document.querySelector('.bh-stage') || document.querySelector('.hero-scene');
  const tints = [...document.querySelectorAll('.fb-tint')].map(t => {
    const cs = getComputedStyle(t), r = t.getBoundingClientRect();
    return { bg: cs.backgroundColor, blend: cs.mixBlendMode, mask: (cs.maskImage || cs.webkitMaskImage || '').slice(0, 90),
             w: Math.round(r.width), h: Math.round(r.height), vis: cs.visibility, op: cs.opacity };
  });
  const imgs = [...(stage ? stage.querySelectorAll('img') : [])].map(i => ({ src: i.src.split('/').slice(-2).join('/'), w: i.naturalWidth, dec: i.complete }));
  const r = stage ? stage.getBoundingClientRect() : null;
  return { tints, imgs, stage: r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null };
});
console.log('SETUP', JSON.stringify(out));
console.log('TINTS', dom.tints.length, JSON.stringify(dom.tints.slice(0, 4)));
console.log('STAGE', JSON.stringify(dom.stage));
// A CONTROL: the same doll with the football pieces off. If the "after" pixels
// match the "before" pixels the tint proved nothing (an absence needs a control).
await page.evaluate(async () => { const loot = await import(new URL('js/loot.js', location.href).href); await loot.equip('H', null); await loot.equip('T', null); location.hash = '#/today'; });
await sleep(700);
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(2200);
const bare = await page.evaluate(() => { const s = document.querySelector('.bh-stage') || document.querySelector('.hero-scene'); const r = s.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; });
await page.screenshot({ path: '/tmp/fb-doll-bare.png', clip: { ...bare, scale: 2 } });
console.log('SHOT control /tmp/fb-doll-bare.png', JSON.stringify(bare));
if (dom.stage) { await page.screenshot({ path: '/tmp/fb-doll.png', clip: { ...dom.stage, scale: 2 } }); console.log('SHOT /tmp/fb-doll.png'); }
await browser.close(); await srv.close?.();

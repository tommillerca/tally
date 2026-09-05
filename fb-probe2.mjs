import { boot, sleep, serveTree, setWidth, seed } from './tests/godmode.js';
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
await setWidth(page, 390, 844);
await seed(page, { dust: 500, coins: 9000, reload: false });
const setup = await page.evaluate(async () => {
  const loot = await import(new URL('js/loot.js', location.href).href);
  const fb = await import(new URL('data/football-teams.js', location.href).href);
  const bh = await import(new URL('data/boneheadz.js', location.href).href);
  const t = fb.FOOTBALL_TEAMS[0];
  const ids = { helmet: fb.footballItemId(t.id, 'helmet'), jersey: fb.footballItemId(t.id, 'jersey'), visor: fb.footballItemId(t.id, 'visor60') };
  const meta = Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, bh.BH_BY_ID[id] ? { slot: bh.BH_BY_ID[id].slot, art: bh.BH_BY_ID[id].art || bh.BH_BY_ID[id].file || null, unreleased: !!bh.BH_BY_ID[id].unreleased } : 'UNRESOLVED']));
  for (const id of Object.values(ids)) await loot.grantCosmetic(id, 'probe');
  await loot.equip('H', ids.helmet); await loot.equip('T', ids.jersey);
  const eq = await loot.equipped();
  location.hash = '#/bonehead';
  return { ids, meta, eqH: eq.H, eqT: eq.T };
});
await sleep(2600);
const dom = await page.evaluate(() => {
  const stage = document.querySelector('.bh-stage');
  const kids = [...stage.children].map(el => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const o = { tag: el.tagName.toLowerCase(), cls: el.className, x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    if (el.tagName === 'IMG') { o.src = el.src.split('/').slice(-2).join('/'); o.nat = el.naturalWidth; o.fit = cs.objectFit; }
    else { o.bg = cs.backgroundColor; o.maskSize = cs.maskSize || cs.webkitMaskSize; o.maskPos = cs.maskPosition || cs.webkitMaskPosition; o.mask = (cs.maskImage || cs.webkitMaskImage || '').split('/').slice(-1)[0]; o.blend = cs.mixBlendMode; }
    return o;
  });
  const anim = stage.querySelector('.bh-anim');
  return { stageCls: stage.className, kids, avFit: anim ? getComputedStyle(anim).getPropertyValue('--av-fit') : 'no .bh-anim', avPos: anim ? getComputedStyle(anim).getPropertyValue('--av-pos') : '' };
});
console.log('SETUP', JSON.stringify(setup));
console.log('AV', JSON.stringify({ stageCls: dom.stageCls, avFit: dom.avFit, avPos: dom.avPos }));
for (const k of dom.kids) console.log('  ', JSON.stringify(k));
await browser.close(); await srv.close?.();

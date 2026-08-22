/* throwaway: measure co-visibility of Bumbleseal + her wardrobe strip */
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { boot, seed, sleep, settle, setWidth, serveTree } from './tests/godmode.js';
import { PET_SHOP, PET_CROP } from './data/boneheadz.js';

const ROOT = process.cwd();
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const srv = await serveTree(ROOT);
const { browser, page } = await boot(srv.url);

const openStable = async () => {
  await page.evaluate(() => { location.hash = '#/pets'; });
  await sleep(900);
  await page.evaluate(() => document.getElementById('stableBtn')?.click());
  await sleep(1800);
};

const measure = (crop) => page.evaluate(c => {
  const sheet = document.querySelector('.sheet');
  const body = document.querySelector('#stableBody');
  const img = document.querySelector('.cf-card.active .cf-art .petcrop img');
  const items = [...document.querySelectorAll('.pw-item')];
  const wear = document.querySelector('.pet-wear');
  const r = e => { const b = e.getBoundingClientRect(); return { x: +b.left.toFixed(1), y: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), b: +b.bottom.toFixed(1) }; };
  const ir = img && img.getBoundingClientRect();
  const ink = ir ? {
    x: +(ir.left + c.x0 * ir.width).toFixed(1),
    y: +(ir.top + c.y0 * ir.height).toFixed(1),
    w: +((c.x1 - c.x0) * ir.width).toFixed(1),
    h: +((c.y1 - c.y0) * ir.height).toFixed(1),
  } : null;
  if (ink) ink.b = +(ink.y + ink.h).toFixed(1);
  const sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
  const vis = { top: Math.max(0, sat), bottom: window.innerHeight };
  const inside = b => b && b.y >= vis.top - 0.5 && b.b <= vis.bottom + 0.5;
  return {
    innerHeight: window.innerHeight, sat, scrollTop: body ? body.scrollTop : null,
    sheet: sheet ? r(sheet) : null,
    wearHidden: wear ? wear.hasAttribute('hidden') : 'no panel',
    ink, inkVisible: inside(ink),
    items: items.map(e => ({ id: e.dataset.petwear, ...r(e), full: inside(r(e)) })),
  };
}, crop);

try {
  await seed(page, { level: 20, coins: 400000 });
  await page.evaluate(async ids => {
    const loot = await import('/js/loot.js');
    for (const id of ids) await loot.buyPetItem(id);
  }, [PET_SHOP.pet.id, ...PET_SHOP.items.map(i => i.id)]);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);

  for (const [w, h] of [[393, 852], [320, 568]]) {
    for (const sat of [0, 59]) {
      await setWidth(page, w, h);
      await page.evaluate(s => {
        document.querySelectorAll('style[data-sat]').forEach(n => n.remove());
        if (s) { const st = document.createElement('style'); st.dataset.sat = '1'; st.textContent = `:root{--sat:${s}px !important}`; document.head.appendChild(st); }
      }, sat);
      await sleep(300);
      await openStable();
      const m = await measure(PET_CROP[PET_SHOP.pet.id]);
      console.log(`\n=== ${w}x${h} sat=${sat} ===`);
      console.log(JSON.stringify(m, null, 1));
      await settle(page);
      const f = path.join(OUT, `${w}x${h}-sat${sat}.png`);
      await page.screenshot({ path: f });
      console.log('shot:', f);
      await page.evaluate(() => document.querySelector('.sheet-close')?.click());
      await sleep(600);
    }
  }
} finally { await browser.close(); await srv.close(); }

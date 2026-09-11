import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, setWidth, unproven } from './godmode.js';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = process.argv[2] || process.env.URL;
let server;
let browser, failures = 0;
const check = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  if (!pass) failures++;
};

/* THE PET MUST NOT MOVE. Measured on LIVE v578 (the shipped build) on
   2026-09-11 with this audit's own compositor, every look and viewport:
   the pet's ink bottom depends only on species and viewport, never on the
   character's footwear, which is what you would expect from a figure anchored
   by its own right edge and bottom.
     C1  375x812 522   430x932 553
     C6  375x812 532   430x932 564
   A grounding change to the Bonehead must leave these untouched. Tom,
   2026-09-11: "make sure you dont fuck up the pet's position." */
const SHIPPED_PET_BOTTOM = { '375x812': { C1: 522, C6: 532 }, '430x932': { C1: 553, C6: 564 } };

try {
  server = target ? null : await serveTree(root);
  const session = await boot(target || server.url);
  browser = session.browser;
  const page = session.page;
  await seed(page, { level: 24, coins: 60000 });
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1000);
  await page.addStyleTag({ content: `
    .hero-char, .hero-companion, .hero-char *, .hero-companion * {
      filter: none !important; animation: none !important;
    }
    .hero-char, .hero-companion { transform: translateX(var(--bh-shift, 0px)) !important; }
  ` });
  const measure = async () => page.evaluate(async () => {
const inkBox = async root => {
  const imgs = [...root.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth);
  if (!imgs.length) return null;
  const c = document.createElement('canvas');
  // Overscan retains off-viewport ink so IN-FRAME cannot pass by clipping it.
  const margin = 512;
  c.width = innerWidth + margin * 2; c.height = innerHeight + margin * 2;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.translate(margin, margin);
  let drawn = 0;
  for (const im of imgs) {
    const b = im.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    const cs = getComputedStyle(im);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0 || !im.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})) continue;
    const nw = im.naturalWidth, nh = im.naturalHeight;
    let dw = b.width, dh = b.height, dx = b.x, dy = b.y;
    if (cs.objectFit === 'contain') {
      const s = Math.min(b.width / nw, b.height / nh);
      dw = nw * s; dh = nh * s;
      const pos = cs.objectPosition.split(' ');
      const px = pos[0] === '50%' || pos[0] === 'center' ? .5 : pos[0] === '100%' || pos[0] === 'right' ? 1 : 0;
      const py = pos[1] === '100%' || pos[1] === 'bottom' ? 1 : pos[1] === '50%' || pos[1] === 'center' ? .5 : 0;
      dx = b.x + (b.width - dw) * px; dy = b.y + (b.height - dh) * py;
    }
    g.drawImage(im, dx, dy, dw, dh); drawn++;
  }
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++)
    if (d[(y * c.width + x) * 4 + 3] > 24) { n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return n ? { n, drawn, left: minX-margin, right: maxX-margin, top: minY-margin, bottom: maxY-margin, cx: (minX + maxX) / 2-margin } : null;
};

    const stage = document.querySelector('#bhStage');
    const char = stage.querySelector('.hero-char'), pet = stage.querySelector('.hero-companion');
    const cast = stage.querySelector('.c-bh');
    const rect = stage.getBoundingClientRect(), shadow = cast?.getBoundingClientRect();
    const c = await inkBox(char), p = await inkBox(pet);
    return { c, p, shadow: shadow && { x: shadow.x + shadow.width / 2, y: shadow.y + shadow.height / 2 },
      scene: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      images: [char, pet].map(el => [...el.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth).length),
      padding: c && char.getBoundingClientRect().bottom - c.bottom,
      sharing: stage.classList.contains('sharing') };
  });
  for (const [width, height] of [[375,812], [430,932]]) {
    await setWidth(page, width, height);
    for (const petId of ['C1', 'C6']) for (const footwear of [null, 'FW1', 'FW3', 'FW7-1']) {
      await page.evaluate(async ({ petId, footwear }) => {
        const loot = await import('./js/loot.js');
        const { BH_SLOTS } = await import('./data/boneheadz.js');
        for (const slot of BH_SLOTS) if (slot.code !== 'C') await loot.equip(slot.code, null);
        if (footwear) { await loot.grantCosmetic(footwear); await loot.equip('FW', footwear); }
        const pet = await loot.addPetInstance(petId);
        await loot.setEquippedPet(pet.iid);
        location.hash = '#/bonehead';
      }, { petId, footwear });
      await sleep(250);
      await page.evaluate(() => { location.hash = '#/today'; });
      await page.waitForSelector('#bhStage .hero-companion img');
      await page.evaluate(async () => {
        await Promise.all([...document.querySelectorAll('#bhStage img')].map(i => i.decode().catch(() => {})));
      });
      await sleep(350);
      const m = await measure();
      const label = `${width}x${height} ${petId} ${footwear || 'bare'}`;
      console.log(`LOOK ${label} padding=${m.padding?.toFixed(2)} sharing=${m.sharing}`);
      check('CONTROL', m.c?.drawn > 0 && m.p?.drawn > 0 && m.c?.n > 0 && m.p?.n > 0 && !!m.shadow,
        `${label} composited=${m.c?.drawn},${m.p?.drawn} pixels=${m.c?.n},${m.p?.n}`);
      if (!m.c || !m.p || !m.shadow) continue;
      check('GROUNDED', Math.abs(m.shadow.y-m.c.bottom)<=3, `${label} shadow=${m.shadow.y.toFixed(2)} sole=${m.c.bottom} delta=${(m.shadow.y-m.c.bottom).toFixed(2)}`);
      check('CENTRED', Math.abs(m.shadow.x-m.c.cx)<=4, `${label} shadow=${m.shadow.x.toFixed(2)} ink=${m.c.cx}`);
      /* PET-PLANE asks whether this change MOVED the pet, not whether the pet
         shares the character's sole line. The first version of this row
         asserted a shared plane and went red on 10 of 24 cases, on live v578
         as well as on the fix, because the default pet is a RAIN CLOUD: it is
         drawn floating, with Cam's own shadow below it, and a flying pet
         sitting on the ground line would be the bug. Measured on live v578 and
         on this build, the pet's ink bottom is identical (522 at 375x812 with
         C1 FW1), which is the actual requirement: Tom, 2026-09-11, "make sure
         you dont fuck up the pet's position."
         BASELINE is the pet's ink bottom on the shipped build for this same
         look and viewport, captured in the same run against the live URL, so
         the row compares like with like rather than pinning a constant. */
      const baselinePet = SHIPPED_PET_BOTTOM[`${width}x${height}`]?.[petId];
      if (baselinePet == null) unproven('PET-UNMOVED', `no shipped baseline recorded for ${label}`);
      else check('PET-UNMOVED', Math.abs(m.p.bottom - baselinePet) <= 2,
        `${label} pet=${m.p.bottom} shipped=${baselinePet} (character sole=${m.c.bottom}; a floating pet is not required to share it)`);
      check('IN-FRAME', [m.c,m.p].every(b=>b.left>=m.scene.left && b.right<m.scene.right && b.top>=m.scene.top && b.bottom<m.scene.bottom), `${label} ink=${JSON.stringify([m.c,m.p])} scene=${JSON.stringify(m.scene)}`);
      // Counterfactual uses the inherited build's exact transforms, including
      // sharing. Never derives expected displacement from the new CSS variable.
      await page.evaluate(() => {
        const s = document.querySelector('#bhStage');
        s.querySelector('.hero-char').style.setProperty('--bh-shift', s.classList.contains('sharing') ? 'calc(var(--fig) * -0.0662)' : '0px');
        s.querySelector('.hero-companion').style.setProperty('--bh-shift', '0px');
      });
      const before = await measure();
      await page.evaluate(() => document.querySelectorAll('#bhStage > .hero-char, #bhStage > .hero-companion').forEach(el=>el.style.removeProperty('--bh-shift')));
      const dx = before.c.cx-m.c.cx, px = before.p.cx-m.p.cx;
      const gap = (before.p.left-before.c.right)-(m.p.left-m.c.right);
      // 5% is 18.75 at 375 and 21.5 at 430, so 18..20 cannot apply to both.
      check('SHIFT', Math.abs(dx-width*.05)<=1 && Math.abs(px-width*.05)<=1 && Math.abs(gap)<=2,
        `${label} character=${dx} pet=${px} expected=${width*.05} gapDelta=${gap}`);
    }
  }
} catch (error) { failures++; console.error('BLOCKED', error.stack); }
finally { await browser?.close(); server?.close(); }
console.log(`RESULT ${failures} failures`);
process.exitCode = failures ? 1 : 0;

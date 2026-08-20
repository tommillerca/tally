const W = setTimeout(() => { console.log('WATCHDOG'); process.exit(3); }, 120_000); W.unref?.();
import { boot, sleep, serveTree } from './tests/godmode.js';
import path from 'node:path';
let browser, srv;
try {
  srv = await serveTree(path.resolve('.'));
  const b = await boot(srv.url); browser = b.browser; const page = b.page;
  await sleep(1200);
  await page.setViewport({ width: 440, height: 956, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluate(() => { location.hash = '#/bonehead'; }); await sleep(900);
  await page.evaluate(() => document.querySelector('[data-tab="shop"]')?.click()); await sleep(1500);

  const t0 = Date.now();
  await page.evaluate(() => document.querySelector('[data-tryon]:not([data-tryon="AURA"])')?.click());
  // how long until the figure is actually on screen
  await page.waitForFunction(() => !!document.querySelector('.sheet .bh-anim, .sheet .bh-stage'), { timeout: 8000 }).catch(()=>{});
  const tapToVisible = Date.now() - t0;
  await sleep(1600);

  const m = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const sheet = q('.sheet');
    const rect = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const cs = e => e ? getComputedStyle(e) : null;
    // every layer drawn on the figure: which one is the product?
    const layers = [...(sheet?.querySelectorAll('.bh-anim img, .bh-stage img') || [])].map(i => ({
      src: (i.getAttribute('src') || '').split('/').pop(),
      z: getComputedStyle(i).zIndex,
      filter: getComputedStyle(i).filter,
      outline: getComputedStyle(i).outline,
      op: getComputedStyle(i).opacity,
      r: rect(i),
    }));
    // buttons and their sizes
    const btns = [...(sheet?.querySelectorAll('button, [role=button], .t3-price') || [])].map(b => ({
      t: (b.textContent || '').replace(/\s+/g,' ').trim().slice(0, 24), r: rect(b),
    }));
    const short = [...(sheet?.querySelectorAll('*') || [])].filter(e => e.children.length===0 && /short/i.test(e.textContent||''))[0];
    const badge = [...(sheet?.querySelectorAll('*') || [])].filter(e => e.children.length===0 && /NOT YOURS/i.test(e.textContent||''))[0];
    const toast = q('#toast, .toast');
    const nameEl = [...(sheet?.querySelectorAll('*') || [])].filter(e => e.children.length===0 && /Blowfish|Puffer|Aura|Runners|Trunks|Tee|Band|Flail|Bones|Whites|Socks/i.test(e.textContent||''))[0];
    const covers = (a, b) => { if(!a||!b) return false; const A=a.getBoundingClientRect(),B=b.getBoundingClientRect(); return !(A.right<B.left||A.left>B.right||A.bottom<B.top||A.top>B.bottom); };
    return {
      sheetH: rect(sheet)?.h, viewportH: innerHeight,
      layers, layerCount: layers.length,
      distinctFilters: [...new Set(layers.map(l => l.filter))],
      btns,
      shortText: short?.textContent.trim().slice(0,70) || null,
      shortColor: cs(short)?.color, shortSize: cs(short)?.fontSize,
      badgeText: badge?.textContent.trim() || null, badgeRect: rect(badge),
      nameText: nameEl?.textContent.trim() || null, nameRect: rect(nameEl),
      toastPresent: !!toast, toastRect: rect(toast),
      toastCoversName: covers(toast, nameEl), toastCoversBadge: covers(toast, badge),
    };
  });
  console.log('TAP_TO_FIGURE_MS', tapToVisible);
  console.log(JSON.stringify(m, null, 1));
} catch (e) { console.log('ERROR:', e.message); }
finally { try { await browser?.close(); } catch {} try { await srv?.stop?.(); } catch {} clearTimeout(W); process.exit(0); }

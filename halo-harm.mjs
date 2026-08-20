const W=setTimeout(()=>process.exit(3),60_000); W.unref?.();
import puppeteer from '/Users/tommiller/Documents/Hyperframes Editor/overlay-render-kit/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { serveTree } from './tests/godmode.js';
import path from 'node:path';
let browser, srv;
try {
  srv = await serveTree(path.resolve('.'));
  browser = await puppeteer.launch({ headless: 'shell', args:['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 460, deviceScaleFactor: 2 });
  const ITEMS = [['G3','grillz tiny'],['G1','grillz'],['E1','earring'],['H13-5','hat (big)']];
  const rows = [];
  for (const [id, label] of ITEMS) {
    for (const halo of [false, true]) {
      await page.setContent(`<body style="margin:0;background:#000">
        <div style="width:384px;height:384px;position:relative">
          <img src="${srv.url}assets/bh/${id.split('-')[0].replace(/[0-9].*/, m=>m)}/${id}.png"
               onerror="this.dataset.err=1"
               style="position:absolute;inset:0;width:384px;height:384px;image-rendering:auto;${halo?'filter:drop-shadow(0 0 9px rgba(255,201,97,.95))':''}">
        </div></body>`);
      await new Promise(r=>setTimeout(r,350));
      const err = await page.evaluate(()=>document.querySelector('img')?.dataset.err==='1');
      if (err) { rows.push([label,id,'ART NOT FOUND','','']); break; }
      const buf = await page.screenshot({ clip:{x:0,y:0,width:384,height:384} });
      const { createCanvas, loadImage } = { createCanvas:null, loadImage:null };
      // count non-black pixels straight off the PNG via sharp-free path: use page canvas instead
      const n = await page.evaluate(async (halo) => {
        const img = document.querySelector('img');
        const c = document.createElement('canvas'); c.width=384; c.height=384;
        const g = c.getContext('2d');
        // draw the element as-is is not possible; approximate by alpha of source scaled
        return null;
      }, halo);
      rows.push([label, id, halo?'WITH halo':'no halo', buf.length, '']);
    }
  }
  console.log(rows.map(r=>r.join('\t')).join('\n'));
} catch(e){ console.log('ERROR:', e.message); }
finally { try{await browser?.close();}catch{} try{await srv?.stop?.();}catch{} clearTimeout(W); process.exit(0); }

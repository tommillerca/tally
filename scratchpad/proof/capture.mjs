/* Scratch proof script for Tom's football-kit shots. NOT a test, no exit-code
 * grading contract: it captures real DOM screenshots and measures pixels on
 * them, then prints a report. Reuses the existing harness (tests/godmode.js)
 * rather than re-inventing boot/seed/serve. Run with:
 *   HEADLESS_MODE=shell node scratchpad/proof/capture.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { boot, seed, settle, setWidth, serveTree, sleep } from '../../tests/godmode.js';
import { FOOTBALL_TEAMS, footballItemId } from '../../data/football-teams.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = HERE;
const PYTOOL = path.join(HERE, 'imgtool.py');

let fails = 0;
const fail = msg => { console.error(`MISSING/FAIL: ${msg}`); fails++; };
const shots = [];

const pngSize = p => {
  const buf = fs.readFileSync(p);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
};
const measurePx = (imgPath, x, y, w, h, thresh = 60) =>
  JSON.parse(execFileSync('python3', [PYTOOL, 'measure', imgPath, String(Math.round(x)), String(Math.round(y)), String(Math.round(w)), String(Math.round(h)), String(thresh)], { encoding: 'utf8' }));

const TEAM_A = FOOTBALL_TEAMS[0].id;        // boneyard-bruisers: navy/gold
const TEAM_B = 'windrow-wasps';             // yellow/near-black: far from A in hue
const TEAM_LOCKED = 'glasswater-gannets';   // not granted, drives the Locked bar

async function main() {
  const srv = await serveTree(ROOT);
  const { browser, page } = await boot(srv.url);
  page.on('pageerror', e => console.error('PAGEERROR', e.message));

  try {
    await seed(page, { level: 20, coins: 400000 });
    await setWidth(page, 430, 932); // dsf2 baseline for shots 1-3

    const clean = () => page.evaluate(() => { document.querySelectorAll('#toast, .toast').forEach(n => n.remove()); });
    const freeze = () => page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });

    const rectOf = sel => page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el || !document.contains(el)) return null;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return null;
      return { x: r.x, y: r.y, width: r.width, height: r.height,
        onscreen: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth };
    }, sel);

    // Element shot: scrolls into view, freezes+cleans first, records the rect.
    const shootEl = async (sel, file, label) => {
      await clean(); await freeze(); await settle(page);
      const r = await rectOf(sel);
      if (!r) { fail(`${label}: selector not found / zero-rect: ${sel}`); return null; }
      const h = await page.$(sel);
      await h.evaluate(n => n.scrollIntoView({ block: 'center' }));
      await settle(page);
      const r2 = await rectOf(sel);
      console.log(`RECT ${label} ${sel} -> ${JSON.stringify(r2)}`);
      const fp = path.join(OUT, file);
      await h.screenshot({ path: fp });
      const sz = pngSize(fp);
      shots.push({ label, file: fp, ...sz });
      console.log(`WROTE ${label} -> ${fp} (${sz.w}x${sz.h})`);
      return fp;
    };

    const shootClip = async (rect, file, label) => {
      await clean(); await freeze(); await settle(page);
      const fp = path.join(OUT, file);
      await page.screenshot({ path: fp, clip: rect });
      const sz = pngSize(fp);
      shots.push({ label, file: fp, ...sz });
      console.log(`WROTE ${label} -> ${fp} (${sz.w}x${sz.h})`);
      return fp;
    };

    const setFbTeam = async teamId => {
      const ok = await page.evaluate(t => {
        const el = document.querySelector('#fbTeam');
        if (!el) return false;
        el.value = t;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, teamId);
      if (!ok) fail('#fbTeam select not found (setFbTeam)');
      await sleep(1500);
      await settle(page);
    };

    const gotoHash = async h => {
      const cur = await page.evaluate(() => location.hash);
      if (cur === h) { await page.evaluate(() => { location.hash = '#/today'; }); await sleep(400); }
      await page.evaluate(hh => { location.hash = hh; }, h);
      await sleep(h === '#/shop' ? 3200 : 2600);
      await settle(page);
      await clean();
    };

    const grantEquip = (slot, id) => page.evaluate(async ([s, i]) => {
      const loot = await import('/js/loot.js');
      await loot.grantCosmetic(i, 'football');
      await loot.equip(s, i);
    }, [slot, id]);

    // ============================== SHOT 1 ==============================
    await gotoHash('#/shop');
    for (const team of [TEAM_A, TEAM_B]) {
      if (team === TEAM_B) await setFbTeam(TEAM_B);
      const bannerSel = '#fbSect > summary.t3-drop.fb-drop';
      const r = await rectOf(bannerSel);
      if (!r) { fail(`banner-closed-${team}: selector missing: ${bannerSel}`); continue; }
      console.log(`RECT banner-closed-${team} ${JSON.stringify(r)}`);
      const pad = 40;
      await shootClip({ x: Math.max(0, r.x), y: Math.max(0, r.y - pad), width: r.width, height: r.height + pad * 2 },
        `banner-closed-${team}.png`, `banner-closed-${team}`);
    }

    // ============================== SHOT 2 ==============================
    await setFbTeam(TEAM_A);
    const summary1 = await page.$('#fbSect > summary.t3-drop.fb-drop');
    if (!summary1) fail('banner-open: summary selector missing');
    else {
      await summary1.click();
      await sleep(600);
      await shootEl('#fbSect', 'banner-open.png', 'banner-open');
    }

    // ============================== SHOT 3 ==============================
    const helmetId = footballItemId(TEAM_A, 'helmet');
    await grantEquip('H', helmetId);
    await gotoHash('#/bonehead');
    const slid = await page.evaluate(t => {
      const rail = document.querySelector('.fb-rail');
      if (!rail) return false;
      const cell = [...rail.querySelectorAll('[data-fbteam]')].find(c => c.dataset.fbteam === t);
      if (!cell) return false;
      const cr = cell.getBoundingClientRect(), rr = rail.getBoundingClientRect();
      rail.scrollLeft = rail.scrollLeft + (cr.left - rr.left) - (rail.clientWidth - cr.width) / 2;
      return true;
    }, TEAM_LOCKED);
    if (!slid) fail('wardrobe-rail: .fb-rail (or its locked-team tile) not found');
    else {
      await page.evaluate(async () => {
        const rail = document.querySelector('.fb-rail');
        let last = NaN, same = 0;
        for (let i = 0; i < 90 && same < 3; i++) {
          await new Promise(r => requestAnimationFrame(r));
          if (rail.scrollLeft === last) same++; else { same = 0; last = rail.scrollLeft; }
        }
      });
      await settle(page);
      const barText = (await page.evaluate(() => document.querySelector('.fb-bar')?.textContent || '')).replace(/\s+/g, ' ').trim();
      const lockedTiles = await page.evaluate(() => [...document.querySelectorAll('.fb-rail .pw-item.locked small')].map(n => n.textContent.trim()));
      console.log(`fb-bar text: "${barText}"`);
      console.log(`locked tile tags (first 6): ${JSON.stringify(lockedTiles.slice(0, 6))}`);
      await shootEl('.fb-rail-wrap', 'wardrobe-rail.png', 'wardrobe-rail');
    }

    // ============================== SHOT 4 ==============================
    const jerseyId = footballItemId(TEAM_A, 'jersey');
    const cleatsId = footballItemId(TEAM_A, 'cleats');
    await grantEquip('T', jerseyId);
    await grantEquip('FW', cleatsId);
    await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await gotoHash('#/bonehead');

    const stageFile = await shootEl('.bh-stage.lg', 'stage-full.png', 'stage-full (support, dsf3)');
    let layerTable = null, cleatsMeasure = null;
    if (stageFile) {
      layerTable = await page.evaluate(() => [...document.querySelectorAll('.bh-stage.lg img, .bh-stage.lg .fb-tint')].map(n => ({
        cls: n.className, src: n.getAttribute('src') || n.style.getPropertyValue('--fbm'),
        z: getComputedStyle(n).zIndex, op: getComputedStyle(n).opacity, blend: getComputedStyle(n).mixBlendMode,
      })));
      console.log('LAYER ORDER (.bh-stage.lg, paint order = DOM order):');
      layerTable.forEach((l, i) => console.log(`  ${i}: ${JSON.stringify(l)}`));

      // ISOLATE THE CLEATS' OWN FOOTPRINT, DON'T GUESS IT. Every garment <img>
      // here is a full-canvas transparent PNG (object-fit covers the whole
      // stage; only the layer's own alpha shows), so getBoundingClientRect()
      // on the FW <img> returns the STAGE's box, not the boot's, and the scene
      // also carries a backdrop, jersey and helmet with their own dark pixels
      // (visor glass, facemask, hair). Unequip FW, shoot the identical view,
      // and diff: the pixels that changed are exactly the cleats' own ink,
      // nothing else on the stage moved.
      await page.evaluate(async () => { const loot = await import('/js/loot.js'); await loot.equip('FW', null); });
      await gotoHash('#/bonehead');
      const stageNoFwFile = await shootEl('.bh-stage.lg', 'stage-no-cleats.png', 'stage-no-cleats (diagnostic, isolates the FW bbox)');
      if (!stageNoFwFile) fail('cleats bbox: could not shoot .bh-stage.lg with FW unequipped');
      else {
        const d = JSON.parse(execFileSync('python3', [PYTOOL, 'diffbbox', stageFile, stageNoFwFile, '24', '6'], { encoding: 'utf8' }));
        if (d.error) fail('cleats bbox: ' + d.error);
        else {
          console.log(`CLEATS BBOX (diff: worn vs unequipped, +6px pad): ${JSON.stringify(d.bbox)}, ${d.n} changed px`);
          cleatsMeasure = measurePx(stageFile, d.bbox[0], d.bbox[1], d.bbox[2], d.bbox[3], 60);
          console.log(`CLEATS MEASURE (main stage, isolated by diff): ${JSON.stringify(cleatsMeasure)}`);
        }
      }
      // put the cleats back on: the rail diagnostic below needs FW actually worn.
      await grantEquip('FW', cleatsId);
      await gotoHash('#/bonehead');

      const feetFile = path.join(OUT, 'cleats-zoom.png');
      const cropInfo = JSON.parse(execFileSync('python3', [PYTOOL, 'cropfeet', stageFile, feetFile, '0.65', '2'], { encoding: 'utf8' }));
      const sz = pngSize(feetFile);
      shots.push({ label: 'cleats-zoom (feet crop, 2x nearest)', file: feetFile, ...sz });
      console.log(`WROTE cleats-zoom (feet crop) -> ${feetFile} (${sz.w}x${sz.h}), cropped from ${JSON.stringify(cropInfo.crop_box)}`);
    }

    // ---- diagnostic: the FW rail's own cleats tile (Tom saw it on a rail/shop surface too) ----
    let railTileMeasure = null;
    const pd = await page.$('.pd-slot[data-pd="FW"]');
    if (!pd) fail('rail-cleats diagnostic: .pd-slot[data-pd="FW"] not found');
    else {
      await pd.click();
      await sleep(600);
      const railWrapFile = await shootEl('.fb-rail-wrap', 'rail-cleats-tile.png', 'rail-cleats-tile (diagnostic, dsf3)');
      if (railWrapFile) {
        const geo2 = await page.evaluate(() => {
          const wrap = document.querySelector('.fb-rail-wrap');
          const wr = wrap.getBoundingClientRect();
          const img = wrap.querySelector('.fbr-fig img[src*="cleats"]');
          if (!img) return null;
          const ir = img.getBoundingClientRect();
          return { sx: wr.x, sy: wr.y, ix: ir.x, iy: ir.y, iw: ir.width, ih: ir.height };
        });
        if (!geo2) fail('rail-cleats diagnostic: no cleats <img> in .fbr-fig');
        else {
          const dsf = 3;
          railTileMeasure = measurePx(railWrapFile, (geo2.ix - geo2.sx) * dsf, (geo2.iy - geo2.sy) * dsf, geo2.iw * dsf, geo2.ih * dsf, 60);
          console.log(`CLEATS MEASURE (FW rail figure): ${JSON.stringify(railTileMeasure)}`);
        }
      }
    }

    // ============================== SHOT 5 ==============================
    await gotoHash('#/shop');
    await setFbTeam(TEAM_A);
    let kitroomMeasure = null;
    const summary2 = await page.$('#fbSect > summary.t3-drop.fb-drop');
    if (!summary2) fail('kitroom-cleats-tile: summary missing');
    else {
      const isOpen = await page.evaluate(() => !!document.querySelector('#fbSect')?.open);
      if (!isOpen) { await summary2.click(); await sleep(600); }
      const tileSel = await page.evaluate(() => {
        const t = [...document.querySelectorAll('.drop-item.fb:not(.fb-bundle)')]
          .find(el => el.querySelector('b')?.textContent.trim() === 'Cleats');
        if (!t) return null;
        if (!t.id) t.id = 'proofCleatsTile';
        return '#' + t.id;
      });
      if (!tileSel) fail('kitroom-cleats-tile: no .drop-item.fb tile labelled "Cleats"');
      else {
        const tileFile = await shootEl(tileSel, 'kitroom-cleats-tile.png', 'kitroom-cleats-tile (dsf3)');
        if (tileFile) {
          const geo3 = await page.evaluate(sel => {
            const t = document.querySelector(sel);
            const tr = t.getBoundingClientRect();
            const img = t.querySelector('img[src*="cleats"]');
            if (!img) return { tr: { x: tr.x, y: tr.y, w: tr.width, h: tr.height }, found: false };
            const ir = img.getBoundingClientRect();
            return { tr: { x: tr.x, y: tr.y, w: tr.width, h: tr.height }, ir: { x: ir.x, y: ir.y, w: ir.width, h: ir.height }, found: true };
          }, tileSel);
          const dsf = 3;
          if (geo3.found) {
            kitroomMeasure = measurePx(tileFile, (geo3.ir.x - geo3.tr.x) * dsf, (geo3.ir.y - geo3.tr.y) * dsf, geo3.ir.w * dsf, geo3.ir.h * dsf, 60);
          } else {
            const dims = pngSize(tileFile);
            kitroomMeasure = measurePx(tileFile, 0, 0, dims.w, dims.h, 60);
            console.log('kitroom-cleats-tile: no <img src*="cleats"> found, measured the whole tile as a fallback');
          }
          console.log(`CLEATS MEASURE (kit room tile): ${JSON.stringify(kitroomMeasure)}`);
        }
      }
    }

    // ============================== REPORT ==============================
    console.log('\n=== SHOTS ===');
    for (const s of shots) console.log(`${s.label}: ${s.file} (${s.w}x${s.h})`);

    console.log('\n=== MEASUREMENTS ===');
    console.log(JSON.stringify({ layerTable, cleatsMeasure, railTileMeasure, kitroomMeasure }, null, 2));

  } finally {
    // ponytail: serveTree's static server is a spawned child process, not a
    // node handle boot() tracks for us (we called serveTree ourselves, not via
    // boot()'s no-base path) -- leaving it open keeps node alive forever after
    // a clean run, which is what actually happened on the first pass here.
    await browser.close().catch(() => {});
    srv.close();
  }
  console.log(fails ? `\n${fails} step(s) missing, see MISSING/FAIL above.` : '\nAll shots captured, nothing missing.');
  process.exit(fails ? 1 : 0);
}

main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(1); });

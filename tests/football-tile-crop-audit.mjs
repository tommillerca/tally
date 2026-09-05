/* HOW A FOOTBALL GARMENT IS FRAMED IN A TILE.
 *
 * Tom annotated the Kit room's helmet tile, 2026-09-04: "too zoomed in". He was
 * right and the number was 94.2%: the helmet's own silhouette filled 94.2% of
 * its square and ran off ALL FOUR edges (L83 R45 T88 B46), while the jersey and
 * the cleats beside it sat at 42.6% and 33.4% and left theirs alone. The fix is
 * one CSS declaration, .fit-fbhead in app.css, picked from a seven-scale sweep
 * of the real tile rather than by eye; it takes the helmet to 43.4% and off
 * every edge and moves NOTHING else (all four other garments re-measure to the
 * same number they had). This file re-measures it so it cannot drift back.
 *
 * THE MEASUREMENT, and the THREE ways of getting it wrong that were all tried
 * before this one, because each produced a confident number that meant nothing:
 *
 *   1. HIDE THE WHOLE MANNEQUIN AND DIFF. .bh-stage img is object-fit:cover on a
 *      full-frame canvas, so the base skeleton fills 98% of every tile: all five
 *      garments came back within 3 points of each other and the question went
 *      unanswered.
 *   2. HIDE ONLY THE GARMENT AND DIFF. Better subject, wrong instrument: a
 *      background diff measures the CONTRAST. Boneyard Bruisers' primary is
 *      #14213D, so the same helmet read 61.3% of its tile in the shop and 20.7%
 *      on the wardrobe rail, on two boxes that are provably the same geometry
 *      (.pc-worn 102.3x88 against 74.4x64, .bh-anim scaled 1.4 in both, an
 *      identical 0.714 of the canvas visible in each). A number that moves with
 *      the wallpaper is not a measurement of the art.
 *   3. ALPHA, WITH THE TILE'S CORNERS LEFT ROUNDED. .fb-worn has border-radius 9
 *      and overflow:hidden, so its four corner arcs clip to the PARENT's
 *      background, which does not swing with an injected ground and reads as
 *      "covered by the garment". It put an identical L27 R28 T27 B27 on all
 *      three garments: exactly the 2 x 18 device px of arc on a 128px edge.
 *
 *   What is left, and what runs: hide every layer that is not the garment, put a
 *   BLACK ground behind it and shoot, put a WHITE one behind it and shoot again,
 *   square the corners for the duration. Anything the garment covers is
 *   attenuated between the two and bare ground swings the full 255, which is a
 *   fact about the layer rather than about what is behind it.
 *
 *   Nothing is read from a getBoundingClientRect. A CSS box is the same 64x64
 *   whether the art inside it is framed or blown off the edges, which is exactly
 *   the defect. The tile's own rect is used only to aim the camera, and it is
 *   rejected unless it is on screen with a real size.
 *
 * WHAT "FRAMED" MEANS HERE, stated as numbers so the rows can disagree with me:
 *   INSIDE   the helmet touches none of the four tile edges. A helmet is a whole
 *            object; the jersey's sleeve and the cleats' soles DO run off theirs
 *            and that is correct, because those are crops of a body.
 *   BAND     its ink fraction sits with the two garments Tom said read correctly.
 *   CENTRED  its bounding box is centred in the tile within 5%.
 *
 * IT MEASURES THE WARDROBE'S RAIL TILES, not the Kit room's, and that is a
 * deliberate trade. FOOTBALL_KIT_LIVE is false, so the shop shelf does not exist
 * for any player or for any test that does not edit the data file. The rail's
 * tiles are the SAME construction -- .fb-worn wrapping wornArtHtml, taking its
 * frame from the same one .fit-fbhead declaration -- at 64px instead of 88, and
 * they are reachable today off a granted item. When the flag flips, point this
 * file at the shop tiles too; until then it grades the declaration that both
 * surfaces share. The Kit-room numbers in the header above were measured by hand
 * on a throwaway copy with the flag on.
 *
 * PROVE-RED is IN THE FILE. CROP-CONTROL puts .fit-head's own headwear frame
 * back on .fit-fbhead in the live DOM and requires the same three measurements
 * to report the helmet off every edge. A row that cannot fail is not a row, and
 * this one demonstrates its own failure on every run rather than in a comment.
 * Confirmed additionally on a `cp -R` throwaway, 2026-09-04:
 *   fitClass hands football head pieces back to RACK_FIT
 *     -> CROP-CLASS, CROP-INSIDE, CROP-BAND, and CROP-CONTROL with them (the
 *        control injects .fit-fbhead, which nothing wears any more)
 *   .fit-fbhead's scale raised from 1.4 to 1.8
 *     -> CROP-BAND (it still fits inside the square at 1.8; it is no longer the
 *        size of the garments beside it, which is the complaint)
 *
 * Run: node tests/football-tile-crop-audit.mjs [baseUrl] [--shots DIR]
 * HEADLESS_MODE=shell on this Mac. Self-serving: with no URL it serves this
 * checkout, so it can never grade production.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, settle, setWidth, serveTree } from './godmode.js';
import { footballItemId, FOOTBALL_GARMENT_BY_KEY } from '../data/football-teams.js';

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

const TEAM = 'boneyard-bruisers';
/* Tom, 2026-09-04, on the Kit room's helmet tile: "too zoomed in", with the
   jersey and cleats tiles beside it named as the ones that read correctly. That
   instruction is what this list encodes: the helmet is the subject and those two
   are the yardstick. The slots come from FOOTBALL_GARMENTS in
   data/football-teams.js and are re-checked against it in the SAMPLE row below,
   so a garment moved to another slot is a red row and not a silent skip. The two
   lizard pieces are absent on purpose: they go through croppedPetImg, a
   different renderer with its own measured crop, and Tom did not flag them
   (their numbers, unchanged by this work: 23.6% and 20.7% of their tiles, off no
   edge). `fit` is the frame class each garment MUST carry -- the helmet's is the
   new one added for this fix, the other two are the app's existing frames. */
const GARMENTS = [
  { key: 'helmet', slot: 'H',  fit: 'fit-fbhead' },
  { key: 'jersey', slot: 'T',  fit: 'fit-torso' },
  { key: 'cleats', slot: 'FW', fit: 'fit-feet' },
];
setup('SAMPLE the three garments this file frames are real, and two of them are the ones Tom said read correctly',
  GARMENTS.every(g => FOOTBALL_GARMENT_BY_KEY[g.key] && FOOTBALL_GARMENT_BY_KEY[g.key].slot === g.slot),
  GARMENTS.map(g => `${g.key}@${g.slot} -> .${g.fit}`).join(', '));

const argUrl = process.argv.slice(2).find(a => !a.startsWith('--') && /^https?:/.test(a));
const srv = argUrl ? null : await serveTree(ROOT);
const { browser, page } = await boot(argUrl || process.env.URL || srv.url);
const errors = [];
page.on('pageerror', e => errors.push(e.message));

/* MEASURE ONE TILE, AND THE MEASUREMENT IS AN ALPHA, NOT A BACKGROUND DIFF.
   The obvious method -- shoot the tile, hide the garment, shoot again, count
   what changed -- was tried and it MEASURES THE CONTRAST, not the garment.
   Boneyard Bruisers' primary is #14213D on a dark tile, so most of the helmet
   shell changed the picture by less than the threshold and the same helmet came
   back as 61.3% of its tile in the shop (light behind it) and 20.7% on the
   wardrobe rail (dark), while the two boxes are provably the same geometry:
   .pc-worn 102.3x88 against 74.4x64, .bh-anim scaled 1.4 in both, an identical
   0.714 of the canvas visible in each. A number that moves with the wallpaper
   is not a measurement of the art.

   So: hide every layer that is NOT the garment, put a BLACK ground behind what
   is left and shoot, put a WHITE ground behind it and shoot again. Anything the
   garment covers is attenuated between the two; bare ground swings the full
   255. That is a fact about the layer and not about what happens to be behind
   it -- the same reason tests/football-render-audit.mjs reads the helmet
   silhouette this way. */
const measure = async () => {
  const rect = await page.evaluate(() => {
    const cell = document.querySelector('.fb-rail .pw-item.on') || document.querySelector('.fb-rail .pw-item');
    if (!cell) return null;
    const box = cell.querySelector('.fb-worn');
    if (!box) return null;
    const r = box.getBoundingClientRect();
    if (!(r.width > 8 && r.height > 8)) return null;
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return null;
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
  if (!rect) return { err: 'no rail tile visible with a real art box' };
  /* Strip the tile to the garment. Returns both counts so a selector that
     matched nothing reads as the setup failure it is rather than as a clean
     silhouette. */
  const kept = await page.evaluate(() => {
    const cell = document.querySelector('.fb-rail .pw-item.on') || document.querySelector('.fb-rail .pw-item');
    const all = [...cell.querySelectorAll('.bh-anim img, .bh-backdrop')];
    const fb = all.filter(n => /\/football\//.test(n.src));
    all.filter(n => !/\/football\//.test(n.src)).forEach(n => { n.dataset.cropHid = '1'; n.style.visibility = 'hidden'; });
    return { total: all.length, garment: fb.length, tints: cell.querySelectorAll('.fb-tint').length };
  });
  if (!kept.garment) return { err: 'the tile holds no football layer to isolate' };
  if (kept.garment === kept.total) return { err: 'the tile holds ONLY football layers: the strip did nothing, so nothing below is isolated' };
  const ground = async c => {
    await page.evaluate(col => {
      let el = document.getElementById('cropGround');
      if (!el) { el = document.createElement('style'); el.id = 'cropGround'; document.head.appendChild(el); }
      /* SQUARE THE CORNERS while measuring. .fb-worn has border-radius 9 and
         overflow:hidden, so the four rounded corners clip to the PARENT's
         background, which does not swing with the ground injected here and
         therefore reads as "covered by the garment". Measured: it put an
         identical L27 R28 T27 B27 on all three garments, which is exactly the
         2 x 18 device px of corner arc on a 128px edge. Not the art. */
      el.textContent = `.fb-rail .pw-item .fb-worn { background: ${col} !important; border-radius: 0 !important; }`;
    }, c);
    await settle(page);
    return page.screenshot({ clip: rect, encoding: 'base64' });
  };
  const black = await ground('#000'), white = await ground('#fff');
  await page.evaluate(() => {
    document.getElementById('cropGround')?.remove();
    document.querySelectorAll('[data-crop-hid]').forEach(n => { n.style.visibility = ''; delete n.dataset.cropHid; });
  });
  const m = await page.evaluate(async (a, b) => {
    const load = s => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('bad shot')); i.src = 'data:image/png;base64,' + s; });
    const [A, B] = [await load(a), await load(b)];
    const w = A.naturalWidth, h = A.naturalHeight;
    const g = im => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const [dA, dB] = [g(A), g(B)];
    const mk = new Uint8Array(w * h);
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0, k = 0; i < dA.length; i += 4, k++) {
      // covered at all: the ground swing is less than the full 255
      const swing = Math.max(Math.abs(dA[i] - dB[i]), Math.abs(dA[i + 1] - dB[i + 1]), Math.abs(dA[i + 2] - dB[i + 2]));
      if (255 - swing <= 12) continue;
      mk[k] = 1; n++;
      const x = k % w, y = (k / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (!n) return { w, h, n: 0 };
    const e = { L: 0, R: 0, T: 0, B: 0 };
    for (let y = 0; y < h; y++) { if (mk[y * w]) e.L++; if (mk[y * w + w - 1]) e.R++; }
    for (let x = 0; x < w; x++) { if (mk[x]) e.T++; if (mk[(h - 1) * w + x]) e.B++; }
    return { w, h, n, ink: n / (w * h), bw: x1 - x0 + 1, bh: y1 - y0 + 1, bx: x0, by: y0,
      cx: (x0 + x1 + 1) / 2 / w, cy: (y0 + y1 + 1) / 2 / h,
      edge: { L: e.L / h, R: e.R / h, T: e.T / w, B: e.B / w } };
  }, black, white);
  return { rect, kept, ...m };
};
const worst = m => Math.max(m.edge.L, m.edge.R, m.edge.T, m.edge.B);
const edges = m => `L${(m.edge.L * 100).toFixed(0)} R${(m.edge.R * 100).toFixed(0)} T${(m.edge.T * 100).toFixed(0)} B${(m.edge.B * 100).toFixed(0)}`;

/* Walk to a slot and park the rail in view. The rail only exists while a
   football garment is WORN in the open slot, which is the feature's own rule. */
const openSlot = async slot => {
  await page.evaluate(s => document.querySelector(`[data-pd="${s}"]`).click(), slot);
  await settle(page); await settle(page);
  await page.evaluate(() => {
    const sc = document.querySelector('.screen'), el = document.querySelector('.fb-rail-wrap');
    sc.scrollTop = Math.max(0, el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 60);
  });
  await settle(page);
};

try {
  await seed(page, { level: 20, coins: 400000 });
  await setWidth(page, 430, 932);
  await page.evaluate(async ids => {
    const loot = await import('/js/loot.js');
    for (const [slot, id] of ids) { await loot.grantCosmetic(id, 'football'); await loot.equip(slot, id); }
  }, GARMENTS.map(g => [g.slot, footballItemId(TEAM, g.key)]));
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await settle(page); await settle(page);
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });

  const got = {};
  for (const g of GARMENTS) {
    await openSlot(g.slot);
    const cls = await page.evaluate(() => {
      const cell = document.querySelector('.fb-rail .pw-item.on') || document.querySelector('.fb-rail .pw-item');
      return cell?.querySelector('.pc-worn')?.className || null;
    });
    const m = await measure();
    if (m.err || !m.n) { setup(`SAMPLE the ${g.key} tile has measurable art`, false, m.err || 'zero garment pixels: the isolation matched nothing'); }
    got[g.key] = { ...m, cls };
    if (SHOTS && m.rect) await page.screenshot({ path: path.join(SHOTS, `crop-${g.key}.png`), clip: m.rect });
  }
  setup('SAMPLE all three tiles were found on screen with a non-zero garment in them',
    GARMENTS.every(g => got[g.key].n > 200),
    GARMENTS.map(g => `${g.key} ${got[g.key].n}px in ${got[g.key].w}x${got[g.key].h} (kept ${got[g.key].kept.garment} of ${got[g.key].kept.total} layers + ${got[g.key].kept.tints} tint spans)`).join(', '));

  console.log('      measured: ' + GARMENTS.map(g => {
    const m = got[g.key];
    return `${g.key} ink ${(m.ink * 100).toFixed(1)}% bbox ${m.bw}x${m.bh} at ${m.bx},${m.by} centre ${(m.cx * 100).toFixed(0)}/${(m.cy * 100).toFixed(0)}% edges ${edges(m)}`;
  }).join(' | '));

  ok('CROP-CLASS a football head piece takes the helmet frame and the other garments keep their own',
    GARMENTS.every(g => (got[g.key].cls || '').split(/\s+/).includes(g.fit)),
    GARMENTS.map(g => `${g.key}: ${got[g.key].cls}`).join('; '));

  const H = got.helmet;
  ok('CROP-INSIDE the helmet is a whole object and stays inside its tile on every side',
    worst(H) === 0, `edges ${edges(H)} (the jersey's sleeve runs off ${(got.jersey.edge.R * 100).toFixed(0)}% of its right edge and the cleats' soles ${(got.cleats.edge.B * 100).toFixed(0)}% of their bottom, which is correct: those are crops of a body)`);

  const lo = Math.min(got.jersey.ink, got.cleats.ink) - 0.08;
  const hi = Math.max(got.jersey.ink, got.cleats.ink) + 0.08;
  ok('CROP-BAND the helmet fills about as much of its tile as the two garments Tom said read correctly',
    H.ink >= lo && H.ink <= hi,
    `helmet ${(H.ink * 100).toFixed(1)}% against jersey ${(got.jersey.ink * 100).toFixed(1)}% and cleats ${(got.cleats.ink * 100).toFixed(1)}%; band ${(lo * 100).toFixed(1)}-${(hi * 100).toFixed(1)}%`);

  ok('CROP-CENTRED and it is centred in the tile rather than merely fitting in it',
    Math.abs(H.cx - 0.5) <= 0.05 && Math.abs(H.cy - 0.5) <= 0.05,
    `centre ${(H.cx * 100).toFixed(1)}%/${(H.cy * 100).toFixed(1)}% of the tile`);

  /* THE CONTROL, AND IT RUNS EVERY TIME. Put .fit-head's own headwear frame back
     on .fit-fbhead and require the three rows above to report the defect. */
  await openSlot('H');
  await page.addStyleTag({ content: '.fit-fbhead .bh-anim { transform-origin: 43% 21% !important; transform: translate(4%, 26%) scale(2.3) !important; }' });
  await settle(page);
  const back = await measure();
  ok('CROP-CONTROL the same three measurements report the defect when the headwear frame is put back, so they can fail at all',
    !back.err && back.n > 200 && worst(back) > 0.15 && back.ink > H.ink + 0.15,
    back.err || `with .fit-head's frame: ink ${(back.ink * 100).toFixed(1)}% (was ${(H.ink * 100).toFixed(1)}%), bbox ${back.bw}x${back.bh} in ${back.w}x${back.h}, edges ${edges(back)}`);

  ok('CROP-CLEAN nothing threw across the whole drive', errors.length === 0, errors.join(' | ') || 'clean');
} catch (e) {
  console.log(`FAIL  CROP-HARNESS the audit itself died  | ${e && e.message}`);
  fails = 1;
} finally {
  await browser.close();
  srv?.close?.();
}

console.log(fails
  ? '\nA FOOTBALL GARMENT IS NOT FRAMED THE WAY IT WAS MEASURED TO BE.'
  : '\nTILE CROP: the helmet is a whole helmet inside its square, filling about what the jersey and the cleats fill');
process.exit(fails);

/* Every catalogue row must point at a file that EXISTS, DECODES and is 640px.
   A row with no file renders an empty box on a paperdoll, and nothing else in
   the app notices. Run: node tests/newart-audit.mjs [base] [ids,csv|all] */
import { boot } from './godmode.js';
const base = process.argv[2] || 'http://localhost:8765/';
const arg = process.argv[3] || 'all';
const { browser, page } = await boot(base);
const rows = await page.evaluate(async which => {
  const m = await import('./data/boneheadz.js');
  const items = which === 'all' ? m.BH_ITEMS_WITH_UNRELEASED
    : m.BH_ITEMS_WITH_UNRELEASED.filter(i => which.includes(i.id));
  const out = [];
  for (const it of items) {
    const src = m.bhAsset(it);
    /* createImageBitmap + close(), not new Image(): 364 catalogue rows at 640px
       is ~580 MB of decoded bitmap, and holding them all at once is exactly the
       wall that crashed the Bestiary. Held that way, decode() starts failing
       partway through and this audit reports 201 files "missing" that are all
       sitting on disk. Release each one. */
    let ok = false, w = 0;
    try {
      const bmp = await createImageBitmap(await (await fetch(src)).blob());
      ok = true; w = bmp.width; bmp.close();
    } catch { ok = false; }
    out.push({ id: it.id, slot: it.slot, name: it.name, src, ok, w });
  }
  return out;
}, arg === 'all' ? 'all' : arg.split(','));
const missing = rows.filter(r => !r.ok);
const odd = rows.filter(r => r.ok && r.w !== 640);
const nameless = rows.filter(r => /#\d+$/.test(r.name || ''));
console.log(`checked ${rows.length} catalogue rows`);
console.log(`  missing/undecodable : ${missing.length}${missing.length ? ' -> ' + missing.map(r => r.id).join(', ') : ''}`);
console.log(`  not 640px           : ${odd.length}${odd.length ? ' -> ' + odd.map(r => r.id + '@' + r.w).join(', ') : ''}`);
console.log(`  still placeholder-named: ${nameless.length}`);
if (!rows.length) { console.log('EMPTY SAMPLE = FAILURE'); process.exit(1); }

/* DUPLICATE ART. Two catalogue rows pointing at pixel-identical files is a real
   defect: a player owns both and sees no difference, and it is impossible to name
   them honestly. Found MS1 and MS6 that way on 2026-08-09 (byte-identical), while
   re-auditing the names after Tom caught "Moss Braids" on a beanie. */
const dupes = await page.evaluate(async () => {
  const m = await import('./data/boneheadz.js');
  const seen = new Map(), out = [];
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });
  for (const it of m.BH_ITEMS_WITH_UNRELEASED) {
    const img = new Image(); img.src = m.bhAsset(it);
    try { await img.decode(); } catch { continue; }
    cv.width = 64; cv.height = 64; cx.clearRect(0, 0, 64, 64);
    cx.drawImage(img, 0, 0, 64, 64);
    // a coarse fingerprint is enough to flag candidates; exact bytes get checked by hand
    const d = cx.getImageData(0, 0, 64, 64).data;
    let h = 0; for (let i = 0; i < d.length; i += 17) h = (h * 31 + d[i]) >>> 0;
    const key = it.slot + ':' + h;
    if (seen.has(key)) out.push([seen.get(key), it.id]); else seen.set(key, it.id);
  }
  return out;
});
console.log(`  duplicate art (same slot)  : ${dupes.length}${dupes.length ? ' -> ' + dupes.map(d => d.join('=')).join(', ') : ''}`);

await browser.close();
if (missing.length || odd.length) { console.log('FAIL'); process.exit(1); }
console.log('all catalogue art present, decoded and 640px');
process.exit(0);

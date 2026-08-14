/* Every catalogue row must point at a file that EXISTS, DECODES and is 640px.
   A row with no file renders an empty box on a paperdoll, and nothing else in
   the app notices. Run: node tests/newart-audit.mjs [base] [ids,csv|all] */
import { boot, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srvHandle.url;
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
/* EVERY COSMETIC HAS A REAL NAME, and no two in a slot share one. 258 rows
   carried a generated placeholder ("Tidy Backdrop #1") until 2026-08-09; the
   names were read off each item WORN on a bonehead at 330px, per Tom's rule.
   A duplicate inside a slot is the other failure: two rows a player cannot tell
   apart in the wardrobe. */
if (nameless.length) {
  console.log(`FAIL  ${nameless.length} cosmetics still have a placeholder name -> ${nameless.slice(0, 8).map(r => r.id).join(', ')}`);
  process.exitCode = 1;
}
{
  /* unique across the WHOLE catalogue, not just the slot: unit.test.js has held
     that line since the drop items were named, and a cross-slot collision is
     just as confusing in a crate reveal as a same-slot one. */
  const seen = new Map(), clashes = [];
  for (const r of rows) {
    const k = (r.name || '').toLowerCase();
    if (seen.has(k)) clashes.push(`${seen.get(k)} + ${r.id} both "${r.name}"`);
    else seen.set(k, r.id);
  }
  if (clashes.length) {
    console.log(`FAIL  two cosmetics share a name -> ${clashes.slice(0, 6).join(' | ')}`);
    process.exitCode = 1;
  } else {
    console.log(`  all ${rows.length} names are unique`);
  }
}
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
/* ASSERT it. Printing the count and exiting 0 is how MS1=MS6 stayed in the
   catalogue after this very check found it. */
if (dupes.length) {
  console.log(`FAIL  ${dupes.length} pair(s) of rows share one image -> ${dupes.slice(0, 6).map(d => d.join('=')).join(', ')}`);
  process.exitCode = 1;
}

/* A DANGLING DECLARATION SWALLOWS THE NEXT RULE. Deleting a selector line with a
   regex left `font-size: 10px; ... }` on its own; the CSS parser ate the rule
   after it, so a banner styled display:flex silently rendered inline-block, and
   Chrome says nothing. Counting parsed rules cannot catch it (3462 of 3463 is
   noise) and diffing selectors cannot either (the same defect breaks the source
   scan symmetrically). The defect IS a brace at depth zero, so look for that. */
{
  /* blank the comments out IN PLACE, keeping their newlines: deleting them
     outright shifted every reported line number up by the comment body (this
     check pointed at 6141 for a defect on 7035). */
  const raw = (await import('node:fs')).readFileSync(new URL('../app.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '));
  let depth = 0, line = 1, bad = 0, where = 0;
  for (const ch of raw) {
    if (ch === '\n') line++;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth < 0) { bad++; where = where || line; depth = 0; } }
  }
  if (bad || depth !== 0) {
    console.log(`FAIL  app.css: ${bad ? `stray closing brace at line ${where}` : `${depth} unclosed block(s)`}`);
    console.log('      a declaration left outside any selector eats the rule that follows it');
    process.exitCode = 1;
  } else {
    console.log('app.css braces balance (no orphaned declarations)');
  }
}

await browser.close();
if (srvHandle) srvHandle.close();
if (missing.length || odd.length) { console.log('FAIL'); process.exitCode = 1; }
else console.log('all catalogue art present, decoded and 640px');
/* HONOUR EVERY FAILURE. This was `process.exit(0)`, which discards process.exitCode
   outright (`node -e 'process.exitCode=1; process.exit(0)'` exits 0), so placeholder
   names, duplicate names, duplicate art and a broken app.css all reported green.
   Bare process.exit() exits with process.exitCode; it is spelled out here because
   that is the exact detail this line got wrong.
   The srvHandle close above is kept from the other side of this merge: BOTH were
   wanted, the cleanup and the honest exit code. */
process.exit(process.exitCode || 0);

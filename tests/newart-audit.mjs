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
    const img = new Image(); img.src = src;
    const ok = await img.decode().then(() => true).catch(() => false);
    out.push({ id: it.id, slot: it.slot, name: it.name, src, ok, w: img.naturalWidth });
  }
  return out;
}, arg === 'all' ? 'all' : arg.split(','));
await browser.close();
const missing = rows.filter(r => !r.ok);
const odd = rows.filter(r => r.ok && r.w !== 640);
const nameless = rows.filter(r => /#\d+$/.test(r.name || ''));
console.log(`checked ${rows.length} catalogue rows`);
console.log(`  missing/undecodable : ${missing.length}${missing.length ? ' -> ' + missing.map(r => r.id).join(', ') : ''}`);
console.log(`  not 640px           : ${odd.length}${odd.length ? ' -> ' + odd.map(r => r.id + '@' + r.w).join(', ') : ''}`);
console.log(`  still placeholder-named: ${nameless.length}`);
if (!rows.length) { console.log('EMPTY SAMPLE = FAILURE'); process.exit(1); }
if (missing.length || odd.length) { console.log('FAIL'); process.exit(1); }
console.log('all catalogue art present, decoded and 640px');
process.exit(0);

import fs from 'fs';
const dir = 'assets/icons-proposal';
const man = JSON.parse(fs.readFileSync(dir + '/manifest.json', 'utf8'));
const tints = {};
for (const it of man.icons) tints[it.file.replace('.svg', '')] = it.tint;
const icons = {};
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.svg')) continue;
  if (f === 'fajita.svg') continue; // superseded by dish-fajita
  const id = f.replace('.svg', '');
  let svg = fs.readFileSync(dir + '/' + f, 'utf8').trim();
  const vb = (svg.match(/viewBox="([^"]+)"/) || [,'0 0 512 512'])[1];
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  icons[id] = { vb, inner };
}
const ids = Object.keys(icons).sort();
let out = `// AUTO-GENERATED from assets/icons-proposal/*.svg (game-icons.net CC-BY 3.0,
// dish-fajita custom). Regenerate with scratchpad gen_icons.mjs. Flat, no rim:
// tint via currentColor; add a soft drop-shadow in CSS.
export const BH_ICON_TINTS = ${JSON.stringify(tints)};
const RAW = {\n`;
for (const id of ids) out += `  ${JSON.stringify(id)}: { vb: ${JSON.stringify(icons[id].vb)}, p: ${JSON.stringify(icons[id].inner)} },\n`;
out += `};
// Return an inline SVG string, sized + tinted (defaults to the manifest tint).
export function bhIcon(id, size = 22, tint) {
  const it = RAW[id];
  if (!it) return '';
  const color = tint || BH_ICON_TINTS[id] || 'currentColor';
  return \`<svg class="bhi" viewBox="\${it.vb}" width="\${size}" height="\${size}" style="color:\${color}" aria-hidden="true">\${it.p}</svg>\`;
}
export function hasBhIcon(id) { return !!RAW[id]; }
export function bhIconRaw(id) { const it = RAW[id]; return it ? { vb: it.vb, inner: it.p, tint: BH_ICON_TINTS[id] || 'currentColor' } : null; }
`;
fs.writeFileSync('js/icons-pack.js', out);
console.log('wrote js/icons-pack.js with', ids.length, 'icons');

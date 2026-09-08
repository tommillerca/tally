// Read-only census of the main application stylesheet. Run from any directory:
// node scripts/fontscale-census.mjs > /tmp/fontscale-current.json
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cssDeclarations, hasPx } from '../tests/lib/css-declarations.mjs';

const source = readFileSync(process.argv.includes('--stdin') ? 0 : new URL('../app.css', import.meta.url), 'utf8');
const rows = cssDeclarations(source);
const customGroups = {
  '--radius': 'borders and hairlines', '--radius-sm': 'borders and hairlines',
  '--tw': 'borders and hairlines', '--sh': 'effects', '--sh-sm': 'effects',
  '--pad': 'spacing', '--sat': 'spacing', '--sab': 'spacing', '--bleed': 'spacing',
  '--cf-pad': 'spacing', '--pdk-door-safe': 'spacing', '--pdk-door-ground': 'spacing',
  '--gw-air': 'spacing',
};
function group({ property: p }) {
  if (p === '@media') return 'media-query breakpoints';
  if (/^--fs-/.test(p) || p === '--tb-size' || p === 'font-size' || p === 'font') return 'type size';
  if (p.startsWith('--')) return customGroups[p] || 'fixed geometry';
  if (/^(margin|padding|gap|row-gap|column-gap|letter-spacing|word-spacing|line-height|vertical-align)/.test(p)) return 'spacing';
  if (/^(border|outline|-webkit-text-stroke)/.test(p)) return 'borders and hairlines';
  if (/shadow|filter/.test(p)) return 'effects';
  if (/^(width|height|min-|max-|top$|right$|bottom$|left$|inset|transform|translate|perspective|background|mask|-webkit-mask|clip|flex|grid)/.test(p)) return 'fixed geometry';
  throw new Error(`Unclassified px property: ${p}`);
}
const inventory = rows.filter(row => hasPx(row.value)).map(row => ({ ...row,
  kind: row.property === '@media' ? 'condition' : row.property.startsWith('--') ? 'custom property' : 'declaration',
  group: group(row) }));
const counts = {};
for (const row of inventory) {
  const count = counts[row.group] ||= { declarations: 0, customProperties: 0, conditions: 0 };
  count[row.kind === 'condition' ? 'conditions' : row.kind === 'custom property' ? 'customProperties' : 'declarations']++;
}
const fonts = rows.filter(row => row.property === 'font-size');
const fsUses = fonts.filter(row => /var\(--fs-/.test(row.value));
const report = { source: 'app.css', sha256: createHash('sha256').update(source).digest('hex'),
  counting: 'One declaration per source occurrence, including overridden rules and fallbacks. One px-valued media condition per @media rule, not per numeric literal. Comments excluded.',
  counts, fontSize: { total: fonts.length, px: fonts.filter(row => hasPx(row.value)).length,
    fsToken: fsUses.length, talkboxToken: fonts.filter(row => /var\(--tb-size/.test(row.value)).length,
    rem: fonts.filter(row => /[\d.]rem\b/.test(row.value)).length,
    other: fonts.filter(row => !hasPx(row.value) && !/var\(--(?:fs-|tb-size)|[\d.]rem\b/.test(row.value)).length },
  fsUses: Object.fromEntries(Array.from({ length: 8 }, (_, n) => [`--fs-${n}`, fsUses.filter(row => row.value.includes(`--fs-${n})`)).length])),
};
// Keep the exhaustive inventory reviewable: one source declaration per line.
console.log(JSON.stringify(report, null, 2).slice(0, -2) + ',\n  "inventory": [\n' +
  inventory.map(row => '    ' + JSON.stringify(row)).join(',\n') + '\n  ]\n}');

// Source census, not a DOM/cascade evaluator. No rendering or application boot.
import { readFileSync, readdirSync } from 'node:fs';
import { cssDeclarations } from './css-declarations.mjs';

const root = new URL('../../', import.meta.url);
export function readTypeSources() {
  return Object.fromEntries(['app.css', 'index.html', ...readdirSync(new URL('js/', root))
    .filter(p => p.endsWith('.js')).sort().map(p => `js/${p}`)]
    .map(path => [path, readFileSync(new URL(path, root), 'utf8')]));
}

// Exact source sites, not a blanket icon selector exemption. Their font sizes
// size decorative glyphs or icon-only wrappers, not readable words/numbers.
export const fixedGlyphs = new Map([
  ['.crate-shake', '74px'], ['.hero-emoji', '22px'], ['.vs-bone', '44px'],
  ['.rl-skull', '54px'], ['.pc-icon', '96px'],
]);
export function typeRows(sources) {
  return Object.entries(sources).flatMap(([file, source]) => {
    if (file.endsWith('.css')) return cssDeclarations(source)
      .filter(r => /^(font-size|font)$/.test(r.property)).map(r => ({ file, ...r }));
    // Scan literal CSS in templates, injected styles and inline attributes.
    // SVG font-size attributes use scene coordinates and are inventoried separately.
    const clean = source.replace(/\/\*[\s\S]*?\*\//g, s => s.replace(/[^\n]/g, ' '));
    return [...clean.matchAll(/\b(font-size|font)\s*:\s*([^;\n}"'`]+)/g)]
      .map(m => ({ file, line: source.slice(0, m.index).split('\n').length,
        context: source.slice(source.lastIndexOf('\n', m.index) + 1, source.indexOf('\n', m.index)),
        property: m[1], value: m[2].trim() }));
  });
}
export function isFixedGlyph(row) {
  if (row.property !== 'font-size') return false;
  if (row.file === 'app.css') return fixedGlyphs.get(row.context.split(' > ').at(-1)) === row.value;
  if (row.file === 'js/wheel.js') return (row.context.includes('font-size:min(7vw,26px)') && row.value === 'min(7vw,26px)') ||
    (row.context.includes('.dw-result .ri{') && row.value === '46px');
  if (row.file === 'js/hollow-scene.js') return row.context.includes('>〜</span>') && ['14px', '16px'].includes(row.value);
  return row.file === 'js/app.js' && row.context.includes('${streakMilestone ? sparkIco(48)') && row.value === '44px';
}
export function scalingCensus(sources) {
  const rows = typeRows(sources);
  const definitions = Object.values(sources).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const tokens = new Map();
  for (const m of definitions.matchAll(/(--[\w-]+)\s*:\s*([^;}\n]+)/g)) {
    const values = tokens.get(m[1]) || [];
    tokens.set(m[1], [...values, m[2].trim()]);
  }
  function scalable(value, seen = new Set()) {
    value = value.replace(/\s*!important$/, '');
    if (/^(inherit|[\d.]+em|[\d.]+%)$/.test(value)) return true;
    if (/(?:[\d.]px|[\d.](?:vw|vh|vmin|vmax))\b/.test(value)) return false;
    let valid = true;
    value = value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, name) => {
      if (!tokens.has(name) || seen.has(name) || !tokens.get(name).every(v => scalable(v, new Set([...seen, name])))) valid = false;
      return '1rem';
    });
    return valid && /[\d.]rem\b/.test(value);
  }
  const text = rows.filter(r => !isFixedGlyph(r) && r.value !== '-apple-system-body' &&
    // Font family var() is not a type-size dependency of a shorthand.
    !(r.file === 'app.css' && r.context === 'html' && r.property === 'font-size'));
  const failed = text.filter(r => !scalable(r.property === 'font'
    ? r.value.match(/(?:var\(--fs-[\w-]+\)|[\d.]+(?:rem|px|em)|inherit)/)?.[0] || r.value
    : r.value));
  return { kind: 'static source declarations, including overridden rules; inherited values assume a scalable ancestor',
    total: text.length, scalable: text.length - failed.length,
    proportion: (text.length - failed.length) / text.length,
    fixedGlyphs: rows.filter(isFixedGlyph), failed };
}

export function assertNamedRamp(assert, sources) {
  for (const row of typeRows(sources)) {
    if (isFixedGlyph(row)) continue;
    if (row.file === 'app.css' && row.context === 'html') continue;
    if (row.file === 'app.css' && row.context === 'body' && row.value === '1rem') continue;
    assert.ok(/var\(--(?:fs-[\w-]+|tb-size)\)/.test(row.value) ||
      /^(inherit(?: !important)?|[\d.]+em)$/.test(row.value),
    `text must use the named ramp: ${row.file}:${row.line} ${row.value}`);
  }
}

// A 100% floor cannot drift down as the denominator grows. New unresolved or
// absolute type sites always fail. Keep this history append-only when ratcheting.
export const floorHistory = [0.95, 1];
export function assertScalingFloor(assert, census, history = floorHistory) {
  assert.ok(history.length >= 2 && history[0] >= .95 && history.at(-1) === 1,
    'source scaling floor may not fall below the frozen 100% ratchet');
  assert.ok(history.every((v, i) => v > 0 && v <= 1 && (!i || v >= history[i - 1])), 'floor must never fall');
  assert.ok(census.total > 900, 'CONTROL census must include the full application type surface');
  assert.ok(census.proportion >= history.at(-1),
    `scaling floor: ${census.scalable}/${census.total} (${(census.proportion * 100).toFixed(2)}%) < ${history.at(-1) * 100}%\n` +
    census.failed.slice(0, 8).map(r => `${r.file}:${r.line} ${r.value}`).join('\n'));
}

// For the independent rendered review: feed matched visible text elements from
// the same screen/state at normal and enlarged system text. This does not collect
// or fabricate that evidence. A 5% change avoids floating point noise.
export function elementScalingCensus(assert, sample) {
  assert.ok(typeof sample.build === 'string' && sample.build.length, 'identify the measured build');
  assert.ok(Array.isArray(sample.elements) && sample.elements.length >= 400, 'full element census required');
  const keys = new Set();
  for (const row of sample.elements) {
    assert.ok(typeof row.screen === 'string' && row.screen && typeof row.id === 'string' && row.id, 'identify screen and element');
    const key = `${row.screen}:${row.id}`;
    assert.ok(!keys.has(key), `duplicate measured element ${key}`); keys.add(key);
    assert.ok(Number.isFinite(row.normalPx) && row.normalPx > 0 &&
      Number.isFinite(row.largePx) && row.largePx > 0, `invalid measurement ${key}`);
  }
  const scalable = sample.elements.filter(r => r.largePx > r.normalPx * 1.05).length;
  return { build: sample.build, total: sample.elements.length, scalable, proportion: scalable / sample.elements.length };
}
export function assertElementFloor(assert, census, history = [.90, .95]) {
  assert.ok(history[0] >= .90 && history.at(-1) >= .95 &&
    history.every((n, i) => n <= 1 && (!i || n >= history[i - 1])), 'element floor must never fall');
  assert.ok(census.proportion >= history.at(-1), `element scaling floor: ${census.scalable}/${census.total} < ${history.at(-1) * 100}%`);
}

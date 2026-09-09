// R60-2 Stage 1: static type resolution only. No browser, sockets or OS claim.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { cssDeclarations, hasPx } from './lib/css-declarations.mjs';
import { scalingCensus, readTypeSources, assertScalingFloor, assertNamedRamp, elementScalingCensus, assertElementFloor } from './lib/fontscale-census.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const source = read('app.css');
// Accessibility policy is independent of the typography census.
function assertPinchZoom(html) {
  const viewport = html.match(/<meta\b[^>]*name=["']viewport["'][^>]*>/i)?.[0] || '';
  assert.doesNotMatch(viewport, /user-scalable\s*=\s*(?:no|0)\b/i, 'pinch-zoom must not be disabled');
}
assertPinchZoom(read('index.html'));
assert.throws(() => assertPinchZoom('<meta name="viewport" content="initial-scale=1, user-scalable=no">'), /pinch-zoom/);

const census = scalingCensus(readTypeSources());
console.log(`SOURCE CENSUS ${census.scalable}/${census.total} (${(100 * census.proportion).toFixed(2)}%); fixed glyphs ${census.fixedGlyphs.length}`);
assertScalingFloor(assert, census);
assertNamedRamp(assert, readTypeSources());
assert.equal(census.fixedGlyphs.length, 10, 'CONTROL all ten fixed glyph source sites must remain fixed');
const external = ['index.html', ...readdirSync(new URL('js/', root))
  .filter(name => name.endsWith('.js')).map(name => `js/${name}`)]
  .map(path => ({ path, source: read(path) }));
const refs = value => [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map(match => match[1]);
const baseline = [11, 12, 13, 15, 17, 21, 28, 40];

function verify(css, extras = external) {
  const rows = cssDeclarations(css);
  const definitions = rows.filter(row => row.property.startsWith('--'));
  // Include CSS declarations in injected styles and literal inline markup.
  // These source scans never evaluate or import application code.
  for (const { path, source: text } of extras) {
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const match of clean.matchAll(/(--[\w-]+)\s*:\s*([^;}\n]+)/g)) {
      definitions.push({ property: match[1], value: match[2].trim(), context: path });
    }
  }
  const names = new Set(definitions.filter(row => /^--fs-/.test(row.property)).map(row => row.property));
  names.add('--tb-size');
  // Discover future font-size tokens and their aliases, not only today's names.
  for (const row of rows.filter(row => /^(font-size|font)$/.test(row.property))) {
    if (row.property === 'font') continue; // Shorthand font-family tokens are not size tokens.
    for (const name of refs(row.value)) names.add(name);
  }
  for (const name of names) {
    const found = definitions.filter(row => row.property === name);
    assert.ok(found.length, `missing type token ${name}`);
    for (const row of found) for (const alias of refs(row.value)) names.add(alias);
  }
  const type = definitions.filter(row => names.has(row.property));
  assert.equal(type.filter(row => hasPx(row.value)).length, 0, 'px-valued TYPE tokens must be zero in every scope');
  function resolve(value, rootSize, seen = new Set()) {
    const literal = value.match(/^([\d.]+)rem$/);
    if (literal) return Number(literal[1]) * rootSize;
    const alias = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    assert.ok(alias && !seen.has(alias[1]), `type value must resolve through rem: ${value}`);
    const next = new Set([...seen, alias[1]]);
    const values = definitions.filter(row => row.property === alias[1]).map(row => resolve(row.value, rootSize, next));
    assert.ok(values.length && values.every(n => n === values[0]), `ambiguous type alias ${value}`);
    return values[0];
  }
  for (const row of type) {
    const normal = resolve(row.value, 16), large = resolve(row.value, 32);
    assert.ok(normal > 0, `empty type scale ${row.property}`);
    assert.equal(large, normal * 2, `${row.property} must double with the root`);
  }
  baseline.forEach((px, n) => {
    const token = definitions.filter(row => row.context === ':root' && row.property === `--fs-${n}`);
    assert.equal(token.length, 1, `one root definition of --fs-${n}`);
    assert.equal(resolve(token[0].value, 16), px, 'preserve the default design size');
    assert.ok(rows.some(row => row.property === 'font-size' && row.value === `var(--fs-${n})`), 'token needs a real consumer');
  });
  const body = rows.filter(row => row.context === 'body' && row.property === 'font-size');
  assert.ok(body.length && body.every(row => row.value === '1rem'), 'body must inherit the root scale through 1rem');
  for (const row of rows.filter(row => /^(?:html|:root)$/.test(row.context) && /^(?:font|font-size)$/.test(row.property))) {
    assert.equal(row.value, row.property === 'font' ? '-apple-system-body' : '100%', 'root text size must not be pinned');
  }
  assert.ok(rows.some(row => row.context === 'html' && row.property === 'font' && row.value === '-apple-system-body'),
    'root must opt into iOS Dynamic Type');
  const talk = definitions.filter(row => row.property === '--tb-size');
  assert.deepEqual(talk.map(row => resolve(row.value, 16)).sort((a, b) => a - b), [11, 13, 14, 16],
    'preserve all four talk-box sizes, including the injected mimic encounter');
  // Positive CONTROL: geometry stays px even when the type doubles.
  const borders = rows.filter(row => row.context === '.talkbox' && row.property === 'border');
  assert.ok(borders.length && borders.every(row => row.value === '2px solid var(--line-strong)'),
    'CONTROL talk-box border must remain 2px');
  for (const property of ['width', 'height']) {
    const dimensions = rows.filter(row => row.context === '.pw-item.famr .famr-art' && row.property === property);
    assert.ok(dimensions.length && dimensions.every(row => row.value === '78px'), `CONTROL sprite ${property} must remain 78px`);
  }
  return type.length;
}

const count = verify(source);
console.log(`PASS ${count} type-token definitions resolve through rem and double at 16px to 32px; px TYPE tokens: 0`);
console.log('PASS body base, default sizes, token consumers and px border/sprite controls');

// Prove red without touching production files. The same verifier must reject
// the old seam, a local override, a new token/alias, and over-broad conversion.
const mutate = (from, to) => {
  assert.ok(source.includes(from), `mutation anchor missing: ${from}`);
  const result = source.replace(from, to);
  assert.notEqual(result, source);
  return result;
};
const mutations = [
  mutate('--fs-0: .6875rem', '--fs-0: 11px'),
  `${source}\n.pet-a11y { --fs-1: 12px; }`,
  `${source}\n:root { --fs-future: 18px; }`,
  `${source}\n:root { --future: var(--legacy); --legacy: 18px; } .future { font-size: var(--future); }`,
  mutate('font-size: 1rem;', 'font-size: 16px;'),
  `${source}\nhtml { font-size: 16px; }`,
  `${source}\n.talkbox { border: .125rem solid var(--line-strong); }`,
  `${source}\n.pw-item.famr .famr-art { width: 4.875rem; height: 4.875rem; }`,
];
for (const [i, css] of mutations.entries()) assert.throws(() => verify(css), assert.AssertionError, `mutation ${i + 1}`);
const badMimic = external.map(file => file.path === 'js/mimic.js'
  ? { ...file, source: file.source.replace('--tb-size: .875rem', '--tb-size: 14px') } : file);
assert.notDeepEqual(badMimic, external, 'injected token mutation must apply');
assert.throws(() => verify(source, badMimic), /px-valued TYPE/);
// Record the viewport policy without making typography depend on its value.
// The scoped zoom contract belongs to boneyard-zoom-audit.mjs.
const viewportPolicy = html => html.match(/<meta\b[^>]*name=["']viewport["'][^>]*>/i)?.[0] || '(no viewport meta)';
console.log(`INFO viewport policy: ${viewportPolicy(read('index.html'))}`);
for (const policy of ['yes', 'no']) {
  const changed = external.map(file => file.path === 'index.html'
    ? { ...file, source: file.source.replace(/,?\s*user-scalable=[^,"'\s>]+/g, '').replace(/initial-scale=1/, `initial-scale=1, user-scalable=${policy}`) }
    : file);
  assert.ok(changed.find(file => file.path === 'index.html').source.includes(`user-scalable=${policy}`));
  assert.equal(verify(source, changed), count, 'font audit must accept either viewport policy');
}
console.log('PASS 9 regression mutations rejected; viewport yes/no policy changes accepted');

// CONTROL the full census must see each source route, not just token definitions.
const allSources = readTypeSources();
const regressions = [
  { ...allSources, 'app.css': `${source}\n.regression { font-size: 14px; }` },
  { ...allSources, 'app.css': `${source}\n.regression { font: 700 14px/1.2 sans-serif; }` },
  { ...allSources, 'app.css': `${source}\n.regression { font-size: clamp(1rem, 5vw, 2rem); }` },
  { ...allSources, 'app.css': `${source}\n.regression { --bad: 14px; font-size: var(--bad); }` },
  { ...allSources, 'js/app.js': `${allSources['js/app.js']}\nconst bad = '<p style="font-size:14px">Readable text</p>';` },
  { ...allSources, 'js/wheel.js': `${allSources['js/wheel.js']}\nconst bad = '.dw-new {font-size:14px}';` },
];
for (const candidate of regressions) assert.throws(() => assertScalingFloor(assert, scalingCensus(candidate)), /scaling floor/);
assert.throws(() => assertScalingFloor(assert, census, [.95, .9]), /floor/);
assert.throws(() => assertScalingFloor(assert, census, [.95, 1, .99]), /floor/);
assert.throws(() => verify(source.replace('font: -apple-system-body;', '')), /Dynamic Type/);
assert.throws(() => assertNamedRamp(assert, { ...allSources, 'app.css': `${source}\n.regression { font-size: 1.234rem; }` }), /named ramp/);
console.log('PASS CONTROL 6 full-census regressions, 2 lowered floors and missing Dynamic Type opt-in rejected');

// Reviewable layout contracts, not evidence of rendered fit.
const finalRows = cssDeclarations(source);
function last(selector, property) {
  return finalRows.filter(r => r.context === selector && r.property === property).at(-1)?.value;
}
assert.equal(last('.pdk-scene', 'height'), '520px', 'CONTROL scene art height stays fixed');
assert.equal(last('.pdk-host', 'overflow-y'), 'auto');
assert.equal(last('.pdk-host', 'max-height'), '398px');
assert.equal(last('.rk-or', 'height'), 'auto');
assert.equal(last('#stableBody .stable-room-picture', 'height'), '54px');
assert.match(last('#stableBody .stable-rooms', 'grid-template-columns'), /auto-fit/);
assert.equal(last('.cf-chip, .cf-lv', 'max-width'), 'calc(50% - 16px)');
assert.equal(last('.sheet-head h2', 'white-space'), 'normal');
assert.equal(last('.tab-badge', 'height'), 'auto');
console.log('PASS text-container wrapping/scroll contracts; fixed Paddock scene and room art controls');

// Synthetic CONTROL fixtures only. These are not measured application elements.
const sample = { build: 'synthetic-control', elements: Array.from({ length: 427 }, (_, i) =>
  ({ screen: 'fixture', id: String(i), normalPx: 16, largePx: 32 })) };
assertElementFloor(assert, elementScalingCensus(assert, sample));
const stuck = { ...sample, elements: sample.elements.map((r, i) => ({ ...r, largePx: i < 5 ? 32 : 16 })) };
assert.throws(() => assertElementFloor(assert, elementScalingCensus(assert, stuck)), /5\/427/);
assert.throws(() => assertElementFloor(assert, elementScalingCensus(assert, sample), [.95, .94]), /never fall/);
assert.throws(() => elementScalingCensus(assert, { ...sample, elements: sample.elements.map(r => ({ ...r, id: 'duplicate' })) }), /duplicate/);
console.log('PASS CONTROL measured-element input validator and 95% ratchet (synthetic fixtures only; actual element census NOT RUN)');

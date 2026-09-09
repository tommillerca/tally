/* Frozen fix-dock-line: source contract and flex geometry, NOT pixel/tap proof.
 * Run with an explicit checkout while staging this check outside tests/.
 * Rendered all-tab pixels, row taps and native bounce remain manual evidence.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(process.argv[2] || fileURLToPath(new URL('../', import.meta.url)));
const { cssDeclarations } = await import(pathToFileURL(resolve(root, 'tests/lib/css-declarations.mjs')));
const read = name => readFileSync(resolve(root, name), 'utf8');
const source = read('app.css');
const html = read('index.html');
const tabs = [...html.matchAll(/<button class="tab" data-tab="([^"]+)"/g)].map(m => m[1]);
assert.deepEqual(tabs, ['today', 'boneyard', 'friends', 'bonehead'], 'enumerate every dock tab');
assert.match(html, /<main id="screen" class="screen"><\/main>\s*<nav id="tabbar" class="tabbar"/, 'dock must follow the scroller in flow');

function grade(css, rootSize = 16) {
  const rows = cssDeclarations(css);
  const value = (context, property) => {
    const found = rows.filter(r => r.context === context && r.property === property);
    assert.equal(found.length, 1, `one ${context} ${property} declaration`);
    return found[0].value;
  };
  // Include compound/conditional selectors, but not descendants of the screen.
  const screenRows = rows.filter(r => r.context.split(',').some(s => /(?:\.screen(?:--[\w-]+)?|#screen)(?:[.#][\w-]+)*$/.test(s.trim())));
  const borders = screenRows.filter(r => /^(?:border(?:-|$)|margin-bottom$)/.test(r.property));
  assert.equal(borders.length, 0, `scroller must have no reserved/painted border band: ${borders.map(r => `${r.context} ${r.property}: ${r.value}`).join('; ')}`);
  assert.equal(value('.screen', 'overflow-y'), 'auto');
  assert.equal(value('.screen', 'min-height'), '0');
  assert.equal(value('.screen', 'padding'), 'calc(var(--sat) + 14px) var(--pad) 24px');
  assert.equal(value('.screen.screen--map', 'overflow-y'), 'auto');
  assert.equal(value('.sheet-body.map-sheet', 'flex'), '1 0 auto');
  assert.equal(value('.sheet-body.map-sheet', 'overflow'), 'visible');
  assert.equal(value('.screen--today', 'background-color'), 'var(--hero-edge, var(--bg))');
  assert.ok(!screenRows.some(r => /^(background|background-image)$/.test(r.property)), 'Today must keep a solid colour for native bounce, with no new background image');
  assert.equal(value('.tabbar', 'position'), 'relative');
  assert.equal(value('.tabbar', 'flex'), 'none');
  assert.equal(value('.tabbar', 'align-items'), 'center');
  assert.equal(value('.tabbar', 'padding'), '21px 10px calc(var(--sab) + 8px)', 'move the 13px exclusion into dock padding');
  assert.equal(value('.tabbar', 'background'), 'rgba(var(--dock-rgb), 0.84)', 'keep one translucent dock surface');
  assert.equal(value('.tabbar', 'backdrop-filter'), 'blur(22px)');
  assert.equal(value('#tabbar', 'border-top'), '2px solid rgba(242, 233, 215, .2)');
  assert.equal(value('#tabbar .fab', 'box-shadow'), 'var(--sh), 0 0 0 4px var(--bg)');
  const px = (context, property) => {
    const v = value(context, property);
    assert.match(v, /^-?[\d.]+px$/);
    return parseFloat(v);
  };
  const fabHeight = px('.fab', 'height'), margin = px('.fab', 'margin-top');
  const typeSize = (v, seen = new Set()) => {
    if (/^[\d.]+rem$/.test(v)) return parseFloat(v) * rootSize;
    const token = /^var\((--fs-[\w-]+)\)$/.exec(v);
    assert.ok(token && !seen.has(token[1]), `unresolved dock type: ${v}`);
    return typeSize(value(':root', token[1]), new Set([...seen, token[1]]));
  };
  const font = typeSize(value('.tab', 'font-size')), gap = px('.tab', 'gap'), icon = px('.tab svg', 'height');
  assert.equal(value('.tab', 'padding'), '4px 0');
  assert.equal(value('body', 'line-height'), '1.35');
  const content = Math.max(fabHeight + margin, icon + gap + font * 1.35 + 8);
  const top = 21 + 2 + (content - (fabHeight + margin)) / 2 + margin;
  const ringTop = top - 4;
  assert.ok(ringTop >= 0, `FAB ring intrudes ${-ringTop}px into the scrollport`);
  // Old geometry had an extra 13px screen border and 13px less dock padding.
  // For any viewport/safe-area bottom, content clip and FAB coordinates agree.
  for (const height of [667, 852]) for (const safeBottom of [0, 34]) {
    const oldDockTop = height - (2 + 8 + content + safeBottom + 8);
    const newDockTop = height - (2 + 21 + content + safeBottom + 8);
    assert.equal(newDockTop, oldDockTop - 13, 'preserve the content clip edge');
    assert.equal(newDockTop + top, oldDockTop + top - 13, 'preserve FAB position');
  }
  return ringTop;
}

try {
  const ringTop = grade(source);
  assert.ok(grade(source, 32) >= ringTop, 'CONTROL doubled text must not reduce modeled FAB clearance');
  for (const tab of tabs) console.log(`PASS SOURCE ${tab}: border band 0px; dock top padding 21px; modeled FAB ring clearance ${ringTop.toFixed(3)}px`);
  const controls = [
    ['Boneyard clipping', source.replace('padding: 0; overflow-y: auto;', 'padding: 0; overflow-y: hidden;')],
    ['Boneyard nested clip', source.replace('flex: 1 0 auto; padding: 0; overflow: visible;', 'flex: 1; padding: 0; overflow: hidden;')],
    ['real opaque-band regression', source + '\n.screen { border-bottom: 13px solid transparent; } .screen--today { border-bottom-color: rgb(var(--dock-rgb)); }'],
    ['original hero sliver', source + '\n.screen { border-bottom: 13px solid transparent; }'],
    ['lost exclusion', source.replace('padding: 21px 10px calc(var(--sab) + 8px)', 'padding: 8px 10px calc(var(--sab) + 8px)')],
    ['larger FAB overhang', source.replace('margin-top: -26px;', 'margin-top: -60px;')],
    ['map-only border', source + '\n.screen.screen--map { border-bottom: 13px solid black; }'],
  ];
  for (const [name, mutated] of controls) {
    assert.notEqual(mutated, source, `${name} CONTROL must apply`);
    assert.throws(() => grade(mutated), assert.AssertionError, name);
    console.log(`PASS CONTROL rejected ${name}`);
  }
  console.log('PASS SOURCE geometry preserves the content clip and FAB position at heights 667/852 and bottom insets 0/34');
  console.log('NOT RUN: rendered all-tab colours, row hit-testing and native bounce; pixel review is owed');
} catch (error) {
  console.error(`FAIL dock-line: ${error.message}`);
  process.exitCode = 1;
}

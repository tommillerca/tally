/* P2, R44-9/6/11/24. Node-only: execute the production Kennel renderer and
 * click handlers with DOM doubles. CSS rows are source guards, NOT pixel proof.
 * The companion browser audit owns compositing, keyboard and text reflow.
 * CONTROL: zero, partial and full ownership must each render all 30 buttons.
 * Prove red on a throwaway tree by restoring pre-P2 js/app.js and app.css.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { BH_BY_ID } from '../data/boneheadz.js';
import { MORPHS, MORPH_LABEL, MORPH_TIER, ownedPairs, ownedCellCount } from '../js/pets.js';

const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const start = source.indexOf('async function openKennel()');
const end = source.indexOf('\nif (typeof window', start);
assert(start >= 0 && end > start, 'CONTROL production renderer is present');
const species = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].map(id => BH_BY_ID[id]);
let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { failures++; console.log(`FAIL ${name}: ${e.message}`); }
}
const attr = html => Object.fromEntries([...html.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
async function render(instances) {
  const body = { innerHTML: '' }, labels = new Map(), cells = [], art = [];
  const context = vm.createContext({
    openSheet: () => ({}), petInstances: async () => instances,
    KENNEL_SPECIES: species, MORPHS, MORPH_LABEL, MORPH_TIER,
    ownedPairs, ownedCellCount, BH_BY_ID,
    esc: s => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;'),
    morphSwatch: m => ({ base: '#f2e9d7', ember: '#f0763a', frost: '#5fb8ec', toxic: '#8fd23c', midnight: '#6b4fc4' })[m],
    morphAsset: (sp, m) => `${sp}/${m}`,
    croppedPetImg: (sp, px, ground, src) => { art.push({ sp, px, src }); return '<img>'; },
    ICONS: { lock: () => '<svg></svg>' }, CSS: { escape: s => s },
    $: selector => selector === '#kennelBody' ? body : labels.get(selector.match(/data-sp="([^"]+)"/)?.[1]),
    $$: selector => {
      if (!cells.length) {
        for (const m of body.innerHTML.matchAll(/<span class="k-grid-label" data-sp="([^"]+)">([^<]*)/g)) labels.set(m[1], { textContent: m[2] });
        for (const m of body.innerHTML.matchAll(/<button\b[^>]*class="k-cell[^>]*>/g)) {
          const attrs = attr(m[0]);
          cells.push({ attrs, dataset: { sp: attrs['data-sp'], morph: attrs['data-morph'] },
            getAttribute: k => attrs[k], setAttribute: (k, v) => { attrs[k] = v; },
            addEventListener(event, fn) { assert.equal(event, 'click'); this.click = fn; } });
        }
      }
      const sp = selector.match(/data-sp="([^"]+)"/)?.[1];
      return sp ? cells.filter(c => c.dataset.sp === sp) : cells;
    },
  });
  await vm.runInContext(`${source.slice(start, end)}; openKennel()`, context);
  return { body, labels, cells, art };
}
for (const state of ['zero', 'partial', 'full']) {
  const instances = state === 'zero' ? [] : state === 'partial' ? [{ sp: 'C1', morph: 'base' }]
    : species.flatMap(s => MORPHS.map(morph => ({ sp: s.id, morph })));
  const r = await render(instances);
  check(`CONTROL ${state}: 30 real buttons`, () => assert.equal(r.cells.length, 30));
  check(`NAMES ${state}: 30 distinct species/colourway labels`, () => {
    assert.equal(new Set(r.cells.map(c => c.attrs['aria-label'])).size, 30);
    for (const c of r.cells) {
      assert(c.attrs['aria-label'].includes(BH_BY_ID[c.dataset.sp].name));
      assert(c.attrs['aria-label'].includes(c.dataset.morph === 'base' ? 'Base' : MORPH_LABEL[c.dataset.morph]));
      assert.equal(c.attrs['aria-label'].includes('Not hatched yet.'), c.attrs.class.includes('locked'));
    }
  });
  check(`CLICKS ${state}: every selection retains identity and toggles back`, () => {
    for (const c of r.cells) {
      const name = BH_BY_ID[c.dataset.sp].name;
      c.click();
      assert(r.labels.get(c.dataset.sp).textContent.includes(name), `lost ${name}`);
      assert.equal(c.attrs['aria-pressed'], 'true');
      const sibling = r.cells.find(o => o.dataset.sp === c.dataset.sp && o !== c);
      sibling.click();
      assert.equal(c.attrs['aria-pressed'], 'false');
      sibling.click();
      assert.equal(r.labels.get(c.dataset.sp).textContent, name);
    }
  });
  check(`SWATCHES ${state}: five labelled colours before ownership`, () => {
    const headers = [...r.body.innerHTML.matchAll(/<span class="k-grid-head-cell">([\s\S]*?)<\/span>/g)];
    assert.equal(headers.length, 5);
    headers.forEach((h, i) => { assert(h[1].includes('class="k-swatch"')); assert(h[1].includes(`data-morph="${MORPHS[i]}"`)); });
  });
  if (instances.length) check(`DOTS ${state}: colourway identity reaches each indicator`, () => {
    const dots = [...r.body.innerHTML.matchAll(/<i\b[^>]*class="k-dot[^>]*>/g)];
    assert.equal(dots.length, state === 'full' ? 30 : 5);
    dots.forEach((d, i) => assert.equal(attr(d[0])['data-morph'], MORPHS[i % 5]));
  });
  if (state === 'full') check('INTENT roster retains highest-tier portraits', () => {
    assert.equal(r.art.filter(a => a.src?.endsWith('/midnight')).length, 12);
  });
}
const rule = selector => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(m => m[1].split(',').map(s => s.trim()).includes(selector)).map(m => m[2]).join('\n');
check('DOT EDGE missing slots have a colour ring and visible neutral outline', () => {
  assert.match(rule('.k-dot'), /border:\s*2px solid var\(--kc/);
  assert.match(rule('.k-dot'), /outline:\s*1px solid var\(--text-3\)/);
  assert.match(rule('.k-dot.on'), /background:\s*var\(--kc/);
});
check('SHAPE Ember has a square cue distinct from round Toxic', () => {
  assert.match(rule('.k-dot[data-morph="ember"]'), /border-radius:\s*0/);
  assert.match(rule('.k-swatch[data-morph="ember"]'), /border-radius:\s*0/);
  assert.match(rule('.k-dot'), /border-radius:\s*50%/);
});
check('TEXT all three pet sheets opt into relative type', () => {
  for (const name of ['openKennel', 'openStable', 'openPaddock']) {
    const begin = source.indexOf(`async function ${name}(`);
    const next = source.indexOf('\nasync function ', begin + 1);
    const surface = source.slice(begin, next < 0 ? undefined : next);
    assert(surface.includes('pet-a11y'), `${name} has no type scope`);
    assert.doesNotMatch(surface, /font-size:[\d.]+px/, `${name} still pins inline text pixels`);
  }
  assert.match(rule('.pet-a11y'), /--fs-1:\s*\.75rem/);
  for (const selector of ['.k-grid-head-cell', '.k-grid-label', '.k-id b', '.k-cap', '.cf-cap b', '.pdk-name']) {
    assert.match(rule(selector), /font-size:\s*[\d.]+rem/, `${selector} must follow root size`);
    assert.doesNotMatch(rule(selector), /font-size:\s*[\d.]+px/, `${selector} still pins pixels`);
  }
});
console.log(`PET A11Y NODE: ${failures ? `${failures} failed` : 'all passed'} (no pixel claim)`);
process.exitCode = failures ? 1 : 0;

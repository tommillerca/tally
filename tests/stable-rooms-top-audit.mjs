/* Frozen Stable rooms: execute the production count and body code in Node.
 * CONTROL uses real ownership helpers and icon emitters. No layout/pixel claim.
 * --prove-red moves the Laboratory button below the album in the source passed
 * to the renderer, then runs the SAME grading function and must exit nonzero.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MORPHS, ownedPairs, ownedCellCount, PET_STAT_MULT_CAP } from '../js/pets.js';
import { BH_BY_ID } from '../data/boneheadz.js';
import { pixCur } from '../js/icons-pix.js';
import { bhIcon } from '../js/icons-pack.js';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
function block(from, to) {
  const a = app.indexOf(from), b = app.indexOf(to, a);
  assert(a >= 0 && b > a, `CONTROL production block exists: ${from}`);
  return app.slice(a, b);
}
let code = block('    const kennelOwned = ownedPairs(insts);', '\n    body.scrollTop = bodyScroll;');
const KENNEL_SPECIES = new Function('BH_BY_ID', block('const KENNEL_SPECIES =', '\n\n') + '\nreturn KENNEL_SPECIES;')(BH_BY_ID);
const t1Stroke = new Function(block('const t1Stroke =', '\nICONS.close') + '\nreturn t1Stroke;')();
const pawCode = app.match(/  paw: (.*),\n/)[1];
const paw = new Function('pixCur', `return (${pawCode});`)(pixCur);
const fallbackPaw = new Function('pixCur', `return (${pawCode});`)(() => null);

function render({ insts = [], labStock = null, picks = 0, fallback = false, opts = {} } = {}) {
  const body = { innerHTML: '', scrollTop: 0 };
  const empty = () => '';
  const scope = { body, insts, labStock, KENNEL_SPECIES, MORPHS, ownedPairs, ownedCellCount,
    rememberKin: empty, opts, st: { ready: true, dust: 0 }, pair: false,
    sel: insts.slice(0, picks).map(p => p.iid), roster: insts, cfWasPanelled: false,
    openIid: null, cfCards: '', cfWear: '', cfCaption: '', cfActs: '',
    PET_STAT_MULT_CAP, petPortraitHtml: empty,
    pixCur: fallback ? () => null : pixCur, bhIcon, t1Stroke,
    ICONS: { paw: fallback ? fallbackPaw : paw, dust: empty } };
  new Function(...Object.keys(scope), code)(...Object.values(scope));
  return body.innerHTML;
}

// Parse the generated markup into parent/child order without a browser. The
// controlled template has no scripts; comments and void elements are skipped.
function elements(html) {
  const root = { tag: 'root', children: [] }, stack = [root], all = [];
  for (const m of html.matchAll(/<!--[\s\S]*?-->|<\/?[a-z][a-z0-9-]*(?:\s+(?:[^>"']|"[^"]*"|'[^']*')*)?\s*\/?>/gi)) {
    const token = m[0];
    if (token.startsWith('<!--')) continue;
    const tag = token.match(/^<\/?([\w-]+)/)[1];
    if (token.startsWith('</')) {
      const node = stack.pop();
      assert.equal(node.tag, tag, 'generated DOM nesting is valid');
      node.html = html.slice(node.start, m.index + token.length);
      continue;
    }
    const attrs = Object.fromEntries([...token.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].slice(1).map(x => [x[1], x[2] ?? '']));
    const parent = stack.at(-1), node = { tag, attrs, parent, start: m.index, children: [], html: token };
    parent.children.push(node); all.push(node);
    if (!/\/>$/.test(token) && !['img', 'br', 'hr', 'input'].includes(tag)) stack.push(node);
  }
  assert.equal(stack.length, 1, 'generated DOM closes');
  return { root, all };
}
const hasClass = (node, name) => (node.attrs.class || '').split(' ').includes(name);
function grade(html, expected) {
  assert.doesNotMatch(html, /undefined|NaN/);
  const { root, all } = elements(html);
  const rows = all.filter(n => hasClass(n, 'stable-rooms'));
  assert.equal(rows.length, 1, 'one shared room row');
  const row = rows[0];
  const album = all.find(n => hasClass(n, 'cf'));
  assert.equal(root.children[0], row, 'rooms are first in the Stable body');
  const controls = [n => n.attrs.id === 'stableToPaddock', n => 'data-lab-open' in n.attrs, n => n.attrs.id === 'kennelBtn'];
  for (const [i, find] of controls.entries()) {
    const matches = all.filter(find);
    assert.equal(matches.length, 1, 'each existing control occurs exactly once');
    const tile = matches[0];
    if (album) assert(tile.start < album.start, 'all three room controls must precede the album');
    const waiting = all.find(n => hasClass(n, 'breed-waiting'));
    if (waiting) assert(tile.start < waiting.start, 'rooms precede the breed-waiting block');
    assert.equal(tile.parent, row, 'each room is inside the shared row');
    assert.equal(tile.tag, 'button'); assert.equal(tile.attrs.type, 'button');
    assert(hasClass(tile, 'stable-room'));
    assert.match(tile.html, new RegExp(`<b>${['Paddock', 'Laboratory', 'Kennel'][i]}</b>`));
    const small = tile.children.find(n => n.tag === 'small');
    assert.equal(small.html.replace(/<[^>]*>/g, ''), expected.counts[i], 'tile carries its live count');
    const picture = tile.children.find(n => hasClass(n, 'stable-room-picture'));
    assert(picture && picture.children.length === 1, 'one nonblank icon, never both treatments');
    const icon = picture.children[0];
    assert.equal(icon.tag, expected.fallback ? 'svg' : 'img');
    assert.equal(icon.attrs.width, '48'); assert.equal(icon.attrs.height, '48');
    if (!expected.fallback) assert.equal(icon.attrs.src, `assets/icons-pix/${['badge-signpost', 'potion', 'paw'][i]}.png`);
    if (i === 1) assert.equal(tile.children.some(n => hasClass(n, 'new-dot')), expected.dot, 'attention follows unseen results');
  }
  assert.equal(row.children.length, 3, 'exactly three tiles share the row');
  assert.doesNotMatch(row.html, /pdk-door-scene|kdoor-sw/, 'retired scene and battery strip are absent');
}

const pets = [
  { iid: 'a', sp: 'C1', morph: 'base' }, { iid: 'b', sp: 'C1', morph: 'base' },
  { iid: 'c', sp: 'C1', morph: 'frost' }, { iid: 'd', sp: 'C2', morph: 'base' },
  { iid: 'e', sp: 'C3', morph: 'base' },
];
const total = KENNEL_SPECIES.length * MORPHS.length;
if (process.argv.includes('--prove-red')) {
  const tile = code.match(/        <button class="stable-room" data-lab-open[\s\S]*?<\/button>/)?.[0];
  assert(tile, 'CONTROL mutation finds the Laboratory tile');
  const mutated = code.replace(tile, '').replace('      <details class="stable-help">', tile + '\n      <details class="stable-help">');
  assert.notEqual(mutated, code, 'CONTROL mutation applied'); code = mutated;
  console.log('RED CONTROL: moved Laboratory below the album in the production template');
}
for (const [name, options, counts, dot] of [
  ['populated ready', { insts: pets, labStock: { status: 'ready', remaining: 1, unseen: [] } }, ['5 pets', '1 today', `4 of ${total}`], false],
  ['waiting wins over capacity', { insts: pets, picks: 1, labStock: { status: 'ready', remaining: 3, unseen: [{}, {}] } }, ['5 pets', '2 waiting', `4 of ${total}`], true],
  ['empty first visit', { labStock: { status: 'ready', remaining: 3, unseen: [] } }, ['0 pets', '3 today', `0 of ${total}`], false],
  ['empty null engine', {}, ['0 pets', 'Unavailable', `0 of ${total}`], false],
  ['populated null engine', { insts: pets }, ['5 pets', 'Unavailable', `4 of ${total}`], false],
  ['daily limit', { insts: pets, labStock: { status: 'ready', remaining: 0, unseen: [] } }, ['5 pets', '0 today', `4 of ${total}`], false],
  ['unavailable snapshot', { labStock: { status: 'unavailable', remaining: 0, unseen: [] } }, ['0 pets', '0 waiting', `0 of ${total}`], false],
  ['recovering with results', { labStock: { status: 'unknown', remaining: 0, unseen: [{}] } }, ['0 pets', '1 waiting', `0 of ${total}`], true],
  ['single pet and lab entry hint', { insts: pets.slice(0, 1), picks: 1, opts: { labAction: 'melt' } }, ['1 pet', 'Unavailable', `1 of ${total}`], false],
]) {
  for (const fallback of [false, true]) grade(render({ ...options, fallback }), { counts, dot, fallback });
  console.log(`PASS CONTROL ${name}: ${counts.join(' / ')}; pixel and vector paths`);
}
// The actual retained wiring still calls the three destinations.
const callbacks = {};
const $ = selector => ({ addEventListener: (event, fn) => { assert.equal(event, 'click'); callbacks[selector] = fn; } });
let destination;
for (const [id, fn] of [['stableToPaddock', 'openPaddock'], ['kennelBtn', 'openKennel']]) {
  const line = app.split('\n').find(l => l.includes(`$('#${id}', body)?.addEventListener`));
  assert(line, `CONTROL retained handler ${id}`);
  new Function('$', 'body', fn, line)($, {}, () => { destination = fn; });
  callbacks[`#${id}`](); assert.equal(destination, fn);
}
assert.match(block('async function openStable(', '\nconst KENNEL_SPECIES ='), /wireLabLinks\(body\)/);
const labWire = app.split('\n').find(l => l.includes("$$('[data-lab-open]', root).forEach"));
new Function('$$', 'root', 'openLaboratory', labWire)(() => [$('[data-lab-open]')], {}, () => { destination = 'openLaboratory'; });
callbacks['[data-lab-open]'](); assert.equal(destination, 'openLaboratory');
assert.match(css, /#stableBody \.stable-rooms\s*\{[^}]*grid-template-columns: repeat\(3, 1fr\);[^}]*gap: 8px/);
assert.match(css, /#stableBody \.stable-room\s*\{[^}]*min-height: 105px/);
for (const icon of ['badge-signpost', 'potion', 'paw']) {
  const png = readFileSync(new URL(`../assets/icons-pix/${icon}.png`, import.meta.url));
  assert.equal(png.readUInt32BE(16), 48); assert.equal(png.readUInt32BE(20), 48);
}
console.log('PASS CONTROL original click handlers and three existing 48px assets');
console.log('STABLE ROOMS TOP: 18 rendered-template cases passed; visual result unverified, pixel review owed');

/* Frozen fix-wardrobe-noise, 2026-09-09. Execute production renderers and
 * refresh/click wiring with Node DOM doubles. No sockets or pixel claim.
 * CONTROL: every row fails against the original app.js. PREVIEW includes
 * returning to the current look, since merely arming already worked before.
 *
 * R9, 2026-09-10. ARRIVAL and PREVIEW originally required the bar to be ABSENT
 * whenever nothing was selected. Absence was the wrong proxy for quiet: it also
 * hid the second step, so a player could not see that a chosen look still had to
 * be worn (Tom: "transmog is unreachable, and one early return hides the second
 * step"). The quiet contract this audit exists to protect is unchanged and is
 * now asserted directly: at rest the bar carries no `armed` class, its control
 * is disabled and it exposes no commit action, so nothing is clickable and
 * nothing is spent. The rows still go red against the pre-R9 app, which renders
 * nothing at rest.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
function cut(start, end) {
  const a = app.indexOf(start), b = app.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `CONTROL missing production slice: ${start}`);
  return app.slice(a, b);
}
function room() {
  let html = '', button = null, rebuilds = 0, applies = 0;
  const content = {}, panel = {}, figs = { innerHTML: '' };
  function replace(value) {
    html = value;
    const m = html.match(/<button[^>]*data-look-apply="([^"]*)"[^>]*data-look-price="([^"]*)"/);
    button = m ? { dataset: { lookApply: m[1], lookPrice: m[2] },
      addEventListener(type, fn) { this[type] = fn; } } : null;
  }
  const bar = { set outerHTML(value) { replace(value); } };
  const dock = { insertAdjacentHTML(where, value) {
    assert.equal(where, 'beforeend'); assert.equal(html, ''); replace(value);
  } };
  const tiles = ['', 'other', '__hide__'].map(id => ({ dataset: { look: id },
    classList: { toggle() {} }, addEventListener(type, fn) { this[type] = fn; } }));
  const ctx = vm.createContext({
    S: { mogv2: true, lookPreview: null }, GEAR_SLOTS: ['H'], slot: 'H', baseArtId: 'worn',
    tm: {}, dustBal: 20, look: { H: 'worn' }, lookPriceMap: { other: 6 }, slotArts: [],
    TRANSMOG_HIDE: '__hide__', wornGear: null, ownArt: { name: 'Worn hat' },
    BH_BY_ID: { other: { name: 'Other hat' } }, ICONS: { dust: () => '', chev: () => '' },
    esc: String, avatarLayersHtml: () => '', previewEq: () => ({}), content, wrap: {},
    restageDoll: async () => true, restageWardrobe: async () => true,
    transmogMap: async () => ctx.tm, boneDust: async () => ctx.dustBal, equipped: async () => ctx.look,
    renderCharacter: () => { rebuilds++; }, popSound() {},
    applyLook: () => { applies++; },
    armToConfirm: (b, label, fn) => { b.confirmLabel = label; b.click = fn; },
    $: (sel, root) => {
      if (root !== content) return null;
      return ({ '.mog-panel': panel, '.mog-figs': figs, '.mog-dock': dock,
        '.mog-dock > .mog-bar': html ? bar : null })[sel] || null;
    },
    $$: (sel, root) => sel === '[data-look]' ? tiles : sel === '[data-look-apply]' && button ? [button] : [],
  });
  vm.runInContext(cut('    const mogOn =', '\n    /* ================= THE COLOURWAY'), ctx);
  vm.runInContext(cut('    async function restageLook(', '\n    // Tap a look'), ctx);
  vm.runInContext(cut('    function wireMogBar()', '\n    wireMogBar();'), ctx);
  vm.runInContext(cut('    const wireLook =', '\n    /* The Dressing Room'), ctx);
  replace(vm.runInContext('mogBarHtml()', ctx));
  return { ctx, get html() { return html; }, get button() { return button; },
    get rebuilds() { return rebuilds; }, get applies() { return applies; },
    async pick(id) {
      tiles.find(t => t.dataset.look === id).click();
      // restageLook is intentionally fire-and-forget in the shipped handler.
      await new Promise(resolve => setImmediate(resolve));
    },
    commit: () => vm.runInContext('restageLook({ committed: true })', ctx),
  };
}
function fits(fitList) {
  return vm.runInNewContext(cut('    const fitRail =', '\n    content.innerHTML =') + '\nfitRail;', {
    fitList, fitPrices: fitList.map(() => 0), fitThumbArt: () => null, S: {},
    esc: String, MAX_FITS: 6, stripPlan: { slots: [], mogs: [] }, ICONS: {},
  });
}
const instruction = 'Tap a fit to wear it. A fit brings its gear back to empty slots and never bumps gear you are already wearing. Long-press a fit to rename or bin it.';
const warning = 'Fits saved a while ago remember only the look. Put one on, gear up, and save it again to keep the gear with it.';
function help(html, expected) {
  const disclosures = [...html.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];
  const disclosure = disclosures.find(m => /class="[^"]*\bstable-help\b/.test(m[1]));
  assert(disclosure, 'fits instructions must be inside a stable-help disclosure');
  assert.doesNotMatch(disclosure[1], /\bopen(?:\s|=|$)/);
  assert.match(disclosure[2], /<summary>How fits work<\/summary>/);
  for (const text of expected) assert(disclosure[2].includes(`<p class="note fit-note">${text}</p>`));
  assert.doesNotMatch(html.replace(disclosure[0], ''), /class="note fit-note"/);
  assert.match(css, /#chContent \.stable-help summary/);
}
// At rest the bar is present but inert: unarmed, disabled, no commit action.
function idle(html, why) {
  assert.match(html, /class="look-bar mog-bar"/, `${why}: the resting bar must render unarmed`);
  assert.match(html, /<button[^>]* disabled>Wear it<\/button>/, `${why}: the resting control must be disabled`);
  assert.doesNotMatch(html, /data-look-apply=/, `${why}: the resting bar must expose no commit action`);
}
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}: ${error.message}`); }
}
await test('ARRIVAL shows the second step at rest, inert, including an existing transmog', () => {
  const r = room(); idle(r.html, 'arrival');
  r.ctx.tm.H = 'other'; idle(vm.runInContext('mogBarHtml()', r.ctx), 'arrival with an existing transmog');
  // lookPreview equal to the existing transmog is not a change: still at rest.
  r.ctx.S.lookPreview = 'other'; idle(vm.runInContext('mogBarHtml()', r.ctx), 'arrival on the worn look');
});
await test('PREVIEW arms and wires the dock bar, returns it to rest on revert/commit, and rearms without rebuilding', async () => {
  const r = room(); await r.pick('other');
  assert.match(r.html, /class="look-bar mog-bar armed"/);
  assert.equal(r.button?.dataset.lookApply, 'other');
  assert.equal(r.button?.confirmLabel, 'Spend 6 dust?');
  r.button.click(); assert.equal(r.applies, 1);
  await r.pick(''); idle(r.html, 'returning to the current look');
  assert.equal(r.button, null, 'the reverted bar carries no commit action');
  await r.pick('__hide__'); assert.equal(r.button?.dataset.lookPrice, '0');
  r.button.click(); assert.equal(r.applies, 2, 'free action has a live click handler');
  r.ctx.tm.H = '__hide__'; r.ctx.S.lookPreview = null; await r.commit();
  idle(r.html, 'after commit');
  r.ctx.dustBal = 0; await r.pick('other');
  assert.match(r.html, /disabled>Need 6 more dust/); assert.equal(r.button, null);
  r.ctx.dustBal = 20; await r.pick('other'); assert(r.button);
  assert.equal(r.rebuilds, 0, 'restaging the bar must not trigger a full room rebuild');
  assert.match(app, /\$\{mogBarHtml\(\)\}\s*<\/div>/);
  assert.match(css, /\.mog-dock > \.look-bar\.mog-bar\s*\{[^}]*position:\s*sticky;\s*bottom:\s*0/);
});
await test('FITS current-fit copy is verbatim inside closed house-style help', () => {
  const html = fits([{ id: 'new', name: 'New', gear: {} }]);
  help(html, [instruction]); assert(!html.includes(warning));
  assert(!fits([]).includes('<details'), 'no empty help without fits');
});
await test('FITS legacy warning stays verbatim inside the same closed help', () => {
  help(fits([{ id: 'old', name: 'Old' }, { id: 'new', name: 'New', gear: {} }]), [instruction, warning]);
});
await test('LEGACY sibling bar is absent until changed and keeps its live action', () => {
  const source = cut('        <div class="look-bar${changed', '\n        <p class="note" style="text-align:center;margin-top:8px">');
  // Include the new conditional when present; the original remains executable.
  const start = app.indexOf(source);
  const prefix = app.slice(start - 16, start);
  const expression = prefix.endsWith('${changed ? `\n') ? '${changed ? `\n' + source : source;
  const render = changed => vm.runInNewContext('`' + expression + '`', {
    changed, afford: true, sel: 'other', cost: 6, dustBal: 20, esc: String, nameOf: () => 'Other hat',
  });
  assert.equal(render(false).trim(), '');
  assert.match(render(true), /class="look-bar armed"/);
  assert.match(render(true), /data-look-apply="other"/);
});
console.log(`WARDROBE NOISE: ${5 - failed} passed, ${failed} failed. Node only; pixel review owed.`);
process.exitCode = failed ? 1 : 0;

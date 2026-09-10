// PURE: production handlers and decoded raster output. No browser feel claim.
// STUDIO_V3_BASELINE=1 runs the identical guard against the frozen input sources.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { auditOutputPath } from './lib/audit-output.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importAuditPackage } from './lib/audit-dependencies.mjs';
import { BH_ITEMS, BH_SLOTS } from '../data/boneheadz.js';
const root = new URL('../', import.meta.url);
const original = async (name, overrides = {}) => {
  const source = readFileSync(new URL(`docs/reviews/studio-v3/baseline-${name}.txt`, root), 'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'), name === 'compositor'
    ? '0dc76c4ca87b00a423d94f0e76a8435377403ab709370a8a6d5d33b34046567a'
    : '78a177980e8f1824384ca8ddbb77f403e8b3711230d43230f1ed8cddb4a202c8', 'frozen input source identity');
  const text = source.replace(/from '([^']+)'/g, (_, p) => `from '${overrides[p] || new URL(p, new URL('js/studio.js', root)).href}'`);
  const url = 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
  return { url, module: await import(url) };
};
const frozen = await original('compositor');
const baseline = !!process.env.STUDIO_V3_BASELINE;
// Reachability rows read the shipped CSS and screen source directly; in baseline
// mode they read the frozen screen source, so the rows go red against v556.
const css = readFileSync(new URL('app.css', root), 'utf8');
const app_screen = baseline
  ? readFileSync(new URL('docs/reviews/studio-v3/baseline-screen.txt', root), 'utf8')
  : readFileSync(new URL('js/studio-screen.js', root), 'utf8');
const studio = baseline ? frozen.module : await import('../js/studio.js');
const { mountStudio } = baseline ? (await original('screen', { './studio.js': frozen.url })).module : await import('../js/studio-screen.js');
const { createCanvas, loadImage, GlobalFonts } = await importAuditPackage('@napi-rs/canvas');
GlobalFonts.registerFromPath(new URL('assets/fonts/bangers.woff2', root).pathname, 'StudioBangers');
GlobalFonts.registerFromPath(new URL('assets/fonts/boldpixels.woff2', root).pathname, 'StudioDialogue');
const runtime = { createCanvas, loadImage: src => loadImage(new URL(src, root).pathname), ready: async () => {},
  encode: async c => new Blob([await c.encode('png')], { type: 'image/png' }) };
const outfit = Object.fromEntries(BH_SLOTS.filter(s => !['BG', 'C'].includes(s.code)).map(s => [s.code, s.default || BH_ITEMS.find(i => i.slot === s.code)?.id]).filter(([, id]) => id));
const look = { outfit, pet: { id: 'C1', shiny: true, morph: 'base', wear: null } };
const rgba = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
const hash = c => createHash('sha256').update(rgba(c)).digest('hex');
const palette = c => { const d = rgba(c), set = new Set(); for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 14) set.add(d.slice(i, i + 4).join(',')); return set; };
const decode = async blob => { const im = await loadImage(Buffer.from(await blob.arrayBuffer())); const c = createCanvas(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); return c; };
let passed = 0, failed = 0;
const check = async (name, fn) => { try { await fn(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, e.message.slice(0, 1500)); } };
await check('four named creatures use original static art', () => {
  assert.deepEqual(studio.STUDIO_MONSTERS, ['The Wanderer', 'The Mimic', 'The Glutton', 'Gwart']);
  assert.deepEqual(Object.values(studio.STUDIO_CREATURES), ['assets/bh/wanderer/wanderer.png', 'assets/bh/mimic/mimic.png', 'assets/bh/glutton/idle.png', 'assets/gwart/gwart.png']);
  for (const id of studio.STUDIO_MONSTERS) {
    const s = studio.studioPlan(look, { stickers: [{ kind: 'monster', id, x: 540, y: 950, size: 180, flip: false }] }).stickers[0];
    assert.equal(s.layers.length, 1); assert.equal(s.layers[0].src, studio.STUDIO_CREATURES[id]);
  }
});
await check('CONTROL 12px disk dilation follows alpha, including concavity and holes', async () => {
  assert.equal(studio.STUDIO_OUTLINE, 12);
  const c = createCanvas(180, 180), cx = c.getContext('2d');
  cx.fillStyle = '#f3efe7'; cx.fillRect(0, 0, 180, 20); cx.fillRect(0, 0, 20, 180); cx.fillRect(160, 160, 20, 20);
  const f = { canvas: c, ink: studio.studioInk(c) };
  const edge = studio.studioRasterSticker(f, { x: 0, y: 0, size: 650, flip: false, rotation: 45 }, runtime);
  studio.assertStudioSafe([{ id: 'square at safe limit', ...edge.box }]);
  assert.equal(edge.box.width, 950); assert.ok(edge.box.fittedSize < 650 && edge.box.fittedSize > 649);
  console.log('SAFE SIZE square at 45 degrees:', edge.box.fittedSize);
  const r = studio.studioRasterSticker(f, { x: 540, y: 950, size: 180, flip: false }, runtime);
  const w = r.art.width, h = r.art.height;
  // Independent brute force distance-to-alpha oracle, not a production helper.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let expected = 0;
    outer: for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
      if (dx * dx + dy * dy > 144 || x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h) continue;
      if (r.mask[(y + dy) * w + x + dx]) { expected = 1; break outer; }
    }
    assert.equal(r.dilated[y * w + x], expected, `alpha dilation at ${x},${y}`);
  }
  const d = rgba(await decode(await runtime.encode(r.decoration)));
  assert.equal(d[(100 * w + 100) * 4 + 3], 0, 'interior empty space is not a rectangular card');
  assert.deepEqual([...d.slice(12 * 4, 12 * 4 + 4)], [42, 45, 40, 255]);
  assert.equal(d[(0 * w + 0) * 4 + 3], 0, 'disk corner stays transparent');
});
await check('every offered kind retains visible artwork and safe outlines through scale, mirror and twist', async () => {
  assert.equal(typeof studio.studioRasterSticker, 'function');
  const entries = [...studio.STUDIO_MONSTERS.map(id => ({ kind: 'monster', id })), { kind: 'crew', outfit },
    ...Object.keys(studio.STUDIO_TEXT_STICKERS).map(id => ({ kind: 'text', id }))];
  const sheet = createCanvas(1200, entries.length * 240), sx = sheet.getContext('2d');
  sx.fillStyle = '#F3EFE7'; sx.fillRect(0, 0, sheet.width, sheet.height);
  for (const [index, entry] of entries.entries()) {
    const sticker = { ...entry, x: 540, y: 950, size: 180, flip: false };
    const f = await studio.studioStickerFigure(sticker, runtime), input = palette(f.canvas);
    assert.ok(input.size); let worst = { count: Infinity };
    // Survey every integer angle in one quadrant. Counts repeat on quarter turns.
    for (let rotation = 0; rotation < 90; rotation++) {
      const r = studio.studioRasterSticker(f, { ...sticker, rotation }, runtime);
      const output = palette(r.art);
      assert.ok(output.size);
      if (output.size < worst.count) worst = { angle: rotation, count: output.size };
    }
    for (const size of [180, 650]) for (const rotation of [0, worst.angle, 137.5]) for (const flip of [false, true]) {
      const r = studio.studioRasterSticker(f, { ...sticker, size, rotation, flip }, runtime);
      const art = await decode(await runtime.encode(r.art));
      assert.ok(palette(art).size, 'decoded artwork remains visible; softness guarded in studio-v4-audit');
      const allAlphaInk = canvas => {
        const d = rgba(canvas); let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (d[(y * canvas.width + x) * 4 + 3]) {
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
      };
      const artInk = allAlphaInk(art), border = await decode(await runtime.encode(r.decoration)), ink = allAlphaInk(border);
      assert.equal(artInk.x - ink.x, 12); assert.equal(artInk.y - ink.y, 12);
      assert.equal(ink.x + ink.width - artInk.x - artInk.width, 20);
      assert.equal(ink.y + ink.height - artInk.y - artInk.height, 22);
      studio.assertStudioSafe([{ id: 'sticker', ...r.box }]);
    }
    const r = studio.studioRasterSticker(f, { ...sticker, rotation: worst.angle }, runtime);
    sx.drawImage(r.decoration, 10, index * 240); sx.drawImage(r.art, 10, index * 240);
    sx.fillStyle = '#2A2D28'; sx.font = '20px sans-serif';
    sx.fillText(`${entry.id || 'Crew'}: ${input.size} in, ${worst.count} out at ${worst.angle} degrees, 180px`, 310, index * 240 + 90);
    console.log('ROTATION', JSON.stringify({ name: entry.id || 'Crew', input: input.size, zero: palette(studio.studioRasterSticker(f, sticker, runtime).art).size, worst }));
  }
  if (process.env.STUDIO_V3_ARTIFACTS) {
    writeFileSync(auditOutputPath(join(tmpdir(), 'studio-v3-rotation-survey.png')), await sheet.encode('png'));
    const example = createCanvas(1000, 950), ex = example.getContext('2d'); ex.fillStyle = '#F3EFE7'; ex.fillRect(0, 0, 1000, 950);
    const sticker = { kind: 'monster', id: 'The Wanderer', x: 540, y: 950, size: 180, flip: false, rotation: 26 };
    const f = await studio.studioStickerFigure(sticker, runtime);
    for (const [size, x, y] of [[180, 10, 10], [650, 200, 170]]) {
      const r = studio.studioRasterSticker(f, { ...sticker, size }, runtime);
      ex.drawImage(r.decoration, x, y); ex.drawImage(r.art, x, y);
    }
    ex.fillStyle = '#2A2D28'; ex.font = '20px sans-serif'; ex.fillText('180px and 650px art, 12px alpha outline at both sizes', 270, 70);
    writeFileSync(auditOutputPath(join(tmpdir(), 'studio-v3-outline-sizes.png')), await example.encode('png'));
  }
});
await check('decoded no-sticker export preserves geometry and backing with smooth sampling', async () => {
  const old = await frozen.module.composeStudio(look, {}, runtime), now = await studio.composeStudio(look, {}, runtime);
  const before = await decode(old.blob), after = await decode(now.blob);
  for (const b of now.bounds) {
    const previous = old.bounds.find(p => p.id === b.id);
    assert.ok(Math.abs(b.width / previous.width - 1) < .01 && Math.abs(b.height / previous.height - 1) < .01,
      'smooth alpha bounds stay within 1% of original figure geometry');
  }
  const d = rgba(after), occupied = new Uint8Array(1080 * 1920); let ink = 0, outside = 0;
  for (let y = 0; y < 1920; y++) for (let x = 0; x < 1080; x++) {
    const i = (y * 1080 + x) * 4;
    if (d[i] === 243 && d[i + 1] === 239 && d[i + 2] === 231) continue;
    occupied[y * 1080 + x] = 1;
    if (x >= 65 && x < 1015 && y >= 270 && y < 1540) ink++; else outside++;
  }
  assert.equal(outside, 0);
  const queue = new Int32Array(occupied.length); let largest = { count: 0 };
  for (let start = 0; start < occupied.length; start++) {
    if (!occupied[start]) continue;
    let head = 0, end = 1, left = 1080, right = 0, top = 1920, bottom = 0;
    queue[0] = start; occupied[start] = 0;
    while (head < end) {
      const p = queue[head++], x = p % 1080, y = Math.floor(p / 1080);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, i = ny * 1080 + nx;
        if (nx < 0 || nx >= 1080 || ny < 0 || ny >= 1920 || !occupied[i]) continue;
        occupied[i] = 0; queue[end++] = i;
      }
    }
    if (end > largest.count) largest = { count: end, x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  }
  assert.ok(largest.count > 0);
  const largestComponentBoxPercent = largest.width * largest.height / (950 * 1270) * 100;
  if (process.env.STUDIO_V3_ARTIFACTS) writeFileSync(auditOutputPath(join(tmpdir(), 'studio-v3-fixture-export.png')), Buffer.from(await now.blob.arrayBuffer()));
  const brand = now.information.find(b => b.id === 'brand'), x = brand.x + 4, y = brand.y + 4;
  const i = (y * 1080 + x) * 4;
  assert.deepEqual([...d.slice(i, i + 3)], [42, 45, 40]);
  const lum = rgb => rgb.reduce((sum, v, j) => { v /= 255; return sum + [0.2126, 0.7152, 0.0722][j] * (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); }, 0);
  const backing = (lum([243, 239, 231]) + .05) / (lum([...d.slice(i, i + 3)]) + .05);
  assert.ok(backing >= 7.58); assert.ok(now.markContrast.minimum >= 4.5);
  console.log('EXPORT', JSON.stringify({ inkPercent: ink / (950 * 1270) * 100, largestComponentBoxPercent, largest, outside, opaqueLetterContrast: now.markContrast.minimum, backingAgainstPlainPage: backing, decodedSha256: hash(after) }));
});
await check('production pointer and keyboard routes change stored transforms and decoded pixels before release', async () => {
  const elements = new Map(); let markup = '', latest, jobs = [], renders = 0;
  const el = { set innerHTML(html) {
    markup = html;
    for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
      const canvas = createCanvas(1080, 1920);
      // classList: the real handler toggles `grabbing` on the stage so the canvas
      // only claims the touch gesture while a sticker is selected (v557). Executing
      // the production route needs the real collaborator; asserted below.
      const classes = new Set();
      elements.set(id, { style: {}, hidden: new RegExp(`id="${id}"[^>]*\\bhidden`).test(html), disabled: false, attributes: {}, captures: new Set(),
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
          toggle: (c, on) => { const want = on === undefined ? !classes.has(c) : !!on; want ? classes.add(c) : classes.delete(c); return want; } },
        get width() { return canvas.width; }, set width(v) { canvas.width = v; }, get height() { return canvas.height; }, set height(v) { canvas.height = v; },
        canvas, getContext: () => canvas.getContext('2d'), setAttribute(k, v) { this.attributes[k] = v; }, decode: async () => {}, focus() {},
        setPointerCapture(id) { this.captures.add(id); }, hasPointerCapture(id) { return this.captures.has(id); }, releasePointerCapture(id) { this.captures.delete(id); },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1080, height: 1920 }), showModal() {}, close() {} });
    }
  }, querySelector: id => elements.get(id.slice(1)) };
  const draft = {}, q = id => elements.get(id);
  const dispose = mountStudio(el, { look, draft, crew: [{ label: 'Friend', outfit }], ownedBackdrops: new Set(), thumbnailRuntime: runtime, onBack() {},
    compose(l, o) { renders++; const job = studio.composeStudio(l, o, runtime).then(r => latest = r); jobs.push(job); return job; } });
  const settle = async () => { for (let i = 0; i < 100; i++) { await Promise.all(jobs); await new Promise(r => setImmediate(r)); if (!q('studioClean').disabled) return; } throw Error('render did not settle'); };
  const event = (pointerId, x, y) => ({ pointerId, clientX: x, clientY: y, preventDefault() {}, button: 0 });
  const stage = q('studioStage');
  try {
    await settle();
    for (const name of ['onpointerdown', 'onpointermove', 'onpointerup', 'onpointercancel', 'onlostpointercapture', 'onkeydown']) assert.equal(typeof stage[name], 'function', name);
    assert.match(markup, /id="studioAccessible"/); assert.match(markup, /aria-label="Place The Wanderer"/);
    q('studioTrayToggle').onclick(); q('studioMonster-0').onclick();
    assert.equal(q('studioTrayBody').hidden, true, 'one-tap placement closes tray'); await settle();
    q('studioBackLayer').onclick(); await settle();
    assert.deepEqual(draft.layerOrder, ['pet', 'sticker-0', 'body']);
    q('studioBackLayer').onclick(); await settle();
    assert.deepEqual(draft.layerOrder, ['sticker-0', 'pet', 'body']);
    q('studioForward').onclick(); await settle(); q('studioForward').onclick(); await settle();
    assert.deepEqual(draft.layerOrder, ['pet', 'body', 'sticker-0']);
    const hit = () => {
      const b = latest.bounds.find(b => b.id === 'sticker-0'), r = latest.figures[0].raster, d = rgba(r.art);
      let i = Math.floor(r.art.height / 2) * r.art.width;
      while (!d[i * 4 + 3]) i++;
      return [b.x + i % r.art.width + .5, b.y + Math.floor(i / r.art.width) + .5];
    };
    let [x, y] = hit(); const start = { ...draft.stickers[0] }, count = renders;
    stage.onpointerdown(event(1, x, y)); stage.onpointermove(event(1, x + 70, y + 50));
    assert.ok(Math.abs(draft.stickers[0].x - start.x - 70) <= 1); assert.ok(Math.abs(draft.stickers[0].y - start.y - 50) <= 1);
    assert.equal(renders, count, 'movement does not await another async composition');
    assert.equal(q('studioLive').hidden, false); assert.equal(q('studioBin').hidden, false);
    const moved = hash(q('studioLive').canvas);
    stage.onpointermove(event(1, x + 90, y + 50)); assert.notEqual(hash(q('studioLive').canvas), moved, 'pixels change before release');
    stage.onpointerup(event(1, x + 90, y + 50)); await settle();
    assert.equal(hash(q('studioLive').canvas), hash(await decode(latest.blob)), 'gesture pixels equal decoded export');
    [x, y] = hit(); stage.onpointerdown(event(1, x, y)); stage.onpointerdown(event(2, x + 100, y));
    stage.onpointermove(event(2, x + 150, y)); assert.equal(draft.stickers[0].size, 600);
    stage.onpointermove(event(2, x, y + 150)); assert.ok(Math.abs(draft.stickers[0].rotation - 90) < 1e-6);
    stage.onpointerup(event(2, x, y + 150)); const single = { ...draft.stickers[0] };
    stage.onpointermove(event(1, x + 10, y + 10)); assert.ok(Math.abs(draft.stickers[0].x - single.x - 10) <= 1);
    stage.onpointerup(event(1, x + 10, y + 10)); await settle();
    for (const cancel of ['onpointercancel', 'onlostpointercapture']) {
      [x, y] = hit(); const before = { ...draft.stickers[0] };
      stage.onpointerdown(event(3, x, y)); stage.onpointermove(event(3, x + 50, y)); stage[cancel](event(3, x + 50, y)); await settle();
      assert.ok(Math.abs(draft.stickers[0].x - before.x) <= 1); assert.equal(stage.captures.size, 0);
    }
    const key = k => stage.onkeydown({ key: k, target: stage, preventDefault() {} });
    key('Escape'); key('Enter'); key('f'); await settle(); assert.equal(draft.stickers[0].flip, true);
    key(']'); await settle(); assert.ok(Math.abs(draft.stickers[0].rotation - 105) < 1e-6);
    key('-'); await settle(); assert.equal(draft.stickers[0].size, 560);
    key('ArrowLeft'); await settle();
    assert.equal(stage.classList.contains('grabbing'), true, 'a selected sticker makes the canvas claim the gesture');
    stage.onpointerdown(event(4, 10, 10)); assert.equal(q('studioSelection').hidden, true, 'empty canvas deselects');
    assert.equal(stage.classList.contains('grabbing'), false, 'deselecting gives the scroll gesture back to the page');
    [x, y] = hit(); stage.onpointerdown(event(5, x, y)); stage.onpointermove(event(5, 540, 1780));
    assert.equal(q('studioBin').attributes['data-active'], 'true'); stage.onpointerup(event(5, 540, 1780)); await settle();
    assert.equal(draft.stickers.length, 0, 'drag to bin deletes');
    q('studioText-feed').onclick(); await settle(); key('Delete'); await settle(); assert.equal(draft.stickers.length, 0);
    console.log('HANDLERS stored move, live pixels, pinch 400->600, twist 0->90, rebase, cancel, capture loss, bin, keyboard all exercised');
  } finally { dispose(); }
});
/* REACHABILITY, added 2026-09-10 after v556 shipped a Studio Tom called
   "actually bricked". Two independent causes, both source-level, both guarded
   here so neither can come back quietly:

   1. `.studio-preview` carried a blanket `touch-action: none`. It fills 398x708
      of a 430x932 phone, so three quarters of the screen refused to scroll.
   2. The tray handle sat in normal flow while the tray was closed, landing at
      y 821..877 against a tab bar that starts at 852. It overlapped the
      navigation by 25px, below the fold, and it is the ONLY door to the
      stickers. Between them the screen was a dead end.

   These are CSS contracts, not rendered claims: the browser measurement that
   found this lives with the operator. Both rows go red against v556. */
await check('REACH the canvas leaves the scroll gesture alone unless a sticker is selected', () => {
  const rule = css.match(/\.studio-preview \{([^}]*)\}/)?.[1] || '';
  assert.ok(rule.includes('touch-action'), 'the preview must state a touch-action');
  assert.doesNotMatch(rule, /touch-action:\s*none/, 'a blanket touch-action:none blocks the page scroll over most of the screen');
  assert.match(rule, /touch-action:\s*pan-y/, 'vertical scrolling must survive over the picture');
  const grab = css.match(/\.studio-preview\.grabbing \{([^}]*)\}/)?.[1] || '';
  assert.match(grab, /touch-action:\s*none/, 'pinch and twist still need the raw stream while a sticker is selected');
  assert.match(app_screen, /classList\.toggle\('grabbing', selected >= 0\)/, 'the class must follow the real selection state');
});
await check('REACH the tray handle is never underneath the tab bar', () => {
  const closed = css.match(/\.studio-tray:not\(\[data-open="true"\]\) \{([^}]*)\}/)?.[1] || '';
  assert.match(closed, /position:\s*fixed/, 'the closed handle must not sit in flow below the fold');
  assert.match(closed, /bottom:\s*calc\(80px \+ var\(--sab\)\)/, 'it must clear the tab bar and the safe-area inset, the same way the open tray does');
});
console.log(`${passed} passed, ${failed} failed. Interaction feel is unproven and operator-owned.`);
process.exitCode = failed ? 1 : 0;

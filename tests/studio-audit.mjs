// PURE: real PNG decode, Canvas rasterisation and encoding in Node. No browser,
// server or screen. Native permission sheets and visual quality remain unproven.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { importAuditPackage } from './lib/audit-dependencies.mjs';
import { BH_ITEMS, BH_SLOTS, BH_BY_ID, PET_SLOTS, bhAsset, petWornItems } from '../data/boneheadz.js';
import { composeStudio, studioPlan, assertStudioSafe, assertStudioPng, STUDIO_FRAMES, STUDIO_CAPTIONS, STUDIO_POSITIONS, STUDIO_MARK_POSITIONS, STUDIO_MONSTERS, STUDIO_TEXT_STICKERS, studioCrewAppearance, studioInk } from '../js/studio.js';
import { saveStudioImage, studioSaveMode } from '../js/studio-save.js';
import { mountStudio } from '../js/studio-screen.js';

const source = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const bytes = async blob => Buffer.from(await blob.arrayBuffer());
const digest = b => createHash('sha256').update(b).digest('hex');
const root = fileURLToPath(new URL('../', import.meta.url));

export async function checkStudio() {
  const { createCanvas, loadImage, GlobalFonts } = await importAuditPackage('@napi-rs/canvas');
  assert.ok(GlobalFonts.registerFromPath(root + 'assets/fonts/bangers.woff2', 'StudioBangers'), 'required font decodes');
  assert.ok(GlobalFonts.registerFromPath(root + 'assets/fonts/boldpixels.woff2', 'StudioDialogue'));
  const runtime = { createCanvas, loadImage: src => loadImage(root + src), ready: async () => {},
    encode: async c => new Blob([await c.encode('png')], { type: 'image/png' }) };
  const outfit = Object.fromEntries(BH_SLOTS.filter(s => !['BG', 'C'].includes(s.code))
    .map(s => [s.code, s.default || BH_ITEMS.find(i => i.slot === s.code)?.id]).filter(([, id]) => id));
  const look = { outfit, pet: { id: 'C1', shiny: true, morph: 'base', wear: null }, friendCode: 'BONE-ABCD-EFGH' };
  const plain = await composeStudio(look, {}, runtime);
  assert.ok(plain.bounds.find(b => b.id === 'body').height > 1000, 'V2 figure must grow materially inside the unchanged safe band');
  const first = await bytes(plain.blob);
  const second = await bytes((await composeStudio(look, {}, runtime)).blob);
  assert.deepEqual(first, second, 'same input must produce byte-stable PNG');
  const decoded = await loadImage(first);
  assert.deepEqual([decoded.width, decoded.height], [1080, 1920]);
  assert.equal(plain.plan.frame, null); assert.equal(STUDIO_FRAMES.length, 0);
  assert.ok(plain.plan.layers.length > 10, 'nonempty representative stack');
  assert.deepEqual(plain.plan.layers.filter(l => l.group === 'body').map(l => l.slot),
    ['B', 'S', 'FW', 'U', 'P', 'T', 'IL', 'IR', 'SK', 'E', 'G', 'M', 'H']);
  assert.ok(plain.plan.layers.find(l => l.slot === 'C').src.includes('/shiny/C1.png'));
  const reverse = structuredClone(plain.plan.layers.filter(l => l.group === 'body')).reverse();
  assert.throws(() => assert.deepEqual(reverse.map(l => l.slot), ['B', 'S', 'FW', 'U', 'P', 'T', 'IL', 'IR', 'SK', 'E', 'G', 'M', 'H']), 'CONTROL reversed z order must fail');
  const explicitOff = await composeStudio(look, { includeFriendCode: false }, runtime);
  assert.deepEqual(await bytes(explicitOff.blob), first);
  assert.ok(!plain.plan.text.some(t => t.id === 'friend-code'));
  const code = await composeStudio(look, { includeFriendCode: true }, runtime);
  assert.ok(code.plan.text.some(t => t.text === look.friendCode));
  assert.notEqual(digest(await bytes(code.blob)), digest(first), 'code changes actual PNG');
  const base = await composeStudio({ ...look, pet: { ...look.pet, shiny: false } }, {}, runtime);
  assert.notEqual(digest(await bytes(base.blob)), digest(first), 'CONTROL base-colour pet differs from shiny pixels');
  const noPet = await composeStudio(look, { includePet: false }, runtime);
  assert.notEqual(digest(await bytes(noPet.blob)), digest(first));
  assert.ok(!noPet.plan.layers.some(l => l.group === 'pet'));
  for (const caption of Object.keys(STUDIO_CAPTIONS)) {
    const card = await composeStudio(look, { caption }, runtime);
    assertStudioSafe(card.information);
    if (caption !== 'notes') assert.notEqual(digest(await bytes(card.blob)), digest(first));
  }
  const bg = BH_ITEMS.find(i => i.slot === 'BG');
  const backed = await composeStudio(look, { backdrop: bg.id }, runtime);
  assert.notEqual(digest(await bytes(backed.blob)), digest(first));
  assert.equal(backed.plan.layers[0].src, bhAsset(bg));
  // Safe-zone positive control: the historical plate put text flush to y=1920.
  assertStudioSafe(code.information);
  const flush = code.information.map(e => ({ ...e, y: 1920 - e.height }));
  assert.throws(() => assertStudioSafe(flush), /Unsafe Studio information/, 'CONTROL flush-to-bottom must be red');
  assert.throws(() => assertStudioSafe([]), /No informational/);
  for (const box of [{x:64,y:300,width:100,height:20}, {x:100,y:269,width:100,height:20}, {x:1000,y:300,width:16,height:20}]) {
    assert.throws(() => assertStudioSafe([{ id: 'control', ...box }]), /Unsafe/);
  }
  for (const health of ['calories', 'weight', 'macros', 'steps', 'level', 'streak', 'quote']) {
    assert.throws(() => studioPlan({ ...look, [health]: '10000 steps' }), /Unsupported/);
    assert.throws(() => studioPlan(look, { [health]: '10000 steps' }), /Unsupported/);
    assert.throws(() => studioPlan({ ...look, outfit: { ...outfit, [health]: 10000 } }), /Unsupported/);
    assert.throws(() => studioPlan({ ...look, pet: { ...look.pet, [health]: 10000 } }), /Unsupported/);
  }
  assert.throws(() => studioPlan(look, { caption: '10000 steps' }), /Free text/);
  assert.throws(() => studioPlan(look, { frame: 'foil' }), /art review/);
  assert.throws(() => studioPlan(look, { includeFriendCode: 'true' }), /Invalid/);
  assert.throws(() => studioPlan({ ...look, friendCode: '10000 steps' }, { includeFriendCode: true }), /unavailable/);
  const { shiny, ...noShiny } = look.pet;
  assert.throws(() => studioPlan({ ...look, pet: noShiny }), /explicit instance shiny/);
  assert.throws(() => studioPlan({ ...look, outfit: { ...outfit, H: 'unknown' } }), /Unknown H/);
  await assert.rejects(composeStudio(look, {}, { ...runtime, loadImage: async () => { throw Error('offline miss'); } }), /Download required art/);
  await assert.rejects(composeStudio(look, {}, { ...runtime, ready: async () => { throw Error('font missing'); } }), /font missing/);
  // Bumbleseal and all her registered clothing layers keep PET_SLOTS order.
  const wear = Object.fromEntries(PET_SLOTS.map(s => [s.code, BH_ITEMS.find(i => i.slot === s.code && !i.pets)?.id]).filter(([, id]) => id));
  const dressed = await composeStudio({ ...look, pet: { id: 'C6', shiny: false, morph: 'base', wear } }, {}, runtime);
  const petSlots = dressed.plan.layers.filter(l => l.group === 'pet').map(l => l.slot);
  assert.deepEqual(petSlots, ['C', ...[...PET_SLOTS].sort((a,b) => a.z-b.z).filter(s => wear[s.code]).map(s => s.code)]);
  assert.ok(petSlots.length > 2);
  // v2 deliberately replaces the 1250 ground with feet-aligned larger figures.
  assertStudioSafe(dressed.bounds);
  assert.ok(Math.abs(dressed.bounds.find(b => b.id === 'pet').y + dressed.bounds.find(b => b.id === 'pet').height - dressed.feetY) < .001);

  // Pixel order proof with overlapping opaque layers. Sources are replaced only
  // here; the production stacking, trimming, layout and PNG encoder all run.
  const colours = new Map(plain.plan.layers.map((l, i) => [l.src, `rgb(${20+i*9},${40+i*5},${70+i*3})`]));
  const synthetic = { ...runtime, loadImage: async src => {
    if (!colours.has(src)) return runtime.loadImage(src);
    const c = createCanvas(640, 640), x = c.getContext('2d'); x.fillStyle = colours.get(src); x.fillRect(0, 0, 640, 640); return c;
  } };
  const opaque = await composeStudio(look, {}, synthetic);
  const surface = createCanvas(1080, 1920), cx = surface.getContext('2d');
  cx.drawImage(await loadImage(await bytes(opaque.blob)), 0, 0);
  const hat = plain.plan.layers.find(l => l.slot === 'H');
  const expected = createCanvas(1,1).getContext('2d'); expected.fillStyle = colours.get(hat.src); expected.fillRect(0,0,1,1);
  assert.deepEqual(cx.getImageData(750, 1100, 1, 1).data, expected.getImageData(0,0,1,1).data, 'highest body slot covers lower slots and pet');

  // Capture the compositor's actual draw calls at their actual transforms onto
  // transparent PNGs. Encode, decode, then measure ink, not planned rectangles.
  const measureComposition = async (compose, input, opts) => {
    const draws = [];
    const measuredRuntime = { ...runtime, createCanvas(w, h) {
      const c = createCanvas(w, h);
      if (w === 1080 && h === 1920) {
        const cx = c.getContext('2d'), original = cx.drawImage.bind(cx);
        cx.drawImage = (...args) => {
          const isolated = createCanvas(w, h), ic = isolated.getContext('2d');
          ic.imageSmoothingEnabled = cx.imageSmoothingEnabled;
          ic.setTransform(cx.getTransform()); ic.drawImage(...args);
          draws.push({ canvas: isolated, input: args[0], smoothing: cx.imageSmoothingEnabled });
          original(...args);
        };
      }
      return c;
    } };
    const result = await compose(input, opts, measuredRuntime);
    const measured = [];
    for (const draw of draws) {
      const png = await runtime.encode(draw.canvas), decoded = await loadImage(await bytes(png));
      const c = createCanvas(1080, 1920); c.getContext('2d').drawImage(decoded, 0, 0);
      measured.push({ ...draw, decoded: c, ink: studioInk(c) });
    }
    return { result, measured };
  };
  const measured = await measureComposition(composeStudio, look, {});
  const [petPixels, bodyPixels] = measured.measured;
  assert.ok(bodyPixels.ink.height > 1000);
  assert.ok(bodyPixels.ink.width * bodyPixels.ink.height / (950 * 1270) > .7);
  assert.ok(Math.abs(petPixels.ink.y + petPixels.ink.height - measured.result.feetY) <= 1);
  assertStudioSafe(measured.measured.map((m, i) => ({ id: `decoded-${i}`, ...m.ink })));
  console.log('MEASURE decoded PNG:', JSON.stringify({ body: bodyPixels.ink,
    safeAreaPercent: 100 * bodyPixels.ink.width * bodyPixels.ink.height / (950 * 1270),
    pet: petPixels.ink, petGround: petPixels.ink.y + petPixels.ink.height,
    figureFeet: measured.result.feetY }));
  for (const bubblePosition of STUDIO_POSITIONS) for (const markPosition of STUDIO_MARK_POSITIONS) {
    const r = await composeStudio(look, { bubblePosition, markPosition, caption: 'personality', includeFriendCode: true }, runtime);
    assertStudioSafe([...r.bounds, ...r.information]);
    assert.ok(r.information.find(b => b.id === 'caption').y < 600, 'bubble leaves the lower third');
    assert.notEqual(digest(await bytes(r.blob)), digest(first));
  }
  const fixtureFriend = { name: 'Cam', playerId: 'private-id', profile: { outfit, weight: 80, steps: 10000, food: ['private'], level: 99 } };
  const crew = studioCrewAppearance([fixtureFriend]);
  assert.deepEqual(crew, [{ label: 'Cam', outfit: Object.fromEntries(Object.entries(outfit).filter(([k]) => !['BG', 'C'].includes(k))) }]);
  const sticker = { kind: 'crew', outfit: crew[0].outfit, x: 540, y: 900, size: 180, flip: false };
  for (const key of ['weight', 'steps', 'food', 'profile', 'health', 'name', 'playerId']) {
    assert.throws(() => studioPlan(look, { stickers: [{ ...sticker, [key]: 100 }] }), /Unsupported/);
    assert.throws(() => studioPlan(look, { stickers: [{ ...sticker, outfit: { ...outfit, [key]: 100 } }] }), /Unsupported/);
  }
  for (const transform of [{ size: 179 }, { size: 651 }, { size: NaN }, { x: Infinity }, { flip: 1 }, { rotation: 15 }, { scaleX: 2 }, { tint: '#FF0000' }]) {
    assert.throws(() => studioPlan(look, { stickers: [{ ...sticker, ...transform }] }), /Invalid|Unsupported/);
  }
  assert.throws(() => studioPlan(look, { stickers: Array(13).fill(sticker) }), /12 stickers/);
  assert.throws(() => studioPlan(look, { stickers: [{ ...sticker, kind: 'monster', id: 'invented' }] }), /Unknown/);
  const colourSet = canvas => {
    const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, colours = new Set();
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i+3] > 14) colours.add(Array.from(rgba.slice(i, i+4)).join(','));
    return colours;
  };
  for (const entry of [sticker, ...STUDIO_MONSTERS.map(id => ({ kind: 'monster', id, x: 540, y: 900, size: 180, flip: false }))]) {
    const r = await measureComposition(composeStudio, look, { stickers: [entry] });
    const last = r.measured.at(-1), inputColours = colourSet(last.input), outputColours = colourSet(last.decoded);
    assert.equal(last.smoothing, false, 'nearest-neighbour art sampling');
    assert.ok(outputColours.size <= inputColours.size, 'downsample introduces no colour-count inflation');
    assert.ok([...outputColours].every(c => inputColours.has(c)), 'nearest-neighbour output palette is a subset of the stacked input');
    console.log(`COLOURS smallest 180px ${entry.id || 'Crew'}: ${inputColours.size} in, ${outputColours.size} out`);
  }
  const aSticker = { kind: 'monster', id: STUDIO_MONSTERS[0], x: 500, y: 850, size: 400, flip: false };
  const bSticker = { kind: 'text', id: 'feed', x: 500, y: 850, size: 400, flip: false };
  const forward = await composeStudio(look, { stickers: [aSticker, bSticker] }, runtime);
  const backward = await composeStudio(look, { stickers: [bSticker, aSticker] }, runtime);
  assert.notEqual(digest(await bytes(forward.blob)), digest(await bytes(backward.blob)), 'array order changes overlapping encoded pixels');
  const unflipped = await measureComposition(composeStudio, look, { stickers: [aSticker] });
  const flipped = await measureComposition(composeStudio, look, { stickers: [{ ...aSticker, flip: true }] });
  const unflipLayer = unflipped.measured.at(-1).decoded, flipLayer = flipped.measured.at(-1).decoded;
  assert.notEqual(digest(await bytes(unflipped.result.blob)), digest(await bytes(flipped.result.blob)), 'flip changes actual PNG');
  const mirror = createCanvas(1080, 1920), mx = mirror.getContext('2d');
  mx.translate(1000, 0); mx.scale(-1, 1); mx.drawImage(unflipLayer, 0, 0);
  assert.deepEqual(mx.getImageData(0, 0, 1080, 1920).data, flipLayer.getContext('2d').getImageData(0, 0, 1080, 1920).data, 'horizontal flip mirrors the real pixels exactly');
  for (const size of [180, 650]) for (const [x,y] of [[0,0],[1080,1920]]) {
    const r = await composeStudio(look, { stickers: [{ ...aSticker, x, y, size }] }, runtime);
    assertStudioSafe(r.bounds);
  }
  for (const id of Object.keys(STUDIO_TEXT_STICKERS)) {
    const r = await composeStudio(look, { stickers: [{ ...bSticker, id, size: 650, flip: true }] }, runtime);
    assertStudioSafe(r.bounds); assert.notEqual(digest(await bytes(r.blob)), digest(first));
  }

  let delivered;
  const native = { btoa: s => Buffer.from(s, 'binary').toString('base64'), Capacitor: { isNativePlatform: () => true,
    Plugins: { StudioSave: { saveImage: async p => { delivered = Buffer.from(p.base64, 'base64'); return { saved: true }; } } } } };
  assert.equal((await saveStudioImage(code.blob, native)).status, 'saved');
  assert.deepEqual(delivered, await bytes(code.blob), 'native receives exact preview bytes');
  const savedImage = await loadImage(delivered);
  assert.deepEqual([savedImage.width, savedImage.height], [1080, 1920]);
  native.Capacitor.Plugins.StudioSave.saveImage = async () => ({ cancelled: true });
  assert.equal((await saveStudioImage(code.blob, native)).status, 'cancelled');
  native.Capacitor.Plugins.StudioSave.saveImage = async () => { throw Error('permission denied'); };
  await assert.rejects(saveStudioImage(code.blob, native), /permission denied/);
  native.Capacitor.Plugins = {};
  assert.equal(studioSaveMode(native), 'unavailable');
  await assert.rejects(saveStudioImage(code.blob, native), /cannot save/);
  native.Capacitor.Plugins = { StudioSave: { saveImage: async () => { throw Object.assign(Error('not implemented'), { code: 'UNIMPLEMENTED' }); } } };
  await assert.rejects(saveStudioImage(code.blob, native), /newer app build/);
  native.Capacitor.isPluginAvailable = () => false;
  assert.equal(studioSaveMode(native), 'unavailable', 'a JS proxy alone cannot certify native support');
  await assert.rejects(saveStudioImage(code.blob, native), /cannot save/);
  await assert.rejects(assertStudioPng(new Blob(['fake'], {type:'image/png'})), /PNG/);
  const tiny = createCanvas(12,12);
  await assert.rejects(saveStudioImage(await runtime.encode(tiny), native), /1080x1920/);
  let clicked = false, revoked = false, timer;
  const anchor = { click() { clicked = true; }, remove() {} };
  const web = { URL: { createObjectURL(b) { assert.equal(b, code.blob); return 'blob:studio'; }, revokeObjectURL() { revoked = true; } },
    document: { createElement: () => anchor, body: { appendChild() {} } }, setTimeout(fn, delay) { assert.equal(delay, 60000); timer = fn; } };
  assert.equal((await saveStudioImage(code.blob, web)).status, 'download-requested');
  assert.ok(clicked); assert.equal(anchor.download, 'boneheadz-studio.png'); assert.equal(revoked, false); timer(); assert.ok(revoked);

  // Control handlers run through mountStudio, with real composition and encoding.
  // This proves handler behavior, not DOM layout, touch reach or WebView parity.
  const elements = new Map(); let markup;
  const el = { set innerHTML(html) {
    markup = html;
    for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements.set(id, { disabled: false, hidden: new RegExp(`id="${id}"[^>]*\\bhidden`).test(html), style: {}, attributes: {}, decode: async () => {},
      setAttribute(k, v) { this.attributes[k] = v; }, setPointerCapture() {}, focus() {},
      showModal() { this.open = true; }, close() { this.open = false; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 1080, height: 1920 }; } });
  }, querySelector: selector => elements.get(selector.slice(1)) };
  const q = id => elements.get(id), draft = { includeFriendCode: true };
  const jobs = []; let shown, savedBlob, back = false;
  const mount = () => mountStudio(el, { look, crew, ownedBackdrops: new Set([bg.id]), draft, onBack: () => { back = true; },
    compose(l, o) { const job = composeStudio(l, o, runtime).then(r => { shown = r; return r; }); jobs.push(job); return job; },
    async save(blob) { savedBlob = blob; return { status: 'saved' }; } });
  const settle = async () => { for (let i = 0; i < 20; i++) { await Promise.all(jobs); await new Promise(r => setImmediate(r)); if (!q('studioSave').disabled) return; } throw Error('Studio did not finish rendering'); };
  // Use full valid defaults, as the app does.
  Object.assign(draft, { backdrop: null, includePet: true, caption: 'notes', frame: null });
  const dispose = mount(); await settle(); assert.equal(draft.includeFriendCode, false);
  // v2 picture leads; controls deliberately move into the collapsed tray.
  assert.ok(markup.indexOf('id="studioPreview"') < markup.indexOf('id="studioTray"'));
  assert.ok(q('studioTrayBody').hidden);
  assert.doesNotMatch(markup, /<select|type="checkbox"|studioFrame/);
  assert.doesNotMatch(markup, /<textarea|type="text"|My caption/);
  assert.match(markup, /<h1[^>]*>The Studio<\/h1>\s*<button class="studio-link" id="studioBack">/);
  q('studioCode').onclick();
  assert.ok(q('studioSave').disabled); assert.ok(q('studioPreview').hidden); await settle();
  assert.ok(shown.plan.text.some(t => t.id === 'friend-code'));
  q('studioBackdrop').onclick(); await settle(); assert.equal(shown.plan.layers[0].slot, 'BG');
  q('studioPet').onclick(); await settle(); assert.ok(!shown.plan.layers.some(l => l.group === 'pet'));
  q('studioCaption').onclick(); await settle(); q('studioCaption').onclick(); await settle(); assert.ok(shown.plan.text.some(t => t.text === STUDIO_CAPTIONS.home));
  await q('studioSave').onclick(); assert.equal(savedBlob, shown.blob);
  q('studioTrayToggle').onclick(); assert.equal(q('studioTrayBody').hidden, false);
  q('studioTrayToggle').onpointerdown({ clientY: 100, pointerId: 1 });
  q('studioTrayToggle').onpointerup({ clientY: 160, pointerId: 1 });
  q('studioTrayToggle').onclick(); assert.equal(q('studioTrayBody').hidden, true, 'swipe down collapses without click reopening');
  q('studioText-feed').onclick(); await settle(); assert.equal(draft.stickers.length, 1);
  q('studioFlip').onclick(); await settle(); assert.equal(draft.stickers[0].flip, true);
  q('studioSmaller').onclick(); await settle(); assert.equal(draft.stickers[0].size, 360);
  q('studioLarger').onclick(); await settle(); assert.equal(draft.stickers[0].size, 400);
  q('studioLeft').onclick(); await settle(); assert.equal(draft.stickers[0].x, 510);
  const box = shown.bounds.find(b => b.id === 'sticker-0');
  q('studioStage').onpointerdown({ clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerId: 2 });
  q('studioStage').onpointermove({ clientX: 700, clientY: 1000 }); q('studioStage').onpointerup(); await settle();
  assert.equal(draft.stickers[0].x, 700); assert.equal(draft.stickers[0].y, 1000);
  q('studioRemove').onclick(); await settle(); assert.equal(draft.stickers.length, 0);
  q('studioCrew-0').onclick(); await settle();
  assert.deepEqual(Object.keys(draft.stickers[0]).sort(), ['flip', 'kind', 'outfit', 'size', 'x', 'y']);
  assert.deepEqual(draft.stickers[0].outfit, crew[0].outfit);
  q('studioRemove').onclick(); await settle();
  q('studioMonster-0').onclick(); await settle(); assert.equal(draft.stickers[0].id, STUDIO_MONSTERS[0]);
  q('studioRemove').onclick(); await settle();
  q('studioBack').onclick(); assert.ok(back);
  dispose(); const disposeAgain = mount(); await settle(); assert.equal(draft.includeFriendCode, false); disposeAgain();

  // Current TestFlight shell: a ready preview is usable, but Save must explain
  // missing native support without clicking a browser download or claiming success.
  const oldShell = { Capacitor: { isNativePlatform: () => true, Plugins: {} } };
  const endOldShell = mountStudio(el, { look, ownedBackdrops: new Set(), env: oldShell, onBack() {}, compose: async () => plain });
  await new Promise(r => setImmediate(r));
  assert.match(markup, /Use a screenshot for now/);
  assert.doesNotMatch(markup, /saving asks for permission/);
  assert.match(q('studioStatus').textContent, /take a screenshot/);
  assert.ok(q('studioSave').hidden);
  q('studioClean').onclick(); assert.ok(q('studioCleanView').open);
  assert.equal(q('studioCleanImage').src, q('studioPreview').src);
  q('studioCleanView').onclick(); assert.equal(q('studioCleanView').open, false);
  assert.equal(q('studioSave').disabled, false);
  await q('studioSave').onclick();
  assert.match(q('studioStatus').textContent, /cannot save.*newer app build.*draft/);
  assert.doesNotMatch(q('studioStatus').textContent, /Image saved|Download requested/);
  assert.equal(q('studioPreview').hidden, false); assert.equal(q('studioSave').disabled, false);
  endOldShell();

  // In-flight option changes, failure/retry, cancellation, and teardown. Deferred
  // promises make stale saves deterministic to reproduce without timing sleeps.
  let resolveRender, rejectRender, composeCalls = 0, saveCalls = 0;
  const deferredCompose = () => { composeCalls++; return new Promise((resolve, reject) => { resolveRender = resolve; rejectRender = reject; }); };
  let outcome = 'cancelled';
  const end = mountStudio(el, { look, ownedBackdrops: new Set([bg.id]), onBack() {}, compose: deferredCompose,
    save: async () => { saveCalls++; if (outcome === 'denied') throw Error('denied'); return {status: outcome}; } });
  const tick = () => new Promise(r => setImmediate(r));
  q('studioCode').onclick();
  await q('studioSave').onclick(); assert.equal(saveCalls, 0);
  resolveRender(plain); await tick();
  assert.equal(composeCalls, 2); assert.ok(q('studioSave').disabled, 'obsolete preview cannot save');
  rejectRender(Error('missing asset')); await tick();
  assert.match(q('studioStatus').textContent, /missing asset.*draft/); assert.ok(q('studioSave').disabled);
  q('studioRetry').onclick(); resolveRender(code); await tick();
  await q('studioSave').onclick(); assert.match(q('studioStatus').textContent, /cancelled/);
  outcome = 'denied'; await q('studioSave').onclick(); assert.match(q('studioStatus').textContent, /denied.*draft/);
  q('studioCode').onclick(); end(); resolveRender(plain); await tick();
  assert.equal(saveCalls, 2); assert.ok(q('studioPreview').hidden, 'disposed completion cannot reveal');

  const app = source('js/app.js');
  const boundary = app.slice(app.indexOf('const studioDraft ='), app.indexOf("function openCharacter(tab = 'wardrobe')"));
  let boundaryLook;
  const context = vm.createContext({
    STUDIO_DEFAULTS: {}, studioCrew: [], studioCrewOwner: null, equipped: async () => ({ B: 'B0-1', SK: 'SK0-1', C: 'C1' }),
    equippedPetInstance: async () => ({ sp: 'C1', shiny: true, morph: 'base', level: 99, steps: 10000 }),
    petWear: async () => wear, petWornItems,
    social: { socialMe: async () => ({ friendCode: look.friendCode, weight: 80, name: 'Not exported' }) },
    ownedCosmeticIds: async () => new Set([bg.id]), currentTab: () => 'studio',
    mountStudio: (_, config) => { boundaryLook = config.look; return () => {}; },
    screenCleanup: null,
  });
  vm.runInContext(boundary + '; globalThis.runStudio = renderStudio;', context);
  await context.runStudio({});
  assert.deepEqual(Object.keys(boundaryLook).sort(), ['friendCode', 'outfit', 'pet']);
  assert.deepEqual(Object.keys(boundaryLook.pet).sort(), ['id', 'morph', 'shiny', 'wear']);
  assert.equal(boundaryLook.pet.shiny, true);
  assert.equal(Object.keys(boundaryLook.pet.wear).length, 0, 'another species clothing is excluded at the app boundary');
  studioPlan(boundaryLook);
  assert.match(app, /tab === 'studio'\) done = renderStudio\(el\)/);
  assert.match(app, /#wardrobeStudio[^\n]+location.hash = '#\/studio'/);
  /* THE ENTRY MOVED, 2026-09-10. Tom: the Wardrobe header is "a mess of
     misaligned buttons with different fonts sizes placements etc obviously
     including your entry into the studio, for now move the studio button
     somewhere". v551 hung it on its own right-aligned line as a bare underlined
     link, which was one more alignment to get wrong. It is now a .fit-chip in
     the fit rail beside "+ Save this fit" and "Take it all off".
     The contract this grades changed with it, and is STRICTER, not looser: the
     old rows asserted a bare text link in isolation; these assert it shares the
     rail's own class, so it cannot drift into its own font, height or spacing
     without going red. Visual prominence and hit testing are still the
     operator's browser proof, never a claim from this DOM double. */
  const entryLine = app.split('\n').find(line => line.includes('id="wardrobeStudio"'));
  const entry = vm.runInNewContext('`' + entryLine.trim() + '`', {
    pixCur: () => '<img class="ico-pix" src="assets/icons-pix/camera.png" width="24" height="24" alt="">',
    ICONS: { camera: () => '<svg class="ico"></svg>' },
  });
  const railEntry = html => {
    // It IS a fit chip: same class as the two controls beside it, so it inherits
    // their height, radius, font and gap rather than carrying its own.
    assert.match(html, /^<button class="fit-chip studio" id="wardrobeStudio" type="button">/, 'the entry must be a .fit-chip in the rail');
    assert.match(html, /<\/button>$/);
    assert.ok(html.includes('The Studio'), 'the entry must still say what it opens');
    assert.doesNotMatch(html, /hidden|disabled|badge|primary|<details/, 'the entry stays a plain chip');
  };
  railEntry(entry);
  assert.throws(() => railEntry(entry.replace('fit-chip studio', 'btn primary')), /AssertionError/, 'CONTROL a promoted primary button must fail');
  assert.throws(() => railEntry(entry.replace('fit-chip studio', 'studio-link')), /AssertionError/, 'CONTROL leaving the rail vocabulary must fail');
  assert.throws(() => railEntry(''), /AssertionError/, 'CONTROL missing entry must fail');
  assert.equal((app.match(/id="wardrobeStudio"/g) || []).length, 1);
  /* IT LIVES IN THE RAIL, not back in the header. Anchored on the two controls
     it must line up with, so moving it out of that row goes red. */
  const rail = app.slice(app.indexOf('data-fit-save="1"'), app.indexOf('data-fit-reset="1"'));
  assert.ok(rail.includes('id="wardrobeStudio"'), 'the entry must sit between the save and strip chips in the fit rail');
  assert.doesNotMatch(app, /wardrobe-studio-entry/, 'the old header line must be gone, not left orphaned');
  assert.doesNotMatch(source('index.html'), /#\/studio|wardrobeStudio/);
  const handler = app.split('\n').find(line => line.includes("$('#wardrobeStudio', content)?.addEventListener"));
  const navigation = { hash: '#/bonehead' }; let enter;
  vm.runInNewContext(handler, { content: {}, location: navigation, $: selector => {
    assert.equal(selector, '#wardrobeStudio'); return { addEventListener(event, fn) { assert.equal(event, 'click'); enter = fn; } };
  } });
  enter(); assert.equal(navigation.hash, '#/studio', 'actual entry handler reaches the registered Studio route');
  const crewProjection = app.split('\n').find(l => l.includes('studioCrew = studioCrewAppearance(data.friends'));
  const crewContext = vm.createContext({ me: { friendCode: look.friendCode }, studioCrewOwner: null, data: { reached: true, friends: [fixtureFriend] }, studioCrewAppearance, studioCrew: [] });
  vm.runInContext(crewProjection, crewContext);
  assert.deepEqual(crewContext.studioCrew, crew);
  assert.doesNotMatch(boundary, /listFriends|fetch\(/, 'Studio adds no Crew request');
  assert.match(boundary, /crew: me\?\.friendCode === studioCrewOwner \? studioCrew : \[\]/);
  const css = source('app.css');
  /* .studio-link is now only the Studio's OWN back control, so its quiet rule is
     still graded; the entry's styling is graded by the class it shares above. */
  const quietStyle = text => {
    const rule = text.match(/\.studio-link \{([^}]+)\}/)?.[1] || '';
    for (const declaration of ['width: auto;', 'min-height: 44px;', 'font: inherit;', 'font-size: var(--fs-2);', 'color: var(--text-2);', 'background: transparent;', 'border: 0;', 'box-shadow: none;', 'text-transform: none;']) assert.ok(rule.includes(declaration), declaration);
  };
  quietStyle(css);
  assert.throws(() => quietStyle(css.replace('background: transparent; border: 0; box-shadow: none; text-transform: none;', 'background: var(--accent);')), /AssertionError/, 'CONTROL accent-filled back control must fail');
  // The chip may size the icon and NOTHING else: everything that aligns it comes
  // from .fit-chip. A chip that started carrying its own padding or font would be
  // the drift this whole move exists to stop.
  const chipRule = css.match(/\.fit-chip\.studio img, \.fit-chip\.studio svg \{([^}]+)\}/)?.[1] || '';
  assert.ok(chipRule.includes('width: 22px') && chipRule.includes('height: 22px'), 'the chip sizes its icon');
  assert.doesNotMatch(css, /\.fit-chip\.studio \{/, 'the chip must not redeclare what .fit-chip already gives it');
  // Both of Tom's own 48px icons are on disk and registered, so pixCur can serve them.
  const pix = source('js/icons-pix.js');
  for (const key of ['lab', 'camera']) {
    assert.match(pix, new RegExp(`${key}: '${key}'`), `${key} must be registered in PIX_CUR`);
    assert.ok(existsSync(new URL(`../assets/icons-pix/${key}.png`, import.meta.url)), `assets/icons-pix/${key}.png must exist`);
  }
  assert.match(app, /pixCur\('lab', 48\)[\s\S]{0,200}<b>Laboratory<\/b>/, 'the Laboratory room draws the fusion chamber, not the shared potion vial');
  const bridge = source('native/ios/App/App/StudioSave.swift');
  assert.match(bridge, /requestAuthorization\(for: \.addOnly\)/);
  assert.match(bridge, /addResource\(with: \.photo, data: data/);
  assert.match(source('native/ios/App/App/Info.plist'), /NSPhotoLibraryAddUsageDescription/);
  assert.match(source('native/ios/App/App/BoneheadzViewController.swift'), /registerPluginInstance\(StudioSave\(\)\)/);
  assert.match(source('native/ios/App/App.xcodeproj/project.pbxproj'), /StudioSave.swift in Sources/);
  assert.match(source('native/android/app/src/main/java/com/boneheadz/gym/StudioSave.kt'), /ACTION_CREATE_DOCUMENT/);
  assert.match(source('native/android/app/src/main/java/com/boneheadz/gym/MainActivity.java'), /registerPlugin\(StudioSave.class\)/);
  for (const file of ['studio.js', 'studio-save.js', 'studio-screen.js']) {
    assert.ok(source('sw.js').includes(`'./js/${file}'`));
    assert.doesNotMatch(source('js/' + file), /navigator\.share|speechLine\(|S\.shinyPets/);
  }
  return `PASS Studio: real 1080x1920 PNG, deterministic bytes (${digest(first)}), registered z-order pixels, shiny pixels, controls and save-byte handoff.\nPASS entry: Wardrobe-only, reachable handler, quiet style contract; picture first; collapsed tray; fixed caption buttons; old-shell screenshot mode and hidden native Save; unavailable save guard retains preview.\nPASS CONTROL: loud/missing/accent-filled entry, flush-to-bottom information, reversed z-order, base pet, free text, health payloads, missing assets, invalid PNG and denied saves rejected.\nUNPROVEN: visual review, real browser controls and native Photos/file-picker execution.\n`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(await checkStudio());

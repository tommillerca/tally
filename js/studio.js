// Screen-independent Studio compositor. Only appearance and fixed export copy
// cross this boundary. No state, health queries, clock, randomness or animation.
import { BH_SLOTS, BH_BY_ID, PET_SLOTS, bhAsset, petWornItems } from '../data/boneheadz.js';
import { morphAsset, isMorph } from './pets.js';
import { footballTints, visorHidesEyes, visorClipMask } from '../data/football-teams.js';

export const STUDIO_SIZE = Object.freeze({ width: 1080, height: 1920 });
export const STUDIO_SAFE = Object.freeze({ left: 65, top: 270, right: 1015, bottom: 1540 });
// Slot reserved for reviewed frame art. No frame can be selected or exported yet.
export const STUDIO_FRAMES = Object.freeze([]);
export const STUDIO_CAPTIONS = Object.freeze({
  none: '', notes: 'I have no notes.', personality: 'This is my whole personality now.',
  home: 'I live here now.',
});
export const STUDIO_DEFAULTS = Object.freeze({ backdrop: null, includePet: true,
  caption: 'notes', includeFriendCode: false, frame: null });
const fail = message => { throw new Error(message); };
function keys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`Invalid ${label}.`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`Unsupported ${label} field: ${key}.`);
}
function itemFor(id, slot) {
  const item = BH_BY_ID[id];
  if (!item || item.slot !== slot) fail(`Unknown ${slot} art: ${id}.`);
  return item;
}

export function studioPlan(look, options = {}) {
  keys(look, ['outfit', 'pet', 'friendCode'], 'look');
  keys(look.outfit, BH_SLOTS.map(s => s.code), 'outfit');
  keys(options, Object.keys(STUDIO_DEFAULTS), 'option');
  const opts = { ...STUDIO_DEFAULTS, ...options };
  for (const flag of ['includePet', 'includeFriendCode']) if (typeof opts[flag] !== 'boolean') fail(`Invalid ${flag}.`);
  if (!Object.hasOwn(STUDIO_CAPTIONS, opts.caption)) fail('Choose a Studio caption. Free text is unavailable.');
  if (opts.frame !== null) fail('Frames await art review.');
  const layers = [];
  if (opts.backdrop !== null) layers.push({ slot: 'BG', group: 'backdrop', z: 0, src: bhAsset(itemFor(opts.backdrop, 'BG')) });
  for (const slot of [...BH_SLOTS].sort((a, b) => a.z - b.z)) {
    if (slot.code === 'BG' || slot.code === 'C') continue;
    const id = look.outfit[slot.code] ?? slot.default;
    if (!id) continue;
    const item = itemFor(id, slot.code);
    if (slot.code === 'E' && visorHidesEyes(look.outfit)) continue;
    layers.push({ slot: slot.code, group: 'body', z: slot.z, src: bhAsset(item),
      tints: footballTints(item), mask: slot.code === 'E' ? visorClipMask(look.outfit) : null });
  }
  if (opts.includePet && look.outfit.C && look.pet?.id !== look.outfit.C) fail('The equipped pet needs its matching instance appearance.');
  if (opts.includePet && look.pet) {
    const pet = look.pet;
    keys(pet, ['id', 'shiny', 'morph', 'wear'], 'pet');
    const item = itemFor(pet.id, 'C');
    if (typeof pet.shiny !== 'boolean') fail('Pet appearance requires explicit instance shiny.');
    if (pet.morph != null && !isMorph(pet.morph)) fail('Unknown pet colour.');
    if (pet.wear) {
      keys(pet.wear, PET_SLOTS.map(s => s.code), 'pet clothing');
      for (const [slot, id] of Object.entries(pet.wear)) if (id) itemFor(id, slot);
    }
    const worn = petWornItems(pet.id, pet.wear);
    if (Object.values(pet.wear || {}).filter(Boolean).length !== worn.length) fail('Clothing does not fit this pet.');
    const src = pet.shiny && pet.id !== 'CX' ? `assets/bh/C/shiny/${pet.id}.png`
      : morphAsset(pet.id, pet.morph) || bhAsset(item);
    layers.push({ slot: 'C', group: 'pet', z: 5, src });
    for (const w of worn) layers.push({ slot: w.slot, group: 'pet', z: PET_SLOTS.find(s => s.code === w.slot).z,
      src: bhAsset(w), tints: footballTints(w) });
  }
  const text = [{ id: 'brand', text: 'BONEHEADZ', x: 90, baseline: 1390, size: 70 }];
  if (opts.caption !== 'none') text.push({ id: 'caption', text: STUDIO_CAPTIONS[opts.caption], x: 90, baseline: 1450, size: 38 });
  if (opts.includeFriendCode) {
    if (!/^BONE-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(look.friendCode || '')) fail('Your friend code is unavailable.');
    text.push({ id: 'friend-code', text: look.friendCode, x: 90, baseline: 1510, size: 38 });
  }
  // Pets have their own registered stack, behind the body, as BH_SLOTS.C.z says.
  return { layers, text, frame: null };
}

export function assertStudioSafe(elements) {
  if (!elements.length) fail('No informational elements measured.');
  for (const e of elements) {
    if (![e.x, e.y, e.width, e.height].every(Number.isFinite) || e.width <= 0 || e.height <= 0
      || e.x < STUDIO_SAFE.left || e.y < STUDIO_SAFE.top
      || e.x + e.width > STUDIO_SAFE.right || e.y + e.height > STUDIO_SAFE.bottom) {
      fail(`Unsafe Studio information: ${e.id}.`);
    }
  }
}

// Match drawTrimmedArt's ink threshold, after stacking at shared registration.
export function studioInk(canvas) {
  const { width, height } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] <= 14) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left) fail('Required Studio art is empty.');
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

let fontReady;
export function studioBrowserRuntime() {
  return {
    createCanvas(width, height) { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; },
    async loadImage(src) {
      const img = new Image(); img.src = src;
      let timer;
      try {
        await Promise.race([img.decode(), new Promise((_, reject) => {
          timer = setTimeout(() => { img.src = ''; reject(new Error(`Art timed out: ${src}`)); }, 15000);
        })]);
        if (!img.naturalWidth) fail(`Art unavailable: ${src}`);
        return img;
      } finally { clearTimeout(timer); }
    },
    async ready() {
      if (!fontReady) fontReady = (async () => {
        const font = new FontFace('StudioBangers', 'url(assets/fonts/bangers.woff2)');
        document.fonts.add(await font.load());
      })().catch(error => { fontReady = null; throw error; });
      await fontReady;
    },
    encode: canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image encoding failed.')), 'image/png')),
  };
}

export async function composeStudio(look, options = {}, runtime = studioBrowserRuntime()) {
  const plan = studioPlan(look, options);
  await runtime.ready();
  // Scoped cache is released after this render, and includes masks. No partial exports.
  const assets = new Map();
  const load = async src => {
    if (!assets.has(src)) assets.set(src, runtime.loadImage(src).catch(() => fail(`Download required art and retry: ${src}`)));
    return assets.get(src);
  };
  const required = [...new Set(plan.layers.flatMap(l => [l.src, l.mask, ...(l.tints || []).map(t => t.mask)]).filter(Boolean))];
  // Sequential decode bounds the cold-load memory spike from 2048px pet clothing.
  for (const src of required) await load(src);
  const canvas = runtime.createCanvas(1080, 1920), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#F3EFE7'; ctx.fillRect(0, 0, 1080, 1920);
  const bg = plan.layers.find(l => l.group === 'backdrop');
  if (bg) {
    const img = await load(bg.src), scale = Math.max(1080 / img.width, 1920 / img.height);
    ctx.drawImage(img, (1080 - img.width * scale) / 2, (1920 - img.height * scale) / 2, img.width * scale, img.height * scale);
  }
  const stack = async group => {
    const layers = plan.layers.filter(l => l.group === group);
    if (!layers.length) return null;
    const size = Math.max(...(await Promise.all(layers.map(l => load(l.src)))).map(i => Math.max(i.width, i.height)));
    const c = runtime.createCanvas(size, size), cctx = c.getContext('2d');
    for (const l of layers) {
      const layer = runtime.createCanvas(size, size), lc = layer.getContext('2d');
      lc.drawImage(await load(l.src), 0, 0, size, size);
      if (l.mask) { lc.globalCompositeOperation = 'destination-in'; lc.drawImage(await load(l.mask), 0, 0, size, size); lc.globalCompositeOperation = 'source-over'; }
      // Existing catalogue colour overlays only, identical to the wardrobe's
      // multiply masks. Never generate a colourway or filter Cam's base art.
      for (const t of l.tints || []) {
        const mask = runtime.createCanvas(size, size), mc = mask.getContext('2d');
        mc.drawImage(await load(t.mask), 0, 0, size, size);
        mc.globalCompositeOperation = 'source-in'; mc.fillStyle = t.hex; mc.fillRect(0, 0, size, size);
        lc.globalCompositeOperation = 'multiply'; lc.drawImage(mask, 0, 0); lc.globalCompositeOperation = 'source-over';
      }
      cctx.drawImage(layer, 0, 0);
    }
    return { canvas: c, ink: studioInk(c) };
  };
  const body = await stack('body'), pet = await stack('pet');
  if (!body) fail('No Bonehead art.');
  const ground = 1250, bounds = [];
  const seat = (figure, group, left, maxWidth, maxHeight) => {
    const b = figure.ink, scale = Math.min(maxWidth / b.width, maxHeight / b.height);
    const width = b.width * scale, height = b.height * scale;
    const x = left + (maxWidth - width) / 2, y = ground - height;
    ctx.drawImage(figure.canvas, b.x, b.y, b.width, b.height, x, y, width, height);
    bounds.push({ id: group, x, y, width, height });
  };
  if (pet) seat(pet, 'pet', 710, 280, 400);
  seat(body, 'body', pet ? 120 : 190, 700, 910);
  // Solid information band, separate from character ink. Frame slot remains empty.
  ctx.fillStyle = '#F3EFE7'; ctx.fillRect(65, 1300, 950, 240);
  ctx.fillStyle = '#2A2D28'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const information = [];
  for (const t of plan.text) {
    ctx.font = `${t.size}px StudioBangers`;
    const m = ctx.measureText(t.text);
    const box = { id: t.id, x: t.x - m.actualBoundingBoxLeft, y: t.baseline - m.actualBoundingBoxAscent,
      width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent };
    assertStudioSafe([box]);
    if (bounds.some(b => box.x < b.x + b.width && box.x + box.width > b.x && box.y < b.y + b.height && box.y + box.height > b.y)) fail('Studio text overlaps character ink.');
    information.push(box); ctx.fillText(t.text, t.x, t.baseline);
  }
  assertStudioSafe(information);
  const blob = await runtime.encode(canvas);
  await assertStudioPng(blob);
  return { blob, plan, information, bounds };
}

export async function assertStudioPng(blob) {
  if (!(blob instanceof Blob) || blob.type !== 'image/png' || blob.size < 45) fail('Studio requires a PNG image.');
  const h = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  const view = new DataView(h.buffer);
  if (![137,80,78,71,13,10,26,10].every((v, i) => h[i] === v)
    || String.fromCharCode(...h.slice(12, 16)) !== 'IHDR'
    || view.getUint32(16) !== 1080 || view.getUint32(20) !== 1920) fail('Studio requires a 1080x1920 PNG.');
}
